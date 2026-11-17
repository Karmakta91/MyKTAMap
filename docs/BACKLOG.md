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
- **Pilotage** (décisions KARMA du 12/11/2026) : au-delà de **3 tests KARMA en attente**, Claude n'ouvre pas de
  lot M ou L (XS / S, tests instables, ou feuille de test pour KARMA) · **`## Entrant` trié chaque lundi** : une
  entrée de plus de 14 jours y passe en `## Ensuite` / `## Plus tard`, ou sort vers `IDEES.md`.
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

- **Test appareil : photos et export** — réimport d'une session ZIP ; refus au-delà de 5 photos ; analyse d'un gros
  plan depuis l'accueil (Safari ≥ 16.4) ; export image d'un plan tuilé hors-ligne.
  `qui: KARMA · action: jouer les 4 cas sur iPhone · fini: 4 cas vus conformes, ou bugs ouverts · depuis: 12/10/2026
  · taille: S`

## Ensuite

- **Masse au sol : rampe douce placée par l'utilisateur** — QCM 14/11 : une ou plusieurs rampes, « Placer une pente » puis toucher un bord bas ;
  pente déduite (hauteur ÷ longueur jusqu'au bord opposé) ; les autres bords en front vertical ; chevrons en 2D vers le
  haut. Sans rampe placée, talus 30° automatique inchangé. Priorité KARMA (« un gros plus »), juste après talus honnête.
  `qui: Claude · action: lot après talus honnête · fini: rampe en 2D (chevrons) et 3D, fiche, KMZ, checkup
  · depuis: 14/11/2026 · taille: M`
- **Sol abaissé qui débouche sur le niveau du dessous** — décidé 14/11 (après le lot 4 de la masse au sol) : en 3D, le
  plafond de la galerie du dessous s'ouvre et l'on descend à pied (comme la pente) ; itinéraire seulement par tracé
  jonction ; Vérifier le plan signale l'absence de raccord. QCM d'abord : quand ça perce, sens de −1, proposer le tracé.
  `qui: Claude · action: QCM puis lot · fini: descente 3D prouvée, raccord signalé · depuis: 14/11/2026 · taille: M`
- **Vérifier le plan, lot 2 : contrôles C4 à C10** — doublons d'objets, contours dégénérés, hors image, niveau
  inconnu, type absent de la légende ; Raccords (C5) et Dédoublonnage (C10) branchés, renvoi des liaisons (C11).
  `docs/ETUDE_VERIFIER_PLAN.md`.
  `qui: Claude · action: lot 2 de ETUDE_VERIFIER_PLAN.md · fini: C4 à C10 dans la liste, check-verifier-plan étendu
  · depuis: 11/11/2026 · taille: M`
- **Vérifier le plan, lot 3 : corrections sûres** — doublon identique, contour dégénéré, filets et historique, calque
  passé en session, plan partagé (traces, droits) ; galerie volontairement condamnée écrite sur l'objet (question 6).
  `qui: Claude · action: lot 3 de ETUDE_VERIFIER_PLAN.md · fini: corrections annulables, check-filets-donnees étendu
  · depuis: 11/11/2026 · taille: M`
- **Vérifier le plan, lot 4 : passe au chargement et fin du Générateur** — bloquants seuls, pastille et toast une fois
  tant que le nombre ne change pas, au repos ; coût mesuré d'abord sur le plus gros relevé des checkups.
  `qui: Claude · action: mesurer le coût puis lot 4 de ETUDE_VERIFIER_PLAN.md · fini: pastille et toast une fois,
  temps mesuré · depuis: 11/11/2026 · taille: S`
- **Masse au sol en 3D (remblais, lot 4)** — sol, talus, courbé / ramper / bloqué, ruban, panneaux, mini-carte ;
  mesure de perf. `docs/ETUDE_REMBLAIS.md`.
  `qui: Claude · action: lot 4 de ETUDE_REMBLAIS.md · fini: checkup-vue-3d vert, perf mesurée · depuis: 11/11/2026
  · taille: L`
- **Remblais : volume exploité par paliers et itinéraire (lots 5 et 6)** — volume par paliers ; coût de la masse au
  sol séparé de la distance, temps du guidage. `docs/ETUDE_REMBLAIS.md`.
  `qui: Claude · action: lots 5 puis 6 de ETUDE_REMBLAIS.md · fini: volume et itinéraire conformes à l'étude
  · depuis: 11/11/2026 · taille: M`

- **Niveaux visibles 2D : décocher un niveau, « Tout afficher »** — ✅ mesuré 17/11 (CPU ×4, 4 000 structures, 2 500
  tracés, 1 510 zones, 5 niveaux) : décocher 1 niveau sur 5 = 2,2 s, « Tout afficher » = 2,1 s (couches de session
  recréées). Pistes : ne traiter que l'écart, puis garder les couches des niveaux masqués (~1 Mo pour 10 000).
  `qui: KARMA · action: dire s'il faut reprendre (piste 1, ou 1 + 2) · fini: les deux gestes mesurés sous 1 s à CPU ×4,
  checkups filtres et niveaux verts · depuis: 15/11/2026 · taille: M`
- **Référencement de doc.myktamap.fr** — un sitemap ne liste que son propre domaine : la doc doit publier son
  `sitemap.xml` (pages publiques, depuis le manifeste) et un `robots.txt` avec sa ligne Sitemap, rien sous `/interne/`.
  `qui: Claude · action: lot dans MyKTAMap-doc (générateur), relecture KARMA avant publication publique
  · fini: sitemap et robots servis sur doc.myktamap.fr, aucune page interne listée · depuis: 16/11/2026 · taille: S`
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
- **Plan au sol net sur un grand plan, et jusqu'à l'horizon** — ✅ 04/11 : 1024 px pour ~100 m, flou de près ; ✅ 14/11 :
  emprise = cadrage (`dcce47e3`), mais en « Tout le plan » vue rasante, sol nu au-delà de ~70 m. Piste : deux textures
  (proche nette, lointaine grossière) ; `camera.far` = diagonale à portée illimitée, précision de profondeur à suivre.
  `qui: Claude · action: texture proche + lointaine, mémoire en iPhone émulé · fini: lisible de près et au loin
  · depuis: 04/11/2026 · taille: M`
- **Objet supprimé qui reste affiché** — vu en pro (26/10) : objet de session venant d'un calque copié dans la
  session, supprimé depuis sa fiche, organisation chiffrée, souvent le PREMIER supprimé ; disparaît au rechargement
  du plan (donnée supprimée, affichage pas rafraîchi). 🔬 non reproduit.
  `qui: Claude · action: scénario pro sur la pile (calque copié en session, 1re suppression depuis la fiche, chiffré)
  · fini: reproduit puis corrigé · depuis: 20/10/2026 · taille: S`

## Entrant

- **`refonteInterface.js > _syncH` coûte 150-200 ms par chargement** — mesuré en iPhone émulé ×4 (enquête perf du
  15/11), déjà présent avant la masse au sol.
  `qui: Claude · action: mesurer sur appareil, alléger ou différer · depuis: 15/11/2026 · taille: S`
- **`checkup-exports-structures` rouge depuis le nouveau relevé fictif** — il attend 10 structures de calque et en voit
  217 depuis `a1340f74` (14/11) ; hérité, sans lien avec un lot.
  `qui: Claude · action: adapter le test au relevé enrichi sans l'affaiblir · depuis: 14/11/2026 · taille: XS`
- **`_redraw()` direct du renderer en Vue OSM** — `osmView.js` et `osmHomePreview.js` appellent `r._redraw()` sans
  annuler le redessin en attente : même motif que le bug corrigé dans `structures.js > majLargeurFronts` (14/11).
  `qui: Claude · action: annuler la requête en attente, garde renderer monté, checkup · depuis: 14/11/2026 · taille: XS`
- **Pile de test Docker sur le port de Sonar** — une pile de test a pris le 9000 (13/11) : la porte Sonar de
  `merge-main.ps1` échoue tant qu'elle tourne. Refuser ce port aux piles de test, ou les sortir de sa plage.
  `qui: Claude · action: trouver la pile en cause, plage de ports réservée · depuis: 13/11/2026 · taille: XS`
- **Scan Sonar impossible depuis une copie séparée** — le scanner (Docker) ne lit pas le `.git` d'un worktree
  (chemin Windows absolu) : `RepositoryNotFoundException`. Les lots ne peuvent pas prouver la porte avant intégration.
  `qui: Claude · action: monter le dépôt principal dans le conteneur, ou scan sans SCM sur un projet Sonar à part
  · depuis: 13/11/2026 · taille: XS`
- **En-tête de licence : étendre le garde-fou** — `check-entete-licence.js` ne lit que `js/` et `sw.js` ; `addons/`
  et `css/` portent l'en-tête aujourd'hui sans que rien ne l'impose.
  `qui: Claude · action: ajouter addons/**/*.js et css/*.css au périmètre · depuis: 13/11/2026 · taille: XS`

- **« Mettre à jour le plan » : la chatière ne garde que son départ** — vu par KARMA (12/11) sur un plan
  d'organisation, chatière dans un calque en modification, carte 2D. Non reproduit (local, pro non chiffré) ; seul
  `poiPrecis.js > lire` produit ce rendu : tag `chatiere` plus en tête, ou `precis` réduit.
  `qui: KARMA · action: coller en console la ligne tags / clés / nombre de points envoyée le 12/11 · fini: cause
  identifiée, test rouge puis vert · depuis: 12/11/2026 · taille: S`
- **Sonar : porte en échec sur une fausse alerte** — scan de rattrapage de la v2.25.0 : une seule anomalie de
  fiabilité, `js/verifierPlan.js > _identite`, S7758 (`codePointAt`). Ne pas suivre : l'empreinte FNV se calcule sur
  les unités UTF-16, `codePointAt` changerait l'identité des objets ignorés (types avec emoji). Sécurité : 0.
  `qui: Claude · action: NOSONAR commenté sur la ligne (décision KARMA du 12/11), session Dev · fini: porte verte au
  prochain scan · depuis: 12/11/2026 · taille: XS`
- **Garde contre un écart négatif entre niveaux** — un écart négatif oublié faisait passer le sol d'un niveau sous le
  plafond de celui du dessous (bugs 3D sur un plan réel, 12/11). Proposé : avertissement non bloquant dans la table
  des niveaux, et correction du message faux `prof.incoherent.suite`. Après la mise en prod de la v2.25.0 (gel).
  `qui: KARMA · action: valider la proposition · depuis: 12/11/2026 · taille: S`
- **Connexions IndexedDB jamais fermées** — audit pro
  `MyKTAMap-pro/docs/audits/2026-11-06_audit-accueil-chiffre-v1.md` : `planRegistry.js > _openIDB` ouvre une
  connexion à chaque appel, jamais fermée. (Le splash, lui, reste bloquant : décision du 12/11/2026.)
  `qui: Claude · action: une connexion partagée, rouverte si fermée · depuis: 06/11/2026 · taille: S`
- **Rotation 2D : redessin inutile et geste lourd** — enquête du 06/11 (plantage non reproduit) : `mapBearing.js >
  _majPaddingUnRenderer` vide et redessine le canvas des vecteurs 2 fois par rotation sans changement (mémoire qui monte
  sous WebKit) ; au téléphone, ~1 500 couches de POI + `--kta-bearing` sur toute la carte figent le geste (jusqu'à 1,7 s).
  `qui: Claude · action: a) supprimer le redessin inutile (risque faible) ; b) et c) en QCM · depuis: 06/11/2026
  · taille: S`
- **Mode « strict » des jonctions, par plan** — la règle stricte du 05/11 n'a pas réglé l'itinéraire de KARMA qui
  traverse un mur. Idée KARMA : tolérance 0, deux tracés qui ne se touchent pas = réseau coupé (seuls sommets partagés
  et croisements exacts). ⚠️ D'abord vérifier si le trajet suit un VRAI tracé à travers le mur (le strict n'y peut rien).
  `qui: Claude · action: rejouer l'itinéraire réel, puis topo (réglage Générateur + par plan, Raccords à vérifier)
  · depuis: 06/11/2026 · taille: S`
- **Point précis à l'export image / PDF** — pointillé doré + carré (chatière : trait début→fin) dessinés par l'export
  comme sur la carte. Recos du topo 06/11 : export avancé et PDF, case « 🎯 Points précis » cochée, sans le seuil de
  zoom, ligne de légende ; KMZ / GPX / GeoJSON inchangés (icône). Recos validées par KARMA le 12/11/2026.
  `qui: Claude · action: coder les 4 recos (export avancé et PDF) · fini: point précis dessiné à l'export, checkup
  · depuis: 06/11/2026 · taille: S`
- **Jonctions qui traversent un mur dessiné** — ✅ vu 05/11 (code) : les liens de jonction imparfaite
  (pathfinder.js > _enrichirGrapheAvecCroisements) ne testent ni les murs en ligne ni les zones inaccessibles, qui
  ne bloquent que le long des tracés.
  `qui: Claude · action: refuser un lien qui croise un obstacle dur, checkup · fini: lien coupé par un mur ligne
  fictif, itinéraire qui contourne · depuis: 05/11/2026 · taille: S`

- **Générateur : rendu 3D par défaut du plan** — demande KARMA 04/11 : choisir à la génération le rendu de la vue 3D
  par défaut (Mixte / Structures / Galerie), au lieu de Mixte pour tous ; le choix de l'utilisateur, retenu par plan
  (`setPlanRenduVue3D`), reste prioritaire. À faire après les lots du 04/11.
  `qui: Claude · action: champ du Générateur (createConf.js) + lecture par vue3d.js > _renduVoulu · fini: plan généré en
  Galerie qui s'ouvre en Galerie, checkup · depuis: 04/11/2026 · taille: S`
- **Désactiver un type par défaut (tracé, zone, structure)** — un utilisateur qui ne veut pas voir « Route
  principale » ou la zone « Remblais » dans sa légende et ses choix de dessin. ⚠️ La légende sait déjà masquer un type
  (`hidden`, `LegendCustomization.setSessionVisibility`) : vérifier ce que ça retire vraiment avant de proposer.
  `qui: Claude · action: topo (ce que masque hidden aujourd'hui, ce qui manque) · depuis: 01/11/2026 · taille: S`
