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
  // ⚠️ v1.74.0 — DÉFAUT BASCULÉ À false (décision KARMA). Les cercles ne
  // signalent PAS un contact réel : `road.js > _calculerIntersectionsRoads`
  // pose aussi un cercle quand une EXTRÉMITÉ passe à moins de
  // ROAD_PROXIMITY_TOLERANCE (8 px plan) d'un segment voisin. Deux tracés qui
  // se frôlent sans se toucher affichent donc un cercle — lecture trompeuse,
  // signalée sur le terrain. Le toggle reste disponible partout, mais il
  // s'active désormais en connaissance de cause. Dette associée : cf.
  // docs/BACKLOG.md (« cercles d'intersection : symptôme vs cause »).
  showRoadIntersections: false,

  // 🧭 Nav Intelligente (C2) : caler la position tracker sur le réseau de
  // tracés (map-matching). Pref GLOBALE, défaut OFF (rétrocompat stricte).
  // Lue à chaud par tracking.js > avancer(). Sans effet si le plan n'a pas de
  // réseau (garde-fou runtime via RoadGraph.isReady()).
  smartNav: false,
  smartNavRadiusM:       6,    // 🆕 v1.49.0 — tolérance latérale du verrou sur tracé (m), réglable ⚙️
  smartNavHeadingWeight: 0.7,  // 🆕 v1.49.0 — poids du cap aux croisements (px/°), réglable ⚙️

  // 🧲 C5 v1.74.0 — MAGNÉTISME EDIT-TIME (accrochage au dessin).
  // Pref GLOBALE, défaut OFF (le geste de dessin historique reste le défaut —
  // ce lot touche `road.js > mousedown`, utilisé à chaque session).
  // ⚠️ INDÉPENDANT de `smartNav` malgré son rangement dans la même section de
  // ⚙️ Réglages : le magnétisme améliore la qualité du GRAPHE, donc il sert
  // aussi au Pathfinder (itinéraires) même si la nav intelligente est OFF.
  snapDraw:   false,
  // 🪟 v1.85.1 (KARMA) : les panneaux d outils (Tracés / Zones / Structures)
  // s ouvrent CENTRÉS par défaut. Ancrés au bouton, ils passaient sous le
  // footer sur téléphone dès que leur liste s allongeait — un plan importé
  // ajoute un type par niveau. Le réglage rend l ancrage à qui le préfère,
  // typiquement sur grand écran où la place ne manque pas.
  panneauxAncres: false,
  snapDrawPx: 14,   // rayon d'accrochage en pixels ÉCRAN (converti en unités
                    // plan au clic selon le zoom courant — « si c'est proche
                    // à l'œil, ça s'accroche », quel que soit le niveau de zoom)

  // 🧭 v1.37.0 — Orientation du Nord (offset en degrés vs haut du plan).
  // Default 0 = haut du plan = Nord (comportement historique strict).
  // Quand l'image du plan n'est pas orientée Nord-haut (photo aérienne avec
  // cadrage arbitraire, plan cataphile sans rosace, etc.), on calibre cet
  // offset une fois (via générateur avancé OU bouton "🧭 Calibrer le Nord"
  // des Réglages map mode). Cascade lecture per-plan via
  // getPlanNorthOffset() : LS `myktamap_plan_prefs_<planId>.northOffsetDeg`
  // → APP_CONFIG.northOffsetDeg (mappé depuis `plan.northOffsetDeg` du
  // plan-config.json) → 0. Convention : 0° = Nord vers le HAUT du plan,
  // angle croissant dans le sens HORAIRE (= si la flèche Nord pointe vers
  // la droite du plan, offset = 90°). Appliqué à tracker (heading marker),
  // boussole d'orientation et rose des vents du header.
  northOffsetDeg: 0,

  // 🆕 v1.34.26 — Vibration haptique (Web Vibration API).
  // Pref GLOBALE, défaut ON. Lue à chaud par window.kta_vibrate(pattern) qui
  // est le point d'entrée unique pour tous les modules qui veulent vibrer
  // (waypoint atteint Mode Itinéraire, confirmation Mode Secours, etc.).
  // Toggle exposé dans ⚙️ Configuration (home) ET ⚙️ Réglages (map).
  // Auto-masqué si navigator.vibrate non supporté (iOS Safari notamment —
  // iOS ne supporte PAS Web Vibration API, c'est délibéré d'Apple).
  // L'user reste maître : même sur device supporté, peut décocher s'il
  // ne veut pas de vibration sous terre (anti-bruit pour méditation /
  // discrétion en cavité avec d'autres personnes).
  // 🔕 v1.85.2 (KARMA « je le vois coché par défaut ») : OFF par défaut. Une
  // app qui vibre sans qu'on l'ait demandé surprend, et sous terre chaque
  // vibration est de la batterie en moins.
  // ⚠️ Passer ce défaut à false NE SUFFIT PAS : tout test en `!== false` rend
  // vrai sur `undefined` et rallumerait l'option. Même piège que
  // `showRoadIntersections` en v1.74.0 — les lecteurs doivent tester `=== true`.
  vibrationEnabled: false,
  // 🔋 v1.85.2 (KARMA) : l'écoute du capteur de batterie est débrayable. Elle
  // reste ON par défaut — sous terre, savoir combien il reste vaut mieux que
  // de le découvrir —, mais tout le monde n'a pas envie d'une icône de plus
  // ni d'un capteur écouté en permanence.
  batterieEnabled: true,

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

// 🩸 v1.82.0 — LES RÉGLAGES DE PODOMÈTRE, FIGÉS À LEUR VALEUR D'USINE.
//
// `DEFAULT_CONFIG` porte mal son nom : il est RÉÉCRIT à chaque chargement de
// plan (`Object.assign(DEFAULT_CONFIG, cfg)`) pour que `resetConfig()` rende
// les valeurs DU PLAN COURANT. Le lire depuis un générateur donnerait donc
// les réglages du plan ouvert à ce moment-là — au petit bonheur.
//
// D'où cette copie gelée, prise ici, avant la première mutation. C'est elle
// que les générateurs (SIG, GPX) doivent écrire dans les plans qu'ils
// produisent, au lieu de recopier des littéraux qui dérivent.
//
// CE QUI A MOTIVÉ CE GEL : `sigImport.js` et `gpxImport.js` écrivaient
// `stepThreshold: 1.2` là où la valeur d'usine est 13. Or `tracking.js`
// compare ce seuil à la magnitude de `accelerationIncludingGravity`, qui
// vaut DÉJÀ ~9,81 téléphone posé : la condition était vraie en permanence,
// et seul le cooldown limitait encore le comptage. À 280 ms, cela fabriquait
// ~3,6 pas par seconde À L'ARRÊT — près de 10 km/h de distance fantôme sur
// tout plan issu d'un import. Signalé par KARMA sur l'écran SIG.
const TRACKING_USINE = Object.freeze({
  stepLength:    DEFAULT_CONFIG.stepLength,
  stepThreshold: DEFAULT_CONFIG.stepThreshold,
  stepCooldown:  DEFAULT_CONFIG.stepCooldown
});
window.KTA_TRACKING_USINE = TRACKING_USINE;

let APP_CONFIG = { ...DEFAULT_CONFIG };

// Restaurer dès le chargement la pref globale debugMode (avant tout plan)
// Utile pour le bouton 🐛 du loader qui lit/écrit avant qu'aucun plan ne soit chargé
try {
  const saved = JSON.parse(localStorage.getItem("app_user_prefs") || "{}");
  if ("debugMode" in saved) APP_CONFIG.debugMode = !!saved.debugMode;
  // 🆕 v1.34.26 — Restaure la pref vibration au boot
  if ("vibrationEnabled" in saved) APP_CONFIG.vibrationEnabled = !!saved.vibrationEnabled;
  if ("batterieEnabled" in saved) APP_CONFIG.batterieEnabled = !!saved.batterieEnabled;
  // 🔍 v174 : restaurer scaledMarkers avant que creerIcones tourne
  if ("scaledMarkers" in saved) APP_CONFIG.scaledMarkers = !!saved.scaledMarkers;
  // 🆕 v1.9.2 : restaurer showRoadIntersections avant que renderRoads tourne
  if ("showRoadIntersections" in saved) APP_CONFIG.showRoadIntersections = !!saved.showRoadIntersections;
  // 🧭 Nav Intelligente (C2) : restaurer smartNav (pref globale, défaut OFF)
  if ("smartNav" in saved) APP_CONFIG.smartNav = !!saved.smartNav;
  // 🆕 v1.49.0 — tolérances réglables du verrou sur tracé (override des défauts)
  if (Number.isFinite(saved.smartNavRadiusM))       APP_CONFIG.smartNavRadiusM       = saved.smartNavRadiusM;
  if (Number.isFinite(saved.smartNavHeadingWeight)) APP_CONFIG.smartNavHeadingWeight = saved.smartNavHeadingWeight;
  // 🧲 C5 v1.74.0 — magnétisme edit-time (pref globale, défaut OFF)
  if ("snapDraw" in saved) APP_CONFIG.snapDraw = !!saved.snapDraw;
  if ("panneauxAncres" in saved) APP_CONFIG.panneauxAncres = !!saved.panneauxAncres;
  if (Number.isFinite(saved.snapDrawPx) && saved.snapDrawPx > 0) APP_CONFIG.snapDrawPx = saved.snapDrawPx;
} catch(e) {}

// =========================
// RUNTIME ASSETS (mode import navigateur)
// =========================
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
  // 🆕 v1.34.19 — Champ optionnel `plan.histoirePdf` : chemin relatif vers
  // un PDF embarqué dans le ZIP (ex: "data/histoire.pdf"). Résolu en blob
  // URL via RUNTIME_ASSETS pour l'affichage iframe dans la modale Mode
  // Histoire (cf js/modeHistoire.js). Pas d'erreur si absent.
  if (resolved.plan?.histoirePdf)
    resolved.plan.histoirePdf = getRuntimeAssetUrl(resolved.plan.histoirePdf) || resolved.plan.histoirePdf;
  // 📄 v1.71.0 — multi-PDF Histoire : résolution de chaque entrée du tableau
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
// HELPER : NORMALISATION ANGLE (v1.37.0)
// =========================
// Ramène un angle quelconque dans [0, 360[. Tolère string, null, NaN, négatif.
// Utilisé pour northOffsetDeg (champ saisi par user dans le générateur OU le
// toggle de Réglages — défense en profondeur même si l'input est validé).
function _normalizeAngleDeg(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  let a = n % 360;
  if (a < 0) a += 360;
  return a;
}

// Réglage de podomètre lu dans un plan-config : repris tel quel s'il est
// dans les bornes que l'écran ⚙️ Réglages autorise, remplacé par la valeur
// d'usine sinon. Voir le pavé dans buildAppConfigFromPlan pour le pourquoi.
function _reglagePodometre(valeur, cle, min, max) {
  const n = Number(valeur ?? DEFAULT_CONFIG[cle]);
  if (Number.isFinite(n) && n >= min && n <= max) return n;
  const usine = TRACKING_USINE[cle];
  if (Number.isFinite(n)) {
    console.warn("[Config] 👣 " + cle + " = " + n + " hors des bornes [" + min +
                 ", " + max + "] — plan généré avant le correctif du 03/09/2026. " +
                 "Remplacé par la valeur d'usine (" + usine + ").");
  }
  return usine;
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
    // 🎯 v1.76.1 — l'override d'échelle per-plan n'est PAS appliqué ici :
    // buildAppConfigFromPlan tourne AVANT que _currentLoadedPlanId soit posé
    // (main.js:1079 vs :1104) — lire la pref ici prendrait celle du plan
    // PRÉCÉDENT (fuite inter-plans). Il est appliqué par
    // appliquerScalePerPlan() dans lancerApplication, une fois l'id connu.
    scale:         Number(tracking.scale         ?? DEFAULT_CONFIG.scale),
    stepLength:    Number(tracking.stepLength    ?? DEFAULT_CONFIG.stepLength),
    startX:        Number(tracking.startX        ?? DEFAULT_CONFIG.startX),
    startY:        Number(tracking.startY        ?? DEFAULT_CONFIG.startY),
    // 🩸 v1.82.0 — RÉPARATION D'UN RÉGLAGE STRUCTURELLEMENT IMPOSSIBLE.
    //
    // Trois générateurs (SIG, GPX, KMZ) ont écrit pendant des mois
    // `stepThreshold: 1.2` et `stepCooldown: 280` dans les plans qu'ils
    // produisaient. Or `tracking.js` compare le seuil à la magnitude de
    // `accelerationIncludingGravity`, qui vaut DÉJÀ ~9,81 téléphone posé :
    // à 1,2 la condition est vraie en permanence, et un pas était compté
    // toutes les 280 ms À L'ARRÊT — près de 10 km/h de distance fantôme.
    //
    // Corriger les générateurs ne répare pas les plans DÉJÀ produits, dont
    // le plan-config porte la mauvaise valeur. D'où cette réparation au
    // chargement, sur un critère qui n'est pas une opinion : l'écran
    // ⚙️ Réglages borne lui-même ces champs à [10, 30] et [300, 3000]
    // (interfaceConfig.js). Une valeur hors de ces bornes ne peut donc PAS
    // être un choix de l'utilisateur — l'app ne lui permet pas de la saisir.
    // C'est de la donnée corrompue, et on la remplace par l'usine.
    //
    // Même raisonnement que le calibrage périmé (main.js) : on ne touche
    // jamais une préférence valide, seulement ce qui est hors du possible.
    stepThreshold: _reglagePodometre(tracking.stepThreshold, "stepThreshold", 10, 30),
    stepCooldown:  _reglagePodometre(tracking.stepCooldown,  "stepCooldown", 300, 3000),
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
    availableLevels:  [-2, -1, 0, 1, 2],

    // 🧭 v1.37.0 — Mapping plan-config.json > plan.northOffsetDeg vers APP_CONFIG.
    // Sécurisation : clamp [0, 360[ + normalisation. Default 0 si absent
    // (rétrocompat stricte : tout plan v1.36.x → 0 → comportement actuel).
    northOffsetDeg:   _normalizeAngleDeg(plan.northOffsetDeg)
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
    if (Number.isFinite(saved.smartNavRadiusM))       cfg.smartNavRadiusM       = saved.smartNavRadiusM;
    if (Number.isFinite(saved.smartNavHeadingWeight)) cfg.smartNavHeadingWeight = saved.smartNavHeadingWeight;
    // 🐛 v1.75.0 (repro KARMA « je n'ai pas le flash doré ») — `snapDraw`
    // MANQUAIT ici. Il était bien sauvegardé et restauré au BOOT (bloc
    // app_user_prefs plus haut), mais APP_CONFIG est RECONSTRUIT à chaque
    // chargement de plan par cette fonction : toute pref absente de cette
    // liste retombe silencieusement sur DEFAULT_CONFIG. Le magnétisme
    // repassait donc à false dès l'ouverture d'un plan — c'est-à-dire
    // exactement au moment où on veut dessiner.
    // ⚠️ Toute nouvelle pref GLOBALE doit être ajoutée aux DEUX endroits :
    // le bloc de restauration au boot ET cette liste.
    if ("snapDraw" in saved) cfg.snapDraw = !!saved.snapDraw;
    if ("panneauxAncres" in saved) cfg.panneauxAncres = !!saved.panneauxAncres;
    if ("batterieEnabled" in saved) cfg.batterieEnabled = !!saved.batterieEnabled;
    // ⚠️ smartNav* ne sont PLUS lus ici : ils sont devenus PAR PLAN (v1.85.3).
    // La valeur globale reste lue plus bas comme REPLI de migration, via
    // `getPlanSmartNav`, appelé au chargement du plan.
    if (Number.isFinite(saved.snapDrawPx) && saved.snapDrawPx > 0) cfg.snapDrawPx = saved.snapDrawPx;
  } catch(e) {}

  // Fallback aux valeurs par défaut si absentes des prefs (= user a jamais
  // touché le toggle → on prend le default true). Sans ce fallback, le
  // champ resterait undefined et la check `!== false` le traiterait comme
  // truthy — fonctionnel mais moins explicite.
  if (cfg.scaledMarkers === undefined)         cfg.scaledMarkers         = DEFAULT_CONFIG.scaledMarkers !== false;
  // ⚠️ v1.74.0 : passé de `!== false` à `=== true` — le défaut est désormais
  // OFF, l'idiome `!== false` aurait continué à rendre true sur undefined.
  if (cfg.showRoadIntersections === undefined) cfg.showRoadIntersections = DEFAULT_CONFIG.showRoadIntersections === true;
  if (cfg.smartNav === undefined)              cfg.smartNav              = DEFAULT_CONFIG.smartNav === true;  // défaut OFF
  if (cfg.snapDraw === undefined)              cfg.snapDraw              = DEFAULT_CONFIG.snapDraw === true;  // défaut OFF
  if (!Number.isFinite(cfg.snapDrawPx))        cfg.snapDrawPx            = DEFAULT_CONFIG.snapDrawPx;
  if (cfg.panneauxAncres === undefined)        cfg.panneauxAncres        = DEFAULT_CONFIG.panneauxAncres === true;
  // 🩸 Défaut ON : on teste donc `!== false`, l'idiome inverse de celui des
  // préférences par défaut OFF. Se tromper d'idiome ici éteindrait la
  // batterie pour tout le monde au premier chargement de plan.
  if (cfg.batterieEnabled === undefined)       cfg.batterieEnabled       = DEFAULT_CONFIG.batterieEnabled !== false;

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
  const base = String(baseDir || "").replace(/\/$/, "");

  // 🩸 v1.86.1 — UN CHEMIN `data/…` EST RELATIF AU ZIP, PAS À LA RACINE DU SITE.
  // Le générateur écrit `data/MonPlan.png` dans le plan-config parce que c'est
  // la mise en page DU ZIP. Jusqu'ici ce chemin était rendu tel quel : déployé
  // dans `data/toto/`, le fichier réel est à `data/toto/data/MonPlan.png` mais
  // l'app allait chercher `data/MonPlan.png` à la racine du site → 404 sur
  // TOUT sauf le plan-config lui-même. Un simple dézip n'a donc jamais marché ;
  // il fallait aplatir le dossier `data/` ET réécrire chaque chemin à la main
  // (c'est ce qu'est `data/test`), sans que rien ne le dise nulle part.
  //
  // On préfixe donc par le dossier du plan — SAUF si le chemin le contient
  // déjà, ce qui préserve exactement les déploiements réécrits à la main.
  // (baseDir === "data" est déjà traité en amont par resolveServerPaths, qui
  // sort sans rien réécrire : un plan à la racine reste correct.)
  if (p.indexOf("data/") === 0) {
    return (base && base !== "data" && p.indexOf(base + "/") !== 0) ? base + "/" + p : p;
  }

  // 🎨 v1.87.2 — `icon/…` RESTE À LA RACINE DU SITE, toujours.
  //
  // 🩸 CE QUE LA v1.86.2 AVAIT TENTÉ, ET POURQUOI C'ÉTAIT FAUX. On préfixait
  // par le dossier du plan toute icône ABSENTE du catalogue `TAGS_BUILTIN`,
  // en supposant qu'elle venait du ZIP. Mais `TAGS_BUILTIN` liste des **tags
  // de POI**, PAS les icônes livrées avec l'app : `icon/iconetrack.png`
  // (le marqueur du tracker) existe bien à la racine et n'y figure pas.
  // Résultat : sur un plan serveur, l'icône du tracker était réécrite en
  // `data/<plan>/icon/iconetrack.png` → 404. Régression d'AFFICHAGE, révélée
  // par hasard par le téléchargement hors-ligne (constat KARMA).
  //
  // Le bon critère n'est pas « est-ce dans un catalogue » — aucun catalogue ne
  // liste TOUTES les icônes de l'app — mais « le fichier existe-t-il dans le
  // dossier du plan ». C'est indécidable ici, en synchrone : la résolution des
  // icônes perso se fait donc en ASYNCHRONE dans `resoudreIconesPlanServeur`,
  // qui SONDE réellement le serveur. Ici, on ne touche à rien.
  if (p.indexOf("icon/") === 0) return p;

  // 🩸 v1.86.2 — DOSSIERS DE L'APPLICATION, jamais relatifs à un plan.
  // Trouvé en écrivant le correctif ci-dessus : `icons.default` vaut
  // `lib/leaflet/images/marker-icon.png`. Tant que `resolveServerPaths` ne
  // touchait pas à `icons`, ce chemin passait au travers ; dès qu'on le traite,
  // la branche générique en ferait `data/<plan>/lib/leaflet/…` → 404 sur
  // l'icône par défaut de TOUS les points sans tag.
  if (/^(lib|css|js|docs|assets)\//.test(p)) return p;

  // 🩸 v1.88.4 — RÉTRO-COMPAT : UN NOM DE FICHIER NU VIENT DU DOSSIER `data/`.
  // Les importateurs SIG / GPX / KMZ écrivaient le fichier dans `data/` du ZIP
  // mais le déclaraient SANS le préfixe dans le plan-config (corrigé à la
  // source en v1.88.4). En import LOCAL ça passait — `findMatchingFile`
  // retrouve l'asset par son NOM DE BASE — donc l'incohérence est restée
  // invisible jusqu'au mode serveur, où la résolution est stricte : 404.
  // Constat KARMA : ses plans issus d'un import SIG (`*_from_v2`) échouaient,
  // ceux du Générateur passaient.
  //
  // Les plans DÉJÀ DÉPLOYÉS gardent leur plan-config fautif. On les rattrape
  // sans rien retoucher côté serveur : dans un ZIP produit par cette app, un
  // asset est TOUJOURS sous `data/` (ou `icon/`, traité plus haut). Un nom nu
  // ne peut donc désigner que `<dossier du plan>/data/<nom>`.
  // ⚠️ Ce n'est pas une sonde : c'est la mise en page du ZIP, comme pour les
  // tuiles. Aucun producteur n'écrit d'asset à la racine de l'archive.
  if (base && base !== "data" && p.indexOf("/") < 0) return base + "/data/" + p;

  return base + "/" + p;
}

function resolveServerPaths(config, baseDir) {
  if (!baseDir || baseDir === "data") return config; // racine = pas de réécriture
  if (config.plan?.baseImage)      config.plan.baseImage      = resolveServerPath(config.plan.baseImage, baseDir);
  if (config.plan?.collisionImage) config.plan.collisionImage = resolveServerPath(config.plan.collisionImage, baseDir);
  (config.imageLayers || []).forEach(function(l) { if (l.file) l.file = resolveServerPath(l.file, baseDir); });
  (config.dataLayers  || []).forEach(function(l) { if (l.file) l.file = resolveServerPath(l.file, baseDir); });
  // 🎨 v1.86.2 — LES ICÔNES SONT ENFIN TRAITÉES.
  // 🩸 L'ancien commentaire ici disait « icons.* déjà gérés par
  // resolveServerPath » — c'était FAUX : `resolveServerPaths` ne les
  // parcourait pas du tout. Elles fonctionnaient donc par ABSENCE de
  // traitement (chemin laissé tel quel → racine du site), ce qui marchait
  // pour les icônes de l'app et condamnait les icônes personnalisées.
  if (config.icons && typeof config.icons === "object") {
    Object.keys(config.icons).forEach(function(k) {
      if (typeof config.icons[k] === "string") {
        config.icons[k] = resolveServerPath(config.icons[k], baseDir);
      }
    });
  }
  return config;
}


// =====================================================================
// 🎨 v1.87.2 — ICÔNES PERSONNALISÉES D'UN PLAN SERVEUR : ON SONDE
// =====================================================================
// Le préfixe `icon/` est ambigu : il désigne les icônes livrées avec l'app
// (à la racine du site) ET celles ajoutées dans le générateur, qui vivent
// dans le ZIP et atterrissent donc dans `<dossier du plan>/icon/`.
//
// 🩸 Deviner d'après un catalogue a échoué (v1.86.2 → régression sur
// `icon/iconetrack.png`, absent de `TAGS_BUILTIN` alors qu'il est bien une
// icône de l'app). On ne devine plus : on DEMANDE au serveur. Une icône n'est
// réécrite vers le dossier du plan que si elle s'y trouve VRAIMENT.
//
// Coût : une requête par icône déclarée, uniquement pour les plans SERVEUR,
// en parallèle, et le Service Worker les met en cache ensuite.
// 🛟 Fail-safe : toute erreur (réseau, 404, CORS) laisse le chemin à la
// racine — c'est le comportement historique, celui qui marche pour l'immense
// majorité des cas.
async function resoudreIconesPlanServeur(config, baseDir) {
  const base = String(baseDir || "").replace(/\/+$/, "");
  if (!config || !config.icons || !base || base === "data") return config;
  const cles = Object.keys(config.icons).filter(function (k) {
    const v = config.icons[k];
    return typeof v === "string" && v.indexOf("icon/") === 0;
  });
  if (!cles.length) return config;
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

// Exposé : `planOffline.js` doit énumérer EXACTEMENT les mêmes icônes que
// le chargement réel, sinon le pré-cache et le rendu divergent.
window.resoudreIconesPlanServeur = resoudreIconesPlanServeur;

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

    // 🎨 v1.87.2 — les icônes PERSO du plan, sondées pour de vrai (cf.
    // resoudreIconesPlanServeur). Await : le rendu des marqueurs lit
    // config.icons juste après, une résolution tardive arriverait trop tard.
    config = await resoudreIconesPlanServeur(config, baseDir);

    // 🩸 v1.88.3 — le DOSSIER DU PLAN, retenu sur la config. Le tuilage en a
    // besoin : le generateur ecrit toujours les tuiles dans `<plan>/data/tiles`,
    // alors que l emplacement de l image, lui, depend de la recette de
    // deploiement. Deriver la racine des tuiles du seul baseImage se trompait
    // donc sur les plans deployes a l ancienne (constat KARMA).
    config._baseDir = baseDir;

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
    existing.showRoadIntersections = APP_CONFIG.showRoadIntersections === true;   // ⚠️ v1.74.0 : default FALSE
    existing.smartNav              = APP_CONFIG.smartNav === true;                 // 🧭 Nav C2 : default false
    if (Number.isFinite(APP_CONFIG.smartNavRadiusM))       existing.smartNavRadiusM       = APP_CONFIG.smartNavRadiusM;       // 🆕 v1.49.0
    if (Number.isFinite(APP_CONFIG.smartNavHeadingWeight)) existing.smartNavHeadingWeight = APP_CONFIG.smartNavHeadingWeight; // 🆕 v1.49.0
    existing.snapDraw              = APP_CONFIG.snapDraw === true;
    existing.panneauxAncres        = APP_CONFIG.panneauxAncres === true;        // 🪟 v1.85.1 : defaut CENTRE
    existing.vibrationEnabled      = APP_CONFIG.vibrationEnabled === true;      // 📳 v1.85.2 : defaut OFF
    existing.batterieEnabled       = APP_CONFIG.batterieEnabled !== false;      // 🔋 v1.85.2 : defaut ON                 // 🧲 C5 v1.74.0 : default false
    if (Number.isFinite(APP_CONFIG.snapDrawPx) && APP_CONFIG.snapDrawPx > 0) existing.snapDrawPx = APP_CONFIG.snapDrawPx;
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
// HELPER PER-PLAN : showRoadIntersections (v1.36.2)
// =========================
// KARMA feedback : "enleve l'option du home, met le dans la config du plan
// (relatif au plan)". L'option "afficher les ronds aux intersections" passe
// de GLOBALE à PER-PLAN. Stockage : `myktamap_plan_prefs_<planId>` (JSON).
// Fallback : la pref GLOBALE existante (`app_user_prefs.showRoadIntersections`)
// sert de défaut si pas encore de pref per-plan saisie — préserve le choix
// utilisateur historique sans le forcer à reconfigurer plan par plan.
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

// Lecture avec fallback en cascade :
//   1. Pref per-plan (clé dédiée localStorage)
//   2. Pref globale historique APP_CONFIG.showRoadIntersections
//   3. Default FALSE (⚠️ basculé en v1.74.0 — cf. DEFAULT_CONFIG)
// Renvoie un boolean.
// ⚠️ Les 2 premiers niveaux restent prioritaires : un user qui avait activé
// les cercles explicitement (per-plan ou global) les GARDE. Seuls ceux qui
// n'ont jamais touché le toggle basculent sur OFF.
function getPlanShowsIntersections(planId) {
  const pid = planId || window._currentLoadedPlanId || "default";
  const prefs = _readPlanPrefs(pid);
  if (typeof prefs.showRoadIntersections === "boolean") {
    return prefs.showRoadIntersections;
  }
  // Fallback global (rétrocompat user qui avait désactivé globalement)
  if (window.APP_CONFIG && typeof window.APP_CONFIG.showRoadIntersections === "boolean") {
    return window.APP_CONFIG.showRoadIntersections;
  }
  return false; // ⚠️ v1.74.0 : default OFF (était true)
}

// Setter per-plan + re-render à chaud. Appelé par le toggle dans Réglages
// map mode (v1.36.2).
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

// =========================
// HELPER PER-PLAN : NAVIGATION INTELLIGENTE (v1.85.3)
// =========================
// 🩸 POURQUOI ELLE CHANGE DE PORTÉE. « Caler la position sur les tracés »
// dépend de la QUALITÉ DU RÉSEAU DE TRACÉS DU PLAN COURANT. Stockée
// globalement, l'activer sur un relevé bien tracé l'activait aussi sur un plan
// qui n'a aucun tracé — où elle ne peut rien caler. Or « Afficher les ronds aux
// intersections », qui dépend exactement du même réseau, était DÉJÀ par plan
// depuis la v1.36.2 : deux réglages de même nature, deux portées différentes.
// Audit KARMA du 07/09.
//
// 🩸 AUCUNE PERTE : la lecture retombe sur la valeur GLOBALE existante tant que
// le plan n'a pas la sienne. Un utilisateur qui avait activé la nav la retrouve
// activée partout, puis chaque plan diverge dès qu'il y touche. Même mécanique
// de migration que `getPlanShowsIntersections`.
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
    // Bornes reprises de la validation existante des Réglages : une valeur
    // hors bornes n'est pas une préférence, c'est une saisie fautive.
    if (Number.isFinite(v) && v > 0) prefs[k] = v;
  });
  _writePlanPrefs(pid, prefs);
  // Applique tout de suite : le tracker lit APP_CONFIG, pas les prefs.
  if (typeof prefs.smartNav === "boolean") APP_CONFIG.smartNav = prefs.smartNav;
  if (Number.isFinite(Number(prefs.smartNavRadiusM))) APP_CONFIG.smartNavRadiusM = Number(prefs.smartNavRadiusM);
  if (Number.isFinite(Number(prefs.smartNavHeadingWeight))) APP_CONFIG.smartNavHeadingWeight = Number(prefs.smartNavHeadingWeight);
  window.APP_CONFIG = APP_CONFIG;
  console.log("[Config] smartNav (plan " + pid + ") →", JSON.stringify(patch));
}

// =========================
// HELPER PER-PLAN : northOffsetDeg (v1.37.0)
// =========================
// Lecture cascade pour la calibration Nord du plan courant :
//   1. Pref per-plan LS (saisie via Réglages map mode → "🧭 Calibrer le Nord")
//   2. APP_CONFIG.northOffsetDeg (mappé depuis plan-config.json > plan.northOffsetDeg
//      au load, écrit par le générateur avancé)
//   3. Default 0 (= Nord = haut du plan, comportement strict v1.36.x)
//
// Rétro-compat : tout plan sans `northOffsetDeg` dans plan-config.json
// + sans pref LS → renvoie 0 → tracker/boussole/rose-des-vents inchangés.
// Renvoie un nombre dans [0, 360[.
function getPlanNorthOffset(planId) {
  const pid = planId || window._currentLoadedPlanId || "default";
  const prefs = _readPlanPrefs(pid);
  if (typeof prefs.northOffsetDeg === "number" && Number.isFinite(prefs.northOffsetDeg)) {
    return _normalizeAngleDeg(prefs.northOffsetDeg);
  }
  // Fallback plan-config.json (hardcoded par auteur plan via générateur avancé)
  if (window.APP_CONFIG && typeof window.APP_CONFIG.northOffsetDeg === "number") {
    return _normalizeAngleDeg(window.APP_CONFIG.northOffsetDeg);
  }
  return 0;
}

// Setter per-plan. Persiste en LS, notifie les modules visuels qui dépendent
// du Nord (tracker marker, boussole, rose des vents header) via un custom
// event `kta:northOffsetChange` pour qu'ils re-rendent sans reload.
// `value` peut être un string ou number — normalisé via _normalizeAngleDeg.
function setPlanNorthOffset(planId, value) {
  const pid = planId || window._currentLoadedPlanId || "default";
  const newValue = _normalizeAngleDeg(value);
  const prefs = _readPlanPrefs(pid);
  prefs.northOffsetDeg = newValue;
  _writePlanPrefs(pid, prefs);
  console.log("[Config] northOffsetDeg (plan " + pid + ") →", newValue + "°");
  // Notif visuelle à chaud — chaque module concerné écoute cet event et
  // re-render son indicateur Nord. Pas de reload requis.
  try {
    window.dispatchEvent(new CustomEvent("kta:northOffsetChange", {
      detail: { planId: pid, northOffsetDeg: newValue }
    }));
  } catch(e) {}
}

// Reset per-plan (retire la pref LS → cascade retombe sur plan-config.json
// ou default 0). Utile pour le bouton "↺ Réinitialiser" du toggle.
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

// =========================
// 🎯 v1.76.1 — ÉCHELLE PER-PLAN (bug remonté par KARMA le 06/08)
// =========================
// L'échelle modifiée dans ⚙️ Réglages n'était persistée NULLE PART :
// `appliquerConfig` écrivait APP_CONFIG.scale en mémoire, mais
// `sauvegarderPrefsUtilisateur` ne la sauvait pas et le chargement de plan la
// relisait exclusivement du plan-config.json — la valeur tenait jusqu'au
// prochain reload puis retombait sur celle du ZIP. Frère jumeau du bug
// magnétisme (v1.75.0), révélé par les reloads systématiques du checkup M3.
// L'échelle est PER-PLAN par nature (chaque plan a la sienne) → même pattern
// que northOffsetDeg : pref LS `myktamap_plan_prefs_<planId>.scale`,
// cascade prefs > plan-config > défaut.
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
// Applique l'override per-plan sur APP_CONFIG.scale — à appeler UNE fois
// l'id du plan connu (lancerApplication), jamais depuis buildAppConfigFromPlan
// (l'id n'y est pas encore posé, on lirait la pref du plan précédent).
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

// =========================
// 👣 v1.82.0 — RÉGLAGES DE PODOMÈTRE PERSISTÉS PER-PLAN
// =========================
// TROISIÈME OCCURRENCE DU MÊME DÉFAUT. Un réglage modifié dans ⚙️ Réglages
// était écrit dans APP_CONFIG *en mémoire*, que `sauvegarderPrefsUtilisateur`
// ne sauvait pas et que `buildAppConfigFromPlan` réécrivait depuis le
// plan-config au chargement suivant. La valeur tenait jusqu'au reload, puis
// retombait — sans rien dire.
//   • v1.75.0 : le magnétisme (résolu en pref globale)
//   • v1.76.1 : l'échelle (résolue en pref PER-PLAN, cf. setPlanScale)
//   • v1.82.0 : la taille du pas, le seuil et le cooldown — signalés par
//     KARMA : « je modifie ces valeurs et applique, quand je quitte et
//     reviens elles sont revenues par défaut ».
//
// Per-plan, comme l'échelle : un podomètre se règle sur la foulée de
// l'utilisateur ET sur le terrain du plan. Le stocker globalement
// contaminerait tous les autres plans.
//
// Les bornes sont celles de l'écran de saisie (interfaceConfig.js), et le
// refus est SEC — pas de clamp, comme setPlanScale : une valeur hors bornes
// est un bug d'appelant, la corriger en silence le masquerait.
const PODO_BORNES = {
  stepLength:    { min: 0,   max: 1.5  },
  stepThreshold: { min: 10,  max: 30   },
  stepCooldown:  { min: 300, max: 3000 },
  startX:        { min: 0,   max: Infinity },
  startY:        { min: 0,   max: Infinity }
};

function setPlanTracking(planId, patch) {
  const pid = planId || window._currentLoadedPlanId || "default";
  if (!patch || typeof patch !== "object") return false;
  const prefs = _readPlanPrefs(pid);
  let n = 0;
  Object.keys(PODO_BORNES).forEach(function (k) {
    if (!(k in patch)) return;
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

// Applique les overrides — MÊME CONTRAINTE que appliquerScalePerPlan : à
// appeler une fois l'id du plan connu (lancerApplication), jamais depuis
// buildAppConfigFromPlan où l'on lirait les prefs du plan PRÉCÉDENT.
function appliquerTrackingPerPlan() {
  const pid = window._currentLoadedPlanId || "default";
  const prefs = _readPlanPrefs(pid);
  if (!window.APP_CONFIG) return;
  Object.keys(PODO_BORNES).forEach(function (k) {
    const v = Number(prefs[k]);
    const b = PODO_BORNES[k];
    if (!Number.isFinite(v) || v < b.min || v > b.max) return;
    window.APP_CONFIG[k] = v;
    console.log("[Config] " + k + " per-plan appliqué :", v);
  });
}
window.setPlanTracking         = setPlanTracking;
window.appliquerTrackingPerPlan = appliquerTrackingPerPlan;

// 🧭 v1.85.3 — la nav intelligente suit la MEME contrainte : appliquee une fois
// l id du plan connu, JAMAIS depuis buildAppConfigFromPlan ou l on lirait les
// prefs du plan PRECEDENT.
function appliquerSmartNavPerPlan() {
  const v = getPlanSmartNav();
  APP_CONFIG.smartNav              = v.smartNav === true;
  APP_CONFIG.smartNavRadiusM       = v.smartNavRadiusM;
  APP_CONFIG.smartNavHeadingWeight = v.smartNavHeadingWeight;
  window.APP_CONFIG = APP_CONFIG;
  console.log("[Config] smartNav applique pour ce plan :", v.smartNav);
}
window.appliquerSmartNavPerPlan = appliquerSmartNavPerPlan;

// =========================
// 📉 v1.83.0 — PROFONDEUR DES NIVEAUX
// =========================
// Jusqu'ici un niveau était un ENTIER NU : -1, 0, +1. Aucune altitude nulle
// part dans le projet (vérifié : `kmzExport.js` écrit même `alt = 0` en dur,
// et le GPX n'émet aucun `<ele>`). Un relevé multi-étages était donc plat.
//
// RÉFÉRENCE : la SURFACE, négatif vers le bas (arbitrage KARMA). Le niveau 0
// vaut -25 m par défaut, le pas entre étages 5 m. C'est plus informatif que
// « relatif au niveau 0 » — un cataphile sait qu'il est à 20 m sous la rue —
// et ça ne coûte rien : un profil ne lit que des DIFFÉRENCES, n'importe
// quelle référence cohérente conviendrait.
//
// TROIS ÉTATS, et la distinction porte du sens :
//   • absent            → NON RENSEIGNÉ. C'est l'état de tout plan généré
//                         avant cette version : on ne peut pas deviner la
//                         profondeur d'un plan existant, et l'inventer
//                         changerait ses distances en silence.
//   • nombre            → profondeur en mètres sous la surface (négative).
//   • null              → SANS PROFONDEUR, explicitement. Le cas du niveau
//                         +1 que l'import SIG utilise pour le topo
//                         historique : ce n'est pas un étage physique au
//                         dessus, c'est une convention d'empilement pour
//                         séparer deux relevés du MÊME endroit. Lui donner
//                         une altitude fausserait tout profil qui le
//                         traverse.
//
// Les deux derniers états s'excluent du profil et laissent les jonctions en
// 2D. Seul l'affichage les distingue.
const PROF_NIVEAU0_DEFAUT = -25;   // mètres sous la surface
const PROF_PAS_DEFAUT     = 5;     // mètres entre deux étages

// Profondeurs d'un plan : { "<niveau>": nombre|null }. {} = rien renseigné.
// Cascade : préférence per-plan d'abord (l'utilisateur), puis le plan-config
// (ce que le générateur a écrit) — même ordre que l'échelle.
function getPlanProfondeurs(planId) {
  const pid = planId || window._currentLoadedPlanId || "default";
  const prefs = _readPlanPrefs(pid);
  if (prefs.niveauxProfondeur && typeof prefs.niveauxProfondeur === "object") {
    return prefs.niveauxProfondeur;
  }
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

// Profondeur d'UN niveau, ou null si non renseignée / sans profondeur.
// Les deux cas se traitent pareil partout : c'est le point.
function getProfondeurNiveau(niveau, planId) {
  const t = getPlanProfondeurs(planId);
  const v = t[String(niveau)];
  return Number.isFinite(v) ? v : null;
}

// Table pré-remplie proposée à la saisie : niveau 0 au défaut, puis le pas
// de part et d'autre. Ce n'est qu'une PROPOSITION — une carrière réelle n'a
// pas un pas régulier, chaque valeur reste éditable.
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
window.PROF_NIVEAU0_DEFAUT  = PROF_NIVEAU0_DEFAUT;
window.PROF_PAS_DEFAUT      = PROF_PAS_DEFAUT;

// =========================
// 🧭 v1.76.1 — ESTIMATION DU POINT B DE GÉOREF (demande KARMA 06/08)
// =========================
// Cas d'usage : on connaît le GPS d'UN seul point (A, ex. l'entrée), mais le
// plan a une ÉCHELLE fiable (px/m) et son orientation Nord est calibrée
// (northOffsetDeg — 0 par défaut = Nord en haut, croissant HORAIRE, même
// convention que la boussole/tracker). Ces deux données contiennent déjà tout
// ce que le point B apporte : on peut donc le DÉDUIRE au lieu de le mesurer.
//
// Math : Δpixels → mètres via l'échelle, rotation ANTI-horaire de
// +northOffsetDeg pour passer du repère image au repère géographique
// (vérif. : offset 90° = « le Nord pointe vers la droite du plan » → un
// vecteur vers la droite de l'image doit devenir plein Nord), puis mètres →
// degrés en approximation locale (1° lat ≈ 111 320 m ; lng corrigé par
// cos(lat) — erreur < 0,1 % sous 10 km d'emprise, négligeable devant
// l'hypothèse d'orientation elle-même).
//
// REFUS, PAS DE CLAMP (règle KARMA) : rend null si A incomplet, échelle
// invalide (≤ 0 / non finie) ou latitude trop polaire (|lat| > 85° :
// cos(lat) → 0, le calcul de longitude diverge).
//
// Retourne { x, y, lat, lng, estimated: true } — le format EXACT d'un point
// de calibration : tout l'aval (Vue OSM, KMZ/GPX, Secours) le consomme sans
// modification. `estimated` est un marqueur d'honnêteté, affiché par les UI.
function ktaEstimerPointB(pointA, pixelB, scalePxM, northOffsetDeg) {
  if (!pointA || !pixelB) return null;
  // ⚠️ null/undefined AVANT Number() : Number(null) vaut 0 (finite !) — un A
  // avec lat:null serait « estimé » depuis l'équateur au lieu d'être refusé.
  // Attrapé par check-georef-estimation au premier run.
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
  // Rotation anti-horaire de +theta (cf. démonstration en tête).
  const estVrai  = estPlan * Math.cos(theta) - nordPlan * Math.sin(theta);
  const nordVrai = estPlan * Math.sin(theta) + nordPlan * Math.cos(theta);

  const M_PAR_DEG = 111320;
  const lat = alat + nordVrai / M_PAR_DEG;
  const lng = alng + estVrai / (M_PAR_DEG * Math.cos(alat * Math.PI / 180));
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { x: bx, y: by, lat: lat, lng: lng, estimated: true };
}
window.ktaEstimerPointB = ktaEstimerPointB;

// Coin d'image le plus éloigné d'un point — position du B virtuel (longue
// base = moins de bruit numérique dans le transform aval ; la position n'a
// aucun sens physique, le point est synthétique par construction).
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
// 🆕 v1.36.2 — helpers per-plan pour showRoadIntersections (option déplacée
// de Configuration home → Réglages map mode, persistée par plan)
window.getPlanShowsIntersections   = getPlanShowsIntersections;
window.setPlanShowsIntersections   = setPlanShowsIntersections;
window.getPlanSmartNav             = getPlanSmartNav;    // 🧭 v1.85.3 — par plan
window.setPlanSmartNav             = setPlanSmartNav;
// 🧭 v1.37.0 — helpers per-plan pour northOffsetDeg (calibration Nord du
// plan — appliquée au tracker, à la boussole et à la rose des vents header)
window.getPlanNorthOffset          = getPlanNorthOffset;
window.setPlanNorthOffset          = setPlanNorthOffset;
window.resetPlanNorthOffset        = resetPlanNorthOffset;
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
