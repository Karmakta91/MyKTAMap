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
    `taille` = `XS` | `S` | `M` | `L`. Aucun accent grave dans une valeur ;
  - champs facultatifs, même syntaxe, en fin de bloc : `lot` = branche du lot en vol ;
    `id` = identifiant stable, minuscules, chiffres et tirets, unique dans le dépôt, posé sur toute entrée ;
    `après` = id des entrées à finir avant, séparés par des virgules ; autre dépôt : `pro:id` ou `community:id` ;
    `échéance` = date butoir JJ/MM/AAAA, seulement pour une vraie échéance ; la priorité reste l'ordre du fichier ;
  - dans `## Entrant`, les métadonnées sont facultatives, sauf `id` : le tri pose les autres.

## Maintenant

- **Test appareil : photos et export** — réimport d'une session ZIP ; refus au-delà de 5 photos ; analyse d'un gros
  plan depuis l'accueil (Safari ≥ 16.4) ; export image d'un plan tuilé hors-ligne.
  `qui: KARMA · action: jouer les 4 cas sur iPhone · fini: 4 cas vus conformes, ou bugs ouverts · depuis: 12/10/2026
  · taille: S · id: test-appareil-photos-export`

## Ensuite

- **Sol abaissé qui débouche sur le niveau du dessous** — décidé 14/11 (après le lot 4 de la masse au sol) : en 3D, le
  plafond de la galerie du dessous s'ouvre et l'on descend à pied (comme la pente) ; itinéraire seulement par tracé
  jonction ; Vérifier le plan signale l'absence de raccord. QCM d'abord : quand ça perce, sens de −1, proposer le tracé.
  `qui: Claude · action: QCM puis lot · fini: descente 3D prouvée, raccord signalé · depuis: 14/11/2026 · taille: M
  · id: sol-abaisse-niveau-dessous`

## Plus tard

- **AI_CONTEXT : remplacer les ~540 emoji de bouton par le nom du bouton dans tout le fichier** — le lexique en tête
  (généré par `check-lexique-icones.js`) suffit en attendant ; une fois les noms écrits, le lexique ne garde que
  les emoji restés.
  `qui: Claude · action: réécrire les citations de bouton d'AI_CONTEXT.md par leur nom, lexique régénéré
  · fini: classerDoc ne relève plus d'emoji de bouton hors lexique · depuis: 09/11/2026 · taille: M
  · id: ai-context-noms-boutons`
- **Vue 3D, puits ouvert : galerie du dessus qui coupe le conduit** — une galerie du dessus qui ne couvre qu'une
  partie de l'emprise du puits coupe le conduit (les parois de tube des voisins ne lisent pas le gabarit) — rare, pas
  vu sur plan réel. ✅ vérifié 09/11/2026 : `js/vue3d.js > _sommetPlafond` (🩸).
  `qui: Claude · action: couper les parois de tube des voisins sur l'emprise d'un conduit (bit GABARIT.conduit)
  · fini: checkup § 56 étendu à une galerie à cheval sur l'emprise, vert · depuis: 09/11/2026 · taille: S
  · id: vue3d-puits-galerie-conduit`
- **Vue 3D, puits ouvert : disque de ciel coupé vu en biais** — regardé de biais depuis le fond ou depuis un niveau
  traversé, le disque de ciel du sommet est coupé net par un bord vertical (même sprite que le puits sur son niveau).
  🔬 vu en capture sur plan réel le 09/11/2026, cause non cherchée.
  `qui: Claude · action: trouver ce qui tranche le sprite (gabarit, plan de coupe, taille) et le corriger
  · fini: capture en biais sans bord net, checkup § 56 vert · depuis: 09/11/2026 · taille: S
  · id: vue3d-puits-disque-ciel`
- **Téléchargement de fichier commun, repli partage iPhone** — une vingtaine de modules recopient le même lien Blob
  + `download` (secoursMode, sessionExporter, refonteInterface…), aucun ne passe par `navigator.share` sur iOS, où le
  lien d'un Blob est capricieux dans la PWA installée. ✅ vérifié 09/11/2026 (grep) ; modèle : `js/debug.js`.
  `qui: Claude · action: une fonction commune (Blob, download, partage iOS) et y passer les exports
  · fini: plus de copie du motif, exports testés Chromium et WebKit · depuis: 09/11/2026 · taille: M
  · id: telechargement-commun-ios`
- **Calque : copie jamais retouchée contre trace de copie** — deux appareils hors ligne qui passent le même calque
  en modification gardent des copies concurrentes (le plus récent gagne). Règle à la réception, cf
  `docs/architecture/session-data.md` (limites de « Repasser en modification »).
  `qui: Claude · action: marquer la date de l'objet du fichier sur chaque copie, la trace l'emporte sur une copie
  intacte · fini: scénario deux appareils hors ligne vert · depuis: 08/11/2026 · taille: M
  · id: calque-copie-contre-trace`
- **Calque d'origine sur un appareil neuf** — toutes les copies supprimées ailleurs : il ne reçoit que des traces,
  voit le calque d'origine tant qu'il n'a pas cliqué « Modifier » (qui donne alors un calque vide).
  `qui: Claude · action: masquer le calque si des traces de copie le vident (vérification asynchrone du fichier)
  · fini: appareil neuf sans calque fantôme · depuis: 08/11/2026 · taille: S · id: calque-origine-appareil-neuf`
- **⏪ du niveau en lot et liaisons des portails** — le niveau en lot fait suivre la liaison d'un portail
  (`InterPlanLinks.onPointLevelChanged`), mais ⏪ ne la remet pas à l'ancien niveau (point remis, liaison non).
  `qui: Claude · action: inclure les instantanés de liaison dans l'entrée d'historique du lot · fini: ⏪ remet point
  et liaison, check-selection-multi le prouve · depuis: 08/11/2026 · taille: S · id: annuler-niveau-lot-liaisons`
- **`security.txt` à renouveler** — ici et dans `MyKTAMap-doc/racine-publique/` (RFC 9116), expire le 22/10/2027 : périmé
  compte comme absent pour les outils de réputation.
  `qui: Claude · action: repousser Expires d'un an (moins d'un an d'avance) · fini: fichier servi, date à jour
  · depuis: 23/10/2026 · taille: XS · id: security-txt`
- **Échelle typographique** — ✅ vérifié 20/10 : ~35 tailles de texte dans `css/` ; 11 / 11,5 / 12 / 12,5 / 13 px se
  suivent à moins de 5 %. Reste de l'audit d'interface (M1) : 6 rôles proposés (11 méta, 12,5 libellé, 14 corps,
  15 lecture, 18 titre de fenêtre, 24 titre d'écran), plancher de 11 px pour tout texte cliquable.
  `qui: Claude · action: proposer en QCM les jetons de taille et l'ordre des écrans, puis les poser écran par écran
  · fini: tailles en jetons, plus aucune valeur hors échelle dans css/ · depuis: 20/10/2026 · taille: L
  · id: echelle-typographique`
- **Thème clair : nettoyer les surcharges historiques** — ✅ vérifié 10/11 : 1 792 → 1 001 sélecteurs
  `.kta-theme-light` (`scripts/smoke/releve-theme.js`, `docs/architecture/ui.md` §53.3). Restent surtout
  des règles qu'aucun écran relevé n'atteint (Vue OSM, instance à mot de passe, sous-fenêtres profondes).
  `qui: Claude · action: étendre le relevé aux écrans non couverts puis retirer ce qu'il prouve mort
  · fini: plus de surcharge claire de couleur là où un jeton existe · depuis: 20/10/2026 · taille: L
  · id: theme-clair-surcharges`
- **Plan au sol net sur un grand plan, et jusqu'à l'horizon** — ✅ 04/11 : 1024 px pour ~100 m, flou de près ; ✅ 14/11 :
  emprise = cadrage (`dcce47e3`), mais en « Tout le plan » vue rasante, sol nu au-delà de ~70 m. Piste : deux textures
  (proche nette, lointaine grossière) ; `camera.far` = diagonale à portée illimitée, précision de profondeur à suivre.
  `qui: Claude · action: texture proche + lointaine, mémoire en iPhone émulé · fini: lisible de près et au loin
  · depuis: 04/11/2026 · taille: M · id: vue3d-sol-net-horizon`
- **Objet supprimé qui reste affiché** — vu en pro (26/10) : objet de session venant d'un calque copié dans la
  session, supprimé depuis sa fiche, organisation chiffrée, souvent le PREMIER supprimé ; disparaît au rechargement
  du plan (donnée supprimée, affichage pas rafraîchi). 🔬 non reproduit.
  `qui: Claude · action: scénario pro sur la pile (calque copié en session, 1re suppression depuis la fiche, chiffré)
  · fini: reproduit puis corrigé · depuis: 20/10/2026 · taille: S · id: objet-supprime-affiche`
- **Détection : chaîne de masses reliées par deux cous épais** — trois masses reliées par deux cous gardés (épais)
  sont lues comme un pilier traversé par une bande : 4 morceaux, la masse du milieu rongée. Forme rare sur carrière.
  🔬 reproduit en scène de test le 27/11/2026 (`js/ktaDetection.js > _bandesCadre`), demande un critère de direction.
  `qui: Claude · action: juger un cou par la direction de la bande, pas par le seul rapport d'épaisseur
  · fini: scène trois masses dans check-detection.js, 3 morceaux intacts · depuis: 27/11/2026 · taille: S
  · id: detection-chaine-masses`
- **Détection : deux piliers parallèles reliés par une bande restent soudés** — le pré-filtre « pilier compact »
  saute toute la composante, la bande n'est jamais examinée. 🔬 cause probable, vue en scène de test le 27/11/2026.
  `qui: Claude · action: limiter le pré-filtre pilier compact aux composantes sans étranglement
  · fini: scène deux piliers parallèles dans check-detection.js, 2 morceaux · depuis: 27/11/2026 · taille: S
  · id: detection-pilier-compact-soude`
- **Couper une structure en deux par un trait** — l'inverse de l'addition, pour une fusion de trop au-delà de
  l'annulation ou un pilier mal détecté d'un seul tenant.
  `qui: Claude · action: QCM puis lot · fini: une structure coupée par un trait donne deux structures, annulable
  · depuis: 27/11/2026 · taille: S · id: structures-couper`
- **Panneau Fond de carte : quelques px sous la barre d'état après une rotation** — il se replace au resize seulement,
  sans suivre la transition de hauteur de la barre d'état (les panneaux de groupe la suivent, `_suivreBarresFlyout`).
  🔬 relevé par le lot flyout-defilement le 27/11/2026, non mesuré sur appareil.
  `qui: Claude · action: brancher fondOsmPlan.js > _placerPanneau sur le même suivi des barres
  · fini: checkup-flyout-defilement étendu à une rotation panneau Fond de carte ouvert, vert · depuis: 28/11/2026
  · taille: XS · id: fond-carte-rotation-barre`

## Entrant

- **Vérifier le plan : bout coupé du réseau par un mur** — depuis le correctif des jonctions (51ace966), l'itinéraire refuse un lien de jonction
  imparfaite qui traverse un mur en ligne ou une zone inaccessible ; mais 🔗 Raccords et Vérifier le plan (C5, `KtaRaccords.detecter`) voient
  toujours ce bout comme raccordé : l'auteur n'apprend pas que l'itinéraire ne passe plus là. Cas rare (vu au lot niveaux-jonctions, 24/11/2026).
  `qui: Claude · action: signaler dans Vérifier le plan un bout dont le seul lien est coupé (mêmes obstacles que
  pathfinder.js > _lienCoupe) · fini: cas fictif signalé, check-verifier-plan rouge puis vert · depuis: 24/11/2026 · taille: S
  · id: verifier-plan-bout-coupe`

- **Safari ancien : aperçu PDF de repli vide** — sur un Safari trop ancien pour la visionneuse (avant 26.2), le repli
  est une iframe sur un blob:, que WebKit refuse sous `frame-ancestors 'none'` (🔬 hypothèse, vu au lot
  visionneuse-pdf, 24/11/2026). Le bouton « Ouvrir / Enregistrer » reste. Défaut antérieur au lot.
  `qui: Claude · action: reproduire sous WebKit puis topo · fini: repli lisible ou retiré au profit du bouton, checkup · depuis: 24/11/2026 · taille: S
  · id: safari-ancien-apercu-pdf`

- **Détection : cadre de page et pointillés** — « Tout le plan » prend le cadre de la page et l'habillage (un front
  fait le tour de l'image, mur en 3D) ; un pilier cerné de pointillés ne sort ni en pilier ni en front. Cas
  fictifs : liseré noir de 2 px autour de l'image ; carrés de 3 × 3 px tous les 7 px autour d'un pilier.
  `qui: Claude · action: topo après le lot fronts en passe mixte · fini: cadre écarté, pointillés fermés, check-detection rouge puis vert · depuis: 21/11/2026 · taille: S
  · id: detection-cadre-pointilles`

- **Export : calage local des calques ignoré** — `exporter.js` cale les calques avec `layerCfg.calibration` (plan-config)
  au lieu de `ImageLayerCalibration.getCalibration` (prefs d'abord). Théorique aujourd'hui : aucun geste n'écrit de
  calage dans les prefs (au plus un profil importé). Vu le 21/11/2026.
  `qui: Claude · action: corriger quand un geste de recalage local existera · fini: export identique à la carte avec un calage des prefs · depuis: 21/11/2026 · taille: XS
  · id: export-calage-local`

- **Détection auto : contour au bord intérieur du trait** — sur un plan au trait, la masse détectée s'arrête au bord
  intérieur (environ 1 px trop petite tout autour) alors que le trait fait partie du pilier (décision du 21/11/2026,
  appliquée au remplir au clic). Aligner la détection auto sur le milieu du trait.
  `qui: Claude · action: topo après le lot remplir · fini: contour au milieu du trait, check-detection rouge puis vert · depuis: 21/11/2026 · taille: S
  · id: detection-contour-milieu-trait`

