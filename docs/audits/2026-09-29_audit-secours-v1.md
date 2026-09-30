# 🚑 Audit fonctionnel Mode Secours — v1.98.4 — 29/09/2026

> **Scénario** : une personne est perdue quelque part dans un réseau souterrain. Un plan de secours est déclenché avec
> 30+ intervenants (cataphiles, secouristes, pompiers GRIMP). Le plan du réseau est déjà lisible dans MyKTAMap, mais
> **aucun scénario de secours n'est préparé**. Étape 1 : planifier un balayage de tout le réseau en 5 à 8 équipes.
> Étape 2 : exécuter ce plan jusqu'à retrouver la victime.
> **Méthode** : deux agents en jeu de rôle. Le **chef d'équipe GRIMP** tient le commandement, la doctrine et la chronologie.
> L'**ingénieur en chef de l'IGC** tient le réseau, la géométrie et la sécurité des galeries. Ils ont lu le code et ont
> exécuté trois choses hors dépôt :
> - le **vrai** `secoursMode.js` dans deux contextes isolés (un PC et un téléphone d'équipe, chacun avec son
>   `localStorage`) ;
> - le **vrai** `pathfinder.js` sur les tracés du plan ;
> - des scripts d'analyse du graphe (connexité, culs-de-sac, découpage en secteurs).
>
> Les deux constats les plus lourds ont été **revérifiés à la main dans le code** par Claude (✅).
> **Plan de test** : un relevé réel multi-niveau, tuilé V2 (912 tracés, 90 POI, 77 zones). **Il n'est pas nommé ici, et on
> ne donne ni nom de salle, ni accès, ni orientation** : c'est la règle `data/` de `CLAUDE.md`. Les rapports bruts des deux
> agents, qui contiennent ces informations, restent **hors dépôt**.
> **Sans code.** Aucune exécution dans un navigateur : les rendus et les minutages de saisie sont **déduits du code**.
> Tags : [Certain] (code lu ou mesure exécutée) · [Probable] · [Supposition].

---

## 0. La vérité qui dérange

1. **Une recherche sur plusieurs téléphones ne fonctionne pas.** Le PC distribue le plan en `.mkmsec.json`, puis
   réimporte le rapport de chaque équipe. Ce rapport est **toujours refusé**, parce que l'import régénère l'identifiant
   du scénario et celui de chaque équipe (`secoursMode.js:1625`, `:1635`), alors que l'import du rapport exige les
   identifiants d'origine (`:2112`, `:2117`). Mesure : `errScenarioDifferent`, puis `errEquipeAbsente` si l'on force le
   scénario, et `ok` seulement si l'on force les deux. ✅ [Certain]
   - `session-data.md` §72.1 affirme « mêmes IDs équipe » : c'est faux.
   - Le backlog avait enterré « Import/Export Live » au motif qu'il était « couvert par l'import consolidé ». **Ce motif
     ne tient pas.**
2. **On ne peut affecter aucune galerie à une équipe.** Le mode « zone = tracés » cherche `entry.road` et `entry.layer`
   (`secoursMode.js:9151`). Or le registre `_ktaDataPolylines` n'a ni l'un ni l'autre (`utils.js:2449`). Les tracés de
   session arrivent sans calque et sont écartés (`:9166`). Aucun clic n'est donc branché. Même réparé, l'identifiant
   serait aléatoire (`:9159`) et perdu au rechargement. ✅ [Certain]
3. **« Victime trouvée » n'a pas de position.** Une étape ne garde ni coordonnée ni position du suivi (`:942-982`,
   `:1100-1125`, `:1199-1205`). Une victime trouvée entre deux étapes n'existe qu'en texte libre. Aucun itinéraire
   d'évacuation ne peut partir d'elle, et le module n'a aucun bouton d'évacuation. [Certain]
4. **Balayer tout le réseau ne se fait pas en une seule relève**, et l'outil ne le montre pas. Il affiche les durées à
   5 km/h et ajoute 15 min de pause à chaque étape (§1, §3.6). [Certain, mesuré]

## 1. Le réseau, mesuré (IGC)

| Mesure | Valeur |
|---|---|
| Linéaire dessiné | **87,2 km**, dont 7,9 km au −1 |
| Tracés sans champ `level` | 47 (12,7 km, comptés au niveau 0 par défaut) |
| Composantes connexes | **8** : une principale de 86,6 km, et 7 bouts (~0,7 km) que l'itinéraire ne peut pas atteindre |
| Culs-de-sac | **383**, soit 12,1 km à parcourir en aller-retour |
| Parcours minimal pour tout voir | ≈ **98,6 km** (borne basse, sans les boucles) |
| Accès ouverts tagués | **un seul** ; aucun `entree_plan` |
| POI sans niveau | 44 sur 90 |

**Lecture.** Il faut ≈ **66 heures-équipe** à 1,5 km/h, soit plus de 9 h par équipe avec 7 équipes, sans compter
l'approche. D'où une doctrine en deux phases :
- **P1, reconnaissance rapide** : l'ossature de chaque secteur, à ~3 km/h.
- **Débriefing.**
- **P2, fouille détaillée** avec une relève fraîche : les culs-de-sac et les trous signalés en P1.

Le plan n'a qu'un accès ouvert tagué : 30 personnes s'engagent donc par un seul puits, et c'est aussi la seule sortie
d'urgence connue de l'outil. **Ce risque relève de la donnée, pas du moteur.**

**Découpage proposé.** Pour le −1, un secteur dédié qui regroupe le niveau, les jonctions et le niveau 0 qu'on
n'atteint que par le −1. Pour le niveau 0, 6 secteurs obtenus par croissance équilibrée **sur le graphe**, donc continus
par les galeries. Écart de charge max/min : **1,16**. Chaque secteur fait 10 à 14 km, soit 8 à 11 h de fouille.

## 2. Mise en place dans l'outil (GRIMP)

| Étape | Temps estimé |
|---|---|
| Créer le scénario. La dernière position connue ne se saisit **que** via le Mode Perdu, plafonné à 90 min (`lostMode.js:39`) | 1 min |
| Par équipe (voie « polygone »), `~25-30` actions : nom et niveau, membres, zone, entrée et sortie, POI de la zone, calcul | 4-5 min |
| **6 équipes** | **25-30 min** |
| Voie Ctrl+K, POI par POI : ~7 actions par POI, la recherche se referme à chaque fois | ~30 min pour 90 POI |
| Exports et distribution sur 6 téléphones | 15-20 min |
| **De l'alerte au premier engagement** | **45 min à 1 h** |

C'est tenable pour un opérateur entraîné. **Pas pour quelqu'un qui découvre l'outil à 3 h du matin.**

**Pièges de saisie** [Certain] :
- **Aucun contrôle de couverture.** Il n'y a ni POI non affectés, ni doublons entre équipes, ni pourcentage du réseau
  affecté (`grep couverture|coverage` : 0). `_appliquerWaypoint` (`:8783`) ne vérifie pas si le POI appartient déjà à
  une autre équipe.
- **Un balayage saisi en étapes reste incomplet.** Même avec une étape dans **chaque** cul-de-sac (55 à 79 par équipe),
  l'itinéraire ne couvre que **72 %** (secteur de niveau 0) et **62 %** (−1) du linéaire, parce que le plus court
  chemin saute les boucles. [Mesuré]
- **L'ordre des étapes n'est pas celui annoncé.** « POI de la zone » trie les étapes par distance à l'entrée (`:9617`),
  pas en chaîne du plus proche voisin comme le dit le commentaire. Surcoût mesuré sur 6 secteurs : **+8 à +84 %** de
  marche, **~+38 %** en médiane.
- **Ctrl+K coche « Entrée » par défaut** (`:1362`). Oublier de changer le choix écrase silencieusement l'entrée de
  l'équipe.
- **Le plafond de 10 scénarios** (`MAX_SCENARIOS`, `:737-747`) purge le plus ancien, **même en cours d'exécution**.
  [Mesuré : le scénario actif disparaît après 12 créations]
- **Les niveaux sont mal gérés.**
  - Chaque point de l'itinéraire prend le niveau de l'entrée (`level: g.entree.level || 0`, `:9416`, `:9712`).
  - Le calage d'un clic sur le réseau ignore le niveau (`pathfinder.js:779-796`) : **7,8 %** des clics près d'une
    galerie du −1 s'accrochent à un autre niveau. [Mesuré]
- **L'équipe n'a pas de structure.** `g.membres` n'est qu'un tableau de chaînes, saisi dans un seul champ à virgules
  (`:6523`). Il n'y a ni chef d'équipe, ni effectif, ni rôle par personne, ni heure de départ ou de retour.
- `pointsCles` (regroupement, relais) existe dans le modèle (`:854`, `:879`), **mais sans interface**.

## 3. Exécution jusqu'à la victime

Hypothèse : la victime est au fond d'un cul-de-sac du −1, le plus éloigné de l'accès (4,2 km par le réseau).

### 3.1 Ce qui marche [Certain]
- Lancement et choix du rôle (Opérateur, Équipe, Secouriste libre), chronomètre global avec une pause juste,
  enchaînement de phases P1 → débriefing → P2.
- Sur **un** appareil : huit statuts par étape, une observation, 5 photos, « Prendre la main ».

### 3.2 Ruptures

| Événement | Comportement | Preuve |
|---|---|---|
| Consolidation au retour | **Refusée à 100 %** (voir §0.1). Les rapports « secouriste » sont refusés eux aussi (`:2083-2090`) | ✅ mesuré |
| Victime trouvée | Statut d'étape sans position, aucun événement, aucun rappel des autres équipes (`g.statut` n'est jamais modifié par l'UI, `:2650`, `:2711`) | [Certain] |
| Évacuation | Aucun bouton dans le module (0 référence à `SortieUrgence`). Victime → accès mesuré à **5,2 km, 137 carrefours** (4,2 km si l'on ignore les zones inaccessibles), dont 189 m dans l'eau | [Mesuré] |
| Retard d'une équipe | **Aucune alerte** : ni heure de retour, ni comparaison entre `dureeEstimeeMin` et le temps écoulé (`_renderOperateurCard`, `:7165-7250`) | [Certain] |
| Équipe perdue | Aucun lien depuis la vue Équipe vers le Mode Perdu, l'écran XL ou la Sortie d'urgence | [Certain] |
| Renfort ajouté en cours de phase | Aucune étape tant que la phase suivante n'est pas lancée (`:1001-1007`) | [Certain] |
| Modifier une équipe en cours de phase | Ses étapes en cours ne sont pas mises à jour | [Certain] |
| Replanifier la P2 | Le nouveau parcours **écrase** celui de P1 (`:655-660`) | [Certain] |
| Fusion, si les identifiants étaient conservés | Un **RAS reçu est perdu**, car il pèse autant que « en attente » (`:2043`) | [Mesuré] |
| L'opérateur relaie six équipes avec « Prendre la main » | L'étape affichée n'est pas remise à zéro (`:8538-8548`) : **risque de saisir un statut sur la mauvaise étape** | [Certain] |
| RETEX | **Pas de main courante.** Chaque statut écrase le précédent, et les actions de l'opérateur ne sont pas journalisées | [Certain] |
| Réimporter le même `.mkmsec` | Crée un doublon. Seul l'identifiant du plan est vérifié, pas sa version (`:1604-1611`) | [Mesuré] |
| Plan hors-ligne | Non vérifié au lancement (`grep PlanOffline` : 0) | [Certain] |
| Trace réellement parcourue | Non rattachée au scénario | [Certain] |

### 3.3 Documents papier [Certain]
- **Briefing pompiers, bloc « POI critiques » : toujours vide.**
  - Il lit `window.listePoints`, qui n'existe pas sur `window` (`let` racine, `editor.js:6`).
  - Il lit `p.tag` au lieu de `tags[]` (`secoursMode.js:4287-4299`).
  - Sa liste de POI critiques (`:4289`) diffère de celle des sorties de `sortieUrgence.js:60-71` (`peo`, `eso`).
- **Le PDF de briefing rend le fond de carte à l'échelle 1** (`:5098`) : 226 Mpx, soit ~860 Mo de canvas, le seuil
  qu'`exporter.js:1450` dénonce déjà. Échec probable sur iPhone. [Probable]
- **Il affiche « N waypoints »** (`:5203`), qui est le nombre de points du tracé (220 à 480), pas le nombre d'étapes.

### 3.4 Guidage de l'itinéraire d'équipe (`BACKLOG` §Guidage)
**Le constat du backlog est inexact pour le Mode Secours** [Certain]. Il dit que le module crée des roads sans
`raccords` ni `carrefours`. En réalité, **il n'en crée aucune** : l'itinéraire d'équipe vit dans `g.itineraireSuggere`
et n'est qu'un pointillé de l'overlay (`:2993`). Or le guidage ne lit que la road de session `type === "itinerary"`
(`itiGuidage.js:563-565`). **L'équipe n'a donc ni bandeau, ni consigne, ni même l'annonce d'arrivée.**

| Trajet mesuré | Longueur | Carrefours |
|---|---|---|
| Approche d'un secteur depuis l'accès | 0,2 à 3,6 km | 7 à **102** (un tous les ~35 m) |
| Balayage d'un secteur | 1 140 à 2 839 points de tracé | 25 à 77 rendus par le pathfinder, **puis jetés** |
| Évacuation | 5,2 km | 137 |

Ce que ça change pour le GRIMP : une équipe de pompiers sans guide cataphile doit décider seule à chaque carrefour. C'est
**le premier risque de sur-accident**, parce que l'équipe de secours se perd à son tour.

Brancher `_champsGuidage` ne représente que ~10 % du correctif. Il faut aussi :
1. **Un bouton « Suivre »** dans la vue Équipe qui crée une vraie road `itinerary`, après confirmation, puisqu'il n'y en
   a qu'une à la fois (`interfaceItineraire.js:948-950`).
2. **Garder `carrefours`, `raccords` et le niveau réel de chaque point** : aujourd'hui ils sont jetés ou aplatis
   (`:9415-9420`, `:9711-9716`).
3. **Transmettre le contexte Secours au recalcul sur écart** (`itineraireReplanifierDepuis`). Ce recalcul reprend les
   préférences **personnelles** et perd l'évitement des autres équipes : il peut envoyer l'équipe dans le secteur
   voisin.
4. **Guider par tronçons** (approche, secteur, retour). La mini-carte XL masque un itinéraire de plus de 500 points
   (`emergencyMode.js:1464-1465`).
5. **En bonus**, synchroniser « étape atteinte » du guidage avec `startedAt` et `completedAt` des étapes Secours.
6. **Déjà géré** : les allers-retours dans les culs-de-sac (`itiGuidage.js:672-688`).

Voix et vibration restent enterrées. Le bandeau, plus la **feuille de route imprimée dans le PDF de briefing** (qui sert
de secours papier quand le téléphone meurt), suffit.

## 4. Rôles dans l'équipe (question KARMA)

**Verdict des deux rôles : retenir, en deux temps.**

**Ce que dit la doctrine SDIS.** Une équipe engagée a toujours un chef nommé et un **effectif compté à l'entrée et à la
sortie** (le contrôle des engagés). En milieu souterrain s'ajoute une composition minimale : au moins un guide qui
connaît le réseau et au moins un secouriste.

**Les deux temps :**
- **Maintenant (S-M, ~1 j)** : trois champs optionnels, `chef`, `effectif` et `remontes`.
  - La carte de l'opérateur affiche « Chef X · 5 engagés · 3/5 remontés », et le PDF imprime le chef et l'effectif.
  - Aucune rupture de format : `membres` ne change pas.
  - Environ 80 % du gain, avec l'appel au retour.
- **Plus tard (M), seulement si des exercices le réclament** : un rôle par personne pris dans une **liste fermée**
  (chef, guide, secouriste, GRIMP, serre-file, autre), avec une alerte non bloquante du type « Delta n'a pas de guide ».
  - Piège : une ancienne version qui ouvrirait `membres` au format objet afficherait « [object Object] » (`:6523`).

**Ce qu'on ne fait pas :**
- **Des rôles créables librement.** Sans vocabulaire commun, aucun contrôle de composition n'est possible, et on ne
  peut pas les traduire dans les trois langues.
- **Le nom de la personne qui a trouvé la victime dans les exports.** L'équipe suffit, et le fichier circule sur
  messagerie (`secours.md` §65.10).

## 5. Plan d'action

Effort : **S** < ½ j · **M** 1 à 3 j · **L** > 3 j. Tout reste community, 100 % hors ligne. Reporté dans
`docs/BACKLOG.md` §Mode Secours.

| Lot | # | Action | Effort |
|---|---|---|---|
| **A — bloquants** | A1 | Conserver l'identifiant d'origine à l'import (ou garder la correspondance origine → local) et le rendre idempotent au réimport. Corriger `session-data.md` §72.1 | S |
| | A2 | Mode « tracés » : se brancher sur `entry.polyline` et identifier chaque tracé par une **empreinte stable** (calque + index, ou hachage des points) | S-M |
| | A3 | « 📍 Victime ici » (clic ou position du suivi, avec le niveau), puis « 🚑 Évacuer » via `SortieUrgence.declencherDepuis`, avec les options brancard (éviter l'eau et les remblais, lever les inaccessibles) | M |
| | A4 | Heure de départ et heure de retour par équipe, alerte orange puis rouge sur la carte de l'opérateur et sur le téléphone de l'équipe | S-M |
| | A5 | Soustraire les scénarios actifs à la purge du plafond de 10 | S |
| **B — planif. et exéc.** | B1 | Guidage Secours (§3.4) | M |
| | B2 | Feuille de route du secteur dans le PDF de briefing | S |
| | B3 | Couverture : POI affectés, doublons et orphelins, puis % du linéaire, avec les trous surlignés pour préparer la P2 | M |
| | B4 | Niveaux : ne plus aplatir l'itinéraire ; caler les clics niveau par niveau (profite aussi à l'itinéraire général) | S-M |
| | B5 | Ordre des étapes en plus proche voisin (+ 2-opt en option) ; « Étape » cochée par défaut dans Ctrl+K | S |
| | B6 | Préréglage « fouille » (~1,5 km/h, pause 0 par défaut pour un balayage) | S |
| | B7 | Fusion (départager les égalités, accepter les rapports secouriste), remise à zéro à la prise de main, étapes reconstruites pour un renfort ou une modification, un parcours **par phase**, rappel général, **main courante** horodatée (M) | S à M |
| | B8 | PDF : « POI critiques » (via `getAllEmbeddedPoints`, `tags[]`, aligné sur `sortieUrgence`) ; fond de carte sous le plafond d'`exporter.js` ; liste des étapes | S |
| | B9 | Chef, effectif et nombre de remontés (§4, premier temps) | S-M |
| | B10 | Au lancement en rôle Équipe : vérifier que le plan est hors ligne, liens vers Sortie d'urgence et l'écran XL ; `pointsCles` dans l'interface | S à M |
| **C — plus tard** | C1 | Découpage automatique en N secteurs équilibrés (~2 s sur 87 km en Node) et parcours de balayage (culs-de-sac et boucles) au lieu du plus court chemin. **Après A2 et B3** | L |
| | C2 | Évacuation brancard : contrainte dure et attribut de gabarit sur les tracés (modèle de données + Générateur) | L |
| | C3 | Rôle par personne en liste fermée (§4, second temps) | M |

**Ordre recommandé** : A1 → A2 → A3 → A4 → A5, puis B3 → B1 (+B2), puis le reste du lot B, puis le lot C.

**Côté données (KARMA seul)** : taguer les vrais accès du plan (`entree_plan`, `cao`/`eso`), et renseigner le niveau
des 47 tracés et des 44 POI qui n'en ont pas. **C'est le correctif le moins cher, et le seul qu'aucun code ne remplace.**

**Hors périmètre community** : la synchronisation temps réel entre le PC et les équipes, la remontée automatique des
positions et le tableau de bord multi-poste. Ils supposent un réseau ou un backend. **Le QR (Phase 4) reste enterré** :
A1 rend la voie fichier fiable.

**Non vérifié** : aucun rendu dans un navigateur, ni l'échec réel du canvas du PDF sur iPhone, ni la durée réelle de
saisie.
