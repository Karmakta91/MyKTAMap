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
