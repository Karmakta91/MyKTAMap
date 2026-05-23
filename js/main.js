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
  window._ktaImageOverlays = [];  // v162 : registre des image layers level-aware

  // Détection : la session SessionPersist contient-elle des editor points pour ce plan ?
  // Si oui, on SKIP le fetch de data/editor.json car le restore est autoritaire.
  // Sans ce skip, les markers du JSON arrivent async APRÈS le restore et coexistent
  // avec ceux de la session dans le layerEditor — mais ces markers JSON ne sont
  // PAS dans listePoints, donc tout render ultérieur (suppression, ajout) les efface
  // silencieusement, et le contrôle des calques peut sembler ne pas les gérer.
  let _skipEditorJsonLoad = false;
  try {
    const raw = localStorage.getItem("myktamap_session_v1");
    if (raw) {
      const saved = JSON.parse(raw);
      const planId = window._currentLoadedPlanId;
      const planName = (window.PLAN_CONFIG && window.PLAN_CONFIG.plan && window.PLAN_CONFIG.plan.name) || "";
      const idMatch   = saved && saved.planId === planId;
      const nameMatch = (!saved.planName || !planName) ? true : (saved.planName === planName);
      if (idMatch && nameMatch && Array.isArray(saved.editorPoints) && saved.editorPoints.length > 0) {
        _skipEditorJsonLoad = true;
        console.log("[Main] Session active avec", saved.editorPoints.length, "point(s) editor → skip data/editor.json (session autoritative)");
      }
    }
  } catch(e) {}

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
async function decouvrirPlansServeur() {
  if (!window.PlanRegistry) return;
  try {
    const r = await fetch("data/index.json");
    if (!r.ok) {
      console.log("[Main] data/index.json absent — pas d'auto-discovery");
      return;
    }
    const idx = await r.json();
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

  // Restauration de session si correspond au plan courant (et démarrage du polling auto-save)
  if (window.SessionPersist) {
    window.SessionPersist.onPlanLoaded(window._currentLoadedPlanId || null);
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

  // 🆕 v1.11.0 Undo/Redo : reset historique au plan switch (KARMA 11:a).
  // L'historique est par-plan : aucune raison de garder les snapshots
  // d'un plan dans la pile quand on en charge un autre (les setters
  // restaureraient des données qui ne correspondent pas au nouveau plan).
  if (window.HistoryManager && typeof window.HistoryManager.reset === "function") {
    try { window.HistoryManager.reset(); } catch(e) {}
  }

  // Tuiles du plan : libère les overlays Leaflet + revoke les blob URLs
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
    window._afficherOverlayChargement("Récupération du plan depuis le serveur…");
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
  }

  _appEnCours    = false;
  _importDemande = false;
  await lancerApplication();
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

  const planText  = await planConfigFile.text();
  const rawConfig = JSON.parse(planText);

  const validation = validateImportedPlan(rawConfig);
  if (!validation.ok) throw new Error(validation.errors.join(" | "));

  window.RAW_PLAN_CONFIG = rawConfig;

  const files = Array.from(assetFiles || []);
  const allLogicalPaths = [];
  if (rawConfig.plan?.baseImage)      allLogicalPaths.push(rawConfig.plan.baseImage);
  if (rawConfig.plan?.collisionImage) allLogicalPaths.push(rawConfig.plan.collisionImage);
  (rawConfig.imageLayers || []).forEach(function(l) { if (l.file) allLogicalPaths.push(l.file); });
  (rawConfig.dataLayers  || []).forEach(function(l) { if (l.file) allLogicalPaths.push(l.file); });

  const uniquePaths = [...new Set(allLogicalPaths.map(normalizePath))];

  await Promise.all(uniquePaths.map(async function(logicalPath) {
    const matched = findMatchingFile(logicalPath, files);
    if (!matched) { console.warn("[Loader] Fichier non trouvé :", logicalPath); return; }
    await registerAsset(logicalPath, matched);
  }));

  // 🧱 Tiling V2 (v149) : scan des tuiles dans le ZIP (chemin `data/tiles/z<N>/*.jpg`).
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
              status.textContent = "⚠️ Mémorisation impossible : " + result.error + " — le plan reste utilisable mais demandera une re-sélection au prochain chargement.";
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

  // Synchroniser la durée CSS de remplissage avec notre constante
  const bar = document.getElementById("splashProgressBar");
  if (bar) {
    bar.style.setProperty("--splash-duration", SPLASH_MIN_DURATION_MS + "ms");
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
    // Alerte publique (incendie, etc.) si l'auteur en a publié une dans alert.json
    // (depuis v168 : inclut aussi l'annonce migration myktamap.fr — l'ancien
    // module MigrationNotice qui doublait via une modal one-shot a été supprimé)
    if (window.AlertChecker && typeof window.AlertChecker.notifySplashEnded === "function") {
      window.AlertChecker.notifySplashEnded();
    }
  }, 500);
}

// =========================
// POINT D'ENTRÉE — auto-détection
// =========================
(async function initApp() {
  console.log("[Main] Démarrage…");

  // Démarrer le splash dès l'init
  _splashStart();

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
    console.log("[Main] Gate auth ouverte (pas encore déverrouillé)…");
    await window.UnlockGate.ouvrirGate();
    console.log("[Main] Gate auth franchie → init normale");
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

  // 🆕 v1.10.0 (KARMA "après cette mise à jour, premier lancement, proposer
  // activer l'authentification forte") : proposition d'activation one-shot
  // pour les users qui n'ont pas (encore) activé le PIN. Skip si déjà
  // activé OU si l'user a déjà refusé une fois (flag localStorage).
  // Délai 800ms après pour laisser le splash finir + ne pas surcharger
  // le 1er paint visuel.
  if (window.MyKTAMapPinLock && typeof window.MyKTAMapPinLock.proposerActivation === "function") {
    window.MyKTAMapPinLock.proposerActivation();
  }

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

  // Auto-discovery serveur (data/index.json)
  await decouvrirPlansServeur();

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
