/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * https://myktamap.fr — Licence CC BY-NC-SA 4.0
 * Usage commercial interdit sans accord ecrit prealable. Voir LICENSE.
 */

// =====================================================================
// osmMesure.js — mesurer dans la Vue OSM (distance + surface)
// =====================================================================
// Pas measure.js : il travaille en PIXELS d'un plan divisés par une échelle calibrée, alors qu'en Vue OSM
// plusieurs plans sont empilés et les coordonnées sont déjà des lat/lng. Une mesure ici ne dépend d'AUCUN
// calibrage (une échelle de plan fausse fausse la mesure du mode plan, pas celle-ci).
// DISTANCE : `L.latLng.distanceTo` (Haversine, rayon moyen), exacte au mètre à nos échelles.
// SURFACE : projection ÉQUIRECTANGULAIRE LOCALE centrée sur le barycentre (longitude × cos(latitude)) puis
// formule des lacets — erreur très inférieure au pour cent sur quelques km, sous la précision d'un tracé à
// la main.
// Expose window.OsmMesure : activer(map), desactiver(), estActif() ; exclusif avec window.OsmCoords.
// Doc : docs/architecture/vue-osm.md
// =====================================================================

(function () {
  "use strict";

  const R_TERRE = 6371008.8;   // rayon moyen (IUGG), mètres

  let _map = null;
  let _actif = false;
  let _pts = [];               // [L.LatLng]
  let _layer = null;           // groupe des tracés + libellés
  let _floater = null;
  let _onClic = null;
  let _onResize = null;

  function _t(cle, p) {
    return (window.I18n && typeof window.I18n.t === "function") ? window.I18n.t(cle, p) : cle;
  }
  function _fmtD(m) {
    return (typeof window.formatDistance === "function")
      ? window.formatDistance(m, 1) : (Math.round(m) + " m");
  }
  // m² sous l'hectare, hectares au-delà (au-dessus de 10 000, les m² cessent d'être lisibles).
  function _fmtS(m2) {
    if (!Number.isFinite(m2)) return "—";
    if (m2 < 10000) return Math.round(m2) + " m²";
    return (m2 / 10000).toFixed(2).replace(".", ",") + " ha";
  }


  // Bandeau en haut de la CARTE, centré — pas de la fenêtre (en mode plan la barre d'outils y est, un `top`
  // fixe recouvrirait ses boutons). Rappelé au resize et à la rotation.
  function _placer() {
    if (!_floater || !_map) return;
    try {
      const r = _map.getContainer().getBoundingClientRect();
      if (!r || !r.width) return;
      // 🩸 Bridé sur la CARTE, pas sur la fenêtre : en mode plan la carte n'occupe pas toute la largeur, un
      // `max-width: 100vw` ferait déborder le bandeau.
      _floater.style.maxWidth = Math.max(180, Math.round(r.width - 24)) + "px";
      // Centré en restant dedans : plus large que la moitié, un centrage nu le ferait sortir d'un côté.
      const demi = (_floater.offsetWidth || 0) / 2;
      let cx = r.left + r.width / 2;
      if (demi > 0) cx = Math.min(Math.max(cx, r.left + 12 + demi), r.right - 12 - demi);
      _floater.style.left = Math.round(cx) + "px";
      _floater.style.top  = Math.round(r.top + 12) + "px";
      _floater.style.bottom = "auto";
    } catch (e) {}
  }
  function _distanceTotale() {
    let d = 0;
    for (let i = 1; i < _pts.length; i++) d += _pts[i - 1].distanceTo(_pts[i]);
    return d;
  }

  // Surface du polygone fermé par les points, en m².
  function _surface() {
    if (_pts.length < 3) return 0;
    let sLat = 0, sLng = 0;
    _pts.forEach(function (p) { sLat += p.lat; sLng += p.lng; });
    const lat0 = (sLat / _pts.length) * Math.PI / 180;
    const k = Math.PI / 180 * R_TERRE;
    // Plan local en mètres, centré sur le barycentre.
    const xy = _pts.map(function (p) {
      return { x: (p.lng - sLng / _pts.length) * k * Math.cos(lat0),
               y: (p.lat - sLat / _pts.length) * k };
    });
    let aire = 0;
    for (let i = 0, j = xy.length - 1; i < xy.length; j = i++) {
      aire += (xy[j].x + xy[i].x) * (xy[j].y - xy[i].y);
    }
    return Math.abs(aire / 2);
  }

  function _redessiner() {
    if (!_layer) return;
    _layer.clearLayers();
    if (_pts.length === 0) { _majFloater(); return; }

    _pts.forEach(function (p, i) {
      L.circleMarker(p, {
        radius: 5, color: "#f4c542", fillColor: "#1a1f2e",
        fillOpacity: 1, weight: 2, interactive: false
      }).addTo(_layer);
      if (i === 0 && _pts.length >= 3) {
        // Le premier sommet se distingue : il ferme la surface.
        L.circleMarker(p, { radius: 8, color: "#f4c542", fill: false,
                            weight: 1, opacity: 0.5, interactive: false }).addTo(_layer);
      }
    });

    if (_pts.length >= 2) {
      L.polyline(_pts, { color: "#f4c542", weight: 3, opacity: 0.95,
                         interactive: false }).addTo(_layer);
      // Longueur au milieu de chaque segment (on cherche le tronçon, pas seulement le total).
      for (let i = 1; i < _pts.length; i++) {
        const a = _pts[i - 1], b = _pts[i];
        const mid = L.latLng((a.lat + b.lat) / 2, (a.lng + b.lng) / 2);
        L.marker(mid, {
          interactive: false,
          icon: L.divIcon({ className: "kta-osm-mes-seg", iconSize: [null, null],
                            html: '<span>' + _fmtD(a.distanceTo(b)) + '</span>' })
        }).addTo(_layer);
      }
    }
    // Fermeture en pointillés dès 3 points : la surface se lit sans revenir au premier point.
    if (_pts.length >= 3) {
      L.polyline([_pts[_pts.length - 1], _pts[0]], {
        color: "#f4c542", weight: 2, opacity: 0.45,
        dashArray: "6 6", interactive: false
      }).addTo(_layer);
    }
    _majFloater();
  }

  function _majFloater() {
    if (!_floater) return;
    const info = _floater.querySelector(".kta-osm-mes-info");
    if (!info) return;
    if (_pts.length < 2) {
      info.textContent = _t("osm_mes.poser");
      return;
    }
    // Pas de 📏 ici (l'icône fixe du bandeau le dit) ; le ⬛ reste, il distingue la surface.
    let txt = _fmtD(_distanceTotale());
    if (_pts.length >= 3) txt += "   ⬛ " + _fmtS(_surface());
    info.textContent = txt;
  }

  function activer(map) {
    if (_actif) { desactiver(); return; }
    if (!map || typeof L === "undefined") return;
    _map = map;
    _actif = true;
    _pts = [];
    _layer = L.layerGroup().addTo(_map);

    _floater = document.createElement("div");
    _floater.id = "kta-osm-mes-floater";
    _floater.innerHTML =
      '<span class="kta-osm-mes-icone">📏</span>' +
      '<span class="kta-osm-mes-info"></span>' +
      '<button type="button" class="kta-btn kta-btn-ghost kta-btn-small" id="kta-osm-mes-undo">↩</button>' +
      '<button type="button" class="kta-btn kta-btn-ghost kta-btn-small" id="kta-osm-mes-clear">🗑️</button>' +
      '<button type="button" class="kta-btn kta-btn-ghost kta-btn-small" id="kta-osm-mes-close">✕</button>';
    document.body.appendChild(_floater);
    _placer();
    _onResize = function () { _placer(); };
    try {
      window.addEventListener("resize", _onResize);
      window.addEventListener("orientationchange", _onResize);
    } catch (e) {}
    _floater.querySelector("#kta-osm-mes-undo").addEventListener("click", function () {
      _pts.pop(); _redessiner();
    });
    _floater.querySelector("#kta-osm-mes-clear").addEventListener("click", function () {
      _pts = []; _redessiner();
    });
    _floater.querySelector("#kta-osm-mes-close").addEventListener("click", desactiver);

    _onClic = function (e) { _pts.push(e.latlng); _redessiner(); };
    _map.on("click", _onClic);
    try { _map.getContainer().style.cursor = "crosshair"; } catch (err) {}
    _redessiner();
  }

  function desactiver() {
    if (!_actif) return;
    _actif = false;
    // 🩸 Tout démonter, dans l'ordre inverse : un `click` laissé sur la carte ajouterait des points invisibles,
    // et le curseur croix ferait croire l'outil armé.
    try { if (_map && _onClic) _map.off("click", _onClic); } catch (e) {}
    try { if (_map && _layer) _map.removeLayer(_layer); } catch (e) {}
    try { if (_map) _map.getContainer().style.cursor = ""; } catch (e) {}
    try {
      if (_onResize) {
        window.removeEventListener("resize", _onResize);
        window.removeEventListener("orientationchange", _onResize);
      }
    } catch (e) {}
    _onResize = null;
    if (_floater && _floater.parentNode) _floater.remove();
    _layer = null; _floater = null; _onClic = null; _pts = [];
  }

  window.OsmMesure = {
    activer:    activer,
    desactiver: desactiver,
    estActif:   function () { return _actif; },
    // Exposés pour le harnais : ils portent la math.
    _distance:  function (pts) { _pts = pts; return _distanceTotale(); },
    _surface:   function (pts) { _pts = pts; return _surface(); }
  };
})();
