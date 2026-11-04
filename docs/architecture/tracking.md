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
+ cap (boussole), borné par l'image de collision et les structures (§🧱 Collision du pas). La dérive s'accumule. Quand le plan a un **réseau de
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

## 🧱 Collision du pas : image de collision + structures

Un pas PDR **hors réseau** (`_avancerRaster`, aussi repli de `_avancerSurGraphe` quand la position n'est calée sur
aucun tracé) n'est appliqué que s'il passe deux tests ; refusé, la position ne bouge pas et rien n'entre dans la
timeline. Sur le réseau, le map-matching suit le tracé et aucun de ces tests ne s'applique.

1. **`estAccessible(x, y)`** — image de collision du plan (`plan.collisionImage`, chargée par `map.js >
   initCollisionMap`, réduite à 4096 px) : bloqué si plus de 30 % du carré 5 × 5 autour du point est rouge pur.
   Sans image de collision, tout passe.
2. **`_pasBloqueParStructure(x0, y0, x1, y1)`** — structures de session (`getStructures`) et du plan
   (`_ktaDataStructurePolygons`) : le pas est refusé s'il **entre** dans un pilier 1re/2e masse ou un mur fermé, ou
   s'il **coupe** une arête d'un de ces polygones (coin de pilier) ou un front de taille 1re/2e masse ou un mur
   (ligne). Les autres types (zones, types `cust-…`) ne comptent pas pour le tracker ; le 6e paramètre
   `avecPerso` (vue 3D seulement) compte aussi les types `cust-…`, en polygone ou en ligne selon la légende.
   - **Niveau** : en multi-niveau, seulement les structures du niveau du tracker (`trackerLevel` ; sans `level` =
     0). Une 2e masse étant rangée au niveau actif − 1 (`structures.js`), elle bloque sur ce niveau-là. Hors
     multi-niveau, toutes bloquent.
   - **Visibilité** : masquées ou non, comme les obstacles du Pathfinder.
   - 🩸 Un polygone qui contient **déjà** la position de départ du pas est ignoré (recalage posé sur un pilier,
     tracé imprécis) : sinon chaque pas sortant le couperait et le tracker resterait figé.
   - **Coût** : grille d'index de 128 px par liste, refaite seulement quand la liste change (même tableau, même
     longueur, même somme des `updatedAt` et des nombres de points). ~0,3 ms par pas pour 13 000 piliers (Node, PC).
   - La structure **en cours de tracé** ne compte pas.
   - **Contact** (`_segmentsSeCoupent`) : croisement, extrémité posée sur l'arête, bout commun. 🩸 Un pas
     **colinéaire** à une arête ne compte que s'il la recouvre (un point commun au moins) : longer une face dans son
     prolongement passait pour un contact et figeait le tracker (et la vue 3D) le long d'un pilier aligné.
   - **Exposée** : `window.ktaPasBloqueParStructure(x0, y0, x1, y1[, niveau[, avecPerso]])` (true = refusé),
     `niveau` remplaçant celui du tracker ; `window.ktaSegmentsBloquesParStructure(segments[, niveau[, avecPerso]])`
     juge un lot de segments en relisant l'index une seule fois (la signature parcourt toutes les structures : quinze
     appels par pas coûtaient 3,5 ms au PC dans un plan dense, le lot 0,2 ms) ; le premier test l'est aussi
     (`window.ktaEstAccessible(x, y)`). Consommateur : la vue 3D (`js/vue3d.js`), qui s'en sert pour ses déplacements à
     l'écran et au clavier sans recopier la géométrie ni déplacer le tracker.

Le Pathfinder garde ses propres règles (seuls `mur-ligne` et la zone `inaccessible` coupent l'itinéraire,
`pathfinder.js > _collecterObstaclesDurs`) : le tracker et l'itinéraire ne partagent pas la même liste d'obstacles.

---

## 🏗️ Niveau d'un recalage sur la carte (plan multi-niveau)

Un clic sur la carte ne dit pas à quel étage on est. Deux chemins le demandent, avec la même règle :
le clic de **📍 Mode recalage** (`tracking.js > initTracking`, `map.on("click")`) et le picker **« Où es-tu ? »**
(`utils.js > ktaDemanderPositionCarte` : sortie d'urgence, « Y aller », bouton « Je suis ici » de l'alerte du guidage).

- **`window.ktaNiveauxRecalage(x, y)`** → `null` (pas de question) ou `{ niveaux, actif }`. Rayon
  `RECAL_NIVEAU_RAYON_M` = **10 m** × `APP_CONFIG.scale`. Comptent : un tracé dont un segment passe dans le rayon (une
  jonction apporte `fromLevel` et `toLevel`), une zone ou une structure dont le contour y passe ou qui contient le
  point (structure en ligne : sa ligne seulement), un POI jonction (`KtaPoiJonction.pointsJonction`) dans le rayon,
  avec ses niveaux desservis. Session **et** calques (`getAllEmbedded*`), objets masqués compris. Ne comptent pas :
  POI ordinaires, itinéraire calculé (`type: "itinerary"`), mesures. Objet sans `level` = 0.
  `null` si plan mono-niveau, ou si seuls le niveau actif ou rien ne sont trouvés : le niveau actif est gardé, comme
  avant. Sinon `niveaux` = trouvés + niveau actif, du plus haut au plus bas.
- **`window.ktaDemanderNiveauRecalage({ niveaux, actif })`** → Promise niveau | `null`. Fenêtre `ktaConfirm` à choix
  (« Dans quel niveau es-tu ? », `tracker.recalNiveau.*`), un bouton radio par niveau (`ktaFormatNiveau`, profondeur
  de `getProfondeurNiveau` si renseignée), le niveau actif coché et marqué « niveau affiché » ; le bouton OK dit
  l'action (« 📍 Me placer au niveau −1 »). Annuler / Échap / fond = `null`.
- **Après le choix** : `ktaSetActiveLevel(niveau)` (le niveau affiché bascule), puis le recalage habituel au niveau
  choisi — clic : `trackerLevel`, position confirmée, ancre `recalage` `src: "click"`, `_notifierRecalage("click")` ;
  picker : `recalerTrackerSurPoint(x, y, niveau)` puis `onPick({ x, y, niveau })`. **Annuler** : rien n'est
  recalé, le mode recalage (ou le picker) reste armé ; un 2e clic pendant la question est ignoré.
- 🩸 Toute fenêtre `kta-readme-modal-overlay` coupe les modes de la barre (`interface.js > _initCoupeModesSurModale`) :
  la question porte l'id `kta-recal-niveau`, exclu de cette coupure, sinon Annuler laissait le mode éteint.
- Non concernés (le niveau de la cible fait foi, sans question) : arrivée de portail, Mode Secours, et
  **« 📍 Je suis ici » d'un point** : la fiche porte `data-kta-niveau` (`utils.js > buildPointPopupHtml`), lu par
  `_ktaPopupAction` et passé à `recalerTrackerSurPoint`. C'est le niveau du POI (sans `level` = 0), pas le niveau
  affiché : un POI du −1 touché pendant que le 0 est affiché place le tracker au −1. POI jonction : le niveau
  affiché s'il le dessert, sinon son `level`. Mono-niveau : pas d'attribut, règle habituelle (niveau actif).
  L'étape posée au clic (mini-fiche de l'itinéraire) n'en porte pas non plus.
- ⚠️ **Niveau de l'ancre** : `_pushTimelinePoint` lit `trackerLevel`. Tout appelant (clic de recalage,
  `recalerTrackerSurPoint`, ancre `start` de `startTracking`) pose le niveau **avant** de pousser l'ancre : elle
  porte le niveau d'arrivée (replay, export CSV).
- ⚠️ **Niveau rendu par le picker** : `onPick({ x, y, niveau })`, `niveau` = choisi dans la fenêtre, sinon le niveau
  actif d'un plan multi-niveau, sinon absent (mono-niveau). Les appelants en font le départ de l'itinéraire
  (waypoint `level`, cf `multilevel-pathfinding.md` § Départ d'un itinéraire et niveau) : « Y aller »
  (`opts.origine.level`), sortie d'urgence (`_lancer({ x, y, level })`, gardé par « Tracer »). Le « Je suis ici » de
  l'alerte du guidage ne lit pas `onPick` : la replanification part de `getTrackerLevel()` (`_onTrackerRecale`).
  Sans picker (position déjà confirmée ou suivi actif), les départs « depuis ma position » prennent aussi le niveau
  du tracker (`multilevel-pathfinding.md` § Départ d'un itinéraire et niveau).
- Checkup : `scripts/smoke/checkup-recaler-niveau.js`.

## 📍 Recalage dans la galerie (« Je suis ici » d'un POI)

Une icône se pose souvent à 1 à 3 m du tracé. Recalé sur ses coordonnées exactes, le tracker serait dans la roche :
le verrou sur tracé (`_avancerSurGraphe`) n'agit qu'au pas suivant, seulement si la navigation intelligente est
active, et le PDR seul (`_avancerRaster`) partirait de la roche.

- **Qui** : `recalerTrackerSurPoint(x, y, niveau, { dansGalerie: true })` depuis le « 📍 Je suis ici » d'une fiche de
  point (`utils.js > _ktaPopupAction`, cas `ici` : POI et étape d'itinéraire, carte comme vue 3D) et la bulle de point
  du mode urgence (`emergencyMode.js > _jeSuisIciPoint`).
- **Un tap sur la carte est une position voulue** (décision produit) : le clic du 📍 Mode recalage
  (`tracking.js > _recalerSurClic`) et le picker « Où es-tu ? » (`utils.js > ktaDemanderPositionCarte`, qui rend à
  l'appelant le point tapé) posent le tracker au point **exact** du tap, jamais ramené dans la galerie : c'est
  l'utilisateur qui sait où il est. Le choix du niveau (`ktaNiveauxRecalage`) reste demandé.
- **Règle** (`tracking.js > _positionDansGalerie` → `galerieEmprise.js > KtaGalerie.versGalerie`) : la galerie est
  **celle de la vue 3D** (modèle du mode galerie : tous les types de tracé, perso compris, ni itinéraire ni jonction ;
  session et calques), sur **le niveau du recalage** (mono-niveau : tout le plan) :
  1. point **déjà dans l'emprise** d'une galerie (`dedans`) → il ne bouge pas ;
  2. hors emprise, un axe à moins de **`KtaGalerie.PROCHE_M` (10 m)** → sur l'axe de la galerie dont **l'emprise est
     la plus proche** (pièce la plus proche ; tube : projection sur son axe ; joint ou passage : axe le plus proche du
     bord atteint) ;
  3. **niveau sans aucun tracé** (plan sans tracé, ou multi-niveau dont seuls d'autres niveaux en ont ; décision
     produit), image de collision chargée et point refusé par `estAccessible` : point accessible le plus proche à
     moins de `PROCHE_M` (anneaux au pas d'un pixel du canvas de collision) ;
  4. un niveau qui a des tracés, tous à plus de `PROCHE_M` : on reste sur le point (le tracé fait foi, pas l'image).
- ⚠️ contrat **jamais à travers la roche** : dedans, on ne bouge pas (l'axe le plus proche peut être celui de la
  galerie d'à côté, derrière la paroi) ; dehors, le segment du point au bord de l'emprise la plus proche ne traverse
  aucune autre emprise, sinon elle serait plus proche : la seule roche franchie est celle qui sépare le point de sa
  galerie. L'axe le plus proche ne le garantit pas (un chemin de 1,7 m dont l'axe est plus près qu'un principal de
  2,5 m dont la paroi est plus près).
- ⚠️ contrat **un seul rayon** : `PROCHE_M` est aussi `vue3d.js > POI_GALERIE` (POI montré contre la paroi en 3D).
  Deux valeurs divergentes laissaient le tracker dans la roche à côté d'un POI que la 3D montrait dans la galerie.
  `smartNavRadiusM` (6 m) ne sert plus au recalage : il reste le rayon du verrou sur tracé (`roadGraph.js`) et de la
  place « jamais coincée » de la vue 3D.
- 🩸 Le modèle de `KtaGalerie` est en cache (signature des données, relue fraîche par `versGalerie`) : le premier
  recalage sur un grand plan le construit, la vue 3D le réutilise ensuite. Pas de `RoadGraph.getGraph()` (croisements
  en O(N²)).
- Le POI ne bouge pas. L'ancre de timeline `recalage` et le recentrage de la vue portent la position ajustée.
- 🩸 `_notifierRecalage` reçoit **toujours les coordonnées du point** (ou du tap) : la validation d'étape
  (`interfaceItineraire.js > _onTrackerRecale`), la coupe derrière et la reprise du portail de sortie
  (`interPlanRoute.js > onTrackerRecale`) comparent des coordonnées arrondies à celles du point.
- Non concernés (coordonnées exactes, sans `dansGalerie`) : clic du Mode recalage et picker « Où es-tu ? » (un tap
  sur la carte est une position voulue), arrivée de portail, Mode Secours, position de fin du Carnet, « Ici » de
  « D'où pars-tu ? » et « Je suis ici ? » de la vue 3D (position déjà contrainte par le pas ; en saut, ancre `tp`).
- Checkup : `scripts/smoke/checkup-recaler-niveau.js` § 1, 2, 7, 9, 16 et 16 bis ; `checkup-vue-3d.js` § 10b.

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
- **Jamais confirmée → picker partagé** `utils.js > ktaDemanderPositionCarte(onPick, {icone, texte, recaler, onCancel})`. Floater `.kta-iti-floater` (donc reconnu par `_modeClicCarteActif()` : pas de popup parasite, clic ré-émis en capture par `map.js`, **le tap porte même sur un marqueur**), les autres modes clic-carte sont éteints avant d'armer (`window._desactiverTousLesModes`, exposé par `interface.js` à cette occasion). **Le tap recale le tracker** (`recalerTrackerSurPoint`) — donc confirme la position — puis rend la main. Plan multi-niveau : même question de niveau que le clic de recalage (§ Niveau d'un recalage sur la carte) ; Annuler laisse le picker armé ; `recaler: false` ne demande rien.
- `sortieUrgence.js` : `_lancer(origine, meta)` garde `meta.mode` (`suivi` / `confirmee` / `clic`) + `ts` pour la ligne d'état de la modale ; `_tracerIndex` passe `{ origine }` à `itineraireYAller`.
- `itineraireYAller(x, y, nom, opts)` : `opts.origine` impose l'origine. Sans elle (décision produit, QCM du
  02/11/2026), la règle est **plus stricte que l'instant T** : suivi actif → du tracker (vue 3D ouverte en mode libre :
  de la position 3D, niveau compris, sans recaler le tracker) ; **tracker arrêté → « D'où pars-tu ? » à chaque fois**
  (`interfaceItineraire.js > _demanderDepart`, `ktaConfirm` en mode choix, id `kta-iti-depart`) : « Ici » (vue 3D en
  libre seulement : `recalerTrackerSurPoint` à la position 3D avec `sansReplan`, puis départ de là), « Ma dernière
  position (il y a N min) » (position confirmée seulement, date par `window.ktaDateRelative`, départ du tracker et de
  son niveau sans recalage ; vue 3D en libre : sa place vient au tracker, `KtaVue3D.placerSurTracker`), « Me
  repositionner » (picker, la vue 3D se fermant d'abord et se **rouvrant** en libre au point et au niveau choisis, cap
  gardé, une fois la position prise ; picker annulé → on reste sur la carte). Annuler = pas d'itinéraire.
  Une seule réponse possible (jamais confirmée, hors 3D) → picker direct, sans question.
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

🩸 **Un doigt perdu ne compte plus** (`_panDebut` > `_panOublier`) : le pan manuel compte les doigts posés pour laisser deux doigts au pinch. Un doigt dont la fin n'arrivait jamais restait compté, chaque doigt suivant passait pour le 2e d'un pinch, et la carte tournée ne se déplaçait plus d'un doigt — seul le retour au nord, qui rend le drag de Leaflet, la libérait (vu juste après un ajustement de sommet). Un appui primaire (`isPrimary` : aucun autre doigt posé) repart donc de zéro, la fin se lit sur `window` en capture, et `blur` / `visibilitychange` oublient tout geste en cours ; idem pour les doigts de la rotation (`_rotDoigts`). Checkup : `checkup-ajuster-sommets.js` (carte tournée, lâcher perdu).

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

Le mode s'éteint tout seul si : le tracking s'arrête, un mode « clic carte » est armé (`_modeClicCarteActif()` — dessin, mesure, recalage, pickers), ou un mode plein écran est ouvert (Mode perdu, Secours, Urgence, Replay). Le mode Présentation n'en fait pas partie : il garde la carte et la boussole, la vue y tourne pendant le suivi (décision produit).

🩸 Ces modes ne sont **pas** appelés à faire `suspend()`/`resume()` : chacun a ses retours anticipés et ses fermetures défensives (Secours appelle `fermer()` au début d'`ouvrir()`, Replay abandonne si la timeline fait moins de 2 points). Un couple suspend/resume posé là-dedans se déséquilibre au premier chemin oublié — et **une suspension jamais levée est invisible** : la carte cesse simplement de tourner, sans message. `MapBearing._modePleinEcranActif()` lit donc leur état, ce qui ne peut pas dériver. `suspend(raison)`/`resume(raison)` restent exposés pour un futur appelant sans état lisible, indexés **par raison** (et non par compteur) pour la même raison.

Le redressement est **immédiat** (pas animé) quand le mode devient inapplicable : ce qui vient de le désactiver, c'est souvent un outil qui attend un clic — redresser en 2 s laisserait l'utilisateur cliquer pendant la rotation.

#### Rotation manuelle (deux doigts, bouton nord)

Sans tracker, la carte 2D tourne aussi **à la main**, avec le même pane, le même patch des gestes, le même pan manuel, le même canvas élargi et le même culling. `MapBearing` sait qui tient l'angle : `getSource()` rend `null` (vue droite), `"manuel"` ou `"cap"`.

| | Règle |
|---|---|
| Geste | deux doigts : le pinch-zoom reste celui de Leaflet ; la vue ne tourne qu'au-delà de **`SEUIL_ROTATION` = 15°** d'angle entre les doigts (un pincement en fait 5 à 10), puis suit les doigts **sans rattraper le seuil** (aucun saut) et sans lissage. Zoom et rotation se combinent ensuite |
| PC | **Maj + molette** (0,15° par pixel de molette ; Chrome sous Windows convertit Maj + molette en `deltaX`, les deux axes sont lus). Aucun raccourci clavier |
| Fin du geste | à moins de **3°** du nord, la carte se redresse (`SNAP_NORD`) |
| Bouton nord | en bas à gauche, à la place de la boussole 2D (au-dessus d'elle quand elle est ouverte ; jamais fusionnés : la rose suit le cap du téléphone, l'aiguille le haut du plan), visible seulement en rotation manuelle ; retour en **300 ms**, immédiat sous `prefers-reduced-motion` (cf `ui.md` §41.7) |
| Durée | l'angle tient tant qu'on n'y touche pas ; **remis à 0 au changement de plan** (`map.js` appelle `reset()` à chaque carte) |
| Outil armé | dessin, mesure, recalage, pickers (`_modeClicCarteActif`), mode plein écran ou suspension : la carte se **redresse** et le geste est refusé ; désarmé, elle **reste droite** (choix conservateur : aucun angle ne revient seul) |
| Plan orienté | dès que le cap arrive (`onHeading` avec le mode actif), il prend la main ; deux doigts ne font plus que zoomer ; à l'arrêt du suivi, la carte revient **au nord**, pas à l'ancien angle manuel (un angle choisi il y a longtemps reviendrait au hasard ; le nord est prévisible) |
| 3D | la vue 3D a son propre cap : au retour, la carte 2D a gardé son angle |
| Exports | PNG / PDF / KMZ se dessinent depuis les données, jamais depuis la vue : le plan sort **droit** (checkup R8 : même canvas, au pixel près, tourné ou non) |

🩸 **Aucun module ne prévient `MapBearing` quand un outil s'arme** (les drapeaux `window.mode*` et les flottants sont posés par chaque outil). Pendant une rotation manuelle, `_modeClicCarteActif` est donc relu toutes les **250 ms**, et juste après un clic dans le conteneur (la barre d'outils y vit) : le redressement précède le premier point posé. Le cap, lui, est relu à chaque événement d'orientation, comme avant.

🩸 **Même famille d'événements que le pinch-zoom de Leaflet** : `L.Browser.touchNative` (vrai dès que le navigateur expose `TouchEvent`, **Chrome de bureau compris**) → `touch*`, sinon pointeurs. Nos écouteurs, posés sur le conteneur, passent avant ceux de Leaflet (sur `document`) : il recentre le pincement avec l'angle déjà à jour, et le contenu reste sous les doigts (dérive mesurée < 1 px). Un harnais qui simule des doigts dans l'autre famille ne voit ni zoom ni rotation.

🩸 **Le div `#map` est persistant** d'un plan à l'autre (`cleanupExistingMap` ne vide que son contenu) : les écouteurs du conteneur (pan manuel, rotation, molette) sont des fonctions du module, qui lisent `window.map` — un nouvel `addEventListener` de la même fonction ne s'empile pas (checkup R12 : un geste ne tourne pas deux fois après un changement de plan).

Filet : `scripts/smoke/checkup-rotation-manuelle.js` (Chromium et WebKit, plus un vrai geste CDP sous Chromium). ⚠️ Non vérifié sur un vrai téléphone.

#### Culling

Le viewport penché déborde son propre rectangle : sans zone élargie, des tracés disparaissent dans les coins **dès 10°** de rotation. `MapBearing.zoneVisible(pad)` rend la zone réellement montrée (détail plus bas) — branchée dans `road.js` (2 endroits), `utils.js > _markerInViewportPadded` (qui couvre aussi les markers éditeur et data layers) et le culling des tuiles.

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
⚠️ contrat : un repère (`lieu`, `repere`) n'est cité que s'il est **au niveau du tronçon** de la consigne (`_niveauA`,
niveau du point du trajet ; consigne `niveau` : celui d'où l'on part) — règle du filtre de niveau (`level` absent = 0,
POI jonction sur chacun de ses niveaux, `KtaPoiJonction.niveaux`) ; sinon la consigne se dit sans repère. La manœuvre
ne dépend pas du repère. 🩸 La distance se mesure en plan : un POI du niveau du dessus, à l'aplomb du carrefour, était
cité pour un virage du dessous (bandeau, feuille de route, écran XL et 3D passent tous par `construire`). Contrôle :
`checkup-guidage.js` G11.

`ItiGuidage.construire(road)` → consignes (`virage` léger/franc · `branche` · `toutDroit` · `demiTour` ·
`niveau` · `etape` · `arrivee`), chacune à son abscisse curviligne `s`. 1–2 ms sur un trajet réel.
⚠️ contrat (décision produit, QCM du 02/11/2026) : une consigne `niveau` **absorbe** les consignes de carrefour à
≤ `ZONE_ECART_M` de son `s` et passe devant à `s` égal. 🩸 Par un tracé `jonction`, le changement de niveau tombe sur
le nœud d'arrivée, au même `s` que son virage, et se triait après lui : la descente n'était jamais dite. Libellé du
niveau signé (`ktaFormatNiveau` : « vers le niveau +1 »), carte et 3D.

`tracking.js > updateMap` → `ItiGuidage.onPosition(position)` à chaque pas / recalage, + un battement d'1 s
(apparition / disparition). Les consignes ne sont recalculées que si la road change.

**Affichage** (`_maj`) : road + guide + (**suivi actif OU position confirmée** — `getTrackingPositionEtat().confirmee`,
sans quoi la position vaut le départ du plan) + (urgence OU réglage « auto »). La croix pose « jamais » (`setPref`) :
plus d'état « masqué pour cet itinéraire », la tuile 🪧 est le seul interrupteur.

**Encart « reste »** (`_resume`, rendu par `_rendreEncart` dans `.kta-guid-resume` sous la consigne) : 🏁 nom de
l'arrivée (`raccords` « arrivee », sinon le dernier waypoint ; un « Point (x, y) » ou rien → « Arrivée »), son niveau
seulement s'il diffère de celui de la position (tracker en 2D, scène en 3D), distance restante = trajet après `s`
+ raccords restants (étape ×2, arrivée ×1, comme `_distanceItineraireMeters`) + l'écart en « rejoindre », temps =
`getItiTempsMinutes(reste, 2 + étapes restantes)` (allure et pauses de la fenêtre Itinéraire ; rien de choisi :
« lente », 3 km/h, `interfaceItineraire.js > DEFAULT_ITI_SPEED`, décision produit), « ~ » + arrondi à la
minute (`ktaFormatTempsItineraire`). ⚠️ contrat : une seule source, `etat().resume` (bandeau 2D, écran XL) et
`apercu().resume` (3D en libre), calculée avec la consigne : jamais de chemin. Rendu `rendreEncart(conteneur,
resume)` (bandeau 2D, vue 3D, écran XL) : **une ligne, toujours affichée, jamais repliée** (décision produit) ;
`resume.destination` (« 🏁 nom ») coupée par une ellipse si trop longue, `resume.reste` (« · distance · temps »)
toujours entier ; `resume.texte` = la ligne entière (titre). La clé de l'ancien repli, `myktamap_guidage_encart_v1`,
est effacée au chargement d'`itiGuidage.js`. Contrôles : `checkup-guidage.js` G12, `checkup-vue-3d.js` § 32.

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
- **Vue 3D** (`vue3d.js`, § Vue 3D › Guidage) : en suivi, elle lit `ItiGuidage.etat()` comme l'écran XL (`s` /
  `sCible` : abscisses de la position et de la prochaine consigne, pour ses chevrons) quand le bandeau 2D parle,
  sinon l'aperçu depuis le tracker ; en libre, `ItiGuidage.apercu(pos, { cap, sPrec, niveau })` : mêmes textes
  (`_textes`, partagé avec le bandeau), calculés depuis
  une position quelconque **sans toucher l'état** du guidage (ni progression, ni écart, ni demi-tour ; loin du trajet,
  « rejoindre »). `niveau` : la position n'est projetée que sur les points du trajet à ce niveau (chaque point porte le
  sien, `pathfinder.js > computeRoute` ; transit = aucun) ; niveau sans tronçon → `visible: false` (plus de
  « Rejoindre le tracé » vers un autre étage) ; arrivé au niveau d'une consigne `niveau`, elle est faite et la
  suivante parle. `capTrajet` : cap du trajet devant soi (cap d'arrivée d'un passage en 3D). Elle se redessine à `kta:itineraireChange` (`road.js`), émis à chaque itinéraire tracé, remplacé
  ou effacé. ⚠️ contrat (décision produit, QCM du 04/11/2026) : **en suivi**, l'écart suit la règle D / E / F de la
  2D (jamais de recalcul automatique) ; `etat().actions` porte les boutons du bandeau, que la 3D affiche et joue par
  `ItiGuidage.agir(id[, { apres }])` (`apres(p)` : position choisie au picker de « Je suis ici », la vue s'y rouvre).
  **En libre**, la place 3D n'est pas le tracker : un écart tenu recalcule l'itinéraire depuis elle
  (`vue3d.js > _recalerLibre`, § Vue 3D › Guidage), par la prise `itineraireReplanifierDepuis(x, y, niveau,
  { discret, valide })` : même replanification que « Recalculer d'ici » (destination, étapes non validées dans l'ordre,
  urgence, évacuation, suite inter-plans gardées), sans indicateur ni toast, résultat `{ ok, raison }` ; jamais de
  clôture ni de parcours d'équipe ; résultat jeté si l'itinéraire actif a changé pendant le calcul ou si `valide()`
  rend false ; pas de chemin → itinéraire gardé (`raison: "chemin"`).
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

## 🧊 Vue 3D — `js/vue3d.js`

Le plan en relief autour de la position du tracker. Décisions, mesures et risques : `docs/ETUDE_VUE_3D.md` ; place
dans l'interface (z-index, filtres partagés, icônes) : `docs/architecture/ui.md` § Vue 3D.

### Entrée et chargement

- **Bouton cube** de la barre de droite, juste sous ≡ Filtres (`interface.js > L.control.ktaVue3DControl`, ajouté
  après `ktaFilterControl`) : picto au trait de l'écran Bienvenue (`js/ktaPictos.js > ktaPicto("cube")`), en
  `currentColor`, aux couleurs de `.leaflet-bar a` dans les deux thèmes. Titre `ui.vue3d.title` (la 3D montre le plan,
  pas la galerie réelle).
- **Grisé** (`kta-inactif` : `--kta-texte-3`, `grayscale`, sans opacité ; toujours touchable) sans plan chargé ou sans
  échelle (`APP_CONFIG.scale` absente ou ≤ 0) : `interface.js > _vue3dRaison` fait le test **avant** de charger quoi
  que ce soit, le titre et le toucher disent pourquoi. Recalculé à l'ajout, à `mktm:plan-pret` et au rafraîchissement
  de la barre d'état (`ktaMajBoutonVue3D`). `KtaVue3D.ouvrir` refait le même refus (appel direct).
- Toucher le bouton : `ComputeLoader.wrap` montre l'indicateur (une image peinte avant le travail synchrone),
  `vue3d.chargementPremier` tant que three.js n'est pas importé (`KtaVue3D.charge()`), `vue3d.chargement` ensuite ;
  `_chargerVue3D` pose `<script src="js/vue3d.js">` une fois, puis `KtaVue3D.ouvrir({ retourFocus })`.
  `vue3d.js` charge `css/vue3d.css` et importe `lib/three/three.module.js` (module ES, `import()` dynamique, URL
  absolue : pas d'import map, la CSP refuse tout script en ligne). Échec du chargement → `vue3d.chargementImpossible` ;
  WebGL absent → `vue3d.indisponible`. Rien de cela n'est demandé au démarrage (`smoke.js` refuse toute requête vers
  ces fichiers).
- **Hors ligne** : les quatre fichiers sont dans `sw.js > ASSETS_TO_CACHE` (installés par le service worker, pas
  par la page).

### Contrats

- **Déplacement** = règle du pas du tracker (`ktaEstAccessible`, `ktaSegmentsBloquesParStructure(…, niveau, true)`,
  plus haut), jamais une copie, appliquée à un **corps de 0,8 m** : chaque pas est balayé par trois segments
  parallèles (axe et ± 0,4 m) prolongés de 0,4 m devant, puis douze rayons de 0,4 m autour de l'arrivée doivent
  rester libres (pas plus de rayons bloqués qu'au départ, pour ne pas rester collé si l'on s'ouvre contre un mur).
  Glissement le long d'un mur. **Commandes** (décision produit) : au téléphone, **joystick** (ci-dessous) ; au PC
  (`pointer: fine`) ou avec l'option « Pavé classique » de cet appareil (`config.js > getVue3DPave`,
  `myktamap_v3d_pave_v1`), pavé ▲ ▼ ◀ ▶ ↶ ↷ (`vue3d.js > _commandesVoulues`, `ouvrir({ commandes })` pour forcer) ;
  clavier partout.
- **Joystick** (`vue3d.js > _brancherStick`, `JOYSTICK`) : zone de la moitié gauche, sous la rangée du haut et le
  bandeau (`--kta-v3d-sous-haut`), au-dessus de la boussole ; posée juste après la scène, donc sous 🪜, la fiche et
  les boutons. Un doigt posé y fait venir l'anneau (96 px) ; le bouton (44 px) suit le doigt jusqu'à 40 px. Zone
  morte 12 px, puis vitesse proportionnelle 0 → 2,8 m/s ; un seul pas par image dans la direction du bouton (haut =
  avancer, côté = pas de côté) ; débattement > 85 % tenu 0,6 s = course (× 2,5, vitesse pleine). Sortir de la zone
  morte passe en libre ; un toucher bref sans bouger ne quitte pas le suivi et vise un panneau (`_toucher`). Le doigt
  du joystick n'est pas sur la scène : il ne compte ni pour le regard (moitié droite) ni pour l'inclinaison à deux
  doigts. `touch-action: none` sur la zone. Un doigt à la fois ; relâché à la perte de focus de la fenêtre. 🩸 Avec le seul axe et une marge devant, on frôlait une face à quelques centimètres
  en biais : la caméra (plan proche à 5 cm) entrait dans le pilier et l'on voyait au travers ; et les types perso,
  dessinés en volume, n'arrêtaient rien. 2,8 m/s, × 2,5 avec Maj ou ▲ maintenu 0,6 s ; 90 °/s. En rendu galerie, la
  règle est celle de l'emprise (ci-dessous), même corps, même balayage ; l'image de collision du plan n'est pas lue.
  En rendu mixte, les deux règles à la fois (`_juger`) : celle des structures partout (image de collision comprise)
  et `KtaGalerie.paroisBloquent` (les parois **dessinées** des tubes et leurs pans de retour) ; dans une chambre,
  seules les structures arrêtent. Dans les trois rendus s'y ajoutent les zones qui bouchent (règle ci-dessous).
- **Zones obstacles de la 3D** (décision produit) : un remblais, un effondrement ou une zone inaccessible du niveau
  arrête le pas dans les trois rendus, en tube comme en chambre (`galerieEmprise.js > ZONES_BOUCHENT`, lu par
  `KtaGalerie.zonesBloquent` et `dansZone` ; `vue3d.js > _juger` l'ajoute à la règle du rendu). L'inaccessible y
  est par la constante `INACCESSIBLE_BOUCHE` seule (son rendu, hachures au sol et rideau, n'en dépend pas). Un
  segment est arrêté s'il finit dans une zone ou entre dans son contour ; ⚠️ contrat (jamais coincé) : une zone qui
  contient le départ du pas (ou le début du segment) ne l'arrête pas, et un contact au point de départ, sur le bord,
  ne compte pas. Une place dont le corps touche une zone est coincée (`_coince`) : ramenée au point libre le plus
  proche, à un corps du bord. Index des zones par niveau, gardé tant que la signature des données ne change pas
  (`_indexZones`, indépendant du modèle des galeries : le rendu structures n'en construit pas). ⚠️ contrat : la 3D
  seulement ; `ktaSegmentsBloquesParStructure` (pas du tracker), `versGalerie` (recalage), l'itinéraire, le guidage
  et la carte ne lisent aucune de ces zones (l'itinéraire 2D garde sa règle : seul l'inaccessible le coupe).
  Les **obstacles des accès** (cône d'un puits comblé `pc` / `psf`, cavage fermé `caf`, comblement d'un cavage,
  ci-dessous) suivent
  la même règle et le même contrat (`KtaGalerie.BLOQUE`, `_indexObstacles` : contour posé par `placePassage` dans le
  rendu affiché, que `zonesBloquent` / `dansZone` reçoivent de `_juger` et `_coince`).
- **Rendus mixte / structures / galerie** (décision produit, QCM du 02/11/2026 : interrupteur à trois états) : bouton
  🏛️🛣️ Mixte / 🏛️ Structures / 🛣️ Galerie, mode en cours écrit en clair, un toucher passe au suivant
  (`basculerRendu([vers])`), retenu par plan (`config.js > getPlanRenduVue3D / setPlanRenduVue3D`, pref `vue3dRendu`) ;
  sans choix, **mixte** quel que soit le niveau (`vue3d.js > _renduVoulu`, relu à chaque `_reindexer`). Basculer refait
  la scène.
- **Rendu mixte** (`KtaGalerie.modele(niveau, true)`, gardé à part du modèle galerie) : structures dressées partout
  (comme en structures, sol et plafond d'un seul tenant, tracés en rubans au sol), et les tracés en tubes **seulement
  là où aucune structure n'est autour**. ⚠️ contrat (décision produit) : **chaque côté du tube est jugé à part**
  (`galerieEmprise.js > _cotesOuverts`) : à chaque échantillon de l'axe (0,5 m), un point à w + 0,5 m de l'axe de
  chaque côté ; une structure du niveau, intégrée ou perso, filtres ignorés, à moins de `SEUIL_CHAMBRE_M` − w de ce
  point (w = demi-largeur) ouvre **ce côté** ; la pièce reste entière, la paroi d'en face reste. Un côté ouvert
  commence et finit là où un **pan de retour** perpendiculaire (`_cotesDuTube`, 1,5 m au plus, bout avancé par pas de
  10 cm) touche la structure, coupé à sa face (`_indexStructures > rayon` : premier bord croisé, ceux que juge la règle
  du pas) : ni fente ni bout de paroi orphelin ; aucun pan ne touche → le côté reste fermé. Les pans sont dans
  `paroisDe` (dessin) et `modele.retours` (collision). 🩸 Pas de `ktaSegmentsBloquesParStructure` pour ces pans :
  chaque appel relit la signature de toutes les structures (2 s de modèle sous émulation téléphone sur le plan dense).
  Aux nœuds, le bord du joint entre deux branches s'ouvre si l'une d'elles a ce côté ouvert (`_joint`, `r.cotesA` /
  `r.cotesB`). Les **deux** côtés ouverts (ou une structure en travers, qui ouvre les deux) = **chambre** : le
  morceau perd ses parois (coupe au seuil exact par dichotomie). Pourquoi 3 m : la paroi d'un tube principal est à 1,25 m de
  l'axe ; plus près, il resterait entre elle et la structure moins de 1,75 m (la largeur d'un chemin), une lame de
  roche doublée ; la structure borde donc la galerie elle-même (front, mur de consolidation, pilier de chambre).
  Un nœud est en chambre si l'échantillon d'une de ses arêtes, à lui ou voisin, l'est ; autour, les tubes s'arrêtent
  à la plus grande demi-largeur + 0,5 m (sinon la paroi d'une branche fermerait l'entrée d'une autre) et aucun joint
  n'y est construit. Un tube plus court que 3 m entre deux chambres (ou une chambre et un bout libre) est ouvert aussi :
  **aucune paroi orpheline** entre deux piliers. Le bout d'un tube qui débouche dans une chambre est **ouvert** (bord
  noté dans `piece.ouverts`, aucune paroi de fond). Parois = `modele.paroisDe(i)` (`galerieEmprise.js > _parois`,
  union des pièces, bouts ouverts exclus), la même source pour le dessin et pour la collision. Zones : règle de la
  galerie (découpées aux tubes, `_zoneGalerie`) si la zone touche un tube et qu'aucune structure n'est à moins de 3 m
  de son contour ni de son centre (`_zoneDeTube`), sinon règle des structures. POI : si l'axe le plus proche (10 m au
  plus) passe en tube à cet endroit et qu'aucune structure n'est à moins de 3 m, règle de la galerie (ramené contre la
  paroi, `_contreParoi`) ; sinon règle des structures (contre la face d'un pilier).
- **Hauteur** (décision produit) : `HAUTEUR` de la scène = `config.js > getPlanHauteurGalerie()` (2 m sans pref),
  **le même chiffre que ⛏️ Volume exploité**. Bouton **⛏️** (hauteur affichée par `formatDistance`) → − / + de 1,5 à
  20 m, par 0,1 m jusqu'à 5 m puis 0,5 m (`reglerHauteur(m)` : borné, arrondi, `setPlanHauteurGalerie`) ; une valeur
  saisie hors bornes dans ⛏️ est montrée telle quelle jusqu'au premier − / +. Les tuiles sont refaites sur place (`_refaireTuiles` : même
  index, position, cap, niveau, rendu) : structures, murs à 98 %, remblais et effondrements à 60 %, rideaux, tubes, plafond, œil
  (`_oeil`) et panneaux suivent.
- **Filtres = ceux de la carte** (décision produit) : ≡ de la vue ouvre **le** panneau ≡ Filtres (`FilterPanel.ouvrir`),
  posé par-dessus ; un seul état : masquer en 3D masque en 2D, et inversement. ⚠️ contrat : la vue dessine ce que
  la carte montre, règles lues à leur source à chaque `_reindexer` (`vue3d.js > _collecter`, `_montre`) : types de
  tracés, zones et structures et premier tag des POI (`_ktaRuntimeFilters`, `Set` = montrés, `null` = tout), calque
  de données coché (`dataLayerGroups[layerId]` ; la session vit dans « editor »), niveaux visibles
  (`passeFiltreNiveau`, POI jonction compris). L'itinéraire, comme en 2D, ne suit aucun filtre. Suivi par
  `FilterPanel.onChange`, appelé à tout changement (types, tags, calque, niveaux par `onLevelChange`, plan de base) :
  la scène est refaite à l'image suivante (`_e.filtresChanges`, une fois pour plusieurs cases). Masquer ne retire
  que le dessin : collisions, parois des tubes et passages 🪜 restent ; le choix du rendu par défaut compte toutes
  les structures. En galerie, le liseré suit le type de tracé (les tubes, collision, restent). Les calques image et le
  plan de base n'ont pas d'objet en 3D : leurs cases restent dans le panneau, sans effet sur la scène. Pastille de
  filtre actif sur le ≡ de la vue (`data-kta-pastille-filtres`, posée par `FilterPanel.majBadge`).
- **Données changées pendant la vue** : objet ajouté, modifié ou supprimé (fiche de la carte, setRoads / setZones /
  setStructures / setEditorPoints, import, Tableur, Secours), annulation / rétablissement, calque rapatrié, restitué
  ou verrouillé (`CalqueSession`), couleurs et types `cust-…` de la légende, raccords et niveaux d'un POI jonction.
  ⚠️ contrat : un seul signal, `kta:donneesPlanChange` (`utils.js > ktaSignalerDonneesPlan`, detail `{ source }`),
  émis par les rendus de la carte (`renderRoads`, `renderZones`, `renderStructures`, `renderEditorPoints` : toute
  écriture finit par l'un d'eux, la légende repeint par eux aussi) et par `CalqueSession._invaliderLectures`. Jamais
  pour un redessin d'affichage seul : carte déplacée ou zoomée sous la décimation PerfUltra et réglage PerfUltra
  appellent `renderRoads({ affichage: true })` (`road.js > _renderRoadsThrottled(true)`), qui ne signale rien. C'est
  un **indice**, pas une preuve : un rendu part aussi sans rien changer (option de la carte, filtres). La vue (`vue3d.js > _majDonnees`) attend la fin de la rafale (120 ms sans signal, 600 ms au plus après le
  premier : une annulation répétée ou un import = une reconstruction), jamais pendant un geste de passage (rattrapée
  à sa fin), puis relit son **empreinte** (`_empreinteDonnees` : chaque sommet, chaque champ simple des objets de la
  session et des calques, état de la légende de la session ; filtres exclus, ils ont leur signal ; **ni l'itinéraire
  ni les aperçus `_preview`**, qui ont `kta:itineraireChange`) : inchangée, rien ;
  changée, caches de `KtaGalerie` vidés et scène refaite **entière** sur place (`_reindexer` : position, cap,
  tangage, niveau dont `niveauLibre`, mode, vue, inclinaison, zoom, portée, lampe, `reglagesFiges`, itinéraire et
  guidage gardés). Sans signal, aucun coût (ni relecture, ni reconstruction). 🩸 Pas la signature de KtaGalerie :
  bon marché à dessein (premier et dernier sommets, longueur du type), elle ne voit ni un sommet du milieu déplacé,
  ni un renommage, ni une couleur. Un filtre ou un itinéraire changé en même temps que des données en attente
  (`setRoads` annonce aussi l'itinéraire) attend la relecture : données changées, la reconstruction refait tout ;
  inchangées, l'itinéraire seul est refait ensuite (`_refaireIti`, ci-dessous). En libre, à l'ouverture comme quand un obstacle
  neuf la recouvre, une place dont le centre est dans une structure dessinée est dégagée au point libre le plus
  proche, cherché à un corps de toute structure (`_degager(true)` : la règle du pas ignore la structure où l'on est,
  on en sortirait mais la place serait dans le pilier) ; une place seulement proche d'une face ne bouge pas ; en
  suivi, rien (la place est celle du tracker). Fiche ouverte : son POI retrouvé (même objet, sinon même `uid`) est relu, disparu elle
  se ferme. Greffe : `scene(ctx, "refaite")`. Coût mesuré (`KTA_V3D_PERF=1`, voir `docs/ETUDE_VUE_3D.md` § Mesures).
- **Emprise des galeries** (`js/galerieEmprise.js`, `window.KtaGalerie`, chargé au démarrage pour servir aussi le pas) :
  graphe plan des tracés du niveau (sommets confondus à 15 cm, croisements coupés en nœuds, bout libre arrêté à moins
  de 0,5 m de la paroi d'un autre tracé raccordé à lui), largeur par type (`KtaGalerie.largeur` : principal 2,5 m,
  secondaire 2 m, chemin 1,7 m, perso 2 m ; ni `itinerary` ni `jonction`). Une **pièce** convexe par tronçon
  (rectangle d'un nœud à l'autre) et, par nœud de degré ≥ 2, les triangles d'un **joint** : coude en onglet borné à
  deux demi-largeurs (biseau au-delà), dalle de carrefour (degré ≥ 3) dont les coupes reculent jusqu'au point où les
  parois voisines se croisent (4 m au plus) et dont les parois relient les coins. ⚠️ contrat : l'emprise est
  l'**union** des pièces ; une paroi est un morceau de bord de pièce dont le point juste à l'extérieur n'est dans
  aucune autre pièce (`galerieEmprise.js > _parois`, `modele.paroisDe`). D'où des tubes coupés au bord des dalles et **aucune paroi qui en
  traverse une autre**, même pour deux tracés presque parallèles qui se chevauchent (ils se fondent). 🩸 Le graphe de
  `roadGraph.js` n'est pas réutilisé : c'est un graphe d'itinéraire (croisements en arêtes virtuelles, tronçons non
  coupés, tronçon retiré s'il croise un mur en ligne, types perso exclus).
- **Jamais coincé** (`vue3d.js > _degager`, `_sortie`) : à l'ouverture en mode libre et à l'arrivée d'un passage 🪜, une
  place hors de l'emprise (galerie) ou d'où aucun pas de 0,3 m n'est possible (structures, mixte : dans un pilier, dans
  la roche de l'image de collision) est ramenée au point libre le plus proche : l'axe du tracé le plus proche
  (`KtaGalerie` du rendu, `plusProche`) à moins de `smartNavRadiusM` (6 m, le rayon du verrou sur tracé ; pas
  celui du recalage, `KtaGalerie.PROCHE_M`), sinon un point libre cherché en couronnes de 0,25 m. 🩸 Une accroche de POI
  jonction posée à côté de la galerie figeait la vue après le passage. ⚠️ contrat (`_coince`) : en **mixte** comme en
  galerie, une place hors des tubes, hors d'une chambre et à moins de `smartNavRadiusM` d'un axe en tube est coincée
  (🩸 elle restait dans la roche, d'où un pas était possible mais jamais à travers la paroi pour entrer). Rien trouvé : `_pas` laisse passer tout pas qui
  rapproche de l'axe le plus proche (30 m), ou tout pas sans tracé. En suivi, la place reste celle du tracker.
- **Règle du pas en galerie** : `KtaGalerie.segmentsBloques(segs, niveau)`, même forme que
  `ktaSegmentsBloquesParStructure` (lot de segments → booléens) : bloqué si un point (tous les 5 cm) sort de l'emprise
  (à moins d'une demi-largeur d'un tracé ou dans un joint) ; les zones qui bouchent s'y ajoutent (ci-dessus).
  `KtaGalerie.dedans` = dans l'emprise et hors de ces zones. Niveau sans galerie : rien n'arrête que les zones.
  `versGalerie` (recalage du tracker) ne lit que l'emprise. Départ dans une zone : ramené au point libre le plus
  proche (jamais coincé, ci-dessus). Parti d'en dehors des galeries (tracker hors tracé), on se déplace librement pour y entrer.
- **Scène galerie** : sol et plafond = les pièces, texture calcaire posée en coordonnées monde (pièces superposées sans
  couture) ; parois (galeries, tubes du mixte, puits et tranchées des passages : un seul matériau `paroi`) en
  **pierre de taille** quand 🧱 Textures est activé (`_paroiTexturee` : `_appareil` + `_assisesPierre`, `PIERRE` :
  256 px, motif de 2 m, assises de hauteur tirée, blocs de longueur tirée, joints irréguliers, arêtes émoussées,
  normal map `_carteNormale`). 🧱 coupé (décision produit, révisée : `ETUDE_VUE_3D.md`) : parois des galeries et
  des tubes **unies à la couleur de légende du type de tracé** de leur pièce (`_couleurParoi` → `_couleur("traces",
  type, "color")`, canon `ktaResolveStyle` à plat : types `cust-…` et couleurs choisies compris ; matériau
  `paroiUnie`, couleurs de sommets) ; carrefour et coude : le type de l'arête la plus large (`type` de la pièce,
  galerieEmprise.js) ; sol et plafond **noirs** dans les trois rendus (`_grainSol`, décision produit) : panneaux de
  POI (toujours devant, fond des jetons sombres), ruban d'itinéraire et chevrons (non éclairés), liserés, ronds,
  zones et plan au sol (dessiné après le sol) passent dessus ; légende changée vue ouverte : l'empreinte la lit, les
  couleurs résolues sont relues (`_majDonnees` vide `e.couleurs`). Puits et tranchées des passages : **moellons** de
  calcaire taillés (`_moellons`, constantes `MOELLON` / `MOELLONS_MOTIF` : blocs de 40 × 25 cm ± 25 % en longueur,
  assises horizontales à joints décalés, teinte par bloc autour de `MOELLON.couleur`, mortier plus sombre ou plus
  clair, grain ; motif de 1,6 × 1 m à 160 px/m, canvas, aucune image). ⚠️ contrat : coordonnées de texture **en mètres** (`_paroiY` :
  u le long de la paroi, v = hauteur depuis le sol, une assise part du sol) ; la taille du motif est la `repeat`
  de la carte (pierre 1/2, moellons 1/1,6 × 1/1), jamais la géométrie : aucun étirement de 1,5 à 20 m de hauteur, et
  la bascule ne remplace que la carte du matériau (aucun matériau de plus) ; liseré au sol de 15 cm, couleur de la
  légende (`ktaResolveStyle`) ; itinéraire en ruban lumineux ; un tracé jonction n'est pas un tube : c'est une rampe
  (volumes des passages, ci-dessous). Structures (intégrées et perso)
  ni dessinées ni bloquantes (sauf en rendu mixte, ci-dessus). Zones découpées à chaque pièce (Sutherland-Hodgman, CPU, par tuile) : eau à 4 cm (matériau
  à profondeur stricte, sinon les recouvrements se mélangent deux fois), remblais et effondrement à 60 % avec une
  face seulement là où ils donnent sur la galerie (`_remblaisGalerie`), inaccessible au sol + **rideau rouge hachuré en travers du tube** à chaque point où le
  contour coupe l'axe (`_hachurer`), perso au sol. **POI** à moins de 10 m de l'axe d'un tracé, ramenés
  contre la paroi la plus proche (8 cm devant) s'ils sont au-delà ; plus loin, masqués ; toujours sans test de
  profondeur. Vue d'édition : plafond des pièces masqué, parois vues des deux côtés.
- **Passages de niveau 🪜** (en libre ; en suivi, le niveau est celui du tracker) : à moins de 2 m d'un POI jonction
  (`KtaPoiJonction` : niveaux liés, raccords validés ; montré sur chacun de ses niveaux, à la place de son volume, ci-dessous ; jamais `pa`,
  qui n'a pas de moyen) ou d'un bout de tracé `jonction` (pris dans les deux sens), une boîte à gauche : boutons
  **nommés** vers le niveau lié voisin au-dessus ou au-dessous (profondeurs saisies, sinon numéro), « ▼ -1 · Nom (moyen) »
  (`_textePassage`, nom coupé à 22 signes à l'écran, entier au libellé accessible ; tracé : « ▼ -1 (tracé jonction) »),
  une liste s'il y en a plus d'un de chaque côté. La fiche du POI jonction propose les mêmes niveaux (ci-dessous).
  Arrivée (`_basculerNiveau`) : raccord validé du niveau, sinon bout opposé du tracé jonction, sinon le point (s'il est
  à plus de 2 m) ; ramenée dans le tube si elle tombe à côté (`_degager`) ; cap (`_capArrivee`) le long de
  l'itinéraire s'il passe à moins de 3 m (`apercu > capTrajet`, vers sa prochaine consigne), sinon le long de l'axe de
  galerie le plus proche, du côté où il est le plus long, sinon gardé. ⚠️ contrat (décision produit) : la 3D change
  seulement **son** niveau (`niveauLibre`, oublié si le niveau actif de la carte change ou en repassant en suivi) ; ni
  le tracker ni la carte 2D ne bougent pendant la 3D. **Ouverture en libre** sur la place d'un tracker recalé
  (`getTrackingPositionEtat().confirmee`) : `niveauLibre` = niveau du **tracker** (un « Je suis ici » sur un POI du −1
  vu depuis le 0 laisse la carte au 0) ; tracker jamais recalé : niveau actif de la carte. `checkup-vue-3d.js` § 14.
- **Geste d'un changement de niveau** (`_lancerGeste`, `_majGeste`, décision produit) : fondu noir (`GESTE.fondu`
  250 ms, `.kta-v3d-fondu` au fond des jetons sombres, sous les boutons) de part et d'autre de la **bascule**, où la
  scène du niveau d'arrivée est construite (au noir). Passage 🪜 ou fiche : la caméra s'enfonce (descente) ou monte
  dans le volume pendant la première moitié de `GESTE.ms` (1 s), jusqu'à 0,8 m sous le sol ou au-dessus du plafond,
  puis arrive du plafond (ou du sol) du niveau d'arrivée ; vertical seul, sans rotation, tenu par `dt` dans la boucle
  d'image (`_image`), rendu continu seulement pendant le geste ; un second passage pendant le geste est refusé.
  Niveau changé hors passage (tracker en suivi, niveau actif de la carte) : le fondu seul (500 ms). Ensuite le bandeau
  « Niveau n » 2 s (`_annoncerNiveau`, `vue3d.niveauBandeau`). `prefers-reduced-motion` : fondu seul.
  `KtaVue3D.gesteAnime(false)` bascule sans geste (mesures, checkup).
- **Volumes des passages** (`_volumesDuNiveau`, `_construireVolume`, décision produit) : place et axe par
  `KtaGalerie.placePassage` (`galerieEmprise.js > _placeVolume`), la seule règle, lue aussi par le panneau du POI, le
  🪜 et l'emprise qui ouvre le tube. Raccord validé du niveau (celui du niveau du POI compris) : au point exact (un escalier : en niche à
  cette place, ci-dessous). Sinon
  le POI, que l'on pose **en général à côté de l'axe** (lisible en 2D) : en galerie et dans un tube du mixte (hors
  chambre), à moins de `PROCHE_M` d'un axe, le volume est posé **dans le tube**, du côté du POI, bouche et cadre doré
  entre les parois (au plus w − demi-emprise de l'axe, sur l'axe si le tube est plus étroit) ; hors de l'emprise, la
  galerie est d'abord gagnée par le trajet de `versGalerie` (celle dont l'emprise est la plus proche). 🩸 Posé au
  point, le puits d'un POI dans la roche restait derrière la paroi, bouche hors du sol dessiné : invisible au niveau
  du POI, visible seulement au raccord validé de l'autre. 🩸 Près d'un carrefour, l'emprise la plus proche peut être
  celle d'une autre galerie : seul un raccord validé du niveau tranche. Rendu structures (sol partout) : le point.
  Le panneau suit le volume s'il est posé ailleurs que le point (`_placePanneau`) ; le POI enregistré, la 2D,
  l'itinéraire et le tracker n'en savent rien. Aligné sur l'axe de galerie le plus proche de cette place : `jes` / `eso` cage d'escalier
  2,5 × 1,5 m (10 marches pleines en calcaire uni ; **entrée** — pied de la volée qui monte, haut de celle qui
  descend, côte à côte entre trois niveaux — `placePassage > entree`). **Escalier en niche latérale** (`jes`, `eso`,
  `esf` ; `galerieEmprise.js > _niche`, décision produit : jamais en plein milieu de la galerie) : dans un tube
  (galerie, mixte hors chambre, axe à moins de `PROCHE_M`), la volée est **perpendiculaire** à l'axe, du côté du POI
  (POI sur l'axe à 1 cm près : à gauche du sens du tracé, carte nord en haut) ; avec un raccord validé du niveau, à
  sa place exacte le long de la galerie et du côté du raccord (`_nicheAuRaccord`, même règle sur l'axe), pied contre la paroi (centre à w + 1,25 m
  de l'axe), montée ou descente vers le fond de la niche ; le passage de la galerie reste libre, la paroi s'ouvre
  devant la niche (son emprise, pièce « niche » du modèle), fond et côtés murés ; 🪜 au pied de la volée. 🩸 La niche
  reste contre la paroi quel que soit l'écart du POI (profondeur = la volée) et n'évite pas une galerie voisine plus
  proche que sa profondeur. Exceptions, dans l'axe : POI **au bout d'un cul-de-sac** ou au-delà (`_auFond` : volée
  vers le fond, entrée côté ouvert), rendu structures, chambre (raccord validé : au point exact), aucun axe à
  `PROCHE_M` (le point ; aucun axe à `DIR_PASSAGE_M` : orientation arbitraire, est-ouest). Dans l'axe, l'entrée est du
  côté où la galerie continue le plus longtemps depuis la place (`_entree` : longueur de galerie atteinte de chaque
  côté sans repasser par l'arête ; arête dans une boucle ou égalité : sens du tracé). 🩸 Le sens a → b d'une arête
  est celui du dessin, arbitraire : seul, il mettait le haut de la volée face à qui arrive),
  `jpe` / `peo` puits de 1,2 m à échelons (tous les 0,3 m, deux montants), `jps`
  puits nu, `pa` tube de 0,8 m à grille. Ouvert dans le **sol** vers un niveau lié au-dessous, dans le **plafond** vers
  un niveau lié au-dessus, les deux entre trois niveaux ; parois (matériau des galeries) sur 6 m au-delà (le reste se perd dans le
  noir). Puits de surface (`peo`, `eso` au plus haut de leurs niveaux, `pa` partout) : plafond seulement, sans 🪜 ;
  disque de ciel (sprite clair non éclairé) au sommet de `peo` / `eso`. Cadre doré au sol d'un passage. Un tracé
  `jonction` (filtre de son type respecté) devient une **rampe** de 1 m à sa couleur du canon : du sol au plafond vers
  un niveau au-dessus, du sol à −hauteur dans une tranchée ouverte vers un niveau au-dessous. ⚠️ contrat : les
  **bouches** marquent le gabarit (stencil, `boucheSol` = 1, `bouchePlafond` = 2, `renderOrder` −1, ni couleur ni
  profondeur) et les matériaux du sol et du plafond (plan unique et pièces des tubes) ne se dessinent pas là
  (`NotEqualStencilFunc`) : on voit dans le puits ; le contexte est créé avec `stencil: true`. Construits à portée
  (`_gererVolumes`, règle des tuiles), libérés au loin ; 🩸 après une perte du contexte, jamais `dispose()` sur un
  volume de l'ancienne scène. Aucune collision : le pas reste la règle du tracker.
- **Aucune paroi de tube dans un passage** (mixte et galerie) : `galerieEmprise.js > _emprisesPassages` rend l'emprise
  de chaque volume du niveau (bouche + cadre doré, mêmes règles que `_volumesDuNiveau`, place et axe par le même
  calcul `_placeVolume`, jugé sur les tubes et joints seuls, dimensions
  `KtaGalerie.PASSAGE`, que `vue3d.js > VOLUME` lit) et celle de la tranchée d'un tracé jonction (un rectangle par
  segment). Une emprise qui chevauche un tube devient une **pièce** du modèle : l'emprise étant l'union des pièces,
  bout de cul-de-sac, paroi qui longe la bouche ou la coupe tombent dedans ; ses bords hors des tubes sont des parois :
  le tube s'ouvre sur une **niche** autour de la bouche (bout de cul-de-sac, tube plus étroit que la bouche, raccord
  validé hors du tube, escalier en niche latérale), et l'on peut y marcher (`dedans`, `paroisBloquent`, `ctx.libre`
  des add-ons : une seule source). ⚠️ contrat : la niche latérale d'un escalier est une pièce « niche » que
  `versGalerie` ignore (recalage de la 2D inchangé : un tracker recalé n'y entre pas). Une emprise qui ne touche aucun tube n'ajoute rien (pas de boîte murée autour d'un passage isolé). 🩸 Sans
  cela, une paroi du sol au plafond passait au travers de la cage, vue dans le trou en vue d'édition. Filtres ignorés (masquer
  ne retire que le dessin). Les **rubans des tracés** et les liserés (matériau `rubans`) lisent le gabarit du sol comme
  le sol : coupés à la bouche, jamais suspendus au-dessus du vide ; l'itinéraire (marqueurs à mât) n'est pas coupé.
  `checkup-vue-3d.js` § 14 bis (test géométrique, 3 rendus, 2 niveaux) ; POI décalés de 1 à 5 m, carrefour, raccords,
  panneau et 🪜 au volume : § 14 ter.
- **Accès de surface sans passage** (`vue3d.js > _volumeAcces`, `_acces` ; formes et dimensions :
  `galerieEmprise.js > ACCES`, `ACCES_DIM` ; décision produit) : un volume à la place d'un passage (`placePassage`,
  demi-emprise propre à l'accès, `_demiAcces`), panneau au-dessus, construit à portée, **sans moyen** (ni 🪜, ni cadre
  doré, ni itinéraire, ni coût vertical : `KtaPoiJonction.moyen` nul) et **sans emprise** (aucune pièce :
  `versGalerie` et le recalage ne changent pas), sauf la niche latérale d'`esf` (celle d'`eso`, ignorée par
  `versGalerie`). `esf` / `pef` : la cage à marches d'`eso`, le puits à échelons de
  `peo`, fermés par une dalle sombre à 2,5 m au-dessus du plafond (pas de ciel). `pb` : dalle maçonnée (matériau des
  parois) au ras du plafond, plafond non troué. `pc` / `psf` : bouche au plafond (carrée de 1,2 m / ronde de 2,5 m)
  remplie de remblais sur 0,5 m, et **cône d'éboulis** au sol (rayon 0,9 m, 0,6 m de haut, 16 côtés) qui arrête le
  pas (le cône du `psf` garde ce rayon sous sa bouche plus large) mais **ne ferme jamais la galerie** (décision
  produit, même règle que le bassin) : dans un tube, `placePassage` rend aussi `cone` (`galerieEmprise.js >
  _coneDans`), centre sous la bouche s'il laisse `bassinLibre` (0,8 m, un corps) plus `CONE_JEU_M` (0,1 m : à
  0,8 m tout juste, le corps touche cône et paroi à la fois, et la règle du pas l'arrête) jusqu'à la paroi d'en face,
  sinon poussé vers la paroi du côté du POI juste assez, enfoncé dans sa paroi (la roche en cache une part : il se
  couche contre elle), centre au plus sur la paroi (galerie de moins de 1,8 m : rayon réduit, hauteur à la même
  pente ; moins de 0,95 m : aucun cône) ; POI sur l'axe : à gauche du sens du tracé. Principal 2,5 m : centre à
  0,55 m de l'axe ; secondaire 2 m : 0,8 m ; chemin 1,7 m : sur la paroi, rayon 0,8 m. La bouche ne bouge pas. En
  chambre, en Structures, sans axe à 10 m : centré sur la place, comme avant. Un seul contour pour l'obstacle
  (`_obstaclesAcces`), le dessin (`_cone`, `v.cone`), le ruban (`_volumesItiAcces`) et `ctx.libre` des add-ons ;
  l'itinéraire 2D n'en sait rien. L'itinéraire passe par-dessus (`_volumesItiAcces`, comme un remblais, à 0,6 m). `ps` : puits rond maçonné de 2,5 m (`ACCES_DIM.rond`, comme
  `psf`), sans échelons, ciel au sommet. `pe` : bassin rond de 1,6 m creusé dans le sol (bouche au sol), margelle de
  0,2 × 0,4 m, eau à −0,8 m (couleur de la zone eau, matériau de l'eau des galeries), fond à −1,2 m ; posé **contre
  la paroi** du côté du POI (`_placeVolume`, `contre` : margelle tangente à la paroi, à w − 1 m de l'axe) ; galerie
  trop étroite pour laisser `ACCES_DIM.bassinLibre` (0,8 m, un corps) entre la margelle et la paroi d'en face : il
  s'enfonce dans SA paroi d'autant (centre à 1,8 m − w de l'axe, jamais au-delà ; sans niche), soit dans toute
  galerie de moins de 2,8 m (les trois types intégrés : 0,55 m de l'axe en principal, 0,95 m en chemin) ; il
  **n'arrête pas** le pas (hors de `BLOQUE`, décision produit : on passe à côté, le long de la paroi d'en face).
  🩸 Le passage laissé est contre l'autre paroi, pas sur l'axe : de 1,25 à ~4,35 m de large (les trois types
  intégrés), le bassin couvre l'axe et le ruban de l'itinéraire, qui le suit, monte sur la margelle là où il la
  croise (`_volumesItiAcces`), jamais dans l'eau. `cao` / `caf` : **porte à deux battants** en travers de la
  galerie, posée sur l'axe (demi-emprise infinie : elle barre toute la largeur), largeur = celle de la galerie à cet
  endroit (demi-largeur de l'axe le plus proche, 2 m sans galerie), cadre de fer, paroi au-dessus du linteau (2,1 m,
  borné par la hauteur) jusqu'au plafond ; `caf` fermé arrête le pas sur toute la largeur (obstacle de 0,2 m qui
  déborde de 0,4 m dans la paroi), `cao` a ses battants rabattus à 90° contre les parois. **Comblement** (décision
  produit : une porte de la largeur du tracé dans une galerie plus large se contournait) : en mixte et structures, de
  chaque côté, pierre de taille du cadre jusqu'à la structure la plus proche (mur, pilier, front), cherchée dans le
  plan de la porte depuis l'axe (`KtaGalerie.comblementPorte`, rayon sur les bords des structures du niveau), au plus
  `COMBLE_MAX_M` = 3 m au-delà du cadre (plus loin : une chambre, rien), du sol au plafond, enfoncée de 5 cm dans la
  structure ; deux côtés indépendants (inégaux si le tracé est décalé) ; la porte garde sa taille. Il arrête le pas
  comme la porte fermée, `cao` compris (`_obstaclesAcces` : `caf` d'un bout de comblement à l'autre, `cao` chaque
  comblement seul, l'ouverture du cadre reste libre) ; `ctx.libre`, `_coince` et `_degager` le lisent par
  `dansZone` / `zonesBloquent`. Mur de porte homogène (décision produit) : paroi au-dessus du linteau et comblement
  en pierre de taille des parois avec 🧱, unis (`PIERRE.couleur`) sinon. Rendu galerie : aucun comblement (les
  parois du tube, de la largeur de la porte, la bordent déjà). Itinéraire 2D inchangé. Un itinéraire 2D finit au
  cavage (bout du chemin sur l'axe) : l'arrivée est atteinte devant la porte, à un corps d'elle. Bois des battants
  (planches, pentures cloutées, `_bois`) et remblais texturés avec 🧱, couleurs unies sinon (bascule = volumes
  refaits). 🩸 Un puits rond dans un tube plus étroit que lui reste sur l'axe et dépasse dans la paroi (pas de
  niche, voulu). Garde-fou : `checkup-vue-3d.js` § 14 quater (3 rendus, blocage, bassin contre la paroi qu'on longe,
  arrivée devant un cavage fermé, 🧱 coupé, 2D intacte ; suite, `KTA_V3D_SEUL=cone` : cône qui laisse le passage en
  galerie de 2,5 / 2 / 1,7 m, pc et psf de chaque côté, aller et retour, butée sur le cône, `ctx.libre`, chambre,
  Structures et POI loin inchangés), comblement : § 14 sexies (galerie de 4 m entre deux murs,
  côtés égaux et inégaux, porte fermée et ouverte, rendu galerie identique sans et avec les murs) ; escaliers en niche : § 14 quinquies (POI d'un côté, de
  l'autre, dans le tube, sur l'axe, boucle, bout de cul-de-sac, tracé dans les deux sens, `esf` / `eso` / `jes` vers
  le haut, le bas et entre trois niveaux ; niche marchable, paroi ouverte, fond muré, 2D intacte).
- **Suivi / libre** (`basculerSuivi`, bouton 🧭 Suivi / 🕹️ Libre) : en suivi, position du tracker et cap de
  l'appareil lissés,
  lus à la source du mode « plan orienté » (`getPlanRelHeading`, offset Nord compris) ; le lissage reste celui de
  la vue (pas celui de `mapBearing.js`, qui ne tourne que mode activé). Ouvert en suivi si le tracker tourne,
  sinon en libre ; tracker arrêté en route → libre, 🧭 grisé (`vue3d.suiviIndispo`, toast au toucher). Tout
  bouton de déplacement passe en libre ; en suivi, glisser sur la scène ne règle que le regard haut / bas (le
  cap reste celui de l'appareil). Un écart de cap sous 2° (bruit de la boussole) ne redessine pas ; un vrai virage
  est suivi jusqu'à 0,2° près.
- **Rendu en pause** : la boucle `requestAnimationFrame` tourne, mais ne dessine que si quelque chose a bougé
  (`_e.sale`) ; immobile, aucune image (le checkup le mesure, boussole qui tremble comprise).
- **Vue d'édition** (nom de code `plongee` ; décision produit : comme une carte) : caméra au **recul** `e.recul` du point visé (2 m devant
  soi), 18,4 m par défaut, de 6 à 60 m (`RECUL`) ; inclinaison 15° à 85° (60° par défaut). **Zoom** (`zoomer(f)`,
  un cran = × 1,15) : molette (vers l'avant = plus près, un cran par 100 px de défilement, en continu au pavé
  tactile), pincement à deux doigts, boutons + / − (deux crans), touches = et -. **Inclinaison** : Maj + molette
  (🩸 Chrome et Safari envoient alors le défilement en `deltaX`), deux doigts glissés ensemble à la verticale,
  PageUp / PageDown, boutons ▲ ▼. Deux doigts : le geste est tranché une fois, dès que l'écart ou le milieu a bougé
  de 12 px (`GESTE_SEUIL`) : un pincement ne penche pas, un glisser ne zoome pas. Boutons + − ▲ ▼ en grille en bas à
  droite, montrés dans cette vue seulement (la tuile ⚙️ ouverte ne les recouvre pas). Recul et inclinaison retenus
  tant que la vue est ouverte (repartent du défaut à la réouverture). ⚠️ contrat : une greffe qui interdit la
  vue d'édition (`ctx.regler({ plongee: false })`) refuse aussi le zoom (`zoomer` rend le recul inchangé). Rayon de scène
  en vue d'édition (`_rayonScene`) : max(1,4 × portée, 2,3 m par mètre de recul) — tuiles, volumes, panneaux de POI, carré
  de sol (2,4 × le rayon) et brouillard (compté depuis la caméra : du recul + 30 % du rayon au recul + rayon + 2 m)
  le suivent : pas de bord de scène en dézoomant. À 60 m de recul, 138 m de rayon (mesures : ETUDE_VUE_3D.md).
- **Portée** (curseur 🔭 de la tuile ⚙️, `config.js > getVue3DPortee`, réglage de cet appareil, décision produit) :
  15 à 100 m au mètre près, 30 m par défaut (`V3D_PORTEE`) ; `reglerPortee(m)`. Brouillard noir complet à la portée,
  profondeur de la caméra (portée + 5 m), portée de la lampe et rayon des tuiles suivent à l'image suivante
  (`_appliquerPortee`, tuiles construites au plus 3 par image : pas d'à-coup). `ouvrir({ distanceVue })` (mesures,
  checkup) passe avant le réglage sans l'écrire. Clavier : flèches, Origine, Fin sur le curseur (le clavier de la vue
  lui laisse ces touches) ; valeur dite par `aria-valuetext` (`formatDistance`).
- **Lampe** (réglages de la tuile ⚙️, cet appareil, décision produit : `config.js > getVue3DLampeIntensite`,
  `getVue3DFaisceau`, `getVue3DPleinJour`) : 💡 **intensité** en curseur, 25 à 300 % par pas de 5, 100 % = la lampe
  d'origine (`reglerLampe(%)`) ; 🔦 **faisceau** en curseur, 40 à 160° de cône total, 71° par défaut = demi-angle de
  0,62 rad d'origine (`reglerFaisceau(°)`) ; ☀️ **Plein jour** en interrupteur (`reglerPleinJour(bool)`).
  Intensité k (`_courbeLampe`) : au-dessus de 100 %, c'est la décroissance qui porte (1,2 · k^−1,263), force
  × (1 + 0,25 (k − 1)), coupure × (1 + 0,3 (k − 1)) de la portée, halo × (1 + 0,5 (k − 1)), brouillard commencé à
  45 % + 35 % (k − 1) de la portée, au plus 85 % ; 200 % = l'ancienne lampe Forte exactement (× 1,25, 0,5, × 1,3,
  × 1,5, 80 %) ; 300 % = × 1,5, 0,3, × 1,6, × 2, 85 % (à 20 m, ~22 fois l'éclairement de 100 % ; 2,8 fois à 2 m :
  rien ne brûle de près). Sous 100 % : force et halo × k, coupure × √k, décroissance de 1,2 à 1,6, brouillard de 45
  à 25 % (25 % : force × 0,25, portée moitié). Faisceau (`_coneLampe`) : demi-angle = cône / 2 (160° = 80°, sous la
  borne π/2 du SpotLight de three.js), pénombre de 0,4 (40°) à 0,55 (71°), puis jusqu'à 1 (160° : le bord se fond
  dans le noir au lieu de dessiner un rond net). **Plein jour** = éclairage d'ambiance de la vue d'édition (0,9) à
  hauteur d'yeux, lampe inchangée, brouillard gardé à la portée (même coût, la portée reste le seul réglage de
  « jusqu'où l'on voit »), commencé à 65 % au moins. Ancienne clé `myktamap_v3d_lampe_v1` lue tant que les
  nouvelles manquent : « forte » = 200 %, « jour » = Plein jour ; jamais réécrite. ⚠️ contrat : la lampe se
  **multiplie** au facteur `lampe` d'une greffe (`_lampeGreffe` : force × courbe × k, portée × coupure × max(0,06, k),
  comptée sur la portée réglée et rendue au retrait). ⚠️ contrat : une greffe qui pose
  **`ctx.regler({ reglagesFiges: true })`** (`_fige`) impose la portée par défaut (30 m), la lampe à 100 %, le
  faisceau de 71° et Plein jour coupé, trois curseurs et ☀️ grisés, `reglerPortee` / `reglerLampe` /
  `reglerFaisceau` / `reglerPleinJour` rendent false ; les réglages retenus (`e.porteeVoulue`, `e.lampeVoulue`, et
  ceux de l'appareil) ne sont jamais réécrits et reviennent tels quels au retrait ou avec la clé à false
  (`_appliquerGreffeReglages`). Sans la clé, une greffe garde portée et lampe de l'utilisateur, Plein jour compris.
  `etat().lampe` reste le facteur de la greffe (intensité / force de la courbe).
- **Boussole** : `icon/compass.svg` tournée de −(cap plan − `getPlanNorthOffset()`), la convention de `compass.js`.
  Plan sans Nord calibré (`config.js > getPlanNorthCalibre` : ni pref du plan ni `plan.northOffsetDeg`) : haut du
  plan, dit seulement au libellé accessible (`vue3d.nordNonCalibre`, aucun texte à l'écran). Rose posée sur la
  carte de la petite boussole du mode plan (surface 88 %, liseré doré). Relu à `kta:northOffsetChange`.
- **Clavier et focus** : dialog `aria-modal`, focus posé dans la vue à l'ouverture, Tab y reste, focus rendu au
  bouton cube à la fermeture. Échap ferme d'abord le réglage de hauteur ou la fiche ouverts, puis la vue ; une fenêtre de l'app
  par-dessus (≡ Filtres, Aide, Sortie d'urgence, confirmation) garde ses touches (`_recouverte` : au centre de
  l'écran, un élément qui n'est pas de la vue).
- **🚨 Sortie d'urgence** : la même action que l'en-tête (`SortieUrgence.declencher`), sa fenêtre par-dessus la vue ;
  sans position connue du tracker (`SortieUrgence.demandeLaCarte`), la vue se ferme d'abord (le pointeur « Où
  es-tu ? » est sur la carte).
- **Caméra libre de la vue d'édition** (décision produit : comme une carte ; `_panner`, `panner(dx, dz)`,
  `surPlace()`) : un doigt glissé (la souris au PC), au-delà de 8 px (`CAMERA_LIBRE.seuil` : un toucher qui pose un
  sommet bouge d'un ou deux px), déplace le **point visé** `e.vise` (m), jamais la place : le sol pris sous le doigt
  reste sous le doigt (rayons contre y = 0, un pas borné au recul), dans le repère de l'écran quel que soit le cap.
  ⚠️ contrat : avatar, `e.pos` et tracker ne bougent pas (la 3D ne recale jamais le tracker sans demande). **Cap** :
  deux doigts tournés (le décor suit les doigts, comme la carte 2D tournée à la main) : tranché en arc parcouru depuis
  la pose des doigts (plus de 18 px, deux fois le glisser vertical et l'écart du pincement ; 🩸 les doigts arrivent un
  événement après l'autre : un seul doigt bougé de 8 px tourne déjà la paire de 15° à 30 px d'écart) ; au PC, clic
  droit ou Ctrl + glisser, pavé ↶ ↷, clavier ; en suivi, le cap reste celui de l'appareil. **Retour sur la place** :
  ⌖ (montré caméra détachée seulement), marcher (joystick, pavé, clavier : `_rattacher` — règle : le doigt déplace la
  caméra, les commandes déplacent la place et la caméra la rejoint) et le retour à hauteur d'yeux. Centre de la scène
  (`_centreScene`) = le point visé quand la caméra est détachée, sinon la place : tuiles (`_gererTuiles`,
  `_ecartTuiles`), volumes des passages, panneaux, carré de sol, plan au sol le suivent ; brouillard compté depuis la
  caméra. Visée au toucher en vue d'édition jusqu'au fond du brouillard (`_pointVise`), pas seulement la portée. Joystick
  : coin bas gauche seulement (200 × 180 px) en vue d'édition, le reste de la scène est au doigt (`.kta-v3d-edition`).
- **Survol en vue d'édition** (décision produit) : `_pas` ne juge rien en vue d'édition (piliers, murs, fronts, zones,
  portes fermées, parois traversés), seule l'image du plan borne la place. Retour à hauteur d'yeux en libre
  (`_appliquerVue`) : `_degager(true)`, la règle de l'ouverture en libre, sort la place d'un obstacle ; en suivi, rien
  (place = tracker). Fermeture (`fermer`) : une place libre déplacée est dégagée de même avant « Je suis ici ? » (jamais
  un tracker recalé dans un pilier). ⚠️ contrat : une greffe qui en ferait tricher interdit la vue d'édition (`plongee: false`, mkmg) ;
  `ctx.libre`, `ctx.bloque` et la règle du pas à hauteur d'yeux sont inchangés.
- **Niveau en vue d'édition** (décision produit, `niveauEdition(sens)`, ▲ niveau ▼) : change le niveau de la 3D
  (`niveauLibre`, comme 🪜) sans passage ni geste de descente (bandeau « Niveau n » seul) ; caméra et place gardent leur
  position plan, la place prend le niveau (le retour à hauteur d'yeux la dégage). ⚠️ contrat : ni le tracker ni le
  niveau actif de la carte ne bougent ; un objet dessiné prend ce niveau (contrat du dessin). Niveaux : `ktaNiveauxOccupes`
  et le niveau affiché, du plus haut au plus bas (`_auDessus`) ; plan à un niveau : pas de sélecteur.
- **Vue d'édition retenue** (décision produit, `_lireEdition`, `_retenirEdition`) : vue, zoom et inclinaison par plan sur
  cet appareil (`config.js > get/setPlanEditionVue3D`, pref `vue3dEdition`), écrits à la bascule, 400 ms après un zoom
  ou une inclinaison, et à la fermeture ; jamais la caméra libre (on rouvre sur sa place) ni un outil armé. Tracker en
  marche : ouverte en vue d'édition quand même, caméra sur le tracker (le suivi garde la place, la vue retenue garde la
  façon de regarder). Greffe qui interdit la vue d'édition : ouverte à hauteur d'yeux, rien d'écrit (réglage intact).
- **Le tracker n'est pas déplacé** par la vue (décision produit). `fermer()` (✕, Échap) : si le suivi est actif
  (`getTrackingActif`) et qu'un déplacement en mode libre a écarté la vue d'au moins 0,5 m du tracker, ou l'a menée à
  un autre niveau que le sien (🪜, texte `vue3d.jeSuisIci.texteNiveau`), `ktaConfirm` « 📍 Je suis ici ? » ; Oui =
  `recalerTrackerSurPoint(x, y, niveau, { teleport: true })`, Non = rien. ⚠️ contrat (décision produit) : un recalage
  venu de la 3D est un **saut**, pas un pas de terrain : ancre `tp` (ni validation `getTrackingValidations`, ni
  distance estimée), la sortie du Carnet ne devient pas « terrain » par lui (`journal.js > _classer`) ; le hook
  (replanification, validation d'étape, portail) joue comme pour tout recalage. Même règle pour « Ici » de « D'où
  pars-tu ? » (`interfaceItineraire.js > _demanderDepart`). Le « 📍 Je suis ici » d'une fiche ouverte depuis la 3D
  reste un geste de terrain (l'utilisateur dit où il est) : validation comptée. Une fermeture forcée (contexte perdu) ne pose pas la question.
- **Sortie : la carte se place là où l'on était en 3D** (décision produit, `vue3d.js > _placerCarte`, avant la
  question, quelle que soit la réponse) : niveau de la 3D s'il diffère (`ktaSetActiveLevel`, source `vue3d`), puis
  `map.setView(convertCoord(x, y))` sans animation, zoom gardé (au moins 0). En suivi sans déplacement libre, la place
  est celle du tracker (la vue n'en garde qu'une version lissée). Plan orienté actif : `setView` ne touche pas à la
  rotation, portée par le pane intercalaire de `mapBearing.js` et réappliquée au déplacement ; si le suivi de la carte
  est armé, le pas suivant du tracker la recentre sur lui (comportement normal du mode).
- **Contexte WebGL** : libéré à chaque fermeture (`forceContextLoss`). Perdu en route (`webglcontextlost`) : la
  vue reste ouverte, ne dessine plus et attend `webglcontextrestored` pendant 8 s d'écran visible (onglet caché non
  compté) ; repris → scène remontée à neuf ; sinon fermeture avec le toast `vue3d.contextePerdu`.
  🩸 Jamais `dispose()` sur les objets d'avant la perte : leurs écouteurs appartiennent à l'ancien état de three.js
  et effaceraient sur le nouveau contexte des objets qui n'en sont pas (« object does not belong to this context »).
- **Murs sous les piliers** (décision produit) : un mur (polygone ou `mur-ligne`) monte à 98 % de la hauteur et son
  matériau est reculé en profondeur (`polygonOffset`) : là où il chevauche un pilier ou un front de son niveau,
  c'est le pilier ou le front qui se voit, sans scintillement.
- **Textures des structures et des parois** (interrupteur 🧱 de la tuile ⚙️, `config.js > getVue3DTextures`, actif
  par défaut) : parois des galeries et des tubes en pierre de taille (§ Scène galerie ; coupé : couleur de légende du
  tracé) ;
  piliers et fronts en **roche brute** (décision produit : la masse calcaire laissée en place, jamais appareillée —
  bosses à trois échelles, nuances en taches à deux échelles, strates fines par endroits, fissures en creux, traces
  d'outil ; aucun joint), murs (`mur`, `mur-ligne`) en parpaing de 50 × 20 cm ; un type perso `cust-…` résolu par
  le canon prend la roche (son entrée de légende n'a pas de type de base, seulement une géométrie : ligne = front,
  polygone = pilier), un type inconnu garde sa couleur. Couleur et normal map dessinées dans un canvas
  (`_rocheBrute`, `ROCHE` : 256 px, motif de 3 m, plus grand que l'appareil car sans joints la répétition se voit
  plus ; `_appareil`, `PARPAING` : 256 px, motif de 1 m ; normal map commune `_carteNormale`), faits à la première
  structure texturée (`_matsTextures`), libérés à la fermeture ; texture naturelle, jamais teintée. Deux matériaux de plus,
  structures toujours regroupées par matériau (un maillage par tuile et par matériau). Coordonnées de texture en
  mètres posées face par face (`_prisme`) : u = longueur de contour cumulée (l'appareil tourne l'angle), v = hauteur
  depuis le sol, dessus en projection monde (x, z). Normal map plutôt que bump map (une lecture par pixel, pas de
  scintillement au loin). Coupé : lots et matériaux d'origine, couleurs de la légende exactes. Basculer refait les
  tuiles sur place (`_refaireTuiles`), sans toucher la scène ni la greffe. Coût : chaque texture (roche, parpaing,
  pierre, remblais, éboulis) est dessinée une fois par page (`_texturesPeintes`, canvas gardés dans `_appareils`,
  ~15 à 30 ms au PC, ~100 ms au téléphone ralenti × 4), la pierre seulement à la première paroi texturée, remblais
  et éboulis à la première zone de leur type ; `KtaVue3D.textures()` rend ces temps (checkup § 24).
- **Remblais et effondrements texturés** (même interrupteur 🧱) : `remblais` en terre et sable calcaire tassés avec
  cailloux et blocs anguleux à moitié enfouis (`REMBLAIS` : motif de 2 m, du gravier de 1 cm aux blocs de 25 cm),
  `effondrement` en éboulis de fontis (`EBOULIS` : motif de 4 m, gros blocs cassés jusqu'à 60 cm, empilés, fissurés,
  peu de terre, relief plus fort). Un seul dessin pour les deux (`_pierraille` : blocs convexes en demi-plans,
  hauteur en facettes, la plus haute surface gardée ; `_poserBloc`), normal map `_carteNormale`. Forme : deux
  volumes à 60 % de la hauteur (`HAUTEUR_REMBLAIS`, une seule valeur : même obstacle, on voit par-dessus). Un matériau par type (`_matZone` :
  `remblais`, `eboulis`), fait à la première zone du type, un lot par tuile (chambres et tubes ensemble). ⚠️ contrat :
  coordonnées de texture en mètres, comme `_prisme` : dessus projeté au sol, flancs u = abscisse sur le contour de
  la zone depuis la même origine (`_origineMotif`), v = hauteur ; découpé au tube (`_remblaisGalerie`), un flanc
  prend l'abscisse de son bord sur le contour entier (`_abscisse`) : une zone coupée par le tube garde le dessin
  qu'elle aurait en chambre. Un type de zone perso `cust-…` garde sa couleur (décision : son entrée de légende n'a ni
  type de base ni forme propre — toutes les zones sont des polygones — et il est dessiné au sol, pas en volume ; rien
  ne permet de le rattacher au remblais). Eau et hachures de l'inaccessible inchangées. Coupé : lots et matériau
  `opaque` d'origine, couleur de la légende exacte, volume gardé.
- **Panneaux de POI** : jamais cachés par la géométrie (`depthTest: false`, `renderOrder` 10), bornés au rayon de
  scène compté depuis soi (la portée ; en vue d'édition, `_rayonScene`), échelle 1 → 0,5 et opacité 1 → 0,4 vers la
  limite (`_majPanneaux`). En vue d'édition, jamais de lettres sous 13 px à l'écran (`PANNEAU_LETTRE_MIN`, décision
  produit : dézoomé, un panneau à l'échelle de la scène n'avait plus que 3 px de texte), plafond porté à 60 % de
  l'écran sur la largeur montrée (`PRES.ecranEdition`). De près
  (`PRES`) : masqués à moins de 1 m de la caméra, fondu jusqu'à 2,2 m, jamais plus larges que 45 % de l'écran (un
  panneau remplissait l'écran du téléphone). Toujours aux jetons du thème **sombre** (décision produit : la scène est
  noire dans les deux thèmes), lus dans la règle `:root` des feuilles (`_jetonsSombres`). Un POI
  dans un volume fermé du niveau (pilier, mur, type perso ; grille `_grilleVolumes` refaite à chaque
  `_reindexer`) est posé contre la face de ce volume la plus proche de la caméra, 8 cm devant. **Passage** (POI
  jonction avec un moyen, `_estPassage`) : liseré à la couleur du tracé `jonction` du canon et ↕ dans une pastille au
  coin de l'icône ; lisible jusqu'à 1 m (`PRES_PASSAGE` : effacé seulement sous 0,8 m), là où 🪜 apparaît. **Danger**
  (`KtaPoiDanger.estDanger`) : liseré rouge (`--kta-erreur` du thème sombre) et **halo au sol** (`_ajouterPanneau` :
  anneau de 0,45 à 0,7 m et disque pâle, `MeshBasicMaterial` sans compression de tons, géométrie partagée par la vue)
  qui suit la place du panneau et reste montré de près quand le panneau s'efface. **Favori**
  (`Favoris.isFav(id, uid)`) : ⭐ dorée au coin haut droit du panneau. Relus à chaque construction de tuile.
- **Membres, repères et itinéraires d'une extension** (`_majEquipe`) : ⚠️ contrat (frontière) : la vue **lit**
  `KtaPresences` (`liste`, `calques` + `reperes(nom)`, `itineraires`, masquages `personneMasquee` /
  `itineraireMasque`), ce que la prise neutre a posé sur la carte (`afficherPresences`, `afficherReperes`,
  `afficherItineraires`) ; elle ne demande rien. Sans extension, ces listes sont vides : rien n'est
  dessiné. Refait quand `KtaPresences.version()` (monte à chaque dessin de la carte), le niveau ou la hauteur
  changent. Membre : silhouette (cylindre et tête, `MEMBRE`, à sa couleur `couleurDe(id)` ou celle donnée, non
  éclairée) et son pseudo au-dessus, au niveau affiché seulement (niveau inconnu : partout) ; un membre dont la
  place vient de SA vue 3D (`source: "vue3d"`) : pseudo suivi de « 3D » (`presence.vue3d.marque`).
- **Lampe frontale des membres** (`_lampeMembre`, `_majLampesMembres`, constantes `LAMPE_MEMBRE`) : sur la tête de
  chaque silhouette, un halo additif (sprite, blanc chaud de notre lampe `0xfff1d6` teinté à 20 % de la couleur du
  membre, `fog: false`, `toneMapped: false`) : visible au bout d'une galerie là où le brouillard a éteint la roche.
  ⚠️ contrat : **visible jusqu'à la portée réglée, jamais au-delà** (distance au centre de la scène ≤
  `_rayonScene()`) : plus loin, parois et piliers ne sont pas construits et le halo se verrait à travers la roche
  (`camera.far` dépasse la portée de 5 m, il n'est pas repoussé). Profondeur testée : un pilier le cache. Taille de
  0,6 m bornée à l'écran (7 à 40 px), posée devant la tête du côté de qui regarde (la sphère ne le cache pas).
  Présence avec cap (`source: "vue3d"`) : léger faisceau visible devant lui (cône additif) et halo plus fort de face.
  Une vraie lumière (`SpotLight` sans ombre, 7 m, cône vers le bas sans cap, faisceau devant lui avec) pour les **2
  membres les plus proches** de notre place à moins de 20 m. 🩸 Le nombre de lumières entre dans les shaders de
  three.js : les 2 sont créées au premier membre affiché et retirées quand il n'y en a plus, jamais au gré des
  distances (une lumière sans membre proche reste à 0) ; sans extension, aucune. 🩸 Sans ombre, elle traverse la
  roche : sa portée reste courte. Coût mesuré (`checkup-vue-3d.js` § 12 ter, `KTA_V3D_SEUL=lampes`) : écart dans
  le bruit de la mesure (moins de 0,5 ms par image, au PC comme en iPhone émulé, processeur x4 ; le processeur
  graphique n'est pas ralenti par l'émulation). Plein jour et vue d'édition : halo discret (35 %), sans faisceau. Rien sur notre
  avatar : il n'est pas un membre. Une greffe ne coupe pas les présences (aucune règle) : les lampes restent.
- **Ma place libre montrée à l'équipe** (`_publierPosition`, décision produit, QCM du 02/11/2026) : ⚠️ contrat
  (frontière) : seule prise appelée par la vue, `KtaExtensions.positionVue3D(p)` (`community-server-line.md` §3).
  En **libre** et après un déplacement à la main (`libreBouge` : pas, `placer`, passage 🪜 ; tourner seul ne compte
  pas), chaque image compare la place `{ x, y }` arrondie à 0,1 px, `cap` au degré et `niveau` à la dernière remise :
  nouvelle remise seulement au-delà de 0,5 m, 10° ou d'un changement de niveau (jamais un appel par image ; la
  cadence réseau reste celle de l'extension). 🔒 La prise ne la remet que si la présence est déjà partagée ; un refus
  n'est pas noté comme remis (partage allumé ensuite : la place part à l'image suivante). `null` en repassant en
  **suivi** et à la **fermeture** (`_demonter`, perte de contexte comprise) ; repasser en libre sans bouger ne remet
  rien. Le tracker n'est jamais recalé par là. Première remise d'une ouverture : toast `success` `vue3d.presencePartagee`
  (vie privée). État : `etat().presence = { publiee, publications }`. Repère : carte « symbole
  titre ×nombre », liseré à la teinte de la charte qu'il porte, sur ses niveaux. Itinéraire partagé : tirets jaunes
  (accent) au sol, tronçons du niveau affiché.
- **Couleurs** : celles de la légende, par `ktaResolveStyle(…, { flat: true })` / `ktaSwatchColor` ; aucune table
  locale. Sol et plafond : `COULEUR_CALCAIRE` (sable calcaire, couleur de la scène, hors charte de l'UI), motif
  procédural de 128 px répété tous les 2 m, fixe sous les pieds. Lampe Normale : intensité 24, décroissance 1,2,
  portée = la portée réglée ; brouillard noir de 45 % à 100 % de la portée (§ Portée, § Lampe ci-dessus).
- **Textes** : clés `vue3d.*` et `ui.vue3d.title`, lues au rendu (ligne de statistiques `vue3d.stats`, option
  `stats` des mesures).

### Guidage, fiche d'un POI et « Y aller » (QCM du 02/11/2026)

- **Itinéraire** (décision produit) : tirets de 1,2 m tous les 1,8 m (`ITI`, le « 12 6 » de la carte), ruban de 0,35 m
  à `--kta-interaction` sur un liseré `--kta-fond` de 4 cm par bord (`_rubanIti`, jetons du thème sombre,
  `_couleursIti`), matériau `iti` non éclairé et sans compression de tons ; phase prise sur l'abscisse du trajet
  (`abscisses` de chaque morceau) : les tirets se suivent d'un segment et d'une tuile à l'autre. ⚠️ contrat (décision
  produit) : sur un remblais ou un effondrement dessiné (`ITI_SUR`, zones montrées du niveau, `_volumesIti` à chaque
  `_reindexer`), ruban, liseré, chevrons et marqueurs d'étape sont posés sur le dessus du volume (`_dessusIti`,
  HAUTEUR_REMBLAIS de la hauteur) à leur hauteur propre ; chaque segment est coupé aux faces (`_morceauxIti`) et une
  contremarche verticale (`_contremarche`, ruban et liseré) monte le long de la face, à `ITI_FACE` (3 cm) devant
  elle : ni ruban dans le volume, ni rampe en l'air. Refait au réglage ⛏️ de la hauteur. Tracé 2D et rubans des
  tracés ordinaires inchangés. Marqueurs
  (`_majMarqueursIti`, à chaque `_reindexer`) : disque et mât de 0,6 m à chaque `road.raccords` de rôle « etape »
  (à son point sur le trajet, au niveau du point du trajet le plus proche), panneau « 🏁 » (et le nom de l'arrivée)
  au dernier point. Itinéraire découpé en morceaux du niveau de la scène (`pathfinder.js > computeRoute` pose
  `level` sur chaque point, sinon celui du tracé ; `vue3d.js > _itiDuNiveau`). ⚠️ contrat : l'itinéraire a **ses
  propres tuiles** (clé « i:… » dans `e.tuiles`, `_poserTuilesIti`, construites et jetées comme les autres) ; à
  `kta:itineraireChange` (`road.js > setRoads / resetRoads`, detail `{ road | null }` : itinéraire tracé, remplacé ou
  effacé ; pas sur une étape validée), **seuls** ses tuiles et ses marqueurs sont refaits (`_refaireIti`, quelques ms ;
  chevrons et bandeau relus par le guidage), jamais la scène : un recalcul en libre ne refait ni structures, ni
  parois, ni volumes (ceux que le ruban enjambe ne dépendent que des zones). Un itinéraire tracé pendant la vue (🚨,
  fiche, recalcul du guidage) s'y montre aussitôt. Mesure (`KTA_V3D_PERF=iti KTA_V3D_TEL=1`, iPhone émulé, réseau
  fictif de 3 120 tronçons) : le recalcul ne fige plus qu'une image, celle du calcul du chemin lui-même
  (`Pathfinder.computeRoute`, 210 à 300 ms) et du rendu de la carte (20 à 40 ms) ; l'itinéraire 3D, 2 à 12 ms.
- **Bandeau** (`_majBandeau`, dans `_e.bandeau` sous la rangée du haut, `top` posé par `_majSousHaut` sous la rangée
  seule) : icône (ou schéma du carrefour), consigne, ligne « puis… », mêmes textes que le bandeau 2D, relus toutes les
  250 ms (`_lireGuidage`). ⚠️ contrat (décision produit) : **🪧 Guidage coché dans la tuile ⚙️ suffit** — le bandeau
  2D réglé sur « Jamais » (sa croix, le bouton de la barre) ou muet (position inconnue) n'éteint pas la 3D. **En
  suivi**, la consigne réelle (`ItiGuidage.etat()`, comme l'écran XL, boutons d'écart compris) quand le bandeau 2D
  parle, sinon un **aperçu** depuis la position du tracker (`getTrackingPosition`) ; **en libre**, un **aperçu**
  depuis la position 3D (`ItiGuidage.apercu(pos, { cap, sPrec })`, qui ne touche ni la progression ni les alertes du
  guidage ; son `masque` ne vaut que pour la 2D), sans marque à part. 🩸 La 3D ne change jamais le réglage de la 2D :
  allumer le guidage de l'app depuis 🪧 aurait changé la carte sans le dire. Interrupteur 🪧 (`config.js >
  getVue3DGuidage`, cet appareil) : coupé, ni bandeau ni chevrons, sauf un guidage d'urgence, toujours montré ; il ne
  touche ni `ItiGuidage.getPref` ni l'état du guidage. Pas de voix (elle
  n'existe pas en 2D non plus). **Écart en suivi** : les boutons de la 2D (`etat().actions`, même ordre : sans
  navigation intelligente « Je suis ici » d'abord) sur une ligne sous la consigne (`.kta-v3d-guid-actions`, 44 px),
  joués par `_actionGuidage` → `ItiGuidage.agir` ; « Je suis ici » ferme la vue (le picker est sur la carte) et la
  rouvre au tracker recalé, picker annulé = on reste sur la carte. Aucun recalcul automatique.
- **Recalcul en libre** (`_recalerLibre`, à chaque lecture du guidage, décision produit QCM du 04/11/2026) : écart =
  distance de la place au trajet sur les tronçons de **son** niveau (`ItiGuidage.apercu(…, { niveau })` ; aucun
  tronçon à ce niveau = écart). 🩸 Un segment d'un autre niveau superposé en plan ferait croire qu'on est sur le
  trajet. Seuils `RECALCUL_LIBRE` : plus de **8 m** (tolérance « sur le trajet » de la 2D sans navigation intelligente
  et de la coupe derrière ; la position 3D ne dérive pas, la navigation intelligente n'y change rien) tenus **2 s**
  (≈ 5 m au pas de la vue), au plus un recalcul toutes les **5 s**, et pas deux du même endroit (8 m à parcourir depuis
  le dernier, réussi ou non : hors des galeries le raccord à vol d'oiseau garde l'écart, on ne recalcule pas à chaque
  pas). Départ = place et niveau de la 3D, destination et étapes non validées gardées dans l'ordre (une étape passée
  en 3D sans « Je suis ici » n'est pas validée), destination à un autre niveau comprise (passages de l'itinéraire) ;
  le tracker ne bouge pas ; c'est l'itinéraire de l'app (carte comprise). Rien en suivi, en vue d'édition, pendant un
  geste de passage, avant d'avoir bougé en libre, pour un parcours d'équipe (Secours) ni quand une greffe coupe
  l'itinéraire (le jeu). Un calcul à la fois ; un résultat arrivé vue fermée, passée en suivi ou en édition, ou
  itinéraire changé, est jeté. Toast `vue3d.itiRecalcule` (succès) ; pas de chemin : itinéraire gardé, toast
  `vue3d.itiRecalculEchec`. État : `etat().recalcul = { enCours, n, echecs, ms, raison, ecartM }`. Coût mesuré
  (`KTA_V3D_PERF=iti`, réseau fictif de 3 120 tronçons, itinéraire de ~420 m) : 40-70 ms au PC, 230-380 ms en iPhone
  émulé (processeur ×4), une image tenue autant (calcul et scène refaite sur le fil principal) — d'où les 5 s.
- **Chevrons au sol** (`_majChevrons`) : « ^ » dorés (accent sombre) sur le ruban, de la position vers la prochaine
  consigne (`s` → `sCible`, abscisses rendues par `etat()` ou `apercu()`), un tous les 2 m à des abscisses fixes du
  trajet (ils ne glissent pas), 30 m au plus, sur le niveau de la scène ; montrés même en « Jamais ».
- **Ronds d'intersection** (`_majRonds`, décision produit) : ⚠️ contrat : la 3D ne calcule rien ; si
  `getPlanShowsIntersections()`, elle lit les ronds que la carte a dessinés (`road.js > getRoadIntersections`, mêmes
  filtres, `[{ point, color, level }]`), garde ceux du niveau affiché et pose un disque de 0,35 m de rayon
  (16 triangles) à 4 cm du sol, à la couleur du rond (matériau `iti`, au-dessus des rubans et du liseré de la
  galerie). Refaits à chaque `_reindexer` (dont `FilterPanel.onChange`) et à `kta:intersectionsChange` (option du
  plan, tracés, niveaux visibles changés sur la carte).
- **Toucher un panneau de POI** (`_toucher`) → **sa fiche de la carte** (`_ouvrirFiche` :
  `utils.js > buildPointPopupHtml`, ses boutons agissent par `_ktaPopupAction`), dans un cadre sous le bandeau ;
  ✕ ou Échap la ferment ; « Je suis ici », « Y aller » et « Itinéraire » la ferment après leur action. ⚠️ Sans ✏️ /
  Repositionner / 🗑️ (ils se jouent sur la carte, cachée dessous). Photos par `attachPopupPhotos` sur un marqueur de
  substitution (`on`, `isPopupOpen`). Un **POI jonction** ouvre aussi sa fiche (décision produit, QCM du
  02/11/2026), avec un bouton par niveau lié (`_passagesFiche` : « ▼ Descendre au niveau -1 (échelle) », le plus haut
  d'abord), d'où que l'on soit ; ces boutons n'ont pas de `data-v3d` (l'écouteur de la fiche les joue).
- **Toucher une structure, une zone ou un tracé** (`_toucher`, décision produit, QCM du 03/11/2026) → **sa fiche de
  la carte** (`_ouvrirFicheObjet`). Priorité au toucher : panneau (POI, membre, repère), puis structure, zone, tracé ;
  rien dessous = rien. ⚠️ contrat (visée, `_rayonEcran` → `_pointVise` → `_objetAuPoint`) : les tuiles fusionnent
  la géométrie (plus d'objet par structure), la visée prend donc le **point touché** (rayon contre les maillages
  montrés : tuiles, sol ; plafond et au-delà de la portée = rien) puis cherche l'objet dans les données dessinées
  (`e.vus`, refait à `_reindexer`) en px plan : point dans le contour d'une structure (ou à 8 cm de sa face ; ligne :
  demi-épaisseur), d'une zone, distance à un tracé (largeur de sa galerie en tube, 0,35 m de plus au sol, 2 cm par
  mètre de distance pour la zone et le tracé). Indépendante de la construction des tuiles : même règle dans les trois
  rendus et les deux vues ; en galerie, ni pilier ni mur (jamais dessinés), la paroi d'un tube donne son tracé. Sans
  état, réutilisable par un dessin depuis la vue ; `KtaVue3D.viser(cx, cy)` rend ce qui est sous un point d'écran sans
  rien ouvrir. La fiche est **la même que sur la carte** : `utils.js > attacherNotePopup` rejoué sur un hôte de
  substitution (faux layer : `bindPopup`, `on`, `closePopup` ; corps en `.leaflet-popup-content`), avec les
  arguments de la carte (`ktaFicheObjetDe(obj)`, registre clé = tableau `points`, partagé par l'objet de session,
  celui du calque et son entrée `getAllEmbedded*`) : mêmes droits. Calque de données en lecture seule, copie de
  session d'un calque en « Modifier » modifiable, lecture seule d'une extension (`ktaEditionRefusee`) ; un objet sans
  fiche sur la carte (calque sans note) montre son titre en lecture seule. Note, 🔄 Convertir, Niveau et 🗑️ écrivent
  par la carte ; la scène suit par `kta:donneesPlanChange` et `_majFicheObjet` ferme la fiche d'un objet disparu
  (rouverte sur la copie après une annulation). Focus dans la fiche, rendu à la vue à sa fermeture (✕, Échap) ; les
  touches d'un champ de la fiche restent les siennes (W A S D s'écrivent). « Sélection multiple » de Convertir ferme
  la vue d'abord (elle se joue sur la carte). **« 🗺️ Voir sur la carte »** (`_voirSurCarte`) : la vue se ferme comme
  par ✕, puis `_montrerObjetCarte` centre la carte sur l'objet (dézoome seulement s'il ne tient pas), ouvre sa fiche
  de la carte s'il en a une et surligne son contour 5 s (`--kta-interaction`, sans clic). La 2D n'a pas de retouche
  de forme sommet par sommet : sa fiche et l'annulation sont les gestes qu'elle offre. Une greffe coupe tous les
  touchers de fiche (`ctx.regler({ fiches: false })`).
- **« Y aller » depuis la 3D** (`KtaVue3D.origineItineraire()` → `{ mode, x, y, niveau, cap }`, lu par
  `itineraireYAller`) : suivi → du tracker ; libre, tracker actif → de la position 3D, niveau compris, tracker non
  recalé ; tracker arrêté → « D'où pars-tu ? » avec « Ici » en premier (§ Position confirmée). Jamais de la position
  d'avant l'ouverture de la vue.
- **La 3D en libre suit un tracker choisi comme départ depuis elle** (`KtaVue3D.placerSurTracker()`, décision
  produit) : « Ma dernière position » de `interfaceItineraire.js > _demanderDepart` (aucun recalage, donc pas de
  hook) ; la place vient à la position **réelle** du tracker et à son niveau (`niveauLibre`, comme après un passage
  🪜), cap gardé, `aBouge` et `libreBouge` remis à faux (plus de pseudo « 3D » pour l'équipe, pas de « Je suis ici ? »
  à la fermeture tant qu'on n'avance pas).
- **Un tracker recalé pendant la 3D ne la déplace pas** (`KtaVue3D.trackerRecale(opts)`, appelé par `tracking.js >
  _notifierRecalage` ; décision produit, retour terrain) : « 📍 Je suis ici » d'une fiche ouverte en 3D recale le
  tracker comme sur la carte (dans la galerie de la 3D, § Recalage dans la galerie), mais la place 3D reste ; `aBouge`
  est remis à faux (pas de « Je suis ici ? » à la fermeture). **En suivi**, ce « Je suis ici » (`opts.dansGalerie`)
  passe la vue en **libre** à cet instant, avant toute image (elle ne lit donc jamais le tracker recalé), niveau
  affiché tenu (`niveauLibre`), toast success `vue3d.libreApresRecalage` ; le bouton du suivi l'y ramène. Un autre
  recalage en suivi (Mode Secours, sans `dansGalerie`) se laisse suivre. « Me repositionner » : la vue se ferme pour le picker puis se **rouvre**
  (`ouvrir({ depart })`) au point et au niveau choisis, cap gardé. En suivi, rien de plus (elle suit déjà) ; vue
  fermée, rien ; jamais de recalage du tracker par la 3D elle-même.

### Dessiner en vue d'édition (QCM du 03/11 et du 04/11/2026)

- **Où** (décision produit) : en ✏️ Édition seulement, la colonne des groupes de la carte est toujours là et active
  (`_monterOutils`, place : `ui.md` § Vue 3D) : aucun interrupteur à ouvrir, armer un outil suffit, le désarmer suffit
  pour arrêter. Rien ne se dessine tant qu'aucun outil n'est armé (`_dessinActif` : vue d'édition, greffe sans
  `fiches: false`, un mode de la carte armé : `modeStructure`, `modeZone`, `modeRoad`, `modeMesure`). Armé, un
  toucher bref de la scène pose un sommet **avant** toute fiche (`_toucher` → `_poserSommet`) ; glisser, pincer, deux
  doigts, molette et Maj + molette restent la caméra (seul le toucher bref, moins de 8 px et 0,5 s, pose : `TAPE`).
  Le sommet se pose sous le point d'**appui** (`pointerdown`), pas du lâcher : un doigt roule de quelques px en se
  levant (6 px mesurés, 0,2 m à côté en vue dézoomée). 🩸 Durée lue sur `ev.timeStamp` (instant du geste) : vue
  dézoomée, une image peut prendre des centaines de ms, et un clic de 150 ms mesuré au traitement arrivait « tenu
  500 ms », refusé sans un mot (clic au sol qui ne posait rien).
  Outil armé, tout toucher refusé l'écrit en console, `[Vue3D] toucher refusé : <raison>` (`_refusDessin`, relu par
  `etat().dessin.refus`) : appui tenu, pointeur déplacé, autre pointeur posé, vue à hauteur d'yeux, greffe
  `fiches: false`, toucher avalé (il refermait le panneau, 700 ms), aucun sol (au-dessus de l'horizon, avec un
  toast `vue3d.dessin.horizon`).
- **Outils de la carte, jamais copiés** ⚠️ contrat : armement par le panneau du groupe 2D (`ktaOuvrirOutils`, donc
  `_activerStructure` / `_activerZone` / `_activerRoute` / 📐 et leurs refus `ktaEditionRefusee`) ; le toucher rejoue le
  geste de la carte au point du sol touché : `map.fire("mousedown")` puis `map.fire("click")`, `latlng =
  convertCoord(x, y)` (road.js écoute `mousedown`, les autres `click`). Undo (HistoryManager), uid, styles, sous-menus
  de type, fermeture, toasts et validation à l'extinction sont ceux de `structures.js`, `zones.js`, `road.js`,
  `measure.js`. Ils ne lisent que `e.latlng` (vérifié outil par outil).
- **Point touché** (`_pointSol`, décision produit) : toujours le sol, le plan **mathématique** y = 0 sous le doigt,
  jamais la surface d'un objet : le dessus d'un pilier ou le haut d'une paroi touchés décalaient le sommet du doigt
  d'autant que l'objet est haut (jusqu'à 1,3 m mesuré sur un plan dense en vue inclinée), alors que l'aperçu et le plan
  au sol se dessinent au sol, sous le doigt. Aucun maillage requis : hors du carré de sol, au-delà de la portée ou dans
  le noir hors des tubes (rendu Galerie) le point se pose quand même. Point ramené dans les bornes de l'image. La
  visée des fiches (`_pointVise`, outil désarmé) garde la surface touchée.
- **Niveau** ⚠️ contrat : l'objet prend le niveau de la 3D (`e.niveau`, `niveauLibre` compris) : `APP_CONFIG.activeLevel`
  le prend le temps des deux `fire` puis est rendu (`finally`), la règle de la 2D (pilier-2 / front-2 au niveau − 1,
  aimantation au niveau actif) jouant d'elle-même. Rien d'asynchrone de la vue ne lit le niveau pendant ce temps.
- **Tolérances** (décision produit) : la fermeture d'une zone ou d'une structure se fait dans le **rond doré** du 1er
  sommet (`DESSIN.premier`, 0,3 m, dessiné à l'échelle : zoomer l'agrandit) ; le point est alors ce sommet exact. En
  mètres et non en px d'écran : à 24 px, le 4e coin d'un mur de 0,4 m fermait la forme au recul par défaut. Une seule
  règle en 2D et en 3D : `utils.js > ktaToleranceFermeture` (`KTA_FERMETURE_M` = 0,3 m à l'échelle du plan ; sur la
  carte, jamais sous `KTA_FERMETURE_MIN_PX` = 8 px d'écran pour rester touchable au zoom faible ; un geste de la vue
  3D, `ktaVue3D`, prend les mètres seuls ; plan sans échelle : 5 px plan). Aimantation des tracés (`snapDraw`) : le rayon d'écran de la 2D (`snapDrawPx`, 14)
  converti à la profondeur du point touché, passé en `ktaTolerancePlan` (road.js > `_snapSurSommetProche`).
- **Coût par sommet** ⚠️ contrat : objet en cours (vue d'édition, `getCurrentStructure` / `Zone` / `Road`), la scène ne
  le montre pas (`_collecter` > `_horsTrace`) et `_majDonnees` attend sa fin (`_traceEnCours`) : un sommet = le geste
  de la carte + l'aperçu (`_majApercu` : rubans de 0,12 m et disques à la couleur du canon, rond doré du 1er sommet,
  matériau sans profondeur, un seul maillage refait sur signature). Fin de l'objet (1er sommet retouché, ✅, Échap) :
  une reconstruction, sans attendre la fin de rafale ; les tuiles de même contenu à plus de 4 m de l'objet gardent
  leur géométrie (`_noterFin`, `_reprendreTuiles` ; pourquoi 4 m : un pilier ouvre les tubes et décide zones et POI à
  3 m). Mesures (`KTA_V3D_PERF=dessin`, plan dense, iPhone émulé) : `ETUDE_VUE_3D.md` § Mesures du dessin.
- **Fin, extinction** : gestes de la 2D (1er sommet, ✅ Fermer / Valider du panneau) ; le bouton de l'outil, Échap (après
  tuile et hauteur, avant la fiche), sortir de la vue d'édition ou une greffe `fiches: false` (`_suivrePermisDessin`)
  et fermer la vue (`_quitterDessin`) éteignent par `_desactiverTousLesModes` de la carte : un objet non fini est
  validé s'il a assez de points, abandonné sinon (toasts de la 2D). Un objet fini n'est jamais perdu.
- **Rendu** (décision produit) : le rendu galerie ne dessine aucune structure ; armer un outil de structure y passe en
  **mixte** (`basculerRendu`, retenu par plan) avec un toast (`vue3d.dessin.renduMixte`) : on voit ce qu'on dessine.
- **Mesure 📐** : distance et surface de `measure.js` (`calculDistance`, `calculSurface`), ruban rouge au sol et
  libellé de la carte (`measure.label.*`) en panneau au dernier point (`_panneau`, genre `mesure`), tant que la mesure
  a des points. Longueur de chaque segment et angle à chaque sommet : les libellés que la carte a posés, lus tels quels
  (⚠️ contrat : `measure.js > ktaMesureLibelles`, jamais recalculés), en panneaux (angle au liseré `--kta-texte-3`).
  **Bandeau fixe** (`_majBandeauMesure`, `.kta-v3d-mesure`, `role="status"`) tant que 📐 est armé : les lignes du libellé
  de la carte (`_afficherMesureValeur` : distance `formatDistance(d, 2)`, surface `formatSurface(s, 1)`, ou l'invite du
  mode), la ligne du mode actif marquée ; relu à chaque sommet, caché outil désarmé.
- **Droits** : ceux de la carte (armement refusé en lecture seule, groupe grisé recopié ; 📐 permise). Greffe
  `fiches: false` : ni barre ni sommet (`addons.md`).
- **🗺️ Plan au sol** (décision produit : livré si la mémoire suit) : interrupteur de la barre, coupé par défaut, gardé
  tant que la vue est ouverte, offert à **tous les niveaux** : un niveau ≠ 0 qui a ses calques image
  (`imageLayers[].level`, `window._ktaImageOverlays`) montre ceux-là (calés comme sur la carte, lus depuis leur URL
  s'ils ne sont pas posés), sinon le plan de base ; changer de niveau la redessine. Une texture
  carrée (1024 px au doigt, 2048 au pointeur fin) sur le carré de sol, à une place fixe, redessinée à un quart
  d'écart (place ou emprise) ; source : les `<img>` du fond déjà chargés par la carte (direct, tuiles V1), plan V2 :
  `ktaDessinerRegionTuiles` (tuiles du ZIP ou du cache, niveau le moins détaillé qui suffit). Libérée coupée, à la
  fermeture et à la perte du contexte. Centrée sur le centre de la scène (le point visé, caméra détachée). ⚠️ contrat :
  dessinée juste après le sol (`ORDRE_SOL` −0,6 < `PLAN_SOL.ordre` −0,5 < le reste), sans test ni écriture de
  profondeur, trouée par les bouches comme le sol : tracés, zones et structures passent dessus par la profondeur du sol
  (🩸 posée 6 mm au-dessus et départagée par la profondeur, elle dépendait de la précision du tampon de profondeur).
- **Sol et plafond noirs 🧱 coupé** (décision produit, `_grainSol`) : carré qui suit et pièces des galeries noirs,
  sans grain, dans les trois rendus ; allumé, le grain calcaire. Le matériau change, rien n'est reconstruit.

### Greffe de la vue 3D (prise des add-ons) et code « six vers le bas »

- La vue 3D prête une **prise neutre** aux add-ons (`KtaVue3D.greffer`, sans effet sans greffon) et lance l'add-on
  lié à un code (`CODE_BAS`, `ADDONS_CODE`). Contrat complet, connecteurs, règles et add-on `mkmg` :
  **`docs/architecture/addons.md`**.

### Garde-fous et limites

- `scripts/smoke/checkup-vue-3d.js` (Chromium et WebKit) : bouton cube sous ≡ grisé sans échelle (rien chargé),
  plus de tuile au menu Tracker, ouverture par le bouton derrière l'indicateur, focus et `aria-modal`, scène, mur plus bas que le pilier qu'il traverse, butée, pas rapide, collisions (6 obstacles,
  12 angles, pas rapides et grand pas, départ collé à une face), inclinaison, boussole, clavier, vues, niveau, perte simulée
  (`WEBGL_lose_context`) puis reprise, perte sans reprise, « Je suis ici ? » Non puis Oui, WebGL absent,
  20 ouvertures de suite. Galerie, sur des tracés fictifs (T, X, coude droit, coude aigu, cul-de-sac, presque
  parallèles) : aucune paroi qui en traverse une autre, axes libres, bouts fermés, butée contre une paroi, carrefour et
  coude passés, remblais qui arrête, zones coupées au tube, effondrement en volume ; remblais, effondrement et
  inaccessible qui arrêtent dans les 4 contextes (§ 24 bis : galerie, tube et chambre du mixte, structures ; départ
  dedans dans chacune, 🧱 coupé ; recalage, itinéraire et pas du tracker 2D inchangés, règles de zones de la 3D
  jamais appelées par la 2D), rideau en travers, POI à 2 m montré et à 5 m masqué,
  interrupteur retenu par plan ; passages 🪜 (POI jonction ▲ / ▼, tracé jonction dans les deux sens, toucher
  du panneau, suivi sans 🪜, tracker et carte inchangés) ; place libre (extension factice) : rien sans partage ni
  avant un pas, une remise puis rien à l'arrêt, ≤ 1 remise par 0,5 m en marchant, rien sous 10° de rotation,
  `null` en suivi et à la fermeture, tracker inchangé, membre « en 3D » marqué ; sortie : carte au niveau et à la place de la 3D (libre,
  après Non, en suivi), Oui recale aussi le niveau. Hauteur ⛏️ (structures et galerie) : réglée à 3 m → piliers,
  murs à 98 %, parois, plafond et rideaux à 3 m, remblais à 1,8 m, `getPlanHauteurGalerie()` = 3, relue à la
  réouverture et par ⛏️ Volume exploité (et l'inverse) ; bornes 1,5 / 20 m. Filtres : ≡ ouvre le ≡ Filtres de la
  carte au-dessus de la vue ; zone, calque, type de tracé et tag décochés → retirés de la 3D et de la carte ; « Tout
  afficher » sur la carte → revenus en 3D ; type de structure masqué depuis la carte → retiré, butée gardée ; niveau
  masqué → rien de dessiné ; pastille ; itinéraire toujours là. 🚨 = Sortie d'urgence, toast sous la rangée, ✕ au
  coin haut droit à 393 px et ≡ collé à sa gauche (393 px et PC), ❓ → aide de la 3D, Échap (aide, ≡, réglage, puis
  vue), panneau de POI sombre en thème clair et borné de près, rendu en pause (immobile et boussole qui tremble).
  Interrupteur : mixte par défaut (avec ou sans structure), mixte → structures → galerie en boucle, retenu par plan.
  Guidage (§ 10) : itinéraire tracé pendant la vue montré, bandeau d'aperçu en libre et consigne réelle en
  suivi, chevrons, bandeau 2D réglé sur « Jamais » (bandeau et chevrons quand même en suivi et en libre, rien 🪧
  décoché), bandeau stable au redimensionnement, toucher d'un POI → sa fiche (sans ✏️ / 🗑️), Échap
  ferme la
  fiche, « Y aller » en libre depuis la position 3D au niveau 1 sans recaler le tracker, tracker arrêté → « Ici »
  recale et part de la position 3D, la 3D ne bouge pas. La 3D suit un tracker fixé depuis elle (§ 10b) : recalage
  pendant la vue → place sur le tracker à son niveau ; 3D à 10 m sur l'autre niveau, « Y aller » → « Ma dernière
  position » → 3D sur le tracker (niveau 0, cap gardé), itinéraire parti de là, tracker non recalé ; « Je suis ici »
  d'une fiche (tracker actif) → tracker ajusté dans la galerie, 3D à cette position ajustée, fermer sans « Je suis
  ici ? » ; « Me repositionner » → vue fermée, picker, niveau 1 choisi → vue rouverte en libre au point et au niveau 1,
  cap gardé, tracker et itinéraire au point, fermer sans question. Mixte (§ 11), sur une galerie fictive qui
  débouche sur une chambre (fronts et six piliers) : tube avant la chambre, aucune paroi dans la chambre ni à travers
  une structure, bout ouvert, eau du tube découpée et eau de la chambre entière, POI de la chambre à sa place et POI du
  tube ramené contre la paroi ; on bute contre la paroi du tube, on entre dans la chambre, on bute contre un pilier,
  aucune paroi n'arrête dans la chambre. Halo et liseré rouges d'un danger, ⭐ d'un favori. Extension factice (§ 12) :
  rien sans elle ; membre au niveau affiché (celui d'un autre niveau absent), repère, itinéraire ; listes vidées →
  retirés, toucher d'un panneau de membre ou de repère n'ouvre aucune fiche. Côtés (§ 15) : pilier à 2 m à droite et
  front de 10 m à droite → paroi gauche gardée, droite ouverte, un pan de retour à chaque bout du bord à la face,
  aucune fente (rayons tous les 10 cm) ; piliers des deux côtés → chambre ; pilier dans l'axe → bout ouvert ; on bute
  à gauche sur la paroi, à droite sur le pilier. Itinéraire (§ 16) : 0,35 m, liseré 0,43 m, tirets de 1,2 m (17 sur
  30 m), couleurs des jetons, mât d'étape, 🏁. Ronds (§ 17) : aucun option coupée, ceux de la carte au niveau affiché
  et à leur couleur option cochée. Joystick (§ 18, pointeurs tactiles synthétiques, pointeur grossier simulé) :
  pavé au PC et avec l'option, joystick sinon ; zone sous la rangée et au-dessus de la boussole, anneau sous le doigt,
  toucher bref sans quitter le suivi, libre en sortant de la zone morte, 1,4 puis 2,8 m/s, course à 7 m/s, pas de
  côté, zone morte, inclinaison à deux doigts le joystick posé. Finitions (§ 19) : plus de « bêta », toast de
  présence en success, nom d'un membre touché, focus rendu au bouton cube après « Je suis ici ? ». Tuile ⚙️ (§ 20) :
  rangée ✕ ≡ 🚨 ❓ ⚙️ sur une ligne à 393 px, réglages dans la tuile écrits en clair, tuile ancrée sous ⚙️ (pas plein
  écran), fermée par ⚙️, un toucher ailleurs ou Échap, repère et pastille 🕹️ en libre, boussole masquée retenue. Greffe (§ 21) : rien sans greffon ; scene("greffe"), calque après le canvas, une
  seule greffe ; rendu à la demande, ctx.sale() redessine ; retrait, scène refaite, reprise avec un groupe neuf,
  exception (greffe retirée, vue ouverte), fermeture ; règle du pas contre un pilier fictif ; code « six vers le bas »
  au pavé, au clavier (répétition ignorée) et au joystick, coupé par une autre commande, un coup tenu ou plus de 2 s ;
  chaque code lance l'add-on lié. Add-on `mkmg` (§ 23, objets fictifs) : refus sur une installation reliée et pendant
  le suivi ; confirmation à 3 difficultés ; facile → cible (POI), trajet, balise, flèche, reste, itinéraire et guidage
  de l'app masqués ; endurance vidée par le pas rapide, course interdite à bout de souffle puis rendue ; cible
  atteinte → vague 2 ; Quitter ; difficile → ni tracés, ni trajet, ni balise ; fermer la vue termine la partie.
  Monde vidé puis situations posées (`essai`) : vague peuplée, un coup tue l'égaré à 5 m, recharge de 1,5 s,
  munitions et champignon ramassés, santé qui baisse au contact, silhouette figée dans le faisceau et qui avance de
  dos, santé à 0 → fin et meilleure vague retenue, « Rejouer ».
  Données changées pendant la vue (§ 26, objets fictifs) : ouverture en libre au centre d'un pilier → place dégagée,
  en suivi (tracker dans le pilier) → rien ; rien sur 40 images sans signal, un rendu sans changement relu sans rien
  refaire ; itinéraire remplacé, puis aperçu posé → aucune reconstruction, ruban seul refait (le nouveau) ; carte
  déplacée et zoomée sous la décimation PerfUltra → ni signal, ni empreinte, ni reconstruction ; setStructures, setZones, setRoads, setEditorPoints, sommet du milieu déplacé, annulation
  (HistoryManager) et couleur de légende → une reconstruction chacun, scène changée, place, cap, niveau, mode, vue,
  portée, lampe et itinéraire gardés ; rafale (6 écritures à 30 ms, 5 d'un coup) = une ; fiche ouverte depuis la 3D
  relue au renommage, fermée à la suppression du POI ; pilier posé sur la place → dégagée ; greffe prévenue une fois,
  `ctx.libre` à jour ; écriture pendant un geste de passage → rien pendant, relue à sa fin ; calque rapatrié (copies,
  ni double ni trou), copie retouchée, restitué ; case du calque dans ≡ = une reconstruction par clic.
  Toucher un objet (§ 27, formes fictives, doigt) : pilier et mur par leur face et leur dessus, zone, tracé, en mixte
  et en structures, à hauteur d'yeux et en vue d'édition ; galerie : zone dans le tube, tracé par son sol et sa paroi ; sol
  vide et plafond → rien ; panneau de POI collé au pilier → la fiche du POI ; fiche du pilier = celle de la carte
  (note, 🗑️, rang des modales, focus) ; note tapée au clavier sans déplacer la vue, sauvée ; Échap → fiche fermée,
  focus à la vue ; greffe `fiches: false` → ni pilier ni POI au doigt, retirée → la fiche revient ; extension en
  lecture seule → ni note ni 🗑️ ; 🗑️ → pilier retiré de la scène sans rouvrir, annulation → revenu ; calque de
  données → lecture seule (noté : sa note ; muet : son titre) ; « Voir sur la carte » → vue fermée, carte centrée,
  surbrillance, fiche de la carte ouverte (zone de session).
  Dessin en vue d'édition (§ 28, formes fictives, doigt, 3D au −1 et carte au 0) : ni barre à hauteur d'yeux ; ✏️ → 📐 🛣️
  ⬛ 🏛️ dans l'ordre de la carte, taille et icône de ses boutons ; panneau de la carte au-dessus de la vue (sans 🪜 ni
  🧹) ; rien sans outil ; pilier (4 sommets, aucune reconstruction, aperçu) fermé dans le rond doré → niveau −1, carte
  au 0, sommets à 3 cm, une reconstruction, visé ; glisser, pincer, deux doigts, molette, Maj + molette → aucun sommet ;
  annulé ; mur fermé par ✅, mur en ligne, zone, tracé (aucune reconstruction pendant), aimantation, mesure de 10 m et
  son étiquette ; sortie de la vue d'édition (objet de 2 sommets abandonné), Échap, fermeture (objet de 3 sommets gardé) ;
  greffe `fiches: false` ; lecture seule ; plan au sol (visible au −1, une texture au 0, libérée) ; rendu galerie →
  mixte ; même pilier à la souris sur la carte : mêmes champs, sommets, historique.
  Caméra libre et mesures (§ 30, formes fictives, doigt, téléphone et PC) : pan d'un doigt tracker en marche → point
  visé déplacé, sol pris sous le doigt (à 15 cm), place et tracker immobiles, ⌖ montré ; vue tournée de 90° → même
  règle ; deux doigts tournés de 30° → cap de 30°, recul inchangé ; ⌖, un pas et la hauteur d'yeux ramènent la caméra ;
  pan de 68 m → tuiles et panneau lointain construits là, place restée ; recul 60 m → lettres ≥ 13 px, fiche ouverte de
  loin à taille normale ; outil armé : glisser ne pose rien, le tap suivant pose sous le doigt (5 cm) ; bandeau (2
  sommets, 3e, surface, désarmé caché, sans chevaucher boussole, joystick, pavé ni zoom) ; angle droit → « 90° » comme
  la carte ; survol (pilier, cavage fermé) en édition, bloqué à hauteur d'yeux, place dégagée au retour ; plan au sol
  au point visé et vu à l'écran (pixels d'une capture) ; 🧱 coupé : sol et plafond noirs (trois rendus), plan au sol visible dessus, parois de galerie à la couleur de légende
  de leur tracé (type `cust-…` compris), légende changée vue ouverte → la paroi suit, rallumé → la pierre ; tuile ⚙️
  au-dessus de la colonne ✏️, curseurs entiers, sélecteur de niveau hors de la colonne, de la tuile et de la grille
  (portrait et paysage) ; ▼ en vue d'édition → la 3D au −1 sans passage, carte et tracker au 0, tracé dessiné au −1,
  retour à hauteur d'yeux dégagé, plan à un niveau sans sélecteur ; vue d'édition, zoom et inclinaison retrouvés à la
  réouverture et après un rechargement, autre plan à sa valeur, greffe sans vue d'édition → hauteur d'yeux, réglage
  intact.
  Jamais coincé (§ 13) : accroche de POI
  jonction à 3 m d'un tube → après ▲, dans le tube et l'on avance (galerie, mixte) ; parti du centre d'un pilier, un
  pas vers la galerie passe.
  Saut (§ 33, `KTA_V3D_SEUL=saut`) : balade de 50 m puis « Oui », « Ici » de « D'où pars-tu ? » → tracker recalé,
  ancre `tp`, validations et distance estimée inchangées, sortie du Carnet « bureau » ; « Je suis ici » d'une fiche en
  3D → une validation, « terrain ». Plan au sol par niveau (§ 34, `=solniveaux`) : 🗺️ visible et dessiné au −1 (plan
  de base) et au +1 (calque image fictif du niveau), pixels lus ; niveau changé vue ouverte → redessiné.
  `KTA_V3D_PERF=galerie` : réseau synthétique de 3 120 tronçons ; `KTA_V3D_PERF=mixte` : ce réseau sur le plan dense
  gardé à l'est (tubes à l'ouest, chambres à l'est).
  `smoke.js` : rien de la 3D au démarrage.
- **Non couvert** : aucun vrai iPhone (images/s, mémoire, batterie, perte de contexte réelle), aucun plan dense
  réel ; mode galerie jamais vu sur un relevé réel (tracés dessinés à la main : raccords imprécis, sommets serrés).
  Mixte : entre le bout ouvert d'un tube et la structure qui a ouvert la chambre (jusqu'à 3 m), rien ne ferme les
  côtés : on peut y sortir de la galerie (la roche n'est dessinée nulle part hors des tubes et des structures).
