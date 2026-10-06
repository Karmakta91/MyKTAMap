/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * https://myktamap.fr — Licence CC BY-NC-SA 4.0
 * Usage commercial interdit sans accord ecrit prealable. Voir LICENSE.
 */

// =========================
// SESSION PERSIST — auto-sauvegarde de la session active
// =========================
// Stratégie :
//  - 🆕 v1.16.1 — Slot PAR PLAN dans localStorage : `myktamap_session_v1_<planId>`.
//    Plus de wipe au plan switch. L'user peut quitter le plan A, charger le
//    plan B, faire des modifs, puis revenir sur A → ses modifs sur A sont
//    restaurées automatiquement (avant : la session A était écrasée par
//    le polling de B après quelques secondes, ou wipée immédiatement au
//    `clear()` du plan-mismatch).
//  - Polling périodique : compare un hash de l'état avec le dernier sauvegardé
//  - Save aussi sur beforeunload + visibilitychange (mobile mise en arrière-plan)
//  - Restore appelé par main.js après lancerApplication() via onPlanLoaded(planId)
//  - Tracker path volontairement EXCLU (expérimental, restaurer une trail morte est trompeur)
//
// API : window.SessionPersist
//   - onPlanLoaded(planId)    → à appeler après chargement complet d'un plan
//   - save()                  → force une sauvegarde immédiate (du plan courant)
//   - clear()                 → efface la session du plan courant
//   - getSaved(planId?)       → retourne le payload mémorisé ou null
//                                (planId optionnel ; sinon = plan courant)
// =========================

(function() {
  "use strict";

  // 🆕 v1.16.1 — Préfixe + helper pour générer la clé par plan.
  // Ancien format unique « myktamap_session_v1 » migré au boot vers
  // « myktamap_session_v1_<planId> » via _migrerAncienSlotUniqueSiBesoin.
  const STORAGE_PREFIX = "myktamap_session_v1_";
  function _storageKeyFor(planId) {
    if (!planId) return null;
    return STORAGE_PREFIX + planId;
  }
  // Ancien slot unique conservé en lecture seule pour la migration au boot.
  const STORAGE_KEY_LEGACY = "myktamap_session_v1";
  const POLL_INTERVAL_MS      = 1500;   // défaut (~real-time)
  const POLL_INTERVAL_SLOW_MS = 30000;  // mode 🚀 PerfUltra.slowSave (30s)

  // Sélectionne l'intervalle de polling selon le toggle PerfUltra.slowSave.
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
  // Anti-spam toast quota : true après 1ère alerte, reset après 1er save réussi
  let _quotaWarned   = false;
  // 🆕 v1.8.1 : ID du setTimeout de la phase 2 de restore (itinéraire différé).
  // Permet d'annuler la phase 2 si l'user clique "Effacer la session" avant
  // que les 1500ms ne soient écoulés — sinon l'itinéraire réapparaissait
  // ~1.5s après l'effacement, ce qui était très perturbant.
  let _phase2TimeoutId = null;
  function _annulerPhase2() {
    if (_phase2TimeoutId !== null) {
      clearTimeout(_phase2TimeoutId);
      _phase2TimeoutId = null;
    }
  }

  // ========== MIGRATION LEGACY (v1.16.0 → v1.16.1) ==========

  // 🆕 v1.16.1 — L'ancien slot unique `myktamap_session_v1` est déplacé
  // vers le slot per-plan `myktamap_session_v1_<savedPlanId>` quand on
  // boot pour la 1ère fois sur la nouvelle version. Idempotent : appelé
  // à chaque `onPlanLoaded` mais ne fait rien si l'ancien slot est
  // déjà absent (= déjà migré OU jamais utilisé).
  //
  // Cas géré :
  //  - Ancien slot présent + payload.planId valide → migre + supprime
  //    l'ancien slot (idempotence stricte garantie ensuite).
  //  - Ancien slot présent mais payload corrompu / planId manquant →
  //    supprime l'ancien (impossible à migrer, laisser le slot legacy
  //    serait juste pollution).
  //  - Si le slot per-plan cible existe déjà avec un payload plus récent
  //    (savedAt plus récent) → on NE écrase PAS, on supprime juste le
  //    legacy. Évite de revenir en arrière si l'user a déjà bossé sur
  //    le plan après l'update.
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
    // Si le nouveau slot existe déjà et est plus récent, ne pas écraser
    let existing;
    try {
      const existingRaw = localStorage.getItem(newKey);
      existing = existingRaw ? JSON.parse(existingRaw) : null;
    } catch(e) { existing = null; }
    const legacyTs   = Date.parse(payload.savedAt  || 0) || 0;
    const existingTs = Date.parse(existing && existing.savedAt || 0) || 0;
    if (!existing || legacyTs > existingTs) {
      try {
        localStorage.setItem(newKey, raw);
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

  // ========== ETAT COURANT ==========

  function _gatherState() {
    // 🆕 v1.8.1 (demande KARMA) : on persiste DESORMAIS aussi les roads
    // de type "itinerary". Avant (suite 29, 09/05/2026), elles etaient
    // filtrees pour eviter un crash au reload (drop-shadow CSS du halo
    // neon cyan qui saturait le GPU au boot quand applique trop tot dans
    // le cycle de vie de Leaflet + tuiles V2 en cours de chargement).
    //
    // La premiere reactivation v1.8.0 (sans precaution) reproduisait
    // exactement ce crash. Fix v1.8.1 : restore en DEUX PHASES cote
    // _restore() — immediat pour les roads classiques, differe +1500ms
    // pour les itineraires. Le timing mime celui du flow manuel d'import
    // session (qui marche sans crash car l'app est deja stabilisee).
    //
    // Le SAVE lui-meme reste simple : on sauve tout. C'est cote RESTORE
    // qu'on echelonne.
    return {
      editorPoints: window.getEditorPoints  ? (window.getEditorPoints()  || []) : [],
      roads:        window.getRoads         ? (window.getRoads()         || []) : [],
      zones:        window.getZones         ? (window.getZones()         || []) : [],
      // 🆕 v1.9.3-A1.a : structures (piliers + murs) — clés séparée pour
      // ne pas casser la rétrocompat (anciens payloads sans 'structures'
      // sont restaurés avec array vide via `payload.structures || []`).
      structures:   window.getStructures    ? (window.getStructures()    || []) : [],
      // 🆕 v1.12.0-fix (KARMA "en footer, on peux afficher a la fois,
      // une mesure de surface, et une comme avant de distance") : les
      // 2 mesures coexistent désormais en simultané. `measure` = la
      // polyline DISTANCE (rétrocompat avec anciennes sessions), et
      // `measureSurface` = le polygone SURFACE (nouveau).
      measure:        window.getMeasurePoints        ? (window.getMeasurePoints()        || []) : [],
      measureSurface: window.getMeasurePointsSurface ? (window.getMeasurePointsSurface() || []) : [],
      // Mode actif (drive les clics + surligne la ligne du footer).
      measureMode:  (typeof window.getMeasureMode === "function") ? window.getMeasureMode() : "distance",
      // 🆕 v1.16.0 step 2 : overrides de la légende personnalisée (libellés
      // renommés, entrées cachées, entrées custom ajoutées). Optionnel et
      // vide par défaut — n'occupe rien dans le localStorage si l'user
      // n'a rien personnalisé. Rétrocompat : payload.customLegend absent
      // dans les anciens saves → traité comme état vide au restore.
      customLegend: (window.LegendCustomization && window.LegendCustomization.getSessionState)
                      ? window.LegendCustomization.getSessionState()
                      : null,

      // 🔄 v1.85.0 — calques de donnees RAPATRIES en session (cf.
      // js/calqueSession.js). Ne porte QUE la liste de leurs ids : les objets,
      // eux, sont deja dans roads/zones/structures/editorPoints ci-dessus,
      // marques par `_srcCalque`. `null` tant que rien n est rapatrie, donc
      // zero octet dans localStorage pour qui ne s en sert pas.
      calquesSession: (window.CalqueSession && window.CalqueSession.getSessionState)
                        ? window.CalqueSession.getSessionState()
                        : null,
      // 🆔 v2.2.0 — traces de suppression { uid, deletedAt } (ETUDE_UID lot B) :
      // sans elles, une synchro ressusciterait un objet supprimé ici.
      tombstones: window.KtaUid ? window.KtaUid.getTombstones() : [],

      // 🆕 v1.21.2 (KARMA "on active dans la sauvegarde auto le tracking
      // comme ca la fonction [heatmap] devient pertinante") :
      // persistance de la timeline tracker GPS. Avant : RAM-only (perte
      // au reload) → la heatmap multi-sessions ne pouvait jamais agréger
      // des trajectoires cumulées sur plusieurs sorties.
      //
      // Format : [{x, y, t, deltaMs, type, level?}, ...]
      //   type ∈ "start" | "pdr" | "recalage"
      //
      // Note : le `path` runtime du tracker (= polyline visible Leaflet)
      // reste non persisté (volontaire — pas de trail visuel survivant au
      // reload, cohérent avec le pattern "tracker session-only" pour le
      // rendu carte). Seule la TIMELINE temporelle est gardée pour stats
      // / heatmap / replay multi-sessions.
      trackerTimeline: (typeof window.getTrackingTimeline === "function")
                         ? (window.getTrackingTimeline() || [])
                         : [],
      trackerStartTs:  (typeof window.getTrackingStartTs  === "function")
                         ? (window.getTrackingStartTs()  || null)
                         : null,

      // 🆕 v1.21.5 (KARMA "refonte filtre Leaflet — persistance per-plan") :
      // état des filtres runtime du FilterPanel (tags, types road/zone/struct).
      // Sérialisation Set → Array ; null = pas de filtre (tout visible).
      // Au restore, on reconvertit Array → Set côté loader. Rétrocompat :
      // payload.runtimeFilters absent dans les anciens saves → ignoré.
      runtimeFilters: _serializeRuntimeFilters()
    };
  }

  // Sérialise window._ktaRuntimeFilters (Sets → Arrays) pour le payload JSON.
  // null reste null (= pas de filtre actif).
  function _serializeRuntimeFilters() {
    const f = window._ktaRuntimeFilters;
    if (!f || typeof f !== "object") return null;
    function _s(set) { return (set instanceof Set) ? Array.from(set) : null; }
    return {
      tags:        _s(f.tags),
      roadTypes:   _s(f.roadTypes),
      zoneTypes:   _s(f.zoneTypes),
      structTypes: _s(f.structTypes)
    };
  }

  // Hash simple djb2-like : suffisant pour détecter un changement
  function _hashState(state) {
    const str = JSON.stringify(state);
    let h = 5381;
    for (let i = 0; i < str.length; i++) {
      h = ((h << 5) + h) ^ str.charCodeAt(i);
    }
    return h.toString(36);
  }

  function _isEmptyState(state) {
    // 🆕 v1.16.0 step 2 : si l'user a UNIQUEMENT personnalisé sa légende
    // (sans rien dessiner), on garde quand même la session pour ne pas
    // perdre ses overrides. Une session est "vide" seulement si rien du
    // tout n'est défini, y compris la légende.
    // 🐛 v1.76.1 (audit 06/08 — PERTE DE DONNÉES) : ce test local ne
    // connaissait ni `colors` ni `borders` (ajoutés v1.76.0/1) — une session
    // où l'utilisateur avait UNIQUEMENT recoloré des types built-in était
    // jugée vide → slot localStorage SUPPRIMÉ, couleurs perdues au reload
    // sans un mot. Même famille que measureSurface (v1.12.0) et
    // trackerTimeline (v1.28.0) ci-dessous. On délègue au module : SON
    // isSessionStateEmpty teste les 5 champs et évoluera avec eux.
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
        // 🐛 v1.12.0-fix (KARMA "une surface n'est pas persistée") : sans
        // ce check, un user qui a UNIQUEMENT dessiné un polygone surface
        // verrait son état considéré "vide" → localStorage purgé → perte
        // au reload. Surface compte aussi comme contenu.
        && (state.measureSurface || []).length === 0
        // 🐛 v1.28.0-fix : une session tracker-SEULE (timeline/tracé sans aucun
        // point/tracé/zone/mesure) ne doit PAS être jugée "vide" — sinon le slot
        // localStorage est purgé (save > _isEmptyState → removeItem) et le tracé
        // est perdu au reload. Le tracker compte comme contenu.
        && (state.trackerTimeline || []).length === 0
        // 🆔 v2.2.0 — des traces SEULES comptent comme contenu : tout supprimer
        // ne doit pas effacer le slot, sinon les traces partiraient avec et les
        // objets supprimés ressusciteraient à la prochaine synchro.
        && (state.tombstones || []).length === 0
        && lcEmpty;
  }

  // ========== STORAGE ==========

  function _currentPlanName() {
    return (window.PLAN_CONFIG && window.PLAN_CONFIG.plan && window.PLAN_CONFIG.plan.name) || "";
  }

  // Throttle adaptatif : le polling 1.5s peut tomber en plein milieu d'un
  // long task UI (zoom Leaflet, rendu canvas tile, etc.). Sur mobile, le
  // localStorage.setItem synchrone ajoute alors du jank perceptible. On
  // mesure le temps écoulé depuis le début du tick rAF courant : si on est
  // déjà à >100ms (= main thread déjà occupé), on skip ce save et on
  // attendra le prochain poll. Garantit qu'on n'aggrave pas la pression
  // pendant une opération coûteuse, sans rien perdre en pratique car
  // le hash-check fait que le save reprendra juste après.
  let _lastForceSave = 0;
  function _mainThreadBusy() {
    // Heuristique simple : performance.now() vs un repère local.
    // En condition normale, deux appels successifs sont à <1ms.
    // Si le browser a juste retraité un long task, perf.now() peut sauter.
    const t0 = performance.now();
    let i = 0;
    // micro-bench : ~50 µs en idle, plus si CPU contesté
    while (i < 1000) i++;
    return (performance.now() - t0) > 5;
  }

  function save(opts) {
    if (!_currentPlanId) return false;

    // Throttle : sauf si force=true (beforeunload, visibilitychange) on
    // skip si le main thread est sous pression
    const force = opts && opts.force;
    if (!force && _mainThreadBusy()) {
      // Si on a skippé plus de 6 fois (≈ 9 secondes), on force quand même
      // pour pas perdre de modif si la pression dure longtemps.
      _lastForceSave++;
      if (_lastForceSave < 6) return false;
    }
    _lastForceSave = 0;

    if (window.KtaUid) window.KtaUid.purge();   // 🆔 v2.2.0 : traces > 90 jours
    const state = _gatherState();
    const hash  = _hashState(state);
    if (hash === _lastHash) return false; // pas de changement depuis dernier save

    if (_isEmptyState(state)) {
      // Etat vide → on efface l'éventuelle sauvegarde existante du plan
      // courant (utile après "Effacer la session"). 🆕 v1.16.1 : on touche
      // UNIQUEMENT au slot du plan courant — les autres plans gardent
      // leur session.
      const _k = _storageKeyFor(_currentPlanId);
      if (_k) {
        try { localStorage.removeItem(_k); } catch(e) {}
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
      // 🆕 v1.9.3-A1.a : structures (piliers + murs)
      structures:   state.structures || [],
      zones:        state.zones,
      measure:      state.measure,
      // 🐛 v1.12.0-fix (KARMA "une surface n'est pas persistée à la
      // différence de mesure") : le payload écrit dans localStorage
      // doit inclure measureSurface ET measureMode, sinon _gatherState
      // les remonte correctement mais save() les jette. Bug introduit
      // lors de la refonte 2 mesures coexistantes — j'avais ajouté les
      // champs dans _gatherState mais pas dans le payload final.
      measureSurface: state.measureSurface || [],
      measureMode:    state.measureMode    || "distance",
      // 🔄 v1.85.0 — verrou des calques rapatries (cf. js/calqueSession.js).
      calquesSession: state.calquesSession || null,
      // 🆔 v2.2.0 — traces de suppression (purgées à 90 jours avant écriture).
      tombstones:     state.tombstones || [],
      // 🆕 v1.16.0 step 2 : overrides légende (libellés + visibilité +
      // entrées custom). null si LegendCustomization n'a pas encore été
      // chargé ou si l'user n'a rien personnalisé — c'est OK, le restore
      // gère gracieusement payload.customLegend == null.
      customLegend:   state.customLegend   || null,
      // 🆕 v1.21.5 (KARMA "refonte filtre Leaflet") : filtres runtime
      // FilterPanel (tags + types road/zone/struct) persistés per-plan.
      runtimeFilters:  state.runtimeFilters  || null,
      // 🐛 v1.28.0-fix : trackerTimeline/trackerStartTs étaient présents dans
      // _gatherState() mais OMIS de ce payload final → jamais écrits en
      // localStorage → le tracé du tracker ne survivait PAS au reload (« l'auto
      // save du tracé ne fonctionne pas »). EXACTEMENT le même bug que
      // measureSurface en v1.12.0 (cf commentaire plus haut). On les écrit.
      trackerTimeline: state.trackerTimeline || [],
      trackerStartTs:  (typeof state.trackerStartTs === "number") ? state.trackerStartTs : null
    };
    // 🆕 v1.16.1 : écriture dans le slot par-plan. Si pas de planId set
    // (cas dégénéré, pré-onPlanLoaded), skip — on ne peut pas savoir
    // quel plan on est en train de sauvegarder.
    const _writeKey = _storageKeyFor(_currentPlanId);
    if (!_writeKey) return false;
    try {
      localStorage.setItem(_writeKey, JSON.stringify(payload));
      _lastHash = hash;
      _quotaWarned = false;  // reset si le save remarche après libération de place
      _masquerBandeauStockage();   // 🚨 B5 : la sauvegarde remarche → le bandeau tombe
      _lastSaveTs = Date.now();    // 🚨 Q46 : « enregistré il y a N s » dans 📊 Détails
      _lastSaveKo = false;
      return true;
    } catch(e) {
      console.warn("[SessionPersist] save échoué :", e);
      // Détection quota dépassé : sur mobile c'est très souvent un signe que
      // le navigateur va commencer à purger / killer l'onglet. On alerte
      // l'utilisateur 1× pour l'inciter à exporter sa session manuellement
      // avant que tout soit perdu. _quotaWarned évite le spam sur les ticks
      // suivants tant que le problème dure.
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
      // 🚨 B5 (audit ergonomie 13/09/2026) : le toast ne passait qu'UNE fois
      // (10 s, remplaçable par n'importe quel autre) puis l'app échouait en
      // silence pendant des heures. Bandeau PERSISTANT tant que le save échoue,
      // avec le bouton d'export ; il tombe au premier save réussi.
      if (isQuota) _afficherBandeauStockage();
      _lastSaveKo = true;   // Q46 : l'écran de détails le dira en rouge
      return false;
    }
  }

  // 🆕 v1.16.1 — getSaved accepte un planId optionnel. Sans argument →
  // lit le slot du plan courant (`_currentPlanId`). Avec argument → lit
  // le slot du plan demandé. Utilisé par SessionBackups pour snapshotter
  // toujours le bon slot, et par onPlanLoaded pour vérifier au boot.
  function getSaved(planId) {
    const lookupId = planId || _currentPlanId;
    if (!lookupId) return null;
    try {
      const raw = localStorage.getItem(_storageKeyFor(lookupId));
      if (!raw) return null;
      const payload = JSON.parse(raw);
      if (!payload || payload.version !== VERSION) return null;
      return payload;
    } catch(e) {
      console.warn("[SessionPersist] read échoué :", e);
      return null;
    }
  }

  // Compte ce que la session courante contient (pour une confirmation chiffrée).
  // 🚨 Q46 (audit 13/09/2026) : rien ne disait jamais « c'est enregistré ».
  // `savedAt` était écrit dans le payload et jamais affiché.
  let _lastSaveTs = null;
  let _lastSaveKo = false;
  function getLastSaveInfo() {
    let ts = _lastSaveTs;
    if (!ts) {
      try { const p = getSaved(); if (p && p.savedAt) ts = Date.parse(p.savedAt) || null; } catch(e) {}
    }
    return { ts: ts, ko: _lastSaveKo };
  }

  function _compterEtatCourant() {
    const len = function(fn) {
      try { const a = (typeof window[fn] === "function") ? window[fn]() : null; return Array.isArray(a) ? a.length : 0; }
      catch(e) { return 0; }
    };
    return { pts: len("getEditorPoints"), roads: len("getRoads"), zones: len("getZones"), structs: len("getStructures") };
  }

  function clear(opts) {
    // 🆕 v1.16.0 step 4 : snapshot AVANT le wipe pour permettre de
    // revenir en arrière depuis 📦 Backups. Best effort — async IDB,
    // peut ne pas finir si l'user reload tout de suite. Le périodique
    // 5 min couvre déjà la majorité des cas. `opts.snapshotFait` (13/09/2026) :
    // l'appelant l'a déjà pris ET attendu (modale de restauration).
    if (!(opts && opts.snapshotFait) &&
        window.SessionBackups && typeof window.SessionBackups.snapshot === "function") {
      try { window.SessionBackups.snapshot("before-clear-session"); } catch(e) {}
    }
    // 🆕 v1.16.1 : on efface UNIQUEMENT le slot du plan courant — les
    // autres plans gardent leur session intacte.
    const _k = _storageKeyFor(_currentPlanId);
    if (_k) {
      try { localStorage.removeItem(_k); } catch(e) {}
    }
    // 🔄 v1.85.0 — 🩸 LE VERROU TOMBE AVEC LA COPIE, JAMAIS L UN SANS L AUTRE.
    // Effacer la session detruit les objets rapatries ; laisser le verrou
    // masquerait alors le calque d origine, et l utilisateur verrait son
    // releve disparaitre en croyant le plan casse. On libere, on reaffiche.
    if (window.CalqueSession && typeof window.CalqueSession.listeRapatries === "function") {
      try {
        window.CalqueSession.listeRapatries().forEach(function(id) {
          window.CalqueSession.restituer(id);
        });
        window.CalqueSession.loadSessionState(null);
      } catch(e) { console.warn("[SessionPersist] liberation des calques :", e); }
    }
    _lastHash = null;
    // Une installation reliée en déduit qu'il faut tout relire (sinon les objets des
    // autres ne revenaient jamais). No-op sans écouteur.
    try { window.dispatchEvent(new CustomEvent("mktm:session-cleared", { detail: { planId: _currentPlanId || null } })); } catch(e) {}
    // 🆕 v1.8.1 : annule la phase 2 de restore en attente. Sans ça, si
    // l'user clique "🗑️ Effacer la session" dans la modale de feedback
    // pendant les 1500ms du setTimeout, l'itinéraire réapparaissait
    // après l'effacement (timing piège du restore différé).
    _annulerPhase2();
  }

  // Traducteur de portée MODULE (le `_t` de la modale de restauration est
  // local à sa fonction — un ReferenceError ici serait avalé par le try et
  // le bandeau ne s'afficherait jamais).
  function _trModule(k, p) { return (window.I18n && window.I18n.t) ? window.I18n.t(k, p) : k; }

  // ========== BANDEAU « SAUVEGARDE IMPOSSIBLE » (B5) ==========
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
        if (typeof window.ouvrirExportSessionModal === "function") window.ouvrirExportSessionModal();
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

  // ========== RESTORE ==========

  function _applyRestore(payload) {
    if (!payload) return null;
    // 🆕 v1.12.0-fix : measureSurface tracké séparément pour le compteur
    // de la modale de feedback "Session restaurée".
    const restored = { points: 0, roads: 0, zones: 0, structures: 0, measure: 0, measureSurface: 0 };
    try {
      // 🐛 v1.76.1 (C2 audit 06/08) — LA LÉGENDE D'ABORD, LES OBJETS ENSUITE.
      // Elle était chargée en FIN de restore, après setRoads/setZones/
      // setStructures : à chaque boot, les objets de session d'un type custom
      // se rendaient au repli (blanc/gris) et les couleurs override étaient
      // invisibles — jusqu'à une mutation de légende ou, par accident, le
      // replay des filtres runtime (présent seulement si la session en avait).
      // C'était l'intermittence « un coup ça marche, l'autre non ».
      if (window.LegendCustomization && typeof window.LegendCustomization.loadSessionState === "function") {
        window.LegendCustomization.loadSessionState(payload.customLegend);
      }

      // 🔄 v1.85.0 — la LISTE des calques rapatries se charge ICI, mais les
      // VERROUS ne s appliquent qu en FIN de restore : `appliquerVerrous`
      // refuse de masquer un calque dont la copie de session est absente, et
      // il lui faut donc les objets deja restaures pour en juger.
      if (window.CalqueSession && typeof window.CalqueSession.loadSessionState === "function") {
        window.CalqueSession.loadSessionState(payload.calquesSession);
      }

      // 🆔 v2.1.0 — MIGRATION DES IDENTIFIANTS, à l'ouverture du plan (ETUDE_UID
      // décision 4). Les objets d'une session ancienne reçoivent un uid, et leur
      // updatedAt prend la date de la DERNIÈRE SAUVEGARDE de la session (pas
      // « maintenant » : ils n'ont pas été modifiés aujourd'hui). Un Set partagé
      // entre les 4 familles : un uid en double (migration de masse, copie d'une
      // ancienne version) est régénéré. AVANT le découpage en deux phases des
      // tracés, pour que l'itinéraire différé reçoive le même repli.
      // `VERSION` ne change PAS : une ancienne version de l'app relit la session
      // (champs inconnus ignorés) et un retour en arrière reste possible.
      if (window.KtaUid) {
        const repli = Date.parse(payload.savedAt) || Date.now();
        const vus = new Set();
        const n = window.KtaUid.ensureAll(payload.editorPoints, "pt", repli, vus)
                + window.KtaUid.ensureAll(payload.roads, "rd", repli, vus)
                + window.KtaUid.ensureAll(payload.zones, "zn", repli, vus)
                + window.KtaUid.ensureAll(payload.structures, "st", repli, vus);
        if (n > 0) console.log("[SessionPersist] Identifiants posés sur " + n + " objet(s) (migration v2.1.0)");
        // 🆔 v2.2.0 — traces de suppression de ce plan (absentes d'une session
        // antérieure = liste vide), purgées au-delà de 90 jours.
        window.KtaUid.setTombstones(payload.tombstones);
        const purgees = window.KtaUid.purge();
        if (purgees > 0) console.log("[SessionPersist] " + purgees + " trace(s) de suppression de plus de 90 jours purgée(s)");
      }

      // setEditorPoints redessine désormais en interne (depuis 09/05/2026, fix bug
      // toggle calque "Ajout" sur points restaurés) — symmetric avec setRoads/setZones
      if (window.setEditorPoints && Array.isArray(payload.editorPoints)) {
        window.setEditorPoints(payload.editorPoints);
        restored.points = payload.editorPoints.length;
      }
      // setRoads redessine en interne (renderRoads), donc juste reset + set.
      // 🆕 v1.8.1 (re-fix KARMA) : restore en DEUX PHASES pour éviter le
      // crash GPU au boot avec un itineraire actif :
      //   - Phase 1 (immédiate) : toutes les roads SAUF itinerary
      //   - Phase 2 (différée +1500ms) : les itinerary
      //
      // Pourquoi ? L'itineraire est rendu avec un CSS drop-shadow double
      // (halo néon cyan) qui est coûteux en compositing GPU. Au boot, ce
      // rendu se cumule avec :
      //   - Leaflet pas encore stabilisé (zoom/center initial)
      //   - Tuiles V2 en cours de chargement (placement progressif)
      //   - Init des autres modules (Pathfinder, label distance, etc.)
      // Le tout sature le GPU mobile → crash silencieux (= reload boucle).
      //
      // En import session MANUEL (UI sessionExporter), pas de problème :
      // l'app est déjà stabilisée, le drop-shadow s'applique sans conflit.
      // D'où ce différé qui mime le timing du flow manuel.
      //
      // Filtre defensif minimal : on garde le check r.type defini pour
      // ignorer les entrees corrompues (anciens formats, edits manuels du
      // localStorage, etc.).
      if (Array.isArray(payload.roads)) {
        const safeRoads = payload.roads.filter(function(r) {
          return r && typeof r.type === "string" && r.type.length > 0;
        });
        // Sépare itinéraires (différés) du reste (immédiat)
        const phaseImmediat = safeRoads.filter(function(r) { return r.type !== "itinerary"; });
        const phaseDifferee = safeRoads.filter(function(r) { return r.type === "itinerary"; });

        if (window.resetRoads) window.resetRoads();
        if (window.setRoads)   window.setRoads(phaseImmediat);
        restored.roads = safeRoads.length;  // on annonce le total (l'user verra l'itinéraire arriver après)

        // Phase 2 : différé. 1500ms = laisser Leaflet finir son fitBounds
        // initial + tuiles V2 se placer + autres modules s'initialiser.
        // Si entre temps l'user a tracé une nouvelle road, on la préserve
        // via concat sur getRoads() courant (pas un reset brutal).
        if (phaseDifferee.length > 0) {
          // Annuler une phase 2 en attente précédente (cas pathologique :
          // double restore dans la même session, ne devrait pas arriver
          // mais protection peu coûteuse).
          _annulerPhase2();
          _phase2TimeoutId = setTimeout(function() {
            _phase2TimeoutId = null;  // marqué comme consommé
            try {
              const current = window.getRoads ? (window.getRoads() || []) : [];
              // Sécurité : si l'user a entre-temps lancé une modale Itinéraire
              // qui a créé son propre itinéraire, on ne l'écrase pas (filter
              // sur current avant concat) — sinon on a 2 itinéraires en même
              // temps ce qui casse le label distance.
              const dejaIti = current.some(function(r) { return r && r.type === "itinerary"; });
              if (dejaIti) {
                console.info("[SessionPersist] phase 2 itinéraire : skip (un itinéraire actif existe déjà après la phase 1)");
                return;
              }
              if (window.setRoads) window.setRoads(current.concat(phaseDifferee));
              console.info("[SessionPersist] phase 2 : itinéraire restauré en mode différé");
              // 🚨 Q12 (audit 13/09/2026) : le tracé revenait SANS ses étapes
              // ① ② ③ ni ses ✓ — seule la réouverture de la modale les
              // redessinait. On les redessine ici, depuis la road restaurée.
              if (typeof window.itineraireRedessinerDepuisRoad === "function") {
                try { window.itineraireRedessinerDepuisRoad(); } catch(e) { console.warn("[SessionPersist] étapes itinéraire :", e); }
              }
            } catch(e) {
              console.warn("[SessionPersist] phase 2 échec restauration itinéraire :", e);
            }
          }, 1500);
        }
      }
      // setZones redessine en interne (renderZones), donc juste reset + set
      if (Array.isArray(payload.zones)) {
        if (window.resetZones) window.resetZones();
        if (window.setZones)   window.setZones(payload.zones);
        restored.zones = payload.zones.length;
      }
      // 🆕 v1.9.3-A1.a : restore des structures (piliers + murs).
      // Rétrocompat : payload.structures peut être absent dans les saves
      // antérieurs à v1.9.3 → on traite comme array vide (aucun reset
      // non plus pour ne pas écraser des structures déjà présentes via
      // un autre flow — mais en pratique resetStructures sera no-op
      // puisque initStructures vide déjà l'état au plan switch).
      if (Array.isArray(payload.structures)) {
        if (window.resetStructures) window.resetStructures();
        if (window.setStructures)   window.setStructures(payload.structures);
        restored.structures = payload.structures.length;
      }
      // 🆕 v1.12.0-fix : restore le mode actif (drive juste l'UI footer
      // active line + cible des prochains clics, n'efface plus rien).
      if (typeof window.setMeasureMode === "function" && typeof payload.measureMode === "string") {
        window.setMeasureMode(payload.measureMode);
      }
      // setMeasurePoints (= polyline distance) — rétrocompat avec anciens payloads
      if (window.setMeasurePoints && Array.isArray(payload.measure)) {
        window.setMeasurePoints(payload.measure);
        restored.measure = payload.measure.length;
      }
      // 🆕 v1.12.0-fix : restore aussi le polygone surface séparément
      if (window.setMeasurePointsSurface && Array.isArray(payload.measureSurface)) {
        window.setMeasurePointsSurface(payload.measureSurface);
        restored.measureSurface = payload.measureSurface.length;
      }
      // (restore de la légende : déplacé EN TÊTE de _applyRestore — cf. C2
      // ci-dessus. Les objets doivent se rendre avec la légende déjà en place.)

      // 🆕 v1.21.2 (KARMA "on active dans la sauvegarde auto le tracking") :
      // restore de la timeline tracker GPS. Rétrocompat : anciens payloads
      // n'ont pas trackerTimeline → setTrackingTimeline guarded sur Array.
      // Le tracker n'est PAS automatiquement redémarré (= juste la timeline
      // est rechargée, prête pour heatmap / replay / stats). L'user doit
      // cliquer ▶️ Play pour ré-acquérir les capteurs et continuer.
      if (typeof window.setTrackingTimeline === "function" && Array.isArray(payload.trackerTimeline)) {
        window.setTrackingTimeline(payload.trackerTimeline, payload.trackerStartTs || null);
        restored.trackerTimeline = payload.trackerTimeline.length;
      }

      // 🆕 v1.21.5 (KARMA "refonte filtre Leaflet — persistance per-plan") :
      // restore des filtres runtime FilterPanel. Array → Set côté loader.
      // Rétrocompat : anciens payloads sans runtimeFilters → état par défaut
      // (tous filtres null = tout visible). Le runtime accepte aussi null
      // partiel par champ (ex : tags=null + roadTypes=["principal"]).
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
        const _active = [];
        if (window._ktaRuntimeFilters.tags        !== null) _active.push("tags");
        if (window._ktaRuntimeFilters.roadTypes   !== null) _active.push("roadTypes");
        if (window._ktaRuntimeFilters.zoneTypes   !== null) _active.push("zoneTypes");
        if (window._ktaRuntimeFilters.structTypes !== null) _active.push("structTypes");
        restored.runtimeFilters = _active.length;
        // Applique immédiatement le filtre runtime sur la map (les modules
        // de rendu lisent _ktaRuntimeFilters à chaque pass). On déclenche le
        // re-render via le helper global. Throttle pour éviter de courir
        // avant que les markers session soient eux-mêmes restaurés (phase 2
        // de _restore — itineraries +1500ms).
        setTimeout(function() {
          if (typeof window.appliquerFiltreRuntime === "function") {
            try { window.appliquerFiltreRuntime(); } catch(e) {}
          }
          // 🚨 Q34 (audit 13/09/2026) : des filtres restaurés EN SILENCE au
          // rechargement → « où sont passés mes points ? ». On le dit, et la
          // pastille du bouton ≡ suit.
          if (window.FilterPanel && typeof window.FilterPanel.majBadge === "function") {
            try { window.FilterPanel.majBadge(); } catch(e) {}
          }
          if (_active.length > 0 && window.OOMGuard && typeof window.OOMGuard.showToast === "function") {
            window.OOMGuard.showToast(_trModule("session.toast.filtresRestaures", { n: _active.length }), "warn", { groupe: "chargement" });   // 🔕 regroupé au chargement
          }
        }, 200);
      }

      // 🔄 v1.85.0 — VERROUS DES CALQUES RAPATRIES, une fois les objets la.
      // 🩸 Piege paye d avance : un verrou pose SANS sa copie donnerait un
      // plan vide et muet (cas reel : la sauvegarde a saute sur quota).
      // `appliquerVerrous` verifie la presence avant de masquer, et libere
      // en le disant. Differe comme les filtres runtime : les setters de la
      // phase 2 (itineraires, +1500 ms) ne doivent pas rearmer un calque.
      if (window.CalqueSession && typeof window.CalqueSession.appliquerVerrous === "function") {
        setTimeout(function() {
          try { window.CalqueSession.appliquerVerrous(); } catch(e) {
            console.warn("[SessionPersist] verrous de calques :", e);
          }
        }, 250);
      }

      // Mettre à jour le hash courant pour que le prochain poll ne détecte pas
      // les setters comme une modification utilisateur
      _lastHash = _hashState(_gatherState());
      return restored;
    } catch(e) {
      console.error("[SessionPersist] restore échoué :", e);
      return null;
    }
  }

  function _viderEtatCourant() {
    // 🆕 v1.8.1 : annule la phase 2 de restore en attente (même raison
    // que dans clear() — cf. commentaire). Double protection en cas
    // d'appel direct sans passer par clear().
    _annulerPhase2();
    // 🆔 v2.2.0 — « Effacer la session » est une remise à zéro locale : les
    // traces de suppression partent aussi (décision KARMA Q1, 04/10/2026).
    if (window.KtaUid) window.KtaUid.setTombstones([]);
    // 🌀 Un point de session qui porte une LIAISON INTER-PLAN (portail) est gardé :
    // la liaison vit dans son propre registre, l'effacer laissait une liaison
    // orpheline et invisible (retour KARMA 05/10/2026). Pour le retirer : supprimer
    // le point (sa liaison part avec lui, InterPlanLinks.onPointDeleted).
    let portails = [];
    const IPL = window.InterPlanLinks;
    if (IPL && typeof IPL.getLinksForPoint === "function" && typeof window.getEditorPoints === "function") {
      portails = (window.getEditorPoints() || []).filter(function(p) {
        try { return IPL.getLinksForPoint(_currentPlanId, p).length > 0; } catch(e) { return false; }
      });
    }
    if (window.setEditorPoints)  window.setEditorPoints(portails);
    if (window.resetRoads)       window.resetRoads();
    if (window.resetZones)       window.resetZones();
    // 🆕 v1.9.3-A1.a : structures purgées aussi lors d'un vidage
    if (window.resetStructures)  window.resetStructures();
    // 🆕 v1.16.0 step 2 : reset des overrides légende session (les valeurs
    // du plan restent — c'est le niveau supérieur de la cascade).
    if (window.LegendCustomization && typeof window.LegendCustomization.resetSession === "function") {
      window.LegendCustomization.resetSession();
    }
    if (window.setMeasurePoints)        window.setMeasurePoints([]);
    // 🆕 v1.12.0-fix : vide aussi la mesure de surface
    if (window.setMeasurePointsSurface) window.setMeasurePointsSurface([]);
    // 🐛 v1.64.0 (KARMA « je refuse la session mais le tracé tracker de la
    // précédente session persiste ») : le TRACKER n'était jamais vidé —
    // la timeline restaurée, le tracé visible (polyline multi-segments) et
    // le marker repositionné survivaient à l'« Effacer la session ».
    // resetTrackingPosition fait tout : timeline vidée, tracé effacé,
    // marker + vue remis sur la position initiale du plan.
    if (typeof window.resetTrackingPosition === "function") {
      try { window.resetTrackingPosition(); } catch(e) {}
    }
    return portails.length;
  }

  // ========== MODALE DE FEEDBACK ==========
  // Modale centrée respectant la charte des autres modales de l'app
  // (kta-readme-modal pattern : overlay sombre + boîte centrée)

  function _afficherModaleSession(restored) {
    if (!restored) return;
    const total = restored.points + restored.roads + restored.zones
                + (restored.structures || 0) + restored.measure
                // 🆕 v1.12.0-fix : surface compte aussi pour décider d'afficher
                + (restored.measureSurface || 0)
                // 🐛 v1.64.0 : une session TRACKER-SEULE (long tracé, rien
                // d'autre) n'affichait pas la modale → impossible de la
                // refuser. Le tracé compte comme contenu restauré.
                + (restored.trackerTimeline ? 1 : 0);
    if (total === 0) return;

    const existing = document.getElementById("kta-session-modal");
    if (existing) existing.remove();

    // 🌍 v1.46.0 — i18n au rendu (la modale se construit au chargement du plan,
    // donc après I18n.init). Helper local avec fallback clé brute.
    const _t = function(k) { return (window.I18n && window.I18n.t) ? window.I18n.t(k) : k; };
    const parts = [];
    if (restored.points)     parts.push(restored.points  + " " + _t(restored.points  > 1 ? "session.unit.points"     : "session.unit.point"));
    if (restored.roads)      parts.push(restored.roads   + " " + _t(restored.roads   > 1 ? "session.unit.roads"      : "session.unit.road"));
    if (restored.zones)      parts.push(restored.zones   + " " + _t(restored.zones   > 1 ? "session.unit.zones"      : "session.unit.zone"));
    // 🆕 v1.9.3-A1.a : structures dans le feedback restauration session
    if (restored.structures) parts.push(restored.structures + " " + _t(restored.structures > 1 ? "session.unit.structures" : "session.unit.structure"));
    if (restored.measure)    parts.push(_t("session.unit.measureDist"));
    // 🆕 v1.12.0-fix : surface dans le feedback de restauration
    if (restored.measureSurface) parts.push(_t("session.unit.measureSurf"));
    // 🐛 v1.64.0 : tracé tracker dans le feedback (et le total ci-dessus)
    if (restored.trackerTimeline) parts.push(_t("session.unit.tracker"));

    // Nom du plan en cours (échappé) pour que l'utilisateur voie clairement de quel plan vient la session
    const planName = _currentPlanName();
    const planNameSafe = planName.replace(/[&<>"']/g, function(c) {
      return { "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c];
    });
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

    function fermer() {
      modal.classList.add("hiding");
      setTimeout(function() { modal.remove(); }, 220);
    }

    modal.querySelector('[data-action="keep"]').addEventListener("click", fermer);
    // 🚨 Q44 (audit ergonomie 13/09/2026) : « 🗑️ Effacer la session » agissait
    // en 1 tap, sans confirmation, à côté de « Continuer » — avec des gants,
    // un doigt qui glisse effaçait tout (y compris les calques rapatriés). La
    // même destruction depuis ≡ Filtres avait DEUX confirmations. Désormais :
    // confirmation chiffrée, snapshot ATTENDU, toast qui dit où le retrouver.
    modal.querySelector('[data-action="clear"]').addEventListener("click", function() {
      const n = _compterEtatCourant();
      const go = function() {
        const snap = (window.SessionBackups && typeof window.SessionBackups.snapshot === "function")
          ? Promise.resolve().then(function() { return window.SessionBackups.snapshot("before-clear-session"); })
              .catch(function() { return null; })
          : Promise.resolve(null);
        snap.then(function(entry) {
          const gardes = _viderEtatCourant();
          clear({ snapshotFait: true });
          fermer();
          if (window.OOMGuard && typeof window.OOMGuard.showToast === "function") {
            window.OOMGuard.showToast(_t(entry ? "session.toast.clearedSnap" : "session.toast.cleared") +
              (gardes ? " " + _trModule("session.toast.portailsGardes", { n: gardes }) : ""), "info");
          }
        });
      };
      if (typeof window.ktaConfirm === "function") {
        const msg = (window.I18n && window.I18n.t)
          ? window.I18n.t("session.confirm.clear", n) : "Effacer la session ?";
        window.ktaConfirm(msg, {
          titre:       _t("session.confirm.clearTitle"),
          okLabel:     _t("session.btn.clear"),
          cancelLabel: _t("session.btn.keep")
        }).then(function(ok) { if (ok) go(); });
      } else {
        go();
      }
    });
    // Click sur le backdrop = "Continuer" (pattern modal soft)
    modal.addEventListener("click", function(e) {
      if (e.target === modal) fermer();
    });
    // Échap = "Continuer"
    const onKey = function(e) {
      if (e.key === "Escape") {
        fermer();
        document.removeEventListener("keydown", onKey);
      }
    };
    document.addEventListener("keydown", onKey);
  }

  // ========== POLLING ==========

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

  // Hook sur changement du toggle PerfUltra.slowSave → redémarrer le polling
  // avec le nouvel intervalle (sans attendre un reload).
  if (window.PerfUltra && typeof window.PerfUltra.onChange === "function") {
    window.PerfUltra.onChange(function(changedKeys) {
      if (changedKeys.indexOf("slowSave") >= 0 && _pollTimer) {
        _stopPolling();
        _startPolling();
      }
    });
  }

  // 🐛 v1.64.0 — Appelé par main.js > _libererRessourcesPlanPrecedent AVANT
  // tout démontage : save final forcé (l'état RAM est encore intact) puis
  // ARRÊT du polling. Sans ça, un tick 1.5 s entre le teardown (qui vide la
  // timeline tracker) et le onPlanLoaded du nouveau plan sauvegardait un
  // état mutilé sur le slot de l'ANCIEN plan (timeline perdue, voire slot
  // purgé via _isEmptyState pour une session tracker-seule).
  function onPlanUnload() {
    if (_currentPlanId) {
      try { save({ force: true }); } catch(e) {}
    }
    _stopPolling();
    // Neutralise aussi les filets beforeunload/visibilitychange pendant la
    // fenêtre de switch (ils forcent save() — même risque d'état mutilé).
    // save() est gardé par `if (!_currentPlanId) return` ; onPlanLoaded du
    // nouveau plan re-pose l'id.
    _currentPlanId = null;
    console.log("[SessionPersist] Plan unload — save final + persistance figée jusqu'au prochain plan");
  }

  // ========== HOOK PRINCIPAL ==========

  // Appelé par main.js > lancerApplication() après init complète
  // Logique (🆕 v1.16.1, slots per-plan) :
  //  - Migre l'ancien slot unique `myktamap_session_v1` (legacy v1.16.0
  //    et avant) vers le nouveau slot per-plan si présent.
  //  - Lit `myktamap_session_v1_<planId>` du plan demandé.
  //  - Si présent → restore + toast.
  //  - Si absent → rien à restaurer (=  plan nouveau OU jamais sauvé).
  //  - Plus de wipe au plan switch : la session d'un autre plan reste
  //    dans son slot et sera restaurée naturellement quand l'user
  //    reviendra sur ce plan.
  //  - Démarre le polling pour la session courante.
  function onPlanLoaded(planId) {
    _stopPolling();
    // 🆕 v1.8.1 : annule la phase 2 de restore en attente. Sinon, si
    // l'user a chargé une session avec itinéraire (phase 2 setTimeout
    // de 1500ms en cours) puis a fait un plan switch (🗂️) avant que
    // les 1500ms s'écoulent, le setTimeout finirait par s'exécuter sur
    // le NOUVEAU plan → l'itinéraire de l'ancien plan apparaîtrait
    // collé au nouveau. Bug subtil mais reproductible.
    _annulerPhase2();
    _currentPlanId = planId || null;
    _lastHash = null;

    // 🆕 v1.16.1 — Migration ancien slot unique → per-plan (idempotente).
    // Si on a une session legacy stockée dans `myktamap_session_v1`, on
    // la déplace vers `myktamap_session_v1_<savedPlanId>` au boot. Comme
    // ça les users qui mettent à jour depuis v1.16.0 ne perdent rien.
    _migrerAncienSlotUniqueSiBesoin();

    if (!_currentPlanId) {
      // Pas de planId connu → on ne touche pas au stockage existant, on démarre quand même le poll
      _startPolling();
      return null;
    }

    // 🐛 v1.76.0 — RESET DE LA LÉGENDE AVANT TOUTE RESTAURATION.
    // `LegendCustomization._sessionState` n'était réinitialisé NULLE PART au
    // changement de plan : `loadSessionState` n'était appelé que depuis
    // `_applyRestore`, donc uniquement quand un slot existait ET que le
    // `nameMatch` passait. Charger un plan jamais visité laissait donc en place
    // les types custom du plan PRÉCÉDENT — affichés dans ≡ Légende, proposés au
    // dessin dans la sidebar, puis écrits dans le slot du nouveau plan au
    // premier poll d'auto-save. La légende d'un plan contaminait le suivant.
    // On repart d'un état vide : soit `_applyRestore` recharge juste après la
    // vraie légende du plan, soit il n'y en a pas et l'état vide est correct.
    // (`_planState`, lui, vient de `loadPlanState()` et n'est pas concerné.)
    if (window.LegendCustomization && typeof window.LegendCustomization.loadSessionState === "function") {
      try { window.LegendCustomization.loadSessionState(null); }
      catch(e) { console.warn("[SessionPersist] reset légende échec :", e); }
    }
    // 🆔 v2.2.0 — même piège que la légende : les traces de suppression du plan
    // PRÉCÉDENT ne doivent pas être écrites dans le slot de celui-ci. On repart
    // de zéro ; _applyRestore recharge celles du plan s'il en a.
    if (window.KtaUid) window.KtaUid.setTombstones([]);

    const saved = getSaved();  // lit le slot du plan courant
    let restored = null;
    if (saved) {
      // Double-check planName : avec slots per-plan, le risque de
      // collision d'ID est très faible (slot dédié par planId). Mais
      // si deux plans locaux différents finissent par avoir le même
      // genLocalId (cas marginal), on évite quand même de charger la
      // mauvaise session. Pas de wipe ici : on skip silencieusement et
      // on laisse le slot tel quel — il pourrait être encore utile au
      // bon plan si on y revient.
      const currentName = _currentPlanName();
      const nameMatch   = (!saved.planName || !currentName)
                            ? true
                            : (saved.planName === currentName);

      if (nameMatch) {
        restored = _applyRestore(saved);
        if (restored) _afficherModaleSession(restored);
      } else if (window.APP_CONFIG && window.APP_CONFIG.debugMode) {
        console.log("[SessionPersist] Session écartée (nameMatch ko) — saved=",
                    saved.planId, "/", saved.planName,
                    " current=", _currentPlanId, "/", currentName);
      }
    }
    _startPolling();
    return restored;
  }

  // ========== SAFETY NETS ==========

  // Save au unload (fermeture page)
  // Force=true au unload : critique de pas perdre les dernières modifs même
  // si le main thread est busy (la page va disparaître, on n'aura pas de 2e chance).
  window.addEventListener("beforeunload", function() { save({ force: true }); });

  // Save quand la page passe en arrière-plan (mobile + onglet caché)
  document.addEventListener("visibilitychange", function() {
    // Force=true quand l'app passe en arrière-plan (mobile : iOS peut tuer
    // l'onglet pour récup mémoire), même règle que beforeunload.
    if (document.visibilityState === "hidden") save({ force: true });
  });

  // ========== EXPORTS ==========
  window.SessionPersist = {
    onPlanLoaded: onPlanLoaded,
    onPlanUnload: onPlanUnload,   // 🐛 v1.64.0 : figer la persistance au teardown
    save:         save,
    clear:        clear,
    getSaved:     getSaved,
    getLastSaveInfo: getLastSaveInfo   // 🚨 Q46
  };
})();
