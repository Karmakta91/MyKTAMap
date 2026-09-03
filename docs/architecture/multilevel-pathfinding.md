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
   - T-junction (extrémité d'un segment à ≤ 15 px de l'intérieur d'un autre, avec projection orthogonale)
   - Endpoint↔endpoint (2 extrémités distinctes à 1.5 < d < 15 px)
   → ajout de nœuds virtuels et arêtes ad-hoc. Sans ça, les roads tracés à la main qui se croisent sans partager de point exact restent dans des composantes graphe disjointes.
3. **Snap des waypoints** (`_insertVirtualNode`) — projection orthogonale du waypoint sur le segment le plus proche, insertion d'un nœud virtuel à la projection (split du segment d'origine).
4. **Dijkstra** entre paires consécutives, concaténation des chemins.

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

### 15. Distance totale des tracés (`interface.js`, depuis 2026-05-09)

Outil de mesure agrégée : somme des longueurs de tous les tracés Principal / Secondaire / Chemin présents (session `getRoads()` + calques `getAllEmbeddedRoads()` — TOUTES, masquées comprises depuis v146), avec filtrage par type via cases à cocher et surlignage magenta des tronçons inclus.

**⚠️ Depuis v146 (2026-05-14)** : `_rdRoadsExploitables()` utilise `getAllEmbeddedRoads()` (et plus `getEmbeddedRoads()` qui filtrait par visibilité). Cohérence avec Pathfinder + Search : l'utilisateur peut masquer le calque routes (dessinées en dur sur le PNG) pour gagner en perf rendu, tout en gardant un total fiable. Le surlignage magenta est aussi appliqué sur les roads masquées (layer séparé qui se voit indépendamment du calque sous-jacent).

**Entrée UI** : sous-action **📏 Distance totale (filtres)** dans le groupe accordéon **🛣️ Tracés / Routes** (`interface.js > _creerGroupeAccordeon({id:"traces"})`). Toggle ON/OFF — re-cliquer ferme la modale.

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

> 🔧 **Changement v1.7.3** (KARMA, 19/05/2026) : retrait du toggle ⚙️ Réglages
> qui permettait d'activer/désactiver le multi-niveau pour un plan déjà chargé.
> Raison : forcer une déclaration explicite au moment du plan (générateur ou
> plan-config.json édité), évite les états incohérents où un plan "non
> multi-niveau" est activé runtime puis réinitialisé au reload. Les fonctions
> `_renderMultiLevelSection` et `_bindMultiLevelToggle` (`interface.js`) restent
> définies dans le code (dead code propre) mais ne sont plus appelées dans
> `afficherConfig`. La cascade `PlanRegistry[id].multiLevel` reste lue pour les
> users qui avaient toggle via l'ancien UI avant v1.7.3 (leur préférence est
> persistée et continue de marcher).

#### 26.2 Data model

**APP_CONFIG (runtime)** — défini dans `js/config.js` :
- `multiLevel: boolean` — feature active pour ce plan ?
- `activeLevel: number` — niveau utilisé pour dessiner de nouveaux items (default 0). **Peut être négatif** depuis v154 (sous-sols).
- `visibleLevels: number[]` — filtre d'affichage (multi-select, default `[0]`)
- `availableLevels: number[]` — niveaux disponibles dans le sélecteur (**default `[-2, -1, 0, 1, 2]` depuis v154**, symétrique autour de 0). Extensible via boutons `+` (max+1) et `−` (min−1) dans la modale. Auto-étendu au boot par `window._etendreAvailableLevelsSiBesoin()` si les data layers contiennent des niveaux hors range.

**Données persistées** :
- Roads : `road.level: number` (création) OU `{ type: "jonction", fromLevel, toLevel }`
- Zones : `zone.level: number`
- Editor points : `point.level: number`
- Data layer items : `level: number` optionnel dans le JSON (`puits.json`, etc.)
- Roads embarquées dans data layers : `road.level: number` optionnel
- Zones embarquées dans data layers : `zone.level: number` optionnel
- **Image layers (depuis v162)** : `plan-config.json > imageLayers[i].level: number` optionnel. Filtré au runtime via `_applyLevelFilterToImageLayers()`. Modale Niveaux = authority → force `addLayer`/`removeLayer` selon `visibleLevels` (override le checkbox Leaflet). Le générateur expose un champ "Niveau" à côté de chaque image layer, visible **uniquement** si la case 🏗️ Plan multi-niveau est cochée.

**Rétro-compat absolue** : si un item n'a PAS de `level`, il est traité comme `level: 0`. Tous les plans v147 et avant fonctionnent identiquement quand le toggle est OFF (jamais de champ `level` ajouté).

#### 26.3 UI

- **Bouton "Niveau actif"** : `L.control({position: "topleft"})` sous les boutons de zoom Leaflet. Pastille jaune avec chiffre du niveau actif. Click → ouvre la modale niveau.
- **Modale niveau** (`#kta-niv-modal`) : 2 sections
  - 🎯 Niveau actif (segmented, single-select) — utilisé pour dessiner. Affichage **trié croissant** (gauche=négatif, droite=positif, comme un axe numérique).
  - 👁️ Niveaux visibles (checkboxes, multi-select) — filtre d'affichage
  - Quick actions : `Tous` / `Actif seul`
  - **2 boutons d'extension (v154+)** : `−` à gauche (ajoute `min-1`, sous-sols) + `+` à droite (ajoute `max+1`, étages supérieurs). Format pastille = "pill" extensible (cf. `.kta-niv-pastille` CSS) pour accepter `-1`/`-2` sans débordement dans le bouton Leaflet 30×30.
- **Sous-action 🪜 Jonction interniveau** : ajoutée au groupe Tracés quand multiLevel ON. Click → modale `from/to level` → mode tracé activé.
- **Boussole repositionnée** : si `body.kta-multilevel-active`, le widget boussole passe de `top:80px` à `top:130px` pour libérer la place au bouton niveau.

#### 26.4 Rendu et filtrage

`window.appliquerFiltreNiveau()` orchestre le re-render/filtrage de TOUS les modules level-aware :
- `renderRoads()` (road.js) — filtre via `_passeFiltreNiveau` (inclut `currentRoad` toujours visible pendant le tracé)
- `renderZones()` (zones.js) — filtre via `_zonePasseFiltre` (inclut `currentZone` toujours visible)
- `_applyLevelFilterToEditorPoints()` (editor.js) — opacity/pointer-events sur markers session
- `_applyLevelFilterToDataPoints()` (utils.js) — opacity sur markers data layers
- `_applyLevelFilterToDataRoads()` (utils.js) — setStyle opacity sur polylines data layers
- `_applyLevelFilterToDataZones()` (utils.js) — setStyle opacity sur polygones data layers
- `_applyLevelFilterToTracker()` (tracking.js) — opacity du marker tracker + polyline parcouru
- `_applyLevelFilterToImageLayers()` (map.js, **depuis v162**) — `map.addLayer`/`removeLayer` sur les `L.imageOverlay` selon le niveau. Sémantique différente des points/zones : on retire l'overlay du Leaflet layer control (pas juste de l'opacity à 0). La modale Niveaux fait autorité — force coché/décoché selon visibleLevels (override le toggle manuel du checkbox Leaflet).

Chaque module garde un registre de ses objets Leaflet (`_ktaDataMarkers`, `_ktaDataPolylines`, `_ktaDataPolygons`, `_ktaImageOverlays`). Reset au plan switch via `main.js > lancerApplication`.

#### 26.5 Jonctions interniveau

Type spécial `"jonction"` :
- `fromLevel`/`toLevel` : niveaux des 2 extrémités. **Sémantique symétrique** : Pathfinder traverse dans les 2 sens, l'ordre from/to n'affecte rien d'autre que l'étiquetage UI dans la modale de création. Une jonction `{from:0, to:1}` est strictement équivalente à `{from:1, to:0}` du point de vue du graph.
- N points (comme une polyline normale)
- Style : magenta `#ff4ecb` weight 5 dashArray "10 6"
- Marqueurs aux endpoints : `L.circleMarker` ∅14 (radius 7) bord magenta + intérieur blanc weight 3
- Toujours visible si **au moins un** de `fromLevel`/`toLevel` ∈ `visibleLevels` (sinon cachée)
- Exclue du calcul des cercles d'intersection (les middle points sont en transit vertical, pas des croisements physiques)
- **Effacement** : aucun comportement spécial, traitée comme un tracé normal par tous les modes de 🧹 (sélection au clic, dernier tracé, tous les tracés). `resetRoads()` purge aussi les jonctions car même structure de données.

#### 26.6 Pathfinder niveau-aware (`pathfinder.js`)

- Chaque **segment** porte `level: number | "transit"` (transit = segment de jonction)
- Chaque **node** porte `nodeLevels[idx]: Set<level>` (niveaux des segments qu'il touche)
- Enrichissement (intersection, T-junction, endpoint-endpoint) : **skip** les pairs avec niveaux numériques différents OU impliquant `"transit"` (sauf pour la jonction's first/last point qui porte fromLevel/toLevel en plus de transit, permettant T-junction propre)
- `_insertVirtualNode` (waypoint snap) : le node virtuel hérite du `level` du segment snapped — Dijkstra reste contraint au bon niveau
- Multi-level OFF → tous les helpers compatibilité retournent `true` → comportement strictement v147

#### 26.7 Exports

| Export | Filtre niveau |
|---|---|
| `utils.js > telechargerPlan` (rapide) | **WYSIWYG** : `window.passeFiltreNiveau(item)` lit `visibleLevels` du runtime |
| `exporter.js > _genererCanvasExport` (avancé) | Section dédiée `🏗️ Niveaux à exporter` (multi-select), lecture via `opts.ann.levels: Set<number>` → helper local `_itemPasseLevels`. **Découplé** du filtre runtime : tu peux filtrer la map sur [Niv 0] et exporter [Niv 0+1+2]. |
| `sessionExporter.js` (Full / Avancé / Conversion) | Aucun filtre — sérialise TOUS les items via `JSON.stringify` (préserve `level`/`fromLevel`/`toLevel` automatiquement) |
| `sessionPersist.js` (auto-save) | Idem — sérialisation JSON transparente |

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

**Source de vérité unique : `window.ktaSetActiveLevel(lvl, opts)`** (`interfaceConfig.js`) — valide, coupe le mode tracé, pose `activeLevel`, unionne `visibleLevels`, met à jour la pastille sidebar, propage via `appliquerFiltreNiveau()`. **Tous** les chemins passent par lui : modale Niveaux (`_changerNiveauActif` n'est plus qu'une délégation), modale ≡ Filtres (2 sites), arrivée de portail (`interPlanLinks`), et la bascule C6 du tracker.

> 🐛 **Bug de fond corrigé au passage** : les 2 chemins de la modale ≡ Filtres n'appelaient **ni** `appliquerFiltreNiveau()` **ni** rien d'autre — ils notifiaient `window._onLevelChange(...)`, un callback **jamais défini nulle part** dans le projet. Les 7 appels étant tous gardés par `typeof === "function"`, le trou était silencieux : changer le niveau actif depuis la modale ≡ ne mettait à jour ni la pastille ni les modules level-aware. Il reste 5 appels morts sur le volet `"visible"` (inoffensifs — ils accompagnent un vrai `appliquerFiltreNiveau()`), à purger si on repasse dans le fichier.

⚠️ **Itineraire = bypass total** : `road.type === "itinerary"` toujours visible peu importe le filtre (calculé par Pathfinder, doit rester affiché pendant la navigation).

⚠️ **Reset au plan switch** : `lancerApplication` reset `activeLevel = 0`, `visibleLevels = [0]`, vide les registres `_ktaDataMarkers/Polylines/Polygons` (ils seront re-remplis par `ajouterPointsDepuisJSON`).

---

### 31. Zone "Inaccessible" + Préférences d'évitement itinéraire (depuis v169 / Karma_dev)

2 features complémentaires pour contraindre les itinéraires calculés par Pathfinder. Toutes deux travaillent au niveau du graphe (filtrage des arêtes avant Dijkstra), pas en post-traitement.

#### 31.1 Zone "Inaccessible" (contrainte DURE)

**Type de zone** : `"inaccessible"` (4ème type, après `eau`/`remblais`/`effondrement`). Tracé via le groupe ⬛ Zones de la sidebar, bouton ⛔.

**Visuel** : hachures rouge sombre / noir à 45° via un `<pattern>` SVG défini dans `index.html` (`id="kta-pattern-inaccessible"`). Renderer SVG forcé (singleton `_inaccessibleRenderer` dans `zones.js` pour session, `_inaccessibleDataRenderer` dans `utils.js` pour data layers) car canvas ignore les patterns SVG.

**Effet pathfinder** : dans `_buildGraph`, pour chaque segment de road, on teste `_segmentBloqueParZoneInaccess(prevP, p, segLevel, zonesInacc)`. Si traversée détectée → on n'ajoute PAS l'arête ni le segment dans `graph.segments` → enrichment (intersection/T-junction) ne verra pas ce segment → Dijkstra ne peut pas emprunter ce tronçon.

**Algorithme de détection** (`pathfinder.js`) :
- `_pointInPolygon(p, poly)` — ray-casting standard O(n)
- `_segmentTraversePolygon(p1, p2, poly)` — true si un endpoint dedans OU si le segment intersecte une arête du polygone
- `_segmentBloqueParZoneInaccess(p1, p2, segLevel, zonesInacc)` — applique la règle niveau-aware (segments "transit" jamais bloqués)

**Collecte des zones** : `_collecterZonesInaccessibles()` lit :
- Session zones via `window.getZones()` (filtre `type === "inaccessible"`)
- Data layer zones via `window._ktaDataPolygons` (entries portant `type` et `points` depuis v169, cf. `utils.js > ajouterPointsDepuisJSON`)

**Multi-niveau** : zone bloque uniquement les segments du **même niveau**. Sauf `multiLevel: false` (comparaison à plat). Segments `"transit"` (middle de jonction interniveau) jamais bloqués (points "en l'air").

**Indépendant de la visibilité** : pathfinder utilise toujours la zone même si le calque zones est toggle off (cohérence demandée — sinon l'user pourrait toggler sans s'en rendre compte). Toutes les modifs d'export (PNG, session) respectent toujours le type comme une vraie zone.

#### 31.2 Préférences d'évitement (contrainte SOUPLE)

**Configurées dans la modale itinéraire**, section repliable "🚫 Préférences d'évitement (optionnel)". Persisté en localStorage par plan : `localStorage["myktamap_route_avoid_<planId>"] = { points: [{x,y,label,id?}], tags: [...], zones: [...], radius: 100 }`.

**4 types de contraintes** :
1. **Points explicites** : `avoidPoints: [{x, y, label?, id?}, ...]`. **3 méthodes d'ajout** côté UI :
   - **Autocomplete** : `SearchPoints.findByQuery` (recherche par nom/id/tag)
   - **Saisie ID exact** : `Pathfinder.resolvePointById` (input texte + bouton Ajouter)
   - **Clic carte** : bouton "📍 Cliquer sur la carte" → mode flottant orange (`_itiAvoidClickActive`, handler isolé du mode clic waypoints), chaque clic ajoute un point d'évitement aux prefs (label "📍 Clic carte (x, y)"). Cf. `_activerModeClicAvoid` / `_desactiverModeClicAvoid` dans interface.js.
2. **Tags** : `avoidTags: ["pa", "danger", ...]` → expansion auto en tous les points du plan portant ces tags (via `SearchPoints.getAllPoints`, **async**)
3. **Marge** : `avoidRadius` px (défaut 100, configurable 0-500)
4. **Zones** (depuis v1.48.0 ; **par TYPE depuis v1.48.1**) : `avoidZones: ["eau", "cust-…", ...]` → liste de **types de zones** à contourner (1 coche par type, comme les autres filtres — plus de liste par instance). `getAvoidableZoneTypes()` (exposé `window.getAvoidableZoneTypes`) liste les **types distincts** des zones évitables (session `getZones` + embarquées `_ktaDataPolygons`) — **exclut `inaccessible`** (déjà contrainte DURE, cf. §31.1). Label **legend-aware** : type custom (`cust-…`) via `LegendCustomization.findCustomEntry(type).label` (« galerie basse »), built-in via `getLabel("zones", type)` (« Eau »…). ⚠️ `getLabel` ne consulte PAS `customEntries` → d'où le recours à `findCustomEntry` pour les customs. `_collecterZonesAEviter(types)` collecte **toutes** les zones dont le type est coché. Côté pathfinder, un segment traversant une de ces zones est coupé du graphe via `_segmentBloqueParZoneInaccess(prevP, p, segLevel, avoidZones)` (niveau-aware : une zone ne bloque que les segments de son niveau ; passe souple uniquement).

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

#### 31.7 Pour ajouter une 5ème type de zone (futur)

**À NE PAS OUBLIER** quand on ajoute un nouveau type de zone (au-delà des 4 actuels eau/remblais/effondrement/inaccessible) :

1. `js/zones.js > ZONE_STYLES` — style visuel (color/fillColor/fillOpacity)
2. `js/zones.js > ordreType` — position d'affichage dans la pile (ordre = z-index logique)
3. `js/interface.js > _creerGroupeAccordeon zones` — bouton sous-action
4. `js/interface.js > Aide intégrée` — ligne descriptive
5. `js/utils.js > ZONE_STYLES_DATA + ZONE_STYLES_EMBED + ZONE_STYLES_EXPORT` — styles pour data layers + export rapide
6. `js/utils.js > ajouterPointsDepuisJSON > zonesTriees ordre` — ordre embedded zones
7. `js/utils.js > telechargerPlan > ordre` — tri zones session
8. `js/exporter.js > _compterTypes / hasZones / zoneLabels / ordre / filtreZ + checkboxes ann_zones_*` (×~10 sites)
9. `js/sessionExporter.js > _trierParType (×3 sites) / syncParent (×2) / zoneTypes filter / zoneTypesActifs + checkboxes adv_zones_* / conv_zones_*` (~8 sites)
10. `index.html` — pattern SVG si nécessaire pour le rendu visuel
11. `css/style.css` — styles spécifiques si besoin
12. Pathfinder si bloquant : helper de détection dans `pathfinder.js`
13. Doc : CLAUDE.md (cette section), AI_CONTEXT.md (liste anti-hallucination), README_USER.md, README.md (journal)

C'est ~13 endroits à toucher. Un grep large `"effondrement"` est utile pour ne pas en oublier.

---

## 🧭 Itinéraire INTER-PLAN (v1.60.0 — A6)

> Le pathfinding traverse les « portails » (liaisons inter-plan, cf. `js/interPlanLinks.js` + `docs/architecture/data-formats.md` §liaisons). Décisions KARMA : `1:c 2:a 3:a 4:a 5:a 6:a`.

**Module `js/interPlanRoute.js`** (`window.InterPlanRoute = { computeEtAfficher(dest), onPlanLoaded() }`) :

- **Leg A** (plan courant) : `Pathfinder.computeRoute` classique — position tracker → point-portail côté A, avec les prefs d'évitement du plan courant.
- **Leg B** (plan distant, **non chargé**) : `Pathfinder.computeRouteOnRoads(waypoints, roads, opts)` — nouvelle API **synchrone** exposant `_computeRouteInterne` sur des roads fournies. Les données viennent de `InterPlanLinks.collectRoutingDataForPlan(plan, stats)` : **roads + zones + scale** lus depuis la session localStorage + les datalayers (serveur `fetch` / ZIP IndexedDB). Zones `inaccessible` = contrainte dure ; évitements du plan B (prefs `myktamap_route_avoid_<planB>`) résolus par l'appelant (tags → points du plan B via `collectPointsForPlan`).
- **Portails candidats** (3:a) : liaisons A↔B du registre, tri par proximité euclidienne du départ, **≤ 5 testés au coût réel**, total minimal retenu.
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
- Débounce **500 ms** → `_replanifierDepuis(x, y)` : étapes restantes = `waypoints.filter(!done && source!=="tracker")` dans l'ordre ; `computeRoute([origin, ...restantes], avoidPrefs)` sous `_withItiComputeLoader` ; nouvelle road = `waypoints: [origin, ...TOUTES les étapes copiées]` (done incluses → progression visible + persistée). **Échec de calcul → ancien tracé conservé** + toast `iti.replan.err`.
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
- **Graphe de portails** : nœuds `@start` (position) + chaque CÔTÉ de portail + `@dest` ; arêtes de traversée à 0 m ; arêtes intra-plan **PARESSEUSES** — le coût (Dijkstra réel via `_legEntre`, en MÈTRES par échelle du plan, mémoïsé `legCache`) n'est calculé qu'à l'expansion du nœud. Le Dijkstra global couvre AUSSI le cas direct → case cochée = `_computeMultiHop` remplace entièrement le single-hop.
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

- `InterPlanLinks.onPlanExit(ctx)` + `InterPlanRoute.onPlanExit(ctx)`, appelés côté boot/teardown : `afficherLoader()` → ctx `"home"` · `_libererRessourcesPlanPrecedent()` → ctx `"switch"`.
- ⚠️ **Subtilités à ne pas casser** : ① côté liaison, le hook "switch" est **no-op si `_pendingTarget` existe** (= goTo en cours qui gère déjà bouton + pile ; sans ce garde, tout saut de portail perdrait son bouton Retour). ② côté route, la **chaîne multi-hop (`_pendingChain`) survit au "switch"** — c'est elle qui trace les legs aux arrivées ; elle n'est abandonnée qu'au retour HOME. ③ Tout NOUVEAU flottant de navigation doit s'enregistrer dans un de ces hooks (ou avoir un timer d'expiration).

---

## ⛔ Ce qui contraint réellement l'itinéraire — et la case pour le suspendre (v1.82.0)

État établi en lisant `pathfinder.js`, parce que la question revient et que le
code disait le contraire de ses propres commentaires.

| Contrainte | Source | Nature | Réglable |
|---|---|---|---|
| Zones `inaccessible` | session + `_ktaDataPolygons` | **dure**, jamais relâchée | ✅ **depuis v1.82.0** |
| Autres types de zones | idem | souple (relâchée en passe 2) | ✅ cases « 🚫 Préférences d'évitement » |
| Points / tags à éviter | `SearchPoints` | souple | ✅ |
| **Structures** (piliers, murs, fronts) | — | **aucune** | sans objet |

🩸 **Les structures ne bloquent rien.** Aucune référence dans `pathfinder.js` :
elles ne sont ni arêtes ni obstacles. Le commentaire de `utils.js` au-dessus de
`getAllEmbeddedStructures` affirmait le contraire (« utilisé pour la collision
pathfinder, les structures bloquent comme les zones inaccessibles ») — c'était
faux depuis le début, et ça a coûté un aller-retour de diagnostic à KARMA.

🩸 **Le graphe se construit UNIQUEMENT sur les `roads`** (`getRoads` +
`getAllEmbeddedRoads`). Conséquence sur un plan importé dont tout le relevé est
parti en structures : **aucun itinéraire n'est possible**, pas même dégradé.
C'est ce qui motive le reclassement d'objet (cf. `session-data.md`).

### La case « Respecter les zones inaccessibles »

Les zones `inaccessible` étaient la **seule** contrainte que le moteur ne relâche
jamais — même la passe 2 les garde. Sur un relevé encore incomplet, un polygone
typé par erreur ferme donc un passage réel, sans recours.

`computeRoute(waypoints, { respecterInaccessibles: false })` la suspend. Case
dans la section « 🚫 Préférences d'évitement », **cochée par défaut**, persistée
avec les autres préférences (`respecterInaccessibles !== false` : une préférence
enregistrée avant cette version n'a pas le champ et garde le comportement
historique).

⚠️ **Volontairement limité à `computeRoute`.** `computeReachable` (Mode Secours /
Perdu) garde les zones inaccessibles en toutes circonstances : une préférence de
confort n'a pas à élargir un périmètre de secours. `interPlanRoute`,
`secoursMode` et `sortieUrgence` ne passent pas l'option — ils héritent donc du
comportement sûr, et c'est intentionnel.
