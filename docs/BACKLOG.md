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

- **Certificats TLS : renouvellement de dev et pro** — contrôlés le 23/11/2026 : tous valides (TLS 1.3), mais dev et pro
  expirent le 03/01/2027 sans avoir jamais été renouvelés (certbot agit à 30 jours, vers le 04/12). Sur le VPS :
  `certbot certificates`, minuteur certbot, `certbot renew --dry-run`. Alerte posée : sonde horaire en échec à 20 jours.
  `qui: KARMA · action: dry-run certbot sur le VPS, puis Claude recontrôle les dates le 05/12 · fini: dev et pro à une nouvelle
  échéance (avril 2027) · depuis: 23/11/2026 · taille: XS`
- **Test appareil : photos et export** — réimport d'une session ZIP ; refus au-delà de 5 photos ; analyse d'un gros
  plan depuis l'accueil (Safari ≥ 16.4) ; export image d'un plan tuilé hors-ligne.
  `qui: KARMA · action: jouer les 4 cas sur iPhone · fini: 4 cas vus conformes, ou bugs ouverts · depuis: 12/10/2026
  · taille: S`

## Ensuite

- **Sol abaissé qui débouche sur le niveau du dessous** — décidé 14/11 (après le lot 4 de la masse au sol) : en 3D, le
  plafond de la galerie du dessous s'ouvre et l'on descend à pied (comme la pente) ; itinéraire seulement par tracé
  jonction ; Vérifier le plan signale l'absence de raccord. QCM d'abord : quand ça perce, sens de −1, proposer le tracé.
  `qui: Claude · action: QCM puis lot · fini: descente 3D prouvée, raccord signalé · depuis: 14/11/2026 · taille: M`
- **Niveaux visibles 2D : décocher un niveau, « Tout afficher »** — ✅ mesuré 17/11 (CPU ×4, 4 000 structures, 2 500
  tracés, 1 510 zones, 5 niveaux) : décocher 1 niveau sur 5 = 2,2 s, « Tout afficher » = 2,1 s (couches de session
  recréées). Pistes : ne traiter que l'écart, puis garder les couches des niveaux masqués (~1 Mo pour 10 000).
  `qui: KARMA · action: dire s'il faut reprendre (piste 1, ou 1 + 2) · fini: les deux gestes mesurés sous 1 s à CPU ×4,
  checkups filtres et niveaux verts · depuis: 15/11/2026 · taille: M`
- **Référencement de doc.myktamap.fr** — un sitemap ne liste que son propre domaine : la doc doit publier son
  `sitemap.xml` (pages publiques, depuis le manifeste) et un `robots.txt` avec sa ligne Sitemap, rien sous `/interne/`.
  `qui: Claude · action: lot dans MyKTAMap-doc (générateur), relecture KARMA avant publication publique
  · fini: sitemap et robots servis sur doc.myktamap.fr, aucune page interne listée · depuis: 16/11/2026 · taille: S`
- **Mode strict par plan (jonctions imparfaites)** — idée KARMA : tolérance 0 sur un plan choisi. ✅ vérifié 24/11/2026 :
  un lien de tolérance qui croise un mur en ligne ou une zone inaccessible n'est plus posé (`pathfinder.js > _lienCoupe`).
  Reste le mode strict lui-même : topo (options et reco) dans le rapport du lot `niveaux-jonctions`.
  `qui: KARMA · action: choisir une option du topo du mode strict · fini: option choisie, ou idée close dans
  DECISIONS_FERMEES · depuis: 05/11/2026 · taille: S`

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

- **Safari ancien : aperçu PDF de repli vide** — sur un Safari trop ancien pour la visionneuse (avant 26.2), le repli
  est une iframe sur un blob:, que WebKit refuse sous `frame-ancestors 'none'` (🔬 hypothèse, vu au lot
  visionneuse-pdf, 24/11/2026). Le bouton « Ouvrir / Enregistrer » reste. Défaut antérieur au lot.
  `qui: Claude · action: reproduire sous WebKit puis topo · fini: repli lisible ou retiré au profit du bouton, checkup · depuis: 24/11/2026 · taille: S`

- **Détection : cadre de page et pointillés** — « Tout le plan » prend le cadre de la page et l'habillage (un front
  fait le tour de l'image, mur en 3D) ; un pilier cerné de pointillés ne sort ni en pilier ni en front. Cas
  fictifs : liseré noir de 2 px autour de l'image ; carrés de 3 × 3 px tous les 7 px autour d'un pilier.
  `qui: Claude · action: topo après le lot fronts en passe mixte · fini: cadre écarté, pointillés fermés, check-detection rouge puis vert · depuis: 21/11/2026 · taille: S`

- **Export : calage local des calques ignoré** — `exporter.js` cale les calques avec `layerCfg.calibration` (plan-config)
  au lieu de `ImageLayerCalibration.getCalibration` (prefs d'abord). Théorique aujourd'hui : aucun geste n'écrit de
  calage dans les prefs (au plus un profil importé). Vu le 21/11/2026.
  `qui: Claude · action: corriger quand un geste de recalage local existera · fini: export identique à la carte avec un calage des prefs · depuis: 21/11/2026 · taille: XS`

- **Détection auto : contour au bord intérieur du trait** — sur un plan au trait, la masse détectée s'arrête au bord
  intérieur (environ 1 px trop petite tout autour) alors que le trait fait partie du pilier (décision du 21/11/2026,
  appliquée au remplir au clic). Aligner la détection auto sur le milieu du trait.
  `qui: Claude · action: topo après le lot remplir · fini: contour au milieu du trait, check-detection rouge puis vert · depuis: 21/11/2026 · taille: S`

