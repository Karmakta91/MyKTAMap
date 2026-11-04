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
- **Test appareil : écran Bienvenue et iPhone** — en navigation privée, téléphone et PC : tracker du puits, 🚨,
  liens de documentation, conditions après « Entrer » (Chrome mobile en portrait), installation à mot de passe ;
  sur iPhone, date de constat modifiable à la CRÉATION d'un POI danger (`3b06dad4`, non reproductible hors iPhone).
  `qui: KARMA · action: jouer ces écrans sur dev puis en prod · fini: vus conformes, ou bugs ouverts
  · depuis: 26/10/2026 · taille: XS`
- **Essai sur dev : corrections de la vue 3D du 03/11** — escalier en niche contre la paroi (`c374a771`), bassin
  enfoncé dans sa paroi, puits d'extraction à 2,5 m (`f62ec4d1`), liaison supprimée par « 🔄 Modifier » absente de la
  3D et de l'itinéraire (`3240e977`). Prouvé par les checkups, pas à la main.
  `qui: KARMA · action: après /killsw.html, escalier en milieu de galerie et en boucle, bassin, puits d'extraction,
  liaison supprimée par Modifier · fini: vus conformes, ou bugs ouverts · depuis: 03/11/2026 · taille: XS`
- **Test WebKit « fondu −1 » instable** — `checkup-vue-3d.js` : 1 KO par intermittence sous charge, vu aussi sur la
  base `f62ec4d1` ; 🔬 test instable plutôt que régression. Bloquerait la porte de release.
  `qui: Claude · action: trouver ce qui dépend du temps dans le contrôle du fondu et le rendre déterministe
  · fini: 5 passages WebKit verts de suite · depuis: 03/11/2026 · taille: S`

- **Test appareil : ouverture de plans sur iPhone** — plus de clics répétés ; si le journal montre souvent « copie
  gardée relue », quelque chose réécrit encore les copies.
  `qui: KARMA · action: ouvrir plusieurs plans puis envoyer le journal · fini: journal lu, aucune réécriture en boucle
  · depuis: 14/10/2026 · taille: XS`
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
- **Test appareil : add-on mkmg sur iPhone et plan dense** — perf (carte des distances, 30 images/s) jamais mesurée
  sur un vrai téléphone ; difficulté (égarés, chrono, tenailles), bras et fusil, panneau réductible à juger en jouant
  (`docs/architecture/addons.md`).
  `qui: KARMA · action: jouer plusieurs vagues sur iPhone, plan dense, avec et sans 🧱 Textures · fini: perf et
  réglages validés, ou chiffres à ajuster transmis · depuis: 02/11/2026 · taille: S`
## Ensuite

- **PR Dependabot en attente** — montées faites à la main le 23/10 (`eac7a077` : setup-node v7, docker/* v4-v7,
  Playwright 1.64.1) : les 8 PR doivent se fermer seules au prochain passage de Dependabot.
  `qui: KARMA · action: CI verte, puis vérifier l'onglet Pull requests (fermer à la main ce qui resterait)
  · fini: 0 PR Dependabot ouverte · depuis: 20/10/2026 · taille: XS`
- **Aide ❓ de la vue 3D : accès et niches** — `aide.sec.vue-3d.html` (`lang/fr,en,es`) ne dit rien des accès sans
  passage (fermés, comblés, bassin, cavage) ni de l'escalier en niche.
  `qui: Claude · action: compléter la section dans les 3 langues · fini: section à jour, check-i18n vert
  · depuis: 03/11/2026 · taille: XS`
- **Test appareil : lockout temporisé** — PIN et gate : 5 codes faux → compte à rebours → retour du pavé
  (`security-legal.md` §36.3).
  `qui: KARMA · action: jouer le parcours sur un téléphone · fini: parcours vu conforme, ou bug ouvert
  · depuis: 13/09/2026 · taille: XS`
- **Test appareil : chiffres du guide** — repris sans vérification : stockage par appareil (~50 Mo Safari, ~1 Go app
  installée), chemin d'installation sur Chrome Android.
  `qui: KARMA · action: relever les deux chiffres et le chemin sur appareil
  · fini: guide confirmé ou corrigé dans les 3 langues · depuis: 14/10/2026 · taille: XS`
- **Données des plans (DATA, KARMA seul)** — taguer les vrais accès (`entree_plan`), donner un niveau aux POI d'accès
  et aux tracés sans niveau, 3ᵉ point de calage GPS ; régénérer les plans d'avant v1.97.9 (pas d'`iconsEmbarquees` →
  21 sondes 404).
  `qui: KARMA · action: reprendre les plans dans le Générateur · fini: accès tagués, plans régénérés (0 sonde 404)
  · depuis: 13/09/2026 · taille: M`
- **Noms réels restants** — 🟡 le nom du département est neutralisé (`check-noms-reels.js`) ; d'autres noms de lieu ou
  de plan réels restent dans `README.md`, des commentaires `js/` et `docs/architecture/`. Liste remise hors dépôt.
  `qui: KARMA · action: trancher nom par nom sur la liste hors dépôt · fini: chaque nom remplacé ou gardé par décision
  · depuis: 05/10/2026 · taille: S`
- **Add-on mkmg : phrase des guides au bump** — décision KARMA : une phrase discrète en dernière ligne de la section
  Vue 3D des 3 guides (fr/en/es), pas dans l'Aide ; écrite au bump de la prod qui livre le jeu, une fois le jeu
  validé (texte retenu dans la mémoire du poste).
  `qui: Claude · action: l'écrire dans les 3 guides au commit de bump · fini: phrase présente dans README_USER{,.en,.es}
  · depuis: 02/11/2026 · taille: XS`
- **Add-on mkmg : un toucher qui tire ouvre une fiche** — au doigt (et souris en repli), un tap sur la scène tire et
  ouvre la fiche du POI ou de l'objet dessous. La prise existe : `ctx.regler({ fiches: false })` (checkup § 27).
  `qui: Claude · action: ajouter fiches: false au regler de coeur.js > _scene (greffe) · fini: tir au doigt sans fiche,
  checkup § 23 · depuis: 02/11/2026 · taille: XS`

## Plus tard

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
- **Thème clair : nettoyer les surcharges historiques** — ✅ vérifié 20/10 : ~1 780 sélecteurs `.kta-theme-light`
  dans `css/`, dont beaucoup en `!important`, devenus inutiles là où la règle de base est écrite en jetons
  (`docs/architecture/ui.md` §53.3).
  `qui: Claude · action: retirer écran par écran la surcharge que le jeton couvre, captures avant et après
  · fini: plus de surcharge claire de couleur là où un jeton existe · depuis: 20/10/2026 · taille: L`
- **Système d'add-ons community (`addons/<nom>/`)** — un vrai cadre pour qu'un add-on (ou un dev tiers) s'ajoute
  sans toucher l'app (`docs/architecture/addons.md`). QCM du 02/11/2026 : manifeste par add-on + liste lus par l'app
  et le précache, section « Add-ons » des Réglages (secrets absents), cases dans ConfAdmin, add-ons livrés seulement.
  `qui: Claude · action: coder le lot après l'essai iPhone de mkmg · fini: un add-on ajouté sans toucher js/ ni sw.js,
  interrupteur dans les Réglages et ConfAdmin · depuis: 02/11/2026 · taille: M`
- **Add-on mkmg : interrupteur par organisation (pro)** — aujourd'hui refusé sur une installation reliée, sauf
  `data/reglages.json > addons.mkmg` posé par l'hébergeur (toute l'installation) ; décision : un admin d'orga
  l'allume. Prise neutre côté community, réglage et case d'admin côté pro.
  `qui: KARMA · action: dire si un client le demande · fini: case d'admin, prise testée avec et sans pro
  · depuis: 02/11/2026 · taille: M`

## Entrant

- **Cap jamais lu si requestPermission répond « prompt »** — ✅ vu 04/11 (lot rotation-manuelle) : la Chromium du
  harnais expose DeviceMotionEvent.requestPermission(), qui répond « prompt » ; tracking.js > requestPermission
  n'attache alors aucun écouteur d'orientation (checkup-plan-oriente : 5 KO sous Chromium, déjà sur la base). 🔬 un
  Chrome Android récent ferait pareil : ni icône ni plan orienté ne tourneraient.
  `qui: KARMA · action: vérifier sur un Android que la boussole et le plan orienté tournent · fini: vu conforme, ou
  correctif (demander la permission dans le geste) · depuis: 04/11/2026 · taille: S`
- **Générateur : rendu 3D par défaut du plan** — demande KARMA 04/11 : choisir à la génération le rendu de la vue 3D
  par défaut (Mixte / Structures / Galerie), au lieu de Mixte pour tous ; le choix de l'utilisateur, retenu par plan
  (`setPlanRenduVue3D`), reste prioritaire. À faire après les lots du 04/11.
  `qui: Claude · action: champ du Générateur (createConf.js) + lecture par vue3d.js > _renduVoulu · fini: plan généré en
  Galerie qui s'ouvre en Galerie, checkup · depuis: 04/11/2026 · taille: S`
- **Fermeture d'une forme en px plan (2D)** — ✅ mesuré 04/11 (lot 3d-e3) : `zones.js > CLOSE_TOLERANCE` et
  `structures.js > STRUCT_CLOSE_TOLERANCE` valent 5 px plan, soit 0,8 m sur le relevé fictif (6,25 px/m) : un mur de
  0,4 m posé coin par coin se ferme en triangle au 4e coin, en 2D comme en 3D (rond doré de 0,3 m en 3D, dominé).
  `qui: KARMA · action: décider une tolérance en mètres (ou en px d'écran) pour la 2D · depuis: 04/11/2026 · taille: S`
- **Site de doc : la vue 3D dans les capacités** — `MyKTAMap-doc/generateur/accueil.js > CAPACITES` est une liste en dur
  qui ne cite pas la vue 3D ; à ajouter seulement quand la 3D est en prod (le site public lit community `main`).
  `qui: Claude · action: ajouter la ligne après le merge main de la 3D, puis relecture de KARMA avant deploy-doc public
  · depuis: 02/11/2026 · taille: XS`

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

