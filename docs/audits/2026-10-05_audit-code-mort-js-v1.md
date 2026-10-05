# Audit code mort JS — MyKTAMap community (branche Karma_dev, 05/10/2026)

Lecture seule. Aucun fichier du dépôt modifié. Scripts et copies de travail : ce dossier (`fn2.js`, `local.js`,
`vars.js`, `exp.js`, `ev.js`, `i18n.js`, `i18n2.js`, `eslint.config.mjs` + `jscopy/` = copie de `js/` lintée).

## ⚠️ À lire en premier — un bug trouvé en chemin, pas du code mort

**[Probable] Le droit « lecture seule » (extension) ne bloque pas l'ajout d'un point.** Le commit `dcd7fea`
(05/10, « prise lectureSeule ») a posé le garde `ktaEditionRefusee()` dans `toggleEdition()` (`js/editor.js:52`)
— or `toggleEdition` est **morte** (0 appelant, 0 dans le repo pro). Le vrai chemin du bouton ✏️ est la
`soloAction` de `js/interface.js:2911-2926`, qui pose `window.modeEdition = true` **sans** garde, et le clic carte
(`js/editor.js:78-88`, `_editorClickHandler`) n'en a pas non plus → `afficherFormulaire()` s'ouvre. Les tracés,
zones, structures et suppressions au clic, eux, sont bien gardés (`road.js:269`, `zones.js:215`,
`structures.js:508`, `interface.js:3812/3947/4079`). Code lu, **non exécuté** (pas de session pro au harnais).
`check-extensions.js` ne teste pas ce chemin. → C'est la leçon n°1 à l'envers : le garde a été branché sur le
point d'entrée mort. **Ne pas supprimer `toggleEdition` avant d'avoir corrigé ce trou** (le fix = déplacer le
garde dans la `soloAction` et/ou le clic éditeur, pas rebrancher `toggleEdition`).

Deux autres écarts doc ↔ code relevés (pas de suppression à faire, de la doc à remettre au propre) :
- `docs/architecture/secours.md:430-614` affirme que le Mode Secours calcule ses durées via
  `window.getItiTempsMinutes` : **faux** aujourd'hui, `secoursMode.js` a son propre modèle (`reglagesDuree`,
  `DUREE_DEFAUT.vitesseKmh`, l. 187/953/3095). [Certain]
- `docs/BACKLOG.md` § Code mort : `getTrackerLevel` « phase 2B, abandonnée ? » est **désormais consommée**
  (`js/ktaExtensions.js:716`, testée par `check-extensions.js:290`). L'entrée est périmée. [Certain]

## Résumé chiffré

| Mesure | Valeur |
|---|---|
| Fichiers `js/*.js` | 123 — **tous chargés** par `index.html` (comparaison `<script src>` ↔ `ls js`, 0 écart) |
| Noms de fonctions / `window.*` / constantes inventoriés | ~4 100 |
| Fonctions + `window.*` à 0 référence (code, HTML, sw.js, confadmin — commentaires retirés) | 25 |
| Variables locales jamais lues (ESLint `no-unused-vars`, portée réelle) | 40 signalements |
| Branches mortes (`if(false)`, code inatteignable, condition constante) | **0** (ESLint `no-unreachable` / `no-constant-condition` : 0) |
| Clés i18n `fr.json` | 5 602 · 5 113 littérales · 408 via alias de module · 71 via préfixe dynamique · **1 orpheline probable** |
| Événements émis sans écouteur / écoutés sans émetteur (hors `mktm:*`) | 1 (`kta:imgLayerCalibChange`, déjà connu) |
| **🟢 supprimable sans risque** | **19 entrées, ~45 lignes** |
| 🟡 à vérifier | 24 entrées |
| 📌 contrat / gardé exprès | 16 entrées |

Gain total réaliste : **~45 lignes en 🟢**, ~150 si tout le 🟡 passait. Le code est propre : l'audit du 09/08 a
déjà pris le gros, ce qui reste est surtout des **variables locales oubliées** après refactor.

**Méthode** (et ses limites) :
1. Commentaires retirés par un tokenizer maison (chaînes, templates, regex respectées ; les 123 fichiers dépouillés
   repassent `node -c`) → une mention en commentaire n'est **pas** un usage. Les chaînes sont **gardées** →
   un `onclick="foo()"` ou `appel("foo", …)` compte comme usage.
2. Recherche par mot entier dans `js/`, `index.html`, `sw.js`, `confadmin.html`, `killsw.html`, `ping.html`,
   puis séparément `scripts/**` (garde-fous) et **`../MyKTAMap-pro`** (lu, non cité) pour les `window.*`.
3. ESLint 9 installé **dans le scratchpad** sur une copie de `js/`, `vars: "local"` (les globales de script
   sont partagées entre fichiers : non jugées par ESLint, couvertes par l'étape 2).
4. Un nom qui peut être **construit** (`window[nom]`, `"prefix." + var`) est classé incertain.
- Non couvert : propriétés d'objets d'API (`window.Module = { a, b }`) — consommées par `.a`, impossible à trancher
  par grep ; CSS (hors périmètre).

---

## Tableau trié

### 🟢 Supprimable sans risque (tout est privé à une IIFE/fonction : aucun appelant externe possible)

| # | Fichier:ligne | Symbole | Preuve | Conf. | Gain |
|---|---|---|---|---|---|
| G1 | `js/pdfExport.js:66-74` | `function _formatLabel` + son commentaire | 1 seule occurrence hors commentaire (sa déclaration) ; la mention l.52 est un commentaire. IIFE l.28-803. ESLint idem | [Certain] | ~9 l. (+ retoucher le commentaire l.50-53) |
| G2 | `js/pdfExport.js:788-792` | `function _hexToRgb` | 1 occurrence (déclaration), IIFE ; ESLint idem. `secoursMode.js` a son propre `_hexToRgb` privé | [Certain] | 5 l. |
| G3 | `js/pdfExport.js:41` | `const FOOTER_HEIGHT_MM = 55` | grep `FOOTER` : seule la déclaration (l.684 = titre de section en commentaire). Le pied de page dédié a été retiré (« plus de footer dédié », l.532). ⚠️ Ne PAS toucher `HEADER_HEIGHT_MM` l.40 (vivante l.530, restaurée après le faux nettoyage du 09/08) | [Certain] | 1 l. |
| G4 | `js/sessionBackups.js:409-414` | `function _stopTimer` | 1 occurrence ; `_startTimer` vivant (l.430). Supprimer, **ne pas brancher** (leçon n°1 : le timer de snapshot auto est voulu permanent) | [Certain] | 6 l. |
| G5 | `js/map.js:215-218` | `const mk = function(...)` | local à `creerIcones()` ; 0 usage dans `map.js` (les `mk` d'autres fichiers sont d'autres locales). ESLint idem | [Certain] | 4 l. |
| G6 | `js/interPlanRoute.js:109-114` | `const links = … ? null : null` + `const all = []` + commentaire | `links` vaut toujours `null`, jamais lu ; `all` jamais lu (ESLint). Le BFS réel utilise `getLinksForPlan(cur)` l.124 | [Certain] | 6 l. |
| G7 | `js/interfaceDocs.js:872-873` | `const _aideLang` | jamais lue (ESLint) ; `I18n.getLang()` sans effet de bord | [Certain] | 2 l. |
| G8 | `js/osmView.js:394` | `const pA = …, pB = …` | ni `pA` ni `pB` lus (grep -w : 1 ligne) ; la projection passe par `buildTransformCalib(g)` | [Certain] | 1 l. |
| G9 | `js/osmHomePreview.js:1322` | `const pA = …, pB = …` | idem G8 (copie du même patron) | [Certain] | 1 l. |
| G10 | `js/secoursMode.js:5436` | `let totalPhotosInfo = null` | 1 occurrence (grep -w) | [Certain] | 1 l. |
| G11 | `js/secoursMode.js:6406` | `const originalText` | jamais relu ; l'overlay est détruit après génération (`overlay.remove()`), pas de restauration de libellé à faire | [Certain] | 1 l. |
| G12 | `js/secoursMode.js:9190` | `const defaultEquipeId` | 1 occurrence | [Certain] | 1 l. |
| G13 | `js/secoursMode.js:7297` | `const info = _getStatutInfo(…)` | jamais lue (ESLint) ; le libellé passe par `_statutLabelAscii` l.7299. `_getStatutInfo` est un lookup | [Probable] | 1 l. |
| G14 | `js/sessionExporter.js:1253` | `const labelEl` | 1 occurrence ; `getElementById` sans effet | [Certain] | 1 l. |
| G15 | `js/modeHistoire.js:494-495` | `const viewDiv`, `const editWrap` | jamais lues (ESLint) | [Certain] | 2 l. |
| G16 | `js/lostMode.js:1152-1153` | `const inZone`, `const outZone` | jamais lues (ESLint) ; `.filter` pur | [Certain] | 2 l. |
| G17 | `js/createConf.js:3702` | `const nomTxt` | jamais lue (ESLint) | [Certain] | 1 l. |
| G18 | `js/homeProfile.js:1503` | `const data = lic.getData()` | jamais lue depuis le retrait du bloc méta (v1.28.4) | [Probable] (getter supposé pur) | 1 l. |
| G19 | `confadmin.html:279` (+ affectation l.607) | `let _linksOrigine` | écrite, jamais lue (ESLint sur le script inline) | [Certain] | 2 l. |

### 🟡 À vérifier

| # | Fichier:ligne | Symbole | Pourquoi pas 🟢 | Conf. | Gain |
|---|---|---|---|---|---|
| Y1 | `js/editor.js:51-55` + export l.1089 | `toggleEdition` / `window.toggleEdition` | 0 appelant (community, scripts, pro). **Bloqué par le bug ci-dessus** : il porte le seul garde lecture-seule du mode ✏️. Corriger d'abord, supprimer ensuite | [Certain] mort · [Probable] bug | 6 l. |
| Y2 | `js/config.js:938-955` + export l.1488 | `setShowRoadIntersections` | remplacé par `set/getPlanShowsIntersections` (par plan, v1.36.2) ; 0 appelant. `window.*` = API, et `docs/architecture/ui.md:336` la décrit encore (doc à corriger dans le même commit) | [Certain] | ~20 l. |
| Y3 | `js/config.js:273-276` + export l.1504 | `getRuntimeAssetJson` | 0 appelant (`getRuntimeAssetUrl`, sa jumelle, est vivante). API publique | [Certain] | 5 l. |
| Y4 | `js/config.js:739` | export `window.ktaNettoyerIconesConfig` | la fonction `nettoyerIconesConfig` est vivante (l.756) ; seul l'**export** est inutilisé. Peut-être prévu pour le chemin ZIP (qui ne nettoie pas, lui) — question de design, pas de suppression aveugle | [Certain] | 1 l. |
| Y5 | `js/interfaceItineraire.js:480` | `window.getItiTempsMinutes` | 0 appelant ; la doc `secours.md` dit le contraire (cf. haut). `_tempsItineraireMinutes` reste vivant | [Certain] | 1 l. + doc |
| Y6 | `js/measure.js:360-394` + export l.401 | `telechargerMesureJSON` | 0 appelant, aucun bouton ; mais clés i18n `measure.alert.noMeasure` liées. Fonction utilisateur retirée de l'UI ou oubliée ? À KARMA | [Certain] | ~36 l. |
| Y7 | `js/tiling.js:1088-1090` + export l.1098 | `tuilingNecessaire` | 0 appelant ; **documenté** « dette connue, laissée en place » (`docs/TILING.md:145`, `perf-memory.md:53`) | [Certain] | 4 l. + 2 docs |
| Y8 | `js/tiling.js:47-59` + exports l.1101-1102 | `PERF_AUTO_META`, `PERF_OFF_META` | 0 lecture nulle part (libellés FR en dur, remplacés par i18n ?) | [Certain] | ~14 l. |
| Y9 | `js/road.js:360` | `ROAD_INTERSECTION_MAX_ROADS` | 0 lecture (seule mention l.455 = commentaire) ; « gardé pour rétro-compat des logs » mais aucun log ne la lit. Citée dans `AI_CONTEXT.md` / `NETWORK_AUDIT` / `README.md` → suppression = sync docs | [Certain] | 1 l. + docs |
| Y10 | `js/editor.js:1055-1070` + export l.1091 | `removeLastEditorPoint` | 0 appelant, **volontaire** : `check-repositionner.js:380` dit « la fonction survit (atteignable en console) ». Le garde-fou passe aussi si elle disparaît. Entraînerait 2 clés `editor.undo.removeLast*` | [Certain] | 16 l. |
| Y11 | `js/exporter.js:593-596`, `617-620` | `_chargerTagsCalque`, `_renderTagsCalque` | listés 📌 « wrappers compat exporter » dans BACKLOG — **mais ils sont privés à l'IIFE** (l.12-3280) : aucun « ancien caller » ne peut les atteindre. La raison du 📌 ne tient pas → **re-arbitrage KARMA** | [Certain] | 8 l. |
| Y12 | `js/measure.js:354-358` | `afficherDistance` | 📌 « wrapper compat measure » ; globale de script (atteignable), mais 0 appelant ici ni dans le pro. Laisser 📌 sauf arbitrage | [Certain] | 5 l. |
| Y13 | `js/secoursMode.js:10582` | `const g = addGroupe(…)` | binding inutile, **l'appel a un effet** : retirer `const g =`, garder l'appel | [Certain] | 0 l. |
| Y14 | `js/utils.js:1551` | `const res = window.Favoris.toggle(…)` | idem Y13 | [Certain] | 0 l. |
| Y15 | `js/createConf.js:2361/2365/2374` | `planBlob` | écrite (une blob URL), jamais lue : soit résidu, soit **révocation oubliée** de `planUrl`. Leçon n°1 : vérifier le cycle de vie avant de brancher quoi que ce soit | [Certain] | 3 l. |
| Y16 | `js/imageLayerCalibrationPicker.js:43`, `js/northPicker.js:45` | `_rejectFn` | écrits, jamais appelés : l'annulation fait `resolve(null)` par design (`northPicker.js:191-195`). Suppression sûre mais touche les Promises | [Certain] | ~6 l. |
| Y17 | état écrit jamais lu | `heatmap.js:54 _canvas` · `interfaceImportExport.js:379 fichierCharge` · `langManager.js:71 _initialized` · `sessionExporter.js:3096 _kmzClickTarget` · `sortieUrgence.js:48 _isPicking` · `swInspector.js:379 _currentCacheName` · `tableEditor.js:29 _format` (« alias historique ») · `utils.js:1631 _lastLoadedForPointId` | ESLint « assigned but never used » : chaque cas = déclaration + 1 à 3 affectations. Inoffensif ; certains peuvent signaler un garde perdu (`_isPicking`, `_initialized`) → lire chaque cas | [Certain] | ~20 l. |
| Y18 | `js/imageLayerCalibration.js:251,273` | événement `kta:imgLayerCalibChange` | 0 écouteur (community, pro). Déjà en 🟡 BACKLOG (« extension volontaire ? ») | [Certain] | ~10 l. |
| Y19 | `lang/{fr,en,es}.json` | `secours.carte.boucle` (« BOUCLE ») | 0 littéral, aucun préfixe `"secours.carte." +`, aussi signalée par `check-i18n.js` ; le code utilise `secours.overlay.boucle`. 3 dicos à retoucher ensemble | [Probable] | 3 l. |
| Y20 | `lang/*.json` | `gate.lockout.escalade` | 0 usage dans `unlockGate.js` (qui affiche `attente` + `hint`), alors que l'équivalent `pin.lockout.escalade` est affiché (`pinLock.js:792`). **Exigée** par `check-filets-donnees.js:199` → oubli d'affichage plutôt que clé morte. À KARMA | [Probable] | — |
| Y21 | `docs/architecture/secours.md` | doc `getItiTempsMinutes` | cf. haut | [Certain] | doc |
| Y22 | `docs/BACKLOG.md` § Code mort | entrée `getTrackerLevel` | périmée (consommée) | [Certain] | doc |
| Y23 | ~65 `window.*` exportés jamais lus hors de leur fichier | (liste `exp.json`) | quasi tous **vivants** : état partagé intra-fichier (`modeEdition`, flags `_…Bound`), handlers appelés via `appel("kta_copierGps")` / `window.x()` dans le même fichier. Exports « API » sans consommateur externe : `getPlanScale`, `getPlanSmartNav`, `getBaseName`, `PROF_*_DEFAUT`, `chargerImageTuillee`, `onLoadPlanClick`, `reSelectionnerZipPourPlan`… = BACKLOG « ~13 exports d'API, gain faible risque non nul » | [Probable] | 1 l. chacun |
| Y24 | 71 clés i18n à préfixe dynamique + 408 via alias | `i18n-prefixe.txt`, `i18n-fragment.txt` | construites (`"aide.sec." + id`, `"tutorial." + s`, `ktaBrancherOptionnel(…, "config.replay")` + `.toastOn`…) : **non jugeables par grep**, présumées vivantes | [Supposition] | — |

### 📌 Contrat / gardé exprès (ne pas toucher)

| Symbole | Fichier:ligne | Raison |
|---|---|---|
| `mktm:connexion-changed`, `mktm:secours-scenario-mutated`, `mktm:secours-scenario-deleted`, `mktm:session-cleared` (émis sans écouteur ici) | `ktaExtensions.js:179`, `secoursMode.js:870/990`, `sessionBackups.js:383`, `sessionPersist.js:492` | contrat d'extension ; écoutés côté pro |
| `mktm:plans-badges-changes` (écouté sans émetteur ici) | `main.js:2384` | émis par le pro |
| `repositionnerAnnuler` | `editor.js:796` | API vérifiée par `check-repositionner.js:137` — la supprimer casse le garde-fou |
| `ktaPointInPolygon`, `ktaDistPointSegment` | `selectionMulti.js:91-92` | coutures de test de `check-selection-multi.js:110-114` |
| `_ktaCfgValider` | `interfaceConfig.js:905` | couture de test de `check-reglages-immediats.js:34-42` |
| `getTrackerLevel` | `tracking.js:1160` | consommé par `ktaExtensions.js:716` |
| `_proHashShort`, `_proSourceLabel` | `homeProfile.js:1467/1474` | 📌 BACKLOG |
| `__ktaStyleCanon` | `styleResolver.js:361` | 📌 BACKLOG (diagnostic) |
| `PERF_MODE_SIZE_BYTES` | `tiling.js:1106` | 📌 BACKLOG (alias rétro-compat) |
| `__MKTM_PRO_LICENSE__` | `proLicense.js:204/254` | 📌 BACKLOG (contrat d'en-tête) |
| `ktaCouperModesOutils` | `interface.js:699` | 📌 BACKLOG (console/debug) |
| `__comment_aide` | `lang/fr.json:5319` | méta-commentaire de dico, voulu |
| `_renderMultiLevelSection`/`_bindMultiLevelToggle`, branche mono-alerte `alertChecker` | — | 📌 BACKLOG (non re-signalés : 0 trouvé au scan → déjà retirés ou vivants, pas de régression) |

---

## Détails et preuves complémentaires

**Fichiers non chargés** : aucun. `grep -o 'src="js/[^"]*"' index.html` (sans query string) ↔ `ls js` : 123 = 123.
Pas de `<script>` commenté dans `index.html`.

**Branches mortes** : `grep -E "if \((false|0|true|1)\)|&& false|false &&"` → 0 vrai cas (que des `!== false`).
Aucune constante-drapeau `const X = false/true/0`. ESLint `no-unreachable` + `no-constant-condition` : 0.
Scripts inline d'`index.html` et `sw.js` : 0 signalement ; `confadmin.html` : 1 (G19).

**Événements** : regex `new (Custom)?Event("…")` vs `addEventListener("…")` + Leaflet `.fire/.on`. Seul
`modalLifecycle.js:179` écoute un nom variable (wrapper générique, ne masque aucun cas ci-dessus). Les 5 `mktm:*`
orphelins apparaissent tous dans le repo pro (vérifié, non cité).

**i18n** : le filet officiel `check-i18n.js` §3 sort 7 « orphelines » ; 4 sont des faux positifs de
construction (`config.replay.toastOn/Off`, `config.heatmap.toastOn/Off` ← `utils.js:580`
`prefixe + ".toastOn"`), 1 est voulue (`__comment_aide`), restent Y19 et Y20. Les `lost.report.reach.*.one/plural`
sont construites (`lostMode.js:632-634`).

**Pourquoi si peu de 🟢 dans les `window.*`** : la règle retenue ici est stricte — 🟢 seulement pour du code
**privé** (IIFE/fonction), donc inatteignable par la console, le HTML ou une extension. Tout `window.*` sans
appelant reste 🟡 (contrat implicite + docs qui les citent), même vérifié absent du repo pro.

**Ordre conseillé si KARMA veut nettoyer** : (1) corriger le trou lecture-seule ✏️ ; (2) un commit `chore` avec
G1-G19 (aucun impact docs) ; (3) arbitrer Y2/Y3/Y6/Y8/Y9/Y11 en une passe avec la sync des docs citées ;
(4) remettre `secours.md` et l'entrée BACKLOG à jour.
