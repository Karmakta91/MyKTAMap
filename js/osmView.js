/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * Licence : CC BY-NC-SA 4.0
 */

// =========================
// OSM-VIEW.JS — Mode "Vue OSM" (v1.39.0)
// =========================
// Modale plein écran avec une seconde carte Leaflet en EPSG:3857 (Web Mercator)
// qui affiche le plan MyKTAMap (baseImage + image layers actifs) PROJETÉ sur
// OpenStreetMap via la calibration GPS (georef) du plan.
//
// PRÉREQUIS
//   1. Le plan doit avoir `PLAN_CONFIG.plan.georef = { pointA, pointB }`
//      (saisi via générateur ou Réglages Géoref). Sans georef → bouton masqué.
//   2. L'user doit avoir activé le toggle "🗺️ Autoriser OSM" dans
//      ⚙️ Configuration home (opt-in, default OFF). Sinon → modale d'invite.
//   3. Connexion Internet active (tiles OSM venant de tile.openstreetmap.org).
//
// PROJECTION
//   - Map principale = L.CRS.Simple (pixels plan) → on garde, pas touchée.
//   - Cette modale = NOUVELLE map Leaflet EPSG:3857 (standard mondial WGS84).
//   - Pour chaque image (baseImage + image layers calibrés), on calcule les
//     3 coins en pixels plan, puis on les projette en latlng GPS via
//     `KmzExport.planToGps(transform, x, y)` → on instancie un
//     `L.imageOverlay.rotated(url, tl, tr, bl)` qui les positionne précisément
//     sur OSM. Le 4e coin est déduit géométriquement par le plugin Rotated.
//
// IMAGE LAYERS
//   - Layer SANS calibration : ses bounds = plan principal → on utilise les
//     coins du plan (déjà calculés).
//   - Layer AVEC calibration : on récupère les 3 coins en pixels plan via
//     `ImageLayerCalibration.compute3CornersFromAnchorsPx(calib, srcW, srcH)`
//     puis on les projette indépendamment via planToGps.
//
// PRIVACY
//   - Aucun appel sortant tant que la modale n'est pas ouverte ET que le
//     toggle "Autoriser OSM" est activé.
//   - Si "Mode hors-ligne strict" activé → bouton désactivé visuellement +
//     toast d'erreur.
//   - Si "Mode incognito" activé → bouton désactivé + toast.
//
// API
//   window.OsmView = {
//     open()            → ouvre la modale (vérifs préalables)
//     close()           → ferme
//     isAvailable()     → bool : plan a un georef valide + toggle activé
//     isOptedIn()       → bool : toggle "Autoriser OSM" activé
//     setOptedIn(value) → toggle setter (utilisé par interface Configuration)
//   }
// =========================

(function() {
  "use strict";

  const LS_OPT_IN_KEY = "myktamap_osm_view_opt_in";
  const OSM_TILE_URL  = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
  const OSM_ATTR      = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
  const OSM_MAX_ZOOM  = 19;

  let _modalEl   = null;
  let _osmMap    = null;
  let _planLayer = null;       // L.layerGroup contenant base + image layers projetés
  let _opacity   = 1.0;        // 0..1

  // =========================
  // CONFIG / OPT-IN
  // =========================
  function isOptedIn() {
    try { return localStorage.getItem(LS_OPT_IN_KEY) === "1"; } catch(e) { return false; }
  }
  function setOptedIn(value) {
    try { localStorage.setItem(LS_OPT_IN_KEY, value ? "1" : "0"); } catch(e) {}
    try { window.dispatchEvent(new CustomEvent("kta:osmOptInChange", { detail: { optedIn: !!value } })); } catch(e) {}
  }

  // 🐛 v1.39.2 (KARMA "je vois pas l'icone") — Cascade lecture georef :
  //   1. PLAN_CONFIG.plan.georef (embarqué dans le ZIP via générateur)
  //   2. KmzExport.getCalibration(planId) (LS session via Réglages map mode)
  // Format identique : {pointA: {x, y, lat, lng}, pointB: {x, y, lat, lng}}.
  // Avant ce fix, on ne lisait QUE la source 1 → les users ayant saisi le
  // georef via Réglages map mode (= la grande majorité, plus simple que
  // de regénérer un ZIP) n'avaient pas le bouton OSM.
  function _getEffectiveGeoref() {
    // Source 1 : embarqué plan-config.json
    if (window.PLAN_CONFIG && window.PLAN_CONFIG.plan && window.PLAN_CONFIG.plan.georef) {
      const g = window.PLAN_CONFIG.plan.georef;
      if (g.pointA && g.pointB
          && Number.isFinite(g.pointA.lat) && Number.isFinite(g.pointA.lng)
          && Number.isFinite(g.pointB.lat) && Number.isFinite(g.pointB.lng)
          && Number.isFinite(g.pointA.x)   && Number.isFinite(g.pointA.y)
          && Number.isFinite(g.pointB.x)   && Number.isFinite(g.pointB.y)) {
        return g;
      }
    }
    // Source 2 : LS session via KmzExport.getCalibration
    if (window.KmzExport && typeof window.KmzExport.getCalibration === "function") {
      const planId = window._currentLoadedPlanId || "default";
      const g = window.KmzExport.getCalibration(planId);
      if (g && g.pointA && g.pointB
          && Number.isFinite(g.pointA.lat) && Number.isFinite(g.pointA.lng)
          && Number.isFinite(g.pointB.lat) && Number.isFinite(g.pointB.lng)
          && Number.isFinite(g.pointA.x)   && Number.isFinite(g.pointA.y)
          && Number.isFinite(g.pointB.x)   && Number.isFinite(g.pointB.y)) {
        return g;
      }
    }
    return null;
  }
  function _hasGeoref() {
    return !!_getEffectiveGeoref();
  }
  function _isStrictOfflineOn() {
    try {
      return !!(window.NetworkAudit && typeof window.NetworkAudit.isStrictOfflineEnabled === "function"
                && window.NetworkAudit.isStrictOfflineEnabled());
    } catch(e) { return false; }
  }
  function _isIncognitoOn() {
    try { return !!(window.IncognitoMode && window.IncognitoMode.isActive && window.IncognitoMode.isActive()); }
    catch(e) { return false; }
  }
  // 🐛 v1.39.4 (KARMA "j'affiche pas le bouton si on a pas internet") —
  // navigator.onLine est mis à false par le navigateur quand il détecte
  // qu'on est offline (Wi-Fi coupé, 4G perdue, mode avion). Sans internet
  // les tiles OSM ne se chargent pas, le bouton n'a aucun sens. Le polling
  // 2s de refonteInterface.js détectera le retour online automatiquement.
  function _isOnline() {
    return (typeof navigator === "undefined") || navigator.onLine !== false;
  }

  function isAvailable() {
    return _hasGeoref() && isOptedIn() && !_isStrictOfflineOn() && !_isIncognitoOn() && _isOnline();
  }

  // =========================
  // PROJECTION : pixels plan → latlng GPS
  // =========================
  // Retourne un objet { transform, planToLatLng(x, y) → L.latLng } ou null.
  function _buildProjection() {
    const g = _getEffectiveGeoref();
    if (!g) return null;
    if (typeof window.KmzExport !== "object" || typeof window.KmzExport.buildTransform !== "function") return null;
    const pA = g.pointA, pB = g.pointB;
    let t;
    try {
      t = window.KmzExport.buildTransform(
        { x: pA.x, y: pA.y }, { x: pB.x, y: pB.y },
        { lat: pA.lat, lng: pA.lng }, { lat: pB.lat, lng: pB.lng }
      );
    } catch(err) {
      console.warn("[OsmView] buildTransform failed :", err);
      return null;
    }
    return {
      transform: t,
      planToLatLng: function(x, y) {
        const g = window.KmzExport.planToGps(t, x, y);
        return g ? L.latLng(g.lat, g.lng) : null;
      }
    };
  }

  // =========================
  // PROJECTION D'UN IMAGE LAYER (base ou calque)
  // =========================
  // Retourne { tl, tr, bl } en latlng GPS, ou null en cas d'échec.
  // - Si calibration absente → utilise les 4 coins du plan principal
  //   (0,0)-(W,0)-(0,H). Sinon → 3 coins du parallélogramme calibré.
  function _project3Corners(proj, sourceUrl, layerConfig) {
    const planW = (window.APP_CONFIG && window.APP_CONFIG.imageWidth)  || 1;
    const planH = (window.APP_CONFIG && window.APP_CONFIG.imageHeight) || 1;
    let tlPx, trPx, blPx;
    if (layerConfig && layerConfig.calibration
        && window.ImageLayerCalibration
        && typeof window.ImageLayerCalibration.compute3CornersFromAnchorsPx === "function") {
      // Layer calibré : on a besoin des dims natives de l'image source
      // (sourceW, sourceH). On les récupère via une img preload async.
      return new Promise(function(resolve) {
        const img = new Image();
        img.onload = function() {
          const corners = window.ImageLayerCalibration.compute3CornersFromAnchorsPx(
            layerConfig.calibration, img.naturalWidth, img.naturalHeight
          );
          if (!corners) return resolve(null);
          const tl = proj.planToLatLng(corners.tl.x, corners.tl.y);
          const tr = proj.planToLatLng(corners.tr.x, corners.tr.y);
          const bl = proj.planToLatLng(corners.bl.x, corners.bl.y);
          if (!tl || !tr || !bl) return resolve(null);
          resolve({ tl: tl, tr: tr, bl: bl });
        };
        img.onerror = function() { resolve(null); };
        img.src = sourceUrl;
      });
    }
    // Layer non calibré (ou baseImage) : on utilise les coins du plan
    tlPx = { x: 0,     y: 0 };
    trPx = { x: planW, y: 0 };
    blPx = { x: 0,     y: planH };
    const tl = proj.planToLatLng(tlPx.x, tlPx.y);
    const tr = proj.planToLatLng(trPx.x, trPx.y);
    const bl = proj.planToLatLng(blPx.x, blPx.y);
    if (!tl || !tr || !bl) return Promise.resolve(null);
    return Promise.resolve({ tl: tl, tr: tr, bl: bl });
  }

  // =========================
  // BUILD MODAL UI
  // =========================
  function _buildModal() {
    const overlay = document.createElement("div");
    overlay.id = "kta-osm-view-overlay";
    overlay.className = "kta-readme-modal-overlay";
    overlay.style.display = "flex";
    overlay.innerHTML =
      '<div class="kta-readme-modal-boite" style="max-width:1200px; width:96vw; height:90vh; display:flex; flex-direction:column;">' +
        '<div class="kta-readme-modal-header">' +
          '<span class="kta-readme-modal-titre">🌍 Vue OSM — plan sur OpenStreetMap</span>' +
          '<button class="kta-panneau-close" type="button" id="kta-osm-close" aria-label="Fermer">&times;</button>' +
        '</div>' +
        '<div style="display:flex; gap:10px; align-items:center; padding:8px 14px; background:rgba(140,180,255,0.06); border-bottom:1px solid rgba(140,180,255,0.18); font-size:12.5px; color:#c8d0e0;">' +
          '<span>🎚️ Opacité plan :</span>' +
          '<input type="range" id="kta-osm-opacity" min="0" max="100" value="100" style="flex:1 1 auto; max-width:240px;">' +
          '<span id="kta-osm-opacity-val" style="width:38px; text-align:right;">100%</span>' +
          '<button type="button" class="kta-btn kta-btn-ghost" id="kta-osm-center" style="font-size:12px; padding:5px 10px;">🎯 Centrer sur le plan</button>' +
          '<span style="flex:1 1 auto;"></span>' +
          '<span style="color:#8892a4; font-size:11.5px;">🔒 Tiles : tile.openstreetmap.org (HTTPS)</span>' +
        '</div>' +
        '<div id="kta-osm-map" style="flex:1 1 auto; background:#0a0d18;"></div>' +
      '</div>';
    document.documentElement.appendChild(overlay);
    overlay.querySelector("#kta-osm-close").addEventListener("click", close);
    overlay.querySelector("#kta-osm-opacity").addEventListener("input", function(e) {
      _opacity = (parseInt(e.target.value, 10) || 0) / 100;
      document.getElementById("kta-osm-opacity-val").textContent = Math.round(_opacity * 100) + "%";
      _applyOpacity();
    });
    overlay.querySelector("#kta-osm-center").addEventListener("click", _centerOnPlan);
    return overlay;
  }

  function _applyOpacity() {
    if (!_planLayer) return;
    _planLayer.eachLayer(function(l) {
      try {
        if (l.setOpacity) l.setOpacity(_opacity);
        else if (l._image) l._image.style.opacity = String(_opacity);
      } catch(e) {}
    });
  }

  function _centerOnPlan() {
    if (!_osmMap || !_planLayer) return;
    try {
      const bounds = _planLayer.getBounds();
      if (bounds && bounds.isValid && bounds.isValid()) {
        _osmMap.fitBounds(bounds, { padding: [40, 40] });
      }
    } catch(e) { console.warn("[OsmView] center :", e); }
  }

  // =========================
  // BUILD MAP + LAYERS
  // =========================
  async function _renderMap() {
    const mapDiv = document.getElementById("kta-osm-map");
    if (!mapDiv) return;
    _osmMap = L.map(mapDiv, {
      worldCopyJump: false,
      attributionControl: true,
      zoomControl: true
    }).setView([46.5, 2.5], 6);
    L.tileLayer(OSM_TILE_URL, {
      maxZoom: OSM_MAX_ZOOM,
      attribution: OSM_ATTR,
      crossOrigin: true
    }).addTo(_osmMap);

    const proj = _buildProjection();
    if (!proj) {
      _showErrorBanner("⚠️ Calibration GPS du plan invalide ou indisponible.");
      return;
    }

    // 🐛 v1.39.3 — L.featureGroup au lieu de L.layerGroup : LayerGroup n'a
    // pas de méthode getBounds(), seule FeatureGroup (et sous-classes) l'a.
    // Sans ça, _centerOnPlan crash avec "_planLayer.getBounds is not a function".
    _planLayer = L.featureGroup().addTo(_osmMap);

    // 1. Plan principal
    const baseUrl = window.PLAN_CONFIG && window.PLAN_CONFIG.plan && window.PLAN_CONFIG.plan.baseImage;
    if (baseUrl) {
      const corners = await _project3Corners(proj, baseUrl, null);
      if (corners && L.imageOverlay && L.imageOverlay.rotated) {
        const overlay = L.imageOverlay.rotated(baseUrl, corners.tl, corners.tr, corners.bl, { interactive: false });
        overlay.addTo(_planLayer);
      }
    }

    // 2. Image layers actifs (cohérence visuelle map principale ↔ vue OSM)
    const allLayers = (window.PLAN_CONFIG && Array.isArray(window.PLAN_CONFIG.imageLayers))
      ? window.PLAN_CONFIG.imageLayers
      : [];
    const sorted = allLayers.slice().sort(function(a, b) { return (a.order || 0) - (b.order || 0); });
    for (const layerCfg of sorted) {
      // Skip si pas visible côté map principale (cohérence)
      const found = (window._ktaImageOverlays || []).find(function(o) {
        return o.id === (layerCfg.id || layerCfg.label);
      });
      const visible = found ? (_osmMap && window.map && window.map.hasLayer(found.overlay)) : layerCfg.visible;
      if (!visible) continue;
      const url = layerCfg.file;
      try {
        const corners = await _project3Corners(proj, url, layerCfg);
        if (corners && L.imageOverlay && L.imageOverlay.rotated) {
          const overlay = L.imageOverlay.rotated(url, corners.tl, corners.tr, corners.bl, { interactive: false });
          overlay.addTo(_planLayer);
        }
      } catch(e) { console.warn("[OsmView] layer projection :", layerCfg.id, e); }
    }

    _applyOpacity();
    _centerOnPlan();
  }

  function _showErrorBanner(msg) {
    const mapDiv = document.getElementById("kta-osm-map");
    if (!mapDiv) return;
    mapDiv.innerHTML =
      '<div style="display:flex; align-items:center; justify-content:center; height:100%; padding:20px; color:#ffb380; text-align:center; font-size:14px;">' +
        msg +
      '</div>';
  }

  // =========================
  // API PUBLIQUE
  // =========================
  function open() {
    if (typeof L === "undefined" || !L.imageOverlay || !L.imageOverlay.rotated) {
      alert("Leaflet ou plugin Rotated indisponible — Vue OSM impossible.");
      return;
    }
    if (!_hasGeoref()) {
      alert("Ce plan n'a pas de calibration GPS (georef).\nAjoute-en une via le générateur avancé → section 🌐 Géoréférencement GPS.");
      return;
    }
    if (_isStrictOfflineOn()) {
      if (window.OOMGuard && window.OOMGuard.showToast) {
        window.OOMGuard.showToast("⚠️ Mode hors-ligne strict actif — Vue OSM désactivée.", "warn");
      } else { alert("Mode hors-ligne strict actif — Vue OSM désactivée."); }
      return;
    }
    if (_isIncognitoOn()) {
      if (window.OOMGuard && window.OOMGuard.showToast) {
        window.OOMGuard.showToast("🥸 Mode incognito — Vue OSM désactivée (appel sortant interdit).", "warn");
      } else { alert("Mode incognito — Vue OSM désactivée."); }
      return;
    }
    if (!_isOnline()) {
      if (window.OOMGuard && window.OOMGuard.showToast) {
        window.OOMGuard.showToast("📴 Hors-ligne détecté — Vue OSM indisponible (tiles OSM réseau requises).", "warn");
      } else { alert("Hors-ligne — Vue OSM nécessite Internet pour charger les tiles OSM."); }
      return;
    }
    if (!isOptedIn()) {
      const yes = confirm(
        "🌍 Vue OSM\n\n" +
        "Cette action contacte tile.openstreetmap.org pour afficher la surface (réseau routier, bâtiments…) sous ton plan calibré GPS.\n\n" +
        "Active l'autorisation OSM ?\n" +
        "(Tu peux la révoquer à tout moment depuis ⚙️ Configuration home.)"
      );
      if (!yes) return;
      setOptedIn(true);
    }
    // 🆕 v1.39.5 — Ping fiable AVANT ouverture modale (pattern aligné sur
    // la mise à jour douce). navigator.onLine est rapide mais false-negative
    // possible (Wi-Fi connecté mais ISP down). Le ping fait un vrai fetch
    // HTTPS vers /ping.html same-origin avec timeout 5s → resultat fiable.
    // Si KO → toast + abort (évite d'ouvrir une modale OSM avec tiles vides).
    _pingThenOpen();
  }

  function _pingThenOpen() {
    // Overlay d'attente visible pendant le ping (jusqu'à 5s)
    const waitOverlay = document.createElement("div");
    waitOverlay.className = "kta-modal-overlay";
    waitOverlay.style.cssText = "z-index:100050;";
    waitOverlay.innerHTML =
      '<div class="kta-modal" style="max-width:340px;">' +
        '<div class="kta-modal-icon" style="font-size:32px;">⏳</div>' +
        '<div class="kta-modal-titre">Vérification de la connexion…</div>' +
        '<div class="kta-modal-texte" style="font-size:13px; color:#8892a4;">Test du serveur (jusqu\'à 5 s) avant d\'ouvrir la Vue OSM.</div>' +
      '</div>';
    document.documentElement.appendChild(waitOverlay);

    const pingFn = (typeof window._pingInternet === "function") ? window._pingInternet : null;
    const pingPromise = pingFn
      ? pingFn()
      : Promise.resolve(navigator.onLine !== false);  // fallback si helper pas chargé

    pingPromise.then(function(online) {
      try { waitOverlay.remove(); } catch(e) {}
      if (!online) {
        if (window.OOMGuard && window.OOMGuard.showToast) {
          window.OOMGuard.showToast("📴 Internet ne répond pas — Vue OSM impossible. Vérifie ta connexion.", "warn");
        } else {
          alert("Internet ne répond pas — Vue OSM impossible. Vérifie ta connexion.");
        }
        return;
      }
      if (_modalEl) close();
      _modalEl = _buildModal();
      setTimeout(_renderMap, 50);
    }).catch(function(e) {
      try { waitOverlay.remove(); } catch(_) {}
      console.warn("[OsmView] ping failed :", e);
      if (window.OOMGuard && window.OOMGuard.showToast) {
        window.OOMGuard.showToast("⚠️ Échec vérification réseau — Vue OSM annulée.", "warn");
      }
    });
  }

  function close() {
    if (_osmMap) { try { _osmMap.remove(); } catch(e) {} _osmMap = null; }
    _planLayer = null;
    if (_modalEl && _modalEl.parentNode) {
      try { _modalEl.parentNode.removeChild(_modalEl); } catch(e) {}
    }
    _modalEl = null;
  }

  window.OsmView = {
    open: open,
    close: close,
    isAvailable: isAvailable,
    isOptedIn: isOptedIn,
    setOptedIn: setOptedIn
  };

  console.log("[OsmView] Module chargé (v1.39.0).");
})();
