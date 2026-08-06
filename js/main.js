/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * https://myktamap.fr — Licence CC BY-NC-SA 4.0
 * Usage commercial interdit sans accord ecrit prealable. Voir LICENSE.
 */

// =========================
// MAIN.JS — unifié serveur + import navigateur + registre de plans
// =========================

// =========================
// CHARGEMENT DES DONNÉES
// =========================
async function initDataFromConfig() {
  const config = window.PLAN_CONFIG;
  if (!config || !Array.isArray(config.dataLayers)) {
    console.warn("[Main] Aucune dataLayer à charger");
    return;
  }
  // Vider le registre des routes embarquées du plan précédent — elles seront re-remplies
  // au fil du chargement des calques par ajouterPointsDepuisJSON > registerEmbeddedRoad
  if (typeof window.clearEmbeddedRoads === "function") {
    window.clearEmbeddedRoads();
  }

  // 🏗️ Multi-niveau (v148) : vider les registres des objets data layers du
  // plan precedent (markers + polylines + polygons) — ils seront re-remplis
  // par ajouterPointsDepuisJSON ci-dessous. Sans ce reset, les objets du
  // plan precedent restent dans les registres et le filtre niveau tenterait
  // de les modifier alors qu'ils sont detaches de la map.
  window._ktaDataMarkers   = [];
  window._ktaDataPolylines = [];
  window._ktaDataPolygons  = [];
  // 🆕 v1.9.3-A1.a : registre des structures embarquées via data layer
  // (= structure.json chargé via plan-config.json comme zone.json l'est).
  // Vidé au plan switch pour éviter que des structures du plan précédent
  // restent référencées et soient ciblées par le filtre niveau actif.
  window._ktaDataStructurePolygons = [];
  // 🐛 v1.34.7 — RETIRÉ : `window._ktaImageOverlays = [];` (était ici en
  // v162). Bug racine de "checkbox imageLayer décoché alors que calque
  // visible / cocher ne fait rien" : initDataFromConfig était appelée
  // APRÈS initMapFromConfig (cf lancerApplication l293-294). Le reset
  // ici vidait le registre que initMapFromConfig venait de populer
  // (push à map.js:420). Les overlays restaient attachés à la map (Leaflet
  // a sa propre référence interne dans `_layers`), mais le registre était
  // vide → filterPanel ne trouvait plus aucune entry → handler change
  // retournait early. Le reset est déjà fait dans `map.js:403` JUSTE
  // AVANT les push, ce qui suffit (et c'est le bon endroit puisque c'est
  // la même fonction qui pousse).
  // v1.16.0 step 1d : registre des ghosts note du data layer KMZ. Vidé
  // au switch de plan pour éviter d'accumuler des références mortes
  // référant aux layerGroups du plan précédent (cf utils.js).
  if (typeof window._kta_resetDataLayerNoteGhosts === "function") {
    window._kta_resetDataLayerNoteGhosts();
  }
  // v1.16.0 step 2 : charge la couche "plan" de la légende personnalisée
  // (PLAN_CONFIG.customLegend). Doit être appelé APRÈS que PLAN_CONFIG
  // est en place — startApp() est invoqué après load du plan-config.json.
  // Le niveau "session" (= overrides utilisateur) est chargé séparément
  // par SessionPersist._applyRestore().
  if (window.LegendCustomization && typeof window.LegendCustomization.loadPlanState === "function") {
    window.LegendCustomization.loadPlanState();
  }
  // v1.16.0 step 3 : charge les favoris du plan courant. Le module
  // Favoris stocke la liste indexée par planId — switch de plan = swap
  // de la liste active. Le planId est window._currentLoadedPlanId
  // (défini par le plan switcher / loader).
  if (window.Favoris && typeof window.Favoris.loadPlan === "function") {
    window.Favoris.loadPlan(window._currentLoadedPlanId || null);
  }

  // Détection : la session SessionPersist contient-elle des editor points pour ce plan ?
  // Si oui, on SKIP le fetch de data/editor.json car le restore est autoritaire.
  // Sans ce skip, les markers du JSON arrivent async APRÈS le restore et coexistent
  // avec ceux de la session dans le layerEditor — mais ces markers JSON ne sont
  // PAS dans listePoints, donc tout render ultérieur (suppression, ajout) les efface
  // silencieusement, et le contrôle des calques peut sembler ne pas les gérer.
  //
  // 🐛 v1.21.3 (audit anti-crash P0-1) : avant ce fix, on lisait le slot
  // legacy unique `myktamap_session_v1` qui n'est plus écrit depuis la
  // migration v1.16.1 vers le slot per-plan `myktamap_session_v1_<planId>`.
  // Résultat : `_skipEditorJsonLoad` restait toujours false → `data/editor.json`
  // se chargeait async PAR-DESSUS la session restaurée → bug silencieux 100%
  // reproductible sur tout plan moderne avec un editor.json fourni.
  // Fix : passer par `window.SessionPersist.getSaved(planId)` qui pointe sur
  // le slot per-plan via le bon préfixe.
  let _skipEditorJsonLoad = false;
  try {
    const planId = window._currentLoadedPlanId;
    const saved  = (window.SessionPersist && typeof window.SessionPersist.getSaved === "function")
                   ? window.SessionPersist.getSaved(planId)
                   : null;
    if (saved) {
      const planName = (window.PLAN_CONFIG && window.PLAN_CONFIG.plan && window.PLAN_CONFIG.plan.name) || "";
      const idMatch   = saved.planId === planId;
      const nameMatch = (!saved.planName || !planName) ? true : (saved.planName === planName);
      if (idMatch && nameMatch && Array.isArray(saved.editorPoints) && saved.editorPoints.length > 0) {
        _skipEditorJsonLoad = true;
        console.log("[Main] Session active avec", saved.editorPoints.length, "point(s) editor → skip data/editor.json (session autoritative)");
      }
    }
  } catch(e) {
    console.warn("[Main] _skipEditorJsonLoad detection failed :", e);
  }

  config.dataLayers.forEach(function(layerConfig) {
    if (_skipEditorJsonLoad && layerConfig.id === "editor") return;
    const targetLayer = window.dataLayerGroups?.[layerConfig.id];
    if (targetLayer) {
      ajouterPointsDepuisJSON(layerConfig.file, targetLayer);
    }
  });
}

// Verrou pour éviter double lancement
let _appEnCours = false;
// Flag : true = l'utilisateur a explicitement demandé un import
let _importDemande = false;

// =========================
// AUTO-DISCOVERY SERVEUR (data/index.json)
// =========================
// 🛠️ v1.73.0 — MODE SERVEUR KIOSQUE (gouvernance : community-server-line.md).
// data/index.json porte, en plus de plans[], un bloc `config` (subtitle +
// 2 flags MAX — règle figée) et un bloc `liaisons`. Le SW le sert
// network-first → les changements d'un admin kiosque se propagent au boot
// suivant, sans réinstallation.
//
// _chargerIndexServeur() : fetch + parse + application de la config.
// TOUJOURS appelée au boot — la pref « ne pas charger les plans serveur »
// ne skippe QUE l'enregistrement des plans (decouvrirPlansServeur), pas la
// config d'instance (sinon : sous-titre/flags morts pour ces users).
async function _chargerIndexServeur() {
  try {
    const r = await fetch("data/index.json");
    if (!r.ok) {
      console.log("[Main] data/index.json absent — pas de config d'instance");
      return null;
    }
    const idx = await r.json();
    window.KIOSK_CONFIG = (idx && typeof idx.config === "object" && idx.config) ? idx.config : null;
    _appliquerConfigKiosque();
    // 🌀 Liaisons fournies par l'instance : FUSION par id dans le registre
    // local (idempotent — rejouée à chaque boot, dédup par link.id). Une
    // liaison retirée côté serveur reste chez qui l'a déjà (assumé, doc).
    try {
      const lks = idx && idx.liaisons && Array.isArray(idx.liaisons.links) ? idx.liaisons.links : [];
      if (lks.length && window.InterPlanLinks && typeof window.InterPlanLinks.importLinks === "function") {
        const added = window.InterPlanLinks.importLinks(lks);
        if (added > 0) console.log("[Main] Liaisons kiosque fusionnées : +" + added);
      }
    } catch(e) { console.warn("[Main] liaisons kiosque :", e); }
    return idx;
  } catch(e) {
    console.warn("[Main] lecture data/index.json :", e);
    return null;
  }
}

// Application de `config` : sous-titre (splash + header loader — textContent
// jamais innerHTML, + retrait de data-i18n pour survivre aux changements de
// langue) et flags kiosque (= DÉCLUTTER UI, pas de la sécurité — assumé).
function _appliquerConfigKiosque() {
  const cfg = window.KIOSK_CONFIG || {};
  const st = (typeof cfg.subtitle === "string") ? cfg.subtitle.trim().slice(0, 80) : "";
  if (st) {
    document.querySelectorAll('[data-i18n="home.tagline"]').forEach(function(el) {
      el.textContent = st;
      el.removeAttribute("data-i18n");
    });
    console.log("[Main] Sous-titre kiosque appliqué :", st);
  }
  if (cfg.serverPlansOnly === true) {
    // Masque le flux d'import (dropzone + FS Access + « Charger ce plan »)
    // et les prefs serveur devenues sans objet. La liste, les Outils et les
    // données user (sessions, carnet…) restent intacts.
    const pz = document.getElementById("panelZip");
    if (pz) {
      pz.style.display = "none";
      const head = pz.previousElementSibling;
      if (head && head.classList && head.classList.contains("loader-section-head")) head.style.display = "none";
    }
    const filtres = document.querySelector(".loader-plans-filters");
    if (filtres) filtres.style.display = "none";
    const skipCb = document.getElementById("loaderSkipServerPlansCb");
    if (skipCb && skipCb.closest) {
      const sec = skipCb.closest(".kta-aide-section");
      if (sec) sec.style.display = "none";
    }
    console.log("[Main] Kiosque : serverPlansOnly actif (import masqué)");
  }
  if (cfg.disableGenerator === true) {
    const gen = document.getElementById("loaderPlannerBtn");
    if (gen) gen.style.display = "none";
    console.log("[Main] Kiosque : disableGenerator actif");
  }
}

async function decouvrirPlansServeur(idxDeja) {
  if (!window.PlanRegistry) return;
  try {
    const idx = idxDeja || await _chargerIndexServeur();
    if (!idx) return;
    const plans = Array.isArray(idx?.plans) ? idx.plans : [];
    console.log("[Main] index.json trouvé :", plans.length, "plan(s)");

    plans.forEach(function(entry) {
      // Format détaillé : { id, path, name, version?, author?, multiLevel?, tiledV2? }
      // Format minimal : "test1" (string) → on déduit
      let path, name, version, author, id, multiLevel, tiledV2;
      if (typeof entry === "string") {
        path = "data/" + entry;
        name = entry;
        id   = window.PlanRegistry.genServerId(path);
      } else if (entry && typeof entry === "object") {
        path = entry.path || ("data/" + (entry.id || ""));
        name = entry.name || entry.id || path;
        version = entry.version || null;
        author  = entry.author  || null;
        // 🏗️ Mode badges (v150) : flags optionnels declares dans data/index.json
        // pour que la liste de plans affiche les badges V2 / Multi-LVL immediatement,
        // sans avoir a charger chaque plan-config.json. Pour les plans locaux et
        // server-mais-pas-declares, les flags sont stockes en PlanRegistry au
        // premier load (cf _enregistrerPlanCharge dans chargerPlanServeur / startImportedPlan).
        if (entry.multiLevel === true) multiLevel = true;
        if (entry.tiledV2    === true) tiledV2    = true;
        id   = entry.id ? "server_" + entry.id.replace(/[^a-z0-9_-]/gi, "_") : window.PlanRegistry.genServerId(path);
      } else {
        return;
      }

      const regEntry = {
        id: id,
        type: "server",
        path: path,
        name: name,
        version: version,
        author: author,
        discovered: true,
        addedAt: new Date().toISOString()
      };
      // Ajout conditionnel des flags (sinon Object.assign dans addOrUpdate effacerait
      // un user-override explicite en multiLevel:false par setMultiLevel).
      if (multiLevel === true) regEntry.multiLevel = true;
      if (tiledV2    === true) regEntry.tiledV2    = true;
      window.PlanRegistry.addOrUpdate(regEntry);
    });
  } catch(e) {
    console.warn("[Main] Erreur auto-discovery serveur :", e);
  }
}

// =========================
// ENREGISTRER DANS LE REGISTRE APRÈS CHARGEMENT
// =========================
function _enregistrerPlanCharge(infos) {
  if (!window.PlanRegistry || !infos) return;
  window.PlanRegistry.addOrUpdate(infos);
  window.PlanRegistry.markOpened(infos.id);
}

// =========================
// LANCEMENT DE LA CARTE (après config prête)
// =========================
async function lancerApplication() {
  if (_appEnCours) {
    console.warn("[Main] lancerApplication déjà en cours, ignoré");
    return;
  }
  _appEnCours = true;

  // 🆕 v1.11.2 V2.2 : timestamp de début de session pour calculer la
  // durée (modale Détails session). Set à chaque démarrage de
  // lancerApplication (= nouveau plan chargé). Reset dans
  // _libererRessourcesPlanPrecedent au plan switch.
  window._sessionStartTs = Date.now();

  try {
  // Reset complet de l'interface
  window.interfaceInitialized = false;
  window.roadInitialized      = false;
  window.zonesInitialized     = false;
  // 🆕 v1.9.3-A1.a-fix6 (KARMA "je fait une structure, change de plan,
  // et je peux plus en faire") : flag reset au plan switch pour que
  // initStructures() ré-attache le click handler sur la NOUVELLE map
  // Leaflet (cleanupExistingMap dans map.js détruit l'ancienne map →
  // tous les listeners attachés via window.map.on() sont perdus avec
  // elle). Sans ce reset, structuresInitialized restait true → return
  // early dans initStructures → click handler perdu, plus de dessin.
  // Bug NON présent en zones car ce reset existait déjà pour
  // zonesInitialized. Le flag structures avait été oublié dans le
  // commit A1.a initial.
  window.structuresInitialized = false;

  // 🏗️ Multi-niveau (v148) : lecture de la preference par plan (PlanRegistry)
  // + reset des etats de session (activeLevel = 0, visibleLevels = [0] a
  // chaque plan switch — confirme Q4 du topo). Si la feature n'est pas
  // activee pour ce plan, multiLevel reste false → UI cachee + comportement
  // strictement identique a v147 pour la retro-compat.
  try {
    const _planId = window._currentLoadedPlanId;
    // 🏗️ Multi-niveau : ordre de priorite pour determiner si la feature est
    // activee :
    //   1. Si user a explicitement toggle via ⚙️ Reglages → PlanRegistry.multiLevel
    //      (true ou false) → ca prime
    //   2. Sinon → plan-config.json `plan.multiLevel` (par defaut du generateur)
    //   3. Sinon → false (retro-compat absolue avec plans v147 et avant)
    const _fromConfig = !!(window.PLAN_CONFIG && window.PLAN_CONFIG.plan
                            && window.PLAN_CONFIG.plan.multiLevel === true);
    const _multiOn = (_planId && window.PlanRegistry && typeof window.PlanRegistry.getMultiLevel === "function")
      ? window.PlanRegistry.getMultiLevel(_planId, _fromConfig)
      : _fromConfig;
    APP_CONFIG.multiLevel     = !!_multiOn;
    APP_CONFIG.activeLevel    = 0;
    if (!Array.isArray(APP_CONFIG.availableLevels) || APP_CONFIG.availableLevels.length === 0) {
      APP_CONFIG.availableLevels = [-2, -1, 0, 1, 2];  // defaut symetrique (v154+)
    }
    // 🆕 v1.10.0 (KARMA "en mode M-LVL, fait en sorte que -1, 0, +1 soit
    // affiché par défaut") : si multi-niveau actif → on montre les 3
    // niveaux centraux par défaut, filtrés par les niveaux effectivement
    // disponibles dans availableLevels. Si single-level → [0] strict
    // (retro-compat absolue, pas de comportement inattendu).
    if (APP_CONFIG.multiLevel) {
      const _candidats = [-1, 0, 1].filter(function(l) {
        return APP_CONFIG.availableLevels.indexOf(l) >= 0;
      });
      APP_CONFIG.visibleLevels = _candidats.length > 0 ? _candidats : [0];
    } else {
      APP_CONFIG.visibleLevels = [0];   // reset filtre : montre uniquement le niveau 0 au load
    }
    // 🏗️ v154 : auto-extension de availableLevels — premier passage (session).
    // Voir window._etendreAvailableLevelsSiBesoin pour les details.
    if (APP_CONFIG.multiLevel === true && typeof window._etendreAvailableLevelsSiBesoin === "function") {
      window._etendreAvailableLevelsSiBesoin();
    }
    window.APP_CONFIG = APP_CONFIG;
    // Body class : la boussole et autres elements fixes top-left utilisent
    // cette classe pour se decaler vers le bas et liberer de la place pour
    // le Leaflet control "niveau actif" sous le zoom.
    if (APP_CONFIG.multiLevel === true) {
      document.body.classList.add("kta-multilevel-active");
    } else {
      document.body.classList.remove("kta-multilevel-active");
    }
    console.log("[Main] multiLevel pour ce plan :", APP_CONFIG.multiLevel, "(planId=" + _planId + ")");
  } catch(e) {
    console.warn("[Main] init multi-niveau a echoue :", e);
  }

  // Nettoyer les modales orphelines
  ["kta-aide-modal","kta-legende-modal","kta-cfg-modal","kta-readme-modal",
   "kta-readme-choix","kta-conv-modal","kta-planner-modal","popupChangerPlan",
   "kta-titre-fixe"
  ].forEach(function(id) {
    const el = document.getElementById(id);
    if (el) el.remove();
  });

  // Masquer le loader
  const overlay = document.getElementById("planLoaderOverlay");
  if (overlay) overlay.style.display = "none";

  // 🆕 v1.9.2-hotfix-loader-header : retire la classe pour ré-afficher
  // le header + statusbar refonte (symétrique d'afficherLoader). Cf.
  // afficherLoader() pour le rationale détaillé.
  document.body.classList.remove("kta-loader-active");

  // 🌀 v152 : message overlay au moment du render carte (lourd sur V2)
  if (typeof window._majOverlayChargement === "function") {
    window._majOverlayChargement("Initialisation de la carte et des calques…");
  }

  await new Promise(function(resolve) { requestAnimationFrame(resolve); });

  await initMapFromConfig();
  await initDataFromConfig();

  map.fitBounds(bounds);

  initEditor();
  initRoad();
  initZones();
  // 🆕 v1.9.3-A1.a : init du module structures (piliers + murs). Doit
  // venir après initZones() pour que window.map.on("click") soit déjà
  // attaché — pas critique en pratique car les listeners se cumulent,
  // mais on garde un ordre lisible.
  if (typeof window.initStructures === "function") {
    window.initStructures();
  }
  initMeasure();
  initInterface();
  initTracking();

  // 🆕 v1.16.0 step 4 : init SessionBackups + snapshot AVANT restore.
  //
  // L'ordre est important :
  //   1. SessionBackups.init() ouvre IDB + démarre timer auto 5 min
  //   2. Snapshot IMMÉDIAT de localStorage (= état de la session "en place"
  //      avant la restore actuelle). Cas critique : plan switch — le
  //      localStorage contient la session du PLAN PRÉCÉDENT, on la backup
  //      avant que onPlanLoaded ne la "déclasse" et que les saves auto
  //      de la nouvelle session l'écrasent. Si on snapshote APRÈS restore,
  //      cette session du plan précédent serait perdue.
  //   3. Puis SessionPersist.onPlanLoaded fait son boulot normal (restore
  //      si planId matche, sinon ignore).
  //   4. Et un second snapshot APRÈS restore (= état restauré = ce que
  //      voit l'utilisateur). Permet un point de retour récent même si
  //      l'init n'a rien capté (cas session vide au boot).
  if (window.SessionBackups && typeof window.SessionBackups.init === "function") {
    window.SessionBackups.init().then(function() {
      try { window.SessionBackups.snapshot("boot-pre-restore"); } catch(e) {}
    });
  }

  // Restauration de session si correspond au plan courant (et démarrage du polling auto-save)
  if (window.SessionPersist) {
    window.SessionPersist.onPlanLoaded(window._currentLoadedPlanId || null);
  }

  // 📔 v1.69.0 — Ouverture d'une SORTIE au carnet. Impérativement APRÈS
  // SessionPersist.onPlanLoaded : la baseline des compteurs doit inclure la
  // session restaurée, sinon tout le contenu déjà présent serait compté comme
  // « ajouté pendant cette sortie ».
  if (window.Journal && typeof window.Journal.onPlanLoaded === "function") {
    try {
      window.Journal.onPlanLoaded(
        window._currentLoadedPlanId || null,
        (window.PLAN_CONFIG && window.PLAN_CONFIG.plan && window.PLAN_CONFIG.plan.name) || null
      );
    } catch(e) { console.warn("[Main] Journal.onPlanLoaded échec :", e); }
  }

  // 🆕 v1.22.0 (Mode Secours) : charge les scénarios de secours pour ce plan
  // depuis localStorage. Idempotent — peut être rappelé au plan switch.
  if (window.SecoursMode && typeof window.SecoursMode.init === "function") {
    try { window.SecoursMode.init(); } catch(e) {
      console.warn("[Main] SecoursMode.init échec :", e);
    }
  }

  // Second snapshot APRÈS restore (cf bloc ci-dessus).
  if (window.SessionBackups && typeof window.SessionBackups.snapshot === "function") {
    // Léger délai pour laisser le restore Phase 1 finir (setRoads, etc.).
    setTimeout(function() {
      try { window.SessionBackups.snapshot("boot-after-restore"); } catch(e) {}
    }, 500);
  }

  // Si la session restaurée contient un road de type "itinerary", afficher
  // immédiatement le label de distance. Le hook est aussi appelé après chaque
  // setRoads dans la modale itinéraire pour rester à jour.
  if (typeof window._majLabelDistanceItineraire === "function") {
    window._majLabelDistanceItineraire();
  }

  // Démarre le heartbeat OOMGuard : marker localStorage rafraîchi toutes
  // les 5s, effacé proprement au beforeunload/pagehide. Si la fois suivante
  // on retrouve le marker au boot, c'est qu'iOS/Android a tué l'app
  // brutalement (typiquement OOM) → toast affiché côté utilisateur.
  if (window.OOMGuard) window.OOMGuard.start();

  // 🎨 Refonte UI v1 : hook post-init pour que refonteInterface.js puisse
  // créer le header bar + status bar maintenant que window.map et tous les
  // setters (getEditorPoints, getRoads, etc.) sont prêts. No-op si flag OFF.
  if (typeof window._refonteInterfacePostInit === "function") {
    try { window._refonteInterfacePostInit(); } catch(e) {
      console.warn("[Refonte UI] postInit error:", e);
    }
  }

  // 🆕 v1.11.1 V2 (KARMA "il faut que forceCheck soit call à l'init map") :
  // Force un sync BatteryGuard ici, garanti après que :
  //   1. refonteInterface.js a fini son postInit (chips DOM créés)
  //   2. batteryGuard.js IIFE a eu le temps d'init son state via getBattery()
  // 4 tentatives décalées dans le temps pour bypass toute race condition
  // possible entre l'init async de l'API Battery et l'attachement du listener.
  // No-op gracieux si BatteryGuard indispo.
  if (window.BatteryGuard && typeof window.BatteryGuard.forceCheck === "function") {
    function _batteryForceSync() {
      try { window.BatteryGuard.forceCheck(); } catch(e) {}
    }
    // 🐛 v1.21.3 (audit P0-8) : on stocke les IDs des 3 setTimeout dans
    // window._ktaBatteryForceTimers pour pouvoir les clear au plan switch.
    // Avant : 4 callbacks pendants × N switches = jusqu'à 12 callbacks
    // orphelins qui tirent refreshStatusBar sur un DOM peut-être reconstruit.
    if (Array.isArray(window._ktaBatteryForceTimers)) {
      window._ktaBatteryForceTimers.forEach(function(id) { clearTimeout(id); });
    }
    window._ktaBatteryForceTimers = [];
    _batteryForceSync();              // immédiat (pas un timeout, pas à tracker)
    window._ktaBatteryForceTimers.push(setTimeout(_batteryForceSync, 300));   // après getBattery().then typique
    window._ktaBatteryForceTimers.push(setTimeout(_batteryForceSync, 1000));  // safety net si promise lente
    window._ktaBatteryForceTimers.push(setTimeout(_batteryForceSync, 3000));  // dernière chance (3s = limite raisonnable)
  }

  // Resize defensif (iOS PWA viewport-fit=cover) :
  //   Sur iPhone PWA, la viewport change après l'activation du Service Worker
  //   (la status bar passe en black-translucent et la home-indicator zone entre
  //   dans la viewport). Leaflet calcule ses dimensions à l'init et reste figé
  //   sur l'ancienne taille → bande visible en haut/bas, tuiles décalées.
  //   `invalidateSize` recalcule, et un listener resize gère les rotations
  //   d'écran et le toggle de l'URL bar Safari.
  if (window.map && typeof window.map.invalidateSize === "function") {
    requestAnimationFrame(function() {
      try { window.map.invalidateSize(); } catch(e) {}
      // 2e passe après ~300ms pour rattraper la fin de l'animation status bar iOS
      setTimeout(function() {
        try { window.map.invalidateSize(); } catch(e) {}
      }, 300);
    });
    if (!window._ktaResizeBound) {
      window._ktaResizeBound = true;
      window.addEventListener("resize", function() {
        if (window.map && typeof window.map.invalidateSize === "function") {
          try { window.map.invalidateSize(); } catch(e) {}
        }
      });
      window.addEventListener("orientationchange", function() {
        setTimeout(function() {
          if (window.map && typeof window.map.invalidateSize === "function") {
            try { window.map.invalidateSize(); } catch(e) {}
          }
        }, 200);
      });
    }
  }

  console.log("[Main] Application lancée");

  // 🌀 v1.57.0 — Liaisons inter-plan : pose les badges 🌀 sur les points
  // liés du plan courant (lecture du registre localStorage — cf.
  // js/interPlanLinks.js). Le module gère lui-même son différé interne.
  if (window.InterPlanLinks && typeof window.InterPlanLinks.onPlanLoaded === "function") {
    try { window.InterPlanLinks.onPlanLoaded(); } catch(e) {
      console.warn("[Main] InterPlanLinks.onPlanLoaded échec :", e);
    }
  }

  // 🧭 v1.60.0 (A6) — Itinéraire inter-plan : trace le leg distant en attente
  // (l'user vient de traverser un portail avec un itinéraire calculé).
  if (window.InterPlanRoute && typeof window.InterPlanRoute.onPlanLoaded === "function") {
    try { window.InterPlanRoute.onPlanLoaded(); } catch(e) {
      console.warn("[Main] InterPlanRoute.onPlanLoaded échec :", e);
    }
  }

  // 🚀 v1.59.0 (U3, KARMA) — INDICATEUR honnête : si des optimisations Perf
  // ULTRA sont actives sur CE plan (slot per-plan, hors mobileZoomLimit qui
  // est une sécurité par défaut), un toast le signale au chargement —
  // l'affichage « allégé » (tracés simplifiés, popups data désactivés,
  // culling…) ne doit jamais passer pour un bug. Queued par OOMGuard si le
  // splash est encore affiché (flushPendingToasts).
  if (window.PerfUltra && Array.isArray(window.PerfUltra.TOGGLES)) {
    try {
      const _optimsActives = window.PerfUltra.TOGGLES.filter(function(k) {
        return k !== "mobileZoomLimit" && window.PerfUltra.get(k);
      });
      if (_optimsActives.length > 0 && window.OOMGuard && window.OOMGuard.showToast) {
        window.OOMGuard.showToast(
          window.I18n.t("perf.toast.activeOnPlan", { n: _optimsActives.length }), "info");
      }
    } catch(e) { console.warn("[Main] toast PerfUltra échec :", e); }
  }

  // 🆕 v1.21.3 (KARMA "les stat de plan ne comprenne que les session") :
  // persiste les stats COMPLÈTES du plan courant (session + embedded data
  // layers) dans localStorage pour que la modale Profil > "📊 Mes plans"
  // affiche les chiffres réels même pour les plans non chargés. Defer 800ms
  // pour laisser les data layers async (rAF batch dans utils.js) finir leur
  // ajout aux registries _ktaDataMarkers/Polylines/Polygons/Structure.
  if (typeof window._persisterStatsPlanCourant === "function") {
    setTimeout(function() {
      try { window._persisterStatsPlanCourant(); } catch(e) {
        console.warn("[Main] _persisterStatsPlanCourant échec :", e);
      }
    }, 800);
  }
  } finally {
    _appEnCours = false;
    // 🌀 v152 : ferme l'overlay de chargement plein écran (lancé par
    // chargerZipFichier ou chargerPlanServeur). Succès OU erreur cumulés
    // ici dans finally → l'overlay disparaît dans tous les cas.
    if (typeof window._fermerOverlayChargement === "function") {
      window._fermerOverlayChargement();
    }
  }
}

// =========================
// AUTO-EXTENSION availableLevels (v154+, mode multi-niveau)
// =========================
// Scanne toutes les sources level-aware connues (session + data layers) et
// etend APP_CONFIG.availableLevels pour englober le min/max trouve. Idempotent :
// peut etre appele plusieurs fois sans risque.
//
// Cas d'usage :
//   1. Premier passage au plan load (depuis lancerApplication) : scan session
//      pre-existante (SessionPersist a deja reload les editorPoints/roads/zones)
//   2. Deuxieme passage apres chargement des data layers async (utils.js >
//      ajouterPointsDepuisJSON appelle ce helper apres avoir charge un layer)
//
// Defaut v154 = [-2, -1, 0, 1, 2]. Si l'user avait un plan v153 ou il avait
// etendu manuellement a [0..4], l'auto-extension ajoute 3 et 4 pour qu'il
// retrouve ses niveaux dans l'UI.
window._etendreAvailableLevelsSiBesoin = function() {
  if (!window.APP_CONFIG || window.APP_CONFIG.multiLevel !== true) return false;
  try {
    const levelsFound = [];
    const _push = function(arr) {
      if (!Array.isArray(arr)) return;
      arr.forEach(function(it) {
        if (it && typeof it === "object") {
          if (Number.isInteger(it.level))      levelsFound.push(it.level);
          if (Number.isInteger(it.fromLevel))  levelsFound.push(it.fromLevel);
          if (Number.isInteger(it.toLevel))    levelsFound.push(it.toLevel);
        }
      });
    };
    if (typeof window.getRoads        === "function") _push(window.getRoads());
    if (typeof window.getZones        === "function") _push(window.getZones());
    // 🆕 v1.9.3-A1.a : structures aussi tagguées avec level (multi-niveau)
    if (typeof window.getStructures   === "function") _push(window.getStructures());
    if (typeof window.getEditorPoints === "function") _push(window.getEditorPoints());
    // Data layers : levels stockes en _ktaLevel sur les markers, en .level sur
    // les entries polylines/polygons (cf. utils.js > ajouterPointsDepuisJSON).
    if (Array.isArray(window._ktaDataMarkers)) {
      window._ktaDataMarkers.forEach(function(m) {
        if (m && Number.isInteger(m._ktaLevel)) levelsFound.push(m._ktaLevel);
      });
    }
    if (Array.isArray(window._ktaDataPolylines)) {
      window._ktaDataPolylines.forEach(function(entry) {
        if (entry && Number.isInteger(entry.level)) levelsFound.push(entry.level);
      });
    }
    if (Array.isArray(window._ktaDataPolygons)) {
      window._ktaDataPolygons.forEach(function(entry) {
        if (entry && Number.isInteger(entry.level)) levelsFound.push(entry.level);
      });
    }
    // 🆕 v1.9.3-A1.a : idem pour les structures data layer
    if (Array.isArray(window._ktaDataStructurePolygons)) {
      window._ktaDataStructurePolygons.forEach(function(entry) {
        if (entry && Number.isInteger(entry.level)) levelsFound.push(entry.level);
      });
    }
    // 🏗️ v162 : scan des image layers (PLAN_CONFIG.imageLayers[i].level)
    if (Array.isArray(window._ktaImageOverlays)) {
      window._ktaImageOverlays.forEach(function(entry) {
        if (entry && Number.isInteger(entry.level)) levelsFound.push(entry.level);
      });
    }

    if (levelsFound.length === 0) return false;

    let avail = Array.isArray(window.APP_CONFIG.availableLevels)
                && window.APP_CONFIG.availableLevels.length
      ? window.APP_CONFIG.availableLevels.slice()
      : [-2, -1, 0, 1, 2];
    const minF = Math.min.apply(null, levelsFound);
    const maxF = Math.max.apply(null, levelsFound);
    let extended = false;
    while (Math.min.apply(null, avail) > minF) {
      avail.unshift(Math.min.apply(null, avail) - 1);
      extended = true;
    }
    while (Math.max.apply(null, avail) < maxF) {
      avail.push(Math.max.apply(null, avail) + 1);
      extended = true;
    }
    if (extended) {
      window.APP_CONFIG.availableLevels = avail;
      console.log("[Main] availableLevels auto-etendu :",
                  "items min/max =", minF, "/", maxF,
                  "→ availableLevels =", avail);
    }
    return extended;
  } catch(e) {
    console.warn("[Main] Auto-extension availableLevels echec :", e);
    return false;
  }
};

// =========================
// CLEANUP DU PLAN PRÉCÉDENT
// =========================
// Centralise le démontage des ressources avant rechargement (chargerPlanServeur,
// startImportedPlan). Évite la duplication ET garantit que rien n'est oublié
// sur mobile où chaque Mo retenu compte pour iOS Safari.
function _libererRessourcesPlanPrecedent() {
  // 🐛 v1.64.0 (KARMA « au chargement je suis sur la position initiale, pas
  // sur celle du tracker ») : FIGER LA PERSISTANCE EN PREMIER. Le poller
  // d'auto-save (1.5 s) restait actif sur l'ANCIEN plan pendant tout le
  // switch : le teardown ci-dessous vide la timeline tracker en RAM
  // (resetTrackingTimeline), puis un tick pendant le chargement du nouveau
  // plan (plusieurs secondes) sauvegardait l'état MUTILÉ — timeline vide
  // écrasée dans le slot, voire slot PURGÉ (_isEmptyState) pour une session
  // tracker-seule → au retour sur le plan, tracker sur la position initiale.
  // Fix : save final forcé (état encore intact) + arrêt du poll — il ne
  // redémarre qu'au onPlanLoaded du nouveau plan.
  if (window.SessionPersist && typeof window.SessionPersist.onPlanUnload === "function") {
    try { window.SessionPersist.onPlanUnload(); } catch(e) {}
  }

  // 📔 v1.69.0 — Clôture de la sortie au carnet. MÊME CONTRAINTE que
  // SessionPersist ci-dessus : ici l'état RAM est encore intact (compteurs,
  // timeline tracker). Plus bas, resetTrackingTimeline() vide la timeline →
  // le tracé et la distance de la sortie seraient perdus. Écriture IDB async,
  // mais le record est snapshoté de façon SYNCHRONE dans cet appel.
  if (window.Journal && typeof window.Journal.onPlanUnload === "function") {
    try { window.Journal.onPlanUnload(); } catch(e) {}
  }

  // 🧹 v1.68.0 (audit) : purge des flottants de navigation au CHANGEMENT de
  // plan. Bug bench : après un switch DIRECT (sélecteur du titre, sans goTo),
  // la mini-pastille ↩️ survivait sur le NOUVEAU plan avec une pile de retour
  // PÉRIMÉE. Les hooks distinguent goTo (pendingTarget posé → no-op côté
  // liaison, chaîne multi-hop conservée côté route) du switch direct (purge).
  if (window.InterPlanLinks && typeof window.InterPlanLinks.onPlanExit === "function") {
    try { window.InterPlanLinks.onPlanExit("switch"); } catch(e) {}
  }
  if (window.InterPlanRoute && typeof window.InterPlanRoute.onPlanExit === "function") {
    try { window.InterPlanRoute.onPlanExit("switch"); } catch(e) {}
  }

  // 🎨 Refonte UI v1 : cleanup du header bar + status bar avant démontage
  // de la map. Sinon le header reste affiché avec les vieilles valeurs
  // pendant le splash du nouveau plan. No-op si flag OFF.
  if (typeof window._refonteInterfacePreUnload === "function") {
    try { window._refonteInterfacePreUnload(); } catch(e) {}
  }

  // Distance totale des tracés : ferme le panneau flottant et purge le layer
  // de surlignage magenta avant le démontage de la map (sinon le layer reste
  // attaché à une map détruite et le panneau flotte par-dessus le splash).
  if (typeof window._rdEffacerHighlight === "function") {
    try { window._rdEffacerHighlight(); } catch(e) {}
  }

  // Mode urgence "Je suis perdu" : ferme la modale et purge tous les layers
  // (cercle zone, marker dernière position, markers indices, cercle affiné)
  // avant le démontage de la map.
  if (window.LostMode && typeof window.LostMode._onPlanSwitch === "function") {
    try { window.LostMode._onPlanSwitch(); } catch(e) {}
  }

  // 🆕 v1.22.0 Mode Secours : ferme la modale + purge l'overlay carte +
  // vide les scénarios in-memory. Les scénarios localStorage du plan
  // précédent restent persistés (per-plan key) et seront re-chargés via
  // SecoursMode.init() au boot du prochain plan si l'user y retourne.
  if (window.SecoursMode && typeof window.SecoursMode.reset === "function") {
    try { window.SecoursMode.reset(); } catch(e) {}
  }

  // 🆕 v1.11.0 Undo/Redo : reset historique au plan switch (KARMA 11:a).
  // L'historique est par-plan : aucune raison de garder les snapshots
  // d'un plan dans la pile quand on en charge un autre (les setters
  // restaureraient des données qui ne correspondent pas au nouveau plan).
  if (window.HistoryManager && typeof window.HistoryManager.reset === "function") {
    try { window.HistoryManager.reset(); } catch(e) {}
  }

  // 🆕 v1.11.2 V2.2 : reset du timestamp début de session au plan switch.
  // Utilisé par la modale Détails session pour afficher la durée de la
  // session courante (depuis le chargement du plan ≈ KARMA 3:a "depuis
  // le 1er ajout" — compromis pragmatique, le 1er ajout est typiquement
  // dans les premières secondes après chargement).
  window._sessionStartTs = null;

  // 🆕 v1.11.3 V2.3 : reset de la timeline tracker au plan switch.
  // Cohérent avec le reset RAM only choisi pour V2.3. Si TrackerReplay
  // est ouvert, on le ferme aussi pour éviter qu'il garde des refs vers
  // une map détruite.
  if (window.MyKTAMapTrackerReplay && typeof window.MyKTAMapTrackerReplay.fermer === "function") {
    try { window.MyKTAMapTrackerReplay.fermer(); } catch(e) {}
  }
  if (typeof window.resetTrackingTimeline === "function") {
    try { window.resetTrackingTimeline(); } catch(e) {}
  }

  // 🧲 C5 v1.74.0 : purge du flash d'accrochage (magnétisme edit-time) — un
  // circleMarker transitoire pourrait survivre sur la carte détruite.
  if (typeof window.ktaPurgerFlashSnap === "function") {
    try { window.ktaPurgerFlashSnap(); } catch(e) {}
  }

  // 🔥 v1.21.2 (KARMA "on reactive") : reset Heatmap au plan switch.
  // Si le module est chargé ET qu'un overlay est actif sur la carte du
  // plan précédent, on l'efface AVANT d'invalider la carte Leaflet
  // (sinon référence morte vers l'ancien overlay).
  if (window.MyKTAMapHeatmap && typeof window.MyKTAMapHeatmap.effacer === "function") {
    try { window.MyKTAMapHeatmap.effacer(); } catch(e) {}
  }

  // 🐛 v1.34.16 (Pack RAM Phase 4 — Fix #C) — Safe-remove des _ktaImageOverlays
  // (calques image du plan : Légende, etc.) AVANT map.remove(). Le pattern
  // critique : clear img.src AVANT removeLayer pour forcer iOS à libérer la
  // bitmap décodée. Sans ça, removeLayer détache le DOM mais WebKit garde
  // le bitmap pinned en cache GPU (sur plan multi-niveau avec 4-10 calques
  // 4096×4096 PNG, c'est 64-160 Mo retenus).
  // Note : map.remove() un peu plus bas détache tous les layers de toute
  // façon — ce qu'on ajoute ici c'est UNIQUEMENT le clear img.src préalable.
  if (Array.isArray(window._ktaImageOverlays) && window.map) {
    window._ktaImageOverlays.forEach(function(entry) {
      try {
        if (entry && entry.overlay && entry.overlay._image) {
          entry.overlay._image.src = "";
        }
      } catch(e) {}
    });
  }

  // Tuiles du plan : libère les overlays Leaflet + revoke les blob URLs
  // (libererTuiles fait maintenant aussi le clear img.src — cf tiling.js
  // v1.34.16 Phase 4 Fix #B, gain potentiel énorme sur iPhone PWA).
  if (window._baseTiles && window._baseTiles.length > 0) {
    libererTuiles(window._baseTiles, window.map);
    window._baseTiles = [];
  }

  // 🧱 Tiling V2 (v149) : cleanup spécifique du runtime Option B (listener
  // zoomend + overlays actifs + blob URLs lazy créées au fil des swaps).
  // Indépendant de window._baseTiles (le tableau retourné par chargerImage en
  // mode V2 contient juste les overlays du niveau courant, pas tous).
  if (typeof window._libererTuilesV2 === "function") {
    try { window._libererTuilesV2(); } catch(e) {}
  }

  // Map Leaflet : map.remove() détache tous les listeners/overlays/markers
  if (window.map) {
    try { window.map.remove(); } catch(e) {}
    window.map = null;
  }

  // Collision canvas : potentiellement 4096×4096 = 64 Mo. Force la libération
  // immédiate des pixels en mettant width/height à 0 — sinon le GC peut tarder
  // et iOS Safari accumule la pression mémoire entre 2 plans.
  if (window.collisionCanvas) {
    try {
      window.collisionCanvas.width  = 0;
      window.collisionCanvas.height = 0;
    } catch(e) {}
    window.collisionCanvas = null;
    window.collisionCtx    = null;
  }

  // Runtime assets (blob URLs des fichiers ZIP importés)
  resetRuntimeAssets();

  // 🐛 v1.21.3 (audit P0-6/9) : bump le token data layer load. Tout rAF
  // récursif en cours dans ajouterPointsDepuisJSON exit silencieusement
  // à la prochaine itération → fini les markers atterrissant dans le
  // layerGroup du plan précédent (zombies + fuite). Doit être fait AVANT
  // que window.dataLayerGroups soit vidé / reconstruit.
  window._ktaDataLayerLoadToken = (window._ktaDataLayerLoadToken || 0) + 1;

  // 🐛 v1.21.3 (audit P0-10) : purge explicite des 4 registres data layer.
  // Sans ça, ils cumulaient entre les switches → fuite mémoire linéaire et
  // les helpers getAllEmbeddedRoads/Structures retournaient un mix des plans.
  // Note : ne pas détacher les Leaflet layers d'abord — map.remove() ci-dessus
  // a déjà tout déconnecté, on vide juste les arrays JS.
  if (Array.isArray(window._ktaDataMarkers))            window._ktaDataMarkers.length            = 0;
  if (Array.isArray(window._ktaDataPolylines))          window._ktaDataPolylines.length          = 0;
  if (Array.isArray(window._ktaDataPolygons))           window._ktaDataPolygons.length           = 0;
  if (Array.isArray(window._ktaDataStructurePolygons))  window._ktaDataStructurePolygons.length  = 0;
  if (Array.isArray(window._kta_dataLayerNoteGhosts))   window._kta_dataLayerNoteGhosts.length   = 0;

  // 🐛 v1.21.3 (audit P0-8) : clear les timers BatteryGuard.forceCheck en
  // attente. Sans ça, switch 3× rapidement = 9 callbacks orphelins qui tirent
  // refreshStatusBar sur un DOM peut-être reconstruit.
  if (Array.isArray(window._ktaBatteryForceTimers)) {
    window._ktaBatteryForceTimers.forEach(function(id) { clearTimeout(id); });
    window._ktaBatteryForceTimers.length = 0;
  }

  // 🐛 v1.21.3 (audit P0-10) : revoke les ObjectURL des photos affichées
  // (sinon les Blob restent pinned tant que le tab vit). Le Set vit dans
  // editor.js / photos.js, on appelle leur cleanup helper si exposé.
  if (typeof window._revokeAllPhotoObjectUrls === "function") {
    try { window._revokeAllPhotoObjectUrls(); } catch(e) {}
  }

  // 🆕 v1.34.19 — Mode Histoire : ferme la modale au plan switch (la note
  // libre du plan précédent est déjà saved en localStorage, on ne perd
  // rien). La note du nouveau plan sera chargée à la prochaine ouverture.
  if (window.ModeHistoire && typeof window.ModeHistoire._onPlanSwitch === "function") {
    try { window.ModeHistoire._onPlanSwitch(); } catch(e) {}
  }

  // 🐛 v1.21.3 (audit P0-10) : désactive le mode urgence XL si actif —
  // emergencyMode.js retient un _orientationListener sur window qui resterait
  // sinon attaché jusqu'à la fermeture du tab.
  if (window.EmergencyMode && typeof window.EmergencyMode.desactiver === "function") {
    try { window.EmergencyMode.desactiver(); } catch(e) {}
  }

  // Flags d'init des modules (forcent re-init au prochain lancerApplication)
  window.interfaceInitialized = false;
  window.roadInitialized      = false;
  window.zonesInitialized     = false;
  // 🆕 v1.9.3-A1.a-fix6 : reset symétrique du flag structures
  // (= mêmes raisons que zones/road : sans ce reset, le click handler
  // ne se ré-attache pas sur la nouvelle map Leaflet au plan switch).
  window.structuresInitialized = false;
}

// =========================
// CHARGEMENT D'UN PLAN SERVEUR PARTICULIER (depuis le registre)
// =========================
// presetChoisi (optionnel) : "off" | "auto" | "quality" | "balanced" | "performance"
//   → appliqué à APP_CONFIG.perfPreset et sauvegardé dans le registre pour ce plan
const _PERF_VALID_PRESETS = ["off", "auto", "quality", "balanced", "performance"];

async function chargerPlanServeur(planPath, registryEntry, presetChoisi) {
  _libererRessourcesPlanPrecedent();

  // 🌀 v152 : overlay plein écran visible (lance avant le fetch du plan-config
  // pour que l'utilisateur sache qu'il y a une activité en cours dès le clic).
  if (typeof window._afficherOverlayChargement === "function") {
    window._afficherOverlayChargement(window.I18n.t("ui.loading.fetchingPlan"));
  }

  const ok = await loadAppConfig(planPath);
  if (!ok) {
    if (typeof window._fermerOverlayChargement === "function") window._fermerOverlayChargement();
    const err = new Error("Plan serveur introuvable : " + planPath);
    err.code = "PLAN_NOT_FOUND";
    throw err;
  }

  // Appliquer le preset perf choisi (avant lancerApplication, donc avant rendu de l'image)
  if (typeof presetChoisi === "string" && _PERF_VALID_PRESETS.indexOf(presetChoisi) >= 0) {
    APP_CONFIG.perfPreset = presetChoisi;
    DEFAULT_CONFIG.perfPreset = presetChoisi;
    window.APP_CONFIG = APP_CONFIG;
    console.log("[Loader] perfPreset (server) :", presetChoisi);
  }

  // Enregistrer dans le registre
  if (window.PlanRegistry && window.PLAN_CONFIG?.plan) {
    const id = registryEntry?.id || window.PlanRegistry.genServerId(planPath);
    window._currentLoadedPlanId = id;  // pour SessionPersist (restore après lancerApplication)
    const planEntry = {
      id: id,
      type: "server",
      path: planPath,
      name:    window.PLAN_CONFIG.plan.name    || (registryEntry && registryEntry.name) || planPath,
      version: window.PLAN_CONFIG.plan.version || (registryEntry && registryEntry.version) || null,
      author:  window.PLAN_CONFIG.plan.author  || (registryEntry && registryEntry.author)  || null,
      discovered: registryEntry?.discovered || false,
      perfPreset: APP_CONFIG.perfPreset
    };
    // 🏗️ Mode badges (v150) : enregistrer les flags depuis plan-config.json
    // pour que la liste de plans affiche M-LVL / V2 a la prochaine visite du
    // loader. Ajout conditionnel pour ne pas ecraser un user-override explicite
    // false fait via setMultiLevel (Object.assign dans addOrUpdate respecte ca).
    if (window.PLAN_CONFIG.plan.multiLevel === true) planEntry.multiLevel = true;
    if (window.PLAN_CONFIG.plan.tiledV2    === true) planEntry.tiledV2    = true;
    _enregistrerPlanCharge(planEntry);

    // 🌐 v1.14.20 — propagation du calibrage GPS embarqué dans le
    // plan-config.json (plan.georef) vers KmzExport.setCalibration. Permet
    // l'auto-remplissage dans 📡 Export externe et ⚙️ Réglages > 🌐
    // Géoréférencement (mode map) sans intervention de l'user. Skip si un
    // calibrage local existe déjà pour ce planId (priorité à l'user).
    _propagerGeorefVersKmzExport(id);
  }

  _appEnCours    = false;
  _importDemande = false;
  await lancerApplication();
}

// 🌐 v1.14.20 — Helper de propagation du calibrage embarqué dans le
// plan-config.json → KmzExport. Idempotent : ne touche pas un calibrage
// local déjà saisi par l'user (priorité à la saisie manuelle).
function _propagerGeorefVersKmzExport(planId) {
  try {
    const georef = window.PLAN_CONFIG && window.PLAN_CONFIG.plan && window.PLAN_CONFIG.plan.georef;
    if (!georef || !georef.pointA || !georef.pointB) return;
    if (!window.KmzExport || typeof window.KmzExport.setCalibration !== "function") return;
    // Skip si un calibrage local existe déjà (l'user a saisi manuellement → on respecte)
    if (window.KmzExport.getCalibration && window.KmzExport.getCalibration(planId)) return;
    window.KmzExport.setCalibration(planId, georef);
    console.log("[Main] 🌐 Géoréférencement plan.georef propagé vers KmzExport (planId=" + planId + ")");
  } catch(e) {
    console.warn("[Main] _propagerGeorefVersKmzExport :", e);
  }
}

// =========================
// CHARGEMENT DEPUIS IMPORT NAVIGATEUR
// =========================
// presetChoisi : "off" | "auto" | "quality" | "balanced" | "performance" (string)
//   ← v2 : remplace l'ancien `perfChoisi` (boolean)
// meta = { zipFile?, fsHandle?, planId? }  (tout optionnel)
async function startImportedPlan(planConfigFile, assetFiles, presetChoisi, meta) {
  if (!planConfigFile) throw new Error("Aucun fichier plan-config.json fourni");

  meta = meta || {};

  // Détruire proprement la carte existante (plan serveur éventuellement chargé)
  _importDemande = true;
  _appEnCours    = false;

  _libererRessourcesPlanPrecedent();

  // 🐛 v1.34.12 — Set window._lazyZipRef APRÈS _libererRessourcesPlanPrecedent
  // pour qu'il survive au cleanup (resetRuntimeAssets nullify _lazyZipRef du
  // plan précédent — légitime — mais on doit ensuite restaurer la ref du nouveau
  // plan annotée par extraireZip sur assetFiles._lazyZip).
  // Si pas de stub (plan sans tuiles V2 hors whitelist), assetFiles._lazyZip
  // est undefined → on laisse _lazyZipRef = null (cohérent avec le reset).
  if (assetFiles && assetFiles._lazyZip) {
    window._lazyZipRef = assetFiles._lazyZip;
    console.log("[LazyTiles v1.34.12] window._lazyZipRef restauré post-cleanup");
  }

  const planText  = await planConfigFile.text();
  const rawConfig = JSON.parse(planText);

  const validation = validateImportedPlan(rawConfig);
  if (!validation.ok) throw new Error(validation.errors.join(" | "));

  window.RAW_PLAN_CONFIG = rawConfig;

  const files = Array.from(assetFiles || []);
  const allLogicalPaths = [];
  if (rawConfig.plan?.baseImage)      allLogicalPaths.push(rawConfig.plan.baseImage);
  if (rawConfig.plan?.collisionImage) allLogicalPaths.push(rawConfig.plan.collisionImage);
  // v1.34.19 — Champ `histoirePdf` (PDF embarqué pour Mode Histoire).
  if (rawConfig.plan?.histoirePdf)    allLogicalPaths.push(rawConfig.plan.histoirePdf);
  (rawConfig.imageLayers || []).forEach(function(l) { if (l.file) allLogicalPaths.push(l.file); });
  (rawConfig.dataLayers  || []).forEach(function(l) { if (l.file) allLogicalPaths.push(l.file); });

  const uniquePaths = [...new Set(allLogicalPaths.map(normalizePath))];

  await Promise.all(uniquePaths.map(async function(logicalPath) {
    const matched = findMatchingFile(logicalPath, files);
    if (!matched) { console.warn("[Loader] Fichier non trouvé :", logicalPath); return; }
    await registerAsset(logicalPath, matched);
  }));

  // 🧱 Tiling V2 (v149) : scan des tuiles dans le ZIP (chemin `data/tiles/z<N>/*`
  // — 🫥 v1.62.0 : extension .jpg (legacy) OU .webp/.png (tuiles avec alpha), le
  // regex est agnostique et le format vit dans `tiling.format`).
  // Enregistrement LAZY (pas de blob URL au boot — économie d'allocations sur des
  // plans qui peuvent avoir 1000+ tuiles). Les blob URLs sont créées à la demande
  // par tiling.js > _chargerImageTuileV2 quand chaque tuile est rendue.
  if (rawConfig.plan?.tiledV2 === true || rawConfig.tiling) {
    // 🌀 v152 : mise à jour de l'overlay de chargement avec progression
    const totalTuiles = files.filter(function(f) {
      const fp = f._fullPath || f.name;
      return typeof fp === "string" && /^data\/tiles\/z-?\d+\//.test(fp);
    }).length;
    if (typeof window._majOverlayChargement === "function") {
      window._majOverlayChargement("Plan V2 tuilé — Indexation de " + totalTuiles + " tuiles…");
    }
    let nbTuiles = 0;
    for (const f of files) {
      const fullPath = f._fullPath || f.name;
      if (typeof fullPath === "string" && /^data\/tiles\/z-?\d+\//.test(fullPath)) {
        await registerAsset(fullPath, f, { lazy: true });
        nbTuiles++;
        // Update progress every 50 tiles (gros plans = 1000+ tuiles)
        if (nbTuiles % 50 === 0 && typeof window._majOverlayChargement === "function") {
          window._majOverlayChargement("Plan V2 tuilé — Indexation " + nbTuiles + " / " + totalTuiles + " tuiles…");
        }
      }
    }
    console.log("[Loader] Tiling V2 — " + nbTuiles + " tuiles enregistrées (lazy)");
    if (typeof window._majOverlayChargement === "function") {
      window._majOverlayChargement("Plan V2 prêt — Initialisation de la carte…");
    }
  }

  window.PLAN_CONFIG = cloneAndResolvePlanConfig(rawConfig);

  const cfg = buildAppConfigFromPlan(rawConfig);

  // Muter DEFAULT_CONFIG en place pour que resetConfig() utilise les valeurs du plan importé
  Object.assign(DEFAULT_CONFIG, cfg);
  window.DEFAULT_CONFIG = DEFAULT_CONFIG;

  APP_CONFIG = { ...cfg };
  window.APP_CONFIG = APP_CONFIG;

  // Appliquer le preset perf choisi par l'utilisateur dans le loader (string)
  // AVANT lancerApplication → l'image est tilée selon le bon preset dès le 1er rendu
  if (typeof presetChoisi === "string" && _PERF_VALID_PRESETS.indexOf(presetChoisi) >= 0) {
    APP_CONFIG.perfPreset = presetChoisi;
    DEFAULT_CONFIG.perfPreset = presetChoisi;
    window.APP_CONFIG = APP_CONFIG;
    console.log("[Loader] perfPreset imposé :", presetChoisi);
  }

  console.log("[Loader] APP_CONFIG.perfPreset au lancement :", APP_CONFIG.perfPreset);

  // ENREGISTREMENT DANS LE REGISTRE
  if (window.PlanRegistry && rawConfig.plan) {
    const planName = rawConfig.plan.name || "Plan importé";
    const planVer  = rawConfig.plan.version || "";
    const id = meta.planId || window.PlanRegistry.genLocalId(planName, planVer);
    window._currentLoadedPlanId = id;  // pour SessionPersist (restore après lancerApplication)

    const entry = {
      id: id,
      type: "local",
      name: planName,
      version: planVer || null,
      author: rawConfig.plan.author || null,
      originalFilename: meta.zipFile?.name || null,
      fileSize: meta.zipFile?.size || null,
      perfPreset: APP_CONFIG.perfPreset
    };
    // 🏗️ Mode badges (v150) : enregistrer les flags depuis plan-config.json
    // pour que la liste de plans affiche M-LVL / V2. Ajout conditionnel pour
    // ne pas ecraser un user-override explicite (setMultiLevel(id, false)).
    if (rawConfig.plan.multiLevel === true) entry.multiLevel = true;
    if (rawConfig.plan.tiledV2    === true) entry.tiledV2    = true;

    // Si on a un FileSystemFileHandle, le persister
    if (meta.fsHandle && window.PlanRegistry.hasFsAccess()) {
      entry.fsHandleId = id;
      try { await window.PlanRegistry.saveHandle(id, meta.fsHandle); }
      catch(e) { console.warn("[Loader] Sauvegarde FS handle échouée :", e); }
    }

    // Si l'utilisateur a demandé de mémoriser le ZIP en local, le sauver en IDB
    if (meta.storeBlob && meta.zipFile) {
      try {
        // Demander la persistance du stockage (empêche purge auto par iOS/Chrome)
        if (window.PlanRegistry.requestPersistentStorage) {
          await window.PlanRegistry.requestPersistentStorage();
        }
        const result = await window.PlanRegistry.saveBlob(id, meta.zipFile);
        if (result.ok) {
          entry.storedBlob = true;
          console.log("[Loader] ZIP mémorisé dans IndexedDB :", id);
        } else {
          console.error("[Loader] Mémorisation ZIP échouée :", result.error);
          // Avertir l'utilisateur via le statut du loader
          if (typeof window !== "undefined") {
            const status = document.getElementById("loaderStatus");
            if (status) {
              status.textContent = window.I18n.t("main.rememberFailed", { msg: result.error });
              status.style.color = "#ffb380";
            }
          }
        }
      } catch(e) {
        console.error("[Loader] Erreur saveBlob :", e);
      }
    } else if (meta.fromStoredBlob) {
      // Chargé depuis un blob mémorisé — préserver la flag
      entry.storedBlob = true;
    }

    _enregistrerPlanCharge(entry);

    // 🌐 v1.14.20 — Propagation du calibrage GPS embarqué dans le
    // plan-config.json vers KmzExport. Idempotent (skip si calibrage local
    // existe déjà). Voir _propagerGeorefVersKmzExport pour les détails.
    _propagerGeorefVersKmzExport(id);
  }

  // 🆕 v1.9.3-B1d.γ.3 : extraction + restore des photos depuis le ZIP plan.
  // Format attendu (créé par createConf.js > _genererZip quand "Inclure les
  // photos" est cochée en mode Modifier, cf B1.d.γ.1) :
  //   data/photos/_index.json   ← mapping photoId → {pointId, mime, size, file}
  //   data/photos/<photoId>.<ext>  ← blob de chaque photo
  //
  // Stratégie wipe + restore (KARMA 3:a) : on supprime d'abord les photos IDB
  // existantes pour ce planId (= le ZIP fait foi, cohérent avec syncModeFlags),
  // puis on insère les nouvelles via restorePhoto qui préserve les photoIds.
  //
  // Toast OOMGuard discret en fin de restore (KARMA 2:c).
  // Comportement strictement opt-in (rétrocompat) : si aucun _index.json
  // dans le ZIP, on saute toute cette section silencieusement.
  try {
    const indexFile = findMatchingFile("data/photos/_index.json", files);
    if (indexFile && window.MyKTAMapPhotos && window._currentLoadedPlanId) {
      const planId = window._currentLoadedPlanId;
      const idxText = await indexFile.text();
      let idxObj;
      try { idxObj = JSON.parse(idxText); }
      catch(e) {
        console.warn("[Loader] data/photos/_index.json corrompu :", e);
        idxObj = null;
      }
      if (idxObj && idxObj.photos) {
        const photoIds = Object.keys(idxObj.photos);
        if (photoIds.length > 0) {
          if (typeof window._majOverlayChargement === "function") {
            window._majOverlayChargement("Restauration de " + photoIds.length + " photo(s)…");
          }
          // Wipe préalable des photos IDB de ce planId (3:a)
          try {
            await window.MyKTAMapPhotos.deletePhotosForPlan(planId);
          } catch(e) { console.warn("[Loader] deletePhotosForPlan :", e); }

          let restoredCount = 0;
          for (const pid of photoIds) {
            const info = idxObj.photos[pid] || {};
            const filename = "data/photos/" + (info.file || (pid + ".jpg"));
            const blobFile = findMatchingFile(filename, files);
            if (!blobFile) {
              console.warn("[Loader] Photo manquante dans le ZIP :", filename);
              continue;
            }
            try {
              const blob = await blobFile.arrayBuffer().then(function(buf) {
                return new Blob([buf], { type: info.mime || "image/jpeg" });
              });
              await window.MyKTAMapPhotos.restorePhoto({
                id:      pid,
                planId:  planId,
                pointId: String(info.pointId || ""),
                blob:    blob,
                mime:    info.mime || "image/jpeg",
                size:    info.size || blob.size
              });
              restoredCount++;
            } catch(e) {
              console.warn("[Loader] restorePhoto échoué pour", pid, ":", e);
            }
          }
          console.log("[Loader] " + restoredCount + " / " + photoIds.length + " photo(s) restaurée(s) en IDB");

          // Toast discret pour informer l'user (KARMA 2:c). On utilise
          // OOMGuard.showToast s'il est dispo (queue jusqu'à fin splash),
          // sinon console seulement (toast nice-to-have, pas critique).
          if (restoredCount > 0 && window.OOMGuard
              && typeof window.OOMGuard.showToast === "function") {
            window.OOMGuard.showToast(
              "📸 " + restoredCount + " photo" + (restoredCount > 1 ? "s" : "") + " restaurée" + (restoredCount > 1 ? "s" : "") + " depuis le plan",
              "info"
            );
          }
        }
      }
    }
  } catch(e) {
    console.warn("[Loader] Restore photos depuis ZIP plan :", e);
    // Pas bloquant — le plan se charge normalement sans les photos
  }

  _appEnCours    = false;
  _importDemande = false;

  await lancerApplication();
}

// =========================
// AFFICHER LE LOADER (avec rafraîchissement de la liste)
// =========================
function afficherLoader() {
  // 🐛 v1.28.0 : annule tout mode « cliquer sur la carte » resté actif (floater
  // + modale config masquée + handler orphelin) avant de revenir au home.
  if (typeof window._ktaAnnulerModesClicCarte === "function") {
    try { window._ktaAnnulerModesClicCarte(); } catch(e) {}
  }
  // 🧹 v1.68.0 (audit KARMA « fermetures à la sortie du plan ») : purge des
  // FLOTTANTS DE NAVIGATION — 4 résidus reproduits au bench restaient
  // affichés par-dessus le HOME : mini-pastille ↩️ (sans timer), invite
  // « 🌀 Portail suivant » (sans timer), widget boussole, modale itinéraire
  // fantôme (cachée dans le DOM). Seuls les chemins goTo nettoyaient.
  if (window.InterPlanLinks && typeof window.InterPlanLinks.onPlanExit === "function") {
    try { window.InterPlanLinks.onPlanExit("home"); } catch(e) {}
  }
  if (window.InterPlanRoute && typeof window.InterPlanRoute.onPlanExit === "function") {
    try { window.InterPlanRoute.onPlanExit("home"); } catch(e) {}
  }
  if (window.CompassWidget && typeof window.CompassWidget.hide === "function") {
    try { window.CompassWidget.hide(); } catch(e) {}
  }
  const itiFantome = document.getElementById("kta-itinerary-modal");
  if (itiFantome) { try { itiFantome.remove(); } catch(e) {} }
  const overlay = document.getElementById("planLoaderOverlay");
  if (overlay) {
    overlay.style.display = "flex";
    // 🆕 v1.7.3 : remonter au top à chaque ouverture du loader.
    // Sans ça, si l'user était scrollé en bas (ex: section 📚 Mes plans),
    // chargeait un plan, puis revenait au loader → la home s'affichait au
    // même niveau de scroll qu'avant chargement, masquant le titre/header.
    // overflow-y vit sur #planLoaderOverlay (cf. CSS), donc c'est lui le
    // scroll container, pas le body. scrollTop = 0 est instantané (pas
    // smooth) car on veut un reset perceptif net "retour à l'accueil".
    overlay.scrollTop = 0;
    const btn = document.getElementById("loadPlanBtn");
    if (btn) btn.disabled = false;
    const status = document.getElementById("loaderStatus");
    if (status) status.textContent = "";
  }
  // Masquer #map pendant que le loader est visible
  const mapEl = document.getElementById("map");
  if (mapEl) mapEl.style.display = "none";

  // 🆕 v1.9.2-hotfix-loader-header (KARMA "si je clique sur la rose des
  // vents, retour au home avec le haut de la couleur du haut de leaflet.
  // Mais si je clique sur le titre puis tous mes plans, retour sur home
  // avec le haut en noir").
  //
  // Diagnostic : le refonte header (#kta-refonte-header, z:1200) reste
  // visible "à travers" le planLoaderOverlay (z:5000) à cause du fond
  // semi-opaque rgba(5,8,15,0.92) qui laisse 8% de transparence — le
  // gradient #1a1f2e du header bleed-through en haut. Selon le chemin
  // d'arrivée au home, le rendu compositing iOS varie (passage par
  // overlay modal intermédiaire vs direct). Pour normaliser : on ajoute
  // une classe `kta-loader-active` sur le body qui force le header et
  // la statusbar refonte en display:none tant que le loader est visible.
  // Garantit un rendu identique quel que soit le chemin d'arrivée.
  document.body.classList.add("kta-loader-active");

  // Rafraîchir la liste des plans dans le loader
  if (typeof window.refreshPlansList === "function") {
    window.refreshPlansList();
  }
}

// =========================
// SPLASH SCREEN — animation de bienvenue au démarrage
// =========================
// 🆕 v1.8.0 : 4000ms → 3500ms (demande KARMA). Reste assez long pour que
// l'animation de la barre de chargement + le logo soient perçus, mais
// raccourcit légèrement l'attente perçue au boot/F5.
const SPLASH_MIN_DURATION_MS = 3500;
let _splashShownAt = null;

function _splashStart() {
  // Le splash est affiché par défaut via index.html
  // Cette fonction enregistre juste l'heure de début
  const splash = document.getElementById("splashOverlay");
  if (!splash) return;
  _splashShownAt = Date.now();

  // 🆕 v1.47.0 — Affiche la version courante (haut-droite du splash) depuis
  // le build courant (window.__MKM__.build, défini par js/copyright.js). Zéro
  // hardcode : la version suit automatiquement chaque release. L'ancienne
  // barre de progression (#splashProgressBar) a été remplacée par l'arc
  // doré rotatif autour de la boussole (CSS pur, aucun pilotage JS requis).
  const ver = document.getElementById("splashVersion");
  if (ver) {
    const b = (window.__MKM__ && window.__MKM__.build) ? String(window.__MKM__.build) : "";
    ver.textContent = b ? (b.charAt(0) === "v" ? b : "v" + b) : "";
  }
}

async function _splashEnd() {
  const splash = document.getElementById("splashOverlay");
  if (!splash) return;

  // Attendre que la durée minimale soit écoulée
  if (_splashShownAt) {
    const elapsed = Date.now() - _splashShownAt;
    const remaining = SPLASH_MIN_DURATION_MS - elapsed;
    if (remaining > 0) {
      await new Promise(function(r) { setTimeout(r, remaining); });
    }
  }

  // Fade out puis retrait du DOM
  splash.classList.add("fading");
  setTimeout(function() {
    if (splash && splash.parentNode) splash.parentNode.removeChild(splash);
    // Splash plus à l'écran → on peut afficher les éléments en attente
    if (window.OOMGuard) window.OOMGuard.flushPendingToasts();
    // Modale de mise à jour si une nouvelle version a été détectée pendant le splash
    if (window.UpdateChecker && typeof window.UpdateChecker.notifySplashEnded === "function") {
      window.UpdateChecker.notifySplashEnded();
    }
    // 🆕 v1.56.0 — Séquenceur de premier lancement (js/firstRunFlow.js).
    // Remplace les anciens déclencheurs non coordonnés (alerte + onboarding +
    // proposition PIN) qui se superposaient au 1er boot. Joue les étapes UNE
    // PAR UNE, dans l'ordre : 🚨 alerte critique → ⚖️ conditions d'utilisation
    // → 🎓 onboarding → 🔐 proposition PIN. AlertChecker.notifySplashEnded (qui
    // pose aussi le flag _splashEnded + affiche les alertes différées) est
    // désormais appelé PAR l'orchestrateur (étape 1). Chaque boot rejoue la
    // séquence : les étapes déjà faites (légal accepté, onboarding vu, PIN
    // proposé) se sautent d'elles-mêmes.
    if (window.FirstRunFlow && typeof window.FirstRunFlow.run === "function") {
      window.FirstRunFlow.run();
    } else if (window.AlertChecker && typeof window.AlertChecker.notifySplashEnded === "function") {
      // Fallback défensif si le module n'a pas chargé : au moins les alertes.
      window.AlertChecker.notifySplashEnded();
    }
  }, 500);
}

// =========================
// 🌍 v1.45.0 — i18n DOM (HOME statique)
// =========================
// Applique les traductions sur le DOM : tout élément portant
//   • data-i18n        → remplace textContent par I18n.t(clé)
//   • data-i18n-html   → remplace innerHTML  par I18n.t(clé) (valeurs avec balises)
//   • data-i18n-title  → pose title + aria-label = I18n.t(clé)
//   • data-i18n-placeholder → pose placeholder = I18n.t(clé)  [v1.69.0]
// Le texte FR laissé dans le HTML n'est qu'un FALLBACK (si I18n indispo). La
// VRAIE source est le dico lang/<code>.json. Idempotent → rappelé à chaque
// changement de langue. Générique : poser les attributs suffit, aucun code à
// ajouter ici pour une nouvelle zone ou une nouvelle langue.
function _applyI18nDom(root) {
  if (!window.I18n || typeof window.I18n.t !== "function") return;
  root = root || document;
  root.querySelectorAll("[data-i18n]").forEach(function(el) {
    el.textContent = window.I18n.t(el.getAttribute("data-i18n"));
  });
  root.querySelectorAll("[data-i18n-html]").forEach(function(el) {
    el.innerHTML = window.I18n.t(el.getAttribute("data-i18n-html"));
  });
  root.querySelectorAll("[data-i18n-title]").forEach(function(el) {
    const v = window.I18n.t(el.getAttribute("data-i18n-title"));
    el.setAttribute("title", v);
    el.setAttribute("aria-label", v);
  });
  // 🆕 v1.69.0 — placeholder d'input (barre de recherche du HOME). Manquait :
  // un champ traduit devait sinon être rempli à la main en JS, hors du cycle
  // de re-traduction au changement de langue.
  root.querySelectorAll("[data-i18n-placeholder]").forEach(function(el) {
    el.setAttribute("placeholder", window.I18n.t(el.getAttribute("data-i18n-placeholder")));
  });
}

// Peuple le sélecteur de langue du HOME depuis I18n.available() (scale N
// langues, aucun code de langue figé) + sélectionne la langue active + bind le
// change : bascule I18n PUIS ré-applique les traductions du HOME EN PLACE (pas
// de reload → compatible incognito, où l'écriture localStorage est shimée en
// mémoire et un reload perdrait le choix). Couvre le HOME normal ET incognito
// (même écran). Idempotent (guard _i18nBound).
// 🆕 v1.47.0 — Re-traduit le DOM HOME EN PLACE (data-i18n + perf preset rendu en
// JS, non-data-i18n). Extrait de _initHomeLangSelect pour être rejoué AUSSI au
// swap SW passif (handler controllerchange ci-dessous), pas seulement à la
// bascule de langue. Idempotent.
function _retraduireI18nDomEnPlace() {
  _applyI18nDom(document);
  // #loaderPerfDesc n'est PAS un data-i18n (rempli en JS depuis les metas
  // tiling.js, traduit au point d'affichage) → re-render en re-jouant le preset.
  try {
    if (typeof window.setLoaderPerfPreset === "function" &&
        typeof window.getLoaderPerfPreset === "function") {
      window.setLoaderPerfPreset(window.getLoaderPerfPreset());
    }
  } catch (e) { /* no-op : home non encore monté */ }
}

// 🆕 v1.47.0 — LISSAGE i18n AU SWAP SW PASSIF (option B, KARMA). Quand un nouveau
// SW prend la main SANS reload (activation auto au lancement), le 1er boot a pu
// charger un dico périmé → clés humanisées affichées. On re-fetch les dicos frais
// (I18n.reload) + re-render EN PLACE → zéro flash, zéro reload. Le flux update
// MANUEL (interfaceMaintenance) reload déjà la page → se suffit ; ce handler couvre
// le swap PASSIF. Guard _done : une seule fois par cycle de page.
(function _initI18nSwSwapRefresh() {
  if (!("serviceWorker" in navigator)) return;
  var _done = false;
  navigator.serviceWorker.addEventListener("controllerchange", function() {
    if (_done) return;
    _done = true;
    var _retrad = function() { try { _retraduireI18nDomEnPlace(); } catch (e) {} };
    if (window.I18n && typeof window.I18n.reload === "function") {
      window.I18n.reload().then(_retrad).catch(_retrad);
    } else {
      _retrad();
    }
  });
})();

function _initHomeLangSelect() {
  const sel = document.getElementById("loaderAppLang");
  if (!sel || !window.I18n || typeof window.I18n.available !== "function") return;
  const langs = window.I18n.available() || [];
  const cur = window.I18n.getLang();
  // 🌍 v1.46.0 — Le sélecteur vit désormais dans la modale Configuration (après
  // Incognito), plus dans le header : on a la place → drapeau + label complet
  // (« 🇫🇷 Français »). Sur Windows le drapeau s'affiche en 2 lettres (FR/GB/ES).
  sel.innerHTML = langs.map(function(l) {
    return '<option value="' + l.code + '"' + (l.code === cur ? ' selected' : '') +
           ' title="' + l.label + '">' + (l.flag ? l.flag + " " : "") + l.label + '</option>';
  }).join("");
  if (sel._i18nBound) return;
  sel._i18nBound = true;
  sel.addEventListener("change", function() {
    const code = sel.value;
    const done = (typeof window.I18n.setLang === "function") ? window.I18n.setLang(code) : Promise.resolve();
    Promise.resolve(done).then(function() {
      _retraduireI18nDomEnPlace();
      // 🌍 v1.46.4 (KARMA) : proposer un redémarrage pour une bascule 100% propre.
      if (typeof window.proposerRedemarrageLangue === "function") window.proposerRedemarrageLangue();
    });
  });
}

// 🌍 v1.46.4 (KARMA) — Popup « redémarrer pour appliquer la langue ». Certains
// contenus (doc, onboarding, modules non abonnés à I18n.onChange) ne se
// re-traduisent qu'au reload → on RECOMMANDE (sans imposer) de redémarrer après
// un changement de langue. Appelé par les 2 sélecteurs (HOME + ⚙️ Réglages carte).
// Texte affiché dans la NOUVELLE langue (le popup s'ouvre après setLang().then()).
// Skippé en incognito : un reload y perdrait la session in-memory (décision KARMA
// 2a) ; la langue est déjà appliquée à chaud + persistée (write-through disque).
window.proposerRedemarrageLangue = function() {
  if (window.IncognitoMode && window.IncognitoMode.active) return;
  var existing = document.getElementById("kta-lang-restart-modal");
  if (existing) existing.remove();
  var _t = (window.I18n && window.I18n.t) ? window.I18n.t : function(k){ return k; };
  var overlay = document.createElement("div");
  overlay.id = "kta-lang-restart-modal";
  overlay.className = "kta-modal-overlay";
  overlay.innerHTML =
    '<div class="kta-modal">' +
      '<div class="kta-modal-icon">🌍</div>' +
      '<div class="kta-modal-titre">' + _t("lang.restart.title") + '</div>' +
      '<div class="kta-modal-texte">' + _t("lang.restart.body") + '</div>' +
      '<div class="kta-modal-actions">' +
        '<button class="kta-btn kta-btn-ghost"   id="ktaLangRestartLater" type="button">' + _t("lang.restart.continue") + '</button>' +
        '<button class="kta-btn kta-btn-primary" id="ktaLangRestartNow"   type="button">' + _t("lang.restart.restart") + '</button>' +
      '</div>' +
    '</div>';
  document.documentElement.appendChild(overlay);
  document.getElementById("ktaLangRestartLater").addEventListener("click", function() { overlay.remove(); });
  document.getElementById("ktaLangRestartNow").addEventListener("click", function() {
    overlay.remove();
    try { location.reload(); } catch (e) {}
  });
};

// =========================
// POINT D'ENTRÉE — auto-détection
// =========================
(async function initApp() {
  console.log("[Main] Démarrage…");

  // 🌍 v1.45.0 : I18N — précharge les dicos (fr = fallback obligatoire +
  // langue active) AVANT tout rendu d'UI/modale, pour que I18n.t() retourne
  // les traductions et jamais la clé brute. Échec réseau → dico {} (jamais de
  // reject) → fallback FR garanti. Cf js/langManager.js.
  if (window.I18n && typeof window.I18n.init === "function") {
    try { await window.I18n.init(); }
    catch (e) { console.warn("[Main] I18n.init a échoué (fallback FR) :", e); }
  }

  // 🌍 v1.45.0 — Traduit le HOME (statique, déjà dans le DOM) depuis le dico +
  // initialise son sélecteur de langue. Fait AVANT le splash → le HOME est déjà
  // dans la bonne langue quand il devient visible.
  try { _applyI18nDom(document); _initHomeLangSelect(); }
  catch (e) { console.warn("[Main] i18n HOME a échoué :", e); }

  // Démarrer le splash dès l'init
  _splashStart();

  // ⚖️ v1.56.4 — Conditions d'utilisation EN TOUT PREMIER, AVANT toute saisie
  // de code communautaire ou import de licence (bug : déclenchée par
  // FirstRunFlow post-splash, la gate légale [z 99999] passait DERRIÈRE
  // l'UnlockGate [z 100100] — et l'ordre logique voulu par KARMA est « on lit
  // et accepte les conditions AVANT de saisir un code »). Bloquant : le boot
  // ne continue pas tant que l'user n'a pas accepté. Skip en incognito (flag
  // localStorage shimé, non persistant — cohérent FirstRunFlow). L'étape
  // légale de FirstRunFlow reste en filet (no-op ici car déjà accepté).
  if (window.LegalGate && typeof window.LegalGate.ouvrirGate === "function"
      && !window.LegalGate.isAccepted()
      && !(window.IncognitoMode && window.IncognitoMode.active)) {
    await _splashEnd();
    try { await window.LegalGate.ouvrirGate(); }
    catch (e) { console.warn("[Main] LegalGate a échoué :", e); }
  }

  // 🗝️ v173 : Unlock Gate (barrière communautaire).
  // Position 3=b validée KARMA : APRÈS le splash, AVANT toute initialisation
  // qui touche au plan ou à l'UI. Si pas authentifié → l'app reste bloquée
  // sur l'overlay tant que l'user n'a pas saisi le bon code (ou reset complet).
  // ⚠️ La fonction await ouvrirGate() ne résout JAMAIS en lockout (5 échecs)
  //    → main.js reste bloqué là pour toujours, l'user doit cliquer "Reset
  //    complet" dans l'overlay pour repartir. Volontaire.
  if (window.UnlockGate && !window.UnlockGate.isUnlocked()) {
    // On laisse le splash se finir d'abord (UX préservée) puis on enchaîne
    // sur le gate. Si l'user a déjà été déverrouillé (cas le plus fréquent
    // = 2e boot+), on saute complètement cette étape sans même montrer
    // l'overlay → tu ne le vois qu'à la 1ère installation et au reset.
    await _splashEnd();

    // 🆕 v1.29.1-fix1 — Bypass gate si licence pro active.
    // Cas d'usage : instance pro (Licence-pro.json fetché côté serveur OU
    // importé localement). Sans ce bypass, l'user voyait la gate
    // communautaire au 1er boot ET le bouton « 📂 Importer ma licence
    // pro » en dessous → friction inutile + risque de double-import
    // (cache local en plus du serveur, masqué par la priorité server>local).
    //
    // Logique :
    //   1. Si MyKTAMapProLicense.isPro() est déjà true au moment du check
    //      (cache localStorage déjà rempli par un précédent fetch ou import)
    //      → bypass immédiat, aucune attente.
    //   2. Sinon on attend brièvement (max 2s) un éventuel event
    //      "mktm:license-changed" émis par js/proLicense.js quand son
    //      fetch /Licence-pro.json async résout (timeout fetch 1.5s + marge).
    //   3. Si toujours pas pro après ce délai → gate normale.
    //
    // Cohérent avec v1.28.5 (import licence depuis la gate = bypass via
    // set LS_UNLOCK) : ici aussi on pose le flag pour ne plus jamais
    // redemander la gate tant que l'app reste dans son contexte pro.
    const _proLicenseReady = async function(maxMs) {
      if (!window.MyKTAMapProLicense) return false;
      if (window.MyKTAMapProLicense.isPro()) return true;
      return new Promise(function(resolve) {
        const timer = setTimeout(function() {
          window.removeEventListener("mktm:license-changed", onChange);
          resolve(!!(window.MyKTAMapProLicense && window.MyKTAMapProLicense.isPro()));
        }, maxMs || 2000);
        function onChange(e) {
          if (e && e.detail && e.detail.isPro) {
            clearTimeout(timer);
            window.removeEventListener("mktm:license-changed", onChange);
            resolve(true);
          }
        }
        window.addEventListener("mktm:license-changed", onChange);
      });
    };

    const _proActive = await _proLicenseReady(2000);
    if (_proActive) {
      console.log("[Main] Licence pro active (source=" +
                  window.MyKTAMapProLicense.getSource() +
                  ") → bypass UnlockGate community");
      // Pose le flag unlock pour cohérence avec le pattern v1.28.5
      // (= une licence pro est un canal d'accès légitime, équivalent
      // au code communautaire validé). Évite la gate au prochain boot.
      try {
        // Hash community attendu par UnlockGate.isUnlocked()
        // (cf js/unlockGate.js > HASH_VALIDE). On ne hardcode pas
        // le hash ici — on appelle l'API publique si dispo, sinon
        // on skip silencieusement (la gate sera juste réaffichée au
        // prochain reload, ce qui restera correct vu que le bypass
        // se ré-applique).
        if (typeof window.UnlockGate.markUnlockedViaLicensePro === "function") {
          window.UnlockGate.markUnlockedViaLicensePro();
        }
      } catch(e) { /* swallow */ }
    } else {
      console.log("[Main] Gate auth ouverte (pas encore déverrouillé)…");
      await window.UnlockGate.ouvrirGate();
      console.log("[Main] Gate auth franchie → init normale");
    }
  }

  // 🆕 v1.9.4 (KARMA 2:a "PIN après UnlockGate") : couche perso PIN/biométrie
  // optionnelle, par-dessus la barrière communautaire UnlockGate.
  //   - Si pas activé → résout immédiatement (no-op)
  //   - Si activé et déjà unlocké cette session (rare car flag in-memory
  //     reset à chaque reload) → no-op
  //   - Sinon → affiche la gate PIN, attend l'unlock (via PIN ou biométrie)
  //   - En lockout → la gate reste affichée infiniment (l'user doit reset)
  //
  // Cf. js/pinLock.js pour le moteur (hash SHA-256 + WebAuthn + lockout).
  if (window.MyKTAMapPinLock && window.MyKTAMapPinLock.isEnabled()
      && !window.MyKTAMapPinLock.isUnlocked()) {
    await _splashEnd();
    console.log("[Main] Gate PIN ouverte (pas encore déverrouillé)…");
    await window.MyKTAMapPinLock.ouvrirGate();
    console.log("[Main] Gate PIN franchie → init normale");
  }

  // ⚖️ v1.56.4 — Toutes les gates de boot (légale → unlock → PIN) sont
  // franchies : on libère le séquenceur de premier lancement. Sans ce signal
  // explicite, FirstRunFlow (déclenché par _splashEnd ~500 ms après le fade)
  // pouvait démarrer dans une FENÊTRE SANS GATE entre deux gates (ex. ~2 s
  // d'attente du check licence pro entre la légale et l'UnlockGate) → le
  // tutoriel partait avant/derrière la saisie du code. En lockout, ce point
  // n'est jamais atteint → la file ne démarre jamais (voulu).
  if (window.FirstRunFlow && typeof window.FirstRunFlow.notifyBootGatesDone === "function") {
    window.FirstRunFlow.notifyBootGatesDone();
  }

  // 🆕 v1.56.0 — La proposition d'activation du PIN n'est PLUS déclenchée ici :
  // elle est désormais séquencée par js/firstRunFlow.js (dernière étape du flux
  // de premier lancement : alerte → légal → onboarding → PIN), pour éviter le
  // « spam » de popups superposées au 1er boot. Cf. _splashEnd → FirstRunFlow.run().

  // Initialiser le registre
  if (window.PlanRegistry) {
    window.PlanRegistry.init();
  }

  // Détection de mise à jour (non bloquant) — fetch version.json en arrière-plan
  // et propose une modale de reset si une nouvelle version est dispo. Si offline,
  // silencieux. La modale s'affichera AU-DESSUS du splash naturellement (z-index 99999).
  if (window.UpdateChecker && typeof window.UpdateChecker.check === "function") {
    window.UpdateChecker.check().catch(function(e) {
      console.warn("[Main] UpdateChecker error :", e);
    });
  }

  // Alerte publique (incendie, fermeture, etc.) — fetch alert.json en parallèle.
  // Si une alerte est active (alert.active = true côté serveur), modale charte
  // affichée après le splash via notifySplashEnded (queue pour éviter le bypass
  // du gradient sombre).
  if (window.AlertChecker && typeof window.AlertChecker.check === "function") {
    window.AlertChecker.check().catch(function(e) {
      console.warn("[Main] AlertChecker error :", e);
    });
  }

  // 🆕 v1.42.0 — Kill-switch anti-fuite (denylist.json côté serveur).
  // Fetch initial async + cache 24h. Le check effectif a lieu au moment de
  // chargerZipFichier() via window.PlanDenylist.isPlanDenied(zipFile).
  // 🆕 v1.42.3 — Audit boot des plans LOCAUX déjà importés (delay 2s pour
  // ne pas bloquer le boot principal). Si des plans sont purgés → modale
  // orange affichée 1s après pour informer l'user. Cache hash dans le
  // registry pour éviter le re-hash au prochain boot.
  if (window.PlanDenylist && typeof window.PlanDenylist.init === "function") {
    window.PlanDenylist.init().then(function() {
      // Affiche la modale de notif si des plans ont été purgés au DERNIER boot
      // (lecture LS — peut survenir aussi suite à audit en arrière-plan plus tôt)
      const purged = window.PlanDenylist.getPurgedAtBoot();
      if (purged && purged.length > 0) {
        setTimeout(function() {
          try { window.PlanDenylist.showPurgedNotifModal(purged); } catch(e) {}
        }, 800);
      }
      // Lance l'audit en arrière-plan (delay 2s anti-blocage boot)
      setTimeout(function() {
        window.PlanDenylist.auditPlansLocaux().then(function(res) {
          if (res.purged && res.purged.length > 0) {
            console.warn("[Main] Audit denylist : " + res.purged.length + " plan(s) purgé(s) au boot — affichage notif");
            // Affiche immédiatement la notif (la modale réutilise LS_PURGED)
            try { window.PlanDenylist.showPurgedNotifModal(res.purged); } catch(e) {}
          }
        }).catch(function(e) {
          console.warn("[Main] auditPlansLocaux error :", e);
        });
      }, 2000);
    }).catch(function(e) {
      console.warn("[Main] PlanDenylist init error :", e);
    });
  }

  // Auto-discovery serveur (data/index.json)
  // 🆕 v1.21.3 (KARMA "rajoute une option — ne pas charger les plan serveur
  // au démarrage") : skip total si l'user a coché la pref dans ⚙️ Configuration
  // loader → section 📚 Plans serveur. Default OFF (rétrocompat).
  const _skipServer = (typeof window._loaderSkipServerPlans === "function")
                      && window._loaderSkipServerPlans();
  // 🛠️ v1.73.0 : la config d'instance (sous-titre, flags, liaisons kiosque)
  // est chargée MÊME si la pref skippe la discovery — seule l'inscription
  // des plans serveur est optionnelle.
  const _idxServeur = await _chargerIndexServeur();
  if (_skipServer) {
    console.log("[Main] Auto-discovery serveur SKIPPÉ (pref user : myktamap_skip_server_plans_v1)");
  } else if (_idxServeur) {
    await decouvrirPlansServeur(_idxServeur);
  }

  // RÉTRO-COMPAT : si rien n'est dans le registre ET qu'un plan racine existe,
  // le charger automatiquement comme avant
  const registreVide = !window.PlanRegistry || window.PlanRegistry.getAll().length === 0;

  if (registreVide) {
    const chargéDepuisServeur = await loadAppConfig();
    if (chargéDepuisServeur) {
      console.log("[Main] Plan serveur racine détecté — chargement auto (rétro-compat)");

      // L'enregistrer dans le registre comme plan "racine"
      if (window.PlanRegistry && window.PLAN_CONFIG?.plan) {
        const id = "server_root";
        window._currentLoadedPlanId = id;  // pour SessionPersist (sinon save() ne saurait pas qui sauvegarder)
        _enregistrerPlanCharge({
          id: id,
          type: "server",
          path: "data",
          name:    window.PLAN_CONFIG.plan.name    || "Plan racine",
          version: window.PLAN_CONFIG.plan.version || null,
          author:  window.PLAN_CONFIG.plan.author  || null,
          discovered: true
        });
      }

      try {
        if (_importDemande) {
          console.log("[Main] Import demandé entretemps — chargement serveur annulé");
          await _splashEnd();
          return;
        }
        // Lancer l'application en parallèle de la fin du splash
        const appPromise = lancerApplication();
        await _splashEnd();
        await appPromise;
        return;
      } catch(err) {
        console.error("[Main] Erreur chargement serveur :", err);
      }
    }
  }

  console.log("[Main] Affichage du home avec liste des plans");
  // Afficher le loader en parallèle de la fin du splash
  afficherLoader();
  await _splashEnd();
})();

// =========================
// EXPORTS GLOBAUX
// =========================
window.startImportedPlan   = startImportedPlan;
window.chargerPlanServeur  = chargerPlanServeur;
window.initDataFromConfig  = initDataFromConfig;
window.lancerApplication   = lancerApplication;
window.afficherLoader      = afficherLoader;
window.decouvrirPlansServeur = decouvrirPlansServeur;
