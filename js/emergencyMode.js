/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * Site : https://myktamap.fr
 * Licence : CC BY-NC-SA 4.0 — Usage commercial interdit sans accord ecrit prealable.
 * Voir LICENSE a la racine du projet.
 */

// =========================
// 🚨 MODE URGENCE — v1.10.1
// =========================
// Bouton "panique" qui affiche un écran simplifié plein écran avec les infos
// VITALES en GROS :
//   - Position tracker : GPS lat/lng si le plan est calibré KMZ, sinon px du
//     plan — UN SEUL des deux depuis le 26/09/2026 (KARMA)
//   - Heading boussole en temps réel (gros chiffres + flèche compas)
//   - Échelle plan
//   - Bouton "Sortir" gros et visible
//
// Différent du ⛑️ "Je suis perdu" (sous-action existante du Tracker) qui
// calcule une zone théorique de recherche. Ici c'est juste de l'AFFICHAGE
// d'informations vitales — pas de calcul. Utile quand l'utilisateur veut
// son cap + sa position en grand sans avoir à zoomer / lire un label en 11px.
//
// 2 thèmes selon le contexte d'usage :
//   - 🌑 Sombre (défaut) : visibilité nocturne sous terre, économise l'œil
//   - 🔆 Clair : transforme l'écran en lampe d'appoint (max brightness)
//
// Polling 250ms pour update position + heading en temps réel.
//
// API publique :
//   window.EmergencyMode = {
//     activer, desactiver, isActif, toggle, setTheme
//   };
// =========================

(function() {
  "use strict";

  const POLL_MS = 250;

  let _overlay      = null;
  let _pollTimer    = null;
  let _theme        = "dark";   // "dark" | "light"
  let _lastHeadingShown = null; // throttle DOM update
  // 🆕 v1.11.2-fix : listener orientationchange/resize pour invalidateSize
  // de la minimap. Posé à l'activer(), retiré au desactiver(). Géré au scope
  // module pour pouvoir l'ajouter ET le retirer proprement.
  let _orientationListener = null;

  // 🔧 v1.13.0 (KARMA "on réactive itinéraire sans le menu cocher comme
  // avant, on le voyait bien si ca crashait pas") : la toggle conditionnelle
  // est retirée. L'itinéraire est désormais toujours affiché dans la minimap
  // (avec décimation + halo blanc + cyan vif pour visibilité). La cause
  // racine du crash n'était pas l'itinéraire mais l'image JPG volumineuse,
  // désormais gérée par l'anti-crash + V2 viewport-aware tiles (v1.12.0).
  // Note : l'ancienne clé localStorage "myktamap_emergency_show_iti_v1" reste
  // sans effet, sera nettoyée automatiquement au prochain reset complet.

  // 🔧 v1.10.2-fix1 (KARMA "comportement de saut comme on avait avant car
  // il peut pas faire plus que un tour complet") : pattern rotation
  // unwrapped — même fix que tracking.js > _trackerRotationUnwrapped
  // (v1.9.2-fix10). La CSS transition rotate(deg) interprète les valeurs
  // littéralement (350°→10° = -340° animation arrière). On cumule donc
  // les deltas courts pour que la valeur appliquée au CSS soit toujours
  // dans le bon sens visuel (peut être -10, 370, 720, -45… visuellement
  // identique mais le CSS anime toujours par le chemin court).
  let _compassUnwrapped = null;
  let _compassLastRaw   = null;
  // 🩸 v1.97.6 — vrai seulement quand les rotors de la boussole ont été
  // RÉELLEMENT posés (la minimap naît 100 ms après le premier tick).
  let _rotorsPoses      = false;

  // 🆕 v1.10.2 (KARMA "afficher dans le carré de la boussole derrière,
  // l'endroit où on est localisé sur la carte en zoom max et auto focus") :
  // mini L.map secondaire dans le carré compass qui partage les image
  // layers du plan principal + un marker tracker au centre.
  let _miniMap         = null;
  let _miniTrackerMark = null;
  // 🆕 v1.10.2-fix4 (KARMA "affiche les roads, c'est utile pour trouver
  // son chemin en mode urgence") : layers polylines roads + itinéraire
  // rendus sur le minimap. Stockés pour cleanup au destroy.
  let _miniRoadLayers      = [];
  // 🆕 v1.10.2-fix5 (KARMA "pareil pour zone et structure") : layers
  // zones (polygons) + structures (polygons + polylines fronts).
  let _miniZoneLayers      = [];
  let _miniStructureLayers = [];

  // ============================================================
  // FORMAT HELPERS
  // ============================================================
  function _formatXY(pos) {
    if (!pos || typeof pos.x !== "number" || typeof pos.y !== "number") return null;
    return Math.round(pos.x) + "  /  " + Math.round(pos.y);
  }

  // 🌍 Transform de calibrage KMZ du plan courant, ou null.
  //
  // 🐛 v1.21.1 (audit fix #1, critique sécurité) : avant on cherchait
  // `calib.transform` qui n'est JAMAIS persisté par KmzExport.setCalibration
  // (qui stocke uniquement {pointA, pointB}). Clone exact du bug fix4 dans
  // gpxIO.js. Conséquence : le bloc GPS du mode urgence ÉTAIT TOUJOURS MASQUÉ,
  // même pour un plan calibré. Pile la situation où l'user en a besoin
  // (perdu en cata, secours à guider).
  // Fix : construire le transform à la demande via KmzExport.buildTransform
  // (pattern identique à gpxIO.js > _getTransform après v1.21.0-fix4).
  //
  // 📍 26/09/2026 : extrait de `_tick` sans changement de logique — le
  // bloc position doit savoir s'il y a du GPS avant de choisir son label.
  function _transformCalib() {
    const planId = window._currentLoadedPlanId || "default";
    const calib  = (window.KmzExport && typeof window.KmzExport.getCalibration === "function")
                   ? window.KmzExport.getCalibration(planId) : null;
    if (!calib || !calib.pointA || !calib.pointB
        || typeof window.KmzExport.buildTransform !== "function") return null;
    const pA = calib.pointA, pB = calib.pointB;
    const _isNum = function(v) { return typeof v === "number" && Number.isFinite(v); };
    if (!(_isNum(pA.x) && _isNum(pA.y) && _isNum(pA.lat) && _isNum(pA.lng)
          && _isNum(pB.x) && _isNum(pB.y) && _isNum(pB.lat) && _isNum(pB.lng))) return null;
    try {
      return window.KmzExport.buildTransformCalib(calib);   // 📐 v1.73.0 : pointC optionnel propagé (affine)
    } catch(e) {
      // Calibrage présent mais dégénéré (points colinéaires, etc.)
      return null;
    }
  }

  function _formatGPS(transform, pos) {
    if (!transform || !pos) return null;
    if (!window.KmzExport || typeof window.KmzExport.planToGps !== "function") return null;
    try {
      const gps = window.KmzExport.planToGps(transform, pos.x, pos.y);
      if (!gps || typeof gps.lat !== "number" || typeof gps.lng !== "number") return null;
      // Format DD.dddddd (6 décimales = ~11 cm de précision, suffisant pour usage terrain)
      return gps.lat.toFixed(6) + "  /  " + gps.lng.toFixed(6);
    } catch(e) {
      console.warn("[Emergency] _formatGPS :", e);
      return null;
    }
  }

  // Heading texte cardinal (N, NE, E, etc.)
  function _formatHeading(h) {
    if (typeof h !== "number" || isNaN(h)) return { num: "—", card: "" };
    const norm = ((h % 360) + 360) % 360;
    const dirs = ["N","NE","E","SE","S","SO","O","NO"];
    const idx = Math.round(norm / 45) % 8;
    return {
      num:  norm.toFixed(0) + "°",
      card: dirs[idx]
    };
  }

  // ============================================================
  // UI
  // ============================================================
  function _buildOverlay() {
    const t = window.I18n.t.bind(window.I18n);
    const overlay = document.createElement("div");
    overlay.id = "kta-emergency-overlay";
    overlay.className = "kta-emergency-overlay kta-emergency-" + _theme;
    overlay.innerHTML =
      '<div class="kta-emergency-box">' +
        // 🧹 26/09/2026 (KARMA) — LE HEADER PORTE CE QUI ÉTAIT EN BAS.
        //
        // Le bloc « ÉCHELLE / PLAN / ÉTAT » occupait une pleine largeur de
        // grille en bas de l'écran pour trois lignes qu'on ne lit qu'une
        // fois : il devient deux puces dans le header, et le nom du plan
        // devient le sous-titre. Place rendue à la minimap, qui est la
        // seule chose qu'on regarde vraiment quand on est perdu.
        //
        // 🔧 v1.13.0 : toggle 🗺️ Itinéraire RETIRÉ. L'itinéraire actif est
        // toujours affiché dans la minimap (anti-crash JPG géré séparément
        // par _resolveMiniMapImageSource depuis v1.12.0).
        // 🧹 26/09/2026 : le bouton clair/sombre aussi — il datait de
        // l'époque où seul cet écran savait s'éclairer. `activer()` lit
        // `ThemeManager.isLight()` depuis la v1.23.0 : le mode urgence suit
        // le thème de l'app, il n'y a plus de second réglage à comprendre.
        '<div class="kta-emergency-header">' +
          '<div class="kta-emergency-header-main">' +
            '<span class="kta-emergency-titre">' + t("emergency.header.titre") + '</span>' +
            '<span class="kta-emergency-plan-nom" id="kta-em-plan">—</span>' +
          '</div>' +
          '<div class="kta-emergency-etats">' +
            '<span class="kta-emergency-chip" id="kta-em-echelle">—</span>' +
            '<span class="kta-emergency-chip" id="kta-em-etat">—</span>' +
          '</div>' +
        '</div>' +

        '<div class="kta-emergency-grid">' +

          // 📍 26/09/2026 (KARMA) — UNE SEULE POSITION, JAMAIS LES DEUX.
          // Plan calibré → le bloc affiche le GPS (les seules coordonnées
          // transmissibles à des secours) ; plan non calibré → le X/Y du
          // plan. Le label suit la donnée (cf `_tick`). Deux couples de
          // chiffres à lire sur un écran fait pour être compris d'un coup
          // d'œil, quand on n'en a qu'un à donner, c'était un de trop.
          '<div class="kta-emergency-bloc">' +
            '<div class="kta-emergency-label" id="kta-em-pos-label">' + t("emergency.label.position") + '</div>' +
            '<div class="kta-emergency-value kta-emergency-pos-xy" id="kta-em-pos-xy">— / —</div>' +
            '<div class="kta-emergency-sub" id="kta-em-pos-status"></div>' +
          '</div>' +

          '<div class="kta-emergency-bloc kta-emergency-bloc-heading">' +
            // 🆕 v1.10.2-fix3 (KARMA "le minimap doit prendre tout le
            // rectangle cap") : minimap Leaflet en background du bloc
            // entier (rectangle full width), pas juste le rond compass.
            // 🔧 v1.12.0-fix (KARMA "on mais le centre de la bousole
            // triangle rouge a ma position, et le rond rouge sur le cercle
            // jaune bouge pour indiquer le nord") : le gros compass widget
            // centré sur la minimap est RETIRÉ. La boussole devient un
            // marker L.divIcon attaché à la position du tracker sur la
            // minimap (cf _initMiniMapAvecSource + _tick). Le bloc heading
            // garde uniquement le label CAP + degrés + cardinal en overlay
            // texte (les chiffres restent lisibles en grand).
            '<div class="kta-emergency-mini-map" id="kta-em-mini-map"></div>' +
            // 🔧 v1.12.0-fix (KARMA "met le SE/S/N en dessous de CAP plus
            // logique, et descend encore un peu les degrés vu qu'on a
            // gagné de la place en bas") : layout final
            //   - TOP    : 🧭 CAP (gras orange) + cardinal (SE/S/...)
            //   - CENTRE : minimap + marker boussole (libre)
            //   - BOTTOM : degrés en gros (187°)
            '<div class="kta-emergency-bloc-heading-overlay">' +
              '<div class="kta-emergency-heading-top">' +
                '<div class="kta-emergency-label">' + t("emergency.label.cap") + '</div>' +
                '<div class="kta-emergency-heading-card" id="kta-em-heading-card">—</div>' +
              '</div>' +
              '<div class="kta-emergency-value kta-emergency-heading-num" id="kta-em-heading-num">—</div>' +
            '</div>' +
          '</div>' +

        '</div>' +

        // 🧹 26/09/2026 (KARMA) — l'encart rouge « ce mode désactive
        // l'interface principale… » est RETIRÉ : quatre lignes de conseils
        // généraux au-dessus du seul bouton de sortie, sur un écran qu'on
        // ouvre quand on est perdu. Ce qu'il faut faire quand on est perdu
        // vit dans la doc (Aide → Mode Secours), pas en travers de l'écran
        // qui doit répondre « où suis-je » en une seconde.
        '<button class="kta-emergency-exit-btn" id="kta-emergency-exit" type="button">' +
          t("emergency.exitBtn") +
        '</button>' +

      '</div>';
    return overlay;
  }

  function _bindOverlay() {
    if (!_overlay) return;
    document.getElementById("kta-emergency-exit").addEventListener("click", desactiver);

    // 🔧 v1.13.0 : handlers de la toggle 🗺️ Itinéraire RETIRÉS (toggle
    // supprimée du HTML). L'itinéraire est toujours rendu dans la minimap
    // via _addRoadsToMiniMap (avec décimation + halo blanc).

    // Echap = sortie (cas PC). Sur mobile : bouton ↩️
    document.addEventListener("keydown", _onKey);
  }

  function _onKey(ev) {
    if (ev.key === "Escape") {
      ev.preventDefault();
      desactiver();
    }
  }

  // ============================================================
  // POLLING — update temps réel
  // ============================================================
  function _tick() {
    if (!_overlay) return;

    // 📍 Position : GPS si le plan est calibré, X/Y du plan sinon.
    // JAMAIS LES DEUX (26/09/2026, KARMA) — le label du bloc suit la donnée,
    // et le sous-titre d'état (« position de départ », « tracker actif »…)
    // reste sous les chiffres dans les deux cas : une coordonnée GPS calculée
    // depuis une position jamais confirmée doit le dire, c'est celle-là qu'on
    // dicte au téléphone.
    const pos = (typeof window.getTrackingPosition === "function") ? window.getTrackingPosition() : null;
    const posEl    = document.getElementById("kta-em-pos-xy");
    const labelEl  = document.getElementById("kta-em-pos-label");
    const statusEl = document.getElementById("kta-em-pos-status");
    const gpsTxt   = pos ? _formatGPS(_transformCalib(), pos) : null;
    if (labelEl) {
      labelEl.textContent = window.I18n.t(gpsTxt ? "emergency.label.gps" : "emergency.label.position");
    }
    // Les floats GPS sont plus longs que deux entiers : même bloc, taille adaptée.
    if (posEl) posEl.classList.toggle("kta-emergency-pos-gps", !!gpsTxt);
    if (pos) {
      // `_formatXY` peut rendre null (position non numérique) : sans ce repli
      // le bloc affichait le texte « null ».
      if (posEl) posEl.textContent = gpsTxt || _formatXY(pos) || "—  /  —";
      if (statusEl) {
        const trackingActif = !!(typeof window.getTrackingActif === "function" && window.getTrackingActif());
        // 📍 B1 (audit 13/09/2026) : une position jamais confirmée est le
        // DÉPART DU PLAN, pas « ta dernière position » — cet écran est un
        // afficheur, il le dit au lieu de demander.
        const etat = (typeof window.getTrackingPositionEtat === "function")
          ? window.getTrackingPositionEtat() : null;
        statusEl.textContent = trackingActif
          ? window.I18n.t("emergency.status.trackerActif")
          : (etat && !etat.confirmee)
            ? window.I18n.t("emergency.status.positionDefaut")
            : window.I18n.t("emergency.status.dernierePosition");
      }
      // 🆕 v1.10.2 : auto-focus du minimap sur la position
      _updateMiniMap(pos);
    } else {
      if (posEl) posEl.textContent = "—  /  —";
      if (statusEl) statusEl.textContent = window.I18n.t("emergency.status.aucunePosition");
    }

    // 🧭 Heading (boussole)
    // 🧭 v1.37.0 — Bascule de getCurrentHeading() (Nord vrai) vers
    // getPlanRelHeading() (Nord plan = avec offset calibré). KARMA feedback
    // "fonctionne en map mais pas appliqué en mode urgence" : sans ce switch
    // le rotor + triangle restaient orientés Nord vrai, donc incohérents avec
    // la map principale (qui applique l'offset). Fallback safe sur
    // getCurrentHeading si helper pas dispo (code chargé en cascade).
    // Default offset=0 → strictement identique à getCurrentHeading() →
    // rétrocompat plans Nord-haut intacte.
    let heading = null;
    if (typeof window.getPlanRelHeading === "function") {
      heading = window.getPlanRelHeading();
    } else if (typeof window.getCurrentHeading === "function") {
      heading = window.getCurrentHeading();
    }
    if (typeof heading === "number" && !isNaN(heading)) {
      // Throttle DOM update à 1° près (sinon ça flicker au moindre mouvement)
      const rounded = Math.round(heading);
      // 🩸 v1.97.6 — LA BOUSSOLE CONTREDISAIT SON PROPRE TEXTE.
      // Ce garde anti-scintillement s'armait au tout premier tick, alors que
      // la minimap (créée 100 ms plus tard) n'existait pas encore : les
      // rotors sortaient sur `if (!iconEl) return` et on ne repassait plus
      // jamais ici. Mesuré, cap stable à 137° : point « Nord » à midi et
      // triangle vers le haut, pendant que les chiffres affichaient
      // « 137° SE ». Invisible en marchant — le moindre degré répare — et
      // bien présent dans le cas qui compte : téléphone posé, cap figé,
      // quelqu'un qui cherche à se repérer. D'où `|| !_rotorsPoses`.
      if (rounded !== _lastHeadingShown || !_rotorsPoses) {
        _lastHeadingShown = rounded;
        const fmt = _formatHeading(heading);
        const numEl  = document.getElementById("kta-em-heading-num");
        const cardEl = document.getElementById("kta-em-heading-card");
        if (numEl)  numEl.textContent  = fmt.num;
        if (cardEl) cardEl.textContent = fmt.card;
        // 🔧 v1.10.2-fix1 : rotation unwrapped (cumul des deltas courts)
        // pour que le passage 350° → 10° = +20° au lieu de -340° (tour
        // arrière). Même pattern que tracking.js _trackerRotationUnwrapped.
        if (_compassLastRaw === null) {
          _compassUnwrapped = heading;
        } else {
          let delta = heading - _compassLastRaw;
          if (delta > 180)  delta -= 360;
          if (delta < -180) delta += 360;
          _compassUnwrapped += delta;
        }
        _compassLastRaw = heading;
        // 🔧 v1.12.0-fix (KARMA "le rond rouge sur le cercle jaune bouge
        // pour indiquer le nord") : on tourne le rotor qui porte le point
        // Nord à -heading. Carte North-up → quand l'user fait face au N,
        // le point reste au sommet (12h). Face à l'Est, le N est à GAUCHE
        // dans la perspective de marche → rotation -90° (le point passe
        // à 9h). Etc. Cohérent boussole physique tenue dans la main.
        // Minimap tournée : elle porte elle-même l'orientation, le point
        // Nord n'a plus à contre-tourner (sinon il compenserait deux fois).
        const okNord = _updateTrackerNorthRotor(
          _minimapTourne() ? 0 : -_compassUnwrapped);
        // 🔧 v1.12.0-fix (KARMA "le triangle ne tourne plus dans la
        // direction où on va, comme icône tracker") : rotation +heading
        // pour que la pointe du triangle pointe la direction de marche
        // (même convention que l'icône tracker map principale).
        // Le triangle, lui, ne change pas : son `+cap` annule le `-cap` du
        // conteneur — même somme nulle que l'icône du tracker sur la carte
        // principale, il pointe donc toujours la direction de marche.
        const okTri = _updateTrackerTriangleRotor(_compassUnwrapped);
        _rotorsPoses = okNord && okTri;
        _appliquerRotationMinimap(_compassUnwrapped);
      }
    } else {
      const numEl  = document.getElementById("kta-em-heading-num");
      const cardEl = document.getElementById("kta-em-heading-card");
      if (numEl)  numEl.textContent  = "—";
      if (cardEl) cardEl.textContent = window.I18n.t("emergency.heading.boussoleIndispo");
    }

    // 📏 Échelle (statique mais peut changer au plan switch)
    const echEl = document.getElementById("kta-em-echelle");
    if (echEl) {
      const scale = window.APP_CONFIG && window.APP_CONFIG.scale;
      // 📏 L'icône était portée par le label du bloc meta, disparu le
      // 26/09/2026 : la puce la porte elle-même.
      echEl.textContent = "📏 " + ((typeof scale === "number" && scale > 0)
        ? window.I18n.t("emergency.echelle.unite", { scale: scale.toFixed(2) })
        : window.I18n.t("emergency.echelle.nonCalibree"));
    }

    // 🗂️ Plan
    const planEl = document.getElementById("kta-em-plan");
    if (planEl) {
      const planName = (window.PLAN_CONFIG && window.PLAN_CONFIG.plan && window.PLAN_CONFIG.plan.name)
                       || "—";
      planEl.textContent = planName;
    }

    // 🔋 État (batterie si dispo, sinon résumé tracker + boussole)
    const etatEl = document.getElementById("kta-em-etat");
    if (etatEl) {
      const partsEtat = [];
      // 🔋 v1.97.6 — le bloc s'appelle « ÉTAT » et son commentaire promettait
      // « batterie si dispo » depuis toujours : elle n'y a jamais été. Sur
      // l'écran qu'on ouvre précisément quand la batterie lâche, c'était
      // l'information manquante la plus criante — et la fonction qui la
      // formate existe déjà.
      try {
        if (window.BatteryGuard && typeof window.BatteryGuard.formatLabel === "function") {
          const bat = window.BatteryGuard.formatLabel();
          // 🔋/🪲/⚡ selon le niveau et la charge : `formatLabel` ne rend que
          // « 87% », l'icône était portée par le label du bloc meta (supprimé
          // le 26/09/2026). Mesuré sans elle : la puce commençait par « 100% ».
          const emo = (typeof window.BatteryGuard.getEmoji === "function")
            ? window.BatteryGuard.getEmoji() : "";
          if (bat) partsEtat.push(emo ? (emo + " " + bat) : bat);
        }
      } catch(e) {}
      if (typeof window.getTrackingActif === "function" && window.getTrackingActif()) {
        partsEtat.push(window.I18n.t("emergency.etat.trackerOn"));
      } else {
        partsEtat.push(window.I18n.t("emergency.etat.trackerOff"));
      }
      if (typeof heading === "number" && !isNaN(heading)) {
        partsEtat.push(window.I18n.t("emergency.etat.boussoleOk"));
      } else {
        partsEtat.push(window.I18n.t("emergency.etat.boussoleKo"));
      }
      etatEl.textContent = partsEtat.join(" · ");
    }
  }

  // ============================================================
  // ACTIVATION
  // ============================================================
  function activer() {
    if (_overlay) return;  // déjà actif

    // 🆕 v1.13.0 : sync thème initial avec ThemeManager global. Si l'user
    // est en mode clair partout dans l'app, le mode urgence s'ouvre aussi
    // en clair. Il garde son toggle 🔆/🌑 local pour basculer ponctuellement
    // (ex: lampe d'appoint en sous-sol) sans changer le réglage global.
    if (window.ThemeManager && typeof window.ThemeManager.isLight === "function") {
      _theme = window.ThemeManager.isLight() ? "light" : "dark";
    }

    // 🔧 v1.10.2-fix2 (KARMA "si les accès aux capteurs non pas déjà
    // été validés, on doit nous le demander sinon boussole marche pas") :
    // appel à window.requestPermission() qui fait le flow complet :
    //   - iOS : DeviceMotionEvent.requestPermission() → si granted, attache
    //     les listeners deviceorientation + devicemotion via initOrientation
    //     + initMotion
    //   - Android/PC : pas de prompt système, attache direct les listeners
    //
    // Avant : on n'appelait que requestPermission sans suite → si l'user
    // n'avait jamais utilisé le tracker, aucun listener attaché → boussole
    // restait à "—". Le bon point d'entrée est window.requestPermission
    // exposé par tracking.js (idempotent via _orientationListenerAttached).
    //
    // ⚠️ DOIT être appelé synchronement depuis le user gesture (= ce
    // activer() est invoqué depuis le onClick de la sous-action 🚨 →
    // c'est OK, geste utilisateur valide).
    if (typeof window.requestPermission === "function") {
      try { window.requestPermission(); }
      catch(e) { console.warn("[Emergency] requestPermission échoué :", e); }
    }

    _overlay = _buildOverlay();
    document.documentElement.appendChild(_overlay);
    _bindOverlay();

    // 🆕 v1.10.2 : init du minimap (Leaflet secondaire) — délai 100ms
    // pour que le browser ait calculé le layout (sinon Leaflet voit un
    // container 0×0 et fitBounds échoue silencieusement).
    setTimeout(_initMiniMap, 100);

    // Premier tick immédiat
    _tick();
    _pollTimer = setInterval(_tick, POLL_MS);

    // Empêcher l'écran de s'éteindre sur mobile (Wake Lock API si dispo)
    _acquireWakeLock();

    // 🆕 v1.11.2-fix (KARMA "petit bug de décalage quand on passe en
    // horizontal en mode urgence") : à la rotation device, la minimap
    // Leaflet ne se redimensionne pas seule → tuiles décalées, marker
    // tracker hors zone visible. Solution : écouter orientationchange +
    // resize et appeler invalidateSize en cascade (3 retries pour gérer
    // les transitions iOS lentes). Cleanup au desactiver().
    _orientationListener = function() {
      if (!_miniMap) return;
      // 3 invalidations échelonnées : iOS Safari met 100-500ms à finaliser
      // sa nouvelle viewport après rotation. Cascade pour garantir le sync.
      function _retry() {
        try {
          _miniMap.invalidateSize({ animate: false });
          // Re-fitBounds aussi pour recadrer correctement après rotation
          const pc = window.PLAN_CONFIG;
          if (pc && pc.plan) {
            const imgW = pc.plan.imageWidth || 0;
            const imgH = pc.plan.imageHeight || 0;
            if (imgW > 0 && imgH > 0) {
              _miniMap.fitBounds([[0, 0], [imgH, imgW]]);
            }
          }
        } catch(e) {}
      }
      setTimeout(_retry, 80);
      setTimeout(_retry, 300);
      setTimeout(_retry, 700);
    };
    window.addEventListener("orientationchange", _orientationListener);
    window.addEventListener("resize",            _orientationListener);

    console.log("[Emergency] Activé");
  }

  function desactiver() {
    if (!_overlay) return;
    if (_pollTimer) {
      clearInterval(_pollTimer);
      _pollTimer = null;
    }
    document.removeEventListener("keydown", _onKey);
    // 🆕 v1.11.2-fix : cleanup des listeners orientation/resize pour ne
    // pas garder des appels invalidateSize zombies après fermeture.
    if (_orientationListener) {
      window.removeEventListener("orientationchange", _orientationListener);
      window.removeEventListener("resize",            _orientationListener);
      _orientationListener = null;
    }
    // 🆕 v1.10.2 : destroy minimap pour libérer les ressources Leaflet
    _destroyMiniMap();
    try { _overlay.remove(); } catch(e) {}
    _overlay = null;
    _lastHeadingShown = null;
    _compassUnwrapped = null;
    _compassLastRaw   = null;
    // La minimap est détruite : ses rotors n'existent plus, donc la prochaine
    // ouverture doit à nouveau les poser (sinon le garde anti-scintillement
    // s'armerait sur un affichage qui n'a pas eu lieu).
    _rotorsPoses      = false;
    _releaseWakeLock();
    console.log("[Emergency] Désactivé");
  }

  function isActif() {
    return _overlay !== null;
  }

  function toggle() {
    if (isActif()) desactiver(); else activer();
  }

  function setTheme(theme) {
    if (theme !== "dark" && theme !== "light") return;
    _theme = theme;
    if (_overlay) {
      _overlay.classList.remove("kta-emergency-dark", "kta-emergency-light");
      // 🧹 26/09/2026 : plus de bouton clair/sombre à rafraîchir — seule
      // la classe de thème change.
      _overlay.classList.add("kta-emergency-" + theme);
    }
  }

  // ============================================================
  // MINIMAP — Leaflet secondaire dans le carré compass (v1.10.2)
  // ============================================================
  // Affiche l'image base du plan + un marker tracker au centre, à zoom
  // élevé pour qu'on voie l'environnement immédiat. Pas de tile layer
  // séparé : on reuse `window.PLAN_CONFIG` pour récupérer l'URL de la
  // base image (résolue via RUNTIME_ASSETS si plan local). La minimap
  // suit la position en temps réel via `setView` au tick.
  //
  // Pour V2 tuilé : l'image base reste dans le ZIP même en V2 (cf.
  // CLAUDE.md §27 — baseImage est conservé pour rétrocompat / fallback
  // perfPreset off). Donc on utilise toujours `baseImage`, pas les tuiles.
  //
  // Zoom : `MINIMAP_ZOOM_OFFSET` au-dessus du `fitBounds` qui ferait
  // afficher tout le plan. Donne une vue rapprochée autour du tracker.
  // 🔧 v1.10.2-fix7 (KARMA "moins zoomé")          : 4 → 2 (trop loin)
  // 🔧 v1.10.3-fix1 (KARMA "re zoom à fond")        : 2 → maxZ (bug)
  // 🔧 v1.10.3-fix2 (KARMA "dezoom un peu, ça bug") : maxZ → 5 (équilibre)
  // Compromis : ~20-50m d'horizon, assez serré pour repérer
  // l'environnement immédiat sans pousser Leaflet aux limites d'échelle
  // qui causent les artefacts de rendu sur image L.CRS.Simple.
  const MINIMAP_ZOOM_OFFSET = 5;

  // 🔧 v1.12.0-fix (KARMA "tjr des crash en mode urgence ... il charge au
  // début tout les JPG si volumineux, crash") : seuils de sécurité pour
  // décider si l'image de fond est chargée ou si on prévient l'user.
  //
  // Plus stricts que TUILING_NECESSAIRE_PIXELS (16M) du main map parce que :
  //   1. La minimap tourne EN PARALLÈLE du main map → 2× la mémoire image
  //   2. Le mode urgence doit rester réactif sous pression (pas de crash)
  //   3. La minimap n'a pas besoin d'une image haute résolution (l'user
  //      regarde sa position relative aux roads/zones, pas les détails pixel)
  const MINIMAP_MAX_PIXELS = 2048 * 2048;       // 4M pixels = ~5 MB JPG q88
  const MINIMAP_MAX_FILE_BYTES = 10 * 1024 * 1024;  // 10 MB taille fichier
  const LS_KEY_BIG_IMG_CHOICE = "myktamap_emergency_big_img_choice_v1";  // persistance choix user

  // Résout la source d'image pour la minimap. Retourne :
  //   { type: "v2-lazy",  manifest, imgW, imgH } pour plan V2 tuilé (loading viewport-aware)
  //   { type: "single",   url, fileSize, dims:{w,h} } pour plan V1 / fallback
  //   { type: "none",     reason: "..." } si impossible de résoudre
  function _resolveMiniMapImageSource(pc) {
    const imgW = pc.plan.imageWidth || 0;
    const imgH = pc.plan.imageHeight || 0;
    if (imgW <= 0 || imgH <= 0) {
      return { type: "none", reason: "dimensions plan invalides" };
    }

    // 🔧 v1.12.0-fix2 (KARMA "en mode V2 sur le mode urgence, l'image
    // chargée est flou complétement illisible") : refonte en loading
    // VIEWPORT-AWARE. Avant : on chargeait les tuiles au niveau le plus
    // dézoomé (minNativeZoom) pour économiser la mémoire, mais le minimap
    // zoom à fond (MINIMAP_ZOOM_OFFSET=5 au-dessus du fitBounds) →
    // les tuiles low-res sont stretchées 8× → image floue illisible.
    //
    // Maintenant : on signale juste que le plan est V2 ("v2-lazy"), et
    // _poserImageOverlayMinimap appellera _setupV2ViewportAwareTiles qui :
    //   1. Calcule le niveau de tuile optimal selon le zoom courant
    //   2. Ne charge QUE les tuiles intersectant le viewport visible
    //   3. Re-render sur zoomend + moveend (suivi position tracker)
    //
    // Avantages : tuiles NATIVES (= netteté maximale) + mémoire bornée
    // (max ~4-9 tuiles affichées simultanément même sur un gros plan).
    if (pc.plan.tiledV2 === true && pc.tiling) {
      return {
        type: "v2-lazy",
        manifest: pc.tiling,
        imgW: imgW,
        imgH: imgH
      };
    }

    // 2. Plan V1 ou fallback : résolution baseImage + taille fichier
    let imgUrl = pc.plan.baseImage || "";
    let fileSize = 0;
    if (window.RUNTIME_ASSETS) {
      let asset = window.RUNTIME_ASSETS[imgUrl];
      if (!asset) {
        const baseName = imgUrl.split("/").pop();
        asset = window.RUNTIME_ASSETS[baseName];
      }
      if (asset) {
        if (asset.url) imgUrl = asset.url;
        if (asset.file && typeof asset.file.size === "number") fileSize = asset.file.size;
      }
    }
    if (!imgUrl) {
      return { type: "none", reason: "URL image non résolue (baseImage=" + (pc.plan.baseImage || "?") + ")" };
    }
    return {
      type:     "single",
      url:      imgUrl,
      fileSize: fileSize,
      dims:     { w: imgW, h: imgH }
    };
  }

  // Check si l'image V1 dépasse les seuils de sécurité. Retourne null si OK,
  // ou un objet { pixels, bytes, tooManyPixels, tooBigFile } si risque.
  function _checkImageSafety(source) {
    if (!source || source.type !== "single") return null;
    const pixels = source.dims.w * source.dims.h;
    const tooManyPixels = pixels > MINIMAP_MAX_PIXELS;
    const tooBigFile    = source.fileSize > 0 && source.fileSize > MINIMAP_MAX_FILE_BYTES;
    if (!tooManyPixels && !tooBigFile) return null;
    return {
      pixels:        pixels,
      bytes:         source.fileSize,
      tooManyPixels: tooManyPixels,
      tooBigFile:    tooBigFile,
      dimsTxt:       source.dims.w + " × " + source.dims.h + " px",
      sizeTxt:       source.fileSize > 0 ? (source.fileSize / 1024 / 1024).toFixed(1) + " Mo" : "taille inconnue"
    };
  }

  // Lit le choix mémorisé par plan (load / skip). Null si jamais répondu.
  function _readBigImgChoice() {
    try {
      const planId = window._currentLoadedPlanId || "default";
      const raw = localStorage.getItem(LS_KEY_BIG_IMG_CHOICE);
      if (!raw) return null;
      const obj = JSON.parse(raw);
      if (!obj || typeof obj !== "object") return null;
      return obj[planId] || null;  // "load" | "skip"
    } catch(e) { return null; }
  }
  function _writeBigImgChoice(choice) {
    try {
      const planId = window._currentLoadedPlanId || "default";
      const raw = localStorage.getItem(LS_KEY_BIG_IMG_CHOICE);
      const obj = (raw && JSON.parse(raw)) || {};
      obj[planId] = choice;
      localStorage.setItem(LS_KEY_BIG_IMG_CHOICE, JSON.stringify(obj));
    } catch(e) {}
  }

  // Affiche la modale d'avertissement. Callback reçoit "load" | "skip".
  function _afficherModaleImageVolumineuse(info, callback) {
    const t = function(k, p) { return window.I18n ? window.I18n.t(k, p) : k; };
    // Modale par-dessus l'overlay du mode urgence — z-index plus haut
    const modal = document.createElement("div");
    modal.id = "kta-emergency-bigimg-modal";
    modal.className = "kta-readme-modal-overlay";
    modal.style.zIndex = "100050";  // au-dessus de kta-emergency-overlay
    // 🔧 v1.12.0-fix (KARMA "bug du modal Image volumineuse sur PC bcp trop
    // long, on a déjà eu le cas sur d'autre") : override le height: 88vh
    // hérité de .kta-readme-modal-boite. Cette modale a un contenu court
    // (~6 lignes texte + 2 boutons), 88vh laisse la moitié vide sur PC.
    // Pattern identique au fix .kta-pin-proposal-boite de v1.12.0.
    const sizeTxt = info.bytes > 0 ? ' (' + info.sizeTxt + ')' : '';
    modal.innerHTML =
      '<div class="kta-readme-modal-boite" style="max-width: 460px; height: auto !important; max-height: 90vh !important;">' +
        '<div class="kta-readme-modal-header">' +
          '<span class="kta-readme-modal-titre">' + t("emergency.bigimg.titre") + '</span>' +
        '</div>' +
        '<div class="kta-readme-modal-corps" style="font-size:14px; line-height:1.5;">' +
          '<p>' + t("emergency.bigimg.dims", { dims: info.dimsTxt, size: sizeTxt }) + '</p>' +
          '<p style="color:#ff8a5c;">' + t("emergency.bigimg.warn", {
            px: (MINIMAP_MAX_PIXELS / 1e6).toFixed(0),
            mo: (MINIMAP_MAX_FILE_BYTES / 1024 / 1024).toFixed(0)
          }) + '</p>' +
          '<p>' + t("emergency.bigimg.choix") + '</p>' +
          '<p style="font-size:12px; color:#8892a4; margin-top:8px;">' +
            t("emergency.bigimg.astuce") +
          '</p>' +
          '<div style="display:flex; gap:8px; margin-top:16px; flex-wrap:wrap;">' +
            '<button class="kta-conv-sens-btn" id="kta-em-bigimg-skip" style="flex:1; min-width:160px;">' +
              '<span class="kta-conv-sens-label">' + t("emergency.bigimg.btnSkip") + '</span>' +
              '<span class="kta-conv-sens-desc">' + t("emergency.bigimg.btnSkipDesc") + '</span>' +
            '</button>' +
            '<button class="kta-conv-sens-btn" id="kta-em-bigimg-load" style="flex:1; min-width:160px;">' +
              '<span class="kta-conv-sens-label">' + t("emergency.bigimg.btnLoad") + '</span>' +
              '<span class="kta-conv-sens-desc">' + t("emergency.bigimg.btnLoadDesc") + '</span>' +
            '</button>' +
          '</div>' +
          '<label style="display:flex; gap:6px; align-items:center; margin-top:12px; font-size:12px; color:#8892a4; cursor:pointer;">' +
            '<input type="checkbox" id="kta-em-bigimg-remember"> ' + t("emergency.bigimg.remember") +
          '</label>' +
        '</div>' +
      '</div>';
    document.documentElement.appendChild(modal);

    function _finish(choice) {
      try {
        const rememberCb = document.getElementById("kta-em-bigimg-remember");
        if (rememberCb && rememberCb.checked) _writeBigImgChoice(choice);
      } catch(e) {}
      try { modal.remove(); } catch(e) {}
      callback(choice);
    }
    document.getElementById("kta-em-bigimg-skip").addEventListener("click", function() { _finish("skip"); });
    document.getElementById("kta-em-bigimg-load").addEventListener("click", function() { _finish("load"); });
  }

  // 🆕 v1.12.0-fix2 : état du loader viewport-aware V2 — exposé au scope
  // module pour cleanup au _destroyMiniMap (retirer le listener moveend
  // + remove les overlays).
  let _miniV2State = null;

  // Pose les imageOverlays de la minimap (V2 viewport-aware, V1 unique, ou rien).
  function _poserImageOverlayMinimap(source, bounds) {
    if (!_miniMap) return;
    if (source.type === "v2-lazy") {
      _miniV2State = _setupV2ViewportAwareTiles(_miniMap, source.manifest, source.imgW, source.imgH);
    } else if (source.type === "single") {
      L.imageOverlay(source.url, bounds, { interactive: false }).addTo(_miniMap);
      console.log("[Emergency] minimap : baseImage V1 (" + source.dims.w + "×" + source.dims.h + ", " +
                  (source.fileSize > 0 ? (source.fileSize / 1024 / 1024).toFixed(1) + " Mo" : "taille inconnue") + ")");
    } else {
      console.log("[Emergency] minimap : sans image de fond (raison : " +
                  (source.reason || "user skip") + ")");
    }
  }

  // 🆕 v1.12.0-fix2 : loader de tuiles V2 viewport-aware pour la minimap.
  //
  // Stratégie :
  //   1. À chaque zoomend/moveend, on choisit le niveau z optimal
  //      (= round(zoom) clamped à [minNative, maxNative]).
  //   2. On calcule quelles tuiles de ce niveau intersectent les bounds
  //      visibles de la minimap (map.getBounds()).
  //   3. On ajoute UNIQUEMENT ces tuiles via L.imageOverlay (lazy URL.createObjectURL
  //      sur les blob assets).
  //   4. On supprime les overlays du niveau précédent ou hors viewport.
  //
  // Mémoire bornée : pour un minimap container ~280×280px et MINIMAP_ZOOM_OFFSET=5,
  // ~4-9 tuiles 512×512 actives maximum, ~150KB chacune compressée (mais
  // décompressée ~1MB chacune). Total RAM ~5-10MB, vs ~256MB si on chargeait
  // toutes les tuiles z=0 d'un plan 8192×8192.
  function _setupV2ViewportAwareTiles(map, manifest, imgW, imgH) {
    const tileSize  = manifest.tileSize || 512;
    const minNative = Number.isInteger(manifest.minNativeZoom) ? manifest.minNativeZoom : -3;
    const maxNative = Number.isInteger(manifest.maxNativeZoom) ? manifest.maxNativeZoom : 0;

    // État interne — Map<key, L.imageOverlay> pour O(1) lookup et update incrémental.
    const state = {
      overlays:     new Map(),   // key = "z<z>_x<col>_y<-k>" → L.imageOverlay
      blobUrls:     [],          // pour cleanup au destroy
      listenerRef:  null,        // ref de _refresh pour map.off()
      currentLevel: null
    };

    // 🫥 v1.62.0 : extension d'après le manifest (webp/png = alpha, jpg = legacy)
    const _tileExt = (typeof window.ktaTileExt === "function") ? window.ktaTileExt(manifest) : "jpg";
    // 🩸 v1.97.6 — LA MINIMAP N'AVAIT AUCUN FOND SUR UN PLAN SERVEUR.
    // `RUNTIME_ASSETS` ne contient que les assets d'un plan importé en ZIP ;
    // sur un plan servi en HTTP — le modèle de déploiement de la prod — il
    // est VIDE. Mesuré sur un relevé tuilé : 0 tuile, 0 requête réseau, un
    // rectangle noir, et pas même la classe `kta-em-mini-map-noimg` pour le
    // signaler. Au même instant, la carte principale en affichait 864.
    // Le repli serveur existe depuis la v1.86.0 dans `tiling.js` ; cet écran
    // ne l'avait jamais reçu.
    const _racineSrv = (typeof window.ktaRacineTuilesServeur === "function")
      ? window.ktaRacineTuilesServeur(window.PLAN_CONFIG) : null;
    function _resolveTileUrl(z, col, k) {
      const path = "data/tiles/z" + z + "/x" + col + "_y" + (-k) + "." + _tileExt;
      const asset = window.RUNTIME_ASSETS && window.RUNTIME_ASSETS[path];
      if (!asset) {
        return _racineSrv
          ? (_racineSrv + "/z" + z + "/x" + col + "_y" + (-k) + "." + _tileExt)
          : null;
      }
      if (!asset.url && asset.file) {
        try {
          asset.url = URL.createObjectURL(asset.file);
          state.blobUrls.push(asset.url);
        } catch(e) { return null; }
      }
      return asset.url || null;
    }

    function _refresh() {
      if (!map._loaded) return;  // pas encore initialisé
      const mapZoom = map.getZoom();
      const z = Math.max(minNative, Math.min(maxNative, Math.round(mapZoom)));

      // Si on change de niveau, on retire d'abord TOUTES les tuiles du
      // niveau précédent (sinon overlap visuel + RAM doublée).
      if (state.currentLevel !== null && state.currentLevel !== z) {
        state.overlays.forEach(function(o, key) {
          try { o.remove(); } catch(e) {}
        });
        state.overlays.clear();
      }
      state.currentLevel = z;

      // Calcule la grille au niveau z (convention tiling.js > _renderNiveau)
      const scale = Math.pow(2, -z);
      const lvlW = Math.ceil(imgW / scale);
      const lvlH = Math.ceil(imgH / scale);
      const cols = Math.ceil(lvlW / tileSize);
      const rows = Math.ceil(lvlH / tileSize);

      // Bounds courants du viewport (en coords Leaflet CRS.Simple)
      const mapBounds = map.getBounds();

      // Track quelles tuiles sont visibles à ce niveau pour suppression
      // des overlays out-of-viewport.
      const visibleKeys = new Set();

      for (let k = 1; k <= rows; k++) {
        for (let col = 0; col < cols; col++) {
          const latMin = (k - 1) * tileSize * scale;
          const latMax = k       * tileSize * scale;
          const lngMin = col       * tileSize * scale;
          const lngMax = (col + 1) * tileSize * scale;
          const tileBounds = L.latLngBounds([latMin, lngMin], [latMax, lngMax]);
          if (!mapBounds.intersects(tileBounds)) continue;

          const key = "z" + z + "_x" + col + "_y" + (-k);
          visibleKeys.add(key);
          if (state.overlays.has(key)) continue;  // déjà chargée

          const url = _resolveTileUrl(z, col, k);
          if (!url) continue;  // tuile manquante (edge / erreur génération)

          try {
            const overlay = L.imageOverlay(url, [[latMin, lngMin], [latMax, lngMax]], {
              interactive: false,
              pane: "tilePane"  // SOUS les overlays vectoriels (roads/zones)
            });
            overlay.addTo(map);
            state.overlays.set(key, overlay);
          } catch(e) {
            console.warn("[Emergency] minimap V2 tile skip :", e);
          }
        }
      }

      // Supprime les overlays hors viewport (économise RAM en suivant le tracker)
      state.overlays.forEach(function(o, key) {
        if (!visibleKeys.has(key)) {
          try { o.remove(); } catch(e) {}
          state.overlays.delete(key);
        }
      });
    }

    // Listener combiné — Leaflet émet moveend après chaque setView/setZoom/pan
    state.listenerRef = _refresh;
    map.on("moveend", state.listenerRef);
    map.on("zoomend", state.listenerRef);

    // Render initial — décalé d'un tick pour laisser fitBounds calculer le bon zoom
    setTimeout(_refresh, 0);
    console.log("[Emergency] minimap V2 viewport-aware (z range [" + minNative + ", " + maxNative + "], tileSize " + tileSize + ")");
    return state;
  }

  function _initMiniMap() {
    if (_miniMap) return;
    const container = document.getElementById("kta-em-mini-map");
    if (!container) {
      console.warn("[Emergency] minimap : container introuvable");
      return;
    }
    if (typeof L === "undefined") {
      console.warn("[Emergency] minimap : Leaflet (L) indispo");
      return;
    }
    const pc = window.PLAN_CONFIG;
    if (!pc || !pc.plan) {
      console.warn("[Emergency] minimap : PLAN_CONFIG indispo");
      return;
    }
    const imgW = pc.plan.imageWidth  || 0;
    const imgH = pc.plan.imageHeight || 0;
    if (imgW <= 0 || imgH <= 0) {
      console.warn("[Emergency] minimap : dimensions plan invalides", imgW, imgH);
      return;
    }

    // 🔧 v1.12.0-fix (KARMA "tjr des crash en mode urgence ... il charge
    // au début tout les JPG si volumineux") : résolution intelligente de
    // l'image de fond avec garde-fou. 3 cas possibles :
    //   1. Plan V2 tuilé → tuiles minNativeZoom (toujours safe)
    //   2. Plan V1 image OK → baseImage direct (comportement legacy)
    //   3. Plan V1 image volumineuse → modal d'avertissement + choix user
    //      ("Continuer sans image" recommandé / "Charger quand même" risque)
    const source = _resolveMiniMapImageSource(pc);
    console.log("[Emergency] minimap source : type=" + source.type +
                (source.type === "v2-tiles" ? " (" + source.tiles.length + " tuile(s) z=" + source.level + ")" :
                 source.type === "single"   ? " (url=" + source.url + ", " + source.dims.w + "×" + source.dims.h +
                                              (source.fileSize > 0 ? ", " + (source.fileSize/1024/1024).toFixed(1) + "Mo" : "") + ")" :
                 " (raison=" + (source.reason || "?") + ")"));

    if (source.type === "none") {
      // Pas de fond mais on continue (les annotations restent visibles)
      console.warn("[Emergency] minimap : source image indispo → minimap sans fond");
    }

    // Check de sécurité sur image V1
    const safety = _checkImageSafety(source);
    if (safety) {
      // Image trop grosse — vérifier si le user a déjà choisi pour ce plan
      const remembered = _readBigImgChoice();
      if (remembered === "skip") {
        // L'user a déjà dit "continuer sans image" → on transforme la source en "none"
        console.log("[Emergency] minimap : choix mémorisé = skip → pas d'image");
        _initMiniMapAvecSource(container, { type: "none", reason: "user skip (mémorisé)" }, imgW, imgH);
        return;
      }
      if (remembered === "load") {
        // L'user a déjà dit "charger quand même" → on continue avec la source
        console.log("[Emergency] minimap : choix mémorisé = load → image chargée à risque");
        _initMiniMapAvecSource(container, source, imgW, imgH);
        return;
      }
      // Pas de choix mémorisé → afficher la modale
      _afficherModaleImageVolumineuse(safety, function(choice) {
        const effectiveSource = (choice === "skip")
          ? { type: "none", reason: "user skip" }
          : source;
        _initMiniMapAvecSource(container, effectiveSource, imgW, imgH);
      });
      return;
    }

    // Image safe (V2 tuiles ou V1 petite) → init direct
    _initMiniMapAvecSource(container, source, imgW, imgH);
  }

  // Suite de _initMiniMap, séparée pour pouvoir être appelée après la modale
  // d'avertissement avec la source effective (potentiellement vidée si user
  // a choisi "continuer sans image").
  function _initMiniMapAvecSource(container, source, imgW, imgH) {
    try {
      _miniMap = L.map(container, {
        crs:             L.CRS.Simple,
        attributionControl: false,
        zoomControl:     false,
        scrollWheelZoom: false,
        dragging:        false,
        keyboard:        false,
        doubleClickZoom: false,
        touchZoom:       false,
        boxZoom:         false,
        tap:             false,
        zoomAnimation:   false,
        fadeAnimation:   false,
        minZoom:        -10,        // permet de dézoomer suffisamment
        maxZoom:         10,        // permet de zoomer fort autour du tracker
        preferCanvas:    true       // perf : canvas pour les polylines roads
      });
      const bounds = [[0, 0], [imgH, imgW]];
      // 🔧 v1.12.0-fix : pose des imageOverlays selon le type de source
      // (tuiles V2 multiples, baseImage V1 unique, ou rien si user a choisi
      // "continuer sans image" sur une image volumineuse).
      _poserImageOverlayMinimap(source, bounds);
      // Background neutre Leaflet quand pas d'image — déjà sombre via CSS,
      // les roads/zones restent contrastées sur le noir.
      if (source.type === "none") {
        container.classList.add("kta-em-mini-map-noimg");
      }
      _miniMap.fitBounds(bounds);

      // 🆕 v1.10.2-fix4/5 : ajoute zones (eau / remblais / effondrement /
      // inaccessible) + structures (piliers + murs + fronts) + roads sur
      // le minimap pour aider à trouver son chemin en mode urgence.
      // Ordre Z (du fond vers l'avant-plan, comme dans la carte principale) :
      //   zones < structures < roads.
      // Toutes filtrées par niveau si M-LVL actif.
      _addZonesToMiniMap(imgH);
      _addStructuresToMiniMap(imgH);
      _addRoadsToMiniMap(imgH);

      // 🔧 v1.10.2-fix3 : multiple invalidateSize en cascade pour gérer
      // le cas où le container avait des dims 0×0 au moment du L.map().
      // Leaflet calcule les bounds avec les dims actuelles → si elles
      // étaient 0 au boot, fitBounds donne un zoom incohérent.
      // Cascade : 50ms (paint initial) + 200ms (animations finies) + 500ms
      // (sécurité ultime).
      setTimeout(function() {
        if (_miniMap) {
          try { _miniMap.invalidateSize({ animate: false }); _miniMap.fitBounds(bounds); }
          catch(e) {}
        }
      }, 50);
      setTimeout(function() {
        if (_miniMap) {
          try { _miniMap.invalidateSize({ animate: false }); _miniMap.fitBounds(bounds); }
          catch(e) {}
        }
      }, 200);

      // 🔧 v1.12.0-fix (KARMA "on mais le centre de la bousole triangle
      // rouge a ma position, et le rond rouge sur le cercle jaune bouge
      // pour indiquer le nord") : nouveau marker tracker = boussole stylisée
      // L.divIcon composite :
      //   - cercle jaune (= cadran boussole)
      //   - triangle rouge centré (= position user, static)
      //   - point rouge sur le cercle jaune qui TOURNE pour indiquer le N
      // Le rotor (point N) est mis à jour via _updateTrackerNorthRotor à
      // chaque tick boussole. iconAnchor centré → la pointe du triangle =
      // exactement la latlng tracker.
      _miniTrackerMark = L.marker([0, 0], {
        icon: L.divIcon({
          className: "kta-em-mini-tracker-wrap",
          // 🔧 v1.12.0-fix (KARMA "le triangle ne tourne plus dans la
          // direction où on va comme icône tracker") : 2 rotors séparés
          //   - .kta-em-mini-tracker-triangle-rotor : tourne avec +heading
          //     pour pointer la direction de marche (= cône GPS bleu de la
          //     map principale, cohérence visuelle)
          //   - .kta-em-mini-tracker-rotor (north)  : tourne avec -heading
          //     pour positionner le point rouge "Nord" à 12h quand l'user
          //     fait face au N, 9h quand il fait face à l'E, etc.
          html:
            '<div class="kta-em-mini-tracker">' +
              '<div class="kta-em-mini-tracker-ring"></div>' +
              '<div class="kta-em-mini-tracker-rotor" id="kta-em-mini-tracker-rotor">' +
                '<div class="kta-em-mini-tracker-north-dot"></div>' +
              '</div>' +
              '<div class="kta-em-mini-tracker-triangle-rotor" id="kta-em-mini-tracker-triangle-rotor">' +
                '<div class="kta-em-mini-tracker-triangle">▲</div>' +
              '</div>' +
            '</div>',
          // tailles doublées pour mieux lire la boussole sur la minimap
          iconSize:   [104, 104],
          iconAnchor: [52, 52]
        }),
        interactive: false,
        keyboard:    false
      });
    } catch(e) {
      console.warn("[Emergency] init minimap échoué :", e);
      _miniMap = null;
    }
  }

  // 🎨 26/09/2026 (KARMA : « en mode XL je vois qu'on ne récupère pas les
  // couleurs définies en légende personnalisée ») — RÉSOLVEUR DE STYLE DU MINI.
  //
  // Cet écran garde sa palette vive : c'est une variante DÉLIBÉRÉE, relevée et
  // documentée en tête de `styleResolver.js` (vert #27c97e au lieu de #00ff00,
  // hachures de l'inaccessible remplacées par un aplat rouge — « le rouge
  // plein dit déjà danger »). Mais garder sa palette ne voulait pas dire
  // ignorer l'utilisateur, et c'est ce qui se passait :
  //
  //   • une couleur CHOISIE pour un type built-in (≡ Légende → ✏️ Modifier)
  //     n'atteignait pas la mini-carte — elle atteint la carte, les exports,
  //     le KMZ, les pastilles, mais pas l'écran qu'on ouvre quand on est
  //     perdu ;
  //   • un type CUSTOM (`cust-…`) n'était dans AUCUNE des trois tables
  //     locales, donc il tombait sur le repli : une zone custom sortait en
  //     **gris remblais**, une structure custom en **bleu mur**, un front
  //     custom en **jaune front-1**. Sur un relevé qui utilise des types
  //     personnalisés, la mini-carte montrait donc autre chose que la carte.
  //
  // On garde donc la base locale, on laisse le canon résoudre ce qu'elle ne
  // connaît pas (à plat : pas de motif SVG ici), on impose le gabarit du mini
  // (épaisseurs réduites, opacités poussées pour tenir sur un fond désaturé),
  // puis on applique la couleur choisie via la MÊME fonction que la carte.
  function _styleMini(cat, cle, base, gabarit) {
    let s = null;
    if (base) {
      s = Object.assign({}, base);
    } else if (typeof window.ktaResolveStyle === "function") {
      const c = window.ktaResolveStyle(cat, cle, { flat: true });
      if (c) s = Object.assign(c, gabarit || {});
    }
    if (!s) return null;
    if (typeof window.ktaAppliquerCouleurChoisie === "function") {
      s = window.ktaAppliquerCouleurChoisie(cat, cle, s) || s;
    }
    return s;
  }

  // 🆕 v1.10.2-fix5 : ajoute les zones (eau / remblais / effondrement /
  // inaccessible) sur le minimap. Session + embedded. Couleurs cohérentes
  // avec zones.js > ZONE_STYLES, opacité bumpée pour rester lisible sur
  // minimap (image base désaturée).
  function _addZonesToMiniMap(imgH) {
    if (!_miniMap || typeof L === "undefined") return;
    const session  = (typeof window.getZones === "function" ? window.getZones() : []) || [];
    const embedded = (typeof window.getAllEmbeddedZones === "function" ? window.getAllEmbeddedZones() : []) || [];
    const all = session.concat(embedded);
    if (all.length === 0) return;

    const filter = (typeof window.passeFiltreNiveau === "function")
                   ? window.passeFiltreNiveau
                   : function() { return true; };

    // Styles inspirés de zones.js — couleurs vives. Inaccessible en rouge
    // plein semi-transparent (pas de hachures sur canvas Leaflet — on
    // simplifie pour le mini, le rouge plein dit déjà "danger").
    const STYLES = {
      eau:          { color: "#3b82f6", weight: 1.5, fillColor: "#60a5fa", fillOpacity: 0.45, opacity: 0.9 },
      remblais:     { color: "#404a5e", weight: 1.5, fillColor: "#5a6680", fillOpacity: 0.55, opacity: 0.9 },
      effondrement: { color: "#dc2626", weight: 1.5, fillColor: "#ef4444", fillOpacity: 0.5,  opacity: 0.9 },
      inaccessible: { color: "#000000", weight: 1.5, fillColor: "#7f1d1d", fillOpacity: 0.6,  opacity: 1   }
    };

    let added = 0;
    all.forEach(function(zone) {
      if (!zone || !Array.isArray(zone.points) || zone.points.length < 3) return;
      if (!filter(zone)) return;
      const style = _styleMini("zones", zone.type, STYLES[zone.type],
                               { weight: 1.5, opacity: 0.9, fillOpacity: 0.5 })
                    || STYLES.remblais;
      const latlngs = zone.points.map(function(p) { return [imgH - p.y, p.x]; });
      try {
        const poly = L.polygon(latlngs, Object.assign({ interactive: false }, style));
        poly.addTo(_miniMap);
        _miniZoneLayers.push(poly);
        added++;
      } catch(e) { console.warn("[Emergency] minimap zone skip :", e); }
    });
    if (added > 0) console.log("[Emergency] minimap : " + added + " zone(s) affichée(s)");
  }

  // 🆕 v1.10.2-fix5 : ajoute les structures (piliers + murs polygons,
  // fronts polylines). Couleurs cohérentes avec structures.js >
  // STRUCTURE_STYLES (post-hotfix2 : front-1 jaune, front-2 orange).
  function _addStructuresToMiniMap(imgH) {
    if (!_miniMap || typeof L === "undefined") return;
    const session = (typeof window.getStructures === "function" ? window.getStructures() : []) || [];
    // ⚠️ getAllEmbeddedStructures filtre points.length >= 3 → exclut les
    // fronts embedded (polylines 2+ points). Acceptable car fronts en data
    // layer sont rares ; les fronts session sont gérés normalement.
    const embedded = (typeof window.getAllEmbeddedStructures === "function" ? window.getAllEmbeddedStructures() : []) || [];
    const all = session.concat(embedded);
    if (all.length === 0) return;

    const filter = (typeof window.passeFiltreNiveau === "function")
                   ? window.passeFiltreNiveau
                   : function() { return true; };
    // Helper pour distinguer polyline (fronts) vs polygon (piliers + mur)
    const isPolyline = (typeof window.isStructurePolylineType === "function")
                       ? window.isStructurePolylineType
                       : function(t) { return t === "front-1" || t === "front-2"; };

    // Styles cohérents v1.10.1-hotfix2 (front-1 jaune, front-2 orange).
    // Ordre Z : mur < pilier-2 < pilier-1 < front-2 < front-1 (cf §31.5 CLAUDE.md).
    // Sur le mini Leaflet, l'ordre d'ajout = ordre Z. Tri AVANT itération.
    const ordreType = { "mur": 0, "pilier-2": 1, "pilier-1": 2, "front-2": 3, "front-1": 4 };
    const _multiLevelOnSort = !!(window.APP_CONFIG && window.APP_CONFIG.multiLevel === true);
    const sorted = all.slice().sort(function(a, b) {
      if (_multiLevelOnSort) {
        const la = Number.isInteger(a.level) ? a.level : 0;
        const lb = Number.isInteger(b.level) ? b.level : 0;
        if (la !== lb) return la - lb;
      }
      return (ordreType[a.type] ?? 99) - (ordreType[b.type] ?? 99);
    });

    const POLYGON_STYLES = {
      "pilier-1": { color: "#000000", weight: 1, fillColor: "#f4c542", fillOpacity: 0.85, opacity: 0.9 },
      "pilier-2": { color: "#000000", weight: 1, fillColor: "#ff9933", fillOpacity: 0.85, opacity: 0.9 },
      "mur":      { color: "#000000", weight: 1, fillColor: "#1e3a8a", fillOpacity: 0.85, opacity: 0.9 }
    };
    const POLYLINE_STYLES = {
      "front-1": { color: "#f4c542", weight: 3.5, opacity: 1 },  // jaune (cohérent pilier-1)
      "front-2": { color: "#ff9933", weight: 3.5, opacity: 1 }   // orange (cohérent pilier-2)
    };

    let added = 0;
    sorted.forEach(function(s) {
      if (!s || !Array.isArray(s.points)) return;
      if (!filter(s)) return;
      const line = isPolyline(s.type);
      const minPts = line ? 2 : 3;
      if (s.points.length < minPts) return;
      const latlngs = s.points.map(function(p) { return [imgH - p.y, p.x]; });
      try {
        const style = _styleMini("structures", s.type,
                        line ? POLYLINE_STYLES[s.type] : POLYGON_STYLES[s.type],
                        line ? { weight: 3.5, opacity: 1 }
                             : { weight: 1, opacity: 0.9, fillOpacity: 0.85 })
                      || (line ? POLYLINE_STYLES["front-1"] : POLYGON_STYLES["mur"]);
        const layer = line
          ? L.polyline(latlngs, Object.assign({ interactive: false }, style))
          : L.polygon (latlngs, Object.assign({ interactive: false }, style));
        layer.addTo(_miniMap);
        _miniStructureLayers.push(layer);
        added++;
      } catch(e) { console.warn("[Emergency] minimap structure skip :", e); }
    });
    if (added > 0) console.log("[Emergency] minimap : " + added + " structure(s) affichée(s)");
  }

  // 🆕 v1.10.2-fix4 : ajoute les routes (session + embedded) sur le minimap.
  // Styles cohérents avec road.js (vert / violet / jaune / cyan / magenta)
  // mais épaisseur réduite et opacité bumpée pour rester lisible par-dessus
  // l'image base désaturée.
  function _addRoadsToMiniMap(imgH) {
    if (!_miniMap || typeof L === "undefined") return;
    // Collecte session + tous les embedded (visibles ET masqués)
    const session  = (typeof window.getRoads === "function" ? window.getRoads() : []) || [];
    const embedded = (typeof window.getAllEmbeddedRoads === "function" ? window.getAllEmbeddedRoads() : []) || [];
    const all = session.concat(embedded);
    if (all.length === 0) return;

    // Filtre niveau si M-LVL actif. Utilise window.passeFiltreNiveau si dispo
    // (exposé par road.js), sinon fallback inclusif.
    const filter = (typeof window.passeFiltreNiveau === "function")
                   ? window.passeFiltreNiveau
                   : function() { return true; };

    // Styles inspirés de road.js ROAD_STYLES mais adaptés au minimap
    // (weight réduit, opacité bumpée pour lisibilité par-dessus image
    // désaturée + brightness 0.6).
    const STYLES = {
      principal:  { color: "#27c97e", weight: 3, opacity: 0.95 },
      secondaire: { color: "#a78cf4", weight: 2.5, opacity: 0.95 },
      chemin:     { color: "#f4c542", weight: 2, opacity: 0.95 },
      jonction:   { color: "#ff4ecb", weight: 3, opacity: 1, dashArray: "6 4" },
      // 🔧 v1.11.4-fix (KARMA "toujours pas itinéraire en mode urgence") :
      // l'itinéraire ÉTAIT dessiné mais quasi invisible (weight 3 dashed
      // sur fond minimap zoomé serré + désaturé). Refonte du style :
      //   - weight 6 (vs 3) = trait épais visible même à zoom élevé
      //   - LIGNE PLEINE (pas de dashArray) = présence continue
      //   - cyan vif + halo blanc derrière (2 polylines superposées,
      //     gérées via le flag _renderItiHalo dans le forEach pour
      //     ajouter une couche blanche underline avant la cyan).
      itinerary:  { color: "#00d4ff", weight: 6, opacity: 1 }
    };

    // 🔧 v1.11.2-fix (KARMA "mode urgence crash sur gros plan avec
    // itinéraire") : guards anti-crash pour limiter la charge GPU/CPU
    // lors du rendu de la minimap sur des plans denses.
    //
    // 1. SKIP itinerary à plus de N points (décimation forte ou skip
    //    complet si trop long). L'itinéraire Pathfinder peut avoir
    //    1000-3000 points sur gros plan = polyline énorme dans Leaflet
    //    pendant que tout le reste (map principale + minimap + boussole)
    //    tourne en parallèle → out-of-memory ou main thread bloqué.
    // 2. DÉCIMATION simple pour toute polyline > MAX_POINTS_PER_POLY :
    //    on garde 1 point sur N pour rester sous le cap. La minimap est
    //    une vue d'ensemble, la précision pixel-perfect n'est pas utile.
    // 3. CAP TOTAL : si on dépasse MAX_TOTAL_POINTS au cumul, on stoppe
    //    et on log explicitement. L'user a quand même la position XL,
    //    le cap boussole et les zones/structures.
    const MAX_POINTS_PER_POLY = 100;   // au-delà : décimation
    const MAX_TOTAL_POINTS    = 5000;  // cap global sécurité
    let totalPointsRendered   = 0;
    let skippedItinerary      = 0;
    let decimatedCount        = 0;

    let added = 0;
    all.forEach(function(road) {
      if (!road || !Array.isArray(road.points) || road.points.length < 2) return;
      if (!filter(road)) return;
      if (totalPointsRendered >= MAX_TOTAL_POINTS) return;  // cap atteint

      // Spécial itinéraire : peut être TRÈS long, on décime plus fort
      // ou on skip complètement si très volumineux.
      // 🔧 v1.13.0 : itinéraire désormais TOUJOURS rendu (toggle retirée).
      // La décimation + cap conservés pour anti-OOM, le rendu cyan + halo
      // blanc reste pour visibilité.
      let pts = road.points;
      if (road.type === "itinerary") {
        if (pts.length > 500) {
          // Skip silencieux des itinéraires très longs (gros plan avec
          // beaucoup de waypoints). L'user voit déjà la position XL +
          // boussole — l'itinéraire détaillé est sur la map principale.
          skippedItinerary++;
          return;
        }
        // Décimation forte : 1 point sur 4 pour l'itinéraire
        if (pts.length > MAX_POINTS_PER_POLY) {
          const step = Math.ceil(pts.length / MAX_POINTS_PER_POLY);
          const decim = [];
          for (let i = 0; i < pts.length; i += step) decim.push(pts[i]);
          // Garder le dernier point pour ne pas couper la ligne
          if (decim[decim.length - 1] !== pts[pts.length - 1]) decim.push(pts[pts.length - 1]);
          pts = decim;
          decimatedCount++;
        }
      } else if (pts.length > MAX_POINTS_PER_POLY) {
        // Décimation standard pour les autres polylines longues
        const step = Math.ceil(pts.length / MAX_POINTS_PER_POLY);
        const decim = [];
        for (let i = 0; i < pts.length; i += step) decim.push(pts[i]);
        if (decim[decim.length - 1] !== pts[pts.length - 1]) decim.push(pts[pts.length - 1]);
        pts = decim;
        decimatedCount++;
      }

      // Check cap final après décimation
      if (totalPointsRendered + pts.length > MAX_TOTAL_POINTS) {
        // Tronque pour rester sous le cap
        pts = pts.slice(0, Math.max(2, MAX_TOTAL_POINTS - totalPointsRendered));
      }

      const style = _styleMini("traces", road.type, STYLES[road.type],
                               { weight: 2.5, opacity: 0.95 })
                    || STYLES.chemin;
      const latlngs = pts.map(function(p) { return [imgH - p.y, p.x]; });
      try {
        // 🔧 v1.11.4-fix2 (KARMA "toujours pas itinéraire en mode urgence") :
        // halo blanc derrière l'itinéraire pour le rendre VISIBLE sur le fond
        // minimap zoomé serré + désaturé. 2 polylines superposées :
        //   1. underlay blanc épais (weight + 4) en premier → effet halo
        //   2. polyline cyan vif normale par-dessus
        // Logs KARMA prouvaient que la road était bien ajoutée (1 road en
        // plus, 5 pts en plus) mais quasi invisible. Le halo blanc tranche
        // sur n'importe quel background.
        if (road.type === "itinerary") {
          const haloStyle = {
            color:   "#ffffff",
            weight:  (style.weight || 6) + 4,
            opacity: 0.95,
            lineCap:  "round",
            lineJoin: "round",
            interactive: false
          };
          const halo = L.polyline(latlngs, haloStyle);
          halo.addTo(_miniMap);
          _miniRoadLayers.push(halo);
        }
        const finalStyle = Object.assign({
          interactive: false,
          lineCap:  "round",
          lineJoin: "round"
        }, style);
        const poly = L.polyline(latlngs, finalStyle);
        poly.addTo(_miniMap);
        _miniRoadLayers.push(poly);
        added++;
        totalPointsRendered += pts.length;
      } catch(e) {
        console.warn("[Emergency] minimap road skip :", e);
      }
    });
    if (added > 0) {
      console.log("[Emergency] minimap : " + added + " road(s) affichée(s)" +
                  " (" + totalPointsRendered + " pts" +
                  (decimatedCount > 0    ? ", " + decimatedCount + " décimées" : "") +
                  (skippedItinerary > 0  ? ", " + skippedItinerary + " itin. skip" : "") +
                  ")");
    }
  }

  function _destroyMiniMap() {
    if (!_miniMap) return;
    // Cleanup tous les overlays (roads + zones + structures)
    function _cleanLayers(arr) {
      arr.forEach(function(layer) {
        try { layer.remove(); } catch(e) {}
      });
    }
    _cleanLayers(_miniRoadLayers);      _miniRoadLayers = [];
    _cleanLayers(_miniZoneLayers);      _miniZoneLayers = [];
    _cleanLayers(_miniStructureLayers); _miniStructureLayers = [];

    // 🆕 v1.12.0-fix2 : cleanup du loader V2 viewport-aware
    if (_miniV2State) {
      // Retire le listener moveend/zoomend
      if (_miniV2State.listenerRef) {
        try {
          _miniMap.off("moveend", _miniV2State.listenerRef);
          _miniMap.off("zoomend", _miniV2State.listenerRef);
        } catch(e) {}
      }
      // Supprime tous les imageOverlays de tuiles V2 actifs
      _miniV2State.overlays.forEach(function(o) { try { o.remove(); } catch(e) {} });
      _miniV2State.overlays.clear();
      // Note : on ne révoque PAS les blob URLs ici car elles sont partagées
      // avec le main map (RUNTIME_ASSETS[path].url est cached et réutilisé
      // par _chargerImageV2OptionB). Les blob URLs sont révoquées au plan
      // switch via main.js > _libererRessourcesPlanPrecedent.
      _miniV2State = null;
    }

    try {
      if (_miniTrackerMark) _miniTrackerMark.remove();
      _miniMap.remove();
    } catch(e) {}
    _miniMap = null;
    _miniTrackerMark = null;
  }

  // 🆕 v1.12.0-fix : tourne le rotor du marker tracker pour positionner le
  // point rouge "Nord" sur le cercle jaune. Le rotor est un élément du
  // divIcon donc on le retrouve via _miniTrackerMark.getElement() puis
  // querySelector. Si le marker n'est pas encore monté (pas de tracker
  // position connue), on no-op silencieusement — la prochaine itération
  // après pose du marker prendra le relais.
  // Rend TRUE seulement si le rotor existait et a été posé : c'est ce
  // booléen qui empêche le garde anti-scintillement de s'armer sur un
  // affichage qui n'a pas eu lieu (cf le pavé dans _refresh).
  function _updateTrackerNorthRotor(angleDeg) {
    if (!_miniTrackerMark) return false;
    const iconEl = _miniTrackerMark.getElement && _miniTrackerMark.getElement();
    if (!iconEl) return false;  // marker pas encore ajouté à la map (pas de pos)
    const rotor = iconEl.querySelector(".kta-em-mini-tracker-rotor");
    if (!rotor) return false;
    rotor.style.transform = "rotate(" + angleDeg + "deg)";
    return true;
  }

  // 🆕 v1.12.0-fix : tourne le rotor du triangle dans la direction de
  // marche (+heading). Cohérent avec l'icône tracker GPS de la map
  // principale (cône bleu qui tourne aussi avec le heading).
  function _updateTrackerTriangleRotor(angleDeg) {
    if (!_miniTrackerMark) return false;
    const iconEl = _miniTrackerMark.getElement && _miniTrackerMark.getElement();
    if (!iconEl) return false;
    const rotor = iconEl.querySelector(".kta-em-mini-tracker-triangle-rotor");
    if (!rotor) return false;
    rotor.style.transform = "rotate(" + angleDeg + "deg)";
    return true;
  }

  // 🧭 v1.97.6 — LA MINIMAP S'ORIENTE, comme la carte principale.
  //
  // On ne passe PAS par `mapBearing` : il est câblé sur `window.map` d'un
  // bout à l'autre, et c'est le module où une erreur n'affiche rien
  // d'anormal, juste du faux. Ici le cas est beaucoup plus simple — la
  // minimap se recentre sur la position à chaque tick, donc **le centre de
  // rotation coïncide toujours avec l'utilisateur** ; elle n'a aucune
  // interaction (`dragging:false`, couches non interactives) et personne n'y
  // convertit un clic. Une rotation du CONTENEUR suffit donc, sans toucher
  // à la moindre géométrie Leaflet.
  //
  // Même interrupteur que la carte principale (`MapBearing.isEnabled`) : qui
  // ne veut pas de carte qui tourne n'en veut nulle part, et il n'y a pas
  // deux réglages à comprendre.
  function _minimapTourne() {
    try { return !!(window.MapBearing && window.MapBearing.isEnabled()); }
    catch(e) { return false; }
  }
  function _appliquerRotationMinimap(cap) {
    const el = document.getElementById("kta-em-mini-map");
    if (!el) return;
    if (!_minimapTourne() || typeof cap !== "number" || isNaN(cap)) {
      el.style.transform = "";
      el.classList.remove("kta-em-mini-map-tournee");
      return;
    }
    el.classList.add("kta-em-mini-map-tournee");
    el.style.transform = "rotate(" + (-cap) + "deg)";
  }

  function _updateMiniMap(pos) {
    if (!_miniMap || !pos) return;
    if (typeof L === "undefined") return;
    const pc = window.PLAN_CONFIG;
    if (!pc || !pc.plan) return;
    const imgW = pc.plan.imageWidth  || 0;
    const imgH = pc.plan.imageHeight || 0;
    if (imgW <= 0 || imgH <= 0) return;
    // convertCoord du projet : [imageHeight - y, x] (CRS Leaflet Simple)
    const latlng = [imgH - pos.y, pos.x];
    // 🔧 v1.10.3-fix2 (KARMA "dezoom un peu, ça bug à fond") : on
    // retombe sur la formule baseZ + offset clamped à maxZoom. À
    // maxZoom=10 sur image L.CRS.Simple, Leaflet bug visuellement
    // (image étirée bien au-delà de sa résolution native).
    const maxZ  = _miniMap.getMaxZoom();
    const baseZ = _miniMap.getBoundsZoom([[0, 0], [imgH, imgW]], true) || 0;
    const targetZ = Math.min(maxZ, baseZ + MINIMAP_ZOOM_OFFSET);
    _miniMap.setView(latlng, targetZ, { animate: false });

    // Add ou move le marker tracker
    if (_miniTrackerMark) {
      if (!_miniMap.hasLayer(_miniTrackerMark)) {
        _miniTrackerMark.addTo(_miniMap);
      }
      _miniTrackerMark.setLatLng(latlng);
    }
    // 🔧 v1.10.2-fix3 : invalidateSize retiré du tick (était appelé toutes
    // les 250ms inutilement — coût perf). Il est suffisant de l'appeler
    // à l'init (déjà fait dans _initMiniMap cascade) + sur orientationchange
    // si on veut vraiment couvrir le rotation device.
  }

  // ============================================================
  // WAKE LOCK — empêche l'écran de s'éteindre pendant l'urgence
  // ============================================================
  let _wakeLockSentinel = null;
  function _acquireWakeLock() {
    if (!navigator.wakeLock) return;
    navigator.wakeLock.request("screen").then(function(sentinel) {
      _wakeLockSentinel = sentinel;
      console.log("[Emergency] Wake lock acquis");
    }).catch(function(e) {
      console.warn("[Emergency] Wake lock indispo :", e.name);
    });
  }
  function _releaseWakeLock() {
    if (_wakeLockSentinel) {
      try { _wakeLockSentinel.release(); } catch(e) {}
      _wakeLockSentinel = null;
    }
  }

  // ============================================================
  // EXPORT GLOBAL
  // ============================================================
  window.EmergencyMode = {
    activer:    activer,
    desactiver: desactiver,
    isActif:    isActif,
    toggle:     toggle,
    setTheme:   setTheme
  };

  console.log("[Emergency] Module chargé");
})();
