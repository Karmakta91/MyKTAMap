/*!
 * MyKTAMap — Cheatsheet des raccourcis clavier (v1.51.0)
 * (c) 2026 Flavien VIDAL (alias KARMA)
 * Site : https://myktamap.fr
 *
 * Licence : CC BY-NC-SA 4.0
 */

// =========================
// SHORTCUTSCHEATSHEET.JS — Modale d'aide des raccourcis (depuis v1.51.0)
// =========================
// Modale auto-générée : la liste des raccourcis "outils" vient de
// window.KtaShortcuts.listMapping() (source de vérité = shortcuts.js, plus
// aucune liste à maintenir à la main), + un bloc fixe des combos globales
// (Ctrl+Z/Y, Ctrl+K, F, ?, Échap). Ouverte par la touche "?" (cf shortcuts.js)
// ou un lien dans le hub d'Aide.
//
// API : window.ShortcutsCheatsheet = { ouvrir, fermer, toggle, isOpen };
// 100 % local, aucune surface réseau.
// =========================

(function() {
  "use strict";

  const OVERLAY_ID = "kta-cheatsheet-modal";
  let _escHandler = null;

  // action ("group:edition" / "fn:legende") → clé i18n du libellé localisé
  // (emoji + texte, cohérent fr/en/es). Fallback sur le label brut de
  // listMapping() si la clé manque.
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

  // 🐛 v1.68.1 : garde `v !== key` mort depuis l'humanisation H1 (t() ne
  // retourne plus jamais la clé brute) → has() teste la présence réelle.
  function _t(key, fallback) {
    if (window.I18n && typeof window.I18n.has === "function" && window.I18n.has(key)) {
      return window.I18n.t(key);
    }
    return fallback;
  }

  function _esc(s) {
    return String(s).replace(/[&<>"]/g, function(c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

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

  // Raccourcis "outils" depuis listMapping() (auto).
  function _toolRows() {
    const list = (window.KtaShortcuts && typeof window.KtaShortcuts.listMapping === "function")
                   ? window.KtaShortcuts.listMapping() : [];
    return list.map(function(it) {
      const label = _t(ACTION_LABEL[it.action] || "", it.label) || it.label;
      return _row(it.key, label);
    }).join("");
  }

  // Combos globales (hors MAPPING — vivent dans d'autres modules).
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
            // 🧩 Replay optionnel (01/10/2026) : pas de mode d'emploi d'un outil masqué.
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
