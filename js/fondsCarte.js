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
//   creerCouche, creditsMasques, masquerCredits, montrerCredits }.
// Crédit des données : la Vue OSM et le fond sous le plan montrent le contrôle d'attribution Leaflet, sans préfixe
//   (montrerCredits ; classe `kta-credits-carte` sur leur conteneur, le CSS global le masque partout ailleurs).
//   Case « Masquer les crédits des cartes » (Configuration de l'accueil › Affichage) : classe `kta-credits-masques`
//   sur <html>, retenue sur l'appareil (`myktamap_credits_cartes_masques_v1`), effet immédiat.
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
  const CLE_CREDITS = "myktamap_credits_cartes_masques_v1";
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

  // Couche Leaflet du fond `id` (Web Mercator), son crédit en option `attribution`. Fond IGN : une tuile en erreur
  // (404 hors couverture, réseau coupé) est redemandée une fois à OSM ; le crédit OSM s'ajoute tant qu'au moins une
  // tuile remplacée est affichée (comptée à la pose, décomptée au `tileunload`).
  // ⚠️ `ktaReplis` compte tous les remplacements depuis la création (lu par le pied de l'accueil) ; le crédit, lui,
  //   suit `_ktaReplisAffiches`.
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
          this._ktaCompterRepli(1);
          tile.src = urlTuile(OSM, this._getZoomForUrl(), tile._ktaCoords.x, tile._ktaCoords.y);
          return;
        }
        L.TileLayer.prototype._tileOnError.call(this, done, tile, e);
      },
      _ktaCompterRepli: function(delta) {
        this._ktaReplisAffiches = Math.max(0, (this._ktaReplisAffiches || 0) + delta);
        const ctrl = this._map && this._map.attributionControl;
        const voulu = this._ktaReplisAffiches > 0;
        if (!ctrl || voulu === !!this._ktaAttrOsm) return;
        if (voulu) ctrl.addAttribution(ATTR_OSM); else ctrl.removeAttribution(ATTR_OSM);
        this._ktaAttrOsm = voulu;
      },
      _ktaDecharge: function(e) { if (e.tile && e.tile._ktaRepli) this._ktaCompterRepli(-1); },
      onAdd: function(map) {
        this.on("tileunload", this._ktaDecharge, this);
        L.TileLayer.prototype.onAdd.call(this, map);
      },
      // 🩸 Le retrait décharge chaque tuile (tileunload) pendant que `_map` est encore posé : le crédit OSM part là ;
      //   la garde finale couvre une carte dont le contrôle aurait changé entre-temps.
      onRemove: function(map) {
        L.TileLayer.prototype.onRemove.call(this, map);
        this.off("tileunload", this._ktaDecharge, this);
        if (this._ktaAttrOsm && map && map.attributionControl) map.attributionControl.removeAttribution(ATTR_OSM);
        this._ktaAttrOsm = false;
        this._ktaReplisAffiches = 0;
      }
    });
    const c = new Couche(f.url, o);
    c.ktaFond = f.id;
    return c;
  }

  // ── Crédit des données des cartes ──────────
  function creditsMasques() {
    try { return localStorage.getItem(CLE_CREDITS) === "1"; } catch(e) { return false; }
  }
  function _appliquerCredits(masques) {
    if (document && document.documentElement) document.documentElement.classList.toggle("kta-credits-masques", masques);
  }
  function masquerCredits(masques) {
    const m = !!masques;
    try { localStorage.setItem(CLE_CREDITS, m ? "1" : "0"); } catch(e) { /* stockage bloqué : vaut pour la page */ }
    _appliquerCredits(m);
    try { window.dispatchEvent(new CustomEvent("kta:creditsCartesChange", { detail: { masques: m } })); } catch(e) {}
  }
  // Rend visible le contrôle d'attribution de `map` (le crée s'il manque), sans préfixe « Leaflet » : seul le crédit
  // des données compte. `actif` false le rend au masquage global. → le contrôle, ou null.
  function montrerCredits(map, actif) {
    if (!map || typeof L === "undefined") return null;
    let ctrl = map.attributionControl;
    if (!ctrl && actif) { ctrl = L.control.attribution(); ctrl.addTo(map); map.attributionControl = ctrl; }
    if (ctrl) ctrl.setPrefix(false);
    const cont = map.getContainer && map.getContainer();
    if (cont) cont.classList.toggle("kta-credits-carte", !!actif);
    return ctrl || null;
  }
  _appliquerCredits(creditsMasques());

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
    creerCouche: creerCouche,
    creditsMasques: creditsMasques,
    masquerCredits: masquerCredits,
    montrerCredits: montrerCredits
  };
})();
