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

## 5. Déployer un plan V2 sur le serveur

Les chemins d'un plan serveur sont **absolus depuis la racine du site** (`data/mon-plan/MonPlan.png`), alors que le manifest V2 code des chemins **relatifs au ZIP** (`data/tiles/…`). Le runtime dérive donc la racine des tuiles du **dossier du `baseImage`**.

```
data/
  index.json
  mon-plan/
    plan-config.json      ← chemins réécrits en data/mon-plan/…
    MonPlan.png           ← baseImage (dézip manuel / repli)
    tiles/
      z0/x0_y0.jpg  …     ← les tuiles arrivent ici
      z-1/ z-2/ z-3/
```

**Recette** : dézipper le ZIP dans `data/<nom>/` **en aplatissant le dossier `data/` du ZIP**, exactement comme pour les autres plans serveur. Les tuiles atterrissent alors dans `data/<nom>/tiles/`.

**Échappatoire** : un champ `tiling.tilesDir` dans le `plan-config.json` force la racine, pour un déploiement non standard.

> 🩸 **Repli d'erreur — ce n'est pas un mode, c'est une récupération.** Si les tuiles sont réellement inatteignables, l'app affiche l'image entière plutôt qu'une carte blanche muette. Deux déclencheurs : *(1)* aucune tuile résolue ; *(2)* **toutes** les tuiles du premier rendu en **erreur de chargement** — indispensable ici, car une URL HTTP « résout » toujours, même en 404. Une seule fois par chargement.

---

## 6. Pièges à ne pas ré-introduire

- ❌ **Faire dépendre le rendu V2 d'un preset.** Les paramètres V2 sont figés à la génération ; tout réglage runtime qui prétend les changer ment.
- ❌ **Rendre `auto` dépendant du seul poids fichier.** Il est inconnu (`null`) sur les plans serveur, et sans rapport avec la limite GPU, qui est en pixels.
- ❌ **Rouvrir un contournement `off → baseImage` pour les plans V2.** C'est le cas de crash iOS offert en un clic.
- ❌ **Coder le chemin des tuiles en dur.** Un seul point de vérité : `_cheminTuileZip()`.
- ⚠️ `tuilingNecessaire()` est exporté mais **appelé nulle part** — dette connue, laissée en place.

🛡️ Tout ce qui précède est vérifié par **`scripts/check-tiling.js`** (pré-commit, bloquant, 16 sabotages falsifiés).
