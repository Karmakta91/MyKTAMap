/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * Site : https://myktamap.fr
 * Licence : CC BY-NC-SA 4.0 — Usage commercial interdit sans accord ecrit prealable.
 * Voir LICENSE a la racine du projet.
 */

// =========================
// 📜 HISTORY MANAGER — Undo / Redo global (v1.10.4 / cible v1.11.0)
// =========================
// Système d'historique RAM-only des mutations sur les 4 catégories
// d'annotations dessinables :
//   ✏️ Editor points  (window.getEditorPoints / setEditorPoints)
//   🛣️ Tracés         (window.getRoads / resetRoads + setRoads)
//   ⬛ Zones          (window.getZones / resetZones + setZones)
//   🏛️ Structures     (window.getStructures / resetStructures + setStructures)
//
// Choix de design (KARMA "1:b · 2:a · 3:b · 4:c · 5:a · 6:a · 7:a · 8:c ·
// 9:a · 10:b · 11:a+b") :
//   - Périmètre : les 4 catégories ci-dessus. PHOTOS EXCLUES (suppression
//     IDB irréversible — restore demanderait un cache RAM des blobs qui
//     explose vite).
//   - Granularité : action atomique (1 clic = 1 entrée).
//   - Profondeur : 50 entrées FIFO (cap RAM raisonnable).
//   - Activation : Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z + 2 boutons sidebar.
//   - Persistance : RAM only (perte au reload — cohérent session active).
//   - UX : toast discret via OOMGuard.showToast.
//   - Approche : SNAPSHOT HYBRIDE — on prend une photo des arrays mutés
//     uniquement à chaque action, via _captureState() qui retourne
//     {editorPoints, roads, zones, structures} en deep clone.
//   - Boutons grisés si pile vide.
//   - Reset historique au plan switch + au reload (RAM-only).
//
// API publique : window.HistoryManager = {
//   record(label, beforeState?) - push une entrée (beforeState optionnel,
//                                  sinon on récupère via _captureState)
//   captureState()              - retourne le snapshot complet pour
//                                  appeler record(label, snap) plus tard
//   recordAction(label, fn)     - helper : capture before → fn() → record
//   undo() / redo()             - rétablit l'état précédent / suivant
//   canUndo() / canRedo()       - booléens (pour griser les boutons)
//   reset()                     - vide les piles (appelé au plan switch)
//   onChange(cb)                - écoute des changements (UI sync)
// };
// =========================

(function() {
  "use strict";

  // 🔢 Limite stricte (KARMA 3:b) — 50 actions FIFO
  const MAX_HISTORY = 50;

  // 🌍 i18n — appelé au runtime (undo/redo), toujours après I18n.init().
  // Fallback inline FR si I18n absent (jamais de crash, jamais de clé brute).
  function _t(key) {
    if (window.I18n && typeof window.I18n.t === "function") return window.I18n.t(key);
    return key === "history.undone" ? "↩ Annulé : "
         : key === "history.redone" ? "↪ Refait : "
         : key;
  }

  let undoStack = []; // [{label, snapshot, ts}]
  let redoStack = [];

  // Listeners pour la sync UI (boutons + raccourcis)
  const _listeners = [];

  // ============================================================
  // CAPTURE / APPLICATION D'ÉTAT
  // ============================================================
  // Clone profond pour les arrays d'objets simples. Utilise
  // structuredClone si dispo (Chrome 98+, Firefox 94+, Safari 15.4+),
  // sinon fallback JSON.parse(JSON.stringify(...)).
  function _deepCloneArray(arr) {
    if (!Array.isArray(arr)) return [];
    if (typeof structuredClone === "function") {
      try { return structuredClone(arr); } catch(e) { /* fallthrough */ }
    }
    try { return JSON.parse(JSON.stringify(arr)); } catch(e) { return []; }
  }

  // 🆕 v1.26.4 (P0-1 RAM) — Capture CIBLÉE par catégorie.
  // `category` ∈ "editorPoints" | "roads" | "zones" | "structures" → ne clone
  // QUE cette catégorie (économie RAM ~4× sur les snapshots d'édition mono-
  // catégorie, qui sont les plus fréquents : chaque point/sommet dessiné =
  // 1 snapshot). null/undefined → clone TOUT (cas multi-catégories : import
  // GPX, reset global, note popup cross-type).
  //
  // currentRoadIndex est toujours inclus (juste un number, négligeable) mais
  // n'est restauré au undo QUE si le snapshot contient aussi `roads` (cf
  // _applyState) — sinon un undo "zones" ne doit pas toucher au tracé en cours.
  function _captureState(category) {
    const snap = {
      currentRoadIndex: (window.getCurrentRoadIndex ? window.getCurrentRoadIndex() : -1)
    };
    const all = !category;
    if (all || category === "editorPoints") {
      snap.editorPoints = _deepCloneArray(window.getEditorPoints ? window.getEditorPoints() : []);
    }
    if (all || category === "roads") {
      snap.roads = _deepCloneArray(window.getRoads ? window.getRoads() : []);
    }
    if (all || category === "zones") {
      snap.zones = _deepCloneArray(window.getZones ? window.getZones() : []);
    }
    if (all || category === "structures") {
      snap.structures = _deepCloneArray(window.getStructures ? window.getStructures() : []);
    }
    return snap;
  }

  // Applique un snapshot complet via les setters publics existants.
  // Pour roads/zones/structures, on passe par reset() + set() pour
  // remplacer atomiquement le contenu (le `set` seul ajoute au lieu de
  // remplacer dans certaines implémentations).
  // 🆕 v1.26.4 (P0-1 RAM) — Applique SEULEMENT les catégories PRÉSENTES dans
  // le snapshot. Crucial : on conditionne resetRoads/resetZones/resetStructures
  // à la présence de la catégorie. Avant, resetRoads() était appelé
  // INCONDITIONNELLEMENT → un snapshot ciblé "zones" aurait vidé les roads
  // (bug de perte de données). Une catégorie absente du snapshot = inchangée
  // par cette action = on ne la touche pas.
  function _applyState(s) {
    try {
      if (window.setEditorPoints && Array.isArray(s.editorPoints)) {
        window.setEditorPoints(s.editorPoints);
      }
      // 🐛 v1.37.2 — Préservation de window.modeRoad à travers undo/redo.
      // KARMA bug "Ctrl+Z casse toujours la suite d'un tracé" :
      // resetRoads() wipe window.modeRoad → null (cf road.js l.1046). Sans
      // restauration, le mousedown handler check `if (!window.modeRoad) return`
      // → le clic suivant après undo est avorté en silence → l'user voit son
      // tracé restauré mais ne peut pas le continuer ("lien suivant cassé"
      // perçu). v1.26.3-hotfix3 avait restauré currentRoad via index mais
      // oublié modeRoad. Fix : on snapshot modeRoad AVANT le reset, on le
      // restaure après seulement si on avait un tracé en cours à restaurer
      // (sinon ressortir du mode est cohérent avec l'annulation d'une création).
      const _savedModeRoad = (Array.isArray(s.roads) && typeof s.currentRoadIndex === "number" && s.currentRoadIndex >= 0)
        ? window.modeRoad
        : null;
      if (Array.isArray(s.roads)) {
        if (window.resetRoads) window.resetRoads();
        if (window.setRoads) window.setRoads(s.roads);
      }
      if (Array.isArray(s.zones)) {
        if (window.resetZones) window.resetZones();
        if (window.setZones) window.setZones(s.zones);
      }
      if (Array.isArray(s.structures)) {
        if (window.resetStructures) window.resetStructures();
        if (window.setStructures) window.setStructures(s.structures);
      }
      // 🆕 v1.26.3-hotfix3 — Restaure le tracé en cours APRÈS setRoads
      // (qui a remis currentRoad = null). Uniquement si le snapshot contient
      // `roads` : un undo "zones"/"structures" ne doit PAS toucher au tracé
      // en cours de dessin.
      if (Array.isArray(s.roads) && window.setCurrentRoadByIndex
          && typeof s.currentRoadIndex === "number") {
        window.setCurrentRoadByIndex(s.currentRoadIndex);
      }
      // 🐛 v1.37.2 — Restaure le mode road pour permettre la continuation
      // du tracé après undo. Skip si on annulait la création même d'une
      // nouvelle road (currentRoadIndex == -1 ou pas de roads dans snap) :
      // dans ce cas garder modeRoad = null est cohérent (sortir du mode).
      if (_savedModeRoad) {
        window.modeRoad = _savedModeRoad;
      }
    } catch(e) {
      console.warn("[HistoryManager] _applyState échoué :", e);
    }
  }

  // ============================================================
  // RECORD / UNDO / REDO
  // ============================================================
  // record(label, beforeState?, category?) — push une entrée d'historique.
  //   beforeState : snapshot AVANT la mutation. Si omis, on capture
  //                 l'état COURANT (utile si on appelle record() après
  //                 la mutation et que l'appelant ne veut pas garder
  //                 le snapshot avant manuellement).
  //   category    : 🆕 v1.26.4 — "editorPoints"|"roads"|"zones"|"structures"
  //                 pour un snapshot ciblé (économie RAM). null/absent = tout.
  //                 ⚠️ DOIT correspondre à la catégorie réellement mutée par
  //                 l'action, ET au category passé à captureState() pour le
  //                 beforeState. Sinon l'undo ne restaurera pas la bonne data.
  function record(label, beforeState, category) {
    const snap = beforeState || _captureState(category);
    undoStack.push({ label: String(label || "Action"), category: category || null, snapshot: snap, ts: Date.now() });
    if (undoStack.length > MAX_HISTORY) {
      undoStack.shift(); // FIFO sur dépassement
    }
    // Toute nouvelle action efface le redo (= nouvelle branche d'historique)
    if (redoStack.length > 0) redoStack = [];
    _notify();
  }

  // recordAction(label, mutationFn, category?) — capture avant + run + record
  function recordAction(label, mutationFn, category) {
    const before = _captureState(category);
    let result;
    try {
      result = mutationFn();
    } catch(e) {
      // En cas d'erreur de mutation, on NE record PAS (sinon undo
      // pointerait sur un état artificiel).
      console.warn("[HistoryManager] mutation échouée, skip record :", e);
      throw e;
    }
    record(label, before, category);
    return result;
  }

  function undo() {
    if (undoStack.length === 0) return false;
    const entry = undoStack.pop();
    // Capture ciblée sur la MÊME catégorie que l'entrée (cohérence pour redo).
    const currentState = _captureState(entry.category);
    _applyState(entry.snapshot);
    // Push l'état COURANT (= post-mutation pré-undo) sur redo, avec le
    // même label + catégorie : le user verra "↩ Annulé : <label>" et pourra
    // redo pour rétablir l'état.
    redoStack.push({ label: entry.label, category: entry.category, snapshot: currentState, ts: Date.now() });
    if (redoStack.length > MAX_HISTORY) redoStack.shift();
    _showToast(_t("history.undone") + entry.label);
    _notify();
    _saveSession();
    return true;
  }

  function redo() {
    if (redoStack.length === 0) return false;
    const entry = redoStack.pop();
    const currentState = _captureState(entry.category);
    _applyState(entry.snapshot);
    undoStack.push({ label: entry.label, category: entry.category, snapshot: currentState, ts: Date.now() });
    if (undoStack.length > MAX_HISTORY) undoStack.shift();
    _showToast(_t("history.redone") + entry.label);
    _notify();
    _saveSession();
    return true;
  }

  // ============================================================
  // ÉTAT / NOTIFY
  // ============================================================
  function canUndo() { return undoStack.length > 0; }
  function canRedo() { return redoStack.length > 0; }

  function reset() {
    undoStack = [];
    redoStack = [];
    _notify();
  }

  function onChange(cb) {
    if (typeof cb !== "function") return function() {};
    _listeners.push(cb);
    return function() {
      const i = _listeners.indexOf(cb);
      if (i >= 0) _listeners.splice(i, 1);
    };
  }

  function _notify() {
    const state = { canUndo: canUndo(), canRedo: canRedo(), undoSize: undoStack.length, redoSize: redoStack.length };
    _listeners.forEach(function(cb) {
      try { cb(state); } catch(e) { console.warn("[HistoryManager] listener throw :", e); }
    });
  }

  // ============================================================
  // UX FEEDBACK + SESSION PERSIST
  // ============================================================
  function _showToast(msg) {
    if (window.OOMGuard && window.OOMGuard.showToast) {
      try { window.OOMGuard.showToast(msg, "info"); return; } catch(e) {}
    }
    console.log("[HistoryManager] " + msg);
  }

  // Force un save de session après chaque undo/redo (KARMA 7:a) pour ne
  // pas perdre l'état si l'user reload juste après.
  function _saveSession() {
    if (window.SessionPersist && typeof window.SessionPersist.save === "function") {
      try { window.SessionPersist.save({ force: true }); } catch(e) { /* silent */ }
    }
  }

  // ============================================================
  // RACCOURCIS CLAVIER (KARMA 4:c)
  // ============================================================
  // Ctrl+Z          → undo
  // Ctrl+Y          → redo
  // Ctrl+Shift+Z    → redo (convention Mac/Linux)
  // Cmd+* sur Mac (e.metaKey aussi accepté)
  //
  // Anti-vol focus : ignore si l'user tape dans un input/textarea ou
  // un élément contenteditable (l'undo natif de l'input doit fonctionner).
  document.addEventListener("keydown", function(e) {
    const isMod = e.ctrlKey || e.metaKey;
    if (!isMod) return;
    const key = (e.key || "").toLowerCase();
    if (key !== "z" && key !== "y") return;

    const ae = document.activeElement;
    const isInputFocus = ae && (
      ae.tagName === "INPUT" ||
      ae.tagName === "TEXTAREA" ||
      (ae.getAttribute && ae.getAttribute("contenteditable") === "true")
    );
    if (isInputFocus) return;

    if (key === "z" && !e.shiftKey) {
      e.preventDefault();
      e.stopPropagation();
      undo();
    } else if (key === "y" || (key === "z" && e.shiftKey)) {
      e.preventDefault();
      e.stopPropagation();
      redo();
    }
  });

  // ============================================================
  // API PUBLIQUE
  // ============================================================
  window.HistoryManager = {
    record:       record,
    captureState: _captureState,
    recordAction: recordAction,
    undo:         undo,
    redo:         redo,
    canUndo:      canUndo,
    canRedo:      canRedo,
    reset:        reset,
    onChange:     onChange,
    // Pour debug / introspection (lecture seule)
    _peek:        function() { return { undo: undoStack.slice(), redo: redoStack.slice() }; }
  };

  console.log("[HistoryManager] Module chargé — Ctrl+Z / Ctrl+Y disponibles.");
})();
