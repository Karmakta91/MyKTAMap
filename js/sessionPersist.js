/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * https://myktamap.fr — Licence CC BY-NC-SA 4.0
 * Usage commercial interdit sans accord ecrit prealable. Voir LICENSE.
 */

// sessionPersist.js — auto-sauvegarde de la session active, un slot par plan.
// Expose : window.SessionPersist (onPlanLoaded, onPlanUnload, save, clear, getSaved(planId?),
//   getLastSaveInfo, normNomPlan).
// Slot `myktamap_session_v1_<planId>` via window.KtaSessionStore (js/sessionStore.js : lecture synchrone
// en mémoire, écriture IndexedDB en arrière-plan, repli localStorage). Changer de plan n'efface rien : la
// session de chaque plan reste dans son slot. Polling par empreinte + save forcé sur beforeunload et
// visibilitychange. Restauration appelée par main.js via onPlanLoaded(planId).
// Le tracé visible du tracker n'est pas persisté (seule sa timeline l'est).
// ⚠️ Plan partagé par une extension (KtaExtensions.effacementPartage) : « Effacer la session » fait choisir entre
//   vider l'appareil (tout revient de la synchro), supprimer mes ajouts ou tout supprimer pour l'organisation
//   (une trace de suppression par objet visé, sinon les objets reviennent du serveur).
// 🩸 Jamais localStorage["myktamap_session_v1_…"] en direct ailleurs qu'ici, dans sessionStore.js et utils.js.
// Garde-fou : scripts/check-session-store.js · Doc : docs/architecture/session-data.md

(function() {
  "use strict";

  const STORAGE_PREFIX = "myktamap_session_v1_";
  function _storageKeyFor(planId) {
    if (!planId) return null;
    return STORAGE_PREFIX + planId;
  }
  // Repli localStorage direct si js/sessionStore.js manque (page de test, chargement partiel) : même API.
  const _STORE_LS = {
    mode: function() { return "ls"; },
    lire: function(id) { try { return localStorage.getItem(STORAGE_PREFIX + id); } catch(e) { return null; } },
    ecrire: function(id, brut) { localStorage.setItem(STORAGE_PREFIX + id, brut); return true; },
    retirer: function(id) { try { localStorage.removeItem(STORAGE_PREFIX + id); } catch(e) {} }
  };
  function _store() { return window.KtaSessionStore || _STORE_LS; }
  // Ancien slot unique, lu seulement pour la migration au boot.
  const STORAGE_KEY_LEGACY = "myktamap_session_v1";
  const POLL_INTERVAL_MS      = 1500;
  const POLL_INTERVAL_SLOW_MS = 30000;  // PerfUltra.slowSave

  function _currentPollInterval() {
    if (window.PerfUltra && window.PerfUltra.get("slowSave")) {
      return POLL_INTERVAL_SLOW_MS;
    }
    return POLL_INTERVAL_MS;
  }
  const VERSION = 1;

  let _pollTimer     = null;
  let _lastHash      = null;
  let _currentPlanId = null;
  // Toast quota une seule fois, réarmé au premier save réussi.
  let _quotaWarned   = false;
  // 🩸 L'autosauvegarde ne supprime le slot d'un plan QUE si cette page l'a restauré ou écrit : sinon une
  // session écartée (nom de plan différent) serait effacée au 1er tick (carte vide = « état vide »).
  let _slotAssume    = false;
  // Question « restaurer la session d'un autre nom ? » en cours : aucune écriture tant qu'elle n'est pas tranchée.
  let _decisionEnAttente = false;
  // 🩸 Phase 2 de restauration (itinéraire différé) : à annuler sur « Effacer la session » ou changement de
  // plan, sinon l'itinéraire réapparaît 1,5 s plus tard.
  let _phase2TimeoutId = null;
  function _annulerPhase2() {
    if (_phase2TimeoutId !== null) {
      clearTimeout(_phase2TimeoutId);
      _phase2TimeoutId = null;
    }
  }

  // ── Migration de l'ancien slot unique ──────────────
  // `myktamap_session_v1` → `myktamap_session_v1_<planId>`. Idempotent (appelé à chaque onPlanLoaded).
  // Payload illisible ou sans planId : l'ancien slot est supprimé. Slot cible plus récent (savedAt) : il
  // n'est pas écrasé, seul l'ancien slot part.
  function _migrerAncienSlotUniqueSiBesoin() {
    let raw;
    try { raw = localStorage.getItem(STORAGE_KEY_LEGACY); } catch(e) { return; }
    if (!raw) return;
    let payload;
    try { payload = JSON.parse(raw); } catch(e) {
      try { localStorage.removeItem(STORAGE_KEY_LEGACY); } catch(e) {}
      return;
    }
    if (!payload || !payload.planId) {
      try { localStorage.removeItem(STORAGE_KEY_LEGACY); } catch(e) {}
      return;
    }
    const newKey = _storageKeyFor(payload.planId);
    if (!newKey) {
      try { localStorage.removeItem(STORAGE_KEY_LEGACY); } catch(e) {}
      return;
    }
    let existing;
    try {
      const existingRaw = _store().lire(payload.planId);
      existing = existingRaw ? JSON.parse(existingRaw) : null;
    } catch(e) { existing = null; }
    const legacyTs   = Date.parse(payload.savedAt  || 0) || 0;
    const existingTs = Date.parse(existing && existing.savedAt || 0) || 0;
    if (!existing || legacyTs > existingTs) {
      try {
        _store().ecrire(payload.planId, raw, { force: true });
        console.log("[SessionPersist] Migration legacy → per-plan : slot copié pour", payload.planId);
      } catch(e) {
        console.warn("[SessionPersist] Migration échouée (quota ?) :", e);
        return;  // garder l'ancien slot, retry au prochain boot
      }
    } else {
      console.log("[SessionPersist] Migration : slot per-plan plus récent, legacy ignoré pour", payload.planId);
    }
    try { localStorage.removeItem(STORAGE_KEY_LEGACY); } catch(e) {}
  }

  // ── État courant ──────────────
  function _gatherState() {
    // On sauve tout, itinéraires compris : c'est la restauration qui les échelonne (cf _applyRestore).
    return {
      editorPoints: window.getEditorPoints  ? (window.getEditorPoints()  || []) : [],
      roads:        window.getRoads         ? (window.getRoads()         || []) : [],
      zones:        window.getZones         ? (window.getZones()         || []) : [],
      // Champ absent d'une ancienne session = tableau vide à la restauration.
      structures:   window.getStructures    ? (window.getStructures()    || []) : [],
      // Deux mesures coexistent : `measure` = polyline distance, `measureSurface` = polygone surface.
      measure:        window.getMeasurePoints        ? (window.getMeasurePoints()        || []) : [],
      measureSurface: window.getMeasurePointsSurface ? (window.getMeasurePointsSurface() || []) : [],
      measureMode:  (typeof window.getMeasureMode === "function") ? window.getMeasureMode() : "distance",
      // Surcharges de légende de la session (libellés, masquages, couleurs, entrées custom) ; null = rien.
      customLegend: (window.LegendCustomization && window.LegendCustomization.getSessionState)
                      ? window.LegendCustomization.getSessionState()
                      : null,

      // Calques rapatriés (js/calqueSession.js) : seulement leurs ids, les objets sont déjà dans
      // roads/zones/structures/editorPoints (marqués `_srcCalque`). null tant que rien n'est rapatrié.
      calquesSession: (window.CalqueSession && window.CalqueSession.getSessionState)
                        ? window.CalqueSession.getSessionState()
                        : null,
      // Traces de suppression { uid, deletedAt } : sans elles, une synchro ressusciterait un objet supprimé.
      tombstones: window.KtaUid ? window.KtaUid.getTombstones() : [],

      // Timeline du tracker [{x, y, t, deltaMs, type ∈ start|pdr|recalage, level?}] pour stats / heatmap /
      // replay. Le tracé visible (polyline) n'est pas persisté (décision produit : un tracé restauré ferait
      // croire à un suivi en cours).
      trackerTimeline: (typeof window.getTrackingTimeline === "function")
                         ? (window.getTrackingTimeline() || [])
                         : [],
      trackerStartTs:  (typeof window.getTrackingStartTs  === "function")
                         ? (window.getTrackingStartTs()  || null)
                         : null,

      // Filtres runtime du FilterPanel (Set → Array) ; null = tout visible.
      runtimeFilters: _serializeRuntimeFilters()
    };
  }

  function _serializeRuntimeFilters() {
    const f = window._ktaRuntimeFilters;
    if (!f || typeof f !== "object") return null;
    function _s(set) { return (set instanceof Set) ? Array.from(set) : null; }
    return {
      tags:        _s(f.tags),
      roadTypes:   _s(f.roadTypes),
      zoneTypes:   _s(f.zoneTypes),
      structTypes: _s(f.structTypes),
      planDeBase:  (f.planDeBase === true || f.planDeBase === false) ? f.planDeBase : null
    };
  }

  // djb2 : suffit à détecter un changement.
  function _hashState(state) {
    const str = JSON.stringify(state);
    let h = 5381;
    for (let i = 0; i < str.length; i++) {
      h = ((h << 5) + h) ^ str.charCodeAt(i);
    }
    return h.toString(36);
  }

  function _isEmptyState(state) {
    // 🩸 « Vide » = slot SUPPRIMÉ par save(). Tout champ persisté doit compter ici, sinon une session qui
    // ne contient que lui (légende recolorée, surface, timeline, traces) est perdue au reload sans un mot.
    // La légende se délègue à LegendCustomization.isSessionStateEmpty, qui suit ses propres champs.
    const lcEmpty = !state.customLegend
                 || ((window.LegendCustomization && typeof window.LegendCustomization.isSessionStateEmpty === "function")
                      ? window.LegendCustomization.isSessionStateEmpty()
                      : ((!state.customLegend.labels        || Object.keys(state.customLegend.labels).length === 0)
                      && (!state.customLegend.hidden        || Object.keys(state.customLegend.hidden).length === 0)
                      && (!state.customLegend.colors        || Object.keys(state.customLegend.colors).length === 0)
                      && (!state.customLegend.borders       || Object.keys(state.customLegend.borders).length === 0)
                      && (!state.customLegend.customEntries || state.customLegend.customEntries.length === 0)));
    return state.editorPoints.length === 0
        && state.roads.length        === 0
        && state.zones.length        === 0
        && (state.structures || []).length === 0
        && state.measure.length      === 0
        && (state.measureSurface || []).length === 0
        && (state.trackerTimeline || []).length === 0
        // Traces seules = contenu : sinon tout supprimer effacerait les traces, et la synchro suivante
        // ressusciterait les objets supprimés.
        && (state.tombstones || []).length === 0
        && lcEmpty;
  }

  // ── Stockage ──────────────
  function _currentPlanName() {
    return (window.PLAN_CONFIG && window.PLAN_CONFIG.plan && window.PLAN_CONFIG.plan.name) || "";
  }

  // Throttle : un tick qui tombe pendant un long task (zoom, rendu de tuiles) saute son save pour ne pas
  // ajouter de jank ; l'empreinte fait reprendre la sauvegarde au tick suivant.
  let _lastForceSave = 0;
  function _mainThreadBusy() {
    // Micro-bench : ~50 µs au repos, > 5 ms si le CPU est contesté.
    const t0 = performance.now();
    let i = 0;
    while (i < 1000) i++;
    return (performance.now() - t0) > 5;
  }

  function save(opts) {
    if (!_currentPlanId) return false;
    if (_decisionEnAttente) return false;

    // force (beforeunload, visibilitychange) ignore le throttle ; après 6 sauts (~9 s) on sauve quand même.
    const force = opts && opts.force;
    if (!force && _mainThreadBusy()) {
      _lastForceSave++;
      if (_lastForceSave < 6) return false;
    }
    _lastForceSave = 0;

    if (window.KtaUid) window.KtaUid.purge();   // traces > 90 jours
    const state = _gatherState();
    const hash  = _hashState(state);
    if (hash === _lastHash) return false;

    if (_isEmptyState(state)) {
      // État vide : seul le slot du plan courant est effacé.
      if (_currentPlanId && _slotAssume) {
        try { _store().retirer(_currentPlanId); } catch(e) {}
      }
      _lastHash = hash;
      return false;
    }

    const payload = {
      version:      VERSION,
      planId:       _currentPlanId,
      planName:     _currentPlanName(),  // ← double-check anti-collision d'ID
      savedAt:      new Date().toISOString(),
      editorPoints: state.editorPoints,
      roads:        state.roads,
      // 🩸 Tout champ ajouté à _gatherState doit aussi figurer ici, sinon il n'est jamais écrit.
      structures:   state.structures || [],
      zones:        state.zones,
      measure:      state.measure,
      measureSurface: state.measureSurface || [],
      measureMode:    state.measureMode    || "distance",
      calquesSession: state.calquesSession || null,
      tombstones:     state.tombstones || [],   // purgées à 90 jours avant écriture
      customLegend:   state.customLegend   || null,
      runtimeFilters:  state.runtimeFilters  || null,
      trackerTimeline: state.trackerTimeline || [],
      trackerStartTs:  (typeof state.trackerStartTs === "number") ? state.trackerStartTs : null
    };
    const _writeKey = _storageKeyFor(_currentPlanId);
    if (!_writeKey) return false;
    try {
      const S = _store();
      S.ecrire(_currentPlanId, JSON.stringify(payload), { force: !!force });
      _slotAssume = true;
      _lastHash = hash;
      // En IndexedDB, l'écriture se confirme plus tard (écouteur surResultat plus bas) : l'état « enregistré »
      // n'est posé qu'à la confirmation. En localStorage, setItem a déjà réussi.
      if (S.mode() !== "idb" && S.mode() !== "attente") _ecritureReussie();
      return true;
    } catch(e) {
      _ecritureEchouee(e);
      return false;
    }
  }

  function _ecritureReussie() {
    _quotaWarned = false;
    _masquerBandeauStockage();
    _lastSaveTs = Date.now();    // « enregistré il y a N s » dans 📊 Détails
    _lastSaveKo = false;
  }

  function _ecritureEchouee(e) {
    console.warn("[SessionPersist] save échoué :", e);
    // Quota dépassé : sur mobile, souvent le signe d'une purge proche. Toast une fois pour pousser à exporter.
    const isQuota =
      e && (e.name === "QuotaExceededError" ||
            e.code === 22 ||                       // historique Chrome/Safari
            e.code === 1014 ||                     // Firefox NS_ERROR_DOM_QUOTA_REACHED
            /quota|storage/i.test(e.message || ""));
    if (isQuota && !_quotaWarned && window.OOMGuard) {
      _quotaWarned = true;
      window.OOMGuard.showToast(
        (window.I18n && window.I18n.t) ? window.I18n.t("session.toast.storageFull")
          : "Espace de stockage du smartphone saturé — la session ne peut plus être sauvegardée automatiquement. Pense à exporter ta session (💾 Enregistrer la session) pour ne rien perdre.",
        "error"
      );
    }
    // 🩸 Le toast passe une fois et s'efface : le bandeau, lui, reste à CHAQUE échec (bouton d'export) et
    // tombe au premier save réussi. Sans lui, l'app échoue en silence pendant des heures.
    if (isQuota) _afficherBandeauStockage();
    // En IndexedDB, un refus faute de place = la mémoire des sessions est pleine : on le dit
    // (en localStorage, c'est l'événement mktm:stockage-plein qui s'en charge).
    if (isQuota && _store().mode() === "idb") _verifierMemoire(true);
    _lastSaveKo = true;   // l'écran de détails le dit en rouge
  }

  // Résultat (asynchrone) d'une écriture IndexedDB. Échec → l'empreinte est oubliée :
  // le prochain tick de sauvegarde réessaie avec l'état courant.
  if (window.KtaSessionStore && typeof window.KtaSessionStore.surResultat === "function") {
    window.KtaSessionStore.surResultat(function(r) {
      if (!r || r.planId !== _currentPlanId) return;
      if (r.ok) { _ecritureReussie(); return; }
      _lastHash = null;
      _ecritureEchouee(r.erreur || new Error("IndexedDB"));
    });
  }

  // planId facultatif (défaut : plan courant) ; SessionBackups s'en sert pour viser le bon slot.
  function getSaved(planId) {
    const lookupId = planId || _currentPlanId;
    if (!lookupId) return null;
    try {
      const raw = _store().lire(lookupId);
      if (!raw) return null;
      const payload = JSON.parse(raw);
      if (!payload || payload.version !== VERSION) return null;
      return payload;
    } catch(e) {
      console.warn("[SessionPersist] read échoué :", e);
      return null;
    }
  }

  // Heure du dernier save réussi (repli : savedAt du slot), affichée dans 📊 Détails.
  let _lastSaveTs = null;
  let _lastSaveKo = false;
  function getLastSaveInfo() {
    let ts = _lastSaveTs;
    if (!ts) {
      try { const p = getSaved(); if (p && p.savedAt) ts = Date.parse(p.savedAt) || null; } catch(e) {}
    }
    return { ts: ts, ko: _lastSaveKo };
  }

  // Contenu de la session courante, pour une confirmation chiffrée.
  // `sansCopies` : les copies des calques ouverts à l'équipe (`_srcCalque`) sont comptées à part (`copies`) — leur
  // sort dépend de la case « Rendre aussi les calques », jamais de l'effacement des objets.
  function _compterEtatCourant(sansCopies) {
    let copies = 0;
    const len = function(fn) {
      try {
        const a = (typeof window[fn] === "function") ? window[fn]() : null;
        if (!Array.isArray(a)) return 0;
        if (!sansCopies) return a.length;
        const c = a.filter(function(o) { return o && o._srcCalque !== undefined; }).length;
        copies += c;
        return a.length - c;
      } catch(e) { return 0; }
    };
    const n = { pts: len("getEditorPoints"), roads: len("getRoads"), zones: len("getZones"), structs: len("getStructures") };
    n.copies = copies;
    return n;
  }

  function clear(opts) {
    // Snapshot 📦 Backups avant l'effacement, au mieux (IDB asynchrone ; le snapshot périodique couvre le
    // reste). `opts.snapshotFait` : l'appelant l'a déjà pris ET attendu.
    if (!(opts && opts.snapshotFait) &&
        window.SessionBackups && typeof window.SessionBackups.snapshot === "function") {
      try { window.SessionBackups.snapshot("before-clear-session"); } catch(e) {}
    }
    // Seul le slot du plan courant.
    if (_currentPlanId) {
      try { _store().retirer(_currentPlanId); } catch(e) {}
    }
    _slotAssume = false;
    // 🩸 Le verrou tombe avec la copie, jamais l'un sans l'autre : effacer détruit les objets rapatriés, et
    // un verrou resté masquerait le calque d'origine (relevé disparu, plan cru cassé).
    if (window.CalqueSession && typeof window.CalqueSession.listeRapatries === "function") {
      try {
        window.CalqueSession.listeRapatries().forEach(function(id) {
          window.CalqueSession.restituer(id, { local: true });   // pas une restitution partagée
        });
        // Les restitutions partagées (connues ou à envoyer) survivent : « Rendre aussi les calques à l'équipe »
        // vient d'en noter une, que la synchro qui suit doit encore envoyer.
        const st = window.CalqueSession.getSessionState();
        window.CalqueSession.loadSessionState(st ? { restitutions: st.restitutions, aEnvoyer: st.aEnvoyer } : null);
      } catch(e) { console.warn("[SessionPersist] liberation des calques :", e); }
    }
    _lastHash = null;
    // Une installation reliée en déduit qu'il faut tout relire (sinon les objets des
    // autres ne reviennent jamais). No-op sans écouteur.
    try { window.dispatchEvent(new CustomEvent("mktm:session-cleared", { detail: { planId: _currentPlanId || null } })); } catch(e) {}
    _annulerPhase2();
  }

  // 🩸 Traducteur de portée MODULE : le `_t` de la modale est local à sa fonction, et un ReferenceError
  // dans le bandeau serait avalé par son try (bandeau jamais affiché).
  function _trModule(k, p) { return (window.I18n && window.I18n.t) ? window.I18n.t(k, p) : k; }

  // ── Bandeau « sauvegarde impossible » ──────────────
  function _afficherBandeauStockage() {
    if (document.getElementById("kta-storage-banner")) return;
    try {
      const b = document.createElement("div");
      b.id = "kta-storage-banner";
      b.className = "kta-storage-banner";
      b.setAttribute("role", "alert");
      const txt = document.createElement("span");
      txt.className = "kta-storage-banner-txt";
      txt.textContent = _trModule("session.banner.storageFull");
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "kta-btn kta-btn-primary kta-storage-banner-btn";
      btn.textContent = _trModule("session.banner.exportBtn");
      btn.addEventListener("click", function() {
        if (typeof window.ouvrirExportSessionModal === "function") window.ouvrirExportSessionModal("full", true);
      });
      b.appendChild(txt);
      b.appendChild(btn);
      document.body.appendChild(b);
    } catch(e) { console.warn("[SessionPersist] bandeau stockage :", e); }
  }
  function _masquerBandeauStockage() {
    const b = document.getElementById("kta-storage-banner");
    if (b) b.remove();
  }

  // ── Restauration ──────────────
  function _applyRestore(payload) {
    if (!payload) return null;
    const restored = { points: 0, roads: 0, zones: 0, structures: 0, measure: 0, measureSurface: 0 };
    try {
      // 🩸 La légende d'abord, les objets ensuite : sinon les objets d'un type custom se rendent au repli
      // (blanc/gris), couleurs surchargées invisibles, de façon intermittente.
      if (window.LegendCustomization && typeof window.LegendCustomization.loadSessionState === "function") {
        window.LegendCustomization.loadSessionState(payload.customLegend);
      }

      // La LISTE des calques rapatriés se charge ici, les VERROUS en fin de restauration : appliquerVerrous
      // a besoin des objets restaurés pour vérifier que la copie existe.
      if (window.CalqueSession && typeof window.CalqueSession.loadSessionState === "function") {
        window.CalqueSession.loadSessionState(payload.calquesSession);
      }

      // Identifiants : un objet sans uid en reçoit un, son updatedAt = savedAt de la session (pas
      // « maintenant »). Set partagé entre les 4 familles : un uid en double est régénéré. Avant le
      // découpage en deux phases, pour que l'itinéraire différé ait le même repli.
      // ⚠️ `VERSION` ne change pas : une ancienne app relit la session (champs inconnus ignorés).
      if (window.KtaUid) {
        const repli = Date.parse(payload.savedAt) || Date.now();
        const vus = new Set();
        const n = window.KtaUid.ensureAll(payload.editorPoints, "pt", repli, vus)
                + window.KtaUid.ensureAll(payload.roads, "rd", repli, vus)
                + window.KtaUid.ensureAll(payload.zones, "zn", repli, vus)
                + window.KtaUid.ensureAll(payload.structures, "st", repli, vus);
        if (n > 0) console.log("[SessionPersist] Identifiants posés sur " + n + " objet(s) (migration v2.1.0)");
        // Traces de suppression du plan (absentes = liste vide), purgées au-delà de 90 jours.
        window.KtaUid.setTombstones(payload.tombstones);
        const purgees = window.KtaUid.purge();
        if (purgees > 0) console.log("[SessionPersist] " + purgees + " trace(s) de suppression de plus de 90 jours purgée(s)");
      }

      // Les setters redessinent en interne (setEditorPoints, setRoads, setZones, setStructures).
      if (window.setEditorPoints && Array.isArray(payload.editorPoints)) {
        window.setEditorPoints(payload.editorPoints);
        restored.points = payload.editorPoints.length;
      }
      // 🩸 Tracés en DEUX PHASES : tout sauf les itinéraires tout de suite, les itinéraires à +1500 ms. Leur
      // halo (drop-shadow CSS double) cumulé au boot (Leaflet pas stabilisé, tuiles V2 en cours, init des
      // modules) sature le GPU mobile → crash silencieux et reload en boucle. Le délai mime l'import manuel,
      // où l'app est déjà stable. Les entrées sans `type` (corrompues) sont écartées.
      if (Array.isArray(payload.roads)) {
        const safeRoads = payload.roads.filter(function(r) {
          return r && typeof r.type === "string" && r.type.length > 0;
        });
        const phaseImmediat = safeRoads.filter(function(r) { return r.type !== "itinerary"; });
        const phaseDifferee = safeRoads.filter(function(r) { return r.type === "itinerary"; });

        if (window.resetRoads) window.resetRoads();
        if (window.setRoads)   window.setRoads(phaseImmediat);
        restored.roads = safeRoads.length;  // total annoncé, l'itinéraire arrive après

        // Phase 2 : concat sur getRoads() courant, pour garder un tracé dessiné entre-temps.
        if (phaseDifferee.length > 0) {
          _annulerPhase2();   // double restauration : une seule phase 2
          _phase2TimeoutId = setTimeout(function() {
            _phase2TimeoutId = null;
            try {
              const current = window.getRoads ? (window.getRoads() || []) : [];
              // Un itinéraire créé entre-temps gagne : deux itinéraires cassent le label distance.
              const dejaIti = current.some(function(r) { return r && r.type === "itinerary"; });
              if (dejaIti) {
                console.info("[SessionPersist] phase 2 itinéraire : skip (un itinéraire actif existe déjà après la phase 1)");
                return;
              }
              if (window.setRoads) window.setRoads(current.concat(phaseDifferee));
              console.info("[SessionPersist] phase 2 : itinéraire restauré en mode différé");
              // 🩸 Sans ça, le tracé revient sans ses étapes ① ② ③ ni ses ✓.
              if (typeof window.itineraireRedessinerDepuisRoad === "function") {
                try { window.itineraireRedessinerDepuisRoad(); } catch(e) { console.warn("[SessionPersist] étapes itinéraire :", e); }
              }
            } catch(e) {
              console.warn("[SessionPersist] phase 2 échec restauration itinéraire :", e);
            }
          }, 1500);
        }
      }
      if (Array.isArray(payload.zones)) {
        if (window.resetZones) window.resetZones();
        if (window.setZones)   window.setZones(payload.zones);
        restored.zones = payload.zones.length;
      }
      // Champ absent (ancienne session) : aucun reset, rien n'est écrasé.
      if (Array.isArray(payload.structures)) {
        if (window.resetStructures) window.resetStructures();
        if (window.setStructures)   window.setStructures(payload.structures);
        restored.structures = payload.structures.length;
      }
      // Le mode ne pilote que le footer et la cible des prochains clics ; il n'efface rien.
      if (typeof window.setMeasureMode === "function" && typeof payload.measureMode === "string") {
        window.setMeasureMode(payload.measureMode);
      }
      if (window.setMeasurePoints && Array.isArray(payload.measure)) {
        window.setMeasurePoints(payload.measure);
        restored.measure = payload.measure.length;
      }
      if (window.setMeasurePointsSurface && Array.isArray(payload.measureSurface)) {
        window.setMeasurePointsSurface(payload.measureSurface);
        restored.measureSurface = payload.measureSurface.length;
      }

      // Timeline seule : le tracker ne redémarre pas, l'utilisateur relance ▶️ pour reprendre les capteurs.
      if (typeof window.setTrackingTimeline === "function" && Array.isArray(payload.trackerTimeline)) {
        window.setTrackingTimeline(payload.trackerTimeline, payload.trackerStartTs || null);
        restored.trackerTimeline = payload.trackerTimeline.length;
      }

      // Filtres runtime : Array → Set ; null par champ = pas de filtre sur ce champ.
      if (payload.runtimeFilters && typeof payload.runtimeFilters === "object") {
        const rf = payload.runtimeFilters;
        if (!window._ktaRuntimeFilters) {
          window._ktaRuntimeFilters = { tags: null, roadTypes: null, zoneTypes: null, structTypes: null };
        }
        function _toSet(arr) { return Array.isArray(arr) ? new Set(arr) : null; }
        window._ktaRuntimeFilters.tags        = _toSet(rf.tags);
        window._ktaRuntimeFilters.roadTypes   = _toSet(rf.roadTypes);
        window._ktaRuntimeFilters.zoneTypes   = _toSet(rf.zoneTypes);
        window._ktaRuntimeFilters.structTypes = _toSet(rf.structTypes);
        // Préférence d'affichage, pas un filtre : ne compte pas dans le toast « filtres restaurés ».
        // null = automatique (suit le niveau 0). Ancienne session : `garderFond: true` = fond forcé affiché.
        window._ktaRuntimeFilters.planDeBase  = (rf.planDeBase === true || rf.planDeBase === false)
          ? rf.planDeBase : (rf.garderFond === true ? true : null);
        const _active = [];
        if (window._ktaRuntimeFilters.tags        !== null) _active.push("tags");
        if (window._ktaRuntimeFilters.roadTypes   !== null) _active.push("roadTypes");
        if (window._ktaRuntimeFilters.zoneTypes   !== null) _active.push("zoneTypes");
        if (window._ktaRuntimeFilters.structTypes !== null) _active.push("structTypes");
        restored.runtimeFilters = _active.length;
        // Différé : les marqueurs de session doivent être posés avant le re-rendu filtré.
        setTimeout(function() {
          if (typeof window.appliquerFiltreRuntime === "function") {
            try { window.appliquerFiltreRuntime(); } catch(e) {}
          }
          // 🩸 Des filtres restaurés en silence = « où sont passés mes points ? » : toast + pastille ≡.
          if (window.FilterPanel && typeof window.FilterPanel.majBadge === "function") {
            try { window.FilterPanel.majBadge(); } catch(e) {}
          }
          if (_active.length > 0 && window.OOMGuard && typeof window.OOMGuard.showToast === "function") {
            window.OOMGuard.showToast(_trModule("session.toast.filtresRestaures", { n: _active.length }), "warn", { groupe: "chargement" });   // regroupé au chargement
          }
        }, 200);
      }

      // 🏷️ ancre:verrous-calques-restaures
      // 🩸 Verrous des calques rapatriés, une fois les objets là : un verrou sans sa copie (sauvegarde
      // perdue sur quota) donnerait un plan vide et muet ; appliquerVerrous vérifie et libère en le disant.
      // Différé comme les filtres : la phase 2 ne doit pas réarmer un calque.
      if (window.CalqueSession && typeof window.CalqueSession.appliquerVerrous === "function") {
        setTimeout(function() {
          try { window.CalqueSession.appliquerVerrous(); } catch(e) {
            console.warn("[SessionPersist] verrous de calques :", e);
          }
        }, 250);
      }

      // Sinon le prochain poll prend les setters pour une modification.
      _lastHash = _hashState(_gatherState());
      return restored;
    } catch(e) {
      console.error("[SessionPersist] restore échoué :", e);
      return null;
    }
  }

  function _viderEtatCourant() {
    _annulerPhase2();
    // Remise à zéro locale : les traces de suppression partent aussi (décision produit).
    if (window.KtaUid) window.KtaUid.setTombstones([]);
    // 🩸 Un point qui porte une liaison inter-plan (portail) est gardé : la liaison vit dans son propre
    // registre et resterait orpheline. Pour le retirer : supprimer le point (InterPlanLinks.onPointDeleted).
    const portails = (typeof window.getEditorPoints === "function") ? (window.getEditorPoints() || []).filter(_estPortail) : [];
    if (window.setEditorPoints)  window.setEditorPoints(portails);
    if (window.resetRoads)       window.resetRoads();
    if (window.resetZones)       window.resetZones();
    if (window.resetStructures)  window.resetStructures();
    // Seules les surcharges de session partent ; la légende du plan reste.
    if (window.LegendCustomization && typeof window.LegendCustomization.resetSession === "function") {
      window.LegendCustomization.resetSession();
    }
    if (window.setMeasurePoints)        window.setMeasurePoints([]);
    if (window.setMeasurePointsSurface) window.setMeasurePointsSurface([]);
    // 🩸 Le tracker aussi : timeline, tracé et marqueur survivraient sinon à l'effacement.
    if (typeof window.resetTrackingPosition === "function") {
      try { window.resetTrackingPosition(); } catch(e) {}
    }
    return portails.length;
  }
  function _estPortail(p) {
    const IPL = window.InterPlanLinks;
    if (!p || !IPL || typeof IPL.getLinksForPoint !== "function") return false;
    try { return IPL.getLinksForPoint(_currentPlanId, p).length > 0; } catch(e) { return false; }
  }

  // ── « Effacer la session » sur un plan PARTAGÉ (KtaExtensions.effacementPartage) ──────────────
  // Plan affiché partagé par une extension → promesse de { miens, tout, auteur } ; sinon null (fenêtre de l'app seule).
  function _effacementPartage() {
    if (typeof window.ktaPlanAffiche === "function" && !window.ktaPlanAffiche()) return null;
    const K = window.KtaExtensions;
    return (K && typeof K.effacementPartage === "function") ? K.effacementPartage(window._currentLoadedPlanId) : null;
  }
  // Objets d'une suppression pour toute l'organisation : tous (`tout`), ou ceux dont l'extension dit que le compte
  // est le créateur. 🔒 Jamais une copie de calque (elle porte l'uid d'un objet du calque : une trace le détruirait
  // par la fusion de calques, cf. historyManager.js > _laisseTrace), ni l'itinéraire calculé, ni un portail (gardé
  // par _viderEtatCourant). → [{ uid, updatedAt }]
  // `inconnus` : objets dont l'extension ne connaît pas le créateur (auteurObjet null) — jamais comptés comme « mes
  // ajouts » (décision produit : pas de suppression d'un objet d'autrui par erreur) ; seul `tout` les couvre.
  function _ciblesEffacement(tout, auteur, inconnus) {
    const K = window.KtaExtensions;
    const out = [];
    ["getEditorPoints", "getRoads", "getZones", "getStructures"].forEach(function(g) {
      const liste = (typeof window[g] === "function" ? window[g]() : null) || [];
      liste.forEach(function(o) {
        if (!o || typeof o.uid !== "string" || !o.uid || o._srcCalque !== undefined || o._preview) return;
        if ((window.KtaUid && window.KtaUid.estTransitoire(o)) || (g === "getEditorPoints" && _estPortail(o))) return;
        if (!tout || inconnus) {
          const a = (K && typeof K.auteurObjet === "function") ? K.auteurObjet(o.uid) : null;
          if (inconnus ? !!(a && a.createur) : (!auteur || !a || a.createur !== auteur)) return;
        }
        out.push({ uid: o.uid, updatedAt: Number(o.updatedAt) || 0 });
      });
    });
    return out;
  }
  // Après _viderEtatCourant (qui vide les traces) : celles d'avant reviennent (suppressions peut-être pas encore
  // envoyées) et chaque objet visé reçoit la sienne. 🩸 Datée APRÈS sa dernière modification connue : une trace
  // plus ancienne que l'objet perd la fusion et l'objet revient. → nombre de traces posées.
  function _tracerEffacement(avant, cibles) {
    const U = window.KtaUid;
    if (!U) return 0;
    U.setTombstones(avant);
    const now = Date.now();
    cibles.forEach(function(c) { U.tombstone(c.uid, Math.max(now, c.updatedAt + 1)); });
    return cibles.length;
  }
  // Fenêtre du plan partagé, RIEN de présélectionné (OK inactif tant qu'on n'a pas choisi) : « ↻ Annuler ce que cet
  // appareil n'a pas encore envoyé » seulement s'il y en a (`enAttente` > 0 ; null = nombre inconnu, prise en erreur :
  // proposée sans nombre) — en ligne tout part en quelques secondes et revient, vider l'appareil n'aurait pas de sens
  // (décision produit) ; « Supprimer mes ajouts pour toute l'organisation » (`miens`), « Tout supprimer pour
  // l'organisation » (`tout`), plus la case des calques en modification. Aucune option : « rien à effacer ». 🔒 La prise est relue au moment de confirmer une suppression pour tous (droit retiré entre-temps :
  // refus nommé, rien n'est effacé) ; la confirmation donne le nombre d'objets.
  function _choisirEffacementPartage(attente, msg, calques, go, bouton) {
    const _t = _trModule;
    if (bouton) bouton.disabled = true;
    attente.then(function(droits) {
      if (bouton) bouton.disabled = false;
      const options = [];
      const n = droits.enAttente;
      if (n === null || n === undefined || n > 0) {
        options.push({ valeur: "appareil",
          titre: Number.isInteger(n) ? _t("session.partage.annulerLocalN", { n: n }) : _t("session.partage.annulerLocal"),
          aide: _t("session.partage.annulerLocalAide"), okLabel: _t("session.partage.okAnnulerLocal") });
      }
      const inconnus = droits.miens ? _ciblesEffacement(true, null, true).length : 0;
      if (droits.miens) {
        options.push({ valeur: "miens", titre: _t("session.partage.miens"),
          aide: _t("session.partage.miensAide", { n: _ciblesEffacement(false, droits.auteur).length }) +
            (inconnus ? " " + _t("session.partage.inconnus", { n: inconnus }) : ""),
          okLabel: _t("session.partage.okMiens") });
      }
      if (droits.tout) {
        options.push({ valeur: "tout", titre: _t("session.partage.tout"),
          aide: _t("session.partage.toutAide", { n: _ciblesEffacement(true, null).length }), okLabel: _t("session.partage.okTout") });
      }
      if (!options.length) { window.ktaAlerte(_t("session.partage.rien")); return null; }
      // « Annuler » ferme sans rien effacer ; le bouton d'action dit ce que fait le choix coché (okLabel).
      const choix = { options: options, valeur: null, aucunParDefaut: true };
      const opts = { titre: _t("session.confirm.clearTitle"), okLabel: _t("session.btn.clear"),
        cancelLabel: _t("ui.confirm.cancel"), choix: choix };
      let texte = msg + "\n\n" + _t("session.partage.intro");
      if (calques.length) {
        // ⚠️ ktaConfirm insère le message en HTML : les noms de calques (fichier du plan) sont échappés.
        const noms = calques.map(function(id) { return window.ktaEsc(window.CalqueSession.libelle(id)); }).join(", ");
        texte += "\n\n" + _t("session.partage.calques", { calques: noms });
        opts.caseACocher = { label: _t("session.btn.clearEquipe"), coche: false };
      }
      return window.ktaConfirm(texte, opts).then(function(ok) {
        if (!ok) return null;
        const rendre = !!(opts.caseACocher && opts.caseACocher.coche);
        if (choix.valeur !== "miens" && choix.valeur !== "tout") { go(rendre, null); return null; }
        const tout = choix.valeur === "tout";
        return Promise.resolve(_effacementPartage()).then(function(d2) {
          if (!d2 || !(tout ? d2.tout : d2.miens)) {
            window.ktaAlerte(_t("session.partage.refuse"), { type: "erreur" });
            return null;
          }
          const cibles = _ciblesEffacement(tout, d2.auteur);
          if (!cibles.length) {
            // 🩸 Rien à supprimer pour l'organisation : la case des calques garde son effet (vidage + restitution),
            // sinon elle serait ignorée en silence et le calque resterait en modification. `[]` : les traces
            // d'avant (suppressions peut-être pas encore envoyées) sont gardées, comme avec des cibles.
            if (rendre) { go(true, []); return null; }
            window.ktaAlerte(_t("session.partage.aucun"));
            return null;
          }
          return window.ktaConfirm(_t(tout ? "session.partage.confirmTout" : "session.partage.confirmMiens", { n: cibles.length }), {
            titre: _t("session.partage.confirmTitre"),
            okLabel: _t(tout ? "session.partage.okTout" : "session.partage.okMiens"),
            cancelLabel: _t("ui.confirm.cancel")
          }).then(function(ok2) { if (ok2) go(rendre, cibles); });
        });
      });
    }).catch(function(e) {
      if (bouton) bouton.disabled = false;
      console.warn("[SessionPersist] effacement d'un plan partagé :", e);
    });
  }

  // « Effacer la session » : UN parcours pour toutes les entrées (fenêtre « session restaurée », 📊 Détails de la
  // session). Confirmation chiffrée, choix à trois options sur un plan partagé (_choisirEffacementPartage), case des
  // calques en modification, snapshot ATTENDU, puis toast qui dit où le retrouver. `bouton` est grisé pendant la
  // lecture des droits d'un plan partagé ; `apres` est appelé une fois la session effacée (fermer la fenêtre).
  // 🔒 Plan d'extension en lecture seule (ktaEditionRefusee) : aucune modification ne peut y attendre d'envoi, tout
  // vient du serveur — « Rien à effacer » (décision produit), sans fenêtre de choix. Plan local : inchangé.
  function demanderEffacement(bouton, apres) {
    const _t = _trModule;
    const ro = typeof window.ktaEditionRefusee === "function" && window.ktaEditionRefusee(true);
    // Plan dont la restitution se partage, avec des calques en modification : l'effacement local les verrait
    // revenir depuis la synchro. L'utilisateur choisit : effacer ici seulement, ou rendre aussi les calques à
    // tous (restitution partagée, notée AVANT le vidage : elle porte les uids des copies retirées).
    const CS = window.CalqueSession;
    const calques = (!ro && CS && typeof CS.restitutionPartagee === "function" && CS.restitutionPartagee())
      ? CS.listeRapatries() : [];
    const n = _compterEtatCourant(calques.length > 0);
    // `cibles` (plan partagé) : objets supprimés pour toute l'organisation, une trace chacun après le vidage.
    const go = function(rendre, cibles) {
      if (ro) { rendre = false; cibles = null; }
      const snap = (window.SessionBackups && typeof window.SessionBackups.snapshot === "function")
        ? Promise.resolve().then(function() { return window.SessionBackups.snapshot("before-clear-session"); })
            .catch(function() { return null; })
        : Promise.resolve(null);
      snap.then(function(entry) {
        let rendus = 0;
        if (rendre) {
          calques.forEach(function(id) {
            try { if (CS.restituer(id).partagee) rendus++; }
            catch(e) { console.warn("[SessionPersist] restitution :", e); }
          });
        }
        const avant = (cibles && window.KtaUid) ? window.KtaUid.getTombstones() : null;
        const gardes = _viderEtatCourant();
        const supprimes = avant ? _tracerEffacement(avant, cibles) : 0;
        clear({ snapshotFait: true });
        if (supprimes) save({ force: true });   // les traces sont la seule chose qui reste : écrites tout de suite
        if (typeof apres === "function") apres();
        if (window.OOMGuard && typeof window.OOMGuard.showToast === "function") {
          window.OOMGuard.showToast(_t(entry ? "session.toast.clearedSnap" : "session.toast.cleared") +
            (gardes ? " " + _trModule("session.toast.portailsGardes", { n: gardes }) : "") +
            (rendus ? " " + _trModule("session.toast.calquesRendus", { n: rendus }) : "") +
            (supprimes ? " " + _trModule("session.toast.supprimesOrga", { n: supprimes }) : ""),
            supprimes ? "success" : "info");
        }
      });
    };
    if (typeof window.ktaConfirm === "function") {
      const copies = n.copies ? "\n" + _t("session.confirm.clearCopies", { n: n.copies }) : "";
      const msg = (window.I18n && window.I18n.t)
        ? window.I18n.t("session.confirm.clear", n) + copies : "Effacer la session ?";
      const partageLu = _effacementPartage();
      if (ro && partageLu) { window.ktaAlerte(_t("session.partage.rienServeur")); return; }
      const partage = partageLu;
      if (partage) { _choisirEffacementPartage(partage, msg, calques, go, bouton); return; }
      if (calques.length) {
        // ⚠️ ktaConfirm insère le message en HTML : les noms de calques (fichier du plan) sont échappés.
        const noms = calques.map(function(id) { return window.ktaEsc(CS.libelle(id)); }).join(", ");
        window.ktaConfirm(msg + "\n\n" + _trModule("session.confirm.calquesEquipe", { calques: noms }), {
          titre:       _t("session.confirm.clearTitle"),
          okLabel:     _t("session.btn.clearIci"),
          cancelLabel: _t("ui.confirm.cancel"),
          autre:       { label: _t("session.btn.clearEquipe"), valeur: "equipe" }
        }).then(function(choix) { if (choix) go(choix === "equipe"); });
      } else {
        window.ktaConfirm(msg, {
          titre:       _t("session.confirm.clearTitle"),
          okLabel:     _t("session.btn.clear"),
          cancelLabel: _t("ui.confirm.cancel")
        }).then(function(ok) { if (ok) go(false); });
      }
    } else {
      // Sans fenêtre de confirmation, on N'efface PAS : un repli destructeur par défaut est le pire choix.
      console.warn("[SessionPersist] ktaConfirm indisponible : effacement de la session refusé");
    }
  }

  // ── Modale « session restaurée » ──────────────
  function _afficherModaleSession(restored) {
    if (!restored) return;
    // Le tracé compte : une session tracker seule doit pouvoir être refusée.
    const total = restored.points + restored.roads + restored.zones
                + (restored.structures || 0) + restored.measure
                + (restored.measureSurface || 0)
                + (restored.trackerTimeline ? 1 : 0);
    if (total === 0) return;

    const existing = document.getElementById("kta-session-modal");
    if (existing) {
      if (typeof existing._ktaRetirerClavier === "function") existing._ktaRetirerClavier();
      existing.remove();
    }

    const _t = function(k) { return (window.I18n && window.I18n.t) ? window.I18n.t(k) : k; };
    const parts = [];
    if (restored.points)     parts.push(restored.points  + " " + _t(restored.points  > 1 ? "session.unit.points"     : "session.unit.point"));
    if (restored.roads)      parts.push(restored.roads   + " " + _t(restored.roads   > 1 ? "session.unit.roads"      : "session.unit.road"));
    if (restored.zones)      parts.push(restored.zones   + " " + _t(restored.zones   > 1 ? "session.unit.zones"      : "session.unit.zone"));
    if (restored.structures) parts.push(restored.structures + " " + _t(restored.structures > 1 ? "session.unit.structures" : "session.unit.structure"));
    if (restored.measure)    parts.push(_t("session.unit.measureDist"));
    if (restored.measureSurface) parts.push(_t("session.unit.measureSurf"));
    if (restored.trackerTimeline) parts.push(_t("session.unit.tracker"));

    const planName = _currentPlanName();
    const planNameSafe = window.ktaEsc(planName);
    const planLine = planName
      ? '<div class="kta-session-modal-plan">📍 ' + planNameSafe + '</div>'
      : '';

    const modal = document.createElement("div");
    modal.id = "kta-session-modal";
    modal.className = "kta-session-modal-overlay";
    modal.innerHTML =
      '<div class="kta-session-modal-boite">' +
        '<div class="kta-session-modal-icon">↻</div>' +
        '<div class="kta-session-modal-titre">' + _t("session.modal.titre") + '</div>' +
        planLine +
        '<div class="kta-session-modal-detail">' + parts.join(" · ") + '</div>' +
        '<div class="kta-session-modal-actions">' +
          '<button class="kta-btn kta-btn-ghost"   type="button" data-action="clear">' + _t("session.btn.clear") + '</button>' +
          '<button class="kta-btn kta-btn-primary" type="button" data-action="keep">' + _t("session.btn.keep") + '</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(modal);

    // 🩸 L'écouteur Échap est sur `document` : il part avec la modale, quelle que soit la façon de la fermer (bouton,
    // fond, Échap, ou remplacée à l'ouverture d'un autre plan). Retiré seulement sur Échap, il gardait chaque
    // modale détachée en vie, une de plus par plan ouvert avec une session.
    let fermee = false;
    const retirerClavier = function() { document.removeEventListener("keydown", onKey); };
    function fermer() {
      if (fermee) return;
      fermee = true;
      retirerClavier();
      modal.classList.add("hiding");
      setTimeout(function() { modal.remove(); }, 220);
    }
    modal._ktaRetirerClavier = retirerClavier;

    modal.querySelector('[data-action="keep"]').addEventListener("click", fermer);
    // 🩸 « Effacer » est à côté de « Continuer » (un doigt ganté glisse) : la confirmation est dans le parcours.
    modal.querySelector('[data-action="clear"]').addEventListener("click", function() {
      demanderEffacement(this, fermer);
    });
    // Fond et Échap = « Continuer ».
    modal.addEventListener("click", function(e) {
      if (e.target === modal) fermer();
    });
    function onKey(e) {
      if (e.key === "Escape") fermer();
    }
    document.addEventListener("keydown", onKey);
  }

  // ── Polling ──────────────
  function _startPolling() {
    if (_pollTimer) return;
    const interval = _currentPollInterval();
    _pollTimer = setInterval(save, interval);
    if (interval !== POLL_INTERVAL_MS) {
      console.log("[SessionPersist] 🚀 PerfUltra.slowSave actif → polling " + (interval/1000) + "s");
    }
  }

  function _stopPolling() {
    if (_pollTimer) { clearInterval(_pollTimer); _pollTimer = null; }
  }

  // PerfUltra.slowSave basculé : le polling repart avec le nouvel intervalle.
  if (window.PerfUltra && typeof window.PerfUltra.onChange === "function") {
    window.PerfUltra.onChange(function(changedKeys) {
      if (changedKeys.indexOf("slowSave") >= 0 && _pollTimer) {
        _stopPolling();
        _startPolling();
      }
    });
  }

  // 🩸 Appelé par main.js > _libererRessourcesPlanPrecedent AVANT tout démontage : save final forcé, puis
  // polling arrêté. Sinon un tick entre le teardown (timeline vidée) et le plan suivant écrit un état
  // mutilé dans le slot de l'ancien plan, voire le purge (session tracker seule).
  function onPlanUnload() {
    if (_currentPlanId) {
      try { save({ force: true }); } catch(e) {}
    }
    _stopPolling();
    // Neutralise aussi beforeunload/visibilitychange pendant le changement (save() sort sans planId).
    _currentPlanId = null;
    console.log("[SessionPersist] Plan unload — save final + persistance figée jusqu'au prochain plan");
  }

  // ── Chargement d'un plan ──────────────
  // Nom de plan comparé comme l'accueil le fait (homeLoader.js > _normId) : casse, accents, ponctuation ignorés.
  function _normNomPlan(s) {
    return String(s == null ? "" : s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "");
  }

  // Appelé par main.js > lancerApplication() après l'init : migre l'ancien slot, restaure le slot du plan
  // s'il existe (modale), démarre le polling.
  function onPlanLoaded(planId) {
    _stopPolling();
    _slotAssume = false;
    _decisionEnAttente = false;
    _annulerPhase2();   // sinon l'itinéraire de l'ancien plan arrive sur le nouveau
    _currentPlanId = planId || null;
    _lastHash = null;

    _migrerAncienSlotUniqueSiBesoin();

    if (!_currentPlanId) {
      // Sans planId : stockage intact, polling quand même.
      _startPolling();
      return null;
    }

    // 🩸 Légende de session remise à vide AVANT toute restauration : sans ça, un plan jamais visité hérite
    // des types custom du plan précédent (légende, sidebar) et les écrit dans son slot au 1er poll.
    // `_planState` (loadPlanState) n'est pas concerné.
    if (window.LegendCustomization && typeof window.LegendCustomization.loadSessionState === "function") {
      try { window.LegendCustomization.loadSessionState(null); }
      catch(e) { console.warn("[SessionPersist] reset légende échec :", e); }
    }
    // Même piège pour le plan de base masqué à la main (un plan sans session s'ouvrirait sans fond) et pour les
    // traces de suppression du plan précédent.
    if (window._ktaRuntimeFilters) window._ktaRuntimeFilters.planDeBase = null;
    if (window.KtaUid) window.KtaUid.setTombstones([]);

    const saved = getSaved();
    let restored = null;
    if (saved) {
      // Contrôle du nom contre une collision d'identifiant entre deux plans locaux.
      const currentName = _currentPlanName();
      const nameMatch   = (!saved.planName || !currentName)
                            ? true
                            : (_normNomPlan(saved.planName) === _normNomPlan(currentName));

      if (nameMatch) {
        restored = _applyRestore(saved);
        if (restored) { _slotAssume = true; _afficherModaleSession(restored); }
      } else {
        // 🩸 Nom vraiment différent (plan renommé, ou collision) : copie dans 📦 Backups, écriture suspendue,
        // l'utilisateur tranche. Jamais d'effacement silencieux.
        console.warn("[SessionPersist] session d'un autre nom de plan :", saved.planName, "≠", currentName);
        _proposerSessionAutreNom(saved, currentName, planId);
      }
    }
    _startPolling();
    _verifierMemoire(false);
    return restored;
  }

  function _proposerSessionAutreNom(saved, nomActuel, planId) {
    _decisionEnAttente = true;
    const esc = window.ktaEsc;
    const copie = (window.SessionBackups && typeof window.SessionBackups.snapshot === "function")
      ? Promise.resolve(window.SessionBackups.snapshot("session-autre-nom")).catch(function () { return null; })
      : Promise.resolve(null);
    copie.then(function () {
      if (_currentPlanId !== planId) { _decisionEnAttente = false; return null; }   // plan changé entre-temps
      if (typeof window.ktaConfirm !== "function") return true;
      return window.ktaConfirm(_trModule("session.autreNom.msg", { ancien: esc(saved.planName), actuel: esc(nomActuel) }), {
        titre: _trModule("session.autreNom.titre"),
        okLabel: _trModule("session.autreNom.restaurer"), cancelLabel: _trModule("session.autreNom.ignorer")
      });
    }).then(function (ok) {
      if (_currentPlanId !== planId) return;
      _decisionEnAttente = false;
      if (ok) {
        const r = _applyRestore(saved);
        if (r) {
          _slotAssume = true;
          // Réécrite tout de suite sous le nom ACTUEL, sinon la question revient à chaque ouverture.
          _lastHash = null;
          save({ force: true });
          _afficherModaleSession(r);
        }
      } else if (ok === false && window.OOMGuard && window.OOMGuard.showToast) {
        window.OOMGuard.showToast(_trModule("session.autreNom.ignoree"), "warn", { important: true });
      }
    });
  }

  // ── Mémoire des sessions ──────────────
  // Prévenir AVANT la panne : au chargement d'un plan (≥ seuil) et dès qu'une écriture échoue faute de place.
  // Une fois par page et par niveau. Deux mémoires possibles (ktaStockageLocal.mesurer().mode) :
  //   - « idb » (normal) : quota du navigateur pour le site (navigator.storage.estimate) — une part de l'espace
  //     libre de l'appareil ; plein = une écriture IndexedDB refusée (QuotaExceededError).
  //   - « ls » (repli : IndexedDB indisponible) : localStorage ~5 Mo, plein = événement mktm:stockage-plein.
  const _memoireAlertee = { presque: false, plein: false };
  function _verifierMemoire(plein) {
    const S = window.ktaStockageLocal;
    if (!S || typeof window.ktaConfirm !== "function") return;
    const m = S.mesurer();
    const niveau = plein ? "plein" : (m.ratio >= S.SEUIL_ALERTE ? "presque" : null);
    if (!niveau || _memoireAlertee[niveau] || (niveau === "presque" && _memoireAlertee.plein)) return;
    _memoireAlertee[niveau] = true;
    const pct = Math.min(100, Math.round(m.ratio * 100));
    const idb = m.mode === "idb" ? "Idb" : "";
    window.ktaConfirm(_trModule((niveau === "plein" ? "session.memoire.pleinMsg" : "session.memoire.presqueMsg") + idb,
      { pct: pct, occupe: S.mo(m.car), limite: m.limite ? S.mo(m.limite) : "?" }), {
      titre: _trModule(niveau === "plein" ? "session.memoire.pleinTitre" : "session.memoire.presqueTitre"),
      okLabel: _trModule("session.memoire.voir"), cancelLabel: _trModule("session.memoire.plusTard")
    }).then(function (ok) {
      if (ok && typeof window.ktaOuvrirDetailsSession === "function") window.ktaOuvrirDetailsSession();
    });
  }
  // localStorage plein : ne concerne les sessions qu'en repli localStorage. En IndexedDB, le module de stockage
  // retire les anciennes copies d'avant la migration (déjà vérifiées) pour refaire de la place.
  window.addEventListener("mktm:stockage-plein", function () {
    if (_store().mode() === "idb") return;
    _verifierMemoire(true);
  });

  // ── Filets : fermeture et arrière-plan ──────────────
  // Forcés (pas de throttle) : pas de seconde chance, iOS peut tuer l'onglet en arrière-plan.
  window.addEventListener("beforeunload", function() { save({ force: true }); });

  document.addEventListener("visibilitychange", function() {
    if (document.visibilityState === "hidden") save({ force: true });
  });

  window.SessionPersist = {
    onPlanLoaded: onPlanLoaded,
    onPlanUnload: onPlanUnload,
    save:         save,
    clear:        clear,
    getSaved:     getSaved,
    getLastSaveInfo: getLastSaveInfo,
    normNomPlan:  _normNomPlan,        // même plan sous un autre nom (📦 Backups d'une autre version)
    demanderEffacement: demanderEffacement   // « Effacer la session » (même parcours depuis 📊 Détails)
  };
})();
