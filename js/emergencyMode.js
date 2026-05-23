/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * Site : https://myktamap.fr
 * Licence : CC BY-NC-SA 4.0 — Usage commercial interdit sans accord ecrit prealable.
 * Voir LICENSE a la racine du projet.
 */

// =========================
// 🚨 MODE URGENCE — v1.10.1
// =========================
// Bouton "panique" qui affiche un écran simplifié plein écran avec les infos
// VITALES en GROS :
//   - Position tracker (px du plan OU GPS lat/lng si calibrage KMZ dispo)
//   - Heading boussole en temps réel (gros chiffres + flèche compas)
//   - Échelle plan
//   - Bouton "Sortir" gros et visible
//
// Différent du ⛑️ "Je suis perdu" (sous-action existante du Tracker) qui
// calcule une zone théorique de recherche. Ici c'est juste de l'AFFICHAGE
// d'informations vitales — pas de calcul. Utile quand l'utilisateur veut
// son cap + sa position en grand sans avoir à zoomer / lire un label en 11px.
//
// 2 thèmes selon le contexte d'usage :
//   - 🌑 Sombre (défaut) : visibilité nocturne sous terre, économise l'œil
//   - 🔆 Clair : transforme l'écran en lampe d'appoint (max brightness)
//
// Polling 250ms pour update position + heading en temps réel.
//
// API publique :
//   window.EmergencyMode = {
//     activer, desactiver, isActif, toggle, setTheme
//   };
// =========================

(function() {
  "use strict";

  const POLL_MS = 250;

  let _overlay      = null;
  let _pollTimer    = null;
  let _theme        = "dark";   // "dark" | "light"
  let _lastHeadingShown = null; // throttle DOM update

  // 🔧 v1.10.2-fix1 (KARMA "comportement de saut comme on avait avant car
  // il peut pas faire plus que un tour complet") : pattern rotation
  // unwrapped — même fix que tracking.js > _trackerRotationUnwrapped
  // (v1.9.2-fix10). La CSS transition rotate(deg) interprète les valeurs
  // littéralement (350°→10° = -340° animation arrière). On cumule donc
  // les deltas courts pour que la valeur appliquée au CSS soit toujours
  // dans le bon sens visuel (peut être -10, 370, 720, -45… visuellement
  // identique mais le CSS anime toujours par le chemin court).
  let _compassUnwrapped = null;
  let _compassLastRaw   = null;

  // 🆕 v1.10.2 (KARMA "afficher dans le carré de la boussole derrière,
  // l'endroit où on est localisé sur la carte en zoom max et auto focus") :
  // mini L.map secondaire dans le carré compass qui partage les image
  // layers du plan principal + un marker tracker au centre.
  let _miniMap         = null;
  let _miniTrackerMark = null;
  // 🆕 v1.10.2-fix4 (KARMA "affiche les roads, c'est utile pour trouver
  // son chemin en mode urgence") : layers polylines roads + itinéraire
  // rendus sur le minimap. Stockés pour cleanup au destroy.
  let _miniRoadLayers      = [];
  // 🆕 v1.10.2-fix5 (KARMA "pareil pour zone et structure") : layers
  // zones (polygons) + structures (polygons + polylines fronts).
  let _miniZoneLayers      = [];
  let _miniStructureLayers = [];

  // ============================================================
  // FORMAT HELPERS
  // ============================================================
  function _formatXY(pos) {
    if (!pos || typeof pos.x !== "number" || typeof pos.y !== "number") return null;
    return Math.round(pos.x) + "  /  " + Math.round(pos.y);
  }

  function _formatGPS(transform, pos) {
    if (!transform || !pos) return null;
    if (!window.KmzExport || typeof window.KmzExport.planToGps !== "function") return null;
    try {
      const gps = window.KmzExport.planToGps(transform, pos.x, pos.y);
      if (!gps || typeof gps.lat !== "number" || typeof gps.lng !== "number") return null;
      // Format DD.dddddd (6 décimales = ~11 cm de précision, suffisant pour usage terrain)
      return gps.lat.toFixed(6) + "  /  " + gps.lng.toFixed(6);
    } catch(e) {
      console.warn("[Emergency] _formatGPS :", e);
      return null;
    }
  }

  // Heading texte cardinal (N, NE, E, etc.)
  function _formatHeading(h) {
    if (typeof h !== "number" || isNaN(h)) return { num: "—", card: "" };
    const norm = ((h % 360) + 360) % 360;
    const dirs = ["N","NE","E","SE","S","SO","O","NO"];
    const idx = Math.round(norm / 45) % 8;
    return {
      num:  norm.toFixed(0) + "°",
      card: dirs[idx]
    };
  }

  // ============================================================
  // UI
  // ============================================================
  function _buildOverlay() {
    const overlay = document.createElement("div");
    overlay.id = "kta-emergency-overlay";
    overlay.className = "kta-emergency-overlay kta-emergency-" + _theme;
    overlay.innerHTML =
      '<div class="kta-emergency-box">' +
        '<div class="kta-emergency-header">' +
          '<span class="kta-emergency-titre">🚨 MODE URGENCE</span>' +
          '<button class="kta-emergency-theme-btn" id="kta-emergency-theme" title="Basculer clair / sombre" type="button">' +
            (_theme === "dark" ? "🔆" : "🌑") +
          '</button>' +
        '</div>' +

        '<div class="kta-emergency-grid">' +

          '<div class="kta-emergency-bloc">' +
            '<div class="kta-emergency-label">📍 POSITION (PLAN)</div>' +
            '<div class="kta-emergency-value kta-emergency-pos-xy" id="kta-em-pos-xy">— / —</div>' +
            '<div class="kta-emergency-sub" id="kta-em-pos-status"></div>' +
          '</div>' +

          '<div class="kta-emergency-bloc" id="kta-em-bloc-gps" style="display:none;">' +
            '<div class="kta-emergency-label">🌍 GPS (LAT / LNG)</div>' +
            '<div class="kta-emergency-value kta-emergency-pos-gps" id="kta-em-pos-gps">— / —</div>' +
          '</div>' +

          '<div class="kta-emergency-bloc kta-emergency-bloc-heading">' +
            // 🆕 v1.10.2-fix3 (KARMA "le minimap doit prendre tout le
            // rectangle cap") : minimap Leaflet en background du bloc
            // entier (rectangle full width), pas juste le rond compass.
            // L\'aiguille + chiffres restent au centre en overlay devant.
            '<div class="kta-emergency-mini-map" id="kta-em-mini-map"></div>' +
            '<div class="kta-emergency-bloc-heading-overlay">' +
              '<div class="kta-emergency-label">🧭 CAP</div>' +
              '<div class="kta-emergency-value kta-emergency-heading-num" id="kta-em-heading-num">—</div>' +
              '<div class="kta-emergency-heading-card" id="kta-em-heading-card">—</div>' +
              '<div class="kta-emergency-compass">' +
                '<div class="kta-emergency-compass-needle" id="kta-em-compass-needle">▲</div>' +
                '<div class="kta-emergency-compass-n">N</div>' +
              '</div>' +
            '</div>' +
          '</div>' +

          '<div class="kta-emergency-bloc kta-emergency-bloc-meta">' +
            '<div class="kta-emergency-meta-row">' +
              '<span class="kta-emergency-meta-label">📏 ÉCHELLE</span>' +
              '<span class="kta-emergency-meta-value" id="kta-em-echelle">—</span>' +
            '</div>' +
            '<div class="kta-emergency-meta-row">' +
              '<span class="kta-emergency-meta-label">🗂️ PLAN</span>' +
              '<span class="kta-emergency-meta-value" id="kta-em-plan">—</span>' +
            '</div>' +
            '<div class="kta-emergency-meta-row">' +
              '<span class="kta-emergency-meta-label">🔋 ÉTAT</span>' +
              '<span class="kta-emergency-meta-value" id="kta-em-etat">—</span>' +
            '</div>' +
          '</div>' +

        '</div>' +

        '<div class="kta-emergency-hint">' +
          '⚠️ Ce mode désactive l\'interface principale et affiche les infos vitales en grand. ' +
          'Si tu es en situation réelle d\'urgence : <strong>reviens sur tes pas</strong>, ' +
          '<strong>économise ta lumière</strong>, <strong>préviens quelqu\'un</strong> dès que tu captes du réseau.' +
        '</div>' +

        '<button class="kta-emergency-exit-btn" id="kta-emergency-exit" type="button">' +
          '↩️ SORTIR DU MODE URGENCE' +
        '</button>' +

      '</div>';
    return overlay;
  }

  function _bindOverlay() {
    if (!_overlay) return;
    document.getElementById("kta-emergency-exit").addEventListener("click", desactiver);
    document.getElementById("kta-emergency-theme").addEventListener("click", function() {
      setTheme(_theme === "dark" ? "light" : "dark");
    });
    // Echap = sortie (cas PC). Sur mobile : bouton ↩️
    document.addEventListener("keydown", _onKey);
  }

  function _onKey(ev) {
    if (ev.key === "Escape") {
      ev.preventDefault();
      desactiver();
    }
  }

  // ============================================================
  // POLLING — update temps réel
  // ============================================================
  function _tick() {
    if (!_overlay) return;

    // 📍 Position plan (X, Y)
    const pos = (typeof window.getTrackingPosition === "function") ? window.getTrackingPosition() : null;
    const posEl    = document.getElementById("kta-em-pos-xy");
    const statusEl = document.getElementById("kta-em-pos-status");
    if (pos) {
      if (posEl) posEl.textContent = _formatXY(pos);
      if (statusEl) {
        const trackingActif = !!(typeof window.getTrackingActif === "function" && window.getTrackingActif());
        statusEl.textContent = trackingActif
          ? "✅ Tracker actif — mise à jour temps réel"
          : "📍 Dernière position connue (tracker arrêté)";
      }
      // 🆕 v1.10.2 : auto-focus du minimap sur la position
      _updateMiniMap(pos);
    } else {
      if (posEl) posEl.textContent = "—  /  —";
      if (statusEl) statusEl.textContent = "❌ Aucune position — démarre le tracker ▶️ d'abord";
    }

    // 🌍 GPS (si calibrage KMZ dispo pour ce plan)
    const blocGps = document.getElementById("kta-em-bloc-gps");
    const gpsEl   = document.getElementById("kta-em-pos-gps");
    if (pos && blocGps && gpsEl) {
      const planId = window._currentLoadedPlanId || "default";
      const calib  = (window.KmzExport && typeof window.KmzExport.getCalibration === "function")
                     ? window.KmzExport.getCalibration(planId) : null;
      if (calib && calib.transform) {
        const gpsTxt = _formatGPS(calib.transform, pos);
        if (gpsTxt) {
          blocGps.style.display = "";
          gpsEl.textContent = gpsTxt;
        }
      } else {
        blocGps.style.display = "none";
      }
    }

    // 🧭 Heading (boussole)
    const heading = (typeof window.getCurrentHeading === "function") ? window.getCurrentHeading() : null;
    if (typeof heading === "number" && !isNaN(heading)) {
      // Throttle DOM update à 1° près (sinon ça flicker au moindre mouvement)
      const rounded = Math.round(heading);
      if (rounded !== _lastHeadingShown) {
        _lastHeadingShown = rounded;
        const fmt = _formatHeading(heading);
        const numEl  = document.getElementById("kta-em-heading-num");
        const cardEl = document.getElementById("kta-em-heading-card");
        const needle = document.getElementById("kta-em-compass-needle");
        if (numEl)  numEl.textContent  = fmt.num;
        if (cardEl) cardEl.textContent = fmt.card;
        // 🔧 v1.10.2-fix1 : rotation unwrapped (cumul des deltas courts)
        // pour que le passage 350° → 10° = +20° au lieu de -340° (tour
        // arrière). Même pattern que tracking.js _trackerRotationUnwrapped.
        if (needle) {
          if (_compassLastRaw === null) {
            _compassUnwrapped = heading;
          } else {
            let delta = heading - _compassLastRaw;
            if (delta > 180)  delta -= 360;
            if (delta < -180) delta += 360;
            _compassUnwrapped += delta;
          }
          _compassLastRaw = heading;
          // 🔧 v1.10.2-fix6 (KARMA "droite gauche inversé") : l'aiguille
          // pointe désormais la DIRECTION DE MARCHE (= comme le tracker
          // icône sur la map principale), pas le N géographique.
          // Avant : rotate(-heading) → aiguille contre-tournait pour
          // pointer le N → si l'user regardait à l'Est (heading 90°),
          // aiguille pointait à GAUCHE — perçu comme inversé en mode
          // urgence où on s'attend à voir la flèche pointer la direction
          // de marche.
          // Maintenant : rotate(+heading) → aiguille pointe à DROITE
          // quand on regarde à l'Est. Cohérent avec le tracker icône
          // map principale + intuitif sur le minimap (heading-up).
          needle.style.transform = "rotate(" + (_compassUnwrapped) + "deg)";
        }
      }
    } else {
      const numEl  = document.getElementById("kta-em-heading-num");
      const cardEl = document.getElementById("kta-em-heading-card");
      if (numEl)  numEl.textContent  = "—";
      if (cardEl) cardEl.textContent = "Boussole indispo";
    }

    // 📏 Échelle (statique mais peut changer au plan switch)
    const echEl = document.getElementById("kta-em-echelle");
    if (echEl) {
      const scale = window.APP_CONFIG && window.APP_CONFIG.scale;
      echEl.textContent = (typeof scale === "number" && scale > 0)
        ? scale.toFixed(2) + " px/m"
        : "non calibrée";
    }

    // 🗂️ Plan
    const planEl = document.getElementById("kta-em-plan");
    if (planEl) {
      const planName = (window.PLAN_CONFIG && window.PLAN_CONFIG.plan && window.PLAN_CONFIG.plan.name)
                       || "—";
      planEl.textContent = planName;
    }

    // 🔋 État (batterie si dispo, sinon résumé tracker + boussole)
    const etatEl = document.getElementById("kta-em-etat");
    if (etatEl) {
      const partsEtat = [];
      if (typeof window.getTrackingActif === "function" && window.getTrackingActif()) {
        partsEtat.push("Tracker ON");
      } else {
        partsEtat.push("Tracker OFF");
      }
      if (typeof heading === "number" && !isNaN(heading)) {
        partsEtat.push("Boussole OK");
      } else {
        partsEtat.push("Boussole KO");
      }
      etatEl.textContent = partsEtat.join(" · ");
    }
  }

  // ============================================================
  // ACTIVATION
  // ============================================================
  function activer() {
    if (_overlay) return;  // déjà actif

    // 🔧 v1.10.2-fix2 (KARMA "si les accès aux capteurs non pas déjà
    // été validés, on doit nous le demander sinon boussole marche pas") :
    // appel à window.requestPermission() qui fait le flow complet :
    //   - iOS : DeviceMotionEvent.requestPermission() → si granted, attache
    //     les listeners deviceorientation + devicemotion via initOrientation
    //     + initMotion
    //   - Android/PC : pas de prompt système, attache direct les listeners
    //
    // Avant : on n'appelait que requestPermission sans suite → si l'user
    // n'avait jamais utilisé le tracker, aucun listener attaché → boussole
    // restait à "—". Le bon point d'entrée est window.requestPermission
    // exposé par tracking.js (idempotent via _orientationListenerAttached).
    //
    // ⚠️ DOIT être appelé synchronement depuis le user gesture (= ce
    // activer() est invoqué depuis le onClick de la sous-action 🚨 →
    // c'est OK, geste utilisateur valide).
    if (typeof window.requestPermission === "function") {
      try { window.requestPermission(); }
      catch(e) { console.warn("[Emergency] requestPermission échoué :", e); }
    }

    _overlay = _buildOverlay();
    document.documentElement.appendChild(_overlay);
    _bindOverlay();

    // 🆕 v1.10.2 : init du minimap (Leaflet secondaire) — délai 100ms
    // pour que le browser ait calculé le layout (sinon Leaflet voit un
    // container 0×0 et fitBounds échoue silencieusement).
    setTimeout(_initMiniMap, 100);

    // Premier tick immédiat
    _tick();
    _pollTimer = setInterval(_tick, POLL_MS);

    // Empêcher l'écran de s'éteindre sur mobile (Wake Lock API si dispo)
    _acquireWakeLock();

    console.log("[Emergency] Activé");
  }

  function desactiver() {
    if (!_overlay) return;
    if (_pollTimer) {
      clearInterval(_pollTimer);
      _pollTimer = null;
    }
    document.removeEventListener("keydown", _onKey);
    // 🆕 v1.10.2 : destroy minimap pour libérer les ressources Leaflet
    _destroyMiniMap();
    try { _overlay.remove(); } catch(e) {}
    _overlay = null;
    _lastHeadingShown = null;
    _compassUnwrapped = null;
    _compassLastRaw   = null;
    _releaseWakeLock();
    console.log("[Emergency] Désactivé");
  }

  function isActif() {
    return _overlay !== null;
  }

  function toggle() {
    if (isActif()) desactiver(); else activer();
  }

  function setTheme(theme) {
    if (theme !== "dark" && theme !== "light") return;
    _theme = theme;
    if (_overlay) {
      _overlay.classList.remove("kta-emergency-dark", "kta-emergency-light");
      _overlay.classList.add("kta-emergency-" + theme);
      // Update le bouton toggle
      const btn = document.getElementById("kta-emergency-theme");
      if (btn) btn.textContent = (theme === "dark" ? "🔆" : "🌑");
    }
  }

  // ============================================================
  // MINIMAP — Leaflet secondaire dans le carré compass (v1.10.2)
  // ============================================================
  // Affiche l'image base du plan + un marker tracker au centre, à zoom
  // élevé pour qu'on voie l'environnement immédiat. Pas de tile layer
  // séparé : on reuse `window.PLAN_CONFIG` pour récupérer l'URL de la
  // base image (résolue via RUNTIME_ASSETS si plan local). La minimap
  // suit la position en temps réel via `setView` au tick.
  //
  // Pour V2 tuilé : l'image base reste dans le ZIP même en V2 (cf.
  // CLAUDE.md §27 — baseImage est conservé pour rétrocompat / fallback
  // perfPreset off). Donc on utilise toujours `baseImage`, pas les tuiles.
  //
  // Zoom : `MINIMAP_ZOOM_OFFSET` au-dessus du `fitBounds` qui ferait
  // afficher tout le plan. Donne une vue rapprochée autour du tracker.
  // 🔧 v1.10.2-fix7 (KARMA "moins zoomé")          : 4 → 2 (trop loin)
  // 🔧 v1.10.3-fix1 (KARMA "re zoom à fond")        : 2 → maxZ (bug)
  // 🔧 v1.10.3-fix2 (KARMA "dezoom un peu, ça bug") : maxZ → 5 (équilibre)
  // Compromis : ~20-50m d'horizon, assez serré pour repérer
  // l'environnement immédiat sans pousser Leaflet aux limites d'échelle
  // qui causent les artefacts de rendu sur image L.CRS.Simple.
  const MINIMAP_ZOOM_OFFSET = 5;

  function _initMiniMap() {
    if (_miniMap) return;
    const container = document.getElementById("kta-em-mini-map");
    if (!container) {
      console.warn("[Emergency] minimap : container introuvable");
      return;
    }
    if (typeof L === "undefined") {
      console.warn("[Emergency] minimap : Leaflet (L) indispo");
      return;
    }
    const pc = window.PLAN_CONFIG;
    if (!pc || !pc.plan) {
      console.warn("[Emergency] minimap : PLAN_CONFIG indispo");
      return;
    }
    const imgW = pc.plan.imageWidth  || 0;
    const imgH = pc.plan.imageHeight || 0;
    if (imgW <= 0 || imgH <= 0) {
      console.warn("[Emergency] minimap : dimensions plan invalides", imgW, imgH);
      return;
    }
    // 🔧 v1.10.2-fix3 : résolution URL image base plus robuste.
    // Sources possibles (dans l'ordre) :
    //   1. RUNTIME_ASSETS[<chemin exact>] (plan ZIP local, blob URL)
    //   2. RUNTIME_ASSETS[<basename>] (fallback si chemin diffère)
    //   3. URL HTTP directe (plan serveur, ex: "data/test1/TestMAP.png")
    let imgUrl = pc.plan.baseImage || "";
    const baseImgRaw = imgUrl;
    if (window.RUNTIME_ASSETS) {
      if (window.RUNTIME_ASSETS[imgUrl] && window.RUNTIME_ASSETS[imgUrl].url) {
        imgUrl = window.RUNTIME_ASSETS[imgUrl].url;
      } else {
        // Fallback : cherche par basename
        const baseName = baseImgRaw.split("/").pop();
        if (window.RUNTIME_ASSETS[baseName] && window.RUNTIME_ASSETS[baseName].url) {
          imgUrl = window.RUNTIME_ASSETS[baseName].url;
        }
      }
    }
    if (!imgUrl) {
      console.warn("[Emergency] minimap : image URL non résolue (baseImage =", baseImgRaw, ")");
      return;
    }
    console.log("[Emergency] minimap init : image =", imgUrl, "dims =", imgW + "×" + imgH);

    try {
      _miniMap = L.map(container, {
        crs:             L.CRS.Simple,
        attributionControl: false,
        zoomControl:     false,
        scrollWheelZoom: false,
        dragging:        false,
        keyboard:        false,
        doubleClickZoom: false,
        touchZoom:       false,
        boxZoom:         false,
        tap:             false,
        zoomAnimation:   false,
        fadeAnimation:   false,
        minZoom:        -10,        // permet de dézoomer suffisamment
        maxZoom:         10,        // permet de zoomer fort autour du tracker
        preferCanvas:    true       // perf : canvas pour les polylines roads
      });
      const bounds = [[0, 0], [imgH, imgW]];
      L.imageOverlay(imgUrl, bounds, { interactive: false }).addTo(_miniMap);
      _miniMap.fitBounds(bounds);

      // 🆕 v1.10.2-fix4/5 : ajoute zones (eau / remblais / effondrement /
      // inaccessible) + structures (piliers + murs + fronts) + roads sur
      // le minimap pour aider à trouver son chemin en mode urgence.
      // Ordre Z (du fond vers l'avant-plan, comme dans la carte principale) :
      //   zones < structures < roads.
      // Toutes filtrées par niveau si M-LVL actif.
      _addZonesToMiniMap(imgH);
      _addStructuresToMiniMap(imgH);
      _addRoadsToMiniMap(imgH);

      // 🔧 v1.10.2-fix3 : multiple invalidateSize en cascade pour gérer
      // le cas où le container avait des dims 0×0 au moment du L.map().
      // Leaflet calcule les bounds avec les dims actuelles → si elles
      // étaient 0 au boot, fitBounds donne un zoom incohérent.
      // Cascade : 50ms (paint initial) + 200ms (animations finies) + 500ms
      // (sécurité ultime).
      setTimeout(function() {
        if (_miniMap) {
          try { _miniMap.invalidateSize({ animate: false }); _miniMap.fitBounds(bounds); }
          catch(e) {}
        }
      }, 50);
      setTimeout(function() {
        if (_miniMap) {
          try { _miniMap.invalidateSize({ animate: false }); _miniMap.fitBounds(bounds); }
          catch(e) {}
        }
      }, 200);

      // Marker tracker — point rouge avec halo
      _miniTrackerMark = L.circleMarker([0, 0], {
        radius:      8,
        color:       "#ff3b30",
        weight:      3,
        fillColor:   "#ff6b6b",
        fillOpacity: 1,
        interactive: false
      });
    } catch(e) {
      console.warn("[Emergency] init minimap échoué :", e);
      _miniMap = null;
    }
  }

  // 🆕 v1.10.2-fix5 : ajoute les zones (eau / remblais / effondrement /
  // inaccessible) sur le minimap. Session + embedded. Couleurs cohérentes
  // avec zones.js > ZONE_STYLES, opacité bumpée pour rester lisible sur
  // minimap (image base désaturée).
  function _addZonesToMiniMap(imgH) {
    if (!_miniMap || typeof L === "undefined") return;
    const session  = (typeof window.getZones === "function" ? window.getZones() : []) || [];
    const embedded = (typeof window.getAllEmbeddedZones === "function" ? window.getAllEmbeddedZones() : []) || [];
    const all = session.concat(embedded);
    if (all.length === 0) return;

    const filter = (typeof window.passeFiltreNiveau === "function")
                   ? window.passeFiltreNiveau
                   : function() { return true; };

    // Styles inspirés de zones.js — couleurs vives. Inaccessible en rouge
    // plein semi-transparent (pas de hachures sur canvas Leaflet — on
    // simplifie pour le mini, le rouge plein dit déjà "danger").
    const STYLES = {
      eau:          { color: "#3b82f6", weight: 1.5, fillColor: "#60a5fa", fillOpacity: 0.45, opacity: 0.9 },
      remblais:     { color: "#404a5e", weight: 1.5, fillColor: "#5a6680", fillOpacity: 0.55, opacity: 0.9 },
      effondrement: { color: "#dc2626", weight: 1.5, fillColor: "#ef4444", fillOpacity: 0.5,  opacity: 0.9 },
      inaccessible: { color: "#000000", weight: 1.5, fillColor: "#7f1d1d", fillOpacity: 0.6,  opacity: 1   }
    };

    let added = 0;
    all.forEach(function(zone) {
      if (!zone || !Array.isArray(zone.points) || zone.points.length < 3) return;
      if (!filter(zone)) return;
      const style = STYLES[zone.type] || STYLES.remblais;
      const latlngs = zone.points.map(function(p) { return [imgH - p.y, p.x]; });
      try {
        const poly = L.polygon(latlngs, Object.assign({ interactive: false }, style));
        poly.addTo(_miniMap);
        _miniZoneLayers.push(poly);
        added++;
      } catch(e) { console.warn("[Emergency] minimap zone skip :", e); }
    });
    if (added > 0) console.log("[Emergency] minimap : " + added + " zone(s) affichée(s)");
  }

  // 🆕 v1.10.2-fix5 : ajoute les structures (piliers + murs polygons,
  // fronts polylines). Couleurs cohérentes avec structures.js >
  // STRUCTURE_STYLES (post-hotfix2 : front-1 jaune, front-2 orange).
  function _addStructuresToMiniMap(imgH) {
    if (!_miniMap || typeof L === "undefined") return;
    const session = (typeof window.getStructures === "function" ? window.getStructures() : []) || [];
    // ⚠️ getAllEmbeddedStructures filtre points.length >= 3 → exclut les
    // fronts embedded (polylines 2+ points). Acceptable car fronts en data
    // layer sont rares ; les fronts session sont gérés normalement.
    const embedded = (typeof window.getAllEmbeddedStructures === "function" ? window.getAllEmbeddedStructures() : []) || [];
    const all = session.concat(embedded);
    if (all.length === 0) return;

    const filter = (typeof window.passeFiltreNiveau === "function")
                   ? window.passeFiltreNiveau
                   : function() { return true; };
    // Helper pour distinguer polyline (fronts) vs polygon (piliers + mur)
    const isPolyline = (typeof window.isStructurePolylineType === "function")
                       ? window.isStructurePolylineType
                       : function(t) { return t === "front-1" || t === "front-2"; };

    // Styles cohérents v1.10.1-hotfix2 (front-1 jaune, front-2 orange).
    // Ordre Z : mur < pilier-2 < pilier-1 < front-2 < front-1 (cf §31.5 CLAUDE.md).
    // Sur le mini Leaflet, l'ordre d'ajout = ordre Z. Tri AVANT itération.
    const ordreType = { "mur": 0, "pilier-2": 1, "pilier-1": 2, "front-2": 3, "front-1": 4 };
    const _multiLevelOnSort = !!(window.APP_CONFIG && window.APP_CONFIG.multiLevel === true);
    const sorted = all.slice().sort(function(a, b) {
      if (_multiLevelOnSort) {
        const la = Number.isInteger(a.level) ? a.level : 0;
        const lb = Number.isInteger(b.level) ? b.level : 0;
        if (la !== lb) return la - lb;
      }
      return (ordreType[a.type] ?? 99) - (ordreType[b.type] ?? 99);
    });

    const POLYGON_STYLES = {
      "pilier-1": { color: "#000000", weight: 1, fillColor: "#f4c542", fillOpacity: 0.85, opacity: 0.9 },
      "pilier-2": { color: "#000000", weight: 1, fillColor: "#ff9933", fillOpacity: 0.85, opacity: 0.9 },
      "mur":      { color: "#000000", weight: 1, fillColor: "#1e3a8a", fillOpacity: 0.85, opacity: 0.9 }
    };
    const POLYLINE_STYLES = {
      "front-1": { color: "#f4c542", weight: 3.5, opacity: 1 },  // jaune (cohérent pilier-1)
      "front-2": { color: "#ff9933", weight: 3.5, opacity: 1 }   // orange (cohérent pilier-2)
    };

    let added = 0;
    sorted.forEach(function(s) {
      if (!s || !Array.isArray(s.points)) return;
      if (!filter(s)) return;
      const line = isPolyline(s.type);
      const minPts = line ? 2 : 3;
      if (s.points.length < minPts) return;
      const latlngs = s.points.map(function(p) { return [imgH - p.y, p.x]; });
      try {
        const style = line
          ? (POLYLINE_STYLES[s.type] || POLYLINE_STYLES["front-1"])
          : (POLYGON_STYLES[s.type] || POLYGON_STYLES["mur"]);
        const layer = line
          ? L.polyline(latlngs, Object.assign({ interactive: false }, style))
          : L.polygon (latlngs, Object.assign({ interactive: false }, style));
        layer.addTo(_miniMap);
        _miniStructureLayers.push(layer);
        added++;
      } catch(e) { console.warn("[Emergency] minimap structure skip :", e); }
    });
    if (added > 0) console.log("[Emergency] minimap : " + added + " structure(s) affichée(s)");
  }

  // 🆕 v1.10.2-fix4 : ajoute les routes (session + embedded) sur le minimap.
  // Styles cohérents avec road.js (vert / violet / jaune / cyan / magenta)
  // mais épaisseur réduite et opacité bumpée pour rester lisible par-dessus
  // l'image base désaturée.
  function _addRoadsToMiniMap(imgH) {
    if (!_miniMap || typeof L === "undefined") return;
    // Collecte session + tous les embedded (visibles ET masqués)
    const session  = (typeof window.getRoads === "function" ? window.getRoads() : []) || [];
    const embedded = (typeof window.getAllEmbeddedRoads === "function" ? window.getAllEmbeddedRoads() : []) || [];
    const all = session.concat(embedded);
    if (all.length === 0) return;

    // Filtre niveau si M-LVL actif. Utilise window.passeFiltreNiveau si dispo
    // (exposé par road.js), sinon fallback inclusif.
    const filter = (typeof window.passeFiltreNiveau === "function")
                   ? window.passeFiltreNiveau
                   : function() { return true; };

    // Styles inspirés de road.js ROAD_STYLES mais adaptés au minimap
    // (weight réduit, opacité bumpée pour lisibilité par-dessus image
    // désaturée + brightness 0.6).
    const STYLES = {
      principal:  { color: "#27c97e", weight: 3, opacity: 0.95 },
      secondaire: { color: "#a78cf4", weight: 2.5, opacity: 0.95 },
      chemin:     { color: "#f4c542", weight: 2, opacity: 0.95 },
      jonction:   { color: "#ff4ecb", weight: 3, opacity: 1, dashArray: "6 4" },
      itinerary:  { color: "#00d4ff", weight: 4, opacity: 1 }
    };

    let added = 0;
    all.forEach(function(road) {
      if (!road || !Array.isArray(road.points) || road.points.length < 2) return;
      if (!filter(road)) return;
      const style = STYLES[road.type] || STYLES.chemin;
      const latlngs = road.points.map(function(p) { return [imgH - p.y, p.x]; });
      try {
        const poly = L.polyline(latlngs, Object.assign({ interactive: false }, style));
        poly.addTo(_miniMap);
        _miniRoadLayers.push(poly);
        added++;
      } catch(e) {
        console.warn("[Emergency] minimap road skip :", e);
      }
    });
    if (added > 0) console.log("[Emergency] minimap : " + added + " road(s) affichée(s)");
  }

  function _destroyMiniMap() {
    if (!_miniMap) return;
    // Cleanup tous les overlays (roads + zones + structures)
    function _cleanLayers(arr) {
      arr.forEach(function(layer) {
        try { layer.remove(); } catch(e) {}
      });
    }
    _cleanLayers(_miniRoadLayers);      _miniRoadLayers = [];
    _cleanLayers(_miniZoneLayers);      _miniZoneLayers = [];
    _cleanLayers(_miniStructureLayers); _miniStructureLayers = [];
    try {
      if (_miniTrackerMark) _miniTrackerMark.remove();
      _miniMap.remove();
    } catch(e) {}
    _miniMap = null;
    _miniTrackerMark = null;
  }

  function _updateMiniMap(pos) {
    if (!_miniMap || !pos) return;
    if (typeof L === "undefined") return;
    const pc = window.PLAN_CONFIG;
    if (!pc || !pc.plan) return;
    const imgW = pc.plan.imageWidth  || 0;
    const imgH = pc.plan.imageHeight || 0;
    if (imgW <= 0 || imgH <= 0) return;
    // convertCoord du projet : [imageHeight - y, x] (CRS Leaflet Simple)
    const latlng = [imgH - pos.y, pos.x];
    // 🔧 v1.10.3-fix2 (KARMA "dezoom un peu, ça bug à fond") : on
    // retombe sur la formule baseZ + offset clamped à maxZoom. À
    // maxZoom=10 sur image L.CRS.Simple, Leaflet bug visuellement
    // (image étirée bien au-delà de sa résolution native).
    const maxZ  = _miniMap.getMaxZoom();
    const baseZ = _miniMap.getBoundsZoom([[0, 0], [imgH, imgW]], true) || 0;
    const targetZ = Math.min(maxZ, baseZ + MINIMAP_ZOOM_OFFSET);
    _miniMap.setView(latlng, targetZ, { animate: false });

    // Add ou move le marker tracker
    if (_miniTrackerMark) {
      if (!_miniMap.hasLayer(_miniTrackerMark)) {
        _miniTrackerMark.addTo(_miniMap);
      }
      _miniTrackerMark.setLatLng(latlng);
    }
    // 🔧 v1.10.2-fix3 : invalidateSize retiré du tick (était appelé toutes
    // les 250ms inutilement — coût perf). Il est suffisant de l'appeler
    // à l'init (déjà fait dans _initMiniMap cascade) + sur orientationchange
    // si on veut vraiment couvrir le rotation device.
  }

  // ============================================================
  // WAKE LOCK — empêche l'écran de s'éteindre pendant l'urgence
  // ============================================================
  let _wakeLockSentinel = null;
  function _acquireWakeLock() {
    if (!navigator.wakeLock) return;
    navigator.wakeLock.request("screen").then(function(sentinel) {
      _wakeLockSentinel = sentinel;
      console.log("[Emergency] Wake lock acquis");
    }).catch(function(e) {
      console.warn("[Emergency] Wake lock indispo :", e.name);
    });
  }
  function _releaseWakeLock() {
    if (_wakeLockSentinel) {
      try { _wakeLockSentinel.release(); } catch(e) {}
      _wakeLockSentinel = null;
    }
  }

  // ============================================================
  // EXPORT GLOBAL
  // ============================================================
  window.EmergencyMode = {
    activer:    activer,
    desactiver: desactiver,
    isActif:    isActif,
    toggle:     toggle,
    setTheme:   setTheme
  };

  console.log("[Emergency] Module chargé");
})();
