/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * Site : https://myktamap.fr
 * Licence : CC BY-NC-SA 4.0 — Usage commercial interdit sans accord ecrit prealable.
 * Voir LICENSE a la racine du projet.
 */

// =========================
// MAP-BEARING — rotation d'une vue Leaflet : plan orienté (cap du téléphone) et rotation manuelle (deux doigts)
// =========================
// Une instance par carte (`_creerRotation`). `window.MapBearing` sert la carte du plan (cap + manuel, lit `window.map`,
// remplacée à chaque plan) ; `MapBearing.creerRotationManuelle({ carte })` fabrique une rotation manuelle seule pour
// une autre carte (cartes OSM). Manuel : deux doigts au-delà de SEUIL_ROTATION, Maj + molette, bouton nord. Plan : le
// cap reprend la main dès qu'il arrive, un outil armé ou un mode plein écran redresse la vue.
// 🩸 La rotation vit sur un pane INTERCALAIRE (`.kta-rotate-pane`, entre le map-pane et ses enfants), JAMAIS sur le
//   map-pane : Leaflet le positionne en `transform: translate3d`, une rotation y ferait pivoter la translation.
// ⚠️ `transform-origin` est en layerPoint : il DÉRIVE à chaque pan/zoom → réappliqué sur move/zoom.
// ⚠️ Plan : un pane de `map.createPane()` atterrit HORS rotation, le créer dans `window._ktaRotatePane`. Autre
//   carte : les panes ajoutés au map-pane sont adoptés. Toute contre-rotation se pose sur un ENFANT.
// Tournent : fond, tuiles, vecteurs, icônes POI (décision produit). Restent droits : contrôles, labels de mesure,
//   popups (contre-rotation CSS `--kta-bearing`). Clics : seul `mouseEventToContainerPoint` est patché, par carte
//   (`map._ktaRotation`). Pan : refait à la main sous rotation (le drag Leaflet partirait de travers).
// 🩸 Autre carte : une GridLayer (tuiles OSM) ne charge que l'écran droit, coins blancs une fois tourné → zone
//   élargie au rectangle tourné (_installerPatchGrilles). Div du plan PERSISTANT : écouteurs = fonctions d'instance.
// Expose window.MapBearing · Garde-fou : scripts/check-map-listeners.js · Doc : docs/architecture/tracking.md
// =========================

(function() {
  "use strict";

  // Préférence d'appareil (pas de plan) → localStorage direct, comme WakeLock.
  const LS_KEY = "myktamap_map_bearing_v1";

  // Lissage VOLONTAIREMENT plus mou que l'icône tracker (α=0.25) : un plan entier qui frémit donne la nausée.
  const ALPHA       = 0.12;   // lissage exponentiel du cap
  const VITESSE_MAX = 90;     // °/s — plafond de vitesse de rotation
  const REPOS       = 0.15;   // ° — en deçà, la boucle d'animation s'arrête

  // 🩸 DEUX SEUILS, SURTOUT PAS DE GEL : figer la vue sans pas détecté bloque la carte pendant qu'on tourne
  // sur place pour se réorienter (le cas le plus fréquent). On suit TOUJOURS, avec un seuil plus haut à
  // l'arrêt : une réorientation volontaire (≫ 15°) passe, le frémissement du magnétomètre non.
  const SEUIL_MARCHE = 2;     // ° — en marche, on suit de près
  const SEUIL_ARRET  = 15;    // ° — à l'arrêt, il faut une vraie intention
  const MARCHE_MS    = 2500;  // ms depuis le dernier pas → on se dit « en marche »

  // Rotation manuelle. Un pincement fait tourner la droite entre les doigts de quelques degrés : en deçà du seuil,
  // seul le zoom de Leaflet agit. Au-delà, la vue suit les doigts SANS rattraper le seuil (aucun saut).
  const SEUIL_ROTATION  = 15;    // ° d'angle entre les doigts avant que la vue tourne
  const SNAP_NORD       = 3;     // ° — un geste qui finit à moins de ça du nord redresse la carte
  const NORD_MS         = 300;   // ms — retour animé du bouton nord
  const SURVEILLANCE_MS = 250;   // ms — relecture des outils armés pendant une rotation manuelle
  const MOLETTE_DEG     = 0.15;  // ° par pixel de molette (Maj + molette)

  // 🩸 Pas de marge scalaire pour « le viewport tourné déborde son rectangle » : la bonne valeur dépend du
  // FORMAT de l'écran ((grand côté / petit côté − 1)/2 : 0,19 en paysage de bureau, 0,58 sur un iPhone en
  // portrait), une constante laisse des bords jamais peints et des POI effacés le long des bords.
  // `zoneVisible` rend la boîte englobante des QUATRE COINS RÉELS : exacte et moins chère. Hors rotation,
  // elle rend `map.getBounds()` au bit près (appelants : road.js, utils.js).

  // ── Conversions écran ↔ carte ──
  // Leaflet convertit un point écran sans connaître la rotation (jusqu'à 200 px d'écart à 90°).
  // 🩸 ON NE PATCHE QUE `mouseEventToContainerPoint`, point d'ENTRÉE des gestes. Pas
  // `containerPointToLayerPoint` : `L.Renderer._update()` s'en sert pour le coin de son canvas, qui
  // tournerait au lieu de s'agrandir (coins de l'écran plus peints). Tout ce qui lit un geste en dérive
  // (mouseEventToLayerPoint/LatLng, hit-test canvas, map.on("click"), pinch-zoom).
  // ⚠️ Posé sur le PROTOTYPE, donc vu par toutes les cartes : il rend exactement Leaflet pour une carte sans
  // instance de rotation (`map._ktaRotation`, posé par attachTo) ou à angle nul.
  let _patchPose = false;
  function _installerPatchConversions() {
    if (_patchPose) return;
    if (typeof L === "undefined" || !L.Map || !L.Map.prototype) return;
    _patchPose = true;
    const proto = L.Map.prototype;
    const origine = proto.mouseEventToContainerPoint;

    proto.mouseEventToContainerPoint = function(e) {
      const p = origine.call(this, e);
      const rot = this._ktaRotation;
      const deg = rot ? rot.angle() : 0;
      if (Math.abs(deg) <= 0.01) return p;
      // On défait la rotation : le point tel que Leaflet l'attend dans une carte droite.
      const c = this.getSize().divideBy(2);
      const a = -deg * Math.PI / 180;
      const dx = p.x - c.x, dy = p.y - c.y;
      return L.point(dx * Math.cos(a) - dy * Math.sin(a) + c.x,
                     dx * Math.sin(a) + dy * Math.cos(a) + c.y);
    };

    console.log("[MapBearing] Gestes adaptés à la rotation");
  }

  // ── Tuiles d'une GridLayer ──
  // Une GridLayer (tuiles OSM) ne demande que les tuiles du rectangle DROIT de l'écran : tournée, les coins restent
  // blancs. Pour une carte qui le demande (`rot.grilles`, pas la carte du plan : ses tuiles sont des imageOverlay
  // retirées par tiling.js), la zone devient la boîte englobante du rectangle tourné ; l'instance relance `_update`
  // des grilles quand l'angle change (aucun moveend ne vient).
  let _patchGrillesPose = false;
  function _installerPatchGrilles() {
    if (_patchGrillesPose) return;
    if (typeof L === "undefined" || !L.GridLayer || !L.GridLayer.prototype._getTiledPixelBounds) return;
    _patchGrillesPose = true;
    const proto = L.GridLayer.prototype;
    const origine = proto._getTiledPixelBounds;
    proto._getTiledPixelBounds = function(center) {
      const b = origine.call(this, center);
      const rot = this._map && this._map._ktaRotation;
      const deg = (rot && rot.grilles) ? rot.angle() : 0;
      if (Math.abs(deg) <= 0.01) return b;
      const a = deg * Math.PI / 180;
      const cos = Math.abs(Math.cos(a)), sin = Math.abs(Math.sin(a));
      const t = b.getSize(), c = b.getCenter();
      const demiL = (t.x * cos + t.y * sin) / 2, demiH = (t.x * sin + t.y * cos) / 2;
      return L.bounds(L.point(c.x - demiL, c.y - demiH), L.point(c.x + demiL, c.y + demiH));
    };
  }

  // ── Instance ──
  // cfg.carte() rend la carte servie (relue à chaque appel : la carte du plan change à chaque plan).
  // cfg.plan = true pour la seule carte du plan : cap, préférence, `window._ktaRotatePane`, tuiles V2 du plan,
  // outils armés et modes plein écran qui redressent, bouton « recentrer ». Sinon : rotation manuelle seule,
  // cfg.apresRotation() appelé à chaque angle posé, cfg.bloque() (facultatif) refuse le geste.
  // Corps NON réindenté : il garde l'historique Git (blame, fusions) du code de la carte du plan.
  function _creerRotation(cfg) {
  const _carte = cfg.carte;
  const _plan = !!cfg.plan;

  let _enabled    = false;   // choix utilisateur (persisté)
  const _suspensions = new Set();   // raisons actives — cf suspend()/resume()
  let _bearing    = 0;       // angle réellement appliqué (deg)
  let _cible      = 0;       // angle visé (deg)
  let _source     = null;    // qui tient l'angle : null (vue droite) · "manuel" (doigts, molette) · "cap" (plan orienté)
  let _capLisse   = null;    // cap lissé (deg, [0,360[)
  let _dernierPas = 0;       // horodatage du dernier pas (marche / arrêt)
  let _suiviArme  = true;    // le recentrage suit-il le tracker ?
  let _rafId      = null;
  let _dernierTick= 0;
  let _btnRecentrer = null;
  let _interactionsSauvees = null;

  function _lireEnabled() {
    try { return localStorage.getItem(LS_KEY) === "1"; } catch(e) { return false; }
  }

  function _t(cle, repli) {
    if (!window.I18n) return repli;
    const v = window.I18n.t(cle);
    return (v && v !== cle) ? v : repli;
  }

  // ── Angles ──
  function _norm(deg)  { return ((deg % 360) + 360) % 360; }
  function _delta(a, b) {            // écart signé le plus court de a vers b
    let d = _norm(b) - _norm(a);
    if (d > 180)  d -= 360;
    if (d < -180) d += 360;
    return d;
  }
  function _tournee() { return Math.abs(_delta(0, _bearing)) > 0.01; }

  // ── Pane de rotation ──
  // Créé une fois par instance de carte. 🩸 Garde portée PAR LA MAP (`map._ktaRotatePane`), jamais par
  // `window` : la carte est remplacée à chaque plan, un drapeau global dirait « déjà fait » à tort
  // (cf scripts/check-map-listeners.js).
  function _pane(map) {
    if (!map || typeof map.getPane !== "function") return null;
    if (map._ktaRotatePane && map._ktaRotatePane.parentNode) {
      if (!_plan) _adopterPanes(map, map._ktaRotatePane);
      return map._ktaRotatePane;
    }
    const mapPane = map.getPane("mapPane");
    if (!mapPane) return null;
    const rot = document.createElement("div");
    rot.className = "kta-rotate-pane";
    while (mapPane.firstChild) rot.appendChild(mapPane.firstChild);
    mapPane.appendChild(rot);
    map._ktaRotatePane = rot;
    if (_plan) window._ktaRotatePane = rot;   // pour un futur pane qui devrait tourner
    console.log("[MapBearing] Pane de rotation en place");
    return rot;
  }

  // Hors carte du plan, aucun module ne connaît le pane de rotation : un pane créé après lui (ou un renderer posé
  // dans le map-pane) rejoint la rotation à l'angle suivant.
  function _adopterPanes(map, rot) {
    const mapPane = map.getPane("mapPane");
    if (!mapPane || mapPane.childNodes.length < 2) return;
    Array.from(mapPane.childNodes).forEach(function(n) { if (n !== rot) rot.appendChild(n); });
  }

  // Recalcule l'origine (elle dérive à chaque pan/zoom) et pose l'angle.
  function _appliquer() {
    const map = _carte();
    if (!map) return;
    const rot = _pane(map);
    if (!rot) return;
    let o;
    try { o = map.containerPointToLayerPoint(map.getSize().divideBy(2)); }
    catch(e) { return; }
    rot.style.transformOrigin = o.x + "px " + o.y + "px";
    // `transform` classique (pas la propriété `rotate`) : ce pane n'a aucun transform Leaflet, et les
    // anciens Safari suivent.
    rot.style.transform = _bearing ? ("rotate(" + _bearing + "deg)") : "";
    const cont = map.getContainer();
    if (cont) {
      cont.style.setProperty("--kta-bearing", _bearing + "deg");
      cont.classList.toggle("kta-bearing-on", _tournee());
    }
    _cullerTuilesThrottle();
    _cullerObjetsThrottle();
  }
  // Exposé au même titre que suspend/resume. Idempotent.
  function reappliquer() { _appliquer(); }

  // ── Boucle d'animation ──
  // En JS plutôt qu'en transition CSS : une transition désynchroniserait l'angle affiché des positions
  // calculées par Leaflet, et on perdrait le plafond de vitesse.
  function _boucle(ts) {
    _rafId = null;
    const dt = _dernierTick ? Math.min((ts - _dernierTick) / 1000, 0.1) : 0.016;
    _dernierTick = ts;
    const ecart = _delta(_bearing, _cible);
    if (Math.abs(ecart) < REPOS) {
      _bearing = _norm(_cible);
      _appliquer();
      _dernierTick = 0;
      return;
    }
    const pasMax = VITESSE_MAX * dt;
    _bearing = _norm(_bearing + Math.max(-pasMax, Math.min(pasMax, ecart)));
    _appliquer();
    _rafId = requestAnimationFrame(_boucle);
  }

  // `prefers-reduced-motion` relu à chaque fois (modifiable sans recharger) : la vue se pose directement au
  // bon angle — elle tourne toujours (c'est le but du mode), sans mouvement continu.
  function _mouvementReduit() {
    try { return !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches); }
    catch(e) { return false; }
  }

  function _animer() {
    if (_mouvementReduit()) {
      _stopAnim();
      _bearing = _norm(_cible);
      _appliquer();
      return;
    }
    if (_rafId !== null) return;
    _dernierTick = 0;
    _rafId = requestAnimationFrame(_boucle);
  }

  function _stopAnim() {
    if (_rafId !== null) { cancelAnimationFrame(_rafId); _rafId = null; }
    _dernierTick = 0;
  }

  // ── Interactions ──
  // On verrouille le drag DE LEAFLET (pas le pan) : il partirait de travers de l'angle courant ; le pan
  // est refait à la main (_panDebut…). Verrouillé = `_interactionsSauvees` non nul.
  function _verrouiller(map) {
    if (!map || _interactionsSauvees) return;
    _interactionsSauvees = { dragging: map.dragging && map.dragging.enabled() };
    try { if (map.dragging) map.dragging.disable(); } catch(e) {}
    // 🩸 `dragging.disable()` retire `leaflet-touch-drag` : le conteneur retombe en
    // `touch-action: pan-x pan-y` et le NAVIGATEUR scrollerait la page. La classe ci-dessous rend
    // `touch-action: none` (cf style.css).
    const cont0 = map.getContainer();
    if (cont0) cont0.classList.add("kta-bearing-lock");
    // Leviers d'allègement (plan lourd laissé en automatique, case cochée), puis canvas élargi sous son budget.
    _renfort(true);
    _majPaddingRenderer(map, true);
    // 🩸 On ne touche PAS aux options de zoom (pas de "center") : forcer le zoom au centre fait glisser
    // toute la carte quand on pince ailleurs. Avec `mouseEventToContainerPoint` patché, Leaflet zoome entre
    // les doigts avec les bons points. Les vecteurs restent cliquables (cf _installerPatchConversions).
  }

  function _deverrouiller(map) {
    _renfort(false);
    if (!map || !_interactionsSauvees) { _interactionsSauvees = null; return; }
    try { if (map.dragging && _interactionsSauvees.dragging) map.dragging.enable(); } catch(e) {}
    const cont1 = map.getContainer();
    if (cont1) cont1.classList.remove("kta-bearing-lock");
    _majPaddingRenderer(map, false);
    _interactionsSauvees = null;
  }

  // ── Pan manuel ──
  // Plutôt que patcher `L.Draggable` (partagé par poignées, marqueurs déplaçables, autres cartes), le drag
  // Leaflet reste DÉSACTIVÉ pendant la rotation et on fait le pan dans le bon repère. Minimal : un doigt, pas
  // d'inertie ; deux doigts → pinch-zoom de Leaflet (et rotation manuelle).
  const _panDoigts = new Set();
  let _panDepart = null, _panEngage = false, _panCentreAvant = null;

  // 🩸 Un doigt dont la fin n'est jamais vue (lâcher hors de la carte, appui long d'un autre module, appli repliée)
  // resterait compté : chaque doigt suivant passerait pour le 2e d'un pinch et la carte tournée ne se déplacerait
  // plus d'un doigt (seul le retour au nord, qui rend le drag de Leaflet, la libère). D'où : un appui primaire
  // (aucun autre doigt posé, ou la souris) repart de zéro, la fin se lit sur window, l'oubli au repli de l'appli.
  function _panOublier() {
    _panDoigts.clear();
    _panDepart = null; _panEngage = false; _panCentreAvant = null;
  }

  function _panDebut(e) {
    const map = _carte();
    if (e.isPrimary) _panOublier();
    _panDoigts.add(e.pointerId);
    if (_panDoigts.size > 1) {
      // 🩸 Un pinch commence mal : le premier doigt bouge avant la pose du second, notre pan s'engage et
      // déplace la carte avant que Leaflet ne voie le geste à deux doigts. On rend ce qu'on a pris : le
      // pinch travaille sur la vue d'origine.
      if (_panEngage && _panCentreAvant && map) {
        try { map.setView(_panCentreAvant, map.getZoom(), { animate: false }); } catch(err) {}
      }
      _panDepart = null; _panEngage = false; _panCentreAvant = null;
      return;
    }
    if (!_interactionsSauvees || !map) { _panDepart = null; return; }
    _panDepart = { x: e.clientX, y: e.clientY };
    _panCentreAvant = map.getCenter();
  }

  function _panSuivre(e) {
    const map = _carte();
    if (!_panDepart || !_interactionsSauvees || !map || _panDoigts.size > 1) return;
    const dx = e.clientX - _panDepart.x, dy = e.clientY - _panDepart.y;
    // Seuil d'engagement : un tap ne doit pas devenir un pan (clic volé aux marqueurs).
    if (!_panEngage && Math.hypot(dx, dy) < 6) return;
    _panEngage = true;
    _panDepart = { x: e.clientX, y: e.clientY };
    // Doigt en coordonnées ÉCRAN, carte en coordonnées de calque : rotation défaite.
    const a = -_bearing * Math.PI / 180;
    const px = dx * Math.cos(a) - dy * Math.sin(a);
    const py = dx * Math.sin(a) + dy * Math.cos(a);
    try {
      map.panBy([-px, -py], { animate: false });
      // 🩸 `panBy({animate:false})` passe par `_rawPanBy`, qui NE borne PAS le centre : la vue sortait des
      // `maxBounds` et le zoom suivant la ramenait d'un coup (« au zoom, tout se décale »). Contrainte
      // appliquée en continu, comme le drag natif.
      if (map.options.maxBounds) map.panInsideBounds(map.options.maxBounds, { animate: false });
    } catch(err) {}
    if (_suiviArme && _trackingActif()) { _suiviArme = false; _majBoutonRecentrer(); }
  }

  function _panFin(e) {
    if (!_panDoigts.delete(e.pointerId)) return;   // lu sur window : un doigt hors de la carte ne compte pas
    _panDepart = null; _panEngage = false; _panCentreAvant = null;
  }

  // ── Rotation manuelle ──
  // Même famille d'événements que le pinch-zoom de Leaflet (`L.Browser.touchNative` : touch, sinon pointeurs ; Chrome
  // de bureau expose TouchEvent et passe donc en touch) : nos écouteurs, sur le
  // conteneur, passent AVANT les siens (sur document), donc Leaflet recentre le pincement avec l'angle déjà à jour
  // et le contenu reste sous les doigts.
  let _geste = null;              // { a0, engage, aBase, vueBase } pendant un geste à deux doigts
  const _rotDoigts = new Map();   // pointerId → { x, y } (famille pointeurs)

  function _manuelBloque() {
    if (!_carte() || _suspensions.size > 0) return true;
    if (!_plan) {
      try { return !!(cfg.bloque && cfg.bloque()); } catch(e) { return false; }
    }
    try {
      if (window._modeClicCarteActif && window._modeClicCarteActif()) return true;
    } catch(e) {}
    return _modePleinEcranActif();
  }
  // Le cap du plan orienté a priorité : tant qu'il tient la vue, deux doigts ne font que zoomer.
  function _rotationManuellePermise() { return _source !== "cap" && !_manuelBloque(); }

  function _angleDoigts(p, q) { return Math.atan2(q.y - p.y, q.x - p.x) * 180 / Math.PI; }

  function _gesteDebut(p, q) {
    _geste = { a0: _angleDoigts(p, q), engage: false, aBase: 0, vueBase: 0 };
  }

  function _gesteSuivre(p, q) {
    if (!_geste) return;
    const a = _angleDoigts(p, q);
    if (!_geste.engage) {
      if (Math.abs(_delta(_geste.a0, a)) < SEUIL_ROTATION) return;
      // Refusée (outil armé, cap actif…) : le pincement continue seul, jusqu'au prochain geste.
      if (!_rotationManuellePermise()) { _geste = null; return; }
      _geste.engage = true;
      _geste.aBase = a;
      _geste.vueBase = _bearing;
      _entrerManuel();
    } else if (_source !== "manuel") {
      _geste = null;   // le cap ou un outil a repris la vue pendant le geste
      return;
    }
    _poserManuel(_geste.vueBase + _delta(_geste.aBase, a));
  }

  function _gesteFin() {
    const g = _geste;
    _geste = null;
    if (!g || !g.engage || _source !== "manuel") return;
    if (Math.abs(_delta(0, _bearing)) < SNAP_NORD) reset();
  }

  function _entrerManuel() {
    _stopAnim();
    _source = "manuel";
    _capLisse = null;
    _verrouiller(_carte());
    _adopterCroixPopups();
    _surveiller(true);
  }

  // Pas de lissage : la carte suit les doigts.
  function _poserManuel(deg) {
    _stopAnim();
    _bearing = _norm(deg);
    _cible = _bearing;
    _appliquer();
    _majBoutonNord();
  }

  function _pointeurDoigt(e) { return e.pointerType !== "mouse"; }

  function _rotPointerDown(e) {
    if (!_pointeurDoigt(e)) return;
    if (e.isPrimary) _rotDoigts.clear();   // même piège que _panDebut : un doigt perdu ne compte plus
    _rotDoigts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (_rotDoigts.size === 2) {
      const pts = Array.from(_rotDoigts.values());
      _gesteDebut(pts[0], pts[1]);
    } else if (_rotDoigts.size > 2) {
      _gesteFin();
    }
  }
  function _rotPointerMove(e) {
    if (!_rotDoigts.has(e.pointerId)) return;
    _rotDoigts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (_rotDoigts.size !== 2 || !_geste) return;
    const pts = Array.from(_rotDoigts.values());
    _gesteSuivre(pts[0], pts[1]);
  }
  function _rotPointerFin(e) {
    if (!_rotDoigts.delete(e.pointerId)) return;
    if (_rotDoigts.size < 2) _gesteFin();
  }

  function _pt(t) { return { x: t.clientX, y: t.clientY }; }
  function _rotTouchStart(e) {
    if (!e.touches) return;
    if (e.touches.length === 2) _gesteDebut(_pt(e.touches[0]), _pt(e.touches[1]));
    else if (e.touches.length > 2) _gesteFin();
  }
  function _rotTouchMove(e) {
    if (!_geste || !e.touches || e.touches.length !== 2) return;
    _gesteSuivre(_pt(e.touches[0]), _pt(e.touches[1]));
  }
  function _rotTouchFin(e) {
    if (!e.touches || e.touches.length < 2) _gesteFin();
  }

  // Maj + molette (PC) : la vue tourne autour du centre. Avalée seulement quand elle tourne vraiment, sinon le
  // zoom de Leaflet garde la molette.
  // 🩸 Chrome sous Windows convertit Maj + molette en défilement HORIZONTAL (deltaX) : les deux axes sont lus.
  let _moletteFin = null;
  function _rotMolette(e) {
    if (!e.shiftKey || e.ctrlKey || e.altKey || e.metaKey) return;
    if (!_rotationManuellePermise()) return;
    const brut = Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
    if (!brut) return;
    const px = brut * (e.deltaMode === 1 ? 33 : (e.deltaMode === 2 ? 400 : 1));
    e.preventDefault();
    // Immédiate : sur le fond nu, la cible EST le conteneur, où Leaflet écoute aussi.
    e.stopImmediatePropagation();
    if (_source !== "manuel") _entrerManuel();
    _poserManuel(_bearing + px * MOLETTE_DEG);
    clearTimeout(_moletteFin);
    _moletteFin = setTimeout(function() {
      if (_source === "manuel" && Math.abs(_delta(0, _bearing)) < SNAP_NORD) reset();
    }, 400);
  }

  // Un outil armé depuis la barre (contrôles Leaflet, DANS le conteneur) : relu juste après son clic, sans attendre
  // la surveillance.
  function _apresClicConteneur() {
    if (_source === "manuel") setTimeout(_verifierManuel, 0);
  }

  // Appli repliée ou fenêtre quittée doigts posés : aucune fin ne viendra, on oublie tout geste en cours.
  function _doigtsOublies(e) {
    if (e && e.type === "visibilitychange" && document.visibilityState === "visible") return;
    _panOublier();
    _rotDoigts.clear();
    _gesteFin();
  }

  function _installerEcouteurs(map) {
    const cont = map && map.getContainer && map.getContainer();
    if (!cont) return;
    const passif = { passive: true };
    cont.addEventListener("pointerdown", _panDebut, passif);
    cont.addEventListener("pointermove", _panSuivre, passif);
    // Fin d'un doigt lue sur window (lâché hors de la carte, cible retirée du DOM) ; même fonction, même options :
    // un nouvel appel pour le plan suivant ne l'empile pas.
    window.addEventListener("pointerup", _panFin, { passive: true, capture: true });
    window.addEventListener("pointercancel", _panFin, { passive: true, capture: true });
    cont.addEventListener("pointerleave", _panFin, passif);
    window.addEventListener("blur", _doigtsOublies, passif);
    document.addEventListener("visibilitychange", _doigtsOublies, passif);
    const tactile = !!(L.Browser && L.Browser.touchNative);
    if (tactile) {
      cont.addEventListener("touchstart", _rotTouchStart, passif);
      cont.addEventListener("touchmove", _rotTouchMove, passif);
      cont.addEventListener("touchend", _rotTouchFin, passif);
      cont.addEventListener("touchcancel", _rotTouchFin, passif);
    } else {
      cont.addEventListener("pointerdown", _rotPointerDown, passif);
      cont.addEventListener("pointermove", _rotPointerMove, passif);
      window.addEventListener("pointerup", _rotPointerFin, { passive: true, capture: true });
      window.addEventListener("pointercancel", _rotPointerFin, { passive: true, capture: true });
      cont.addEventListener("pointerleave", _rotPointerFin, passif);
    }
    // Capture : passe avant le zoom à la molette de Leaflet (posé sur le même conteneur).
    cont.addEventListener("wheel", _rotMolette, { passive: false, capture: true });
    cont.addEventListener("click", _apresClicConteneur, passif);
  }

  // ── Outils armés pendant une rotation manuelle ──
  // Rien n'appelle ce module quand un outil s'arme (dessin, mesure, recalage, pickers) : on relit `_modeClicCarteActif`
  // tant que la vue est tournée à la main, et on la redresse aussitôt (le clic attendu tomberait dans un repère que
  // l'outil ignore). Désarmé, la carte reste droite (choix conservateur : aucun angle ne revient seul).
  let _surveillance = null;
  function _surveiller(actif) {
    if (actif && !_surveillance) _surveillance = setInterval(_verifierManuel, SURVEILLANCE_MS);
    else if (!actif && _surveillance) { clearInterval(_surveillance); _surveillance = null; }
  }
  function _verifierManuel() {
    if (_source !== "manuel") { _surveiller(false); return; }
    if (_manuelBloque()) reset();
  }

  // 🩸 La croix d'une popup est créée par Leaflet en FRÈRE du contenu : la contre-rotation ne l'atteint pas et elle
  // reste de travers. On l'adopte dans le contenu (Leaflet ne dépend que de son listener) : à l'ouverture sous
  // rotation, et pour les popups déjà ouvertes quand la rotation commence.
  function _adopterCroix(el) {
    if (!el) return;
    try {
      const contenu = el.querySelector(".leaflet-popup-content-wrapper");
      const croix   = el.querySelector(".leaflet-popup-close-button");
      if (contenu && croix && croix.parentNode !== contenu) contenu.appendChild(croix);
    } catch(err) {}
  }
  function _adopterCroixPopups() {
    const map = _carte();
    const cont = map && map.getContainer && map.getContainer();
    if (!cont) return;
    cont.querySelectorAll(".leaflet-popup").forEach(_adopterCroix);
  }

  // ── Bouton nord ──
  // Carte flottante du coin bas gauche de la carte (`.leaflet-bottom.leaflet-left`, hors du pane qui tourne), à la
  // place de la boussole 2D (compass.js) et posée au-dessus d'elle quand elle est ouverte. Jamais fusionnée avec elle
  // (décision produit) : la rose montre le nord réel d'après le cap du téléphone, l'aiguille montre le haut du PLAN.
  // Place et gabarit : style.css > .kta-nord-ctrl. Visible seulement quand la vue est tournée À LA MAIN (le plan
  // orienté a son propre arrêt).
  const SVG_NORD = '<svg class="kta-nord-picto" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
    '<path class="kta-nord-pointe" d="M12 2.5 16 12H8Z"/><path class="kta-nord-queue" d="M8 12h8l-4 9.5Z"/></svg>';

  function _creerBoutonNord(map) {
    const cont = map.getContainer && map.getContainer();
    const coin = cont && cont.querySelector(".leaflet-bottom.leaflet-left");
    if (!coin) return null;
    const ctrl = document.createElement("div");
    // Hors carte du plan, le bouton suit le coin de SA carte (la place fixe vise l'écran du plan).
    ctrl.className = "leaflet-control kta-nord-ctrl" + (_plan ? "" : " kta-nord-local");
    const b = document.createElement("button");
    b.type = "button";
    b.className = "kta-nord-btn";
    const lib = _t("bearing.nord", "Remettre le nord en haut");
    b.title = lib;
    b.setAttribute("aria-label", lib);
    b.innerHTML = SVG_NORD;
    ctrl.appendChild(b);
    if (L.DomEvent) L.DomEvent.disableClickPropagation(ctrl);
    b.addEventListener("click", function(ev) {
      ev.stopPropagation();
      remettreNord();
    });
    coin.appendChild(ctrl);
    map._ktaNordCtrl = ctrl;
    return ctrl;
  }

  function _majBoutonNord() {
    const map = _carte();
    if (!map) return;
    const voulu = _source === "manuel" && _tournee();
    let el = map._ktaNordCtrl && map._ktaNordCtrl.isConnected ? map._ktaNordCtrl : null;
    if (voulu && !el) el = _creerBoutonNord(map);
    if (el) el.classList.toggle("kta-nord-visible", voulu);
  }

  // Retour au nord, animé court (vitesse constante, sans le plafond du cap : un demi-tour prendrait 2 s).
  let _nordRaf = null;
  function remettreNord() {
    if (_nordRaf !== null) { cancelAnimationFrame(_nordRaf); _nordRaf = null; }
    if (_source !== "manuel" || !_tournee() || _mouvementReduit()) { reset(); return; }
    const depart = _delta(0, _bearing);
    let t0 = null;
    const pas = function(ts) {
      _nordRaf = null;
      if (_source !== "manuel") return;   // un geste ou un outil a repris la vue
      if (t0 === null) t0 = ts;
      const k = Math.min(1, (ts - t0) / NORD_MS);
      const lisse = 1 - Math.pow(1 - k, 3);
      if (k >= 1) { reset(); return; }
      _bearing = _norm(depart * (1 - lisse));
      _cible = _bearing;
      _appliquer();
      _nordRaf = requestAnimationFrame(pas);
    };
    _nordRaf = requestAnimationFrame(pas);
  }

  // ── Canvas des renderers ──
  // Leaflet dimensionne le canvas au viewport élargi de `padding` (0,5 pour le plan, map.js) : tourné, il ne couvre
  // plus les coins. Padding pour tous les angles = (diagonale / petit côté − 1)/2, calculé sur la taille RÉELLE (il
  // croît avec l'allongement de l'écran) et seulement pendant la rotation, PLAFONNÉ par un budget en pixels réels
  // du canvas (`_paddingBudget`) : jamais au-delà de ce que Safari accepte (BUDGET_CANVAS_MAX), et sur un plan lourd
  // (PerfUltra.planLourd) presque rien de plus qu'à plat (BUDGET_CANVAS_LOURD) — des bandes de quelques pixels
  // restent alors non peintes dans les coins aux angles proches de 90° (accepté).
  // 🩸 TOUS les renderers, y compris ceux ajoutés pendant la rotation (`_onRendererAjoute`) : l'itinéraire vit
  // dans un renderer SVG à part (halo néon) ; non élargi, il coupe le trajet dans les coins et la coupe
  // change à chaque zoom (le tracé semble avancer).
  // 🩸 Pixels réels = taille CSS × 2 sur tout écran haute densité, quel que soit devicePixelRatio : Leaflet double
  // le canvas (`Browser.retina`), il ne le triple pas sur un iPhone 3×.
  const BUDGET_CANVAS_MAX   = 16777216;   // px réels : surface maximale d'un canvas sous Safari iOS (4096²)
  const BUDGET_CANVAS_LOURD = 6000000;    // px réels (~24 Mo) : téléphone 393 × 852 à plat = 5,36 M, tourné = 7,71 M
  function _paddingBudget(s) {
    const lourd = _plan && window.PerfUltra && typeof window.PerfUltra.planLourd === "function" &&
      window.PerfUltra.planLourd();
    const m = (window.L && L.Browser && L.Browser.retina) ? 2 : 1;
    const k = Math.sqrt((lourd ? BUDGET_CANVAS_LOURD : BUDGET_CANVAS_MAX) / (s.x * s.y * m * m));
    return Math.floor((k - 1) / 2 * 100) / 100;
  }

  // Leviers allégés de PerfUltra pendant que la carte du plan est tournée (PerfUltra.renfortRotation décide).
  function _renfort(actif) {
    if (!_plan || !window.PerfUltra || typeof window.PerfUltra.renfortRotation !== "function") return;
    try { window.PerfUltra.renfortRotation(actif); } catch(e) {}
  }

  // POI et tracés retirés hors écran (viewportCull) : la zone visible change quand l'angle change, sans moveend.
  let _cullTimer = null;
  function _cullerObjetsThrottle() {
    if (!_plan || _cullTimer !== null) return;
    if (!window.PerfUltra || !window.PerfUltra.get("viewportCull")) return;
    _cullTimer = setTimeout(function() {
      _cullTimer = null;
      if (typeof window._refreshDataMarkersViewport === "function") window._refreshDataMarkersViewport();
    }, 150);
  }

  function _majPaddingRenderer(map, actif) {
    if (!map) return;
    const vus = [];
    if (map._renderer) vus.push(map._renderer);
    try {
      map.eachLayer(function(l) {
        if (window.L && l instanceof L.Renderer && vus.indexOf(l) < 0) vus.push(l);
      });
    } catch(e) {}
    vus.forEach(function(r) { _majPaddingUnRenderer(map, r, actif); });
    if (actif) map.on("layeradd", _onRendererAjoute);
    else map.off("layeradd", _onRendererAjoute);
  }

  function _onRendererAjoute(e) {
    if (window.L && e && e.layer instanceof L.Renderer && _interactionsSauvees) {
      _majPaddingUnRenderer(_carte(), e.layer, true);
    }
  }

  function _majPaddingUnRenderer(map, r, actif) {
    if (!r || !r.options) return;
    if (actif) {
      if (r._ktaPadOrigine == null) r._ktaPadOrigine = r.options.padding;
      let s;
      try { s = map.getSize(); } catch(e) { return; }
      if (!s || !s.x || !s.y) return;
      const requis = (Math.hypot(s.x, s.y) / Math.min(s.x, s.y) - 1) / 2;
      const cible = Math.max(r._ktaPadOrigine || 0, Math.min(Math.ceil(requis * 100) / 100, _paddingBudget(s)));
      if (r.options.padding === cible) return;
      r.options.padding = cible;
    } else {
      if (r._ktaPadOrigine == null) return;
      r.options.padding = r._ktaPadOrigine;
      r._ktaPadOrigine = null;
    }
    try {
      if (typeof r._reset === "function") r._reset();
      else if (typeof r._update === "function") r._update();
    } catch(e) {}
  }

  // ── Tuiles hors écran ──
  // 🩸 Sous un pane transformé, iOS compose le sous-arbre en une couche et renonce à peindre au-delà de
  // ses limites de texture : des pans du fond restent noirs sur un grand plan dézoomé. Le retrait des
  // tuiles hors écran est fait en permanence par tiling.js > ktaCullerTuilesV2 ; ce module le redemande
  // pendant que la vue tourne (la zone visible change sans moveend), zone dé-tournée comprise.
  // Autre carte : ses propres tuiles (cfg.apresRotation) et ses GridLayer, au plus une fois par frame.
  let _grillesPlanifiees = false;
  function _cullerTuilesThrottle() {
    if (_plan) {
      if (typeof window.ktaCullerTuilesV2Throttle === "function") window.ktaCullerTuilesV2Throttle();
      return;
    }
    if (_grillesPlanifiees) return;
    _grillesPlanifiees = true;
    requestAnimationFrame(function() {
      _grillesPlanifiees = false;
      const map = _carte();
      if (!map || map._animatingZoom) return;
      try {
        map.eachLayer(function(l) {
          if (l instanceof L.GridLayer && l._map && typeof l._update === "function") l._update();
        });
      } catch(e) {}
      try { if (typeof cfg.apresRotation === "function") cfg.apresRotation(); } catch(e) {}
    });
  }

  // ── Bouton « recentrer » ──
  // Visible quand le suivi est désarmé (zoom ailleurs, recentrage refusé) ; retiré à l'arrêt du mode.
  function _trackingActif() {
    if (!_plan) return false;   // autre carte : ni suivi ni bouton « recentrer »
    try {
      return typeof window.getTrackingActif === "function" && window.getTrackingActif() === true;
    } catch(e) { return false; }
  }

  // Ne dépend PAS du mode « plan orienté » : tracker actif suffit (sans le mode, pas de suivi auto, le
  // bouton est le seul retour quand on s'éloigne ou que la position sort de l'écran).
  // 🩸 Le bas-centre est un carrefour (Retour de portail, portail suivant, picker de Nord, floaters
  // d'outils, barre d'état qui grandit avec la pastille Secours) : aucune hauteur figée, on mesure ce qui
  // est là et on se place au-dessus. Ajouter un flottant à cette liste suffit ; la barre d'état est suivie
  // par un ResizeObserver (cf _observerFloaters).
  const FLOATERS_BAS = ["#kta-ipl-back-float", ".kta-ipr-next-float",
                        ".kta-iti-floater", ".kta-north-picker-overlay",
                        ".kta-supp-trace-floater", "#kta-refonte-statusbar"];

  function _placerBoutonRecentrer() {
    if (!_btnRecentrer) return;
    let sommet = null;              // bord supérieur le plus haut trouvé
    FLOATERS_BAS.forEach(function(sel) {
      let els;
      try { els = document.querySelectorAll(sel); } catch(e) { return; }
      els.forEach(function(el) {
        if (el === _btnRecentrer) return;
        let r;
        try { r = el.getBoundingClientRect(); } catch(e) { return; }
        if (!r || r.height === 0 || r.width === 0) return;          // masqué
        if (r.bottom < window.innerHeight * 0.4) return;            // pas en bas
        if (sommet === null || r.top < sommet) sommet = r.top;
      });
    });
    if (sommet === null) { _btnRecentrer.style.bottom = ""; return; }
    _btnRecentrer.style.bottom = Math.max(0, Math.round(window.innerHeight - sommet + 10)) + "px";
  }

  // Les flottants apparaissent seuls (le Retour a son minuteur) : enfants directs de <html> observés
  // (childList sans subtree, quasi gratuit), tant que le bouton existe.
  let _observateurFloaters = null;
  let _observateurBarre = null;
  function _observerFloaters(actif) {
    if (actif && !_observateurFloaters && typeof MutationObserver === "function") {
      _observateurFloaters = new MutationObserver(function() { _placerBoutonRecentrer(); });
      _observateurFloaters.observe(document.documentElement, { childList: true });
    } else if (!actif && _observateurFloaters) {
      try { _observateurFloaters.disconnect(); } catch(e) {}
      _observateurFloaters = null;
    }
    const barre = document.getElementById("kta-refonte-statusbar");
    if (actif && !_observateurBarre && barre && typeof ResizeObserver === "function") {
      _observateurBarre = new ResizeObserver(function() { _placerBoutonRecentrer(); });
      _observateurBarre.observe(barre);
    } else if (!actif && _observateurBarre) {
      try { _observateurBarre.disconnect(); } catch(e) {}
      _observateurBarre = null;
    }
  }

  function _majBoutonRecentrer() {
    const doitEtreLa = _trackingActif() && !_suiviArme;
    if (doitEtreLa && !_btnRecentrer) {
      _btnRecentrer = document.createElement("button");
      _btnRecentrer.type = "button";
      _btnRecentrer.className = "kta-bearing-recentrer";
      _btnRecentrer.innerHTML = "🎯 " +
        (window.I18n ? window.I18n.t("bearing.recentrer") : "Recentrer");
      _btnRecentrer.addEventListener("click", function(ev) {
        ev.stopPropagation();
        recentrer();
      });
      document.body.appendChild(_btnRecentrer);
      _observerFloaters(true);
    } else if (!doitEtreLa && _btnRecentrer) {
      try { _btnRecentrer.remove(); } catch(e) {}
      _btnRecentrer = null;
      _observerFloaters(false);
    }
    _placerBoutonRecentrer();
  }

  // ── Hooks carte ──
  // Garde portée par la map (jamais par window) : la carte change à chaque plan.
  function attachTo(map) {
    _installerPatchConversions();
    if (!map || map._ktaBearingHooked) return;
    map._ktaBearingHooked = true;
    // Lu par les patchs de prototype (gestes, grilles) : l'angle de CETTE carte, nul si l'instance sert déjà une
    // autre carte (carte du plan remplacée).
    map._ktaRotation = {
      grilles: !_plan,
      angle: function() { return _carte() === map ? _bearing : 0; }
    };
    if (!_plan) _installerPatchGrilles();
    _installerEcouteurs(map);
    map.on("move zoom moveend zoomend viewreset", function() {
      if (Math.abs(_bearing) > 0.01) _appliquer();
    });
    // Un pan manuel (drag natif hors mode, ou notre pan) désarme le suivi.
    map.on("dragstart", function() {
      if (!_trackingActif() || !_suiviArme) return;
      _suiviArme = false;
      _majBoutonRecentrer();
    });
    map.on("popupopen", function(e) {
      if (!(_tournee() || isActive()) || !e || !e.popup) return;
      try { _adopterCroix(e.popup.getElement()); } catch(err) {}
    });

    console.log("[MapBearing] Hooks carte posés");
  }

  // ── API ──

  // Le mode tourne-t-il VRAIMENT la vue ? Toggle + tracking + aucune suspension + aucun mode « clic carte »
  // armé (dessin, mesure, recalage, pickers) — sinon on cliquerait dans un repère que Leaflet ignore.
  function isActive() {
    if (!_enabled || _suspensions.size > 0) return false;
    if (!_carte()) return false;
    if (typeof window.getTrackingActif === "function" && !window.getTrackingActif()) return false;
    try {
      if (window._modeClicCarteActif && window._modeClicCarteActif()) return false;
    } catch(e) {}
    if (_modePleinEcranActif()) return false;
    return true;
  }

  // Modes plein écran qui veulent une vue DROITE (Secours, Perdu, replay, urgence). La présentation n'en est pas :
  // elle garde la carte et la boussole, la vue y tourne pendant le suivi (décision produit).
  // 🩸 On LIT leur état au lieu de leur faire appeler suspend()/resume() : chacun a ses retours anticipés
  // et fermetures défensives, un couple suspend/resume s'y déséquilibre au premier chemin oublié — et une
  // suspension jamais levée est invisible (la carte cesse de tourner sans message).
  function _modePleinEcranActif() {
    try {
      if (window.LostMode && window.LostMode.isActive && window.LostMode.isActive()) return true;
      if (window.SecoursMode && window.SecoursMode.isOpen && window.SecoursMode.isOpen()) return true;
      if (window.EmergencyMode && window.EmergencyMode.isActif && window.EmergencyMode.isActif()) return true;
      // Replay : pas d'API d'état, mais sa modale porte un id stable.
      if (document.getElementById("kta-trkrepl-modal")) return true;
    } catch(e) {}
    return false;
  }

  // Appelé par tracking.js à chaque orientation, cap DANS LE REPÈRE DU PLAN (offset Nord appliqué).
  function onHeading(capPlan) {
    if (typeof capPlan !== "number" || isNaN(capPlan)) {
      // Sans argument : relu à la source (repère plan).
      if (typeof window.getPlanRelHeading !== "function") return;
      capPlan = window.getPlanRelHeading();
      if (typeof capPlan !== "number" || isNaN(capPlan)) return;
    }
    // Le mode peut devenir inapplicable sans prévenir (outil de dessin armé, Mode Secours) : détecté ici,
    // seul chemin appelé en continu, et la vue est REDRESSÉE au lieu de rester figée de travers.
    if (!isActive()) {
      // 🩸 Redressement IMMÉDIAT, pas animé : l'outil qui vient de couper le mode attend souvent un clic,
      // qui tomberait à côté pendant la rotation. Un angle posé à la main, lui, tient tant que rien ne le bloque.
      if (_source === "manuel") { if (_manuelBloque()) reset(); }
      else if (_tournee() || Math.abs(_cible) > 0.01) reset();
      return;
    }
    // Le cap prend la main sur un angle manuel : à l'arrêt du plan orienté, la vue reviendra au nord.
    if (_source !== "cap") {
      _source = "cap";
      _geste = null;
      _surveiller(false);
      _majBoutonNord();
      _adopterCroixPopups();
    }
    // Retour d'un mode qui avait la main : re-verrouillage.
    if (!_interactionsSauvees) _verrouiller(_carte());
    if (_capLisse === null) _capLisse = _norm(capPlan);
    else _capLisse = _norm(_capLisse + _delta(_capLisse, capPlan) * ALPHA);
    // Heading-up : la vue tourne de l'opposé du cap.
    const vise = _norm(-_capLisse);
    // En marche on suit de près ; à l'arrêt il faut une intention claire, mais on suit toujours.
    const enMarche = _dernierPas && (Date.now() - _dernierPas) < MARCHE_MS;
    const seuil = enMarche ? SEUIL_MARCHE : SEUIL_ARRET;
    if (Math.abs(_delta(_cible, vise)) < seuil) return;
    _cible = vise;
    _animer();
  }

  // Appelé par tracking.js à chaque pas appliqué (updateMap).
  function onStep(latlng) {
    _dernierPas = Date.now();
    if (!latlng || !_carte()) return;
    if (isActive() && _suiviArme) {
      try {
        // Sans animation : un pas fait quelques pixels. Le move réapplique l'origine.
        _carte().setView(latlng, _carte().getZoom(), { animate: false });
      } catch(e) {}
      return;
    }
    // Hors mode ou suivi désarmé : la carte ne suit pas, mais si la position sort de l'écran on propose le
    // retour.
    if (!_trackingActif()) return;
    try {
      if (_suiviArme && !_carte().getBounds().pad(-0.05).contains(latlng)) {
        _suiviArme = false;
      }
    } catch(e) {}
    _majBoutonRecentrer();
  }

  function recentrer() {
    _suiviArme = true;
    _majBoutonRecentrer();
    if (typeof window.getTrackingPosition === "function" && _carte()) {
      try {
        const p = window.getTrackingPosition();
        if (p && typeof p.x === "number") {
          _carte().setView(window.convertCoord(p.x, p.y), _carte().getZoom(), { animate: true });
        }
      } catch(e) {}
    }
  }

  // Vue droite SANS toucher au choix de l'utilisateur. L'angle manuel est oublié (changement de plan, outil armé,
  // mode plein écran, bouton nord) : rien ne le rétablit ensuite.
  function reset() {
    _stopAnim();
    if (_nordRaf !== null) { cancelAnimationFrame(_nordRaf); _nordRaf = null; }
    _bearing = 0; _cible = 0; _capLisse = null;
    _source = null;
    _geste = null;
    _surveiller(false);
    _appliquer();
    _deverrouiller(_carte());
    // Vue droite : la zone visible redevient le rectangle de l'écran.
    _cullerTuilesThrottle();
    _majBoutonRecentrer();
    _majBoutonNord();
  }

  function setEnabled(v) {
    _enabled = !!v;
    try { localStorage.setItem(LS_KEY, _enabled ? "1" : "0"); } catch(e) {}
    if (_enabled && isActive()) {
      _suiviArme = true;
      _verrouiller(_carte());
      recentrer();
    } else if (_source !== "manuel") {
      reset();
    }
    console.log("[MapBearing] Mode plan orienté :", _enabled ? "ON" : "OFF");
    _majBoutonRecentrer();
  }

  // Suspension explicite pour un appelant sans état lisible. Indexée par RAISON (pas un compteur) :
  // suspendre deux fois compte une fois, `resume(raison)` lève la bonne, aucun appairage à tenir.
  function suspend(raison) {
    const cle = raison || "anonyme";
    if (_suspensions.has(cle)) return;
    _suspensions.add(cle);
    reset();
    console.log("[MapBearing] Suspendu (" + cle + ")");
  }

  function resume(raison) {
    const cle = raison || "anonyme";
    if (!_suspensions.delete(cle)) return;
    if (_suspensions.size === 0 && isActive()) {
      _verrouiller(_carte());
      _suiviArme = true;
      console.log("[MapBearing] Reprise");
    }
  }

  // Arrêt du suivi : le cap rend la vue droite (au nord, pas à un ancien angle manuel) ; un angle manuel tient.
  function onTrackingChange(actif) {
    if (actif && _enabled) {
      _dernierPas = Date.now();   // on part « en marche », pas gelé
      _suiviArme = true;
      _verrouiller(_carte());
    } else {
      _capLisse = null;
      _dernierPas = 0;
      if (_source === "manuel") _majBoutonRecentrer();
      else reset();
    }
  }

  // Boîte englobante de ce que l'écran montre VRAIMENT (une mesure, pas un facteur : cf plus haut).
  function zoneVisible(pad) {
    const map = _carte();
    if (!map) return null;
    const marge = (typeof pad === "number") ? pad : 0;
    let base = null;
    try {
      if (Math.abs(_bearing) <= 0.01) {
        base = map.getBounds();
      } else {
        const s = map.getSize();
        const c = s.divideBy(2);
        const a = -_bearing * Math.PI / 180;
        // Les 4 coins du conteneur, dé-tournés comme le patch des gestes.
        [[0, 0], [s.x, 0], [s.x, s.y], [0, s.y]].forEach(function(p) {
          const dx = p[0] - c.x, dy = p[1] - c.y;
          const q = L.point(dx * Math.cos(a) - dy * Math.sin(a) + c.x,
                            dx * Math.sin(a) + dy * Math.cos(a) + c.y);
          const ll = map.containerPointToLatLng(q);
          base = base ? base.extend(ll) : L.latLngBounds(ll, ll);
        });
      }
    } catch(e) { return null; }
    if (!base) return null;
    return marge ? base.pad(marge) : base;
  }

  const api = {
    attachTo:         attachTo,
    isEnabled:        function() { return _enabled; },
    setEnabled:       setEnabled,
    isActive:         isActive,
    getBearing:       function() { return _bearing; },
    // "manuel" | "cap" | null : qui tient l'angle courant.
    getSource:        function() { return _source; },
    // Angle manuel posé par code (aide, tests) : mêmes refus que le geste. Rend true s'il est appliqué.
    setManuel:        function(deg) {
      if (typeof deg !== "number" || Number.isNaN(deg) || !_rotationManuellePermise()) return false;
      if (_source !== "manuel") _entrerManuel();
      _poserManuel(deg);
      if (!_tournee()) reset();
      return true;
    },
    remettreNord:     remettreNord,
    onHeading:        onHeading,
    onStep:           onStep,
    onTrackingChange: onTrackingChange,
    recentrer:        recentrer,
    reappliquer:      reappliquer,
    reset:            reset,
    suspend:          suspend,
    resume:           resume,
    zoneVisible:      zoneVisible,
    SEUIL_ROTATION:   SEUIL_ROTATION
  };
  if (_plan) _enabled = _lireEnabled();
  return api;
  }

  window.MapBearing = _creerRotation({ carte: function() { return window.map; }, plan: true });

  // Rotation manuelle seule d'une autre carte (Vue OSM, widget de l'accueil) : une instance pour la vie de la page, `attachTo` sur
  // chaque nouvelle carte (garde portée par la carte). opts.carte() rend la carte courante (null fermée),
  // opts.apresRotation() est rappelé quand l'angle change (tuiles propres à la carte), opts.bloque() refuse le geste.
  // ⚠️ `reset()` à chaque fermeture, APRÈS `map.remove()` (carte rendue nulle par opts.carte) : avant, la restitution
  // du padding redemande au canvas un dessin que sa destruction laisse orphelin.
  window.MapBearing.creerRotationManuelle = function(opts) {
    const o = opts || {};
    if (typeof o.carte !== "function") return null;
    const r = _creerRotation({ carte: o.carte, plan: false, apresRotation: o.apresRotation, bloque: o.bloque });
    return {
      attachTo:       r.attachTo,
      getBearing:     r.getBearing,
      setManuel:      r.setManuel,
      remettreNord:   r.remettreNord,
      reappliquer:    r.reappliquer,
      reset:          r.reset,
      zoneVisible:    r.zoneVisible,
      SEUIL_ROTATION: SEUIL_ROTATION
    };
  };
})();
