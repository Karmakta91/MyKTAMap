# 📐 Les maths de MyKTAMap

> Doc pédagogique : *comment* l'app calcule ce qu'elle calcule. Chaque section pointe vers le code réel — si le code et ce doc divergent un jour, c'est le code qui a raison (et ce doc qui doit être corrigé).

---

## 1. Le repère du plan — pourquoi `[imageHeight − y, x]`

Une image d'ordinateur compte ses pixels **depuis le coin haut-gauche, y vers le BAS**. Leaflet (et la géographie) pensent **y vers le HAUT**. Toute la magie de `convertCoord(x, y)` tient dans ce retournement :

```
Image (pixels)              Leaflet (CRS.Simple)
(0,0) ────► x               ▲ lat = imageHeight − y
  │                         │
  ▼ y                       └────► lng = x
```

C'est LA règle n°1 du projet (`CLAUDE.md`) : ne jamais faire `[y, x]` à la main, toujours `convertCoord`. La moitié des maths ci-dessous commencent par ce même geste : `dy = −(yB − yA)` pour remettre le monde à l'endroit.

---

## 2. L'échelle (px/m) et le produit en croix

`APP_CONFIG.scale` = **combien de pixels valent un mètre**. Toutes les distances affichées en découlent :

```
distance_m = distance_px / scale
```

### 🎯 Recalibrer l'échelle par une mesure connue (`js/interfaceMaintenance.js`)

Tu mesures avec 📐 une galerie dont tu connais la longueur réelle. L'app affiche 100 m, tu sais qu'il y en a 150. **Produit en croix** (règle de trois) :

```
scale_nouvelle = scale_actuelle × (distance_affichée / distance_réelle)
               = 4.9 × (100 / 150) = 3.27 px/m
```

Intuition : si l'app *surestime* les distances, c'est qu'elle croit qu'un mètre contient *moins* de pixels qu'en vrai — on corrige dans la même proportion. La distance en pixels mesurée, elle, n'a pas bougé : `dist_px = affichée × scale_actuelle = réelle × scale_nouvelle` — c'est cette égalité qu'on résout.

### 🟡 Le contrôle de cohérence échelle ↔ géoref (`js/utils.js > calculerCoherenceEchelleGeoref`)

Quand le plan a **aussi** un géoref GPS, l'app dispose de **deux estimations indépendantes** de l'échelle : la tienne (`scale`) et celle déduite des deux points GPS (`1 / metresParPixel` du transform, cf. §4). Si elles divergent trop, bannière 🟡/🔴 : l'une des deux ment — c'est un contrôle par redondance, le même principe qu'en topo réelle.

---

## 3. Distances et surfaces

**Distance d'un tracé** : somme des segments, Pythagore en pixels puis division par l'échelle :

```
L = Σ √((xᵢ₊₁−xᵢ)² + (yᵢ₊₁−yᵢ)²) / scale
```

**Surface d'un polygone** : formule des lacets (*Shoelace*, `js/measure.js > calculSurface`). On somme les « produits en croix » de chaque arête — chaque terme est l'aire signée du triangle (origine, Pᵢ, Pᵢ₊₁) :

```
A_px² = ½ · |Σ (xᵢ·yᵢ₊₁ − xᵢ₊₁·yᵢ)|        puis     A_m² = A_px² / scale²
```

⚠️ Le `scale²` : une surface se divise par le **carré** de l'échelle (deux dimensions). C'est aussi pourquoi une petite erreur d'échelle (10 %) devient une grosse erreur de surface (21 %).

---

## 4. Le géoref 2 points — une similitude (`js/kmzExport.js > buildTransform`)

Deux points dont on connaît à la fois la position **plan** (pixels) et la position **GPS** suffisent à poser le plan sur le monde. Pourquoi deux ? Parce qu'il y a exactement 4 inconnues — une **translation** (2), une **rotation** (1), une **échelle** (1) — et que 2 points fournissent 4 équations.

Étapes, dans l'ordre du code :

1. **Vecteur plan A→B**, y retourné : `dxPlan = xB−xA`, `dyPlan = −(yB−yA)`.
2. **Vecteur GPS A→B en mètres** — projection *équirectangulaire locale* :
   ```
   dxGps = Δlng × 111 320 × cos(latMoyenne)     (est-ouest)
   dyGps = Δlat × 110 540                        (nord-sud)
   ```
   Un degré de latitude vaut ~110,5 km partout ; un degré de longitude **rétrécit** avec la latitude (les méridiens convergent aux pôles), d'où le `cos`. Valide à l'échelle d'une carrière (quelques km) — c'est une carte locale plate, pas une projection savante, et c'est suffisant.
3. **Échelle** : `metresParPixel = ‖AB_gps‖ / ‖AB_plan‖`.
4. **Rotation** : différence des angles des deux vecteurs, `atan2(dy, dx)` de chaque côté :
   ```
   rotation = atan2(dyGps, dxGps) − atan2(dyPlan, dxPlan)
   ```
5. Tout point du plan se projette ensuite : on prend son vecteur depuis A, on le **tourne**, on le **met à l'échelle**, on l'ajoute au GPS de A.

Garde-fous : `‖AB_plan‖ ≥ 50 px` et `‖AB_gps‖ ≥ 1 m` — deux points trop proches rendent l'angle et l'échelle numériquement pourris (diviser deux petits nombres bruités l'un par l'autre).

---

## 5. Le point C — l'affine qui absorbe la déformation (v1.73.0)

La similitude du §4 suppose le plan **fidèle** : mêmes proportions partout. Un *assemblage* de plans scannés ne l'est pas (échelle X ≠ échelle Y, cisaillement). Un **3ᵉ point** fait passer à une transformation **affine** — 6 inconnues :

```
Est  = a·x + b·yF + e
Nord = c·x + d·yF + f          (yF = −y, repère remis à l'endroit)
```

3 points × 2 équations = 6 équations : résolution **exacte par la règle de Cramer** (rapports de déterminants 3×3, `js/kmzExport.js`, bloc `pointC`).

**Le test de colinéarité** — le vrai « produit en croix » du projet : le déterminant

```
det3 = x1(y2−y3) − y1(x2−x3) + (x2·y3 − x3·y2)
```

vaut **2× l'aire du triangle ABC**. S'il est quasi nul, C est aligné avec A-B : le triangle est plat, la matrice n'est pas inversible, l'affine « expliquerait » n'importe quoi → **repli 2 points** annoncé (`degenereC`), jamais un résultat silencieusement faux. Le même test est refait côté GPS (les trois points *réels* peuvent être alignés aussi).

---

## 6. Le Nord (`northOffsetDeg`)

Convention unique dans toute l'app : **0° = le Nord pointe vers le HAUT du plan, angle croissant HORAIRE**. (« La flèche Nord pointe vers la droite du plan » = 90°.) Cascade de lecture : réglage per-plan (bouton 🧭 Calibrer le Nord) → `plan-config.json` → 0.

Consommé par la boussole, le marqueur de cap du tracker, la rose des vents — et depuis v1.76.1 par l'estimation du point B (§7). À noter : le géoref 2 points (§4) n'en a **pas besoin** — sa rotation est *mesurée* entre les deux points. `northOffsetDeg` sert précisément quand on n'a **pas** cette mesure.

---

## 7. Estimer le point B (v1.76.1, `js/config.js > ktaEstimerPointB`)

L'inverse du §4 : au lieu de *mesurer* rotation et échelle avec deux points GPS, on les **suppose connues** (échelle calibrée + Nord calibré) et on n'a besoin que d'**un** point GPS. B est alors *fabriqué* :

1. On place un B virtuel au **coin d'image le plus éloigné de A** (position sans sens physique — longue base = moins de bruit numérique dans le transform aval).
2. Δpixels → mètres via l'échelle : `est_plan = Δx/scale`, `nord_plan = −Δy/scale`.
3. **Rotation anti-horaire de `northOffsetDeg`** pour passer du repère image au repère géographique :
   ```
   est_vrai  = est·cos θ − nord·sin θ
   nord_vrai = est·sin θ + nord·cos θ
   ```
   Vérification de sens qui a servi de test : offset 90° (Nord = droite du plan) → un vecteur vers la droite de l'image doit ressortir **plein Nord**. ✓
4. Mètres → degrés, mêmes constantes qu'au §4 (111 320, cos lat).

Le B rendu porte `estimated: true` — **c'est une déduction, pas une mesure** : toute erreur d'échelle ou d'orientation se propage proportionnellement à la distance de A. Refus francs (pas de clamp) : A incomplet, échelle ≤ 0, |lat| > 85° (le `cos` s'effondre, la longitude divergerait).

> 🧪 Anecdote de fabrication : le garde-fou `check-georef-estimation.js` a attrapé au premier run que `Number(null) === 0` — un point A à latitude nulle serait parti « estimer » depuis l'équateur au lieu d'être refusé.

---

## 8. Bonus — les autres maths qui tournent en permanence

**Distance point-segment** (`js/road.js > _perpDist`, cœur du magnétisme C5 et des intersections) : on projette le point sur la droite du segment via le **produit scalaire**, on borne le paramètre `t` dans [0,1] (sinon on « accrocherait » le prolongement infini du segment), et on mesure jusqu'au point projeté :

```
t = ((P−A)·(B−A)) / ‖B−A‖²   →   t borné [0,1]   →   d = ‖P − (A + t·(B−A))‖
```

**Simplification de tracés** (*Douglas-Peucker*, `js/road.js > _decimatePointsRDP` + `smoothFactor` Leaflet) : on garde les extrémités, on cherche le point le plus **écarté** de la corde (via `_perpDist` justement) ; s'il dépasse le seuil on récurse de part et d'autre, sinon on jette tout l'intérieur. C'est pour ça qu'un tracé de 500 points s'affiche fluide sans changer de forme visible.

**Itinéraire** (*Dijkstra*, `js/pathfinder.js`) : le réseau de tracés devient un graphe (sommets = points, arêtes = segments pondérés par leur longueur en mètres), et on déroule le classique « toujours étendre le sommet le moins cher ». Les zones **inaccessibles** ne rendent pas les arêtes chères : elles les **retirent** du graphe — une contrainte dure, pas une pénalité.

**Cercles d'intersection** (`js/road.js`) : croisement de deux segments par résolution du système paramétrique 2×2 — encore un déterminant : s'il est nul, les segments sont parallèles, pas d'intersection.

---

## En une phrase

Tout MyKTAMap tient sur cinq outils de lycée bien employés : **Pythagore** (distances), le **produit en croix** (échelle et aires), **atan2** (angles), la **rotation 2D** (nord et géoref) et un **déterminant** (colinéarité, affine, intersections) — plus une honnêteté : quand une hypothèse remplace une mesure, l'app le **dit** (`estimated`, `degenereC`, bannière de cohérence) au lieu de le cacher.
