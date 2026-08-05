# Architecture MyKTAMap — Rendu Leaflet, icônes, calques, splash

> Référence détaillée extraite de l'ancien CLAUDE.md. Lue à la demande (pas auto-chargée).
> Sections : §1, §2, §4, §6, §19, §37, §38

---

### 0. 🎨 Styles des types — source de vérité UNIQUE (v1.76.0)

**`js/styleResolver.js` est le SEUL endroit où vivent les styles des 13 types built-in** (tracés `principal/secondaire/chemin/jonction/itinerary`, zones `eau/remblais/effondrement/inaccessible`, structures `pilier-1/pilier-2/mur/front-1/front-2`). Avant lui : ~25 tables recopiées sur 12 fichiers — c'est ainsi qu'une zone `inaccessible` de calque sortait en gris remblais dans l'export PNG (entrée oubliée + repli silencieux, même défaut que `jonction` en v1.7.1).

**API** (globales `window.*`) :
- `ktaResolveStyle(cat, clé[, {flat:true}])` → objet **NEUF** | `null` (l'appelant garde son repli). Résout aussi les customs `cust-*` via `LegendCustomization` (gabarit par catégorie/géométrie) et applique l'**override de couleur** utilisateur (`LegendCustomization.getColor`, cascade session > plan). `{flat:true}` = contexte qui ne sait pas peindre un `url(#pattern)` SVG (canvas d'export, KMZ, fond OSM) → `inaccessible` retombe sur son aplat `_flatFill`.
- `ktaSwatchColor(cat, clé)` → LA couleur représentative (polygone = remplissage, ligne = trait) — pastilles, barres de stats, camemberts, rapport.
- `ktaTypeSwatchHtml(cat, clé, repliEmoji)` → pastille HTML (les émojis 🟩🟥🟡 sont des glyphes à couleur figée — sidebar + reflets de mode).
- `ktaLabelAvecPastille(cat, clé, label)` → remplace l'émoji de TÊTE d'un libellé i18n par la pastille (formulaires d'export).

**Règles** :
- ❌ **Jamais de table de couleurs locale** — `scripts/check-style-canon.js` (pré-commit BLOQUANT) refuse toute réintroduction. Exceptions assumées, listées dans le script : `emergencyMode.js` (palette vive dédiée), `osmView.js`/`osmHomePreview.js` (`inaccessible` en aplat orange, pas de motif SVG sur OSM).
- ⚠️ Le **KML garde SES largeurs/alphas** (`width` KML ≠ `weight` Leaflet, ajustés à l'échelle GPS) — seules les couleurs viennent du canon. Figé par `scripts/check-kml-styles.js`.
- Toute **mutation qui change un rendu** (setColor, resetSession, remove/updateCustomEntry) doit repeindre : `renderRoads/Zones/Structures` + `_ktaRestyleDataLayers` (calques de données — couleurs seules, les opacités restent au filtre multi-niveau). Vérifié par `check-api-surface.js`.
- Chargé tôt dans `index.html` (avant `utils.js`) ; aucune dépendance au chargement (LegendCustomization interrogé à l'appel).

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

**⚠️ Bug observé, statut incertain** : sur certaines configurations, le toggle off du LayerGroup ne propage PAS aux polylines roads (zones + markers OK). Une tentative de calque séparé "Mes tracés" pour les roads a été rollback car ne résolvait pas le bug.

> 🔍 **Piste (audit 01/08/2026, non testée en runtime)** — ce n'est probablement PAS un bug Leaflet, mais une **course au boot** : `_targetLayerForRoad()` retombe sur `window.map` quand `window.layerEditor` n'existe pas encore (fallback l. ~563, idem `zones.js > _zoneTarget`). Une road créée pendant cette fenêtre est attachée **directement à la map** → le toggle du LayerGroup `editor` ne la verra jamais, définitivement. Ça colle au « sur certaines configurations » (dépend du timing d'init). Le bug jumeau côté retrait a d'ailleurs été corrigé en v1.46.x (`layer.remove()` détache de la map mais pas du FeatureGroup parent → retrait FeatureGroup-aware, cf. `road.js` l. ~700).
>
> **Pour vérifier** : en console, `window.getRoads()` puis contrôler `window.layerEditor.hasLayer(<layer>)` sur les tracés récalcitrants. Si `false` alors qu'ils sont visibles → hypothèse confirmée, et le fix est de re-parenter au lieu de chercher côté Leaflet.

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

---

<!-- v1.34.16+ : pattern safe-remove imageOverlay anti bitmap pinning iOS -->
### 39. Safe-remove `L.imageOverlay` — pattern anti bitmap pinning WebKit (depuis v1.34.16)

Sur iOS Safari / PWA, `map.removeLayer(imageOverlay)` ne libère **PAS** la mémoire native
GPU de l'image tant que l'élément `<img>` interne (`overlay._image`) garde son `src`. WebKit
garde la texture décompressée en RAM native même après détachement DOM, jusqu'à
garbage collection effective de l'élément (= jamais si le layer reste référencé quelque
part, ex: dans `_ktaImageOverlays`).

#### 39.1 Symptôme

Sur plan switch d'un plan tuilé V2 vers un autre, la RAM native iPhone (visible via
Xcode Instruments) garde l'empreinte de l'ancien plan. Au bout de 2-3 switches, kill
silencieux WebKit → la PWA redémarre sans event ni erreur (cf `perf-memory.md §12`
OOMGuard pour la détection de ce kill).

#### 39.2 Pattern correct

Toujours clear `src` AVANT `removeLayer` :

```js
function _safeRemoveImageOverlay(overlay) {
  if (overlay && overlay._image) {
    overlay._image.src = "";
    overlay._image.removeAttribute("src");
  }
  if (overlay && window.map) window.map.removeLayer(overlay);
}
```

Le double `src = ""` + `removeAttribute("src")` est défensif : selon la version iOS,
seulement l'un des deux peut suffire à libérer la texture. Validé sur iOS 16, 17, 18.

#### 39.3 Sites consommateurs (v1.34.16)

- **`libererTuiles(layer)`** dans le module tiling V2 : appelé sur chaque tuile dont le
  zoom n'est plus actif (cf §27).
- **Boucle cleanup `_ktaImageOverlays`** dans `_libererRessourcesPlanPrecedent` (map.js
  ou main.js selon refactor) : avant chaque `map.removeLayer(overlay)`, clear le `src`.
- **Pattern à propager** à toute future feature qui crée des `L.imageOverlay` avec un
  `src` blob/data-URL et les retire dynamiquement (ex: futures couches saisonnières,
  overlays de mesure, etc.).

#### 39.4 Cas non concernés

- `L.tileLayer` Leaflet (vrai TMS XYZ) : Leaflet gère son propre cycle de vie d'images,
  la lib clear bien les `src` à chaque déchargement de tuile hors viewport. Le bug
  WebKit ne s'y manifeste pas → ne PAS modifier `lib/leaflet/leaflet.js`.
- `<img>` de l'app hors carte (icônes UI, splash, viewer photo) : pas concernés tant
  qu'ils restent attachés au DOM et visibles. Clear utile uniquement pour les `<img>`
  destinés à être détachés ET dont le `src` est un blob/data-URL.

#### 39.5 À NE PAS faire

- ❌ `map.removeLayer(overlay)` direct sur un overlay tuile ou un calque image → fuite
  RAM native iOS garantie sur sessions longues.
- ❌ `overlay._image = null` sans clear `src` d'abord → garde la texture GPU pinnée même
  si le ref `_image` est perdu (WebKit pinne sur le bitmap, pas sur le ref DOM).
- ❌ Compter sur le garbage collector pour clear `src` automatiquement → pas garanti
  côté WebKit, surtout si `overlay` reste référencé dans un tableau (`_ktaImageOverlays`,
  caches LRU, etc.).
- ❌ Appliquer ce pattern à `L.tileLayer` natif Leaflet → Leaflet gère déjà, double
  intervention peut casser le rendu. Le pattern est réservé aux `L.imageOverlay`
  ad-hoc créés par MyKTAMap.

Cf `perf-memory.md §88.5` pour le contexte du sprint Pack RAM et la mesure d'impact terrain.

---

## 🏗️ Plan principal = niveau 0 + transparence des calques de niveau (v1.67.0)

> KARMA « logique de superposition : un fond noir ou un plan au-dessus fait perdre le sens ». Reco 1:a 2:a 3:a. La chaîne des calques image était déjà saine (embed VERBATIM au générateur — octets bruts, aucun ré-encodage — et rendu `L.imageOverlay` direct → alpha préservé). Les 2 trous étaient ailleurs :

**A — Le plan principal est filtrable comme niveau 0** (`tiling.js > _applyLevelFilterToBasePlan`, appelé par le dispatcher `appliquerFiltreNiveau` d'interfaceConfig) :
- Visible ssi `multiLevel !== true` OU `visibleLevels` contient 0. Masquage NET (2:a).
- Couvre les 3 modes de rendu du base : **direct** (`window._ktaBaseLayers` — nouveau registre, les 2 sites `L.imageOverlay(url, bounds).addTo(map)` ne gardaient AUCUNE référence) · **tuiles runtime V1** (`window._baseTiles`) · **tuiles V2** (`_tilingV2State.activeOverlays` + garde `window._ktaBaseHidden` dans `_renderNiveau` — les tuiles d'un swap de zoom restent hors map mais TRACÉES dans activeOverlays pour le ré-affichage).
- ⚠️ Tout NOUVEAU chemin de rendu du plan principal doit s'enregistrer dans un de ces 3 conteneurs, sinon il échappera au filtre.

**B — Garde-fou transparence au générateur** (`createConf.js`, warning NON-bloquant 3:a) : chaque calque de niveau ≠ 0 est vérifié par CONTENU via `ktaDetecterAlpha` (v1.62.0) — JPEG = opaque d'office, PNG/WebP scannés. Opaque → toast + statut `gen.warn.layerOpaque`. Niveau 0 exclu (une légende opaque est légitime).

**À NE PAS faire** :
- ❌ Ré-encoder les calques image à l'embed (le verbatim EST la garantie d'alpha — cf le contre-exemple historique du tuilage V2 pré-v1.62).
- ❌ Masquer le base par `opacity: 0` (le GPU garde les bitmaps décodées) — `removeLayer` net.
- ❌ Bloquer la génération sur un calque opaque (3:a : l'user peut avoir une raison — on informe, on ne bloque pas).
