/*!
 * MyKTAMap — Carnet d'exploration : archive des sorties (v1.69.0)
 * (c) 2026 Flavien VIDAL (alias KARMA)
 * Site : https://myktamap.fr
 *
 * Licence : CC BY-NC-SA 4.0
 */

// =========================
// JOURNAL.JS — Le Carnet : journalisation des sorties (depuis v1.69.0)
// =========================
// POURQUOI CE MODULE — avant lui, RIEN dans l'app ne datait ni n'empilait une
// sortie : `sessionPersist` = état live écrasé par plan, `sessionBackups` = 10
// rotations FIFO (donc destructif au-delà), la timeline tracker vit par plan et
// Mode Histoire est enfermé dans l'écran plan. Impossible de répondre à « qu'est-ce
// que j'ai fait le 12 juillet ? ». Le Carnet ajoute la couche manquante : une
// ARCHIVE append-only, indépendante des sessions (une session effacée ne détruit
// pas la sortie déjà archivée).
//
// DÉCISIONS KARMA (topo 28/07/2026 — 1:c 2:b 3:a) :
//   1:c — Archivage HYBRIDE : auto au teardown du plan (seuils de pertinence)
//         + bouton explicite « 🏁 Clôturer ma sortie » + note éditable après coup.
//   2:b — Contenu : métadonnées + compteurs + REFS photos + TRACÉ tracker
//         (décimé) → une sortie reste consultable/rejouable, sans dupliquer la
//         session complète (rôle déjà tenu par SessionBackups).
//   3:a — Lot 1 seul : socle + timeline HOME + fiche. L'agrégation (récits Mode
//         Histoire, galerie photos transverse, export PDF du carnet) = lots 2-3.
//
// LIMITE ASSUMÉE : le carnet ne se remplit qu'à partir de la v1.69.0. Aucun
// remplissage rétroactif (les sorties d'avant n'ont jamais existé en tant que
// telles — seuls des états live écrasés subsistent).
//
// CYCLE DE VIE D'UNE SORTIE
//   main.js > lancerApplication()          → onPlanLoaded(planId, planName)
//     ↳ baseline = compteurs APRÈS restore de session (sinon la session
//       restaurée serait comptée comme « ajoutée aujourd'hui »)
//   pendant la sortie                      → flush IDB toutes les 30 s + à chaque
//                                            passage en arrière-plan (mobile tué)
//   main.js > _libererRessourcesPlanPrecedent() → onPlanUnload()
//     ↳ APRÈS SessionPersist.onPlanUnload (état RAM encore intact), AVANT le
//       teardown qui vide la timeline tracker.
//
// TEMPS ACTIF — même règle que le compteur global du profil (homeProfile) :
// on ne compte pas onglet caché, et on ignore les deltas > 5 min (veille /
// suspend). `activeMs` ≠ `wallMs` (fin - début) : les deux sont stockés.
//
// STORAGE : IDB `myktamap_journal` v1, store `sorties` (keyPath `id`),
//           index `by_start` (startedAtMs). ~2-8 Ko par sortie (tracé décimé).
//           Aucune image copiée : seules les REFS photos (ids du store Photos).
//           → une photo supprimée devient une vignette « photo manquante ».
//
// 100 % local, offline, zéro réseau.
//
// 🚶 TERRAIN vs 🖥️ BUREAU (v1.69.0, retour KARMA 29/07) : une session sans AUCUN
// déplacement tracker est du « travail sur plan », pas une sortie. Classement
// auto (`type`), corrigeable à la main (`setType` → `typeManuel: true`, plus
// jamais recalculé), totaux = terrain SEULEMENT.
//
// 🔧 RÉVISION DU 16/08/2026 (sortie réelle de KARMA jetée par le carnet) — une
// sortie de NAVIGATION PURE (itinéraire + « 📍 Je suis ici » jusqu'à la sortie,
// sans annoter ni marcher au podomètre) ne pouvait STRUCTURELLEMENT pas entrer
// au carnet. Trois causes cumulées, les trois corrigées :
//   1. les validations d'étapes sont des recalages → 0 m mesuré (la distance
//      estimée de tracking.js comble désormais les trous sans PDR) ;
//   2. l'itinéraire est EFFACÉ à l'arrivée → son ajout disparaissait du delta
//      (les compteurs d'ajouts sont des différences de longueurs de tableaux :
//      ce qui est créé puis supprimé pendant la sortie reste invisible — limite
//      connue, non corrigée ici) ;
//   3. la rétention n'examinait QUE la branche du type classé — un pas PDR
//      parasite suffisait à exiger 50 m et à jeter 3 h de travail.
// Les seuils sont maintenant un OU, et le classement a un seuil de bascule
// (`MIN_TERRAIN_DIST_M`) + un signal fort (une validation = terrain).
//
// API : window.Journal = {
//   onPlanLoaded(planId, planName), onPlanUnload(), onPhotoAdded(photoId, planId, pointId),
//   cloturer(),                  // clôture manuelle → retourne la sortie archivée (Promise)
//   getCurrent(),                // snapshot RAM de la sortie en cours (ou null)
//   list(), get(id), remove(id), setNote(id, texte), setType(id, "terrain"|"bureau"),
//   stats(),                     // totaux TERRAIN + compteurs bureau à part
//   isEnabled(), setEnabled(bool), TYPE_TERRAIN, TYPE_BUREAU
// };
// =========================

(function() {
  "use strict";

  const DB_NAME    = "myktamap_journal";
  const DB_VERSION = 1;
  const STORE      = "sorties";
  const SCHEMA     = 1;

  // Cadence d'écriture de la sortie « en cours ». 30 s = compromis : assez court
  // pour qu'un kill mémoire iOS ne coûte qu'une demi-minute, assez long pour ne
  // pas concurrencer le poller session (1,5 s) sur le thread IDB.
  const FLUSH_MS = 30000;

  // 🚶 vs 🖥️ — DEUX NATURES DE SESSION (retour KARMA 29/07/2026, reco 1:a 2:a 3:a).
  // Le lot 1 les confondait : une soirée de dessin à la maison atterrissait dans
  // le carnet à côté d'une vraie sortie (le seuil « ≥ 1 ajout » le garantissait
  // même). Le signal qui les sépare existe déjà et est fiable : le TRACKER.
  //   • "terrain" = tu t'es déplacé (distance parcourue OU pas PDR > 0)
  //   • "bureau"  = zéro déplacement, uniquement des annotations
  // Classement AUTO, corrigeable à la main sur la fiche (`setType`) — un
  // classement corrigé (`typeManuel: true`) n'est JAMAIS recalculé.
  const TYPE_TERRAIN = "terrain";
  const TYPE_BUREAU  = "bureau";

  // Seuils d'archivage AUTOMATIQUE, distincts par nature (la clôture manuelle
  // garde toujours). En dessous, la session est jetée : ouvrir un plan 20 s pour
  // vérifier un détail ne doit pas polluer le carnet.
  const MIN_DIST_M            = 50;               // terrain : 50 m parcourus
  const MIN_BUREAU_ACTIVE_MS  = 10 * 60 * 1000;   // bureau : 10 min actives…
  const MIN_BUREAU_AJOUTS     = 1;                // …ET au moins un ajout

  // Seuil de BASCULE terrain (≠ seuils de rétention ci-dessus). Avant le
  // 16/08/2026 il n'existait pas : UN pas PDR parasite suffisait à classer
  // une soirée de dessin en « sortie », et comme les totaux ne comptent que
  // le terrain, ça polluait les stats. 20 m = on a vraiment marché.
  const MIN_TERRAIN_DIST_M = 20;

  // Delta de temps ignoré (veille machine / onglet suspendu) — cf homeProfile.
  const MAX_TICK_MS = 5 * 60 * 1000;

  const MAX_TRACK_PTS = 1500;   // décimation du tracé archivé
  const MAX_SORTIES   = 500;    // garde-fou quota : purge FIFO au-delà

  const LS_ENABLED = "myktamap_journal_enabled";   // "0" = carnet désactivé

  // ───────── ÉTAT RAM ─────────

  let _cur        = null;   // sortie en cours (objet record) ou null
  let _baseline   = null;   // compteurs au démarrage de la sortie
  let _flushTimer = null;
  let _lastTick   = null;   // null = onglet caché (comptage suspendu)
  let _photoIds   = [];     // refs photos ajoutées pendant la sortie

  // ───────── HELPERS ─────────

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

  // ───────── IDB ─────────

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

  // ⚠️ Les lectures retournent la promesse de LEUR REQUÊTE (adoptée par
  // `resolve(out)` dans _tx), jamais une variable remplie par effet de bord :
  // dépendre de l'ordre « onsuccess de la requête AVANT oncomplete de la
  // transaction » est vrai selon la spec IDB mais fragile (et faux dès qu'on
  // teste avec un double). Ici, la valeur résolue EST le résultat lu.
  function list() {
    return _tx("readonly", function(st) { return _reqP(st.getAll()); })
      .then(function(arr) {
        const out = Array.isArray(arr) ? arr : [];
        // Tri antéchronologique (la plus récente en tête) — l'index by_start ne
        // sert qu'à la purge FIFO, getAll() suffit aux volumes visés (< 500).
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

  // 🐛 v1.74.0 (repro KARMA : « la liste affiche ma note, mais la fiche est
  // vide et je ne peux que la réécrire ») — CAUSE RACINE : setNote écrivait
  // en IDB SANS toucher `_cur`, l'objet RAM de la sortie EN COURS. Or `flush()`
  // ré-écrit `_snapshot()` (= `_cur`) toutes les 30 s et à la fermeture du
  // plan. Sur la sortie en cours, la séquence était donc :
  //   setNote → note en base ✅ → la liste (relue) l'affiche ✅
  //   flush 30 s plus tard → _put(_cur) SANS note → note écrasée en base ❌
  //   fiche rouverte → get() frais → note perdue ❌
  // La note semblait « posée puis oubliée », exactement le symptôme décrit.
  // Fix : quand l'id visé est celui de la sortie en cours, on met aussi à
  // jour `_cur` — le prochain flush réécrit alors la bonne valeur.
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

  // Purge FIFO si le carnet dépasse MAX_SORTIES (garde-fou quota IDB).
  function _purgeSiBesoin() {
    return list().then(function(all) {
      if (all.length <= MAX_SORTIES) return;
      const trop = all.slice(MAX_SORTIES);   // liste triée récent → ancien
      console.warn("[Journal] Purge FIFO : " + trop.length + " sortie(s) la/les plus ancienne(s)");
      return Promise.all(trop.map(function(r) { return remove(r.id); }));
    }).catch(function() {});
  }

  // ───────── COLLECTE ─────────

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

  // Distance EXPLOITABLE : podomètre + tronçons estimés entre les
  // « 📍 Je suis ici » (tracking.js, 16/08/2026). Avant, le carnet ne lisait
  // que le podomètre — une sortie de navigation pure valait 0 m et se faisait
  // jeter. Repli sur la mesure seule si le tracker est d'une version antérieure.
  function _trackerDistM() {
    try {
      if (typeof window.getTrackingDistanceTotaleM === "function") {
        return Number(window.getTrackingDistanceTotaleM()) || 0;
      }
      return (typeof window.getTrackingDistanceM === "function")
        ? (Number(window.getTrackingDistanceM()) || 0) : 0;
    } catch(e) { return 0; }
  }

  // Part estimée du total ci-dessus — stockée à part pour que la fiche puisse
  // dire « 820 m dont 600 estimés » : mesuré et estimé ne se valent pas.
  function _trackerDistEstimeeM() {
    try {
      return (typeof window.getTrackingDistanceEstimeeM === "function")
        ? (Number(window.getTrackingDistanceEstimeeM()) || 0) : 0;
    } catch(e) { return 0; }
  }

  // Nombre de « 📍 Je suis ici » validés depuis le début de la sortie.
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

  // Tracé de la sortie = portion de la timeline postérieure au démarrage,
  // décimée à MAX_TRACK_PTS (premier et dernier points toujours conservés).
  // Champs réduits : {x, y, t, level?} — pas de deltaMs/type (inutiles au replay
  // de fiche, et ça divise le poids par ~2).
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

  // 🚶 / 🖥️ — classement AUTO d'après le seul signal fiable : le déplacement.
  // Ni la durée ni le nombre d'ajouts ne discriminent (on peut passer 3 h à
  // dessiner assis, comme parcourir 2 km sans rien annoter).
  //
  // 16/08/2026 — deux corrections :
  //   • un « 📍 Je suis ici » validé bascule en terrain À LUI SEUL : l'user
  //     affirme être physiquement passé par un point précis, c'est le geste
  //     terrain le moins ambigu de l'app (et il ne produit AUCUN pas PDR).
  //   • le déplacement mesuré doit franchir MIN_TERRAIN_DIST_M. Avant, un
  //     unique pas parasite (téléphone posé sur une table qui vibre) classait
  //     une soirée de dessin en « sortie » et faussait les totaux.
  function _classer(rec) {
    if (!rec) return TYPE_BUREAU;
    if (Number(rec.validations) > 0) return TYPE_TERRAIN;
    return (Number(rec.distM) >= MIN_TERRAIN_DIST_M) ? TYPE_TERRAIN : TYPE_BUREAU;
  }

  function _nbAjouts(rec) {
    const a = (rec && rec.ajouts) || {};
    return (a.points || 0) + (a.roads || 0) + (a.zones || 0) + (a.structures || 0) + (a.photos || 0);
  }

  // Met à jour le record en cours depuis l'état RAM. Ne persiste pas.
  function _snapshot() {
    if (!_cur || !_baseline) return null;
    _tickActive();
    const now = _now();
    const c   = _counts();
    // Clamp à 0 : une suppression nette ne doit pas afficher un ajout négatif.
    _cur.ajouts = {
      points:     Math.max(0, c.points     - _baseline.points),
      roads:      Math.max(0, c.roads      - _baseline.roads),
      zones:      Math.max(0, c.zones      - _baseline.zones),
      structures: Math.max(0, c.structures - _baseline.structures),
      photos:     _photoIds.length
    };
    const d = _trackerDistM();
    // Ré-ancrage si la distance a reculé (session effacée / tracker reset) :
    // sans ça, le delta partirait négatif pour le reste de la sortie.
    if (d < _baseline.distM) _baseline.distM = d;
    _cur.distM = Math.max(0, d - _baseline.distM);
    // Part estimée (tronçons entre « 📍 Je suis ici ») — même ré-ancrage.
    const de = _trackerDistEstimeeM();
    if (de < _baseline.distEstM) _baseline.distEstM = de;
    _cur.distEstimeeM = Math.max(0, de - _baseline.distEstM);
    _cur.validations  = _validationsDepuis(_baseline.validations);
    _cur.track = _trackDepuis(_cur.startedAtMs);
    // steps = VRAIS pas PDR appliqués (même définition que statsGlobales), pas
    // la longueur du tracé archivé : celui-ci est décimé, il ne compte rien.
    _cur.steps = _stepsDepuis(_cur.startedAtMs);
    _cur.levels = _niveauxVus(_cur.track);
    _cur.photoIds = _photoIds.slice();
    _cur.wallMs = Math.max(0, now - _cur.startedAtMs);
    // Classement re-évalué à chaque snapshot : une session qui démarre au bureau
    // devient « terrain » dès le premier pas. L'inverse n'arrive jamais (le
    // déplacement ne se dé-parcourt pas), donc pas d'oscillation.
    if (!_cur.typeManuel) _cur.type = _classer(_cur);
    _cur.updatedAt = new Date().toISOString();
    return _cur;
  }

  // ───────── TEMPS ACTIF ─────────

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

  // ───────── CYCLE DE VIE ─────────

  // Appelé par main.js APRÈS SessionPersist.onPlanLoaded (baseline = état
  // restauré, sinon une session restaurée compterait comme des ajouts du jour).
  function onPlanLoaded(planId, planName) {
    if (!isEnabled()) return null;
    // Filet : une sortie encore ouverte (plan switch sans passer par le
    // teardown, cas dégénéré) est clôturée avant d'en ouvrir une nouvelle.
    if (_cur) { try { _finaliser("auto"); } catch(e) {} }

    const startMs = _now();
    _baseline = _counts();
    _baseline.distM       = _trackerDistM();
    _baseline.distEstM    = _trackerDistEstimeeM();
    // La timeline du plan est RESTAURÉE au chargement : les validations d'une
    // sortie précédente y sont déjà. Sans cette baseline, elles seraient
    // recomptées et classeraient d'office la nouvelle session en terrain.
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
      // Toute session démarre « bureau » : elle ne devient terrain qu'au premier
      // déplacement réel. `typeManuel` = classement corrigé par l'user, figé.
      type:        TYPE_BUREAU,
      typeManuel:  false,
      appVersion:  (window.__MKM__ && window.__MKM__.build) || null
    };
    _lastTick = (document.visibilityState === "hidden") ? null : startMs;
    _startTimer();
    console.log("[Journal] Sortie ouverte :", _cur.id, "—", _cur.planName);
    return { id: _cur.id, startedAt: _cur.startedAt };
  }

  function _planNameCourant() {
    try {
      if (window.PLAN_CONFIG && window.PLAN_CONFIG.plan && window.PLAN_CONFIG.plan.name) {
        return window.PLAN_CONFIG.plan.name;
      }
    } catch(e) {}
    return null;
  }

  // Vaut-il le coup de garder cette session ? (archivage AUTO uniquement — la
  // clôture manuelle garde sans condition).
  //   • critère terrain : ≥ 50 m parcourus. Le « ≥ 1 ajout » du lot 1 est
  //     VOLONTAIREMENT absent — c'est lui qui faisait entrer chaque soirée de
  //     dessin dans le carnet.
  //   • critère bureau : ≥ 10 min actives ET ≥ 1 ajout (une vraie séance de
  //     travail, pas un plan ouvert puis refermé).
  //
  // ⚠️ 16/08/2026 — les deux critères sont désormais un OU, plus un AIGUILLAGE
  // sur le type. L'ancienne version ne testait QUE la branche correspondant au
  // classement : une session basculée « terrain » par un seul pas PDR n'était
  // plus jugée que sur ses 50 m, et 3 h de travail avec 20 ajouts partaient à
  // la poubelle sans appel. Le type redevient ce qu'il aurait toujours dû
  // être — un libellé d'affichage, pas un juge.
  function _pertinente(rec) {
    if (!rec) return false;
    const terrainOk = Number(rec.distM) >= MIN_DIST_M;
    const bureauOk  = (Number(rec.activeMs) >= MIN_BUREAU_ACTIVE_MS) &&
                      (_nbAjouts(rec) >= MIN_BUREAU_AJOUTS);
    return terrainOk || bureauOk;
  }

  // 🐢 Repasse les tronçons estimés « à vol d'oiseau » en distance RÉELLE sur le
  // réseau, puis recalcule les distances du record. Le calcul ne se fait PLUS au
  // clic « 📍 Je suis ici » (il y coûtait une reconstruction de graphe par clic,
  // doublée par la replanification d'itinéraire — retour terrain KARMA 17/08).
  //
  // Les roads sont CAPTURÉES ici et passées explicitement : l'affinage tourne au
  // moment où on quitte le plan, lire l'état courant plus tard calculerait sur le
  // plan suivant.
  function _affinerDistances(rec, baseDist, baseEst) {
    if (typeof window.affinerEstimationsTracker !== "function") return Promise.resolve();
    let roads = [];
    try {
      const s = (typeof window.getRoads === "function") ? (window.getRoads() || []) : [];
      const e = (typeof window.getAllEmbeddedRoads === "function")
        ? (window.getAllEmbeddedRoads() || [])
        : ((typeof window.getEmbeddedRoads === "function") ? (window.getEmbeddedRoads() || []) : []);
      roads = s.concat(e);
    } catch(e) { roads = []; }
    if (!roads.length) return Promise.resolve();
    return window.affinerEstimationsTracker(roads).then(function(bilan) {
      if (!bilan || !bilan.runs) return;
      rec.distM        = Math.max(0, _trackerDistM()        - (Number(baseDist) || 0));
      rec.distEstimeeM = Math.max(0, _trackerDistEstimeeM() - (Number(baseEst)  || 0));
      if (!rec.typeManuel) rec.type = _classer(rec);
    }).catch(function() {});
  }

  // reason : "auto" (teardown / fermeture) | "manual" (bouton Clôturer)
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

    // ⚠️ L'affinage passe AVANT le test de pertinence : 30 m à vol d'oiseau
    // peuvent valoir 200 m de galeries. Juger la sortie sur la ligne droite puis
    // la jeter reproduirait EXACTEMENT le défaut que ce lot corrige.
    return _affinerDistances(rec, baseDist, baseEst).then(function() {
      return _finaliserSuite(rec, id, reason);
    });
  }

  function _finaliserSuite(rec, id, reason) {
    if (reason !== "manual" && !_pertinente(rec)) {
      // Sortie trop maigre : on jette, y compris l'éventuel flush « en cours »
      // déjà écrit en IDB (sinon un fantôme « en cours » resterait au carnet).
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

  // Appelé par main.js > _libererRessourcesPlanPrecedent (après
  // SessionPersist.onPlanUnload, avant le teardown qui vide la timeline).
  function onPlanUnload() {
    if (!_cur) return Promise.resolve(null);
    return _finaliser("auto");
  }

  // Clôture manuelle : garde TOUJOURS, puis rouvre immédiatement une nouvelle
  // sortie sur le même plan (l'user continue d'explorer après avoir « posé »
  // une étape dans son carnet).
  function cloturer() {
    if (!_cur) return Promise.resolve(null);
    const planId = _cur.planId, planName = _cur.planName;
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

  // Hook posé dans photos.js > addPhoto (succès). Ne compte QUE les photos
  // réellement prises pendant la sortie — pas celles restaurées par un import
  // de session (restorePhoto n'appelle pas ce hook, volontairement).
  function onPhotoAdded(photoId, planId) {
    if (!_cur || !photoId) return;
    if (planId && _cur.planId && String(planId) !== String(_cur.planId)) return;
    _photoIds.push(String(photoId));
  }

  // Corrige à la main le classement d'une session archivée (bouton 🚶 / 🖥️ de
  // la fiche). Pose `typeManuel` → plus aucun recalcul auto sur ce record.
  // ⚠️ MÊME PIÈGE que setNote (corrigé en même temps, v1.74.0) : sans la mise
  // à jour de `_cur`, un reclassement manuel sur la sortie EN COURS était
  // annulé au flush suivant — et pire, `_snapshot()` reclasse automatiquement
  // tant que `typeManuel` est absent, donc le choix de l'user était non
  // seulement perdu mais ACTIVEMENT écrasé par le classement auto.
  function setType(id, type) {
    const t = (type === TYPE_TERRAIN) ? TYPE_TERRAIN : TYPE_BUREAU;
    const estCourante = !!(_cur && String(_cur.id) === String(id));
    return get(id).then(function(rec) {
      // ⚠️ 16/08/2026 — la sortie EN COURS n'est écrite en IDB qu'au premier
      // flush (30 s). Avant ce délai, `get` rendait null et le reclassement
      // partait en SILENCE : invisible tant que le seul point d'entrée était
      // la fiche d'une sortie archivée, mais le bouton 🚶/🖥️ de la modale
      // Session vise justement la sortie en cours, souvent toute fraîche.
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

  // Agrégat : les TOTAUX ne comptent que le TERRAIN (une soirée de dessin n'est
  // pas du temps passé sous terre). Le bureau est compté à part, jamais mélangé.
  function stats() {
    return list().then(function(all) {
      let ms = 0, m = 0, nbT = 0, nbB = 0, bureauMs = 0;
      const plans = {};
      all.forEach(function(r) {
        if ((r.type || TYPE_BUREAU) === TYPE_TERRAIN) {
          nbT++;
          ms += Number(r.activeMs) || 0;
          m  += Number(r.distM)    || 0;
          if (r.planId) plans[r.planId] = 1;
        } else {
          nbB++;
          bureauMs += Number(r.activeMs) || 0;
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

  // ───────── REPRISE APRÈS CRASH ─────────

  // Un record reste en `status: "encours"` si l'app est morte sans passer par
  // onPlanUnload (kill mémoire iOS, crash, onglet tué). Sans ce balayage au
  // boot, ces sorties fantômes s'accumuleraient dans le carnet — et celles qui
  // n'avaient pas atteint les seuils (plan ouvert 40 s pour vérifier un détail,
  // flushé une fois) n'auraient JAMAIS l'occasion d'être jetées, puisque le
  // filtre de pertinence ne joue qu'à la finalisation.
  function _balayerEnCours() {
    return list().then(function(all) {
      // Garde anti-race : la sortie EN COURS ne doit jamais être régularisée par
      // son propre balayage (elle n'est écrite en IDB qu'au premier flush, mais
      // un balayage retardé pourrait la croiser).
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

  // ───────── FILETS ─────────

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
  // beforeunload : l'écriture IDB peut ne pas aboutir (page qui disparaît) —
  // c'est le flush 30 s + celui du visibilitychange qui font le vrai travail.
  window.addEventListener("beforeunload", function() { _tickActive(); flush(); });

  // ───────── EXPORT ─────────

  window.Journal = {
    onPlanLoaded: onPlanLoaded,
    onPlanUnload: onPlanUnload,
    onPhotoAdded: onPhotoAdded,
    cloturer:     cloturer,
    flush:        flush,
    getCurrent:   getCurrent,
    list:         list,
    get:          get,
    remove:       remove,
    setNote:      setNote,
    setType:      setType,
    stats:        stats,
    TYPE_TERRAIN: TYPE_TERRAIN,
    TYPE_BUREAU:  TYPE_BUREAU,
    isEnabled:    isEnabled,
    setEnabled:   setEnabled,
    DB_NAME:      DB_NAME
  };

  // Balayage différé : le boot a mieux à faire que d'ouvrir une IDB. 4 s après
  // le load, l'app est stabilisée (plan chargé ou HOME affiché).
  if (isEnabled()) {
    setTimeout(function() { _balayerEnCours(); }, 4000);
  }

  console.log("[Journal] Module chargé (DB " + DB_NAME + " v" + DB_VERSION + ")");
})();
