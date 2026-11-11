# Étude — « Vérifier le plan » (contrôle des données d'un plan)

> Étude ouverte le 11/11/2026 à la demande de KARMA, née de l'étude des remblais (`docs/ETUDE_REMBLAIS.md`,
> question 2 bis) : quand le type « Comblé » bloquera l'itinéraire, il faudra voir les tracés qu'il coupe. KARMA
> élargit l'idée à un outil de contrôle général du plan. Le QCM a été tranché le même jour, toutes les recos prises (« Décisions de
> KARMA », en fin de document) : il fait foi pour l'implémentation. Aucun
> code de l'app n'a été modifié pour l'écrire ; chaque fait de l'état actuel renvoie à `fichier > fonction` (lu sur
> `Karma_dev`, commit `032b1b29`).

## Le besoin

Un plan se construit par couches : relevé, imports SIG ou KMZ, sessions fusionnées, calques, plusieurs personnes sur
une installation. Des erreurs s'y glissent sans bruit : une jonction qui ne raccorde rien, une galerie coupée par une
zone bloquante, un objet importé deux fois. L'app les absorbe en silence (un segment sort du graphe, un passage n'est
pas emprunté) et on ne les découvre que par un itinéraire qui échoue, parfois sous terre. Il faut un endroit qui les
liste, montre chacune sur la carte et propose la correction quand elle est sûre.

Les `scripts/check-*.js` ne sont **pas** ce besoin : ce sont des garde-fous du **code** au commit, ils ne lisent
aucune donnée de plan.

## Ce qui existe déjà

| Contrôle | Où | Ce qu'il fait |
|---|---|---|
| **🔗 Raccords à vérifier** | `js/raccordsTraces.js` (`KtaRaccords`), carte de l'Éditeur de données (`tableEditor.js`, `kta-tbl-src-raccords`) | Écarts de 1,5 px à 6 m entre deux morceaux séparés du réseau, même niveau ; revue sur la carte (bandeau Précédent / Suivant), **Raccorder** (écriture avec historique) ou **Ignorer** (clé de géométrie arrondie retenue par plan, `config.js > setPlanRaccordsIgnores`) ; un tracé de calque passe d'abord en session (`FilterPanel.rapatrierCalque`). Garde-fou `scripts/smoke/checkup-raccords.js`. **Le modèle à suivre** |
| **Sommets en double** | `tableEditor.js > _dedupliquerFichier`, carte `kta-tbl-src-dedup` | Retire les sommets identiques **consécutifs** des tracés, zones, structures ; un objet n'est supprimé que s'il passe sous son minimum. Les POI ne sont pas touchés (superposition légitime) |
| Raccords d'un POI jonction | `js/poiJonction.js > proposerRaccords` | Propose, **à la saisie** du point, les galeries à moins de 5 m (50 px sans échelle) sur chaque niveau ; l'utilisateur valide (`accroches`). Rien ne revient sur les points existants |
| Liaisons vers un plan absent | `js/interPlanLinks.js` (gestionnaire des liaisons, `kta-ipl-absent`, `ipl.popup.planAbsent`) | Marque ⛔ une liaison dont le plan n'est pas sur l'appareil ; message à la traversée (`ipl.err.planAbsent`) |
| Doublons d'identifiant | `js/ktaUid.js > ensureAll` | Régénère tout `uid` déjà vu au chargement (identité, pas contenu) |
| Type inconnu au Tableur | `tableEditor.js` (colonne `type`, application refusée) | Bloque la saisie ; un objet déjà orphelin (import) reste rendu en couleur de repli |

**N'existe pas [Certain, `grep`]** : aucun écran qui rassemble ces contrôles ; aucune détection d'**objets** en double
(même type, même géométrie : seuls les sommets consécutifs le sont) ; aucun signalement d'un segment coupé par une zone
dure (`pathfinder.js > _buildGraph`, `_segmentBloqueParZoneInaccess` : il sort du graphe sans rien dire) ; aucune
revue des POI jonction existants sans raccord validé, alors que l'itinéraire **n'emprunte que les raccords validés**
(`poiJonction.js`, en-tête ; `pathfinder.js > _injecterJonctionsPoi`).

## Contrôles candidats

Gravité : **Bloquant** = l'itinéraire ou la sortie d'urgence se trompent ; **À revoir** = résultat douteux (volume,
3D, exports) ; **Info** = propreté.

| # | Contrôle | Comment on le détecte | Gravité | Correction sûre ? | Reco |
|---|---|---|---|---|---|
| C1 | **Tracé coupé par une zone bloquante** (inaccessible, Comblé demain, murs en ligne) | Le test **du pathfinder** (`_segmentTraversePolygon`, `_segmentCoupeParMur`, à exposer), niveau compris (zone multi-niveau : chacun de ses niveaux), par paire (tracé, obstacle), avec la longueur dans la zone ; marqué « au bord » sous ~0,5 m (souvent une erreur de dessin) | Bloquant | Non : changer le type de la zone (Comblé → Masse au sol, en lot), ajuster les sommets, ou « vu, normal » (galerie condamnée) | **Oui** |
| C2 | **POI jonction : un de ses niveaux sans raccord validé** | `niveaux` sans `accroches` à ce niveau (`KtaPoiJonction.niveaux`, `accroches`) | Bloquant (le passage est ignoré) | Proposer les raccords (`proposerRaccords`), l'utilisateur valide | **Oui** |
| C3 | **Tracé jonction mal posé** : `fromLevel` = `toLevel`, ou un bout à plus de la tolérance du pathfinder (`PROXIMITY_TOLERANCE`, 15 px) de toute galerie de son niveau | Lecture des bouts, mêmes seuils que le graphe | Bloquant | Non (où accrocher ?) | **Oui** |
| C4 | **Objets en double** : même famille, même type, même niveau, même géométrie au cm près ; points : même position, même tag **et** même nom | Empreinte arrondie, table de hachage | À revoir | **Oui si identiques en tout** (hors `uid` / `updatedAt`) : garder un exemplaire ; sinon montrer les deux | **Oui** |
| C5 | **Écarts du réseau** (Raccords à vérifier existant) | `KtaRaccords.detecter` tel quel | À revoir | Raccorder (existant) | **Oui, intégré** |
| C6 | **Zone ou structure fermée dégénérée** (moins de 3 sommets distincts, aire nulle) ou **qui se recoupe** | Sommets distincts ; croisement d'arêtes non voisines | À revoir (volume en pair-impair, itinéraire, 3D) | Dégénérée : supprimer ; qui se recoupe : non | **Oui** |
| C7 | **Objet hors de l'image du plan** | Coordonnées hors `[0, imageWidth] × [0, imageHeight]` | Info (souvent un import mal calé) | Non | **Oui** |
| C8 | **Niveau inconnu** (plan multi-niveau) : objet sur un niveau absent de `availableLevels` | Comparaison | À revoir **[Probable]** : il n'apparaît dans aucun choix du sélecteur | Non | **Oui** |
| C9 | **Type absent de la légende** (import, faute de frappe) | `ktaResolveStyle` sans entrée | Info (couleur de repli, exclu des filtres) | Non | **Oui** |
| C10 | **Sommets en double** (dédoublonnage existant) | `_dedupliquerFichier` sur une copie, compte seul | Info | Oui (existant) | **Oui, intégré** |
| C11 | Liaison vers un plan absent | Déjà dans le gestionnaire des liaisons | Info | — | **Renvoi** vers le gestionnaire, pas de doublon |
| — | Écartés | Noms en double (légitime), tracés très courts, POI superposés de tags différents (légitime), angle aigu, sommet très proche d'un autre sur le même tracé | — | — | Non : bruit |

## Où on le lance

| Endroit | Pour | Contre |
|---|---|---|
| **Carte « 🩺 Vérifier le plan » de l'Éditeur de données** | Là où vivent déjà Raccords et Dédoublonnage ; « Vérifier le plan » les rassemble | L'Éditeur de données est peu fréquenté |
| Configuration / ⚙️ du plan | Visible | Pas un réglage |
| **Générateur, à la fin de la génération** | Le plan part propre | Ne voit ni la session ni les calques ajoutés ensuite |
| **Au chargement, passe légère** : seulement C1 à C3 (bloquants), une pastille et un toast **une fois** tant que le nombre ne change pas | Attrape les plans existants (le risque Comblé) | Coût au démarrage : à faire au repos, après le premier rendu |
| À la saisie (fermer une zone bloquante, finir un tracé, changer un type vers un bloquant) | Avertit quand on peut corriger | Ne voit que l'objet saisi |

**Reco** : carte de l'Éditeur de données + passe légère au chargement (bloquants seuls, pastille et toast une fois) +
fin du Générateur + saisie pour C1. Une entrée directe (menu ≡ ou ⚙️) pointe sur la même fenêtre si la pastille est
allumée.

## Rendu

- Liste **groupée par gravité** puis par contrôle, compte en tête ; un élément = une ligne (objet, niveau, ce qui ne va
  pas).
- Toucher = carte centrée sur l'endroit, niveau changé s'il le faut, objet surligné ; bandeau Précédent / Suivant
  comme `raccordsTraces.js` ; **Ouvrir la fiche** ; actions propres au contrôle (changer le type, proposer les
  raccords, ajuster les sommets, garder un exemplaire).
- **« Vu, normal »** : mémorisé par `uid` (tracés, zones et structures en ont depuis v2.1.0, `js/ktaUid.js`), clé
  `contrôle|uid[|uid2]`, par plan, sur l'appareil (comme les raccords ignorés, mais par identité et non par géométrie :
  redessiner l'objet ne le fait pas revenir, le modifier non plus ; à trancher, question 6). Liste des « vus »
  consultable et réversible.
- Textes fr / en / es, aucune popup native (`ktaAlerte`, `ktaConfirm`, toasts).

## Corrections

Seulement quand elle est sûre (C4 identiques, C6 dégénérée, C10), toujours par les chemins existants :
`captureState` → mutation → `KtaUid.touch` → rendu → historique (Ctrl+Z), comme `raccordsTraces.js` et
`ajusterSommets.js > _ecrire`. Une suppression passe par le filet des actions destructives (`check-filets-donnees.js`
le vérifiera). Objets d'un **calque** : en lecture seule, la correction propose d'abord de le passer en session
(`FilterPanel.rapatrierCalque`, la question de « 🔄 Modifier »). Rien n'est corrigé sans un geste de l'utilisateur.

## Coût sur un gros plan [Probable, à mesurer]

- C1 : segments × obstacles. Le pathfinder n'indexe pas les zones (boucle sur toutes) mais a une grille pour les murs
  (`_preparerObstacles`, 64 px) ; `galerieEmprise.js > _indexZones` range les zones en grille. Une grille sur les
  zones bloquantes ramène ~10⁵ segments × quelques centaines de zones aux cases partagées.
- C4, C7 à C10 : linéaires (hachage, bornes). C6 : quadratique par contour, mais un contour a peu de sommets.
- C5 : le coût actuel de `KtaRaccords.detecter`.
- Calcul par tranches au repos, mémorisé par signature des données (comme `galerieEmprise.js`, `MEMO_MS`) ; la passe du
  chargement se limite à C1–C3. Mesure sur le plus gros relevé des checkups avant d'activer la passe automatique.

## Plan serveur, installation pro

- **Community seul** : aucune prise, aucun code pro. Le contrôle lit ce que l'app a chargé (session + calques).
- Lire est permis à tous ; **corriger** suit les droits existants : sur un plan partagé, une suppression laisse une
  trace de suppression et la suppression en masse exige le droit « gérer », vérifié au serveur (décision du
  22/10/2026). Le contrôle n'ajoute aucun droit : il appelle les chemins qui les appliquent déjà.
- « Vu, normal » reste sur l'appareil (question 6) : rien à synchroniser.

## Risques

- **Deux vérités** : un contrôle qui ne reprend pas exactement le test du pathfinder (C1, C3) annonce un problème qui
  n'existe pas, ou en tait un. Parade : exposer et réutiliser les fonctions du pathfinder, jamais une copie.
- **Bruit** : trop de contrôles ou des seuils trop serrés, et la liste n'est plus lue. D'où la liste courte ci-dessus
  et « vu, normal ».
- **Correction destructive** sur un faux doublon : seulement les identiques en tout, et un geste.
- **Coût au démarrage** sur un vieux téléphone : passe légère seulement, au repos.

## Décisions de KARMA (QCM du 11/11/2026)

Toutes les recos sont prises.

| # | Question | Options | Décision |
|---|---|---|---|
| 1 | Contrôles du premier lot | a) C1 à C3 (bloquants) · b) C1 à C10 d'un coup | **a**, puis le reste au lot 2 |
| 2 | Liste des contrôles | a) C1 à C10 + renvoi C11, écartés tels quels · b) en ajouter / retirer | **a** |
| 3 | Où le lancer | a) carte de l'Éditeur de données · b) a + passe légère au chargement · c) b + fin du Générateur + saisie (C1) | **c** |
| 4 | Passe au chargement | a) pastille + toast une fois tant que le nombre ne change pas · b) pastille seule · c) rien d'automatique | **a** |
| 5 | Murs en ligne dans C1 | a) inclus (contrainte dure aussi) · b) zones seules | **a** |
| 6 | « Vu, normal » | a) par uid, par plan, sur l'appareil · b) écrit sur l'objet (voyage avec le plan, la synchro et les exports) · c) a, et b pour une seule chose : la zone volontairement condamnée (C1) | **c** (une galerie condamnée est une donnée du plan ; le reste est un avis personnel) |
| 7 | Doublons (C4) | a) garder un exemplaire en un geste si identiques en tout, sinon montrer · b) jamais de correction | **a** |
| 8 | Seuil « au bord » de C1 | a) 0,5 m · b) autre | **a**, à caler sur des relevés |
| 9 | Corrections sur un calque | a) proposer le passage en session d'abord (comme Raccords) · b) lecture seule, rien | **a** |
| 10 | Raccords et Dédoublonnage | a) restent des cartes de l'Éditeur et deviennent aussi des contrôles de la liste · b) absorbés (cartes retirées) | **a** (pas de régression pour qui les connaît) |

## Découpage proposé

| Lot | Contenu | Taille |
|---|---|---|
| 1 | Moteur de contrôles (fonctions pures, testables en Node comme `check-api-surface.js`), fonctions du pathfinder exposées, table unique des types durs, grille des zones bloquantes ; fenêtre (liste groupée, centrer, fiche, Précédent / Suivant, « vu, normal ») ; **C1, C2, C3** ; avertissement à la saisie pour C1 ; garde-fou Node sur données fictives ; textes fr / en / es, aide, guides, `ui.md`, `multilevel-pathfinding.md`. **À livrer avant que Comblé bloque** (`ETUDE_REMBLAIS.md`, lot 0) | M |
| 2 | C4, C6, C7, C8, C9 ; C5 et C10 branchés ; renvoi C11 | M |
| 3 | Corrections sûres (doublon identique, contour dégénéré), filets et historique, calque → session, plan partagé (traces, droits) ; `check-filets-donnees.js` étendu | M |
| 4 | Passe légère au chargement (pastille, toast une fois) et fin du Générateur, après mesure du coût | S |

## Inconnues qu'on ne lèvera que sur des relevés réels

- Combien de croisements C1 un relevé réel porte (le jour où Comblé bloque : combien de zones à re-typer).
- Le bon seuil « au bord » et la part de doublons d'objets réels après des imports successifs.
