# MyKTAMap
> Application web de cartographie terrain — visualisation, annotation et déplacement simulé sur plan image.

**Environnements :**
- 🟢 Production : [myktamap.is-underground.fr](https://myktamap.is-underground.fr)
- 🔧 Développement : [devmap.is-underground.fr](https://devmap.is-underground.fr)

> ⚠️ Les données présentes sur le site de démonstration sont fictives.

---

## 📋 Journal des modifications

### 27/04/2026
- Mise a jours du set icone par default
- Ajout de l'import ZIP pour la creation de plan pour partir d'une base existante (Optionnel)
- **Refonte architecture complète** — fusion `index.html` + `import.html` en une seule page PWA
- Suppression de `import.html`, `config_import.js`, `map_import.js`, `main_import.js`
- `config.js`, `map.js`, `main.js` unifiés : gèrent les deux modes (serveur + import navigateur)
- Auto-détection au démarrage : charge `data/plan-config.json` si disponible, sinon affiche le loader
- Bouton 🗂️ "Changer de plan" reste dans la même page — PWA standalone préservée
- Ajout du mode performance (tiling) pour les plans JPEG volumineux sur Safari iOS
- `tiling.js` — nouveau module de découpage en tuiles via `<img>` HTML + canvas
- Préférences utilisateur (`perfMode`, `motionDebug`) persistées séparément du plan dans `app_user_prefs`
- Panneau de logs de débogage intégré (🐛 dans ⚙️) avec persistance `localStorage`
- Optimisation collision : cache pixel en mémoire (`initCollisionCache`) — plus de `getImageData` à chaque pas
- Chargement des markers par batch de 50 via `requestAnimationFrame` — évite le freeze UI
- Routes embarquées dans les calques de données (`roads[]` dans le JSON data)
- Métadonnées PWA ajoutées (`apple-mobile-web-app-capable`) — mode standalone sur iPhone
- `debug.js` — capture silencieuse des logs, accessible via ⚙️ → Logs

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
- Erreur d'échelle constatée sur le tracker — possible problème de cooldown (à investiguer)
- Tiling JPEG sur Safari iOS : qualité réduite par contrainte mémoire GPU (MAX_WORK_DIM = 8192)

---

## 🧭 Introduction générale

MyKTAMap est une application web permettant de **visualiser, annoter et exploiter un plan** (carrière souterraine, bâtiment, site industriel…) à partir d'une image haute résolution.

L'outil repose sur **[Leaflet](https://leafletjs.com/)** en projection simple (`L.CRS.Simple`), ce qui permet de travailler sur une carte personnalisée **sans coordonnées GPS**.

### Fonctionnalités principales

| Fonctionnalité | État |
|---|---|
| Affichage du plan (image haute résolution) | ✅ Disponible |
| Gestion de calques et d'icônes | ✅ Disponible |
| Ajout de points d'intérêt | ✅ Disponible |
| Mesure de distances | ✅ Disponible |
| Tracé de routes (Principal / Secondaire / Chemin) | ✅ Disponible |
| Export / import JSON de session | ✅ Disponible |
| Import de plan via ZIP | ✅ Disponible |
| Convertisseur JSON (editor ↔ data) | ✅ Disponible |
| Générateur de plan ZIP | ✅ Disponible |
| Mode performance (tiling JPEG volumineux) | ✅ Disponible |
| Application PWA — mode standalone iOS | ✅ Disponible |
| Panneau de logs de débogage | ✅ Disponible |
| Déplacement simulé via capteurs mobile | ⚠️ Expérimental |
| Mode hors-connexion (ServiceWorker) | ⚠️ Désactivé |

---

## 🏗️ Architecture applicative

```
index.html                  ← Page unique (loader intégré + carte)
        │
        ├── debug.js           ← Capture logs + modale débogage
        ├── config.js          ← Configuration unifiée (serveur + import)
        ├── utils.js           ← Fonctions utilitaires + normalisation JSON
        ├── measure.js         ← Mesure de distance
        ├── tiling.js          ← Mode performance : découpage en tuiles
        ├── map.js             ← Initialisation Leaflet (unifié)
        ├── tracking.js        ← Déplacement simulé via capteurs
        ├── editor.js          ← Ajout de points d'intérêt
        ├── road.js            ← Tracé de routes
        ├── createConf.js      ← Générateur de plan ZIP
        ├── interface.js       ← Interface Leaflet + toutes les modales
        └── main.js            ← Point d'entrée unique avec auto-détection

lib/
        ├── leaflet/           ← Leaflet.js (local)
        └── jszip.min.js       ← JSZip 3.10.1 (local, requis pour ZIP)
```

> `import.html`, `config_import.js`, `map_import.js` et `main_import.js` sont **supprimés**. Toute leur logique est absorbée dans les fichiers unifiés.

### Résumé des fichiers

| Fichier | Rôle principal |
|---|---|
| `debug.js` | Capture silencieuse des logs, persistance localStorage, modale débogage |
| `config.js` | Configuration unifiée : DEFAULT_CONFIG, APP_CONFIG, RUNTIME_ASSETS, préférences |
| `utils.js` | Fonctions utilitaires partagées + batch markers + routes embarquées |
| `tiling.js` | Mode performance : découpage image en tuiles 1024px via `<img>` + canvas |
| `map.js` | Initialisation carte Leaflet, calques, collision (unifié serveur + import) |
| `measure.js` | Mesure de distance |
| `tracking.js` | Déplacement simulé, cache collision pixel, PDR |
| `editor.js` | Ajout de points et export JSON |
| `road.js` | Tracé de routes Principal / Secondaire / Chemin |
| `createConf.js` | Générateur de plan ZIP complet |
| `interface.js` | Interface utilisateur Leaflet + toutes les modales |
| `main.js` | Point d'entrée unique : auto-détection, startImportedPlan, lancerApplication |

---

## 🚀 Démarrage — auto-détection du mode

`main.js` orchestre le démarrage en deux branches :

```
initApp()
  → loadAppConfig()          ← tente fetch('data/plan-config.json')
      → succès               → lancerApplication()   (mode serveur)
      → échec                → afficherLoader()       (mode import)

startImportedPlan()          ← appelé par le loader HTML
  → resetRuntimeAssets()
  → registerAsset() × N      ← enregistre les fichiers comme Blob URLs
  → cloneAndResolvePlanConfig()
  → buildAppConfigFromPlan() ← applique perfMode du loader
  → lancerApplication()
```

Le loader HTML est intégré dans `index.html` avec `display:none` — il s'affiche uniquement si aucun plan serveur n'est détecté, ou quand l'utilisateur clique 🗂️.

---

## ⚡ Mode Performance (tiling.js)

Pour les plans JPEG volumineux (> 60 Mo) qui crashent Safari iOS, le mode performance découpe l'image en tuiles.

### Activation

| `APP_CONFIG.perfMode` | Comportement |
|---|---|
| `null` (Auto) | Activé si `fileSize > 60Mo` |
| `true` | Toujours activé |
| `false` | Désactivé — imageOverlay classique |

Le choix dans le loader (checkbox ⚡) est passé explicitement à `startImportedPlan(file, assets, perfChoisi)` et écrase le localStorage — garantissant que le choix au chargement est toujours respecté.

### Flux technique

```
chargerImage(url, bounds, map, fileSize, sourceFile)
  → perfModeActif() ?
      → chargerImageTuillee()
          → _obtenirBlob()          ← File direct si mode import, fetch sinon
          → _imageVersCanvasReduit() ← <img> HTML → canvas (max 8192px)
          → _tilerDepuisCanvas()    ← découpe en tuiles 1024×1024
              → _canvasToBlob()     ← JPEG 0.88 par tuile
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
    {
      "id": "legende",
      "label": "Legende",
      "file": "data/TestMAP_LEGENDE.png",
      "visible": true,
      "order": 10
    }
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
    "pc":       "icon/pc.png",
    "pb":       "icon/pb.png",
    "vehicule": "icon/vehicule.png",
    "elec":     "icon/elec.png",
    "epure":    "icon/epure.png",
    "ps":       "icon/ps.png",
    "info":     "icon/info.png",
    "chatiere": "icon/chatiere.png",
    "passage":  "icon/passage.png",
    "danger":   "icon/danger.png",
    "pe":       "icon/pe.png"
  }
}
```

### Section `plan`

| Clé | Type | Utilité |
|---|---|---|
| `name` | string | Nom affiché dans le titre |
| `version` | string | Version du plan |
| `author` | string | Auteur ou source |
| `imageWidth` | number | Largeur en pixels |
| `imageHeight` | number | Hauteur en pixels |
| `baseImage` | string | Chemin vers l'image principale |
| `collisionImage` | string | Chemin vers l'image de collision |

### Section `tracking`

| Clé | Type | Utilité |
|---|---|---|
| `startX` | number | Position X initiale du tracker |
| `startY` | number | Position Y initiale du tracker |
| `scale` | number | Facteur pixels/mètres |
| `stepLength` | number | Longueur d'un pas (mètres) |
| `stepThreshold` | number | Seuil détection pas |
| `stepCooldown` | number | Délai minimum entre deux pas (ms) |

> Le calque `editor` doit toujours être présent dans `dataLayers`.

---

## 📁 Description des modules

### `config.js` (unifié)

Remplace `config.js` + `config_import.js`. Gère :

- `DEFAULT_CONFIG` / `APP_CONFIG` — configuration active
- `RUNTIME_ASSETS` — registre des fichiers importés (Blob URLs)
- `buildAppConfigFromPlan()` — construit APP_CONFIG depuis un plan + préférences
- `loadAppConfig()` — charge `data/plan-config.json` (mode serveur)
- `sauvegarderPrefsUtilisateur()` — persiste `motionDebug` et `perfMode`
- Helpers : `registerAsset()`, `findMatchingFile()`, `cloneAndResolvePlanConfig()`, `validateImportedPlan()`

### `map.js` (unifié)

Remplace `map.js` + `map_import.js`. Gère :

- `cleanupExistingMap()` — destruction propre de la carte existante avant rechargement
- `initMapFromConfig()` — initialisation Leaflet, calques, tiling si nécessaire
- `initCollisionMap()` — canvas collision avec downscale automatique (max 4096px) et `willReadFrequently: true`

### `main.js` (unifié)

Remplace `main.js` + `main_import.js`. Gère :

- `lancerApplication()` — reset complet + init carte + init modules
- `startImportedPlan(planConfigFile, assetFiles, perfChoisi)` — chargement depuis le loader
- `afficherLoader()` / `afficherLoader()` — affiche/masque le loader intégré
- Auto-détection au démarrage via `loadAppConfig()`

### `tracking.js`

Cache collision initialisé une seule fois à l'init (`initCollisionCache`) — stocke le tableau RGBA complet en mémoire. Les vérifications de collision lisent un index tableau au lieu d'appeler `getImageData` à chaque pas.

### `utils.js`

Chargement des markers par batch (`requestAnimationFrame`) — 50 markers par frame. Routes embarquées (`roads[]`) dans les calques de données chargées via `ajouterPointsDepuisJSON`.

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
| `afficherPlanner()` | Générateur de plan ZIP |
| `afficherLogsDebug()` | Panneau logs de débogage |

### `debug.js`

Capture silencieuse de tous les `console.log/warn/error` + erreurs non catchées. Persistance dans `localStorage("kta_debug_logs")` — les logs survivent au crash du tab. Accessible via ⚙️ → 🐛 Logs.

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

Le champ `roads[]` est optionnel — s'il est présent, les tracés sont affichés en lecture seule dans le même calque Leaflet que les points (non modifiables via 🧹).

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

## 📄 Licence

Projet personnel — libre d'adaptation selon vos besoins non commerciaux.
