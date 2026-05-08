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
│                                  ⚠️ NE PAS confondre avec `js/sw.js` qui existe encore mais
│                                  N'EST PAS UTILISÉ — celui à la racine est le seul actif
│
├── css/
│   └── style.css               ← Styles globaux (charte dark)
│
├── js/                         ← Scripts chargés directement via <script> dans index.html
│   ├── debug.js                ← Capture silencieuse logs console
│   ├── config.js               ← APP_CONFIG, DEFAULT_CONFIG, runtime assets
│   ├── utils.js                ← convertCoord, choisirIcone, getIconUrlForPoint, telechargerPlan
│   ├── tiling.js               ← Tuilage image base (perfMode)
│   ├── map.js                  ← Init Leaflet, calques, _iconMap, TAGS_BUILTIN
│   ├── tracking.js             ← Tracker capteurs mobile (PDR, expérimental)
│   ├── measure.js              ← Mesure de distance
│   ├── editor.js               ← Ajout de points + EDITOR_TAG_LABELS
│   ├── road.js                 ← Tracés routes (Principal/Secondaire/Chemin)
│   ├── zones.js                ← Zones polygonales (Eau/Remblais/Effondrement)
│   ├── searchPoints.js         ← Recherche de points (par nom, id, tag)
│   ├── tableEditor.js          ← Éditeur JSON en tableau interactif
│   ├── exporter.js             ← Export PNG du plan (modale Rapide / Avancé)
│   ├── sessionExporter.js      ← Export session (Full / Avancé / Conversion)
│   ├── planRegistry.js         ← Registre multi-plans (localStorage + IndexedDB)
│   ├── createConf.js           ← Générateur ZIP de plan (UI afficherPlanner)
│   │                              + constantes PLANNER_DEFAULT_ICONS
│   │                              ⚠️ ancien nom : planner.js (renommé/fusionné)
│   ├── interface.js            ← UI principale, barre latérale 11 groupes,
│   │                              titre cliquable + plan switcher, légende, modales
│   └── main.js                 ← Orchestration, splash, auto-discovery serveur
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
7. `sw.js > urlsToCache` : ajouter `"./icon/fontaine.png"`

→ Le tag est utilisable sur les **plans existants** sans modifier leurs `plan-config.json`.

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
- `SPLASH_MIN_DURATION_MS = 3000` (constante dans `main.js`).
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

Double confirmation utilisateur avant exécution. Accessible depuis :

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

### 9. Flag `debugMode` (renommage de `motionDebug`, depuis 08/05/2026)

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
