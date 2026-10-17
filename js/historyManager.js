/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * Site : https://myktamap.fr
 * Licence : CC BY-NC-SA 4.0 — Usage commercial interdit sans accord ecrit prealable.
 * Voir LICENSE a la racine du projet.
 */

// =========================
// HISTORYMANAGER.JS — Undo / Redo global
// =========================
// Historique en RAM des mutations des 4 catégories dessinables : points de session (getEditorPoints /
// setEditorPoints), tracés (getRoads / resetRoads + setRoads), zones (…Zones), structures (…Structures).
//   - PHOTOS EXCLUES (suppression IDB irréversible ; tout restaurer demanderait un cache RAM des blobs).
//   - 1 clic = 1 entrée ; 50 entrées FIFO ; Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z + 2 boutons de la sidebar (grisés si
//     pile vide) ; toast discret (OOMGuard.showToast).
//   - RAM seulement : piles vidées au changement de plan et au rechargement.
//   - Instantanés (deep clone) par _captureState(), ciblés par catégorie.
//   - Traces de suppression (uid) tenues ici, pour toutes les suppressions (cf. _tracerDepuis).
// API : window.HistoryManager = {
//   record(label, beforeState?, category?) - ajoute une entrée (beforeState capturé si omis)
//   captureState(category?)     - instantané à passer plus tard à record(label, snap)
//   recordAction(label, fn)     - capture avant → fn() → record
//   undo() / redo()             - état précédent / suivant
//   canUndo() / canRedo()       - booléens (boutons)
//   reset()                     - vide les piles (changement de plan)
//   onChange(cb)                - synchro UI
// };
// Doc : docs/architecture/session-data.md.

(function() {
  "use strict";

  const MAX_HISTORY = 50;

  // i18n appelé au runtime (après I18n.init()), repli FR inline : jamais de crash ni de clé brute.
  function _t(key) {
    if (window.I18n && typeof window.I18n.t === "function") return window.I18n.t(key);
    return key === "history.undone" ? "↩ Annulé : "
         : key === "history.redone" ? "↪ Refait : "
         : key === "history.action.default" ? "Action"
         : key;
  }

  let undoStack = []; // [{label, snapshot, ts}]
  let redoStack = [];

  const _listeners = [];

  // ── Capture / application d'état ──────────
  // Clone profond : structuredClone si disponible, sinon JSON.parse(JSON.stringify(...)).
  function _deepCloneArray(arr) {
    if (!Array.isArray(arr)) return [];
    if (typeof structuredClone === "function") {
      try { return structuredClone(arr); } catch(e) { /* fallthrough */ }
    }
    try { return JSON.parse(JSON.stringify(arr)); } catch(e) { return []; }
  }

  // Capture CIBLÉE : `category` ∈ "editorPoints" | "roads" | "zones" | "structures" ne clone QUE cette catégorie
  // (~4× moins de RAM pour les instantanés d'édition, de loin les plus fréquents) ; null → tout (import GPX, reset
  // global, note de popup multi-types). currentRoadIndex / currentZoneIndex / currentStructureIndex sont toujours
  // inclus mais restaurés SEULEMENT si leur catégorie est dans l'instantané (cf. _applyState).
  function _captureState(category) {
    const snap = {
      currentRoadIndex:      (window.getCurrentRoadIndex ? window.getCurrentRoadIndex() : -1),
      currentZoneIndex:      (window.getCurrentZoneIndex ? window.getCurrentZoneIndex() : -1),
      currentStructureIndex: (window.getCurrentStructureIndex ? window.getCurrentStructureIndex() : -1)
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

  // Applique un instantané par les setters publics : reset() + set() pour remplacer atomiquement (`set` seul ajoute
  // dans certaines implémentations).
  // 🩸 SEULES les catégories PRÉSENTES sont touchées : resetRoads() inconditionnel viderait les roads sur un
  // undo ciblé « zones » (perte de données). Catégorie absente = inchangée.
  function _applyState(s) {
    try {
      if (window.setEditorPoints && Array.isArray(s.editorPoints)) {
        window.setEditorPoints(s.editorPoints);
      }
      // 🩸 window.modeRoad préservé : resetRoads() le remet à null (road.js), et le mousedown suivant
      // (`if (!window.modeRoad) return`) serait avorté en silence — tracé restauré mais impossible à continuer.
      // Sauvé AVANT le reset, restauré seulement s'il y avait un tracé en cours (sinon sortir du mode est
      // cohérent avec l'annulation d'une création).
      const _savedModeRoad = (Array.isArray(s.roads) && typeof s.currentRoadIndex === "number" && s.currentRoadIndex >= 0)
        ? window.modeRoad
        : null;
      // Idem modeZone / modeStructure : sans restauration, un Ctrl+Z en plein dessin tue l'outil et laisse la
      // pastille allumée. Restaurés seulement s'il reste une forme en cours (index >= 0).
      const _savedModeZone = (Array.isArray(s.zones) && typeof s.currentZoneIndex === "number" && s.currentZoneIndex >= 0)
        ? window.modeZone
        : null;
      const _savedModeStructure = (Array.isArray(s.structures) && typeof s.currentStructureIndex === "number" && s.currentStructureIndex >= 0)
        ? window.modeStructure
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
      // Tracé en cours restauré APRÈS setRoads (qui remet currentRoad à null), seulement si l'instantané contient
      // `roads` : un undo « zones » ne touche pas au tracé en cours.
      if (Array.isArray(s.roads) && window.setCurrentRoadByIndex
          && typeof s.currentRoadIndex === "number") {
        window.setCurrentRoadByIndex(s.currentRoadIndex);
      }
      // Idem zones / structures, après setZones / setStructures.
      if (Array.isArray(s.zones) && window.setCurrentZoneByIndex
          && typeof s.currentZoneIndex === "number") {
        window.setCurrentZoneByIndex(s.currentZoneIndex);
      }
      if (Array.isArray(s.structures) && window.setCurrentStructureByIndex
          && typeof s.currentStructureIndex === "number") {
        window.setCurrentStructureByIndex(s.currentStructureIndex);
      }
      // Mode road (puis zones / structures) restauré pour continuer le tracé ; rien si on annulait la création
      // même (currentRoadIndex == -1) : rester hors du mode.
      if (_savedModeRoad) {
        window.modeRoad = _savedModeRoad;
      }
      if (_savedModeZone) {
        window.modeZone = _savedModeZone;
      }
      if (_savedModeStructure) {
        window.modeStructure = _savedModeStructure;
      }
    } catch(e) {
      console.warn("[HistoryManager] _applyState échoué :", e);
    }
  }

  // ── Traces de suppression (ETUDE_UID décisions 8 et 9) ──────────
  // Tenues ICI plutôt qu'aux ~15 sites de suppression (gomme, popup, tout effacer, conversion, tableur, import
  // GPX…) : toute action passe par record(), et un diff des uid entre « avant » et l'état courant dit ce qui a
  // disparu.
  //   - Diff sur l'UNION des catégories : un objet converti des tracés aux zones n'est pas supprimé.
  //   - Pas de trace pour l'itinéraire calculé, ni pour un objet rapatrié d'un calque (`_srcCalque`) : le restituer
  //     le rend à son calque.
  const _CATS = ["editorPoints", "roads", "zones", "structures"];
  const _GETTERS = { editorPoints: "getEditorPoints", roads: "getRoads", zones: "getZones", structures: "getStructures" };

  function _indexUid(listesParCat) {
    const m = new Map();
    _CATS.forEach(function(c) {
      (listesParCat[c] || []).forEach(function(o) {
        if (o && typeof o.uid === "string" && o.uid) m.set(o.uid, o);
      });
    });
    return m;
  }
  function _etatCourantPour(snap) {
    const out = {};
    _CATS.forEach(function(c) {
      if (Array.isArray(snap[c]) && typeof window[_GETTERS[c]] === "function") out[c] = window[_GETTERS[c]]() || [];
    });
    return out;
  }
  function _laisseTrace(o) {
    return !!(o && !o._srcCalque && !(window.KtaUid && window.KtaUid.estTransitoire(o)));
  }

  function _tracerDepuis(avant) {
    const K = window.KtaUid;
    if (!K || !avant) return;
    const a = _indexUid(avant), b = _indexUid(_etatCourantPour(avant));
    a.forEach(function(o, uid) { if (!b.has(uid) && _laisseTrace(o)) K.tombstone(uid); });
    b.forEach(function(o, uid) { if (!a.has(uid)) K.untombstone(uid); });
  }

  // Après undo / redo : revenir en arrière est une MODIFICATION (décision 9), sinon une synchro garderait la version
  // annulée, plus récente. Réapparu → trace retirée + touch ; disparu → trace ; présent mais différent → touch.
  function _tracerRetour(avantRetour) {
    const K = window.KtaUid;
    if (!K || !avantRetour) return;
    const a = _indexUid(avantRetour), b = _indexUid(_etatCourantPour(avantRetour));
    b.forEach(function(o, uid) {
      if (K.estTransitoire(o)) return;
      const prec = a.get(uid);
      if (!prec) { K.untombstone(uid); K.touch(o); }
      else if (prec.updatedAt !== o.updatedAt) K.touch(o);
    });
    a.forEach(function(o, uid) { if (!b.has(uid) && _laisseTrace(o)) K.tombstone(uid); });
  }

  // ── Record / undo / redo ──────────
  // record(label, beforeState?, category?)
  //   beforeState : instantané AVANT la mutation ; omis → état COURANT (record() appelé après la mutation).
  //   category    : "editorPoints"|"roads"|"zones"|"structures" (instantané ciblé) ; absent = tout.
  //                 ⚠️ DOIT être la catégorie réellement mutée ET celle passée à captureState() pour beforeState,
  //                 sinon l'undo ne restaure pas la bonne donnée.
  function record(label, beforeState, category) {
    const snap = beforeState || _captureState(category);
    try { _tracerDepuis(snap); } catch(e) { console.warn("[HistoryManager] traces de suppression :", e); }
    // Repli localisé si label absent (history.action.default).
    undoStack.push({ label: String(label || _t("history.action.default")), category: category || null, snapshot: snap, ts: Date.now() });
    if (undoStack.length > MAX_HISTORY) {
      undoStack.shift(); // FIFO sur dépassement
    }
    // Toute nouvelle action efface le redo (nouvelle branche).
    if (redoStack.length > 0) redoStack = [];
    _notify();
  }

  function recordAction(label, mutationFn, category) {
    const before = _captureState(category);
    let result;
    try {
      result = mutationFn();
    } catch(e) {
      // Mutation en erreur : PAS de record (l'undo pointerait sur un état artificiel).
      console.warn("[HistoryManager] mutation échouée, skip record :", e);
      throw e;
    }
    record(label, before, category);
    return result;
  }

  function undo() {
    if (undoStack.length === 0) return false;
    if (typeof window.ktaEditionRefusee === "function" && window.ktaEditionRefusee()) return false;   // 🔒 lecture seule
    const entry = undoStack.pop();
    // Capture ciblée sur la MÊME catégorie que l'entrée (cohérence du redo).
    const currentState = _captureState(entry.category);
    _applyState(entry.snapshot);
    try { _tracerRetour(currentState); } catch(e) { console.warn("[HistoryManager] traces (undo) :", e); }
    // État COURANT poussé sur redo avec le même label et la même catégorie (« ↩ Annulé : <label> »).
    redoStack.push({ label: entry.label, category: entry.category, snapshot: currentState, ts: Date.now() });
    if (redoStack.length > MAX_HISTORY) redoStack.shift();
    _showToast(_t("history.undone") + entry.label);
    _notify();
    _saveSession();
    return true;
  }

  function redo() {
    if (redoStack.length === 0) return false;
    if (typeof window.ktaEditionRefusee === "function" && window.ktaEditionRefusee()) return false;   // 🔒 lecture seule
    const entry = redoStack.pop();
    const currentState = _captureState(entry.category);
    _applyState(entry.snapshot);
    try { _tracerRetour(currentState); } catch(e) { console.warn("[HistoryManager] traces (redo) :", e); }
    undoStack.push({ label: entry.label, category: entry.category, snapshot: currentState, ts: Date.now() });
    if (undoStack.length > MAX_HISTORY) undoStack.shift();
    _showToast(_t("history.redone") + entry.label);
    _notify();
    _saveSession();
    return true;
  }

  // ── État / notification ──────────
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

  // ── Retour UX + sauvegarde de session ──────────
  function _showToast(msg) {
    if (window.OOMGuard && window.OOMGuard.showToast) {
      try { window.OOMGuard.showToast(msg, "info"); return; } catch(e) {}
    }
    console.log("[HistoryManager] " + msg);
  }

  // Sauvegarde de session après chaque undo/redo (un rechargement juste après ne perd rien).
  function _saveSession() {
    if (window.SessionPersist && typeof window.SessionPersist.save === "function") {
      try { window.SessionPersist.save({ force: true }); } catch(e) { /* silent */ }
    }
  }

  // ── Raccourcis clavier ──────────
  // Ctrl+Z → undo ; Ctrl+Y et Ctrl+Shift+Z → redo ; Cmd sur Mac (e.metaKey).
  // Ignorés dans un input / textarea / contenteditable (l'undo natif du champ doit marcher).
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

  // ── API publique ──────────
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
    // Debug / introspection (lecture seule).
    _peek:        function() { return { undo: undoStack.slice(), redo: redoStack.slice() }; }
  };

  console.log("[HistoryManager] Module chargé — Ctrl+Z / Ctrl+Y disponibles.");
})();
