/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * https://myktamap.fr — Licence CC BY-NC-SA 4.0
 * Usage commercial interdit sans accord ecrit prealable. Voir LICENSE.
 */
// journal.js — Carnet d'exploration : archive des sorties

// =========================
// JOURNAL.JS — le Carnet : archive append-only des sorties
// =========================
// Indépendant des sessions (sessionPersist = état live écrasé, sessionBackups = rotation FIFO) : une
// session effacée ne détruit pas la sortie archivée. Archivage auto au teardown (seuils), clôture
// manuelle, démarrage manuel, note éditable. Contenu : métadonnées, compteurs, REFS photos (pas d'image
// copiée : une photo supprimée devient « photo manquante »), tracé tracker décimé.
// Cycle : main.js > lancerApplication → onPlanLoaded (baseline APRÈS restauration de session) ; flush IDB
//   toutes les 30 s + au passage en arrière-plan ; main.js > _libererRessourcesPlanPrecedent →
//   onPlanUnload = SUSPENSION (après SessionPersist.onPlanUnload, avant le teardown de la timeline).
// Temps actif : onglet caché non compté, deltas > 5 min ignorés ; `activeMs` ≠ `wallMs` (fin − début).
// 🚶 terrain / 🖥️ bureau : classement auto par le déplacement, corrigeable (`typeManuel`, figé) ;
//   les totaux ne comptent que le terrain.
// IDB `myktamap_journal` v1, store `sorties` (keyPath id, index by_start), ~2-8 Ko par sortie. 100 % local.
// Expose window.Journal : onPlanLoaded, onPlanUnload, onPhotoAdded, demarrer, cloturer, getCurrent, list,
//   get, remove, setNote, setType, setFin, fusionner, dureeMs, affinerEnCours, stats, isEnabled/setEnabled.
// Garde-fous : scripts/check-journal-demarrage.js, scripts/check-journal-reprise.js
// Doc : docs/architecture/session-data.md
// =========================

(function() {
  "use strict";

  const DB_NAME    = "myktamap_journal";
  const DB_VERSION = 1;
  const STORE      = "sorties";
  const SCHEMA     = 1;

  // 30 s : un kill mémoire iOS ne coûte qu'une demi-minute, sans concurrencer le poller session (1,5 s).
  const FLUSH_MS = 30000;

  // Deux natures de session, séparées par le TRACKER (seul signal fiable) : "terrain" = déplacement
  // (distance ou pas PDR), "bureau" = annotations seules. Auto, corrigeable (`typeManuel` jamais recalculé).
  const TYPE_TERRAIN = "terrain";
  const TYPE_BUREAU  = "bureau";

  // Seuils d'archivage AUTOMATIQUE (la clôture manuelle garde toujours) : un plan ouvert 20 s pour
  // vérifier un détail ne pollue pas le carnet.
  const MIN_DIST_M            = 50;               // terrain : 50 m parcourus
  const MIN_BUREAU_ACTIVE_MS  = 10 * 60 * 1000;   // bureau : 10 min actives…
  const MIN_BUREAU_AJOUTS     = 1;                // …ET au moins un ajout

  // Seuil de BASCULE en terrain (≠ seuils de rétention) : un pas PDR parasite ne fait pas d'une soirée de
  // dessin une sortie (les totaux ne comptent que le terrain). 20 m = on a vraiment marché.
  const MIN_TERRAIN_DIST_M = 20;

  const MAX_TICK_MS = 5 * 60 * 1000;

  // 🩸 REPRISE D'UNE SORTIE INTERROMPUE : quitter la PWA (musique, appel) la fait décharger par iOS et le
  // reboot ouvrirait une NOUVELLE sortie (une vraie sortie en trois morceaux). Le signal de reprise n'est
  // PAS le délai seul mais `closedBy: "crash"` — posé par le balayage sur une sortie restée `encours`,
  // donc seulement quand l'app a été tuée. Une sortie clôturée à la main n'est jamais recollée. Le délai
  // n'est qu'une borne de bon sens.
  const REPRISE_MS = 45 * 60 * 1000;

  // Changement de plan = SUSPENSION (`status: "suspendue"`), sans filtre de pertinence : on peut montrer
  // un autre plan puis revenir, la sortie reprend dans le délai ; au-delà, finalisée (_expirerSuspendues).
  // Au plus UNE suspendue par plan, plusieurs plans chacun la leur : sinon revenir de B vers A
  // suspendrait B et FINALISERAIT A. 2 h (décision produit).
  const SUSPENSION_MS = 2 * 60 * 60 * 1000;   // 2 h (décision produit)

  const MAX_TRACK_PTS = 1500;   // décimation du tracé archivé
  const MAX_SORTIES   = 500;    // garde-fou quota : purge FIFO au-delà

  const LS_ENABLED = "myktamap_journal_enabled";   // "0" = carnet désactivé

  // ── État RAM ──

  let _cur        = null;   // sortie en cours (objet record) ou null
  let _baseline   = null;   // compteurs au démarrage de la sortie
  let _flushTimer = null;
  let _lastTick   = null;   // null = onglet caché (comptage suspendu)
  let _photoIds   = [];     // refs photos ajoutées pendant la sortie

  // ── Helpers ──

  function _now() { return Date.now(); }

  function isEnabled() {
    try { return localStorage.getItem(LS_ENABLED) !== "0"; } catch(e) { return true; }
  }
  function setEnabled(on) {
    try { localStorage.setItem(LS_ENABLED, on ? "1" : "0"); } catch(e) {}
    if (!on && _cur) { _stopTimer(); _cur = null; _baseline = null; _photoIds = []; }
    return isEnabled();
  }

  function _genId() {
    return "srt_" + _now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
  }

  // ── IDB ──

  function _openDb() {
    return new Promise(function(resolve, reject) {
      let req;
      try { req = indexedDB.open(DB_NAME, DB_VERSION); }
      catch(e) { reject(e); return; }
      req.onupgradeneeded = function(e) {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE)) {
          const st = db.createObjectStore(STORE, { keyPath: "id" });
          st.createIndex("by_start", "startedAtMs", { unique: false });
        }
      };
      req.onsuccess = function() { resolve(req.result); };
      req.onerror   = function() { reject(req.error); };
    });
  }

  function _tx(mode, fn) {
    return _openDb().then(function(db) {
      return new Promise(function(resolve, reject) {
        let out;
        let tx;
        try { tx = db.transaction([STORE], mode); }
        catch(e) { try { db.close(); } catch(e2) {} reject(e); return; }
        tx.oncomplete = function() { try { db.close(); } catch(e) {} resolve(out); };
        tx.onerror    = function() { try { db.close(); } catch(e) {} reject(tx.error); };
        tx.onabort    = function() { try { db.close(); } catch(e) {} reject(tx.error); };
        try { out = fn(tx.objectStore(STORE)); }
        catch(e) { try { tx.abort(); } catch(e2) {} reject(e); }
      });
    });
  }

  function _reqP(req) {
    return new Promise(function(resolve, reject) {
      req.onsuccess = function() { resolve(req.result); };
      req.onerror   = function() { reject(req.error); };
    });
  }

  function _put(rec) {
    return _tx("readwrite", function(st) { st.put(rec); }).catch(function(e) {
      console.warn("[Journal] écriture échouée :", e);
    });
  }

  // ⚠️ Les lectures rendent la promesse de LEUR REQUÊTE (adoptée par resolve(out) dans _tx), jamais une
  // variable remplie par effet de bord : l'ordre « onsuccess avant oncomplete » est fragile (faux avec un
  // double de test).
  function list() {
    return _tx("readonly", function(st) { return _reqP(st.getAll()); })
      .then(function(arr) {
        const out = Array.isArray(arr) ? arr : [];
        // Antéchronologique ; by_start ne sert qu'à la purge FIFO (getAll suffit sous 500).
        out.sort(function(a, b) { return (b.startedAtMs || 0) - (a.startedAtMs || 0); });
        return out;
      }).catch(function(e) {
        console.warn("[Journal] list() échec :", e);
        return [];
      });
  }

  function get(id) {
    if (!id) return Promise.resolve(null);
    return _tx("readonly", function(st) { return _reqP(st.get(String(id))); })
      .then(function(r) { return r || null; })
      .catch(function() { return null; });
  }

  function remove(id) {
    if (!id) return Promise.resolve(false);
    return _tx("readwrite", function(st) { st.delete(String(id)); })
      .then(function() { return true; })
      .catch(function(e) { console.warn("[Journal] remove() échec :", e); return false; });
  }

  // 🩸 Sur la sortie EN COURS, mettre aussi à jour `_cur` : flush() réécrit `_snapshot()` (= `_cur`) toutes
  // les 30 s et écraserait en base la note posée (affichée dans la liste, perdue dans la fiche).
  function setNote(id, texte) {
    return get(id).then(function(rec) {
      if (!rec) return false;
      const val = String(texte == null ? "" : texte).slice(0, 4000);
      rec.note = val;
      rec.updatedAt = new Date().toISOString();
      if (_cur && String(_cur.id) === String(id)) _cur.note = val;   // ← le fix
      return _put(rec).then(function() { return true; });
    });
  }

  // Purge FIFO au-delà de MAX_SORTIES (quota IDB).
  function _purgeSiBesoin() {
    return list().then(function(all) {
      if (all.length <= MAX_SORTIES) return;
      const trop = all.slice(MAX_SORTIES);   // liste triée récent → ancien
      console.warn("[Journal] Purge FIFO : " + trop.length + " sortie(s) la/les plus ancienne(s)");
      return Promise.all(trop.map(function(r) { return remove(r.id); }));
    }).catch(function() {});
  }

  // ── Collecte ──

  function _counts() {
    function _len(fn) {
      try { return (typeof window[fn] === "function") ? ((window[fn]() || []).length) : 0; }
      catch(e) { return 0; }
    }
    return {
      points:     _len("getEditorPoints"),
      roads:      _len("getRoads"),
      zones:      _len("getZones"),
      structures: _len("getStructures")
    };
  }

  // Distance exploitable : podomètre + tronçons estimés entre « 📍 Je suis ici » (tracking.js) ; sans eux
  // une sortie de navigation pure vaudrait 0 m. Repli sur la mesure seule.
  function _trackerDistM() {
    try {
      if (typeof window.getTrackingDistanceTotaleM === "function") {
        return Number(window.getTrackingDistanceTotaleM()) || 0;
      }
      return (typeof window.getTrackingDistanceM === "function")
        ? (Number(window.getTrackingDistanceM()) || 0) : 0;
    } catch(e) { return 0; }
  }

  // Part estimée, stockée à part (« 820 m dont 600 estimés » : mesuré et estimé ne se valent pas).
  function _trackerDistEstimeeM() {
    try {
      return (typeof window.getTrackingDistanceEstimeeM === "function")
        ? (Number(window.getTrackingDistanceEstimeeM()) || 0) : 0;
    } catch(e) { return 0; }
  }

  function _validationsDepuis(baseline) {
    try {
      if (typeof window.getTrackingValidations !== "function") return 0;
      const n = Number(window.getTrackingValidations()) || 0;
      return Math.max(0, n - (Number(baseline) || 0));
    } catch(e) { return 0; }
  }

  function _timeline() {
    try {
      return (typeof window.getTrackingTimeline === "function")
        ? (window.getTrackingTimeline() || []) : [];
    } catch(e) { return []; }
  }

  // Portion de la timeline postérieure au démarrage, décimée à MAX_TRACK_PTS (1er et dernier gardés).
  // Champs {x, y, t, level?} : pas de deltaMs/type (inutiles au replay, poids divisé par ~2).
  function _trackDepuis(startMs) {
    const tl = _timeline().filter(function(e) {
      const t = Number(e && e.t);
      return isFinite(t) && t >= startMs;
    });
    if (tl.length === 0) return [];
    let src = tl;
    if (tl.length > MAX_TRACK_PTS) {
      const stride = Math.ceil(tl.length / MAX_TRACK_PTS);
      src = tl.filter(function(e, i) { return i % stride === 0; });
      if (src[src.length - 1] !== tl[tl.length - 1]) src.push(tl[tl.length - 1]);
    }
    return src.map(function(e) {
      const o = { x: e.x, y: e.y, t: e.t };
      if (typeof e.level === "number") o.level = e.level;
      return o;
    });
  }

  // Plafond partagé avec _trackDepuis : un tracé reconstruit sur les galeries peut être bien plus dense
  // que la timeline et dépasser le budget de 2-8 Ko.
  function _decimer(pts) {
    if (!Array.isArray(pts) || pts.length === 0) return null;
    if (pts.length <= MAX_TRACK_PTS) return pts;
    const stride = Math.ceil(pts.length / MAX_TRACK_PTS);
    const out = pts.filter(function(p, i) { return i % stride === 0; });
    if (out[out.length - 1] !== pts[pts.length - 1]) out.push(pts[pts.length - 1]);
    return out;
  }

  function _stepsDepuis(startMs) {
    return _timeline().filter(function(e) {
      const t = Number(e && e.t);
      return e && e.type === "pdr" && isFinite(t) && t >= startMs;
    }).length;
  }

  function _niveauxVus(track) {
    const set = {};
    track.forEach(function(p) { if (typeof p.level === "number") set[p.level] = 1; });
    try {
      const pts = (typeof window.getEditorPoints === "function") ? (window.getEditorPoints() || []) : [];
      pts.forEach(function(p) { set[Number(p && p.level) || 0] = 1; });
    } catch(e) {}
    const arr = Object.keys(set).map(Number);
    arr.sort(function(a, b) { return a - b; });
    return arr;
  }

  // Classement par le déplacement seul (ni la durée ni les ajouts ne discriminent) :
  //   • un « 📍 Je suis ici » validé suffit : geste terrain le moins ambigu (et il ne produit aucun pas PDR) ;
  //   • sinon le déplacement mesuré doit franchir MIN_TERRAIN_DIST_M (téléphone qui vibre sur une table).
  function _classer(rec) {
    if (!rec) return TYPE_BUREAU;
    if (Number(rec.validations) > 0) return TYPE_TERRAIN;
    return (Number(rec.distM) >= MIN_TERRAIN_DIST_M) ? TYPE_TERRAIN : TYPE_BUREAU;
  }

  function _nbAjouts(rec) {
    const a = (rec && rec.ajouts) || {};
    return (a.points || 0) + (a.roads || 0) + (a.zones || 0) + (a.structures || 0) + (a.photos || 0);
  }

  // Met à jour le record en cours depuis la RAM, sans persister.
  function _snapshot() {
    if (!_cur || !_baseline) return null;
    _tickActive();
    const now = _now();
    const c   = _counts();
    // Clamp à 0 : une suppression nette n'affiche pas un ajout négatif.
    _cur.ajouts = {
      points:     Math.max(0, c.points     - _baseline.points),
      roads:      Math.max(0, c.roads      - _baseline.roads),
      zones:      Math.max(0, c.zones      - _baseline.zones),
      structures: Math.max(0, c.structures - _baseline.structures),
      photos:     _photoIds.length
    };
    const d = _trackerDistM();
    // Distance qui recule (session effacée, tracker reset) → ré-ancrage, sinon delta négatif.
    if (d < _baseline.distM) _baseline.distM = d;
    _cur.distM = Math.max(0, d - _baseline.distM);
    const de = _trackerDistEstimeeM();
    if (de < _baseline.distEstM) _baseline.distEstM = de;
    _cur.distEstimeeM = Math.max(0, de - _baseline.distEstM);
    _cur.validations  = _validationsDepuis(_baseline.validations);
    _cur.track = _trackDepuis(_cur.startedAtMs);
    // steps = VRAIS pas PDR (même définition que statsGlobales), pas la longueur du tracé décimé.
    _cur.steps = _stepsDepuis(_cur.startedAtMs);
    _cur.levels = _niveauxVus(_cur.track);
    _cur.photoIds = _photoIds.slice();
    _cur.wallMs = Math.max(0, now - _cur.startedAtMs);
    // Réévalué à chaque snapshot : bureau → terrain au premier pas ; l'inverse n'arrive jamais.
    if (!_cur.typeManuel) _cur.type = _classer(_cur);
    _cur.updatedAt = new Date().toISOString();
    return _cur;
  }

  // ── Temps actif ──

  function _tickActive() {
    if (!_cur || _lastTick === null) return;
    const now = _now();
    const delta = now - _lastTick;
    _lastTick = now;
    if (delta > 0 && delta < MAX_TICK_MS) _cur.activeMs += delta;
  }

  function _startTimer() {
    if (_flushTimer) return;
    _flushTimer = setInterval(function() { flush(); }, FLUSH_MS);
  }
  function _stopTimer() {
    if (_flushTimer) { clearInterval(_flushTimer); _flushTimer = null; }
  }

  // ── Cycle de vie ──

  // Appelé par main.js APRÈS SessionPersist.onPlanLoaded (baseline = état restauré).
  // Sortie du MÊME plan reprenable, ou null (asynchrone).
  function _candidateReprise(planId) {
    if (!planId) return Promise.resolve(null);
    return list().then(function (all) {
      const now = _now();
      for (let i = 0; i < all.length; i++) {          // deja trie du + recent
        const r = all[i];
        if (!r || r.planId !== planId) continue;
        // Suspendue au changement de plan : reprise dans le délai.
        if (r.status === "suspendue") {
          const suspMs = Date.parse(r.suspendueLe || r.updatedAt || 0) || 0;
          return (suspMs && (now - suspMs) <= SUSPENSION_MS) ? r : null;
        }
        if (r.status !== "close" || r.closedBy !== "crash") return null;
        const finMs = Date.parse(r.endedAt || r.updatedAt || 0) || 0;
        if (!finMs || (now - finMs) > REPRISE_MS) return null;
        return r;
      }
      return null;
    }).catch(function () { return null; });
  }

  // 🩸 Les compteurs sont des DIFFÉRENCES (`compte − baseline`), pas des cumuls : une baseline neuve
  // remettrait tout à zéro. La session étant restaurée à l'identique au reboot,
  // `baseline = compte_actuel − déjà_en_banque` redonne la baseline d'origine. Session effacée entre-temps :
  // les ré-ancrages de `_snapshot` empêchent les valeurs négatives.
  function _baselineDepuisReprise(rec) {
    const c = _counts();
    const a = rec.ajouts || {};
    const b = {
      points:     Math.max(0, (c.points     || 0) - (a.points     || 0)),
      roads:      Math.max(0, (c.roads      || 0) - (a.roads      || 0)),
      zones:      Math.max(0, (c.zones      || 0) - (a.zones      || 0)),
      structures: Math.max(0, (c.structures || 0) - (a.structures || 0))
    };
    b.distM    = Math.max(0, _trackerDistM()         - (Number(rec.distM) || 0));
    b.distEstM = Math.max(0, _trackerDistEstimeeM()  - (Number(rec.distEstimeeM) || 0));
    const vNow = (typeof window.getTrackingValidations === "function")
      ? (Number(window.getTrackingValidations()) || 0) : 0;
    b.validations = Math.max(0, vNow - (Number(rec.validations) || 0));
    return b;
  }

  function onPlanLoaded(planId, planName) {
    if (!isEnabled()) {
      // Carnet désactivé : pas de sortie auto, mais une sortie démarrée À LA MAIN puis suspendue reprend.
      if (!_cur) {
        _candidateReprise(planId).then(function (rec) {
          if (rec && rec.status === "suspendue" && !_cur) _reprendre(rec, "carnet désactivé");
        });
      }
      _expirerSuspendues();
      return null;
    }
    return _ouvrir(planId, planName, "auto");
  }

  // Démarrage manuel. 🩸 Deux refus explicites, jamais un clic sans effet : sortie DÉJÀ en cours (l'écraser
  // perdrait ses compteurs ; la raison remonte à l'appelant) ; aucun plan chargé.
  // Carnet DÉSACTIVÉ n'est pas un refus (c'est le cas d'usage) — d'où le balayage de démarrage
  // inconditionnel, sinon une sortie manuelle interrompue resterait « en cours » pour toujours.
  function demarrer() {
    if (_cur) return { ok: false, raison: "encours", id: _cur.id };
    const planId = window._currentLoadedPlanId || null;
    if (!planId) return { ok: false, raison: "sansPlan" };
    const r = _ouvrir(planId, _planNameCourant(), "manuel");
    return r ? { ok: true, id: r.id } : { ok: false, raison: "echec" };
  }

  function _ouvrir(planId, planName, origine) {
    // Filet : sortie encore ouverte (changement de plan sans teardown) clôturée d'abord.
    if (_cur) { try { _finaliser("auto"); } catch(e) {} }

    const startMs = _now();
    _baseline = _counts();
    _baseline.distM       = _trackerDistM();
    _baseline.distEstM    = _trackerDistEstimeeM();
    // La timeline restaurée contient les validations d'une sortie précédente : sans baseline, elles
    // classeraient d'office la nouvelle session en terrain.
    _baseline.validations = (typeof window.getTrackingValidations === "function")
      ? (Number(window.getTrackingValidations()) || 0) : 0;
    _photoIds = [];
    _cur = {
      id:          _genId(),
      schema:      SCHEMA,
      status:      "encours",
      planId:      planId || null,
      planName:    planName || _planNameCourant() || (planId || "?"),
      startedAt:   new Date(startMs).toISOString(),
      startedAtMs: startMs,
      endedAt:     null,
      activeMs:    0,
      wallMs:      0,
      distM:       0,          // podomètre + tronçons estimés
      distEstimeeM: 0,         // part estimée du total ci-dessus
      validations: 0,          // « 📍 Je suis ici » validés
      steps:       0,
      levels:      [],
      ajouts:      { points: 0, roads: 0, zones: 0, structures: 0, photos: 0 },
      photoIds:    [],
      track:       [],
      note:        "",
      // Toute session démarre « bureau ».
      type:        TYPE_BUREAU,
      typeManuel:  false,
      ouvertePar:  (origine === "manuel") ? "manuel" : "auto",
      appVersion:  (window.__MKM__ && window.__MKM__.build) || null
    };
    _lastTick = (document.visibilityState === "hidden") ? null : startMs;
    _startTimer();
    console.log("[Journal] Sortie ouverte :", _cur.id, "—", _cur.planName);

    // Reprise d'une sortie tuée sous l'utilisateur : recherche ASYNCHRONE (IDB) alors que tout ce qui
    // précède est synchrone → on ouvre la sortie neuve, on retient son id, et on la REMPLACE si une reprise
    // arrive. 🩸 Garde sur cet id : une reprise tardive écraserait une sortie déjà repartie (changement de
    // plan rapide). La sortie neuve n'a pas encore touché IDB (1er flush à 30 s) : rien à nettoyer.
    const idNeuve = _cur.id;
    _candidateReprise(planId).then(function (rec) {
      if (!rec || !_cur || _cur.id !== idNeuve) return;
      _reprendre(rec, "la sortie neuve " + idNeuve + " est abandonnee");
    });
    _expirerSuspendues();

    return { id: _cur.id, startedAt: _cur.startedAt };
  }

  // Remet `rec` (tuée ou suspendue) EN COURS, baseline d'origine reconstruite.
  function _reprendre(rec, detail) {
    if (_cur && _cur.id !== rec.id) _stopTimer();
    _cur = rec;
    _cur.status   = "encours";
    _cur.endedAt  = null;
    _cur.closedBy = null;
    delete _cur.suspendueLe;
    _cur.reprises = (Number(rec.reprises) || 0) + 1;
    _baseline = _baselineDepuisReprise(rec);
    _photoIds = Array.isArray(rec.photoIds) ? rec.photoIds.slice() : [];
    _lastTick = (document.visibilityState === "hidden") ? null : _now();
    _startTimer();
    console.log("[Journal] 🔁 Sortie reprise :", rec.id, "· reprise n°" + _cur.reprises + (detail ? " · " + detail : ""));
    // La SORTIE reprend, pas le SUIVI (coupé à chaque chargement de plan et redémarrage). Sur une sortie
    // terrain on propose de le relancer. 🩸 Pas de relance automatique : sur iOS l'accès aux capteurs exige
    // un geste, elle échouerait en silence ; le clic « Relancer » EST ce geste (ktaConfirm résout dans le clic).
    const suiviArrete = !(typeof window.getTrackingActif === "function" && window.getTrackingActif());
    if (rec.type === TYPE_TERRAIN && suiviArrete &&
        typeof window.ktaDemarrerSuivi === "function" && typeof window.ktaConfirm === "function") {
      const t = function (k) { return (window.I18n && window.I18n.t) ? window.I18n.t(k) : k; };
      window.ktaConfirm(t("journal.reprise.suiviTexte"), {
        titre:       t("journal.reprise.suiviTitre"),
        okLabel:     t("journal.reprise.suiviOk"),
        cancelLabel: t("journal.reprise.suiviPlusTard")
      }).then(function (ok) { if (ok) window.ktaDemarrerSuivi(); });
      return;
    }
    if (window.OOMGuard && typeof window.OOMGuard.showToast === "function") {
      const msg = (window.I18n && window.I18n.t) ? window.I18n.t("journal.reprise.toast") : "🔁 Sortie reprise";
      window.OOMGuard.showToast(msg, "info");
    }
  }

  // Suspendue depuis plus de SUSPENSION_MS : finalisée (gardée si elle passe les seuils, jetée sinon).
  // Appelé à chaque ouverture de plan et au démarrage. Pas d'affinage : la timeline n'est plus en mémoire.
  function _expirerSuspendues() {
    return list().then(function (all) {
      const now = _now();
      const curId = _cur ? _cur.id : null;
      const perimees = all.filter(function (r) {
        if (!r || r.status !== "suspendue" || r.id === curId) return false;
        const t = Date.parse(r.suspendueLe || r.updatedAt || 0) || 0;
        return !t || (now - t) > SUSPENSION_MS;
      });
      return Promise.all(perimees.map(function (r) {
        if (!_pertinente(r)) return remove(r.id);
        r.status   = "close";
        r.closedBy = "auto";
        r.endedAt  = r.suspendueLe || r.updatedAt || new Date().toISOString();
        delete r.suspendueLe;
        return _put(r);
      }));
    }).catch(function () {});
  }

  function _planNameCourant() {
    try {
      if (window.PLAN_CONFIG && window.PLAN_CONFIG.plan && window.PLAN_CONFIG.plan.name) {
        return window.PLAN_CONFIG.plan.name;
      }
    } catch(e) {}
    return null;
  }

  // Pertinence pour l'archivage AUTO (la clôture manuelle garde sans condition) :
  //   • terrain : ≥ 50 m parcourus (pas de « ≥ 1 ajout » : chaque soirée de dessin entrerait) ;
  //   • bureau : ≥ 10 min actives ET ≥ 1 ajout.
  // ⚠️ Les deux critères sont un OU, pas un aiguillage sur le type : une session basculée terrain par un
  // pas PDR ne doit pas perdre 3 h de travail faute de 50 m. Le type est un libellé, pas un juge.
  function _pertinente(rec) {
    if (!rec) return false;
    const terrainOk = Number(rec.distM) >= MIN_DIST_M;
    const bureauOk  = (Number(rec.activeMs) >= MIN_BUREAU_ACTIVE_MS) &&
                      (_nbAjouts(rec) >= MIN_BUREAU_AJOUTS);
    return terrainOk || bureauOk;
  }

  // Tronçons estimés « à vol d'oiseau » → distance RÉELLE sur le réseau, puis distances du record
  // recalculées (pas au clic « 📍 Je suis ici » : une reconstruction de graphe par clic coûte trop).
  // 🩸 Roads CAPTURÉES ici et passées explicitement : l'affinage tourne en quittant le plan, lire l'état
  // plus tard calculerait sur le plan suivant.
  function _roadsDuPlan() {
    try {
      const s = (typeof window.getRoads === "function") ? (window.getRoads() || []) : [];
      const e = (typeof window.getAllEmbeddedRoads === "function")
        ? (window.getAllEmbeddedRoads() || [])
        : ((typeof window.getEmbeddedRoads === "function") ? (window.getEmbeddedRoads() || []) : []);
      return s.concat(e);
    } catch(e) { return []; }
  }

  function _affinerDistances(rec, baseDist, baseEst, opts) {
    if (typeof window.affinerEstimationsTracker !== "function") return Promise.resolve(null);
    const roads = _roadsDuPlan();
    if (!roads.length) return Promise.resolve(null);
    const o = Object.assign({ depuisMs: rec.startedAtMs }, opts || {});
    return window.affinerEstimationsTracker(roads, o).then(function(bilan) {
      if (!bilan || !bilan.runs) return bilan || null;
      rec.distM        = Math.max(0, _trackerDistM()        - (Number(baseDist) || 0));
      rec.distEstimeeM = Math.max(0, _trackerDistEstimeeM() - (Number(baseEst)  || 0));
      // Tracé RECONSTRUIT à côté du brut, jamais à sa place (`track` = ce qui a été enregistré).
      if (bilan.trace) rec.trackAffine = _decimer(bilan.trace);
      if (!rec.typeManuel) rec.type = _classer(rec);
      return bilan;
    }).catch(function() { return null; });
  }

  // Affine la sortie EN COURS sans la clôturer (« 🧭 Affiner le tracé »). `opts.force` outrepasse le
  // budget de sommets (geste explicite, cf tracking.js).
  function affinerEnCours(opts) {
    if (!_cur || !_baseline) return Promise.resolve(null);
    const rec = _snapshot();
    if (!rec) return Promise.resolve(null);
    return _affinerDistances(rec, _baseline.distM, _baseline.distEstM, opts)
      .then(function(bilan) {
        if (!bilan || !bilan.runs) return bilan;
        return flush().then(function() { return bilan; });
      });
  }

  // reason : "auto" (teardown / fermeture) | "manual" (Clôturer).
  function _finaliser(reason) {
    if (!_cur) return Promise.resolve(null);
    const rec = _snapshot();
    const id  = _cur.id;
    _stopTimer();
    rec.status  = "close";
    rec.endedAt = new Date().toISOString();
    rec.closedBy = (reason === "manual") ? "manual" : "auto";
    const baseDist = _baseline ? _baseline.distM    : 0;
    const baseEst  = _baseline ? _baseline.distEstM : 0;
    _cur = null; _baseline = null; _photoIds = [];

    // ⚠️ Affinage AVANT le test de pertinence : 30 m à vol d'oiseau peuvent valoir 200 m de galeries.
    // 🩸 `force` sur une clôture MANUELLE : le budget de sommets (cf tracking.js) protège l'archivage AUTO
    // qui doit rester invisible — au-delà, le vol d'oiseau serait gardé SANS un mot (systématique sur un
    // relevé importé) et présenté comme distance parcourue. Après « Clôturer », un calcul long est légitime.
    const optsAff = (reason === "manual") ? { force: true } : undefined;
    return _affinerDistances(rec, baseDist, baseEst, optsAff).then(function() {
      return _finaliserSuite(rec, id, reason);
    });
  }

  function _finaliserSuite(rec, id, reason) {
    if (reason !== "manual" && !_pertinente(rec)) {
      // Trop maigre : on jette, y compris le flush « en cours » déjà en IDB (sinon fantôme au carnet).
      console.log("[Journal] Sortie ignorée (sous les seuils) :", id);
      return remove(id).then(function() { return null; });
    }
    return _put(rec).then(_purgeSiBesoin).then(function() {
      console.log("[Journal] " + (rec.type === TYPE_TERRAIN ? "Sortie terrain" : "Session bureau") +
                  " archivée :", id, "·", Math.round(rec.activeMs / 60000) + " min ·",
                  Math.round(rec.distM) + " m");
      return rec;
    });
  }

  // Appelé par main.js > _libererRessourcesPlanPrecedent (après SessionPersist.onPlanUnload, avant le
  // teardown). SUSPEND la sortie (cf SUSPENSION_MS) : pause, pas fin — ni pertinence ni affinage ici.
  function onPlanUnload() {
    if (!_cur) return Promise.resolve(null);
    return _suspendre();
  }

  function _suspendre() {
    const rec = _snapshot();
    _stopTimer();
    _cur = null; _baseline = null; _photoIds = [];
    if (!rec) return Promise.resolve(null);
    rec.status      = "suspendue";
    rec.suspendueLe = new Date().toISOString();
    rec.endedAt     = null;
    rec.closedBy    = null;
    console.log("[Journal] ⏸️ Sortie suspendue (changement de plan) :", rec.id);
    return _put(rec).then(function () { return rec; });
  }

  // Clôture manuelle : garde TOUJOURS, puis rouvre une sortie sur le même plan.
  function cloturer() {
    if (!_cur) return Promise.resolve(null);
    const planId = _cur.planId, planName = _cur.planName;
    // 🩸 La suivante ne repart QUE si le carnet est actif (sortie démarrée à la main carnet décoché).
    return _finaliser("manual").then(function(rec) {
      onPlanLoaded(planId, planName);
      return rec;
    });
  }

  function flush() {
    if (!_cur) return Promise.resolve(false);
    const rec = _snapshot();
    if (!rec) return Promise.resolve(false);
    return _put(rec).then(function() { return true; });
  }

  function getCurrent() {
    if (!_cur) return null;
    const s = _snapshot();
    return s ? JSON.parse(JSON.stringify(s)) : null;
  }

  // Hook de photos.js > addPhoto (succès) : seulement les photos prises pendant la sortie (restorePhoto
  // ne l'appelle pas, volontairement).
  function onPhotoAdded(photoId, planId) {
    if (!_cur || !photoId) return;
    if (planId && _cur.planId && String(planId) !== String(_cur.planId)) return;
    _photoIds.push(String(photoId));
  }

  // Reclassement manuel (🚶 / 🖥️) : pose `typeManuel`. 🩸 Même piège que setNote : sans mise à jour de
  // `_cur`, le flush suivant l'annule — et `_snapshot()` reclasserait activement tant que typeManuel manque.
  function setType(id, type) {
    const t = (type === TYPE_TERRAIN) ? TYPE_TERRAIN : TYPE_BUREAU;
    const estCourante = !!(_cur && String(_cur.id) === String(id));
    return get(id).then(function(rec) {
      // ⚠️ La sortie EN COURS n'est en IDB qu'après le premier flush (30 s) : `get` rend null, et le bouton
      // de la modale Session vise justement une sortie souvent toute fraîche.
      if (!rec) {
        if (!estCourante) return false;
        _cur.type       = t;
        _cur.typeManuel = true;
        return flush().then(function() { return true; });
      }
      rec.type       = t;
      rec.typeManuel = true;
      rec.updatedAt  = new Date().toISOString();
      if (estCourante) {
        _cur.type       = t;
        _cur.typeManuel = true;
      }
      return _put(rec).then(function() { return true; });
    });
  }

  // Les TOTAUX ne comptent que le TERRAIN ; le bureau est compté à part, jamais mélangé.
  function stats() {
    return list().then(function(all) {
      let ms = 0, m = 0, nbT = 0, nbB = 0, bureauMs = 0;
      const plans = {};
      all.forEach(function(r) {
        if ((r.type || TYPE_BUREAU) === TYPE_TERRAIN) {
          nbT++;
          ms += dureeMs(r);
          m  += Number(r.distM)    || 0;
          if (r.planId) plans[r.planId] = 1;
        } else {
          nbB++;
          bureauMs += dureeMs(r);
        }
      });
      const terrain = all.filter(function(r) { return (r.type || TYPE_BUREAU) === TYPE_TERRAIN; });
      return {
        sorties:  nbT,          // terrain uniquement
        activeMs: ms,
        distM:    m,
        plans:    Object.keys(plans).length,
        bureau:   nbB,
        bureauMs: bureauMs,
        derniere: terrain.length ? terrain[0] : null
      };
    });
  }

  // ── Reprise après crash ──

  // Un record reste `encours` si l'app est morte sans onPlanUnload (kill iOS, crash). Sans ce balayage,
  // les fantômes s'accumulent, et ceux sous les seuils ne seraient jamais jetés (le filtre ne joue qu'à
  // la finalisation).
  function _balayerEnCours() {
    return list().then(function(all) {
      // La sortie EN COURS n'est jamais régularisée par son propre balayage (balayage retardé).
      const curId = _cur ? _cur.id : null;
      const orphelines = all.filter(function(r) {
        return r && r.status === "encours" && r.id !== curId;
      });
      if (orphelines.length === 0) return;
      return Promise.all(orphelines.map(function(r) {
        if (!_pertinente(r)) return remove(r.id);
        r.status   = "close";
        r.closedBy = "crash";       // clôturée par le balayage, pas par l'user
        r.endedAt  = r.updatedAt || new Date().toISOString();
        return _put(r);
      })).then(function() {
        console.log("[Journal] Balayage : " + orphelines.length + " sortie(s) interrompue(s) régularisée(s)");
      });
    }).catch(function() {});
  }

  // ── Filets ──

  document.addEventListener("visibilitychange", function() {
    if (!_cur) return;
    if (document.hidden) {
      _tickActive();      // compte ce qui a couru avant le passage en fond
      _lastTick = null;   // suspend le comptage
      flush();            // mobile : l'onglet peut être tué sans autre préavis
    } else {
      _lastTick = _now();
    }
  });

  window.addEventListener("pagehide", function() { _tickActive(); flush(); });
  // beforeunload : l'écriture IDB peut ne pas aboutir ; le vrai travail est fait par le flush 30 s et
  // celui du visibilitychange.
  window.addEventListener("beforeunload", function() { _tickActive(); flush(); });

  // ── Export ──

  // ── Durée d'une sortie ──
  // `activeMs` = temps où l'app était ouverte et visible (combien de temps on s'en est SERVI) ;
  // `wallMs` = fin − début, trous compris (combien de temps la SORTIE a duré).
  // 🩸 LA RÈGLE DÉPEND DU TYPE : terrain → temps réel (téléphone en poche, app tuée par iOS ne comptent
  // pas comme absence) ; bureau → temps d'usage (un plan ouvert toute la soirée sans le regarder).
  // Cette règle vit ICI seulement : affichage, totaux et fiche l'appellent (sinon détail et total divergent).
  function dureeMs(rec) {
    if (!rec) return 0;
    if (rec.type !== TYPE_TERRAIN) return Number(rec.activeMs) || 0;
    const w = Number(rec.wallMs) || 0;
    // Fin antérieure au début (donnée corrompue) : ni durée négative, ni actif écrasé.
    return w > 0 ? w : (Number(rec.activeMs) || 0);
  }

  // Corriger la fin après coup (oubli de « Clôturer » : la fin enregistrée est le moment où iOS a tué
  // l'app). 🩸 `activeMs` est une mesure, on n'y touche PAS : seul `wallMs` est recalculé ;
  // `finManuelle` dit que le chiffre vient de l'utilisateur.
  function setFin(id, quand) {
    const ms = (quand instanceof Date) ? quand.getTime()
             : (typeof quand === "number") ? quand
             : Date.parse(quand);
    if (!Number.isFinite(ms)) return Promise.resolve(null);
    return get(id).then(function (rec) {
      if (!rec) return null;
      const debut = Number(rec.startedAtMs) || 0;
      // Fin avant le début : refusée plutôt qu'une durée négative.
      if (!debut || ms <= debut) return null;
      rec.endedAt     = new Date(ms).toISOString();
      rec.wallMs      = ms - debut;
      rec.finManuelle = true;
      rec.updatedAt   = new Date().toISOString();
      return _put(rec).then(function () { return rec; });
    }).catch(function (e) {
      console.warn("[Journal] setFin echoue :", e && e.message);
      return null;
    });
  }

  // ── Fusion manuelle ──
  // La reprise automatique empêche le hachage ; la fusion répare les sorties déjà hachées.
  // 🩸 LA PLUS ANCIENNE SERT DE SOCLE et garde son id (fiche ouverte, références, ordre). Les autres sont
  // supprimées APRÈS écriture du résultat, jamais avant (un échec d'écriture perdrait tout).
  function fusionner(ids) {
    if (!Array.isArray(ids) || ids.length < 2) return Promise.resolve(null);
    return Promise.all(ids.map(function (id) { return get(id); })).then(function (recs) {
      const liste = recs.filter(Boolean).filter(function (r) { return r.status === "close"; })
        .sort(function (a, b) { return (a.startedAtMs || 0) - (b.startedAtMs || 0); });
      if (liste.length < 2) return null;

      const base = liste[0];
      const fin = liste.reduce(function (m, r) {
        const t = Date.parse(r.endedAt || r.updatedAt || 0) || 0;
        return t > m ? t : m;
      }, 0);

      const somme = function (cle) {
        return liste.reduce(function (s, r) { return s + (Number(r[cle]) || 0); }, 0);
      };
      base.activeMs     = somme("activeMs");
      base.distM        = somme("distM");
      base.distEstimeeM = somme("distEstimeeM");
      base.validations  = somme("validations");
      base.steps        = somme("steps");
      base.ajouts = ["points", "roads", "zones", "structures", "photos"].reduce(function (o, k) {
        o[k] = liste.reduce(function (s, r) { return s + (Number((r.ajouts || {})[k]) || 0); }, 0);
        return o;
      }, {});
      // 🩸 `wallMs` n'est PAS une somme : durée réelle du début à la fin, trous compris.
      base.wallMs = Math.max(0, fin - (base.startedAtMs || 0));
      base.endedAt = fin ? new Date(fin).toISOString() : base.endedAt;

      const vus = {};
      base.photoIds = liste.reduce(function (out, r) {
        (r.photoIds || []).forEach(function (pid) { if (!vus[pid]) { vus[pid] = 1; out.push(pid); } });
        return out;
      }, []);
      base.track = liste.reduce(function (out, r) { return out.concat(r.track || []); }, [])
        .sort(function (a, b) { return (a && a.t || 0) - (b && b.t || 0); });
      const nv = {};
      base.levels = liste.reduce(function (out, r) {
        (r.levels || []).forEach(function (l) { if (!(l in nv)) { nv[l] = 1; out.push(l); } });
        return out;
      }, []);
      // Notes empilées dans l'ordre.
      base.note = liste.map(function (r) { return String(r.note || "").trim(); })
        .filter(Boolean).join("\n\n———\n\n");
      // Un morceau terrain → l'ensemble est terrain.
      if (!base.typeManuel) {
        base.type = liste.some(function (r) { return r.type === TYPE_TERRAIN; }) ? TYPE_TERRAIN : TYPE_BUREAU;
      }
      base.fusionDe  = liste.map(function (r) { return r.id; });
      base.updatedAt = new Date().toISOString();

      return _put(base).then(function () {
        const aJeter = liste.slice(1).map(function (r) { return r.id; });
        return Promise.all(aJeter.map(remove)).then(function () {
          console.log("[Journal] 🔗 " + liste.length + " sorties fusionnees dans", base.id);
          return base;
        });
      });
    }).catch(function (e) {
      console.warn("[Journal] fusion echouee :", e && e.message);
      return null;
    });
  }

  window.Journal = {
    onPlanLoaded: onPlanLoaded,
    onPlanUnload: onPlanUnload,
    onPhotoAdded: onPhotoAdded,
    cloturer:     cloturer,
    flush:        flush,
    getCurrent:   getCurrent,
    demarrer:     demarrer,     // ouverture MANUELLE
    list:         list,
    get:          get,
    remove:       remove,
    setNote:      setNote,
    setType:      setType,
    fusionner:    fusionner,     // recoller des sorties hachees
    dureeMs:      dureeMs,       // LA regle, une seule fois
    setFin:       setFin,        // corriger la fin oubliee
    REPRISE_MS:   REPRISE_MS,
    affinerEnCours: affinerEnCours,
    stats:        stats,
    TYPE_TERRAIN: TYPE_TERRAIN,
    TYPE_BUREAU:  TYPE_BUREAU,
    isEnabled:    isEnabled,
    setEnabled:   setEnabled,
    DB_NAME:      DB_NAME
  };

  // 🏷️ ancre:balayage-demarrage
  // Balayage différé de 4 s (app stabilisée). 🩸 Inconditionnel (pas sous `isEnabled()`) : il ne crée rien,
  // il régularise — sinon une sortie interrompue puis carnet décoché, ou une sortie manuelle carnet
  // décoché, resterait « en cours » à jamais.
  setTimeout(function() { _balayerEnCours(); _expirerSuspendues(); }, 4000);

  console.log("[Journal] Module chargé (DB " + DB_NAME + " v" + DB_VERSION + ")");
})();
