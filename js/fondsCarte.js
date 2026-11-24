/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * https://myktamap.fr — Licence CC BY-NC-SA 4.0
 * Usage commercial interdit sans accord ecrit prealable. Voir LICENSE.
 */

// =====================================================================
// fondsCarte.js — table UNIQUE des fonds de carte (OpenStreetMap, IGN aérien, IGN plan) et choix de l'appareil
// =====================================================================
// Lue par la Vue OSM (osmView.js), le fond sous le plan (fondOsmPlan.js) et le cache hors ligne (osmTilesCache.js) :
// aucune URL de tuile ne s'écrit ailleurs. Choix retenu sur l'appareil (localStorage `myktamap_fond_carte_v1`),
// partagé par les vues ; un changement émet `kta:fondCarteChange` { id }.
// Expose : window.KtaFondsCarte = { OSM, CLE, liste, fond, courant, choisir, estOsm, urlTuile, libelle,
//   creerCouche }.
// ⚠️ Hors couverture, l'IGN répond 404 : chaque tuile IGN manquante est remplacée par la tuile OSM (creerCouche,
//   fondOsmPlan.js > _imageOsm). Une seule règle, pas de polygone de couverture à tenir à jour.
// 🔒 Hors ligne = OpenStreetMap seul : les tuiles IGN ne sont jamais enregistrées (osmTilesCache.js) ni servies par
//   le service worker (sw.js laisse data.geopf.fr au réseau). Aucune requête sans la case Vue OSM, ni en incognito :
//   les vues appelantes gardent ces deux portes, la table n'émet rien.
// 🩸 Le serveur IGN sert la grille Web Mercator `PM` du zoom 0 au zoom 19 (GetCapabilities : PM_0_19) ; au-delà,
//   la tuile 19 est agrandie (maxNativeZoom), comme pour OSM.
// Doc : docs/architecture/vue-osm.md (Fonds de carte).

(function() {
  "use strict";

  const OSM = "osm";
  const CLE = "myktamap_fond_carte_v1";
  const IGN_WMTS = "https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&STYLE=normal" +
    "&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}";
  const ATTR_OSM = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" ' +
    'rel="noopener noreferrer">OpenStreetMap</a>';
  const ATTR_IGN = '&copy; <a href="https://cartes.gouv.fr/" target="_blank" rel="noopener noreferrer">IGN</a>' +
    ' – Géoplateforme';

  // ⚠️ Ordre = ordre des sélecteurs. `osm` reste le premier et le défaut.
  const FONDS = [
    { id: OSM, cle: "fondscarte.osm", url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png", zoomMax: 19,
      attribution: ATTR_OSM, domaine: "tile.openstreetmap.org", horsLigne: true },
    { id: "ign-aerien", cle: "fondscarte.ignAerien",
      url: IGN_WMTS + "&LAYER=ORTHOIMAGERY.ORTHOPHOTOS&FORMAT=image/jpeg", zoomMax: 19,
      attribution: ATTR_IGN, domaine: "data.geopf.fr", horsLigne: false },
    { id: "ign-plan", cle: "fondscarte.ignPlan",
      url: IGN_WMTS + "&LAYER=GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2&FORMAT=image/png", zoomMax: 19,
      attribution: ATTR_IGN, domaine: "data.geopf.fr", horsLigne: false }
  ];

  function _copie(f) { return Object.assign({}, f); }
  function fond(id) {
    for (const f of FONDS) if (f.id === id) return _copie(f);
    return _copie(FONDS[0]);
  }
  function liste() { return FONDS.map(_copie); }
  function _connu(id) { return FONDS.some(function(f) { return f.id === id; }); }

  // Choix de la page : il fait foi une fois posé, même si localStorage refuse l'écriture (navigation privée stricte).
  let _memoire = null;
  function courant() {
    if (_memoire) return fond(_memoire);
    let id = null;
    try { id = localStorage.getItem(CLE); } catch(e) { id = null; }
    return fond(_connu(id) ? id : OSM);
  }
  function choisir(id) {
    if (!_connu(id)) return false;
    const avant = courant().id;
    _memoire = id;
    try { localStorage.setItem(CLE, id); } catch(e) { /* stockage bloqué : le choix vaut pour la page */ }
    if (avant !== id) {
      try { window.dispatchEvent(new CustomEvent("kta:fondCarteChange", { detail: { id: id } })); } catch(e) {}
      console.log("[FondsCarte] fond choisi : " + id);
    }
    return true;
  }

  function estOsm(id) { return (id || courant().id) === OSM; }
  function urlTuile(id, z, x, y) {
    return fond(id).url.replace("{z}", z).replace("{x}", x).replace("{y}", y);
  }
  function libelle(id) {
    const f = fond(id);
    return (window.I18n && typeof window.I18n.t === "function") ? window.I18n.t(f.cle) : f.id;
  }

  // Couche Leaflet du fond `id` (Web Mercator). Fond IGN : une tuile en erreur (404 hors couverture, réseau coupé)
  // est redemandée une fois à OSM, et l'attribution OSM s'ajoute dès le premier remplacement.
  // ⚠️ `L` est lu à l'appel : ce module se charge avant que la page ait besoin d'une carte.
  function creerCouche(id, opts) {
    const f = fond(id);
    const o = Object.assign({ maxZoom: f.zoomMax, maxNativeZoom: f.zoomMax, attribution: f.attribution,
                              crossOrigin: true }, opts || {});
    if (f.id === OSM) return L.tileLayer(f.url, o);
    const Couche = L.TileLayer.extend({
      createTile: function(coords, done) {
        const tile = L.TileLayer.prototype.createTile.call(this, coords, done);
        tile._ktaCoords = coords;
        return tile;
      },
      _tileOnError: function(done, tile, e) {
        if (!tile._ktaRepli && tile._ktaCoords) {
          tile._ktaRepli = true;
          this.ktaReplis = (this.ktaReplis || 0) + 1;
          if (this.ktaReplis === 1 && this._map && this._map.attributionControl) {
            this._map.attributionControl.addAttribution(ATTR_OSM);
            this._ktaAttrOsm = true;
          }
          tile.src = urlTuile(OSM, this._getZoomForUrl(), tile._ktaCoords.x, tile._ktaCoords.y);
          return;
        }
        L.TileLayer.prototype._tileOnError.call(this, done, tile, e);
      },
      onRemove: function(map) {
        if (this._ktaAttrOsm && map && map.attributionControl) map.attributionControl.removeAttribution(ATTR_OSM);
        this._ktaAttrOsm = false;
        L.TileLayer.prototype.onRemove.call(this, map);
      }
    });
    const c = new Couche(f.url, o);
    c.ktaFond = f.id;
    return c;
  }

  window.KtaFondsCarte = {
    OSM: OSM,
    CLE: CLE,
    ATTR_OSM: ATTR_OSM,
    liste: liste,
    fond: fond,
    courant: courant,
    choisir: choisir,
    estOsm: estOsm,
    urlTuile: urlTuile,
    libelle: libelle,
    creerCouche: creerCouche
  };
})();
