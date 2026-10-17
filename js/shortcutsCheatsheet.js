/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * https://myktamap.fr — Licence CC BY-NC-SA 4.0
 * Usage commercial interdit sans accord ecrit prealable. Voir LICENSE.
 */

// =========================
// shortcutsCheatsheet.js — modale d'aide des raccourcis, générée depuis window.KtaShortcuts.listMapping()
// (source de vérité : shortcuts.js) + un bloc fixe des combos globales (Ctrl+Z/Y, Ctrl+K, F, ?, Échap).
// Ouverte par « ? » ou depuis le hub d'Aide.
// Expose : window.ShortcutsCheatsheet — ouvrir, fermer, toggle, isOpen

(function() {
  "use strict";

  const OVERLAY_ID = "kta-cheatsheet-modal";
  let _escHandler = null;

  // Action ("group:edition" / "fn:legende") → clé i18n du libellé ; repli sur le label de listMapping().
  const ACTION_LABEL = {
    "group:edition":    "cheatsheet.tool.edition",
    "group:mesure":     "cheatsheet.tool.mesure",
    "group:zones":      "cheatsheet.tool.zones",
    "group:structures": "cheatsheet.tool.structures",
    "group:tracker":    "cheatsheet.tool.tracker",
    "group:traces":     "cheatsheet.tool.traces",
    "fn:legende":       "cheatsheet.tool.legende",
    "fn:boussole":      "cheatsheet.tool.boussole",
    "fn:recherche":     "cheatsheet.tool.recherche"
  };

  // has() : t() ne rend jamais la clé brute
  function _t(key, fallback) {
    if (window.I18n && typeof window.I18n.has === "function" && window.I18n.has(key)) {
      return window.I18n.t(key);
    }
    return fallback;
  }

  function _esc(s) { return window.ktaEsc(s); }

  function isOpen() {
    return !!document.getElementById(OVERLAY_ID);
  }

  function fermer() {
    if (_escHandler) {
      document.removeEventListener("keydown", _escHandler, true);
      _escHandler = null;
    }
    const m = document.getElementById(OVERLAY_ID);
    if (m) m.remove();
  }

  function toggle() {
    if (isOpen()) fermer(); else ouvrir();
  }

  // Une ligne : touches (split sur "+") + libellé.
  function _row(keys, label) {
    const kbds = String(keys).split("+").map(function(k) {
      return '<kbd class="kta-kbd">' + _esc(k.trim()) + "</kbd>";
    }).join('<span class="kta-kbd-plus">+</span>');
    return '<div class="kta-cheat-row">' +
             '<span class="kta-cheat-keys">' + kbds + "</span>" +
             '<span class="kta-cheat-label">' + _esc(label) + "</span>" +
           "</div>";
  }

  function _toolRows() {
    const list = (window.KtaShortcuts && typeof window.KtaShortcuts.listMapping === "function")
                   ? window.KtaShortcuts.listMapping() : [];
    return list.map(function(it) {
      const label = _t(ACTION_LABEL[it.action] || "", it.label) || it.label;
      return _row(it.key, label);
    }).join("");
  }

  // Combos globales (hors MAPPING, gérées par d'autres modules)
  function _comboRows() {
    const rows = [
      ["Ctrl+Z", _t("cheatsheet.undo", "Annuler")],
      ["Ctrl+Y", _t("cheatsheet.redo", "Rétablir")],
      ["Ctrl+K", _t("cheatsheet.search", "Recherche")],
      ["F",      _t("cheatsheet.presentation", "Mode présentation")],
      ["?",      _t("cheatsheet.thisHelp", "Cette aide")],
      ["Échap",  _t("cheatsheet.close", "Fermer la fenêtre")]
    ];
    return rows.map(function(r) { return _row(r[0], r[1]); }).join("");
  }

  function ouvrir() {
    if (isOpen()) return;

    const modal = document.createElement("div");
    modal.id = OVERLAY_ID;
    modal.className = "kta-readme-modal-overlay kta-cheatsheet-overlay";
    modal.innerHTML =
      '<div class="kta-readme-modal-boite kta-cheatsheet-boite">' +
        '<div class="kta-readme-modal-header">' +
          '<span class="kta-readme-modal-titre">' + _t("cheatsheet.titre", "⌨️ Raccourcis clavier") + "</span>" +
          '<button class="kta-panneau-close" id="kta-cheatsheet-close" type="button" aria-label="' +
            _esc(_t("ui.btn.close", "Fermer")) + '">✕</button>' +
        "</div>" +
        '<div class="kta-readme-modal-corps kta-cheatsheet-corps">' +
          '<div class="kta-cheat-sectitre">' + _t("cheatsheet.toolsTitre", "Outils (1 touche)") + "</div>" +
          '<div class="kta-cheat-grille">' + _toolRows() + "</div>" +
          '<div class="kta-cheat-sectitre">' + _t("cheatsheet.globalTitre", "Actions globales") + "</div>" +
          '<div class="kta-cheat-grille">' + _comboRows() + "</div>" +
          '<p class="kta-cheat-note">' +
            // Replay facultatif : pas de mode d'emploi d'un outil masqué.
            (window.APP_CONFIG && window.APP_CONFIG.replayEnabled === true
              ? _t("cheatsheet.replayHint", "Dans le Replay : Espace = lecture, ← → = défilement, Échap = fermer.") + " "
              : "") +
            _t("cheatsheet.note", "Inactif quand tu tapes dans un champ texte.") +
          "</p>" +
        "</div>" +
      "</div>";

    document.documentElement.appendChild(modal);

    const close = document.getElementById("kta-cheatsheet-close");
    if (close) close.addEventListener("click", fermer);
    modal.addEventListener("click", function(e) { if (e.target === modal) fermer(); });

    _escHandler = function(ev) {
      if (ev.key === "Escape") { ev.stopPropagation(); fermer(); }
    };
    document.addEventListener("keydown", _escHandler, true);
  }

  window.ShortcutsCheatsheet = {
    ouvrir: ouvrir,
    fermer: fermer,
    toggle: toggle,
    isOpen: isOpen
  };

  console.log("[ShortcutsCheatsheet] Module chargé (touche ?)");
})();
