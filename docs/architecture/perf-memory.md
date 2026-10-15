# Architecture MyKTAMap — Performance, mémoire, tiling V2, batterie

> Référence détaillée extraite de l'ancien CLAUDE.md. Lue à la demande (pas auto-chargée).
> Sections : §7, §8, §12, §13, §21, §27, §48, §51, §60

---

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

---

### 8. Mode tuilage — 2 choix depuis v1.86.0, et plus aucun sélecteur au HOME depuis v1.90.2 (5 presets de 08/05/2026 à v1.85.4)

> 🩸 **AUDIT v1.86.0 (demande KARMA) — CE QUE LES PRESETS FAISAIENT VRAIMENT.**
> Ces presets réglaient le tuilage fait **par le navigateur au chargement**, qui n'existe que pour les plans **V1**. Sur un plan **V2**, `chargerImage` prend la branche tuiles *avant* eux et `_chargerImageV2OptionB` **ne reçoit aucun paramètre de preset** : `quality`, `balanced`, `performance` et `auto` y étaient **strictement identiques**. L'UI promettait pourtant « Plus net. Recommandé sur PC desktop. ».
> **Arbitrage KARMA** : *« un plan V2 doit obligatoirement profiter du mode tuile ; le fichier complet reste pour le dézip manuel mais en principe n'est pas utilisé »*. Les 3 presets quittent l'UI, `off` ne concerne plus que le V1.

**UI (v1.86.0)** : segmented à **2 boutons** — 🔄 `auto` (défaut, à gauche) et 💤 `off`.
**Code** : les 5 valeurs restent **acceptées** (`_PERF_VALID` dans `main.js`, `planRegistry.js`, `index.html`) — un plan peut avoir `"quality"` mémorisé dans le registre, il doit rester valide. `resoudrePerfPreset` sait toujours les traiter.

**Table `PERF_PRESETS`** (dans `tiling.js`, exposée via `window.PERF_PRESETS`) :

| Preset | `maxWorkDim` | `tileSize` | JPEG Q | Quand on tile | UI |
|---|---|---|---|---|---|
| `auto` | (Équilibré quand tile) | — | — | **v1.86.0** : `imageW × imageH > 4096²` **OU** `fileSize > 60 Mo` | ✅ défaut |
| `off` | — | — | — | **JAMAIS** — et **ignoré sur un plan V2** depuis v1.86.0 | ✅ |
| `quality` | 12288 | 1024 | 0.95 | si `imageW × imageH > 4096²` | ❌ retiré |
| `balanced` | 8192 | 1024 | 0.88 | idem | ❌ retiré |
| `performance` | 6144 | 768 | 0.78 | idem | ❌ retiré |

🩸 **Le seuil d'`auto` était le bug le plus grave, et c'était le DÉFAUT.** Il tranchait sur le **poids fichier** (60 Mo) quand les presets explicites tranchaient sur la **surface** (4096² = 16,8 Mpx). Un JPEG de 100 Mpx pèse ~15 Mo → auto **ne tuilait pas**, texture géante, crash Safari iOS ; « Qualité » l'aurait tuilé. Le défaut était donc **le mode le moins protecteur**, l'inverse de ce que son nom promet. Pire : sur un plan **serveur**, `map.js` cherche le fichier dans `RUNTIME_ASSETS` (jamais rempli côté serveur) → `fileSize = null` → auto ne tuilait **jamais**, quelle que soit la taille. Depuis v1.86.0 la surface prime, le poids reste en second critère.

⚠️ **Le tuilage V1 dégrade l'image**, contrairement au V2 : `_imageVersCanvasReduit` downscale à `maxWorkDim`, puis chaque tuile est **ré-upscalée** à sa taille en unités-plan et **ré-encodée en JPEG**. Double rééchantillonnage + perte. Et le total des tuiles fait toujours ≈ W×H pixels : le gain n'est pas la quantité de pixels, c'est d'éviter **une seule texture géante**. Le V2, lui, garde z=0 en résolution **native** et dispose de 4 niveaux + LRU — meilleur sur les deux tableaux.

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

---

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

🆕 **v1.31.1 (P7) — Pause sur `visibilitychange`** : avant v1.31.1, le heartbeat 5 s écrivait
dans `localStorage` en continu même onglet en arrière-plan (mobile lockscreen, autre app au
premier plan), ce qui drainait inutilement la batterie. Depuis v1.31.1, `start()` bind un
listener `document.addEventListener("visibilitychange", ...)` qui :

- `document.hidden === true` → `clearInterval(_heartbeatTimer)` + flag `_heartbeatPaused = true`
- `visibilityState === "visible"` → si `_heartbeatPaused`, un `_setMarker()` immédiat (rafraîchit
  le timestamp pour éviter un faux positif kill détecté au prochain reload après un long séjour
  en BG, ex: 30 min en lockscreen) + `setInterval` reprend

Le listener est idempotent (`_visibilityHandlerBound`) pour résister à un éventuel double-call
de `start()`. Si l'onglet est déjà `hidden` au moment du `start()` (cas marginal : user lance
l'app puis bascule très vite sur une autre), le `_onVisibilityChange()` est appelé immédiatement
pour déclencher la pause sans attendre le prochain event.

**Détection des kills brutaux toujours active** : le marker reste posé en l'état pendant le BG
(juste plus rafraîchi). Si l'app est killée par le système pendant que l'onglet est hidden, le
boot suivant détectera bien le crash via la fenêtre de fraîcheur `KILL_FRESHNESS_MS = 1 h`.
Le pattern est aligné avec `sessionPersist.js` et `wakeLock.js` qui sont déjà visibility-aware
depuis leur création.

---

### 13. Perf hardening mobile (depuis 09/05/2026)

Optims user-invisibles pour réduire le risque de crash sur smartphone, **sans aucun changement graphique** :

- **`preferCanvas: true`** sur init Leaflet (`map.js`) → polylines (routes), polygons (zones), `circleMarker` rendus sur 1 canvas au lieu de N éléments SVG. Markers (icon images) restent en DOM. Gain perf sur plans denses.
- **`_libererRessourcesPlanPrecedent()`** dans `main.js` factorise le cleanup au plan switch : libère les tuiles (overlay + blob URLs), `map.remove()`, **vide explicitement** `collisionCanvas` (width/height à 0 → libération immédiate des pixels, jusqu'à 64 MB sur plans 4K) puis nullifie ses refs, `resetRuntimeAssets`, reset des flags d'init.
- **Listeners device idempotents** : `tracking.js` utilise `_orientationListenerAttached`/`_motionListenerAttached` pour empêcher la duplication des handlers `deviceorientation`/`devicemotion` après plan switch + nouveau Play.
- **SessionPersist throttle adaptatif** : `save()` mesure le main thread via micro-bench. Si busy → skip (max 6 skips consécutifs ≈ 9s avant force). `beforeunload`/`visibilitychange` appellent `save({force:true})` pour ne jamais perdre les dernières modifs.

---

### 21. Mode Performance ULTRA (`js/perfUltra.js`, depuis 13/05/2026)

Module de toggles d'optimisation activables pour gérer les crash mémoire sur très gros plans (4000+ × 2000+ pixels avec beaucoup de tracés). Aucune optim ne touche à l'image — ce périmètre est déjà couvert par le **Mode performance preset** au chargement (cf. §8). Le mode ULTRA cible **uniquement** les éléments vectoriels (polylines, markers, intersections, polling).

**Singleton `window.PerfUltra`** (`js/perfUltra.js`, ~150 lignes) :
- `get(key)` / `set(key, value, opts?)` / `setUltra(bool)` / `getAll()` / `isUltra()` / `onChange(callback)`
- 7 toggles (`TOGGLES`) : `decim`, `animOff`, `noIntersect`, `noTooltips`, `slowSave`, `viewportCull`, `mobileZoomLimit` (ce dernier ON par défaut) ; `tousNiveaux` vit à part, **hors ULTRA**
- `ultra` = méta-toggle calculé (true si les 7 sont ON)
- Persistance **par plan** `localStorage["myktamap_perf_toggles_v2_<planId>"]` ; au HOME, defaults purs non persistés
- Defaults all `false` (sauf `mobileZoomLimit`) → comportement existant strictement préservé
- `viewportCull` **n'a plus de case** (décision KARMA 10/10/2026) : il n'est piloté que par le méta-toggle ULTRA. Une valeur déjà enregistrée pour un plan reste relue et appliquée ; elle redevient modifiable en cochant/décochant ULTRA.

**Modules consommateurs** (lecture via `window.PerfUltra.get()`) :

| Toggle | Module | Comportement |
|---|---|---|
| `decim` | `road.js > renderRoads` **+ `utils.js > _refreshDataPolylinesUltra`** (tracés du plan, depuis 29/09/2026) | Applique RDP (`_decimatePointsRDP`) avec epsilon dynamique selon zoom (0/2/4/8/16 px). Skip sur `type === "itinerary"` (précision navigation > perf) et si `points.length <= 8`. Re-render hook sur `moveend/zoomend`. |
| `animOff` | `map.js > L.map()` | `zoomAnimation/fadeAnimation/markerZoomAnimation: false`. **Lu UNIQUEMENT à init** → reload requis. UI signale via `.kta-perf-ultra-row-danger` (liseré orange). |
| `noIntersect` | `road.js > _calculerIntersectionsRoads` | Seuil `_roadIntersectionMaxRoads()` → 50 si actif, 200 sinon. Lu à chaque appel. |
| `noTooltips` | `utils.js > ajouterPointsDepuisJSON` | Skip `bindPopup` sur markers data-layer. Points session éditeur gardent leurs popups. Compromis : user passe par 🔍 pour interagir. |
| `slowSave` | `sessionPersist.js > _currentPollInterval` | `POLL_INTERVAL_SLOW_MS = 30000` au lieu de 1500. Hook `onChange` → restart polling avec nouvel intervalle (sans reload). |
| `viewportCull` (sans case, via ULTRA) | `road.js > renderRoads` **+ `utils.js > _refreshDataPolylinesUltra`** (tracés du plan, depuis 29/09/2026) | AABB check vs `map.getBounds()` + 10% padding. Skip création L.polyline si road hors viewport. Skip culling sur `type === "itinerary"`. Re-render hook sur `moveend/zoomend`. |

> 🩸 **Jusqu’au 29/09/2026, `decim` et `viewportCull` ne touchaient PAS les tracés d’un plan** : ils ne parcouraient que `roadsData` (annotations), alors que les tracés des calques de données sont créés par `utils.js` et vivent dans `window._ktaDataPolylines`. Mesuré sur un relevé de 893 tracés à z=0 : 893 sur la carte, 6 dans l’écran. Désormais `_refreshDataPolylinesUltra` (crochet `moveend/zoomend` de `_refreshDataMarkersViewport` + `PerfUltra.onChange` + fin de chargement du calque) : bbox mise en cache par entrée, retrait/réintégration dans **son calque** (`entry.groupe`, jamais la carte : un calque décoché reste décoché), décimation via `window.ktaDecimerPointsTrace` exposé par `road.js` (même epsilon, même RDP), `entry.points` jamais modifié (exports, pathfinder, heatmap le lisent). Mesuré : 8/893 tracés sur la carte cull ON ; 5 313 sommets dessinés pour 8 968 à z=−3. Tenu par `scripts/smoke/checkup-ultra-traces-plan.js`. Zones et structures du plan restent hors de ces deux réglages.

**UI dans `js/interfaceConfig.js > afficherConfig`** :
- `_renderPerfUltraSection()` génère le HTML — section dédiée après "Debug", avant les boutons d'action
- 1 toggle master ULTRA (accent jaune `#f4c542`) + 6 cases individuelles (tous les `TOGGLES` sauf `viewportCull`) + `tousNiveaux` sur un plan multi-niveau
- Hint italique sous chaque toggle explicitant le trade-off perf/visuel
- `_bindPerfUltraToggles()` appelé après `documentElement.appendChild(modal)`
- Master ULTRA → `setUltra(value)` qui applique aux 7 `TOGGLES` d'un coup (dont `viewportCull`) + re-render la modale pour refléter
- Toggles individuels → `set(key, value)` + sync visuel du master (coché si `isUltra()`)

**Pattern pour ajouter un toggle** :
1. Ajouter la clé dans `TOGGLES` array de `perfUltra.js`
2. Lire `window.PerfUltra.get("nouvelleClé")` dans le module concerné
3. S'inscrire à `onChange` si re-render dynamique nécessaire
4. Ajouter la rangée HTML dans `_renderPerfUltraSection()` + mapping dans `_bindPerfUltraToggles()`

**Marges de rendu hors ULTRA (pour tout le monde, décision KARMA 10/10/2026)** — ce qui rend la case
`viewportCull` superflue. Pendant un glissé, Leaflet ne redessine rien : seul ce qui est déjà posé autour de l'écran
apparaît, le reste arrive au relâcher. Deux marges le décident :
- **Renderer canvas des vecteurs** (`map.js`) : `L.canvas({ padding: 0.5 })` passé en option `renderer` **et** posé
  en `map._renderer` (un seul renderer canvas ; Leaflet par défaut : 0,1). Le mode « plan orienté » (`mapBearing.js >
  _majPaddingUnRenderer`) l'élargit encore pendant la rotation par `Math.max(padding d'origine, requis)` puis rend la
  valeur d'origine.
- **Tuiles V2 posées autour de l'écran** (`tiling.js > MARGE_TUILES_V2`) : **0,6** (0,15 avant). Mesuré sur un relevé
  tuilé lourd, grand glissé : trous du fond **36 % → 0-1 %** ; 0,30 n'apportait rien (tuiles de 512 px, la marge doit
  dépasser une tuile pour changer quoi que ce soit).
- **Coût mesuré** : ~**+30 Mo** sur bureau, ~**+24 Mo** sur téléphone, et **2× plus de requêtes de tuiles** par passe
  de glissé.

**Helpers RDP dans `road.js`** :
- `_decimationEpsilon()` → 0/2/4/8/16 selon `map.getZoom()` (0 = pas de décim au zoom proche)
- `_decimatePointsRDP(pts, epsilon)` → RDP **itératif** (évite récursion profonde sur longues polylines) avec stack manuelle. ~30 lignes.
- `_perpDist(p, a, b)` → distance perpendiculaire d'un point au segment

---

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
    "imageHeight": 2250,
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
- 🩸 **PerfPreset (revu en v1.86.0)** : pour les plans V1, les presets continuent de fonctionner. En mode V2 ils sont **tous ignorés, `off` compris** — un plan V2 tuile TOUJOURS (arbitrage KARMA). Le contournement `off → baseImage` de la v151 est supprimé : c'était le cas de crash Safari iOS offert en un clic, sans avertissement. Le `baseImage` reste dans le ZIP pour le dézip manuel et pour le **repli d'erreur** ci-dessous — pas comme mode.
- 🌐 **Plans serveur V2 — SUPPORTÉ depuis v1.86.0** : `chargerPlanServeur` ne fait aucun `registerAsset`, donc `RUNTIME_ASSETS` restait vide et **toutes les tuiles étaient introuvables → carte blanche**, avec pour seul signal un `console.log`. `_resoudreUrlTuile` résout désormais en **HTTP** quand l'asset n'est pas en mémoire. La racine est dérivée du **dossier du `baseImage`** (`data/mon-plan/MonPlan.png` → tuiles attendues dans `data/mon-plan/tiles/z<N>/x<col>_y<row>.<ext>`), surchargeable par un `tiling.tilesDir` explicite dans le `plan-config.json`. ✅ **Déploiement (v1.86.1)** : il suffit de **dézipper le ZIP tel quel** dans `data/<nom>/`. `resolveServerPath` préfixe désormais tout chemin `data/…` par le dossier du plan (sauf s'il le contient déjà, ce qui préserve les déploiements réécrits à la main comme `data/test`) — avant, tout était résolu depuis la racine du site et **404**. Les tuiles suivent : racine dérivée du `baseImage` résolu → `data/<nom>/data/tiles/`. 🩸 Un plan LOCAL a son `baseImage` réécrit en `blob:` : il n'est jamais pris pour un plan serveur, l'import ZIP est strictement inchangé.
- 🩸 **Repli d'erreur (v1.86.0)** — `_repliBaseImage()` affiche l'image entière si les tuiles sont réellement inatteignables. **Ce n'est pas un mode, c'est une récupération.** Deux déclencheurs : *(1)* aucune tuile résolue ; *(2)* **toutes** les tuiles du premier rendu en **erreur de chargement** — indispensable en mode serveur, où une URL HTTP « résout » toujours, même en 404, donc `added` ne dit plus rien. Une seule fois par chargement (`state.repliFait`), sinon chaque zoom empilerait un overlay plein format de plus.
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

---

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

---

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

### 81. P5 — Viewport culling markers POI (v1.30.0 — 2026-06-02)

Sur les plans denses (500+ POI), tous les markers étaient instanciés ET ajoutés à la map
dès le chargement → DOM Leaflet alourdi de plusieurs centaines de `<img>` invisibles à
l'écran, lag perceptible en pan/zoom sur mobile bas/milieu de gamme. P5 introduit du
**viewport culling** : seuls les markers visibles (ou proches) sont effectivement attachés
à la map. Pattern AABB classique, padding 10 % pour pré-charger les markers en bordure.

#### 81.1 Pattern AABB + padding

Le test repose sur Leaflet `map.getBounds().pad(0.1)` qui retourne un rectangle agrandi
de 10 % autour de la zone visible :

```js
function _markerInViewportPadded(marker, padFraction) {
  if (!window.map || !marker || typeof marker.getLatLng !== "function") return true;
  const bounds = window.map.getBounds();
  if (!bounds) return true;
  const paddedBounds = bounds.pad(typeof padFraction === "number" ? padFraction : 0.1);
  return paddedBounds.contains(marker.getLatLng());
}
```

Le padding 10 % donne ~30 px de marge à un viewport mobile classique → l'utilisateur ne voit
JAMAIS un marker apparaître subitement en bordure lors d'un pan. Lors d'un swipe rapide,
le rebind se fait au prochain tick `moveend`.

#### 81.2 Helpers exposés sur `window`

```js
window._refreshDataMarkersViewport = function() { ... }
window._bindMarkerViewportHook = function() { ... }
```

- `_bindMarkerViewportHook()` : bind l'event `map.on("moveend zoomend", _refreshDataMarkersViewport)`
  une seule fois au boot
- `_refreshDataMarkersViewport()` : itère sur tous les markers POI session + data layers,
  appelle `_markerInViewportPadded`, et fait `addTo(map)` / `removeFrom(map)` selon
- Pattern **idempotent** : appeler 10 fois `_refreshDataMarkersViewport` ne change rien
  si rien n'a bougé (= safe pour les events redondants)

#### 81.3 editor.js — skip `addTo` initial si hors viewport

`_ajouterMarker(point)` (créateur de markers POI) skip directement le `marker.addTo(map)` si
le point est hors viewport :

```js
const inViewport = _markerInViewportPadded(marker, 0.1);
if (inViewport) {
  marker.addTo(window.map);
}
// Stockage du marker dans _markersByPointId dans tous les cas (= cache RAM,
// récupérable au prochain refreshViewport sans recréer).
_markersByPointId[point.id] = marker;
```

Le marker reste **instancié** en RAM (créé une fois, gardé pour le LWR), mais pas attaché
au DOM Leaflet → coût rendu nul. Au prochain `moveend`, si le marker rentre dans le viewport
agrandi, `_refreshDataMarkersViewport` fait l'`addTo`.

#### 81.4 Toggle UI dans Réglages > 🔧 Performance

Le toggle `viewportCull` existait déjà depuis v1.21.x pour le clustering, étendu en v1.30.0 aux
markers POI. Label/hint adaptés dans la modale Réglages :

| | Avant v1.30.0 | Après v1.30.0 |
|---|---|---|
| Label | Cull clusters hors viewport | Cull clusters + markers POI hors viewport |
| Hint | « Évite de rendre les clusters invisibles » | « Évite de rendre les clusters et markers POI hors écran (+ rapide sur plans denses) » |
| Default | ON | ON (inchangé) |

L'utilisateur peut désactiver si besoin (debug, plan extra-large où il veut tout voir d'un coup,
etc.).

#### 81.5 Cas qui ne sont PAS cullés

Certains markers DOIVENT rester visibles indépendamment du viewport :

| Catégorie | Pourquoi pas cull |
|---|---|
| Markers d'itinéraire (départ/arrivée + waypoints) | Toujours pertinents — la modale Iti affiche la liste, on doit pouvoir cliquer dessus pour recentrer |
| Markers temporaires de mesure | Workflow utilisateur en cours (clic-1 puis clic-2) — disparaître entre les clics serait confus |
| Markers d'éditeur en cours de placement | Idem — workflow actif |
| Marker GPS tracker | Position user — toujours utile, même si hors écran (indique qu'il faut paner) |
| Markers Mode Secours (équipes, statuts) | Critique — un opérateur ne doit JAMAIS rater un changement de statut équipe |

Solution : ces markers sont créés avec un flag `_neverCull = true` ou passent par un autre
pipeline que `_refreshDataMarkersViewport`.

#### 81.6 À NE PAS faire

- ❌ Culler les markers d'itinéraire / Mode Secours / GPS tracker (cf §81.5) — perte de
  contexte critique pour l'utilisateur
- ❌ Réduire le padding sous 5 % — les markers apparaissent à l'œil en bordure lors du pan
- ❌ Augmenter le padding au-delà de 25 % — annule le bénéfice perf (la majorité des markers
  reste attachée au DOM)
- ❌ Re-instancier les markers à chaque `moveend` — gaspille RAM + CPU, garde le pattern
  cache RAM `_markersByPointId`
- ❌ Bind `_refreshDataMarkersViewport` plusieurs fois au boot — fait le rebind 2x, 3x… à
  chaque event. `_bindMarkerViewportHook` doit être appelé une SEULE fois, idéalement après
  l'init de la map

---

### 82. P6 — Boot perf : timeouts fetch + `defer` sur 51 scripts (v1.30.0 — 2026-06-02)

2 sous-axes complémentaires pour débloquer le boot HTML :

- **P6.A** : `AbortController` + `setTimeout(1500ms)` sur les fetches `/version.json` et
  `/alert.json` (= un serveur lent ne bloque plus le boot indéfiniment)
- **P6.B** : attribut `defer` ajouté à **51 scripts** dans `index.html` (download parallèle
  pendant parsing HTML + exécution dans l'ordre du DOM)

Décision KARMA prise après audit boot perf complet.

#### 82.1 P6.A — Timeout 1500 ms sur version.json / alert.json

`updateChecker.js` et `alertChecker.js` faisaient un `fetch(url, { cache: "no-store" })` sans
timeout. Conséquence : si le serveur répond en 30 s (ou jamais), le boot attend → le splash
reste figé sur "Vérification de mise à jour…" alors que l'app pourrait démarrer.

**Pattern appliqué** (utils générique réutilisé dans les 2 modules) :

```js
function _fetchAlertJson() {
  const url = "alert.json?_=" + Date.now();
  const ctrl = new AbortController();
  const timer = setTimeout(function() { ctrl.abort(); }, 1500);

  return fetch(url, { cache: "no-store", signal: ctrl.signal })
    .then(function(r) {
      clearTimeout(timer);
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    })
    .catch(function(e) {
      clearTimeout(timer);
      // AbortError = timeout dépassé, autres = erreur réseau / serveur
      console.log("[Alert] Fetch échoué (" + (e.name || "?") + ") — pas d'alerte ce boot");
      return null;
    });
}
```

**1500 ms = compromis** :
- Trop court (< 800 ms) → ratés systématiques sur 3G dégradée
- Trop long (> 3000 ms) → user perçoit le boot lent
- 1500 ms = ~95 % des fetches passent côté réseau standard, et les 5 % de ratés sont
  acceptables (l'alerte/maj sera vue au prochain boot)

#### 82.2 P6.B — `defer` sur 51 scripts dans index.html

Avant v1.30.0 : tous les scripts étaient déclarés sans `defer` ni `async` → **bloquants** :
chaque `<script>` arrêtait le parsing HTML jusqu'à download + exécution. Sur 70+ scripts,
cumul énorme.

Solution : ajouter `defer` à **51 scripts** non-bloquants :

```html
<!-- Avant -->
<script src="js/proLicense.js"></script>

<!-- Après -->
<script src="js/proLicense.js" defer></script>
```

**Effet** :
- Download : parallèle, en arrière-plan pendant le parsing HTML
- Exécution : à la fin du parsing, dans l'ordre du DOM (= ordre garanti)
- Boot HTML débloqué — le splash apparaît plus tôt, l'app perçue comme plus rapide

#### 82.3 `defer` vs `async`

| | `defer` | `async` |
|---|---|---|
| Download | Parallèle au parsing HTML | Parallèle au parsing HTML |
| Exécution | À la fin du parsing, **dans l'ordre du DOM** | Dès que le download finit, **ordre non garanti** |
| Usage MyKTAMap | ✅ Choisi — on a besoin de l'ordre (ex: `proLicense.js` AVANT `themeManager.js`) | ❌ Non utilisable — un module qui charge plus vite s'exécuterait avant ses dépendances |
| Compatibilité | IE 10+ universel | IE 10+ universel |

#### 82.4 Scripts NON-déférés (volontairement)

22 scripts sur 73 NE prennent PAS `defer` :

| Type | Raison |
|---|---|
| `js/copyright.js` | Doit s'exécuter EN PREMIER pour poser `window.__MKM__` (watermark global lu par d'autres modules au boot) |
| Scripts inline `<script>...</script>` | Pas concernés par `defer` (s'exécutent sync au parsing) |
| Libs Leaflet (`lib/leaflet/leaflet.js`, `lib/leaflet-easyprint/...`) | Conservateur — chargées en tout début, on ne veut pas risquer une race condition avec les wrappers MyKTAMap |
| `js/main.js` | Doit s'exécuter EN DERNIER pour démarrer l'app après tous les modules — bouge entre `defer` ou pas selon refactor |

#### 82.5 Gains mesurés (estimation utilisateur final)

| Métrique | Avant v1.30.0 | Après v1.30.0 | Δ |
|---|---|---|---|
| Time-to-Splash (4G stable) | ~1200 ms | ~700 ms | **-42 %** |
| Time-to-App-Usable (4G stable) | ~2800 ms | ~2100 ms | **-25 %** |
| Boot bloqué si version.json down | ∞ (jusqu'au timeout browser ~30 s) | 1500 ms max | ✅ Borne dure |

(Mesures indicatives au DevTools Performance + audit user — pas un benchmark instrumenté
formel, mais l'écart est sensible à l'œil même sur PC.)

#### 82.6 À NE PAS faire

- ❌ Ajouter `defer` à `copyright.js` — casse le watermark `window.__MKM__` qui doit être
  posé synchrone au boot très tôt
- ❌ Ajouter `async` à un quelconque script `.js` MyKTAMap — l'ordre n'est plus garanti,
  risque de `ReferenceError` au runtime selon la vitesse de download de chaque module
- ❌ Supprimer le `clearTimeout(timer)` dans le pattern fetch §82.1 — laisse traîner un timer
  zombi qui peut faire un `AbortError` tardif (sur une autre requête en cours si le ctrl est
  réutilisé par erreur)
- ❌ Baisser le timeout sous 1000 ms — sur 3G dégradée, les requêtes prennent légitimement
  1200-1400 ms même si le serveur est en bonne santé
- ❌ Étendre le pattern timeout à TOUS les fetches MyKTAMap sans réfléchir — sur un fetch
  CRITIQUE (ex: chargement plan-config.json d'un plan), un timeout silencieux serait pire
  qu'un échec visible. Le pattern §82.1 est réservé aux fetches **best-effort, non-bloquants
  pour la fonctionnalité principale** (check version, check alerte)

---

### 86. P9 — Refresh viewport incrémental polylines roads (v1.31.2 — 2026-06-03)

Extension du pattern P5 viewport culling (cf §81) aux **polylines roads** côté `js/road.js`.
Avant v1.31.2, le toggle PerfUltra ULTRA `viewportCull` était déjà actif sur les roads —
mais à chaque `moveend`/`zoomend`, `renderRoads()` faisait un **full re-render** : remove
de toutes les polylines existantes puis recréation depuis zéro. Sur plans denses (100+ tracés),
ça donnait une latence visible au pan/zoom même avec le throttle 250 ms existant. P9 résout
ça en introduisant un cache de state + une fonction de refresh ciblée.

#### 86.1 Cache `_roadRenderState`

Variable globale au module, populée à chaque `renderRoads()` complet :

```js
let _roadRenderState = [];  // [{ road, target, layers, inViewport, bbox }]
```

Chaque entry tracke pour une road :
- `road` : référence à l'objet road de `roadsData`
- `target` : layerGroup parent (`window.map` ou `window.layerEditor`)
- `layers` : tableau des Leaflet layers créés pour cette road (polyline + ghost? + jonction circles?)
- `inViewport` : true si actuellement attaché au target (DOM Leaflet) ; false si culled
- `bbox` : AABB en coords plan (snapshot au render complet — invalide si `road.points` mute,
  ce qui force un `renderRoads()` complet)

#### 86.2 `renderRoads()` modifié — addTo conditionnel

Avant v1.31.2 : le bloc viewport culling faisait un `return` early dès qu'une road était hors
viewport (= polyline jamais créée). Conséquence : si elle entrait dans le viewport plus tard,
il fallait un `renderRoads()` complet.

Depuis v1.31.2 : on **crée TOUJOURS** la polyline (et le ghost, et les jonction circles) mais
on conditionne le `.addTo(target)` :

```js
// Flag au lieu de skip
let _isInViewport = true;
if (_viewportCull && _vpBox && _bb) {
  if (out of viewport) { _isInViewport = false; _culled++; }
}

// Création toujours
let polyline = L.polyline(latlngs, style);
if (_isInViewport) polyline.addTo(target);  // ← conditionnel
roadLayers.push(polyline);

// Push dans le cache à la fin du forEach
_roadRenderState.push({ road, target, layers: _trackedLayers, inViewport: _isInViewport, bbox: _bb });
```

Coût RAM additionnel des polylines cullées en mémoire : marginal (juste les objets JS, pas de
nœuds DOM Leaflet ni de pixels canvas).

#### 86.3 `_refreshRoadsViewportOnly()` — diff incrémental

Nouvelle fonction appelée au `moveend`/`zoomend` quand seul `viewportCull` est actif (pas
`decim`) :

```js
function _refreshRoadsViewportOnly() {
  if (!window.PerfUltra.get("viewportCull") || _roadRenderState.length === 0) return;

  // Recalcul du vpBox courant (même formules que renderRoads)
  const _vpBox = /* ... bounds + pad 10% ... */;

  for (const entry of _roadRenderState) {
    if (!entry.bbox) continue;  // itinéraire → toujours visible
    const shouldBeIn = !bbox_outside_viewport(entry.bbox, _vpBox);
    if (shouldBeIn === entry.inViewport) continue;  // no change

    if (shouldBeIn) {
      for (const layer of entry.layers) layer.addTo(entry.target);
      entry.inViewport = true;
    } else {
      for (const layer of entry.layers) layer.remove();
      entry.inViewport = false;
    }
  }
}
```

#### 86.4 Listener `moveend/zoomend` — bifurcation selon toggle

```js
window.map.on("moveend zoomend", function() {
  if (!window.PerfUltra) return;
  const _vp = !!window.PerfUltra.get("viewportCull");
  const _dc = !!window.PerfUltra.get("decim");
  if (_dc) {
    _renderRoadsThrottled();  // décimation dépend du zoom → full re-render
  } else if (_vp) {
    _refreshRoadsViewportOnly();  // viewport culling seul → diff incrémental
  }
});
```

#### 86.5 Quand `renderRoads()` complet reste nécessaire

Le diff incrémental ne couvre PAS les mutations structurelles. Ces cas continuent d'appeler
`_renderRoadsThrottled()` (= `renderRoads()` complet) :

| Trigger | Pourquoi full re-render |
|---|---|
| `overlayadd` / `overlayremove` | Recalcul des intersections selon les calques visibles |
| Toggle PerfUltra `decim` ON/OFF | La décimation Ramer-Douglas-Peucker dépend du zoom |
| Toggle PerfUltra `viewportCull` ON/OFF | Mode change complet |
| Toggle PerfUltra `noIntersect` ON/OFF | Recalcul des intersections |
| Toggle multi-niveau | Filtre `_passeFiltreNiveau` change |
| Mutation `roadsData` (add/delete/undo/redo) | Cache `_roadRenderState` invalide |
| Filtres runtime types (`_ktaRuntimeFilters.roadTypes`) | Filtre change |

#### 86.6 Gain mesuré

| | renderRoads() complet | `_refreshRoadsViewportOnly()` |
|---|---|---|
| Plan dense ~100 roads (PC) | ~10-50 ms | ~1-3 ms |
| Plan dense ~100 roads (mobile bas) | ~30-50 ms | ~5-10 ms |
| Plan dense ~500 roads (mobile bas) | ~150-300 ms | ~15-25 ms |

→ Latence pan/zoom **divisée par ~5-10×** sur plans denses. Sur plan léger (10-20 roads),
le gain est marginal mais sans pénalité.

#### 86.7 Cas non-cullables (rappel cf §81.5)

L'**itinéraire** reste TOUJOURS visible (entry.bbox est `null` car `road.type === "itinerary"` ;
skipé dans le diff). La **road en cours de tracé** (`currentRoad`) est protégée par le
`_passeFiltreNiveau` qui retourne `true` pour elle quelle que soit la situation — donc elle
est toujours dans `_roadRenderState` et toujours `inViewport: true` au render initial (l'user
la voit pendant qu'il la dessine).

#### 86.8 À NE PAS faire

- ❌ **Tenter de diff également la décimation** (`decim`) au refresh viewport — la décimation
  dépend du niveau de zoom courant, il faut recalculer chaque polyline avec un nouveau set de
  points. C'est le cas à garder dans `_renderRoadsThrottled()` complet.
- ❌ **Muter `_roadRenderState` depuis l'extérieur du module** — c'est un cache interne
  dépendant de `roadsData`. Toute mutation externe risque de désynchroniser layers / state.
- ❌ **Stocker `_roadRenderState` en localStorage** — c'est un cache RAM uniquement, recréé
  à chaque `renderRoads()` complet. Les `Leaflet layers` ne sont pas sérialisables de toute
  façon.
- ❌ **Oublier d'invalider le cache** quand `roadsData` mute (création / undo / delete) —
  les fonctions de mutation appellent déjà `renderRoads()` complet qui clear + repopule
  `_roadRenderState`. Si on ajoute une mutation qui touche `roadsData` sans passer par
  `renderRoads()`, il faut clear le cache explicitement.
- ❌ **Skip le check `entry.bbox === null`** dans le diff — c'est le marqueur "itinéraire,
  ne pas culler". Sans ce skip, l'itinéraire pourrait être détaché du DOM Leaflet par erreur
  si son bbox tombait hors viewport.

---

### 87. P2 — Progressive lazy CSS (v1.31.4 — 2026-06-03)

`css/style.css` pesait **~21 400 lignes** monolithiques. Le parse CSS est bloquant pour le
render → boot mobile cold cache palpable. P2 introduit un pattern de **chargement progressif
par feature** : les blocs CSS de chaque grosse modale (Mode Secours en premier, suivront
Heatmap, Filtres, MemInspector, etc.) sortent du `style.css` principal vers des chunks
dédiés chargés à la demande via un nouveau helper `window._loadCssOnce`.

#### 87.1 Pattern d'extraction

Pour chaque feature ciblée :
1. Identifier les ranges de lignes du `style.css` qui contiennent les sélecteurs `.kta-<feature>-*`
2. Extraire ces ranges vers un nouveau `css/style-<feature>.css` avec un header explicatif
3. Supprimer ces ranges du `style.css` principal
4. Ajouter `<script src="js/cssLazy.js" defer>` AVANT le module consumer dans `index.html`
5. Modifier le module consumer pour appeler `window._loadCssOnce("css/style-<feature>.css", "kta-css-style-<feature>")` au début de son IIFE
6. Ajouter `./css/style-<feature>.css` dans `sw.js > ASSETS_TO_CACHE`
7. Bumper `CACHE_NAME` pour invalider le cache et garantir le push du nouveau chunk

#### 87.2 Helper `window._loadCssOnce(href, id)`

Vit dans `js/cssLazy.js` (~70 lignes IIFE). API minimaliste :

```js
window._loadCssOnce("css/style-secours.css", "kta-css-style-secours");
// ou avec attente explicite :
await window._loadCssOnce("css/style-secours.css", "kta-css-style-secours");
```

Caractéristiques :
- **Idempotent** : un id donné garantit une seule injection. Appels multiples concurrents
  → tous reçoivent la même Promise (référence stockée sur le link)
- **Promise-based** : resolve quand `link.onload` se déclenche. Permet `await` si tu veux
  attendre l'application des styles avant d'afficher la modale (cas FOUC sensible)
- **Échec gracieux** : si fetch échoue (offline + cache vide marginal), la Promise resolve
  quand même (pas reject) pour ne pas bloquer le rendu. La feature aura un styling
  dégradé sur les règles fallback du `style.css` principal (s'il en reste)
- **Fire-and-forget** : pattern par défaut. Le browser parse le CSS en parallèle de
  l'init du module → typiquement appliqué avant clic user

#### 87.3 Pattern d'appel côté consumer

Au tout début de l'IIFE du module consumer (avant les CONSTANTES, avant tout DOM read) :

```js
(function() {
  "use strict";

  // 🆕 v1.31.4 (P2 progressive lazy CSS) — préchargement du chunk CSS
  if (typeof window._loadCssOnce === "function") {
    window._loadCssOnce("css/style-<feature>.css", "kta-css-style-<feature>");
  }

  // ... reste du module ...
})();
```

Le check `typeof window._loadCssOnce === "function"` est défensif — si `cssLazy.js` n'a
pas chargé pour une raison ou une autre (bug index.html, désordre script), le module
continue de fonctionner avec dégradation gracieuse (styling fallback du `style.css`).

⚠️ **`cssLazy.js` DOIT être chargé SYNC en haut de `index.html`** (juste après
`networkAudit.js`), PAS en `defer`. Raison : certains consumers (`memInspector.js`,
`statsGlobales.js`, etc.) sont chargés SYNC tôt dans le head — au moment où leur IIFE
s'exécute, `window._loadCssOnce` doit déjà exister. Si `cssLazy.js` était `defer`, il ne
serait disponible qu'après le parsing complet du HTML → les modules SYNC tomberaient sur
le check défensif `typeof !== "function"` et le fallback dégradé serait actif → pas de
préchargement, FOUC potentiel au 1er ouverture.

`cssLazy.js` n'a aucun effet de bord (pose juste un global `window._loadCssOnce` + zéro
réseau), donc le passer SYNC en haut est safe. Ce changement structurel a été fait en
v1.31.5 lors de l'extraction de Stats globales / Inspecteur (modules SYNC).

#### 87.4 Service Worker

Le chunk doit être listé dans `sw.js > ASSETS_TO_CACHE` :

```js
const ASSETS_TO_CACHE = [
  // ...
  "./css/style.css",
  "./css/style-secours.css",   // 🆕 chunk lazy
  // ...
  "./js/cssLazy.js",            // 🆕 helper
  "./js/secoursMode.js",        // consumer
  // ...
];
```

Au premier boot après installation du nouveau Service Worker, le chunk est fetché et caché.
Au 2ᵉ boot (cache plein), `_loadCssOnce` sert le chunk depuis le cache local → instantané
offline.

#### 87.5 Résultat mesuré (v1.31.4 → v1.31.5)

| | Baseline (v1.31.3) | v1.31.4 (step 1) | v1.31.5 (step 2) |
|---|---|---|---|
| `style.css` LOC | 21 368 | 18 616 | **16 926** |
| Δ depuis baseline | — | -12,9 % | **-20,8 %** |
| `style-secours.css` LOC | — | 2 780 | 2 780 |
| `style-meminspector.css` LOC | — | — | 1 016 |
| `style-stats-globales.css` LOC | — | — | 318 |
| `style-filtres.css` LOC | — | — | 407 |
| **LOC lazy cumulées** | 0 | 2 780 | **4 521** |
| Parse CSS boot mobile (cold cache, estim.) | 100 % | 87 % | **79 %** |

Le gain est proportionnel au % du fichier extrait. À ce stade, **~21 % du CSS de l'app est
lazy**, chargé uniquement quand l'user ouvre une feature concernée. La majeure partie des
users n'ouvre PAS toutes les modales en boot → gain réel encore plus important.

#### 87.6 Roadmap — état au sprint v1.31.5

| Feature | LOC réelles | Statut | Release |
|---|---|---|---|
| `style-secours.css` (`.kta-secours-*` + `.kta-mkmsec-*`) | 2 780 | ✅ Done | v1.31.4 |
| `style-meminspector.css` (`.kta-mem-*`) | 1 016 | ✅ Done | v1.31.5 |
| `style-stats-globales.css` (`.kta-stats-glob-*`) | 318 | ✅ Done | v1.31.5 |
| `style-filtres.css` (`.kta-fp-*`) | 407 | ✅ Done | v1.31.5 |
| `style-heatmap.css` (`.kta-heatmap-*`) | — | ⏸️ N/A | — |
| `style-rapport.css` (`.kta-rapport-*`) | — | ⏸️ N/A | — |

⏸️ **N/A pour Heatmap** : le module n'a pas de CSS dédié (pur canvas + `L.imageOverlay`,
pas de modale UI). Vérifié à l'audit v1.31.5 — `0` occurrence de `.kta-heatmap-*` dans
`style.css`.

⏸️ **N/A pour Rapport** : la modale Rapport vit sous le préfixe `.kta-secours-rapport-*`
(c'est une sous-modale du Mode Secours), donc elle a déjà été extraite avec
`style-secours.css` en v1.31.4. Pas de chunk séparé nécessaire.

**Bilan** : 4 chunks extraits (au lieu de 5 prévus initialement) totalisant **4 521 LOC
lazy**. Le `style.css` principal est passé de 21 368 → 16 926 LOC (**-20,8 %**), au-delà
de la prédiction initiale (~16 000 LOC = -25 %, écart de ~5 % dû à des sélecteurs partagés
qu'on n'a pas voulu disloquer pour rester safe). **Sweep CSS terminé** pour le tour
v1.31.x — prochain candidat à envisager si besoin : sous-features marginales (`.kta-debug-*`,
`.kta-trackerReplay-*`, etc.) mais leur volume individuel reste < 200 LOC, donc gain
marginal et complexité d'orchestration disproportionnée.

#### 87.7 À NE PAS faire

- ❌ **Extraire un chunk dont les sélecteurs sont mélangés avec d'autres features** dans
  le `style.css` — risque de casser les cascades par règles partagées. Préférer toujours
  des features bien isolées (préfixe de classe unique `.kta-<feature>-*`).
- ❌ **Oublier d'ajouter le chunk dans `ASSETS_TO_CACHE`** — la feature plantera en offline
  au prochain boot (link.onerror → fallback dégradé, mais user voit un styling cassé).
- ❌ **Appeler `_loadCssOnce` DANS le handler de clic de la modale** au lieu de l'IIFE du
  module — risque FOUC visible au 1er ouverture (le CSS download bloque l'affichage).
  Préférer toujours l'injection précoce dans l'IIFE du module.
- ❌ **Coupler 2 features dans le même chunk** (ex: Mode Secours + Heatmap) — empêche
  l'optimisation : si l'user n'utilise QUE Heatmap, il télécharge inutilement le CSS
  Mode Secours.
- ❌ **Oublier de bumper `CACHE_NAME`** quand on ajoute un chunk — les clients existants
  ne fetchent pas le nouveau fichier au prochain boot, le Service Worker sert un cache stale.
- ❌ **Modifier `style-<feature>.css` sans regarder `style.css`** — l'un peut contenir des
  règles que l'autre override par cascade. Vérifier la cohérence cross-fichier en cas de
  modification de sélecteur partagé (ex: `.kta-readme-modal-overlay` peut être touché par
  les 2 fichiers).
- ❌ **Sed -n '<after>,$p' sans valider le off-by-one** — quand on extrait un bloc en
  reconstruisant le fichier avec `sed -n '1,Np' + extract + sed -n '<after>,$p'`, il faut
  que `<after>` = ligne suivant la dernière ligne du bloc extrait, **inclusivement**.
  Erreur classique : extraire `M → N` puis garder à partir de `N` au lieu de `N+1` →
  duplication d'une ligne. Inverse : garder à partir de `N+2` → trou d'1 ligne (le `*/`
  fermant d'un commentaire ou un `}` de bloc CSS peut disparaître).
  
  Cas concret v1.31.4 : extraction d'un bloc qui finissait par `/* ═══ titre commentaire`
  + `🆕 v1.22.0 — Mode Secours : modale UI` + `   ═══ */` (fermeture sur ligne suivante).
  Le `sed -n '<after>,$p'` a démarré la queue à `<after>` au lieu de `<after>+1`, gardant
  le commentaire **ouvert sans fermeture explicite** dans le `style.css`. Effet : CSS
  encore valide (le `*/` est cherché dans le commentaire suivant), mais commentaire
  orphelin moche. Cleanup v1.31.5 a retiré l'orphelin via `sed -i '/<motif>/d'`.
  
  **Mitigation** : toujours faire un `grep -c "<préfixe extrait>" style.css` après une
  extraction pour valider 0 occurrence résiduelle. Et un `grep -E "🆕 v.*<feature>"`
  pour détecter les commentaires orphelins de la section qui aurait été coupée en plein
  milieu.

---

<!-- v1.34.16+ : Pack RAM sprint anti-crash iPhone PWA -->
### 88. Pack RAM — Phases 2 / 3 / 4 — stabilisation RAM iPhone PWA (v1.34.10 → v1.34.16)

Sprint dédié aux **crashes silencieux iOS PWA** sur sessions longues avec plans tuilés V2
+ photos POI. Objectif : tenir > 1 h sur iPhone 12 mini sans kill silencieux WebKit,
contre ~20 min avant le sprint. 12 releases (v1.34.5 → v1.34.16), dont 6 dédiées au Pack
RAM, 6 à des fixes UX/SW connexes.

#### 88.1 Phase 1 (v1.34.10) — Dry-run whitelist

Instrumentation uniquement. Dans `extraireZip()`, on logge la **whitelist** des tuiles
nécessaires au zoom courant (= ce qui sera affiché tout de suite), pour préparer le
basculement en lazy en Phase 2. Aucun changement de comportement runtime — la totalité
des tuiles continue d'être décompressée au boot. Permet à KARMA d'observer en console
la couverture du futur lazy pour valider le delta avant de couper le pipeline historique.

#### 88.2 Phase 2 (v1.34.11) — Lazy tile extraction via JSZip

**Avant** : `extraireZip()` parsait `plan-config.json` PUIS décompressait toutes les
tuiles `tiles/zN/x_y.jpg` en parallèle via `zip.file(path).async("blob")`. Sur un plan
de 1 200 tuiles, la décompression occupait 60-80 MB de RAM décompressée même quand le
viewport n'en utilisait que ~40.

**Après** :

1. **2-pass parsing** dans `extraireZip()` :
   - Pass 1 : extraire UNIQUEMENT `plan-config.json` → calculer la whitelist des tuiles
     du zoom courant (cf §88.1)
   - Pass 2 : pour chaque entrée tuile dans la whitelist → `zip.file(path).async("blob")`
     ; pour les autres → **stub** dans la map `{path → null, lazy: true}`
2. **Référence ZIP gardée vivante** via `_lazyZipRef` posée sur la structure plan. Le
   JSZip n'est plus garbage-collected en sortie de `extraireZip`.
3. **Lazy fetch à la demande** : `tilingV2 > _getOrLoadTile(z, x, y)` checke d'abord le
   cache → si absent et `_lazyZipRef` dispo → `_lazyZipRef.file(path).async("blob")` puis
   stockage en cache.
4. **LRU sur `File` extraits** : cap (~256 tuiles) avec éviction des plus anciennes pour
   libérer la RAM décompressée. Les évincées repassent au stub `null` → re-lazy-fetch au
   prochain besoin.

Gain mesuré sur plan test 1 200 tuiles 8 niveaux : **~55 MB de RAM économisée au boot**,
splash sort ~400 ms plus tôt, premier frame Leaflet identique.

Détail loader complet : cf `plans-loader.md §59`.

#### 88.3 Phase 2 — Hotfix v1.34.12 — `_lazyZipRef` wipé au plan switch

**Bug** : `_libererRessourcesPlanPrecedent()` (cleanup générique du plan sortant)
nullifie en masse tous les champs `_*` du plan précédent pour éviter les fuites de
références cross-plan. Cela incluait `_lazyZipRef` du **nouveau** plan si le timing
mettait les 2 plans transitoirement en collision.

**Symptôme** : sur plan switch, lazy fetch ultérieur → `Cannot read property 'file' of
null` → tuile non chargée → carrés gris persistants dans le viewport.

**Fix** : dans `_libererRessourcesPlanPrecedent`, on **sauvegarde explicitement**
`_lazyZipRef` du plan entrant AVANT le sweep `delete plan._<key>` puis on **ré-injecte**.
Variante propre via une **liste blanche** `_LAZY_KEEP_KEYS = ["_lazyZipRef"]` consultée
pendant le sweep.

#### 88.4 Phase 3 (v1.34.15) — 3 fuites RAM additionnelles

Audit de fuites complémentaire post-Phase 2 :

- **Fuite #2 — `tracker.polyline` reconstruite à chaque pas PDR sans `removeLayer`** :
  chaque step PDR recréait un `L.polyline` pour le trail tracker (multi-segments), mais
  l'ancien restait attaché à `window.map` côté objets Leaflet (le ref JS n'avait plus de
  pointeur dans `window.tracker._polyline` mais Leaflet le gardait dans `_layers`). Sur
  une session 30 min × 1 step/s → 1 800 polylines fantômes. **Fix** :
  `map.removeLayer(oldPolyline)` AVANT l'écrasement.

- **Fuite #3 — `URL.createObjectURL` photos Live Secours jamais `revoke()`** : les vues
  Live Mode Secours (Op / Équipe / Secouriste) créent un blob URL par photo affichée à
  partir du store IDB. Avant : URLs créées au render, jamais libérées au démontage de la
  vue → 1 photo/étape × 30 étapes × 5 photos = 150 URLs en RAM (chacune avec un blob de
  ~150 KB → ~22 MB). **Fix** : `_revokeAllPhotoObjectUrls(planId)` appelé au démontage
  de la vue Live + au plan switch. ⚠️ Voir §88.5.A — ce helper est aussi celui qui a
  exposé un **bug latent dormant depuis v1.21.3**.

- **Fuite #4 — `lostMode` SVG renderer non démonté** : à chaque ouverture de Lost Mode,
  un nouveau `L.svg()` était passé à `renderer:` pour le cercle de portée + segments
  budget. L'ancien restait dans `map._panes.overlayPane`. **Fix** : keep le renderer en
  module-local + reuse plutôt que recréation.

#### 88.5 Phase 4 (v1.34.16) — Fixes critiques RAM native iPhone

**Contexte** : malgré Phases 2-3, le crash iPhone à 20-25 min persistait. Audit profil
Xcode Instruments → la RAM **native** (côté WebKit/GPU, hors heap JS) gonflait
linéairement même après les fixes JS. Cause identifiée : **bitmap pinning WebKit**.

**Bug WebKit/iOS** : sur un `<img>` dont le `src` est un blob/data-URL, WebKit garde la
**texture GPU décompressée** en mémoire native tant que `img.src` pointe sur le blob,
MÊME si l'élément `<img>` est détaché du DOM. `map.removeLayer(overlay)` détache mais ne
clear pas `src`. Sur un plan tuilé 1 200 tuiles × ~120 KB texture décompressée GPU ≈
**140 MB de RAM native non libérée** au plan switch.

3 fixes en une release :

##### 88.5.A `_revokeAllPhotoObjectUrls` — helper qui n'existait pas

⚠️ Découverte majeure : ce helper était **appelé** depuis `_libererRessourcesPlanPrecedent`
**depuis v1.21.3** (cf release P0-6 « Plan switch leaks pack »), mais **jamais défini**.
Le `ReferenceError` était silencieusement avalé par le try/catch englobant du cleanup. Le
bug a dormi **13 versions** (v1.21.3 → v1.34.15), invisible côté UX mais cause directe
d'une fuite ~22 MB par plan switch sur sessions Mode Secours.

**Implémentation** : itère sur le store IDB `myktamap_secours_photos` filtré par
`planId`, garde les URLs créées dans un Set module-local, appelle `URL.revokeObjectURL()`
sur chacune, vide le Set.

**Leçon** : toujours `grep -rn "_revokeAllPhotoObjectUrls"` (ou équivalent) sur tout
nouveau helper appelé, pour vérifier qu'il a au moins une définition quelque part. Cf
`gotchas.md` → nouveau piège "Helper appelé jamais défini".

##### 88.5.B `libererTuiles` — clear `img.src` AVANT `removeLayer`

```js
function libererTuiles(layer) {
  if (layer && layer._image) {
    layer._image.src = "";
    layer._image.removeAttribute("src");
  }
  map.removeLayer(layer);
}
```

Le double `src = ""` + `removeAttribute("src")` est défensif : certaines versions
WebKit gardent la texture si seulement l'un des 2 est fait. Validé sur iOS 16, 17, 18.

##### 88.5.C Safe-remove `_ktaImageOverlays`

Symétrique de 88.5.B mais pour les **calques image** (légende, collision, etc.) gérés
par `_ktaImageOverlays`. Avant chaque `map.removeLayer(overlay)` dans la boucle de
cleanup, on clear le `src` de `overlay._image`. Cf `rendering-leaflet.md §39` pour le
pattern complet et les sites consommateurs.

#### 88.6 Pièges récurrents (à NE PAS faire)

- ❌ **Appeler un helper sans vérifier qu'il existe** — `_revokeAllPhotoObjectUrls` est
  resté en `ReferenceError` 13 versions dans un try/catch silencieux. Si un cleanup est
  enrobé d'un try/catch défensif, le log n'apparaît qu'en debug mode → audit grep
  cross-module obligatoire.
- ❌ **Nullifier en masse les `_*` du plan sortant sans whitelist** — `_lazyZipRef` doit
  survivre au cleanup générique. Pattern recommandé : liste blanche explicite
  `_LAZY_KEEP_KEYS` consultée pendant le sweep.
- ❌ **Croire que `map.removeLayer()` libère la RAM native sur iOS** — non. Toujours
  clear `img.src = ""` AVANT `removeLayer` sur tout `L.imageOverlay` qui pointe vers un
  blob/data-URL. C'est le piège WebKit bitmap pinning (cf §88.5.B + §88.5.C).
- ❌ **Recréer un `L.svg()` renderer à chaque ouverture d'une feature** (Lost Mode, mode
  Secours, etc.) — keep en module-local, reuse. Sinon les renderers s'empilent
  silencieusement dans `map._panes.overlayPane`.
- ❌ **Oublier `URL.revokeObjectURL()` après `URL.createObjectURL()`** — Phase 3 a tué la
  fuite Live photos Secours, mais à chaque nouvelle feature qui crée des blob URLs (ex:
  futur viewer photo plein écran), penser à revoke au démontage.

#### 88.7 Validation terrain

Test KARMA iPhone 12 mini iOS 17 PWA, plan test 1 200 tuiles + 80 POI + 35 photos :

| Métrique | Avant v1.34.10 | Après v1.34.16 |
|---|---|---|
| RAM native @ 5 min | ~280 MB | ~180 MB |
| RAM native @ 20 min | crash (~500 MB) | ~240 MB |
| RAM native @ 1 h | (jamais atteint) | ~310 MB stabilisée |
| Splash → premier frame | ~3.2 s | ~2.7 s |
| Plan switch RAM delta | +90 MB / switch | +12 MB / switch |

Cf `NETWORK_AUDIT.md` pour le détail des changements de surface réseau (zéro nouveau
fetch, zéro nouvelle permission).

---

---

## 🫥 Transparence des plans (v1.62.0)

> Une source PNG/WebP avec canal alpha n'est plus aplatie sur un fond opaque — ni au générateur V2, ni au tuilage runtime V1. Décision KARMA (reco 1:a 2:a 3:a 4:a).

**Helpers partagés** (`utils.js`) :
- `ktaTileExt(tilingManifest)` → extension des tuiles V2 : `"webp"`/`"png"` si `tiling.format` le dit, **sinon `"jpg"`** (= rétrocompat totale des plans V2 pré-v1.62.0, format `"jpeg"` ou absent). Consommateurs : `tiling.js` ×2 (résolution lazy + pré-extract), `emergencyMode.js`, `osmView.js`, `osmHomePreview.js`. Le scan ZIP de `main.js` est agnostique (regex sans extension).
- `ktaProbeAlphaTileFormat()` → `{mime, ext, name}` mémoïsé : **WebP** si `canvas.toBlob("image/webp")` encode vraiment (Chrome/Edge/Firefox), sinon **PNG** (Safari renvoie un blob PNG ou null). WebP ≈ PNG/3 en poids, décodage universel.
- `ktaDetecterAlpha(source, mimeHint)` → scan échantillonné (≤256px, stride 4 px, seuil `a < 250`). Hint JPEG court-circuite (jamais d'alpha). Échec lecture (CORS/OOM) → `false` = chemin opaque historique.

**Générateur V2** (`createConf.js > _genererTuilesV2`) : détection par CONTENU (un PNG ré-exporté sans alpha réel → JPEG léger). Source transparente → `clearRect` sans `fillRect`, `toBlob(fmt.mime)` (WebP q0.90 / PNG), fichiers `.webp`/`.png`, manifest `{format, alpha}`. Import KMZ/GPX re-tuilage V2 = même fonction.

**Tuilage runtime V1** (`tiling.js`) : détection sur l'image chargée → flag `canvas._ktaHasAlpha` posé par `_imageVersCanvasReduit`, lu par `_tilerDepuisCanvas`. Pas de fond, encodage WebP/PNG. ⚠️ La détection « canvas noir » (drawImage JPEG échoué) exige un pixel **opaque** `(0,0,0,255)` — un pixel `(0,0,0,0)` est légitime sur une source transparente.

**À NE PAS faire** :
- ❌ **Auto-cropper une source transparente** — le crop change `imageWidth/Height` + l'origine, les datalayers/georef/calibrations restent en coords d'origine → tout se décale (double décalage Y via `imageHeight - y`). Bug vécu KARMA à la v1.62.0-dev ; `_genererTuilesV2` skip le crop dès `hasAlpha`. Les marges transparentes se compressent à ~0 : le crop n'apporte rien.
- ❌ Décider du format sur le MIME du fichier (un PNG peut être 100 % opaque → JPEG reste le bon choix poids).
- ❌ Hardcoder une extension de tuile — TOUJOURS `ktaTileExt(manifest)`.
- ❌ Migrer les plans V2 legacy au runtime — le fond est cuit dans leurs JPEG, seule la régénération (Modifier → recocher V2, baseImage du ZIP garde son alpha) le retire.

---

## 🧱 Tuilage V2 des plans SIG, et le ré-encodage qu'on ne faisait pour rien (v1.82.0)

### Pourquoi un plan SIG est tuilé alors que son fond est un aplat

La Vue OSM du **mode plan** (`osmView.js`) refuse tout plan non tuilé — pas par confort, pour une raison mesurée : avant la v1.39.10 elle chargeait l'image entière via `imageOverlay.rotated`, ce qui **saturait le GPU d'un iPhone**. Un plan issu d'un SIG est pourtant le meilleur candidat qui soit pour cet écran, son géoréférencement étant **calculé** et non saisi à la main. `sigImport.js > genererZipMyktamap` réutilise donc `_genererTuilesV2` du Générateur plutôt que d'écrire un second tuileur.

**Dégradation assumée** : si le tuilage échoue, le plan sort en **V1** avec un `console.warn` — mieux vaut un plan utilisable en mode carte qu'aucun plan. L'utilisateur pourra le re-tuiler via « Modifier un plan ».

### 10,4 s → 0,8 s : ne pas ré-encoder ce qui est identique

Le fond d'un plan SIG est un **aplat uni** (`genererCanvasVierge`) : toutes ses tuiles pleines sont **le même octet**. Le tuileur les ré-encodait pourtant une par une. Le 4ᵉ paramètre de `_genererTuilesV2` dit « fond uni » et fait réutiliser l'encodage — **10,4 s → 0,8 s** sur un canvas de 10 000 × 11 680.

### Le plafond de SURFACE du canvas

Deux problèmes de même cause : un canvas 10 000 × 11 680 = **117 Mpx ≈ 467 Mo de RGBA**, et le pipeline en tient **deux** (le canvas, puis l'image re-décodée pour le tuilage). Près d'un gigaoctet pour un aplat — selon la machine, `toBlob` rend `null` **sans un mot**. S'y ajoute le plafond d'iOS Safari, autour de **16,7 Mpx** : l'ancien réglage par défaut (4 000 × 4 672 = 18,7 Mpx) le dépassait déjà, donc l'import SIG rendait un fond **vide sur iPhone** dans sa configuration de sortie de boîte. `dimensionsCanvas` borne désormais la surface et **prévient** au lieu de rogner en silence.

---

## 🏗️ « Afficher tous les niveaux au lancement » (v1.82.1)

Le défaut de la v1.10.0 ouvrait un plan sur les **trois niveaux centraux** — tenable à trois ou quatre étages, absurde sur un relevé importé qui en porte **six ou sept** : la carte s'ouvrait sur une fraction du travail sans que rien n'indique que le reste existait.

Case dans les réglages de performance du HOME, **cochée par défaut**. 🩸 Elle est rangée là parce que c'est un arbitrage de charge, mais **volontairement HORS du méta-bouton ULTRA** : afficher plus n'est pas optimiser, et « activer toutes les optimisations » ne doit jamais alourdir l'app.

⚠️ Les niveaux **découverts** dans un calque de données (après le calcul initial) deviennent visibles eux aussi — sans quoi l'option n'aurait rien changé là où elle sert le plus.
