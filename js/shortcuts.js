/*!
 * MyKTAMap — Raccourcis clavier globaux (U4)
 * (c) 2026 Flavien VIDAL (alias KARMA)
 * Site : https://myktamap.fr
 *
 * Licence : CC BY-NC-SA 4.0
 */

// =========================
// SHORTCUTS.JS — Raccourcis clavier globaux (depuis v1.21.0)
// =========================
// Pack de 8 raccourcis pour les outils principaux. Toggle (re-pression =
// ferme l'outil). Anti-vol focus : skip si focus dans un input/textarea/
// contenteditable. Skip si modale ouverte (cherche .kta-readme-modal-overlay
// visible OU .kta-readme-modal-boite). Skip si modificateur Ctrl/Cmd/Alt
// (= laisse passer pour shortcuts browser/OS).
//
// Mapping :
//   E → ✏️ Édition (groupe `edition`)
//   M → 📐 Mesure (groupe `mesure`)
//   Z → ⬛ Zones (groupe `zones`)
//   S → 🏛️ Structures (groupe `structures`)
//   T → 🧭 Tracker (groupe `tracker`)
//   P → 🛣️ Tracés (groupe `traces`)
//   L → 🗺️ Légende (window.afficherLegende)
//   B → 🧭 Boussole widget (window.CompassWidget.toggle)
//   R → 🔍 Recherche unifiée (window.ouvrirRecherche, alternative à Ctrl+K)
//   ? → ⌨️ Cheatsheet des raccourcis (window.ShortcutsCheatsheet.toggle)
//
// Activation : auto au boot. Pas d'API publique (silencieux).
//
// API : window.KtaShortcuts = {
//   listMapping(),   // retourne le mapping pour cheatsheet
//   trigger(action)  // déclenche manuellement (utile pour testing)
// };
// =========================

(function() {
  "use strict";

  // ─────────  MAPPING ─────────
  // Chaque entrée : key (clavier) → { action: id-action-ou-fn, label: pour cheatsheet }
  const MAPPING = {
    e: { action: "group:edition",   label: "✏️ Édition" },
    m: { action: "group:mesure",    label: "📐 Mesure" },
    z: { action: "group:zones",     label: "⬛ Zones" },
    s: { action: "group:structures", label: "🏛️ Structures" },
    t: { action: "group:tracker",   label: "🧭 Tracker" },
    p: { action: "group:traces",    label: "🛣️ Tracés" },
    l: { action: "fn:legende",      label: "🗺️ Légende" },
    b: { action: "fn:boussole",     label: "🧭 Boussole" },
    r: { action: "fn:recherche",    label: "🔍 Recherche (alt Ctrl+K)" }
  };

  // ─────────  HELPERS ─────────

  // Anti-vol focus : skip si focus dans un input/textarea/contenteditable.
  // Pattern identique à historyManager.js (cf §47.6 CLAUDE.md).
  function _isInputFocused() {
    const ae = document.activeElement;
    if (!ae) return false;
    const tag = (ae.tagName || "").toUpperCase();
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
    if (ae.getAttribute && ae.getAttribute("contenteditable") === "true") return true;
    return false;
  }

  // Skip si une modale lourde est ouverte. Détection via overlays visibles
  // qu'on ne veut pas perturber par un raccourci global qui ferme un mode.
  // Liste : kta-readme-modal-overlay (la plupart des modales projet),
  // kta-load-overlay (chargement plein écran), kta-pin-gate-overlay
  // (gate PIN), #kta-unlock-overlay (UnlockGate communautaire), splash.
  function _isModaleBloquante() {
    // Splash en cours
    const splash = document.getElementById("splashOverlay");
    if (splash && splash.style.display !== "none" && !splash.classList.contains("fading")) return true;
    // UnlockGate / PIN gate
    if (document.getElementById("kta-unlock-overlay")) return true;
    if (document.querySelector(".kta-pin-gate-overlay")) return true;
    // modal plein écran Tracker (classe distincte de readme-modal)
    // → sinon E/M/Z/etc. se déclenchaient « derrière » le modal Tracker ouvert.
    if (document.querySelector(".kta-tracker-modal-overlay")) return true;
    // Modales principales
    const overlays = document.querySelectorAll(".kta-readme-modal-overlay");
    for (let i = 0; i < overlays.length; i++) {
      const ov = overlays[i];
      if (ov.offsetParent !== null) {  // visible
        return true;
      }
    }
    // Loading overlay
    const load = document.querySelector(".kta-load-overlay");
    if (load && load.style.display !== "none") return true;
    return false;
  }

  // Déclenche une action depuis un id "group:<id>" ou "fn:<name>".
  function _triggerAction(actionId) {
    if (typeof actionId !== "string") return false;

    // group:<id> → click sur btnPrincipal du groupe sidebar
    if (actionId.indexOf("group:") === 0) {
      const groupeId = actionId.slice("group:".length);
      const groupes = window._groupes;
      if (!groupes || !groupes[groupeId]) {
        console.warn("[Shortcuts] Groupe introuvable :", groupeId);
        return false;
      }
      const g = groupes[groupeId];
      if (!g.btnPrincipal || typeof g.btnPrincipal.click !== "function") {
        console.warn("[Shortcuts] btnPrincipal indisponible pour :", groupeId);
        return false;
      }
      // Le click simulé re-trigger toute la logique L.DomEvent du groupe.
      g.btnPrincipal.click();
      return true;
    }

    // fn:<name> → appel d'une fonction globale spécifique
    if (actionId.indexOf("fn:") === 0) {
      const fnName = actionId.slice("fn:".length);
      switch (fnName) {
        case "legende":
          if (typeof window.afficherLegende === "function") {
            window.afficherLegende();
            return true;
          }
          break;
        case "boussole":
          if (window.CompassWidget && typeof window.CompassWidget.toggle === "function") {
            window.CompassWidget.toggle();
            return true;
          }
          break;
        case "recherche":
          if (typeof window.ouvrirRecherche === "function") {
            window.ouvrirRecherche();
            return true;
          }
          break;
      }
      console.warn("[Shortcuts] Fonction inconnue ou indisponible :", fnName);
      return false;
    }

    return false;
  }

  // ─────────  KEYDOWN LISTENER GLOBAL ─────────

  document.addEventListener("keydown", function(e) {
    // Pas de modificateurs (sinon laisse passer Ctrl+E browser, Cmd+B macOS, etc.)
    if (e.ctrlKey || e.metaKey || e.altKey) return;

    // "?" → cheatsheet des raccourcis (toggle). Géré AVANT le
    // guard Shift car "?" nécessite Shift sur la plupart des claviers (AZERTY
    // inclus). `e.key` contient déjà le caractère résolu ("?"), layout-agnostique.
    if (e.key === "?") {
      if (_isInputFocused()) return;
      if (window.ShortcutsCheatsheet && typeof window.ShortcutsCheatsheet.toggle === "function") {
        e.preventDefault();
        e.stopPropagation();
        window.ShortcutsCheatsheet.toggle();
      }
      return;
    }

    // Shift OK car certaines touches ?  En pratique on veut juste E/M/Z/etc.
    // sans Shift. Si Shift maintenu → laisse passer (les majuscules de mots).
    if (e.shiftKey) return;

    // Key matching (insensible à la casse)
    const key = (e.key || "").toLowerCase();
    const mapping = MAPPING[key];
    if (!mapping) return;

    // Anti-vol focus (input/textarea/select/contenteditable)
    if (_isInputFocused()) return;

    // Skip si modale ouverte qui mérite focus
    if (_isModaleBloquante()) return;

    // (U1) : skip si mode présentation actif (sinon raccourci
    // accidentel ouvre un panneau pendant la démo). F seule reste active
    // via presentationMode.js (toggle entrée/sortie).
    if (window.PresentationMode && window.PresentationMode.isActive && window.PresentationMode.isActive()) {
      return;
    }

    // Trigger
    e.preventDefault();
    e.stopPropagation();
    _triggerAction(mapping.action);
  });

  // ─────────  API PUBLIQUE ─────────

  // Retourne le mapping (pour cheatsheet UI / aide intégrée)
  function listMapping() {
    const out = [];
    Object.keys(MAPPING).forEach(function(key) {
      out.push({
        key:    key.toUpperCase(),
        label:  MAPPING[key].label,
        action: MAPPING[key].action
      });
    });
    return out;
  }

  // Déclenche manuellement (utilitaire pour testing / cheatsheet click handler)
  function trigger(action) {
    return _triggerAction(action);
  }

  window.KtaShortcuts = {
    listMapping: listMapping,
    trigger:     trigger
  };

  console.log("[Shortcuts] Module chargé (9 raccourcis : E M Z S T P L B R + ? cheatsheet)");
})();
