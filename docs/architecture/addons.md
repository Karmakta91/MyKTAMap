# Add-ons — `addons/<nom>/`

> État actuel, pas d'historique. Ce fichier se lit **en entier** avant d'écrire ou de modifier un add-on, par un
> développeur comme par une IA : il dit ce qu'est un add-on, comment il se lance, à quoi il a le droit de toucher
> (les connecteurs) et ce qui lui est interdit. Exemple complet : l'add-on `mkmg` (dernière partie).

## En une minute

```
 vue 3D ouverte ──(code « six vers le bas »)──► KtaRegistreAddons.parCode("bas6")   (js/ktaAddons.js)
                                                   │ addons/index.json → addons/mkmg/addon.json (code, entrée)
                                                   │ charge une fois addons/mkmg/js/coeur.js (script classique)
                                                   ▼
                                     window.KtaAddons.mkmg.lancer()
                                                   │ refus ? (installation, suivi, urgence, Secours) → message
                                                   │ confirmation (ktaConfirm) → partie
                                                   ▼
                                 KtaVue3D.greffer({ scene, surImage, demonter })
                                                   │
             ctx : groupe 3D · calque HUD · caméra · position · règle du pas · regler(…) · sale()
```

Un add-on est un **invité de la vue 3D** : il dessine dans un groupe et un calque qu'on lui prête, lit les données
du plan, et ne modifie rien de l'app. Quand il part (retrait, fermeture de la vue, erreur), tout ce qu'il a posé
part avec lui.

## Ce qu'est un add-on

- **Un dossier** `addons/<nom>/` (nom `[a-z0-9-]`, discret : le dépôt est public) : `js/`, `css/`, `img/` et son
  **manifeste** `addon.json`, listé dans `addons/index.json`. Rien dans `js/`, `css/`, `lang/`, `index.html`, `sw.js` :
  l'app ne le charge pas au démarrage.
- **Le manifeste** `addons/<nom>/addon.json` :

  | Champ | Ce que c'est |
  |---|---|
  | `nom` | le nom du dossier |
  | `prise` | où il se greffe : `"vue3d"` seulement (une prise nouvelle vient avec l'add-on qui la justifie) |
  | `secret` | `true` : absent de Configuration › Add-ons et du bouton 🎮, lancé par son code seul (`mkmg`) |
  | `parDefaut` | add-on visible : `false` pour le livrer éteint (absent = allumé, décision produit) |
  | `code` | code de la vue 3D qui le lance (`"bas6"`), émis par `vue3d.js > _lancerAddon` ; un seul add-on par code ; obligatoire pour un secret, facultatif pour un visible (🎮 suffit) |
  | `entree` | script chargé en premier, parmi `fichiers` ; il charge lui-même le reste |
  | `fichiers` | TOUS ses fichiers, chemins sous `js/`, `css/` ou `img/` : ce que le précache prend |
  | `titre` | `{ fr, en, es }` (Réglages, ConfAdmin) |

  Lu par le registre de l'app (`js/ktaAddons.js > KtaRegistreAddons` : `liste()`, `parCode(code)`, `charger(m)`,
  `actif(m)`, `regler(nom, oui)`, `titre(m)`, à la première demande seulement) et par le précache
  (`sw.js > _assetsAddons`). 🔒 Un manifeste mal formé (nom, prise,
  chemin hors des trois dossiers, entrée hors de ses fichiers) est écarté, jamais chargé.
- **Community** : gratuit, sans serveur, comme le reste de ce dépôt. Pas de code pro, pas d'appel réseau
  (`community-server-line.md`).
- **Ses propres textes** fr / en / es dans son code (table + `I18n.getLang()`), jamais dans `lang/*.json`.
- **Ses propres clés locales**, préfixées `myktamap_<nom>_…` (scores, préférences), jamais la session.
- **Précaché** comme tout le JS, sans toucher `sw.js` : l'install lit `addons/index.json` et les `fichiers` de chaque
  manifeste (il marche hors ligne).
- **Discret côté utilisateur** (décision produit pour `mkmg`) : absent des guides et de l'Aide ; seule une phrase
  peut y faire allusion. La doc technique (ce fichier) est obligatoire.

## Comment il se lance

1. **Déclencheur** : add-on **visible** → bouton **🎮 Add-ons**, dernière ligne de la tuile ⚙️ de la vue 3D (la
   rangée du haut tient sur une ligne au téléphone), montré seulement s'il y a au moins un add-on visible allumé ; un
   seul se lance tout de suite, plusieurs passent par un choix (`ktaConfirm`, boutons radio) ; rien pendant une
   greffe. Add-on **secret** → un code dans la vue 3D. `vue3d.js > CODE_BAS` (décision produit) : 6 appuis vers le bas en moins
   de 2 s — ▼ du pavé, ↓ ou S (répétition du clavier ignorée), ou coup bref du joystick vers le bas (relâché moins de
   0,5 s après la sortie de la zone morte, toujours à plus de 135° de l'avant), sans autre commande de déplacement
   entre deux (elle remet le compte à 0). `window` reçoit `kta:vue3dCode` (`detail.code = "bas6"`).
2. **Chargement** : `vue3d.js > _lancerManifeste` (par `_lancerAddon` pour un code, `_choisirAddon` pour 🎮) prend le
   manifeste au registre, refuse un add-on éteint (`KtaRegistreAddons.actif`), puis pose une fois son `entree` (même
   origine, CSP `script-src 'self'`) ; un appel répété pendant ce temps ne lance qu'une fois. Un add-on absent ou un manifeste illisible laisse un avertissement
   en console, rien d'autre.
3. **Inscription** : le script s'inscrit dans `window.KtaAddons.<nom> = { lancer() }`. La vue appelle `lancer()`
   à chaque code ou choix 🎮 (vue ouverte seulement).
4. **Décision** : c'est l'add-on qui refuse (avec `ktaAlerte`) ou demande confirmation (`ktaConfirm`), puis se greffe.
   Il charge lui-même ses autres fichiers et sa feuille de style (`<link>` et `<script>` de même origine).

## Activation sur une installation

- **Sur l'appareil** : ⚙️ Configuration › **🎮 Add-ons** (accueil, `homeConfig.js > _peindreAddons`) donne un
  interrupteur à chaque add-on visible (titre du manifeste), retenu sous `myktamap_addons_v1` (`{ <nom>: bool }`) ;
  rubrique masquée tant qu'aucun add-on visible n'est livré. Un add-on secret n'y est jamais et reste toujours actif.

- **myktamap.fr / instance sans serveur** (`KtaExtensions.etat().etat === "off"`) : permis.
- **Installation reliée à un serveur** (pro) : refusé par défaut, sauf si son hébergeur l'autorise dans
  `data/reglages.json` : `{ "addons": { "<nom>": true } }`, écrit à la main ou par **ConfAdmin** (rubrique 🎮 Add-ons :
  une case par add-on livré, secrets compris — outil de l'hébergeur, décision produit ; relue par « Reprendre un
  reglages.json », un nom absent de la version gardé à l'export ; `js/confadmin.js > ktaReglagesExport`). `KtaInstance.filtrerReglages` ne garde de `addons` que des
  noms `[a-z0-9-]{1,32}` à `true` (`check-gate-instance.js`, piège compris) ; ce réglage autorise un add-on déjà livré,
  il n'en charge aucun. Lecture côté add-on : `KtaInstance.etat().reglages.addons.<nom> === true`. Un interrupteur par
  organisation (pro) est au backlog.
- 🔒 **Toujours refusé** pendant le suivi du tracker (`getTrackingActif()`), une sortie d'urgence (itinéraire
  `urgence`, `EmergencyMode.isActif()`) ou le mode Secours (`SecoursMode.isOpen()`) : l'app est un outil de terrain.

## La prise de la vue 3D : `KtaVue3D.greffer(g)`

`greffer(g)` → fonction qui retire la greffe, ou `null` (vue fermée, greffe déjà posée). **Une greffe à la fois**,
qui vit avec la vue ouverte ; sans greffon, la vue ne crée rien (ni calque, ni objet, ni appel).

### Cycle de vie : `g = { nom, scene(ctx, raison), surImage(ctx, dt), demonter(ctx, raison) }` (tous facultatifs)

| Appel | Quand | À faire |
|---|---|---|
| `scene(ctx, "greffe")` | à la greffe | poser ses objets dans `ctx.groupe`, son interface dans `ctx.hud`, `ctx.regler(…)` |
| `scene(ctx, "refaite")` | scène refaite : niveau, rendu, hauteur, filtres, itinéraire, données du plan changées pendant la vue (objet ajouté, modifié, supprimé, annulé, calque rapatrié ou restitué, légende) | se recaler (ex. autre niveau) ; `ctx.bloque` / `ligneBloquee` / `libre` lisent déjà les nouvelles données : un greffon qui en tient un cache (carte des distances…) le refait ici |
| `scene(ctx, "reprise")` | après une perte du contexte WebGL | 🩸 `ctx.groupe` et `ctx.camera` sont **neufs** : tout refaire, **jamais** `dispose()` sur les objets d'avant (morts avec l'ancien contexte) |
| `surImage(ctx, dt)` | à chaque image tant que la vue rend (pas pendant une perte) | animer ; la vue ne dessine que si quelque chose bouge : appeler `ctx.sale()` |
| `demonter(ctx, raison)` | `"degreffe"` (retrait), `"fermeture"` (vue fermée), `"contexte"` (contexte non repris), `"erreur"` | libérer ce qu'on a créé (sauf `"contexte"`) ; la vue retire ensuite `ctx.groupe` et `ctx.hud` |

🔒 Une exception dans un appel **retire la greffe** (`demonter(ctx, "erreur")`) ; la vue continue.

### Le contexte `ctx` (lu à l'appel)

| Champ | Ce que c'est |
|---|---|
| `THREE` | three.js (module de la vue, 0.186.1) |
| `groupe` | `THREE.Group` dans la scène ; unités en **mètres** (x = x image / sc, z = y image / sc, y = hauteur) |
| `hud` | calque `.kta-v3d-greffe` : sous la rangée du haut et le bandeau, au-dessus de la scène, **sous les commandes** (joystick à gauche, pavé au centre) ; il laisse passer le doigt, l'add-on rend touchables ses éléments (`pointer-events: auto`) |
| `camera` | caméra de la vue (on peut y accrocher un objet : il suit le regard) |
| `niveau`, `hauteur`, `sc` | niveau affiché, hauteur des galeries (m), échelle (px / m) |
| `pos`, `cap` | position (px plan, copie) et cap (°, 0 = haut de l'image, 90 = droite) |
| `rendu`, `mode`, `vue`, `commandes`, `court` | `"mixte"` / `"structures"` / `"galerie"` ; `"suivi"` / `"libre"` ; `"yeux"` / `"plongee"` ; `"joystick"` / `"pave"` ; pas rapide en cours |
| `miniCarte` | `true` quand le médaillon de la mini-carte est montré en haut à droite : le greffon y libère la place (le jeu `mkmg` passe alors son panneau sous ses jauges, à gauche) |
| `sale()` | demander une image |
| `bloque(x0, y0, x1, y1)` | règle du pas **de la vue** (jamais une copie) : un corps de 0,8 m ne passe pas (px plan) |
| `ligneBloquee(x0, y0, x1, y1)` | une ligne de vue est coupée (pilier, mur, paroi) |
| `libre(x, y)` | un corps tient là : ni coincé, ni dans une structure **dessinée**, corps dégagé (un calque masqué n'y compte pas), ni dans ou contre un remblais, un effondrement ou une zone inaccessible du niveau (`galerieEmprise.js > ZONES_BOUCHENT`), ni dans ou contre l'obstacle d'un accès de surface : cône d'un puits comblé, cavage fermé, pierre de taille qui comble un cavage (ouvert ou fermé) jusqu'aux structures (`KtaGalerie.BLOQUE`, posé par `placePassage`, `comblementPorte`) ; dans la galerie inclinée d'un tracé jonction, sa seule règle : le corps entre ses parois |
| `regler(r)` | réglages de la vue **pour la greffe seulement**, levés au retrait (table ci-dessous) |

`regler({ … })` — `false` masque ou interdit, `true` rend ; les filtres de la carte n'en savent rien :

| Clé | Effet à `false` |
|---|---|
| `traces` | tracés au sol masqués (les tubes des galeries restent) ; scène refaite |
| `itineraire` | itinéraire de l'app masqué (ruban, étapes, 🏁) ; scène refaite |
| `guidage` | bandeau et chevrons du guidage de l'app masqués |
| `course` | pas rapide interdit |
| `avatar` | silhouette dorée de la vue d'édition masquée (l'add-on dessine la sienne) |
| `commandes` | joystick et pavé retirés (une carte à toucher là où est le pouce) ; 🩸 `display` en style, le pavé étant en grille |
| `plongee` | vue d'édition interdite : bouton ✏️ grisé, `basculerVue` et `zoomer` refusés, retour à hauteur d'yeux si l'on y était |
| `fiches` | un toucher bref sur la scène n'ouvre plus rien (ni fiche de POI, de structure, de zone ou de tracé, ni nom d'un membre) : il est au greffon (un jeu qui tire au doigt) ; une fiche ouverte se ferme. ⚠️ Coupe aussi le **dessin** depuis la vue plongeante : barre ✏️ masquée, outil éteint, aucun sommet posé même si un outil de la carte était armé (`vue3d.js > _dessinPermis`) ; le jeu `mkmg` n'édite donc jamais le plan. Cache aussi **🔍 Rechercher** de la colonne et refuse « y aller » depuis la recherche (`_rechercheDispo`, toast) |
| `miniCarte` | mini-carte de la vue masquée (médaillon en haut à droite, refermée si elle était agrandie) ; le réglage 🗺️ de l'appareil n'est pas réécrit et revient au retrait (`vue3d.js > _appliquerMiniCarte`) |
| `reglagesFiges` (`true` pour l'activer, absent = `false`) | réglages ⚙️ Portée et Lampe de l'utilisateur figés : portée par défaut (30 m), intensité 100 %, faisceau de 71° et Plein jour coupé, trois curseurs et ☀️ grisés ; ce qui est retenu (vue et appareil) n'est jamais réécrit et revient au retrait ou avec la clé à `false`. Sans la clé, la greffe garde la portée et la lampe de l'utilisateur, Plein jour compris |

Deux **facteurs** (nombre de 0 à 1, 1 = normal, rendus au retrait) :

| Clé | Effet |
|---|---|
| `lampe` | force et portée de la lampe frontale, multipliées aux réglages ⚙️ de la lampe de l'appareil (intensité ; portée comptée sur la portée réglée, jamais sous 6 % ; le halo autour de soi reste un peu) ; réappliqué quand la scène est refaite après une perte du contexte. Avec `reglagesFiges`, ce calcul part de 30 m, de 100 % et de 71° |
| `vitesse` | pas au pavé, au clavier et au joystick (course comprise) |

## Les connecteurs : ce qu'un add-on peut lire

Tout est **en lecture seule** ; un add-on n'écrit que dans son état, son groupe, son calque et ses clés locales.

| Besoin | Connecteur |
|---|---|
| POI du plan | `getEditorPoints()`, `getAllEmbeddedPoints()` (masqués compris, sauf un calque en « Modifier », lu par sa copie de session ; champ `nom`, `x`, `y`, `level`, `tags`) |
| Tracés | `getRoads()`, `getAllEmbeddedRoads()` (ignorer `itinerary` et `jonction`) |
| Zones | `getZones()`, `getAllEmbeddedZones()` (`type` : `remblais`, `effondrement`, `inaccessible`, `eau`, `cust-…`) |
| Structures | `getStructures()`, `getAllEmbeddedStructures()` (préférer `ctx.bloque` / `ctx.libre` pour les collisions) |
| Un trajet | `Pathfinder.computeRoute([{x, y, level}, …])` (async ; n'écrit rien, mais coûteux : pas en boucle) |
| Le réseau | `RoadGraph.getGraph()` (graphe en cache : `nodes`, `edges[i] = [{to, weight}]`), `Pathfinder.snapPointToGraph(g, p)` |
| Langue, textes | `I18n.getLang()` ; `ktaEsc(s)` pour tout texte mis dans un message HTML |
| Fenêtres | `ktaConfirm(html, opts)` (opts `choix` = boutons radio), `ktaAlerte(texte)` ; jamais `alert` / `confirm` |
| Distances | `formatDistance(m, décimales)` |
| Installation | `KtaExtensions.etat().etat`, `KtaInstance.etat().reglages` |
| État de terrain | `getTrackingActif()`, `EmergencyMode.isActif()`, `SecoursMode.isOpen()` |

## Interdits

- Écrire dans la session (`KtaSessionStore`, clés `myktamap_session_v1_…`), le tracker, les filtres, l'itinéraire
  de l'app, `data/` — l'add-on joue, il ne modifie pas le relevé ni la sortie de l'utilisateur.
- Appeler le réseau (autre que charger ses propres fichiers), charger un script tiers.
- Script en ligne (`onclick=`, `<script>` sans `src`), popups natives, couleur en dur dans un `style=` (jetons
  `var(--kta-…)` ; les couleurs d'objets 3D sont des couleurs de scène, en `0x…`), HTML non échappé dans une fenêtre.
- Toucher `js/vue3d.js` hors de la prise : s'il manque quelque chose, c'est la prise qui s'élargit (neutre, sans
  effet sans greffon, documentée ici), avec l'accord de qui tient la vue 3D.

Les garde-fous qui lisent `js/` lisent aussi `addons/**` (pré-commit et CI) : en-tête de licence
(`check-entete-licence.js`), script en ligne (`check-csp-inline.js`), couleurs en dur (`check-couleurs-inline.js`),
popups natives (`check-popups-natives.js`), XSS des fenêtres (`check-xss.js`), copie de l'échappement
(`check-esc.js`), commentaires (`check-commentaires.js`), accès direct à la session (`check-session-store.js`), toast
hors du goulot (`check-notifs.js`).

## Ajouter un add-on (marche à suivre)

1. Créer `addons/<nom>/js/<fichier>.js` : en-tête de licence, en-tête ≤ 20 lignes (rôle, ce qu'il expose, pièges),
   IIFE, `"use strict"`, inscription `window.KtaAddons.<nom> = { lancer }`, logs préfixés `[<Nom>]`.
2. Écrire `addons/<nom>/addon.json` (table ci-dessus) : prise, code, entrée, TOUS les fichiers, titre fr/en/es.
3. Ajouter `<nom>` à `addons/index.json`. Rien dans `js/` ni `sw.js` ; `scripts/check-addons.js` (pre-commit)
   refuse un dossier non listé, un fichier oublié, un code que la vue 3D n'émet pas ou déjà pris. Un code nouveau
   (autre geste) se code dans la vue 3D, avec l'accord de qui la tient.
4. Dans `lancer()` : les refus de terrain (ci-dessus), l'activation sur installation, puis `KtaVue3D.greffer`.
5. Respecter le cycle de vie (reprise du contexte !) et appeler `ctx.sale()` seulement quand quelque chose bouge.
6. Une section du checkup `scripts/smoke/checkup-vue-3d.js` qui joue l'add-on sur des objets **fictifs** (prévoir un
   objet `essai` pour poser des situations), et sa ligne dans `tracking.md` § Garde-fous.
7. Une partie dans ce fichier (comme `mkmg` ci-dessous).

🩸 **Tester dans une copie séparée** (`git worktree`) : l'arbre principal du poste de KARMA a `data/index.json` en
skip-worktree (ses plans réels) ; le checkup y ouvre un autre plan que le relevé fictif et échoue sans rapport avec
l'add-on.

## Add-on `mkmg` (jeu en vagues)

Fichiers : `js/coeur.js` (partie, interface, chrono, pile, eau, éboulis), `js/monde.js` (menaces, objets, tir,
embuscades, nuages de fumigène, un monde par niveau), `js/son.js`
(sons WebAudio, aucun fichier), `js/joueur.js` (bras et fusil, silhouette en vue d'édition), `css/coeur.css`,
`img/fusil.svg` ; `coeur.js` charge les trois autres. Réglages chiffrés en tête de chaque fichier (`REGLES`).

- **Lancement** : code `bas6`. Refus de terrain et d'installation ci-dessus ; sinon confirmation « Descendre plus
  bas ? » avec la difficulté (`ktaConfirm`, `choix`).
- **Vague** = rejoindre un point B depuis la position de la vue : un POI dont la distance à vol d'oiseau est la plus
  proche de 40 m + 30 m par vague (10 m au moins), le premier joignable par `Pathfinder.computeRoute` (bout du trajet
  à 8 m au plus du POI) ; en dernier recours un sommet des tracés du niveau, sinon le plus proche du voulu, sans
  trajet. B à 2 m : vague suivante, santé, endurance et pile à 100 % (décision produit).
- **B à un autre niveau** (décision produit) : sur un plan multi-niveau (`APP_CONFIG.multiLevel`), dès la vague 1,
  une fois sur 0,4 (`REGLES.autreNiveau.chance`), et toujours quand le niveau où l'on est a moins de 3 POI joignables
  (`minPoi`, comptés sur les candidats triés, arrêt au 3e), B est un POI d'un autre niveau, joint par les jonctions
  (trajet `computeRoute` d'un niveau à l'autre). Ordre d'essai : autre niveau → POI des autres niveaux, puis d'ici,
  puis sommet des tracés ; sinon POI d'ici, puis des autres niveaux, puis sommet des tracés. Vague de gardien, plan
  à un niveau : ce niveau seul. Validé au bout du trajet (la règle du pas d'ici ne vaut rien là-bas), seulement une
  fois à ce niveau ; balise et trajet au sol dessinés au niveau où ils sont.
- **Un monde par niveau, escalier = refuge** (décision produit) : les menaces ne changent pas de niveau. Au passage
  🪜, le monde quitté est rangé tel quel (`monde.js > changerNiveau`, maillages retirés, objets gardés) et repris au
  retour ; un niveau neuf est peuplé à moitié, sans silhouette.
- **Point de validation** (décision produit) : jamais hors de la galerie, ni dans une structure, un remblais, un
  effondrement ou une zone inaccessible — le bout du trajet sur les tracés, puis la place libre la plus proche
  (`monde.js > placeOk` : `ctx.libre` et hors de ces trois zones du niveau ; couronnes de 0,25 m jusqu'à 8 m). La
  balise est posée là. Même règle pour les menaces, les objets et les embuscades. Un POI à plus de 8 m de tout
  tracé (`REGLES.horsTraceM` : le trajet s'accroche au tracé le plus proche, même loin) n'est jamais B ; sans
  aucun trajet, B est un point des tracés plutôt qu'un POI.
- **Difficulté** : facile = tracés + trajet du jeu au sol (ruban doré, chevrons sombres tous les 2 m pointés vers
  B) + balise + flèche + reste à parcourir ; moyen = sans la flèche ; difficile = ni tracés
  (`regler({ traces: false })`), ni trajet, ni balise, ni guidage. L'itinéraire et le guidage de l'app sont masqués
  pendant toute la partie (le jeu dessine le sien). **Recalé** quand on fuit : à plus de 6 m du trajet pendant
  1,5 s, nouveau trajet d'ici à B (au plus toutes les 3 s ; même cible, chrono inchangé ; aussi en difficile, pour
  la tenaille posée sur le trajet).
- **Santé et endurance** : le pas rapide vide l'endurance (22 / s), elle revient au repos (14 / s) ; vide = à bout de
  souffle, pas rapide interdit (`regler({ course: false })`) jusqu'à 30. Battement de cœur (décision produit)
  seulement sous 5 % ou à bout de souffle, de plus en plus lent pendant la reprise.
- **Égarés** (`monde.js`, posés sur les tracés à 15-35 m) : 2 + 2 par vague, 14 au plus et 18 en tout ; 1,6 m/s +
  0,12 par vague, 2,6 au plus, proche de la marche à 2,8 (il faut courir pour décrocher, décision produit) ; à vue
  directe sous 12 m ils foncent, sous 8 m ils **chargent** 2 s à ×1,6 puis soufflent 4 s. Au contact (0,75 m), ils
  **frappent** (égaré, rampant, hurleur) : 0,4 s d'élan, immobiles, bras levés, puis le coup tombe — 12 de santé si
  le joueur est encore au contact, raté s'il s'est écarté — et 0,1 s de pause avant le suivant (24 de santé par
  seconde sans esquive).
- **Silhouette** (décision produit) dès la vague 2 : une seule, invulnérable, figée dans le faisceau (à moins de
  30 m × la lampe, à moins de 32° du cap, rien entre elle et soi) ; lampe à plat, elle ne se fige plus qu'à bout
  portant. Hors faisceau, approche en deux temps : 1,2 m/s de loin, 2,5 m/s sous 10 m, + 0,1 m/s par vague après la
  2 (au plus + 1,2 : 3,7 m/s de près, sous la course du joueur à 7 m/s, au-dessus de sa marche).
  Présence : un grésillement situé sous 25 m, plus fort de près (un toutes les 0,9 à 2,6 s) ; sous 8 m la lampe
  vacille, de plus en plus souvent (même vacillement que la pile faible, les deux s'ajoutent). La fixer coûte : tant
  qu'elle est dans le faisceau, la pile s'use × 2. Au contact : 50 de santé, puis elle repart à 15-25 m. Touchée au
  fusil : elle recule de 12 m le long des tracés en s'éloignant du joueur (carte des distances remontée de nœud en
  nœud, place valide `placeOk` ; un cul-de-sac l'arrête plus tôt ; sans réseau ni place, elle repart à 25-50 m) et
  reste sonnée 3 s, immobile même hors faisceau (son contact blesse toujours).
- **Rampants** dès la vague 3 (1, + 1 toutes les deux vagues, 5 au plus) : à plat ventre, ×1,5 la vitesse des égarés,
  1 point, chargent comme eux. **Hurleurs** dès la vague 5 (1, + 1 toutes les trois vagues, 3 au plus) : ×0,65, 3
  points ; en vue directe à moins de 14 m, ils crient (au plus toutes les 15 s) : les marcheurs à moins de 30 m vont
  ×1,35 pendant 8 s et 2 égarés sortent du noir près d'eux. Les uns et les autres comptent dans le plafond des égarés.
- **Gardien** (vagues 5, 10, 15… ; décision produit) : un égaré massif posé à 3-6 m de B, qu'il garde (y revient à
  plus de 8 m) tant que le joueur n'est pas en vue (12 m) ; vu ou touché, il poursuit (0,9 m/s) et frappe comme
  les égarés, plus lentement et plus lourd : 0,6 s d'élan, 36 de santé, 0,2 s de pause (45 par seconde sans
  esquive, contact à 1 m). 10 points (+ 2 par gardien suivant) ; chaque coup le fait reculer d'un demi-mètre. Tué, il
  lâche un champignon, une caisse de munitions et un fumigène. Sa jauge s'affiche sous les autres tant qu'il vit.
- **Fumigène** (décision produit ; `monde.js > REGLES.fumigene`) : bouton au-dessus de « Rage » (nuage et nombre en
  poche ; à gauche du fusil sur un écran bas) ou touche G (`KeyG`, libre dans l'app ; prise comme R sur `window` en
  capture). Lancé dans l'axe du regard, il tombe à 8 m, ou là où la règle du pas de la vue arrête sa course (pas de
  0,5 m : mur, pilier, paroi), sur la place valide (`placeOk`) la plus loin de cette course, à défaut à ses pieds.
  Nuage de 3 m de rayon, formé aussitôt : **plein 6 s**, puis **2 s de dissipation**. Plein, c'est un **mur pour
  les marcheurs** (égaré, rampant, hurleur, gardien) : aucun pas ne touche le nuage (`_avancer`, avec la règle du pas
  comme en glissement de nœud en nœud loin du joueur) — qui arrive devant s'arrête au bord, qui est dedans quand il
  se forme reste figé ; ni contournement, ni recalcul de la carte des distances. La **silhouette** le traverse, et
  la fumée **coupe le faisceau** : dans le nuage, ou le nuage entre elle et soi (soi dedans compris), elle n'est
  plus vue, donc elle avance (`dansFaisceau`). Pendant la dissipation, le nuage n'est plus qu'un décor qui
  s'éclaircit : plus rien n'est arrêté ni caché (le mur tombe d'un coup à 6 s, pour tous). Le tir, la vue des
  égarés et le cri du hurleur ne sont pas concernés. Stock : 1 au départ, 3 au plus (au-delà, le fumigène reste au
  sol) ; à ramasser : 2 par vague en facile, 1 en moyen et en difficile (`DIFFICULTES.butin.fumigenes`, nombre exact) ;
  le gardien abattu en lâche un. Inactif en fin de partie. Un monde par niveau : les nuages du niveau quitté sont
  abandonnés. Dessin : 9 volutes face à la caméra (une texture aux bords fondus, une matière par nuage), sans
  éclairage de scène — leur clarté suit la lampe et la distance (jusqu'à 22 m) ; refaites après une perte du contexte
  WebGL. Son : lancer, puis choc au sol et sifflement situé.
- **Pile de la lampe** (décision produit) : 100 %, − 0,55 par seconde (× 0,75 en facile, environ 4 min ; × 2 tant
  que la silhouette est dans le faisceau) ; sous 25 %, la lampe baisse
  (`regler({ lampe })`) jusqu'à une lueur de quelques mètres (8 %, jamais le noir) et vacille de plus en plus
  souvent. Piles à ramasser (+45 ; 2 par vague, une de moins toutes les trois, 1 au moins).
- **Eau** : dans une zone `eau` du niveau, le joueur va à 60 % (`regler({ vitesse })`) et éclabousse ; les menaces
  aussi vont à 60 %.
- **Éboulis** : à moins de 15 m d'un effondrement, un éboulis toutes les 8 à 20 s, situé, qui couvre grognements
  et pas pendant 2,5 s.
- **Chrono** (décision produit) : longueur du trajet vers B à 1,4 m/s (+ 0,08 par vague, 2,4 au plus) plus une marge
  de 30 s (− 2 par vague, 10 au moins) ; rouge sous 10 s. À 0 : − 25 de santé et **horde** (6 + 1 par vague, en 3
  groupes à 12 m) ; la vague continue.
- **Tenaille** (décision produit) : un groupe devant SUR le trajet du jeu (18 m), un autre derrière (15 m sur le
  trajet, sinon dans le dos), 2 + 1 toutes les deux vagues chacun (`surgir`, au-delà du plafond de 8 au plus) ; une
  fois par vague à mi-parcours, et au hasard dès la vague 3 (40 à 70 s, de plus en plus souvent).
- **Viseur à la souris** (PC) : un clic sur la scène capture la souris (Pointer Lock) ; elle tourne la vue sans
  bouton enfoncé, le clic gauche tire, Échap la rend (sans fermer la vue). Sans toucher à la vue 3D : la souris
  capturée lui rejoue un glisser du doigt (événements synthétiques sur la scène) ; les vrais événements de souris
  sur la scène sont arrêtés en capture pendant la partie. Capture refusée 3 fois de suite : glisser pour regarder,
  clic bref pour tirer. Souris rendue en fin de partie et en quittant.
- **Fusil à pompe** (bouton en bas à droite, Espace, clic gauche de la souris capturée) : la menace la plus
  proche dans l'axe (6° ou le gabarit du corps), à 18 m au plus, ligne de vue libre ; un égaré a 2 points, un coup à
  8 m ou moins en ôte 2 ; la silhouette touchée recule et reste sonnée. Recharge automatique de 1,5 s ; départ 2 + 6 cartouches. Son : détonation grave puis coup de pompe (pas en rage).
- **Rage** (décision produit) : prête après 20 égarés tués hors rage (compteur sur le petit bouton au-dessus du
  fusil, à sa gauche sur un écran bas où il touchait « Quitter » ; puis « Rage » qui pulse ; le bouton du fumigène est
  juste au-dessus de lui) ; bouton ou touche R : toute la santé rendue, 30 s de tir automatique tant que
  la détente est tenue (bouton, clic gauche capturé, Espace ; un coup toutes les 110 ms), cartouches non comptées, chargeur de 25 puis
  recharge de 1,5 s ; endurance sans fin, dégâts reçus ÷ 2 (`REGLES.rage.degatsX`), halo rouge au bord de l'écran.
  Les égarés tués pendant la rage ne chargent pas la suivante.
- **À ramasser** à moins d'1 m : munitions (+4 ; 4 par vague, une de moins toutes les deux vagues, 1 au moins), piles,
  fumigènes (ci-dessus),
  champignons (+30 santé ; 3, un de moins toutes les trois vagues, au bout des culs-de-sac de préférence). Butin selon
  la difficulté (décision produit, `coeur.js > DIFFICULTES.butin`) : facile = quantités × 2, au moins 2 de chaque,
  un égaré tué lâche un champignon une fois sur deux et une caisse une fois sur cinq ; moyen = × 1,5, champignon une
  fois sur quatre ; difficile = quantités de base, champignon une fois sur quatre.
- **Joueur** (`joueur.js`) : à hauteur d'yeux, deux bras et un fusil en formes simples accrochés à `ctx.camera`, en
  couleurs fixes non éclairées (la lampe, collée à la caméra, les délavait) et dessinés par-dessus la scène (sans
  test de profondeur, ordre de rendu fixé) ; balancement, recul et éclair au tir. En vue d'édition : silhouette
  verte armée, celle de la vue masquée (`regler({ avatar: false })`) — gardée, mais la partie interdit la vue
  d'édition (`regler({ plongee: false })`, décision produit : voir d'en haut serait tricher). Pas de fiche au
  toucher pendant la partie (`regler({ fiches: false })`) : un tir au doigt ouvrirait celle d'un pilier ou d'un POI.
- **Interface** : santé, endurance et lampe (pile) en haut à gauche ; panneau en haut à droite réductible (▾ / ▸,
  retenu sous `myktamap_mkmg_panneau_v1`) : vague, chrono et guidage toujours là ; objectif, statistiques (égarés tués, balles
  tirées, balles au but) et « Quitter » repliés ; cartouches sur le bouton de tir. Fin de partie (santé à 0) :
  vague atteinte et vagues réussies, meilleure vague par difficulté, puis le bilan de la partie — précision (balles
  au but / tirées, « aucun tir » sinon), égarés tués, durée (m:ss) ; « Rejouer » ou « Quitter », joystick et pavé
  retirés le temps de toucher la carte (`regler({ commandes: false })`). ⚠️ contrat : `myktamap_mkmg_v1` ne retient
  que `{ <difficulté>: meilleure vague }` (nombres), forme lue par toute version du jeu ; le bilan est affiché, pas
  retenu.
- **Performance** (plan dense, iPhone) : menaces pensées à 15 Hz ; hors de vue directe elles descendent une **carte
  des distances** au joueur (Dijkstra sur `RoadGraph.getGraph`, refait au plus chaque seconde et s'il a bougé de
  2 m), une seule pour toutes — un `Pathfinder.computeRoute` par égaré reconstruisait tout le réseau ; règle du pas à
  moins de 25 m ; 30 images/s au plus (`ctx.sale` espacé de 33 ms) ; éclair du tir sur le calque, pas en lumière.
- **Son** (`son.js`, WebAudio, aucun fichier) : démarré dans le geste qui lance la partie ; 🩸 iOS le suspend sur une
  interruption (notification, appel, écran verrouillé) et ne le rend que dans un geste : `reveiller()` à chaque
  `pointerdown` / `keydown` et au retour à l'écran. Arrêt d'une partie : suspension différée de 1,5 s, sinon
  « Rejouer » (arrêt puis démarrage) laissait la nouvelle partie muette sur Safari. Sons **situés** : grognements,
  pas (les deux plus proches à moins de 6 m, un sur trois sauté), cris, grésillement de la silhouette et éboulis
  viennent de leur direction
  (panoramique gauche / droite, étouffés quand ils viennent de derrière ; au centre sans `StereoPanner`). Fond :
  gouttes (« plic » qui monte, puis écho ; toutes les 4 à 11 s) et éboulis lointains au hasard ; pas de bruit de
  respiration ni d'essoufflement (décision produit : seul le cœur bat à bout de souffle). 🩸 Rien ne revient à intervalle fixe : un
  son régulier se lit comme un bip ou un métronome.
- **Checkup** : `checkup-vue-3d.js` § 21 (prise, code) et § 23 (jeu, avec `KtaAddons.mkmg.essai` : `vider`, `poser`,
  `sante`, `chrono`, `tenaille`, `pile`, `viser`, `rage`, `rageFin`, `vague` ; `poser` accepte `rampant`, `hurleur`,
  `gardien`, `silhouette`, `pile`, `fumigene` ; `fumigenes` règle le stock, `nuage` pose un nuage), § 23 bis (page à
  part, `KTA_V3D_SEUL=mkmg` : silhouette — deux allures, vitesse par vague, lampe qui vacille, pile × 2, recul et
  sonnée au tir, contact, grésillement situé ; fumigène — lancer à 8 m ou contre une paroi, stock, mur au bord du
  nuage avec et sans la règle du pas, figé dedans, silhouette qui traverse hors faisceau, dissipation, ramassage,
  gardien, reprise du contexte WebGL, fin de partie ; coups portés — élan sans dégât, coup, cadence, esquive,
  gardien ; écran de fin — précision, égarés tués, durée, partie sans tir, scores d'une ancienne partie gardés
  tels quels) et § 58 (B à un autre niveau, `=mkmgniveaux`). Non joués par le
  checkup : passage de niveau en cours de partie (monde rangé, refuge, nuages abandonnés), recul de la silhouette
  dans un cul-de-sac ou sans place (repli à 25-50 m), nuage dans une salle large (marcheur arrêté au bord, sans
  contournement), rendu sonore et visuel (geste des bras compris).

## À donner à une IA (résumé à coller)

> Tu écris un add-on pour MyKTAMap (PWA vanilla JS + Leaflet + three.js, sans bundler, CSP `script-src 'self'`).
> Lis `docs/architecture/addons.md` en entier. Un add-on vit dans `addons/<nom>/`, s'inscrit dans
> `window.KtaAddons.<nom> = { lancer }`, se déclare dans `addons/<nom>/addon.json` (+ `addons/index.json`), est lancé
> par un code de la vue 3D déclaré dans ce manifeste et se greffe
> par `KtaVue3D.greffer({ scene, surImage, demonter })` : il dessine dans `ctx.groupe` (mètres) et `ctx.hud`, se
> déplace avec `ctx.bloque` / `ctx.libre`, demande une image par `ctx.sale()`, règle la vue par `ctx.regler(…)`.
> Il lit le plan en lecture seule (POI, tracés, zones, `Pathfinder`, `RoadGraph`) et n'écrit jamais la session, le
> tracker, les filtres ni `data/`. Pas de réseau, pas de script en ligne, pas d'`alert`, couleurs CSS en
> `var(--kta-…)`, textes fr/en/es dans son code, clés locales `myktamap_<nom>_…`, chaque fichier dans
> `sw.js > ASSETS_TO_CACHE`. Refus pendant le suivi du tracker, une sortie d'urgence ou le Secours ; sur une
> installation reliée, seulement si `KtaInstance.etat().reglages.addons.<nom> === true`. Reprise du contexte WebGL :
> tout refaire sans `dispose()`. Tests : une section de `scripts/smoke/checkup-vue-3d.js` sur objets fictifs, dans
> une copie de travail séparée.
