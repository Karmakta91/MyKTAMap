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

`emergencyMode.js > _transformCalib` : clone exact du fix v1.21.1 #1 (transform jamais persisté). Avant : `calib.transform` cherché directement → toujours `undefined` → GPS jamais affiché. Après : transform construit à la demande (`buildTransformCalib`). Depuis le 03/10/2026, ce transform décide aussi si l'icône 📋 (bulle des coordonnées) existe — cf `secours.md` §52.0.

⚠️ **Critique sécurité** : les coordonnées GPS du mode urgence sont l'info principale pour qu'un utilisateur perdu puisse communiquer sa position à des secours externes (Google Maps, GPS standalone, etc.). Le bug le rendait inutilisable.

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

Sur les plans **géoréférencés** (= calibrage GPS configuré via ⚙️ Paramètres → 🌐 Géoréférencement), la barre de recherche unifiée Ctrl+K (§46) accepte des **coordonnées GPS au format Google Maps** (`48.856600, 2.352200`) et localise la position sur le plan.

En complément (hotfix21), les **3 modales de saisie de géoréférencement** ont leur ancien duo `lat / lng` (2 champs séparés) fusionné en un seul input combiné `GPS (lat, lng)`. Le format collable est identique à celui de Ctrl+K, donc copier-coller depuis Google Maps marche partout uniformément.

KARMA quote (hotfix18) :
> « si plan georef (si et uniquement si) en mode recherche, dans la meme mais on rajoute une petite description on peut entrée des coordonnée au format 48.856600, 2.352200 (dailleur adapte comme ca le georef coté parametre et KMZ/GPX export plus simple pour un user un copier coller depuis maps) si ces coordonnée ne corresponde a aucun point (marge d'errreur d'admetons 50px) ca nous, localise a l'endroit et ouvre un forumaire de creation de point »

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
- Accepte le format Google Maps natif `48.856600, 2.352200`
- Validation live (au blur) : border rouge + message inline `.kta-gps-coords-error` si format invalide
- Au submit/save : parse via `parseGpsCoords`, abort avec message d'erreur si invalide
- Pré-remplissage : `formatGpsCoords(lat, lng)` recompose `"lat, lng"` depuis les valeurs FLAT stockées (rétrocompat absolue — le format de stockage `pointA: {x, y, lat, lng}` n'a PAS changé)

> ℹ️ L'ancien helper `attacherGpsPasteSplit` (hotfix18, pour les duos 2-inputs lat/lng) a été **supprimé** lors du cleanup code mort (v1.26.2). Il était déprécié depuis hotfix21 (passage à l'input combiné) et n'avait plus aucun call site.

#### 70.2 API publique nouvelle

```js
window.parseGpsCoords(str)
  → { lat, lng } | null
  // Regex stricte + validation plage géographique
  // "48.856600, 2.352200" → {lat: 48.8566, lng: 2.3522}
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
  <code>48.856600, 2.352200</code> (depuis Google Maps)...
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
2. Coller `48.856600, 2.352200`
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

Doc `docs/DESIGN_NAV_INTELLIGENTE.md` (archivé : tag Git `archive-docs-2026-09-30`) ajoutée : future nav qui calera la position estimée sur le réseau de
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
(boussole/pas) sous terre. Conception complète : `docs/DESIGN_NAV_INTELLIGENTE.md` (archivé : tag Git `archive-docs-2026-09-30`).

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

> ✅ **C5 et C6 livrés en v1.74.0** — l'initiative `smartNav` est complète (§76.5 et §76.6, en fin de §76).

#### 76.5 C6 — multi-niveau (v1.74.0)

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

#### 76.6 C5 — magnétisme edit-time (v1.74.0)

**Ce n'est pas une feature de navigation, c'est une feature de DESSIN** — d'où le fait qu'elle ne partage rien avec C6 malgré la numérotation commune. Elle traite la **cause** dont C3/C4 traitent l'effet : un graphe propre au départ, plutôt qu'un calage rattrapé après coup.

**Le défaut corrigé** : deux galeries qui se rejoignent à l'œil atterrissent à 5-10 px l'une de l'autre → **deux nœuds distincts** dans le graphe là où il devrait y en avoir un. Le Pathfinder compense en aveugle (`PROXIMITY_TOLERANCE = 15` px, `pathfinder.js`) ; au-delà, la connexion **n'existe pas** et un itinéraire refuse de passer par une galerie visiblement reliée.

**Implémentation** — `road.js > _snapSurSommetProche(x, y)`, appelée dans `map.on("mousedown")` juste après le calcul de `x/y` et **avant** la capture undo (elle ne mute rien, elle change la valeur qui sera poussée → undo/redo inchangé).

| Décision | Choix | Pourquoi |
|---|---|---|
| Cible | **sommets de roads**, pas les nœuds `RoadGraph` | chaque clic change la signature du cache → `getGraph()` reconstruirait **tout le réseau à chaque point posé**. Un scan O(N) des sommets est bien moins cher et sémantiquement équivalent (un nœud EST un sommet, au spatial-merge près) |
| Rayon | **pixels ÉCRAN** convertis en unités plan au clic (via `map.latLngToLayerPoint` sur le centre) | un rayon fixe en unités plan serait imperceptible au dézoom et absurdement large au zoom. Règle : « si c'est proche à l'œil, ça s'accroche », à tous les zooms |
| Feedback | **flash doré 700 ms APRÈS** l'accrochage | le survol prédictif de l'esquisse n'existe pas au doigt, et un scan à chaque `mousemove` coûterait cher sur réseau dense |
| Toggle | **indépendant** de `smartNav`, défaut OFF | le magnétisme améliore le graphe → il sert au Pathfinder même nav intelligente OFF. Rangé dans la même section de ⚙️ Réglages, mais sans dépendance |

**4 invariants** (tous couverts par harness) :
- Le **dernier** point de la road en cours est exclu — sinon un clic voisin du précédent s'y collerait et on ne pourrait plus tracer court. Les points **antérieurs** restent éligibles → **fermer une boucle sur son propre départ marche**.
- Multi-niveau : on n'accroche que sur le niveau actif, **sauf les `jonction`** (leurs extrémités existent pour relier des niveaux). Sans ça on se collerait à une galerie d'un autre étage superposée en x/y — le défaut même que corrige C6.
- `itinerary` **jamais** accrochable (calculé, pas cartographié).
- Les roads **embedded** (calques de données) SONT accrochables — c'est le cas d'usage « je relie ma galerie au réseau existant ».

⚠️ **Aucun bénéfice rétroactif** : n'améliore que ce qui est dessiné **après activation**. Les plans existants gardent leur jitter, `PROXIMITY_TOLERANCE` reste indispensable — C5 ne le remplace pas.

⚠️ **Zone sensible** : contrairement à C6 (toggle OFF + opt-in par plan), C5 touche `road.js > mousedown`, le geste utilisé à chaque session. D'où le défaut OFF. Le flash est purgé au plan switch (`window.ktaPurgerFlashSnap()` appelé par `_libererRessourcesPlanPrecedent`) — sinon un `circleMarker` orphelin survivrait sur la carte détruite.

Validé par harness Node (12 cas). ⚠️ Le harness **réimplémente la règle** (road.js est trop couplé à Leaflet pour tourner en Node) : il valide la logique d'éligibilité, **pas** le câblage réel dans le handler.

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

- **Réglables à chaud** : `APP_CONFIG.smartNavRadiusM` (tolérance latérale, m, défaut 6 — lu par `_matchRadiusPx`) + `APP_CONFIG.smartNavHeadingWeight` (poids du cap aux croisements, px/°, défaut 0.7 — nouveau helper `_headingWeight()` remplace la constante `W_HEADING_PX_PER_DEG` à l'usage ; 0 = cap ignoré, « passe » les jonctions même mal orienté). Défauts dans `DEFAULT_CONFIG`, mais **persistés PAR PLAN** depuis la v1.85.3 (`setPlanSmartNav` → `myktamap_plan_prefs_<planId>` ; la valeur globale `app_user_prefs` ne sert plus que de repli de migration), pas de reload requis. UI : groupe « 📍 Navigation & tracker » → « 🧭 Navigation intelligente » de ⚙️ Réglages, appliqué à la saisie depuis la v1.92.0.
- **Clamps** (`_cfgValider`, à la saisie — plus de bouton Appliquer depuis v1.92.0) : `stepLength` ∈ [0 ; 1.5] m · `stepThreshold` ∈ [10 ; 30] (magnitude `√(x²+y²+z²)` avec gravité ≈ 9.8 : sous ~10 = détection permanente, > ~30 = jamais déclenché) · `stepCooldown` ∈ [300 ; 3000] ms. Bornes `min/max` sur les inputs + clamp défensif à l'apply (`Number.isFinite` → fallback valeur courante).
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

---

## 📏 Distance estimée entre ancres (2026-08-16)

**Le manque** (sortie réelle de KARMA perdue par le Carnet) : `getTrackingDistanceM()` ne mesure QUE le podomètre — tout segment touchant un `recalage` est sauté, et c'est **sain** (un recalage peut être une téléportation ou une correction). Conséquence : une sortie menée au « 📍 Je suis ici » de point en point, sans PDR, valait **0 m**, et le Carnet la jetait sous ses seuils.

**La règle — on comble UNIQUEMENT le silence du podomètre** :

| Situation | Traitement |
|---|---|
| ancre A → ancre C, **aucun pas PDR** entre les deux | A→C est **estimée** |
| ancre A → … pas PDR … → ancre C | **rien** — le podomètre a mesuré, jamais de double comptage |

Le test est structurel, pas heuristique : on regarde si l'entrée qui **précède immédiatement** l'ancre est elle-même une ancre (`recalage`/`start`). Si oui, aucun pas n'a été enregistré entre les deux.

**La mesure (décision KARMA, « hybride »)** : longueur du **chemin réel sur le réseau** (`Pathfinder`, unités plan → `/ APP_CONFIG.scale`). À vol d'oiseau, 40 m dans un labyrinthe peuvent valoir 300 m réels — une estimation euclidienne serait systématiquement et silencieusement optimiste. **Repli vol d'oiseau** si un bout n'accroche pas le réseau (Dijkstra sans chemin).

### ⚡ Chemin chaud / 🐢 chemin froid (révisé le 17/08/2026)

**Le premier jet calculait le réseau AU CLIC — inutilisable en pratique** (retour terrain KARMA : « si je clique sur je suis ici, c'est long, et ensuite j'ai un truc qui me propose de recalculer l'itinéraire tout aussi long »). Cause : [`pathfinder.js:773`](../../js/pathfinder.js#L773) — `computeRoute` appelle `_buildGraph` **à chaque appel, sans aucun cache**, suivi de l'enrichissement des croisements en **O(N²)**. Chaque « 📍 Je suis ici » payait donc **deux** reconstructions complètes du graphe : la mienne, puis celle de la replanification d'itinéraire.

| | Quand | Ce qui se passe |
|---|---|---|
| ⚡ **chaud** | au clic « 📍 Je suis ici » | `_estimerSegmentDepuisAncre` — **vol d'oiseau seul, zéro calcul de réseau**. Instantané. |
| 🐢 **froid** | à l'archivage de la sortie (`journal.js > _affinerDistances`) | `affinerEstimationsTracker(roads)` — repasse les tronçons en distance réseau. |

**Trois choses rendent le chemin froid sûr** :
1. **`roads` est FOURNI par l'appelant** (`computeRouteOnRoads`, v1.60.0) et jamais lu depuis l'état courant : l'affinage tourne au moment où on quitte le plan, et lire `getRoads()` à cet instant calculerait sur le **plan suivant**.
2. **Un seul appel par « run »** d'ancres consécutives — `computeRouteOnRoads` accepte une chaîne de waypoints et ne construit son graphe **qu'une fois** pour toute la chaîne. Une sortie de navigation pure = 1 run = 1 construction, au lieu d'une par clic. ⚠️ La séparation des runs est gardée **deux fois** (`courant.fin === i - 1` **et** `else courant = null`) : casser l'une seule ne change rien, il faut les deux pour observer une régression — vérifié en falsifiant.
3. **Budget `MAX_PTS_AFFINAGE = 20000`** sommets : au-delà, aucun calcul, le vol d'oiseau est conservé. Mieux vaut une distance basse qu'une app figée.

⚠️ **La distance réseau du run est répartie sur ses tronçons au prorata de leur vol d'oiseau** — `computeRouteOnRoads` ne rend qu'un total. La **somme** est donc exacte (c'est elle qui compte pour le carnet et ses seuils), le détail par ancre est une approximation assumée.

⚠️ **L'affinage passe AVANT le test de pertinence** du Carnet (`_finaliser` → `_affinerDistances` → `_pertinente`). Juger une sortie sur sa ligne droite puis la jeter reproduirait exactement le défaut que ce lot corrige : 45 m à vol d'oiseau peuvent valoir 200 m de galeries.

⚠️ **Effet visible assumé** : pendant la sortie, le chiffre affiché est la **ligne droite** (sous-estimé) ; il monte à la clôture. Documenté côté user.

**Ce qui n'est PAS réglé** : la replanification d'itinéraire reste lente, pour la même cause (`_buildGraph` non caché). Elle est **antérieure** à ce lot — la confirmation `ktaConfirm` de la v1.76.3 existe précisément parce que ce calcul est long. Le vrai correctif serait un **cache de graphe dans `pathfinder.js`**, qui profiterait aussi au Mode Secours et à la sortie d'urgence : lot séparé, non fait.

**Jamais cumulé** :
- `src: "click"` — le clic carte libre corrige le plus souvent une position fausse, il ne raconte pas un trajet ;
- `tp: 1` — arrivée de portail. `interPlanLinks` passe désormais `recalerTrackerSurPoint(x, y, level, { teleport: true })`. **La source reste `"point"`** pour ne rien changer aux consommateurs du hook (la validation d'étape d'itinéraire sur arrivée de portail continue de fonctionner).

**Où vit la valeur** : sur l'ancre elle-même (`estM` + `estSrc: "reseau"|"vol"`). Elle voyage donc avec la timeline persistée, survit au rechargement du plan, et la décimation ne peut pas la perdre — `_decimateTimeline` conserve **toutes** les ancres, seuls les PDR sont sacrifiés.

### 🧭 Bouton « Affiner le tracé » + tracé reconstruit (17/08/2026)

`computeRouteOnRoads` rend `{ path, totalDistance }` — la **géométrie était calculée puis jetée**. Elle sert désormais à reconstruire le tracé de la sortie : chaque tronçon comblé est remplacé par le chemin de galeries (`_construireTraceAffinee`), les points **PDR réellement enregistrés** étant conservés tels quels.

🚨 **C'est une HYPOTHÈSE, pas une mesure.** Entre deux « 📍 Je suis ici », le Dijkstra prend le plus court : un détour, une diverticule explorée puis abandonnée, un demi-tour n'y figureront **jamais**. D'où la règle arrêtée avec KARMA (décision `4:b`) :

| Consommateur | Tracé servi |
|---|---|
| Fiche du carnet | **reconstruit** (`trackAffine`), avec mention explicite sous le dessin |
| Exports GPX / KMZ · heatmap · replay tracker | **brut uniquement** — jamais de donnée inventée présentée comme relevée |

`track` (brut) n'est **jamais écrasé** : `trackAffine` vit à côté, décimé au même plafond `MAX_TRACK_PTS` (un chemin de galeries est bien plus dense qu'une timeline d'ancres, sans plafond une sortie pèserait plusieurs fois le budget annoncé de 2-8 Ko).

**Le bouton** (`refonteInterface.js`, modale Session) : `Journal.affinerEnCours(opts)` affine **sans clôturer**. Grisé — et non masqué — quand `getTrackingTronconsAAffiner() === 0`. Sur un plan au-dessus du budget, le premier appel revient **immédiatement** avec `skipped: "trop-gros"` + `nbPts` (aucun calcul gaspillé) ; l'UI demande alors confirmation et rappelle avec `force: true`. Le budget protège l'archivage **automatique**, il n'a pas à interdire un calcul que l'user réclame en connaissance de cause — et c'est sur les gros plans qu'il en a le plus besoin.

**Pièges traités** :
- `EST_RATIO_MAX = 30` : un chemin réseau > 30× le vol d'oiseau trahit un artefact de graphe (détour par une galerie mal reliée), pas un labyrinthe → vol d'oiseau conservé. Sous-estimer vaut mieux qu'inventer 2 km.
- **Idempotence** : seuls les tronçons `estSrc === "vol"` sont affinés — une seconde passe ne recalcule rien.
- Un `computeRouteOnRoads` qui **jette** (bouts hors réseau, aucune road) laisse le vol d'oiseau en place : l'affinage ne peut jamais dégrader une valeur déjà posée.

**API** : `getTrackingDistanceEstimeeM()` · `getTrackingDistanceTotaleM()` (= mesurée + estimée) · `getTrackingValidations()` (nombre de « 📍 Je suis ici », hors clics et portails — signal de terrain pour le Carnet).

⚠️ **`getTrackingDistanceM()` est volontairement INCHANGÉE** : mesuré et estimé ne se valent pas. Les consommateurs affichent le **total** en nommant la part estimée (modale Tracker, 📊 Stats globales, fiche du Carnet) ; `trackerReplay` reste sur la mesurée (il rejoue le tracé PDR, pas un trajet reconstruit).

---

## 👣 Les réglages de podomètre : une seule source, et pourquoi le seuil ne se choisit pas (v1.82.0)

`tracking.js` détecte un pas ainsi :

```js
const acc = event.accelerationIncludingGravity;      // ⚠️ AVEC la gravité
let magnitude = Math.sqrt(acc.x² + acc.y² + acc.z²);
if (magnitude > APP_CONFIG.stepThreshold && (now - lastStepTime) > APP_CONFIG.stepCooldown) { … }
```

🩸 **`accelerationIncludingGravity` vaut déjà ~9,81 téléphone posé à plat.** Le
seuil n'est donc pas « une sensibilité » qu'on règle au goût : toute valeur
sous ~9,8 rend la condition **vraie en permanence**, et seul le cooldown limite
encore le comptage.

| Source | `stepLength` | `stepThreshold` | `stepCooldown` |
|---|---|---|---|
| **Usine** (`config.js > DEFAULT_CONFIG`) | 0.7 | **13** | **400** |
| Générateur classique (`createConf.js`) | 0.7 | 13 | 400 |
| ⚙️ Réglages — bornes de saisie | [0, 1.5] | **[10, 30]** | **[300, 3000]** |
| ❌ `sigImport` / `gpxImport` / `kmzImport` **avant v1.82.0** | 0.75 | **1.2** | **280** |

Les trois générateurs d'import portaient la même triplette, par copier-coller.
Conséquence, **à l'arrêt complet** : un pas toutes les 280 ms ≈ 3,6 pas/s, à
0,75 m le pas ≈ **2,7 m/s, soit près de 10 km/h de distance fantôme** — sur tout
plan issu d'un import, et donc dans le Carnet, les statistiques et l'historique.
Signalé par KARMA sur l'écran SIG.

### Source unique

`window.KTA_TRACKING_USINE` — copie **gelée** prise dans `config.js` avant toute
mutation. ⚠️ `DEFAULT_CONFIG` porte mal son nom : il est réécrit à chaque
chargement de plan pour que `resetConfig()` rende les valeurs *du plan courant*.
Le lire depuis un générateur donnerait les réglages du plan ouvert à ce
moment-là. Les générateurs écrivent donc :

```js
...(window.KTA_TRACKING_USINE || { stepLength: 0.7, stepThreshold: 13, stepCooldown: 400 })
```

🛡️ `scripts/check-tracking-defaults.js` (bloquant) confronte tout littéral de
ces trois clés à `config.js`. Il couvre trois formes — littéral d'objet, valeur
par défaut d'un champ de saisie, repli `??` — les trois falsifiées. C'est lui
qui a trouvé la **troisième** copie (`kmzImport.js`), passée inaperçue.

### Réparation des plans déjà produits

Corriger les générateurs ne répare pas les plans **déjà générés** : leur
plan-config porte la mauvaise valeur. `config.js > _reglagePodometre` la
remplace au chargement, sur un critère qui n'est pas une opinion : **l'écran
⚙️ Réglages borne lui-même ces champs**. Une valeur hors bornes ne peut donc pas
être un choix de l'utilisateur — l'app ne lui permet pas de la saisir. C'est de
la donnée corrompue, et elle repart à l'usine, avec un `console.warn`.

Même raisonnement que le calibrage périmé (`main.js`) : on ne touche jamais une
préférence valide, seulement ce qui est hors du possible.

### 👣 Persistance des réglages — le défaut à trois occurrences (v1.82.0)

Un réglage modifié dans ⚙️ Réglages était écrit dans `APP_CONFIG` **en mémoire**.
`sauvegarderPrefsUtilisateur` ne le sauvait pas, et `buildAppConfigFromPlan` le
réécrivait depuis le plan-config au chargement suivant. La valeur tenait
jusqu'au reload, puis retombait — **sans rien dire**.

| Version | Réglage perdu | Résolution |
|---|---|---|
| v1.75.0 | magnétisme (`snapDraw`) | pref **globale** |
| v1.76.1 | échelle (`scale`) | pref **per-plan** (`setPlanScale`) |
| **v1.82.0** | `stepLength`, `stepThreshold`, `stepCooldown`, `startX`, `startY` | pref **per-plan** (`setPlanTracking`) |
| **v1.96.0** | `stepLength`, `stepThreshold`, `stepCooldown` | pref **GLOBALE** (`setGlobalPodometre` → `app_user_prefs`) — décision KARMA 17/09/2026 : « ces réglages ne sont pas liés au plan ». Le plan-config ne les porte plus (Générateur, KMZ, GPX, SIG) et le chargeur les **ignore** s'ils sont présents ; la réparation v1.82.0 des valeurs impossibles n'a plus d'objet. Migration : la pref par plan du premier plan rouvert est promue en globale une fois, puis retirée des prefs du plan. `startX`/`startY` restent par plan. Garde-fou `check-podometre-global.js` (config.js exécuté en bac à sable). |

Signalé par KARMA : « je modifie ces valeurs et applique, quand je quitte et
reviens elles sont revenues par défaut ».

**Per-plan, comme l'échelle** : un podomètre se règle sur la foulée de
l'utilisateur *et* sur le terrain du plan. Le stocker globalement contaminerait
tous les autres plans.

**Un réglage per-plan a besoin de DEUX choses**, et l'oubli de l'une ou de
l'autre produit exactement le même symptôme muet :

1. un **écrivain** `setPlanX(planId, …)`, appelé par l'écran ⚙️ Réglages ;
2. un **applicateur** `appliquerXPerPlan()`, appelé par `main.js` **une fois
   l'id du plan connu** — ⚠️ jamais depuis `buildAppConfigFromPlan`, où l'on
   lirait les prefs du plan **précédent**.

Refus **sec** hors bornes, pas de clamp (même règle que `setPlanScale`) : une
valeur hors bornes est un bug d'appelant, la corriger en silence le masquerait.
Les bornes sont celles de l'écran de saisie.

🛡️ `check-prefs-survival.js` couvre désormais les deux moitiés : pour chaque
`appliquerXPerPlan` déclaré, il exige l'exposition, l'appel dans `main.js`,
l'existence de l'écrivain et son appel depuis l'écran de réglages — plus la
transmission effective des trois clés du podomètre. Les trois oublis possibles
ont été falsifiés un par un.

## 📍 Position confirmée & permission capteurs — règle « instant T » (13/09/2026)

Issu de l'audit ergonomie (`docs/audits/2026-09-13_audit-ergonomie-v1.md` (archivé : tag Git `archive-docs-2026-09-30`), bloquants B1 et B2), décision KARMA :
*« le bouton sortie d'urgence doit prendre la position à l'instant T, bien sûr »*.

### Le trou

`getTrackingPosition()` renvoie **toujours** un objet : `position` est initialisée au départ du plan
(`APP_CONFIG.startX/startY`) par `initTracking()`. Rien ne distinguait « l'utilisateur s'est situé » de
« valeur par défaut ». Conséquences : `sortieUrgence.js > declencher()`, `interfaceItineraire.js >
itineraireYAller()` et `emergencyMode.js` partaient de l'**entrée du plan** en la présentant comme la
position de l'utilisateur, et la branche « pas de tracker → clique ta position » de la sortie d'urgence était
**inatteignable** (et, ranimée telle quelle, finissait en cul-de-sac : « Tracer » re-testait le tracker).

### Le drapeau

`tracking.js` : `_positionConfirmee` (bool) + `_positionConfirmeeTs` (ms), posés par `_marquerPositionConfirmee()`.

| Événement | Effet |
|---|---|
| clic carte en mode recalage · `recalerTrackerSurPoint` (« 📍 Je suis ici », arrivée de portail, reprise carnet, picker « Où es-tu ? ») | `confirmee = true`, `ts = now` |
| pas appliqué (`_stepApplied`) | `ts = now` si déjà confirmée — « il y a N min » = depuis le **dernier mouvement connu**, pas depuis le dernier recalage |
| `initTracking()` (chargement d'un plan) · `resetTrackingPosition()` (Reset des Réglages) | `confirmee = false` |
| `_rebuildTrailFromTimeline()` (session restaurée) | `confirmee = true` **si** la timeline contient une entrée `type === "recalage"`, `ts` = `t` du dernier point |

Lecture : `window.getTrackingPositionEtat()` → `{ confirmee, ts, suiviActif }`.

### La règle, côté consommateurs

- **Suivi actif OU confirmée → position du tracker à l'instant T, zéro question.** Pas de seuil de fraîcheur (décision KARMA « b : pas de seuil ») : l'écart s'affiche, l'utilisateur juge.
- **Jamais confirmée → picker partagé** `utils.js > ktaDemanderPositionCarte(onPick, {icone, texte, recaler, onCancel})`. Floater `.kta-iti-floater` (donc reconnu par `_modeClicCarteActif()` : pas de popup parasite, clic ré-émis en capture par `map.js`, **le tap porte même sur un marqueur**), les autres modes clic-carte sont éteints avant d'armer (`window._desactiverTousLesModes`, exposé par `interface.js` à cette occasion). **Le tap recale le tracker** (`recalerTrackerSurPoint`) — donc confirme la position — puis rend la main.
- `sortieUrgence.js` : `_lancer(origine, meta)` garde `meta.mode` (`suivi` / `confirmee` / `clic`) + `ts` pour la ligne d'état de la modale ; `_tracerIndex` passe `{ origine }` à `itineraireYAller`.
- `itineraireYAller(x, y, nom, opts)` : `opts.origine` impose l'origine ; sans elle, même règle (picker si jamais confirmée).
- `emergencyMode.js` (afficheur, pas de picker) : statut « position par défaut — jamais confirmée » dans la bulle 📋 des coordonnées ; sa bulle de point propose « 📍 Je suis ici » (`recalerTrackerSurPoint`), qui confirme la position.

🪤 **Piège** : tout nouveau chemin qui écrit `position` sans passer par le clic recalage ni `recalerTrackerSurPoint`
doit appeler `_marquerPositionConfirmee()`, sinon le picker s'ouvrira alors que l'utilisateur s'est situé.
Les 4 points d'écriture actuels sont listés dans le tableau ci-dessus.

### Permission capteurs (B2)

`requestPermission()` rend une **`Promise<boolean>`** : `true` si les écouteurs sont attachés (ou si la
plateforme n'exige pas de permission), `false` sur refus **ou** rejet (hors geste utilisateur, demande déjà
tranchée). Avant : seule la branche `granted` existait, et `interface.js > _doStart` appelait `startTracking()`
sans attendre — sur iOS, un refus laissait la pastille ON et zéro pas à jamais. Désormais `_doStart` attend ;
sur `false` : rien n'est activé, modale chartée `ui.trackerWarn.refusTitre/refusTexte` (chemin de réactivation
iOS). `compass.js > show()` affiche un toast (`compass.toast.capteursRefuses`) au lieu d'un « N 0° » muet.
La commande vocale « démarre le tracker » appelle encore `startTracking()` directement (sans permission ni
avertissement) — constat M5 de l'audit, hors lot 1.

⚠️ **Non reproductible au harnais** : le refus iOS demande un appareil. À valider sur iPhone avant release.

🛡️ **Garde-fou** : `scripts/check-position-confirmee.js` (pré-commit bloquant) vérifie les points d'écriture du drapeau, les deux remises à zéro, la règle dans `declencher()` et `itineraireYAller`, la transmission de l'origine par « Tracer », la Promise de `requestPermission` attendue par `_doStart`, la classe commune du floater et les clés i18n ×3. Falsifié 4× sur une copie mutée (`node scripts/check-position-confirmee.js <racine>`).

---

### 🧭 Mode « plan orienté » — la carte tourne, pas l'icône (`js/mapBearing.js`, v1.97.0)

Pendant le tracking, au lieu de faire pivoter l'icône du tracker dans un plan fixe, on fait pivoter **toute la vue** pour que la direction de marche pointe vers le haut de l'écran (convention GPS auto, dite *heading-up*). **OFF par défaut**, activable par la tuile 🗺️ de la modale 🧭 Tracker, persisté dans `localStorage["myktamap_map_bearing_v1"]` (préférence d'appareil, pas de plan → rien à déclarer dans `config.js`).

#### 🩸 Le piège qui a coûté la première implémentation

Poser la rotation sur `.leaflet-map-pane` **semble marcher** — tant que la carte n'a jamais été panée. Mesuré au prototype : **414 px d'erreur à 30°, 918 px à 45°** dès que le pane porte un `translate3d` non nul.

**Cause** : les propriétés CSS individuelles (`rotate`) s'appliquent **avant** `transform` (ordre spec : translate → rotate → scale → transform). Sur un élément que Leaflet positionne en `translate3d`, la rotation fait pivoter **le vecteur de translation lui-même**.

**La parade** : un **pane intercalaire** `.kta-rotate-pane`, inséré entre le map-pane et ses enfants. Il ne porte aucun transform de Leaflet, donc sa rotation est pure. Mesuré : **0,00 px** d'écart sur 6 angles, après pan **et** après zoom animé. (C'est la structure qu'utilise aussi le plugin `leaflet-rotate` — on y arrive par le même chemin, sans patcher le cœur de Leaflet.)

⚠️ **Le même piège vaut pour toute contre-rotation** : elle se pose sur un **enfant**, jamais sur `.leaflet-marker-icon` ni `.leaflet-popup`. Forcer `transform-origin: 50% 50%` **ne suffit pas** (436 px de dérive mesurés) — c'est exactement la leçon de l'icône tracker en v158 → `divIcon` en v159 (cf §28).

⚠️ **`transform-origin` est exprimé en layerPoint** : il dérive à chaque pan/zoom (53 px d'erreur après un simple pan). D'où la réapplication branchée sur `move`/`zoom`, avec la garde portée **par la map** (`map._ktaBearingHooked`), jamais par `window` — la carte est remplacée à chaque plan chargé (cf `scripts/check-map-listeners.js`).

#### Ce qui tourne, ce qui reste droit

| Tourne | Reste droit |
|---|---|
| fond de plan, tuiles, tracés/zones/structures (canvas), **icônes POI** (décision KARMA), heatmap, calques calibrés | contrôles Leaflet (ils vivent hors du map-pane → **gratuit**), labels de mesure, contenu des popups (contre-rotation CSS via `--kta-bearing`) |

**L'icône du tracker se règle toute seule** : elle porte déjà `rotate(+cap)` (§28) et la vue tourne de `-cap` → somme nulle, elle pointe vers le haut de l'écran, c'est-à-dire la direction de marche. Rien à neutraliser.

#### Réglages du cap — pourquoi ils diffèrent de ceux de l'icône

| | Icône tracker (§28) | Vue entière |
|---|---|---|
| Lissage | α = 0,25 | **α = 0,12** |
| Seuil en marche | 2° | **2°** |
| Seuil à l'arrêt | — | **15°** |
| Vitesse | — | **90 °/s** (plafond) |

Une icône de 30 px qui frémit se tolère ; un plan entier qui frémit donne la nausée — d'où le lissage plus mou et le plafond de vitesse.

🩸 **Le gel à l'arrêt a été supprimé (retour terrain KARMA, 24/09/2026).** La v1 figeait la vue après 2,5 s sans pas détecté, pour empêcher le magnétomètre de la faire pivoter pendant une pause. Reproduit au harnais : en **tournant sur place sans avancer**, la vue restait bloquée **6,3 secondes** pendant que le cap faisait 140° ; avec des pas mal détectés, des gels de 1,8 s. Vu de l'utilisateur : « ça tourne, ça bugue et ça s'arrête, puis ça reprend ».

Le défaut était de conception, pas d'implémentation : **on s'arrête précisément pour se réorienter** — c'est le moment où la rotation est la plus utile. À la place, deux seuils : on suit **toujours**, mais il faut une intention claire (15°) quand aucun pas n'a été détecté depuis 2,5 s. Mesuré : une rotation sur place de 90° est suivie à 7° près, et un magnétomètre bruité à ±8° ne fait pas bouger la vue d'un degré. Conséquence acceptée : à l'arrêt, la vue ne rejoint le cap qu'à moins de 15° près.

⚠️ Ces quatre valeurs sont des **réglages de départ, pas des mesures de terrain**. Elles se règlent avec un retour de marche réelle (cf `docs/ETUDE_PODOMETRE.md` (archivé : tag Git `archive-docs-2026-09-30`) §2 sur la qualité du cap).

#### Gestes sous rotation — un seul patch, sur le point d'entrée

Leaflet convertit un geste sans connaître l'angle : jusqu'à **200 px d'écart à 90°** entre ce qu'on voit et ce qu'il calcule. Un clic sur un tracé tombait à côté, un clic dans le vide réveillait le tracé d'ailleurs.

🩸 **On ne patche que `mouseEventToContainerPoint`**, le point d'entrée des gestes, qui rend le point « dé-tourné ». Tout ce qui lit un geste en dérive et devient juste : `mouseEventToLayerPoint`, `mouseEventToLatLng`, le hit-test du renderer canvas, les handlers `map.on("click")`, le pinch-zoom.

Le premier essai patchait `containerPointToLayerPoint` — plus général, et **faux** : `L.Renderer._update()` s'en sert pour calculer le coin de son canvas, que le patch faisait alors *tourner* au lieu de l'agrandir. Les coins de l'écran cessaient d'être peints. Le checkup l'a vu (T9 au rouge) ; à l'œil, ça n'aurait été qu'un tracé qui s'arrête bizarrement, à cent lieues de sa cause.

⚠️ Le patch vit sur le **prototype de `L.Map`**, donc il est vu par les 5 autres cartes de l'app (Vue OSM, minimap d'urgence, Secours, picker de calage, aperçu HOME). Il se retire de lui-même : hors carte principale, ou dès que l'angle est nul, il rend exactement ce que rendait Leaflet. Vérifié par le checkup (T12).

`latLngToContainerPoint` n'est **pas** patché : seul l'`autoPan` des popups s'en sert, et le décalage y est sans conséquence.

#### Pan et zoom pendant le mode

Le drag de Leaflet déplace le map-pane d'un offset **écran** ; la rotation vivant sous ce pane, la carte partait de travers de l'angle courant (mesuré : doigt à 0° → carte à 45°). Plutôt que de patcher `L.Draggable` — partagé par les poignées, les marqueurs déplaçables et les autres cartes — `dragging` reste désactivé pendant le mode et **le pan est refait à la main** dans le bon repère : un doigt, pas d'inertie, deux doigts laissent la main au pinch-zoom. Un pan manuel désarme le suivi et fait apparaître 🎯 **Recentrer**.

🩸 **Le bas-centre de l'écran est un carrefour** : `.kta-ipl-back-float` (« ↩️ Retour » d'un saut de portail, 84 px), `.kta-ipr-next-float` (74 px), `.kta-north-picker-overlay` (80 px) et les floaters d'outils y vivent déjà. 🎯 Recentrer ne fixe donc **aucune hauteur** : il mesure les flottants visibles et se place au-dessus du plus haut, un `MutationObserver` sur les enfants directs de `<html>` le replaçant quand ils vont et viennent. Tout nouveau flottant du bas s'ajoute à `FLOATERS_BAS` dans `mapBearing.js`.

🩸 **Piège mobile** : `dragging.disable()` retire la classe `leaflet-touch-drag`, et le conteneur retombe alors en `touch-action: pan-x pan-y` — au doigt, le **navigateur** scrolle la page au lieu de laisser le pan manuel agir. La classe `kta-bearing-lock`, posée pendant le mode, lui rend `touch-action: none`. Invisible au clavier/souris : ça ne se voit qu'au doigt, ou dans le checkup.

Le zoom reste **entièrement celui de Leaflet** : on ne touche plus à ses options.

🩸 **Ces trois options ont valu `"center"` jusqu'en v1.97.4, et c'était un bug** (constat KARMA : « avec les boutons aucun problème, au doigt ça bugue »). Je les avais forcées **avant** de patcher `mouseEventToContainerPoint`, par crainte que le point visé soit mal converti sous rotation ; une fois le patch posé, la prudence n'avait plus d'objet, mais l'option est restée. Conséquence : le zoom se faisait au centre de l'écran au lieu de se faire entre les doigts, et pincer ailleurs faisait glisser toute la carte — **95 px mesurés**, contre 27 px une fois rendues à Leaflet.

🩸 **Et le pan à un doigt volait le début du pincement** : entre la pose du premier doigt et celle du second, le premier glisse toujours de quelques pixels — assez pour franchir le seuil d'engagement de 6 px et déplacer la carte (21 unités mesurées) avant que Leaflet ne voie un geste à deux doigts. Le pan **restaure donc le centre** dès qu'un second doigt se pose.

⚠️ **Le bon critère de test n'est pas « le point pincé ne bouge pas »** : Leaflet arrondit le zoom à l'entier, donc il bouge toujours un peu — 27 px, **mode désactivé compris**. On mesure l'écart au comportement de référence (T19), sinon on court après un zéro impossible.

#### 🩸 Le suivi coupé par un changement de plan (28/09/2026)

`initTracking()` remet `tracking = false` SANS passer par `stopTracking()`. Tout ce qui écoute l'arrêt du suivi
doit donc aussi être prévenu là : `initTracking` appelle `MapBearing.onTrackingChange(false)` — sans ça, le bouton
« 🎯 Recentrer » (posé dans le `body`, hors carte) survivait sur le plan suivant (signalé par KARMA). Filet :
`checkup-plan-oriente.js` T20, avec contre-essai. Le démarrage du suivi, lui, a un seul chemin :
`interface.js > _demarrerSuivi(btn)`, exposé en `window.ktaDemarrerSuivi()` (tuile ▶️ + relance du carnet).

#### Frontières : on LIT l'état des autres modes

Le mode s'éteint tout seul si : le tracking s'arrête, un mode « clic carte » est armé (`_modeClicCarteActif()` — dessin, mesure, recalage, pickers), ou un mode plein écran est ouvert (Mode perdu, Présentation, Secours, Urgence, Replay).

🩸 Ces modes ne sont **pas** appelés à faire `suspend()`/`resume()` : chacun a ses retours anticipés et ses fermetures défensives (Secours appelle `fermer()` au début d'`ouvrir()`, Replay abandonne si la timeline fait moins de 2 points, Présentation sort si déjà active). Un couple suspend/resume posé là-dedans se déséquilibre au premier chemin oublié — et **une suspension jamais levée est invisible** : la carte cesse simplement de tourner, sans message. `MapBearing._modePleinEcranActif()` lit donc leur état, ce qui ne peut pas dériver. `suspend(raison)`/`resume(raison)` restent exposés pour un futur appelant sans état lisible, indexés **par raison** (et non par compteur) pour la même raison.

Le redressement est **immédiat** (pas animé) quand le mode devient inapplicable : ce qui vient de le désactiver, c'est souvent un outil qui attend un clic — redresser en 2 s laisserait l'utilisateur cliquer pendant la rotation.

#### Culling

Le viewport penché déborde son propre rectangle : sans marge élargie, des tracés disparaissent dans les coins **dès 10°** de rotation. `MapBearing.padCull(base)` porte le padding de 0,1 à **0,45** quand la vue tourne — branché dans `road.js` (2 endroits) et `utils.js > _markerInViewportPadded` (qui couvre aussi les markers éditeur et data layers).

Le **canvas du renderer** a le même défaut pour la même raison : dimensionné au viewport + 10 %, il ne couvre plus les coins une fois la vue tournée. `MapBearing` recalcule donc son `padding` **sur la taille réelle du viewport** — `(diagonale / petit côté − 1) / 2`, soit 0,36 en 1100×800 et jusqu'à **0,62 en portrait téléphone** — et seulement pendant le mode, car le canvas grandit d'autant : **×1,8 à ×3,5 en surface**. C'est le poste à surveiller côté mémoire sur gros plan tuilé (`OOMGuard`), et la raison pour laquelle ce padding n'est pas figé en permanence. Il passe par `map._renderer` (champ privé de Leaflet) et est restitué à l'arrêt.

#### 🩸 Les tuiles manquantes au dézoom (régression v1.97.0, corrigée en v1.97.1)

Signalé en terrain : sur un plan de 16332 px, **au dézoom à fond uniquement**, des pans entiers du fond restaient noirs. Les logs disaient pourtant `[Tiling V2] Niveau z=-2 — 56 tuiles affichées`, **sans aucune manquante** : tout était résolu, extrait et posé sur la carte. Le défaut n'était ni dans le ZIP, ni dans la génération, ni dans la résolution d'URL — il était au **rendu**, et il venait du pane de rotation.

**Mécanisme** : le tuilage V2 met sur la carte **toutes** les tuiles du niveau, même hors écran (à z=-2 sur ce plan : 4083 × 3000 px de contenu pour un écran de 430 px). Sans rotation, le navigateur ne peint que la partie visible. Sous un pane transformé, iOS doit composer tout le sous-arbre en une couche et renonce à en peindre une partie au-delà de ses limites de texture. D'où les trois « uniquement » du signalement : **au dézoom à fond** (c'est le seul zoom où le niveau `minNativeZoom` est rendu), **sur les grands plans** (la surface), **mode actif** (la couche).

**Parade** : pendant le mode, `MapBearing` retire de la carte les tuiles qui ne croisent pas la zone visible, et les y remet dès que la vue se redresse.

> 🧱 **Depuis le 29/09/2026, ce retrait n’est plus propre au mode** : le tuilage l’applique en permanence (`tiling.js > ktaCullerTuilesV2`, cf `docs/TILING.md` §6) — la mesure disait que c’est le mode de base qui payait (864 tuiles posées pour 6 visibles). `MapBearing` ne fait plus que redemander ce calcul pendant la rotation ; au retour à plat, ne reviennent que les tuiles proches de l’écran droit (checkup T15 mis à jour).

🩸 **Et la marge de cette zone ne peut PAS être une constante (v1.97.3).** Trois marges cohabitaient ici ; la formule juste avait été dérivée **une seule fois**, pour le canvas du renderer, et deux constantes posées au doigt ailleurs (0,35 tuiles, 0,45 tracés/POI). Or la valeur requise vaut `(grand côté / petit côté − 1)/2` : **0,19** en 1100×800 — le format du checkup — mais **0,58** sur un iPhone en portrait. Mesuré sur 430×932 : **17,2 % de l'écran jamais peint** à 90°, et 112 points sur 200 pris au bord de l'écran tenus pour hors vue. `MapBearing.zoneVisible(pad)` rend donc la **boîte englobante des quatre coins réels** de la vue (coins du conteneur dé-tournés comme dans le patch des gestes) : exacte à tout format, moins chère qu'une marge élargie, et **identique à `getBounds()` hors rotation**. Consommée par `road.js` (×2) et `utils.js` ; `padCull` a disparu.

🩸 **Le pan manuel doit reposer la contrainte de `maxBounds` (v1.97.3).** `panBy({animate:false})` passe par `_rawPanBy`, qui ne limite pas le centre : la vue s'échappait des limites du plan et le zoom suivant la ramenait d'un coup (150 unités mesurées après 60 pans). D'où `panInsideBounds` après chaque pan, comme le fait le drag natif. Il ne réintègre **que** celles qu'il a retirées (drapeau `_ktaCulled` sur l'overlay) — une tuile masquée par le filtre multi-niveau doit le rester. Mesuré au harnais : 25 tuiles → 4 pendant la rotation, 25 au retour à plat.

⚠️ **Non prouvé sur l'appareil** : le harnais est Chromium. Il démontre que la surface à composer est réduite d'un ordre de grandeur, pas que Safari s'en satisfait.

🔎 **Trouvé au passage, non corrigé** : au tout premier rendu, `[Tiling V2] Niveau z=NaN — 0 tuiles affichées` — le tuilage s'initialise avant que la carte ait une vue. Ce rendu fantôme **consomme le drapeau « premier rendu »**, si bien que `attendusPremier` vaut 0 et que le repli de sécurité de v1.86.0 (« toutes les tuiles ont échoué → afficher l'image entière ») ne peut plus jamais se déclencher. Antérieur à ce chantier, à traiter à part.

#### Garde-fou

`node scripts/smoke/checkup-plan-oriente.js` — checkup de release, joue le mode dans l'app réelle sur le plan de test : état par défaut, **géométrie après pan** (le cas qui a cassé la 1re implémentation), contrôles droits, contre-rotation des textes sans dérive, redressement sous mode clic-carte et sous mode plein écran, culling élargi, et restitution complète à l'arrêt (vue droite, drag rendu, `pointer-events` rendus, choix utilisateur conservé). Il couvre aussi le clic sur un tracé à sa position visible (et l'absence de réponse de son ancien fantôme), le sens du pan, la non-contamination des autres cartes, et fige le correctif du gel : **tourner sur place sans avancer doit faire tourner la vue**, et un magnétomètre bruité à l'arrêt ne doit pas la faire dériver.

⚠️ **Piège du harnais, tombé deux fois** : les écouteurs d'orientation sont attachés par `requestPermission()`, pas par `startTracking()`. Un test qui simule un événement `deviceorientation` sans l'avoir appelé ne fait rien — et passe au vert en mesurant son propre silence. Tout nouveau test de cap doit commencer par `await window.requestPermission()`.

#### Non couvert en v1.97.0

Contre-rotation des **tooltips** (⚠️ `tableEditor.js:1245` en pose de **permanents sur la carte principale** — la raison longtemps avancée, « ils ne servent qu'en Secours/OSM », était fausse ; l'impact reste faible, mais la décision doit se reprendre sur ce fait), inertie du pan, **indicateur de Nord à l'écran** (le manque ergonomique le plus visible), **validation iOS/Safari** (le harnais est Chromium), et **validation terrain du confort de rotation** (le cap lui-même est tenu pour fiable hors zones très ferraillées — retour terrain KARMA).

---

## 🪧 Guidage de l'itinéraire — « dans X m, tourner à gauche » (27/09/2026)

Étude et décisions KARMA : **`docs/ETUDE_GUIDAGE.md`** (fait foi). Module : `js/itiGuidage.js`.
Filets : `scripts/check-guidage.js` (pré-commit, réseaux fictifs) · `scripts/smoke/checkup-guidage.js`
(navigateur, taille téléphone, à la main).

### Chaîne

`pathfinder.js > _computeRouteInterne` rend deux champs **en plus** (aucun champ existant ne change) :
- `raccords[]` — `{ role: depart|etape|arrivee, label, de, vers, distPx }` : le trajet à vol d'oiseau entre
  chaque waypoint et son point d'accroche. Recopié sur la road `itinerary` (les 3 créations de
  `interfaceItineraire.js` passent par `_champsGuidage`), **dessiné** en pointillé (`road.js`,
  `.kta-itinerary-raccord`) et **compté** (`_distanceItineraireMeters`, ×2 pour une étape).
- `carrefours[]` — `{ x, y, sorties: [cap°] }` : nœuds **posés sur le trajet** d'où partent ≥ 3 directions.

Grands carrefours : `_zonesDeCarrefour` regroupe les croisements à ≤ `ZONE_ECART_M` (5 m) l'un du précédent
sur le trajet et pose sur chaque membre la même `zone: { x, y, r, sorties }` (sorties mesurées sur un cercle de
rayon r + ~3 m). `itiGuidage` regroupe de la même façon (constante jumelle), lit `zone.sorties` et produit
`picto` (≥ 4 galeries, SVG `_pictoSvg` fait de nombres seuls) et `lieu` (point nommé à ≤ r + 5 m du centre).

`ItiGuidage.construire(road)` → consignes (`virage` léger/franc · `branche` · `toutDroit` · `demiTour` ·
`niveau` · `etape` · `arrivee`), chacune à son abscisse curviligne `s`. 1–2 ms sur un trajet réel.

`tracking.js > updateMap` → `ItiGuidage.onPosition(position)` à chaque pas / recalage, + un battement d'1 s
(apparition / disparition). Les consignes ne sont recalculées que si la road change.

**Affichage** (`_maj`) : road + guide + (**suivi actif OU position confirmée** — `getTrackingPositionEtat().confirmee`,
sans quoi la position vaut le départ du plan) + (urgence OU réglage « auto »). La croix pose « jamais » (`setPref`) :
plus d'état « masqué pour cet itinéraire », la tuile 🪧 est le seul interrupteur.

**✂️ Coupe derrière** (`interfaceItineraire.js > _couperDerriere`, appelée par `_onTrackerRecale` pour la source
`"point"` — « Je suis ici », picker « Où es-tu ? », portail ; jamais le clic carte) : si le point est à ≤ `COUPE_SEUIL_M`
(8 m) du trajet, au **premier passage** (aller-retour), la road est remplacée par la suite du trajet depuis la
projection — sans Dijkstra ni question. Étapes et raccords projetés **dans l'ordre** du trajet (chacun au-delà du
précédent) : dépassés → `done` / retirés ; raccord `depart` retiré ; carrefours gardés s'ils sont à ≤ 3 px du
nouveau trajet. Dernière étape dépassée → `_replanifierDepuis` (clôture). Hors seuil → replanification habituelle
(avec question). **Exclus** : parcours Secours (`road.secours`), dont les étapes ne se valident que par le scénario
(`_majRoadSuivi` les y recale) ; recalage `sansReplan`.

### 🩸 Pièges rencontrés — à ne pas réintroduire

| Piège | Pourquoi | Garde |
|---|---|---|
| Détecter un croisement par les **nœuds traversés** | L'enrichissement garde l'arête d'origine A↔B à côté de A↔X↔B : un chemin qui passe **tout droit** peut enjamber le nœud X | recherche géométrique `_carrefoursSurChemin` (nœuds à ≤ 3 px du trajet) |
| Compter les **voisins** d'un nœud | Arêtes doublées + liens de proximité entre sommets d'un même tracé + tremblement : un tracé tremblé devenait un croisement à chaque sommet | **cercle de ~3 m** : chaque traversée du réseau = une sortie ; une amorce < 3 m ne compte pas |
| Départ accroché sur un segment portant un nœud de croisement | Le nœud virtuel n'était relié qu'aux extrémités → **aller-retour** au départ (+2× le recul, « demi-tour » annoncé) | `_insertVirtualNode` relie aussi les nœuds posés sur le segment (même niveau). Profite à `computeReachable` |
| Itinéraire dans des **renderers SVG hors mode orienté** | `mapBearing` n'élargissait que le renderer par défaut ; l'itinéraire (SVG à part, un NEUF par polyline et par rendu) restait cadré sur le rectangle non tourné → coupé dans les coins, il « avançait » au dézoom (retour KARMA) | `road.js > _rendererItineraire` (UN renderer SVG par carte) + `_majPaddingRenderer` élargit TOUS les renderers, y compris ajoutés pendant le mode |
| Fusion **en chaîne** | Une grappe s'étirait sans limite (11 m mesurés) ; deux virages à gauche = « demi-tour » | seuls des **croisements** sont candidats (plus de virage sur un coude) ; une grappe = croisements à ≤ `ZONE_ECART_M` (5 m) du **précédent** = UN carrefour ; `demiTour` seulement si le trajet se replie (`replie`) |

### Seuils (calés sur un plan réel local, 27/09/2026)

`FENETRE_M 4` (angle mesuré sur 4 m) · `ZONE_ECART_M 5` (zone de carrefour, même valeur que `pathfinder.js` ; KARMA : « 20 m c’est beaucoup trop ») · **aucun virage sans croisement** (retour KARMA : sur
un réseau de galeries c'est du bruit ; la 1re version en annonçait, 9 consignes sur 15 étaient des coudes) · présence sur le trajet 3 m / 8 m, écart 6 m /
15 m, demi-tour 10 m ×3 / 20 m ×5 (avec / sans navigation intelligente : sans, 10 m donnaient 3 faux
demi-tours en 350 m sous 4 m de bruit).

### Frontières

- **Urgence** : `road.urgence = true` (posé par la sortie d'urgence via `itineraireYAller(…, { urgence })`,
  gardé par la replanification) → pas de croix, affiché même réglé sur « Jamais », « Recalculer » =
  `SortieUrgence.relancerDepuis(pos)`. L'écran XL lit `ItiGuidage.etat()` dans son `_tick`.
- **Pas de « mode Navigation »** : livré puis retiré le 27/09/2026 (KARMA 3:a). Le guidage ne touche NI
  `MapBearing` NI `WakeLock` : « Plan orienté » (menu Tracker) et l'écran allumé (Réglages) restent les seuls
  interrupteurs — un doublon sans libellé dans le bandeau n'était pas lisible.
- **Inter-plans** (`interPlanRoute.js`, 01/10/2026) : chaque étape de la chaîne garde `raccords` / `carrefours`
  et `_tracerItinerary(leg)` les pose sur la road. L'étape sur un AUTRE plan est calculée depuis le plan ouvert :
  `computeRouteOnRoads(…, { echelle })` mesure ses carrefours à l'échelle de SON plan (sinon rayon de sortie et
  zone faux d'un plan à l'autre). Deux morceaux bout à bout sur un même plan : seuls le départ du premier et
  l'arrivée du dernier restent. Distances avec raccords (décision K). La feuille de route est **par étape** :
  elle s'arrête au portail, puis `road.suite` (posée par `_tracerItinerary(leg, suivants)`, gardée par la coupe et
  la replanification) ajoute une ligne par plan suivant : portail, plan, distance, nombre de croisements (carrefour
  isolé ou zone = 1). Pas de consignes détaillées d'avance : elles se calculent à l'échelle du plan suivant, une
  fois son étape tracée.
  **Abandon de la suite** (`_pendingChain`, RAM) : au retour à l'accueil (comme avant), à la suppression de
  l'itinéraire (`_effacerItineraireActif` → `InterPlanRoute.abandonnerSuite`), et au changement de plan
  (`onPlanExit("switch")`) si ce n'est pas une traversée PHYSIQUE (`InterPlanLinks.traverseePhysiqueEnCours`,
  goTo `recalerTracker`) ou si l'itinéraire du plan quitté a été remplacé (présent sans `suite`). Absent = clôturé
  au portail (« Je suis ici » sur le point-portail) : la suite continue. Sans ça, ouvrir le plan suivant par le
  sélecteur y traçait l'étape, écrasait son itinéraire et l'enregistrait dans sa session.
- **Non couverts** : itinéraires du Mode Secours (`secoursMode.js`) — ils créent leurs roads sans `raccords` /
  `carrefours`.
