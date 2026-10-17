/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * Site : https://myktamap.fr
 * Licence : CC BY-NC-SA 4.0 — Usage commercial interdit sans accord ecrit prealable.
 * Voir LICENSE a la racine du projet.
 */

// =========================
// emergencyMode.js — écran « Affichage XL » : plein écran simplifié, infos vitales en gros.
// =========================
// Nom affiché « Affichage XL » (EN « XL display », ES « Vista XL ») ; le code garde son nom d'origine
// (EmergencyMode, classes kta-emergency-*, clés emergency.*). Le pictogramme gyrophare reste réservé à la Sortie
// d'urgence (décision produit). Pur affichage, aucun calcul (≠ « Je suis perdu », qui calcule une zone).
// Contenu : mini-carte interactive centrée sur la position (boussole posée dessus, points du plan et de
// l'utilisateur, Recentrer), bulle « Je suis ici » sur un point, bulle coordonnées GPS (plan géoréférencé
// seulement), cap en gros, consigne de guidage, bouton Sortir. Thème sombre ou clair (suit ThemeManager).
// Rafraîchi par un tick de 250 ms.
// Expose : window.EmergencyMode = { activer, desactiver, isActif, toggle, setTheme }
// Dépend de : tracking.js (position, cap, requestPermission), itiGuidage.js, styleResolver.js, tiling.js.
// 🩸 Palette propre à la mini-carte (exception de check-style-canon.js) : elle passe quand même par
//    ktaAppliquerCouleurChoisie et le canon pour les types cust-… (cf _styleMini).
// 🩸 La mini-carte a ses PROPRES URL de tuiles : la carte principale révoque les siennes (cf _resolveTileUrl).
// Garde-fous : scripts/check-style-canon.js, check-guidage.js, check-position-confirmee.js.

(function() {
  "use strict";

  const POLL_MS = 250;

  let _overlay      = null;
  let _pollTimer    = null;
  let _theme        = "dark";   // "dark" | "light"
  let _lastHeadingShown = null; // throttle DOM update
  // Listener orientationchange/resize (invalidateSize de la minimap) : posé à activer(), retiré à desactiver().
  let _orientationListener = null;

  // L'itinéraire est toujours affiché dans la minimap (décimé, halo blanc, cyan vif) : pas de bascule.

  // Rotation « unwrapped » (même principe que tracking.js > _trackerRotationUnwrapped) : la transition CSS
  // prend les degrés au pied de la lettre (350° → 10° = −340°, tour arrière). On cumule les deltas courts :
  // la valeur appliquée peut valoir −10, 370, 720…, l'animation prend toujours le chemin court.
  let _compassUnwrapped = null;
  let _compassLastRaw   = null;
  // 🩸 Vrai seulement quand les rotors de la boussole ont été RÉELLEMENT posés (la minimap naît 100 ms après
  // le premier tick).
  let _rotorsPoses      = false;

  // Mini L.map secondaire dans le bloc du cap : partage les images du plan, marqueur tracker au centre.
  let _miniMap         = null;
  let _miniTrackerMark = null;
  // Couches de tracés (routes + itinéraire) de la minimap, gardées pour le nettoyage.
  let _miniRoadLayers      = [];
  // 🩸 Le recalage (`_couperDerriere`), un recalcul ou un effacement REMPLACENT l'objet itinéraire dans
  // `getRoads()` sans émettre d'événement : le tick compare donc l'objet (et sa longueur) à celui dessiné.
  // `undefined` = pas encore dessiné ; `null` = dessiné sans itinéraire.
  let _miniItiRef          = undefined;
  let _miniItiLen          = 0;
  // Couches zones (polygones) + structures (polygones + polylignes des fronts).
  let _miniZoneLayers      = [];
  let _miniStructureLayers = [];
  // Marqueurs des points (plan + utilisateur) du niveau affiché. Posés UNE fois, reposés seulement si la
  // signature des niveaux visibles change (cf `_signatureNiveaux`), jamais à chaque tick.
  let _miniPoiLayers       = [];
  let _miniPoiSig          = null;

  // Mini-carte interactive.
  // `_suiviPause` : l'utilisateur a bougé la carte → plus de recentrage
  // automatique, bouton Recentrer visible, rotation « plan orienté » retirée.
  // `_vueAuto` : compteur > 0 pendant NOS changements de vue (setView,
  // fitBounds, invalidateSize) — tout `movestart` hors de ce compteur vient
  // d'un geste de l'utilisateur.
  let _suiviPause = false;
  let _vueAuto    = 0;
  // Bulle ouverte au-dessus de l'écran : "coords" | "point" | null.
  let _bulleOuverte = null;
  let _bulleDeclencheur = null;   // élément qui reprend le focus à la fermeture
  let _pointBulle   = null;       // point affiché dans la bulle point

  // ── Format ──────────────────────────────────────────────────────────
  // Transform de calibrage KMZ du plan courant, ou null.
  // 🩸 `calib.transform` n'est JAMAIS persisté par KmzExport.setCalibration (qui ne stocke que
  // {pointA, pointB}) : on construit le transform à la demande via KmzExport.buildTransform (comme
  // gpxIO.js > _getTransform), sinon le bloc GPS reste masqué même sur un plan calibré.
  // Décide aussi si l'icône coordonnées de la ligne d'état existe : pas de géoréférencement, pas d'icône.
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

  // Ce qu'on met dans le presse-papier.
  // ⚠️ Coordonnées NUES : « 48.823328, 2.322915 » (6 décimales ≈ 11 cm). Ni heure, ni cap, ni nom de plan :
  // c'est ce qui se colle tel quel dans un SMS ou une app de carte. Ajouter du texte casse ce collage.
  // Le doute sur la position (« jamais confirmée ») reste À L'ÉCRAN, dans la bulle, pas dans le message.
  // Plan non géoréférencé : rien à copier ni à afficher (pas d'icône coordonnées).
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

  // Phrase d'état de la position : une position jamais confirmée est le DÉPART DU PLAN, pas « ta dernière
  // position » — une coordonnée GPS calculée depuis elle doit le dire, c'est celle-là qu'on dicte.
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

  // ── Interface ───────────────────────────────────────────────────────
  function _buildOverlay() {
    const t = window.I18n.t.bind(window.I18n);
    const overlay = document.createElement("div");
    overlay.id = "kta-emergency-overlay";
    overlay.className = "kta-emergency-overlay kta-emergency-" + _theme;
    overlay.innerHTML =
      '<div class="kta-emergency-box">' +
        // Le header porte les états (deux puces) et le nom du plan en sous-titre : toute la place va à la minimap,
        // seule chose qu'on regarde quand on est perdu. Pas de bouton clair/sombre : l'écran suit le thème de
        // l'app (`ThemeManager.isLight()` à activer()).
        '<div class="kta-emergency-header">' +
          '<div class="kta-emergency-header-main">' +
            '<span class="kta-emergency-titre">' + t("emergency.header.titre") + '</span>' +
            '<span class="kta-emergency-plan-nom" id="kta-em-plan">—</span>' +
          '</div>' +
          // Pas d'échelle px/m ici (chiffre de calibrage, inutile pour se repérer) : seul l'état du matériel reste.
          // L'icône des coordonnées vit à côté de l'état, visible SEULEMENT sur un plan géoréférencé (cf `_tick`).
          '<div class="kta-emergency-etats">' +
            '<span class="kta-emergency-chip" id="kta-em-etat">—</span>' +
            '<button class="kta-em-coords-btn" id="kta-em-coords-btn" type="button" hidden ' +
                    'aria-haspopup="dialog" ' +
                    'title="' + t("emergency.coords.ouvrir") + '" ' +
                    'aria-label="' + t("emergency.coords.ouvrir") + '">📋</button>' +
          '</div>' +
        '</div>' +

        // Guidage : cet écran RECOUVRE la carte et donc son bandeau « dans X m, tourner à gauche » ; la
        // prochaine consigne est reprise ici, en gros, hors de la grille, masquée quand il n'y a rien à dire.
        // Les choix d'un écart (Recalculer / Je suis ici / Ignorer) vivent sur la carte : le bouton y ramène.
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

        // Pas de bloc POSITION permanent : les coordonnées ne servent qu'à être dictées ou envoyées (bulle
        // coordonnées).
        // Toute la grille revient à la mini-carte.
        '<div class="kta-emergency-grid">' +

          '<div class="kta-emergency-bloc kta-emergency-bloc-heading">' +
            // Minimap Leaflet en fond du bloc entier. La boussole est un marqueur L.divIcon posé sur la position
            // (cf _initMiniMapAvecSource + _tick) ; le bloc ne garde en surimpression que le texte du cap.
            '<div class="kta-emergency-mini-map" id="kta-em-mini-map"></div>' +
            // Disposition : en haut CAP + cardinal, au centre la minimap, en bas les degrés en gros.
            '<div class="kta-emergency-bloc-heading-overlay">' +
              '<div class="kta-emergency-heading-top">' +
                '<div class="kta-emergency-label">' + t("emergency.label.cap") + '</div>' +
                '<div class="kta-emergency-heading-card" id="kta-em-heading-card">—</div>' +
              '</div>' +
              '<div class="kta-emergency-value kta-emergency-heading-num" id="kta-em-heading-num">—</div>' +
            '</div>' +
            // Visible seulement quand l'utilisateur a bougé la carte.
            '<button class="kta-em-recentrer-btn" id="kta-em-recentrer" type="button" hidden ' +
                    'title="' + t("emergency.recentrer.title") + '">' +
              t("emergency.recentrer") +
            '</button>' +
          '</div>' +

        '</div>' +

        // Pas de conseils au-dessus du bouton de sortie : l'écran doit répondre « où suis-je » en une seconde ;
        // la conduite à tenir vit dans l'aide (Mode Secours).
        '<button class="kta-emergency-exit-btn" id="kta-emergency-exit" type="button">' +
          t("emergency.exitBtn") +
        '</button>' +

      '</div>' +

      // Bulle coordonnées : en gros pour les DICTER (lisible à un mètre), + Copier. Le statut dit si la
      // position n'a jamais été confirmée.
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

      // Bulle point : volontairement pas la popup de la carte — nom, type, note, une seule action « Je suis ici ».
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

    const btnCoords = document.getElementById("kta-em-coords-btn");
    if (btnCoords) btnCoords.addEventListener("click", function () { _ouvrirBulle("coords", btnCoords); });
    const btnCopie = document.getElementById("kta-em-coords-copier");
    if (btnCopie) btnCopie.addEventListener("click", _copierPosition);

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

    const btnRec = document.getElementById("kta-em-recentrer");
    if (btnRec) btnRec.addEventListener("click", _reprendreSuivi);

    // Gestes qui doivent trouver la carte DÉJÀ remise Nord en haut : la rotation CSS fausse le point d'ancrage
    // que Leaflet calcule au DÉBUT d'un pincement, d'une molette ou d'un double-clic. Capture sur le bloc,
    // donc avant les écouteurs Leaflet du conteneur.
    const bloc = _overlay.querySelector(".kta-emergency-bloc-heading");
    if (bloc) {
      bloc.addEventListener("touchstart", function (ev) {
        if (ev.touches && ev.touches.length >= 2) _pauseSuivi();
      }, { capture: true, passive: true });
      bloc.addEventListener("wheel", function () { _pauseSuivi(); }, { capture: true, passive: true });
      bloc.addEventListener("dblclick", function () { _pauseSuivi(); }, true);
    }

    // Guidage : les choix d'un écart sont sur la carte, on y retourne.
    const btnChoix = document.getElementById("kta-em-guid-choix");
    if (btnChoix) btnChoix.addEventListener("click", desactiver);

    // Échap = sortie (PC) ; sur mobile, bouton Sortir.
    document.addEventListener("keydown", _onKey);
  }

  // Échap : UN SEUL gestionnaire pour l'écran et ses bulles, donc ordre garanti — une bulle ouverte absorbe
  // la touche, l'écran XL reste ouvert.
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

  // ── Bulles (coordonnées / point), au-dessus de l'écran XL ──────────
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

  // Même chemin que la bulle de la carte principale (utils.js > buildPointPopupHtml →
  // `recalerTrackerSurPoint`) : position confirmée, ancre du journal, étape d'itinéraire, replanification,
  // vibration. On passe en plus le NIVEAU du point : la mini-carte peut montrer plusieurs niveaux et le
  // niveau actif n'est pas forcément le sien (ignoré hors multi-niveau).
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

  // ── Tick (250 ms) ───────────────────────────────────────────────────
  function _tick() {
    if (!_overlay) return;

    const pos = (typeof window.getTrackingPosition === "function") ? window.getTrackingPosition() : null;

    // L'icône des coordonnées n'existe que sur un plan géoréférencé.
    const geo = !!_transformCalib();
    const btnCoords = document.getElementById("kta-em-coords-btn");
    if (btnCoords && btnCoords.hidden === geo) btnCoords.hidden = !geo;
    if (_bulleOuverte === "coords") {
      if (geo) _majBulleCoords(); else _fermerBulle();
    }

    if (pos) {
      // Recentre la minimap sur la position (en pause si l'utilisateur explore, cf `_updateMiniMap`).
      _updateMiniMap(pos);
    }
    _majPointsSiNiveauChange();
    _majRoadsSiChange();

    // Cap relatif au Nord du PLAN (getPlanRelHeading, offset calibré), comme la carte principale ; repli sur
    // getCurrentHeading (Nord vrai) si le helper n'est pas chargé. Offset 0 → identique au Nord vrai.
    let heading = null;
    if (typeof window.getPlanRelHeading === "function") {
      heading = window.getPlanRelHeading();
    } else if (typeof window.getCurrentHeading === "function") {
      heading = window.getCurrentHeading();
    }
    if (typeof heading === "number" && !isNaN(heading)) {
      // Mise à jour DOM au degré près (sinon scintillement).
      const rounded = Math.round(heading);
      // 🩸 `|| !_rotorsPoses` : ce garde s'armerait au premier tick alors que la minimap (créée 100 ms plus
      // tard) n'existe pas encore ; les rotors sortiraient sur `if (!iconEl) return` et, cap figé (téléphone
      // posé), la boussole contredirait durablement les chiffres affichés.
      if (rounded !== _lastHeadingShown || !_rotorsPoses) {
        _lastHeadingShown = rounded;
        const fmt = _formatHeading(heading);
        const numEl  = document.getElementById("kta-em-heading-num");
        const cardEl = document.getElementById("kta-em-heading-card");
        if (numEl)  numEl.textContent  = fmt.num;
        if (cardEl) cardEl.textContent = fmt.card;
        // Rotation cumulée (deltas courts) : 350° → 10° = +20°, pas −340°.
        if (_compassLastRaw === null) {
          _compassUnwrapped = heading;
        } else {
          let delta = heading - _compassLastRaw;
          if (delta > 180)  delta -= 360;
          if (delta < -180) delta += 360;
          _compassUnwrapped += delta;
        }
        _compassLastRaw = heading;
        // Rotor du point Nord à −cap : face au N il reste à 12 h, face à l'E il passe à 9 h (boussole tenue en
        // main). Minimap tournée : elle porte déjà l'orientation, le point Nord ne contre-tourne pas (sinon double
        // compensation). Suivi en pause (carte Nord en haut) : il reprend sa contre-rotation.
        const okNord = _updateTrackerNorthRotor(
          _minimapTourneeActive() ? 0 : -_compassUnwrapped);
        // Triangle à +cap : sa pointe montre la direction de marche ; son +cap annule le −cap du conteneur, comme
        // l'icône du tracker sur la carte principale.
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

    // Guidage : la consigne du bandeau, reprise en gros.
    _majGuidage();

    const planEl = document.getElementById("kta-em-plan");
    if (planEl) {
      const planName = (window.PLAN_CONFIG && window.PLAN_CONFIG.plan && window.PLAN_CONFIG.plan.name)
                       || "—";
      planEl.textContent = planName;
    }

    // État : batterie si disponible, sinon résumé tracker + boussole.
    const etatEl = document.getElementById("kta-em-etat");
    if (etatEl) {
      const partsEtat = [];
      try {
        // 🩸 `isAvailable()` D'ABORD : hors service (Safari iOS sans API, réglage `APP_CONFIG.batterieEnabled`
        // décoché), `formatLabel()` ne rend pas une chaîne vide mais « ? » et `getEmoji()` rend l'emoji «
        // indisponible ». Tester le
        // libellé afficherait « <emoji> ? » sur l'écran qu'on ouvre quand la batterie lâche.
        const dispoBat = !!(window.BatteryGuard
          && typeof window.BatteryGuard.isAvailable === "function"
          && window.BatteryGuard.isAvailable());
        if (dispoBat && typeof window.BatteryGuard.formatLabel === "function") {
          const bat = window.BatteryGuard.formatLabel();
          // Icône selon niveau et charge : `formatLabel` ne rend que « 87% ».
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

  // Lit l'état du bandeau de guidage (js/itiGuidage.js), qui continue de se calculer sous cet écran.
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
      // Schéma du carrefour (SVG de nombres seuls, cf itiGuidage > _pictoSvg) à la place de la flèche dès 4
      // galeries.
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

  // ── Activation ──────────────────────────────────────────────────────
  function activer() {
    if (_overlay) return;  // déjà actif

    // Thème initial = celui de l'app (ThemeManager).
    if (window.ThemeManager && typeof window.ThemeManager.isLight === "function") {
      _theme = window.ThemeManager.isLight() ? "light" : "dark";
    }

    // window.requestPermission (tracking.js, idempotent) fait le flux complet : sur iOS
    // DeviceMotionEvent.requestPermission() puis pose des listeners orientation/mouvement, ailleurs pose
    // directe. Sans lui, un utilisateur qui n'a jamais lancé le tracker aurait une boussole à « — ».
    // ⚠️ DOIT être appelé synchronement depuis le geste utilisateur (activer() vient d'un clic : OK).
    if (typeof window.requestPermission === "function") {
      try { window.requestPermission(); }
      catch(e) { console.warn("[Emergency] requestPermission échoué :", e); }
    }

    _overlay = _buildOverlay();
    document.documentElement.appendChild(_overlay);
    _bindOverlay();

    // Minimap créée après 100 ms : le temps que le navigateur calcule le layout (sinon conteneur 0×0 et
    // fitBounds échoue en silence).
    setTimeout(_initMiniMap, 100);

    _tick();
    _pollTimer = setInterval(_tick, POLL_MS);

    // Écran allumé (Wake Lock si disponible).
    _acquireWakeLock();

    // À la rotation de l'appareil, la minimap Leaflet ne se redimensionne pas seule (tuiles décalées,
    // tracker hors champ) : orientationchange + resize → invalidateSize en cascade. Retiré à desactiver().
    _orientationListener = function() {
      if (!_miniMap) return;
      // 3 invalidations échelonnées : iOS Safari met 100 à 500 ms à finaliser son viewport après rotation.
      function _retry() {
        if (!_miniMap) return;
        _vueAutomatique(function () {
          _miniMap.invalidateSize({ animate: false });
          // Recadre aussi après rotation, SAUF si l'utilisateur explore la carte (le tick recentre de toute façon
          // quand le suivi est actif).
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
    // Retire les listeners orientation/resize (pas d'invalidateSize zombie après fermeture).
    if (_orientationListener) {
      window.removeEventListener("orientationchange", _orientationListener);
      window.removeEventListener("resize",            _orientationListener);
      _orientationListener = null;
    }
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
    // Minimap détruite = rotors disparus : la prochaine ouverture doit les reposer (sinon le garde
    // anti-scintillement s'armerait sur un affichage qui n'a pas eu lieu).
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
      _overlay.classList.add("kta-emergency-" + theme);
    }
  }

  // ── Minimap : Leaflet secondaire dans le bloc du cap ───────────────
  // Image du plan + marqueur tracker au centre, zoom serré, suivi via `setView` au tick. Pas de tile layer
  // séparé : source résolue depuis `window.PLAN_CONFIG` (cf _resolveMiniMapImageSource).
  // Zoom : `MINIMAP_ZOOM_OFFSET` au-dessus du fitBounds du plan entier ; 5 ≈ 20-50 m d'horizon. Plus haut
  // (maxZoom), Leaflet produit des artefacts de rendu sur image L.CRS.Simple ; plus bas, trop loin.
  const MINIMAP_ZOOM_OFFSET = 5;

  // Seuils de sécurité de l'image de fond V1 : au-delà, on prévient avant de charger.
  // Plus stricts que TUILING_NECESSAIRE_PIXELS (16M) de la carte principale : la minimap tourne EN PLUS
  // d'elle (2× la mémoire image), doit rester réactive sous pression et n'a pas besoin du détail pixel.
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

    // Plan V2 : on ne charge rien ici. `_poserImageOverlayMinimap` délègue à `_setupV2ViewportAwareTiles`,
    // qui charge au niveau NATIF du zoom courant les seules tuiles visibles (rendu sur zoomend/moveend).
    // 🩸 Charger le niveau le plus dézoomé pour économiser la mémoire rend l'image illisible : au zoom serré
    // de la minimap, les tuiles basse résolution sont étirées 8×. Mémoire bornée : ~4-9 tuiles affichées.
    if (pc.plan.tiledV2 === true && pc.tiling) {
      return {
        type: "v2-lazy",
        manifest: pc.tiling,
        imgW: imgW,
        imgH: imgH
      };
    }

    // Plan V1 ou repli : baseImage + taille du fichier.
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
    const modal = document.createElement("div");
    modal.id = "kta-emergency-bigimg-modal";
    modal.className = "kta-readme-modal-overlay";
    modal.style.zIndex = "100050";  // au-dessus de kta-emergency-overlay
    // Contenu court : on écrase le height: 88vh hérité de .kta-readme-modal-boite (sinon moitié vide sur PC).
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

  // État du chargeur V2 de la minimap, au scope module pour _destroyMiniMap (listener + overlays).
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

  // Chargeur de tuiles V2 de la minimap, limité au viewport :
  //   1. à chaque zoomend/moveend, niveau z = round(zoom) borné à [minNative, maxNative] ;
  //   2. seules les tuiles de ce niveau qui coupent map.getBounds() sont ajoutées (L.imageOverlay) ;
  //   3. les overlays de l'ancien niveau ou hors champ sont retirés.
  // Mémoire : ~4-9 tuiles 512×512 actives (~5-10 Mo décompressées), contre ~256 Mo pour tout z=0 d'un plan
  // 8192×8192.
  function _setupV2ViewportAwareTiles(map, manifest, imgW, imgH) {
    const tileSize  = manifest.tileSize || 512;
    const minNative = Number.isInteger(manifest.minNativeZoom) ? manifest.minNativeZoom : -3;
    const maxNative = Number.isInteger(manifest.maxNativeZoom) ? manifest.maxNativeZoom : 0;

    // Map<clé, L.imageOverlay> : recherche O(1), mise à jour incrémentale.
    const state = {
      overlays:     new Map(),   // key = "z<z>_x<col>_y<-k>" → L.imageOverlay
      ownUrls:      new Map(),   // path → blob URL PROPRE à la minimap (révoquée au destroy)
      enCours:      new Set(),   // paths en cours d'extraction depuis le ZIP
      ferme:        false,       // posé au destroy : une extraction tardive ne redessine rien
      listenerRef:  null,        // ref de _refresh pour map.off()
      currentLevel: null
    };

    // Extension d'après le manifest (webp/png = alpha, jpg = ancien format).
    const _tileExt = (typeof window.ktaTileExt === "function") ? window.ktaTileExt(manifest) : "jpg";
    // 🩸 Plan servi en HTTP (le déploiement normal) : `RUNTIME_ASSETS` est VIDE (il ne contient que les
    // assets d'un plan importé en ZIP). Sans le repli serveur de tiling.js, la minimap reste un rectangle
    // noir, sans même la classe `kta-em-mini-map-noimg`.
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
      // 🩸 Plan importé en ZIP : la carte principale révoque l'URL des niveaux qu'elle quitte et libère même le
      // fichier des ZIP lus à la demande (`file = null`, `_trimLevelsLRU`). Partager `asset.url` ferait sauter
      // des tuiles sans un mot. La minimap a donc ses PROPRES URL (révoquées à sa fermeture) et réextrait du
      // ZIP ce qui a été libéré, comme la Vue OSM, puis se redessine.
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

      // Changement de niveau : on retire d'abord TOUTES les tuiles du précédent (sinon chevauchement + RAM ×2).
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

      const mapBounds = map.getBounds();

      // Tuiles visibles à ce niveau, pour retirer celles hors champ.
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
            // Remplissage noir des tuiles de bord masqué.
            if (window.ktaRognerTuile) window.ktaRognerTuile(overlay, window.ktaRemplissageTuile(imgW, imgH, tileSize, scale, col, k));
            overlay.addTo(map);
            state.overlays.set(key, overlay);
          } catch(e) {
            console.warn("[Emergency] minimap V2 tile skip :", e);
          }
        }
      }

      state.overlays.forEach(function(o, key) {
        if (!visibleKeys.has(key)) {
          try { o.remove(); } catch(e) {}
          state.overlays.delete(key);
        }
      });
    }

    // Listener unique : Leaflet émet moveend après chaque setView/setZoom/pan.
    state.listenerRef = _refresh;
    map.on("moveend", state.listenerRef);
    map.on("zoomend", state.listenerRef);

    // Rendu initial décalé d'un tick : fitBounds doit d'abord calculer le zoom.
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

    // Fond avec garde-fou, 3 cas : plan V2 tuilé (toujours sûr) · V1 petite image (directe) · V1 volumineuse
    // (modale : « Continuer sans image » recommandé / « Charger quand même »), choix mémorisé par plan.
    const source = _resolveMiniMapImageSource(pc);
    console.log("[Emergency] minimap source : type=" + source.type +
                (source.type === "v2-tiles" ? " (" + source.tiles.length + " tuile(s) z=" + source.level + ")" :
                 source.type === "single"   ? " (url=" + source.url + ", " + source.dims.w + "×" + source.dims.h +
                                              (source.fileSize > 0 ? ", " + (source.fileSize/1024/1024).toFixed(1) + "Mo" : "") + ")" :
                 " (raison=" + (source.reason || "?") + ")"));

    if (source.type === "none") {
      console.warn("[Emergency] minimap : source image indispo → minimap sans fond");
    }

    const safety = _checkImageSafety(source);
    if (safety) {
      const remembered = _readBigImgChoice();
      if (remembered === "skip") {
        console.log("[Emergency] minimap : choix mémorisé = skip → pas d'image");
        _initMiniMapAvecSource(container, { type: "none", reason: "user skip (mémorisé)" }, imgW, imgH);
        return;
      }
      if (remembered === "load") {
        console.log("[Emergency] minimap : choix mémorisé = load → image chargée à risque");
        _initMiniMapAvecSource(container, source, imgW, imgH);
        return;
      }
      _afficherModaleImageVolumineuse(safety, function(choice) {
        const effectiveSource = (choice === "skip")
          ? { type: "none", reason: "user skip" }
          : source;
        _initMiniMapAvecSource(container, effectiveSource, imgW, imgH);
      });
      return;
    }

    _initMiniMapAvecSource(container, source, imgW, imgH);
  }

  // Suite de _initMiniMap, séparée pour être rappelée après la modale avec la source effective (vidée si
  // l'utilisateur a choisi « continuer sans image »).
  function _initMiniMapAvecSource(container, source, imgW, imgH) {
    try {
      // Déplacement et zoom au doigt / à la souris. `keyboard` coupé (Échap et flèches appartiennent à
      // l'écran) ; `trackResize` coupé aussi : le redimensionnement passe par `_orientationListener`, qui marque
      // SES changements de vue comme automatiques — celui de Leaflet passerait pour un geste et mettrait le
      // suivi en pause à chaque rotation de l'écran.
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
      // Fond selon la source : tuiles V2, baseImage V1, ou rien.
      _poserImageOverlayMinimap(source, bounds);
      // Sans image : fond sombre via CSS, tracés et zones restent contrastés.
      if (source.type === "none") {
        container.classList.add("kta-em-mini-map-noimg");
      }
      _vueAutomatique(function () { _miniMap.fitBounds(bounds); });

      // Ordre Z comme sur la carte principale : zones < structures < routes, tous filtrés par niveau si
      // multi-niveau.
      _addZonesToMiniMap(imgH);
      _addStructuresToMiniMap(imgH);
      _addRoadsToMiniMap(imgH);
      // Les points par-dessus tout (volet des marqueurs).
      _addPointsToMiniMap(imgH);

      // invalidateSize en cascade (50, 200, 500 ms) : si le conteneur valait 0×0 au L.map(), fitBounds donne un
      // zoom incohérent.
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

      // Marqueur tracker = boussole en L.divIcon composite : cercle jaune (cadran), triangle rouge au centre
      // (position), point rouge sur le cercle qui TOURNE vers le N (_updateTrackerNorthRotor à chaque tick).
      // iconAnchor centré : la pointe du triangle = la latlng du tracker.
      _miniTrackerMark = L.marker([0, 0], {
        icon: L.divIcon({
          className: "kta-em-mini-tracker-wrap",
          // Deux rotors séparés : .kta-em-mini-tracker-triangle-rotor (+cap, direction de marche, comme le cône de
          // la carte principale) et .kta-em-mini-tracker-rotor (−cap, point « Nord »).
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

  // Résolveur de style du mini.
  // Palette vive DÉLIBÉRÉE, documentée en tête de `styleResolver.js` (vert #27c97e au lieu de #00ff00,
  // inaccessible en aplat rouge au lieu de hachures — « le rouge plein dit déjà danger »).
  // 🩸 Garder sa palette n'autorise pas à ignorer l'utilisateur : sans ce résolveur, une couleur CHOISIE pour
  // un type built-in (Légende → Modifier) n'atteint pas la mini-carte, et un type CUSTOM (`cust-…`), absent
  // des tables locales, tombe sur le repli (zone en gris remblais, structure en bleu mur, front en jaune).
  // Donc : base locale, canon pour ce qu'elle ne connaît pas (à plat : pas de motif SVG ici), gabarit du
  // mini (traits fins, opacités poussées pour le fond désaturé), puis la couleur choisie via la MÊME
  // fonction que la carte.
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

  // Zones (session + embarquées) sur la minimap, opacité poussée pour le fond désaturé.
  function _addZonesToMiniMap(imgH) {
    if (!_miniMap || typeof L === "undefined") return;
    const session  = (typeof window.getZones === "function" ? window.getZones() : []) || [];
    const embedded = (typeof window.getAllEmbeddedZones === "function" ? window.getAllEmbeddedZones() : []) || [];
    const all = session.concat(embedded);
    if (all.length === 0) return;

    const filter = (typeof window.passeFiltreNiveau === "function")
                   ? window.passeFiltreNiveau
                   : function() { return true; };

    // Inaccessible en rouge plein semi-transparent : pas de hachures sur le canvas Leaflet.
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

  // Structures : piliers + murs en polygones, fronts en polylignes.
  function _addStructuresToMiniMap(imgH) {
    if (!_miniMap || typeof L === "undefined") return;
    const session = (typeof window.getStructures === "function" ? window.getStructures() : []) || [];
    // ⚠️ getAllEmbeddedStructures filtre points.length >= 3, donc exclut les fronts embarqués (polylignes) :
    // accepté, ils sont rares dans les calques de données ; ceux de la session passent.
    const embedded = (typeof window.getAllEmbeddedStructures === "function" ? window.getAllEmbeddedStructures() : []) || [];
    const all = session.concat(embedded);
    if (all.length === 0) return;

    const filter = (typeof window.passeFiltreNiveau === "function")
                   ? window.passeFiltreNiveau
                   : function() { return true; };
    const isPolyline = (typeof window.isStructurePolylineType === "function")
                       ? window.isStructurePolylineType
                       : function(t) { return t === "front-1" || t === "front-2"; };

    // Ordre Z : mur < pilier-2 < pilier-1 < front-2 < front-1. Sur Leaflet, ordre d'ajout = ordre Z : tri
    // AVANT itération.
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

  // Routes (session + embarquées) : couleurs de road.js, trait plus fin, opacité poussée.
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
    // Session + toutes les embarquées (visibles ET masquées).
    const session  = (typeof window.getRoads === "function" ? window.getRoads() : []) || [];
    const embedded = (typeof window.getAllEmbeddedRoads === "function" ? window.getAllEmbeddedRoads() : []) || [];
    const all = session.concat(embedded);
    if (all.length === 0) return;

    // Filtre de niveau (window.passeFiltreNiveau de road.js), sinon tout passe.
    const filter = (typeof window.passeFiltreNiveau === "function")
                   ? window.passeFiltreNiveau
                   : function() { return true; };

    const STYLES = {
      principal:  { color: "#27c97e", weight: 3, opacity: 0.95 },
      secondaire: { color: "#a78cf4", weight: 2.5, opacity: 0.95 },
      chemin:     { color: "#f4c542", weight: 2, opacity: 0.95 },
      jonction:   { color: "#ff4ecb", weight: 3, opacity: 1, dashArray: "6 4" },
      // Itinéraire : trait épais (6), PLEIN, cyan vif sur halo blanc (cf _renderItiHalo plus bas) — en pointillé
      // fin il disparaît sur le fond zoomé et désaturé.
      itinerary:  { color: "#00d4ff", weight: 6, opacity: 1 }
    };

    // Garde-fous anti-OOM sur plans denses (la minimap tourne en parallèle de la carte principale) :
    //   1. itinéraire décimé à MAX_POINTS_ITI ;
    //   2. toute polyligne > MAX_POINTS_PER_POLY décimée (vue d'ensemble, pas de précision au pixel) ;
    //   3. cap total MAX_TOTAL_POINTS : au-delà on tronque et on le journalise.
    const MAX_POINTS_PER_POLY = 100;   // au-delà : décimation
    const MAX_TOTAL_POINTS    = 5000;  // cap global sécurité
    const MAX_POINTS_ITI      = 600;   // itinéraire : décimé, jamais sauté
    let totalPointsRendered   = 0;
    let skippedItinerary      = 0;
    let decimatedCount        = 0;

    let added = 0;
    all.forEach(function(road) {
      if (!road || !Array.isArray(road.points) || road.points.length < 2) return;
      if (!filter(road)) return;
      if (totalPointsRendered >= MAX_TOTAL_POINTS) return;  // cap atteint

      let pts = road.points;
      if (road.type === "itinerary") {
        // 🩸 Un itinéraire long n'est jamais SAUTÉ (il manquerait sur l'écran qu'on regarde quand ça va mal) :
        // décimé à MAX_POINTS_ITI. 600 points ne pèsent rien ; 100 donneraient des segments de ~90 m sur 8 km,
        // faux à ce zoom.
        if (pts.length > MAX_POINTS_ITI) {
          const step = Math.ceil(pts.length / MAX_POINTS_ITI);
          const decim = [];
          for (let i = 0; i < pts.length; i += step) decim.push(pts[i]);
          // Garder le dernier point pour ne pas couper la ligne.
          if (decim[decim.length - 1] !== pts[pts.length - 1]) decim.push(pts[pts.length - 1]);
          pts = decim;
          decimatedCount++;
        }
      } else if (pts.length > MAX_POINTS_PER_POLY) {
        const step = Math.ceil(pts.length / MAX_POINTS_PER_POLY);
        const decim = [];
        for (let i = 0; i < pts.length; i += step) decim.push(pts[i]);
        if (decim[decim.length - 1] !== pts[pts.length - 1]) decim.push(pts[pts.length - 1]);
        pts = decim;
        decimatedCount++;
      }

      if (totalPointsRendered + pts.length > MAX_TOTAL_POINTS) {
        pts = pts.slice(0, Math.max(2, MAX_TOTAL_POINTS - totalPointsRendered));
      }

      const style = _styleMini("traces", road.type, STYLES[road.type],
                               { weight: 2.5, opacity: 0.95 })
                    || STYLES.chemin;
      const latlngs = pts.map(function(p) { return [imgH - p.y, p.x]; });
      try {
        // Halo : un trait blanc épais (weight + 4) d'abord, l'itinéraire cyan par-dessus — il tranche sur
        // n'importe quel fond.
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
        // convertCoord : [imageHeight - y, x].
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

    if (_miniV2State) {
      if (_miniV2State.listenerRef) {
        try {
          _miniMap.off("moveend", _miniV2State.listenerRef);
          _miniMap.off("zoomend", _miniV2State.listenerRef);
        } catch(e) {}
      }
      _miniV2State.overlays.forEach(function(o) { try { o.remove(); } catch(e) {} });
      _miniV2State.overlays.clear();
      // Les URL de tuiles sont PROPRES à la minimap (cf `_resolveTileUrl`) : on les révoque ici.
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

  // Tourne le rotor du point « Nord » du marqueur tracker. No-op si le marqueur n'est pas encore monté.
  // Rend TRUE seulement si le rotor existait et a été posé : ce booléen empêche le garde
  // anti-scintillement de s'armer sur un affichage qui n'a pas eu lieu.
  function _updateTrackerNorthRotor(angleDeg) {
    if (!_miniTrackerMark) return false;
    const iconEl = _miniTrackerMark.getElement && _miniTrackerMark.getElement();
    if (!iconEl) return false;  // marker pas encore ajouté à la map (pas de pos)
    const rotor = iconEl.querySelector(".kta-em-mini-tracker-rotor");
    if (!rotor) return false;
    rotor.style.transform = "rotate(" + angleDeg + "deg)";
    return true;
  }

  // Tourne le triangle dans la direction de marche (+cap), comme l'icône tracker de la carte principale.
  function _updateTrackerTriangleRotor(angleDeg) {
    if (!_miniTrackerMark) return false;
    const iconEl = _miniTrackerMark.getElement && _miniTrackerMark.getElement();
    if (!iconEl) return false;
    const rotor = iconEl.querySelector(".kta-em-mini-tracker-triangle-rotor");
    if (!rotor) return false;
    rotor.style.transform = "rotate(" + angleDeg + "deg)";
    return true;
  }

  // La minimap s'oriente, comme la carte principale.
  // On ne passe PAS par `mapBearing` : il est câblé sur `window.map` de bout en bout. Ici, tant que le suivi
  // est actif, la minimap se recentre sur la position à chaque tick : le centre de rotation coïncide
  // toujours avec l'utilisateur, une rotation du CONTENEUR suffit, sans toucher à la géométrie Leaflet.
  // 🩸 Une rotation CSS que Leaflet ignore fausse ses gestes : PENDANT L'EXPLORATION (suivi en pause) la
  // carte revient Nord en haut, Recentrer relance la rotation (décision produit). Le conteneur garde sa
  // taille agrandie (`.kta-em-mini-map-tournee`) : pas de redimensionnement Leaflet en plein geste.
  // Même interrupteur que la carte principale (`MapBearing.isEnabled`) : un seul réglage.
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

  // L'utilisateur a bougé la carte : plus de recentrage, Recentrer visible, Nord en haut. Idempotent (appelé à
  // chaque début de geste).
  function _pauseSuivi() {
    if (_suiviPause || !_overlay) return;
    _suiviPause = true;
    const btn = document.getElementById("kta-em-recentrer");
    if (btn) btn.hidden = false;
    const etaitTournee = _minimapTourne();
    _reappliquerOrientation();
    // Leaflet mémorise l'échelle apparente du conteneur au DÉBUT du glisser (`Draggable._parentScale`, boîte
    // englobante d'un conteneur tourné = plus grande) : sans recalcul, la carte suivrait le doigt moins vite
    // pendant ce premier geste.
    if (etaitTournee && _miniMap) {
      try {
        const d = _miniMap.dragging && _miniMap.dragging._draggable;
        if (d && d._parentScale && L.DomUtil.getScale) {
          d._parentScale = L.DomUtil.getScale(_miniMap.getContainer());
        }
      } catch(e) {}
    }
  }

  // Recentrer : retour sur la position, au zoom du suivi, et la rotation « plan orienté » reprend.
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
    // convertCoord : [imageHeight - y, x] (CRS Leaflet Simple).
    const latlng = [imgH - pos.y, pos.x];
    // Suivi en pause (l'utilisateur explore) : on ne touche PAS à la vue, seul le marqueur avance.
    if (!_suiviPause) {
      // Zoom = baseZ + offset, borné à maxZoom : au maxZoom (10) sur image L.CRS.Simple, Leaflet étire l'image
      // bien au-delà de sa résolution native.
      const maxZ  = _miniMap.getMaxZoom();
      const baseZ = _miniMap.getBoundsZoom([[0, 0], [imgH, imgW]], true) || 0;
      const targetZ = Math.min(maxZ, baseZ + MINIMAP_ZOOM_OFFSET);
      // Recentrer seulement si la vue RÉELLE a bougé : à 4 ticks/s, un setView systématique relancerait le
      // parcours de toute la grille de tuiles (~35 000 itérations pour rien). On compare à la vue réelle, pas à
      // une valeur mémorisée : si autre chose l'a bougée (recadrage après rotation), on recentre.
      const centre = _miniMap.getCenter();
      const dejaCentree = centre && _miniMap.getZoom() === targetZ &&
        Math.abs(centre.lat - latlng[0]) < 0.5 && Math.abs(centre.lng - latlng[1]) < 0.5;
      if (!dejaCentree) {
        _vueAutomatique(function () { _miniMap.setView(latlng, targetZ, { animate: false }); });
      }
    }

    if (_miniTrackerMark) {
      if (!_miniMap.hasLayer(_miniTrackerMark)) {
        _miniTrackerMark.addTo(_miniMap);
      }
      _miniTrackerMark.setLatLng(latlng);
    }
    // Pas d'invalidateSize au tick (coût) : l'init en cascade et orientationchange suffisent.
  }

  // ── Wake Lock : l'écran ne s'éteint pas pendant l'affichage XL ─────
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

  // ── Export global ───────────────────────────────────────────────────
  window.EmergencyMode = {
    activer:    activer,
    desactiver: desactiver,
    isActif:    isActif,
    toggle:     toggle,
    setTheme:   setTheme
  };

  console.log("[Emergency] Module chargé");
})();
