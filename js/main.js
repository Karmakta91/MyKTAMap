// =========================
// MAIN.JS — unifié serveur + import navigateur
// Point d'entrée unique avec auto-détection du mode
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
  config.dataLayers.forEach(function(layerConfig) {
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
  initMeasure();
  initInterface();
  initTracking();

  document.body.addEventListener('click', function() {
    requestPermission();
  }, { once: true });

  console.log("[Main] Application lancée");
  } finally {
    _appEnCours = false;
  }
}

// =========================
// CHARGEMENT DEPUIS IMPORT NAVIGATEUR
// =========================
async function startImportedPlan(planConfigFile, assetFiles, perfChoisi) {
  if (!planConfigFile) throw new Error("Aucun fichier plan-config.json fourni");

  // Détruire proprement la carte existante (plan serveur éventuellement chargé)
  _importDemande = true;
  _appEnCours    = false;

  // Libérer les tuiles du plan serveur si elles existent
  if (window._baseTiles && window._baseTiles.length > 0) {
    libererTuiles(window._baseTiles, window.map);
    window._baseTiles = [];
  }

  // Supprimer la carte Leaflet existante
  if (window.map) {
    try { window.map.remove(); } catch(e) {}
    window.map = null;
  }

  // Réinitialiser les états des modules
  window.interfaceInitialized = false;
  window.roadInitialized      = false;

  resetRuntimeAssets();

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
  window.DEFAULT_CONFIG = { ...cfg };
  window.APP_CONFIG = APP_CONFIG = cfg;

  // Appliquer le choix explicite du loader AVANT lancerApplication
  // pour que chargerImage() lise la bonne valeur de perfMode
  if (typeof perfChoisi === "boolean") {
    window.APP_CONFIG.perfMode = APP_CONFIG.perfMode = perfChoisi;
    console.log("[Loader] perfMode imposé :", perfChoisi);
  }

  console.log("[Loader] APP_CONFIG.perfMode au lancement :", APP_CONFIG.perfMode);

  // Forcer la réinitialisation du verrou pour permettre le rechargement
  _appEnCours    = false;
  _importDemande = false;

  await lancerApplication();
}

// =========================
// AFFICHER LE LOADER
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
}

// =========================
// POINT D'ENTRÉE — auto-détection
// =========================
(async function initApp() {
  console.log("[Main] Démarrage…");

  const chargéDepuisServeur = await loadAppConfig();

  if (chargéDepuisServeur) {
    console.log("[Main] Plan serveur détecté — chargement automatique");
    try {
      if (_importDemande) {
        console.log("[Main] Import demandé entretemps — chargement serveur annulé");
        return;
      }
      await lancerApplication();
    } catch(err) {
      console.error("[Main] Erreur chargement serveur :", err);
      afficherLoader();
    }
  } else {
    console.log("[Main] Aucun plan serveur — affichage du loader");
    afficherLoader();
  }
})();

// =========================
// EXPORTS GLOBAUX
// =========================
window.startImportedPlan  = startImportedPlan;
window.initDataFromConfig = initDataFromConfig;
window.lancerApplication  = lancerApplication;
window.afficherLoader     = afficherLoader;
