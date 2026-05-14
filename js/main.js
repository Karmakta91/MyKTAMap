/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * https://myktamap.is-underground.fr — Licence CC BY-NC-SA 4.0
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
      // Format détaillé : { id, path, name, version?, author? }
      // Format minimal : "test1" (string) → on déduit
      let path, name, version, author, id;
      if (typeof entry === "string") {
        path = "data/" + entry;
        name = entry;
        id   = window.PlanRegistry.genServerId(path);
      } else if (entry && typeof entry === "object") {
        path = entry.path || ("data/" + (entry.id || ""));
        name = entry.name || entry.id || path;
        version = entry.version || null;
        author  = entry.author  || null;
        id   = entry.id ? "server_" + entry.id.replace(/[^a-z0-9_-]/gi, "_") : window.PlanRegistry.genServerId(path);
      } else {
        return;
      }

      window.PlanRegistry.addOrUpdate({
        id: id,
        type: "server",
        path: path,
        name: name,
        version: version,
        author: author,
        discovered: true,
        addedAt: new Date().toISOString()
      });
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
    APP_CONFIG.visibleLevels  = [0];   // reset filtre : montre uniquement le niveau 0 au load
    if (!Array.isArray(APP_CONFIG.availableLevels) || APP_CONFIG.availableLevels.length === 0) {
      APP_CONFIG.availableLevels = [0, 1, 2, 3];
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

  await new Promise(function(resolve) { requestAnimationFrame(resolve); });

  await initMapFromConfig();
  await initDataFromConfig();

  map.fitBounds(bounds);

  initEditor();
  initRoad();
  initZones();
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
  }
}

// =========================
// CLEANUP DU PLAN PRÉCÉDENT
// =========================
// Centralise le démontage des ressources avant rechargement (chargerPlanServeur,
// startImportedPlan). Évite la duplication ET garantit que rien n'est oublié
// sur mobile où chaque Mo retenu compte pour iOS Safari.
function _libererRessourcesPlanPrecedent() {
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

  // Tuiles du plan : libère les overlays Leaflet + revoke les blob URLs
  if (window._baseTiles && window._baseTiles.length > 0) {
    libererTuiles(window._baseTiles, window.map);
    window._baseTiles = [];
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
}

// =========================
// CHARGEMENT D'UN PLAN SERVEUR PARTICULIER (depuis le registre)
// =========================
// presetChoisi (optionnel) : "off" | "auto" | "quality" | "balanced" | "performance"
//   → appliqué à APP_CONFIG.perfPreset et sauvegardé dans le registre pour ce plan
const _PERF_VALID_PRESETS = ["off", "auto", "quality", "balanced", "performance"];

async function chargerPlanServeur(planPath, registryEntry, presetChoisi) {
  _libererRessourcesPlanPrecedent();

  const ok = await loadAppConfig(planPath);
  if (!ok) {
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
    _enregistrerPlanCharge({
      id: id,
      type: "server",
      path: planPath,
      name:    window.PLAN_CONFIG.plan.name    || (registryEntry && registryEntry.name) || planPath,
      version: window.PLAN_CONFIG.plan.version || (registryEntry && registryEntry.version) || null,
      author:  window.PLAN_CONFIG.plan.author  || (registryEntry && registryEntry.author)  || null,
      discovered: registryEntry?.discovered || false,
      perfPreset: APP_CONFIG.perfPreset
    });
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
    const btn = document.getElementById("loadPlanBtn");
    if (btn) btn.disabled = false;
    const status = document.getElementById("loaderStatus");
    if (status) status.textContent = "";
  }
  // Masquer #map pendant que le loader est visible
  const mapEl = document.getElementById("map");
  if (mapEl) mapEl.style.display = "none";

  // Rafraîchir la liste des plans dans le loader
  if (typeof window.refreshPlansList === "function") {
    window.refreshPlansList();
  }
}

// =========================
// SPLASH SCREEN — animation de bienvenue au démarrage
// =========================
const SPLASH_MIN_DURATION_MS = 4000;
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
