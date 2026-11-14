/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * https://myktamap.fr — Licence CC BY-NC-SA 4.0
 * Usage commercial interdit sans accord ecrit prealable. Voir LICENSE.
 */

// =====================================================================
// fondOsmPlan.js — fond OpenStreetMap SOUS le plan, dans la carte du plan, et son petit panneau (bouton carte du haut)
// =====================================================================
// Une L.GridLayer en canvas dans le pane `ktaFondOsm` (sous `tilePane`) : chaque tuile de la carte du plan dessine
// les tuiles OSM qui la couvrent, posées par setTransform (affine des 3 coins de la tuile, calage
// KmzExport.buildTransformCalib → Web Mercator). Pas de seconde carte. La transparence est celle de l'image du plan
// (tilePane + overlays du fond), le fond OSM reste opaque. Panneau : interrupteur, transparence, « Ma position ».
// Quatrième commande : « Enregistrer hors ligne » (emprise du plan dans OsmTilesCache, même code que l'accueil).
// Expose : window.FondOsmPlan = { basculerPanneau, fermerPanneau, allumer, eteindre, maPosition, majBouton, regler,
//   enregistrerHorsLigne, retirer, transferer, PREFIXE, etat }.
// ⚠️ Interrupteur éteint à chaque plan ouvert ; transparence retenue PAR PLAN (décision produit) ; la fenêtre Vue
//   OSM ne s'ouvre plus du bouton.
// 🔒 Réseau : seulement tile.openstreetmap.org, OSM autorisé (OsmView.isOptedIn), hors incognito ; hors ligne, les
//   tuiles enregistrées (OsmTilesCache) et aucune requête. Au-delà du zoom 19 : la tuile 19 agrandie, rien de plus.
// 🔒 « Ma position » : un getCurrentPosition, refusé hors de l'emprise du plan (pad 0,5) et en incognito ; rien
//   de persisté ni d'envoyé. Le point vit en mémoire jusqu'au plan suivant.
// 🩸 Le pane doit tourner avec le plan orienté : créé DANS le pane de rotation s'il existe (sinon il y sera déplacé),
//   la couche s'inscrit dans `map._ktaGrillesSousRotation` pour que mapBearing la relance à chaque angle.
// 🩸 Coordonnées Mercator au zoom 19 ≈ 1e8 px : le canvas calcule en float32 ; tout se pose relatif au coin de la tuile.
// Exports PNG / PDF / KMZ : ils redessinent depuis les données, le fond n'y entre pas.
// Garde-fou : scripts/smoke/checkup-fond-osm.js · Doc : docs/architecture/vue-osm.md (Fond OSM sous le plan).

(function() {
  "use strict";

  const OSM_URL      = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
  const OSM_ZOOM_MAX = 19;
  const PANE         = "ktaFondOsm";
  const TUILE        = 256;            // côté CSS des tuiles de la couche (et des tuiles OSM)
  // 🩸 Chaque canvas déborde d'un pixel CSS à droite et en bas, avec son vrai contenu : sous rotation, le bord
  // anticrénelé de deux canvas voisins laissait voir le fond de la carte (liseré sombre en diagonale).
  const COTE         = TUILE + 1;
  const CACHE_RAM    = 48;             // images OSM décodées gardées (≈ 12 Mo)
  const CACHE_ANCETRES = 16;           // tuiles enregistrées d'un zoom plus large, agrandies hors ligne
  const REPLI_ZOOMS  = 6;              // hors ligne : jusqu'à 6 zooms plus larges (morceau ×64)
  const CLE_TRANSPARENCE = "myktamap_fond_osm_v1_";   // + planId : transparence retenue par plan
  const TRANSPARENCE_DEFAUT = 50;      // % de transparence de l'image du plan, fond allumé

  let _allume       = false;
  let _transparence = TRANSPARENCE_DEFAUT;
  let _carte        = null;            // carte où le fond a été allumé (la carte du plan change à chaque plan)
  let _couche       = null;
  let _transfo      = null;            // KmzExport.buildTransformCalib du géoréf effectif
  let _generation   = 0;               // jeton : un chargement d'une génération éteinte ne dessine plus
  let _panneau      = null;
  let _bouton       = null;
  let _attrib       = null;
  let _moi          = null;            // { marqueur, cercle } du dernier fix
  let _horsLigneDit = false;
  const _images     = new Map();       // "z/x/y" → Promise<{ img, sx, sy, cote }|null> (ordre = LRU)
  const _ancetres   = new Map();       // "z/x/y" → Promise<HTMLImageElement|null>, tuiles enregistrées seulement
  let _enregistrement = null;          // { fait, total } pendant « Enregistrer hors ligne », sinon null
  let _dernierEnregistrement = null;   // résultat du dernier enregistrement (diagnostic, lu par etat())
  const _enVol      = new Set();       // images réseau en cours (coupées à l'extinction)
  let _requetes     = 0;               // requêtes réseau lancées (diagnostic, lu par etat())

  function _t(cle, vars) { return window.I18n ? window.I18n.t(cle, vars) : cle; }
  function _toast(msg, type) {
    if (window.OOMGuard && typeof window.OOMGuard.showToast === "function") {
      window.OOMGuard.showToast(msg, type || "warn");
    }
    else if (typeof window.ktaAlerte === "function") window.ktaAlerte(msg);
  }
  function _incognito() {
    try { return !!(window.IncognitoMode && window.IncognitoMode.isActive && window.IncognitoMode.isActive()); }
    catch(e) { return false; }
  }
  function _osmAutorise() {
    return !!(window.OsmView && typeof window.OsmView.isOptedIn === "function" && window.OsmView.isOptedIn());
  }
  function _enLigne() { return typeof navigator === "undefined" || navigator.onLine !== false; }
  function _georef() {
    return (window.OsmView && typeof window.OsmView.getGeorefEffectif === "function")
      ? window.OsmView.getGeorefEffectif() : null;
  }
  // Raison pour laquelle le bouton est grisé, ou null.
  function _raisonIndispo() {
    if (!window.map || !window.PLAN_CONFIG) return "plan";
    if (!_georef()) return "georef";
    return null;
  }
  function _hauteurPlan() {
    const cfg = window.APP_CONFIG || {};
    return Number.isFinite(cfg.imageHeight) ? cfg.imageHeight : null;
  }

  // ── Projection ──────────
  function _mercator(lat, lng, z) {
    const s = TUILE * Math.pow(2, z);
    const phi = Math.max(-85.05112878, Math.min(85.05112878, lat)) * Math.PI / 180;
    return { x: (lng + 180) / 360 * s, y: (1 - Math.log(Math.tan(phi) + 1 / Math.cos(phi)) / Math.PI) / 2 * s };
  }
  // Point de la carte du plan (pixel projeté au zoom z) → GPS, via l'image du plan (convertCoord inversé).
  function _gpsDuPoint(map, pt, z, H) {
    const ll = map.unproject(pt, z);
    return window.KmzExport.planToGps(_transfo, ll.lng, H - ll.lat);
  }

  // Plan de dessin d'une tuile : zoom OSM, affine Mercator → canvas, tuiles OSM à poser. null si incalculable.
  function _planTuile(map, coords, N) {
    const H = _hauteurPlan();
    if (!_transfo || H == null) return null;
    const o = L.point(coords.x * TUILE, coords.y * TUILE);
    const g0 = _gpsDuPoint(map, o, coords.z, H);
    const g1 = _gpsDuPoint(map, o.add([COTE, 0]), coords.z, H);
    const g2 = _gpsDuPoint(map, o.add([0, COTE]), coords.z, H);
    if (!g0 || !g1 || !g2) return null;
    // zoom OSM dont un pixel vaut un pixel du canvas (arrondi), plafonné à 19 (agrandi au-delà)
    const a0 = _mercator(g0.lat, g0.lng, 0), b0 = _mercator(g1.lat, g1.lng, 0);
    const cote0 = Math.hypot(b0.x - a0.x, b0.y - a0.y);
    if (!(cote0 > 0)) return null;
    const z = Math.max(0, Math.min(OSM_ZOOM_MAX, Math.round(Math.log2(N / cote0))));
    const m0 = _mercator(g0.lat, g0.lng, z), m1 = _mercator(g1.lat, g1.lng, z), m2 = _mercator(g2.lat, g2.lng, z);
    const ax = m1.x - m0.x, ay = m1.y - m0.y, cx = m2.x - m0.x, cy = m2.y - m0.y;
    const det = ax * cy - cx * ay;
    if (!det) return null;
    // canvas (u, v) = N · inverse([a c]) · (M − m0) ; setTransform(a, b, c, d, e, f) : u = aX + cY + e, v = bX + dY + f
    const k = N / det;
    const matrice = [k * cy, -k * ay, -k * cx, k * ax];
    const xs = [0, ax, cx, ax + cx], ys = [0, ay, cy, ay + cy];
    const n = Math.pow(2, z);
    const tx0 = Math.floor((m0.x + Math.min.apply(null, xs)) / TUILE);
    const tx1 = Math.floor((m0.x + Math.max.apply(null, xs)) / TUILE);
    const ty0 = Math.max(0, Math.floor((m0.y + Math.min.apply(null, ys)) / TUILE));
    const ty1 = Math.min(n - 1, Math.floor((m0.y + Math.max.apply(null, ys)) / TUILE));
    const tuiles = [];
    for (let tx = tx0; tx <= tx1; tx++) {
      for (let ty = ty0; ty <= ty1; ty++) {
        tuiles.push({ z: z, x: ((tx % n) + n) % n, y: ty, dx: tx * TUILE - m0.x, dy: ty * TUILE - m0.y });
      }
    }
    // largeur d'un demi-pixel du canvas, en pixels Mercator : bande de recouvrement entre deux tuiles OSM
    const echelle = N / Math.hypot(ax, ay);
    return { z: z, matrice: matrice, tuiles: tuiles, recouvrement: 0.5 / echelle };
  }

  // ── Images OSM : cache enregistré, puis réseau si permis ──────────
  function _chargerImg(src, reseau) {
    return new Promise(function(res) {
      const img = new Image();
      img.decoding = "async";
      if (reseau) { img.crossOrigin = "anonymous"; _enVol.add(img); }
      img.onload = function() { _enVol.delete(img); res(img); };
      img.onerror = function() { _enVol.delete(img); res(null); };
      img.src = src;
    });
  }
  function _reseauPermis() { return _enLigne() && _osmAutorise() && !_incognito(); }
  // Tuile enregistrée (« Enregistrer hors ligne »), décodée ; null si absente.
  async function _imageEnregistree(z, x, y) {
    let blob = null;
    if (window.OsmTilesCache && typeof window.OsmTilesCache.getCachedTile === "function") {
      try { blob = await window.OsmTilesCache.getCachedTile(z, x, y); } catch(e) { blob = null; }
    }
    if (!blob) return null;
    const url = URL.createObjectURL(blob);
    const img = await _chargerImg(url, false);
    URL.revokeObjectURL(url);
    return img;
  }
  function _ancetre(z, x, y) {
    const cle = z + "/" + x + "/" + y;
    if (!_ancetres.has(cle)) {
      const p = _imageEnregistree(z, x, y);
      _ancetres.set(cle, p);
      while (_ancetres.size > CACHE_ANCETRES) _ancetres.delete(_ancetres.keys().next().value);
    }
    return _ancetres.get(cle);
  }
  // → { img, sx, sy, cote } : la tuile elle-même (cote 256), ou, sans réseau permis, le morceau d'une tuile
  // enregistrée d'un zoom plus large, agrandi. 🩸 « Enregistrer hors ligne » ne garde que 3 zooms autour de
  // l'emprise : sans ce repli, le fond hors ligne serait vide à tous les autres zooms.
  async function _imageOsm(z, x, y, gen) {
    const img = await _imageEnregistree(z, x, y);
    if (gen !== _generation) return null;
    if (img) return { img: img, sx: 0, sy: 0, cote: TUILE };
    if (_reseauPermis()) {
      _requetes++;
      const net = await _chargerImg(OSM_URL.replace("{z}", z).replace("{x}", x).replace("{y}", y), true);
      return net ? { img: net, sx: 0, sy: 0, cote: TUILE } : null;
    }
    for (let k = 1; k <= REPLI_ZOOMS && z - k >= 0; k++) {
      const a = await _ancetre(z - k, x >> k, y >> k);
      if (gen !== _generation) return null;
      if (a) {
        const cote = TUILE / Math.pow(2, k);
        return { img: a, sx: (x - ((x >> k) << k)) * cote, sy: (y - ((y >> k) << k)) * cote, cote: cote };
      }
    }
    return null;
  }
  function _image(z, x, y) {
    const cle = z + "/" + x + "/" + y;
    const deja = _images.get(cle);
    if (deja) { _images.delete(cle); _images.set(cle, deja); return deja; }
    const gen = _generation;
    const p = _imageOsm(z, x, y, gen).then(function(img) {
      // un échec n'est pas gardé : la même tuile se redemande au retour du réseau
      if (!img && _images.get(cle) === p) _images.delete(cle);
      return img;
    });
    _images.set(cle, p);
    while (_images.size > CACHE_RAM) _images.delete(_images.keys().next().value);
    return p;
  }

  // ── La couche ──────────
  // ⚠️ Canvas en pixels CSS, sans facteur d'écran (comme une couche de tuiles Leaflet ordinaire et la fenêtre
  // Vue OSM) : mesuré à 2× sur iPhone émulé, processeur ÷4 : 4 fois la mémoire des canvas, 9 à 12 images par
  // seconde de moins au glissé, pour une imagerie OSM qui n'existe pas plus fine.
  // Tuile OSM à sa place exacte, puis sa dernière colonne et sa dernière ligne étirées d'un demi-pixel du canvas.
  // 🩸 Sans ces bandes, l'anticrénelage des bords laisse un liseré entre deux tuiles OSM voisines quand le plan est
  // tourné par rapport au nord ; étirer la tuile entière l'aurait déplacée (jusqu'à un demi-pixel au bord opposé).
  function _poserTuile(ctx, src, t, plan) {
    const e = plan.recouvrement, c = src.cote, u = c / TUILE;   // u : un pixel de destination dans la source
    ctx.setTransform(plan.matrice[0], plan.matrice[1], plan.matrice[2], plan.matrice[3], 0, 0);
    ctx.drawImage(src.img, src.sx, src.sy, c, c, t.dx, t.dy, TUILE, TUILE);
    ctx.drawImage(src.img, src.sx + c - u, src.sy, u, c, t.dx + TUILE - 1, t.dy, 1 + e, TUILE + e);
    ctx.drawImage(src.img, src.sx, src.sy + c - u, c, u, t.dx, t.dy + TUILE - 1, TUILE + e, 1 + e);
  }

  const CoucheFondOsm = (typeof L !== "undefined" && L.GridLayer) ? L.GridLayer.extend({
    // 🩸 minZoom : 0 par défaut dans Leaflet, or la carte du plan descend sous zéro (dézoom) : sans lui, aucune tuile
    options: { tileSize: TUILE, pane: PANE, keepBuffer: 1, updateWhenZooming: false, minZoom: -20,
               className: "kta-fond-osm-tuiles" },
    _initTile: function(tile) {
      L.GridLayer.prototype._initTile.call(this, tile);
      tile.style.width = COTE + "px";
      tile.style.height = COTE + "px";
    },
    createTile: function(coords, done) {
      const N = COTE;
      const canvas = document.createElement("canvas");
      canvas.width = N; canvas.height = N;
      const plan = this._map ? _planTuile(this._map, coords, N) : null;
      if (!plan || !plan.tuiles.length) { setTimeout(function() { done(null, canvas); }, 0); return canvas; }
      const ctx = canvas.getContext("2d");
      const gen = _generation;
      let restant = plan.tuiles.length;
      plan.tuiles.forEach(function(t) {
        _image(t.z, t.x, t.y).then(function(img) {
          if (img && gen === _generation && canvas.width) _poserTuile(ctx, img, t, plan);
        }).then(function() {
          restant--;
          if (restant === 0) done(null, canvas);
        });
      });
      return canvas;
    },
    onAdd: function(map) {
      L.GridLayer.prototype.onAdd.call(this, map);
      const liste = map._ktaGrillesSousRotation || (map._ktaGrillesSousRotation = []);
      if (liste.indexOf(this) < 0) liste.push(this);
      this.on("tileunload", _libererCanvas);
    },
    onRemove: function(map) {
      const liste = map._ktaGrillesSousRotation;
      if (liste && liste.indexOf(this) >= 0) liste.splice(liste.indexOf(this), 1);
      L.GridLayer.prototype.onRemove.call(this, map);
      this.off("tileunload", _libererCanvas);
    }
  }) : null;
  // 🩸 iOS ne rend la mémoire d'un canvas retiré qu'à sa remise à 0 × 0.
  function _libererCanvas(e) { if (e && e.tile) { e.tile.width = 0; e.tile.height = 0; } }

  function _pane(map) {
    let p = map.getPane(PANE);
    if (p) return p;
    // ⚠️ dans le pane de rotation s'il existe déjà ; sinon dans le map-pane, que mapBearing déplacera dans le sien
    const rot = (map._ktaRotatePane && map._ktaRotatePane.parentNode) ? map._ktaRotatePane : undefined;
    p = map.createPane(PANE, rot);
    p.style.zIndex = "150";            // sous tilePane (200), où vivent les tuiles V2 du plan
    p.style.pointerEvents = "none";
    return p;
  }

  // Image du plan : tilePane (tuiles V2) et overlays du fond (rendu direct, tuiles V1, repli V2). 1 = opaque.
  function _opacitePlan(a) {
    const map = window.map;
    if (!map) return;
    const tp = map.getPane("tilePane");
    if (tp) tp.style.opacity = a >= 1 ? "" : String(a);
    const poser = function(l) { if (l && typeof l.setOpacity === "function") { try { l.setOpacity(a); } catch(e) {} } };
    (window._ktaBaseLayers || []).forEach(poser);
    (window._baseTiles || []).forEach(function(t) { poser(t && t.overlay); });
  }

  function _attribution(map, visible) {
    if (_attrib && _attrib.parentNode) _attrib.parentNode.removeChild(_attrib);
    _attrib = null;
    if (!visible || !map) return;
    const d = document.createElement("div");
    d.className = "kta-fond-osm-attrib";
    d.innerHTML = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" ' +
      'rel="noopener noreferrer">OpenStreetMap</a>';
    document.body.appendChild(d);
    _attrib = d;
  }

  // ── Allumer / éteindre ──────────
  function allumer() {
    if (_allume && _carte === window.map) return true;
    const raison = _raisonIndispo();
    if (raison) { _toast(_t("fondosm.indispo." + raison)); return false; }
    if (!_osmAutorise()) { window.ktaAlerte(_t("fondosm.refus.optin")); return false; }
    if (_incognito()) { _toast(_t("fondosm.refus.incognito")); return false; }
    if (!CoucheFondOsm || !window.KmzExport || typeof window.KmzExport.buildTransformCalib !== "function") return false;
    try { _transfo = window.KmzExport.buildTransformCalib(_georef()); }
    catch(e) {
      console.warn("[FondOsmPlan] calage inutilisable :", e);
      _toast(_t("fondosm.indispo.georef"));
      return false;
    }
    const map = window.map;
    _generation++;
    _pane(map);
    _couche = new CoucheFondOsm();
    _couche.addTo(map);
    _carte = map;
    _allume = true;
    _transparence = _lireTransparence();
    _opacitePlan(1 - _transparence / 100);
    _attribution(map, true);
    if (!_enLigne() && !_horsLigneDit) { _horsLigneDit = true; _toast(_t("fondosm.horsLigne")); }
    console.log("[FondOsmPlan] fond allumé");
    _majTout();
    return true;
  }

  function eteindre() {
    const etaitAllume = _allume;
    _allume = false;
    _generation++;
    if (_couche) {
      try { if (_couche._map) _couche._map.removeLayer(_couche); } catch(e) {}
      _couche = null;
    }
    _enVol.forEach(function(img) { img.onload = img.onerror = null; img.src = ""; });
    _enVol.clear();
    _images.clear();
    _ancetres.clear();
    if (_carte && _carte === window.map) _opacitePlan(1);
    _attribution(null, false);
    _carte = null;
    _transfo = null;
    if (etaitAllume) console.log("[FondOsmPlan] fond éteint");
    _majTout();
  }

  // Changement de plan : tout repart à zéro (fond éteint, transparence par défaut, point effacé).
  function _remiseAZero() {
    eteindre();
    _transparence = _lireTransparence();
    _horsLigneDit = false;
    _effacerMoi();
    fermerPanneau();
  }

  // ── « Ma position » ──────────
  function _effacerMoi() {
    if (!_moi) return;
    [_moi.marqueur, _moi.cercle].forEach(function(l) {
      try { if (l && l._map) l._map.removeLayer(l); } catch(e) {}
    });
    _moi = null;
  }
  function _couleurCharte(nom) {
    try { return getComputedStyle(document.documentElement).getPropertyValue(nom).trim() || null; }
    catch(e) { return null; }
  }
  function maPosition() {
    if (_incognito()) { _toast(_t("osm.gps.incognito.toast")); return; }
    if (!navigator.geolocation) { window.ktaAlerte(_t("osm.gps.unavailable"), { type: "erreur" }); return; }
    const g = _georef(), H = _hauteurPlan();
    if (!g || H == null || !window.map) { _toast(_t("fondosm.indispo.georef")); return; }
    const map = window.map;
    const btn = _panneau && _panneau.querySelector("[data-fond-osm='moi']");
    if (btn) btn.disabled = true;
    const rendre = function() { if (btn) btn.disabled = _incognito(); };
    navigator.geolocation.getCurrentPosition(function(pos) {
      rendre();
      if (window.map !== map) return;   // plan changé pendant l'attente
      const lat = pos.coords.latitude, lng = pos.coords.longitude, acc = pos.coords.accuracy || 0;
      const bbox = (window.OsmView && typeof window.OsmView.getPlanGpsBbox === "function")
        ? window.OsmView.getPlanGpsBbox() : null;
      // 🔒 au-delà de 50 % autour de l'emprise du plan : aucun point posé
      if (bbox && !bbox.pad(0.5).contains([lat, lng])) {
        const c = bbox.getCenter();
        const km = window.KmzExport.distanceM({ lat: lat, lng: lng }, { lat: c.lat, lng: c.lng }) / 1000;
        _toast(_t("osm.gps.outOfBounds", { dist: km.toFixed(1) }));
        console.log("[FondOsmPlan] position refusée : hors de l'emprise du plan");
        return;
      }
      let t;
      try { t = window.KmzExport.buildTransformCalib(g); } catch(e) { return; }
      const p = window.KmzExport.gpsToPlan(t, lat, lng);
      if (!p) return;
      const ll = L.latLng(H - p.y, p.x);
      _effacerMoi();
      const couleur = _couleurCharte("--kta-interaction");
      const cercle = (acc > 0 && t.metresParPixel > 0)
        ? L.circle(ll, { radius: acc / t.metresParPixel, color: couleur, weight: 1, fillColor: couleur,
                         fillOpacity: 0.12, interactive: false }).addTo(map)
        : null;
      const marqueur = L.marker(ll, {
        icon: L.divIcon({ className: "kta-fond-osm-moi", iconSize: [18, 18], iconAnchor: [9, 9] }),
        keyboard: false
      }).addTo(map);
      marqueur.bindPopup(
        '<b>' + window.ktaIcone("map-pin") + " " + window.ktaEsc(_t("osm.gps.popup.title")) + '</b><br>' +
        '<span class="kta-tx-muted">' + window.ktaEsc(_t("osm.gps.popup.accuracy", { acc: Math.round(acc) })) +
        '</span>'
      );
      _moi = { marqueur: marqueur, cercle: cercle };
      map.setView(ll, Math.max(map.getZoom(), 0));
    }, function(err) {
      rendre();
      let cle = "osm.gps.err.generic";
      if (err && err.code === 1) cle = "osm.gps.err.permission";
      else if (err && err.code === 2) cle = "osm.gps.err.unavailable";
      else if (err && err.code === 3) cle = "osm.gps.err.timeout";
      window.ktaAlerte(_t(cle), { type: "erreur" });
    }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 10000 });   // un fix de plus de 10 s : redemandé
  }

  // ── Panneau ancré au bouton ──────────
  function _construirePanneau() {
    const p = document.createElement("div");
    p.className = "kta-group-flyout kta-fond-osm-panneau";
    p.setAttribute("role", "dialog");
    p.setAttribute("aria-label", _t("fondosm.titre"));
    p.innerHTML =
      '<div class="kta-group-flyout-header">' +
        '<span class="kta-group-flyout-title">' + window.ktaIcone("map") + " " + window.ktaEsc(_t("fondosm.titre")) +
        '</span>' +
        '<button type="button" class="kta-group-flyout-close" data-fond-osm="fermer" aria-label="' +
          window.ktaEsc(_t("fondosm.fermer")) + '">' + window.ktaIcone("x") + '</button>' +
      '</div>' +
      '<button type="button" class="kta-group-flyout-btn" data-fond-osm="interrupteur" aria-pressed="false">' +
        '<span class="kta-group-flyout-btn-icon">' + window.ktaIcone("toggle-right") + '</span>' +
        '<span class="kta-group-flyout-btn-label">' + window.ktaEsc(_t("fondosm.interrupteur")) + '</span>' +
        '<span class="kta-fond-osm-etat" data-fond-osm="etat"></span>' +
      '</button>' +
      '<label class="kta-fond-osm-curseur">' +
        '<span>' + window.ktaIcone("blend") + " " + window.ktaEsc(_t("fondosm.transparence")) + '</span>' +
        '<input type="range" min="0" max="100" step="5" data-fond-osm="transparence">' +
        '<span class="kta-fond-osm-valeur" data-fond-osm="valeur"></span>' +
      '</label>' +
      '<button type="button" class="kta-group-flyout-btn" data-fond-osm="moi" title="' +
        window.ktaEsc(_t("fondosm.moi.title")) + '">' +
        '<span class="kta-group-flyout-btn-icon">' + window.ktaIcone("locate-fixed") + '</span>' +
        '<span class="kta-group-flyout-btn-label">' + window.ktaEsc(_t("fondosm.moi")) + '</span>' +
      '</button>' +
      '<button type="button" class="kta-group-flyout-btn" data-fond-osm="hors-ligne" title="' +
        window.ktaEsc(_t("fondosm.cache.title")) + '">' +
        '<span class="kta-group-flyout-btn-icon">' + window.ktaIcone("cloud-download") + '</span>' +
        '<span class="kta-group-flyout-btn-label">' + window.ktaEsc(_t("fondosm.cache")) + '</span>' +
        '<span class="kta-fond-osm-etat" data-fond-osm="hors-ligne-etat"></span>' +
      '</button>';
    p.addEventListener("click", function(e) {
      const cible = e.target.closest("[data-fond-osm]");
      if (!cible) return;
      const role = cible.getAttribute("data-fond-osm");
      if (role === "fermer") fermerPanneau();
      else if (role === "interrupteur") { if (_allume) eteindre(); else allumer(); }
      else if (role === "moi") maPosition();
      else if (role === "hors-ligne") enregistrerHorsLigne();
    });
    p.querySelector("[data-fond-osm='transparence']").addEventListener("input", function(e) {
      regler(parseInt(e.target.value, 10));
    });
    return p;
  }

  function _majPanneau() {
    if (!_panneau) return;
    const inter = _panneau.querySelector("[data-fond-osm='interrupteur']");
    inter.classList.toggle("kta-actif", _allume);
    inter.setAttribute("aria-pressed", _allume ? "true" : "false");
    _panneau.querySelector("[data-fond-osm='etat']").textContent = _t(_allume ? "fondosm.etat.on" : "fondosm.etat.off");
    const curseur = _panneau.querySelector("[data-fond-osm='transparence']");
    curseur.value = String(_transparence);
    curseur.disabled = !_allume;
    _panneau.querySelector("[data-fond-osm='valeur']").textContent = _transparence + " %";
    const moi = _panneau.querySelector("[data-fond-osm='moi']");
    moi.disabled = _incognito();
    const hl = _panneau.querySelector("[data-fond-osm='hors-ligne']");
    const raison = _raisonEnregistrement();
    hl.disabled = !!(raison || _enregistrement);
    hl.setAttribute("aria-busy", _enregistrement ? "true" : "false");
    _panneau.querySelector("[data-fond-osm='hors-ligne-etat']").textContent = _enregistrement
      ? _t("fondosm.cache.enCours", { fait: _enregistrement.fait, total: _enregistrement.total })
      : (raison ? _t("fondosm.cache.indispo." + raison) : "");
  }

  function _placerPanneau() {
    if (!_panneau || !_bouton) return;
    const r = _bouton.getBoundingClientRect();
    const vw = window.innerWidth;
    const largeur = Math.min(280, vw - 16);
    _panneau.style.width = largeur + "px";
    _panneau.style.top = Math.round(r.bottom + 6) + "px";
    _panneau.style.left = Math.round(Math.max(8, Math.min(vw - largeur - 8, r.right - largeur))) + "px";
    _panneau.style.maxHeight = Math.max(160, window.innerHeight - r.bottom - 20) + "px";
  }

  function _surClicDehors(e) {
    if (!_panneau) return;
    if (_panneau.contains(e.target) || (_bouton && _bouton.contains(e.target))) return;
    fermerPanneau();
  }
  function _surTouche(e) { if (e.key === "Escape") fermerPanneau(); }

  function basculerPanneau(bouton) {
    if (_panneau) { fermerPanneau(); return; }
    _bouton = bouton || _bouton;
    const raison = _raisonIndispo();
    if (raison) { _toast(_t("fondosm.indispo." + raison)); return; }
    if (!_allume) _transparence = _lireTransparence();
    _panneau = _construirePanneau();
    document.body.appendChild(_panneau);
    _majPanneau();
    _placerPanneau();
    document.addEventListener("pointerdown", _surClicDehors, true);
    document.addEventListener("keydown", _surTouche);
    window.addEventListener("resize", _placerPanneau);
    if (_bouton) _bouton.setAttribute("aria-expanded", "true");
  }

  // Ferme le panneau sans éteindre le fond.
  function fermerPanneau() {
    if (!_panneau) return;
    if (_panneau.parentNode) _panneau.parentNode.removeChild(_panneau);
    _panneau = null;
    document.removeEventListener("pointerdown", _surClicDehors, true);
    document.removeEventListener("keydown", _surTouche);
    window.removeEventListener("resize", _placerPanneau);
    if (_bouton) _bouton.setAttribute("aria-expanded", "false");
  }

  // Bouton du haut : grisé sans géoréf (raison au survol), état actif quand le fond est allumé.
  function majBouton(bouton) {
    if (bouton) _bouton = bouton;
    // carte remplacée sans événement (plan rechargé) : l'état du fond appartenait à l'ancienne
    if (_allume && _carte !== window.map) _remiseAZero();
    if (!_bouton) return;
    const raison = _raisonIndispo();
    _bouton.classList.toggle("kta-fond-osm-indispo", !!raison);
    _bouton.classList.toggle("kta-fond-osm-actif", _allume);
    _bouton.setAttribute("aria-disabled", raison ? "true" : "false");
    _bouton.setAttribute("aria-pressed", _allume ? "true" : "false");
    _bouton.title = raison ? _t("fondosm.indispo." + raison) : _t("fondosm.bouton.title");
  }
  function _majTout() { _majPanneau(); majBouton(); }

  // Transparence de l'image du plan, en % (0 = plan opaque).
  function regler(pourcent) {
    const v = Math.max(0, Math.min(100, Math.round(Number(pourcent) || 0)));
    _transparence = v;
    _ecrireTransparence(v);
    if (_allume) _opacitePlan(1 - v / 100);
    _majPanneau();
  }

  // ── Transparence retenue par plan (décision produit : l'interrupteur, lui, repart éteint) ──────────
  // localStorage `myktamap_fond_osm_v1_<planId>` = "0" à "100" ; absent ou illisible → 50.
  // ⚠️ Purgée et transférée avec les autres données du plan (planRegistry.js > purgeAssociatedData,
  // transferAssociatedData), exportée avec le profil (profileExportImport.js > PER_PLAN_PREFIXES).
  function _planCourant() { return window._currentLoadedPlanId || null; }
  function _lireTransparence() {
    const id = _planCourant();
    if (!id) return TRANSPARENCE_DEFAUT;
    try {
      const v = parseInt(localStorage.getItem(CLE_TRANSPARENCE + id), 10);
      return (v >= 0 && v <= 100) ? v : TRANSPARENCE_DEFAUT;
    } catch(e) { return TRANSPARENCE_DEFAUT; }
  }
  function _ecrireTransparence(v) {
    const id = _planCourant();
    if (!id) return;
    try { localStorage.setItem(CLE_TRANSPARENCE + id, String(v)); } catch(e) { /* stockage plein ou bloqué */ }
  }
  function retirer(planId) {
    if (!planId) return;
    try { localStorage.removeItem(CLE_TRANSPARENCE + planId); } catch(e) { /* rien */ }
  }
  function transferer(ancienId, nouveauId) {
    if (!ancienId || !nouveauId || ancienId === nouveauId) return;
    try {
      const v = localStorage.getItem(CLE_TRANSPARENCE + ancienId);
      if (v != null && localStorage.getItem(CLE_TRANSPARENCE + nouveauId) == null) {
        localStorage.setItem(CLE_TRANSPARENCE + nouveauId, v);
      }
      localStorage.removeItem(CLE_TRANSPARENCE + ancienId);
    } catch(e) { /* rien */ }
  }

  // ── « Enregistrer hors ligne » : l'emprise du plan dans le cache OSM partagé (OsmTilesCache) ──────────
  // Même garde que le bouton de la carte de l'accueil, plus OSM coupé et incognito : la commande est grisée
  // avec sa raison. Zoom : le plus fin où l'emprise tient sur 3 zooms sous le plafond de 200 tuiles.
  function _raisonEnregistrement() {
    if (!_osmAutorise()) return "optin";
    if (_incognito()) return "incognito";
    if (!_enLigne()) return "horsLigne";
    const bbox = (window.OsmView && typeof window.OsmView.getPlanGpsBbox === "function")
      ? window.OsmView.getPlanGpsBbox() : null;
    if (!bbox || !window.OsmTilesCache || typeof window.OsmTilesCache.cacheTilesForBbox !== "function") {
      return "georef";
    }
    return null;
  }
  function _recheckVueOsm() {
    try {
      if (window.OsmView && typeof window.OsmView.recheckOfflineCache === "function") {
        window.OsmView.recheckOfflineCache();
      }
    } catch(e) { /* rien */ }
  }
  async function enregistrerHorsLigne() {
    if (_enregistrement) return null;
    const raison = _raisonEnregistrement();
    if (raison) { _toast(_t("fondosm.cache.indispo." + raison)); return null; }
    const bbox = window.OsmView.getPlanGpsBbox();
    const z = window.OsmTilesCache.zoomPourBbox(bbox, 18);
    _enregistrement = { fait: 0, total: 0 };
    _majPanneau();
    let res = null;
    try {
      res = await window.OsmTilesCache.cacheTilesForBbox(bbox, z, {
        onProgress: function(fait, total) { _enregistrement = { fait: fait, total: total }; _majPanneau(); }
      });
      let msg = _t("osm_home.cache.cached", { cached: res.cached });
      if (res.skipped) msg += _t("osm_home.cache.skipped", { skipped: res.skipped });
      if (res.failed) msg += _t("osm_home.cache.failed", { failed: res.failed });
      if (res.capped) msg += _t("osm_home.cache.capped");
      _toast(msg, res.failed && !res.cached && !res.skipped ? "error" : "success");
      res.zoom = z;
    } catch(e) {
      _toast(_t("osm_home.cache.error", { err: (e && e.message) || String(e) }), "error");
    } finally {
      _enregistrement = null;
      _dernierEnregistrement = res;
      _majPanneau();
      _recheckVueOsm();
    }
    return res;
  }

  function etat() {
    return {
      disponible: !_raisonIndispo(), raison: _raisonIndispo(), allume: _allume, transparence: _transparence,
      imagesEnMemoire: _images.size, requetesReseau: _requetes, panneauOuvert: !!_panneau,
      position: _moi ? _moi.marqueur.getLatLng() : null,
      enregistrement: _enregistrement, dernierEnregistrement: _dernierEnregistrement,
      raisonEnregistrement: _raisonEnregistrement()
    };
  }

  // OSM coupé pendant que le fond est affiché : il s'éteint aussitôt (l'incognito est fixé pour la fenêtre).
  function _surRefus() {
    if (_allume && (!_osmAutorise() || _incognito())) eteindre();
    _majTout();
  }
  window.addEventListener("kta:osmOptInChange", _surRefus);
  window.addEventListener("online", _majPanneau);
  window.addEventListener("offline", _majPanneau);
  window.addEventListener("mktm:plan-ferme", _remiseAZero);
  window.addEventListener("mktm:plan-pret", function() { if (_carte !== window.map) _remiseAZero(); majBouton(); });

  window.FondOsmPlan = {
    basculerPanneau: basculerPanneau,
    fermerPanneau:   fermerPanneau,
    allumer:         allumer,
    eteindre:        eteindre,
    maPosition:      maPosition,
    majBouton:       majBouton,
    regler:          regler,
    enregistrerHorsLigne: enregistrerHorsLigne,
    retirer:         retirer,
    transferer:      transferer,
    PREFIXE:         CLE_TRANSPARENCE,
    etat:            etat
  };
})();
