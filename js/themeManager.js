/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * https://myktamap.fr — Licence CC BY-NC-SA 4.0
 * Usage commercial interdit sans accord ecrit prealable. Voir LICENSE.
 */

// themeManager.js — thème clair/sombre GLOBAL (localStorage, pas par plan ; décision produit).
// Clair = classe `kta-theme-light` sur <html> ET <body>, le reste est en CSS. Fond clair #f0e8d8
// (celui du mode urgence), accent #f4c542 conservé.
// Restent sombres (décision produit) : le splash animé et le visualiseur photo plein écran.
// Bascules : Paramètres de la carte et Configuration du HOME (synchronisées par onChange). Le mode
// urgence a sa bascule locale, initialisée depuis ThemeManager (emergencyMode.js > activer).
// Expose : window.ThemeManager { init (idempotent), getCurrent → "dark" | "light", setTheme,
//   setThemeAndReload, toggleTheme, onChange(cb), isLight }
// Doc : docs/architecture/ui.md

(function() {
  "use strict";

  const LS_KEY  = "myktamap_theme_v1";
  const VALID_THEMES = ["dark", "light"];

  let _current = "dark";
  const _listeners = [];

  // ── Persistance ──────────────────────────────
  function _readPersisted() {
    try {
      const v = localStorage.getItem(LS_KEY);
      return VALID_THEMES.indexOf(v) >= 0 ? v : "dark";
    } catch(e) { return "dark"; }
  }

  function _writePersisted(theme) {
    try { localStorage.setItem(LS_KEY, theme); } catch(e) {}
  }

  // ── Application au DOM ──────────────────────────────
  function _applyToDom(theme) {
    // 🩸 Classe aussi sur <html> : beaucoup de modales sont ajoutées à documentElement, sœurs de
    // <body> — `body.kta-theme-light .modal` ne les atteint pas, `.kta-theme-light .modal` si.
    const html = document.documentElement;
    const body = document.body;
    if (html) {
      html.classList.toggle("kta-theme-light", theme === "light");
      html.classList.toggle("kta-theme-dark",  theme === "dark");
    }
    if (body) {
      body.classList.toggle("kta-theme-light", theme === "light");
      body.classList.toggle("kta-theme-dark",  theme === "dark");
    }
    // theme-color : barre d'état mobile.
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

  // ── API ──────────────────────────────
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

  // 🩸 Changement de thème = persistance puis rechargement : la bascule à chaud laisse des restes
  // (bandeau, modales construites avant). Thème déjà actif → rien.
  function setThemeAndReload(theme) {
    if (VALID_THEMES.indexOf(theme) < 0) {
      console.warn("[ThemeManager] setThemeAndReload : valeur invalide", theme);
      return false;
    }
    if (theme === _current) return false;
    _writePersisted(theme);
    console.log("[ThemeManager] persisté →", theme, "— reload…");
    location.reload();
    return true;
  }

  function onChange(cb) {
    if (typeof cb !== "function") return;
    _listeners.push(cb);
  }

  // ── Export global ──────────────────────────────
  window.ThemeManager = {
    init:              init,
    getCurrent:        getCurrent,
    setTheme:          setTheme,
    setThemeAndReload: setThemeAndReload,
    toggleTheme:       toggleTheme,
    onChange:          onChange,
    isLight:           isLight
  };

  // Auto-init (au DOMContentLoaded si body manque) ; main.js > lancerApplication le rappelle.
  if (document.body) {
    init();
  } else {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  }

  console.log("[ThemeManager] Module chargé");
})();
