/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * Site : https://myktamap.fr
 * Licence : CC BY-NC-SA 4.0 — Usage commercial interdit sans accord ecrit prealable.
 * Voir LICENSE a la racine du projet.
 */

// =========================
// COMPASS WIDGET — boussole flottante (rose des vents)
// =========================
// Affiche une rose des vents (icon/compass.png, rose dediee avec N/S/E/W
// marques clairement + fleche rouge sur le Nord — depuis v157) flottante
// au-dessus de la carte. Le loader/splash reste sur icon/mkm-full.png qui
// est l'identite visuelle de la marque.
// La rose contre-tourne en temps reel selon
// le heading capte par tracking.js (window.getCurrentHeading) → le repere "N"
// pointe toujours vers le vrai Nord, peu importe la pose du telephone.
//
// DEUX VUES
//   1. Widget flottant (bottom-right) : compact, rose ~100px, cardinal + angle
//      en texte sous la rose. Clic ✕ pour fermer, clic sur la rose pour ouvrir
//      le modal plein.
//   2. Modal plein (pattern .kta-readme-modal-overlay) : rose ~240px, cardinal
//      en grand + angle, hint explicatif. Fermable ✕ / backdrop / Échap. Le
//      widget flottant reste visible derriere (mais cache visuellement sous
//      l'overlay du modal).
//
// USAGE
//   - Bouton 🧭 dans le groupe Tracker de la sidebar → show() / hide().
//   - Clic sur le widget (hors ✕) → ouvre le modal plein.
//   - Clic ✕ du widget → ferme tout (widget + modal s'il est ouvert).
//
// MATH DE ROTATION
//   - L'utilisateur tient le tel a plat, top edge vers la direction de marche.
//   - direction = heading compass (0 = Nord, 90 = Est, sens CW).
//   - On applique rotate(-direction) sur l'image de la rose :
//       direction = 0   → rose normale (N en haut)
//       direction = 90  → rose tournee -90° (N pointe a gauche → vrai Nord
//                          est a gauche de l'utilisateur qui marche vers l'Est)
//       direction = 180 → rose tournee 180° (N pointe en bas)
//       direction = 270 → rose tournee +90° (N pointe a droite)
//
// PERF
//   - Boucle requestAnimationFrame uniquement quand le widget est visible.
//   - Throttle ≥0.5° avant de re-appliquer le transform.
//   - Le rAF met a jour widget ET modal en un seul tick (les deux roses
//     partagent la classe .kta-compass-rotating-rose, query unifiee).
// =========================

(function() {
  "use strict";

  let _widgetEl    = null;
  let _rafId       = null;
  let _lastApplied = -999;

  const t = function(k, p) { return window.I18n ? window.I18n.t(k, p) : k; };

  // Cardinaux localises (FR : N/NE/E/SE/S/SO/O/NO · EN : SW/W/NW). Resolus au
  // rendu via I18n (cle compass.cardinals = liste "N,NE,E,SE,S,SO,O,NO").
  function _cardinal(h) {
    let idx = Math.round(h / 45) % 8;
    if (idx < 0) idx += 8;
    const raw = t("compass.cardinals");
    const dirs = (typeof raw === "string" && raw.indexOf(",") !== -1)
      ? raw.split(",")
      : ["N", "NE", "E", "SE", "S", "SO", "O", "NO"];
    return dirs[idx] || dirs[0];
  }

  // =========================
  // WIDGET FLOTTANT (petit)
  // =========================
  function _ensureWidget() {
    if (_widgetEl) return;
    _widgetEl = document.createElement("div");
    _widgetEl.id = "kta-compass-widget";
    _widgetEl.className = "kta-compass-widget";
    _widgetEl.innerHTML =
      '<button class="kta-compass-close" type="button" title="' + t("compass.widget.closeTitle") + '" aria-label="' + t("compass.widget.closeAria") + '">&times;</button>' +
      '<div class="kta-compass-rose-wrap" title="' + t("compass.widget.enlargeTitle") + '">' +
        '<img src="icon/compass.svg" class="kta-compass-rose kta-compass-rotating-rose" alt="' + t("compass.roseAlt") + '" draggable="false">' +
      '</div>' +
      '<div class="kta-compass-info">' +
        '<span class="kta-compass-heading kta-compass-text-display">N 0°</span>' +
      '</div>';
    document.body.appendChild(_widgetEl);

    // ✕ : ferme tout (widget + modal s'il est ouvert)
    _widgetEl.querySelector(".kta-compass-close").addEventListener("click", function(e) {
      e.stopPropagation();
      _closeFullModal();
      hide();
      // Decoche visuellement la sous-action 🧭 dans la sidebar
      if (typeof window._onCompassHiddenExternally === "function") {
        try { window._onCompassHiddenExternally(); } catch(e2) {}
      }
    });

    // Clic sur la rose / zone widget (hors ✕) → ouvre modal plein
    _widgetEl.addEventListener("click", function(e) {
      if (e.target.closest(".kta-compass-close")) return;
      _openFullModal();
    });
  }

  // =========================
  // MODAL PLEIN (pattern .kta-readme-modal-overlay)
  // =========================
  function _openFullModal() {
    // Guard double-ouverture
    if (document.getElementById("kta-compass-full-overlay")) return;

    const overlay = document.createElement("div");
    overlay.id = "kta-compass-full-overlay";
    overlay.className = "kta-readme-modal-overlay";
    overlay.innerHTML =
      '<div class="kta-readme-modal-boite kta-compass-full-boite">' +
        '<div class="kta-readme-modal-header">' +
          '<span class="kta-readme-modal-titre">' + t("compass.modal.title") + '</span>' +
          '<button class="kta-panneau-close" id="kta-compass-full-close" type="button" aria-label="' + t("compass.modal.closeAria") + '">&times;</button>' +
        '</div>' +
        '<div class="kta-readme-modal-corps kta-compass-full-corps">' +
          '<div class="kta-compass-full-rose-wrap">' +
            '<img src="icon/compass.svg" class="kta-compass-rose-big kta-compass-rotating-rose" alt="' + t("compass.roseAlt") + '" draggable="false">' +
          '</div>' +
          '<div class="kta-compass-full-info">' +
            '<div class="kta-compass-full-cardinal kta-compass-cardinal-display">N</div>' +
            '<div class="kta-compass-full-angle    kta-compass-angle-display">0°</div>' +
          '</div>' +
          '<p class="kta-compass-full-hint">' +
            t("compass.modal.hint") +
          '</p>' +
          '<ul class="kta-compass-full-list">' +
            '<li>' + t("compass.modal.dirN") + '</li>' +
            '<li>' + t("compass.modal.dirE") + '</li>' +
            '<li>' + t("compass.modal.dirS") + '</li>' +
            '<li>' + t("compass.modal.dirW") + '</li>' +
          '</ul>' +
          '<p class="kta-compass-full-note">' +
            t("compass.modal.warning") +
          '</p>' +
        '</div>' +
      '</div>';
    document.documentElement.appendChild(overlay);

    function _onKey(e) {
      if (e.key === "Escape") _closeFullModal();
    }
    overlay.__ktaOnKey = _onKey;
    document.addEventListener("keydown", _onKey);

    overlay.addEventListener("click", function(e) {
      if (e.target === overlay) _closeFullModal();
    });
    document.getElementById("kta-compass-full-close")
      .addEventListener("click", _closeFullModal);

    // Force application du heading courant sur les nouveaux elements du modal
    _lastApplied = -999;
  }

  function _closeFullModal() {
    const overlay = document.getElementById("kta-compass-full-overlay");
    if (!overlay) return;
    if (overlay.__ktaOnKey) {
      document.removeEventListener("keydown", overlay.__ktaOnKey);
    }
    overlay.remove();
  }

  // =========================
  // BOUCLE RAF — met a jour widget ET modal
  // =========================
  function _tick() {
    // Si plus rien a animer (widget cache), on stoppe le rAF.
    if (!_widgetEl || _widgetEl.style.display === "none") {
      _rafId = null;
      return;
    }
    const h = (typeof window.getCurrentHeading === "function")
      ? (window.getCurrentHeading() || 0)
      : 0;

    if (Math.abs(h - _lastApplied) >= 0.5 || _lastApplied === -999) {
      _lastApplied = h;
      const rotateStyle = "rotate(" + (-h) + "deg)";
      const cardinalTxt = _cardinal(h);
      const angleRound  = Math.round(h);

      // Toutes les roses qui doivent tourner (widget + modal s'il est ouvert)
      const roses = document.querySelectorAll(".kta-compass-rotating-rose");
      for (let i = 0; i < roses.length; i++) {
        roses[i].style.transform = rotateStyle;
      }

      // Texte combine "N 12°" du widget flottant
      const textDisplays = document.querySelectorAll(".kta-compass-text-display");
      for (let i = 0; i < textDisplays.length; i++) {
        textDisplays[i].textContent = cardinalTxt + " " + angleRound + "°";
      }

      // Cardinal seul (modal plein)
      const cardinalDisplays = document.querySelectorAll(".kta-compass-cardinal-display");
      for (let i = 0; i < cardinalDisplays.length; i++) {
        cardinalDisplays[i].textContent = cardinalTxt;
      }

      // Angle seul (modal plein)
      const angleDisplays = document.querySelectorAll(".kta-compass-angle-display");
      for (let i = 0; i < angleDisplays.length; i++) {
        angleDisplays[i].textContent = angleRound + "°";
      }
    }
    _rafId = requestAnimationFrame(_tick);
  }

  // =========================
  // API PUBLIQUE
  // =========================
  function show() {
    _ensureWidget();
    _widgetEl.style.display = "";
    _lastApplied = -999;
    // Idempotent cote tracking.js (cf _orientationListenerAttached). Le clic
    // initial qui declenche show() est un geste utilisateur valide pour iOS
    // → requestPermission peut afficher la popup d'autorisation.
    if (typeof window.requestPermission === "function") {
      try { window.requestPermission(); } catch(e) {}
    }
    if (!_rafId) _tick();
  }

  function hide() {
    _closeFullModal();  // si modal ouvert, on le ferme aussi
    if (_widgetEl) _widgetEl.style.display = "none";
    if (_rafId) {
      cancelAnimationFrame(_rafId);
      _rafId = null;
    }
  }

  function toggle() {
    if (isVisible()) hide(); else show();
  }

  function isVisible() {
    return !!_widgetEl && _widgetEl.style.display !== "none";
  }

  window.CompassWidget = {
    show:      show,
    hide:      hide,
    toggle:    toggle,
    isVisible: isVisible,
    // Expose le clic "voir en grand" pour usage externe eventuel
    openFull:  _openFullModal,
    closeFull: _closeFullModal
  };
})();
