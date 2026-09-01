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

**La règle vaut dans les DEUX SENS** (ajouté le 31/08/2026, après récidive) : une entrée qui traîne alors qu'elle est **soldée** coûte aussi cher qu'une dette ignorée — elle fait recommander un chantier déjà fait. Quand un lot tombe, **reclore la section le jour même** : ni « 🔜 vagues suivantes » orphelin, ni tableau de suivi laissé ouvert. Le seul état stable de ce fichier est *ouvert*.

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

### ~~2. 🎨 Légende — couleur des entrées par défaut~~ — ✅ SOLDÉ EN ENTIER (vérifié 31/08/2026)

Le sujet est **clos**, ses 5 étapes comprises. Vérifié dans le code, pas dans la doc :
`node scripts/check-style-canon.js` → **0 déclaration confrontée** (il ne reste plus une seule
couleur de type écrite à la main hors des 2 exceptions assumées) · `styleResolver.js` en-tête :
vagues 1 à 4 livrées · le **bug 2** (couleur d'un type custom perdue en KMZ, `styleId = "road_cust-…"`
jamais déclaré) est corrigé et **verrouillé par `check-kml-styles.js`** (22 contrôles, pré-commit
bloquant) · l'**override de couleur des built-in** — la demande d'origine — est livré
(`LegendCustomization.setColor` / `hasColorOverride`, couvert par `check-style-resolver.js`).

> 🩸 **Cette entrée a coûté une fausse recommandation le 31/08** : Claude a proposé « la vague 3,
> seule dette restante produisant une perte de donnée visible » — chantier terminé depuis v1.76.0.
> Cause : le « 🔜 Vagues suivantes » de cette section n'a jamais été reclos quand les vagues sont
> tombées. **C'est exactement le piège décrit en tête de ce fichier.** La contre-mesure est en haut
> (« avant de traiter une entrée, grep le symbole ») — elle n'avait pas été appliquée. Elle vaut
> aussi pour les sections **soldées** : une section qui reste ouverte alors qu'elle est finie coûte
> aussi cher qu'une dette non traitée.


### 3. 📦 Export de profil avec archives — ✅ LIVRÉ (v1.79.0), reste un lot optionnel

**Reste optionnel (lot 5, si un cas réel le demande)** : streaming FS Access (`showSaveFilePicker` + `generateInternalStream`, Chrome/Edge desktop) pour réduire le pic RAM de `generateAsync` sur les très gros exports. [Probable — API JSZip existante, non testée ici]

## 🧹 Code mort — audit du 09/08/2026 (2 agents indépendants + scan i18n)

> **Les lots ①②③④ sont EXÉCUTÉS (09/08, −~930 lignes, −1,92 Mo)** — leurs listes ligne à ligne
> ont quitté ce fichier, elles vivent dans les commits. Ne restent ici que **ce qui est ouvert**
> (🟡), **ce qui ne doit jamais être supprimé** (📌) et **les deux leçons** qui protègent le
> prochain nettoyage. Les 3 bugs latents sont tranchés : batterie fantôme **supprimée**
> (arbitrage KARMA — le chip header vit), toast OSM **ressuscité** (il visait un id inexistant),
> et le n°3 **révoqué** — cf. la leçon ci-dessous.
> ⚠️ Les numéros de ligne survivants sont ancrés sur `bbd954e` et **ont dérivé** depuis les
> suppressions du 09/08 : les re-vérifier avant d'agir, ne jamais les prendre au mot.

### ⚠️ Correctif d'inventaire préalable
La liste « règles CSS mortes » de l'audit du 09/08 matin (consignée dans le commit `a87311a`) était **majoritairement fausse** : sur 76 paires de sélecteurs dupliqués, **8 seulement sont intégralement mortes** — le reste est du *layering volontaire* de la refonte loader (override **partiel** : l'antécédent porte des propriétés qui survivent, le supprimer casse le layout). Toute suppression de jumelle doit être vérifiée **propriété par propriété**, jamais au sélecteur.

### 🩸 Leçon du faux fix — RÉVOQUÉ en v1.77.0 (à relire avant tout `cleanup`)
`_revokeTilesBlobUrls()` d'`osmHomePreview` était « jamais appelé malgré son commentaire », donc
branché — **à tort**. Il n'y avait pas de fuite : `_planDataCache` borne l'extraction à 1×/plan, et
le design v1.71.0 veut que les URLs vivent avec le cache (« re-ajout gratuit »). L'appel ajouté
révoquait les URLs du plan A **encore affiché** au chargement d'un plan B : multi-plans cassé, cache
empoisonné. Fonction et liste **supprimées** ; les tuiles hi-res (v1.77.0) ont leur propre cycle de
révocation.
> **« Jamais appelé » ≠ « à appeler ». Vérifier le DESIGN avant de brancher un cleanup.**

### 🟡 À vérifier avant de toucher
- Fragments de sélecteurs morts dans des groupes vivants (supprimer la ligne du sélecteur, pas le bloc) : `.kta-btn-action` 19843+, `.plan-card` ×4, `.kta-modal-btn-*` 17302/17312, `.kta-mesure-distance` 13606, `.drag-over` 16866, `.kta-rd-total-pill` 14621, `style-secours.css:829` — contrôle runtime (`querySelectorAll(...).length === 0`)
- `kta-toast-error/info` : classes **concaténées** (`"kta-toast-" + type`) — NON supprimables sans inventaire des `type`
- JS : événement `kta:imgLayerCalibChange` (0 listener — extension volontaire ?), `getTrackerLevel` (« phase 2B » — abandonnée ?), scope `kta-ses-modal` inexistant dans sessionExporter:3495 (bug de scope bénin ?), ~13 exports d'API publique jamais consommés (API = contrat, gain faible risque non nul)

### 📌 Mort documenté — gardé exprès, ne pas supprimer sans arbitrage KARMA
`_renderMultiLevelSection`/`_bindMultiLevelToggle` (interfaceConfig, 49 l., rétro-compat v1.7.3) · wrappers compat exporter/measure · `_proHashShort`/`_proSourceLabel` · dispatch `mktm:secours-scenario-mutated` (point d'extension pro) · `__ktaStyleCanon` (diagnostic) · `PERF_MODE_SIZE_BYTES` (alias rétro-compat) · `__MKTM_PRO_LICENSE__` (contrat d'en-tête) · branche mono-alerte d'alertChecker (**garde-fou réseau légitime** : une instance auto-hébergée peut servir l'ancien format) · `ktaCouperModesOutils` (console/debug)

### ✅ Résultats négatifs (hygiène confirmée, rien à faire)
108 fichiers js/ = 108 script tags = 108 entrées précache (zéro orphelin) · précache SW 188/188 présents sur disque · les 4 CSS lazy parfaitement cloisonnés (0 duplication avec style.css) · 29/30 icônes référencées · 0 id HTML orphelin.

## 🔴 Dettes ouvertes

### D-light-icons — 🎨 Thème clair PC : les émojis sortent du cadre à zoom 100 %, OK à 90 % — noté 09/08/2026

🔬 **hypothèse** — chez KARMA (Chrome FullHD, thème clair, wallpaper actif), les émojis en tête des boutons/titres de la colonne Actions (📦 Ajouter un plan, 🧰 Outils, 📔 Mon carnet, 🌀 Mes liaisons…) s'affichent **détachés du texte, à cheval sur le bord gauche** de leur conteneur. Disparaît à **zoom 90 %**. **NON REPRODUIT au harnais Playwright** malgré : clair + wallpaper simulé + 1920×937 + 1536×750 @ deviceScaleFactor 1.25 — émojis toujours inline dans les cadres, `text-indent: 0`. Vérifié aussi : CSS servi sur dev **bit-à-bit identique** au repo (hash), structure HTML = texte inline simple (« 📔 Mon carnet »). Pistes restantes pour la reprise : extension navigateur injectant du CSS sur les sites clairs (non écarté — test navigation privée pas fait), rendu Segoe UI Emoji à échelle fractionnaire (zoom 100 % sur scaling Windows 125 % = ratio effectif 1,25), largeur réelle de sa colonne au moment du bug. Cosmétique, contournement connu (zoom 90 %) — à reprendre avec une capture DevTools (Computed de `text-indent`/`display` sur un bouton touché).


### D-confirm — 🪟 confirm() natifs hors charte — ✅ **mesuré 31/08/2026 : 55 occurrences dans 17 fichiers**

Relevé du 31/08 (`grep` sur `js/`) : **55** `confirm()` natifs restants, dont **`secoursMode.js` en porte 15 à lui seul** (de loin le premier contributeur — c'est là qu'un sweep aurait le plus d'effet, et le plus de risque). Suivent `refonteInterface` 5, `homeConfig` 5, `interfaceItineraire` 4, `memInspector` 3, `homeLoader` 3, puis une longue traîne à 2 et 1. En face, **7 fichiers** utilisent déjà `ktaConfirm`.

`window.ktaConfirm` (utils.js, v1.76.2, Promise + charte) existe depuis le retour KARMA sur la popup de replanification d'itinéraire. Les natifs restants **migrent au fil de l'eau** quand on touche leur module — pas de sweep massif (risque de régression sur des flux critiques type suppression). Nouveaux usages : `ktaConfirm` obligatoire. Attention à la migration : `ktaConfirm` est **asynchrone** (le code qui suit un `if (!confirm(...)) return;` doit passer en `.then()`).

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
| D3 | **Toggle « Mes annotations » ne masque pas les polylines roads** sur certaines configs | 🔬 hypothèse — **mécanisme corroboré par le code le 31/08** | [`road.js:722`](../js/road.js#L722) : `return window.layerEditor \|\| window.map` — si `layerEditor` n'existe pas encore à l'`addTo`, la road part sur la map et **le toggle ne la reprendra jamais**. Le commentaire au-dessus (l. 716-719) documente lui-même le bug comme « Leaflet subtil non identifié » depuis le 09/05. **Diagnostiquer AVANT de fixer** (leçon du faux fix v1.77.0) : `window.layerEditor.hasLayer(<layer>)` sur les tracés récalcitrants, chez KARMA, sur un plan réel |
| D4 | ~~`<script>` inline d'`index.html` = monolithe~~ — **description PÉRIMÉE, corrigée le 31/08** | ✅ mesuré 31/08 | **305 lignes** d'inline sur 2 blocs, dans un fichier de 1 823. La v1.66.0 en a extrait 3 modules (`homeLoader`, `homeProfile`, `homeConfig`) : « monolithe » ne décrit plus l'objet. Reste de l'inline, mais ce n'est plus une dette prioritaire — **ne pas re-signaler sans re-mesurer** |
| D5 | **Vue OSM lot 3** — liaisons portails dessinées entre plans | ✅ vérifié (arbitré 01/08 : la traversée n'a pas de sens, seul l'affichage en a) | Intérêt réel = **diagnostic de géoréf** (l'écart entre les 2 bouts d'un portail révèle un mauvais calage). Coût principal = 6ᵉ catégorie dans le système de filtres |
| D7 | **Duplication ~2 fonctions** pickers géoréf ↔ picker départ tracker | ⚠️ doc seule — [`tracking.md`](architecture/tracking.md) | Seuil explicite : mutualiser **si une 3ᵉ cible apparaît**. Pas atteint → ne rien faire |
| D8 | **`secoursPlan.groupes[].statut`** — ⚠️ signalé mort par la doc, **il est exploité** | ✅ vérifié (doc corrigée) | Aucune action. Gardé ici comme rappel que la doc mentait |

## 🚫 Enterré volontairement — ne pas repayer

| Sujet | Statut |
|---|---|
| **Plein écran iPhone** | 2 tentatives (v1.9.2, v1.71.0), 2 rollbacks. ~47 px perdus, état stable. Un commentaire d'`index.html` **interdit une 3ᵉ tentative** sans diagnostic précis sur appareil |
| **QR Share Secours (Phase 4)** | Rollback structurel — densité QR v35+ illisible par les scanners. Remplacé par l'import consolidé v1.26 |
| **Import/Export Live** | Pause indéfinie, couvert par l'import consolidé |
| **Traversée de portail en Vue OSM** | Arbitré 01/08 : le mode OSM n'a ni position courante ni plan « où tu es » ; la pile multi-plans couvre déjà le besoin. Seul l'**affichage** des portails reste sur la table (D5) |

## ✅ Corrections d'inventaire — ne pas les re-signaler comme dettes

Signalées à tort (doc périmée), **elles sont faites** — vérifiées dans le code aux dates indiquées :
- **Heatmap** — active depuis v1.21.2 (chargée, précachée, 13 modules la consomment) · *01/08*
- **KMZ Secours Phase 2** — `_emitSecoursFolder` livré en v1.23.0 (Placemarks + Polygons cross-app) · *01/08*
- **`secoursPlan.groupes[].statut`** — exploité (cf. D8) · *01/08*
- **Migration du résolveur de styles (ex-§2, vagues 3 et 4)** — terminée. `check-style-canon` confronte **0 déclaration** · *31/08*
- **Bug 2 « couleur d'un type custom perdue en KMZ »** — corrigé en v1.76.0, verrouillé par `check-kml-styles.js` (22 contrôles) · *31/08*
- **Override de couleur des types built-in** (la demande d'origine du §2) — livré, couvert par `check-style-resolver.js` · *31/08*
- **ex-D6 « constantes `ITI_*` dupliquées »** — absorbé par le résolveur comme prévu ; les `ITI_*` survivants sont des constantes de **vitesse / pause / clés localStorage**, aucune couleur · *31/08*
- **`gpxIO.js` dans la migration des styles** — n'avait **rien** à migrer : le GPX n'a aucune notion de style · *31/08*
- **D1 « les PDF du Mode Histoire ne voyagent pas » — SOLDÉE** (v1.81.0) : case **opt-in décochée par défaut** dans l'export de profil (un plan peut porter 100 Mo), restauration **idempotente** qui conserve id, nom et date d'origine. Lecture/écriture via `window.JournalUi.histoire` — le schéma IDB n'a **pas** été recopié une 3ᵉ fois. Aller-retour prouvé en navigateur (contenu binaire intact, réimport sans doublon) + `check-profile-histpdf.js` (15ᵉ garde-fou, **falsifié 4×**) · *02/09*
- **D2 « contenus longs en espagnol » — SOLDÉE EN ENTIER** (v1.80.0) : ses 3 volets sont livrés — tutoriel (v1.79.4), doc user `README_USER.es.md` (3 501 lignes), et **Aide intégrée** (32 sections migrées du HTML en dur vers les dicos puis traduites ; `interfaceDocs.js` −1 738 lignes). Ajouter une 4ᵉ langue ne demande plus une ligne de code. Verrouillé par `check-aide-sections.js` (32 sections × 3 langues) et `checkup-langues.js` (parcours réel d un utilisateur espagnol) · *01/09*
- **Onboarding multilingue (part de D2)** — tutoriel migré fr/en/es en v1.79.4 (68 clés dans `es.json`) · *31/08*
- **D-home-mini « footer coupé sans scroll sous 760 px » — NON REPRODUITE, retirée** (v1.81.0) : rediagnostiquée sur **6 configurations** (1280→1920 × 500→768), footer déplié, 8 plans. Le contenu déborde (normal), **la molette scrolle** et le footer se rejoint **partout**. Deux postulats de la fiche d'origine étaient faux : la colonne Actions n'est pas « ~586 px incompressibles » (elle est **élastique** : 852 px à 1080 de haut, 520 px à 560), et `overflow-y:auto` sur `#planLoaderOverlay` date du **27/04** — donc antérieur à la mesure du 09/08, rien n'a été « réparé » entre-temps. 🩸 **Cause probable de la fausse mesure** : un overlay couvrait la page. Pendant le rediagnostic, **3 mesures successives** ont été faussées par le splash (retiré du DOM après 3,5 s, et `offsetParent` vaut `null` en `position:fixed` — donc l'attendre par `offsetParent` réussit trop tôt) puis par la modale `#kta-alert-modal` (« Accès hors-ligne », déclenchée quand le SW est bloqué). Les deux figent `scrollHeight` et mangent la molette : **exactement** le symptôme décrit. Comportement verrouillé par `scripts/smoke/checkup-home-scroll.js` (checkup de release, **falsifié 3×** : scroll cassé, modale laissée, splash non attendu) — il **refuse de conclure** si un overlay traîne, au lieu de rendre un faux vert · *02/09*
