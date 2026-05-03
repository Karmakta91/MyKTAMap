// =========================
// CONFIG.JS — unifié serveur + import navigateur
// =========================

// DEFAULT_CONFIG = valeurs de fallback initiales, mais MUTABLES :
// elles sont mises à jour à chaque chargement de plan pour refléter
// la config réelle du plan en cours (utilisé par resetConfig())
let DEFAULT_CONFIG = {
  imageHeight:   610,
  imageWidth:    1044,
  scale:         4.9,
  stepLength:    0.7,
  startX:        345,
  startY:        519,
  stepThreshold: 13,
  stepCooldown:  400,
  motionDebug:   false,
  perfMode:      null
};

let APP_CONFIG = { ...DEFAULT_CONFIG };

// =========================
// RUNTIME ASSETS (mode import navigateur)
// =========================
window.RAW_PLAN_CONFIG  = null;
window.PLAN_CONFIG      = null;
window.RUNTIME_ASSETS   = {};

function normalizePath(path) {
  return String(path || "").replace(/\\/g, "/").trim();
}

function getBaseName(path) {
  return normalizePath(path).split("/").pop();
}

function getRuntimeAsset(path) {
  return window.RUNTIME_ASSETS[normalizePath(path)] || null;
}

function getRuntimeAssetUrl(path) {
  const e = getRuntimeAsset(path);
  return e ? e.url : null;
}

function getRuntimeAssetJson(path) {
  const e = getRuntimeAsset(path);
  return e ? e.json : null;
}

function resetRuntimeAssets() {
  Object.values(window.RUNTIME_ASSETS).forEach(function(entry) {
    if (entry?.url?.startsWith("blob:")) {
      try { URL.revokeObjectURL(entry.url); } catch(e) {}
    }
  });
  window.RUNTIME_ASSETS  = {};
  window.RAW_PLAN_CONFIG = null;
  window.PLAN_CONFIG     = null;
}

function findMatchingFile(logicalPath, files) {
  const base = getBaseName(logicalPath);
  for (const file of files) {
    const name = normalizePath(file.name);
    if (name === normalizePath(logicalPath) || name === base) return file;
  }
  return null;
}

async function registerAsset(logicalPath, file) {
  const normalized = normalizePath(logicalPath);
  const lower = file.name.toLowerCase();
  if (lower.endsWith(".json")) {
    const text = await file.text();
    const parsed = JSON.parse(text);
    const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
    window.RUNTIME_ASSETS[normalized] = { file, url, json: parsed, type: "json" };
  } else {
    const url = URL.createObjectURL(file);
    window.RUNTIME_ASSETS[normalized] = { file, url, json: null, type: "binary" };
  }
}

function cloneAndResolvePlanConfig(rawConfig) {
  const resolved = JSON.parse(JSON.stringify(rawConfig));
  if (resolved.plan?.baseImage)
    resolved.plan.baseImage = getRuntimeAssetUrl(resolved.plan.baseImage) || resolved.plan.baseImage;
  if (resolved.plan?.collisionImage)
    resolved.plan.collisionImage = getRuntimeAssetUrl(resolved.plan.collisionImage) || resolved.plan.collisionImage;
  if (Array.isArray(resolved.imageLayers))
    resolved.imageLayers = resolved.imageLayers.map(function(l) {
      return { ...l, file: getRuntimeAssetUrl(l.file) || l.file };
    });
  if (Array.isArray(resolved.dataLayers))
    resolved.dataLayers = resolved.dataLayers.map(function(l) {
      return { ...l, file: getRuntimeAssetUrl(l.file) || l.file };
    });
  return resolved;
}

function validateImportedPlan(rawConfig) {
  const errors = [];
  if (!rawConfig?.plan) errors.push("plan-config.json invalide");
  if (!rawConfig?.plan?.baseImage) errors.push("plan.baseImage manquant");
  if (!rawConfig?.plan?.imageWidth) errors.push("plan.imageWidth manquant");
  if (!rawConfig?.plan?.imageHeight) errors.push("plan.imageHeight manquant");
  return { ok: errors.length === 0, errors };
}

// =========================
// CONSTRUCTION APP_CONFIG depuis un plan
// =========================
function buildAppConfigFromPlan(planConfig) {
  const plan     = planConfig?.plan     || {};
  const tracking = planConfig?.tracking || {};

  const cfg = {
    imageHeight:   Number(plan.imageHeight      ?? DEFAULT_CONFIG.imageHeight),
    imageWidth:    Number(plan.imageWidth       ?? DEFAULT_CONFIG.imageWidth),
    scale:         Number(tracking.scale        ?? DEFAULT_CONFIG.scale),
    stepLength:    Number(tracking.stepLength   ?? DEFAULT_CONFIG.stepLength),
    startX:        Number(tracking.startX       ?? DEFAULT_CONFIG.startX),
    startY:        Number(tracking.startY       ?? DEFAULT_CONFIG.startY),
    stepThreshold: Number(tracking.stepThreshold ?? DEFAULT_CONFIG.stepThreshold),
    stepCooldown:  Number(tracking.stepCooldown  ?? DEFAULT_CONFIG.stepCooldown),
    motionDebug:   Boolean(tracking.motionDebug  ?? DEFAULT_CONFIG.motionDebug),
    perfMode:      DEFAULT_CONFIG.perfMode
  };

  // Restaurer les préférences utilisateur
  try {
    const saved = JSON.parse(localStorage.getItem("app_user_prefs") || "{}");
    if ("motionDebug" in saved) cfg.motionDebug = saved.motionDebug;
    if ("perfMode"    in saved) cfg.perfMode    = saved.perfMode;
  } catch(e) {}

  return cfg;
}

// =========================
// CHARGEMENT SERVEUR (data/plan-config.json)
// =========================
async function loadAppConfig() {
  try {
    const response = await fetch('data/plan-config.json');
    if (!response.ok) throw new Error("HTTP " + response.status);
    const config = await response.json();
    if (!config?.plan) throw new Error("plan-config.json invalide");

    window.PLAN_CONFIG = config;
    const cfg = buildAppConfigFromPlan(config);

    // Muter DEFAULT_CONFIG en place pour que resetConfig() utilise les valeurs du plan
    Object.assign(DEFAULT_CONFIG, cfg);
    window.DEFAULT_CONFIG = DEFAULT_CONFIG;

    APP_CONFIG = { ...cfg };
    window.APP_CONFIG = APP_CONFIG;

    console.log("[Config] Chargée depuis serveur", APP_CONFIG);
    return true;
  } catch(err) {
    console.warn("[Config] Pas de plan serveur :", err.message);
    return false;
  }
}

// =========================
// SAUVEGARDE DES PRÉFÉRENCES UTILISATEUR
// =========================
function sauvegarderPrefsUtilisateur() {
  try {
    localStorage.setItem("app_user_prefs", JSON.stringify({
      motionDebug: APP_CONFIG.motionDebug,
      perfMode:    APP_CONFIG.perfMode
    }));
  } catch(e) {}
}

// =========================
// EXPORTS GLOBAUX
// =========================
window.APP_CONFIG                  = APP_CONFIG;
window.DEFAULT_CONFIG              = DEFAULT_CONFIG;
window.loadAppConfig               = loadAppConfig;
window.buildAppConfigFromPlan      = buildAppConfigFromPlan;
window.sauvegarderPrefsUtilisateur = sauvegarderPrefsUtilisateur;
window.normalizePath               = normalizePath;
window.getBaseName                 = getBaseName;
window.getRuntimeAsset             = getRuntimeAsset;
window.getRuntimeAssetUrl          = getRuntimeAssetUrl;
window.getRuntimeAssetJson         = getRuntimeAssetJson;
window.registerAsset               = registerAsset;
window.resetRuntimeAssets          = resetRuntimeAssets;
window.findMatchingFile            = findMatchingFile;
window.cloneAndResolvePlanConfig   = cloneAndResolvePlanConfig;
window.validateImportedPlan        = validateImportedPlan;
