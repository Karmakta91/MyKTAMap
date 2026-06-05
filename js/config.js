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

  // 🔍 v174 : adapter la taille visuelle des icônes au zoom (default true).
  // Si false, comportement Leaflet par défaut (icônes taille écran fixe →
  // semblent énormes au dézoom). Lu une fois à creerIcones + au hook zoom
  // dans initMapFromConfig → reload du plan requis pour changement.
  scaledMarkers: true,

  // 🆕 v1.9.2 : afficher les cercles aux intersections de tracés (default true).
  // Quand 2 roads se croisent, un cercle plein est dessiné au point
  // d'intersection (cf. road.js > renderRoads). Sur des plans très denses,
  // ça peut surcharger visuellement → l'user peut désactiver via toggle
  // dans ⚙️ Réglages (map mode) ou ⚙️ Configuration (loader/home).
  // Pas de reload requis : un appel à renderRoads() après toggle suffit
  // pour faire disparaître / réapparaître les cercles à chaud.
  showRoadIntersections: true,

  // 🧭 Nav Intelligente (C2) : caler la position tracker sur le réseau de
  // tracés (map-matching). Pref GLOBALE, défaut OFF (rétrocompat stricte).
  // Lue à chaud par tracking.js > avancer(). Sans effet si le plan n'a pas de
  // réseau (garde-fou runtime via RoadGraph.isReady()).
  smartNav: false,

  // ========== MULTI-NIVEAU (depuis v148) ==========
  // Opt-in par plan (PlanRegistry[planId].multiLevel). Quand `multiLevel` est
  // false (defaut), l'UI multi-niveau est masquee et le comportement est
  // strictement identique a v147 (retro-compat absolue).
  multiLevel:       false,           // boolean : feature activee pour ce plan ?
  activeLevel:      0,               // entier (positif OU negatif) : niveau actif pour DESSINER
                                     // de nouveaux elements. 0 = niveau de reference (= elements
                                     // sans `level` taggue). Les negatifs representent les sous-sols
                                     // (-1 = etage du dessous, etc.).
  visibleLevels:    [0],             // array d'entiers : niveaux AFFICHES (multi-select).
                                     // Par defaut = [activeLevel]. Jonctions affichees si au
                                     // moins un de leurs endpoints (fromLevel/toLevel) est ici.
  availableLevels:  [-2, -1, 0, 1, 2] // liste des niveaux disponibles dans le selecteur.
                                     // Defaut symetrique autour de 0. Extensible via boutons
                                     // -/+ dans la modale (min-1 / max+1). Auto-etendu au boot
                                     // par main.js si les data layers contiennent des items
                                     // hors range (ex: level: 4 → ajout du 3 et 4).
};

let APP_CONFIG = { ...DEFAULT_CONFIG };

// Restaurer dès le chargement la pref globale debugMode (avant tout plan)
// Utile pour le bouton 🐛 du loader qui lit/écrit avant qu'aucun plan ne soit chargé
try {
  const saved = JSON.parse(localStorage.getItem("app_user_prefs") || "{}");
  if ("debugMode" in saved) APP_CONFIG.debugMode = !!saved.debugMode;
  // 🔍 v174 : restaurer scaledMarkers avant que creerIcones tourne
  if ("scaledMarkers" in saved) APP_CONFIG.scaledMarkers = !!saved.scaledMarkers;
  // 🆕 v1.9.2 : restaurer showRoadIntersections avant que renderRoads tourne
  if ("showRoadIntersections" in saved) APP_CONFIG.showRoadIntersections = !!saved.showRoadIntersections;
  // 🧭 Nav Intelligente (C2) : restaurer smartNav (pref globale, défaut OFF)
  if ("smartNav" in saved) APP_CONFIG.smartNav = !!saved.smartNav;
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
  // 🐛 v1.34.11 (Pack RAM Phase 2) — Libère la référence au ZIP source du
  // plan précédent. Sans ça, le JSZip + ses entrées compressées resteraient
  // en RAM jusqu'à la fin de la session. Sur un plan V2 avec 100 Mo de
  // tuiles, c'est 100 Mo qui ne sont JAMAIS libérés au plan switch.
  window._lazyZipRef = null;
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
  // 🐛 v1.34.11 (Pack RAM Phase 2) — Support pour stubs lazy tile (objet plain
  // avec `_lazyTile: true`, pas un File). Émis par extraireZip pour les tuiles
  // hors whitelist. Le blob n'est PAS extrait au boot, économie RAM importante.
  // Le blob sera extrait à la demande par _extractLazyAsset(path) au moment du
  // rendu via tiling.js > _renderNiveau.
  if (file && file._lazyTile === true) {
    window.RUNTIME_ASSETS[normalized] = {
      file: null,
      url: null,
      json: null,
      type: "binary",
      lazy: true,
      _zipPath: file._zipPath || file._fullPath || normalized
    };
    return;
  }
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

// 🐛 v1.34.11 (Pack RAM Phase 2) — Extrait à la demande une tuile depuis
// window._lazyZipRef. Appelée par tiling.js > _renderNiveau (avant le render
// loop, en pré-extract Promise.all parallèle sur toutes les tuiles du niveau).
// Met à jour RUNTIME_ASSETS[path].file = <new File>. Idempotent : si déjà
// extrait (file != null), retourne directement.
// Retourne le File extrait, ou null en cas d'erreur (zip manquant, entrée
// absente, etc.). En cas d'erreur, le caller doit gérer null gracieusement
// (= tuile manquante, comme avant v1.34.11).
async function _extractLazyAsset(logicalPath) {
  const normalized = normalizePath(logicalPath);
  const entry = window.RUNTIME_ASSETS[normalized];
  if (!entry) return null;                       // path inconnu
  if (entry.file) return entry.file;             // déjà extrait (cache hit)
  if (!entry._zipPath) return null;              // pas un stub lazy
  if (!window._lazyZipRef) {
    console.warn("[LazyTiles] _lazyZipRef indisponible — extraction impossible pour", logicalPath);
    return null;
  }
  const zipEntry = window._lazyZipRef.files[entry._zipPath];
  if (!zipEntry) {
    console.warn("[LazyTiles] Entrée ZIP introuvable :", entry._zipPath);
    return null;
  }
  try {
    const blob = await zipEntry.async("blob");
    const fileName = entry._zipPath.split("/").pop();
    const file = new File([blob], fileName, { type: "image/jpeg" });
    file._fullPath = entry._zipPath;
    entry.file = file;
    return file;
  } catch(e) {
    console.warn("[LazyTiles] Échec extraction :", entry._zipPath, e);
    return null;
  }
}
window._extractLazyAsset = _extractLazyAsset;

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
    availableLevels:  [-2, -1, 0, 1, 2]
  };

  // Restaurer les préférences GLOBALES depuis localStorage
  // (perfPreset est désormais par plan — résolu côté loader/main.js)
  // 🆕 v1.9.2 : on lit aussi scaledMarkers et showRoadIntersections ici
  // pour qu'ils survivent au plan switch (APP_CONFIG = { ...cfg } écrase
  // sinon ces flags entre 2 plans).
  try {
    const saved = JSON.parse(localStorage.getItem("app_user_prefs") || "{}");
    if ("debugMode"             in saved) cfg.debugMode             = !!saved.debugMode;
    if ("scaledMarkers"         in saved) cfg.scaledMarkers         = !!saved.scaledMarkers;
    if ("showRoadIntersections" in saved) cfg.showRoadIntersections = !!saved.showRoadIntersections;
    if ("smartNav"              in saved) cfg.smartNav              = !!saved.smartNav;
  } catch(e) {}

  // Fallback aux valeurs par défaut si absentes des prefs (= user a jamais
  // touché le toggle → on prend le default true). Sans ce fallback, le
  // champ resterait undefined et la check `!== false` le traiterait comme
  // truthy — fonctionnel mais moins explicite.
  if (cfg.scaledMarkers === undefined)         cfg.scaledMarkers         = DEFAULT_CONFIG.scaledMarkers !== false;
  if (cfg.showRoadIntersections === undefined) cfg.showRoadIntersections = DEFAULT_CONFIG.showRoadIntersections !== false;
  if (cfg.smartNav === undefined)              cfg.smartNav              = DEFAULT_CONFIG.smartNav === true;  // défaut OFF

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
    existing.debugMode             = !!APP_CONFIG.debugMode;
    existing.scaledMarkers         = APP_CONFIG.scaledMarkers !== false;          // v174 : default true
    existing.showRoadIntersections = APP_CONFIG.showRoadIntersections !== false;  // 🆕 v1.9.2 : default true
    existing.smartNav              = APP_CONFIG.smartNav === true;                 // 🧭 Nav C2 : default false
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
// HELPER : TOGGLE AFFICHAGE CERCLES D'INTERSECTION (v1.9.2)
// =========================
// Setter unifié appelé par les 2 toggles (⚙️ Réglages map mode + ⚙️
// Configuration loader). Met à jour APP_CONFIG, persiste, et re-render
// les roads à chaud si on est en mode carte (renderRoads dispo).
// Pas de reload nécessaire — l'effet est immédiat.
function setShowRoadIntersections(value) {
  const newValue = !!value;
  APP_CONFIG.showRoadIntersections = newValue;
  window.APP_CONFIG = APP_CONFIG;
  sauvegarderPrefsUtilisateur();
  console.log("[Config] showRoadIntersections →", APP_CONFIG.showRoadIntersections);
  // Re-render des roads à chaud — disponible UNIQUEMENT en mode carte
  // (après chargement d'un plan). Skip silencieux si appelé depuis le
  // loader (renderRoads pas encore défini).
  if (typeof window.renderRoads === "function") {
    try { window.renderRoads(); } catch(e) {
      console.warn("[Config] renderRoads() failed:", e);
    }
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
window.setShowRoadIntersections    = setShowRoadIntersections;
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
