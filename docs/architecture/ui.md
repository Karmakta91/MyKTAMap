# Architecture MyKTAMap — Refonte UI, thème, modales, filtres, i18n

> Référence détaillée extraite de l'ancien CLAUDE.md. Lue à la demande (pas auto-chargée).
> Sections : §23, §35, §41, §53, §61, §64, §71, §79

---

### 23. Fermeture auto du mode tracé/zone après suppression (depuis v146 — 14/05/2026)

**Bug v145** : si l'utilisateur démarrait un tracé (ou une zone) puis ouvrait le menu suppression et choisissait "Tous les tracés" / "Dernier tracé entier" (quand c'était le tracé en cours), l'icône de la sidebar restait visuellement "actif" (classe `kta-actif`) mais `window.modeRoad` venait d'être remis à `null` par `resetRoads()` → clic sur la carte ne faisait rien (state incohérent).

**Origine** : double state entre `road.js` (qui gère `currentRoad` + `window.modeRoad`) et `interface.js` (qui gère `_modesActifs["road"]` + classe DOM sur le bouton). `resetRoads()` ne touche pas au state UI, ni `removeLastRoad()`.

**Fix** :
- `road.js` expose `window.getCurrentRoad()` (lecture seule de `currentRoad`).
- `zones.js` expose `window.getCurrentZone()` (idem).
- `interface.js` ajoute 2 helpers `_fermerModeRoad()` / `_fermerModeZone()` qui appellent `_modesActifs[k].desactiverFn()` + retirent la classe `kta-actif` du bouton + `delete _modesActifs[k]`.

**Logique conditionnelle** (appliquée aux onClicks du menu suppression + handlers du mode clic) :

| Action | Couper le mode ? |
|---|---|
| ↩️ Annuler dernier point | Non (user continue à tracer) |
| ✂️ Dernier tracé entier | Oui **si** `getCurrentRoad()` était non-null AVANT et null APRÈS |
| 🎯 Sélection au clic | Oui **si** la road cliquée === `getCurrentRoad()` capturé AVANT |
| 🗑️ Tous les tracés | Oui **inconditionnel** (resetRoads vide tout) |

Symétrique pour zones avec `getCurrentZone()`.

**Pour ajouter une nouvelle action de suppression** : si l'action peut effacer le `currentRoad`/`currentZone`, capturer la référence AVANT, comparer APRÈS, appeler `_fermerModeRoad()` ou `_fermerModeZone()` si la road/zone en cours a disparu. Ne pas appeler les helpers inconditionnellement sinon on coupe le mode même quand l'utilisateur supprime une vieille road sans rapport.

---

### 35. Modales custom pour re-sélection ZIP (depuis v172)

Remplacement des `confirm()` natifs OS dans `reSelectionnerZipPourPlan` (index.html) par des modales custom respectant la charte graphique du projet. Plus important : changement **fonctionnel** sur le cas "nom différent" — refus définitif au lieu de "Charger quand même".

#### 35.1 Modale "Nom différent" — `_afficherModaleNomZipKO(zipName, planName)`

API : `Promise<void>` (résout quand l'user ferme, peu importe l'action).

Visuel : border + accent rouge `#ff8c8c` (cohérent avec `.plan-row-remove:hover` et autres modales d'erreur), grille 2 colonnes "Plan ciblé / ZIP fourni" pour visualiser la discordance, hint italique expliquant le refus + alternative (passer par 📦 Charger un nouveau plan), **1 seul bouton "J'ai compris"** primary.

Fermeture : ✕, backdrop, Échap (toutes équivalentes — résout sans charger le ZIP).

**Changement fonctionnel v172** : avant on avait `confirm("Charger quand même ?")` qui permettait à l'user d'accepter et créait des incohérences silencieuses (badges, sessions, métadonnées). Maintenant : refus définitif, pas de bypass.

#### 35.2 Modale "Mode différent" — `_afficherModaleModeDifferent(planName, discordances)`

API : `Promise<boolean>` (true = continuer, false = annuler).

Visuel : border + accent orange `#ffb380` (cohérent avec warnings du projet, V2 generation, OOM toast warn…), 1 carte par discordance dans une grille verticale avec titre flag en gras orange + comparaison "Mode mémorisé : ... / Mode du ZIP : ..." en blocs lisibles, hint italique expliquant que le ZIP fait foi, 2 boutons "Annuler" (ghost) + "Continuer" (primary).

Fermeture : ✕, backdrop, Échap = annuler (résout false). Click sur "Continuer" = résout true.

Le ZIP fait foi → `syncModeFlags` appliqué après confirmation pour aligner le registre sur le contenu réel du ZIP.

#### 35.3 Pattern réutilisable pour futures modales

Promise-based, idéal pour intégration dans des flows async existants :
```js
const ok = await _afficherModaleModeDifferent(planName, discordances);
if (!ok) return;
```

Structure type :
1. Helper `function _afficherModaleXxx(args)` qui retourne `new Promise(function(resolve) { ... })`
2. Cleanup d'une éventuelle modale précédente (`if (existing) existing.remove();`)
3. Création DOM avec classes `.kta-readme-modal-overlay` + `.kta-readme-modal-boite`
4. Border/accent inline-style pour la couleur sémantique (rouge erreur, orange warning, etc.)
5. Bind ✕ + click backdrop + keydown Escape → tous appellent `_close(<result>)` qui retire la modale + retire le listener Escape + résout la Promise

#### 35.4 Pourquoi pas de confirm() natif

- Pas customisable visuellement → casse la charte
- Pas Promise-friendly nativement (bloque le thread JS)
- Position et apparence dépendent de l'OS → incohérent entre desktop/mobile
- Texte sec, pas de mise en forme (gras, couleurs, listes…)
- Bouton "OK/Annuler" pas customisable → pas de "J'ai compris" sémantique

⚠️ **`confirm()` natifs gardés** dans le projet (volontaire, pas à toucher sauf demande explicite) :
- "Retirer ce plan de votre liste ?" (action destructive simple)
- "Tracé en cours, charger un autre plan ?" (rapide, contexte évident)

---

### 41. Refonte UI v1.9 — Nouvelle interface par défaut (mergée en v1.9.1)

**Statut** : refonte UI mergée et OFFICIALISÉE en v1.9.1 (depuis la branche `Refonte_interface` créée depuis `Karma_dev` HEAD `75455a4`). La nouvelle interface est désormais le défaut, l'ancienne v1.8.x reste accessible en opt-out.

Le module clé est `js/refonteInterface.js` (~900 lignes IIFE). Tout le CSS scopé est en fin de `css/style.css` (~1500 lignes sous `body.kta-refonte-v1`).

#### 41.1 Activation du flag — opt-out (depuis v1.8.1-refonte-8)

**Sémantique** :
- **Default ON** : nouvelle interface ACTIVÉE par défaut au boot.
- L'user peut OPT-OUT via toggle "📜 Utiliser l'ancienne interface (classique v1.8.x)" → set `localStorage["myktamap_legacy_interface"] = "1"` + reload.

**Toggle accessible depuis 2 endroits** :
- ⚙️ **Configuration du loader** (home) → section "🎨 Affichage" → `#loaderLegacyCb`
- ⚙️ **Réglages map mode** (in-app) → section "🎨 Affichage" → `#kta-cfg-legacy-cb`

**Reload requis** au toggle : la classe `body.kta-refonte-v1` doit être appliquée au boot AVANT que Leaflet initialise ses positions (sinon décalages divers).

**Migration silencieuse** : l'ancien flag opt-in `localStorage["myktamap_refonte_v1"] = "1"` (= phase v1.8.1-refonte-7 et antérieur) est supprimé au chargement du module → user reste en mode refonte (= défaut) sans changement d'expérience.

**API publique** `window.RefonteInterface` :
- `isActive()` → boolean
- `setActive(wantNouvelle)` → set localStorage + confirm + reload
- `updateCompteurs()` → recalcule header
- `refreshStatusBar()` → recalcule status bar

`window._refonteInterfaceActive` (booléen) exposé tôt pour permettre à `interface.js` de lire l'état avant d'initialiser les groupes accordéon.

#### 41.2 Architecture — 3 zones fixed

| Zone | Contenu | Position |
|---|---|---|
| **Header bar** | 🌟 Rose des vents (home) / titre plan cliquable / compteurs (📍 points · 🛣 tracés · ⬛ zones) cliquables | sticky top 44px (+ safe-area top iOS) |
| **Sidebar gauche** | ⊞ Layers / − + Zoom / 🏗 Niveau / ≡ collapse / 📚 Doc / ⚙ Paramètres / ⬇ Charger / ⬆ Save | Leaflet topleft, flex column (sidebar unifiée) |
| **Sidebar droite** | ≡ collapse / 🔍 Search / ✏️ Édition / 📐 Mesure / 🛣 Tracés / ⬛ Zones / 🧭 Tracker | Leaflet topright, flex column (sidebar unifiée) |
| **Status bar** | 📐 Mesure / 📏 Distance totale (cliquable=ouverture modale) / 🗺️ Itinéraire (cliquable=ouverture modale) / 🧭 Tracker GPS (LED ON vert / OFF rouge) | sticky bottom 52px (min-height, grow dynamique) |

**Suppressions** :
- Groupe `🏗 Créer/modifier plan` retiré de la sidebar carte (accessible uniquement depuis le loader via "🏗️ Générer un plan").
- Labels Leaflet bottom (`.kta-iti-distance`, `.kta-measure-distance`, `#measureLabel`) masqués via CSS — remplacés par les stats du status bar.
- Sub-action "🗂️ Changer de plan" retirée du menu ⬇️ Charger / Import (doublonne avec la rose des vents et le titre cliquable).

**Préservations** :
- Boussole d'orientation : widget compass (`.kta-compass-widget`) toujours géré par `compass.js`. Repositionné en bottom-left (portrait) / bottom-center (landscape) au-dessus du status bar.
- Toutes les modales, modes, logique métier : inchangés.

#### 41.3 Header bar — détails

`_creerHeaderBar()` dans `refonteInterface.js` génère le DOM. Layout :
- **Portrait** : `display: flex` + `.kta-refonte-header-title-wrap { flex: 1 1 auto; justify-content: center }` → titre centré dans l'espace restant.
- **Landscape** (`@media (max-height: 500px) and (orientation: landscape)`) : `display: grid; grid-template-columns: 1fr auto 1fr` → titre au centre géométrique ABSOLU. Home en col 1 avec `justify-self: start`, counters en col 3 avec `justify-self: end`.

**Bouton home 🌟** : image `icon/mkm-full.png` (rose des vents — même asset que splash + home page). Clic → `window._retourLoaderAvecConfirm()` (modale charte "Changer de plan" si session modifiée, sinon retour direct).

**Titre cliquable** : ouvre la modale "🗂 Changer de plan" refondue (cf. §41.10).

**Compteurs cliquables** : ouvre la modale "📊 Détails de la session" (cf. §41.9).

#### 41.4 Sidebars unifiées — modification de `_creerGroupeAccordeon`

Nouvelle option `position: "topleft" | "topright"` lue UNIQUEMENT si `window._refonteInterfaceActive === true`. Sinon comportement v1.8.x strict (tous groupes en topright).

Groupes taggés `position: "topleft"` :
- `aide` (📚 Doc/Aide/Légende)
- `settings` (⚙ Paramètres)
- `charger` (⬇ Charger / Import)
- `save` (⬆ Enregistrer)

**Effet visuel** : sidebars = barres VERTICALES continues (pas d'icônes séparées avec gap). En CSS :
- `body.kta-refonte-v1 .leaflet-top.leaflet-{left|right} { display: flex; flex-direction: column }`
- `.leaflet-bar { margin: 0 !important; border-radius: 0 !important }` puis arrondi uniquement aux extrémités (`:first-child` top, `:last-child` bottom) — donne l'effet "barre unique".
- Séparateurs internes 1px subtils (`border-top` sur `:not(:first-child)`).
- Sous-actions accordéon empilées EN DESSOUS du bouton principal (vertical flow, la barre grossit, scroll interne si dépasse `max-height: calc(100vh - 44 - var(--kta-statusbar-h) - safe-areas)`).

Helpers exposés :
- `window._fermerGroupeOuvertSide(side)` (side = "left"/"right") → ferme le groupe ouvert si dans la sidebar demandée. Appelé par le bouton ▾/▸/◂ avant de collapser. Skip si `modeActif` (anti-coupure tracker en Play).
- `window._refonteInterfaceCreerBoutonReduction{Left|Right}()` → crée le bouton ≡ de réduction.

#### 41.5 Bouton ≡ de réduction (sidebars collapsibles)

Un bouton par sidebar (gauche + droite), positionné en HAUT via flex `order: -1` (peu importe l'ordre DOM dans lequel Leaflet ajoute ses controls natifs).

**Icônes** (depuis v1.8.1-refonte-7) :
- `▾` = sidebar déployée (flèche vers le bas, "tout est visible en dessous")
- `▸` = sidebar gauche repliée (flèche vers l'intérieur)
- `◂` = sidebar droite repliée (flèche vers l'intérieur)

Helper interne `_iconeCollapse(side, isCollapsed)`. Au clic : toggle `body.kta-refonte-sidebar-{left|right}-collapsed`. CSS cache tous les controls SAUF `.kta-refonte-collapse-bar`.

Pas de persistance localStorage (toujours déroulé au boot).

#### 41.6 Sous-actions horizontales en landscape (depuis v1.9.1)

En portrait, les sous-actions des accordéons s'empilent EN DESSOUS du bouton principal (vertical, la barre grossit vers le bas).

En **landscape mobile** (`@media (max-height: 500px) and (orientation: landscape)`) :
- Chaque `.leaflet-bar` devient un pill horizontal (`display: flex; align-items: center; border-radius: 8px`).
- Sidebar GAUCHE : `flex-direction: row` → subs unfold vers la DROITE (intérieur écran).
- Sidebar DROITE : `flex-direction: row-reverse` → main button reste collé au bord droit (sidebar `align-items: flex-end`), subs unfold vers la GAUCHE (intérieur écran).
- Boutons compacts 30×30 (au lieu de 36×36 en portrait).
- Séparateur interne `border-left` au lieu de `border-bottom`.

**Exception** : `.leaflet-control-zoom` (zoom natif Leaflet) garde `flex-direction: column !important` — convention universelle "+ au-dessus du -" (Google Maps, OSM, etc.). Séparateur entre zoom-in/out en `border-top`.

#### 41.7 Status bar — wrap dynamique + variable CSS (depuis v1.9.1)

**Problème résolu** : avec 4 stats actives en même temps (mesure + dist totale + iti + tracker), le contenu ne tenait plus en largeur et était caché en `overflow-x: auto` (scroll horizontal masqué = info invisible).

**Solution** : `.kta-refonte-statusbar-content { flex-wrap: wrap }`. Le contenu passe sur 2 lignes si besoin, la barre grandit via `min-height` au lieu de `height` fixe.

**Variable CSS partagée** `--kta-statusbar-h` :
- Initialisée à `calc(52px + env(safe-area-inset-bottom, 0px))` (fallback CSS au boot).
- Mise à jour par JS via `ResizeObserver` sur le status bar — lit `offsetHeight` à chaque resize, écrit dans `document.documentElement.style.setProperty("--kta-statusbar-h", h + "px")`.
- Notifie Leaflet via `map.invalidateSize({ animate: false })` (debounce via rAF).

**Tout suit la variable** :
```css
#map               { bottom: var(--kta-statusbar-h) }
.kta-compass-widget{ bottom: calc(var(--kta-statusbar-h) + 8px) }
.leaflet-top       { max-height: calc(100vh - 44 - var(--kta-statusbar-h) ...) }
.kta-readme-modal-overlay { padding-bottom: calc(var(--kta-statusbar-h) + 16px) }
```

**Bouton toggle ▾▴** : 40×36px (font 22px) depuis v1.9.1 (avant 28×24/14px). Plus visible, plus facile à taper au pouce.

#### 41.8 Tracker GPS — boussole LED ON/OFF (depuis v1.9.1)

Avant : stat tracker affichait icône 🚶 + "—" quand inactif, "Actif (x, y)" quand actif. Problème : doublon visuel avec le 🚶 de la stat itinéraire (qui contient "🗺️ ... · 🚶 Normale" = mode marche).

**Maintenant** :
- Icône 🧭 (boussole) + texte "ON" / "OFF" — toujours visible (jamais "—") façon LED hardware.
- **ON** (`.kta-refonte-stat-tracker-on`) : fond vert translucide, bordure verte, texte `#6ee287` gras, `box-shadow: 0 0 6px rgba(76, 200, 100, 0.35)` (lueur LED).
- **OFF** (`.kta-refonte-stat-tracker-off`) : fond rouge translucide, bordure rouge, texte `#e88787` gras.
- Toggle CSS via 2 classes mutuellement exclusives (pas de `.kta-refonte-stat-empty` qui ferait conflit avec `.kta-refonte-stat-tracker-off`).

Stat itinéraire `#kta-refonte-stat-iti` désormais **cliquable** (`.kta-refonte-stat-clickable`) → ouvre `window.ouvrirItinerairModal()` (équivalent ancien comportement du label bottom-left `.kta-iti-distance`). Clic ignoré silencieusement si stat vide (pas d'iti actif).

#### 41.9 Modale "📊 Détails de la session" (depuis v1.8.1-refonte-9)

Compteurs du header (📍 N · 🛣 N · ⬛ N) cliquables → modale qui liste tous les éléments de la session active :

| Section | Contenu |
|---|---|
| 📍 Points ajoutés | Liste avec nom / tag / coord / niveau si multi-niveau |
| 🛣 Tracés | Regroupement par type (Principal/Secondaire/Chemin/Jonction) avec compteur + distance totale par type |
| ⬛ Zones | Regroupement par type (Eau/Remblais/Effondrement/Inaccessible) avec compteur |
| 📊 Autres mesures | Mesure simple (si points ≥ 2), Itinéraire actif (distance + nb waypoints), Tracker (position si actif) |

Fonction `_afficherModaleSessionDetail()` dans `refonteInterface.js`. Pattern `.kta-readme-modal-overlay` + box max-width 560px + sections card-stack. Recalcule en live à chaque ouverture. Toggle re-clic = reopen direct (cleanup d'instance précédente).

Check défensif `typeof _afficherModaleSessionDetail === "function"` dans le handler (anti-déploiement partiel via FTP).

#### 41.10 Modale "🗂 Changer de plan" refondue (depuis v1.9.1)

Avant : dropdown ancré sous le titre fixe (`#kta-plan-switcher` panneau à `top: calc(56 + safe-top)`).

**Maintenant en mode refonte** : modale centrée avec overlay backdrop (pattern `.kta-readme-modal-overlay`).

Structure DOM :
```
.kta-readme-modal-overlay.kta-plan-switcher-overlay
  └── .kta-plan-switcher-modal-boite (#kta-plan-switcher)
       ├── .kta-plan-switcher-modal-header (titre doré "🗂 Changer de plan" + ✕)
       ├── .kta-plan-switcher-modal-corps
       │    ├── .kta-plan-switcher-current (carte highlight dorée + badge "● ACTIF" vert)
       │    ├── .kta-plan-switcher-section-titre "📚 PLANS RÉCENTS"
       │    └── .kta-switcher-list (rows hover bleuté + flèche › qui glisse)
       └── .kta-plan-switcher-modal-footer
            └── .kta-plan-switcher-cta (gros bouton bleu "📚 Voir tous mes plans")
```

JS dans `interface.js` : `_ouvrirPlanSwitcher()` appelle directement `_ouvrirPlanSwitcherRefonte(recents, current)` → modale style refonte. *(L'ancien `_ouvrirPlanSwitcherLegacy` dropdown style v1.8.x a été supprimé au cleanup code mort v1.26.2 — la refonte est imposée depuis v1.14.19.)*

`_fermerPlanSwitcher()` retire `#kta-plan-switcher-overlay` (+ ancien `#kta-plan-switcher` par sécurité).

#### 41.11 CSS scoping

Tout le CSS de la refonte est dans une section `body.kta-refonte-v1 { ... }` à la fin de `css/style.css` (~1500 lignes). Aucune règle ne s'applique si la classe est absente du body.

**Variables CSS importantes** :
- `--kta-statusbar-h` (dynamique, gérée par JS via ResizeObserver) — voir §41.7
- Header bar : `44px` portrait, `36px` landscape
- Sidebars : `max-height: calc(100vh - 44 - var(--kta-statusbar-h) - safe-areas)`
- Safe-area iOS PWA via `env(safe-area-inset-*)` partout

**Sélecteur `:has()`** : utilisé pour adapter `#map { bottom }` quand status bar est collapsed. Compatible Chromium 105+, Safari 15.4+, Firefox 121+ (déc 2023).

#### 41.12 Polling 2s + state via API existantes

Le module ne duplique pas la logique métier. Il lit l'état via les API publiques :
- Compteurs header : `window.getEditorPoints()` / `getRoads()` / `getZones()`
- Stat mesure : `window.getMeasurePoints()` + calcul euclidien + `window.formatDistance()`
- Stat distance totale : `window.getDistanceTotaleStatus()` (API ajoutée pour lire l'état du surlignage magenta `_rdHighlightLayer`, pas le DOM de la modale qui disparaît à la fermeture)
- Stat itinéraire : lecture du DOM du `L.control .kta-iti-distance` (masqué visuellement mais reste dans le DOM, mis à jour par `_majLabelDistanceItineraire`)
- Stat tracker : `window.getTrackingActif()` (boolean) + `getTrackingPosition()` optionnel

Polling 2s = compromis : fluide pour l'user sans gaspiller le CPU.

#### 41.13 Pièges & limites connues

⚠️ **`#kta-titre-fixe` masqué quand refonte active** (`display: none !important`). La logique JS `togglePlanSwitcher()` continue de marcher car appelée par le bouton du header bar refondu.

⚠️ **Toggle nécessite reload** : la classe `body.kta-refonte-v1` doit être appliquée au boot. Le `setActive()` propose un `confirm("Recharger maintenant ?")`.

⚠️ **Status bar masque les controls bottom-left Leaflet** par défaut. Si tu ajoutes un nouveau control bottom-left, il sera caché. Réinitialiser via `#map { bottom: var(--kta-statusbar-h) }` qui décale tout automatiquement.

⚠️ **Cache PWA** : bumper `CACHE_NAME` dans `sw.js` à chaque modif d'un asset caché (CSS/JS/HTML). Pendant la phase Refonte_interface, on utilisait le suffix `-refonte-N` pour invalider le cache à chaque commit. Depuis le merge v1.9.1, suffix retiré (CACHE_NAME = `myktamap-cache-v1.9.1`).

⚠️ **ResizeObserver indispo sur très vieux browsers** : fallback `orientationchange` + sync initial dans `_setupStatusBarResizeObserver`. Le wrap multi-ligne ne se mettra à jour qu'à la rotation, pas en temps réel — acceptable.

⚠️ **Hoisting JavaScript** : `_afficherModaleSessionDetail` est appelée (ligne 211) avant sa déclaration (ligne 438) dans le même IIFE. Le hoisting JS le permet, mais en cas de minifieur agressif ou FTP partiel, on a un check défensif `typeof === "function"` + log console.

#### 41.14 Historique git

- Branche `Refonte_interface` créée depuis `Karma_dev` HEAD `75455a4` (12/05/2026 environ)
- Itérations : `-refonte-1` à `-refonte-17` (commits) sur le suffix CACHE_NAME pour invalider le cache PWA pendant le dev
- Merge v1.9.1 : `Refonte_interface` → `Karma_dev` (puis push `Karma_dev` → `main` via PR au moment du déploiement production)
- Branche `Refonte_interface` peut être archivée après le merge (ou supprimée du remote si KARMA préfère)

#### 41.15 Polish v1.9.2 (22/05/2026 — 17 itérations post-release)

Le lendemain de la release v1.9.1, KARMA a remonté beaucoup de polish UX en testant l'app sur PC et iPhone. 17 commits hotfix appliqués sur le suffix CACHE_NAME `-fix1` → `-fix17`, consolidés en v1.9.2.

##### 41.15.1 Loader PC plein écran (fix9 → fix12)

Itéré : enlargement progressif → finalement full edge-to-edge.
- `#planLoaderOverlay { padding: 0 }`
- `#planLoaderBox { max-width: 100%; min-height: 100vh; border-radius: 0; border: none; box-shadow: none; padding: calc(24 + safe-top) 24 calc(24 + safe-bottom) }`

Les safe-areas iOS sont gérées via le padding interne plutôt que via l'overlay → fond `#1a1f2e` edge-to-edge, contenu visible sous notch/home indicator.

Backdrop décoratif sur PC (≥ 1024px) au cas où des bordures résiduelles subsistent : pattern subtil de points dorés (rgba 0.07) + radial gradient warmer au centre. Mobile inchangé.

##### 41.15.2 Toutes les modales PC agrandies (fix13 → fix14)

Paliers progressifs `≥ 1024 / 1440 / 1920px` → `1400 / 1700 / 2000px` pour :
- `.kta-readme-modal-boite` (Documentation, base, et toutes celles qui héritent : Enregistrer session)
- `.kta-aide-modal-boite` (Aide)
- `.kta-cfg-modal-boite` (⚙️ Réglages map mode)
- `.kta-loader-config-boite` (⚙️ Configuration loader)
- `.kta-legende-modal-boite` (Légende, refactor : retrait du `style="max-width:480px"` inline → ajout classe + multi-cols 2/3/4 selon palier)
- `.kta-export-modal-boite` (Export images, retrait du `style="max-width:580px"` inline + height: auto)

Pour l'Éditeur tableau (`tableEditor.js`), retrait du `width: 1100px` forcé dans le `<style>` injecté.

⚠️ Les modales de confirmation courtes avec inline `style="max-width:420-520px"` (Force update, plan switcher legacy fallback, etc.) gardent volontairement leur taille fixe.

##### 41.15.3 Toggle showRoadIntersections (fix6/fix7)

`APP_CONFIG.showRoadIntersections` (default true) persisté dans `localStorage > app_user_prefs`. Setter `window.setShowRoadIntersections(value)` qui persiste + appelle `renderRoads()` à chaud.

Toggle accessible **uniquement** depuis ⚙️ Configuration du home → section « 🎨 Affichage » (KARMA a fait retirer le doublon de ⚙️ Réglages map mode pour ne pas surcharger les Réglages in-app focus PAR PLAN).

Bug fix bonus dans `buildAppConfigFromPlan` : ce setter reconstruisait `APP_CONFIG = { ...cfg }` SANS les prefs globales → `scaledMarkers` et `showRoadIntersections` étaient écrasés au plan switch. Restauration explicite depuis localStorage maintenue dans cfg.

##### 41.15.4 Tracker rotation unwrapped (fix10)

Bug : la CSS transition `transform: rotate(deg)` interprète les valeurs littéralement. Passage de `rotate(350deg)` → `rotate(10deg)` = -340° d'animation arrière (1 tour quasi-complet) au lieu de +20° par le chemin court.

Fix dans `tracking.js > _applyRotationToTrackerMarker()` :
- Nouvelle variable `_trackerRotationUnwrapped` qui CUMULE les deltas courts (toujours dans `[-180, +180°]`) à chaque tick
- Valeur appliquée au CSS = peut être `-10`, `370`, `720`, `-45`… mais visuellement identique
- Le CSS anime toujours dans le sens physique réel

Reset dans `_resetRotationTrackerMarker()` pour repartir propre au prochain Play.

##### 41.15.5 Splash KARMA animé (fix15 / fix16)

- Retrait du bloc `#splashAuthor` ("Par [karma.png]" centré dans le footer)
- Ajout d'un nouveau `#splashKarmaCorner` en `position: absolute; bottom: 28; right: 28` (28 au lieu de 14 pour anti-clip bord arrondi écrans modernes, KARMA fix17)
- Image karma.png 20px (au lieu de 32px) + drop-shadow doré + animation `clip-path: inset(0 100% 0 0)` → `inset(0 0 0 0)`
- Animation : 5 keyframes explicites (0/20/40/60/80/100%) avec `cubic-bezier(0.45, 0.05, 0.55, 0.95)` (ease-in-out doux) → effet "K-A-R-M-A" lettre par lettre avec transitions smooth. Durée 1.8s, délai 0.8s
- Fade-out synchronisé avec `splashOverlay.fading`

Crédits libs/algo au splash : `🍃 Leaflet · 📦 JSZip · 🧭 Dijkstra` en bas-gauche (déplacé du centre pour libérer le coin droit pour KARMA).

`Dijkstra` réfère à l'algorithme du plus court chemin implémenté dans `js/pathfinder.js > _dijkstra()`. KARMA s'en souvenait phonétiquement comme "djakarta" — pas une lib externe mais un classique informatique (Edsger Dijkstra, 1956) qu'on implémente nous-mêmes.

Ces mêmes 3 crédits ajoutés au :
- Footer du home (`.kta-loader-credits` sous le copyright)
- Footer de la modale Documentation (`.kta-readme-modal-footer`)

##### 41.15.6 Couleur Leaflet alignée à la charte (fix17)

`lib/leaflet/leaflet.css` ligne 266 :
- AVANT : `background: #000000` (noir pur — hack historique pour matcher l'overlay loader perçu noir sur iOS PWA)
- APRÈS : `background: #0a0d18` (charte dark blue-black, identique à `body { background-color }`)

Plus de saut de teinte au retour loader après chargement d'un plan. La transition loader → leaflet → loader est désormais visuellement uniforme.

##### 41.15.7 Tracker GPS LED ON/OFF dans le footer (fix1)

Bug : `_refreshStatusBar` du footer refonte appelait `window.getTrackingActif()` qui n'existait pas dans tracking.js → toujours false → tracker affichait toujours OFF rouge même Play actif.

Fix : ajout de `window.getTrackingActif = function() { return tracking === true }` dans tracking.js à côté des autres getters.

Icône passée de 🚶 à 🧭 (boussole) pour éviter le doublon visuel avec le 🚶 du badge "mode marche" de la stat itinéraire. Style "LED hardware" : pill arrondi avec fond vert (ON) ou rouge (OFF).

##### 41.15.8 Stat itinéraire cliquable (fix1)

`#kta-refonte-stat-iti` (footer) reçoit un handler `click` qui appelle `window.ouvrirItinerairModal()` — équivalent du label `.kta-iti-distance` en bottom-left, désormais masqué pour éviter le doublon. Clic ignoré silencieusement si stat vide.

##### 41.15.9 Export images — layers en grille horizontale (fix15)

Sur PC ≥ 1024px, les blocs de calques (`#kta-export-data-layers`, `#kta-export-image-layers`) s'organisent en :
- 4 cols (≥ 1280px) avec gap 14px
- 3 cols (1024-1279px)
- Stack vertical (< 1024px, inchangé)

Chaque bloc data-layer reçoit fond + bordure subtils pour le matérialiser comme une "carte".

##### 41.15.10 Polish UX divers

- Bouton ▾▴ du footer compact (32×16, font 13) quand `.kta-refonte-statusbar-collapsed` — sinon le 40×36 débordait sur le footer replié 20px
- Stats du footer en doré charte `#f4c542` (au lieu de blanc cassé `#e8eaf0`)
- Retrait du sous-action « 🗂️ Changer de plan » du menu ⬇️ Charger / Import (doublon avec rose des vents + titre cliquable)
- ⚙️ Configuration loader réordonnée : Affichage avant Force update (gradation Force update + Reset consécutifs)
- Modale « Forcer la mise à jour ? » : ajout de `height:auto; max-height:92vh` à l'inline style pour éviter qu'elle prenne 92vh de la base CSS modale enlargée

#### 41.16 Tentatives qui n'ont pas marché (transparence)

- **viewport-fit=cover + apple-mobile-web-app-status-bar-style = black-translucent** (fix4) : tentative pour faire monter le header refonte tout en haut de l'écran iPhone PWA. Provoquait la même "bande sombre en bas" qu'en v1.8.0 → revert (fix5).
- **Fixes iOS rotation status bar** : 3 tentatives empilées (fix1 body class toggle, fix3 scrollTo + viewport meta rewrite). fix1 a même empiré le bug → revert immédiat. C'est un bug iOS Safari standalone PWA documenté, sans API JS officielle pour le contrer. **Status quo accepté** : la status bar (heure, batterie) peut parfois ne pas se restaurer après une rotation landscape → portrait sur iPhone PWA. Non bloquant, pas de fix sans test sur device réel.

#### 41.17 Phases futures (post-v1.9.2)

- **v1.10.x** : accessibilité clavier complète (Tab + raccourcis E/M/Échap)
- **v1.10.x** : polish micro-interactions (transitions sidebars, badges contextuels)
- **v2.0.0** : (quand l'ancienne UI sera abandonnée définitivement) retirer le flag `myktamap_legacy_interface`, supprimer le code mort, bumper en MAJOR car retrait d'un comportement publique

### ⚠️ Hack Leaflet — fond `.leaflet-container`

[`lib/leaflet/leaflet.css`](lib/leaflet/leaflet.css) **ligne 266** a été modifié à la main :

```css
.leaflet-container {
  /* MyKTAMap : noir pur pour matcher l'overlay loader (...) */
  background: #000000;
  outline-offset: 1px;
}
```

**Pourquoi** : sur iPhone PWA standalone, iOS lit la couleur du haut de page pour tinter sa status bar (mode `black-translucent` sans `viewport-fit=cover`). En mettant le fond du container Leaflet en noir pur, le sliver visible juste sous la status bar (avant le rendu des tuiles) garde la status bar dark même quand la map est claire derrière. `#0a0d18` paraissait grisé sur iPhone, d'où le retour à `#000000` en v1.9.2 (la tentative cover a été rollback).

⚠️ **NE PAS REVENIR à `#ddd`** (le défaut Leaflet) sans avoir compris ce qu'on perd. Le commentaire dans le CSS explique l'intention. Lors d'un upgrade Leaflet upstream, **garder ce patch**.

---

### 53. ThemeManager — thème clair / sombre limité mode carte (depuis v1.13.0)

Module `js/themeManager.js` (~150 lignes IIFE) → `window.ThemeManager = { init, getCurrent, setTheme, toggleTheme, onChange, isLight }`.

#### 53.1 Activation & persistance

- `localStorage["myktamap_theme_v1"]` = `"dark"` (défaut) | `"light"` — globale par appareil, jamais par plan
- Au boot : `ThemeManager.init()` lit le localStorage et applique la classe `.kta-theme-light` sur **`document.documentElement` ET sur `document.body`** (les 2 — critique pour matcher les modales appendées à `<html>` qui sont sibling de body)
- `setTheme(t)` : applique + persiste + notifie les listeners + update `<meta name="theme-color">` (statusbar mobile : #f0e8d8 clair / #111827 sombre)
- `toggleTheme()` : flip dark ⇄ light

#### 53.2 Position du toggle UI — 2 endroits synchronisés

1. **Sidebar gauche (mode carte)** : groupe `⚙️ Paramètres` (KARMA choix A:a) → `interface.js > _creerGroupeAccordeon({ id: "settings", sousActions: [⚙️ Réglages, ☀️/🌙 Thème] })`. Avant v1.13.0 ce groupe utilisait `soloAction: afficherConfig` (clic direct sur ⚙️ ouvrait la modale) → migré en sousActions pour héberger le toggle.

2. **Modale Configuration home** : checkbox `#loaderThemeLightCb` dans la section "🔍 Affichage" (script handler `index.html` ~ligne 2620). Au boot, sync via `ThemeManager.isLight()` ; au `change` : `ThemeManager.setTheme(checked ? "light" : "dark")`.

Les 2 toggles sont **synchronisés via `ThemeManager.onChange()`** — changer depuis l'un met à jour l'autre automatiquement.

#### 53.3 Stratégie CSS (~1200 lignes au final)

Tout dans `css/style.css` en fin de fichier, scoped sur **`body.kta-theme-light .selector`** (pour le contenu intra-body) ET **`html.kta-theme-light .selector`** (pour les modales appendées à `documentElement` qui sont sibling de body). Variables CSS dédiées :

```css
body.kta-theme-light {
  --kta-light-bg:            #f0e8d8;  /* body + container Leaflet (beige cataphile) */
  --kta-light-bg-bar:        #c9b88f;  /* header + footer + sidebar + icônes (brun-beige) */
  --kta-light-bg-bar-deep:   #b8a576;  /* hover sur bar items */
  --kta-light-bg-bar-border: #9a8754;  /* bordure forte entre bar/body */
  --kta-light-bg-elevated:   #fdf8eb;  /* modales + cards (presque blanc) */
  --kta-light-bg-deep:       #e5dcc5;  /* table headers + sidebar interne */
  --kta-light-text:          #2a2620;
  --kta-light-text-muted:    #6b6354;
  --kta-light-text-dim:      #8a8270;
  --kta-light-border:        rgba(0,0,0,0.12);
  --kta-light-border-strong: rgba(0,0,0,0.22);
  --kta-light-accent:        #f4c542;  /* jaune charte conservé */
  --kta-light-accent-hover:  #d9a82e;
  --kta-light-accent-bg:     rgba(244,197,66,0.22);
  --kta-light-shadow:        rgba(80,60,30,0.18);
}
```

**Pourquoi 2 prefixes selector ?** Beaucoup de modales sont créées via `document.documentElement.appendChild(modal)` (cf grep dans `js/*.js`) — elles sont enfant direct de `<html>`, sibling de `<body>`. Le selector `body.kta-theme-light .modal` ne matche pas. D'où `html.kta-theme-light .modal` en complément.

**Pourquoi `!important` partout ?** De nombreux modules JS (searchPoints.js, sessionExporter.js, etc.) injectent leurs styles via `<style>` inline. Ces styles externes battent les CSS du fichier sans `!important`. On force avec `!important` pour gagner la spécificité.

#### 53.4 Scope final (toute l'app)

✅ Couvert :
- **Home** : `#planLoaderOverlay`, `#planLoaderBox`, `#myPlansBox`, `#resumeBox`, `#panelZip`, `#allPlansList`, `.plan-card`, `.kta-loader-copyright`, `.kta-loader-perf-*`, `.kta-loader-pin-*`, `.loader-btn-resume` (bouton Reprendre), `.zip-drop-zone`
- **Boutons home** : `.loader-btn-help`, `.loader-btn-secondary`, `.loader-btn-ghost`, `.loader-btn-mini`, `.loader-btn-fs`, `#loadPlanBtn`, `#fsAccessBtn`, `#importListBtn`, `#exportListBtn`, `#loaderPlannerBtn`, `#loaderResetBtn`, `#loaderForceUpdateBtn`, `#loaderHelpBtn`, `#loaderConfigBtn`, `#loaderNetDocBtn`, `#loaderNetLogBtn`, `#loaderShowLogsBtn`
- **Splash chargement plan** : `#splashOverlay` (radial gradient beige), `#splashTitle` (ocre), `#splashSubtitle`, `#splashProgressTrack/Bar`, `.splash-scale-bar` (bandes alternées ocre)
- **Modale Config home** : `.kta-loader-config-boite`, `.kta-loader-config-corps`, `.kta-perf-*`, `.kta-net-paranoia-toggle`
- **Modale Audit** : `#loaderNetDocModal`, `#loaderNetLogModal`, `#loaderNetLogTbody`, `#loaderNetDocWhitelist`, `#loaderParanoiaBadge`
- **Auth gates** : `#kta-unlock-overlay` (code communautaire), `.kta-pin-gate-overlay` (PIN keypad), `.kta-pin-gate-bio-btn` (biométrie), `.kta-pin-proposal-boite` (post-update), `.kta-pin-gate-overlay-lockout`
- **Plan switcher** (clic titre header) : `.kta-plan-switcher-overlay`, `.kta-plan-switcher-modal-boite`, `.kta-plan-switcher-current`, `.kta-switcher-row` + enfants
- **Mode carte** : `.kta-refonte-header`, `.kta-refonte-statusbar`, `.kta-refonte-sidebar*`, `.kta-refonte-counter`, `.kta-refonte-stat`
- **Sidebars Leaflet** : `.leaflet-bar a` (boutons groupes, fond brun-beige), `.leaflet-bar a.kta-sub` (sous-actions, fond brun-beige), `.leaflet-bar a.kta-actif` (vert), `.leaflet-bar a.kta-group-mode-actif` (fond **blanc solide** + bordure jaune charte — KARMA fix "icône actif fond blanc pas transparent")
- **Modales du pattern principal** : `.kta-readme-modal-*` (Session, Recherche, Itinéraire, Mesure, Édition, Export, Réglages, Aide, Doc IA, Légende, M-LVL, Replay) — couvre aussi les descendants h1/h2/h3/p/li/span/strong/em/div via catch-all `* { color: var(--kta-light-text) !important }` dans `html.kta-theme-light .kta-readme-modal-overlay .kta-readme-modal-corps`
- **Sommaire / TOC** : `.kta-readme-toc-row/-link/-link-h2/-link-h3/-bullet/-toggle/-sublist` — hiérarchie restaurée (H2 bold foncé, H3 muted, border-left ocre, hover jaune)
- **Modale Update** (depuis badge version footer) : `#kta-update-modal` avec overrides des inline styles via attribute selectors `[style*="rgba(140,180,255"]` etc.
- **Modale Enregistrer session** : `#kta-session-export-modal` + onglets `.kta-ses-tab` + boutons `.kta-ses-btn-*` + items `.kta-ses-cb-row/.kta-ses-radio-row/.kta-ses-summary`
- **Onglets Mode rapide/avancé** : `.kta-conv-sens-btn` + `.active` (jaune charte plein)
- **Recherche unifiée Ctrl+K** : `.kta-search-input-wrap` + `input` (fond blanc + focus jaune), `.kta-search-result-item` + hover/selected, `.kta-search-filter-chip` + active, `.kta-search-group-titre`
- **Labels Leaflet** : `.kta-measure-distance` + `.kta-iti-distance` + segments + angles
- **Leaflet natif** : `.leaflet-container`, `.leaflet-popup-*`, `.leaflet-tooltip`, `.leaflet-control-layers-*`, `.leaflet-bar`
- **Toasts** : `.kta-toast`, `.kta-toast-msg`, `.kta-toast-icon`, `.kta-toast-close`, `.kta-toast-info/error` (border-left adaptée)
- **Modales progress `.kta-modal-*`** : Mise à jour en cours, Reset en cours, Session en cours, Yes/No
- **Modale Choix suppression** : `.kta-choix-suppr-*`
- **Modale chargement plan** : `.kta-load-overlay` + `.kta-load-box` + `.kta-load-spinner` (ocre)
- **Boutons généraux** : `.kta-btn`, `.kta-btn-primary` (jaune), `.kta-btn-secondary`, `.kta-btn-ghost`, `.kta-btn-link`, `.kta-btn-danger`
- **Alertes publiques** : `.kta-alert-*` (emergency rouge kept dramatique, warning orange, info bleu, absent neutre, selector cascade)
- **Stats agrégées + détail Session active** : `.kta-refonte-stats-*` + `.kta-refonte-session-*`

❌ Volontairement non couverts (restent dark) :
- **Splash KARMA cinématique** au tout début du boot (animation rotation boussole, contrastes dark requis pour l'effet fade-in lettres)
- **Viewer photos plein écran** (overlay sombre par essence pour bonne lecture des photos)

#### 53.5 Sync mode urgence

Le mode urgence garde son toggle 🔆/🌑 LOCAL (theme local `_theme` interne). Au `activer()`, on lit `ThemeManager.isLight()` pour initialiser `_theme` au boot de l'overlay :

```js
function activer() {
  if (window.ThemeManager && typeof window.ThemeManager.isLight === "function") {
    _theme = window.ThemeManager.isLight() ? "light" : "dark";
  }
  // ...
}
```

Le toggle local du mode urgence ne propage PAS à `ThemeManager` (volontaire — cas d'usage : "lampe d'appoint en sous-sol pendant 30 sec" sans changer la pref globale).

#### 53.6 Ordre de chargement

`<script src="js/themeManager.js">` chargé **juste après** `js/copyright.js` dans `index.html` :
- Copyright = pas de DOM, juste console banner → OK
- ThemeManager = doit s'appliquer AVANT le rendu pour éviter le FOUC (flash dark → light)
- Le reste des modules (debug, perfUltra, unlockGate, pinLock, main, etc.) peut alors lire `window.ThemeManager`

#### 53.7 Pour étendre

**Ajouter une modale qui supporte le thème** :

1. **Pattern A (recommandé)** : utilise `.kta-readme-modal-overlay` + `.kta-readme-modal-boite` → couvert automatiquement via les règles catch-all `html.kta-theme-light .kta-readme-modal-overlay *`. Si ta modale a un contenu **COURT**, ajoute aussi sur sa classe spécifique :
   ```css
   .ma-modal-boite {
     max-width: ...;
     height: auto !important;
     max-height: 90vh !important;
   }
   ```
   pour éviter le bug 88vh étiré (cf §53.9 ci-dessous).

2. **Pattern B (modale custom hors `kta-readme-modal-*`)** : il faut écrire les overrides manuellement avec `html.kta-theme-light .ma-classe { ... !important }` dans `style.css`. **Toujours utiliser `!important`** car de nombreux modules injectent leurs styles en `<style>` inline qui battent CSS externe non-important.

3. **Si tu append la modale à `document.documentElement`** (pattern majoritaire dans le projet) : utilise le sélecteur `html.kta-theme-light .ma-classe` (PAS `body.kta-theme-light`) — sinon la classe `.kta-theme-light` sur `<body>` ne peut pas matcher car la modale est sibling de body.

**Écouter les changements de thème** depuis un module dépendant :
```js
if (window.ThemeManager) {
  window.ThemeManager.onChange(function(theme) {
    // theme = "dark" | "light"
    // refresh ton UI ici
  });
}
```

#### 53.8 À NE PAS faire

- ❌ Stocker le thème ailleurs qu'en `localStorage["myktamap_theme_v1"]` (= source de vérité unique)
- ❌ Appliquer la classe `.kta-theme-light` à un autre élément que `<html>` et `<body>` (les modales ajoutées à `documentElement` doivent matcher via `html.kta-theme-light .modal`)
- ❌ Bypass `ThemeManager.setTheme()` en appliquant la classe directement (pas notifié, pas persisté, désync entre les 2 toggles UI sidebar/Config-home)
- ❌ Inventer de nouvelles couleurs custom — utilise les variables `--kta-light-*` pour la cohérence
- ❌ Oublier `!important` dans les overrides — les styles inline injectés par certains modules (searchPoints.js, sessionExporter.js, sidebar par `<style>`) battent les CSS externes non-important

#### 53.9 Bug 88vh étiré sur modales courtes (fix général)

Pattern récurrent depuis v1.9.2 : `.kta-readme-modal-boite { height: 88vh }` sur PC étire les modales courtes (contenu ~300px) à 88vh avec moitié vide en dessous. Fix appliqué progressivement :

| Modale | Release | Classe |
|---|---|---|
| Export PNG | v1.9.2-fix14 | `.kta-export-modal-boite` |
| Export PDF | v1.10.3 | `.kta-pdf-modal-boite` |
| PIN proposal | v1.11.1 | `.kta-pin-proposal-boite` |
| Image volumineuse (mode urgence) | v1.12.0 | `[max-width: 460px]` |
| **Niveaux M-LVL** | v1.13.0 | `.kta-niv-modal-boite` |
| **Légende** | v1.13.0 | `.kta-legende-modal-boite` |
| **Jonction interniveau** | v1.13.0 | `.kta-jct-modal-boite` |
| **Itinéraire** | v1.13.0 | `.kta-iti-modal-boite` |
| **Je suis perdu** | v1.13.0 | `.kta-lost-modal-boite` |
| **Enregistrer session** | v1.13.0 | `#kta-session-export-modal .kta-readme-modal-boite` (modale sans classe spécifique) |

**Pattern uniforme** :
```css
.ma-modal-boite {
  max-width: ...;
  height: auto !important;
  max-height: 90vh !important;
}
```

**Important** : ce fix est **général (dark + light)**, pas scope `body.kta-theme-light`. Toute nouvelle modale avec contenu court doit suivre ce pattern dès sa création — pas un fix réactif post-feedback user.

---

---

### 61. v1.20.0 — Polish UX + DX (3 améliorations indépendantes)

Release MINOR de qualité, 3 sujets indépendants regroupés.

#### 61.1 Aide intégrée enrichie (`js/interface.js > afficherAide`)

2 nouvelles sections ajoutées à la modale 📚 Aide / Doc :

- **📊 Inspecteur mémoire (v1.19.0)** — 7 puces qui détaillent les 5 sections de la modale Memory Inspector + le bouton 📋 Copier le rapport. Cas d'usage debug explicites + précision « 100 % local, aucune donnée transmise ».
- **🏷️ Légende personnalisable (v1.16.0 + v1.17.0 + v1.18.x)** — 7 puces qui synthétisent la cascade complète : 3 niveaux (session > plan > défaut MKM), 2 points d'édition (session via Export PNG / map mode, plan-level via Générateur Avancé), 4 catégories couvertes (icônes / tracés / zones / structures), roundtrip KMZ + GPX, détection au preview d'import.

Placement : entre « 📊 Stats session enrichies » et « 🎬 Replay tracker » pour regrouper les outils de visualisation/transparence.

Bonus : enrichissement section existante « 🏗️ Créer / Modifier un plan » avec mention du Mode Simple/Avancé (cf §58).

#### 61.2 Update Checker en vrai semver (`js/updateChecker.js`)

Nouveau helper interne `compareSemver(a, b)` :

```js
function compareSemver(a, b) {
  function _parse(v) {
    if (v == null) return [0];
    const clean = String(v).replace(/^v/i, "").split("-")[0];
    return clean.split(".").map(function(n) {
      const x = parseInt(n, 10);
      return isNaN(x) ? 0 : x;
    });
  }
  const pa = _parse(a);
  const pb = _parse(b);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const na = pa[i] || 0;
    const nb = pb[i] || 0;
    if (na > nb) return  1;
    if (na < nb) return -1;
  }
  return 0;
}
```

**Anti-bug latent** : `"v1.7.10" < "v1.7.9"` en string (lexicographique). Pas un bug aujourd'hui (`check()` n'utilise que `===`), mais protège contre toute future utilisation de `<` ou `>`.

**Nouveau cas géré dans `check()`** : downgrade serveur. Si `compareSemver(remote.version, known) < 0` → on retourne `{ status: "downgrade-detected" }` sans afficher la modale d'update et SANS mettre à jour `_setKnownVersion` (on garde la version installée comme référence pour ne pas perdre le repère semver de l'user).

**API publique** : `window.UpdateChecker.compareSemver(a, b)` exposé. Formats acceptés :
- `"v1.7.10"` (avec prefixe v)
- `"1.7.10"` (sans prefixe)
- `"v1.7.10-fix2"` (suffix après `-` ignoré → `[1, 7, 10]`)
- `"v143"` (legacy pré-v1.7.1, traité comme `[143]`)

`showCurrent()` (déclenchée au clic badge version footer) utilise aussi `compareSemver` : `_cmpShow <= 0` → message neutre "à jour" (= égalité OU downgrade serveur → pas de fausse promesse d'upgrade).

#### 61.3 Force update auto-proposé sur mismatch CACHE_NAME (`index.html`)

Nouveau hook dans `index.html` (script SW register) :

```js
let _swIsInitialControl = !navigator.serviceWorker.controller;
navigator.serviceWorker.addEventListener("controllerchange", function() {
  if (_swIsInitialControl) {
    _swIsInitialControl = false;
    return; // Premier install — pas de toast
  }
  // Vraie update : un ancien controller a été remplacé
  if (window.OOMGuard && typeof window.OOMGuard.showToast === "function") {
    window.OOMGuard.showToast(
      "🔄 Mise à jour mineure appliquée — assets fraîchement rechargés.",
      "info"
    );
  }
});
```

**Pourquoi ça marche** : le SW MyKTAMap fait déjà `self.skipWaiting()` au install (sw.js ligne 254) + `self.clients.claim()` au activate (ligne 277). Donc dès qu'un nouveau SW s'install (bump CACHE_NAME serveur), il prend immédiatement le contrôle des pages ouvertes → `controllerchange` fire dans la session courante.

**Garde-fou `_swIsInitialControl`** critique : `navigator.serviceWorker.controller === null` au premier load (= page pas encore contrôlée). Le SW arrive après l'install, fire `controllerchange` pour la PREMIÈRE fois → c'est l'install initial, PAS une mise à jour. On skip ce premier événement, sinon on afficherait un toast trompeur au tout premier lancement PWA.

**Bonus traçabilité** : hook `reg.addEventListener("updatefound")` qui log l'état du nouveau SW en console à chaque transition. Visible dans 🐛 Logs détaillés (debugMode ON). Aide à diagnostiquer le cas où un nouveau SW s'install mais reste en "installed" sans atteindre "activated" (= bug du SW lui-même).

#### 61.4 À NE PAS faire

- ❌ **Utiliser `<` ou `>` direct sur des strings de version** — toujours passer par `UpdateChecker.compareSemver()`. Si tu vois un `if (v1 < v2)` quelque part avec des strings semver, c'est un bug latent.
- ❌ **Skip le garde-fou `_swIsInitialControl`** — sans lui, le toast "Mise à jour mineure" apparaîtrait au tout premier lancement PWA de chaque user (= trompeur, ce n'est pas une mise à jour, c'est juste l'install).
- ❌ **Notifier l'user d'une "mise à jour" sans bumper CACHE_NAME** — le toast ne fire que si le SW change. Si on push juste des fichiers non-cachés (genre `alert.json`, `version.json`), aucun toast → c'est cohérent (pas une mise à jour du code applicatif).
- ❌ **Mettre à jour `_setKnownVersion` lors d'un downgrade-detected** — on garderait alors la version OLDER comme référence et au prochain check, la même "downgrade" serait re-détectée. Pattern : ne pas écraser `_knownVersion` quand `cmp < 0`.

#### 61.5 Cycle dev avec CACHE_NAME suffixes

Pendant le dev d'une release (validation terrain entre fixes), pattern utilisé :
- Release initiale : `CACHE_NAME = "myktamap-cache-v1.X.Y"`
- Fix 1 (CSS, sans bump version visible) : `myktamap-cache-v1.X.Y-fixes`
- Fix 2 : `myktamap-cache-v1.X.Y-fixes2`
- Etc.

Quand la release finale est mergée sur main, on règle le CACHE_NAME au format final propre (sans suffix). Cf bump v1.20.0 qui reset `-fixes2` → `-` plus rien.

Le toast `controllerchange` fire à chaque bump du suffix → l'user voit clairement que des fixes mineurs ont été appliqués entre 2 sessions sans avoir à comprendre la mécanique CACHE_NAME / SW.

---

---

### 64. v1.21.5 — Refonte filtre Leaflet (modale ≡ unifiée + filtrage runtime tags/types)

Release PATCH (bump Z : 1.21.4 → 1.21.5). Refonte UX complète du bouton `≡` Leaflet topright. Module **nouveau** `js/filterPanel.js` (~655 lignes IIFE).

#### 64.1 Architecture

**Avant** : `js/map.js` ligne 389 (env.) faisait `L.control.layers(null, overlays).addTo(map)` → control natif Leaflet qui togglait image + data layers en cochant/décochant des cases. Pas de filtre tag/type.

**Après** : `L.control.layers(...)` **supprimé**. `js/map.js` expose `window._ktaOverlays = overlays;` pour que FilterPanel puisse les toggler. Un nouveau custom control `L.control.ktaFilterControl` (défini dans `interface.js`) est ajouté topright avec la même icône `&#9776;` (≡ trois barres horizontales — KARMA : « visuelement meme icone des troi barre noir horizontal »). Au clic → `window.FilterPanel.ouvrir()`.

#### 64.2 État runtime global

```js
window._ktaRuntimeFilters = {
  tags:        Set<string> | null,   // null = pas de filtre (tout visible)
  roadTypes:   Set<string> | null,
  zoneTypes:   Set<string> | null,
  structTypes: Set<string> | null
};
```

**Convention `null`** = rétro-compat. Tout module level-aware (road.js, zones.js, structures.js, editor.js, utils.js) check `if (window._ktaRuntimeFilters && window._ktaRuntimeFilters.X)` AVANT de filtrer → si null, comportement v1.21.4 strict.

#### 64.3 API publique `window.FilterPanel`

- `ouvrir() / fermer() / isVisible()` — modale
- `getState()` → retourne `window._ktaRuntimeFilters` (référence directe)
- `setFilters(partial)` — mute par champ (tags, roadTypes, ...) + déclenche `_scheduleApply` + `_notify`
- `onChange(cb)` — subscribe aux changements (debounce 200ms)
- `applyFilters()` — force re-render via `window.appliquerFiltreRuntime`
- `onLevelChange()` — appelée par `appliquerFiltreNiveau` quand le M-LVL change ailleurs → re-render la section M-LVL si la modale est ouverte (sync bidirectionnel)

#### 64.4 Cascade re-render — `window.appliquerFiltreRuntime`

Helper global dans `interface.js`, alias de `appliquerFiltreNiveau` :

```js
window.appliquerFiltreRuntime = function() {
  if (typeof window.appliquerFiltreNiveau === "function") {
    window.appliquerFiltreNiveau();
  }
};
```

**Pourquoi un alias ?** Les modules level-aware (renderRoads, renderZones, renderStructures, _applyLevelFilterToData*) appliquent runtime+niveau dans la même passe de rendu. Pas besoin de 2 passes distinctes.

#### 64.5 Hooks runtime niveau modules

**road.js > renderRoads** (après `_passeFiltreNiveau`) :
```js
if (window._ktaRuntimeFilters && window._ktaRuntimeFilters.roadTypes
    && road.type !== "itinerary" && road !== currentRoad) {
  if (!window._ktaRuntimeFilters.roadTypes.has(road.type)) return;
}
```

**zones.js > renderZones** (après `_zonePasseFiltre`) :
```js
if (window._ktaRuntimeFilters && window._ktaRuntimeFilters.zoneTypes
    && zone !== currentZone) {
  if (!window._ktaRuntimeFilters.zoneTypes.has(zone.type)) return;
}
```

**structures.js > renderStructures** (après `_structurePasseFiltre`) :
```js
if (window._ktaRuntimeFilters && window._ktaRuntimeFilters.structTypes
    && s !== currentStructure) {
  if (!window._ktaRuntimeFilters.structTypes.has(s.type)) return;
}
```

**editor.js > _ajouterMarker** : pose `marker._ktaTags = Array.isArray(point.tags) ? point.tags.slice() : []`. Puis `_appliquerFiltreNiveauSurMarker` combine niveau + tag filter :
```js
if (visible && window._ktaRuntimeFilters && window._ktaRuntimeFilters.tags) {
  const tag = (Array.isArray(marker._ktaTags) && marker._ktaTags[0])
              || (marker._ktaTag)
              || "default";
  if (!window._ktaRuntimeFilters.tags.has(tag)) visible = false;
}
```

**utils.js > _filtreNiveauSurPolygonData** étendu avec param `kindForRuntime` ("zones" | "structs") — passé par `_applyLevelFilterToDataZones` ("zones") et `_applyLevelFilterToDataStructures` ("structs"). Permet de distinguer le filtre runtime à appliquer (zoneTypes vs structTypes) sur les polygons embedded.

#### 64.6 Préservation `currentRoad`/`currentZone`/`currentStructure`

⚠️ **Critique** : le tracé/zone/structure EN COURS de dessin bypass le filtre runtime. Sinon : user trace une route Principal pendant que filtre Principal=off → le tracé courant disparaît instantanément → user perdu.

Implémenté via `road !== currentRoad` (et équivalent) dans chaque hook. Le re-render normal une fois le mode désactivé applique le filtre comme prévu.

**Itinéraires** (`road.type === "itinerary"`) toujours bypassés aussi : calculés par Pathfinder, doivent rester visibles peu importe le filtre.

#### 64.7 Live update + debounce 200ms

Chaque toggle (input change, mini-action Tout/Aucun, reset all) appelle `_scheduleApply()` qui debounce `applyFilters()` à 200ms. Évite le freeze sur plans denses lors de clics rapides successifs (ex : `_toggleAll` enchaîné).

#### 64.8 Persistance per-plan via SessionPersist

**Sérialisation** : Sets → Arrays via `_serializeRuntimeFilters()` dans `sessionPersist.js > _gatherState()` :
```js
runtimeFilters: _serializeRuntimeFilters()  // {tags: [...]|null, roadTypes: [...]|null, ...}
```

**Restore** : Array → Set via `_toSet(arr)` dans `_restore()` :
```js
if (payload.runtimeFilters && typeof payload.runtimeFilters === "object") {
  const rf = payload.runtimeFilters;
  if (!window._ktaRuntimeFilters) {
    window._ktaRuntimeFilters = { tags: null, roadTypes: null, zoneTypes: null, structTypes: null };
  }
  function _toSet(arr) { return Array.isArray(arr) ? new Set(arr) : null; }
  window._ktaRuntimeFilters.tags        = _toSet(rf.tags);
  window._ktaRuntimeFilters.roadTypes   = _toSet(rf.roadTypes);
  window._ktaRuntimeFilters.zoneTypes   = _toSet(rf.zoneTypes);
  window._ktaRuntimeFilters.structTypes = _toSet(rf.structTypes);
  // Apply après timeout 200ms pour laisser les markers session être restaurés (phase 2 itineraries)
  setTimeout(function() {
    if (typeof window.appliquerFiltreRuntime === "function") {
      try { window.appliquerFiltreRuntime(); } catch(e) {}
    }
  }, 200);
}
```

⚠️ **Timing 200ms** : aligné avec la phase 2 de restore des itineraries (cf §9). Sinon, les markers session ne seraient pas encore re-créés → filter inopérant.

#### 64.9 Sync M-LVL bidirectionnel

**Sens 1 : modale Niveaux → FilterPanel** :
`interface.js > appliquerFiltreNiveau` appelle en fin de fonction :
```js
if (window.FilterPanel && typeof window.FilterPanel.onLevelChange === "function") {
  try { window.FilterPanel.onLevelChange(); } catch(e) {}
}
```
`onLevelChange()` re-render la section M-LVL via `_renderLevelsSection` + `_bindLevelHandlers(sec)` si la modale est ouverte.

**Sens 2 : FilterPanel → modale Niveaux** :
Les handlers de la section M-LVL mutent directement `APP_CONFIG.visibleLevels` puis appellent `window.appliquerFiltreNiveau()` qui propage à tous les modules level-aware + la pastille M-LVL.

#### 64.10 Énumération tags (KARMA "Seulement ceux présents")

`_enumerateTags()` :
1. Itère `getEditorPoints()` (session)
2. Itère `window._ktaDataMarkers` (data layer markers, posés par `utils.js > ajouterPointsDepuisJSON`)
3. Pour chaque marker, prend `m._ktaTags[0]` ou `"default"` fallback
4. Count par tag, tri desc
5. Retourne `[{tag, count, iconUrl?}]` avec `iconUrl` lookuped via `window._iconMap[tag]`

Si 0 tag → section affiche "Aucun point dans cette session."

#### 64.11 À NE PAS faire

- ❌ Réintroduire `L.control.layers(null, overlays)` natif — casserait l'ergonomie unifiée (2 modales redondantes pour le filtre)
- ❌ Bypass `currentRoad`/`currentZone`/`currentStructure` dans les hooks runtime — le user qui dessine perd son tracé en cours instantanément
- ❌ Filtrer `road.type === "itinerary"` ou `s === currentStructure` — toujours bypass (cf §64.6)
- ❌ Stocker `_ktaRuntimeFilters` dans une key localStorage globale séparée — utiliser le payload SessionPersist (`runtimeFilters` champ) pour cohérence per-plan
- ❌ Sérialiser des Sets en JSON direct (`JSON.stringify(new Set(...))` retourne `"{}"`) — toujours convertir en Array via `Array.from(set)` avant
- ❌ Appliquer `appliquerFiltreRuntime()` synchroniquement au boot SessionPersist — utiliser `setTimeout(_, 200)` pour laisser la phase 2 restore (itineraries) finir
- ❌ Appeler `_enumerateTags()` ou `_enumerateTypes()` dans une boucle de render — coûteux (itère session + embedded à chaque appel). Cache l'résultat si utilisé plusieurs fois dans la même passe de render
- ❌ Modifier `window._ktaRuntimeFilters` directement depuis un autre module — passer par `FilterPanel.setFilters({...})` pour bénéficier de `_scheduleApply` + `_notify`

#### 64.12 Pour étendre

**Ajouter un nouvel axe de filtre runtime** (ex: `photoTags` pour filtrer par tag photo) :
1. Ajouter le champ dans `window._ktaRuntimeFilters` initialization (filterPanel.js IIFE start)
2. Ajouter le helper `_enumerateXxx()` qui retourne la liste des valeurs présentes
3. Ajouter le rendu section via `_section(...)` dans `_renderAllSections`
4. Ajouter le hook runtime dans le module concerné (lecture `if (window._ktaRuntimeFilters && window._ktaRuntimeFilters.xxx) ...`)
5. Ajouter la sérialisation/désérialisation dans `_serializeRuntimeFilters` et le restore SessionPersist
6. Ajouter le status footer line dans `_updateStatus`
7. Ajouter dans `setFilters` partial handler

**Sources de vérité v1.21.5** :
- `version.json` → `"v1.21.5"`
- `js/copyright.js > __MKM__.build` → `"v1.21.5"`
- `sw.js > CACHE_NAME` → `"myktamap-cache-v1.21.5-filterpanel"`
- 1 nouveau fichier `js/filterPanel.js` (~655 lignes) ajouté à `ASSETS_TO_CACHE` + balise `<script>` dans `index.html` après `interface.js`

#### 64.13 v1.21.5-fix1 — 4 fixes post-release suite tests terrain

Fixes appliqués sans bump version (CACHE_NAME inchangé `myktamap-cache-v1.21.5-filterpanel`).

**Fix 1 — CSS FilterPanel COMPLÈTEMENT OUBLIÉ à la release initiale** : ~280 lignes manquantes pour les classes `.kta-fp-*`. Le navigateur affichait tout en flux brut (PNG tag icons à leur taille naturelle 50×50, checkboxes default inline, pas de padding ni alignement). Diagnostic immédiat sur screenshot KARMA : chips empilés sans grid, label/count smashed sur l'icône.

Ajout (`css/style.css` +280 lignes en fin de fichier, après la section v1.21.4 KMZ light theme) :
- `.kta-fp-boite` : max-width 560/720px PC, height auto + max-height 90vh (anti bug 88vh étiré)
- `.kta-fp-section` (details) : accordéon avec border ambre + chevron `▸/▾` qui pivote via `transform: rotate(90deg)` au `[open]`
- `.kta-fp-chips-grid` : `grid-template-columns: repeat(auto-fill, minmax(180px, 1fr))` — 1 col mobile < 480px, auto-fill sinon
- `.kta-fp-chip` : Flexbox avec **icône width/height 22px object-fit:contain** (critique — sinon PNG natif 50×50), label `flex: 1 + ellipsis`, count badge pill ambré
- `.kta-fp-chip-off` : opacity 0.5 + label `text-decoration: line-through` + count grisé (signal visuel "masqué")
- `.kta-fp-row-cb` : Image/Data layers row simple (pas de grid)
- `.kta-fp-lvl-segmented` + `.kta-fp-lvl-btn` : M-LVL pills horizontaux, actif = fond jaune charte `#f4c542` + texte `#1a1f2e`
- `.kta-fp-mini-btn` : Tout/Aucun mini-boutons bleus translucides `rgba(140,180,255,...)`
- `.kta-fp-footer` : Reset + status, fond dark + border-top ambré
- `.kta-filter-ctrl a` : override Leaflet `.leaflet-bar a` default pour assurer le `≡` propre 30×30 fond blanc
- **Thème clair** : variants complets `body/html.kta-theme-light` via variables `--kta-light-*` (cf §53 pattern)

⚠️ **Leçon** : quand on crée un nouveau module IIFE qui pose son propre HTML via classes custom, **vérifier visuellement le rendu AVANT de release** — pas juste compter sur la logique JS pour valider. Le CSS oublié ne plante pas, ne génère aucun warning console, mais rend l'UI inutilisable.

**Fix 2 — Exclusion `type === "itinerary"` du filtre** : `_enumerateTypes(category)` dans `filterPanel.js` itère toutes les roads pour construire `counts[type]`. Il prenait au passage le pseudo-type `"itinerary"` posé par Pathfinder sur la road de navigation calculée → apparaissait comme un type filtrable dans la section "🛣️ Types de tracés" alors que c'est un dérivé, pas un choix utilisateur.

```js
if (category === "roads" && it.type === "itinerary") return;  // skip
```

Cohérent avec le hook runtime dans `road.js > renderRoads` qui bypass déjà `road.type === "itinerary" && road !== currentRoad` (cf §64.5). Le filtre `roadTypes` ne touche jamais aux itineraries.

**Fix 3 — Stats Home : labels TOUJOURS par défaut** (KARMA : « *en stat général, on doit toujours prendre la valeur par default* »).

Avant : `_renderProfilePies` (index.html) appelait `renderPie(data, s.category, 140)` → `_renderPieChart` consultait `_lcLabelStat` → `LegendCustomization.getLabel` cascade session > plan > default → appliquait le renommage local du plan A (« principal » → « route de surface ») à l'agrégat cross-plan home.

Fix : ajout d'un 4e param `useDefaultLabels` à `_renderPieChart` :

```js
function _renderPieChart(data, category, size, useDefaultLabels) {
  // ...
  const _labelFn = useDefaultLabels ? _defaultLabelStat : _lcLabelStat;
  // ... dans la légende : _labelFn(category, k, k) au lieu de _lcLabelStat
}
```

Nouveau helper `_defaultLabelStat(category, type, fallback)` qui consulte UNIQUEMENT `LegendCustomization.getDefaultLabel(lcCat, type)` (court-circuite la cascade). Préserve le préfixe `✨` pour les customs `cust-*` (qui n'ont pas de version "default" — toujours custom par essence).

L'appel `index.html > _renderProfilePies` passe `true` → cross-plan home a des labels génériques cohérents. La modale Stats GLOBALES **in-plan** garde l'appel sans 4e arg → cascade LC normale préservée.

**Fix 4 — Stats Home : secondaire / level -1 manquants** (KARMA : « *les route secondaire ou taguer lvl -1 ne semble pas pris en compte* »).

**Audit confirme pas de drop technique** dans `_computePlanStatsLive` (index.html) :
- `getRoads()` retourne toutes les roads sans filtre
- `getAllEmbeddedRoads()` retourne toutes les embedded (pas de filtre layer.hasLayer depuis v146)
- `_countBy(sessRoads.concat(embedRoads), function(r) { return r.type || "principal"; })` ne filtre pas par type ni level

**2 régressions silencieuses identifiées** dans `_resoudreStatsPlan` (index.html) :

**(a)** Le cache v1.21.3 sans champ `breakdowns` (release antérieure) retournait `breakdowns: cached.breakdowns || null` → `null` → ligne `_mergeBreakdown` plus loin checkait `if (stats.breakdowns)` → **skip total du plan** dans l'agrégation des 4 camemberts. Fix : check explicite `cached.breakdowns && typeof === "object"`. Si absent ou corrompu, **fall through au cas 3** (session-only) au lieu de skip → au moins les données session du plan sont contribuées.

**(b)** Le fallback `session-only` (cas 3) ne lisait que `data.editorPoints` + `data.roads` du payload SessionPersist → les zones et structures du plan étaient ignorées dans l'agrégation, et donc les `secondaire`/`chemin`/jonctions M-LVL absents de la section "🛣️ Tracés par type" pour les plans jamais rouvert depuis v1.21.4. Fix : extension de la lecture à `data.zones` + `data.structures` (toujours présents dans le payload depuis v1.9.3-A1.a) → `zonesByType` et `structsByType` correctement remplis.

**Limitation acceptée** : la session-only ne lit pas les **data layers embedded** (les `data/*.json` du ZIP). Si un user a tous ses tracés `secondaire` ou en niveau -1 stockés dans un data layer du plan (pas en session) et n'a jamais rouvert ce plan depuis v1.21.4 → ils restent invisibles dans Stats Home tant que le plan n'est pas rouvert une fois (la réouverture déclenche `_persisterStatsPlanCourant` qui régénère le cache complet avec tous les breakdowns embedded).

**Sources fix1** : `js/filterPanel.js` (+5), `js/statsGlobales.js` (+35), `index.html` (+13 net), `css/style.css` (+280). Pas de bump version.

---

### 71. Mise à jour douce — flow optimisé (hotfix21 — 2026-05-27)

KARMA quote :
> « ca bloque a "Rechargement..." pareil bloque la sur vérification de la version du SW puit ca pase mais long »

#### 71.1 Diagnostic du blocage avant hotfix21

Avant hotfix21, `interface.js > mettreAJourCodeSeul()` bloquait à 2 endroits :

1. **"Vérification de la version du Service Worker…"** : `await reg.update()` lance l'INSTALL du nouveau SW en synchrone — l'install fait `cache.add(asset, { cache: "reload" })` × **~100 assets** avec bypass du cache HTTP → 30s-2min sur réseau lent.
2. **"Rechargement…"** : après purge totale des caches (étape 3), `location.reload()` force le SW à re-fetch + re-cache TOUS les assets (~100 fichiers séquentiels) → 10-60s supplémentaires.

Le pire : ces deux blocages faisaient le **même travail deux fois** (l'install pré-remplissait le cache, qu'on supprimait juste après, qu'on re-remplissait au reload).

#### 71.2 Fix appliqué hotfix21

**Côté SW (`sw.js`)** : ajout d'un handler `message` (entre ACTIVATE et FETCH) qui répond aux 2 types `GET_CACHE_NAME` (via MessageChannel) et `SKIP_WAITING`.

**Côté client (`interface.js`)** :
- Nouveau helper `_getCacheNameFromSW()` (timeout 2s, retourne null si SW pas joignable)
- `mettreAJourCodeSeul()` réécrit avec ces 4 changements :
  1. Récupère le `CACHE_NAME` courant via postMessage AVANT toute purge
  2. `reg.update()` devient **fire-and-forget** (pas de await) — l'install se fait en background pendant que la suite tourne
  3. Purge **filtrée** : on supprime seulement les caches `!== currentCacheName` (= les ANCIENS hotfix), pas le courant ni le tout nouveau qui se crée
  4. Reload avec setTimeout 200ms (au lieu de 400ms — postMessage est arrivé)

```js
// sw.js — handler ajouté
self.addEventListener("message", (event) => {
  const data = event.data || {};
  if (data.type === "GET_CACHE_NAME") {
    if (event.ports && event.ports[0]) {
      event.ports[0].postMessage({ type: "CACHE_NAME", name: CACHE_NAME });
    }
  } else if (data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});
```

#### 71.3 Pattern MessageChannel

Pour le `GET_CACHE_NAME`, on utilise un `MessageChannel` plutôt que `serviceWorker.addEventListener("message")` global pour garantir que la réponse arrive au bon onglet (cas multi-onglets). Pattern :

```js
const channel = new MessageChannel();
channel.port1.onmessage = (e) => { /* ... */ };  // côté client
navigator.serviceWorker.controller.postMessage(
  { type: "GET_CACHE_NAME" },
  [channel.port2]                                 // transfer du port2 au SW
);
// SW reçoit event.ports[0] === port2, répond via postMessage
```

#### 71.4 Garde-fou

Si le SW ne répond pas en 2s (très rare — SW shut down par le navigateur, premier load avant activate, etc.), `_getCacheNameFromSW()` retourne null → la purge devient **totale** (ancien comportement). Pas de régression, juste le retour à la latence d'avant hotfix21.

#### 71.5 Gain attendu

| Étape | Avant | Après hotfix21 |
|---|---|---|
| Vérification SW | 30s-2min (await update) | < 100ms (fire-and-forget) |
| Purge caches | < 1s | < 1s (mais on garde le current) |
| Rechargement | 10-60s (re-download ~100 assets) | rapide (cache courant préservé, SW reprend ses assets) |

**Total user-perceived** : de l'ordre de **45s-180s → 3-10s** selon le réseau.

#### 71.6 À NE PAS faire

- ❌ Re-ajouter `await reg.update()` quelque part — ça réintroduit le blocage 30s+
- ❌ Hardcoder `CACHE_NAME` dans `interface.js` — il y a déjà 3 sources de vérité version/cache (cf. §69 KARMA contract), pas 4. Le postMessage est la source canonique pour le client.
- ❌ Supprimer le fallback `currentCacheName ? filter : all` — si le SW est down, on doit toujours pouvoir faire une mise à jour douce.
- ❌ Réduire le timeout 2s à 500ms — si le SW est en train de s'installer, il peut mettre 1-2s à répondre. Le timeout protège contre les SW totalement morts, pas contre les SW occupés.

---

---

### 79. i18n palier P0 — README EN + toggle 🇫🇷/🇬🇧 (v1.29.0 — 2026-05-30)

Premier palier d'internationalisation. Scope **strictement limité** à la modale Documentation —
le reste de l'app reste en français. Quand le système global arrivera (palier P1+), ce toggle
sera remplacé par un sélecteur global de langue.

Décisions design KARMA validées (workflow `wcg11rqll`) : `1:a 2:c 3:a 4:a 5:c` → toggle drapeaux,
détection auto navigator.language au 1er affichage avec persistance sticky, traduction agent,
scope strictement README, décision archi palier P1+ reportée.

#### 79.1 Architecture

3 helpers privés dans `js/interface.js` (juste avant `afficherReadme`) :

```js
const README_LANG_STORAGE_KEY = "myktamap_readme_lang";  // "fr" | "en"

function _getReadmeLang() {
  // 1. Lit localStorage
  // 2. Sinon : navigator.language.toLowerCase().startsWith("en") → "en" sinon "fr"
  // 3. Persiste la détection au 1er boot (stabilité aux relances)
}
function _setReadmeLang(lang) { /* valide + persiste */ }
function _readmePathForLang(lang) {
  return (lang === "en") ? "docs/README_USER.en.md" : "docs/README_USER.md";
}
```

`afficherReadme(opts)` appelle `_chargerReadme(_readmePathForLang(_getReadmeLang()), opts)`.

#### 79.2 Toggle UI dans le header modale

Bouton drapeau ajouté entre le titre "📖 Documentation" et le bouton 🎓 Tutoriel :

```html
<button class="kta-readme-lang-btn" id="kta-readme-lang-btn"
        data-target-lang="en" title="Read in English">🇬🇧</button>
```

**Convention UX** : le bouton **affiche le drapeau de la langue ALTERNATIVE** (= "clique pour
basculer vers ça"), pas la courante. Tooltip bilingue contextuel ("Read in English" / "Lire en
français").

Au clic : `_setReadmeLang(target)` + `modal.remove()` + `afficherReadme({overLocker, hideOnboarding})`
(préserve les opts via détection DOM courante — pas de re-passage de paramètres compliqué).

#### 79.3 Fichier `docs/README_USER.en.md`

Traduction du `docs/README_USER.md` (2888 lignes, ~200 KB) en EN. Résultat : **2633 lignes /
~161 KB** (ratio attendu — l'anglais est plus compact).

**Workflow de traduction** : 12 chunks parallèles de ~240 lignes via Workflow `wcg11rqll`.
Temps wall-time : 165 s. Consignes strictes au prompt agent :
- Préserve EXACTEMENT le markdown (headers, code blocks, tables, listes, liens, bold, italic)
- NE TRADUIT PAS : chemins fichiers, noms JS, modules MyKTAMap (KMZ, GPX, PWA, M-LVL, IDB),
  versions (v1.x.y), URLs, émojis, noms propres (KARMA, GRIMP, SSF)
- Terminologie cohérente : plan→map, tracé→path, équipe→team, Mode Secours→Rescue Mode,
  carrière→underground quarry, chambres d'exploitation→extraction chambers, etc.
- Tutoiement FR → "you" neutre EN
- Marqueurs `[REVIEW: ...]` pour les ambiguïtés (1 seul marqueur dans le résultat final)

**⚠️ Piège connu** : le chunk 12 du premier essai avait **halluciné** 2 sections inventées
(`## Self-hosted installation` + `## 🎉 You're ready!`) au lieu de traduire les 6 vraies sections
finales (Badge version, PIN, Reset, Troubleshooting, Topo, Remerciements). Fix : re-traduction
manuelle via Agent dédié avec prompt **ZÉRO-INVENTION** strict + lecture explicite du source.
Cf commit `691520d` pour le détail. Pour les futurs workflows de traduction par chunks :
ajouter validation post-traduction (nb de `^## ` source vs résultat).

#### 79.4 Service Worker

`docs/README_USER.en.md` ajouté à `ASSETS_TO_CACHE` (cohérent avec le `.md` français déjà servi
depuis v1.8.0). Aucun nouveau bypass cache nécessaire (cached SW, pas de bumper sur chaque
édition de doc).

#### 79.5 CSS dédié

`.kta-readme-lang-btn` — style miroir du bouton 🎓 Tutoriel (même dimensions 36×32, même border
radius 6px, même padding) avec **accent bleu** (vs ambre charte du 🎓) pour différencier
visuellement. Variants thème clair complets.

#### 79.6 À NE PAS faire

- ❌ **Bibliothèque externe i18n** (i18next, polyglot, ICU) — surface réseau + bundle inutiles.
  200 lignes maison suffisent.
- ❌ **Traduction temps réel** (Google Translate, DeepL API) — viole offline-first et
  `connect-src 'self'`.
- ❌ **Mélanger FR et EN** dans la même fenêtre d'aide — toggle global au header, jamais inline.
- ❌ **Forcer EN selon le navigateur sans override** — un utilisateur FR avec VPN US se sent piégé.
- ❌ **Toucher au reste de l'app pour P0** — scope strictement limité à la doc README.
- ❌ **Externaliser les strings du Mode Secours en cours de v1.29.x** — refactor i18n APRÈS les
  cycles fonctionnels stabilisés (C4 + C5 + C6).

#### 79.7 Roadmap palier P1+ (futur, non engagé)

- **P1** : extraction strings critiques (sidebar + headers + 3 vues Live Mode Secours,
  ~200 strings). Estimation 20-30h. Décision à confirmer avec KARMA selon retours terrain
  utilisateurs EN.
- **P2** : aide intégrée + tutoriel onboarding (~300 strings). 15-20h.
- **P3** : reste de l'UI (modales, formulaires, hints, toasts). 60-80h.
- **P4** : 2ᵉ langue (ES / IT / DE) selon demande terrain cataphilie internationale.

Pour quand on y arrivera : préférer `i18n/<lang>.json` racine **no-cache HTTP** (cohérent avec
`version.json` / `alert.json` / `Licence-pro.json`) avec helper unique
`window.MyKTAMapI18n = { t(key, params), getLang, setLang, onChange }` et pattern de migration
progressive `t(key, fallbackFR)` (= si la clé n'existe pas en EN, retombe sur le texte FR).

---

### 83. Animation reveal titre — « MyKTAMap → -pro » (v1.30.0 — 2026-06-02)

Animation de boot du titre dans le splash + l'écran d'accueil. Le mot **« MyKTAMap »** apparaît
progressivement (clip-path animation), puis une **micro-pause** avant que le suffixe **« -pro »**
ne se révèle (uniquement en mode pro). Inspiré de la signature KARMA — même easing
`cubic-bezier(0.45, 0.05, 0.55, 0.95)`.

#### 83.1 Pattern HTML

```html
<span class="kta-titre-base">MyKTAMap</span><span class="kta-licence-pro kta-titre-suffix-pro">-pro</span>
```

- `.kta-titre-base` : toujours animé (community ET pro)
- `.kta-titre-suffix-pro` : combine 2 classes — la bascule community/pro (`.kta-licence-pro`,
  cf §77.1) **ET** l'animation reveal du suffixe.

#### 83.2 CSS animations

```css
.kta-titre-base {
  display: inline-block;
  clip-path: inset(0 100% 0 0);
  animation: kta-titre-reveal 700ms cubic-bezier(0.45, 0.05, 0.55, 0.95) forwards;
}
@keyframes kta-titre-reveal {
  to { clip-path: inset(0 0 0 0); }
}

html.kta-instance-pro .kta-titre-suffix-pro {
  display: inline-block;          /* override de .kta-licence-pro { display: none } */
  clip-path: inset(0 100% 0 0);
  animation: kta-titre-reveal 500ms cubic-bezier(0.45, 0.05, 0.55, 0.95) forwards;
  animation-delay: 1300ms;        /* = 700ms (base) + ~600ms de pause */
}
```

**Décompositiontime** :
- 0 → 700ms : « MyKTAMap » se révèle de gauche à droite
- 700 → 1300ms : pause volontaire (~600ms) — le mot reste visible
- 1300 → 1800ms : « -pro » se révèle (pro uniquement)

#### 83.3 Pourquoi `clip-path` plutôt qu'`opacity` ou `width`

| Approche | Pourquoi NON |
|---|---|
| `opacity: 0 → 1` | Fade global, pas de sensation gauche-à-droite ; impression « apparition magique » au lieu de « tracé » |
| `width: 0 → auto` | Casse le baseline du texte pendant l'animation ; impossible si la largeur cible est `auto` |
| `transform: scaleX` | Anime la transformation visuelle mais distord les glyphes ; pas adapté à du texte |
| `clip-path: inset` | ✅ Tracé progressif sans toucher au layout, glyphes intacts, support universel (Chrome/Safari/Firefox modernes) |

#### 83.4 Bascule community/pro (lien §77 + §84)

Le suffixe `-pro` est **invisible côté community** grâce à `.kta-licence-pro { display: none }`
(cf §77.1 cascade CSS). Côté pro, la classe `html.kta-instance-pro` est posée par
`proLicense.js` au boot très tôt → l'override `display: inline-block` prend effet → l'animation
se déclenche.

⚠️ **Piège de spécificité** : à la v1.30.0 initiale, `.kta-titre-suffix-pro { display: inline-block }`
avait été écrit SANS scoping `html.kta-instance-pro` → spécificité égale à `.kta-licence-pro`,
« latest wins » en cascade → le `-pro` apparaissait côté community. Hotfix v1.30.1 (§84). À retenir :
**toujours scoper sous `html.kta-instance-pro` les overrides côté pro** quand on touche à un
élément frontière.

#### 83.5 À NE PAS faire

- ❌ Animer le splash en plus du titre — le boot doit rester rapide et lisible, surcharger
  d'animations rend l'app perçue comme lente
- ❌ Pousser le `animation-delay` au-delà de ~1500ms — la pause devient gênante pour les users
  qui attendent l'app fonctionnelle
- ❌ Réutiliser `.kta-titre-base` / `.kta-titre-suffix-pro` ailleurs que sur le titre — ce sont
  des classes très ciblées avec un easing spécifique signature
- ❌ Toucher au `cubic-bezier(0.45, 0.05, 0.55, 0.95)` sans validation KARMA — c'est la
  courbe « signature » identique à celle du splash KARMA (§51 perf-memory pour rappel)
- ❌ Ajouter `display: inline-block` à `.kta-titre-suffix-pro` sans scoping `html.kta-instance-pro`
  — bug de spécificité documenté §84

---

### 85. P3 — Découpe `interface.js` en 9 modules thématiques (v1.31.0 — 2026-06-03)

`js/interface.js` avait grossi à **9 894 lignes** au fil des releases v1.x → ingérable :
navigation difficile, modifs anxiogènes (risque de casser un côté en touchant l'autre),
revues de code longues. KARMA a déclenché un refactor **GROS** avec contrainte « zéro régression ».
Résultat : **9 modules cohérents** + interface.js qui retombe à **3 326 lignes** (**-66,4 %**).

KARMA quote :
> « on fait 'GROS' mais avec un plan bien établie, s'assure de aucune régréssion »

#### 85.1 Découpe en 9 lots thématiques

| Lot | Module | LOC | Sujet |
|---|---|---|---|
| 1 | `js/interfaceAlerts.js` | 367 | Modales alertes + Update douce |
| 2 | `js/interfaceDistanceTotale.js` | 330 | Panneau magenta distance cumulée |
| 3 | `js/interfaceLegende.js` | 492 | Modale Légende plein écran |
| 4 | `js/interfaceDocs.js` | 1 348 | README + Aide intégrée + Aide IA |
| 5 | `js/interfaceImportExport.js` | 732 | Export JSON + import multi-format |
| 6 | `js/interfaceItineraire.js` | 1 588 | Itinéraire + Évitements (Lots 6+8 fusionnés) |
| 7 | `js/interfaceMaintenance.js` | 716 | Calibrage + Reset + Mise à jour douce |
| 9 | `js/interfaceConfig.js` | 1 485 | Modale Réglages + Perf ULTRA + M-LVL + Géoref |

(Le « Lot 8 » d'origine — Évitements — a été fusionné dans le Lot 6 car la cohérence
fonctionnelle s'imposait : itinéraire et évitements partagent l'API `window.PathAvoidances`.)

#### 85.2 Pattern d'extraction

Chaque lot suit la même méthodo, du plus sûr au plus risqué :

1. **Identifier les frontières** dans `interface.js` : trouver les `// ============= SECTION X =============`
   ou les commentaires de section qui encadrent un bloc fonctionnellement cohérent
2. **Extraire** via `awk` ciblé sur les lignes du bloc → nouveau fichier `interfaceXxx.js`
3. **Wrapper en IIFE** + exposer les API publiques via `window.MyKTAMapXxx = { ... }` ou
   `window.fonctionPublique = ...` selon le pattern existant côté community (cohérent avec
   le style vanilla — pas d'`import/export`)
4. **Adapter les références directes** dans `interface.js` (et autres modules) : les appels
   directs `afficherConfig()`, `ouvrirImportSession()`, `_ouvrirCreationJonction()` →
   passer par `window.X` + `typeof` check pour gracieuse dégradation
5. **Vérifier syntaxe** : `node -c js/interfaceXxx.js` (= filet seul, pas de tests auto cf CLAUDE.md)
6. **Tester boot + smoke test** des fonctionnalités du lot dans l'app
7. **Bumper `sw.js > CACHE_NAME`** + ajouter `"./js/interfaceXxx.js"` dans `ASSETS_TO_CACHE`
8. **Ajouter `<script src="js/interfaceXxx.js" defer></script>`** dans `index.html` AVANT
   `js/interface.js` (les modules sont consommés par interface.js, donc chargés avant)
9. **Commit séparé par lot** → bisect facile si régression détectée plus tard

#### 85.3 Pièges rencontrés (lesson learned)

⚠️ **Références directes cross-module** : certaines fonctions extraites étaient appelées via
leur nom court (`afficherConfig()`, `ouvrirImportSession()`, `_ouvrirCreationJonction()`)
depuis d'autres parties d'interface.js. Après extraction, ces noms ne sont plus dans le scope
global → erreur `ReferenceError`. **Fix** : remplacer par `window.X()` + `if (typeof window.X
=== "function") window.X()`.

⚠️ **Linter qui modifie un fichier entre Read et Edit** : sur les fichiers volumineux,
le linter intermédiaire pouvait toucher le fichier juste après une Read mais avant le
Edit suivant → `File modified since read` côté outil. Solution : re-Read systématiquement
juste avant un Edit critique.

⚠️ **Artefact XML accidentel** : un `</parameter></invoke>` s'est retrouvé collé à la fin
de `interfaceDistanceTotale.js` à cause d'une mauvaise copie. Détecté tout de suite par le
hook `check-syntax.js` (cf §80.3) → fix immédiat par Edit. La leçon : **les hooks pre-commit
syntaxiques ont sauvé un commit pourri**.

#### 85.4 Résultats mesurés

| | Avant P3 (v1.30.1) | Après P3 (v1.31.0) | Δ |
|---|---|---|---|
| `interface.js` LOC | 9 894 | 3 326 | **-66,4 %** |
| Nb modules dans dossier `js/` | ~75 | ~84 | +9 |
| Temps de navigation moyen estimé | « cherchait pendant 30s » | « ouvre le bon fichier directement » | UX dev |
| Régressions détectées en test | — | **0** | ✅ |

#### 85.5 Impact sur l'ordre de chargement

`index.html` charge les modules dans l'ordre suivant (extrait) :

```html
<script src="js/interfaceAlerts.js" defer></script>
<script src="js/interfaceDistanceTotale.js" defer></script>
<script src="js/interfaceLegende.js" defer></script>
<script src="js/interfaceDocs.js" defer></script>
<script src="js/interfaceImportExport.js" defer></script>
<script src="js/interfaceItineraire.js" defer></script>
<script src="js/interfaceMaintenance.js" defer></script>
<script src="js/interfaceConfig.js" defer></script>
<script src="js/interface.js" defer></script>   <!-- ← le « chef d'orchestre » consomme les autres -->
```

L'attribut `defer` (cf §82 P6.B) garantit l'ordre d'exécution selon le DOM. interface.js peut
appeler les API exposées par les modules précédents.

#### 85.6 Pour ajouter une nouvelle modale / un nouveau panneau

Plutôt que d'ajouter du code à `interface.js` (qui doit rester maigre), créer un nouveau
module thématique :

1. Identifier le scope cohérent (ex: nouvelle modale « 📦 Backups » → `interfaceBackups.js`)
2. Créer `js/interfaceBackups.js` en IIFE avec `window.MyKTAMapInterfaceBackups = { ouvrir, fermer }`
3. Ajouter `<script src="js/interfaceBackups.js" defer></script>` AVANT `js/interface.js`
4. Ajouter `"./js/interfaceBackups.js"` dans `sw.js > ASSETS_TO_CACHE`
5. Depuis interface.js (ou ailleurs), appeler `window.MyKTAMapInterfaceBackups?.ouvrir()`
6. Bumper `CACHE_NAME` (cf §75.x) + `__MKM__.build` + `version.json`

#### 85.7 À NE PAS faire

- ❌ **Refusionner les modules** dans `interface.js` — annule le bénéfice du refactor + bloque
  les futures évolutions
- ❌ Créer des **dépendances cycliques** entre les modules `interface*.js` (ex: A appelle B
  qui appelle A) — si nécessaire, extraire la logique partagée dans un 3ᵉ module
- ❌ Oublier l'attribut **`defer`** sur les nouveaux scripts (cf §82) — casse l'ordering avec
  les autres scripts defer
- ❌ Oublier d'ajouter dans **`sw.js > ASSETS_TO_CACHE`** + bump `CACHE_NAME` — le module ne
  sera pas servi offline + les clients existants ne verront pas la mise à jour
- ❌ Réintroduire des **références directes cross-module** (sans `window.X`) — risque de
  `ReferenceError` au runtime si l'ordre de chargement change ou si un module est mocké
- ❌ **Mettre du logique data dans `interface*.js`** — ces modules sont strictement UI/présentation.
  La logique data (CRUD, IDB, etc.) reste dans `editor.js`, `secoursMode.js`, etc.

---

### 88. Audit UX C1 — Liste des pain points priorisée (2026-06-03)

Audit lecture seule des modules UI/UX du projet, équivalent UX du sweep perf P1-P10. Tour
des 70+ modules JS + audit CSS + heuristiques a11y + audit modales. Sortie : **liste P1-Pn
UX priorisée** par impact terrain × effort.

Méthodologie : `grep` ciblé sur signaux (z-index, `!important`, `confirm()`, `alert()`,
`prefers-reduced-motion`, `aria-*`, `focus-visible`, gestion `Escape`, etc.) + `git log`
sur les modules avec le plus de hotfix récents (= UX historiquement chaude).

#### 88.1 Tableau Sévère

| # | Sujet | Impact | Coût fix |
|---|---|---|---|
| **UX1** | **101 `alert()` + 29 `confirm()` natifs** dans le code → dialogues système moche/non-charte, surtout disruptifs sur mobile (varient par OS, blocants UI). Incohérence visuelle vs charte dark/ambre. | UX mobile dégradée, cohérence visuelle cassée à plusieurs endroits | 🟡 Moyen (incrémental, remplacer par toasts/modales charte) |
| **UX2** | **0 occurrence `prefers-reduced-motion`** dans `style.css` : animations forcées (splash KARMA animé, anim reveal titre v1.30.0, slide-in modales) même quand l'user a demandé reduced motion (mac / iOS / Android a11y). = anti-WCAG. | a11y user sensible (épilepsie, vertiges, autisme, vestibulaire) — public spéléo inclusif | 🟢 Petit (un `@media` wrapper qui disable les transforms) |
| **UX3** | **1 543 `!important` + 2 826 sélecteurs + z-index anarchique** (20 valeurs hors-scale CLAUDE.md). Cascades CSS combatives → bugs UX subtils au moindre changement HTML, friction maintenance massive (équivalent UX du `style.css` monolithique adressé par P2 perf). | Friction dev + bugs UX cascades récurrents (cf historique hotfix z-index sur modales superposées) | 🔴 Gros (refactor incrémental possible : par section CSS) |

#### 88.2 Tableau Modéré

| # | Sujet | Détail |
|---|---|---|
| **UX4** | **10 modules créent des modales sans gérer la touche `Escape`** : `batteryGuard.js`, `debug.js`, `editor.js`, `interfaceDistanceTotale.js`, `interfaceDocs.js`, `interfaceItineraire.js`, `interfaceLegende.js`, `interfaceMaintenance.js`, `legendCustomization.js`, `copyright.js` (toast devtools) | Friction clavier PC (l'user attend Escape pour fermer une modale rapidement). Moins critique mobile mais bug PC bien réel. |
| **UX5** | **`focus-visible` / `:focus` minoritaire** (50 occurrences sur 2 826 sélecteurs = **1,7 %**) | Friction a11y keyboard navigation — boutons custom souvent sans outline focus visible quand on tabule sur PC |
| **UX6** | **Toasts/notifications incohérents** : `OOMGuard.showToast` existe (113 usages globaux) mais coexiste avec `alert()` (101 cas) et certaines features ont leur propre feedback inline | UX fragmentation — l'user voit 3 styles différents de feedback selon le contexte. Cohérent avec UX1. |
| **UX7** | **`secoursMode.js` 8 834 LOC + `interface.js` 193 hotfix historiques** = modules très chauds | Long terme. Pourrait continuer la dynamique P3 perf (découpe `interface.js` → 9 modules) sur `secoursMode.js` aussi (= "P3 step 2"). |
| **UX8** | **`aria-*` limité** (53 occurrences globalement sur 70+ modules) | a11y lecteur d'écran — niche mais existe (cataphilie peut inclure usage en duo avec un autre user qui regarde) |

#### 88.3 Reporté pour usage différé

| # | Sujet |
|---|---|
| **UX9** | **z-index scale documentée dans `CLAUDE.md`** (1100 titre / 5000 loader / 9999 splash / 99999 modales / 100001 sous-modales) mais le code utilise aussi `1050`, `1099`, `1200`, `1250`, `2000`, `9000`, `100000`, `100002`, `100100`, `100200` = **hors-scale**. À aligner OU à étendre la doc selon l'usage réel. Sera traité naturellement si on attaque UX3. |

#### 88.4 Recommandations quick wins (priorité impact ÷ effort)

| Rang | Cible | Effort | Gain |
|---|---|---|---|
| 1 | **UX2** reduced-motion | 30 min | a11y inclusive immédiat, gros impact pour effort minimal |
| 2 | **UX1** triage alert/confirm : identifier les ~30 cas user-facing critiques (vs erreurs dev) → remplacer par toasts charte | 2-3 h | Cohérence visuelle nette, UX mobile largement améliorée |
| 3 | **UX4** Escape sur les 10 modules listés | 1-2 h | Friction clavier PC corrigée, faible risque |
| 4 | **UX5** focus-visible : 1 règle CSS générale `:focus-visible` sur `.kta-btn-*` + variants | 1 h | a11y keyboard + indication visible des éléments focus |

UX3 (CSS combative) = **gros chantier** équivalent UX du P2 perf — à envisager dans un
sweep dédié si KARMA veut, mais c'est l'équivalent UX du "refonte massive" qu'on évite
par défaut.

#### 88.5 Décisions prises au fil des releases

| Release | Pain points adressés | Statut |
|---|---|---|
| **v1.31.6** | UX2 reduced-motion (CSS), UX4 Escape (utils.js global handler avec whitelist), UX5 focus-visible (CSS ambre charte) | ✅ Done |
| Plus tard, à voir | UX1 alert/confirm cleanup, UX6 toasts unifiés, UX7 découpe secoursMode, UX3 CSS refactor (massif), UX8 aria-* enrichi | 📋 Reporté |

#### 88.6 Méthodologie de re-validation (futur)

Pour ne pas perdre l'audit, mettre à jour ce tableau à chaque release qui touche un UX.
Si une nouvelle pain point apparaît : ajouter ligne UX(n+1) dans la section appropriée
(Sévère / Modéré / Reporté). Si une pain point est traitée : marquer ✅ + release dans
§88.5.

Re-faire un audit complet (heuristiques + grep) tous les ~6 mois ou après une vague de
hotfix UX, pour détecter les nouveaux signaux émergents.

---

<!-- v1.34.16+ : sprint UI fixes connexes au Pack RAM -->
### 89. Sprint v1.34.5 → v1.34.16 — fixes UI connexes au Pack RAM

Sprint principalement orienté RAM (cf `perf-memory.md §88`), mais 3 fixes UI méritent une
trace ici.

#### 89.1 Persistance du filtre des calques image (v1.34.5 → v1.34.7)

**Symptôme** : décocher un calque image (légende, collision, etc.) puis changer de plan
ou recharger → le calque réapparaissait coché à tort. Régression difficile à reproduire,
identifiée et corrigée en 3 itérations.

**Cause racine (v1.34.7)** : dans `initDataFromConfig`, ligne ~39, le tableau
`_ktaImageOverlays` était re-initialisé à `[]` à chaque appel — y compris quand on
ré-applique la config au reload du même plan. Or `filterPanel.js > _renderImageLayersSection`
lisait l'état des calques DEPUIS ce tableau pour décider quelles checkbox cocher. Tableau
vide → tous cochés par défaut → choix utilisateur écrasé.

**Fix** : retrait du `_ktaImageOverlays = []` parasite dans `initDataFromConfig`. Le
tableau est désormais initialisé UNE FOIS au boot et réconcilié avec le filtre persisté
(via `SessionPersist.getFilterState`) à chaque rendu de la modale Filtres.

**Itérations** :
- v1.34.5 : tentative naïve qui ne ciblait pas la cause racine — invalidée.
- v1.34.6 : ajout de logs debug pour tracer la séquence d'init + fix annexe du bouton
  « 🔄 Tout afficher » qui ne recochait que les data layers (pas les image layers).
- v1.34.7 : VRAI fix, retrait des logs debug, plus de régression observée.

#### 89.2 Bouton « 🔄 Tout afficher » modale Filtres (v1.34.6)

Le bouton de la modale Filtres recochait toutes les **data layers** mais oubliait les
**image layers** — incohérent depuis l'introduction du filtre image en v1.21.5.

**Fix** : ajout de la boucle sur `_ktaImageOverlays` dans le handler du bouton, après
celle sur `_dataLayers`. Les 2 catégories sont désormais cochées d'un coup.

#### 89.3 Retrait définitif du banner debug « Refonte UI v1 » (v1.34.14)

Banner de migration `❗ Refonte UI v1` posé en v1.9.1-refonte-8 pour avertir l'user des
changements, devenu invisible visuellement après le sprint v1.9.2-polish mais resté
**dans le DOM** jusqu'à v1.34.13. Retiré définitivement en v1.34.14 (élément + CSS + JS
qui le toggle). 0 régression observée car déjà inerte UX.

> 💡 **Leçon pour le prochain banner de migration** : prévoir dès la pose le ticket
> de retrait dans une release ultérieure, pas laisser traîner.

---

**Bon code ! 🚀**
