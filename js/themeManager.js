/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * Site : https://myktamap.fr
 * Licence : CC BY-NC-SA 4.0 — Usage commercial interdit sans accord ecrit prealable.
 * Voir LICENSE a la racine du projet.
 */

// =========================
// THEME MANAGER — v1.13.0 (étendu en v1.13.0-fix2)
// =========================
// Toggle thème clair/sombre GLOBAL (KARMA "active le mode clair partout").
//
// - Persistance globale en localStorage (KARMA choix B:a), pas par plan.
//   Le user qui choisit clair l'a partout, toujours.
// - Background base mode clair = #f0e8d8 (beige cataphile, KARMA choix D:b)
//   déjà utilisé en mode urgence light → cohérence.
// - Accent jaune #f4c542 conservé (KARMA choix E:a) → cohérence charte.
//
// Activation = ajoute `body.kta-theme-light`. Le reste est en CSS pur via
// `body.kta-theme-light .selector { ... }` overrides.
//
// API publique :
//   window.ThemeManager = {
//     init()        → lit localStorage et applique au boot (idempotent)
//     getCurrent()  → "dark" | "light"
//     setTheme(t)   → applique + persiste + notify listeners
//     toggleTheme() → flip dark <-> light
//     onChange(cb)  → s'abonner aux changements (cb reçoit "dark"|"light")
//     isLight()     → bool helper
//   };
//
// Scope :
//   ✅ Couvert (mode clair s'applique) :
//      - Loader plein écran (#planLoaderOverlay)
//      - Modale Configuration home (#loaderConfigModal)
//      - Modale Documentation (kta-readme-modal-* pattern)
//      - Modale Audit réseau (loaderNetDocModal + loaderNetLogModal)
//      - Modale Aide (kta-aide-* pattern)
//      - Modale Plan switcher home
//      - Mode carte entier (sidebar, header, footer, container Leaflet)
//      - Toutes les modales ouvertes en mode carte (Session, Recherche,
//        Itinéraire, Mesure, Édition, Export, Réglages, Légende, M-LVL,
//        Replay tracker, etc.)
//      - Popups Leaflet + tooltips + zoom controls
//      - Toasts (OOMGuard.showToast)
//
//   ❌ Volontairement non couvert (reste dark) :
//      - Splash KARMA animé (cinématique de lancement, contrastes dark
//        nécessaires pour l'animation fade)
//      - Viewer photos plein écran (cohérent pour lire les photos)
//
// Toggle UI à 2 endroits (mêmes prefs, sync via onChange) :
//   - Sidebar gauche → ⚙️ Paramètres → ☀️/🌙 Thème (mode carte)
//   - Modale Configuration home → checkbox "☀️ Activer le thème CLAIR"
//
// Le mode urgence garde son propre toggle 🔆/🌑 LOCAL mais on synchronise
// son état initial avec ThemeManager au boot de l'overlay (cf
// emergencyMode.js > activer()).
// =========================

(function() {
  "use strict";

  const LS_KEY  = "myktamap_theme_v1";
  const VALID_THEMES = ["dark", "light"];

  let _current = "dark";
  const _listeners = [];

  // ============================================================
  // STATE I/O
  // ============================================================
  function _readPersisted() {
    try {
      const v = localStorage.getItem(LS_KEY);
      return VALID_THEMES.indexOf(v) >= 0 ? v : "dark";
    } catch(e) { return "dark"; }
  }

  function _writePersisted(theme) {
    try { localStorage.setItem(LS_KEY, theme); } catch(e) {}
  }

  // ============================================================
  // APPLICATION DOM
  // ============================================================
  function _applyToDom(theme) {
    const body = document.body;
    if (!body) return;
    body.classList.toggle("kta-theme-light", theme === "light");
    body.classList.toggle("kta-theme-dark",  theme === "dark");
    // Meta theme-color (statusbar mobile) — change la couleur du chrome
    // browser sur iOS/Android pour matcher le thème.
    let meta = document.querySelector("meta[name='theme-color']");
    if (!meta) {
      meta = document.createElement("meta");
      meta.setAttribute("name", "theme-color");
      document.head.appendChild(meta);
    }
    meta.setAttribute("content", theme === "light" ? "#f0e8d8" : "#111827");
  }

  function _notify(theme) {
    _listeners.forEach(function(fn) {
      try { fn(theme); } catch(e) { console.warn("[ThemeManager] listener throw :", e); }
    });
  }

  // ============================================================
  // API PUBLIQUE
  // ============================================================
  function init() {
    _current = _readPersisted();
    _applyToDom(_current);
    console.log("[ThemeManager] init —", _current);
  }

  function getCurrent() {
    return _current;
  }

  function isLight() {
    return _current === "light";
  }

  function setTheme(theme) {
    if (VALID_THEMES.indexOf(theme) < 0) {
      console.warn("[ThemeManager] setTheme : valeur invalide", theme);
      return false;
    }
    if (theme === _current) return false;
    _current = theme;
    _applyToDom(theme);
    _writePersisted(theme);
    _notify(theme);
    console.log("[ThemeManager] switch →", theme);
    return true;
  }

  function toggleTheme() {
    return setTheme(_current === "dark" ? "light" : "dark");
  }

  function onChange(cb) {
    if (typeof cb !== "function") return;
    _listeners.push(cb);
  }

  // ============================================================
  // EXPORT GLOBAL
  // ============================================================
  window.ThemeManager = {
    init:        init,
    getCurrent:  getCurrent,
    setTheme:    setTheme,
    toggleTheme: toggleTheme,
    onChange:    onChange,
    isLight:     isLight
  };

  // Auto-init au chargement (le DOM body est dispo car ce script est chargé
  // dans <head> tard ou en fin de body). Si appelé trop tôt, init() devra
  // être ré-appelé après DOMContentLoaded — mais main.js le fait déjà
  // explicitement au début de lancerApplication() pour garantir l'ordre.
  if (document.body) {
    init();
  } else {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  }

  console.log("[ThemeManager] Module chargé");
})();
