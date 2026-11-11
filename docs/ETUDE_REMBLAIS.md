# Étude — Remblais partiels (hauteur de comblement)

> Étude ouverte le 11/11/2026 à la demande de KARMA. **Rien n'est tranché** : le QCM en fin de document attend ses
> réponses. Aucun code de l'app n'a été modifié pour l'écrire ; chaque fait de l'état actuel renvoie à
> `fichier > fonction` (lu sur `Karma_dev`, commit `032b1b29`).

## Le besoin

Sur une carrière de 10 m de haut, une zone est remblayée jusqu'au ciel, une autre à moitié, une troisième à peine :
sur un même niveau, la hauteur de vide varie du tout au tout, et l'on marche très souvent **sur** du remblai. La zone
« Remblais » ne sait dire qu'une chose : « ici, du remblai ». En 3D c'est un obstacle ; on voudrait y monter par une
pente douce, marcher dessus sous le ciel, ramper là où il reste peu de vide, et buter seulement là où il n'en reste
plus.

La question de fond : **un nouveau type de zone** ou **un champ de plus sur le remblais existant** ?

## Ce que fait le code aujourd'hui

### Deux constats qui contredisent l'énoncé

1. **[Certain] En 3D, le remblais n'est pas un comblement total : c'est un volume à 60 % de la hauteur.**
   `js/vue3d.js > HAUTEUR_REMBLAIS = 0.6`, partagé avec l'effondrement (`_construireTuile`, `_zoneGalerie`,
   `_remblaisGalerie`). Choix de l'étude 3D (`docs/ETUDE_VUE_3D.md`, QCM du 01/11/2026, question 4 : « volume à 60 %
   de la hauteur ») : on voit par-dessus et l'on lit la galerie au-delà. Il bloque pourtant le pas comme un mur.
   Seul le **volume exploité** le compte comme total (`js/volumeExploite.js > calculer` : `remblaisM3 = remblaisM2 × h`).
2. **[Certain] Le remblais ne bloque pas l'itinéraire, même « total ».** Seules les zones `inaccessible` et les murs
   en ligne sont des contraintes dures (`js/pathfinder.js > _collecterZonesInaccessibles`, `_collecterObstaclesDurs`,
   `_buildGraph`). Le remblais n'est qu'un type **évitable à la demande** (préférence d'itinéraire `avoidZones`,
   `getAvoidableZoneTypes`, évitement souple relâché en passe 2), coché d'office seulement dans les options brancard
   du Secours (`js/secoursMode.js > BRANCARD_COCHES = ["eau", "remblais"]`). « Total = bloqué comme aujourd'hui »
   n'existe donc pas : le décider serait un **changement** de comportement (question 10).

### Donnée

- Une zone = `{ type, points, level?, niveaux?, description?, uid, updatedAt }` (`docs/architecture/data-formats.md`,
  zones et zones sur plusieurs niveaux). Aucun champ de hauteur. Le type `remblais` est le défaut de l'import SIG
  (`js/sigImport.js`, `zoneDefaut = opts.zoneType || "remblais"`) et de l'import du Générateur
  (`js/createConf.js`, option `remblais` sélectionnée).
- Session : les zones partent entières (`js/sessionPersist.js`, `zones: window.getZones()`), un champ de plus survit.
- 🩸 **Zones embarquées (calques, plan-config) : copie champ par champ.** `js/utils.js`, construction de l'entrée
  poussée dans `window._ktaDataPolygons` (type, points, level, niveaux, description, uid, updatedAt) : un champ
  nouveau y serait **perdu en silence** à la lecture d'un calque. Même risque dans `getAllEmbeddedZones`, l'export KMZ
  (`js/kmzExport.js`, `ExtendedData` `mkm:*` écrites une à une) et sa relecture (`js/kmzImport.js`, `mkm:*` lues une
  à une), le GeoJSON (`js/geojsonExport.js`, propriétés posées une à une).
- Tableur : colonnes **détectées** depuis les données (`js/tableEditor.js > _detecterColonnes`, ordre courant), avec
  des éditeurs dédiés pour `level` et `niveaux` ; un champ numérique neuf apparaîtrait en texte libre, sans contrôle.
- Fiche de la zone : `js/utils.js > attacherNotePopup`, qui sait déjà ajouter un bloc propre à un type ou à un
  contexte (`_niveauxZoneHtml`, `_niveauxPenteHtml`) — le précédent à suivre.

### Rendu 2D, légende

- Style unique par type : `js/styleResolver.js > CANON.zones.remblais` (aplat gris, `fillOpacity` 0,7), sans motif.
  Le seul motif de zone est celui de `inaccessible` (`_motif`, `_motifCanvas`, un `CanvasPattern` par clé, peint sur
  le canvas commun : il passe sous les structures). Rien ne varie par objet.
- Empilement : `eau < remblais < effondrement < inaccessible < structures` (`js/zones.js > renderZones`, `ordreType`).
- Légende in-app (`js/interfaceLegende.js`, `_ligneZone("remblais")`), filtres (`js/filterPanel.js`), légende PNG
  (`js/exporter.js`), pastille ⬛ (`js/ktaIcones.js`, classée « la couleur est l'information »).
- Palettes délibérées hors canon : `js/emergencyMode.js` (mini-carte d'urgence), `js/osmView.js`,
  `js/osmHomePreview.js`.

### Vue 3D

- **Volume** : `_prisme(…, 0, h × HAUTEUR_REMBLAIS, …)` en chambre et structures (`_construireTuile`), découpé à
  chaque pièce du tube en galerie (`_zoneGalerie` → `_remblaisGalerie`, faces seulement côté galerie). Texture
  `REMBLAIS` (terre, cailloux) avec 🧱, `EBOULIS` pour l'effondrement.
- **Règle du pas** : `js/galerieEmprise.js > ZONES_BOUCHENT = { remblais, effondrement, inaccessible }`, indexées par
  niveau (`_indexZones`) ; `zonesBloquent` et `dansZone` arrêtent le pas dans les trois rendus
  (`js/vue3d.js > _juger`, `_coince` : un départ dedans est ramené au bord). L'emprise de galerie exclut le remblais
  (`dedans` : `!m.enRemblais(x, y)`). Le pas est un **booléen** : aucune notion de hauteur de sol par zone.
- **Hauteur de galerie** : une par niveau (`js/config.js > getNiveauVertical`, `_hauteurResolue` : plan-config du
  Générateur, puis réglage), 2 m par défaut (`js/vue3d.js > HAUTEUR_DEFAUT`), bornes 1,5 à 20 m (`HAUTEUR_REGLAGE`).
  Œil à 1,6 m au plus, 80 % de la hauteur sinon (`_oeil`). Plafond plat à `e.hauteur` (`_placerCamera`).
- **Sol qui monte, déjà là** : la galerie inclinée d'un tracé `jonction` et la zone jonction (type `pente`) portent un
  sol variable (`_pentesDuNiveau`, `_surPenteDe` → `dy`, `_solPlace`) ; caméra, avatar et ruban suivent ce `dy`. C'est
  le mécanisme à généraliser.
- **Ramper, déjà là** : la chatière abaisse l'œil vers 0,35 m sans arrêter le pas, en douceur sur 1 m d'approche
  (`CHATIERE`, `_baisseChatiere`, `e.ramper` dans `_placerCamera`).
- **Itinéraire par-dessus** : ruban, chevrons et marqueurs sont posés sur le dessus du volume avec une contremarche
  aux faces (`ITI_SUR`, `_volumesIti`, `_dessusIti`, `_morceauxIti`). `_dessusIti` lit déjà une hauteur propre au
  volume (`v.h`) avant la constante : la prise existe.
- **Mini-carte** : dessine les zones de `ZONES_BOUCHENT` (`_donneesMiniCarte`).
- Garde-fou : `scripts/smoke/checkup-vue-3d.js` § 24 bis (3 zones × 4 contextes, 2D identique avec et sans zones).

### Itinéraire, guidage, Secours

- Graphe : un segment de tracé entre au graphe ou non (`_buildGraph`) ; son poids est sa longueur, hypoténuse pour une
  jonction (`_poidsSegment`). **Aucun coût par zone.**
- 🩸 **Le coût EST la distance affichée** : `totalDistance = dist[end]` du Dijkstra (`js/pathfinder.js`, retour de la
  recherche), repris par la sortie d'urgence (classement) et l'inter-plans (portails au coût réel). Pondérer un
  segment gonflerait les mètres annoncés.
- Guidage : distances le long du trajet, temps restant à l'allure de l'itinéraire (`docs/ETUDE_GUIDAGE.md`,
  encart « reste ») ; rien sur le terrain traversé.

### Volume exploité

`js/volumeExploite.js > calculerAires` : bandes verticales exactes ; remblais = **union** des zones `remblais` du
niveau, coupée au secteur, moins les piliers ; `vide = exploité − remblais`, volumes = aires × hauteur du niveau.
Une zone sur plusieurs niveaux compte sur chacun. Garde-fou : `scripts/check-api-surface.js` (valeurs à la main),
`scripts/smoke/checkup-volume-exploite.js`.

### Mentions antérieures

`docs/BACKLOG.md` : « Désactiver un type par défaut » cite la zone Remblais (sans rapport). Rien dans `docs/IDEES.md`
ni `docs/DECISIONS_FERMEES.md`. La seule décision qui touche le sujet est la question 4 de l'étude 3D (60 %).

## Options

### A. Où vit la hauteur

| Option | Pour | Contre |
|---|---|---|
| **A1. Un champ sur la zone `remblais`** (absent = total) | Une seule notion pour l'utilisateur ; zones existantes intactes ; aucune liste de types touchée | Chaque lecteur de zone doit relayer le champ (copies champ par champ ci-dessus) |
| A2. Nouveau type « Remblai partiel » | Rendu et règles séparés d'office | 21 fichiers JS et 118 occurrences listent les types de zone en dur (mesuré sur `effondrement`), 6 garde-fous, 3 dicos ; deux types pour une même matière, et la hauteur resterait à saisir dans le nouveau |
| A3. Type personnalisé de légende | Rien à coder | Aucun comportement (ni 3D, ni volume, ni itinéraire) |

### B. Ce qu'on enregistre

| Option | Pour | Contre |
|---|---|---|
| **B1. Part de la hauteur de galerie** (0 à 1) | Suit la hauteur du niveau quand on la corrige (2 m par défaut → 10 m réglés : « à moitié » reste à moitié) ; colle à la façon de dire du terrain (« à moitié ») | Le vide restant en mètres dépend de la hauteur saisie du niveau |
| B2. Hauteur du remblai en mètres | Mesure directe | Devient faux si la hauteur du niveau change ; un « 5 m » sur un plan resté à 2 m déborde |
| B3. Vide restant en mètres | C'est ce qui décide ramper / passer | Même défaut que B2, à l'envers ; illisible pour le volume |
| B4. Crans nommés seuls (total, haut, mi-hauteur, bas) | Saisie en un geste | Pas de valeur intermédiaire |

Combinaison proposée : **B1 stocké, B4 à la saisie** (crans qui écrivent 0,25 / 0,5 / 0,75, « Total » qui retire
le champ, « Autre » pour une valeur libre affichée aussi en mètres d'après la hauteur du niveau).

### C. Forme du dessus

| Option | Pour | Contre |
|---|---|---|
| **C1. Une valeur par zone, talus automatique aux bords** | Une saisie ; la pente se calcule : hauteur du sol = min(hauteur du remblai, pente × distance au bord) | Il faut savoir quels bords sont « ouverts » (dans la galerie) et lesquels sont dans la roche, sinon une rigole longe chaque paroi |
| C2. Rampe d'un bord à l'autre (deux valeurs et un sens) | Décrit un remblai qui descend d'une bouche | Saisie lourde (choisir deux bords sur la carte), dessin 2D à inventer |
| C3. Face verticale franchissable | Peu de géométrie | Faux à l'œil (on « monte » un mur), aucune pente douce |

### D. Rendu 2D sans toucher la charte

| Option | Pour | Contre |
|---|---|---|
| **D1. Motif de grains sur la couleur du remblais, plus dense plus c'est haut ; total = aplat actuel** | Lisible d'un coup d'œil, même couleur que la légende (couleur choisie comprise) ; pas de confusion avec les hachures rouges de l'inaccessible | Un motif par cran à construire (`_motifCanvas` en fait déjà un par clé) ; maquette à valider |
| D2. Étiquette au centre (« ½ », « reste ~1 m ») | Valeur exacte | Encombre un plan dense, illisible dézoomé |
| D3. Opacité du remplissage selon la hauteur | Trivial | Le canon fixe l'opacité par type ; un remblais bas se confond avec le fond |

La valeur exacte se lit dans la fiche et l'infobulle dans tous les cas.

## Recommandation

**A1 + B1/B4 + C1 + D1** : un champ `comble` (part de 0 à 1) sur la zone `remblais`, absent = total, ce que sont
toutes les zones existantes. Pas de nouveau type : la matière est la même, seule la hauteur change, et un type de
plus coûte une vingtaine de fichiers pour rien.

Règles proposées, une source pour la 3D, l'itinéraire et le volume (`js/galerieEmprise.js` ou un petit module
partagé) :

- **Sol** = `comble × hauteur du niveau`, atteint par un talus de pente fixe depuis les bords ouverts ;
  **vide restant** = hauteur du niveau − sol.
- **3D** : vide ≥ 1,8 m → debout ; 1 à 1,8 m → œil abaissé (vide − 0,2 m) ; 0,5 à 1 m → ramper (œil de la chatière,
  0,35 m) ; < 0,5 m ou total → bloque comme aujourd'hui. Le plafond ne bouge pas. Total dessiné **jusqu'au plafond**
  (il bloque : il doit en avoir l'air, sinon un remblai partiel à 60 % et un total à 60 % se ressemblent et ne se
  comportent pas pareil).
- **Itinéraire** : coût de la longueur traversée selon le vide (debout ×1, courbé ×1,5, ramper ×3, total très cher
  mais pas coupé), **distance affichée inchangée** (coût et distance séparés dans le Dijkstra). Le total ne devient
  pas une contrainte dure : sur un relevé historique, des galeries tracées traversent souvent des remblais posés
  ensuite, et les couper casserait des itinéraires qui marchent.
- **Volume** : vide = Σ aire × (hauteur − sol), exact par paliers (trier les hauteurs distinctes, appeler
  `calculerAires` sur l'union des zones à au moins chaque palier), le talus négligé (dit dans la fenêtre).
- L'effondrement **reste un obstacle** (danger : on ne marche pas sur un fontis), mais il perd le partage de
  `HAUTEUR_REMBLAIS`.

## Frontière community / pro

Le champ est une donnée du moteur, neutre, utilisable sans serveur : aucune prise, rien dans
`community-server-line.md`. **[Probable]** La synchro pro transporte l'objet entier (en clair ou chiffré d'un bloc,
`MyKTAMap-pro/modules/sync.js > chiffrerLot`), donc `comble` passe sans code pro ; à confirmer par un essai à deux
appareils au lot 1. Contrainte côté community : changer la hauteur passe par `KtaUid.touch` (sinon « le dernier
gagne » écraserait la modification). Une ancienne version de l'app qui reçoit une zone avec `comble` l'ignore et la
montre en total : dégradation acceptable, rien de perdu tant qu'elle ne réécrit pas l'objet.

## Risques et régressions cross-module

- **Champ perdu en silence** dans une copie champ par champ (entrée `_ktaDataPolygons` de `js/utils.js`,
  `getAllEmbeddedZones`, KMZ, GeoJSON ; `js/convertirObjet.js` et l'Éditeur de données non lus, à vérifier au
  lot 1). Parade : un garde-fou qui fait
  l'aller-retour d'une zone `comble` par chaque chemin (sur le modèle de `check-zones-niveaux.js`).
- **Distance gonflée** si le coût de l'itinéraire est mêlé à `totalDistance` (sortie d'urgence, inter-plans, encart
  « reste » du guidage).
- **Règle du pas** : `ZONES_BOUCHENT` devient une règle par zone (un remblai partiel ne bouche plus) ; l'emprise
  (`dedans` / `enRemblais`), `_coince`, la mini-carte et le checkup § 24 bis changent ensemble.
- **Galeries inclinées** : une zone jonction et un remblai qui se chevauchent ont deux sols ; règle à poser (la
  jonction d'abord, comme dans `_surPente`).
- **Perf 3D** : le talus demande une surface maillée (grille de 0,5 m dans la boîte de la zone, par tuile de 16 m :
  au plus ~2 000 triangles par zone et par tuile) ; le sol sous les pieds se calcule par la formule, jamais en lisant
  le maillage. À mesurer sur le relevé dense des checkups et un vieux téléphone.
- **Volume** : l'union simple compterait deux remblais superposés de hauteurs différentes à la plus haute partout ;
  le calcul par paliers l'évite.
- **Secours** : l'évitement brancard des remblais reste par type ; un remblai bas sera évité comme un haut (voulu
  pour un brancard).
- **Compatibilité descendante** : aucune zone existante ne change (champ absent = total, 2D identique). Seule la 3D du
  total change d'aspect si la question 5 passe.

## Questions à trancher (QCM)

| # | Question | Options | Reco |
|---|---|---|---|
| 1 | Nouveau type ou existant | a) champ sur `remblais` · b) nouveau type « Remblai partiel » · c) type perso de légende | **a** |
| 2 | Valeur enregistrée | a) part de la hauteur de galerie (0 à 1) · b) mètres de remblai · c) mètres de vide restant · d) crans seuls | **a**, saisie par crans + « Autre » |
| 3 | Crans proposés | a) Bas ¼ · Mi-hauteur ½ · Haut ¾ · Total · b) tous les dixièmes · c) Bas · Mi-hauteur · Total | **a** |
| 4 | Forme du dessus | a) une valeur + talus automatique aux bords ouverts · b) rampe d'un bord à l'autre · c) a maintenant, b si le terrain le demande | **c** |
| 5 | Total en 3D | a) jusqu'au plafond · b) garder 60 % (décision du 01/11/2026) | **a** (révise la question 4 de l'étude 3D) |
| 6 | Effondrement | a) reste un obstacle, hauteur propre · b) reçoit le même champ | **a** |
| 7 | Saisie | a) fiche + Tableur + KMZ / GeoJSON + colonne facultative à l'import SIG · b) fiche seule | **a** ; le Générateur n'a rien à ajouter (il importe) |
| 8 | Lecture en 2D | a) grains plus denses plus c'est haut, total = aplat actuel · b) étiquette · c) opacité | **a**, maquette avant code |
| 9 | Pente du talus | a) 30° fixes · b) 20° fixes · c) réglable | **a** (5 m de remblai = 8,7 m de talus) |
| 10 | Seuils 3D | a) debout ≥ 1,8 m · courbé 1–1,8 · ramper 0,5–1 · bloqué < 0,5 · b) autres chiffres | **a** |
| 11 | Itinéraire | a) inchangé · b) coût selon le vide, total très cher mais pas coupé, distance affichée intacte · c) total = contrainte dure | **b** |
| 12 | Guidage | a) temps restant qui compte le ralentissement · b) a + consigne « remblai bas : ramper sur ~X m » · c) rien | **a** ; b plus tard |
| 13 | Volume exploité | a) vide réel par paliers, talus négligé · b) inchangé (remblai = total) | **a** |
| 14 | Zone sur plusieurs niveaux | a) une valeur pour tous ses niveaux (deux cas différents = deux zones) · b) une valeur par niveau | **a** |
| 15 | Brancard du Secours | a) remblais toujours évités d'office, quelle que soit la hauteur · b) seulement sous un vide donné | **a** |

## Découpage proposé

| Lot | Contenu | Taille |
|---|---|---|
| 0 | Maquette 2D des crans (grains, légende, fiche) à valider par KARMA | S |
| 1 | Donnée et saisie : champ `comble` (lecture commune « absent = total »), fiche, Tableur, relais par chaque copie champ par champ, KMZ / GeoJSON aller-retour, colonne SIG ; rendu 2D, légende, exports PNG / PDF ; garde-fou d'aller-retour ; `data-formats.md`, guides fr / en / es | M |
| 2 | 3D : sol et talus, plafond, courbé / ramper / bloqué, total au plafond, effondrement découplé, ruban et panneaux de POI posés sur le sol, mini-carte ; checkup § 24 bis réécrit, mesure de perf | L |
| 3 | Volume exploité par paliers ; `check-api-surface.js` complété | S |
| 4 | Itinéraire (coût séparé de la distance) et temps du guidage ; `multilevel-pathfinding.md` | M |

Ordre : 0 → 1 → 2, puis 3 et 4 dans l'ordre que KARMA veut. Le lot 1 seul est déjà utile (la hauteur se lit sur la
carte et circule dans les exports et la synchro).

## Inconnues qu'on ne lèvera que sur le terrain

- La part des remblais d'un relevé réel qui touchent une paroi sur tout un bord (là où le talus ne doit pas naître).
- Si les crans suffisent, ou si les relevés demandent des valeurs intermédiaires.
- Le rendu du talus et le coût des triangles sur un vieux téléphone.
