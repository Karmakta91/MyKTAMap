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

**État : ✅ LIVRÉ (moteur + UI) — reste à tester sur de vrais exports QGIS.**

✅ Fait — `js/sigImport.js` (câblé dans `index.html` + `sw.js`), validé par harness Node (34 cas) :
- parsers **GeoJSON** (FeatureCollection/Feature/GeometryCollection, les 6 géométries, Multi\* éclatés) et **KML** (Placemark, `ExtendedData`/`SimpleData`, KMZ via JSZip)
- **validation CRS** : refus franc si coords hors `[-90,90]`/`[-180,180]` **et** si le membre `crs` déclare autre chose que CRS84/4326 — le message dit combien de coordonnées sont fautives
- bounds (avec fenêtre minimale si étendue nulle → pas de division par zéro dans `buildTransform`)
- `analyserAttributs()` → colonnes candidates triées + valeurs distinctes = **matière première de l'écran de correspondance**
- `proposerMapping()` → pré-remplissage par synonymes, **jamais de valeur forcée** (inconnu → `null`, l'user tranche)
- `ingest()` → points/roads/zones en coords plan via `KmzExport.gpsToPlan`
- `genererZipMyktamap()` → réutilise `GpxImport.genererCanvasVierge` (aucune raison d'avoir 2 générateurs de fond)

✅ UI livrée (`createConf.js`) : routage `.geojson/.json/.kml` dans `_routerFichierImport`, panneau `_afficherImporterSig()` calqué sur le panneau GPX, **écran de correspondance** (colonne SIG + table « valeur → type », valeurs **ventilées par famille** via `valeursParFamille` — un polygone ne se voit jamais proposer un type de tracé), `accept=` élargi, 41 clés i18n ×3.

⚠️ **Reste à valider sur le terrain** : aucun vrai export QGIS n'a été testé. Le harness couvre la logique (parsers, CRS, mapping) mais pas les schémas réels. À tester en priorité — un GeoJSON QGIS EPSG:4326, un KML QGIS, un fichier volontairement en Lambert 93 (doit être refusé avec le compte de coordonnées fautives).

⚠️ **`.json` est routé vers le panneau SIG** : extension ambiguë (config, session, calque…). C'est le parser qui tranche au contenu et refuse proprement (`sig.err.pasDuGeojson`). Si ça gêne un flux existant, router `.json` ailleurs.

**Extensions possibles plus tard** : Shapefile (lib ~50 Ko), reprojection proj4 (~30 Ko) pour accepter le Lambert 93 au lieu de le refuser, import des styles SIG.

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

**Décision KARMA (03/08) : option `1` — lot 0 complet, puis la couleur.**

#### 🟢 Vague 0 — LIVRÉE (03/08)
- `js/styleResolver.js` : table **canonique** des 13 types built-in + `window.ktaResolveStyle(catégorie, clé)`. Résout aussi les types **custom** via `LegendCustomization`. Rend un **objet neuf** à chaque appel (un consommateur qui mute son style ne contamine personne).
- `scripts/check-style-canon.js` — **pré-commit bloquant**. Confronte les tables encore présentes dans le code à la table canonique : **105 déclarations vérifiées, aucune dérive**. Tant que la migration n'est pas finie, c'est lui qui empêche une table de repartir en vrille.
- `scripts/check-style-resolver.js` — **pré-commit bloquant**, 21 cas (built-in, customs, inconnus, non-contamination, module absent, `findCustomEntry` qui jette).

⚠️ **Découverte du relevé exhaustif — 2 VARIANTES DÉLIBÉRÉES, à ne jamais « corriger »** : `emergencyMode.js` a une palette entière plus vive pour la mini-carte d'urgence, et `osmView.js`/`osmHomePreview.js` rendent `inaccessible` en aplat orange (le motif hachuré SVG n'existe pas sur fond OSM). **Les deux sont commentées dans leur fichier d'origine.** Unifier aveuglément aurait changé le rendu de deux écrans sans que personne l'ait demandé — c'est exactement ce que la comparaison préalable a évité. Elles sont inscrites en `EXCEPTIONS` dans le script de contrôle, ce qui rend tout nouvel écart **volontaire et visible**.

#### 🔜 Vagues suivantes
1. **Carte** — `road.js`, `zones.js`, `structures.js`
2. **Exports image** — `exporter.js` + `utils.js` → **corrige le bug 1**
3. **KMZ / GPX** — `kmzExport.js`, `gpxIO.js` → **corrige le bug 2**
4. **Reste** — `interfaceLegende.js`, `statsGlobales.js`, `secoursMode.js`, `interfaceDistanceTotale.js`
5. **Alors seulement l'override couleur** : une entrée dans le résolveur, qui atteint tout le monde par construction

⚠️ **Toujours non vérifiés** : `createConf.js`, `tableEditor.js` — à contrôler avant de clore.

---

### 3. 📦 Export de profil AVEC les archives de plans

**Besoin KARMA (01/08)** : « j'ai importé N plans au fil du temps, tous en base locale ; j'exporte mon profil et je récupère liste/sessions/liaisons **mais pas les ZIP** — or je les ai supprimés de mon PC, la seule copie restante est dans la base du navigateur ».

**État : 🟡 récupération UNITAIRE livrée (v1.74.0), export FULL à faire.**

✅ Fait — bouton **💾 Télécharger le ZIP** dans la modale ℹ️ Infos d'un plan (`homeLoader.js > _afficherInfosPlan`). `PlanRegistry.getBlob(id)` était **déjà public** : il ne manquait que l'exposition. **3 états**, le bouton étant **affiché grisé plutôt que masqué** quand la récupération est impossible (sinon on cherche pourquoi certains plans l'ont et d'autres non) :
- plan **serveur** → pas de bouton (retéléchargeable, rien à sauver)
- **`storedBlob`** → actif ; nom de fichier = `originalFilename`, sinon reconstruit depuis nom+version
- **`fsHandle`** ou **re-sélection** → grisé + explication (le ZIP vit sur le disque, pas dans l'app)

⚠️ Garde-fou : `storedBlob` n'est qu'un **flag du registre**. Le navigateur peut avoir évincé l'archive sous pression de quota sans que le flag bouge → si `getBlob` rend vide, message explicite (« le navigateur l'a supprimée pour libérer de la place ») plutôt qu'un fichier vide téléchargé.

❌ **Reste — export FULL** (décisions déjà prises, non implémenté) :
- **Format** : conteneur **ZIP** (`profil.json` + `plans/<id>.zip`), **pas** le JSON actuel — le base64 inline gonfle de +33 % et `JSON.stringify` construit tout en RAM → plantage assuré sur mobile, risqué sur PC.
- **Compression `STORE`** : les ZIP de plans sont déjà compressés, recompresser coûte du temps pour rien.
- **Aller-retour** : à l'import, réinjecter les blobs en base **et** rattacher aux entrées du registre (flag `storedBlob`, collisions d'`id`). C'est ce qui a de la valeur, et c'est le gros du coût.
- **Sélection + garde-fou de taille** plutôt que tout-ou-rien : liste des plans avec tailles et total, refus/avertissement franc au-delà d'un seuil selon la plateforme (iOS plafonne autour de 50 Mo, Android/desktop plusieurs Go).
- **Piste RAM** : File System Access API (`showSaveFilePicker` + flux d'écriture) pour écrire sur le disque sans tout garder en mémoire — **Chrome/Edge desktop uniquement**, fallback blob ailleurs. [Probable — l'API de flux de JSZip existe, non testée ici]

## 🔴 Dettes ouvertes

### D0 — 🧲 Magnétisme C5 : rayon non plafonné en unités plan ✅ vérifié 01/08

**Symptôme constaté par KARMA** : magnétisme actif + cercles d'intersection actifs → un cercle apparaît alors que les deux tracés ne se touchent pas.

**Deux causes distinctes, ne pas les confondre** :

1. **Les cercles ne signalent pas un contact.** `road.js > _calculerIntersectionsRoads` pose un cercle sur 3 règles, dont **la règle 2** : une *extrémité* à moins de `ROAD_PROXIMITY_TOLERANCE` (**8 px plan**) d'un segment voisin. Comportement **pré-existant et intentionnel** (rattrape les T-jonctions dessinées à la main), mais trompeur à la lecture.

2. **Mon rayon d'accrochage n'a pas de plafond en unités plan.** Il est défini en **pixels écran** (`snapDrawPx`, 14) converti au clic. En projection simple, 1 px écran = `2^(-zoom)` unités plan → **dézoomé à z = −3, 14 px écran = 112 unités plan**. L'accrochage happe alors un sommet très éloigné et **déplace le point bien au-delà de ce que l'user considère comme proche**. J'avais raisonné sur le plancher (zoomé = plus fin, tant mieux) et **oublié le plafond**.

**Décision KARMA (01/08)** : ne pas ajouter le plafond pour l'instant ; **basculer `showRoadIntersections` à `false` par défaut** (fait en v1.74.0 — 4 emplacements : `DEFAULT_CONFIG`, la normalisation `=== true`, la sauvegarde des prefs, et le résolveur per-plan `getPlanShowsIntersections`). Les users ayant activé le toggle explicitement (per-plan ou global) le **gardent** — seuls ceux qui n'y ont jamais touché basculent.

> ⚠️ **Désaccord consigné (Claude)** : masquer les cercles supprime le *signal*, pas la *cause*. Dézoomé, le point reste déplacé jusqu'à ~100 unités plan de l'endroit cliqué — la géométrie du tracé est altérée sans que rien ne le montre, et ça se répercute sur le graphe d'itinéraire. Le correctif est un `Math.min(tolÉcran, ~15 unités plan)` d'une ligne dans `road.js > _snapSurSommetProche`, aligné sur `PROXIMITY_TOLERANCE` du pathfinder. **À reconsidérer si un tracé fait au magnétisme dézoomé se révèle déformé.**

**Non traité** : les points déjà déplacés par un accrochage dézoomé. Ils sont dans les données, aucun moyen automatique de les distinguer d'un accrochage voulu.

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
