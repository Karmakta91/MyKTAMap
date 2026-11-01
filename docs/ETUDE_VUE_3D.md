# Étude — Vue 3D autour de sa position

> Étude et prototype du lot `vue-3d`, d'après le QCM de KARMA du 01/11/2026. Le prototype (`js/vue3d.js`) n'est
> **branché sur aucune interface** : il s'ouvre par `window.KtaVue3D.ouvrir()`, appelé par
> `scripts/smoke/checkup-vue-3d.js`. Les questions de la dernière section restent ouvertes.

## Le besoin

Sur un plan dense en piliers, murs et fronts de taille, la vue de dessus dit mal ce qu'on a devant soi. Depuis sa
position (tracker), l'utilisateur voit en 3D ce qui l'entoure et s'y déplace ; accès prévu plus tard depuis le menu
Tracker.

## Décisions de KARMA (QCM du 01/11/2026)

| # | Sujet | Décision |
|---|---|---|
| 1 | Livrable | Cette étude + un prototype jouable sur le relevé fictif, rien de branché sur l'UI |
| 2 | Caméra | Première personne à hauteur d'yeux depuis le tracker ; un bouton bascule en vue plongeante au-dessus de soi |
| 3 | Librairie | three.js embarqué dans `lib/`, chargé **à la demande** (rien au démarrage) |
| 4 | Contenu | Structures extrudées à la hauteur du plan (Volume exploité) ; sol, plafond ; zones ; POI en panneaux ; tracés et itinéraire au sol |
| 5 | Déplacement | Suit le tracker ; boutons à l'écran et clavier ; on bute contre piliers, murs, fronts avec la règle du pas du tracker |
| 6 | Lumière | Lampe frontale : noir autour, faisceau devant qui s'éteint au loin |
| 7 | Niveaux | Niveau actif seul ; un changement de niveau refait la scène |
| 8 | Performance | 30 images/s sur un iPhone récent, plan dense (~9 000 piliers, 4 000 murs, 700 fronts) |

## Ce que fait le prototype

- **Ouvrir** : `KtaVue3D.ouvrir({ distanceVue, tuiles, depart, densiteMax, stats })` charge `css/vue3d.css` et
  three.js, monte une fenêtre plein écran (z-index des modales), part de la position et du cap du tracker
  (`getTrackingPosition`, `getPlanRelHeading`). `fermer()` (✕ ou Échap) démonte tout et libère le contexte WebGL.
- **Vues** : à hauteur d'yeux (1,6 m, ou 80 % de la hauteur si la galerie est basse) ; 🛰️ ou touche V = plongeante
  (16 m au-dessus, 7 m en arrière, plafond masqué, silhouette dorée à sa place, éclairage d'ambiance relevé).
- **Déplacement** : 📍 « Suivre » = la caméra suit le tracker (position et cap lissés, un pas ne saute pas) ;
  pavé ▲ ▼ ◀ ▶ ↶ ↷ maintenu, ou clavier (flèches, ZQSD / WASD, A/E en pas de côté, Maj pour courir), ou glisser
  sur la scène (tourner, lever les yeux) = mode libre. 1,4 m/s, 90 °/s.
- **Collisions** : chaque déplacement libre passe la règle du pas du tracker, exposée par `tracking.js`
  (`ktaEstAccessible` puis `ktaPasBloqueParStructure`, sans copie), avec 0,3 m de marge devant soi ; si le pas
  est refusé, on essaie chaque axe seul (on glisse le long d'un mur).
- **Niveau** : celui du tracker en suivi actif, sinon le niveau actif du sélecteur ; lu à chaque image, la scène
  est refaite dès qu'il change (aucun événement de changement de niveau n'existe aujourd'hui).
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
| Le **tracker n'est pas déplacé** par la vue 3D | Le prototype explore ; déplacer la position réelle est une décision produit (question 1). |
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
- **Zones** : remblais = volume à 60 % de la hauteur ; eau = surface translucide à 4 cm ; inaccessible = aplat
  au sol + rideau translucide sur son contour ; effondrement et types perso = aplat au sol.
- **Tracés** : rubans de 0,25 m à 3 cm du sol ; **itinéraire** : ruban de 0,5 m non éclairé (il reste lisible
  hors du faisceau, le brouillard l'éteint au loin).
- **POI** : panneau toujours face à soi (icône du catalogue `getIconUrlForPoint` + nom), au-dessus des yeux,
  caché par ce qui est devant.
- **Matériaux** : couleurs du canon, `ktaResolveStyle(cat, clé, { flat: true })` (remplissage pour les zones,
  trait pour les tracés) ou `ktaSwatchColor` : la couleur choisie par l'utilisateur dans la légende et les types
  `cust-…` suivent sans table locale. Lambert à couleurs par sommet ; sol et plafond gris pierre.
- **Lumière** : projecteur (cône de 35°, pénombre 0,55) porté par la tête, petite lumière de proximité (3,5 m),
  ambiance presque nulle en vue à hauteur d'yeux ; tons compressés (ACES) pour qu'une face dorée éclairée de près
  ne sature pas.

## Chargement et hors ligne (`sw.js`)

- Le prototype ne touche pas `sw.js`. Aujourd'hui, à la **première ouverture en ligne**, `js/vue3d.js`,
  `css/vue3d.css` et les deux modules three.js entrent dans le cache de la version par le chemin par défaut du
  service worker (`_parDefaut`), et ne sont jamais évincés (l'éviction ne touche que les tuiles).
- 🩸 Ce cache est **par version** : à chaque mise à jour de l'app il repart vide. Un utilisateur mis à jour qui
  n'a pas rouvert la 3D en ligne ne l'aura **pas sous terre**.
- Reco : précacher les cinq fichiers dans `ASSETS_TO_CACHE`, comme `bienvenue.js` (chargé à la demande, précaché
  pour un premier lancement hors ligne) : +2,1 Mo bruts, ~420 Ko transférés (compression du serveur) à chaque
  installation ou mise à jour (question 2).
- `smoke.js` refuse désormais toute requête vers `lib/three/`, `js/vue3d.js` ou `css/vue3d.css` pendant son
  parcours : la 3D ne pèse rien au démarrage.

## Mesures

Plan dense **synthétique** (fictif, généré en mémoire par `checkup-vue-3d.js`, `KTA_V3D_PERF=1`) : 9 000 piliers
de 6 à 12 sommets, 3 000 murs polygones, 1 000 murs en ligne, 700 fronts, 108 zones, 520 POI, sur une maille de
7 m (≈ 800 m × 800 m, 2 465 tuiles). Temps par image = rendu + attente de la fin du travail du GPU (lecture d'un
pixel), sur un tour complet sur place, après un tour de chauffe non compté (compilation des shaders, envoi au
GPU).

**PC** — Edge 156 sans écran, GPU réel (RTX 5070, D3D11), fenêtre 1200 × 800 :

| Distance de vue | Ouverture | Tuiles construites | Triangles dessinés | Appels | ms / image (médiane · p95) | Tas JS |
|---|---|---|---|---|---|---|
| 20 m | 46 ms | 10 | 1 495 | 11 | 0,6 · 0,7 | 66 Mo |
| **30 m** | **29 ms** | **18** | **1 917** | **16** | **0,5 · 0,7** | **68 Mo** |
| 50 m | 32 ms | 43 | 3 684 | 26 | 0,6 · 0,8 | 79 Mo |
| 30 m, sans tuiles (tout le plan fusionné) | 343 ms | 1 | 389 396 | 9 | 2,0 · 2,3 | 284 Mo |

Marche de 120 m en ligne droite (0,2 m par image, tuiles construites en route) : aucune image au-delà de 33 ms
(la plus longue : 12 ms). Rotation continue : 165 images/s (limite de l'affichage).

**Émulation iPhone** — même navigateur et même GPU, fenêtre 393 × 852 à densité 3 (rendu plafonné à 2),
processeur ralenti x4 :

| Distance de vue | Ouverture | Triangles | Appels | ms / image (médiane · p95) | 1er tour (chauffe) |
|---|---|---|---|---|---|
| 20 m | 220 ms | 1 341 | 9 | 1,3 · 3,1 | 333 ms |
| **30 m** | **123 ms** | **1 594** | **12** | **1,0 · 3,9** | **133 ms** |
| 50 m | 101 ms | 2 514 | 16 | 1,2 · 2,2 | 165 ms |
| 30 m, sans tuiles | 1 842 ms | 389 392 | 7 | 3,4 · 7,1 | 224 ms |

Marche de 120 m : aucune image au-delà de 33 ms (la plus longue : 24 ms). Budget de 30 images/s = 33 ms.

**WebKit de Playwright sous Windows** (moteur de Safari, pas Safari) : fonctionnel (checkup vert, « Apple GPU »
annoncé), rendu de 0 à 3 ms par image à la mesure, mais 8 à 9 images/s affichées en fenêtre de téléphone, 41
en fenêtre de PC, quelle que soit la densité : la présentation à l'écran de ce portage est en cause, une page
vide y tourne à 63 images/s. Chiffre non représentatif d'un iPhone.

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
| **Perte du contexte WebGL** (mémoire graphique, onglet longtemps en fond) | `webglcontextlost` : la vue se ferme proprement avec un toast, rien ne reste figé | Reprise automatique (three.js sait recharger un contexte restauré) : à décider (question 7) |
| **Contextes WebGL en trop** | Chaque fermeture appelle `forceContextLoss` ; Chromium rend la place aussitôt. WebKit ne la rend qu'au ramasse-miettes : après ~16 ouvertures rapprochées il annonce « too many active WebGL contexts » et perd le plus ancien, **déjà fermé** (sans effet ; toléré par le checkup sous WebKit seulement) | Si l'app utilisait un autre contexte WebGL un jour, garder un seul contexte pour la session (question 7) |
| **Batterie** | Rendu seulement quand on bouge ; pas d'ombres ; GPU de bureau mesuré à < 1 ms par image | Mesure réelle de décharge sur une sortie ; couper la vue quand l'écran se verrouille (la boucle s'arrête déjà avec l'onglet caché) |
| **Fausse précision** : la 3D a l'air exacte, la position du tracker ne l'est pas (dérive PDR) | Lissage, et le mode libre permet de se recaler à l'œil | Rappeler dans l'aide que la 3D montre le plan, pas la galerie réelle |
| Plan sans échelle ou sans structures | Échelle absente : 1 px = 1 m (vue fausse mais sans plantage) | Refuser l'ouverture sans échelle définie, avec un message (lot 1) |

## Plan d'intégration au menu Tracker

1. **Entrée** : une tuile « 🧊 Vue 3D » dans le menu Tracker (`interface.js > _ouvrirTrackerModal`, à côté de la
   tuile 🪧 du guidage), qui charge
   `js/vue3d.js` à la demande comme `unlockGate.js` charge `bienvenue.js`, puis appelle `KtaVue3D.ouvrir()`.
   Grisée sans plan chargé ou sans échelle.
2. **Textes** (`lang/fr.json`, `en.json`, `es.json`, appel au rendu) : `vue3d.titre`, `vue3d.suivre`,
   `vue3d.plongee`, `vue3d.fermer`, `vue3d.avancer`, `vue3d.reculer`, `vue3d.tournerGauche`,
   `vue3d.tournerDroite`, `vue3d.pasGauche`, `vue3d.pasDroite`, `vue3d.contextePerdu`, `vue3d.sansEchelle`,
   `vue3d.indisponible` (WebGL absent), et la tuile du menu (`tracker.menu.vue3d` + aide). Le prototype les a en
   français en dur.
3. **Garde-fous** : `checkup-vue-3d.js` (déjà là, à rejouer depuis la tuile du menu) ; `smoke.js` (rien au
   démarrage, déjà là) ; `check-i18n.js` (clés) ; `check-libs.js` (three.js, déjà là) ; une ligne dans la porte de
   release si la 3D devient un point du smoke manuel.
4. **Docs** : `docs/architecture/tracking.md` (§ Vue 3D, et la règle du pas exposée y est déjà),
   `rendering-leaflet.md` (couleurs du canon lues par la 3D), guides `README_USER{,.en,.es}.md`, Aide intégrée,
   `AI_CONTEXT.md`, journal `README.md`, `NETWORK_AUDIT` (aucun appel réseau nouveau : à dire), `sw.js`
   (précache, question 2).

## Estimation

| Lot | Contenu | Taille |
|---|---|---|
| 1 | Tuile du menu Tracker, chargement à la demande, textes fr/en/es, refus sans échelle, précache, checkup rejoué depuis la tuile | **S** |
| 2 | Docs : guides 3 langues, Aide, AI_CONTEXT, tracking.md, journal | **S** |
| 3 | Mesure sur un vrai iPhone et un plan dense réel ; réglages (distance, densité) d'après les chiffres ; reprise après perte de contexte | **M** |
| 4 | Jonctions en 3D (changer de niveau en marchant sur un POI jonction en mode libre), POI touchables (fiche), itinéraire vivant suivi en 3D | **M** |
| 5 | Rendu plus « vrai » (texture de roche, ombres de la lampe, niveaux voisins en transparence) | **L**, à n'engager qu'après le retour terrain |

## Questions ouvertes pour KARMA

1. **Se déplacer en 3D déplace-t-il le tracker ?** a) non, la 3D explore (prototype) · b) oui, chaque pas est un
   recalage · c) non, mais à la fermeture « 📍 Je suis ici ? » propose de recaler le tracker là où l'on s'est
   arrêté. **Reco c** : utile pour se recaler à l'œil, sans fausser la timeline en route.
2. **Hors ligne** : a) précacher three.js et la vue (+2,1 Mo, ~420 Ko transférés par mise à jour) · b) cache au
   premier usage (perdu à chaque mise à jour) · c) un bouton « rendre la 3D disponible hors ligne ». **Reco a** :
   la 3D sert sous terre, là où il n'y a pas de réseau.
3. **Épaisseurs** : mur en ligne 0,4 m, front 0,3 m. a) fixes · b) réglables par plan. **Reco a**.
4. **Remblais** : a) volume à 60 % de la hauteur (on voit que ce n'est pas un pilier) · b) jusqu'au plafond.
   **Reco a**.
5. **Couleurs** : a) celles de la légende, pures (doré, bleu…) · b) teinte de roche avec un liseré de la couleur
   du type. **Reco a** pour l'intégration (on reconnaît la légende), b à juger sur le terrain.
6. **Calques masqués** : a) toujours montrés (on bute contre, comme le tracker) · b) masqués aussi en 3D.
   **Reco a**.
7. **Contexte WebGL** : a) libéré à chaque fermeture, perte = fermeture avec message (prototype) · b) un seul
   contexte gardé pour toute la session · c) a + reprise automatique après une perte. **Reco c**.
8. **Distance de vue** : a) fixe à 30 m · b) réglable (20 / 30 / 50 m). **Reco a** tant que l'iPhone n'a pas parlé.
9. **Relevé fictif** : il n'a aucune structure sur les niveaux 0 et 1 joués par le checkup (qui pose son propre
   pilier). a) y ajouter
   quelques piliers, murs et fronts fictifs (sur ta consigne, `data/` n'est touché que par toi) · b) laisser.
   **Reco a** : démonstration et tests plus parlants.
