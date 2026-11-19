# Architecture MyKTAMap — Multi-niveau, pathfinding, itinéraire

> Référence détaillée extraite de l'ancien CLAUDE.md. Lue à la demande (pas auto-chargée).
> Sections : §14, §15, §26, §31

---

### 14. Itinéraire / Pathfinding (`pathfinder.js` + `interface.js`, depuis 09/05/2026)

Calcul d'un trajet le plus court entre N waypoints en suivant le réseau de polylines existantes (session `getRoads()` + calques `getEmbeddedRoads()`).

**Algorithme** (`js/pathfinder.js`, module IIFE) :
1. **Construction du graphe** (`_buildGraph`) — chaque point d'une polyline = nœud, connecté à son voisin par une arête euclidienne. Spatial-bucketing 1.5 px pour fusionner les points coïncidents.
2. **Enrichissement** (`_enrichirGrapheAvecCroisements`) — gère 3 cas de jonction entre polylines distinctes :
   - Croisement strict segment-segment (intersection paramétrique)
   - T-junction (**bout de tracé** à < 15 px de l'intérieur d'un segment d'un autre tracé, projection orthogonale)
   - Bout↔sommet (**bout de tracé** à 1.5 < d < 15 px d'un sommet quelconque d'un autre tracé, bout ou sommet intérieur)
   - Intérieur↔intérieur (deux sommets intérieurs de deux tracés **différents** à 1.5 < d ≤ 3 px, `PROXIMITE_INTERIEURS_PX`)
   → ajout de nœuds virtuels et arêtes ad-hoc. Sans ça, les roads tracés à la main qui se croisent sans partager de point exact restent dans des composantes graphe disjointes.
   Les nœuds posés à l'intérieur d'un même segment d'origine (croisements, pieds de T) sont ensuite **chaînés de proche en proche** dans l'ordre du segment (étape 4) : reliés seulement aux deux extrémités du segment, ils obligeaient l'itinéraire à repasser par l'une d'elles pour aller d'un croisement au suivant (aller-retour, distance gonflée : 800 px au lieu de 600 sur le cas de `check-guidage.js` §15).

   ⚠️ **La tolérance de 15 px (`PROXIMITY_TOLERANCE`) ne vaut que pour les BOUTS LIBRES** (décision produit) : 1er ou dernier sommet d'un tracé (`graph.bouts`, posés par `_buildGraph`) qui ne touche encore **aucun autre tracé** (`_boutsLibres`, lu après les croisements stricts). Un bout est raccordé si son nœud est partagé par un autre tracé (`graph.traces[idx]` : fusion à 1,5 px, sommet commun, bout de jonction), s'il a une arête vers le nœud d'un autre tracé (croisement exact posé sur lui) ou s'il porte le raccord validé d'un POI entre niveaux (à ≤ 1,5 px, même niveau). Un bout raccordé ne reçoit aucun lien de tolérance : il est traité comme un sommet intérieur. 🩸 Sans cette condition, une branche finie en T sur une galerie se reliait EN PLUS à la galerie parallèle de l'autre côté (à 4 m) : l'itinéraire partait de ce bout en diagonale à travers le mur. Un bout libre, enfin, ne garde que ses candidats **les plus proches** (`MARGE_PLUS_PROCHE_PX` = 3 px au-delà du plus proche, sur un autre tracé) : les liens des étapes T et bout↔sommet sont proposés, puis posés dans le même ordre. Le dessin n'aimante que sur un sommet, jamais sur un segment : une branche finie à la main à 1 m d'une galerie reste un bout libre, et sans ce filtre elle se reliait aussi à la galerie parallèle à 4 m derrière. Un bout dans un coin, à quelques px de deux galeries, garde les deux. Un raté de connexion vient toujours d'un bout resté en l'air. Un sommet intérieur ne se raccroche par proximité qu'à un sommet intérieur d'un autre tracé à ≤ 3 px (`PROXIMITE_INTERIEURS_PX`, carrefour dessiné en deux « L » qui se touchent sans se croiser), en plus du croisement strict et de la fusion à 1,5 px (`SPATIAL_MERGE_THRESHOLD`, seuil à part qui confond les nœuds). 🩸 Appliquée à tous les sommets, la tolérance de 15 px reliait deux galeries parallèles plus proches qu'elle (6 m sur un plan à 2,5 px/m) : l'itinéraire traversait le mur qui les sépare. Mesuré sur un relevé réel : 5 008 liens → 2 055, dont 12 intérieur↔intérieur, raccourcis suspects (lien ≥ 0,6 m entre deux tracés, qui évite un détour de plus de 15 m) 82 → 26 ; sur un autre relevé réel, 33 → 42 morceaux de réseau et 88 % → 70 % des nœuds dans le principal, dont de vrais carrefours dessinés avec deux sommets intérieurs écartés de 1,7 à 5 m. La distance seule ne sépare pas un carrefour d'un mur : ces écarts sont rendus à l'auteur par **🔗 Raccords à vérifier** (ci-dessous). ⚠️ `PROXIMITE_INTERIEURS_PX` reste sous l'écart de deux galeries parallèles. Le recalage des points de jonction entre niveaux (`_insererSurNiveau`) garde ses 15 px, à part. Tenu par `check-guidage.js` §15 et `scripts/smoke/checkup-raccords.js`.

   **🔗 Raccords à vérifier** (`js/raccordsTraces.js`, Éditeur de données, UI : `ui.md` §91.5) — liste les écarts que la règle stricte ne relie pas et qui rejoindraient deux **morceaux** du réseau aujourd'hui séparés. Morceaux = composantes connexes du graphe de l'itinéraire, construit par `Pathfinder.grapheDeTraces(roads)` (types par défaut principal / secondaire / chemin, jonctions et passages POI compris, **sans** obstacle) sur la liste de `Pathfinder.collecterTraces()` ; `graph.noeudsTrace[r][k]` donne le nœud de chaque sommet. Candidat = un sommet d'un tracé et le point le plus proche (projection sur un segment) d'un autre tracé du **même niveau**, d'un autre morceau, de **1,5 px** (seuil de fusion : un écart plus court est déjà le même nœud) **à 6 m** (`APP_CONFIG.scale` ; plan sans échelle : 15 px). Un seul par paire de morceaux : le plus court ; à 1 px près, un sommet libre l'emporte sur un sommet déjà raccordé (partagé avec un autre tracé, ou bout raccordé : `graph.boutsLibres`), puis un bout libre, puis le sommet du plus petit morceau — déplacer un sommet raccordé décrocherait l'autre tracé, qui garde son sommet à l'ancienne place. **Raccorder** colle ce sommet sur ce point, inséré comme sommet de l'autre tracé s'il n'en est pas un (à ≤ 1,5 px d'un sommet existant, c'est lui) : les deux tracés partagent alors un sommet exact, fusionné par `_buildGraph`. Un tracé de calque passe d'abord en session (« 🔄 Modifier », `FilterPanel.rapatrierCalque`, même pesée et même question). Une entrée ⏪ (`HistoryManager`, catégorie `roads`), `kta:donneesPlanChange` par le rendu. **Ignorer** retient la clé de l'écart (niveau + extrémités arrondies au dixième de px) dans la pref du plan `raccordsIgnores` (`config.js > get/setPlanRaccordsIgnores`) ; une paire dont un candidat est ignoré ne revient plus, tant que la géométrie de l'endroit ne change pas.
3. **Snap des waypoints** (`_insertVirtualNode`) — projection orthogonale du waypoint sur le segment le plus proche, insertion d'un nœud virtuel à la projection (split du segment d'origine).
4. **Dijkstra** entre paires consécutives, concaténation des chemins.

> ⚡ **Performance (29/09/2026)** : l’enrichissement comparait chaque segment à tous les autres (3 passes O(S²)) et Dijkstra balayait tous les nœuds à chaque extraction (O(V²)). Mesuré sur un relevé réel de 912 tracés / ~9 000 sommets : **~45 s par itinéraire** (et autant pour la zone atteignable du Mode Perdu, et pour `buildNetworkGraph` de la navigation intelligente). Désormais : **grille spatiale** de 64 px (`_grilleSegments` / `_candidatsGrille`, bbox élargie de `PROXIMITY_TOLERANCE` pour les T-junctions ; grille 3×3 pour les extrémités) et **tas binaire** (`_tasPousser` / `_tasExtraire`) dans `_dijkstra` et `_dijkstraReachable` → **~0,3 s**. 🩸 **Résultat identique au bit près, pas « équivalent »** : les candidats de la grille sont triés par indice avant traitement (mêmes nœuds virtuels, mêmes indices, même ordre), et le tas est ordonné sur (distance, indice) — exactement le départage de l’ancien balayage (plus petite distance, puis plus petit indice). Vérifié hors dépôt sur le relevé réel : graphe enrichi de même empreinte SHA-256 (nœuds + arêtes + segments, multi-niveau on/off), trajets et zones atteignables identiques. Tenu par `check-guidage.js` §12 (quadrillage fictif de ~16 000 segments : croisements, distance exacte, départage des égalités, temps < 3 s).

**API publique** :
- `Pathfinder.computeRoute(waypoints, opts)` → `{ path, totalDistance (px), segmentCount, snappedPoints }`. Throw avec message lisible si waypoints insuffisants, graphe vide, ou pair de waypoints isolée dans une composante.
- `SearchPoints.getAllPoints()` / `findByQuery(q)` (ajoutées dans `searchPoints.js`) — utilisées par la modale itinéraire pour l'autocomplete.

**UI** (modale `kta-itinerary-modal` dans `interface.js`) :
- Entrée : sous-action **🗺️ Calculer un itinéraire** dans le groupe Tracker (cohérent avec ▶️ tracking + 📍 recalage).
- 2 modes selon état :
  - **Calcul** (pas d'itinéraire actif) : input recherche autocomplete + toggle mode clic carte (avec floater compact en bas pour ne pas bloquer la carte) + liste de waypoints avec ✕ par ligne + bouton 🎯 Calculer.
  - **Navigation** (itinéraire actif détecté) : titre "Itinéraire actif", quick-nav `⏮️ Début / ⏭️ Fin / 🔁 Tour complet`, liste des waypoints avec 🎯 (pan + flash style search) et ✕, boutons 🔄 Recalculer / ❌ Effacer.

**Persistance des waypoints** : la road de type `"itinerary"` porte une propriété `waypoints: [{x, y, label, source}, ...]` en plus de `points`. SessionPersist sauve la road comme n'importe quelle autre, donc les waypoints survivent au reload du plan. Au reopen de la modale, on bascule en mode navigation si `road.waypoints` est présent.

**Style du tracé** :
- `road.js > ROAD_STYLES.itinerary` : cyan `#00d4ff`, weight 7, dashArray "12 6", opacity 0.9.
- `renderer: L.svg()` forcé sur la polyline (sinon canvas → pas de filter CSS).
- CSS `.kta-itinerary-polyline` : `filter: drop-shadow(...)` × 2 → effet halo néon cyan.
- Filtré du calcul des cercles d'intersection (`renderRoads`) pour éviter les cercles redondants.

**Label de distance** : `L.control` au coin `bottomleft` (`.kta-iti-distance`, fond `#1a1f2e` + accent cyan), s'affiche dès qu'une road de type `"itinerary"` existe, masqué sinon. Empilé au-dessus du label measure naturellement (Leaflet stack DOM order).

**Helper `_majLabelDistanceItineraire`** exposé sur `window`, appelé après chaque setRoads (save/discard/erase) et après `lancerApplication` pour gérer le restore session.

**Sémantique** : un seul itinéraire actif à la fois. Recalculer remplace le précédent (filter sur `r.type !== "itinerary"`). Effacer le retire. Switch de plan le perd (reset normal de la session).

---

### 15. Distance totale des tracés (`js/interfaceDistanceTotale.js`)

Outil de mesure agrégée : somme des longueurs des tracés Principal / Secondaire / Chemin (et types custom) présents (session `getRoads()` + calques `getAllEmbeddedRoads()` — TOUTES, masquées comprises, sauf un calque en modification, lu par sa copie de session), avec filtrage par type via cases à cocher et surlignage magenta des tronçons inclus.

**⚠️ Depuis v146 (2026-05-14)** : `_rdRoadsExploitables()` utilise `getAllEmbeddedRoads()` (et plus `getEmbeddedRoads()` qui filtrait par visibilité). Cohérence avec Pathfinder + Search : l'utilisateur peut masquer le calque routes (dessinées en dur sur le PNG) pour gagner en perf rendu, tout en gardant un total fiable. Le surlignage magenta est aussi appliqué sur les roads masquées (layer séparé qui se voit indépendamment du calque sous-jacent).

**Niveau compté** (⚠️ contrat, plan multi-niveau) : par défaut le **niveau affiché** seul — celui de la vue 3D
ouverte (`KtaVue3D.niveauVue()`), sinon le niveau actif de la carte (`APP_CONFIG.activeLevel`, la pastille ; pas
`visibleLevels`, qui montre d'ordinaire tous les niveaux). Une ligne du panneau le nomme (« Niveau n affiché »,
« Niveau n de la vue 3D », « Tous les niveaux du plan »). Case **Tous les niveaux** (`#kta-rd-tous`, décochée par
défaut) : pref de plan `distTotTousNiveaux` (`config.js > getPlanDistTotTousNiveaux / setPlanDistTotTousNiveaux`),
tout le plan compté et surligné sur la carte ; en 3D, le ruban au sol (`ktaDistanceTotaleSurlignage`) reste celui
du niveau de la vue et une note du panneau le dit. Plan à un niveau : ni ligne ni case, tout compte. Niveau actif
changé : `interfaceConfig.js > ktaSetActiveLevel` appelle `ktaDistanceTotaleRafraichir` (surlignage, et panneau
s'il est ouvert, recalculés). Sans tracé sur aucun niveau → alerte ; un niveau affiché vide ouvre le panneau à 0.
Parcours : `scripts/smoke/checkup-distance-totale.js` (Chromium et WebKit) et § 40 de `checkup-vue-3d.js`.

**Entrée UI** : sous-action **📏 Distance totale (filtres)** dans le groupe accordéon **📐 Mesure** (`interface.js > _creerGroupeAccordeon({id:"mesure"})`, entre ♦️ Surface et ❌ Effacer). Toggle ON/OFF — re-cliquer ferme la modale.

**Modale plein écran** (`#kta-rd-modal`, shell `.kta-readme-modal-overlay` + `.kta-rd-modal-boite`) — pattern identique aux autres modales du projet (itinéraire, légende, config) :
- Boîte centrée 480px max, `max-height: 90vh`.
- Header : titre "📏 Distance totale des tracés" + ✕.
- Corps :
  - Phrase d'aide (avec mention "magenta" colorée et explication de la persistance après fermeture).
  - 3 lignes checkbox stylées en boîtes (`background: rgba(...,0.03)`, hover magenta) avec swatch coloré + label + compteur live `nb — distM m`.
  - Bloc total mis en avant (fond magenta 6%, bordure 22%), valeur 20px gras `#ff4ecb`.
- Footer actions :
  - `❌ Effacer le surlignage` (`.kta-btn-danger`) — retire le highlight ET ferme.
  - `✓ Fermer (garder le surlignage)` (`.kta-btn-primary`) — ferme uniquement la modale.
- Toggle checkbox → `_rdRedessinerHighlight()` + `_rdRafraichirAffichage()` instantané.

**Sémantique de persistance** :
- ✕ / clic backdrop / ✓ Fermer → ferme la modale, **garde le surlignage actif sur la carte**. L'utilisateur peut explorer la carte avec les tronçons toujours surlignés.
- Re-clic 📏 → rouvre la modale en restaurant les filtres précédents (détecté via `_rdHighlightLayer !== null`). Si pas de surlignage actif, reset à "tous cochés".
- ❌ Effacer → retire le surlignage ET ferme la modale.
- Plan switch → cleanup automatique via `main.js > _libererRessourcesPlanPrecedent()`.

---

### 26. Mode multi-niveau (depuis v148 — 15/05/2026)

Feature opt-in **par plan** pour gérer les carrières/galeries à plusieurs étages (Glacière, Capucins…). Quand désactivé → comportement strictement identique à v147 (rétro-compat absolue).

#### 26.1 Opt-in (cascade de priorité)

```
APP_CONFIG.multiLevel ←
  PlanRegistry[id].multiLevel       (legacy ≤ v1.7.2 — UI Réglages retirée v1.7.3
                                     mais lecture conservée pour rétro-compat)
  ↓ sinon
  PLAN_CONFIG.plan.multiLevel       (depuis plan-config.json — SOURCE UNIQUE
                                     depuis v1.7.3, déclaré via le 📦 Générateur)
  ↓ sinon
  false                              (retro-compat plans v147)
```

**2 voies pour activer** (depuis v1.7.3) :
- Au moment de la création/modification d'un plan via 📦 Générateur → case `🏗️ Plan multi-niveau` → ajoute `plan.multiLevel: true` dans `plan-config.json`
- Édition manuelle de `plan-config.json` (champ `plan.multiLevel: true`)

> ⚠️ Pas de bascule dans ⚙️ Réglages (décision produit) : le multi-niveau se déclare dans le plan (Générateur ou
> `plan-config.json`), jamais à chaud — sinon un plan « non multi-niveau » activé en cours de route repartait à zéro
> au rechargement. `PlanRegistry[id].multiLevel` reste lu : une préférence posée par une ancienne version continue
> de marcher.

#### 26.2 Data model

**APP_CONFIG (runtime)** — défini dans `js/config.js` :
- `multiLevel: boolean` — feature active pour ce plan ?
- `activeLevel: number` — niveau utilisé pour dessiner de nouveaux items (default 0). **Peut être négatif** depuis v154 (sous-sols).
- `visibleLevels: number[]` — filtre d'affichage (multi-select, default `[0]`)
- `availableLevels: number[]` — niveaux disponibles dans le sélecteur (**default `[-2, -1, 0, 1, 2]` depuis v154**, symétrique autour de 0). Extensible via boutons `+` (max+1) et `−` (min−1) dans la modale. Auto-étendu au boot par `window._etendreAvailableLevelsSiBesoin()` si les data layers contiennent des niveaux hors range.

**Données persistées** :
- Roads : `road.level: number` OU `{ type: "jonction", fromLevel, toLevel }`
- Structures : `structure.level: number` (`pilier-2` / `front-2` naissent au niveau −1, la « 2e masse », banc fixe
  sous la 1re, quel que soit le niveau actif : défaut de création seulement, la valeur stockée est le vrai niveau)
- Zones : `zone.level: number` + `zone.niveaux: number[]` facultatif (zone sur plusieurs niveaux, §26.12)
- Editor points : `point.level: number`
- Data layer items : `level: number` optionnel dans le JSON (`puits.json`, etc.)
- Roads embarquées dans data layers : `road.level: number` optionnel
- Zones embarquées dans data layers : `zone.level: number` optionnel, `zone.niveaux` gardé (§26.12)
- **Image layers (depuis v162)** : `plan-config.json > imageLayers[i].level: number` optionnel. Filtré au runtime via `_applyLevelFilterToImageLayers()`. Modale Niveaux = authority → force `addLayer`/`removeLayer` selon `visibleLevels` (override le checkbox Leaflet). Le générateur expose un champ "Niveau" à côté de chaque image layer, visible **uniquement** si la case 🏗️ Plan multi-niveau est cochée.

**Rétro-compat absolue** : si un item n'a PAS de `level`, il est traité comme `level: 0`. Tous les plans v147 et avant fonctionnent identiquement quand le toggle est OFF (jamais de champ `level` ajouté).

#### 26.3 UI

- **Bouton "Niveau actif"** : `L.control({position: "topleft"})` sous les boutons de zoom Leaflet. Pastille jaune avec chiffre du niveau actif. Click → ouvre la modale niveau.
- **Modale niveau** (`#kta-niv-modal`) : 2 sections
  - 🎯 Niveau actif (segmented, single-select) — utilisé pour dessiner. Affichage **trié croissant** (gauche=négatif, droite=positif, comme un axe numérique).
  - 👁️ Niveaux visibles (checkboxes, multi-select) — filtre d'affichage
  - Quick actions : `Tous` / `Actif seul`
  - Même section dans ≡ Filtres (`filterPanel.js > _renderLevelsSection`), plus la case **🖼️ Afficher le plan de base**, jumelle de celle de « Calques image » (suit le 0 par défaut, le choix de l'utilisateur l'emporte ensuite) (règle du fond : `rendering-leaflet.md` §Plan principal = niveau 0). 🩸 Un clic sur « Niveau actif » re-rend la section (`ktaSetActiveLevel` → `onLevelChange`) : tout marquage après coup se fait par valeur de niveau, jamais par le nœud cliqué (détaché). Délégation unique sur `#kta-fp-sec-lvl`, liée à l'ouverture.
  - **2 boutons d'extension (v154+)** : `−` à gauche (ajoute `min-1`, sous-sols) + `+` à droite (ajoute `max+1`, étages supérieurs). Format pastille = "pill" extensible (cf. `.kta-niv-pastille` CSS) pour accepter `-1`/`-2` sans débordement dans le bouton Leaflet 30×30.
- **Sous-action 🪜 Jonction interniveau** : ajoutée au groupe Tracés quand multiLevel ON. Click → modale `from/to level` → mode tracé activé.
- **Boussole repositionnée** : si `body.kta-multilevel-active`, le widget boussole passe de `top:80px` à `top:130px` pour libérer la place au bouton niveau.

#### 26.4 Rendu et filtrage

`window.appliquerFiltreNiveau()` orchestre le re-render/filtrage de TOUS les modules level-aware :
- `renderRoads()` (road.js) — filtre via `_passeFiltreNiveau` (inclut `currentRoad` toujours visible pendant le tracé)
- `renderZones()` (zones.js) — filtre via `_zonePasseFiltre` (inclut `currentZone` toujours visible) ; une zone
  sur plusieurs niveaux passe si l'un d'eux est visible (§26.12)
- `_applyLevelFilterToEditorPoints()` (editor.js) et `_applyLevelFilterToDataPoints()` (utils.js) — markers de session et des data layers (niveau + filtre de tags) via `utils.js > ktaMasquerMarqueur` : opacité 0 **et** icône inerte (`pointer-events: none`, hors tabulation), réappliquée par un écouteur `add` quand Leaflet recrée l'icône (calque recoché, culling viewport, marker filtré avant son `addTo`). 🩸 L'image `.kta-marker-img` hérite son `pointer-events` (`inherit`, jamais `auto`), sinon un point invisible reste cliquable.
- `_applyLevelFilterToDataRoads()` (utils.js) — setStyle opacity sur polylines data layers. Une **jonction** de calque
  (et ses deux ronds d'extrémité) suit la règle de la session et de l'itinéraire : visible si `fromLevel` OU `toLevel`
  est affiché ; l'entrée du registre porte `fromLevel` / `toLevel` (lus aussi par la carte de chaleur et
  `ktaNiveauxOccupes`). 🩸 Sans eux elle tombait au niveau 0 (`level` absent). `checkup-jonction-calque-niveau.js`.
- `_applyLevelFilterToDataZones()` (utils.js) — setStyle opacity sur polygones data layers
- `_applyLevelFilterToTracker()` (tracking.js) — opacity du marker tracker + polyline parcouru
- `_applyLevelFilterToImageLayers()` (map.js, **depuis v162**) — `map.addLayer`/`removeLayer` sur les `L.imageOverlay` selon le niveau. Sémantique différente des points/zones : on retire l'overlay du Leaflet layer control (pas juste de l'opacity à 0). La modale Niveaux fait autorité — force coché/décoché selon visibleLevels (override le toggle manuel du checkbox Leaflet).

Chaque module garde un registre de ses objets Leaflet (`_ktaDataMarkers`, `_ktaDataPolylines`, `_ktaDataPolygons`, `_ktaImageOverlays`). Reset au plan switch via `main.js > lancerApplication`.

#### 26.5 Jonctions interniveau

Type spécial `"jonction"` :
- `fromLevel`/`toLevel` : niveaux des 2 extrémités. Pathfinder traverse dans les 2 sens, mais 🩸 **`fromLevel` est
  le niveau du PREMIER point et `toLevel` celui du DERNIER** (`pathfinder.js > buildNetworkGraph`) : échanger les deux
  sans inverser les points déconnecte la jonction (chaque bout ne s'accroche qu'aux tracés de son niveau).
- N points (comme une polyline normale)
- Style : magenta `#ff4ecb` weight 5 dashArray "10 6"
- Marqueurs aux endpoints : `L.circleMarker` ∅14 (radius 7) bord magenta + intérieur blanc weight 3
- Toujours visible si **au moins un** de `fromLevel`/`toLevel` ∈ `visibleLevels` (sinon cachée)
- Exclue du calcul des cercles d'intersection (les middle points sont en transit vertical, pas des croisements physiques)
- **Vue 3D** : une **galerie inclinée** qu'on marche, du sol du niveau de départ au sol du niveau d'arrivée, pente
  répartie sur la longueur 2D du tracé (`galerieEmprise.js > pente` : dénivelé = différence des sols de
  `getNiveauVertical`, sinon une hauteur de galerie par niveau franchi ; détail : `tracking.md` § Vue 3D, galerie
  inclinée). Guidage : « descendre / monter la pente vers le niveau n », dit à l'entrée du tracé (`itiGuidage.js`,
  moyen `pente`).
- **Zone jonction** (§ 26.12) : une zone jonction qu'elle traverse prend sa pente (chambre en pente en 3D) ; la fiche
  d'une zone jonction sans tracé arme ce mode, niveaux pré-remplis (`interfaceConfig.js > ktaTracerJonction`).
- **Effacement** : aucun comportement spécial, traitée comme un tracé normal par tous les modes de 🧹 (sélection au clic, dernier tracé, tous les tracés). `resetRoads()` purge aussi les jonctions car même structure de données.
- **Fiche au clic** (jonction de session, hors dessin) : `road.js` lui pose la polyline « ghost » des tracés et
  `utils.js > attacherNotePopup` avec `opts.jonction`. Titre « 🪜 Jonction N0 ↔ N+1 » (`jonctionFiche.titre`) ;
  **📝 note** comme un tracé ; **niveaux reliés** : listes Départ (premier point) / Arrivée (dernier point), chacune
  = niveaux du plan + son niveau actuel (`ktaNiveauxProposes`), appliquées ensemble par un bouton ; **🗑️ Supprimer**
  (`KtaConvertir.supprimer` : ⏪, trace de suppression pour la synchro). **Pas de 🔄 Convertir** (décision produit).
  Lecture seule : fiche en lecture (note seule).
- **Changer ses niveaux** : `convertirObjet.js > changerNiveauxJonction(obj, de, vers)`. ⚠️ Deux niveaux **différents**
  obligatoires : le refus est dit dans la fiche (qui reste ouverte, rien n'est écrit). Sinon : `captureState("roads")`
  → `fromLevel` / `toLevel` posés **en place** + `KtaUid.touch` → `setRoads` (re-rendu filtré : la jonction et ses
  ronds suivent le filtre) → `RoadGraph.invalidate()` → **une** entrée d'historique → `SessionPersist.save()`. Toast
  `info`, ou `warn` si aucun des deux niveaux n'est affiché (`ktaSignalerNiveauxJonction`).

#### 26.6 Pathfinder niveau-aware (`pathfinder.js`)

- Chaque **segment** porte `level: number | "transit"` (transit = segment de jonction)
- Chaque **node** porte `nodeLevels[idx]: Set<level>` (niveaux des segments qu'il touche)
- Enrichissement (intersection, T-junction, endpoint-endpoint) : **skip** les pairs avec niveaux numériques différents OU impliquant `"transit"` (sauf pour la jonction's first/last point qui porte fromLevel/toLevel en plus de transit, permettant T-junction propre)
- `_insertVirtualNode` (waypoint snap) : le node virtuel hérite du `level` du segment snapped — Dijkstra reste contraint au bon niveau
- 🩸 **Fusion des sommets par niveau** (`_getOrAddNode(graph, x, y, lvl)`) : deux sommets à ≤ 1,5 px ne deviennent
  un seul nœud que s'ils portent le **même niveau** ; un milieu de jonction (`transit`) ne fusionne avec rien. Sans
  ce filtre, deux galeries d'étages différents qui passent par le même point (le cas d'un puits) communiquaient à
  coût nul, sans jonction. Garde-fou : `check-poi-jonction.js` §3.
- Multi-level OFF → tous les helpers compatibilité retournent `true` → comportement strictement v147

#### 26.7 Exports

| Export | Filtre niveau |
|---|---|
| `utils.js > telechargerPlan` (rapide) | **WYSIWYG** : `window.passeFiltreNiveau(item)` lit `visibleLevels` du runtime |
| `exporter.js > _genererCanvasExport` (avancé) | Section dédiée `🏗️ Niveaux à exporter` (multi-select), lecture via `opts.ann.levels: Set<number>` → helper local `_itemPasseLevels`. **Découplé** du filtre runtime : tu peux filtrer la map sur [Niv 0] et exporter [Niv 0+1+2]. |
| `sessionExporter.js` (Full / Avancé / Conversion) | Aucun filtre — sérialise TOUS les items via `JSON.stringify` (préserve `level`/`fromLevel`/`toLevel` automatiquement) |
| `sessionPersist.js` (auto-save) | Idem — sérialisation JSON transparente |
| `kmzExport.js` (niveau par niveau) | Un dossier par niveau ; un **passage entre niveaux** (§26.11) est dans le dossier de **chacun** de ses niveaux exportés : un original, les autres marqués `mkm:copie` (sautés par `kmzImport.js`) ; `mkm:niveaux` relu à l'import |
| `geojsonExport.js` / `gpxIO.js` | Passage entre niveaux : **une** entité, gardée si un de ses niveaux est choisi, propriété `niveaux` ; GPX : `<cmt>MyKTAMap level=0 niveaux=-1,0</cmt>`, relu à l'import. Les `accroches` (pixels du plan) ne partent pas |
| Zone sur plusieurs niveaux (§26.12) | KMZ : même règle que les passages (dossier de chacun de ses niveaux, `mkm:copie`, `mkm:niveaux` relu) ; GeoJSON : une entité, propriété `niveaux` ; PNG / PDF (`_itemPasseLevels`), export rapide et minicarte (`passeFiltreNiveau`), carte de chaleur, Vue OSM : dessinée si l'un de ses niveaux est retenu |

#### 26.8 Helper global `window.passeFiltreNiveau(item)`

Exposé par `road.js`. Utilisé par l'export rapide et par toutes les fonctions level-aware qui ne sont pas dans le contexte d'une modale (modale Avancé = filtre dédié via `opts.ann.levels`).

```js
window.passeFiltreNiveau = function(item) {
  if (!APP_CONFIG.multiLevel) return true;            // off → tout visible
  const visibles = APP_CONFIG.visibleLevels || [0];
  if (item.type === "jonction") {
    return visibles.includes(item.fromLevel||0) ||
           visibles.includes(item.toLevel||0);
  }
  // passage entre niveaux (POI) ou zone sur plusieurs niveaux : l'un de ses niveaux
  return visibles.includes(item.level||0);
};
```

#### 26.9 Pièges et conventions

⚠️ **Currents always visible during draw** : `currentRoad` (road.js) et `currentZone` (zones.js) bypass le filtre pendant le tracé. Sinon clic carte → road créée au niveau actif → cachée si pas dans visibleLevels → user voit rien. Re-rendu normal une fois le mode désactivé.

⚠️ **Mode jonction = exclusif** : `_activerJonctionMode` appelle `_desactiverTousLesModes()` avant d'activer (sinon ✏️ + 🪜 actifs en même temps).

⚠️ **Pastille = chiffre seul** : `<span class="kta-niv-pastille">1</span>` (pas `Niv 1`). Le préfixe "Niv " débordait du bouton sub-action.

⚠️ **Body class `kta-multilevel-active`** : ajouté/retiré sur `document.body` dans `lancerApplication` ET dans `_bindMultiLevelToggle`. Permet à la boussole de se repositionner via CSS sans reload.

✅ **Switch d'activeLevel = UNION, plus un reset (changé en v1.74.0, demande KARMA)** — ⚠️ **la règle a été INVERSÉE, ne pas se fier à d'anciennes lectures** : `_changerNiveauActif(N)` faisait `visibleLevels = [N]` (« mode focalisé »), donc passer son niveau de travail au -2 **faisait disparaître toutes les galeries du -1**. Rédhibitoire en exploration, et bloquant pour la bascule automatique C6 (franchir un puits ne doit pas effacer l'étage quitté).

**Nouvelle règle** : le niveau de travail **s'AJOUTE** aux niveaux visibles s'il n'y est pas déjà. Rien n'est jamais retiré. L'invariant « tu vois toujours ce sur quoi tu dessines » est conservé (sinon on dessinerait à l'aveugle). Le mode focalisé reste disponible comme **geste explicite** : bouton `Actif seul` (modale ≡ Filtres et modale Niveaux).

**Source de vérité unique : `window.ktaSetActiveLevel(lvl, opts)`** (`interfaceConfig.js`) — valide, coupe le mode tracé, pose `activeLevel`, unionne `visibleLevels`, met à jour la pastille sidebar, mémorise le niveau dans la vue du plan (`KtaVuePlan.memoriser`, hors session), propage via `appliquerFiltreNiveau()` — affichage seul : ni ses rendus ni le clic qui l'a lancé ne resérialisent la session (`session-data.md` § Session sale). **Tous** les chemins passent par lui : modale Niveaux (`_changerNiveauActif` n'est plus qu'une délégation), modale ≡ Filtres (2 sites), arrivée de portail (`interPlanLinks`), et la bascule C6 du tracker.

> 🐛 **Bug de fond corrigé au passage** : les 2 chemins de la modale ≡ Filtres n'appelaient **ni** `appliquerFiltreNiveau()` **ni** rien d'autre — ils notifiaient `window._onLevelChange(...)`, un callback **jamais défini nulle part** dans le projet. Les 7 appels étant tous gardés par `typeof === "function"`, le trou était silencieux : changer le niveau actif depuis la modale ≡ ne mettait à jour ni la pastille ni les modules level-aware. Il reste 5 appels morts sur le volet `"visible"` (inoffensifs — ils accompagnent un vrai `appliquerFiltreNiveau()`), à purger si on repasse dans le fichier.

⚠️ **Itineraire = bypass total** : `road.type === "itinerary"` toujours visible peu importe le filtre (calculé par Pathfinder, doit rester affiché pendant la navigation).

⚠️ **Reset au plan switch** : `lancerApplication` reset `activeLevel = 0`, `visibleLevels = [0]`, vide les registres `_ktaDataMarkers/Polylines/Polygons` (ils seront re-remplis par `ajouterPointsDepuisJSON`).


#### 26.10 Changer le niveau d'un objet de session

Le niveau est posé à la création (niveau actif) et se change ensuite par une liste **« Niveau »** :
- **Tracé, zone, structure** : fiche commune `utils.js > attacherNotePopup`, ligne sous 🔄 Convertir. Le choix
  s'applique tout de suite par `convertirObjet.js > changerNiveau(famille, obj, niveau)` (`KtaConvertir`).
- **POI** : formulaire d'**édition** `editor.js > afficherFormulaire` (pas à l'ajout : le point prend le niveau
  actif) ; le niveau part avec le reste de la fiche au clic sur Enregistrer, dans la même entrée d'historique.
- **Pas de liste** : plan à un seul niveau, pendant un dessin (`modeRoad` / `modeZone` / `modeStructure`), objet de
  calque (fiche en lecture seule : le rapatrier d'abord), plan en lecture seule, **jonction** (deux listes Départ /
  Arrivée dans sa propre fiche, §26.5) et itinéraire. Source unique : `utils.js > ktaNiveauxProposes`.
- La liste = `availableLevels` triés **+ le niveau actuel de l'objet** même s'il en sort : sinon le `<select>`
  afficherait un autre niveau et le moindre changement déplacerait l'objet sans le dire.
- `pilier-2` / `front-2` : la valeur choisie est écrite telle quelle, le « − 1 » de la création n'est pas réappliqué.
- **Niveau cible masqué par le filtre** : l'objet quitte la carte, la vue reste sur le niveau en cours (décision
  produit), toast `warn` « déplacé au niveau N (masqué par le filtre) » (`ktaSignalerNiveauObjet`) ; visible : toast
  `info`.

Séquence (modèle de `convertir`) : garde `ktaEditionRefusee()` → `HistoryManager.captureState(famille)` → mutation
**en place** + `KtaUid.touch` → setteur de la famille (re-rendu filtré) → `RoadGraph.invalidate()` →
`HistoryManager.record(…, famille)` → `SessionPersist.save()`. Annulable ⏪ / Ctrl+Z.

Ce qui suit l'objet :
- 🩸 **Graphe de navigation** (`roadGraph.js`) : sa signature compte tracés et sommets, **et une empreinte des
  niveaux** (`level`, `fromLevel`, `toLevel`) ; sans elle un changement de niveau, ou son annulation, laissait le
  map-matching sur l'ancien étage.
- **POI** : `renderEditorPoints` recopie `marker._ktaLevel` et réapplique le filtre ; `MyKTAMapPhotos.majFichesPoints`
  met la fiche des photos au nouveau niveau ; `InterPlanLinks.onPointLevelChanged` recale le snapshot `level` des
  liaisons inter-plan (bascule de niveau à l'arrivée par le portail). Un ⏪ ne recale pas ce snapshot : le resync
  du chargement (`_resyncSnapshotsForPlan`) le rattrape, en local seulement (ni `updatedAt`, ni annonce à une
  extension).
- 🩸 **Fiche commune** : les écouteurs sont branchés dans la popup ouverte (`evt.popup.getElement()`), pas dans tout
  le document : la popup qu'on quitte reste dans le DOM pendant son fondu et recevait les écouteurs à la place.

Garde-fous : `check-api-surface.js` (changerNiveau et changerNiveauxJonction dans un `vm`, liste proposée, câblage),
`check-uid.js` (touch), `check-extensions.js` (garde lecture seule) · parcours réels :
`scripts/smoke/checkup-niveau-objet.js`, `scripts/smoke/checkup-jonction-fiche.js` (fiche d'une jonction, itinéraire
qui l'emprunte).

#### 26.11 POI « entre niveaux » (escalier, puits) — `js/poiJonction.js`

Un passage vertical **ponctuel** (escalier, puits à échelons, puits sans échelon) est un POI, pas un tracé. Les
jonctions en tracé (§26.5) restent les **pentes douces**.

- **Tags** : `jes` (escalier entre niveaux), `jpe` (puits à échelons entre niveaux), `jps` (puits sans échelon entre
  niveaux). 🔒 **Jamais une sortie de surface** : absents de `sortieUrgence.js > TYPES_SORTIE` et de
  `secoursMode.js > CRIT_TAGS / CRIT_FERMES` (`scripts/check-poi-jonction.js` §1-2, sur la vraie sortie d'urgence).
  `peo` / `eso` / `pa` peuvent **aussi** porter `niveaux` (puits de surface qui dessert des étages) : `peo` / `eso`
  restent des sorties ; `pa` (puits d'aération) n'a pas de moyen (`moyen` null) : jamais emprunté par l'itinéraire
  (`_injecterJonctionsPoi` l'écarte) ni par le 🪜 de la vue 3D, qui le dessine à chacun de ses niveaux ; sa fiche dit
  ses niveaux sans raccord.
  Pas de variante ouvert / fermé (décision produit).
- **Données du point** : `niveaux` (entiers, contient toujours `level`) et `accroches` `[{level, x, y}]` = raccords
  **validés** par l'utilisateur, un par galerie où le passage débouche. Point sans `niveaux` = son seul `level`.
  `KtaPoiJonction.niveaux(p)` normalise ; `estJonction(p)` = tag de passage + ≥ 2 niveaux + plan multi-niveau.
- **Formulaire** (`editor.js > afficherFormulaire`) : bloc « Niveaux desservis » affiché selon le tag ; cases des
  niveaux du plan (celui du point cochée et figée) ; pour chaque niveau coché, les galeries à moins de **5 m**
  (`APP_CONFIG.scale`) — **50 px** sur un plan sans échelle, et c'est écrit — sont **proposées non cochées** ;
  seul ce que l'utilisateur coche devient un raccord. Un niveau sans galerie dans le rayon est dit. `appliquer()`
  mute en place avant `KtaUid.touch` (`check-uid.js`), puis `RoadGraph.invalidate()`.
- **Fiche** : niveaux et nombre de raccords (« aucun raccord validé » en avertissement) ; les raccords sont dessinés
  en pointillé magenta **seulement pendant que la fiche est ouverte** (`brancherMarqueur`, décision produit).
- **Affichage** : visible si **un** de ses niveaux est affiché (`marker._ktaNiveaux` sur les marqueurs de session et
  de calque, `passeFiltreNiveau` de l'export rapide). Calques : `_ktaNiveauxSrc` / `_ktaAccroches` sur le marqueur,
  rendus par `getAllEmbeddedPoints`.
- **Niveaux occupés** (`main.js > ktaNiveauxOccupes`, extension de `availableLevels`, niveaux vides du Mode Secours) :
  chaque niveau desservi compte, même si le passage est le seul objet de ce niveau, en session (`niveaux`) comme en
  calque (`_ktaNiveauxSrc`). Lu par le tag (`porteNiveaux`, `peo` / `eso` compris), pas par `estJonction` qui exige le
  multi-niveau déjà actif ; un point d'un autre tag ignore un champ `niveaux` parasite.
- **Itinéraire** (`pathfinder.js > _injecterJonctionsPoi`, après l'enrichissement, dans `computeRoute`,
  `computeRouteOnRoads` (POI fournis par `opts.poisJonction`), `computeReachable` et `buildNetworkGraph`) : un nœud
  `transit` **neuf** par niveau desservi à la position du POI, chaînés du plus bas au plus haut ; chaque raccord est
  recalé sur une galerie de **son** niveau à ≤ 15 px (sinon ignoré, compté dans `graph.raccordsPerdus`) et relié au
  nœud de son niveau. Coût d'un maillon : **différence de profondeur** (`niveauxProfondeur`) si les deux niveaux en
  ont une, sinon **forfait par niveau franchi** : escalier 10 m, échelons 20 m, corde 20 m (`FORFAIT_M`, décision
  produit) ; plan sans échelle : 10 px/m supposés. Un niveau sans raccord est traversé (0 ↔ 2 sans débouché au 1).
  `jps` hors graphe sauf `opts.corde` (case « 🧗 Équipe équipée (corde) » de la fenêtre d'itinéraire, rubrique
  Évitements, `myktamap_route_avoid_<plan>.corde`, remise à faux par la réinitialisation ; jamais en Secours ni en
  sortie d'urgence). Les segments du puits portent `poi` : un départ ou une arrivée ne s'y cale jamais.
- **Guidage** : les points du chemin dans le puits portent `via` (`escalier` / `echelons` / `corde`) ; la consigne
  de niveau devient « descendre vers le niveau −1 par l'échelle » (`guid.par.*`).
- **Sortie d'urgence** : classée sur `totalDistance` (coût vertical compris) ; un passage entre niveaux peut être
  emprunté pour rejoindre une sortie, jamais proposé comme sortie.
- **Signature du graphe de navigation** (`roadGraph.js > _computeSig`) : empreinte des POI jonctions (position, tag,
  niveaux, raccords).
- **Limites** : étape inter-plans distante sans ses POI jonctions (`collectRoutingDataForPlan` ne les lit pas) ;
  évacuation brancard sans règle propre aux puits.

Garde-fous : `scripts/check-poi-jonction.js` (pre-commit : sorties, fusion par niveau, graphe, coûts, corde, zone
atteignable, sortie d'urgence) · parcours réel : `scripts/smoke/checkup-poi-jonction.js`.

#### 26.12 Zone sur plusieurs niveaux

Une zone (tout type, `cust-*` compris) peut toucher plusieurs niveaux : un effondrement entre le −1 et le −2.
- **Modèle** : `niveaux` (entiers, triés, sans doublon, ⊇ `level`) ; absent = `level` seul. `level` reste le niveau
  d'origine. **Un seul objet**, même contour sur chacun de ses niveaux : modifier, déplacer, supprimer agit partout.
- **Règle unique** : `poiJonction.js > ktaNiveauxObjet(o)` (= `KtaPoiJonction.niveaux`), lue par le rendu, le
  pathfinder, les filtres et les exports ; jamais de copie locale de la règle (un repli `[level]` si le module manque).
- **Saisie** : la zone se trace au niveau actif ; sa **fiche** (`utils.js > attacherNotePopup`, sous la liste
  « Niveau ») propose « Aussi aux niveaux » en cases (niveaux du plan hors `level`, plus ceux déjà portés), appliquées
  par un bouton → `convertirObjet.js > changerNiveauxZone(obj, autres)` (une entrée ⏪, uid gardé, `touch`, graphe
  invalidé). Pas de cases hors multi-niveau, pendant un dessin ou sur une zone de calque (lecture seule).
- **Niveau d'origine changé** (liste « Niveau ») : l'ancien est **remplacé** dans `niveaux`, les autres restent
  (`_poserNiveau`) ; s'il ne reste que `level`, le champ disparaît. Zone convertie en structure : `niveaux` retiré.
- **Itinéraire** : une zone bloquante (inaccessible, ou type à éviter) bloque, et une zone à coût (Comblé,
  effondrement) coûte, sur **chacun** de ses niveaux
  (`pathfinder.js > _zoneBloquante`, niveaux calculés une fois par calcul), y compris sur un réseau d'un autre plan
  (`computeRouteOnRoads`, `opts.zones` / `avoidZonesResolved`). « Vérifier le plan » suit la même règle (C1, C12).
- **Vue 3D** : dessinée et bloquante sur chacun de ses niveaux, pas ailleurs (`vue3d.js > _zoneSurNiveau` pour la
  scène et les volumes enjambés par l'itinéraire, `galerieEmprise.js > _zoneSurNiveau` pour la règle du pas, dont
  `ctx.libre` d'une greffe) ; `niveaux` entre dans l'empreinte des données de la vue et dans la signature de
  `KtaGalerie` : décocher un niveau, vue ouverte, refait la scène.
- **Comptes** : bilan par niveau (`refonteInterface.js`), statistiques (`statsGlobales.js`, colonne `niveaux` du CSV),
  niveaux occupés (`main.js > ktaNiveauxOccupes`), recherche, niveaux proches d'un recalage
  (`tracking.js`), sélection par zone (`selectionZone.js`), sélection multiple (`selectionMulti.js`) et remblais du
  volume exploité (`volumeExploite.js`) comptent la zone sur chacun de ses niveaux.
- **Zone jonction** (décision produit) : un **type de zone** à part, `pente` (« Jonction » du menu Zone, plan
  multi-niveau, hors vue 3D comme le tracé jonction), pour une chambre dont le sol monte d'un niveau à l'autre.
  - **Création** : le choix du type ouvre la même modale « du niveau … au niveau … » que le tracé jonction
    (`interfaceConfig.js > _ouvrirCreationJonction(btn, { zone, onOk })`) ; la zone reçoit seule `level` = départ et
    `niveaux` = [départ, arrivée] (`zones.js`, `window._zonePenteMeta`, gardé tant que l'outil reste armé). Rien à
    cocher. **Convertir** vers Jonction (fiche) pose la même question (niveaux de l'objet proposés) ; le lot et le
    Tableur gardent les niveaux de l'objet (sa fiche les ajuste) ; le Tableur ne change pas le niveau d'une zone
    jonction (lecture seule, comme une jonction).
  - **Fiche** : « Du niveau » / « Au niveau » à la place de la liste Niveau et des cases « Aussi aux niveaux »,
    appliqués ensemble (`KtaConvertir.changerNiveauxPente`, deux niveaux différents, une entrée ⏪). Sans tracé jonction
    qui la traverse entre ses deux niveaux, elle le dit et propose **🪜 Tracer la jonction** : le mode tracé jonction
    existant, niveaux pré-remplis (`ktaTracerJonction`).
  - **Sens et pente** : ceux du tracé jonction qui la traverse (premier tracé dont les deux niveaux sont parmi ceux de
    la zone et qui entre dans son contour), sol projeté sur ce tracé bout à bout comme la galerie inclinée :
    `galerieEmprise.js > estZoneJonction(z)` (type `pente`, ≥ 2 niveaux) / `penteDeZone(z)` / `zonesDePente(r)`, une
    seule règle pour la fiche et la 3D. Sans tracé : sol à plat. **Itinéraire** : inchangé, il passe par le tracé
    jonction ; la zone elle-même ne bloque rien. Vue 3D : `tracking.md` § Niveaux entremêlés et zones jonction.
  - **Comme le tracé jonction partout** (décision produit) : même couleur (`styleResolver.js > _couleurDe`), même
    libellé et même visibilité de légende (`legendCustomization.js > TYPE_LIE` : lus et écrits sous `traces.jonction`,
    une seule ligne dans l'éditeur), même groupe de légende (ligne de surface juste sous le tracé jonction, ≡ Légende et
    légende du PNG / PDF), même filtre (puce « Jonction » des types de tracés : `filterPanel.js >
    _lierZoneJonction` remet `zoneTypes` d'accord avec `roadTypes`, lu tel quel par la carte, les calques, la 3D et la
    Vue OSM), visible sur chacun de ses deux niveaux, hors des sélections multiple et par zone (`EXCLUS`, comme le
    tracé : ses niveaux vivent dans sa fiche). Exports : voir `exports.md` § Zone jonction.
  - **Ancien champ** `jonction: true` (zone cochée « Zone jonction ») : converti en type `pente` à l'entrée, sans
    toucher `updatedAt` (`data-formats.md`).
- Parcours réel de la zone jonction : section E de `scripts/smoke/checkup-zones-niveaux.js` (menu, niveaux, fiche,
  Tracer la jonction, couleur / libellé / filtre, exports comparés au tracé, Convertir, ancienne zone) et F (Générateur).
- Garde-fous : `scripts/check-zones-niveaux.js` (pre-commit : règle, rendu, itinéraire, fiche, session, KMZ, GeoJSON,
  règle du pas de la 3D, sélection par zone, volume exploité), § 29 de `scripts/smoke/checkup-vue-3d.js`
  et `scripts/smoke/checkup-zones-niveaux.js` (plan fictif fabriqué dans la page : tracé, fiche, filtre, itinéraire,
  ⏪, KMZ relu par l'import, rechargement).

---

### 31. Zone "Inaccessible" + Préférences d'évitement itinéraire (depuis v169 / Karma_dev)

2 features complémentaires pour contraindre les itinéraires calculés par Pathfinder. Toutes deux travaillent au niveau du graphe (filtrage des arêtes avant Dijkstra), pas en post-traitement.

#### 31.1 Zone "Inaccessible" (contrainte DURE)

**Type de zone** : `"inaccessible"`. Tracé via le groupe ⬛ Zones de la sidebar, bouton ⛔.

**Visuel** : hachures rouge sombre / noir à 45°, peintes en `CanvasPattern` (`styleResolver.js > _motifCanvas`, couleurs
dans `CANON.zones.inaccessible._motif`) sur le **même canvas** que les autres vecteurs, session comme calques. Elle passe
donc par-dessus les autres zones (tri `KTA_ORDRE_ZONES` : `eau < masse-sol < remblais < effondrement < inaccessible`) et **sous les structures**
(`structures.js > ktaStructuresAuDessus`, rappelé après chaque rendu de zones : sur un canvas, la dernière couche
ajoutée se peint au-dessus). Le motif suit la carte au glissé et garde sa taille à l'écran au zoom. Exports, KMZ, Vue
OSM, pastilles : aplat de repli (`{ flat: true }`).

**Effet pathfinder** : dans `_buildGraph`, pour chaque segment de road, on teste `_segmentBloqueParZoneInaccess(prevP, p, segLevel, obstacles.polys)` (et `_segmentCoupeParMur`, cf. §31.1 bis). Si traversée détectée → on n'ajoute PAS l'arête ni le segment dans `graph.segments` → enrichment (intersection/T-junction) ne verra pas ce segment → Dijkstra ne peut pas emprunter ce tronçon.

**Algorithme de détection** (`pathfinder.js`) :
- `_pointInPolygon(p, poly)` — ray-casting standard O(n)
- `_segmentTraversePolygon(p1, p2, poly)` — true si un endpoint dedans OU si le segment intersecte une arête du polygone
- `_segmentBloqueParZoneInaccess(p1, p2, segLevel, zonesInacc)` — applique la règle niveau-aware (segments "transit" jamais bloqués)

**Collecte des zones** : `_collecterZonesInaccessibles()` lit :
- Session zones via `window.getZones()` (filtre `type === "inaccessible"`)
- Data layer zones via `window._ktaDataPolygons` (entries portant `type` et `points` depuis v169, cf. `utils.js > ajouterPointsDepuisJSON`)

**Multi-niveau** : une zone bloque les segments de **chacun de ses niveaux** (`level`, ou `niveaux` §26.12), et ceux-là
seulement. Sauf `multiLevel: false` (comparaison à plat). Segments `"transit"` (middle de jonction interniveau) jamais bloqués (points "en l'air").

**Indépendant de la visibilité** : pathfinder utilise toujours la zone même si le calque zones est toggle off (cohérence demandée — sinon l'user pourrait toggler sans s'en rendre compte). Toutes les modifs d'export (PNG, session) respectent toujours le type comme une vraie zone.

#### 31.1 bis Mur en ligne (contrainte DURE)

**Type de structure** : `"mur-ligne"` (« Mur (ligne) », 🟦), polyligne de la famille des structures comme les fronts (`structures.js > STRUCTURE_TYPES_POLYLINE`). Sert aux murs levés en trait, cas courant d'un import SIG (le `mur` intégré est un polygone, une ligne ouverte ne s'y convertit pas). Jamais un tracé : un tracé est une galerie praticable.

**Effet pathfinder** : un segment de road qui **croise** un mur en ligne de son niveau n'entre pas au graphe, exactement comme une zone inaccessible (mêmes conséquences pour l'enrichissement et Dijkstra). Piliers, mur polygone et fronts ne sont **pas** des obstacles. Le rôle tient à la **clé** `mur-ligne` : renommé ou recoloré dans ≡ Légende, il reste un obstacle ; un type personnalisé en ligne n'en est pas un.

**Collecte** : `_collecterMursLigne()` lit `window.getStructures()` et `window._ktaDataStructurePolygons` (le registre range aussi les lignes), `type === "mur-ligne"`, ≥ 2 points, sans `level` = niveau 0. `_collecterObstaclesDurs()` = zones inaccessibles + murs, passé partout où passaient les zones (`computeRoute`, `computeReachable`, `buildNetworkGraph({ includeZones: true })`). Inter-plans : `InterPlanLinks.collectRoutingDataForPlan` rend `murs` (session + calques du plan distant), `computeRouteOnRoads(…, { murs })` les applique.

**Algorithme** : `_preparerObstacles` sépare polygones et murs ; les segments de murs vont dans une grille (`GRILLE_MUR_PX` = 64 px, clé `niveau|cx,cy`, un seul étage `*` hors multi-niveau). `_segmentCoupeParMur` ne teste que les cellules de la boîte du segment de road, puis boîte contre boîte, puis `_segmentIntersection` (bornes incluses). 🩸 Le test naïf serait tracés × segments de murs (~6·10⁷ intersections pour 10 000 segments et 3 000 murs) ; avec la grille, le graphe coûte le même ordre de temps que sans murs (mesure dans `scripts/check-mur-ligne.js`).

🩸 **Contact compté** : un tracé qui finit pile sur un mur perd ce dernier segment (bornes incluses), sinon deux segments qui se touchent sur le mur le franchiraient. Un tracé qui longe un mur (colinéaire) n'est pas coupé.

**Import SIG** : une valeur « mur » sur une **ligne** est proposée en `struct:mur-ligne` (`createConf.js > _sigImpRendreTables`) ; sous « une couleur par niveau », un mur en ligne garde sa clé (`sigImport.js > _typeNiveau`), sinon il serait fondu dans le type de niveau des fronts et perdrait son rôle.

#### 31.2 Préférences d'évitement (contrainte SOUPLE)

**Configurées dans la modale itinéraire**, section repliable "🚫 Préférences d'évitement (optionnel)". Persisté en localStorage par plan : `localStorage["myktamap_route_avoid_<planId>"] = { points: [{x,y,label,id?}], tags: [...], zones: [...], radius: 100 }`.

**4 types de contraintes** :
1. **Points explicites** : `avoidPoints: [{x, y, label?, id?}, ...]`. **3 méthodes d'ajout** côté UI :
   - **Autocomplete** : `SearchPoints.findByQuery` (recherche par nom/id/tag)
   - **Saisie ID exact** : `Pathfinder.resolvePointById` (input texte + bouton Ajouter)
   - **Clic carte** : bouton "📍 Cliquer sur la carte" → mode flottant orange (`_itiAvoidClickActive`, handler isolé du mode clic waypoints), chaque clic ajoute un point d'évitement aux prefs (label "📍 Clic carte (x, y)"). Cf. `_activerModeClicAvoid` / `_desactiverModeClicAvoid` dans interface.js.
2. **Tags** : `avoidTags: ["pa", "danger", ...]` → expansion auto en tous les points du plan portant ces tags (via `SearchPoints.getAllPoints`, **async**)
3. **Marge** : `avoidRadius` px (défaut 100, configurable 0-500)
4. **Zones** (depuis v1.48.0 ; **par TYPE depuis v1.48.1**) : `avoidZones: ["eau", "cust-…", ...]` → liste de **types de zones** à contourner (1 coche par type, comme les autres filtres — plus de liste par instance). `getAvoidableZoneTypes()` (exposé `window.getAvoidableZoneTypes`) liste les **types distincts** des zones évitables (session `getZones` + embarquées `_ktaDataPolygons`) — **exclut `inaccessible`** (déjà contrainte DURE, cf. §31.1) **et les types à coût** `remblais` / `effondrement` (évités d'office, cf. § Zones à coût ; un de ces types resté coché dans d'anciennes préférences est ignoré : l'exclure du graphe ferait échouer la passe 1 et relâcher tous les autres évitements). Label **legend-aware** : type custom (`cust-…`) via `LegendCustomization.findCustomEntry(type).label` (« galerie basse »), built-in via `getLabel("zones", type)` (« Eau »…). ⚠️ `getLabel` ne consulte PAS `customEntries` → d'où le recours à `findCustomEntry` pour les customs. `_collecterZonesAEviter(types)` collecte **toutes** les zones dont le type est coché. Côté pathfinder, un segment traversant une de ces zones est coupé du graphe via `_segmentBloqueParZoneInaccess(prevP, p, segLevel, avoidZones)` (niveau-aware : une zone ne bloque que les segments de ses niveaux ; passe souple uniquement).

**Algo 2 passes** (clé du fallback) :
1. **Passe 1** : `_computeRouteInterne(waypoints, allRoads, allowedTypes, zonesInacc, allAvoidPts, avoidRadius, avoidZones)` — graphe avec dur+souple (points **et** zones évitées), tentative Dijkstra
2. Si échec ET `hasAvoidances` → **Passe 2** : `_computeRouteInterne(waypoints, allRoads, allowedTypes, zonesInacc, [], 0, [])` — graphe avec dur uniquement (zones évitées **et** points relâchés)
3. Si Passe 2 OK → marqué `usedFallback: true` + détection des points évités traversés via `_pathPassesNearPoint(path, ap, radius)` → renvoyé dans `avoidedThrough`. UI affiche "⚠️ Impossible d'éviter : ..." en bloc orange.
4. Si Passe 2 échoue aussi → erreur relancée (vraie absence de chemin, zone inaccessible bloquante ou réseau disconnect).

**API publique** : `Pathfinder.computeRoute(waypoints, opts)` est désormais **async** (await `_expandAvoidTagsEnPoints` qui utilise `SearchPoints.getAllPoints` async). Les 2 appelants dans `interface.js` ont été mis à jour avec `await`.

**Structure retournée** :
```js
{
  path:           [{x, y}, ...],     // chemin final
  totalDistance:  number,             // px image
  segmentCount:   number,
  snappedPoints:  [...],
  usedFallback:   boolean,            // v169 : true si fallback passe 2 utilisé
  avoidedThrough: [{x, y, label}, ...], // v169 : points évités traversés
  cout:           number,             // coût Dijkstra (= totalDistance sans zone à coût traversée)
  zonesTraversees: [{type, longueurPx, objet}], // zones à coût traversées faute d'autre chemin
  avoidRadius:    number              // v169 : marge appliquée
}
```

#### 31.3 UI (interface.js, ~370 lignes)

**Helpers localStorage** : `_getItiAvoidPrefs`, `_setItiAvoidPrefs`, `_itiAvoidLsKey` (clé par planId pour ne pas mélanger entre plans)

**HTML section** : `_htmlSectionAvoidItineraire(prefs)` génère le `<details>` repliable avec 4 sous-blocs (Points / Tags / **Zones** / Marge) + reset

**Rendu** :
- `_rafraichirListeAvoidPoints` (sync) : chips orange pour chaque point évité avec ✕
- `_rafraichirChipsAvoidTags` (async, await `_itiAvoidGetAvailableTags`) : chips toggleables pour les tags du plan
- `_rafraichirListeAvoidZones` (depuis v1.48.0 ; **par type depuis v1.48.1**) : checklist (`#kta-iti-avoid-zones-list`) bâtie depuis `window.getAvoidableZoneTypes()` — **1 case par type** (label legend-aware + nombre de zones). Chaque toggle persiste le **type** dans `prefs.zones`. Liste vide → message `iti.avoid.zonesEmpty`. Appelée au premier rendu de la modale **et** au reset des préférences.

**Bind handlers** : `_bindAvoidSectionHandlers` :
- Autocomplete avec debounce 150ms (réutilise `SearchPoints.findByQuery`)
- Saisie ID + Enter (réutilise `Pathfinder.resolvePointById`)
- Change handler sur radius input
- Reset avec `confirm()`

**Styles** : `.kta-iti-avoid-*` dans `style.css` — couleur thématique orange (cohérent semantic "warning"), chips arrondis, etat actif/inactif sur tags

#### 31.4 Audit exports — Fixes intégration Feature 1/2 (depuis v169 / Karma_dev)

Audit complet des 4 fonctions d'export pour vérifier la cohérence des 2 features. Problèmes trouvés + corrections appliquées :

**Sites corrigés** (post-audit) :

1. **`sessionExporter.js > _genererPayloadAvanc + _genererFichiersConversion`** : les filtres `roadTypes` / `roadTypesActifs` listent `["principal", "secondaire", "chemin"]` → drop silencieux des jonctions. Fix : bypass explicite `if (r.type === "jonction") return true;` avant le filtre. Idem dans la granularité fine où on liste les types pour générer les fichiers : `["principal", "secondaire", "chemin", "jonction"]`.

2. **`exporter.js > _dessinerLegende`** : la légende PNG (mode avancé) listait uniquement Eau/Remblais/Effondrement et Principal/Secondaire/Chemin. Ajouts :
   - Section Zones : `"Inaccessible"` avec fillColor `#7a0000` (= couleur uni canvas, pas hachures SVG car non portable au canvas). Label épuré pour rester sobre : la sémantique "bloque l'itinéraire" est portée par le visuel (rouge sombre + icône ⛔ dans la sidebar).
   - Section Tracés : `"Jonction interniveau"` avec lineColor `#ff4ecb`

3. **`tableEditor.js > _detecterColonnes.ordreCourant`** : la liste d'ordre privilégié `["id","nom","x","y","tags","etat","description",...]` n'incluait pas `level` → colonne en queue de tableau. Ajout : `level` inséré entre `y` et `tags` pour cohérence visuelle des coords (`x/y/level` contigus).

**Choix volontaires documentés** (P2 audit non corrigé) :

- **Préférences d'évitement** (`localStorage["myktamap_route_avoid_<planId>"]`) ne sont **PAS sérialisées** dans les exports session/conversion. Volontaire : les préférences sont **locales** (= configurées pour la session de l'user, pas pour le plan). Un user peut avoir des évitements différents d'un user qui partage le même plan. Si besoin de partage, à ajouter explicitement dans une release future via une checkbox "inclure préfs d'évitement" dans Export Session Full.

**Mode clic carte pour avoidances** (depuis Karma_dev audit) : ajout d'un bouton **📍 Cliquer sur la carte** dans la section avoid (à côté de l'autocomplete et de la saisie ID). État `_itiAvoidClickActive` + handler `_itiAvoidClickHandler` séparés des waypoints (pas de conflit possible avec le mode clic waypoints existant). Floater orange `kta-iti-avoid-floater` au lieu du floater cyan des waypoints. Compteur live `_majPanneauFloaterAvoidCount`. Pattern identique aux waypoints (`_activerModeClicCarte`/`_desactiverModeClicCarte`).

#### 31.5 Tri Z-index des roads en mode multi-niveau (depuis v169)

Bug remonté KARMA : en mode multi-niveau, l'ordre d'affichage des routes ne reflétait pas la hiérarchie physique. Une galerie au Niv 0 pouvait apparaître **en-dessous** d'une galerie au Niv -1 si elle avait été tracée avant — c'était l'ordre d'insertion plat.

**Règle implémentée** (uniquement quand `multiLevel === true`) :
- **Tri primaire** : `level` **ascendant** — niveau bas en arrière, niveau haut au-dessus (LVL -∞ → -2 → -1 → 0 → +1 → +∞)
- **Tri secondaire** : type au sein du même niveau — `chemin (0) < secondaire (1) < principal (2) < jonction (3)`. Principal au-dessus de chemin/secondaire = hiérarchie visuelle naturelle.
- **Itinéraire** : toujours en dernier (au-dessus de tout, c'est la navigation active).
- **Jonctions** : tri par `max(fromLevel, toLevel)` — le pont apparaît au-dessus du niveau inférieur, cohérent avec l'analogie "escalier qui monte au-dessus du sol bas".

**Sites d'application** (4 endroits) :
1. `js/road.js > renderRoads` — affichage Leaflet on-map des routes de session
2. `js/utils.js > ajouterPointsDepuisJSON` — création initiale des polylines data layer
3. `js/utils.js > telechargerPlan` — export PNG rapide (session + embedded)
4. `js/exporter.js > _genererCanvasExport` — export PNG avancé (session + embedded)

**Pattern** : copie triée (`[...arr].sort(...)`) pour ne pas muter l'array source. Sort prédicat composé level → type.

**Rétro-compat** : si `multiLevel === false`, ordre d'insertion conservé (= comportement v147 strict). Pas de régression sur les plans single-level.

#### 31.6 Audit aide intégrée + légende in-app + label épuré (depuis v169 / Karma_dev)

Audit demandé KARMA pour vérifier que les modales "aide" (📖) et "légende" (🗺️) intègrent les 2 features. Corrections appliquées :

**Modale Légende in-app** (`interface.js > afficherLegende`) :
- Section 🛣️ Tracés : ajout `"Jonction interniveau"` (trait magenta `#ff4ecb`)
- Section ⬛ Zones : ajout `"⛔ Inaccessible"` (swatch en hachures CSS via `repeating-linear-gradient(45deg, #5a0a0a 0 6px, #1a1f2e 6px 10px)`)

**Modale Aide intégrée** (`interface.js > afficherAide`) :
- Section 🛣️ Tracés & Routes : ajout `🪜` Jonction interniveau (mention "sous-action conditionnelle multi-niveau")
- Section 🗺️ Itinéraire : nouveau paragraphe `🚫 Contraintes d'évitement` qui distingue clairement dur (⛔) vs souple (🚫), mentionne les 3 méthodes d'ajout et la persistance localStorage par plan

**Suppression au clic** (`interface.js`, 2 sites) :
- `_choixSuppression "Tracés"` et `activerModeSuppressionTraceClic` : filtre étendu à `["principal", "secondaire", "chemin", "jonction"]`. Avant : impossible de supprimer une jonction au clic, fallback obligatoire via "Tous les tracés". Après : cohérent avec les autres tracés.

**Épuration des labels de légende** (cohérence cross-doc, 2 commits) :
- Légende in-app : `"⛔ Inaccessible — bloque l'itinéraire (hachures)"` → `"⛔ Inaccessible"` (commit `0419752`)
- Légende in-app : `"🪜 Jonction interniveau (escalier / pente — multi-niveau)"` → `"Jonction interniveau"` (commit `d2b4898`)
- Légende PNG : `"Inaccessible (bloque l'itinéraire)"` → `"Inaccessible"` (commit `0419752`)
- **Principe** : sémantique portée par le **visuel** (couleur unique magenta pour jonction, hachures rouge/noir pour inaccessible) + icône dans la sidebar (⛔, 🪜) → pas besoin de doubler en texte. Labels sobres alignés avec le reste du projet.

#### 31.7 Ajouter un type de zone

Types actuels : `eau`, `masse-sol` (masse au sol, part comblée `comble`), `remblais` (« Comblé »), `effondrement`, `inaccessible`,
`pente`. La liste des ~25 sites (style du canon, saisie, icône, légende, filtres, zones embarquées, exports, échanges
KMZ / GeoJSON / SIG / Générateur, champ propre au type, palettes délibérées, effets 3D / itinéraire, garde-fous, doc)
vit dans la skill `.claude/skills/add-zone-type` (relevée sur l'ajout de `masse-sol`). Un grep large sur
`"effondrement"` et `remblais` reste le meilleur filet. La masse au sol a sa propre règle d'itinéraire (coût selon le
vide, § Masse au sol : coût selon le vide).

---

## 🧭 Itinéraire INTER-PLAN (v1.60.0 — A6)

> Le pathfinding traverse les « portails » (liaisons inter-plan, cf. `js/interPlanLinks.js` + `docs/architecture/data-formats.md` §liaisons). Décisions KARMA : `1:c 2:a 3:a 4:a 5:a 6:a`.

**Module `js/interPlanRoute.js`** (`window.InterPlanRoute = { computeEtAfficher(dest), onPlanLoaded() }`) :

- **Leg A** (plan courant) : `Pathfinder.computeRoute` classique — position tracker → point-portail côté A, avec les prefs d'évitement du plan courant.
- **Leg B** (plan distant, **non chargé**) : `Pathfinder.computeRouteOnRoads(waypoints, roads, opts)` — nouvelle API **synchrone** exposant `_computeRouteInterne` sur des roads fournies. Les données viennent de `InterPlanLinks.collectRoutingDataForPlan(plan, stats)` : **roads + zones + scale** lus depuis la session localStorage + les datalayers (serveur `fetch` / ZIP IndexedDB). Zones `inaccessible` = contrainte dure, Comblé / effondrement = coût (`opts.zones`, même règle que le plan ouvert) ; évitements du plan B (prefs `myktamap_route_avoid_<planB>`) résolus par l'appelant (tags → points du plan B via `collectPointsForPlan`).
- **Portails candidats** (3:a) : liaisons A↔B du registre, tri par proximité euclidienne du départ, **≤ 5 testés au coût réel**, coût minimal retenu (`_coutM` : distance + zones à coût traversées, en mètres par plan ; la distance affichée reste `distM`). Une étape qui traverse une zone Comblé ou effondrée le dit dans le résumé (une ligne par plan).
- ⚠️ **Échelles** : `totalM = legA.px/scaleA + legB.px/scaleB` — le scale du plan B est lu depuis SON plan-config (`tracking.scale`). Ne JAMAIS sommer des px de plans différents.
- **Traversée** (4:a, coût 0 m — 5:a) : modale résumé par étapes → « Prendre le portail » → `InterPlanLinks.goTo` → **`_pendingRoute`** (RAM) consommée par `onPlanLoaded` (hook `main.js`) **+3 s après l'arrivée** (le restore SessionPersist écrase les roads sinon). Le leg tracé = road `type:"itinerary"` standard.
- **Erreurs codées** (exigence KARMA) : `NO_PLAN`/`NO_POS`/`SAME_PLAN`/`NO_LINK`/`NO_DIRECT_LINK` (BFS borné profondeur 4 sur le méta-graphe des plans → nomme le plan intermédiaire ; le calcul multi-hop reste **V2**)/`DATA_UNREACHABLE`/`NO_ROADS_B`/`ALL_FAILED` (détail par portail, côté A ou B). i18n `ipr.err.*`.
- **Entrées UX** (1:c) : `searchPoints` inchangé — recherche multi-plans (`crossPlanSearch.js`) bouton 🧭 par résultat distant ; modale Itinéraire (`interfaceItineraire.js`) bouton « 🌐 Destination sur un autre plan » via `CrossPlanSearch.ouvrir(query, { onSelect })` (mode sélection).

**À NE PAS faire** :
- ❌ Sommer des pixels de deux plans (échelles différentes) — toujours convertir en mètres par plan.
- ❌ Tracer le leg B AVANT le restore de session du plan B (il serait écrasé) — passer par `_pendingRoute` + délai.
- ❌ Calculer le leg B sur des données partielles (`stats.dataError`) — refuser avec `DATA_UNREACHABLE`, ne pas deviner.
- ~~❌ Étendre au multi-hop~~ → FAIT en v1.64.0 (cf. § Multi-hop ci-dessous — l'explosion combinatoire est contenue par le Dijkstra sur graphe de portails à arêtes paresseuses).

---

## 🔄 Itinéraire vivant — replanification au recalage + validation d'étapes (v1.61.0)

> Scénario : sortie multi-étapes réelle (moi → curiosité X → curiosité Y → sortie), le tracker dérive, le téléphone est verrouillé → l'user recale souvent. Décisions KARMA `1:a 2:a 3:a 4:a 5:a` (recalcul sur TOUT recalage · validation explicite uniquement · ordre planifié conservé · étape validée reste affichée ✓ · fin = tracé effacé).

**Flux** : `tracking.js > _notifierRecalage(x, y, source)` — émis aux 3 sorties de recalage : clic carte mode recalage (`"click"`), `recalerTrackerSurPoint` (`"point"` — couvre « 📍 Je suis ici » ET l'arrivée portail v1.61.0). Consommateur unique : `interfaceItineraire.js > window._onTrackerRecale`.

**`_onTrackerRecale(x, y, source)`** (`interfaceItineraire.js`) :
- No-op sans road `type:"itinerary"` active (hors `_preview`).
- `source === "point"` + coords **arrondies** égales à une étape non-done (hors `source:"tracker"`) → **validation** : `w.done = true` (mutation directe de la road → persistance session gratuite), toast `iti.replan.stepDone` + vibration medium.
- Débounce **500 ms** → `_replanifierDepuis(x, y, niveau)` (`niveau` = `getTrackerLevel()` sur un plan multi-niveau : le tracker vient d'être recalé, il porte le niveau d'arrivée ; posé en `level` sur l'origine) : étapes restantes = `waypoints.filter(!done && source!=="tracker")` dans l'ordre ; `computeRoute([origin, ...restantes], avoidPrefs)` sous `_withItiComputeLoader` ; nouvelle road = `waypoints: [origin, ...TOUTES les étapes copiées]` (done incluses → progression visible + persistée). **Échec de calcul → ancien tracé conservé** + toast `iti.replan.err`.
- 0 étape restante → road itinéraire retirée + toast `iti.replan.finished` (le tracé tracker n'est pas touché).

**Rendu done** : `_ajouterWaypointVisuel` → classe `.kta-iti-wp-done` + ✓ au lieu du numéro (CSS vert `#4caf50`) ; liste modale → ligne `.kta-iti-wp-row-done` rayée.

**Exclusions du calcul** : les étapes `done` sont exclues PARTOUT — replan auto, bouton « Recalculer » de la modale (`wpsCalc = _itineraryWaypoints.filter(!done)`), compte de pauses (`_majLabelDistanceItineraire` + statut modale), et `getItineraireWaypoints()` (vibration proximité — filtre aussi l'origine tracker, sinon vibration parasite à chaque replan).

**À NE PAS faire** :
- ❌ Valider sur le recalage clic carte (approximatif par nature — seul le `"point"` exact valide).
- ❌ Réordonner les étapes restantes (TSP « plus proche d'abord ») — l'ordre planifié est un choix utilisateur (3:a). Une option V2 éventuelle, jamais un défaut.
- ❌ Retirer les étapes done de `road.waypoints` — elles portent la progression (persistance + rendu ✓) ; on les exclut du CALCUL, pas de la donnée.
- ❌ Recalculer sans débounce (recalages en rafale = Dijkstras 1-3 s empilés).

---

## 🌀 Multi-hop + refonte du déroulé (v1.64.0)

> Décisions KARMA `1:a 2:a 3:a 4:a` + case à cocher (5) + « prendre le portail n'a pas de sens, on n'est pas à côté » + « plusieurs points de passage sur le plan A ».

**Moteur multi-hop** (`interPlanRoute.js > _computeMultiHop`) — actif quand la case « 🌀 Itinéraire via plusieurs plans » est cochée (`myktamap_ipr_multihop_v1`, OFF par défaut ; exposée dans la recherche multi-plans via `InterPlanRoute.is/setMultiHopEnabled`) :
- **Graphe de portails** : nœuds `@start` (position) + chaque CÔTÉ de portail + `@dest` ; arêtes de traversée à 0 m ; arêtes intra-plan **PARESSEUSES** — le coût (`coutM` : Dijkstra réel via `_legEntre`, en MÈTRES par échelle du plan, mémoïsé `legCache`) n'est calculé qu'à l'expansion du nœud. Le Dijkstra global couvre AUSSI le cas direct → case cochée = `_computeMultiHop` remplace entièrement le single-hop.
- **Périmètre** : plans sur un chemin BFS `dFrom + dTo ≤ MAX_HOPS (3)` uniquement ; `MAX_PORTALS_PER_PAIR = 5` par frontière ; budget `MAX_LEGS_COMPUTE = 60` Dijkstras (signalé si atteint : `ipr.err.budget`). Plans injoignables → écartés + nommés (`ipr.err.blocked`) si aucun chemin ne survit. Adjacence via `InterPlanLinks.getAllLinks()` (registre ; les liaisons baked des datalayers n'y sont pas — même périmètre que le single-hop).
- **Format unique « chaîne de legs »** : `{ legs: [{planId, planName, path, distM, waypoints, portalOut}], totalM, dest }` — le single-hop est adapté via `_chainDepuisSingleHop`. UN SEUL renderer (`_afficherResume`) et UN SEUL consommateur (`onPlanLoaded`).

**Déroulé temps réel** :
- Résumé → « 🗺️ C'est parti » : trace le leg du plan courant, arme `_pendingChain` (file des legs restants) + `_currentPortalOut` — **AUCUNE téléportation**.
- Traversée quand l'user est AU portail : invite flottante « 🌀 Portail suivant (dist) » (`kta-ipr-next-float`, persistante, fermable) · bouton ➜ du popup · « 📍 Je suis ici » sur le point-portail → `InterPlanRoute.onTrackerRecale` (2e consommateur du hook `tracking.js > _notifierRecalage`) re-propose l'invite.
- Chaque arrivée (`onPlanLoaded`, +3 s post-restore) : trace le leg du plan, ré-arme l'invite suivante — zéro ressaisie sur toute la chaîne.

**Étapes plan A** : `computeEtAfficher(dest, { viaWaypoints })` — les waypoints non-done de la modale Itinéraire deviennent des points de passage OBLIGATOIRES du premier leg (ordre planifié, `_viaWps` intercalés dans `computeRoute`/arête `@start`) ET dans les `waypoints` du tracé → la validation d'étapes + le replan (itinéraire vivant v1.61.0) marchent dessus gratuitement.

**À NE PAS faire** :
- ❌ Rebrancher un bouton de traversée dans le résumé de CALCUL (l'user n'est pas au portail — c'est le bug UX d'origine).
- ❌ Évaluer les arêtes intra-plan en EAGER (produit portails × plans = explosion ; la paresse fait tenir le cas typique en ~5-15 Dijkstras).
- ❌ Sommer des px inter-plans — toujours `distM = px / scale` PAR plan (inchangé depuis A6).

---

## 🕸️ Vue « réseau de plans » (v1.65.0 — A7)

> Reco KARMA 1:a 2:a 3:a 4:a. Module de RENDU PUR — aucune donnée nouvelle.

**`js/planNetwork.js`** (`window.PlanNetwork.render(containerEl, { onOpenPlan, onEdgeClick })`) :
- Données : `PlanRegistry.getAll()` (nœuds) + `InterPlanLinks.getAllLinks()` (arêtes agrégées par frontière). Plan référencé par une liaison mais absent du registre → nœud FANTÔME ⛔ (nom du snapshot, non cliquable). Plans sans liaison → bande dédiée en bas (`ISO_TITLE_H`/`ISO_ROW_H`, multi-rangées — la hauteur SVG compte TOUTES les rangées, bug de chevauchement titre/pastille corrigé pendant la release).
- Rendu : SVG vanilla (`createElementNS`), layout force PRÉCALCULÉ (150 itérations, init déterministe en cercle — pas de `Math.random`, rendu stable ; répulsion + ressorts `SPRING_LEN 150` + gravité centre + refroidissement linéaire). AUCUNE animation continue. Drag des nœuds via pointer events (seuil 6 px sépare drag et clic ; les arêtes connectées suivent en direct).
- Intégration : gestionnaire `interPlanLinks.js > ouvrirGestionnaire` — toggle 📋 Liste ⇄ 🕸️ Graphe ; clic nœud → `goTo(planId, anchorSide|null, {confirm si plan chargé})` (ancre = premier côté de liaison du plan) ; clic arête → liste filtrée par `_filterPair` + chip ✕.
- ⚠️ `goTo` accepte `target = null` depuis v1.65.0 (plan isolé → switch sans cible pendante ni pan) — ne pas re-supposer target non-nul dans goTo/consume.

---

## 🧹 Purge des flottants de navigation (v1.67.1 — hooks onPlanExit)

> Audit KARMA « fermetures à la sortie du plan » : 4 résidus (mini-pastille ↩️, invite 🌀, pile périmée au switch direct, boussole) — seuls les chemins goTo nettoyaient.

- `InterPlanLinks.onPlanExit(ctx)` + `InterPlanRoute.onPlanExit(ctx)`, appelés par `main.js > _quitterNavigationInterPlans` : retour à l'accueil (`afficherLoader`, démontage `"accueil"` compris) → ctx `"home"` · changement de plan (`_libererRessourcesPlanPrecedent()`) → ctx `"switch"`.
- ⚠️ **Subtilités à ne pas casser** : ① côté liaison, le hook "switch" est **no-op si `_pendingTarget` existe** (= goTo en cours qui gère déjà bouton + pile ; sans ce garde, tout saut de portail perdrait son bouton Retour). ② côté route, la **chaîne multi-hop (`_pendingChain`) survit au "switch"** — c'est elle qui trace les legs aux arrivées ; elle n'est abandonnée qu'au retour HOME. ③ Tout NOUVEAU flottant de navigation doit s'enregistrer dans un de ces hooks (ou avoir un timer d'expiration).

---

## ⛔ Ce qui contraint réellement l'itinéraire — et la case pour le suspendre (v1.82.0)

État établi en lisant `pathfinder.js`, parce que la question revient et que le
code disait le contraire de ses propres commentaires.

| Contrainte | Source | Nature | Réglable |
|---|---|---|---|
| Zones d'un type dur (`Pathfinder.TYPES_ZONES_DURS` : `inaccessible`) | session + `_ktaDataPolygons` | **dure**, jamais relâchée | ✅ case « Respecter… » |
| Structures `mur-ligne` (Mur (ligne)) | session + `_ktaDataStructurePolygons` | **dure**, même niveau | ✅ même case |
| Zones à coût (`Pathfinder.TYPES_ZONES_COUT` : `remblais` « Comblé », `effondrement`) | session + `_ktaDataPolygons` | **coût**, jamais bloquantes, jamais levées | sans objet (toujours actif, ni case ni passe 2) |
| Masse au sol (`masse-sol`) | session + `_ktaDataPolygons` | **coût selon le vide**, **coupée** sous 0,5 m, jamais levée | sans objet ; brancard : sous 1,8 m évitée |
| Autres types de zones | idem | souple (relâchée en passe 2) | ✅ cases « 🚫 Préférences d'évitement » |
| Points / tags à éviter | `SearchPoints` | souple | ✅ |
| **Autres structures** (piliers, mur polygone, fronts, arc de soutènement `arc`) | — | **aucune** | sans objet |

🩸 **Une seule structure bloque : le mur en ligne** (§31.1 bis). Les autres ne sont ni
arêtes ni obstacles ; ne pas les y ajouter « par cohérence » (décision produit : un
pilier ou un front levé n'est pas une paroi continue).

🩸 **Le graphe se construit UNIQUEMENT sur les `roads`** (`getRoads` +
`getAllEmbeddedRoads`). Conséquence sur un plan importé dont tout le relevé est
parti en structures : **aucun itinéraire n'est possible**, pas même dégradé.
C'est ce qui motive le reclassement d'objet (cf. `session-data.md`).

### La case « Respecter les zones inaccessibles et les murs (ligne) »

Les zones `inaccessible` et les murs en ligne sont les **seules** contraintes que le
moteur ne relâche jamais — même la passe 2 les garde. Sur un relevé encore incomplet,
un objet typé par erreur ferme donc un passage réel, sans recours.

`computeRoute(waypoints, { respecterInaccessibles: false })` les suspend **ensemble**
(le nom de l'option est historique). Case
dans la section « 🚫 Préférences d'évitement », **cochée par défaut**, persistée
avec les autres préférences (`respecterInaccessibles !== false` : une préférence
enregistrée avant cette version n'a pas le champ et garde le comportement
historique).

⚠️ **Volontairement limité à `computeRoute`.** `computeReachable` (Mode Secours /
Perdu) garde les zones inaccessibles et les murs en toutes circonstances : une préférence de
confort n'a pas à élargir un périmètre de secours. `interPlanRoute` et la Sortie
d'urgence lancée par 🚨 ne passent pas l'option — ils héritent du comportement sûr.
**Seule exception : « 🚑 Évacuer » du Mode Secours** (options brancard) — l'opérateur
choisit les types de zones à éviter (eau cochée d'office ; Comblé et effondrement n'y sont pas, toujours évités par leur coût ;
`brancard: true` évite d'office la masse au sol qui laisse moins de 1,8 m de vide) et peut lever les
inaccessibles et les murs par une case **décochée par défaut** (dernier recours, nommé comme
tel ; son compte = `Pathfinder.nbObstaclesDurs()`).
Les contraintes vont `SortieUrgence.declencherDepuis(…, { contraintes })` → classement des
sorties → `itineraireYAller(…, { evacuation })` → `road.evacuation`, relu par les recalculs
(`_replanifierDepuis`, `SortieUrgence.relancerDepuis`). Une sortie atteinte seulement en
traversant une zone « à éviter » (passe 2 du moteur) est classée après celles qui la
respectent, et la fenêtre le dit ; de même, une sortie atteinte seulement à travers une zone à coût est classée après
celles qui l'évitent (`sortieUrgence.js > _traverseZoneCout`), et la fenêtre affiche la phrase du pathfinder.

### Zones à coût : Comblé et effondrement (jamais bloquantes)

Décision de KARMA (révision du 14/11/2026, `docs/ETUDE_REMBLAIS.md`) : une zone mal comprise ou posée à tort ne doit
jamais casser un itinéraire, et un tracé posé exprès à travers dit que ça passe. `pathfinder.js > TYPES_ZONES_COUT`
(`remblais`, `effondrement` ; `Pathfinder.estZoneCout`) est la **seule** table de ces types.

- **Coût, pas obstacle** : chaque arête porte `{ weight: coût, len: longueur }`. `_addEdge` mesure la longueur de
  l'arête **dans** chaque zone à coût de son niveau (`_coutZonesArete` : `_zonesQuiBloquent` puis
  `_longueurDansPolygone`, grille `graph.zonesCout` posée par `_buildGraph`) et ajoute `PENALITE_ZONE_COUT` (10⁶)
  par pixel traversé. Toutes les arêtes passent par là (build, croisements, T, chaînage, calage), le niveau du segment
  connu ou déduit des nœuds ; une arête de puits ou de milieu de jonction (en l'air) ne paie rien, une arête qui touche
  seulement le bord non plus. Effet : **tout autre chemin l'emporte** (un détour 10⁶ fois plus long que la traversée),
  mais le coût reste fini — sans autre chemin, l'itinéraire passe.
- **Tolérance d'1 m** (décision produit, `TOLERANCE_ZONE_COUT_M`, exposée `Pathfinder.controle.toleranceZonePx` /
  `traverseesTrace`) : une traversée **continue** d'un tracé dans une zone à coût de moins d'1 m (à l'échelle du plan,
  celle du réseau en inter-plans) est ignorée — ni pénalité, ni mention, ni C12 : c'est un contour dessiné un peu
  large. `_buildGraph` mesure les traversées par tracé (`_traverseesTrace` : la traversée se poursuit tant que le
  sommet commun est dans la zone) et garde les segments des traversées courtes (`graph.zonesCout.courtes`) ;
  `_coutZonesArete` exempte une arête dont un point intérieur (`_pointInterieur`, coupé aux intersections du
  contour) est sur l'un d'eux. 🩸 Jamais par arête : un tracé dense découperait une longue traversée en arêtes de
  quelques pixels, toutes sous le seuil. Sans échelle du plan : aucune tolérance (repli strict). Même seuil pour
  l'itinéraire, la sortie d'urgence, l'inter-plans et C12 (`verifierPlan.js > _c12`).
- 🩸 **Le coût n'est pas la distance** : `_dijkstra` ordonne sur le coût et suit la longueur à côté (`lg`) ;
  `totalDistance` = la vraie longueur, `cout` = le coût. Sans zone à coût, ce sont les mêmes additions dans le même
  ordre : chemins et distances inchangés au bit près. `computeReachable` (Secours / Perdu) n'en a pas : le périmètre
  d'une personne ne rétrécit pas pour une zone qu'on peut traverser.
- **Le résultat le dit** : `zonesTraversees` (`[{ type, longueurPx, objet }]`, la plus traversée d'abord) ;
  `Pathfinder.texteZonesTraversees(zones, echelle?)` rend la phrase unique (`iti.zonesCout.traverse`, libellés de la
  légende) affichée par la fenêtre Itinéraire (`kta-iti-zones-cout`), le toast de « Y aller » (sortie d'urgence tracée
  comprise), la fenêtre de la sortie d'urgence (`kta-sortie-zones-cout`), le résumé de l'inter-plans et le toast de
  l'itinéraire d'une équipe du Secours.
- **Jamais levées** : ni par la case « Respecter… » (qui ne vise que les contraintes dures), ni en passe 2, ni au
  brancard ; elles ne sont pas des « Zones à éviter ». Inter-plans : `computeRouteOnRoads(…, { zones })` applique la
  même règle, et le choix du portail se fait au coût.
- Garde-fous : `scripts/check-zones-cout.js` (Node), `scripts/smoke/checkup-comble-itineraire.js` (relevé fictif).

### Masse au sol : coût selon le vide

Décision de KARMA (QCM du 11/11/2026, `docs/ETUDE_REMBLAIS.md` § 8 et 11, lot 6). `pathfinder.js > _coutMasseSegment`.

- **Règle** : la longueur parcourue dans une masse au sol coûte selon le **vide** = hauteur du niveau − sol local.
  Vide ≥ 1,8 m : ×1 (debout) ; 1 à 1,8 m : ×1,5 (courbé) ; 0,5 à 1 m : ×3 (ramper) ; **sous 0,5 m : passage coupé**,
  pour tous (ni la case « Respecter… » ni la passe 2 ne le lèvent). Sol abaissé (part < 0) : ×1. Mêmes seuils que la
  vue 3D (`vue3d.js > MASSE`) ; `Pathfinder.MASSE_VIDE`, `Pathfinder.facteurVide(v)`.
- **Sol local** : `masseSol.js > masseCarte(zone)` construit la masse par `masse(…)` (hauteur du niveau via
  `ktaMetresComble` ; pleine hauteur sans rampe, pentes des rampes avec leur fin), puis
  `sol(m, x / sc, y / sc)` — la fonction de hauteur de la 3D et de la fiche, jamais une copie.
  Plusieurs masses sous un point : le plus haut des remblais compte (comme `vue3d.js > _solMasse`). Construite à la
  première arête qui touche la zone, puis gardée en cache par contour (`_cacheMasses`, clé part / niveau / hauteur /
  rendu / échelle, vidé à chaque `kta:donneesPlanChange`) : la sortie d'urgence enchaîne jusqu'à
  15 calculs. Sans échelle du plan : aucune masse ne compte.
- **Point par point** : chaque arête est coupée aux contours des masses de son niveau, puis chaque morceau intérieur
  est échantillonné tous les `PAS_MASSE_M` (0,1 m) ; les pentes des rampes sont donc suivies, jamais une moyenne de
  la zone. Une arête qui touche un passage sous 0,5 m n'est pas posée (`_addEdge`) ; un morceau découpé hors du
  passage bas (croisement, calage) garde la sienne : on avance jusqu'au bord, pas au travers.
- **Coût, pas distance** : le surcoût s'ajoute à `weight`, jamais à `len` — `totalDistance` reste la vraie longueur,
  `cout` la compte. Un détour gagne quand il coûte moins (ex. ¾ d'une galerie de 2 m sur 10 m : 10 m × 3 = 30 m).
  Sortie d'urgence et itinéraire d'un plan ouvert (`computeRoute`) suivent ; la sortie d'urgence classe toujours par
  distance. `computeReachable` (Secours / Perdu) ne les compte pas (même raison que les zones à coût).
- **Brancard** (`computeRoute(…, { brancard: true })`, posé par « 🚑 Évacuer » : `secoursMode.js >
  _demanderOptionsBrancard` → `contraintes.brancard`, relu par `sortieUrgence.js` et `interfaceItineraire.js >
  _optsEvitement`) : la longueur sous 1,8 m de vide pèse aussi `PENALITE_ZONE_COUT` par pixel (évitée dès qu'un autre
  chemin existe, jamais bloquante, sauf la coupure sous 0,5 m) ; à 1,8 m ou plus, elle passe normalement.
- **Inter-plans** (`computeRouteOnRoads(…, { zones, echelle })`) : le plan distant n'est pas chargé (ni ses
  structures, ni ses hauteurs). Estimation prudente : bords tous fermés (sol = part × hauteur partout) et hauteur de
  2 m (`_massesReseau`). Le plan ouvert passe par `computeRoute`, donc par la vraie sonde.
- **Guidage** : le temps restant compte le ralentissement (`Pathfinder.surcoutMasseTrajet(points)` → cumul en px par
  point, sans le brancard ; `itiGuidage.js > _surcoutApres`, ajouté à la distance avant `getItiTempsMinutes`) ; la
  distance affichée ne change pas. La consigne « ramper sur ~X m » n'est pas faite (décision 8 b, plus tard).
- **Fenêtre Itinéraire** (`interfaceItineraire.js > _masseTrajetM`, `_ligneMasseTrajet`) : `Pathfinder.resumeMasseTrajet(points)`
  (même mesure que le guidage → `{ extraPx, courbePx, ramperPx }`) donne la phrase « Passe par une masse au sol :
  courbé / à plat ventre sur ~X m » (`iti.masse.*`, au-delà de 0,5 m) et le temps estimé (distance + ralentissement,
  aussi au changement de vitesse : `data-extram` du bloc d'état) ; la distance affichée reste la vraie. Le libellé de
  distance posé sur la carte garde le temps de la distance.
- **Sortie d'urgence** (décision produit) : classée au **temps** de parcours (`sortieUrgence.js` : `tempsPx` =
  distance + `resumeMasseTrajet(path).extraPx`), après les critères existants (atteignable, entière, sans zone à
  coût) ; une sortie plus proche derrière une masse où l'on rampe passe après une sortie un peu plus loin, debout.
  La distance affichée reste la vraie.
- Garde-fous : `scripts/check-zones-cout.js` § 10 (¼ ½ ¾ à la main, coupure, détour, brancard, sortie d'urgence, sol
  abaissé, talus, inter-plans, guidage, zones à coût inchangées), `scripts/smoke/checkup-comble-itineraire.js`
  (masse-sol, vrais registres).

### Table unique des types de zone durs

`pathfinder.js > TYPES_ZONES_DURS` (exposée `Pathfinder.TYPES_ZONES_DURS`, test `Pathfinder.estZoneDure(type)`) est la
**seule** liste des types de zone qui bloquent : collecte des obstacles (`_zonesDuresDe`), liste des évitables
(`getAvoidableZoneTypes`, un type dur n'y figure pas), évitements souples (`_collecterZonesAEviter`), réseau fourni de
l'inter-plans (`computeRouteOnRoads`) et ses deux filtres d'évitement (`interPlanRoute.js > _zoneDure`), « Vérifier
le plan ». Elle ne contient que `inaccessible` (décision produit : seule zone posée exprès pour dire « interdit ») ; Comblé
et effondrement sont des zones à coût (ci-dessus). `check-verifier-plan.js` refuse un test `=== "inaccessible"` écrit
à part dans `pathfinder.js` ou `interPlanRoute.js`, `check-zones-cout.js` un test sur `remblais` / `effondrement`.

### Vérifier le plan (`js/verifierPlan.js`)

Contrôle des données du plan ouvert, lancé depuis la carte de l'Éditeur de données (UI : `ui.md` §91.6 ; étude et
décisions : `docs/ETUDE_VERIFIER_PLAN.md`). Il lit ce que lit l'itinéraire : `Pathfinder.collecterTraces()`, zones et
structures de session plus registres des calques (sans les calques en modification), points de session et des calques,
plus les dimensions de l'image et `availableLevels`. Il n'écrit que sur un geste : **Raccorder** (C5, l'écriture de
`raccordsTraces.js`), les **corrections sûres** et la **galerie condamnée** (§ Corrections ci-dessous). Un objet de
calque est listé comme un autre.

⚠️ **Même vérité que le graphe** : C1, C3 et C12 appellent les tests du pathfinder, exposés pour lui dans
`Pathfinder.controle`, jamais une copie ; de même C5 appelle `KtaRaccords.detecter`, C9 `ktaResolveStyle`, C10
`ktaDedupliquerFichier` (`tableEditor.js`, exposé pour lui). `_segmentBloqueParZoneInaccess` et
`_segmentCoupeParMur` sont des façades de `_zonesQuiBloquent` / `_mursQuiCoupent` (qui rendent **tous** les obstacles d'un segment quand on le demande) : le
graphe et l'outil passent par le même code. `check-verifier-plan.js` vérifie, tracé par tracé, que les segments
déclarés coupés sont exactement ceux que `grapheDeTraces(…, { includeZones: true })` écarte.

| Contrôle | Règle | Gravité |
|---|---|---|
| **C1** tracé coupé | Chaque segment de galerie (tout type sauf jonction et itinéraire) contre les obstacles durs de son niveau (plan ouvert : `controle.obstaclesDuPlan`, la collecte même de l'itinéraire ; données fournies : `obstaclesDe` ; puis `preparer`), zones candidates par une grille de leurs boîtes (`controle.grilleZones`, 128 px, filtre exact). Un constat par paire (tracé, obstacle) ; zone : longueur du tracé dans la zone (`longueurDansPolygone`) ; mur : point de croisement. **Au bord** sous 0,5 m (`BORD_M` ; plan sans échelle : 10 px/m supposés, `ECHELLE_SANS_CALAGE`) : longueur dans la zone, ou distance du croisement au bout du tracé le plus proche. Obstacle marqué **galerie condamnée** (`condamne: true`) : paire retirée par `_c1` (l'avertissement à la saisie aussi), l'obstacle bloque toujours l'itinéraire | Bloquant |
| **C2** passage sans raccord | POI qui relie des niveaux (`KtaPoiJonction.estJonction`) avec un moyen de passage (pas le puits d'aération) : pour chaque niveau, aucun raccord validé (`accroches`), ou aucun qui retombe à `PROXIMITY_TOLERANCE` (15 px) d'une galerie de ce niveau (« perdu », comme `_injecterJonctionsPoi` qui l'ignore). Le nombre de galeries que `proposerRaccords` proposerait est affiché | Bloquant au niveau de départ ou d'arrivée ; **Info** pour un niveau intermédiaire sans raccord, marqué « traversé » (le pathfinder le traverse sans y déboucher : l'itinéraire n'est pas trompé, décision produit) |
| **C3** tracé jonction mal posé | `fromLevel` = `toLevel`, ou un bout à plus de `PROXIMITY_TOLERANCE` de toute galerie de son niveau (le graphe ne le raccroche à rien) | Bloquant |
| **C12** tracé qui traverse une zone Comblé ou effondrée | Même parcours que C1 (`_traversees`), sur les zones à coût que lit le graphe (`controle.zonesCoutDuPlan` / `zonesCoutDe`) : un constat par paire, longueur dans la zone, « au bord » sous 0,5 m. Ce n'est pas une erreur : l'itinéraire l'évite s'il peut et dit quand il y passe ; on confirme la galerie ou on corrige la zone (décision produit) | À revoir |
| **C4** objets en double | Même famille, même type, même niveau (`level`, `niveaux`, bouts d'une jonction), même géométrie au **cm** près (échelle du plan, sinon 10 px/m) ; contour fermé : départ et sens quelconques ; point : même position, même tag, même nom. Table de hachage des empreintes, un constat par groupe (clé `C4|uid|uid…` triés). `identiques` : égaux en tout hors `uid`, `updatedAt`, `id`, `layerId`, champs `_…` et champs d'affichage des registres de calque (`polygon`, `origOpacity`, `origFillOpacity`) ; 🩸 la comparaison (`_stable`) ne descend que dans les tableaux et les objets simples, cycles gardés : une couche Leaflet compte comme un jeton fixe (deux doublons d'un calque faisaient déborder la pile). 🩸 Arrondi : deux copies de part et d'autre d'une frontière (écart < 1 cm) ne sont pas vues. Les deux morceaux d'un ✂️ (`ajusterSommets.js > _couper`) partagent un sommet mais pas leur géométrie : jamais en double | À revoir |
| **C5** écart du réseau | `KtaRaccords.detecter()` tel quel (plan ouvert seulement). Bandeau : **Raccorder** (`KtaRaccords.raccorder`, son historique et le rapatriement d'un calque) ; **Vu, normal** = `KtaRaccords.ignorer` (une seule mémoire, celle de la carte Raccords, qui reste, décision 10a) | À revoir |
| **C6** contour fermé dégénéré ou qui se recoupe | Zones, et structures dont le type n'est pas linéaire (`isStructurePolylineType`). Sommets consécutifs égaux et fermeture écrite retirés ; **dégénéré** : moins de 3 sommets distincts ou tous alignés (🩸 pas l'aire signée : un nœud papillon symétrique en a une nulle, il se recoupe) ; **se recoupe** : deux arêtes non voisines qui se croisent ou se touchent, arêtes triées en x puis balayées (20 000 sommets : ~50 ms) | À revoir |
| **C7** hors de l'image | Un sommet (ou le point) au-delà de `[0, imageWidth] × [0, imageHeight]` de plus de 0,5 m : « dehors » (tout) ou « déborde » | Info |
| **C8** niveau inconnu | Plan multi-niveau : `level` (absent = 0), bouts d'un tracé jonction, `niveaux` d'une zone (chacun compte) ou d'un point qui relie des niveaux (`KtaPoiJonction.porteNiveaux`) ; valeur non entière (« invalide ») ou absente d'`availableLevels` (« inconnu »). Un constat par (objet, valeur). 🩸 `main.js > _etendreAvailableLevelsSiBesoin` étend le sélecteur au chargement : « inconnu » ne vit que pour un objet arrivé après l'ouverture (import, synchro), « invalide » reste | À revoir |
| **C9** type absent de la légende | `ktaResolveStyle(cat, type, { flat: true })` nul (ni built-in, ni type perso de **la même** catégorie), ou objet sans type ; point : tag absent de `window._iconMap` (plan ouvert) | Info |
| **C10** sommets en double | `ktaDedupliquerFichier` sur une enveloppe `{ famille: [{ type, points }] }` de chaque objet : compte seul ; « disparaîtrait » si le nettoyage le faisait passer sous son minimum. Correction : la même fonction sur l'objet de session (§ Corrections) ; la carte Dédoublonner (fichiers) reste | Info |

**C11** (liaison vers un plan absent) n'est pas un contrôle de la liste : le pied de la fenêtre compte les liaisons
du plan dont l'autre plan n'est pas sur l'appareil (`liaisonsAbsentes()`, `InterPlanLinks.getLinksForPlan` +
`PlanRegistry.findById`) et **Voir les liaisons** ouvre le gestionnaire (`InterPlanLinks.ouvrirGestionnaire`).

**Coût** (passe complète, `analyser()`) : relevé fictif des checkups (~270 objets) 5 à 6 ms ; données fictives de
19 834 objets (5 500 piliers, 10 000 tracés, 1 000 zones, 3 334 points) ~3,2 s en Node, dont ~2,5 s pour C5
(`KtaRaccords.detecter`, inchangé) et ~0,35 s pour C4, C6 à C10. La passe au chargement (lot 4) se limite à C1–C3.
🩸 **C5 est gardé en cache** (`verifierPlan.js > _detecterC5`) : `detecter` n'est relancé que si la signature de ce
qu'il lit change — tracés (session et calques, tous leurs champs, sommets au millième de px), points (jonctions du
graphe), échelle, multi-niveau, plan ouvert ; remis à zéro à la fermeture du plan. Rouvrir la fenêtre, Précédent /
Suivant, « Vu, normal » ne le relancent pas. Signature relue à chaque passe plutôt que `kta:donneesPlanChange`
(un indice, pas une preuve) : ~6 ms sur les 19 834 objets (Node hors bac à sable). Ignorés : une clé ajoutée est
retirée du résultat gardé ; une clé retirée (Réafficher) recalcule si le résultat gardé la contenait déjà comme
ignorée. Seulement pour le plan ouvert : des données passées à `analyser(donnees)` ne sont jamais servies par le
cache. C10 (~40 ms sur le même jeu) n'en a pas besoin. Éprouvé par `check-verifier-plan.js` §13 bis (compte des
appels, 3 falsifications) et le checkup (2 ouvertures = 1 appel, modification = 2, « Vu, normal » = 0 de plus).

C2, C3 et C8 ne valent qu'en plan multi-niveau. **Vu, normal** : clé `contrôle|identité[|identité|détail]`
(identité = `uid`, sinon empreinte du type et des sommets au dixième de px) dans la pref du plan `verifVus` (`config.js >
get/setPlanVerifVus`), sur l'appareil seulement. Modifier l'objet ne fait pas revenir le constat ; 🩸 un objet de
calque sans `uid` revient s'il est redessiné. **Saisie** : à chaque `kta:donneesPlanChange` (tracés, zones,
structures, calques ; 700 ms de calme), C1 sur les seuls objets de session dont la signature a changé **et** dont
`updatedAt` a moins d'une minute (la session restaurée ou rejouée par Ctrl+Z n'est pas une saisie) : un toast `warn`
par coupure nouvelle, une fois par plan ouvert. Pas encore : avertissement à la saisie pour C12.

#### Corrections (`verifierPlan.js` § Corrections)

Seulement sur un geste, seulement quand elles sont sûres (décisions 7a, 9a) :

| Contrôle | Correction | Bouton du bandeau / de la liste |
|---|---|---|
| **C4** identiques en tout | Garder un exemplaire : le plus ancien (`updatedAt`) reste, les autres partent. Les exemplaires sont relus au geste (identités de la clé du constat, `_contenu` revérifié) : une copie modifiée entre-temps annule tout | **Garder un exemplaire** · **Garder un exemplaire de chacun (N)** |
| **C6** dégénéré | Suppression de l'objet ; un contour **qui se recoupe** n'est jamais corrigé | **Supprimer le contour** · **Supprimer les contours dégénérés (N)** |
| **C10** | `ktaDedupliquerFichier` appliqué à l'objet de session (rampes d'une masse au sol suivies) ; essayé d'abord sur une copie : un objet que le nettoyage ferait passer sous son minimum devient une **suppression** | **Retirer les sommets en double** · **Retirer tous les sommets en double (N)** |
| **C1** | Galerie condamnée : `condamne: true` posé sur l'obstacle (zone inaccessible ou mur en ligne) ; **Galeries condamnées (N)** au pied de la liste, **Retirer** l'enlève | **Galerie condamnée** |

⚠️ **Un chemin d'écriture, une entrée ⏪ par geste** (`_ecrire`, `_marquerCondamne`) : `captureState()` (toutes
familles ; une seule pour la galerie condamnée) → mutation → `KtaUid.touch` des objets modifiés → rendu par
`setRoads` / `setZones` / `setStructures` / `setEditorPoints` → `HistoryManager.record` (une fois, hors des boucles ;
il pose les traces de suppression, ordinaires ou de copie de calque) → `SessionPersist.save`. Un point retiré fige
la fiche de ses photos (`MyKTAMapPhotos.majFichesPoints`). Le bouton « tout » relit la liste sur le plan tel qu'il
est et corrige tous les constats corrigibles du contrôle en un seul geste (50 doublons = une confirmation, une
consultation de la prise, une entrée ⏪).

🔒 **Suppression** : confirmation chiffrée (`ktaConfirm`, filet des actions destructives, `check-filets-donnees.js`),
puis la prise `KtaExtensions.suppressionLot(plan, [{ famille, uid }])` — celle de la sélection multiple : sur un
plan partagé, l'installation refuse sans le droit « gérer » au-delà de son seuil d'objets d'autres membres ; refus =
message (celui de l'installation, sinon `verif.corr.refus`), rien n'est supprimé. Les opérations sont recalculées
après les questions (une synchro a pu passer) ; un objet disparu = rien n'est écrit (`verif.corr.change`).

**Qui est corrigé** (`_origine`, `_plan`) : objet de session ; objet d'un calque **rapatriable** (calque du plan
avec un fichier, pas `editor`) après son passage en session (`FilterPanel.rapatrierCalque`, la question de
« 🔄 Modifier » ; refus = rien), retrouvé par uid sinon par géométrie (`_srcCalque`). Jamais corrigés, mais
affichés avec la raison dans le bandeau : plan en lecture seule (`ktaEditionRefusee`), calque sans fichier,
exemplaires **mêlés** (dessinés ici et venus d'un calque, même rapatrié) — décision à prendre. 🩸 Les morceaux d'un
✂️ partagent un sommet mais ni leur géométrie ni un sommet consécutif répété : jamais en double, jamais en C10.

**Galerie condamnée** : champ neutre `condamne: true` sur la zone ou le mur en ligne (décision 6c : une galerie
condamnée est une donnée du plan ; « Vu, normal » reste un avis sur l'appareil). Il suit la session, la synchro et la
fusion par uid tels quels ; là où les objets sont recopiés champ par champ, il est transporté : registres des
calques et `getAllEmbeddedZones` / `getAllEmbeddedStructures` (`utils.js`), KMZ (`mkm:condamne`, `kmzExport.js` /
`kmzImport.js`), GeoJSON (propriété `condamne`) et import SIG (`sigImport.js > condamneDe`). Pas d'entrée de
légende, rien dans le pathfinder : il ne fait que taire C1 (C12 l'ignore).

Garde-fous : `check-verifier-plan.js` (Node : une falsification par contrôle C4 à C10, doublons d'un calque, galerie
condamnée contre le graphe, corrections et leurs 8 falsifications), `check-filets-donnees.js` (ordre instantané →
mutation → entrée ⏪ unique, confirmation → prise → écriture), `checkup-verifier-plan.js`.

**Passe légère** (`js/verifierPlanAuto.js`, décisions 3c et 4a de l'étude) : les **bloquants seuls**, comptés par
`KtaVerifierPlan.bloquants` = `{ C1, C2, C3 }` (les fonctions de la liste, exposées pour elle : un filtre ajouté dans
`_c1` vaut pour les deux), gravité `bloquant` seulement (un niveau traversé de C2 est « info »). Clés gardées ; les
« Vu, normal » sont retirés **à la lecture** (`nombre()`), donc la pastille baisse dès qu'on en marque un.
- **Quand** : à `mktm:plan-pret` (session restaurée), après la fermeture du splash (`KtaSplash.surFermeture`), deux
  images et 1,5 s (tuiles et calques), puis au repos (`requestIdleCallback`, 2 s au plus). Par **tranches** : unités
  = galeries (C1), passages entre niveaux (C2), tracés jonction (C3) ; une tranche reçoit les données entières sauf
  la liste découpée, et pour C2 / C3 seulement les galeries des niveaux qu'elle lit (même résultat : `_segmentsNiveau`
  filtre par niveau) ; taille doublée ou divisée pour viser 8 ms, tranches enchaînées dans 12 ms de repos. 🩸 Pendant
  une tranche C2, `KtaPoiJonction.proposerRaccords` est neutralisé (rendu dans `finally`) : il ne sert qu'au texte
  de la liste et parcourt tout le réseau par passage signalé (~17 ms chacun sur 10 000 tracés). 🩸 Une tranche ne
  descend pas sous un objet : un tracé ou un passage démesuré reste d'un bloc. Après une modification
  (`kta:donneesPlanChange`, 2 s de calme), recompte silencieux : la pastille suit, aucun toast (celui de la saisie
  dit déjà une coupure nouvelle).
- **Rendu** : pastille du nombre (`.kta-verif-pastille`) sur la carte Vérifier le plan de l'Éditeur de données et sur
  la tuile Éditeur de données du lanceur Exporter (`interface.js > _creerTile`, `dynamicPastille`). Toast `warn`
  s'il y a des bloquants et que leur nombre diffère du dernier annoncé pour ce plan
  (`localStorage["myktamap_verif_auto_v1"]` = `{ planId: nombre }`, 200 plans au plus, propre à l'appareil : hors
  export du profil) ; 0 bloquant : aucun toast, 0 retenu (un retour des bloquants sera annoncé).
- **Contextes** : urgence (`EmergencyMode`, `SecoursMode` ouvert, `LostMode`) ou plan en lecture seule
  (`ktaEditionRefusee(true)`, plan d'extension en lecture) : pastille seule, rien retenu, le toast viendra à une
  ouverture hors de ces cas. Plan serveur : même passe sur ce que l'app a chargé ; une synchro arrivée ensuite
  recompte (pastille). Kiosque : aucun flag ne la touche (`disableGenerator` retire seulement la passe du
  Générateur, faute de Générateur).
- **Fin du Générateur** (`createConf.js > _genererZip`, après `generateAsync`) : `verifierZip(zip, cfg)` relit les
  calques écrits dans le ZIP (`data/*.json`, après le décalage du rognage : `roads`, `zones` par `ktaZoneLue`,
  `structures`, `data` / `editorPoints` / `points`), même passe sans « Vu, normal », toast `warn` s'il y a des
  bloquants ; le téléchargement et la publication ne l'attendent pas. 🩸 Le graphe et `estJonction` lisent le
  multi-niveau sur `APP_CONFIG` : il prend celui du plan généré le temps du découpage et de chaque tranche
  (synchrone, rendu dans `finally`).
- **Abandon** : exception du moteur, ou plus de 60 s / 20 000 tranches (moteur qui ne rend plus la main entre deux
  tranches) : `console.warn` préfixé `[VerifierPlan]`, ni pastille ni toast, le plan reste utilisable. Une boucle
  sans fin DANS une tranche n'est pas rattrapable ici (C1 à C3 n'en ont pas : parcours bornés des listes).
- **Coût** : relevé fictif des checkups, une tranche, ~3 ms, passe complète au repos ~40 ms ; données fictives de
  20 034 objets multi-niveau (10 000 tracés, 200 jonctions, 5 500 piliers, 300 murs, 1 000 zones, 3 034 points dont
  300 passages) en Node : 581 tranches, la plus longue 33 à 35 ms, ~6,4 s au total (C1 à C3 d'un bloc : ~13 s, dont
  ~10 s de `proposerRaccords`).
- Garde-fous : `check-verifier-plan-auto.js` (pre-commit : mêmes clés qu'`analyser()`, C1 à C3 seulement, jamais
  pendant le splash, abandon, fin du Générateur ; `--cout` : les 20 034 objets, hors pre-commit) ;
  `checkup-verifier-plan-auto.js` (pastilles, un toast, réouverture, urgence, lecture seule, moteur qui lève,
  tâches longues pendant la passe).

---

## 📉 Profondeur des niveaux + profil en long (v1.83.0)

Un niveau n'était qu'un **entier nu**. Aucune altitude nulle part dans le projet —
`kmzExport.js` écrit même `alt = 0` en dur, et le GPX n'émet aucun `<ele>`.

**Référence : la SURFACE**, négatif vers le bas (arbitrage KARMA). Niveau 0 à
**-25 m** par défaut, pas de **5 m**. Une référence *relative au niveau 0* aurait
suffi au profil — qui ne lit que des différences — mais celle-ci porte une
information de plus, gratuitement : un cataphile sait qu'il est à 20 m sous la rue.

### Trois états, et la distinction porte du sens

| État | Signification |
|---|---|
| **absent** | non renseigné — l'état de **tout plan généré avant cette version** |
| **nombre** | profondeur en mètres sous la surface |
| **`null`** | **sans profondeur**, explicitement |

⚠️ Le `null` n'est pas une coquetterie : l'import SIG range le **topo historique au
niveau +1**, qui n'est pas un étage physique au-dessus mais une **convention
d'empilement** pour séparer deux relevés du même endroit. Lui donner une altitude
fausserait tout profil qui le traverse.

Et les plans existants restent **non renseignés**, délibérément : on ne peut pas
deviner la profondeur d'un plan ancien, et l'inventer changerait ses distances en
silence (cf. jonctions 3D ci-dessous).

### Hauteur et écart par niveau — la géométrie verticale

Chaque niveau a un **sol** (la profondeur ci-dessus), une **hauteur de galerie** et un **écart** avec le niveau du
dessus. Ce sont les données que la jonction en pente, les niveaux voisins en 3D et l'entremêlement consomment.

**⚠️ Contrat — un seul accès** : `config.js > getNiveauVertical(niveau, planId)` →
`{ niveau, solM, hauteurM, plafondM, ecartM, sourceHauteur }`. `getPlanNiveauxVerticaux(planId, niveaux?)` rend la
liste du haut vers le bas. Personne ne relit `niveauxProfondeur` / `niveauxHauteur` à la main
(`check-niveaux-verticaux.js` le vérifie pour la hauteur).

| Champ | Sens |
|---|---|
| `solM` | profondeur du sol (= `getProfondeurNiveau`), `null` si non renseignée ou « sans profondeur » |
| `hauteurM` | toujours un nombre > 0 : pref du niveau → ancienne pref unique `hauteurGalerieM` → plan-config → 2 m |
| `plafondM` | `solM + hauteurM`, `null` sans sol |
| `ecartM` | `sol(n + 1) − plafond(n)`, `null` si un des deux sols manque ; **négatif = entremêlé** d'autant |
| `sourceHauteur` | `"pref"`, `"plan"` ou `"defaut"` |

**Une seule vérité verticale : le sol et la hauteur. L'écart n'est jamais stocké** (décision produit). Le
garder à côté des sols ferait deux vérités qui se contredisent ; le stocker à la place des sols ferait bouger les
distances de l'itinéraire à chaque hauteur changée. L'écart est donc une **saisie** : `ecartVersProfondeurs(table,
hauteurs, n, écart)` pose `sol(n) = sol(n + 1) − hauteur(n) − écart` et déplace du même pas les niveaux du dessous
qui ont un sol (leurs écarts sont gardés). Changer une hauteur garde les sols (l'écart du niveau change). Le niveau
du dessus est `n + 1` exactement ; sans sol à `n + 1`, l'écart n'a pas d'appui et son champ est grisé.

**Rétrocompatibilité** : un plan sans `niveauxHauteur` donne 2 m partout, comme avant ; un plan sans sols n'a ni
plafond ni écart ; l'itinéraire lit toujours `getProfondeurNiveau`, inchangé. Plan à un niveau : le niveau `null`
des appelants est rangé sous la clé `"0"`.

**Saisie** — une seule table (`profondeurNiveaux.js > tableHtml / brancherTable / lireTable`), colonnes Sol /
Hauteur / Écart / Sans :
- **Générateur** : sous la case multi-niveau, cinq niveaux proposés (0 à −25 m, 5 m d'un sol au suivant, galeries
  de 2 m, donc écart 3 m), un plan rouvert repris tel quel (`null` et trous compris). Écrit `niveauxProfondeur` et
  `niveauxHauteur` ; plan à un niveau : la hauteur seule, écrite seulement si elle diffère de 2 m.
- **⚙️ Réglages › 📐 Plan › 📉 Niveaux : profondeur et hauteur** (et au bas de la fenêtre 🏗️ Niveaux) : la même
  table. Valider écrit la table des sols en pref (`setPlanProfondeurs`, table entière comme avant) et les hauteurs
  par `setPlanHauteursNiveaux` (seules celles qui diffèrent du plan restent en pref, l'ancienne pref unique est
  retirée). **↺ Valeurs du plan** = `effacerReglagesNiveaux`.
- **Vue 3D** (⛏️ − / +, `reglerHauteur`) et **⛏️ Volume exploité** : `setHauteurNiveau(niveau, m)` sur un plan à un
  niveau seulement. Plan à étages : rien d'autre que Réglages n'écrit la hauteur d'un niveau (⛏️ de la 3D grisé,
  `reglerHauteur` sans effet, champ du Volume exploité de calcul seulement) : la changer recalcule les pentes des jonctions.

**Consommateurs** : la vue 3D prend la hauteur du niveau affiché à l'ouverture et à chaque changement de niveau
(`vue3d.js > _prendreHauteurDuNiveau`, appelé par `_reindexer`) ; ⛏️ Volume exploité celle du niveau mesuré ; la
galerie inclinée d'un tracé jonction (`galerieEmprise.js > pente`, `denivele`) les sols des deux niveaux qu'elle
relie (repli sans sols : une hauteur de galerie et 2 m de roche par niveau franchi, `ROCHE_SANS_SOLS_M` ; avec sols,
l'écart saisi fait foi, négatif compris) et leurs deux hauteurs ; les **niveaux voisins**
de la vue 3D (`vue3d.js > _altitudeVoisin`, même dénivelé) et ses puits, escaliers et échelles, dessinés d'un niveau
à l'autre à leur altitude réelle (`_etenduePassage`) ; l'**entremêlement** (écart négatif) : union des vides des
niveaux montrés dans la tranche commune, structures d'un niveau entremêlé qui arrêtent le pas (`vue3d.js > _entreDe`,
`_niveauxQuiBloquent` ; `tracking.md` § Niveaux entremêlés et zones jonction). **Données incohérentes** (sol d'un niveau au niveau de celui du
dessous ou plus bas, ou deux niveaux qui se chevauchent d'au moins la hauteur de l'un) : signalées sous la table
(`profondeurNiveaux.js > _majIncoherences`, ligne marquée, `role="status"`), jamais bloquantes ; la 3D reste
dessinable (un voisin n'est jamais posé du mauvais côté, une paroi de puits jamais inversée). Preuves : `check-niveaux-verticaux.js` (accès, cascade, saisie de l'écart, sabotage vérifié),
`scripts/smoke/checkup-niveaux-verticaux.js` (Générateur, ZIP relu, ⚙️, téléphone).

### 🩸 Ce que le chantier a corrigé sans qu'on le cherche

**1. Les jonctions étaient mesurées à plat.** `_addEdge` recevait `_dist(prevP, p)`
— la distance **dans le plan** — pour tous les segments, jonctions comprises. Un
puits dessiné sur 3 px entre deux étages distants de 12 m comptait pour **3 px**.
Deux conséquences : les longueurs d'itinéraire multi-niveaux étaient
**sous-comptées**, et Dijkstra préférait **systématiquement** le puits au détour à
plat, parfois à tort.

`_poidsSegment` calcule désormais l'hypoténuse. Le graphe travaille en **pixels
plan** : le dénivelé est converti par l'échelle avant d'être combiné, sinon on
additionnerait des mètres à des pixels. **Sans profondeur renseignée, on retombe au
pixel près sur l'ancien calcul** — c'est ce qui rend le changement sans risque pour
les plans existants.

**Une jonction pèse pareil quel que soit son nombre de points.** Dessinée en N
segments, elle répartit son dénivelé au **prorata de la longueur 2D** de chaque
segment (`_partsDenivJonction(points)` → part `l_i / L`, passée en 5ᵉ argument de
`_poidsSegment`). La somme des hypoténuses vaut alors exactement
`hypot(L, dénivelé)`, dans les deux sens de parcours (le graphe est non orienté :
une arête, un poids). Jonction de longueur 2D nulle → parts égales (`1/N`). Avant
le 10/10/2026, chaque segment comptait le dénivelé **complet** : un puits en
2 segments pesait 680 px au lieu de 520. Tous les consommateurs lisent ce poids
via `totalDistance` (somme des arêtes Dijkstra) : distance affichée en mètres
(`interfaceItineraire`, `interPlanRoute`, `secoursMode`, `tracking`) et zone
atteignable (`computeReachable`, budget sur les mêmes arêtes). Le guidage
(`itiGuidage`) mesure le tracé dessiné en 2D et ne lit pas ce poids.

**Profondeurs et échelle = celles du plan du RÉSEAU, pas du plan ouvert.**
`_poidsSegment(a, b, road, ctxPoids)` reçoit `{ echelle, profondeurs }` via
`_buildGraph` ← `_computeRouteInterne` ← `computeRouteOnRoads(wps, roads, opts)`
(`opts.echelle`, `opts.profondeurs` = `{ "<niveau>": m|null }`). Une table fournie
**fait foi, même vide** (plan cible sans profondeurs → jonctions en 2D) ; le repli
sur `getProfondeurNiveau` / `APP_CONFIG.scale` n'a lieu que **sans** table, c.-à-d.
pour un réseau du plan ouvert (`computeRoute`, affinage du suivi). Côté
inter-plans, `InterPlanLinks.collectRoutingDataForPlan` rend `scale` et
`profondeurs` du plan distant avec la même cascade que le plan ouvert
(préférence per-plan `myktamap_plan_prefs_<id>` > plan-config), et
`interPlanRoute.js` les passe à chaque étape distante (multi-sauts `_ctxPlan` et
étape B directe). Filet : `scripts/check-guidage.js` §13.

**2. `computeRoute` jetait le niveau.** Les nœuds le portent dans le tableau
parallèle `graph.nodeLevels[i]` (`Set<number|"transit">`), mais le retour était un
`{x, y}` plat. `path` porte maintenant `level` : l'entier quand il est **univoque**,
`null` sinon — nœud d'intersection multi-niveaux, ou **milieu de jonction**, qui
n'est à aucun étage mais **entre** deux.

⚠️ Piège payé à l'écriture : les niveaux ne sont **pas** sur le nœud. Une première
rédaction lisait `node.levels` — toujours `undefined`, donc `null` partout, **sans
la moindre erreur**. Le profil serait sorti plat.

### Le profil

`ProfondeurNiveaux.construireProfil(path)` → distance cumulée, altitude, **dénivelé
cumulé** (montée / descente), min/max.

- Les points de niveau indéterminé sont **interpolés** entre les profondeurs connues
  qui les encadrent — c'est exactement ce qu'est un puits.
- Un trou **en bout de chemin** n'est pas interpolable : il reste `null` plutôt que
  d'être extrapolé. C'est le cas du +1 historique, et c'est ce qui empêche le profil
  de mentir.
- Pas d'échelle calibrée → `null`, et l'écran le **dit** au lieu d'afficher un graphe
  vide.

Rendu **SVG** et non canvas : net à tout zoom, imprimable, repères de niveau
sélectionnables — et une centaine de points au plus.

**Prouvé** : 11 cas dans `check-api-surface.js`, falsifiés — retirer l'interpolation
fait tomber le cas du puits, autoriser l'extrapolation fait tomber celui du +1.

## 🩸 Calage d'un point selon son niveau (29/09/2026, audit Secours 4.2)

`_insertVirtualNode` prenait le segment le plus proche en 2D, quel que soit son étage : un point **du −1** cliqué près d'une galerie superposée du 0 s'accrochait au 0 (mesuré sur le plan de test : 39 clics ambigus sur 40). Désormais, si le point porte un niveau (`p.level` entier, plan multi-niveau), le segment le plus proche **de ce niveau** est préféré s'il n'est pas à plus de `NIVEAU_TOLERANCE_PX` (40 px) au-delà du plus proche tous niveaux — au-delà, le niveau du point est probablement faux et l'ancien choix reste. **Point sans niveau : comportement inchangé au bit près** (vérifié sur 40 trajets réels). Appelants concernés : Mode Secours (étapes avec niveau — ⚠️ **effectif seulement depuis la v1.98.12** : jusque-là le Secours n'envoyait pas le niveau de ses étapes, relecture R4-1), itinéraire classique vers un POI qui a un niveau, Mode Perdu (`computeReachable`, niveau du dernier point depuis 2.5 ; POI sans niveau → `null`, calage inchangé), départ d'un itinéraire (ci-dessous) et arrivée sur une sortie (« Tracer » de la Sortie d'urgence).

### Départ d'un itinéraire et niveau

Le niveau d'un départ voyage sur le **waypoint d'origine** (`level`), comme celui d'une étape : `_insertVirtualNode` le lit, rien d'autre. Qui le pose :

- picker « Où es-tu ? » (`utils.js > ktaDemanderPositionCarte`) : rend `{ x, y, niveau }` — niveau choisi dans « Dans quel niveau es-tu ? », sinon le niveau actif d'un plan multi-niveau, sinon absent. « Y aller » le passe en `opts.origine.level` (`interfaceItineraire.js > itineraireYAller` le pose sur `waypoints[0]`) ; la Sortie d'urgence en `origine.level` (`sortieUrgence.js > _calculerDistPathfinder`), et « Tracer » transmet cette origine à `itineraireYAller` ;
- départ depuis la position déjà connue du tracker (confirmée ou suivi actif, pas de picker) : **niveau du tracker** (`getTrackerLevel()`), jamais le niveau affiché — « Y aller » sans origine imposée en suivi actif, ou par « Ma dernière position » de « D'où pars-tu ? » tracker arrêté (`interfaceItineraire.js > _niveauTracker`, commande vocale comprise), « Recalculer d'ici » et la reprise d'un parcours du Mode Secours (`itineraireReplanifierDepuis(px, py[, niveau])` : sans `niveau`, celui du tracker), « Ma position » ajoutée en étape dans la modale, Sortie d'urgence et sa relance d'écart (`sortieUrgence.js > _origineTracker`), itinéraire inter-plans (départ du plan courant, simple et multi-portails), « Utiliser la position du tracker » du Mode Perdu ;
- vue 3D ouverte en mode libre : « Y aller » part de la position **et du niveau de la 3D** (`KtaVue3D.origineItineraire()`, niveau pris par un passage 🪜 compris) ; tracker arrêté, « Ici » recale le tracker là, à ce niveau ;
- replanification au recalage (`_onTrackerRecale` → `_replanifierDepuis(x, y, getTrackerLevel())`), dont le « Je suis ici » de l'alerte du guidage ;
- Mode Secours : `declencherDepuis(x, y, level)` (victime).

L'**arrivée** suit la même règle quand la cible a un niveau connu : `itineraireYAller(x, y, nom, { niveauCible })` le pose sur `waypoints[1]`. Qui le passe :

- « Tracer » de la Sortie d'urgence (et de l'évacuation du Mode Secours) : le niveau de la sortie visée, celui avec lequel le classement l'a mesurée — une sortie du −1 sous une galerie du 0 finit sur le −1 ;
- « 🧭 Y aller » de la fiche d'un POI : le `data-kta-niveau` du bouton (`utils.js > buildPointPopupHtml`, lu par `_ktaPopupAction`), même règle que « 📍 Je suis ici » — niveau du POI, pas le niveau affiché ; POI jonction : le niveau affiché s'il le dessert, sinon son `level`. Plan mono-niveau : pas d'attribut, pas de niveau de cible.

Position jamais confirmée : le picker « Où es-tu ? » relance `itineraireYAller` avec son origine **et les autres options** (`niveauCible` compris).

### Arrivée au point précis d'un POI

Un POI qui a un **point précis** (`data-formats.md` § Format point, `poiPrecis.js`) est visé **là**, pas à son icône (décision KARMA du 06/11/2026) : `KtaPoiPrecis.cible(p)` (point précis, milieu des deux points d'une chatière, sinon le POI). Appelants : « 🧭 Y aller » et « ➕ Itinéraire » de la fiche (`data-kta-cx` / `data-kta-cy` du bouton, `data-kta-x` / `y` restant l'identité du point), la recherche de la modale d'itinéraire, la recherche inter-plans sur le plan courant, la commande vocale, `Pathfinder.resolvePointById` et les repères cités par le guidage (`itiGuidage.js > _poisDeLApp`). Le niveau de la cible ne change pas (même niveau que le POI). Ignoré pour un passage entre niveaux (ses raccords). Exports et graphe inchangés. **Validation d'étape** : « 📍 Je suis ici » sur ce POI recale le tracker au même point (`tracking.md` § Recalage dans la galerie), donc valide l'étape posée là ; `_onTrackerRecale` valide aussi une étape posée sur l'icône (`opts.icone`, étape ajoutée avant le point précis), et `InterPlanRoute.onTrackerRecale` un portail de sortie. Checkup : `scripts/smoke/checkup-point-precis.js` § 7 et 7 bis.

Plan mono-niveau : aucun `level` posé, calage inchangé. Checkup : `scripts/smoke/checkup-recaler-niveau.js` (tracés superposés 0 et −1 reliés par une jonction — § 10-11 : choix −1 dans « Où es-tu ? » → la route part du −1 ; § 13-14 : tracker au −1, niveau affiché 0 → « Y aller », « Recalculer d'ici » et la sortie d'urgence partent du −1 ; § 15 : sortie du −1 → la route finit sur le −1 ; § 15 bis : « Y aller » de la fiche d'un POI du −1, 0 affiché → la route finit sur le −1).
