# 🚦 RELEASE GATE — porte de mise en production

> **Règle d'or : `main` = déployable.** La porte se franchit **avant le merge sur `main`** ;
> le déploiement prod (`deploy-prod.sh` sur le VPS) peut ensuite se faire depuis `main` sans re-réfléchir.
> Décideur unique des dérogations : **KARMA**. Claude prépare, vérifie, consigne — il ne déroge jamais lui-même.

**Pourquoi cette porte existe** : à la v1.76.0, les 9 garde-fous automatiques étaient verts en
permanence — et tous les bugs trouvés au test manuel (formulaires d'export, reset légende,
`entree_plan`, et avant eux le fond d'écran et le magnétisme) étaient passés au travers. Motif
unique : **aucun guard n'exécute l'app dans un navigateur**. La porte comble ce trou.

---

## Les 4 marches (chacune bloque la suivante)

| # | Marche | Qui | Dérogeable ? |
|---|---|---|---|
| 1 | **Garde-fous automatiques** — la suite pre-commit complète verte (`.githooks/pre-commit`) **+ le guard de release** (`.githooks/commit-msg` : 3 sources de version cohérentes, docs à jour — cf. encadré sous le tableau) **+ la porte qualité SonarQube** (marche 1ter) | auto | ❌ noyau · ⚠️ doc · ⚠️ Sonar injoignable |
| 2 | **Smoke test standard** — les 12 points ci-dessous, sur **dev.myktamap.fr**, cache vidé | KARMA (~10 min) | ⚠️ par item, sauf 🔒 |
| 3 | **Checkup ciblé** — tableau destructif du/des modules **touchés par la release** (façon SIG, Légende) | KARMA + Claude | ⚠️ par item |
| 4 | **Trempage** — la release vit sur dev pendant l'usage réel de KARMA (24-48 h) | KARMA | ⚠️ (hotfix urgent = cas typique) |

> **Marche 1 — le guard de release (`commit-msg`, depuis le 16/08/2026)** : dès qu'un commit bumpe `version.json`,
> il est refusé si `sw.js > CACHE_NAME` ou `js/copyright.js > build` ne suivent pas (🔒 **noyau, jamais
> dérogeable** — sans eux la mise à jour n'atteint jamais les clients), ou si `README.md` (bloc « Version
> courante » + entrée du journal), `NETWORK_AUDIT.md`/`.html` (en-tête + historique) et `AI_CONTEXT.md`
> n'ont pas suivi (📄 dérogeable).
> **Déroger = une ligne dans le message de commit**, qui reste donc dans l'historique Git :
> `Docs-deroge: <motif · risque accepté · rattrapage>`. C'est la même règle que ci-dessous — jamais en
> silence — appliquée au niveau du commit. ⚠️ Il lit le **repo**, pas le serveur : il ne remplace pas
> l'item 13 du smoke.

---

## 🤖 Le script qui tient la porte (depuis le 07/09/2026)

```powershell
powershell -ExecutionPolicy Bypass -File scripts\release\merge-main.ps1
```

Il enchaîne ce qui est **vérifiable par une machine** et refuse d'aller plus loin au premier échec : arbre de
travail propre **hors `data/`** (27/09/2026 — `data/index.json` est suivi par Git et diverge dès qu'un vrai
relevé est ouvert : exiger un arbre propre au sens strict rendait toute release impossible **parce que la
règle de confidentialité du dépôt était respectée**. Les fichiers `data/` divergents sont listés, pas
bloquants — rien n'en sera commité, `check-data-hors-git.js` s'en charge, et le merge ne les touche pas),
branche légitime (jamais `Chig_Dev`, jamais `main`), **concordance des trois sources de version**
(volet 🔒 de la marche 1), suite complète des garde-fous, porte qualité SonarQube (marche 1ter : échec = refus,
serveur injoignable = `DEROGE` tapé), `main` local à jour vis-à-vis du distant, **CI GitHub verte sur le commit à
merger** (branche poussée telle quelle — tient lieu de protection de branche, payante en dépôt privé ; GitHub
injoignable = `DEROGE` tapé). Puis il montre
ce qui va partir, merge en `--no-ff`, pose le tag de version et publie — chaque étape vérifiée, un merge en conflit
étant annulé et la branche de travail restaurée.

🩸 **Ce qu'il ne peut pas vérifier, il le DEMANDE** : les marches 2 à 4 (smoke, checkup, trempage) exigent une
confirmation tapée. Aucun script n'exécute l'app dans un navigateur — c'est précisément le trou que cette porte
existe pour combler, et l'automatiser serait le rouvrir. Répondre « OUI » sans avoir fait les marches ne trompe
que soi-même.

`-DryRun` montre la séquence complète sans rien modifier. `-SkipGuards` saute la suite pre-commit quand elle vient
d'être passée à l'instant.

---

## 🔥 Marche 2 — le smoke test standard (liste FIXE, ne pas adapter par release)

Les items 🔒 sont le **noyau dur : jamais dérogeables** — ils couvrent le démarrage et les
données de l'utilisateur, un échec là = pas de release, point.

| # | | Test | Attendu |
|---|---|---|---|
| 1 | 🔒 | Ouvrir le HOME, console F12 ouverte | **Zéro erreur** console |
| 2 | 🔒 | Charger un plan de la liste | Carte affichée, calques présents, zéro erreur |
| 3 | | Dessiner 1 tracé + 1 zone + 1 structure | Couleurs conformes à ≡ Légende, boutons sidebar cohérents |
| 4 | | Ajouter 1 point avec tag | Icône correcte, popup s'ouvre |
| 5 | 🔒 | Fermer l'app, rouvrir, recharger le plan | **Session restaurée intégralement** (objets, points, légende) |
| 6 | | Export PNG rapide | Fichier s'ouvre, contenu conforme à l'écran |
| 7 | 🔒 | Export session JSON → réimport | Aucune perte, aucun doublon |
| 8 | | Changer de plan puis revenir | Aucune fuite (légende, calques, position) |
| 9 | | ≡ Légende → ✏️ Modifier, puis 🔍 Filtres | Les deux s'ouvrent et agissent |
| 10 | | Ouvrir le Mode Secours | S'ouvre, données du plan présentes |
| 11 | | Badge version footer + modale « Mise à jour » | **Bonne version**, notes du bump courant |
| 12 | 🔒 | Kill SW (⚙️ Configuration → 🆘 Dépannage → 🆘 Ouvrir l'outil Kill SW, ou `killsw.html` directement) puis recharger | L'app revit sur la nouvelle version, URL propre |
| 13 | | **Pages annexes à jour** : ouvrir l'Audit réseau (version en tête = version du bump) + vérifier en console l'absence de `[I18n] Clé manquante` | Attrape un **déploiement partiel ou oublié** (du temps du FTP : `docs/` ou `lang/` non montés) — vécu 2× le 06/08 : Audit resté en v1.75.2, clés `home.profile.*` « manquantes » alors que le repo était sain |

> **Voie rapide hotfix** (bump de cache type v1.75.1, zéro changement fonctionnel) :
> items 1, 2, 5, 11, 12 seulement — les 5 sont 🔒 ou version, aucun dérogeable.

---

## ⚠️ Dérogations — passer SANS valider, mais jamais en silence

Un item peut être invalidable en pratique : **SIG en est l'exemple canonique** (impossible de
tester toutes les combinaisons CRS × formats × logiciels sources ; certains fichiers réels
n'existent pas sous la main). La porte doit pouvoir s'ouvrir quand même — aux conditions
suivantes, **toutes** :

1. **Qui** : KARMA seul accorde une dérogation. Claude peut la *proposer*, jamais l'accorder.
2. **Quoi** : uniquement des items **non-🔒**. Le noyau dur ne se déroge pas, même en urgence.
3. **Trace** : chaque dérogation est consignée dans le relevé de release (ci-dessous) avec
   **motif · risque résiduel accepté · plan de rattrapage** (ou « assumé définitivement »).
4. **Suivi** : une dérogation avec rattrapage devient une entrée de `docs/BACKLOG.md` —
   sinon elle s'évapore.

**Grille de décision rapide** :
- *Invalidable en pratique* (pas de données de test, matériel absent, cas exotique) → dérogation légitime.
- *Pas le temps* → ce n'est **pas** un motif. Réduire le périmètre de la release plutôt que la valider à moitié.
- *Doute sur la criticité* → traiter comme critique. Le coût d'un smoke item est de ~1 minute.

---

## 📋 Relevé de release (recopier dans le commit de release ou en commentaire de PR)

```
RELEASE GATE — vX.Y.Z (date)
[ ] M1 guards auto : verts (commit <sha>)
[ ] M1ter Sonar : porte qualité OK sur le nouveau code | dérogée (motif)
[ ] M2 smoke 12 pts : OK sauf dérogations ci-dessous
[ ] M3 checkup ciblé : <modules> — OK sauf dérogations
[ ] M4 trempage dev : du <date> au <date>
Dérogations :
- (aucune) | <item> — motif · risque accepté · rattrapage (→ BACKLOG §x) — accordée par KARMA le <date>
```

### 🗂️ Dérogations consignées a posteriori

Une dérogation posée sans l'accord préalable de KARMA (écart à la règle 1) est signalée à KARMA,
puis consignée ici avec sa décision.

- **v1.98.10** (`5b1be64`, 29/09/2026) — `Docs-deroge` posé **par Claude, sans accord préalable** :
  `AI_CONTEXT.md` avait été mis à jour dans le commit précédent de la même vague (`5108b6f`) et non
  dans le commit de release, que le hook refusait. · Risque : nul (contenu vérifié présent). ·
  Rattrapage : aucun ; depuis v1.98.11, `AI_CONTEXT.md` suit toujours dans le commit de release. ·
  **Validée a posteriori par KARMA le 29/09/2026.**
- **v1.98.17** (`7768245`, 30/09/2026) — `Docs-deroge` posé **par Claude, sans accord préalable** (récidive) :
  motif écrit « guides utilisateur non touchés », alors que le hook ne contrôle pas les guides — la ligne était
  **inutile**. · Risque : nul (README, audit réseau et Aide IA à jour dans le commit). · Rattrapage : aucun ;
  règle que Claude s'applique désormais : **si le hook refuse une release, Claude s'arrête et demande — il
  n'écrit jamais lui-même de ligne `*-deroge`**. · **Validée a posteriori par KARMA le 30/09/2026.**

---

## 🤖 Marche 1bis — smoke navigateur automatisé (EN PLACE depuis v1.76.4)

`cd scripts/smoke && npm install && npm run smoke` — boote l'app dans un
Chromium headless (serveur local inclus), passe les gates, ouvre
Configuration / Éditeur / plan de test / Réglages / Légende, et **échoue sur
toute erreur console, pageerror, clé i18n manquante, 404 inattendu ou modale
invisible**. Détails : `scripts/smoke/README.md`.

À lancer **avant la marche 2** : il attrape en 30 s la classe de bugs
(ReferenceError, classe CSS fantôme, variable hors portée) qui a traversé
trois fois les garde-fous logiques la semaine du 06/08. Le smoke manuel
(marche 2) reste : lui seul voit le VISUEL (décalages, chevauchements).

## 🔍 Marche 1ter — analyse SonarQube (depuis le 09/10/2026)

`powershell -ExecutionPolicy Bypass -File scripts\release\sonar-scan.ps1` — lancé par `merge-main.ps1`
(étape 4bis), lançable seul. Il analyse `js/`, `sw.js`, `css/` et `index.html` (`data/` exclu **en dur** : les
relevés réels ne partent jamais dans la base Sonar), attend le traitement de **cette** analyse et rend le verdict
de la porte qualité : `0` OK · `2` échec (refus du merge) · `1` analyse impossible.

**Ce qu'il voit et que les garde-fous ne voient pas** : bugs génériques, failles, duplication, sur le **nouveau
code seulement** (période « version précédente » : la référence avance à chaque bump de `version.json`). L'existant
sert de base et ne bloque pas. Les garde-fous restent seuls juges des **règles métier** — Sonar ne les remplace pas.

**Prérequis** : le serveur SonarQube tourne en **local** (Docker, hors dépôt — un runner GitHub hébergé ne peut pas
le joindre, d'où ce script plutôt qu'une étape de CI) et la variable d'environnement utilisateur `SONAR_TOKEN`
contient un jeton d'analyse du projet `MyKTAMap`, jamais écrit dans le dépôt. Serveur éteint = l'analyse n'a pas
eu lieu : `merge-main.ps1` demande `DEROGE`, à consigner dans le relevé.

**Porte qualité `MyKTAMap`** (et non « Sonar way », qui refuserait presque toute release : elle exige 0 nouveau
code smell et 80 % de couverture, alors que le dépôt n'a pas de tests unitaires). Conditions sur le nouveau code :
fiabilité A (aucun nouveau bug), sécurité A (aucune nouvelle faille), revue de sécurité A (points sensibles
revus), duplication ≤ 3 %. Appliquée aux projets `MyKTAMap` et `MyKTAMap-pro` **explicitement** (*Project
Settings → Quality Gate*) : un projet rattaché à « Sonar way » à sa création ignore la porte par défaut.

**Faux positif** : le marquer dans Sonar (*False positive* ou *Accept*) **avec un commentaire** qui dit pourquoi —
jamais en silence. 🩸 Le `.sort()` sans comparateur de `js/proLicense.js > _canonique` est **voulu** (l'ordre par
défaut est celui de la forme canonique signée) : ne pas « corriger » la règle S2871 à cet endroit.

## 🌍 Marche 3 — checkups ciblés automatisés (à lancer selon les modules touchés)

Le smoke (1bis) boote l'app **en français** : tout défaut propre à une autre
langue lui est structurellement invisible. Ces scripts comblent des angles
morts précis et se lancent à la main, comme le smoke.

| Script | Quand le lancer | Ce qu'il a déjà attrapé |
|---|---|---|
| `node scripts/smoke/checkup-langues.js` | dès qu'on touche à l'i18n, aux dicos `lang/`, à la Documentation ou à l'Aide | **v1.80.0** : un utilisateur EN/ES lisait « **Incognito Start Label** » sur le HOME — la clé technique humanisée, ni traduite ni en français, et qui ne se réparait jamais. Invisible des 14 garde-fous ET du smoke |
| `node scripts/smoke/checkup-home-scroll.js` | dès qu'on touche au CSS du HOME (`#planLoaderOverlay`, `#planLoaderBox`, `.loader-grid`, `.loader-col-*`) ou au pied de page | **v1.81.0** : rien — il a au contraire **innocenté** la dette D-home-mini (« footer coupé sans scroll »), non reproductible sur 6 configurations. Il verrouille désormais ce comportement : sur une petite fenêtre PC le contenu déborde, mais la **molette** scrolle et le footer se rejoint · **15/09/2026** : mesure aussi, avant tout scroll, que « Charger ce plan » reste dans la partie visible de `#panelZip` et qu'à ≥ 800 px de haut rien n'y est caché (8 configs dont le portable 1536×800 et son zoom 125 %) — le trou exact par lequel +128 px sont passés en deux commits sans alerte |
| `node scripts/smoke/checkup-import-masse.js` | dès qu'on touche au rangement des ZIP (`PlanRegistry.saveBlob/getBlob`), à l'import multiple ou à l'ouverture d'un plan local depuis la liste | **16/09/2026** : « ça marche uniquement pour le dernier plan chargé » — Chromium range un `File` de sélecteur dans IndexedDB **par référence au disque** : la copie avait la bonne taille et ne se lisait plus dès que le ZIP d'origine avait bougé. Invisible de tout garde-fou statique. Le checkup importe 3 vrais plans par l'écran, modifie et supprime leurs fichiers, recharge, relit les 3 blobs et ouvre le plan dont le fichier a disparu |
| `node scripts/smoke/checkup-plan-folders.js` | dès qu'on touche à la liste « Mes plans » (`refreshPlansList`, `planRowHTML`, `#myPlansBox`), aux dossiers (`PlanRegistry.*Folder*`), à la découverte serveur ou à ConfAdmin | **v1.95.0** : la contrainte stricte de KARMA — « Mes plans » ne prend pas un pixel de plus en mode Dossiers (8 dossiers, 60 plans, tout déplié, 1536×800) — n'est prouvable qu'au pixel. Le checkup joue aussi ➕, 📁 Déplacer vers, ☑ sélection, l'index serveur (dossiers verrouillés, plan déplacé à la main qui reste, dossier libéré), et le mobile 400 px (5 lignes par dossier, aucune ligne draggable au doigt). Le glisser HTML5 n'est pas simulable par l'automate : contrôle manuel dans le QCM |
| 📱 **Mode « plan orienté » sur iPhone** (mode actif, grand plan tuilé, **zoom à fond ET dézoom à fond**) | tant que le mode évolue | v1.97.1 est un correctif **iOS** validé sur **Chromium** : le harnais ne reproduit ni les limites de texture ni le compositing de WebKit. Les deux régressions signalées en terrain (tuiles noires, puis 17 % d'écran vide en portrait) étaient invisibles de tous les tests. **À voir sur l'appareil avant de merger.** |
| `node scripts/smoke/smoke.js` | à chaque release (marche 1bis) | **26/09/2026** : il était ROUGE dès que `data/` contenait un vrai relevé — il cherchait « Relevé fictif de test » **par son nom**, et `data/` ne part jamais sur le dépôt. Deux faux échecs sur le harnais qui garde la porte. Il ouvre maintenant le premier plan de l'index et le dit ; il classe aussi à part les 404 de **sondage d'icônes** (volontaires sur un plan généré avant la v1.97.9). C'est ainsi qu'il a trouvé l'exception du bouton ❓ sur ≡ Légende |
| `node scripts/smoke/checkup-urgence-memoire.js` | dès qu'on touche au mode urgence XL (`js/emergencyMode.js`), au cycle de vie d'un plan (`map.remove()`, `main.js`) ou à l'éviction du Service Worker | **v1.97.6** : trois défauts qu'aucun test ne voyait — `map.remove()` ne retire pas l'écouteur `scroll` de Leaflet (**+2,43 Mo épinglés par plan chargé, sans plafond**), l'éviction du cache supprimait le `plan-config.json` d'un plan qu'on venait de rendre hors-ligne, et l'écran d'urgence n'avait **aucun fond** sur un plan servi en HTTP. **26/09/2026** : couvre aussi les couleurs de la légende personnalisée dans la mini-carte (tracé repeint, zone repeinte, type `cust-…`) — falsifié |
| `node scripts/smoke/checkup-carnet-documents.js` | dès qu'on touche au Mode Histoire (`js/modeHistoire.js`), à l'onglet Récits du Carnet (`js/journalUi.js`) ou à la base `myktamap_histoire_pdfs` | **26/09/2026** : un PDF livré dans le ZIP d'un plan ne remontait pas dans « Mon carnet » — limite assumée depuis la v1.69.0, invisible de tout garde-fou statique (IndexedDB + DOM). Le checkup mesure la copie, son **idempotence** (dix chargements ≠ dix copies) et le cycle *supprimé → plan rouvert → recréé* voulu par KARMA, puis **falsifie** en rejouant sans la copie |
| `node scripts/smoke/checkup-suppression-plan-docs.js` | dès qu’on touche à la suppression d’un plan (`homeLoader.js` → ℹ️ Infos → 🗑️), à `PlanRegistry.purgeAssociatedData`, à `ktaConfirm` (`utils.js`) ou à la base `myktamap_histoire_pdfs` | **29/09/2026** : supprimer un plan laissait ses PDF d’histoire orphelins dans le Carnet. Case décochée « supprimer aussi ses documents (X Mo) » : le checkup la coche et vérifie que seuls les documents DU plan partent, puis **falsifie** en la laissant décochée (rien ne doit partir) |
| `node scripts/smoke/checkup-ultra-traces-plan.js` | dès qu’on touche aux réglages ULTRA (`perfUltra.js`), au rendu des calques de données (`utils.js > ajouterPointsDepuisJSON`, `_refreshDataPolylinesUltra`), à la décimation de `road.js` ou au culling (`mapBearing.zoneVisible`) | **29/09/2026** : « Ne rendre que le visible » et « Décimer au dézoom » ne faisaient rien sur les tracés d’un plan (893/893 sur la carte). Le checkup compte ce qui est **réellement** sur la carte (`polyline._map`), vérifie qu’un calque décoché reste décoché et que la géométrie revient au rezoom ; **falsifié** sur l’ancien code (893/893) |
| `node scripts/smoke/checkup-tuiles-hors-ecran.js` | dès qu’on touche au tuilage V2 (`tiling.js > _renderNiveau`, `ktaCullerTuilesV2`), au filtre multi-niveau du plan de base ou à `mapBearing.zoneVisible` | **29/09/2026** : le tuilage posait tout le niveau (864 tuiles pour 6 visibles). Le checkup compte les tuiles **posées** et les **requêtes réellement émises**, vérifie qu’**aucun point de l’écran** dans le plan n’est sans tuile (avant/après déplacement) et le filtre de niveau ; **falsifié** sur l’ancien code (864/864) |
| `node scripts/smoke/checkup-plan-oriente.js` | des qu'on touche au mode « plan orienté » (`js/mapBearing.js`), aux panes Leaflet, au culling viewport (`road.js`, `utils.js`) ou aux modes qui prennent la carte (perdu / présentation / secours / replay) | **v1.97.0** : la première implémentation posait la rotation sur `.leaflet-map-pane` et **passait tous les tests** — tant que la carte n'avait pas été panée. Dès qu'elle l'était : 918 px d'erreur à 45°, sans la moindre erreur console. Le checkup pane AVANT de mesurer, sinon il validerait l'implémentation fausse |

**`checkup-langues.js`** rejoue le parcours d'un utilisateur espagnol : depuis
la v1.80.0, Documentation **et** Aide intégrée doivent être en **espagnol**, et
l'Aide ne porte **plus aucun drapeau** (elle suit la langue de l'app). *Un
drapeau sans contenu derrière est un mensonge d'interface : c'est exactement ce
qu'avait produit l'ajout de `es` à la mauvaise liste.* ⚠️ Ce paragraphe décrivait
encore le régime d'avant (« Aide en anglais, repli assumé ») jusqu'au 02/09 —
**un test et sa doc qui n'évoluent pas avec le produit finissent par défendre
l'ancien comportement contre le nouveau.**

**`checkup-home-scroll.js`** mesure le HOME en petite fenêtre. Sa vraie valeur
est ailleurs que dans ses assertions : il **refuse de conclure** tant qu'un
overlay couvre la page. Le splash reste 3,5 s puis est *retiré du DOM* (et comme
il est en `position:fixed`, son `offsetParent` vaut `null` — l'attendre par ce
biais réussit trop tôt), et la modale « Accès hors-ligne » s'ouvre dès que le
service worker est bloqué. Les deux figent `scrollHeight` et mangent la molette.
*C'est ce qui a inventé la dette D-home-mini de toutes pièces — un harnais qui
mesure trop tôt ne trouve pas un bug, il en fabrique un.*

## 🔮 Marches futures

- (vide pour l'instant)
