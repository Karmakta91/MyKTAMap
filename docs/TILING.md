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

Le sélecteur vit dans la **carte de chargement**, juste au-dessus du bouton ▶️ Charger ce plan — parce qu'il modifie **le chargement qu'on lance**, ce n'est pas un réglage mémorisé.

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

**Les tuiles suivent sans réglage** : leur racine est dérivée du dossier du `baseImage` résolu → `data/toto/data/tiles/`, exactement là où le dézip les pose. Un champ `tiling.tilesDir` dans le `plan-config.json` force la racine pour un déploiement non standard.

✅ **Icônes personnalisées — réglé en v1.86.2.** Le préfixe `icon/` est ambigu : il désigne aussi bien les icônes **livrées avec l'app** (`icon/house.png`…, à la racine du site et **absentes** du ZIP) que celles **ajoutées dans le générateur** (présentes, elles, **dans** le ZIP). On tranche désormais sur le **catalogue canonique** `window._ktaBuiltinIconUrls` (= `map.js > TAGS_BUILTIN`, **jamais recopié**) : une icône du catalogue reste à la racine, toute autre est préfixée par le dossier du plan. 🩸 *Fail-safe : si le catalogue n'est pas encore chargé, **rien** n'est préfixé — se tromper dans ce sens rend le comportement d'avant, dans l'autre ça casserait toutes les icônes de l'app.* Les dossiers `lib/`, `css/`, `js/`, `docs/`, `assets/` sont également protégés : `icons.default` vaut `lib/leaflet/images/marker-icon.png`.

🩸 *Au passage : `resolveServerPaths` ne parcourait **pas du tout** `config.icons`, malgré un commentaire qui affirmait le contraire. Les icônes de l'app fonctionnaient donc par **absence** de traitement.*

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
