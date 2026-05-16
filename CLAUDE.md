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

| Source | Champ | Format | Rôle |
|---|---|---|---|
| `sw.js` | `CACHE_NAME` | `myktamap-cache-v143` | Cache PWA — bump force la purge + re-cache au prochain SW install |
| `js/copyright.js` | `__MKM__.build` | `"v143"` | Constante embarquée dans le code, affichée dans le badge footer (version installée) |
| `version.json` | `version` | `"v143"` | Source serveur, comparée par UpdateChecker pour détecter les updates dispo |

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
  PlanRegistry[id].multiLevel       (set explicitement via ⚙️ Réglages, prime)
  ↓ sinon
  PLAN_CONFIG.plan.multiLevel       (depuis plan-config.json, défaut du ZIP généré)
  ↓ sinon
  false                              (retro-compat plans v147)
```

**3 voies pour activer** :
- ⚙️ Réglages → toggle `🏗️ Mode multi-niveau (avancé)` (par plan, stocké dans `PlanRegistry`)
- Au moment de la création/modification d'un plan via 📦 Générateur → case `🏗️ Plan multi-niveau` → ajoute `plan.multiLevel: true` dans `plan-config.json`
- Édition manuelle de `plan-config.json` (champ `plan.multiLevel: true`)

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

#### 32.8 Pour ajouter une nouvelle catégorie d'export KMZ (futur)

Si on ajoute un nouveau type d'objet à exporter (ex: photos géolocalisées, audio notes) :
1. Helper `_emitXxx(item, styleId)` dans `kmzExport.js > genererKml`
2. Helper `_genererStyleXxx()` (style KML)
3. Bloc dans `_folderForLevel` avec filtre niveau-aware
4. UI : ajouter une row dans `_kmzRenderContenu` (sessionExporter.js)
5. Lecture : `opts.include.xxx` + éventuellement Set granulaire
6. Stats : ajouter au compteur dans `_kmzCollecterStats`

### 33. Refonte UX loader + fixes critiques (depuis v171)

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

**Bon code ! 🚀**
