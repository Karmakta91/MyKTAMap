# Étude — Vue 3D autour de sa position

> Étude de la vue 3D (`js/vue3d.js`), d'après les QCM de KARMA du 01 et du 02/11/2026. Lots 1, 2, 4, 4 bis, 4 ter et
> 4 quater (passages entre niveaux) livrés : la vue s'ouvre par le bouton cube de la barre de droite (sous ≡ Filtres),
> avec trois rendus (mixte par défaut, raccord par côté, structures, galerie), joystick au téléphone, les filtres de la
> carte, l'itinéraire en ruban plein à chevrons et le guidage, les ronds d'intersection, la fiche des POI, précachée, textes fr/en/es,
> docs. Reste : la mesure sur un vrai iPhone (lot 3) et la question 9. Contrats à jour :
> `docs/architecture/tracking.md` § Vue 3D ; place dans l'interface : `docs/architecture/ui.md` § Vue 3D.

## Le besoin

Sur un plan dense en piliers, murs et fronts de taille, la vue de dessus dit mal ce qu'on a devant soi. Depuis sa
position (tracker), l'utilisateur voit en 3D ce qui l'entoure et s'y déplace, depuis le bouton cube de la barre de
droite.

## Décisions de KARMA (QCM du 01/11/2026)

| # | Sujet | Décision |
|---|---|---|
| 1 | Livrable | Cette étude + un prototype jouable sur le relevé fictif ; puis (second QCM) livrée dans le menu Tracker |
| 2 | Caméra | Première personne à hauteur d'yeux depuis le tracker ; un bouton bascule en vue plongeante au-dessus de soi |
| 3 | Librairie | three.js embarqué dans `lib/`, chargé **à la demande** (rien au démarrage) |
| 4 | Contenu | Structures extrudées à la hauteur du plan (Volume exploité) ; sol, plafond ; zones ; POI en panneaux ; tracés et itinéraire au sol |
| 5 | Déplacement | Suit le tracker ; boutons à l'écran et clavier ; on bute contre piliers, murs, fronts avec la règle du pas du tracker |
| 6 | Lumière | Lampe frontale : noir autour, faisceau devant qui s'éteint au loin |
| 7 | Niveaux | Niveau actif seul ; un changement de niveau refait la scène |
| 8 | Performance | 30 images/s sur un iPhone récent, plan dense (~9 000 piliers, 4 000 murs, 700 fronts) |

## Décisions de KARMA (QCM du 02/11/2026) : cohérence avec l'app

Après l'audit de cohérence (la 3D se posait par-dessus l'app comme une autre appli) :

| # | Sujet | Décision |
|---|---|---|
| 1 | Entrée | Bouton dans la barre de droite, juste sous ≡ Filtres, picto cube au trait de l'écran Bienvenue ; grisé sans plan ou sans échelle, toujours touchable ; la tuile du menu Tracker est retirée |
| 2 | Filtres | Le même panneau ≡ Filtres que la carte, un seul état (masquer en 3D masque en 2D, et inversement) ; toutes les sections lues (tags, types, calques de données, niveaux) ; panneau propre à la 3D supprimé. **Revient sur** « la 3D ne touche pas aux filtres 2D » et sur la question 6 ci-dessous |
| 3 | Urgence | 🚨 dans la rangée du haut, même action que l'en-tête ; toasts sous la rangée |
| 4 | Icônes | Celles de la 2D : 🏛️ Structures, 🛣️ Galerie ; ni 📍 (recalage) pour le suivi, ni 🛰️ (Export GeoTIFF) pour la vue plongeante ; ✕ au coin haut droit au téléphone ; ❓ d'aide et marque « bêta » visibles (marque retirée depuis, ci-dessous) |
| 5 | Panneaux de POI | Toujours sombres (jetons du thème sombre) ; distance minimale et fondu de près |
| 6 | Finitions | Indicateur de chargement ; Échap ferme d'abord le panneau ouvert ; focus et `aria-modal` ; rendu en pause (bruit de la boussole ignoré) ; statistiques en i18n ; section « Vue 3D » dans `ui.md` |

## Décisions de KARMA (QCM du 02/11/2026) : guidage, fiche, « Y aller »

| # | Sujet | Décision |
|---|---|---|
| 1 | Guidage en 3D | Bandeau compact sous la rangée du haut, mêmes textes que le guidage 2D (lus comme l'écran XL) ; chevrons au sol sur le ruban vers la prochaine manœuvre ; en libre un **aperçu** depuis la position 3D, sans toucher l'état du guidage ; en suivi la consigne réelle. La scène se redessine quand l'itinéraire change (`kta:itineraireChange`). Pas de voix |
| 2 | Toucher un POI | Sa fiche de la carte, la même, au-dessus de la 3D ; pas de nouvelle fiche |
| 3 | « Y aller » depuis la fiche | Suivi → du tracker ; libre → de la position 3D, niveau compris, tracker non recalé ; jamais de la position d'avant l'ouverture de la 3D |
| 4 | Tracker arrêté + « Y aller » (2D et 3D) | « D'où pars-tu ? » à chaque fois : « Ici » (3D : recale le tracker à la position 3D, puis l'itinéraire en part), « Ma dernière position (il y a N min) », « Me repositionner » (picker et son niveau) ; Annuler = pas d'itinéraire |
| 5 | « Je suis ici » d'un POI d'un niveau sans tracé | Repli sur l'image de collision (point accessible le plus proche, 6 m) même si d'autres niveaux ont des tracés |
| — | Rangée du haut (demande du 02/11/2026) | ≡ Filtres collé à gauche de ✕, au téléphone comme au PC |

Choix faits à la livraison, à valider : la fiche en 3D n'a ni ✏️ ni Repositionner ni 🗑️ (ils se jouent sur la carte, cachée dessous) ; en libre, l'aperçu
suit le réglage Auto / Jamais (hors urgence) mais les chevrons restent ; sans position jamais confirmée et hors 3D,
« Me repositionner » serait la seule réponse : le picker s'ouvre directement, sans question.

Choix faits à la livraison du lot de cohérence, à valider : 🧭 pour le suivi (le tracker en 2D), 🦅 pour la vue plongeante (sans autre
sens dans l'app), ⛏️ pour la hauteur (↕ dit « passages entre niveaux » dans la légende ; ⛏️ = Volume exploité,
dont c'est le même chiffre).

## Décisions de KARMA (QCM du 02/11/2026) : mode mixte, dangers, favoris, équipe

KARMA a montré un relevé réel où une galerie débouche sur une chambre à piliers bordée de fronts de taille : le mode
galerie (tubes sans structures) n'y convient pas.

| # | Sujet | Décision |
|---|---|---|
| 1 | Mode mixte | **Par défaut** : piliers, murs et fronts dessinés partout ; les tracés en tubes seulement là où aucune structure n'est autour (galeries de liaison), le tube s'ouvre en entrant dans une chambre, sans paroi de fond ni paroi orpheline. Chambre repérée à ~3 m d'une structure du niveau (valeur à proposer, constante nommée). L'interrupteur devient **trois états Mixte / Structures / Galerie**, retenu par plan. Collisions : structures partout, parois des tubes là où elles existent. Zones et POI : règle de la galerie dans les tubes, des structures dans les chambres |
| 2 | Dangers | Halo ou pictogramme au sol, rouge de la charte, en plus du panneau ; sobre, lisible à la lampe |
| 3 | Favoris | Une marque sur le panneau (⭐ dans un coin) |
| 4 | Membres et repères (pro) | Par la prise neutre existante (`KtaPresences`), lecture seule : membres au bon niveau (silhouette et nom), repères, itinéraires partagés ; rien sans extension ; testé avec une extension factice |

Choix faits à la livraison, à valider : **3 m** (justification au modèle de scène), 🏛️🛣️ pour le mixte (les deux
icônes de la carte accolées, aucune n'en dit « les deux »), ordre du bouton mixte → structures → galerie, halo en
anneau et disque pâle de `--kta-erreur` (le rouge de la charte du thème sombre, celui des panneaux), liseré du
panneau danger rouge lui aussi, tubes de moins de 3 m entre deux chambres ouverts, tracés en rubans au sol en mixte
(pas de liseré : il appartient au mode galerie).

## Décisions de KARMA (QCM du 02/11/2026) : passages entre niveaux (audit n° 2)

L'audit n° 2 (relevé fictif, téléphone et PC, deux thèmes) a montré un passage de niveau sec et sans volume, un
panneau de POI jonction qui s'effaçait là où 🪜 apparaissait, une arrivée hors du tube en mixte, et un guidage qui
taisait la descente par un tracé jonction. Tranché :

| # | Sujet | Décision |
|---|---|---|
| 1 | Volumes de passage | Par moyen (`KtaPoiJonction.moyen`) : escalier (`jes`, `eso`) = cage de 2,5 × 1,5 m à marches ; échelons (`jpe`, `peo`) = puits carré de 1,2 m en moellons, échelons tous les 0,3 m ; corde (`jps`) = puits nu. Ouvert dans le sol (descente), dans le plafond (montée : il dépasse la hauteur et se perd dans le noir), les deux entre trois niveaux. Puits de surface `peo`, `eso` et **`pa`** (qui porte désormais des niveaux, `TAGS_SURFACE_NIVEAUX`) : plafond seulement, sans 🪜 ni passage ; disque de ciel au sommet de `peo` / `eso`, tube de 0,8 m à grille pour `pa`. Panneau au-dessus, cadre doré au sol. Construits avec les objets à portée. Le **tracé `jonction`** devient une **rampe** à la couleur du canon |
| 2 | Panneau d'un POI jonction | Liseré à la couleur du tracé jonction et ↕ ; lisible jusqu'à 1 m (là où 🪜 apparaît) |
| 3 | Geste | Fondu noir de 250 ms (scène d'arrivée construite pendant le noir), descente ou montée animée d'environ 1 s dans le volume, verticale seulement ; même fondu quand le tracker change de niveau en suivi, et bandeau « Niveau −1 » 2 s |
| 4 | Arrivée | Raccord validé, sinon POI ; en mixte comme en galerie, une arrivée hors du tube à moins de `smartNavRadiusM` d'un axe est ramenée dans le tube ; cap vers la prochaine consigne si un itinéraire passe là, sinon le long de la galerie, côté le plus long |
| 5 | Toucher un POI jonction | Sa fiche, comme tout POI, avec « ▼ Descendre » / « ▲ Monter » (un bouton par niveau lié, moyen compris) ; 🪜 à 2 m reste, ses boutons nommés (« ▼ -1 · Nom du puits (échelle) ») |
| 6 | Guidage | Une consigne de niveau absorbe les consignes de carrefour à ≤ 5 m et passe devant à abscisse égale ; aperçu de la 3D filtré au niveau de la scène (plus de « Rejoindre le tracé » sur un niveau sans itinéraire ; la consigne de niveau déjà franchie n'est plus dite) ; libellé du niveau signé (« +1 »), 2D comprise |
| 7 | Aide intégrée | Réécrite à l'état actuel (mixte par défaut, trois rendus, dangers, favoris, équipe, place « en vue 3D », passages) |

Choix faits à la livraison, à valider : escalier en volée droite le long de la galerie la plus proche (pas en quart
tournant), marches pleines jusqu'au fond du volume ; une volée par moitié de largeur entre trois niveaux ; échelle
contre une paroi, montants qui dépassent du sol d'un mètre ; ciel = dégradé clair (couleur de la scène) ; rampe de
1 m de large, tranchée ouverte vers le bas plutôt qu'une rampe qui traverserait le sol ; aucune collision avec les
volumes (on ne tombe pas dans un puits, on traverse une marche) ; bandeau « Niveau n » aussi après un passage 🪜, pas
seulement en suivi ; appareil réglé en « mouvement réduit » : fondu seul ; tracé jonction masqué par les filtres =
pas de rampe (le 🪜 reste). Un tracé du sol (ruban) qui passe sur une bouche y est coupé (gabarit du sol) plutôt
que dessiné en passerelle : le plus simple, et rien ne flotte au-dessus du vide.

## Décisions de KARMA (QCM du 02/11/2026) : commandes, itinéraire, raccord, ronds (audit n° 2)

Après le deuxième audit (pavé peu maniable au pouce, itinéraire trop large et sans repères, paroi disparue du côté
opposé à un pilier en mixte, ronds d'intersection absents en 3D) :

| # | Sujet | Décision |
|---|---|---|
| 1 | Commandes au téléphone | **Joystick flottant à gauche** : apparaît sous le pouce (zone gauche sous le bandeau, au-dessus de la boussole) ; anneau ≥ 88 px, bouton 44 px, jetons `--kta-surface` / `--kta-accent`, aucune image ; débattement 40 px → 0 à 2,8 m/s, Y avant / arrière, X pas de côté ; **course** = débattement > 85 % tenu 0,6 s ; zone morte 12 px. Regard au glisser sur la moitié droite. Toucher le stick passe en libre ; en suivi, le glisser ne tourne pas. Deux doigts inchangés (le doigt du stick ne compte pas). Clavier inchangé ; pavé au PC (`pointer: fine`) et option « Pavé classique » dans ⚙️ (réglage par appareil) |
| 2 | Itinéraire au sol | Ruban **plein de 0,3 m** à `--kta-interaction`, **liseré sombre** de 4 cm sur chaque bord, **chevrons de sens** sombres tous les 2 m comme le trajet du jeu (révisé le 05/11/2026 : les tirets calqués sur la 2D cédaient la place), chevrons de guidage gardés ; **marqueurs** : disque et mât de 0,6 m à chaque étape, 🏁 en panneau à l'arrivée. Itinéraires des membres dorés tiretés, distincts. Pas d'animation |
| 3 | Raccord galerie / structures en mixte | **Par côté** : chaque tronçon juge sa paroi gauche et droite séparément (échantillon à axe ± (w + 0,5 m), structure à moins de 3 m − w → côté ouvert) ; la pièce reste entière ; à chaque bout d'un côté ouvert, un **pan de paroi perpendiculaire** vers la structure, borné à 1,5 m, coupé à sa face : ni fente ni bout orphelin ; aux nœuds, le joint garde ses parois sauf sur les branches dont le côté est ouvert. Deux côtés = chambre, structure dans l'axe = bout ouvert. Collisions : parois dessinées seulement, la structure bloque par la règle du tracker |
| 4 | Ronds d'intersection | `road.js` mémorise sa dernière liste `[{ point, color, level }]` et l'expose (`getRoadIntersections`) ; la 3D la lit si l'option 2D est cochée, au niveau affiché, disque à la couleur donnée au-dessus des rubans ; redessin par `FilterPanel.onChange` ou `kta:intersectionsChange` ; aucun recalcul côté 3D |
| 5 | Marque « bêta » | Retirée partout (vue, Bienvenue, guides, Aide, AI_CONTEXT, notes, README, docs) ; la phrase « la 3D montre le plan, pas la galerie réelle » reste |
| 6 | Finitions | Toast de présence 3D en `info` ; focus rendu au bouton cube après « Je suis ici ? » ; toucher un membre ou un repère : un toast court avec son nom |

Choix faits à la livraison, à valider : le joystick ne **passe en libre qu'en sortant de la zone morte** (un toucher
bref sans bouger, qui vise peut-être un panneau, ne quitte pas le suivi ; il ouvre le panneau touché) ; la course
garde la vitesse pleine × 2,5 tant que le débattement reste au-delà de 85 % ; au repos, l'anneau attend en bas de la
zone (contour gris) pour qu'on sache où poser le pouce ; disque de rond de **0,35 m de rayon** (0,7 m de diamètre,
environ trois fois la largeur d'un tracé, comme sur la carte) ; un côté ouvert ne commence que là où un pan
perpendiculaire de 1,5 m touche la structure (avancé par pas de 10 cm), sinon il reste fermé ; aux nœuds, le bord du
joint s'ouvre si l'une des deux branches qui le bordent a ce côté ouvert ; le 🏁 de l'arrivée, touché, donne son nom
comme un membre ; ruban et ronds en couleurs exactes (sans compression de tons, comme le halo des dangers).
Revu ensuite par KARMA : le toast de présence et le nom d'un membre ou repère touché passent en **`success`**, pour
être toujours vus (`info` est tu par défaut, `oomGuard.js > _decisionToast`) ; le mixte par côté reste tel quel
(modèle plus lent sous émulation, accepté).

**Tuile ⚙️ Réglages** (demande de KARMA du 02/11/2026) : pour gagner de la place, suivi / libre, vue, hauteur et rendu
quittent la rangée du haut (✕, ≡, 🚨, ❓, ⚙️ : une ligne au téléphone) pour une petite tuile ancrée sous ⚙️, chacun
écrit en clair avec son état, plus un interrupteur de la **boussole** (retenu sur l'appareil, montrée par défaut).
Fermée par ⚙️, Échap ou un toucher ailleurs ; raccourcis clavier inchangés. Forme retenue, à valider : un point doré
sur ⚙️ quand un réglage n'est pas celui par défaut (libre, plongeante, rendu autre que mixte, boussole masquée) ; le
mode suivi / libre reste visible hors de la tuile par une pastille ronde 🧭 / 🕹️ en haut à gauche, non touchable
(liseré doré en libre).

## Ce que fait la vue

- **Entrée** : bouton cube de la barre de droite, sous ≡ Filtres, titré « le plan, pas la galerie réelle » ; grisé
  (et son toucher dit pourquoi) sans plan ou sans échelle, sans rien charger ; indicateur pendant l'ouverture.
- **Ouvrir** : `KtaVue3D.ouvrir({ distanceVue, tuiles, depart, densiteMax, stats, attenteReprise })` charge
  `css/vue3d.css` et three.js, monte une fenêtre plein écran (z-index des modales), part de la position et du cap
  du tracker (`getTrackingPosition`, `getPlanRelHeading`). Refus avec message sans échelle, sans WebGL, ou si
  three.js ne se charge pas. `fermer()` (✕ ou Échap) démonte tout, libère le contexte WebGL, puis pose
  « 📍 Je suis ici ? » si le suivi est actif et qu'on s'est déplacé (Oui = recalage du tracker).
- **Vues** : à hauteur d'yeux (1,6 m, ou 80 % de la hauteur si la galerie est basse) ; 🦅 ou touche V = plongeante
  (caméra à 18,4 m du point visé 2 m devant soi, plafond masqué, silhouette dorée à sa place, éclairage
  d'ambiance relevé). **Inclinaison** de 15° (rasante) à 85° (presque verticale), 60° par défaut : deux doigts
  glissés à la verticale, molette, PageUp / PageDown, ou deux petits boutons ▲ ▼ montrés dans cette vue
  seulement ; retenue tant que la vue est ouverte.
- **Boussole** : rose des vents en bas à gauche (`icon/compass.svg`, celle de la boussole 2D). Son N pointe vers le
  nord réel selon la direction de la vue : rotation −(cap plan − `getPlanNorthOffset()`), la convention de
  `compass.js` et l'inverse de `tracking.js > _getPlanRelHeading`, sans autre calcul. Plan sans Nord calibré
  (`config.js > getPlanNorthCalibre`) : la rose montre le haut du plan, avec la mention « Haut du plan (nord non
  calibré) ».
- **Suivi / libre** : 🧭 / 🕹️ bascule entre **suivi** (la caméra suit la position du tracker et le cap de l'appareil,
  lissés, lus à la même source que le mode 2D « plan orienté » : `getPlanRelHeading`, offset Nord compris ; on
  tourne avec le téléphone, la vue tourne) et **libre** (boutons et clavier). Ouverture en suivi si le tracker
  tourne, sinon en libre ; tracker arrêté : 🧭 grisé, son toucher l'explique ; arrêté en route : retour en libre.
- **Déplacement** (mode libre) : au téléphone, **joystick** dans la moitié gauche (sous le pouce, vitesse selon
  l'écart, course au bord tenu 0,6 s) et glisser sur la moitié droite (tourner, lever les yeux) ; au PC ou avec
  l'option « Pavé classique », pavé ▲ ▼ ◀ ▶ ↶ ↷ maintenu ; clavier (flèches, ZQSD / WASD, A/E en pas de côté)
  partout ; tout geste de déplacement passe en libre. **2,8 m/s** (le double du prototype : on explore, on ne
  marche pas) ; **pas rapide × 2,5** avec Maj maintenue ou ▲ gardé appuyé plus de 0,6 s ; 90 °/s.
- **Collisions** : chaque déplacement libre passe la règle du pas du tracker, exposée par `tracking.js`
  (`ktaEstAccessible` puis `ktaPasBloqueParStructure`, sans copie), appliquée à un **corps de 0,8 m** : trois
  segments parallèles (axe et ± 0,4 m) balaient tout le pas, prolongés de 0,4 m devant, puis douze rayons de
  0,4 m autour de l'arrivée doivent rester libres (pas plus qu'au départ, pour ne pas rester collé si la vue
  s'ouvre contre un mur). Types perso compris (`avecPerso`, que le tracker ne passe pas). Si le pas est refusé,
  on essaie chaque axe seul (on glisse le long d'un mur).
- 🩸 **« On passe à travers un pilier »** (retour de KARMA sur le prototype) : deux causes, reproduites par le
  checkup avant correction. 1) Les **types de structure personnalisés** sont dessinés en volume mais la règle du
  pas les ignore (décision produit pour le tracker) : on les traversait sous tous les angles. 2) Le corps était
  un **point** avec une marge seulement dans le sens de la marche : en biais ou en glissant, on frôlait une face
  à 4 cm ; la caméra (plan proche à 5 cm) entrait alors dans le pilier et l'on voyait au travers. Aucun pas ne
  traversait un pilier intégré : le segment était bien testé en entier.
- **Rendus 🏛️🛣️ Mixte / 🏛️ Structures / 🛣️ Galerie** (question A, revue au QCM du 02/11/2026) : interrupteur à
  trois états, bouton en haut avec le mode écrit en clair (un toucher passe au suivant), retenu par plan ; sans
  choix, **mixte**. En mixte, structures partout et tubes seulement loin d'elles (modèle de scène) ; en structures,
  aucun tube ; en galerie, les tracés deviennent des tubes et les structures disparaissent (ni dessinées ni
  bloquantes).
- **Dangers et favoris** : un POI danger a un liseré rouge et un halo rouge au sol, visible de près ; un favori, une ⭐
  au coin de son panneau.
- **Équipe** (installation reliée seulement) : membres qui partagent leur position (silhouette à leur couleur et nom,
  au niveau affiché), repères et itinéraires publiés, lus dans ce que la carte affiche déjà (`KtaPresences`).
- **Niveau** : celui du tracker en suivi actif, sinon celui pris par un passage 🪜, sinon le niveau actif du
  sélecteur ; lu à chaque image ; quand il change, la scène est refaite derrière un fondu noir, puis « Niveau n » 2 s.
- **Passages** : chaque POI jonction, puits de surface ou aération montre son volume (cage d'escalier, puits à
  échelons, puits nu, tube à grille), ouvert dans le sol ou le plafond selon le sens ; un tracé jonction, une rampe.
- **Passage de niveau 🪜** (question B) : à moins de 2 m d'un POI jonction ou d'un bout de tracé `jonction`,
  « ▼ -1 · nom (moyen) » vers le niveau lié voisin (une liste au-delà d'un de chaque côté) ; la fiche du POI propose
  aussi ses niveaux, d'où que l'on soit. La caméra s'enfonce ou monte dans le volume (~1 s), fondu noir à mi-course.
  Arrivée au raccord validé du niveau, sinon au bout opposé du tracé jonction, sinon au point, ramenée dans le tube si
  elle tombe à côté ; cap vers la prochaine consigne de l'itinéraire, sinon le long de la galerie. Le tracker et le
  niveau de la carte ne bougent pas pendant la 3D.
- **Sortie** (demande de KARMA du 01/11/2026) : la carte 2D se place là où l'on était en 3D (niveau de la 3D, centre
  sur la position, sans animation), quelle que soit la réponse à « Je suis ici ? », qui recale aussi le niveau.
- **Filtres** (QCM du 02/11/2026) : ceux de la carte ; ≡ ouvre le même panneau par-dessus la vue ; masquer ne retire
  que le dessin (collisions, parois, 🪜 restent), l'itinéraire n'en suit aucun.
- **Rangée du haut** : ✕, ≡ (collé à ✕), 🚨 Sortie d'urgence, ❓ aide, ⚙️ (tuile : suivi / libre, 🦅, ⛏️ hauteur,
  rendu, boussole) ; pastille 🧭 / 🕹️ du mode en haut à gauche ; Échap
  ferme d'abord un réglage, une fiche ou une fenêtre ouverts ; focus dans la vue, rendu au bouton à la fermeture.
- **Guidage** (QCM du 02/11/2026) : l'itinéraire en ruban plein bordé de sombre, chevrons de sens (étapes : mât ; arrivée : 🏁), au niveau de
  chacun de ses points, redessiné dès qu'il
  change (tracé depuis 🚨 pendant la vue compris) ; bandeau compact sous la rangée du haut (consigne réelle en suivi,
  aperçu marqué en libre) ; chevrons dorés au sol vers la prochaine consigne.
- **Fiche d'un POI** : toucher son panneau ouvre sa fiche de la carte (Je suis ici, Y aller, Itinéraire, favori,
  photos, liaisons ; ▼ Descendre / ▲ Monter pour un POI jonction) ; « Y aller » part de la position 3D en libre, du tracker en suivi ; tracker arrêté, « D'où
  pars-tu ? » propose d'abord « Ici ».
- **Outils de mesure** : `etat()` (tuiles, triangles, appels, contexte vivant, bandeau, chevrons, fiche…),
  `mesurer({ images })`, `placer(x, y, cap)`, `origineItineraire()`.

## Choix et pourquoi

| Choix | Pourquoi |
|---|---|
| **three.js 0.186.1**, `three.module.js` + `three.core.js` tels que dans le paquet npm | Dernière version publiée depuis plus de deux semaines. Depuis la 0.18x le paquet ne livre plus de `.min.js` ni d'UMD : seul le module ES existe (2,1 Mo bruts, ~420 Ko compressés). On ne minifie pas soi-même (règle des librairies : fichier du paquet officiel, `lib/VERSIONS.md`). |
| `import()` dynamique depuis un **script classique** | La CSP `script-src 'self'` accepte un module servi par l'app ; une *import map* serait un script en ligne, refusé. Le module est importé par URL absolue, une seule fois, à la première ouverture. |
| **Pas de `BufferGeometryUtils`** (ni d'autre `examples/jsm`) | Ces fichiers importent `"three"` par son nom nu : ils exigent une import map. La fusion est faite à la main : chaque tuile écrit directement ses tableaux de sommets, ce qui revient au même que `mergeGeometries` sans passer par une géométrie par objet. |
| **Tuiles de 16 m** fusionnées (1 à 3 maillages par tuile) | Construire tout le plan d'un coup coûte 0,35 s au PC, 1,8 s processeur ralenti x4, et un tas JS de 180 à 280 Mo pendant la construction (mesures ci-dessous) : trop pour iOS. Les tuiles à portée sont construites à l'ouverture, puis au plus 3 par image en marchant ; au-delà de la distance de vue + 32 m elles sont libérées. |
| **Pas d'instancing** | Les piliers relevés à la main n'ont pas deux formes identiques : l'instancing ne sert qu'à des objets répétés (il resterait utile pour des POI en 3D, pas pour les structures). |
| **Portée 30 m par défaut**, réglable de 15 à 100 m (QCM du 03/11/2026) ; brouillard noir de 45 % à 100 % de la portée, caméra coupée 5 m plus loin | C'est la lampe frontale du QCM : on ne voit pas plus loin sous terre, et ce qu'on ne voit pas n'est ni construit ni dessiné. Au-delà de 30 m, un choix de l'utilisateur, mesuré jusqu'à 100 m (ci-dessous). |
| **Rendu seulement quand quelque chose bouge** | Immobile, la vue ne dessine plus rien (aucune image par seconde). C'est le premier levier batterie : en suivi, le tracker ne bouge qu'à chaque pas. |
| Densité de pixels **plafonnée à 2** (`densiteMax`) | Un iPhone est à 3 : passer de 2 à 3 multiplie le remplissage par 2,25 sans gain visible dans le noir. Anticrénelage seulement sous une densité de 2. |
| Normales en `int8`, couleurs en `uint8` | 18 octets par sommet au lieu de 36 : moitié moins de mémoire GPU. |
| Le **tracker n'est pas déplacé** par la vue 3D ; « Je suis ici ? » à la fermeture | Question 1 c : se recaler à l'œil sans fausser la timeline en route. Seuil : 0,5 m d'écart, suivi actif. |
| **Calques masqués compris** | Comme la règle du pas : on bute contre un pilier masqué, il doit donc être visible. |

## Modèle de scène

- **Repère** : mètres. `x` 3D = x image / `APP_CONFIG.scale`, `z` 3D = y image / scale (le haut de l'image est
  devant quand le cap vaut 0), `y` = hauteur. Pas de `convertCoord` ici : la 3D lit les coordonnées plan
  directement ; `convertCoord` reste la règle côté Leaflet.
- **Hauteur** : celle du niveau affiché (`getNiveauVertical(niveau).hauteurM`, réglée dans ⚙️ › 📉 Niveaux,
  ⛏️ Volume exploité ou la 3D), 2 m par défaut.
- **Piliers (1re et 2e masse), murs polygones, types perso fermés** : prismes du sol à la hauteur, dessus
  triangulé (`THREE.ShapeUtils`, contours concaves compris), faces orientées vers l'extérieur.
- **Murs en ligne** : épaisseur 0,4 m ; **fronts de taille** : 0,3 m. Un pavé par segment, prolongé d'une
  demi-épaisseur aux deux bouts pour fermer les angles.
- **Un mur est toujours sous un pilier ou un front de son niveau** (règle de KARMA) : un mur (polygone ou
  `mur-ligne`) monte à **98 %** de la hauteur (4 cm sous un plafond de 2 m) et son matériau est reculé en
  profondeur (`polygonOffset` 1 / 1). Là où il chevauche un pilier ou un front, c'est le pilier ou le front qui se
  voit : pas de scintillement sur les faces confondues, dessus du pilier visible. Vérifié par le checkup (un mur
  qui traverse le pilier posé devant le départ est plus bas que lui).
- **Zones** : remblais et effondrement = volumes à 60 % de la hauteur (l'effondrement était un aplat au sol ;
  révisé, retour de KARMA : c'est un obstacle aussi, en 3D seulement) ; eau = surface translucide à 4 cm ;
  inaccessible = aplat au sol + rideau translucide sur son contour, rouges à hachures à 45° comme sur la carte
  (`_hachurer`, une bande sombre tous les 0,6 m, en coordonnées monde) ; types perso = aplat au sol. Remblais,
  effondrement et inaccessible arrêtent le pas dans les trois rendus, en tube comme en chambre (décision de KARMA ;
  l'inaccessible par la seule constante `galerieEmprise.js > INACCESSIBLE_BOUCHE`), en 3D seulement.
- **Tracés** : rubans de 0,25 m à 3 cm du sol ; **itinéraire** : ruban plein de 0,3 m à `--kta-interaction` sur un liseré
  `--kta-fond` de 4 cm de chaque côté, chevrons de sens `--kta-fond` tous les 2 m, à 5 cm du sol, non éclairés et sans
  compression de tons (lisibles hors du faisceau, le brouillard les éteint au loin) ; disque et mât de 0,6 m à chaque
  étape, panneau 🏁 à l'arrivée. **Ronds d'intersection** (option de la carte) : disques de 0,35 m de rayon à 4 cm,
  la liste de la carte (`getRoadIntersections`), niveau affiché.
- **POI** : panneau toujours face à soi (icône du catalogue `getIconUrlForPoint` + nom), au-dessus des yeux,
  **jamais caché par la géométrie** (décision de KARMA : sprite sans test de profondeur, dessiné après tout le
  reste), seulement dans la distance de vue, de plus en plus petit (jusqu'à moitié) et pâle (jusqu'à 40 %) vers
  30 m. Un POI relevé **dans un pilier** (ou un mur, un volume perso) est dessiné contre la face de ce volume la plus
  proche de la caméra, 8 cm devant, pour ne pas sembler flotter dans la roche. Vérifié au checkup (POI au centre
  du pilier posé devant le départ).
- **Matériaux** : couleurs du canon, `ktaResolveStyle(cat, clé, { flat: true })` (remplissage pour les zones,
  trait pour les tracés) ou `ktaSwatchColor` : la couleur choisie par l'utilisateur dans la légende et les types
  `cust-…` suivent sans table locale. Lambert à couleurs par sommet.
- **Sol et ciel de carrière** (le plafond, à la hauteur du plan) : même teinte **sable calcaire**,
  `COULEUR_CALCAIRE = "#c9b48c"` dans `js/vue3d.js` (couleur de la scène, pas de la charte de l'UI). Motif
  procédural de 128 × 128 px dessiné dans un canvas à l'ouverture (taches douces d'un bruit 8 × 8 interpolé et
  bouclé sur les bords, plus un grain fin), répété tous les 2 m et décalé avec la position pour rester fixe sous
  les pieds ; aucune image téléchargée, 64 Ko de texture.
- **Rendu galerie** (`js/galerieEmprise.js` + `vue3d.js > _construireTuileGalerie`) :
  - **Graphe** : tracés du niveau, sommets confondus à 15 cm, croisements coupés, bout libre raccordé au tracé voisin
    s'il s'arrête à moins de 0,5 m de sa paroi. Le graphe de `roadGraph.js` n'est pas réutilisé (graphe d'itinéraire :
    croisements en arêtes virtuelles, tronçons non coupés, tronçon retiré s'il croise un mur en ligne, types perso
    exclus) ; ce graphe-ci vit dans un module chargé au démarrage pour que la règle du pas puisse le reprendre.
  - **Largeurs** : principal 2,5 m, secondaire 2 m, chemin 1,7 m, type perso 2 m ; hauteur du plan.
  - **Pièces** : un rectangle par tronçon, d'un nœud à l'autre ; à chaque nœud de degré ≥ 2, un joint en triangles :
    coude en onglet (pointe bornée à deux demi-largeurs, biseau au-delà), dalle de carrefour (degré ≥ 3) dont les
    coupes reculent jusqu'au croisement des parois voisines (4 m au plus) et dont les parois relient les coins. Un bout
    libre est fermé par le bord du rectangle.
  - **Parois** = bords de l'**union** des pièces (un morceau de bord dont le point juste à l'extérieur n'est dans
    aucune autre pièce) : tubes coupés au bord des dalles, aucune paroi qui en traverse une autre, tracés presque
    parallèles fondus en une galerie. Sol et plafond = les pièces, superposées sans couture (texture en coordonnées
    monde).
  - **Matériaux** : parois en moellons de calcaire taillés, à la manière des galeries consolidées des carrières (blocs
    de 40 × 25 cm, assises horizontales à joints décalés, teinte par bloc, mortier plus sombre ou plus clair, grain ;
    motif de 1,6 × 1 m répété en mètres, canvas), sol et plafond au grain calcaire (la paroi, plus claire et plus
    grise, s'en détache), liseré au sol de 15 cm à la couleur de la légende. Révisé depuis (retour de KARMA) : 🧱
    Textures activé, les parois passent en pierre de taille (assises appareillées, joints irréguliers, relief) ;
    les moellons restent le rendu 🧱 coupé (`tracking.md` § Scène galerie). **Révisé le 04/11/2026** (décision de
    KARMA) : 🧱 coupé, parois des galeries et des tubes à la couleur de légende de leur type de tracé (canon, types
    perso compris ; carrefour : l'arête la plus large), sol et plafond noirs dans les trois rendus ; les moellons ne restent qu'aux puits et
    tranchées des passages.
  - **Zones** découpées à chaque pièce (CPU, par tuile) : eau à 4 cm ; remblais et effondrement à 60 %, faces
    seulement côté galerie, bloquants ; inaccessible au sol + rideau rouge hachuré en travers du tube là où le
    contour coupe l'axe ; perso au sol. **POI** à moins de 10 m de l'axe (relevé à 10 m le 02/11 : les salles sont souvent loin d'un tracé), ramenés contre la paroi, sinon masqués.
  - **Collision** : `KtaGalerie.segmentsBloques` (même forme que la règle des structures) : rester dans l'emprise,
    plus `KtaGalerie.zonesBloquent` (remblais, effondrement, inaccessible, dans tous les rendus) ; même corps balayé.
- **Rendu mixte** (défaut ; `KtaGalerie.modele(niveau, true)` + `vue3d.js > _construireTuile`) : structures comme en
  rendu structures (sol et plafond d'un seul tenant, tracés en rubans au sol), plus les **tubes des galeries de
  liaison**. **Chaque côté est jugé à part** (QCM du 02/11/2026, `galerieEmprise.js > _cotesOuverts`) : à chaque
  échantillon de l'axe (tous les 0,5 m), un point est posé à w + 0,5 m de l'axe de chaque côté (w = demi-largeur) ;
  une structure de son niveau (intégrée ou perso, filtres ignorés) à moins de `SEUIL_CHAMBRE_M` − w de ce point ouvre
  **ce côté** (sa paroi n'est pas dessinée, la paroi d'en face reste) ; les deux côtés ouverts (ou une structure en
  travers, qui ouvre les deux) = **chambre** (sans parois), coupe au seuil exact par dichotomie. Un côté ouvert
  commence et finit là où un **pan de retour** perpendiculaire, parti du bord du tube, touche la structure à 1,5 m au
  plus (`_cotesDuTube`, bout avancé par pas de 10 cm ; aucun pan ne touche : le côté reste fermé) : le pan, coupé à la
  face (premier bord croisé, ceux de la règle du pas), relie la paroi gardée à la structure, sans fente ; il est
  dessiné et bloquant comme une paroi. Aux nœuds, le bord du joint entre deux branches s'ouvre si l'une d'elles a ce
  côté ouvert. **Pourquoi 3 m** : la paroi d'un tube principal est à 1,25 m de l'axe ; une structure plus proche que 3 m
  laisserait entre elle et la paroi moins de 1,75 m (la largeur d'un chemin), une lame de roche doublée qui ne
  ressemble à rien : la structure borde alors la galerie elle-même (front, mur de consolidation, pilier de chambre).
  À 2 m, une chambre traversée en son milieu entre deux rangées de piliers (5 à 7 m) gardait des bouts de tube ; à
  4-5 m, une galerie qui longe un pilier isolé perdait ses parois sans rien d'autre à dessiner. Autour d'un nœud en
  chambre, les tubes s'arrêtent à la plus grande demi-largeur + 0,5 m et aucun joint n'est construit ; un tube de
  moins de 3 m entre deux chambres est ouvert (pas de paroi orpheline entre deux piliers). Le bout d'un tube qui
  débouche dans une chambre est **ouvert**. Les parois (moellons) sont celles du modèle (`paroisDe`), la collision
  aussi (`KtaGalerie.paroisBloquent` : on bute contre une paroi dessinée, jamais dans une chambre où seules les
  structures arrêtent). Zones : découpées aux tubes si elles touchent un tube loin de toute structure, entières
  sinon ; POI : ramenés contre la paroi si l'axe le plus proche (10 m au plus) passe en tube, sinon règle des
  structures.
- **Volumes des passages** (`_volumesDuNiveau`, `_construireVolume`) : au panneau du POI (raccord validé du niveau,
  sinon le point), orientés le long de l'axe de galerie le plus proche. Parois en moellons (`_paroiY`), 6 m sous le
  sol ou au-dessus du plafond ; **bouches** au gabarit (stencil : 1 = sol, 2 = plafond) dessinées avant tout, sans
  couleur ni profondeur : sol et plafond ne se dessinent pas dans la bouche, on voit dans le puits (contexte créé avec
  `stencil: true`). Escalier : 10 marches pleines sur 2,5 m, (hauteur + 0,4 m) en tout ; échelle : échelons de 40 cm
  tous les 0,3 m, deux montants ; aération : barreaux croisés tous les 15 cm, 25 cm au-dessus du plafond ; ciel :
  sprite clair non éclairé, sans brouillard, au sommet ; cadre doré de 8 cm à 12 cm de la bouche. Rampe : ruban de
  1 m, incliné du sol au plafond (vers le haut) ou du sol à −hauteur dans une tranchée ouverte (vers le bas).
  Construits à portée (`_gererVolumes`, règle des tuiles), libérés au loin ; aucune collision. **Aucune paroi de tube
  dans un volume** : l'emprise d'un passage (bouche et cadre, tranchée d'une rampe) qui chevauche un tube est une pièce
  du modèle de galerie (`galerieEmprise.js > _emprisesPassages`) ; parois coupées à son bord, le tube s'ouvre sur une
  niche autour de la bouche, comme il s'ouvre sur une chambre. Rubans des tracés coupés à la bouche (gabarit du sol).
- **Halo des dangers** : anneau de 0,45 à 0,7 m et disque pâle au sol, rouge `--kta-erreur` du thème sombre, non
  éclairé et sans compression de tons (ACES le délavait en saumon) ; liseré du panneau rouge, plus épais.
- **Équipe** (`_majEquipe`) : silhouette de 1,7 m au plus (85 % de la hauteur), corps et tête, couleur de la
  personne ; pseudo au-dessus sur une carte coupée à la largeur du texte ; repère en carte « symbole titre » ;
  itinéraire publié en tirets jaunes au sol. Refait quand `KtaPresences.version()` change.
- **Lumière** : projecteur (cône de 35°, pénombre 0,55, intensité 24, décroissance 1,2, portée = distance de vue)
  porté par la tête, petite lumière de proximité (4,5 m), ambiance presque nulle en vue à hauteur d'yeux ;
  brouillard noir de 13,5 à 30 m (rien n'est construit ni dessiné au-delà) ; tons compressés (ACES) pour qu'une
  face dorée éclairée de près ne sature pas.

## Chargement et hors ligne (`sw.js`)

- La **page** ne demande rien de la 3D avant le toucher du bouton cube : `interface.js > _chargerVue3D` pose alors
  `js/vue3d.js`, qui charge sa feuille et importe three.js. `smoke.js` refuse toute requête de la page vers
  `lib/three/`, `js/vue3d.js` ou `css/vue3d.css` pendant son parcours (il bloque le service worker : ce qu'il
  compte, ce sont les requêtes de la page).
- Le **service worker** précache les quatre fichiers (`js/vue3d.js`, `css/vue3d.css`, `lib/three/three.module.js`,
  `lib/three/three.core.js`) dans `ASSETS_TO_CACHE`, comme `bienvenue.js` (question 2 a) : +2,1 Mo bruts, ~420 Ko
  transférés (compression du serveur) à chaque installation ou mise à jour. La 3D est donc disponible sous terre
  même si l'utilisateur ne l'a jamais ouverte en ligne. Aucun appel réseau nouveau ni domaine nouveau : des
  fichiers du site, précachés avec les autres (`NETWORK_AUDIT_HISTORIQUE.md`, note v2.22.0).

## Mesures

Plan dense **synthétique** (fictif, généré en mémoire par `checkup-vue-3d.js`, `KTA_V3D_PERF=1`) : 9 000 piliers
de 6 à 12 sommets, 3 000 murs polygones, 1 000 murs en ligne, 700 fronts, 108 zones, 520 POI, sur une maille de
7 m (≈ 800 m × 800 m, 2 465 tuiles). Temps par image = rendu + attente de la fin du travail du GPU (lecture d'un
pixel), sur un tour complet sur place, après un tour de chauffe non compté (compilation des shaders, envoi au
GPU).

Chiffres de la première livraison (murs dans leur propre maillage, sol et plafond texturés, lampe renforcée, corps balayé),
deux passages par configuration ; entre parenthèses, le prototype.

**PC** — Edge 156 sans écran, GPU réel (RTX 5070, D3D11), fenêtre 1200 × 800 :

| Distance de vue | Ouverture | Tuiles construites | Triangles dessinés | Appels | ms / image (médiane · p95) | Tas JS |
|---|---|---|---|---|---|---|
| 20 m | 76 à 79 ms | 10 | 1 467 | 15 (11) | 0,6 à 0,7 · 1,0 à 1,1 | 67 à 68 Mo |
| **30 m** | **45 à 47 ms** (29) | **18** | **1 857** | **23 (16)** | **0,6 à 0,7 · 1,3 à 1,6** (0,5 · 0,7) | **71 à 72 Mo** |
| 50 m | 48 à 51 ms | 43 | 3 422 | 37 (26) | 0,6 à 0,7 · 1,5 | 76 à 79 Mo |
| 30 m, sans tuiles (tout le plan fusionné) | 365 à 422 ms | 1 | 389 396 | 10 | 2,5 à 3,5 · 3,2 à 4,2 | 274 à 284 Mo |

Marche de 120 m en ligne droite (0,2 m par image, tuiles construites en route) : aucune image au-delà de 33 ms
(la plus longue : 12 à 24 ms ; un passage isolé à 42 et 54 ms lors d'essais intermédiaires, non reproduit).
Rotation continue : 166 images/s (limite de l'affichage). **Pas balayé** (corps de 0,8 m, 3 couloirs + 12 rayons
en un lot) : 0,2 ms (médiane) · 0,4 ms (p95) par pas ; quinze appels séparés coûtaient 3,5 ms.

**Émulation iPhone** — même navigateur et même GPU, fenêtre 393 × 852 à densité 3 (rendu plafonné à 2),
processeur ralenti x4 :

| Distance de vue | Ouverture | Triangles | Appels | ms / image (médiane · p95) | 1er tour (chauffe) |
|---|---|---|---|---|---|
| 20 m | 279 à 331 ms | 1 285 | 11 (9) | 2,0 à 2,6 · 5,2 à 5,5 | 364 à 369 ms |
| **30 m** | **145 à 215 ms** (123) | **1 484** | **16 (12)** | **1,6 à 2,3 · 4,5 à 5,2** (1,0 · 3,9) | **142 à 171 ms** |
| 50 m | 148 à 209 ms | 2 372 | 23 (16) | 2,2 à 2,3 · 4,3 à 4,4 | 147 à 174 ms |
| 30 m, sans tuiles | 2 372 à 2 383 ms | 389 392 | 8 | 7,0 à 7,1 · 10,5 à 11,1 | 302 à 330 ms |

Marche de 120 m : aucune image au-delà de 33 ms (la plus longue : 18 à 24 ms). Budget de 30 images/s = 33 ms.
Pas balayé : 0,8 ms (médiane) · 1,7 ms (p95) ; quinze appels séparés coûtaient 21 ms, d'où le lot. Rotation
continue mesurée à 53 à 60 images/s sous ralentissement x4 (74 lors d'un passage antérieur : chiffre instable
sous émulation). Cette livraison coûtait environ un tiers d'appels en plus (maillage des murs) et 0,1 à 1 ms par image ;
le budget reste large.

**WebKit de Playwright sous Windows** (moteur de Safari, pas Safari) : fonctionnel (checkup vert, « Apple GPU »
annoncé), rendu de 0 à 3 ms par image à la mesure, mais 8 à 9 images/s affichées en fenêtre de téléphone, 41
en fenêtre de PC, quelle que soit la densité : la présentation à l'écran de ce portage est en cause, une page
vide y tourne à 63 images/s. Chiffre non représentatif d'un iPhone.

### Portée réglable et vue plongeante dézoomée (QCM du 03/11/2026)

Même plan dense, mêmes mesures (`KTA_V3D_PERF=1`, Chromium sans écran, RTX 5070), deux passages par configuration ;
« plongée 60 m » = vue plongeante au recul maximal (rayon de scène 138 m, `tracking.md` § Vue 3D › Vue plongeante).

| Configuration | Tuiles construites | Triangles · appels (PC) | ms / image PC (médiane · p95 · max) | Triangles · appels (iPhone) | ms / image iPhone émulé (médiane · p95 · max) |
|---|---|---|---|---|---|
| 30 m | 18 | 2 040 · 27 | 0,7 à 1,1 · 0,9 à 2,3 · 4,6 | 1 732 · 19 | 1,6 à 2,4 · 3,2 à 4,9 · 6,0 |
| 50 m | 43 | 4 219 · 58 | 1,0 à 1,1 · 1,6 à 1,7 · 2,6 | 2 822 · 31 | 3,0 à 3,8 · 6,4 à 7,2 · 9,4 |
| 75 m | 86 | 6 903 · 94 | 1,4 à 1,5 · 1,8 à 2,3 · 3,0 | 4 306 · 56 | 3,9 à 4,2 · 6,6 à 7,5 · 14,7 |
| **100 m** | **146** | **11 717 · 161** | **1,9 à 2,0 · 2,4 à 2,7 · 3,0** | **6 274 · 83** | **5,6 à 7,0 · 11,6 à 11,7 · 17,3** |
| plongée 60 m (portée 30 m) | 268 | 22 415 · 300 | 3,3 · 5,6 à 6,0 · 10,4 | 9 347 · 126 | 11,2 à 11,3 · 16,9 à 17,1 · 21,5 |

Ouverture à 100 m : 98 à 135 ms au PC, 516 à 534 ms en émulation (30 m : 73 à 84 · 350 à 402 ms). Marche de 120 m à
100 m de portée : au PC aucune image au-delà de 33 ms ; en émulation 2 images sur 597 à 33,4 ms (à 30 m, dans le même
passage, 1 à 2 images de 83 à 100 ms : déjà là avant ce réglage). Tas JS : la valeur de `performance.memory` est celle
de la page, arrondie par Chromium (78 à 93 Mo quelle que soit la portée) : non discriminante ici.

**Budget de 33 ms tenu** à 100 m et en plongée dézoomée, en émulation comme au PC, avec une marge d'au moins 11 ms
sur le pire cas. ⚠️ L'émulation ralentit le processeur, pas le GPU : le GPU est celui du PC. Le coût GPU croît avec les
triangles et les appels (×3,6 et ×4,4 de 30 à 100 m au téléphone, ×5,4 et ×6,6 en plongée 60 m) ; **un vrai iPhone
n'est pas mesuré** : c'est le chiffre à prendre avant de juger la borne de 100 m.

### Vue d'édition dézoomée à 150 m (rayon construit plafonné)

Le recul maximal de la vue d'édition passe de 60 à 150 m. Le rayon vu suit (2,3 m par mètre de recul : 345 m) ;
sans plafond, le rayon construit aussi. Mesures `KTA_V3D_PERF=zoom KTA_V3D_TEL=1` (plan dense, Chromium, iPhone
émulé, processeur × 4, portée 30 m, inclinaison 60°) : zoom de 18,4 m au recul voulu, temps jusqu'à toutes les tuiles
posées (3 par image), puis rendu posé sur un tour complet. ⚠️ Poste partagé avec d'autres lots pendant les mesures :
le temps d'une image varie d'un tiers d'un passage à l'autre, le p95 bien plus ; la médiane et les appels sont les
chiffres fiables.

| Recul · rayon construit | Tuiles montrées | Triangles · appels | ms / image (médiane · p95 · max) | Zoom : tuiles posées · images > 33 ms |
|---|---|---|---|---|
| 60 m · 138 m (borne d'avant) | 268 | 9 363 · 134 | 9,9 à 12,4 · 15,2 à 20,9 · 19,9 à 30,8 | 2,5 à 2,7 s · 18 à 23 sur 79 |
| 150 m · 345 m (sans plafond) | 1 526 | 39 029 · 583 | 50,2 · 75,2 · 89,3 | 28,9 s · 423 sur 498 |
| 150 m · 138 m | 268 | 25 685 · 356 | 28,1 · 37,6 · 44,3 | 3,1 s · 53 sur 79 |
| 150 m · 110 m | 171 | 22 815 · 321 | 20,0 · 31,3 · 41,6 | 1,5 s · 14 sur 46 |
| **150 m · 100 m (retenu)** | **146** | **21 473 à 21 573 · 302** | **21,4 à 26,6 · 33,6 à 57,1 · 43,7 à 91,6** | **1,4 à 1,7 s · 21 à 25 sur 38** |
| 150 m · 80 m | 94 | 16 505 · 228 | 16,4 à 19,4 · 25,1 à 46,3 · 37,8 à 99,7 | 0,85 s · 10 à 14 sur 21 |
| 100 m · 100 m | 146 | 14 803 à 14 935 · 213 | 14,4 à 17,0 · 22,2 à 42,0 · 32,7 à 84,9 | 1,2 à 1,4 s · 9 à 18 sur 38 |

Sans plafond, le budget de 33 ms est perdu (médiane 50 ms, 29 s de saccades). **Parade** : rayon construit plafonné
(`vue3d.js > RAYON_RECUL_MAX`, 100 m) ; au-delà, sol, plafond, plan au sol 🗺️ et brouillard suivent seuls le rayon vu
(`_rayonVue`) : le sol nu (ou le plan) sans structures. Vue de haut, tout le disque construit est à l'écran : le coût
suit le rayon construit, pas le recul (appels comptés par objet dans le champ de la caméra : ~2 maillages par tuile,
les panneaux sont une vingtaine). Médiane à 150 m sous le budget (21 à 27 ms) ; le p95 le frôle ou le dépasse sur un
poste chargé. 80 m est le repli si un vrai iPhone peine. Tas JS 87 à 111 Mo dans tous les cas (arrondi de Chromium,
non discriminant). Le plan au sol garde 1 024 px au doigt : à 150 m, 828 m de côté, ~0,8 m par pixel.

### Tout le plan (case 🛡️ « Limiter la portée » décochée, décision du 06/11/2026)

Ces bornes (portée 100 m, recul 150 m, rayon construit 100 m) sont la case 🛡️ de la tuile ⚙️, cochée par défaut.
Décochée : portée « Tout le plan » (diagonale de l'emprise), recul jusqu'à cette diagonale, rayon construit sans
plafond, **version brute** (tout en pleine définition, sans allègement du lointain). Mesures
`KTA_V3D_PERF=toutplan` (`KTA_V3D_SEUL=toutplan` pour elles seules), Chromium, GPU de bureau récent (RTX 5070) ;
plans FICTIFS en mémoire. Construction = de la décoche à la dernière tuile posée (3 par image, comme en vrai) ;
rendu posé = un tour complet (`mesurer`, 120 images, CPU + GPU) ; tas JS après ramasse-miettes (CDP).

| Plan · rendu | Construction · images > 33 ms | Yeux, tout le plan : ms médiane · p95 · appels | Édition au recul max : ms médiane · p95 · appels | Géométries · textures · tas JS |
|---|---|---|---|---|
| Relevé fictif · structures / mixte | 0,6 à 0,8 s · 1 à 3 | 1,2 · 1,7 à 2,1 · 66 à 116 | 1,8 à 2,4 · 2,8 à 3,2 · 129 à 226 | 94 à 191 · 31 · 12 à 13 Mo |
| 2 000 structures + 900 tracés sur 400 × 400 m (× 2 niveaux) · structures | 3,8 s · 3 | 6,9 · 8,8 · 688 | 18,9 · 28,0 · 2 303 | 1 530 · 159 · 54 Mo (44 limitée) |
| idem · mixte | 3,7 s · 1 | 8,6 · 11,6 · 882 | 22,2 · 30,5 · 2 950 | 2 177 · 161 · 85 Mo (71 limitée) |
| Plan dense (13 700 structures, 805 m de côté) · structures | 3,1 s · 1 | 12,6 · 16,0 · 864 | **40,7 · 54,7** · 2 803 | 144 · 525 · 59 Mo (53 limitée) |

Même chose en iPhone émulé (`KTA_V3D_TEL=1`, processeur × 4, GPU du PC) : plan de 2 000 structures, construction
6,6 à 12 s (61 à 185 images > 33 ms), yeux 24,7 à 32,1 ms (p95 37 à 44), **édition au recul max 134 à 158 ms** ;
plan dense : yeux 47 ms, édition 319 ms. Case cochée, rien ne change (1,7 à 3,2 ms par image). Ouverture directe
en « Tout le plan » (PC, tout construit d'un coup) : 0,05 à 0,23 s.

**Panneaux de POI dézoomés** (1 000 POI fictifs sur 320 × 320 m, sans structure ; `_majPanneaux`,
`_desencombrer`). Avant : tous montrés à lettres minimales (222 px), 183 000 à 196 000 paires de panneaux qui se
recouvrent au recul max, 9 000 à 18 500 à 150 m. Après : icône de 28 px, aucun recouvrement, 35 icônes gardées au
recul max (965 masquées), 100 à 260 à 150 m. iPhone émulé (processeur × 4) : édition au recul max 61 → 33 ms par
image (p95 82 → 48), à 150 m 32 → 19 ms (p95 45 → 29) ; dé-chevauchement de 1 000 panneaux 0,3 à 0,5 ms au PC,
6,5 ms au téléphone émulé (refait seulement quand la caméra bouge). PC : bloqué à la synchro d'écran (16,7 ms)
avant comme après. Checkup : `checkup-vue-3d.js` § 42.

**Conclusion.** Au PC, le plan lourd demandé reste sous le budget de 33 ms dans les deux vues (p95 de l'édition à
28 – 30 ms, au bord) et se construit en moins de 4 s sans saccade : **pas d'allègement du lointain (étape 2) pour
l'instant**. Le coût de la vue d'édition au recul max suit les **appels** (2 300 à 2 950 : chaque tuile a ses
maillages et tout est à l'écran), pas les triangles ; c'est là que portera l'étape 2 si elle devient nécessaire
(tuiles lointaines fusionnées ou simplifiées). Elle le deviendra si : un PC à GPU intégré dépasse 33 ms sur un plan
réel, ou le plan dense (805 m, 13 700 structures) doit tenir en édition (41 / 55 ms ici). Au téléphone, « Tout le
plan » est inutilisable sur un gros plan (134 à 319 ms par image en édition) : d'où la case recochée à chaque
ouverture et la question à la décoche. Non mesuré : mémoire GPU (illisible depuis la page), vrai téléphone, GPU
intégré.

### Mode galerie

Réseau **synthétique** (`KTA_V3D_PERF=galerie`) : 26 tracés est-ouest et 26 nord-sud tous les 12 m sur 300 m, un
sommet tous les 5 m un peu décalé, quatre types dont un perso : **3 120 tronçons**, 4 673 arêtes après coupe aux
croisements, 791 dalles, 3 084 coudes, 20 979 pièces ; 120 zones, 300 POI. Deux passages par configuration.

| | Modèle (graphe + pièces) | Ouverture | Triangles · appels (30 m) | ms / image 30 m (médiane · p95) | 50 m | Marche 120 m | Pas balayé |
|---|---|---|---|---|---|---|---|
| **PC** (Edge, RTX 5070) | 53 à 77 ms | 105 à 106 ms | 2 772 · 50 | 0,8 · 1,2 à 1,3 | 1,1 à 1,2 · 1,6 à 1,7 | aucune image > 33 ms (max 12 à 30 ms) | < 0,1 ms |
| **Émulation iPhone** (393 × 852, ×3, processeur ÷4) | 216 à 277 ms | 474 à 500 ms | 2 191 · 36 | 2,3 à 2,6 · 4,5 à 5,7 | 2,8 à 2,9 · 4,6 à 8,2 | 2 images sur 597 > 33 ms (36 à 42 ms) | 0,2 · 0,6 à 0,7 ms |

Rotation continue : 165 images/s au PC, 82 à 93 sous émulation. Le modèle de tout le niveau est construit à
l'ouverture (et à chaque changement de niveau ou de rendu) : c'est l'essentiel de l'ouverture sous émulation ; les
parois, elles, sont calculées par tuile. Les deux images lentes de la marche sous émulation tombent sur des
constructions de tuiles (3 par image au plus).

### Mode mixte

Le réseau ci-dessus posé sur le plan dense (`KTA_V3D_PERF=mixte`), piliers gardés sur la moitié est seulement : 8 296
structures, 4 673 arêtes dont 2 042 nœuds en chambre, 10 150 pièces de tube, 56 bouts ouverts ; départ à la limite
des deux moitiés. Poste partagé avec d'autres lots : chiffres bruités d'un passage à l'autre (fourchettes).

| | Modèle mixte | Ouverture | Triangles · appels (30 m) | ms / image 30 m (médiane · p95) | 50 m | Marche 120 m | Pas balayé |
|---|---|---|---|---|---|---|---|
| **PC** (Edge, RTX 5070) | 139 à 174 ms (galerie seule : 65 à 74) | 101 à 145 ms | 2 366 · 31 | 0,8 à 1,8 · 1,3 à 3,5 | 0,9 à 2,8 · 1,4 à 4,3 | aucune image > 33 ms | 0,1 à 0,3 ms |
| **Émulation iPhone** (393 × 852, ×3, processeur ÷4) | 366 ms (801 à 971 avant l'allègement de la grille) | 371 à 674 ms | 1 831 · 21 | 1,9 à 3,6 · 3,5 à 6,5 | 3,2 à 3,9 · 5,7 à 6,8 | 0 à 1 image sur 597 > 33 ms (36 ms) | 0,6 à 1,4 · 1,8 à 2,9 ms |

Rotation continue : 102 à 164 images/s au PC, 52 à 54 sous émulation. Le modèle mixte coûte environ deux fois le
modèle galerie : la recherche des structures à moins de 3 m de chaque échantillon d'axe (une arête loin de toute
structure n'est pas échantillonnée). Comme en galerie, il est construit à l'ouverture et à chaque changement de
niveau, de rendu ou de données : sous émulation, l'ouverture d'un tel plan est d'environ 0,4 + 0,4 s.

**Raccord par côté** (QCM du 02/11/2026, même semis, deux passages par configuration ; 11 604 pièces, 1 761 nœuds
en chambre, 844 bords ouverts) :

| | Modèle mixte | Ouverture | Triangles · appels (30 m) | ms / image 30 m (médiane · p95) | 50 m | Marche 120 m | Pas balayé |
|---|---|---|---|---|---|---|---|
| **PC** (Edge, RTX 5070) | 105 à 116 ms | 121 à 137 ms | 2 520 · 32 | 0,7 à 0,8 · 1,0 à 1,5 | 0,9 à 1,0 · 1,6 à 2,1 | aucune image > 33 ms | 0,1 à 0,2 ms |
| **Émulation iPhone** (393 × 852, ×3, processeur ÷4) | 467 à 506 ms | 573 à 654 ms | 1 923 · 23 | 1,8 à 2,0 · 3,5 à 4,8 | 3,4 · 6,9 | 1 image sur 597 > 33 ms (36 ms) | 0,8 · 2,0 ms |

Rotation continue : 165 images/s au PC, 62 à 65 sous émulation. Le jugement des côtés fait deux tests de proximité
de plus par échantillon proche d'une structure et lance un rayon tous les 10 cm aux bouts des côtés ouverts : sous
émulation, le modèle passe de 366 à environ 490 ms ; au PC il reste sous les 120 ms. 🩸 Avec la règle du pas
(`ktaSegmentsBloquesParStructure`) pour couper les pans de retour, il montait à 1,4 à 2 s sous émulation : chaque
appel relit la signature de toutes les structures ; les pans sont coupés par un rayon sur l'index du modèle.

### Passages entre niveaux

Plan dense synthétique ci-dessus (rendu structures, 30 m de vue), puis **10 passages** (tous les moyens, deux puits
de surface, deux aérations) et **2 tracés jonction** semés à 8 à 22 m du départ (`KTA_V3D_PERF=passages`) ; deux
passages par configuration. Poste partagé avec d'autres lots : chiffres bruités.

| | Volumes construits | Triangles des volumes | Triangles · appels (30 m) | Ouverture | ms / image (médiane · p95) |
|---|---|---|---|---|---|
| **PC** sans passages | 0 | 0 | 2 040 · 27 | 79 à 144 ms | 0,7 à 0,8 · 1,2 à 1,3 |
| **PC** avec passages | 12 | 1 950 | 2 852 · 45 | 67 à 154 ms | 0,9 à 1,2 · 1,7 à 1,8 |
| **Émulation iPhone** sans | 0 | 0 | 1 732 · 19 | 374 à 661 ms | 2,3 à 3,9 · 4,8 à 7,8 |
| **Émulation iPhone** avec | 12 | 1 950 | 2 240 · 30 | 359 à 446 ms | 2,7 à 2,9 · 5,6 à 6,8 |

Un volume coûte 160 triangles en moyenne et jusqu'à cinq appels (bouches, parois, marches ou échelons, cadre, ciel) :
pour 12 volumes, +0,2 à 0,5 ms par image, très loin du budget de 33 ms. **Passage animé** (fondu et descente, plan
dense) : image médiane de 6 ms, mais l'image de la **bascule** (scène du niveau d'arrivée refaite d'un coup) prend
140 ms au PC et 480 ms sous émulation ; elle tombe au noir complet, qui dure d'autant (le geste avance d'au plus
100 ms par image). 2 à 3 images de plus de 33 ms sur le geste. Si un vrai iPhone le rend gênant : construire les
tuiles du niveau d'arrivée sur plusieurs images pendant le noir.

### Données changées pendant la vue (scène refaite, QCM du 03/11/2026)

Décision : scène refaite **entière** (`_reindexer`) sur un signal unique `kta:donneesPlanChange` confirmé par une
empreinte des données, pas tuile par tuile (le modèle des galeries, qui domine le coût en mixte, est global au
niveau : refaire une tuile ne l'éviterait pas). Mesure (`KTA_V3D_PERF=1`, un pilier de session ajouté à 3 m, plan
dense synthétique, ms) :

| | PC | iPhone émulé (×4) |
|---|---|---|
| Structures, 13 700 objets : scène refaite | 46 – 57 | 236 – 300 |
| Mixte, 8 300 structures + 64 tracés : scène refaite (modèle des galeries compris) | 123 – 160 | 606 – 734 |
| Empreinte seule (signal sans changement) | 9 – 12 | 60 – 64 |

[Probable] Acceptable par clic (un objet ajouté, supprimé, une annulation) ; trop lent pour un dessin point par
point en 3D sur un plan dense en mixte (étape « dessiner depuis la 3D ») : il faudra alors un modèle des galeries
refait par morceaux. L'empreinte relue sur un rendu sans changement coûte ~60 ms au téléphone sur ce plan ; les
redessins dus au déplacement de la carte (moveend / zoomend sous la décimation PerfUltra) ne la déclenchent pas.

### Ce qui n'a **pas** été mesuré

- **Aucun vrai iPhone** : ni images/s réelles, ni mémoire, ni chauffe, ni batterie. L'émulation ralentit le
  processeur, pas le GPU (celui du PC, bien plus puissant) ; la puce graphique d'un iPhone récent n'est
  approchée que par le nombre de triangles et d'appels, très bas ici. [Probable] 30 images/s tenues ; à
  confirmer sur l'appareil (lot 3).
- **Aucun plan dense réel** : l'ouverture du plan de contexte a buté sur l'écran d'acceptation des conditions
  d'utilisation du site pro, qu'un agent n'accepte pas au nom de KARMA. Les mesures portent sur des formes
  synthétiques ; des piliers relevés à la main peuvent avoir bien plus de sommets (coût linéaire en sommets).
- La mémoire GPU n'est pas lisible depuis la page ; estimation : 18 octets par sommet, ~4 Mo à 30 m, ~21 Mo pour
  tout le plan fusionné.

### Ce qu'il faut couper (conclusion)

1. **Distance de vue : 30 m** suffit et coûte peu ; 50 m reste confortable. Au-delà, la lampe à 100 % ne montre
   presque rien (plus forte, dès 200 %, et Plein jour, si : QCM du 03/11/2026, portée réglable jusqu'à 100 m).
2. **Tuiles : indispensables**, pour l'ouverture (×15 plus rapide) et surtout le tas JS (×4 de moins). Pas pour
   le GPU : même tout le plan (390 000 triangles) passe en 2 à 7 ms ici.
3. **Fusion** : faite par tuile (un appel par matériau et par tuile, 12 à 26 appels en tout). Rien à gagner de
   plus.
4. **Instancing** : inutile pour les structures (formes toutes différentes).
5. Si un vrai iPhone peine : densité 1,5, puis 20 m de vue, puis suppression du dessus des prismes en vue à
   hauteur d'yeux (un tiers des triangles d'un pilier).

## Risques

| Risque | Ce qui le borne | Reste à faire |
|---|---|---|
| **Mémoire iOS** (Safari tue l'onglet sans prévenir au-delà de ~1 à 1,5 Go) | Tuiles autour de soi, libérées au loin ; géométrie compacte ; 64 à 80 Mo de tas pour toute la page pendant la 3D en émulation | Mesurer sur un iPhone avec un plan réel (Instruments ou le relevé mémoire de l'app) |
| **Perte du contexte WebGL** (mémoire graphique, onglet longtemps en fond) | `webglcontextlost` : la vue attend `webglcontextrestored` 8 s d'écran visible, remonte sa scène à neuf (jamais `dispose()` sur les objets d'avant la perte), sinon se ferme avec un toast (question 7 c). Simulée par le checkup (`WEBGL_lose_context`) | Perte réelle sur un iPhone : non observée |
| **Contextes WebGL en trop** | Chaque fermeture appelle `forceContextLoss` ; Chromium rend la place aussitôt. WebKit ne la rend qu'au ramasse-miettes : après ~16 ouvertures rapprochées il annonce « too many active WebGL contexts » et perd le plus ancien, **déjà fermé** (sans effet ; toléré par le checkup sous WebKit seulement) | Si l'app utilisait un autre contexte WebGL un jour, garder un seul contexte pour la session (question 7) |
| **Batterie** | Rendu seulement quand on bouge (bruit de la boussole sous 2° ignoré en suivi) ; pas d'ombres ; GPU de bureau mesuré à < 1 ms par image | Mesure réelle de décharge sur une sortie ; couper la vue quand l'écran se verrouille (la boucle s'arrête déjà avec l'onglet caché) |
| **Fausse précision** : la 3D a l'air exacte, la position du tracker ne l'est pas (dérive PDR) | Lissage ; mode libre + « Je suis ici ? » pour se recaler à l'œil ; titre du bouton, Aide et guides : « la 3D montre le plan, pas la galerie réelle » | Retour terrain |
| Plan sans échelle ou sans structures | Sans échelle : bouton grisé et ouverture refusée avec un message | Plan sans structures : la vue montre sol, plafond, tracés et points |

## Dessiner depuis la 3D, étape E3 (QCM du 03 et du 04/11/2026)

| Sujet | Décision |
|---|---|
| Où | Vue plongeante 🦅 seulement ; ✏️ fait apparaître la barre, rien ne se dessine sans outil armé (règle de la 2D : retoucher l'outil l'éteint) ; à hauteur d'yeux, pas d'édition |
| Outils | Toutes les structures (types perso compris), zones, tracés, 📐 mesure ; POI (✏️ ajout de point, décision du 04/11/2026 : toucher au sol, fenêtre de nommage de la carte par-dessus la vue) ; ni 🪜 jonction (deux niveaux, la 3D en montre un) ni 🧹 Effacer (« Sélectionner » et « Par zone » se jouent sur la carte) |
| Gestes | Ceux de la 2D, rejoués (`map.fire` au point touché) : undo, uid, fiches, styles, sous-menus, droits de la 2D ; caméra inchangée (seul un toucher bref pose) ; outil armé passe avant la fiche |
| Interface | La barre de droite 2D : mêmes boutons, même ordre (📐 ✏️ 🛣️ ⬛ 🏛️), mêmes panneaux |
| Niveau | Celui de la 3D ; la carte garde le sien |
| Coût | Aperçu au sol pendant l'objet, une reconstruction à sa fin ; tuiles loin de l'objet reprises |
| Fermeture au doigt | Choix du lot : rond doré de 0,3 m autour du 1er sommet, en mètres (24 px d'écran fermaient un mur de 0,4 m au 4e coin) ; zoomer agrandit la cible |
| Rendu galerie | Choix du lot : armer une structure passe en mixte (retenu), avec un toast — on voit ce qu'on dessine, sans réglage caché |
| Plan au sol | Livré (mémoire mesurée ci-dessous) : 🗺️ de la barre, coupé par défaut, niveau 0 seulement |
| Greffe | `fiches: false` coupe aussi le dessin (`addons.md`) |

### Mesures du dessin (`KTA_V3D_PERF=dessin KTA_V3D_TEL=1`, plan dense synthétique, Chromium, processeur × 4)

| Mesure | Structures | Mixte |
|---|---|---|
| Sommet posé (geste de la carte + aperçu, sans reconstruction) | 3 à 10 ms | 2 à 5 ms |
| Fermeture d'un pilier → scène refaite (visible) | 0,35 à 0,39 s | 0,41 à 0,53 s |
| Dont relecture des données (index, empreinte) | ~0,2 s + 0,06 à 0,08 s | ~0,3 s + 0,06 à 0,08 s |
| Plan au sol (1024 px) | 4 Mo de texture, dessin 4 à 7 ms, tas JS et images par seconde inchangés | idem |

La reprise des tuiles (32 sur 32 hors de l'objet) ne gagne que ~45 ms : le reste est la relecture des 13 700 objets
du plan (collecte, grille des volumes, index, empreinte), pas les tuiles. Non mesuré : un vrai iPhone ; un plan tuilé V2
(le relevé fictif n'en est pas un : le chemin V2 du plan au sol est celui de l'export, `ktaDessinerRegionTuiles`).

## Intégration à l'app (lots 1, 2 et cohérence, livrés)

1. **Entrée** : bouton cube de la barre de droite, sous ≡ Filtres (`interface.js > L.control.ktaVue3DControl`), qui
   charge `js/vue3d.js` à la demande comme `unlockGate.js` charge `bienvenue.js`, derrière `ComputeLoader`, puis
   appelle `KtaVue3D.ouvrir()`. Grisé sans plan chargé ou sans échelle ; WebGL absent : `vue3d.indisponible`.
2. **Textes** (`lang/fr.json`, `en.json`, `es.json`, appel au rendu) : clés `vue3d.*` et `ui.vue3d.title` ; section
   d'Aide `aide.sec.vue-3d.*`, ouverte aussi par le ❓ de la vue.
3. **Garde-fous** : `checkup-vue-3d.js` (Chromium et WebKit), joué depuis le bouton ; `smoke.js` (rien au
   démarrage) ; `check-i18n.js`, `check-aide-sections.js`, `check-aide-contextuelle.js` ; `check-libs.js` (three.js).
4. **Docs** : `docs/architecture/tracking.md` § Vue 3D, `docs/architecture/ui.md` § Vue 3D, guides
   `README_USER{,.en,.es}.md`, Aide intégrée, `AI_CONTEXT.md` (liste fermée de ce que montre la 3D), journal
   `README.md`, `NETWORK_AUDIT` (librairies ; note v2.22.0 de l'historique), `CLAUDE.md` (Où chercher). Pas de point
   du smoke manuel de la porte de release.

## Estimation

| Lot | Contenu | Taille |
|---|---|---|
| 1 | Entrée (d'abord tuile du menu Tracker, puis bouton de la barre de droite), chargement à la demande, textes fr/en/es, refus sans échelle, précache, reprise après perte de contexte, « Je suis ici ? », checkup | **S**, livré |
| 2 | Docs : guides 3 langues, Aide, AI_CONTEXT, tracking.md, journal | **S**, livré |
| 3 | Mesure sur un vrai iPhone et un plan dense réel ; réglages (distance, densité) d'après les chiffres | **M** |
| 4 | Multi-niveau par POI jonction et tracé `jonction` (question B), POI touchables (fiche), guidage de l'itinéraire en 3D | **M**, livré |
| 4 bis | Mode « galerie » : tracés en tubes, carrefours exacts, bascule exclusive structures / galerie, collisions contre les parois (question A) | **M**, livré |
| 4 ter | Mode mixte par défaut (trois états), halo des dangers, ⭐ des favoris, membres / repères / itinéraires d'une extension | **M**, livré |
| 4 quater | Passages entre niveaux : volumes par moyen, rampe, panneau ↕, fiche, fondu et descente, arrivée dans le tube, cap, guidage au passage | **M**, livré |
| 5 | Rendu plus « vrai » (texture de roche, ombres de la lampe, niveaux voisins en transparence) | **L**, à n'engager qu'après le retour terrain |

## Questions tranchées (QCM du 01/11/2026, toutes les recos prises)

| # | Sujet | Décision |
|---|---|---|
| 1 | Déplacer le tracker ? | **c** : non ; à la fermeture « 📍 Je suis ici ? » propose de le recaler là où l'on s'est arrêté (suivi actif et déplacement fait) |
| 2 | Hors ligne | **a** : précache des quatre fichiers |
| 3 | Épaisseurs | **a** : fixes (mur en ligne 0,4 m, front 0,3 m) |
| 4 | Remblais | **a** : volume à 60 % de la hauteur |
| 5 | Couleurs | **a** : celles de la légende |
| 6 | Calques masqués | Comme sur la carte (QCM du 02/11/2026, à la place de « montrés en 3D ») : un calque masqué ne se dessine pas, ses objets bloquent toujours |
| 7 | Contexte WebGL | **c** : libéré à chaque fermeture + reprise automatique après une perte, fermeture avec message si elle échoue |
| 8 | Distance de vue | **a** : 30 m fixes ; remplacé (QCM du 03/11/2026) par le réglage ⚙️ **Portée**, curseur de 15 à 100 m, 30 m par défaut, retenu sur l'appareil |
| 8 bis | Lampe (QCM du 03/11/2026, revu le même jour) | Réglages ⚙️ retenus sur l'appareil : **intensité** en curseur de 25 à 300 % (100 % = la lampe d'origine ; plus haut, plus loin : force, décroissance, coupure, halo et brouillard suivent ; l'ancienne Forte = 200 %), **faisceau** en curseur de 40 à 160° de cône (71° par défaut ; la pénombre grandit avec la largeur, un faisceau large se fond dans le noir), **☀️ Plein jour** en interrupteur (revu le 06/11/2026 : soleil rasant venu du nord-ouest du plan, ambiance baissée, relief lisible, brouillard clair qui pâlit le lointain, ni ombres ni occlusion ; lampe gardée à son réglage ; effectif aussi en vue d'édition, décoché = éclairage plat) ; multiplié au facteur lampe d'une greffe ; une greffe qui le demande (`reglagesFiges`, le jeu) fige portée à 30 m, 100 %, 71° et Plein jour coupé, réglages rendus au retrait |
| 8 quater | Cavage dans une galerie plus large que son tracé (retour terrain du 03/11/2026) | La porte garde la largeur du tracé ; de la pierre de taille comble, côté par côté, l'espace du cadre à la structure la plus proche (au plus 3 m), du sol au plafond, et bloque le pas comme la porte fermée, porte ouverte comprise (seule son ouverture laisse passer) ; rien en rendu galerie ; itinéraire 2D inchangé |
| 8 quinquies | Cône d'un puits comblé (bug du 04/11/2026 ; révise la règle du 02/11/2026 « le cône arrête ») | Le cône d'éboulis de `pc` / `psf` **laisse toujours un passage**, comme le bassin : dans un tube, poussé vers la paroi du côté du POI juste assez pour laisser un corps (0,8 m) et 0,1 m de jeu en face ; enfoncé dans sa paroi plutôt que réduit (il garde sa taille, la roche en cache une part), centre au plus sur la paroi, rayon réduit seulement au-delà (galerie de moins de 1,8 m). On bute toujours sur le cône, on passe à côté ; la bouche ne bouge pas. Chambre, Structures, sans axe à 10 m : inchangé ; itinéraire 2D inchangé ; ruban 3D toujours par-dessus le cône quand il y passe |
| 8 sexies | Formes des POI sans passage (décisions du 05/11/2026) | **Chatière** : roche brute en travers de la galerie la plus proche, percée au ras du sol d'un passage bas (environ 0,6 m de haut sur 0,9 m de large, roche au-dessus et sur les côtés, axe long le long de la galerie) ; ne bloque pas, la caméra s'abaisse en la traversant (suivi et libre) puis remonte ; longueur fixe (1,8 m, aucune donnée sur le POI). **Plaque indication** : plaque émaillée bleu et blanc à plat sur la paroi la plus proche, au nom du POI, sans panneau flottant (toucher la plaque = sa fiche), élargie au nom jusqu'à 1 m puis sur deux lignes, nom jamais coupé ; sans paroi de galerie (rendu Structures, salle), sur la face de structure la plus proche (pilier, mur, mur en ligne, front) à 3 m au plus, du côté du POI, sans panneau non plus (décision du 05/11/2026 ; la paroi de la galerie passe d'abord, rien ne change en rendu Galeries) ; rien à 3 m : le panneau reste. Épure et portail suivent la même règle. **Épure** : trait clair sur la paroi la plus proche, à hauteur d'yeux, sans texte. **Plaque** : le nom reste avec 🧱 coupé (c'est un repère). **Portail** : cadre de porte contre la paroi, lumineux à `--kta-interaction` s'il a une liaison, éteint sinon. **« Passer au plan X »** dans la fiche de **tout point lié** (portail ou non), avec la confirmation de la carte ; plan absent : inactif. **Véhicule** : voiture simplifiée (3,2 × 1,4 × 1,3 m, une citadine) dans la galerie la plus proche, le long d'elle, qui bloque à hauteur d'yeux comme un pilier. Entrée du plan, salle et électricité restent en panneau |
| 8 ter | Zoom de la vue plongeante (QCM du 03/11/2026) | Comme une carte : pincer, molette et + / − = zoom (recul de 6 à 150 m, 18,4 m par défaut ; d'abord 60 m) ; deux doigts glissés ensemble, Maj + molette et ▲ ▼ = inclinaison ; tuiles qui suivent le recul ; retenu tant que la vue est ouverte |
| — | Murs et piliers | Règle ajoutée : un mur est toujours sous un pilier ou un front de son niveau (modèle de scène) |
| A bis | Mode mixte (QCM du 02/11/2026) | L'interrupteur exclusif devient **trois états Mixte / Structures / Galerie**, mixte par défaut, retenu par plan ; en mixte, structures partout, tubes seulement à plus de 3 m d'une structure, bouts ouverts dans les chambres, collisions des deux règles, zones et POI selon le lieu (tube ou chambre) |
| A | Mode « galerie » (QCM du 01/11/2026) | Interrupteur **exclusif** structures / galerie, bouton 🏛️ / 🛣️ écrit en clair, retenu par plan, défaut d'après les structures du niveau ; **carrefours exacts** (option a : dalle, coupes, onglets bornés, coins reliés, bout fermé) ; largeurs principal 2,5 m, **secondaire 2 m, chemin 1,7 m**, perso 2 m (réglage par type plus tard) ; parois en **moellons de calcaire taillés** (assises à joints décalés), sol et plafond au grain calcaire, **liseré** au sol à la couleur de la légende ; collision contre les parois et les remblais (fonction exposée) ; zones découpées au tube (option a, CPU), rideau en travers pour l'inaccessible ; POI à moins de **3 m**, sinon masqués ; structures masquées et sans collision |
| B | Passer par un POI jonction (QCM du 01/11/2026) | Bouton 🪜 à moins de 2 m, **▲ / ▼** vers le niveau lié suivant, liste au-delà ; toucher le panneau = même chose ; arrivée au raccord validé ou à la même position, cap gardé (revu au QCM des passages : cap vers la consigne ou la galerie, toucher = fiche) ; tracé `jonction` **dans les deux sens** ; **le tracker ne bouge pas**, « Je suis ici ? » recale aussi le niveau ; en suivi, pas de 🪜 ; niveau de la carte 2D inchangé pendant la 3D |
| — | Sortie de la 3D (demande du 01/11/2026) | La carte 2D se place là où l'on était en 3D : niveau de la 3D, centre sur la position, quelle que soit la réponse à « Je suis ici ? » |

## Question ouverte

### Relevé fictif

9. **Relevé fictif** : il n'a aucune structure sur les niveaux 0 et 1 joués par le checkup (qui pose son propre
   pilier et son mur). a) y ajouter quelques piliers, murs et fronts fictifs (sur consigne de KARMA, `data/` n'est
   touché que par lui) · b) laisser. **Reco a** : démonstration et tests plus parlants. Non traitée.
