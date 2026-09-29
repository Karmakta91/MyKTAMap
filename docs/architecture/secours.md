# Architecture MyKTAMap — Mode Secours (toutes phases) + urgence

> Référence détaillée extraite de l'ancien CLAUDE.md. Lue à la demande (pas auto-chargée).
> Sections : §52.0 (état courant de l'écran XL), §52, §65, §66, §67, §69, §73, §78

---

### 52.0 Écran urgence « XL » — état de l'écran au 26/09/2026 (refonte)

> Les sections 52.x suivantes racontent l'historique. **Celle-ci décrit ce que
> l'écran affiche aujourd'hui** : c'est elle qu'il faut lire avant d'y toucher.

Demande KARMA, en trois temps : *« enlève la position en PX si on a la
possibilité d'afficher de vraies coordonnées GPS (pas les deux donc) »* ·
*« enlever en bas échelle / plan / état et regrouper en petite icône en haut,
et enlever le bouton DARK/LIGHT qui était là à l'époque où toute l'appli ne
l'était pas »* · *« comme ça on gagne de la place pour pas avoir de scroll et
une map plus grande »*.

#### Ce que l'écran contient désormais

```
┌─ header ─────────────────────────────────────────────┐
│ 🚨 MODE URGENCE                                     │
│ Nom du plan                  🔋 82% · 📍 Tracker ON │  #kta-em-etat
├─ grid (1 colonne, 2 pistes) ────────────────────────┤
│ 📍 POSITION (PLAN)  |  🌍 GPS (LAT / LNG)  ← UN SEUL  │  #kta-em-pos-label
│ 9014 / 12338     |  48.823328 / 2.322915           │  #kta-em-pos-xy
│ ⚠️ position de départ du plan, jamais confirmée     │  #kta-em-pos-status
├─────────────────────────────────────────────┤
│            minimap + 🧭 CAP (piste 1fr)            │  #kta-em-mini-map
└─ ↩️ SORTIR (sticky bottom) ───────────────────────┘
```

#### Les trois règles à ne pas casser

1. **Une seule position.** `_tick` appelle `_transformCalib()` — le calibrage
   KMZ du plan, extrait de `_tick` à cette occasion — **avant** d'écrire le
   bloc : s'il y a du GPS, le label devient `emergency.label.gps`, la valeur
   prend la classe `.kta-emergency-pos-gps` (floats plus longs → police plus
   petite) ; sinon on reste sur le X/Y. Il n'y a plus qu'un `id` de position
   (`#kta-em-pos-xy`), plus de `#kta-em-bloc-gps`.
   ⚠️ **Le sous-titre d'état reste sous les chiffres dans les deux cas.** Une
   coordonnée GPS calculée depuis une position jamais confirmée doit le dire :
   c'est celle-là qu'on dicte au téléphone. Tout plan géoréférencé en donne
   (`main.js` recopie la géoréf dans le calibrage au chargement), donc en
   pratique **le X/Y ne s'affiche que sur un plan non géoréférencé** — et un
   test qui ne neutralise pas le calibrage ne mesure qu'une branche sur deux.

2. **Les icônes de la puce d'état sont portées par le code, plus par un label.**
   🔋/🪫/⚡ vient de `BatteryGuard.getEmoji()` (`formatLabel()` ne rend que
   « 87% ») ; 📍 et 🧭 sont passés dans les valeurs des dicos
   `emergency.etat.*`. Les clés `emergency.label.{echelle,plan,etat}`,
   `emergency.theme.toggleTitle`, `emergency.hint` et `emergency.echelle.*` ont
   été **supprimées des trois dicos**.
   🧹 27/09/2026 — **l'échelle px/m est partie** (KARMA) : c'est un chiffre de
   calibrage, il se lit une fois dans ⚙️ Réglages et n'apprend rien à qui
   cherche où il est. Les distances de l'app en dépendent déjà sans conversion
   manuelle. Il ne reste qu'une puce, celle de l'état du matériel — celui qui
   change.

3. **Les couleurs de la légende personnalisée atteignent la mini-carte.** Elle
   garde sa palette vive (variante délibérée, cf en-tête de `styleResolver.js`)
   mais chaque style passe par `_styleMini(cat, clé, base, gabarit)` :
   base locale → sinon `ktaResolveStyle(cat, clé, {flat:true})` (donc les types
   `cust-…`) → puis `ktaAppliquerCouleurChoisie`, **la même fonction que la
   carte** — la règle « ce qu'une couleur repeint selon la géométrie » n'est pas
   réécrite ici. Avant (26/09/2026) : un tracé repeint restait vert, une zone
   custom sortait en **gris remblais**, une structure custom en **bleu mur**, un
   front custom en **jaune front-1** — la mini-carte montrait autre chose que la
   carte, sur l'écran où l'on cherche à reconnaître son propre relevé.
   Couvert par `checkup-urgence-memoire.js` (contrôle C, falsifié : les trois
   assertions tombent quand on neutralise le correctif).

4. **`min-height: 100%`, PAS `max-height`, sur `.kta-emergency-box`.** C'est ce
   qui donne à la grille (`flex: 1 1 auto`, piste 2 = `minmax(0, 1fr)`) de la
   hauteur à distribuer. Première tentative mesurée avec `max-height: 100%` :
   la boîte gardait sa hauteur naturelle, la grille n'avait **rien** à répartir
   et la minimap restait à son plancher de 260 px avec **155 px d'écran vide
   sous le bouton**.

#### 🪢 Batterie : `isAvailable()` avant tout (26/09/2026)

`BatteryGuard.formatLabel()` **ne rend pas une chaîne vide** quand la batterie est
hors service : il rend **« ? »**, et `getEmoji()` rend 🪢 — c'est l'état
« indispo » explicite de la v1.11.1, pensé pour que la chip de l'en-tête puisse
montrer son emplacement grisé. Le test `if (bat)` de ce module était donc
**toujours vrai**, et le bloc ÉTAT affichait « 🪢 ? » sur Safari iOS, sur
Firefox, et sur tout appareil dont l'utilisateur a décoché
`APP_CONFIG.batterieEnabled`.

⚠️ **Régression de la v1.97.6**, quand la batterie est arrivée dans ce bloc : la
chip de l'en-tête, elle, est masquée depuis la **v1.11.1-fix3** — sur la même
demande de KARMA (*« enlève le fait de voir l'icône batterie si l'API pas dispo,
cas iOS »*). La décision existait ; cet écran ne l'avait jamais reçue.

La condition est `BatteryGuard.isAvailable()`, **jamais** la véracité du libellé.
Couvert par `checkup-urgence-memoire.js` (bloc B) : sans capteur, l'état ne doit
contenir ni « ? », ni « % », ni 🪢/🔋/⚡ — et doit garder le tracker et la
boussole (masquer trop serait l'autre façon de se tromper).

#### 📋 Copier sa position (26/09/2026)

KARMA : *« on devrait avoir la possibilité de copier les coordonnées GPS de notre
position, pour les envoyer si on trouve un point de réseau »*.

- `_texteACopier()` — plan géoréférencé : **`lat, lng` NU**, six décimales.
  ⚠️ Pas d'heure, pas de cap, pas de nom de plan : tout ajout casse le collage
  dans une app de carte, et l'écran où l'on est perdu est le pire endroit pour
  découvrir qu'il faut nettoyer une chaîne à la main. Plan non géoréférencé :
  `<nom du plan> — X <x> / Y <y>`, qui ne sert qu'à quelqu'un ayant le même plan.
- **Le doute ne se copie pas.** Le sous-titre « position de départ, jamais
  confirmée » reste À L'ÉCRAN : il se dit à la personne, il n'a pas à partir
  dans un message qu'un tiers lira hors contexte.
- `window.ktaCopierTexte(txt)` (nouveau, `utils.js`) : `navigator.clipboard`
  puis repli `execCommand`. Les **deux** chemins sont nécessaires — l'API
  sécurisée n'existe pas sur une instance servie en **HTTP**, qui est
  précisément le mode de déploiement d'un réseau isolé de secours. Le
  presse-papier était recopié à la main dans **sept** modules ; celui-ci est le
  premier consommateur du helper (migration des 7 autres au BACKLOG).
- **Carré de 48 px à DROITE des chiffres**, dans leur ligne (`.kta-emergency-pos-ligne`,
  la valeur en `flex: 1; min-width: 0`). 🧹 27/09/2026 (KARMA « trop grand, prend
  une place inutile ») : il était pleine largeur SOUS les chiffres et coûtait
  48 px de hauteur à la carte ; il occupe maintenant le vide à leur droite et
  n'en coûte plus que douze. 48 px reste au-dessus du minimum tactile (44 px) —
  cet écran se touche avec des gants. 40 px en paysage bas, 44 px sous 360 px de
  large. Les chiffres sont cliquables aussi. Le bouton ne contient qu'UN
  caractère (📋 → ✅ / ⚠️ / —) et la phrase vit dans `title` + `aria-label` :
  un « ✅ Copié » complet le ferait grandir, donc annulerait le gain.
- Coût mesuré : la mini-carte passe de 529 à **510 px** en 390×844 (486 avec
  l'ancien bouton pleine largeur), bouton de sortie toujours à 820/844,
  **0 px de débordement**. Vérifié aussi en 375×667 (309 px de carte), en
  paysage 844×390 (271 px) et en **320×568**, où une media query à 360 px abaisse
  le plancher de la carte à 200 px : **50 px de défilement → 0**. Les chiffres
  GPS ne sont tronqués sur aucun de ces formats.
- Couvert par `checkup-urgence-memoire.js` (bloc P) : taille de la cible,
  **contenu réel du presse-papier** dans les deux branches (permission
  `clipboard-read`), absence de débordement, et repli joué en rendant
  `navigator.clipboard` inaccessible.

#### Mesuré (Playwright, plan tuilé servi en HTTP, 3 formats × 2 branches)

| Format | Minimap avant | Minimap après | Bas du bouton | Débordement |
|---|---|---|---|---|
| 390×844 (portrait) | 260 px | **529–538 px** | 820 / 844 | **0 px** |
| 844×390 (paysage) | 160 px | **271 px** | 374 / 390 | **0 px** |
| 1100×800 (desktop) | 320 px | **504–515 px** | 776 / 800 | **0 px** |

En paysage bas, la grille passe à deux colonnes `minmax(0,1fr) minmax(0,1.35fr)`
avec la minimap en `grid-column: 2` sur toute la hauteur — l'empilement
vertical n'y laissait que 160 px de carte.

Le thème n'a plus de bouton : `activer()` lit `ThemeManager.isLight()` depuis
la v1.23.0, `setTheme()` reste exposé dans l'API publique mais ne rafraîchit
plus rien d'autre que la classe de thème.

`scripts/smoke/checkup-urgence-memoire.js` couvre l'écran (fond de minimap,
boussole au premier affichage, bouton dans l'écran, batterie dans l'état,
rotation de la minimap) — vert après la refonte.

---

### 52. Mode urgence — fixes v1.12.0

#### 52.1 Rotation paysage (orientation change)

Avant : la minimap Leaflet ne se redimensionnait pas seule à la rotation device → tuiles décalées, marker tracker hors zone visible.

Fix : listener `orientationchange` + `resize` qui appelle `invalidateSize()` en cascade (3 retries 80/300/700ms pour gérer les transitions iOS Safari lentes) + `fitBounds` pour refit complet :

```js
_orientationListener = function() {
  if (!_miniMap) return;
  function _retry() {
    try {
      _miniMap.invalidateSize({ animate: false });
      const pc = window.PLAN_CONFIG;
      if (pc?.plan) {
        _miniMap.fitBounds([[0, 0], [pc.plan.imageHeight, pc.plan.imageWidth]]);
      }
    } catch(e) {}
  }
  setTimeout(_retry, 80);
  setTimeout(_retry, 300);
  setTimeout(_retry, 700);
};
window.addEventListener("orientationchange", _orientationListener);
window.addEventListener("resize",            _orientationListener);
```

Cleanup au `desactiver()` pour ne pas garder des appels invalidateSize zombies après fermeture du mode.

#### 52.2 Décimation itinéraire (anti-crash gros plan)

Avant : itinéraire 1000-3000 pts → polyline énorme dans Leaflet pendant que tout le reste tourne en parallèle → OOM ou main thread bloqué.

Fix dans `_addRoadsToMiniMap` :
- **Skip total** si itinéraire > 500 pts
- **Décimation 1 pt/N** sinon, cap 100 pts
- **Cap total 5000 pts** sur l'ensemble des polylines de la minimap
- Toggle ☑️ 🗺️ Itinéraire dans header pour réafficher manuellement (skipé par défaut)

#### 52.3 Toggle 🗺️ Itinéraire visibilité (cyan + halo)

Le toggle réaffiche l'itinéraire, mais sur fond minimap zoomé serré + désaturé, weight 3 dashed était quasi invisible. Fix :
- **Cyan vif weight 6** (ligne pleine, no dashArray)
- **Halo blanc weight 10** dessous (2 polylines superposées) pour outline visible sur n'importe quel fond
- `lineCap: "round"` + `lineJoin: "round"` pour masquer les gaps de décimation

Persistance choix : `localStorage["myktamap_emergency_show_iti_v1"] = "1"|"0"`.

#### 52.4 Bouton 📍 Recalage auto-close

Avant : après click recalage, l'icône 📍 du groupe Tracker restait active (surlignée) jusqu'au prochain stop tracker — laissait penser que le mode était toujours actif.

Fix dans le handler de click recalage : avant l'appel à `_setGroupeModeActif("tracker", true, null)` (qui ne touche pas l'icône quand `actif=true && iconeReflet=null`), restore explicite de l'icône originale :
```js
const g = _groupes.tracker;
if (g && g.btnPrincipal && g.btnPrincipal.dataset.iconeOriginale) {
  g.btnPrincipal.innerHTML = g.btnPrincipal.dataset.iconeOriginale;
}
_setGroupeModeActif("tracker", true, null);
```

`window._fermerModeRecalage()` exposé pour pouvoir le call depuis n'importe où.

---

### 65. v1.22.0 — Mode Secours Phase 1 MVP (depuis v1.22.0)

Nouveau module `js/secoursMode.js` (~1500 lignes IIFE) → `window.SecoursMode`. Outil opérationnel pour assigner des équipes de recherche à des zones d'un plan cataphile. Bouton 🚨 dans le flyout urgences (Tracker), modale 3 vues (list/create/edit free-form). Persistance per-plan multi-scénarios via localStorage `myktamap_secours_v1_<planId>`. Palette OTAN 10 couleurs fixe. 3 modes interactifs map (point / polygon / roads). Pathfinder intégré pour pré-calcul itinéraires. Overlay carte couleur transparent par équipe. Exports PDF (1 page/équipe) + KMZ (extension myktamap-extras.json).

#### 65.1 Architecture & API

`window.SecoursMode = { init, reset, ouvrir, fermer, isOpen, getCurrentScenarioId, list, get, create, update, delete, duplicate, addGroupe, updateGroupe, removeGroupe, recalculerItineraires, exporterPDF, exporterKMZ, renderOverlay, clearOverlay, setFocus, onChange, PALETTE, MAX_SCENARIOS, VITESSE_MPS_DEFAUT }`.

**State module-level** :
- `_scenarios: Array` — cache chargé via _loadScenarios depuis localStorage
- `_currentScenarioId: string | null` — scénario en cours d'édition
- `_modal: HTMLElement | null` — DOM root de la modale
- `_overlayLayer: L.LayerGroup | null` — layer Leaflet de l'overlay carte
- `_focusedGroupeId: string | null` — mode focus single team
- `_activeMapMode: "point"|"polygon"|"roads"|null` — mode interactif courant
- `_mapModeCtx: object | null` — contexte du mode (groupeId, points, roadIds, etc.)

**Format scénario** (cf JSDoc en tête de secoursMode.js) :
```js
{
  id, nom, createdAt, updatedAt,
  context: { incidentAt, lastKnownPoint, zoneIncertitude, notes },
  groupes: [{
    id, nom, couleurIdx, membres,
    entree, sortie,                         // {x, y, level, pointId?} | null
    zoneType: "polygon"|"roads"|null,
    zonePolygon, zoneRoadIds,               // exclusifs
    itineraireSuggere, distanceM, dureeEstimeeMin,
    statut, observations
  }],
  pointsCles: [...]
}
```

#### 65.2 Cycle de vie & cleanup

- **init** : appelé par `main.js > lancerApplication` après `SessionPersist.onPlanLoaded`. Charge les scénarios du plan courant depuis localStorage.
- **reset** : appelé par `main.js > _libererRessourcesPlanPrecedent` au plan switch. Ferme modale + purge overlay + vide `_scenarios` in-memory (la persistance localStorage per-plan reste intacte).
- **fermer** : ferme la modale + appelle clearOverlay + set _currentScenarioId = null.

#### 65.3 Persistance per-plan multi-scénarios

localStorage `myktamap_secours_v1_<planId>` = array de scénarios.
Cap FIFO `MAX_SCENARIOS = 10` (au-delà, suppression du plus ancien par createdAt). 🩸 Depuis le 29/09/2026 (audit A5) : **jamais** un scénario en cours d'exécution, ni celui ouvert, ni le plus récent — si tout l'excédent est protégé, le cap est dépassé plutôt que de perdre une intervention (avant : 12 créations pendant une intervention l'effaçaient). **Âge FIFO = max(`createdAt`, `arriveeAt`)** : un import pose `arriveeAt` (arrivée sur l'appareil) — sans lui, un `.mkmsec` importé sur un téléphone qui avait déjà 10 scénarios était purgé dans le commit même de l'import (relecture R1).
Quota toast via OOMGuard si `QuotaExceededError` (pattern sessionPersist).
KARMA validation : « Oui — N scénarios sauvegardés par plan ».

#### 65.4 Palette OTAN 10 couleurs

`PALETTE` constante avec 10 entries `{hex, nom}` :
- Alpha #ff4444 (rouge), Bravo #4488ff, Charlie #44cc44, Delta #ffcc00 (ambre charte), Echo #ff4ecb (magenta = jonctions), Foxtrot #00d4ff (cyan = itinéraire), Golf #ff8c00, Hotel #9d44ff, India #8b5a2b, Juliet #404040

couleurIdx auto-cyclique au create d'équipe (`s.groupes.length % PALETTE.length`).

#### 65.5 3 modes interactifs map

Pattern : `_hideModalForMap` (display:none) → floater bottom rouge avec instruction + actions → `map.on("click")` listener → `_finishMapMode` (cleanup + restore modale via _showModalAfterMap + _switchView("edit")).

**POINT** (`_startDefiningPoint`) : `map.once("click")` auto-cleanup. Capture {x, y, level} via `APP_CONFIG.activeLevel`. Plan→latlng via convention `imageHeight - y`.

**POLYGON** (`_startDefiningZonePolygon`) : multi-clic. Preview L.polyline dashed rouge mise à jour à chaque sommet ajouté. Double-clic = ferme (min 3 sommets). Floater compte les sommets.

**ROADS** (`_startDefiningZoneRoads`) — 🩸 **réécrit le 29/09/2026 (audit Secours, A2)** : l'ancien mode accrochait un clic à chaque polyline via `entry.road` / `entry.layer`, absents du registre `_ktaDataPolylines` ; les tracés de session passaient sans calque → **aucun clic branché, rien de sélectionnable**. Et l'id posé aurait été aléatoire, sur une copie (`getAllEmbeddedRoads` clone). Désormais :
- **Clé = empreinte de la géométrie** (`_cleTrace` : FNV-1a sur les coordonnées au 1/10 px, préfixe `tr_<n>_`). Identique sur tous les appareils qui ont le même plan, rien n'est écrit dans le plan. Mesuré : 893 clés pour 893 géométries distinctes du plan de test (0 collision). Un tracé du plan modifié change de clé → il sort de la zone (voulu : ce n'est plus la même galerie). Mémo `WeakMap` par tableau de points, **réservé aux tracés du plan** (les tracés de session s'éditent en place).
- **Sélection** : `map.on("click")` → tracé le plus proche parmi les niveaux visibles (`passeFiltreNiveau`), tolérance 14 px écran convertie en unités plan (`14 / 2^zoom`) ; re-clic = retire. Surbrillance dans un `L.layerGroup` propre au mode (plus de `setStyle` sur les couches du rendu, plus de `_kta_originalStyle`). Rouvrir le mode reprend la sélection de l'équipe. La popup de note d'un tracé de session, ouverte par le même clic, est refermée.
- **Un seul lecteur** : `_tracesZone(g)` (overlay, bbox et canvas du PDF, avoidances, « POI de la zone », et `kmzExport.js` via `SecoursMode.tracesZone`). Accepte encore un ancien `road.id`. ⚠️ Ne jamais relire `zoneRoadIds` à la main : ce ne sont pas des `road.id`. Relecture (D2, D5) : une clé non résolue sur l'appareil (tracé de **session** d'un autre appareil) est **gardée** à la réouverture du mode ; les tracés des calques **masqués** restent sélectionnables (galeries souvent dessinées dans le PNG) — choix assumé.

#### 65.6 Pathfinder intégration

> 🩸 **29/09/2026 (audit Secours)** — « Tous les POI de la zone » (`_ajouterPoisDansZone`) ordonne les étapes en **chaîne du plus proche voisin** (`_ordrePlusProcheVoisin`, O(n²), pénalité de changement de niveau), à partir de la dernière étape déjà saisie, à défaut de l'entrée. Avant : tri par distance à l'entrée, malgré un commentaire qui annonçait l'inverse — +8 à +84 % de marche mesurés par l'audit sur 6 secteurs réels. Gain à vol d'oiseau mesuré après correctif : 26 à 45 %.

> 🩸 **29/09/2026 (audit Secours)** — `itineraireSuggere[].level` porte le **niveau réel** de chaque point (`_niveauxItineraire`) : les deux calculs (sync / async) l'écrasaient par `g.entree.level`. Point ambigu du pathfinder (`null` : milieu de jonction, nœud fusionné) → dernier niveau connu, à défaut l'entrée. Mesuré sur un trajet 0 → −1 réel : 33 points au −1, tous déclarés « 0 » avant. ⚠️ **Correction (relecture R5)** : j'avais écrit qu'aucun lecteur n'exploitait ce champ — **faux** : la Vue OSM (`osmView.js`) filtre l'itinéraire par niveau visible. Filtrer puis relier tirait un trait droit à travers la surface entre la descente et la remontée ; elle trace désormais des **tronçons** continus (multi-polyligne). Mesuré : niveau −1 masqué → 2 tronçons (3 + 2 points) au lieu d'un trait de 5 points. C'est aussi la donnée dont le guidage Secours (B1) aura besoin.

`_recalculerItineraireGroupe(scenarioId, groupeId)` :
1. Vérifie entree + sortie définies (toast warn sinon)
2. Appel async `Pathfinder.computeRoute([entree, sortie], {})` (async depuis v1.21.x pour expansion avoid tags)
3. Convertit `result.totalDistance` (px) → distM via `APP_CONFIG.scale`
4. Calcule `dureeEstimeeMin = distM / VITESSE_MPS_DEFAUT (0.5 m/s) / 60`
5. Update groupe avec `itineraireSuggere`, `distanceM`, `dureeEstimeeMin`
6. Toast feedback + re-render edit view

`recalculerItineraires(scenarioId)` : version batch qui itère tous les groupes du scénario.

#### 65.7 Map overlay (renderOverlay)

Pour chaque équipe (skip si focus actif et pas la focusée) :
- **Zone polygone** → L.polygon weight 3, opacity 0.85, fillColor couleur + fillOpacity 0.30
- **Zone roads** → L.polyline halo weight 10, opacity 0.55 par roadId
- **Entrée** → L.circleMarker radius 9, border #00cc44, fill couleur
- **Sortie** → L.circleMarker radius 9, border #cc0000, fill couleur
- **Itinéraire** → L.polyline weight 5, dashed "10 6", couleur

Toutes les couches taggées d'un tooltip "🚨 nom équipe" (ou role : Entrée/Sortie/Itinéraire).

**Auto-refresh** : `_commitMutation` détecte si overlay actif pour ce scénario → appelle `renderOverlay` pour update live.

#### 65.8 Export PDF (1 page A4 par équipe)

> 🩸 **29/09/2026 (audit Secours)** — la section Itinéraire imprimait « N waypoints » avec N = points du **tracé** (46 à 480 selon l'équipe) : elle liste désormais les **étapes** dans l'ordre (« 4 etapes : A > B > C > A », clé `secours.pdf.etapesLigne`, `waypointsLigne` retirée) ; le cadre Observations passe à la page suivante s'il ne tient plus.

> 🩸 **29/09/2026 (audit Secours)** — le fond du PDF de briefing se rendait à l'**échelle 1** (plan 16 332 × 13 820 : 225,7 Mpx, ~860 Mo de canvas ; Safari iOS refuse au-delà de 16,7 Mpx → PDF sans carte). `_echelleCanvasPlan(voulue)` plafonne à **16 Mpx** (`PX_MAX_CANVAS_PLAN`), pour le briefing et la mini-carte du rapport (qui était à 0,5 = 56 Mpx). Le recadrage par équipe travaille en unités plan et convertit par l'échelle **mesurée** du canvas (`_echelleDuCanvas`). Mesuré en navigateur : 4 348 × 3 680 = 16,0 Mpx, carte présente dans le PDF. ⚠️ Contrepartie (relecture R10) : une petite zone (< ~3 700 unités plan) est agrandie jusqu'à ×3,8 dans son recadrage → fond moins net ; « perte minime » annoncé au commit `f9d4742` était inexact. La liste d'étapes (3.3) saute de page ligne à ligne.

Via jsPDF déjà chargé pour pdfExport.js. Layout texte :
- Header bold "PLAN DE SECOURS — Nom équipe"
- Bandeau couleur équipe (fillRect + text blanc)
- Sections : CONTEXTE / MEMBRES / MISSION / ITINÉRAIRE
- Cadre OBSERVATIONS vide 60mm (impression papier)
- Footer crédit MyKTAMap build + timestamp

⚠️ **Limitation MVP** : pas de carte miniature avec overlay. Briefing 100 % texte. Phase 2 ajoutera un canvas snapshot du plan + zone via approche similaire à pdfExport.js > _genererCanvasPlan.

#### 65.9 Export KMZ (extension myktamap-extras.json)

Délègue à `KmzExport.genererKmz` avec 2 nouveaux opts :
- `secoursPlan` : scénario complet embarqué dans `myktamap-extras.json > secoursPlan`
- `secoursPalette` : palette pour Phase 2 (KML injection visible cross-app)

Pré-condition : plan calibré KMZ. Transform reconstruit on-demand via `KmzExport.buildTransform` (pattern §32.7 anti-fuite).

`kmzExport.js > genererKmz` étendu : check `_hasExtras` sur les 2 champs (planCustomLegend + secoursPlan), wrapper extensible `{type: "myktamap-kmz-extras", version: 1, exportedAt, customLegend?, secoursPlan?}`.

⚠️ **Limitation MVP — ✅ LEVÉE EN v1.23.0, voir §66** : à l'époque de la Phase 1, seul l'extras.json embarquait le scénario (re-import MyKTAMap natif), le `doc.kml` ne contenant pas les Placemarks/Polygons cross-app pour Google Earth / OsmAnd. **C'est fait depuis** : `kmzExport.js > _emitSecoursFolder` émet le Folder « 🚨 Secours » complet (Placemarks + Polygons). Ne pas relire ce paragraphe comme l'état courant.

#### 65.10 À NE PAS faire

- ❌ Persister `_currentScenarioId` ou `_overlayLayer` au plan switch — toujours reset
- ❌ Garder les styles modifiés des polylines au cleanup du mode roads — toujours restore `_kta_originalStyle`
- ❌ Skip `map.once` au mode POINT → utiliser `map.on` simple → fuit le handler après usage
- ❌ Faire `JSON.parse(localStorage.getItem(...))` sans try/catch et sans filtre défensif des entries (chaque scénario doit avoir au moins id + nom)
- ❌ Reassign `recalculerItineraires` après le export `window.SecoursMode = {...}` — l'export capture la ref à la position du code. Toujours faire le reassign AVANT l'export final.
- ⚠️ *(règle périmée — la Phase 3 a été livrée, cf. §67)* : `secoursPlan.groupes[].statut` **est exploité** (lu/écrit dans `secoursMode.js`, propagé à l'export). L'ancienne consigne « défini mais pas encore exploité » ne vaut plus.
- ❌ Ajouter des champs sensibles (positions GPS exactes en clair, photos de la victime, données médicales) dans le payload `secoursPlan` qui voyage dans le KMZ. Cohérence avec la philo cataphile « pas de données identifiantes dans les exports partageables ». Si Phase 3 ajoute des observations terrain, prévoir un opt-in explicite.

#### 65.11 Pour étendre

**Ajouter un nouveau champ d'équipe** (genre `equipementSpecial`) :
1. Ajouter dans `addGroupe` defaults
2. Whitelist dans `updateGroupe` partial
3. Render dans `_renderGroupesList` card
4. Persiste auto via `_commitMutation`

**Ajouter un nouveau type de zone** (genre "circle") :
1. Ajouter `zoneType: "circle"` + `zoneCircle: {cx, cy, radius}` dans groupes
2. Nouveau mode interactif map `_startDefiningZoneCircle` (1 clic centre + 1 clic rayon)
3. Render dans `_renderGroupeOverlay` via L.circle
4. PDF + KMZ exports adaptés

**Ajouter un statut temps réel (Phase 3)** :
1. Setter `setGroupeStatut(scenarioId, groupeId, "en_cours")` (déjà whitelisted dans updateGroupe)
2. Visual : tooltip overlay change selon statut, icône PDF différente
3. Sync via QR code → mini-modale "Scanner pour mettre à jour"
4. Timer global depuis `incidentAt` visible en permanence

---

### 66. v1.23.0 — Mode Secours Phase 2 (Intégrations + Cross-app)

Phase 2 livre 6/7 features de la roadmap §65.12 + 5 bonus/fixes. Le Mode Secours passe d'un brouillon perso à un outil de coordination opérationnelle cross-app.

#### 66.1 Feature A — KML cross-app complet (kmzExport.js)

Helper `_emitSecoursFolder(opts, secoursPlan, palette)` génère un Folder racine `🚨 Secours — <nom>` visible dans Google Earth / OsmAnd / Avenza / Locus. Architecture nested 3 sous-folders par équipe :

```
🚨 Équipe Alpha (Folder)
  ├── 📁 📍 Points (5)
  │   ├── 📍 Entrée Alpha — Puits PA1 (grn-circle)
  │   ├── ▾ Étape 1 (Alpha) (wht-circle teint)
  │   ├── ▾ Étape 2
  │   ├── ▾ Étape 3
  │   └── 🚪 Sortie Alpha — Puits PA1 (red-circle OU orange-circle si boucle)
  ├── 📁 ⬛ Zone de recherche
  │   └── ⬛ Polygone Alpha (Polygon 30% fill)
  │       OU 🛣️ Tracé zone Alpha (LineString halo) × N
  └── 📁 🗺️ Itinéraire
      └── 🗺️ Itinéraire Alpha (LineString 5px, desc "234m — 8min")
```

**43 styles KML** : 3 fixes (entrée/sortie/boucle) + 4×10 palette (zone polygon / halo roads / itinéraire / intermédiaires). Icônes natives Google Maps tintées via `<color>`. Détection boucle via `_samePoint` (pointId OU coords tolérance 0.5px) → marker orange + label "↻ Boucle".

#### 66.2 Feature B — Pathfinder avoidances cross-équipes

Helper `_collecterAvoidPointsAutresEquipes(scenarioId, currentGroupeId)` itère les autres groupes du scénario et collecte :
- entrée + sortie (skip si entrée=sortie pour la boucle)
- intermédiaires
- sommets polygon (zoneType="polygon")
- points roads (zoneType="roads")

Passé à `Pathfinder.computeRoute` via `opts.avoidPoints` + `opts.avoidRadius: 30`. Soft constraint = Pathfinder 2 passes natif (cf §31.2). Si `result.usedFallback === true` → toast warn `⚠️ Itinéraire traverse N point(s) d'autres équipes`.

Limitations connues : auto-calc batch parallèle à l'export ne propage pas les iti fraîchement calc des autres équipes (seulement waypoints + zones).

#### 66.3 Feature C — Lost Mode → Mode Secours pre-fill

> 🩸 **29/09/2026 (audit Secours)** — `context.lastKnownPoint.level` = **niveau du point**, plus le niveau affiché au clic sur « Lancer un plan de secours ». `lostMode.js` porte désormais `level` sur la position : POI choisi par recherche → son niveau (sans niveau = 0) ; clic carte / tracker → niveau affiché à ce moment ; `getState().lastKnownPos.level` (null si inconnu). `creerDepuisLostMode` retombe sur le niveau affiché pour un état sans niveau (appelant ancien). Testé en navigateur sur le plan réel.

`LostMode.getState()` nouveau API expose `{lastKnownPos, elapsedMinutes, speedKmH, radiusMeters, radiusPx, presetKey, clues}` (snapshot défensif).

`SecoursMode.creerDepuisLostMode(lostState)` :
- Crée un scénario `nom = "Recherche - <date>"`
- `context.incidentAt = now - elapsedMinutes × 60000`
- `context.lastKnownPoint = {x, y, level, label}` (level depuis APP_CONFIG.activeLevel)
- `context.zoneIncertitude = {x, y, radiusMeters, radiusPx}`
- `context.notes` auto-composé (temps écoulé + vitesse + rayon + indices)
- Ouvre la modale Mode Secours en vue Edit

Bouton `🚨 Lancer un plan de secours` dans la modale Lost Mode (`_emitMatchesUI`). Au clic : `close({keepLayers: true})` Lost Mode (préserve overlay carte pour contexte visuel) + `SecoursMode.creerDepuisLostMode(state)`.

Affichage dans modale Edit : bloc rouge `_renderContextImportedBlock` avec data read-only + boutons 🎯 Recentrer / ✕ Retirer. Overlay carte : `_renderContextOverlay` ajoute L.circle pointillé rouge (rayon px = radiusMeters × APP_CONFIG.scale) + L.circleMarker rouge fill blanc pour lastKnownPoint.

#### 66.4 Feature D — Heatmap d'activité dans Mode Secours

Bloc orange `_renderHeatmapToolBlock()` dans section 📝 Contexte. Toggle handler appelle `MyKTAMapHeatmap.afficher({srcTracker, srcEditor, srcRoads, radius:40, intensity:1.0})`. Si overlay équipes pas actif, l'active aussi (masque modale + floater "↩️ Retour modale").

Bouton ⚙️ Régler bascule vers `MyKTAMapHeatmap.ouvrirModale()` pour ajustements avancés (sources, M-LVL filter, radius, intensity).

Cleanup dans `fermer()` Mode Secours : si `_secoursHeatmapActive` → `MyKTAMapHeatmap.effacer()`.

Skip silencieux si `window.MyKTAMapHeatmap` pas chargé.

#### 66.5 Feature E — Auto-création 1 équipe par niveau M-LVL

Bouton conditionnel `🏗️ Auto : 1 équipe par niveau (N)` visible si `multiLevel === true` ET `availableLevels.length >= 2`. Au clic, itère `availableLevels` triés croissant et crée une équipe par niveau via `addGroupe(s.id, "Niveau RDC/+1/-1...")`. Confirm() si équipes existantes (anti-doublon).

#### 66.6 Feature F — Favoris en accès rapide picker waypoint

`_renderFavorisBlock()` dans `_ouvrirChoixWaypoint`. Affiche jusqu'à 8 favoris du plan en chips ambrés cliquables au-dessus de la recherche autocomplete. Clic = `_appliquerWaypoint(groupeId, role, idx, wp)` + close modale.

#### 66.7 Bonus — Pause configurable cross-feature

> 🩸 **29/09/2026 (audit Secours, 4.1 — décision KARMA)** — **n'est plus partagée.** Le Mode Secours reprenait la vitesse de l'itinéraire (5 km/h) et la pause commune (15 min) à CHAQUE étape : ~971 min affichées pour ~586 réalistes sur un secteur de 55 étapes. Le scénario porte `reglagesDuree` { vitesseKmh (défaut 1,5), pauseMin (défaut 0) }, bornés, transmis par le `.mkmsec`, réglés dans le bloc « ⏱️ Durées estimées » (`_reglagesDuree`, `_dureeEquipeMin`). L'itinéraire classique garde ses propres réglages.

Refactor `TEMPS_PAUSE_PAR_POINT_MIN` (hardcoded 15 min interface.js) en localStorage configurable :
- `myktamap_iti_pause_enabled` (bool, default true)
- `myktamap_iti_pause_minutes` (number, cap [0, 120], default 15)

Helpers `_getItiPauseEnabled / _setItiPauseEnabled / _getItiPauseMinutes / _setItiPauseMinutes` exposés globalement via `window.getItiPauseEnabled / window.getItiPauseMinutes / window.getItiTempsMinutes`.

`_tempsItineraireMinutes` lit dynamiquement. Section "🛑 Pause entre les arrêts" dans modale Itinéraire avec checkbox + input + hint "S'applique aussi au Mode Secours 🚨".

`secoursMode.js > _recalculerItineraireGroupe` + `_recalculerItineraireGroupeAsync` utilisent `window.getItiTempsMinutes(distM, nbWp)` au lieu de fallback historique `distM / 0.5 / 60`.

#### 66.8 Bonus — Fix georef format mismatch

**Format réel stocké par `KmzExport.setCalibration`** : FLAT `{pointA: {x, y, lat, lng}, pointB: {x, y, lat, lng}}` (cf 4 sites prod : createConf.js / interface.js / sessionExporter.js / main.js `_propagerGeorefVersKmzExport`).

§32.7 CLAUDE.md décrivait à tort un format NESTÉ `pointA.plan / pointA.gps` — JAMAIS EXISTÉ. Mon code Phase 1 utilisait ce faux format → `buildTransform(undefined × 4)` → "Calibrage corrompu" trompeur.

Fix : accès FLAT cohérent + check strict des 8 champs avant buildTransform.

⚠️ **TODO doc** : la §32.7 reste trompeuse — à corriger en commit doc suivant.

#### 66.9 Bonus — Plan en fond 60% KMZ Mode Secours

`exporterKMZ` async. Fetch image plan via RUNTIME_ASSETS (cas ZIP local) OU fetch HTTP (cas plan serveur), pattern identique sessionExporter.js. Passe à `genererKmz` avec `imageOpacity: 60` + `include.image: true`. GroundOverlay 60% opacity = lecture simultanée plan + overlays.

#### 66.10 Bonus — KMZ nested folders par catégorie

Le Folder Secours d'origine listait tous les Placemarks à plat dans le folder équipe. Restructure en 3 sous-folders (Points / Zone / Itinéraire) → toggle facile dans Google Earth (briefing initial = décocher tous les itinéraires, navigation équipe = décocher autres équipes).

#### 66.11 Bonus — Auto-calc itinéraires avant export KMZ

Helper async `_recalculerItineraireGroupeAsync(scenarioId, groupeId)` version Promise-based qui réutilise `window.getItiTempsMinutes` + résout silencieusement `true`/`false`.

À l'entrée de `exporterKMZ` : `Promise.allSettled(groupesACalc.map(_recalculerItineraireGroupeAsync))` avant `await fetch image plan` puis `KmzExport.genererKmz`. Toast cascade `⏳ Calcul auto de N itinéraires → ⏳ Génération KMZ → ✓ KMZ exporté`.

#### 66.13 v1.23.1 — 2 fixes UX post-Phase 2

Release PATCH (bump Z : 1.23.0 → 1.23.1). 2 régressions UX corrigées suite tests terrain KARMA.

**Fix 1 — `.kta-emergency-overlay` modale coupée mobile portrait** :

`css/style.css` ~ligne 5973 — remplacer `align-items: center` par `align-items: safe center`.

Root cause : la combo `display: flex; align-items: center; overflow-y: auto` ne permet PAS de scroller au-dessus de l'origine flex. Si le contenu dépasse le viewport (cas mobile portrait avec safe-area-inset-top + minimap 320px + 4 blocs heading/pos/stats/hint + bouton sortir ≈ 800-900px), `align-items: center` positionne la boîte en débordement par le HAUT autant que par le bas → le titre et le bouton thème en haut sont inaccessibles.

`safe center` (CSS Box Alignment Level 3) : centre si rentre, sinon bascule à `flex-start`. Chrome 93+ / Safari 16+ / Firefox 88+. Fallback gracieux `center` sur browsers plus anciens (le mot-clé `safe` est ignoré silencieusement).

**Règle générale** : pour tout overlay flex centré qui contient un contenu potentiellement plus grand que le viewport, utiliser `align-items: safe center` plutôt que `center` strict. Sinon piège silencieux sur mobile / petit écran.

**Fix 2 — MutationObserver pour heatmap "⚙️ Régler" depuis Mode Secours** :

`js/secoursMode.js > config-heatmap-secours handler` (~ligne 1907) : ajouter MutationObserver qui observe la suppression du DOM `#kta-heatmap-modal` puis restore `_modal.style.display` + re-render edit + disconnect observer.

Pattern de référence pour les futures intégrations cross-modale :
```js
if (_modal) _modal.style.display = "none";
window.MyKTAMapXxx.ouvrirModale();
const targetModal = document.getElementById("kta-xxx-modal");
if (!targetModal) { if (_modal) _modal.style.display = ""; return; }
const obs = new MutationObserver(function() {
  if (!document.body.contains(targetModal)) {
    if (_modal) _modal.style.display = "";
    if (_currentScenarioId) _switchView("edit");   // refresh si état a changé
    obs.disconnect();
  }
});
obs.observe(targetModal.parentNode || document.body, { childList: true });
```

ID du modal target stable depuis la création — vérifier dans le module concerné. Pour heatmap : `id="kta-heatmap-modal"` (`js/heatmap.js:730`).

⚠️ **Anti-pattern à éviter** : NE PAS cacher la modale parent sans mécanisme de restauration. Soit on superpose (z-index plus élevé pour la sous-modale, mais risque de stack de backdrops empilés), soit on utilise le pattern MutationObserver ci-dessus.

#### 66.12 À NE PAS faire

- ❌ Réintroduire format NESTÉ `calib.pointA.plan` / `calib.pointA.gps` — il faut **flat** `calib.pointA.x` / `calib.pointA.lat` (cf §66.8)
- ❌ Mute `LostMode.getState()` retour — c'est un snapshot défensif, l'appelant ne doit pas écrire dedans
- ❌ Hardcoder TEMPS_PAUSE_PAR_POINT_MIN à 15 ailleurs — utiliser `window.getItiPauseMinutes` ou `window.getItiTempsMinutes`
- ❌ Ajouter une feature G qui modifie `searchPoints.js > findByQuery` sans vérifier que les autres consumers (Pathfinder, modale itinéraire) restent fonctionnels — la recherche autocomplete intégrée dans picker waypoint suffit pour MVP

#### 65.12 Roadmap phases suivantes (validées KARMA)

**Phase 2 — Intégrations** (v1.23.0) :
- Lost Mode → auto pre-fill `context.lastKnownPoint` + `zoneIncertitude`
- Favoris → import auto des favoris taggés `entrée/sortie` dans pointsCles
- Heatmap → si timeline tracker du disparu importée, suggestion zones probables
- Recherche unifiée Ctrl+K → étend pour assigner un point à une équipe en 2 clics
- M-LVL → suggestion auto "Groupe 1 = RDC, Groupe 2 = -1"
- Pathfinder avoidances cross-équipes — la zone d'une équipe devient "préférence éviter" pour les autres (pas de chevauchement involontaire)
- **KML cross-app** (folder 🚨 Secours avec Placemarks + Polygons)
- **Carte miniature PDF** (canvas snapshot du plan + overlay zone équipe)

**Phase 3 — Statut temps réel** (v1.24.0) :
- Statut par équipe : `non_demarré / en_cours / terminé / rappelé`
- 1 user maintient l'état sur son device (PC secours surface)
- **QR code share** : envoie l'état initial aux devices équipes (lecture seule, anti-réseau souterrain)
- Au retour, scanner QR depuis device équipe pour reverser observations (`.mkmsec.observations.json`)
- Timer global depuis `incidentAt` visible toujours, signal stress visuel après seuils
- Re-export PDF "rapport final" avec observations remplies

---

#### 64.14 À NE PAS faire (post-fix1)

- ❌ Créer un nouveau module IIFE avec ses propres classes CSS custom sans **également écrire le CSS** dans `style.css` ET vérifier visuellement le rendu avant release. Le CSS oublié n'est jamais signalé par les outils (pas de warning, pas de plantage)
- ❌ Inclure `road.type === "itinerary"` dans l'énumération de types user-chooseable — c'est un dérivé Pathfinder, le type est posé automatiquement (cf `road.js > _calculerItineraire`)
- ❌ Bypass `useDefaultLabels` dans `_renderPieChart` pour les vues cross-plan — sinon les labels session/plan-level du plan COURANT polluent l'agrégat des autres plans
- ❌ Réintroduire le check `breakdowns: cached.breakdowns || null` sans fall-through — fait skip totalement les plans avec cache pré-v1.21.4
- ❌ Limiter le fallback session-only à `editorPoints + roads` — penser à inclure aussi `zones` + `structures` (présents dans le payload SessionPersist depuis v1.9.3-A1.a)

---

---

### 67. Mode Secours — Évolutions v1.23.2 → v1.25.1 (consolidation Phases 2 finale + Phase 3 complète)

Cette section consolide les ~10 releases entre v1.23.2 et v1.25.1 qui ont fait évoluer le Mode Secours depuis Phase 1 MVP (§65) + Phase 2 cross-app (§66) jusqu'à la Phase 3 « exploitation terrain temps réel » complète.

#### 67.1 v1.23.2 — Feature G : Ctrl+K → assigner POI à équipe en 2 clics

Dernière feature manquante Phase 2 (G/7). Bouton 📌 dans les résultats de la recherche unifiée Ctrl+K, visible UNIQUEMENT si Mode Secours actif avec scénario. Mini-modale `ouvrirAssignerModale(point, layerLabel)` exposée via `window.SecoursMode` : sélection équipe (dropdown avec swatch palette OTAN) + role (radio Entrée/Étape/Sortie) + `_appliquerWaypoint(equipeId, role, null, wp)` qui préserve `point.id` pour détection boucle `_samePoint`. z-index 100002 (au-dessus de la Recherche à 99999). **Pattern critique** : ferme la modale Recherche AVANT d'ouvrir Assigner (snapshot point + label local pour éviter perte de référence).

**4 fixes UX prioritisés via audit agent dédié** : `.kta-readme-modal-overlay` → `align-items: safe center` (cascade BASE de TOUTES les modales) ; touch targets `.kta-btn-xs` mobile `min-width: 36px min-height: 36px` (WCAG 2.5.5 AA) ; cohérence boucle `[data-loop="1"]` border-left orange override variants vert/rouge ; z-index stack assign-modal close cascade.

#### 67.2 v1.23.3 — Niveau M-LVL assignable par équipe

Bug logique terrain : « on doit pouvoir crée une équipe et lui assigné une zone sur un niveau ». **Nouveau champ `g.level: number | null`** au modèle équipe — auto-défini depuis `APP_CONFIG.activeLevel` à la création par défaut, whitelist `updateGroupe`. Signature `addGroupe(scenarioId, nom, level?)` étendue avec 3e arg optionnel.

**Mini-modale `_ouvrirCreerEquipeMlvlPrompt(scenarioId)`** sur plans M-LVL : input nom + dropdown niveau (`availableLevels` + option « Sans niveau », pré-set `activeLevel`) + boutons ✓ Créer / Annuler. Plans mono-niveau : comportement v1.22.x strict (ajout direct sans prompt).

**Chip `🏗️ RDC`** dans header card équipe (style pill ambré charte) + **select éditable « 🏗️ Niveau M-LVL »** dans body card (uniquement si M-LVL actif) → handler `change-level` qui `updateGroupe(level)` + re-render. **Fix Feature E auto-création** : passe `lvl` explicite à `addGroupe(s.id, nom, lvl)` (avant : constructor lisait `activeLevel` pour TOUTES les équipes → toutes avaient le même level).

#### 67.3 v1.23.4 — Format `.mkmsec.json` export/import autonome + fix Heatmap Régler

Demande : partage cross-appareil sans devoir exporter toute la session (use case « opérateur chef de surface » ↔ « secouriste »). Format JSON autonome avec wrapper extensible :

```js
{
  type:       "myktamap-secours-scenario",
  version:    1,                              // MKMSEC_FORMAT_VERSION
  exportedAt: ISO,
  appVersion: __MKM__.build,
  plan:       { id, name, version, imageWidth, imageHeight,
                multiLevel, availableLevels, scale },
  scenario:   deep clone (id, nom, createdAt, updatedAt,
                          context, groupes, pointsCles)
}
```

Filename : `Secours_<nom_slug>_<YYYYMMDD>.mkmsec.json`. `MKMSEC_FORMAT_VERSION = 1` constante exposée pour validation stricte.

**Fonctions exposées** : `exporterScenario(scenarioId)` + `async importerScenario(input)` (File | Blob | string). Import valide type + version ≤ max + structure scenario (nom + groupes array), re-génère ids (anti-collision si re-import multiple), filtre défensif whitelist champs. Si plan.id ≠ plan courant → `confirm()` natif (sera remplacé par modale charte en v1.23.5).

> 🩸 **Corrigé le 29/09/2026 (audit Secours, A1) — les ids d'origine sont GARDÉS.** La régénération systématique
> cassait l'import consolidé (§72) : le téléphone d'une équipe travaillait sur d'autres ids que le PC, et son rapport
> était refusé à 100 % (`errScenarioDifferent` / `errEquipeAbsente`). Désormais `_appliquerPayloadImport(payload, mode)`
> garde scénario, équipes et phases ; il ne régénère que si le scénario est **déjà sur l'appareil** et que l'utilisateur
> choisit **« Importer comme copie »** (ou un id absent / en double). **« Remplacer »** (défaut coché dans l'aperçu)
> réécrit le scénario à sa place, mêmes ids — son exécution locale éventuelle est perdue **avec ses photos** (`deletePhotosForScenario`, relecture R8 : sinon elles revenaient dans le rapport suivant et comptaient dans le quota), l'aperçu le dit dès qu'une exécution existe, en cours ou terminée.
> `importerScenario(input, {mode})` : sans `mode`, un existant part en **copie** (jamais d'écrasement implicite) ;
> son `confirm()` de plan différent est passé à `ktaConfirm`. Test : harnais 2 appareils, 19 contrôles.

**Fix Heatmap « ⚙️ Régler »** : bouton TOUJOURS visible tant que `window.MyKTAMapHeatmap` chargé (avant : condition fragile `_secoursHeatmapActive && isVisible()` faisait disparaître le bouton après cycles de rendu).

#### 67.4 v1.23.5 — Modale preview AVANT import + mini-légende carte PDF

**Refactor `importerScenario` split en 2 fonctions internes** (pattern §35 charte Promise-based, plus de `confirm()` natif) :

```js
async function _parsePayloadMkmsec(input) {   // validation seule
  return { ok, payload?, warning?, error? };
}
function _appliquerPayloadImport(payload) {    // injection seule
  return { ok, scenario };
}
```

`importerScenario` reste exposé en API publique combinant les 2 (rétro-compat v1.23.4 avec `confirm()` natif pour callers programmatiques sans UI). Picker UI `_ouvrirImportMkmsecPicker` utilise désormais flow split + modale preview au milieu.

**Modale preview `_afficherPreviewImport(payload, warning, sourceFilename, onDone)`** : affiche nom + fichier source + date export + version app + plan source + liste équipes (max 8 + « +N autres ») avec couleur OTAN + nb membres + niveau M-LVL + indicateurs zone/parcours. Bandeau orange détaillé si plan différent. Boutons ❌ Annuler / ✓ Importer. Backdrop click + Échap = annuler.

**Mini-légende intégrée carte PDF** : helper `_drawTeamLegende(ctx, canvasW, canvasH, g, hexColor)` dessine bas-droite sur canvas 2D les éléments WYSIWYG présents pour CETTE équipe (zone polygon/roads, entrée, sortie/boucle, intermédiaires count, itinéraire). Box blanc semi-opaque + border, swatch 16×14px adapté au type. Rend le brief PDF auto-explicatif pour le secouriste terrain.

#### 67.5 v1.23.6 — Pause configurable cross-feature accessible depuis Mode Secours

Setters globaux exposés dans `interface.js` (en plus des getters depuis v1.23.0) : `window.setItiPauseEnabled(bool)` + `window.setItiPauseMinutes(number)` (clamp [0, 120]). Permet à Mode Secours (et tout module futur) de modifier les prefs sans dupliquer logique localStorage.

**Bloc UI « 🛑 Pause entre les arrêts »** dans section 📝 Contexte vue Edit Mode Secours (après bloc heatmap) : checkbox + input number 0-120 min + hint « S'applique aussi à l'itinéraire principal ». Au change → persiste localStorage + **recalcule auto les durées de toutes les équipes du scénario** via `_recalculerToutesDureesEquipes(scenarioId)` qui itère équipes avec `distanceM > 0`, calcule nb waypoints effectif, appelle `window.getItiTempsMinutes(distM, nbWp)`. Toast unique résumé.

**Cohérence cross-feature** : mêmes localStorage keys (`myktamap_iti_pause_enabled` + `myktamap_iti_pause_minutes`) entre modale Itinéraire et Mode Secours → si l'user change la pause depuis Mode Secours, l'itinéraire principal recalcule sa durée au prochain affichage.

#### 67.6 v1.23.7 — Fix CSS card équipe M-LVL : bouton 🗑️ hors cadre

Bug mobile portrait : header card équipe `.kta-secours-groupe-header` en `display: flex; align-items: center` SANS `flex-wrap`. Input nom (`flex: 1`) SANS `min-width: 0` (refusait de se compresser). Chip M-LVL `🏗️ RDC` (v1.23.3) + bouton 🗑️ poussaient le tout en débordement → bouton supprimer hors cadre.

**Fix 3 axes CSS pur** :
```css
.kta-secours-groupe-header { flex-wrap: wrap; }
.kta-secours-groupe-nom { flex: 1 1 120px; min-width: 0; }
.kta-secours-groupe-header > button[data-action="del-groupe"] {
  flex-shrink: 0;
}
```

**Leçon réutilisable** pour cards futures à header flex multi-items : combiner `flex-wrap: wrap` + `min-width: 0` sur item flexible + `flex-shrink: 0` sur items critiques.

#### 67.7 v1.24.0 — Phase 3 EXÉCUTION TERRAIN (pack MINOR complet)

Pivot architectural majeur : le scénario a maintenant 2 états : **CRÉATION** (vue Edit existante Phases 1+2) et **EXÉCUTION** (nouvelle vue Live).

##### 67.7.1 Modèle de données `scenario.execution`

Persisté dans le scénario localStorage existant (`myktamap_secours_v1_<planId>`). Pas de nouveau key.

```js
scenario.execution = {
  active:          boolean,
  startedAt:       ISO,
  endedAt:         ISO | null,                  // null = en cours
  pausedAt:        ISO | null,                  // si pause active, ISO du début
  pausedTotalMs:   number,                      // cumul pauses (timer juste)
  role:            "operateur" | "equipe" | "secouriste",
  currentEquipeId: string | null,               // si role="equipe" ou prise main
  // 🆕 v1.24.1 : flags optionnels mémoire prise de main
  _previousRole:    string | null,              // pour "Retour Opérateur"
  _previousEquipeId: string | null,
  etapes: {
    [equipeId]: [
      {
        type:          "entree" | "interm" | "sortie",
        idx:           number,                  // 0=entrée, 1..N=interm, N+1=sortie
        label:         string,                  // hérité du parcours
        observations:  string,                  // user input libre (max 2000 char)
        statut:        "pending" | "ras" | "suspect" | "bloque"
                     | "indice" | "aide" | "demi-tour" | "victime",
        photoIds:      [string, ...],           // ids dans MyKTAMapSecoursPhotos
        startedAt:     ISO | null,              // quand l'équipe arrive à l'étape
        completedAt:   ISO | null               // quand elle passe à la suivante
      }
    ],
    // Mode secouriste libre (notes en vrac, pas d'étapes structurées)
    _notes_libres: [
      { id, ts, statut, texte, photoIds }
    ]
  }
}
```

##### 67.7.2 Helpers CRUD execution (API publique `window.SecoursMode`)

> 🩸 **29/09/2026 (audit Secours — 3e version, après deux relectures)** — les étapes ne se construisaient qu'au lancement et au passage de phase. `addGroupe`, `updateGroupe` (entrée, sortie, intermédiaires) et `affecterEquipeAPhase` (équipe cochée dans la phase **en cours**) appellent `_resyncEtapesEquipe`, dans les conditions de `_resyncApplicable` (exécution active, équipe dans la phase courante). Règles :
> - 🩸 **3e relecture (R3-1)** : un `wid` manquant est **CALCULÉ** (`_widDeterministe` : équipe + rôle + position + rang d'occurrence), jamais tiré au hasard — sinon PC et téléphone en fabriquaient de différents pour toute donnée d'avant la version (1 étape fusionnée sur 5, victime dupliquée). Un `wid` **inconnu de l'autre côté** compte comme absent dans l'apparieur (repli position, puis libellé, symétrique). Vérifié par une **matrice à deux versions** (ancien code ↔ nouveau, même stockage relu après mise à jour), qui échoue 9 fois sur le code d'avant ce correctif.
> - **identité d'un point de passage = `wid`**, posé à sa création (`updateGroupe`, `exporterScenario` — avant le départ vers les équipes —, `lancerExecution`) ; chaque étape porte le `wid` de son point. Un point fourni sans `wid` **hérite** de celui d'un point de même rôle à la même position — y compris d'une étape archivée (retiré puis remis). Un point nouveau, **déplacé**, ou un homonyme ailleurs, est un autre point. Les étapes d'avant les `wid` sont rattachées au parcours actuel par ordre (`_rattacherWidEtapes`).
> - **un seul apparieur** `_apparierEtapes` (resync ET fusion) : même `wid` ; sinon (l'un sans `wid`) même type + position ; sinon (rapport d'avant la v1.98.8, ni `wid` ni position) libellé par rang ; sinon numéro. **Jamais le libellé quand l'identité existe** (deux relectures ont montré qu'il reliait des étapes sans rapport).
> - saisies reportées ; étape retirée porteuse de saisies → `execution._etapesRetirees[gid]` (**vidée au passage de phase**), restaurée par `wid` si le point revient ; photos suivies en IndexedDB (`setStepIdx`, −2 = retirée) ; une photo est « détenue » par une étape courante **ou d'une phase close** (`etapesArchive`, R3-3), sinon hors rapport ; photos purgées avec leur scénario et à la relance — **confirmée** (`secours.lancer.relanceConfirme`, R3-7) ; focus live recalé.
> - **retrait en cours d'intervention** (décision KARMA 1:a) : refus si une étape perdue porte « aide » ou « victime » — **re-vérifié au ré-appel après confirmation** —, sinon `ktaConfirm`.
> - **fusion d'un rapport** (décision KARMA a, relecture N11) : « aide » ou « victime » sur une étape que le PC a retirée → le point est **remis** dans le parcours de l'équipe, après le point importé précédent (ou le point remis juste avant), puis fusionné par son `wid` quel que soit son ancien type ; **alerte rouge en clair** (`stats.alertes`). Remise **seulement** si le point a vraiment quitté le parcours, que le rapport donne sa position et que l'équipe est dans la phase en cours ; sinon **alerte rouge sans remise** (`alerteNonRemise` : équipe hors phase, rapport d'une version sans position). Une étape inconnue porteuse d'autres saisies est archivée.
> - ⚠️ Limite assumée : deux passages **au même endroit** fournis en objets neufs (appel programmatique) sont indiscernables — l'information reste au même lieu. Par l'interface (objets conservés), chacun garde son identité.

- `lancerExecution(scenarioId, opts)` : initialise s.execution (etapes via `_buildEtapesPourEquipe(g)` pour chaque équipe OU `_notes_libres: []` si role=secouriste). Si execution déjà active → update role/equipeId sans casser étapes.
- `arreterExecution(scenarioId)` : active=false + endedAt = now. Si en pause, comptabilise dernier segment avant arrêt. Garde execution comme historique consultable.
- `pauseExecution(scenarioId, paused)` : set/clear pausedAt + cumul pausedTotalMs.
- `updateEtape(scenarioId, equipeId, etapeIdx, partial)` : whitelist observations/statut/photoIds/startedAt/completedAt. Validation statut contre TABLEAU_STATUTS.
- `marquerEtapeStatut(scenarioId, equipeId, etapeIdx, statutId)` : raccourci avec timestamps auto (pose completedAt si non-pending + startedAt si manquant).
- `getExecutionDureeMs(scenarioId)` : temps écoulé depuis startedAt, EXCLUANT pausedTotalMs. Si en pause, fige la valeur à l'instant pausedAt (pas de progression visuelle pendant pause).
- `ajouterNoteLibre(scenarioId, opts)` / `updateNoteLibre(scenarioId, noteId, partial)` / `supprimerNoteLibre(scenarioId, noteId)` : CRUD mode secouriste libre.
- `_estExecutionActive(s)` / `_getEtapesEquipe(s, equipeId)` : raccourcis lecture.
- `_buildEtapesPourEquipe(g)` : construit array d'étapes depuis parcours équipe (entrée + intermediaires + sortie) avec statut="pending" partout.

##### 67.7.3 Constante `TABLEAU_STATUTS` (7+1 statuts)

Table extensible avec id (ASCII clé localStorage), emoji, label, color (charte palette OTAN-cohérente), severity 0-3 (tri/escalade), markers `isPending` (statut implicite) et `pulse` (animation Opérateur).

| ID | Emoji | Label | Couleur | Severity |
|---|---|---|---|---|
| `pending` | • | En attente | gris | 0 |
| `ras` | 🟢 | RAS | vert | 0 |
| `suspect` | 🟡 | Suspect | jaune | 1 |
| `bloque` | ⬛ | Bloqué | gris foncé | 1 |
| `indice` | 🔵 | Indice | bleu | 1 |
| `aide` | 🟠 | Aide demandée | orange | 2 |
| `demi-tour` | 🟣 | Demi-tour forcé | violet | 1 |
| `victime` | 🚨 | Victime trouvée | rouge clignotant | 3 |

Helper `_getStatutInfo(statutId)` retourne entry (fallback pending). Ajouter une entry suffit (rendu UI + colors + futur PDF report suivent automatiquement).

##### 67.7.4 Store IDB dédié `myktamap_secours_photos` v1

Nouveau module `js/secoursPhotos.js` (~430 lignes IIFE) → `window.MyKTAMapSecoursPhotos`. Séparé du store POI photos (`myktamap_photos`, cf §42) pour cleanup/compteurs indépendants. Key composite : `scenarioId + equipeId + stepIdx`. **Sentinel `stepIdx = -1`** pour notes libres mode secouriste. 3 indexes : `by_scenario`, `by_scenario_equipe`, `by_scenario_equipe_step`. Max 5 photos par étape. Compression auto canvas JPEG q85 max 1920px.

API : `addPhoto / getPhoto / getBlob / getObjectUrl / getPhotosForEtape|Equipe|Scenario / countPhotosForEtape|Scenario / deletePhoto|Etape|Scenario / clearAll / compressBlob / generateId / isAvailable`. Init eager au boot (non-bloquant, pre-warm IDB).

##### 67.7.5 Bandeau « 🚀 Lancer le plan » + modale sélection rôle

`_renderLancerBandeau(s)` en haut vue Edit, 3 états dynamiques :

| État | Visuel | Boutons |
|---|---|---|
| Disabled (0 équipe) | Gris hint italique | Aucun |
| CTA (équipes définies, pas lancé) | Jaune charte large | « 🚀 Lancer le plan de secours » |
| Active (execution.active=true) | Vert + dot pulsant + timer | « ▶️ Reprendre la vue Live » + « ⏹️ Arrêter » + 🆕 v1.25.0 « 📤 Rapport » |
| 🆕 v1.25.0 Terminé (execution.endedAt set) | Bleu + ts fin + durée | « 📤 Voir le rapport historique » + « 🚀 Relancer » |

`_afficherModaleLancer(scenarioId, onConfirm)` : modale charte Promise-via-callback avec 3 radios cliquables (Opérateur surface / Équipe terrain + dropdown sélection / Secouriste libre). Hint « tu pourras changer de rôle plus tard sans perdre les observations ». Au confirm → `lancerExecution(scenarioId, opts)` + bascule vue Live.

##### 67.7.6 Vue Live Mode ÉQUIPE (`_renderLiveViewEquipe`)

Pour l'équipe sur le terrain qui suit son parcours step-by-step.

- **Header sticky** : swatch couleur OTAN + nom équipe + Étape X/N + timer global ⏱️ + tag pause si applicable. Background OPAQUE (cf §67.10 v1.25.1 fix).
- **Stepper visuel cliquable** : 1 bouton par étape (40×44 portrait / 34×38 landscape) avec emoji statut + numéro étape. Classes : `kta-secours-live-step-current` (jaune box-shadow), `-done` (vert opacity 0.85), `-pending` (opacity 0.65).
- **Bloc étape courante** : titre type (🚪 ENTRÉE / 📍 ÉTAPE N / 🚪 SORTIE) + label POI + statut courant (bordure couleur) + textarea observations 2000 chars + **7 boutons statuts rapides** (sauf `pending`, filtré) + bouton « 📸 Photo (X/5) » + bouton « 🎯 Recentrer carte » + mini-grille photos miniatures cliquables (viewer plein écran réutilisé via `window.MyKTAMapPhotoViewer.open`).
- **Navigation prev/next** : au passage suivant sans statut explicite → auto-marqué RAS par défaut.
- **Footer** : Pause / 🆕 v1.25.0 « 📤 Rapport » / 🆕 v1.24.1 « 👤 Retour Opérateur » (conditionnel _previousRole) / « ⏸️ Voir l'édition » / « ⏹️ Terminer le plan ».

State module-level `_liveEquipeFocusIdx` pour étape focalisée. Init via `_liveEquipeInitFocus(etapes)` : 1ère pending sinon dernière.

##### 67.7.7 Vue Live Mode OPÉRATEUR SURFACE (`_renderLiveViewOperateur`)

Vue d'ensemble pour le PC chef coordinateur.

- **Header sticky** : titre rôle + nom scénario + compteur équipes + timer global. **z-index 100 + isolation isolate** (cf §67.10 v1.25.1 fix).
- **Grille responsive cards par équipe** (auto-fill min 260px) via `_renderOperateurCard(s, g)` :
  - Swatch couleur + nom + badge « ✓ TERMINÉE » si applicable
  - Barre de progression % (0-100) coloriée à la couleur équipe
  - Statut le + sévère parmi toutes les étapes (calculé via `severity`)
  - Dernière obs snippet (max 80 char + « … »)
  - Dernier timestamp modif (HH:MM)
  - 2 boutons « 👁️ Détails » / « 🚨 Prendre la main »
- **Cards spéciales** :
  - 🚨 Victime trouvée → ROUGE clignotant `kta-secours-pulse-red` animation 1.2s
  - 🟠 Aide demandée → orange + lueur box-shadow
  - ✓ Terminée → opacity 0.75
- **Modale détails read-only** (`_afficherModaleDetailsEquipeLive`) : liste chronologique étapes avec ts + statut + obs.
- **Bouton « 🗺️ Voir carte globale »** : masque modale + render overlay (cf §65.7).
- **Footer** : Pause / 🆕 v1.25.0 « 📤 Rapport global » / Voir édition / Terminer.

##### 67.7.8 Vue Live Mode SECOURISTE LIBRE (`_renderLiveViewSecouriste`)

Mode simple pour renfort/reconnaissance sans équipe pré-assignée.

- **Header sticky** vert + timer + compteur notes
- **Bloc « 📝 Ajouter une note »** : textarea + 7 boutons rapides (clic = note ajoutée avec statut + reset textarea)
- **Liste chronologique DESC** des notes avec ts (HH:MM:SS) + statut emoji + texte + ✕ supprimer
- Persistance dans `s.execution.etapes._notes_libres`
- **Footer** : Pause / 🆕 v1.25.0 « 📤 Rapport » / Voir édition / Terminer la mission

##### 67.7.9 Timer global + pause juste

`getExecutionDureeMs(scenarioId)` calcul juste excluant `pausedTotalMs`. Si en pause, fige la valeur à l'instant `pausedAt` (pas de progression visuelle pendant pause). Format `Xh YYmin` / `YYmin SSs` / `Ss`.

**Re-render via `data-live-timer="duree"`** toutes les 1s (interval `_liveTimerId` démarré dans `_switchView("live")` + stoppé sinon). Pattern précis : SEULEMENT le texte du timer est rafraîchi via `document.querySelectorAll('[data-live-timer="duree"]')`, PAS de re-render complet de la vue. Évite :
- Flash visuel
- Perte de focus dans la textarea observations en cours de saisie
- Reset de la position scroll

#### 67.8 v1.24.1 — Bouton « 👤 Retour Opérateur » après « Prendre la main »

Bug terrain : « Prendre la main » bascule role de `operateur` à `equipe` SANS mémoriser le rôle précédent → user piégé en mode Équipe sans bouton retour.

**Fix 3 modifs propres** :
1. Au clic « Prendre la main » : stockage `s.execution._previousRole` + `_previousEquipeId` avant la mutation. Persisté localStorage → survit reload + plan switch + fermeture/réouverture modale.
2. Renderer vue Live Mode Équipe : bouton conditionnel « 👤 Retour Opérateur » (ou « 🚑 Retour Secouriste ») dans footer SI `_previousRole` set.
3. Handler `live-retour-previous-role` : restore role + currentEquipeId + `delete s.execution._previousRole` + `delete s.execution._previousEquipeId` (cleanup anti-pollution payload export) + toast + re-render live.

**Pattern préservation d'état** : les flags `_previousRole` / `_previousEquipeId` survivent à reload, plan switch, fermeture/réouverture modale, bascule edit↔live. L'user peut prendre la main sur Alpha, fermer son tel, revenir 30min après, et trouver le bouton retour intact.

#### 67.9 v1.24.2 — 3 fixes CSS Phase 3

1. **Textarea Mode Équipe + Secouriste déborde** : `.kta-secours-live-etape-textarea` avait `width: 100%` SANS `box-sizing: border-box`. Padding 8px 10px (20px H) + bordure 1px (2px H) ajoutaient +22px d'overflow. **Fix** : `box-sizing: border-box` + `max-width: 100%`.
2. **Scroll passe derrière header sticky Opérateur** : `background: linear-gradient(rgba(...,0.85), rgba(...,0.95))` semi-transparent laissait voir les cards en filigrane. **Fix v1.24.2** : background opaque + box-shadow + z-index 10. Mais insuffisant → fix renforcé en v1.25.1 (cf §67.10).

#### 67.10 v1.25.1 — Fix renforcé header sticky + toast controllerchange gated + bandeau CTA spacing

**Fix 1 — Header sticky vue Live Opérateur INSUFFISANT en v1.24.2** : stacking context conflictuel laissait passer scroll en filigrane derrière header. **Renforcement triple** :

```css
.kta-secours-live-header {
  background: #1a1f2e;           /* SOLID, pas gradient */
  z-index: 100;                   /* 10 → 100 */
  isolation: isolate;             /* nouveau stacking context FORCÉ */
  border-bottom-width: 2px;       /* démarcation visuelle */
  box-shadow: 0 6px 14px rgba(0, 0, 0, 0.55);
}
```

**Pattern critique** : pour un header `position: sticky` qui DOIT masquer le scroll qui passe en dessous :
- Background **SOLID** (pas gradient, pas rgba transparent — évite ambiguïté opacité Chromium mobile)
- `z-index: 100` minimum (au-dessus de tout)
- `isolation: isolate` force un nouveau stacking context (le plus puissant — empêche les enfants scroll de remonter visuellement)
- Box-shadow prononcé pour démarquer

**Fix 2 — Toast `controllerchange` spammait en dev** : hook `navigator.serviceWorker.addEventListener("controllerchange")` v1.20.0 affichait toast « 🔄 Mise à jour mineure appliquée » à CHAQUE bump cache → spam sur cycles dev fréquents (10+ updates/24h). KARMA « popup style log de dev ».

**Fix** : toast conditionnel à `APP_CONFIG.debugMode === true` + prefix `[DEBUG]` dans message. En prod : aucun toast visible. `console.log("[PWA] 🔄 Nouveau SW...")` reste TOUJOURS actif pour traçabilité 🐛 Logs détaillés. Garde-fou `_swIsInitialControl` du 1er install préservé.

**Fix 3 — Bandeau CTA touche boutons header** : `.kta-secours-lancer-bandeau` n'avait que `margin-bottom: 14px`. **Fix** : `margin-top: 14px` pour aérer.

#### 67.11 v1.25.0 — Rapport au fil des étapes pour les 3 rôles

Demande KARMA : « on doit pouvoir générer un rapport au fil des étapes pour chaque type Operator, Equipier, Secour ».

##### 67.11.1 5 nouveaux helpers API publique `window.SecoursMode`

```js
async genererRapportData(scenarioId, scope, opts)   // → objet structuré
genererRapportTexte(reportData)                      // sync → texte markdown-like
genererRapportPDF(reportData)                        // sync → PDF jsPDF
exporterRapportJSON(reportData)                      // sync → téléchargement JSON
async copierRapportTexte(reportData)                 // → presse-papier
```

##### 67.11.2 Format `.mkmsec.report.json` (REPORT_FORMAT_VERSION = 1)

```js
{
  type:         "myktamap-secours-report",
  version:      1,
  exportedAt:   ISO,
  appVersion:   "v1.25.0",
  scope:        "operateur" | "equipe" | "secouriste",
  plan:         { id, name, version, ... },
  scenario:     { id, nom, context, ... },
  execution:    { active, startedAt, endedAt, role, dureeMs, ... },
  equipesData: [
    {
      equipe:  { id, nom, couleurIdx, membres, level, ... },
      etapes:  [ { type, idx, label, observations, statut, photoIds,
                   startedAt, completedAt }, ... ],
      photos:  [ { id, mime, sizeBytes, stepIdx, dataUrl? } ]
    }
  ],
  notesLibres: [ { id, ts, statut, texte, photoIds, photosResolved? } ]
}
```

Versionné pour re-import futur v1.26.0 (consolidation cross-device).

##### 67.11.3 3 scopes selon rôle execution

| Scope | Inclut | Cas d'usage |
|---|---|---|
| `operateur` | TOUTES équipes + étapes + photos | Rapport global PC chef relève / fin mission |
| `equipe` | Une seule équipe (currentEquipeId) | Passation au PC surface au retour terrain |
| `secouriste` | `_notes_libres` chronologiques | Passation secouriste libre au PC |

##### 67.11.4 Modale unifiée `_afficherModaleRapport(scenarioId, scope)`

- Aperçu compact (titre rôle + nb équipes/étapes + % progression + durée)
- Checkbox « 📸 Inclure les photos » COCHÉE par défaut
- Hint dynamique compteur photos (« Inclut N photos · impact taille fichier »)
- 3 boutons format colorés (PDF primary jaune / JSON+Texte secondary) avec icône 22px + label gras + sous-titre italique
- Toast feedback à chaque action
- Backdrop click + Échap = annuler

Bouton « 📤 Rapport » dans les 3 footers Live (data-scope adapté au rôle) + dans bandeau vue Edit (action `edit-rapport`).

##### 67.11.5 Helper PDF `genererRapportPDF(reportData)`

Layout : Page 1 briefing global. Pour chaque équipe : 1 page texte étapes + 1 page photos grille 2 cols ratio 4:3 (si photos). Mode secouriste : 1 page liste chronologique notes + 1 page photos. Footer crédit MyKTAMap + timestamp.

⚠️ **Pas d'emoji dans `pdf.text()`** (jsPDF Helvetica latin1 → mojibake). Emojis OK pour canvas/Blob/HTML.

Helpers : `_drawRapportPDFHeader / _drawRapportPDFFooter / _drawRapportPDFEquipeTextePage / _drawRapportPDFEquipePhotosPage / _drawRapportPDFNotesLibresPage`. Format `_formatRoleLabelAscii` pour labels jsPDF-safe.

##### 67.11.6 Bandeau « 📦 PLAN TERMINÉ » dans vue Edit

Si `s.execution` existe ET `!active && endedAt` set → bandeau bleu archive avec :
- Durée totale + timestamp fin + rôle
- Bouton « 📤 Voir le rapport historique » (= modale rapport scope du rôle final)
- Bouton « 🚀 Relancer » (= modale sélection rôle, écrase l'execution actuelle)

Permet de re-générer rapport à tout moment après l'arrêt, tant que le scénario n'est pas supprimé.

##### 67.11.7 Confidentialité

Aucune nouvelle surface réseau. Génération 100% client-side (jsPDF déjà chargé, Blob URLs locales, FileReader pour base64, `navigator.clipboard.writeText` avec fallback `execCommand("copy")`). Photos lues depuis store IDB local existant `myktamap_secours_photos`. Aucun fetch ajouté.

#### 67.12 Pour ajouter une nouvelle release Mode Secours (futur)

1. Bumper les 3 sources de vérité (`version.json` + `js/copyright.js > __MKM__.build` + `sw.js > CACHE_NAME`)
2. Si nouveau format `.mkmsec.*.json` : bumper la `*_FORMAT_VERSION` correspondante + valider dans `_parsePayload*`
3. Si nouveau statut d'étape : ajouter entry dans `TABLEAU_STATUTS` (id + emoji + label + color + severity + flags optionnels `isPending`/`pulse`)
4. Si nouveau champ dans `scenario.execution` : whitelist dans `updateEtape` + filtre défensif dans `_appliquerPayloadImport` + propagation dans `genererRapportData`
5. Si nouvelle vue Live : créer `_renderLiveViewXxx(s)` + dispatcher dans `_renderLiveView()` + handlers `_bindLiveXxxHandlers(corps, s)` dans `_bindViewHandlers("live")`
6. Si nouvelle UI sticky qui DOIT masquer scroll : pattern §67.10 (background solid + z-index 100+ + `isolation: isolate` + box-shadow prononcé)
7. Mettre à jour cette doc §67 + README.md journal + AI_CONTEXT.md + interface.js `afficherAide`

---

---

### 69. Mode Secours Phase 4 — ⛔ ROLLBACK QR + Mini-carte PDF conservée

**Statut depuis hotfix17 (2026-05-27)** : la voie QR (générer/scanner des codes QR pour partager briefings + observations entre Op et équipiers) est **ROLLBACK** suite à un bug structurel de densité QR v35+ rendant les codes générés illisibles par tout scanner standard.

**Conservé** depuis Phase 4 :
- ✅ **C5 — Mini-carte PDF page A4 paysage par équipe** (indépendant, super utile)
- ✅ **hotfix11 #1 — Flag `_liveEquipeFreshSession`** (fix bug "étape précédente" en vue Live Équipe)

**Supprimé** :
- ❌ `lib/qrcode-generator.min.js` (20 KB)
- ❌ `lib/jsqr.min.js` (130 KB)
- ❌ `js/secoursQrShare.js` (~1700 lignes)
- ❌ ~380 lignes CSS `.kta-secours-qr-*`
- ❌ 4 boutons UI dans secoursMode.js (header card équipe / vue list / modale Rapport / footer Live)
- ❌ 4 handlers correspondants

**Voie de partage retenue** : `.mkmsec.json` classique (briefing complet, depuis v1.23.4-5) + le nouveau `.mkmsec.observations.json` (à venir hotfix18 — observations terrain Équipe→Op via fichier).

#### 69.1 Root cause du rollback

QR v35 = 157 cells × 8 margin = 165 totalCells. Mon code `_qrToCanvas` faisait :
```
cellPx = floor(600 / 165) = 3 px/cell
realSize = 3 × 165 = 495 px
```

**jsQR demande min 4 px/cell** pour décoder, idéal 8+ px/cell. À 3 px/cell, scan IMPOSSIBLE par tout scanner (app native iOS/Android + MyKTAMap).

**Hotfix16 tentait de fixer** via `MIN_CELL_PX = 8` → mais ça générait des PNG 1320×1320 px très lourds et toujours fragiles via compression WhatsApp. La fiabilité scan post-partage messagerie restait incertaine.

**Décision KARMA** : revenir à la voie `.mkmsec.json` qui est :
- 100% fiable (texte JSON, aucune contrainte de pixels)
- Partage via WhatsApp/mail/AirDrop comme n'importe quel fichier
- Format extensible (déjà préservé `customLegend`, peut accueillir `observations`, etc.)
- Debug facile (lisible humain)

#### 69.2 Mini-carte PDF page A4 paysage (C5 — CONSERVÉ)

> 🩸 **29/09/2026 (audit Secours, trouvé en test)** — cette mini-carte **ne s'était jamais dessinée** : `_drawRapportPDFEquipeMiniaturePage` recevait `ed.equipe`, la copie allégée du rapport (sans entrée, étapes, zone ni itinéraire) → `_calculerBoundsEquipe` = null → page sautée sans message. Elle reprend maintenant l'équipe complète dans le scénario local (le PDF se génère sur l'appareil qui le détient), avec la copie en repli. Mesuré en navigateur : 0 → 1 canvas plan généré (16,0 Mpx). Relecture (R11, R12) : le fond est rendu **une fois** pour tout le rapport (`cacheFond`), et l'équipe est projetée sur la source **rognée** au bord du plan (avant : jusqu'à 124 px de décalage mesuré pour une zone collée au coin).

`genererRapportPDF` reste async pour permettre await sur la mini-carte. Pour chaque équipe (scope=operateur ou equipe), le PDF intercale 3 pages :
1. Page texte étapes (synchrone)
2. **Page A4 PAYSAGE dédiée mini-carte** (async, optionnelle)
3. Page photos grille (si photos)

Pipeline mini-carte :
1. `_calculerBoundsEquipe(eq)` → rectangle englobant waypoints+zone+iti (padding 15% + plancher 60px)
2. `MyKTAMapExporterGenererCanvas({scale: 0.5, bg: "image", ann: tout off})` → canvas plan complet
3. Crop drawImage sur canvas final 1800×1273 (ratio A4 paysage, letterbox blanc)
4. `_drawEquipeOverlayOnCanvas` — zone teintée 22% + iti dashed + entrée verte "E" + sortie rouge "S" (orange si boucle) + intermédiaires numérotés
5. `pdf.addPage("a4", "landscape")` + addImage JPEG q82 + header (pastille couleur + titre ASCII) + footer

**Skip silencieux** (PDF reste valide) si équipe vide, exporter indispo, canvas throw, bounds hors plan.

⚠️ **ASCII strict** dans `pdf.text()` — NFD normalize + strip diacritics + filtre Latin-1, cf §44.6 jsPDF Helvetica latin1 mojibake.

#### 69.3 Cycle hotfixes Phase 4 (sur v1.25.3)

| Hotfix | CACHE_NAME | Sujet |
|---|---|---|
| 8-13 | -hotfix8 à -hotfix13 | C1+C2+C3+hotfix9+hotfix10+hotfix11+C4+C5 (voie QR) |
| 14 | -hotfix14 | Fix scan : attemptBoth + MAX_SIDE 2500 (insuffisant) |
| 15 | -hotfix15 | Multi-stratégie + diagnostic détaillé (insuffisant) |
| 16 | -hotfix16 | MIN_CELL_PX 8 côté génération (insuffisant) |
| **17** | **-hotfix17** | **⛔ ROLLBACK QR complet — conserve C5 mini-carte PDF + hotfix11 étape précédente** |
| **18** | **-hotfix18** | **🌐 Recherche GPS lat,lng (Ctrl+K) + format Maps paste-split helper** (cf §70) |
| **19** | **-hotfix19** | **🆘 Kill switch SW via `?killsw=1` (IIFE inline dans index.html)** — escape route iOS PWA |
| **20** | **-hotfix20** | **🆘 Page standalone `killsw.html` à la racine** (HTML/CSS/JS 100% inline, zéro dep) + bypass fetch SW |
| **21** | **-hotfix21** | **🌐 Input GPS combiné** unique (3 modales) + **🔄 Soft update optimisé** (postMessage SW + fire-and-forget reg.update) (cf §70 hotfix21 + §71) |

**Pause indéfinie — sujet "Import/Export Live"** (alternative au QR rollbacked) :
| ~~19~~ ~~hotfixN~~ | Format `.mkmsec.observations.json` + bouton "📥 Importer" en haut vue Live + bouton "💾 Exporter mes obs" footer — **non démarré**, KARMA a priorisé d'autres sujets (GPS combo, kill switch, soft update) |

#### 69.4 À NE PAS faire

- ❌ Réactiver la voie QR sans avoir résolu structurellement la densité v35+ ET la fiabilité post-compression WhatsApp
- ❌ Importer la mini-carte PDF C5 dans un autre module — elle dépend de `MyKTAMapExporterGenererCanvas` côté exporter.js + de la PALETTE OTAN module-level secoursMode.js
- ❌ Toucher au flag `_liveEquipeFreshSession` (hotfix11) — c'est le fix critique du bug "étape précédente" et il doit subsister même après rollback Phase 4

#### 69.5 Format `.mkmsec.observations.json` (à venir hotfix19, après pause feature GPS hotfix18)

Format prévu (équivalent fichier de l'ancien payload QR observations) :
```js
{
  type:       "myktamap-secours-observations",
  version:    1,
  exportedAt: ISO,
  appVersion: __MKM__.build,
  plan:       { id, name },
  scenario:   { id, nom },                     // matching strict côté Op
  equipe:     { id, nom, couleurIdx, level },  // mode équipe (ou absent si secouriste)
  role:       "equipe"|"secouriste",
  observations: [
    { idx, statut, observations, startedAt, completedAt }
  ],
  notesLibres: [ { id, ts, statut, texte } ]   // si role=secouriste
}
```

UI prévue (cf KARMA 3:b 4:c) :
- **Mini-toolbar dédiée entre header et stepper/cards** des 3 vues Live (Équipe / Op / Secouriste) avec bouton "📥 Importer un fichier" → file picker accepte `.mkmsec.json` ET `.mkmsec.observations.json` (détection auto via `type` JSON)
- **Bouton "💾 Exporter mes obs"** : à 2 endroits (a) footer Live Équipe + Secouriste, (b) modale Rapport (5e format à côté de PDF/JSON/Texte)

Pas de photos (cf KARMA 9:a) — les photos restent locales sur device Équipier, partagées via rapport PDF (page photos grille).

---

### 69bis. Mode Secours Phase 4 (ANCIENNE doc QR — préservée pour référence historique)

Ce qui suit est l'ancienne §69 décrivant la voie QR Share, avant rollback hotfix17. À titre historique uniquement — **NE PAS CONSULTER pour le code actuel**.

Phase 4 livrée en hotfix continu sur v1.25.3 (sans bump version visible — KARMA déploie en dev tant que pas de push main). Ajoute la coordination terrain via QR code (offline cataphile, anti-réseau souterrain) + carte miniature par équipe dans le PDF rapport.

#### 69.1 Architecture & libs

3 nouveaux assets dans `ASSETS_TO_CACHE` :

| Fichier | Taille | Rôle |
|---|---|---|
| `lib/qrcode-generator.min.js` | 20 KB MIT | Génération QR (kazuhikoarase) |
| `lib/jsqr.min.js` | 130 KB Apache 2.0 | Décode QR (cozmo/jsQR, jsdelivr min auto) |
| `js/secoursQrShare.js` | ~1700 lignes IIFE | Module métier complet |

API publique `window.MyKTAMapSecoursQrShare = { ouvrirPartageQrBriefing, ouvrirImportQrBriefing, ouvrirPartageQrObservations, ouvrirImportQrObservations, QR_FORMAT_VERSION, PAYLOAD_TYPE_BRIEFING, PAYLOAD_TYPE_OBSERVATIONS, ... helpers internes _ }`.

#### 69.2 Format payloads QR (clés courtes pour rester < 2.9 KB)

`QR_FORMAT_VERSION = 1`. Encodage mode "Byte" (UTF-8 direct, pas de base64 — économie ~33%).

**Briefing Op→Équipier** (`PAYLOAD_TYPE_BRIEFING = "brf"`) :
```js
{
  t:  "brf", v: 1, ts: Date.now(),
  p:  { i, n, w, h, m?, l? },                    // plan : id/nom/imgW/imgH/multiLevel/availableLevels
  s:  { i, n, ia?, lkx?, lky?, lkl?, rm?, no? }, // scénario : id/nom + context essentiel
  e:  { i, n, c, m?, l?, en?, so?, in?,          // équipe : id/nom/couleurIdx/membres/level/entrée/sortie/intermediaires
        zt?, zp?, zr?,                            // zoneType/zonePolygon/zoneRoadIds
        dm?, du?, st? }                           // distanceM/dureeEstimeeMin/statut
}
```

⚠️ **`itineraireSuggere` VOLONTAIREMENT NON EMBARQUÉ** (hotfix10) : trop gros (50-200 points = 1.5-6 KB) et entièrement dérivable côté équipier via Pathfinder. À l'import, `_importerBriefingDansPlan` déclenche `SecoursMode.recalculerItineraires(scenarioId)` async fire-and-forget 100ms après création → l'iti apparaît dans la seconde.

**Observations Équipier→Op** (`PAYLOAD_TYPE_OBSERVATIONS = "obs"`) :
```js
{
  t:  "obs", v: 1, ts: ...,
  si: scenarioId,                   // matching strict côté Op
  ei: equipeId,                     // mode équipe
  en: equipeNom,                    // fallback humain si scenarioId ≠
  r:  "equipe"|"secouriste",
  o:  [ { i, s, o, st, ct }, ... ], // observations par étape, texte ≤200ch
  nl: [ { i, ts, s, t }, ... ]      // notes libres (mode secouriste, texte ≤150ch)
}
```

⚠️ **PHOTOS NON EMBARQUÉES dans le QR** (cf KARMA 9:a) — les photos restent côté Équipier dans IDB `myktamap_secours_photos` (§67.7.4). Pour les transférer à l'Op, l'équipier passe par export rapport PDF (page photos grille) ou JSON (base64).

#### 69.3 Cap payload + retry ECC L (hotfix10)

`_genererQrFromPayload(payload)` :
- Tentative ECC niveau **M** (15% correction, fiable au scan)
- Si throw (payload > 2.9 KB) → retry ECC **L** (7%, +30% capacité)
- Si retry L échoue → throw user-friendly avec conseils actionnables

Tronquages cumulatifs au `_serializerBriefing` :
- Labels waypoints : 20 chars (hotfix10, était 30)
- Notes contexte : 200 chars (hotfix10, était 500)
- Observations texte : 200 chars
- Notes libres texte : 150 chars
- Cap 30 notes libres / 20 membres

Estimation typique payload briefing : ~600-900 bytes → QR v15-v20 (scan fluide).

#### 69.4 Scan QR — pattern `<input capture>` ZÉRO modif CSP

**Choix critique** validé KARMA suite audit CSP (cf message « la camera a été autorisé, vue que je peux prendre des photo non ? »).

Pattern : `<input type="file" accept="image/*" capture="environment">` (= attribut HTML standard qui handover à l'app caméra native OS, identique au système photos POI §42).

```html
📷 Photographier le QR  → <input capture="environment">  // app caméra OS native
🖼️ Charger une image    → <input>                        // file picker classique
```

Les 2 inputs partagent le MÊME handler qui :
1. `_loadImageFromFile(file)` via URL.createObjectURL + Image.onload
2. Canvas draw avec downscale MAX_SIDE=**2500** (hotfix14, était 2000)
3. `ctx.getImageData()` + `jsQR(data, w, h, {inversionAttempts: "attemptBoth"})` (hotfix14 — était "dontInvert" qui ratait les QR avec inversion couleur post-compression JPEG/screenshot)
4. `JSON.parse(qrResult.data)` + validation type + version
5. **Routing auto par `payload.t`** :
   - `"brf"` → `_deserializerBriefing` → modale preview → `_importerBriefingDansPlan`
   - `"obs"` → `_deserializerObservations` → `_mergerObservationsDansScenario` direct

⚠️ **NE PAS basculer vers `navigator.mediaDevices.getUserMedia` (= scan caméra live continu)** — nécessiterait modification CSP `Permissions-Policy: camera=(self)` (actuellement `camera=()`). Le pattern `<input capture>` couvre 100% des besoins MVP avec zéro modif sécu.

#### 69.5 Merger observations — matching cross-device

`_mergerObservationsDansScenario(decoded)` côté Op :
1. **Match strict par scenarioId** (= équipier a reçu briefing via QR, scenarioId préservé dans le clone)
2. **Fallback equipeNom** : cherche scénario actif chez Op contenant une équipe avec le même nom (cas équipier ayant reçu briefing via `.mkmsec.json` avec id régénéré)
3. **Échec** → erreur user-friendly listant les 2 critères

Pour mode équipe : itère `decoded.observations` + `SM.updateEtape(target.id, equipe.id, idx, partial)` whitelist statut/observations/startedAt/completedAt.

Pour mode secouriste : remplace `s.execution.etapes._notes_libres` en bloc.

#### 69.6 UI — points d'entrée

| Site | Action | Acteur |
|---|---|---|
| Vue Edit > card équipe header > bouton **📲** (entre 🏗️ M-LVL et 🗑️) | Génération QR briefing Op→Équipe | Opérateur |
| Vue list Mode Secours > bouton **📲 Scanner un QR** | Scan QR (auto-detect brf vs obs) | Équipier OU Op |
| Modale Rapport > 4e bouton **📲 QR briefing** (scope=equipe uniquement) | Génération QR briefing depuis Live | Équipier sur site |
| Vue Live Équipe > footer > bouton **📲 Renvoyer obs** | Génération QR observations Équipe→Op | Équipier |

#### 69.7 Mini-carte PDF page A4 paysage (C5)

`genererRapportPDF` désormais **async** pour permettre await sur la mini-carte.

Pour chaque équipe (scope=operateur ou equipe), le PDF intercale 3 pages :
1. Page texte étapes (synchrone)
2. **🆕 Page A4 PAYSAGE dédiée mini-carte** (async, optionnelle)
3. Page photos grille (si photos)

Pipeline mini-carte :
1. `_calculerBoundsEquipe(eq)` → rectangle englobant waypoints+zone+iti (padding 15% + plancher 60px)
2. `MyKTAMapExporterGenererCanvas({scale: 0.5, bg: "image", ann: tout off})` → canvas plan complet
3. Crop drawImage sur canvas final 1800×1273 (ratio A4 paysage, letterbox blanc)
4. `_drawEquipeOverlayOnCanvas` — zone teintée 22% + iti dashed + entrée verte "E" + sortie rouge "S" (orange si boucle) + intermédiaires numérotés
5. `pdf.addPage("a4", "landscape")` + addImage JPEG q82 + header (pastille couleur + titre ASCII) + footer (distance/durée/zone/waypoints)

**Skip silencieux** (PDF reste valide) si : équipe vide, exporter indispo, canvas throw, bounds hors plan.

⚠️ **ASCII strict** dans `pdf.text()` — NFD normalize + strip diacritics + filtre Latin-1, cf §44.6 jsPDF Helvetica latin1 mojibake.

#### 69.8 Cycle de vie hotfixes Phase 4 (sur v1.25.3)

| Hotfix | CACHE_NAME | Sujet principal |
|---|---|---|
| 8 | -hotfix8 | C1 (libs + skeleton) + C2 (génération QR Op→Équipier) + C3 (scan QR pattern input capture) |
| 9 | -hotfix9 | Fix titre noir dark theme sur 3 modales QR |
| 10 | -hotfix10 | Payload trop volumineux : drop iti + ECC fallback "L" + truncate labels/notes |
| 11 | -hotfix11 | Bug "étape précédente" cassé (flag `_liveEquipeFreshSession`) + QR briefing dans modale Rapport |
| 12 | -hotfix12 | C4 boucle complète Équipe→Op + scan unifié routing brf/obs |
| 13 | -hotfix13 | C5 mini-carte PDF page A4 paysage par équipe |
| 14 | -hotfix14 | Fix scan QR : inversionAttempts "attemptBoth" + MAX_SIDE 2500 |

**Pas de bump version.json / copyright.js** pendant Phase 4 — KARMA déploie en dev tant que pas de push main. La consolidation v1.26.0 finale sera faite lors du futur merge main.

#### 69.9 À NE PAS faire (Phase 4)

- ❌ Réintroduire `inversionAttempts: "dontInvert"` dans `_decodeQrFromFile` — rate les QR avec inversion couleur après compression JPEG/screenshot
- ❌ Embarquer `itineraireSuggere` dans le payload briefing — explose la taille (gain -1.5 à -6 KB en le retirant, recalculable via Pathfinder)
- ❌ Embarquer des photos (base64 ou autre) dans le QR observations — KARMA 9:a explicite
- ❌ Réintroduire `navigator.mediaDevices.getUserMedia` pour scan live — nécessiterait `Permissions-Policy: camera=(self)` (actuellement `camera=()` interdit)
- ❌ Coder le QR generation à la main / Reed-Solomon — utiliser qrcode-generator (lib MIT cachée SW)
- ❌ Bumper version.json sans consentement explicite « oui je le veux » de KARMA
- ❌ Émojis dans `pdf.text()` mini-carte — Helvetica latin1 → mojibake. Toujours ASCII via NFD normalize
- ❌ Faire `pdf.save()` sans await sur les mini-cartes — la boucle for+await garantit l'ordre d'insertion
- ❌ Cacher la modale parent sans MutationObserver pour la restaurer (pattern §66.13)
- ❌ Smart-skip dans `_liveEquipeInitFocus` sans le flag `_liveEquipeFreshSession` (re-bug hotfix11)

#### 69.10 Pour étendre (futur)

**Phase 5 candidates** :
- Scan caméra live continu (= migration vers getUserMedia + bump CSP camera=(self)) — utile pour multi-QR rapide
- Multi-QR séquentiel (= 1 QR par section, l'app reconstruit) — utile si on remet `itineraireSuggere` dans le payload
- Chiffrement end-to-end du payload (mdp partagé hors-bande) — cohérent avec UnlockGate §36
- Compression gzip via pako (~50 KB lib) avant base64 — gain ~60-70% sur JSON

**Pour ajouter un nouveau type de payload** (genre `"sit"` = situation report) :
1. Ajouter `PAYLOAD_TYPE_SITUATION = "sit"` aux constantes
2. Implémenter `_serializerSituation` + `_deserializerSituation`
3. Implémenter `_mergerSituationDansScenario` ou équivalent
4. Ajouter le routing dans `_decodeQrFromFile` après `t === "obs"` (avant default `brf`)
5. UI : implémenter `ouvrirPartageQrSituation` + modale
6. Exposer dans `window.MyKTAMapSecoursQrShare`

---

---

### 73. Banner cohérence échelle px/m ↔ géoréférencement GPS (v1.26.1 — 2026-05-27)

Si un plan a **À LA FOIS** un calibrage GPS 2 points (`KmzExport.getCalibration(planId)` non-null) **ET** une échelle px/m saisie (`APP_CONFIG.scale > 0`), l'app détecte automatiquement les incohérences entre les deux et **affiche un banner diagnostic** dans les 2 modales pertinentes. **AUCUNE correction automatique** n'est appliquée — l'app indique juste qu'une des deux valeurs est probablement fausse.

KARMA quote :
> « si plan georef on peut, controler la logique avec l'echelle rentrer dans l'application. et rajouter un petit message... aucune modification applicable on dit juste que il y a soit le georef de faux soit le calibrage en px »

#### 73.1 Architecture du calcul

```
scaleUser  = APP_CONFIG.scale                                          (px/m, saisi user)
scaleGps   = 1 / KmzExport.buildTransform(pA, pB, gpsA, gpsB).metresParPixel  (px/m, déduit du géoréf)
deltaPct   = |scaleGps - scaleUser| / scaleUser × 100

level = "ok"       si deltaPct < 3
     | "warn"      si 3 ≤ deltaPct < 6
     | "alert"     si 6 ≤ deltaPct < 10
     | "critical"  si deltaPct ≥ 10
```

**Seuils resserrés v1.26.2-hotfix1** (KARMA : « on n'est pas géologues »). Pour de la nav cataphile, 10% = 100 m d'erreur sur 1 km = déjà énorme → critique. Le silence < 3% = tolérance normale du calibrage au pas humain (foulée variable). Repères : 3% = 30 m/km, 6% = 60 m/km, 10% = 100 m/km.

`KmzExport.buildTransform` (`js/kmzExport.js:62-106`) utilise déjà la projection equirectangulaire locale (`dxGps = dlngDeg * 111320 * cos(latMoy)`, `dyGps = dlatDeg * 110540`) → math pré-existante, aucune formule haversine à ré-implémenter.

#### 73.2 API publique (js/utils.js)

```js
window.calculerCoherenceEchelleGeoref(planId)
  → { hasCalibration: false }                                            (rien à comparer)
  → { hasCalibration: true, scaleUser, scaleGps, deltaPercent, level }   (cas normal)
  → { hasCalibration: false, error }                                     (erreur build transform)

window.renderBannerCoherenceEchelle(planId, opts)
  → string (HTML inline) ou ""
  // opts.context : "settings" | "export" (adapte le texte d'intro)
  // Retourne "" si hasCalibration=false OU level="ok" (silence si cohérent)

window.attacherBoutonCopierEchelleGps(container)
  → void
  // Bind les listeners click sur les boutons [data-action="copy-scale-gps"]
  // Fallback navigator.clipboard.writeText → execCommand("copy") si HTTP non-secure
  // Idempotent (dataset.scaleGpsBound)
```

#### 73.3 Emplacements UI

| Endroit | Fichier:ligne | Insertion |
|---|---|---|
| Modale ⚙️ Réglages | `interface.js:2908` (juste après ouverture du `<div class="kta-readme-modal-corps kta-cfg-corps">`) | Template literal `${renderBannerCoherenceEchelle(...)}` + appel `attacherBoutonCopierEchelleGps(modal)` après `documentElement.appendChild` |
| Modale 💾 → 📡 Export externe KMZ/GPX | `sessionExporter.js:2414` (début de `_renderExtern`, après `.kta-ses-intro`) | Concat string `+ window.renderBannerCoherenceEchelle(...)` + appel `attacherBoutonCopierEchelleGps(modal)` dans `_bindKmzHandlers` |

#### 73.4 Politique d'affichage

- **< 3%** : **silence** (rien affiché). Choix UX KARMA : pas de visual pollution quand tout va bien.
- **Non dismissable** : pas de croix pour masquer. C'est de l'info diagnostic permanente. Si on permet de cacher, l'user oublie le problème.
- **Pas d'animation pulse** sur le niveau critical : reste lisible en réunion / contexte cataphile silencieux.
- **Fond critical = rouge clair translucide** (v1.26.2-hotfix2) : `rgba(255, 60, 60, 0.16)` (mode sombre) / `rgba(220, 30, 30, 0.13)` (thème clair) + bordure gauche rouge vive 6px + ombre inset rouge. KARMA a refusé le noir pur (#0d0d10, jurait) PUIS le bordeaux-noir (#24090f, encore trop sombre/illisible en thème clair). Le rouge clair translucide garde les textes de base lisibles (clair en thème sombre, sombre en thème clair) SANS override forcé. Distinction avec "alert" = saturation + bordure gauche épaisse + ombre rouge.
- **Bouton « 📋 Copier la valeur GPS »** : facilite l'alignement quand l'user fait confiance au géoréf. L'application reste manuelle (pas d'auto-mutation `APP_CONFIG.scale`).

#### 73.5 À NE PAS faire

- ❌ Auto-corriger `APP_CONFIG.scale = scaleGps` au-delà d'un seuil — KARMA a explicitement refusé, les 2 sources sont valides indépendamment
- ❌ Ajouter un toggle "masquer ce banner" — perte de la valeur diagnostic
- ❌ Animer le critical avec pulse/strobe — irrite en usage prolongé
- ❌ Afficher le banner si **seul un des deux** (géoréf OU scale) est défini — pas de comparaison possible, on ne montre rien
- ❌ Catch le throw de `buildTransform` (points colinéaires) silencieusement → on retourne `{ hasCalibration: false, error }` pour permettre au caller de logger
- ❌ Cacher le bouton 📋 Copier sur HTTP non-secure — fallback `execCommand("copy")` géré dans `attacherBoutonCopierEchelleGps`

#### 73.6 Pour étendre

**Si on veut afficher le banner ailleurs** (modale Créer/Modifier plan §70 georef, modale Aide IA, etc.) :
1. Importer `window.renderBannerCoherenceEchelle(planId, { context: "..." })` au point d'injection HTML
2. Appeler `window.attacherBoutonCopierEchelleGps(container)` après mise en place du DOM
3. Idempotent — pas de bug si appelé plusieurs fois

**Si on veut un mode "validation stricte"** (bloquer l'export KMZ si critical) :
1. Dans `sessionExporter.js > genererKmz`, ajouter pré-check : si `calculerCoherenceEchelleGeoref` retourne `level === "critical"`, refuser l'export avec modale d'erreur explicite
2. Pattern OK pour KMZ (export = engagement de précision). Pas OK pour PNG/PDF (engagement visuel uniquement)

**Si on veut un seuil custom par user** (genre "je tolère 20% en zone urbaine") :
1. Ajouter `localStorage["myktamap_scale_coherence_thresholds_v1"]` JSON `{ warn, alert, critical }`
2. Lire dans `calculerCoherenceEchelleGeoref` avec fallback defaults `{ warn: 3, alert: 6, critical: 10 }`

---

---

### 78. Mode Secours **multi-phases** — séquencement P1 → debrief → P2 (v1.29.0 — 2026-05-30)

Évolution majeure de Mode Secours : un scénario peut désormais séquencer plusieurs phases avec
debrief intercalé. Cas d'usage terrain : *"Phase 1 = une équipe balaye TOUS les roulages principaux
SANS entrer dans les chambres d'exploitation, retour de l'équipe, debrief PC, Phase 2 = X équipes
vont en chambres d'exploitation avec les infos remontées"*.

Découpage en 3 commits C1 → C3 (C4 rôle Relai et C5 rapports enrichis prévus en v1.29.x).
Décisions design tranchées avec KARMA via workflow d'analyse (Run `wpgul0942`) : `1:c 2:c 3:c 4:a
5:b 6:a 7:a` puis `C3.1:b C3.2:a`.

#### 78.1 Architecture — `scenario.phases[]` embedded + archive séparée

**Pourquoi pas un tag `_phaseIdx` in-place sur chaque étape** :
- ✅ Aucune modification à `updateEtape` / `marquerEtapeStatut` / renderers Live
- ✅ Rétro-compat stricte : scénario v1 mono-phase = comportement strictement identique à v1.28.5
- ✅ `_getEtapesEquipe` retourne toujours la phase active (= UX inchangée)
- ❌ Le tag in-place aurait nécessité de refactorer tous les `data-step="N"` (= conversion local ↔ global)
  et tous les renderers (filtre par phase active partout)

**Format scénario** (cf JSDoc en tête de `js/secoursMode.js`) :

```js
scenario.phases = [
  {
    id:        "P_<ts>_<rand>",       // unique
    idx:       0,                      // position dans phases[]
    nom:       "Phase 1",              // libellé custom
    groupeIds: [equipeId1, equipeId2], // équipes assignées (hybride 1:c)
    startedAt: ISO | null,             // set par lancerExecution OU lancerPhaseSuivante
    endedAt:   ISO | null,             // set par terminerPhase (C3) OU arreterExecution (filet)
    debrief:   "",                     // texte libre 5000 char (C3)
    debriefAt: ISO | null              // timestamp debrief
  }
]
scenario.execution = {
  ...
  currentPhaseIdx: 0,                  // index dans phases[]
  etapes: { equipeId: [...] },         // SEULEMENT la phase active
  etapesArchive: {                     // 🆕 v1.29.0 C3 — phases précédentes figées
    "0": { equipeId: [étapes phase 0] }
  },
  _phaseReadyToastShownForIdx: N       // 🆕 flag interne pour éviter spam toast
}
```

#### 78.2 Migration silencieuse v1.28.x → multi-phases

`_migrateScenarioV1ToPhases(s)` est **idempotente** — peut tourner 100 fois sans dégât. 3 cas
couverts :

1. **`phases[]` absente** (scénario v1) → crée 1 phase implicite `"Phase 1"` couvrant tous les
   groupes. Si `execution` existe déjà (scénario v1 lancé en Phase 3 historique), reporte
   `execution.startedAt/endedAt` sur cette phase implicite (pour cohérence rapports futurs).
2. **`execution` sans `currentPhaseIdx`** → set à 0.
3. **`phases[0].groupeIds` vide alors qu'il y a des groupes** → filet de sécurité, repush tous les
   groupes (cohérence avec doctrine "1 phase implicite couvre tout v1").

Appelée par :
- `_loadScenarios()` au boot (sur tous les scénarios localStorage)
- `_appliquerPayloadImport(payload)` à chaque import `.mkmsec.json` (couvre v1 re-importés ET
  v1.29+ avec phases[] explicites — remap `phase.groupeIds[]` via `idMap[oldGid]` ; depuis le
  29/09/2026 les g.id ne sont régénérés que pour une **copie**, cf §67.3)

Format `.mkmsec.json` reste à **`version: 1`** (champ `phases` optionnel ignoré par anciens
parsers — **pas de cassure rétro-compat**).

#### 78.3 Cycle de vie C3 — terminerPhase + lancerPhaseSuivante

**Helpers internes** :
- `_phaseEstPretAClore(s)` — true SSI toutes les équipes participantes de la phase active ont
  leur étape `type: "sortie"` avec `completedAt` set. Garde-fou : au moins une équipe doit avoir
  une étape sortie (= phase pas vide).
- `_archivePhaseEtapes(s, phaseIdx)` — deep clone JSON de `s.execution.etapes` vers
  `s.execution.etapesArchive[String(phaseIdx)]`. Le contrat est : **les étapes archivées ne
  doivent plus évoluer**.
- `_getArchivedEtapes(s, phaseIdx, equipeId)` — lecture pour rapports/historique. Retourne null
  si pas trouvé (caller doit fallback sur `s.execution.etapes` pour phase courante).

**API publique** :

```js
SM.terminerPhase(scenarioId, { debrief: "..." })  // archive + endedAt + debrief
                                                   // NE lance PAS la phase suivante
SM.lancerPhaseSuivante(scenarioId)                 // increment currentPhaseIdx
                                                   // rebuild etapes pour participants
                                                   // depuis parcours ACTUEL (KARMA C3.1:b)
SM.isPhasePretAClore(scenarioId)                   // → bool
SM.getArchivedEtapes(scenarioId, phaseIdx, equipeId)  // pour rapports C5
```

**Pré-conditions strictes de `lancerPhaseSuivante`** :
- Execution active
- Phase actuelle a `endedAt` set (= `terminerPhase` appelé d'abord)
- Une phase d'index `currentPhaseIdx + 1` doit exister
- Si une équipe ne participe PAS à la nouvelle phase → son entry dans `s.execution.etapes` est
  **supprimée** (vue Live Op n'affiche plus que les pertinentes). Ses étapes archivées restent
  dans `etapesArchive` pour les rapports.
- Préserve `_notes_libres` (mode secouriste libre, indépendant des équipes)

#### 78.4 Watcher auto-détection (KARMA C3.2:a + 2:c hybride)

Dans `updateEtape(scenarioId, equipeId, etapeIdx, partial)`, après le `_commitMutation(s)`,
bloc `try/catch` :

```js
const phaseIdx = s.execution.currentPhaseIdx || 0;
const isOp = (s.execution.role === "operateur");
const isMulti = Array.isArray(s.phases) && s.phases.length >= 2;
const alreadyShown = (s.execution._phaseReadyToastShownForIdx === phaseIdx);
if (isOp && isMulti && !alreadyShown && _phaseEstPretAClore(s)) {
  s.execution._phaseReadyToastShownForIdx = phaseIdx;
  _commitMutation(s);
  _toast("✅ Toutes les équipes sont sorties — la phase est prête à clore. " +
         "Ouvre la vue Live Opérateur pour passer au debrief.", "info");
}
```

Le flag `_phaseReadyToastShownForIdx` est reset par `lancerPhaseSuivante` (cleanup pour permettre
le toast à la phase suivante quand elle sera prête).

#### 78.5 UI — Bouton "✓ Phase terminée" + bandeau badge + section Phases

**Footer vue Live Op** :
- Bouton `data-action="terminer-phase"` visible UNIQUEMENT si `phases.length >= 2` (mono-phase =
  comportement v1.28.5 strict, zéro pollution UI)
- Couleur ambre charte par défaut (`.kta-btn-phase-end`)
- Si `_phaseEstPretAClore(s)` retourne true → classe additionnelle
  `.kta-btn-phase-end-ready` qui ajoute :
  - Couleur verte (`#6ee287`)
  - Animation `kta-phase-end-pulse` 1.8s ease-in-out infinite (box-shadow pulsante)
  - Signal visuel **non bloquant** que la phase est prête à clore (KARMA C3.2:a)
- Au clic → ouvre `_afficherModaleDebrief(scenarioId)`

**Header sticky (3 vues Live)** : badge `📋 Phase 1 1/2` ambré + tooltip "Nom phase — N sur M".
Visible UNIQUEMENT si `phases.length >= 2` (KARMA C2.1:a).

**Section "📋 Phases (N)" en vue Edit** : toujours présente. Si 1 phase → hint + bouton "➕".
Si 2+ phases → liste éditable avec statut (Active / Terminée / Démarrée / Non démarrée) + nb
équipes + boutons ✏️ Éditer / 🗑️ Supprimer (avec 3 garde-fous : refus si dernière phase, si
phase active, si phase déjà démarrée).

#### 78.6 Modales transitions C3

`_afficherModaleDebrief(scenarioId)` — pattern modale charte :
- Header "📝 Terminer la phase « Nom »" liseré bleu charte
- Textarea libre 5000 chars max (focus auto)
- Récap équipes actuelles + bloc info phase suivante si existe
- Si aucune phase suivante : bloc warning ambre "clôt l'ensemble du plan"
- Bouton "✓ Terminer la phase" → `terminerPhase(scenarioId, { debrief })` puis :
  - Si phase suivante → enchaîne sur `_afficherModaleLancerPhaseSuivante`
  - Sinon → `confirm()` natif "arrêter le plan complètement ?"

`_afficherModaleLancerPhaseSuivante(scenarioId)` :
- Récap phase à démarrer + liste équipes avec swatchs couleur OTAN
- Disabled si 0 équipe assignée (warning explicite)
- Boutons "Plus tard" / "🚀 Démarrer phase X"
- Au launch → `lancerPhaseSuivante(scenarioId)` + toast + re-render vue active

#### 78.7 À NE PAS faire

- ❌ **Bumper `MKMSEC_FORMAT_VERSION`** sans nécessité absolue. Garder à 1 + champ `phases` optionnel.
- ❌ **Écraser `s.execution`** au passage de phase. `terminerPhase` archive sans détruire.
- ❌ **Tagger `etape._phaseIdx` in-place** — l'archive séparée est délibérément plus simple.
- ❌ **Lancer auto la phase suivante** sans confirmation Op (KARMA 2:c hybride explicite).
- ❌ **Spammer le toast d'auto-détection** — toujours utiliser le flag `_phaseReadyToastShownForIdx`.
- ❌ **Casser le cap `MAX_SCENARIOS=10`** — FIFO inchangé.
- ❌ **Supprimer une phase active OU démarrée** — `supprimerPhase` refuse explicitement.
- ❌ **Permettre `lancerPhaseSuivante` sans `terminerPhase` préalable** — chaînage strict.

#### 78.8 Roadmap suite v1.29.x

- **C4 — Rôle Relai** (KARMA Option A retenue) : équipe avec flag `g.estRelai: true` + parcours
  "axe principal" + badge 🛣️ RELAI sur card Op + tri prioritaire dans grille. Hérite gratuitement
  de tout (PDF/KMZ/IDB photos/rapports/itinéraire Pathfinder/couleur OTAN). Estimation : M.
- **C5 — Rapports enrichis** : `genererRapportPDF` + `genererRapportData` avec sections par phase
  + debriefs intercalés. Lecture `s.execution.etapesArchive[phaseIdx]` pour phases archivées +
  `s.execution.etapes` pour phase courante. KARMA 6:a = 1 PDF global, pas N PDF. Estimation : L.
- **C6 — Polish + docs** : tests terrain + AI_CONTEXT enrichi + éventuels hotfixes UI. S.
- **Forwarding obs équipe→PC via Relai** : reporté à v1.29.x ou v1.30.x selon retours terrain
  (KARMA 5:b — feature standalone à valider d'abord).

---

## 79. Synergie Vue OSM × Mode Secours (v1.41.0+)

Roadmap 5 étapes A→E pour transformer Mode Secours en outil de coordination avec secours externes (pompiers, GRIMP, SDIS) via Vue OSM georef.

### 79.1 Étape A (v1.40.33 + v1.40.34) — Liens bidirectionnels

- **v1.40.33** : bouton 🌍 Vue OSM dans bandeau Mode Secours (vue Edit).
- **v1.40.34** : layer 🚨 Secours dans Vue OSM (zones / itinéraires / markers équipes projetés via georef).

### 79.2 Étape D (v1.41.0) — Tag POI « Point d'entrée du plan »

Nouveau tag built-in `entree_plan` (catégorie « 🚨 Secours »), 7 sites touchés (cf skill `add-icon-tag`) :

- `js/map.js > TAGS_BUILTIN` : SVG data URI (porte stylisée jaune), pas de PNG nécessaire
- `js/editor.js > EDITOR_TAG_LABELS` : "🚪 Point d'entrée du plan"
- `js/interfaceLegende.js > LEGENDE_LABELS` + 2× `GROUPES` (modale + helper)
- `js/exporter.js > GROUPES_ICONES` : catégorie "🚨 Secours"
- `js/createConf.js > PLANNER_DEFAULT_ICONS` : même SVG data URI
- `sw.js > ASSETS_TO_CACHE` : **SKIPPED** (data URI inline, pas de fichier à cacher)

Marker affiché normalement dans Vue OSM + reconnu par `_drawBriefingSurfacePage` comme POI critique.

### 79.3 Étape E (v1.41.0) — Champ `surfaceGps` par équipe

Schéma équipe étendu dans `js/secoursMode.js` :

```js
groupe.surfaceGps = null  // { lat, lng } | null
```

- `addGroupe` : init `null`
- `updateGroupe` whitelist : validation range stricte (`lat ∈ [-90, 90]`, `lng ∈ [-180, 180]`), null explicit pour reset
- UI form : input texte format `"lat, lng"` + handler `[data-action="edit-surface-gps"]` → parse regex + toast erreur si invalide
- Sérialisation : automatique dans export `.mkmsec.json` (champ inclus dans le scenario JSON)

Backward-compat : équipes pré-v1.41.0 ont implicitement `surfaceGps: undefined` → `_drawBriefingSurfacePage` affiche "non renseigne".

### 79.4 Étape B (v1.41.0) — Page « Briefing surface » dans rapport PDF

Helper partagé `_drawBriefingSurfacePage(pdf, scenario, plan, pageW, pageH, margin)` injecté dans `genererRapportPDF()` juste après le briefing global (try/catch silencieux pour ne pas casser l'export en cas d'erreur géoref).

Sections de la page :

1. **INFOS** — nom scenario + nom plan + date génération
2. **LOCALISATION** — centre GPS + bbox + 2 liens cliquables (`pdf.textWithLink` vers OSM + Google Maps)
3. **EQUIPES SUR PLACE** — pour chaque équipe : nom + membres + `surfaceGps` (si renseigné) + lien OSM individuel par équipe
4. **POI CRITIQUES** — tag `entree_plan` + `sortieurgence` + `cao`/`caf`, groupés par tag (lecture `window.listePoints`)

### 79.5 Étape C (v1.41.0) — `genererBriefingPompiersPDF()` dédié

> 🩸 **29/09/2026 (audit Secours)** — le bloc « POI critiques » était **toujours vide** : il lisait `window.listePoints` (un `let` racine d'`editor.js`, jamais sur `window`), `p.tag` au lieu de `tags[]`, et un tag `sortieurgence` qui n'existe pas. Il lit maintenant session + calques du plan (`getEditorPoints` + `getAllEmbeddedPoints`, comme `sortieUrgence.js`) et liste les accès **ouverts** (`entree_plan` + libellés « entrée », `cao`, `peo`, `eso` — les mêmes que la Sortie d'urgence) puis **fermés** (`caf`, `pef`, `esf`), un POI une seule fois. Clés `critPeo/Eso/Pef/Esf` ajoutées, `critSortie` retirée. Vérifié sur le PDF réel généré en navigateur.

Fonction publique : `SecoursMode.genererBriefingPompiersPDF(scenarioId)` async → PDF dédié 1+ pages via `_drawBriefingSurfacePage`. Bouton 🚒 dans :

- Bandeau Mode Secours (vue Edit, plan actif + plan terminé)
- Footers des 3 vues Live (Équipier, Opérateur, Secouriste) via `_bindLiveCommonHandlers` (v1.41.1)

Pas de capture canvas Leaflet (`html2canvas` non dispo dans `lib/`) — choix MVP : liens cliquables OSM/Google Maps suffisent pour briefing pompiers (ils cliquent depuis leur PC).

### 79.6 Hotfixes v1.41.1 → v1.41.4

| Version | Fix | Détail |
|---------|-----|--------|
| v1.41.1 | UX | Boutons 🌍 + 🚒 ajoutés dans les 3 footers Live + handlers communs `_bindLiveCommonHandlers` |
| v1.41.2 | Robustesse | `OsmView.getPlanGpsBbox()` lazy build : appelle `_buildProjection()` à la volée si `_proj` null. Permet à `genererBriefingPompiersPDF` de marcher sans avoir ouvert la modale OSM avant. |
| v1.41.3 | UX | Chips tags Vue OSM modale : retrait du filtre `_isLevelAllowed(p)` dans `_enumerateOsmTags` (insuffisant — fix réel en v1.41.4) |
| v1.41.4 | Bug racine | `_enumerateOsmTags` itérait sur `window._dataLayersByPlan` qui n'existe nulle part dans l'app → seuls ~3 tags de la session étaient comptés. Switch sur `window.getAllEmbeddedPoints()` (API officielle, même source que `_collectVisiblePoi`). |

### 79.7 Roadmap restante (post-v1.41)

- **Capture canvas réelle** : si KARMA veut une vraie image de la Vue OSM dans le PDF (au lieu des liens cliquables), ajouter `html2canvas` à `lib/` (~50KB) + écrire `_captureOsmCanvas()` async qui rend le DOM Leaflet en image PNG → injecter via `pdf.addImage()`. Risque : CORS sur tuiles OSM, à gérer avec `crossOrigin: 'anonymous'`.
- **GPS auto via navigator.geolocation** : permettre à un équipier sur le terrain de set son `surfaceGps` en 1 clic via le bouton GPS du navigateur (différent du PC chef qui saisit manuellement). Demanderait permission OS + UI dédiée.
- **Multi-entrée_plan** : actuellement 0..N tags `entree_plan` possibles. Si KARMA veut limiter à 1 (= entrée principale unique), ajouter validation côté éditeur POI + warning si double tag.

---

---

## 📉 La fiche dit la PROFONDEUR, pas seulement le niveau (v1.83.0)

**Pourquoi ça compte ici plus qu'ailleurs** : un numéro de niveau (« -2 ») est une **coordonnée interne** à l'app. Une profondeur (« -35 m ») dit **combien de corde et quelle équipe**. C'est une information opérationnelle, pas un détail d'affichage.

Quand les niveaux du plan portent une profondeur (`plan.niveauxProfondeur`), « -2 » devient « **-2 · -35 m** » — dans le relevé texte, dans le PDF et sur les cartes de scénario.

🩸 **Branché sur `_formatLevelShort`, source UNIQUE des trois sorties.** L'écrire trois fois aurait garanti qu'une des trois dérive — c'est le défaut que ce dépôt a déjà payé sur les tables de styles et sur le catalogue d'icônes.

⚠️ Un plan **sans profondeurs** affiche le niveau seul, exactement comme avant : rien n'est inventé.
