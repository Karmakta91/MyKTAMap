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

**Extensions possibles plus tard** : Shapefile (lib ~50 Ko), import des styles SIG. ~~reprojection proj4~~ → **le Lambert 93 est LIVRÉ** (v1.82.0, sans proj4 : cf. ci-dessous).

✅ **Lambert 93 (EPSG:2154) — LIVRÉ le 03/09/2026.** Un export QGIS français en L93 n'est plus refusé : il est **reconnu et converti**, la conversion étant **annoncée** avec le nombre de coordonnées reprojetées (la règle du module reste « jamais de correction silencieuse » — on ne refuse plus, mais on ne convertit pas en douce non plus). **Sans `proj4`** : ~30 Ko pour couvrir des milliers de CRS quand on en veut un seul, dans un projet offline-first sans bundler dont `lib/` est volontairement minimal. La conique conforme de Lambert tient en ~50 lignes dans `sigImport.js`. ⚠️ **Le message de refus des AUTRES projections a été corrigé** : il citait le Lambert 93 comme cause probable, ce qui est devenu faux. Verrouillé par `scripts/check-lambert93.js` (17ᵉ garde-fou, **falsifié 7×**).

> 🎯 **Comment ce garde-fou est construit, et pourquoi c'est important** : il ne compare à **aucune table de référence**. Une table recopiée depuis un site web est elle-même une source d'erreur — si le chiffre est faux, le test valide le bug. Tout est déduit des **propriétés définitoires** de la projection : l'origine (3°E, 46,5°N) tombe *exactement* sur (700000, 6600000), le facteur d'échelle vaut *exactement* 1 sur les deux parallèles standard, l'échelle est identique dans toutes les directions (conformité), et l'aller-retour revient au point de départ. *L'aller-retour seul ne prouverait rien : deux fonctions fausses mais mutuellement inverses passeraient.*

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

## 🗺️ Atlas départementaux — découper un gros relevé en plans (03/09/2026)

**Le cas réel** : KARMA a fourni un relevé KML de la Gironde — **171 Mo, 4,1 M de lignes, 245 504 Placemarks** (233 286 galeries, 13 685 polygones, 1 471 points) couvrant **65 × 72 km**. Arborescence : six dossiers `niveau1` à `niveau6` (galeries + piliers par étage), un **topo historique** (JP Cassou), et une couche **« Zone de carrière souterraine répertoriée »** de **1 471 emprises nommées**.

🔒 **Le fichier ne doit JAMAIS partir sur git** — poids *et* sensibilité (localisation de carrières réelles, avec identifiants et nombre d'accès). Il était `untracked` **mais pas ignoré** : un `git add -A` l'aurait embarqué. Règle posée dans `.gitignore` sur la **racine** de `data/` (`*.kml`, `*.kmz`, `*.gpx`, `*.geojson`) — les 11 fichiers du plan de test restent suivis. Les sorties de découpage (`sorties-atlas/`) sont ignorées pour les mêmes raisons.

### En l'état : l'app refuse, et c'est correct

245 504 features contre `MAX_FEATURES = 20000` : **12× la limite**. Même sans cette borne, 171 Mo de XML dans `DOMParser` font plusieurs Go de DOM. Et surtout : **un plan MyKTAMap est une carrière, pas un département.** Le refus n'est pas le problème — ce qui manquait, c'est la **sortie**.

### ✅ Livré : `scripts/decouper-atlas.js`

Outil de **préparation de données**, hors navigateur, hors build. Lit le KML **en flux** (ligne à ligne : 171 Mo d'UTF-8 font ~340 Mo de string V8) et écrit un **GeoJSON** par carrière.

> 🎯 **Pourquoi du GeoJSON et pas un ZIP de plan** : l'app sait déjà faire le reste. Le fichier passe par > « Convertir depuis SIG », qui génère le **fond vierge calé** (`GpxImport.genererCanvasVierge`) et l'écran de > correspondance. Écrire ici un second générateur de ZIP serait une deuxième implémentation du même travail — la > dette classique de ce projet. **Bonus : ça fait passer l'import SIG sur des données réelles**, ce qu'il n'avait > jamais connu (cf. §1, la réserve qui traînait depuis la v1.7x).

**🩸 Trois pièges du format, payés en les découvrant :**

1. **Chaque emprise est un `<MultiGeometry>` : un `<Point>` de placement PUIS le `<Polygon>`.** Prendre le premier `<coordinates>` venu donne le point — une emprise d'un seul sommet, et **zéro galerie retenue**. Il faut viser `<outerBoundaryIs>`.
2. **Le niveau vient du `<Folder>` englobant, pas du Placemark** — et le fichier ne contient pas que des niveaux. Après `niveau6` viennent le topo historique et les emprises : sans changer de contexte, **tout retombait en « -6 »**. Première extraction : 16 676 features au niveau -6 pour une carrière qui en déclare **4 étages**. Le chiffre absurde est ce qui a révélé le bug.
3. **Les emprises ne sont pas du contenu de plan.** Ce sont les contours administratifs, y compris ceux des carrières voisines qui débordent dans la bbox. Les importer donnerait de fausses galeries épousant les limites de zone.

**Deux relevés se superposent** — le structuré par étages et le topo historique. Sur `Citon_Graves_RD` : **3 890 features** pour les six niveaux réunis, **16 612** pour le seul historique. Les mélanger dépasse la limite ET superpose deux relevés du même endroit. D'où `--couches niveaux|historique|tout`, **défaut `niveaux`** : c'est celui qui porte l'information d'étage dont le multi-niveau de l'app a besoin.

**Autres arbitrages** : une galerie est retenue **entière** dès qu'un de ses sommets tombe dans l'emprise (la découper produirait des tronçons orphelins et fausserait les longueurs) ; une **marge de 50 m** autour du contour évite de couper net des galeries au bord (`--marge`).

### Résultat mesuré — `Citon_Graves_RD` (carrière témoin choisie par KARMA)

| Étape | Mesure |
|---|---|
| Découpage de 171 Mo | **5,7 s**, 245 504 Placemarks lus |
| Emprise | 11 005 sommets · 1 335 × 1 580 m · 4 étages · 50 accès |
| Retenu (couche `niveaux`) | **3 890 features** — 1,56 Mo |
| Parse par `sigImport` | **44 ms**, CRS validé WGS84 sur 28 447 coordonnées |
| Colonnes détectées | `type` (galerie/pilier), `niveau` (-1 à -6), `couche` |
| Ventilation par famille | lignes : 6 niveaux · polygones : 5 — l'écran de correspondance a ce qu'il lui faut |

⚠️ **Non fait** : le plan n'a pas été **généré ni ouvert** dans l'app. Le parse, la validation CRS et l'analyse d'attributs sont prouvés ; la génération du ZIP, le rendu Leaflet et la navigation sur 3 890 objets ne le sont pas. **C'est l'étape suivante, et elle demande KARMA** — c'est aussi la première fois que le SIG verra un vrai plan.

### Ce qui reste ouvert

- **Le seuil de pertinence** : surface **médiane 196 m²**, 1 181 zones sur 1 471 n'ont qu'un étage. La grande majorité de ces « carrières » sont des petits vides ou des accès — un plan pour 196 m² n'a pas de sens. Un traitement en masse demandera un seuil, ou un regroupement par proximité.
- **Passe 1 ne retrouve que 1 204 emprises sur 1 471** : les Placemarks sans `outerBoundaryIs` exploitable sont ignorés. Sans conséquence pour une extraction ciblée, à creuser avant tout traitement de masse.
- **Le sort des plans produits** : mêmes données sensibles que la source. Ils ne vont pas sur git.

---

## 💡 Pistes de features — évaluées le 03/09/2026

> Demandées par KARMA (« que pourrions-nous envisager comme nouvelle feature ? »), classées par **valeur / effort**.
> Vérifiées **contre le code** avant d'être proposées : ni l'altitude, ni les formats topo, ni la reprojection > n'existaient. La **fusion de sessions**, elle, existe déjà (`sessionExporter.js` — `_fusionInputs`, > `_fusionMerged`) : **ne pas la reproposer**.

| # | Piste | Valeur | Effort | État |
|---|---|---|---|---|
| 1 | **Reprojection Lambert 93** | débloque les exports QGIS français, massivement en L93 | faible | ✅ **LIVRÉ 03/09** (cf. §1) |
| 2 | **Import VisualTopo (`.tro`)** | la cible **spéléo** de `CLAUDE.md` n'a aucun format topo lisible | moyen | 🔜 à lancer |
| 3 | **Profondeur des niveaux + profil en long** | la profondeur est la métrique reine du milieu souterrain | moyen-élevé | 💭 à concevoir |
| 4 | **Shapefile** | complète le SIG, mais contournable (QGIS sait exporter en GeoJSON) | moyen | 💤 basse priorité |

### 2. 🕳️ Import de formats topo spéléo — `.tro` d'abord

**Le trou** : `CLAUDE.md` annonce la spéléo comme cible, mais l'app ne lit **aucun** format de topographie — ni VisualTopo, ni Therion, ni Compass, ni Survex (vérifié par `grep` le 03/09 : zéro occurrence). Un spéléo doit passer par QGIS pour faire entrer **son propre relevé**.

**Pourquoi c'est abordable** : le socle est déjà là. `sigImport.js` a les parsers, l'écran de correspondance, et surtout `GpxImport.genererCanvasVierge` — la brique qui crée un plan **sans image de fond**. Un `.tro` est du texte tabulé (départ, arrivée, longueur, azimut, pente) ; le dérouler en coordonnées est de la trigonométrie simple, et ça produit des points + polylignes, soit exactement le modèle de données de l'app.

⚠️ **À confirmer par KARMA avant de coder** : que VisualTopo soit bien le format le plus répandu chez les cataphiles et spéléos français — c'est une **supposition** de Claude, pas une mesure. Se tromper de format ferait livrer un parser que personne n'utilise.

### 3. 📉 Profondeur des niveaux + profil en long

**Le trou** : les niveaux sont de **simples entiers** (`Set<number>`, cf. `multilevel-pathfinding.md`) — aucune notion d'altitude ou de profondeur nulle part dans `js/` (vérifié le 03/09). Leur donner une profondeur en mètres (saisie utilisateur, stockée **hors `data/`**) ouvrirait un **profil en long** d'itinéraire : distance en abscisse, profondeur en ordonnée.

C'est la seule des quatre pistes qui demande une **vraie conception d'interface**, pas juste un parser — d'où l'effort plus élevé. À reprendre quand 2 sera livré, ou si un utilisateur le demande.

---

## 🔴 Dettes ouvertes

> **Comment lire cette section.** Les dettes sont rangées par **qui doit agir**,
> pas par numéro : c'est la seule question utile quand on ouvre ce fichier.
> Une dette « bloquée sur KARMA » n'attend pas du code — elle attend une mesure
> sur sa machine, parce que le harnais ne sait pas la reproduire.
> Les entrées « aucune action » ne sont **pas** des dettes : ce sont des
> décisions déjà prises, gardées ici pour qu'on ne les re-signale pas comme
> des trous. Elles ne se soldent pas, elles se relisent.

| # | Sujet | État | Qui débloque |
|---|---|---|---|
| **D-light-icons** | Thème clair PC : émojis hors cadre à zoom 100 % | 🔬 non reproduit au harnais | **KARMA** — capture DevTools |
| **D3** | Toggle « Mes annotations » ne masque pas les roads | 🔬 mécanisme corroboré, non reproduit | **KARMA** — un `hasLayer()` sur un plan réel |
| **D-confirm** | 55 `confirm()` natifs hors charte | 📋 politique arrêtée, pas un chantier | personne — migration au fil de l'eau |
| **D0** | Magnétisme : rayon non plafonné en unités plan | ⚪ décision prise (v1.74.0) + désaccord consigné | aucune action |
| **D4** | `<script>` inline d'`index.html` | ⚪ description périmée, re-mesurée le 31/08 | aucune action |
| **D7** | Duplication ~2 fonctions (pickers géoréf ↔ tracker) | ⚪ seuil explicite non atteint | aucune action |
| **D8** | `secoursPlan.groupes[].statut` | ⚪ faux positif : le champ est exploité | aucune action |

---

### 🟠 Bloquées sur KARMA — pas de code à écrire, une mesure à faire

*Les deux sont **non reproductibles au harnais Playwright**. Les rouvrir sans
mesure fraîche, c'est répéter le faux fix de la v1.77.0 (révoqué). Ce qui
manque n'est pas du temps de dev, c'est une observation sur la machine où le
symptôme apparaît.*

#### D-light-icons — 🎨 Thème clair PC : les émojis sortent du cadre à zoom 100 %, OK à 90 % — noté 09/08/2026

🔬 **hypothèse** — chez KARMA (Chrome FullHD, thème clair, wallpaper actif), les émojis en tête des boutons/titres de la colonne Actions (📦 Ajouter un plan, 🧰 Outils, 📔 Mon carnet, 🌀 Mes liaisons…) s'affichent **détachés du texte, à cheval sur le bord gauche** de leur conteneur. Disparaît à **zoom 90 %**. **NON REPRODUIT au harnais Playwright** malgré : clair + wallpaper simulé + 1920×937 + 1536×750 @ deviceScaleFactor 1.25 — émojis toujours inline dans les cadres, `text-indent: 0`. Vérifié aussi : CSS servi sur dev **bit-à-bit identique** au repo (hash), structure HTML = texte inline simple (« 📔 Mon carnet »). Pistes restantes pour la reprise : extension navigateur injectant du CSS sur les sites clairs (non écarté — test navigation privée pas fait), rendu Segoe UI Emoji à échelle fractionnaire (zoom 100 % sur scaling Windows 125 % = ratio effectif 1,25), largeur réelle de sa colonne au moment du bug. Cosmétique, contournement connu (zoom 90 %) — à reprendre avec une capture DevTools (Computed de `text-indent`/`display` sur un bouton touché).

#### D3 — 🗺️ Toggle « Mes annotations » ne masque pas les polylines roads

🔬 **hypothèse — mécanisme corroboré par le code le 31/08.** Le symptôme n'apparaît que sur certaines configs.

**Mécanisme suspecté** : [`road.js:722`](../js/road.js#L722) fait `return window.layerEditor || window.map`. Si `layerEditor` n'existe pas encore au moment de l'`addTo`, la road part sur la **map** — et le toggle, qui n'agit que sur `layerEditor`, **ne la reprendra jamais**. Le commentaire juste au-dessus (l. 716-719) documente lui-même le bug comme « Leaflet subtil non identifié » depuis le 09/05.

**Ce qu'il faut avant tout code** (leçon du faux fix v1.77.0, révoqué) : sur un plan réel, chez KARMA, un tracé récalcitrant → `window.layerEditor.hasLayer(<layer>)`. S'il renvoie `false`, le mécanisme est confirmé et le fix est court. Sans cette mesure, on corrige à l'aveugle.

---

### 🟡 Sur la table — arbitrage ou avancement possible

#### D-confirm — 🪟 confirm() natifs hors charte — ✅ **mesuré 31/08/2026 : 55 occurrences dans 17 fichiers**

Relevé du 31/08 (`grep` sur `js/`) : **55** `confirm()` natifs restants, dont **`secoursMode.js` en porte 15 à lui seul** (de loin le premier contributeur — c'est là qu'un sweep aurait le plus d'effet, et le plus de risque). Suivent `refonteInterface` 5, `homeConfig` 5, `interfaceItineraire` 4, `memInspector` 3, `homeLoader` 3, puis une longue traîne à 2 et 1. En face, **7 fichiers** utilisent déjà `ktaConfirm`.

`window.ktaConfirm` (utils.js, v1.76.2, Promise + charte) existe depuis le retour KARMA sur la popup de replanification d'itinéraire. Les natifs restants **migrent au fil de l'eau** quand on touche leur module — pas de sweep massif (risque de régression sur des flux critiques type suppression). Nouveaux usages : `ktaConfirm` obligatoire. Attention à la migration : `ktaConfirm` est **asynchrone** (le code qui suit un `if (!confirm(...)) return;` doit passer en `.then()`).

---

### ⚪ Aucune action — décisions arrêtées, gardées pour mémoire

*Ce ne sont pas des dettes. Elles restent écrites parce que chacune a déjà été
re-signalée à tort au moins une fois : les effacer ferait repayer le
diagnostic. **Ne rien coder ici sans un fait nouveau.***

| # | Sujet | Preuve | Pourquoi on ne fait rien |
|---|---|---|---|
| D4 | `<script>` inline d'`index.html` — l'étiquette « monolithe » est **PÉRIMÉE**, re-mesurée le 31/08 | ✅ mesuré 31/08 | **305 lignes** d'inline sur 2 blocs, dans un fichier de 1 823. La v1.66.0 en a extrait 3 modules (`homeLoader`, `homeProfile`, `homeConfig`) : « monolithe » ne décrit plus l'objet. Reste de l'inline, mais ce n'est plus une dette prioritaire — **ne pas re-signaler sans re-mesurer** |
| D7 | **Duplication ~2 fonctions** pickers géoréf ↔ picker départ tracker | ⚠️ doc seule — [`tracking.md`](architecture/tracking.md) | Seuil explicite : mutualiser **si une 3ᵉ cible apparaît**. Pas atteint → ne rien faire |
| D8 | **`secoursPlan.groupes[].statut`** — ⚠️ signalé mort par la doc, **il est exploité** | ✅ vérifié (doc corrigée) | Aucune action. Gardé ici comme rappel que la doc mentait |

La suivante est ici pour la même raison, mais elle demande plus qu'une ligne : c'est un **arbitrage de KARMA avec un désaccord de Claude consigné en face**. Elle ne se rouvre que si le symptôme décrit en dernier paragraphe se manifeste.

#### D0 — 🧲 Magnétisme C5 : rayon non plafonné en unités plan ✅ vérifié 01/08

**Symptôme constaté par KARMA** : magnétisme actif + cercles d'intersection actifs → un cercle apparaît alors que les deux tracés ne se touchent pas.

**Deux causes distinctes, ne pas les confondre** :

1. **Les cercles ne signalent pas un contact.** `road.js > _calculerIntersectionsRoads` pose un cercle sur 3 règles, dont **la règle 2** : une *extrémité* à moins de `ROAD_PROXIMITY_TOLERANCE` (**8 px plan**) d'un segment voisin. Comportement **pré-existant et intentionnel** (rattrape les T-jonctions dessinées à la main), mais trompeur à la lecture.

2. **Mon rayon d'accrochage n'a pas de plafond en unités plan.** Il est défini en **pixels écran** (`snapDrawPx`, 14) converti au clic. En projection simple, 1 px écran = `2^(-zoom)` unités plan → **dézoomé à z = −3, 14 px écran = 112 unités plan**. L'accrochage happe alors un sommet très éloigné et **déplace le point bien au-delà de ce que l'user considère comme proche**. J'avais raisonné sur le plancher (zoomé = plus fin, tant mieux) et **oublié le plafond**.

**Décision KARMA (01/08)** : ne pas ajouter le plafond pour l'instant ; **basculer `showRoadIntersections` à `false` par défaut** (fait en v1.74.0 — 4 emplacements : `DEFAULT_CONFIG`, la normalisation `=== true`, la sauvegarde des prefs, et le résolveur per-plan `getPlanShowsIntersections`). Les users ayant activé le toggle explicitement (per-plan ou global) le **gardent** — seuls ceux qui n'y ont jamais touché basculent.

> ⚠️ **Désaccord consigné (Claude)** : masquer les cercles supprime le *signal*, pas la *cause*. Dézoomé, le point reste déplacé jusqu'à ~100 unités plan de l'endroit cliqué — la géométrie du tracé est altérée sans que rien ne le montre, et ça se répercute sur le graphe d'itinéraire. Le correctif est un `Math.min(tolÉcran, ~15 unités plan)` d'une ligne dans `road.js > _snapSurSommetProche`, aligné sur `PROXIMITY_TOLERANCE` du pathfinder. **À reconsidérer si un tracé fait au magnétisme dézoomé se révèle déformé.**

**Non traité** : les points déjà déplacés par un accrochage dézoomé. Ils sont dans les données, aucun moyen automatique de les distinguer d'un accrochage voulu.

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
- **D5 « liaisons portails sur OSM » — SOLDÉE, mais pas sous la forme prévue** (v1.81.0) : le premier jet dessinait une polyligne entre les deux bouts de chaque portail. **KARMA a cassé la prémisse le 02/09** : deux portails bien calés *se superposent déjà*, donc la ligne est de longueur nulle et le calque ne montre **rien** dans le cas nominal. D5 n'était pas un calque de contenu mais un **détecteur d'erreur de calage** — sa seule valeur est le cas raté. Arbitré le 03/09 : **contrôle qualité** (liste classée du pire au meilleur dans les filtres de la Vue OSM, clic = `fitBounds` sur les deux bouts) **+ badge `📐 Écart de calage` dans 🌀 Mes liaisons**, le calque restant en complément. Le calcul vit dans `InterPlanLinks.ecartCalage` — **fonction unique**, consommée par la Vue OSM et jamais recopiée (leçon du bug des icônes portail, la veille). Retourne **`null` et jamais `0`** quand la mesure est impossible : `0` dirait « calage parfait », le contraire de « je ne sais pas ». **Aucun seuil de couleur** — 20 m est énorme sur une petite carrière et négligeable sur un réseau de 5 km. ⚠️ **Prouvé au harnais** : API et badge (33 m mesurés sur deux plans calés à 33 m, `null` sans géoréf). **Non exécuté** : la liste de la Vue OSM — le plein écran exige des plans réellement chargeables, hors de portée du harnais. À valider sur de vrais plans · *03/09*
