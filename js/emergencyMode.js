/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * Site : https://myktamap.fr
 * Licence : CC BY-NC-SA 4.0 — Usage commercial interdit sans accord ecrit prealable.
 * Voir LICENSE a la racine du projet.
 */

// =========================
// 🔆 AFFICHAGE XL (ex-« Mode urgence ») — v1.10.1
// =========================
// Nom affiché à l'utilisateur : « 🔆 Affichage XL » (EN « XL display », ES « Vista XL »),
// décision KARMA 10/10/2026 : 🚨 reste réservé à la Sortie d'urgence. Le code (EmergencyMode,
// classes kta-emergency-*, clés emergency.*) garde son nom d'origine.
// Bouton "panique" qui affiche un écran simplifié plein écran avec les infos
// VITALES en GROS :
//   - Mini-carte interactive (déplacer / zoomer au doigt) centrée sur la
//     position, avec la boussole posée dessus, les points du plan et ceux de
//     l'utilisateur ; 🎯 Recentrer reprend le suivi (03/10/2026, KARMA)
//   - Appui sur un point → bulle « 📍 Je suis ici » (même recalage que la
//     bulle de la carte principale)
//   - 📋 Plan géoréférencé SEULEMENT : icône dans la ligne d'état qui ouvre
//     une bulle avec les coordonnées GPS en gros (à dicter) et un bouton
//     Copier → « lat, lng » NU, le format qu'un SMS, une app de carte ou une
//     équipe de secours comprennent sans rien retirer. Plus aucune
//     coordonnée affichée en permanence (03/10/2026, KARMA).
//   - Heading boussole en temps réel (gros chiffres + flèche compas)
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
  // listener orientationchange/resize pour invalidateSize
  // de la minimap. Posé à l'activer(), retiré au desactiver(). Géré au scope
  // module pour pouvoir l'ajouter ET le retirer proprement.
  let _orientationListener = null;

  // (KARMA "on réactive itinéraire sans le menu cocher comme
  // avant, on le voyait bien si ca crashait pas") : la toggle conditionnelle
  // est retirée. L'itinéraire est désormais toujours affiché dans la minimap
  // (avec décimation + halo blanc + cyan vif pour visibilité). La cause
  // racine du crash n'était pas l'itinéraire mais l'image JPG volumineuse,
  // désormais gérée par l'anti-crash + V2 viewport-aware tiles (v1.12.0).
  // Note : l'ancienne clé localStorage "myktamap_emergency_show_iti_v1" reste
  // sans effet, sera nettoyée automatiquement au prochain reset complet.

  // (KARMA "comportement de saut comme on avait avant car
  // il peut pas faire plus que un tour complet") : pattern rotation
  // unwrapped — même fix que tracking.js > _trackerRotationUnwrapped
  // (v1.9.2-fix10). La CSS transition rotate(deg) interprète les valeurs
  // littéralement (350°→10° = -340° animation arrière). On cumule donc
  // les deltas courts pour que la valeur appliquée au CSS soit toujours
  // dans le bon sens visuel (peut être -10, 370, 720, -45… visuellement
  // identique mais le CSS anime toujours par le chemin court).
  let _compassUnwrapped = null;
  let _compassLastRaw   = null;
  // 🩸 vrai seulement quand les rotors de la boussole ont été
  // RÉELLEMENT posés (la minimap naît 100 ms après le premier tick).
  let _rotorsPoses      = false;

  // (KARMA "afficher dans le carré de la boussole derrière,
  // l'endroit où on est localisé sur la carte en zoom max et auto focus") :
  // mini L.map secondaire dans le carré compass qui partage les image
  // layers du plan principal + un marker tracker au centre.
  let _miniMap         = null;
  let _miniTrackerMark = null;
  // (KARMA "affiche les roads, c'est utile pour trouver
  // son chemin en mode urgence") : layers polylines roads + itinéraire
  // rendus sur le minimap. Stockés pour cleanup au destroy.
  let _miniRoadLayers      = [];
  // 🩸 (KARMA : « en XL, l'itinéraire ne se met pas à jour quand on fait
  // des Je suis ici ») — les tracés n'étaient dessinés qu'à l'ouverture. Le
  // recalage (`_couperDerriere`), un recalcul ou un effacement REMPLACENT
  // l'objet itinéraire dans `getRoads()` sans émettre d'événement : le tick
  // compare donc l'objet (et sa longueur) à celui dessiné. `undefined` = pas
  // encore dessiné ; `null` = dessiné sans itinéraire.
  let _miniItiRef          = undefined;
  let _miniItiLen          = 0;
  // (KARMA "pareil pour zone et structure") : layers
  // zones (polygons) + structures (polygons + polylines fronts).
  let _miniZoneLayers      = [];
  let _miniStructureLayers = [];
  // marqueurs des points (plan + utilisateur) du niveau
  // affiché. Posés UNE fois, reposés seulement si la signature des niveaux
  // visibles change (cf `_signatureNiveaux`) — jamais à chaque tick.
  let _miniPoiLayers       = [];
  let _miniPoiSig          = null;

  // MINI-CARTE INTERACTIVE.
  // `_suiviPause` : l'utilisateur a bougé la carte → plus de recentrage
  // automatique, bouton 🎯 visible, rotation « plan orienté » retirée.
  // `_vueAuto` : compteur > 0 pendant NOS changements de vue (setView,
  // fitBounds, invalidateSize) — tout `movestart` hors de ce compteur vient
  // d'un geste de l'utilisateur.
  let _suiviPause = false;
  let _vueAuto    = 0;
  // Bulle ouverte au-dessus de l'écran : "coords" | "point" | null.
  let _bulleOuverte = null;
  let _bulleDeclencheur = null;   // élément qui reprend le focus à la fermeture
  let _pointBulle   = null;       // point affiché dans la bulle point

  // ============================================================
  // FORMAT HELPERS
  // ============================================================
  // 🌍 Transform de calibrage KMZ du plan courant, ou null.
  //
  // avant on cherchait
  // `calib.transform` qui n'est JAMAIS persisté par KmzExport.setCalibration
  // (qui stocke uniquement {pointA, pointB}). Clone exact du bug fix4 dans
  // gpxIO.js. Conséquence : le bloc GPS du mode urgence ÉTAIT TOUJOURS MASQUÉ,
  // même pour un plan calibré. Pile la situation où l'user en a besoin
  // (perdu en cata, secours à guider).
  // Fix : construire le transform à la demande via KmzExport.buildTransform
  // (pattern identique à gpxIO.js > _getTransform après v1.21.0-fix4).
  //
  // c'est aussi ce qui décide si l'icône 📋 de la ligne
  // d'état existe — pas de géoréférencement, pas d'icône.
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
      return window.KmzExport.buildTransformCalib(calib);   // pointC optionnel propagé (affine)
    } catch(e) {
      // Calibrage présent mais dégénéré (points colinéaires, etc.)
      return null;
    }
  }

  // Coordonnées GPS de la position courante, ou null (plan non
  // géoréférencé, pas de position, conversion impossible).
  function _gpsCourant() {
    const pos = (typeof window.getTrackingPosition === "function") ? window.getTrackingPosition() : null;
    if (!pos || typeof pos.x !== "number" || typeof pos.y !== "number") return null;
    const t = _transformCalib();
    if (!t || !window.KmzExport || typeof window.KmzExport.planToGps !== "function") return null;
    try {
      const gps = window.KmzExport.planToGps(t, pos.x, pos.y);
      if (!gps || !Number.isFinite(gps.lat) || !Number.isFinite(gps.lng)) return null;
      return { lat: gps.lat, lng: gps.lng };
    } catch(e) {
      console.warn("[Emergency] conversion GPS :", e);
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

  // (KARMA : « on devrait avoir la possibilité de copier les
  // coordonnées GPS de notre position, pour les envoyer si on trouve un point
  // de réseau ») — CE QU'ON MET DANS LE PRESSE-PAPIER.
  //
  // ⚠️ Coordonnées NUES : « 48.823328, 2.322915 » (6 décimales ≈ 11 cm). Pas
  // d'heure, pas de cap, pas de nom de plan — c'est ce qui se colle tel quel
  // dans un SMS, dans Google Maps ou dans Plans. Y ajouter du texte casse le
  // collage dans une app de carte, et sur l'écran où on est perdu ce serait le
  // pire moment pour découvrir qu'il faut nettoyer la chaîne à la main.
  // Le doute sur la position (« jamais confirmée ») reste À L'ÉCRAN, dans la
  // bulle : il se dit à la personne, il ne se colle pas dans le message.
  //
  // plan NON géoréférencé → plus rien à copier ni à
  // afficher (l'icône 📋 n'existe pas) : son X/Y ne servait à personne
  // d'autre qu'à soi.
  function _texteACopier() {
    const g = _gpsCourant();
    return g ? (g.lat.toFixed(6) + ", " + g.lng.toFixed(6)) : null;
  }

  // Le retour tient dans le bouton lui-même : pas de toast à chercher, pas de
  // modale à fermer. Deux secondes, puis il redevient ce qu'il était.
  let _timerCopie = null;
  function _copierPosition() {
    const btn = document.getElementById("kta-em-coords-copier");
    const txt = _texteACopier();
    const dire = function (cle) {
      if (!btn) return;
      btn.textContent = window.I18n.t(cle);
      if (_timerCopie) clearTimeout(_timerCopie);
      _timerCopie = setTimeout(function () {
        const b = document.getElementById("kta-em-coords-copier");
        if (b) b.textContent = window.I18n.t("emergency.copier");
      }, 2000);
    };
    if (!txt) { dire("emergency.copierRien"); return; }
    if (typeof window.ktaCopierTexte !== "function") { dire("emergency.copierKo"); return; }
    window.ktaCopierTexte(txt).then(function (ok) {
      dire(ok ? "emergency.copierOk" : "emergency.copierKo");
      if (ok) console.log("[Emergency] position copiée");
    });
  }

  // Phrase d'état de la position (règle B1, audit 13/09/2026) : une position
  // jamais confirmée est le DÉPART DU PLAN, pas « ta dernière position » —
  // une coordonnée GPS calculée depuis elle doit le dire, c'est celle-là
  // qu'on dicte au téléphone.
  function _statutPosition(pos) {
    if (!pos) return window.I18n.t("emergency.status.aucunePosition");
    const trackingActif = !!(typeof window.getTrackingActif === "function" && window.getTrackingActif());
    const etat = (typeof window.getTrackingPositionEtat === "function")
      ? window.getTrackingPositionEtat() : null;
    return trackingActif
      ? window.I18n.t("emergency.status.trackerActif")
      : (etat && !etat.confirmee)
        ? window.I18n.t("emergency.status.positionDefaut")
        : window.I18n.t("emergency.status.dernierePosition");
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
        // LE HEADER PORTE CE QUI ÉTAIT EN BAS.
        //
        // Le bloc « ÉCHELLE / PLAN / ÉTAT » occupait une pleine largeur de
        // grille en bas de l'écran pour trois lignes qu'on ne lit qu'une
        // fois : il devient deux puces dans le header, et le nom du plan
        // devient le sous-titre. Place rendue à la minimap, qui est la
        // seule chose qu'on regarde vraiment quand on est perdu.
        //
        // toggle 🗺️ Itinéraire RETIRÉ. L'itinéraire actif est
        // toujours affiché dans la minimap (anti-crash JPG géré séparément
        // par _resolveMiniMapImageSource depuis v1.12.0).
        // le bouton clair/sombre aussi — il datait de
        // l'époque où seul cet écran savait s'éclairer. `activer()` lit
        // `ThemeManager.isLight()` depuis la v1.23.0 : le mode urgence suit
        // le thème de l'app, il n'y a plus de second réglage à comprendre.
        '<div class="kta-emergency-header">' +
          '<div class="kta-emergency-header-main">' +
            '<span class="kta-emergency-titre">' + t("emergency.header.titre") + '</span>' +
            '<span class="kta-emergency-plan-nom" id="kta-em-plan">—</span>' +
          '</div>' +
          // (KARMA « enlève aussi px/m du mode XL ») — l'échelle
          // est partie : c'est un chiffre de CALIBRAGE, il se lit une fois dans
          // ⚙️ Réglages et ne sert à rien quand on cherche où l'on est. Les
          // distances de l'app en dépendent déjà sans qu'on ait à les convertir
          // à la main. Il ne reste que l'état du matériel, celui qui change.
          // l'icône des coordonnées vit ici, à côté de
          // l'état : visible SEULEMENT sur un plan géoréférencé (cf `_tick`).
          '<div class="kta-emergency-etats">' +
            '<span class="kta-emergency-chip" id="kta-em-etat">—</span>' +
            '<button class="kta-em-coords-btn" id="kta-em-coords-btn" type="button" hidden ' +
                    'aria-haspopup="dialog" ' +
                    'title="' + t("emergency.coords.ouvrir") + '" ' +
                    'aria-label="' + t("emergency.coords.ouvrir") + '">📋</button>' +
          '</div>' +
        '</div>' +

        // GUIDAGE (décision KARMA A). Cet écran RECOUVRE la
        // carte, donc le bandeau « dans X m, tourner à gauche » : la
        // prochaine consigne est reprise ici, en gros. Hors de la grille pour
        // ne rien changer à sa disposition ; masqué quand il n'y a rien à dire.
        // Les choix d'un écart (Recalculer / Je suis ici / Ignorer) vivent sur
        // la carte : le bouton ramène à elle.
        '<div class="kta-emergency-bloc kta-emergency-guidage" id="kta-em-guidage" style="display:none">' +
          '<div class="kta-emergency-guidage-ligne">' +
            '<span class="kta-emergency-guidage-icone" id="kta-em-guid-icone"></span>' +
            '<div class="kta-emergency-guidage-textes">' +
              '<div class="kta-emergency-guidage-principal" id="kta-em-guid-principal"></div>' +
              '<div class="kta-emergency-sub" id="kta-em-guid-sous"></div>' +
            '</div>' +
          '</div>' +
          '<button class="kta-emergency-guidage-choix" id="kta-em-guid-choix" type="button" style="display:none">' +
            t("emergency.guidage.choix") +
          '</button>' +
        '</div>' +

        // (KARMA « aller à l'essentiel, gagner de la place ») —
        // le bloc POSITION permanent est RETIRÉ : ni X/Y du plan, ni GPS en
        // continu. Les coordonnées ne servent qu'à être dictées ou envoyées :
        // elles passent dans la bulle 📋 de la ligne d'état. Toute la grille
        // revient à la mini-carte.
        '<div class="kta-emergency-grid">' +

          '<div class="kta-emergency-bloc kta-emergency-bloc-heading">' +
            // (KARMA "le minimap doit prendre tout le
            // rectangle cap") : minimap Leaflet en background du bloc
            // entier (rectangle full width), pas juste le rond compass.
            // (KARMA "on mais le centre de la bousole
            // triangle rouge a ma position, et le rond rouge sur le cercle
            // jaune bouge pour indiquer le nord") : le gros compass widget
            // centré sur la minimap est RETIRÉ. La boussole devient un
            // marker L.divIcon attaché à la position du tracker sur la
            // minimap (cf _initMiniMapAvecSource + _tick). Le bloc heading
            // garde uniquement le label CAP + degrés + cardinal en overlay
            // texte (les chiffres restent lisibles en grand).
            '<div class="kta-emergency-mini-map" id="kta-em-mini-map"></div>' +
            // (KARMA "met le SE/S/N en dessous de CAP plus
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
            // 🎯 Visible seulement quand l'utilisateur a bougé la carte.
            '<button class="kta-em-recentrer-btn" id="kta-em-recentrer" type="button" hidden ' +
                    'title="' + t("emergency.recentrer.title") + '">' +
              t("emergency.recentrer") +
            '</button>' +
          '</div>' +

        '</div>' +

        // l'encart rouge « ce mode désactive
        // l'interface principale… » est RETIRÉ : quatre lignes de conseils
        // généraux au-dessus du seul bouton de sortie, sur un écran qu'on
        // ouvre quand on est perdu. Ce qu'il faut faire quand on est perdu
        // vit dans la doc (Aide → Mode Secours), pas en travers de l'écran
        // qui doit répondre « où suis-je » en une seconde.
        '<button class="kta-emergency-exit-btn" id="kta-emergency-exit" type="button">' +
          t("emergency.exitBtn") +
        '</button>' +

      '</div>' +

      // 📋 BULLE COORDONNÉES — en gros, pour les DICTER (lisible à un mètre),
      // + Copier. Le statut dit si la position n'a jamais été confirmée.
      '<div class="kta-em-bulle-fond" id="kta-em-coords-bulle" hidden>' +
        '<div class="kta-em-bulle" role="dialog" aria-modal="true" aria-labelledby="kta-em-coords-titre">' +
          '<div class="kta-em-bulle-tete">' +
            '<span class="kta-em-bulle-titre" id="kta-em-coords-titre">' + t("emergency.label.gps") + '</span>' +
            '<button class="kta-em-bulle-fermer" type="button" data-kta-em-fermer="1" ' +
                    'title="' + t("emergency.bulle.fermer") + '" ' +
                    'aria-label="' + t("emergency.bulle.fermer") + '">✕</button>' +
          '</div>' +
          '<div class="kta-em-coords-val" id="kta-em-coords-lat">—</div>' +
          '<div class="kta-em-coords-val" id="kta-em-coords-lng">—</div>' +
          '<div class="kta-emergency-sub kta-em-bulle-statut" id="kta-em-coords-statut"></div>' +
          '<button class="kta-em-bulle-action" id="kta-em-coords-copier" type="button" ' +
                  'title="' + t("emergency.copier.title") + '">' +
            t("emergency.copier") +
          '</button>' +
        '</div>' +
      '</div>' +

      // 📍 BULLE POINT — volontairement pas la popup de la carte : nom, type,
      // note, et une seule action, « Je suis ici ».
      '<div class="kta-em-bulle-fond" id="kta-em-point-bulle" hidden>' +
        '<div class="kta-em-bulle" role="dialog" aria-modal="true" ' +
             'aria-label="' + t("emergency.point.aria") + '">' +
          '<div class="kta-em-bulle-tete">' +
            '<span class="kta-em-bulle-titre kta-em-point-nom" id="kta-em-point-nom"></span>' +
            '<button class="kta-em-bulle-fermer" type="button" data-kta-em-fermer="1" ' +
                    'title="' + t("emergency.bulle.fermer") + '" ' +
                    'aria-label="' + t("emergency.bulle.fermer") + '">✕</button>' +
          '</div>' +
          '<div class="kta-em-point-type" id="kta-em-point-type"></div>' +
          '<div class="kta-em-point-note" id="kta-em-point-note"></div>' +
          '<button class="kta-em-bulle-action" id="kta-em-point-ici" type="button" ' +
                  'title="' + t("poi.iAmHere") + '">' +
            t("iti.wp.jeSuisIci") +
          '</button>' +
        '</div>' +
      '</div>';
    return overlay;
  }

  function _bindOverlay() {
    if (!_overlay) return;
    document.getElementById("kta-emergency-exit").addEventListener("click", desactiver);

    // 📋 Coordonnées
    const btnCoords = document.getElementById("kta-em-coords-btn");
    if (btnCoords) btnCoords.addEventListener("click", function () { _ouvrirBulle("coords", btnCoords); });
    const btnCopie = document.getElementById("kta-em-coords-copier");
    if (btnCopie) btnCopie.addEventListener("click", _copierPosition);

    // 📍 Point
    const btnIci = document.getElementById("kta-em-point-ici");
    if (btnIci) btnIci.addEventListener("click", _jeSuisIciPoint);

    // ✕ et appui à côté (sur le fond) ferment la bulle
    _overlay.querySelectorAll(".kta-em-bulle-fond").forEach(function (fond) {
      fond.addEventListener("click", function (ev) {
        if (ev.target === fond || (ev.target.closest && ev.target.closest("[data-kta-em-fermer]"))) {
          _fermerBulle();
        }
      });
    });

    // 🎯 Recentrer
    const btnRec = document.getElementById("kta-em-recentrer");
    if (btnRec) btnRec.addEventListener("click", _reprendreSuivi);

    // 🖐️ Gestes qui doivent trouver la carte DÉJÀ remise Nord en haut : la
    // rotation CSS fausse le point d'ancrage que Leaflet calcule au DÉBUT
    // d'un pincement, d'une molette ou d'un double-clic. Phase de capture
    // sur le bloc, donc avant les écouteurs Leaflet du conteneur.
    const bloc = _overlay.querySelector(".kta-emergency-bloc-heading");
    if (bloc) {
      bloc.addEventListener("touchstart", function (ev) {
        if (ev.touches && ev.touches.length >= 2) _pauseSuivi();
      }, { capture: true, passive: true });
      bloc.addEventListener("wheel", function () { _pauseSuivi(); }, { capture: true, passive: true });
      bloc.addEventListener("dblclick", function () { _pauseSuivi(); }, true);
    }

    // 🪧 Guidage : les choix d'un écart sont sur la carte → on y retourne.
    const btnChoix = document.getElementById("kta-em-guid-choix");
    if (btnChoix) btnChoix.addEventListener("click", desactiver);

    // handlers de la toggle 🗺️ Itinéraire RETIRÉS (toggle
    // supprimée du HTML). L'itinéraire est toujours rendu dans la minimap
    // via _addRoadsToMiniMap (avec décimation + halo blanc).

    // Echap = sortie (cas PC). Sur mobile : bouton ↩️
    document.addEventListener("keydown", _onKey);
  }

  // Échap : UN SEUL gestionnaire pour l'écran et ses bulles, donc l'ordre est
  // garanti — une bulle ouverte absorbe la touche, l'écran XL reste ouvert.
  function _onKey(ev) {
    if (ev.key === "Escape") {
      ev.preventDefault();
      if (_bulleOuverte) {
        ev.stopPropagation();
        _fermerBulle();
        return;
      }
      desactiver();
    }
  }

  // ============================================================
  // BULLES (coordonnées / point) — au-dessus de l'écran XL
  // ============================================================
  function _ouvrirBulle(quoi, declencheur) {
    _fermerBulle();
    const fond = document.getElementById(quoi === "coords" ? "kta-em-coords-bulle" : "kta-em-point-bulle");
    if (!fond) return;
    _bulleOuverte = quoi;
    _bulleDeclencheur = declencheur || null;
    if (quoi === "coords") _majBulleCoords();
    fond.hidden = false;
    const focus = fond.querySelector(quoi === "coords" ? "#kta-em-coords-copier" : "#kta-em-point-ici");
    if (focus) { try { focus.focus({ preventScroll: true }); } catch(e) {} }
  }

  function _fermerBulle() {
    if (!_overlay) return;
    _overlay.querySelectorAll(".kta-em-bulle-fond").forEach(function (f) { f.hidden = true; });
    const avait = _bulleOuverte;
    _bulleOuverte = null;
    _pointBulle = null;
    if (avait && _bulleDeclencheur && document.contains(_bulleDeclencheur)) {
      try { _bulleDeclencheur.focus({ preventScroll: true }); } catch(e) {}
    }
    _bulleDeclencheur = null;
  }

  // Rafraîchie à l'ouverture puis à chaque tick tant qu'elle est ouverte :
  // la position bouge pendant le suivi, les chiffres dictés doivent suivre.
  function _majBulleCoords() {
    const pos = (typeof window.getTrackingPosition === "function") ? window.getTrackingPosition() : null;
    const g = _gpsCourant();
    const lat = document.getElementById("kta-em-coords-lat");
    const lng = document.getElementById("kta-em-coords-lng");
    const st  = document.getElementById("kta-em-coords-statut");
    if (lat) lat.textContent = g ? g.lat.toFixed(6) : "—";
    if (lng) lng.textContent = g ? g.lng.toFixed(6) : "—";
    if (st)  st.textContent  = _statutPosition(pos);
  }

  // Libellé du type d'un point : légende personnalisée si elle existe (elle
  // connaît les icônes custom), sinon le dico, sinon le tag brut.
  function _libelleType(tag) {
    if (!tag) return "";
    try {
      const LC = window.LegendCustomization;
      if (LC && typeof LC.getLabel === "function") {
        const l = LC.getLabel("icones", tag);
        if (l) return l;
      }
      if (window.I18n.has && window.I18n.has("legendui.label." + tag)) {
        return window.I18n.t("legendui.label." + tag);
      }
    } catch(e) {}
    return tag;
  }

  function _ouvrirBullePoint(p, declencheur) {
    if (!p) return;
    const nom  = document.getElementById("kta-em-point-nom");
    const type = document.getElementById("kta-em-point-type");
    const note = document.getElementById("kta-em-point-note");
    const tag  = (Array.isArray(p.tags) && p.tags[0]) || "";
    const desc = (typeof p.description === "string") ? p.description.trim() : "";
    if (nom)  nom.textContent  = p.nom || window.I18n.t("emergency.point.sansNom");
    if (type) { type.textContent = _libelleType(tag); type.hidden = !tag; }
    if (note) { note.textContent = desc; note.hidden = !desc; }
    _ouvrirBulle("point", declencheur);
    _pointBulle = p;
  }

  // 📍 Même chemin que la bulle de la carte principale (utils.js >
  // buildPointPopupHtml → `recalerTrackerSurPoint`) : position confirmée,
  // ancre du journal, validation d'étape d'itinéraire, replanification,
  // vibration. On lui passe en plus le NIVEAU du point : la mini-carte peut
  // montrer plusieurs niveaux visibles, et le niveau actif par défaut ne
  // serait pas forcément le sien (la fonction l'ignore hors multi-niveau).
  function _jeSuisIciPoint() {
    const p = _pointBulle;
    _fermerBulle();
    if (!p || typeof window.recalerTrackerSurPoint !== "function") return;
    try {
      window.recalerTrackerSurPoint(p.x, p.y, Number.isInteger(p.level) ? p.level : undefined);
    } catch(e) {
      console.warn("[Emergency] « Je suis ici » échoué :", e);
    }
    _reprendreSuivi();
  }

  // ============================================================
  // POLLING — update temps réel
  // ============================================================
  function _tick() {
    if (!_overlay) return;

    const pos = (typeof window.getTrackingPosition === "function") ? window.getTrackingPosition() : null;

    // 📋 L'icône des coordonnées n'existe que sur un plan géoréférencé.
    const geo = !!_transformCalib();
    const btnCoords = document.getElementById("kta-em-coords-btn");
    if (btnCoords && btnCoords.hidden === geo) btnCoords.hidden = !geo;
    if (_bulleOuverte === "coords") {
      if (geo) _majBulleCoords(); else _fermerBulle();
    }

    if (pos) {
      // auto-focus du minimap sur la position (en pause si
      // l'utilisateur explore la carte — cf `_updateMiniMap`)
      _updateMiniMap(pos);
    }
    _majPointsSiNiveauChange();
    _majRoadsSiChange();

    // 🧭 Heading (boussole)
    // Bascule de getCurrentHeading() (Nord vrai) vers
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
      // 🩸 LA BOUSSOLE CONTREDISAIT SON PROPRE TEXTE.
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
        // rotation unwrapped (cumul des deltas courts)
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
        // (KARMA "le rond rouge sur le cercle jaune bouge
        // pour indiquer le nord") : on tourne le rotor qui porte le point
        // Nord à -heading. Carte North-up → quand l'user fait face au N,
        // le point reste au sommet (12h). Face à l'Est, le N est à GAUCHE
        // dans la perspective de marche → rotation -90° (le point passe
        // à 9h). Etc. Cohérent boussole physique tenue dans la main.
        // Minimap tournée : elle porte elle-même l'orientation, le point
        // Nord n'a plus à contre-tourner (sinon il compenserait deux fois).
        // Pendant l'exploration (suivi en pause) la carte est Nord en haut :
        // le point Nord reprend sa contre-rotation.
        const okNord = _updateTrackerNorthRotor(
          _minimapTourneeActive() ? 0 : -_compassUnwrapped);
        // (KARMA "le triangle ne tourne plus dans la
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

    // 🪧 Guidage — la consigne du bandeau, reprise en gros
    _majGuidage();

    // plus d'échelle ici (cf le gabarit). Les clés
    // `emergency.echelle.*` ont été retirées des trois dicos avec elle.

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
      // le bloc s'appelle « ÉTAT » et son commentaire promettait
      // « batterie si dispo » depuis toujours : elle n'y a jamais été. Sur
      // l'écran qu'on ouvre précisément quand la batterie lâche, c'était
      // l'information manquante la plus criante — et la fonction qui la
      // formate existe déjà. ⚠️ « si dispo » se vérifie avec `isAvailable()`,
      // pas avec la véracité du libellé (cf le pavé ci-dessous).
      try {
        // (KARMA « enlève aussi l'indicateur batterie si capteur
        // désactivé ou non disponible ») — `isAvailable()` D'ABORD.
        //
        // `formatLabel()` ne rend PAS une chaîne vide quand la batterie est
        // hors service : il rend **« ? »**, et `getEmoji()` rend **🪢** (l'état
        // « indispo » de la v1.11.1, pensé pour que la chip de l'en-tête montre
        // son emplacement grisé en développement). Le test `if (bat)` était donc
        // toujours vrai, et le bloc ÉTAT affichait « 🪢 ? » — sur Safari iOS,
        // qui n'a pas l'API, et sur tout appareil dont l'utilisateur a
        // décoché le réglage (`APP_CONFIG.batterieEnabled`). Un point
        // d'interrogation à la place d'un niveau de batterie, sur l'écran qu'on
        // ouvre quand la batterie lâche : moins qu'inutile, inquiétant.
        // L'en-tête principal masque déjà sa chip dans ce cas (v1.12.0) ; cet
        // écran-là ne l'avait jamais fait.
        const dispoBat = !!(window.BatteryGuard
          && typeof window.BatteryGuard.isAvailable === "function"
          && window.BatteryGuard.isAvailable());
        if (dispoBat && typeof window.BatteryGuard.formatLabel === "function") {
          const bat = window.BatteryGuard.formatLabel();
          // 🔋/🪢/⚡ selon le niveau et la charge : `formatLabel` ne rend que
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

  // lit l'état du bandeau de guidage (js/itiGuidage.js), qui
  // continue de se calculer sous cet écran (pas du tracker + battement 1 s).
  // On n'affiche que ce que le bandeau afficherait : mêmes règles, mêmes mots.
  function _majGuidage() {
    const bloc = document.getElementById("kta-em-guidage");
    if (!bloc) return;
    const st = (window.ItiGuidage && typeof window.ItiGuidage.etat === "function")
      ? window.ItiGuidage.etat() : null;
    if (!st || !st.visible) { bloc.style.display = "none"; return; }
    bloc.style.display = "";
    const alerte = (st.mode === "ecart" || st.mode === "demi");
    bloc.classList.toggle("kta-emergency-guidage-alerte", alerte);
    const ic = document.getElementById("kta-em-guid-icone");
    if (ic) {
      // Schéma du carrefour (SVG fait de nombres seuls, cf itiGuidage > _pictoSvg)
      // à la place de la flèche quand il y a 4 galeries ou plus.
      if (st.picto) ic.innerHTML = st.picto; else ic.textContent = st.icone || "";
      ic.style.transform = (typeof st.fleche === "number") ? "rotate(" + st.fleche + "deg)" : "";
    }
    const pr = document.getElementById("kta-em-guid-principal");
    if (pr) pr.textContent = st.principal || "";
    const so = document.getElementById("kta-em-guid-sous");
    if (so) { so.textContent = st.sous || ""; so.style.display = st.sous ? "" : "none"; }
    const choix = document.getElementById("kta-em-guid-choix");
    if (choix) choix.style.display = alerte ? "" : "none";
  }

  // ============================================================
  // ACTIVATION
  // ============================================================
  function activer() {
    if (_overlay) return;  // déjà actif

    // sync thème initial avec ThemeManager global. Si l'user
    // est en mode clair partout dans l'app, le mode urgence s'ouvre aussi
    // en clair. Il garde son toggle 🔆/🌑 local pour basculer ponctuellement
    // (ex: lampe d'appoint en sous-sol) sans changer le réglage global.
    if (window.ThemeManager && typeof window.ThemeManager.isLight === "function") {
      _theme = window.ThemeManager.isLight() ? "light" : "dark";
    }

    // (KARMA "si les accès aux capteurs non pas déjà
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

    // init du minimap (Leaflet secondaire) — délai 100ms
    // pour que le browser ait calculé le layout (sinon Leaflet voit un
    // container 0×0 et fitBounds échoue silencieusement).
    setTimeout(_initMiniMap, 100);

    // Premier tick immédiat
    _tick();
    _pollTimer = setInterval(_tick, POLL_MS);

    // Empêcher l'écran de s'éteindre sur mobile (Wake Lock API si dispo)
    _acquireWakeLock();

    // (KARMA "petit bug de décalage quand on passe en
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
        if (!_miniMap) return;
        _vueAutomatique(function () {
          _miniMap.invalidateSize({ animate: false });
          // Re-fitBounds aussi pour recadrer correctement après rotation —
          // SAUF si l'utilisateur explore la carte : on garderait sa vue
          // (le prochain tick recentre de toute façon quand le suivi est actif).
          if (_suiviPause) return;
          const pc = window.PLAN_CONFIG;
          if (pc && pc.plan) {
            const imgW = pc.plan.imageWidth || 0;
            const imgH = pc.plan.imageHeight || 0;
            if (imgW > 0 && imgH > 0) {
              _miniMap.fitBounds([[0, 0], [imgH, imgW]]);
            }
          }
        });
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
    // cleanup des listeners orientation/resize pour ne
    // pas garder des appels invalidateSize zombies après fermeture.
    if (_orientationListener) {
      window.removeEventListener("orientationchange", _orientationListener);
      window.removeEventListener("resize",            _orientationListener);
      _orientationListener = null;
    }
    // destroy minimap pour libérer les ressources Leaflet
    _fermerBulle();
    _destroyMiniMap();
    try { _overlay.remove(); } catch(e) {}
    _overlay = null;
    // La prochaine ouverture repart en suivi (carte centrée sur la position).
    _suiviPause = false;
    _vueAuto    = 0;
    if (_timerCopie) { clearTimeout(_timerCopie); _timerCopie = null; }
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
      // plus de bouton clair/sombre à rafraîchir — seule
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
  // (KARMA "moins zoomé")          : 4 → 2 (trop loin)
  // (KARMA "re zoom à fond")        : 2 → maxZ (bug)
  // (KARMA "dezoom un peu, ça bug") : maxZ → 5 (équilibre)
  // Compromis : ~20-50m d'horizon, assez serré pour repérer
  // l'environnement immédiat sans pousser Leaflet aux limites d'échelle
  // qui causent les artefacts de rendu sur image L.CRS.Simple.
  const MINIMAP_ZOOM_OFFSET = 5;

  // (KARMA "tjr des crash en mode urgence ... il charge au
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

    // (KARMA "en mode V2 sur le mode urgence, l'image
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
    // (KARMA "bug du modal Image volumineuse sur PC bcp trop
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

  // état du loader viewport-aware V2 — exposé au scope
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

  // loader de tuiles V2 viewport-aware pour la minimap.
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
      ownUrls:      new Map(),   // path → blob URL PROPRE à la minimap (révoquée au destroy)
      enCours:      new Set(),   // paths en cours d'extraction depuis le ZIP
      ferme:        false,       // posé au destroy : une extraction tardive ne redessine rien
      listenerRef:  null,        // ref de _refresh pour map.off()
      currentLevel: null
    };

    // extension d'après le manifest (webp/png = alpha, jpg = legacy)
    const _tileExt = (typeof window.ktaTileExt === "function") ? window.ktaTileExt(manifest) : "jpg";
    // 🩸 LA MINIMAP N'AVAIT AUCUN FOND SUR UN PLAN SERVEUR.
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
      // 🩸 SUR UN PLAN IMPORTÉ EN ZIP, DES TUILES MANQUAIENT (vu
      // sur mobile). La minimap partageait `asset.url` avec la carte
      // principale ; celle-ci, pour tenir en mémoire, révoque l'URL des
      // niveaux qu'elle quitte et libère même le fichier des ZIP lus à la
      // demande (`file = null`, `_trimLevelsLRU`). La minimap ne savait pas
      // le réextraire : tuile sautée, sans un mot. Elle a donc désormais ses
      // PROPRES URL (révoquées à sa fermeture), et réextrait du ZIP ce qui a
      // été libéré, comme la Vue OSM — puis se redessine.
      if (state.ownUrls.has(path)) return state.ownUrls.get(path);
      if (asset.file) {
        try {
          const u = URL.createObjectURL(asset.file);
          state.ownUrls.set(path, u);
          return u;
        } catch(e) { return null; }
      }
      if (asset._zipPath && typeof window._extractLazyAsset === "function" && !state.enCours.has(path)) {
        state.enCours.add(path);
        window._extractLazyAsset(path).then(function(f) {
          state.enCours.delete(path);
          if (f && !state.ferme) _refresh();
        }).catch(function() { state.enCours.delete(path); });
      }
      return null;
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
            // Remplissage noir des tuiles de bord masqué (07/10/2026).
            if (window.ktaRognerTuile) window.ktaRognerTuile(overlay, window.ktaRemplissageTuile(imgW, imgH, tileSize, scale, col, k));
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

    // (KARMA "tjr des crash en mode urgence ... il charge
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
      // déplacement et zoom au doigt / à la souris.
      // `keyboard` reste coupé (Échap et les flèches appartiennent à l'écran),
      // `trackResize` aussi : le redimensionnement passe par
      // `_orientationListener`, qui marque SES changements de vue comme
      // automatiques — celui de Leaflet passerait pour un geste et mettrait
      // le suivi en pause à chaque rotation de l'écran.
      _miniMap = L.map(container, {
        crs:             L.CRS.Simple,
        attributionControl: false,
        zoomControl:     false,
        scrollWheelZoom: true,
        dragging:        true,
        keyboard:        false,
        doubleClickZoom: true,
        touchZoom:       true,
        boxZoom:         false,
        trackResize:     false,
        zoomAnimation:   false,
        fadeAnimation:   false,
        minZoom:        -10,        // permet de dézoomer suffisamment
        maxZoom:         10,        // permet de zoomer fort autour du tracker
        preferCanvas:    true       // perf : canvas pour les polylines roads
      });
      // Tout début de déplacement qui n'est pas le nôtre = geste utilisateur.
      _miniMap.on("movestart zoomstart", function () {
        if (_vueAuto === 0) _pauseSuivi();
      });
      const bounds = [[0, 0], [imgH, imgW]];
      // pose des imageOverlays selon le type de source
      // (tuiles V2 multiples, baseImage V1 unique, ou rien si user a choisi
      // "continuer sans image" sur une image volumineuse).
      _poserImageOverlayMinimap(source, bounds);
      // Background neutre Leaflet quand pas d'image — déjà sombre via CSS,
      // les roads/zones restent contrastées sur le noir.
      if (source.type === "none") {
        container.classList.add("kta-em-mini-map-noimg");
      }
      _vueAutomatique(function () { _miniMap.fitBounds(bounds); });

      // ajoute zones (eau / remblais / effondrement /
      // inaccessible) + structures (piliers + murs + fronts) + roads sur
      // le minimap pour aider à trouver son chemin en mode urgence.
      // Ordre Z (du fond vers l'avant-plan, comme dans la carte principale) :
      //   zones < structures < roads.
      // Toutes filtrées par niveau si M-LVL actif.
      _addZonesToMiniMap(imgH);
      _addStructuresToMiniMap(imgH);
      _addRoadsToMiniMap(imgH);
      // les points par-dessus tout (volet marqueurs Leaflet).
      _addPointsToMiniMap(imgH);

      // multiple invalidateSize en cascade pour gérer
      // le cas où le container avait des dims 0×0 au moment du L.map().
      // Leaflet calcule les bounds avec les dims actuelles → si elles
      // étaient 0 au boot, fitBounds donne un zoom incohérent.
      // Cascade : 50ms (paint initial) + 200ms (animations finies) + 500ms
      // (sécurité ultime).
      setTimeout(function() {
        if (_miniMap) {
          try {
            _vueAutomatique(function () {
              _miniMap.invalidateSize({ animate: false });
              if (!_suiviPause) _miniMap.fitBounds(bounds);
            });
          } catch(e) {}
        }
      }, 50);
      setTimeout(function() {
        if (_miniMap) {
          try {
            _vueAutomatique(function () {
              _miniMap.invalidateSize({ animate: false });
              if (!_suiviPause) _miniMap.fitBounds(bounds);
            });
          } catch(e) {}
        }
      }, 200);

      // (KARMA "on mais le centre de la bousole triangle
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
          // (KARMA "le triangle ne tourne plus dans la
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

  // (KARMA : « en mode XL je vois qu'on ne récupère pas les
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

  // ajoute les zones (eau / remblais / effondrement /
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

  // ajoute les structures (piliers + murs polygons,
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

  // ajoute les routes (session + embedded) sur le minimap.
  // Styles cohérents avec road.js (vert / violet / jaune / cyan / magenta)
  // mais épaisseur réduite et opacité bumpée pour rester lisible par-dessus
  // l'image base désaturée.
  function _itineraireActif() {
    const r = (typeof window.getRoads === "function" ? window.getRoads() : []) || [];
    return r.find(function(x) { return x && x.type === "itinerary" && !x._preview; }) || null;
  }
  // Redessine les tracés quand l'itinéraire a changé (appelé par le tick).
  // Les tracés restent au-dessus des zones et structures : ils sont rajoutés
  // en dernier dans le même volet, comme à l'ouverture.
  function _majRoadsSiChange() {
    if (!_miniMap || _miniItiRef === undefined) return;
    const it = _itineraireActif();
    const len = it && Array.isArray(it.points) ? it.points.length : 0;
    if (it === _miniItiRef && len === _miniItiLen) return;
    const pc = window.PLAN_CONFIG;
    const imgH = (pc && pc.plan && pc.plan.imageHeight) || 0;
    if (imgH <= 0) return;
    _miniRoadLayers.forEach(function(layer) { try { layer.remove(); } catch(e) {} });
    _miniRoadLayers = [];
    _addRoadsToMiniMap(imgH);
  }

  function _addRoadsToMiniMap(imgH) {
    if (!_miniMap || typeof L === "undefined") return;
    _miniItiRef = _itineraireActif();
    _miniItiLen = _miniItiRef && Array.isArray(_miniItiRef.points) ? _miniItiRef.points.length : 0;
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
      // (KARMA "toujours pas itinéraire en mode urgence") :
      // l'itinéraire ÉTAIT dessiné mais quasi invisible (weight 3 dashed
      // sur fond minimap zoomé serré + désaturé). Refonte du style :
      //   - weight 6 (vs 3) = trait épais visible même à zoom élevé
      //   - LIGNE PLEINE (pas de dashArray) = présence continue
      //   - cyan vif + halo blanc derrière (2 polylines superposées,
      //     gérées via le flag _renderItiHalo dans le forEach pour
      //     ajouter une couche blanche underline avant la cyan).
      itinerary:  { color: "#00d4ff", weight: 6, opacity: 1 }
    };

    // (KARMA "mode urgence crash sur gros plan avec
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
    const MAX_POINTS_ITI      = 600;   // itinéraire : décimé, jamais sauté (30/09)
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
      // itinéraire désormais TOUJOURS rendu (toggle retirée).
      // La décimation + cap conservés pour anti-OOM, le rendu cyan + halo
      // blanc reste pour visibilité.
      let pts = road.points;
      if (road.type === "itinerary") {
        // Contre-audit IGC (30/09) : au-delà de 500 points, l'itinéraire était SAUTÉ
        // sans un mot — sur le plan réel, 3 équipes sur 8 n'avaient aucun tracé à
        // l'écran XL, celui qu'on regarde quand ça va mal. On ne saute plus : on
        // décime à MAX_POINTS_ITI (une polyline de 600 points ne pèse rien ; 100
        // donnait des segments de ~90 m sur 8 km, faux à ce zoom serré).
        if (pts.length > MAX_POINTS_ITI) {
          const step = Math.ceil(pts.length / MAX_POINTS_ITI);
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
        // (KARMA "toujours pas itinéraire en mode urgence") :
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

  // LES POINTS SUR LA MINI-CARTE.
  // Points de l'utilisateur (`getEditorPoints`) + points du plan
  // (`getAllEmbeddedPoints`), même filtre de niveau que zones/structures/
  // tracés ci-dessus (`passeFiltreNiveau`). Les filtres ≡ par type ne
  // s'appliquent PAS, pas plus qu'aux autres couches de cette carte : sur
  // l'écran qu'on ouvre perdu, un repère masqué pour alléger la carte
  // principale reste un repère.
  // Icône : résolution canonique `getIconUrlForPoint` (jamais de catalogue
  // local) ; l'<img> porte `kta-marker-img` + `data-kta-tag` pour profiter du
  // repli d'icône morte de map.js. Appui → bulle « Je suis ici ».
  const MINIMAP_POI_PX  = 40;     // cible tactile confortable (≥ 44 avec l'aura de Leaflet)
  const MINIMAP_POI_MAX = 2000;   // garde-fou DOM : au-delà, on s'arrête et on le dit
  function _addPointsToMiniMap(imgH) {
    if (!_miniMap || typeof L === "undefined") return;
    _miniPoiSig = _signatureNiveaux();
    const session  = (typeof window.getEditorPoints === "function" ? window.getEditorPoints() : []) || [];
    const embedded = (typeof window.getAllEmbeddedPoints === "function" ? window.getAllEmbeddedPoints() : []) || [];
    const all = session.concat(embedded);
    if (all.length === 0) return;
    const filter = (typeof window.passeFiltreNiveau === "function")
                   ? window.passeFiltreNiveau
                   : function() { return true; };
    const esc = window.ktaEsc;
    const demi = MINIMAP_POI_PX / 2;
    let added = 0, ignores = 0;
    all.forEach(function (p) {
      if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) return;
      if (!filter(p)) return;
      if (added >= MINIMAP_POI_MAX) { ignores++; return; }
      let url = null;
      try { url = (typeof window.getIconUrlForPoint === "function") ? window.getIconUrlForPoint(p) : null; }
      catch(e) {}
      const tag = (Array.isArray(p.tags) && p.tags[0]) || "";
      const icon = url
        ? L.divIcon({
            className: "kta-em-mini-poi",
            html: '<img src="' + esc(url) + '" alt="" draggable="false" class="kta-marker-img"' +
                  (tag ? ' data-kta-tag="' + esc(tag) + '"' : "") + '>',
            iconSize:   [MINIMAP_POI_PX, MINIMAP_POI_PX],
            iconAnchor: [demi, demi]
          })
        : L.divIcon({
            className: "kta-em-mini-poi kta-em-mini-poi-sans-icone",
            html: "",
            iconSize:   [MINIMAP_POI_PX, MINIMAP_POI_PX],
            iconAnchor: [demi, demi]
          });
      try {
        // convertCoord : [imageHeight - y, x]
        const m = L.marker([imgH - p.y, p.x], { icon: icon, keyboard: false, title: p.nom || "" });
        m.on("click", function (ev) {
          if (ev && ev.originalEvent) L.DomEvent.stopPropagation(ev.originalEvent);
          _ouvrirBullePoint(p, null);
        });
        m.addTo(_miniMap);
        _miniPoiLayers.push(m);
        added++;
      } catch(e) { console.warn("[Emergency] minimap point skip :", e); }
    });
    if (added > 0) console.log("[Emergency] minimap : " + added + " point(s) affiché(s)");
    if (ignores > 0) console.warn("[Emergency] minimap : " + ignores + " point(s) au-delà du plafond de " +
                                  MINIMAP_POI_MAX + " — non affichés");
  }

  function _retirerPointsMiniMap() {
    _miniPoiLayers.forEach(function (m) { try { m.remove(); } catch(e) {} });
    _miniPoiLayers = [];
  }

  // Signature des niveaux affichés : quand elle change, on repose les points
  // (rien d'autre ne les recrée — pas de travail au tick).
  function _signatureNiveaux() {
    const c = window.APP_CONFIG || {};
    if (c.multiLevel !== true) return "mono";
    return "ml:" + (Array.isArray(c.visibleLevels) ? c.visibleLevels.join(",") : "0");
  }
  function _majPointsSiNiveauChange() {
    if (!_miniMap || _miniPoiSig === null) return;
    if (_signatureNiveaux() === _miniPoiSig) return;
    const pc = window.PLAN_CONFIG;
    const imgH = (pc && pc.plan && pc.plan.imageHeight) || 0;
    if (imgH <= 0) return;
    _retirerPointsMiniMap();
    _addPointsToMiniMap(imgH);
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
    _miniItiRef = undefined;            _miniItiLen = 0;
    _cleanLayers(_miniZoneLayers);      _miniZoneLayers = [];
    _cleanLayers(_miniStructureLayers); _miniStructureLayers = [];
    _retirerPointsMiniMap();
    _miniPoiSig = null;

    // cleanup du loader V2 viewport-aware
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
      // Les URL de tuiles sont PROPRES à la minimap (cf `_resolveTileUrl`) :
      // on les révoque ici, la carte principale a les siennes.
      _miniV2State.ownUrls.forEach(function(u) { try { URL.revokeObjectURL(u); } catch(e) {} });
      _miniV2State.ownUrls.clear();
      _miniV2State.ferme = true;   // une extraction encore en vol ne redessine plus rien
      _miniV2State = null;
    }

    try {
      if (_miniTrackerMark) _miniTrackerMark.remove();
      _miniMap.remove();
    } catch(e) {}
    _miniMap = null;
    _miniTrackerMark = null;
  }

  // tourne le rotor du marker tracker pour positionner le
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

  // tourne le rotor du triangle dans la direction de
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

  // LA MINIMAP S'ORIENTE, comme la carte principale.
  //
  // On ne passe PAS par `mapBearing` : il est câblé sur `window.map` d'un
  // bout à l'autre, et c'est le module où une erreur n'affiche rien
  // d'anormal, juste du faux. Ici le cas est plus simple — tant que le suivi
  // est actif, la minimap se recentre sur la position à chaque tick, donc
  // **le centre de rotation coïncide toujours avec l'utilisateur**. Une
  // rotation du CONTENEUR suffit donc, sans toucher à la géométrie Leaflet.
  //
  // la minimap est devenue interactive, et une rotation CSS
  // que Leaflet ignore fausse ses gestes (le doigt part à droite, la carte
  // part en biais). Décision KARMA : PENDANT L'EXPLORATION (suivi en pause)
  // la carte revient Nord en haut ; 🎯 Recentrer relance la rotation. Le
  // conteneur garde sa taille agrandie (`.kta-em-mini-map-tournee`) pendant la
  // pause : seule la rotation tombe, sans redimensionner Leaflet en plein geste.
  //
  // Même interrupteur que la carte principale (`MapBearing.isEnabled`) : qui
  // ne veut pas de carte qui tourne n'en veut nulle part, et il n'y a pas
  // deux réglages à comprendre.
  function _minimapTourne() {
    try { return !!(window.MapBearing && window.MapBearing.isEnabled()); }
    catch(e) { return false; }
  }
  // La carte est-elle RÉELLEMENT tournée en ce moment ?
  function _minimapTourneeActive() {
    return _minimapTourne() && !_suiviPause;
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
    el.style.transform = _suiviPause ? "" : "rotate(" + (-cap) + "deg)";
  }
  // Repose l'orientation (carte + point Nord) hors du rythme de la boussole :
  // à la mise en pause et à la reprise du suivi.
  function _reappliquerOrientation() {
    if (typeof _compassUnwrapped !== "number" || isNaN(_compassUnwrapped)) return;
    _updateTrackerNorthRotor(_minimapTourneeActive() ? 0 : -_compassUnwrapped);
    _appliquerRotationMinimap(_compassUnwrapped);
  }

  // Exécute un changement de vue VOULU par ce module (recentrage, recadrage,
  // redimensionnement) sans qu'il passe pour un geste de l'utilisateur.
  function _vueAutomatique(fn) {
    _vueAuto++;
    try { fn(); }
    finally { _vueAuto--; }
  }

  // 🖐️ L'utilisateur a bougé la carte : plus de recentrage, 🎯 visible,
  // Nord en haut. Idempotent (appelé à chaque début de geste).
  function _pauseSuivi() {
    if (_suiviPause || !_overlay) return;
    _suiviPause = true;
    const btn = document.getElementById("kta-em-recentrer");
    if (btn) btn.hidden = false;
    const etaitTournee = _minimapTourne();
    _reappliquerOrientation();
    // Leaflet a mémorisé l'échelle apparente du conteneur au DÉBUT du
    // glisser (`Draggable._parentScale`, boîte englobante d'un conteneur
    // tourné = plus grande) : sans recalcul, la carte suivrait le doigt
    // moins vite pendant tout ce premier geste.
    if (etaitTournee && _miniMap) {
      try {
        const d = _miniMap.dragging && _miniMap.dragging._draggable;
        if (d && d._parentScale && L.DomUtil.getScale) {
          d._parentScale = L.DomUtil.getScale(_miniMap.getContainer());
        }
      } catch(e) {}
    }
  }

  // 🎯 Recentrer : la carte revient sur la position, au zoom du suivi, et
  // la rotation « plan orienté » reprend.
  function _reprendreSuivi() {
    _suiviPause = false;
    const btn = document.getElementById("kta-em-recentrer");
    if (btn) btn.hidden = true;
    if (_miniMap) { try { _miniMap.stop(); } catch(e) {} }
    _reappliquerOrientation();
    const pos = (typeof window.getTrackingPosition === "function") ? window.getTrackingPosition() : null;
    if (pos) _updateMiniMap(pos);
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
    // 🖐️ Suivi en pause (l'utilisateur explore) : on ne touche PAS à la vue,
    // seul le marqueur de position avance.
    if (!_suiviPause) {
      // (KARMA "dezoom un peu, ça bug à fond") : on
      // retombe sur la formule baseZ + offset clamped à maxZoom. À
      // maxZoom=10 sur image L.CRS.Simple, Leaflet bug visuellement
      // (image étirée bien au-delà de sa résolution native).
      const maxZ  = _miniMap.getMaxZoom();
      const baseZ = _miniMap.getBoundsZoom([[0, 0], [imgH, imgW]], true) || 0;
      const targetZ = Math.min(maxZ, baseZ + MINIMAP_ZOOM_OFFSET);
      // ce tick tourne 4 fois par seconde, et recentrait la
      // minimap à CHAQUE fois, même immobile : 40 setView en 10 s, chacun
      // relançant un parcours de toute la grille de tuiles (~35 000 itérations
      // pour rien), sur l'écran qu'on ouvre justement quand la batterie baisse.
      // On compare à la vue RÉELLE (pas à une valeur mémorisée) : si autre chose
      // l'a bougée — le recadrage après rotation de l'écran —, on recentre.
      const centre = _miniMap.getCenter();
      const dejaCentree = centre && _miniMap.getZoom() === targetZ &&
        Math.abs(centre.lat - latlng[0]) < 0.5 && Math.abs(centre.lng - latlng[1]) < 0.5;
      if (!dejaCentree) {
        _vueAutomatique(function () { _miniMap.setView(latlng, targetZ, { animate: false }); });
      }
    }

    // Add ou move le marker tracker
    if (_miniTrackerMark) {
      if (!_miniMap.hasLayer(_miniTrackerMark)) {
        _miniTrackerMark.addTo(_miniMap);
      }
      _miniTrackerMark.setLatLng(latlng);
    }
    // invalidateSize retiré du tick (était appelé toutes
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
