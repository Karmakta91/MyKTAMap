# 🖼️ Le tuilage dans MyKTAMap

> Audit du 07/09/2026, demandé par KARMA. Écrit **après lecture du code**, pas des libellés — plusieurs affirmations de l'interface se sont révélées fausses.
> Références : `js/tiling.js` (runtime), `js/createConf.js > _genererTuilesV2` (génération), `docs/architecture/perf-memory.md` §8 et §27.

---

## 1. Le problème que le tuilage résout

Un plan de cavité est une **image unique, énorme**. Affichée d'un bloc, elle devient **une seule texture GPU** — et au-delà d'environ 4096 × 4096 px, les navigateurs mobiles refusent, décodent de travers, ou l'onglet meurt. Safari iOS est le plus strict.

Le tuilage découpe l'image en morceaux que le navigateur peut charger et libérer indépendamment.

MyKTAMap en a **deux implémentations, très différentes**. Confondre les deux est la source de tous les malentendus de cet audit.

---

## 2. Deux tuilages, un seul bon

| | **V1 — tuilage runtime** | **V2 — tuilage à la génération** |
|---|---|---|
| Quand | à **chaque chargement**, dans le navigateur | **une fois**, dans le générateur de plans |
| Où | `tiling.js > chargerImageTuillee` | `createConf.js > _genererTuilesV2` |
| Niveaux de zoom | **1 seul** | **4** (z = 0, −1, −2, −3) |
| Résolution | **downscalée** à `maxWorkDim` (6144 → 12288 px) | **native** au niveau z=0 |
| Qualité | downscale **puis ré-upscale** par tuile, **puis** ré-encodage JPEG → double rééchantillonnage + perte | un seul encodage, JPEG 0.88 (ou WebP/PNG si la source a de l'alpha) |
| Mémoire au dézoom | aucune économie : le total des tuiles fait toujours ≈ W × H pixels | **LRU** sur 4 niveaux (2 sur mobile) — vraie économie |
| Coût au chargement | CPU à chaque ouverture | nul (les tuiles sont dans le ZIP) |

**Le V2 est meilleur sur les deux tableaux à la fois** : plus net *et* plus léger. Le V1 n'existe que pour les plans qui n'ont jamais été régénérés.

> 🧱 **Générer en V2** : case à cocher 🧱 dans le générateur de plans (`pl_tilingV2`, **décochée par défaut**). Tuiles de 512 px, 4 niveaux, écrites dans `data/tiles/z<N>/x<col>_y<row>.<ext>` du ZIP. L'image complète **reste dans le ZIP** — elle sert au dézip manuel et au repli d'erreur, pas au rendu.

---

## 3. Les deux choix proposés à l'utilisateur *(depuis v1.86.0)*

**Où il vit : `ℹ️ Infos` du plan, et NULLE PART ailleurs** *(depuis v1.90.2)*. Le contrôle ne s'affiche que si
`plan.tiledV2 !== true` — sur un plan V2 il serait un interrupteur débranché (cf. le tableau ci-dessous : la
colonne V2 ne contient que des tirets et un « ignoré »). Il est **mémorisé par plan**
(`PlanRegistry.setPerfPreset`) et s'applique à tous les chargements suivants.

⚠️ `tiledV2` n'est connu qu'après la **première ouverture** du plan, ou s'il est annoncé par l'`index.json`
d'un serveur. Un plan jamais ouvert affiche donc le contrôle ; il disparaît de lui-même ensuite si le plan
s'avère V2. Le défaut « Auto » ne casse rien entre-temps.

🩸 **Historique du placement — trois emplacements en six versions.** ⚙️ Configuration jusqu'en v1.85.4 (il y
passait pour une préférence durable alors qu'il n'était pas mémorisé) → carte de chargement en v1.85.4, replié
en v1.88.1 (posé déplié il ajoutait **~207 px** à une colonne dont le min-content mesurait ~510 px sous un
plancher de grid de 520 px : à 125 % de zoom elle débordait sur le footer — filet dans
`docs/architecture/ui.md`) → **retiré** en v1.90.2, décision KARMA : *« on est en auto tout le temps, la
majorité des plans sont en V2 et c'est le process conseillé, ne concernant que peu de cas je veux pas ce
réglage ici »*. Le bon endroit pour un réglage qui ne concerne presque personne est la fiche du plan
concerné, pas le chemin de tout le monde.

🧰 `window.getLoaderPerfPreset()` **existe toujours** et renvoie `"auto"` en constante ; `setLoaderPerfPreset`
est un no-op. `main.js` (changement de langue) et `homeLoader.js` (chaque chargement) les appellent : les
retirer aurait cassé ces appels. Renvoyer `"auto"` fait retomber leurs lecteurs sur le preset **mémorisé du
plan** — le comportement voulu.

| | Effet sur un plan **V1** | Effet sur un plan **V2** |
|---|---|---|
| 🔄 **Auto** *(défaut)* | tuile si `W × H > 4096²` **ou** fichier > 60 Mo | — (le plan utilise ses tuiles) |
| 💤 **Désactivé** | jamais de tuilage : image entière, qualité native, ⚠️ risque de plantage mobile | **ignoré** — un plan V2 tuile toujours |

> ⚖️ **Règle KARMA (v1.86.0)** : *« un plan V2 doit obligatoirement profiter du mode tuile ; le fichier complet reste pour le dézip manuel mais en principe n'est pas utilisé »*.

---

## 4. Ce que l'audit a trouvé

### 🩸 Sur un plan V2, quatre des cinq presets étaient identiques

`chargerImage` teste la branche V2 **en premier**, et `_chargerImageV2OptionB` **ne reçoit aucun paramètre de preset** : tout est figé à la génération. `Qualité`, `Équilibré`, `Performance` et `Auto` faisaient donc **exactement la même chose**. L'interface promettait pourtant « Plus net. Recommandé sur PC desktop. ». Les trois presets ont été retirés de l'UI ; le code les accepte toujours (un plan peut avoir `"quality"` mémorisé dans son registre).

### 🩸 « Auto » — le défaut — était le mode le MOINS protecteur

Il tranchait sur le **poids fichier** (60 Mo) quand les presets explicites tranchaient sur la **surface** (4096² = 16,8 Mpx). Un JPEG de 100 Mpx pèse ~15 Mo : **Auto ne le tuilait pas**, texture géante, crash iOS — alors que « Qualité » l'aurait tuilé. L'inverse de ce que le nom promet.

Pire, sur un **plan serveur** : `map.js` cherche la taille du fichier dans `RUNTIME_ASSETS`, que `chargerPlanServeur` ne remplit jamais → `fileSize = null` → Auto ne tuilait **jamais**, quelle que soit la taille.

**Corrigé** : la surface décide en premier, le poids reste en second critère.

### 🩸 Un plan V2 servi en HTTP affichait une carte blanche

`RUNTIME_ASSETS` n'est peuplé que par les imports ZIP. Pour un plan serveur, `_resoudreUrlTuile` rendait `null` pour **chaque** tuile, la boucle comptait `missing++` et continuait, et **aucun repli n'existait**. Seul signal : un `console.log` « 0 tuiles affichées ». Jusqu'en v1.86.0, c'est « Désactivé » qui sauvait ce cas — **par accident**.

**Corrigé** : voir §5.

---

## 5. Déployer un plan sur le serveur

**Depuis la v1.86.1, il suffit de dézipper.** Créez un dossier, videz-y le ZIP tel quel, déclarez-le dans `index.json`.

🩸 **Un plan issu d'un IMPORT (SIG / GPX / KMZ) n'est pas produit par le Générateur — et jusqu'en v1.88.4 il déclarait ses fichiers SANS le préfixe `data/`** alors qu'il les écrivait bien dedans. En import **local** l'incohérence était invisible (`findMatchingFile` retrouve l'asset par son **nom de base**) ; en **serveur**, la résolution est stricte → **404 sur l'image et les calques**. Symptôme vécu : sur 18 plans servis, ceux du Générateur passaient, ceux issus d'un import SIG (`*_from_v2`) échouaient tous — avec des ZIP « tous produits par l'app ».

✅ **Corrigé aux quatre sources** (`sigImport` ×2, `gpxImport`, `kmzImport`) **et rattrapé pour les plans déjà déployés** : dans une archive produite par cette app, un asset vit **toujours** sous `data/` (ou `icon/`). Un nom de fichier **nu** dans un plan-config ne peut donc désigner que `<dossier du plan>/data/<nom>` — ce n'est pas une sonde, c'est la mise en page du ZIP. ⚠️ *`kmzImport` avait déjà corrigé ce motif pour ses **calques** en v1.21.0-fix5, jamais pour son `baseImage` : la moitié d'une leçon, pendant deux ans.*

```
data/
  index.json          ← { "plans": [ { "id":"toto", "path":"data/toto", "name":"Toto" } ] }
  toto/
    plan-config.json  ← inchangé, tel qu'il sort du générateur
    data/
      MonPlan.png
      puits.json, editor.json …
      tiles/z0/… z-1/ z-2/ z-3/
    icon/
```

> 🩸 **Ça n'a jamais marché avant la v1.86.1, et rien ne le disait.** Le générateur écrit `data/MonPlan.png` dans le `plan-config.json` — c'est la mise en page **du ZIP**. Or `resolveServerPath` rendait tout chemin commençant par `data/` **tel quel**, donc résolu depuis la **racine du site** : le fichier réel étant à `data/toto/data/MonPlan.png`, l'app allait chercher `data/MonPlan.png` → **404 sur tout, sauf le `plan-config.json` lui-même**. Il fallait aplatir le dossier `data/` **et** réécrire chaque chemin à la main — c'est ce qu'est `data/test`. Deux opérations manuelles, documentées nulle part.
>
> Désormais un chemin `data/…` est **préfixé par le dossier du plan**, sauf s'il le contient déjà — ce qui préserve à l'identique les déploiements réécrits à la main. Vérifié en **exécutant** la fonction (`scripts/check-tiling.js` §9 charge `config.js` dans un `vm`), pas en cherchant une chaîne.

**Les tuiles sont SONDÉES, plus devinées** *(v1.88.3)*. 🩸 *Jusque-là leur racine était dérivée du dossier du `baseImage` — ce qui suppose que l'image et les tuiles ont bougé ensemble. Faux : le générateur écrit **toujours** les tuiles dans `zip.folder("data").folder("tiles")`, alors que l'emplacement de l'image dépend de la **recette de déploiement**. Avant la v1.86.1 il fallait réécrire les chemins à la main, ce qui remontait souvent l'image d'un cran sans toucher aux tuiles. D'où le symptôme de KARMA : « sur certains plans ça fonctionne bien » — le ZIP est le même, le déploiement non.*

À l'ouverture d'un plan V2 servi, l'app essaie donc les candidats **dans l'ordre**, en demandant une **tuile témoin** (`z<max>/x0_y-1`) à chacun :

| # | Candidat | Couvre |
|---|---|---|
| 1 | `tiling.tilesDir` | surcharge explicite du plan-config |
| 2 | `<dossier du plan>/data/tiles` | **la mise en page du générateur** — le cas normal |
| 3 | `<dossier du baseImage>/tiles` | déploiements aplatis (image ET tuiles remontées) |
| 4 | `<dossier du plan>/tiles` | dernier recours |

Deux requêtes au pire. 🛟 *Si aucune ne répond (hors-ligne, CORS), on retombe sur le 1ᵉʳ candidat — soit exactement le comportement d'avant — et le repli `baseImage` reste le filet final.* Le pré-cache hors-ligne utilise **la même** racine sondée : sans ça il téléchargerait 1275 URLs en 404.

✅ **Icônes personnalisées — on SONDE, on ne devine plus** *(v1.87.2)*. Le préfixe `icon/` désigne deux familles : les icônes **livrées avec l'app** (à la racine du site, absentes du ZIP) et celles **ajoutées dans le générateur** (présentes dans le ZIP, donc dans `<plan>/icon/`). Au chargement d'un plan serveur, chaque `icon/…` déclaré est **réellement demandé au serveur** dans le dossier du plan : il n'est réécrit que s'il répond **200**. 🛟 *Fail-safe : toute erreur (404, réseau, CORS) laisse le chemin à la racine.*

🩸 **Deux tentatives ratées avant celle-là, et la 2ᵉ était ma correction de la 1re.** En **v1.86.1**, les icônes perso n'étaient pas résolues du tout. En **v1.86.2**, j'ai voulu trancher sur le catalogue `TAGS_BUILTIN` — hors catalogue = icône du ZIP. **Faux** : `TAGS_BUILTIN` liste des **tags de POI**, pas les icônes de l'app. `icon/iconetrack.png` (le marqueur du tracker) existe à la racine et n'y figure pas → sur un plan serveur, l'icône du tracker partait en `data/<plan>/icon/iconetrack.png` → **404**. C'était une **régression d'affichage**, révélée par hasard par le téléchargement hors-ligne (« 9 fichiers sur 10 », constat KARMA). ⚠️ **Aucun catalogue ne liste toutes les icônes de l'app** : tout critère fondé sur une liste rejouera ce bug. C'est ce que `check-tiling.js` §10-11 empêche, en **exécutant** le sondeur.


> 🛟 **Repli d'erreur — une récupération, pas un mode.** Si les tuiles restent inatteignables (déploiement bancal), l'app affiche l'image entière plutôt qu'une carte blanche muette. Deux déclencheurs : aucune tuile résolue, **ou** toutes les tuiles du premier rendu en **erreur de chargement** — indispensable ici, car une URL HTTP « résout » toujours, même en 404. Une seule fois par chargement.

---

## 6. Pièges à ne pas ré-introduire

- ❌ **Faire dépendre le rendu V2 d'un preset.** Les paramètres V2 sont figés à la génération ; tout réglage runtime qui prétend les changer ment.
- ❌ **Rendre `auto` dépendant du seul poids fichier.** Il est inconnu (`null`) sur les plans serveur, et sans rapport avec la limite GPU, qui est en pixels.
- ❌ **Rouvrir un contournement `off → baseImage` pour les plans V2.** C'est le cas de crash iOS offert en un clic.
- ❌ **Re-traiter un chemin `data/…` du plan-config comme relatif à la racine du site.** Il est relatif **au ZIP**. C'est ce qui rendait tout déploiement serveur muet et 404 avant la v1.86.1.
- ❌ **Coder le chemin des tuiles en dur.** Un seul point de vérité : `_cheminTuileZip()`.
- ⚠️ `tuilingNecessaire()` est exporté mais **appelé nulle part** — dette connue, laissée en place.

🛡️ Tout ce qui précède est vérifié par **`scripts/check-tiling.js`** (pré-commit, bloquant, 16 sabotages falsifiés).

---

## 7. Disponibilité hors-ligne d'un plan serveur *(v1.87.0)*

**Question KARMA : « une fois un plan serveur chargé une fois, il est en cache, offline ok ? » — non, et pour trois raisons cumulées.**

| Obstacle | Détail |
|---|---|
| **Plafond** | Le cache principal du SW est borné à `MAX_DYNAMIC_ENTRIES = 800` avec éviction **FIFO**. Un plan V2 de 20000×12000 fait **1275 tuiles**, et son **seul** niveau z=0 en fait **960** → le plan **s'évinçait lui-même en se chargeant**. Hors-ligne : carte **trouée**, pas une erreur. |
| **Paresse** | `_renderNiveau` ne demande que les tuiles du **niveau de zoom courant**. Ouvrir un plan sans zoomer n'en cachait **qu'un sur quatre**. |
| **Bump** | `activate` supprimait tout cache dont la clé ≠ `CACHE_NAME` → chaque release remettait le plan à zéro. |

🍖 *`data/test` masquait le problème : il ÉTAIT dans `ASSETS_TO_CACHE`, donc **précaché et protégé** de l'éviction — retiré en v1.88.5 pour cette raison même (et pour les ~2 Mo qu'il coûtait à l'install). Tester avec le plan de démo donnait un faux « ça marche ».*

**La solution** : un cache **dédié par plan**, `myktamap-plan-<id>`, écrit depuis la page (`js/planOffline.js`) et que le SW **exclut des deux mécanismes** (`sw.js > _estCachePlan`). Le bouton vit dans la fiche **ℹ️ Infos** d'un plan serveur.

### L'état ne doit jamais mentir

⚠️ **Rien n'est mémorisé** — ni `localStorage`, ni IndexedDB. Le statut est **recalculé en lisant le cache** : un manifeste (`__kta_offline.json`, stocké *dans* le cache et jamais servi) liste les URLs attendues, et on les compare aux entrées réellement présentes.

- **absent** → bouton « ⬇️ Rendre disponible hors-ligne »
- **complet** → « ↻ Mettre à jour » + « 🗑️ Retirer » — 🩸 **le bouton de téléchargement DISPARAÎT** (exigence KARMA : pas de bouton fantôme)
- **partiel** *(v1.87.1)* → « ↻ Réessayer » — tout ce que le serveur **a** est là, mais il n'a pas fourni N fichiers, et l'app **les nomme**
- **incomplet** → « ⬇️ Compléter » — le bouton **revient** tout seul si le navigateur a fait du ménage

*C'est gratuit précisément parce qu'aucun drapeau n'est stocké : un drapeau survivrait à la purge et annoncerait « disponible » sur du vide.*

🩸 **Pourquoi « partiel » existe (v1.87.1).** Le manifeste v1 listait tout ce qu'on avait **tenté**, échecs compris. Un plan dont le `plan-config.json` déclare un fichier non déployé restait donc **« incomplet — 9 sur 10 » à vie** : le bouton invitait à retélécharger sans fin un fichier qui n'existe pas, et ne disait **jamais lequel**. Constaté par KARMA dès la première utilisation. Le manifeste v2 retient la liste des **manquants** ; l'état distingue désormais « interrompu » (à compléter) de « le serveur ne les a pas » (utilisable, et on affiche les chemins).

🩸 **Le manifeste n'est écrit qu'à la FIN du téléchargement.** Une interruption laisse donc un cache sans manifeste → état « incomplet ». Et seul un **HTTP 200** est mis en cache : cacher un 404 rendrait le plan « complet » avec des fichiers morts, invisibles jusqu'au terrain.

🩸 **Un seul point de vérité pour les tuiles.** `planOffline` n'énumère rien lui-même : il appelle `window.ktaTuilesV2Urls` (tiling.js), la fonction dont dérive aussi le rendu. Deux dérivations auraient divergé au premier changement de mise en page du générateur, et le symptôme aurait été un plan « téléchargé » mais troué — le bug qu'on corrige.

🛡️ Vérifié par **`scripts/check-plan-offline.js`** (pré-commit, bloquant) : il **exécute** `ktaTuilesV2Urls` sur un cas dont le compte est calculable à la main (1275), et vérifie qu'un plan local (`blob:`) ne produit **aucune** URL. 10 sabotages falsifiés.

---

## 8. Fraîcheur : savoir que le serveur a changé *(v1.88.0)*

Le §7 a créé un trou : un plan pré-téléchargé est servi depuis son cache dédié, **que rien ne purge** — ni l'éviction, ni le bump. Il pouvait donc servir du contenu **périmé indéfiniment**, sans jamais le dire.

### Pourquoi pas le champ `version`

| Source | Problème |
|---|---|
| `index.json > plans[].version` | **saisi à la main** par le déployeur. Il a **déjà dérivé dans ce repo** : l'index dit `V1`, `data/test/plan-config.json` dit `V2`. |
| `plan-config.json > plan.version` | fiable seulement si l'auteur pense à l'incrémenter. |
| un horodatage | **il n'y en a aucun** — `plan{}` = `name, version, author, imageWidth, imageHeight, baseImage, collisionImage, multiLevel` (+ options). Le générateur n'écrit ni date ni build. |

### Ce qu'on fait à la place : HTTP

Les **validateurs** (`ETag`, `Last-Modified`) sont retenus **au téléchargement**, dans le manifeste (v3). À l'ouverture de la fiche d'un plan hors-ligne, `PlanOffline.verifierMaj()` envoie une requête **conditionnelle** par fichier : **304** = inchangé (corps vide, coût quasi nul), **200** = ça a bougé.

🩸 **Les tuiles sont exclues** — elles peuvent être 1275, et elles **dérivent de l'image**, qui est sondée, elle. Si l'image a changé, la mise à jour est annoncée et le retéléchargement reprend tout. Il reste ~15 sondes pour un plan comme `data/test`.

🩸 **Le marqueur `?_ktacheck=1` est indispensable.** Sans lui, la branche cache-first du Service Worker servirait la sonde **depuis le cache** : elle n'atteindrait jamais le serveur et répondrait toujours « rien n'a changé » — exactement le mensonge qu'elle est censée lever. `sw.js` la laisse donc passer en **réseau seul**, et **ne la met pas en cache** (sinon chaque vérification y laisserait N entrées jetables, comptées dans le plafond de 800).

🩸 **On ne conclut jamais sans preuve.** Si aucune sonde n'aboutit (hors-ligne, CORS, serveur muet) ou si le manifeste est antérieur à la v3, l'état est **« inconnu »**, pas « à jour ». Annoncer « à jour » sans avoir rien vérifié serait le même mensonge qu'un drapeau mémorisé.

⚠️ **Limite assumée** : un fichier remplacé **sans** que son ETag change (serveur mal configuré, `Last-Modified` figé) passera inaperçu. Et si tu ne modifies qu'une **tuile** sans toucher à l'image source, la sonde ne le verra pas.

### Effet de bord réglé au passage : la version ne ping-pong plus

`addOrUpdate` fait un `Object.assign`. Au boot, la découverte écrivait la version d'`index.json` ; au chargement, celle du `plan-config.json` ; au boot suivant, retour à la première. La ligne « Version » de la fiche ℹ️ Infos changeait donc **selon la dernière action**. Pire : `entry.version || null` écrivait **`null`** quand l'index omet le champ — la version connue était **effacée à chaque démarrage**.

**Règle posée** : le `plan-config.json` fait autorité (il est *dans* le plan) ; `index.json` n'est qu'un indice utile **avant** le premier chargement. L'origine est tracée (`versionSrc`), et on n'écrit jamais `null`.

🛡️ Vérifié par `scripts/check-plan-offline.js` §7-8 (qui **exécute** `verifierMaj` sur quatre scénarios, dont les deux où elle doit **refuser de conclure**) et `scripts/check-tiling.js` §12.
