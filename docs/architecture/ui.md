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
- ~~⚙️ Réglages map mode → `#kta-cfg-legacy-cb`~~ — n'existe plus (vérifié v1.92.0 : aucune occurrence dans le repo) ; le choix d'interface se fait au HOME seulement.

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

Réglage **par plan** : ⚙️ Réglages (mode carte) → groupe « 🎨 Affichage » (`#cfg_show_intersections` →
`setPlanShowsIntersections`, clé `myktamap_plan_prefs_<planId>.showRoadIntersections`, cascade plan → global →
défaut). Plus de réglage global ni de bouton sur l'accueil. Calcul sauté au-delà de `_roadIntersectionMaxRoads()`
(500 tracés, 50 en ULTRA).

> 🎛️ **v1.46.3 — Refonte ergo des modales config (HOME + PLAN)** : sections réorganisées par **groupes thématiques** (en-têtes `config.group.*` via `I18n.t`/`data-i18n`, **même ordre dans les 2 modales**) : 🌍 Application · 📐 Plan (échelle/Nord/géoréf **regroupés**) · 📍 Navigation · 🎨 Affichage · 🚀 Performance · 🔒 Confidentialité · 🛠️ Système. **Déplacement de blocs uniquement** (tous les `id`/handlers préservés : PLAN `cfg_*`, HOME `loader*`). Échelle (m/px) extraite de « Détection des pas » → groupe calibration (proximité géoréf, demande KARMA). Doublons en-tête/section retirés (Affichage, Mode Perf ULTRA). M-LVL (`_renderMultiLevelSection`) toujours dormant. Fusion tri-langue : `scripts/merge-i18n-frags3.js`.

#### ⚙️ Modale Réglages (mode carte) — état v1.92.0 (L4, audit ergonomie)

`js/interfaceConfig.js > afficherConfig()`. **Huit groupes**, chacun rendu par `_cfgGroupeDebut(cle, portee)` … `_cfgGroupeFin()` (`.kta-cfg-group` > titre `.kta-cfg-group-titre` cliquable avec badge de portée `.kta-cfg-scope-plan` / `-global` > `.kta-cfg-group-corps`) ; repli mémorisé dans `localStorage.myktamap_cfg_groupes_v1`, replié par défaut sur écran étroit sauf le premier groupe.

| # | Groupe (clé) | Portée | Contenu |
|---|---|---|---|
| 1 | 🌍 `config.group.application` | 🌍 tous | 🎬 mode présentation · **🏠 Réglés depuis l'accueil** (lecture seule : langue, thème, icônes au zoom, panneaux ancrés, magnétisme, **carnet des sorties** ; bouton → `_retourLoaderAvecConfirm`) |
| 2 | 📐 `config.group.planCalib` | 📍 ce plan | bandeau cohérence · échelle (`setPlanScale`) · Nord (`setPlanNorthOffset`) · **lanceur 🌐 Géoref** (`#cfg_georef_open`, état `#cfg_georef_etat`) → sous-modale `#kta-cfg-georef-modal` (enfant de `#kta-cfg-modal`, rendue par `_renderCfgGeorefSection`, handlers `_bindCfgGeorefHandlers` posés à l'ouverture) |
| 3 | 📍 `config.group.navTracker` | 📍 ce plan | départ X/Y (+ pickers) · podomètre ×3 · nav intelligente ×3 |
| 4 | 🎨 `config.group.affichage` | 📍/🌍 mixte (badge « selon la ligne », chaque ligne dit la sienne) | ronds (ce plan) · wake lock · vocal (tous plans) |
| 5 | 🚀 `config.group.perf` | 📍 ce plan | toggles ULTRA + `tousNiveaux` (multi-niveau seulement, hors ULTRA) |
| 6 | 🧩 `config.group.optionnels` | 🌍 tous | **Fonctionnalités optionnelles**, toutes OFF par défaut : replay · heatmap · batterie · vibration (même état que le groupe du même nom à l'accueil ; clés `APP_CONFIG.*Enabled`, lues en `=== true`) |
| 7 | 🔒 `config.group.privacy` | 🌍 tous | incognito (le **carnet** s'est déplacé à l'accueil en v1.92.0 : `#loaderJournalCb`, câblé par `homeConfig.js`) |
| 8 | 🛠️ `config.group.system` | 📍 ce plan (lecture seule) | preset perf en lecture seule |

**Application immédiate** (`_bindReglagesImmediats`) : les 9 champs jadis lus par « Appliquer » (`cfg_scale`, `cfg_startX/Y`, `cfg_stepLength/Threshold/Cooldown`, `cfg_smartNav`, `cfg_smartNavRadius/Heading`) persistent au `change` via `setPlanScale` / `setPlanTracking` / `setPlanSmartNav`. Validation par `_cfgValider(id, brut)` (table `_CFG_BORNES`, exposée `window._ktaCfgValider`, **exécutée** par `scripts/check-reglages-immediats.js`) : hors bornes = rouge + toast, rien d'écrit. Départ X/Y : debounce 600 ms puis `resetTrackingPosition()` seulement si la paire a changé (`_cfgFlushDepart` à la fermeture). Les pickers et le calibrage d'échelle (`interfaceMaintenance.js`) émettent `change` sur le champ. `appliquerConfig` et `_validerReglagesTracking` **n'existent plus**.

**Fermeture** : `_cfgFermer()` (croix, bouton `#kta-cfg-fermer`, clic hors modale, Échap via `_cfgInstallerFermeture`). Échap ignore la modale masquée par un picker, ferme d'abord la sous-modale géoref, et laisse la main à une autre `.kta-readme-modal-overlay` posée par-dessus (Niveaux, Jonction, calibrage).

**Reset** (`_resetConfigExecuter`) : **ce plan seulement** — `resetPlanNorthOffset`, suppression de `myktamap_plan_prefs_<pid>`, valeurs du plan-config (bornes podomètre respectées, repli `DEFAULT_CONFIG`), `appliquerSmartNavPerPlan` (repli global), `resetTrackingPosition`. Plus aucun `sauvegarderPrefsUtilisateur()` ici : les globaux ne bougent pas.

**Q61** : wake lock et vocal non supportés → `ktaCapteurRefuse(row, cb, hint, "config.capteurs.nonSupporte")` (4ᵉ paramètre = clé de raison), comme les capteurs.

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
- **Modale Config home** : `.kta-loader-config-boite`, `.kta-loader-config-corps`, `.kta-perf-*`, `.kta-net-paranoia-toggle` (case à cocher générique de la Configuration, nom historique)
- **Modale Audit** : `#loaderNetDocModal`, `#loaderNetLogModal`, `#loaderNetLogTbody`, `#loaderNetDocWhitelist`
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
| 9 | `js/interfaceConfig.js` | ~2 350 | Modale Réglages (8 groupes, application immédiate, sous-modale Géoref) + Perf ULTRA + niveaux |

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

<!-- v1.34.19+ : Mode Histoire (note libre + PDF embarqué/importé) -->
### 90. Sprint v1.34.19 → v1.34.23 — Mode Histoire (note libre + PDF)

Sprint 5 releases qui introduit un nouvel onglet UX per-plan : **📖 Mode Histoire**.
Module dédié `js/modeHistoire.js`, bouton 📖 dans la status bar (à gauche de 🔋), modale
2 onglets per-plan. Patterns clés à connaître pour toute évolution.

#### 90.1 Structure modale 2 onglets per-plan (v1.34.19)

- **Onglet 1 — 📝 Note libre** : `<textarea>` persistée `localStorage` clé
  `myktamap_note_libre_<planId>`. Auto-save **debounce 500 ms** sur `input`. Une note
  par plan, restorée à l'ouverture de la modale. Pas de quota géré explicitement (LS
  global est plafonné par navigateur, sufficient pour du texte libre).
- **Onglet 2 — 📚 Histoire** : 2 sources possibles, priorité absolue à l'embarqué :
  1. **PDF embarqué** via champ `plan-config.json > plan.histoirePdf: "data/histoire.pdf"`.
     Whitelist 2-pass `index.html extraireZip` + résolution dans
     `js/config.js cloneAndResolvePlanConfig` + `js/main.js startImportedPlan
     allLogicalPaths` pour le re-zip / réimport. **Toolbar import cachée** si embarqué
     présent (le plan-author force le contenu).
  2. **PDF importé en session** via file picker `accept="application/pdf,.pdf"` +
     check MIME, stocké dans store IDB **`myktamap_histoire_pdfs`** (1 PDF max par
     plan, replaceable / removable). Survit aux reloads (IDB persistant). Boutons
     **🔄 Remplacer** / **🗑️ Retirer** avec confirmation `window.confirm` minimaliste.

> ⚠️ **Pattern d'append modale** : `document.documentElement.appendChild(overlay)`
> (cohérence avec `filterPanel.js` + `secoursMode.js`). NE PAS append à `document.body`
> (le bouton 📖 est dans la status bar qui peut elle-même être détachée selon contexte).
> Conséquence directe sur le CSS theme clair — cf §90.4.

#### 90.2 Affichage PDF — iframe + fallback iOS (v1.34.19, v1.34.22)

- **Desktop / Android** : `<iframe src="blob:..." class="kta-histoire-pdf-wrap">`
  natif. Fonctionne out-of-the-box, plein-écran via le viewer PDF du navigateur.
- **iOS (Safari + PWA)** : iframe PDF est notoirement peu fiable (page blanche
  silencieuse selon iOS version). Détection `/iPhone|iPad|iPod/i.test(navigator.userAgent)`
  → fallback bouton **📥 Ouvrir le PDF** (= `<a href="blob:..." target="_blank"
  download="...">`) qui sort le PDF dans un nouvel onglet / Files.app.
- **Bouton ↗️ Ouvrir dans un onglet** (v1.34.22) : ajouté en sticky position absolute
  top-right sur le wrap PDF même desktop, double bénéfice — fallback si CSP nginx pas
  encore redéployée + UX plein écran natif pour les longs PDF.

#### 90.3 CSP `frame-src 'self' blob:` — action manuelle KARMA (v1.34.22)

**Symptôme** : iframe PDF affichait page blanche en prod (mais OK en dev). Cause
racine : le header CSP de nginx prod incluait `default-src 'self'` mais **pas** de
directive `frame-src` explicite → `default-src` fallback qui bloque `blob:` URLs dans
les iframes (Chrome / Safari / Firefox conformes spec depuis 2022).

**Fix** : ajout `frame-src 'self' blob:;` dans `docs/nginx-csp-config.conf`.
**Action manuelle KARMA** : redéployer le `.conf` sur le serveur prod + `nginx -s reload`.
Le bouton sticky ↗️ §90.2 reste utile comme fallback **en attendant** le redéploiement
et comme UX bonus permanente.

> 🪤 **À NE PAS faire** : ajouter `data:` dans `frame-src` aussi — risque XSS via
> data-URLs dans une iframe. Seul `blob:` est nécessaire (l'app crée des
> `URL.createObjectURL(pdfBlob)` côté JS, jamais de `data:application/pdf;base64,...`).

#### 90.4 Theme clair — sélecteur CSS dual `body, html` (v1.34.21 → v1.34.23)

**Symptôme v1.34.21** : passage en theme clair → fond de la modale Mode Histoire reste
sombre (onglets, textarea, pdf-wrap, placeholder, toolbar). v1.34.21 utilisait des
overrides `body.kta-theme-light .kta-histoire-*` qui **ne matchaient pas** car la
modale est appendée à `document.documentElement` (= sibling de body), pas dans body.

**Fix racine (v1.34.23)** : sélecteur dual obligatoire pour TOUT élément hors-body :

```css
body.kta-theme-light .kta-histoire-tab,
html.kta-theme-light .kta-histoire-tab { background: #fff; color: #1a1f2e; }
```

`js/themeManager.js` pose la classe `kta-theme-light` sur **les deux** (`<html>`
ligne ~99 ET `<body>` ligne ~103) précisément pour cette raison. Le double sélecteur
exploite les deux ancrages. **Pattern identique à `sessionExporter.js`** (modale
appendée hors-body également).

> 🪤 **À NE PAS faire** : append la modale à `document.body` pour « simplifier » le
> CSS. Le pattern `documentElement.appendChild` est intentionnel (z-index propre +
> isolation contre les fixes de positioning du body). Mieux vaut écrire le sélecteur
> dual.

#### 90.5 Hook plan switch — `_libererRessourcesPlanPrecedent` (v1.34.19, leçon Pack RAM Phase 4)

Au changement de plan :
- Le `URL.createObjectURL(pdfBlob)` actif est `URL.revokeObjectURL()` pour éviter la
  rétention bitmap (cf §88 perf-memory.md leçon WebKit bitmap pinning).
- L'iframe `src` est clear (`iframe.src = ""`) avant `removeChild` (même raison).
- La textarea + le textContent du `_pdfBlob` courant sont nullifiés.
- Le store IDB `myktamap_histoire_pdfs` **n'est PAS** purgé — les PDFs importés
  doivent survivre aux plan-switch et reload (= attente explicite user).

Pattern d'enregistrement : `window.ModeHistoire.cleanupOnPlanSwitch(planId)` est
appelé depuis le helper de cleanup générique. NE PAS hooker via un event listener
custom — la séquence d'appel est sensible (avant clear de `_lazyZipRef`, après
fermeture des modales actives).

> 💡 **Leçon générale (déjà vue en Pack RAM Phase 4)** : tout module qui crée des
> `URL.createObjectURL()` côté plan-courant doit s'enregistrer dans le helper de
> cleanup générique avec un nom auto-documenté (`_revokeAllPhotoObjectUrls`,
> `cleanupOnPlanSwitch`, etc.) ET être grep-able cross-fichier pour vérifier que la
> fonction existe (cf bug latent 13 versions §88).

### 91. Éditeur de données du plan — refonte 3 sources + édition note tracés/zones (v1.48.0)

Refonte de `js/tableEditor.js` (ex-« Éditeur de tableau JSON » → **« Éditeur de données du plan »**). Ouvert via **sidebar carte** ⬇️ → 📊 **ET le home** (`index.html` `loaderTableEditorBtn`, à côté du Générateur) → `window.ouvrirTableEditor`. Au home, `PLAN_CONFIG` est `null` (reset `config.js > resetRuntimeAssets`) → `planDispo` faux → la carte « Plan en cours » est **masquée** (pas seulement grisée), donc 2 sources seulement (ZIP + JSON).

#### 91.1 Écran d'accueil — 3 sources (`_afficherAccueil`)

| Source | Fonction | Lecture |
|---|---|---|
| 🗺️ **Plan en cours** | `_listerDatalayersPlanCourant()` | `fetch(PLAN_CONFIG.dataLayers[].file)` — l'URL est **déjà résolue** (blob: pour ZIP, chemin serveur sinon) par `config.js > getRuntimeAssetUrl` (cf `main.js` boot `ajouterPointsDepuisJSON`). **Zéro impact live** : on relit le JSON, on ne touche pas la carte. Grisé si aucun plan chargé. |
| 📦 **Importer un ZIP** | `_traiterZipImporte(file)` | `JSZip.loadAsync` → lit `plan-config.json` → relit chaque `dataLayers[].file` du zip (fallback regex basename). `JSZip` est global. |
| 📄 **Importer un JSON** | `_afficherImport()` (drop existant) | un seul fichier ; bouton « ← Retour » revient à l'accueil. |

`_collecterEntreesEditables(obj, baseLabel, fileName, entries)` détecte dans un objet les tableaux éditables **non vides** (`data`, `editorPoints`, `roads`, `zones`, `structures`) → 1 entrée par tableau, en gardant l'objet source COMPLET. Si une source en a plusieurs → **sélecteur** (`_afficherSelecteurCalque`) listant chaque tableau + son compte ; sinon chargement direct (`_chargerEntree`).

#### 91.2 Tableau — points vs géométrie

`_kind` ∈ {`data`, `editorPoints`, `roads`, `zones`, `structures`}. Helpers `_estPoints()` / `_estSession()`.
- **Points** (`data`/`editorPoints`) : édition complète (inchangé) + boutons « Ajouter ligne » / « Voir carte ».
- **Tracés / zones / structures** : `description`(= **la note**, cf `road.js:939`/`zones.js:377`/`structures.js:592`), `type`, `level` éditables ; colonne **`points` (géométrie) en lecture seule** (rendu « N points », classe `col-readonly`, bandeau `tabledit.geom.lecture`). `level` ajouté aux colonnes numériques. Boutons add/preview masqués (géométrie non créable au tableau).

#### 91.3 Sauvegarde — règle « no live » datalayers (`_menuSauvegarde`)

- **Datalayers** (`data`/`roads`/`zones`/`structures`) → **export-only** (`📥 Télécharger`) + note `tabledit.save.datalayerNote` (« réimporte dans le Générateur »). Le live-load `Remplacer le calque actif` (ancien `_remplacerCalque`/`_calqueCorrespondant`) est **supprimé**.
- **Session** (`editorPoints`) → `📥 Télécharger` **ou** `✏️ Remplacer la session` live (`setEditorPoints`).
- `_construireObjetSortie()` = **clone profond** de `_sourceObj` (`JSON.parse(JSON.stringify)`) avec uniquement `obj[_kind] = _data` remplacé → **aucune perte** des autres tableaux/champs (type, version, measure, `customLegend`, autres calques d'un même fichier). Nom de téléchargement = `_sourceMeta.fileName`.

i18n : 23 clés `tabledit.*` ajoutées (accueil / source / selecteur / kind / err / col / geom / save.datalayerNote) fr/en/es. **Aucune nouvelle surface réseau** (lecture locale des calques, identique au boot).

---

### 92. Menu Tracker — refonte flyout → modal plein écran de tuiles (v1.50.0)

KARMA : « refondre le menu déroulé de tracker par un modal full screen plus ergonomique et mobile ». Le groupe 🧭 Tracker passe du **flyout latéral** à un **modal plein écran de grosses tuiles** — mêmes options, présentation plus tactile.

**Mécanisme** (`interface.js`) :
- Nouvelle branche **`useModal`** dans `_creerGroupeAccordeon` (sœur de `useFlyout`) : le clic sur `btnPrincipal` appelle `_toggleTrackerModal(id)`. Le groupe tracker passe `useFlyout:true` → `useModal:true`. `sousActionsConfig` reste stocké (comme pour le flyout) → réutilisé tel quel.
- `_ouvrirTrackerModal(groupId)` lit `_groupes[groupId].sousActionsConfig` (**zéro duplication**) et rend chaque sous-action en **tuile** (`_creerTuileTracker`) : `dynamicIcon()` (▶️/⏹️) + `isActive()` (→ `kta-actif`) **relus à l'ouverture**, exactement comme le flyout.
- **Tap d'une tuile** = `_fermerTrackerModal()` PUIS `sub.onClick(tile)` — **même pattern « bouton détaché » que le flyout** (`_ouvrirFlyout` ferme avant d'exécuter, l.~1343). Conséquence assumée : le modal couvrant la carte/footer, **toute** action ferme le modal (recalage a besoin du clic carte, boussole/badge verrou sont sous le modal). L'état se reflète à la **réouverture**.
- **Tuiles optionnelles** : une sous-action portant `optionnel: "<clé APP_CONFIG>"` (Replay `replayEnabled`, Heatmap `heatmapEnabled`) est filtrée **à chaque ouverture** si la clé n'est pas `=== true` → la case de ⚙️ agit sans recharger. Seule la tuile disparaît : `heatmap.js` reste chargé, le Mode Secours garde son bloc heatmap.
- **Sections** (`_ajouterSectionTracker`) : champ `section` (`"suivi"`/`"outils"`) ajouté aux sous-actions ; **Urgence** auto-détectée via `cssClass === "kta-sous-action-urgence"` (fond rouge réutilisé). Tuile seule en fin de grille (compte impair) → `kta-tracker-modal-tile-wide` (pleine largeur). Fallback robustesse : sous-action sans section ni urgence → rangée en « outils ».
- **Bande de statut** : `window.getTrackingActif()` (source de vérité moteur `tracking.js`, `tracking === true`) — ⚠️ **PAS** `isTracking`, qui est `let` **local à `initInterface()`** donc hors de portée des fonctions module-scope du modal (piège initial → « Suivi inactif » permanent ; même piège que `refonteInterface` cf `tracking.js:995`). + `getTrackingDistanceM` + `getStepCount`. Fermeture ✕ / clic-fond / Échap.

**CSS** (`css/style.css`) : `.kta-tracker-modal-*` (overlay z-99999, box gradient charte, grille 2 colonnes, tuiles tactiles) + override `body.kta-theme-light` + `safe-area-inset-bottom`. **Icônes 20px / tuile min-h 62px** → les 11 options + 3 titres de section tiennent **sans scroll même sur iPhone SE** (~570px < 92vh) ; `overflow-y:auto` du corps reste en filet de sécurité.

i18n : 6 clés `tracker.modal.*` (sections + statut + « pas ») fr/en/es. **Scope** : seul le groupe Tracker est en modal (les autres gardent le flyout). Aucune nouvelle surface réseau.

---

### 93. Raccourcis clavier + navigation clavier + refonte du menu Aide (v1.51.0)

KARMA : « pas de raccourci clavier pour Tracés », « avec TAB et Entrée pouvoir choisir le mode », « refondre le modal Aide en sous-modales depuis un modal principal qui liste les sections ». 3 lots dans une même release.

#### 93.1 Lot A — Raccourcis + cheatsheet (`shortcuts.js`, `shortcutsCheatsheet.js`)
- **Raccourci Tracés manquant ajouté** : `MAPPING.p = { action: "group:traces", label: … }` (`shortcuts.js`). Mapping complet : E/M/Z/S/T/**P**/L/B/R.
- **Cheatsheet `?`** : nouveau module `js/shortcutsCheatsheet.js` → `window.ShortcutsCheatsheet = { ouvrir, fermer, toggle, isOpen }`. Modale `.kta-readme-modal-overlay` réutilisée + grille `.kta-cheat-*` / keycaps `.kta-kbd`. Les lignes "outils" sont **auto-générées** depuis `KtaShortcuts.listMapping()` (zéro liste à maintenir) ; libellés localisés via `cheatsheet.tool.*` (fr/en/es). Bloc fixe des combos (Ctrl+Z/Y, Ctrl+K, F, ?, Échap). La touche `?` est gérée dans le keydown de `shortcuts.js` **AVANT** le guard `e.shiftKey` (car `?` = Shift+… sur AZERTY ; `e.key === "?"` est layout-agnostique).
- **Fix** : `_isModaleBloquante()` (`shortcuts.js`) couvre désormais `.kta-tracker-modal-overlay` → les raccourcis ne se déclenchent plus « derrière » le modal Tracker.

#### 93.2 Lot B — Navigation clavier dans les menus (`interface.js > _installFocusNav`)
- Helper partagé `_installFocusNav(container, opts)` branché sur **`_ouvrirFlyout`** (flyout latéral, partagé traces/zones/structures/édition/mesure/favoris) **ET** `_ouvrirTrackerModal` (modal Tracker).
- À l'ouverture : **focus auto** la 1ʳᵉ action (`opts.firstSelector`, pas la croix). **TAB** cycle (piège de focus, dernier→premier + `Shift+Tab` inverse), **↑↓←→** déplacent, **Entrée/Espace** = activation native du `<button>`, **Échap** ferme si `opts.handleEscape` (flyout) sinon géré ailleurs (le modal Tracker garde son handler document-level). Le listener vit/meurt avec le conteneur (retiré du DOM à la fermeture → pas de cleanup explicite).

#### 93.3 Le hub d'Aide (`interfaceDocs.js`) — état actuel
- **Contenu dans les dicos** : `aide.sec.<slug>.titre` / `.html` (HTML voulu, classes `kta-aide-*` du CSS), `aide.sec.<slug>.raccourci` (facultatif), `aide.cat.<cle>`, `aide.ui.*`, `aide.intro`. Une fiche = une **référence rapide** d'une fonction, qui renvoie au 📖 guide pour le détail — pas un second guide.
- **`AIDE_SECTIONS`** : ordre canonique des slugs (un slug ne se renomme jamais). **`AIDE_CATEGORIES`** : `{cle, slugs}`, 8 catégories alignées sur les chapitres du guide — Prise en main · Urgence · Carte et recherche · Se repérer et itinéraire · Annoter · Mes données et partage · Réglages et dépannage · Pour aller plus loin (désactivé par défaut, Mode Secours, créateurs de plans). Filet « Autres » pour une fiche non rangée.
- **Hub** : intro, recherche (titre + corps, accents tolérés), ligne épinglée ⌨️ Raccourcis → `ShortcutsCheatsheet.ouvrir()`, lignes par catégorie. Un clic ouvre la **sous-modale** `.kta-aide-submodal` (z-index 100001) : ← Retour, ✕, clic-fond, Échap.
- **❓ contextuel** : `AIDE_PAR_MODALE` (id de modale → slug), bouton posé par un `MutationObserver` dans l'en-tête `.kta-readme-modal-header` / `.kta-tracker-modal-header`, juste avant la croix ; interrupteur `myktamap_aide_contextuelle`. `ktaOuvrirAideSection(slug)` ouvre une fiche sans passer par le hub.
- 🛡️ `check-aide-sections.js` (chaque slug a ses clés dans les 3 dicos, chaque slug rangé une fois, aucune clé `aide.*` orpheline, pas de balisage dans un titre) · `check-aide-contextuelle.js` (chaque id de la table existe dans le code, chaque slug est une fiche).

**Sources** v1.51.0 ; `shortcutsCheatsheet.js` ajouté à `index.html` (après `shortcuts.js`) + `sw.js > ASSETS_TO_CACHE`. i18n : 20 clés `cheatsheet.*`. Aucune nouvelle surface réseau (1 fichier same-origin).

---

### 94. Rangs de profil / gamification (v1.52.0)

KARMA : « ajouter au profil une donnée PRO mais FUN — un rang (Novice/Confirmé/Expert…) selon temps passé / nb plans / km de galerie, avec un anneau autour de la photo différent par rang ». Feature **community / offline**.

**Module pur** `js/profileGamification.js` → `window.ProfileGamification = { RANKS, computeRank, getScore, getProgress, nom, label }`. Aucun DOM / localStorage / réseau : prend `{plans, hours, km}`, renvoie rang / score / progression.
- **6 rangs** (`RANKS`, ascendant) : `touriste` / `novice` / `confirme` / `expert` / `maitre` / `grandmaitre`, chacun `{emoji, ring (couleur), plans, hours, km}`.
- **Seuils STATIQUES** (choix KARMA, pas de score qui pilote le badge) : `computeRank` renvoie le **palier le plus haut dont les 3 seuils sont tous remplis** (logique **AND « maillon faible »**). Seuils monotones croissants sur les 3 axes → la boucle s'arrête au 1er palier non atteint.
- **Score** (`getScore` = `plans + heures + km`) **décoratif**, n'entre PAS dans le rang. `getProgress` = `{current, next, missing, pct}` (pct = ratio min sur les 3 seuils du palier suivant).

**Plumbing (inline `index.html`)** — réutilise les compteurs EXISTANTS, zéro nouvelle collecte :
- `_collectGamifMetrics()` : ⏱️ `myktamap_total_time_ms` (+ delta session) · 🗺️ plans ouverts (`PlanRegistry.getAll()` filtré sur `lastOpened`) · 📏 km = somme des `distM` (galeries cartographiées) du cache `myktamap_plan_stats_v1_<id>` par plan.
- `_appliquerRangAvatar(wrapEl)` : pose `data-kta-rank` (→ couleur d'anneau CSS) + `title`, renvoie le rang. Appelé sur le wrap home ET le gros avatar de la modale.
- `_hydrateProfileRank()` : remplit `#kta-profile-details-rank` (puce de rang + 3 métriques + barre de progression + score).
- Bandeau home : **nom du rang sous le pseudo** (`#kta-loader-profile-rank`) + **médaille en coin** (`#kta-loader-profile-badge`, dans un `.kta-loader-profile-avatar-holder` `position:relative` car le wrap est `overflow:hidden` → sinon rognée ; cachée pour Touriste = pas d'emoji).

**CSS** : couleurs par rang via `[data-kta-rank]` (variables `--kta-rank-ring/-fg/-bg`) ; anneau = `box-shadow` outset (conserve le shadow de profondeur) + glow pour Expert/Maître/Grand Maître ; `.kta-profile-rank-*` (puce, métriques, barre) + `.kta-loader-profile-badge` + thème clair.

**Persistance** : `myktamap_total_time_ms` ajouté à `PREF_KEYS` (`profileExportImport.js`) → le temps survit à l'export/import profil (plans = registre exporté ; km = régénéré en rouvrant les plans). i18n : 10 clés `rank.*` fr/en/es. **Sources** v1.52.0 ; `profileGamification.js` dans `index.html` (après `userProfile.js`) + `sw.js`. Aucune nouvelle surface réseau (1 fichier same-origin).

---

### 95. Hauts faits / succès + stats bandeau score/feats (v1.53.0)

KARMA : « rajouter plein de hauts faits (X plans géoréf, X plans, X km, X structures, X zones…) » puis « ajouter Score et Nombre de hauts faits aux stats du bandeau (cap mobile inchangé) ». Gamification v2, community / offline.

**Module pur** `js/profileAchievements.js` → `window.ProfileAchievements = { FAMILIES, TIER_ICONS, total, list, unlockedIds, byId, nom, label }`.
- **8 familles × 4 paliers = 32** succès. Paliers `TIER_ICONS = ["🥉","🥈","🥇","👑"]` (couronne = IV, choix KARMA). Chaque famille `{id, emoji, metric, unit, seuils:[4]}` ; id de succès = `<family>.t<i>`.
- `list(metrics)` renvoie les 32 succès enrichis (`unlocked`, `pct`, `seuilLabel`…) ; `unlockedIds` = ceux dont `métrique ≥ seuil`. Métriques : `plans · plansGeoref · km · hours · pois · roads · zones · structures`.

**Plumbing inline `index.html`** :
- `_collectGamifMetrics` **étendu** : `plansGeoref` = nb de clés `myktamap_kmz_calib_<id>` ; `pois/roads/zones/structures` = somme du cache `myktamap_plan_stats_v1_<id>` (⚠️ champ **`structs`** côté cache).
- `_evalAchievements()` : compare `unlockedIds` au stocké `myktamap_achievements_v1` (`{id: dateISO}`) → nouveaux = **toast** `OOMGuard.showToast`. **`firstRun`** (clé absente) = accord rétroactif **silencieux** (pas de spam au 1er calcul). Appelé au refresh du bandeau + à l'ouverture de la modale profil.
- `_hydrateProfileFeats()` : grille dans `#kta-profile-details-feats` — en-tête `N/total` + 1 rangée par famille (emoji + nom + valeur courante + 4 médailles, allumées si débloquées / `grayscale+opacity` sinon, seuil en `title`).

**🎨 Bandeau d'accueil** : 2 entrées ajoutées au pool `PROFILE_BAR_STATS` — `score` (⭐, `ProfileGamification.getScore`) et `feats` (🏆, `unlockedIds().length + "/" + total`). Rendu déjà pool-driven (`_hydrateProfileBarStats` + 2 branches) + 2 checkboxes. **Cap `PROFILE_BAR_STATS_MAX = 3` INCHANGÉ** (5 stats au choix, 3 max affichées).

**Persistance** : `myktamap_achievements_v1` ajouté à `PREF_KEYS` (export profil). CSS `.kta-profile-details-feats` / `.kta-feat-*` (médailles `grayscale` verrouillées) + thème clair. i18n : 10 clés `feat.*` + 4 clés stats (`home.profile.statScore`/`statFeats` + tooltips) fr/en/es. **Sources** v1.53.0 ; `profileAchievements.js` dans `index.html` (après `profileGamification.js`) + `sw.js`. Aucune nouvelle surface réseau (1 fichier same-origin).

#### 95.1 Hauts faits « spéciaux » one-shot (v1.54.0)

Ajout d'un 2ᵉ groupe à `profileAchievements.js` : `SPECIALS` (6 succès uniques, `group:"special"`, **total 32 → 38**). Chaque entrée `{id, emoji, check(metrics, ctx)}` — débloqué si `check` vrai. `list()` calcule d'abord les 32 tiered, compte `tieredUnlocked`, puis évalue les spéciaux avec `ctx = {tieredUnlocked}` (pour **Complétiste** = méta « tout le tiered débloqué »). Les 5 autres : 🎨 Touche-à-tout (pois&roads&zones&structures ≥1) · 💯 Centurion (score≥100) · 🦇 Taupe (`hasTracked`) · 🧭 Spéléo multi-niveaux (`maxLevels≥2`) · 🌃 Marathon (`maxTrackerH≥4`).

`_collectGamifMetrics` **étendu** (`index.html`) : `hasTracked` / `maxLevels` / `maxTrackerH` dérivés d'un **scan de `myktamap_session_v1_<id>`** par plan (présence + span temporel de `trackerTimeline`, distinct des `level` des éléments de session) + `score` (`ProfileGamification.getScore`). **Zéro wiring d'événement** — tout dérivé du localStorage existant (lecture seule). `_hydrateProfileFeats` ajoute la section **« 🎉 Spéciaux »** (chips `.kta-feat-sp` allumées/grisées) sous les 8 familles ; toast au déblocage inchangé. i18n `feat.specials` + `feat.sp.*` fr/en/es. **Sources** v1.54.0, **aucun nouveau fichier**, aucune nouvelle surface réseau.

> 🥚 **Easter egg (v1.54.0)** : un 7ᵉ rang **secret `legende`** (👑, or ambre `#e0a51a`, seuils `Infinity` ; le Grand Maître prend la ⚜️ fleur de lys) est ajouté à `RANKS` dans `profileGamification.js`. `computeRank` renvoie ce rang **uniquement** si `_isKarma()` (pseudo profil = « karma », trim + lowercase) ; sinon plafonné à Grand Maître (les seuils `Infinity` le rendent inatteignable par les métriques). `getProgress` traite « legende » comme non-`next` (Grand Maître reste « max atteint »). **`rankByMetrics(metrics)`** exposé = rang d'après les métriques seules (sans egg) → la fiche profil affiche le rang mérité sous le message max (« Sans l'easter egg : <mini-puce> »). Anneau **or ambre pulsant** (`@keyframes kta-legende-glow` / `-big`, désactivé en `prefers-reduced-motion`). **Volontairement non documenté** côté user (README_USER / notes de version) — surprise.

---

**Bon code ! 🚀**

---

## 📱 HOME mobile (v1.68.0 — lot A)

> Étude KARMA « interface plus dédiée mobile ». TOUT est scopé `@media (max-width: 640px)` — desktop strictement inchangé.

- **CSS** (`style.css`, bloc « HOME MOBILE ») : hero Reprendre, dropzone compacte, accordéon Outils (`.loader-secondary-actions` masqué sauf `.kta-open`), liste bornée (`#allPlansList.kta-collapsed > .plan-row:nth-of-type(n+6)`), cibles 44 px, header une-ligne (chips 36 px, `.loader-titre-tagline{display:none}`, wrap+ellipse en filet).
- **JS** (`homeLoader.js`) : `_ktaMobileCollapsePlans()` — rappelée à CHAQUE `refreshPlansList`, idempotente, masquage par classe CSS (les listeners des lignes cachées restent branchés) ; accordéon injecté une fois au boot (`#kta-home-tools-toggle`).
- ⚠️ Pièges : ① le lockup titre fait ~186 px à 375 px À CAUSE de la tagline — toute nouvelle chip dans `.loader-header-actions` doit re-vérifier le bilan largeur (327 px dispo) ; ② `.loader-header-actions` a `flex-shrink:0` en base — ne jamais y compter pour absorber un dépassement ; ③ ne pas re-render la liste au dépliage (masquage CSS uniquement).

## 📱 Plein écran iPhone — 2 tentatives, 2 rollbacks : NE PAS RETENTER À L'AVEUGLE

- **v1.9.2** : cover + black-translucent → « bande sombre en bas, status bar hide/show » → rollback.
- **v1.71.0 (30/07/2026)** : mêmes metas, MAIS avec 86 `env(safe-area-inset-*)` déjà en place (header refonte `calc(44px+env)`, statusbar, photo viewer, sidebar, leaflet-top) + compléments HOME/OSM/`html{background}`. Constat terrain KARMA immédiat : **« ça marche pas »** → rollback complet (metas + bloc CSS de compléments).

**Leçon** : l'hypothèse « la plomberie safe-area suffit, il ne manquait que les metas » est réfutée. Une 3e tentative exige d'abord un **diagnostic observé sur l'appareil** : quel écran, quelle zone, bande noire ou contenu masqué, portrait/paysage, et si iOS a bien ré-lu les metas (elles ne sont relues qu'à la **ré-installation** de la PWA sur l'écran d'accueil — un simple relaunch ne suffit pas ; si le test a été fait sans ré-installer, le diagnostic est invalide, à re-vérifier AVANT tout nouveau code).

Les 86 `env()` existants restent en place (no-ops barre opaque, utiles à Safari onglet / Android).

## 🧹 Allègement du HOME (v1.69.0 — demande KARMA « moins d'icônes »)

3 icônes retirées de l'accueil, **aucune fonctionnalité supprimée** — chacune a rejoint l'endroit où on la cherche naturellement :

| Avant (bouton d'accueil) | Après |
|---|---|
| 🌐 Recherche multi-plans | **Barre de recherche** `#loaderSearchBar`, entre « ▶️ Reprendre » et la liste des plans |
| 🔗 Fusionner des datalayers | **4e source de l'Éditeur de données** (`tableEditor.js > #kta-tbl-src-fusion`) |
| 📔 Mon carnet (isolé au-dessus des outils) | Dans la **liste des outils** `.loader-secondary-actions` |

Liste d'outils : **5 → 4** entrées (Carnet · Éditeur de données · Mes liaisons · Générer un plan).

> ⚠️ **OBSOLÈTE depuis HOME v2 (même jour)** — conservé comme historique : la barre a fini dans le HEADER, cf. § HOME v2 ci-dessous.

**⚠️ Placement — piège vécu (bug KARMA 29/07, capture)** : la barre vit dans `.kta-loader-top-row`, après `#resumeBox`. Ce wrapper est **`display: contents` sur mobile** (empilement naturel profil → Reprendre → recherche) mais une **GRILLE `2fr 3fr 2fr` sur PC** (alignée sur `.loader-grid` du dessous, v1.40.49). Ajoutée sans placement explicite, elle est partie en **ligne 2** de la grille → barre orpheline sous le profil, énorme vide à droite ; mobile ne montrait rien.

**Sur PC** (itéré 3 fois avec KARMA — état final) : le top-row garde le **même `grid-template-columns` que la grille du dessous** (« Reprendre » reste donc aligné sur la colonne « Ajouter un plan », décision v1.40.49), mais on **arrête de faire correspondre le profil à la colonne « Mes plans »** : après l'élargissement de la Vue OSM, la col 1 ne fait plus que 322 px et le bandeau profil y était étranglé.

- **profil** : `grid-column: 1 / span 2` + `justify-self: start` + **plafond de largeur** par palier (320 / 420 / 460 / 560 / 640 px) ;
- **barre de recherche** : **même bande** `1 / span 2` + `margin-left` = *plafond du profil + gouttière du palier* → sa **zone** va du bord du profil au bord droit de la colonne « Vue OSM » du dessous. Dans cette zone, le champ est **centré** (`justify-content: center` + `flex: 0 1 560px` sur l'input) : largeur confort plafonnée à ~610 px (champ + bouton), trous symétriques de part et d'autre, rétrécit si la zone est plus courte. (Étapes intermédiaires abandonnées : `justify-self: end` + plafond → trou de 258 px d'un seul côté ; étirement bord à bord → champ démesuré et déporté à droite.)
- Largeur de la zone par palier : **297 / 484 / 440 / 594 / 670 px**.
- ⚠️ **Invariant** : `margin-left` de la barre **=** `max-width` du profil **+** `gap` du palier. Modifier un plafond de profil sans recaler le `margin-left` recrée un trou (ou fait déborder la barre hors de la colonne OSM).
- **`text-align: center`** sur `#resumeBtn` en PC : la règle de base est `text-align: left`, donc le libellé « ▶️ Reprendre <plan> » restait collé à gauche d'un bouton pleine largeur (mobile inchangé — le hero pleine largeur reste à gauche, lisible au pouce). `#resumeBox` garde la col 3. La barre est centrée verticalement (`align-items: center`) entre deux blocs pleine hauteur — un champ de saisie de 78 px de haut se lirait comme un bug.

⚠️ **`grid-row: 1` est OBLIGATOIRE sur les 3 enfants** (2e bug d'alignement du 29/07) : `#resumeBox` (col 3) est placé **avant** la barre dans le DOM — pour garder l'ordre mobile profil → Reprendre → recherche —, l'auto-placement avance donc le curseur au-delà de la col 3, et un item suivant en `grid-column: 2` **sans ligne explicite tombe en ligne 2** (cellule vide en haut, barre décalée dessous). Colonne explicite ≠ ligne explicite. Si la bibliothèque est vide, la barre est masquée et le profil **reprend les 2 colonnes** (`:not(:has(#loaderSearchBar[style*="flex"]))` — `:has()` non supporté = règle ignorée, le profil reste en col 1, dégradation acceptable).

⚠️ **Ne jamais ajouter d'enfant à `.kta-loader-top-row` sans lui donner une `grid-column` explicite ET vérifier le rendu ≥ 1024 px.**

**Barre de recherche** — la recherche ne part **qu'à la validation** (Entrée ou bouton 🔎), jamais à la frappe : le scan lit les points de chaque plan (session + datalayers, fetch/ZIP), une modale qui s'ouvre sous les doigts serait hostile. La saisie est transmise à `CrossPlanSearch.ouvrir(q)` puis **vidée** (la modale la porte). La barre est masquée quand la bibliothèque est vide (`refreshPlansList`, même règle que `#myPlansBox`).

**i18n** : nouveau support générique **`data-i18n-placeholder`** dans `main.js > _applyI18nDom` (à côté de `data-i18n`, `-html`, `-title`). Sans lui, le placeholder aurait dû être posé à la main en JS, hors du cycle de re-traduction au changement de langue. Les libellés `home.add.crossSearch` et `home.add.fusion` sont retirés des 3 dicos (⚠️ `sessionExporter` réutilisait `home.add.fusion` comme titre de modale en mode solo → repointé sur `tabledit.source.fusion`).

**Mobile** : le carnet étant désormais dans `.loader-secondary-actions`, il est replié dans l'accordéon 🧰 Outils ≤ 640 px (comportement voulu). La barre de recherche, elle, reste toujours visible — c'est un geste fréquent.

## 🌍 Vue OSM plus grande sur grand écran — **OBSOLÈTE depuis HOME v2** (système de paliers supprimé, cf. § HOME v2)

### (historique) 🌍 Vue OSM plus grande sur grand écran (v1.69.0 — demande KARMA)

« Réduire la largeur de la liste de plans et de la colonne de droite pour afficher l'OSM en plus grand, **PC uniquement** ». Le gain est **progressif** : la carte récupère de la place à la fois sur les colonnes latérales **et** sur les gouttières (56 px puis 72 px, c'était du luxe).

| Palier | `grid-template-columns` | gap | Plans / OSM / Actions (largeur réelle) |
|---|---|---|---|
| 1024–1279 | `2fr 3fr 2fr` *(inchangé)* | 24 px | 247 / 370 / 247 (à 1024) |
| 1280–1439 | `1.8fr 3.6fr 1.8fr` | 24 px | 302 / 603 / 302 (à 1366) |
| 1440–1599 | idem | 56 px | 300 / 600 / 300 |
| 1600–1919 | `1.6fr 4.2fr 1.6fr` | 40 px | 318 / 835 / 318 (à 1680) |
| ≥ 1920 | `1.5fr 4.6fr 1.5fr` | 48 px | 322 / **988** / 322 |

À 1920 px la carte passe de **679 → 988 px** (+45 %). Hauteur mini de la carte relevée en parallèle : 280 → 340 → 420 → **500 px**.

**Le palier 1024 est volontairement INTACT** : sur un petit portable, rétrécir les colonnes latérales aurait rendu la liste de plans illisible **et fait perdre de la largeur à la carte** (les gouttières mangent proportionnellement tout l'espace récupéré).

⚠️ **Deux invariants** :
1. `.loader-grid` et `.kta-loader-top-row` doivent **toujours** partager `grid-template-columns` **ET** `gap` — c'est ce qui aligne profil / recherche / Reprendre sur plans / OSM / actions. Un écart préexistant a été corrigé au passage (`.loader-grid` passait à 56 px dès 1440 px alors que le top-row restait à 24 px ; invisible parce que `#resumeBox` était centré par `max-width: 900px; margin: auto`).
2. Sans opt-in OSM, la colonne du milieu est masquée et la grille repasse à 2 colonnes (`.kta-no-osm`) : la règle `grid-template-columns: 3fr 2fr !important` est réaffirmée au-delà de 1280 px, sinon on déclarerait 3 colonnes pour 2 enfants → colonne fantôme.


## 🏠 HOME v2 — refonte graphique (v1.69.0, décisions KARMA 1:a 2:b 3:a)

> Maquette validée (`scratchpad/mockup_home_v2.html`). **Aucune fonction retirée, aucun ID changé** — seuls les wrappers, le CSS et 1 injection JS ont bougé. Remplace : la grille jumelle top-row, le système de paliers OSM, l'accordéon Outils mobile.

**Les 4 causes racines corrigées** (elles avaient produit 4 bugs d'alignement en 1 journée) :

| Cause | Avant | v2 |
|---|---|---|
| Tout en ratios `fr` | `2fr 3fr 2fr` + 3 paliers de correction | **Rails logiques** : `fit-content(420px) minmax(0,1fr) 300px` — la colonne plans s'élargit jusqu'au plus long titre (plafond 420 px, puis wrap 2 lignes via `-webkit-line-clamp` sur `.plan-row-name-text`), l'OSM absorbe tout le reste, zéro palier |
| Grille jumelle à synchroniser | `.kta-loader-top-row` clonait colonnes+gap de `.loader-grid` | Top-row = **flex space-between** (profil · Reprendre), plus rien à synchroniser |
| La recherche sans place naturelle | 3 itérations de `margin-left` | **Dans le header**, pilule centrée `min(560px,100%)` entre logo et chips (pattern app bar). Mobile : header en wrap, barre en 2e ligne pleine largeur |
| Bande du haut sans hiérarchie | profil/Reprendre/recherche mélangés | header = navigation · bande = identité + action n°1 · corps = contenu |

**Habillage** : chaque `.loader-col` est une **card** (fond `rgba(22,27,43,.72)`, bordure `rgba(140,180,255,.12)`, rayon 12, pas 16 px) + variante thème clair. Section heads unifiés. `min-height` OSM : `clamp(300px, 52vh, 660px)`.

**Outils** : grille **2×2** (`.loader-secondary-actions`), tuiles 58 px centrées, Carnet garde son liseré doré. **L'accordéon mobile du lot A est SUPPRIMÉ** (JS d'injection retiré de `homeLoader.js`, CSS `display:none` ≤ 640 px retiré — l'oublier aurait rendu les outils invisibles sur mobile). Clé i18n `home.mobile.tools` supprimée, `home.tools.title` ajoutée (titre de section statique).

**`.kta-no-osm`** (pas d'opt-in OSM) : `minmax(0,1fr) 300px` — la liste des plans devient la zone fluide.

### 🩸 La hauteur de la colonne Actions est un budget, pas un acquis (v1.88.1)

`.loader-grid` porte `min-height: 520px`, calibré en v1.79.0 sur le **min-content mesuré** des colonnes incompressibles — *« Actions compactée ~510 px, OSM ~315 px »*. **C'est une constante mesurée à la main : toute ligne ajoutée à la colonne Actions la périme en silence.**

C'est exactement ce qui s'est produit : le bloc de tuilage, posé **déplié** dans la carte de chargement en v1.86.0, ajoutait **~207 px**. *(Ce bloc a été replié en v1.88.1 puis **retiré** en v1.90.2 — mais le cas reste le meilleur exemple du piège, et le filet `overflow-y` qui en est sorti protège la PROCHAINE addition, pas celle-là.)* À 125 % de zoom (viewport 1229×691, sous les 820 px de la media query de compaction — qui ne le compactait pas) la colonne débordait **sur le footer**. Le bug « des % qui cassent le home », clos en v1.60.x, revenait.

Deux réponses, et la seconde compte plus que la première :
1. le bloc est **replié par défaut** (`<details>`), ~40 px au lieu de ~207, la valeur courante restant lisible dans le résumé ;
2. 🛡️ **la colonne Actions scrolle désormais en interne** (`min-height: 0` + `overflow-y: auto` sur `#panelZip`, sous la media query de compaction), comme le fait déjà la colonne des plans. **Le prochain ajout ne pourra plus déborder** — on cesse de dépendre d'une constante recalibrée à la main à chaque fois.

⚠️ *Le bouton « Charger ce plan » reste collé en bas du contenu (`margin-top: auto`) : il est donc atteignable au scroll, pas perdu.* → **Insuffisant, cf. ci-dessous : « atteignable au scroll » sans indice visuel = perdu pour l'utilisateur.**

### 📐 Ce n'était ni la largeur ni le zoom (15/09/2026)

KARMA : *« on a encore un souci de zoom, si je dézoome ça rentre bien. Ça fait plusieurs fois qu'on bosse sans résoudre ce problème. »* Audit par agent, mesures Playwright sur 13 configurations (1000 → 2400 px CSS, zooms 80 → 125 %, émulés comme Chrome le fait : viewport ÷ zoom + `deviceScaleFactor` = zoom) :

- **La colonne Actions fait 300 px PARTOUT** (rail fixe v1.69.0), la grille Outils 270, chaque tuile 131 — identique à tout zoom. Le zoom ne change que la **hauteur** disponible.
- **Horizontal** : cinq outils dans deux colonnes = un **orphelin arithmétique**, seul à droite d'une cellule vide, son libellé (« Importer plusieurs plans », 148 px pour 117 utiles) sur deux lignes.
- **Vertical** : le portable 1080p à 125 % Windows (1536×800) était à **zéro de marge** ; la liste des formats (+71 px, 14/09) puis la 3ᵉ rangée d'Outils (+57 px, 15/09) ont fait passer « Charger ce plan » — le bouton **primaire** — dans le scroll interne du filet v1.88.1, **sans aucun indice visuel** (126 px cachés, mesurés). La grille Outils vit HORS de `#panelZip` : incompressible, elle pousse le filet.
- **Onze passes en quatre mois** (chronologie dans le journal v1.94.0) avaient chacune posé **une constante à un endroit différent** — 300, 58→44, 520, 820, `.loader-tools-head` sur trois couches — sans jamais écrire l'invariant.

**L'invariant, maintenant écrit et vérifié** (`scripts/check-home-layout.js`, pré-commit, 9 sabotages rougissent) :
1. **Le dernier d'une liste impaire d'outils prend toute la largeur** (`:nth-child(odd):last-child { grid-column: 1 / -1 }`) ; les tuiles portent `min-width: 0` + `overflow-wrap` pour qu'un libellé se replie au lieu d'élargir sa cellule. La grille **reste à deux colonnes fixes partout** — c'est ce qui rend la règle de l'orphelin juste ; `repeat(auto-fit, …)` la casserait dès qu'une tablette offrirait trois colonnes (l'agent proposait `auto-fit`, écarté pour cette raison).
2. **« Charger ce plan » est épinglé en bas du scroller** (`position: sticky; bottom: 0` dans le média `(max-height: 820px)`, fond dégradé assorti à la carte, variante thème clair). Il ne peut plus disparaître ; inerte quand rien ne scrolle.
3. **Ce qui se comprime est décoratif** : sous 821 px de haut, la liste des formats acceptés se retire de la zone de dépôt (elle reste dans l'aide « Charger / importer »), et les tuiles Outils passent à 36 px (cible souris).
4. 🩸 **Aucune nouvelle largeur en px** (`width`/`min-width`/`max-width`/`flex-basis`) sur `.loader-col-actions` ni `.loader-secondary-actions` — le rail de la grille est le seul fixe. C'est LA règle qui empêche le retour du bug.

Le checkup de release `scripts/smoke/checkup-home-scroll.js` mesure désormais, **avant tout scroll**, que le bouton primaire est dans la partie visible de `#panelZip` et qu'à ≥ 800 px de haut rien n'y est caché — sur 8 configurations dont 1536×800 et son zoom 125 %. Rejoué sur le CSS d'avant : **primaire caché sur les 8**, 126 px à 1536×800. Il aurait dit OK la veille : il ne regardait que le scroll de la page.

Résultat mesuré après : 0 px caché et primaire visible sur toutes les configurations ; 📦 sur une ligne pleine largeur de 400 px (mobile) à 2400 px.

---

**À NE PAS faire** :
- ❌ Réintroduire des ratios `fr` ou des paliers de correction sur `.loader-grid` — les rails fixes sont LE fix.
- ❌ Ajouter un bloc **déplié** dans la colonne Actions sans mesurer ce qu'il coûte — rejouer `checkup-home-scroll.js` (il mesure le primaire et les pixels cachés).
- ❌ Poser une **largeur en px** sur `.loader-col-actions` ou `.loader-secondary-actions` — chaque passe précédente a « réglé » le HOME ainsi, et chacune a périmé la suivante. `check-home-layout.js` refuse.
- ❌ Passer la grille Outils en `auto-fit` — la règle de l'orphelin n'est juste que pour deux colonnes.
- ❌ Redonner une grille à `.kta-loader-top-row`.
- ❌ Sortir la recherche du header pour la remettre dans une colonne.

---

## 🛡️ Modale ouverte en mode map → coupure des modes outils (v1.73.1)

**Problème** : un mode clic-carte armé (mesure, édition de points, recalage, tracé, zone, structure) + une modale par-dessus = état incohérent — le mode survit derrière la modale, les clics carte partent dans l'outil à la fermeture, le bouton reste surligné sans effet.

**Implémentation** — `js/interface.js > _initCoupeModesSurModale()` (IIFE, ~l.784) :
- **Détection CENTRALE** plutôt qu'un hook sur chacune des ~140 ouvertures de modale : `MutationObserver` `childList` **SANS `subtree`** sur `document.documentElement` **et** `document.body` — les 2 seuls points d'attache des overlays du projet. Sans subtree = **zéro coût** sur le churn DOM de Leaflet.
- Match par classe : `RX_OVERLAY` = `kta-readme-modal-overlay` | `kta-secours-overlay`.
- Coupure = **`_desactiverTousLesModes()`** (les 6 modes y sont tous enregistrés avec leur désactivation propre). Le **TRACKER n'est pas un mode exclusif** (il tourne en fond) → jamais coupé, comme demandé.
- Ceinture : sortie immédiate si aucun mode actif, et si `window.ktaPlanAffiche()` est faux (au HOME les modes n'existent pas).
- **Helper public** `window.ktaCouperModesOutils()` pour les cas particuliers futurs (couper depuis un flux qui n'ouvre pas d'overlay).

**2 exclusions raisonnées** :
| Exclu | Pourquoi |
|---|---|
| `#kta-poi-modal` (liste `IDS_EXCLUS`) | Formulaire ouvert PAR le clic-carte du mode édition — couper casserait l'enchaînement « poser plusieurs points d'affilée ». |
| Confirmations `.kta-modal-overlay` (ex. ❌ Effacer mesure) | Hors filet **par classe** (autre classe que `kta-readme-modal-overlay`) — rien à exclure explicitement. |

⚠️ **Piège** : toute nouvelle modale qui reprend la classe `kta-readme-modal-overlay` **coupera** les modes outils. Si c'est une modale de flux d'outil, l'ajouter à `IDS_EXCLUS` (elle doit alors porter un `id`).

---

### 96. Flyout de sidebar : borné au viewport VISIBLE, pas au viewport de mise en page (v1.82.0)

Sur mobile, le panneau 🏛️ **Structures** descendait sous le bord de l'écran :
« Fermer la structure en cours » et tout ce qui le suit restaient inatteignables.
Signalé par KARMA sur un plan importé, dont la liste s'allonge d'un type par
niveau — mais le défaut est général à tous les flyouts assez chargés.

🩸 **`window.innerHeight` n'est pas ce que l'utilisateur voit.** Il mesure le
viewport de **mise en page**, qui inclut la bande occupée par la barre d'URL du
navigateur (iOS Safari notamment, où il correspond au *large viewport*, barre
masquée). `_positionnerFlyout` en tirait un `max-height`, donc un panneau plus
haut que l'écran réel.

**Et le scroll interne n'y changeait rien** — c'est ce qui rend le symptôme
déroutant. Le contenu défile jusqu'au **bas du panneau**, or ce bas est hors
champ : les derniers boutons ne peuvent être atteints par aucun geste.

**Correction** — `window.visualViewport` :

| Grandeur | Avant | Après |
|---|---|---|
| Hauteur / largeur | `window.innerHeight` / `innerWidth` | `visualViewport.height` / `.width` |
| Origine | implicite `0,0` | `+ visualViewport.offsetTop` / `.offsetLeft` |
| Encoche / barre d'accueil | ignorées | `env(safe-area-inset-*)` retranchés |

`offsetTop` dit de combien la zone visible est décalée dans le viewport de mise
en page : c'est ce décalage qu'un élément `position: fixed` doit rattraper, ses
coordonnées étant elles-mêmes exprimées dans le viewport de mise en page.

Les insets sont lus par une **sonde CSS jetable** (un `div` `position: fixed`
portant `top: env(safe-area-inset-top)`, dont on lit le style calculé) : c'est la
seule façon d'obtenir un `env()` en JS. Cache invalidé sur changement de
`innerWidth`, donc à la rotation.

⚠️ **La barre d'URL mobile va et vient sans émettre de `resize`** — seul
`visualViewport` le signale. Ses événements `resize` et `scroll` sont donc
écoutés en plus des listeners existants, et **retirés dans `_fermerFlyout`** avec
les autres.

---

### 97. Légende : la SESSION se superpose au PLAN — et `updateCustomEntry` l'ignorait (v1.82.0)

`LegendCustomization` tient **deux** niveaux d'état :

| | Source | Éditable |
|---|---|---|
| `_planState` | `PLAN_CONFIG.plan.customLegend` (le ZIP du plan) | non — le plan n'est modifiable que dans le Générateur |
| `_sessionState` | `SessionPersist` | oui |

La règle de résolution est constante et vaut partout : **à id égal, la session
gagne**. `listCustomEntries` et `findCustomEntry` l'appliquent tous les deux.

🩸 **`updateCustomEntry` ne cherchait que dans la session** et sortait sur un
`return false` muet. Or les entrées d'un plan **importé** vivent dans
`_planState` — celles que l'import SIG fabrique par niveau y sont toutes.
L'éditeur les **listait** (les deux niveaux sont émis) mais **aucune
modification ne prenait**. Signalé par KARMA sur « +1 (historique) » : « ça ne
fait rien, même sur le plan en cours ».

Le renommage **et les trois couleurs** (`lineColor`, `fillColor`,
`borderColor`) passent par cette fonction : les quatre étaient mortes sur une
entrée de plan.

**`removeCustomEntry` avait déjà rencontré le problème** et l'avait traité en
v1.77.0 (pierre tombale `removedPlan`, après un autre retour KARMA sur une
entrée « Bas » insupprimable). Le mécanisme était donc là, et dit — la
symétrique est simplement restée en plan.

**Correction** : l'entrée du plan est **promue en session**, patch appliqué.
Copie et non mutation — `_planState` vient de `PLAN_CONFIG`. Elle passe alors en
source `"session"`, ce qui est exact : l'utilisateur l'a reprise. `resetSession`
rend l'originale du plan.

**Prouvé par falsification** : 12 cas ajoutés à `check-api-surface.js`, dont
**7 tombent** quand on remet le `return false` (les 5 autres sont des témoins —
listage, absence de doublon, `resetSession`, id inconnu).
