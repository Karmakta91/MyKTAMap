/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * Site : https://myktamap.fr
 * Licence : CC BY-NC-SA 4.0 — Usage commercial interdit sans accord ecrit prealable.
 * Voir LICENSE a la racine du projet.
 */

// =========================
// 🧭 MAP-BEARING — mode « plan orienté » (la carte tourne, pas l'icône)
// =========================
// En tracking actif, au lieu de faire pivoter l'icône du tracker dans un plan
// fixe, on fait pivoter TOUTE la vue pour que la direction de marche pointe
// vers le haut de l'écran (convention GPS auto dite « heading-up »).
// Désactivé par défaut, activable depuis la modale 🧭 Tracker.
//
// ─────────────────────────────────────────────────────────────────────────
// 🩸 POURQUOI UN PANE INTERCALAIRE, ET PAS LE MAP-PANE (mesuré, pas supposé)
// ─────────────────────────────────────────────────────────────────────────
// Leaflet positionne `.leaflet-map-pane` avec `transform: translate3d(...)`.
// Poser la rotation sur CE MÊME élément semble marcher — tant que la carte
// n'a jamais été panée. Dès que le translate est non nul, tout se décale :
//   bearing 30° → 414 px d'erreur · bearing 45° → 918 px d'erreur
// Cause : les propriétés CSS individuelles (`rotate`) s'appliquent AVANT
// `transform` (ordre spec : translate → rotate → scale → transform). La
// rotation fait donc pivoter le VECTEUR DE TRANSLATION lui-même.
// Même défaut avec `transform: rotate(...) translate3d(...)` réécrit à la main.
//
// La parade : un pane INTERCALAIRE (`.kta-rotate-pane`), inséré entre le
// map-pane et ses enfants. Il ne porte aucun transform de Leaflet, donc sa
// rotation est pure. Mesuré : écart modèle/réel 0,00 px sur 6 angles, après
// pan ET après zoom animé. C'est la structure qu'utilise aussi le plugin
// leaflet-rotate — on y arrive par le même chemin, sans patcher le cœur.
//
// ⚠️ `transform-origin` est exprimé en layerPoint : il DÉRIVE à chaque pan et
// à chaque zoom (53 px d'erreur après un simple pan si on ne le recalcule
// pas). D'où la réapplication sur `move`/`zoom`.
//
// ⚠️ Les panes créés par `map.createPane()` atterrissent dans le MAP-PANE,
// donc HORS de la rotation. Aucun appel sur la carte principale aujourd'hui
// (seul osmHomePreview en fait, sur son instance à lui) — mais un futur pane
// devra être créé dans `window._ktaRotatePane` pour tourner avec la vue.
//
// ─────────────────────────────────────────────────────────────────────────
// CE QUI TOURNE, ET CE QUI RESTE DROIT
// ─────────────────────────────────────────────────────────────────────────
// Tournent   : fond de plan, tuiles, tracés/zones/structures (canvas),
//              icônes POI (décision KARMA), heatmap, calques calibrés.
// Restent droits : contrôles Leaflet (ils vivent HORS du map-pane, gratuit),
//              labels de mesure et contenu des popups (contre-rotation CSS,
//              cf `--kta-bearing` et §CSS « contre-rotation »).
// Cas qui se règle tout seul : l'icône du tracker. Elle porte déjà
//              `rotate(+cap)` (tracking.js §28) et la vue tourne de `-cap` →
//              somme nulle : elle pointe vers le haut de l'écran, ce qui est
//              exactement la direction de marche. Rien à neutraliser.
//
// CLICS ET PAN SOUS ROTATION
// Leaflet convertit un point écran en point de calque sans connaître notre
// angle : jusqu'à 200 px d'écart à 90°. Deux méthodes sont donc adaptées
// (`containerPointToLayerPoint` / `layerPointToContainerPoint`) — tout le
// reste en dérive, y compris le hit-test du renderer canvas et les handlers
// `map.on("click")`. (Une SEULE méthode est patchée : `mouseEventToContainer­Point`,
// cf. le pavé qui l'entoure.) Les marqueurs, eux, n'ont jamais eu besoin de rien : le
// navigateur fait leur hit-test et sait lire un transform.
// Le pan, lui, est refait à la main pendant le mode : le drag de Leaflet
// déplace le map-pane d'un offset ÉCRAN, ce qui envoie la carte de travers de
// l'angle courant.
// =========================

(function() {
  "use strict";

  // Préférence d'appareil (pas une pref de plan) → localStorage direct,
  // comme WakeLock. Rien à déclarer dans config.js.
  const LS_KEY = "myktamap_map_bearing_v1";

  // Lissage VOLONTAIREMENT plus mou que celui de l'icône tracker
  // (tracking.js §28 : α=0.25, seuil 2°). Une icône de 30 px qui frémit se
  // tolère ; un plan entier qui frémit donne la nausée.
  const ALPHA       = 0.12;   // lissage exponentiel du cap
  const VITESSE_MAX = 90;     // °/s — plafond de vitesse de rotation
  const REPOS       = 0.15;   // ° — en deçà, la boucle d'animation s'arrête

  // 🩸 DEUX SEUILS, ET SURTOUT PAS DE GEL (retour terrain KARMA, 24/09/2026)
  // La v1 figeait la vue après 2,5 s sans pas détecté, pour empêcher le
  // magnétomètre de faire pivoter la carte pendant une pause. Mesuré au
  // harnais : en tournant sur place SANS avancer — le cas le plus fréquent,
  // on s'arrête justement pour se réorienter — la vue restait bloquée
  // **6,3 secondes** pendant que le cap faisait 140°. Vu de l'utilisateur :
  // « ça tourne, ça bugue et ça s'arrête, puis ça reprend ».
  // À la place : on suit TOUJOURS, avec un seuil de déclenchement plus haut
  // à l'arrêt. Une réorientation volontaire (≫ 15°) passe ; le frémissement
  // du magnétomètre (quelques degrés) ne passe pas.
  const SEUIL_MARCHE = 2;     // ° — en marche, on suit de près
  const SEUIL_ARRET  = 15;    // ° — à l'arrêt, il faut une vraie intention
  const MARCHE_MS    = 2500;  // ms depuis le dernier pas → on se dit « en marche »

  // 🩸 v1.97.3 — TROIS marges cohabitaient ici pour « le viewport tourné
  // déborde son rectangle », et DEUX étaient fausses (0,45 pour les tracés,
  // 0,35 pour les tuiles). La bonne valeur dépend du FORMAT de l'écran :
  // (grand côté / petit côté − 1)/2 — soit 0,19 sur le 1100×800 du harnais,
  // mais **0,58** sur un iPhone en portrait. Mes constantes tenaient au
  // harnais et pas en main. Mesuré sur 430×932 : jusqu'à **17,2 % de l'écran
  // jamais peint**, et 112 points sur 200 pris AU BORD de l'écran tenus pour
  // « hors vue » — donc des tracés et des POI qui s'effacent le long des
  // bords. Le checkup ne pouvait pas le voir : à son format, 0,35 suffit.
  //
  // On ne corrige donc pas les valeurs, on supprime le procédé : `zoneVisible`
  // rend la boîte englobante des QUATRE COINS RÉELS de l'écran. Exacte quel
  // que soit le format, et **moins chère** qu'une marge scalaire élargie
  // (mesuré : 66-132 tuiles gardées, contre 180 avec un pad de 0,7).
  //
  // Hors rotation elle rend `map.getBounds()` : le comportement d'avant, au
  // bit près, pour tous ses appelants (road.js, utils.js).

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

  // ===== Angles =====
  function _norm(deg)  { return ((deg % 360) + 360) % 360; }
  function _delta(a, b) {            // écart signé le plus court de a vers b
    let d = _norm(b) - _norm(a);
    if (d > 180)  d -= 360;
    if (d < -180) d += 360;
    return d;
  }

  // ===== Pane de rotation =====
  // Créé à la demande, une fois par instance de carte. La garde est portée
  // PAR LA MAP (`map._ktaRotatePane`) et jamais par `window` : la carte est
  // remplacée à chaque plan chargé, un drapeau global dirait « déjà fait »
  // pour une carte qui n'a rien (cf scripts/check-map-listeners.js).
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
    // `transform` classique (et pas la propriété individuelle `rotate`) :
    // ce pane ne porte aucun transform de Leaflet, donc aucun conflit — et
    // on reste compatible avec les Safari anciens.
    rot.style.transform = _bearing ? ("rotate(" + _bearing + "deg)") : "";
    const cont = map.getContainer();
    if (cont) {
      cont.style.setProperty("--kta-bearing", _bearing + "deg");
      cont.classList.toggle("kta-bearing-on", Math.abs(_bearing) > 0.01);
    }
    _cullerTuilesThrottle();
  }
  // Exposé pour un appelant futur (aucun aujourd'hui), au même titre que
  // `suspend`/`resume`. Idempotent.
  function reappliquer() { _appliquer(); }

  // ===== Boucle d'animation =====
  // On anime en JS plutôt qu'avec une transition CSS : la transition
  // désynchroniserait l'angle affiché des positions calculées par Leaflet
  // pendant toute sa durée, et on perdrait le plafond de vitesse.
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

  function _animer() {
    if (_rafId !== null) return;
    _dernierTick = 0;
    _rafId = requestAnimationFrame(_boucle);
  }

  function _stopAnim() {
    if (_rafId !== null) { cancelAnimationFrame(_rafId); _rafId = null; }
    _dernierTick = 0;
  }

  // ===== Interactions =====
  // Ce qu'on verrouille, c'est le drag DE LEAFLET, pas le pan : il déplace le
  // map-pane d'un offset écran et part donc de travers de l'angle courant
  // (mesuré : doigt à 0° → la carte part à 45°). Le pan est refait à la main
  // juste après (`_installerPanManuel`). Le zoom reste disponible mais recentré
  // (`'center'`) — Leaflet relit ces options à chaque geste, donc il suffit de
  // les changer, sans détacher les handlers.
  function _verrouiller(map) {
    if (!map || _interactionsSauvees) return;
    _interactionsSauvees = { dragging: map.dragging && map.dragging.enabled() };
    try { if (map.dragging) map.dragging.disable(); } catch(e) {}
    // 🩸 `dragging.disable()` retire la classe `leaflet-touch-drag`, et le
    // conteneur retombe alors en `touch-action: pan-x pan-y` : au doigt, le
    // NAVIGATEUR scrollerait la page au lieu de laisser notre pan agir.
    // La classe ci-dessous lui rend `touch-action: none` (cf style.css).
    const cont0 = map.getContainer();
    if (cont0) cont0.classList.add("kta-bearing-lock");
    _majPaddingRenderer(map, true);
    // 🩸 v1.97.4 — ces trois options valaient `"center"` : par prudence, je
    // forçais le zoom sur le centre de l'écran, de peur que le point visé
    // soit mal converti sous rotation. La peur n'avait plus lieu d'être une
    // fois `mouseEventToContainerPoint` patché — et le prix était lourd :
    // pincer ailleurs qu'au centre faisait glisser toute la carte.
    // Mesuré, dézoom au doigt hors centre : **95 px** de glissement avec
    // `"center"`, contre 27 px en rendant le zoom à Leaflet (puis ~0 une fois
    // le vol de geste corrigé ci-dessous). D'où le constat de KARMA : les
    // boutons +/− allaient bien, le doigt non.
    // On ne touche donc plus à ces options : Leaflet zoome entre les doigts,
    // et le patch des gestes lui donne les bons points.
    // Les vecteurs restent cliquables : les conversions écran↔carte sont
    // adaptées à la rotation (cf _installerPatchConversions).
    _installerPanManuel(map);
  }

  function _deverrouiller(map) {
    if (!map || !_interactionsSauvees) { _interactionsSauvees = null; return; }
    try { if (map.dragging && _interactionsSauvees.dragging) map.dragging.enable(); } catch(e) {}
    // (les options de zoom ne sont plus touchées depuis v1.97.4)
    const cont1 = map.getContainer();
    if (cont1) cont1.classList.remove("kta-bearing-lock");
    _majPaddingRenderer(map, false);
    map.options.touchZoom       = _interactionsSauvees.touchZoom;
    map.options.scrollWheelZoom = _interactionsSauvees.scrollWheelZoom;
    map.options.doubleClickZoom = _interactionsSauvees.doubleClickZoom;
    _interactionsSauvees = null;
  }

  // ===== Conversions écran ↔ carte =====
  // Leaflet convertit un point écran sans connaître notre rotation : jusqu'à
  // 200 px d'écart à 90° entre ce qu'on voit et ce qu'il calcule. Un clic sur
  // un tracé tombait à côté, et un clic dans le vide réveillait le tracé
  // d'ailleurs.
  //
  // 🩸 ON NE PATCHE QUE `mouseEventToContainerPoint`, le point d'ENTRÉE des
  // gestes. Premier essai : patcher `containerPointToLayerPoint` — plus
  // général, et faux. `L.Renderer._update()` s'en sert pour calculer le coin
  // de son canvas : le patch le faisait TOURNER au lieu de l'agrandir, et les
  // coins de l'écran cessaient d'être peints. Le checkup l'a vu (T9 est passé
  // au rouge) ; à l'œil, ça n'aurait été qu'un tracé qui s'arrête bizarrement.
  //
  // Tout ce qui lit un geste en dérive et devient juste sans autre patch :
  // `mouseEventToLayerPoint`, `mouseEventToLatLng`, le hit-test du renderer
  // canvas, les handlers `map.on("click")`, le pinch-zoom.
  //
  // ⚠️ Posé sur le PROTOTYPE, donc vu par les 5 autres cartes de l'app (Vue
  // OSM, minimap d'urgence, Secours, picker de calage, aperçu HOME). Il se
  // retire de lui-même : hors carte principale, ou dès que l'angle est nul,
  // il rend exactement ce que rendait Leaflet.
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
      // L'écran montre la carte tournée : on défait la rotation pour rendre
      // le point tel que Leaflet l'attend, dans une carte restée droite.
      const c = this.getSize().divideBy(2);
      const a = -_bearing * Math.PI / 180;
      const dx = p.x - c.x, dy = p.y - c.y;
      return L.point(dx * Math.cos(a) - dy * Math.sin(a) + c.x,
                     dx * Math.sin(a) + dy * Math.cos(a) + c.y);
    };

    console.log("[MapBearing] Gestes adaptés à la rotation");
  }

  // ===== Pan manuel =====
  // Le drag de Leaflet déplace le map-pane d'un offset ÉCRAN ; comme la
  // rotation vit sous ce pane, la carte part de travers de l'angle courant
  // (mesuré : doigt vers la droite → carte à 45°). Plutôt que de patcher
  // `L.Draggable` — partagé par les poignées, les marqueurs déplaçables et
  // les autres cartes — on garde le drag de Leaflet DÉSACTIVÉ pendant le mode
  // et on fait le pan nous-mêmes, dans le bon repère.
  //
  // Volontairement minimal : un doigt, pas d'inertie. Deux doigts → on laisse
  // la main au pinch-zoom de Leaflet.
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
        // 🩸 v1.97.4 — UN PINCH COMMENCE, et il commence toujours mal : entre
        // la pose du premier doigt et celle du second, le premier bouge de
        // quelques pixels. Mon pan s'engageait (seuil 6 px) et déplaçait la
        // carte AVANT que Leaflet ne voie le geste à deux doigts — mesuré :
        // 21 unités de plan volées sur un simple début de pincement. On rend
        // donc ce qu'on a pris, et on laisse le pinch travailler sur la vue
        // que l'utilisateur voyait en posant les doigts.
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
      // Seuil avant d'engager : sinon un simple tap deviendrait un pan et on
      // volerait le clic aux marqueurs.
      if (!engage && Math.hypot(dx, dy) < 6) return;
      engage = true;
      depart = { x: e.clientX, y: e.clientY };
      // Le doigt parle en coordonnées ÉCRAN, la carte en coordonnées de
      // calque : on défait la rotation avant de lui transmettre le geste.
      const a = -_bearing * Math.PI / 180;
      const px = dx * Math.cos(a) - dy * Math.sin(a);
      const py = dx * Math.sin(a) + dy * Math.cos(a);
      try {
        map.panBy([-px, -py], { animate: false });
        // 🩸 `panBy({animate:false})` passe par `_rawPanBy`, qui NE limite PAS
        // le centre : pendant le mode, la vue s'échappait des `maxBounds` du
        // plan (pourtant posés avec `maxBoundsViscosity: 1.0`), et le zoom
        // suivant la ramenait d'un coup — mesuré : 150 unités de plan après
        // 60 pans, ce qui se lit « au zoom, tout se décale ». Le drag natif de
        // Leaflet, lui, applique la contrainte en continu ; on fait pareil.
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

  // ===== Canvas du renderer =====
  // Leaflet dimensionne le canvas des vecteurs au viewport + 10 % (option
  // `padding`). Une fois la vue tournée, ce rectangle ne couvre plus les
  // coins de l'écran : les tracés s'y arrêtent net, dès ~10° de rotation.
  //
  // Le padding qui couvre TOUS les angles vaut (diagonale / petit côté − 1)/2.
  // Il CROÎT avec l'allongement de l'écran : 0,36 en 1100×800, 0,69 sur un
  // téléphone en portrait. On le calcule donc sur la taille réelle du
  // viewport au lieu de figer une constante — c'est exactement l'erreur que
  // les deux marges de culling ont commise, cf. `zoneVisible` —, et on ne
  // l'applique QUE pendant le mode : le canvas grandit d'autant (×1,8 à ×3,5
  // en surface), ce n'est pas un coût à faire porter à tout le monde.
  function _majPaddingRenderer(map, actif) {
    const r = map && map._renderer;   // renderer par défaut (preferCanvas)
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

  // ===== Tuiles hors écran =====
  // 🩸 RÉGRESSION v1.97.0, trouvée en terrain par KARMA (iPhone, plan 16332 px,
  // dézoom à fond) : des pans entiers du fond restaient noirs, alors que les
  // logs disaient « 56 tuiles affichées » sans aucune manquante — donc tout
  // était résolu et posé sur la carte.
  //
  // Cause : le tuilage V2 met sur la carte TOUTES les tuiles du niveau, même
  // hors écran (à z=-2 sur ce plan : 4083 × 3000 px de contenu pour un écran
  // de 430 px). Sans rotation, le navigateur ne peint que la partie visible.
  // Avec notre pane transformé, iOS doit composer le sous-arbre en une couche
  // et renonce à en peindre une partie au-delà de ses limites de texture.
  // D'où : uniquement en mode actif, uniquement sur les grands plans, et
  // uniquement au zoom où le niveau le plus lourd est affiché.
  //
  // La parade : pendant le mode, on retire de la carte les tuiles qui ne
  // croisent pas le viewport élargi. On ne remet QUE celles qu'on a retirées
  // (drapeau `_ktaCulled`) — sans ça on rendrait visibles des tuiles que le
  // filtre multi-niveau avait volontairement masquées.
  const MARGE_TUILES = 0.15;        // anti pop-in, AUTOUR de la zone exacte
  let _cullEnCours = false;

  function _cullerTuiles(forcerTout) {
    const map = window.map;
    const st = window._tilingV2State;
    if (!map || !st || !Array.isArray(st.activeOverlays) || !st.activeOverlays.length) return;
    const actif = !forcerTout && isActive() && Math.abs(_bearing) > 0.01;
    let zone = null;
    if (actif) {
      // Zone RÉELLE (coins de l'écran dé-tournés), pas le rectangle non
      // tourné de `getBounds()` — c'est toute la différence.
      zone = zoneVisible(MARGE_TUILES);
      if (!zone) return;
    }
    let retirees = 0, rendues = 0;
    st.activeOverlays.forEach(function(ov) {
      if (!ov || typeof ov.getBounds !== "function") return;
      let dedans = true;
      if (zone) {
        try { dedans = zone.intersects(ov.getBounds()); } catch(e) { dedans = true; }
      }
      const surCarte = map.hasLayer(ov);
      if (!dedans && surCarte) {
        try { map.removeLayer(ov); ov._ktaCulled = true; retirees++; } catch(e) {}
      } else if (dedans && !surCarte && ov._ktaCulled) {
        // Uniquement celles que NOUS avons retirées : une tuile absente pour
        // une autre raison (filtre multi-niveau) doit le rester.
        try { ov.addTo(map); ov._ktaCulled = false; rendues++; } catch(e) {}
      }
    });
    if (retirees || rendues) {
      console.log("[MapBearing] Tuiles hors écran : " + retirees + " retirée(s), " +
                  rendues + " rendue(s) — " + st.activeOverlays.length + " au total");
    }
  }

  // Le tuilage repose ses tuiles à chaque changement de niveau (zoomend) : on
  // repasse derrière lui, après coup, et jamais plus d'une fois par frame.
  function _cullerTuilesThrottle() {
    if (_cullEnCours) return;
    _cullEnCours = true;
    requestAnimationFrame(function() {
      _cullEnCours = false;
      try { _cullerTuiles(false); } catch(e) {}
    });
  }

  // ===== Bouton « recentrer » =====
  // Apparaît seulement si l'utilisateur a désarmé le suivi (il a zoomé
  // ailleurs, ou un recentrage a été refusé). Retiré dès que le mode s'arrête.
  function _trackingActif() {
    try {
      return typeof window.getTrackingActif === "function" && window.getTrackingActif() === true;
    } catch(e) { return false; }
  }

  // 🎯 Le bouton ne dépend PAS du mode « plan orienté » (demande KARMA,
  // 24/09/2026) : dès que le tracker tourne, savoir revenir sur soi a du sens,
  // que la carte pivote ou non. Sans le mode, il n'y a simplement pas de suivi
  // automatique — le bouton est le seul chemin de retour, et il apparaît quand
  // l'utilisateur s'est éloigné (pan manuel) ou quand sa position sort de
  // l'écran en marchant.
  // 🩸 Le bas-centre de l'écran est un carrefour : le bouton « ↩️ Retour »
  // d'un saut de portail y vit (84 px), comme « portail suivant » (74 px), le
  // picker de Nord (80 px) et les floaters d'outils. Se poser en dur à une
  // hauteur fixe, c'est se superposer à l'un d'eux tôt ou tard — signalé par
  // KARMA sur le bouton Retour.
  // On ne fige donc aucune hauteur : on mesure ce qui est là et on se place
  // au-dessus. Ajouter un flottant à cette liste suffira pour le suivant.
  const FLOATERS_BAS = ["#kta-ipl-back-float", ".kta-ipr-next-float",
                        ".kta-iti-floater", ".kta-north-picker-overlay",
                        ".kta-supp-trace-floater"];

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
    // 10 px d'air au-dessus du flottant le plus haut.
    _btnRecentrer.style.bottom = Math.max(0, Math.round(window.innerHeight - sommet + 10)) + "px";
  }

  // Les flottants apparaissent et disparaissent tout seuls (le Retour a son
  // propre minuteur) : on observe les enfants directs de <html>, là où ils
  // sont posés. childList sans subtree = quasi gratuit, et seulement tant que
  // notre bouton existe.
  let _observateurFloaters = null;
  function _observerFloaters(actif) {
    if (actif && !_observateurFloaters && typeof MutationObserver === "function") {
      _observateurFloaters = new MutationObserver(function() { _placerBoutonRecentrer(); });
      _observateurFloaters.observe(document.documentElement, { childList: true });
    } else if (!actif && _observateurFloaters) {
      try { _observateurFloaters.disconnect(); } catch(e) {}
      _observateurFloaters = null;
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

  // ===== Hooks carte =====
  // Garde portée par la map (jamais par window) : la carte change à chaque
  // plan chargé.
  function attachTo(map) {
    _installerPatchConversions();
    if (!map || map._ktaBearingHooked) return;
    map._ktaBearingHooked = true;
    map.on("move zoom moveend zoomend viewreset", function() {
      if (Math.abs(_bearing) > 0.01) _appliquer();
    });
    // Après le swap de niveau du tuilage (il repose toutes ses tuiles) et
    // après chaque déplacement : on retire celles qui sont hors écran.
    map.on("moveend zoomend", _cullerTuilesThrottle);
    // Un pan manuel (s'il redevient possible) désarme le suivi.
    // Vaut pour le drag natif de Leaflet (mode inactif) comme pour notre pan
    // manuel : dans les deux cas l'utilisateur vient de partir voir ailleurs.
    map.on("dragstart", function() {
      if (!_trackingActif() || !_suiviArme) return;
      _suiviArme = false;
      _majBoutonRecentrer();
    });
    // 🩸 La croix de fermeture d'une popup est créée par Leaflet comme FRÈRE
    // du contenu (`create('a', …, container)`), pas comme son enfant : la
    // contre-rotation du contenu ne l'atteint donc pas, et elle restait de
    // travers, décrochée du coin de la bulle (signalé par KARMA le
    // 24/09/2026). On l'adopte dans le contenu, où elle est redressée avec
    // lui ; Leaflet ne dépend pas de son parent, seulement de son listener.
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

  // ===== API =====

  // Le mode est-il RÉELLEMENT en train de tourner la vue ?
  // Il faut le toggle, un tracking en cours, aucune suspension, et aucun mode
  // « clic carte » armé (dessin, mesure, recalage, pickers) — sinon on
  // cliquerait dans un repère tourné que Leaflet ne connaît pas.
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

  // Modes plein écran qui ont besoin d'une vue DROITE (coordination Secours,
  // présentation, Mode perdu, replay, urgence).
  //
  // 🩸 On LIT leur état au lieu de leur faire appeler suspend()/resume() :
  // chacun a ses retours anticipés et ses fermetures défensives (Secours
  // appelle `fermer()` en début d'`ouvrir()`, Replay abandonne si la timeline
  // fait moins de 2 points, Présentation sort si déjà active). Un couple
  // suspend/resume posé dans ces fonctions se déséquilibre au premier chemin
  // oublié — et une suspension jamais levée est invisible : la carte cesse
  // simplement de tourner, sans message. Lire l'état ne peut pas dériver.
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

  // Appelé par tracking.js à chaque événement d'orientation, avec le cap
  // EXPRIMÉ DANS LE REPÈRE DU PLAN (offset Nord déjà appliqué).
  function onHeading(capPlan) {
    if (typeof capPlan !== "number" || isNaN(capPlan)) {
      // Appel sans argument : on relit la source de vérité (repère plan).
      if (typeof window.getPlanRelHeading !== "function") return;
      capPlan = window.getPlanRelHeading();
      if (typeof capPlan !== "number" || isNaN(capPlan)) return;
    }
    // Le mode peut devenir inapplicable SANS que personne nous prévienne :
    // l'utilisateur arme un outil de dessin, ouvre le Mode Secours… On le
    // détecte ici (seul chemin appelé en continu pendant le suivi) et on
    // REDRESSE la vue au lieu de la laisser figée de travers.
    if (!isActive()) {
      if (Math.abs(_bearing) > 0.01 || Math.abs(_cible) > 0.01) {
        // 🩸 Redressement IMMÉDIAT, pas animé : ce qui vient de désactiver le
        // mode, c'est souvent un outil qui attend un clic sur la carte
        // (mesure, dessin, picker). Redresser en 2 s laisserait l'utilisateur
        // cliquer pendant la rotation — son point atterrirait à côté.
        reset();
      }
      return;
    }
    // Retour d'un mode qui avait la main : on re-verrouille la carte.
    if (!_interactionsSauvees) _verrouiller(window.map);
    if (_capLisse === null) _capLisse = _norm(capPlan);
    else _capLisse = _norm(_capLisse + _delta(_capLisse, capPlan) * ALPHA);
    // « heading-up » : la direction de marche pointe vers le haut de l'écran,
    // donc la vue tourne de l'opposé du cap.
    const vise = _norm(-_capLisse);
    // En marche, on suit de près. À l'arrêt, il faut une intention claire —
    // mais on finit TOUJOURS par suivre (cf le commentaire des seuils).
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
        // `animate: false` : un pas fait quelques pixels, une animation par
        // pas saccaderait. Le move déclenche la réapplication de l'origine.
        window.map.setView(latlng, window.map.getZoom(), { animate: false });
      } catch(e) {}
      return;
    }
    // Hors mode (ou suivi désarmé) : la carte ne suit pas — c'est le
    // comportement historique et on n'y touche pas. Mais si la position sort
    // de l'écran en marchant, on propose le retour.
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

  // Remet la vue droite SANS toucher au choix de l'utilisateur.
  function reset() {
    _stopAnim();
    _bearing = 0; _cible = 0; _capLisse = null;
    _appliquer();
    _deverrouiller(window.map);
    // La vue est droite : plus de couche de compositing, plus de raison de
    // priver le fond de ses tuiles.
    try { _cullerTuiles(true); } catch(e) {}
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

  // Suspension explicite, pour un appelant qui n'expose pas d'état lisible
  // (les modes connus, eux, sont détectés par `_modePleinEcranActif`).
  // Indexée par RAISON et non par compteur : suspendre deux fois la même
  // raison ne compte qu'une fois, et `resume(raison)` lève toujours la
  // bonne — il n'y a donc pas d'appairage à tenir.
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

  // Appelé au démarrage / à l'arrêt du tracking par tracking.js.
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

  // Boîte englobante de ce que l'écran montre VRAIMENT. Voir le pavé sur les
  // marges, plus haut : c'est lui qui explique pourquoi ceci n'est pas un
  // facteur mais une mesure.
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
        // Les 4 coins du conteneur, dé-tournés comme le fait le patch des
        // gestes : on obtient les points de calque réellement aux coins.
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
