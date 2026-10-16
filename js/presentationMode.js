/*!
 * MyKTAMap — Mode présentation (U1)
 * (c) 2026 Flavien VIDAL (alias KARMA)
 * Site : https://myktamap.fr
 *
 * Licence : CC BY-NC-SA 4.0
 */

// =========================
// PRESENTATIONMODE.JS — Mode présentation (depuis v1.21.0)
// =========================
// Cache header + sidebars + footer pour libérer toute la surface visuelle
// pour la carte. Garde : zoom Leaflet (.leaflet-control-zoom) + widget
// boussole (kta-compass-widget) — utiles pour navigation pendant démo.
//
// Activation : touche `F` (toggle). Aussi via API window.PresentationMode.
// Désactivation : F à nouveau OU Échap.
//
// Anti-vol focus + skip modale (cohérent avec shortcuts.js U4).
//
// Au activate : toast OOMGuard "Mode présentation activé — F ou Échap pour
// sortir" (3s, info). Au deactivate : silencieux.
//
// Le mode présentation désactive aussi les raccourcis U4 (E/M/Z/S/T/L/B/R)
// pour éviter qu'un raccourci accidentel ouvre un panneau pendant la démo.
// Le flag est lu par shortcuts.js via window.PresentationMode.isActive().
//
// API : window.PresentationMode = {
//   activate(),
//   deactivate(),
//   toggle(),
//   isActive()
// };
// =========================

(function() {
  "use strict";

  const BODY_CLASS = "kta-presentation-mode";

  let _active = false;

  function _isInputFocused() {
    const ae = document.activeElement;
    if (!ae) return false;
    const tag = (ae.tagName || "").toUpperCase();
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
    if (ae.getAttribute && ae.getAttribute("contenteditable") === "true") return true;
    return false;
  }

  function _isModaleBloquante() {
    const splash = document.getElementById("splashOverlay");
    if (splash && splash.style.display !== "none" && !splash.classList.contains("fading")) return true;
    if (document.getElementById("kta-unlock-overlay")) return true;
    if (document.querySelector(".kta-pin-gate-overlay")) return true;
    const overlays = document.querySelectorAll(".kta-readme-modal-overlay");
    for (let i = 0; i < overlays.length; i++) {
      if (overlays[i].offsetParent !== null) return true;
    }
    const load = document.querySelector(".kta-load-overlay");
    if (load && load.style.display !== "none") return true;
    return false;
  }

  // bouton flottant ✕ pour sortir sur mobile (touche F
  // et Échap inaccessibles sans clavier physique). Petit, semi-transparent
  // en haut-droite. Position safe-area-aware iOS PWA.
  function _createExitButton() {
    if (document.getElementById("kta-presentation-exit-btn")) return;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.id = "kta-presentation-exit-btn";
    btn.className = "kta-presentation-exit-btn";
    // 🌍 i18n : aria-label = même clé que .title (recâblage, pas de doublon).
    btn.setAttribute("aria-label", window.I18n.t("presentation.exitBtn"));
    btn.title = window.I18n.t("presentation.exitBtn");
    btn.innerHTML = "✕";
    btn.addEventListener("click", function(e) {
      e.preventDefault();
      e.stopPropagation();
      deactivate();
    });
    document.body.appendChild(btn);
  }

  function _removeExitButton() {
    const btn = document.getElementById("kta-presentation-exit-btn");
    if (btn) btn.remove();
  }

  function activate() {
    if (_active) return;
    _active = true;
    document.body.classList.add(BODY_CLASS);
    // Bouton flottant ✕ pour sortir sur mobile (touche F inaccessible)
    _createExitButton();
    // Force Leaflet à recalculer la taille de la carte (header + footer cachés
    // → plus d'espace dispo). Sans ça, certains rendus peuvent rester sur
    // les anciennes dimensions jusqu'à un drag/zoom user.
    if (window.map && typeof window.map.invalidateSize === "function") {
      try { window.map.invalidateSize({ animate: false }); } catch(e) {}
    }
    // Toast d'aide (3s) pour rappeler comment sortir
    if (window.OOMGuard && typeof window.OOMGuard.showToast === "function") {
      window.OOMGuard.showToast(
        window.I18n.t("presentation.toast.activated"),
        "info"
      );
    }
  }

  function deactivate() {
    if (!_active) return;
    _active = false;
    document.body.classList.remove(BODY_CLASS);
    _removeExitButton();
    if (window.map && typeof window.map.invalidateSize === "function") {
      try { window.map.invalidateSize({ animate: false }); } catch(e) {}
    }
  }

  function toggle() {
    if (_active) deactivate(); else activate();
  }

  function isActive() {
    return _active === true;
  }

  // ─────────  KEYDOWN LISTENER GLOBAL ─────────

  document.addEventListener("keydown", function(e) {
    // Pas de modificateurs (F11 reste accessible OS, Ctrl+F = browser find)
    if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
    // Anti-vol focus + skip modale
    if (_isInputFocused()) return;
    if (_isModaleBloquante()) return;

    const key = (e.key || "").toLowerCase();
    // Touche F : toggle (entrée OU sortie)
    if (key === "f") {
      e.preventDefault();
      e.stopPropagation();
      toggle();
      return;
    }
    // Touche Échap : sortie uniquement (si actif)
    if ((key === "escape" || key === "esc") && _active) {
      e.preventDefault();
      e.stopPropagation();
      deactivate();
      return;
    }
  });

  // ─────────  API PUBLIQUE ─────────

  window.PresentationMode = {
    activate:   activate,
    deactivate: deactivate,
    toggle:     toggle,
    isActive:   isActive
  };

  console.log("[PresentationMode] Module chargé (touche F pour toggle)");
})();
