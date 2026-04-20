// =========================
// CONFIGURATION PAR DÉFAUT (au cas où plan-config.json échoue)
// =========================
const DEFAULT_CONFIG = {
  imageHeight: 610,    // hauteur par défaut du plan
  imageWidth: 1044,    // largeur par défaut du plan
  scale: 4.9,         // échelle par défaut
  stepLength: 0.7,    // longueur du pas en mètres
  startX: 345,        // position initiale X
  startY: 519,        // position initiale Y
  stepThreshold: 13,  // seuil de détection du pas
  stepCooldown: 400,  // délai entre 2 pas
  motionDebug: false  // logs console
};

// =========================
// INITIALISATION DE APP_CONFIG
// =========================
let APP_CONFIG = { ...DEFAULT_CONFIG };  // Valeurs par défaut

// =========================
// CHARGEMENT DE LA CONFIGURATION
// =========================
async function loadAppConfig() {
  try {
    // Chargement du fichier plan-config.json
    const response = await fetch('data/plan-config.json');
    const config = await response.json();

    if (!config || !config.plan) {
      throw new Error("plan-config.json invalide ou manquant");
    }

    window.PLAN_CONFIG = config;

    // Mise à jour de APP_CONFIG avec les données de plan-config.json
    const tracking = config.tracking || {};
    const plan = config.plan || {};

    // Mettre à jour APP_CONFIG en fonction de plan-config.json
    APP_CONFIG = {
      imageHeight: plan.imageHeight || DEFAULT_CONFIG.imageHeight,
      imageWidth: plan.imageWidth || DEFAULT_CONFIG.imageWidth,
      scale: tracking.scale || DEFAULT_CONFIG.scale,
      stepLength: tracking.stepLength || DEFAULT_CONFIG.stepLength,
      startX: tracking.startX || DEFAULT_CONFIG.startX,
      startY: tracking.startY || DEFAULT_CONFIG.startY,
      stepThreshold: tracking.stepThreshold || DEFAULT_CONFIG.stepThreshold,
      stepCooldown: tracking.stepCooldown || DEFAULT_CONFIG.stepCooldown,
      motionDebug: tracking.motionDebug || DEFAULT_CONFIG.motionDebug
    };

    // Sauvegarde dans localStorage si nécessaire
    localStorage.setItem("app_config", JSON.stringify(APP_CONFIG));

    console.log("Configuration chargée avec succès", APP_CONFIG);
  } catch (error) {
    console.error("Erreur lors du chargement de plan-config.json :", error);
    // Si le chargement échoue, on garde les valeurs par défaut
    APP_CONFIG = { ...DEFAULT_CONFIG };
  }
}

// =========================
// EXPORT GLOBAUX
// =========================
window.loadAppConfig = loadAppConfig;
window.APP_CONFIG = APP_CONFIG;
window.DEFAULT_CONFIG = APP_CONFIG;