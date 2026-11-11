# Étude — Comblé et masse au sol (remblais total et partiel)

> Étude ouverte le 11/11/2026 à la demande de KARMA, réorientée le même jour par sa décision de **différencier** le
> comblement total et le remblai partiel (ci-dessous). Le reste attend le QCM en fin de document. Aucun code de l'app
> n'a été modifié pour l'écrire ; chaque fait de l'état actuel renvoie à `fichier > fonction` (lu sur `Karma_dev`,
> commit `032b1b29`).

## Le besoin

Sur une carrière de 10 m de haut, une zone est remblayée jusqu'au ciel, une autre à moitié, une troisième à peine :
sur un même niveau, la hauteur de vide varie du tout au tout, et l'on marche très souvent **sur** du remblai. La zone
« Remblais » ne sait dire qu'une chose : « ici, du remblai ». En 3D c'est un obstacle ; on voudrait monter sur un
remblai partiel par une pente douce, marcher dessus sous le ciel, ramper là où il reste peu de vide, et buter
seulement là où il n'en reste plus.

## Décision de KARMA (11/11/2026)

Sur un plan, ce qui compte est le **comblement total** : les atlas de l'IGC notent des masses, « mc » (masse au ciel)
et « ms » (masse au sol). On différencie donc :

- **(a) Le type actuel `remblais` devient « Comblé »** = comblement total : il **bloque l'itinéraire** (contrainte dure,
  comme l'inaccessible) et, en 3D, monte **jusqu'au ciel** (fin des 60 %) en restant un obstacle.
- **(b) Un nouveau type de zone pour le remblai partiel** (masse au sol) : hauteur réglable, on y monte par une pente
  douce et l'on marche dessus, coût d'itinéraire selon le vide restant, **sans gonfler la distance affichée**.

**Option écartée : un champ de hauteur sur le type `remblais`** (la reco de la première version de cette étude). Raison
de KARMA : sur un plan, le comblement total est l'information pertinente et il a sa règle propre (obstacle dur) ; le
noyer dans un type dont la hauteur varie empêcherait une règle simple et ne suivrait pas la distinction des atlas.

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
   n'existe donc pas : la décision (a) de KARMA est un **changement** de comportement (risque : question 2).

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

## Ce que la décision change

### (a) Comblé : sites à toucher [Certain, code lu]

- **Itinéraire** : le test « contrainte dure » est écrit `type === "inaccessible"` (ou `!==`) à sept endroits :
  `js/pathfinder.js > _collecterZonesInaccessibles` (session et embarquées), `getAvoidableZoneTypes`,
  `_collecterZonesAEviter`, `computeRouteOnRoads` (zones dures de l'inter-plans), `js/interPlanRoute.js` (deux filtres
  des évitements). À remplacer par **une** table des types durs (`inaccessible`, `remblais`) exposée par le pathfinder,
  sinon un site oublié laisse passer l'itinéraire inter-plans à travers un Comblé.
- **Case « Respecter les zones inaccessibles et les murs (ligne) »** (`iti.inacc.label`, `respecterInaccessibles`) :
  elle lève les contraintes dures ensemble ; son libellé doit nommer Comblé (3 langues).
- **Secours** : `BRANCARD_COCHES` (`js/secoursMode.js`) coche aujourd'hui `remblais` comme évitement souple ; devenu
  dur, il sort de la liste des évitables (`getAvoidableZoneTypes`).
- **3D** : `HAUTEUR_REMBLAIS` est partagé avec l'effondrement ; Comblé passe à toute la hauteur (`_construireTuile`,
  `_zoneGalerie`, `_remblaisGalerie`), l'effondrement garde sa propre valeur. `ITI_SUR` : un itinéraire ne traversera
  plus un Comblé, sauf case « Respecter… » décochée ; dans ce cas un ruban posé « par-dessus » serait collé au
  plafond : ruban au sol, masqué dans le volume, à trancher au lot.
- **Libellés** : `legendCustomization.js > DEFAULT_LABELS`, dicos (`legend.label.zones.remblais`, `ui.zone.remblais`,
  `imgexport.*`, `search.zoneType.remblais`, `volume.remblais*`, aide, tutoriel…), guides fr / en / es,
  `AI_CONTEXT.md` (liste fermée des types). Les textes qui disent « on bute contre les remblais » restent vrais.
- **Volume exploité** : inchangé (déjà compté en entier).

### (b) Nouveau type : coût mesuré

Le skill `.claude/skills/add-zone-type` annonce ~13 sites ; il est en dessous de la réalité. Mesuré sur
`effondrement` : **21 fichiers JS, 118 occurrences**, 6 garde-fous (`scripts/`), 16 clés par dico × 3 langues. Hors
skill : `filterPanel.js`, `refonteInterface.js`, `searchPoints.js`, `osmView.js`, `osmHomePreview.js`,
`emergencyMode.js`, `kmzImport.js` (expression des styles `#zone_…`), `sigImport.js` (synonymes),
`legendCustomization.js`, `homeProfile.js`, `vue3d.js`, `galerieEmprise.js`, `volumeExploite.js`, `ktaIcones.js`
(pastille et classement des emoji, `check-icones-ui.js`), police emoji si un emoji neuf entre dans un texte. S'y
ajoute ce qu'aucun type actuel n'a : le champ de hauteur (fiche, Tableur, copies champ par champ, exports), le sol
variable en 3D, le coût d'itinéraire séparé de la distance. Le skill est à mettre à jour au passage.

## Options et reco par question

### 1. Clé interne de Comblé

| Option | Pour | Contre |
|---|---|---|
| **a. Garder `remblais`, changer les libellés seuls** | Zéro migration : sessions, plan-config, calques ZIP, légendes perso (`customLegend` indexé par clé), styles KMZ `#zone_remblais`, synonymes SIG, synchro et modules pro, clés de dicos, garde-fous | La clé ne dit plus le sens (un commentaire de contrat suffit) |
| b. Nouvelle clé (`comble`) avec lecture de l'ancienne | Clé parlante | Conversion à chaque entrée (précédent : `jonction: true` → `pente`, `ktaZoneJonctionEnType`) ; une ancienne app ou une installation pro pas à jour reçoit un type inconnu (style de repli, plus d'obstacle) ; les légendes perso perdent leur couleur sans migration |

**Reco a.**

### 2. Le risque : des plans ont mis « remblais » sur du partiel

Dès que Comblé bloque, un tracé qui traverse une zone `remblais` mal typée est coupé : itinéraires impossibles, et
surtout **sortie d'urgence** impossible, car elle garde les contraintes dures en toutes circonstances
(`docs/architecture/multilevel-pathfinding.md`, case « Respecter… »). Le cas est probable sur un relevé historique,
où des galeries tracées traversent des remblais posés ensuite. **Non mesuré** : `data/` n'est pas lu par l'agent ; le
contrôle au chargement ci-dessous mesure chaque plan dans l'app.

| Option | Ce que ça fait | Limite |
|---|---|---|
| a. Rien | — | Itinéraires et sortie d'urgence cassés en silence |
| b. Message quand l'itinéraire échoue | Le moteur relance sans les Comblé ; s'il trouve alors, il dit « N zones Comblé coupent le chemin » avec [Les voir] [Passer quand même] | Arrive au pire moment (sous terre) |
| c. Re-typage en masse | « Comblé → Masse au sol » sur une sélection (sélection par zone et multiple, `convertirObjet.js` existent) | Il faut savoir lesquelles |
| d. Contrôle au chargement, une fois par plan | Seulement si une zone Comblé coupe un tracé : « N zones Comblé coupent des galeries tracées : comblement total ou masse au sol ? » → liste, carte centrée sur chacune, re-typage zone par zone ou en lot | Zones d'un calque (lecture seule) : re-typage par l'Éditeur de données ou à la régénération, le message le dit |
| e. Repli de la sortie d'urgence | Sans chemin → relance en levant les Comblé (pas les inaccessibles), avec l'avertissement « passe par une zone notée Comblé » | Révise « les dures ne se relâchent jamais » pour Comblé seul |

**Reco d + b + e** : d attrape le cas là où il naît (une zone Comblé qui coupe un tracé, c'est exactement le risque),
avec le re-typage en lot de c dans sa liste ; b couvre ce qui a échappé ; e parce qu'une sortie d'urgence bloquée par
une erreur de typage est le pire résultat possible. e est une décision de sécurité propre à KARMA.

### 2 bis. « Vérifier le plan » (étude à part)

KARMA retient un outil de contrôle général du plan : **`docs/ETUDE_VERIFIER_PLAN.md`**. La traversée d'une zone
bloquante par un tracé (inaccessible, murs en ligne, Comblé demain) y est un contrôle parmi d'autres, et c'est lui qui
porte l'option d de la question 2 : liste cliquable des croisements, re-typage « Comblé → Masse au sol » zone par zone
ou en lot, « vu, normal » pour une galerie volontairement condamnée. Fait établi ici **[Certain]** : aujourd'hui un
segment coupé par une zone dure sort du graphe sans rien dire (`pathfinder.js > _buildGraph`,
`_segmentBloqueParZoneInaccess`). **Ordre** : ce contrôle est livré **avant** que Comblé bloque (lot 0 ci-dessous).

### 3. Nom et clé du nouveau type

Ce qui est sûr : les sigles « mc » / « ms » viennent de KARMA. **[Supposition]** Je ne connais pas de légende IGC
publiée qui fixe un libellé plus long ; « masse au sol » est le terme de KARMA. Options : « Masse au sol » (vocabulaire
des atlas, à expliquer dans l'aide), « Remblai partiel » (clair pour un spéléo ou un nouveau venu), « Remblai bas ».
Clé : minuscules, tiret comme `pilier-1` / `mur-ligne`.

**Reco « Masse au sol », clé `masse-sol`** ; en / es à valider : *Partial fill* / *Relleno parcial* (le sigle ne se
traduit pas). Comblé : *Filled to roof* / *Colmatado*. Aide et légende disent « masse au ciel / masse au sol ».

### 4. Style 2D (la charte se décide par KARMA)

Comblé garde l'aplat gris actuel (`styleResolver.js > CANON.zones.remblais`) : aucun plan existant ne change à l'œil.
Propositions pour Masse au sol, à départager sur maquette :

- i. même famille de gris, plus clair, **grains** dont la densité monte avec la hauteur ;
- ii. teinte terre / sable (celle de la texture 3D du remblai), grains de même densité variable ;
- iii. fond très léger et contour pointillé, sans motif.

Contraintes : distinct de Comblé, des hachures rouges de l'inaccessible et du bleu de l'eau ; motif en
`CanvasPattern` du canon (`_motifCanvas`, un par clé et par cran), jamais de table locale ; contrastes de `ui.md` § 53.
**Préférence ii** (lien visuel avec la 3D), **maquette avant code**. Pastille : icône SVG dans `ktaIcones.js`.

### 5. Valeur et crans

| Option | Pour | Contre |
|---|---|---|
| **a. Part de la hauteur de galerie (0 à 1)** | Suit la hauteur du niveau quand on la corrige (2 m par défaut → 10 m réglés : « à moitié » reste à moitié) | Le vide en mètres dépend de la hauteur saisie |
| b. Mètres de remblai | Mesure directe | Faux si la hauteur du niveau change |
| c. Mètres de vide restant | Décide ramper / passer | Même défaut, à l'envers |

**Reco a**, champ `comble`. Saisie par crans ¼ / ½ / ¾ et « Autre » (valeur libre, affichée aussi en mètres d'après la
hauteur du niveau). **Absent = ½** (zone dessinée ou importée sans valeur). Une valeur ≥ 1 propose de passer en Comblé.

### 6. Talus et forme

| Option | Pour | Contre |
|---|---|---|
| **a. Une valeur, talus automatique** : sol = min(hauteur, pente × distance au bord ouvert) | Une saisie ; la formule sert au rendu, au pas et au ruban | Il faut reconnaître les bords dans la roche (sinon une rigole longe chaque paroi) |
| b. Rampe d'un bord à l'autre (deux valeurs, un sens) | Remblai qui descend d'une bouche | Saisie lourde, dessin 2D à inventer |
| c. Face verticale franchissable | Peu de géométrie | Faux à l'œil |

**Reco a maintenant, b si le terrain le demande.** Pente 30° (5 m de remblai = 8,7 m de talus), constante réglable dans
le code. Maillage en grille de 0,5 m par tuile de 16 m (au plus ~2 000 triangles par zone et par tuile, **à mesurer**) ;
le sol sous les pieds vient de la formule, jamais du maillage. Mécanisme à généraliser : le sol variable des jonctions
(`vue3d.js > _surPente`, `_solPlace`).

### 7. Seuils 3D (vide restant = hauteur du niveau − sol)

**Reco** : ≥ 1,8 m debout ; 1 à 1,8 m œil abaissé (vide − 0,2 m) ; 0,5 à 1 m ramper (œil de la chatière, 0,35 m,
transition comme `_baisseChatiere`) ; < 0,5 m bloque. Le plafond ne bouge pas. Masse au sol n'entre pas dans
`ZONES_BOUCHENT` : règle par point (bloque seulement sous le seuil) ; l'emprise de galerie (`dedans`, `enRemblais`),
`_coince` et la mini-carte suivent. Jonction et masse superposées : la jonction d'abord.

### 8. Itinéraire et guidage

**Reco** : coût de la longueur traversée selon le vide (debout ×1, courbé ×1,5, ramper ×3, sous le seuil coupé), avec
**coût et distance séparés** dans le Dijkstra : aujourd'hui `totalDistance = dist[end]` (la somme des poids), repris
par la sortie d'urgence et l'inter-plans ; on accumule la distance à part. Le type entre de lui-même dans les évitables
souples (`getAvoidableZoneTypes`). Guidage : temps restant qui compte le ralentissement ; consigne « masse au sol :
ramper sur ~X m » plus tard.

### 9. Volume exploité

**Reco** : Comblé retranché en entier (inchangé) ; masse au sol par sa part, exacte par paliers (hauteurs distinctes
triées, `calculerAires` sur l'union des zones à au moins chaque palier), talus négligé et dit ; là où une masse
chevauche un Comblé, le Comblé l'emporte. Deux lignes de plus dans la fenêtre (surface et volume de masse au sol).

### 10. Effondrement

**Reco inchangé** : volume à 60 % (sa propre constante), obstacle en 3D, pas une contrainte dure de l'itinéraire.

### 11. Brancard du Secours

**Reco** : Comblé retiré de `BRANCARD_COCHES` (déjà dur) ; masse au sol cochée d'office avec l'eau (un brancard ne
passe ni en rampant ni sur un talus).

### 12. Zone sur plusieurs niveaux

**Reco** : Comblé bloque sur chacun de ses niveaux (règle des zones bloquantes, déjà écrite) ; masse au sol : une
valeur pour tous ses niveaux (deux cas différents = deux zones).

### 13. Saisie, exports, import SIG

- Fiche : crans (bloc propre au type, comme `_niveauxZoneHtml` dans `utils.js > attacherNotePopup`) ; Tableur :
  colonne `comble` avec un éditeur dédié ; KMZ : style `#zone_masse-sol`, `mkm:comble` (export et relecture) ;
  GeoJSON : propriété `comble` ; relais du champ dans chaque copie champ par champ (`utils.js`, entrée
  `_ktaDataPolygons`, `getAllEmbeddedZones`).
- **Synonymes SIG** (`sigImport.js`, aujourd'hui `remblais`, `remblai`, `comblement` → `remblais`) : `comblement`,
  `comble`, `mc`, `masse au ciel` → Comblé ; `ms`, `masse au sol`, `remblai partiel` → masse au sol ; `remblai(s)`
  seul reste Comblé (statu quo), visible et modifiable dans l'écran de correspondance. Colonne de hauteur facultative.
  `fontis`, `eboulement` → effondrement (inchangé).
- 🩸 **Type par défaut d'un polygone non reconnu** : `remblais` (`sigImport.js`, `zoneDefaut` ; Générateur,
  `createConf.js`, liste « type des polygones », `remblais` présélectionné). Une fois Comblé dur, un import mal reconnu
  pose des **obstacles durs en silence**. **Reco** : défaut = masse au sol, et l'écran de correspondance montre le
  nombre de polygones qui tombent dans le défaut.

## Frontière community / pro

Deux données du moteur, neutres, utilisables sans serveur : aucune prise, rien dans `community-server-line.md`.
**[Probable]** La synchro pro transporte l'objet entier (en clair ou chiffré d'un bloc,
`MyKTAMap-pro/modules/sync.js > chiffrerLot`) : `masse-sol` et `comble` passent sans code pro, à confirmer à deux
appareils. Changer la hauteur passe par `KtaUid.touch`. Une installation pro dont le front n'est pas à jour reçoit un
type inconnu (style de repli) : livrer quand le front du pro suit. Les modules pro qui lisent les zones
(`compte-rendu.js`, `relecture.js`) sont à relire côté pro au lot du type.

## Risques et régressions cross-module

- **Plans existants** (question 2) : itinéraires et sortie d'urgence coupés par un Comblé mal typé ; parade : le lot 0 (question 2 bis), livré avant.
- **Import** : défaut `remblais` = obstacles durs posés en silence (question 13).
- **Site dur oublié** : sept tests sur `"inaccessible"` ; un seul oublié et l'inter-plans traverse un Comblé.
- **Champ perdu en silence** dans une copie champ par champ (`utils.js`, KMZ, GeoJSON ; `convertirObjet.js` et
  l'Éditeur de données non lus, à vérifier). Parade : garde-fou d'aller-retour (modèle `check-zones-niveaux.js`).
- **Distance gonflée** si le coût de la masse au sol entre dans `totalDistance`.
- **3D** : règle par point pour le nouveau type ; checkup § 24 bis à réécrire ; ruban d'un itinéraire qui traverse un
  Comblé (case décochée) ; perf du talus.
- **Liste fermée** des types dans `AI_CONTEXT.md` : sans mise à jour, l'aide IA nie le nouveau type.

## Questions à trancher (QCM)

| # | Question | Options | Reco |
|---|---|---|---|
| 1 | Clé de Comblé | a) garder `remblais`, libellés seuls · b) nouvelle clé + lecture de l'ancienne | **a** |
| 2 | Plans existants mal typés | a) rien · b) message à l'échec · c) re-typage en lot · d) contrôle au chargement · e) repli de la sortie d'urgence | **d + b + e** (d = contrôle de « Vérifier le plan », c dans sa liste) |
| 3 | Nom et clé du nouveau type | a) « Masse au sol » `masse-sol` · b) « Remblai partiel » · c) « Remblai bas » | **a** |
| 4 | Style 2D de la masse au sol | i) gris clair + grains · ii) terre / sable + grains · iii) fond léger + contour pointillé | KARMA ; préférence **ii**, maquette avant code |
| 5 | Valeur | a) part de la hauteur, crans ¼ ½ ¾ + Autre, absent = ½ · b) mètres de remblai · c) mètres de vide | **a** |
| 6 | Forme | a) talus automatique 30° · b) rampe d'un bord à l'autre · c) a puis b si besoin | **c** |
| 7 | Seuils 3D | a) 1,8 / 1 / 0,5 m · b) autres | **a** |
| 8 | Itinéraire, guidage | a) coût selon le vide, distance séparée, temps du guidage · b) a + consigne « ramper » · c) pas de coût | **a** ; b plus tard |
| 9 | Volume exploité | a) Comblé entier, masse par paliers · b) masse ignorée | **a** |
| 10 | Effondrement | a) inchangé (60 %, obstacle 3D, pas dur) · b) le rendre dur aussi | **a** |
| 11 | Brancard | a) Comblé retiré (déjà dur), masse au sol cochée d'office · b) masse non cochée | **a** |
| 12 | Plusieurs niveaux | a) Comblé dur sur chacun, masse : une valeur pour tous · b) une valeur par niveau | **a** |
| 13 | Saisie, exports, SIG | a) fiche, Tableur, KMZ, GeoJSON, synonymes ci-dessus, défaut d'import = masse au sol · b) défaut d'import inchangé | **a** |

## Découpage proposé

| Lot | Contenu | Taille |
|---|---|---|
| 0 | **« Vérifier le plan »**, au moins le contrôle des tracés coupés par une zone bloquante (lots de `ETUDE_VERIFIER_PLAN.md`) ; table unique des types durs (pathfinder, inter-plans) posée à cette occasion, `inaccessible` seul | M |
| 1 | **Comblé** (après le lot 0) : libellés fr / en / es, `remblais` ajouté aux types durs, case « Respecter… », brancard, 3D jusqu'au ciel (effondrement découplé) ; **dans le même lot**, le message à l'échec et le repli d'urgence (question 2) : Comblé dur ne part pas sans eux ; défaut d'import ; guides, `AI_CONTEXT.md`, `multilevel-pathfinding.md` | M |
| 2 | Maquette 2D de la masse au sol | S |
| 3 | **Masse au sol, donnée et 2D** : type ajouté partout (21 fichiers, skill mis à jour), champ `comble`, fiche, Tableur, copies, KMZ / GeoJSON / SIG, légende, exports ; garde-fou d'aller-retour ; `data-formats.md` | L |
| 4 | Masse au sol en 3D : sol, talus, courbé / ramper / bloqué, ruban, panneaux, mini-carte ; checkup § 24 bis ; mesure de perf | L |
| 5 | Volume exploité par paliers | S |
| 6 | Itinéraire (coût séparé de la distance) et temps du guidage | M |

Ordre : 0 → 1 → 2 → 3 → 4, puis 5 et 6. Le lot 0 sert seul dès aujourd'hui ; le lot 1 se suffit (le total devient vrai partout) ; le lot 3 donne un sens à la
masse au sol avant la 3D.

## Inconnues qu'on ne lèvera que sur le terrain

- Combien de zones `remblais` des relevés réels sont en fait partielles (le contrôle de « Vérifier le plan » le dira plan par plan).
- La part des masses au sol qui touchent une paroi sur tout un bord (là où le talus ne doit pas naître).
- Si les crans suffisent, et le coût du talus sur un vieux téléphone.
