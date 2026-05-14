// =========================
// CONFIG.JS — unifié serveur + import navigateur
// =========================

// =========================
// MIGRATION DES PRÉFÉRENCES (v1 → v2)
// =========================
// Migre une seule fois les anciennes clés `motionDebug` et `perfMode`
// vers les nouvelles (`debugMode`, `perfPreset` désormais par plan).
// Idempotent : peut être appelée plusieurs fois sans effet de bord.
(function _migrerPrefsUtilisateur() {
  try {
    const raw = localStorage.getItem("app_user_prefs");
    if (!raw) return;
    const saved = JSON.parse(raw);
    let changed = false;

    // motionDebug → debugMode (préservation de la valeur)
    if ("motionDebug" in saved) {
      if (!("debugMode" in saved)) saved.debugMode = !!saved.motionDebug;
      delete saved.motionDebug;
      changed = true;
    }

    // perfMode (global) supprimé en v2 — perfPreset est désormais par plan (PlanRegistry)
    if ("perfMode" in saved) {
      delete saved.perfMode;
      changed = true;
    }

    if (changed) {
      localStorage.setItem("app_user_prefs", JSON.stringify(saved));
      console.log("[Config] Préférences migrées (v1 → v2)");
    }
  } catch(e) {
    console.warn("[Config] Échec migration prefs :", e);
  }
})();

// =========================
// DEFAULT_CONFIG
// =========================
// Valeurs de fallback initiales, MUTABLES :
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
  debugMode:     false,
  perfPreset:    "auto",  // "auto" | "quality" | "balanced" | "performance"

  // ========== MULTI-NIVEAU (depuis v148) ==========
  // Opt-in par plan (PlanRegistry[planId].multiLevel). Quand `multiLevel` est
  // false (defaut), l'UI multi-niveau est masquee et le comportement est
  // strictement identique a v147 (retro-compat absolue).
  multiLevel:       false,         // boolean : feature activee pour ce plan ?
  activeLevel:      0,             // entier ≥ 0 : niveau actif pour DESSINER de nouveaux elements
  visibleLevels:    [0],           // array d'entiers : niveaux AFFICHES (multi-select).
                                   // Par defaut = [activeLevel]. Jonctions affichees si au
                                   // moins un de leurs endpoints (fromLevel/toLevel) est ici.
  availableLevels:  [0, 1, 2, 3]   // liste des niveaux disponibles dans le selecteur
};

let APP_CONFIG = { ...DEFAULT_CONFIG };

// Restaurer dès le chargement la pref globale debugMode (avant tout plan)
// Utile pour le bouton 🐛 du loader qui lit/écrit avant qu'aucun plan ne soit chargé
try {
  const saved = JSON.parse(localStorage.getItem("app_user_prefs") || "{}");
  if ("debugMode" in saved) APP_CONFIG.debugMode = !!saved.debugMode;
} catch(e) {}

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
  const normalizedLogical = normalizePath(logicalPath);
  for (const file of files) {
    const name = normalizePath(file.name);
    if (name === normalizedLogical || name === base) return file;
    // 🧱 Tiling V2 (v149) : aussi matcher via `_fullPath` (propriété ad-hoc
    // posée par extraireZip dans index.html). Nécessaire car iOS Safari strip
    // les `/` du File.name → impossible de retrouver `data/tiles/z0/x0_y-1.jpg`
    // via le name (qui devient juste `x0_y-1.jpg`, partagé avec d'autres
    // niveaux z=-1, z=-2…).
    if (file._fullPath && normalizePath(file._fullPath) === normalizedLogical) return file;
  }
  return null;
}

async function registerAsset(logicalPath, file, opts) {
  const normalized = normalizePath(logicalPath);
  const lower = file.name.toLowerCase();
  // 🧱 Tiling V2 : option `lazy` pour les tuiles. Si lazy=true, on ne crée
  // PAS la blob URL au boot — économie d'allocations pour des plans qui
  // peuvent avoir 1000+ tuiles. La blob URL est créée à la demande par
  // tiling.js > _resoudreUrlTuileLazy.
  if (lower.endsWith(".json")) {
    const text = await file.text();
    const parsed = JSON.parse(text);
    const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
    window.RUNTIME_ASSETS[normalized] = { file, url, json: parsed, type: "json" };
  } else if (opts && opts.lazy === true) {
    // Pas de blob URL maintenant — sera créée lazy par tiling.js
    window.RUNTIME_ASSETS[normalized] = { file, url: null, json: null, type: "binary", lazy: true };
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
    imageHeight:   Number(plan.imageHeight       ?? DEFAULT_CONFIG.imageHeight),
    imageWidth:    Number(plan.imageWidth        ?? DEFAULT_CONFIG.imageWidth),
    scale:         Number(tracking.scale         ?? DEFAULT_CONFIG.scale),
    stepLength:    Number(tracking.stepLength    ?? DEFAULT_CONFIG.stepLength),
    startX:        Number(tracking.startX        ?? DEFAULT_CONFIG.startX),
    startY:        Number(tracking.startY        ?? DEFAULT_CONFIG.startY),
    stepThreshold: Number(tracking.stepThreshold ?? DEFAULT_CONFIG.stepThreshold),
    stepCooldown:  Number(tracking.stepCooldown  ?? DEFAULT_CONFIG.stepCooldown),
    // Lit `debugMode` du plan-config en priorité, fallback sur l'ancien `motionDebug`
    // pour les plans pas encore migrés (rétro-compat zip terrains).
    debugMode:     Boolean(tracking.debugMode ?? tracking.motionDebug ?? DEFAULT_CONFIG.debugMode),
    perfPreset:    DEFAULT_CONFIG.perfPreset,

    // Multi-niveau : valeurs par defaut au load. Le toggle reel (multiLevel)
    // est ecrase par main.js depuis PlanRegistry[planId].multiLevel apres le
    // buildAppConfigFromPlan. activeLevel/visibleLevels resetent toujours a
    // leurs defauts (0 / [0]) au plan switch — Q4 du topo confirme.
    multiLevel:       false,
    activeLevel:      0,
    visibleLevels:    [0],
    availableLevels:  [0, 1, 2, 3]
  };

  // Restaurer la préférence globale debugMode depuis localStorage
  // (perfPreset est désormais par plan — résolu côté loader/main.js)
  try {
    const saved = JSON.parse(localStorage.getItem("app_user_prefs") || "{}");
    if ("debugMode" in saved) cfg.debugMode = !!saved.debugMode;
  } catch(e) {}

  return cfg;
}

// =========================
// CHARGEMENT SERVEUR (data/plan-config.json ou data/<dossier>/plan-config.json)
// =========================
// loadAppConfig() — comportement historique, tente data/plan-config.json (rétro-compat)
// loadAppConfig("data/test1") — tente data/test1/plan-config.json
//                               + résout les chemins relatifs au dossier
// =========================

// Résout un chemin relatif au dossier du plan, en respectant la rétro-compat.
// - http(s):, blob:, data: → tel quel
// - chemin absolu / commence par / → tel quel
// - commence par "data/" ou "icon/" → tel quel (formats actuels)
// - sinon → préfixé par baseDir
function resolveServerPath(p, baseDir) {
  if (!p) return p;
  if (/^(https?:|blob:|data:)/.test(p)) return p;
  if (p.charAt(0) === "/") return p;
  if (p.indexOf("data/") === 0) return p;
  if (p.indexOf("icon/") === 0) return p;
  return baseDir.replace(/\/$/, "") + "/" + p;
}

function resolveServerPaths(config, baseDir) {
  if (!baseDir || baseDir === "data") return config; // racine = pas de réécriture
  if (config.plan?.baseImage)      config.plan.baseImage      = resolveServerPath(config.plan.baseImage, baseDir);
  if (config.plan?.collisionImage) config.plan.collisionImage = resolveServerPath(config.plan.collisionImage, baseDir);
  (config.imageLayers || []).forEach(function(l) { if (l.file) l.file = resolveServerPath(l.file, baseDir); });
  (config.dataLayers  || []).forEach(function(l) { if (l.file) l.file = resolveServerPath(l.file, baseDir); });
  // Note : icons.* déjà gérés par resolveServerPath (icon/ → tel quel)
  return config;
}

async function loadAppConfig(planPath) {
  const baseDir   = planPath || "data";
  const configUrl = baseDir.replace(/\/$/, "") + "/plan-config.json";

  try {
    const response = await fetch(configUrl);
    if (!response.ok) throw new Error("HTTP " + response.status);
    let config = await response.json();
    if (!config?.plan) throw new Error("plan-config.json invalide");

    // Résoudre les chemins relatifs au dossier du plan
    config = resolveServerPaths(config, baseDir);

    window.PLAN_CONFIG = config;
    const cfg = buildAppConfigFromPlan(config);

    // Muter DEFAULT_CONFIG en place pour que resetConfig() utilise les valeurs du plan
    Object.assign(DEFAULT_CONFIG, cfg);
    window.DEFAULT_CONFIG = DEFAULT_CONFIG;

    APP_CONFIG = { ...cfg };
    window.APP_CONFIG = APP_CONFIG;

    console.log("[Config] Chargée depuis", configUrl, APP_CONFIG);
    return true;
  } catch(err) {
    console.warn("[Config] Pas de plan à", configUrl, ":", err.message);
    return false;
  }
}

// =========================
// SAUVEGARDE DES PRÉFÉRENCES UTILISATEUR
// =========================
// Sauvegarde uniquement les prefs GLOBALES (s'appliquent à toute l'app).
// Les prefs PAR PLAN (perfPreset) sont sauvées via PlanRegistry.
function sauvegarderPrefsUtilisateur() {
  try {
    // Lire ce qui est déjà sauvé pour ne pas écraser des clés inconnues éventuelles
    const existing = JSON.parse(localStorage.getItem("app_user_prefs") || "{}");
    existing.debugMode = !!APP_CONFIG.debugMode;
    localStorage.setItem("app_user_prefs", JSON.stringify(existing));
  } catch(e) {}
}

// =========================
// HELPER : MODIFIER LE FLAG DEBUG
// =========================
// Utilisé par le loader (bouton 🐛) ET les Réglages ⚙️ → un seul point d'entrée
function setDebugMode(value) {
  const newValue = !!value;
  const wasOff = !APP_CONFIG.debugMode;
  APP_CONFIG.debugMode = newValue;
  window.APP_CONFIG = APP_CONFIG;
  sauvegarderPrefsUtilisateur();
  console.log("[Config] debugMode →", APP_CONFIG.debugMode);

  // Feedback visuel : si on PASSE de OFF à ON, afficher le toast copyright
  // pour confirmer l'activation du mode debug (et rappeler la licence).
  // L'utilisateur n'a pas besoin d'avoir F12 ouvert — le toast s'affiche
  // direct, peu importe la heuristique de detection F12.
  if (newValue && wasOff && typeof window.__MKM_showWarning__ === "function") {
    window.__MKM_showWarning__("debug-activated");
  }
}

// =========================
// EXPORTS GLOBAUX
// =========================
window.APP_CONFIG                  = APP_CONFIG;
window.DEFAULT_CONFIG              = DEFAULT_CONFIG;
window.loadAppConfig               = loadAppConfig;
window.buildAppConfigFromPlan      = buildAppConfigFromPlan;
window.sauvegarderPrefsUtilisateur = sauvegarderPrefsUtilisateur;
window.setDebugMode                = setDebugMode;
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
