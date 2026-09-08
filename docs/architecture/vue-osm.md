# Architecture MyKTAMap — Vue OSM (modale + widget HOME)

> 🌍 **v1.90.2 — L'OPT-IN DEVIENT UN OPT-OUT.** Décision KARMA : *« active le mode OSM par défaut, dans 99 %
> des cas ce mode est utilisé »*. `myktamap_osm_view_opt_in` est **tri-état** et c'est tout l'intérêt :
> `"1"` accepté → ON · `"0"` **refusé explicitement → OFF, jamais réécrasé** · absent → **ON** (le changement).
>
> 🩸 **Ce n'est pas un réglage d'affichage.** Le widget du HOME monte une carte Leaflet dont le fond vient de
> `tile.openstreetmap.org` : actif par défaut, **l'accueil contacte un tiers au chargement, sans clic**, pour
> qui possède au moins un plan géoréférencé. C'est la seule requête sortante de l'app. Elle ne transporte
> **aucune donnée de plan** — seulement les coordonnées des tuiles regardées.
>
> 🚨 **`isOptedIn` est DUPLIQUÉ** : `osmView.js` (modale) et `osmHomePreview.js` (widget). Les faire diverger
> donne un widget affiché sans bouton dans la modale, ou l'inverse. `check-osm-defaut.js` **exécute les deux**
> sur les 4 états de la clé et refuse qu'ils répondent différemment.
>
> 📣 **Le défaut s'annonce** : tant que la clé est absente, `_afficherBandeauDefaut` pose un bandeau dans le
> widget ; le valider écrit `"1"` — l'implicite devient explicite. ⚠️ C'est une **notification**, pas un
> consentement préalable : les premières tuiles sont déjà demandées quand il s'affiche. Assumé, et écrit tel
> quel dans `NETWORK_AUDIT`.
>
> 🩸 **`_listGeorefPlans` NE VOIT QUE CE QUI A ÉTÉ OUVERT.** Elle lit le géoréf à deux endroits : le
> localStorage (saisie manuelle) et `p.georef` du registre — mais ce dernier n'est écrit qu'au **chargement**
> du plan (`main.js > _propagerGeorefVersKmzExport`). Un plan jamais ouvert peut donc être parfaitement calibré
> dans son propre `plan-config.json` et rester invisible. Le message d'état distingue désormais **trois**
> situations (v1.90.2, remarque KARMA) : bibliothèque vide · des plans mais aucun jamais ouvert · des plans
> ouverts et aucun calé — ce dernier annonçant en plus le **nombre de plans jamais ouverts**, dont la
> calibration est *inconnue*, pas absente.
>
> ⚠️ **On ne va pas la chercher pour le savoir** : il faudrait ouvrir chaque ZIP, ou demander au réseau le
> `plan-config.json` de chaque plan serveur — autant de requêtes que de plans, au chargement de l'accueil, pour
> un widget que l'utilisateur n'a peut-être pas regardé. On dit la vérité sur ce qu'on sait.
>
> 🚨 **Les clés de ces messages sont construites dynamiquement** (`"osm_home." + cle + ".title"`) :
> `check-i18n` ne peut pas les voir. `check-osm-defaut.js` §7 **exécute** le rendu sur les trois scénarios et
> confronte les clés demandées aux trois dictionnaires — sans quoi une faute de frappe sortirait un libellé
> humanisé en production, sans un mot.
>
> 🔒 **Restent prioritaires sur le défaut** : hors-ligne strict, incognito, hors-ligne réel, aucun plan
> géoréférencé — testés dans `mount()` **après** l'opt-in, et le garde-fou tient cet ordre.

> Référence détaillée de la roadmap Vue OSM (v1.39.0 → v1.43.8). Lue à la demande.
> Sections : §1 vision · §2 modale `osmView.js` · §3 widget `osmHomePreview.js` · §4 sécurité · §5 pièges connus · §6 extension · §7 synergie Mode Secours · §8 cache OSM offline (v1.43.0 → v1.43.8)

---

## 🌐 Le widget du HOME et les plans SERVEUR (v1.89.0)

🩸 **Jusqu'ici, le widget ne rendait RIEN pour un plan servi.** `_loadPlanDataForPreview` passait **exclusivement** par le ZIP — `PlanRegistry.getHandle()` (FS Access) ou `getBlob()` (IndexedDB) — qu'un plan serveur n'a **ni l'un ni l'autre**. Symptôme en console : `[OsmHomePreview] ZIP non récupérable pour planId=server_… (FS handle absent + IDB blob purgé)`. **Ce n'était pas une régression** : ce module n'avait aucun chemin HTTP.

`_loadPlanDataServeur(plan)` produit la **même** sortie `{ config, dataLayers, tilesOverview, iconUrls }`, en HTTP :

- le `plan-config.json` passe par **`resolveServerPaths`**, exactement comme au chargement réel — sinon l'aperçu et le mode plan divergeraient sur les mêmes fichiers ;
- les tuiles sont demandées à la racine **SONDÉE** (`ktaResoudreRacineTuiles`, `tiling.js`) : la deviner ici rejouerait le bug de la v1.88.3 ;
- les icônes sont déjà des URLs utilisables après résolution — **rien à extraire** ;
- 🛟 **aucune blob URL n'est créée** côté serveur : rien à révoquer, donc rien à fuir, contrairement à la voie ZIP qui doit gérer son cycle de vie (cf `_iconBlobUrls`).

🛡️ Vérifié par `scripts/check-tiling.js` §18, qui **exécute** le chargeur dans un `vm` avec `fetch` stubé et contrôle que la branche serveur est prise **avant** la voie ZIP.

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

Source 2 propagée automatiquement depuis source 1 au boot du plan (`_propagerGeorefVersKmzExport` dans `main.js:816` — copie l'objet ENTIER, `pointC` compris). Cas user qui saisit georef via Réglages map mode → uniquement source 2.

**📐 Point C optionnel (v1.73.0, KARMA « erreurs de projection sur un assemblage »)** : `georef`/calib acceptent un `pointC {x,y,lat,lng}` → `KmzExport.buildTransform` passe en **affine 6 DOF** (échelles X/Y indépendantes + cisaillement, résolue exactement sur les 3 correspondances par Cramer dans le repère mètres équirectangulaires). Sans C : similitude 2 points **bit-à-bit identique** à avant. C quasi colinéaire avec A-B (2×aire < `MIN_PLAN_DISTANCE²·0.05`) → repli 2 points + `degenereC: true` (les UIs de saisie refusent franchement, le moteur replie silencieusement pour un C venu d'un ZIP). **Tous les consommateurs passent par `buildTransformCalib(calibOuGeoref)`** (12 sites migrés : osmHomePreview ×2, osmView, emergencyMode, gpxIO ×2, sessionExporter ×3, utils ×2, searchPoints, secoursMode, interfaceConfig, createConf — seul `gpxImport` garde le 4-args, calibrage synthétique par bounds). ⚠️ `metresParPixel`/`rotation` restent dérivés de A/B même en affine (affichage d'échelle = approximation assumée). ⚠️ La modale KMZ de sessionExporter n'édite que A/B : `_kmzLireCalib` **fusionne le pointC stocké** avant `setCalibration`, sinon chaque save KMZ écraserait l'affine. Limite documentée user : corrige une déformation GLOBALE, pas les erreurs locales morceau par morceau d'un assemblage.

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

~~**Pas de viewport culling dynamique** dans le widget~~ → **obsolète depuis v1.77.0**, voir §3.4bis.

Render : `L.imageOverlay.rotated(url, tl, tr, bl, { interactive: false, opacity: _planOpacity })`. Pattern identique à `osmView.js > _renderTilesV2OnOsm` (convention CRS.Simple `pxTop = planH - k * tileSize * scale`).

### 3.4bis Tuiles HI-RES au zoom (v1.77.0)

Bug KARMA : « un plan X est très flou si je zoome [au HOME], alors qu'il est lisible en mode OSM plan ». Cause : le widget n'avait QUE le niveau baseline (≤80 tuiles, très réduit sur un gros plan), là où la modale swape de niveau au `zoomend`.

Mécanisme (bloc `TUILES HI-RES` de `osmHomePreview.js`) :
- `zoomend/moveend` → débounce 300 ms → `_majTuilesHiRes()` (garde anti-réentrance `_hiResBusy` + re-planification).
- Par plan de la pile (`_stackOrder` ∪ principal) : niveau cible = le plus grossier dont la largeur (`planW/2^-z`) couvre la **largeur écran du plan** (coins bas projetés via `latLngToContainerPoint`). Si le baseline suffit → hi-res retiré.
- Culling : seules les tuiles intersectant `getBounds().pad(0.15)` sont extraites, budget `HIRES_BUDGET_TUILES = 60`/plan — dépassé → un cran plus grossier.
- Extraction depuis le **handle JSZip gardé dans `_planDataCache[planId].zip`** (lazy : central directory seul, RAM négligeable) — pas de re-parse du ZIP.
- Rendu AU-DESSUS du baseline (même pane par plan, `_zIndexPour(planId)+1`) → jamais de trou pendant le chargement ; le baseline reste le filet.
- Pan à niveau constant : **delta** (tuiles communes réutilisées, sorties révoquées). Swap de niveau / plan retiré / carte recréée : `_retirerHiRes` révoque tout. Garde anti-race : la carte capturée avant les `await` doit être la même à la pose de l'état.
- Opacité/visibilité : `_setPlanOpacity`, `_setOpaciteExtra` et `_appliquerVisibilites` pilotent aussi les groupes hi-res.

**Blob URLs — deux régimes distincts** (réparation v1.77.0 d'un faux fix de l'audit code-mort du 09/08) :
- *baseline* : vivent avec `_planDataCache`, **jamais révoquées en session** (design v1.71.0 — re-ajout d'un plan gratuit, cache borne l'extraction à 1×/plan). La révocation ajoutée par l'audit cassait le multi-plans (charger B révoquait les URLs de A encore affiché).
- *hi-res* : éphémères, révoquées à chaque swap/sortie/refresh.

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

Cascade **v1.77.0** (bug KARMA « galerie principale reste verte en OSM », puis « OSM PLAN OK mais pas OSM HOME ») — deux mécanismes DIFFÉRENTS selon la vue :

**Modale `osmView`** (session live chargée) — le canon passe avant les tables locales :
```js
explicit (r.color) → ktaResolveStyle(cat, type, {flat:true})  // override légende live
                   → table locale → findCustomEntry → "#8892a4"
```

**Widget HOME `osmHomePreview`** — PAS ktaResolveStyle : le canon applique l'état LIVE de `LegendCustomization`, qui au HOME est soit **vide** (boot froid = le cas normal, on est au HOME avant de charger un plan), soit celui du **dernier plan chargé** (faux pour les autres plans de la pile). Résolution **PAR PLAN** (bloc `OVERRIDES DE LÉGENDE PAR PLAN`) :
- `_legendeDe(planId)` : lit le slot SessionPersist du plan (`localStorage myktamap_session_v1_<id>` → `payload.customLegend`, auto-savé ~1,5 s en mode plan) puis le `customLegend` du plan-config du ZIP (double-lecture `plan.customLegend`/racine comme `loadPlanState`). Cache RAM par planId, invalidé à chaque `mount()`.
- Cascade : explicit → `colors["<cat>.<type>"]` du slot (session > plan) → table locale (défauts canon) → `customEntries` du slot → `findCustomEntry` live (dernier recours) → gris.
- Zones : bordure = `borders[...]` explicite sinon dérivée via `window.ktaAssombrir(fill, 0.62)` (helper du canon exposé v1.77.0 — même relation visuelle que le mode plan). Structures : couleurs seules, les variantes locales gardent leurs weight/fillOpacity allégés.

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

---

## 7. Synergie Mode Secours × Vue OSM (v1.41.0+)

### 7.1 API publique étendue

```js
window.OsmView = {
  open, close, isAvailable, isOptedIn, setOptedIn,
  // 🆕 v1.41.0 (B+C) — helper exposé pour briefing pompiers PDF
  getPlanGpsBbox: _getPlanGpsBbox    // retourne L.latLngBounds | null
}
```

### 7.2 Lazy build de la projection (v1.41.2)

Avant v1.41.2, `_getPlanGpsBbox()` retournait `null` si `_proj` n'était pas initialisé (= modale jamais ouverte). Fix : si `_proj` null, appelle `_buildProjection()` à la volée.

```js
function _getPlanGpsBbox() {
  let proj = _proj;
  if (!proj || typeof proj.planToLatLng !== "function") {
    proj = _buildProjection();  // 🆕 lazy : pure, lit PLAN_CONFIG.osmGeoref
    if (!proj) return null;
  }
  // ... calcul bbox depuis 4 coins du plan via proj.planToLatLng
}
```

`_buildProjection()` est **pur** (lit `_getEffectiveGeoref()` + `KmzExport.buildTransform`) → safe à appeler hors UI context. Le cache `_proj` reste utilisé en premier (perf identique pour ouvertures suivantes).

**Cas d'usage** : `genererBriefingPompiersPDF(scenarioId)` (Mode Secours) appelle `OsmView.getPlanGpsBbox()` pour récupérer la bbox + centre afin de générer les liens cliquables OSM/Google Maps dans le PDF — sans avoir besoin que l'utilisateur ait ouvert la modale OSM au préalable.

### 7.3 Fix chips tags Vue OSM (v1.41.3 → 41.4)

**Bug racine** : `_enumerateOsmTags()` itérait sur `window._dataLayersByPlan[planId]` qui **n'est défini nulle part** dans l'app (jamais peuplé). Conséquence : seuls ~3 tags de la session étaient comptés, les POI des calques data étaient ignorés.

**Fix** (v1.41.4) : utiliser `window.getAllEmbeddedPoints()` (API officielle, même source que `_collectVisiblePoi` pour le rendu markers OSM).

```js
function _enumerateOsmTags() {
  const counts = {};
  // Session + POI principaux
  if (typeof window.getEditorPoints === "function") {
    for (const p of (window.getEditorPoints() || [])) {
      if (!p || typeof p.x !== "number") continue;
      const t = (Array.isArray(p.tags) && p.tags[0]) || "default";
      counts[t] = (counts[t] || 0) + 1;
    }
  }
  // 🆕 v1.41.4 — Data layers via API officielle (avant : _dataLayersByPlan inexistant)
  if (typeof window.getAllEmbeddedPoints === "function") {
    for (const p of (window.getAllEmbeddedPoints() || [])) {
      if (!p || typeof p.x !== "number") continue;
      const t = (Array.isArray(p.tags) && p.tags[0]) || "default";
      counts[t] = (counts[t] || 0) + 1;
    }
  }
  return counts;
}
```

**Pas de filtre `_isLevelAllowed`** (v1.41.3) : la liste des chips reflète TOUS les tags du plan peu importe le M-LVL actif (cohérent avec `osmHomePreview._collectAvailableTags`). Le filtre par level reste appliqué au RENDU des markers via `_renderPoi`.

⚠️ **Pattern à retenir** : avant d'utiliser un global suspect, faire `grep -r "<symbol>"` pour valider qu'il est bien défini quelque part. Sinon = mort-vivant qui passe inaperçu pendant des versions.

### 7.4 Nouveau tag built-in `entree_plan` (v1.41.0 D)

Voir `add-icon-tag` skill pour les 7 sites à toucher. Particularité : icône SVG vectorielle inline (`data:image/svg+xml;utf8,...`) au lieu d'un fichier PNG → pas besoin d'ajouter à `sw.js > ASSETS_TO_CACHE`. Catégorie « 🚨 Secours » ajoutée dans `GROUPES` (interfaceLegende × 2) + `GROUPES_ICONES` (exporter).

---

## 8. Cache OSM offline (v1.43.0)

### 8.1 Vue d'ensemble

Permet à l'utilisateur de **précharger les tuiles `tile.openstreetmap.org`** correspondant à la vue actuelle, afin de garder la Vue OSM consultable **hors-ligne** (typique : descente en cata, terrain sans réseau). Disponible dans 3 contextes UI partageant le **même store IndexedDB** :

| Contexte | Bouton UI | Module |
|---|---|---|
| Modale Vue OSM (plan georef) | Bandeau « 💾 Cacher offline » | `osmView.js` |
| Widget Vue OSM HOME | Bandeau compact « 💾 » | `osmHomePreview.js` |
| Mode Secours (icône 🌍) | Hérite modale Vue OSM (même bouton) | `secoursMode.js` → `OsmView.open` |

### 8.2 Architecture modules

```
js/osmTilesCache.js (NOUVEAU, ~280 lignes)
  ├─ IDB : "myktamap_osm_tiles" (DB v1) > store "tiles" { key: "z/x/y", blob: Blob, addedAt: ISO }
  ├─ API : init() / cacheVisibleTiles(map, opts) / getCachedTile(z,x,y) / hasCachedTile /
  │        getStats() / hasCacheForBbox(bbox, zoom) / clear() / enumerateTilesForBbox(bbox, zoom)
  ├─ Helpers : _lat2tileY / _lng2tileX (slippy tilenames OSM convention)
  └─ Constantes : MAX_TILES_PER_CACHE = 200 (politique OSM)

sw.js (modifié)
  └─ fetch handler : si URL match tile.openstreetmap.org/{z}/{x}/{y}.png
     ├─ _osmTilesCacheLookup(z,x,y) → ouvre IDB local, retourne Blob ou null
     ├─ hit → new Response(blob, {200, Content-Type:image/png, X-OSM-Cache:hit})
     └─ miss → fetch réseau normal (fallback offline = 504)

js/osmView.js (modifié)
  ├─ Bouton bandeau "#kta-osm-cache-btn" + span stats "#kta-osm-cache-stats"
  ├─ _runCacheOsmTiles(btn) → cacheVisibleTiles(_osmMap, {onProgress})
  ├─ _refreshOsmCacheStats() → affiche stats dans bandeau
  ├─ _planHasCachedTiles (bool sync) + _recheckCachedForCurrentPlan() (async)
  ├─ _isOnlineOrCached() = _isOnline() OR _planHasCachedTiles
  └─ isAvailable() utilise _isOnlineOrCached → autorise ouverture offline si cache présent
  Exposé : window.OsmView.recheckOfflineCache

js/osmHomePreview.js (modifié)
  ├─ Bouton "#ktaOsmHomeCacheBtn" + span "#ktaOsmHomeCacheStats" dans footer
  ├─ _runCacheTilesHome() / _refreshCacheStatsHome()
  └─ Après cache → notifie OsmView.recheckOfflineCache() (sync gate offline modale)

index.html : <script src="js/osmTilesCache.js" defer> AVANT osmView.js / osmHomePreview.js
sw.js > ASSETS_TO_CACHE : ./js/osmTilesCache.js
```

### 8.3 API `window.OsmTilesCache`

```js
window.OsmTilesCache = {
  init,                    // Promise<IDBDatabase> — idempotent
  cacheVisibleTiles,       // (map, {onProgress, zoomDelta=1}) → Promise<{cached, skipped, total}>
  getCachedTile,           // (z, x, y) → Promise<Blob|null>
  hasCachedTile,           // (z, x, y) → Promise<boolean>
  getStats,                // () → Promise<{count, sizeBytes, oldest, newest}>
  hasCacheForBbox,         // (bbox: L.LatLngBounds, zoom: number) → Promise<boolean>
  clear,                   // () → Promise<void>
  enumerateTilesForBbox    // (bbox, zoom) → Array<{z, x, y}> (utilitaire, sync)
}
```

**`cacheVisibleTiles(map, opts)`** : itère sur 3 niveaux de zoom (`zoomActuel - 1`, `zoomActuel`, `zoomActuel + 1`), énumère les tuiles couvrant `map.getBounds()`, plafonne à `MAX_TILES_PER_CACHE = 200` (politique OSM tile usage). Pour chaque tuile : skip si déjà en IDB, sinon `fetch()` puis `idb.put({key, blob, addedAt})`. Progress callback à chaque tuile pour mettre à jour le bouton.

### 8.4 Service Worker — interception transparente

Le SW intercepte les requêtes `tile.openstreetmap.org/{z}/{x}/{y}.png` **avant** qu'elles ne partent sur le réseau :

```js
// sw.js : fetch handler
if (/tile\.openstreetmap\.org\/(\d+)\/(\d+)\/(\d+)\.png/.test(url)) {
  const [, z, x, y] = url.match(...);
  const cachedBlob = await _osmTilesCacheLookup(z, x, y);
  if (cachedBlob) {
    return new Response(cachedBlob, {
      status: 200,
      headers: { "Content-Type": "image/png", "X-OSM-Cache": "hit" }
    });
  }
  return fetch(event.request);  // offline = 504 natif Leaflet
}
```

Bénéfices :
- **Zéro modification Leaflet** : `L.tileLayer` continue de demander `tile.openstreetmap.org/...` comme avant
- **Transparence offline** : si la tuile est en IDB → servie instantanément ; sinon réseau ; sinon 504 (placeholder Leaflet)
- **Header `X-OSM-Cache: hit`** pour debug DevTools

### 8.5 Gate offline (autoriser ouverture sans réseau)

Avant v1.43.0, `OsmView.isAvailable()` bloquait l'ouverture si `navigator.onLine === false`. Désormais :

```js
async function _isOnlineOrCached() {
  if (_isOnline()) return true;
  // Hors-ligne : tente d'ouvrir si on a déjà des tuiles cachées pour ce plan
  return _planHasCachedTiles;
}
```

`_planHasCachedTiles` est un **bool synchrone** (state local) recalculé par `_recheckCachedForCurrentPlan()` qui appelle `hasCacheForBbox(planBbox, baselineZoom)`. Lancé :
- Au chargement d'un plan georef
- Après chaque clic « 💾 Cacher offline » (modale ou widget HOME)
- Sur demande externe via `window.OsmView.recheckOfflineCache()`

Pattern **sync gate + async refresh** : permet à `isAvailable()` de rester synchrone pour les callers (notamment widget HOME et Mode Secours), tout en restant cohérent avec l'état IDB.

### 8.6 Privacy & politique OSM

| Aspect | Comportement |
|---|---|
| Surface réseau | Aucune nouvelle URL — uniquement les `GET https://tile.openstreetmap.org/{z}/{x}/{y}.png` existants, juste pré-déclenchés au moment du clic « Cacher » |
| Cache local | 100% client (IndexedDB local), jamais transmis ni synchronisé |
| Politique OSM | `MAX_TILES_PER_CACHE = 200` par clic + 3 niveaux de zoom seulement (actuel ±1) = bulk-download raisonnable, conforme à l'esprit du [Tile Usage Policy](https://operations.osmfoundation.org/policies/tiles/) |
| Cookies / tracking | Idem que sans cache : `crossOrigin: true` mais pas de credentials |
| Strict offline / Incognito | Le bouton « Cacher » est masqué/désactivé dans ces modes (les tuiles seraient bloquées par le gate `_isStrictOfflineOn` avant même d'arriver au SW) |

### 8.7 Pièges & conventions

⚠️ **Ordre de chargement** : `osmTilesCache.js` DOIT être chargé AVANT `osmView.js` et `osmHomePreview.js` dans `index.html` (sinon `window.OsmTilesCache` undefined au boot de la modale/widget).

⚠️ **Service Worker activation** : après mise à jour du SW (`CACHE_NAME` bumpé), l'utilisateur DOIT rafraîchir/relancer la PWA pour que le nouveau fetch handler (interception OSM) soit actif. Avant ça, le cache IDB se remplit normalement mais les tuiles ne sont pas servies depuis l'IDB.

⚠️ **Slippy tilenames OSM** : convention `z/x/y` avec `y` top-down ([wiki OSM](https://wiki.openstreetmap.org/wiki/Slippy_map_tilenames)). Helpers `_lat2tileY` / `_lng2tileX` collés sur cette convention. Si on étend à d'autres providers (Mapbox, MapTiler…), vérifier leur convention de tile y (certains utilisent TMS bottom-up).

⚠️ **Pas de TTL / LRU** sur le cache IDB v1.43.0 — l'user gère manuellement via bouton « Vider cache » futur (ou via DevTools). Acceptable car volume borné par `MAX_TILES_PER_CACHE = 200` par clic et l'user choisit explicitement quoi cacher.

⚠️ **`hasCacheForBbox` est approximatif** : il vérifie que la bbox est couverte au zoom baseline (= au moment où l'utilisateur a cliqué « Cacher »). Si l'user a caché à un zoom différent de la bbox du plan, le gate peut renvoyer faux négatif → l'ouverture offline est refusée alors que des tuiles existent. Compromis acceptable car simple à debug ("tu n'as pas caché ce plan"). **→ Levé en v1.43.6 via mode any-zoom (cf §8.8)**.

### 8.8 Évolution v1.43.1 → v1.43.8 — fixes & robustesse

Suite à la sortie de v1.43.0, 8 patches successifs ont consolidé la feature (gates, UX, SW robustness, faux-négatifs offline). Récap :

| Version | Sujet | Cause racine | Fix |
|---|---|---|---|
| **v1.43.1** | Gate offline async | `_isOnlineOrCached()` lisait `_planHasCachedTiles` au boot AVANT que `_recheckCachedForCurrentPlan()` ne se soit résolu → flag stale → ouverture refusée même avec cache présent | `open()` rendu async + `await _recheckCachedForCurrentPlan()` JIT juste avant le gate (recheck systématique au moment du clic, plus de course IDB) |
| **v1.43.2** | Refresh immédiat bouton 🌍 | Toggle opt-in OSM via Configuration mettait à jour le LS, mais le bouton Vue OSM dans la map mode ne s'actualisait qu'au polling 2s suivant → ressentait laggy | Dispatch event `kta:osmOptInChange` chaque fois que `setOptedIn()` mute le flag + listener côté `main.js` qui appelle `_refreshOsmButton()` → refresh < 16ms |
| **v1.43.3** | Widget HOME — overlay « plan non caché » | Le widget HOME affichait OSM même si l'utilisateur n'avait jamais caché le plan sélectionné → en mode avion = tuiles cassées sans feedback | Ajout flag `_anyCachePresent` + overlay pédagogique « 📴 Plan non caché — clique 💾 pour télécharger » via `hasCacheForBbox(bboxA↔B)`. **Cache global partagé** : un plan A caché côté modale OSM est automatiquement détecté par le widget HOME (et inversement) |
| **v1.43.4** | UX position bouton | Bouton « 💾 » au milieu du bandeau, peu visible | Repositionnement juste après « 📍 Moi » (groupe d'actions utilisateur) |
| **v1.43.5** | SW robustesse | Pertes réseau intermittentes au moment de l'install du SW → certains assets critiques de l'app shell loupés silencieusement → boot cassé hors-ligne ensuite | Ajout `CRITICAL_APP_SHELL` (sous-ensemble obligatoire) + helper `_cacheWithRetry` (3 essais avec backoff) au moment de l'install + **self-heal au `activate`** : si un asset critique manque, on retente avant d'autoriser le SW à servir |
| **v1.43.6** | `hasCacheForBbox` any-zoom | Le hardcode `zoom=14` faisait des faux-négatifs : si l'user avait caché à zoom 12 ou 16 (selon `getBoundsZoom`), `hasCacheForBbox` cherchait à 14 et renvoyait false → gate offline refusait l'ouverture | Signature étendue `hasCacheForBbox(bbox, zoom?)` : si zoom omis, on scanne 10→18 sur le **centre de la bbox** et on renvoie true au premier hit. Levée du compromis §8.7 |
| **v1.43.7** | Bypass `_pingThenOpen` | En mode avion, `_pingThenOpen()` (timeout 5s vers `ping.html`) affichait le toast « Internet ne répond pas » avant l'ouverture, alors qu'on a explicitement un cache local exploitable | Si `_planHasCachedTiles === true` → bypass complet du ping, on ouvre direct. Cohérent avec la sémantique « cache présent = autorisé même offline » |
| **v1.43.8** | UX i18n label | « Cacher offline » = jargon FR ambigü (verbe « cacher » au sens dissimuler) | Renommage en **« Save Offline »** (terme international compris partout, partagé avec la convention Google Maps / OSM Editor) |

### 8.9 Garanties d'isolation cache global

KARMA : *« si je cache Paris depuis la modale, et que j'ouvre Lyon depuis le widget HOME, est-ce que je risque de voir les tuiles parisiennes ? »*. Réponse : **non**, voici pourquoi.

**Le store IDB est GLOBAL (un seul store `tiles`)** :
- Pas de partitionnement par `planId`
- Une seule DB `myktamap_osm_tiles` partagée entre modale, widget HOME, Mode Secours

**MAIS l'isolation est NATURELLE via l'indexation `z/x/y` géographique** :

```
Clé IDB = "z/x/y" (slippy tilenames OSM, EPSG:3857)
  ├─ Plan Paris (lat ~48.85, lng ~2.35) → tuiles z=14, x∈[8290..8294], y∈[5635..5639]
  ├─ Plan Lyon  (lat ~45.75, lng ~4.85) → tuiles z=14, x∈[8388..8392], y∈[5817..5821]
  └─ Plan NYC   (lat ~40.71, lng ~-74)  → tuiles z=14, x∈[4824..4828], y∈[6157..6161]

→ Clés disjointes par construction (positions géographiques différentes)
→ Aucune collision possible, aucune fuite cross-plan
```

**Bénéfices concrets** :
- ✅ **Dédup automatique** si 2 plans overlap géographiquement (e.g. deux plans dans Paris) → 1 seule copie de la tuile partagée
- ✅ **Cacher depuis modale OSM = visible depuis widget Home** (et vice-versa) — c'est ce que KARMA voulait, et c'est ce qui rend la feature « universelle » (peu importe d'où l'user déclenche le cache, ça profite à tous les contextes Vue OSM)
- ✅ **Pas de gestion de "qui possède quoi"** côté code : chaque plan demande ses tuiles via `hasCacheForBbox(planBbox)`, et la réponse dépend uniquement de la couverture géographique réelle

**Limite** : pas de mécanisme « purge tuiles d'un plan spécifique » (volontaire — on purge tout via `clear()` ou rien). Si un user veut nettoyer les tuiles parisiennes après avoir supprimé son plan Paris, il faut « Vider le cache » global. Acceptable car les tuiles OSM sont publiques (pas de risque privacy) et borné (200 max par clic).


## 🔎 Mode OSM — lot 1 : recherche locale + sémantique « mode » (v1.70.0)

> Topo « 2 projets » KARMA 30/07/2026 : **OSM prioritaire** (gain user direct), mode serveur community ensuite. Décisions : recherche **locale-only** (« pas de sortie internet ») · avertissements perf plutôt que cap dur (2:b) · widget HOME conservé tel quel (3:a).

**Constat qui a réduit le lot** : le fullscreen du widget (`osmHomePreview.openFullScreen`) EST déjà un mode plein écran, et `_loadPlanDataForPreview` lit déjà les données d'un plan **non chargé**. Lot 1 livré dans `osmHomePreview.js` (pas de nouveau module) :

- **Recherche** (`#ktaOsmHomeSearch`, visible uniquement via `.kta-osm-home-fullscreen-active`) : plans géoréférencés + leurs POI. Index **paresseux** à la première saisie ; extraction **séquentielle** des ZIP (un `Promise.all` sur N JSZip = pic RAM mobile) ; cache RAM `_planDataCache` partagé avec le rendu. Un POI est projeté via le georef de **SON** plan — jamais celui du plan sélectionné. Résultat → `selectPlan` + `flyTo` (retries bornés : la carte se recrée après un selectPlan) + circleMarker doré + popup.
- **Avertissement perf** : `_avertirPerfModeOsm()` — 1× (LS `myktamap_osm_mode_warn_v1`). Le seuil « > 3 plans » du lot 2 passera par la même fonction.
- **⛶** : mêmes clés i18n, valeurs retitrées « Ouvrir le mode OSM ».

**⚠️ Pièges** :
- Le champ des dataLayers extraits est **`points`** (pas `pois` — 1er bug de ce lot, attrapé au grep).
- `_listGeorefPlans()` ne voit que les calibs **localStorage** (`KmzExport.getCalibration`) : un plan dont le georef n'est QUE dans le ZIP (jamais ouvert) est invisible du mode OSM — limitation existante du widget, assumée au lot 1.
- z-index des résultats : 1000 (au-dessus des panes Leaflet ~700).

**Feuille de route** : lot 2 (v1.71) = multi-plans images + gestionnaire de calques (visibilité / opacité / ordre par glisser) + avertissement > 3 plans · lot 3 (v1.72) = croisement de données (collecteurs tracés/zones réutilisables depuis `_loadPlanDataForPreview`) + liaisons portails dessinées entre plans.


## 🗂️ Mode OSM — lot 2 : multi-plans (v1.71.0)

**Pile** : `_stackOrder` (index 0 = au-dessus, principal INCLUS) · `_extraLayers[planId]` = {tiles, data, poi, roads, zones, struct} · `_extraOpacity`. zIndex = `200 + rang×5`, posé à la création des overlays et via `setZIndex` au réordonnancement (pas de re-render). RAM-only.

**Refactor pivot** : `_renderTilesInto(groupe, tilesData, georef, opacité, zIndex)` + `_renderDataLayersOnMiniMap(data, georef, cible?)` — les rendus du principal et des plans ajoutés partagent LE MÊME code (les 33 refs internes sont aliasées `dataL/poiL/...`). ⚠️ Toute évolution du rendu data doit rester compatible avec les DEUX chemins (module vs cible).

**Règles** :
- Le plan sélectionné (dropdown) = **principal** : fitBounds, slider bandeau, ◉ dans le panneau, non retirable. `selectPlan` le REMPLACE à la même position de pile ; sélectionner un plan déjà ajouté le retire d'abord de la pile extra (ses couches renaissent dans les groupes module).
- **Visibilité à 2 niveaux** (retour KARMA en cours de lot) : les cases du bandeau restent des **masters globaux**, et chaque ligne du panneau porte **5 chips par plan** (🖼️📍🛣️🌐🏛️). Visibilité effective = global ET par-plan, appliquée par **`_appliquerVisibilites()`** — applicateur UNIQUE appelé par les toggles globaux, les chips, et après chaque rendu (le bloc `if (_showPoi) dataL.addLayer(...)` de fin de rendu est ensuite corrigé par l'applicateur). ⚠️ Ne jamais re-manipuler les sous-groupes directement dans un toggle : tout passe par l'applicateur.
- ⚠️ Clé i18n du chip tuiles = `osm_home.toggle.plan.label` (PAS `.tiles.` — piège vécu).
- **Gestion en MODALE dédiée** (2e retour KARMA, remplace le panneau flottant puis la pastille) : bouton **≡** du bandeau → modale « 🎚️ Plans & filtres OSM » (pattern ≡ Filtres du mode plan, `z-index 100001` au-dessus du fullscreen). `_renderMultiPanel()` cible les ids DANS la modale (gardes d'existence) — le contenu reste vivant pendant qu'elle est ouverte. ⚠️ Escape : handler en **capture + stopPropagation**, sinon l'Escape fermerait AUSSI le mode OSM (handler fullscreen en phase bulle sur `document`).
- **Modale ≡ enrichie (4e retour KARMA)** : 3 sections — **Affichage** (5 chips globaux libellés, ex-checkboxes du bandeau), **🏷️ Tags** (chips agrégés sur TOUTE la pile via `_planDataCache`, clic → `_reRenderDataTous()` = re-render data du principal ET des extras + `_appliquerVisibilites`), **🗂️ Plans** (pile). Le **wrapper collapsible du widget est SUPPRIMÉ** (opacité bandeau, 5 checkboxes, chips tags, bouton 🔼 + ses binds — l'oubli d'un bind aurait fait un TypeError) ; `_renderTagChips` supprimée (conteneur disparu). La carte du widget gagne toute la hauteur libérée. ⚠️ Clés i18n `osm_home.opacity.*`, `osm_home.tagfilter.title`, `osm_home.controls.*` : vérifier l'orphelinage avant toute purge (osmView modale en partage certaines).
- **Recherche dans la LIGNE DE TITRE « 🌍 Vue OSM »** (3e retour KARMA) : le nœud `#ktaOsmHomeSearch` est rendu dans le contenu puis **déplacé** dans `.loader-section-head` (listeners conservés, ancien exemplaire purgé à chaque re-render) → visible en mode réduit ET en mode OSM. Input compact 30 px en réduit, 36 px en fullscreen.
- Opacité **par plan** ; la ligne du principal et le slider bandeau sont synchronisés dans les deux sens.
- Blob URLs des tuiles : JAMAIS révoquées au retrait (elles vivent dans `_planDataCache`, partagées avec un éventuel usage principal) — re-ajout gratuit.
- Garde anti-race : `_extraLayers[planId] !== g` après l'extraction ZIP async → abandon silencieux.
- Avertissement `> 3` plans : 1× par session (`_warnedMulti`), même canal toast que le warn d'ouverture.

**🧅 Panes par plan (v1.72.2)** : l'ordre de pile vit sur des **panes Leaflet dédiés** (`ktaOsmPlan_<id>`, zIndex 200+rang×5 posé sur le pane) — c'est la SEULE façon d'ordonner images ET vecteurs ensemble (les zIndex d'imageOverlay n'ordonnent que les images ; les L.Path ignorent `pane`, il faut leur donner un **`renderer: L.svg({pane})`** dédié). ⚠️ À la recréation de `_mapInstance`, `_panesParPlan` DOIT être vidé (les panes appartiennent à la carte détruite). ⚠️ Le principal doit être semé dans `_stackOrder` dès le rendu initial (chemin `_renderWidget` qui ne passe pas par `selectPlan`) — sinon pas de ligne ◉ ni d'opacité ni de tags pour lui.

**👁️ Datalayers `visible: false` (fix v1.73.1)** : `_renderDataLayersOnMiniMap` **ne skippe plus** les calques marqués non visibles (`if (!layer.visible) continue` supprimé — il sautait le calque ENTIER, tracés et zones compris). Raison : `layer.visible` est un défaut d'affichage du **MODE PLAN**, retoggable là-bas via ⊞ Calques ; la Vue OSM n'ayant aucun toggle par calque, le skip = **zéro voie d'affichage**. L'affichage est désormais gouverné par les filtres existants (chips catégories globales + par plan, tags). Effet assumé : un calque volontairement masqué par défaut apparaît en Vue OSM. `layer.visible` reste **parsé** (si des toggles par calque arrivent un jour dans la modale ≡). ⚠️ La modale OSM du **mode plan** n'est pas concernée : elle lit les calques vivants de la carte, pas le plan-config.

### 🏷️ Ajout de la pile PAR ÉTIQUETTE DE PLAN (v1.84.0)

**Le trou comblé** : `plan.tags` existait depuis la v1.78.0 (registre, saisi depuis la bibliothèque, normalisé par `PlanRegistry.setTags` — 12 × 24 car.), la pile multi-plans depuis la v1.71.0. **Aucun lien** : `_listGeorefPlans` ne rapatriait même pas `tags`, et le seul chemin d'ajout était le `<select>` unitaire. Un atlas départemental découpé en vingt plans se montait donc en vingt gestes.

**UI** — modale 🎚️ Plans & filtres, section `#ktaOsmMultiTagsSect` / `#ktaOsmMultiTags`, **au-dessus** du `<select>` (qui reste). Un chip par étiquette portée par **≥ 2** plans géoréférencés, libellé + compteur `dans/total`. Rendu par `_renderMultiTags()`, appelée depuis `_renderMultiPanel()` — **point de rendu unique** : tout ce qui modifie la pile passe déjà par là.

⚠️ **Homonymie dans la même modale** : la section « 🏷️ Filtrer par tag » (`#ktaOsmFiltersTags`, `_renderModalTags`) filtre les **POI à l'intérieur** des plans affichés ; celle-ci choisit **quels plans** sont affichés. Deux notions, deux mots identiques — d'où l'intitulé explicite « étiquette de plan » (`osm_mode.multi.tagsTitre`).

**Les trois règles non évidentes**

| Règle | Pourquoi |
|---|---|
| Regroupement **insensible à la casse** (`_etiquettesDesPlans`, clé minuscule → `{libelle, ids}`) | `setTags` dédoublonne les étiquettes **d'un** plan, jamais **entre** plans. « Gironde » + « GIRONDE » = deux chips montrant chacun la moitié de leurs plans. Ne se voit que si on a tapé les deux orthographes |
| Chip masqué à **1 seul plan** | Le `<select>` juste en dessous fait déjà ce travail ; vingt chips à un plan noieraient les deux qui servent |
| Clic **asymétrique** (`_basculerEtiquettePlans`) : ajoute les **manquants**, ne retire que si **tous** présents | Ré-ajouter un plan déjà monté le dupliquerait dans `_stackOrder`. Et sans le retrait groupé, vingt plans se défont en vingt clics sur des ✕ |

**Charge — deux garde-fous, PAS une mesure.** ⚠️ La pile n'a **jamais** été éprouvée à 5/10/20 plans réels : c'est une dette ouverte de la v1.84.0, à lever sur le terrain (un plan issu d'un atlas porte couramment 5 000 objets).

1. `_ajouterPlansOsm` **confirme avant** si le lot fait ≥ 2 plans **et** ferait dépasser 3 dans la pile — le seuil est **celui de `_avertirMultiSiBesoin`** (arbitrage KARMA 2:b), pas un nombre inventé. Cet avertissement-là prévient *après* coup : sur un lot, ça veut dire une fois les vingt plans montés, donc trop tard pour renoncer.
2. `_ajouterPlanOsm` est **coupé en deux** : `_monterPlanOsm` (synchrone — pousse dans `_stackOrder`, crée les `layerGroup`) et `_chargerDataPlanOsm` (asynchrone — `_loadPlanDataForPreview`, donc **extraction ZIP**). Un lot monte tout, rend **une** fois, puis enchaîne les chargements **en série** (`montes.reduce(...)`). Vingt extractions lancées ensemble figeraient l'onglet. Symétrique au retrait : `_demonterPlanOsm` (sans rendu) + `_retirerPlansOsm` (rendu unique).

**Protection du principal** : `_retirerPlansOsm` saute `_selectedPlanId`. Sans ça, la ceinture v1.72.2 de `_renderMultiPanel` le remettrait dans la pile au rendu suivant — état incohérent entre le chip (« 0/12 ») et la carte. Le chip retombe donc à `1/12` après un retrait groupé, ce qui est la vérité.

**Garde-fou** : `scripts/check-osm-etiquettes.js` (pré-commit **bloquant**), code **extrait** de `osmHomePreview.js` — 12 assertions de logique + 6 de câblage (le `tags` transporté, le conteneur, l'appel de rendu, la confirmation, la protection du principal, le `reduce` en série).

**Reste au lot 3 (v1.72)** : croisement fin (filtres par plan ?, popups enrichis cross-plan), liaisons portails dessinées entre plans sur OSM.

---

## 🏷️ Icônes POI en Vue OSM : une seule source (v1.81.0)

**Le bug.** En Vue OSM plein écran, un point portant le tag **`portail`** (l'icône
vortex des liaisons inter-plans) s'affichait comme un **petit rond jaune de rayon 4**
au lieu de son icône. Idem pour **`entree_plan`** — dont le commentaire d'origine dit
pourtant « Vue OSM × Mode Secours ». Découvert par KARMA le 02/09/2026 en testant
D5 : les icônes manquantes l'empêchaient de repérer ses portails sur la carte.

**Pourquoi.** `js/osmHomePreview.js` dessine des plans qui **ne sont pas chargés** —
il lit leur ZIP — sur un HOME affiché **avant** tout plan. Il ne peut donc pas passer
par `window._iconMap`, qui est le résolveur du plan **courant**. Il en gardait donc une
copie locale, `TAGS_BUILTIN_HOME`, avec ce commentaire :

> « Cohérence stricte avec map.js — si `TAGS_BUILTIN` change là-bas, sync ici. »

La sync a été oubliée **deux fois** : `entree_plan` (v1.41.0) et `portail` (v1.59.0).
Quand un tag est inconnu, `_extractIcons` ne résout rien et le rendu tombe sur le
`circleMarker` de secours. Le module le **savait** et l'écrivait —
`⚠️ Tags POI sans icône : portail(N)` — mais en `console.log`, dégradé depuis
`console.warn` en v1.40.15 : noyé dans le bruit, et invisible du smoke qui ne
surveille que les erreurs.

**Le piège qui a fait durer le bug.** `window._ktaBuiltinIconUrls` existait déjà
(v1.76.0), mais l'affectation vivait **à l'intérieur de `creerIcones()`** : la globale
n'apparaissait donc qu'**après le chargement d'un plan**. Sur le HOME, elle était
`undefined`. La consommer telle quelle aurait donné un bug **intermittent** — icônes
correctes si l'utilisateur avait déjà ouvert un plan dans la session, absentes sinon.
C'est pire qu'une copie franche.

**Le fix.** `TAGS_BUILTIN` est remontée au **top-level** de `js/map.js` et exposée
immédiatement ; `osmHomePreview` lit `window._ktaBuiltinIconUrls || TAGS_BUILTIN_HOME`.
La copie locale subsiste en **filet de secours** (si `map.js` n'était pas chargé) et
n'est plus la source.

**Verrou.** `scripts/check-icon-catalog.js` (pré-commit **bloquant**, falsifié 4×)
confronte les deux tables **dans les deux sens**, vérifie que le HOME lit bien la
globale, et que celle-ci est exposée **au top-level** (une ligne à la colonne 0 =
hors de toute fonction — c'est tout l'enjeu). *Un commentaire « sync ici » n'a rien
empêché pendant deux versions ; un test, si.*

⚠️ **Ce qui est prouvé** : la globale est disponible sur le HOME avec ses 22 tags
alors que `_iconMap` est encore vide (donc `creerIcones` n'a pas tourné), le fichier
`icon/portail.png` existe et est précaché, et le smoke reste vert. **Ce qui ne l'est
pas** : le rendu de l'icône sur un vrai point portail d'un plan géoréférencé — à
valider par KARMA, c'est ce qui débloque le test de D5.

---

## 📐 Écart de calage des liaisons (D5, v1.81.0)

**L'objection qui a façonné la feature.** Le premier jet dessinait une polyligne
entre les deux bouts de chaque portail. KARMA a relevé le défaut le 02/09 : *deux
portails correctement calés se superposent déjà*. La ligne est alors de longueur
nulle et le calque **ne montre rien** dans le cas nominal — l'utilisateur ne sait
même pas s'il fonctionne. Ce n'est donc pas un calque de contenu, c'est un
**détecteur d'erreur de calage** : sa seule valeur est le cas raté.

**Ce qui est livré** (arbitrage du 03/09 — contrôle qualité *et* affichage dans
🌀 Mes liaisons) :

| Où | Quoi |
|---|---|
| `InterPlanLinks.ecartCalage(link)` | le calcul, **fonction unique** |
| 🌀 **Mes liaisons** (HOME) | un badge `📐 Écart de calage : N m` par ligne |
| **Vue OSM** → 🎚️ Filtres → chip 🌀 | liste classée **du pire au meilleur**, clic = `fitBounds` sur les deux bouts |
| **Vue OSM** (calque) | la polyligne dorée + les deux bouts, en complément |

**Le calcul.** Les deux bouts d'un portail désignent le même endroit physique vu
depuis deux plans. Projetés en GPS via le géoréf de **leur** plan respectif, ils
devraient tomber au même point ; la distance qui les sépare mesure la qualité du
calage. C'est la seule mesure de ce genre que l'app puisse produire — il faut
**deux** géoréfs pour la révéler.

`ecartCalage` retourne **`null`, jamais `0`**, quand la mesure est impossible
(plan absent, pas de géoréf) : `0` voudrait dire « calage parfait », le contraire
de « je ne sais pas ». Dans 🌀 Mes liaisons, une liaison non mesurable n'affiche
**rien** — ni tiret ni « n/a » : la grande majorité des plans n'étant pas
géoréférencée, une colonne vide partout ferait croire à un défaut.

**Aucun seuil de couleur, volontairement.** 20 m d'écart, c'est énorme sur une
petite carrière et négligeable sur un réseau de 5 km. Colorer reviendrait à juger
à la place de l'utilisateur avec un seuil qui ignore son échelle. On donne le
chiffre, il tranche.

**Contrainte.** La liste OSM ne compte que les liaisons dont les **deux** plans
sont affichés dans la pile *et* géoréférencés — un écart qu'on ne peut pas montrer
sur la carte devant soi n'aide personne ; celui-là se lit dans 🌀 Mes liaisons.

⚠️ **État de validation au 03/09.** `ecartCalage` et le badge de 🌀 Mes liaisons
sont **prouvés au harnais** : sur deux plans calés à 33 m l'un de l'autre, l'API
renvoie 33 m et le badge l'affiche ; une liaison dont un plan n'a pas de géoréf
renvoie `null` et n'affiche rien. La **liste de la Vue OSM n'a PAS pu être
exécutée** : le mode plein écran exige des plans réellement chargeables (ZIP), que
le harnais ne sait pas fabriquer — le bouton 🎚️ n'existe qu'une fois ce mode
ouvert. À valider sur un vrai jeu de plans géoréférencés.

---

## 📝 Le travail de session en Vue OSM (v1.81.0)

**Le symptôme, remonté par KARMA le 03/09** : « je ne vois pas mes points en OSM
HOME ». Ils étaient créés **en session**. `_loadPlanDataForPreview` ne lit que le
**ZIP** (plan-config + dataLayers) : tout ce qui n'a pas été exporté restait
invisible.

**Ce qui rendait la situation intenable** : la **recherche cross-plan les trouvait
déjà** — `InterPlanLinks.collectPointsForPlan` lit la session depuis toujours.
Une carte qui n'affiche pas ce que la recherche renvoie est indéfendable. Le
module lisait d'ailleurs *déjà* la session pour les **couleurs de légende**
(`payload.customLegend`) : il allait chercher les couleurs, pas les objets qui les
portent.

**Le correctif.** Un **calque virtuel** bâti sur `SessionPersist.getSaved(planId)`
— API qui existait déjà, aucune fonction nouvelle. Le payload porte exactement les
4 familles que la Vue OSM sait rendre (`editorPoints`, `roads`, `zones`,
`structures`), aux mêmes noms de champs : aucune conversion.

🩸 **Pourquoi la lecture se fait au RENDU et non à l'extraction du ZIP** :
`_planDataCache` **n'est jamais invalidé** — il vit toute la durée de la page. Y
ranger la session la figerait au premier affichage : on édite en mode plan, on
revient au HOME, on voit l'état d'avant. La lecture au rendu coûte un `getItem` +
un `JSON.parse` par plan affiché, négligeable devant l'extraction ZIP, et elle est
toujours fraîche.

**Les trois consommateurs passent par `_tousCalques(data, planId)`** — le rendu,
les chips de filtre par tag, et l'index de recherche du HOME. En oublier un
donnerait un point affiché dont le tag manque aux chips : **masqué dès qu'un
filtre est posé**, sans que rien ne l'explique.

**Choix d'affichage** (arbitrage KARMA : les 4 familles, et un calque identifiable) :

- chip global **📝 Session**, **ON par défaut** — le masquer par défaut ferait
  chercher l'utilisateur exactement comme aujourd'hui ;
- posé **hors de `_CATS`**, comme le chip 🌀 : la session n'est pas une catégorie
  d'objets mais une **origine de données**, transversale aux 4 familles ;
- le popup d'un POI de session porte « 📝 Session en cours — pas encore dans le
  plan ». *La Vue OSM montre l'état **enregistré** des plans ; y mêler du travail
  non exporté sans le nommer créerait une confusion pire que son absence.*

**Limites connues** :

- `getSaved` **rejette un payload dont la `version` diffère** de celle de
  `sessionPersist.js` (1 aujourd'hui). Une vieille session ne s'affichera pas —
  cohérent avec le reste de l'app, mais silencieux.
- Si le ZIP d'un plan est irrécupérable, `_renderDataLayersOnMiniMap` n'est pas
  appelé du tout : **sa session ne s'affiche pas non plus**. Le plan n'ayant ni
  fond ni tuiles, l'afficher seul n'aurait pas de sens.
- Pas de déduplication avec les dataLayers. Session et calques du plan sont deux
  ensembles distincts ; le seul recouvrement possible vient d'un export « baked »
  qui a figé la session dans le ZIP. `collectPointsForPlan` vit déjà avec ce cas
  sans dédupliquer — on reste cohérent plutôt que d'inventer une règle ici.

⚠️ **État de validation au 03/09.** `SessionPersist.getSaved` renvoie bien les 4
familles au harnais (2 points, 1 tracé, 1 zone, 1 structure lus), les 4 clés i18n
résolvent en fr/en/es, le smoke est vert et les 308 contrôles des garde-fous
passent. **Le rendu n'a PAS pu être exécuté** : le widget OSM reste bloqué sur
« ⏳ Préparation… » en headless — il lui faut une connectivité réelle pour les
tuiles. C'est une limite du harnais, pas du correctif : **aucune** partie de la
Vue OSM n'est testable automatiquement aujourd'hui. À valider sur l'appareil.

---

## 8. Le géoréf a TROIS sources, et le HOME n'en lisait qu'une (v1.82.0)

| Source | Contenu | Lue par la modale (`osmView`) | Lue par le widget HOME |
|---|---|---|---|
| `PLAN_CONFIG.plan.georef` | géoréf embarqué dans le ZIP | ✅ depuis v1.39.2 | ❌ *impossible* — aucun plan chargé au HOME |
| `KmzExport.getCalibration(id)` | saisie utilisateur (localStorage) | ✅ depuis v1.39.2 | ✅ |
| `PlanRegistry` → `plan.georef` | **🆕 v1.82.0** — déposé au chargement | — | ✅ second recours |

🩸 **Le même défaut avait été trouvé et corrigé d'un seul côté.** `osmView.js`
a gagné sa cascade à deux sources en v1.39.2 (« je vois pas l'icône »). Le
widget du HOME ne l'a jamais reçue, et son en-tête érigeait le manque en
**« limitation acceptable »** : l'utilisateur n'avait qu'à saisir sa géoréf une
fois en mode plan.

C'était défendable tant qu'une géoréf se saisissait à la main. **L'import SIG
l'a rendu faux** : il produit des plans calés *par construction*, dont personne
n'a de raison de ressaisir les points — et c'étaient précisément ceux qui
manquaient à la liste (signalé par KARMA : « les plans issus de SIG
n'apparaissent pas dans la liste vue OSM »).

**Correction.** Le HOME ne peut pas lire `PLAN_CONFIG`. Le registre, lui, il le
lit déjà : `main.js > _propagerGeorefVersKmzExport` y dépose donc le géoréf du
plan à son chargement, et `_listGeorefPlans` s'en sert en second recours.

Priorité inchangée : **le localStorage d'abord**. Il porte la voix de
l'utilisateur ; le registre ne porte que la donnée propre du plan.

⚠️ **Ce qui reste hors d'atteinte** : un plan enregistré sans avoir jamais été
chargé. En pratique un ZIP importé est chargé dans la foulée, donc le cas se
limite aux plans serveur déclarés dans `data/index.json` — qui pourraient
porter leur géoréf dans cette déclaration si le besoin se présente.

---

## 9. Mesurer en Vue OSM — distance + surface (v1.83.0)

Bouton 📏 dans la barre du widget HOME. Clics successifs = sommets ; segment
étiqueté à sa longueur, total et surface dans un bandeau flottant ; ↩ retire le
dernier point, 🗑️ vide, ✕ quitte.

🩸 **`measure.js` n'est pas réutilisable — et c'est une bonne nouvelle.** Le
module du mode plan (442 lignes) est bâti sur `convertCoord` et
`APP_CONFIG.scale` : il travaille en **pixels d'un plan**, divisés par une
échelle calibrée. En Vue OSM il n'y a pas *un* plan (il y en a plusieurs
empilés, chacun avec la sienne) et il n'y a **pas besoin d'échelle** : les
coordonnées sont déjà des latitudes et des longitudes.

> Une mesure faite ici est donc **structurellement plus fiable qu'en mode plan** :
> elle ne dépend d'aucun calibrage. C'est exactement la source du bug vécu sur le
> relevé SIG — 480 m annoncés contre 1 644 réels, parce que l'échelle du plan
> était fausse. Ici, la question ne se pose pas.

| Grandeur | Méthode | Précision |
|---|---|---|
| **Distance** | `L.latLng.distanceTo` — géodésique (Haversine, rayon moyen IUGG) | exacte au mètre sur nos ordres de grandeur |
| **Surface** | projection **équirectangulaire locale** centrée sur le barycentre, longitude corrigée par `cos(latitude)`, puis **formule du lacet** | < 1 % sur quelques kilomètres |

On ne prétend pas mieux sur la surface : une surface géodésique exacte
demanderait une projection équivalente, et la précision gagnée serait très
inférieure à celle d'un tracé fait à la main.

**Prouvé contre des valeurs connues**, pas contre lui-même : 1° de latitude
≈ 111,2 km, 1° de longitude à 45°N ≈ 78,6 km, un carré de 0,01° à 44,8°N.
7 cas dans `check-api-surface.js`, avec un `distanceTo` de référence
**indépendant du code testé**. Falsifiés : retirer la correction `cos(lat)` fait
tomber la surface, retirer la valeur absolue fait tomber le sens de parcours.

*C'est la leçon de l'import SIG — 34 tests verts qui ne prouvaient que la
cohérence du code avec ses propres suppositions.*

---

## 10. Largeur des fronts : la Vue OSM applique la loi du mode plan (v1.83.0)

KARMA : « en mode OSM c'était pas mal, mais on peut faire aussi bien qu'en mode
plan, ça reste encore limite ».

🩸 **Ce qui tenait lieu de solution était un accident.** Le commentaire posé en
v1.82.0 le disait déjà : le rendu convenait parce que le repli des types
personnalisés tombe sur le gabarit « mur » (`weight: 2`). Consigné au backlog
plutôt que corrigé à l'aveugle — demander le `weight` au canon aurait ramené
10 px et refait l'aplat.

### Une loi, trois consommateurs

La loi est désormais formulée sur la seule grandeur que les trois partagent :
des **pixels rendus par mètre de terrain**.

| Contexte | px/m |
|---|---|
| Écran, mode plan | `APP_CONFIG.scale × 2^zoom` |
| Export PNG/PDF | `APP_CONFIG.scale × résolution` |
| **Vue OSM** | `1 / résolution Web Mercator` |

Les deux premiers passent par une échelle de plan ; **la Vue OSM n'en a pas** —
elle travaille en lat/lng. D'où `window.ktaPxParMetreOsm(map)`, qui calcule la
résolution Web Mercator du moment.

⚠️ **La latitude compte autant que le zoom** : `156543,034 × cos(lat) / 2^zoom`.
Un même zoom couvre ~40 % de moins au nord de la France qu'à l'équateur. La
calculer, plutôt que de tabler sur des paliers de zoom réglés à la main, est ce
qui rend la largeur juste **partout** et pas seulement là où on a réglé.

### Ce que ça change, chiffré (44,8°N)

| Zoom | m/px | Avant | Après |
|---|---|---|---|
| 15 | 3,39 | 6 px | **1 px** |
| 16 | 1,69 | 6 px | **1 px** |
| 17 | 0,85 | 6 px | **1,8 px** |
| 18 | 0,42 | 6 px | **3,5 px** |
| 19 | 0,21 | 6 px | **7,1 px** |

Le `6` fixe était juste à **un seul** niveau de zoom. Il est six fois trop large
là où la carrière tient dans l'écran — précisément là où l'aplat se forme.

### Mise en œuvre

Même technique qu'en mode plan : on **mute `options.weight` en place** (le
renderer canvas le relit à chaque frame), puis une repeinture **non clippée**
(`_redrawBounds = null` avant `_redraw()`, cf. `gotchas.md`). Aucun `setStyle`,
intenable à ce volume.

Reposée à chaque **re-rendu** en plus du `zoomend` : recréer les layers remet le
`weight` du gabarit. Le widget HOME traite le plan principal **et chaque plan
empilé** — n'en faire qu'un laisserait les autres en aplat.

🛡️ **Prouvé, et le test lui-même a été corrigé après falsification** : il ne
comparait les deux chemins qu'à **une seule densité**, si bien qu'une copie ayant
dérivé sur les **bornes** (plafond à 12 px au lieu de 14) passait au travers. Il
balaie désormais 8 densités, bornes comprises — et la dérive tombe.
