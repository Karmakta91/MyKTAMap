// =========================
// CONFIGURATION RUNTIME
// =========================

// JSON original fourni par l'utilisateur
window.RAW_PLAN_CONFIG = null;

// JSON résolu avec URLs runtime (blob:)
window.PLAN_CONFIG = null;

// Registre des fichiers importés
// clé = chemin logique du JSON d'origine (ex: data/puit.json)
// valeur = { file, url, json, type }
window.RUNTIME_ASSETS = {};

// Config appli
window.DEFAULT_CONFIG = {};
window.APP_CONFIG = {};

// =========================
// HELPERS
// =========================
function normalizePath(path) {
  return String(path || "").replace(/\\/g, "/").trim();
}

function getBaseName(path) {
  const p = normalizePath(path);
  return p.split("/").pop();
}

function buildAppConfigFromPlan(planConfig) {
  const plan = planConfig?.plan || {};
  const tracking = planConfig?.tracking || {};

  return {
    imageHeight: Number(plan.imageHeight ?? 0),
    imageWidth: Number(plan.imageWidth ?? 0),
    scale: Number(tracking.scale ?? 1),
    stepLength: Number(tracking.stepLength ?? 0.7),
    startX: Number(tracking.startX ?? 0),
    startY: Number(tracking.startY ?? 0),
    stepThreshold: Number(tracking.stepThreshold ?? 13),
    stepCooldown: Number(tracking.stepCooldown ?? 400),
    motionDebug: Boolean(tracking.motionDebug ?? false)
  };
}

function getRuntimeAsset(path) {
  return window.RUNTIME_ASSETS[normalizePath(path)] || null;
}

function getRuntimeAssetUrl(path) {
  const entry = getRuntimeAsset(path);
  return entry ? entry.url : null;
}

function getRuntimeAssetJson(path) {
  const entry = getRuntimeAsset(path);
  return entry ? entry.json : null;
}

function resetRuntimeAssets() {
  Object.values(window.RUNTIME_ASSETS).forEach(entry => {
    if (entry?.url && typeof entry.url === "string" && entry.url.startsWith("blob:")) {
      try {
        URL.revokeObjectURL(entry.url);
      } catch (err) {
        console.warn("Impossible de libérer l'URL :", err);
      }
    }
  });

  window.RUNTIME_ASSETS = {};
  window.RAW_PLAN_CONFIG = null;
  window.PLAN_CONFIG = null;
  window.DEFAULT_CONFIG = {};
  window.APP_CONFIG = {};
}

function findMatchingFile(logicalPath, files) {
  const normalizedLogical = normalizePath(logicalPath);
  const logicalBase = getBaseName(logicalPath);

  console.log("[Loader] Recherche fichier pour :", normalizedLogical);

  for (const file of files) {
    const fileName = normalizePath(file.name);
    console.log("[Loader] Vérification fichier :", fileName);

    if (fileName === normalizedLogical || fileName === logicalBase) {
      console.log("[Loader] Fichier trouvé :", fileName);
      return file;
    }
  }

  console.warn("[Loader] Fichier non trouvé pour :", logicalPath);
  return null;
}

async function registerAsset(logicalPath, file) {
  const normalizedPath = normalizePath(logicalPath);
  const lower = file.name.toLowerCase();

  if (lower.endsWith(".json")) {
    const text = await file.text();
    const parsed = JSON.parse(text);
    const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));

    window.RUNTIME_ASSETS[normalizedPath] = {
      file,
      url,
      json: parsed,
      type: "json"
    };
  } else {
    const url = URL.createObjectURL(file);

    window.RUNTIME_ASSETS[normalizedPath] = {
      file,
      url,
      json: null,
      type: "binary"
    };
  }
}

function cloneAndResolvePlanConfig(rawConfig) {
  const resolved = JSON.parse(JSON.stringify(rawConfig));

  if (resolved.plan?.baseImage) {
    resolved.plan.baseImage =
      getRuntimeAssetUrl(resolved.plan.baseImage) || resolved.plan.baseImage;
  }

  if (resolved.plan?.collisionImage) {
    resolved.plan.collisionImage =
      getRuntimeAssetUrl(resolved.plan.collisionImage) || resolved.plan.collisionImage;
  }

  if (Array.isArray(resolved.imageLayers)) {
    resolved.imageLayers = resolved.imageLayers.map(layer => ({
      ...layer,
      file: getRuntimeAssetUrl(layer.file) || layer.file
    }));
  }

  if (Array.isArray(resolved.dataLayers)) {
    resolved.dataLayers = resolved.dataLayers.map(layer => ({
      ...layer,
      file: getRuntimeAssetUrl(layer.file) || layer.file
    }));
  }

  return resolved;
}

function validateImportedPlan(rawConfig) {
  const errors = [];

  if (!rawConfig || !rawConfig.plan) {
    errors.push("plan-config.json invalide");
    return { ok: false, errors };
  }

  if (!rawConfig.plan.baseImage) {
    errors.push("plan.baseImage manquant");
  }

  if (!rawConfig.plan.imageWidth) {
    errors.push("plan.imageWidth manquant");
  }

  if (!rawConfig.plan.imageHeight) {
    errors.push("plan.imageHeight manquant");
  }

  return {
    ok: errors.length === 0,
    errors
  };
}

// =========================
// CHARGEMENT DEPUIS IMPORT UTILISATEUR
// =========================
async function registerImportedPlan(planConfigFile, assetFiles) {
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

  (rawConfig.imageLayers || []).forEach(layer => {
    if (layer.file) allLogicalPaths.push(layer.file);
  });

  (rawConfig.dataLayers || []).forEach(layer => {
    if (layer.file) allLogicalPaths.push(layer.file);
  });

  const uniquePaths = [...new Set(allLogicalPaths.map(normalizePath))];

  // Enregistrer tous les fichiers
  for (const logicalPath of uniquePaths) {
    const matched = findMatchingFile(logicalPath, files);

    if (!matched) {
      console.warn("Fichier non trouvé pour :", logicalPath);
      continue;
    }

    await registerAsset(logicalPath, matched);
  }

  window.PLAN_CONFIG = cloneAndResolvePlanConfig(rawConfig);

  const cfg = buildAppConfigFromPlan(rawConfig);
  window.DEFAULT_CONFIG = { ...cfg };
  window.APP_CONFIG = { ...cfg };

  console.log("[Loader] Plan importé avec succès");

  return {
    RAW_PLAN_CONFIG: window.RAW_PLAN_CONFIG,
    PLAN_CONFIG: window.PLAN_CONFIG,
    APP_CONFIG: window.APP_CONFIG,
    RUNTIME_ASSETS: window.RUNTIME_ASSETS
  };
}

// =========================
// COMPATIBILITÉ
// =========================
async function loadAppConfig() {
  if (!window.PLAN_CONFIG) {
    throw new Error("Aucun plan importé. Utiliser registerImportedPlan() d'abord.");
  }

  const cfg = buildAppConfigFromPlan(window.RAW_PLAN_CONFIG || window.PLAN_CONFIG);
  window.DEFAULT_CONFIG = { ...cfg };
  window.APP_CONFIG = { ...cfg };

  return window.APP_CONFIG;
}

// =========================
// EXPORTS GLOBAUX
// =========================
window.buildAppConfigFromPlan = buildAppConfigFromPlan;
window.getRuntimeAsset = getRuntimeAsset;
window.getRuntimeAssetUrl = getRuntimeAssetUrl;
window.getRuntimeAssetJson = getRuntimeAssetJson;
window.registerImportedPlan = registerImportedPlan;
window.resetRuntimeAssets = resetRuntimeAssets;
window.loadAppConfig = loadAppConfig;