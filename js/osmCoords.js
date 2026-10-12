/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * Site : https://myktamap.fr
 * Licence : CC BY-NC-SA 4.0 — Usage commercial interdit sans accord ecrit prealable.
 * Voir LICENSE a la racine du projet.
 */

// =====================================================================
// 🎯 osmCoords.js — relever les coordonnees GPS DE SURFACE en Vue OSM
// =====================================================================
// LE BESOIN (KARMA, 05/09/2026) : savoir, depuis un point du releve souterrain,
// QUELLES SONT LES COORDONNEES EN SURFACE juste au-dessus. C'est ce qu'on donne
// a une equipe qui arrive par le haut, ce qu'on note pour retrouver un acces,
// et ce qu'on colle dans un GPS ou une carte tierce.
//
// 🎯 POURQUOI CET OUTIL N'EXISTE QUE DANS LA VUE OSM, ET POURQUOI C'EST JUSTE :
// en mode plan, un clic donne des PIXELS ; il faudrait les projeter par le
// georeferencement pour obtenir du GPS. En Vue OSM, la carte EST geographique —
// `e.latlng` est deja la coordonnee de surface, sans conversion, sans echelle,
// sans calibrage. Le meme raisonnement que `osmMesure.js` : ce qui est penible
// en mode plan est trivial ici, parce qu'on a change d'espace.
//
// ⚠️ CE QUE L'OUTIL NE PROMET PAS. La coordonnee lue est EXACTE pour le point
// de la carte OSM ou tu cliques. Mais si tu cliques sur une galerie, la
// justesse de « au-dessus de cette galerie » depend du GEOREFERENCEMENT du plan
// qui la porte — un plan mal cale deplace ses galeries, pas la carte. La Vue
// OSM sait d'ailleurs chiffrer ce defaut : c'est l'ecart de calage des liaisons
// (v1.81.0). Le panneau le rappelle plutot que de laisser croire a une precision
// qu'on n'a pas.
//
// 100 % local : aucun geocodeur, aucune requete. On lit une coordonnee que la
// carte connait deja.
//
// API : window.OsmCoords = { activer(map), desactiver(), estActif() };
// Meme forme que `window.OsmMesure` — les deux outils sont exclusifs l'un de
// l'autre et se desarment mutuellement (cf. `activer`).
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

  // Le format d'affichage du projet, celui des champs de georeferencement :
  // « 44.700800, -0.379040 ». Six decimales = ~11 cm, largement au-dela de ce
  // que le calage d'un plan souterrain peut honorer, mais c'est le format que
  // les autres outils attendent au copier-coller.
  function _fmt(lat, lng) {
    if (typeof window.formatGpsCoords === "function") {
      const s = window.formatGpsCoords(lat, lng);
      if (s) return s;
    }
    return lat.toFixed(6) + ", " + lng.toFixed(6);
  }


  // 📌 Place le bandeau EN HAUT DE LA CARTE, centre — pas en haut de la
  // FENETRE : en mode plan la barre d'outils occupe ce haut-la, et un `top`
  // fixe recouvrirait ses boutons. Le conteneur Leaflet, lui, sait ou il
  // commence. Rappele au resize et a la rotation, sinon le bandeau reste ou
  // la carte etait.
  function _placer() {
    if (!_floater || !_map) return;
    try {
      const r = _map.getContainer().getBoundingClientRect();
      if (!r || !r.width) return;
      // 🩸 Bride sur la CARTE, pas sur la fenetre : en mode plan la carte
      // n occupe pas toute la largeur, et un `max-width: 100vw` du CSS
      // laisserait le bandeau deborder de son cadre (KARMA, mobile).
      _floater.style.maxWidth = Math.max(180, Math.round(r.width - 24)) + "px";
      // Puis on CENTRE sur la carte en restant dedans : si le bandeau est
      // plus large que la moitie, un centrage nu le ferait sortir d un cote.
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
    // Une croix plutot qu'une epingle : le point releve est une POSITION, pas
    // un objet du plan — il ne doit pas se confondre avec les POI.
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
    // Helper commun (utils.js) : `navigator.clipboard` puis repli `execCommand`
    // (http local, iframe, permission refusee).
    window.ktaCopierTexte(txt).then(dire);
  }

  function activer(map) {
    if (_actif) { desactiver(); return; }
    if (!map || typeof L === "undefined") return;
    // Les deux outils arment le meme evenement `click` : les laisser coexister
    // ferait poser un point de mesure a chaque releve de coordonnee.
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
    // Tout demonter, dans l'ordre inverse du montage. Un listener `click`
    // laisse sur la map continuerait de deplacer un marqueur invisible, et le
    // curseur croix ferait croire que l'outil est encore arme.
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
    // Expose pour le harnais : c'est lui qui porte le format de sortie.
    _format:    _fmt
  };
})();

console.log("[OsmCoords] Module charge — API window.OsmCoords prete");
