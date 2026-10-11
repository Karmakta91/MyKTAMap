/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * https://myktamap.fr — Licence CC BY-NC-SA 4.0
 * Usage commercial interdit sans accord ecrit prealable. Voir LICENSE.
 */

// =========================
// 💾 KtaSessionStore — où vivent les sessions auto-sauvegardées
// =========================
// Les sessions (une par plan) vivaient dans le localStorage
// (`myktamap_session_v1_<planId>`), plafonné à ~5 Mo PAR SITE quel que soit
// l'espace du téléphone : un relevé dense le remplissait, et plus rien ne se
// sauvegardait. Elles vivent désormais dans IndexedDB (base `myktamap_sessions`,
// quota = une part de l'espace libre de l'appareil).
//
// Lecture SYNCHRONE garantie : au démarrage, toutes les sessions sont chargées en
// mémoire (`_cache`) ; les lecteurs (accueil, liaisons, stats, export de profil…)
// gardent leur appel synchrone. L'écriture met à jour la mémoire tout de suite et
// part en IndexedDB en arrière-plan, une écriture à la fois par plan (la plus
// récente gagne, jamais de retour en arrière).
//
// 🩸 Ne jamais perdre la dernière modification à la fermeture : une écriture IDB
// lancée dans `beforeunload` peut ne pas aboutir. Toute écriture FORCÉE (fermeture,
// arrière-plan, changement de plan) et toute écriture encore en vol au `pagehide`
// est doublée d'un TAMPON synchrone en localStorage
// (`myktamap_session_tampon_v1_<planId>`), retiré dès que IDB a confirmé. Au
// démarrage suivant, un tampon plus récent que la copie IDB la remplace.
// Limite : un tampon ne tient que si la session tient dans le localStorage (~5 Mo).
//
// Migration au 1er lancement (décision KARMA 10/10/2026) : chaque session du
// localStorage est copiée en IDB, RELUE et comparée. L'ancienne copie est gardée
// 30 jours puis retirée — sauf si le localStorage est rempli à 90 % ou plus : elle
// est alors retirée dès la copie vérifiée, APRÈS une copie dans 📦 Backups.
// Idempotente (un registre `migration` dit ce qui est déjà copié), reprise si
// interrompue, et jamais de perte si IDB est indisponible : on reste alors en
// localStorage (mode « ls », comportement d'avant).
// Une copie localStorage PLUS RÉCENTE que la copie IDB (démarrage passé en repli
// localStorage, onglet d'une ancienne version) est recopiée, après une copie de
// l'ancienne version IDB dans 📦 Backups.
//
// Navigation incognito de l'app (?incognito=1) : mode « ls » — le localStorage y
// est déjà un leurre en mémoire qui ne lit rien du disque, comme avant.
//
// API : window.KtaSessionStore
//   init()               → Promise (idempotent) : ouvre IDB, charge, migre
//   pret                 → la même Promise
//   mode()               → "attente" | "idb" | "ls"
//   lire(planId)         → JSON brut | null           (synchrone)
//   ecrire(planId, brut, { force }) → true            (synchrone ; en mode « ls »,
//                           l'exception du localStorage remonte, comme avant)
//   ecrireDurable(planId, brut) → Promise<bool>       (attend la confirmation IDB)
//   retirer(planId)      → efface la session (et son ancienne copie localStorage)
//   ids()                → [planId]   ·  taille(planId) → nb de caractères
//   attendre(planId?)    → Promise<bool> : écritures en vol terminées
//   surResultat(fn)      → fn({ planId, ok, erreur, quota }) après chaque écriture IDB
//   estimation()         → { usage, quota } | null (navigator.storage.estimate)
//   actualiserEstimation() → Promise
//   purgerAnciennesCopies({ urgence }) → Promise<nb retirées>
//   etat()               → diagnostic
// =========================

(function () {
  "use strict";

  const DB_NAME = "myktamap_sessions";
  const DB_VERSION = 1;
  const STORE = "sessions";      // { planId, brut, savedAt, ecritLe }
  const STORE_MIG = "migration"; // { planId, le } : copie localStorage → IDB vérifiée
  const PREFIXE_LS = "myktamap_session_v1_";
  const PREFIXE_TAMPON = "myktamap_session_tampon_v1_";
  const GARDE_ANCIENNE_COPIE_MS = 30 * 24 * 3600 * 1000;
  const SEUIL_LS_URGENCE = 0.9;
  const LIMITE_LS = 5000000;
  const DELAI_OUVERTURE_MS = 8000;

  let _mode = "attente";
  let _db = null;
  let _pret = null;
  const _cache = new Map();      // planId → brut
  const _migrees = new Map();    // planId → horodatage de la copie vérifiée
  const _aEcrire = new Map();    // planId → { op: "put"|"del", brut }
  const _enVol = new Map();      // planId → Promise
  const _echec = new Map();      // planId → dernière erreur (absente = dernière écriture OK)
  const _ecouteurs = [];
  let _estim = null;
  let _estimTs = 0;
  let _bc = null;

  function _log() { try { console.log.apply(console, ["[SessionStore]"].concat([].slice.call(arguments))); } catch (e) { /* rien */ } }
  function _warn() { try { console.warn.apply(console, ["[SessionStore]"].concat([].slice.call(arguments))); } catch (e) { /* rien */ } }

  function _savedAt(brut) {
    if (!brut) return 0;
    try { const o = JSON.parse(brut); return (o && Date.parse(o.savedAt)) || 0; } catch (e) { return 0; }
  }

  function _estQuota(e) {
    return !!e && (e.name === "QuotaExceededError" || e.name === "NS_ERROR_DOM_QUOTA_REACHED" ||
      e.code === 22 || e.code === 1014 || /quota/i.test(e.message || ""));
  }

  // ── localStorage (mode « ls », et lecture en attendant l'init) ──
  function _lsCles(prefixe) {
    const out = [];
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.indexOf(prefixe) === 0 && k.length > prefixe.length) out.push(k);
      }
    } catch (e) { /* stockage inaccessible */ }
    return out;
  }
  function _lsLire(cle) { try { return localStorage.getItem(cle); } catch (e) { return null; } }
  function _lsRetirer(cle) { try { localStorage.removeItem(cle); } catch (e) { /* rien */ } }
  function _lsRatio() {
    let car = 0;
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i) || "";
        car += k.length + (localStorage.getItem(k) || "").length;
      }
    } catch (e) { return 0; }
    return car / LIMITE_LS;
  }

  // ── IndexedDB ──
  function _ouvrir() {
    return new Promise(function (resoudre, rejeter) {
      if (_db) { resoudre(_db); return; }
      let req;
      try {
        if (!window.indexedDB) throw new Error("IndexedDB indisponible");
        req = window.indexedDB.open(DB_NAME, DB_VERSION);
      } catch (e) { rejeter(e); return; }
      req.onupgradeneeded = function () {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "planId" });
        if (!db.objectStoreNames.contains(STORE_MIG)) db.createObjectStore(STORE_MIG, { keyPath: "planId" });
      };
      req.onsuccess = function () {
        _db = req.result;
        // « Tout réinitialiser » supprime la base : on lâche la connexion au lieu de bloquer.
        _db.onversionchange = function () { try { _db.close(); } catch (e) { /* rien */ } _db = null; };
        _db.onclose = function () { _db = null; };
        resoudre(_db);
      };
      req.onerror = function () { rejeter(req.error || new Error("ouverture " + DB_NAME)); };
      req.onblocked = function () { rejeter(new Error("ouverture " + DB_NAME + " bloquée")); };
    });
  }

  function _tx(stores, mode, travail) {
    return _ouvrir().then(function (db) {
      return new Promise(function (resoudre, rejeter) {
        let tx, res;
        try {
          tx = db.transaction(stores, mode);
          res = travail(tx);
        } catch (e) { rejeter(e); return; }
        tx.oncomplete = function () { resoudre(res && typeof res === "object" && "valeur" in res ? res.valeur : res); };
        tx.onerror = function () { rejeter(tx.error || new Error("transaction")); };
        tx.onabort = function () { rejeter(tx.error || new Error("transaction annulée")); };
      });
    });
  }

  function _toutLire(store) {
    return _tx([store], "readonly", function (tx) {
      const box = { valeur: [] };
      const req = tx.objectStore(store).getAll();
      req.onsuccess = function () { box.valeur = req.result || []; };
      return box;
    });
  }

  function _idbPut(planId, brut) {
    return _tx([STORE], "readwrite", function (tx) {
      tx.objectStore(STORE).put({ planId: planId, brut: brut, savedAt: _savedAt(brut), ecritLe: Date.now() });
    });
  }
  function _idbDel(planId) {
    return _tx([STORE, STORE_MIG], "readwrite", function (tx) {
      tx.objectStore(STORE).delete(planId);
      tx.objectStore(STORE_MIG).delete(planId);
    });
  }
  function _idbLireUn(planId) {
    return _tx([STORE], "readonly", function (tx) {
      const box = { valeur: null };
      const req = tx.objectStore(STORE).get(planId);
      req.onsuccess = function () { box.valeur = req.result ? req.result.brut : null; };
      return box;
    });
  }
  function _idbMigree(planId, le) {
    return _tx([STORE_MIG], "readwrite", function (tx) {
      if (le) tx.objectStore(STORE_MIG).put({ planId: planId, le: le });
      else tx.objectStore(STORE_MIG).delete(planId);
    });
  }

  // Écrit puis RELIT dans une autre transaction : la copie n'est « vérifiée » que si
  // le texte relu est identique, caractère pour caractère.
  function _copierVerifie(planId, brut) {
    return _idbPut(planId, brut).then(function () { return _idbLireUn(planId); }).then(function (relu) {
      if (relu !== brut) throw new Error("copie IDB différente à la relecture (" + planId + ")");
      _cache.set(planId, brut);
      return true;
    });
  }

  // ── Tampon de fermeture ──
  function _tamponner(planId) {
    const brut = _cache.get(planId);
    if (brut == null) { _lsRetirer(PREFIXE_TAMPON + planId); return; }
    try { localStorage.setItem(PREFIXE_TAMPON + planId, brut); }
    catch (e) { /* trop gros pour le localStorage : seule l'écriture IDB en vol protège cette modification */ }
  }
  function _tamponnerEnVol() {
    if (_mode !== "idb") return;
    const ids = new Set([].concat(Array.from(_enVol.keys()), Array.from(_aEcrire.keys())));
    ids.forEach(_tamponner);
  }

  // ── File d'écriture (une transaction à la fois par plan, la plus récente gagne) ──
  function _notifier(r) {
    _ecouteurs.forEach(function (fn) { try { fn(r); } catch (e) { _warn("écouteur :", e); } });
  }
  function _lancer(planId) {
    const op = _aEcrire.get(planId);
    if (!op) return;
    _aEcrire.delete(planId);
    const p = (op.op === "del" ? _idbDel(planId) : _idbPut(planId, op.brut)).then(function () {
      _echec.delete(planId);
      return { ok: true };
    }, function (e) {
      _echec.set(planId, e);
      return { ok: false, erreur: e };
    }).then(function (r) {
      _enVol.delete(planId);
      if (_aEcrire.has(planId)) { _lancer(planId); }
      else if (r.ok) {
        _lsRetirer(PREFIXE_TAMPON + planId);
        if (_bc) { try { _bc.postMessage({ planId: planId }); } catch (e) { /* rien */ } }
      }
      if (!r.ok) _warn("écriture échouée (" + planId + ") :", r.erreur);
      _notifier({ planId: planId, ok: r.ok, erreur: r.erreur || null, quota: !r.ok && _estQuota(r.erreur) });
      if (r.ok) _actualiserEstimationParfois();
      return r.ok;
    });
    _enVol.set(planId, p);
  }
  function _planifier(planId, op) {
    _aEcrire.set(planId, op);
    if (!_enVol.has(planId) && _mode === "idb") _lancer(planId);
  }

  // ── API ──
  function mode() { return _mode; }

  function lire(planId) {
    if (!planId) return null;
    if (_mode === "idb") return _cache.has(planId) ? _cache.get(planId) : null;
    if (_mode === "attente" && _cache.has(planId)) return _cache.get(planId);
    return _lsLire(PREFIXE_LS + planId);
  }

  function ids() {
    if (_mode === "idb") return Array.from(_cache.keys());
    const s = new Set(_lsCles(PREFIXE_LS).map(function (k) { return k.slice(PREFIXE_LS.length); }));
    if (_mode === "attente") _cache.forEach(function (v, k) { s.add(k); });
    return Array.from(s);
  }

  function taille(planId) {
    const b = lire(planId);
    return b ? b.length : 0;
  }

  function ecrire(planId, brut, opts) {
    if (!planId || typeof brut !== "string") return false;
    if (_mode === "ls") {
      localStorage.setItem(PREFIXE_LS + planId, brut);   // QuotaExceededError remonte à l'appelant, comme avant
      return true;
    }
    _cache.set(planId, brut);
    if (opts && opts.force) _tamponner(planId);
    _planifier(planId, { op: "put", brut: brut });       // en attente : partira à la fin de l'init
    return true;
  }

  function retirer(planId) {
    if (!planId) return;
    _lsRetirer(PREFIXE_TAMPON + planId);
    if (_mode === "ls") { _lsRetirer(PREFIXE_LS + planId); return; }
    _cache.delete(planId);
    _migrees.delete(planId);
    // L'ancienne copie localStorage part avec : sinon la migration la ressusciterait.
    _lsRetirer(PREFIXE_LS + planId);
    _planifier(planId, { op: "del" });
  }

  function attendre(planId) {
    if (_mode === "ls") return Promise.resolve(true);
    const liste = planId ? [planId] : Array.from(new Set([].concat(Array.from(_enVol.keys()), Array.from(_aEcrire.keys()))));
    return Promise.all(liste.map(function un(id) {
      if (_enVol.has(id)) return _enVol.get(id).then(function () { return un(id); });
      if (_aEcrire.has(id)) {
        if (_mode !== "attente") _lancer(id);
        return init().then(function () { return _enVol.has(id) || _aEcrire.has(id) ? un(id) : !_echec.has(id); });
      }
      return !_echec.has(id);
    })).then(function (r) { return r.every(Boolean); });
  }

  function ecrireDurable(planId, brut) {
    try { ecrire(planId, brut); } catch (e) { return Promise.reject(e); }
    return attendre(planId).then(function (ok) {
      if (!ok) throw (_echec.get(planId) || new Error("écriture de la session refusée"));
      return true;
    });
  }

  function surResultat(fn) { if (typeof fn === "function") _ecouteurs.push(fn); }

  function estimation() { return _estim; }
  function actualiserEstimation() {
    if (navigator.storage && typeof navigator.storage.estimate === "function") {
      // Le refus éventuel est rattrapé par .catch : la promesse rend toujours la dernière estimation connue.
      return navigator.storage.estimate().then(function (e) {
        if (e && e.quota > 0) { _estim = { usage: e.usage || 0, quota: e.quota }; _estimTs = Date.now(); }
        return _estim;
      }).catch(function () { return _estim; });
    }
    return Promise.resolve(_estim);
  }
  function _actualiserEstimationParfois() {
    if (Date.now() - _estimTs > 30000) actualiserEstimation();
  }

  function _backup(brut, raison) {
    const SB = window.SessionBackups;
    if (!SB || typeof SB.snapshotPayload !== "function") return Promise.resolve(false);
    let p;
    try { p = JSON.parse(brut); } catch (e) { return Promise.resolve(false); }
    return Promise.resolve(SB.snapshotPayload(p, raison)).then(Boolean).catch(function () { return false; });
  }

  // Ancienne copie localStorage d'une session migrée : retirée à 30 jours, ou tout de
  // suite (après un Backup) si le localStorage est presque plein. Jamais si la copie
  // IDB n'est pas au moins aussi récente.
  function purgerAnciennesCopies(opts) {
    if (_mode !== "idb") return Promise.resolve(0);
    const urgence = !!(opts && opts.urgence) || _lsRatio() >= SEUIL_LS_URGENCE;
    let n = 0;
    return _lsCles(PREFIXE_LS).reduce(function (chaine, cle) {
      return chaine.then(function () {
        const id = cle.slice(PREFIXE_LS.length);
        const le = _migrees.get(id);
        if (!le) return null;
        const ancien = _lsLire(cle);
        const actuel = _cache.get(id);
        if (ancien == null || actuel == null) return null;
        if (!(actuel === ancien || _savedAt(actuel) >= _savedAt(ancien))) return null;
        const fin = function () {
          _lsRetirer(cle); n++;
          _migrees.delete(id);
          return _idbMigree(id, null).catch(function () { /* registre : sans gravité */ });
        };
        if (Date.now() - le >= GARDE_ANCIENNE_COPIE_MS) return fin();
        if (!urgence) return null;
        return _backup(ancien, "migration-idb").then(function (ok) { return ok ? fin() : null; });
      });
    }, Promise.resolve()).then(function () {
      if (n) _log(n + " ancienne(s) copie(s) localStorage retirée(s)" + (urgence ? " (localStorage presque plein, Backup fait)" : " (30 jours)"));
      return n;
    });
  }

  // ── Migration et reprise au démarrage ──
  function _migrer() {
    const lsRatio = _lsRatio();
    const cles = _lsCles(PREFIXE_LS);
    let copiees = 0;
    return cles.reduce(function (chaine, cle) {
      return chaine.then(function () {
        const id = cle.slice(PREFIXE_LS.length);
        const brut = _lsLire(cle);
        if (!brut) return null;
        const actuel = _cache.get(id);
        if (actuel === brut) {
          if (!_migrees.has(id)) { _migrees.set(id, Date.now()); return _idbMigree(id, _migrees.get(id)); }
          return null;
        }
        if (actuel == null) {
          if (_migrees.has(id)) {
            // Copiée PUIS effacée (plan retiré) : l'ancienne copie ne revient pas.
            _lsRetirer(cle); _migrees.delete(id);
            return _idbMigree(id, null);
          }
          return _copierVerifie(id, brut).then(function () {
            copiees++; _migrees.set(id, Date.now()); return _idbMigree(id, _migrees.get(id));
          });
        }
        // Les deux existent et diffèrent : la plus récente gagne.
        if (_savedAt(brut) > _savedAt(actuel)) {
          return _backup(actuel, "avant-reprise-ls").then(function () { return _copierVerifie(id, brut); }).then(function () {
            copiees++; _migrees.set(id, Date.now()); return _idbMigree(id, _migrees.get(id));
          });
        }
        if (!_migrees.has(id)) { _migrees.set(id, Date.now()); return _idbMigree(id, _migrees.get(id)); }
        return null;
      });
    }, Promise.resolve()).then(function () {
      if (copiees) _log(copiees + " session(s) copiée(s) du localStorage vers IndexedDB et vérifiée(s)" +
        (lsRatio >= SEUIL_LS_URGENCE ? " — localStorage à " + Math.round(lsRatio * 100) + " %" : ""));
    });
  }

  function _reprendreTampons() {
    return _lsCles(PREFIXE_TAMPON).reduce(function (chaine, cle) {
      return chaine.then(function () {
        const id = cle.slice(PREFIXE_TAMPON.length);
        const brut = _lsLire(cle);
        const actuel = _cache.get(id);
        if (brut && (actuel == null || (brut !== actuel && _savedAt(brut) >= _savedAt(actuel)))) {
          return _copierVerifie(id, brut).then(function () {
            _log("dernière modification d'avant la fermeture récupérée (" + id + ")");
            _lsRetirer(cle);
          });
        }
        _lsRetirer(cle);
        return null;
      });
    }, Promise.resolve());
  }

  function _basculerLs(raison) {
    _mode = "ls";
    _warn("sessions gardées dans le localStorage (" + raison + ")");
    // Écritures arrivées pendant l'attente : vers le localStorage.
    _aEcrire.forEach(function (op, id) {
      try {
        if (op.op === "del") _lsRetirer(PREFIXE_LS + id);
        else localStorage.setItem(PREFIXE_LS + id, op.brut);
      } catch (e) { _warn("écriture en attente perdue (" + id + ") :", e); }
    });
    _aEcrire.clear();
    _cache.clear();
  }

  function init() {
    if (_pret) return _pret;
    if (window.IncognitoMode && window.IncognitoMode.active) {
      _basculerLs("mode incognito : rien n'est lu ni écrit sur le disque");
      _pret = Promise.resolve();
      return _pret;
    }
    let delai = null;
    const ouverture = new Promise(function (resoudre, rejeter) {
      delai = setTimeout(function () { rejeter(new Error("IndexedDB ne répond pas")); }, DELAI_OUVERTURE_MS);
      _ouvrir().then(resoudre, rejeter);
    });
    _pret = ouverture.then(function () {
      clearTimeout(delai);
      return Promise.all([_toutLire(STORE), _toutLire(STORE_MIG)]);
    }).then(function (r) {
      // Écritures arrivées pendant l'attente : elles priment sur le disque.
      r[0].forEach(function (x) { if (x && x.planId && typeof x.brut === "string" && !_aEcrire.has(x.planId)) _cache.set(x.planId, x.brut); });
      r[1].forEach(function (x) { if (x && x.planId) _migrees.set(x.planId, x.le || Date.now()); });
      return _reprendreTampons();
    }).then(_migrer).then(function () {
      _mode = "idb";
      Array.from(_aEcrire.keys()).forEach(function (id) { if (!_enVol.has(id)) _lancer(id); });
      try {
        if (typeof BroadcastChannel === "function") {
          _bc = new BroadcastChannel("myktamap-sessions");
          // Un autre onglet a écrit : on relit, sauf si on a soi-même une écriture en cours pour ce plan.
          _bc.onmessage = function (ev) {
            const id = ev && ev.data && ev.data.planId;
            if (!id || _enVol.has(id) || _aEcrire.has(id)) return;
            _idbLireUn(id).then(function (brut) {
              if (_enVol.has(id) || _aEcrire.has(id)) return;
              if (brut == null) _cache.delete(id); else _cache.set(id, brut);
            }).catch(function () { /* rien */ });
          };
        }
      } catch (e) { /* rien */ }
      _log("prêt — " + _cache.size + " session(s) en IndexedDB");
      return actualiserEstimation();
    }).catch(function (e) {
      clearTimeout(delai);
      // Une copie non vérifiée ne compte pas : le localStorage reste la vérité, rien n'est retiré.
      _basculerLs(e && e.message ? e.message : String(e));
    }).then(function () {
      // Hors de la chaîne de démarrage : le Backup d'urgence peut prendre du temps.
      purgerAnciennesCopies().catch(function (e) { _warn("purge des anciennes copies :", e); });
    });
    return _pret;
  }

  function etat() {
    return {
      mode: _mode, sessions: ids().length, migrees: _migrees.size,
      anciennesCopies: _lsCles(PREFIXE_LS).length, tampons: _lsCles(PREFIXE_TAMPON).length,
      enVol: _enVol.size + _aEcrire.size, estimation: _estim
    };
  }

  // Fermeture / arrière-plan : tout ce qui n'est pas confirmé part aussi en tampon synchrone.
  window.addEventListener("pagehide", _tamponnerEnVol);
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "hidden") _tamponnerEnVol();
  });
  // localStorage plein : les anciennes copies (déjà vérifiées en IDB) sont les premières à partir.
  window.addEventListener("mktm:stockage-plein", function () {
    if (_mode === "idb") purgerAnciennesCopies({ urgence: true });
  });

  window.KtaSessionStore = {
    init: init,
    get pret() { return init(); },
    mode: mode,
    lire: lire,
    ecrire: ecrire,
    ecrireDurable: ecrireDurable,
    retirer: retirer,
    ids: ids,
    taille: taille,
    attendre: attendre,
    surResultat: surResultat,
    estimation: estimation,
    actualiserEstimation: actualiserEstimation,
    purgerAnciennesCopies: purgerAnciennesCopies,
    etat: etat,
    PREFIXE_LS: PREFIXE_LS,
    DB_NAME: DB_NAME
  };
})();
