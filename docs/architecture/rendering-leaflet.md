# Architecture MyKTAMap — Rendu Leaflet, icônes, calques, splash

> Référence détaillée extraite de l'ancien CLAUDE.md. Lue à la demande (pas auto-chargée).
> Sections : §1, §2, §4, §6, §19, §37, §38

---

### 0. 🎨 Styles des types — source de vérité UNIQUE (v1.76.0)

**`js/styleResolver.js` est le SEUL endroit où vivent les styles des types built-in** (tracés `principal/secondaire/chemin/jonction/itinerary`, zones `eau/remblais/effondrement/inaccessible/pente`, structures `pilier-1/pilier-2/mur/mur-ligne/front-1/front-2/arc`). Avant lui : ~25 tables recopiées sur 12 fichiers — c'est ainsi qu'une zone `inaccessible` de calque sortait en gris remblais dans l'export PNG (entrée oubliée + repli silencieux, même défaut que `jonction` en v1.7.1).

**API** (globales `window.*`) :
- `ktaResolveStyle(cat, clé[, {flat:true}])` → objet **NEUF** | `null` (l'appelant garde son repli). Résout aussi les customs `cust-*` via `LegendCustomization` (gabarit par catégorie/géométrie) et applique l'**override de couleur** utilisateur (`LegendCustomization.getColor`, cascade session > plan). Sans `opts` = style de la carte : `inaccessible` reçoit ses hachures en `CanvasPattern` (`_motifCanvas`, construit une fois, couleurs dans `CANON.zones.inaccessible._motif`), sur le canvas commun des vecteurs — l'ordre d'empilement zones < structures tient (`structures.js > ktaStructuresAuDessus`). `{flat:true}` = contexte qui ne peint pas de motif (canvas d'export, KMZ, fond OSM, pastilles) → `inaccessible` retombe sur son aplat `_flatFill` ; pas de canvas (Node) → aplat aussi. Une couleur choisie par l'utilisateur remplace le motif par un aplat.
- `ktaSwatchColor(cat, clé)` → LA couleur représentative (polygone = remplissage, ligne = trait) — pastilles, barres de stats, camemberts, rapport.
- `ktaTypeSwatchHtml(cat, clé, repliEmoji)` → pastille HTML (les émojis 🟩🟥🟡 sont des glyphes à couleur figée — sidebar + reflets de mode).
- `ktaLabelAvecPastille(cat, clé, label)` → remplace l'émoji de TÊTE d'un libellé i18n par la pastille (formulaires d'export) ; un type rayé (`arc`) n'a pas d'émoji dans son libellé, sa pastille est toujours posée devant.

**Trait rayé (arc de soutènement)** : `CANON.structures.arc` = trait bleu du mur (`#1e3a8a`), poids 6 (le mur en ligne
10), et `rayures: { color: "#cc0000" }` (contour de la zone effondrement), gardées en `flat` aussi. Carte :
`structures.js > ktaPolylineStructure(latlngs, style, opts)` rend une polyligne à UNE couche qui, après son trait,
repeint le même chemin en segments (`ktaPeindreRayures` : tirets de 0,8 × l'épaisseur, vides de 1,4 ×, 3 px au
moins chacun, bouts carrés, opacité de la couche) — une 2e couche aurait doublé filtres, registre, ULTRA, ordre des
murs et clic. Canvas seulement (renderer SVG : trait uni). Largeur au zoom : `ktaLargeurRayePourRatio` = 0,6 × celle
d'un front, **plancher 2 px** (décision produit : à 1 px les rayures disparaissent ; au dézoom l'arc peut paraître
plus épais que le mur en ligne) ; `majLargeurFronts` reconnaît la couche à `options.ktaRayures`.
**Arc au-dessus des tracés** (décision produit, posé en travers) : `ktaArcsAuDessus(liste, estArc)` met les arcs en
queue de la liste du renderer à chaque passe de `ktaOrdonnerMursCarte` (couche rayée et sa zone de clic, marquée
`ktaArcDessus`) ; tant qu'un arc est sur la carte, tout ajout de vecteur sur le canvas commun (tracés redessinés,
filtre, niveau, routes rendues par ULTRA au glissé) prévoit une passe. Rien d'autre ne bouge. Exports PNG / PDF : la
même fonction sur leur file (`_arcsDessus`), donc arcs peints après les routes ; KMZ, Vue OSM, mini-carte
d'urgence : trait bleu seul, ordre inchangé. Pastilles : dégradé répété bleu / rouge
(`ktaTypeSwatchHtml`, légende, export) ; `ktaSwatchColor` rend le bleu.
Contrastes WCAG mesurés (objet graphique, seuil 3:1) : bleu `#1e3a8a` 10,36 sur blanc, 8,65 sur crème `#f2ead8`,
8,50 sur le fond clair `#f0e8d8`, mais 2,03 sur noir et 1,87 sur le fond sombre `#0a0d18` ; rouge `#cc0000` 5,89 /
4,92 / 4,83 / 3,57 / 3,29 : sur fond sombre ce sont les rayures qui gardent l'arc visible.

**Règles** :
- ❌ **Jamais de table de couleurs locale** — `scripts/check-style-canon.js` (pré-commit BLOQUANT) refuse toute réintroduction. Exceptions assumées, listées dans le script : `emergencyMode.js` (palette vive dédiée), `osmView.js`/`osmHomePreview.js` (`inaccessible` en aplat orange sur OSM).
- ⚠️ Le **KML garde SES largeurs/alphas** (`width` KML ≠ `weight` Leaflet, ajustés à l'échelle GPS) — seules les couleurs viennent du canon. Figé par `scripts/check-kml-styles.js`.
- Toute **mutation qui change un rendu** (setColor, resetSession, remove/updateCustomEntry) doit repeindre : `renderRoads/Zones/Structures` + `_ktaRestyleDataLayers` (calques de données — couleurs seules, les opacités restent au filtre multi-niveau). Vérifié par `check-api-surface.js`.
- Chargé tôt dans `index.html` (avant `utils.js`) ; aucune dépendance au chargement (LegendCustomization interrogé à l'appel).

### 0.1 🧱 Ordre de dessin des structures — un mur sous les piliers et fronts de son niveau (décision produit)

**Règle** : un mur (`mur` polygone, `mur-ligne` trait) est toujours dessiné **sous** les piliers (`pilier-1/2`) et fronts
(`front-1/2`) de **son** niveau, qu'il vienne de la session ou d'un calque, quel que soit l'ordre de chargement des
calques. Hors multi-niveau, tout est un seul niveau. Un **type personnalisé** n'a pas de rôle (sa légende ne dit pas
qu'il est un mur) : il garde sa place. Un mur d'un **autre** niveau n'est pas concerné (l'ordre reste celui d'arrivée).

**Mécanisme** (`js/structures.js`) :
- `ktaMursSousPiliers(liste, structDe[, parNiveau])` : fonction pure sur une liste de dessin (arrière → avant). Un mur
  placé APRÈS le premier pilier/front de son niveau passe **juste avant** lui ; rien d'autre ne bouge. Rend la même
  liste si rien ne change. Partagée par la carte et tous les exports.
- **Carte** : la carte est en canvas, un **seul** renderer (`map._renderer`, `map.js`) ; l'ordre de dessin est sa liste
  chaînée (`_drawFirst` … `_drawLast`), où chaque ajout va au bout. Les couches de structure (session :
  `renderStructures` ; calques : `utils.js > ajouterPointsDepuisJSON`) portent `options.ktaStructType` /
  `ktaStructNiveau`, posés **à la création** ; `layeradd` (branché par `brancherLargeurFronts`, drapeau sur la map)
  prévoit une passe `ktaOrdonnerMursCarte` en micro-tâche (après les ajouts synchrones, avant le prochain dessin), qui
  relie la liste dans le nouvel ordre et repeint tout le canvas. Couvre le 1er rendu, chaque re-rendu de session et la
  bascule d'un calque (ses couches repartent au bout).
- **Aucun pane créé** : tout reste dans l'`overlayPane`, donc sous le pane de rotation du mode « plan orienté ».
- **Place par rapport aux autres familles** : le minimum. Un mur qui doit descendre se pose juste sous le premier
  pilier/front de son niveau ; s'il y avait entre les deux des zones ou des tracés (ceux d'un calque chargé entre-temps),
  le mur passe aussi sous eux. Les murs déjà en place (cas courant : session seule, ou un seul calque, déjà triés
  `mur < mur-ligne < pilier-2 < pilier-1 < front-2 < front-1 < arc`, l'arc passant ensuite au-dessus des tracés,
  ci-dessus) ne bougent pas. Zones, tracés, piliers et fronts ne
  bougent jamais ; l'itinéraire (renderer à part) et les marqueurs (DOM) ne sont pas touchés.
- Largeurs au zoom (`majLargeurFronts`, mutation de `options.weight`) et filtre de niveau (opacité des couches de
  calque, re-rendu de session) ne changent pas l'ordre : ils marchent comme avant.
- **Vue OSM** (`osmView.js > _renderStructures`) et **aperçu OSM de l'accueil** (`osmHomePreview.js`, structures de
  tous les calques d'un plan rassemblées, toujours par niveau) appliquent la même fonction. Exports : `exports.md` §45.
- Preuve : `scripts/smoke/checkup-mur-dessous.js` (index de dessin + pixel au croisement, carte et exports).

---

### 1. Cycle de vie d'un plan

```
F5 → splash visible (HTML statique + js/ktaSplash.js : version, plafond 12 s)
   ↓
initApp() dans main.js
   ├─ _splashStart() (version affichée, rappels de fin)
   ├─ gates éventuelles : _splashAvantGate() (fin d'animation, splash dessous)
   ├─ PlanRegistry.init()
   ├─ decouvrirPlansServeur() ← lit data/index.json
   ├─ Si registre vide ET data/plan-config.json existe :
   │   └─ chargement auto (rétro-compat) → _splashEnd(lancerApplication())
   └─ Sinon → afficherLoader() (home avec liste) → _splashEnd()
```

L'ouverture d'un plan attend **une image** à deux endroits : `lancerApplication()` avant `initMapFromConfig()` (le
message « mapInit » s'affiche d'abord) et `initMapFromConfig()` après `cleanupExistingMap()` (aucune image de
collision : `plan.collisionImage` est ignoré, cf `data-formats.md`). 🩸 Onglet en arrière-plan ou
navigateur sans écran : `requestAnimationFrame`
peut ne jamais venir (ouverture figée sur « Chargement en cours… ») ; ces attentes passent donc toutes par
`utils.js > ktaAttendreImage()` : un minuteur de 1 s prend le relais, le premier des deux reprend seul (pas de double
exécution). Jamais de `requestAnimationFrame` nu sur ce chemin.

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

1. PNG 128×128 transparent → `icon/fontaine.png` (même gabarit que le jeu existant : badge rond ou carré, barre
   rouge pour une variante « fermé »)
2. `map.js > TAGS_BUILTIN` : ajouter `fontaine: "icon/fontaine.png"`
3. `editor.js > EDITOR_TAG_LABELS` : ajouter `fontaine: "Fontaine"`
4. `interfaceLegende.js > LEGENDE_LABELS` + groupe approprié dans `GROUPES`
5. `exporter.js > GROUPES_ICONES` : le groupe (libellés par `LegendCustomization`)
6. `createConf.js > PLANNER_DEFAULT_ICONS` : ajouter le chemin
7. `sw.js > ASSETS_TO_CACHE` : ajouter `"./icon/fontaine.png"`
8. `legendCustomization.js > DEFAULT_LABELS.icones` + clés `editor.tag.*`, `legend.label.icones.*`,
   `legendui.label.*` dans les 3 dicos `lang/`

Checklist complète : skill `add-icon-tag` ; `scripts/check-icon-catalog.js` (pré-commit) confronte ces tables.

→ Le tag est utilisable sur les **plans existants** sans modifier leurs `plan-config.json`.

→ **Passages entre niveaux** (`jes`, `jpe`, `jps`) : groupe de légende et d'export à part (« ↕️ Passages entre
niveaux »), icônes à badge magenta (couleur des jonctions) avec deux planchers et une double flèche, pour ne jamais
les confondre avec les accès de surface `eso` / `peo` / `ps`. Un tel POI s'affiche sur **chacun** de ses niveaux
(`marker._ktaNiveaux`) et dessine ses raccords seulement fiche ouverte (`multilevel-pathfinding.md` §26.11).

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

État actuel : `ui.md` §41.15.5 (rendu, version longue à chaque ouverture, réduite, fermeture quand l'accueil est
affiché, passage au clic, plafond). En bref : HTML statique visible avant tout JS, `js/ktaSplash.js` juste après,
fermeture par `main.js > _splashEnd(pret)` ; une seule fois par session (un changement de plan ne le ré-affiche
pas). Le splash n'affiche jamais « -pro » : le suffixe et sa révélation vivent dans l'en-tête de l'accueil
(`.loader-titre-nom`, pièges de spécificité : `security-legal.md §84`).

---

### 19. Calque « Annotations du plan » (`editor`)

Le calque `editor` regroupe la **session du plan** — sur une installation partagée, les objets de toute l'équipe, pas seulement les siens (d'où le nom, jamais « Mes … ») :
- ✏️ Points ajoutés via l'éditeur
- ⬛ Zones de session (Eau/Remblais/Effondrement)
- 🛣️ Roads de session (Principal/Secondaire/Chemin)
- ⭕ Cercles d'intersection des roads (⚠️ contrat : `road.js > _renderIntersections` mémorise la liste dessinée,
  `[{ point, color, level }]`, vide quand l'option du plan est coupée ; `window.getRoadIntersections()` en rend une
  copie et `kta:intersectionsChange` part quand elle change. Lue par la vue 3D, qui ne recalcule rien)

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

**Libellé** : `map.js > window.ktaLibelleCalque(lc)`, seule source pour la légende Leaflet, le panneau de filtres, l'export image et l'export PDF. Pour `editor`, toujours la clé traduite `filter.dataLayer.editor` : le libellé que le Générateur grave dans le plan-config (langue de l'auteur, « Mes annotations » ou « Ajouts » sur les anciens plans) est ignoré, aucun écran ne permet de le changer.

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

CSS variable `--kta-marker-scale` sur `<body>` mise à jour dans `initMapFromConfig` sur `zoom` et `zoomend` :
`window.ktaEchelleMarqueurs(2^zoom)` (map.js, plancher par défaut ×0,25). Loi partagée avec les cartes OSM (Vue OSM,
carte de l'accueil), qui posent la variable sur leur conteneur ou le pane du plan et passent leur propre plancher
(×0,5, `KTA_ECHELLE_PLANCHER_OSM`) : `vue-osm.md` §11.

CSS : `.kta-marker-img { transform: scale(var(--kta-marker-scale, 1)); transform-origin: center; }`.

#### 37.2 Clamp 0.25 / 2 (mode plan)

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
- **Icône par défaut** (point sans tag ou au tag inconnu) : `icon/default.png` (`window._ktaIconeDefaut`, `map.js`), centrée et scalée comme les autres. Un `icons.default` qui vise l'ancien pin Leaflet (`lib/leaflet/images/marker-icon.png`, écrit par les Générateurs d'avant) est ignoré : l'icône de l'app reprend la main. Le pin natif `L.Icon.Default` ne reste qu'en filet ultime, avant que la carte ait construit ses icônes.
- **Exports PNG / KMZ** : continuent de produire des images taille originale. Les transform CSS n'affectent que le rendu Leaflet runtime, pas les exports canvas qui peignent les icônes à leur taille brute.

#### 37.5 Prise en compte d'un changement du réglage

En mode plan, `scaledMarkers` est lu UNE FOIS dans `creerIcones` au load du plan. Le réglage vit dans ⚙️ Configuration de l'accueil → 🎨 Affichage (réglage global) : il prend effet au prochain chargement de plan. Les cartes OSM ouvertes, elles, re-rendent leurs POI à la bascule (`vue-osm.md` §11).

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
- Règle unique `tiling.js > ktaPlanDeBaseVisible` (lue aussi par la case de ≡ Filtres) : `_ktaRuntimeFilters.planDeBase` vaut `true` / `false` → choix de l'utilisateur, qui l'emporte sur les niveaux ; `null` (défaut) → automatique : visible ssi `multiLevel !== true` OU `visibleLevels` contient 0. Case « 🖼️ Afficher le plan de base », toujours présente en tête de « Calques image », et en double dans la section Niveaux d'un plan multi-niveau (`filterPanel.js > _majCasePlanDeBase` recale les deux après chaque changement) ; cochée = fond réellement affiché, même en automatique. « Tout afficher » remet `null`. Persistée dans `runtimeFilters` de la session du plan (ancien `garderFond: true` relu comme `true`), remise à `null` avant toute restauration (`sessionPersist.js > onPlanLoaded`) pour qu'un plan sans session ne s'ouvre pas sans fond. Pastille ≡ : un fond masqué à la main compte comme un filtre actif ; masqué en automatique, il est déjà compté par les niveaux. Masquage NET (2:a). Les exports ne lisent pas cet état : ils ont leur propre choix de fond (`exporter.js`).
- Couvre les 3 modes de rendu du base : **direct** (`window._ktaBaseLayers` — nouveau registre, les 2 sites `L.imageOverlay(url, bounds).addTo(map)` ne gardaient AUCUNE référence) · **tuiles runtime V1** (`window._baseTiles`) · **tuiles V2** (`_tilingV2State.activeOverlays` + garde `window._ktaBaseHidden` dans `_renderNiveau` — les tuiles d'un swap de zoom restent hors map mais TRACÉES dans activeOverlays pour le ré-affichage).
- ⚠️ Tout NOUVEAU chemin de rendu du plan principal doit s'enregistrer dans un de ces 3 conteneurs, sinon il échappera au filtre.

**B — Garde-fou transparence au générateur** (`createConf.js`, warning NON-bloquant 3:a) : chaque calque de niveau ≠ 0 est vérifié par CONTENU via `ktaDetecterAlpha` (v1.62.0) — JPEG = opaque d'office, PNG/WebP scannés. Opaque → toast + statut `gen.warn.layerOpaque`. Niveau 0 exclu (une légende opaque est légitime).

**À NE PAS faire** :
- ❌ Ré-encoder les calques image à l'embed (le verbatim EST la garantie d'alpha — cf le contre-exemple historique du tuilage V2 pré-v1.62).
- ❌ Masquer le base par `opacity: 0` (le GPU garde les bitmaps décodées) — `removeLayer` net.
- ❌ Bloquer la génération sur un calque opaque (3:a : l'user peut avoir une raison — on informe, on ne bloque pas).
