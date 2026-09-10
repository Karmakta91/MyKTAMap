/*!
 * Leaflet.ImageOverlay.Rotated — vendored for MyKTAMap v1.38.0
 *
 * Originally by Iván Sánchez Ortega <ivan@sanchezortega.es>
 * Source: https://github.com/IvanSanchez/Leaflet.ImageOverlay.Rotated
 * License: BSD 2-clause (compatible with MyKTAMap CC BY-NC-SA 4.0).
 *
 * Adapted/vendored minimaliste pour éviter une dépendance externe (PWA
 * 100% offline). Fonctionnellement identique : 3 coins (topleft, topright,
 * bottomleft) définissent un parallélogramme — le 4e coin est déduit
 * (bottomright = topright + bottomleft - topleft). Le rendu se fait via
 * CSS `transform: matrix(a,b,c,d,e,f)` sur l'élément <img> du layer.
 *
 * Usage :
 *   L.imageOverlay.rotated(url, topleftLatLng, topRightLatLng,
 *                          bottomLeftLatLng, { opacity: 0.4 }).addTo(map);
 *
 * Helper utilisé par js/imageLayerCalibration.js pour positionner les
 * image layers calibrés via 2 ancres.
 */

(function() {
  "use strict";
  if (typeof L === "undefined" || !L.ImageOverlay) {
    console.warn("[Leaflet.ImageOverlay.Rotated] Leaflet absent, plugin non chargé.");
    return;
  }

  L.ImageOverlay.Rotated = L.ImageOverlay.extend({

    initialize: function(image, topleft, topright, bottomleft, options) {
      if (typeof image === "string") {
        this._url = image;
      } else {
        // SVGImageElement ou HTMLImageElement déjà chargé
        this._rawImage = image;
      }
      this._topLeft     = L.latLng(topleft);
      this._topRight    = L.latLng(topright);
      this._bottomLeft  = L.latLng(bottomleft);

      L.setOptions(this, options);
    },

    onAdd: function(map) {
      if (!this._image) {
        this._initImage();
        if (this.options.opacity < 1) {
          this._updateOpacity();
        }
      }
      if (this.options.interactive) {
        L.DomUtil.addClass(this._rawImage, "leaflet-interactive");
        this.addInteractiveTarget(this._rawImage);
      }
      map.on("zoomend resetview", this._reset, this);
      this.getPane().appendChild(this._image);
      this._reset();
    },

    onRemove: function(map) {
      map.off("zoomend resetview", this._reset, this);
      L.ImageOverlay.prototype.onRemove.call(this, map);
    },

    _initImage: function() {
      var img;
      if (this._url) {
        img = L.DomUtil.create("img");
        img.style.display = "none";   // Hide while loading to avoid flash
        img.onselectstart = L.Util.falseFn;
        img.onmousemove   = L.Util.falseFn;
        var self = this;
        img.onload = function() {
          self._rawImage = img;
          img.style.display = "";
          self.fire("load");
          self._reset();
        };
        img.onerror = function() {
          console.warn("[Leaflet.ImageOverlay.Rotated] image load error :", self._url);
        };
        img.src = this._url;
      } else {
        img = this._rawImage;
      }
      L.DomUtil.addClass(img, "leaflet-image-layer");
      if (this._zoomAnimated) { L.DomUtil.addClass(img, "leaflet-zoom-animated"); }
      if (this.options.className) { L.DomUtil.addClass(img, this.options.className); }
      img.style.transformOrigin = "0 0";
      this._image = img;
    },

    /**
     * 🐛 v1.39.6 — Override _animateZoom pour éviter le crash.
     * Le parent L.ImageOverlay utilise this._bounds.getSouthWest() pour
     * animer fluidement le zoom (smooth transition CSS). Or notre plugin
     * Rotated n'utilise pas _bounds : on positionne via 3 coins
     * (topleft/topright/bottomleft) et une matrice transform.
     * Sans cet override, le parent crash avec :
     *   "Cannot read properties of undefined (reading 'getSouthWest')"
     * pendant le zoom + l'image reste à l'ancienne position jusqu'à
     * un click manuel qui force un refresh.
     * No-op = l'image se replace au bon endroit dès le zoomend (notre
     * _reset). Légère "disparition" pendant ~300ms du zoom mais le
     * comportement est correct (KARMA bug confirmé : "si je dezoom,
     * je dois cliquer une fois pour que cela ce recalibre").
     */
    _animateZoom: function(/* e */) {
      // intentionnellement no-op — _reset sur zoomend gère le repositionnement
    },

    _reset: function() {
      var map      = this._map;
      var image    = this._image;
      // 🐛 v1.90.13 (crash KARMA) — GARDE `!map`. L'`img.onload` (plus bas) est
      // asynchrone : il peut se déclencher APRÈS que la carte a été détruite
      // (re-mount du widget OSM de l'accueil = `_mapInstance.remove()`, qui met
      // `_map` à null sur les overlays). Sans ce garde, `map.latLngToLayerPoint`
      // levait « Cannot read properties of null ». La course était latente ;
      // sélectionner au retour home un plan dont l'image n'était pas en cache
      // (v1.90.12) l'a rendue reproductible.
      if (!map || !image || !this._rawImage) return;
      var topLeft     = map.latLngToLayerPoint(this._topLeft);
      var topRight    = map.latLngToLayerPoint(this._topRight);
      var bottomLeft  = map.latLngToLayerPoint(this._bottomLeft);
      var rawWidth    = this._rawImage.naturalWidth || this._rawImage.width || 1;
      var rawHeight   = this._rawImage.naturalHeight || this._rawImage.height || 1;

      // matrix(a, b, c, d, e, f) :
      //   newX = a*x + c*y + e
      //   newY = b*x + d*y + f
      var a = (topRight.x - topLeft.x) / rawWidth;
      var b = (topRight.y - topLeft.y) / rawWidth;
      var c = (bottomLeft.x - topLeft.x) / rawHeight;
      var d = (bottomLeft.y - topLeft.y) / rawHeight;
      var e = topLeft.x;
      var f = topLeft.y;

      L.DomUtil.setPosition(image, L.point(0, 0));
      image.style.transform = "matrix(" + a + "," + b + "," + c + "," + d + "," + e + "," + f + ")";
    },

    /**
     * Repositionne le layer avec 3 nouveaux coins (sans recharger l'image).
     * Utile pour live-preview du picker calibration.
     */
    reposition: function(topleft, topright, bottomleft) {
      this._topLeft    = L.latLng(topleft);
      this._topRight   = L.latLng(topright);
      this._bottomLeft = L.latLng(bottomleft);
      this._reset();
    },

    getBounds: function() {
      // Bounding box englobant les 4 coins (le 4e déduit)
      var bottomRight = L.latLng(
        this._topRight.lat + this._bottomLeft.lat - this._topLeft.lat,
        this._topRight.lng + this._bottomLeft.lng - this._topLeft.lng
      );
      return L.latLngBounds([this._topLeft, this._topRight, this._bottomLeft, bottomRight]);
    }
  });

  L.imageOverlay.rotated = function(imgSrc, topleft, topright, bottomleft, options) {
    return new L.ImageOverlay.Rotated(imgSrc, topleft, topright, bottomleft, options);
  };

  console.log("[Leaflet.ImageOverlay.Rotated] Plugin chargé (vendored).");
})();
