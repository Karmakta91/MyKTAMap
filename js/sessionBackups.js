/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * https://myktamap.fr — Licence CC BY-NC-SA 4.0
 * Usage commercial interdit sans accord ecrit prealable. Voir LICENSE.
 */

// sessionBackups.js — filet de sécurité : les 10 dernières copies de session PAR PLAN, en IndexedDB
//   ("myktamap_backups" / store "backups", clé id = horodatage ms), rotation FIFO.
//   Entrée : { id, createdAt, reason, planId, planName, payload }.
// Expose : window.SessionBackups (init, snapshot, snapshotPayload, listAll, restore, remove, clearAll,
//   deleteForPlan, onChange).
// Copies : toutes les 5 min si la session a changé ; au démarrage (main.js > lancerApplication) ;
//   AVANT tout geste destructif (sessionPersist.js, import de session) ; à la demande (bouton manuel).
// ⚠️ Restaurer écrit la session puis RECHARGE la page ; une copie d'un autre plan rouvre ce plan.

window.SessionBackups = (function() {
  "use strict";

  const DB_NAME    = "myktamap_backups";
  const DB_VERSION = 1;
  const STORE      = "backups";
  const MAX        = 10;

  let _db = null;
  let _hashLastSnapshot = null;
  let _timerId          = null;
  const _listeners      = [];
  const PERIODIC_MS = 5 * 60 * 1000;  // 5 min

  // ── IndexedDB ──────────────────────────────
  function _openDB() {
    return new Promise(function(resolve, reject) {
      if (_db) { resolve(_db); return; }
      if (!window.indexedDB) {
        reject(new Error("IndexedDB indisponible"));
        return;
      }
      const req = window.indexedDB.open(DB_NAME, DB_VERSION);
      req.onerror = function() {
        reject(req.error || new Error(window.I18n.t("backup.err_idb_open", { db: DB_NAME })));
      };
      req.onsuccess = function() {
        _db = req.result;
        // Fermée de l'extérieur : réouverte au prochain appel.
        _db.onclose = function() {
          console.warn("[SessionBackups] IDB fermée — sera réouverte au prochain accès");
          _db = null;
        };
        resolve(_db);
      };
      req.onupgradeneeded = function() {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          const store = db.createObjectStore(STORE, { keyPath: "id" });
          store.createIndex("createdAt", "createdAt", { unique: false });
        }
      };
    });
  }

  function _tx(mode) {
    return _openDB().then(function(db) {
      const tx = db.transaction(STORE, mode);
      return tx.objectStore(STORE);
    });
  }

  // djb2, comme sessionPersist.js.
  function _hash(obj) {
    try {
      const s = JSON.stringify(obj);
      let h = 5381;
      for (let i = 0; i < s.length; i++) {
        h = ((h << 5) + h) ^ s.charCodeAt(i);
      }
      return h.toString(36);
    } catch(e) {
      return null;
    }
  }

  function _emit() {
    _listeners.forEach(function(fn) {
      try { fn(); } catch(e) { console.warn("[SessionBackups] listener erreur :", e); }
    });
  }
  function onChange(fn) {
    if (typeof fn !== "function") return function() {};
    _listeners.push(fn);
    return function() {
      const i = _listeners.indexOf(fn);
      if (i >= 0) _listeners.splice(i, 1);
    };
  }

  // ── Liste, retrait, rotation ──────────────────────────────
  function listAll() {
    return _tx("readonly").then(function(store) {
      return new Promise(function(resolve, reject) {
        const req = store.getAll();
        req.onsuccess = function() {
          const arr = (req.result || []).slice();
          // Du plus récent au plus ancien.
          arr.sort(function(a, b) { return b.createdAt - a.createdAt; });
          resolve(arr);
        };
        req.onerror = function() { reject(req.error); };
      });
    });
  }

  function _put(entry) {
    return _tx("readwrite").then(function(store) {
      return new Promise(function(resolve, reject) {
        const req = store.put(entry);
        req.onsuccess = function() { resolve(entry); };
        req.onerror   = function() { reject(req.error); };
      });
    });
  }

  function remove(id) {
    return _tx("readwrite").then(function(store) {
      return new Promise(function(resolve, reject) {
        const req = store.delete(id);
        req.onsuccess = function() { _emit(); resolve(true); };
        req.onerror   = function() { reject(req.error); };
      });
    });
  }

  function clearAll() {
    return _tx("readwrite").then(function(store) {
      return new Promise(function(resolve, reject) {
        const req = store.clear();
        req.onsuccess = function() { _hashLastSnapshot = null; _emit(); resolve(true); };
        req.onerror   = function() { reject(req.error); };
      });
    });
  }

  // FIFO PAR PLAN (sinon un plan très utilisé purgerait l'historique des autres) ; les copies sans
  // planId tournent entre elles. 🩸 Jamais illimité : la pression sur le quota déclenche une éviction
  // SILENCIEUSE par le navigateur.
  function _enforceLimit() {
    return listAll().then(function(arr) {
      const parPlan = {};
      arr.forEach(function(e) {   // arr déjà trié DESC (plus récent d'abord)
        const g = e.planId || "__legacy__";
        (parPlan[g] = parPlan[g] || []).push(e);
      });
      const aSupprimer = [];
      Object.keys(parPlan).forEach(function(g) {
        parPlan[g].slice(MAX).forEach(function(e) { aSupprimer.push(e); });
      });
      if (!aSupprimer.length) return null;
      return Promise.all(aSupprimer.map(function(e) { return remove(e.id); }));
    });
  }

  // Toutes les copies d'un plan (suppression du plan, nettoyeur d'orphelins).
  function deleteForPlan(planId) {
    if (!planId) return Promise.resolve(0);
    return listAll().then(function(arr) {
      const cibles = arr.filter(function(e) { return e.planId === planId; });
      return Promise.all(cibles.map(function(e) { return remove(e.id); }))
        .then(function() { return cibles.length; });
    });
  }

  // ── Copie ──────────────────────────────
  function _readCurrentSessionPayload() {
    // Dernière version sauvée du plan COURANT (SessionPersist.getSaved, sans argument).
    try {
      if (window.SessionPersist && typeof window.SessionPersist.getSaved === "function") {
        return window.SessionPersist.getSaved();
      }
      // Repli si SessionPersist n'est pas chargé : slot du plan courant, puis ancien slot unique.
      const planId = window._currentLoadedPlanId || null;
      if (planId && window.KtaSessionStore) {
        const raw = window.KtaSessionStore.lire(planId);
        if (raw) return JSON.parse(raw);
      }
      const rawLegacy = localStorage.getItem("myktamap_session_v1");
      if (rawLegacy) return JSON.parse(rawLegacy);
      return null;
    } catch(e) {
      console.warn("[SessionBackups] read session payload échec :", e);
      return null;
    }
  }

  function _isPayloadEmpty(payload) {
    if (!payload) return true;
    const ept = !payload.editorPoints   || payload.editorPoints.length   === 0;
    const ert = !payload.roads          || payload.roads.length          === 0;
    const ezt = !payload.zones          || payload.zones.length          === 0;
    const est = !payload.structures     || payload.structures.length     === 0;
    const emt = !payload.measure        || payload.measure.length        === 0;
    const ems = !payload.measureSurface || payload.measureSurface.length === 0;
    // La timeline du tracker compte comme contenu (une sortie sans annotation mérite une copie).
    const etk = !payload.trackerTimeline || payload.trackerTimeline.length === 0;
    // Une légende personnalisée seule ne compte pas.
    return ept && ert && ezt && est && emt && ems && etk;
  }

  function snapshot(reason) {
    const payload = _readCurrentSessionPayload();
    if (_isPayloadEmpty(payload)) {
      return Promise.resolve(null);
    }
    const h = _hash(payload);
    if (h === _hashLastSnapshot) {
      // Inchangée : pas de doublon dans les 10 places.
      return Promise.resolve(null);
    }

    // 🩸 Comparée aussi à la dernière copie PERSISTÉE du plan : `_hashLastSnapshot` repart de null à
    // chaque chargement, et 10 ouvertures sans modification rempliraient les 10 places de doublons.
    return _getLastSnapshotForPlan(payload.planId).then(function(lastPersisted) {
      if (lastPersisted && _hash(lastPersisted.payload) === h) {
        _hashLastSnapshot = h;
        if (window.APP_CONFIG && window.APP_CONFIG.debugMode) {
          console.log("[SessionBackups] Skip snapshot (hash identique au dernier IDB du plan)", payload.planId);
        }
        return null;
      }
      const t = _nouvelId();
      const entry = {
        id:        t,
        createdAt: t,
        reason:    reason || "auto",
        planId:    payload.planId   || null,
        planName:  payload.planName || null,
        payload:   payload
      };
      return _put(entry)
        .then(function() { return _enforceLimit(); })
        .then(function() {
          _hashLastSnapshot = h;
          _emit();
          return entry;
        });
    }).catch(function(err) {
      console.warn("[SessionBackups] snapshot échec :", err);
      return null;
    });
  }

  // Identifiant = horodatage, strictement croissant dans la page : deux copies prises dans
  // la même milliseconde (migration de plusieurs sessions) ne s'écrasent pas.
  let _dernierId = 0;
  function _nouvelId() { _dernierId = Math.max(Date.now(), _dernierId + 1); return _dernierId; }

  // Copie d'une session QUELCONQUE, pour la migration vers IndexedDB (js/sessionStore.js) avant de
  // retirer une ancienne copie. true si la copie existe (créée ou identique). Pas de filtre « vide ».
  function snapshotPayload(payload, reason) {
    if (!payload || typeof payload !== "object") return Promise.resolve(false);
    const h = _hash(payload);
    return _getLastSnapshotForPlan(payload.planId).then(function(dernier) {
      if (dernier && _hash(dernier.payload) === h) return true;
      const t = _nouvelId();
      const entry = { id: t, createdAt: t, reason: reason || "copie",
        planId: payload.planId || null, planName: payload.planName || null, payload: payload };
      return _put(entry).then(function() { return _enforceLimit(); }).then(function() { _emit(); return true; });
    }).catch(function(err) {
      console.warn("[SessionBackups] copie échouée :", err);
      return false;
    });
  }

  // Copie la plus récente d'un plan, ou null.
  function _getLastSnapshotForPlan(planId) {
    if (!planId) return Promise.resolve(null);
    return listAll().then(function(arr) {
      // listAll() est trié du plus récent au plus ancien.
      for (let i = 0; i < arr.length; i++) {
        if (arr[i].planId === planId) return arr[i];
      }
      return null;
    }).catch(function(e) {
      console.warn("[SessionBackups] _getLastSnapshotForPlan échec :", e);
      return null;
    });
  }

  // ── Restauration ──────────────────────────────
  // Écrit la copie dans la session du plan, ATTEND la confirmation, puis fait recharger : le démarrage
  // normal restaure (pas de restauration à chaud, trop fragile : changement de plan, couches Leaflet).
  // 🩸 lastPlanId pointe sur le plan de la copie, sinon l'app rouvre le plan courant et rien ne semble
  // restauré. opts.versPlanId/versPlanName : restaurer DANS le plan ouvert une copie prise sous un
  // autre id (même plan, autre version), sinon elle retourne sur l'ancienne entrée.
  function restore(id, opts) {
    return _tx("readonly").then(function(store) {
      return new Promise(function(resolve, reject) {
        const req = store.get(id);
        req.onsuccess = function() {
          if (!req.result) {
            reject(new Error(window.I18n.t("backup.err_not_found", { id: id })));
            return;
          }
          resolve(req.result);
        };
        req.onerror = function() { reject(req.error); };
      });
    }).then(function(entry) {
      const versPlanId = opts && opts.versPlanId;
      const targetPlanId = versPlanId || (entry.payload && entry.payload.planId) || entry.planId;
      if (versPlanId && entry.payload) {
        entry.payload = Object.assign({}, entry.payload, { planId: versPlanId,
          planName: (opts.versPlanName != null ? opts.versPlanName : entry.payload.planName) });
      }
      if (!targetPlanId) {
        throw new Error(window.I18n.t("backup.err_no_planid"));
      }
      return window.KtaSessionStore.ecrireDurable(targetPlanId, JSON.stringify(entry.payload)).then(function() {
        return entry;
      }, function(e) {
        throw new Error(window.I18n.t("backup.err_ls_write", { msg: e && e.message ? e.message : String(e) }));
      });
    }).then(function(entry) {
      const targetPlanId = entry.payload.planId || entry.planId;
      // Session remplacée par une ancienne : une installation reliée relira tout (no-op sinon).
      try { window.dispatchEvent(new CustomEvent("mktm:session-cleared", { detail: { planId: targetPlanId, restauration: true } })); } catch(e) {}
      if (window.PlanRegistry && typeof window.PlanRegistry.setLastPlanId === "function") {
        try { window.PlanRegistry.setLastPlanId(targetPlanId); } catch(e) {
          console.warn("[SessionBackups] PlanRegistry.setLastPlanId échec :", e);
        }
      }
      return { restored: true, entry: entry };
    });
  }

  // ── Copie périodique et démarrage ──────────────────────────────
  function _startTimer() {
    if (_timerId) return;
    _timerId = setInterval(function() {
      snapshot("auto-periodic");
    }, PERIODIC_MS);
  }

  let _initialized = false;
  function init() {
    if (_initialized) return Promise.resolve();
    _initialized = true;
    return _openDB().then(function() {
      // Hash initial = session en cours : pas de copie immédiate du même contenu.
      const cur = _readCurrentSessionPayload();
      if (cur && !_isPayloadEmpty(cur)) {
        _hashLastSnapshot = _hash(cur);
      }
      _startTimer();
      window.addEventListener("beforeunload", function() {
        // Au mieux : IDB est async et la copie finit rarement avant la fermeture (la copie périodique
        // couvre). L'exécuteur d'une Promise est synchrone : la copie démarre tout de suite, et une
        // erreur synchrone comme un rejet IDB finit dans le .catch.
        new Promise(function(resoudre) { resoudre(snapshot("beforeunload")); }).catch(function() {});
      });
      console.log("[SessionBackups] init OK (max=" + MAX + ", periodic=" + (PERIODIC_MS/1000) + "s)");
    }).catch(function(err) {
      console.warn("[SessionBackups] init échec :", err);
      _initialized = false; // permet retry
    });
  }

  return {
    init:        init,
    snapshot:    snapshot,
    snapshotPayload: snapshotPayload,   // copie d'une session donnée (migration IndexedDB)
    listAll:     listAll,
    restore:     restore,
    remove:      remove,
    deleteForPlan: deleteForPlan,  // purge tous les backups d'un plan
    clearAll:    clearAll,
    onChange:    onChange,
    _DB_NAME:    DB_NAME,
    _MAX:        MAX,
    _PERIODIC_MS: PERIODIC_MS
  };
})();
