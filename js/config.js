const DEFAULT_CONFIG = {
  imageHeight: 6105,
  imageWidth: 10441,
  scale: 4.9,
  stepLength: 0.7,
  startX: 560,
  startY: 2891,
  stepThreshold: 13,      // seuil de détection
  stepCooldown: 400,     // ms entre 2 pas
  motionDebug: false     // logs console
};

function convertCoord(x, y) {
  return [APP_CONFIG.imageHeight - y, x];
}

let savedConfig = localStorage.getItem("app_config");
let APP_CONFIG = savedConfig ? JSON.parse(savedConfig) : { ...DEFAULT_CONFIG };

window.DEFAULT_CONFIG = DEFAULT_CONFIG;
window.APP_CONFIG = APP_CONFIG;