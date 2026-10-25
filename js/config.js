/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * https://myktamap.fr — Licence CC BY-NC-SA 4.0
 * Usage commercial interdit sans accord ecrit prealable. Voir LICENSE.
 */

// =========================
// config.js — configuration de l'app : DEFAULT_CONFIG / APP_CONFIG, préférences globales (`app_user_prefs`),
// réglages par plan (`myktamap_plan_prefs_<planId>`), assets d'un ZIP importé, lecture bornée d'un plan-config.
// Expose : DEFAULT_CONFIG, APP_CONFIG, KTA_TRACKING_USINE, buildAppConfigFromPlan, loadAppConfig,
//          ktaAssainirPlanConfig, getPlan*/setPlan*, appliquer*PerPlan, setGlobalPodometre…
// Pièges : 🩸 DEFAULT_CONFIG est RÉÉCRIT à chaque plan (resetConfig rend le plan courant) : un générateur lit
//          KTA_TRACKING_USINE, jamais DEFAULT_CONFIG.
//          🩸 Podomètre (foulée, seuil, cooldown) = réglage GLOBAL de l'appareil, jamais lu dans un plan-config.
//          🩸 Prefs OFF par défaut : les lecteurs testent `=== true`, jamais `!== false` (undefined rallume).
//          🩸 Réglages par plan appliqués APRÈS la pose de _currentLoadedPlanId (appliquer*PerPlan).
// Garde-fous : check-tracking-defaults.js, check-podometre-global.js, check-plan-config-borne.js,
//              check-prefs-survival.js, check-portee-reglages.js · Doc : docs/architecture/data-formats.md
// =========================

// ── Migrations de préférences ──────────────────────
// Anciennes clés `motionDebug` → `debugMode` ; `perfMode` global supprimé (perfPreset est par plan). Idempotent.
(function _migrerPrefsUtilisateur() {
  try {
    const raw = localStorage.getItem("app_user_prefs");
    if (!raw) return;
    const saved = JSON.parse(raw);
    let changed = false;

    if ("motionDebug" in saved) {
      if (!("debugMode" in saved)) saved.debugMode = !!saved.motionDebug;
      delete saved.motionDebug;
      changed = true;
    }

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

// Batterie = fonctionnalité optionnelle, OFF pour tous. 🩸 sauvegarderPrefsUtilisateur écrit toutes les clés : un
// défaut changé ne touche pas les installations qui l'ont stockée à `true`. Éteinte UNE fois (marqueur) ;
// l'utilisateur peut la rallumer, on n'y revient plus.
(function _migrerOptionnels() {
  const MARQUEUR = "myktamap_optionnels_migres_v1";
  try {
    if (localStorage.getItem(MARQUEUR)) return;
    const raw = localStorage.getItem("app_user_prefs");
    if (raw) {
      const saved = JSON.parse(raw);
      if (saved.batterieEnabled === true) {
        saved.batterieEnabled = false;
        localStorage.setItem("app_user_prefs", JSON.stringify(saved));
        console.log("[Config] Batterie passée en fonctionnalité optionnelle (OFF)");
      }
    }
    localStorage.setItem(MARQUEUR, "1");
  } catch(e) {
    console.warn("[Config] Échec migration fonctionnalités optionnelles :", e);
  }
})();

// ── DEFAULT_CONFIG ──────────────────────
// ⚠️ MUTABLE : mis à jour à chaque chargement de plan pour que resetConfig() rende la config du plan courant.
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

  // Taille des icônes adaptée au zoom (sinon taille écran fixe, énormes au dézoom). Lu à creerIcones et au hook
  // zoom d'initMapFromConfig : changement = rechargement du plan.
  scaledMarkers: true,

  // Cercles aux intersections de tracés (road.js > renderRoads), à chaud sans reload.
  // ⚠️ OFF par défaut (décision produit) : _calculerIntersectionsRoads pose aussi un cercle quand une EXTRÉMITÉ
  // passe à moins de ROAD_PROXIMITY_TOLERANCE d'un segment voisin — deux tracés qui se frôlent affichent un faux
  // contact. Décision D0 : docs/DECISIONS_FERMEES.md.
  showRoadIntersections: false,

  // Nav intelligente (map-matching du tracker sur les tracés), lue à chaud par tracking.js > avancer(). Réglée PAR
  // PLAN (getPlanSmartNav) : la valeur globale n'est qu'un repli de migration. Sans réseau : sans effet
  // (RoadGraph.isReady()).
  smartNav: false,
  smartNavRadiusM:       6,    // tolérance latérale du verrou sur tracé (m)
  smartNavHeadingWeight: 0.7,  // poids du cap aux croisements (px/°)

  // Magnétisme au dessin (road.js > mousedown), pref GLOBALE, OFF par défaut.
  // ⚠️ INDÉPENDANT de smartNav malgré le rangement commun dans Réglages : il améliore le GRAPHE, donc sert aussi
  // au Pathfinder même nav intelligente OFF.
  snapDraw:   false,
  // Panneaux d'outils centrés par défaut : ancrés au bouton, ils passent sous le footer sur téléphone quand la liste
  // s'allonge (un plan importé ajoute un type par niveau).
  panneauxAncres: false,
  // Boutons de zoom +/− sur les cartes (plan, widget OSM, Vue OSM). OFF : on zoome au doigt ou à la molette.
  zoomBoutons: false,
  snapDrawPx: 14,   // ⚠️ rayon d'accrochage en pixels ÉCRAN, converti en unités plan au clic selon le zoom

  // Orientation du Nord, en degrés. ⚠️ 0° = Nord vers le HAUT du plan, croissant dans le sens HORAIRE (flèche Nord
  // vers la droite = 90°). Cascade getPlanNorthOffset() : LS myktamap_plan_prefs_<planId>.northOffsetDeg →
  // plan-config `plan.northOffsetDeg` → 0. Appliqué au cap du tracker, à la boussole et à la rose du header.
  northOffsetDeg: 0,

  // Vibration (window.kta_vibrate, point d'entrée unique), masquée si navigator.vibrate manque (iOS).
  // OFF par défaut (décision produit : surprend, et coûte de la batterie sous terre).
  // 🩸 Un défaut à false ne suffit pas : un test `!== false` rend vrai sur `undefined`. Lecteurs : `=== true`.
  vibrationEnabled: false,
  // Fonctionnalités optionnelles OFF par défaut (batterie, vibration, replay, heatmap), activables dans
  // Configuration › Fonctionnalités optionnelles. Lecteurs : `=== true`. Batterie : voir _migrerOptionnels.
  batterieEnabled: false,
  // Tuiles Replay et Heatmap du menu Tracker. ⚠️ Le module heatmap reste CHARGÉ option OFF : le Mode Secours s'en
  // sert indépendamment.
  replayEnabled: false,
  heatmapEnabled: false,

  // ── Multi-niveau (opt-in par plan : PlanRegistry[planId].multiLevel) ──────
  multiLevel:       false,
  activeLevel:      0,               // ⚠️ niveau où l'on DESSINE ; 0 = référence (objets sans `level`),
                                     // négatifs = sous-sols
  visibleLevels:    [0],             // niveaux AFFICHÉS ; une jonction s'affiche si fromLevel ou toLevel y est
  availableLevels:  [-2, -1, 0, 1, 2] // niveaux du sélecteur, extensibles (-/+), auto-étendus par main.js aux
                                     // niveaux trouvés dans les données
};

// 🩸 Réglages de podomètre figés à leur valeur d'usine, AVANT la première mutation de DEFAULT_CONFIG (réécrit à
// chaque plan). Les générateurs (SIG, GPX) écrivent CETTE copie, jamais un littéral : un seuil à 1,2 (au lieu de
// 13) est toujours dépassé par accelerationIncludingGravity (~9,81 téléphone posé) et fabrique des pas à l'arrêt.
const TRACKING_USINE = Object.freeze({
  stepLength:    DEFAULT_CONFIG.stepLength,
  stepThreshold: DEFAULT_CONFIG.stepThreshold,
  stepCooldown:  DEFAULT_CONFIG.stepCooldown
});
window.KTA_TRACKING_USINE = TRACKING_USINE;

let APP_CONFIG = { ...DEFAULT_CONFIG };

// Prefs globales restaurées dès le chargement, avant tout plan (le loader les lit/écrit sans plan ouvert ;
// scaledMarkers et showRoadIntersections doivent précéder creerIcones / renderRoads).
try {
  const saved = JSON.parse(localStorage.getItem("app_user_prefs") || "{}");
  if ("debugMode" in saved) APP_CONFIG.debugMode = !!saved.debugMode;
  if ("vibrationEnabled" in saved) APP_CONFIG.vibrationEnabled = !!saved.vibrationEnabled;
  if ("batterieEnabled" in saved) APP_CONFIG.batterieEnabled = !!saved.batterieEnabled;
  if ("replayEnabled" in saved) APP_CONFIG.replayEnabled = !!saved.replayEnabled;
  if ("heatmapEnabled" in saved) APP_CONFIG.heatmapEnabled = !!saved.heatmapEnabled;
  if ("scaledMarkers" in saved) APP_CONFIG.scaledMarkers = !!saved.scaledMarkers;
  if ("showRoadIntersections" in saved) APP_CONFIG.showRoadIntersections = !!saved.showRoadIntersections;
  if ("smartNav" in saved) APP_CONFIG.smartNav = !!saved.smartNav;
  if (Number.isFinite(saved.smartNavRadiusM))       APP_CONFIG.smartNavRadiusM       = saved.smartNavRadiusM;
  if (Number.isFinite(saved.smartNavHeadingWeight)) APP_CONFIG.smartNavHeadingWeight = saved.smartNavHeadingWeight;
  if ("snapDraw" in saved) APP_CONFIG.snapDraw = !!saved.snapDraw;
  if ("panneauxAncres" in saved) APP_CONFIG.panneauxAncres = !!saved.panneauxAncres;
  if ("zoomBoutons" in saved) APP_CONFIG.zoomBoutons = !!saved.zoomBoutons;
  if (Number.isFinite(saved.snapDrawPx) && saved.snapDrawPx > 0) APP_CONFIG.snapDrawPx = saved.snapDrawPx;
  // Podomètre GLOBAL : la foulée est celle de la personne, seuil et cooldown ceux du téléphone — jamais une
  // propriété du plan (décision produit).
  _appliquerPodometreGlobal(APP_CONFIG, saved);
} catch(e) {}

// ── Assets d'un ZIP importé (import navigateur) ──────────────────────
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

function resetRuntimeAssets() {
  Object.values(window.RUNTIME_ASSETS).forEach(function(entry) {
    if (entry?.url?.startsWith("blob:")) {
      try { URL.revokeObjectURL(entry.url); } catch(e) {}
    }
  });
  window.RUNTIME_ASSETS  = {};
  window.PLAN_CONFIG     = null;
  // 🩸 Référence au ZIP source libérée : sinon le JSZip et ses entrées (100 Mo de tuiles V2) restent en RAM.
  window._lazyZipRef = null;
}

function findMatchingFile(logicalPath, files) {
  const base = getBaseName(logicalPath);
  const normalizedLogical = normalizePath(logicalPath);
  for (const file of files) {
    const name = normalizePath(file.name);
    if (name === normalizedLogical || name === base) return file;
    // 🩸 Aussi via `_fullPath` (posé par extraireZip) : iOS Safari retire les `/` de File.name, et
    // `x0_y-1.jpg` seul est partagé par plusieurs niveaux de zoom.
    if (file._fullPath && normalizePath(file._fullPath) === normalizedLogical) return file;
  }
  return null;
}

async function registerAsset(logicalPath, file, opts) {
  const normalized = normalizePath(logicalPath);
  // Stub de tuile paresseuse (objet `_lazyTile: true`, pas un File, émis par extraireZip) : blob extrait au rendu
  // seulement (_extractLazyAsset, appelé par tiling.js > _renderNiveau).
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
  // opts.lazy (tuiles, 1000+ possibles) : pas de blob URL ici, créée à la demande (tiling.js > _resoudreUrlTuileLazy).
  if (lower.endsWith(".json")) {
    const text = await file.text();
    const parsed = JSON.parse(text);
    const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
    window.RUNTIME_ASSETS[normalized] = { file, url, json: parsed, type: "json" };
  } else if (opts && opts.lazy === true) {
    window.RUNTIME_ASSETS[normalized] = { file, url: null, json: null, type: "binary", lazy: true };
  } else {
    const url = URL.createObjectURL(file);
    window.RUNTIME_ASSETS[normalized] = { file, url, json: null, type: "binary" };
  }
}

// Extrait à la demande une tuile depuis window._lazyZipRef (tiling.js > _renderNiveau, en Promise.all sur le
// niveau) et pose RUNTIME_ASSETS[path].file. Idempotent.
// ⚠️ Rend le File, ou null (ZIP ou entrée absents) : l'appelant traite null comme une tuile manquante.
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
  ktaAssainirPlanConfig(resolved, "plan importé");   // 🔒 hoisting : défini plus bas
  if (resolved.plan?.baseImage)
    resolved.plan.baseImage = getRuntimeAssetUrl(resolved.plan.baseImage) || resolved.plan.baseImage;
  if (resolved.plan?.collisionImage)
    resolved.plan.collisionImage = getRuntimeAssetUrl(resolved.plan.collisionImage) || resolved.plan.collisionImage;
  // PDF(s) du Mode Histoire (`plan.histoirePdf`, `plan.histoirePdfs`) résolus en blob URL (js/modeHistoire.js).
  if (resolved.plan?.histoirePdf)
    resolved.plan.histoirePdf = getRuntimeAssetUrl(resolved.plan.histoirePdf) || resolved.plan.histoirePdf;
  if (Array.isArray(resolved.plan?.histoirePdfs))
    resolved.plan.histoirePdfs = resolved.plan.histoirePdfs.map(function(p) {
      return getRuntimeAssetUrl(p) || p;
    });
  if (Array.isArray(resolved.imageLayers))
    resolved.imageLayers = resolved.imageLayers.map(function(l) {
      return { ...l, file: getRuntimeAssetUrl(l.file) || l.file };
    });
  if (Array.isArray(resolved.dataLayers))
    resolved.dataLayers = resolved.dataLayers.map(function(l) {
      return { ...l, file: getRuntimeAssetUrl(l.file) || l.file };
    });
  // Icônes embarquées dans le ZIP (main.js les enregistre) → blob URL ; une icône de l'app garde son chemin.
  if (resolved.icons && typeof resolved.icons === "object")
    Object.keys(resolved.icons).forEach(function(tag) {
      const v = resolved.icons[tag];
      if (typeof v === "string" && v) resolved.icons[tag] = getRuntimeAssetUrl(v) || v;
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

// Angle quelconque → [0, 360[ (tolère string, null, NaN, négatif). Pour northOffsetDeg, défense en profondeur.
function _normalizeAngleDeg(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  let a = n % 360;
  if (a < 0) a += 360;
  return a;
}

// 🩸 Aucune valeur numérique d'un plan-config n'entre hors bornes : `scale` à 0 rend toute distance infinie (NaN
// si non numérique), des dimensions ≤ 0 cassent convertCoord et les bounds, un départ hors plan place le tracker
// hors carte. Critère : ce que l'écran de saisie REFUSE (setPlanScale > 0, cfg_scale `strict: true`) n'est pas un
// choix de l'user mais de la donnée corrompue → valeur d'usine, dite dans la console (garde-fou :
// check-plan-config-borne.js).
function _lireNombrePlan(brut, defaut, bornes, nom) {
  const v = Number(brut ?? defaut);
  const b = bornes || {};
  const ok = Number.isFinite(v)
             && (b.min === undefined || v >= b.min)
             && (b.max === undefined || v <= b.max)
             && (!b.positif || v > 0);
  if (ok) return v;
  console.warn("[Config] 🩸 " + nom + " hors bornes dans le plan-config (" +
               JSON.stringify(brut) + ") → valeur d'usine (" + defaut + ")");
  return Number(defaut);
}

// ── Construction d'APP_CONFIG depuis un plan ──────────────────────
function buildAppConfigFromPlan(planConfig) {
  const plan     = planConfig?.plan     || {};
  const tracking = planConfig?.tracking || {};

  const cfg = {
    imageHeight:   _lireNombrePlan(plan.imageHeight, DEFAULT_CONFIG.imageHeight, { positif: true }, "imageHeight"),
    imageWidth:    _lireNombrePlan(plan.imageWidth,  DEFAULT_CONFIG.imageWidth,  { positif: true }, "imageWidth"),
    // 🩸 L'échelle recalibrée par plan n'est PAS appliquée ici : on tourne AVANT la pose de _currentLoadedPlanId,
    // on lirait celle du plan PRÉCÉDENT. C'est appliquerScalePerPlan() (lancerApplication) qui s'en charge.
    scale:         _lireNombrePlan(tracking.scale, DEFAULT_CONFIG.scale, { positif: true }, "scale"),
    // 🩸 Le plan ne dit PAS la foulée : stepLength/stepThreshold/stepCooldown d'un plan-config sont IGNORÉS, même
    // présents (des générateurs ont écrit un seuil à 1,2 qui compte des pas à l'arrêt). Ce sont des réglages de la
    // personne et de son téléphone, globaux (app_user_prefs, appliqués plus bas).
    stepLength:    TRACKING_USINE.stepLength,
    startX:        _lireNombrePlan(tracking.startX, DEFAULT_CONFIG.startX, { min: 0 }, "startX"),
    startY:        _lireNombrePlan(tracking.startY, DEFAULT_CONFIG.startY, { min: 0 }, "startY"),
    stepThreshold: TRACKING_USINE.stepThreshold,
    stepCooldown:  TRACKING_USINE.stepCooldown,
    // `debugMode`, repli sur l'ancien `motionDebug` des plans non migrés.
    debugMode:     Boolean(tracking.debugMode ?? tracking.motionDebug ?? DEFAULT_CONFIG.debugMode),
    perfPreset:    DEFAULT_CONFIG.perfPreset,

    // Multi-niveau : défauts au chargement. multiLevel est ensuite écrasé par main.js (PlanRegistry) ;
    // activeLevel/visibleLevels repartent toujours de 0 / [0] au changement de plan.
    multiLevel:       false,
    activeLevel:      0,
    visibleLevels:    [0],
    availableLevels:  [-2, -1, 0, 1, 2],

    // plan.northOffsetDeg normalisé dans [0, 360[, 0 si absent.
    northOffsetDeg:   _normalizeAngleDeg(plan.northOffsetDeg)
  };

  // 🩸 Le départ doit tomber DANS le plan : le plafond dépend des dimensions, connues seulement ici. Hors plan →
  // centre (défaut documenté dans README_USER).
  if (cfg.startX > cfg.imageWidth || cfg.startY > cfg.imageHeight) {
    console.warn("[Config] 🩸 départ du tracker hors du plan (" + cfg.startX + ", " +
                 cfg.startY + " pour " + cfg.imageWidth + "x" + cfg.imageHeight +
                 ") → recentré");
    cfg.startX = Math.round(cfg.imageWidth  / 2);
    cfg.startY = Math.round(cfg.imageHeight / 2);
  }

  // 🩸 Prefs GLOBALES relues ici : APP_CONFIG est RECONSTRUIT à chaque plan, et toute pref absente de cette liste
  // retombe en silence sur DEFAULT_CONFIG (ex. le magnétisme repassait OFF à l'ouverture du plan, la vibration
  // aussi, puis la première sauvegarde écrasait le choix). ⚠️ Toute nouvelle pref globale va aux DEUX endroits :
  // restauration au boot (plus haut) ET cette liste (check-prefs-survival.js). perfPreset est par plan (main.js).
  try {
    const saved = JSON.parse(localStorage.getItem("app_user_prefs") || "{}");
    if ("debugMode"             in saved) cfg.debugMode             = !!saved.debugMode;
    if ("scaledMarkers"         in saved) cfg.scaledMarkers         = !!saved.scaledMarkers;
    if ("showRoadIntersections" in saved) cfg.showRoadIntersections = !!saved.showRoadIntersections;
    if ("smartNav"              in saved) cfg.smartNav              = !!saved.smartNav;
    if (Number.isFinite(saved.smartNavRadiusM))       cfg.smartNavRadiusM       = saved.smartNavRadiusM;
    if (Number.isFinite(saved.smartNavHeadingWeight)) cfg.smartNavHeadingWeight = saved.smartNavHeadingWeight;
    if ("snapDraw" in saved) cfg.snapDraw = !!saved.snapDraw;
    if ("panneauxAncres" in saved) cfg.panneauxAncres = !!saved.panneauxAncres;
    if ("zoomBoutons" in saved) cfg.zoomBoutons = !!saved.zoomBoutons;
    if ("batterieEnabled" in saved) cfg.batterieEnabled = !!saved.batterieEnabled;
    if ("vibrationEnabled" in saved) cfg.vibrationEnabled = !!saved.vibrationEnabled;
    if ("replayEnabled" in saved) cfg.replayEnabled = !!saved.replayEnabled;
    if ("heatmapEnabled" in saved) cfg.heatmapEnabled = !!saved.heatmapEnabled;
    // ⚠️ smartNav* lus ci-dessus seulement comme REPLI de migration : la nav intelligente est réglée PAR PLAN
    // (getPlanSmartNav, au chargement du plan).
    if (Number.isFinite(saved.snapDrawPx) && saved.snapDrawPx > 0) cfg.snapDrawPx = saved.snapDrawPx;
    _appliquerPodometreGlobal(cfg, saved);
  } catch(e) {}

  // Défauts explicites pour les prefs jamais touchées. 🩸 Défaut ON → `!== false` ; défaut OFF → `=== true`
  // (`!== false` rendrait vrai sur undefined).
  if (cfg.scaledMarkers === undefined)         cfg.scaledMarkers         = DEFAULT_CONFIG.scaledMarkers !== false;
  if (cfg.showRoadIntersections === undefined) cfg.showRoadIntersections = DEFAULT_CONFIG.showRoadIntersections === true;
  if (cfg.smartNav === undefined)              cfg.smartNav              = DEFAULT_CONFIG.smartNav === true;  // défaut OFF
  if (cfg.snapDraw === undefined)              cfg.snapDraw              = DEFAULT_CONFIG.snapDraw === true;  // défaut OFF
  if (!Number.isFinite(cfg.snapDrawPx))        cfg.snapDrawPx            = DEFAULT_CONFIG.snapDrawPx;
  if (cfg.panneauxAncres === undefined)        cfg.panneauxAncres        = DEFAULT_CONFIG.panneauxAncres === true;
  if (cfg.zoomBoutons === undefined)           cfg.zoomBoutons           = DEFAULT_CONFIG.zoomBoutons === true;  // défaut OFF
  if (cfg.batterieEnabled === undefined)       cfg.batterieEnabled       = DEFAULT_CONFIG.batterieEnabled === true;
  if (cfg.vibrationEnabled === undefined)      cfg.vibrationEnabled      = DEFAULT_CONFIG.vibrationEnabled === true;
  if (cfg.replayEnabled === undefined)         cfg.replayEnabled         = DEFAULT_CONFIG.replayEnabled === true;
  if (cfg.heatmapEnabled === undefined)        cfg.heatmapEnabled        = DEFAULT_CONFIG.heatmapEnabled === true;

  return cfg;
}

// ── Chargement serveur (data/plan-config.json ou <dossier>/plan-config.json) ──────────────────────
// loadAppConfig() → data/plan-config.json · loadAppConfig("data/x") → data/x/plan-config.json, chemins résolus
// relativement au dossier.

// Résout un chemin du plan-config relativement au dossier du plan : http(s)/blob/data et chemins absolus tels quels.
function resolveServerPath(p, baseDir) {
  if (!p) return p;
  if (/^(https?:|blob:|data:)/.test(p)) return p;
  if (p.charAt(0) === "/") return p;
  const base = String(baseDir || "").replace(/\/$/, "");

  // 🩸 `data/…` est relatif au ZIP, pas à la racine du site : déployé dans `data/x/`, le fichier est à
  // `data/x/data/…`. Préfixé par le dossier du plan, SAUF s'il le contient déjà (déploiements réécrits à la main).
  // baseDir === "data" est traité en amont (resolveServerPaths ne réécrit rien).
  if (p.indexOf("data/") === 0) {
    return (base && base !== "data" && p.indexOf(base + "/") !== 0) ? base + "/" + p : p;
  }

  // 🩸 `icon/…` reste TOUJOURS à la racine ici. Ne PAS deviner par catalogue : TAGS_BUILTIN liste des tags de POI,
  // pas toutes les icônes de l'app (icon/iconetrack.png n'y est pas → 404 du tracker). Savoir si le fichier est
  // dans le dossier du plan exige une requête : c'est resoudreIconesPlanServeur, en asynchrone.
  if (p.indexOf("icon/") === 0) return p;

  // 🩸 Dossiers de l'application, jamais relatifs à un plan (icons.default = lib/leaflet/images/marker-icon.png :
  // préfixé, l'icône par défaut de tous les points sans tag tomberait en 404).
  if (/^(lib|css|js|docs|assets)\//.test(p)) return p;

  // 🩸 Nom de fichier nu = `<dossier du plan>/data/<nom>` : d'anciens importeurs SIG/GPX/KMZ déclaraient les
  // fichiers sans préfixe (invisible en import local, où findMatchingFile cherche par nom de base ; 404 en mode
  // serveur). ⚠️ Ce n'est pas une sonde : dans un ZIP de l'app, un asset est TOUJOURS sous `data/` ou `icon/`.
  if (base && base !== "data" && p.indexOf("/") < 0) return base + "/data/" + p;

  return base + "/" + p;
}

// 🩸 Une valeur d'icône qui n'est pas un chemin n'en devient pas un. Cas réel : le LIBELLÉ « Icône SVG intégrée à
// l'application » écrit à la place du data-URI ; la règle « nom nu » en fait une URL morte qui GAGNE sur le
// catalogue (PLAN_CONFIG.icons prime dans utils.js) → marqueurs vides et un 404 chacun. Règle : data-URI image,
// blob:, ou fichier à extension d'image ; le reste est ignoré et le catalogue reprend la main.
// ⚠️ Seule la config en mémoire est nettoyée (le warn dit quel plan régénérer).
// 🔒 La valeur finit dans `src="…"` : tout caractère qui sort d'un attribut ou d'une URL (" < > ` \, contrôles)
// la rend impossible.
function ktaCheminIconePlausible(v) {
  if (typeof v !== "string") return false;
  const s = v.trim();
  if (!s || /["<>`\\\u0000-\u001f]/.test(s)) return false;   // ' admise : encodeURIComponent la laisse (SVG intégrés)
  if (s.indexOf("blob:") === 0) return true;
  if (s.indexOf("data:") === 0) return /^data:image\/[a-z0-9.+-]+[;,]/i.test(s);
  if (/^[a-z][a-z0-9+.-]*:/i.test(s) && !/^https?:/i.test(s)) return false;   // javascript:, file:…
  return /\.(png|jpe?g|svg|webp|gif|bmp|ico|avif)$/i.test(s);
}
window.ktaCheminIconePlausible = ktaCheminIconePlausible;

// 🔒 Plan-config et session viennent d'un fichier PARTAGÉ et finissent dans du HTML. Couleur : #hex,
// rgb/rgba/hsl/hsla numériques ou nom simple, sinon null (le canon reprend la main). Texte : sans < > " `.
function ktaCouleurSure(v) {
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (/^#[0-9a-f]{3,8}$/i.test(s)) return s;
  if (/^(rgb|rgba|hsl|hsla)\([0-9\s.,%deg]+\)$/i.test(s)) return s;
  if (/^[a-z]{3,20}$/i.test(s)) return s;
  return null;
}
function ktaTexteSur(v, max) {
  if (v === null || v === undefined) return v;
  return String(v).replace(/[<>"`]/g, "").slice(0, max || 200);
}
window.ktaCouleurSure = ktaCouleurSure;
window.ktaTexteSur = ktaTexteSur;

// Assainit un plan-config EN MÉMOIRE (le fichier n'est pas touché) : icônes, libellés et
// identifiants de calques, nom du plan. Appelé par les deux chemins d'ouverture (ZIP et site).
function ktaAssainirPlanConfig(config, ou) {
  if (!config || typeof config !== "object") return config;
  nettoyerIconesConfig(config, ou);
  if (config.plan && typeof config.plan === "object") {
    ["name", "author", "version"].forEach(function(k) {   // titre fixe de la carte, liste des plans
      if (typeof config.plan[k] === "string") config.plan[k] = ktaTexteSur(config.plan[k], 200);
    });
  }
  ["imageLayers", "dataLayers"].forEach(function(cle) {
    if (!Array.isArray(config[cle])) return;
    config[cle] = config[cle].filter(function(l) {
      if (!l || typeof l !== "object") return false;
      if (l.id !== undefined && !/^[\w.:-]{1,80}$/.test(String(l.id))) {
        console.warn("[Config] 🔒 calque à l'identifiant impossible ignoré (" + (ou || "plan") + ")");
        return false;
      }
      if (typeof l.label === "string") l.label = ktaTexteSur(l.label, 120);
      return true;
    });
  });
  return config;
}
window.ktaAssainirPlanConfig = ktaAssainirPlanConfig;

function nettoyerIconesConfig(config, ou) {
  if (!config || !config.icons || typeof config.icons !== "object") return config;
  // Ancienne porte du catalogue, écrite en data-URI SVG par le Générateur dans les plans d'avant le PNG : elle
  // figerait l'ancienne icône. Reconnue à sa forme (rien de personnel), retirée → le catalogue reprend la main.
  // ⚠️ Dans la fonction : check-* l'exécute seule dans un `vm`.
  const porte = config.icons.entree_plan;
  if (typeof porte === "string" && porte.indexOf("data:image/svg+xml") === 0) {
    let txt = porte;
    try { txt = decodeURIComponent(porte); } catch (e) { /* data-URI non encodée */ }
    if (txt.indexOf('<rect x="17" y="13" width="16" height="26"') !== -1 && txt.indexOf('fill="#f4c542"') !== -1) {
      delete config.icons.entree_plan;
    }
  }
  const morts = [];
  Object.keys(config.icons).forEach(function(k) {
    if (!ktaCheminIconePlausible(config.icons[k])) {
      morts.push(k + " = " + JSON.stringify(config.icons[k]));
      delete config.icons[k];
    }
  });
  if (morts.length) {
    console.warn("[Config] 🎨 " + morts.length + " icône(s) au chemin impossible ignorée(s)" +
                 (ou ? " (" + ou + ")" : "") + " — le catalogue de l'app reprend la main. " +
                 "Régénère ce plan pour nettoyer son plan-config : " + morts.join(" · "));
  }
  return config;
}

function resolveServerPaths(config, baseDir) {
  if (!baseDir || baseDir === "data") return config; // racine = pas de réécriture
  if (config.plan?.baseImage)      config.plan.baseImage      = resolveServerPath(config.plan.baseImage, baseDir);
  if (config.plan?.collisionImage) config.plan.collisionImage = resolveServerPath(config.plan.collisionImage, baseDir);
  (config.imageLayers || []).forEach(function(l) { if (l.file) l.file = resolveServerPath(l.file, baseDir); });
  (config.dataLayers  || []).forEach(function(l) { if (l.file) l.file = resolveServerPath(l.file, baseDir); });
  // Icônes : traitées ici aussi (sinon les icônes personnalisées du plan restent cherchées à la racine).
  if (config.icons && typeof config.icons === "object") {
    // 🩸 D'abord jeter ce qui n'est pas un chemin, sinon on fabrique une URL vers un fichier qui n'existe pas.
    nettoyerIconesConfig(config, "plan serveur " + baseDir);
    Object.keys(config.icons).forEach(function(k) {
      if (typeof config.icons[k] === "string") {
        config.icons[k] = resolveServerPath(config.icons[k], baseDir);
      }
    });
  }
  return config;
}


// ── Icônes personnalisées d'un plan serveur ──────────────────────
// `icon/` est ambigu : icônes de l'app (racine du site) OU ajoutées au générateur (dans le ZIP, donc
// `<dossier du plan>/icon/`). 🩸 Ne jamais deviner par catalogue (icon/iconetrack.png n'est pas dans TAGS_BUILTIN) :
// une icône n'est réécrite vers le dossier du plan que si elle s'y trouve VRAIMENT. Toute erreur (réseau, 404,
// CORS) laisse le chemin à la racine.
async function resoudreIconesPlanServeur(config, baseDir) {
  const base = String(baseDir || "").replace(/\/+$/, "");
  if (!config || !config.icons || !base || base === "data") return config;
  const cles = Object.keys(config.icons).filter(function (k) {
    const v = config.icons[k];
    return typeof v === "string" && v.indexOf("icon/") === 0;
  });
  if (!cles.length) return config;

  // `iconsEmbarquees` (écrit par createConf.js) : le producteur du ZIP DÉCLARE ce qu'il embarque → aucune sonde,
  // seules les icônes déclarées sont réécrites. 🩸 Sans le champ, une sonde par icône (souvent toutes en 404), en
  // await AVANT le rendu des marqueurs, à chaque ouverture. ⚠️ Ce n'est pas un catalogue deviné : c'est déclaré.
  if (Array.isArray(config.iconsEmbarquees)) {
    const dansZip = {};
    config.iconsEmbarquees.forEach(function (p) {
      if (typeof p === "string" && p) dansZip[p] = true;
    });
    let n = 0;
    cles.forEach(function (k) {
      if (dansZip[config.icons[k]]) { config.icons[k] = base + "/" + config.icons[k]; n++; }
    });
    console.log("[Config] Icônes : " + n + " propre(s) au plan, 0 requête de sondage " +
                "(le plan déclare ce qu'il embarque)");
    return config;
  }
  await Promise.all(cles.map(async function (k) {
    const local = base + "/" + config.icons[k];
    try {
      const r = await fetch(local);
      if (r && r.status === 200) {
        config.icons[k] = local;
        console.log("[Config] Icône propre au plan :", local);
      }
    } catch (e) { /* on garde la racine */ }
  }));
  return config;
}

// ⚠️ Exposé : planOffline.js doit énumérer EXACTEMENT les mêmes icônes que le chargement, sinon pré-cache et rendu
// divergent.
window.resoudreIconesPlanServeur = resoudreIconesPlanServeur;

async function loadAppConfig(planPath) {
  const baseDir   = planPath || "data";
  const configUrl = baseDir.replace(/\/$/, "") + "/plan-config.json";

  try {
    const response = await fetch(configUrl);
    if (!response.ok) throw new Error("HTTP " + response.status);
    let config = await response.json();
    if (!config?.plan) throw new Error("plan-config.json invalide");

    // 🔒 Libellés, calques et icônes assainis avant tout usage (les icônes le sont aussi par
    // resolveServerPaths, pour ses autres appelants).
    ktaAssainirPlanConfig(config, "plan serveur " + baseDir);
    config = resolveServerPaths(config, baseDir);

    // ⚠️ Await : le rendu des marqueurs lit config.icons juste après.
    config = await resoudreIconesPlanServeur(config, baseDir);

    // 🩸 Dossier du plan retenu pour le tuilage : les tuiles sont toujours dans `<plan>/data/tiles`, alors que
    // l'image dépend du déploiement (dériver la racine des tuiles de baseImage se trompe).
    config._baseDir = baseDir;

    window.PLAN_CONFIG = config;
    const cfg = buildAppConfigFromPlan(config);

    // ⚠️ DEFAULT_CONFIG muté EN PLACE : resetConfig() rend les valeurs du plan.
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

// ── Sauvegarde des préférences globales ──────────────────────
// Prefs GLOBALES seulement ; les prefs par plan passent par PlanRegistry ou myktamap_plan_prefs_<planId>.
function sauvegarderPrefsUtilisateur() {
  try {
    // Relu d'abord : les clés inconnues éventuelles ne sont pas écrasées.
    const existing = JSON.parse(localStorage.getItem("app_user_prefs") || "{}");
    existing.debugMode             = !!APP_CONFIG.debugMode;
    existing.scaledMarkers         = APP_CONFIG.scaledMarkers !== false;          // défaut ON
    existing.showRoadIntersections = APP_CONFIG.showRoadIntersections === true;   // défaut OFF
    existing.smartNav              = APP_CONFIG.smartNav === true;                 // défaut OFF
    if (Number.isFinite(APP_CONFIG.smartNavRadiusM))       existing.smartNavRadiusM       = APP_CONFIG.smartNavRadiusM;
    if (Number.isFinite(APP_CONFIG.smartNavHeadingWeight)) existing.smartNavHeadingWeight = APP_CONFIG.smartNavHeadingWeight;
    existing.snapDraw              = APP_CONFIG.snapDraw === true;
    existing.zoomBoutons           = APP_CONFIG.zoomBoutons === true;           // défaut OFF
    existing.panneauxAncres        = APP_CONFIG.panneauxAncres === true;        // défaut centré
    existing.vibrationEnabled      = APP_CONFIG.vibrationEnabled === true;      // défaut OFF
    existing.batterieEnabled       = APP_CONFIG.batterieEnabled === true;       // défaut OFF
    existing.replayEnabled         = APP_CONFIG.replayEnabled === true;         // défaut OFF
    existing.heatmapEnabled        = APP_CONFIG.heatmapEnabled === true;        // défaut OFF
    if (Number.isFinite(APP_CONFIG.snapDrawPx) && APP_CONFIG.snapDrawPx > 0) existing.snapDrawPx = APP_CONFIG.snapDrawPx;
    localStorage.setItem("app_user_prefs", JSON.stringify(existing));
  } catch(e) {}
}

// Point d'entrée unique du flag debug (bouton du loader et Réglages).
function setDebugMode(value) {
  const newValue = !!value;
  const wasOff = !APP_CONFIG.debugMode;
  APP_CONFIG.debugMode = newValue;
  window.APP_CONFIG = APP_CONFIG;
  sauvegarderPrefsUtilisateur();
  console.log("[Config] debugMode →", APP_CONFIG.debugMode);

  // Passage OFF → ON : toast copyright (confirme le mode debug, rappelle la licence), sans exiger F12 ouvert.
  if (newValue && wasOff && typeof window.__MKM_showWarning__ === "function") {
    window.__MKM_showWarning__("debug-activated");
  }
}

// ── Réglages par plan (myktamap_plan_prefs_<planId>, JSON) ──────────────────────
// Cercles d'intersection : par plan, avec repli sur la pref globale app_user_prefs.showRoadIntersections tant que
// le plan n'a pas la sienne (le choix existant est gardé).
const PLAN_PREFS_KEY_PREFIX = "myktamap_plan_prefs_";

function _planPrefsKey(planId) {
  return PLAN_PREFS_KEY_PREFIX + (planId || "default");
}

function _readPlanPrefs(planId) {
  try {
    const raw = localStorage.getItem(_planPrefsKey(planId));
    if (!raw) return {};
    const obj = JSON.parse(raw);
    return (obj && typeof obj === "object") ? obj : {};
  } catch(e) { return {}; }
}

function _writePlanPrefs(planId, prefs) {
  try {
    localStorage.setItem(_planPrefsKey(planId), JSON.stringify(prefs || {}));
  } catch(e) { console.warn("[Config] writePlanPrefs failed:", e); }
}

// Cascade (boolean) : pref du plan → pref globale → false. Un choix explicite (plan ou global) est gardé.
function getPlanShowsIntersections(planId) {
  const pid = planId || window._currentLoadedPlanId || "default";
  const prefs = _readPlanPrefs(pid);
  if (typeof prefs.showRoadIntersections === "boolean") {
    return prefs.showRoadIntersections;
  }
  if (window.APP_CONFIG && typeof window.APP_CONFIG.showRoadIntersections === "boolean") {
    return window.APP_CONFIG.showRoadIntersections;
  }
  return false;
}

// Écrit pour le plan et re-rend à chaud (case des Réglages de la carte).
function setPlanShowsIntersections(planId, value) {
  const pid = planId || window._currentLoadedPlanId || "default";
  const newValue = !!value;
  const prefs = _readPlanPrefs(pid);
  prefs.showRoadIntersections = newValue;
  _writePlanPrefs(pid, prefs);
  console.log("[Config] showRoadIntersections (plan " + pid + ") →", newValue);
  if (typeof window.renderRoads === "function") {
    try { window.renderRoads(); } catch(e) {
      console.warn("[Config] renderRoads() failed:", e);
    }
  }
}

// Fond sous un plan TRANSPARENT (PNG/WebP/tuiles alpha), par plan car il dépend du dessin. Cascade : pref
// `fondPlan` → `plan.fondConseille` (Générateur) → « auto » (noir, beige en thème clair). Sur un plan opaque, il
// ne se voit qu'au-delà des bords et pendant le chargement des tuiles.
const FONDS_PLAN = { noir: "#000000", blanc: "#ffffff", gris: "#808080" };
// Choix explicite de l'utilisateur pour ce plan ("" = pas de choix : conseil du plan, sinon thème).
function getPlanFondChoisi(planId) {
  const pid = planId || window._currentLoadedPlanId || "default";
  const v = _readPlanPrefs(pid).fondPlan;
  return FONDS_PLAN[v] ? v : "";
}
// Fond conseillé par le plan chargé ("" si aucun).
function getPlanFondConseille() {
  const c = window.PLAN_CONFIG && window.PLAN_CONFIG.plan && window.PLAN_CONFIG.plan.fondConseille;
  return FONDS_PLAN[c] ? c : "";
}
// Fond effectif : "noir" | "blanc" | "gris" | "auto".
function getPlanFond(planId) {
  return getPlanFondChoisi(planId) || getPlanFondConseille() || "auto";
}
// Couleur du fond effectif (null en « auto ») — sert aussi de fond par défaut à l'export image.
function ktaCouleurFondPlan() {
  return FONDS_PLAN[getPlanFond()] || null;
}
function ktaAppliquerFondPlan() {
  const b = document.body; if (!b) return;
  Object.keys(FONDS_PLAN).forEach(function (k) { b.classList.remove("kta-fond-" + k); });
  const f = getPlanFond();
  if (FONDS_PLAN[f]) b.classList.add("kta-fond-" + f);
}
function setPlanFond(planId, valeur) {
  const pid = planId || window._currentLoadedPlanId || "default";
  const prefs = _readPlanPrefs(pid);
  if (FONDS_PLAN[valeur]) prefs.fondPlan = valeur; else delete prefs.fondPlan;
  _writePlanPrefs(pid, prefs);
  console.log("[Config] fondPlan (plan " + pid + ") →", valeur || "(défaut)");
  ktaAppliquerFondPlan();
}

// Navigation intelligente PAR PLAN : elle dépend de la qualité du réseau de tracés du plan (comme les cercles
// d'intersection). Repli sur la valeur GLOBALE tant que le plan n'a pas la sienne : aucun réglage perdu.
function getPlanSmartNav(planId) {
  const pid = planId || window._currentLoadedPlanId || "default";
  const prefs = _readPlanPrefs(pid);
  const g = window.APP_CONFIG || {};
  const out = {};
  out.smartNav = (typeof prefs.smartNav === "boolean") ? prefs.smartNav
               : (g.smartNav === true);
  out.smartNavRadiusM = Number.isFinite(Number(prefs.smartNavRadiusM))
    ? Number(prefs.smartNavRadiusM)
    : (Number.isFinite(Number(g.smartNavRadiusM)) ? Number(g.smartNavRadiusM)
                                                  : DEFAULT_CONFIG.smartNavRadiusM);
  out.smartNavHeadingWeight = Number.isFinite(Number(prefs.smartNavHeadingWeight))
    ? Number(prefs.smartNavHeadingWeight)
    : (Number.isFinite(Number(g.smartNavHeadingWeight)) ? Number(g.smartNavHeadingWeight)
                                                        : DEFAULT_CONFIG.smartNavHeadingWeight);
  return out;
}

// Écrit pour LE PLAN COURANT et applique à chaud. `patch` = sous-ensemble de
// { smartNav, smartNavRadiusM, smartNavHeadingWeight }.
function setPlanSmartNav(planId, patch) {
  const pid = planId || window._currentLoadedPlanId || "default";
  if (!patch || typeof patch !== "object") return;
  const prefs = _readPlanPrefs(pid);
  if (typeof patch.smartNav === "boolean") prefs.smartNav = patch.smartNav;
  ["smartNavRadiusM", "smartNavHeadingWeight"].forEach(function (k) {
    const v = Number(patch[k]);
    // Hors bornes = saisie fautive, pas une préférence.
    if (Number.isFinite(v) && v > 0) prefs[k] = v;
  });
  _writePlanPrefs(pid, prefs);
  // ⚠️ Appliqué tout de suite : le tracker lit APP_CONFIG, pas les prefs.
  if (typeof prefs.smartNav === "boolean") APP_CONFIG.smartNav = prefs.smartNav;
  if (Number.isFinite(Number(prefs.smartNavRadiusM))) APP_CONFIG.smartNavRadiusM = Number(prefs.smartNavRadiusM);
  if (Number.isFinite(Number(prefs.smartNavHeadingWeight))) APP_CONFIG.smartNavHeadingWeight = Number(prefs.smartNavHeadingWeight);
  window.APP_CONFIG = APP_CONFIG;
  console.log("[Config] smartNav (plan " + pid + ") →", JSON.stringify(patch));
}

// Calibration du Nord, dans [0, 360[. Cascade : pref du plan (Réglages › Calibrer le Nord) → plan-config
// `plan.northOffsetDeg` (générateur avancé) → 0 (Nord en haut).
function getPlanNorthOffset(planId) {
  const pid = planId || window._currentLoadedPlanId || "default";
  const prefs = _readPlanPrefs(pid);
  if (typeof prefs.northOffsetDeg === "number" && Number.isFinite(prefs.northOffsetDeg)) {
    return _normalizeAngleDeg(prefs.northOffsetDeg);
  }
  if (window.APP_CONFIG && typeof window.APP_CONFIG.northOffsetDeg === "number") {
    return _normalizeAngleDeg(window.APP_CONFIG.northOffsetDeg);
  }
  return 0;
}

// Écrit pour le plan (string ou number, normalisé) et émet `kta:northOffsetChange` : tracker, boussole et rose des
// vents se re-rendent sans reload.
function setPlanNorthOffset(planId, value) {
  const pid = planId || window._currentLoadedPlanId || "default";
  const newValue = _normalizeAngleDeg(value);
  const prefs = _readPlanPrefs(pid);
  prefs.northOffsetDeg = newValue;
  _writePlanPrefs(pid, prefs);
  console.log("[Config] northOffsetDeg (plan " + pid + ") →", newValue + "°");
  try {
    window.dispatchEvent(new CustomEvent("kta:northOffsetChange", {
      detail: { planId: pid, northOffsetDeg: newValue }
    }));
  } catch(e) {}
}

// Retire la pref du plan : la cascade retombe sur le plan-config ou 0 (bouton « Réinitialiser »).
function resetPlanNorthOffset(planId) {
  const pid = planId || window._currentLoadedPlanId || "default";
  const prefs = _readPlanPrefs(pid);
  delete prefs.northOffsetDeg;
  _writePlanPrefs(pid, prefs);
  console.log("[Config] northOffsetDeg (plan " + pid + ") reset → cascade fallback");
  try {
    window.dispatchEvent(new CustomEvent("kta:northOffsetChange", {
      detail: { planId: pid, northOffsetDeg: getPlanNorthOffset(pid) }
    }));
  } catch(e) {}
}

// Échelle PAR PLAN (px/m), pref `scale` : cascade pref > plan-config > défaut.
// 🩸 Un réglage écrit dans APP_CONFIG seulement en mémoire est perdu au reload (buildAppConfigFromPlan relit le
// plan-config) : il doit être persisté ici.
function getPlanScale(planId) {
  const pid = planId || window._currentLoadedPlanId || "default";
  const prefs = _readPlanPrefs(pid);
  if (typeof prefs.scale === "number" && Number.isFinite(prefs.scale) && prefs.scale > 0) {
    return prefs.scale;
  }
  return null;   // pas d'override → l'appelant garde la valeur plan-config
}

function setPlanScale(planId, value) {
  const pid = planId || window._currentLoadedPlanId || "default";
  const v = Number(value);
  if (!Number.isFinite(v) || v <= 0) return false;   // refus, pas de clamp
  const prefs = _readPlanPrefs(pid);
  prefs.scale = v;
  _writePlanPrefs(pid, prefs);
  console.log("[Config] scale (plan " + pid + ") →", v, "px/m");
  return true;
}
// 🩸 À appeler une fois l'id du plan connu (lancerApplication), jamais depuis buildAppConfigFromPlan : on y lirait
// la pref du plan précédent.
function appliquerScalePerPlan() {
  const v = getPlanScale();
  if (v != null && window.APP_CONFIG) {
    window.APP_CONFIG.scale = v;
    console.log("[Config] échelle per-plan appliquée :", v, "px/m (prioritaire sur plan-config)");
  }
}
window.getPlanScale = getPlanScale;
window.setPlanScale = setPlanScale;
window.appliquerScalePerPlan = appliquerScalePerPlan;

// ── Podomètre et départ du tracker ──────────────────────
// Bornes = celles de l'écran de saisie (interfaceConfig.js). ⚠️ Refus SEC, pas de clamp : une valeur hors bornes
// est un bug d'appelant, la corriger en silence le masquerait.
const PODO_BORNES = {
  stepLength:    { min: 0,   max: 1.5  },
  // La magnitude inclut la gravité (~9,81 au repos) : un seuil < 10 est toujours franchi.
  stepThreshold: { min: 10,  max: 30   },
  stepCooldown:  { min: 300, max: 3000 },
  startX:        { min: 0,   max: Infinity },
  startY:        { min: 0,   max: Infinity }
};

// Les trois réglages de podomètre sont GLOBAUX (`app_user_prefs`) : un seul écrivain (Réglages, setGlobalPodometre)
// et un seul lecteur (_appliquerPodometreGlobal). startX/startY restent par plan (setPlanTracking).
const PODO_CLES = ["stepLength", "stepThreshold", "stepCooldown"];
function _appliquerPodometreGlobal(cible, saved) {
  PODO_CLES.forEach(function (k) {
    const v = Number(saved && saved[k]);
    const b = PODO_BORNES[k];
    if (Number.isFinite(v) && v >= b.min && v <= b.max) cible[k] = v;
  });
}
function setGlobalPodometre(patch) {
  if (!patch || typeof patch !== "object") return false;
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem("app_user_prefs") || "{}"); } catch (e) { saved = {}; }
  let n = 0;
  PODO_CLES.forEach(function (k) {
    if (!(k in patch)) return;
    if (patch[k] === null) { delete saved[k]; if (window.APP_CONFIG) window.APP_CONFIG[k] = TRACKING_USINE[k]; n++; return; }   // retour à l'usine
    const v = Number(patch[k]);
    const b = PODO_BORNES[k];
    if (!Number.isFinite(v) || v < b.min || v > b.max) return;
    saved[k] = v;
    if (window.APP_CONFIG) window.APP_CONFIG[k] = v;
    n++;
  });
  if (!n) return false;
  try { localStorage.setItem("app_user_prefs", JSON.stringify(saved)); } catch (e) {}
  console.log("[Config] 👣 podomètre global →", n, "réglage(s) enregistré(s)");
  return true;
}
// Migration : d'anciens réglages de podomètre saisis PAR PLAN deviennent le réglage global, une seule fois (premier
// plan rouvert), puis sont retirés des prefs du plan. Ceux d'un plan-config ne migrent pas (pas un choix de l'user).
function _migrerPodometreParPlan(pid, prefs) {
  const aMigrer = {};
  let any = false;
  PODO_CLES.forEach(function (k) { if (k in prefs) { aMigrer[k] = prefs[k]; delete prefs[k]; any = true; } });
  if (!any) return false;
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem("app_user_prefs") || "{}"); } catch (e) {}
  const dejaGlobal = PODO_CLES.some(function (k) { return Number.isFinite(Number(saved[k])); });
  if (!dejaGlobal) {
    setGlobalPodometre(aMigrer);
    console.log("[Config] 👣 podomètre : réglages du plan " + pid + " promus en réglage global (migration v1.96.0)");
  }
  _writePlanPrefs(pid, prefs);
  return true;
}

function setPlanTracking(planId, patch) {
  const pid = planId || window._currentLoadedPlanId || "default";
  if (!patch || typeof patch !== "object") return false;
  const prefs = _readPlanPrefs(pid);
  let n = 0;
  Object.keys(PODO_BORNES).forEach(function (k) {
    if (!(k in patch)) return;
    if (PODO_CLES.indexOf(k) >= 0) { console.warn("[Config] 👣 " + k + " est global depuis v1.96.0 : utiliser setGlobalPodometre"); return; }
    const v = Number(patch[k]);
    const b = PODO_BORNES[k];
    if (!Number.isFinite(v) || v < b.min || v > b.max) return;
    prefs[k] = v; n++;
  });
  if (!n) return false;
  _writePlanPrefs(pid, prefs);
  console.log("[Config] podomètre (plan " + pid + ") →", n, "réglage(s) enregistré(s)");
  return true;
}

// 🩸 Même contrainte qu'appliquerScalePerPlan : une fois l'id du plan connu.
function appliquerTrackingPerPlan() {
  const pid = window._currentLoadedPlanId || "default";
  const prefs = _readPlanPrefs(pid);
  if (!window.APP_CONFIG) return;
  if (_migrerPodometreParPlan(pid, prefs)) {
    // Le global vient peut-être d'être posé : rejoué sur la config courante.
    try { _appliquerPodometreGlobal(window.APP_CONFIG, JSON.parse(localStorage.getItem("app_user_prefs") || "{}")); } catch (e) {}
  }
  Object.keys(PODO_BORNES).forEach(function (k) {
    if (PODO_CLES.indexOf(k) >= 0) return;   // global, jamais par plan
    const v = Number(prefs[k]);
    const b = PODO_BORNES[k];
    if (!Number.isFinite(v) || v < b.min || v > b.max) return;
    window.APP_CONFIG[k] = v;
    console.log("[Config] " + k + " per-plan appliqué :", v);
  });
}
window.setPlanTracking         = setPlanTracking;
window.appliquerTrackingPerPlan = appliquerTrackingPerPlan;
window.setGlobalPodometre      = setGlobalPodometre;

// 🩸 Même contrainte pour la nav intelligente : une fois l'id du plan connu.
function appliquerSmartNavPerPlan() {
  const v = getPlanSmartNav();
  APP_CONFIG.smartNav              = v.smartNav === true;
  APP_CONFIG.smartNavRadiusM       = v.smartNavRadiusM;
  APP_CONFIG.smartNavHeadingWeight = v.smartNavHeadingWeight;
  window.APP_CONFIG = APP_CONFIG;
  console.log("[Config] smartNav applique pour ce plan :", v.smartNav);
}
window.appliquerSmartNavPerPlan = appliquerSmartNavPerPlan;

// ── Profondeur des niveaux ──────────────────────
// ⚠️ Référence : la SURFACE, négatif vers le bas (décision produit) ; un profil ne lit que des différences.
// Trois états : absent = NON RENSEIGNÉ (jamais inventé : ça changerait les distances en silence) · nombre = mètres
// sous la surface · null = SANS PROFONDEUR explicite (ex. niveau +1 de l'import SIG : convention d'empilement de
// deux relevés du même endroit, pas un étage). absent et null sortent du profil (jonctions en 2D) ; seul
// l'affichage les distingue.
const PROF_NIVEAU0_DEFAUT = -25;   // mètres sous la surface
const PROF_PAS_DEFAUT     = 5;     // mètres entre deux étages

// Profondeurs d'un plan : { "<niveau>": nombre|null }, {} = rien renseigné. Cascade : pref du plan → plan-config.
function getPlanProfondeurs(planId) {
  const pid = planId || window._currentLoadedPlanId || "default";
  const prefs = _readPlanPrefs(pid);
  if (prefs.niveauxProfondeur && typeof prefs.niveauxProfondeur === "object") {
    return prefs.niveauxProfondeur;
  }
  // 🩸 PLAN_CONFIG = le plan OUVERT : il ne répond pas pour un autre plan (itinéraire inter-plans).
  if (planId && window._currentLoadedPlanId && planId !== window._currentLoadedPlanId) return {};
  const duPlan = window.PLAN_CONFIG && window.PLAN_CONFIG.plan
                 && window.PLAN_CONFIG.plan.niveauxProfondeur;
  return (duPlan && typeof duPlan === "object") ? duPlan : {};
}

function setPlanProfondeurs(planId, table) {
  const pid = planId || window._currentLoadedPlanId || "default";
  if (!table || typeof table !== "object") return false;
  const propre = {};
  Object.keys(table).forEach(function (k) {
    if (!/^-?\d+$/.test(k)) return;
    const v = table[k];
    if (v === null) { propre[k] = null; return; }   // sans profondeur, explicite
    const n = Number(v);
    if (Number.isFinite(n)) propre[k] = n;
  });
  const prefs = _readPlanPrefs(pid);
  prefs.niveauxProfondeur = propre;
  _writePlanPrefs(pid, prefs);
  console.log("[Config] profondeurs (plan " + pid + ") →", propre);
  return true;
}

// Profondeur d'UN niveau, ou null (non renseignée et sans profondeur se traitent pareil).
function getProfondeurNiveau(niveau, planId) {
  const t = getPlanProfondeurs(planId);
  const v = t[String(niveau)];
  return Number.isFinite(v) ? v : null;
}

// Table PROPOSÉE à la saisie (niveau 0 = -25 m, pas de 5 m) : un réseau réel n'a pas de pas régulier, tout reste
// éditable.
function proposerProfondeurs(niveaux, niveau0, pas) {
  const z0 = Number.isFinite(niveau0) ? niveau0 : PROF_NIVEAU0_DEFAUT;
  const dz = Number.isFinite(pas) && pas > 0 ? pas : PROF_PAS_DEFAUT;
  const out = {};
  (Array.isArray(niveaux) ? niveaux : []).forEach(function (n) {
    if (Number.isInteger(n)) out[String(n)] = z0 + n * dz;
  });
  return out;
}

window.getPlanProfondeurs   = getPlanProfondeurs;
window.setPlanProfondeurs   = setPlanProfondeurs;
window.getProfondeurNiveau  = getProfondeurNiveau;
window.proposerProfondeurs  = proposerProfondeurs;

// ── Estimation du point B de géoréférencement ──────────────────────
// GPS d'UN seul point A + échelle fiable (px/m) + Nord calibré suffisent à DÉDUIRE B.
// Math : Δpixels → mètres (échelle), rotation ANTI-horaire de +northOffsetDeg (image → géographique : offset 90°,
// un vecteur vers la droite de l'image devient plein Nord), puis mètres → degrés par le plan tangent du moteur
// (`KmzExport.decalerGps`, le même que le calage "local" : B tombe à la distance saisie, au mm près).
// ⚠️ Refus, pas de clamp : null si A incomplet, échelle ≤ 0 ou non finie, |lat| > 85°, moteur absent.
// Rend { x, y, lat, lng, estimated: true }, format EXACT d'un point de calibration (Vue OSM, KMZ/GPX, Secours le
// consomment tel quel) ; `estimated` est affiché par les UI. Garde-fou : check-georef-estimation.js.
function ktaEstimerPointB(pointA, pixelB, scalePxM, northOffsetDeg) {
  if (!pointA || !pixelB) return null;
  // 🩸 null/undefined testés AVANT Number() : Number(null) vaut 0, un A à lat:null serait estimé depuis l'équateur.
  if ([pointA.x, pointA.y, pointA.lat, pointA.lng, pixelB.x, pixelB.y]
        .some(function(v) { return v == null || v === ""; })) return null;
  const ax = Number(pointA.x), ay = Number(pointA.y);
  const alat = Number(pointA.lat), alng = Number(pointA.lng);
  const bx = Number(pixelB.x), by = Number(pixelB.y);
  const s = Number(scalePxM);
  if (![ax, ay, alat, alng, bx, by].every(Number.isFinite)) return null;
  if (!Number.isFinite(s) || s <= 0) return null;
  if (Math.abs(alat) > 85) return null;

  const theta = ((Number(northOffsetDeg) || 0) * Math.PI) / 180;
  // Repère image : x → droite, y → BAS. En « plan » : est = Δx, nord = −Δy.
  const estPlan  = (bx - ax) / s;
  const nordPlan = -(by - ay) / s;
  // Rotation anti-horaire de +theta.
  const estVrai  = estPlan * Math.cos(theta) - nordPlan * Math.sin(theta);
  const nordVrai = estPlan * Math.sin(theta) + nordPlan * Math.cos(theta);

  const KE = window.KmzExport;
  if (!KE || typeof KE.decalerGps !== "function") return null;
  const g = KE.decalerGps(alat, alng, estVrai, nordVrai);
  if (!g || !Number.isFinite(g.lat) || !Number.isFinite(g.lng)) return null;
  return { x: bx, y: by, lat: g.lat, lng: g.lng, estimated: true };
}
window.ktaEstimerPointB = ktaEstimerPointB;

// Coin d'image le plus éloigné de A : position du B virtuel (longue base = moins de bruit numérique ; position sans
// sens physique, le point est synthétique).
function ktaCoinLePlusLoin(pointA, imageWidth, imageHeight) {
  const w = Number(imageWidth), h = Number(imageHeight);
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0 || !pointA) return null;
  let best = null, bestD = -1;
  [[0, 0], [w, 0], [0, h], [w, h]].forEach(function(c) {
    const d = Math.hypot(c[0] - Number(pointA.x), c[1] - Number(pointA.y));
    if (d > bestD) { bestD = d; best = { x: c[0], y: c[1] }; }
  });
  return best;
}
window.ktaCoinLePlusLoin = ktaCoinLePlusLoin;

// ── Exports globaux ──────────────────────
window.APP_CONFIG                  = APP_CONFIG;
window.DEFAULT_CONFIG              = DEFAULT_CONFIG;
window.loadAppConfig               = loadAppConfig;
window.buildAppConfigFromPlan      = buildAppConfigFromPlan;
window.sauvegarderPrefsUtilisateur = sauvegarderPrefsUtilisateur;
window.setDebugMode                = setDebugMode;

// Boutons de zoom selon `zoomBoutons` : une carte créée avec `zoomControl: false` s'inscrit ici, et le réglage
// changé à chaud repasse sur toutes les cartes encore en vie.
const _cartesZoom = [];
function ktaBoutonsZoom(carte) {
  if (!carte || typeof L === "undefined" || !L.control || !L.control.zoom) return;
  if (_cartesZoom.indexOf(carte) < 0) {
    _cartesZoom.push(carte);
    carte.once("unload", function () {
      const i = _cartesZoom.indexOf(carte);
      if (i >= 0) _cartesZoom.splice(i, 1);
    });
  }
  const voulu = !!(window.APP_CONFIG && window.APP_CONFIG.zoomBoutons === true);
  if (voulu && !carte._ktaZoomCtl) {
    carte._ktaZoomCtl = L.control.zoom().addTo(carte);
  } else if (!voulu && carte._ktaZoomCtl) {
    carte.removeControl(carte._ktaZoomCtl);
    carte._ktaZoomCtl = null;
  }
}
window.ktaBoutonsZoom = ktaBoutonsZoom;
window.ktaBoutonsZoomPartout = function () {
  _cartesZoom.slice().forEach(function (c) {
    try { ktaBoutonsZoom(c); } catch (e) { console.warn("[Config] Boutons de zoom :", e); }
  });
};
window.getPlanShowsIntersections   = getPlanShowsIntersections;
window.getPlanFond                 = getPlanFond;
window.getPlanFondChoisi           = getPlanFondChoisi;
window.getPlanFondConseille        = getPlanFondConseille;
window.setPlanFond                 = setPlanFond;
window.ktaAppliquerFondPlan        = ktaAppliquerFondPlan;
window.ktaCouleurFondPlan          = ktaCouleurFondPlan;
window.setPlanShowsIntersections   = setPlanShowsIntersections;
window.getPlanSmartNav             = getPlanSmartNav;    // par plan
window.setPlanSmartNav             = setPlanSmartNav;
window.getPlanNorthOffset          = getPlanNorthOffset;
window.setPlanNorthOffset          = setPlanNorthOffset;
window.resetPlanNorthOffset        = resetPlanNorthOffset;
window.normalizePath               = normalizePath;
window.getRuntimeAsset             = getRuntimeAsset;
window.getRuntimeAssetUrl          = getRuntimeAssetUrl;
window.registerAsset               = registerAsset;
window.resetRuntimeAssets          = resetRuntimeAssets;
window.findMatchingFile            = findMatchingFile;
window.cloneAndResolvePlanConfig   = cloneAndResolvePlanConfig;
window.validateImportedPlan        = validateImportedPlan;
