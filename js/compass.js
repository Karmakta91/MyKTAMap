/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * Site : https://myktamap.fr
 * Licence : CC BY-NC-SA 4.0 — Usage commercial interdit sans accord ecrit prealable.
 * Voir LICENSE a la racine du projet.
 */

// =========================
// COMPASS.JS — Boussole flottante (rose des vents)
// =========================
// Rose (icon/compass.png) au-dessus de la carte, contre-tournée en temps réel selon le cap de tracking.js
// (window.getCurrentHeading) : le « N » pointe toujours le vrai Nord.
// Deux vues : widget flottant (bas-droite, rose ~100 px, cardinal + angle ; ✕ ferme tout, clic sur la rose ouvre
// le plein écran) et modale plein écran (.kta-readme-modal-overlay, rose ~240 px ; ✕ / fond / Échap).
// Bouton 🧭 du groupe Tracker → show() / hide().
// Rotation : téléphone à plat, bord haut vers la marche, cap 0 = Nord, sens horaire ; on applique
// rotate(-cap) à la rose (cap 90 → N à gauche, 180 → en bas, 270 → à droite).
// Perf : boucle rAF seulement si le widget est visible, seuil ≥ 0,5° ; widget et modale mis à jour dans le même
// tick (classe partagée .kta-compass-rotating-rose).

(function() {
  "use strict";

  let _widgetEl    = null;
  let _rafId       = null;
  let _lastApplied = -999;

  const t = function(k, p) { return window.I18n ? window.I18n.t(k, p) : k; };

  // Cardinaux localisés, résolus au rendu (clé compass.cardinals = "N,NE,E,SE,S,SO,O,NO").
  function _cardinal(h) {
    let idx = Math.round(h / 45) % 8;
    if (idx < 0) idx += 8;
    const raw = t("compass.cardinals");
    const dirs = (typeof raw === "string" && raw.indexOf(",") !== -1)
      ? raw.split(",")
      : ["N", "NE", "E", "SE", "S", "SO", "O", "NO"];
    return dirs[idx] || dirs[0];
  }

  // ── Widget flottant ──────────
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

    // ✕ : ferme tout (widget + modale).
    _widgetEl.querySelector(".kta-compass-close").addEventListener("click", function(e) {
      e.stopPropagation();
      _closeFullModal();
      hide();
    // Décoche la sous-action 🧭 de la sidebar.
      if (typeof window._onCompassHiddenExternally === "function") {
        try { window._onCompassHiddenExternally(); } catch(e2) {}
      }
    });

    // Clic sur le widget (hors ✕) → modale plein écran.
    _widgetEl.addEventListener("click", function(e) {
      if (e.target.closest(".kta-compass-close")) return;
      _openFullModal();
    });
  }

  // ── Modale plein écran ──────────
  function _openFullModal() {
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

    // Force l'application du cap courant aux nouveaux éléments.
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

  // ── Boucle rAF (widget ET modale) ──────────
  function _tick() {
    // Widget caché : plus rien à animer, le rAF s'arrête.
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

      const roses = document.querySelectorAll(".kta-compass-rotating-rose");
      for (let i = 0; i < roses.length; i++) {
        roses[i].style.transform = rotateStyle;
      }

      // « N 12° » du widget.
      const textDisplays = document.querySelectorAll(".kta-compass-text-display");
      for (let i = 0; i < textDisplays.length; i++) {
        textDisplays[i].textContent = cardinalTxt + " " + angleRound + "°";
      }

      // Cardinal seul (modale).
      const cardinalDisplays = document.querySelectorAll(".kta-compass-cardinal-display");
      for (let i = 0; i < cardinalDisplays.length; i++) {
        cardinalDisplays[i].textContent = cardinalTxt;
      }

      // Angle seul (modale).
      const angleDisplays = document.querySelectorAll(".kta-compass-angle-display");
      for (let i = 0; i < angleDisplays.length; i++) {
        angleDisplays[i].textContent = angleRound + "°";
      }
    }
    _rafId = requestAnimationFrame(_tick);
  }

  // ── API publique ──────────
  function show() {
    _ensureWidget();
    _widgetEl.style.display = "";
    _lastApplied = -999;
    // Idempotent côté tracking.js (cf. _orientationListenerAttached). Le clic qui déclenche show() est un geste
    // utilisateur valide pour iOS : requestPermission peut afficher sa demande.
    if (typeof window.requestPermission === "function") {
      try {
        // 🩸 Un refus ne doit pas être avalé : la rose afficherait « N 0° » comme si on regardait le Nord.
        const p = window.requestPermission();
        if (p && typeof p.then === "function") {
          p.then(function(ok) {
            if (ok === false && window.OOMGuard && typeof window.OOMGuard.showToast === "function") {
              window.OOMGuard.showToast(window.I18n.t("compass.toast.capteursRefuses"), "warn", { important: true });   // sans capteurs, rien ne marche
            }
          });
        }
      } catch(e) {}
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
    openFull:  _openFullModal,
    closeFull: _closeFullModal
  };
})();
