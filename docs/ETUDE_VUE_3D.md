# Étude — Vue 3D autour de sa position

> Étude de la vue 3D (`js/vue3d.js`), d'après les QCM de KARMA du 01/11/2026. Lots 1, 2 et 4 bis livrés, lot 4 en
> partie (passage de niveau par POI jonction) : la vue est en **bêta** dans le menu Tracker (tuile 🧊), avec deux
> rendus exclusifs (structures, galerie), précachée, textes fr/en/es, docs. Reste : la mesure sur un vrai iPhone
> (lot 3), le reste du lot 4 et la question 9. Contrats à jour : `docs/architecture/tracking.md` § Vue 3D.

## Le besoin

Sur un plan dense en piliers, murs et fronts de taille, la vue de dessus dit mal ce qu'on a devant soi. Depuis sa
position (tracker), l'utilisateur voit en 3D ce qui l'entoure et s'y déplace, depuis la tuile 🧊 du menu Tracker.

## Décisions de KARMA (QCM du 01/11/2026)

| # | Sujet | Décision |
|---|---|---|
| 1 | Livrable | Cette étude + un prototype jouable sur le relevé fictif ; puis (second QCM) bêta dans le menu Tracker |
| 2 | Caméra | Première personne à hauteur d'yeux depuis le tracker ; un bouton bascule en vue plongeante au-dessus de soi |
| 3 | Librairie | three.js embarqué dans `lib/`, chargé **à la demande** (rien au démarrage) |
| 4 | Contenu | Structures extrudées à la hauteur du plan (Volume exploité) ; sol, plafond ; zones ; POI en panneaux ; tracés et itinéraire au sol |
| 5 | Déplacement | Suit le tracker ; boutons à l'écran et clavier ; on bute contre piliers, murs, fronts avec la règle du pas du tracker |
| 6 | Lumière | Lampe frontale : noir autour, faisceau devant qui s'éteint au loin |
| 7 | Niveaux | Niveau actif seul ; un changement de niveau refait la scène |
| 8 | Performance | 30 images/s sur un iPhone récent, plan dense (~9 000 piliers, 4 000 murs, 700 fronts) |

## Ce que fait la vue

- **Entrée** : tuile **🧊 Vue 3D (bêta)** du menu Tracker, avec une ligne d'aide « Montre le plan, pas la galerie
  réelle » ; grisée (et son toucher dit pourquoi) sans plan ou sans échelle, sans rien charger.
- **Ouvrir** : `KtaVue3D.ouvrir({ distanceVue, tuiles, depart, densiteMax, stats, attenteReprise })` charge
  `css/vue3d.css` et three.js, monte une fenêtre plein écran (z-index des modales), part de la position et du cap
  du tracker (`getTrackingPosition`, `getPlanRelHeading`). Refus avec message sans échelle, sans WebGL, ou si
  three.js ne se charge pas. `fermer()` (✕ ou Échap) démonte tout, libère le contexte WebGL, puis pose
  « 📍 Je suis ici ? » si le suivi est actif et qu'on s'est déplacé (Oui = recalage du tracker).
- **Vues** : à hauteur d'yeux (1,6 m, ou 80 % de la hauteur si la galerie est basse) ; 🛰️ ou touche V = plongeante
  (caméra à 18,4 m du point visé 2 m devant soi, plafond masqué, silhouette dorée à sa place, éclairage
  d'ambiance relevé). **Inclinaison** de 15° (rasante) à 85° (presque verticale), 60° par défaut : deux doigts
  glissés à la verticale, molette, PageUp / PageDown, ou deux petits boutons ▲ ▼ montrés dans cette vue
  seulement ; retenue tant que la vue est ouverte.
- **Boussole** : rose des vents en bas à gauche (`icon/compass.svg`, celle de la boussole 2D). Son N pointe vers le
  nord réel selon la direction de la vue : rotation −(cap plan − `getPlanNorthOffset()`), la convention de
  `compass.js` et l'inverse de `tracking.js > _getPlanRelHeading`, sans autre calcul. Plan sans Nord calibré
  (`config.js > getPlanNorthCalibre`) : la rose montre le haut du plan, avec la mention « Haut du plan (nord non
  calibré) ».
- **Suivi / libre** : 📍 bascule entre **suivi** (la caméra suit la position du tracker et le cap de l'appareil,
  lissés, lus à la même source que le mode 2D « plan orienté » : `getPlanRelHeading`, offset Nord compris ; on
  tourne avec le téléphone, la vue tourne) et **libre** (boutons et clavier). Ouverture en suivi si le tracker
  tourne, sinon en libre ; tracker arrêté : 📍 grisé, son toucher l'explique ; arrêté en route : retour en libre.
- **Déplacement** (mode libre) : pavé ▲ ▼ ◀ ▶ ↶ ↷ maintenu, ou clavier (flèches, ZQSD / WASD, A/E en pas de
  côté), ou glisser sur la scène (tourner, lever les yeux) ; tout geste de déplacement passe en libre. **2,8 m/s** (le double du prototype : on explore, on ne
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
- **Rendus 🧱 Structures / 🚇 Galerie** (question A) : interrupteur exclusif, bouton en haut avec le mode écrit en
  clair, retenu par plan ; sans choix, structures si le niveau affiché en a, galerie sinon. En galerie, les tracés
  deviennent des tubes et les structures disparaissent (ni dessinées ni bloquantes).
- **Niveau** : celui du tracker en suivi actif, sinon celui pris par un passage 🪜, sinon le niveau actif du
  sélecteur ; lu à chaque image, la scène est refaite dès qu'il change.
- **Passage de niveau 🪜** (question B, mode libre) : à moins de 2 m d'un POI jonction ou d'un bout de tracé
  `jonction`, ▲ / ▼ vers le niveau lié voisin (une liste au-delà d'un de chaque côté) ; toucher le panneau du POI fait
  de même. Arrivée au raccord validé du niveau, sinon au bout opposé du tracé jonction, sinon à la même position ; cap
  gardé. Le tracker et le niveau de la carte ne bougent pas pendant la 3D.
- **Sortie** (demande de KARMA du 01/11/2026) : la carte 2D se place là où l'on était en 3D (niveau de la 3D, centre
  sur la position, sans animation), quelle que soit la réponse à « Je suis ici ? », qui recale aussi le niveau.
- **Outils de mesure** : `etat()` (tuiles, triangles, appels, contexte vivant…), `mesurer({ images })`,
  `placer(x, y, cap)`.

## Choix et pourquoi

| Choix | Pourquoi |
|---|---|
| **three.js 0.186.1**, `three.module.js` + `three.core.js` tels que dans le paquet npm | Dernière version publiée depuis plus de deux semaines. Depuis la 0.18x le paquet ne livre plus de `.min.js` ni d'UMD : seul le module ES existe (2,1 Mo bruts, ~420 Ko compressés). On ne minifie pas soi-même (règle des librairies : fichier du paquet officiel, `lib/VERSIONS.md`). |
| `import()` dynamique depuis un **script classique** | La CSP `script-src 'self'` accepte un module servi par l'app ; une *import map* serait un script en ligne, refusé. Le module est importé par URL absolue, une seule fois, à la première ouverture. |
| **Pas de `BufferGeometryUtils`** (ni d'autre `examples/jsm`) | Ces fichiers importent `"three"` par son nom nu : ils exigent une import map. La fusion est faite à la main : chaque tuile écrit directement ses tableaux de sommets, ce qui revient au même que `mergeGeometries` sans passer par une géométrie par objet. |
| **Tuiles de 16 m** fusionnées (1 à 3 maillages par tuile) | Construire tout le plan d'un coup coûte 0,35 s au PC, 1,8 s processeur ralenti x4, et un tas JS de 180 à 280 Mo pendant la construction (mesures ci-dessous) : trop pour iOS. Les tuiles à portée sont construites à l'ouverture, puis au plus 3 par image en marchant ; au-delà de la distance de vue + 32 m elles sont libérées. |
| **Pas d'instancing** | Les piliers relevés à la main n'ont pas deux formes identiques : l'instancing ne sert qu'à des objets répétés (il resterait utile pour des POI en 3D, pas pour les structures). |
| **Distance de vue 30 m**, brouillard noir de 10,5 à 30 m, caméra coupée à 35 m | C'est la lampe frontale du QCM : on ne voit pas plus loin sous terre, et ce qu'on ne voit pas n'est ni construit ni dessiné. |
| **Rendu seulement quand quelque chose bouge** | Immobile, la vue ne dessine plus rien (aucune image par seconde). C'est le premier levier batterie : en suivi, le tracker ne bouge qu'à chaque pas. |
| Densité de pixels **plafonnée à 2** (`densiteMax`) | Un iPhone est à 3 : passer de 2 à 3 multiplie le remplissage par 2,25 sans gain visible dans le noir. Anticrénelage seulement sous une densité de 2. |
| Normales en `int8`, couleurs en `uint8` | 18 octets par sommet au lieu de 36 : moitié moins de mémoire GPU. |
| Le **tracker n'est pas déplacé** par la vue 3D ; « Je suis ici ? » à la fermeture | Question 1 c : se recaler à l'œil sans fausser la timeline en route. Seuil : 0,5 m d'écart, suivi actif. |
| **Calques masqués compris** | Comme la règle du pas : on bute contre un pilier masqué, il doit donc être visible. |

## Modèle de scène

- **Repère** : mètres. `x` 3D = x image / `APP_CONFIG.scale`, `z` 3D = y image / scale (le haut de l'image est
  devant quand le cap vaut 0), `y` = hauteur. Pas de `convertCoord` ici : la 3D lit les coordonnées plan
  directement ; `convertCoord` reste la règle côté Leaflet.
- **Hauteur** : `getPlanHauteurGalerie()` (réglée dans ⛏️ Volume exploité), 2 m par défaut.
- **Piliers (1re et 2e masse), murs polygones, types perso fermés** : prismes du sol à la hauteur, dessus
  triangulé (`THREE.ShapeUtils`, contours concaves compris), faces orientées vers l'extérieur.
- **Murs en ligne** : épaisseur 0,4 m ; **fronts de taille** : 0,3 m. Un pavé par segment, prolongé d'une
  demi-épaisseur aux deux bouts pour fermer les angles.
- **Un mur est toujours sous un pilier ou un front de son niveau** (règle de KARMA) : un mur (polygone ou
  `mur-ligne`) monte à **98 %** de la hauteur (4 cm sous un plafond de 2 m) et son matériau est reculé en
  profondeur (`polygonOffset` 1 / 1). Là où il chevauche un pilier ou un front, c'est le pilier ou le front qui se
  voit : pas de scintillement sur les faces confondues, dessus du pilier visible. Vérifié par le checkup (un mur
  qui traverse le pilier posé devant le départ est plus bas que lui).
- **Zones** : remblais = volume à 60 % de la hauteur ; eau = surface translucide à 4 cm ; inaccessible = aplat
  au sol + rideau translucide sur son contour, rouges à hachures à 45° comme sur la carte (`_hachurer`, une bande
  sombre tous les 0,6 m, en coordonnées monde) ; effondrement et types perso = aplat au sol.
- **Tracés** : rubans de 0,25 m à 3 cm du sol ; **itinéraire** : ruban de 0,5 m non éclairé (il reste lisible
  hors du faisceau, le brouillard l'éteint au loin).
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
    grise, s'en détache), liseré au sol de 15 cm à la couleur de la légende.
  - **Zones** découpées à chaque pièce (CPU, par tuile) : eau à 4 cm ; remblais à 60 %, faces seulement côté galerie,
    bloquant ; inaccessible au sol + rideau rouge hachuré en travers du tube là où le contour coupe l'axe ;
    effondrement et perso au sol. **POI** à moins de 3 m de l'axe, ramenés contre la paroi, sinon masqués.
  - **Collision** : `KtaGalerie.segmentsBloques` (même forme que la règle des structures) : rester dans l'emprise et
    hors d'un remblais ; même corps de 0,8 m balayé.
- **Lumière** : projecteur (cône de 35°, pénombre 0,55, intensité 24, décroissance 1,2, portée = distance de vue)
  porté par la tête, petite lumière de proximité (4,5 m), ambiance presque nulle en vue à hauteur d'yeux ;
  brouillard noir de 13,5 à 30 m (rien n'est construit ni dessiné au-delà) ; tons compressés (ACES) pour qu'une
  face dorée éclairée de près ne sature pas.

## Chargement et hors ligne (`sw.js`)

- La **page** ne demande rien de la 3D avant le toucher de la tuile : `interface.js > _chargerVue3D` pose alors
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

Chiffres de la bêta (murs dans leur propre maillage, sol et plafond texturés, lampe renforcée, corps balayé),
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
sous émulation). La bêta coûte environ un tiers d'appels en plus (maillage des murs) et 0,1 à 1 ms par image ;
le budget reste large.

**WebKit de Playwright sous Windows** (moteur de Safari, pas Safari) : fonctionnel (checkup vert, « Apple GPU »
annoncé), rendu de 0 à 3 ms par image à la mesure, mais 8 à 9 images/s affichées en fenêtre de téléphone, 41
en fenêtre de PC, quelle que soit la densité : la présentation à l'écran de ce portage est en cause, une page
vide y tourne à 63 images/s. Chiffre non représentatif d'un iPhone.

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

1. **Distance de vue : 30 m** suffit et coûte peu ; 50 m reste confortable. Au-delà, la lampe ne montre rien.
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
| **Batterie** | Rendu seulement quand on bouge ; pas d'ombres ; GPU de bureau mesuré à < 1 ms par image | Mesure réelle de décharge sur une sortie ; couper la vue quand l'écran se verrouille (la boucle s'arrête déjà avec l'onglet caché) |
| **Fausse précision** : la 3D a l'air exacte, la position du tracker ne l'est pas (dérive PDR) | Lissage ; mode libre + « Je suis ici ? » pour se recaler à l'œil ; mention « bêta » et ligne d'aide de la tuile, Aide et guides : « la 3D montre le plan, pas la galerie réelle » | Retour terrain |
| Plan sans échelle ou sans structures | Sans échelle : tuile grisée et ouverture refusée avec un message | Plan sans structures : la vue montre sol, plafond, tracés et points |

## Intégration au menu Tracker (lots 1 et 2, livrés)

1. **Entrée** : tuile « 🧊 Vue 3D (bêta) » dans `interface.js > _ouvrirTrackerModal` (section Outils, après la
   tuile 🪧), qui charge `js/vue3d.js` à la demande comme `unlockGate.js` charge `bienvenue.js`, puis appelle
   `KtaVue3D.ouvrir()`. Grisée sans plan chargé ou sans échelle ; WebGL absent : `vue3d.indisponible`.
2. **Textes** (`lang/fr.json`, `en.json`, `es.json`, appel au rendu) : `vue3d.titre`, `vue3d.suivre`,
   `vue3d.plongee`, `vue3d.fermer`, `vue3d.avancer`, `vue3d.reculer`, `vue3d.tournerGauche`,
   `vue3d.tournerDroite`, `vue3d.pasGauche`, `vue3d.pasDroite`, `vue3d.contextePerdu`, `vue3d.sansPlan`,
   `vue3d.sansEchelle`, `vue3d.indisponible`, `vue3d.chargementImpossible`, `vue3d.jeSuisIci.*`,
   `tracker.menu.vue3d` et `tracker.menu.vue3dAide` ; section d'Aide `aide.sec.vue-3d.*`.
3. **Garde-fous** : `checkup-vue-3d.js` rejoué depuis la tuile (Chromium et WebKit) ; `smoke.js` (rien au
   démarrage) ; `check-i18n.js`, `check-aide-sections.js` ; `check-libs.js` (three.js).
4. **Docs** : `docs/architecture/tracking.md` § Vue 3D, guides `README_USER{,.en,.es}.md`, Aide intégrée,
   `AI_CONTEXT.md` (liste fermée de ce que montre la 3D), journal `README.md`, `NETWORK_AUDIT` (librairies ; note
   v2.22.0 de l'historique), `CLAUDE.md` (Où chercher). Pas de point du smoke manuel de la porte de release.

## Estimation

| Lot | Contenu | Taille |
|---|---|---|
| 1 | Tuile du menu Tracker, chargement à la demande, textes fr/en/es, refus sans échelle, précache, reprise après perte de contexte, « Je suis ici ? », checkup rejoué depuis la tuile | **S**, livré |
| 2 | Docs : guides 3 langues, Aide, AI_CONTEXT, tracking.md, journal | **S**, livré |
| 3 | Mesure sur un vrai iPhone et un plan dense réel ; réglages (distance, densité) d'après les chiffres | **M** |
| 4 | Multi-niveau par POI jonction et tracé `jonction` (question B) : **livré** ; reste POI touchables (fiche), itinéraire vivant suivi en 3D | **M** |
| 4 bis | Mode « galerie » : tracés en tubes, carrefours exacts, bascule exclusive structures / galerie, collisions contre les parois (question A) | **M**, livré |
| 5 | Rendu plus « vrai » (texture de roche, ombres de la lampe, niveaux voisins en transparence) | **L**, à n'engager qu'après le retour terrain |

## Questions tranchées (QCM du 01/11/2026, toutes les recos prises)

| # | Sujet | Décision |
|---|---|---|
| 1 | Déplacer le tracker ? | **c** : non ; à la fermeture « 📍 Je suis ici ? » propose de le recaler là où l'on s'est arrêté (suivi actif et déplacement fait) |
| 2 | Hors ligne | **a** : précache des quatre fichiers |
| 3 | Épaisseurs | **a** : fixes (mur en ligne 0,4 m, front 0,3 m) |
| 4 | Remblais | **a** : volume à 60 % de la hauteur |
| 5 | Couleurs | **a** : celles de la légende |
| 6 | Calques masqués | **a** : montrés en 3D |
| 7 | Contexte WebGL | **c** : libéré à chaque fermeture + reprise automatique après une perte, fermeture avec message si elle échoue |
| 8 | Distance de vue | **a** : 30 m fixes |
| — | Murs et piliers | Règle ajoutée : un mur est toujours sous un pilier ou un front de son niveau (modèle de scène) |
| A | Mode « galerie » (QCM du 01/11/2026) | Interrupteur **exclusif** structures / galerie, bouton 🧱 / 🚇 écrit en clair, retenu par plan, défaut d'après les structures du niveau ; **carrefours exacts** (option a : dalle, coupes, onglets bornés, coins reliés, bout fermé) ; largeurs principal 2,5 m, **secondaire 2 m, chemin 1,7 m**, perso 2 m (réglage par type plus tard) ; parois en **moellons de calcaire taillés** (assises à joints décalés), sol et plafond au grain calcaire, **liseré** au sol à la couleur de la légende ; collision contre les parois et les remblais (fonction exposée) ; zones découpées au tube (option a, CPU), rideau en travers pour l'inaccessible ; POI à moins de **3 m**, sinon masqués ; structures masquées et sans collision |
| B | Passer par un POI jonction (QCM du 01/11/2026) | Bouton 🪜 à moins de 2 m, **▲ / ▼** vers le niveau lié suivant, liste au-delà ; toucher le panneau = même chose ; arrivée au raccord validé ou à la même position, cap gardé ; tracé `jonction` **dans les deux sens** ; **le tracker ne bouge pas**, « Je suis ici ? » recale aussi le niveau ; en suivi, pas de 🪜 ; niveau de la carte 2D inchangé pendant la 3D |
| — | Sortie de la 3D (demande du 01/11/2026) | La carte 2D se place là où l'on était en 3D : niveau de la 3D, centre sur la position, quelle que soit la réponse à « Je suis ici ? » |

## Question ouverte

### Relevé fictif

9. **Relevé fictif** : il n'a aucune structure sur les niveaux 0 et 1 joués par le checkup (qui pose son propre
   pilier et son mur). a) y ajouter quelques piliers, murs et fronts fictifs (sur consigne de KARMA, `data/` n'est
   touché que par lui) · b) laisser. **Reco a** : démonstration et tests plus parlants. Non traitée.
