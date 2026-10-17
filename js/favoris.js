/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * https://myktamap.fr — Licence CC BY-NC-SA 4.0
 * Usage commercial interdit sans accord ecrit prealable. Voir LICENSE.
 */

// =========================
// FAVORIS.JS — Points favoris par plan (groupe ⭐ Favoris de la sidebar)
// =========================
// Un clic sur un favori centre la carte dessus + flash. Stockage localStorage "myktamap_favoris_v1" :
//   {
//     version: 1,
//     byPlan: {
//       "<planId>": [
//         {
//           uid:        "fav-...",     // identifiant du favori
//           pointId:    "...",          // id du point d'origine (pointUid : uid du point)
//           nom:        "...",          // libellé (snapshot)
//           x: 1234, y: 5678,           // coords plan (snapshot)
//           tag:        "puits"|...,   // tag principal (icône)
//           layerId:    "editor"|...,  // calque d'origine
//           layerLabel: "...",          // libellé du calque
//           addedAt:    1716552000     // horodatage d'ajout
//         }
//       ]
//     }
//   }
// API : window.Favoris = { loadPlan(planId) (appelé par main.js), getAll(), isFav(pointId), findByPointId(id),
//   add(snapshot), remove(pointId), toggle(snapshot) → { action: "added"|"removed", changed }, onChange(fn),
//   exportToJson / exportToFile / importFromJson / importFromFile, migrerVersUid, transfererPlan }
// SNAPSHOT plutôt que l'id seul : le favori survit à la suppression ou au déplacement du point, et le flyout n'a
// rien à résoudre à l'ouverture. Prix assumé : un point renommé garde l'ancien libellé (retirer puis rajouter).

window.Favoris = (function() {
  "use strict";

  const STORAGE_KEY = "myktamap_favoris_v1";
  const VERSION     = 1;

  let _currentPlanId = null;
  let _store         = { version: VERSION, byPlan: {} };
  const _listeners   = [];

  // ── Persistance localStorage ──────────
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
      // Quota dépassé (mobile) : une alerte, par OOMGuard si présent.
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

  // ── Cycle de vie : changement de plan ──────────
  function loadPlan(planId) {
    _currentPlanId = planId || null;
    if (_currentPlanId && !_store.byPlan[_currentPlanId]) {
      _store.byPlan[_currentPlanId] = [];
    }
    _emit();
  }

  // Les favoris d'un plan passent sous un autre id (copie locale remplacée par sa version publiée), fusion si la cible
  // en a déjà. Rend le nombre déplacé.
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

  // ── Lookup / état ──────────
  function getAll() {
    return _currentList().slice();
  }

  // Un favori est rattaché à l'uid de son point (`pointUid` ; le champ `uid` est celui du FAVORI, fav-…). L'uid
  // d'abord ; un favori ancien sans pointUid se reconnaît à son nom (double lecture, comme les photos).
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

  // Migration douce des favoris du plan courant (ETUDE_UID décision 12) : un favori sans pointUid reçoit l'uid du
  // point SI on le désigne sans deviner (un seul point de ce nom ; sinon l'homonyme du même calque à la même
  // position, 0,5 px). Ambigu : inchangé. `points` = tous les points du plan.
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

  // ── Mutations ──────────
  function _newUid() {
    return "fav-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
  }

  function add(snapshot) {
    if (!_currentPlanId) return false;
    if (!snapshot || !snapshot.pointId) return false;
    if (isFav(snapshot.pointId, snapshot.pointUid)) return false;
    if (!_store.byPlan[_currentPlanId]) _store.byPlan[_currentPlanId] = [];
    const entry = {
      uid:        _newUid(),
      pointId:    String(snapshot.pointId),
      pointUid:   snapshot.pointUid ? String(snapshot.pointUid) : undefined,
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

  // ── Listeners UI (rafraîchissement du flyout) ──────────
  function onChange(fn) {
    if (typeof fn !== "function") return function() {};
    _listeners.push(fn);
    return function() {
      const i = _listeners.indexOf(fn);
      if (i >= 0) _listeners.splice(i, 1);
    };
  }

  // ── Export / import JSON (partage entre appareils ou utilisateurs) ──────────
  // Format exporté (versionné) :
  //   {
  //     "type":       "myktamap-favoris-export",
  //     "version":    1,
  //     "exportedAt": "ISO timestamp",
  //     "appVersion": "vX.Y.Z",
  //     "scope":      "all" | "current-plan",
  //     "byPlan":     { "<planId>": [favoris...], ... }
  //   }
  // scope "all" = tout _store.byPlan ; "current-plan" = le plan courant seulement.

  function exportToJson(opts) {
    opts = opts || {};
    const scope = opts.scope === "current-plan" ? "current-plan" : "all";
    let byPlan = {};
    if (scope === "current-plan" && _currentPlanId) {
      byPlan[_currentPlanId] = (_store.byPlan[_currentPlanId] || []).slice();
    } else {
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

  // Télécharge l'export en fichier JSON. opts = { scope: "all"|"current-plan", filename?: string }
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

  // Importe un JSON exporté (objet parsé OU chaîne brute). opts = { mode: "merge"|"replace", targetPlanId? }.
  // Rend { ok, error?, added, skipped, replaced, plansTouched }.
  //   - "merge" (défaut) : ajoute, ignore un pointId déjà présent dans le plan cible ; autres plans intacts.
  //   - "replace" : REMPLACE entièrement les favoris de chaque plan présent dans l'import ; plans absents préservés.
  // `targetPlanId` : tous les favoris importés vont dans ce plan (export « current-plan » reçu d'ailleurs).
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

  // Importe depuis un File (input type=file) ; rend Promise du résultat de importFromJson.
  function importFromFile(file, opts) {
    if (!file) return Promise.resolve({ ok: false, error: window.I18n.t("fav.err.noFile") });
    return file.text().then(function(txt) {
      return importFromJson(txt, opts);
    }).catch(function(e) {
      return { ok: false, error: window.I18n.t("fav.err.fileRead", { msg: (e.message || e) }) };
    });
  }

  // Validation + nettoyage d'une entrée importée ; null si invalide.
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

  // Lecture immédiate au démarrage ; main.js > initDataFromConfig appelle ensuite loadPlan(planId).
  _load();

  return {
    loadPlan:        loadPlan,
    migrerVersUid:   migrerVersUid,
    transfererPlan:  transfererPlan,
    getAll:          getAll,
    isFav:           isFav,
    findByPointId:   findByPointId,
    add:             add,
    remove:          remove,
    toggle:          toggle,
    onChange:        onChange,
    exportToJson:    exportToJson,
    exportToFile:    exportToFile,
    importFromJson:  importFromJson,
    importFromFile:  importFromFile,
    _STORAGE_KEY:    STORAGE_KEY,
    _VERSION:        VERSION
  };
})();
