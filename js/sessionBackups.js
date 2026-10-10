/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * https://myktamap.fr — Licence CC BY-NC-SA 4.0
 * Usage commercial interdit sans accord ecrit prealable. Voir LICENSE.
 */

// =========================
// 📦 SessionBackups (v1.16.0 step 4)
// =========================
//
// Filet de sécurité : conserve les 10 dernières sauvegardes de session
// PAR PLAN (📦 v1.79.3 — avant : 10 GLOBAL, un plan actif purgeait
// l'historique des autres) dans IndexedDB (rotation FIFO). Permet de
// revenir en arrière si l'user
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
// Portée : PAR PLAN depuis v1.79.3 (10 derniers par planId ; avant : 10
// global tous plans confondus). Restaurer un backup
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
        reject(req.error || new Error(window.I18n.t("backup.err_idb_open", { db: DB_NAME })));
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
  // 📦 v1.79.3 (décision KARMA — reco 1:a) — FIFO PAR PLAN et non plus
  // global : avant, 10 snapshots TOUS PLANS CONFONDUS — un plan très
  // utilisé purgeait l'historique des autres. Désormais chaque plan garde
  // ses 10 derniers (les backups sans planId — legacy — tournent entre eux).
  // On ne passe PAS en illimité : croissance sans borne = pression quota →
  // éviction SILENCIEUSE par le navigateur (la leçon des blobs ZIP évincés).
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

  // 🧹 v1.79.3 — supprime TOUS les backups d'un plan (purge à la suppression
  // du plan depuis la modale ℹ️ Infos, + nettoyeur d'orphelins).
  function deleteForPlan(planId) {
    if (!planId) return Promise.resolve(0);
    return listAll().then(function(arr) {
      const cibles = arr.filter(function(e) { return e.planId === planId; });
      return Promise.all(cibles.map(function(e) { return remove(e.id); }))
        .then(function() { return cibles.length; });
    });
  }

  // ─────────────────────────────────────────────
  // Snapshot
  // ─────────────────────────────────────────────
  function _readCurrentSessionPayload() {
    // On lit le payload depuis SessionPersist qui maintient déjà la dernière
    // version sauvée dans localStorage. 🆕 v1.16.1 — SessionPersist utilise
    // désormais des slots PAR PLAN (myktamap_session_v1_<planId>) au lieu
    // d'un slot unique. getSaved() sans argument lit le slot du plan
    // courant — exactement ce qu'on veut snapshotter ici.
    try {
      if (window.SessionPersist && typeof window.SessionPersist.getSaved === "function") {
        return window.SessionPersist.getSaved();
      }
      // Fallback ultra-défensif si SessionPersist pas chargé. On scan les
      // clés par préfixe pour trouver le slot du plan courant si possible.
      const planId = window._currentLoadedPlanId || null;
      if (planId) {
        const raw = localStorage.getItem("myktamap_session_v1_" + planId);
        if (raw) return JSON.parse(raw);
      }
      // Legacy slot (avant migration v1.16.1) — peut encore exister au
      // tout 1er boot post-update si _migrerAncienSlotUniqueSiBesoin
      // n'a pas encore tourné.
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
    // 🆕 v1.21.2 (KARMA "on active dans la sauvegarde auto le tracking") :
    // la timeline tracker GPS compte comme contenu — un user qui a fait
    // une session de tracking sans annoter génère quand même un backup
    // utile (la heatmap multi-sessions le consommera).
    const etk = !payload.trackerTimeline || payload.trackerTimeline.length === 0;
    // Légende personnalisée : on ne considère pas comme "contenu" pour le
    // snapshot — un user qui n'a fait que customiser la légende ne génère
    // pas un backup utile.
    return ept && ert && ezt && est && emt && ems && etk;
  }

  function snapshot(reason) {
    const payload = _readCurrentSessionPayload();
    if (_isPayloadEmpty(payload)) {
      // Pas de contenu → pas de snapshot (gaspillage IDB)
      return Promise.resolve(null);
    }
    const h = _hash(payload);
    if (h === _hashLastSnapshot) {
      // Aucun changement depuis le dernier snapshot in-memory → skip
      // pour ne pas remplir les 10 slots avec des duplicates.
      return Promise.resolve(null);
    }

    // 🆕 v1.20.0 — Skip aussi si le hash matche le DERNIER SNAPSHOT IDB
    // du même plan. Cas typique : boot-pre-restore après un reload sans
    // modif → `_hashLastSnapshot` est null (in-memory reset au load) MAIS
    // le snapshot IDB le plus récent du même plan a le même hash que la
    // session restaurée. Économie : 1 boot identique = 0 nouveau slot
    // FIFO consommé. Sans cette optim, un user qui ouvre/ferme la PWA
    // 10 fois sans modif voit ses 10 derniers snapshots rotated en
    // duplicates inutiles.
    return _getLastSnapshotForPlan(payload.planId).then(function(lastPersisted) {
      if (lastPersisted && _hash(lastPersisted.payload) === h) {
        // Identique au dernier persisté du même plan → skip + sync mémoire
        _hashLastSnapshot = h;
        if (window.APP_CONFIG && window.APP_CONFIG.debugMode) {
          console.log("[SessionBackups] Skip snapshot (hash identique au dernier IDB du plan)", payload.planId);
        }
        return null;
      }
      // Vraie modif depuis le dernier snapshot persisté → créer l'entry
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
        });
    }).catch(function(err) {
      console.warn("[SessionBackups] snapshot échec :", err);
      return null;
    });
  }

  // 🆕 v1.20.0 — Récupère le snapshot le plus récent (= id le plus grand)
  // pour un planId donné. Utilisé par snapshot() pour skip-if-identical.
  // Retourne `null` si aucun snapshot pour ce plan ou si planId vide.
  function _getLastSnapshotForPlan(planId) {
    if (!planId) return Promise.resolve(null);
    return listAll().then(function(arr) {
      // listAll() est déjà trié desc par id (cf doc en tête), donc le 1er
      // matching planId est le plus récent.
      for (let i = 0; i < arr.length; i++) {
        if (arr[i].planId === planId) return arr[i];
      }
      return null;
    }).catch(function(e) {
      console.warn("[SessionBackups] _getLastSnapshotForPlan échec :", e);
      return null;
    });
  }

  // ─────────────────────────────────────────────
  // Restore
  // ─────────────────────────────────────────────
  //
  // Stratégie : on écrit le payload du backup dans le slot per-plan
  // localStorage (myktamap_session_v1_<planId>) PUIS on demande à
  // l'utilisateur de recharger la page. SessionPersist se charge de
  // restaurer au prochain boot.
  //
  // 🆕 v1.16.1 — Bonus : si le backup vient d'un AUTRE plan que celui
  // actuellement chargé, on force `PlanRegistry.lastPlanId` au planId
  // du backup pour que l'app boote sur le bon plan au reload. Sinon
  // l'app rouvrait le plan courant et ignorait le slot du plan du
  // backup → user voyait "rien restauré".
  //
  // Pourquoi pas restaurer en live : le restore implique de SWITCHER de
  // plan, de réinitialiser les structures Leaflet, etc. → trop complexe,
  // fragile. Un simple location.reload après écriture localStorage est
  // robuste et utilise la pipeline standard de boot.
  // opts.versPlanId / opts.versPlanName (10/10/2026) : restaurer DANS le plan ouvert une copie prise sous un
  // autre identifiant (même plan, autre version : réimport « Garder les deux », nom changé). Sans eux, la copie
  // retournait sous son identifiant d'origine — sur l'ancienne entrée du plan, pas celle qu'on regarde.
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
      try {
        // 🆕 v1.16.1 : slot per-plan
        localStorage.setItem(
          "myktamap_session_v1_" + targetPlanId,
          JSON.stringify(entry.payload)
        );
        // Session remplacée par une ancienne : une installation reliée relira tout (no-op sinon).
        try { window.dispatchEvent(new CustomEvent("mktm:session-cleared", { detail: { planId: targetPlanId, restauration: true } })); } catch(e) {}
        // 🆕 v1.16.1 : force PlanRegistry.lastPlanId pour que l'app
        // rouvre le bon plan au reload. Si le backup vient du plan
        // actuellement chargé → no-op (déjà à la bonne valeur).
        if (window.PlanRegistry && typeof window.PlanRegistry.setLastPlanId === "function") {
          try { window.PlanRegistry.setLastPlanId(targetPlanId); } catch(e) {
            console.warn("[SessionBackups] PlanRegistry.setLastPlanId échec :", e);
          }
        }
        return { restored: true, entry: entry };
      } catch(e) {
        throw new Error(window.I18n.t("backup.err_ls_write", { msg: e.message }));
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
        // Erreur synchrone (lecture de la session) comme rejet d'IDB : tout finit dans le .catch. L'exécuteur
        // d'une Promise est synchrone : le snapshot démarre tout de suite, pas une microtâche plus tard.
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
    listAll:     listAll,
    restore:     restore,
    remove:      remove,
    deleteForPlan: deleteForPlan,  // 🧹 v1.79.3 — purge tous les backups d'un plan
    clearAll:    clearAll,
    onChange:    onChange,
    // Constantes exposées pour debug
    _DB_NAME:    DB_NAME,
    _MAX:        MAX,
    _PERIODIC_MS: PERIODIC_MS
  };
})();
