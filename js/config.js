const DEFAULT_CONFIG = {
  imageHeight: 610,
  imageWidth: 1044,
  scale: 4.9,
  stepLength: 0.7,
  startX: 345,
  startY: 519,
  stepThreshold: 13,      // seuil de détection
  stepCooldown: 400,     // ms entre 2 pas
  motionDebug: false     // logs console
};

let savedConfig = localStorage.getItem("app_config");
let APP_CONFIG = savedConfig ? JSON.parse(savedConfig) : { ...DEFAULT_CONFIG };

window.DEFAULT_CONFIG = DEFAULT_CONFIG;
window.APP_CONFIG = APP_CONFIG;
