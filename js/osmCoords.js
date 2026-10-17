/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * Site : https://myktamap.fr
 * Licence : CC BY-NC-SA 4.0 — Usage commercial interdit sans accord ecrit prealable.
 * Voir LICENSE a la racine du projet.
 */

// =====================================================================
// osmCoords.js — relever les coordonnées GPS DE SURFACE en Vue OSM
// =====================================================================
// Depuis un point du relevé souterrain, les coordonnées en surface juste au-dessus (pour une équipe qui
// arrive par le haut, retrouver un accès, un GPS tiers). Seulement en Vue OSM : la carte y EST géographique,
// `e.latlng` est déjà la coordonnée de surface (en mode plan, un clic donne des pixels à projeter).
// ⚠️ La coordonnée est EXACTE pour le point OSM cliqué ; « au-dessus de cette galerie » dépend du
// GÉORÉFÉRENCEMENT du plan qui la porte (un plan mal calé déplace ses galeries, pas la carte) — le panneau
// le rappelle (écart de calage des liaisons).
// 🔒 100 % local : aucun géocodeur, aucune requête.
// Expose window.OsmCoords : activer(map), desactiver(), estActif() ; exclusif avec window.OsmMesure (ils se
//   désarment mutuellement, cf activer).
// Doc : docs/architecture/vue-osm.md
// =====================================================================

(function () {
  "use strict";

  let _map     = null;
  let _actif   = false;
  let _layer   = null;    // le marqueur du point releve
  let _floater = null;
  let _onClic  = null;
  let _dernier = null;    // L.LatLng du dernier clic
  let _onResize = null;

  function _t(cle, p) {
    return (window.I18n && typeof window.I18n.t === "function") ? window.I18n.t(cle, p) : cle;
  }

  // Format des champs de géoréférencement, attendu au copier-coller : « 45.000000, 2.000000 ». Six
  // décimales ≈ 11 cm, bien au-delà de ce que le calage d'un plan souterrain peut honorer.
  function _fmt(lat, lng) {
    if (typeof window.formatGpsCoords === "function") {
      const s = window.formatGpsCoords(lat, lng);
      if (s) return s;
    }
    return lat.toFixed(6) + ", " + lng.toFixed(6);
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
  function _majPanneau() {
    if (!_floater) return;
    const info = _floater.querySelector(".kta-osm-coord-info");
    const btnC = _floater.querySelector("#kta-osm-coord-copy");
    if (!_dernier) {
      if (info) info.textContent = _t("osm.coords.invite");
      if (btnC) btnC.disabled = true;
      return;
    }
    if (info) info.textContent = _fmt(_dernier.lat, _dernier.lng);
    if (btnC) btnC.disabled = false;
  }

  function _poser(latlng) {
    _dernier = latlng;
    if (!_layer) return;
    _layer.clearLayers();
    // Une croix, pas une épingle : une POSITION relevée, pas un objet du plan (pas de confusion avec les POI).
    L.circleMarker(latlng, {
      radius: 7, color: "#f4c542", weight: 2,
      fillColor: "#f4c542", fillOpacity: 0.35
    }).addTo(_layer);
    L.circleMarker(latlng, {
      radius: 1.5, color: "#f4c542", weight: 3, fillOpacity: 1
    }).addTo(_layer);
    _majPanneau();
  }

  function _copier() {
    if (!_dernier) return;
    const txt = _fmt(_dernier.lat, _dernier.lng);
    const dire = function (ok) {
      const info = _floater && _floater.querySelector(".kta-osm-coord-info");
      if (!info) return;
      const avant = info.textContent;
      info.textContent = ok ? _t("osm.coords.copie") : _t("osm.coords.copieKo");
      setTimeout(function () { if (info) info.textContent = avant; }, 1400);
    };
    // utils.js : navigator.clipboard puis repli execCommand (http local, iframe, permission refusée).
    window.ktaCopierTexte(txt).then(dire);
  }

  function activer(map) {
    if (_actif) { desactiver(); return; }
    if (!map || typeof L === "undefined") return;
    // Les deux outils arment le même `click` : coexistants, chaque relevé poserait un point de mesure.
    try {
      if (window.OsmMesure && typeof window.OsmMesure.estActif === "function"
          && window.OsmMesure.estActif()) window.OsmMesure.desactiver();
    } catch (e) {}

    _map = map;
    _actif = true;
    _dernier = null;
    _layer = L.layerGroup().addTo(_map);

    _floater = document.createElement("div");
    _floater.id = "kta-osm-coord-floater";
    _floater.innerHTML =
      '<span class="kta-osm-coord-icone">🎯</span>' +
      '<span class="kta-osm-coord-info"></span>' +
      '<button type="button" class="kta-btn kta-btn-ghost kta-btn-small" id="kta-osm-coord-copy" disabled>' +
        _t("osm.coords.copier") + '</button>' +
      '<button type="button" class="kta-btn kta-btn-ghost kta-btn-small" id="kta-osm-coord-close">✕</button>';
    document.body.appendChild(_floater);
    _placer();
    _onResize = function () { _placer(); };
    try {
      window.addEventListener("resize", _onResize);
      window.addEventListener("orientationchange", _onResize);
    } catch (e) {}
    _floater.querySelector("#kta-osm-coord-copy").addEventListener("click", _copier);
    _floater.querySelector("#kta-osm-coord-close").addEventListener("click", desactiver);

    _onClic = function (e) { _poser(e.latlng); };
    _map.on("click", _onClic);
    try { _map.getContainer().style.cursor = "crosshair"; } catch (err) {}
    _majPanneau();
  }

  function desactiver() {
    if (!_actif) return;
    _actif = false;
    // Tout démonter, dans l'ordre inverse : un `click` laissé déplacerait un marqueur invisible, et le curseur
    // croix ferait croire l'outil armé.
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
    _layer = null; _floater = null; _onClic = null; _dernier = null;
  }

  window.OsmCoords = {
    activer:    activer,
    desactiver: desactiver,
    estActif:   function () { return _actif; },
    // Exposé pour le harnais : il porte le format de sortie.
    _format:    _fmt
  };
})();

console.log("[OsmCoords] Module charge — API window.OsmCoords prete");
