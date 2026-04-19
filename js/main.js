async function initDataFromConfig() {
  const config = window.PLAN_CONFIG;

  config.dataLayers.forEach(layerConfig => {
    const targetLayer = window.dataLayerGroups[layerConfig.id];

    if (targetLayer) {
      ajouterPointsDepuisJSON(layerConfig.file, targetLayer);
    }
  });
}

(async function initApp() {
  await initMapFromConfig();
  await initDataFromConfig();

  // zoom initial
  map.fitBounds(bounds);

  // init
  initTracking();
  initEditor();
  initRoad();
  initMeasure();
  initInterface();

  // permission capteurs iPhone
  document.body.addEventListener('click', function() {
    requestPermission();
  }, { once: true });
})();