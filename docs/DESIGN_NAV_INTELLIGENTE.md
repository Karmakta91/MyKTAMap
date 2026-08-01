# MyKTAMap — Conception : Navigation Intelligente (GPS road-aware)

> **Statut** : ✅ **INITIATIVE COMPLÈTE.** C1→C4 livrés en v1.28.0 (testés terrain OK) · **C6 (multi-niveau) et C5 (magnétisme edit-time) livrés en v1.74.0** — validés par harness Node, **restent à tester sur le terrain**.
> **Date** : 2026-05-29 · **Auteur** : Flavien VIDAL (alias KARMA) · **Rédaction technique** : assistant IA
> **Livrée dans** : v1.28.0 (cf §76 CLAUDE.md). Implémentation : `js/roadGraph.js` (C1), `APP_CONFIG.smartNav` + `tracking.js > avancer()` dispatcher (C2), `RoadGraph.matchPosition` greedy + repli hybride (C3), choix d'arête au cap (C4).
> **Périmètre** : ajoute un mode de navigation qui *cale la position estimée sur le réseau de tracés (ROAD)*,
> en **complément réversible** du dead-reckoning actuel (PDR + raster collision). 100 % offline, aucune
> nouvelle surface réseau, aucune nouvelle permission.

---

## 1. Motivation

Sous terre (catacombes, carrières, spéléo), le **GPS satellite ne fonctionne pas**. MyKTAMap estime déjà la
position par **dead-reckoning piéton (PDR)** : détection de pas (accéléromètre) + cap (boussole), avec une
contrainte de « mur » par **raster de collision**. Problème inhérent au PDR : la **dérive s'accumule** (erreur
de cap, longueur de pas variable), et le raster ne fait que dire « marchable / pas marchable » — il ignore
totalement la **topologie** des galeries.

Or, quand un plan contient un **réseau de tracés complet** (cas du Grand Réseau Sud cartographié
quartier-par-quartier), on dispose d'une information bien plus riche que le raster : un **graphe de galeries**.
Caler la position sur ce graphe (**map-matching**) tue la dérive et fait tourner la position correctement aux
intersections, même avec des capteurs bruités.

**Contrainte fondatrice (KARMA)** : la nav intelligente n'a de sens *que si* le plan a un réseau de tracés.
Elle doit donc être **strictement réversible** — un interrupteur `GPS Intelligent` ON/OFF, **OFF = le
comportement actuel exact** (PDR + raster, sans conscience des tracés).

---

## 2. 🎯 Découverte clé — le graphe existe déjà

`js/pathfinder.js > _buildGraph()` construit **déjà** un graphe topologique complet à partir des tracés :

- `nodes` : `[{x, y}]` (coordonnées plan)
- `edges` : liste d'adjacence pondérée `edges[i] = [{to: nodeIdx, weight}]` (non-orienté)
- `segments` : `[{a, b, roadType, level}]`
- `buckets` : **hachage spatial** → lookup « nœud proche d'une position » en O(1)
- `_getOrAddNode()` : **fusion spatiale** des nœuds à ≤ 1.5 px → les tracés qui se touchent partagent un nœud
- **Enrichissement aux croisements** : insertion de **nœuds virtuels** aux T-junctions imparfaites
  (tolérance 15 px) pour connecter les composantes autrement disjointes
- `nodeLevels` : `Set<level>` par nœud (support multi-niveau)

**Limite actuelle** : ce graphe est reconstruit **à la volée à chaque calcul d'itinéraire**, jamais mis en
cache ni réutilisé ailleurs.

➡️ **Conséquence** : les 80 % difficiles du « snapping topologique » sont déjà faits. Le travail consiste à
(a) rendre ce graphe **réutilisable + caché**, (b) ajouter un **map-matching en ligne**, (c) câbler un
**toggle réversible** propre.

---

## 3. État actuel = « GPS Intelligent OFF » (référence à préserver)

Fichier : `js/tracking.js`.

- `position = {x, y}` en coordonnées plan, initialisée à `APP_CONFIG.startX/startY`.
- `markerPosition` : marqueur Leaflet, icône tournée selon le cap boussole lissé.
- **Détection de pas** (`initMotion`) : `devicemotion` → magnitude accélération ; si
  `magnitude > stepThreshold` et hors `stepCooldown` → `avancer()`.
- **Déplacement** (`avancer()`) :
  ```
  distance = stepLength (m) × scale (px/m)
  newX = position.x + distance · sin(cap)
  newY = position.y − distance · cos(cap)
  si estAccessible(newX, newY) → position = (newX, newY) ; sinon → "Collision !", inchangé
  _pushTimelinePoint("pdr")   // Pedestrian Dead Reckoning
  ```
- **Contrainte** (`estAccessible()`) : échantillonne le `collisionCanvas` (raster « marchable ») via
  `_collisionData`. C'est ce que KARMA appelle « les collisions ».
- **Recalage manuel** : l'utilisateur peut repositionner le marqueur puis « repartir sur la boussole ».

> Ce chemin (`avancer()` → `estAccessible()`) reste **inchangé** quand `GPS Intelligent = OFF`.

---

## 4. Conception cible = « GPS Intelligent ON »

### 4.1 Principe : map-matching en ligne

On maintient une **position sur le graphe** : `{ edgeId, t }` (quelle arête, et où le long de l'arête, `t ∈ [0,1]`).
À chaque pas :

1. **PDR brut** : calculer la position brute comme aujourd'hui (`distance` selon le cap).
2. **Candidats** : récupérer les arêtes dans un rayon `R` autour de la brute (via les **buckets** → O(1)).
3. **Scoring** de chaque candidate :
   - `+ distance(brute, arête)` — proximité géométrique
   - `+ désalignement(cap, orientation de l'arête)` — cohérence directionnelle
   - `+ coût de transition` :
     - rester sur l'arête courante → ~0
     - passer à une arête **adjacente** (nœud partagé) → modéré
     - sauter vers une arête **déconnectée** → élevé (anti-téléportation entre galeries parallèles)
4. **Sélection** : meilleure arête → **projeter** la brute dessus → nouvelle `{edgeId, t}` → `(x, y)` = point sur l'arête.
5. **Position affichée** = ce point calé (la dérive perpendiculaire à la galerie est annulée à chaque pas).

Aux **nœuds (intersections)** : quand `t` atteint une extrémité, on choisit l'arête sortante dont
l'orientation colle le mieux au **cap boussole courant** → on « tourne » correctement.

> **v1 = greedy** (glouton, plus proche avec biais topologique). Pas besoin d'un HMM/Viterbi complet :
> l'ancrage à chaque pas re-cale l'erreur, ce qui rend l'approche gloutonne suffisante pour le terrain.
> Une montée en HMM reste possible plus tard sans changer l'API.

### 4.2 Snapping initial

Au démarrage du tracking (ou après un **recalage manuel**) : caler `startX/startY` sur le **nœud / arête
le(la) plus proche** du graphe, dans la limite d'un rayon de sécurité. Au-delà → démarrage **off-network**
(cf. §5).

### 4.3 Bénéfice attendu

- **Dérive perpendiculaire annulée** : on reste dans la bonne galerie.
- **Virages corrects** aux intersections (sélection d'arête par cap).
- **Tolérance accrue** à l'erreur de longueur de pas (le re-snapping ré-ancre à chaque pas).

---

## 5. Contrat de réversibilité (décision verrouillée : **HYBRIDE**)

- **Toggle** : `APP_CONFIG.smartNav` (booléen), **défaut OFF** (rétrocompat stricte).
  - ⚙️ **Décision d'implémentation (C2)** : persistance **GLOBALE** via `localStorage["app_user_prefs"]`
    (même mécanisme que `showRoadIntersections` / `scaledMarkers`), et **non per-plan** comme esquissé
    initialement. Raisons : (1) cohérence avec le pattern existant + zéro plomberie SessionPersist,
    (2) c'est une préférence de comportement (« utilise la nav intelligente quand un réseau est dispo »),
    (3) le garde-fou runtime `RoadGraph.isReady()` gère déjà le cas « plan sans réseau » indépendamment
    de la portée de persistance. Un plan sans tracés → toggle sans effet, quel que soit l'état mémorisé.
- **Branche unique** dans `avancer()` :
  ```
  if (smartNav && grapheDisponible && onNetwork) avancerSurGraphe();
  else                                           avancerRaster();   // = code actuel, inchangé
  ```
- **Garde-fou réseau** : si le plan n'a **pas** de tracés (graphe vide) → toggle **inactif** + message clair
  (« La navigation intelligente nécessite un réseau de tracés sur ce plan »).
- **Comportement off-network (HYBRIDE)** :
  - Si la position brute s'éloigne de **toute** arête au-delà d'un seuil → on **bascule sur le PDR raster
    actuel** (`avancerRaster`) → on continue d'avancer même dans une galerie **pas encore cartographiée**.
  - Dès qu'on **revient à portée** d'un tracé → **re-snapping** automatique sur le graphe.
  - Un indicateur visuel discret signale l'état (`sur réseau` / `hors réseau`) pour la transparence.

> Le mode hybride est le plus robuste : il marche partout, y compris dans les zones d'exploration vierges,
> sans jamais « téléporter » la position sur un tronçon voisin aberrant.

---

## 6. Magnétisme edit-time (décision verrouillée : **INCLUS — lot C5**) — ✅ LIVRÉ v1.74.0

> **Écarts assumés vs l'esquisse ci-dessous** (détail : `docs/architecture/tracking.md §76.5`) :
> ① accrochage sur les **sommets de roads** et non sur les nœuds `RoadGraph` — chaque clic invaliderait
> le cache du graphe et forcerait une reconstruction complète du réseau **à chaque point posé** ;
> ② feedback **après** l'accrochage (flash doré 700 ms) et non en survol prédictif — le survol n'existe
> pas au doigt, et un scan à chaque `mousemove` coûterait cher sur réseau dense ;
> ③ toggle **indépendant** et non sous-toggle de `smartNav` — le magnétisme améliore le graphe, donc il
> sert au Pathfinder même quand la nav intelligente est OFF.

Amélioration de la **qualité du graphe** à la source, côté dessin :

- Pendant le tracé d'une route, si un point cliqué est **à ≤ tolérance d'un nœud existant** → **accrochage**
  (le point stocké prend la coordonnée exacte du nœud) → les tracés partagent réellement leurs nœuds.
- **Feedback visuel** : surbrillance du nœud cible quand l'accrochage va se produire.
- **Bénéfice** : réduit la dépendance à l'enrichissement 15 px du pathfinder, rend le graphe plus propre →
  **navigation plus fiable** + confort de cartographie sur réseau dense (GRS).
- **Optionnel pour l'utilisateur** : un sous-toggle « magnétisme » (certains préfèrent le dessin libre).
- ⚠️ Touche le **chemin de dessin** (`road.js > mousedown`) — à tester avec soin (cohérence avec
  l'historique undo/redo et le débounce d'intersections de v1.26.3-hotfix4).

---

## 7. Multi-niveau

Le graphe porte déjà `nodeLevels` + les **jonctions** (escaliers/pentes reliant 2 niveaux). La nav doit :
- contraindre le snapping aux arêtes du **niveau actif**,
- autoriser le changement de niveau en **franchissant une jonction** (le cap seul ne suffit pas — détection
  d'un franchissement de nœud-jonction).
- → traité en **phase 2 (lot C6)** pour ne pas alourdir le cœur.

---

## 8. Risques & mitigations (honnête)

| Risque | Impact | Mitigation |
|--------|--------|------------|
| **Boussole faussée** (ferraille, tuyaux, béton armé) | Mauvais virage à une intersection | Biais topologique (préférer rester sur l'arête) + **recalage manuel existant** + lissage du cap |
| **Longueur de pas variable** (personne, terrain) | Erreur de distance | Re-snapping à chaque pas ré-ancre ; `stepLength` déjà configurable |
| **Galeries parallèles serrées** | Snap sur la mauvaise galerie | Coût de transition favorise les arêtes connectées vs sauts spatiaux |
| **Graphe lourd** (GRS dense) | Coût de reconstruction | Cache + invalidation **débouncée** (esprit P0-3) ; buckets O(1) pour le matching |
| **Plan sans tracés** | Feature non pertinente | Garde-fou : toggle inactif + message |
| **Régression du PDR actuel** | Casse l'existant | Branche `avancerRaster()` = code actuel intact ; défaut OFF |

---

## 9. Découpage en lots (chacun testable indépendamment)

| Lot | Contenu | Risque | Réversible seul |
|-----|---------|--------|-----------------|
| **C1** | Extraire `_buildGraph` (+ buckets, enrichissement) en module partagé `roadGraph` + **cache** + invalidation débouncée. Pathfinder consomme le module — **comportement inchangé**. | Faible (refactor) | n/a |
| **C2** | Toggle `smartNav` (UI Réglages + persistance per-plan, **défaut OFF**) + branche dans `avancer()` qui appelle l'existant. **Plomberie réversible, zéro algo.** | Très faible | ✅ |
| **C3** | Snapping initial + **map-matching greedy** par pas (`avancerSurGraphe`) + **repli off-network hybride**. **Cœur de la feature.** | Moyen | ✅ (toggle OFF) |
| **C4** | Sélection d'arête aux nœuds via cap + lissage des transitions. | Moyen | ✅ |
| **C5** | **Magnétisme edit-time** : accrochage des points au graphe pendant le dessin + feedback visuel + sous-toggle. | Faible | ✅ |
| **C6** | Multi-niveau (jonctions = changement de niveau) + **docs** (README_USER, AI_CONTEXT, CLAUDE) + **tuto onboarding**. | Moyen | ✅ |

**Ordre conseillé** : C1 → C2 → C3 → C4 → C5 → C6. Après chaque lot : test terrain KARMA, commit sur
`Karma_dev`, jamais main sans « oui je le veux ».

---

## 10. Décisions verrouillées (2026-05-29)

1. **Off-network** → **HYBRIDE** (repli PDR raster + re-snapping au retour près d'un tracé).
2. **Magnétisme edit-time** → **INCLUS** dans l'initiative (lot C5).
3. **Doc de conception dédiée** → **OUI** (ce fichier).

---

## 11. Annexe — esquisse des structures & pseudo-code

### 11.1 Position sur graphe

```js
// État de navigation map-matched
let navState = {
  onNetwork: false,        // sur le réseau (true) ou repli PDR raster (false)
  edgeId:    null,         // arête courante { a: nodeIdx, b: nodeIdx }
  t:         0,            // position le long de l'arête, [0,1]
};
```

### 11.2 Pseudo-code `avancerSurGraphe()`

```
brute     = pdrBrut(position, cap, stepLength × scale)
candidates = graphe.aretesDansRayon(brute, R)        // via buckets, O(1)

si candidates est vide ET distance(brute, réseau) > seuilOffNetwork :
    navState.onNetwork = false
    return avancerRaster()                           // repli HYBRIDE

meilleure = argmin sur candidates de :
      w1·distance(brute, arête)
    + w2·désalignement(cap, orientation(arête))
    + w3·coûtTransition(navState.edgeId, arête, graphe)

(navState.edgeId, navState.t) = projeter(brute, meilleure)
position = pointSurArête(meilleure, navState.t)
navState.onNetwork = true
_pushTimelinePoint("matched")                        // distinguer du "pdr" pur
updateMap()
```

### 11.3 Points d'intégration

- `js/pathfinder.js` → extraire le graphe en module (C1).
- `js/tracking.js` → `avancer()` branche + `avancerSurGraphe()` (C2/C3/C4).
- `js/road.js > mousedown` → magnétisme (C5).
- `js/config.js` / SessionPersist → persistance `smartNav` per-plan.
- UI Réglages → toggle + sous-toggle magnétisme.

---

*Fin du document de conception. Aucune ligne de code n'est encore écrite : ce fichier sert de référence et de
trace de décision avant le développement du lot C1.*
