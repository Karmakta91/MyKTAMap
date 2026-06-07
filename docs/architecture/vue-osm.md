# Architecture MyKTAMap — Vue OSM (modale + widget HOME)

> Référence détaillée de la roadmap Vue OSM (v1.39.0 → v1.40.25). Lue à la demande.
> Sections : §1 vision · §2 modale `osmView.js` · §3 widget `osmHomePreview.js` · §4 sécurité · §5 pièges connus

---

## 1. Vision

La **Vue OSM** projette les plans MyKTAMap géoréférencés sur OpenStreetMap (EPSG:3857), avec leur image plan en transparence, leurs POI, tracés, zones et structures par-dessus. Deux modules complémentaires :

| Module | Fichier | Contexte | API publique |
|---|---|---|---|
| **Modale full-screen** | `js/osmView.js` (~1300 l) | Map mode (plan chargé) | `window.OsmView = { open, close, isAvailable, isOptedIn, setOptedIn }` |
| **Widget HOME** | `js/osmHomePreview.js` (~900 l) | HOME (aucun plan chargé) | `window.OsmHomePreview = { mount, refresh, selectPlan, openFullScreen }` |

**Lib externe vendored** : `lib/leaflet-imageoverlay-rotated.js` (BSD 2-clause) — rend une image comme parallélogramme via 3 coins (CSS `transform: matrix(…)`). Utilisé pour projeter les tuiles plan en pixel space CRS.Simple vers EPSG:3857 OSM via `KmzExport.buildTransform + planToGps`.

---

## 2. Modale `osmView.js` (v1.39.0 → v1.40.12)

### 2.1 Activation & gates (v1.39.0)

3 garde-fous strict avant l'ouverture de la modale :

```
open()
  ├─ _hasGeoref() ?          (cascade source 1 → 2, cf §2.2)
  ├─ _isV2Plan() ?           (anti-crash mobile v1.39.10)
  ├─ _isStrictOfflineOn() ?
  ├─ _isIncognitoOn() ?
  ├─ _isOnline() ?           (navigator.onLine + ping fiable)
  ├─ isOptedIn() ?           (LS myktamap_osm_view_opt_in)
  └─ _pingThenOpen()         (window._pingInternet 5s timeout)
```

Si pas opt-in : `confirm()` natif explicite avec mention du domaine `tile.openstreetmap.org` + setter LS après accept.

### 2.2 Cascade georef (v1.39.2)

```
_getEffectiveGeoref()
  1. PLAN_CONFIG.plan.georef          (embarqué ZIP via générateur)
  2. KmzExport.getCalibration(planId) (LS myktamap_kmz_calib_<planId>)
```

Source 2 propagée automatiquement depuis source 1 au boot du plan (`_propagerGeorefVersKmzExport` dans `main.js:816`). Cas user qui saisit georef via Réglages map mode → uniquement source 2.

### 2.3 Tuiles V2 + niveau adaptatif + viewport culling (v1.39.10-11)

**v1.39.10 fix crash mobile** : avant, on chargeait l'image complète du plan via `L.imageOverlay.rotated(baseImage, ...)` → OOM iPhone PWA. Depuis v1.39.10, modale **réservée aux plans V2 tuilés** (gate `_isV2Plan()`).

**v1.39.11 niveau adaptatif** :

| Helper | Rôle |
|---|---|
| `_choisirNiveauBaseline(tiling, planW, planH)` | Au boot : choisit niveau le plus zoomé tel que `cols × rows ≤ 20` (~20 MB décodé safe mobile) |
| `_baselineOsmZoom = osmMap.getBoundsZoom(_planBbox)` | Calc 1 fois |
| `_targetLevelForZoom(osmZoom, tiling)` | Mapping dynamique : `delta = osmZoom - baselineOsmZoom`, `targetZ = baseLevel + delta`, clamp `[minNativeZoom, maxNativeZoom]` |
| `_tileIntersectsBounds(tl, tr, bl, mapBounds)` | AABB check + 10% pad pour pré-charger les bordures |
| `_tilesByPath` | `path → {overlay, tl, tr, bl}` pour cull rapide |

Listener `zoomend/moveend` → `_renderLevel(targetZ)` qui swap niveau si changé OU add/remove tuiles cullées sinon.

**Pattern viewport culling AABB** : 4e coin reconstruit par parallélogramme (`br = tr + bl - tl`), test `mapBounds.intersects(tileBbox)`. Pad 10% évite flash au pan rapide.

### 2.4 Layers data (v1.39.12 → v1.39.16)

5 layers indépendants (chacun toggleable dans le bandeau) :

| Layer | State | Sources | Filtres |
|---|---|---|---|
| `_planLayer` (tuiles V2) | `_planTilesVisible` (v1.40.12) | Tuiles `RUNTIME_ASSETS[path]` | — |
| `_poiLayer` | `_poiVisible` | `getEditorPoints` + `getAllEmbeddedPoints` | `FilterPanel.tags` + `activeLevel` |
| `_trackerLayer` | `_trackerVisible` | `getTrackingTimeline` + polling 1s | Niveau timeline complète (pas filtré) |
| `_roadLayer` | `_roadVisible` | `getRoads` + `getAllEmbeddedRoads` (exclut iti) | `FilterPanel.roadTypes` + level |
| `_itiLayer` | `_itiVisible` | `getRoads.find(r => r.type === "itinerary")` | — (singleton iti) |
| `_zoneLayer` | `_zoneVisible` | `getZones` + `getAllEmbeddedZones` | `FilterPanel.zoneTypes` + level |
| `_structLayer` | `_structVisible` | `getStructures` + `getAllEmbeddedStructures` | `FilterPanel.structTypes` + level |

Tracker : polling 1s (`setInterval` clearé dans `close()`), no-op si tracker pas actif (CPU économe).

### 2.5 Multi-LVL (v1.39.16)

| Helper | Rôle |
|---|---|
| `_visibleLevels: Set<number>\|null` | null = mono fallback `activeLevel` (v1.39.12 compat) ; Set non-vide = union |
| `_isLevelAllowed(item)` | Cascade : pas M-LVL → tout passe / Set non-vide → membership / sinon fallback `activeLevel` |
| `_initVisibleLevels()` | Au boot : initialise à `{activeLevel}` (= mode mono strict par défaut) |
| `_toggleLevel(level)` | Toggle in/out du Set + `_refreshLevelFilteredLayers()` |
| `_renderLevelsBar()` | UI chips `N0/N1/…` ligne 2 du bandeau (visible si `multiLevel === true`) |
| `_refreshLevelFilteredLayers()` | Re-render 5 layers level-aware (POI/Roads/Iti/Zones/Structures). Tracker exclu |

### 2.6 UI bandeau (v1.40.12)

Ligne 1 : `🎚️ Opacité slider · 🎯 Plan · 📡 Tracker · 🖼️ Plan · 📍 POI · 📡 Tracé · 🛣️ Routes · 🧭 Iti · 🌐 Zones · 🏗️ Struct`

Ligne 2 (M-LVL) : `🏗️ Niveaux affichés : [N0] [N1] [N2] …`

---

## 3. Widget HOME `osmHomePreview.js` (v1.40.0 → v1.40.16)

### 3.1 Layout HOME (v1.40.0)

PC ≥ 1024px : grille 3 colonnes `2fr 3fr 2fr` (Plans | OSM | Actions). Mobile : pile verticale.

Si opt-in OSM OFF (v1.40.1) : colonne `.loader-col-osm` masquée (`display:none`) + `.loader-grid` reçoit class `kta-no-osm` → grid PC retombe sur `3fr 2fr` (ancien layout 2 cols).

### 3.2 Cas dégénérés (v1.40.0-1)

| Cas | Rendu |
|---|---|
| Pas opt-in OSM | Colonne masquée (v1.40.1) |
| Hors-ligne (`navigator.onLine === false`) | Placeholder "📴 Hors-ligne" |
| Aucun plan georef | Placeholder pédagogique "📍 Aucun plan géoréférencé" avec marche à suivre |
| Plan georef présent | Widget complet (cf §3.3) |

`_listGeorefPlans()` scan `PlanRegistry.getAll()` + check `KmzExport.getCalibration(planId)`. Tri lastOpened desc. **Limitation** : plan avec georef embedded mais jamais chargé en map mode → absent (LS pas propagée).

### 3.3 Extraction ZIP partielle (v1.40.4 → v1.40.16)

Pipeline async à la sélection du plan (cache RAM `_planDataCache[planId]`) :

```
_loadPlanDataForPreview(planId)
  ├─ _getPlanZipFile(planId)
  │   ├─ PlanRegistry.getHandle(planId) + ensureHandlePermission → File (FS Access)
  │   └─ PlanRegistry.getBlob(planId) (IDB blob, mobile fallback)
  ├─ JSZip.loadAsync(file)
  ├─ Extract plan-config.json → parse
  ├─ Pour chaque config.dataLayers[i] :
  │   └─ Extract dataLayers[i].file (cascade 4 chemins fallback)
  │       → { points (json.data\|editorPoints\|points), roads, zones, structures }
  ├─ 🆕 v1.40.6 _extractV2TilesOverview(zip, config)
  │   └─ Niveau adaptatif (cf §3.4)
  ├─ 🆕 v1.40.16 _extractIcons(zip, config)
  │   └─ Approche hybride ZIP custom + URLs app (cf §3.5)
  └─ Return { config, dataLayers, tilesOverview, iconUrls }
```

### 3.4 Tuiles V2 widget HOME (v1.40.6 → v1.40.11)

`_chooseTileLevelForHome(tiling, planW, planH)` :

```js
const MAX_TILES_HOME = 80;  // v1.40.11 (12 → 40 → 80)
for (let z = maxNativeZoom; z >= minNativeZoom; z--) {
  const scale = Math.pow(2, -z);
  const cols = Math.ceil(Math.ceil(planW / scale) / tileSize);
  const rows = Math.ceil(Math.ceil(planH / scale) / tileSize);
  if (cols * rows <= MAX_TILES_HOME) return z;
}
return tiling.minNativeZoom;  // fallback safety pour plans extrêmes
```

**Résultats par taille plan** :

| Plan | Niveau v1.40.11 | Tuiles | RAM décodée |
|---|---|---|---|
| 4K Catacombes | z=0 natif | 40 | 40 MB |
| 8K | z=-1 | 40 | 40 MB |
| 12K | z=-2 | 24 | 24 MB |
| 16K | z=-2 | 64 | 64 MB |
| 32K+ | minNative | ≤80 | ≤80 MB |

**Pas de viewport culling dynamique** dans le widget (carte fixe, pas de zoom user). Toutes les tuiles sont chargées d'un coup.

Render : `L.imageOverlay.rotated(url, tl, tr, bl, { interactive: false, opacity: _planOpacity })`. Pattern identique à `osmView.js > _renderTilesV2OnOsm` (convention CRS.Simple `pxTop = planH - k * tileSize * scale`).

**Slider opacité** (v1.40.6) : `_setPlanOpacity(v)` itère `_tilesLayer.eachLayer` + `setOpacity`. Default `_planOpacity = 0.7`.

### 3.5 Icônes POI — Approche hybride (v1.40.13 → v1.40.16)

**Diagnostic v1.40.15** révéla que les chemins type `lib/leaflet/images/marker-icon.png` et `icon/house.png` dans `config.icons` sont des **URLs relatives vers les icônes de l'app** (servies par le serveur web, cachées par le SW MyKTAMap), **PAS** des fichiers stockés dans le ZIP. Le générateur n'inclut dans le ZIP que les icônes **custom uploadées** par l'user (cf `createConf.js:2770 iconFolder.file(name, ...)`).

**Pattern hybride v1.40.16** :

```js
async function _resolveIcon(tag, path) {
  // 1. Tentative extraction ZIP (icône custom user)
  let entry = zip.file(path) || zip.file(path.replace(/^\.?\//, ""));
  if (!entry && path.includes("/")) {
    entry = zip.file("icon/" + path.split("/").pop());
  }
  if (entry) {
    iconUrls[tag] = URL.createObjectURL(await entry.async("blob"));
    _iconBlobUrls.push(iconUrls[tag]);
    return;
  }
  // 2. Fallback URL relative app : browser résout vers <origin>/<path>
  //    → servi par SW MyKTAMap, cache hit instant
  iconUrls[tag] = path.replace(/^\.\//, "");
}
```

Cohérent avec `getIconUrlForPoint` (`utils.js:38`) qui fait pareil pour la map principale.

### 3.6 Couleurs roads natives (v1.40.13)

`ROAD_STYLES_DATA_HOME` aligné sur `utils.js > ROAD_STYLES_DATA` :

| Type | Couleur |
|---|---|
| principal | `#00ff00` vert |
| secondaire | `#b000ff` violet |
| chemin | `#ffff00` jaune |
| jonction | `#ff4ecb` rose |

Cascade dans `_renderDataLayersOnMiniMap` :
```js
const color = r.color || ROAD_STYLES_DATA_HOME[r.type] || "#8892a4";
```

**Structures** : `STRUCT_STYLES_HOME` variant LIGHT (weight/fillOpacity allégés) aligné sur `structures.js > STRUCTURE_STYLES`. Adaptatif polyline (fronts) ou polygon (mur/pilier).

### 3.7 Sub-layers + filtres catégorie (v1.40.12)

Refactor `_renderDataLayersOnMiniMap` pour répartir POI/Roads/Zones/Structures dans des sub-layerGroups indépendants (`_poiSubLayer`, `_roadsSubLayer`, `_zonesSubLayer`, `_structSubLayer`). Parent `_dataLayer = L.layerGroup()`.

5 toggles dans la 2e ligne du bandeau (`.kta-osm-home-toggles`) : `🖼️ Plan · 📍 POI · 🛣️ Routes · 🌐 Zones · 🏗️ Struct`. Default ON.

Helpers `_toggleTiles`, `_togglePoi`, `_toggleRoads`, `_toggleZones`, `_toggleStructures` → `add/removeLayer` sur le sub-group correspondant.

### 3.8 Plein écran inline (v1.40.2)

`openFullScreen()` toggle classe `.kta-osm-home-fullscreen-active` sur `#ktaOsmHomeBox` → `position: fixed; inset: 0; z-index: 9999`. Bind/unbind keydown Escape. `setTimeout(map.invalidateSize, 100)` après transition pour que Leaflet recalcule.

**Pas de bascule en map mode** (v1.40.0-1 essayaient ça via sessionStorage + simulation clic → cassé car sélecteurs HTML faux). Choix v1.40.2 : juste agrandir le widget en overlay, l'user reste sur HOME.

### 3.9 Cache RAM

Structure `_planDataCache[planId]` :
```
{
  config:        plan-config.json parsed,
  dataLayers:    [{name, visible, points, roads, zones, structures}],
  tilesOverview: {tiles: [{col, k, url}], planW, planH, z, scale, tileSize},
  iconUrls:      {tag: url}  // mélange blob URLs (custom ZIP) + URLs relatives (app)
}
```

Trackers de cleanup :
- `_tilesBlobUrls[]` — blob URLs des tuiles V2
- `_iconBlobUrls[]` — blob URLs des icônes custom ZIP

Cache cleared au unload page (RAM-only, pas de LS). Re-sélection plan déjà vu = instant.

---

## 4. Sécurité & privacy

| Aspect | Comportement |
|---|---|
| Opt-in | LS `myktamap_osm_view_opt_in`, default OFF |
| Pas opt-in | Modale : alert pédagogique / Widget HOME : colonne masquée |
| Hors-ligne strict | Modale : `NetworkAudit.isStrictOfflineEnabled()` → toast warn |
| Incognito | Modale : `IncognitoMode.isActive()` → toast warn |
| Hors-ligne navigator | Both : message "📴 Hors-ligne" |
| Tiles OSM | Uniquement `tile.openstreetmap.org/{z}/{x}/{y}.png` (attribution OSM) |
| Aucun cookie ou tracking | `crossOrigin: true` mais pas de credentials |
| `kta:osmOptInChange` event | Listener dans osmHomePreview pour refresh widget si toggle change pendant la session |
| **Bouton « 📍 Moi » (v1.40.18)** | `navigator.geolocation.getCurrentPosition` — 1 fix ponctuel à la demande user, JAMAIS `watchPosition`. Permission OS demandée à la demande (pas au boot). Marker + cercle accuracy en RAM only — JAMAIS persistés en LS/IDB/cookie, JAMAIS envoyés réseau. Reset au close modale + au refresh widget. Présent dans osmView (`_showMyGpsPositionOsm` + state `_myGpsMarker` / `_myGpsAccuracyCircle`) et dans osmHomePreview (`_showMyGpsPositionHome` + state `_myGpsMarkerHome` / `_myGpsAccuracyCircleHome`). |
| **Gating modes vie privée (v1.40.19)** | Widget HOME : ajout helpers `_isStrictOfflineOn` + `_isIncognitoOn` (parité modale) + nouveaux renderers `_renderStrictOffline` / `_renderIncognito` appelés AVANT `_renderOffline` au `mount()`. Bouton GPS : désactivé visuellement (`disabled` attribute) au build modale si strict/incognito au moment du `open()` + early return runtime dans `_showMyGpsPositionOsm` / `_showMyGpsPositionHome` (toast warn) pour le cas où l'user active ces modes PENDANT que la modale est ouverte. `navigator.onLine === false` ne bloque PAS le GPS (le GPS device marche sans Internet). |
| **Header Permissions-Policy requis (v1.40.20)** | ⚠️ Pour que `navigator.geolocation.getCurrentPosition` fonctionne, le header serveur DOIT autoriser `geolocation=(self)`. Le default Nginx restrictif `geolocation=()` (en place v1.0 → v1.40.19) rejette l'API AVANT le prompt OS avec `crbug.com/414348233`. Configs mises à jour : `docs/nginx-csp-config.conf` (prod, ligne 141) + `docker/nginx-docker.conf` (self-host Docker, ligne 116). Cohérent avec `microphone=(self)` qui existait déjà pour la commande vocale E1. Déploiement prod = manuel par KARMA (FTP / redémarrage Nginx). |
| **Garde-fou GPS hors champ plan (v1.40.21)** | Helpers `_getPlanGpsBbox()` (modale) / `_getPlanGpsBboxHome()` (widget) : projettent les 4 coins du plan via `_proj` + dims `imageWidth/Height` → `L.latLngBounds`. Au moment du fix GPS reçu, on étend la bbox via `bounds.pad(0.5)` (+50% chaque côté, marge généreuse) puis check `padded.contains([lat, lng])`. Si hors → toast warn avec distance Haversine au centre + console log + **pas de marker affiché** (privacy : aucune trace visuelle si user à des km du plan supposé). Si bbox impossible à calculer (dims manquantes, georef absente) → fallback safe : on autorise (= comportement v1.40.18-20 préservé). Marge `0.5` choisie pour être permissive : un fix à la frontière du plan reste accepté, seul un vrai "ailleurs" (autre ville, autre pays) déclenche le refus. |
| **Popups POI cliquables widget HOME (v1.40.22)** | Fix CSS `overflow: hidden` → `overflow: visible` sur `.kta-osm-home-content` qui clippait silencieusement les popups Leaflet. Bouton `bindPopup` enrichi : `autoPan: true` + `autoPanPaddingTopLeft: L.point(20, 60)` + `maxWidth: 240` + `className: "kta-osm-popup"` pour activer auto-pan + clamp largeur + style charte. Idem modale OsmView (className + autoPan + maxWidth: 280). |
| **Style popup POI charte dark (v1.40.22)** | Nouvelle classe CSS `.leaflet-popup.kta-osm-popup` (~60 lignes dans `style.css`) qui override le default Leaflet (fond blanc) pour appliquer la charte sombre : fond `#1a1f2e`, bordure `rgba(244, 197, 66, 0.35)` accent jaune, box-shadow soft, border-radius 8px, nom POI en `#f4c542`, close button discret. Variant `body.kta-theme-light` : fond `--kta-light-bg-elevated` + accent or sombre `#8b6a14`. Appliqué partout via le `className` passé au `bindPopup` (modale + widget HOME). |
| **Modale Vue OSM élargie WQHD/4K (v1.40.22)** | `max-width: 1200px → 1800px` + `height: 90vh → 92vh` côté `_buildModal()` osmView.js ligne 1028. En WQHD (2560×1440) la modale passe de 47% → 70% de la largeur écran. En 4K (3840) elle reste plafonnée à 1800px (le `width: 96vw` ne s'applique plus) — acceptable car 1800px reste large. Pas de breakpoint mobile à toucher (`96vw` gère). |
| **Suppression markers calibrage A/B widget HOME (v1.40.24)** | `_renderGeorefMarkers()` ne rend plus les 2 circle markers (vert/rouge) + la polyline pointillée jaune (`dashArray: "6 4"`) entre A et B qui chargaient visuellement la mini-carte. Le `_markerLayer` est conservé (layerGroup vide) pour compat. Le `fitBounds` initial est désormais calculé directement via `L.latLngBounds([llA, llB])` au lieu de `_markerLayer.getBounds()` — résultat identique, juste sans rendu visuel. Côté modale OsmView : RAS, aucun marker georef n'y était jamais rendu (le plan apparaît via les tuiles V2 / image overlay directement). |
| **Popup POI description prééminente (v1.40.25)** | KARMA : popup affichait le `tag` (genre "default") au lieu de la `description` du POI. Refonte HTML popup (modale + widget HOME, cohérence stricte) : ligne 2 = `description` si présente (sinon fallback `tag`), ligne 3 mini = `🏷️ tag` réduit en `opacity: 0.75` + `font-size: 10.5px` + `color: #8892a4` pour debug. Niveau M-LVL toujours en suffixe ligne 2. `max-width: 260px` ajouté pour les descriptions longues. Modale auparavant ignorait totalement `p.description` (oubli initial v1.39.12). |
| **Filtre tag local (v1.40.17)** | Chips ligne 3 bandeau modale (`_osmLocalTagFilter: Set\|null`) + ligne 3 bandeau widget (`_homeTagFilter: Set\|null`). AND avec FilterPanel global côté modale. Reset au close modale. Indépendants entre les 2 modules par design. |
| **POI cliquables widget HOME (v1.40.17)** | Markers POI passés en `interactive: true` + `bindPopup(nom + tag + level + description)`. Parité avec modale OsmView qui avait déjà ce comportement. |

---

## 5. Pièges connus & conventions

⚠️ **`asset.url` partagé** : pour les tuiles V2 modale, `RUNTIME_ASSETS[path].url` est créé dans `osmView.js` MAIS partagé avec `tiling.js` (map principale). **NE PAS revoke** au `close()` de la modale OSM — casserait la map principale. Documenté en commentaire dans `_resolveTileUrl`.

⚠️ **Plans V1 (non tuilés)** : v1.39.10 a ajouté un gate strict — modale Vue OSM réservée aux plans V2. Plan V1 → alert pédagogique. Widget HOME : skip tuiles V2 mais affiche POI/Roads/data via georef.

⚠️ **Plans très grands (32K+)** : fallback `minNativeZoom` accepté (= flou résiduel). Au-delà de MAX_TILES_HOME (80) ou MAX_TILES_BASELINE (20), pas de meilleur niveau possible.

⚠️ **`config.icons` paths sont des URLs app** : `"icon/house.png"` n'est PAS dans le ZIP, c'est une URL relative vers `<origin>/icon/house.png`. Le générateur n'inclut dans le ZIP que les icônes **custom** uploadées par l'user. v1.40.16 gère ça via approche hybride (cf §3.5).

⚠️ **Auto-mount widget** : `osmHomePreview.js` auto-mount au DOMContentLoaded + listener `kta:osmOptInChange` pour refresh. Si user toggle opt-in via Configuration → widget réapparaît/disparaît auto.

⚠️ **Cache RAM widget** : `_planDataCache[planId]` ne LRU pas. Acceptable car typiquement <10 plans georef par user. Si fuite RAM observée → ajouter cap LRU 5 plans + revoke blob URLs des plans évincés.

⚠️ **Constantes `STRUCT_STYLES_OSM` (modale) et `STRUCT_STYLES_HOME` (widget)** : dérivées de `structures.js > STRUCTURE_STYLES`. Si tu modifies STRUCTURE_STYLES, sync les 2 constantes ici.

⚠️ **Constants `ITI_*` (modale)** : `ITI_COLOR = "#00d4ff"`, `ITI_WEIGHT = 5`, `ITI_DASHARRAY = "10 6"` alignées sur `road.js:56 > ROAD_TYPES.itinerary`. Sync si changement là-bas.

⚠️ **TAGS_BUILTIN_HOME (widget)** : aligné sur `map.js > TAGS_BUILTIN` (20 tags cataphile). Sync si TAGS_BUILTIN change.

⚠️ **ROAD_STYLES_DATA_HOME (widget)** : aligné sur `utils.js > ROAD_STYLES_DATA` (4 types). Sync si ROAD_STYLES_DATA change.

⚠️ **Format JSON data layers** : `json.data` ou `json.editorPoints` pour POI (NOT `json.points`). Cf v1.40.5 bug fix.

⚠️ **`MAX_TILES_BASELINE` modale (20) vs `MAX_TILES_HOME` widget (80)** : modale fait swap dynamique au zoom → 20 au boot, monte vers z=0 si user zoom. Widget a carte fixe → besoin de monter direct à z=0 pour la même netteté.

---

## 6. Pour étendre

**Ajouter un toggle catégorie au widget HOME** :
1. Ajouter sub-layerGroup dans le state (e.g. `_newCatSubLayer`)
2. Helper toggle `_toggleNewCat(visible)` (pattern existing)
3. Ajout sub-layer dans `_renderDataLayersOnMiniMap` selon `_showNewCat`
4. Ajout `_renderToggle("ktaOsmHomeShowNewCat", "emoji", "Label", _showNewCat, "title")` dans `.kta-osm-home-toggles`
5. Bind dans `_bindToggle("ktaOsmHomeShowNewCat", _toggleNewCat)`

**Ajouter une catégorie à la modale OsmView** :
1. State `_newCatVisible = true`, helpers `_toggle…`
2. Layer `_newCatLayer = L.layerGroup().addTo(_osmMap)` dans `_renderMap`
3. Rendu `_renderNewCat()` (pattern POI/Roads)
4. Refresh hook : ajouter dans `_refreshLevelFilteredLayers()` si level-aware
5. Toggle UI dans le bandeau

**Étendre `TAGS_BUILTIN_HOME` ou supporter un nouveau tag** :
1. Ajouter dans `map.js > TAGS_BUILTIN` (= source de vérité)
2. Sync `osmHomePreview.js > TAGS_BUILTIN_HOME`
3. S'assurer que `icon/<tag>.png` existe dans `sw.js > ASSETS_TO_CACHE` pour la cache PWA
