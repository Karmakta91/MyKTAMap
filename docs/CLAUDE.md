# CLAUDE.md — Contexte projet MyKTAMap

> Ce fichier est lu par Claude Code (et autres agents IA) au démarrage d'une session de travail
> sur ce dépôt. Il contient le **contexte essentiel** pour intervenir efficacement sur le projet
> sans relire l'intégralité du code à chaque fois.

---

## 🎯 Le projet en 30 secondes

**MyKTAMap** est une application web de **cartographie souterraine** (Leaflet + `L.CRS.Simple`),
conçue pour visualiser, annoter et exploiter des **plans à partir d'images haute résolution**,
**sans GPS**. Cible principale : cataphiles, spéléologues, sites souterrains/industriels.

- **Page unique** (PWA) : `index.html`
- **Stack** : HTML/CSS/JS vanilla + Leaflet (pas de framework, pas de bundler)
- **Production** : https://myktamap.fr
- **Dev** : https://devmap.is-underground.fr
- **Auteur** : Flavien VIDAL (alias KARMA)
- **Licence** : **CC BY-NC-SA 4.0** — usage non commercial, partage à l'identique, attribution requise. Usage commercial **strictement interdit** sans accord écrit préalable.
- **Collaboration** : ouverte **sur demande** (contributions, ports, intégrations, retours terrain). Aucune contribution acceptée sans accord écrit préalable de l'auteur — contact via le site officiel.

---

## 📁 Structure du dépôt

```
/
├── index.html                  ← Point d'entrée + loader + splash (source de vérité pour l'ordre des scripts)
├── manifest.json               ← Manifest PWA
├── sw.js                       ← Service Worker PWA (cache des assets, enregistré via /sw.js)
│                                  ℹ️ `js/sw.js` (orphelin) ET `js/import.html` ont été supprimés
│                                  le 09/05/2026 — seul ce SW racine est actif
│
├── css/
│   └── style.css               ← Styles globaux (charte dark)
│
├── js/                         ← Scripts chargés directement via <script> dans index.html
│   ├── debug.js                ← Capture logs console + GATING CENTRALISÉ debugMode
│   │                              (cf. § "Gating logs centralisé")
│   ├── config.js               ← APP_CONFIG, DEFAULT_CONFIG, runtime assets
│   ├── utils.js                ← convertCoord, choisirIcone, getIconUrlForPoint, telechargerPlan
│   ├── tiling.js               ← Tuilage image base (perfPreset)
│   ├── map.js                  ← Init Leaflet (preferCanvas:true), calques, _iconMap, TAGS_BUILTIN
│   ├── themeManager.js         ← v1.13.0 — Toggle thème clair/sombre limité mode carte
│   │                              window.ThemeManager = { init, getCurrent, setTheme,
│   │                              toggleTheme, onChange, isLight }
│   ├── gpxIO.js                ← v1.14.0 — Import + Export GPX 1.1 (réutilise calibrage
│   │                              KMZ). window.GpxIO = { exporter, parser, importer,
│   │                              verifierCalibrage, _appliquerImport }
│   │                              v1.15.0 : ajout track <desc> à l'export/parse + 'jonction'
│   │                              dans validTypes (roundtrip parfait).
│   ├── gpxImport.js            ← v1.15.0 — Reconversion d'un GPX MyKTAMap en ZIP MyKTAMap
│   │                              utilisable (pendant exact de kmzImport.js). Génère un
│   │                              canvas vierge auto-calibré sur les bounds GPS du GPX.
│   │                              window.GpxImport = { estGpxMyktamap, extraireGpx,
│   │                              extraireBoundsGps, genererCanvasVierge, ingestParsed,
│   │                              genererZipMyktamap }
│   ├── legendCustomization.js  ← v1.16.0 — Cascade session > plan > default pour les
│   │                              libellés / visibilité / entrées custom de la légende.
│   │                              4 catégories : icones/traces/zones/structures. Entrées
│   │                              custom DESSINABLES via `geometry` (polyline/polygon).
│   │                              window.LegendCustomization = { getLabel, isVisible,
│   │                              listEntries, listCustomEntries, addCustomEntry,
│   │                              removeCustomEntry, setSessionLabel, setSessionVisibility,
│   │                              ouvrirEditeur, findCustomEntry, onCustomEntriesChange }
│   ├── favoris.js              ← v1.16.0 — Favoris points POI par plan, stockage
│   │                              localStorage["myktamap_favoris_v1"] indexé par planId.
│   │                              Snapshots complets des points (résilience).
│   │                              window.Favoris = { loadPlan, getAll, isFav,
│   │                              findByPointId, add, remove, toggle, onChange }
│   ├── sessionBackups.js       ← v1.16.0 — Backup multi-rotations sessions, 10 snapshots
│   │                              FIFO en IDB (DB myktamap_backups v1 / store backups).
│   │                              4 triggers : auto 5min, boot pre/post restore, avant
│   │                              SessionPersist.clear, manuel. Restore par écriture
│   │                              localStorage + reload.
│   │                              window.SessionBackups = { init, snapshot, listAll,
│   │                              restore, remove, clearAll, onChange }
│   ├── tracking.js             ← Tracker capteurs mobile (PDR, expérimental)
│   │                              + flags _orientationListenerAttached/_motionListenerAttached
│   │                              (idempotency contre fuite après plan switch)
│   │                              + _trackingTimeline / _trackingStartTs (v1.12.0)
│   ├── trackerReplay.js        ← v1.12.0 — Modale Replay tracker + Export CSV
│   │                              window.TrackerReplay = { ouvrir, fermer, exporterCSV }
│   ├── batteryGuard.js         ← v1.12.0 — Indicateur batterie + warnings graduels
│   │                              window.BatteryGuard = { init, forceCheck, onChange, ... }
│   ├── heatmap.js              ← v1.12.0 — Heatmap (DÉSACTIVÉ, code en standby)
│   │                              ⚠️ NON chargé : script commenté dans index.html
│   │                              + retiré de sw.js > ASSETS_TO_CACHE
│   ├── emergencyMode.js        ← Mode urgence "panique" (depuis v1.10.1)
│   │                              + toggle 🗺️ Itinéraire dans minimap (v1.12.0)
│   │                              + rotation paysage cascade invalidateSize (v1.12.0)
│   ├── measure.js              ← Mesure de distance + ⬛ Surface (v1.12.0 : 2 modes)
│   ├── editor.js               ← Ajout de points + EDITOR_TAG_LABELS
│   ├── road.js                 ← Tracés routes (Principal/Secondaire/Chemin/itinerary)
│   │                              + cercles intersections (chemin>secondaire>principal)
│   │                              + halo néon SVG sur le type itinerary
│   ├── pathfinder.js           ← Module Dijkstra + graph builder pour la fonction Itinéraire
│   │                              (route plus courte sur réseau de polylines)
│   ├── zones.js                ← Zones polygonales (Eau/Remblais/Effondrement)
│   ├── searchPoints.js         ← Recherche de points (par nom, id, tag, calque)
│   ├── tableEditor.js          ← Éditeur JSON en tableau interactif
│   ├── exporter.js             ← Export PNG du plan (modale Mode rapide / Mode avancé)
│   ├── sessionExporter.js      ← Export session (Full / Avancé / Conversion bidirectionnelle)
│   ├── planRegistry.js         ← Registre multi-plans (localStorage + IndexedDB)
│   ├── createConf.js           ← Générateur ZIP de plan (UI afficherPlanner)
│   │                              + constantes PLANNER_DEFAULT_ICONS
│   │                              ⚠️ ancien nom : planner.js (renommé/fusionné)
│   ├── sessionPersist.js       ← Auto-save session (polling 1.5s + throttle adaptatif)
│   ├── oomGuard.js             ← Détection kill mémoire mobile + modale d'avertissement
│   │                              + showToast utilitaire (cf. § "OOMGuard")
│   ├── interface.js            ← UI principale, barre latérale, titre + plan switcher,
│   │                              légende, modales (incl. reset internet check)
│   └── main.js                 ← Orchestration, splash, auto-discovery serveur,
│                                   _libererRessourcesPlanPrecedent (cleanup factorisé)
│
├── data/                       ← Plans (un sous-dossier par plan)
│   ├── index.json              ← Liste des plans (auto-discovery serveur)
│   ├── test1/
│   │   ├── plan-config.json    ← Config du plan
│   │   ├── *.png               ← Images (base, calques, collision)
│   │   └── *.json              ← Données (puits, vehicule, cataphile, editor, ...)
│   └── test2/
│       └── ...
│
├── icon/                       ← Icônes par défaut (50×50 PNG transparent)
│   ├── pa.png, pb.png, pc.png, pe.png, ps.png       ← Puits
│   ├── peo.png, pef.png, eso.png, esf.png, cao.png, caf.png  ← Accès (vert/rouge)
│   ├── house.png, chatiere.png, passage.png, ...    ← Signalétique (tag `salle` → fichier house.png)
│   ├── iconetrack.png          ← Marqueur tracker
│   ├── mkm-full.png            ← Logo splash
│   └── karma.png               ← Signature
│
├── lib/leaflet/                ← Leaflet local (pour mode hors-ligne)
├── lib/jszip.min.js            ← JSZip (extraction des plans ZIP)
│
├── README.md                   ← Doc DEV (architecture, journal des modifications) — reste à la racine pour GitHub
├── LICENSE                     ← Licence CC BY-NC-SA 4.0 — reste à la racine pour GitHub
│
└── docs/                       ← Documentation projet (déplacée ici depuis la racine en v1.8.0)
    ├── CLAUDE.md               ← Contexte pour Claude/agents IA (ce fichier)
    ├── README_USER.md          ← Doc UTILISATEUR (intégrée à l'app via 📖)
    ├── AI_CONTEXT.md           ← Squelette enrichi pour la modale 🤖 Aide IA
    ├── NETWORK_AUDIT.html      ← Page de transparence audit (HTML formaté, ouverte depuis ⚙️ Configuration → 🔒 → 📖)
    ├── NETWORK_AUDIT.md        ← Version source markdown de la page d'audit
    ├── nginx-csp-config.conf   ← Config CSP Nginx à déployer côté serveur (v1.8.0)
    ├── nginx-redirect-old-domain.conf  ← Conf Nginx pour la migration is-underground.fr → myktamap.fr
    └── alert-example-migration.json    ← Exemple de payload alert.json
```

> **Source de vérité pour les scripts** : l'ordre de chargement dans `index.html` (`<script src="js/...">`).
> Si un nom de fichier diverge entre cette doc et `index.html`, **`index.html` gagne**.

---

## 🧭 Conventions de code & style

### JavaScript

- **Vanilla JS**, pas de TypeScript, pas de bundler. Code lisible et direct.
- **Fonctions globales** exposées via `window.xxx` quand elles doivent être appelées depuis d'autres modules.
- **Préfixe `_`** pour les fonctions privées d'un module (convention).
- **Pas de `import/export` ES6** — tous les scripts sont chargés directement via `<script>` dans `index.html` dans l'ordre.
- **Pas de Promise.all sans gestion d'erreur** — on préfère que le module continue même si un asset rate (warn dans la console).
- **`console.warn`/`console.error`** : préfixer avec `[ModuleName]` pour faciliter le debug.
- **JSDoc** : pas obligatoire, mais commentaires en français au-dessus des fonctions complexes.
- **Style indentation** : 2 espaces, lignes < 120 caractères.

### CSS

- **Charte dark** : fond `#1a1f2e` à `#0a0d18`, texte `#e8eaf0`/`#c8d0e0`/`#8892a4`.
- **Couleur d'accent** : `#f4c542` (jaune doré, splash + signature).
- **Bleu d'interaction** : `#8cb4ff`.
- **Préfixe `kta-`** pour toutes les classes custom de l'app (évite collision Leaflet).
- **Pas de Tailwind, pas de SCSS** — CSS pur.
- **Z-index hiérarchie** :
  - 1100 : titre fixe + plan switcher
  - 5000 : loader
  - 9999 : splash
  - 99999 : modales `.kta-readme-modal-overlay`
  - 100001 : sous-modales (au-dessus des modales parent)

### Nommage des tags d'icônes

Convention courte (cohérente avec `pa`, `pb`, `pc`, `pe`, `ps` historiques) :

| Format | Exemple | Usage |
|---|---|---|
| 2-3 lettres + suffixe `o`/`f` | `peo`, `pef`, `eso`, `esf`, `cao`, `caf` | Accès (ouvert/fermé) |
| Mot court | `salle`, `chatiere`, `passage` | Signalétique |

---

## 🏗️ Architecture clé à connaître

### 1. Cycle de vie d'un plan

```
F5 → splash visible (HTML statique)
   ↓
initApp() dans main.js
   ├─ _splashStart() (timestamp)
   ├─ PlanRegistry.init()
   ├─ decouvrirPlansServeur() ← lit data/index.json
   ├─ Si registre vide ET data/plan-config.json existe :
   │   └─ chargement auto (rétro-compat)
   ├─ Sinon → afficherLoader() (home avec liste)
   └─ _splashEnd() (en parallèle, min 3s)
```

### 2. Cascade de résolution des icônes (depuis 06/05/2026)

```
1. PLAN_CONFIG.icons[tag]            ← personnalisation par plan
2. _iconMap[tag] (via TAGS_BUILTIN)  ← built-in fallback dans map.js
3. PLAN_CONFIG.icons.default
4. _iconMap.default / iconeDefault   ← filet de sécurité
5. null
```

**Fonction centralisée** : `getIconUrlForPoint(point)` dans `utils.js`, exposée globalement.

Utilisée par : `searchPoints.js`, `utils.js > telechargerPlan`, `exporter.js`, `sessionExporter.js`.

**Pour ajouter un nouveau tag d'icône** (ex: `fontaine`) :

1. PNG 50×50 transparent → `icon/fontaine.png`
2. `map.js > TAGS_BUILTIN` : ajouter `fontaine: "icon/fontaine.png"`
3. `editor.js > EDITOR_TAG_LABELS` : ajouter `fontaine: "Fontaine"`
4. `interface.js > LEGENDE_LABELS` + groupe approprié dans le tableau `GROUPES`
5. `exporter.js > LBL` local + groupe dans `GROUPES_ICONES`
6. `createConf.js > PLANNER_DEFAULT_ICONS` : ajouter le chemin
7. `sw.js > ASSETS_TO_CACHE` : ajouter `"./icon/fontaine.png"`

→ Le tag est utilisable sur les **plans existants** sans modifier leurs `plan-config.json`.

### ⚠️ Maintenance du Service Worker (`sw.js` racine)

Le SW met en cache la liste `ASSETS_TO_CACHE`. **Quand on ajoute** :
- Un **nouveau fichier JS** dans `js/` chargé par `index.html` → l'ajouter à `ASSETS_TO_CACHE`
- Une **nouvelle icône** dans `icon/` référencée par les built-ins → idem
- Un fichier doc lu par l'app via `fetch()` (ex: `README_USER.md`) → idem
- **Bumper la version** `CACHE_NAME` (`v3` → `v4`...) pour forcer la purge du vieux cache chez les utilisateurs

Ne **PAS** cacher : `README.md` (doc dev), `CLAUDE.md` (contexte IA), `js/sw.js` (orphelin, le vrai SW est à la racine).

### 3. Multi-plans (depuis 06/05/2026)

- **`planRegistry.js`** gère la liste des plans connus.
- **localStorage** : `myktamap_plans` (registre + lastPlanId)
- **IndexedDB** : `myktamap_handles` (v2, 2 stores : `handles` pour FS Access API, `blobs` pour ZIPs mémorisés)
- **Auto-discovery** serveur via `data/index.json` :
  ```json
  { "plans": [{ "id": "test1", "path": "data/test1", "name": "Test 1" }] }
  ```
- **Persistance ZIP local** : `meta.fsHandle` (Chrome/Edge) ou `meta.storeBlob` (mobile/Safari).
- **Modale "Plan introuvable"** : `afficherModalePlanIntrouvable(plan, reason)` avec 4 cas (`server`, `local-blob`, `local-fs`, `local-fs-denied`).

### 4. Plan Switcher (titre cliquable, depuis 06/05/2026)

- `#kta-titre-fixe` est cliquable (`pointer-events: auto`).
- Au clic → `togglePlanSwitcher()` ouvre `#kta-plan-switcher` ancré sous le titre.
- Affiche les **3 derniers plans** EXCLUANT le plan en cours.
- Détection session active via `_sessionAModif()` :
  - `getEditorPoints/getRoads/getZones/getMeasurePoints/getTrackingPath` non-vides
- Si session active → modale d'avertissement avec liste détaillée des modifs perdues.

### 5. Légende exportée — 5 groupes équilibrés (depuis 06/05/2026)

Sections (cohérent avec la légende d'aide) :

1. 🕳️ Puits
2. 🪜 Accès
3. ⚠️ Signalétique
4. 🛣️ Tracés
5. ⬛ Zones
+ 🏷️ Autres (auto si tags custom)

**Algorithme** : chaque groupe est ajouté à la **colonne la moins haute** (en lignes cumulées).

**Filtrage par usage réel** : la légende n'affiche que les tags **effectivement présents** sur le plan exporté (via `tagsUtilises` collecté pendant le dessin des markers).

### 6. Splash screen

- HTML statique dans `<body>` → visible AVANT tout JS.
- `SPLASH_MIN_DURATION_MS = 3500` (constante dans `main.js`, depuis v1.8.1 — avant : 4000ms en v1.8.0 et antérieures).
- `_splashStart()` au début de `initApp()`, `_splashEnd()` en parallèle de `lancerApplication()`.
- **Une seule fois par session** (un changement de plan via 🗂️ ne ré-affiche PAS le splash).
- Assets : `icon/mkm-full.png` (logo) + `icon/karma.png` (signature).

### 7. Reset complet (`viderCacheAppli`)

Vidange totale de :

1. Service Worker (unregister)
2. Caches HTTP/PWA
3. localStorage
4. sessionStorage
5. **TOUTES** les bases IndexedDB (avec fallback Safari pour `myktamap_handles`)
6. `window.location.reload(true)`

**Pré-check Internet (depuis 09/05/2026)** : avant la double confirmation, `_pingInternet()` teste la connexion via `fetch no-cors` sur `gstatic.com/generate_204` (timeout 5s, combiné à `navigator.onLine`). Si offline → modale rouge insistante (`_resetFlowOfflineWarning`) explique que l'app sera inutilisable après reset (pas de SW + caches vides → splash bloqué au reboot car aucun asset à descendre). User peut forcer "Continuer quand même". Si online → flow direct.

Total confirmations : **2** quand online, **3** quand offline.

Accessible depuis :

- ⚙️ Réglages (dans l'app)
- ⚙️ Configuration (dans le loader, depuis v1.7.3 — cf §39)

### 8. Mode performance — 5 presets DLSS-like (depuis 08/05/2026)

Remplace l'ancienne checkbox boolean `perfMode` par un **segmented control 5 boutons** dans le loader.

**Table `PERF_PRESETS`** (dans `tiling.js`, exposée via `window.PERF_PRESETS`) :

| Preset | `MAX_WORK_DIM` | `TILE_SIZE` | JPEG Q | Quand on tile |
|---|---|---|---|---|
| `off` | — | — | — | **JAMAIS** (rendu direct via `L.imageOverlay`, équivalent ancien `perfMode = false`) |
| `auto` | (Équilibré quand tile) | — | — | si `fileSize > 60 Mo` (= `PERF_AUTO_TILE_THRESHOLD`) |
| `quality` | 12288 | 1024 | 0.95 | si `imageW × imageH > 4096²` (= `tuilingNecessaire()`) |
| `balanced` | 8192 | 1024 | 0.88 | idem |
| `performance` | 6144 | 768 | 0.78 | idem |

→ `off` = aucun tiling, choix utilisateur explicite (⚠️ risque de crash Safari iOS pour images > 8192 px). Métadonnées dans `PERF_OFF_META`.
→ `auto` = comportement v1 (tile uniquement sur fichier énorme).
→ Modes explicites = on tile dès que techniquement nécessaire (sécurité GPU mobile), avec leurs params propres.

**Fonction centralisée** : `resoudrePerfPreset(preset, fileSize, W, H)` retourne `{tile: bool, params: {maxWorkDim, tileSize, jpegQuality} | null}`. Utilisée par `chargerImage()`.

**Persistance par plan** :

```
PlanRegistry[planId].perfPreset    ← optionnel, valeur "auto"|"quality"|"balanced"|"performance"
                                     absent = pas de pref → défaut "auto"
```

Helpers : `PlanRegistry.getPerfPreset(id)` / `setPerfPreset(id, preset)`. Validation contre la liste valide, warn console en cas d'invalide.

**`plan-config.json` n'est PAS modifié** — le preset est purement un choix utilisateur côté app, jamais dans le ZIP.

**Cascade de résolution au chargement** :

1. `presetChoisi` passé explicitement à `startImportedPlan` ou `chargerPlanServeur` (via le loader)
2. Sinon `APP_CONFIG.perfPreset` (qui vient de `DEFAULT_CONFIG.perfPreset = "auto"`)
3. `resoudrePerfPreset` décide ensuite si on tile et avec quels params

**UI** : segmented control `.kta-perf-segmented` dans `index.html` (4 `.kta-perf-btn` avec `data-preset`). Bouton actif = fond `#f4c542` + texte `#1a1f2e`. Inactif = `rgba(255,255,255,0.04)` + texte `#c8d0e0`. Description italique `#8892a4` sous le segmented (texte du preset actif). Ligne debug technique cachée par défaut, visible si `APP_CONFIG.debugMode === true`.

**Helpers exposés sur `window`** :
- `getLoaderPerfPreset()` → string du preset actif dans le loader
- `setLoaderPerfPreset(preset)` → met à jour le segmented + la description + la ligne debug

### 9. Auto-save de session (`sessionPersist.js`, depuis 08/05/2026)

Sauvegarde silencieuse de la session active (editor + roads + zones + measure) dans `localStorage["myktamap_session_v1"]` jusqu'à v1.16.0, puis **per-plan `myktamap_session_v1_<planId>` depuis v1.16.1** (cf §57).

**Stratégie** : ~~slot unique~~ **slot PAR PLAN (v1.16.1+)**, polling 1.5s, comparaison de hash pour détecter les modifs, save aussi sur `beforeunload` + `visibilitychange`. Tracker path EXCLU (PDR expérimental). **Depuis v1.8.1** : itinéraires (`road.type === "itinerary"`) INCLUS via **restore en 2 phases** :

- **Phase 1 (immédiate)** au `onPlanLoaded` : restore de toutes les roads SAUF itinéraires + tous les autres calques (editor, zones, measure). L'user voit son contexte de travail apparaître.
- **Phase 2 (+1500ms via `setTimeout`)** : ajout de l'itinéraire à la session (via `setRoads(getRoads().concat(itineraires))`). 1500ms est le compromis qui laisse Leaflet finir son `fitBounds` initial + les tuiles V2 se placer + les autres modules s'initialiser (Pathfinder, label distance, etc.).

**Pourquoi** : l'itinéraire est rendu avec un CSS `drop-shadow` double (halo néon cyan) coûteux en compositing GPU. Au boot, ce rendu se cumulait avec Leaflet en cours de stabilisation + tuiles V2 en cours de placement → saturait le GPU mobile → crash silencieux (reload boucle infinie). Le différé mime le timing du flow d'import session manuel (qui marche sans crash car l'app est déjà stabilisée).

**Sécurité phase 2** : check si un itinéraire existe déjà dans `getRoads()` au moment du setTimeout (cas où l'user a lancé la modale Itinéraire entre temps) → skip pour ne pas avoir 2 itinéraires actifs simultanément.

**Hypothèse** v1.8.0 initiale (réactiver sans précaution car "browsers 2026 plus tolérants") s'est révélée fausse en test KARMA : crash reproductible même en mode V2 sur du matos moderne. Le différé est donc la bonne approche.

**API** : `window.SessionPersist`
- `onPlanLoaded(planId)` → appelé par `main.js > lancerApplication()` après init complète. Restaure si `saved.planId === planId`, purge si différent
- `save()` / `clear()` / `getSaved()` → utilitaires

**Workflow** :
1. Plan chargé → `_currentLoadedPlanId` set dans `chargerPlanServeur` ou `startImportedPlan`
2. `lancerApplication()` finit, appelle `SessionPersist.onPlanLoaded(window._currentLoadedPlanId)`
3. Si match → restore via setters (`setEditorPoints`, `resetRoads + setRoads`, `resetZones + setZones`, `setMeasurePoints`) + toast "Session restaurée"
4. Polling auto-save démarre (1.5s)

**Modale** : `.kta-session-modal-overlay` (centrée pleine page, pattern `kta-readme-modal`), boîte `.kta-session-modal-boite` avec icône ↻ dans cercle jaune `#f4c542`, titre + détail + 2 boutons (🗑️ Effacer / ✓ Continuer). Backdrop click + Échap = Continuer. Animations fade-in overlay + pop-in box.

**Format storage** :
```json
{ "version": 1, "planId": "...", "savedAt": "ISO", "editorPoints": [...], "roads": [...], "zones": [...], "measure": [...] }
```

**Pourquoi polling et pas hooks ?** : pas besoin de modifier editor/road/zones/measure individuellement. Lag de 1.5s imperceptible. Risque zéro d'oublier un point de modification.

### 10. Flag `debugMode` (renommage de `motionDebug`, depuis 08/05/2026)

Le flag debug est désormais **global pour toute l'app**, pas uniquement le tracker.

**Usage actuel** :
- Logs verbose dans `tracking.js` (Magnitude + détection de pas)
- Affichage de la ligne technique sous le segmented control du loader (`MAX:8192 / TILE:1024 / Q:0.88 / tile si > 60 Mo`)

**Persistance** : `localStorage.app_user_prefs.debugMode` (boolean). Helper unique `window.setDebugMode(value)` — utilisé par :
- Bouton 🐛 dans le loader (`#loaderDebugBtn`)
- Toggle Réglages ⚙️ (`#cfg_debugMode`)

**Migration silencieuse au boot** (dans `config.js`, IIFE `_migrerPrefsUtilisateur`) :
- `motionDebug` → `debugMode` (préserve la valeur)
- `perfMode` (globale) → SUPPRIMÉE (perfPreset est par plan désormais)

Idempotente : peut tourner 100 fois sans effet de bord.

### 11. Gating centralisé des logs (`debug.js`, depuis 09/05/2026)

`debug.js` proxie `console.log/info/warn/error` pour les capter dans un buffer (modale 🐛 Logs accessible depuis Réglages). Le gating est en deux niveaux :

| | DevTools console | Buffer (modale 🐛) |
|---|---|---|
| `console.log` / `console.info` | Visible **si debugMode = true** | Bufferisé **si debugMode = true** |
| `console.warn` / `console.error` | Toujours visible | Toujours bufferisé |

**Pourquoi gater AUSSI le buffer ?** (changement le 09/05/2026, suite 16) — Sans ça, `tracking.js` (60 logs/s en mode actif via `[Tracking] Magnitude :`) pollue le localStorage et pousse les warn/error utiles hors du buffer (limite 300 entries). En debug OFF on ne garde que les warn/error : modale 🐛 reste lisible même après une session intensive de tracking.

**Convention de tag** : préfixer chaque log avec `[Module]` (ex : `[Road] Mode :`, `[Tracking] Magnitude :`, `[Export rapide] résumé layer loop`). Plus de gating manuel `if (APP_CONFIG?.debugMode)` à coder dans les modules.

### 12. OOMGuard — détection kill mémoire mobile (`oomGuard.js`, depuis 09/05/2026)

iOS Safari et Android Chrome tuent silencieusement les PWA qui dépassent leur budget mémoire (~500 MB iOS). La page redémarre sans event ni erreur. OOMGuard rend ce kill explicite :

**Mécanisme** :
1. Au boot du module → `_checkPreviousKill()` : si `localStorage["myktamap_session_alive"]` est présent et < 1h → kill brutal probable (l'app n'a pas atteint `beforeunload`/`pagehide`).
2. `start()` (appelé par `lancerApplication`) → set marker au boot puis heartbeat toutes les 5s.
3. `beforeunload` ET `pagehide` → clear marker (iOS préfère `pagehide`).
4. Modale d'avertissement affichée après le splash via `flushPendingToasts` (queue, pour éviter d'afficher derrière le gradient sombre).

**Modale `_afficherModaleKill`** : style `.kta-readme-modal-overlay` avec contenu `.kta-oom-*`. Bordure rouge + glow, titre `⚠️ ATTENTION — ARRÊT BRUTAL DÉTECTÉ ⚠️` (avec ⚠️ qui pulsent), sections "Pourquoi ?" + "Comment éviter" (liste de conseils : fermer apps, baisser perfPreset, garder OS à jour, etc.) + "Détails techniques".

**API `window.OOMGuard`** :
- `start()` — démarre l'heartbeat
- `showToast(message, type)` — toast court (`warn`/`error`/`info`), file derrière le splash
- `flushPendingToasts()` — vide la file (appelé depuis `_splashEnd`)

**Toast quota** : `sessionPersist.js` détecte `QuotaExceededError` au save et appelle `OOMGuard.showToast(...)` pour avertir l'utilisateur d'exporter manuellement (anti-spam : 1 fois max tant que le quota dure).

### 13. Perf hardening mobile (depuis 09/05/2026)

Optims user-invisibles pour réduire le risque de crash sur smartphone, **sans aucun changement graphique** :

- **`preferCanvas: true`** sur init Leaflet (`map.js`) → polylines (routes), polygons (zones), `circleMarker` rendus sur 1 canvas au lieu de N éléments SVG. Markers (icon images) restent en DOM. Gain perf sur plans denses.
- **`_libererRessourcesPlanPrecedent()`** dans `main.js` factorise le cleanup au plan switch : libère les tuiles (overlay + blob URLs), `map.remove()`, **vide explicitement** `collisionCanvas` (width/height à 0 → libération immédiate des pixels, jusqu'à 64 MB sur plans 4K) puis nullifie ses refs, `resetRuntimeAssets`, reset des flags d'init.
- **Listeners device idempotents** : `tracking.js` utilise `_orientationListenerAttached`/`_motionListenerAttached` pour empêcher la duplication des handlers `deviceorientation`/`devicemotion` après plan switch + nouveau Play.
- **SessionPersist throttle adaptatif** : `save()` mesure le main thread via micro-bench. Si busy → skip (max 6 skips consécutifs ≈ 9s avant force). `beforeunload`/`visibilitychange` appellent `save({force:true})` pour ne jamais perdre les dernières modifs.

### 14. Itinéraire / Pathfinding (`pathfinder.js` + `interface.js`, depuis 09/05/2026)

Calcul d'un trajet le plus court entre N waypoints en suivant le réseau de polylines existantes (session `getRoads()` + calques `getEmbeddedRoads()`).

**Algorithme** (`js/pathfinder.js`, module IIFE) :
1. **Construction du graphe** (`_buildGraph`) — chaque point d'une polyline = nœud, connecté à son voisin par une arête euclidienne. Spatial-bucketing 1.5 px pour fusionner les points coïncidents.
2. **Enrichissement** (`_enrichirGrapheAvecCroisements`) — gère 3 cas de jonction entre polylines distinctes :
   - Croisement strict segment-segment (intersection paramétrique)
   - T-junction (extrémité d'un segment à ≤ 15 px de l'intérieur d'un autre, avec projection orthogonale)
   - Endpoint↔endpoint (2 extrémités distinctes à 1.5 < d < 15 px)
   → ajout de nœuds virtuels et arêtes ad-hoc. Sans ça, les roads tracés à la main qui se croisent sans partager de point exact restent dans des composantes graphe disjointes.
3. **Snap des waypoints** (`_insertVirtualNode`) — projection orthogonale du waypoint sur le segment le plus proche, insertion d'un nœud virtuel à la projection (split du segment d'origine).
4. **Dijkstra** entre paires consécutives, concaténation des chemins.

**API publique** :
- `Pathfinder.computeRoute(waypoints, opts)` → `{ path, totalDistance (px), segmentCount, snappedPoints }`. Throw avec message lisible si waypoints insuffisants, graphe vide, ou pair de waypoints isolée dans une composante.
- `SearchPoints.getAllPoints()` / `findByQuery(q)` (ajoutées dans `searchPoints.js`) — utilisées par la modale itinéraire pour l'autocomplete.

**UI** (modale `kta-itinerary-modal` dans `interface.js`) :
- Entrée : sous-action **🗺️ Calculer un itinéraire** dans le groupe Tracker (cohérent avec ▶️ tracking + 📍 recalage).
- 2 modes selon état :
  - **Calcul** (pas d'itinéraire actif) : input recherche autocomplete + toggle mode clic carte (avec floater compact en bas pour ne pas bloquer la carte) + liste de waypoints avec ✕ par ligne + bouton 🎯 Calculer.
  - **Navigation** (itinéraire actif détecté) : titre "Itinéraire actif", quick-nav `⏮️ Début / ⏭️ Fin / 🔁 Tour complet`, liste des waypoints avec 🎯 (pan + flash style search) et ✕, boutons 🔄 Recalculer / ❌ Effacer.

**Persistance des waypoints** : la road de type `"itinerary"` porte une propriété `waypoints: [{x, y, label, source}, ...]` en plus de `points`. SessionPersist sauve la road comme n'importe quelle autre, donc les waypoints survivent au reload du plan. Au reopen de la modale, on bascule en mode navigation si `road.waypoints` est présent.

**Style du tracé** :
- `road.js > ROAD_STYLES.itinerary` : cyan `#00d4ff`, weight 7, dashArray "12 6", opacity 0.9.
- `renderer: L.svg()` forcé sur la polyline (sinon canvas → pas de filter CSS).
- CSS `.kta-itinerary-polyline` : `filter: drop-shadow(...)` × 2 → effet halo néon cyan.
- Filtré du calcul des cercles d'intersection (`renderRoads`) pour éviter les cercles redondants.

**Label de distance** : `L.control` au coin `bottomleft` (`.kta-iti-distance`, fond `#1a1f2e` + accent cyan), s'affiche dès qu'une road de type `"itinerary"` existe, masqué sinon. Empilé au-dessus du label measure naturellement (Leaflet stack DOM order).

**Helper `_majLabelDistanceItineraire`** exposé sur `window`, appelé après chaque setRoads (save/discard/erase) et après `lancerApplication` pour gérer le restore session.

**Sémantique** : un seul itinéraire actif à la fois. Recalculer remplace le précédent (filter sur `r.type !== "itinerary"`). Effacer le retire. Switch de plan le perd (reset normal de la session).

### 15. Distance totale des tracés (`interface.js`, depuis 2026-05-09)

Outil de mesure agrégée : somme des longueurs de tous les tracés Principal / Secondaire / Chemin présents (session `getRoads()` + calques `getAllEmbeddedRoads()` — TOUTES, masquées comprises depuis v146), avec filtrage par type via cases à cocher et surlignage magenta des tronçons inclus.

**⚠️ Depuis v146 (2026-05-14)** : `_rdRoadsExploitables()` utilise `getAllEmbeddedRoads()` (et plus `getEmbeddedRoads()` qui filtrait par visibilité). Cohérence avec Pathfinder + Search : l'utilisateur peut masquer le calque routes (dessinées en dur sur le PNG) pour gagner en perf rendu, tout en gardant un total fiable. Le surlignage magenta est aussi appliqué sur les roads masquées (layer séparé qui se voit indépendamment du calque sous-jacent).

**Entrée UI** : sous-action **📏 Distance totale (filtres)** dans le groupe accordéon **🛣️ Tracés / Routes** (`interface.js > _creerGroupeAccordeon({id:"traces"})`). Toggle ON/OFF — re-cliquer ferme la modale.

**Modale plein écran** (`#kta-rd-modal`, shell `.kta-readme-modal-overlay` + `.kta-rd-modal-boite`) — pattern identique aux autres modales du projet (itinéraire, légende, config) :
- Boîte centrée 480px max, `max-height: 90vh`.
- Header : titre "📏 Distance totale des tracés" + ✕.
- Corps :
  - Phrase d'aide (avec mention "magenta" colorée et explication de la persistance après fermeture).
  - 3 lignes checkbox stylées en boîtes (`background: rgba(...,0.03)`, hover magenta) avec swatch coloré + label + compteur live `nb — distM m`.
  - Bloc total mis en avant (fond magenta 6%, bordure 22%), valeur 20px gras `#ff4ecb`.
- Footer actions :
  - `❌ Effacer le surlignage` (`.kta-btn-danger`) — retire le highlight ET ferme.
  - `✓ Fermer (garder le surlignage)` (`.kta-btn-primary`) — ferme uniquement la modale.
- Toggle checkbox → `_rdRedessinerHighlight()` + `_rdRafraichirAffichage()` instantané.

**Sémantique de persistance** :
- ✕ / clic backdrop / ✓ Fermer → ferme la modale, **garde le surlignage actif sur la carte**. L'utilisateur peut explorer la carte avec les tronçons toujours surlignés.
- Re-clic 📏 → rouvre la modale en restaurant les filtres précédents (détecté via `_rdHighlightLayer !== null`). Si pas de surlignage actif, reset à "tous cochés".
- ❌ Effacer → retire le surlignage ET ferme la modale.
- Plan switch → cleanup automatique via `main.js > _libererRessourcesPlanPrecedent()`.

### 16. Format de distance unifié m / km (depuis 09/05/2026)

Les 3 outils de mesure (📐 Mesure simple, 📏 Distance totale, 🗺️ Itinéraire) utilisent un seul helper `window.formatDistance(distM, decimalsM)` (dans `utils.js`) qui bascule automatiquement en kilomètres au-delà de 1000 m :
- `< 1000 m` → `"123.4 m"` (decimalsM décimales, défaut 1)
- `≥ 1000 m` → `"1.23 km"` (toujours 2 décimales en km, ~10 m de précision)

**Pour ajouter un nouvel affichage de distance** (ex : nouvel export, nouvelle modale) : NE PAS coder `distM.toFixed(N) + " m"` à la main. Utiliser `window.formatDistance(distM, N)` pour profiter automatiquement de la conversion km. Le grep `toFixed.*"\\s*m"` doit rester vide dans le repo.

**⚠️ Piège noms de fonctions top-level** (lié au bug suite 9 du 09/05/2026) :

Dans un script chargé via `<script src="...">` (pas un module ES), une `function FOO()` au top-level devient implicitement `window.FOO`. Si plus bas dans le même fichier on fait `window.FOO = function() { ...; FOO(); }`, le wrapper export ÉCRASE la fonction privée et toute auto-référence boucle sur lui-même → récursion infinie silencieuse → l'app fait... rien.

**Convention** : pour les modules avec un export `window.foo = function()` ET un cleanup interne du même nom, préfixer la version privée par `_internalFoo` ou `_privFoo`. Voir `interface.js > _rdInternalEffacerHighlight()` qui est l'implémentation réelle, et `window._rdEffacerHighlight` qui est juste le wrapper exposé pour main.js (plan switch).

**Highlight magenta** :
- `L.layerGroup` dédié `_rdHighlightLayer` (créé à l'ouverture, purgé à la fermeture / plan switch).
- ⚠️ **Perf critique** : UNE SEULE `L.polyline` avec un array d'arrays `[[seg1latlngs], [seg2latlngs], ...]` qui rend tous les segments dans UN SEUL `<path>` SVG. Si on créait N polylines avec chacune un `filter: drop-shadow`, le compositing GPU explose dès ~10 routes sur mobile (kill iOS Safari). Le format multi-segments natif Leaflet permet 1 seul élément DOM = 1 seul drop-shadow appliqué = coût ~constant.
- `weight: 9, opacity: 0.85, color: "#ff4ecb"`, renderer `L.svg()` forcé pour permettre le `drop-shadow` CSS (preferCanvas = true par défaut).
- Classe CSS `.kta-rd-highlight-polyline` : `filter: drop-shadow(0 0 4px ...) drop-shadow(0 0 10px ...)` magenta.
- `pointer-events: none` → ne bloque pas les clics natifs sur la carte.

**Calcul** :
- `_rdRoadsExploitables()` retourne `session + tous embedded` (visibles ET masquées depuis v146) filtré sur types `principal/secondaire/chemin` (exclut explicitement `itinerary` pour éviter le double-comptage).
- `_rdLongueurPx(road)` : somme euclidienne des distances entre points consécutifs.
- `_rdCalculerBreakdown()` : convertit en mètres via `APP_CONFIG.scale` (px/m) et retourne `{principal:{nb,distM}, secondaire:{...}, chemin:{...}, totalM}`.

**Hooks de rafraîchissement live** :
- `road.js > renderRoads()` appelle `window._rdOnRoadsChanged()` à la fin → si le panneau est ouvert, le surlignage et les compteurs sont mis à jour automatiquement (utilisateur trace une nouvelle road, efface une road, etc.).
- `overlayadd/overlayremove` (toggle calque) déclenche `renderRoads` (listener déjà en place dans `initRoad`), donc le panneau suit aussi.

**Cleanup au plan switch** : `main.js > _libererRessourcesPlanPrecedent()` appelle `window._rdEffacerHighlight()` AVANT `map.remove()` pour éviter qu'un layer détaché flotte ou que le panneau se superpose au splash.

**Pas dans la légende des exports PNG** : la fonctionnalité est purement runtime (panneau + surlignage). Aucun changement à `exporter.js / utils.js > telechargerPlan`. Les magenta polylines ne sont pas dessinées dans le canvas d'export car pas dans `roadsData` ni dans `getEmbeddedRoads()` (c'est un layerGroup parallèle dédié).

**API exposée** :
- `window.ouvrirRoadsDistanceFloater()` — toggle ouverture/fermeture du panneau
- `window._rdEffacerHighlight()` — cleanup forcé (utilisé par main.js au plan switch)
- `window._rdOnRoadsChanged()` — hook appelé par road.js > renderRoads

---

### 17. SessionPersist autoritative pour les editor points (depuis 09/05/2026)

`data/editor.json` peut contenir des points figés dans le plan (cas typique : utilisateur a fait un Convert session→data pour persister vers le ZIP). `SessionPersist` (localStorage) sauve ses propres editorPoints qui peuvent diverger.

**Règle** : si la session SessionPersist a des `editorPoints` pour le plan courant, on **skip** le fetch de `data/editor.json` côté `main.js > initDataFromConfig`. La session est autoritative — sinon les markers du JSON arrivent async APRÈS le restore et créent des doublons / des markers fantômes hors `listePoints`.

**Implémentation** : peek `localStorage["myktamap_session_v1"]` AVANT de lancer les fetches. Si match plan + nom + editorPoints non vide → flag `_skipEditorJsonLoad = true` → forEach saute le calque editor.

**Conséquence pour les autres calques** : aucune. Seul l'editor a ce problème car il a une vraie source de vérité côté listePoints. Les puits, vehicules, etc. sont read-only depuis le JSON.

### 18. Protection juridique du code (Phase 1 légale, depuis 09/05/2026)

**Auteur** : Flavien VIDAL (vrai nom civil, pour la force probante légale) — alias KARMA pour la continuité de marque visible.

**Licence** : CC BY-NC-SA 4.0 — usage commercial interdit sans accord écrit préalable. Fichier `LICENSE` à la racine.

**Module `js/copyright.js`** chargé EN PREMIER dans `index.html` :
- `window.__MKM__` watermark (frozen object avec author/copyright/license/build) — preuve d'origine en cas de copie.
- Console banner stylé au boot (visible à F12). Bypass volontaire du proxy `debug.js` (chargé après) → reste visible même en `debugMode = false`.
- **Détection DevTools conditionnée à `APP_CONFIG.debugMode === true`** : si debug ON, polling 2s heuristique outer/inner > 280px → toast `.kta-devtools-warn` (badge "DEBUG" pour signaler la nature outil-dev). Si debug OFF, aucune polling, zéro overhead. Toggle live du mode debug fonctionne (pas besoin de reload). Skip si une modale charte est ouverte (anti faux positif sur transitions viewport).
- Toujours dans `ASSETS_TO_CACHE` du SW.

**Headers copyright** dans les fichiers JS critiques : `main.js`, `utils.js`, `interface.js`, `pathfinder.js`, `planRegistry.js`, `sessionPersist.js`, `oomGuard.js`. Format `/*! MyKTAMap (c) 2026 Flavien VIDAL ... */`. Si quelqu'un copie un fichier isolé, le copyright le suit.

**Mentions visibles utilisateur** :
- Footer loader : `© 2026 Flavien VIDAL · CC BY-NC-SA 4.0 · Usage commercial interdit`
- Splash : signature `karma.png` (pseudo artistique, déjà en place)
- Meta tags `<head>` : `author`, `copyright`, `license`

**Pour ajouter un nouveau fichier JS** : ajouter le header copyright en tête (8 lignes max). Utile surtout pour les algorithmes métier (genre pathfinder).

**Phase 2.1 (build pipeline)** non encore en place — projet en vanilla JS sans bundler. À mettre en place via esbuild minification + bundle pour la version prod (le repo privé garde le source lisible). Attention : SW à mettre à jour pour pointer sur le bundle minifié au lieu de la liste `js/*.js`.

### 19. Calque "Mes annotations" (depuis 09/05/2026)

Le calque `editor` dans le contrôle des couches Leaflet (label hardcoded **"Mes annotations"**) regroupe les annotations utilisateur de la session :
- ✏️ Points ajoutés via l'éditeur
- ⬛ Zones de session (Eau/Remblais/Effondrement)
- 🛣️ Roads de session (Principal/Secondaire/Chemin)
- ⭕ Cercles d'intersection des roads

**Exclus du calque** (rendus directement sur `window.map` pour cycle de vie propre) :
- 🗺️ Itinéraire (type `"itinerary"`) — modale Itinéraire
- 📐 Mesure / 🧭 Tracker — modes propres
- Labels `L.control` bottomleft, surlignage magenta "Distance totale"

**Implémentation** :
- `road.js > _targetLayerForRoad(roadType)` : `window.map` si "itinerary", sinon `window.layerEditor || window.map`.
- `zones.js > _zoneTarget()` : `window.layerEditor || window.map`.
- `editor.js > _ajouterMarker` : `addTo(window.layerEditor)`.
- `map.js > initMapFromConfig` : auto-création de `editor` si absent du plan-config (fallback pour vieux plans).

**⚠️ Bug Leaflet observé non résolu** : sur certaines configurations, le toggle off du LayerGroup ne propage PAS aux polylines roads (zones + markers OK). Une tentative de calque séparé "Mes tracés" pour les roads a été rollback car ne résolvait pas le bug. À investiguer plus tard si critique pour un user.

**Label dans le contrôle des couches** : forcé hardcoded "Mes annotations" pour le calque `id: "editor"` (override le `layerConfig.label` du plan-config). Plans existants avec "Ajouts" affichent automatiquement "Mes annotations" sans regénération.

### 20. Live config files (`version.json`, `alert.json`) (depuis 11-13/05/2026)

Pattern de **fichiers JSON à la racine non cachés par le SW**, fetched live à chaque boot avec cache-bust, pour permettre à l'auteur de pousser des changements **sans bumper le SW ni le code JS**.

**Deux fichiers actuels** :

| Fichier | Module client | Rôle | Cache SW |
|---|---|---|---|
| `version.json` | `js/updateChecker.js` | Détection de mise à jour + popup propose mise à jour douce (purge cache PWA, garde session) ou reset complet | ❌ Non caché |
| `alert.json` | `js/alertChecker.js` | Diffusion d'alertes publiques en temps réel (incendie, fermeture, etc.) — modale rouge pulsante après splash | ❌ Non caché |

**Pourquoi pas cacher** : on veut TOUJOURS la valeur serveur, sans bypass via le SW cache-first. Le fetch utilise `?_=${Date.now()}` + `cache: "no-store"` pour contourner aussi les caches HTTP intermédiaires. Si offline → fetch échoue silencieusement, pas de popup (comportement normal).

**Format `alert.json` (v163+, multi-alertes)** :
```json
{
  "active": true | false,
  "alerts": [
    {
      "id":       "migration-myktamap-fr-2026",
      "level":    "info" | "warning" | "emergency",
      "title":    "...",
      "message":  "...",
      "details":  ["..."],
      "released": "ISO timestamp"
    },
    ...
  ]
}
```

**Rétro-compat** : l'ancien format mono-alerte (sans `alerts[]`, avec `level`/`title`/`message` au top-level) est toujours accepté. `alertChecker.js > _normaliserPayload()` le wrap automatiquement en `alerts: [{id: "legacy-<released>", ...}]`.

L'auteur active/désactive **en éditant uniquement ce fichier** :
- `"active": false` OU renommer `alert.json` → `alert.lock` (404 traité comme `no-alert`) → toutes les alertes deviennent inactives
- Pour rediffuser après désactivation : remettre `"active": true` avec un **nouveau `released` timestamp sur chaque alerte qu'on veut re-pousser** → force re-popup chez ceux qui avaient acquitté
- Pour escalader le niveau d'une alerte existante (ex: `info → warning → emergency`) : modifier `level` ET `released` → force re-popup avec nouvelle couleur

**Persistance d'acquittement (v163+)** : `localStorage["myktamap_alert_seen_<id>"]` stocke le `released` acquitté pour CHAQUE alerte individuellement. Permet d'acquitter migration sans toucher à incendie. Fallback rétro-compat sur `localStorage["myktamap_alert_seen"]` (mono) pour les id `legacy-*`.

**Bouton 🚨 du loader — coloration dynamique (v163+)** :
- `🚨 rouge pulsant` si au moins 1 alerte `emergency` non acquittée
- `🚨 orange` si au moins 1 `warning`
- `🚨 bleu discret` si seulement `info`
- `🚨 gris neutre` si aucune alerte active
- **Pastille compteur** (cercle rouge en haut-droite) si N > 1 alertes non acquittées
- Click → `AlertChecker.showCurrent()` qui re-fetch + bypass acquittement + affiche TOUTES les alertes actives en cascade
- L'update du badge est notifié via `AlertChecker.onChange(callback)` après chaque `check()` ou `dismiss()`

**Affichage en cascade** : `_afficherCascade(alerts)` dans `alertChecker.js` itère sur les alertes triées par priorité (`emergency > warning > info`) puis `released` desc. Chaque modale appelle le callback `onClose` qui déclenche la suivante après 250ms de fade-out.

**Modales** (dans `interface.js`) :
- `window.afficherModaleAlerte(alert, onClose)` — `onClose` (v163+, optionnel) callback à la fermeture, utilisé par la cascade
- `window.afficherModaleAlerteAbsente(status)` — modale verte sobre "Aucune alerte en cours" / "Vérification impossible" (offline)

**Hook splash** : pattern identique à `OOMGuard.flushPendingToasts()` et `UpdateChecker.notifySplashEnded()`. Les modales en attente sont flushed par `main.js > _splashEnd()` après le fade-out, jamais par-dessus le gradient sombre du splash.

**Pour ajouter un nouveau fichier live-config** (futur) : créer le `.json` à la racine, NE PAS le mettre dans `ASSETS_TO_CACHE`, créer un module `js/xxxChecker.js` qui suit le pattern (fetch cache-bust + queue splash + notifySplashEnded). Toujours documenter le commentaire d'en-tête de `sw.js` pour rappeler "NE PAS cacher".

### 21. Mode Performance ULTRA (`js/perfUltra.js`, depuis 13/05/2026)

Module de toggles d'optimisation activables pour gérer les crash mémoire sur très gros plans (4000+ × 2000+ pixels avec beaucoup de tracés). Aucune optim ne touche à l'image — ce périmètre est déjà couvert par le **Mode performance preset** au chargement (cf. §8). Le mode ULTRA cible **uniquement** les éléments vectoriels (polylines, markers, intersections, polling).

**Singleton `window.PerfUltra`** (`js/perfUltra.js`, ~150 lignes) :
- `get(key)` / `set(key, value, opts?)` / `setUltra(bool)` / `getAll()` / `isUltra()` / `onChange(callback)`
- 6 toggles individuels : `decim`, `animOff`, `noIntersect`, `noTooltips`, `slowSave`, `viewportCull`
- `ultra` = méta-toggle calculé (true si les 6 sont ON)
- Persistance `localStorage["myktamap_perf_toggles"]` (préférence globale, pas par plan, cohérent avec `debugMode`)
- Defaults all `false` → comportement existant strictement préservé

**Modules consommateurs** (lecture via `window.PerfUltra.get()`) :

| Toggle | Module | Comportement |
|---|---|---|
| `decim` | `road.js > renderRoads` | Applique RDP (`_decimatePointsRDP`) avec epsilon dynamique selon zoom (0/2/4/8/16 px). Skip sur `type === "itinerary"` (précision navigation > perf) et si `points.length <= 8`. Re-render hook sur `moveend/zoomend`. |
| `animOff` | `map.js > L.map()` | `zoomAnimation/fadeAnimation/markerZoomAnimation: false`. **Lu UNIQUEMENT à init** → reload requis. UI signale via `.kta-perf-ultra-row-danger` (liseré orange). |
| `noIntersect` | `road.js > _calculerIntersectionsRoads` | Seuil `_roadIntersectionMaxRoads()` → 50 si actif, 200 sinon. Lu à chaque appel. |
| `noTooltips` | `utils.js > ajouterPointsDepuisJSON` | Skip `bindPopup` sur markers data-layer. Points session éditeur gardent leurs popups. Compromis : user passe par 🔍 pour interagir. |
| `slowSave` | `sessionPersist.js > _currentPollInterval` | `POLL_INTERVAL_SLOW_MS = 30000` au lieu de 1500. Hook `onChange` → restart polling avec nouvel intervalle (sans reload). |
| `viewportCull` | `road.js > renderRoads` | AABB check vs `map.getBounds()` + 10% padding. Skip création L.polyline si road hors viewport. Skip culling sur `type === "itinerary"`. Re-render hook sur `moveend/zoomend`. |

**UI dans `js/interface.js > afficherConfig`** :
- `_renderPerfUltraSection()` génère le HTML — section dédiée après "Debug", avant les boutons d'action
- 1 toggle master ULTRA (accent jaune `#f4c542`) + 6 toggles individuels
- Hint italique sous chaque toggle explicitant le trade-off perf/visuel
- `_bindPerfUltraToggles()` appelé après `documentElement.appendChild(modal)`
- Master ULTRA → `setUltra(value)` qui applique aux 6 d'un coup + re-render la modale pour refléter
- Toggles individuels → `set(key, value)` + sync visuel du master (coché si `isUltra()`)

**Pattern pour ajouter un toggle** :
1. Ajouter la clé dans `TOGGLES` array de `perfUltra.js`
2. Lire `window.PerfUltra.get("nouvelleClé")` dans le module concerné
3. S'inscrire à `onChange` si re-render dynamique nécessaire
4. Ajouter la rangée HTML dans `_renderPerfUltraSection()` + mapping dans `_bindPerfUltraToggles()`

**Helpers RDP dans `road.js`** :
- `_decimationEpsilon()` → 0/2/4/8/16 selon `map.getZoom()` (0 = pas de décim au zoom proche)
- `_decimatePointsRDP(pts, epsilon)` → RDP **itératif** (évite récursion profonde sur longues polylines) avec stack manuelle. ~30 lignes.
- `_perpDist(p, a, b)` → distance perpendiculaire d'un point au segment

### 22. Sources de vérité version & Badge version footer (depuis 13/05/2026)

**3 sources de vérité version à bumper ensemble à chaque release** :

| Source | Champ | Format actuel (depuis v1.7.1) | Rôle |
|---|---|---|---|
| `sw.js` | `CACHE_NAME` | `myktamap-cache-v1.7.1` | Cache PWA — bump force la purge + re-cache au prochain SW install |
| `js/copyright.js` | `__MKM__.build` | `"v1.7.1"` | Constante embarquée dans le code, affichée dans le badge footer (version installée) |
| `version.json` | `version` | `"v1.7.1"` | Source serveur, comparée par UpdateChecker pour détecter les updates dispo |

**🔢 Format de version — semver-like depuis v1.7.1 (18/05/2026)** :

Avant : `vNNN` (v143, v170, v173…). Maintenant : `vX.Y.Z` :
- **X = MAJOR** : actuel = **1**. Passera à **2** uniquement quand on aura un backend (notion de comptes, partage cloud, etc. — pas avant longtemps).
- **Y = MINOR** : évolutions majeures du projet (multi-plan, V2 tuilé, M-LVL, KMZ, etc.). Cf. tableau de mapping rétroactif dans le journal v1.7.1 du README.md.
- **Z = PATCH** : améliorations / bug fixes / raffinements UX qui ne changent pas l'architecture.

Les anciennes entrées du journal restent nommées en `vNNN` (historique préservé). Nouveau format uniquement à partir de v1.7.1.

**⚠️ Pour les futurs bumps** : décider à chaque release si la change relève d'un PATCH (Z+1), MINOR (Y+1, Z=0), ou MAJOR (X+1, Y=0, Z=0). Quand on hésite → PATCH par défaut, réserver MINOR pour les vraies évolutions architecturales visibles user. MAJOR uniquement quand le modèle de données ou la nature de l'app change fondamentalement (= backend).

**Limite UpdateChecker actuelle** : compare les versions en string simple (`"v1.7.1" !== "v1.7.2"` → nouvelle version détectée). Marche tant qu'on a pas de versions à 2+ chiffres dans un même segment (`v1.7.10` vs `v1.7.9` en string : `"v1.7.10" < "v1.7.9"`). À refactorer en vrai semver compare quand on dépassera 9 patches d'affilée sans MINOR bump.

**Convention de bump** :
- Pour une **vraie release** : les 3 sources ensemble (sw + copyright + version)
- Pour un **test du badge clignotant** : bump UNIQUEMENT `version.json` (simule une nouvelle version côté serveur sans modifier le code)
- Pour un **fix CSS qui doit être propagé** : bump `sw.js` + au choix `copyright.js` selon si on veut afficher la même version qu'avant ou pas

**Badge version cliquable** (`index.html > _initFooterVersion`) :
- `<span id="loaderCopyrightVersion">` dans le footer du loader, en fin de `.kta-loader-copyright-line2`
- 2 états :
  - **Normal** : `v143` gris monospace
  - **Update dispo** : `v141 → v143` bleu clignotant (`.kta-loader-copyright-version-update` + animation `kta-version-update-pulse` 1.8s)
- Évaluation initiale via `localStorage["myktamap_last_version_data"]` (cache UpdateChecker) au DOM ready
- Re-évaluation via `UpdateChecker.onCheck()` callback après le fetch frais (couvre le cas où la version a changé entre 2 boots)
- Au clic : `UpdateChecker.showCurrent()` qui force le re-fetch + affiche soit la modale d'update (bypass snooze), soit `afficherModaleAlerteAbsente("up-to-date")` qui montre les notes de la version installée

**Modale informative compacte** (`window.afficherModaleAlerteAbsente`) :
- 3 statuts : `"up-to-date"` (clic badge sans update), `"no-alert"` (clic 🚨 sans alerte), `"offline"`
- Conteneur dédié `.kta-alert-absent-overlay.kta-alert-absent-compact` (vs `.kta-readme-modal-overlay` qui est plus lourd) :
  - Backdrop **0.55 opacité** au lieu de 0.88 (plus léger)
  - Box max-width 440px, **hauteur déterminée par le contenu** (pas de plein écran inutile pour 2-3 lignes)
- Pour `"up-to-date"` : lit `localStorage["myktamap_last_version_data"]` et affiche un bloc `.kta-alert-absent-version-block` avec :
  - Date de publication (`released`)
  - Titre "📝 NOTES DE CETTE VERSION" en uppercase letter-spacing
  - Liste à puces des `notes[]`
- Fermeture : OK / clic backdrop / Échap

**API `window.UpdateChecker` exposée** :
- `check()` → wrap autour du check interne qui notifie ensuite les listeners. Lancé au boot.
- `notifySplashEnded()` → flush la modale différée si pendant le splash
- `showCurrent()` → force le re-fetch + modale update (bypass snooze + LS_SEEN) — appelé par le badge cliquable
- `onCheck(callback)` → s'inscrit aux résultats de check() pour l'UI (badge)
- `getCurrentVersion()` → lit `localStorage["myktamap_known_version"]`
- `getLastKnownData()` → lit `localStorage["myktamap_last_version_data"]`

### 23. Fermeture auto du mode tracé/zone après suppression (depuis v146 — 14/05/2026)

**Bug v145** : si l'utilisateur démarrait un tracé (ou une zone) puis ouvrait le menu suppression et choisissait "Tous les tracés" / "Dernier tracé entier" (quand c'était le tracé en cours), l'icône de la sidebar restait visuellement "actif" (classe `kta-actif`) mais `window.modeRoad` venait d'être remis à `null` par `resetRoads()` → clic sur la carte ne faisait rien (state incohérent).

**Origine** : double state entre `road.js` (qui gère `currentRoad` + `window.modeRoad`) et `interface.js` (qui gère `_modesActifs["road"]` + classe DOM sur le bouton). `resetRoads()` ne touche pas au state UI, ni `removeLastRoad()`.

**Fix** :
- `road.js` expose `window.getCurrentRoad()` (lecture seule de `currentRoad`).
- `zones.js` expose `window.getCurrentZone()` (idem).
- `interface.js` ajoute 2 helpers `_fermerModeRoad()` / `_fermerModeZone()` qui appellent `_modesActifs[k].desactiverFn()` + retirent la classe `kta-actif` du bouton + `delete _modesActifs[k]`.

**Logique conditionnelle** (appliquée aux onClicks du menu suppression + handlers du mode clic) :

| Action | Couper le mode ? |
|---|---|
| ↩️ Annuler dernier point | Non (user continue à tracer) |
| ✂️ Dernier tracé entier | Oui **si** `getCurrentRoad()` était non-null AVANT et null APRÈS |
| 🎯 Sélection au clic | Oui **si** la road cliquée === `getCurrentRoad()` capturé AVANT |
| 🗑️ Tous les tracés | Oui **inconditionnel** (resetRoads vide tout) |

Symétrique pour zones avec `getCurrentZone()`.

**Pour ajouter une nouvelle action de suppression** : si l'action peut effacer le `currentRoad`/`currentZone`, capturer la référence AVANT, comparer APRÈS, appeler `_fermerModeRoad()` ou `_fermerModeZone()` si la road/zone en cours a disparu. Ne pas appeler les helpers inconditionnellement sinon on coupe le mode même quand l'utilisateur supprime une vieille road sans rapport.

### 24. Fix heading tracker + sources d'orientation (depuis v147 — 14/05/2026)

**Bug v145 et avant** : la fonction `getHeading(α, β, γ)` dans `tracking.js` retournait un heading **inversé Est↔Ouest** pour téléphone tenu à plat (formule avec `+sin α cos β` au lieu de `-sin α cos β` sur la composante East), avec en plus des **termes spurious en γ** qui ne devraient pas exister dans la projection de l'axe Y device, et **aucune gestion** de la pose verticale (cos β ≈ 0 → calcul dégénéré). Retour terrain en carrière : "tourner à droite physiquement → tracker tourne à gauche, avancer → recule".

**Fix v147 dans `getHeading`** :

Math propre dérivée de la matrice W3C DeviceOrientation (rotation intrinsèque Z-X'-Y'', `R = Rz(α) · Rx(β) · Ry(γ)`).

- **Pose à plat** (`|cos β| > 0.5`) — pose "boussole", recommandée dans la doc utilisateur :
  - Projection axe Y device (top edge) en monde : `(-sin α cos β, cos α cos β, sin β)`
  - γ n'intervient pas (rotation autour de Y laisse Y invariant)
  - heading = `atan2(-sin α cos β, cos α cos β)`
- **Pose verticale** (`|cos β| ≤ 0.5`) — pose "lecture SMS", fallback :
  - Projection axe -Z device (dos / caméra) en monde
  - heading = `atan2(-(cos α sin γ + sin α sin β cos γ), -(sin α sin γ - cos α sin β cos γ))`

Validation math des 4 cardinaux (pose plate, β=0) :

| α | Direction réelle | Code v145 | Code v147 |
|---:|:---:|:---:|:---:|
| 0 | Nord (0°) | Nord ✅ | Nord ✅ |
| 270 | Est (90°) | Ouest ❌ | Est ✅ |
| 180 | Sud (180°) | Sud ✅ | Sud ✅ |
| 90 | Ouest (270°) | Est ❌ | Ouest ✅ |

**Cascade de sources d'orientation** (dans `initOrientation`) :

1. **iOS** : `event.webkitCompassHeading` — compass calibré natif (magnétomètre + capteurs fusion iOS), déjà en convention 0=N CW. **Priorité absolue** quand dispo (plus précis que tout calcul depuis α/β/γ).
2. **Android moderne** : listener `deviceorientationabsolute` au lieu de `deviceorientation` → l'event `event.alpha` est référencé true North magnétique (au lieu d'être relatif à la position de boot, ce qui cause une dérive sans recalage).
3. **Fallback** : calcul depuis (α, β, γ) via `getHeading` corrigé.

Choix du listener au boot : `if ("ondeviceorientationabsolute" in window)` → `deviceorientationabsolute` (Android), sinon `deviceorientation` (iOS, qui publie `webkitCompassHeading` sur cet event).

**API exposée** :
- `window.getCurrentHeading()` → retourne `direction` (lecture seule, degrés 0-360). Utilisé par le widget boussole (cf. §25).

**Log throttled** : `[Tracking] Heading : NNN.N° (source: webkitCompassHeading | calc-absolute | calc-relative)` à 1Hz max pendant le tracking actif. Permet de vérifier au debug quelle source feed le heading sur le device de l'utilisateur. Gating centralisé par debug.js (cf §11).

**À NE PAS TOUCHER** quand on intervient sur tracking.js :
- `requestPermission()` — iOS gesture flow. Pre-existing bug : ne demande que `DeviceMotionEvent.requestPermission`, pas `DeviceOrientationEvent.requestPermission`. Sur iOS 13+, certaines versions auto-grantent l'orientation avec la motion permission ; d'autres pas. À corriger dans un fix séparé si retour terrain iOS confirme un problème.
- `initMotion`, `avancer`, `estAccessible`, `initCollisionCache` — détection de pas + collision, indépendants du heading.
- Flags idempotents `_orientationListenerAttached` / `_motionListenerAttached` — protection plan switch.

### 25. Widget boussole + popup avertissement tracker (depuis v147 — 14/05/2026)

#### 25.1 Widget boussole (`js/compass.js`)

Outil de validation visuelle du heading : affiche la rose des vents `icon/mkm-full.png` (logo charte) qui contre-tourne en temps réel selon `window.getCurrentHeading()`. Permet à l'utilisateur de vérifier d'un coup d'œil que le heading est cohérent (marche vers Nord → N reste en haut, marche vers Est → N pointe à gauche, etc.).

**Architecture** : module IIFE `js/compass.js` (~200 lignes), expose `window.CompassWidget = { show, hide, toggle, isVisible, openFull, closeFull }`.

**Deux vues** :

1. **Widget flottant** (bottom-left top-left au final) :
   - Position : top-left sous les boutons de zoom Leaflet (`top: 80px + safe-area-top; left: 10px`).
   - Rose 100px desktop / 80px mobile.
   - Texte "N 12°" / "NE 45°" / "O 270°" sous la rose (notation française : O au lieu de W, NO au lieu de NW).
   - ✕ pour fermer entièrement, clic ailleurs sur le widget → ouvre le modal plein.
   - Border jaune au hover (signale la cliquabilité).

2. **Modal plein** (`.kta-readme-modal-overlay` standard) :
   - Ouvert au clic sur le widget flottant.
   - Rose 240px desktop / 180px mobile.
   - Cardinal en gros jaune (`#f4c542`) + angle en gris à côté.
   - Hint explicatif + liste de validation des 4 cardinaux.
   - Note rouge : armatures métalliques faussent le magnétomètre.
   - Fermable ✕ / backdrop / Échap → revient au widget flottant.

**Boucle rAF unifiée** : un seul `requestAnimationFrame` actif quand le widget est visible. Query unifiée via classes partagées :
- `.kta-compass-rotating-rose` → toutes les roses (widget + modal s'il est ouvert) reçoivent le `transform: rotate(-h deg)`
- `.kta-compass-text-display` → texte combiné "N 12°" du widget flottant
- `.kta-compass-cardinal-display` → cardinal seul du modal plein
- `.kta-compass-angle-display` → angle seul du modal plein

Throttle 0.5° avant re-application du transform (skip rerender CSS si heading stable).

**Entrée UI** : sous-action 🧭 dans le groupe accordéon **Tracker** (`interface.js`, après ▶️ Play, avant 📍 Mode recalage). Toggle visuel `kta-actif` synchronisé via hook `window._onCompassHiddenExternally` (déclenché si l'utilisateur ferme via la ✕ du widget plutôt que par re-clic sur la sous-action).

**Permission iOS** : `show()` appelle `requestPermission()` (idempotent côté tracking.js). Comme `show()` est invoqué depuis un click handler (sous-action 🧭), c'est un geste utilisateur valide pour iOS.

**Math de rotation** : `rotate(-direction deg)` sur la rose. Quand l'utilisateur est face au Nord (direction=0), rose normale. Face à l'Est (direction=90), rose contre-tournée 90° → N pointe à gauche du widget.

**Pourquoi pas une icône SVG dédiée ?** Réutiliser `icon/mkm-full.png` (rose des vents jaune du splash + logo PWA) garantit la cohérence visuelle avec l'identité de la marque sans charger un nouvel asset.

#### 25.2 Popup d'avertissement tracker

Modal affiché **une fois par session** au clic ▶️ Play. Rappelle que le module est expérimental et ne doit pas servir à se localiser en situation réelle.

**Flag in-memory** : `let _trackerWarningAcknowledged = false;` au module-scope dans `interface.js`. Réinitialisé à chaque reload de la page (par design — pas de localStorage : on veut que l'utilisateur revoie l'avertissement à chaque session).

**Fonction helper** : `_afficherAvertissementTracker(onConfirm)` dans `interface.js` (au module-scope, avant `initInterface`). Crée un overlay `.kta-readme-modal-overlay` + boîte `.kta-tracker-warn-boite` avec liseré rouge subtil. Contenu :
- Lead rouge : "Ne pas utiliser pour te repérer en situation réelle."
- Paragraphe sur la dérive cumulative + armatures métalliques.
- Section ✅ Utilisations recommandées (debug, calibration, détection pas).
- Section ❌ NE PAS utiliser pour (localisation réelle, itinéraire fiable, perte → ⛑️).
- Note italique : recalage 📍 indispensable tous les ~50m.
- Footer : Annuler (ghost) / "J'ai compris — Démarrer" (primary).

**Wire-up dans le onClick ▶️** :

```js
const _doStart = function() {
  requestPermission();    // ← appel SYNCHRONE depuis le click handler
  startTracking();
  btnSub.innerHTML = "⏹️";
  isTracking = true;
};
if (_trackerWarningAcknowledged) _doStart();
else _afficherAvertissementTracker(_doStart);
```

**⚠️ Critique iOS** : `DeviceMotionEvent.requestPermission()` doit être appelé depuis un geste utilisateur synchrone. Le clic sur "J'ai compris" EST un nouveau geste utilisateur (chaque event click est un user gesture indépendant), donc `requestPermission` appelé dans son handler est valide.

**À NE PAS FAIRE** : ajouter un `setTimeout` ou `await Promise(...)` entre le click et `requestPermission` → casse le user gesture iOS, la popup de permission n'apparaît plus, l'orientation n'est pas captée.

**Dismiss = Annuler** : clic backdrop / Échap / ✕ / bouton Annuler → modal disparaît sans démarrer le tracker (`_trackerWarningAcknowledged` reste false → la popup réapparaît au prochain clic ▶️).

**Le bouton 🧭 Boussole NE déclenche PAS cette popup** : le widget boussole est un outil de debug légitime (cf §25.1), pas un démarrage de tracking. Il appelle `requestPermission` directement sans rappel d'avertissement.

### 26. Mode multi-niveau (depuis v148 — 15/05/2026)

Feature opt-in **par plan** pour gérer les carrières/galeries à plusieurs étages (Glacière, Capucins…). Quand désactivé → comportement strictement identique à v147 (rétro-compat absolue).

#### 26.1 Opt-in (cascade de priorité)

```
APP_CONFIG.multiLevel ←
  PlanRegistry[id].multiLevel       (legacy ≤ v1.7.2 — UI Réglages retirée v1.7.3
                                     mais lecture conservée pour rétro-compat)
  ↓ sinon
  PLAN_CONFIG.plan.multiLevel       (depuis plan-config.json — SOURCE UNIQUE
                                     depuis v1.7.3, déclaré via le 📦 Générateur)
  ↓ sinon
  false                              (retro-compat plans v147)
```

**2 voies pour activer** (depuis v1.7.3) :
- Au moment de la création/modification d'un plan via 📦 Générateur → case `🏗️ Plan multi-niveau` → ajoute `plan.multiLevel: true` dans `plan-config.json`
- Édition manuelle de `plan-config.json` (champ `plan.multiLevel: true`)

> 🔧 **Changement v1.7.3** (KARMA, 19/05/2026) : retrait du toggle ⚙️ Réglages
> qui permettait d'activer/désactiver le multi-niveau pour un plan déjà chargé.
> Raison : forcer une déclaration explicite au moment du plan (générateur ou
> plan-config.json édité), évite les états incohérents où un plan "non
> multi-niveau" est activé runtime puis réinitialisé au reload. Les fonctions
> `_renderMultiLevelSection` et `_bindMultiLevelToggle` (`interface.js`) restent
> définies dans le code (dead code propre) mais ne sont plus appelées dans
> `afficherConfig`. La cascade `PlanRegistry[id].multiLevel` reste lue pour les
> users qui avaient toggle via l'ancien UI avant v1.7.3 (leur préférence est
> persistée et continue de marcher).

#### 26.2 Data model

**APP_CONFIG (runtime)** — défini dans `js/config.js` :
- `multiLevel: boolean` — feature active pour ce plan ?
- `activeLevel: number` — niveau utilisé pour dessiner de nouveaux items (default 0). **Peut être négatif** depuis v154 (sous-sols).
- `visibleLevels: number[]` — filtre d'affichage (multi-select, default `[0]`)
- `availableLevels: number[]` — niveaux disponibles dans le sélecteur (**default `[-2, -1, 0, 1, 2]` depuis v154**, symétrique autour de 0). Extensible via boutons `+` (max+1) et `−` (min−1) dans la modale. Auto-étendu au boot par `window._etendreAvailableLevelsSiBesoin()` si les data layers contiennent des niveaux hors range.

**Données persistées** :
- Roads : `road.level: number` (création) OU `{ type: "jonction", fromLevel, toLevel }`
- Zones : `zone.level: number`
- Editor points : `point.level: number`
- Data layer items : `level: number` optionnel dans le JSON (`puits.json`, etc.)
- Roads embarquées dans data layers : `road.level: number` optionnel
- Zones embarquées dans data layers : `zone.level: number` optionnel
- **Image layers (depuis v162)** : `plan-config.json > imageLayers[i].level: number` optionnel. Filtré au runtime via `_applyLevelFilterToImageLayers()`. Modale Niveaux = authority → force `addLayer`/`removeLayer` selon `visibleLevels` (override le checkbox Leaflet). Le générateur expose un champ "Niveau" à côté de chaque image layer, visible **uniquement** si la case 🏗️ Plan multi-niveau est cochée.

**Rétro-compat absolue** : si un item n'a PAS de `level`, il est traité comme `level: 0`. Tous les plans v147 et avant fonctionnent identiquement quand le toggle est OFF (jamais de champ `level` ajouté).

#### 26.3 UI

- **Bouton "Niveau actif"** : `L.control({position: "topleft"})` sous les boutons de zoom Leaflet. Pastille jaune avec chiffre du niveau actif. Click → ouvre la modale niveau.
- **Modale niveau** (`#kta-niv-modal`) : 2 sections
  - 🎯 Niveau actif (segmented, single-select) — utilisé pour dessiner. Affichage **trié croissant** (gauche=négatif, droite=positif, comme un axe numérique).
  - 👁️ Niveaux visibles (checkboxes, multi-select) — filtre d'affichage
  - Quick actions : `Tous` / `Actif seul`
  - **2 boutons d'extension (v154+)** : `−` à gauche (ajoute `min-1`, sous-sols) + `+` à droite (ajoute `max+1`, étages supérieurs). Format pastille = "pill" extensible (cf. `.kta-niv-pastille` CSS) pour accepter `-1`/`-2` sans débordement dans le bouton Leaflet 30×30.
- **Sous-action 🪜 Jonction interniveau** : ajoutée au groupe Tracés quand multiLevel ON. Click → modale `from/to level` → mode tracé activé.
- **Boussole repositionnée** : si `body.kta-multilevel-active`, le widget boussole passe de `top:80px` à `top:130px` pour libérer la place au bouton niveau.

#### 26.4 Rendu et filtrage

`window.appliquerFiltreNiveau()` orchestre le re-render/filtrage de TOUS les modules level-aware :
- `renderRoads()` (road.js) — filtre via `_passeFiltreNiveau` (inclut `currentRoad` toujours visible pendant le tracé)
- `renderZones()` (zones.js) — filtre via `_zonePasseFiltre` (inclut `currentZone` toujours visible)
- `_applyLevelFilterToEditorPoints()` (editor.js) — opacity/pointer-events sur markers session
- `_applyLevelFilterToDataPoints()` (utils.js) — opacity sur markers data layers
- `_applyLevelFilterToDataRoads()` (utils.js) — setStyle opacity sur polylines data layers
- `_applyLevelFilterToDataZones()` (utils.js) — setStyle opacity sur polygones data layers
- `_applyLevelFilterToTracker()` (tracking.js) — opacity du marker tracker + polyline parcouru
- `_applyLevelFilterToImageLayers()` (map.js, **depuis v162**) — `map.addLayer`/`removeLayer` sur les `L.imageOverlay` selon le niveau. Sémantique différente des points/zones : on retire l'overlay du Leaflet layer control (pas juste de l'opacity à 0). La modale Niveaux fait autorité — force coché/décoché selon visibleLevels (override le toggle manuel du checkbox Leaflet).

Chaque module garde un registre de ses objets Leaflet (`_ktaDataMarkers`, `_ktaDataPolylines`, `_ktaDataPolygons`, `_ktaImageOverlays`). Reset au plan switch via `main.js > lancerApplication`.

#### 26.5 Jonctions interniveau

Type spécial `"jonction"` :
- `fromLevel`/`toLevel` : niveaux des 2 extrémités. **Sémantique symétrique** : Pathfinder traverse dans les 2 sens, l'ordre from/to n'affecte rien d'autre que l'étiquetage UI dans la modale de création. Une jonction `{from:0, to:1}` est strictement équivalente à `{from:1, to:0}` du point de vue du graph.
- N points (comme une polyline normale)
- Style : magenta `#ff4ecb` weight 5 dashArray "10 6"
- Marqueurs aux endpoints : `L.circleMarker` ∅14 (radius 7) bord magenta + intérieur blanc weight 3
- Toujours visible si **au moins un** de `fromLevel`/`toLevel` ∈ `visibleLevels` (sinon cachée)
- Exclue du calcul des cercles d'intersection (les middle points sont en transit vertical, pas des croisements physiques)
- **Effacement** : aucun comportement spécial, traitée comme un tracé normal par tous les modes de 🧹 (sélection au clic, dernier tracé, tous les tracés). `resetRoads()` purge aussi les jonctions car même structure de données.

#### 26.6 Pathfinder niveau-aware (`pathfinder.js`)

- Chaque **segment** porte `level: number | "transit"` (transit = segment de jonction)
- Chaque **node** porte `nodeLevels[idx]: Set<level>` (niveaux des segments qu'il touche)
- Enrichissement (intersection, T-junction, endpoint-endpoint) : **skip** les pairs avec niveaux numériques différents OU impliquant `"transit"` (sauf pour la jonction's first/last point qui porte fromLevel/toLevel en plus de transit, permettant T-junction propre)
- `_insertVirtualNode` (waypoint snap) : le node virtuel hérite du `level` du segment snapped — Dijkstra reste contraint au bon niveau
- Multi-level OFF → tous les helpers compatibilité retournent `true` → comportement strictement v147

#### 26.7 Exports

| Export | Filtre niveau |
|---|---|
| `utils.js > telechargerPlan` (rapide) | **WYSIWYG** : `window.passeFiltreNiveau(item)` lit `visibleLevels` du runtime |
| `exporter.js > _genererCanvasExport` (avancé) | Section dédiée `🏗️ Niveaux à exporter` (multi-select), lecture via `opts.ann.levels: Set<number>` → helper local `_itemPasseLevels`. **Découplé** du filtre runtime : tu peux filtrer la map sur [Niv 0] et exporter [Niv 0+1+2]. |
| `sessionExporter.js` (Full / Avancé / Conversion) | Aucun filtre — sérialise TOUS les items via `JSON.stringify` (préserve `level`/`fromLevel`/`toLevel` automatiquement) |
| `sessionPersist.js` (auto-save) | Idem — sérialisation JSON transparente |

#### 26.8 Helper global `window.passeFiltreNiveau(item)`

Exposé par `road.js`. Utilisé par l'export rapide et par toutes les fonctions level-aware qui ne sont pas dans le contexte d'une modale (modale Avancé = filtre dédié via `opts.ann.levels`).

```js
window.passeFiltreNiveau = function(item) {
  if (!APP_CONFIG.multiLevel) return true;            // off → tout visible
  const visibles = APP_CONFIG.visibleLevels || [0];
  if (item.type === "jonction") {
    return visibles.includes(item.fromLevel||0) ||
           visibles.includes(item.toLevel||0);
  }
  return visibles.includes(item.level||0);
};
```

#### 26.9 Pièges et conventions

⚠️ **Currents always visible during draw** : `currentRoad` (road.js) et `currentZone` (zones.js) bypass le filtre pendant le tracé. Sinon clic carte → road créée au niveau actif → cachée si pas dans visibleLevels → user voit rien. Re-rendu normal une fois le mode désactivé.

⚠️ **Mode jonction = exclusif** : `_activerJonctionMode` appelle `_desactiverTousLesModes()` avant d'activer (sinon ✏️ + 🪜 actifs en même temps).

⚠️ **Pastille = chiffre seul** : `<span class="kta-niv-pastille">1</span>` (pas `Niv 1`). Le préfixe "Niv " débordait du bouton sub-action.

⚠️ **Body class `kta-multilevel-active`** : ajouté/retiré sur `document.body` dans `lancerApplication` ET dans `_bindMultiLevelToggle`. Permet à la boussole de se repositionner via CSS sans reload.

⚠️ **Switch d'activeLevel reset visibleLevels** : `_changerNiveauActif(N)` fait `visibleLevels = [N]` (mode focalisé par défaut). Si l'user veut voir plusieurs niveaux à la fois, il utilise les checkboxes ou le bouton `Tous`.

⚠️ **Itineraire = bypass total** : `road.type === "itinerary"` toujours visible peu importe le filtre (calculé par Pathfinder, doit rester affiché pendant la navigation).

⚠️ **Reset au plan switch** : `lancerApplication` reset `activeLevel = 0`, `visibleLevels = [0]`, vide les registres `_ktaDataMarkers/Polylines/Polygons` (ils seront re-remplis par `ajouterPointsDepuisJSON`).

### 27. Tiling V2 (Option B — multi-imageOverlay) — depuis v149 (15/05/2026)

Système de découpage d'image en tuiles inspiré Google Maps pour réduire massivement la conso mémoire au runtime sur les gros plans (>50 Mo). Pivot vers **Option B** après échec des approches GridLayer / TileLayer.extend (cf. branche `v2-work-archive` pour l'historique de l'approche abandonnée).

#### 27.1 Pourquoi Option B ?

Le tiling Google Maps-like avec GridLayer / TileLayer.extend nécessite :
- Math des coords tuile (Y inversé en CRS.Simple)
- Clamping de `_tileZoom` pour gérer les zooms hors `minNativeZoom/maxNativeZoom`
- Lazy blob URL avec péremption iOS Safari aléatoire
- Override de `createTile` pour le callback `done()` (sinon class CSS `leaflet-tile-loaded` jamais ajoutée → tuiles invisibles)

Option B contourne TOUT ça :
- **N `L.imageOverlay`** indépendants par niveau de zoom
- Chacun positionné via bounds latLng → Leaflet gère le scaling CSS naturellement (**même primitive que le mode V1 classique** qui marche depuis toujours)
- Swap dynamique des overlays sur `zoomend` selon le niveau qui correspond le mieux au zoom courant
- Pas de coord math → pas de bug subtil

Trade-off : on n'a pas le lazy loading natif de GridLayer. Mais on garde le gain mémoire principal : à chaque instant on n'a en RAM que les tuiles du niveau courant (= équivalent zone visible, ~16 MB max sur les plans testés).

#### 27.2 Données

**plan-config.json enrichi** :

```json
{
  "plan": {
    "imageWidth": 4000,
    "imageHeight": 2251,
    "tiledV2": true,            // ← flag activant le runtime Option B
    "baseImage": "..."          // gardé pour rétrocompat / fallback éventuel
  },
  "tiling": {                   // ← section manifest (depuis v149)
    "version":       2,
    "tileSize":      512,
    "format":        "jpeg",
    "minNativeZoom": -3,
    "maxNativeZoom": 0
  }
}
```

**Structure ZIP** :
```
plan-config.json
data/
├── TestMAP.png         (image source originale, gardée pour rétrocompat)
├── collision.png       (inchangé)
└── tiles/
    ├── z0/             (niveau natif, scale=1)
    │   ├── x0_y-1.jpg  (col=0, leafletY=-1 = tuile la plus basse)
    │   ├── x0_y-2.jpg
    │   ├── x1_y-1.jpg
    │   └── ...
    ├── z-1/            (scale=2, image divisée par 2)
    ├── z-2/            (scale=4)
    └── z-3/            (scale=8, niveau le plus zoomé out)
```

Convention de nommage : `x<col>_y<-k>.jpg` où `k=1` est la tuile la plus basse de l'image (CRS.Simple lat=0 → sud).

**`imageWidth`/`imageHeight` post-auto-crop** : si l'auto-crop détecte du blanc autour du contenu, les dims plan-config reflètent la zone effectivement tuilée (pas l'image source entière). Le `cropOffset` n'est pas stocké côté plan-config — le runtime n'en a pas besoin (les coords plan sont relatives à la zone croppée).

#### 27.3 Génération (`js/createConf.js`)

**Entrée** : checkbox `🧱 Convertir en V2 tuile` dans la modale Planner, section "Informations du plan". Visible **uniquement en mode Modifier** (besoin du File source pour générer les tuiles). Default coché si source déjà V2 (re-tilage), décoché sinon (opt-in user).

**Fonction `_genererTuilesV2(imageFile, zip, onProgress)`** :
1. `_detectContentBBox(img)` : sample à 1024px max, scan des pixels non-blancs (RGB > 200), bbox + padding 1%. Skip si bbox > 90% du canvas (= image bien cadrée, pas de crop). Retourne `{x, y, w, h}` ou `null`.
2. Pour chaque niveau L=0..3 (z=0..−3) :
   - scale = 2^L, lvlW = ceil(srcW/scale), lvlH = ceil(srcH/scale)
   - cols = ceil(lvlW/512), rows = ceil(lvlH/512)
   - Pour chaque (col, k=1..rows) : slice via `drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh)` directement de l'HTMLImageElement source vers un canvas 512×512. Pas de canvas intermédiaire pleine résolution (cf §27.5).
3. Tuiles partielles (lvlH/W pas multiple de 512) : paddées avec **noir** (`destY > 0` pour la dernière row, idem pour la dernière col). Le black border visible si l'utilisateur dezoome très loin sur les bords.
4. Output : `data/tiles/z<N>/x<col>_y<-k>.jpg` (JPEG q88).
5. Manifest : `{ version: 2, tileSize: 512, format: "jpeg", minNativeZoom: -3, maxNativeZoom: 0 }`.
6. Dims : `{ width: srcW, height: srcH, cropOffset?: {x, y} }` retournées pour override `imageWidth/Height` dans plan-config.

⚠️ Conversion lente : 1-5 min sur l'ordi typique pour une image 16K×16K. Overlay de progression bloquant pendant la génération.

#### 27.4 Runtime (`js/tiling.js > _chargerImageV2OptionB`)

Détection en tête de `chargerImage` :

```js
const pc = window.PLAN_CONFIG;
if (pc && pc.plan && pc.plan.tiledV2 === true && pc.tiling) {
  return _chargerImageV2OptionB(bounds, map, pc.tiling);
}
```

**Algorithme** :
1. Choix du niveau z = `clamp(round(map.getZoom()), minNativeZoom, maxNativeZoom)`
2. Pour chaque tuile (col, k) à ce niveau : calcule les bounds Leaflet :
   - `latMin = (k-1) * tileSize * scale`
   - `latMax = k * tileSize * scale`
   - `lngMin = col * tileSize * scale`
   - `lngMax = (col+1) * tileSize * scale`
3. `L.imageOverlay(url, [[latMin, lngMin], [latMax, lngMax]], { pane: "tilePane", interactive: false }).addTo(map)`
4. Listener `map.on("zoomend", _onZoom)` qui swap le niveau si nécessaire (cleanup overlays précédents + render nouveau niveau)

**Résolution URL lazy** : `_resoudreUrlTuile(z, col, k)` lookup `RUNTIME_ASSETS["data/tiles/z<N>/x<col>_y<-k>.jpg"]`. Si l'asset est `lazy: true`, crée la blob URL au premier appel et cache dans `asset.url`. Tracking dans `state.blobUrlsCreated` pour revoke au cleanup.

**State global** : `window._tilingV2State = { currentLevel, activeOverlays, blobUrlsCreated, zoomHandler }`. Permet le cleanup propre via `window._libererTuilesV2()` au plan switch (appelé par `main.js > _libererRessourcesPlanPrecedent`).

#### 27.5 Pièges techniques

⚠️ **Canvas Chrome > 256 MP dégrade silencieusement** : raison pour laquelle on slice CHAQUE tuile directement depuis l'HTMLImageElement source via `drawImage` à 9 args (avec scaling natif intégré), pas via un canvas intermédiaire pleine résolution. Pour une image 16K×16K (= 226 MP), un canvas intermédiaire deviendrait suspect. Le slice direct contourne entièrement la limite.

⚠️ **iOS Safari strip `/` du `File.name`** : à l'extraction ZIP, on annote chaque File avec `file._fullPath = entry.name` (propriété ad-hoc) pour préserver le chemin complet. `findMatchingFile` (config.js) accepte ce match alternatif. Sans ça, les tuiles partageant le même basename (x0_y-1.jpg existe à z=0, -1, -2, -3) seraient indistinguables.

⚠️ **Lazy blob URL** : `registerAsset(path, file, {lazy: true})` ne crée PAS la blob URL au boot. Économie d'allocations sur des plans avec 1000+ tuiles (pour le user pré-rollback : 1160 tuiles → 1160 blob URLs au boot saturait iOS Safari). La blob URL est créée à la demande par le runtime au moment du render.

⚠️ **Black borders sur tuiles partielles** : si srcH/W pas multiple de tileSize, les tuiles bordure ont du noir. Acceptable pour v1 — visible uniquement quand l'utilisateur dezoome très loin au-delà des bords du plan. Future amélioration : générer des tuiles natural-size (non paddées) + bounds tighter.

⚠️ **`_baseTiles` devient stale après swap** : le tableau retourné par `chargerImage` en mode V2 = `state.activeOverlays`. Au swap de niveau, on réassigne `state.activeOverlays` mais le tableau original (toujours référencé par `_baseTiles`) contient des overlays déjà retirés. `libererTuiles` sur cet array est idempotent (no-op sur layers déjà removed). Le vrai cleanup passe par `_libererTuilesV2`.

#### 27.6 Compatibilité

- ✅ **Plans V1 (sans `tiledV2`)** : strictement identique à v148. Aucun changement de comportement.
- ✅ **Multi-niveau + V2** : indépendants, fonctionnent ensemble. Une carrière multi-étages tuilée → les jonctions et le filtre niveau marchent par-dessus le tile rendering.
- ✅ **PerfPreset** : pour les plans V1, les presets continuent de fonctionner. En mode V2, les presets sont ignorés sauf `"off"` qui force le **fallback baseImage direct** (cf §27.7 ci-dessous).
- ⚠️ **Plans serveur V2** : pas supporté en v1. RUNTIME_ASSETS est rempli uniquement par les imports ZIP. Pour servir un V2 depuis `data/<plan>/tiles/`, il faudrait un résolveur de chemin HTTP. Future amélioration.
- ⚠️ **Modifier un plan V2** : si l'utilisateur modifie un plan déjà V2 sans toucher au checkbox, les tuiles sont **régénérées** (pas reportées). Slow mais correct. Décocher la checkbox = downgrade explicite V2 → V1.

#### 27.7 Améliorations v151 (15/05/2026 suite)

**V2 dispo en mode Nouveau plan** : la checkbox 🧱 était auparavant cachée en mode `nouveau`. Désormais elle apparaît dès que l'utilisateur upload une image principale via `pl_baseImage` (mode Nouveau) OU à l'ouverture du formulaire en mode Modifier. La fonction `_majVisibiliteCheckboxV2()` centralise la logique, appelée depuis `_preRemplirFormulaire` et depuis le change handler de `pl_baseImage`.

`_genererZip` retrouve désormais le File via `_getFile("pl_baseImage", baseImageName)` qui gère les 2 sources (upload direct ou `_plannerOrigAssets` du ZIP V1 importé).

**Modal d'avertissement au check V2** : sur change de la case, si elle vient d'être cochée → `_afficherAvertissementV2(checkbox)` ouvre une modal violette qui détaille la conversion lourde (CPU + RAM + durée) avec sections "📱 Sur mobile" (rouge) et "💻 Sur ordinateur" (vert). Boutons "Annuler (décocher)" / "J'ai compris — Continuer". Backdrop click + Escape = annuler.

**V2 + perfPreset=off → fallback baseImage** : si l'utilisateur a choisi `Mode performance: Désactivé` au loader et charge un plan V2 :
```js
if (pc.plan.tiledV2 === true && pc.tiling) {
  if (preset === "off") {
    L.imageOverlay(url, bounds).addTo(map);  // V1-like, image source entière
    return [];
  }
  return _chargerImageV2OptionB(bounds, map, pc.tiling);
}
```
Le `baseImage` est toujours présent dans le ZIP/asset (le générateur V2 ne le supprime pas), donc le fallback fonctionne sans crash. Use case : comparer V2 vs V1 sur le même plan ou contourner temporairement le système de tuiles pour troubleshooting.

#### 27.8 Robustesse erreurs et visibilité (v152)

**Try/catch ciblé dans `_genererTuilesV2`** (createConf.js) : chaque opération critique (drawImage, toBlob, écriture ZIP, `_detectContentBBox > getImageData`) est wrappée avec un message d'erreur explicite mentionnant la coord (z, col, k) de la tuile qui a échoué. Les erreurs OOM typiques (toBlob retournant null, drawImage qui throw) sont relancées avec contexte.

**Modal d'erreur visible** : `_afficherErreurV2(titre, message)` (createConf.js) remplace l'usage de `_plannerErreur` (zone inline en bas, peu visible) pour les erreurs critiques de génération V2. Pattern `.kta-readme-modal-overlay` + boîte rouge avec :
- Header `❌ Échec de génération`
- Message d'erreur encadré rouge (avec détail du throw catché)
- Section `💡 Que faire ?` (verte) avec conseils actionnables : PC vs mobile, réduire image, JPEG q85
- Bouton `J'ai compris` (primary)

Détection OOM (heuristique sur le message d'erreur via regex `/m[ée]moire|drawImage|toBlob|saturation/i`) pour ajouter un suffixe spécifique au message.

**Flag `myktamap_v2_gen_in_progress`** : posé AVANT la génération via `localStorage.setItem`, retiré dans le `finally` (succès OU catch). Contient `{ planName, imageSize, startedAt }`. Si le navigateur kill la page pendant la génération, le code du `finally` ne tourne JAMAIS → le flag reste au reload.

**Détection au boot dans oomGuard.js** : `_checkV2GenerationCrash()` vérifie ce flag avec une fenêtre de fraîcheur de 1h (au-delà = vieux flag oublié, on ignore). Si détecté → `_pendingV2CrashInfo` stocké, puis `_afficherModaleV2Crash(info)` est appelé dans `flushPendingToasts` (après le splash), AVANT la modale "kill" générique standard.

**Modale "Génération V2 interrompue"** : pattern `.kta-readme-modal-overlay` + boîte rouge similaire à _afficherErreurV2 mais focalisée sur le contexte spécifique :
- Header `🧱❌ Génération V2 interrompue`
- Message qui mentionne le nom du plan + taille de l'image source
- Explication "saturation mémoire navigateur" + plafond ~500 MB iOS
- Conseils : PC, réduire image, fermer apps en arrière-plan
- Bouton `✓ Compris`

**Overlay de chargement plein écran** : `_afficherOverlayChargement(message)` / `_majOverlayChargement(message)` / `_fermerOverlayChargement()` (index.html). Modale plein écran avec spinner CSS + message d'étape + hint. Affiché depuis `chargerZipFichier` (extraction du ZIP) et `chargerPlanServeur` (fetch serveur). Mis à jour pendant l'indexation des tuiles V2 (toutes les 50 tuiles) et avant le render carte. Fermé dans le `finally` de `lancerApplication` (succès OU erreur).

CSS : `.kta-load-overlay` fixed inset:0 background semi-transparent + blur + `.kta-load-box` centrée (spinner animé 48px + titre + message + hint italique).

### 28. Tracker directionnel — icône qui tourne en tracking actif (depuis v158-v161)

L'icône du marker tracker tourne en temps réel pour pointer dans la direction de marche pendant le tracking actif. Au repos (tracking off, recalage seul, plan affiché statique) : icône fixe pointant Nord.

**Source du heading** : `getCurrentHeading()` exposé par `tracking.js` (cf. §24 sources d'orientation). Cohérent avec la boussole 🧭 — les 2 widgets utilisent le même heading mais avec rotation opposée (boussole contre-tourne pour garder le N en haut, tracker tourne dans le sens de marche).

**Implémentation DOM** :
- `iconeTrack` est un **`L.divIcon`** (et pas `L.icon`) qui produit `<div class="kta-tracker-divicon"><img class="kta-tracker-img"></div>`
- Le **DIV wrapper** reçoit le `transform: translate3d(...)` de Leaflet (positionnement géo)
- L'**`<img>` enfant** reçoit notre `transform: rotate(heading deg)` (rotation indépendante)
- → 2 éléments distincts = 2 transforms qui ne s'écrasent pas mutuellement

⚠️ **Piège v158** : utilisation initiale de `L.icon` qui produit un `<img>` top-level. Leaflet appliquait `translate3d` sur cet `<img>`, et notre `rotate` sur le même → écrasement, icône collait au `(0,0)`. **Fix v159** : passage en divIcon. À ne JAMAIS revenir à `L.icon` pour ce marker.

**Anti-jitter (v160)** : 3 techniques combinées dans `_applyRotationToTrackerMarker()` :

| Technique | Valeur | Rôle |
|---|---|---|
| Smoothing exponentiel | `α=0.25` (75% historique + 25% nouvelle) | Filtre le bruit ±2-5° du magnétomètre |
| Throttle DOM | `2°` après smoothing | Skip update si delta trop petit |
| Transition CSS | `0.3s ease-out` sur `.kta-tracker-img` | Absorbe les sauts résiduels |

**Wrap circulaire 0-360°** : delta signé minimum pour les transitions Nord→Nord-via-Est (350°→10° = `+20°`, pas `-340°`). Géré à 2 endroits : (1) dans le smoothing pour ne pas faire revenir l'icône en arrière, (2) dans le throttle pour la distance circulaire vraie.

⚠️ **Piège v160 (fix v161)** : initialiser `_trackerRotationLast = -999` comme sentinel "jamais initialisé" cassait le wrap-fix (`360 - (-999) = 1359` ou `360 - 999 = -639 < 2`) → return immédiat éternel → icône bloquée. **Toujours utiliser un sentinel typé** (`null`) + check explicite avant tout math circulaire.

**API privée** :
- `_applyRotationToTrackerMarker()` — appelée depuis `_onOrientation` (à chaque event d'orientation, iOS webkitCompassHeading + cas calc α/β/γ) + au `startTracking()` pour pré-positionner si heading déjà connu
- `_resetRotationTrackerMarker()` — appelée au `stopTracking()`, reset `transform: rotate(0deg)` + vide `_trackerHeadingSmoothed = null` + `_trackerRotationLast = null` pour repartir frais au prochain Play
- Variables module-scope : `_trackerHeadingSmoothed`, `_trackerRotationLast` (les 2 reset à `null` au stop)

**Compatibilité tracking-off** : `_applyRotationToTrackerMarker` early-return si `!tracking` → l'icône reste en pose neutre Nord. Pas de coût CPU au repos.

**À NE PAS TOUCHER** :
- Le choix `L.divIcon` (pas `L.icon`)
- Le sentinel `null` (pas `-999`) pour `_trackerRotationLast`
- La transition CSS de 0.3s — testée optimale pour la perception humaine du smooth
- Le tag `direction` global qui est mis à jour par `_onOrientation` — c'est la même var que celle utilisée par `getCurrentHeading()` pour la boussole

### 29. Migration domaine `is-underground.fr` → `myktamap.fr` (depuis v163)

Stratégie de transition douce du domaine historique vers le nouveau domaine officiel, prévue pour le **15 juillet 2026**.

**Approche cohabitation 60 jours** (au lieu d'un kill switch immédiat) :
- Les 2 domaines servent la même app v163+ en parallèle pendant ~2 mois
- Sur l'ancien domaine, l'utilisateur est informé via une **entrée `info` dans `alert.json`** (cf §20 et v167 sélecteur multi-alertes) — rappel discret via badge 🚨 bleu, l'user lit quand il veut
- Aucune perte de données : l'utilisateur a le temps d'exporter ses sessions via 💾 et de migrer à son rythme
- À J+60, déploiement de la conf Nginx `docs/nginx-redirect-old-domain.conf` (kill switch SW + page de transition)

**Historique** : v163-v167 avait aussi un module `js/migrationNotice.js` qui affichait une modal one-shot pédagogique au premier lancement. **Supprimé en v168** car doublon avec l'alerte info `alert.json` qui est plus discrète et déjà visible en permanence via le badge 🚨. Le code git history conserve `migrationNotice.js` pour référence (commit `aea3a1e` introduisait, `?` supprime).

**Fichier `docs/nginx-redirect-old-domain.conf`** : conf Nginx prête à déployer à J+60. Contient :
1. `/sw.js` → kill switch SW inline (purge caches + unregister + force reload des clients)
2. `/manifest.json` → manifest "vide" pointant `myktamap.fr` pour éviter ré-install ancien domaine
3. Tous les autres paths → page HTML de transition (cleanup JS + redirect avec triple filet meta/JS/countdown)
4. Headers `no-cache, no-store` strict partout

**Fichier `docs/alert-example-migration.json`** : exemple `alert.json` multi-alertes avec entrée info migration + emplacement commenté pour alerte ponctuelle (incendie, etc.). Le vrai `alert.json` racine (servi en prod) contient déjà les 2 alertes (gaz toxiques emergency + migration info) au format v163+.

**Constantes à mettre à jour quand `myktamap.fr` sera DNS-pointé** :
- `js/copyright.js > __MKM__.site` (sur le nouveau domaine, garder l'ancien sur l'ancien domaine pour cohérence pendant la transition)
- Meta tags `<head>` dans `index.html`
- Mentions dans `README.md` / `README_USER.md` / `AI_CONTEXT.md`
- Dans `alert.json > details` de l'alerte migration : retirer la mention "🚧 myktamap.fr est en cours de mise en service" et ajouter le lien actif

### 30. GitHub Releases automatiques (`.github/workflows/release.yml`, depuis v169)

À chaque bump de `version.json > version` mergé sur `main`, un workflow GitHub Actions auto-crée :
1. Un **tag git** `v<version>` (ex: `v169`) sur le commit du bump
2. Une **Release GitHub** avec les notes user-facing extraites de `version.json > notes` (formatées en markdown bullets)
3. Un lien "📊 Voir tous les commits depuis v<précédent>" pointant vers la page compare GitHub

**Trigger** : `push` sur `main` qui modifie `version.json` (filtre `paths`). Évite de tourner pour chaque commit non-release.

**Garde-fous** :
- Skip si la version dans `version.json` n'a pas changé entre HEAD et HEAD~1 (= edit d'une typo sans bump → pas de nouvelle release)
- Skip si une release pour ce tag existe déjà (= si déjà créée manuellement avant que le workflow tourne, ou re-tagger)

**Permissions** : `contents: write` sur le `GITHUB_TOKEN` du workflow (suffit pour créer tags + releases).

**Pour les futurs devs / agents** :
- Continuer le workflow normal : bumper les **3 fichiers** (`sw.js > CACHE_NAME`, `js/copyright.js > __MKM__.build`, `version.json > version`)
- Mettre à jour les notes user-facing dans `version.json > notes` (3-5 bullets concis)
- Push sur main → la Release GitHub apparaît automatiquement dans la minute (cf. https://github.com/Karmakta91/MyKTAMap/releases)
- **Ne pas** créer manuellement de tag/release sauf si pour antidater une version existante (cf. commentaire d'en-tête du YAML pour les commandes)

**Source des notes** : `version.json > notes` est volontairement court (user-facing, milestone). Le `README.md > Journal des modifications` reste la source de vérité **technique** pour les devs, avec un niveau de détail beaucoup plus fin (fichiers modifiés, pièges, etc.).

**Initialisation v168** : la version courante v168 n'avait pas de tag/release associé au moment du déploiement du workflow. Le commentaire d'en-tête du fichier `.github/workflows/release.yml` contient la commande à lancer une fois pour antidater proprement v168. Les versions suivantes (v169+) sont auto.

### 31. Zone "Inaccessible" + Préférences d'évitement itinéraire (depuis v169 / Karma_dev)

2 features complémentaires pour contraindre les itinéraires calculés par Pathfinder. Toutes deux travaillent au niveau du graphe (filtrage des arêtes avant Dijkstra), pas en post-traitement.

#### 31.1 Zone "Inaccessible" (contrainte DURE)

**Type de zone** : `"inaccessible"` (4ème type, après `eau`/`remblais`/`effondrement`). Tracé via le groupe ⬛ Zones de la sidebar, bouton ⛔.

**Visuel** : hachures rouge sombre / noir à 45° via un `<pattern>` SVG défini dans `index.html` (`id="kta-pattern-inaccessible"`). Renderer SVG forcé (singleton `_inaccessibleRenderer` dans `zones.js` pour session, `_inaccessibleDataRenderer` dans `utils.js` pour data layers) car canvas ignore les patterns SVG.

**Effet pathfinder** : dans `_buildGraph`, pour chaque segment de road, on teste `_segmentBloqueParZoneInaccess(prevP, p, segLevel, zonesInacc)`. Si traversée détectée → on n'ajoute PAS l'arête ni le segment dans `graph.segments` → enrichment (intersection/T-junction) ne verra pas ce segment → Dijkstra ne peut pas emprunter ce tronçon.

**Algorithme de détection** (`pathfinder.js`) :
- `_pointInPolygon(p, poly)` — ray-casting standard O(n)
- `_segmentTraversePolygon(p1, p2, poly)` — true si un endpoint dedans OU si le segment intersecte une arête du polygone
- `_segmentBloqueParZoneInaccess(p1, p2, segLevel, zonesInacc)` — applique la règle niveau-aware (segments "transit" jamais bloqués)

**Collecte des zones** : `_collecterZonesInaccessibles()` lit :
- Session zones via `window.getZones()` (filtre `type === "inaccessible"`)
- Data layer zones via `window._ktaDataPolygons` (entries portant `type` et `points` depuis v169, cf. `utils.js > ajouterPointsDepuisJSON`)

**Multi-niveau** : zone bloque uniquement les segments du **même niveau**. Sauf `multiLevel: false` (comparaison à plat). Segments `"transit"` (middle de jonction interniveau) jamais bloqués (points "en l'air").

**Indépendant de la visibilité** : pathfinder utilise toujours la zone même si le calque zones est toggle off (cohérence demandée — sinon l'user pourrait toggler sans s'en rendre compte). Toutes les modifs d'export (PNG, session) respectent toujours le type comme une vraie zone.

#### 31.2 Préférences d'évitement (contrainte SOUPLE)

**Configurées dans la modale itinéraire**, section repliable "🚫 Préférences d'évitement (optionnel)". Persisté en localStorage par plan : `localStorage["myktamap_route_avoid_<planId>"] = { points: [{x,y,label,id?}], tags: [...], radius: 100 }`.

**3 types de contraintes** :
1. **Points explicites** : `avoidPoints: [{x, y, label?, id?}, ...]`. **3 méthodes d'ajout** côté UI :
   - **Autocomplete** : `SearchPoints.findByQuery` (recherche par nom/id/tag)
   - **Saisie ID exact** : `Pathfinder.resolvePointById` (input texte + bouton Ajouter)
   - **Clic carte** : bouton "📍 Cliquer sur la carte" → mode flottant orange (`_itiAvoidClickActive`, handler isolé du mode clic waypoints), chaque clic ajoute un point d'évitement aux prefs (label "📍 Clic carte (x, y)"). Cf. `_activerModeClicAvoid` / `_desactiverModeClicAvoid` dans interface.js.
2. **Tags** : `avoidTags: ["pa", "danger", ...]` → expansion auto en tous les points du plan portant ces tags (via `SearchPoints.getAllPoints`, **async**)
3. **Marge** : `avoidRadius` px (défaut 100, configurable 0-500)

**Algo 2 passes** (clé du fallback) :
1. **Passe 1** : `_computeRouteInterne(waypoints, allRoads, allowedTypes, zonesInacc, allAvoidPts, avoidRadius)` — graphe avec dur+souple, tentative Dijkstra
2. Si échec ET `hasAvoidances` → **Passe 2** : `_computeRouteInterne(waypoints, allRoads, allowedTypes, zonesInacc, [], 0)` — graphe avec dur uniquement
3. Si Passe 2 OK → marqué `usedFallback: true` + détection des points évités traversés via `_pathPassesNearPoint(path, ap, radius)` → renvoyé dans `avoidedThrough`. UI affiche "⚠️ Impossible d'éviter : ..." en bloc orange.
4. Si Passe 2 échoue aussi → erreur relancée (vraie absence de chemin, zone inaccessible bloquante ou réseau disconnect).

**API publique** : `Pathfinder.computeRoute(waypoints, opts)` est désormais **async** (await `_expandAvoidTagsEnPoints` qui utilise `SearchPoints.getAllPoints` async). Les 2 appelants dans `interface.js` ont été mis à jour avec `await`.

**Structure retournée** :
```js
{
  path:           [{x, y}, ...],     // chemin final
  totalDistance:  number,             // px image
  segmentCount:   number,
  snappedPoints:  [...],
  usedFallback:   boolean,            // v169 : true si fallback passe 2 utilisé
  avoidedThrough: [{x, y, label}, ...], // v169 : points évités traversés
  avoidRadius:    number              // v169 : marge appliquée
}
```

#### 31.3 UI (interface.js, ~370 lignes)

**Helpers localStorage** : `_getItiAvoidPrefs`, `_setItiAvoidPrefs`, `_itiAvoidLsKey` (clé par planId pour ne pas mélanger entre plans)

**HTML section** : `_htmlSectionAvoidItineraire(prefs)` génère le `<details>` repliable avec 3 sous-blocs (Points / Tags / Marge) + reset

**Rendu** :
- `_rafraichirListeAvoidPoints` (sync) : chips orange pour chaque point évité avec ✕
- `_rafraichirChipsAvoidTags` (async, await `_itiAvoidGetAvailableTags`) : chips toggleables pour les tags du plan

**Bind handlers** : `_bindAvoidSectionHandlers` :
- Autocomplete avec debounce 150ms (réutilise `SearchPoints.findByQuery`)
- Saisie ID + Enter (réutilise `Pathfinder.resolvePointById`)
- Change handler sur radius input
- Reset avec `confirm()`

**Styles** : `.kta-iti-avoid-*` dans `style.css` — couleur thématique orange (cohérent semantic "warning"), chips arrondis, etat actif/inactif sur tags

#### 31.4 Audit exports — Fixes intégration Feature 1/2 (depuis v169 / Karma_dev)

Audit complet des 4 fonctions d'export pour vérifier la cohérence des 2 features. Problèmes trouvés + corrections appliquées :

**Sites corrigés** (post-audit) :

1. **`sessionExporter.js > _genererPayloadAvanc + _genererFichiersConversion`** : les filtres `roadTypes` / `roadTypesActifs` listent `["principal", "secondaire", "chemin"]` → drop silencieux des jonctions. Fix : bypass explicite `if (r.type === "jonction") return true;` avant le filtre. Idem dans la granularité fine où on liste les types pour générer les fichiers : `["principal", "secondaire", "chemin", "jonction"]`.

2. **`exporter.js > _dessinerLegende`** : la légende PNG (mode avancé) listait uniquement Eau/Remblais/Effondrement et Principal/Secondaire/Chemin. Ajouts :
   - Section Zones : `"Inaccessible"` avec fillColor `#7a0000` (= couleur uni canvas, pas hachures SVG car non portable au canvas). Label épuré pour rester sobre : la sémantique "bloque l'itinéraire" est portée par le visuel (rouge sombre + icône ⛔ dans la sidebar).
   - Section Tracés : `"Jonction interniveau"` avec lineColor `#ff4ecb`

3. **`tableEditor.js > _detecterColonnes.ordreCourant`** : la liste d'ordre privilégié `["id","nom","x","y","tags","etat","description",...]` n'incluait pas `level` → colonne en queue de tableau. Ajout : `level` inséré entre `y` et `tags` pour cohérence visuelle des coords (`x/y/level` contigus).

**Choix volontaires documentés** (P2 audit non corrigé) :

- **Préférences d'évitement** (`localStorage["myktamap_route_avoid_<planId>"]`) ne sont **PAS sérialisées** dans les exports session/conversion. Volontaire : les préférences sont **locales** (= configurées pour la session de l'user, pas pour le plan). Un user peut avoir des évitements différents d'un user qui partage le même plan. Si besoin de partage, à ajouter explicitement dans une release future via une checkbox "inclure préfs d'évitement" dans Export Session Full.

**Mode clic carte pour avoidances** (depuis Karma_dev audit) : ajout d'un bouton **📍 Cliquer sur la carte** dans la section avoid (à côté de l'autocomplete et de la saisie ID). État `_itiAvoidClickActive` + handler `_itiAvoidClickHandler` séparés des waypoints (pas de conflit possible avec le mode clic waypoints existant). Floater orange `kta-iti-avoid-floater` au lieu du floater cyan des waypoints. Compteur live `_majPanneauFloaterAvoidCount`. Pattern identique aux waypoints (`_activerModeClicCarte`/`_desactiverModeClicCarte`).

#### 31.5 Tri Z-index des roads en mode multi-niveau (depuis v169)

Bug remonté KARMA : en mode multi-niveau, l'ordre d'affichage des routes ne reflétait pas la hiérarchie physique. Une galerie au Niv 0 pouvait apparaître **en-dessous** d'une galerie au Niv -1 si elle avait été tracée avant — c'était l'ordre d'insertion plat.

**Règle implémentée** (uniquement quand `multiLevel === true`) :
- **Tri primaire** : `level` **ascendant** — niveau bas en arrière, niveau haut au-dessus (LVL -∞ → -2 → -1 → 0 → +1 → +∞)
- **Tri secondaire** : type au sein du même niveau — `chemin (0) < secondaire (1) < principal (2) < jonction (3)`. Principal au-dessus de chemin/secondaire = hiérarchie visuelle naturelle.
- **Itinéraire** : toujours en dernier (au-dessus de tout, c'est la navigation active).
- **Jonctions** : tri par `max(fromLevel, toLevel)` — le pont apparaît au-dessus du niveau inférieur, cohérent avec l'analogie "escalier qui monte au-dessus du sol bas".

**Sites d'application** (4 endroits) :
1. `js/road.js > renderRoads` — affichage Leaflet on-map des routes de session
2. `js/utils.js > ajouterPointsDepuisJSON` — création initiale des polylines data layer
3. `js/utils.js > telechargerPlan` — export PNG rapide (session + embedded)
4. `js/exporter.js > _genererCanvasExport` — export PNG avancé (session + embedded)

**Pattern** : copie triée (`[...arr].sort(...)`) pour ne pas muter l'array source. Sort prédicat composé level → type.

**Rétro-compat** : si `multiLevel === false`, ordre d'insertion conservé (= comportement v147 strict). Pas de régression sur les plans single-level.

#### 31.6 Audit aide intégrée + légende in-app + label épuré (depuis v169 / Karma_dev)

Audit demandé KARMA pour vérifier que les modales "aide" (📖) et "légende" (🗺️) intègrent les 2 features. Corrections appliquées :

**Modale Légende in-app** (`interface.js > afficherLegende`) :
- Section 🛣️ Tracés : ajout `"Jonction interniveau"` (trait magenta `#ff4ecb`)
- Section ⬛ Zones : ajout `"⛔ Inaccessible"` (swatch en hachures CSS via `repeating-linear-gradient(45deg, #5a0a0a 0 6px, #1a1f2e 6px 10px)`)

**Modale Aide intégrée** (`interface.js > afficherAide`) :
- Section 🛣️ Tracés & Routes : ajout `🪜` Jonction interniveau (mention "sous-action conditionnelle multi-niveau")
- Section 🗺️ Itinéraire : nouveau paragraphe `🚫 Contraintes d'évitement` qui distingue clairement dur (⛔) vs souple (🚫), mentionne les 3 méthodes d'ajout et la persistance localStorage par plan

**Suppression au clic** (`interface.js`, 2 sites) :
- `_choixSuppression "Tracés"` et `activerModeSuppressionTraceClic` : filtre étendu à `["principal", "secondaire", "chemin", "jonction"]`. Avant : impossible de supprimer une jonction au clic, fallback obligatoire via "Tous les tracés". Après : cohérent avec les autres tracés.

**Épuration des labels de légende** (cohérence cross-doc, 2 commits) :
- Légende in-app : `"⛔ Inaccessible — bloque l'itinéraire (hachures)"` → `"⛔ Inaccessible"` (commit `0419752`)
- Légende in-app : `"🪜 Jonction interniveau (escalier / pente — multi-niveau)"` → `"Jonction interniveau"` (commit `d2b4898`)
- Légende PNG : `"Inaccessible (bloque l'itinéraire)"` → `"Inaccessible"` (commit `0419752`)
- **Principe** : sémantique portée par le **visuel** (couleur unique magenta pour jonction, hachures rouge/noir pour inaccessible) + icône dans la sidebar (⛔, 🪜) → pas besoin de doubler en texte. Labels sobres alignés avec le reste du projet.

#### 31.7 Pour ajouter une 5ème type de zone (futur)

**À NE PAS OUBLIER** quand on ajoute un nouveau type de zone (au-delà des 4 actuels eau/remblais/effondrement/inaccessible) :

1. `js/zones.js > ZONE_STYLES` — style visuel (color/fillColor/fillOpacity)
2. `js/zones.js > ordreType` — position d'affichage dans la pile (ordre = z-index logique)
3. `js/interface.js > _creerGroupeAccordeon zones` — bouton sous-action
4. `js/interface.js > Aide intégrée` — ligne descriptive
5. `js/utils.js > ZONE_STYLES_DATA + ZONE_STYLES_EMBED + ZONE_STYLES_EXPORT` — styles pour data layers + export rapide
6. `js/utils.js > ajouterPointsDepuisJSON > zonesTriees ordre` — ordre embedded zones
7. `js/utils.js > telechargerPlan > ordre` — tri zones session
8. `js/exporter.js > _compterTypes / hasZones / zoneLabels / ordre / filtreZ + checkboxes ann_zones_*` (×~10 sites)
9. `js/sessionExporter.js > _trierParType (×3 sites) / syncParent (×2) / zoneTypes filter / zoneTypesActifs + checkboxes adv_zones_* / conv_zones_*` (~8 sites)
10. `index.html` — pattern SVG si nécessaire pour le rendu visuel
11. `css/style.css` — styles spécifiques si besoin
12. Pathfinder si bloquant : helper de détection dans `pathfinder.js`
13. Doc : CLAUDE.md (cette section), AI_CONTEXT.md (liste anti-hallucination), README_USER.md, README.md (journal)

C'est ~13 endroits à toucher. Un grep large `"effondrement"` est utile pour ne pas en oublier.

### 32. Export KMZ géolocalisé (`js/kmzExport.js`, depuis v170)

Export terrain géoréférencé au format KMZ standard (OGC) ouvrable dans **Google Earth, OsmAnd, Locus, Avenza, ArcGIS Earth**, etc. L'utilisateur saisit 2 couples `(point_plan, point_GPS)` → l'app calcule une transformation affine 2D similarity (rotation + scale + translation) qui mappe chaque coord plan vers (lat, lng).

#### 32.1 Math affine 2D

**`buildTransform(planA, planB, gpsA, gpsB)`** retourne `{refPlan, refGps, metresParPixel, rotation, latMoyenne}`.

Algorithme :
1. Vecteur plan AB : `dxPlan = Bx - Ax`, `dyPlan = -(By - Ay)` (y **inversé** car axe image vers le bas, math standard vers le haut)
2. Vecteur GPS AB converti en mètres via projection équirectangulaire locale :
   - `dxGps = (lngB - lngA) * 111320 * cos(latMoy)` (E-W)
   - `dyGps = (latB - latA) * 110540` (N-S, constante car latitude varie peu en local)
3. `metresParPixel = |AB_gps| / |AB_plan|` (échelle uniforme)
4. `rotation = atan2(dyGps, dxGps) - atan2(dyPlan, dxPlan)` (delta angles)

**Validations** :
- `|AB_plan| ≥ 50 px` (sinon imprécision énorme — fail safe)
- `|AB_gps| ≥ 1 m` (sinon dégénéré)

**`planToGps(t, x, y)`** : applique la transformation inverse pour mapper un (x, y) plan vers (lat, lng).

**Extension future** : la math est conçue pour facilement passer à 3+ points (least squares) si besoin de plus de précision sur les plans très étendus ou non-rigides.

#### 32.2 Format KMZ

KMZ = ZIP standard avec :
- `doc.kml` : XML KML 2.2 + namespace gx 2.2 (pour `<gx:LatLonQuad>`)
- `files/<plan>.png` : image plan référencée dans `<GroundOverlay>`
- `files/icons/<tag>.png` : 1 icône par tag rencontré dans les Placemarks

Structure KML :
```xml
<Document>
  <Style id="point_pa">...</Style>          <!-- 1 par tag -->
  <Style id="road_principal">...</Style>    <!-- 5 styles roads -->
  <Style id="zone_eau">...</Style>          <!-- 4 styles zones -->
  <GroundOverlay>
    <color>99ffffff</color>                 <!-- alpha 60% par défaut -->
    <Icon><href>files/plan.png</href></Icon>
    <gx:LatLonQuad>                          <!-- 4 coins arbitraires -->
      <coordinates>SW SE NE NW</coordinates>
    </gx:LatLonQuad>
  </GroundOverlay>
  <Folder><name>🏗️ Niveau 0</name>           <!-- 1 folder par niveau si multi-level -->
    <Folder><name>📍 Points (N)</name>...</Folder>
    <Folder><name>🛣️ Tracés (N)</name>...</Folder>
    <Folder><name>🪜 Jonctions (N)</name>...</Folder>
    <Folder><name>⬛ Zones (N)</name>...</Folder>
  </Folder>
  <Folder><name>🗺️ Itinéraire (N)</name>...</Folder>
</Document>
```

#### 32.3 Format couleur KML

**AABBGGRR** (attention : pas RRGGBBAA ni AARRGGBB) — alpha + bleu + vert + rouge en hex 2 chars chacun. Helper `_kmlColor(hex, alpha)` dans `kmzExport.js` fait la conversion `#RRGGBB` + alpha 0-255 → `AABBGGRR`.

Exemples :
- `ffffffff` = blanc opaque
- `99ffffff` = blanc 60% alpha (utilisé pour GroundOverlay slider 60%)
- `ff0000ff` = rouge pur opaque (rouge=ff, vert=00, bleu=00, alpha=ff)

#### 32.4 Coordonnées KML

`_coord(latlng)` formate en `"lng,lat,0"` (KML : lng AVANT lat, contrairement au standard "lat,lng"). Le `,0` est l'altitude (0 = au sol).

#### 32.5 API publique

**`window.KmzExport`** :
- `buildTransform(planA, planB, gpsA, gpsB)` → `transform` ou throw
- `planToGps(transform, x, y)` → `{lat, lng}`
- `getCalibration(planId)` / `setCalibration(planId, calib)` — localStorage persistance
- `genererKml(opts)` → string KML (synchrone)
- `genererKmz(opts)` → Promise<Blob> (async, packe le ZIP via JSZip)

**Format `opts` pour `genererKmz`** :
```js
{
  planName, planVersion, planAuthor,     // métadonnées du plan
  imageW, imageH,                        // dimensions plan en px
  transform,                             // résultat de buildTransform
  imageOpacity: 0-100,                   // % opacité GroundOverlay (default 60)
  include: {
    image:        true|false,            // parent GroundOverlay
    points:       true|false,            // parent Placemarks
    roads:        true|false,            // parent LineStrings
    zones:        true|false,            // parent Polygons
    jonctions:    true|false,            // (si multi-niveau)
    itineraire:   true|false,
    dataLayers:   true,
    // Filtres granulaires (Set | null → null = pas de filtre, legacy compat)
    pointTagsSet: Set<string> | null,    // whitelist tags (1er tag du point)
    roadTypesSet: Set<string> | null,    // whitelist {principal, secondaire, chemin}
    zoneTypesSet: Set<string> | null     // whitelist {eau, remblais, effondrement, inaccessible}
  },
  levels: Set<number> | null,            // filtre niveaux (null = tous)
  data: {
    editorPoints: [{x, y, nom, id, tags, level, description}, ...],
    roads:        [{type, points, level, fromLevel, toLevel}, ...],
    zones:        [{type, points, level}, ...]
  },
  imageBlob:     Blob | null,            // image PNG/JPEG (null → skip GroundOverlay)
  imageFilename: string,                 // nom dans le ZIP (ex: "TestMAP.png")
  iconsToEmbed:  { tag: url, ... }       // URLs (data: ou http) des icônes par tag
}
```

#### 32.6 Cycle de vie côté sessionExporter

1. **Click onglet 🌍 KMZ** → `_renderKmz()` génère HTML (calibrage + aperçu + contenu + niveaux)
2. **`_kmzCollecterStats()`** : agrège session + embedded → counts par tag/type pour les compteurs UI
3. **Saisie 8 champs** ou import via 🔍 Chercher / 📍 Cliquer carte / Saisie manuelle
4. **`_kmzRafraichirApercu()`** : à chaque input, recalcule + affiche les 4 coins + lien Google Maps (avec ping internet via `window._pingInternet`)
5. **Click Télécharger** → `_exportKmz()` :
   - Validation 8 champs requis
   - `buildTransform` + persistance via `setCalibration`
   - Collecte session + embedded (allRoads, allZones, allPoints + dataLayerPoints)
   - Lecture des Sets de filtrage granulaire (pointTagsSet, roadTypesSet, zoneTypesSet)
   - Fetch image blob (RUNTIME_ASSETS si ZIP local, fetch HTTP sinon)
   - Collecte iconsToEmbed depuis `window._iconMap`
   - `genererKmz(opts)` → Blob → téléchargement `MyKTAMap_<plan>_<date>.kmz`

#### 32.7 Pièges et conventions

⚠️ **`y` inversé dans `buildTransform`** : axe image va vers le bas (haut-gauche = 0,0), axe math standard va vers le haut. La math doit inverser y sinon la rotation est miroir.

⚠️ **AABBGGRR vs RRGGBBAA** : KML utilise un format particulier hérité de Google. Toujours passer par le helper `_kmlColor` plutôt que de coder le hex à la main.

⚠️ **`<gx:LatLonQuad>` plus robuste que `<LatLonBox>`** : LatLonBox suppose un rectangle axes-aligned + rotation unique. LatLonQuad permet 4 coins arbitraires — gère naturellement les plans non-rectangulaires ou tournés.

⚠️ **Image blob requise** : si `imageBlob = null`, le GroundOverlay est skip silencieusement (log warning). Le KMZ reste valide mais affiche juste les annotations sans la cartographie de fond.

⚠️ **Helper `row(id, label, count, checked)`** dans sessionExporter (commit `ec0343f` fix) :
- `count = null` → pas de compteur, checkbox toujours enabled (cas image, métadonnée binaire)
- `count = 0` → "(0)" affiché, checkbox grisée + disabled (rien à exporter, blocage utile)
- `count > 0` → "(N)" affiché, cochée si `checked=true`

⚠️ **Classe CSS `.kta-iti-search-result` orpheline** : utilisée historiquement dans le modal Itinéraire (`interface.js`) ET dans le KMZ initial mais **jamais définie en CSS** (seule `.kta-iti-search-item` l'est). Le KMZ est passé à `.kta-kmz-search-item` dédiée (cf. commit `e7b0a80`). Le bug existe probablement encore côté Itinéraire — à fixer si remonté.

⚠️ **`transform` JAMAIS persisté — toujours rebuild on-demand** (pattern critique, source de v1.21.1 #1 + v1.21.2 #4) : `KmzExport.setCalibration(planId, calib)` stocke UNIQUEMENT `{pointA, pointB}` en localStorage. Le `transform` (résultat de `buildTransform`) est volumineux + dérivable, donc reconstruit à la demande :

```js
// ❌ MAUVAIS — calib.transform n'existe JAMAIS dans le storage
const calib = KmzExport.getCalibration(planId);
const gps = KmzExport.planToGps(calib.transform, x, y);  // ← undefined → crash

// ✅ BON — rebuild on-demand
const calib = KmzExport.getCalibration(planId);
if (!calib || !calib.pointA || !calib.pointB) return null;  // pas calibré
const t = KmzExport.buildTransform(calib.pointA.plan, calib.pointB.plan,
                                    calib.pointA.gps,  calib.pointB.gps);
const gps = KmzExport.planToGps(t, x, y);
```

Pattern utilisé par `gpxIO.js` (export/import), `emergencyMode.js > _tick` (bloc GPS, fix v1.21.2), `utils.js > buildPointPopupHtml` (ligne 🌐 coords GPS popup POI, v1.21.2).

#### 32.8 Pour ajouter une nouvelle catégorie d'export KMZ (futur)

Si on ajoute un nouveau type d'objet à exporter (ex: photos géolocalisées, audio notes) :
1. Helper `_emitXxx(item, styleId)` dans `kmzExport.js > genererKml`
2. Helper `_genererStyleXxx()` (style KML)
3. Bloc dans `_folderForLevel` avec filtre niveau-aware
4. UI : ajouter une row dans `_kmzRenderContenu` (sessionExporter.js)
5. Lecture : `opts.include.xxx` + éventuellement Set granulaire
6. Stats : ajouter au compteur dans `_kmzCollecterStats`

### 33. Refonte UX loader + fixes critiques (depuis v172)

Refonte de la liste 📚 Mes plans + 2 fixes critiques (sidebar landscape mobile, re-sélection ZIP V1/V2 mismatch). Toutes les modifs sont dans `index.html` (HTML + JS inline) et `css/style.css`, sauf le helper `syncModeFlags` ajouté à `js/planRegistry.js`.

#### 33.1 Toggle "Afficher les plans serveur" (persisté localStorage)

UI : checkbox dans `.loader-plans-filters` entre `.loader-section-head` et `#allPlansList`. Helpers `_loaderShowServerPlans()` / `_loaderSetShowServerPlans(v)` (clé `myktamap_loader_show_server_plans`, default true).

**Sémantique** : c'est un filtre d'**affichage uniquement** — les plans serveur restent dans le `PlanRegistry`. Filtré au moment du render dans `refreshPlansList` : `const filtered = showServer ? all : all.filter(p => p.type !== "server")`.

**Cas dégénéré** : registre non-vide mais filtre cache tout → message d'aide `.loader-plans-empty` ("Aucun plan local — coche <em>Afficher les plans serveur</em>...") au lieu d'une liste vide silencieuse.

**Pattern à réutiliser pour ajouter un futur filtre loader** : helper get/set localStorage (clé `myktamap_loader_<feature>`) + checkbox dans `.loader-plans-filters` + bind change handler → `refreshPlansList()` + filtre dans `refreshPlansList`.

#### 33.2 Restructure ligne plan (badges sur ligne 2)

Le rendu d'une ligne plan dans `planRowHTML` passe d'une structure compacte 4 lignes à une structure compacte 2 lignes :

| Avant (v170) | Après (v171) |
|---|---|
| L1 : nom + version + badges modes + storage | L1 : nom + version |
| L2 : sub (fichier + taille) | L2 : badges modes + storage (groupés) |
| L3 : date | — |

CSS clé : nouvelle `.plan-row-modes` avec `display: flex; align-items: center; gap: 4px; margin-top: 3px; flex-wrap: wrap;`. `align-items: center` nécessaire car les badges modes (9px monospace avec fond/bordure) et le badge storage (emoji 11px sans fond) ont des hauteurs différentes.

L'ancienne `.plan-row-badges` (sur ligne 1) est marquée DEPRECATED dans le commentaire CSS — gardée pour compat éventuelle si plugin user en dépend, mais le HTML standard ne la génère plus.

#### 33.3 Bouton ℹ️ + modale détaillée

Compense le retrait de sub/date avec une modale qui affiche **tous** les attributs du plan (et même plus : auteur, addedAt, perfPreset n'étaient pas affichés en v170).

Helper `_afficherInfosPlan(id)` dans `index.html` (~80 lignes). Lit `PlanRegistry.findById(id)`, génère un tableau 2 colonnes (clé/valeur) avec labels traduits en français et valeurs lisibles :
- `tiledV2: true` → "Mode : V2 tuilé (Google Maps-like)"
- `storedBlob: true` → "Persistance : ✅ Mémorisé dans l'app (IndexedDB)"
- Champs vides masqués automatiquement

Modale style `.kta-readme-modal-overlay` + classe dédiée `.kta-plan-infos-boite` (max-width 480px, max-height 80vh). Table `.kta-plan-infos-table` avec `.kta-info-key` (gris #8892a4, nowrap, width 40%) et `.kta-info-val` (couleur principale, word-break:break-word). Fermeture : ✕, backdrop, ou **Échap** (pattern cohérent).

Bouton `.plan-row-info-btn` dans `.plan-row-actions` (avant ▶️ Charger et ✕ Retirer). Hover bleu `#8cb4ff` cohérent avec la charte (▶️ vert, ✕ rouge, ℹ️ bleu).

#### 33.4 Checkbox "💾 Mémoriser ce plan dans l'app" coché par défaut

1 ligne de modif : `<input type="checkbox" id="storeBlobCb" checked>` (attribut HTML).

Visible **uniquement** sur mobile / Firefox / Safari (sans File System Access API) — Chrome/Edge desktop a 🔐 FS Access à la place. Avant : décoché → user devait penser à cocher manuellement → ZIP non mémorisé → re-sélection à chaque chargement → UX piège.

#### 33.5 Réglages : responsive PC ≥ 1024px

Modale ⚙️ Réglages reçoit le pattern responsive identique à la modale Doc/Aide (cf §22).

Mobile (< 1024px) : 440px max, 1 colonne — comportement v170 strict.

PC (≥ 1024px) : 1100px max + `columns: 2` via CSS column-flow.

**Différence assumée avec la modale Aide** : `break-inside: avoid` sur chaque section (.kta-aide-section dans le corps). La doc Aide a `columns: 2` SANS break-inside pour équilibrer les hauteurs de sections inégales (au prix d'un split occasionnel). Les Réglages ont des sections d'inputs/grilles homogènes en hauteur → break-inside acceptable, et couper en plein milieu d'un bloc d'inputs serait confusant.

Barre d'actions : `.kta-cfg-actions-bar` avec `column-span: all` sur PC + grid 4 colonnes (les 4 boutons Reset/Appliquer/Réinitialiser/Logs sur 1 ligne). Mobile : grid 2×2.

#### 33.6 Fix critique : icônes sidebar landscape mobile débordent

**Symptôme** : sur mobile en mode landscape (hauteur ≤ 500px), la sidebar topright (11 groupes accordéon) sortait du cadre. Une règle `@media (max-height: 500px)` existait avec `max-height + overflow-y: auto` mais ne FONCTIONNAIT PAS.

**Root cause** : Leaflet utilise `float: left/right` + `clear: both` sur `.leaflet-control` (héritage IE compat — cf. `lib/leaflet/leaflet.css` lignes 156-162). En layout floating, le **parent ne "voit" PAS la hauteur de ses enfants flottants** sans clearfix → `max-height` est appliqué mais le contenu (floats) déborde sans déclencher le scroll → `overflow-y: auto` ne s'active jamais.

**Fix** : bascule en `display: flex; flex-direction: column;` dans la media query landscape mobile uniquement. Spec CSS : un flex item ignore son `float` (standardisé). Les enfants empilés verticalement, hauteur comptée, overflow scroll natif s'active proprement.

`align-items: flex-end` (topright) / `flex-start` (topleft) reproduit l'alignement bord-droit / bord-gauche que le float assurait. Sans ça, les contrôles seraient alignés à gauche par défaut.

**Bonus** : `max-height` recalculé avec safe-area iOS : `calc(100vh - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px) - 16px)`. Sur iPhone landscape avec home indicator (inset-bottom = 21px), les derniers boutons étaient masqués sous la zone tactile système réservée.

**Portée** : topright (11 groupes — bug principal) + topleft (zoom + niveau + boussole — par cohérence). Portrait + desktop strictement inchangés.

**⚠️ À NE PAS RÉACTIVER LE FLOAT NATIF** dans cette media query sans avoir réfléchi à comment compter la hauteur des enfants flottants. Si on retire `display: flex`, le bug réapparaît silencieusement.

#### 33.7 Fix critique : re-sélection ZIP V1 sur plan registre V2

**Workflow buggé** : reset → import sauvegarde liste → registre rempli avec `tiledV2: true` pour les plans qui l'étaient → user clique sur un plan V2 → modale "Plan introuvable" → "Re-sélectionner le ZIP" → choisit le **même plan en V1** → badge V2 reste affiché à tort, risque de crash runtime.

**Root cause** : `PlanRegistry.addOrUpdate` utilise `Object.assign({}, existing, newEntry)` qui MERGE. `startImportedPlan` construit l'entry avec :
```js
if (rawConfig.plan.tiledV2 === true) entry.tiledV2 = true;
```
→ pour un V1, le champ est ABSENT de la nouvelle entry → Object.assign garde l'ancien `tiledV2: true` du registre.

**Fix 2 niveaux** :

**(a) Nouveau helper `PlanRegistry.syncModeFlags(id, flags)`** dans `planRegistry.js` qui aligne explicitement les flags :
- `flags.tiledV2 === true`  → set `p.tiledV2 = true`
- `flags.tiledV2 === false` → **delete** `p.tiledV2` (différent du merge !)
- Idem `multiLevel`
- Sauvegarde `_save()` si au moins un changement

Exposé dans l'API publique.

**(b) Détection dans `reSelectionnerZipPourPlan`** (index.html). Après extraction du `plan-config.json` du ZIP fourni, comparer les flags `tiledV2` / `multiLevel` au registre. Si discordance → `confirm()` avec message détaillé listant chaque flag changé (avant → après). Si OK → `syncModeFlags(plan.id, zipFlags)` AVANT `chargerZipFichier` → `startImportedPlan` part d'un état propre.

**4 cas couverts** (peuvent se cumuler) : V2↔V1 (2 sens) + Multi-niveau↔Mono (2 sens).

**Choix volontaire `confirm()` natif** : pattern cohérent avec le check du nom de plan déjà en place dans la même fonction. Modale custom = 80 lignes pour un cas marginal de re-sélection. À basculer en modale custom si retour user terrain.

**Non touché** : flow d'import normal (📦 Charger) — l'id est auto-généré donc pas de pré-état à réconcilier. Auto-discovery serveur idem (entry construite from scratch).

#### 33.8 Pattern à retenir : Object.assign et merge silencieux

⚠️ **Piège général** : `Object.assign({}, existing, newPartial)` GARDE les anciens champs si `newPartial` ne les redéclare pas. Si une logique métier dépend de l'**absence** d'un flag (ex: pas de `tiledV2` = mode V1), un merge silencieux peut préserver un flag obsolète.

Solution :
- Soit construire `newPartial` avec tous les flags possibles explicitement (true OU false/null pour delete)
- Soit utiliser un helper dédié comme `syncModeFlags` qui set/delete explicitement
- Soit changer `Object.assign` en remplacement total — mais alors faut tout redéclarer (addedAt, lastOpened, etc.)

Le projet a choisi l'option helper dédié pour la rétro-compat (addOrUpdate continue de merge naturellement pour les autres champs, seul un sync explicite via syncModeFlags affecte les flags V2/multiLevel).

### 34. Correction heading selon orientation écran (depuis v172)

Fix critique : la boussole 🧭 (cf §25) et la rotation de l'icône tracker (cf §28) étaient faussées en mode landscape (±90° de décalage) et portrait inversé (180°).

#### 34.1 Root cause

`DeviceOrientationEvent` renvoie α/β/γ par rapport aux axes **intrinsèques** du device :
- Axe Y = bord court "haut" physique du tel
- En portrait normal : axe Y aligné avec le haut visuel → heading brut OK
- En landscape : OS a tourné l'écran mais le device n'a pas bougé → l'axe Y pointe vers la gauche/droite visuelle → décalage angulaire perçu comme un bug

Le calcul `getHeading(α, β, γ)` v147 (cf §24) reste correct mais renvoie la direction vers laquelle pointe le **haut device**, pas le **haut visuel**.

#### 34.2 Architecture en 3 couches

**1. `direction`** (existant) reste la valeur **device brute**. Source de vérité pour debug + cohérence avec iOS `webkitCompassHeading` qui est aussi brut (compass natif iOS retourne le heading de l'axe Y device).

**2. `_getCorrectedHeading()`** (nouveau) applique l'offset écran :
```js
function _getCorrectedHeading() {
  if (typeof direction !== "number" || isNaN(direction)) return 0;
  return ((direction + _screenAngle) % 360 + 360) % 360;
}
```

**3. `_screenAngle`** (0 / 90 / 180 / 270) maintenu à jour à 2 moments :
- Au boot de `_initScreenOrientationListener()` (appelé par `initOrientation` qui est déclenché par `requestPermission` du tracker OU de la boussole 🧭 — couvert même sans tracker actif)
- Sur event `screen.orientation.change` (standard) OU `window.orientationchange` (fallback iOS Safari < 16.4 + vieux Android) → l'user tourne son tel → recalage instantané sans attendre le prochain event device → l'icône tracker est aussi ré-orientée immédiatement via `_applyRotationToTrackerMarker()`

#### 34.3 Cascade compat `screen.orientation`

Helper `_getScreenAngleNormalized()` :

```js
function _getScreenAngleNormalized() {
  // Standard moderne (Chrome, Firefox, Edge, Safari ≥ 16.4)
  if (screen && screen.orientation && typeof screen.orientation.angle === "number") {
    return ((screen.orientation.angle % 360) + 360) % 360;
  }
  // Fallback iOS Safari < 16.4 — convention OPPOSÉE pour landscape :
  //   iOS 0 → standard 0,  iOS 180 → standard 180
  //   iOS 90 → standard 270 (LS-left iOS = LS-secondary standard)
  //   iOS -90 → standard 90 (LS-right iOS = LS-primary standard)
  if (typeof window.orientation === "number") {
    const v = ((window.orientation % 360) + 360) % 360;
    if (v === 0 || v === 180) return v;
    return (360 - v) % 360;
  }
  return 0;
}
```

⚠️ **Piège** : `screen.orientation.angle` et `window.orientation` ont des **conventions opposées** pour landscape. L'OS standard dit "90 = écran tourné 90° anti-horaire par moi" (= user a tourné tel 90° horaire), iOS dit "90 = device rotated 90° counter-clockwise". Sans normalisation, on aurait un bug iOS ⇄ Chrome dans la même formule.

#### 34.4 Validation math

(heading device + screen.angle) % 360. Cas testés (user face Nord) :

| Orientation visuelle | α device | screen.angle (standard) | corrected |
|---|---|---|---|
| Portrait normal | 0 | 0 | 0 ✓ |
| Landscape-PRIMARY | 270 | 90 | 0 ✓ |
| Landscape-SECONDARY | 90 | 270 | 0 ✓ |
| Portrait inversé | 180 | 180 | 0 ✓ |

**Justification** : si l'OS a tourné l'écran de θ° anti-horaire, le bord du device qui pointe désormais vers "haut visuel" est l'ancien bord à θ° du bord court "haut" device dans le sens horaire. Le heading visuel = heading brut + θ.

#### 34.5 Consumers basculés vers la version corrigée

- **`_applyRotationToTrackerMarker`** (tracking.js, cf §28) : `const heading = _getCorrectedHeading();` au lieu de `direction` directement. L'icône tracker tourne dans le sens cohérent avec l'orientation visuelle de la carte affichée.
- **`window.getCurrentHeading`** (consommé par compass.js widget boussole, cf §25.1) : `return _getCorrectedHeading();` au lieu de `return direction;`. La rose des vents contre-tourne par rapport au heading corrigé → le N reste en haut visuel quelle que soit l'orientation.

⚠️ **À ne pas faire** : appliquer la correction dans `_onOrientation` directement (= modifier la variable `direction`). Ça casserait la sémantique "direction = device brut" utile pour le debug + cohérence avec iOS webkitCompassHeading. Préférer toujours l'application à la lecture via le helper.

#### 34.6 Log debug enrichi

Format : `[Tracking] Heading : 270.0° (source: webkitCompassHeading, screen: 90°, visuel: 0.0°)`. Permet de diagnostiquer rapidement brut device vs correction appliquée vs résultat final consommé.

#### 34.7 Préservé (ne pas toucher)

- Math `getHeading(α, β, γ)` v147 (formule "pose à plat" / "pose verticale" inchangée)
- Smoothing exponentiel + throttle 2° + transition CSS 0.3s de l'icône tracker (§28)
- Cascade sources iOS `webkitCompassHeading` → Android `deviceorientationabsolute` → calc brut (§24)
- Tous les flags idempotents (`_orientationListenerAttached`, `_motionListenerAttached`, `_screenOrientationListenerAttached`)

### 35. Modales custom pour re-sélection ZIP (depuis v172)

Remplacement des `confirm()` natifs OS dans `reSelectionnerZipPourPlan` (index.html) par des modales custom respectant la charte graphique du projet. Plus important : changement **fonctionnel** sur le cas "nom différent" — refus définitif au lieu de "Charger quand même".

#### 35.1 Modale "Nom différent" — `_afficherModaleNomZipKO(zipName, planName)`

API : `Promise<void>` (résout quand l'user ferme, peu importe l'action).

Visuel : border + accent rouge `#ff8c8c` (cohérent avec `.plan-row-remove:hover` et autres modales d'erreur), grille 2 colonnes "Plan ciblé / ZIP fourni" pour visualiser la discordance, hint italique expliquant le refus + alternative (passer par 📦 Charger un nouveau plan), **1 seul bouton "J'ai compris"** primary.

Fermeture : ✕, backdrop, Échap (toutes équivalentes — résout sans charger le ZIP).

**Changement fonctionnel v172** : avant on avait `confirm("Charger quand même ?")` qui permettait à l'user d'accepter et créait des incohérences silencieuses (badges, sessions, métadonnées). Maintenant : refus définitif, pas de bypass.

#### 35.2 Modale "Mode différent" — `_afficherModaleModeDifferent(planName, discordances)`

API : `Promise<boolean>` (true = continuer, false = annuler).

Visuel : border + accent orange `#ffb380` (cohérent avec warnings du projet, V2 generation, OOM toast warn…), 1 carte par discordance dans une grille verticale avec titre flag en gras orange + comparaison "Mode mémorisé : ... / Mode du ZIP : ..." en blocs lisibles, hint italique expliquant que le ZIP fait foi, 2 boutons "Annuler" (ghost) + "Continuer" (primary).

Fermeture : ✕, backdrop, Échap = annuler (résout false). Click sur "Continuer" = résout true.

Le ZIP fait foi → `syncModeFlags` appliqué après confirmation pour aligner le registre sur le contenu réel du ZIP.

#### 35.3 Pattern réutilisable pour futures modales

Promise-based, idéal pour intégration dans des flows async existants :
```js
const ok = await _afficherModaleModeDifferent(planName, discordances);
if (!ok) return;
```

Structure type :
1. Helper `function _afficherModaleXxx(args)` qui retourne `new Promise(function(resolve) { ... })`
2. Cleanup d'une éventuelle modale précédente (`if (existing) existing.remove();`)
3. Création DOM avec classes `.kta-readme-modal-overlay` + `.kta-readme-modal-boite`
4. Border/accent inline-style pour la couleur sémantique (rouge erreur, orange warning, etc.)
5. Bind ✕ + click backdrop + keydown Escape → tous appellent `_close(<result>)` qui retire la modale + retire le listener Escape + résout la Promise

#### 35.4 Pourquoi pas de confirm() natif

- Pas customisable visuellement → casse la charte
- Pas Promise-friendly nativement (bloque le thread JS)
- Position et apparence dépendent de l'OS → incohérent entre desktop/mobile
- Texte sec, pas de mise en forme (gras, couleurs, listes…)
- Bouton "OK/Annuler" pas customisable → pas de "J'ai compris" sémantique

⚠️ **`confirm()` natifs gardés** dans le projet (volontaire, pas à toucher sauf demande explicite) :
- "Retirer ce plan de votre liste ?" (action destructive simple)
- "Tracé en cours, charger un autre plan ?" (rapide, contexte évident)

### 36. Unlock Gate — barrière communautaire d'accès (depuis v173)

Module `js/unlockGate.js` qui intercale un écran de saisie de mot de passe entre la fin du splash et le démarrage normal de l'app. Vérification 1 fois à la 1ère installation, mémorisé en localStorage ensuite, re-demandé après reset complet.

#### 36.1 ⚠️ Niveau de sécurité — barrière SOCIALE, pas une vraie auth

MyKTAMap est une PWA 100% client → tout le code HTML/JS/CSS est servi en clair par Nginx ET disponible publiquement sur GitHub (`Karmakta91/MyKTAMap`). Cette gate est efficace pour :
- ✅ Décourager les passants / robots d'indexation
- ✅ Cadrer "communauté" → "il faut connaître le code"
- ❌ NE PAS empêcher un attaquant motivé (hash dans le code → brute force offline trivial ; bypass `localStorage.setItem("myktamap_unlock_v1", "<hash>")` en F12 → 5 secondes)

**KARMA explicitement informé et a validé.** Le mdp est communiqué hors-bande aux utilisateurs (forum, message direct).

#### 36.2 Hash hardcodé (SHA-256)

Le mdp en clair n'apparaît PAS dans `unlockGate.js` — juste son hash SHA-256 calculé via `crypto.subtle.digest`. Pour bumper le mdp :
```bash
echo -n "<nouveau-mdp>" | openssl dgst -sha256
```
Mettre le résultat dans la const `HASH_VALIDE` de `unlockGate.js`. Au prochain boot, les users qui avaient l'ancien hash en localStorage seront re-demandés (le hash en LS ne matchera plus le nouveau).

⚠️ **Si on change le mdp** : il faut aussi changer la const `KTA_UNLOCK_PASSWORD_DISPLAY` dans `interface.js` (mdp en clair affiché dans la modale Reset). Ces 2 valeurs doivent rester synchronisées.

#### 36.3 5 tentatives + lockout permanent

Compteur persisté en `localStorage["myktamap_unlock_attempts"]` (résiste au reload).
- Tentatives 1-4 : message rouge "❌ Code incorrect. Tentatives restantes : N"
- Tentative 5+ : LOCKOUT permanent
  - Champ saisie masqué
  - Message "🚫 Trop de tentatives" + sous-texte italique "Le brute force c'est mal, m'voyez." (clin d'œil validé KARMA)
  - **PAS de bouton reset** depuis le lockout — sinon bypass trivial (reset → modale Reset affiche le mdp → l'user note → re-saisit → contourne le lockout). L'user qui ne connaît pas le code DOIT désinstaller l'app manuellement (long-press icône / vider cache navigateur / `localStorage.clear()` en F12).
  - Lien externe vers `myktamap.fr` pour contacter l'auteur si l'user a légitimement perdu son accès

#### 36.4 Position dans le flow `main.js > initApp`

APRÈS `_splashEnd()`, AVANT `PlanRegistry.init()` et tout le reste :
```js
if (window.UnlockGate && !window.UnlockGate.isUnlocked()) {
  await _splashEnd();
  await window.UnlockGate.ouvrirGate();  // bloque jusqu'à unlock
}
```
- User authentifié (cas le plus fréquent = 2e boot+) : gate skip silencieusement, comportement v172 strictement préservé
- 1ère installation : splash 4s → gate → saisie → unlock → loader
- Lockout : `ouvrirGate()` ne résout JAMAIS la Promise → `await` reste bloqué pour toujours → l'app reste sur l'écran lockout

#### 36.5 Affichage du mdp dans la modale Reset

Constante `KTA_UNLOCK_PASSWORD_DISPLAY` dans `interface.js` (mdp en clair). Affichée dans la 1ère modale de confirmation de reset via un bloc jaune accent :
```
🗝️ Code d'accès requis au redémarrage
Après reset, l'app redemandera le code d'accès communautaire :
[F!sYs44!h4z!3J]   ← code en monospace, fond noir, user-select:all
Note-le ou copie-le avant de reset, sinon tu ne pourras plus rentrer !
```

Permet à un user **déjà authentifié** de reset proprement sans perdre l'accès. C'est le SEUL endroit du code où le mdp apparaît en clair (volontaire — sinon impossible à afficher).

`localStorage.clear()` de `viderCacheAppli` purge naturellement le flag `myktamap_unlock_v1` → la gate redemande au prochain boot. Pas besoin d'appeler `UnlockGate.lock()` explicitement.

#### 36.6 API publique `window.UnlockGate`

- `isUnlocked()` → bool — lit `localStorage["myktamap_unlock_v1"]`
- `isLockedOut()` → bool — true si attempts ≥ 5
- `ouvrirGate()` → Promise — résout `true` à l'unlock, NE RÉSOUT JAMAIS en lockout
- `lock()` → void — retire les flags (utilitaire, pas appelé par défaut)

#### 36.7 Workflow release / bump du mdp

À chaque release qui touche au mdp, **impératif** : afficher le nouveau mdp dans `version.json > notes` (en première puce, avec warning explicite) pour que les users qui mettent à jour le voient AVANT l'update. Sinon : update → cache PWA purgé → nouveau code chargé → gate apparaît → user bloqué car n'a pas noté le mdp.

Format suggéré pour la 1ère puce de v173+ :
```
🔐 IMPORTANT — Accès restreint communautaire activé. Si tu mets à jour,
l'app te demandera un code d'accès au prochain démarrage. Le code est :
F!sYs44!h4z!3J — note-le avant de mettre à jour !
```

#### 36.8 À NE PAS faire

- **Ne JAMAIS** réintroduire un bouton reset depuis le lockout (bypass trivial). Si un user perd son accès → désinstaller manuellement (= friction délibérée).
- **Ne PAS** exposer le mdp en clair via `window.UnlockGate.getPassword()` ou similaire (rendrait inutile le hash dans le code).
- **Ne PAS** bumper le mdp sans synchroniser HASH_VALIDE (unlockGate.js) ET KTA_UNLOCK_PASSWORD_DISPLAY (interface.js) ET la première puce de version.json.

### 37. Icônes adaptatives au zoom (depuis v1.7.1)

Toggle `APP_CONFIG.scaledMarkers` (default `true`) qui fait scaler les icônes des markers selon le niveau de zoom pour garder leur taille **relative au plan** constante (au lieu du comportement Leaflet par défaut = taille écran fixe = icônes énormes au dézoom).

#### 37.1 Pattern technique

Comme le tracker (§28) : `L.divIcon` avec `<div>` wrapper (positionné via translate3d Leaflet) + `<img class="kta-marker-img">` enfant (scaled via CSS transform). Sans wrapper, on ne peut pas appliquer 2 transforms indépendamment.

`map.js > creerIcones > _mkIcon(url, w, h, ax, ay)` :
- Si `scaledMarkers === true` (default) → `L.divIcon` avec `<img class="kta-marker-img">`
- Sinon → `L.icon` natif (comportement v172)
- Dans les 2 cas : `ic._kta_iconUrl = url` posé en backup pour les consumers

CSS variable `--kta-marker-scale` sur `<body>` mise à jour dans `initMapFromConfig` via :
```js
map.on("zoomend zoom", function() {
  const z = map.getZoom();
  const clamped = Math.max(0.25, Math.min(2, Math.pow(2, z)));
  document.body.style.setProperty("--kta-marker-scale", clamped);
});
```

CSS : `.kta-marker-img { transform: scale(var(--kta-marker-scale, 1)); transform-origin: center; }`.

#### 37.2 Clamp 0.25 / 2

- Au zoom -2 et au-delà → scale `0.25` (= 12.5px visible, pas invisible)
- Au zoom +2 (rare, déjà au max MyKTAMap) → scale `2` (= 100px, évite des icônes ridiculement énormes)
- Entre les 2 : scale linéaire en `2^zoom`

#### 37.3 Pièges _kta_iconUrl (consumers patchés)

Avec `scaledMarkers === true`, `_iconMap[tag]` est un `L.divIcon` → `options.iconUrl` n'existe pas. **Tous les sites qui lisaient cette propriété** ont été adaptés au pattern :
```js
const url = entry._kta_iconUrl || (entry.options && entry.options.iconUrl) || null;
```

7 sites patchés :
- `utils.js > getIconUrlForPoint > urlFromMapEntry`
- `editor.js > _ajouterMarker` (validation icône)
- `exporter.js > _iconePourTag` + default fallback
- `interface.js > urlPourCle` + `getIconUrl` (légende UI)
- `sessionExporter.js > _iconePourTag` (modale session)
- `sessionExporter.js > _kmzIconePourTag` (modale KMZ)
- `sessionExporter.js > iconsToEmbed` builder (KMZ export)

⚠️ **À faire** si on ajoute un nouveau consumer qui lit `_iconMap[tag].options.iconUrl` direct : adapter au pattern fallback ci-dessus, sinon ça casse en mode scaledMarkers.

#### 37.4 Non touché (volontaire)

- **Tracker** (cf §28) : garde ses classes `kta-tracker-divicon` / `kta-tracker-img` distinctes → pas concerné par le CSS variable `--kta-marker-scale`. Taille écran fixe préservée. Utile pour le repérage visuel au dézoom (l'user veut TOUJOURS voir où il est).
- **iconeDefault Leaflet natif** (`L.Icon.Default` = pin bleu) : pas scalé. Anchor bas-centre incompatible avec scale around center → décalerait la pointe. Cas marginal (uniquement si plan sans `icons.default`).
- **Exports PNG / KMZ** : continuent de produire des images taille originale. Les transform CSS n'affectent que le rendu Leaflet runtime, pas les exports canvas qui peignent les icônes à leur taille brute.

#### 37.5 Reload requis pour changement du toggle

`scaledMarkers` est lu UNE FOIS dans `creerIcones` au load du plan. Toggle dans ⚙️ Réglages → 🔍 Affichage (liseré orange = reload requis). Si l'user toggle sans reload, les icônes existantes restent en L.icon ou L.divIcon selon leur état au moment de la création.

### 38. Double-clic sur un marker → zoom flyTo (depuis v1.7.1)

Détection manuelle via 2 `click` consécutifs en < 400ms sur le même marker (pas l'event natif Leaflet `dblclick`).

#### 38.1 Pourquoi pas l'event natif `dblclick`

1ère itération (commit cb846da) utilisait `marker.on("dblclick", ...)`. **Bug remonté KARMA : ne se déclenche jamais en pratique**. Causes probables (cumulatives) :
- Le handler `click` posé par `marker.bindPopup` (pour ouvrir/fermer le popup au clic) "mange" les events et l'agrégation 2-clicks-en-dblclick n'a pas le temps de se déclencher.
- Sur mobile : pas d'event `dblclick` natif fiable. Les touch events synthétisent juste des `click`, et Leaflet ne fait pas le boulot de détection 2-taps-rapides systématiquement.

#### 38.2 Pattern actuel (fix v1.7.1)

Helper `window.attachMarkerDblClickZoom(marker)` dans `utils.js` :
```js
let _lastClickTime = 0;
const DBL_DELAY_MS = 400;
marker.on("click", function() {
  const now = Date.now();
  const isDbl = (now - _lastClickTime) < DBL_DELAY_MS;
  _lastClickTime = isDbl ? 0 : now;  // reset après dblclick pour éviter triple-trigger
  if (!isDbl) return;  // 1er clic : Leaflet ouvre le popup normalement
  // ... closePopup + flyTo
});
```

Compteur `_lastClickTime` PAR marker via closure (pas de variable globale qui mélangerait si l'user clique sur marker A puis marker B rapidement).

#### 38.3 Comportement

- **1er clic** → Leaflet ouvre le popup normalement (comportement préservé)
- **2e clic en < 400ms sur le même marker** → :
  1. closePopup (le popup vient peut-être de s'ouvrir au 2e clic via le toggle Leaflet bindPopup)
  2. flyTo smooth (0.6s) sur la position avec zoom +2 clampé au `map.getMaxZoom()` (= 2 dans MyKTAMap)
- **2e clic au-delà de 400ms** → reset compteur, traité comme un 1er clic d'une nouvelle séquence

#### 38.4 Pas de `stopPropagation`

Volontaire : on laisse Leaflet faire son travail au 1er clic (ouverture popup). Au 2e clic, Leaflet peut faire son toggle (fermer le popup) en parallèle de notre closePopup — pas de conflit visible car les 2 actions sont synchrones.

⚠️ Si un jour on veut empêcher le popup au 1er clic d'une séquence dblclick (= pas d'ouverture/fermeture flash), il faudrait soit un délai 400ms avant d'ouvrir le popup au 1er clic (mais perceptible), soit intercepter l'event au mousedown plutôt qu'au click. Compromis actuel acceptable.

#### 38.5 Sites équipés

- `utils.js > ajouterPointsDepuisJSON` (markers data layers, après bindPopup et avant addTo)
- `editor.js > _ajouterMarker` (markers session éditeur, après bindPopup)

**Non concerné** : tracker (comportement spécifique dans `tracking.js`, position temps réel), lost mode markers (popups dédiées avec badges in-zone/hors zone).

À ajouter ailleurs si nouveau type de marker est introduit, via simple appel `window.attachMarkerDblClickZoom(marker)` après bindPopup.

### 39. Refonte UX page d'accueil — Modale ⚙️ Configuration (depuis v1.7.3)

Regroupement de tout ce qui était éparpillé dans le loader (drawer Perf + section "Plus d'options") dans une **modale unique** ouverte depuis un bouton `⚙️ Configuration` dans le header du loader. Refonte purement UX, aucun changement de comportement sous-jacent.

#### 39.1 Architecture avant / après

**Avant v1.7.3** :
- `<details class="loader-perf-drawer">` (drawer dépliable) avec Tiling + ULTRA dans la home
- Section collapsable `⚙️ Plus d'options` avec 4 boutons : 🏗️ Générer un plan, 📥 Conf exemple, 🐛 Logs détaillés, 💥 Tout réinitialiser
- → 2 zones distinctes pour des réglages liés, UX confus

**Après v1.7.3** :
- Header loader : 3 boutons (📖 Documentation, 🚨 Alertes, ⚙️ Configuration)
- `⚙️ Configuration` ouvre une **modale unique** `#loaderConfigModal` (~140 lignes HTML) regroupant :
  1. 🖼️ Tiling (segmented 5 presets)
  2. 🚀 ULTRA (7 toggles)
  3. 🛠️ Debug → toggle 🐛 Logs détaillés + bouton **📋 Afficher les logs** *(nouveau, suite KARMA)*
  4. 🔄 **Force update douce** *(nouveau)*
  5. 💥 Tout réinitialiser
- `🏗️ Générer un plan` reste directement visible dans la home (action de **création**, pas un réglage)
- `📥 Conf exemple` déplacé en icône dans le modal du Générateur (section "📂 Charger un ZIP existant")

**Symétriquement, retiré de la modale ⚙️ Réglages in-app (map mode)** *(suite KARMA)* :
- Bouton `🗑️ Réinitialiser` retiré de `kta-cfg-actions-bar` (interface.js)
- Le reset complet n'est désormais accessible que depuis la modale ⚙️ Configuration du loader (home)
- Raison : limiter les déclenchements accidentels une fois un plan chargé (user perd potentiellement session active + plans mémorisés en 2 clics)
- Pour reset depuis la map : 🗂️ titre cliquable → home → ⚙️ Configuration → 💥 Tout réinitialiser
- Conséquence CSS : `.kta-cfg-actions-bar` passe de `grid-template-columns: 1fr 1fr 1fr 1fr` (4 cols PC) / `1fr 1fr` (2 cols mobile) à `1fr 1fr 1fr` partout (3 boutons : Reset / Appliquer / 🐛 Logs)

#### 39.2 Force update douce — `window.mettreAJourCodeSeul()`

Nouveau bouton 🔄 dans la modale Configuration. Réutilise le pipeline `mettreAJourCodeSeul` existant (utilisé par le badge version cliquable depuis v1.5.x).

Différences fondamentales avec `viderCacheAppli()` :

| | Force update douce | Tout réinitialiser |
|---|---|---|
| Cache PWA (Service Worker) | ✅ Purgé | ✅ Purgé |
| localStorage | ❌ Préservé | ✅ Purgé |
| IndexedDB (plans mémorisés, sessions) | ❌ Préservé | ✅ Purgé |
| Unlock Gate (code d'accès) | ❌ Préservé | ✅ Reset (re-demandé au boot) |
| Confirmation | ✅ Modale simple (1 étape) | ✅ Double confirm |
| Ping internet | ✅ (interne à `mettreAJourCodeSeul`) | ✅ (avant la double confirm) |

**Garde-fou de confirmation** (`_afficherConfirmForceUpdate`, index.html) : modale custom Promise-based (pattern `.kta-readme-modal-overlay` + accent bleu info) qui explique avant le déclenchement :
- Ce qui va se passer : purge cache des assets + reload + re-download
- Ce qui est préservé : plans, sessions, prefs, unlock gate
- Conditions : connexion Internet active (vérifiée juste après par `mettreAJourCodeSeul`), reload immédiat

L'action est non-destructive donc 1 étape de confirmation suffit (différent du Reset qui en a 2 + ping pré-modale). Le ping Internet vit toujours dans `mettreAJourCodeSeul` côté `interface.js > _softUpdateOfflineWarning`, pas dupliqué dans le handler du bouton.

Use case : user signale "l'app n'a pas la dernière feature" → un Force update douce force un re-fetch du SW + caches.delete + reload, sans perdre ses données. Ne pas confondre avec un vrai reset.

#### 39.3 Pattern HTML/CSS

Modale `#loaderConfigModal` suit le pattern `.kta-readme-modal-overlay` + `.kta-readme-modal-boite` (déjà utilisé partout dans le projet). Boutons handlers dans `index.html` (inline) :

- `loaderConfigBtn` → `_ouvrirLoaderConfig()` (set `display:flex`)
- `loaderConfigClose` + backdrop click + Escape → `_fermerLoaderConfig()`
- `loaderForceUpdateBtn` → `window.mettreAJourCodeSeul()`

Les handlers existants pour Tiling segmented / ULTRA toggles / 🐛 Logs / 💥 Reset sont conservés et juste **déplacés** dans le DOM. Pas de changement de logique.

#### 39.4 Multi-niveau (M-LVL) — Activation déplacée du Réglages au Générateur

Retrait du toggle `🏗️ Plan multi-niveau` dans `afficherConfig` (`interface.js`). Cascade de lecture inchangée :

```
APP_CONFIG.multiLevel ←
  PlanRegistry[id].multiLevel       (legacy ≤ v1.7.2, lecture conservée)
  PLAN_CONFIG.plan.multiLevel       (SOURCE UNIQUE depuis v1.7.3)
  false
```

Fonctions `_renderMultiLevelSection` / `_bindMultiLevelToggle` (interface.js) restent définies en **dead code propre** avec commentaire explicatif. Si retour terrain demande à ré-exposer le toggle (cas marginal), il suffit de re-appeler les 2 fonctions dans `afficherConfig`.

#### 39.5 Footer copyright

`© 2026 Flavien VIDAL [karma.png] · CC BY-NC-SA 4.0 ...` → `© 2026 [karma.png] · CC BY-NC-SA 4.0 ...`.

Seule la mention texte **"Flavien VIDAL"** (nom civil) est retirée du DOM. L'image signature `karma.png` est **conservée** comme identité visible du copyright, cohérente avec son usage au splash.

"Flavien VIDAL" reste présent dans les headers `/*! MyKTAMap (c) 2026 Flavien VIDAL ... */` des 7 fichiers JS critiques + meta tags `<head>` → **force probante légale préservée**. Seule la mention visible utilisateur côté loader est épurée.

CSS `.kta-loader-copyright-sig` toujours active (l'image reste dans le DOM, juste sans le nom civil à côté).

#### 39.6 Titre stylisé de la home

`📦 MyKTAMap` (basique) → lockup graphique Option D :
- Logo `mkm-full.png` (rose des vents jaune, +1024px, drop-shadow halo jaune)
- "MyKTAMap" en grand
- "Cartographie souterraine" en tagline (remplace "Cartographie terrain" partout dans la page de chargement)
- Hover pulse + responsive (vertical mobile, horizontal ≥1024px)

Nouvelles classes CSS dédiées : `.loader-titre`, `.loader-titre-logo`, `.loader-titre-textes`, `.loader-titre-nom`, `.loader-titre-tagline`.

#### 39.7 Pour ajouter un nouveau réglage de loader (futur)

1. Ajouter le HTML dans la modale `#loaderConfigModal` (`index.html`) à l'endroit logique (Tiling / ULTRA / Debug / Maintenance)
2. Bind du handler dans le script inline de `index.html`
3. Ne PAS recréer une section séparée hors de la modale — la philosophie v1.7.3 est : **tout réglage du loader vit dans la modale Configuration**. Seuls les boutons d'**action** (créer un plan, charger un plan) restent dehors.

### 40. Privacy & Audit — Module `networkAudit.js` (depuis v1.8.0, ajustements CSP en v1.8.1)

Module de transparence + vérifiabilité construit pour répondre à la méfiance légitime du milieu cataphile vis-à-vis des "backdoors" qui exfiltreraient les plans. **L'app étant 100% client-side, la collecte est techniquement impossible ; ce module rend ça vérifiable par l'utilisateur sans qu'il ait à nous croire sur parole.**

#### 40.1 Architecture

Module IIFE `js/networkAudit.js` (~350 lignes) chargé **EN DEUXIÈME** dans l'ordre des scripts (juste après `copyright.js` qui ne fait que `console.log`, et **avant tout module qui fait du fetch**). Ordre critique : si on inverse avec `debug.js` ou plus, les premiers `fetch()` passent sous le radar.

Mécanisme : monkey-patch des 5 API réseau du navigateur AVANT que tout autre code ne puisse les appeler :
- `window.fetch`
- `XMLHttpRequest.prototype.open` + `.send`
- `navigator.sendBeacon`
- `WebSocket` (constructor wrapper)
- `EventSource` (constructor wrapper)

Chaque appel est :
1. Loggué dans un **buffer circulaire de 500 entries** (RAM uniquement, pas localStorage)
2. Vérifié contre une **whitelist hardcodée**
3. Si paranoia ON + non-whitelisté → **bloqué AVANT d'atteindre le réseau** (Promise reject pour fetch, throw pour XHR/WS/SSE, return false pour sendBeacon)

#### 40.2 Whitelist (visible côté UI)

2 entrées hardcodées dans `WHITELIST_PATTERNS` (array de fonctions `(url) => boolean`) :

1. **Same-origin** : `new URL(url, location.origin).origin === location.origin` → autorise toute requête vers le domaine de l'app (asset HTTP, version.json, alert.json, data/*, docs/*, …)
2. **`https://www.gstatic.com/generate_204`** (literal exact) → ping connectivité no-cors, aucune donnée envoyée

`WHITELIST_HUMAN` exposé en string-array lisible affiché dans la modale 📖 Doc audit pour l'user.

#### 40.3 API publique `window.NetworkAudit`

- `getLog()` → `Array<Entry>` (copie immutable du buffer)
- `clear()` → vide le buffer
- `setParanoia(boolean)` → toggle + persistance `localStorage["myktamap_network_paranoia_v1"]` + hook `window._kta_majBadgeParanoia` pour le badge footer
- `isParanoia()` → état actuel
- `onLog(callback)` → subscribe live, retourne unsubscribe (utilisé par la modale 📋 Journal)
- `WHITELIST_HUMAN` → array readonly de descriptions
- `exportJson()` → string JSON formaté (utilisé par bouton 📥 Exporter)

**Structure `Entry`** :
```js
{
  timestamp: 1747923456789,  // Date.now()
  kind:      "fetch",         // ou "xhr", "beacon", "websocket", "eventsource"
  url:       "...",
  method:    "GET",           // ou POST, WS, SSE, etc.
  hasBody:   false,           // true si payload envoyé
  category:  "plan-data",     // ou app-script, ping, external, etc. (cf. _classify)
  status:    200,             // HTTP status OU "BLOCKED", "FAIL", "OPEN", "SENT"
  blocked:   false            // true si bloqué par paranoia
}
```

#### 40.4 UI (uniquement dans la modale ⚙️ Configuration du loader)

Section "🔒 Confidentialité & Audit" dans `#loaderConfigModal` avec :
- Bouton 📋 Voir le journal réseau → modale `#loaderNetLogModal` (tableau live + sticky header + scroll body + boutons 📋 Copier / 📥 Exporter / 🗑️ Vider)
- Bouton 📖 Que fait l'app sur le réseau ? → modale `#loaderNetDocModal` (lead + whitelist + comment vérifier + CSP + bouton 📄 Ouvrir doc complète → `docs/NETWORK_AUDIT.md`)
- Toggle 🔒 Mode hors-ligne strict (`label.kta-net-paranoia-toggle` avec accent orange)

**Badge `kta-net-paranoia-badge`** dans le footer du loader (`#loaderParanoiaBadge`) : visible uniquement quand paranoia ON, animation pulse douce, cliquable → ouvre la modale Configuration. Helper `window._kta_majBadgeParanoia()` sync le badge + la checkbox depuis l'état NetworkAudit.

⚠️ **Pas de section dans la modale ⚙️ Réglages in-app (map mode)** — décision KARMA : tout réglage sensible reste dans le loader. Cohérent avec la refonte v1.7.3 (cf. §39).

#### 40.5 Catégorisation visuelle dans le journal (UI)

`_classify(url)` retourne un label affiché en couleur :

| Catégorie | Pattern URL | Couleur |
|---|---|---|
| `app-page` | `/`, `.html` | bleu |
| `app-script` | `.js` | bleu |
| `app-style` | `.css` | bleu |
| `image` | `.png`, `.jpg`, `.jpeg`, `.webp`, `.svg`, `.gif` | vert |
| `data` | `.json` (générique) | violet |
| `plan-data` | `/data/...` | violet |
| `version-check` | `/version.json` | jaune |
| `alert-check` | `/alert.json` | orange |
| `doc` | `.md` | gris clair |
| `ping` | `gstatic.com/generate_204` | gris |
| `external` | autre origine | rouge |
| `same-origin` | autre same-origin | bleu clair |
| `unknown` | erreur de parsing URL | gris |

Aide visuelle pour repérer rapidement les anomalies dans le journal (toute catégorie `external` autre que `ping` devrait alarmer).

#### 40.6 Mode paranoia — comportements précis

- **fetch** : reject avec `Error("[NetworkAudit] Bloqué par le mode hors-ligne strict : <url>")`
- **XHR** : throw même erreur dans `.send()` (le caller reçoit une exception synchrone)
- **sendBeacon** : retourne `false` (compat API native)
- **WebSocket** : throw dans le constructor wrapper
- **EventSource** : throw dans le constructor wrapper

Persistance : `localStorage["myktamap_network_paranoia_v1"] = "1"` quand actif. Pas de fallback si localStorage indisponible (incognito strict) → paranoia OFF par défaut.

⚠️ Si on ajoute un nouveau type d'API réseau (genre WebTransport, RTCPeerConnection) **il faut l'instrumenter** dans `networkAudit.js`, sinon il passe sous le radar.

#### 40.7 CSP côté serveur (docs/nginx-csp-config.conf)

Double protection : en plus du module JS, le serveur Nginx envoie un header `Content-Security-Policy` strict. Directives clés :
```
connect-src 'self' https://www.gstatic.com    ← LA garantie anti-exfiltration
script-src 'self' 'unsafe-inline'             ← compromis assumé (cf. ci-dessous)
style-src 'self' 'unsafe-inline'              ← idem (style="..." inline partout)
img-src 'self' data: blob:                    ← blob: nécessaire pour tuiles V2 ZIP
worker-src 'self' blob:                       ← Service Worker
frame-ancestors 'none'                        ← anti-clickjacking
```

Même si un attaquant injectait du JS malveillant, le **navigateur lui-même** refuserait l'envoi vers un domaine non-whitelisté. Vérifiable côté user via F12 → Network → Headers → `Content-Security-Policy`.

⚠️ **À déployer côté Nginx prod/dev** (toi-même, manuellement) — le fichier `docs/nginx-csp-config.conf` documente la directive complète + les autres headers de sécurité (`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`).

⚠️ Pas de `report-uri` / `report-to` : cohérent avec la promesse "aucune donnée n'est envoyée à un serveur tiers". Les violations CSP restent visibles côté user uniquement (DevTools).

#### 40.7.1 ⚠️ `'unsafe-inline'` sur script-src — compromis assumé

L'app utilise depuis toujours :
- Des blocs `<script>...</script>` inline dans `index.html` (handlers du loader, modales de confirmation, modales audit…)
- Des `onclick="..."` dans le HTML généré par `interface.js` (modales config, modales d'aide, etc.)

Une CSP `script-src 'self'` strict refuse tout ça. 3 options pour résoudre :

| Option | Effort | Sécurité gagnée |
|---|---|---|
| `'unsafe-inline'` ajouté | Aucun | -0 (garantie reste sur `connect-src`) |
| Hashes SHA-256 par bloc | Très haut (cauchemar maintenance, change à chaque tweak) | Marginal |
| Externalisation totale + suppression de tous les `onclick` | Refonte massive (~50+ sites) | Marginal |

**Décision** : on assume `'unsafe-inline'` sur `script-src` ET `style-src`. La garantie anti-exfiltration **ne vient pas de `script-src`**, elle vient de `connect-src 'self' https://www.gstatic.com` qui interdit physiquement au navigateur d'envoyer des données ailleurs, même si un attaquant injectait du JS.

Conditions qui rendent ce compromis safe pour CE projet :
- Aucun input user n'est jamais placé en `innerHTML` directement (tout passe par `textContent` ou `_escapeHtml`)
- Aucun contenu tiers / aucun iframe / pas de CDN externe
- Le HTML servi par Nginx est statique (pas de templating server-side qui pourrait injecter de l'input user)

⚠️ Si un jour on ajoute une feature qui fait `innerHTML = userInput`, **revoir cette décision** : on devra soit purifier strict (DOMPurify), soit basculer sur du nonce dynamique généré par Nginx.

⚠️ Pour les futurs développeurs : **ne JAMAIS faire `el.innerHTML = userInput` sans échappement**. Toujours `el.textContent = userInput` ou `el.innerHTML = _escapeHtml(userInput)`.

#### 40.8 Documentation utilisateur (docs/NETWORK_AUDIT.md)

Page de transparence détaillée (~300 lignes) servie en static depuis le SW (ajoutée à `ASSETS_TO_CACHE`). Contenu :
- Promesse en 1 ligne
- Modèle technique (PWA pure)
- Liste blanche commentée
- Comment vérifier toi-même (3 méthodes : journal interne / F12 / lecture source)
- Mode paranoia détaillé
- CSP expliqué
- Position de l'auteur

Accessible via le bouton 📄 dans la modale 📖 Doc audit (s'ouvre dans un nouvel onglet `noopener,noreferrer`, path same-origin donc OK même en mode paranoia).

#### 40.9 Pour ajouter une nouvelle URL à la whitelist (futur)

Si on doit ajouter un endpoint tiers légitime (ex : un CDN pour les polices Inter, un service de tuiles cartographiques) :

1. Ajouter le pattern dans `WHITELIST_PATTERNS` (tableau de fonctions)
2. Ajouter une ligne dans `WHITELIST_HUMAN` (description lisible)
3. Ajouter dans `docs/NETWORK_AUDIT.md` (tableau de la liste blanche complète)
4. Ajouter dans `docs/nginx-csp-config.conf` (directive `connect-src`)
5. **Bumper la version** (transparence : un changement de liste blanche = changement de surface réseau, l'user doit pouvoir comparer avant/après)

⚠️ **NE JAMAIS** ajouter un endpoint qui reçoit des données utilisateur (POST/PUT). Si nécessaire un jour, refonte du modèle de transparence requise (peut-être avec opt-in explicite par feature).

### 41. Refonte UI v1.9 — Nouvelle interface par défaut (mergée en v1.9.1)

**Statut** : refonte UI mergée et OFFICIALISÉE en v1.9.1 (depuis la branche `Refonte_interface` créée depuis `Karma_dev` HEAD `75455a4`). La nouvelle interface est désormais le défaut, l'ancienne v1.8.x reste accessible en opt-out.

Le module clé est `js/refonteInterface.js` (~900 lignes IIFE). Tout le CSS scopé est en fin de `css/style.css` (~1500 lignes sous `body.kta-refonte-v1`).

#### 41.1 Activation du flag — opt-out (depuis v1.8.1-refonte-8)

**Sémantique** :
- **Default ON** : nouvelle interface ACTIVÉE par défaut au boot.
- L'user peut OPT-OUT via toggle "📜 Utiliser l'ancienne interface (classique v1.8.x)" → set `localStorage["myktamap_legacy_interface"] = "1"` + reload.

**Toggle accessible depuis 2 endroits** :
- ⚙️ **Configuration du loader** (home) → section "🎨 Affichage" → `#loaderLegacyCb`
- ⚙️ **Réglages map mode** (in-app) → section "🎨 Affichage" → `#kta-cfg-legacy-cb`

**Reload requis** au toggle : la classe `body.kta-refonte-v1` doit être appliquée au boot AVANT que Leaflet initialise ses positions (sinon décalages divers).

**Migration silencieuse** : l'ancien flag opt-in `localStorage["myktamap_refonte_v1"] = "1"` (= phase v1.8.1-refonte-7 et antérieur) est supprimé au chargement du module → user reste en mode refonte (= défaut) sans changement d'expérience.

**API publique** `window.RefonteInterface` :
- `isActive()` → boolean
- `setActive(wantNouvelle)` → set localStorage + confirm + reload
- `updateCompteurs()` → recalcule header
- `refreshStatusBar()` → recalcule status bar

`window._refonteInterfaceActive` (booléen) exposé tôt pour permettre à `interface.js` de lire l'état avant d'initialiser les groupes accordéon.

#### 41.2 Architecture — 3 zones fixed

| Zone | Contenu | Position |
|---|---|---|
| **Header bar** | 🌟 Rose des vents (home) / titre plan cliquable / compteurs (📍 points · 🛣 tracés · ⬛ zones) cliquables | sticky top 44px (+ safe-area top iOS) |
| **Sidebar gauche** | ⊞ Layers / − + Zoom / 🏗 Niveau / ≡ collapse / 📚 Doc / ⚙ Paramètres / ⬇ Charger / ⬆ Save | Leaflet topleft, flex column (sidebar unifiée) |
| **Sidebar droite** | ≡ collapse / 🔍 Search / ✏️ Édition / 📐 Mesure / 🛣 Tracés / ⬛ Zones / 🧭 Tracker | Leaflet topright, flex column (sidebar unifiée) |
| **Status bar** | 📐 Mesure / 📏 Distance totale (cliquable=ouverture modale) / 🗺️ Itinéraire (cliquable=ouverture modale) / 🧭 Tracker GPS (LED ON vert / OFF rouge) | sticky bottom 52px (min-height, grow dynamique) |

**Suppressions** :
- Groupe `🏗 Créer/modifier plan` retiré de la sidebar carte (accessible uniquement depuis le loader via "🏗️ Générer un plan").
- Labels Leaflet bottom (`.kta-iti-distance`, `.kta-measure-distance`, `#measureLabel`) masqués via CSS — remplacés par les stats du status bar.
- Sub-action "🗂️ Changer de plan" retirée du menu ⬇️ Charger / Import (doublonne avec la rose des vents et le titre cliquable).

**Préservations** :
- Boussole d'orientation : widget compass (`.kta-compass-widget`) toujours géré par `compass.js`. Repositionné en bottom-left (portrait) / bottom-center (landscape) au-dessus du status bar.
- Toutes les modales, modes, logique métier : inchangés.

#### 41.3 Header bar — détails

`_creerHeaderBar()` dans `refonteInterface.js` génère le DOM. Layout :
- **Portrait** : `display: flex` + `.kta-refonte-header-title-wrap { flex: 1 1 auto; justify-content: center }` → titre centré dans l'espace restant.
- **Landscape** (`@media (max-height: 500px) and (orientation: landscape)`) : `display: grid; grid-template-columns: 1fr auto 1fr` → titre au centre géométrique ABSOLU. Home en col 1 avec `justify-self: start`, counters en col 3 avec `justify-self: end`.

**Bouton home 🌟** : image `icon/mkm-full.png` (rose des vents — même asset que splash + home page). Clic → `window._retourLoaderAvecConfirm()` (modale charte "Changer de plan" si session modifiée, sinon retour direct).

**Titre cliquable** : ouvre la modale "🗂 Changer de plan" refondue (cf. §41.10).

**Compteurs cliquables** : ouvre la modale "📊 Détails de la session" (cf. §41.9).

#### 41.4 Sidebars unifiées — modification de `_creerGroupeAccordeon`

Nouvelle option `position: "topleft" | "topright"` lue UNIQUEMENT si `window._refonteInterfaceActive === true`. Sinon comportement v1.8.x strict (tous groupes en topright).

Groupes taggés `position: "topleft"` :
- `aide` (📚 Doc/Aide/Légende)
- `settings` (⚙ Paramètres)
- `charger` (⬇ Charger / Import)
- `save` (⬆ Enregistrer)

**Effet visuel** : sidebars = barres VERTICALES continues (pas d'icônes séparées avec gap). En CSS :
- `body.kta-refonte-v1 .leaflet-top.leaflet-{left|right} { display: flex; flex-direction: column }`
- `.leaflet-bar { margin: 0 !important; border-radius: 0 !important }` puis arrondi uniquement aux extrémités (`:first-child` top, `:last-child` bottom) — donne l'effet "barre unique".
- Séparateurs internes 1px subtils (`border-top` sur `:not(:first-child)`).
- Sous-actions accordéon empilées EN DESSOUS du bouton principal (vertical flow, la barre grossit, scroll interne si dépasse `max-height: calc(100vh - 44 - var(--kta-statusbar-h) - safe-areas)`).

Helpers exposés :
- `window._fermerGroupeOuvertSide(side)` (side = "left"/"right") → ferme le groupe ouvert si dans la sidebar demandée. Appelé par le bouton ▾/▸/◂ avant de collapser. Skip si `modeActif` (anti-coupure tracker en Play).
- `window._refonteInterfaceCreerBoutonReduction{Left|Right}()` → crée le bouton ≡ de réduction.

#### 41.5 Bouton ≡ de réduction (sidebars collapsibles)

Un bouton par sidebar (gauche + droite), positionné en HAUT via flex `order: -1` (peu importe l'ordre DOM dans lequel Leaflet ajoute ses controls natifs).

**Icônes** (depuis v1.8.1-refonte-7) :
- `▾` = sidebar déployée (flèche vers le bas, "tout est visible en dessous")
- `▸` = sidebar gauche repliée (flèche vers l'intérieur)
- `◂` = sidebar droite repliée (flèche vers l'intérieur)

Helper interne `_iconeCollapse(side, isCollapsed)`. Au clic : toggle `body.kta-refonte-sidebar-{left|right}-collapsed`. CSS cache tous les controls SAUF `.kta-refonte-collapse-bar`.

Pas de persistance localStorage (toujours déroulé au boot).

#### 41.6 Sous-actions horizontales en landscape (depuis v1.9.1)

En portrait, les sous-actions des accordéons s'empilent EN DESSOUS du bouton principal (vertical, la barre grossit vers le bas).

En **landscape mobile** (`@media (max-height: 500px) and (orientation: landscape)`) :
- Chaque `.leaflet-bar` devient un pill horizontal (`display: flex; align-items: center; border-radius: 8px`).
- Sidebar GAUCHE : `flex-direction: row` → subs unfold vers la DROITE (intérieur écran).
- Sidebar DROITE : `flex-direction: row-reverse` → main button reste collé au bord droit (sidebar `align-items: flex-end`), subs unfold vers la GAUCHE (intérieur écran).
- Boutons compacts 30×30 (au lieu de 36×36 en portrait).
- Séparateur interne `border-left` au lieu de `border-bottom`.

**Exception** : `.leaflet-control-zoom` (zoom natif Leaflet) garde `flex-direction: column !important` — convention universelle "+ au-dessus du -" (Google Maps, OSM, etc.). Séparateur entre zoom-in/out en `border-top`.

#### 41.7 Status bar — wrap dynamique + variable CSS (depuis v1.9.1)

**Problème résolu** : avec 4 stats actives en même temps (mesure + dist totale + iti + tracker), le contenu ne tenait plus en largeur et était caché en `overflow-x: auto` (scroll horizontal masqué = info invisible).

**Solution** : `.kta-refonte-statusbar-content { flex-wrap: wrap }`. Le contenu passe sur 2 lignes si besoin, la barre grandit via `min-height` au lieu de `height` fixe.

**Variable CSS partagée** `--kta-statusbar-h` :
- Initialisée à `calc(52px + env(safe-area-inset-bottom, 0px))` (fallback CSS au boot).
- Mise à jour par JS via `ResizeObserver` sur le status bar — lit `offsetHeight` à chaque resize, écrit dans `document.documentElement.style.setProperty("--kta-statusbar-h", h + "px")`.
- Notifie Leaflet via `map.invalidateSize({ animate: false })` (debounce via rAF).

**Tout suit la variable** :
```css
#map               { bottom: var(--kta-statusbar-h) }
.kta-compass-widget{ bottom: calc(var(--kta-statusbar-h) + 8px) }
.leaflet-top       { max-height: calc(100vh - 44 - var(--kta-statusbar-h) ...) }
.kta-readme-modal-overlay { padding-bottom: calc(var(--kta-statusbar-h) + 16px) }
```

**Bouton toggle ▾▴** : 40×36px (font 22px) depuis v1.9.1 (avant 28×24/14px). Plus visible, plus facile à taper au pouce.

#### 41.8 Tracker GPS — boussole LED ON/OFF (depuis v1.9.1)

Avant : stat tracker affichait icône 🚶 + "—" quand inactif, "Actif (x, y)" quand actif. Problème : doublon visuel avec le 🚶 de la stat itinéraire (qui contient "🗺️ ... · 🚶 Normale" = mode marche).

**Maintenant** :
- Icône 🧭 (boussole) + texte "ON" / "OFF" — toujours visible (jamais "—") façon LED hardware.
- **ON** (`.kta-refonte-stat-tracker-on`) : fond vert translucide, bordure verte, texte `#6ee287` gras, `box-shadow: 0 0 6px rgba(76, 200, 100, 0.35)` (lueur LED).
- **OFF** (`.kta-refonte-stat-tracker-off`) : fond rouge translucide, bordure rouge, texte `#e88787` gras.
- Toggle CSS via 2 classes mutuellement exclusives (pas de `.kta-refonte-stat-empty` qui ferait conflit avec `.kta-refonte-stat-tracker-off`).

Stat itinéraire `#kta-refonte-stat-iti` désormais **cliquable** (`.kta-refonte-stat-clickable`) → ouvre `window.ouvrirItinerairModal()` (équivalent ancien comportement du label bottom-left `.kta-iti-distance`). Clic ignoré silencieusement si stat vide (pas d'iti actif).

#### 41.9 Modale "📊 Détails de la session" (depuis v1.8.1-refonte-9)

Compteurs du header (📍 N · 🛣 N · ⬛ N) cliquables → modale qui liste tous les éléments de la session active :

| Section | Contenu |
|---|---|
| 📍 Points ajoutés | Liste avec nom / tag / coord / niveau si multi-niveau |
| 🛣 Tracés | Regroupement par type (Principal/Secondaire/Chemin/Jonction) avec compteur + distance totale par type |
| ⬛ Zones | Regroupement par type (Eau/Remblais/Effondrement/Inaccessible) avec compteur |
| 📊 Autres mesures | Mesure simple (si points ≥ 2), Itinéraire actif (distance + nb waypoints), Tracker (position si actif) |

Fonction `_afficherModaleSessionDetail()` dans `refonteInterface.js`. Pattern `.kta-readme-modal-overlay` + box max-width 560px + sections card-stack. Recalcule en live à chaque ouverture. Toggle re-clic = reopen direct (cleanup d'instance précédente).

Check défensif `typeof _afficherModaleSessionDetail === "function"` dans le handler (anti-déploiement partiel via FTP).

#### 41.10 Modale "🗂 Changer de plan" refondue (depuis v1.9.1)

Avant : dropdown ancré sous le titre fixe (`#kta-plan-switcher` panneau à `top: calc(56 + safe-top)`).

**Maintenant en mode refonte** : modale centrée avec overlay backdrop (pattern `.kta-readme-modal-overlay`).

Structure DOM :
```
.kta-readme-modal-overlay.kta-plan-switcher-overlay
  └── .kta-plan-switcher-modal-boite (#kta-plan-switcher)
       ├── .kta-plan-switcher-modal-header (titre doré "🗂 Changer de plan" + ✕)
       ├── .kta-plan-switcher-modal-corps
       │    ├── .kta-plan-switcher-current (carte highlight dorée + badge "● ACTIF" vert)
       │    ├── .kta-plan-switcher-section-titre "📚 PLANS RÉCENTS"
       │    └── .kta-switcher-list (rows hover bleuté + flèche › qui glisse)
       └── .kta-plan-switcher-modal-footer
            └── .kta-plan-switcher-cta (gros bouton bleu "📚 Voir tous mes plans")
```

JS dans `interface.js` : `_ouvrirPlanSwitcher()` branche sur le flag :
- `_ouvrirPlanSwitcherRefonte(recents, current)` → modale style refonte
- `_ouvrirPlanSwitcherLegacy(recents)` → dropdown style v1.8.x (mode legacy préservé)

`_fermerPlanSwitcher()` détecte le mode via la présence de `#kta-plan-switcher-overlay` (refonte) vs `#kta-plan-switcher` seul (legacy).

#### 41.11 CSS scoping

Tout le CSS de la refonte est dans une section `body.kta-refonte-v1 { ... }` à la fin de `css/style.css` (~1500 lignes). Aucune règle ne s'applique si la classe est absente du body.

**Variables CSS importantes** :
- `--kta-statusbar-h` (dynamique, gérée par JS via ResizeObserver) — voir §41.7
- Header bar : `44px` portrait, `36px` landscape
- Sidebars : `max-height: calc(100vh - 44 - var(--kta-statusbar-h) - safe-areas)`
- Safe-area iOS PWA via `env(safe-area-inset-*)` partout

**Sélecteur `:has()`** : utilisé pour adapter `#map { bottom }` quand status bar est collapsed. Compatible Chromium 105+, Safari 15.4+, Firefox 121+ (déc 2023).

#### 41.12 Polling 2s + state via API existantes

Le module ne duplique pas la logique métier. Il lit l'état via les API publiques :
- Compteurs header : `window.getEditorPoints()` / `getRoads()` / `getZones()`
- Stat mesure : `window.getMeasurePoints()` + calcul euclidien + `window.formatDistance()`
- Stat distance totale : `window.getDistanceTotaleStatus()` (API ajoutée pour lire l'état du surlignage magenta `_rdHighlightLayer`, pas le DOM de la modale qui disparaît à la fermeture)
- Stat itinéraire : lecture du DOM du `L.control .kta-iti-distance` (masqué visuellement mais reste dans le DOM, mis à jour par `_majLabelDistanceItineraire`)
- Stat tracker : `window.getTrackingActif()` (boolean) + `getTrackingPosition()` optionnel

Polling 2s = compromis : fluide pour l'user sans gaspiller le CPU.

#### 41.13 Pièges & limites connues

⚠️ **`#kta-titre-fixe` masqué quand refonte active** (`display: none !important`). La logique JS `togglePlanSwitcher()` continue de marcher car appelée par le bouton du header bar refondu.

⚠️ **Toggle nécessite reload** : la classe `body.kta-refonte-v1` doit être appliquée au boot. Le `setActive()` propose un `confirm("Recharger maintenant ?")`.

⚠️ **Status bar masque les controls bottom-left Leaflet** par défaut. Si tu ajoutes un nouveau control bottom-left, il sera caché. Réinitialiser via `#map { bottom: var(--kta-statusbar-h) }` qui décale tout automatiquement.

⚠️ **Cache PWA** : bumper `CACHE_NAME` dans `sw.js` à chaque modif d'un asset caché (CSS/JS/HTML). Pendant la phase Refonte_interface, on utilisait le suffix `-refonte-N` pour invalider le cache à chaque commit. Depuis le merge v1.9.1, suffix retiré (CACHE_NAME = `myktamap-cache-v1.9.1`).

⚠️ **ResizeObserver indispo sur très vieux browsers** : fallback `orientationchange` + sync initial dans `_setupStatusBarResizeObserver`. Le wrap multi-ligne ne se mettra à jour qu'à la rotation, pas en temps réel — acceptable.

⚠️ **Hoisting JavaScript** : `_afficherModaleSessionDetail` est appelée (ligne 211) avant sa déclaration (ligne 438) dans le même IIFE. Le hoisting JS le permet, mais en cas de minifieur agressif ou FTP partiel, on a un check défensif `typeof === "function"` + log console.

#### 41.14 Historique git

- Branche `Refonte_interface` créée depuis `Karma_dev` HEAD `75455a4` (12/05/2026 environ)
- Itérations : `-refonte-1` à `-refonte-17` (commits) sur le suffix CACHE_NAME pour invalider le cache PWA pendant le dev
- Merge v1.9.1 : `Refonte_interface` → `Karma_dev` (puis push `Karma_dev` → `main` via PR au moment du déploiement production)
- Branche `Refonte_interface` peut être archivée après le merge (ou supprimée du remote si KARMA préfère)

#### 41.15 Polish v1.9.2 (22/05/2026 — 17 itérations post-release)

Le lendemain de la release v1.9.1, KARMA a remonté beaucoup de polish UX en testant l'app sur PC et iPhone. 17 commits hotfix appliqués sur le suffix CACHE_NAME `-fix1` → `-fix17`, consolidés en v1.9.2.

##### 41.15.1 Loader PC plein écran (fix9 → fix12)

Itéré : enlargement progressif → finalement full edge-to-edge.
- `#planLoaderOverlay { padding: 0 }`
- `#planLoaderBox { max-width: 100%; min-height: 100vh; border-radius: 0; border: none; box-shadow: none; padding: calc(24 + safe-top) 24 calc(24 + safe-bottom) }`

Les safe-areas iOS sont gérées via le padding interne plutôt que via l'overlay → fond `#1a1f2e` edge-to-edge, contenu visible sous notch/home indicator.

Backdrop décoratif sur PC (≥ 1024px) au cas où des bordures résiduelles subsistent : pattern subtil de points dorés (rgba 0.07) + radial gradient warmer au centre. Mobile inchangé.

##### 41.15.2 Toutes les modales PC agrandies (fix13 → fix14)

Paliers progressifs `≥ 1024 / 1440 / 1920px` → `1400 / 1700 / 2000px` pour :
- `.kta-readme-modal-boite` (Documentation, base, et toutes celles qui héritent : Enregistrer session)
- `.kta-aide-modal-boite` (Aide)
- `.kta-cfg-modal-boite` (⚙️ Réglages map mode)
- `.kta-loader-config-boite` (⚙️ Configuration loader)
- `.kta-legende-modal-boite` (Légende, refactor : retrait du `style="max-width:480px"` inline → ajout classe + multi-cols 2/3/4 selon palier)
- `.kta-export-modal-boite` (Export images, retrait du `style="max-width:580px"` inline + height: auto)

Pour l'Éditeur tableau (`tableEditor.js`), retrait du `width: 1100px` forcé dans le `<style>` injecté.

⚠️ Les modales de confirmation courtes avec inline `style="max-width:420-520px"` (Force update, plan switcher legacy fallback, etc.) gardent volontairement leur taille fixe.

##### 41.15.3 Toggle showRoadIntersections (fix6/fix7)

`APP_CONFIG.showRoadIntersections` (default true) persisté dans `localStorage > app_user_prefs`. Setter `window.setShowRoadIntersections(value)` qui persiste + appelle `renderRoads()` à chaud.

Toggle accessible **uniquement** depuis ⚙️ Configuration du home → section « 🎨 Affichage » (KARMA a fait retirer le doublon de ⚙️ Réglages map mode pour ne pas surcharger les Réglages in-app focus PAR PLAN).

Bug fix bonus dans `buildAppConfigFromPlan` : ce setter reconstruisait `APP_CONFIG = { ...cfg }` SANS les prefs globales → `scaledMarkers` et `showRoadIntersections` étaient écrasés au plan switch. Restauration explicite depuis localStorage maintenue dans cfg.

##### 41.15.4 Tracker rotation unwrapped (fix10)

Bug : la CSS transition `transform: rotate(deg)` interprète les valeurs littéralement. Passage de `rotate(350deg)` → `rotate(10deg)` = -340° d'animation arrière (1 tour quasi-complet) au lieu de +20° par le chemin court.

Fix dans `tracking.js > _applyRotationToTrackerMarker()` :
- Nouvelle variable `_trackerRotationUnwrapped` qui CUMULE les deltas courts (toujours dans `[-180, +180°]`) à chaque tick
- Valeur appliquée au CSS = peut être `-10`, `370`, `720`, `-45`… mais visuellement identique
- Le CSS anime toujours dans le sens physique réel

Reset dans `_resetRotationTrackerMarker()` pour repartir propre au prochain Play.

##### 41.15.5 Splash KARMA animé (fix15 / fix16)

- Retrait du bloc `#splashAuthor` ("Par [karma.png]" centré dans le footer)
- Ajout d'un nouveau `#splashKarmaCorner` en `position: absolute; bottom: 28; right: 28` (28 au lieu de 14 pour anti-clip bord arrondi écrans modernes, KARMA fix17)
- Image karma.png 20px (au lieu de 32px) + drop-shadow doré + animation `clip-path: inset(0 100% 0 0)` → `inset(0 0 0 0)`
- Animation : 5 keyframes explicites (0/20/40/60/80/100%) avec `cubic-bezier(0.45, 0.05, 0.55, 0.95)` (ease-in-out doux) → effet "K-A-R-M-A" lettre par lettre avec transitions smooth. Durée 1.8s, délai 0.8s
- Fade-out synchronisé avec `splashOverlay.fading`

Crédits libs/algo au splash : `🍃 Leaflet · 📦 JSZip · 🧭 Dijkstra` en bas-gauche (déplacé du centre pour libérer le coin droit pour KARMA).

`Dijkstra` réfère à l'algorithme du plus court chemin implémenté dans `js/pathfinder.js > _dijkstra()`. KARMA s'en souvenait phonétiquement comme "djakarta" — pas une lib externe mais un classique informatique (Edsger Dijkstra, 1956) qu'on implémente nous-mêmes.

Ces mêmes 3 crédits ajoutés au :
- Footer du home (`.kta-loader-credits` sous le copyright)
- Footer de la modale Documentation (`.kta-readme-modal-footer`)

##### 41.15.6 Couleur Leaflet alignée à la charte (fix17)

`lib/leaflet/leaflet.css` ligne 266 :
- AVANT : `background: #000000` (noir pur — hack historique pour matcher l'overlay loader perçu noir sur iOS PWA)
- APRÈS : `background: #0a0d18` (charte dark blue-black, identique à `body { background-color }`)

Plus de saut de teinte au retour loader après chargement d'un plan. La transition loader → leaflet → loader est désormais visuellement uniforme.

##### 41.15.7 Tracker GPS LED ON/OFF dans le footer (fix1)

Bug : `_refreshStatusBar` du footer refonte appelait `window.getTrackingActif()` qui n'existait pas dans tracking.js → toujours false → tracker affichait toujours OFF rouge même Play actif.

Fix : ajout de `window.getTrackingActif = function() { return tracking === true }` dans tracking.js à côté des autres getters.

Icône passée de 🚶 à 🧭 (boussole) pour éviter le doublon visuel avec le 🚶 du badge "mode marche" de la stat itinéraire. Style "LED hardware" : pill arrondi avec fond vert (ON) ou rouge (OFF).

##### 41.15.8 Stat itinéraire cliquable (fix1)

`#kta-refonte-stat-iti` (footer) reçoit un handler `click` qui appelle `window.ouvrirItinerairModal()` — équivalent du label `.kta-iti-distance` en bottom-left, désormais masqué pour éviter le doublon. Clic ignoré silencieusement si stat vide.

##### 41.15.9 Export images — layers en grille horizontale (fix15)

Sur PC ≥ 1024px, les blocs de calques (`#kta-export-data-layers`, `#kta-export-image-layers`) s'organisent en :
- 4 cols (≥ 1280px) avec gap 14px
- 3 cols (1024-1279px)
- Stack vertical (< 1024px, inchangé)

Chaque bloc data-layer reçoit fond + bordure subtils pour le matérialiser comme une "carte".

##### 41.15.10 Polish UX divers

- Bouton ▾▴ du footer compact (32×16, font 13) quand `.kta-refonte-statusbar-collapsed` — sinon le 40×36 débordait sur le footer replié 20px
- Stats du footer en doré charte `#f4c542` (au lieu de blanc cassé `#e8eaf0`)
- Retrait du sous-action « 🗂️ Changer de plan » du menu ⬇️ Charger / Import (doublon avec rose des vents + titre cliquable)
- ⚙️ Configuration loader réordonnée : Affichage avant Force update (gradation Force update + Reset consécutifs)
- Modale « Forcer la mise à jour ? » : ajout de `height:auto; max-height:92vh` à l'inline style pour éviter qu'elle prenne 92vh de la base CSS modale enlargée

#### 41.16 Tentatives qui n'ont pas marché (transparence)

- **viewport-fit=cover + apple-mobile-web-app-status-bar-style = black-translucent** (fix4) : tentative pour faire monter le header refonte tout en haut de l'écran iPhone PWA. Provoquait la même "bande sombre en bas" qu'en v1.8.0 → revert (fix5).
- **Fixes iOS rotation status bar** : 3 tentatives empilées (fix1 body class toggle, fix3 scrollTo + viewport meta rewrite). fix1 a même empiré le bug → revert immédiat. C'est un bug iOS Safari standalone PWA documenté, sans API JS officielle pour le contrer. **Status quo accepté** : la status bar (heure, batterie) peut parfois ne pas se restaurer après une rotation landscape → portrait sur iPhone PWA. Non bloquant, pas de fix sans test sur device réel.

#### 41.17 Phases futures (post-v1.9.2)

- **v1.10.x** : accessibilité clavier complète (Tab + raccourcis E/M/Échap)
- **v1.10.x** : polish micro-interactions (transitions sidebars, badges contextuels)
- **v2.0.0** : (quand l'ancienne UI sera abandonnée définitivement) retirer le flag `myktamap_legacy_interface`, supprimer le code mort, bumper en MAJOR car retrait d'un comportement publique

### ⚠️ Hack Leaflet — fond `.leaflet-container`

[`lib/leaflet/leaflet.css`](lib/leaflet/leaflet.css) **ligne 266** a été modifié à la main :

```css
.leaflet-container {
  /* MyKTAMap : noir pur pour matcher l'overlay loader (...) */
  background: #000000;
  outline-offset: 1px;
}
```

**Pourquoi** : sur iPhone PWA standalone, iOS lit la couleur du haut de page pour tinter sa status bar (mode `black-translucent` sans `viewport-fit=cover`). En mettant le fond du container Leaflet en noir pur, le sliver visible juste sous la status bar (avant le rendu des tuiles) garde la status bar dark même quand la map est claire derrière. `#0a0d18` paraissait grisé sur iPhone, d'où le retour à `#000000` en v1.9.2 (la tentative cover a été rollback).

⚠️ **NE PAS REVENIR à `#ddd`** (le défaut Leaflet) sans avoir compris ce qu'on perd. Le commentaire dans le CSS explique l'intention. Lors d'un upgrade Leaflet upstream, **garder ce patch**.

### 42. Système photos POI complet (depuis v1.10.0)

Backend IDB-first + UI complète (capture / viewer / exports / générateur). 4 sous-phases livrées ensemble :

**B1.a — Backend** : `js/photos.js` (~540 lignes IIFE) → `window.MyKTAMapPhotos`. DB IDB `myktamap_photos` v1, store `photos`, indexes `by_plan` et `by_plan_point`. Compression auto (canvas → JPEG q85, max 1920px côté long). Max **5 photos par point** (`MAX_PHOTOS_PER_POINT`). API complète : `addPhoto, getPhoto, getBlob, getObjectUrl, getPhotosForPoint, getAllPhotosForPlan, countPhotosForPoint, countPhotosForPlan, deletePhoto, deletePhotosForPoint, deletePhotosForPlan, renamePointId, restorePhoto, clearAll, getStorageInfo`.

**B1.b — UI éditeur** : refactor `editor.js > afficherFormulaire(x, y, existingPoint)` avec 3ème argument optionnel pour le mode édition (avant : ajout uniquement). Section "📸 Photos (N/5)" avec grille 3 cols PC / 2 mobile, miniatures 80×80, spinner ⏳ pulse pendant compression+IDB write, ✕ pour pending delete (vignette grisée + hachures), ↺ pour annuler. 2 boutons d'ajout : `📷 Prendre photo` (`capture="environment"`) + `🖼️ Depuis la galerie` (multiple).

**Stratégie 5a** : photos écrites en IDB DÈS l'ajout (sous pointId temporaire `_temp_<timestamp>_<rand>` en mode ajout), migration via `renamePointId` au save vers le vrai id (= nom). Cleanup à l'annulation : delete les photos uploadées cette session. En mode édition : `_photosPendingDelete` Set commit uniquement au save (= annuler ne perd pas de photos).

Popup marker — `utils.js > buildPointPopupHtml + attachPopupPhotos(marker, pointId)` : bouton "✏️ Modifier" bleu pour points session + slot `.kta-popup-photos` hydraté en async via `popupopen` event Leaflet. Miniatures 44×44 (`<img class="kta-popup-photo-mini" role="button" tabindex="0">` directes cliquables, **PAS** `<button>` car les styles user-agent variables créaient un "fond bleu" visible). Tap → viewer plein écran. ObjectURLs révoquées au `popupclose` (anti memory leak).

⚠️ **À ne PAS revenir au pattern `<button><img></button>`** pour les miniatures popup — testé, ça créait un fond bleu visible sur certains browsers (Chromium iOS notamment). L'`<img>` cliquable directe est le pattern propre.

**B1.c — Viewer plein écran** : `js/photoViewer.js` (~310 lignes IIFE) → `window.MyKTAMapPhotoViewer = { open(photos, startIndex), close, isOpen }`. Modale fullscreen z-index 100000. Maison (pas de dep) :
- Pinch-zoom 1× à 4× (2 doigts, scale center-based, clamp transform)
- Pan (drag PC quand zoomé / 1 doigt mobile zoomé)
- Swipe horizontal pour navigation (1 doigt mobile, zoom=1, threshold 50px)
- Flèches `◂` `▸` + raccourcis clavier `← → + - 0 Échap`
- Auto-reset transform à chaque changement de photo
- `touch-action: none` sur viewport + `passive: false` sur touchmove/wheel → on contrôle tout le touch
- Compteur "N / M" pastille jaune + ✕ rouge au hover

**B1.d — Exports** complets (rétrocompat absolue : sans photos cochées ou 0 photo → format v1.9.2 strict) :

| Voie | Output sans photos | Output avec photos |
|---|---|---|
| Session Full | `.json` pur | `.zip` (session.json + photos/) |
| Session Avancé Single | `.json` pur | `.zip` (session.json + photos/) |
| Session Avancé ZIP multi | `.zip` (N JSON) | `.zip` (N JSON + photos/) |
| Conversion ed2data (basic 1 cat.) | `.json` direct | `.zip` (1 JSON + photos/) |
| Conversion ed2data (basic N cat.) | `.zip` multi | `.zip` (N JSON + photos/) |
| Conversion ed2data (fine) | `.zip` multi | `.zip` (N JSON + photos/) |
| Conversion data2ed (ZIP input) | `.json` session | `.zip` session (réimportable) |
| Re-import session ZIP | (rétrocompat .json) | wipe + restorePhoto IDB |
| Re-import KMZ | (pas concerné) | (pas concerné, B1.d.β à venir) |

Format ZIP unifié pour les 3 voies (Full / Avancé Single / Conversion) :
```
session.json (ou data layer)
photos/
├── _index.json   ← {version: 1, photos: {<photoId>: {pointId, mime, size, file}}}
└── <photoId>.<ext>
```

Helpers communs dans sessionExporter.js : `_collecterPhotosPlan(pointIdsSet)`, `_extDepuisMime(mime)`, `_formatBytes(n)` (exposé `window._kta_formatBytes`), `_packerZipSession(payload, photos, filename)`, `_enrichirPointsAvecPhotos(points, photos)` (ajoute `point.photos = [photoIds]` sur clone). Filtre par `pointIdsSet` : les photos suivent le filtre des points (= si l'user filtre par tag, photos correspondantes seulement).

**Re-import session** (interface.js > `_parseSessionZip(file)`) : détection ZIP vs JSON par extension + MIME. Extraction `session.json` + `photos/_index.json` + blobs. `_pendingPhotosToRestore` en variable de fermeture. Validateur async : `_restorerPhotos()` → `deletePhotosForPlan(planId)` (wipe) puis `restorePhoto` × N. Format multi-files (Avancé ZIP) **non pris en charge** en re-import (par design — format archive).

**B1.d.γ — Générateur** (createConf.js) :
- Mode Modifier : case "📸 Inclure les photos attachées (N · X Mo)" (compteur async) embed les photos IDB du plan courant dans `data/photos/`
- Encadré dédié "📦 Importer un datalayer ZIP en un clic" (mode Nouveau ET Modifier) qui parse un ZIP datalayer exporté → crée les data layers correspondants + stocke photos dans `_plannerPhotosFromZip`
- En mode Modifier : suffixe `_imported_<N>` sur l'id du calque si collision avec un calque existant (= n'écrase pas le plan source)
- Au `_genererZip` : MERGE des 2 sources photos en mode Modifier (IDB + ZIP importé) avec déduplication par photoId. Sans la dédup-merge, importer 1 ZIP avec 2 photos écrasait les 10 photos IDB du plan → bug "ça casse tout" remonté KARMA.

**Symétrie côté import** — `main.js > startImportedPlan` :
- Détection `data/photos/_index.json` dans le ZIP plan
- Wipe `deletePhotosForPlan(planId)` puis `restorePhoto` × N
- Toast discret `OOMGuard.showToast("📸 N photos restaurées depuis le plan", "info")`

**Header refonte** : 5e compteur 📸 (lecture async `countPhotosForPlan`) à côté de 📍/🛣/⬛/🏛️. Section dédiée dans la modale "📊 Détails de la session" : breakdown par point + total Mo.

⚠️ **`data/editor.json` reste écrasé** par `PLANNER_EDITOR_JSON` vide au `_genererZip` (comportement v1.9.2 inchangé). Les points importés via datalayer ZIP apparaissent comme data layers `points` séparés (lecture seule), pas dans le calque "Mes annotations" éditable. Cohérent avec le modèle "session = éphémère, data = figé dans le plan".

### 43. Code d'accès local PIN/Face ID optionnel (depuis v1.10.0)

Couche perso optionnelle par-dessus `UnlockGate` (§36) qui reste la barrière communautaire avec mdp partagé. Différent : le PIN est propre à chaque user, choisi par lui.

Module `js/pinLock.js` (~450 lignes IIFE) → `window.MyKTAMapPinLock`.

**Modèle de sécurité honnête** :
- Hash `SHA-256(salt + pin)` via `crypto.subtle.digest`
- Salt random 16 bytes (`crypto.getRandomValues`) en b64
- Stockage `localStorage["myktamap_pin_v1"]` = `{hashedPin, salt, attempts, hasBiometric, credentialId}`
- **Barrière UX, PAS pseudo-crypto** : l'app étant 100% client-side, un attaquant motivé bypass via F12 (= `localStorage.clear()` en 5s). Cohérent UnlockGate.
- Les données IDB (photos, sessions) ne sont **PAS** chiffrées (choix volontaire KARMA 6:a)
- Aucune recovery en cas d'oubli → reset complet requis

**API publique** :
- `isEnabled() / isUnlocked() / isLockedOut() / getRemainingAttempts()` — état
- `hasBiometric() / isBiometricSupported()` — biométrie
- `enable(pin, useBiometric) / disable(pin) / unlock(pin) / unlockWithBiometric() / changePin(newPin) / reset()` — actions
- `ouvrirGate()` — affiche la gate UI, résout au unlock (jamais en lockout)

**Lockout** : 5 tentatives PIN ratées consécutives → lockout définitif (compteur persisté). Pour sortir : reset complet (`localStorage.clear()` via 💥 Tout réinitialiser efface aussi `myktamap_pin_v1`). Une biométrie ratée n'incrémente PAS `attempts` (WebAuthn gère son propre lockout natif device).

**Biométrie WebAuthn** (Face ID / Touch ID / Windows Hello) :
- Détection via `PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()`
- Enregistrement : `navigator.credentials.create({publicKey: {challenge: random, rp: {name: "MyKTAMap"}, user: {...}, pubKeyCredParams: [-7, -257], authenticatorSelection: {authenticatorAttachment: "platform", userVerification: "required"}, attestation: "none"}})`
- Vérification : `navigator.credentials.get({publicKey: {challenge: random, allowCredentials: [{id, type: "public-key", transports: ["internal"]}], userVerification: "required"}})`
- Challenge random **client-side** (no backend) — compromis assumé, niveau "barrière UX"
- Si l'enregistrement biométrie échoue à l'activation → PIN activé sans biométrie (fallback graceful, error.pinActivatedWithoutBiometric = true signale au caller)

**UI Gate plein écran** (`_afficherGateUI(onUnlock)`) :
- Overlay z-index 100002 (au-dessus de tout)
- Boîte 360px charte dorée avec icône 🔐 + titre + dots `●●●●` 6 emplacements
- Pattern iOS 8:b : dernier chiffre saisi visible 0.5s puis remplacé par ●
- Keypad numérique 3×4 custom (1-9 / biométrie ou empty / 0 / ⌫)
- Auto-prompt biométrique 400ms après ouverture si configurée
- Auto-submit dès 6 chiffres OU touche Enter pour 4-6
- Clavier physique : chiffres + Backspace + Enter (Échap **bloqué** — l'user doit unlock)
- Affichage "N tentative(s) restante(s)" avec classe `kta-pin-gate-attempts-warn` si ≤ 2

**UI Lockout** (`_afficherLockoutUI()`) — screen rouge dramatique :
- Pas de bouton de sortie (force l'user à reset via la home)
- Message "🚫 Trop de tentatives" + explication "Comment sortir ?" → ⚙️ Configuration → 💥 Tout réinitialiser
- Phrase en italique "Le brute force c'est mal, m'voyez." (clin d'œil KARMA validé)

**UI activation/modification/désactivation** — `index.html` modale ⚙️ Configuration loader (choix 7:b "loader uniquement") :
- Pas de section dans ⚙️ Réglages map mode (par design — cohérent avec la philo "réglages critiques dans le loader")
- Status `✅ Activé · 🤳 biométrie configurée` ou `○ Désactivé`
- Boutons contextuels via flow Promise-based `_demanderPin(titre, message, label)`
- Activation : saisie PIN x2 + `confirm()` natif pour la biométrie (le `confirm()` natif est OK ici, cas marginal one-shot)
- Modification (9:b) : biométrie OU ancien PIN d'abord, puis nouveau PIN x2
- Désactivation : `confirm()` puis biométrie OU PIN

**Intégration boot** — `main.js > initApp` après `UnlockGate.ouvrirGate()` :
```js
if (window.MyKTAMapPinLock && window.MyKTAMapPinLock.isEnabled()
    && !window.MyKTAMapPinLock.isUnlocked()) {
  await _splashEnd();
  await window.MyKTAMapPinLock.ouvrirGate();
}
```

**Pour bumper le `MAX_ATTEMPTS`** (= 5) : changer la constante en tête de pinLock.js. ⚠️ **Ne PAS exposer un bouton "Reset PIN" depuis le screen lockout** — bypass trivial. L'user qui oublie son PIN DOIT passer par le reset complet de l'app (= friction délibérée).

**Pour bumper le PIN format** (= 4-6 chiffres) : modifier `PIN_MIN` et `PIN_MAX` en tête de pinLock.js + adapter le validateur `_validatePinInput` + le keypad UI (max chiffres affichés en dots).

**À NE PAS faire** :
- ❌ Réintroduire un bouton "Reset PIN" depuis le lockout (bypass trivial)
- ❌ Stocker le PIN en clair (toujours `hashedPin` via SHA-256 + salt)
- ❌ Ajouter une recovery email (no backend, cohérent avec UnlockGate)
- ❌ Promettre que les données sont chiffrées (elles ne le sont pas — c'est explicite dans la doc et l'UI)

### 47. Undo / Redo global Ctrl+Z / Ctrl+Y (depuis v1.11.0)

Module `js/historyManager.js` (~250 lignes IIFE) → `window.HistoryManager`. Snapshot hybride RAM-only, limité à 50 entrées FIFO, raccourcis clavier globaux + 2 boutons sidebar dans un nouveau groupe `⏪ Historique`.

#### 47.1 Approche technique — snapshot hybride

À chaque mutation, on prend une photo DEEP CLONE des arrays `{editorPoints, roads, zones, structures}` (utilisé `structuredClone` si dispo, sinon JSON.parse(JSON.stringify(...))) :

```js
function _captureState() {
  return {
    editorPoints: deepClone(window.getEditorPoints?.() || []),
    roads:        deepClone(window.getRoads?.() || []),
    zones:        deepClone(window.getZones?.() || []),
    structures:   deepClone(window.getStructures?.() || [])
  };
}
```

À l'undo, on applique le snapshot via les setters publics :
```js
function _applyState(s) {
  window.setEditorPoints?.(s.editorPoints);
  window.resetRoads?.();      window.setRoads?.(s.roads);
  window.resetZones?.();      window.setZones?.(s.zones);
  window.resetStructures?.(); window.setStructures?.(s.structures);
}
```

Note : pour roads/zones/structures, on passe par `reset() + set()` car `set()` seul ajoute au lieu de remplacer dans certaines implémentations (= cohérent avec le pattern existant dans SessionPersist).

#### 47.2 API publique

```js
window.HistoryManager = {
  record(label, beforeState?)  // push une entrée d'historique
  captureState()                // retourne snapshot complet
  recordAction(label, fn)       // helper : capture + fn() + record
  undo() / redo()               // applique state ± précédent / suivant
  canUndo() / canRedo()         // booléens pour griser les boutons
  reset()                       // vide les 2 piles
  onChange(cb)                  // listener pour sync UI
};
```

#### 47.3 Pattern d'instrumentation

Pour chaque mutation à rendre annulable :
```js
const _historyBefore = window.HistoryManager ? window.HistoryManager.captureState() : null;
// ... mutation
if (window.HistoryManager && _historyBefore) {
  window.HistoryManager.record("Label lisible", _historyBefore);
}
```

Le check `window.HistoryManager &&` permet une dégradation gracieuse si le module n'est pas encore chargé (early boot).

#### 47.4 Sites instrumentés (v1.11.0 initial)

| Module | Site | Label |
|---|---|---|
| `editor.js > _ajouterPointSession` | branche création | "Ajouter le point <nom>" |
| `editor.js > _ajouterPointSession` | branche modification in-place | "Modifier le point <nom>" |
| `editor.js > removeLastEditorPoint` | début | "Supprimer dernier point" |
| `road.js > map.on("mousedown")` | clic carte mode road | "Nouveau tracé <type>" OU "Sommet sur tracé <type>" |
| `road.js > removeLastRoad` | début | "Supprimer dernier tracé (<type>)" |
| `zones.js > map.on("click")` | clic carte mode zone | "Nouvelle zone <type>" / "Sommet sur zone <type>" / "Fermer zone <type>" |
| `zones.js > removeLastZone` | branches currentZone + dernière fermée | "Supprimer zone en cours" / "Supprimer dernière zone (<type>)" |
| `structures.js > map.on("click")` | clic carte mode structure | "Nouveau <type>" / "Sommet sur <type>" / "Fermer <type>" |
| `structures.js > removeLastStructure` | branches | "Supprimer structure en cours" / "Supprimer dernière structure (<type>)" |
| `interface.js > suppr trace au clic` | onclick map | "Supprimer tracé au clic (<type>)" |
| `interface.js > suppr zone au clic` | onclick map | "Supprimer zone au clic (<type>)" |
| `interface.js > suppr structure au clic` | onclick map | "Supprimer structure au clic (<type>)" |
| `interface.js > "Tous les tracés"` | onClick menu | "Supprimer tous les tracés" |
| `interface.js > "Toutes les zones"` | onClick menu | "Supprimer toutes les zones" |
| `interface.js > "Toutes les structures"` | onClick menu | "Supprimer toutes les structures" |

#### 47.5 Sites volontairement NON instrumentés

- ❌ **`setEditorPoints`/`setRoads`/`setZones`/`setStructures`** : utilisés par SessionPersist au boot pour restaurer la session — instrumenter ici créerait des entrées d'historique artificielles juste après le load
- ❌ **`resetRoads`/`resetZones`/`resetStructures`** (appelés directement) : idem, utilisés par les imports + au plan switch + en interne par `setXxx`
- ❌ **`window.ajouterPointEditor`** (utilisé par LostMode pour les markers indices) : c'est un usage technique, pas une mutation user
- ❌ **Photos** (`MyKTAMapPhotos.deletePhoto`, etc.) : IDB irréversible, hors périmètre KARMA 9:a
- ❌ **Itinéraire calculé** (Pathfinder) : c'est un dérivé du graphe, recalculable

#### 47.6 Raccourcis clavier

Listener global dans `historyManager.js` IIFE :
```js
document.addEventListener("keydown", function(e) {
  const isMod = e.ctrlKey || e.metaKey;
  if (!isMod) return;
  const key = (e.key || "").toLowerCase();
  if (key !== "z" && key !== "y") return;
  // Anti-vol focus
  const ae = document.activeElement;
  const isInputFocus = ae && (ae.tagName === "INPUT" || ae.tagName === "TEXTAREA" || (ae.getAttribute && ae.getAttribute("contenteditable") === "true"));
  if (isInputFocus) return;
  if (key === "z" && !e.shiftKey) { e.preventDefault(); e.stopPropagation(); undo(); }
  else if (key === "y" || (key === "z" && e.shiftKey)) { e.preventDefault(); e.stopPropagation(); redo(); }
});
```

⚠️ **Conflit potentiel avec Ctrl+K** (Recherche unifiée, §46) : non, car les 2 raccourcis utilisent des touches différentes (Z/Y pour Undo/Redo, K pour Recherche). Mais si on ajoute d'autres raccourcis futurs, vérifier la non-collision.

#### 47.7 UI sidebar — groupe ⏪ Historique

Créé dans `interface.js > initInterface` juste AVANT le groupe Édition (l'historique vient logiquement avant les outils qu'il annule).

```js
_creerGroupeAccordeon({
  id: "history",
  iconePrincipale: "⏪",
  titre: "Historique (Ctrl+Z / Ctrl+Y)",
  sousActions: [
    { icone: "⏪", titre: "Annuler la dernière action (Ctrl+Z)", onClick: ... },
    { icone: "⏩", titre: "Rétablir l'action annulée (Ctrl+Y)", onClick: ... }
  ]
});
```

**Grisage** (`KARMA 10:b`) : juste après la création du groupe, IIFE `_wireHistoryUiState()` qui :
1. Retrouve les 2 boutons dans le DOM via `document.querySelector('[data-groupe-id="history"]')` + textContent commençant par l'emoji
2. S'abonne à `HistoryManager.onChange(state)` pour appliquer `style.opacity = "0.4"` + `cursor: "not-allowed"` si la pile correspondante est vide
3. Sync initial via `setTimeout 100ms` pour laisser le DOM se construire

#### 47.8 Reset au plan switch

`main.js > _libererRessourcesPlanPrecedent` appelle `HistoryManager.reset()` AVANT `map.remove()`. Cohérent avec le pattern des autres modules (LostMode, distance totale, etc.).

#### 47.9 Save SessionPersist forcé après undo/redo

Le polling auto-save (1.5s) ne se déclenche que sur mutation détectée. Or après un undo, l'état change MAIS pourrait revenir avant la prochaine fenêtre de polling → perte si reload. D'où le force-save explicite dans `undo()` et `redo()` :
```js
function _saveSession() {
  if (window.SessionPersist?.save) {
    try { window.SessionPersist.save({ force: true }); } catch(e) {}
  }
}
```

#### 47.10 Pour les futures features à rendre undo-able

Quand on ajoute un nouveau type d'annotation dessinable (ex: 📝 notes textuelles, 🪨 marqueurs géologie en V3), il faudra :

1. **Ajouter dans `_captureState`** et `_applyState` :
   ```js
   notes: deepClone(window.getNotes?.() || []),
   // ...
   if (window.resetNotes) window.resetNotes();
   if (window.setNotes && Array.isArray(s.notes)) window.setNotes(s.notes);
   ```

2. **Exposer `window.getNotes/setNotes/resetNotes`** dans le nouveau module (pattern existant)

3. **Instrumenter les sites de mutation** dans le nouveau module avec le pattern snapshot+record

4. **Pas besoin** de modifier `historyManager.js` pour les UI / raccourcis / boutons (c'est automatique)

⚠️ **Penser au reset au plan switch** : `_libererRessourcesPlanPrecedent` couvre déjà le `HistoryManager.reset()` qui vide TOUTES les piles d'un coup — pas de boulot supplémentaire.

### 44. Export PDF imprimable (depuis v1.10.3)

Module `js/pdfExport.js` (~700 lignes IIFE) → `window.MyKTAMapPdfExport = { afficherModale, genererPdf }`. Lib **jsPDF UMD** (`lib/jspdf.umd.min.js`) chargée AVANT le module dans index.html.

#### 44.1 Pipeline

```
[modale PDF options] → _lireOptionsModale() → opts
opts → _genererCanvasPlan() → await window.MyKTAMapExporterGenererCanvas(...)
       (wrapper public dans exporter.js qui appelle _genererCanvasExport)
canvas → pdf.addImage(canvas.toDataURL("image/jpeg", 0.88), "JPEG", ...)
opts.incLegende ? → _dessinerLegendeOverlay() → await window.MyKTAMapExporterGenererCanvasLegende(...)
                  → pdf.addImage(legCanvas.toDataURL("image/png"), "PNG", ...) en overlay 4-coins
opts.incHeader ? → _dessinerHeader() (titre + métas via pdf.text())
crédit footer (1 ligne pdf.text, sans emoji)
pdf.save(filename)
```

#### 44.2 Formats

Constante `FORMATS` (objet) mappe `"<size>-<orient>"` → `{format, orientation, label}`. 5 tailles × 2 orientations = 10 entrées :
- `a0-portrait/landscape` (841×1189 mm) → plotter pro
- `a1-portrait/landscape` (594×841) → grand format
- `a2-portrait/landscape` (420×594) → affiche
- `a3-portrait/landscape` (297×420) → papier A3
- `a4-portrait/landscape` (210×297) → papier standard *(défaut paysage)*

Constante `PDF_SIZES` (array de `{key, label, hint}`) utilisée pour rendre les radios "Taille" + "Orientation" séparément dans la modale (UX plus claire qu'un dropdown 10 entrées).

#### 44.3 Calques granulaires (inspiré export PNG avancé)

Modale auto-liste `PLAN_CONFIG.imageLayers[]` et `PLAN_CONFIG.dataLayers[]` :
- Section **🖼️ Image de base & calques** : checkbox "Image plan de base" + 1 checkbox par `imageLayers[]`
- Section **📊 Calques de données** : 1 checkbox par `dataLayers[]` avec label spécial pour `editor` (= calque session)
- Pré-cochage = visibilité actuelle sur la carte (via helpers `_getVisibleImageLayerIds` / `_getVisibleDataLayerIds` locaux — duplique exporter.js volontairement pour éviter dep cross-module)

`_lireOptionsModale` capte ces choix dans `opts.imageLayers = {id: bool}` et `opts.dataLayers = {id: bool}`. Le wrapper `_publicGenererCanvas` de exporter.js accepte ce format granulaire (rétrocompat v1 avec booléens globaux préservée pour les futurs callers).

#### 44.4 Légende = overlay 4-coins (v3.1)

Décision design : **PAS de footer dédié**, légende posée en overlay sur le plan au coin choisi. Plus de gain de surface pour le plan, et cohérent avec l'export PNG avancé.

Fonction `_dessinerLegendeOverlay(pdf, opts, planX, planY, planW, planH)` :
1. Génère le canvas légende via `window.MyKTAMapExporterGenererCanvasLegende({contenu, size, style, scale: 2})`
2. Calcule largeur cible en mm selon `legSize` : Compact=22%, Standard=28%, Large=35% de la largeur du plan
3. Cap auto à 70% de la hauteur du plan si trop haut (cas plans étroits)
4. Padding 3mm depuis le bord choisi
5. Pose via `pdf.addImage(dataUrl, "PNG", legX, legY, legWmm, legHmm)`

Helper public dans exporter.js : `window.MyKTAMapExporterGenererCanvasLegende(userOpts)` :
- Crée un canvas temporaire 3000×3000
- Force position `haut-gauche` à (0,0)
- Appelle `_dessinerLegende` avec un setup canvas isolé
- `_dessinerLegende` retourne désormais `{boiteW, boiteH, bx, by}` à la fin
- Crop le canvas final aux dims exactes via `drawImage`
- Auto-collecte `tagsUtilises` via `getEditorPoints()` + `fetch` des data layers si pas fourni explicitement
- Retourne `Promise<HTMLCanvasElement | null>` (null si aucun contenu cochable)

#### 44.5 Nouveau style `print`

4ème entrée dans `STYLES` de `_dessinerLegende` (à côté de opaque/semi/filigrane) :
- bg : `rgba(255,255,255,1)` blanc pur
- border : `rgba(30,58,138,0.55)` bleu marine
- text : `#1a1f2e` quasi-noir
- titreSection : `#1e3a8a` bleu marine saturé
- meta : `#555c6e` gris foncé

Adapté impression papier (vs styles dark theme natifs de l'app).

#### 44.6 ⚠️ Pas d'emoji dans pdf.text()

jsPDF Helvetica latin1 → emojis Unicode rendus en mojibake (`📍` → `O=UI...`). **Règle absolue** : aucun caractère hors Latin-1 dans les chaînes passées à `pdf.text()`. Le crédit footer "Généré par MyKTAMap · CC BY-NC-SA 4.0 · myktamap.fr" est OK (· = U+00B7 dans Latin-1).

Les emojis dans la légende sont OK car la légende est rendue en image canvas (= browser DOM rendering qui supporte Unicode) avant d'être posée dans le PDF via `addImage`.

#### 44.7 Wiring index.html / sw.js

- `<script src="lib/jspdf.umd.min.js">` AVANT `<script src="js/pdfExport.js">` (jsPDF doit créer `window.jspdf` avant que le module check `_checkJsPDF`)
- `sw.js > ASSETS_TO_CACHE` : `./lib/jspdf.umd.min.js` + `./js/pdfExport.js`
- Crédits dans le splash + footer loader : `🍃 Leaflet · 📦 JSZip · 📤 jsPDF · 🧭 Dijkstra`

#### 44.8 Pour ajouter une nouvelle taille (futur)

1. Ajouter dans `PDF_SIZES` (array) — `{key, label, hint}`
2. Ajouter les 2 variantes portrait/paysage dans `FORMATS` (dict) — `{format, orientation, label}`
3. Le radio "Taille" s'auto-régénère via `PDF_SIZES.map(...)` dans la modale
4. Le mapping `"<size>-<orient>"` est composé dynamiquement dans `_lireOptionsModale`

### 45. Fix structures embedded dans exports canvas (depuis v1.10.3)

Audit qui a révélé un trou : les structures (piliers + mur + fronts) embarquées dans les data layers (`data/<plan>/structure.json` ou tout autre JSON avec champ `structures: [...]`) étaient :
- ✅ Affichées en runtime Leaflet via `utils.js > ajouterPointsDepuisJSON` (lignes 638-720 ~)
- ✅ Présentes dans exports session (Full / Avancé / Conversion) + KMZ
- ❌ **Manquantes** dans `utils.js > telechargerPlan` (export PNG rapide) — bloc complètement absent
- ❌ **Manquantes** dans `exporter.js > _genererCanvasExport` (export PNG avancé + PDF) — uniquement session

**Cause** : oubli post-update v1.9.3 lors de l'ajout des structures. Les helpers existaient (`getAllEmbeddedStructures` exposé par `utils.js`), mais pas appelés depuis les pipelines canvas.

**Fix v1.10.3** :
- `utils.js > telechargerPlan` : ajout de 2 blocs (structures session entre zones session et roads ; structures embedded dans la boucle data layers entre zones embed et roads embed). Tri Z `mur < pilier-2 < pilier-1 < front-2 < front-1`, filtre `passeFiltreNiveau`, couleurs alignées sur `STRUCTURE_STYLES` + hotfix v1.10.1-2.
- `exporter.js > _genererCanvasExport` : ajout `embeddedStructures = Array.isArray(j.structures) ? j.structures : []` dans la boucle data layers + bloc de rendu identique (filtre `opts.ann.structures` + `opts.ann.structuresTypes`, niveau via `_itemPasseLevels`, helpers `_drawPolygon`/`_drawPolyline`).
- Compteurs `_diag.embStructs` et `_diagAdv.embStructs` ajoutés pour le debug.

**Pour les futurs trous éventuels** : si un nouveau type d'annotation est ajouté (genre `notes` ou `photos_geo` à terme), bien penser à le câbler dans LES 4 PIPELINES :
1. `utils.js > telechargerPlan` (PNG rapide ⚡) — session + embedded
2. `exporter.js > _genererCanvasExport` (PNG avancé 🎨 + PDF 📤) — session + embedded
3. `sessionExporter.js` (3 modes Full / Avancé / Conversion) — session + embedded
4. `kmzExport.js` (KMZ géolocalisé) — session + embedded

Le runtime Leaflet (`utils.js > ajouterPointsDepuisJSON`) ne doit jamais être oublié non plus, mais il est généralement le premier site implémenté.

### 46. Recherche unifiée — 4 catégories + Ctrl+K (depuis v1.10.3)

Extension du module `js/searchPoints.js` (832 → ~1050 lignes) qui ne cherchait que les points avant. Désormais : **points + tracés + zones + structures**.

#### 46.1 Architecture

Format unifié d'item interne : `{kind: "point"|"road"|"zone"|"structure", item, layerId, layerLabel, label, searchableText}` retourné par `_tousLesItems()` (privé au module — n'EST PAS exposé via `SearchPoints.*` pour préserver l'API consommée par Pathfinder + Itinéraire qui attendent du format point-only).

Collecteurs ajoutés :
- `_collecterRoads()` : session via `window.getRoads()` + embedded via `window.getAllEmbeddedRoads()`
- `_collecterZones()` : idem
- `_collecterStructures()` : idem

Auto-label si l'item n'en a pas explicitement : `"Pilier 1ère masse session #2"`, `"Tracé Principal data #5"`, etc.

`searchableText` pré-calculé = `label + type + label FR du type + level si M-LVL + (tags pour les points)`.

#### 46.2 Scoring unifié

`_filtrer(query)` opère sur `_tousLesItems()` (filtré par `_matchesFiltersUnified`) :
- Points : scoring riche sur nom/id/tags/desc/état (= comportement v1.7.x préservé)
- Roads/Zones/Structures : scoring sur `label` + `searchableText` (moins de champs car structure plus simple)

Tri intra-catégorie : score décroissant, puis alphabétique sur `label`. Le groupement par catégorie est fait dans `_renderResultats`.

#### 46.3 Filtres

3 dimensions cumulatives (AND entre, OR intra) :
- **Catégorie** *(nouveau v1.10.3)* : `_filterKinds` Set<"point"|"road"|"zone"|"structure">. Ligne chips affichée uniquement si ≥ 2 catégories ont du contenu.
- **Calque** (legacy, points-only) : `_filterLayers` Set<layerId>
- **Tag** (legacy, points-only) : `_filterTags` Set<tag>

Reset des 3 à chaque ouverture + dans le bouton "✕ Effacer les filtres".

#### 46.4 Rendu groupé

`_renderResultats` réécrit en utilisant `_renderResultRow(it, visIdx, isFirst)` :
- Groupage par `kind` avec headers `📍 Points (N)`, `🛣️ Tracés (M)`, etc.
- Ordre fixe : point → road → zone → structure
- Icônes adaptées : PNG du tag pour points, emoji `_KIND_EMOJI[kind]` pour les autres
- Meta enrichie : type FR (`Principal`, `Eau`, `Pilier 1ère masse`...), niveau (`Niv 0`, `Niv -1 ↔ Niv 0` pour jonctions), nb points (`8 pts`)

#### 46.5 Raccourci Ctrl/Cmd+K

Listener global `keydown` au top du module IIFE (donc actif dès le chargement). Logique :
1. Check `(e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k" && !e.altKey && !e.shiftKey`
2. **Anti-vol de focus** : si un INPUT/TEXTAREA/contenteditable est focus, on ne déclenche QUE si la modale est déjà ouverte (= toggle close)
3. `e.preventDefault()` + `e.stopPropagation()` pour ne pas conflicter avec les bindings browser/OS
4. Toggle : si modale ouverte → close ; sinon → `window.ouvrirRecherche()`

#### 46.6 Interaction au clic d'un résultat

`_aller(item)` dispatch selon `item.kind` :
- `point` → `_allerVersPoint(it)` = flow v1.7.x préservé (setView + popup marker + cercle jaune 3s)
- `road / zone / structure` → `_allerVersAnnotation(it)` :
  - Centre de la carte = centroïde simple (moyenne x/y des points)
  - Cleanup flash précédent + nouveau overlay :
    - **Polyline** (roads + fronts) : `L.polyline` jaune dashed weight 10 opacity 0.85
    - **Polygon** (zones + piliers + mur) : `L.polygon` jaune transparent fill 30% border 4px
  - Popup info adapté : label + type FR + niveau + nb points + layer
  - Auto-cleanup après **4 sec** (vs 3 sec pour les points — donne plus de temps de visualiser un polygone qu'un cercle)

#### 46.7 API publique inchangée

Pour ne pas casser Pathfinder + Itinéraire :
- `window.SearchPoints.getAllPoints()` → toujours `[{point, layerId, layerLabel}]` (format point-only)
- `window.SearchPoints.findByQuery(q)` → idem

Le format unifié (avec `kind`) est strictement INTERNE au module pour le rendu UI.

#### 46.8 À NE PAS faire

- ❌ Exposer `_tousLesItems()` publiquement sans wrap dédié — casserait Pathfinder
- ❌ Mixer roads/zones/structures dans `getAllPoints()` — idem
- ❌ Ajouter le raccourci Ctrl+K en mode global SI un MCP/extension utilise déjà ce binding (à valider en cas de feature à la VSCode-style). Si conflit, basculer sur Ctrl+Shift+P ou `/`.

### 48. V2.1 — BatteryGuard (depuis v1.12.0)

Module `js/batteryGuard.js` (~280 lignes IIFE) → `window.BatteryGuard = { init, forceCheck, getState, onChange, getStatusLabel, isAvailable }`.

#### 48.1 Source de données

API standard `navigator.getBattery()` (Battery Status API). Le module appelle `init()` au boot (depuis `main.js`), puis attache 4 listeners sur l'objet `BatteryManager` :
- `levelchange` → notify(state)
- `chargingchange` → notify(state)
- `chargingtimechange` + `dischargingtimechange` → ignorés (pas utiles pour notre UX)

Throttle 5s entre 2 `notify()` (anti-flicker) + polling de secours toutes les 30s.

#### 48.2 Compatibilité

| Navigateur | Support |
|---|---|
| Chrome / Edge / Samsung Internet (Android, PC) | ✅ |
| Firefox récent (>72) | ❌ (désactivé par défaut côté Mozilla) |
| Safari iOS / macOS | ❌ (jamais implémenté côté Apple) |

Si l'API est absente, `BatteryGuard.isAvailable()` retourne `false`. Tous les listeners externes (`onChange`) reçoivent alors un state `{available: false}` pour qu'ils puissent masquer leur UI.

#### 48.3 Warnings graduels

3 seuils : 20%, 10%, 5%. Chaque seuil envoie un toast `OOMGuard.showToast(...)` **1 seule fois par cycle de décharge**.

```js
const LS_KEY_WARNINGS = "myktamap_battery_warnings_v1";
// { cycleId: "<timestamp>", sentLevels: [20, 10, 5] }
```

Le `cycleId` est régénéré dès qu'on repasse en charge OU qu'on remonte au-dessus de 50% (cycle "renouvelé"). Sinon, le set `sentLevels` empêche le spam.

#### 48.4 Permissions-Policy nginx

Sans le header, certains contextes (iframe, sandbox) bloquent l'API même en Chromium :

```nginx
# docs/nginx-csp-config.conf
add_header Permissions-Policy "battery=(self), ...";
```

#### 48.5 Sync forcée au boot

L'API peut être dispo mais le `BatteryManager` pas encore initialisé au paint initial. Donc `main.js > lancerApplication` appelle `BatteryGuard.forceCheck()` en **4 attempts cascade** :
- t=0 (immédiat)
- t=300ms
- t=1000ms
- t=3000ms

Une fois que ça marche, le subsequent `onChange` prend le relais.

#### 48.6 3 points d'affichage

1. **Chip header** (refonteInterface.js) — sortie de `kta-refonte-counters-btn` pour ne pas être surlignée en hover sidebar. Format : `⚡ 78%` (charge) ou `🪫 23%` (décharge, couleur selon niveau).
2. **Footer modale Session active** (refonteInterface.js > `_afficherModaleSessionDetail`) — ligne `🔋 État · 🪫 23% · Discharging`.
3. **Bloc 🔋 ÉTAT du mode urgence** (emergencyMode.js > `_tick`) — label long avec source + pct.

#### 48.7 À NE PAS faire

- ❌ Importer directement `navigator.getBattery()` dans un autre module — passer par `BatteryGuard.onChange()` qui gère le throttle + fallback
- ❌ Afficher un placeholder `?` ou `--` si API indispo — masquer complètement le widget (chip header : `display: none`)
- ❌ Spammer le warning toast à chaque polling tick — utiliser le pattern `sentLevels` localStorage

### 49. V2.2 — Stats session enrichies + ⬛ Mesure de surface (depuis v1.12.0)

#### 49.1 Stats agrégées

Implémentation dans `js/refonteInterface.js` :
- `_calculerStatsAggregees()` : lit `getEditorPoints()`, `getRoads()`, `getZones()`, `getStructures()`, comptabilise par type + calcule distance/surface cumulée.
- `_genererStatsAggregeesHTML(stats)` : génère le bloc HTML inséré en TÊTE de `_afficherModaleSessionDetail`.
- `_genererStatsAggregeesTXT(stats)` : version texte plain pour le presse-papier et l'export.

Boutons :
- 📋 **Copier** : `navigator.clipboard.writeText(_genererStatsAggregeesTXT(stats))`
- 💾 **Export TXT** : `Blob` + `URL.createObjectURL` + `<a download>`

#### 49.2 Helpers `js/utils.js`

```js
function formatSurface(areaM2, decimalsM2) {
  if (areaM2 >= 10000) return (areaM2 / 10000).toFixed(2) + " ha";
  if (areaM2 < 100)    return areaM2.toFixed(decimalsM2 ?? 1) + " m²";
  return Math.round(areaM2) + " m²";
}
function polygonArea(points) { /* shoelace, retourne aire en px² plan */ }
function polygonAreaM2(points) {
  const px2 = polygonArea(points);
  const scale = window.APP_CONFIG?.scale || 1; // px/m
  return px2 / (scale * scale);
}
```

#### 49.3 Mode mesure de surface

Refonte `js/measure.js` complète :
- 2 layers Leaflet séparés : `polylineMesure` (mode distance) + `polygonMesure` (mode surface)
- `_refreshMesureLayer()` : switch les layers selon `_mode`
- `_afficherMesureValeur()` : label adaptatif `📐 Distance: X m` ou `⬛ Surface: X m²`
- API publique :
  - `window.setMeasureMode("distance"|"surface")` → switch mode + clear points + redraw
  - `window.getMeasureMode()` → mode courant
  - `window.getMeasureValue()` → valeur formatée
  - `window.setMeasurePoints(pts)` → restore (utilisé par SessionPersist)

#### 49.4 Persistance SessionPersist

`js/sessionPersist.js` ajoute `measureMode` au payload :

```js
{
  ...,
  measureMode:   window.getMeasureMode?.() || "distance",
  measurePoints: window.getMeasurePoints?.() || []
}
```

**Restore order critique** : `setMeasureMode(payload.measureMode)` AVANT `setMeasurePoints(payload.measurePoints)` — sinon les points sont ajoutés au mauvais layer.

#### 49.5 Durée session

`window._sessionStartTs = Date.now()` posé dans `main.js > lancerApplication` (et reset au plan switch dans `_libererRessourcesPlanPrecedent`). Lu par `_calculerStatsAggregees` pour le `formatDuree(now - _sessionStartTs)`.

#### 49.6 À NE PAS faire

- ❌ Calculer la surface en pixels² et la présenter telle quelle — toujours convertir via `polygonAreaM2(points)` qui prend en compte `APP_CONFIG.scale`
- ❌ Considérer que `_mode = "surface"` interdit la mesure en m linéaires — l'user veut pouvoir basculer librement entre modes sans perdre l'état
- ❌ Sauvegarder les distances/surfaces calculées dans SessionPersist — recalculer à chaque restore est instantané et garantit la cohérence avec les annotations actuelles

### 50. V2.3 — Replay tracker + Export CSV (depuis v1.12.0)

#### 50.1 Instrumentation `js/tracking.js`

Ajout d'une **timeline interne** :

```js
let _trackingTimeline = []; // [{ts_ms, x, y, type, level}, ...]
let _trackingStartTs  = null;

function _pushTimelinePoint(type) {
  _trackingTimeline.push({
    ts_ms: Date.now(),
    x:     _currentPos.x,
    y:     _currentPos.y,
    type:  type,                       // "start" | "pdr" | "recalage"
    level: window.APP_CONFIG?.currentLevel ?? null
  });
}
```

4 sites instrumentés :
- `startTracking()` → `_trackingStartTs = Date.now(); _pushTimelinePoint("start")`
- `avancer()` (1 pas PDR appliqué) → `_pushTimelinePoint("pdr")`
- Click recalage (handler `_handleRecalageClick`) → `_pushTimelinePoint("recalage")`
- `recalerTrackerSurPoint()` → `_pushTimelinePoint("recalage")`

API publique exposée :
- `window.getTrackingTimeline()` → `[...]`
- `window.getTrackingStartTs()` → number | null
- `window.getTrackingDistanceM()` → number (calculé sur timeline, hors recalages)
- `window.resetTrackingTimeline()` → vide le tableau + reset `_trackingStartTs`

#### 50.2 Module `js/trackerReplay.js`

`window.TrackerReplay = { ouvrir, fermer, exporterCSV }` (~500 lignes IIFE).

Architecture :
- **Modale plein écran** (`#kta-tracker-replay-overlay`) avec slider `<input type="range">` + boutons commande + canvas overlay sur la carte
- **Mode compact** (bottom sheet) : `setCompactMode(true)` au Play, désactive `pointer-events: auto` sur l'overlay pour laisser passer les interactions carte
- **Trail** : `L.polyline` multi-segments — un nouveau segment à chaque type `recalage` (= téléportation, pas de ligne droite artificielle)
- **Marker mobile** : `L.circleMarker` jaune `radius: 8`
- **Raccourcis clavier** : `document.addEventListener("keydown", _onKey)` pour Espace / ← → / Échap

#### 50.3 Export CSV

```js
function exporterCSV() {
  const timeline = window.getTrackingTimeline();
  const startTs  = window.getTrackingStartTs();
  const mlvl     = !!window.APP_CONFIG?.multiLevel;
  
  let csv = "timestamp_ms_epoch,delta_ms_since_start,x_plan,y_plan,type";
  if (mlvl) csv += ",level";
  csv += "\n";
  
  timeline.forEach(pt => {
    const delta = pt.ts_ms - startTs;
    let row = `${pt.ts_ms},${delta},${pt.x},${pt.y},${pt.type}`;
    if (mlvl) row += `,${pt.level ?? ""}`;
    csv += row + "\n";
  });
  
  // Download via Blob + <a download>
}
```

#### 50.4 Reset au plan switch

`main.js > _libererRessourcesPlanPrecedent` :
```js
if (window.TrackerReplay) window.TrackerReplay.fermer();
if (window.resetTrackingTimeline) window.resetTrackingTimeline();
```

#### 50.5 Persistance timeline (depuis v1.21.2)

**Changement v1.21.2** : la timeline est désormais persistée (auparavant RAM-only). 3 surfaces concernées :

1. **`sessionPersist.js`** : payload enrichi avec `trackerTimeline` + `trackerStartTs`. Restore via `window.setTrackingTimeline(timeline, startTs)` au load.
2. **`sessionExporter.js`** : Full + Avancé incluent désormais `session.tracker = {position, path, timeline, startTs}`. Conversion ed2data **IGNORE** le tracker (incompatible avec data layer figé).
3. **`sessionBackups.js`** : `_isPayloadEmpty` inclut `etk` (empty tracker timeline) dans la heuristique skip-snapshot.

**Setter `window.setTrackingTimeline(timeline, startTs)`** dans `tracking.js` avec filtrage défensif :

```js
window.setTrackingTimeline = function(timeline, startTs) {
  if (!Array.isArray(timeline)) return;
  _trackingTimeline = timeline.filter(function(e) {
    return e && typeof e.x === "number" && typeof e.y === "number"
        && typeof e.t === "number" && typeof e.type === "string";
  });
  _trackingStartTs = (typeof startTs === "number") ? startTs : null;
};
```

⚠️ **Convention de nommage** : la timeline interne utilise `ts_ms` au runtime mais le payload sérialisé utilise `t` (raccourci). Le setter accepte `t` (format export). Veiller à la cohérence si on ajoute un nouveau site de persistance.

#### 50.6 À NE PAS faire

- ❌ Tracer un segment de polyline entre 2 points dont l'un est de type `recalage` — c'est une téléportation, pas un déplacement réel
- ❌ Garder la modale en mode "full" pendant le replay — bascule auto en compact dès le Play pour libérer la carte
- ❌ ~~Persister `_trackingTimeline` au localStorage~~ → **changé en v1.21.2**, désormais persisté via sessionPersist (cf §50.5)
- ❌ Inclure les events `boussole` ou `tick` dans la timeline — seuls les 3 types `{start, pdr, recalage}` sont pertinents (les autres seraient du bruit, +1000 events/sec pour rien)
- ❌ Bypass `setTrackingTimeline` pour restaurer — le filtrage défensif protège contre les payloads corrompus (anciens exports manuels édités, etc.)

### 51. V2.4 — Heatmap (RÉACTIVÉE + refonte majeure en v1.21.2 — depuis v1.12.0)

Module `js/heatmap.js` (~380 lignes IIFE en v1.12.0, **REFONTE majeure en v1.21.2**, cf §62.2).

**Historique** : v1.12.0 = implémenté avec 3 sources mais désactivé (pas d'utilité concrète terrain démontrée). v1.21.2 = **réactivé + ré-écrit** avec 6 sources togglables, interpolation segments, filtrage timeline défensif. Bouton 🔥 dans le groupe Stats/Analyse de la sidebar.

#### 51.1 Désactivation v1.12.0 → réactivation v1.21.2

**v1.12.0** : 3 endroits avaient été commentés pour désactiver (index.html script, sw.js ASSETS_TO_CACHE, interface.js bouton 🔥).

**v1.21.2** : tout réactivé. Le bouton 🔥 est de nouveau visible dans le groupe Stats/Analyse. Refonte de l'algo elle-même documentée dans §62.2.

#### 51.2 Implémentation (référence si réactivation)

- Canvas overlay : `L.imageOverlay(dataUrl, bounds, opts)` avec dataUrl générée par un canvas hors-DOM
- **Radial gradient** par point source via `ctx.createRadialGradient` + `ctx.globalCompositeOperation = "lighter"` (blending additif pour empiler les contributions)
- **Colormap** bleu → vert → jaune → rouge : pixel manipulation via `getImageData` + map d'intensité (0..1) sur le LUT couleur, puis `putImageData`
- 3 sources togglables :
  - Timeline tracker (`window.getTrackingTimeline()`)
  - Points editor session (`window.getEditorPoints()`)
  - Data layer points (tous les points embedded via `window.getAllEmbeddedPoints()`)
- Sliders rayon (10-120 px) + intensité (0.2-3×)

#### 51.3 Pour réactiver

1. Décommenter `<script src="js/heatmap.js">` dans `index.html`
2. Restaurer `"./js/heatmap.js",` dans `sw.js > ASSETS_TO_CACHE`
3. Restaurer le bouton 🔥 Heatmap dans `js/interface.js` (groupe Stats/Analyse, chercher `/* 🚫 v1.12.0 désactivé` pour trouver le bloc commenté)
4. Bump `CACHE_NAME` dans `sw.js`

#### 51.4 Filtre niveau M-LVL (depuis v1.21.4)

Nouvelle option `opts.levels` dans `Heatmap.generer(opts)` : `Set<number>` des niveaux à inclure. Si `Set` vide OU `multiLevel === false` → bypass total (tous items inclus, comportement v1.21.2 strict).

**Helper interne `_passeFiltreLevel(item, levels)`** appelé par tous les collecteurs (tracker timeline / editor / roads / zones / structures / dataLayers) après le filtre par source toggle. Logique :

```js
function _passeFiltreLevel(item, levels) {
  if (!levels || levels.size === 0) return true;  // bypass
  // Jonction interniveau : visible si l'un des 2 niveaux ∈ levels
  if (item && item.type === "jonction") {
    const f = (typeof item.fromLevel === "number") ? item.fromLevel : 0;
    const t = (typeof item.toLevel   === "number") ? item.toLevel   : 0;
    return levels.has(f) || levels.has(t);
  }
  const lvl = (item && typeof item.level === "number") ? item.level : 0;
  return levels.has(lvl);
}
```

**Sémantique jonction = symétrique** (cohérent avec §26.5 Pathfinder) : `{from:0, to:1}` est strictement équivalent à `{from:1, to:0}`. Le helper renvoie `true` si AU MOINS UN des 2 niveaux est sélectionné.

**Sémantique items sans level** : traités comme `level: 0` (rétro-compat v147, identique à `_passeFiltreNiveau` global).

**UI** : la modale Heatmap affiche une nouvelle section "🏗️ Niveaux" sous les sources togglables, visible UNIQUEMENT si `APP_CONFIG.multiLevel === true`. Chips pour chaque niveau de `APP_CONFIG.availableLevels`, sélection multi avec mémo dans `_lastOpts.levels` (= persistance le temps de la session). Re-générer recalcule avec le nouveau filtre.

⚠️ **Penser à filtrer AVANT l'interpolation segments** : `_passeFiltreLevel` doit être appelé sur l'item entier (la road/zone/jonction), pas par segment. Sinon les jonctions seraient filtrées au mauvais niveau si on découpe d'abord en segments.

### 52. Mode urgence — fixes v1.12.0

#### 52.1 Rotation paysage (orientation change)

Avant : la minimap Leaflet ne se redimensionnait pas seule à la rotation device → tuiles décalées, marker tracker hors zone visible.

Fix : listener `orientationchange` + `resize` qui appelle `invalidateSize()` en cascade (3 retries 80/300/700ms pour gérer les transitions iOS Safari lentes) + `fitBounds` pour refit complet :

```js
_orientationListener = function() {
  if (!_miniMap) return;
  function _retry() {
    try {
      _miniMap.invalidateSize({ animate: false });
      const pc = window.PLAN_CONFIG;
      if (pc?.plan) {
        _miniMap.fitBounds([[0, 0], [pc.plan.imageHeight, pc.plan.imageWidth]]);
      }
    } catch(e) {}
  }
  setTimeout(_retry, 80);
  setTimeout(_retry, 300);
  setTimeout(_retry, 700);
};
window.addEventListener("orientationchange", _orientationListener);
window.addEventListener("resize",            _orientationListener);
```

Cleanup au `desactiver()` pour ne pas garder des appels invalidateSize zombies après fermeture du mode.

#### 52.2 Décimation itinéraire (anti-crash gros plan)

Avant : itinéraire 1000-3000 pts → polyline énorme dans Leaflet pendant que tout le reste tourne en parallèle → OOM ou main thread bloqué.

Fix dans `_addRoadsToMiniMap` :
- **Skip total** si itinéraire > 500 pts
- **Décimation 1 pt/N** sinon, cap 100 pts
- **Cap total 5000 pts** sur l'ensemble des polylines de la minimap
- Toggle ☑️ 🗺️ Itinéraire dans header pour réafficher manuellement (skipé par défaut)

#### 52.3 Toggle 🗺️ Itinéraire visibilité (cyan + halo)

Le toggle réaffiche l'itinéraire, mais sur fond minimap zoomé serré + désaturé, weight 3 dashed était quasi invisible. Fix :
- **Cyan vif weight 6** (ligne pleine, no dashArray)
- **Halo blanc weight 10** dessous (2 polylines superposées) pour outline visible sur n'importe quel fond
- `lineCap: "round"` + `lineJoin: "round"` pour masquer les gaps de décimation

Persistance choix : `localStorage["myktamap_emergency_show_iti_v1"] = "1"|"0"`.

#### 52.4 Bouton 📍 Recalage auto-close

Avant : après click recalage, l'icône 📍 du groupe Tracker restait active (surlignée) jusqu'au prochain stop tracker — laissait penser que le mode était toujours actif.

Fix dans le handler de click recalage : avant l'appel à `_setGroupeModeActif("tracker", true, null)` (qui ne touche pas l'icône quand `actif=true && iconeReflet=null`), restore explicite de l'icône originale :
```js
const g = _groupes.tracker;
if (g && g.btnPrincipal && g.btnPrincipal.dataset.iconeOriginale) {
  g.btnPrincipal.innerHTML = g.btnPrincipal.dataset.iconeOriginale;
}
_setGroupeModeActif("tracker", true, null);
```

`window._fermerModeRecalage()` exposé pour pouvoir le call depuis n'importe où.

### 53. ThemeManager — thème clair / sombre limité mode carte (depuis v1.13.0)

Module `js/themeManager.js` (~150 lignes IIFE) → `window.ThemeManager = { init, getCurrent, setTheme, toggleTheme, onChange, isLight }`.

#### 53.1 Activation & persistance

- `localStorage["myktamap_theme_v1"]` = `"dark"` (défaut) | `"light"` — globale par appareil, jamais par plan
- Au boot : `ThemeManager.init()` lit le localStorage et applique la classe `.kta-theme-light` sur **`document.documentElement` ET sur `document.body`** (les 2 — critique pour matcher les modales appendées à `<html>` qui sont sibling de body)
- `setTheme(t)` : applique + persiste + notifie les listeners + update `<meta name="theme-color">` (statusbar mobile : #f0e8d8 clair / #111827 sombre)
- `toggleTheme()` : flip dark ⇄ light

#### 53.2 Position du toggle UI — 2 endroits synchronisés

1. **Sidebar gauche (mode carte)** : groupe `⚙️ Paramètres` (KARMA choix A:a) → `interface.js > _creerGroupeAccordeon({ id: "settings", sousActions: [⚙️ Réglages, ☀️/🌙 Thème] })`. Avant v1.13.0 ce groupe utilisait `soloAction: afficherConfig` (clic direct sur ⚙️ ouvrait la modale) → migré en sousActions pour héberger le toggle.

2. **Modale Configuration home** : checkbox `#loaderThemeLightCb` dans la section "🔍 Affichage" (script handler `index.html` ~ligne 2620). Au boot, sync via `ThemeManager.isLight()` ; au `change` : `ThemeManager.setTheme(checked ? "light" : "dark")`.

Les 2 toggles sont **synchronisés via `ThemeManager.onChange()`** — changer depuis l'un met à jour l'autre automatiquement.

#### 53.3 Stratégie CSS (~1200 lignes au final)

Tout dans `css/style.css` en fin de fichier, scoped sur **`body.kta-theme-light .selector`** (pour le contenu intra-body) ET **`html.kta-theme-light .selector`** (pour les modales appendées à `documentElement` qui sont sibling de body). Variables CSS dédiées :

```css
body.kta-theme-light {
  --kta-light-bg:            #f0e8d8;  /* body + container Leaflet (beige cataphile) */
  --kta-light-bg-bar:        #c9b88f;  /* header + footer + sidebar + icônes (brun-beige) */
  --kta-light-bg-bar-deep:   #b8a576;  /* hover sur bar items */
  --kta-light-bg-bar-border: #9a8754;  /* bordure forte entre bar/body */
  --kta-light-bg-elevated:   #fdf8eb;  /* modales + cards (presque blanc) */
  --kta-light-bg-deep:       #e5dcc5;  /* table headers + sidebar interne */
  --kta-light-text:          #2a2620;
  --kta-light-text-muted:    #6b6354;
  --kta-light-text-dim:      #8a8270;
  --kta-light-border:        rgba(0,0,0,0.12);
  --kta-light-border-strong: rgba(0,0,0,0.22);
  --kta-light-accent:        #f4c542;  /* jaune charte conservé */
  --kta-light-accent-hover:  #d9a82e;
  --kta-light-accent-bg:     rgba(244,197,66,0.22);
  --kta-light-shadow:        rgba(80,60,30,0.18);
}
```

**Pourquoi 2 prefixes selector ?** Beaucoup de modales sont créées via `document.documentElement.appendChild(modal)` (cf grep dans `js/*.js`) — elles sont enfant direct de `<html>`, sibling de `<body>`. Le selector `body.kta-theme-light .modal` ne matche pas. D'où `html.kta-theme-light .modal` en complément.

**Pourquoi `!important` partout ?** De nombreux modules JS (searchPoints.js, sessionExporter.js, etc.) injectent leurs styles via `<style>` inline. Ces styles externes battent les CSS du fichier sans `!important`. On force avec `!important` pour gagner la spécificité.

#### 53.4 Scope final (toute l'app)

✅ Couvert :
- **Home** : `#planLoaderOverlay`, `#planLoaderBox`, `#myPlansBox`, `#resumeBox`, `#panelZip`, `#allPlansList`, `.plan-card`, `.kta-loader-copyright`, `.kta-loader-perf-*`, `.kta-loader-pin-*`, `.loader-btn-resume` (bouton Reprendre), `.zip-drop-zone`
- **Boutons home** : `.loader-btn-help`, `.loader-btn-secondary`, `.loader-btn-ghost`, `.loader-btn-mini`, `.loader-btn-fs`, `#loadPlanBtn`, `#fsAccessBtn`, `#importListBtn`, `#exportListBtn`, `#loaderPlannerBtn`, `#loaderResetBtn`, `#loaderForceUpdateBtn`, `#loaderHelpBtn`, `#loaderConfigBtn`, `#loaderNetDocBtn`, `#loaderNetLogBtn`, `#loaderShowLogsBtn`
- **Splash chargement plan** : `#splashOverlay` (radial gradient beige), `#splashTitle` (ocre), `#splashSubtitle`, `#splashProgressTrack/Bar`, `.splash-scale-bar` (bandes alternées ocre)
- **Modale Config home** : `.kta-loader-config-boite`, `.kta-loader-config-corps`, `.kta-perf-*`, `.kta-net-paranoia-toggle`
- **Modale Audit** : `#loaderNetDocModal`, `#loaderNetLogModal`, `#loaderNetLogTbody`, `#loaderNetDocWhitelist`, `#loaderParanoiaBadge`
- **Auth gates** : `#kta-unlock-overlay` (code communautaire), `.kta-pin-gate-overlay` (PIN keypad), `.kta-pin-gate-bio-btn` (biométrie), `.kta-pin-proposal-boite` (post-update), `.kta-pin-gate-overlay-lockout`
- **Plan switcher** (clic titre header) : `.kta-plan-switcher-overlay`, `.kta-plan-switcher-modal-boite`, `.kta-plan-switcher-current`, `.kta-switcher-row` + enfants
- **Mode carte** : `.kta-refonte-header`, `.kta-refonte-statusbar`, `.kta-refonte-sidebar*`, `.kta-refonte-counter`, `.kta-refonte-stat`
- **Sidebars Leaflet** : `.leaflet-bar a` (boutons groupes, fond brun-beige), `.leaflet-bar a.kta-sub` (sous-actions, fond brun-beige), `.leaflet-bar a.kta-actif` (vert), `.leaflet-bar a.kta-group-mode-actif` (fond **blanc solide** + bordure jaune charte — KARMA fix "icône actif fond blanc pas transparent")
- **Modales du pattern principal** : `.kta-readme-modal-*` (Session, Recherche, Itinéraire, Mesure, Édition, Export, Réglages, Aide, Doc IA, Légende, M-LVL, Replay) — couvre aussi les descendants h1/h2/h3/p/li/span/strong/em/div via catch-all `* { color: var(--kta-light-text) !important }` dans `html.kta-theme-light .kta-readme-modal-overlay .kta-readme-modal-corps`
- **Sommaire / TOC** : `.kta-readme-toc-row/-link/-link-h2/-link-h3/-bullet/-toggle/-sublist` — hiérarchie restaurée (H2 bold foncé, H3 muted, border-left ocre, hover jaune)
- **Modale Update** (depuis badge version footer) : `#kta-update-modal` avec overrides des inline styles via attribute selectors `[style*="rgba(140,180,255"]` etc.
- **Modale Enregistrer session** : `#kta-session-export-modal` + onglets `.kta-ses-tab` + boutons `.kta-ses-btn-*` + items `.kta-ses-cb-row/.kta-ses-radio-row/.kta-ses-summary`
- **Onglets Mode rapide/avancé** : `.kta-conv-sens-btn` + `.active` (jaune charte plein)
- **Recherche unifiée Ctrl+K** : `.kta-search-input-wrap` + `input` (fond blanc + focus jaune), `.kta-search-result-item` + hover/selected, `.kta-search-filter-chip` + active, `.kta-search-group-titre`
- **Labels Leaflet** : `.kta-measure-distance` + `.kta-iti-distance` + segments + angles
- **Leaflet natif** : `.leaflet-container`, `.leaflet-popup-*`, `.leaflet-tooltip`, `.leaflet-control-layers-*`, `.leaflet-bar`
- **Toasts** : `.kta-toast`, `.kta-toast-msg`, `.kta-toast-icon`, `.kta-toast-close`, `.kta-toast-info/error` (border-left adaptée)
- **Modales progress `.kta-modal-*`** : Mise à jour en cours, Reset en cours, Session en cours, Yes/No
- **Modale Choix suppression** : `.kta-choix-suppr-*`
- **Modale chargement plan** : `.kta-load-overlay` + `.kta-load-box` + `.kta-load-spinner` (ocre)
- **Boutons généraux** : `.kta-btn`, `.kta-btn-primary` (jaune), `.kta-btn-secondary`, `.kta-btn-ghost`, `.kta-btn-link`, `.kta-btn-danger`
- **Alertes publiques** : `.kta-alert-*` (emergency rouge kept dramatique, warning orange, info bleu, absent neutre, selector cascade)
- **Stats agrégées + détail Session active** : `.kta-refonte-stats-*` + `.kta-refonte-session-*`

❌ Volontairement non couverts (restent dark) :
- **Splash KARMA cinématique** au tout début du boot (animation rotation boussole, contrastes dark requis pour l'effet fade-in lettres)
- **Viewer photos plein écran** (overlay sombre par essence pour bonne lecture des photos)

#### 53.5 Sync mode urgence

Le mode urgence garde son toggle 🔆/🌑 LOCAL (theme local `_theme` interne). Au `activer()`, on lit `ThemeManager.isLight()` pour initialiser `_theme` au boot de l'overlay :

```js
function activer() {
  if (window.ThemeManager && typeof window.ThemeManager.isLight === "function") {
    _theme = window.ThemeManager.isLight() ? "light" : "dark";
  }
  // ...
}
```

Le toggle local du mode urgence ne propage PAS à `ThemeManager` (volontaire — cas d'usage : "lampe d'appoint en sous-sol pendant 30 sec" sans changer la pref globale).

#### 53.6 Ordre de chargement

`<script src="js/themeManager.js">` chargé **juste après** `js/copyright.js` dans `index.html` :
- Copyright = pas de DOM, juste console banner → OK
- ThemeManager = doit s'appliquer AVANT le rendu pour éviter le FOUC (flash dark → light)
- Le reste des modules (debug, perfUltra, unlockGate, pinLock, main, etc.) peut alors lire `window.ThemeManager`

#### 53.7 Pour étendre

**Ajouter une modale qui supporte le thème** :

1. **Pattern A (recommandé)** : utilise `.kta-readme-modal-overlay` + `.kta-readme-modal-boite` → couvert automatiquement via les règles catch-all `html.kta-theme-light .kta-readme-modal-overlay *`. Si ta modale a un contenu **COURT**, ajoute aussi sur sa classe spécifique :
   ```css
   .ma-modal-boite {
     max-width: ...;
     height: auto !important;
     max-height: 90vh !important;
   }
   ```
   pour éviter le bug 88vh étiré (cf §53.9 ci-dessous).

2. **Pattern B (modale custom hors `kta-readme-modal-*`)** : il faut écrire les overrides manuellement avec `html.kta-theme-light .ma-classe { ... !important }` dans `style.css`. **Toujours utiliser `!important`** car de nombreux modules injectent leurs styles en `<style>` inline qui battent CSS externe non-important.

3. **Si tu append la modale à `document.documentElement`** (pattern majoritaire dans le projet) : utilise le sélecteur `html.kta-theme-light .ma-classe` (PAS `body.kta-theme-light`) — sinon la classe `.kta-theme-light` sur `<body>` ne peut pas matcher car la modale est sibling de body.

**Écouter les changements de thème** depuis un module dépendant :
```js
if (window.ThemeManager) {
  window.ThemeManager.onChange(function(theme) {
    // theme = "dark" | "light"
    // refresh ton UI ici
  });
}
```

#### 53.8 À NE PAS faire

- ❌ Stocker le thème ailleurs qu'en `localStorage["myktamap_theme_v1"]` (= source de vérité unique)
- ❌ Appliquer la classe `.kta-theme-light` à un autre élément que `<html>` et `<body>` (les modales ajoutées à `documentElement` doivent matcher via `html.kta-theme-light .modal`)
- ❌ Bypass `ThemeManager.setTheme()` en appliquant la classe directement (pas notifié, pas persisté, désync entre les 2 toggles UI sidebar/Config-home)
- ❌ Inventer de nouvelles couleurs custom — utilise les variables `--kta-light-*` pour la cohérence
- ❌ Oublier `!important` dans les overrides — les styles inline injectés par certains modules (searchPoints.js, sessionExporter.js, sidebar par `<style>`) battent les CSS externes non-important

#### 53.9 Bug 88vh étiré sur modales courtes (fix général)

Pattern récurrent depuis v1.9.2 : `.kta-readme-modal-boite { height: 88vh }` sur PC étire les modales courtes (contenu ~300px) à 88vh avec moitié vide en dessous. Fix appliqué progressivement :

| Modale | Release | Classe |
|---|---|---|
| Export PNG | v1.9.2-fix14 | `.kta-export-modal-boite` |
| Export PDF | v1.10.3 | `.kta-pdf-modal-boite` |
| PIN proposal | v1.11.1 | `.kta-pin-proposal-boite` |
| Image volumineuse (mode urgence) | v1.12.0 | `[max-width: 460px]` |
| **Niveaux M-LVL** | v1.13.0 | `.kta-niv-modal-boite` |
| **Légende** | v1.13.0 | `.kta-legende-modal-boite` |
| **Jonction interniveau** | v1.13.0 | `.kta-jct-modal-boite` |
| **Itinéraire** | v1.13.0 | `.kta-iti-modal-boite` |
| **Je suis perdu** | v1.13.0 | `.kta-lost-modal-boite` |
| **Enregistrer session** | v1.13.0 | `#kta-session-export-modal .kta-readme-modal-boite` (modale sans classe spécifique) |

**Pattern uniforme** :
```css
.ma-modal-boite {
  max-width: ...;
  height: auto !important;
  max-height: 90vh !important;
}
```

**Important** : ce fix est **général (dark + light)**, pas scope `body.kta-theme-light`. Toute nouvelle modale avec contenu court doit suivre ce pattern dès sa création — pas un fix réactif post-feedback user.

---

### 54. GpxIO — Import + Export GPX (depuis v1.14.0)

Module `js/gpxIO.js` (~360 lignes IIFE) → `window.GpxIO = { exporter, parser, importer, verifierCalibrage, _appliquerImport }`.

#### 54.1 Réutilise le calibrage KMZ

GpxIO **n'a pas sa propre calibration** : il réutilise intégralement celle de KmzExport (cf §32). Logique : si l'user a déjà calibré pour exporter en KMZ vers Google Earth, le même calibrage marche pour GPX vers TopoDroid/OsmAnd/etc.

API utilisée :
- `window.KmzExport.planToGps(t, x, y)` → `{lat, lng}` (pour export)
- `window.KmzExport.gpsToPlan(t, lat, lng)` → `{x, y}` (nouveau v1.14.0, **inverse exact**, pour import)
- `window.KmzExport.getCalibration(planId)` → `{transform, ...}` (lecture localStorage)

#### 54.2 Format GPX 1.1 produit

```xml
<gpx version="1.1" creator="MyKTAMap (myktamap.fr)" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <name>...</name>
    <desc>Export GPX depuis MyKTAMap — N point(s), M tracé(s)</desc>
    <author><name>MyKTAMap</name><link href="https://myktamap.fr"/></author>
    <time>2026-05-23T18:00:00.000Z</time>
  </metadata>
  <wpt lat="..." lon="...">
    <name>Nom du point</name>
    <desc>Description longue</desc>
    <type>tag_principal</type>
    <sym>tag_principal</sym>           <!-- même valeur, GPX standard recommande les 2 -->
    <cmt>MyKTAMap level=-1</cmt>        <!-- préservation niveau M-LVL pour roundtrip -->
  </wpt>
  <trk>
    <name>Label du tracé</name>
    <type>principal</type>              <!-- principal | secondaire | chemin | itinerary -->
    <cmt>MyKTAMap level=0</cmt>
    <trkseg>
      <trkpt lat="..." lon="..."/>
      <trkpt lat="..." lon="..."/>
    </trkseg>
  </trk>
</gpx>
```

#### 54.3 Flow export

`window.GpxIO.exporter({incPoints, incEmbedded, incRoads, incIti, filename})` → `{ok, msg, counts, filename}`. Génère + télécharge directement via Blob URL. Pas de fichier intermédiaire.

UI : onglet `gpx` dans `sessionExporter.js > _afficherModal` (avec les autres : full/advanced/conversion/kmz). `_renderGpx()` génère le HTML (info calibrage + checkboxes options). `_exportGpx()` lit les options et appelle l'API.

#### 54.4 Flow import (2 phases : preview puis confirm)

`window.GpxIO.importer(file, {confirmAdd: false})` → Promise → `{ok, msg, preview, _toApply: {points, tracks}}`.

Si `confirmAdd: false` (défaut UI) :
- Parse le fichier
- Transforme coords WGS84 → plan via `gpsToPlan`
- Détecte les points hors bounds du plan (out-of-bounds) → ignorés
- Détecte le niveau M-LVL depuis `<cmt>MyKTAMap level=N</cmt>` si présent
- Map type GPX `<type>` → type road valide (sinon fallback "chemin")
- Retourne preview sans toucher à la session

L'UI affiche la preview (X waypoints + Y tracks + warnings hors-bounds) et l'user confirme → second call avec `confirmAdd: true` OU directement via `window.GpxIO._appliquerImport(points, tracks)`.

`_appliquerImport` :
1. **Snapshot HistoryManager** AVANT (pour permettre Undo)
2. `setEditorPoints(current.concat(newPoints))`
3. `setRoads(current.concat(newTracks))`
4. `HistoryManager.record("Import GPX : N points, M tracés", _hb)`

#### 54.5 Garde-fous

- **Vérif calibrage** avant tout import/export : `verifierCalibrage()` → `false` si aucun `getCalibration(planId).transform`. UI affiche message explicite invitant à passer par KMZ.
- **Out-of-bounds detection** : tout point dont les coords plan après transformation tombent hors du rectangle `[-50, imgW+50] × [-50, imgH+50]` est ignoré (tolérance 50px pour les bords).
- **Tracks partiels** : si tous les points d'un `<trk>` sont hors bounds, le tracé entier est skipé (avec compteur dans la preview).
- **Tracks trop courts** : `<trkseg>` avec moins de 2 points valides est skipé.
- **Multi-segments tracks** : tous les `<trkseg>` d'un `<trk>` sont concaténés en un seul tracé MyKTAMap (les segments multi sont rares en pratique pour des plans souterrains).

#### 54.6 Pour étendre

- **Nouveaux types de tracés** : ajouter dans le filtre `validTypes` de `gpxIO.js > importer` (~ligne 290)
- **Support GPX 1.0** (legacy) : non prévu — l'user peut convertir via gpsbabel ou un outil online avant import
- **Extensions Garmin / Strava** : non parsées, ignorées silencieusement par DOMParser
- **Nouveaux champs preservés** : ajouter dans `_genererGpx` (export) + dans le parser `importer` (lecture)

#### 54.7 À NE PAS faire

- ❌ Inventer son propre calibrage parallèle au KMZ — toujours passer par `window.KmzExport` pour la cohérence
- ❌ Bypass `_appliquerImport` et muter directement les arrays editorPoints/roads — sinon pas de snapshot HistoryManager et l'user perd l'Undo
- ❌ Charger une lib GPX externe (gpxparser, togpx, etc.) — DOMParser natif suffit largement et évite les dépendances

---

## 🚨 Pièges connus & règles importantes

### Z-index et modales sur-imposées

⚠️ **Bug type récurrent** : créer une modale par-dessus une autre sans gérer le z-index relatif.

- Modale parent `kta-readme-modal-overlay` : `z-index: 99999`
- Sous-modale créée à la volée : utiliser `z-index: 100001` (parent + 2)

Voir le fix de `tableEditor.js > _menuSauvegarde` (z-index 100001).

### Pointer-events sur le titre fixe

⚠️ Avant 06/05/2026, `#kta-titre-fixe` avait `pointer-events: none`. Ne PAS rétablir cela : le titre est maintenant cliquable.

### Suppression prématurée d'éléments DOM

⚠️ **Ne PAS supprimer `kta-titre-fixe` avant un chargement de plan** : si le chargement échoue (modale "Plan introuvable" puis Annuler), le titre n'est jamais recréé. La suppression doit être faite UNIQUEMENT par `lancerApplication()` qui le recrée via `initInterface()`.

### Cache de recherche

⚠️ **`_pointsCache` ne contient QUE les points externes** (data layers). Les points editor sont récupérés à chaque appel via `_collecterPointsEditor()` pour rester à jour après import de session.

→ Le clic sur un résultat doit utiliser `_visibles[idx]` (liste affichée) et NON `_pointsCache[idx]`.

### Persistance localStorage / IndexedDB

⚠️ **Toujours appeler `requestPersistentStorage()`** avant `saveBlob()` sur mobile (sinon iOS/Chrome Android peuvent purger le cache).

⚠️ **Au reset complet** : penser à vider AUSSI les bases IndexedDB. Fallback Safari nécessaire car `indexedDB.databases()` n'est pas dispo partout.

### Couleurs de texte dans les modales

⚠️ Toujours définir une `color` explicite sur le contenu d'une modale custom — sans ça, le texte hérite du noir par défaut du body. Le sélecteur `.kta-readme-modal-corps` a maintenant `color: #c8d0e0` par défaut.

### Renommages anciens à connaître (depuis 08/05/2026)

⚠️ Du code/doc plus ancien peut référencer ces noms — c'est qu'il n'a pas été migré :

| Ancien nom | Nouveau nom | Notes |
|---|---|---|
| `APP_CONFIG.motionDebug` | `APP_CONFIG.debugMode` | Flag global (plus uniquement tracker) |
| `APP_CONFIG.perfMode` (boolean tri-state) | `APP_CONFIG.perfPreset` (string) | Valeurs : `"auto"` / `"quality"` / `"balanced"` / `"performance"` |
| `perfModeActif(fileSize)` | `resoudrePerfPreset(preset, fileSize, W, H)` | L'ancien est conservé en alias rétro-compat |
| `localStorage.app_user_prefs.motionDebug` | `localStorage.app_user_prefs.debugMode` | Migré silencieusement au boot |
| `localStorage.app_user_prefs.perfMode` | (supprimé — pref globale n'existe plus) | `perfPreset` est désormais par plan via `PlanRegistry[planId].perfPreset` |
| `cfg_motionDebug` (id select Réglages) | `cfg_debugMode` | — |
| label "Debug mouvement" (Réglages) | "Logs détaillés" | — |
| Constante `TILE_SIZE = 1024` | `params.tileSize` (lu depuis le preset) | Idem `MAX_WORK_DIM` → `params.maxWorkDim`, `0.88` → `params.jpegQuality` |

### Audit 09/05/2026 — code mort retiré

Du code/doc plus ancien peut référencer ces noms — ils n'existent plus :

| Ancien nom | Action | Notes |
|---|---|---|
| `js/sw.js` | **supprimé** | ancien SW abandonné, le vrai vit à la racine |
| `js/import.html` | **supprimé** | page autonome obsolète, fusionnée dans `index.html` |
| `window.iconeSalle`, `iconepa`, `iconepc`, `iconepb`, `iconeVehicule`, `iconeElec`, `iconeEpure`, `iconePS`, `iconeInfo`, `iconeChatiere`, `iconePassage`, `iconeDanger`, `iconepe` | **supprimés** (13 globals) | résolution unique via `window._iconMap[tag]` désormais. Seuls `iconeDefault` et `iconeTrack` restent globaux. |
| `perfModeActif(fileSize)` + `window.perfModeActif` | **supprimé** | alias rétro-compat jamais consommé après migration vers `perfPreset` |
| `window._SERVER_PLAN_PATH` | **supprimé** | dead write (jamais lu) |
| Classes CSS `.kta-cfg-actions`, `.kta-cfg-cache`, `.kta-conv-apercu`, `.kta-conv-hint`, `.kta-legende-separateur`, `.kta-planner-tabs`, `.kta-planner-tab` | **supprimées** | jamais référencées en JS/HTML |
| Onglets export `⚡ Export rapide` / `🎨 Avancé` | renommés | `⚡ Mode rapide` / `🎨 Mode avancé` (UX : le mot "Mode" évite que l'utilisateur lise ça comme un bouton d'action) |

### Coordonnées plan ↔ Leaflet

```js
function convertCoord(x, y) {
  return [APP_CONFIG.imageHeight - y, x];
}
```

L'origine GIMP/image (haut-gauche) doit être convertie pour Leaflet (bas-gauche).
**Toujours** utiliser `convertCoord()` et **jamais** passer directement `[y, x]` à Leaflet.

### Tracker (expérimental)

⚠️ Le tracker est marqué **expérimental** dans la doc. Sa précision dépend du calibrage du plan (`scale` pixel→mètre) et dérive avec le temps. Le **recalage manuel** (📍) est essentiel.

⚠️ **Ne PAS demander la permission capteurs au démarrage de la page** — UNIQUEMENT au clic ▶️ Play (iOS exige un geste utilisateur explicite).

---

## 📦 Format des données

### `plan-config.json`

```json
{
  "plan": {
    "name": "Test 1",
    "version": "V1",
    "author": "KARMA",
    "imageWidth": 1044,
    "imageHeight": 610,
    "baseImage": "TestMAP.png",
    "collisionImage": "collision.png"
  },
  "imageLayers": [
    { "id": "legende", "label": "Légende", "file": "legende.png", "visible": true, "order": 10 }
  ],
  "dataLayers": [
    { "id": "puits", "label": "Puits", "file": "puits.json", "visible": true },
    { "id": "editor", "label": "Mes ajouts", "file": "editor.json", "visible": true }
  ],
  "tracking": {
    "startX": 345, "startY": 519, "scale": 4.9,
    "stepLength": 0.7, "stepThreshold": 13, "stepCooldown": 400
  },
  "icons": {
    "default": "icon/iconetrack.png",
    "track":   "icon/iconetrack.png",
    "pa":      "icon/pa.png"
    // Les tags listés dans TAGS_BUILTIN sont auto-résolus
  }
}
```

### Format point (data.json)

```json
{
  "data": [
    {
      "id":          "PA1",
      "nom":         "Puits Aération",
      "x":           4843,
      "y":           2002,
      "tags":        ["aeration", "ouvert", "pa"],
      "etat":        "Non inspectée",
      "description": "Puits avec courant d'air",
      "profondeur":  12,
      "date_update": "2026-04-03"
    }
  ]
}
```

### Format export session

```json
{
  "type":    "myktamap-session",
  "version": "1.0",
  "exported_at": "2026-05-08T10:00:00.000Z",
  "plan":    { "name": "Test 1", "version": "V1" },
  "editorPoints": [ ... ],
  "roads":   [ { "type": "principal", "points": [...] } ],
  "zones":   [ { "type": "eau",       "points": [...] } ],
  "measure": { "points": [...] }
}
```

### Format export liste de plans

```json
{
  "type":        "myktamap-plans-list",
  "version":     "1.0",
  "exported_at": "2026-05-08T10:00:00.000Z",
  "plans": [
    { "id": "server_data_test1", "type": "server", "path": "data/test1", ... }
  ]
}
```

→ **Les `fsHandleId` ne sont PAS exportés** (non portables entre appareils/sessions).

---

## 🛠️ Workflow de modification typique

### Pour ajouter une fonctionnalité

1. **Vérifier d'abord** dans le README.md > Journal des modifications si une fonctionnalité similaire existe déjà ou a été tentée.
2. **Faire un topo avant de coder** — c'est la règle d'or de l'auteur :
   - Décrire le problème
   - Lister les choix de design possibles avec recommandation
   - Demander validation des choix
3. **Synchroniser les fichiers** depuis les uploads de l'utilisateur (les fichiers `outputs/` peuvent être en retard).
4. **Coder le minimum nécessaire** — éviter les refontes massives.
5. **Vérifier** avec `node -c` (syntaxe) + checks `grep` ciblés.
6. **Mettre à jour la doc** : `README.md` (DEV) + `README_USER.md` (utilisateur) si user-facing.
7. **Présenter les fichiers** modifiés via `present_files`.
8. **Récapituler** : cause racine, fix, comportements avant/après, tests à faire.

### Pour fixer un bug

1. **Reproduire mentalement** le scénario décrit par l'utilisateur.
2. **Localiser** le code concerné (`grep -n` est ton ami).
3. **Identifier la cause racine** (pas seulement le symptôme).
4. **Proposer le fix** sans toucher aux comportements adjacents.
5. **Vérifier les régressions potentielles** (autres modules qui utilisent la même fonction).
6. **Tester mentalement** chaque cas avant/après.

### Pour ajouter un nouveau type d'icône

Suivre la **checklist en 7 étapes** détaillée dans la section "Architecture clé > 2. Cascade de résolution des icônes".

### Pour modifier la légende exportée

Voir `exporter.js > _dessinerLegende`. La répartition est automatique (algorithme équilibré). Pour ajouter une section, il faut :

1. Ajouter dans `GROUPES_ICONES` (si lié aux icônes) ou ajouter une section directement dans `entrees`.
2. Mettre à jour le `LBL` local pour les nouveaux tags.
3. Tester avec un plan riche pour vérifier la répartition gauche/droite.

---

## 📝 Style des interactions avec l'utilisateur

### Préférences de l'auteur (KARMA)

- **Topo avant code** systématique pour les évolutions non-triviales (questions numérotées 1: 2: 3: avec recommandations).
- **Réponses courtes au format `1:a 2:b 3:c`** sont la norme — ne pas attendre de réponses complètes.
- **Ne PAS écraser les fichiers récents** : l'utilisateur uploade ses fichiers actuels avant chaque demande complexe → toujours synchroniser avant de coder.
- **Documentation à mettre à jour à chaque évolution majeure** :
  - `README.md` (DEV) avec entrée dans le journal des modifications
  - `README_USER.md` si la fonctionnalité est user-facing
- **Ton direct et complice**, mais professionnel.
- **Recap final** avec : cause racine, fix, comportements avant/après, tests à faire.

### Ce qui agace l'auteur

- Refaire un fichier sans son consentement explicite.
- Ne pas vérifier la cohérence après un changement (régressions cross-module).
- Affirmer qu'un fix marche sans avoir vérifié toutes les ramifications (cf. le bug "icône par défaut dans la recherche").
- Oublier des points de cascade lors d'ajouts de tags (cf. la checklist 7 étapes).

### Format préféré pour les explications

- **Tableaux** pour les comparaisons avant/après ou les listes de cas.
- **Code blocks** courts et ciblés.
- **Émojis** discrets pour structurer (✅ ❌ ⚠️ 🎯 📋 🔧).
- **Pas de mots-clés en gras à outrance** — seulement pour les vraies emphases.

---

## 🔗 Liens & références

- **Production** : https://myktamap.fr
- **Dev** : https://devmap.is-underground.fr
- **Licence** : CC BY-NC-SA 4.0 — voir `LICENSE` à la racine
- **Collaboration** : ouverte sur demande, contact via le site officiel
- **Leaflet docs** : https://leafletjs.com/reference.html
- **Doc dev complète** : `README.md` (à la racine du projet)
- **Doc utilisateur** : `README_USER.md` (intégrée à l'app via 📖)

---

## 🆘 Si tu es perdu

1. **Lire `README.md`** > Journal des modifications (en tête, par date décroissante) pour voir l'historique récent.
2. **Lire `README_USER.md`** pour comprendre ce que voit l'utilisateur final.
3. **Demander un topo** à KARMA avant de toucher quoi que ce soit de complexe.
4. **Ne JAMAIS** :
   - Toucher au format `plan-config.json` sans validation explicite (impacte les plans existants).
   - Modifier les valeurs de couleur de la charte (fait l'objet de plusieurs itérations validées).
   - Supprimer un tag built-in (régression silencieuse sur les anciens plans).
   - Réinitialiser le `localStorage` ou `IndexedDB` sans avertissement utilisateur.

---

### 56. v1.16.0 — UX & filet de sécurité (4 features) — depuis v1.16.0

Cycle de raffinement : Notes / Légende personnalisable / Favoris / Backup multi-rotations. **Aucune nouvelle surface réseau**.

#### 56.1 Notes (description) sur zones / tracés / structures

Helper global `window.attacherNotePopup(layer, getDescr, setDescr, titreType, opts)` dans `utils.js` :
- Mode `edit` (session) : textarea multiligne + bouton 💾 Sauver + `HistoryManager.record` + `SessionPersist.save({force: true})`
- Mode `readonly` (data layer KMZ) : juste affichage texte avec `white-space: pre-wrap`

**Ghost polyline transparente épaisse** (weight + 14 px, opacity 0, `bubblingMouseEvents: false`) ajoutée par-dessus les polylines visibles pour augmenter la zone cliquable. **Skip ghost/popup quand un mode édition est actif** via `window._aucunModeEditionActif()` + `window._kta_syncAllNoteUiForModeChange()` au toggle (sinon clics map interceptés).

**Fix structural majeur** dans `structures.js > renderStructures` : la branche `if (s === currentStructure)` n'était pas correctement fermée → ghost installé sur la structure EN COURS DE TRACÉ → impossible de continuer. Réorganisation en `if (s === currentStructure) { preview } else { closed + ghost + popup }`.

Roundtrip complet : session JSON, KMZ (`<description>` CDATA via `_emitDescriptionCdata`), GPX (`<cmt>` / `<desc>` déjà géré).

#### 56.2 Légende personnalisable — `js/legendCustomization.js`

Module IIFE ~600 lignes → `window.LegendCustomization`. Cascade 3 niveaux : session > plan (`PLAN_CONFIG.customLegend`) > default. 4 catégories : `icones` / `traces` / `zones` / `structures`.

API publique : `getLabel / isVisible / getSource / listEntries / listCustomEntries / findCustomEntry / setSessionLabel / setSessionVisibility / addCustomEntry / removeCustomEntry / updateCustomEntry / resetSession / setCustomEntryVisibility / loadSessionState / getSessionState / loadPlanState / ouvrirEditeur / onCustomEntriesChange / categoryTitle / listCategories`.

**Entrées custom DESSINABLES** : champ `geometry: "polyline" | "polygon"` (pour structures, choix utilisateur ; auto pour traces=polyline et zones=polygon). **Normalisation au stockage** dans `addCustomEntry` : polygon → on supprime `lineColor` (promu en `borderColor` si pas set), polyline → on supprime `fillColor` + `borderColor`. Évite swatch trait fantôme.

**Style resolvers** : `road.js > _resolveRoadStyle(type)`, `zones.js > _resolveZoneStyle(type)`, `structures.js > _resolveStructureStyle(type)` + `_isPolylineType(type)`. Tous consultent `LC.findCustomEntry` pour les types `cust-*`.

**Persistance** : champ `customLegend` ajouté au payload `SessionPersist`. `_isEmptyState` modifié pour ne pas purger si SEULE la légende est customisée.

**UI éditeur** : panel inline dans modale Export PNG (`exporter.js > _peuplerLegendCustom`) + bouton ✏️ **Modifier** dans fenêtre 🗺️ Légende (`interface.js > afficherLegende`) qui ouvre `LC.ouvrirEditeur({onChange, onClose})` — modale standalone z-index 100050. Au `onChange`, refresh in-place via `_construireContenuLegende()`.

**Popup titres résolus via LC** dans road.js / zones.js / structures.js / utils.js (data layer) — helper inline `_xxxPopupTitle(t)` qui distingue custom (`✨ + label`) vs built-in (emoji + LC.getLabel cascade-respectant). Fallback legacy hardcodé si LC indisponible.

#### 56.3 Flyout sidebar — pivot UI scalabilité

Pour les groupes traces / zones / structures, **remplace la cascade verticale** par un PANEL latéral adjacent au bouton principal. `interface.js > _creerGroupeAccordeon` reçoit `useFlyout: true` + `lcCat` + `customActivator` + optionnel `dynamicSousActions: () => [...]` (utilisé par Favoris).

Fonctions ajoutées : `_toggleFlyout / _ouvrirFlyout / _fermerFlyout / _positionnerFlyout`. Position calculée via `getBoundingClientRect`, clamp viewport, bascule auto si pas de place. **Max-height + max-width en pixels réels** (pas en vh, robuste landscape mobile iOS). Header sticky.

CSS dédié : `.kta-group-flyout` + sous-classes + variants thème clair. Scrollbar custom webkit + Firefox `scrollbar-width: thin`.

**`_setGroupeModeActif`** : skip `_ouvrirGroupe(id)` pour les groupes flyout (pas d'expansion accordéon).

**Bouton ✅ Valider tracé** ajouté (équivalent strict re-clic type actif via `_fermerModeRoad`). Cohérence 3 groupes : `[types built-in] + [séparateur] + [customs ✨] + [✅ Valider/Fermer] + [🧹 Effacer]`.

**Fix message structures Fermer pour customs polyline** : utilise `window.isStructurePolylineType()` qui consulte LC (avant hardcodé `front-1 || front-2`).

**⚠️ Fix critique v1.21.2 — propagation `cssClass`** : `_ouvrirFlyout` DOIT propager `sub.cssClass` aux boutons rendus :

```js
// Dans _ouvrirFlyout, pour chaque sub-action :
const btn = document.createElement("button");
btn.className = "kta-flyout-btn";
if (sub.cssClass) btn.classList.add(sub.cssClass);  // ← propagation requise
```

Avant v1.21.2 : `cssClass` était silencieusement ignoré → impossible de styler une sous-action spécifique (ex: rouge pour 🚨 urgences, vert pour ▶️ Play tracker).

**Pattern `dynamicIcon` + `isActive` (v1.21.2)** : les sous-actions peuvent désormais déclarer 2 callbacks ré-évalués à chaque ouverture du flyout :

```js
{
  icone:       "▶️",                                    // fallback statique
  dynamicIcon: () => isTracking() ? "⏹️" : "▶️",       // icône calculée
  titre:       "Démarrer / Arrêter tracker",
  isActive:    () => isTracking(),                      // bool → classe kta-actif
  onClick:     ...
}
```

Utilisé v1.21.2 pour le toggle tracker (▶️ ↔ ⏹️) dans le flyout 🧭 Tracker. Permet d'afficher l'état courant sans devoir re-rendre la sidebar entière.

#### 56.4 Favoris points — `js/favoris.js`

Module IIFE ~180 lignes → `window.Favoris = { loadPlan, getAll, isFav, findByPointId, add, remove, toggle, onChange }`.

Stockage `localStorage["myktamap_favoris_v1"]` indexé par planId. **Snapshots complets** des points (résilience si point déplacé/supprimé).

**Bouton ⭐ Favori dans popup POI** : `utils.js > buildPointPopupHtml` signature étendue avec 3e arg `layerInfo = {layerId, layerLabel}`. Toggle inline via `window.toggleFavoriPoint(...)` + refresh in-place du libellé dans toutes les popups ouvertes pour ce pointId.

Reverse-lookup `layerInfo` dans `ajouterPointsDepuisJSON` (data layer) : scan `window.dataLayerGroups` + lecture `PLAN_CONFIG.dataLayers` pour le label.

**Groupe sidebar ⭐ Favoris position topleft juste après M-LVL** (cf KARMA "met plutôt l'icône favoris dans le menu de gauche, juste après M-LVL"). Inséré dans le bloc `if (window._refonteInterfaceActive === true)` de `initInterface`, AVANT les autres groupes accordéon topleft, avec `dynamicSousActions: () => Favoris.getAll().map(...)`.

Helper `_allerVersFavori(fav)` : `map.setView` + flash circleMarker orange 3s + tentative d'ouvrir popup marker original (matching coords plan < 0.5 px).

Refresh auto via `Favoris.onChange` : si flyout Favoris ouvert au moment d'un ajout/retrait → rebuild en live.

#### 56.5 Backup multi-rotations sessions — `js/sessionBackups.js`

Module IIFE ~280 lignes → `window.SessionBackups = { init, snapshot, listAll, restore, remove, clearAll, onChange }`. 10 snapshots FIFO en IndexedDB.

Stockage IDB : DB `myktamap_backups` v1 / store `backups` / key `id` (timestamp ms) / value `{id, createdAt, reason, planId, planName, payload}` / max 10 entries FIFO via `_enforceLimit`.

**Hash djb2** cohérent avec SessionPersist pour skip duplicates.

**4 triggers** :
1. Auto périodique : `setInterval` 5 min, hash check
2. Au boot : 2 snapshots — AVANT `_applyRestore("boot-pre-restore")` (cas critique plan switch — capture session du plan précédent dans localStorage AVANT que onPlanLoaded ne la déclasse) + APRÈS avec `setTimeout 500ms` ("boot-after-restore")
3. Avant destructif : `sessionPersist.js > clear()` appelle `snapshot("before-clear-session")` avant le wipe
4. Manuel : bouton 📆 Snapshot maintenant

**Restore par reload** : écrit payload dans `localStorage["myktamap_session_v1"]` puis `location.reload()` → SessionPersist restaure naturellement. Pas de hot-swap des structures Leaflet (fragile). **⚠️ v1.16.1+** : la clé est désormais `myktamap_session_v1_<planId>` (per-plan slot, cf §57), et `restore` appelle `PlanRegistry.setLastPlanId(targetPlanId)` avant le reload pour recharger automatiquement le bon plan.

**UI section 📦 Backups récents** dans `refonteInterface.js > _afficherModaleSessionDetail` :
- Filtrée sur plan courant (via `b.planId === window._currentLoadedPlanId`)
- Badge avec compteur + sous-info `(+N autres plans)` si snapshots existent en IDB pour d'autres plans
- Liste compacte (`.kta-backups-list` : `flex-direction: row, padding 4px 0`) : date FR + counts + reason + boutons [↻ Restaurer] [🗑️]
- Boutons d'action : 📆 Snapshot maintenant + 🗑️ Tout vider

#### 56.6 Hotfixes UI/UX

**Thème clair compass widget** : nouveaux overrides `body.kta-theme-light .kta-compass-widget*` — fond `rgba(253,248,235,0.92)` (--kta-light-bg-elevated), bordure ambre charte, bouton close lisible, texte cardinal ambre saturé pour contraste sur fond clair.

**Garde-fous « Changer de plan » reformulés** : les 2 modales (rose des vents/titre → home, et plan spécifique dans switcher) ne disent plus « Les données non exportées seront perdues » (trompeur avec autosave + snapshots) mais affichent un message rassurant : « ✅ Ta session est sauvegardée et sera restaurée à ton retour. 📦 Les 10 derniers snapshots restent dispos dans 📊 Détails de session › Backups récents ». Icône ⚠️ → 🗂️, bouton « Charger quand même » → « 📚 Charger ».

#### 56.7 Sources de vérité v1.16.0

- `version.json` → `"v1.16.0"`
- `js/copyright.js > __MKM__.build` → `"v1.16.0"`
- `sw.js > CACHE_NAME` → `"myktamap-cache-v1.16.0"`
- 3 nouveaux fichiers ajoutés à `ASSETS_TO_CACHE` : `js/legendCustomization.js`, `js/favoris.js`, `js/sessionBackups.js`
- 3 nouvelles balises `<script>` insérées dans `index.html` après `utils.js`

#### 56.8 Confidentialité

**Aucun nouveau call réseau**. Tous les fetchs restent same-origin. Backups en IDB local (`myktamap_backups`), favoris en localStorage (`myktamap_favoris_v1`), LegendCustomization persiste dans payload SessionPersist déjà existant (`myktamap_session_v1`). **NETWORK_AUDIT inchangé** sur le fond — mise à jour des dates et de la version affichée uniquement.

#### 56.9 À NE PAS faire

- ❌ Bypass `_kta_syncAllNoteUiForModeChange` quand on ajoute un nouveau type de mode édition — les ghosts/popups intercepteraient les clics map
- ❌ Stocker `lineColor` ET `fillColor` sur le MÊME custom entry — la normalisation dans `addCustomEntry` retire l'un des deux selon `geometry`
- ❌ Append un bouton custom à la FIN du container sidebar — utiliser le marker `data-type-action="1"` + `insertBefore`
- ❌ Faire un restore live des structures Leaflet pour SessionBackups (fragile) — passer par localStorage + reload
- ❌ Filtrer les snapshots par planId au niveau du module — la filtration est UI-only (snapshots restent cross-plan en IDB pour permettre retour à un autre plan)
- ❌ Préfixer le label utilisateur par "✨" dans le flyout — le swatch coloré est déjà un marqueur visuel suffisant (cf KARMA "j'ai des étoiles en icône pour tous")

---

### 57. v1.16.1 — Auto-save PAR PLAN (hotfix depuis v1.16.1)

Hotfix PATCH au-dessus de v1.16.0. Une seule modif structurelle, fort impact UX terrain : **chaque plan a désormais SON propre slot localStorage**. Plus besoin de charger un snapshot quand on quitte un plan, va sur un autre, et revient sur le premier — la session reprend exactement où elle s'était arrêtée pour CE plan.

#### 57.1 Problème résolu

Avant v1.16.1, `SessionPersist` écrivait dans un **slot unique** `localStorage["myktamap_session_v1"]`. Quand l'utilisateur switchait de plan, le helper `onPlanLoaded` détectait le mismatch `planId` et faisait `clear()` systématiquement → la session du plan précédent était écrasée par celle du plan courant. Pour récupérer la session d'un plan déjà visité, il fallait obligatoirement passer par un snapshot (Backup IDB) — alors qu'on aurait juste voulu retomber sur l'état d'avant en revenant naturellement sur le plan.

#### 57.2 Structure localStorage par plan

Helpers dans `js/sessionPersist.js` :

```js
const STORAGE_PREFIX = "myktamap_session_v1_";
function _storageKeyFor(planId) {
  if (!planId) return null;
  return STORAGE_PREFIX + planId;
}
const STORAGE_KEY_LEGACY = "myktamap_session_v1";   // pour migration uniquement
```

Toutes les opérations `save / getSaved / clear / lecture initiale` ciblent désormais `_storageKeyFor(_currentPlanId)`. Le wipe automatique sur mismatch dans `onPlanLoaded` est **supprimé** — chaque plan garde sa session en parallèle dans son slot dédié.

| Avant v1.16.1 | Depuis v1.16.1 |
|---|---|
| `myktamap_session_v1` (un seul, écrasé au switch) | `myktamap_session_v1_<planId>` (N slots indépendants) |

#### 57.3 Migration transparente

Au boot, `_migrerAncienSlotUniqueSiBesoin()` (appelé depuis `init()`) :

1. Lit `localStorage["myktamap_session_v1"]` (ancien slot)
2. Si payload valide avec `planId` :
   - Calcule la nouvelle clé `_storageKeyFor(payload.planId)`
   - Si un slot per-plan plus récent existe déjà (comparaison `savedAt`) → garde le récent, supprime l'ancien
   - Sinon → copie le legacy dans la nouvelle clé puis supprime le legacy
3. Si payload corrompu ou sans planId → suppression silencieuse

L'utilisateur qui upgrade depuis v1.16.0 ou antérieur ne perd **rien** : sa session active continue à fonctionner dans le nouveau format.

#### 57.4 SessionBackups aligné

Dans `js/sessionBackups.js` :

- `_readCurrentSessionPayload()` lit en priorité le slot per-plan du planId courant (`window._currentLoadedPlanId` ou `PlanRegistry.getLastPlanId()`), fallback sur l'ancien slot unique si pas encore migré (cas du tout premier snapshot pre-migration au boot)
- `restore(id)` écrit le payload dans la clé `myktamap_session_v1_ + targetPlanId` (extrait de `entry.payload.planId` ou `entry.planId`), puis appelle `PlanRegistry.setLastPlanId(targetPlanId)` AVANT le `location.reload()` → l'app recharge automatiquement le bon plan au reload, et SessionPersist restaure naturellement le bon slot

#### 57.5 Sources de vérité v1.16.1

- `version.json` → `"v1.16.1"`
- `js/copyright.js > __MKM__.build` → `"v1.16.1"`
- `sw.js > CACHE_NAME` → `"myktamap-cache-v1.16.1"`
- Aucun nouveau fichier — modifs internes à `js/sessionPersist.js` et `js/sessionBackups.js`

#### 57.6 Confidentialité

**Aucune nouvelle surface réseau**. La modification est purement structurelle au niveau localStorage local. NETWORK_AUDIT inchangé sur le fond — mise à jour des dates et de la version affichée uniquement.

#### 57.7 À NE PAS faire

- ❌ Lire/écrire directement `localStorage["myktamap_session_v1"]` (legacy) dans un nouveau module — toujours utiliser `_storageKeyFor(planId)` via SessionPersist
- ❌ Remettre un `clear()` systématique au mismatch planId dans `onPlanLoaded` — détruirait la session du plan précédent (régression vers le comportement v1.16.0)
- ❌ Supprimer la migration `_migrerAncienSlotUniqueSiBesoin` avant d'être certain que tous les utilisateurs ont au moins booté une fois en v1.16.1+ (laisser quelques cycles de safety net)
- ❌ Faire un restore SessionBackups sans appeler `PlanRegistry.setLastPlanId(targetPlanId)` avant le reload — sinon l'app recharge le dernier plan ouvert, qui peut être différent du plan source du snapshot

---

### 58. v1.17.0 — Générateur accessible : Mode Simple/Avancé + Légende plan-level (depuis v1.17.0)

Refonte UX du Générateur 📦 Créer / Modifier un plan (`js/createConf.js`). Deux changements liés : un switcher Simple/Avancé pour rendre le démarrage d'un plan trivial, et une nouvelle source de vérité `plan.customLegend` pour partager une légende personnalisée avec tous les utilisateurs d'un plan.

#### 58.1 Switcher Simple/Avancé

**Helpers ajoutés** (top-level `js/createConf.js`) :

- `_lirePlannerMode()` → string `"simple"|"avance"` (lit `localStorage["myktamap_planner_mode"]`, default `"simple"` au tout premier launch)
- `_ecrirePlannerMode(mode)` → persist localStorage
- `_appliquerPlannerMode(mode)` → applique au DOM (toggle bouton actif, set `data-planner-mode` sur `#kta-planner-corps`, met à jour le hint texte, masque le switcher en mode Modifier, auto-charge les icônes built-in en Simple)

**HTML** : nouveau bloc `<div class="kta-planner-mode-switcher">` avec 2 boutons (data-mode="simple" / data-mode="avance") + `<p class="kta-planner-mode-hint">` juste après l'ouverture de `#kta-planner-corps`.

**Sections cachées en Simple via marqueur `data-planner-advanced="1"`** :

| Section | Type |
|---|---|
| Row `pl_collision` (intra Images) | Champ inline |
| 3. Calques image | Section complète |
| 4. Calques données | Section complète |
| 5. Tracking | Section complète |
| 6. Icônes & Tags | Section complète |
| 6 bis. 🏷️ Légende du plan (nouveau) | Section complète |
| 7. Géoréférencement GPS | Section complète |

**Règle CSS unique** dans `css/style.css` (vers ligne 14820) :

```css
#kta-planner-corps[data-planner-mode="simple"] [data-planner-advanced="1"] {
  display: none !important;
}
```

**Auto-chargement icônes built-in en Simple** : dans `_appliquerPlannerMode`, si `mode === "simple"` et que `#pl_icons_list` ne contient aucune `.kta-planner-icon-row`, on appelle `_chargerIconesDefaut()` automatiquement. Sinon le ZIP généré serait vide d'icônes → markers data layer cassés au load (404 silencieux).

**Mode Modifier forcé en Avancé** : quand l'utilisateur charge un ZIP existant via le drop zone (`_chargerZipModifier` → `_preRemplirFormulaire`), `_plannerMode === "modifier"` → `_appliquerPlannerMode` override le mode demandé et force `"avance"` + masque le switcher (`#kta-planner-mode-switcher.style.display = "none"`). Justification : passer en Simple en mode Modifier écraserait les customs / dataLayers / imageLayers / icons custom du plan source au `_genererZip` (= les sections cachées ne sont pas lues → arrays vides en sortie). Préserve l'intégrité du plan modifié.

#### 58.2 Éditeur légende plan-level (mode Avancé)

Nouvelle source de vérité **`plan-config.json > plan.customLegend`** (cascade niveau plan, lue par `LegendCustomization.loadPlanState()` au boot du plan). Format identique à `getSessionState()` : `{ schemaVersion, labels, hidden, customEntries }`.

**Architecture sans modifier `legendCustomization.js`** : l'éditeur `LC.ouvrirEditeur` mute la session courante (pas conçu pour un state externe). On utilise un **pattern de swap session ↔ plan** dans `_ouvrirEditeurLegendePlan` :

```js
function _ouvrirEditeurLegendePlan() {
  const LC = window.LegendCustomization;
  // 1. Sauvegarde la session courante
  const savedSession = LC.getSessionState();
  // 2. Charge le state plan dans la session pour permettre l'édition
  LC.loadSessionState(_plannerPlanLegend || null);
  // 3. Ouvre l'éditeur normal (qui mute la session)
  LC.ouvrirEditeur({
    onClose: function() {
      // 4. Capture du state édité
      _plannerPlanLegend = _plannerLegendStateNormalize(LC.getSessionState());
      // 5. Restore la session vraie
      LC.loadSessionState(savedSession);
      // 6. Refresh status display
      _plannerLegendStatus();
    }
  });
}
```

⚠️ **Side effect transient pendant l'édition** : la session est temporairement remplacée par le state plan en cours d'édition. Acceptable car le Générateur s'ouvre depuis le loader home (pas dans map mode) → l'user n'observe pas l'écart. Si on déplaçait le Générateur en map mode plus tard, il faudrait soit refactorer `LC.ouvrirEditeur` pour accepter un `stateOverride` + `onCommit`, soit suspendre les listeners visuels pendant le swap.

**Normalisation `_plannerLegendStateNormalize(state)`** : retourne `null` si tous les arrays/objects sont vides (zéro override). Évite de polluer `plan-config.json` avec un `customLegend: { labels:{}, hidden:{}, customEntries:[] }` inutile + cache PWA bumpé pour rien chez les utilisateurs.

**Status display `_plannerLegendStatus()`** : « ✏️ Personnalisée : N renommés · M masqués · K customs » (avec classe `.kta-planner-legend-status-actif` = accent ambre) ou « ✏️ Aucune personnalisation (cascade défaut MKM) » (gris muted).

**Pre-fill en mode Modifier** : `_preRemplirFormulaire` lit `config.plan.customLegend` du ZIP source, passe par `_plannerLegendStateNormalize`, assigne à `_plannerPlanLegend`, appelle `_plannerLegendStatus()` puis `_appliquerPlannerMode("avance")` (cohérence : si le plan source a une légende custom, l'user doit voir/éditer cette section).

**Embed au `_genererZip`** : juste après les flags conditionnels (multiLevel, tiledV2, georef) → `if (_plannerPlanLegend) planObj.customLegend = _plannerPlanLegend;`. Rétro-compat absolue : champ totalement absent sinon (pattern multiLevel — les versions ≤ v1.16.x ignorent un champ inconnu sans broncher).

#### 58.3 État global module

```js
let _plannerPlanLegend = null;  // null = pas de perso (cascade défaut MKM)
const PLANNER_MODE_LS_KEY = "myktamap_planner_mode";  // "simple" | "avance"
```

Reset `_plannerPlanLegend = null` au boot de chaque ouverture de modale (dans `afficherPlanner`).

#### 58.4 CSS ajouté (~140 lignes en fin de `css/style.css`)

| Classe | Rôle |
|---|---|
| `.kta-planner-mode-switcher` | Conteneur flex centré du segmented control |
| `.kta-planner-mode-btn` | Bouton mode (default ghost, `.kta-actif` = jaune charte + texte sombre + shadow) |
| `.kta-planner-mode-hint` | Phrase d'aide italique sous le switcher |
| `.kta-planner-legend-status` | Bloc status display (gris muted par défaut) |
| `.kta-planner-legend-status-actif` | État perso actif (fond accent ambre, texte saturé) |
| `.kta-planner-legend-actions` | Conteneur flex des 2 boutons (✏️ Modifier + 🔄 Reset) |

**Variants thème clair** : ~30 lignes `body.kta-theme-light` / `html.kta-theme-light` qui basculent sur les variables `--kta-light-*` (cf §53 pour le pattern complet). Couvre les 6 classes ci-dessus.

#### 58.5 Pièges & conventions

⚠️ **Ne PAS lire les sections cachées au `_genererZip`** : les sections Avancé sont seulement masquées en CSS (`display: none`), pas démontées du DOM. `_genererZip` lit toujours les inputs via `getElementById` → les valeurs sont récupérées même en mode Simple (= valeurs default vides). C'est l'effet voulu (un plan généré en Simple a zéro custom layer / icons / tracking custom / georef), mais à garder en tête si on ajoute un futur champ "avancé" qui nécessite une valeur non-vide pour fonctionner.

⚠️ **Ordre dans `_appliquerPlannerMode`** : on applique l'attribut `data-planner-mode` AVANT le toggle des boutons et l'auto-load icônes. Cela permet aux modules consommateurs de lire l'attribut dans leurs handlers `change`/`click` sans timing race.

⚠️ **Mode Modifier override sticky** : même si l'user a `localStorage["myktamap_planner_mode"] = "simple"`, `_appliquerPlannerMode` force `"avance"` dès que `_plannerMode === "modifier"`. Le sticky n'est PAS écrasé (l'user retrouvera Simple au prochain "Nouveau plan").

⚠️ **Swap session ↔ plan** : si une exception est levée dans `LC.ouvrirEditeur` AVANT le `onClose`, la session reste désynchronisée. Acceptable car l'éditeur est testé et stable depuis v1.16.0, mais à monitorer si on ajoute des features qui peuvent faire planter l'éditeur.

⚠️ **Pas exposé via API publique** : `_plannerPlanLegend` reste un état module-local. Si on a besoin d'y accéder depuis un autre module (ex: pour debug ou pour un futur "Export/Import légende plan-level seul"), il faudra exposer un getter `window.PlannerLegend = { get, set, reset, isEmpty }` au top du module.

#### 58.6 Pour étendre

**Ajouter un nouveau champ "avancé" dans le Générateur** :
1. Ajouter le HTML avec marqueur `data-planner-advanced="1"` sur le wrapper (section ou row selon granularité)
2. Lire la valeur dans `_genererZip` SANS supposer qu'elle est non-vide (= dégradation gracieuse en Simple)
3. Si la valeur en Simple DOIT être non-vide (ex: nouvelle feature obligatoire), ajouter un default raisonnable dans `_appliquerPlannerMode` quand mode === "simple"

**Migrer un champ "avancé" vers Simple** :
1. Retirer le marqueur `data-planner-advanced="1"` du wrapper
2. Tester que le mode Simple reste lisible (la section est ajoutée au layout)
3. Mettre à jour la doc utilisateur (`docs/README_USER.md`) + entrée AI_CONTEXT.md

**Plan-level UI pour une autre cascade** (ex: `plan.customIcons`) : suivre le pattern de swap dans `_ouvrirEditeurLegendePlan` — sauvegarde state courant, charge état plan, ouvre éditeur standard, capture au close, restore.

---

### 59. v1.18.0 — Roundtrip KMZ de la légende plan-level (depuis v1.18.0)

Suite directe de §58 (v1.17.0). La nouvelle source de vérité `PLAN_CONFIG.customLegend` (cascade niveau plan) voyage désormais avec le format KMZ exporté, pour permettre le partage cross-app de la personnalisation de légende d'un plan.

#### 59.1 Pattern d'embed : fichier annexe au doc.kml

Décision design (validée KARMA) : **fichier JSON séparé** dans le ZIP KMZ, pas un `<ExtendedData>` dans le `doc.kml`. Avantages :

- KML reste 100 % standard, lisible par toute app sans surcharge XML
- Plus simple à parser (1 `JSON.parse` vs un parcours DOM avec namespace custom)
- Extensible : on peut ajouter d'autres « extras » MyKTAMap dans le même fichier plus tard sans bumper la version du format

Pattern parallèle aux icônes embed (`files/icons/<tag>.png` côté export, regex `(?:^|\/)icons\/...` côté import) : on suit la même philosophie « fichier annexe ignoré par les apps tierces ».

#### 59.2 Format `myktamap-extras.json`

```json
{
  "type":         "myktamap-kmz-extras",
  "version":      1,
  "exportedAt":   "2026-05-24T22:00:00.000Z",
  "customLegend": {
    "schemaVersion":  1,
    "labels":         { "icones.salle": "Salle du fond", ... },
    "hidden":         { "zones.remblais": true, ... },
    "customEntries":  [ { id, label, category, geometry, lineColor, ... } ]
  }
}
```

**Wrapper extensible** : le top-level `{ type, version, exportedAt }` permet d'ajouter d'autres champs MyKTAMap futurs (`favoris`, `notes`, `customIcons`, etc.) sans changer la version 1 du format. Le `customLegend` est strictement le retour de `LegendCustomization.getSessionState()`.

#### 59.3 Export (`kmzExport.js > genererKmz`)

Nouveau champ `opts.planCustomLegend`. Si présent et de type `"object"`, embed dans le ZIP juste après `zip.file("doc.kml", kml)` :

```js
if (opts.planCustomLegend && typeof opts.planCustomLegend === "object") {
  const extras = {
    type:          "myktamap-kmz-extras",
    version:       1,
    exportedAt:    new Date().toISOString(),
    customLegend:  opts.planCustomLegend
  };
  zip.file("myktamap-extras.json", JSON.stringify(extras, null, 2));
}
```

#### 59.4 UI Export (`sessionExporter.js > _kmzRenderContenu` + `_exportKmz`)

Nouvelle checkbox via helper `row(id, label, count, checked)` :

```js
row("kmz_inc_legend",
    "🏷️ Légende personnalisée du plan",
    hasCustomLegend ? 1 : 0,
    hasCustomLegend)
```

Détection `hasCustomLegend` via IIFE qui check `labels/hidden/customEntries` non-vides dans `window.PLAN_CONFIG.customLegend`.

Passage à `genererKmz` via opts :

```js
planCustomLegend: (function() {
  if (!document.getElementById("kmz_inc_legend")?.checked) return null;
  const cl = window.PLAN_CONFIG && window.PLAN_CONFIG.customLegend;
  if (!cl || typeof cl !== "object") return null;
  return cl;
})()
```

#### 59.5 Import (`kmzImport.js > genererZipMyktamap`)

`extraireKmz` (ligne 82) capture **déjà** tous les fichiers non-KML dans `assets` sans filtre → `myktamap-extras.json` est automatiquement disponible dans `opts.assets`, aucune modif à l'extraction.

Dans `genererZipMyktamap`, juste après les flags `multiLevel`/`tiledV2` (vers ligne 600), détection + parse + injection :

```js
const extrasKey = Object.keys(opts.assets).find(function(p) {
  return /(?:^|\/)myktamap-extras\.json$/i.test(p);
});
if (extrasKey) {
  try {
    const txt = await opts.assets[extrasKey].text();
    const extras = JSON.parse(txt);
    if (extras && extras.customLegend && typeof extras.customLegend === "object") {
      planConfig.plan.customLegend = extras.customLegend;
    }
  } catch(e) {
    console.warn("[KmzImport] ⚠️ Échec parse myktamap-extras.json (ignoré) :", e);
  }
}
```

**Matching tolérant** : regex `(?:^|\/)myktamap-extras\.json$/i` capture le fichier qu'il soit à la racine du ZIP ou dans un sous-dossier, et insensible à la casse (certains zip-writers normalisent les noms).

#### 59.6 Cascade après import

Le ZIP MyKTAMap reconstruit contient désormais `plan-config.json > plan.customLegend`. Au boot du plan importé, `js/main.js > initApp` appelle `LegendCustomization.loadPlanState()` qui lit `window.PLAN_CONFIG.customLegend` et le normalise en `_planState`. La cascade `session > plan > default` applique alors automatiquement les overrides à tous les `getLabel` / `isVisible` (cf §56.2 et CLAUDE.md §LegendCustomization).

**Pas de hook spécifique à ajouter** : la cascade est déjà en place depuis v1.16.0, on ne fait que rendre `plan.customLegend` populated automatiquement après un round-trip KMZ.

#### 59.7 Compat externe + skip silencieux

✅ **Apps tierces compatibles** (Google Earth, OsmAnd, Avenza, ArcGIS Earth, Locus, Strava) : ignorent les fichiers inconnus du ZIP KMZ sans broncher. Le `doc.kml` reste valide standard. Aucun warning, aucune erreur côté lecteur tiers.

✅ **KMZ MyKTAMap < v1.18.0** : `extrasKey` est `undefined` → skip silencieux. Le ré-import fonctionne exactement comme avant (= légende défaut MKM côté re-importeur).

✅ **Fichier corrompu** : `JSON.parse` throw dans le `try` → catch + warn console + skip. Le reste de l'import KMZ continue normalement (= le ZIP reconstruit est utilisable, juste sans customLegend).

✅ **Champ `customLegend` absent ou non-objet** : skip silencieux. Évite d'injecter une valeur garbage dans `planConfig.plan.customLegend`.

#### 59.8 À NE PAS faire

- ❌ **Ne pas filtrer les fichiers dans `extraireKmz`** sous prétexte de "ne capturer que les images" — cela casserait notre récupération de `myktamap-extras.json` (et toute future feature qui ajouterait d'autres extras).
- ❌ **Ne pas mettre la checkbox UI dans la modale Export PNG** — c'est spécifique au format KMZ (= partage cross-app). Le PNG export n'a pas de notion de plan-config.
- ❌ **Ne pas tenter d'embarquer la session-level customLegend** (cascade session) — décision design KARMA validée : seul le niveau plan voyage avec le KMZ. La session reste éphémère par définition, pas pertinente pour un destinataire.
- ❌ **Ne pas écraser un `plan.customLegend` existant** dans `planConfig.plan` sans warn — pour l'instant on écrase en aveugle car `genererZipMyktamap` part d'un planConfig neuf. Si plus tard on supporte un mode "merge KMZ avec un plan existant", revoir cette logique.

#### 59.9 Pour étendre (futurs extras)

**Pour ajouter un nouveau champ "extra" embarqué dans le KMZ** (ex: `favoris`, `customIcons`, `notes`) :

1. **Export** : ajouter `opts.<nom>` dans `genererKmz`, l'inclure dans l'objet `extras` du même `myktamap-extras.json` (pas créer un nouveau fichier — on garde **un seul** fichier extras pour limiter la surface).
2. **UI** : ajouter une checkbox dans `_kmzRenderContenu` (idem pattern `kmz_inc_legend`), passage conditionnel dans `_exportKmz`.
3. **Import** : dans le bloc de parse existant de `myktamap-extras.json`, ajouter `if (extras.<nom>) { ... }` qui injecte dans le bon endroit du `planConfig` reconstruit.
4. **Bump version** : si le nouveau champ change la sémantique du parsing (ex: nouveau schéma incompatible), bumper `version: 2` dans l'extras + lire la version au parse pour gérer les 2 cas. Sinon `version: 1` reste.
5. **Doc** : update §59.2 (format), CLAUDE.md, README.md, AI_CONTEXT.md.

#### 59.10 v1.18.1 — Extension au format GPX + preview d'import (KMZ + GPX)

Cette release étend le pattern §59 au format GPX et ajoute la visibilité côté preview d'import.

**Format GPX embed** : `<extensions>` standard GPX 1.1 sous `<metadata>` (PAS un fichier annexe — GPX est un XML monolithique, pas un ZIP). Namespace `xmlns:myktamap="https://myktamap.fr/gpx/ext/v1"` déclaré au root `<gpx>`. La balise `<myktamap:customLegend>` contient le payload wrapper JSON sérialisé + escapé XML (identique au KMZ).

```xml
<gpx ... xmlns:myktamap="https://myktamap.fr/gpx/ext/v1">
  <metadata>
    <name>...</name>
    <desc>...</desc>
    <extensions>
      <myktamap:customLegend>{"type":"myktamap-gpx-extras","version":1,"customLegend":{...}}</myktamap:customLegend>
    </extensions>
  </metadata>
  ...
</gpx>
```

**Parser tolérant au namespace** (`gpxIO.js > parser`) : scan des enfants directs de `<extensions>` via `localName === "customlegend"` (case insensitive). Permet de lire correctement même si l'user a édité le GPX à la main sans déclaration `xmlns:myktamap` propre.

**`importer()` (session) ignore silencieusement** : `customLegend` extraite par le parser n'est jamais appliquée au scope session — c'est strictement plan-level. Seul `gpxImport.js > genererZipMyktamap` (reconversion en ZIP MyKTAMap autonome) l'injecte dans `planConfig.plan.customLegend`.

**Preview d'import KMZ + GPX** (`createConf.js` :
- `_kmzImpAnalyserFichier` (KMZ) : parse async de `myktamap-extras.json` extrait par `extraireKmz`, affichage dans le résumé
- `_gpxImpAnalyserFichier` (GPX) : lecture directe de `parsed.metadata.customLegend` (déjà extrait par `gpxIO.js > parser`)

Format d'affichage uniforme :
```html
<div style="color:#6ce28a;">
  ✅ <strong>Légende personnalisée du plan détectée</strong> :
  N renommés · M masqués · K customs
  <span>(restaurée au boot du plan reconstruit)</span>
</div>
```

**À NE PAS faire pour GPX** :
- ❌ **Ne pas mettre `<myktamap:customLegend>` au top-level `<gpx>`** — le schéma GPX 1.1 n'autorise pas des éléments arbitraires au root. Toujours sous `<metadata>/<extensions>`.
- ❌ **Ne pas appliquer `customLegend` dans `gpxIO.js > importer`** — l'import session ne doit jamais muter `PLAN_CONFIG.customLegend` (= cascade plan, pas session). La cascade serait écrasée silencieusement à chaque import GPX, mauvaise UX.
- ❌ **Ne pas hardcoder le namespace `xmlns:myktamap`** dans le parser — utiliser `localName` + endsWith pour tolérer les GPX édités à la main.

---

### 60. v1.19.0 — Memory Inspector (transparence + debug)

Module `js/memInspector.js` (~580 lignes IIFE) → `window.MemInspector = { ouvrir, fermer, collecter, formatBytes, getReportText }`. Outil de transparence + debug accessible depuis ⚙️ Configuration loader > nouvelle section « 📊 Inspecteur ». Aucune écriture, lecture locale uniquement.

#### 60.1 Architecture & collecte async

`collecter()` retourne `Promise<Report>` avec 5 sections collectées en parallèle via `Promise.all` (sauf `localStorage` qui est synchrone) :

```js
async function collecter() {
  const ts = new Date().toISOString();
  const runtime = _collectRuntime();          // sync
  const localS  = _collectLocalStorage();     // sync
  const [idb, cachePwa, storageEst] = await Promise.all([
    _collectIndexedDB(),
    _collectCachePWA(),
    _collectStorageEstimate()
  ]);
  return { timestamp, runtime, localStorage, indexedDB, cachePWA, storageEstimate };
}
```

**Tolérance aux APIs absentes** : chaque collecte est wrappée dans `try/catch` + retourne un champ `error` (string) si une API échoue. Le rendu UI affiche un `⚠️` warning sur la section concernée mais le reste de la modale reste fonctionnel. Aucune section ne peut planter la modale entière.

#### 60.2 Filtrage localStorage

`_collectLocalStorage` itère `localStorage.length` puis filtre par regex `/^myktamap_/i` + exceptions (`app_user_prefs`, `kta_*`). Taille calculée en bytes via `value.length * 2` (UTF-16 = 2 bytes/char en moyenne — approximation suffisante pour un topo, pas un audit byte-exact). Tri décroissant par taille.

**À NE PAS faire** : itérer tout `localStorage` sans filtre — risque de leak de clés d'autres apps si le user navigue sur d'autres sites depuis le même profil browser (web SDKs publicitaires, etc.).

#### 60.3 IndexedDB : 3 bases connues + scan natif

```js
const KNOWN_IDB_DBS = [
  { name: "myktamap_handles", stores: ["handles", "blobs"] },
  { name: "myktamap_backups", stores: ["backups"] },
  { name: "myktamap_photos",  stores: ["photos"] }
];
```

**Pattern hybride** : tente d'abord `indexedDB.databases()` (Chrome 71+, Firefox 126+) pour découvrir les bases présentes. Si dispo, on filtre les `KNOWN_IDB_DBS` aux bases effectivement détectées + on ajoute les bases tierces inattendues. Si l'API native est indispo (Safari, vieux Firefox), fallback : on tente d'ouvrir toutes les bases connues (peut créer une base vide si elle n'existait pas — acceptable pour un outil de debug).

Pour chaque base : `_openDb(name)` → `db.transaction([storeName], "readonly")` → `objectStore.count()`. **Read-only strict** : pas de read des entries (= économie mémoire + privacy).

#### 60.4 Cache PWA

`caches.keys()` puis détection du cache actif via `window.__MKM__.build` → `myktamap-cache-<build>` (fallback regex `/^myktamap-cache-/`). Pour le cache actif : `caches.open(name).keys()` puis échantillon des **12 premiers assets** (URLs pathname only via `new URL(r.url).pathname`). Le tronquage à 12 évite l'info overload pour les sessions avec 100+ assets cachés.

**Pas de read des blobs** : `caches.match()` ne sert jamais ici, seulement `.keys()` pour les URLs.

#### 60.5 Storage estimate

`navigator.storage.estimate()` → `{ usage, quota }`. Calcul `usagePct = usage / quota * 100`. Affiché avec barre gradient CSS `linear-gradient(90deg, #6ee28a 0%, #f4c542 70%, #ff8c8c 100%)` → la couleur passe du vert au rouge selon le % d'usage, signal visuel intuitif quand l'utilisateur s'approche du quota.

#### 60.6 Runtime : modules + plan + session + APP_CONFIG

`KNOWN_MODULES` = liste hardcodée de 27 noms (`PlanRegistry`, `SessionPersist`, `MemInspector`, etc.). Pour chacun : check `window[name] != null`. Sépare entre `modulesLoaded` (présents) et `modulesMissing` (absents). Les manquants apparaissent en `⚠️` warning rouge dans l'UI — utile pour diagnostiquer un problème de chargement (ex: balise `<script>` qui rate, fichier manquant du cache PWA, etc.).

**Plan chargé** : lecture défensive de `window.PLAN_CONFIG.plan.{name, version, author, imageWidth, imageHeight, multiLevel, tiledV2, customLegend}` + `imageLayers.length` + `dataLayers.length`.

**Session active** : appel des getters publics (`getEditorPoints`, `getRoads`, `getZones`, `getStructures`, `getMeasurePoints`, `getTrackingActif`) si présents. Filter sur `r.type === "itinerary"` pour détecter un itinéraire actif. Tout dans `try/catch` — l'inspecteur peut être lancé depuis le loader home (sans plan chargé), tous les getters retournent alors `undefined` → 0 partout, pas d'erreur.

**APP_CONFIG** : extract des champs pertinents UNIQUEMENT (debugMode, perfPreset, scaledMarkers, showRoadIntersections, multiLevel, activeLevel) — pas tout l'objet (info overload).

#### 60.7 UI Modale & sections

Modale `.kta-readme-modal-overlay` standard. Boîte `.kta-mem-inspector-boite` spacieuse :
- 720px (mobile)
- 920px (PC ≥ 1024px)
- 1100px (PC ≥ 1440px)

**Sections card-stack** : chaque section a une classe `.kta-mem-section` (fond léger + border ambre). Header `.kta-mem-section-titre` avec emoji + libellé + pastille total à droite (`.kta-mem-total`).

**Tableau localStorage** (`.kta-mem-table`) : 2 colonnes (Clé / Taille). Sous chaque clé, mini-barre `.kta-mem-bar-wrap > .kta-mem-bar-fill` avec largeur proportionnelle au % de la taille totale → visualisation intuitive de ce qui consomme le plus.

**Tags colorés** :
- `.kta-mem-tag` (ambre) : flag d'option activée
- `.kta-mem-tag-on` (vert) : état actif (tracker ON, iti actif)
- `.kta-mem-tag-warn` (rouge) : warning (debug ON)
- `.kta-mem-tag-dim` (gris) : info passive

**Barre quota** (storage estimate) : `.kta-mem-quota-bar > .kta-mem-quota-fill` avec gradient vert → jaune → rouge selon `width: <usagePct>%`.

**Footer** : 🔄 Rafraîchir (relance `collecter()` + re-render) + 📋 Copier le rapport.

#### 60.8 Rapport texte (Copier)

`getReportText(rep)` formate l'intégralité en texte plain markdown-like prêt à coller dans Discord / mail / GitHub. Format avec séparateurs ASCII `─────────────────────────────────────────` + emojis pour repères visuels. Hiérarchie indentée 2 spaces.

**Clipboard write** :
```js
function _copyToClipboard(text) {
  if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
    return navigator.clipboard.writeText(text);
  }
  // Fallback execCommand pour les contextes non-sécurisés HTTP
  return new Promise(function(resolve, reject) {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.focus(); ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    if (ok) resolve(); else reject(new Error("execCommand copy failed"));
  });
}
```

Feedback visuel : bouton "📋 Copier le rapport" → "✅ Copié !" pendant 1800ms après succès.

#### 60.9 Pièges & conventions

⚠️ **Ne PAS faire de read d'entries IndexedDB** dans la collecte — risque de RAM blow-up sur une base avec 10 000 entries. `objectStore.count()` est O(1) et suffit pour un topo.

⚠️ **Ne PAS exposer les valeurs localStorage** dans la modale — c'est un risque de leak si l'utilisateur fait un screenshot. On expose seulement la clé + la taille.

⚠️ **Filtrer le prefix MyKTAMap strict** dans localStorage — éviter les clés d'autres apps (cf §60.2).

⚠️ **L'inspecteur peut être ouvert depuis la home** (= pas de plan chargé). Tous les getters d'annotations doivent être defensif (`if (typeof window.getX === "function")`) sinon l'inspecteur plante au loader.

⚠️ **Modale empilée sur Configuration** : même z-index `99999`, ouverture en DOM order → MemInspector passe au-dessus de Configuration. Au close, l'utilisateur retrouve Configuration intacte (Configuration ne se ferme pas).

⚠️ **Pas de polling automatique** : la collecte est manuelle (à l'ouverture + au clic 🔄 Rafraîchir). Pas de tick périodique qui pourrait alourdir la perf. L'utilisateur fait l'effort explicite si besoin.

#### 60.10 Pour ajouter une nouvelle section au rapport

1. Créer la fonction `_collectXxx()` (async ou sync) qui retourne `{ ...data, error?: string }`
2. L'ajouter dans `collecter()` (dans le `Promise.all` si async, ou en assignation directe si sync)
3. Ajouter le rendu HTML dans `_renderReport(rep)` (nouvelle section card-stack)
4. Ajouter la sortie texte dans `getReportText(rep)` (nouvelle section avec séparateur)
5. Si nouvelle UI : ajouter CSS dans la zone `🆕 v1.19.0 — Memory Inspector` de `style.css` + variants thème clair

**Exemples de futures sections candidates** : Service Worker state (`navigator.serviceWorker.getRegistration()` → scope, controlling/installing/waiting), History stack (`HistoryManager.canUndo/canRedo` + nb d'entries en pile), Backups recents details (lecture des 3 derniers backups via `SessionBackups.listAll`).

---

### 61. v1.20.0 — Polish UX + DX (3 améliorations indépendantes)

Release MINOR de qualité, 3 sujets indépendants regroupés.

#### 61.1 Aide intégrée enrichie (`js/interface.js > afficherAide`)

2 nouvelles sections ajoutées à la modale 📚 Aide / Doc :

- **📊 Inspecteur mémoire (v1.19.0)** — 7 puces qui détaillent les 5 sections de la modale Memory Inspector + le bouton 📋 Copier le rapport. Cas d'usage debug explicites + précision « 100 % local, aucune donnée transmise ».
- **🏷️ Légende personnalisable (v1.16.0 + v1.17.0 + v1.18.x)** — 7 puces qui synthétisent la cascade complète : 3 niveaux (session > plan > défaut MKM), 2 points d'édition (session via Export PNG / map mode, plan-level via Générateur Avancé), 4 catégories couvertes (icônes / tracés / zones / structures), roundtrip KMZ + GPX, détection au preview d'import.

Placement : entre « 📊 Stats session enrichies » et « 🎬 Replay tracker » pour regrouper les outils de visualisation/transparence.

Bonus : enrichissement section existante « 🏗️ Créer / Modifier un plan » avec mention du Mode Simple/Avancé (cf §58).

#### 61.2 Update Checker en vrai semver (`js/updateChecker.js`)

Nouveau helper interne `compareSemver(a, b)` :

```js
function compareSemver(a, b) {
  function _parse(v) {
    if (v == null) return [0];
    const clean = String(v).replace(/^v/i, "").split("-")[0];
    return clean.split(".").map(function(n) {
      const x = parseInt(n, 10);
      return isNaN(x) ? 0 : x;
    });
  }
  const pa = _parse(a);
  const pb = _parse(b);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const na = pa[i] || 0;
    const nb = pb[i] || 0;
    if (na > nb) return  1;
    if (na < nb) return -1;
  }
  return 0;
}
```

**Anti-bug latent** : `"v1.7.10" < "v1.7.9"` en string (lexicographique). Pas un bug aujourd'hui (`check()` n'utilise que `===`), mais protège contre toute future utilisation de `<` ou `>`.

**Nouveau cas géré dans `check()`** : downgrade serveur. Si `compareSemver(remote.version, known) < 0` → on retourne `{ status: "downgrade-detected" }` sans afficher la modale d'update et SANS mettre à jour `_setKnownVersion` (on garde la version installée comme référence pour ne pas perdre le repère semver de l'user).

**API publique** : `window.UpdateChecker.compareSemver(a, b)` exposé. Formats acceptés :
- `"v1.7.10"` (avec prefixe v)
- `"1.7.10"` (sans prefixe)
- `"v1.7.10-fix2"` (suffix après `-` ignoré → `[1, 7, 10]`)
- `"v143"` (legacy pré-v1.7.1, traité comme `[143]`)

`showCurrent()` (déclenchée au clic badge version footer) utilise aussi `compareSemver` : `_cmpShow <= 0` → message neutre "à jour" (= égalité OU downgrade serveur → pas de fausse promesse d'upgrade).

#### 61.3 Force update auto-proposé sur mismatch CACHE_NAME (`index.html`)

Nouveau hook dans `index.html` (script SW register) :

```js
let _swIsInitialControl = !navigator.serviceWorker.controller;
navigator.serviceWorker.addEventListener("controllerchange", function() {
  if (_swIsInitialControl) {
    _swIsInitialControl = false;
    return; // Premier install — pas de toast
  }
  // Vraie update : un ancien controller a été remplacé
  if (window.OOMGuard && typeof window.OOMGuard.showToast === "function") {
    window.OOMGuard.showToast(
      "🔄 Mise à jour mineure appliquée — assets fraîchement rechargés.",
      "info"
    );
  }
});
```

**Pourquoi ça marche** : le SW MyKTAMap fait déjà `self.skipWaiting()` au install (sw.js ligne 254) + `self.clients.claim()` au activate (ligne 277). Donc dès qu'un nouveau SW s'install (bump CACHE_NAME serveur), il prend immédiatement le contrôle des pages ouvertes → `controllerchange` fire dans la session courante.

**Garde-fou `_swIsInitialControl`** critique : `navigator.serviceWorker.controller === null` au premier load (= page pas encore contrôlée). Le SW arrive après l'install, fire `controllerchange` pour la PREMIÈRE fois → c'est l'install initial, PAS une mise à jour. On skip ce premier événement, sinon on afficherait un toast trompeur au tout premier lancement PWA.

**Bonus traçabilité** : hook `reg.addEventListener("updatefound")` qui log l'état du nouveau SW en console à chaque transition. Visible dans 🐛 Logs détaillés (debugMode ON). Aide à diagnostiquer le cas où un nouveau SW s'install mais reste en "installed" sans atteindre "activated" (= bug du SW lui-même).

#### 61.4 À NE PAS faire

- ❌ **Utiliser `<` ou `>` direct sur des strings de version** — toujours passer par `UpdateChecker.compareSemver()`. Si tu vois un `if (v1 < v2)` quelque part avec des strings semver, c'est un bug latent.
- ❌ **Skip le garde-fou `_swIsInitialControl`** — sans lui, le toast "Mise à jour mineure" apparaîtrait au tout premier lancement PWA de chaque user (= trompeur, ce n'est pas une mise à jour, c'est juste l'install).
- ❌ **Notifier l'user d'une "mise à jour" sans bumper CACHE_NAME** — le toast ne fire que si le SW change. Si on push juste des fichiers non-cachés (genre `alert.json`, `version.json`), aucun toast → c'est cohérent (pas une mise à jour du code applicatif).
- ❌ **Mettre à jour `_setKnownVersion` lors d'un downgrade-detected** — on garderait alors la version OLDER comme référence et au prochain check, la même "downgrade" serait re-détectée. Pattern : ne pas écraser `_knownVersion` quand `cmp < 0`.

#### 61.5 Cycle dev avec CACHE_NAME suffixes

Pendant le dev d'une release (validation terrain entre fixes), pattern utilisé :
- Release initiale : `CACHE_NAME = "myktamap-cache-v1.X.Y"`
- Fix 1 (CSS, sans bump version visible) : `myktamap-cache-v1.X.Y-fixes`
- Fix 2 : `myktamap-cache-v1.X.Y-fixes2`
- Etc.

Quand la release finale est mergée sur main, on règle le CACHE_NAME au format final propre (sans suffix). Cf bump v1.20.0 qui reset `-fixes2` → `-` plus rien.

Le toast `controllerchange` fire à chaque bump du suffix → l'user voit clairement que des fixes mineurs ont été appliqués entre 2 sessions sans avoir à comprendre la mécanique CACHE_NAME / SW.

---

### 55. GpxImport — Reconversion GPX → ZIP MyKTAMap (depuis v1.15.0)

Module `js/gpxImport.js` (~310 lignes IIFE) → `window.GpxImport = { estGpxMyktamap, extraireGpx, extraireBoundsGps, genererCanvasVierge, ingestParsed, genererZipMyktamap }`.

**Pendant exact de `js/kmzImport.js`** (cf §32 bis) pour le format GPX. Couple symétrique gpxIO (export+import session) ↔ gpxImport (reconversion en ZIP autonome).

#### 55.1 Spécificité GPX vs KMZ : pas d'image plan

Un KMZ contient un `<GroundOverlay>` qui pointe vers une image de plan — c'est cette image qui sert de baseImage au ZIP MyKTAMap reconstruit. Un **GPX, lui, n'a que des coordonnées GPS** sans support d'image plan natif.

Solution v1.15.0 : **génération automatique d'un canvas vierge** aux dimensions choisies par l'user (4000×4000 par défaut, 4 couleurs : sépia/blanc/gris/noir). Le canvas est calibré sur les bounds GPS du GPX :

- **Coin BL** du canvas (x=0, y=H) ↔ `(lat_min, lng_min)`
- **Coin TR** du canvas (x=W, y=0) ↔ `(lat_max, lng_max)`
- Marge de 5% autour pour éviter que les annotations soient pile sur les bords

Le calibrage `pointA` + `pointB` est embarqué dans `plan-config.json > plan.georef`, propagé vers `KmzExport.setCalibration` au load via `main.js > _propagerGeorefVersKmzExport`. L'user peut ensuite remplacer le canvas par une vraie image en mode Modifier le plan.

#### 55.2 Détection GPX MyKTAMap

`estGpxMyktamap(gpxDoc)` retourne `true` si :
1. Attribut `creator="MyKTAMap…"` sur la racine `<gpx>`
2. **OU** `<metadata><author><name>MyKTAMap…</name>`
3. **OU** présence d'au moins un `<cmt>MyKTAMap level=N</cmt>` (signature posée par gpxIO.js > _genererGpx)

Si non-MyKTAMap : warn dans le résumé mais pas blocking (l'user peut quand même générer un ZIP, les tags/types par défaut s'appliqueront aux Placemarks orphelins).

#### 55.3 Calcul des bounds GPS

`extraireBoundsGps(parsed)` itère sur **tous** les `wpt.lat/lng` et `trkpt.lat/lng` pour calculer `latMin`, `latMax`, `lngMin`, `lngMax`. Marge de 5% appliquée (avec fallback 0.0005° si Δ = 0). Retourne `null` si aucune coordonnée valide trouvée.

#### 55.4 Ingestion parsed → points / roads

`ingestParsed(parsed, transform, opts)` utilise `window.KmzExport.gpsToPlan(t, lat, lng)` pour la transformation inverse (GPS → pixels). Préservations :

- **Tag points** depuis `<sym>` ou `<type>`, fallback `opts.pointTag` ou `"default"`
- **Type tracés** depuis `<type>` parmi `{principal, secondaire, chemin, itinerary, jonction}`, fallback `opts.roadType` ou `"chemin"`
- **Levels M-LVL** depuis `<cmt>MyKTAMap level=N</cmt>` sur waypoints ET tracks
- **Descriptions** depuis `<desc>` sur waypoints ET tracks
- **Filtre bounds** : points hors `[−50, W+50] × [−50, H+50]` rangés dans `stats.outOfBounds`

#### 55.5 Restauration des icônes

Pareil que `kmzImport.js > hotfix4+hotfix10` : fetch `icon/<tag>.png` depuis l'app courante pour chaque tag rencontré dans les points. `icon/iconetrack.png` toujours embarqué (default + track). Cached SW → marche offline.

#### 55.6 Options optionnelles V2 + M-LVL

Identiques au flow KMZ (cf §32 bis) :

- **`opts.tilingV2`** → re-tile le canvas vierge en tuiles 512×512 via `window.MyKTAMapTilingV2` (exposée par createConf.js). Utile uniquement si l'user prévoit de remplacer le canvas par une grande image ensuite ; sinon V1 plat suffit pour un canvas vide.
- **`opts.multiLevel`** → ajoute `plan.multiLevel = true` au JSON (utile si le GPX MyKTAMap contenait des annotations multi-niveau).
- **`opts.onTilingProgress(done, total, currentZ)`** → callback de progression pour l'overlay UI.

#### 55.7 UI : `_afficherImporterGpx` dans createConf.js

Modale mirroir de `_afficherImporterKmz` (mêmes classes `.kta-kmz-imp-boite`, mêmes patterns visuels). Diffère sur :

- Pas de section "calibrage extracté" — le calibrage est automatique
- Section "Canvas vierge" : 2 inputs dimensions + 4 radios couleur
- Section "Types par défaut" : 2 dropdowns (point tag + road type), pas de zone (GPX n'a pas de polygons)

Exposée via `window.afficherImporterGpx = _afficherImporterGpx`.

#### 55.8 Routing depuis les drop zones

- `index.html > #zipDropZone` (loader home) : détecte `.gpx` → appelle `window.afficherImporterGpx(file)`
- `js/createConf.js > _routerFichierImport` (drop zone générateur) : pareil

Les 2 drop zones acceptent désormais `.zip` / `.kmz` / `.gpx` avec routing automatique. Pas d'erreur UX si l'user dépose un GPX là où il s'attendait à mettre un ZIP — l'app le route automatiquement vers la bonne modale.

#### 55.9 ZIP MyKTAMap généré

Structure finale :

```
plan_<nom>_from_gpx.zip
├── plan-config.json    (avec plan.georef pour propagation auto)
├── data/
│   ├── baseImage.png   (canvas vierge généré)
│   └── imported.json   (data layer "imported" : points + roads)
└── icon/
    ├── iconetrack.png  (default + track)
    └── <tag>.png       (1 par tag rencontré, fetched depuis l'app)
```

Le ZIP est strictement compatible avec les autres pipelines (chargement classique, mode Modifier, Export externe, etc.) — c'est un ZIP MyKTAMap normal.

---

### 62. v1.21.2 — Tracker session + Heatmap pertinente + GPS popup + Urgences (depuis v1.21.2)

Release PATCH consolidée (bump Z : 1.21.1 → 1.21.2). 7 sujets indépendants regroupés pour polish post-v1.21.1.

#### 62.1 Tracker timeline dans export session

`sessionExporter.js` Full + Avancé incluent désormais `session.tracker = {position, path, timeline, startTs}` (auparavant tracker entièrement exclu).

`sessionPersist.js` enrichit le payload localStorage :
```js
payload.trackerTimeline = window.getTrackingTimeline?.() || [];
payload.trackerStartTs  = window.getTrackingStartTs?.()  || null;
```

Restore au boot via `window.setTrackingTimeline(payload.trackerTimeline, payload.trackerStartTs)` (cf §50.5 pour le setter avec filtrage défensif).

**Conversion ed2data IGNORE le tracker** (volontaire) : un data layer est figé dans le plan, un tracker est par essence éphémère + utilisateur-spécifique. Inclure le tracker dans `data/<plan>/imported.json` créerait des données fantôme à chaque réouverture.

#### 62.2 Heatmap refonte majeure

**6 sources togglables** (vs 3 en v1.12.0) : `tracker timeline` / `editor points` / `roads` / `zones` / `structures` / `dataLayers`.

**Pattern collecteur → segments** : chaque collecteur retourne un array de segments `[{a:{x,y}, b:{x,y}|null}]`. Si `b === null` → segment dégénéré (point isolé). Permet d'interpoler la chaleur le long des polylines/polygones, pas juste sur les vertices.

**Interpolation** : pas de `radius × 0.33` entre `a` et `b`. Pour `radius=40px` → 1 point heat tous les ~13px le long du segment.

**Normalisation post-additive** : après accumulation additive de tous les gradients (composition `lighter`), pixel-walk de la canvas avec `getImageData` → trouve `maxAlpha` → normalise toutes les valeurs en `(alpha/maxAlpha) × 255`. Évite les hot-spots écrasants quand 100 sources se cumulent au même endroit.

**Filtre timeline défensif** : skip les entries de type `recalage` (téléportation = pas un déplacement réel), `start` (point de départ artificiel), et tout `gap > 5min` entre 2 entries consécutives (= pause utilisateur, pas une route empruntée à grande vitesse).

**Reset au plan switch** : `main.js > _libererRessourcesPlanPrecedent` appelle `window.Heatmap.effacer()` (cohérence avec les autres modules level-aware).

⚠️ **Quand on ajoute une nouvelle source au collecteur** : retourner toujours le format `[{a, b}]` (pas `[{x, y}]`), même pour des points isolés (`b: null`). Sinon l'interpolation ne marche pas et le rendu est creux.

#### 62.3 GPS popup POI

`utils.js > buildPointPopupHtml` ajoute une ligne `🌐 coords GPS lat, lng` (cliquable, copie au presse-papier) SI le plan est calibré.

3 helpers ajoutés :
- `_planXyToGps(x, y)` → `{lat, lng}` ou `null` (lookup `KmzExport.getCalibration(planId)` + `buildTransform` on-demand, cf §32.7)
- `_formatGps(lat, lng)` → `"43.6047, 1.4442"` (4 décimales, ~11m de précision)
- `window.kta_copierGps(lat, lng)` → exposé global pour le `onclick` du span GPS dans le popup. Utilise `navigator.clipboard.writeText` avec fallback `execCommand("copy")`.

Skip silencieux si plan non calibré (= la ligne `🌐` n'apparaît pas du tout, pas de placeholder vide).

#### 62.4 Fix mode urgence calibrage GPS

`emergencyMode.js > _tick` : clone exact du fix v1.21.1 #1 (transform jamais persisté). Avant : `calib.transform` cherché directement → toujours `undefined` → bloc GPS toujours masqué. Après : `buildTransform` on-demand.

⚠️ **Critique sécurité** : le bloc GPS du mode urgence est l'info principale pour qu'un utilisateur perdu puisse communiquer sa position à des secours externes (Google Maps, GPS standalone, etc.). Le bug le rendait inutilisable.

#### 62.5 Flyout sidebar étendu au Tracker

Groupe 🧭 Tracker (`interface.js`) passe en `useFlyout: true`. Auparavant cascade verticale (sous-actions empilées sous le bouton principal) → désormais panel latéral (pattern §56.3).

Profite des nouveaux patterns v1.21.2 :
- `dynamicIcon` : icône Play/Stop dynamique (▶️ ↔ ⏹️)
- `isActive` : la sous-action tracker brille en vert (`kta-actif`) quand le tracking tourne
- `cssClass` propagation : permet de styler chaque sous-action individuellement

Détails complets dans §56.3 (sous-section v1.21.2 ajoutée).

#### 62.6 Urgences en fin de sidebar, fond rouge

Réordonnancement visuel : les sous-actions urgences (`🚨 Je suis perdu`, `🚨 Panique`) sont déplacées en FIN de sidebar avec fond rouge pulsant (CSS `kta-emergency-btn`).

Cohérence avec le pattern UX général : actions critiques en zone facilement accessible (bas-droite pour droitier) + signalisation visuelle forte (rouge + pulse).

#### 62.7 WakeLock global — `js/wakeLock.js`

Nouveau module IIFE (~150 lignes) → `window.WakeLock = { acquire, release, toggle, isActive, isSupported, onChange }`.

Wraps `navigator.wakeLock.request("screen")` :
- Toggle ☑️ « Garder l'écran allumé » dans **2 endroits synchronisés** (pattern identique au toggle thème §53) :
  1. ⚙️ Réglages map mode
  2. ⚙️ Configuration home
- Persiste `localStorage["myktamap_wake_lock_v1"]` (boolean)
- **Re-acquire automatique sur `visibilitychange`** : navigateurs libèrent le wake lock quand l'onglet perd le focus → on le ré-acquiert au retour au premier plan (sinon l'user croit que ça marche mais l'écran s'éteint après un blur/refocus)
- Skip silencieux si API indispo (Safari < 16.4, vieux Firefox)

⚠️ **Différent du wake lock du mode urgence** (§ Wake Lock dans emergencyMode.js, hardcoded à l'activation/désactivation du mode). Le module global vit indépendamment et reste actif même hors mode urgence.

#### 62.8 Sources de vérité v1.21.2

- `version.json` → `"v1.21.2"`
- `js/copyright.js > __MKM__.build` → `"v1.21.2"`
- `sw.js > CACHE_NAME` → cumulé (cf §22)
- 1 nouveau fichier ajouté à `ASSETS_TO_CACHE` : `js/wakeLock.js`
- Réactivations dans `index.html` + `sw.js` : `js/heatmap.js` (commenté en v1.12.0, re-activé)

#### 62.9 À NE PAS faire

- ❌ Bypass `setTrackingTimeline` pour restaurer une timeline depuis un payload — le filtrage défensif protège contre les corruptions (anciens exports manuels, entries malformées d'extension tierce, etc.)
- ❌ Inclure le tracker dans Conversion ed2data — figerait une donnée éphémère + user-spécifique dans le data layer du plan
- ❌ Modifier un collecteur Heatmap pour retourner `[{x, y}]` au lieu de `[{a, b}]` — casserait l'interpolation segments
- ❌ Stocker `calib.transform` dans le retour de `getCalibration()` — le pattern actuel est rebuild on-demand via `buildTransform` (cf §32.7 piège ajouté)
- ❌ Coder un wake lock en parallèle dans un autre module — utiliser `WakeLock.acquire()` / `WakeLock.release()` qui gèrent re-acquire visibilitychange + persistance + sync UI
- ❌ Ajouter une sous-action critique (genre suppression destructive) sans `cssClass` rouge ET sans la mettre en fin de groupe — la cohérence visuelle "actions dangereuses = rouge + fin" est un guide UX

---

### 63. v1.21.4 — Stats Profil enrichies + filtre Heatmap M-LVL + préfs UX (depuis v1.21.4)

Release PATCH (bump Z : 1.21.3 → 1.21.4). 7 sujets indépendants regroupés. Documente ici les nouveaux patterns + pièges introduits. Le filtre Heatmap M-LVL est documenté à part dans §51.4 (sous-section dédiée à Heatmap).

#### 63.1 Stats Profil — Cache localStorage par plan

Format clé : `localStorage["myktamap_plan_stats_v1_<planId>"]`. 1 entrée par plan visité.

```json
{
  "pois":      42,
  "roads":     8,
  "zones":     3,
  "distPx":    12340.5,
  "breakdowns": {
    "pointsByTag":   { "pa": 3, "salle": 12, ... },
    "roadsByType":   { "principal": 4, "chemin": 2, "secondaire": 2 },
    "zonesByType":   { "eau": 1, "remblais": 2 },
    "structsByType": { "pilier-1": 5, "front-1": 3 }
  },
  "ts":     1747923456789,
  "source": "live"  // ou "session-only-partial"
}
```

**Cascade calcul** (helpers `_lirePlanStats(id)` / `_persisterStatsPlan(id, data)` dans `statsGlobales.js`) :
- **Plan COURANT** : calcul **live** (registries en mémoire `getEditorPoints/getRoads/getZones/getStructures` + `getAllEmbedded*`). `source: "live"`.
- **Autres plans** : lecture cache. Si pas de cache → fallback `localStorage["myktamap_session_v1_<id>"]` (SessionPersist, cf §57) = session-only (pas d'embedded data layers). `source: "session-only-partial"` + marqueur visuel `⚠️ partial` dans l'UI.

**Hook auto-persist** : `window._persisterStatsPlanCourant()` exposé global, appelé depuis `main.js > lancerApplication` avec `setTimeout(_, 800)` pour laisser passer le rAF batch du rendu Leaflet + les fetch async des data layers embedded. Sans le defer 800ms, on capturait `getAllEmbeddedRoads() = []` → cache pollué avec un résultat vide.

#### 63.2 Pattern critique — Calcul stats cross-plan séquentiel anti-crash

**KARMA warning explicite** : un calcul parallèle (`Promise.all(plans.map(_computePlanStats))`) saturait le main thread mobile et figeait l'app jusqu'au kill OOM. **10+ plans = inutilisable** sur smartphone milieu de gamme.

**Pattern reproductible** (utilisable pour tout calcul lourd cross-plan) :

```js
async function _computeStatsAggregeesProfile() {
  const plans = window.PlanRegistry.getAll();  // ← .getAll() PAS .list() (cf §63.5)
  const agg = { pois: 0, roads: 0, zones: 0, structs: 0, distM: 0, breakdowns: {...} };

  for (const p of plans) {
    if (!p || !p.id) continue;
    if (window._loaderSkipServerPlans && window._loaderSkipServerPlans() && p.type === "server") continue;

    const stats = await _lirePlanStats(p.id);    // ← cache OU session-only
    if (!stats) continue;

    agg.pois  += stats.pois  || 0;
    agg.roads += stats.roads || 0;
    // ... merge breakdowns via _mergeBreakdown(agg.breakdowns.X, stats.breakdowns.X)

    // 🔑 YIELD AU THREAD UI avant le prochain plan
    await new Promise(function(r) { setTimeout(r, 0); });
  }
  return agg;
}
```

**Pourquoi `setTimeout(0)` et pas `requestAnimationFrame` ou `queueMicrotask`** :
- `requestAnimationFrame` : ne fire que ~16ms et bloque si l'onglet est inactif (tab background)
- `queueMicrotask` : task de même priorité que l'await, ne yield PAS au thread UI (rendu, scroll, input)
- `setTimeout(0)` : macrotask → vraie pause + repriorisation du paint + input handlers entre 2 itérations

**Yield au thread UI vital sur mobile** : sur PC, 50 plans à 10ms chacun = 500ms bloquant tolérable. Sur smartphone, le même calcul prend 30-80ms par plan (CPU plus lent + RAM contrainte) → bloque le scroll + freeze visuel → l'user croit l'app crashed → tape l'écran 20 fois → quand le calcul finit enfin, file de 20 events dans Leaflet = vrai crash.

**Sites du projet utilisant ce pattern** :
- `js/statsGlobales.js > _computeStatsAggregeesProfile` (v1.21.4)
- `js/profileExportImport.js > computeSectionSizes` (v1.20.0 enrichi — itère les sections IDB pour le grand total export)

Si tu ajoutes un nouveau calcul itératif cross-plan ou cross-store, **toujours suivre le pattern `for...await + setTimeout(0)`**. Ne JAMAIS faire `Promise.all` sur du calcul lourd cross-plan.

#### 63.3 `window.StatsGlobales.renderPieChart` exposé publiquement

Helper SVG natif `_renderPieChart(data, category, size)` (cf §1.21.0 — v1.21.0 historique des stats globales) désormais **exposé via `window.StatsGlobales.renderPieChart`**. Réutilisable dans toute modale qui veut un camembert SVG cohérent avec la palette charte (sans dépendance externe, sans dupliquer la logique d'arc SVG).

**Signature** :
```js
window.StatsGlobales.renderPieChart(data, category, size)
  // data     : { tag1: count1, tag2: count2, ... }  ou null
  // category : "points" | "roads" | "zones" | "structures"
  //            (détermine la palette via cycle hash djb2 ou couleur charte)
  // size     : pixels (défaut 160 desktop, ~120 mobile)
  // → retourne un HTMLDivElement contenant <svg> + <legend>
```

**Cas particuliers gérés** :
- 1 slice → `<circle>` plein (pas d'arc)
- 0 slice → null retourné (caller doit gérer)
- Slices > 180° → arc avec flag `large=1`

**Site v1.21.4 utilisant ce helper** : section "📊 Camemberts agrégés cross-plan" dans la modale Profil → 4 pies (pointsByTag / roadsByType / zonesByType / structsByType) construits à partir de `agg.breakdowns.X` post-cross-plan merge.

**Pour étendre** : si une future modale veut un 5e camembert (ex: "tags par niveau M-LVL"), réutiliser le helper directement. NE PAS recopier la logique SVG dans un autre module.

#### 63.4 Pref "Skip plans serveur au démarrage"

`localStorage["myktamap_skip_server_plans_v1"]` (boolean string `"1"` / `"0"` / absent). Helper global `window._loaderSkipServerPlans()` retourne `true/false`. Toggle UI dans la modale ⚙️ Configuration loader (uniquement, pas en map mode).

**Cascade des effets quand `true`** :
1. **`main.js > initApp`** : skip l'appel `decouvrirPlansServeur()` au boot → le registre ne contient pas les plans serveur, économie de fetch `data/index.json` + N `plan-config.json`
2. **Home `refreshPlansList`** : le toggle "Afficher les plans serveur" est masqué (`display: none`) ET son state forcé à `false` (filtre l'affichage si le registre contient des plans serveur résiduels d'une session précédente)
3. **Stats agrégées Profil** : la boucle `for (const p of plans)` skip les `p.type === "server"`

**Use case** : utilisateurs offline-only ou paranoia totale (cf §40) qui ne veulent JAMAIS de fetch automatique au boot. La pref est lue très tôt (avant `decouvrirPlansServeur`), donc aucun fetch parasite même au tout premier boot après activation.

**À NE PAS faire** : lire `_loaderSkipServerPlans()` après `decouvrirPlansServeur` a déjà tourné — c'est trop tard, le registre est rempli. Toujours check AVANT d'appeler la découverte.

#### 63.5 ⚠️ Piège — `PlanRegistry.list()` n'existe pas, utiliser `.getAll()`

Bug v1.21.4-fix : code écrit avec `PlanRegistry.list()` (intuitivement pensé "lister les plans"). **Pas de méthode `list()` dans `planRegistry.js`** — l'API publique est `getAll()` qui retourne l'array des entries.

```js
// ❌ MAUVAIS — PlanRegistry.list n'existe pas → undefined.forEach() crash
const plans = window.PlanRegistry.list();  
plans.forEach(p => ...);

// ✅ BON
const plans = window.PlanRegistry.getAll();
plans.forEach(p => ...);
```

API publique exhaustive de `PlanRegistry` (cf `js/planRegistry.js`) :
- `init()` / `getAll()` / `findById(id)` / `addOrUpdate(entry)` / `remove(id)`
- `getLastPlanId()` / `setLastPlanId(id)`
- `getPerfPreset(id)` / `setPerfPreset(id, preset)`
- `syncModeFlags(id, flags)` (cf §33.7)

**Aucune méthode `list`**. Si tu cherches "lister les plans" → c'est `getAll()`.

#### 63.6 ⚠️ Piège — IDB stores où la valeur EST le Blob/Handle (pas un wrapper)

Bug v1.21.4-fix : helper `_accStoreBytes(db, storeName, accumulator)` itérait les stores en supposant que chaque valeur est un objet wrapper avec champ `blob` :

```js
// ❌ MAUVAIS — assume value = {blob: <Blob>}
cursor.continue(function(c) {
  const v = c.value;
  if (v && v.blob instanceof Blob) accumulator.bytes += v.blob.size;
});
```

Cela ratait silencieusement 2 stores du projet où la valeur **EST** directement le Blob/Handle :

| DB | Store | Forme `store.put(...)` | Type valeur |
|---|---|---|---|
| `myktamap_handles` | `handles` | `store.put(handle, id)` | `FileSystemHandle` (kind="file"\|"directory") |
| `myktamap_handles` | `blobs` | `store.put(blob, id)` | `Blob` |
| `myktamap_photos` | `photos` | `store.put({id, blob, mime, ...}, id)` | Wrapper objet `{blob, ...}` |
| `myktamap_backups` | `backups` | `store.put({id, payload, ...}, id)` | Wrapper objet |
| `myktamap_profile` | `profile` | `store.put({id, surnom, photoBlob, ...}, id)` | Wrapper objet `{photoBlob, ...}` |

**Pattern correct** : détection à 3 branches :

```js
function _accStoreBytes(db, storeName, acc) {
  const tx = db.transaction([storeName], "readonly");
  const store = tx.objectStore(storeName);
  store.openCursor().onsuccess = function(e) {
    const cursor = e.target.result;
    if (!cursor) return;
    const v = cursor.value;
    if (v instanceof Blob) {
      acc.bytes += v.size;
    } else if (v && v.kind && (v.kind === "file" || v.kind === "directory")) {
      acc.bytes += 0;  // FileSystemHandle = pointeur, taille inconnue sans .getFile()
    } else if (v && typeof v === "object") {
      // wrapper objet : sommer tous les Blob trouvés (photoBlob, blob, ...)
      for (const k of Object.keys(v)) {
        if (v[k] instanceof Blob) acc.bytes += v[k].size;
      }
    }
    cursor.continue();
  };
}
```

**Tout code qui itère un store IDB pour calculer une taille** doit suivre ce pattern triple. Sites du projet impactés (audit en v1.21.4) :
- `js/statsGlobales.js > _calculerSauvegardeProfile` (fix v1.21.4)
- `js/profileExportImport.js > computeSectionSizes` (déjà correct car connaissait les stores wrappers spécifiquement)
- `js/memInspector.js > _collectIndexedDB` (lecture count uniquement, pas concerné par les bytes)

**Si tu ajoutes un nouveau store IDB** : documente sa forme (`store.put(X, id)` où X = quoi) dans le commentaire d'en-tête du module qui ouvre la DB, pour les futurs auditeurs.

#### 63.7 Choix configurable des stats du bandeau accueil

`localStorage["myktamap_loader_bar_stats_v1"]` = `JSON.stringify([key1, key2, key3])` (array de 0-3 keys parmi pool).

**Pool actuel** : `["time", "storage", "plans"]`
- `time` : temps cumulé sur l'app (cumul `_sessionStartTs` deltas, persisté à part)
- `storage` : taille totale MyKTAMap (= cf §63.6, calcul ciblé localStorage + IDB)
- `plans` : nombre de plans dans le registre

**Cap 3 max** : 3 slots dans le bandeau, le 4e item se voit refusé via une `OOMGuard.showToast("info")` "Maximum 3 stats actives".

**Pattern dynamique** (helpers dans `js/userProfile.js` ou similaire) :
```js
_getProfileBarStatsKeys()                   // → array
_setProfileBarStatsKeys(arr)                // valide cap + persist
_renderProfileBarStatsSlots(container)      // rebuild le DOM dynamiquement
```

**Modale "Configurer les stats du bandeau"** : ouverte depuis le ⚙️ Détails profil. Checkboxes pool, drag-handles pour réordonner (TODO future si demandé), preview live.

**Pour ajouter une nouvelle stat au pool** :
1. Ajouter la key dans `POOL_STATS_KEYS` array (ex: `"levels-visited"`)
2. Implémenter `_computeStatXxx()` (async ou sync) qui retourne `{value: string, label: string, icon: string}`
3. Ajouter le case dans le switch de `_renderProfileBarStatsSlots`
4. Ajouter le label dans la modale de config

#### 63.8 Sources de vérité v1.21.4

- `version.json` → `"v1.21.4"`
- `js/copyright.js > __MKM__.build` → `"v1.21.4"`
- `sw.js > CACHE_NAME` → `"myktamap-cache-v1.21.4"`
- **Aucun nouveau fichier**. Modifs internes : `index.html` (modales config bandeau + skip serveur), `js/heatmap.js` (filtre M-LVL), `js/main.js` (hook `_persisterStatsPlanCourant` + skip serveur cascade), `js/statsGlobales.js` (renderPieChart exposé + stats cross-plan séquentielles), `css/style.css` (camemberts cross-plan + chips niveaux Heatmap).

#### 63.9 Confidentialité

**Aucune nouvelle surface réseau, aucune nouvelle permission**. Tout local :
- localStorage : 3 nouvelles keys (`myktamap_plan_stats_v1_<id>`, `myktamap_loader_bar_stats_v1`, `myktamap_skip_server_plans_v1`)
- IDB : lecture read-only des stores existants pour le calcul de sauvegarde (pas de nouvelle DB)
- Aucun fetch réseau ajouté
- Aucune API navigateur supplémentaire

NETWORK_AUDIT inchangé sur le fond — mise à jour des dates et de la version affichée uniquement.

#### 63.10 À NE PAS faire

- ❌ Faire `Promise.all(plans.map(_compute))` au lieu de `for...await + setTimeout(0)` pour le calcul stats cross-plan — saturera le main thread mobile, crash garanti à 10+ plans
- ❌ Utiliser `PlanRegistry.list()` — n'existe pas, utiliser `getAll()` (cf §63.5)
- ❌ Assumer qu'un store IDB stocke toujours `{blob, ...}` — certains stores stockent directement le Blob/Handle (cf §63.6)
- ❌ Lire `_loaderSkipServerPlans()` après que `decouvrirPlansServeur` ait déjà tourné — toujours check AVANT le boot
- ❌ Persister les stats du plan courant SYNC (avant `lancerApplication` finit) — les data layers embedded ne sont pas encore fetched → cache pollué avec un résultat partiel. Toujours `setTimeout(_, 800)` après `lancerApplication`
- ❌ Recopier la logique SVG du camembert dans un autre module — utiliser `window.StatsGlobales.renderPieChart(data, category, size)` qui maintient la cohérence palette
- ❌ Ajouter une 4e stat au bandeau sans cap de validation — `_setProfileBarStatsKeys` refuse > 3 (sinon overflow visuel + perf au render)
- ❌ Calculer la sauvegarde via `navigator.storage.estimate()` — retourne TOUTE l'origine (Cache PWA inclus, volatile). Toujours utiliser le calcul ciblé `_accStoreBytes` (cf §63.6)

---

### 64. v1.21.5 — Refonte filtre Leaflet (modale ≡ unifiée + filtrage runtime tags/types)

Release PATCH (bump Z : 1.21.4 → 1.21.5). Refonte UX complète du bouton `≡` Leaflet topright. Module **nouveau** `js/filterPanel.js` (~655 lignes IIFE).

#### 64.1 Architecture

**Avant** : `js/map.js` ligne 389 (env.) faisait `L.control.layers(null, overlays).addTo(map)` → control natif Leaflet qui togglait image + data layers en cochant/décochant des cases. Pas de filtre tag/type.

**Après** : `L.control.layers(...)` **supprimé**. `js/map.js` expose `window._ktaOverlays = overlays;` pour que FilterPanel puisse les toggler. Un nouveau custom control `L.control.ktaFilterControl` (défini dans `interface.js`) est ajouté topright avec la même icône `&#9776;` (≡ trois barres horizontales — KARMA : « visuelement meme icone des troi barre noir horizontal »). Au clic → `window.FilterPanel.ouvrir()`.

#### 64.2 État runtime global

```js
window._ktaRuntimeFilters = {
  tags:        Set<string> | null,   // null = pas de filtre (tout visible)
  roadTypes:   Set<string> | null,
  zoneTypes:   Set<string> | null,
  structTypes: Set<string> | null
};
```

**Convention `null`** = rétro-compat. Tout module level-aware (road.js, zones.js, structures.js, editor.js, utils.js) check `if (window._ktaRuntimeFilters && window._ktaRuntimeFilters.X)` AVANT de filtrer → si null, comportement v1.21.4 strict.

#### 64.3 API publique `window.FilterPanel`

- `ouvrir() / fermer() / isVisible()` — modale
- `getState()` → retourne `window._ktaRuntimeFilters` (référence directe)
- `setFilters(partial)` — mute par champ (tags, roadTypes, ...) + déclenche `_scheduleApply` + `_notify`
- `onChange(cb)` — subscribe aux changements (debounce 200ms)
- `applyFilters()` — force re-render via `window.appliquerFiltreRuntime`
- `onLevelChange()` — appelée par `appliquerFiltreNiveau` quand le M-LVL change ailleurs → re-render la section M-LVL si la modale est ouverte (sync bidirectionnel)

#### 64.4 Cascade re-render — `window.appliquerFiltreRuntime`

Helper global dans `interface.js`, alias de `appliquerFiltreNiveau` :

```js
window.appliquerFiltreRuntime = function() {
  if (typeof window.appliquerFiltreNiveau === "function") {
    window.appliquerFiltreNiveau();
  }
};
```

**Pourquoi un alias ?** Les modules level-aware (renderRoads, renderZones, renderStructures, _applyLevelFilterToData*) appliquent runtime+niveau dans la même passe de rendu. Pas besoin de 2 passes distinctes.

#### 64.5 Hooks runtime niveau modules

**road.js > renderRoads** (après `_passeFiltreNiveau`) :
```js
if (window._ktaRuntimeFilters && window._ktaRuntimeFilters.roadTypes
    && road.type !== "itinerary" && road !== currentRoad) {
  if (!window._ktaRuntimeFilters.roadTypes.has(road.type)) return;
}
```

**zones.js > renderZones** (après `_zonePasseFiltre`) :
```js
if (window._ktaRuntimeFilters && window._ktaRuntimeFilters.zoneTypes
    && zone !== currentZone) {
  if (!window._ktaRuntimeFilters.zoneTypes.has(zone.type)) return;
}
```

**structures.js > renderStructures** (après `_structurePasseFiltre`) :
```js
if (window._ktaRuntimeFilters && window._ktaRuntimeFilters.structTypes
    && s !== currentStructure) {
  if (!window._ktaRuntimeFilters.structTypes.has(s.type)) return;
}
```

**editor.js > _ajouterMarker** : pose `marker._ktaTags = Array.isArray(point.tags) ? point.tags.slice() : []`. Puis `_appliquerFiltreNiveauSurMarker` combine niveau + tag filter :
```js
if (visible && window._ktaRuntimeFilters && window._ktaRuntimeFilters.tags) {
  const tag = (Array.isArray(marker._ktaTags) && marker._ktaTags[0])
              || (marker._ktaTag)
              || "default";
  if (!window._ktaRuntimeFilters.tags.has(tag)) visible = false;
}
```

**utils.js > _filtreNiveauSurPolygonData** étendu avec param `kindForRuntime` ("zones" | "structs") — passé par `_applyLevelFilterToDataZones` ("zones") et `_applyLevelFilterToDataStructures` ("structs"). Permet de distinguer le filtre runtime à appliquer (zoneTypes vs structTypes) sur les polygons embedded.

#### 64.6 Préservation `currentRoad`/`currentZone`/`currentStructure`

⚠️ **Critique** : le tracé/zone/structure EN COURS de dessin bypass le filtre runtime. Sinon : user trace une route Principal pendant que filtre Principal=off → le tracé courant disparaît instantanément → user perdu.

Implémenté via `road !== currentRoad` (et équivalent) dans chaque hook. Le re-render normal une fois le mode désactivé applique le filtre comme prévu.

**Itinéraires** (`road.type === "itinerary"`) toujours bypassés aussi : calculés par Pathfinder, doivent rester visibles peu importe le filtre.

#### 64.7 Live update + debounce 200ms

Chaque toggle (input change, mini-action Tout/Aucun, reset all) appelle `_scheduleApply()` qui debounce `applyFilters()` à 200ms. Évite le freeze sur plans denses lors de clics rapides successifs (ex : `_toggleAll` enchaîné).

#### 64.8 Persistance per-plan via SessionPersist

**Sérialisation** : Sets → Arrays via `_serializeRuntimeFilters()` dans `sessionPersist.js > _gatherState()` :
```js
runtimeFilters: _serializeRuntimeFilters()  // {tags: [...]|null, roadTypes: [...]|null, ...}
```

**Restore** : Array → Set via `_toSet(arr)` dans `_restore()` :
```js
if (payload.runtimeFilters && typeof payload.runtimeFilters === "object") {
  const rf = payload.runtimeFilters;
  if (!window._ktaRuntimeFilters) {
    window._ktaRuntimeFilters = { tags: null, roadTypes: null, zoneTypes: null, structTypes: null };
  }
  function _toSet(arr) { return Array.isArray(arr) ? new Set(arr) : null; }
  window._ktaRuntimeFilters.tags        = _toSet(rf.tags);
  window._ktaRuntimeFilters.roadTypes   = _toSet(rf.roadTypes);
  window._ktaRuntimeFilters.zoneTypes   = _toSet(rf.zoneTypes);
  window._ktaRuntimeFilters.structTypes = _toSet(rf.structTypes);
  // Apply après timeout 200ms pour laisser les markers session être restaurés (phase 2 itineraries)
  setTimeout(function() {
    if (typeof window.appliquerFiltreRuntime === "function") {
      try { window.appliquerFiltreRuntime(); } catch(e) {}
    }
  }, 200);
}
```

⚠️ **Timing 200ms** : aligné avec la phase 2 de restore des itineraries (cf §9). Sinon, les markers session ne seraient pas encore re-créés → filter inopérant.

#### 64.9 Sync M-LVL bidirectionnel

**Sens 1 : modale Niveaux → FilterPanel** :
`interface.js > appliquerFiltreNiveau` appelle en fin de fonction :
```js
if (window.FilterPanel && typeof window.FilterPanel.onLevelChange === "function") {
  try { window.FilterPanel.onLevelChange(); } catch(e) {}
}
```
`onLevelChange()` re-render la section M-LVL via `_renderLevelsSection` + `_bindLevelHandlers(sec)` si la modale est ouverte.

**Sens 2 : FilterPanel → modale Niveaux** :
Les handlers de la section M-LVL mutent directement `APP_CONFIG.visibleLevels` puis appellent `window.appliquerFiltreNiveau()` qui propage à tous les modules level-aware + la pastille M-LVL.

#### 64.10 Énumération tags (KARMA "Seulement ceux présents")

`_enumerateTags()` :
1. Itère `getEditorPoints()` (session)
2. Itère `window._ktaDataMarkers` (data layer markers, posés par `utils.js > ajouterPointsDepuisJSON`)
3. Pour chaque marker, prend `m._ktaTags[0]` ou `"default"` fallback
4. Count par tag, tri desc
5. Retourne `[{tag, count, iconUrl?}]` avec `iconUrl` lookuped via `window._iconMap[tag]`

Si 0 tag → section affiche "Aucun point dans cette session."

#### 64.11 À NE PAS faire

- ❌ Réintroduire `L.control.layers(null, overlays)` natif — casserait l'ergonomie unifiée (2 modales redondantes pour le filtre)
- ❌ Bypass `currentRoad`/`currentZone`/`currentStructure` dans les hooks runtime — le user qui dessine perd son tracé en cours instantanément
- ❌ Filtrer `road.type === "itinerary"` ou `s === currentStructure` — toujours bypass (cf §64.6)
- ❌ Stocker `_ktaRuntimeFilters` dans une key localStorage globale séparée — utiliser le payload SessionPersist (`runtimeFilters` champ) pour cohérence per-plan
- ❌ Sérialiser des Sets en JSON direct (`JSON.stringify(new Set(...))` retourne `"{}"`) — toujours convertir en Array via `Array.from(set)` avant
- ❌ Appliquer `appliquerFiltreRuntime()` synchroniquement au boot SessionPersist — utiliser `setTimeout(_, 200)` pour laisser la phase 2 restore (itineraries) finir
- ❌ Appeler `_enumerateTags()` ou `_enumerateTypes()` dans une boucle de render — coûteux (itère session + embedded à chaque appel). Cache l'résultat si utilisé plusieurs fois dans la même passe de render
- ❌ Modifier `window._ktaRuntimeFilters` directement depuis un autre module — passer par `FilterPanel.setFilters({...})` pour bénéficier de `_scheduleApply` + `_notify`

#### 64.12 Pour étendre

**Ajouter un nouvel axe de filtre runtime** (ex: `photoTags` pour filtrer par tag photo) :
1. Ajouter le champ dans `window._ktaRuntimeFilters` initialization (filterPanel.js IIFE start)
2. Ajouter le helper `_enumerateXxx()` qui retourne la liste des valeurs présentes
3. Ajouter le rendu section via `_section(...)` dans `_renderAllSections`
4. Ajouter le hook runtime dans le module concerné (lecture `if (window._ktaRuntimeFilters && window._ktaRuntimeFilters.xxx) ...`)
5. Ajouter la sérialisation/désérialisation dans `_serializeRuntimeFilters` et le restore SessionPersist
6. Ajouter le status footer line dans `_updateStatus`
7. Ajouter dans `setFilters` partial handler

**Sources de vérité v1.21.5** :
- `version.json` → `"v1.21.5"`
- `js/copyright.js > __MKM__.build` → `"v1.21.5"`
- `sw.js > CACHE_NAME` → `"myktamap-cache-v1.21.5-filterpanel"`
- 1 nouveau fichier `js/filterPanel.js` (~655 lignes) ajouté à `ASSETS_TO_CACHE` + balise `<script>` dans `index.html` après `interface.js`

#### 64.13 v1.21.5-fix1 — 4 fixes post-release suite tests terrain

Fixes appliqués sans bump version (CACHE_NAME inchangé `myktamap-cache-v1.21.5-filterpanel`).

**Fix 1 — CSS FilterPanel COMPLÈTEMENT OUBLIÉ à la release initiale** : ~280 lignes manquantes pour les classes `.kta-fp-*`. Le navigateur affichait tout en flux brut (PNG tag icons à leur taille naturelle 50×50, checkboxes default inline, pas de padding ni alignement). Diagnostic immédiat sur screenshot KARMA : chips empilés sans grid, label/count smashed sur l'icône.

Ajout (`css/style.css` +280 lignes en fin de fichier, après la section v1.21.4 KMZ light theme) :
- `.kta-fp-boite` : max-width 560/720px PC, height auto + max-height 90vh (anti bug 88vh étiré)
- `.kta-fp-section` (details) : accordéon avec border ambre + chevron `▸/▾` qui pivote via `transform: rotate(90deg)` au `[open]`
- `.kta-fp-chips-grid` : `grid-template-columns: repeat(auto-fill, minmax(180px, 1fr))` — 1 col mobile < 480px, auto-fill sinon
- `.kta-fp-chip` : Flexbox avec **icône width/height 22px object-fit:contain** (critique — sinon PNG natif 50×50), label `flex: 1 + ellipsis`, count badge pill ambré
- `.kta-fp-chip-off` : opacity 0.5 + label `text-decoration: line-through` + count grisé (signal visuel "masqué")
- `.kta-fp-row-cb` : Image/Data layers row simple (pas de grid)
- `.kta-fp-lvl-segmented` + `.kta-fp-lvl-btn` : M-LVL pills horizontaux, actif = fond jaune charte `#f4c542` + texte `#1a1f2e`
- `.kta-fp-mini-btn` : Tout/Aucun mini-boutons bleus translucides `rgba(140,180,255,...)`
- `.kta-fp-footer` : Reset + status, fond dark + border-top ambré
- `.kta-filter-ctrl a` : override Leaflet `.leaflet-bar a` default pour assurer le `≡` propre 30×30 fond blanc
- **Thème clair** : variants complets `body/html.kta-theme-light` via variables `--kta-light-*` (cf §53 pattern)

⚠️ **Leçon** : quand on crée un nouveau module IIFE qui pose son propre HTML via classes custom, **vérifier visuellement le rendu AVANT de release** — pas juste compter sur la logique JS pour valider. Le CSS oublié ne plante pas, ne génère aucun warning console, mais rend l'UI inutilisable.

**Fix 2 — Exclusion `type === "itinerary"` du filtre** : `_enumerateTypes(category)` dans `filterPanel.js` itère toutes les roads pour construire `counts[type]`. Il prenait au passage le pseudo-type `"itinerary"` posé par Pathfinder sur la road de navigation calculée → apparaissait comme un type filtrable dans la section "🛣️ Types de tracés" alors que c'est un dérivé, pas un choix utilisateur.

```js
if (category === "roads" && it.type === "itinerary") return;  // skip
```

Cohérent avec le hook runtime dans `road.js > renderRoads` qui bypass déjà `road.type === "itinerary" && road !== currentRoad` (cf §64.5). Le filtre `roadTypes` ne touche jamais aux itineraries.

**Fix 3 — Stats Home : labels TOUJOURS par défaut** (KARMA : « *en stat général, on doit toujours prendre la valeur par default* »).

Avant : `_renderProfilePies` (index.html) appelait `renderPie(data, s.category, 140)` → `_renderPieChart` consultait `_lcLabelStat` → `LegendCustomization.getLabel` cascade session > plan > default → appliquait le renommage local du plan A (« principal » → « route de surface ») à l'agrégat cross-plan home.

Fix : ajout d'un 4e param `useDefaultLabels` à `_renderPieChart` :

```js
function _renderPieChart(data, category, size, useDefaultLabels) {
  // ...
  const _labelFn = useDefaultLabels ? _defaultLabelStat : _lcLabelStat;
  // ... dans la légende : _labelFn(category, k, k) au lieu de _lcLabelStat
}
```

Nouveau helper `_defaultLabelStat(category, type, fallback)` qui consulte UNIQUEMENT `LegendCustomization.getDefaultLabel(lcCat, type)` (court-circuite la cascade). Préserve le préfixe `✨` pour les customs `cust-*` (qui n'ont pas de version "default" — toujours custom par essence).

L'appel `index.html > _renderProfilePies` passe `true` → cross-plan home a des labels génériques cohérents. La modale Stats GLOBALES **in-plan** garde l'appel sans 4e arg → cascade LC normale préservée.

**Fix 4 — Stats Home : secondaire / level -1 manquants** (KARMA : « *les route secondaire ou taguer lvl -1 ne semble pas pris en compte* »).

**Audit confirme pas de drop technique** dans `_computePlanStatsLive` (index.html) :
- `getRoads()` retourne toutes les roads sans filtre
- `getAllEmbeddedRoads()` retourne toutes les embedded (pas de filtre layer.hasLayer depuis v146)
- `_countBy(sessRoads.concat(embedRoads), function(r) { return r.type || "principal"; })` ne filtre pas par type ni level

**2 régressions silencieuses identifiées** dans `_resoudreStatsPlan` (index.html) :

**(a)** Le cache v1.21.3 sans champ `breakdowns` (release antérieure) retournait `breakdowns: cached.breakdowns || null` → `null` → ligne `_mergeBreakdown` plus loin checkait `if (stats.breakdowns)` → **skip total du plan** dans l'agrégation des 4 camemberts. Fix : check explicite `cached.breakdowns && typeof === "object"`. Si absent ou corrompu, **fall through au cas 3** (session-only) au lieu de skip → au moins les données session du plan sont contribuées.

**(b)** Le fallback `session-only` (cas 3) ne lisait que `data.editorPoints` + `data.roads` du payload SessionPersist → les zones et structures du plan étaient ignorées dans l'agrégation, et donc les `secondaire`/`chemin`/jonctions M-LVL absents de la section "🛣️ Tracés par type" pour les plans jamais rouvert depuis v1.21.4. Fix : extension de la lecture à `data.zones` + `data.structures` (toujours présents dans le payload depuis v1.9.3-A1.a) → `zonesByType` et `structsByType` correctement remplis.

**Limitation acceptée** : la session-only ne lit pas les **data layers embedded** (les `data/*.json` du ZIP). Si un user a tous ses tracés `secondaire` ou en niveau -1 stockés dans un data layer du plan (pas en session) et n'a jamais rouvert ce plan depuis v1.21.4 → ils restent invisibles dans Stats Home tant que le plan n'est pas rouvert une fois (la réouverture déclenche `_persisterStatsPlanCourant` qui régénère le cache complet avec tous les breakdowns embedded).

**Sources fix1** : `js/filterPanel.js` (+5), `js/statsGlobales.js` (+35), `index.html` (+13 net), `css/style.css` (+280). Pas de bump version.

### 65. v1.22.0 — Mode Secours Phase 1 MVP (depuis v1.22.0)

Nouveau module `js/secoursMode.js` (~1500 lignes IIFE) → `window.SecoursMode`. Outil opérationnel pour assigner des équipes de recherche à des zones d'un plan cataphile. Bouton 🚨 dans le flyout urgences (Tracker), modale 3 vues (list/create/edit free-form). Persistance per-plan multi-scénarios via localStorage `myktamap_secours_v1_<planId>`. Palette OTAN 10 couleurs fixe. 3 modes interactifs map (point / polygon / roads). Pathfinder intégré pour pré-calcul itinéraires. Overlay carte couleur transparent par équipe. Exports PDF (1 page/équipe) + KMZ (extension myktamap-extras.json).

#### 65.1 Architecture & API

`window.SecoursMode = { init, reset, ouvrir, fermer, isOpen, getCurrentScenarioId, list, get, create, update, delete, duplicate, addGroupe, updateGroupe, removeGroupe, recalculerItineraires, exporterPDF, exporterKMZ, renderOverlay, clearOverlay, setFocus, onChange, PALETTE, MAX_SCENARIOS, VITESSE_MPS_DEFAUT }`.

**State module-level** :
- `_scenarios: Array` — cache chargé via _loadScenarios depuis localStorage
- `_currentScenarioId: string | null` — scénario en cours d'édition
- `_modal: HTMLElement | null` — DOM root de la modale
- `_overlayLayer: L.LayerGroup | null` — layer Leaflet de l'overlay carte
- `_focusedGroupeId: string | null` — mode focus single team
- `_activeMapMode: "point"|"polygon"|"roads"|null` — mode interactif courant
- `_mapModeCtx: object | null` — contexte du mode (groupeId, points, roadIds, etc.)

**Format scénario** (cf JSDoc en tête de secoursMode.js) :
```js
{
  id, nom, createdAt, updatedAt,
  context: { incidentAt, lastKnownPoint, zoneIncertitude, notes },
  groupes: [{
    id, nom, couleurIdx, membres,
    entree, sortie,                         // {x, y, level, pointId?} | null
    zoneType: "polygon"|"roads"|null,
    zonePolygon, zoneRoadIds,               // exclusifs
    itineraireSuggere, distanceM, dureeEstimeeMin,
    statut, observations
  }],
  pointsCles: [...]
}
```

#### 65.2 Cycle de vie & cleanup

- **init** : appelé par `main.js > lancerApplication` après `SessionPersist.onPlanLoaded`. Charge les scénarios du plan courant depuis localStorage.
- **reset** : appelé par `main.js > _libererRessourcesPlanPrecedent` au plan switch. Ferme modale + purge overlay + vide `_scenarios` in-memory (la persistance localStorage per-plan reste intacte).
- **fermer** : ferme la modale + appelle clearOverlay + set _currentScenarioId = null.

#### 65.3 Persistance per-plan multi-scénarios

localStorage `myktamap_secours_v1_<planId>` = array de scénarios.
Cap FIFO `MAX_SCENARIOS = 10` (au-delà, suppression du plus ancien par createdAt).
Quota toast via OOMGuard si `QuotaExceededError` (pattern sessionPersist).
KARMA validation : « Oui — N scénarios sauvegardés par plan ».

#### 65.4 Palette OTAN 10 couleurs

`PALETTE` constante avec 10 entries `{hex, nom}` :
- Alpha #ff4444 (rouge), Bravo #4488ff, Charlie #44cc44, Delta #ffcc00 (ambre charte), Echo #ff4ecb (magenta = jonctions), Foxtrot #00d4ff (cyan = itinéraire), Golf #ff8c00, Hotel #9d44ff, India #8b5a2b, Juliet #404040

couleurIdx auto-cyclique au create d'équipe (`s.groupes.length % PALETTE.length`).

#### 65.5 3 modes interactifs map

Pattern : `_hideModalForMap` (display:none) → floater bottom rouge avec instruction + actions → `map.on("click")` listener → `_finishMapMode` (cleanup + restore modale via _showModalAfterMap + _switchView("edit")).

**POINT** (`_startDefiningPoint`) : `map.once("click")` auto-cleanup. Capture {x, y, level} via `APP_CONFIG.activeLevel`. Plan→latlng via convention `imageHeight - y`.

**POLYGON** (`_startDefiningZonePolygon`) : multi-clic. Preview L.polyline dashed rouge mise à jour à chaque sommet ajouté. Double-clic = ferme (min 3 sommets). Floater compte les sommets.

**ROADS** (`_startDefiningZoneRoads`) : hook click sur chaque polyline session (`getRoads()`) + embedded (`_ktaDataPolylines` registry). Re-clic toggle. Preserve `_kta_originalStyle` sur chaque layer cliqué pour restore propre. Skip `road.type === "itinerary"`.

⚠️ **Préserver les styles originaux** : `_kta_originalStyle` posé sur chaque layer modifié pour pouvoir restore exactement à l'état d'origine au cleanup. Sans ça, les polylines clignotent en rouge persistant après fermeture du mode.

#### 65.6 Pathfinder intégration

`_recalculerItineraireGroupe(scenarioId, groupeId)` :
1. Vérifie entree + sortie définies (toast warn sinon)
2. Appel async `Pathfinder.computeRoute([entree, sortie], {})` (async depuis v1.21.x pour expansion avoid tags)
3. Convertit `result.totalDistance` (px) → distM via `APP_CONFIG.scale`
4. Calcule `dureeEstimeeMin = distM / VITESSE_MPS_DEFAUT (0.5 m/s) / 60`
5. Update groupe avec `itineraireSuggere`, `distanceM`, `dureeEstimeeMin`
6. Toast feedback + re-render edit view

`recalculerItineraires(scenarioId)` : version batch qui itère tous les groupes du scénario.

#### 65.7 Map overlay (renderOverlay)

Pour chaque équipe (skip si focus actif et pas la focusée) :
- **Zone polygone** → L.polygon weight 3, opacity 0.85, fillColor couleur + fillOpacity 0.30
- **Zone roads** → L.polyline halo weight 10, opacity 0.55 par roadId
- **Entrée** → L.circleMarker radius 9, border #00cc44, fill couleur
- **Sortie** → L.circleMarker radius 9, border #cc0000, fill couleur
- **Itinéraire** → L.polyline weight 5, dashed "10 6", couleur

Toutes les couches taggées d'un tooltip "🚨 nom équipe" (ou role : Entrée/Sortie/Itinéraire).

**Auto-refresh** : `_commitMutation` détecte si overlay actif pour ce scénario → appelle `renderOverlay` pour update live.

#### 65.8 Export PDF (1 page A4 par équipe)

Via jsPDF déjà chargé pour pdfExport.js. Layout texte :
- Header bold "PLAN DE SECOURS — Nom équipe"
- Bandeau couleur équipe (fillRect + text blanc)
- Sections : CONTEXTE / MEMBRES / MISSION / ITINÉRAIRE
- Cadre OBSERVATIONS vide 60mm (impression papier)
- Footer crédit MyKTAMap build + timestamp

⚠️ **Limitation MVP** : pas de carte miniature avec overlay. Briefing 100 % texte. Phase 2 ajoutera un canvas snapshot du plan + zone via approche similaire à pdfExport.js > _genererCanvasPlan.

#### 65.9 Export KMZ (extension myktamap-extras.json)

Délègue à `KmzExport.genererKmz` avec 2 nouveaux opts :
- `secoursPlan` : scénario complet embarqué dans `myktamap-extras.json > secoursPlan`
- `secoursPalette` : palette pour Phase 2 (KML injection visible cross-app)

Pré-condition : plan calibré KMZ. Transform reconstruit on-demand via `KmzExport.buildTransform` (pattern §32.7 anti-fuite).

`kmzExport.js > genererKmz` étendu : check `_hasExtras` sur les 2 champs (planCustomLegend + secoursPlan), wrapper extensible `{type: "myktamap-kmz-extras", version: 1, exportedAt, customLegend?, secoursPlan?}`.

⚠️ **Limitation MVP** : seul l'extras.json embarque le scénario (MyKTAMap re-import natif fonctionnel). Le `doc.kml` ne contient PAS encore les Placemarks/Polygons cross-app pour Google Earth / OsmAnd. KARMA a choisi « KMZ géolocalisé cross-app » — cette partie est Phase 2 (injection Folder "🚨 Secours" avec Placemarks entrées/sorties + Polygons zones).

#### 65.10 À NE PAS faire

- ❌ Persister `_currentScenarioId` ou `_overlayLayer` au plan switch — toujours reset
- ❌ Garder les styles modifiés des polylines au cleanup du mode roads — toujours restore `_kta_originalStyle`
- ❌ Skip `map.once` au mode POINT → utiliser `map.on` simple → fuit le handler après usage
- ❌ Faire `JSON.parse(localStorage.getItem(...))` sans try/catch et sans filtre défensif des entries (chaque scénario doit avoir au moins id + nom)
- ❌ Reassign `recalculerItineraires` après le export `window.SecoursMode = {...}` — l'export capture la ref à la position du code. Toujours faire le reassign AVANT l'export final.
- ❌ Confondre `secoursPlan` (Phase 1) et `secoursPlan.groupes[].statut` (Phase 3 future) — `statut` est défini mais pas encore exploité.
- ❌ Ajouter des champs sensibles (positions GPS exactes en clair, photos de la victime, données médicales) dans le payload `secoursPlan` qui voyage dans le KMZ. Cohérence avec la philo cataphile « pas de données identifiantes dans les exports partageables ». Si Phase 3 ajoute des observations terrain, prévoir un opt-in explicite.

#### 65.11 Pour étendre

**Ajouter un nouveau champ d'équipe** (genre `equipementSpecial`) :
1. Ajouter dans `addGroupe` defaults
2. Whitelist dans `updateGroupe` partial
3. Render dans `_renderGroupesList` card
4. Persiste auto via `_commitMutation`

**Ajouter un nouveau type de zone** (genre "circle") :
1. Ajouter `zoneType: "circle"` + `zoneCircle: {cx, cy, radius}` dans groupes
2. Nouveau mode interactif map `_startDefiningZoneCircle` (1 clic centre + 1 clic rayon)
3. Render dans `_renderGroupeOverlay` via L.circle
4. PDF + KMZ exports adaptés

**Ajouter un statut temps réel (Phase 3)** :
1. Setter `setGroupeStatut(scenarioId, groupeId, "en_cours")` (déjà whitelisted dans updateGroupe)
2. Visual : tooltip overlay change selon statut, icône PDF différente
3. Sync via QR code → mini-modale "Scanner pour mettre à jour"
4. Timer global depuis `incidentAt` visible en permanence

#### 65.12 Roadmap phases suivantes (validées KARMA)

**Phase 2 — Intégrations** (v1.23.0) :
- Lost Mode → auto pre-fill `context.lastKnownPoint` + `zoneIncertitude`
- Favoris → import auto des favoris taggés `entrée/sortie` dans pointsCles
- Heatmap → si timeline tracker du disparu importée, suggestion zones probables
- Recherche unifiée Ctrl+K → étend pour assigner un point à une équipe en 2 clics
- M-LVL → suggestion auto "Groupe 1 = RDC, Groupe 2 = -1"
- Pathfinder avoidances cross-équipes — la zone d'une équipe devient "préférence éviter" pour les autres (pas de chevauchement involontaire)
- **KML cross-app** (folder 🚨 Secours avec Placemarks + Polygons)
- **Carte miniature PDF** (canvas snapshot du plan + overlay zone équipe)

**Phase 3 — Statut temps réel** (v1.24.0) :
- Statut par équipe : `non_demarré / en_cours / terminé / rappelé`
- 1 user maintient l'état sur son device (PC secours surface)
- **QR code share** : envoie l'état initial aux devices équipes (lecture seule, anti-réseau souterrain)
- Au retour, scanner QR depuis device équipe pour reverser observations (`.mkmsec.observations.json`)
- Timer global depuis `incidentAt` visible toujours, signal stress visuel après seuils
- Re-export PDF "rapport final" avec observations remplies

---

#### 64.14 À NE PAS faire (post-fix1)

- ❌ Créer un nouveau module IIFE avec ses propres classes CSS custom sans **également écrire le CSS** dans `style.css` ET vérifier visuellement le rendu avant release. Le CSS oublié n'est jamais signalé par les outils (pas de warning, pas de plantage)
- ❌ Inclure `road.type === "itinerary"` dans l'énumération de types user-chooseable — c'est un dérivé Pathfinder, le type est posé automatiquement (cf `road.js > _calculerItineraire`)
- ❌ Bypass `useDefaultLabels` dans `_renderPieChart` pour les vues cross-plan — sinon les labels session/plan-level du plan COURANT polluent l'agrégat des autres plans
- ❌ Réintroduire le check `breakdowns: cached.breakdowns || null` sans fall-through — fait skip totalement les plans avec cache pré-v1.21.4
- ❌ Limiter le fallback session-only à `editorPoints + roads` — penser à inclure aussi `zones` + `structures` (présents dans le payload SessionPersist depuis v1.9.3-A1.a)

---

**Bon code ! 🚀**
