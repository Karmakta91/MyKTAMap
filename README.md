# MyKTAMap
> Application web de cartographie terrain — visualisation, annotation et déplacement simulé sur plan image.

**Environnements :**
- 🟢 Production : [myktamap.is-underground.fr](https://myktamap.is-underground.fr)
- 🔧 Développement : [devmap.is-underground.fr](https://devmap.is-underground.fr)

> ⚠️ Les données présentes sur le site de démonstration sont fictives.

---

## 📋 Journal des modifications

### 03/05/2026
- **Icône PWA pour écran d'accueil iOS** — ajout des balises `<link rel="apple-touch-icon">` dans `index.html` (4 tailles + fallback)
- **Modale d'ajout de point en plein écran** (style cohérent avec les autres modales)
- **Création de tags à la volée** depuis le formulaire d'ajout — le tag est ajouté dynamiquement à `PLAN_CONFIG.icons` avec l'icône par défaut
- **Option "Aucun tag"** disponible — utilise l'icône `default` (pin Leaflet natif si pas configuré)
- **Légende refondue** — fusion des sections custom + tracker + default dans une seule rubrique "📌 Autres", URL réelle de chaque icône résolue depuis `_iconMap`
- **Suppression granulaire** :
  - Mesure : *Dernier point* ou *Toute la mesure*
  - Points : *Dernier point ajouté* ou *Tous les points*
  - Tracés : *Dernier point du tracé* / *Dernier tracé entier* / *Tous les tracés*
- Nouveau helper `_choixSuppression()` dans `interface.js` — modale avec liste d'options
- Nouvelles fonctions API : `removeLastEditorPoint`, `removeLastRoad`, `removeLastRoadPoint`, `removeLastMeasurePoint`
- `creerIcones()` sécurisé : aucune icône avec `iconUrl: undefined`, fallback `L.Icon.Default` natif Leaflet si `default` manquant dans la config

### 02/05/2026
- **Service Worker réactivé** — mode hors-ligne fonctionnel via `sw.js`
- Onglet **"Modifier existant"** dans le générateur 📦 — importe un ZIP, pré-remplit le formulaire, régénère un ZIP modifié
- **Gestionnaire d'icônes & tags dynamique** dans le générateur — création de tags personnalisés avec icônes custom
- Le mode ajout de point ✏️ utilise maintenant la liste de tags **dynamique** depuis `PLAN_CONFIG.icons`
- `choisirIcone()` et `getIconForPoint()` (export PNG) refactorisés pour parcourir dynamiquement `_iconMap` — supporte tous les tags personnalisés
- Suppression du mode "Fichiers séparés" du loader — **ZIP uniquement**
- Correction icône véhicule à l'export (était étirée 50×25 → maintenant 50×50 comme l'affichage)

### 30/04/2026
- Correction collision : ratio scale plan/canvas pour les cartes de collision downscalées
- Mode performance : limite `MAX_WORK_DIM` à 8192px (limite Safari iOS sur `drawImage` JPEG)
- Détection canvas noir avec re-essai (Safari iOS échec silencieux sur gros JPEG)
- Blob URL fraîches créées à l'intérieur de `_imageVersCanvasReduit` (évite révocation prématurée)
- Mode performance affiché en lecture seule dans ⚙️ (modifiable au chargement uniquement)

### 27/04/2026
- **Refonte architecture complète** — fusion `index.html` + `import.html` en une seule page PWA
- Suppression de `import.html`, `config_import.js`, `map_import.js`, `main_import.js`
- `config.js`, `map.js`, `main.js` unifiés : gèrent les deux modes (serveur + import navigateur)
- Auto-détection au démarrage : charge `data/plan-config.json` si disponible, sinon affiche le loader
- Ajout du mode performance (tiling) pour les plans JPEG volumineux sur Safari iOS
- `tiling.js` — module de découpage en tuiles via `<img>` HTML + canvas
- Préférences utilisateur (`perfMode`, `motionDebug`) persistées séparément du plan dans `app_user_prefs`
- Panneau de logs de débogage intégré (🐛 dans ⚙️) avec persistance `localStorage`
- Optimisation collision : cache pixel en mémoire (`initCollisionCache`)
- Chargement des markers par batch de 50 via `requestAnimationFrame`
- Routes embarquées dans les calques de données (`roads[]` dans le JSON data)
- Métadonnées PWA ajoutées (`apple-mobile-web-app-capable`)
- `debug.js` — capture silencieuse des logs

### 26/04/2026
- Documentation utilisateur séparée du README DEV (`README_USER.md`)
- Aide, Légende, Réglages en modales plein écran
- Ajout du convertisseur JSON bidirectionnel (`editor ↔ data`)
- Ajout du générateur de plan ZIP (`createConf.js`)
- Refonte graphique de l'interface (charte dark cohérente)
- Import de plan via archive ZIP
- Normalisation des formats JSON dans `utils.js`
- Gestion des modes exclusifs (un seul mode actif à la fois)
- Bouton vider le cache avec double confirmation

### 25/04/2026
- Documentation intégrée à l'interface (README + README_USER)
- Bouton vider le cache dans les réglages
- Correction du responsive design (interface mobile)

### 22/04/2026
- Ajout du mode import local (chargement d'un plan depuis le navigateur sans serveur)

### 19/04/2026
- Le bouton télécharger intègre désormais tous les calques visibles
- Ajout du tracé de routes : Principal / Secondaire / Chemin
- Interface mise à jour avec import/export global de session JSON
- Correction du tracker : intégration de la boussole via `alpha`, `beta`, `gamma`

**Points en cours d'investigation :**
- Erreur d'échelle constatée sur le tracker — possible problème de cooldown
- Tiling JPEG sur Safari iOS : qualité réduite par contrainte mémoire GPU (MAX_WORK_DIM = 8192)

---

## 🧭 Introduction générale

MyKTAMap est une application web permettant de **visualiser, annoter et exploiter un plan** (carrière souterraine, bâtiment, site industriel…) à partir d'une image haute résolution.

L'outil repose sur **[Leaflet](https://leafletjs.com/)** en projection simple (`L.CRS.Simple`), ce qui permet de travailler sur une carte personnalisée **sans coordonnées GPS**.

### Fonctionnalités principales

| Fonctionnalité | État |
|---|---|
| Affichage du plan (image haute résolution) | ✅ Disponible |
| Gestion de calques et d'icônes dynamiques | ✅ Disponible |
| Ajout de points d'intérêt (modale + tags custom) | ✅ Disponible |
| Mesure de distances | ✅ Disponible |
| Tracé de routes (Principal / Secondaire / Chemin) | ✅ Disponible |
| Suppression granulaire (dernier point / dernier tracé / tout) | ✅ Disponible |
| Export / import JSON de session | ✅ Disponible |
| Import de plan via ZIP | ✅ Disponible |
| Convertisseur JSON (editor ↔ data) | ✅ Disponible |
| Générateur de plan ZIP avec gestion des tags | ✅ Disponible |
| Modification d'un plan existant | ✅ Disponible |
| Mode performance (tiling JPEG volumineux) | ✅ Disponible |
| Application PWA — mode standalone iOS | ✅ Disponible |
| Mode hors-connexion (Service Worker) | ✅ **Réactivé** |
| Panneau de logs de débogage | ✅ Disponible |
| Déplacement simulé via capteurs mobile | ⚠️ Expérimental |

---

## 🏗️ Architecture applicative

```
index.html                  ← Page unique (loader intégré + carte)
sw.js                       ← Service Worker (mode hors-ligne)
        │
        ├── debug.js           ← Capture logs + modale débogage
        ├── config.js          ← Configuration unifiée (serveur + import)
        ├── utils.js           ← Fonctions utilitaires + export PNG dynamique
        ├── measure.js         ← Mesure de distance + suppression granulaire
        ├── tiling.js          ← Mode performance : découpage en tuiles
        ├── map.js             ← Initialisation Leaflet + _iconMap dynamique
        ├── tracking.js        ← Déplacement simulé via capteurs
        ├── editor.js          ← Modale plein écran + tags custom
        ├── road.js            ← Tracé de routes + suppression granulaire
        ├── createConf.js      ← Générateur de plan ZIP (Nouveau / Modifier)
        ├── interface.js       ← Interface Leaflet + toutes les modales
        └── main.js            ← Point d'entrée unique avec auto-détection

lib/
        ├── leaflet/           ← Leaflet.js (local)
        └── jszip.min.js       ← JSZip 3.10.1 (local, requis pour ZIP)
```

> `import.html`, `config_import.js`, `map_import.js` et `main_import.js` ont été **supprimés**. Toute leur logique est absorbée dans les fichiers unifiés.

---

## 📱 PWA — Application installable

MyKTAMap est une **PWA installable** sur mobile et desktop. Sur iOS, elle peut être ajoutée à l'écran d'accueil via Safari (Partager ↑ → Sur l'écran d'accueil) et fonctionne ensuite en mode standalone (sans la barre Safari).

### Métadonnées dans `<head>`

```html
<!-- Mode standalone -->
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="MyKTAMap">
<meta name="mobile-web-app-capable" content="yes">

<!-- Icône écran d'accueil iOS -->
<link rel="apple-touch-icon" href="icon/mkm.png">
<link rel="apple-touch-icon" sizes="180x180" href="icon/mkm.png">
<link rel="apple-touch-icon" sizes="167x167" href="icon/mkm.png">
<link rel="apple-touch-icon" sizes="152x152" href="icon/mkm.png">
<link rel="apple-touch-icon" sizes="120x120" href="icon/mkm.png">

<!-- Favicon classique navigateur -->
<link rel="icon" type="image/png" href="icon/mkm.png">
```

### Pourquoi 5 balises `apple-touch-icon`

Safari iOS **ignore complètement** la balise `<link rel="icon">` standard pour le bouton "Sur l'écran d'accueil". Il cherche **uniquement** `apple-touch-icon`. On déclare plusieurs tailles pour qu'iOS choisisse la plus proche selon l'appareil :

| Taille | Appareil cible |
|---|---|
| 180×180 | iPhone Retina (récents) |
| 167×167 | iPad Pro |
| 152×152 | iPad standard |
| 120×120 | iPhone non-Retina |
| sans taille | Fallback universel |

En pratique on peut servir le même fichier (Safari redimensionne) — l'important c'est que la balise existe.

### Contraintes du fichier icône

- **PNG carré** (idéalement 180×180 minimum, 512×512 recommandé)
- **Fond opaque** — pas de transparence, sinon iOS met du noir
- **Pas d'arrondi** dans l'image — iOS arrondit les coins automatiquement
- **Marge interne 10-15%** — iOS rogne légèrement les bords

### Mise à jour de l'icône

iOS cache l'icône PWA de manière agressive. Pour forcer le rafraîchissement après changement :

1. Sur l'iPhone : appui long sur l'icône MyKTAMap → Supprimer l'app
2. Réglages → Safari → Effacer historique et données
3. Ferme Safari complètement (swipe up dans le sélecteur d'apps)
4. Rouvre `myktamap.is-underground.fr` dans Safari
5. Partager ↑ → Sur l'écran d'accueil

L'icône est servie depuis `icon/mkm.png` — vérifier sa disponibilité directe avec `https://devmap.is-underground.fr/icon/mkm.png`.

---

## 🔄 Mode hors-connexion — Service Worker

Le `sw.js` est **actif** et précache l'ensemble des assets statiques de l'application au premier chargement. Une fois en cache, l'app fonctionne entièrement hors-ligne.

**Stratégie :**
- **Cache First** pour les assets app (HTML, JS, CSS, icônes)
- **Network First** pour `data/plan-config.json` et les données du plan (toujours fraîches si dispo)
- **Fallback Cache** automatique si pas de réseau

**Mise à jour de version :**
Quand tu déploies une nouvelle version, incrémente `CACHE_VERSION` dans `sw.js`. Les anciens caches sont automatiquement purgés au prochain `activate`.

**Désactivation manuelle :**
Le bouton 🗑️ Réinitialiser dans ⚙️ désinscrit le SW et vide tous les caches → recharge complète depuis le serveur.

---

## 🚀 Démarrage — auto-détection du mode

`main.js` orchestre le démarrage en deux branches :

```
initApp()
  → loadAppConfig()          ← tente fetch('data/plan-config.json')
      → succès               → lancerApplication()   (mode serveur)
      → échec                → afficherLoader()       (mode import)

startImportedPlan()          ← appelé par le loader HTML ou le ZIP modifier
  → resetRuntimeAssets()
  → registerAsset() × N      ← enregistre les fichiers comme Blob URLs
  → cloneAndResolvePlanConfig()
  → buildAppConfigFromPlan() ← applique perfMode du loader
  → lancerApplication()
```

Le loader HTML est intégré dans `index.html` avec `display:none` — il s'affiche uniquement si aucun plan serveur n'est détecté, ou quand l'utilisateur clique 🗂️.

---

## 🎨 Système d'icônes dynamique

Les icônes sont entièrement **pilotées par `PLAN_CONFIG.icons`** — aucune liste hard-codée dans le code.

### `_iconMap` (map.js)

Construit dynamiquement par `creerIcones()` à partir de `iconConfig` :

```js
window._iconMap = {};
Object.keys(iconConfig).forEach(function(tag) {
  if (!iconConfig[tag]) return;
  window._iconMap[tag] = L.icon({
    iconUrl:    iconConfig[tag],
    iconSize:   [50, 50],
    iconAnchor: [25, 25]
  });
});
```

Toutes les icônes sont en **50×50 avec ancrage centré** (auparavant `vehicule` était une exception en 50×25 qui causait un export PNG étiré).

### `choisirIcone(point)` (utils.js)

Parcourt `point.tags` et retourne la première icône définie dans `_iconMap`. Permet à `editor.js` de gérer des tags personnalisés sans modifier le code.

### `getIconForPoint(point)` (utils.js, export PNG)

Même logique que `choisirIcone` mais pour le canvas d'export. Charge l'image en cache et retourne le couple `{img, path}`.

---

## ⚡ Mode Performance (tiling.js)

Pour les plans JPEG volumineux (> 60 Mo) qui crashent Safari iOS, le mode performance découpe l'image en tuiles.

### Activation

| `APP_CONFIG.perfMode` | Comportement |
|---|---|
| `null` (Auto) | Activé si `fileSize > 60Mo` |
| `true` | Toujours activé |
| `false` | Désactivé — imageOverlay classique |

Le choix dans le loader (checkbox ⚡) est passé explicitement à `startImportedPlan(file, assets, perfChoisi)` et écrase le localStorage.

### Flux technique

```
chargerImage(url, bounds, map, fileSize, sourceFile)
  → perfModeActif() ?
      → chargerImageTuillee()
          → _imageVersCanvasReduit() ← <img> HTML → canvas (max 8192px)
              ↳ Blob URL créée et révoquée à l'intérieur (sécurité Safari)
              ↳ Détection canvas noir + re-essai 100ms
          → _tilerDepuisCanvas()    ← découpe en tuiles 1024×1024 JPEG 0.88
              → L.imageOverlay()    ← placement Leaflet
      → L.imageOverlay()            ← mode normal
```

### Limites Safari iOS

- `drawImage` sur un JPEG > 8192px échoue silencieusement → canvas noir
- Détection automatique : `getImageData(1,1,1,1)` après drawImage
- Fallback : re-essai avec `setTimeout(100ms)`, puis `imageOverlay` classique si toujours noir
- La Blob URL est créée et révoquée **à l'intérieur** de `_imageVersCanvasReduit` pour éviter l'expiration sandbox Safari

---

## 💾 Préférences utilisateur

Les préférences sont séparées de la config plan pour survivre aux changements de plan :

```js
// Sauvegarde
localStorage.setItem("app_user_prefs", JSON.stringify({
  motionDebug: APP_CONFIG.motionDebug,
  perfMode:    APP_CONFIG.perfMode
}));

// Restauration (dans buildAppConfigFromPlan)
const saved = JSON.parse(localStorage.getItem("app_user_prefs") || "{}");
if ("perfMode" in saved) cfg.perfMode = saved.perfMode;
```

Les dimensions du plan et paramètres tracking viennent toujours du `plan-config.json`.

---

## ⚙️ Configuration — `plan-config.json`

Chaque plan est décrit par un fichier `plan-config.json`.

### Exemple complet

```json
{
  "plan": {
    "name": "TEST",
    "version": "V1",
    "author": "KARMA",
    "imageWidth": 1044,
    "imageHeight": 610,
    "baseImage": "data/TestMAP.png",
    "collisionImage": "data/collision.png"
  },
  "imageLayers": [
    { "id": "legende", "label": "Legende", "file": "data/TestMAP_LEGENDE.png", "visible": true, "order": 10 }
  ],
  "dataLayers": [
    { "id": "puits",    "label": "Puits",   "file": "data/puit.json",    "visible": true },
    { "id": "vehicule", "label": "Vehicule","file": "data/vehicule.json","visible": true },
    { "id": "editor",   "label": "Ajouts",  "file": "data/editor.json",  "visible": true }
  ],
  "tracking": {
    "startX": 345,
    "startY": 519,
    "scale": 4.9,
    "stepLength": 0.7,
    "stepThreshold": 13,
    "stepCooldown": 400
  },
  "icons": {
    "default":  "icon/iconetrack.png",
    "track":    "icon/iconetrack.png",
    "salle":    "icon/house.png",
    "pa":       "icon/pa.png",
    "vehicule": "icon/vehicule.png",
    "fontaine": "icon/iconetrack.png"
  }
}
```

> Le calque `editor` doit toujours être présent dans `dataLayers`.
> Les tags `default` et `track` sont **obligatoires** dans `icons`. Les autres sont libres.

---

## 📁 Description des modules

### `config.js` (unifié)

Gère :
- `DEFAULT_CONFIG` / `APP_CONFIG` — configuration active
- `RUNTIME_ASSETS` — registre des fichiers importés (Blob URLs)
- `buildAppConfigFromPlan()` — construit APP_CONFIG depuis un plan + préférences
- `loadAppConfig()` — charge `data/plan-config.json` (mode serveur)
- `sauvegarderPrefsUtilisateur()` — persiste `motionDebug` et `perfMode`
- Helpers : `registerAsset()`, `findMatchingFile()`, `cloneAndResolvePlanConfig()`, `validateImportedPlan()`

### `map.js` (unifié)

- `cleanupExistingMap()` — destruction propre de la carte existante avant rechargement
- `initMapFromConfig()` — initialisation Leaflet, calques, tiling si nécessaire
- `creerIcones(iconConfig)` — construit `_iconMap` dynamique
- `initCollisionMap()` — canvas collision avec downscale automatique (max 4096px)

### `main.js` (unifié)

- `lancerApplication()` — reset complet + init carte + init modules
- `startImportedPlan(planConfigFile, assetFiles, perfChoisi)` — chargement depuis le loader
- `afficherLoader()` — affiche le loader intégré
- Auto-détection au démarrage via `loadAppConfig()`

### `editor.js`

Modale plein écran pour ajouter un point. Liste de tags dynamique avec :
- **— Aucun tag (défaut) —** (utilise icône `default`)
- Tags du `PLAN_CONFIG.icons`
- **➕ Créer un nouveau tag…** (validation regex `[a-z0-9_-]+`, ajout à `PLAN_CONFIG.icons` + `_iconMap`)

API exposée :
- `getEditorPoints()` / `setEditorPoints(points)`
- `removeLastEditorPoint()` — supprime le dernier point ajouté
- `renderEditorPoints()` — re-rendu complet du calque

### `road.js`

API exposée :
- `getRoads()` / `setRoads(roads)`
- `resetRoads()` — supprime tout
- `removeLastRoad()` — supprime le dernier tracé entier
- `removeLastRoadPoint()` — supprime le dernier point du dernier tracé (et le tracé s'il devient vide)
- `toggleRoadMode(type)` — active/désactive un mode de tracé

### `measure.js`

API exposée :
- `getMeasurePoints()` / `setMeasurePoints(points)`
- `resetMesure()` — supprime tout
- `removeLastMeasurePoint()` — supprime le dernier point de mesure
- `telechargerMesureJSON()` — export du tracé en JSON

### `tracking.js`

Cache collision initialisé une seule fois à l'init (`initCollisionCache`) — stocke le tableau RGBA complet en mémoire avec ratio `_collisionScaleX/Y` pour la conversion plan → canvas.

### `utils.js`

- `convertCoord(x, y)` — coordonnées plan → Leaflet
- `choisirIcone(p)` — sélection dynamique depuis `_iconMap`
- `ajouterPointsDepuisJSON(url, layer)` — chargement par batch de 50
- `telechargerPlan()` — export PNG complet (calques visibles + points + tracés + tracker)

### `interface.js`

#### Blocs de contrôles

| Bloc | Boutons |
|---|---|
| Infos | ❓ 📖 📦 🗂️ ⚙️ 🗺️ |
| Tracking | ▶️/⏹️ 📍 |
| Mesure | 📏 ❌ |
| Plan | 🖼️ |
| Édition | ✏️ 🗑️ |
| Routes | 🟩 🟪 🟨 🧹 |
| Import/Export | 📂 💾 🔄 |

#### Modales disponibles

| Fonction | Description |
|---|---|
| `afficherAide()` | Référence des boutons par section |
| `afficherConfig()` | Réglages APP_CONFIG + logs + réinitialiser |
| `afficherLegende()` | Icônes et tracés du plan actif |
| `afficherReadme()` | Choix doc utilisateur / développeur |
| `afficherConvertisseur()` | Conversion JSON bidirectionnelle |
| `afficherPlanner()` | Générateur de plan ZIP (Nouveau / Modifier) |
| `afficherLogsDebug()` | Panneau logs de débogage |
| `afficherFormulaire(x, y)` | Modale ajout de point (editor.js) |

#### Helpers de suppression

- `_confirmerAction(titre, texte, callback)` — modale simple Annuler/Confirmer
- `_choixSuppression(titre, texte, options[])` — modale avec liste d'options labellées (chacune avec icône, description, callback)

### `debug.js`

Capture silencieuse de tous les `console.log/warn/error` + erreurs non catchées. Persistance dans `localStorage("kta_debug_logs")` — les logs survivent au crash du tab. Accessible via ⚙️ → 🐛 Logs.

### `createConf.js` (Générateur de plan)

Deux onglets :
- **📄 Nouveau** — formulaire vierge
- **📂 Modifier existant** — drop ZIP, pré-remplissage, régénération

Sections du formulaire :
1. Métadonnées (nom, version, auteur, dimensions)
2. Images principales (base + collision)
3. Calques image supplémentaires (jusqu'à 10)
4. Calques de données JSON (jusqu'à 10, `editor` ajouté automatiquement)
5. Paramètres de tracking
6. **Icônes & Tags** — gestionnaire dynamique avec :
   - Bouton "↺ Charger défauts" — pré-remplit avec les icônes standards
   - Bouton "+ Ajouter un tag" — création d'un tag personnalisé
   - Upload d'icônes custom par tag (preview live)
   - Tags `default` et `track` en lecture seule (système)

---

## 📦 Structure des données JSON

### Format standard (calques de données)

```json
{
  "type": "puits",
  "version": 1,
  "data": [ ... ],
  "roads": []
}
```

Le champ `roads[]` est optionnel — s'il est présent, les tracés sont affichés en lecture seule dans le même calque Leaflet (non modifiables via 🧹).

### Format session exportée

```json
{
  "type": "devmap-session",
  "version": 1,
  "editorPoints": [ ... ],
  "measure": { "points": [] },
  "roads": []
}
```

### Format point

```json
{
  "id": "PA1",
  "nom": "Puits Aération",
  "x": 4843,
  "y": 2002,
  "tags": ["pa"],
  "etat": "Non inspectée",
  "description": "Puits avec courant d'air",
  "profondeur": 12,
  "date_update": "2026-04-03"
}
```

Un point peut avoir un tableau `tags` vide → utilise l'icône `default`.

---

## 🔄 Convertisseur JSON

| Sens | Entrée | Sortie |
|---|---|---|
| edition → data | `{ editorPoints, roads }` | `{ type, version, data, roads }` |
| data → edition | `{ data, roads }` | `{ type: "devmap-session", editorPoints, roads }` |

Les routes sont préservées dans les deux sens.

---

## 📍 Gestion des coordonnées

GIMP : origine haut-gauche (Y vers le bas). Leaflet `L.CRS.Simple` : origine bas-gauche (Y vers le haut).

```js
function convertCoord(x, y) {
  return [APP_CONFIG.imageHeight - y, x];
}
```

---

## 🐛 Débogage

Le panneau de logs est accessible via **⚙️ → 🐛 Logs**. Il capture en silence :
- Tous les `console.log`, `console.warn`, `console.error`
- Les erreurs non catchées (`window.onerror`)
- Les promesses rejetées (`unhandledrejection`)

Les logs sont persistés dans `localStorage("kta_debug_logs")` — ils survivent au crash du tab Safari iOS. Au prochain ouverture, les logs du crash précédent s'affichent en grisé avec le label `[CRASH PRÉCÉDENT]`.

---

## 📄 Licence

Projet personnel — libre d'adaptation selon vos besoins non commerciaux.
