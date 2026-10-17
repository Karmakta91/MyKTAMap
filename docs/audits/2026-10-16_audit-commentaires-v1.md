# Audit des commentaires du code — v1 (16/10/2026)

> Périmètre : `js/` (129 fichiers), `sw.js`, `css/style.css`, `scripts/` (99 fichiers `.js`, hors `node_modules`),
> `index.html` et `.githooks/` en appoint. `lib/` exclu (tiers), `data/` non lu.
> Audit **lecture seule** : rien n'a été modifié dans le code. Mesures faites par des scripts jetables hors dépôt,
> sur un export `git archive HEAD` (commit `2ef3cee`).
> Ne porte QUE sur les commentaires, pas sur la logique.

---

## 1. Résumé (la vérité qui dérange d'abord)

1. **Des garde-fous lisent les commentaires, et deux d'entre eux ne sont verts QUE grâce à un commentaire.**
   [Certain — expérience exécutée] Sur une copie du dépôt dont on a retiré tous les commentaires (licences `/*!`
   gardées, `node -c` OK sur les 130 fichiers), **13 des 80 garde-fous du pre-commit passent au rouge**. Trois
   autres s'affaiblissent sans rougir. Et `check-aide-contextuelle.js` et `check-portee-reglages.js` valident un
   texte qui n'existe plus que dans un commentaire : ils sont **faussement verts aujourd'hui** (§5.4). Conséquence :
   on ne nettoie rien avant d'avoir réancré ces contrôles sur le code (lot QW1-QW2).
2. **Le code porte un deuxième journal de versions.** [Certain] 3 968 lignes de commentaire citent un numéro de
   version, dont **1 879 commencent par un tag** (`// 🆕 v1.56.0 — …`). 2 075 blocs (8 675 lignes) s'ouvrent sur un tag
   de version. On compte aussi 1 462 lignes qui citent « KARMA » et 807 dates. C'est l'historique que la règle du dépôt
   range dans `README.md` et Git, pas dans le code.
3. **Volume.** [Certain] 43 005 lignes de pur commentaire pour 122 035 lignes de code, soit **35 %** (38 % dans
   `js/`). Ce n'est pas excessif en soi pour un projet sans framework ni types. Le vrai problème : **un quart à un
   tiers de ces lignes raconte l'histoire au lieu d'expliquer l'état actuel**.
4. **Peu de pourriture « classique ».** [Certain] On ne trouve aucun TODO/FIXME, presque pas de code commenté mort.
   Les références mortes sont rares mais réelles : environ 15 confirmées (fonctions, fichiers et chemins de doc
   disparus), plus 31 renvois à un « numéro de ligne », faux par nature.
5. **Le style n'est pas harmonisé.** [Certain] Deux formes d'en-tête de licence coexistent (99 longues, 31
   courtes). Les en-têtes de module vont de 0 à 124 lignes. On relève environ 110 variantes de bannières
   (`=`×25/60/69/73/76, `═`, `─`, `-`), 4 583 lignes de commentaire avec emoji et environ 15 emojis de « préfixe »
   au sens flottant.
6. **Le gain est réaliste.** [Probable] On peut retirer **10 000 à 14 000 lignes** de commentaire (−25 à −30 %),
   sans toucher une ligne de code. C'est prouvable mécaniquement : le code sans commentaires doit rester identique
   avant et après.

---

## 2. Mesures

Méthode : un tokenizer qui ignore les chaînes, les templates et les regex. Une ligne compte en « pur commentaire »
si elle ne porte aucun code. Les lignes mixtes (code + `// …` en fin de ligne) comptent en code ; on en trouve
environ 1 950. [Certain sur le principe ; les chiffres sont à ±1 % près, car la détection des regex littérales est
approximative.]

| Zone | Fichiers | Lignes | Lignes de code | Lignes de pur commentaire | Commentaire / code | Lignes avec `vX.Y` |
|---|---:|---:|---:|---:|---:|---:|
| `js/` | 129 | 136 089 | 87 447 | 33 367 | **38 %** | 3 211 |
| `sw.js` | 1 | 1 428 | 818 | 551 | **67 %** | 118 |
| `css/style.css` | 1 | 22 741 | 17 662 | 3 812 | 22 % | 429 |
| `scripts/` | 99 | 23 027 | 16 108 | 5 275 | 33 % | 210 |
| **Total** | 230 | **183 285** | **122 035** | **43 005** | **35 %** | **3 968** |

En appoint : `index.html` compte 211 commentaires HTML, dont 124 avec un numéro de version. `.githooks/pre-commit`
compte 464 lignes `#` sur 623, dont 34 avec un tag de version.

### Top 20 — volume absolu (lignes de pur commentaire)

| # | Fichier | Lignes | Code | Commentaire | Ratio | Lignes `vX.Y` | « KARMA » |
|---:|---|---:|---:|---:|---:|---:|---:|
| 1 | `css/style.css` | 22 741 | 17 662 | 3 812 | 22 % | 429 | 220 |
| 2 | `js/secoursMode.js` | 13 489 | 10 357 | 2 573 | 25 % | 265 | 86 |
| 3 | `js/utils.js` | 3 773 | 2 345 | 1 213 | 52 % | 129 | 25 |
| 4 | `js/interface.js` | 4 361 | 2 501 | 1 110 | 44 % | 144 | 65 |
| 5 | `js/osmHomePreview.js` | 3 743 | 2 532 | 1 021 | 40 % | 191 | 51 |
| 6 | `js/main.js` | 2 563 | 1 383 | 1 013 | 73 % | 121 | 47 |
| 7 | `js/sessionExporter.js` | 4 663 | 2 853 | 820 | 29 % | 151 | 18 |
| 8 | `js/homeLoader.js` | 3 501 | 2 546 | 746 | 29 % | 81 | 46 |
| 9 | `js/emergencyMode.js` | 2 120 | 1 285 | 701 | 55 % | 69 | 46 |
| 10 | `js/osmView.js` | 2 653 | 1 798 | 701 | 39 % | 141 | 14 |
| 11 | `js/refonteInterface.js` | 2 748 | 1 896 | 696 | 37 % | 88 | 33 |
| 12 | `js/tracking.js` | 1 671 | 837 | 693 | **83 %** | 47 | 17 |
| 13 | `js/config.js` | 1 623 | 872 | 653 | **75 %** | 81 | 21 |
| 14 | `js/createConf.js` | 5 922 | 2 095 | 649 | 31 % | 80 | 18 |
| 15 | `js/homeProfile.js` | 2 653 | 1 893 | 633 | 33 % | 105 | 33 |
| 16 | `js/exporter.js` | 3 321 | 2 164 | 610 | 28 % | 57 | 14 |
| 17 | `js/road.js` | 1 573 | 865 | 588 | 68 % | 55 | 8 |
| 18 | `js/sigImport.js` | 1 504 | 845 | 562 | 67 % | 36 | 18 |
| 19 | `sw.js` | 1 428 | 818 | 551 | 67 % | 118 | 8 |
| 20 | `js/interfaceItineraire.js` | 2 445 | 1 758 | 534 | 30 % | 44 | 16 |

### Top ratio (fichiers ≥ 100 lignes de code)

`modalLifecycle.js` 103 % · `styleResolver.js` 100 % · `check-portee-reglages.js` 91 % · `tracking.js` 83 % ·
`structures.js` 79 % · `imageLayerCalibration.js` 77 % · `wakeLock.js` 76 % · `config.js` 75 % ·
`interfaceDistanceTotale.js` 74 % · `main.js` 73 %.
[Probable] Les deux premiers sont **légitimes** : ils documentent un contrat d'API (exemples d'usage, règles du
résolveur). `tracking.js`, `config.js` et `main.js` sont surtout chargés de récit.

### Forme des blocs (js + sw + css)

- 10 547 blocs de commentaire consécutifs, 36 043 lignes.
- Taille : 1 ligne → 4 913 lignes · 2-4 → 10 036 · 5-9 → 8 513 · 10-19 → 6 340 · **20+ → 6 241**.
- 2 075 blocs (8 675 lignes) s'ouvrent sur un tag de version ; 6 572 lignes portent un marqueur de récit (« avant »,
  « depuis vX », « KARMA », date, « fix3 », « hotfix », « vécu le »…).
- En-têtes de module (bloc de tête après la licence) : médiane **38 lignes**, total 5 291 lignes ; maximum
  `osmView.js` 124, `secoursMode.js` 99, `photos.js` 98, `osmHomePreview.js` 88, `journal.js` 85. À l'inverse,
  `utils.js` (3 773 lignes) n'a **aucune** description de module, et `map.js`/`editor.js`/`road.js` ont un titre seul.

---

## 3. Typologie, avec exemples

### 3.1 Journal de versions dans le code — le gros morceau

[Certain] Il s'agit de 1 879 lignes ouvertes par un tag de version et de 1 853 autres lignes qui citent une version
dans le texte. Échantillon :

- `js/alertChecker.js:234` `// 🆕 v1.56.0 — onDone : signal de fin pour le séquenceur…`
- `js/emergencyMode.js:794` `// 🆕 v1.10.2 : init du minimap…`
- `js/homeLoader.js:382` `// v1.14.20-hotfix6 — route KMZ vers la modale d'import dédiée`
- `js/secoursMode.js:8366` `// 🐛 v1.23.0-fixB (KARMA "georef pas pris en compte…`
- `js/structures.js:868` et `js/utils.js:2236` `// 🆔 v2.1.0` : **le tag seul sur sa ligne**, sans aucune information.
- `css/style.css:16255` `* 🔧 v1.13.0-fix12 — UNLOCK GATE + PIN GATE + PIN PROPOSAL`
- `js/main.js:1912` `// 🆕 v1.8.0 : 4000ms → 3500ms (demande KARMA)…` : un changelog pur au-dessus d'une constante.
- `js/osmView.js:22-26` : l'en-tête raconte le bug « Avant v1.39.10, on chargeait l'image complète… Depuis v1.39.10… »,
  alors que l'état actuel tient en une phrase (« plans V2 tuilés seulement, sinon OOM GPU mobile »).
- `js/interfaceConfig.js:132-135` : un paragraphe sur des fonctions **retirées** en v1.92.0. Il décrit du code qui
  n'existe plus.
- `js/interfaceDocs.js:1234` : « `_aideHtmlFr()` et `_aideHtmlEn()` ont été SUPPRIMÉES ici : 1 738 lignes… ». Même
  cas : c'est de l'histoire.

Les attributions et citations (« KARMA "garder le tracé…" », `js/tracking.js:1508`) et les dates (« 🚨 26/09/2026 — »)
relèvent du même genre. Elles ont leur place dans le message de commit.

### 3.2 Commentaires qui paraphrasent le code

[Probable] Une heuristique (commentaire isolé de 1 à 5 mots presque tous repris par la ligne suivante) remonte 126
candidats. Le vrai nombre est plus élevé : l'heuristique ne voit pas les reformulations. Exemples :

- `js/planDenylist.js:321` `// Action` → `const actions = document.createElement("div");`
- `js/secoursMode.js:11081` `// Rename groupe` → `querySelectorAll('[data-action="rename-groupe"]')`
- `js/secoursMode.js:11425` `// Toggle pause` → `[data-action="live-toggle-pause"]`
- `js/tableEditor.js:752` `// Listeners` → `addEventListener(…)`
- `js/tiling.js:1180` `// Canvas de tuile` → `document.createElement('canvas')`
- `js/sessionReport.js:285` `// Tracker` → `if (o.includeTracker !== false…`

Les titres de section courts (`// Membres`, `// Footer`) se discutent : ils servent de repères dans les gros
gabarits HTML de `secoursMode.js`. **À garder s'ils découpent un gabarit de plus de 50 lignes**, à retirer sinon.

### 3.3 Commentaires périmés ou faux (vérifiés par grep)

[Certain] Chaque identifiant ci-dessous est **absent du code** de `js/`, `sw.js`, `index.html`, `lang/` et `lib/` :

| Où | Ce qui est cité | Réalité |
|---|---|---|
| `js/sigImport.js:474`, `:1485` | `scripts/check-webmercator.js` | n'existe pas |
| `js/sessionExporter.js:2213` | `sessionImporter.js (v1.34.30+)` | aucun fichier de ce nom |
| `js/main.js:58`, `js/favoris.js:442`, `js/sessionBackups.js:50` | `startApp()` / `main.js > startApp` | aucune fonction `startApp` |
| `js/osmView.js:314` | `_isAvailable()` | absente |
| `js/planDenylist.js:398` | `clearAllHashes()` | absente |
| `js/wakeLock.js:198` | `` `_rearmerApresBoot` `` | absente |
| `js/interface.js:3675` | `` `_construireFlyout` `` | absente (`_ouvrirFlyout`/`_toggleFlyout` existent) |
| `sw.js:17`, `:24`, `:25` | `docs/CLAUDE.md`, `docs/README_USER.md`, `docs/AI_CONTEXT.md` | ces fichiers vivent à la racine ou dans `docs/applications/` |
| `js/interfaceDocs.js:1252-1261`, `:1348` | `docs/AI_CONTEXT.md` | `docs/applications/AI_CONTEXT.md` |
| `js/homeLoader.js:2299` | `docs/audits/2026-09-16_etude-dossiers-mes-plans.md` | archivé (le commentaire le dit, mais le chemin est mort) |

**Renvois à un numéro de ligne** [Certain] : on en compte 31, et tous sont fragiles. Deux vérifiés faux :

- `js/exporter.js:2185` situe `ajouterPointsDepuisJSON` « ligne 645 » ; elle est à la ligne 2462 de `utils.js`.
- `js/createConf.js:4466` renvoie à « kmzExport.js ligne 485 » ; cette ligne est aujourd'hui un commentaire de
  documentation du format.

Autres cas : `js/editor.js:1020`, `js/exporter.js:2297`, `js/gpxIO.js:73`, `js/osmView.js:510`…

### 3.4 Code commenté mort

[Certain] Quasi nul. Les ~97 lignes « qui ressemblent à du code » sont des **exemples d'API** volontaires
(`js/modalLifecycle.js:23-72`, les blocs `window.X = {…}` des en-têtes de `batteryGuard`, `gpxIO`, `osmTilesCache`…).
Ils sont à garder. Il n'y a rien à purger de ce côté.

### 3.5 TODO / FIXME / XXX

[Certain] Zéro. La seule occurrence (`js/exporter.js:2416`, `cust-XXX`) est un motif d'identifiant. La règle
« le reste à faire vit dans `docs/BACKLOG.md` » est tenue.

### 3.6 En-têtes de fichier hétérogènes

[Certain]
- **Licence** : 99 fichiers en forme longue (4 lignes, avec URL et « Usage commercial interdit… »), 31 en forme
  courte (`osmView.js` : « Licence : CC BY-NC-SA 4.0 »), et `copyright.js` en forme étendue.
  `check-entete-licence.js` accepte les deux formes.
- **Titre du module** : `// =========================\n// MAP.JS — …\n// =========================` (124 fichiers,
  `=`×25) ou un encadré `/* ==== */` (4 fichiers). Le titre est en MAJUSCULES pour certains (`OSM-VIEW.JS`), en
  minuscules pour d'autres. On y trouve souvent une version (« Mode "Vue OSM" (v1.39.16) »).
- **Contenu** : de rien (`utils.js`) à un mini-roman (`osmView.js`, 124 lignes avec 7 versions citées).

### 3.7 Style mélangé

- **Bannières** [Certain] : 3 054 lignes de bannière, environ 110 variantes. Les plus fréquentes : `=`×25 (971),
  `=`×60 (456), `=`×69 (347), `─`×9 (196), `-`×10 (151), `=`×73 (118), `═`×9 (82)… `.githooks/pre-commit` a son
  propre style `# ====`.
- **Emojis** [Certain] : 4 583 lignes de commentaire en portent. Préfixes les plus courants : 🆕 1 557, 🐛 386,
  🩸 344, ⚠️ 231, 🔧 78, ✅ 43, 🎯 42, plus une longue traîne (🧙 🧷 📄 📝 🆔 📉 🎨 🗼 🏗️…). **🆕 et 🐛 sont
  presque toujours collés à une version** : ils disparaîtront avec elle. 🩸 (« piège ») et ⚠️ portent du sens.
- **Langue** [Certain] : le français domine (≈ 12 600 lignes contre 1 nettement anglaise). Le franglais est
  courant (« Toggle pause », « Drop zone », « fallback », « re-render », « Step 1 », « hotfix ») ; on peut le
  tolérer pour les termes techniques.
- **Accents absents** [Certain] : on trouve des commentaires récents sans accents ni apostrophes, par exemple
  `js/utils.js:1053-1057` (« LIGNE SEPAREE… meme… d un point… c est »), `js/wakeLock.js:195` (« l ecran »), et une
  vingtaine de fichiers avec « deja », « defaut », « qu il ». **Aucun outil ne dépend de cette absence d'accents
  dans `js/`** [Probable : aucune trace dans `scripts/`]. Ce sont des scories de saisie. **À préserver tels
  quels** : la ligne de licence « accord ecrit prealable » (texte canonique identique dans 100 fichiers), le bloc
  de `js/copyright.js` (watermark), et les commentaires sans accents de `.githooks/pre-commit` (choix d'encodage du
  shell).

---

## 4. Ce qui a de la vraie valeur — À GARDER

[Certain] Ces commentaires sont la mémoire des pièges. Les supprimer, c'est réinviter les bugs :

- **Le « pourquoi » d'un choix non évident** : `js/interfaceDocs.js:845-853` explique pourquoi on insère dans
  `croix.parentNode` (`querySelector` cherche en profondeur, `NotFoundError` levé hors de tout `try` depuis un
  MutationObserver). Il faut le garder, **mais au présent et sans la date ni le récit du smoke**.
- **Les contrats et exemples d'API** : en-têtes de `modalLifecycle.js`, `styleResolver.js`, `ktaExtensions.js`,
  blocs `window.X = { … }` des modules IIFE.
- **Les renvois aux garde-fous** : `// Garde-fou : scripts/check-secours-balayage.js` (`js/secoursBalayage.js:21`),
  ainsi que les renvois à `check-style-canon`, `check-icon-catalog`, `check-aide-sections`, `check-map-listeners`… À
  garder **et à vérifier** : un renvoi à un fichier absent (`check-webmercator.js`) est pire que rien.
- **Les marqueurs d'exemption lus par les outils** : `// popup-native-ok` (2) et `// lint-ok-modal-lifecycle` (8)
  (§5.2).
- **Les unités, conventions de coordonnées, invariants** (`[imageHeight - y, x]`, px/m, ordre des bits LZW…).
- **Les mises en garde de sécurité** : `js/unlockGate.js:21`, `:97-98` (« barrière SOCIALE », « brute-forcer hors
  ligne ») sont **exigées** par `check-gate-instance.js`.
- **L'en-tête de licence `/*!`** : exigé par `check-entete-licence.js` (« Flavien VIDAL » + « CC BY-NC-SA » dans les
  15 premières lignes). Le `!` le préserve à la minification.

---

## 5. Commentaires lus par des outils — NE PAS TOUCHER sans adapter le garde-fou

Expérience [Certain] : la copie sans commentaires (`js/*.js`, `sw.js`, `css/style.css`, commentaires HTML de
`index.html`) a été passée aux 80 scripts du pre-commit, avec `CI=1`. **13 passent au rouge**, alors que la copie
témoin est verte. Les deux rouges de la copie témoin (`check-livrables-docs`, `check-tiling`) tiennent à
l'environnement de l'export et sont identiques des deux côtés.

### 5.1 Ancres : un commentaire sert de début ou de fin de découpe

| Garde-fou | Ancre (texte exact) | Fichier source |
|---|---|---|
| `check-doc-recherche.js:81` | `// Filtrage par recherche (titre + contenu` | `js/interfaceDocs.js:1162` |
| `check-extensions.js:517` | `_filtre = {…};\n  // initialTab` (dans la regex) | `js/sessionExporter.js:563-564` |
| `check-filets-donnees.js:103` | `// v1.16.0 step 1d` ⚠️ **un tag de version** | `js/structures.js:521` |
| `check-filets-donnees.js:175` | `// Tentative ratée` | `js/pinLock.js:407` |
| `check-filets-donnees.js:178` | `// ====…\n  // PROPOSITION D'ACTIVATION` | `js/pinLock.js` |
| `check-filets-donnees.js:186` | `// ===` (bannière) | `js/unlockGate.js` |
| `check-filets-donnees.js:155` | `// 🧹 v1.29.0-fix3` ⚠️ tag de version | (planner) |
| `check-journal-demarrage.js:105` | `// Balayage différé` | `js/journal.js:1170` |
| `check-legend-roundtrip.js:210` | `  /**` (début de JSDoc) | `js/statsGlobales.js` |
| `check-osm-outils.js:142` | `// 6) 🆕 v1.39.12 — Step 1 : POI session` ⚠️ tag de version | `js/osmView.js:2370` |
| `check-osm-pile.js:163` | `// ceinture` (dans la regex) | `js/osmHomePreview.js:2589` |
| `check-plan-folders.js:166` | `<!-- Filtres` | `index.html:461` |
| `check-plan-tags.js:74` | `// 🏷️ début-tags-config` / `// 🏷️ fin-tags-config` | `js/main.js:1690/1702`, `js/importMasse.js:273/281` |
| `check-etat-visible.js:65`, `:94` | `// 🔄 v1.85.0`, `// 🐛 v1.57.2` ⚠️ tags de version | `js/sessionPersist.js`, `js/interface.js` |
| `check-reglages-immediats.js:66` | `// ── Fermeture` | `js/interfaceConfig.js:1005` |

⚠️ **Au moins 5 de ces ancres sont des tags de version.** Un retrait automatique des tags (QW4) casserait donc les
garde-fous. **L'échec est en partie silencieux** [Certain] : `bloc()` (`check-filets-donnees.js:39`,
`check-etat-visible.js:26`) découpe **jusqu'à la fin du fichier** quand l'ancre de fin manque. Les assertions
positives (`includes(…)`) restent vertes sur un périmètre bien plus large, c'est-à-dire qu'elles ne prouvent plus
rien. `check-etat-visible` et `check-reglages-immediats` n'ont pas rougi dans l'expérience, pour cette raison.

### 5.2 Marqueurs d'exemption

- `// popup-native-ok` : lu par `check-popups-natives.js:97` (`js/swRegister.js:102`, `js/utils.js:733`). Sans lui,
  2 popups au-dessus du plafond 0 → **rouge**.
- `// lint-ok-modal-lifecycle` : lu par `check-modal-lifecycle.js:52` (8 occurrences, dont `js/lostMode.js:361`,
  `:798`, `:1244`). Le linter est consultatif ; il n'a donc pas rougi, mais il crierait.

### 5.3 Contenu de commentaire exigé (volontaire)

- `check-gate-instance.js:291` exige « brute-forcer hors ligne » et « Barrière SOCIALE » dans `js/unlockGate.js` :
  c'est une documentation de sécurité imposée.
- `check-home-layout.js:107` exige qu'un commentaire CSS ne dise **plus** « Actions compactée ~510 px » : c'est un
  contrôle « le commentaire ne ment plus ».

### 5.4 Faux verts : le contrôle est satisfait par un commentaire, pas par le code

- **`check-aide-contextuelle.js:129`** cherche `head.insertBefore(b, croix)`. Le code réel est
  `croix.parentNode.insertBefore(b, croix)` (`js/interfaceDocs.js:854`). La regex trouve l'**ancienne** forme
  **dans le commentaire** qui raconte le bug (`:847`). Le contrôle est vert pour une mauvaise raison ; il faut le
  réécrire sur le code actuel.
- **`check-portee-reglages.js:257`** exige `"affichage read-only"` dans `interfaceConfig.js`. Cette chaîne n'existe
  qu'en commentaire (`js/interfaceConfig.js:1051`). La moitié positive du contrôle ne vérifie donc rien.

### 5.5 Autres lecteurs

- `scripts/release/etat-sites.ps1:64` prend la **première** occurrence de `myktamap-cache-(v[0-9.]+)` dans `sw.js`.
  Un commentaire qui citerait ce motif au-dessus de `CACHE_NAME` (ligne 35) détournerait la lecture. C'est un risque
  à l'**ajout**, pas au retrait ; `merge-main.ps1:110` ancre bien sur `CACHE_NAME`.
- `check-no-pro-leak.js` et `check-noms-reels.js` scannent aussi les commentaires. Nettoyer réduit le risque ; cela
  ne casse rien.
- Le générateur `MyKTAMap-doc` lit les `.md` et `.html`, **pas** les commentaires JS [Probable : `manifeste.js`
  ne référence aucun `js/` du community].
- Les scripts qui retirent eux-mêmes les commentaires avant de chercher (`sansCommentaires` de
  `check-popups-natives`, `check-tiling`, `check-plan-offline`, `check-portee-reglages`, `check-podometre-global`,
  `check-import-masse`) sont **insensibles** au nettoyage. C'est le bon modèle.

---

## 6. Convention cible (courte)

**En-tête de fichier** (≤ 20 lignes après la licence, sans version ni date) :

```js
/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * https://myktamap.fr — Licence CC BY-NC-SA 4.0
 * Usage commercial interdit sans accord ecrit prealable. Voir LICENSE.
 */
// nomFichier.js — <rôle en une phrase>.
// Expose : window.X (méthodes principales) · Dépend de : utils.js, I18n
// Pièges : 🩸 <invariant qui casse en silence> (1 à 3 lignes chacun)
// Garde-fou : scripts/check-x.js · Doc : docs/architecture/x.md
```

**Quand commenter** : le **pourquoi** (choix non évident, alternative écartée), un **contrat** (format, unités,
qui appelle, ordre d'appel), un **piège**, un **renvoi** au garde-fou ou à la doc. **Jamais** : ce que la ligne
dit déjà, qui l'a demandé, quand, dans quelle version, ce qui existait avant.

**Pièges** : `// 🩸 <ce qui casse> — <pourquoi> (garde-fou : check-x.js)`, au présent. « On n'utilise PAS X : Y »
plutôt que « Avant v1.39.10 on faisait X ».

**Emojis** : trois préfixes seulement. 🩸 piège · ⚠️ contrat ou attention · 🔒 sécurité. Pas d'emoji décoratif.

**Sections** : une seule forme, `// ── Titre ──────────` (une ligne). La bannière `=` reste réservée au titre du
fichier, s'il y en a un.

**Références** : `fichier.js > fonction`, **jamais** un numéro de ligne.

**Ancres d'outils** : forme explicite et stable `// 🏷️ ancre:<nom>` (sur le modèle de `début-tags-config`), ou mieux
une ancre sur du code (nom de fonction). Jamais un tag de version ni une bannière.

**Historique** : message de commit et journal `README.md`. Le code décrit l'**état actuel**, comme
`docs/architecture/`.

**Langue** : français accentué ; les termes techniques anglais usuels sont acceptés.

---

## 7. Plan de nettoyage

Principe commun : **zéro changement de comportement, prouvé**. Pour chaque lot :
(1) `node -c` sur les fichiers touchés ;
(2) **équivalence mécanique** : le fichier sans commentaires est identique avant et après (même tokenizer que
l'audit ; tout écart de code fait échouer le lot) ;
(3) `sh .githooks/pre-commit` complet ;
(4) un commit par lot, sans bump (règle « pas de bump par correctif »), staging par chemins explicites.

### 🟢 Quick wins

- **QW1 — Réparer les deux faux verts** (`check-aide-contextuelle.js:129` → `croix.parentNode.insertBefore(b, croix)`
  ou une forme tolérante ; `check-portee-reglages.js:257` → un critère sur le code, pas sur `"affichage read-only"`).
  Ce sont deux scripts ; il faut les falsifier (sabotage du code → rouge). **À faire avant tout le reste.**
- **QW2 — Réancrer les 16 ancres de commentaire du §5.1** sur du code (nom de fonction suivante) ou sur une ancre
  explicite `🏷️ ancre:`. Faire en sorte que `bloc()` **échoue** quand l'ancre de fin est absente, au lieu de découper
  jusqu'à la fin du fichier. On touche environ 10 scripts. Prérequis de QW4.
- **QW3 — Corriger les références mortes du §3.3** : environ 15 commentaires, plus les 31 renvois « ligne N »
  (remplacés par `fichier > fonction` ou supprimés). Manuel, environ 1 h.
- **QW4 — Retrait automatique des tags de version en tête de commentaire** (`// 🆕 v1.56.0 — onDone…` →
  `// onDone…`). Il concerne 1 879 lignes, et une ligne qui ne contient que le tag (`// 🆔 v2.1.0`) est supprimée.
  Il faut un script en dry-run qui sort un diff relisible, avec une liste d'exclusion des ancres restantes. Gain :
  environ 100 à 200 lignes supprimées, mais surtout 1 879 lignes allégées et un bruit visuel divisé par deux. Les
  tags **au milieu** du texte (≈ 2 100 lignes) restent pour G1, car les retirer à l'aveugle casse les phrases.
- **QW5 — Garde-fou anti-récidive `check-commentaires.js`** en cliquet, sur le modèle de `check-popups-natives`.
  Sur les **lignes ajoutées** seulement (`git diff --cached -U0`, ou `KTA_FICHIERS_CI` en CI), il refuse :
  un tag de version en tête de commentaire, « ligne \d+ », un renvoi `scripts/check-*.js` vers un fichier absent.
  Un compteur global de tags de version ne peut que baisser. Il faut le brancher au pre-commit, donc il tourne aussi
  en CI.

### 🟡 Middle

- **M1 — Harmoniser les en-têtes (130 fichiers)** : passer les 31 licences courtes en forme longue (le texte
  canonique ne change pas). Appliquer le gabarit §6. Réduire les en-têtes de plus de 40 lignes (`osmView` 124,
  `secoursMode` 99, `photos` 98, `osmHomePreview` 88, `journal` 85…) à l'état actuel. **Écrire** l'en-tête manquant
  de `utils.js`. Gain estimé : −2 000 à −2 500 lignes. Manuel, fichier par fichier.
- **M2 — Bannières** : normaliser les ~110 variantes en deux formes. C'est en grande partie automatisable par
  regex, **après QW2** (`// ===`, `// ── Fermeture` sont des ancres aujourd'hui).
- **M3 — Emojis** : réduire aux trois préfixes du §6. C'est semi-automatique (🆕/🐛/🔧 tombent avec QW4 et G1) ;
  le reste se fait en relecture.
- **M4 — `css/style.css`** : 3 812 lignes de commentaire, dont 429 versionnées et 220 citant KARMA. Même traitement
  que G1, en lots par section (le fichier fait 22 741 lignes). La CSS n'a pas d'ancres d'outils (expérience
  verte), donc le risque est faible.
- **M5 — `sw.js` (67 %) et `.githooks/pre-commit`** : l'en-tête de `sw.js` décrit une organisation de `docs/`
  périmée (§3.3). Dans le hook, les 34 tags de version des blocs explicatifs peuvent devenir une ligne par contrôle
  (« ce qu'il protège »).

### 🔴 Gros chantiers

- **G1 — Réécriture des blocs-récits, fichier par fichier, au présent.** Elle cible les 8 675 lignes de blocs ouverts
  par une version et les 6 572 lignes à marqueur de récit. Ordre conseillé (volume × ratio) : `main.js`,
  `tracking.js`, `config.js`, `utils.js`, `interface.js`, `osmHomePreview.js`, `osmView.js`, `emergencyMode.js`,
  `road.js`, `sigImport.js`, puis `secoursMode.js` (2 573 lignes, en 3 ou 4 lots par section). Gain estimé : −30 à
  −40 % des commentaires de ces fichiers, soit **−7 000 à −10 000 lignes** au total. C'est entièrement manuel : il
  faut juger, pour chaque bloc, ce qui est un piège vivant et ce qui est de l'histoire. Il faut le faire **hors des
  périodes de développement actif** du fichier (KARMA travaille dans le même arbre).
- **G2 — Paraphrases et titres creux** : les 126 candidats de l'heuristique et les autres, traités pendant G1
  (pas de passe dédiée).
- **G3 — Accents et franglais** : on rétablit les accents des commentaires écrits sans (hors licence, `copyright.js`
  et hook shell) au fil de G1. Il n'y a pas de passe dédiée et l'enjeu est faible.

### Estimation globale

| Lot | Lignes retirées (estimation) | Mode |
|---|---:|---|
| QW3 + QW4 | 150 à 300, plus 1 879 lignes allégées | auto + manuel |
| M1 | 2 000 à 2 500 | manuel |
| M2 + M3 | ~0 en lignes (homogénéité) | auto après QW2 |
| M4 | 800 à 1 200 | manuel |
| G1 + G2 | 7 000 à 10 000 | manuel |
| **Total** | **≈ 10 000 à 14 000 (−25 à −30 %)** | ratio `js/` : 38 % → ≈ 26 % |

---

## 8. Risques

1. **Garde-fous cassés ou rendus muets** [Certain] : 13 rougissent et au moins 3 s'affaiblissent en silence. La
   parade : **QW1 et QW2 d'abord**, puis le pre-commit complet après chaque lot. Un garde-fou vert après le nettoyage
   ne prouve rien tant que `bloc()` découpe jusqu'à la fin du fichier sur une ancre absente.
2. **Changement de comportement accidentel** [Probable : faible] : une édition de commentaire peut mordre sur du
   code (un `*/` mal placé, un `//` dans une chaîne). La parade est la preuve d'équivalence « code sans commentaires
   identique » à chaque lot, plus `node -c`.
3. **Perte d'un « pourquoi »** [Probable] : un récit contient souvent la seule trace d'un piège. Règle de G1 : on
   **reformule au présent**, on ne supprime pas en bloc. L'historique reste dans `git log -L` / `git blame`.
4. **Conflits avec le travail de KARMA dans le même arbre** [Certain : configuration actuelle] : faire des lots
   courts par fichier, committés vite, en évitant le fichier en cours de développement. Toujours stager par chemins
   explicites.
5. **Diff illisible** : un commit de nettoyage ne doit contenir que des commentaires. Ne jamais le mélanger avec un
   correctif, sinon la revue et `git blame` deviennent inutilisables. On peut ajouter les commits de nettoyage à un
   `.git-blame-ignore-revs`.
6. **Textes canoniques** : ne pas toucher à la ligne de licence (« ecrit prealable »), au bloc de `copyright.js`, ni
   aux marqueurs `popup-native-ok` / `lint-ok-modal-lifecycle` / `🏷️ début|fin-tags-config`, ni aux mentions de
   sécurité exigées par `check-gate-instance.js`.
7. **Pas de bump** : un nettoyage de commentaires n'est pas une release ; les octets servis changent mais le
   comportement non. Il part avec la prochaine mise en prod décidée par KARMA.
