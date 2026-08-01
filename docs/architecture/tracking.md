# Architecture MyKTAMap — Tracker, boussole, heading, navigation

> Référence détaillée extraite de l'ancien CLAUDE.md. Lue à la demande (pas auto-chargée).
> Sections : §24, §25, §28, §34, §62, §70, §75, §76, §77

---

### 24. Fix heading tracker + sources d'orientation (depuis v147 — 14/05/2026)

**Bug v145 et avant** : la fonction `getHeading(α, β, γ)` dans `tracking.js` retournait un heading **inversé Est↔Ouest** pour téléphone tenu à plat (formule avec `+sin α cos β` au lieu de `-sin α cos β` sur la composante East), avec en plus des **termes spurious en γ** qui ne devraient pas exister dans la projection de l'axe Y device, et **aucune gestion** de la pose verticale (cos β ≈ 0 → calcul dégénéré). Retour terrain en carrière : "tourner à droite physiquement → tracker tourne à gauche, avancer → recule".

**Fix v147 dans `getHeading`** :

Math propre dérivée de la matrice W3C DeviceOrientation (rotation intrinsèque Z-X'-Y'', `R = Rz(α) · Rx(β) · Ry(γ)`).

- **Pose à plat** (`|cos β| > 0.5`) — pose "boussole", recommandée dans la doc utilisateur :
  - Projection axe Y device (top edge) en monde : `(-sin α cos β, cos α cos β, sin β)`
  - γ n'intervient pas (rotation autour de Y laisse Y invariant)
  - heading = `atan2(-sin α cos β, cos α cos β)`
- **Pose verticale** (`|cos β| ≤ 0.5`) — pose "lecture SMS", fallback :
  - Projection axe -Z device (dos / caméra) en monde
  - heading = `atan2(-(cos α sin γ + sin α sin β cos γ), -(sin α sin γ - cos α sin β cos γ))`

Validation math des 4 cardinaux (pose plate, β=0) :

| α | Direction réelle | Code v145 | Code v147 |
|---:|:---:|:---:|:---:|
| 0 | Nord (0°) | Nord ✅ | Nord ✅ |
| 270 | Est (90°) | Ouest ❌ | Est ✅ |
| 180 | Sud (180°) | Sud ✅ | Sud ✅ |
| 90 | Ouest (270°) | Est ❌ | Ouest ✅ |

**Cascade de sources d'orientation** (dans `initOrientation`) :

1. **iOS** : `event.webkitCompassHeading` — compass calibré natif (magnétomètre + capteurs fusion iOS), déjà en convention 0=N CW. **Priorité absolue** quand dispo (plus précis que tout calcul depuis α/β/γ).
2. **Android moderne** : listener `deviceorientationabsolute` au lieu de `deviceorientation` → l'event `event.alpha` est référencé true North magnétique (au lieu d'être relatif à la position de boot, ce qui cause une dérive sans recalage).
3. **Fallback** : calcul depuis (α, β, γ) via `getHeading` corrigé.

Choix du listener au boot : `if ("ondeviceorientationabsolute" in window)` → `deviceorientationabsolute` (Android), sinon `deviceorientation` (iOS, qui publie `webkitCompassHeading` sur cet event).

**API exposée** :
- `window.getCurrentHeading()` → retourne `direction` (lecture seule, degrés 0-360). Utilisé par le widget boussole (cf. §25).

**Log throttled** : `[Tracking] Heading : NNN.N° (source: webkitCompassHeading | calc-absolute | calc-relative)` à 1Hz max pendant le tracking actif. Permet de vérifier au debug quelle source feed le heading sur le device de l'utilisateur. Gating centralisé par debug.js (cf §11).

**À NE PAS TOUCHER** quand on intervient sur tracking.js :
- `requestPermission()` — iOS gesture flow. Pre-existing bug : ne demande que `DeviceMotionEvent.requestPermission`, pas `DeviceOrientationEvent.requestPermission`. Sur iOS 13+, certaines versions auto-grantent l'orientation avec la motion permission ; d'autres pas. À corriger dans un fix séparé si retour terrain iOS confirme un problème.
- `initMotion`, `avancer`, `estAccessible`, `initCollisionCache` — détection de pas + collision, indépendants du heading.
- Flags idempotents `_orientationListenerAttached` / `_motionListenerAttached` — protection plan switch.

---

### 25. Widget boussole + popup avertissement tracker (depuis v147 — 14/05/2026)

#### 25.1 Widget boussole (`js/compass.js`)

Outil de validation visuelle du heading : affiche la rose des vents `icon/mkm-full.png` (logo charte) qui contre-tourne en temps réel selon `window.getCurrentHeading()`. Permet à l'utilisateur de vérifier d'un coup d'œil que le heading est cohérent (marche vers Nord → N reste en haut, marche vers Est → N pointe à gauche, etc.).

**Architecture** : module IIFE `js/compass.js` (~200 lignes), expose `window.CompassWidget = { show, hide, toggle, isVisible, openFull, closeFull }`.

**Deux vues** :

1. **Widget flottant** (bottom-left top-left au final) :
   - Position : top-left sous les boutons de zoom Leaflet (`top: 80px + safe-area-top; left: 10px`).
   - Rose 100px desktop / 80px mobile.
   - Texte "N 12°" / "NE 45°" / "O 270°" sous la rose (notation française : O au lieu de W, NO au lieu de NW).
   - ✕ pour fermer entièrement, clic ailleurs sur le widget → ouvre le modal plein.
   - Border jaune au hover (signale la cliquabilité).

2. **Modal plein** (`.kta-readme-modal-overlay` standard) :
   - Ouvert au clic sur le widget flottant.
   - Rose 240px desktop / 180px mobile.
   - Cardinal en gros jaune (`#f4c542`) + angle en gris à côté.
   - Hint explicatif + liste de validation des 4 cardinaux.
   - Note rouge : armatures métalliques faussent le magnétomètre.
   - Fermable ✕ / backdrop / Échap → revient au widget flottant.

**Boucle rAF unifiée** : un seul `requestAnimationFrame` actif quand le widget est visible. Query unifiée via classes partagées :
- `.kta-compass-rotating-rose` → toutes les roses (widget + modal s'il est ouvert) reçoivent le `transform: rotate(-h deg)`
- `.kta-compass-text-display` → texte combiné "N 12°" du widget flottant
- `.kta-compass-cardinal-display` → cardinal seul du modal plein
- `.kta-compass-angle-display` → angle seul du modal plein

Throttle 0.5° avant re-application du transform (skip rerender CSS si heading stable).

**Entrée UI** : sous-action 🧭 dans le groupe accordéon **Tracker** (`interface.js`, après ▶️ Play, avant 📍 Mode recalage). Toggle visuel `kta-actif` synchronisé via hook `window._onCompassHiddenExternally` (déclenché si l'utilisateur ferme via la ✕ du widget plutôt que par re-clic sur la sous-action).

**Permission iOS** : `show()` appelle `requestPermission()` (idempotent côté tracking.js). Comme `show()` est invoqué depuis un click handler (sous-action 🧭), c'est un geste utilisateur valide pour iOS.

**Math de rotation** : `rotate(-direction deg)` sur la rose. Quand l'utilisateur est face au Nord (direction=0), rose normale. Face à l'Est (direction=90), rose contre-tournée 90° → N pointe à gauche du widget.

**Pourquoi pas une icône SVG dédiée ?** Réutiliser `icon/mkm-full.png` (rose des vents jaune du splash + logo PWA) garantit la cohérence visuelle avec l'identité de la marque sans charger un nouvel asset.

#### 25.2 Popup d'avertissement tracker

Modal affiché **une fois par session** au clic ▶️ Play. Rappelle que le module est expérimental et ne doit pas servir à se localiser en situation réelle.

**Flag in-memory** : `let _trackerWarningAcknowledged = false;` au module-scope dans `interface.js`. Réinitialisé à chaque reload de la page (par design — pas de localStorage : on veut que l'utilisateur revoie l'avertissement à chaque session).

**Fonction helper** : `_afficherAvertissementTracker(onConfirm)` dans `interface.js` (au module-scope, avant `initInterface`). Crée un overlay `.kta-readme-modal-overlay` + boîte `.kta-tracker-warn-boite` avec liseré rouge subtil. Contenu :
- Lead rouge : "Ne pas utiliser pour te repérer en situation réelle."
- Paragraphe sur la dérive cumulative + armatures métalliques.
- Section ✅ Utilisations recommandées (debug, calibration, détection pas).
- Section ❌ NE PAS utiliser pour (localisation réelle, itinéraire fiable, perte → ⛑️).
- Note italique : recalage 📍 indispensable tous les ~50m.
- Footer : Annuler (ghost) / "J'ai compris — Démarrer" (primary).

**Wire-up dans le onClick ▶️** :

```js
const _doStart = function() {
  requestPermission();    // ← appel SYNCHRONE depuis le click handler
  startTracking();
  btnSub.innerHTML = "⏹️";
  isTracking = true;
};
if (_trackerWarningAcknowledged) _doStart();
else _afficherAvertissementTracker(_doStart);
```

**⚠️ Critique iOS** : `DeviceMotionEvent.requestPermission()` doit être appelé depuis un geste utilisateur synchrone. Le clic sur "J'ai compris" EST un nouveau geste utilisateur (chaque event click est un user gesture indépendant), donc `requestPermission` appelé dans son handler est valide.

**À NE PAS FAIRE** : ajouter un `setTimeout` ou `await Promise(...)` entre le click et `requestPermission` → casse le user gesture iOS, la popup de permission n'apparaît plus, l'orientation n'est pas captée.

**Dismiss = Annuler** : clic backdrop / Échap / ✕ / bouton Annuler → modal disparaît sans démarrer le tracker (`_trackerWarningAcknowledged` reste false → la popup réapparaît au prochain clic ▶️).

**Le bouton 🧭 Boussole NE déclenche PAS cette popup** : le widget boussole est un outil de debug légitime (cf §25.1), pas un démarrage de tracking. Il appelle `requestPermission` directement sans rappel d'avertissement.

---

### 28. Tracker directionnel — icône qui tourne en tracking actif (depuis v158-v161)

L'icône du marker tracker tourne en temps réel pour pointer dans la direction de marche pendant le tracking actif. Au repos (tracking off, recalage seul, plan affiché statique) : icône fixe pointant Nord.

**Source du heading** : `getCurrentHeading()` exposé par `tracking.js` (cf. §24 sources d'orientation). Cohérent avec la boussole 🧭 — les 2 widgets utilisent le même heading mais avec rotation opposée (boussole contre-tourne pour garder le N en haut, tracker tourne dans le sens de marche).

**Implémentation DOM** :
- `iconeTrack` est un **`L.divIcon`** (et pas `L.icon`) qui produit `<div class="kta-tracker-divicon"><img class="kta-tracker-img"></div>`
- Le **DIV wrapper** reçoit le `transform: translate3d(...)` de Leaflet (positionnement géo)
- L'**`<img>` enfant** reçoit notre `transform: rotate(heading deg)` (rotation indépendante)
- → 2 éléments distincts = 2 transforms qui ne s'écrasent pas mutuellement

⚠️ **Piège v158** : utilisation initiale de `L.icon` qui produit un `<img>` top-level. Leaflet appliquait `translate3d` sur cet `<img>`, et notre `rotate` sur le même → écrasement, icône collait au `(0,0)`. **Fix v159** : passage en divIcon. À ne JAMAIS revenir à `L.icon` pour ce marker.

**Anti-jitter (v160)** : 3 techniques combinées dans `_applyRotationToTrackerMarker()` :

| Technique | Valeur | Rôle |
|---|---|---|
| Smoothing exponentiel | `α=0.25` (75% historique + 25% nouvelle) | Filtre le bruit ±2-5° du magnétomètre |
| Throttle DOM | `2°` après smoothing | Skip update si delta trop petit |
| Transition CSS | `0.3s ease-out` sur `.kta-tracker-img` | Absorbe les sauts résiduels |

**Wrap circulaire 0-360°** : delta signé minimum pour les transitions Nord→Nord-via-Est (350°→10° = `+20°`, pas `-340°`). Géré à 2 endroits : (1) dans le smoothing pour ne pas faire revenir l'icône en arrière, (2) dans le throttle pour la distance circulaire vraie.

⚠️ **Piège v160 (fix v161)** : initialiser `_trackerRotationLast = -999` comme sentinel "jamais initialisé" cassait le wrap-fix (`360 - (-999) = 1359` ou `360 - 999 = -639 < 2`) → return immédiat éternel → icône bloquée. **Toujours utiliser un sentinel typé** (`null`) + check explicite avant tout math circulaire.

**API privée** :
- `_applyRotationToTrackerMarker()` — appelée depuis `_onOrientation` (à chaque event d'orientation, iOS webkitCompassHeading + cas calc α/β/γ) + au `startTracking()` pour pré-positionner si heading déjà connu
- `_resetRotationTrackerMarker()` — appelée au `stopTracking()`, reset `transform: rotate(0deg)` + vide `_trackerHeadingSmoothed = null` + `_trackerRotationLast = null` pour repartir frais au prochain Play
- Variables module-scope : `_trackerHeadingSmoothed`, `_trackerRotationLast` (les 2 reset à `null` au stop)

**Compatibilité tracking-off** : `_applyRotationToTrackerMarker` early-return si `!tracking` → l'icône reste en pose neutre Nord. Pas de coût CPU au repos.

**À NE PAS TOUCHER** :
- Le choix `L.divIcon` (pas `L.icon`)
- Le sentinel `null` (pas `-999`) pour `_trackerRotationLast`
- La transition CSS de 0.3s — testée optimale pour la perception humaine du smooth
- Le tag `direction` global qui est mis à jour par `_onOrientation` — c'est la même var que celle utilisée par `getCurrentHeading()` pour la boussole

---

### 34. Correction heading selon orientation écran (depuis v172)

Fix critique : la boussole 🧭 (cf §25) et la rotation de l'icône tracker (cf §28) étaient faussées en mode landscape (±90° de décalage) et portrait inversé (180°).

#### 34.1 Root cause

`DeviceOrientationEvent` renvoie α/β/γ par rapport aux axes **intrinsèques** du device :
- Axe Y = bord court "haut" physique du tel
- En portrait normal : axe Y aligné avec le haut visuel → heading brut OK
- En landscape : OS a tourné l'écran mais le device n'a pas bougé → l'axe Y pointe vers la gauche/droite visuelle → décalage angulaire perçu comme un bug

Le calcul `getHeading(α, β, γ)` v147 (cf §24) reste correct mais renvoie la direction vers laquelle pointe le **haut device**, pas le **haut visuel**.

#### 34.2 Architecture en 3 couches

**1. `direction`** (existant) reste la valeur **device brute**. Source de vérité pour debug + cohérence avec iOS `webkitCompassHeading` qui est aussi brut (compass natif iOS retourne le heading de l'axe Y device).

**2. `_getCorrectedHeading()`** (nouveau) applique l'offset écran :
```js
function _getCorrectedHeading() {
  if (typeof direction !== "number" || isNaN(direction)) return 0;
  return ((direction + _screenAngle) % 360 + 360) % 360;
}
```

**3. `_screenAngle`** (0 / 90 / 180 / 270) maintenu à jour à 2 moments :
- Au boot de `_initScreenOrientationListener()` (appelé par `initOrientation` qui est déclenché par `requestPermission` du tracker OU de la boussole 🧭 — couvert même sans tracker actif)
- Sur event `screen.orientation.change` (standard) OU `window.orientationchange` (fallback iOS Safari < 16.4 + vieux Android) → l'user tourne son tel → recalage instantané sans attendre le prochain event device → l'icône tracker est aussi ré-orientée immédiatement via `_applyRotationToTrackerMarker()`

#### 34.3 Cascade compat `screen.orientation`

Helper `_getScreenAngleNormalized()` :

```js
function _getScreenAngleNormalized() {
  // Standard moderne (Chrome, Firefox, Edge, Safari ≥ 16.4)
  if (screen && screen.orientation && typeof screen.orientation.angle === "number") {
    return ((screen.orientation.angle % 360) + 360) % 360;
  }
  // Fallback iOS Safari < 16.4 — convention OPPOSÉE pour landscape :
  //   iOS 0 → standard 0,  iOS 180 → standard 180
  //   iOS 90 → standard 270 (LS-left iOS = LS-secondary standard)
  //   iOS -90 → standard 90 (LS-right iOS = LS-primary standard)
  if (typeof window.orientation === "number") {
    const v = ((window.orientation % 360) + 360) % 360;
    if (v === 0 || v === 180) return v;
    return (360 - v) % 360;
  }
  return 0;
}
```

⚠️ **Piège** : `screen.orientation.angle` et `window.orientation` ont des **conventions opposées** pour landscape. L'OS standard dit "90 = écran tourné 90° anti-horaire par moi" (= user a tourné tel 90° horaire), iOS dit "90 = device rotated 90° counter-clockwise". Sans normalisation, on aurait un bug iOS ⇄ Chrome dans la même formule.

#### 34.4 Validation math

(heading device + screen.angle) % 360. Cas testés (user face Nord) :

| Orientation visuelle | α device | screen.angle (standard) | corrected |
|---|---|---|---|
| Portrait normal | 0 | 0 | 0 ✓ |
| Landscape-PRIMARY | 270 | 90 | 0 ✓ |
| Landscape-SECONDARY | 90 | 270 | 0 ✓ |
| Portrait inversé | 180 | 180 | 0 ✓ |

**Justification** : si l'OS a tourné l'écran de θ° anti-horaire, le bord du device qui pointe désormais vers "haut visuel" est l'ancien bord à θ° du bord court "haut" device dans le sens horaire. Le heading visuel = heading brut + θ.

#### 34.5 Consumers basculés vers la version corrigée

- **`_applyRotationToTrackerMarker`** (tracking.js, cf §28) : `const heading = _getCorrectedHeading();` au lieu de `direction` directement. L'icône tracker tourne dans le sens cohérent avec l'orientation visuelle de la carte affichée.
- **`window.getCurrentHeading`** (consommé par compass.js widget boussole, cf §25.1) : `return _getCorrectedHeading();` au lieu de `return direction;`. La rose des vents contre-tourne par rapport au heading corrigé → le N reste en haut visuel quelle que soit l'orientation.

⚠️ **À ne pas faire** : appliquer la correction dans `_onOrientation` directement (= modifier la variable `direction`). Ça casserait la sémantique "direction = device brut" utile pour le debug + cohérence avec iOS webkitCompassHeading. Préférer toujours l'application à la lecture via le helper.

#### 34.6 Log debug enrichi

Format : `[Tracking] Heading : 270.0° (source: webkitCompassHeading, screen: 90°, visuel: 0.0°)`. Permet de diagnostiquer rapidement brut device vs correction appliquée vs résultat final consommé.

#### 34.7 Préservé (ne pas toucher)

- Math `getHeading(α, β, γ)` v147 (formule "pose à plat" / "pose verticale" inchangée)
- Smoothing exponentiel + throttle 2° + transition CSS 0.3s de l'icône tracker (§28)
- Cascade sources iOS `webkitCompassHeading` → Android `deviceorientationabsolute` → calc brut (§24)
- Tous les flags idempotents (`_orientationListenerAttached`, `_motionListenerAttached`, `_screenOrientationListenerAttached`)

---

### 62. v1.21.2 — Tracker session + Heatmap pertinente + GPS popup + Urgences (depuis v1.21.2)

Release PATCH consolidée (bump Z : 1.21.1 → 1.21.2). 7 sujets indépendants regroupés pour polish post-v1.21.1.

#### 62.1 Tracker timeline dans export session

`sessionExporter.js` Full + Avancé incluent désormais `session.tracker = {position, path, timeline, startTs}` (auparavant tracker entièrement exclu).

`sessionPersist.js` enrichit le payload localStorage :
```js
payload.trackerTimeline = window.getTrackingTimeline?.() || [];
payload.trackerStartTs  = window.getTrackingStartTs?.()  || null;
```

Restore au boot via `window.setTrackingTimeline(payload.trackerTimeline, payload.trackerStartTs)` (cf §50.5 pour le setter avec filtrage défensif).

**Conversion ed2data IGNORE le tracker** (volontaire) : un data layer est figé dans le plan, un tracker est par essence éphémère + utilisateur-spécifique. Inclure le tracker dans `data/<plan>/imported.json` créerait des données fantôme à chaque réouverture.

#### 62.2 Heatmap refonte majeure

**6 sources togglables** (vs 3 en v1.12.0) : `tracker timeline` / `editor points` / `roads` / `zones` / `structures` / `dataLayers`.

**Pattern collecteur → segments** : chaque collecteur retourne un array de segments `[{a:{x,y}, b:{x,y}|null}]`. Si `b === null` → segment dégénéré (point isolé). Permet d'interpoler la chaleur le long des polylines/polygones, pas juste sur les vertices.

**Interpolation** : pas de `radius × 0.33` entre `a` et `b`. Pour `radius=40px` → 1 point heat tous les ~13px le long du segment.

**Normalisation post-additive** : après accumulation additive de tous les gradients (composition `lighter`), pixel-walk de la canvas avec `getImageData` → trouve `maxAlpha` → normalise toutes les valeurs en `(alpha/maxAlpha) × 255`. Évite les hot-spots écrasants quand 100 sources se cumulent au même endroit.

**Filtre timeline défensif** : skip les entries de type `recalage` (téléportation = pas un déplacement réel), `start` (point de départ artificiel), et tout `gap > 5min` entre 2 entries consécutives (= pause utilisateur, pas une route empruntée à grande vitesse).

**Reset au plan switch** : `main.js > _libererRessourcesPlanPrecedent` appelle `window.Heatmap.effacer()` (cohérence avec les autres modules level-aware).

⚠️ **Quand on ajoute une nouvelle source au collecteur** : retourner toujours le format `[{a, b}]` (pas `[{x, y}]`), même pour des points isolés (`b: null`). Sinon l'interpolation ne marche pas et le rendu est creux.

#### 62.3 GPS popup POI

`utils.js > buildPointPopupHtml` ajoute une ligne `🌐 coords GPS lat, lng` (cliquable, copie au presse-papier) SI le plan est calibré.

3 helpers ajoutés :
- `_planXyToGps(x, y)` → `{lat, lng}` ou `null` (lookup `KmzExport.getCalibration(planId)` + `buildTransform` on-demand, cf §32.7)
- `_formatGps(lat, lng)` → `"43.6047, 1.4442"` (4 décimales, ~11m de précision)
- `window.kta_copierGps(lat, lng)` → exposé global pour le `onclick` du span GPS dans le popup. Utilise `navigator.clipboard.writeText` avec fallback `execCommand("copy")`.

Skip silencieux si plan non calibré (= la ligne `🌐` n'apparaît pas du tout, pas de placeholder vide).

#### 62.4 Fix mode urgence calibrage GPS

`emergencyMode.js > _tick` : clone exact du fix v1.21.1 #1 (transform jamais persisté). Avant : `calib.transform` cherché directement → toujours `undefined` → bloc GPS toujours masqué. Après : `buildTransform` on-demand.

⚠️ **Critique sécurité** : le bloc GPS du mode urgence est l'info principale pour qu'un utilisateur perdu puisse communiquer sa position à des secours externes (Google Maps, GPS standalone, etc.). Le bug le rendait inutilisable.

#### 62.5 Flyout sidebar étendu au Tracker

Groupe 🧭 Tracker (`interface.js`) passe en `useFlyout: true`. Auparavant cascade verticale (sous-actions empilées sous le bouton principal) → désormais panel latéral (pattern §56.3).

Profite des nouveaux patterns v1.21.2 :
- `dynamicIcon` : icône Play/Stop dynamique (▶️ ↔ ⏹️)
- `isActive` : la sous-action tracker brille en vert (`kta-actif`) quand le tracking tourne
- `cssClass` propagation : permet de styler chaque sous-action individuellement

Détails complets dans §56.3 (sous-section v1.21.2 ajoutée).

#### 62.6 Urgences en fin de sidebar, fond rouge

Réordonnancement visuel : les sous-actions urgences (`🚨 Je suis perdu`, `🚨 Panique`) sont déplacées en FIN de sidebar avec fond rouge pulsant (CSS `kta-emergency-btn`).

Cohérence avec le pattern UX général : actions critiques en zone facilement accessible (bas-droite pour droitier) + signalisation visuelle forte (rouge + pulse).

#### 62.7 WakeLock global — `js/wakeLock.js`

Nouveau module IIFE (~150 lignes) → `window.WakeLock = { acquire, release, toggle, isActive, isSupported, onChange }`.

Wraps `navigator.wakeLock.request("screen")` :
- Toggle ☑️ « Garder l'écran allumé » dans **2 endroits synchronisés** (pattern identique au toggle thème §53) :
  1. ⚙️ Réglages map mode
  2. ⚙️ Configuration home
- Persiste `localStorage["myktamap_wake_lock_v1"]` (boolean)
- **Re-acquire automatique sur `visibilitychange`** : navigateurs libèrent le wake lock quand l'onglet perd le focus → on le ré-acquiert au retour au premier plan (sinon l'user croit que ça marche mais l'écran s'éteint après un blur/refocus)
- Skip silencieux si API indispo (Safari < 16.4, vieux Firefox)

⚠️ **Différent du wake lock du mode urgence** (§ Wake Lock dans emergencyMode.js, hardcoded à l'activation/désactivation du mode). Le module global vit indépendamment et reste actif même hors mode urgence.

#### 62.8 Sources de vérité v1.21.2

- `version.json` → `"v1.21.2"`
- `js/copyright.js > __MKM__.build` → `"v1.21.2"`
- `sw.js > CACHE_NAME` → cumulé (cf §22)
- 1 nouveau fichier ajouté à `ASSETS_TO_CACHE` : `js/wakeLock.js`
- Réactivations dans `index.html` + `sw.js` : `js/heatmap.js` (commenté en v1.12.0, re-activé)

#### 62.9 À NE PAS faire

- ❌ Bypass `setTrackingTimeline` pour restaurer une timeline depuis un payload — le filtrage défensif protège contre les corruptions (anciens exports manuels, entries malformées d'extension tierce, etc.)
- ❌ Inclure le tracker dans Conversion ed2data — figerait une donnée éphémère + user-spécifique dans le data layer du plan
- ❌ Modifier un collecteur Heatmap pour retourner `[{x, y}]` au lieu de `[{a, b}]` — casserait l'interpolation segments
- ❌ Stocker `calib.transform` dans le retour de `getCalibration()` — le pattern actuel est rebuild on-demand via `buildTransform` (cf §32.7 piège ajouté)
- ❌ Coder un wake lock en parallèle dans un autre module — utiliser `WakeLock.acquire()` / `WakeLock.release()` qui gèrent re-acquire visibilitychange + persistance + sync UI
- ❌ Ajouter une sous-action critique (genre suppression destructive) sans `cssClass` rouge ET sans la mettre en fin de groupe — la cohérence visuelle "actions dangereuses = rouge + fin" est un guide UX

---

---

### 70. Recherche par coordonnées GPS + input combiné Maps cross-app (depuis hotfix18, refactor input combiné hotfix21 — 2026-05-27)

Sur les plans **géoréférencés** (= calibrage GPS configuré via ⚙️ Paramètres → 🌐 Géoréférencement), la barre de recherche unifiée Ctrl+K (§46) accepte des **coordonnées GPS au format Google Maps** (`48.680831, 2.158843`) et localise la position sur le plan.

En complément (hotfix21), les **3 modales de saisie de géoréférencement** ont leur ancien duo `lat / lng` (2 champs séparés) fusionné en un seul input combiné `GPS (lat, lng)`. Le format collable est identique à celui de Ctrl+K, donc copier-coller depuis Google Maps marche partout uniformément.

KARMA quote (hotfix18) :
> « si plan georef (si et uniquement si) en mode recherche, dans la meme mais on rajoute une petite description on peut entrée des coordonnée au format 48.680831, 2.158843 (dailleur adapte comme ca le georef coté parametre et KMZ/GPX export plus simple pour un user un copier coller depuis maps) si ces coordonnée ne corresponde a aucun point (marge d'errreur d'admetons 50px) ca nous, localise a l'endroit et ouvre un forumaire de creation de point »

KARMA quote (hotfix21) :
> « modifie l'interface parametre et kmz pour saisir les coordonée d'un coup comme on a fait pour recherche »

#### 70.1 Architecture (Sujet A + Sujet B)

**Sujet A — Recherche par GPS** (modale Ctrl+K) :
- `js/utils.js > parseGpsCoords(str)` détecte le format strict avec validation plage `[-90, 90] × [-180, 180]`
- `js/searchPoints.js > _renderResultats` : si parseGpsCoords match, bascule sur `_renderResultatsGps(query, gps)` qui orchestre la cascade :
  1. Plan calibré ? → sinon card orange "Calibrer ce plan"
  2. `KmzExport.buildTransform` + `gpsToPlan` (pattern §32.7 rebuild on-demand)
  3. Bounds check `[0..imgW × 0..imgH]` → sinon card rouge "Coordonnée hors plan"
  4. Cherche POI le plus proche dans rayon **50 px** :
     - POI trouvé → card verte avec bouton "🎯 Aller au point"
     - Sans POI → card bleue avec bouton "➕ Créer un point ici" → appelle `window.afficherFormulaire(x, y)` (= équivalent mode édition POI)

**Sujet B — Input combiné `lat, lng` (hotfix21)** :
- 1 seul input texte (au lieu de 2 inputs number lat + lng) dans les 3 modales de calibrage
- Accepte le format Google Maps natif `48.680831, 2.158843`
- Validation live (au blur) : border rouge + message inline `.kta-gps-coords-error` si format invalide
- Au submit/save : parse via `parseGpsCoords`, abort avec message d'erreur si invalide
- Pré-remplissage : `formatGpsCoords(lat, lng)` recompose `"lat, lng"` depuis les valeurs FLAT stockées (rétrocompat absolue — le format de stockage `pointA: {x, y, lat, lng}` n'a PAS changé)

> ℹ️ L'ancien helper `attacherGpsPasteSplit` (hotfix18, pour les duos 2-inputs lat/lng) a été **supprimé** lors du cleanup code mort (v1.26.2). Il était déprécié depuis hotfix21 (passage à l'input combiné) et n'avait plus aucun call site.

#### 70.2 API publique nouvelle

```js
window.parseGpsCoords(str)
  → { lat, lng } | null
  // Regex stricte + validation plage géographique
  // "48.680831, 2.158843" → {lat: 48.680831, lng: 2.158843}
  // "200, 2.15"           → null (lat hors plage)
  // "abc, 2.15"           → null

window.formatGpsCoords(lat, lng)               // 🆕 hotfix21
  → string
  // Inverse de parseGpsCoords. Retourne "lat, lng" formaté
  // ou "" si l'un des deux n'est pas un nombre fini.
  // formatGpsCoords(48.6, 2.1)   → "48.6, 2.1"
  // formatGpsCoords(null, 2.1)   → ""

window.attacherGpsValidationCombo(input, opts) // 🆕 hotfix21
  → { validate(), parse() }
  // opts = { errorEl: HTMLElement | null }
  // Attache validation live (input + blur) + retourne 2 méthodes :
  //   - validate() → true si vide ou valide ; sinon affiche erreur + return false
  //   - parse()    → {lat, lng} si valide non vide ; null sinon (sans toucher UI)
  // Idempotent (re-call no-op si déjà attaché via dataset.gpsComboAttached)
```

#### 70.3 Sites équipés (Sujet B — hotfix21)

| Module | Inputs (combiné) | Site d'appel | Validation au submit |
|---|---|---|---|
| `js/createConf.js` | `pl_geo_A_coords` + `pl_geo_B_coords` | `afficherPlanner` (mode nouveau) + `_preRemplirFormulaire` (mode modifier après restore) | `_readGeoCoords(id, errId, label)` parse + throw `"abort"` si format invalide |
| `js/sessionExporter.js` | `kmz_A_coords` + `kmz_B_coords` | `_bindKmzHandlers` + listeners "input" sur `_kmzRafraichirApercu` | `_kmzLireCalib` parse (silent fallback `{lat:null, lng:null}`) — l'aperçu et le buildTransform en aval détectent l'invalidité |
| `js/interface.js` | `cfg_kmz_A_coords` + `cfg_kmz_B_coords` (Settings KMZ paramétrage) | `_bindCfgGeorefHandlers` au début | `_readCoordsCombo(id, errId)` parse + abort silencieux si invalide (statut rouge inline) |
| `js/gpxIO.js` | — | **Skip** — GPX réutilise calib KMZ existante, pas de champs saisie propres |

Stockage interne **inchangé** : toujours FLAT `pointA: {x, y, lat, lng}` (cf. §32.5 KARMA "stored FLAT"). Seul l'affichage UI a changé.

#### 70.4 UI Cards GPS dans modale recherche

4 variantes CSS (`.kta-search-gps-card-warn`/`error`/`ok`/`create`) :

| Variant | Couleur | Cas |
|---|---|---|
| **warn** | orange | Plan non géoréférencé → bouton "⚙️ Calibrer ce plan" |
| **error** | rouge | Coords hors plan (`x > imgW` ou `y > imgH`) → message explicite + détails px |
| **ok** | vert | POI proche détecté (≤ 50 px) → card avec nom POI + distance + bouton "🎯 Aller" |
| **create** | bleu | Aucun POI dans 50 px → bouton "➕ Créer un point ici" |

Hint visible UNIQUEMENT si plan calibré :
```html
<div class="kta-search-gps-hint" id="kta-search-gps-hint" style="display:none;">
  🌐 Tu peux coller des coordonnées GPS au format
  <code>48.680831, 2.158843</code> (depuis Google Maps)...
</div>
```

Activation au boot de la modale via IIFE qui check `KmzExport.getCalibration(planId)`.

Placeholder input enrichi :
> "🔍 Point, tracé, zone, structure… ou GPS « 48.68, 2.15 »"

#### 70.5 Bouton "➕ Créer un point ici"

Quand aucun POI dans 50 px, le bouton :
1. Ferme la modale recherche (`_modal.remove()`)
2. Centre la carte via `map.setView([imageHeight - planY, planX], zoom, {animate: true})`
3. Appelle `window.afficherFormulaire(planX, planY)` (= mode édition POI standard d'`editor.js > afficherFormulaire`, ligne 130)

L'user a ainsi 3 saisies seulement après scan GPS d'une coord depuis Maps :
1. Ctrl+K
2. Coller `48.680831, 2.158843`
3. Clic "➕ Créer un point ici" → formulaire de saisie POI s'ouvre

#### 70.6 Rétrocompatibilité plans existants

- Si plan calibré avec ancien format → **rien à changer** (la détection lit `KmzExport.getCalibration` qui marche pareil)
- Si plan non calibré → bandeau orange explicite (au lieu de comportement silencieux)
- Si plan jamais ouvert → comportement texte standard (parseGpsCoords renvoie null si non-format-GPS)

Aucune migration nécessaire. Aucune modif du format `plan-config.json > plan.georef`.

#### 70.7 À NE PAS faire

- ❌ Étendre `parseGpsCoords` au format DMS (`48°40'51"N 2°09'31"E`) — KARMA a explicitement choisi le format décimal Maps natif. Le DMS demanderait une regex 10× plus complexe + cas d'erreur multiplexés
- ❌ Court-circuiter la validation plage géographique — `"200, 2.15"` doit retourner null, sinon faux positifs sur des IDs de points genre `"200, 2.15-zone"` du data layer
- ❌ Ouvrir le formulaire de création SANS centrer la carte d'abord — l'user doit voir où il crée le point (cohérent avec mode édition POI classique qui ouvre toujours le formulaire après un clic visible carte)
- ❌ Réutiliser le pattern QR ROLLBACK (= libs externes) pour ce sujet GPS — tout est natif (regex + buildTransform existant), zéro dep ajoutée
- ❌ Hard-coder le rayon 50 px ailleurs sans constante — actuellement `const _GPS_RADIUS_PX = 50;` dans searchPoints.js. Si on a besoin de le changer, juste 1 endroit

#### 70.8 Pour étendre

**Si on veut accepter des coords depuis d'autres formats** (DMS, UTM, MGRS, etc.) à terme :
1. Ajouter dans `parseGpsCoords` une cascade de regex pour tester chaque format avant le fallback `return null`
2. Convertir tous les formats en `{lat, lng}` décimal interne
3. Le reste du pipeline (cards GPS, search, etc.) reste inchangé

**Si on veut ajouter d'autres sites où coller le format Maps** (genre KML import de fond, GPX import, autre) — pattern hotfix21 :
1. Mettre **1 input texte combiné** dans le HTML avec `class="kta-cfg-input kta-kmz-input kta-gps-coords-input"` + `inputmode="decimal"` + `placeholder="48.8580, 2.2945"`
2. Mettre un `<div class="kta-gps-coords-error" id="…_err" style="display:none;"></div>` juste en dessous
3. Appeler `window.attacherGpsValidationCombo(input, { errorEl })` après création DOM (idempotent)
4. Au submit : appeler `combo.validate()` puis `combo.parse()` pour récupérer `{lat, lng}`
5. Au pré-remplissage : `input.value = window.formatGpsCoords(savedLat, savedLng)` (renvoie "" si valeurs absentes)

**Si on veut un mode "Naviguer en GPS continu"** (= flèche d'orientation comme Waze) :
- Pas faisable sans accès au GPS du device (Permissions-Policy + getCurrentPosition)
- Cohérent avec le contexte cataphile : pas de GPS souterrain de toute façon
- Ce sujet est **explicitement hors scope** MyKTAMap (cf §40 NetworkAudit + philo offline)

---

---

### 75. v1.27.0 — Position initiale tracker assistée + consolidation perf + conception nav (2026-05-29)

Release **mineure** (1.26.3 → 1.27.0). Trois volets.

#### 75.1 🧭 Position initiale du tracker — saisie assistée (feature user)

**Besoin KARMA** : « dans les paramètres en mode plan, pour la position initiale tracker, pouvoir la
sélectionner au clic, ou via un point (un peu comme géoref) ». Objectif : éviter la saisie manuelle de
`startX`/`startY`, gros gain de temps.

**Où** : `interface.js`, modale ⚙️ Configuration, section « 🧭 Position initiale du tracker » (juste avant la
géoréf). 2 boutons ajoutés sous les inputs `cfg_startX`/`cfg_startY` :
- **🔍 Choisir via un point** → `_cfgOuvrirRechercheStart()` : autocomplete POI via
  `SearchPoints.findByQuery`, le clic sur un résultat remplit X/Y.
- **📍 Cliquer sur la carte** → `_cfgActiverModeClicStart()` : masque la modale, floater
  `.kta-iti-floater`, `map.on("click")` remplit X/Y puis restaure la modale (bouton Annuler).

**Implémentation** : fonctions **parallèles** aux pickers géoréf (`_cfgActiverModeClicGeoref` /
`_cfgOuvrirRechercheGeoref`), ciblant `cfg_startX/Y` au lieu de `cfg_kmz_{letter}_x/y`. Choix délibéré :
**ne pas refactorer le code géoréf** (zéro régression sur une feature qui marche). `startX/Y` sont des
entiers (`parseInt` au save, l. ~3069-3070) → arrondi `Math.round`. Binding via
`_bindCfgTrackerStartHandlers()` appelé après `_bindCfgGeorefHandlers()`. Réutilise les classes CSS géoréf
(`.kta-kmz-pt-actions`, `.kta-kmz-search-results`, etc.).

> ⚠️ Dette assumée : duplication de ~2 fonctions avec les pickers géoréf. Candidat à mutualisation
> (`_cfgActiverModeClicCible(xId, yId, label)`) si une 3e cible apparaît.

#### 75.2 ⚡ Consolidation performance (déjà en hotfix v1.26.3-hotfix4)

Les 3 optimisations RAM livrées en hotfix sur main sont intégrées dans la mineure :
- **P0-1** (`historyManager.js`) — snapshots undo/redo **ciblés par catégorie** (`editorPoints`/`roads`/
  `zones`/`structures`) : `_captureState(category)` clone une seule pile, `_applyState` n'applique que les
  catégories présentes. Call sites : `road.js`, `editor.js`, `structures.js`, `zones.js`.
- **P0-2** (`tiling.js`) — **LRU des tuiles V2 décodées par niveau** (`blobAssetsByLevel` + `levelLRU` +
  `MAX_CACHED_LEVELS` 2/4), `_trimLevelsLRU` révoque les blob URLs au-delà du cap.
- **P0-3** (`road.js`) — **débounce des intersections pendant le dessin** : `_renderIntersections()` extrait
  dans un tableau séparé `intersectionLayers`, throttle trailing `_scheduleIntersectionRender` (~350 ms)
  quand `modeRoad` actif → plus de recompute O(N²×P²) + recréation de N cercles à chaque point. Logs du
  chemin chaud gated `debugMode`.

Cause racine du crash thermique terrain (couverture dense type GRS) : **densité du réseau**, pas durée de
session — chaque clic de point re-rendait tout l'univers. Cf. fil RAM (historyManager clones + tiling blobs).

#### 75.3 📐 Conception navigation intelligente (non implémenté)

Doc `docs/DESIGN_NAV_INTELLIGENTE.md` ajoutée : future nav qui calera la position estimée sur le réseau de
tracés (**map-matching**), en complément **réversible** du PDR + raster collision actuel (toggle `smartNav`,
défaut OFF). Découverte clé : le **graphe topologique existe déjà** dans `pathfinder.js > _buildGraph`
(nodes/edges/buckets + enrichissement aux croisements), construit à la volée → à rendre réutilisable/caché.
Décisions verrouillées : off-network **hybride**, magnétisme edit-time **inclus** (lot C5). Découpage C1→C6.
**Aucun code applicatif** à ce stade.

#### 75.4 Confidentialité

Aucune nouvelle surface réseau, aucune nouvelle permission. Le picking réutilise la recherche POI locale +
les clics carte existants (100 % offline). `connect-src` inchangé.

---

---

### 76. v1.28.0 — 🧭 Navigation Intelligente (map-matching) + tracé persistant + stats (2026-05-29)

Release **mineure**. Grosse évolution user : la nav intelligente compense l'imprécision des capteurs
(boussole/pas) sous terre. Conception complète : `docs/DESIGN_NAV_INTELLIGENTE.md`.

#### 76.1 Principe

Sous terre, pas de GPS satellite → le tracker fait du **dead-reckoning piéton (PDR)** : pas (accéléromètre)
+ cap (boussole), borné par un **raster de collision**. La dérive s'accumule. Quand le plan a un **réseau de
tracés**, la nav intelligente **cale la position sur la galerie la plus proche** (map-matching) → la dérive
latérale est annulée et on tourne correctement aux croisements. **Réversible** (toggle `smartNav`, défaut OFF).

#### 76.2 Découpage livré (C1→C4)

- **C1 — `js/roadGraph.js` (NEW)** : cache du graphe réseau. Plutôt que déplacer ~500 lignes du pathfinder
  (safety-critical, pas de runner de tests), `pathfinder.js` **expose** son moteur déjà éprouvé :
  `buildNetworkGraph(opts)` (build + enrichissement croisements de tout le réseau, sans avoidances) et
  `snapPointToGraph(graph, p)` (snap lecture seule). `RoadGraph` = cache avec **rebuild paresseux piloté par
  signature de contenu** (compte roads session + total points + compte embedded) — pas de timer ni de hook
  fragile. API : `getGraph / snap / matchPosition / invalidate / isReady / stats`.
- **C2 — toggle `smartNav`** : `APP_CONFIG.smartNav` (défaut OFF), persistance **GLOBALE** (`app_user_prefs`,
  comme `showRoadIntersections`). UI : ⚙️ Configuration > « 🧭 Navigation intelligente ». `tracking.js >
  avancer()` devient un **dispatcher** : le corps historique est extrait dans `_avancerRaster()` (inchangé),
  branche ON → `_avancerSurGraphe()`.
- **C3 — map-matching greedy** : `RoadGraph.matchPosition(rawX, rawY, prevSegIdx, headingDeg)`. Stickiness
  (hystérésis) pour éviter les sauts entre galeries parallèles + repli **off-network HYBRIDE** (retour PDR
  raster quand on s'éloigne du réseau, re-snapping au retour). Rayon = `max(25px, échelle × smartNavRadiusM)`,
  `smartNavRadiusM` réglable à chaud (défaut 6 m).
- **C4 — choix d'arête au cap** : la stickiness ne s'applique que MID-SEGMENT (`T_EDGE < t < 1-T_EDGE`) ;
  dès qu'on dépasse un nœud, on relâche → scan scoré `distance + désalignement_cap×poids − bonus_continuité`.
  Le **cap boussole** départage les branches d'un croisement (fix du « blocage aux intersections/virages »).
  Helpers `_bearingDeg` (même convention que le déplacement) + `_angleDiffMod180` (galerie non orientée).
  Paramètres terrain : `W_HEADING_PX_PER_DEG=0.7`, `STICKY_FACTOR=2.5`, `T_EDGE=0.02`.

> Reste à faire : **C5** magnétisme edit-time (accrochage aux tracés existants pendant le dessin) —
> lot séparé, il ne partage ni code ni moment ni risques avec C6. Voir design doc.

#### 76.4 C6 — multi-niveau (v1.74.0)

**La donnée était déjà là** : `Pathfinder.buildNetworkGraph` produit `segments[i].level` = entier pour une road, **`"transit"`** pour un segment de jonction interniveau. `matchPosition` ne le lisait simplement pas. Avant ce lot, sur un plan M-LVL : la position pouvait se caler sur une galerie d'un **autre étage superposé en x/y**, et franchir un puits ne basculait jamais le niveau actif.

**Éligibilité d'un candidat** — `roadGraph.js > _levelEligible(seg, mlOn, activeLevel, prevSeg)` :

| # | Règle | Pourquoi |
|---|---|---|
| 1 | `!mlOn` → tout éligible | `multiLevel` est un opt-in **par plan** — rétro-compat stricte quand il est off |
| 2 | `seg.level === "transit"` | c'est le pont vertical, toujours empruntable |
| 3 | `seg.level === activeLevel` | l'étage courant |
| 4 | `prevSeg.level === "transit"` → **tous** niveaux rouverts | **la règle clé** : sans elle le segment d'arrivée (niveau N ≠ actif) serait filtré et on resterait bloqué dans la jonction pour toujours |

Filtrage **STRICT**, pas pondéré : hors de ces cas un segment n'est pas candidat. Si l'étage courant est faux, on décroche franchement en off-network → repli PDR raster déjà en place. Mieux vaut décrocher que caler faux en silence.

**Bascule** — `tracking.js > _basculerNiveauSiTraversee(m)` : dès que `m.level` est un entier ≠ `activeLevel`, on vient de sortir d'une jonction → `window.ktaSetActiveLevel(m.level, {source:"nav-jonction"})` + toast `tracker.nav.niveauAuto`. Auto et non confirmé : en navigation les mains sont prises, une modale bloquante est ingérable. Le risque (un point créé ensuite hériterait du mauvais niveau via `editor.js`) est amorti par l'**union** de v1.74.0 — la bascule ne fait plus disparaître l'étage quitté, donc rien ne se perd à l'écran ; retour manuel = 1 tap sur le chip.

⚠️ **Pas de bouton Annuler dans le toast** : `OOMGuard.showToast(message, type)` n'accepte pas d'action. Y ajouter un bouton serait un lot à part.

**Portée** : `smartNav` est **OFF par défaut** (lot C2) → aucune régression possible pour qui ne l'a pas activé. Validé par harness Node (7 cas — 2 galeries superposées en x/y sur 2 niveaux + jonction : non-saut d'étage, sortie de jonction, refus hors traversée, rétro-compat M-LVL off).

#### 76.3 Fix connexe — déplacement en paysage

Bug pré-existant (depuis la correction d'orientation v172) révélé au test : l'icône tracker tournait selon le
cap VISUEL (`_getCorrectedHeading` = cap brut + angle écran) mais le **déplacement** utilisait le cap **brut**
→ en paysage le pas partait de travers. Fix : `_avancerRaster()` ET `_avancerSurGraphe()` utilisent
`_getCorrectedHeading()` pour le vecteur de déplacement. Corrige aussi le tracker historique (hors nav).

#### 76.4 Tracé persistant + stats

- **Tracé au reload** (`tracking.js > _rebuildTrailFromTimeline`) : SessionPersist sauvait la timeline mais ne
  redessinait pas le tracé. On reconstruit la polyline + repositionne le marqueur depuis la timeline restaurée
  (appelé en fin de `setTrackingTimeline`, qui tourne APRÈS `initTracking` — cf `main.js`). Seul le segment
  depuis la dernière ancre recalage/start est redessiné (cohérent avec le live, pas de ligne de téléportation).
- **Stats** (`statsGlobales.js`) : carte « 🧭 parcourus » = `getTrackingDistanceM()` (skip recalages) + nb de
  pas PDR.

#### 76.5 Confidentialité

Aucune nouvelle surface réseau, aucune nouvelle permission. Graphe construit en mémoire depuis les tracés,
map-matching = calcul géométrique pur, capteurs déjà utilisés par le tracker, tracé/stats depuis la timeline
locale. `connect-src` inchangé. Nouveau fichier `js/roadGraph.js` ajouté à `ASSETS_TO_CACHE`.

---

### 77. v1.49.0 — Améliorations terrain du tracker / PDR (2026-06-22)

Retour terrain (sortie 4h30). Lots A / B / C.

#### 77.1 « Ma position » + suspension du verrou (Lot A — `interface.js`)

Helpers module-scope (avant `initInterface`) + 2 sous-actions dans le flyout 🧭 Tracker :
- **🎯 Ma position** (`_centrerSurMaPosition`) : `map.setView(convertCoord(getTrackingPosition()), max(zoom, 0))`. Marche tracker à l'arrêt (position = init / dernière).
- **🔓 Suspendre le verrou** (`_gererSuspensionVerrou`) : si `smartNav !== true` → alerte info ; sinon popup durées (30 s / 1 min / 10 min / ∞). `_suspendreVerrou(ms)` met `APP_CONFIG.smartNav = false` (pris au pas suivant par `avancer()`), `setTimeout` de réactivation + `setInterval` du compte-à-rebours. `_reactiverVerrou` restaure `smartNav = true` (on ne suspend que si ON).
- **Compte-à-rebours dans la status bar** : `refonteInterface.js > _creerStatusBar` crée une stat cachée `#kta-refonte-stat-verrou` (à côté du 🧭 ON/OFF). `interface.js` la montre / cache / met à jour (val = `M:SS` ou `∞`). Clic → `_confirmerReactivationVerrou` (modale OUI / NON, feedback user).

#### 77.2 Démarrage sur la dernière position (Lot B — `tracking.js`)

`setTrackingTimeline` (restore SessionPersist + import session) : après `_rebuildTrailFromTimeline()` (qui replace déjà `position` + le marqueur sur le dernier point), on **recentre la vue** `map.setView(convertCoord(position), zoom)` **si la timeline est non vide**. Sans ça, la vue restait sur `initPosition` (fixée par `initTracking` l.62) alors que le marqueur était ailleurs → incohérence signalée terrain. **Fallback** : timeline vide → pas de recentrage (vue = initPosition). Scopé à `setTrackingTimeline` → le call `_rebuildTrailFromTimeline` de la décimation RAM (mid-session) n'est PAS impacté.

#### 77.3 Tolérances réglables + garde-fous (Lot C — `roadGraph.js`, `config.js`, `interfaceConfig.js`)

- **Réglables à chaud** : `APP_CONFIG.smartNavRadiusM` (tolérance latérale, m, défaut 6 — lu par `_matchRadiusPx`) + `APP_CONFIG.smartNavHeadingWeight` (poids du cap aux croisements, px/°, défaut 0.7 — nouveau helper `_headingWeight()` remplace la constante `W_HEADING_PX_PER_DEG` à l'usage ; 0 = cap ignoré, « passe » les jonctions même mal orienté). Dans `DEFAULT_CONFIG`, persistés / restaurés (`app_user_prefs`), pas de reload requis. UI : section « Verrou sur tracé » de ⚙️ Réglages.
- **Clamps** (`appliquerConfig`) : `stepLength` ∈ [0 ; 1.5] m · `stepThreshold` ∈ [10 ; 30] (magnitude `√(x²+y²+z²)` avec gravité ≈ 9.8 : sous ~10 = détection permanente, > ~30 = jamais déclenché) · `stepCooldown` ∈ [300 ; 3000] ms. Bornes `min/max` sur les inputs + clamp défensif à l'apply (`Number.isFinite` → fallback valeur courante).
- **Avertissements** ⚙️ Réglages → Navigation & Tracker : prérequis **échelle m/px** (bleu, en tête du groupe — position de départ, détection de pas et nav intelligente en dépendent) + « réglages experts » (ambre) sur Détection des pas et Verrou sur tracé.

#### 77.4 Confidentialité

Aucune nouvelle surface réseau ni permission. Tout local (état runtime + `app_user_prefs`). Aucun nouveau fichier JS.

---

---

## 🔄 Hook de recalage + recalage à l'arrivée d'un portail (v1.61.0)

**`_notifierRecalage(x, y, source)`** (`tracking.js`) : émis à CHAQUE recalage de position — clic carte mode recalage (`"click"`, handler `map.on("click")` d'`initTracking`) et `recalerTrackerSurPoint` (`"point"` — bouton « 📍 Je suis ici », arrivée de portail). Consommateur : `window._onTrackerRecale` (assigné par `interfaceItineraire.js` — replanification d'itinéraire + validation d'étapes, cf. `multilevel-pathfinding.md` §Itinéraire vivant). Émission best-effort (try/catch, no-op si non défini).

**Recalage portail** (`interPlanLinks.js > _consumePendingTarget`) : `goTo(planId, target, { recalerTracker: true })` — posé UNIQUEMENT par les traversées physiques (`naviguerVers` d'une liaison, « Prendre le portail » d'`interPlanRoute.js`), jamais par la recherche multi-plans / gestionnaire / retour (consultation ≠ déplacement). À la consommation de la cible : `recalerTrackerSurPoint(t.x, t.y, t.level)` **immédiat** — le restore de session tracker (`SessionPersist.onPlanLoaded` → `setTrackingTimeline` → `_rebuildTrailFromTimeline`) est **synchrone** dans `lancerApplication`, donc déjà passé (mesuré au bench : position recalée à t+415 ms, stable ≥ 10 s). Re-assertion +2.8 s seulement si `getTrackingPosition()` ≠ cible (ceinture — évite double vibration/ancre timeline dans le cas nominal).

**À NE PAS faire** :
- ❌ Différer le recalage portail « par prudence » (l'ancienne version +2.8 s laissait l'user croire que rien ne s'était passé — c'est un bug signalé KARMA).
- ❌ Poser `recalerTracker` sur un `goTo` de consultation (recherche, gestionnaire) — le tracker doit refléter le corps, pas la vue.
