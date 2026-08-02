# 📋 Backlog & dettes — MyKTAMap

> Fichier de travail KARMA ↔ Claude. **Ce n'est pas un journal** (ça, c'est `README.md`) : ici on ne garde que ce qui est **ouvert**. Une entrée soldée est **supprimée**, pas barrée — son histoire vit dans le journal et les commits.

## ⚠️ Règle de vérification (à lire avant d'utiliser ce fichier)

Le 01/08/2026, un inventaire de dettes sourcé depuis la doc s'est révélé **faux à 30 %** : 3 dettes sur 10 étaient déjà payées. Cause : les docs du repo sont des **logs append-only** où une entrée ancienne pose une limitation qu'une entrée ultérieure lève, sans renvoi entre les deux — y compris les en-têtes de modules `js/`.

**Donc chaque entrée ici porte son niveau de preuve** :

| Tag | Sens |
|---|---|
| ✅ **vérifié** | confirmé dans le CODE à la date indiquée |
| ⚠️ **doc seule** | lu dans une doc, **jamais recoupé au code** — à vérifier avant d'agir |
| 🔬 **hypothèse** | piste identifiée, non testée en runtime |

**Avant de traiter une entrée** : `grep` le symbole dans `js/`, vérifier le chargement dans `index.html` et la présence dans `sw.js > ASSETS_TO_CACHE`. Puis mettre le tag à jour.

---

## 🆕 Sujets ouverts (demandes KARMA du 01/08/2026)

### 1. 🗺️ Import depuis SIG — « Convertir depuis SIG »

**Besoin** : qu'un fichier type QGIS entre dans MyKTAMap (aujourd'hui on ne sait qu'exporter/réimporter du GPX).

✅ **vérifié 01/08** — **les deux moitiés existent déjà, jamais branchées ensemble** :

| Module | Sait faire | Bloqué par |
|---|---|---|
| `kmzImport.js` (44 Ko) | parse déjà les `<Placemark>` KML → Point/LineString/Polygon → editor/road/zone | **exige un `<GroundOverlay>`** (image géoréf) → refuse tout export QGIS vectoriel |
| `gpxImport.js` | **canvas vierge + auto-calibrage sur les bounds GPS** → ZIP MyKTAMap complet | ne parse que du GPX |

→ Le lot = parser SIG + fallback canvas vierge. **Raccordement, pas construction.**

**Formats** : GeoJSON ✅ (`JSON.parse`, zéro dép.) · KML/KMZ ✅ (parser écrit) · Shapefile ⚠️ (lib ~50 Ko à vendorer) · GeoPackage ❌ (SQLite → `sql.js` ~1 Mo WASM, hors périmètre offline).

⚠️ **Piège CRS** : QGIS exporte souvent en **Lambert 93 (EPSG:2154)** — mètres, pas degrés. **Aucune lib de reprojection vendored** (`lib/` = leaflet, jszip, jspdf, html2canvas, imageoverlay-rotated). Détection triviale (coords hors `[-180,180]`/`[-90,90]`).

**Décisions tranchées le 01/08 (KARMA « GO RECO ») : `1:b 2:a 3:a`.**

**État : 🟡 MOTEUR LIVRÉ, UI À FAIRE.**

✅ Fait — `js/sigImport.js` (câblé dans `index.html` + `sw.js`), validé par harness Node (34 cas) :
- parsers **GeoJSON** (FeatureCollection/Feature/GeometryCollection, les 6 géométries, Multi\* éclatés) et **KML** (Placemark, `ExtendedData`/`SimpleData`, KMZ via JSZip)
- **validation CRS** : refus franc si coords hors `[-90,90]`/`[-180,180]` **et** si le membre `crs` déclare autre chose que CRS84/4326 — le message dit combien de coordonnées sont fautives
- bounds (avec fenêtre minimale si étendue nulle → pas de division par zéro dans `buildTransform`)
- `analyserAttributs()` → colonnes candidates triées + valeurs distinctes = **matière première de l'écran de correspondance**
- `proposerMapping()` → pré-remplissage par synonymes, **jamais de valeur forcée** (inconnu → `null`, l'user tranche)
- `ingest()` → points/roads/zones en coords plan via `KmzExport.gpsToPlan`
- `genererZipMyktamap()` → réutilise `GpxImport.genererCanvasVierge` (aucune raison d'avoir 2 générateurs de fond)

❌ **Reste à faire — sans ça la feature est INATTEIGNABLE par l'utilisateur** :
1. `_routerFichierImport` (`createConf.js`) : router `.geojson/.json/.kml` → nouveau panneau (aujourd'hui ils tombent sur « mauvaise extension »)
2. `_afficherImporterSig()` : panneau calqué sur `_afficherImporterGpx` (~200 lignes) — résumé du fichier, dims du canvas, nom/version/auteur
3. **Écran de correspondance** : colonne SIG à utiliser + table « valeur → tag/type MyKTAMap », alimentée par `analyserAttributs` + `proposerMapping`
4. Clés i18n ×3 (les messages d'erreur sont déjà des clés : `sig.err.*`, `sig.warn.*`)
5. Élargir l'`accept=` de l'input fichier

---

### 2. 🎨 Légende — couleur des entrées par défaut

**Besoin** : pouvoir modifier la couleur d'une entrée de légende **built-in** (aujourd'hui seules les entrées **custom** portent `lineColor`/`fillColor`/`borderColor`).

**Audit fait le 01/08** — le round-trip est sain, le rendu ne l'est pas :

✅ **vérifié** — ce qui MARCHE : export/import de session (`sessionExporter` → `interfaceImportExport`), ZIP de plan (`createConf` → `loadPlanState`), transport GPX (`<extensions><myktamap:customLegend>`), cascade `session > plan > default`, IDs `cust-<ts36>-<rnd36>` (pas de collision inter-appareils).

#### 🐛 Bug 1 — zones « inaccessible » embarquées exportées en gris
✅ **vérifié** — [`exporter.js:2155`](../js/exporter.js#L2155) : `ZS_EMBED` (zones venant d'un **calque de données**) n'a **pas** `inaccessible`, alors que la table sœur des zones de session ([l.1956](../js/exporter.js#L1956)) l'a. Fallback explicite : `ZS_EMBED[z.type] || ZS_EMBED.remblais` → **une zone dangereuse ressort en tas de remblais** dans l'export PNG avancé.
> Récidive : le commentaire l.2164 documente **le même bug sur `jonction`**, corrigé en v1.7.1. `inaccessible` (v169) l'a reproduit. Symptôme d'un défaut structurel, pas d'un oubli.

#### 🐛 Bug 2 — types custom sans couleur en KMZ / GPX / Secours
✅ **vérifié** — [`kmzExport.js:860`](../js/kmzExport.js#L860) : `styleId = "road_" + r.type` → pour un custom ça donne `road_cust-abc123`, **jamais défini** dans `STYLES_KML` (l.309-325, built-in uniquement) → `<styleUrl>` pendant → **trait par défaut dans Google Earth, couleur perdue**. Même famille : `gpxIO.js`, `secoursMode.js`, `emergencyMode.js` (tables propres, aucun appel à `findCustomEntry`).
> ✅ `pdfExport.js` est **hors de cause** (accusation retirée après vérif) : il délègue à `_genererCanvasExportPublic`, donc il hérite du rendu d'`exporter.js`, customs compris.
> ⚠️ **non vérifiés** : `createConf.js`, `tableEditor.js`.

#### 🧱 Le fond — une trentaine de tables pour 13 types built-in
✅ **vérifié** — tracés **9 tables** · zones **11** · structures **11**, réparties sur 12 fichiers. `utils.js` en porte 3 copies, `exporter.js` 2 à 4. Et `legendCustomization.js > DEFAULT_RENDERS` (pastilles de la légende) est **indépendante** de `ROAD_STYLES` (la carte) : elles coïncident aujourd'hui, rien ne le garantit — le jour où elles divergent, **la légende ment sur la carte** sans qu'aucun test ne le voie.

**Reco : lot 0 AVANT le lot couleur.** Ajouter l'override sans traiter ça = fabriquer une 32ᵉ source de vérité, avec la couleur juste à l'écran et fausse dans tout ce qui se partage.
1. Résolveur central `window.ktaResolveStyle(category, key)` — absorbe les 2 bugs par construction
2. Migration par vagues : carte → `exporter.js` + `utils.js` → KMZ/GPX → OSM → Secours
3. **Alors seulement** l'override couleur : une ligne dans le résolveur, qui atteint tout le monde

**Décision en attente** : `1` lot 0 complet · `2` les 2 bugs seuls (~20 lignes, n'ouvre pas la couleur) · `3` les 2 bugs puis le résolveur

---

## 🔴 Dettes ouvertes

| # | Dette | Preuve | Impact |
|---|---|---|---|
| D1 | **PDF du Mode Histoire absents de l'export de profil** (IDB `myktamap_histoire_pdfs`, jusqu'à 100 Mo/plan) → l'onglet 📖 Récits arrive avec ses notes libres mais **sans les PDF** | ✅ vérifié 01/08 | Migration d'appareil incomplète. Décision : section optionnelle décochée par défaut, sur le modèle des photos ? |
| D2 | **Doc user, Aide intégrée et onboarding restent FR/EN** alors que l'app est ES à 100 % (3721 clés) | ✅ vérifié (pas de `README_USER.es.md`) | Un hispanophone ouvre 📚 Documentation et tombe en français |
| D3 | **Toggle « Mes annotations » ne masque pas les polylines roads** sur certaines configs | 🔬 hypothèse — [`rendering-leaflet.md`](architecture/rendering-leaflet.md) | Piste : ce n'est probablement PAS Leaflet mais une **course au boot** — `_targetLayerForRoad` retombe sur `window.map` quand `layerEditor` n'existe pas encore → road orpheline pour toujours. **Vérif** : `window.layerEditor.hasLayer(<layer>)` sur les tracés récalcitrants |
| D4 | **`<script>` inline d'`index.html`** reste un monolithe (config/PIN, profil, loader plans — état partagé + monkey-patch) | ⚠️ doc seule | Chaque intervention dedans est chère et risquée |
| D5 | **Vue OSM lot 3** — liaisons portails dessinées entre plans | ✅ vérifié (arbitré 01/08 : la traversée n'a pas de sens, seul l'affichage en a) | Intérêt réel = **diagnostic de géoréf** (l'écart entre les 2 bouts d'un portail révèle un mauvais calage). Coût principal = 6ᵉ catégorie dans le système de filtres |
| D6 | **Constantes `ITI_*` dupliquées** de `road.js > ROAD_TYPES.itinerary` | ⚠️ doc seule | Sync manuelle si le style iti change. Sera absorbé par le résolveur central (sujet 2) |
| D7 | **Duplication ~2 fonctions** pickers géoréf ↔ picker départ tracker | ⚠️ doc seule — [`tracking.md`](architecture/tracking.md) | Seuil explicite : mutualiser **si une 3ᵉ cible apparaît**. Pas atteint → ne rien faire |
| D8 | **`secoursPlan.groupes[].statut`** — ⚠️ signalé mort par la doc, **il est exploité** | ✅ vérifié (doc corrigée) | Aucune action. Gardé ici comme rappel que la doc mentait |

## ⚫ Dette de process (se recrée toute seule)

**La règle des 4 axes de `CLAUDE.md` n'est vérifiée par rien.** Le hook `pre-commit` contrôle les fuites pro, pas la fraîcheur des docs. Constaté : `AI_CONTEXT.md` n'avait **jamais** reçu les nouveautés v1.73.0 (point C géoref, mode kiosque) — pendant une version entière, l'Aide IA a répondu « ça n'existe pas » sur deux features livrées.

**Piste** : le hook compare la version des 3 sources et **refuse un commit `release(...)`** si `AI_CONTEXT.md` / `NETWORK_AUDIT.md` n'ont pas bougé. ~1 h, et la dette cesse de se recréer.

## 🚫 Enterré volontairement — ne pas repayer

| Sujet | Statut |
|---|---|
| **Plein écran iPhone** | 2 tentatives (v1.9.2, v1.71.0), 2 rollbacks. ~47 px perdus, état stable. Un commentaire d'`index.html` **interdit une 3ᵉ tentative** sans diagnostic précis sur appareil |
| **QR Share Secours (Phase 4)** | Rollback structurel — densité QR v35+ illisible par les scanners. Remplacé par l'import consolidé v1.26 |
| **Import/Export Live** | Pause indéfinie, couvert par l'import consolidé |
| **Traversée de portail en Vue OSM** | Arbitré 01/08 : le mode OSM n'a ni position courante ni plan « où tu es » ; la pile multi-plans couvre déjà le besoin. Seul l'**affichage** des portails reste sur la table (D5) |

## ✅ Corrections d'inventaire — ne pas les re-signaler comme dettes

Ces trois-là ont été signalées à tort le 01/08 (doc périmée), **elles sont faites** :
- **Heatmap** — active depuis v1.21.2 (chargée, précachée, 13 modules la consomment)
- **KMZ Secours Phase 2** — `_emitSecoursFolder` livré en v1.23.0 (Placemarks + Polygons cross-app)
- **`secoursPlan.groupes[].statut`** — exploité (cf. D8)
