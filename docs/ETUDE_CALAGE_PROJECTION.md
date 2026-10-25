# Étude — Calage en vraie projection

> Étude du 25/10/2026, **décidée** par KARMA le même jour (QCM, §5) et livrée. Les §1 à §3 décrivent le calage
> **avant** le lot (mesures de référence) ; l'état actuel du calage est dans `docs/architecture/vue-osm.md` §2.2.
> Cas mesurés 100 % fictifs.

## Le problème

Le calage A / B (C) convertit les degrés en mètres par deux **constantes fixes** (111 320 m par degré de
longitude × cos(latitude moyenne), 110 540 m par degré de latitude), puis cale le plan par une similitude
(2 points) ou une affine (3 points) dans ce repère. Deux défauts s'additionnent :

1. **Les constantes sont fausses sous nos latitudes.** 110 540 est le degré de méridien à l'équateur : entre
   43° et 49° le vrai degré vaut 111 093 à 111 210 m (écart 0,50 à 0,60 %) ; 111 320 × cos est trop court de
   0,16 à 0,19 %. Le repère est donc **anisotrope de 0,34 à 0,41 %** : un carré du terrain y devient un
   rectangle. C'est la cause principale (c'est aussi le « ≤ 0,4 % » toléré par `tiffGeoref.js > _matrice`).
2. **L'équirectangulaire n'est pas conforme** : un seul cos(latitude) pour tout le plan. Effet du second ordre,
   qui domine dès qu'on corrige le premier (≈ 3 m à 6 km).

A et B (et C) restent exacts par construction ; tout le reste dérive. Les points **hors du plan** (GPX, position
GPS de surface, coordonnée collée) dérivent encore plus (§2.4).

## 1. Inventaire (vérifié dans le code)

### 1.1 Format stocké

- `plan-config.json > plan.georef = { pointA, pointB, pointC? }`, chaque point `{ x, y, lat, lng }` à plat
  (pixels image, y vers le bas ; WGS84), plus `estimated: true` sur un B déduit (`config.js > ktaEstimerPointB`).
  **Aucun champ de projection, de CRS ni de version de modèle.** Le format est décrit dans
  `docs/architecture/vue-osm.md` §2.2 (cascade georef, point C) ; `data-formats.md` ne le décrit pas.
- Copie locale : `localStorage["myktamap_kmz_calib_<planId>"]` (`kmzExport.js > get/setCalibration`), même
  objet. `main.js > _propagerGeorefVersKmzExport` copie `plan.georef` **entier** au chargement, mais
  🩸 **respecte un calage local existant** dont les points sont dans le plan : un champ ajouté à
  `plan.georef` n'atteindrait pas un plan déjà calé à la main.
- Le registre (`PlanRegistry`) garde aussi `p.georef` pour le HOME.
- L'import GeoTIFF (`tiffGeoref.js > calage`) connaît l'EPSG du fichier (2154, 3857, 4326) mais **ne le garde
  pas** : il remplit les champs du Générateur (`createConf.js`), en texte à 6 décimales (≈ 0,1 m).

### 1.2 Le calcul : une source, quatre copies

| Où | Rôle | Constantes |
|---|---|---|
| `kmzExport.js > buildTransform(Calib) / planToGps / gpsToPlan` | **le** calage, partagé | 111 320 · cos, 110 540 |
| `config.js > ktaEstimerPointB` | B déduit de A + échelle + nord | **111 320 en latitude aussi** (§2.5) |
| `kmzImport.js > buildTransform / gpsToPixel` | import KMZ (coins du GroundOverlay) | 111 320 · cos, 110 540 |
| `tiffGeoref.js > _matrice` | test « similitude » d'un GeoTIFF 4326 tourné | idem |
| `geotiffExport.js > calculerGeoref` | mesure du résidu de l'affine en 4326 | idem |

Les vraies projections existent déjà, exactes et testées : `sigImport.js > L93` (conique conforme GRS80, aller
et retour) et `> WEBMERC`. Garde-fous : `check-lambert93.js` (propriétés définitoires du L93),
`check-geotiff.js` L7 (aucune math de projection recopiée dans `tiffGeoref.js`).

### 1.3 Consommateurs (tous par `KmzExport`)

`createConf.js` (validation de la saisie), `interfaceConfig.js` (Réglages), `main.js` (propagation),
`osmView.js` (tuiles V2 posées par 3 coins chacune, POI, tracés, zones), `osmHomePreview.js` (widget HOME,
recherche), `kmzExport.js` + `sessionExporter.js` (KMZ : `gx:LatLonQuad`, Placemarks), `gpxIO.js` (GPX
aller-retour), `gpxImport.js` (plan vierge calé sur l'emprise d'un GPX), `geojsonExport.js` (4326 / 2154),
`geotiffExport.js` (affine ajustée), `sigImport.js` (import SIG : `gpsToPlan`, canvas calé sur l'emprise),
`searchPoints.js` (coordonnée collée → plan), `emergencyMode.js` et `secoursMode.js` (coordonnées données aux
secours), `interPlanLinks.js` (écart de calage des liaisons), `utils.js`.

Le pro ne fait **aucune** math de calage (vérifié par `git grep` sur `Karma_dev`) : il sert le front community.

### 1.4 Ce qui écrit un calage

Générateur (saisie, import GeoTIFF, import KMZ), Réglages (`interfaceConfig.js`), modale KMZ
(`sessionExporter.js > _kmzLireCalib`, qui fusionne le point C stocké), import SIG
(`sigImport.js > genererZipMyktamap`), import GPX en plan vierge (`gpxImport.js`).

### 1.5 Ce qui rend la migration délicate

Deux familles de plans calés existent, et un changement de modèle les traite à l'opposé :

- **Plans « terrain »** (scan d'un relevé, GeoTIFF, calage saisi) : les pixels décrivent le terrain. Le
  nouveau modèle les **rapproche** de la vérité, du montant de l'erreur actuelle (§2.3).
- **Plans « fabriqués depuis des degrés »** (import SIG, GPX en plan vierge) : chaque objet a été posé par
  `gpsToPlan` **du modèle actuel**. L'aller-retour est exact aujourd'hui ; avec un autre modèle, ces objets
  **s'éloignent** de leur position source du même montant. Idem, à moindre échelle, pour les objets importés
  par GPX / SIG / coordonnée collée dans un plan terrain.

Rien dans `plan.georef` ne distingue les deux familles. Un plan SIG se reconnaît à sa couche `id: "sig"` sur un
canvas vierge, un plan GPX vierge à peine : heuristique fragile.

## 2. Mesure

Script Node autonome (vérités fictives, aucune donnée de l'app) : erreur entre le `planToGps` d'un modèle et la
position vraie, aux coins, au centre et au maximum d'une grille 17 × 17. Pixel 0,25 m, plan carré de côté
1, 3 et 6 km, latitudes 43° et 49°, longitudes 3° et 7° (convergence L93 nulle / ≈ 2,9°), nord en haut et
tourné de 30°. Calage comme l'import GeoTIFF : A = coin sud-ouest, B = nord-est, C = nord-ouest.
Deux vérités :

- **L93** : le pixel est une similitude du Lambert 93 (GeoTIFF exporté de QGIS).
- **SOL** : le pixel est une similitude du terrain (relevé en vraies distances), plan tangent au centre,
  ellipsoïde GRS80 exact (ECEF).

La longitude ne change rien à 0,35 m près : seuls 43° / 49° sont rapportés. Erreurs en mètres.

### 2.1 Modèle actuel

| Cas | 1 km | 3 km | 6 km |
|---|---|---|---|
| L93, nord en haut, 2 points — max (coin NO) | 2,5 / 3,0 | 7,8 / 9,3 | 16,6 / 19,9 |
| idem — coin SE | 2,4 / 2,9 | 6,8 / 8,2 | 12,7 / 15,5 |
| idem — centre | 0,04 / 0,05 | 0,4 / 0,4 | 1,5 / 1,8 |
| L93, tourné 30°, 3 points — max | 0,10 / 0,11 | 0,9 / 1,0 | 3,8 / 4,0 (4,4 à 7°E) |
| SOL, nord en haut, 2 points — max | 2,5 / 3,0 | 7,8 / 9,4 | 16,5 / 20,0 |
| SOL, nord en haut, 3 points — max | 0,15 / 0,18 | 1,3 / 1,6 | 5,3 / 6,5 |

(43° / 49°.) Le backlog annonçait 2 à 12 m sur 1 à 6 km : c'est le coin SE ; le coin NO d'un carré de 6 km
atteint **17 à 20 m**. Le point C absorbe l'anisotropie (défaut 1) mais pas la non-conformité (défaut 2).

### 2.2 Options (max sur la grille, pire des cas mesurés)

| Option | L93, 2 pts, 6 km | L93, 3 pts, 6 km | SOL, 2 pts, 6 km | SOL, 3 pts, 6 km | 1 km, tout cas |
|---|---|---|---|---|---|
| Actuel | 19,9 | 4,4 | 20,0 | 6,5 | ≤ 3,0 |
| (b) rayons vrais à la latitude moyenne | 3,1 | 4,4 | 3,2 | 6,5 | ≤ 0,18 |
| (c) affine 4 coins, moindres carrés | 1,6 | — | — | — | ≤ 0,04 |
| (a) Lambert 93 | **0** | **0** | 0,17 | 0,34 | ≤ 0,01 |
| (d) plan tangent local (ENU) | 0,17 | 0,33 | **0** | **0** | ≤ 0,01 |

- (b) corrige le défaut 1 seulement : bon en 2 points, sans effet en 3 points.
- (c) suppose quatre points connus (vrai pour un GeoTIFF, jamais pour une saisie) et garde 1,6 m à 6 km.
- (a) est exact pour un GeoTIFF Lambert 93, à 0,34 m d'un relevé terrain à 6 km ; **France seulement**.
- (d) est exact pour un relevé terrain, partout sur Terre, et reste **sous 0,35 m** pour un GeoTIFF L93 à 6 km :
  l'objectif du backlog (« coins d'un GeoTIFF importé à moins de 1 m ») est tenu sans connaître le CRS.

### 2.3 Combien bougent les plans déjà calés

Écart entre le modèle actuel et (d), A et B fixes, max sur le plan (= l'erreur actuelle d'un plan terrain) :

| Côté du plan | 0,5 km | 1 km | 3 km | 6 km |
|---|---|---|---|---|
| 43° | 1,2 | 2,5 | 7,7 | 16,5 |
| 49° | 1,5 | 3,0 | 9,4 | 20,0 |

Un plan terrain gagne ces mètres ; un plan fabriqué depuis des degrés (§1.5) les perd.

### 2.4 Hors du plan

Plan de 1 km à 46,5°, point à 2 km à l'ouest et 2 km au nord du centre (hors de la diagonale A-B) : modèle
actuel **11,6 m**, (d) 0 ; à 5 km / 5 km : **31,6 m**, (d) 0. Concerne la position GPS de surface, un GPX,
une coordonnée collée, et les coordonnées données aux secours pour une entrée éloignée du calage.

### 2.5 `ktaEstimerPointB`

B estimé à 1 000 m plein nord de A : posé à 998,0 m réels (43°) / 999,0 m (49°), mais **le moteur y lit
993,0 m** (111 320 contre 110 540) : l'échelle déduite du couple A / B est fausse de 0,7 % dans cet axe
avant même l'erreur de modèle. À corriger avec le reste (même module, même modèle).

### 2.6 Export GeoTIFF

L'affine écrite dans le fichier est ajustée sur `planToGps` (`geotiffExport.js > calculerGeoref`). Résidu max,
vérité SOL, nord en haut (43° / 49°) :

| Export | 1 km | 3 km | 6 km |
|---|---|---|---|
| 4326, modèle actuel | 0 | 0 | 0 |
| 4326, modèle (d) | 0,04 / 0,05 | 0,34 / 0,42 | 1,4 / 1,7 |
| 2154, modèle actuel | 0,04 / 0,05 | 0,36 / 0,41 | 1,5 / 1,6 |
| 2154, modèle (d) | 0 | 0,02 | 0,08 |

Le 0 du 4326 actuel n'est qu'une cohérence avec un modèle faux ; avec (d) le résidu 4326 devient réel (une
affine en degrés ne peut pas représenter le terrain) et il est déjà affiché au-delà de 0,5 m. Le Lambert 93
devient quasi exact : c'est l'export à proposer en premier pour un plan en France.

### 2.7 Coût (Node, poste ; un téléphone est 5 à 10 fois plus lent)

| Modèle | µs par `planToGps` |
|---|---|
| Actuel | 0,04 |
| (b) | 0,06 |
| (a) Lambert 93 (inverse itérative) | 0,78 |
| (d) ENU, inverse géodésique itérative | 0,70 |
| (d) ENU, inverse de Bowring en une passe (écart à la vérité < 5 mm à 6 km) | **0,15** |

100 000 sommets (gros plan en Vue OSM ou en export) : ≈ 15 ms au poste, 0,1 à 0,15 s sur téléphone pour (d)
rapide, contre 0,03 s aujourd'hui. Acceptable ; (a) et (d) itératives coûteraient 5 fois plus.

## 3. Options chiffrées

- **(a) Lambert 93** — résidu à 6 km : 0 pour un GeoTIFF L93, 0,34 m pour un relevé terrain. France
  métropolitaine seulement. Il faut garder le CRS du plan (`georef.crs`), une branche par CRS dans `kmzExport`,
  et appeler `SigImport.L93` (chargé **après** `kmzExport.js` dans `index.html`). Perf mobile ×20. Risque : deux
  modèles selon l'origine du plan, aucune réponse hors de France.
- **(b) Rayons vrais** — 3,2 m (2 points) et 6,5 m (3 points) à 6 km. Partout, 2 constantes à changer, perf
  ×1,5. Ne tient pas l'objectif.
- **(c) Affine aux moindres carrés** — 1,6 m à 6 km, et seulement avec 4 points connus : un `pointD` dans tout le
  circuit (saisie, Réglages, KMZ) pour n'aider que le GeoTIFF. Perf ×1.
- **(d) Plan tangent local (ENU)** — 0 pour un relevé terrain, 0,33 m pour un GeoTIFF L93 à 6 km. Partout.
  ≈ 50 lignes dans `kmzExport.js`, une version de modèle à stocker, perf ×3,5 (Bowring).

Toutes les options changent la position des objets d'un plan déjà calé (§2.3) : la question de migration
(§4.3) est la même quelle que soit l'option.

Options écartées : **proj4** (≈ 30 Ko pour un seul besoin, déjà refusé pour l'import SIG) ; **Transverse
Mercator locale** (conforme, non mesurée ici ; séries de Krüger plus longues à écrire et à vérifier que (d)) ;
**polynôme du second degré ajusté sur le modèle exact** (perf actuelle, mais extrapole mal hors du plan, §2.4).

## 4. Recommandation : (d) plan tangent local, versionné

**Un seul modèle, (d)** : similitude (2 points) ou affine (3 points) dans le plan tangent local à l'ellipsoïde
GRS80, centré sur le barycentre des points de calage ; inverse géodésique de Bowring en une passe. Il tient
l'objectif du backlog sans connaître le CRS, ne dépend d'aucune zone (mesuré à 43° et 49° seulement), et reste
exact pour ce que l'app décrit le plus souvent : un relevé en vraies distances. (a) n'apporte que les 0,3 m
restants d'un GeoTIFF L93 de 6 km, au prix d'un second modèle : à garder en réserve (Q3).

**Versionné** : `georef.modele = "local"` écrit par tout nouveau calage ; **absent = modèle actuel, bit à bit**
(même règle que « sans C, similitude identique »). Aucun plan ne bouge sans un geste ou une règle décidée.

### 4.1 Ce qui est livré

- **Moteur** (`kmzExport.js`) : modèle `"local"` (plan tangent GRS80 au barycentre des points, aller ECEF, retour
  de Bowring ; l'inverse prend le point sur la normale qui coupe le plan, donc aller-retour exact). Sans `modele`,
  le code historique tourne tel quel. Le moteur est la **seule source** des conversions degrés ⇄ mètres
  (`metresParDegre`, `decalerGps`, `distanceM`, `EQUI_HISTORIQUE`) : `kmzImport.js`, `tiffGeoref.js`,
  `geotiffExport.js` et `config.js > ktaEstimerPointB` passent par lui.
- **Écrivains** : Générateur (saisie, import GeoTIFF), Réglages, modale KMZ, import SIG, GPX vierge, B estimé →
  `"local"` ; réenregistrer le même calage historique le garde (`KmzExport.modeleSaisie`).
- **Recalage** : Réglages > Géoréférencement affiche « ± X aux coins » (`precisionCalage`) et, pour un calage
  historique, « Recaler en projection exacte », qui annonce le déplacement maximal aux coins avant d'écrire.
- **Propagation** : `main.js > _accorderModeleCalage` (le `"local"` gagne dans les deux sens).
- **Import KMZ** : modèle historique, documenté (`LatLonBox` linéaire en degrés).
- **Garde-fou** `scripts/check-calage-projection.js` (pre-commit, donc CI) ; checkup navigateur
  `scripts/smoke/checkup-calage-projection.js`.

Mesuré après le lot (garde-fou, vérités fictives, 43° / 49°, 1 et 6 km, nord en haut et tourné, 2 et 3 points) :
relevé terrain **≤ 1,3 mm** ; GeoTIFF Lambert 93 **≤ 0,335 m** à 6 km ; modèle historique inchangé au bit près
(20,0 m sur le même cas). Checkup, relevé fictif de 1 000 × 563 m : coins à 1,90 m avant recalage, 0,000 m après ;
KMZ / GPX / GeoJSON 1,04 m → 0,001 m ; GeoTIFF WGS84 1,90 → 0,024 m, Lambert 93 1,88 → 0,000 m ; Vue OSM 1,38 →
0,000 m.

## 5. Décisions (QCM du 25/10/2026)

| # | Sujet | Décision |
|---|---|---|
| 1 | Plans déjà calés | Gardés bit à bit ; « Recaler » annonce le déplacement ; nouveau calage → `"local"` |
| 2 | Modèle | Plan tangent local (GRS80) partout |
| 3 | Lambert 93 exact (CRS mémorisé) | Plus tard, sur un cas réel (`docs/BACKLOG.md`, Plus tard) |
| 4 | Précision affichée | Oui, « ± X aux coins », calculée sur le plan (Réglages) |
| 5 | Export GeoTIFF | WGS84 reste le défaut ; résidu annoncé au-delà de 0,5 m |
| 6 | Import KMZ | Inchangé, documenté |
| 7 | `ktaEstimerPointB` | Corrigé (passe par le moteur) |
| 8 | Constantes recopiées | Une seule source, le moteur ; le garde-fou refuse les copies |
