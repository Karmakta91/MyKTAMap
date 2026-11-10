# 📋 Backlog — MyKTAMap

> Fichier de travail KARMA ↔ Claude : **seulement le travail ouvert**, rangé par horizon. Pas un journal (`README.md`
> et les commits le sont) : une entrée soldée est **supprimée**, pas barrée (`git log -p docs/BACKLOG.md`).
> Ailleurs : les pistes et leur déclencheur → `docs/IDEES.md` ; les sujets enterrés, acceptés, les leçons et les
> décisions closes → `docs/DECISIONS_FERMEES.md` (à lire avant de reproposer un sujet).

## Avant de traiter une entrée

- **Vérifier avant d'agir.** Un inventaire sourcé depuis la doc s'est révélé **faux à 30 %** : une entrée ancienne
  pose une limite qu'une entrée plus récente lève. Niveau de preuve dans le corps : ✅ **vérifié** dans le code
  (date), ⚠️ **doc seule**, 🔬 **hypothèse**. Avant d'agir : `grep` le symbole dans `js/`, vérifier `index.html`
  et `sw.js > ASSETS_TO_CACHE`. Dans les deux sens : une entrée soldée qui traîne fait reproposer un chantier fait.
  **Reclore le jour même.**
- **Tester sur appareil APRÈS un bump** : un téléphone garde l'ancien JS jusqu'au changement de `CACHE_NAME`. La
  validation iOS/Safari d'un changement de rendu vit dans `docs/RELEASE_GATE.md`.
- **Format** (lu par `scripts/check-backlog.js`, avertissement au pre-commit, et par la vue du backlog) :
  - sections, dans cet ordre : `## Maintenant` (**10 entrées au plus**), `## Ensuite`, `## Plus tard`,
    `## Entrant` (demandes reçues pendant un lot, triées au point suivant) ; ce préambule ne porte que des règles ;
  - une entrée = une puce `- **Titre** — corps`, **3 lignes au plus** (au-delà : un lien vers l'étude ou la doc),
    puis ses métadonnées en un seul bloc entre accents graves (sur une ou plusieurs lignes), champs séparés par
    ` · ` : `qui: Claude · action: … · fini: … · depuis: 20/10/2026 · taille: S` ;
  - `qui` = qui fait la **prochaine** action (`KARMA` | `Claude`) · `action` = cette action, concrète ·
    `fini` = critère de fin vérifiable · `depuis` = date d'ouverture JJ/MM/AAAA, jamais réécrite au ménage ·
    `taille` = `XS` | `S` | `M` | `L` ; facultatif : `lot` (branche du lot en vol). Aucun accent grave dans
    une valeur ;
  - dans `## Entrant`, les métadonnées sont facultatives : le tri les pose.

## Maintenant

- **Essai sur dev : Secours sur plusieurs niveaux et échelle du Générateur** — `e79e3371` : secteur sur plusieurs
  niveaux (équipe « tous niveaux », POI de la zone à chaque niveau) ; `508fc41a` : « Mettre à jour le plan » reprend
  l'échelle recalibrée dans l'app et le dit (garde-fou `check-maj-plan.js`). Ni l'un ni l'autre joué à la main.
  `qui: KARMA · action: un secteur à 2 niveaux en Secours ; recalibrer puis mettre à jour un plan au Générateur
  · fini: vus conformes, ou bugs ouverts · depuis: 29/10/2026 · taille: XS`
- **`_currentLoadedPlanId` à l'accueil : scénario pro** — community fait : id remis à null au retour à l'accueil, plan
  quitté dans `_ktaDernierPlanId` (carte OSM), prouvé par `smoke.js` sous Chromium et WebKit. Reste à prouver côté pro :
  plus de présence ni d'itinéraire du plan quitté, « Rejoindre » qui rouvre le plan.
  `qui: Claude · action: scénario pro de retour à l'accueil, après le lot tests-fiables du pro
  · fini: scénario vert · depuis: 26/10/2026 · taille: S`
- **Test WebKit « fondu −1 » instable** — `checkup-vue-3d.js` : 1 KO par intermittence sous charge, vu aussi sur la
  base `f62ec4d1` ; 🔬 test instable plutôt que régression. Bloquerait la porte de release.
  `qui: Claude · action: trouver ce qui dépend du temps dans le contrôle du fondu et le rendre déterministe
  · fini: 5 passages WebKit verts de suite · depuis: 03/11/2026 · taille: S`

- **Test appareil : Mode Secours sur iPhone** — « Suivre mon parcours » (permission des capteurs dans le geste),
  recalage à la validation d'une étape (question au-delà de 30 m), écran XL avec un long itinéraire, « Retour
  impératif ».
  `qui: KARMA · action: jouer les 4 gestes sur iPhone · fini: 4 gestes vus conformes, ou bugs ouverts
  · depuis: 30/09/2026 · taille: S`
- **Test appareil : export KMZ « Très nette »** — « Nette » validé sur iPhone ; « Très nette » (16 images) jamais
  essayé.
  `qui: KARMA · action: exporter en « Très nette » et ouvrir dans Google Earth · fini: KMZ ouvert, ou bug ouvert
  · depuis: 15/10/2026 · taille: XS`
- **Test appareil : photos et export** — réimport d'une session ZIP ; refus au-delà de 5 photos ; analyse d'un gros
  plan depuis l'accueil (Safari ≥ 16.4) ; export image d'un plan tuilé hors-ligne.
  `qui: KARMA · action: jouer les 4 cas sur iPhone · fini: 4 cas vus conformes, ou bugs ouverts · depuis: 12/10/2026
  · taille: S`
## Ensuite

- **Aide ❓ de la vue 3D : accès et niches** — ✅ vérifié 04/11 : l'Aide cite le cavage mais ni les accès comblés ni
  l'escalier en niche (le guide, lui, les liste).
  `qui: Claude · action: compléter la section dans les 3 langues · fini: section à jour, check-i18n vert
  · depuis: 03/11/2026 · taille: XS`
- **Noms réels restants** — 🟡 le nom du département est neutralisé (`check-noms-reels.js`) ; d'autres noms de lieu ou
  de plan réels restent dans `README.md`, des commentaires `js/` et `docs/architecture/`. Liste remise hors dépôt.
  `qui: KARMA · action: trancher nom par nom sur la liste hors dépôt · fini: chaque nom remplacé ou gardé par décision
  · depuis: 05/10/2026 · taille: S`
- **Course i18n au démarrage sous WebKit** — ✅ vu 04/11 : sous WebKit, `checkup-guidage.js` tombe parfois sur
  `[I18n] Clé manquante : "home.profile.stats.storageTitle"`, alors que la clé existe ; l'appel vient de
  `homeProfile.js`, lancé avant que le dico soit prêt. Rend la porte de release aléatoire.
  `qui: Claude · action: rendre l'appel de homeProfile.js déterministe (attendre I18n prêt) · fini: checkup-guidage
  vert sous WebKit sur plusieurs passages, sans clé manquante · depuis: 04/11/2026 · taille: S`
- **Retirer l'image de collision** — ✅ vérifié 09/11 : retrait décidé le 08/09 (audit serveur, P1a), jamais fait ; le
  Générateur la propose encore, l'app la charge (`map.js > initCollisionMap`). Lot A puis B : `audit-serveur-2026-09.md`
  § Nettoyage code collision. Après le gel du bump (choix KARMA 09/11).
  `qui: Claude · action: lot A (Générateur, chargement, précache, clé i18n) puis lot B (code du tracker,
  check-tracking-defaults) · fini: plus de collisionImage écrite ni lue, tracker vert · depuis: 09/11/2026 · taille: M`
## Plus tard

- **AI_CONTEXT : remplacer les ~540 emoji de bouton par le nom du bouton dans tout le fichier** — le lexique en tête
  (généré par `check-lexique-icones.js`) suffit en attendant ; une fois les noms écrits, le lexique ne garde que
  les emoji restés.
  `qui: Claude · action: réécrire les citations de bouton d'AI_CONTEXT.md par leur nom, lexique régénéré
  · fini: classerDoc ne relève plus d'emoji de bouton hors lexique · depuis: 09/11/2026 · taille: M`
- **Vue 3D, puits ouvert : galerie du dessus qui coupe le conduit** — une galerie du dessus qui ne couvre qu'une
  partie de l'emprise du puits coupe le conduit (les parois de tube des voisins ne lisent pas le gabarit) — rare, pas
  vu sur plan réel. ✅ vérifié 09/11/2026 : `js/vue3d.js > _sommetPlafond` (🩸).
  `qui: Claude · action: couper les parois de tube des voisins sur l'emprise d'un conduit (bit GABARIT.conduit)
  · fini: checkup § 56 étendu à une galerie à cheval sur l'emprise, vert · depuis: 09/11/2026 · taille: S`
- **Vue 3D, puits ouvert : disque de ciel coupé vu en biais** — regardé de biais depuis le fond ou depuis un niveau
  traversé, le disque de ciel du sommet est coupé net par un bord vertical (même sprite que le puits sur son niveau).
  🔬 vu en capture sur plan réel le 09/11/2026, cause non cherchée.
  `qui: Claude · action: trouver ce qui tranche le sprite (gabarit, plan de coupe, taille) et le corriger
  · fini: capture en biais sans bord net, checkup § 56 vert · depuis: 09/11/2026 · taille: S`
- **Téléchargement de fichier commun, repli partage iPhone** — une vingtaine de modules recopient le même lien Blob
  + `download` (secoursMode, sessionExporter, refonteInterface…), aucun ne passe par `navigator.share` sur iOS, où le
  lien d'un Blob est capricieux dans la PWA installée. ✅ vérifié 09/11/2026 (grep) ; modèle : `js/debug.js`.
  `qui: Claude · action: une fonction commune (Blob, download, partage iOS) et y passer les exports
  · fini: plus de copie du motif, exports testés Chromium et WebKit · depuis: 09/11/2026 · taille: M`
- **iPad portrait : canvas de la carte au-delà de la limite de Safari** — marge du renderer 0,5 × écran × densité 2 :
  ~22 M px réels carte droite, au-delà des 16,8 M px d'un canvas Safari (tracés, zones, structures non peints ou
  onglet tué). 🔬 calcul du lot rotation-memoire (09/11/2026), pas vu sur un vrai iPad.
  `qui: KARMA · action: ouvrir un gros plan sur iPad en portrait et dire si tracés et structures s'affichent
  · fini: vu sur iPad ; si défaut, budget du canvas carte droite (mapBearing.js > _paddingBudget)
  · depuis: 09/11/2026 · taille: S`
- **Calque : copie jamais retouchée contre trace de copie** — deux appareils hors ligne qui passent le même calque
  en modification gardent des copies concurrentes (le plus récent gagne). Règle à la réception, cf
  `docs/architecture/session-data.md` (limites de « Repasser en modification »).
  `qui: Claude · action: marquer la date de l'objet du fichier sur chaque copie, la trace l'emporte sur une copie
  intacte · fini: scénario deux appareils hors ligne vert · depuis: 08/11/2026 · taille: M`
- **Calque d'origine sur un appareil neuf** — toutes les copies supprimées ailleurs : il ne reçoit que des traces,
  voit le calque d'origine tant qu'il n'a pas cliqué « Modifier » (qui donne alors un calque vide).
  `qui: Claude · action: masquer le calque si des traces de copie le vident (vérification asynchrone du fichier)
  · fini: appareil neuf sans calque fantôme · depuis: 08/11/2026 · taille: S`
- **⏪ du niveau en lot et liaisons des portails** — le niveau en lot fait suivre la liaison d'un portail
  (`InterPlanLinks.onPointLevelChanged`), mais ⏪ ne la remet pas à l'ancien niveau (point remis, liaison non).
  `qui: Claude · action: inclure les instantanés de liaison dans l'entrée d'historique du lot · fini: ⏪ remet point
  et liaison, check-selection-multi le prouve · depuis: 08/11/2026 · taille: S`
- **`security.txt` à renouveler** — ici et dans `MyKTAMap-doc/racine-publique/` (RFC 9116), expire le 22/10/2027 : périmé
  compte comme absent pour les outils de réputation.
  `qui: Claude · action: repousser Expires d'un an (moins d'un an d'avance) · fini: fichier servi, date à jour
  · depuis: 23/10/2026 · taille: XS`
- **Sonar : jetons à régénérer** — ils expirent vers le 06/01/2027 : au-delà, `sonar-scan.ps1` sort en code 1 et
  `merge-main.ps1` demande `DEROGE`.
  `qui: KARMA · action: régénérer un Project Analysis Token avant le 06/01/2027
  · fini: scan Sonar vert avec le nouveau jeton · depuis: 09/10/2026 · taille: XS`
- **Échelle typographique** — ✅ vérifié 20/10 : ~35 tailles de texte dans `css/` ; 11 / 11,5 / 12 / 12,5 / 13 px se
  suivent à moins de 5 %. Reste de l'audit d'interface (M1) : 6 rôles proposés (11 méta, 12,5 libellé, 14 corps,
  15 lecture, 18 titre de fenêtre, 24 titre d'écran), plancher de 11 px pour tout texte cliquable.
  `qui: Claude · action: proposer en QCM les jetons de taille et l'ordre des écrans, puis les poser écran par écran
  · fini: tailles en jetons, plus aucune valeur hors échelle dans css/ · depuis: 20/10/2026 · taille: L`
- **Thème clair : nettoyer les surcharges historiques** — ✅ vérifié 10/11 : 1 792 → 1 001 sélecteurs
  `.kta-theme-light` (`scripts/smoke/releve-theme.js`, `docs/architecture/ui.md` §53.3). Restent surtout
  des règles qu'aucun écran relevé n'atteint (Vue OSM, instance à mot de passe, sous-fenêtres profondes).
  `qui: Claude · action: étendre le relevé aux écrans non couverts puis retirer ce qu'il prouve mort
  · fini: plus de surcharge claire de couleur là où un jeton existe · depuis: 20/10/2026 · taille: L`
- **Add-on mkmg : interrupteur par organisation (pro)** — aujourd'hui refusé sur une installation reliée, sauf
  `data/reglages.json > addons.mkmg` posé par l'hébergeur (toute l'installation) ; décision : un admin d'orga
  l'allume. Prise neutre côté community, réglage et case d'admin côté pro.
  `qui: KARMA · action: dire si un client le demande · fini: case d'admin, prise testée avec et sans pro
  · depuis: 02/11/2026 · taille: M`

- **Plan au sol net sur un grand plan** — ✅ mesuré 04/11 : une texture de 1024 px pour ~100 m de sol, floue de près ;
  piste : ne couvrir que la partie visible, plus fine.
  `qui: Claude · action: texture limitée au champ visible, mémoire mesurée en iPhone émulé · fini: lisible de près,
  mémoire tenue · depuis: 04/11/2026 · taille: S`
- **Recalcul d'itinéraire sans à-coup** — ✅ mesuré 04/11 : en 3D libre, le calcul du chemin fige une image de
  ~0,3 s au téléphone émulé (accepté par KARMA) ; piste : calcul hors du fil principal (worker).
  `qui: KARMA · action: dire si l'à-coup gêne sur iPhone · fini: décision prise · depuis: 04/11/2026 · taille: M`
- **Multi-niveau en 3D, lot E : épaisseur de plancher** — sur niveaux entremêlés, le sol d'un niveau qui surplombe le
  vide d'un autre est une surface sans épaisseur (il « flotte ») ; idée : dalle d'épaisseur fixe, sans valeur à saisir.
  `qui: KARMA · action: juger le rendu après le lot D · fini: dalle ajoutée ou idée close · depuis: 08/11/2026 · taille: S`

## Entrant

- **Accueil pro lent : splash bloquant et connexions IndexedDB** — audit pro
  `MyKTAMap-pro/docs/audits/2026-11-06_audit-accueil-chiffre-v1.md` : `main.js` attend la fin de l'animation du
  splash (~4 s) avant la porte du pro ; `planRegistry.js > _openIDB` ouvre une connexion à chaque appel, jamais fermée.
  `qui: KARMA · action: dire si la porte du pro peut partir pendant l'animation (décision splash) · depuis: 06/11/2026
  · taille: S`
- **Rotation 2D : redessin inutile et geste lourd** — enquête du 06/11 (plantage non reproduit) : `mapBearing.js >
  _majPaddingUnRenderer` vide et redessine le canvas des vecteurs 2 fois par rotation sans changement (mémoire qui monte
  sous WebKit) ; au téléphone, ~1 500 couches de POI + `--kta-bearing` sur toute la carte figent le geste (jusqu'à 1,7 s).
  `qui: Claude · action: a) supprimer le redessin inutile (risque faible) ; b) et c) en QCM · depuis: 06/11/2026
  · taille: S`
- **`checkup-ultra-traces-plan.js` impossible sur le relevé fictif** — il attend plus de 20 tracés de calque : rouge
  (délai) sur la base comme sur le lot fuite-calques-2d.
  `qui: Claude · action: l'adapter au relevé fictif ou le documenter comme checkup sur plan réel · depuis: 06/11/2026
  · taille: XS`
- **Mode « strict » des jonctions, par plan** — la règle stricte du 05/11 n'a pas réglé l'itinéraire de KARMA qui
  traverse un mur. Idée KARMA : tolérance 0, deux tracés qui ne se touchent pas = réseau coupé (seuls sommets partagés
  et croisements exacts). ⚠️ D'abord vérifier si le trajet suit un VRAI tracé à travers le mur (le strict n'y peut rien).
  `qui: Claude · action: rejouer l'itinéraire réel, puis topo (réglage Générateur + par plan, Raccords à vérifier)
  · depuis: 06/11/2026 · taille: S`
- **Point précis à l'export image / PDF** — pointillé doré + carré (chatière : trait début→fin) dessinés par l'export
  comme sur la carte. Recos du topo 06/11 : export avancé et PDF, case « 🎯 Points précis » cochée, sans le seuil de
  zoom, ligne de légende ; KMZ / GPX / GeoJSON inchangés (icône).
  `qui: KARMA · action: valider les 4 recos du topo · fini: décision prise · depuis: 06/11/2026 · taille: S`
- **Multi-niveau en 3D : lots A à D livrés, choix du lot D à valider** — QCM 07 et 08/11 (ETUDE_VUE_3D.md) : D =
  union des vides, collision par tranche, zone jonction en pente, structures en pente (branche `niveaux-entremeles`).
  Joué en émulation seulement ; lot E (épaisseur de plancher) seulement si KARMA le veut.
  `qui: KARMA · action: valider les choix du lot D, le jouer au téléphone, dire si un lot E est voulu · fini: choix
  validés, lot E ouvert ou écarté · depuis: 06/11/2026 · taille: S`
- **Essai sur dev : lots du 05/11 sur téléphone** — prouvés en émulation seulement : ＋ / 🗑️ des sommets (2D, 3D),
  gestes 3D à deux doigts, colonne d'outils en paysage, plan au sol d'un plan transparent, ruban d'itinéraire 3D,
  « Hors du plan » en 3D, et un 1er « 🔗 Raccorder » sur un tracé de CALQUE (chemin jamais testé automatiquement).
  `qui: KARMA · action: après /killsw.html, jouer ces gestes sur iPhone et au PC · fini: vus conformes, ou bugs ouverts
  · depuis: 05/11/2026 · taille: S`
- **Seuils des jonctions en mètres** — règle stricte en px plan (bouts 15 px, sommets intérieurs 3 px) : sur un plan
  détaillé, un écart de moins d'un mètre coupe le réseau. Piste : intérieurs à 1 m (plancher 3 px), bouts à 3 m
  (plancher 8 px). Deux plans réels testés sont bien raccordés : on attend les essais de KARMA.
  `qui: KARMA · action: dire si des plans restent coupés après « Raccords à vérifier » · fini: décision prise
  · depuis: 05/11/2026 · taille: S`
- **Jonctions qui traversent un mur dessiné** — ✅ vu 05/11 (code) : les liens de jonction imparfaite
  (pathfinder.js > _enrichirGrapheAvecCroisements) ne testent ni les murs en ligne ni les zones inaccessibles, qui
  ne bloquent que le long des tracés.
  `qui: Claude · action: refuser un lien qui croise un obstacle dur, checkup · fini: lien coupé par un mur ligne
  fictif, itinéraire qui contourne · depuis: 05/11/2026 · taille: S`

- **Essai Android : boussole et plan orienté** — le Chromium récent du harnais n'accorde pas les capteurs hors geste
  (checkup-plan-oriente : capteurs accordés au test, vert le 07/11). 🔬 un Chrome Android récent pourrait demander
  la permission : l'app la demande dans le geste (« J'ai compris »), jamais vérifié sur un vrai Android.
  `qui: KARMA · action: sur un Android, boussole et plan orienté tournent · fini: vu conforme, ou correctif ·
  depuis: 04/11/2026 · taille: S`
- **Générateur : rendu 3D par défaut du plan** — demande KARMA 04/11 : choisir à la génération le rendu de la vue 3D
  par défaut (Mixte / Structures / Galerie), au lieu de Mixte pour tous ; le choix de l'utilisateur, retenu par plan
  (`setPlanRenduVue3D`), reste prioritaire. À faire après les lots du 04/11.
  `qui: Claude · action: champ du Générateur (createConf.js) + lecture par vue3d.js > _renduVoulu · fini: plan généré en
  Galerie qui s'ouvre en Galerie, checkup · depuis: 04/11/2026 · taille: S`
- **Désactiver un type par défaut (tracé, zone, structure)** — un utilisateur qui ne veut pas voir « Route
  principale » ou la zone « Remblais » dans sa légende et ses choix de dessin. ⚠️ La légende sait déjà masquer un type
  (`hidden`, `LegendCustomization.setSessionVisibility`) : vérifier ce que ça retire vraiment avant de proposer.
  `qui: Claude · action: topo (ce que masque hidden aujourd'hui, ce qui manque) · depuis: 01/11/2026 · taille: S`

- **« -pro » du splash au tout premier lancement pro** — le suffixe dépend de `.kta-instance-pro`, posée d'emblée si la
  licence serveur est en cache ; au premier lancement d'un appareil elle arrive peut-être après la fin du splash.
  🔬 hypothèse, non vérifiée.
  `qui: KARMA · action: première ouverture de pro.myktamap.fr en navigation privée, dire si « -pro » apparaît
  · depuis: 30/10/2026 · taille: XS`
- **Objet supprimé qui reste affiché** — vu en pro (26/10) : objet de session venant d'un calque copié dans la
  session, supprimé depuis sa fiche, organisation chiffrée, souvent le PREMIER supprimé ; disparaît au rechargement
  du plan (donnée supprimée, affichage pas rafraîchi). 🔬 non reproduit.
  `qui: Claude · action: scénario pro sur la pile (calque copié en session, 1re suppression depuis la fiche, chiffré)
  · fini: reproduit puis corrigé · depuis: 20/10/2026 · taille: S`

