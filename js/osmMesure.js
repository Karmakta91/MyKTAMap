// =====================================================================
// 📏 osmMesure.js — mesurer dans la Vue OSM (distance + surface)
// =====================================================================
// LE BESOIN (KARMA) : « en OSM Home, on devrait pouvoir effectuer des mesures
// comme on fait en mode plan ».
//
// 🩸 POURQUOI `measure.js` N'EST PAS RÉUTILISABLE, ET POURQUOI C'EST UNE BONNE
// NOUVELLE. Le module du mode plan (442 lignes) est bâti sur `convertCoord` et
// `APP_CONFIG.scale` : il travaille en PIXELS d'un plan, qu'il divise par une
// échelle calibrée pour obtenir des mètres. En vue OSM il n'y a pas UN plan —
// il y en a plusieurs empilés, chacun avec la sienne — et il n'y a pas besoin
// d'échelle : les coordonnées sont déjà des latitudes et des longitudes.
//
// Une mesure faite ici est donc STRUCTURELLEMENT PLUS FIABLE qu'en mode plan :
// elle ne dépend d'aucun calibrage. C'est exactement la source du bug vécu par
// KARMA sur son relevé SIG — 480 m annoncés contre 1 644 réels, parce que
// l'échelle du plan était fausse. Ici, la question ne se pose pas.
//
// DISTANCE : `L.latLng.distanceTo` — géodésique (Haversine sur le rayon moyen
// terrestre), exacte au mètre sur nos ordres de grandeur.
//
// SURFACE : projection ÉQUIRECTANGULAIRE LOCALE puis formule du lacet. La
// projection est centrée sur le barycentre du polygone et corrige la longitude
// par cos(latitude) — sur quelques kilomètres, l'erreur est très inférieure au
// pour cent, largement sous la précision d'un tracé à la main. On ne prétend
// pas mieux : une surface géodésique exacte demanderait une projection
// équivalente, et la précision gagnée serait invisible ici.
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

  function _t(cle, p) {
    return (window.I18n && typeof window.I18n.t === "function") ? window.I18n.t(cle, p) : cle;
  }
  function _fmtD(m) {
    return (typeof window.formatDistance === "function")
      ? window.formatDistance(m, 1) : (Math.round(m) + " m");
  }
  // Une surface se lit en m² sous l'hectare, en hectares au-delà : au-dessus de
  // 10 000, le chiffre en m² cesse d'être lisible.
  function _fmtS(m2) {
    if (!Number.isFinite(m2)) return "—";
    if (m2 < 10000) return Math.round(m2) + " m²";
    return (m2 / 10000).toFixed(2).replace(".", ",") + " ha";
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

    // Sommets
    _pts.forEach(function (p, i) {
      L.circleMarker(p, {
        radius: 5, color: "#f4c542", fillColor: "#1a1f2e",
        fillOpacity: 1, weight: 2, interactive: false
      }).addTo(_layer);
      if (i === 0 && _pts.length >= 3) {
        // Le premier sommet se distingue : c'est lui qui ferme la surface.
        L.circleMarker(p, { radius: 8, color: "#f4c542", fill: false,
                            weight: 1, opacity: 0.5, interactive: false }).addTo(_layer);
      }
    });

    if (_pts.length >= 2) {
      L.polyline(_pts, { color: "#f4c542", weight: 3, opacity: 0.95,
                         interactive: false }).addTo(_layer);
      // Libellé au milieu de chaque segment — la longueur d'un tronçon est ce
      // qu'on vient chercher, pas seulement le total.
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
    // Fermeture visuelle en pointillés dès 3 points : la surface se lit alors
    // sans que l'utilisateur ait à revenir sur son premier point.
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
    let txt = "📏 " + _fmtD(_distanceTotale());
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
    // 🩸 Tout démonter, dans l'ordre inverse du montage. Un listener `click`
    // laissé sur la map continuerait d'ajouter des points invisibles, et le
    // curseur croix ferait croire que l'outil est encore armé.
    try { if (_map && _onClic) _map.off("click", _onClic); } catch (e) {}
    try { if (_map && _layer) _map.removeLayer(_layer); } catch (e) {}
    try { if (_map) _map.getContainer().style.cursor = ""; } catch (e) {}
    if (_floater && _floater.parentNode) _floater.remove();
    _layer = null; _floater = null; _onClic = null; _pts = [];
  }

  window.OsmMesure = {
    activer:    activer,
    desactiver: desactiver,
    estActif:   function () { return _actif; },
    // Exposés pour le harnais : ce sont eux qui portent la math.
    _distance:  function (pts) { _pts = pts; return _distanceTotale(); },
    _surface:   function (pts) { _pts = pts; return _surface(); }
  };
})();
