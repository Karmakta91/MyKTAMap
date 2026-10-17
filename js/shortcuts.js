/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * https://myktamap.fr — Licence CC BY-NC-SA 4.0
 * Usage commercial interdit sans accord ecrit prealable. Voir LICENSE.
 */

// shortcuts.js — raccourcis clavier globaux, actifs dès le chargement : E M Z S T P = groupes de
// la sidebar (re-presser ferme l'outil), L légende, B boussole, R recherche, ? aide-mémoire.
// ⚠️ Ignorés : avec Ctrl/Cmd/Alt (raccourcis navigateur), focus dans un champ, modale / gate /
//   splash / chargement visibles, mode présentation.
// Expose : window.KtaShortcuts { listMapping() (aide-mémoire), trigger(action) }

(function() {
  "use strict";

  // ── Touches → { action: "group:<id>" | "fn:<nom>", label (aide-mémoire) } ──
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

  // ── Outils ───────────────────────────────────────────
  // Focus dans un champ : la touche lui appartient (comme historyManager.js).
  function _isInputFocused() {
    const ae = document.activeElement;
    if (!ae) return false;
    const tag = (ae.tagName || "").toUpperCase();
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
    if (ae.getAttribute && ae.getAttribute("contenteditable") === "true") return true;
    return false;
  }

  // Modale, gate, splash ou chargement visibles : pas de raccourci global.
  function _isModaleBloquante() {
    const splash = document.getElementById("splashOverlay");
    if (splash && splash.style.display !== "none" && !splash.classList.contains("fading")) return true;
    if (document.getElementById("kta-unlock-overlay")) return true;
    if (document.querySelector(".kta-pin-gate-overlay")) return true;
    // 🩸 La modale Tracker a sa propre classe : sans ce test, les touches agissent derrière elle.
    if (document.querySelector(".kta-tracker-modal-overlay")) return true;
    const overlays = document.querySelectorAll(".kta-readme-modal-overlay");
    for (let i = 0; i < overlays.length; i++) {
      const ov = overlays[i];
      if (ov.offsetParent !== null) {
        return true;
      }
    }
    const load = document.querySelector(".kta-load-overlay");
    if (load && load.style.display !== "none") return true;
    return false;
  }

  function _triggerAction(actionId) {
    if (typeof actionId !== "string") return false;

    // group:<id> : clic sur btnPrincipal du groupe (toute la logique du groupe s'exécute).
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
      g.btnPrincipal.click();
      return true;
    }

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

  // ── Écoute clavier globale ────────────────────────────
  document.addEventListener("keydown", function(e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;

    // 🩸 "?" est traité AVANT le test Shift : il exige Shift sur la plupart des claviers ;
    // e.key donne le caractère résolu, quelle que soit la disposition.
    if (e.key === "?") {
      if (_isInputFocused()) return;
      if (window.ShortcutsCheatsheet && typeof window.ShortcutsCheatsheet.toggle === "function") {
        e.preventDefault();
        e.stopPropagation();
        window.ShortcutsCheatsheet.toggle();
      }
      return;
    }

    // Shift maintenu : on laisse passer (majuscules).
    if (e.shiftKey) return;

    const key = (e.key || "").toLowerCase();
    const mapping = MAPPING[key];
    if (!mapping) return;

    if (_isInputFocused()) return;

    if (_isModaleBloquante()) return;

    // Mode présentation : seule F (presentationMode.js) reste active.
    if (window.PresentationMode && window.PresentationMode.isActive && window.PresentationMode.isActive()) {
      return;
    }

    e.preventDefault();
    e.stopPropagation();
    _triggerAction(mapping.action);
  });

  // ── API ──────────────────────────────────────────────
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

  function trigger(action) {
    return _triggerAction(action);
  }

  window.KtaShortcuts = {
    listMapping: listMapping,
    trigger:     trigger
  };

  console.log("[Shortcuts] Module chargé (9 raccourcis : E M Z S T P L B R + ? cheatsheet)");
})();
