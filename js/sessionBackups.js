// =========================
// 📦 SessionBackups (v1.16.0 step 4)
// =========================
//
// Filet de sécurité : conserve les 10 dernières sauvegardes de session
// dans IndexedDB (rotation FIFO). Permet de revenir en arrière si l'user
// fait une action regrettable (reset, suppression masse, plan switch, etc.).
//
// Triggers de snapshot (cf KARMA spec v1.16.0 step 4) :
//   1. Auto périodique  : toutes les 5 min, si la session a changé depuis
//                          le dernier snapshot (hash check)
//   2. Au boot          : après _applyRestore réussi, snapshot l'état
//                          restauré (= état final de la session précédente)
//   3. Avant destructif : reset session, suppression masse, switch de plan,
//                          import qui écrase
//   4. Manuel           : bouton "📦 Snapshot maintenant" dans la modale
//                          Session active
//
// Portée : GLOBAL (10 derniers tous plans confondus). Restaurer un backup
// peut switcher de plan automatiquement (le payload contient planId +
// planName).
//
// Stockage IDB :
//   DB    : "myktamap_backups"
//   store : "backups"
//   key   : "id" (timestamp en ms — unique + chronologique pour tri)
//   value : { id, createdAt, reason, planId, planName, payload }
//
// API publique :
//   window.SessionBackups.init()           — ouvre IDB + démarre timer auto
//   window.SessionBackups.snapshot(reason) — push un snapshot, retourne Promise
//   window.SessionBackups.listAll()        — Promise<Backup[]> triés desc par id
//   window.SessionBackups.restore(id)      — Promise, restaure le backup
//   window.SessionBackups.remove(id)       — Promise, retire un backup
//   window.SessionBackups.clearAll()       — Promise, wipe tout
//   window.SessionBackups.onChange(fn)     — listener (UI refresh)
//
// API d'intégration externe (à câbler dans les flows existants) :
//   - sessionPersist.js > clear() / _viderEtatCourant() : appel snapshot
//     AVANT le wipe pour pouvoir revenir en arrière
//   - main.js > startApp : appel snapshot après restore si session non vide
//   - Plan switcher : appel snapshot avant load nouveau plan
//   - Boutons reset (interface.js > _confResetSession, _bouton purge all) :
//     idem appel snapshot avant la purge

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

  // ─────────────────────────────────────────────
  // IDB plumbing
  // ─────────────────────────────────────────────
  function _openDB() {
    return new Promise(function(resolve, reject) {
      if (_db) { resolve(_db); return; }
      if (!window.indexedDB) {
        reject(new Error("IndexedDB indisponible"));
        return;
      }
      const req = window.indexedDB.open(DB_NAME, DB_VERSION);
      req.onerror = function() {
        reject(req.error || new Error("Échec ouverture IDB " + DB_NAME));
      };
      req.onsuccess = function() {
        _db = req.result;
        // Auto-reconnect si la DB est fermée par un évent externe
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

  // ─────────────────────────────────────────────
  // Hash simple djb2 (cohérent avec sessionPersist.js)
  // ─────────────────────────────────────────────
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

  // ─────────────────────────────────────────────
  // Listeners
  // ─────────────────────────────────────────────
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

  // ─────────────────────────────────────────────
  // CRUD
  // ─────────────────────────────────────────────
  function listAll() {
    return _tx("readonly").then(function(store) {
      return new Promise(function(resolve, reject) {
        const req = store.getAll();
        req.onsuccess = function() {
          const arr = (req.result || []).slice();
          // Tri DESC par createdAt (= id, qui est aussi un timestamp)
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

  // Rotation FIFO : si on dépasse MAX, supprime les plus anciens.
  function _enforceLimit() {
    return listAll().then(function(arr) {
      if (arr.length <= MAX) return null;
      const toDelete = arr.slice(MAX); // après tri DESC, ceux au-delà du 10e
      return Promise.all(toDelete.map(function(e) { return remove(e.id); }));
    });
  }

  // ─────────────────────────────────────────────
  // Snapshot
  // ─────────────────────────────────────────────
  function _readCurrentSessionPayload() {
    // On lit le payload depuis SessionPersist qui maintient déjà la dernière
    // version sauvée dans localStorage. Si pas de SessionPersist OU pas de
    // payload → on lit directement la clé localStorage utilisée par
    // SessionPersist (key "myktamap_session_v1").
    try {
      if (window.SessionPersist && typeof window.SessionPersist.getSaved === "function") {
        return window.SessionPersist.getSaved();
      }
      const raw = localStorage.getItem("myktamap_session_v1");
      if (!raw) return null;
      return JSON.parse(raw);
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
    // Légende personnalisée : on ne considère pas comme "contenu" pour le
    // snapshot — un user qui n'a fait que customiser la légende ne génère
    // pas un backup utile.
    return ept && ert && ezt && est && emt && ems;
  }

  function snapshot(reason) {
    const payload = _readCurrentSessionPayload();
    if (_isPayloadEmpty(payload)) {
      // Pas de contenu → pas de snapshot (gaspillage IDB)
      return Promise.resolve(null);
    }
    const h = _hash(payload);
    if (h === _hashLastSnapshot) {
      // Aucun changement depuis le dernier snapshot → skip pour ne pas
      // remplir les 10 slots avec des duplicates.
      return Promise.resolve(null);
    }
    const entry = {
      id:        Date.now(),
      createdAt: Date.now(),
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
      })
      .catch(function(err) {
        console.warn("[SessionBackups] snapshot échec :", err);
        return null;
      });
  }

  // ─────────────────────────────────────────────
  // Restore
  // ─────────────────────────────────────────────
  //
  // Stratégie : on écrit le payload du backup dans localStorage
  // (myktamap_session_v1) PUIS on demande à l'utilisateur de recharger
  // la page. SessionPersist se chargera de restaurer au prochain boot.
  //
  // Pourquoi pas restaurer en live : le restore implique de SWITCHER de
  // plan (si le backup est d'un autre plan), de réinitialiser les
  // structures Leaflet, etc. → trop complexe, fragile. Un simple
  // location.reload après écriture localStorage est robuste et utilise
  // la pipeline standard de boot.
  function restore(id) {
    return _tx("readonly").then(function(store) {
      return new Promise(function(resolve, reject) {
        const req = store.get(id);
        req.onsuccess = function() {
          if (!req.result) {
            reject(new Error("Backup introuvable : " + id));
            return;
          }
          resolve(req.result);
        };
        req.onerror = function() { reject(req.error); };
      });
    }).then(function(entry) {
      try {
        localStorage.setItem("myktamap_session_v1", JSON.stringify(entry.payload));
        return { restored: true, entry: entry };
      } catch(e) {
        throw new Error("Écriture localStorage échec : " + e.message);
      }
    });
  }

  // ─────────────────────────────────────────────
  // Auto-snapshot périodique (5 min)
  // ─────────────────────────────────────────────
  function _startTimer() {
    if (_timerId) return;
    _timerId = setInterval(function() {
      snapshot("auto-periodic");
    }, PERIODIC_MS);
  }

  function _stopTimer() {
    if (_timerId) {
      clearInterval(_timerId);
      _timerId = null;
    }
  }

  // ─────────────────────────────────────────────
  // Init
  // ─────────────────────────────────────────────
  let _initialized = false;
  function init() {
    if (_initialized) return Promise.resolve();
    _initialized = true;
    return _openDB().then(function() {
      // Initialise le hash avec ce qui est déjà en cours, pour ne pas
      // recréer un snapshot immédiat sur le même contenu.
      const cur = _readCurrentSessionPayload();
      if (cur && !_isPayloadEmpty(cur)) {
        _hashLastSnapshot = _hash(cur);
      }
      _startTimer();
      // Snapshot final à la fermeture (best effort — sync mode si
      // beforeunload, sinon async)
      window.addEventListener("beforeunload", function() {
        // beforeunload est synchrone, IDB est async → en pratique le
        // snapshot n'a pas le temps de finir. On accepte ce trade-off
        // (le périodique 5 min couvre 99% des cas).
        try { snapshot("beforeunload"); } catch(e) {}
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
    listAll:     listAll,
    restore:     restore,
    remove:      remove,
    clearAll:    clearAll,
    onChange:    onChange,
    // Constantes exposées pour debug
    _DB_NAME:    DB_NAME,
    _MAX:        MAX,
    _PERIODIC_MS: PERIODIC_MS
  };
})();
