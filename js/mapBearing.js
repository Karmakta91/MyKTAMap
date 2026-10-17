/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * Site : https://myktamap.fr
 * Licence : CC BY-NC-SA 4.0 — Usage commercial interdit sans accord ecrit prealable.
 * Voir LICENSE a la racine du projet.
 */

// =========================
// MAP-BEARING — mode « plan orienté » (heading-up : la carte tourne, pas l'icône)
// =========================
// En tracking actif, la vue pivote pour que la direction de marche pointe vers le haut de l'écran.
// Désactivé par défaut, activable depuis la modale 🧭 Tracker.
// 🩸 La rotation vit sur un pane INTERCALAIRE (`.kta-rotate-pane`, entre le map-pane et ses enfants),
//   JAMAIS sur le map-pane : Leaflet le positionne en `transform: translate3d`, et une rotation y fait
//   pivoter le vecteur de translation (propriété `rotate` appliquée AVANT `transform` ; même défaut avec
//   rotate() translate3d() écrit à la main) — des centaines de px d'erreur dès que la carte a été panée.
//   Même structure que le plugin leaflet-rotate, sans patcher le cœur.
// ⚠️ `transform-origin` est en layerPoint : il DÉRIVE à chaque pan/zoom → réappliqué sur move/zoom.
// ⚠️ Un pane créé par `map.createPane()` atterrit dans le map-pane, HORS rotation : le créer dans
//   `window._ktaRotatePane` pour qu'il tourne. Toute contre-rotation se pose sur un ENFANT.
// Tournent : fond, tuiles, vecteurs, icônes POI (décision produit), heatmap, calques calibrés.
// Restent droits : contrôles Leaflet (hors map-pane), labels de mesure et popups (contre-rotation CSS
//   `--kta-bearing`). L'icône du tracker porte rotate(+cap) et la vue −cap : somme nulle, rien à faire.
// Clics : seul `mouseEventToContainerPoint` est patché (cf _installerPatchConversions). Pan : refait à la
//   main pendant le mode (le drag Leaflet déplace d'un offset ÉCRAN, donc de travers).
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

  // 🩸 Pas de marge scalaire pour « le viewport tourné déborde son rectangle » : la bonne valeur dépend du
  // FORMAT de l'écran ((grand côté / petit côté − 1)/2 : 0,19 en paysage de bureau, 0,58 sur un iPhone en
  // portrait), une constante laisse des bords jamais peints et des POI effacés le long des bords.
  // `zoneVisible` rend la boîte englobante des QUATRE COINS RÉELS : exacte et moins chère. Hors rotation,
  // elle rend `map.getBounds()` au bit près (appelants : road.js, utils.js).

  let _enabled    = false;   // choix utilisateur (persisté)
  const _suspensions = new Set();   // raisons actives — cf suspend()/resume()
  let _bearing    = 0;       // angle réellement appliqué (deg)
  let _cible      = 0;       // angle visé (deg)
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

  // ── Angles ──
  function _norm(deg)  { return ((deg % 360) + 360) % 360; }
  function _delta(a, b) {            // écart signé le plus court de a vers b
    let d = _norm(b) - _norm(a);
    if (d > 180)  d -= 360;
    if (d < -180) d += 360;
    return d;
  }

  // ── Pane de rotation ──
  // Créé une fois par instance de carte. 🩸 Garde portée PAR LA MAP (`map._ktaRotatePane`), jamais par
  // `window` : la carte est remplacée à chaque plan, un drapeau global dirait « déjà fait » à tort
  // (cf scripts/check-map-listeners.js).
  function _pane(map) {
    if (!map || typeof map.getPane !== "function") return null;
    if (map._ktaRotatePane && map._ktaRotatePane.parentNode) return map._ktaRotatePane;
    const mapPane = map.getPane("mapPane");
    if (!mapPane) return null;
    const rot = document.createElement("div");
    rot.className = "kta-rotate-pane";
    while (mapPane.firstChild) rot.appendChild(mapPane.firstChild);
    mapPane.appendChild(rot);
    map._ktaRotatePane = rot;
    window._ktaRotatePane = rot;   // pour un futur pane qui devrait tourner
    console.log("[MapBearing] Pane de rotation en place");
    return rot;
  }

  // Recalcule l'origine (elle dérive à chaque pan/zoom) et pose l'angle.
  function _appliquer() {
    const map = window.map;
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
      cont.classList.toggle("kta-bearing-on", Math.abs(_bearing) > 0.01);
    }
    _cullerTuilesThrottle();
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
  // est refait à la main (_installerPanManuel).
  function _verrouiller(map) {
    if (!map || _interactionsSauvees) return;
    _interactionsSauvees = { dragging: map.dragging && map.dragging.enabled() };
    try { if (map.dragging) map.dragging.disable(); } catch(e) {}
    // 🩸 `dragging.disable()` retire `leaflet-touch-drag` : le conteneur retombe en
    // `touch-action: pan-x pan-y` et le NAVIGATEUR scrollerait la page. La classe ci-dessous rend
    // `touch-action: none` (cf style.css).
    const cont0 = map.getContainer();
    if (cont0) cont0.classList.add("kta-bearing-lock");
    _majPaddingRenderer(map, true);
    // 🩸 On ne touche PAS aux options de zoom (pas de "center") : forcer le zoom au centre fait glisser
    // toute la carte quand on pince ailleurs. Avec `mouseEventToContainerPoint` patché, Leaflet zoome entre
    // les doigts avec les bons points. Les vecteurs restent cliquables (cf _installerPatchConversions).
    _installerPanManuel(map);
  }

  function _deverrouiller(map) {
    if (!map || !_interactionsSauvees) { _interactionsSauvees = null; return; }
    try { if (map.dragging && _interactionsSauvees.dragging) map.dragging.enable(); } catch(e) {}
    const cont1 = map.getContainer();
    if (cont1) cont1.classList.remove("kta-bearing-lock");
    _majPaddingRenderer(map, false);
    map.options.touchZoom       = _interactionsSauvees.touchZoom;
    map.options.scrollWheelZoom = _interactionsSauvees.scrollWheelZoom;
    map.options.doubleClickZoom = _interactionsSauvees.doubleClickZoom;
    _interactionsSauvees = null;
  }

  // ── Conversions écran ↔ carte ──
  // Leaflet convertit un point écran sans connaître la rotation (jusqu'à 200 px d'écart à 90°).
  // 🩸 ON NE PATCHE QUE `mouseEventToContainerPoint`, point d'ENTRÉE des gestes. Pas
  // `containerPointToLayerPoint` : `L.Renderer._update()` s'en sert pour le coin de son canvas, qui
  // tournerait au lieu de s'agrandir (coins de l'écran plus peints). Tout ce qui lit un geste en dérive
  // (mouseEventToLayerPoint/LatLng, hit-test canvas, map.on("click"), pinch-zoom).
  // ⚠️ Posé sur le PROTOTYPE, donc vu par les autres cartes (Vue OSM, minimap d'urgence, Secours, picker
  // de calage, aperçu HOME) : il rend exactement Leaflet hors carte principale ou à angle nul.
  let _patchPose = false;
  function _installerPatchConversions() {
    if (_patchPose) return;
    if (typeof L === "undefined" || !L.Map || !L.Map.prototype) return;
    _patchPose = true;
    const proto = L.Map.prototype;
    const origine = proto.mouseEventToContainerPoint;

    proto.mouseEventToContainerPoint = function(e) {
      const p = origine.call(this, e);
      if (this !== window.map || Math.abs(_bearing) <= 0.01) return p;
      // On défait la rotation : le point tel que Leaflet l'attend dans une carte droite.
      const c = this.getSize().divideBy(2);
      const a = -_bearing * Math.PI / 180;
      const dx = p.x - c.x, dy = p.y - c.y;
      return L.point(dx * Math.cos(a) - dy * Math.sin(a) + c.x,
                     dx * Math.sin(a) + dy * Math.cos(a) + c.y);
    };

    console.log("[MapBearing] Gestes adaptés à la rotation");
  }

  // ── Pan manuel ──
  // Plutôt que patcher `L.Draggable` (partagé par poignées, marqueurs déplaçables, autres cartes), le drag
  // Leaflet reste DÉSACTIVÉ pendant le mode et on fait le pan dans le bon repère. Minimal : un doigt, pas
  // d'inertie ; deux doigts → pinch-zoom de Leaflet.
  function _installerPanManuel(map) {
    if (!map || map._ktaPanManuel) return;
    map._ktaPanManuel = true;
    const cont = map.getContainer();
    if (!cont) return;
    const doigts = new Set();
    let depart = null, engage = false, centreAvant = null;

    cont.addEventListener("pointerdown", function(e) {
      doigts.add(e.pointerId);
      if (doigts.size > 1) {
        // 🩸 Un pinch commence mal : le premier doigt bouge avant la pose du second, notre pan s'engage et
        // déplace la carte avant que Leaflet ne voie le geste à deux doigts. On rend ce qu'on a pris : le
        // pinch travaille sur la vue d'origine.
        if (engage && centreAvant) {
          try { map.setView(centreAvant, map.getZoom(), { animate: false }); } catch(err) {}
        }
        depart = null; engage = false; centreAvant = null;
        return;
      }
      if (!isActive()) { depart = null; return; }
      depart = { x: e.clientX, y: e.clientY };
      centreAvant = map.getCenter();
    }, { passive: true });

    cont.addEventListener("pointermove", function(e) {
      if (!depart || !isActive() || doigts.size > 1) return;
      const dx = e.clientX - depart.x, dy = e.clientY - depart.y;
      // Seuil d'engagement : un tap ne doit pas devenir un pan (clic volé aux marqueurs).
      if (!engage && Math.hypot(dx, dy) < 6) return;
      engage = true;
      depart = { x: e.clientX, y: e.clientY };
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
      if (_suiviArme) { _suiviArme = false; _majBoutonRecentrer(); }
    }, { passive: true });

    const fin = function(e) {
      doigts.delete(e.pointerId);
      depart = null; engage = false; centreAvant = null;
    };
    cont.addEventListener("pointerup", fin, { passive: true });
    cont.addEventListener("pointercancel", fin, { passive: true });
    cont.addEventListener("pointerleave", fin, { passive: true });
  }

  // ── Canvas des renderers ──
  // Leaflet dimensionne le canvas au viewport + 10 % (`padding`) : tourné, il ne couvre plus les coins.
  // Padding pour tous les angles = (diagonale / petit côté − 1)/2, calculé sur la taille RÉELLE (il croît
  // avec l'allongement de l'écran) et seulement pendant le mode (canvas ×1,8 à ×3,5 en surface).
  // 🩸 TOUS les renderers, y compris ceux ajoutés pendant le mode (`_onRendererAjoute`) : l'itinéraire vit
  // dans un renderer SVG à part (halo néon) ; non élargi, il coupe le trajet dans les coins et la coupe
  // change à chaque zoom (le tracé semble avancer).
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
    if (window.L && e && e.layer instanceof L.Renderer && isActive()) {
      _majPaddingUnRenderer(window.map, e.layer, true);
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
      const cible = Math.ceil(requis * 100) / 100;
      if (r.options.padding === cible) return;
      r.options.padding = Math.max(r._ktaPadOrigine || 0, cible);
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
  // tuiles hors écran est fait en permanence par tiling.js > ktaCullerTuilesV2 ; ce mode le redemande
  // pendant que la vue tourne (la zone visible change sans moveend), zone dé-tournée comprise.
  function _cullerTuilesThrottle() {
    if (typeof window.ktaCullerTuilesV2Throttle === "function") window.ktaCullerTuilesV2Throttle();
  }

  // ── Bouton « recentrer » ──
  // Visible quand le suivi est désarmé (zoom ailleurs, recentrage refusé) ; retiré à l'arrêt du mode.
  function _trackingActif() {
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
    map.on("move zoom moveend zoomend viewreset", function() {
      if (Math.abs(_bearing) > 0.01) _appliquer();
    });
    // Un pan manuel (drag natif hors mode, ou notre pan) désarme le suivi.
    map.on("dragstart", function() {
      if (!_trackingActif() || !_suiviArme) return;
      _suiviArme = false;
      _majBoutonRecentrer();
    });
    // 🩸 La croix d'une popup est créée par Leaflet en FRÈRE du contenu : la contre-rotation ne l'atteint
    // pas et elle reste de travers. On l'adopte dans le contenu (Leaflet ne dépend que de son listener).
    map.on("popupopen", function(e) {
      if (!isActive() || !e || !e.popup) return;
      try {
        const el = e.popup.getElement();
        if (!el) return;
        const contenu = el.querySelector(".leaflet-popup-content-wrapper");
        const croix   = el.querySelector(".leaflet-popup-close-button");
        if (contenu && croix && croix.parentNode !== contenu) contenu.appendChild(croix);
      } catch(err) {}
    });

    console.log("[MapBearing] Hooks carte posés");
  }

  // ── API ──

  // Le mode tourne-t-il VRAIMENT la vue ? Toggle + tracking + aucune suspension + aucun mode « clic carte »
  // armé (dessin, mesure, recalage, pickers) — sinon on cliquerait dans un repère que Leaflet ignore.
  function isActive() {
    if (!_enabled || _suspensions.size > 0) return false;
    if (!window.map) return false;
    if (typeof window.getTrackingActif === "function" && !window.getTrackingActif()) return false;
    try {
      if (window._modeClicCarteActif && window._modeClicCarteActif()) return false;
    } catch(e) {}
    if (_modePleinEcranActif()) return false;
    return true;
  }

  // Modes plein écran qui veulent une vue DROITE (Secours, présentation, Perdu, replay, urgence).
  // 🩸 On LIT leur état au lieu de leur faire appeler suspend()/resume() : chacun a ses retours anticipés
  // et fermetures défensives, un couple suspend/resume s'y déséquilibre au premier chemin oublié — et une
  // suspension jamais levée est invisible (la carte cesse de tourner sans message).
  function _modePleinEcranActif() {
    try {
      if (window.LostMode && window.LostMode.isActive && window.LostMode.isActive()) return true;
      if (window.PresentationMode && window.PresentationMode.isActive &&
          window.PresentationMode.isActive()) return true;
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
      if (Math.abs(_bearing) > 0.01 || Math.abs(_cible) > 0.01) {
        // 🩸 Redressement IMMÉDIAT, pas animé : l'outil qui vient de couper le mode attend souvent un clic,
        // qui tomberait à côté pendant la rotation.
        reset();
      }
      return;
    }
    // Retour d'un mode qui avait la main : re-verrouillage.
    if (!_interactionsSauvees) _verrouiller(window.map);
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
    if (!latlng || !window.map) return;
    if (isActive() && _suiviArme) {
      try {
        // Sans animation : un pas fait quelques pixels. Le move réapplique l'origine.
        window.map.setView(latlng, window.map.getZoom(), { animate: false });
      } catch(e) {}
      return;
    }
    // Hors mode ou suivi désarmé : la carte ne suit pas, mais si la position sort de l'écran on propose le
    // retour.
    if (!_trackingActif()) return;
    try {
      if (_suiviArme && !window.map.getBounds().pad(-0.05).contains(latlng)) {
        _suiviArme = false;
      }
    } catch(e) {}
    _majBoutonRecentrer();
  }

  function recentrer() {
    _suiviArme = true;
    _majBoutonRecentrer();
    if (typeof window.getTrackingPosition === "function" && window.map) {
      try {
        const p = window.getTrackingPosition();
        if (p && typeof p.x === "number") {
          window.map.setView(window.convertCoord(p.x, p.y), window.map.getZoom(), { animate: true });
        }
      } catch(e) {}
    }
  }

  // Vue droite SANS toucher au choix de l'utilisateur.
  function reset() {
    _stopAnim();
    _bearing = 0; _cible = 0; _capLisse = null;
    _appliquer();
    _deverrouiller(window.map);
    // Vue droite : la zone visible redevient le rectangle de l'écran.
    _cullerTuilesThrottle();
    _majBoutonRecentrer();
  }

  function setEnabled(v) {
    _enabled = !!v;
    try { localStorage.setItem(LS_KEY, _enabled ? "1" : "0"); } catch(e) {}
    if (_enabled && isActive()) {
      _suiviArme = true;
      _verrouiller(window.map);
      recentrer();
    } else {
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
      _verrouiller(window.map);
      _suiviArme = true;
      console.log("[MapBearing] Reprise");
    }
  }

  function onTrackingChange(actif) {
    if (actif && _enabled) {
      _dernierPas = Date.now();   // on part « en marche », pas gelé
      _suiviArme = true;
      _verrouiller(window.map);
    } else {
      _capLisse = null;
      _dernierPas = 0;
      reset();
    }
  }

  // Boîte englobante de ce que l'écran montre VRAIMENT (une mesure, pas un facteur : cf plus haut).
  function zoneVisible(pad) {
    const map = window.map;
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

  window.MapBearing = {
    attachTo:         attachTo,
    isEnabled:        function() { return _enabled; },
    setEnabled:       setEnabled,
    isActive:         isActive,
    getBearing:       function() { return _bearing; },
    onHeading:        onHeading,
    onStep:           onStep,
    onTrackingChange: onTrackingChange,
    recentrer:        recentrer,
    reappliquer:      reappliquer,
    reset:            reset,
    suspend:          suspend,
    resume:           resume,
    zoneVisible:      zoneVisible
  };

  _enabled = _lireEnabled();
})();
