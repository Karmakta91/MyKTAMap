/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * https://myktamap.fr — Licence CC BY-NC-SA 4.0
 * Usage commercial interdit sans accord ecrit prealable. Voir LICENSE.
 */

// =========================
// ⭐ Favoris (v1.16.0 step 3)
// =========================
//
// Permet à l'utilisateur de marquer des POINTS (POI) comme favoris pour y
// revenir rapidement. Stockage par plan dans localStorage. Affichage dans
// un nouveau groupe sidebar "⭐ Favoris" (flyout) : clic sur un favori →
// centre la carte dessus + flash visuel.
//
// Format de stockage (localStorage key "myktamap_favoris_v1") :
//   {
//     version: 1,
//     byPlan: {
//       "<planId>": [
//         {
//           uid:        "fav-...",     // ID unique du favori
//           pointId:    "...",          // ID du point d'origine
//           nom:        "...",          // libellé snapshot
//           x: 1234, y: 5678,           // coords plan x/y (snapshot)
//           tag:        "puits"|...,   // tag principal (pour icône)
//           layerId:    "editor"|...,  // calque d'origine (pour info)
//           layerLabel: "...",          // libellé du calque (pour info)
//           addedAt:    1716552000     // timestamp ajout
//         }
//       ]
//     }
//   }
//
// API publique :
//   window.Favoris.loadPlan(planId)     → switch active plan (appelé par main.js)
//   window.Favoris.getAll()             → list of favoris for current plan
//   window.Favoris.isFav(pointId)       → bool
//   window.Favoris.findByPointId(id)    → favori entry or null
//   window.Favoris.add(snapshot)        → adds, returns true if added
//   window.Favoris.remove(pointId)      → removes, returns true if removed
//   window.Favoris.toggle(snapshot)     → { action: "added"|"removed", changed }
//   window.Favoris.onChange(fn)         → listener (sidebar refresh)
//
// Pourquoi snapshot complet plutôt que juste l'ID :
//   1. Résilience : si le point est supprimé/déplacé du data layer, le
//      favori continue de fonctionner (centre sur les coords snapshot).
//   2. Performance : pas besoin de scanner getEditorPoints + data layers
//      à chaque ouverture du flyout pour résoudre les libellés/icônes.
//   3. Si le point est édité (renommé) après ajout en favori, le snapshot
//      est obsolète — trade-off acceptable, l'utilisateur peut retirer
//      et re-ajouter pour rafraîchir.

window.Favoris = (function() {
  "use strict";

  const STORAGE_KEY = "myktamap_favoris_v1";
  const VERSION     = 1;

  let _currentPlanId = null;
  let _store         = { version: VERSION, byPlan: {} };
  const _listeners   = [];

  // ─────────────────────────────────────────────
  // Persistance localStorage
  // ─────────────────────────────────────────────
  function _load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed && parsed.version === VERSION && parsed.byPlan && typeof parsed.byPlan === "object") {
        _store = parsed;
      }
    } catch(e) {
      console.warn("[Favoris] _load échec :", e);
    }
  }

  function _save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(_store));
    } catch(e) {
      console.warn("[Favoris] _save échec :", e);
      // Quota dépassé sur mobile → on alerte une fois via OOMGuard si dispo
      if (window.OOMGuard && typeof window.OOMGuard.showToast === "function" &&
          e && (e.name === "QuotaExceededError" || /quota/i.test(e.message || ""))) {
        window.OOMGuard.showToast(
          window.I18n.t("fav.toast.storageFull"),
          "error"
        );
      }
    }
  }

  function _emit() {
    _listeners.forEach(function(fn) {
      try { fn(); } catch(e) { console.warn("[Favoris] listener erreur :", e); }
    });
  }

  // ─────────────────────────────────────────────
  // Cycle de vie : switch de plan
  // ─────────────────────────────────────────────
  function loadPlan(planId) {
    _currentPlanId = planId || null;
    if (_currentPlanId && !_store.byPlan[_currentPlanId]) {
      _store.byPlan[_currentPlanId] = [];
    }
    _emit();
  }

  // Les favoris d'un plan passent sous un autre id (copie locale remplacée par
  // sa version publiée). Fusion si la cible en a déjà. → nombre déplacé.
  function transfererPlan(ancienId, nouveauId) {
    const src = _store.byPlan[ancienId];
    if (!ancienId || !nouveauId || ancienId === nouveauId || !Array.isArray(src) || !src.length) return 0;
    _store.byPlan[nouveauId] = (_store.byPlan[nouveauId] || []).concat(src);
    delete _store.byPlan[ancienId];
    if (_currentPlanId === ancienId) _currentPlanId = nouveauId;
    _save();
    _emit();
    return src.length;
  }

  function _currentList() {
    if (!_currentPlanId) return [];
    return _store.byPlan[_currentPlanId] || [];
  }

  // ─────────────────────────────────────────────
  // Lookup / state
  // ─────────────────────────────────────────────
  function getAll() {
    return _currentList().slice();
  }

  // 🆔 v2.4.0 (ETUDE_UID lot C2) — un favori est rattaché à l'uid de son point
  // (`pointUid` : le champ `uid` d'un favori est déjà SON identifiant, fav-…).
  // Lecture : l'uid d'abord ; un favori ancien sans pointUid se reconnaît
  // encore à son nom (double lecture, comme les photos).
  function _correspond(f, pointId, pointUid) {
    if (pointUid && f.pointUid) return f.pointUid === pointUid;
    return !!pointId && f.pointId === pointId;
  }
  function findByPointId(pointId, pointUid) {
    if (!pointId && !pointUid) return null;
    const list = _currentList();
    for (let i = 0; i < list.length; i++) {
      if (_correspond(list[i], pointId, pointUid)) return list[i];
    }
    return null;
  }

  function isFav(pointId, pointUid) {
    return !!findByPointId(pointId, pointUid);
  }

  // 🆔 v2.4.0 — Migration douce des favoris du plan courant (ETUDE_UID déc. 12) :
  // un favori sans pointUid reçoit l'uid du point SI on peut le désigner sans
  // deviner — un seul point de ce nom ; sinon parmi les homonymes, celui du
  // même calque à la même position (tolérance 0,5 px). Ambigu : inchangé (il
  // reste reconnu par son nom). `points` = tous les points du plan.
  function migrerVersUid(points) {
    if (!_currentPlanId || !Array.isArray(points)) return 0;
    const list = _store.byPlan[_currentPlanId] || [];
    let n = 0;
    list.forEach(function(f) {
      if (!f || f.pointUid || !f.pointId) return;
      let c = points.filter(function(p) { return p && String(p.id || "") === f.pointId; });
      if (c.length > 1) {
        c = c.filter(function(p) {
          return (!f.layerId || !p.layerId || p.layerId === f.layerId) &&
                 Math.abs((p.x || 0) - (f.x || 0)) < 0.5 && Math.abs((p.y || 0) - (f.y || 0)) < 0.5;
        });
      }
      if (c.length === 1 && typeof c[0].uid === "string" && c[0].uid) { f.pointUid = c[0].uid; n++; }
    });
    if (n > 0) { _save(); console.log("[Favoris] " + n + " favori(s) rattaché(s) à l'uid de leur point (v2.4.0)"); }
    return n;
  }

  // ─────────────────────────────────────────────
  // Mutations
  // ─────────────────────────────────────────────
  function _newUid() {
    return "fav-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
  }

  function add(snapshot) {
    if (!_currentPlanId) return false;
    if (!snapshot || !snapshot.pointId) return false;
    // Anti-doublon
    if (isFav(snapshot.pointId, snapshot.pointUid)) return false;
    if (!_store.byPlan[_currentPlanId]) _store.byPlan[_currentPlanId] = [];
    const entry = {
      uid:        _newUid(),
      pointId:    String(snapshot.pointId),
      pointUid:   snapshot.pointUid ? String(snapshot.pointUid) : undefined,   // 🆔 v2.4.0
      nom:        String(snapshot.nom || "(sans nom)"),
      x:          Number(snapshot.x) || 0,
      y:          Number(snapshot.y) || 0,
      tag:        snapshot.tag        || "default",
      layerId:    snapshot.layerId    || "editor",
      layerLabel: snapshot.layerLabel || "",
      addedAt:    Date.now()
    };
    _store.byPlan[_currentPlanId].push(entry);
    _save();
    _emit();
    return true;
  }

  function remove(pointId, pointUid) {
    if (!_currentPlanId) return false;
    const list = _store.byPlan[_currentPlanId];
    if (!list) return false;
    const idx = list.findIndex(function(f) { return _correspond(f, pointId, pointUid); });
    if (idx < 0) return false;
    list.splice(idx, 1);
    _save();
    _emit();
    return true;
  }

  function toggle(snapshot) {
    if (!snapshot || !snapshot.pointId) return { action: "none", changed: false };
    if (isFav(snapshot.pointId, snapshot.pointUid)) {
      const ok = remove(snapshot.pointId, snapshot.pointUid);
      return { action: "removed", changed: ok };
    }
    const ok = add(snapshot);
    return { action: "added", changed: ok };
  }

  // ─────────────────────────────────────────────
  // Listeners pour UI (sidebar flyout refresh)
  // ─────────────────────────────────────────────
  function onChange(fn) {
    if (typeof fn !== "function") return function() {};
    _listeners.push(fn);
    return function() {
      const i = _listeners.indexOf(fn);
      if (i >= 0) _listeners.splice(i, 1);
    };
  }

  // ─────────────────────────────────────────────
  // 🆕 v1.20.0 — Export / Import JSON (partage cross-appareil)
  // ─────────────────────────────────────────────
  // Use case : un cataphile veut envoyer sa liste de POI favoris (entrée
  // carrière, point de RDV, lieux d'intérêt) à un autre cataphile qui
  // utilise MyKTAMap. Sans cette feature, les favoris restent strictement
  // locaux par appareil (cf doc en tête). Avec export → JSON, import →
  // merge ou replace selon mode.
  //
  // Format JSON exporté (extensible, versionné) :
  //   {
  //     "type":       "myktamap-favoris-export",
  //     "version":    1,
  //     "exportedAt": "ISO timestamp",
  //     "appVersion": "v1.20.0",
  //     "scope":      "all" | "current-plan",
  //     "byPlan":     { "<planId>": [favoris...], ... }
  //   }
  //
  // - scope: "all" → exporte TOUS les plans (= dump complet de _store.byPlan)
  // - scope: "current-plan" → exporte UNIQUEMENT le plan courant
  //
  // Import : modes "merge" (par défaut, ajoute sans écraser, anti-doublon
  // sur pointId) ou "replace" (vide le plan courant puis injecte).

  function exportToJson(opts) {
    opts = opts || {};
    const scope = opts.scope === "current-plan" ? "current-plan" : "all";
    let byPlan = {};
    if (scope === "current-plan" && _currentPlanId) {
      byPlan[_currentPlanId] = (_store.byPlan[_currentPlanId] || []).slice();
    } else {
      // Deep clone de tout le store
      Object.keys(_store.byPlan).forEach(function(pid) {
        byPlan[pid] = (_store.byPlan[pid] || []).slice();
      });
    }
    return {
      type:        "myktamap-favoris-export",
      version:     1,
      exportedAt:  new Date().toISOString(),
      appVersion:  (window.__MKM__ && window.__MKM__.build) || "?",
      scope:       scope,
      byPlan:      byPlan
    };
  }

  /**
   * Télécharge l'export en tant que fichier JSON.
   * @param {Object} opts - { scope: "all"|"current-plan", filename?: string }
   */
  function exportToFile(opts) {
    const payload = exportToJson(opts);
    const fname = (opts && opts.filename)
                  || ("myktamap_favoris_" + new Date().toISOString().slice(0, 10) + ".json");
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url  = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = fname; a.click();
    setTimeout(function() { URL.revokeObjectURL(url); }, 1000);
    return payload;
  }

  /**
   * Importe un JSON exporté.
   * @param {Object|string} input - payload JSON parsé OU string JSON brut
   * @param {Object} opts - { mode: "merge"|"replace", targetPlanId?: string|null }
   * @returns {Object} { ok, error?, added, skipped, replaced, plansTouched }
   *
   * Modes :
   * - "merge" (défaut) : ajoute aux favoris existants, skip si pointId déjà
   *   présent dans le plan cible. NE TOUCHE PAS aux autres plans.
   * - "replace" : pour chaque plan présent dans l'import, REMPLACE entièrement
   *   les favoris existants de ce plan. Les plans absents de l'import sont
   *   préservés.
   *
   * Si `targetPlanId` est fourni : tous les favoris importés sont assignés à
   * ce plan (utile pour un export "current-plan" reçu d'ailleurs et qu'on
   * veut accrocher à un plan local sans conserver l'ancien planId).
   */
  function importFromJson(input, opts) {
    opts = opts || {};
    const mode = opts.mode === "replace" ? "replace" : "merge";
    const targetPlanId = opts.targetPlanId || null;

    let payload;
    if (typeof input === "string") {
      try { payload = JSON.parse(input); }
      catch(e) { return { ok: false, error: window.I18n.t("fav.err.jsonInvalid", { msg: e.message }) }; }
    } else {
      payload = input;
    }
    if (!payload || typeof payload !== "object") {
      return { ok: false, error: window.I18n.t("fav.err.empty") };
    }
    if (payload.type !== "myktamap-favoris-export") {
      return { ok: false, error: window.I18n.t("fav.err.wrongType") };
    }
    if (!payload.byPlan || typeof payload.byPlan !== "object") {
      return { ok: false, error: window.I18n.t("fav.err.noByPlan") };
    }

    let added = 0, skipped = 0, replaced = 0;
    const plansTouched = new Set();

    // Si targetPlanId : on aplatit tout dans ce plan (sinon par planId source)
    if (targetPlanId) {
      const allFlat = [];
      Object.keys(payload.byPlan).forEach(function(srcPid) {
        const list = payload.byPlan[srcPid];
        if (Array.isArray(list)) list.forEach(function(f) { allFlat.push(f); });
      });
      const sanitized = allFlat.map(_sanitizeImportedFav).filter(Boolean);
      if (mode === "replace") {
        _store.byPlan[targetPlanId] = sanitized;
        replaced = sanitized.length;
      } else {
        if (!_store.byPlan[targetPlanId]) _store.byPlan[targetPlanId] = [];
        const existing = _store.byPlan[targetPlanId];
        const seenIds = new Set(existing.map(function(f) { return f.pointId; }));
        sanitized.forEach(function(f) {
          if (seenIds.has(f.pointId)) { skipped++; return; }
          existing.push(f);
          seenIds.add(f.pointId);
          added++;
        });
      }
      plansTouched.add(targetPlanId);
    } else {
      Object.keys(payload.byPlan).forEach(function(pid) {
        const list = payload.byPlan[pid];
        if (!Array.isArray(list)) return;
        const sanitized = list.map(_sanitizeImportedFav).filter(Boolean);
        if (mode === "replace") {
          _store.byPlan[pid] = sanitized;
          replaced += sanitized.length;
          plansTouched.add(pid);
        } else {
          if (!_store.byPlan[pid]) _store.byPlan[pid] = [];
          const existing = _store.byPlan[pid];
          const seenIds = new Set(existing.map(function(f) { return f.pointId; }));
          sanitized.forEach(function(f) {
            if (seenIds.has(f.pointId)) { skipped++; return; }
            existing.push(f);
            seenIds.add(f.pointId);
            added++;
          });
          plansTouched.add(pid);
        }
      });
    }

    _save();
    _emit();
    return {
      ok:           true,
      mode:         mode,
      added:        added,
      skipped:      skipped,
      replaced:     replaced,
      plansTouched: Array.from(plansTouched)
    };
  }

  /**
   * Importe depuis un File (input type=file).
   * @returns {Promise<Object>} le résultat de importFromJson
   */
  function importFromFile(file, opts) {
    if (!file) return Promise.resolve({ ok: false, error: window.I18n.t("fav.err.noFile") });
    return file.text().then(function(txt) {
      return importFromJson(txt, opts);
    }).catch(function(e) {
      return { ok: false, error: window.I18n.t("fav.err.fileRead", { msg: (e.message || e) }) };
    });
  }

  // Validation + nettoyage d'une entrée favori importée. Retourne null si invalide.
  function _sanitizeImportedFav(raw) {
    if (!raw || typeof raw !== "object") return null;
    if (!raw.pointId) return null;
    return {
      uid:        raw.uid || _newUid(),
      pointId:    String(raw.pointId),
      nom:        String(raw.nom || "(sans nom)"),
      x:          Number(raw.x) || 0,
      y:          Number(raw.y) || 0,
      tag:        raw.tag        || "default",
      layerId:    raw.layerId    || "editor",
      layerLabel: raw.layerLabel || "",
      addedAt:    Number(raw.addedAt) || Date.now()
    };
  }

  // Lecture immédiate au boot — main.js > startApp appellera loadPlan(planId)
  // pour pointer sur le bon plan après load de PLAN_CONFIG.
  _load();

  return {
    loadPlan:        loadPlan,
    migrerVersUid:   migrerVersUid,   // 🆔 v2.4.0
    transfererPlan:  transfererPlan,
    getAll:          getAll,
    isFav:           isFav,
    findByPointId:   findByPointId,
    add:             add,
    remove:          remove,
    toggle:          toggle,
    onChange:        onChange,
    // 🆕 v1.20.0 — Export/Import JSON pour partage cross-appareil
    exportToJson:    exportToJson,
    exportToFile:    exportToFile,
    importFromJson:  importFromJson,
    importFromFile:  importFromFile,
    // Exposé pour debug
    _STORAGE_KEY:    STORAGE_KEY,
    _VERSION:        VERSION
  };
})();
