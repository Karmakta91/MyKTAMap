// =========================
// CHARGEMENT DES DONNÉES
// =========================
async function initDataFromConfig() {
  const config = window.PLAN_CONFIG;

  if (!config || !Array.isArray(config.dataLayers)) {
    console.warn("Aucune dataLayer à charger");
    return;
  }

  config.dataLayers.forEach(layerConfig => {
    const targetLayer = window.dataLayerGroups?.[layerConfig.id];

    if (targetLayer) {
      ajouterPointsDepuisJSON(layerConfig.file, targetLayer);
    } else {
      console.warn("Layer introuvable :", layerConfig.id);
    }
  });
}

// =========================
// LANCEMENT COMPLET DE L'APP
// =========================
async function startImportedPlan(planConfigFile, assetFiles) {
  if (!planConfigFile) {
    throw new Error("Aucun fichier plan-config.json fourni");
  }

  resetRuntimeAssets();

  const planText = await planConfigFile.text();
  const rawConfig = JSON.parse(planText);

  const validation = validateImportedPlan(rawConfig);
  if (!validation.ok) {
    throw new Error(validation.errors.join(" | "));
  }

  window.RAW_PLAN_CONFIG = rawConfig;

  const files = Array.from(assetFiles || []);
  const allLogicalPaths = [];

  if (rawConfig.plan?.baseImage) allLogicalPaths.push(rawConfig.plan.baseImage);
  if (rawConfig.plan?.collisionImage) allLogicalPaths.push(rawConfig.plan.collisionImage);
  (rawConfig.imageLayers || []).forEach(layer => { if (layer.file) allLogicalPaths.push(layer.file); });
  (rawConfig.dataLayers || []).forEach(layer => { if (layer.file) allLogicalPaths.push(layer.file); });

  const uniquePaths = [...new Set(allLogicalPaths.map(normalizePath))];

  await Promise.all(uniquePaths.map(async logicalPath => {
    const matched = findMatchingFile(logicalPath, files);
    if (!matched) { console.warn("Fichier non trouvé pour :", logicalPath); return; }
    await registerAsset(logicalPath, matched);
  }));

  window.PLAN_CONFIG = cloneAndResolvePlanConfig(rawConfig);

  const cfg = buildAppConfigFromPlan(rawConfig);
  window.DEFAULT_CONFIG = { ...cfg };
  window.APP_CONFIG = { ...cfg };

  console.log("[Loader] Plan importé avec succès");

  // Cacher l'overlay AVANT initMapFromConfig pour que #map soit visible
  const overlay = document.getElementById("planLoaderOverlay");
  if (overlay) overlay.style.display = "none";

  await new Promise(resolve => requestAnimationFrame(resolve));

  // Initialisation dans le bon ordre
  await initMapFromConfig();    // APP_CONFIG est prêt
  await initDataFromConfig();   // données sur la carte

  map.fitBounds(bounds);

  initEditor();
  initRoad();
  initMeasure();
  initInterface();
  initTracking();               // après initMapFromConfig, startX/Y sont disponibles

  document.body.addEventListener('click', function() {
    requestPermission();
  }, { once: true });
}
// =========================
// EXPORT GLOBAL
// =========================
window.initDataFromConfig = initDataFromConfig;
window.startImportedPlan = startImportedPlan;