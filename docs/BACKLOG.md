# 📋 Backlog & dettes — MyKTAMap

> Fichier de travail KARMA ↔ Claude. **Ce n'est pas un journal** (ça, c'est `README.md`) : on n'y garde que ce qui est
> **ouvert**. Une entrée soldée est **supprimée**, pas barrée — son histoire vit dans le journal et les commits
> (`git log -p docs/BACKLOG.md` pour les versions antérieures).
>
> **Dernier ménage : 15/10/2026** (précédent : 14/10/2026). Rangé par **qui doit agir**.

## ⚠️ Avant de traiter une entrée

Un inventaire sourcé depuis la doc s'est révélé **faux à 30 %** (01/08/2026) : une entrée ancienne pose une limite
qu'une entrée plus récente lève. Chaque entrée porte donc son niveau de preuve — ✅ **vérifié** dans le code (date),
⚠️ **doc seule**, 🔬 **hypothèse** — et **avant d'agir** : `grep` le symbole dans `js/`, vérifier `index.html` et
`sw.js > ASSETS_TO_CACHE`. La règle vaut **dans les deux sens** : une entrée soldée qui traîne fait reproposer un
chantier déjà fait (cas réel du 31/08). **Reclore le jour même.**

---

## 1. 🛠️ À faire — Claude

| Sujet | Détail | Taille |
|---|---|---|
| **🏗️ Mettre à jour le plan (assistant)** | Décidé (QCM KARMA) : tuile dans ⬆️ Exporter + raccourci en tête des calques (≡ Filtres). Étapes : 1. calques en modification (cochés, chacun remplace son fichier) ; 2. objets hors calque groupés par catégorie / tag (comme la Conversion) — par groupe : calque existant, nouveau calque, ou laisser ; 3. le **Générateur s'ouvre en mode Modifier déjà rempli** (ZIP actuel du plan + calques + nouveaux calques + photos), l'utilisateur vérifie et génère ; 4. plan local : télécharger / remplacer dans l'app ; plan d'extension : **nouvelle version** via une prise neutre `publierVersion` (réservée côté installation au propriétaire / droit « gérer » ; « modifier » prépare et télécharge seulement — vérifier le droit serveur de `PUT …/fichier`). Après : proposer de rendre les calques à l'équipe et de retirer de la session les objets intégrés (sinon doublons). À lancer **après** l'intégration des lots `effacer-calques`, `integrer-ajouts`, `export-modifier` (mêmes fichiers) | L |
| **Changer le niveau d'un objet** | Demande KARMA : sur la fiche d'un POI, d'un tracé, d'une zone ou d'une structure de SESSION, choisir son niveau. Aujourd'hui le niveau est fixé à la création (`editor.js`, `road.js`, `structures.js` : niveau affiché) et seul « Convertir cet objet » touche la fiche, sans le niveau. À prévoir : liste des niveaux du plan (`plan-config`), absente sur un plan à un seul niveau ; 🩸 structures (`structures.js` pose `niveau − 1` dans un cas : comprendre avant) ; tracés qui servent de jonction interniveau ; graphe d'itinéraire à reconstruire ; objet de calque = rapatrier d'abord (lecture seule sinon) ; `KtaUid.touch` (synchro) ; ⏪ annulable ; photos et liaisons suivent l'objet. Garde-fou à étendre (check-convert / check-uid) | M |
| **FR en dur restant** | Tri complet fait le 09/10. Reste assumé : `confadmin.html` (100 % FR), motifs de config invalide de `ktaExtensions.js`, `Error` techniques. **Au fil de l'eau** | — |
| **Pastille hors-ligne** | 🔬 coût de `SwInspector.etat()` sur un vieux téléphone non mesuré (3-7 ms sur PC) ; états orange et thème clair non testés en navigateur | S |
| **Vue OSM : points sous les tuiles du plan** | 🔬 16-17/10/2026 (KARMA, plan réel multi-niveau, **iPhone PWA ET PC**) : une partie des POI paraît **derrière** les tuiles du plan (ternes, ~la moitié de la vue). Constats KARMA : à opacité 0 % ou case **🖼️ Plan décochée**, toutes les icônes redeviennent nettes ; Plan recoché → le défaut revient. Ce sont bien des POI (pas des pictos de l'image). ✅ Côté code : pane des tuiles `ktaOsmTuiles` (z 350, opacité sur le pane) sous le `markerPane` (600), une seule voie de pose des tuiles (`osmView.js > _renderV2`, `L.imageOverlay.rotated` dans ce pane). ✅ Mesure Claude (Chromium 1366×800, même plan, ouverture directe de la Vue OSM, 2 zones dont la zone dense du haut) : **non reproduit** — 91 images de tuiles toutes dans le pane, aucun marqueur dont le point central est couvert par une tuile, marqueurs opacité 1 sans filtre, 0 doublon de position. L'hypothèse « Safari seul » tombe (PC touché). Pistes à creuser, dans l'ordre : (1) navigateur PC de KARMA (Edge/Firefox ?) et parcours avant ouverture (changement de niveau, de plan dans la liste déroulante, réouverture de la vue — un 2e `createPane` du même nom ?) ; (2) tuiles posées hors du pane dans un état particulier ; (3) tuiles de bord rognées (`clip-path`, `tiling.js > ktaRognerTuile`) dans un pane à opacité — compositing. Reproduire d'abord avec le parcours exact de KARMA. À part : `pa`/`pc`/`danger`/`info` sont semi-transparentes à 90-100 % et prennent la teinte du fond (fond opaque sous l'icône en OSM, ou icônes opaques au catalogue = choix de charte KARMA) | S |
| **Seuils « mobile » dispersés** | 🔬 Inventaire du 17/10/2026 (audit ergonomie M5, seul le plancher de dézoom a migré vers `window.ktaAppareilTactile()`) : JS `homeLoader.js` (640 px ×2, `ontouchstart`/`maxTouchPoints`), `interfaceConfig.js` (1023 px), `interfaceDocs.js` (1100 px) ; détection iPadOS `maxTouchPoints > 1` recopiée dans `createConf.js`, `modeHistoire.js`, `profileExportImport.js` alors que `ktaEstIos` existe ; CSS `@media max-width` 480 ×16, 640 ×6, 600 ×5, 768 ×3, 540 ×3, 1023 ×2, 800/520/380/379 ×1, + ~5 blocs `max-height: 500px`. Converger seulement quand on touche le module | M |
| **PDF « HD » plafonné en silence** | ⚪ Sur iPhone, le PDF réduit sa résolution sous 16,7 Mpx (`exporter.js > _publicGenererCanvas`) sans le dire (une ligne de log) : « HD » peut sortir moins net que demandé. L'export image, lui, propose « 📱 Max iPhone » depuis le 17/10 | S |
| **Vieille clé de profil** | ⚪ un vieil export de profil réécrit `myktamap_network_paranoia_v1` (inerte) — purge en 1 ligne si gênant | XS |

### 🚑 Mode Secours — la refonte qui reste (audit du 29/09)

Rapport : [`docs/audits/2026-09-29_audit-secours-v1.md`](audits/2026-09-29_audit-secours-v1.md). Un commit par case.
- **Si un exercice le demande** : préparer le parcours de la phase 2 pendant la phase 1 **L**.
- **Lot C (plus tard)** : C2 gabarit brancard **L** · C3 rôle par personne en liste fermée, seulement si des
  exercices le réclament **M**. (C1 secteurs + balayage : livré le 15/10/2026, `secours.md` § Secteurs.)
- 🔬 **Balayage (C1)** : écart entre secteurs de 1,35 sur un plan réel (l'audit visait 1,16 avec un découpage par
  niveau) — à affiner seulement si un exercice le demande.
- 🔬 **Deux interventions simultanées sur un même plan** : non vérifié.

---

## 2. 🧑‍💼 À faire ou à trancher — KARMA

| Sujet | Ce qu'il faut |
|---|---|
| **Retour testeur (prod, 10/10)** | « inutilisable dans les seconds niveaux » — à préciser avec lui (plan, itinéraire, lisibilité ?). La jauge de stockage et les alertes de saturation sont livrées |
| **« Session d'une autre version du plan »** | Si l'utilisateur choisit « Ignorer », la question revient (voulu : rien n'est effacé sans accord) — à revoir s'il s'en plaint |
| **Noms réels dans le code et les docs internes** | 🟡 Le nom du département est neutralisé partout (garde-fou `check-noms-reels.js`) ; d'autres noms de lieu ou de plan réels restent dans `README.md`, quelques commentaires `js/` et `docs/architecture/`. Liste remise hors dépôt. À trancher nom par nom |
| **Mot de passe d'installation oublié** | ⚪ Seul l'effacement des données du site lève le verrou ; pas de voie de secours — décision produit à confirmer |
| **Sonar — faux positifs** | Marquer « Accepté » dans l'interface (`http://localhost:9000/project/issues?id=MyKTAMap&types=BUG`) : `mdParser.js` ×2 (caractères de contrôle = balises internes), `css/style.css` ×2 (`height: 44px` = repli avant `calc(env(safe-area…))`), `index.html` barre de profil (clavier géré en JS, la CSP interdit l'attribut inline) |
| **Sonar — jetons** | Expirent vers le **06/01/2027** : au-delà, `sonar-scan.ps1` sort en code 1 et `merge-main.ps1` demande `DEROGE`. Régénérer un *Project Analysis Token* |
| **Données des plans (DATA, KARMA seul)** | Taguer les vrais accès et leur état (un seul accès tagué, aucun `entree_plan`), donner un niveau aux POI d'accès et aux tracés qui n'en ont pas, 3ᵉ point de calage GPS ; **régénérer** les plans d'avant v1.97.9 (valeur fautive pour `entree_plan`, pas d'`iconsEmbarquees` → 21 sondes 404) |
| **D-light-icons** | 🔬 Thème clair PC : émojis hors cadre à zoom 100 % (OK à 90 %), **non reproduit** au harnais. Une capture DevTools (`text-indent`/`display` d'un bouton touché) ; pistes : extension navigateur, échelle Windows 125 % |

---

## 3. 📱 À tester sur appareil — le harnais ne sait pas le faire

- **Lockout temporisé** (PIN + gate) : 5 codes faux → compte à rebours → retour du pavé (`security-legal.md` §36.3).
- **Stockage saturé** : bandeau persistant + 💾 Exporter tant que la sauvegarde échoue (saturer un téléphone de test).
- **Mode Secours sur iPhone** : « Suivre mon parcours » (permission des capteurs dans le geste) ; valider une étape
  recale la position (question au-delà de 30 m) ; écran XL avec un long itinéraire ; « Retour impératif ».
- **Photos et export** : réimport d'une session ZIP ; refus au-delà de 5 photos ; analyse d'un gros plan depuis
  l'accueil (Safari ≥ 16.4) ; export image d'un plan tuilé hors-ligne.
- **Balayage Secours (C1)** : temps de « Découper en secteurs » sur un vieux téléphone ; « Suivre mon parcours » en
  balayage sur le terrain (un écart doit rejoindre le circuit là où l'équipe en était, pas au début).
- **Export KMZ « Grandes images »** (15/10) : « Nette » validé sur iPhone ; « Très nette » (16 images) non essayé.
- **Ouverture de plans sur iPhone** (14/10) : plus de clics répétés ; si le journal montre souvent « copie gardée
  relue », quelque chose réécrit encore les copies — envoyer le journal.
- **Guide utilisateur, chiffres repris sans vérification** : stockage par appareil (~50 Mo Safari, ~1 Go app
  installée), chemin d'installation sur Chrome Android.
- ⚠️ **Toujours tester APRÈS un bump** : un téléphone garde l'ancien JS jusqu'au changement de `CACHE_NAME`. La
  validation iOS/Safari d'un changement de rendu vit dans `docs/RELEASE_GATE.md`.

---

## 4. 💡 Pistes de features — gardées, non lancées

| Piste | Valeur | État |
|---|---|---|
| **Puits inter-étage** (30/09) | Un puits n'existe que comme **tracé** « jonction » 🪜 (`multilevel-pathfinding.md` §26.5). POI dédiée, visible sur ses **deux** niveaux, qui porte la jonction pour l'itinéraire — logique d'un **portail**. Ajout du tag : skill `add-icon-tag` | à cadrer |
| **Adresse de contact de l'installation** (04/10) | `contact@myktamap.fr` est en dur (`index.html` ×2, dicos ×3, guide ×3). Champ ConfAdmin → `index.json > config`, repli sur l'adresse actuelle. À trancher : quelles mentions suivent, lesquelles restent (crédit, licence, `NETWORK_AUDIT`) | à cadrer |
| **Import VisualTopo (`.tro`)** | La cible spéléo n'a aucun format topo lisible. Socle : `sigImport.js` + `GpxImport.genererCanvasVierge` ; un `.tro` = texte tabulé → points + polylignes. *[Supposition]* : format le plus répandu chez les spéléos français, à confirmer | **pas maintenant** (KARMA, 10/10) |
| **Harmoniser les icônes par défaut** (26/09) | Le portail a deux visages (PNG sur carte / légende / exports, 🌀 dans les liaisons et l'itinéraire). 🔴 Avant toute vectorisation : `kmzExport.js` écrit le blob en `.png` sans regarder son type (un SVG n'apparaît pas dans Google Earth) ; `utils.js` fait gagner `PLAN_CONFIG.icons[tag]` sur le catalogue (un catalogue en `.svg` ne toucherait aucun plan existant) | mis de côté |
| **Stratégie doc « une source, trois rendus »** | Guide / Aide intégrée / contexte IA ; `check-doc-langues.js` aligne déjà les trois langues du guide | **pas maintenant** (KARMA, 10/10) |
| **Export de profil en flux** | `showSaveFilePicker` + `generateInternalStream` (Chrome/Edge) contre le pic RAM des très gros exports | si un cas réel le demande |
| **Tendance des garde-fous** | Le tableau de la CI (`ci.yml › tableau-garde-fous`) n'a pas d'historique d'une version à l'autre | non prioritaire |

---

## 5. 🧹 Code — dettes, pièges et mort documenté

**Deux leçons qui protègent le prochain nettoyage**
- Sur 76 paires de sélecteurs CSS « dupliqués » (09/08), **8 seulement** étaient mortes : le reste est du *layering*
  volontaire. Retirer **sélecteur par sélecteur**, après vérification **propriété par propriété**, jamais par plage.
- **« Jamais appelé » ≠ « à appeler »** : `_revokeTilesBlobUrls()` branché à tort (révoqué en v1.77.0) révoquait le
  plan encore affiché. Vérifier le DESIGN avant de brancher un cleanup.

**📌 Gardé exprès — ne pas supprimer sans arbitrage KARMA**
`_renderMultiLevelSection` / `_bindMultiLevelToggle` (rétro-compat v1.7.3) · `_proHashShort` / `_proSourceLabel` ·
dispatch `mktm:secours-scenario-mutated` (point d'extension) · `__ktaStyleCanon` (diagnostic) · `PERF_MODE_SIZE_BYTES`
(alias) · `__MKTM_PRO_LICENSE__` (contrat d'en-tête) · branche mono-alerte d'`alertChecker` (instance qui sert l'ancien
format) · `ktaCouperModesOutils` (console) · exports `getPlanScale`, `getPlanSmartNav` (config.js), `chargerImageTuillee`
(tiling.js, cité par `TILING.md`) et événement `kta:imgLayerCalibChange` (0 écouteur, extension future) — arbitrage
KARMA du 14/10/2026.

**✅ Vérifié vivant — ne plus signaler** : `kta-toast-error` / `kta-toast-info` (construits par `"kta-toast-" + type`) ·
dans `style-secours.css` : `.kta-secours-retour--*`, `.kta-secours-mc-note`, `.leaflet-tooltip`.

**⚪ Décisions arrêtées — ne rien coder sans fait nouveau**
- **D0 — Magnétisme : rayon non plafonné en unités plan** ✅ (01/08). Le rayon d'accrochage est en pixels écran
  (14) : à z = −3, 112 unités plan. Décision KARMA : pas de plafond, `showRoadIntersections` à `false` par défaut.
  > ⚠️ Désaccord consigné (Claude) : masquer les cercles supprime le *signal*, pas la *cause* — correctif d'une ligne
  > dans `road.js > _snapSurSommetProche` (`Math.min(tolÉcran, ~15 unités plan)`), à reconsidérer si un tracé fait au
  > magnétisme dézoomé se révèle déformé.
- **D7 — Duplication de ~2 fonctions** (pickers géoréf ↔ départ tracker, ⚠️ doc seule) : mutualiser **si une 3ᵉ cible
  apparaît**.

---

## 🚫 Enterré volontairement — ne pas repayer

| Sujet | Statut |
|---|---|
| **Doublon 📐 Mesure / 📐 Distance** (barre de droite) | Accepté le 14/10/2026 : c'est l'accordéon groupe + sous-action |
| **D3 — « Mes annotations » ne masque pas les tracés** | Fermé le 14/10/2026 : mécanisme réfuté (12/12 cas au harnais). Ce qui reste visible par design : l'itinéraire et les tracés d'un autre calque de données. Ne rouvrir qu'avec un tracé récalcitrant sous la main (`window.layerEditor.hasLayer(<layer>)`) |
| **Sonar en CI (runner sur le poste)** | Non (KARMA, 10/10) : la marche 1ter de `merge-main.ps1` suffit |
| **Protection de branche GitHub (payante)** | Non tant que KARMA est seul à écrire (10/10) |
| **Podomètre / mode poche** | Infaisable depuis une page web (29/09) ; le vrai obstacle en poche est le cap |
| **Plein écran iPhone** | 2 tentatives, 2 rollbacks : un commentaire d'`index.html` interdit une 3ᵉ sans diagnostic sur appareil |
| **QR Share Secours** | QR trop denses ; remplacé par l'import consolidé |
| **Traversée de portail en Vue OSM** | Pas de position courante ni de plan « où tu es » en OSM (01/08) |
| **Mode terrain (L1) et point rapide (L2)** | Écartés le 14/09 |
| **Import Shapefile** | QGIS exporte en GeoJSON, que l'app lit (29/09) |
| **Journal des notifications (cloche)**, **dossier « 🌐 Serveur » automatique** | Enterrés le 29/09 |
| **Atlas : tri, seuil de pertinence, mesure à 20 plans** | Enterré le 29/09 (outil retiré le 07/10) |
| **Test de l'import SIG sur de vrais exports QGIS** | Le harnais couvre parsers, CRS, Lambert 93 (29/09) |
| **Transparence des plans scannés** | Un JPEG n'a pas d'alpha ; l'opacité compense (29/09) |
| **Plan orienté : Nord, contre-rotation des tooltips, inertie** | « Bien comme ça pour le moment » (29/09) |
| **Guidage : voix / vibration, validation terrain des seuils** | Enterré le 29/09 |
| **Briefing pompiers sans accord OSM** | Laissé en l'état (30/09) |
| **Créer un tag depuis l'éditeur « comme ➕ Nouveau type… »** | « ➕ Créer un nouveau tag… » suffit (09/10) |
