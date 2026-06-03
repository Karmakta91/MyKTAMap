# Architecture MyKTAMap — Rendu Leaflet, icônes, calques, splash

> Référence détaillée extraite de l'ancien CLAUDE.md. Lue à la demande (pas auto-chargée).
> Sections : §1, §2, §4, §6, §19, §37, §38

---

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

---

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

---

### 4. Plan Switcher (titre cliquable, depuis 06/05/2026)

- `#kta-titre-fixe` est cliquable (`pointer-events: auto`).
- Au clic → `togglePlanSwitcher()` ouvre `#kta-plan-switcher` ancré sous le titre.
- Affiche les **3 derniers plans** EXCLUANT le plan en cours.
- Détection session active via `_sessionAModif()` :
  - `getEditorPoints/getRoads/getZones/getMeasurePoints/getTrackingPath` non-vides
- Si session active → modale d'avertissement avec liste détaillée des modifs perdues.

---

### 6. Splash screen

- HTML statique dans `<body>` → visible AVANT tout JS.
- `SPLASH_MIN_DURATION_MS = 3500` (constante dans `main.js`, depuis v1.8.1 — avant : 4000ms en v1.8.0 et antérieures).
- `_splashStart()` au début de `initApp()`, `_splashEnd()` en parallèle de `lancerApplication()`.
- **Une seule fois par session** (un changement de plan via 🗂️ ne ré-affiche PAS le splash).
- Assets : `icon/mkm-full.png` (logo) + `icon/karma.png` (signature).
- 🆕 **Animation reveal du titre depuis v1.30.0** : « MyKTAMap » se révèle progressivement
  (`clip-path` 700 ms) → pause ~600 ms → « -pro » se révèle (pro uniquement, 500 ms). Même
  easing `cubic-bezier(0.45, 0.05, 0.55, 0.95)` que la signature KARMA. Détails complets +
  pièges de spécificité CSS : cf `ui.md §83` et `security-legal.md §84`.

---

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

🆕 **Depuis v1.30.0 (P5 viewport culling)** : sur les plans denses, les markers POI session +
data layers ne sont plus tous `.addTo(map)` en permanence — seuls ceux dans le viewport
agrandi de 10 % sont attachés au DOM Leaflet. Les markers restent **instanciés en RAM**
(cache `_markersByPointId`) et sont rebind à chaque `moveend` / `zoomend`. Les markers
d'itinéraire, Mode Secours, GPS tracker et mesure en cours ne sont **PAS cullés**.
Cf `perf-memory.md §81` (pattern AABB complet + helpers `utils.js`/`editor.js`).

---

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

---

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
