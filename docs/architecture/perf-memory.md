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
