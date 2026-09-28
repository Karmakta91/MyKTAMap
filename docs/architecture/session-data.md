# Architecture MyKTAMap — Session, photos, undo, recherche, stats, favoris

> Référence détaillée extraite de l'ancien CLAUDE.md. Lue à la demande (pas auto-chargée).
> Sections : §9, §16, §17, §42, §46, §47, §49, §50, §56, §57, §63, §72

---

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

---

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

---

### 17. SessionPersist autoritative pour les editor points (depuis 09/05/2026)

`data/editor.json` peut contenir des points figés dans le plan (cas typique : utilisateur a fait un Convert session→data pour persister vers le ZIP). `SessionPersist` (localStorage) sauve ses propres editorPoints qui peuvent diverger.

**Règle** : si la session SessionPersist a des `editorPoints` pour le plan courant, on **skip** le fetch de `data/editor.json` côté `main.js > initDataFromConfig`. La session est autoritative — sinon les markers du JSON arrivent async APRÈS le restore et créent des doublons / des markers fantômes hors `listePoints`.

**Implémentation** : peek `localStorage["myktamap_session_v1"]` AVANT de lancer les fetches. Si match plan + nom + editorPoints non vide → flag `_skipEditorJsonLoad = true` → forEach saute le calque editor.

**Conséquence pour les autres calques** : aucune. Seul l'editor a ce problème car il a une vraie source de vérité côté listePoints. Les puits, vehicules, etc. sont read-only depuis le JSON.

---

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

---

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

---

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

---

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

---

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

---

### 72. Import `.mkmsec.report.json` — Consolidation cross-device (v1.26.0 — 2026-05-27)

Permet à l'opérateur surface d'**importer le rapport d'un équipier au retour terrain** (format `.mkmsec.report.json` exporté v1.25.0+ par la vue Live Équipe avec scope=`equipe`) et de **fusionner ses observations / statuts / photos** dans son tableau de supervision. Remplace fonctionnellement la voie QR Share Phase 4 (rollbacked v1.25.3-hotfix17).

KARMA quote :
> « go pour 1.26 » (= v1.26.0 import consolidation cross-device, suite naturelle de la roadmap, alternative au QR rollbacked)

#### 72.1 Workflow terrain

1. **Opérateur** prépare le scénario + lance le plan AVANT incident (3 rôles disponibles : op surface / équipier / secouriste libre)
2. **Équipiers** reçoivent le scénario via `.mkmsec.json` classique (Phase 2) OU mêmes IDs équipe (importés à la création du scénario)
3. Sur le terrain, chaque **équipier renseigne** obs / statuts / photos via vue Live Équipe (Phase 3)
4. **Au retour surface**, équipier exporte son rapport via « 📤 Rapport » → scope=équipier → format `.mkmsec.report.json` (avec ou sans photos base64 inline)
5. Équipier **transmet le fichier** à l'opérateur (AirDrop / mail / clé USB / Discord / WhatsApp — peu importe le canal, c'est un fichier statique)
6. **Opérateur ouvre vue Live Op** → bouton « 📥 Importer rapport équipier » → file picker → modale preview → confirmation → fusion

#### 72.2 Politique de fusion (validée KARMA v1.26.0)

| Champ étape | Politique | Détail |
|---|---|---|
| `observations` | Concaténation datée | `existant + "\n\n--- 📥 Import Équipier <ts> ---\n" + importé` — **aucune perte d'info** |
| `statut` | Plus sévère | `_severitéMaxStatut(opStatut, impStatut)` via `TABLEAU_STATUTS.severity` (sauf si import=pending qui n'écrase jamais) |
| `photoIds[]` | Push avec dédup | Dédup par `photo.id` (genId aléatoire = collision rare). Idempotent via `MyKTAMapSecoursPhotos.importPhotoFromDataUrl` qui détecte déjà-présent |
| `startedAt` | Min (plus ancien) | `Math.min(opStartedAt, impStartedAt)` — préserve la première activation |
| `completedAt` | Max (plus récent) | `Math.max(opCompletedAt, impCompletedAt)` — préserve la dernière update |
| `_importedFrom` | Flag ajouté | `{ sourceScenarioId, sourceAppVersion, importedAt }` (traçabilité + chip UI) |

**Scenario-level** : audit log dans `s.execution._importLog: [{ at, sourceScenarioId, sourceAppVersion, equipeId, equipeNom, etapesFusionnees, etapesSkipped, photosImportees, photosSkipped, photosDejaPresentes, warningsCount }, ...]`.

**Snapshot AVANT** : `SessionBackups.snapshot("Avant import rapport équipier <nom>")` → undo possible via 📊 Détails de session → Backups récents.

#### 72.3 Refus à l'import (sécu)

| Cause | Message |
|---|---|
| `scope !== "equipe"` | "scope='operateur' (snapshot complet, non fusionnable)" OU "scope='secouriste' (notes parallèles)" |
| `scenario.id !== s.id` | "Scénario d'origine différent — vient de '<nom_source>'" |
| `equipe.id` absent côté op | "Équipe '<nom>' absente du scénario actif — enregistrer avant lancement" |
| Pas d'exécution active | "Lancer le plan (🚀) avant d'importer un rapport équipier" |
| Type/version incorrect | Erreurs standard parse JSON |

Plan différent côté équipier → **warning** (pas erreur). Décision finale dans la modale preview.

#### 72.4 API JS

```js
// js/secoursMode.js
window.SecoursMode (par IIFE wrapper) — pas de nouvelle API publique côté
secoursMode (les helpers _parsePayloadReport, _appliquerImportRapportEquipe,
etc. restent internes IIFE). Le bouton UI dispatch tout en interne.

// js/secoursPhotos.js — nouvelle API publique
window.MyKTAMapSecoursPhotos.importPhotoFromDataUrl({
  id:                string,    // ID source de la photo (préservé pour dédup)
  scenarioId:        string,
  equipeId:          string,
  stepIdx:           number,    // -1 pour notes libres
  mime:              string,    // ex "image/jpeg"
  dataUrl:           string,    // data URL base64 complet
  sourceScenarioId?: string|null
}) → Promise<{ id, status: "imported" | "already-present" }>
// Différences avec addPhoto :
// - Préserve l'id source (pour dédup à l'import par id)
// - Skip la compression (déjà compressée à l'export par genererRapportData)
// - Skip la quota check (la limite était respectée à la source)
// - Idempotent si une photo avec le même id existe déjà
```

#### 72.5 UI Chip "📥 importé"

2 emplacements :
- **Card équipe Op** (vue Live Op) : chip à droite du nom si AU MOINS UNE étape a `_importedFrom` (= signal global "cette équipe a reçu de la consolidation")
- **Modale "Détails équipe"** (read-only) : chip à droite de chaque étape qui a `_importedFrom` (= granularité par étape)

CSS : `.kta-secours-imported-chip` (badge bleu clair + variants thème clair). Tooltip natif HTML avec date import + version app source.

#### 72.6 À NE PAS faire

- ❌ Activer l'import sans avoir lancé le plan d'abord — la validation refuse, mais ne pas tenter de bypass (l'exécution active fournit le contexte de fusion)
- ❌ Tenter d'importer un rapport `scope="operateur"` — ce serait écraser le tableau Op avec un autre snapshot global, casse la sémantique
- ❌ Supprimer le snapshot SessionBackups AVANT — c'est la SEULE voie d'undo (pas d'inverse de la fusion)
- ❌ Stocker les photos sans dédup id — risque d'explosion du store IDB si l'équipier importe son rapport plusieurs fois (idempotence garantie par `importPhotoFromDataUrl`)
- ❌ Bypass la quota `MAX_PHOTOS_PER_ETAPE` côté import — actuellement bypass volontaire (limite déjà respectée à la source), mais si on étend (autre rôle) il faudra revérifier

#### 72.7 Pour étendre

**Si on veut supporter l'import de `.mkmsec.report.json` scope="secouriste"** (notes libres) :
1. Modifier `_parsePayloadReport` pour accepter `scope === "secouriste"`
2. Étendre `_appliquerImportRapportEquipe` (ou créer `_appliquerImportNotesLibres`) pour push dans `s.execution.etapes._notes_libres`
3. Politique de fusion : append-only (les notes libres sont datées, pas de matching par idx)
4. Refus si une note importée a déjà le même `id` (dédup)

**Si on veut supporter le batch import** (plusieurs équipiers d'un coup) :
1. Modifier `_ouvrirImportRapportEquipePicker` avec `<input multiple>`
2. Loop séquentiel sur les fichiers (await chaque parse + preview + apply)
3. Modale résultat consolidée (somme des stats)

**Si on veut un mode "rejouer un rapport" (= preview SANS fusion)** :
1. Ajouter un toggle dans la modale preview "🔍 Aperçu seul (ne pas fusionner)"
2. Si coché, skip `_appliquerImportRapportEquipe`, ouvrir une vue read-only des étapes du rapport
3. Utile pour debug ou audit terrain a posteriori

---

---

## 🔒 Strip EXIF photos (v1.63.0 — A8)

> Reco KARMA 1:a 2:a 3:a. Le bypass « photo déjà petite (≤1920px ET <500 Ko) → blob original conservé » de `photos.js > compressBlob` (et sa copie `secoursPhotos.js`) laissait l'EXIF — dont le GPS de prise de vue — entrer en IDB et sortir dans tous les exports.

- **Ingestion** : plus AUCUN chemin ne retourne le blob original (hors `opts.skipCompress` du restore et le fallback d'échec — assumés). Petite photo → re-encodage sans resize à `COMPRESS_JPEG_QUALITY_SMALL = 0.92`. Le re-encodage canvas applique l'orientation EXIF (`drawImage`) → image droite sans flag.
- **Export anonymisé** (`sessionExporter.js`) : `_stripperExifPhotos(pack)` re-encode chaque blob AVANT le payload — **fail-closed** (photo non ré-encodable = exclue + warn, JAMAIS de blob original dans un ZIP anonymisé). `_anonymiserSession(session, photos)` : `idMap` id origine → code anonymisé, photos renommées `photo-anon-N` (zip-safe, pas d'emoji dans un nom de fichier), `pointId` remappé, `_enrichirPointsAvecPhotos` ré-appliqué sur les points anonymisés. Compteurs conservés si photos incluses.
- **Legacy IDB** : photos pré-v1.63.0 potentiellement avec EXIF — PAS de migration (reco 2:a) ; le strip à l'export anonymisé les couvre. Un export NON-anonymisé de photos legacy peut donc encore porter de l'EXIF — c'est le compromis accepté (l'export nominal est destiné à soi-même/équipe de confiance).

**À NE PAS faire** :
- ❌ Réintroduire un « fast path » qui retourne un blob original (c'est LE trou d'origine).
- ❌ Fallback blob original en cas d'échec de re-encodage dans un contexte ANONYMISÉ — toujours exclure (fail-closed).
- ❌ Strip binaire des marqueurs JPEG au lieu du re-encodage — le flag d'orientation partirait avec, image tournée.

---

## 🐛 Persistance tracker — 2 fixes v1.64.0

**Race du plan switch** (KARMA « au chargement je suis sur la position initiale ») : le poller d'auto-save (1.5 s) restait actif sur l'ANCIEN plan pendant le switch — le teardown (`main.js > _libererRessourcesPlanPrecedent`) vide la timeline tracker en RAM (`resetTrackingTimeline`), un tick pendant le chargement (plusieurs secondes) sauvegardait l'état MUTILÉ : timeline vide écrasée, voire slot PURGÉ (`_isEmptyState → removeItem`) pour une session tracker-seule. **Fix : `SessionPersist.onPlanUnload()`** appelé EN PREMIER dans le teardown — save final forcé (état intact) + `_stopPolling()` + `_currentPlanId = null` (neutralise aussi les filets `beforeunload`/`visibilitychange` pendant la fenêtre). Le polling redémarre au `onPlanLoaded` du nouveau plan. ⚠️ Tout NOUVEAU reset ajouté au teardown doit rester APRÈS l'appel `onPlanUnload`.

**« Effacer la session » vs tracker** : `_viderEtatCourant` (chemin 🗑️ de la modale de restauration) est antérieur à la persistance timeline (v1.21/1.28) et ne vidait jamais le tracker → la timeline restaurée + le tracé visible + le marker survivaient au refus. **Fix : `resetTrackingPosition()`** ajouté au vidage. Bonus : une session TRACKER-SEULE compte désormais dans le total de la modale de restauration (sinon pas de modale = pas de refus possible) — ligne « 🧭 tracé du tracker » (`session.unit.tracker`).

---

## 📔 Le Carnet — archive des sorties (v1.69.0)

> Décisions KARMA (topo 28/07/2026 — **1:c 2:b 3:a**) : archivage **hybride** (auto au teardown + bouton manuel + note éditable après coup) · contenu = **métadonnées + refs photos + tracé décimé** · **lot 1 seul** (socle + timeline HOME + fiche ; agrégation Mode Histoire / galerie transverse / export PDF = lots 2-3).

**Pourquoi** : avant v1.69.0, rien ne datait ni n'empilait une sortie. `sessionPersist` = état live écrasé par plan, `sessionBackups` = 10 rotations FIFO (destructif au-delà), timeline tracker per-plan, Mode Histoire enfermé dans l'écran plan. Impossible de répondre à « qu'est-ce que j'ai fait le 12 juillet ? ». Le Carnet est la couche **append-only** manquante : effacer une session ne détruit pas la sortie déjà archivée.

**Modules** : `js/journal.js` (socle, sans DOM) + `js/journalUi.js` (modale carnet + fiche). Séparation volontaire — le socle doit rester appelable sans UI, et on évite un nouveau monolithe.

**Storage** : IDB `myktamap_journal` v1, store `sorties` (keyPath `id`, index `by_start`). Une entrée ≈ 2-8 Ko :

```json
{ "id": "srt_<ts36>_<rand>", "schema": 1, "status": "close", "closedBy": "auto|manual",
  "type": "terrain|bureau", "typeManuel": false,
  "planId": "local_gm1_v2", "planName": "GM1",
  "startedAt": "2026-07-28T18:02:00.000Z", "startedAtMs": 1785000000000, "endedAt": "…",
  "activeMs": 5400000, "wallMs": 7200000, "distM": 3120, "steps": 480, "levels": [0, -1],
  "ajouts": { "points": 14, "roads": 2, "zones": 0, "structures": 0, "photos": 8 },
  "photoIds": ["ph_…"], "track": [{ "x": 4843, "y": 2002, "t": 1785000012000 }],
  "note": "", "appVersion": "v1.69.0" }
```

**Cycle de vie** (2 hooks dans `main.js`, ordre CRITIQUE) :
- `Journal.onPlanLoaded(planId, planName)` — **APRÈS** `SessionPersist.onPlanLoaded` : la baseline des compteurs doit inclure la session restaurée, sinon tout le contenu déjà présent serait compté comme « ajouté aujourd'hui ».
- `Journal.onPlanUnload()` — dans `_libererRessourcesPlanPrecedent`, **juste après** `SessionPersist.onPlanUnload` et **avant** le teardown : plus bas, `resetTrackingTimeline()` vide la timeline → tracé et distance de la sortie seraient perdus. Le record est snapshoté de façon **synchrone** ; seule l'écriture IDB est async.
- Flush IDB toutes les **30 s** + à chaque `visibilitychange → hidden` / `pagehide` (mobile tué sans préavis). Le record « en cours » est donc récupérable après un kill.

**Temps actif** : même règle que le compteur global du profil (`homeProfile > _flushTotalTime`) — pas de comptage onglet caché, deltas > 5 min ignorés (veille). `activeMs` ≠ `wallMs`, les deux sont stockés.

### 🚶 terrain vs 🖥️ bureau (retour KARMA 29/07/2026 — reco 1:a 2:a 3:a)

**Le lot 1 confondait deux natures de session** : une soirée de dessin à la maison atterrissait dans le carnet à côté d'une vraie sortie — et le seuil « ≥ 1 ajout » le *garantissait*. Correction :

- **Classement AUTO sur le seul signal fiable, le déplacement tracker** → `type: "terrain"`, sinon `"bureau"`. Ni la durée ni le nombre d'ajouts ne discriminent (on peut passer 3 h à dessiner assis, comme parcourir 2 km sans rien annoter). ⚠️ La règle d'origine (`distM > 0 || steps > 0`) a été **révisée le 16/08/2026** — cf. section dédiée plus bas.
- Ré-évalué **à chaque snapshot** : une session démarre toujours `bureau` et bascule `terrain` quand le seuil est franchi. L'inverse n'arrive jamais (le déplacement ne se dé-parcourt pas) → pas d'oscillation.
- **Correction manuelle** possible sur la fiche (`Journal.setType`) → pose `typeManuel: true`, et le record n'est **plus jamais** reclassé automatiquement (cas d'usage : sortie faite tracker éteint).
- **Totaux du carnet = terrain UNIQUEMENT** (`stats()` renvoie `bureau`/`bureauMs` à part). Mélanger du temps de dessin à des heures passées sous terre rendrait le chiffre faux.
- **UI** : liste scindée — sorties terrain en premier, section **repliée** « 🖥️ Travail sur plan (N) » en dessous. La modale Session de l'écran plan annonce la nature **en direct**, sinon l'user découvrirait le classement après coup.

**Seuils d'archivage AUTO** (la clôture **manuelle** garde toujours, puis **rouvre immédiatement** une sortie sur le même plan). Depuis le **16/08/2026**, ce sont deux critères en **OU**, plus un aiguillage sur le type :

| Critère | Rempli si |
|---|---|
| terrain | ≥ **50 m** de distance exploitable (podomètre **+ tronçons estimés**) |
| bureau | ≥ **10 min** actives **ET** ≥ 1 ajout |

⚠️ Le critère « ≥ 1 ajout » du lot 1 a été **supprimé** — c'était lui le coupable. En dessous des seuils, la session est **jetée** (`remove(id)` — y compris l'éventuel flush « en cours » déjà écrit, sinon un fantôme resterait au carnet).

### 🔧 Révision du 16/08/2026 — la sortie de navigation pure ne pouvait pas entrer

**Constat KARMA** : sortie réelle (itinéraire posé, tracker à peine activé, validations d'étapes jusqu'à la sortie) **absente du carnet**, alors que ses sessions de travail y entrent. Trois causes cumulées, chacune suffisante :

1. **Les validations d'étapes sont des `recalage`** → `getTrackingDistanceM()` les saute → **0 m**. Corrigé par la distance estimée entre ancres (`tracking.md § Distance estimée`) : le Carnet lit désormais `getTrackingDistanceTotaleM()`, et stocke la part estimée à part (`distEstimeeM`) pour pouvoir dire « 820 m *dont 600 estimés* ».
   ⚠️ **`_affinerDistances` tourne AVANT `_pertinente`** (révision du 17/08) : au clic, seul le vol d'oiseau est posé — le chemin réseau coûtait une reconstruction de graphe **par clic**, doublée par la replanification d'itinéraire. L'affinage se fait donc en une passe à l'archivage, sur les roads **capturées** à cet instant (jamais relues plus tard : on serait déjà sur le plan suivant), et **avant** le verdict de rétention — sinon une sortie à 45 m de ligne droite valant 200 m de galeries serait jetée, soit exactement le bug d'origine.
2. **L'itinéraire est EFFACÉ à l'arrivée** (`interfaceItineraire` clôture à la dernière étape) → son `+1 road` disparaissait du delta. ⚠️ **Limite non corrigée** : les `ajouts` sont des **différences de longueurs de tableaux**, donc tout objet créé PUIS supprimé pendant la sortie reste invisible. Corriger demanderait de compter des événements, pas des états.
3. **La rétention n'examinait QUE la branche du type classé** : un seul pas PDR parasite basculait la session en terrain, qui n'était alors jugée que sur ses 50 m — 3 h de travail et 20 ajouts partaient à la poubelle sans appel. C'est le passage au **OU** ci-dessus. Le type redevient un **libellé d'affichage**, plus un juge.

**Classement révisé** (`_classer`) : `validations > 0` → terrain **à lui seul** (l'user affirme être physiquement passé par un point, et ce geste ne produit aucun pas PDR) ; sinon terrain si `distM ≥ MIN_TERRAIN_DIST_M` (**20 m**). L'ancienne bascule « dès le 1er pas » polluait les totaux, qui ne comptent que le terrain.

**Baseline des validations** : `onPlanLoaded` mémorise `getTrackingValidations()` au démarrage — la timeline est **restaurée** au chargement du plan, donc sans cette baseline les validations d'une sortie précédente seraient recomptées et classeraient d'office la nouvelle session en terrain.

**Correction du type depuis l'écran plan** (demande KARMA) : boutons 🚶/🖥️ dans la section 📔 de la modale Session, à côté de « 🏁 Clôturer ma sortie ». Les deux boutons sont repeints **à la main** plutôt que par un re-render de la section — un re-render détruirait l'élément sous le doigt (mécanisme exact du bug de color picker de la Légende, v1.77.0).

⚠️ **Piège corrigé au passage** : `setType` faisait `get(id)` en IDB et rendait `false` si le record n'existait pas encore. Or la sortie **en cours** n'est écrite qu'au premier flush (30 s) — le reclassement partait donc **en silence** sur une sortie fraîche. Invisible tant que le seul point d'entrée était la fiche d'une sortie archivée ; le bouton de la modale Session vise justement l'inverse. `setType` applique désormais sur l'état RAM + `flush()` quand le record n'est pas encore en base.

**Deltas** : `ajouts` = compteurs courants − baseline, clampés à 0 (une suppression nette n'affiche pas un ajout négatif). La distance se **ré-ancre** si elle recule (session effacée / tracker reset) — sans ça le delta partirait négatif pour le reste de la sortie.

**Photos** : hook `Journal.onPhotoAdded` posé dans `photos.js > addPhoto` (succès) et **PAS** dans `restorePhoto` — réimporter une session ne doit pas gonfler le compteur de la sortie en cours. Le carnet ne stocke que des **refs** : une photo supprimée de l'app affiche une vignette « 🚫 photo supprimée », pas une erreur.

### 📖 Onglet Récits — Mode Histoire remonté au HOME (v1.69.0, demande KARMA 29/07)

La note libre et le PDF d'un plan étaient **enfermés dans l'écran plan** : il fallait charger le plan pour relire ses propres notes. Le carnet les expose tous, sans charger quoi que ce soit — modale carnet, 2e onglet.

- **Sources lues directement** : `localStorage["myktamap_note_libre_<planId>"]` (balayage du préfixe) + IDB `myktamap_histoire_pdfs` / store `pdfs` (keyPath `planId`). Le nom du plan est résolu via `PlanRegistry`, sinon via les sorties du carnet (un plan supprimé du registre garde son nom), sinon l'id brut. `planId = "default"` = notes prises hors plan.
- **Édition sur place** : la fiche récit écrit **exactement la même clé** que `modeHistoire.js` — aucune copie divergente. Rendu Markdown via `window.kta_renderMd`.
- **PDF** : tous les documents de la base IDB — les **importés** et, depuis le **26/09/2026**, les **livrés avec le plan**. Un embarqué n'a pas d'existence hors du plan chargé (son chemin runtime vient de `RUNTIME_ASSETS`), donc `modeHistoire.js > syncDocsEmbarques()` en dépose une **copie** dans la même base à la fin du chargement du plan (appel différé de 1,2 s depuis `main.js`). Id **déterministe** `embed_<planId>_<rang>` + `put` : dix chargements ne font pas dix copies. L'enregistrement porte `embarque: true` (libellé « livré avec le plan », préfixe 📕) et `embedIdx` — c'est lui qui évite que le Mode Histoire affiche **deux fois** le même document (la copie remplace l'entrée embarquée ; celle-ci ne reste qu'en **repli**, si la copie a échoué : quota, navigation privée, fetch KO). ⚠️ **Une copie est supprimable et rouvrir le plan la recrée** (décision KARMA) : pas de liste de pierres tombales à maintenir. Plafonds partagés avec l'import manuel (10 documents, 100 Mo) — la copie ne dépasse jamais ces bornes, elle s'arrête. Couvert par `scripts/smoke/checkup-carnet-documents.js`, qui falsifie.
- **Ajout / suppression depuis le carnet** (décision 3:a) : même schéma IDB que `modeHistoire.js`. Si la base est encore en **v1** (l'user n'a pas rouvert le Mode Histoire depuis la mise à jour), l'ajout est **refusé** avec un message qui renvoie vers le Mode Histoire — y écrire créerait une clé `planId` en doublon qui écraserait le PDF existant.
- **Perf** : l'onglet n'est scanné qu'à sa première ouverture ; la liste utilise `getAllKeys()` (charger `getAll()` mettrait tous les PDF en RAM pour afficher une pastille), le blob n'est lu qu'au clic sur « Ouvrir le PDF ». L'`<iframe>` est vidée avant `remove()` (bitmap PDF épinglée sur WebKit — même leçon que `modeHistoire.js > close()`).

⚠️ **Piège IDB** : `indexedDB.open(nom)` **sans version crée** une base vide si elle n'existe pas. Le Mode Histoire ferait ensuite `open(nom, 1)` sans `onupgradeneeded` → store `pdfs` absent → plantage. `_histOpen()` détecte la création et **supprime** la base aussitôt. Ne jamais simplifier ce garde-fou.

**Points d'entrée** : bouton HOME `📔 Mon carnet` (hors accordéon 🧰 Outils — usage régulier, pas outil ponctuel) · écran plan → modale Session → section `📔 Sortie en cours` (`🏁 Clôturer ma sortie` + `📔 Ouvrir mon carnet`).

**Garde-fous** : purge FIFO au-delà de **500 sorties** · tracé décimé à **1500 points** (premier/dernier conservés) · carnet désactivable (`localStorage > myktamap_journal_enabled = "0"`) · DB déclarée dans `memInspector.KNOWN_IDB_DBS` et dans le calcul « Stockage » du profil (`homeProfile._IDB_STORES`), sinon l'espace occupé serait invisible.

**À NE PAS faire** :
- ❌ Déplacer `Journal.onPlanLoaded` **avant** la restauration de session (baseline faussée) ni `onPlanUnload` **après** un reset du tracker (tracé perdu).
- ❌ Réintroduire « ≥ 1 ajout » comme seuil d'archivage terrain/global, ni compter le bureau dans les totaux — c'est exactement ce qui rendait le carnet illisible.
- ❌ Recalculer le `type` d'un record `typeManuel: true`.
- ❌ Copier les blobs photo dans le carnet (duplication du quota IDB — le choix 2:b est **refs only**).
- ❌ Compter les photos de `restorePhoto` comme photos de la sortie.
- ❌ Considérer le carnet comme une sauvegarde : il n'archive ni les points ni les tracés eux-mêmes (rôle de `sessionBackups` / de l'export session).

**Limite assumée** : aucun remplissage rétroactif — le carnet démarre vide en v1.69.0, il n'existait pas de « sortie » avant.

**✅ Dette soldée en v1.74.0** (elle disait : « le carnet n'est pas inclus dans l'export/import de profil — un profil réimporté sur un autre appareil arrive sans son carnet »). Le carnet est désormais une **section à part entière** du profil (`profileExportImport.js`) :

- **Collecte** `_collectCarnet()` — appelle `Journal.flush()` **avant** `Journal.list()` : la sortie en cours n'est écrite en IDB que toutes les 30 s (`FLUSH_MS`), sans ce flush un export lancé juste après une sortie perdrait les dernières minutes.
- **Cochée par défaut** (comme sessions/backups, contrairement à photos/crashes) : ~2-8 Ko par sortie, plafond 500 → ~4 Mo pire cas, et **aucune image** (le carnet ne stocke que des refs photos).
- **Apply** : ouverture IDB directe (`myktamap_journal` v1, store `sorties`) — même motif que les backups, `Journal` n'expose pas d'API d'import bulk. `put()` par id, `clear()` d'abord en mode replace, records sans `id` filtrés.
- ⚠️ **L'`onupgradeneeded` de l'import DOIT recréer l'index `by_start`** : si la base n'existe pas encore sur l'appareil cible, c'est l'import qui la crée — sans l'index, la purge FIFO de `journal.js` casserait.
- Les records `status: "encours"` sont exportés tels quels : `_balayerEnCours()` les clôturera proprement au boot suivant sur l'appareil cible.
- `myktamap_journal_enabled` ajoutée à `PREF_KEYS` (le carnet désactivé reste désactivé après migration).

⚠️ **Reste hors périmètre** : les **PDF du Mode Histoire** (IDB `myktamap_histoire_pdfs`, jusqu'à 100 Mo/plan) ne voyagent toujours pas. Conséquence à connaître : l'onglet **📖 Récits** du carnet arrive avec ses notes libres (elles, transportées via le préfixe per-plan `myktamap_note_libre_`) mais **sans les PDF**. Décision à trancher si le besoin remonte : section optionnelle décochée par défaut, sur le modèle des photos.

---

## 📄 Mode Histoire — documents PDF multiples (v1.69.0)

> Question KARMA 29/07/2026 (« peut-on mettre plusieurs PDF ? ») → reco **1:a 2:a 3:a**. Avant : **un seul** PDF importé par plan (`keyPath: "planId"`), un nouvel import écrasait le précédent ; et le PDF **embarqué** dans le ZIP **masquait la toolbar**, donc sur ces plans-là l'utilisateur ne pouvait rien joindre du tout.

**Schéma IDB `myktamap_histoire_pdfs` — v1 → v2** :

| | v1 (≤ v1.68.1) | v2 (v1.69.0) |
|---|---|---|
| keyPath | `planId` | `id` (`doc_<ts36>_<rand>`) |
| index | — | `by_plan` sur `planId` |
| documents | 1 par plan | N par plan |

**Migration** : le keyPath d'un store ne se change pas. `onupgradeneeded` lit les anciens enregistrements au curseur, `deleteObjectStore`, recrée le store en v2 + index, puis re-`put` chaque ancien PDF avec un id neuf — **dans la même transaction `versionchange`**. Chaque PDF déjà importé devient le document n°1 de son plan, aucun n'est perdu.

**Garde-fous** (il n'y en avait aucun) : `MAX_DOCS_PAR_PLAN = 10` (refus), avertissement au-delà de **25 Mo** cumulés, refus au-delà de **100 Mo**. Contrôle **avant** écriture (`_verifierQuota`).

**UI** : le PDF embarqué devient une **entrée de liste** (`EMBED_ID = "__embed__"`, 📕, non supprimable) au lieu de tout masquer. Liste affichée seulement à partir de 2 documents. Une seule blob URL vivante à la fois (`_urlDeDoc` révoque la précédente — fuite bitmap iOS), et l'`<iframe>` est vidée avant retrait.

**Propagation obligatoire — 3 consommateurs hors module** (tous corrigés, à ne pas oublier si le schéma rebouge) :
1. `sessionExporter.js > _lirePdfsHistoireSession` — ouvrait la base **figée sur `open(nom, 1)`** : avec la base en v2, ça lève une `VersionError` et le PDF **disparaissait silencieusement des exports**. Ouvre désormais **sans version**, lit via l'index (et retombe sur `get(planId)` si la base est restée en v1). Exporte **tous** les documents, noms **dédoublonnés** (deux homonymes s'écraseraient dans le dossier ZIP).
2. `interfaceImportExport.js` — lit `historeSessionPdfs` (tableau) avec repli sur `historeSessionPdf` (ancien champ unique, conservé à l'export pour rétrocompat).
3. `modeHistoire.js > importSessionData(note, docs)` — **ajoute** au lieu d'écraser (réimporter une session ne détruit plus le document en place) ; l'ancienne signature `(note, blob, name)` reste acceptée.

**Inventaire de stockage** : la base est ENFIN déclarée dans `memInspector.KNOWN_IDB_DBS` et `homeProfile._IDB_STORES` — elle en était absente depuis v1.34.20, donc un PDF de 40 Mo ne comptait nulle part dans « Stockage ».

**🖥️ Grand écran (≥ 1024 px, retour KARMA 29/07)** — tout en CSS, mobile strictement inchangé (même seuil que la modale ⚙️ Réglages) :
- modale carnet 640 → **900 px**, liste 62vh ; fiche de sortie 560 → **760 px** (mini-tracé 220 px, vignettes 84 px) ;
- fiche récit 560 → **820 px** ; et **avec un PDF ouvert** : `95vw` × `92vh` en **2 colonnes** (note + documents à gauche ~30 %, visionneuse à droite pleine hauteur). La classe `kta-jrn-recit-avecpdf` est posée/retirée en JS à l'ouverture/suppression du PDF — une note seule dans une modale géante se lirait mal ;
- les colonnes sont en `flex: 1` + `min-height: 0`, **pas** une hauteur calculée avec la taille du header : celle-ci n'est pas une constante (titre long, zoom 125 %) ;
- modale Mode Histoire 900 → **1400 px** / 92vh (c'est la surface de lecture principale des PDF).

**À NE PAS faire** :
- ❌ Rouvrir la base avec un numéro de version figé (`open(nom, 1)`) — c'est le bug n°1 ci-dessus, silencieux.
- ❌ Écrire dans le store depuis un module tiers sans vérifier la présence de l'index `by_plan` (base encore en v1 → clé `planId` → écrasement).
- ❌ Réintroduire « l'embarqué masque l'import ».

---

### 🔄 Reclasser un objet — changer de type, et au besoin de FAMILLE (v1.82.0)

`js/convertirObjet.js` — bouton **🔄 Convertir** dans la popup d'un objet de
session (tracé, zone, structure).

**Pourquoi ce n'est pas cosmétique** : à l'import SIG, tout part en « front de
taille » — globalement juste, la géométrie d'un fichier SIG ne disant pas ce que
l'objet *est*. Mais le Pathfinder ne construit son graphe que sur les `roads`
(cf. `multilevel-pathfinding.md`) : un plan dont tout le relevé est en structures
n'a **aucun** itinéraire possible. Reclasser un vecteur est ce qui le fait
exister.

**La règle, énoncée par KARMA** : « un vecteur fermé = zone ou pilier, un vecteur
non fermé = tracé ou front de taille ».

```
OUVERT  ⇄  tracés (galeries)  ⇄  structures polylignes (fronts)
FERMÉ   ⇄  zones              ⇄  structures polygones (piliers, murs)
```

La traversée ouvert↔fermé est **refusée**. Ce n'est pas une convention : la
frontière porte les **minimums de points** — un front peut n'avoir que 2 points,
une zone en exige 3. L'autoriser obligerait à fermer ou ouvrir la géométrie,
c'est-à-dire à **inventer de la donnée relevée sur le terrain**.

L'« ouverture » se lit sur le **type**, pas sur la géométrie : les mêmes `points`
se peignent en trait ou en surface selon lui. `isStructurePolylineType` sait déjà
lire la géométrie déclarée dans la légende, types personnalisés compris — ce sont
d'ailleurs les seuls d'un plan importé, sans eux la modale serait vide.

**Conservés** : `points`, `level`, `description`. **Retirés** : `fromLevel` /
`toLevel` (ils n'ont de sens que pour une jonction et feraient mentir les filtres
de niveau). **Exclus des cibles** : `jonction` (deux niveaux qu'une conversion ne
peut pas deviner) et `itinerary` (le trajet calculé, pas une donnée).

🩸 **Le piège du lire-écrire-relire** : les trois listes sont lues d'un bloc AVANT
toute écriture. Sinon un reclassement **dans la même famille** (front → pilier)
retire l'objet, réécrit la liste, puis la relit — et le duplique ou le perd. On
n'écrit ensuite que les familles réellement touchées : `setStructures` relance un
rendu complet, ce qui coûte cher sur un relevé à 20 000 objets.

Undo par `HistoryManager` (snapshot des trois familles avant l'opération).

⚠️ **Session uniquement.** Un objet de calque de données n'est pas éditable en
place. Le chemin est « Session → Conversion » pour rapatrier le calque, puis
ici — c'est la manœuvre que KARMA avait déjà trouvée.

**Prouvé** : 30 cas dans `check-api-surface.js`, module réellement chargé en VM.
Falsifiés — retirer la règle ouvert/fermé fait tomber 2 cas, écrire avant de
relire en fait tomber 1 (celui de la même famille).

---

### 🎯 Convertir EN LOT — sélection multiple (v1.85.0)

KARMA, 05/09 : « sélectionner N vecteurs et les convertir d'un coup ». `js/selectionMulti.js` arme un mode de désignation
sur la carte ; `KtaConvertir.convertirLot(items, familleCible, typeCible)` applique le lot.

**🩸 La règle porte sur l'OUVERTURE, pas sur la famille.** Un tracé et un front de taille sont tous deux des **lignes** :
les mélanger est légitime, et c'est LE cas utile — 40 fronts mal typés qui deviennent des galeries. Ce qu'on refuse, c'est
de mêler une ligne et une surface fermée : aucune cible commune, on ne referme pas un trait. Resserrer la règle sur la
famille tuerait la raison d'être de la feature **sans casser un seul test naïf** — d'où l'assertion dédiée.

**Le refus est EXPLIQUÉ.** `_choisir()` rend `{ cible, refus }` : `refus` porte l'objet incompatible visé, pour pouvoir
dire pourquoi. Un clic sans effet et sans mot se lit comme un bug de la carte — symptôme déjà payé sur les pickers en
v1.28.0.

**🩸 Le lot est UN geste.** Un instantané d'historique, **une** entrée, une écriture par famille *touchée*. Appeler
`convertir()` N fois donnerait N re-rendus complets (`setRoads` reconstruit tout — coûteux à 20 000 objets) et N `Ctrl+Z`
pour annuler. Les trois listes sont lues **avant** toute écriture, même piège que `convertir()` en v1.82.0. Zéro
conversion ⇒ aucune écriture et aucune entrée d'historique : il n'y a rien à annuler.

**Cibles du lot = UNION**, jamais intersection. Un type qui est la *source* de l'un peut être la *cible* d'un autre
(« chemin » reste valable pour des fronts même si un chemin est dans la sélection). Les objets déjà du type choisi sont
**sautés**, comptés à part, jamais en échec.

**La surbrillance est un calque à part**, pas un `setStyle` sur les layers existants : il n'existe pas de registre
objet → layer fiable pour les trois familles, et un re-render écraserait des styles modifiés à la main. Le calque est
`interactive: false` — sinon il mangerait les clics qu'il aide à viser. Sa couleur est l'accent d'interaction de la charte
(`#8cb4ff`) : ce n'est pas un style de *type*, c'est un état d'interface, et `check-style-canon.js` refuse toute table de
couleurs locale.

**➕ « Tous les \<type\> du niveau affiché »** n'est pas un confort : sans lui, désigner 200 objets un par un coûte autant
qu'avant. On divise le nombre de *conversions*, pas celui des *clics*.

**🧭 Dette adressée à moitié, sciemment.** `_pointInPolygon` vivait en **quatre** copies locales (`interface.js`,
`pathfinder.js`, `secoursMode.js`…). Le module devient le **foyer canonique** (`window.ktaPointInPolygon`,
`window.ktaDistPointSegment`) sans rouvrir les quatre : elles servent trois chemins de suppression qui fonctionnent, et on
ne les touche pas dans une version non déployée. Migration au BACKLOG.

**Garde-fou** : `scripts/check-selection-multi.js` — le cœur de la visée (`_choisir`) est exposé et éprouvé **sans
Leaflet**. **8 sabotages** rougissent. Deux faiblesses du garde-fou lui-même ont été trouvées par cette falsification :
les assertions déréférençaient `.cible.obj` sans garde (une régression rendant `null` faisait *planter* le script au lieu
d'échouer lisiblement), et le contrôle `interactive: false` était satisfait par le **commentaire** qui explique la règle.

---

### 🗑️ Supprimer l'objet — même bulle, même référence (v1.85.0)

KARMA, 05/09 : « rajoute, dans le truc pour convertir, un bouton supprimer ». Supprimer un tracé imposait de repasser par
la barre latérale et son sélecteur, alors que la bulle tient déjà **la famille et l'objet lui-même** — c'est le seul
endroit du code où les deux sont réunis. D'où `KtaConvertir.supprimer(famille, obj)`, voisine de `convertir()`.

**🩸 L'identité est prise par RÉFÉRENCE, jamais par contenu.** `roads` et `zones` **n'ont pas d'`id`**
(cf. `data-formats.md` : snapshot brut `{type, points, label?, level?}`), et deux tracés peuvent porter exactement le même
type et la même géométrie — deux passages parallèles relevés à l'identique, ça arrive. Une recherche par égalité de contenu
supprimerait le **sosie**, et le symptôme serait invisible : l'utilisateur verrait un objet en moins, au bon endroit.
`indexOf(obj)` compare les références, et la bulle porte l'objet.

**⚖️ Pas de confirmation.** C'est le parti-pris déjà tenu pour la suppression d'un POINT (`supprimerPointEditor`), qui
s'appuie sur `Ctrl+Z`. Un second dialogue là où le premier n'en a pas serait incohérent. Deux conséquences assumées :
le snapshot d'historique est **le seul filet** — sans lui l'objet serait perdu pour de bon —, et le toast **rappelle**
l'annulation, sinon le filet existe sans que personne le sache. Le bouton vit dans sa **propre ligne rouge** :
collé au « Sauver la note », il se cliquerait par accident.

**🩸 La bulle est fermée avant tout.** Le setteur (`setRoads`…) relance un rendu complet de la famille : le layer qui
porte la bulle est détruit. Sans fermeture explicite, la bulle reste à l'écran, accrochée à un layer mort.

**🧹 Effet de bord réglé** : les accesseurs des trois familles vivaient **dans** `convertir()`. La suppression avait besoin
des mêmes — les recopier aurait fait une 4ᵉ table. Hissés en `_lire(famille)` / `_ecrivain(famille)`, lus à chaque appel
(`window.setRoads` peut ne pas exister au chargement du module).

**Garde-fou** : `scripts/check-api-surface.js` — 14 assertions, dont le cas des **deux jumeaux** (même type, même
géométrie : seul le visé doit partir). 4 sabotages rougissent : chercher par contenu, sauter le snapshot, accepter un
objet absent, ne pas fermer la bulle.

---

## 🔄 Rapatrier un calque de données dans la session (v1.85.0)

**Le besoin** (KARMA, 04/09) : corriger un front de taille en tracé sur un relevé de Bordeaux importé du SIG imposait **huit étapes** et deux allers-retours par des fichiers — Éditeur de données → export du calque → conversion en session → masquage manuel → réimport → correction → reconversion → réinjection.

### 🩸 La cause est structurelle, pas ergonomique

> « Un data layer est rendu **UNE seule fois** à l'import — on ne peut pas re-render comme `renderRoads`/`renderStructures` » — `utils.js`, registre des ghosts

Les objets de **session** ont `renderRoads()` / `renderZones()` / `renderStructures()`, qui reconstruisent le rendu depuis l'état. Le calque, non. Tout le détour existait pour **amener la donnée là où un re-render existe** — `convertirObjet.js` l'assumait déjà : « ⚠️ SESSION UNIQUEMENT ».

**Ce qui n'a pas été réécrit** : la transformation calque → session existe depuis longtemps (`sessionExporter.js > _exportConvData2Session`) et c'est un **pur remappage** (`roads` reste `roads`). Ce module la fait **en place**, et pose le verrou.

### ⚖️ Pourquoi le calque ENTIER, et pas objet par objet

Le rapatriement par objet serait ~5× plus léger en session. Il a été **écarté sur objection de KARMA**, et l'objection est décisive : il reporte la douleur sur la **reconstruction du ZIP**, où il faudrait retirer les originaux un par un.

Or *roads* et *zones* **n'ont pas d'`id`** (`data-formats.md` : snapshot brut `{type, points, label?, level?}`). Il faudrait donc une clé dérivée de la **géométrie** — que `tabledit.dedup` **casserait en silence**, puisqu'il retire les sommets consécutifs identiques. *Une clé qu'un outil maison peut invalider sans le dire est une fausse solution.*

Le calque entier donne **une seule source de vérité** : la reconstruction devient « ce fichier remplace ce calque ». Pas d'ids, pas de dédoublonnage, **pas de doublon possible par construction**.

### 💰 Le coût, mesuré et annoncé AVANT

| | |
|---|---|
| Poids en session | **225 o/objet** (mesuré sur les extraits Gironde) → ~**1,1 Mo** pour 5 000 objets |
| Plafond `localStorage` | ~**5 Mo pour tout le domaine**, tous plans confondus |
| Aggravant | `SessionPersist` **re-sérialise la session entière** à chaque sauvegarde |

`peser(id)` lit le **vrai JSON** du calque (la moyenne de 225 o vaut pour un relevé Gironde, pas pour un calque de douze points) et `occupationLocalStorage()` somme les clés réelles. La confirmation donne les deux. **Aucune supposition sur le nombre de plans convertis en parallèle : l'app le mesure.**

### 🔒 Le verrou d'affichage

Règle KARMA : un calque rapatrié est **interdit d'affichage**, automatiquement, **déblocable en recochant sa case** (on affiche alors les deux volontairement, pour comparer avant/après).

Il vit dans `filterPanel.js` — **seul point de contrôle** de la visibilité d'un calque. Le poser ailleurs ferait deux contrôles concurrents sur le même état.

### 🩸 Les deux pièges, et pourquoi ils coûtent cher

1. **« Effacer la session » RESTITUE les calques.** Le verrou vit dans la session. S'il survivait à l'effacement de la copie, le calque d'origine resterait masqué : l'utilisateur verrait **son relevé disparaître** et croirait le plan cassé. `sessionPersist.js > clear()` restitue d'abord — les deux tombent ensemble, jamais l'un sans l'autre.
2. **Au chargement, le verrou ne s'applique QUE SI la copie est là.** Cas mortel : la sauvegarde saute sur quota (1,1 Mo, c'est *exactement* le seuil), on recharge, le verrou masque et la copie manque → **plan vide et muet**. `appliquerVerrous()` vérifie la présence avant de masquer, **libère** sinon, et le dit. Appelée en **fin** de restore (différé 250 ms), après les objets — sans eux elle ne peut pas juger.

### 💾 Le retour vers le ZIP

`exporterCalque(id)` produit **UN** fichier de la forme du calque d'origine. *Le convertisseur « session → data layer » ne pouvait pas servir : il éclate la sortie en `points.json` + `roads.json` + `zones.json` + `structure.json`, voire un fichier par type — **quatre fichiers ne remplacent pas une ligne**.*

🎯 **Le protocole de remplacement prévu s'est révélé inutile.** Le Générateur le fait déjà : dans « Modifier un plan », chaque calque est **une ligne portant son id et son propre sélecteur de fichier**. Choisir le fichier corrigé sur cette ligne remplace son contenu — **la ligne EST le calque**.

Trois règles dans l'export :
- 🩸 **Les tableaux vides sont ÉCRITS, pas omis.** C'est un remplacement : `zones: []` est la seule façon de dire « j'ai tout supprimé ». Les omettre annulerait la suppression au rechargement.
- 🧹 La marque interne **`_srcCalque` est retirée** — elle n'a rien à faire dans le ZIP d'un plan partagé.
- ⚠️ Les objets **créés à la main** pendant la session ne partent pas (ils n'appartiennent pas au calque) mais sont **comptés et annoncés** : les verser d'office déciderait à la place de l'utilisateur, les taire lui ferait croire tout embarqué.

Le nom du fichier vient de **l'id du calque**, pas du chemin : `dataLayers[].file` est résolu au chargement (`config.js > cloneAndResolvePlanConfig`) et vaut souvent une URL `blob:` sur un plan importé.

### État persisté

```json
"calquesSession": { "rapatries": ["sig"] }
```

Rien de plus : les **objets** vivent déjà dans `roads`/`zones`/`structures`/`editorPoints`, marqués `_srcCalque`. `null` tant que rien n'est rapatrié → **zéro octet** pour qui ne s'en sert pas.

**Garde-fou** : `scripts/check-calque-session.js` (pré-commit bloquant) — 63 assertions, le vrai module chargé dans un `vm`.

---

## 🔁 Reprise d'une sortie interrompue, et fusion (v1.85.2)

Sortie terrain de KARMA, 06/09 : « j'ai plusieurs sorties détectées sur la même sortie car j'ai utilisé d'autres
applis pour changer de musique ». Trois entrées au carnet pour une seule vraie sortie.

**Le mécanisme** : quitter la PWA la fait décharger par iOS. La sortie, restée `encours`, est régularisée au boot
suivant par le balayage et marquée **`closedBy: "crash"`**. Puis `onPlanLoaded` ouvrait **systématiquement** une
sortie neuve — aucune reprise n'existait.

**🩸 Le signal de reprise est `closedBy: "crash"`, pas un délai.** Ce marqueur ne se pose que lorsque l'app a été
tuée *sous* l'utilisateur. Se fier au délai seul recollerait une sortie qu'il vient de clôturer à la main (🏁) :
son geste serait annulé sans un mot. La fenêtre de 45 min n'est qu'une borne de bon sens par-dessus — l'écart réel
est de quelques secondes, le dernier flush datant de moins de 30 s.

**🔀 Changement de plan = SUSPENSION (28/09/2026, KARMA 1:a 2:b 3:a).** « Durant ma sortie je vais sur un autre
plan pour le montrer ; quand je reviens dans la carrière, la sortie ne reprend pas. » `onPlanUnload` finalisait
(`closedBy: "auto"`, jamais recollée — et SUPPRIMÉE sous les seuils). Il appelle désormais `_suspendre()` :
`status: "suspendue"` + `suspendueLe`, écrite telle quelle, **sans** filtre de pertinence ni affinage réseau.
`_candidateReprise` reprend une suspendue de **son** plan sous **`SUSPENSION_MS` = 2 h** (délai distinct des 45 min
du crash) ; `_reprendre()` est partagée entre les deux cas. `_expirerSuspendues()` (à chaque ouverture de plan +
au boot) finalise les suspendues périmées : gardées (`closedBy: "auto"`) si pertinentes, jetées sinon — sans
affinage, la timeline de leur plan n'étant plus en mémoire (même limite que le balayage des sorties tuées).

🩸 **Une suspendue PAR PLAN, pas une seule en tout.** Chaque plan ouvre sa propre session : « une seule
suspendue » aurait fait, au retour de B vers A, suspendre B et FINALISER A — l'inverse du but. Carnet décoché :
`onPlanLoaded` n'ouvre toujours rien, mais reprend une sortie manuelle suspendue. ⚠️ Le **suivi** n'est pas
repris : `initTracking()` remet `tracking = false` à chaque chargement de plan. À la reprise d'une sortie
**terrain** suivi arrêté, `_reprendre` propose « ▶️ Relancer le suivi » (`ktaConfirm` → `window.ktaDemarrerSuivi`,
le chemin de la tuile ▶️ : avertissement + permission capteurs). Jamais de relance automatique : sur iOS la
permission exige un geste. Filet :
`check-journal-reprise.js` §3 rejoue A → B → A sur le module entier (faux IndexedDB, horloge pilotée).

**🩸 La baseline est RECONSTRUITE, jamais repartie de zéro.** Les compteurs d'une sortie sont des **différences**
(`compte − baseline`) recalculées à chaque `_snapshot`, pas des accumulations : une baseline neuve remettrait tout
à zéro et la reprise n'aurait que l'apparence de fonctionner. Mais la session est restaurée à l'identique au
reboot, donc :

```
baseline = compte_actuel − déjà_en_banque
```

redonne **exactement** la baseline d'origine sans l'avoir stockée. Et si la session n'a PAS été restaurée à
l'identique (l'utilisateur l'a effacée entre-temps), les gardes de ré-ancrage déjà présentes dans `_snapshot`
empêchent les compteurs de partir en négatif.

**🩸 La course.** La recherche d'un candidat est **asynchrone** (lecture IDB), la création de sortie est
**synchrone**. Première rédaction : la tentative était placée avant, avec une garde « si `_cur` existe, on
abandonne » — qui annulait la reprise **à tous les coups**, puisque la création synchrone posait `_cur` en
premier. Mort-né, et vert au harnais si on n'avait testé que la règle de recherche. La sortie neuve est donc créée
normalement, son id retenu, et **remplacée seulement si c'est toujours elle** : sans cette garde, une reprise
arrivée en retard écraserait une sortie déjà repartie (changement de plan rapide). Elle n'a jamais touché IDB
(premier flush à 30 s) : rien à nettoyer derrière elle.

### 🔗 Fusion manuelle

La reprise **empêche** le problème ; elle ne répare pas ce qui est déjà haché. `Journal.fusionner(ids)` recolle N
sorties : durées, distances, pas et ajouts sommés ; notes empilées ; photos, tracés (retriés par temps) et niveaux
réunis ; terrain domine sur bureau.

**🩸 `wallMs` n'est PAS une somme** : c'est la durée du début de la première à la fin de la dernière, **trous
compris**. La sommer donnerait une sortie plus courte que le temps qu'elle a réellement duré.

**La plus ancienne sert de socle et garde son id** (une fiche ouverte, des références et l'ordre du carnet restent
valides), et le résultat est **écrit avant** que les autres soient supprimées — l'inverse perdrait tout si
l'écriture échouait. C'est le seul geste destructif d'une archive conçue *append-only*, donc il est confirmé.

**Garde-fou** : `scripts/check-journal-reprise.js` — la règle de reprise est extraite du module et éprouvée sur
huit cas avec un `list()` bouchonné. **7 sabotages** rougissent.

---

## 📌 Repositionner un POI de session (v1.85.0)

KARMA, 05/09/2026 : « pour un POI modifiable de session, un bouton *repositionner* peut servir, si le POI a été mal mis ».

La fiche d'un point savait déjà changer son **nom**, son **tag**, sa description et ses photos. Sa **position**, non — seul
le Tableau permettait de retoucher X/Y, en aveugle, hors carte. `window.repositionnerPointEditor(id, x, y)`
(`js/editor.js`) comble ce trou : la popup se ferme, un floater s'affiche, le prochain clic sur la carte déplace le point.

### 🩸 Pourquoi `.kta-iti-floater` et pas un floater maison

C'est le **septième** picker « clic carte » du code (Géoréf, départ tracker, itinéraire, évitement, KMZ, Mode perdu…), et
la classe n'est **pas cosmétique** : `window._modeClicCarteActif()` (`js/utils.js`) la reconnaît, ce qui donne deux
comportements gratuitement, tous deux issus de bugs déjà payés en v1.28.0 :

1. **aucune popup d'annotation ne s'ouvre** pendant le mode (`map.on("popupopen")` la referme) — sinon viser un point
   proche ouvrirait sa popup au lieu de consommer le clic ;
2. **le clic est ré-émis en phase capture** sur le conteneur (`js/map.js`) — sinon un clic sur un marqueur, un tracé ou
   une zone serait mangé par ce layer et « ne prendrait pas ».

Renommer cette classe casserait le mode **en silence**. Le garde-fou l'assure.

### ⚖️ Glisser-déposer écarté

`draggable: true` sur le marqueur donnerait un seul geste, mais un `touchmove` démarré sur un marqueur devient un **drag
au lieu d'un pan** : des POI déplacés par accident en manipulant la carte, symptôme silencieux sur une app terrain. Et le
doigt cache la cible pendant le geste, alors qu'on repositionne justement pour gagner en précision. Le picker laisse
zoomer et déplacer la carte le mode armé, puis viser.

### 🩸 Les trois pièges

| Piège | Ce qui casserait | La règle |
|---|---|---|
| **Conversion inverse** | `convertCoord(x,y) = [imageHeight - y, x]` ; inverser lat/lng ou oublier le `imageHeight -` déplace le point ailleurs que sous le doigt — et le marqueur se re-rend là, donc ça a l'air volontaire | `x = latlng.lng` · `y = imageHeight - latlng.lat` |
| **Index périmé** | Entre l'armement et le clic, la session peut changer (suppression, effacement, rechargement) : un index figé déplacerait le **mauvais** point | le point est **re-cherché** au clic via `_indexPointSession()` |
| **Reconstruction** | Rebâtir l'objet lui ferait perdre `_srcCalque` (→ doublon à la restauration du calque, cf. §Rapatrier) et son `level` (→ étage changé en douce sur un plan multi-niveau) | mutation **en place** de `pt.x` / `pt.y`, rien d'autre |

### 🩸 Le picker COUPE les autres modes — `_modeClicCarteActif()` ne suffit pas

Retour KARMA du 05/09 : en **mode ajout de point**, un clic repositionnait le point **et** ouvrait la fiche d'un point
tout neuf. Le même clic était consommé deux fois. Deux raisons distinctes, et aucune n'est un défaut de la garde :

1. `_modeClicCarteActif()` **exclut volontairement** `window.modeEdition` — son propre commentaire le dit : « y ajouter
   un point peut ouvrir une popup de nommage légitime qu'il ne faut pas fermer » ;
2. même quand la garde rend `true`, elle n'empêche que les **popups d'annotation**. `modeRoad` / `modeZone` /
   `modeStructure` posent quand même leur sommet, `modeMesure` son jalon.

Le picker coupe donc les modes lui-même, comme les six autres pickers (`_desactiverTousLesModes()` est appelé par la
Géoréf, l'itinéraire, l'évitement, le KMZ…). Même remède qu'à la **v1.57.2** (« le bouton ajouter point est actif quand
j'ouvre le plan ») : **le registre d'abord** — lui seul retire la surbrillance du bouton, sinon la sidebar mentirait —,
**puis les six drapeaux en filet**, pour un mode jamais enregistré ou un état incohérent.

### 🌀 Les liaisons inter-plan sont RECALÉES, pas purgées

`InterPlanLinks` indexe un côté de liaison par `id:<id>` quand le point a un id — un point de session en a toujours un
(`id === nom`). La liaison **survit** donc au déplacement. Mais le lien **stocke aussi** `side.x` / `side.y`, et ces
coordonnées servent au tracé du lien à l'export KMZ (`planToGps(t, link.a.x, link.a.y)`) : sans recalage, le lien
partirait de l'**ancienne** position dans le KMZ, sans un mot. D'où `InterPlanLinks.onPointMoved(planId, point, ancX,
ancY)`, qui met à jour les deux champs. ⚠️ Il **recale**, il ne filtre pas : purger comme `onPointDeleted` détruirait une
liaison à chaque déplacement.

### 🧹 Effet de bord réglé au passage

`modifierPointEditor`, `supprimerPointEditor` et le picker portaient chacun la même boucle « match exact `id`+coords,
repli sur les coords seules » — trois copies. Extraite en `_indexPointSession(id, x, y)`.

### Portée

Le bouton vit dans `editRow` (`js/utils.js > buildPointPopupHtml`), gouverné par `showSessionActions` : il n'apparaît que
sur les points de **session** — donc aussi sur les POI d'un calque ouvert à la modification, qui en sont devenus. Un point
de calque non rapatrié reste en lecture seule. Le déplacement est enregistré dans l'historique (`editorPoints`), donc
annulable par `Ctrl+Z`.

**Garde-fou** : `scripts/check-repositionner.js` (pré-commit bloquant) — `js/editor.js` chargé dans un `vm`, conversion
inverse refaite dans les deux sens, index périmé éprouvé sur **trois** index distincts, mutation en place, recalage des
liaisons, démontage, ré-armement, annulation, et le repli sans géoréf ni dépendances. **7 sabotages de référence**
rougissent — dont deux ont révélé que le test initial était faux : lat et lng valaient la même valeur (les inverser ne
cassait rien) et le point visé retombait justement en index 0 (une tautologie).
