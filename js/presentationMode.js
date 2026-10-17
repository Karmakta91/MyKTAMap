/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * https://myktamap.fr — Licence CC BY-NC-SA 4.0
 * Usage commercial interdit sans accord ecrit prealable. Voir LICENSE.
 */

// =========================
// presentationMode.js — mode présentation : masque header, sidebars et footer ; garde le zoom Leaflet et la
// boussole (kta-compass-widget). Touche `F` (bascule), Échap pour sortir, bouton ✕ sur mobile.
// Coupe aussi les raccourcis d'outils de shortcuts.js (qui lit window.PresentationMode.isActive()) : pas de
// panneau ouvert par accident pendant une démo. Toast d'aide à l'activation, rien à la sortie.
// Expose : window.PresentationMode — activate(), deactivate(), toggle(), isActive()

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

  // Bouton flottant ✕ (F et Échap inaccessibles sans clavier physique), safe-area iOS PWA.
  function _createExitButton() {
    if (document.getElementById("kta-presentation-exit-btn")) return;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.id = "kta-presentation-exit-btn";
    btn.className = "kta-presentation-exit-btn";
    // aria-label = même clé i18n que .title
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
    _createExitButton();
    // invalidateSize : header + footer cachés, sinon la carte garde ses anciennes dimensions jusqu'au prochain geste.
    if (window.map && typeof window.map.invalidateSize === "function") {
      try { window.map.invalidateSize({ animate: false }); } catch(e) {}
    }
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

  // ── Clavier ──────────────

  document.addEventListener("keydown", function(e) {
    // Sans modificateur (F11 reste à l'OS, Ctrl+F à la recherche du navigateur)
    if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
    // Pas de vol de focus, rien sous une modale
    if (_isInputFocused()) return;
    if (_isModaleBloquante()) return;

    const key = (e.key || "").toLowerCase();
    if (key === "f") {
      e.preventDefault();
      e.stopPropagation();
      toggle();
      return;
    }
    // Échap : sortie seulement
    if ((key === "escape" || key === "esc") && _active) {
      e.preventDefault();
      e.stopPropagation();
      deactivate();
      return;
    }
  });

  // ── API publique ──────────────

  window.PresentationMode = {
    activate:   activate,
    deactivate: deactivate,
    toggle:     toggle,
    isActive:   isActive
  };

  console.log("[PresentationMode] Module chargé (touche F pour toggle)");
})();
