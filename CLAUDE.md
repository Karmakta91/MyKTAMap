# CLAUDE.md — Contexte projet MyKTAMap

> Ce fichier est lu par Claude Code (et autres agents IA) au démarrage d'une session de travail
> sur ce dépôt. Il contient le **contexte essentiel** pour intervenir efficacement sur le projet
> sans relire l'intégralité du code à chaque fois.

---

## 🎯 Le projet en 30 secondes

**MyKTAMap** est une application web de **cartographie terrain** (Leaflet + `L.CRS.Simple`),
conçue pour visualiser, annoter et exploiter des **plans à partir d'images haute résolution**,
**sans GPS**. Cible principale : cataphiles, spéléologues, sites souterrains/industriels.

- **Page unique** (PWA) : `index.html`
- **Stack** : HTML/CSS/JS vanilla + Leaflet (pas de framework, pas de bundler)
- **Production** : https://myktamap.is-underground.fr
- **Dev** : https://devmap.is-underground.fr
- **GitHub** : https://github.com/Karmakta91/MyKTAMap
- **Auteur** : KARMA (`Karmakta91`)
- **Licence** : libre, usage non commercial

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
│   ├── tracking.js             ← Tracker capteurs mobile (PDR, expérimental)
│   │                              + flags _orientationListenerAttached/_motionListenerAttached
│   │                              (idempotency contre fuite après plan switch)
│   ├── measure.js              ← Mesure de distance
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
├── README.md                   ← Doc DEV (architecture, journal des modifications)
└── README_USER.md              ← Doc UTILISATEUR (intégrée à l'app via 📖)
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
- `SPLASH_MIN_DURATION_MS = 4000` (constante dans `main.js`).
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
- ⚙️ Plus d'options (dans le loader)

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

Sauvegarde silencieuse de la session active (editor + roads + zones + measure) dans `localStorage["myktamap_session_v1"]`.

**Stratégie** : slot unique, polling 1.5s, comparaison de hash pour détecter les modifs, save aussi sur `beforeunload` + `visibilitychange`. Tracker path EXCLU (PDR expérimental).

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

Outil de mesure agrégée : somme des longueurs de tous les tracés Principal / Secondaire / Chemin présents (session `getRoads()` + calques `getEmbeddedRoads()` visibles), avec filtrage par type via cases à cocher et surlignage magenta des tronçons inclus.

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
- `_rdRoadsExploitables()` retourne `session + embeddedVisibles` filtré sur types `principal/secondaire/chemin` (exclut explicitement `itinerary` pour éviter le double-comptage).
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

### ⚠️ Hack Leaflet — fond `.leaflet-container = #000000`

[`lib/leaflet/leaflet.css`](lib/leaflet/leaflet.css) **ligne 267** a été modifié à la main :

```css
.leaflet-container {
  /* MyKTAMap : noir pur pour matcher l'overlay loader (...) */
  background: #000000;
  outline-offset: 1px;
}
```

**Pourquoi** : sur iPhone PWA standalone, iOS lit la couleur du haut de page pour tinter sa status bar (mode `black-translucent` sans `viewport-fit=cover`). En mettant le fond du container Leaflet en noir pur, le sliver visible juste sous la status bar (avant le rendu des tuiles) garde la status bar dark même quand la map est claire derrière.

⚠️ **NE PAS REVENIR à `#ddd`** (le défaut Leaflet) sans avoir compris ce qu'on perd. Le commentaire dans le CSS explique l'intention. Lors d'un upgrade Leaflet upstream, **garder ce patch**.

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

- **Production** : https://myktamap.is-underground.fr
- **Dev** : https://devmap.is-underground.fr
- **GitHub** : https://github.com/Karmakta91/MyKTAMap
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

**Bon code ! 🚀**
