# 🚫 Décisions fermées — MyKTAMap

> Ce qui a été **enterré**, **accepté** ou **décidé**, avec sa raison, et les **leçons** qui protègent le prochain
> chantier. À lire **avant de reproposer** un sujet : on ne le rouvre qu'avec un fait nouveau (bug, retour terrain,
> demande explicite de KARMA). Ce n'est pas du travail : le travail ouvert vit dans `docs/BACKLOG.md`, les pistes
> dans `docs/IDEES.md`.

## Décisions arrêtées — ne rien coder sans fait nouveau

- **D0 — Magnétisme : rayon non plafonné en unités plan** ✅ (01/08). Le rayon d'accrochage est en pixels écran
  (14) : à z = −3, 112 unités plan. Décision KARMA : pas de plafond, `showRoadIntersections` à `false` par défaut
  (les cercles d'intersection signalaient aussi de faux contacts entre tracés qui se frôlent).
  > ⚠️ Désaccord consigné (Claude) : masquer les cercles supprime le *signal*, pas la *cause* — correctif d'une ligne
  > dans `road.js > _snapSurSommetProche` (`Math.min(tolÉcran, ~15 unités plan)`), à reconsidérer si un tracé fait au
  > magnétisme dézoomé se révèle déformé.
- **D7 — Duplication de ~2 fonctions** (pickers géoréf ↔ départ tracker, ⚠️ doc seule) : mutualiser **si une 3ᵉ cible
  apparaît**.
- **« Session d'une autre version du plan »** — si l'utilisateur choisit « Ignorer », la question revient : voulu,
  rien n'est effacé sans accord. À revoir seulement si un utilisateur s'en plaint (10/10).
- **FR en dur restant** — tri complet fait le 09/10. Assumé : `confadmin.html` (100 % FR), motifs de config
  invalide de `ktaExtensions.js`, `Error` techniques. Le reste se migre au fil de l'eau, quand on touche le module.

## Enterré volontairement — ne pas repayer

| Sujet | Raison |
|---|---|
| **Doublon 📐 Mesure / 📐 Distance** (barre de droite) | Accepté le 14/10/2026 : c'est l'accordéon groupe + sous-action |
| **D3 — « Mes annotations » ne masque pas les tracés** | Fermé le 14/10/2026 : mécanisme réfuté (12/12 cas au harnais). Ce qui reste visible par design : l'itinéraire et les tracés d'un autre calque de données. Ne rouvrir qu'avec un tracé récalcitrant sous la main (`window.layerEditor.hasLayer(<layer>)`) |
| **Calage Lambert 93 exact d'un GeoTIFF** (CRS du fichier mémorisé) | Enterré (KARMA, 28/10/2026), repris au besoin sur un cas réel : le plan tangent tient l'objectif < 1 m, il ne resterait que 0,35 m aux coins d'un GeoTIFF de 6 km (`docs/ETUDE_CALAGE_PROJECTION.md`) |
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
| **D-light-icons** (thème clair PC : émojis hors cadre à zoom 100 %) | Enterré le 20/10/2026 : non reproduit au harnais depuis le 09/08. Rouvrir s'il réapparaît, avec une capture DevTools (`text-indent` / `display` du bouton touché) ; pistes : extension navigateur, échelle Windows 125 % |

## Leçons du nettoyage de code

- Sur 76 paires de sélecteurs CSS « dupliqués » (09/08), **8 seulement** étaient mortes : le reste est du
  *layering* volontaire. Retirer **sélecteur par sélecteur**, après vérification **propriété par propriété**, jamais
  par plage.
- **« Jamais appelé » ≠ « à appeler »** : `_revokeTilesBlobUrls()` branché à tort (révoqué en v1.77.0) révoquait le
  plan encore affiché. Vérifier le DESIGN avant de brancher un cleanup.

## 📌 Gardé exprès — ne pas supprimer sans arbitrage KARMA

`_renderMultiLevelSection` / `_bindMultiLevelToggle` (rétro-compat v1.7.3) · `_proHashShort` / `_proSourceLabel` ·
dispatch `mktm:secours-scenario-mutated` (point d'extension) · `__ktaStyleCanon` (diagnostic) · `PERF_MODE_SIZE_BYTES`
(alias) · `__MKTM_PRO_LICENSE__` (contrat d'en-tête) · branche mono-alerte d'`alertChecker` (instance qui sert l'ancien
format) · `ktaCouperModesOutils` (console) · exports `getPlanScale`, `getPlanSmartNav` (config.js), `chargerImageTuillee`
(tiling.js, cité par `TILING.md`) et événement `kta:imgLayerCalibChange` (0 écouteur, extension future) — arbitrage
KARMA du 14/10/2026.

## ✅ Vérifié vivant — ne plus signaler

`kta-toast-error` / `kta-toast-info` (construits par `"kta-toast-" + type`) · dans `style-secours.css` :
`.kta-secours-retour--*`, `.kta-secours-mc-note`, `.leaflet-tooltip`.
