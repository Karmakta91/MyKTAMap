# MyKTAMap

> Application web de cartographie terrain — visualisation, annotation et déplacement simulé sur plan image.
<img width="1345" height="673" alt="image" src="https://github.com/user-attachments/assets/77559b0d-9fb0-49e6-97a8-d9b1f9073d1d" />

**Environnements :**
- 🟢 Production : [myktamap.is-underground.fr](https://myktamap.is-underground.fr)
- 🔧 Développement : [devmap.is-underground.fr](https://devmap.is-underground.fr)

> ⚠️ Les données présentes sur le site de démonstration sont fictives.

---

## 📋 Journal des modifications

### 26/04/2026
- Ajout du mode de creation de plan
- Documentation utilisateur séparée du README DEV (`README_USER.md`)
- Aide, Légende, Réglages, Légende en modales plein écran
- Ajout du convertisseur JSON bidirectionnel (`editor ↔ data`)
- Ajout du générateur de plan ZIP (`planner.js`)
- Refonte graphique de l'interface (charte dark cohérente)
- Import de plan via archive ZIP
- Normalisation des formats JSON dans `utils.js`
- Gestion des modes exclusifs (un seul mode actif à la fois)
- Bouton vider le cache avec double confirmation

### 25/04/2026
- Documentation intégrée à l'interface (README + README_USER)
- Bouton vider le cache dans les réglages
- Réactivation du Service Worker (test en cours)
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
| Déplacement simulé via capteurs mobile | ⚠️ Expérimental |
| Mode hors-connexion (ServiceWorker) | ⚠️ Test en cours |

---

## 🏗️ Architecture applicative

```
index.html / import.html
        │
        ├── config.js          ← Configuration globale (APP_CONFIG, DEFAULT_CONFIG)
        ├── config_import.js   ← Configuration en mode import navigateur
        ├── utils.js           ← Fonctions utilitaires (convertCoord, choisirIcone)
        ├── map.js             ← Initialisation Leaflet + calques + collision
        ├── map_import.js      ← Idem, adapté au mode import navigateur
        ├── tracking.js        ← Déplacement simulé via capteurs
        ├── measure.js         ← Mesure de distance
        ├── editor.js          ← Ajout de points d'intérêt
        ├── road.js            ← Tracé de routes
        ├── createConf.js         ← Générateur de plan ZIP
        ├── interface.js       ← Construction de l'interface Leaflet
        ├── main.js            ← Point d'entrée (mode serveur)
        └── main_import.js     ← Point d'entrée (mode import navigateur)

lib/
        ├── leaflet/           ← Leaflet.js (local)
        └── jszip/             ← JSZip 3.10.1 (local, requis pour ZIP)
```

### Résumé des fichiers

| Fichier | Rôle principal |
|---|---|
| `config.js` | Configuration globale (mode fichier local) |
| `config_import.js` | Configuration globale en mode import navigateur |
| `utils.js` | Fonctions utilitaires partagées + normalisation JSON |
| `map.js` | Initialisation de la carte et des calques |
| `map_import.js` | Idem, adapté au mode import navigateur |
| `measure.js` | Mesure de distance |
| `tracking.js` | Déplacement simulé et détection de collision |
| `editor.js` | Ajout de points et export JSON |
| `road.js` | Tracé de routes Principal / Secondaire / Chemin |
| `createConf.js` | Générateur de plan ZIP complet |
| `interface.js` | Interface utilisateur Leaflet + toutes les modales |
| `main.js` | Initialisation globale (mode fichier local) |
| `main_import.js` | Initialisation globale en mode import navigateur |

---

## ⚙️ Configuration — `plan-config.json`

Chaque plan est décrit par un fichier `plan-config.json` qui centralise toutes les informations nécessaires au chargement.

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
    { "id": "puits",     "label": "Puits",    "file": "data/puit.json",      "visible": true },
    { "id": "vehicule",  "label": "Vehicule", "file": "data/vehicule.json",  "visible": true },
    { "id": "editor",    "label": "Ajouts",   "file": "data/editor.json",    "visible": true }
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
| `name` | string | Nom affiché dans le titre de l'interface |
| `version` | string | Version du plan |
| `author` | string | Auteur ou source de la cartographie |
| `imageWidth` | number | Largeur de l'image en pixels |
| `imageHeight` | number | Hauteur de l'image en pixels |
| `baseImage` | string | Chemin vers l'image principale |
| `collisionImage` | string | Chemin vers l'image de collision (zones interdites) |

### Section `imageLayers`

| Champ | Utilité |
|---|---|
| `id` | Identifiant interne |
| `label` | Nom affiché dans le contrôle de couches |
| `file` | Chemin vers l'image |
| `visible` | Visibilité au chargement |
| `order` | Ordre de superposition (plus grand = dessus) |

### Section `dataLayers`

| Champ | Utilité |
|---|---|
| `id` | Identifiant technique utilisé dans le code |
| `label` | Nom affiché dans le contrôle de couches |
| `file` | Chemin vers le fichier JSON |
| `visible` | Visibilité au chargement |

> Le calque `editor` doit toujours être présent — il reçoit les points créés via le mode ajout.

### Section `tracking`

| Clé | Type | Utilité |
|---|---|---|
| `startX` | number | Position X initiale du tracker (pixels) |
| `startY` | number | Position Y initiale du tracker (pixels) |
| `scale` | number | Facteur de conversion pixels/mètres |
| `stepLength` | number | Longueur moyenne d'un pas (mètres) |
| `stepThreshold` | number | Seuil d'accélération pour détecter un pas |
| `stepCooldown` | number | Délai minimum entre deux pas (ms) |

---

## 📁 Description des modules

### `config.js`

Centralise les constantes de configuration. Deux objets coexistent :

- `DEFAULT_CONFIG` : valeurs d'origine, jamais modifiées
- `APP_CONFIG` : valeurs actives, surchargées par l'utilisateur via l'interface

Les réglages modifiés via l'interface sont persistés dans le `localStorage`.

### `utils.js`

Contient les fonctions partagées entre modules.

#### `convertCoord(x, y)`

Convertit les coordonnées internes du plan (origine haut-gauche, style GIMP) vers le système Leaflet (origine bas-gauche).

```js
function convertCoord(x, y) {
  return [APP_CONFIG.imageHeight - y, x];
}
```

> Si vous utilisez un logiciel autre que GIMP, vérifiez l'origine de l'axe Y.

#### `choisirIcone(point)`

Sélectionne l'icône Leaflet appropriée en fonction des tags du point.

#### `ajouterPointsDepuisJSON(url, layer)`

Charge un fichier JSON et ajoute les marqueurs sur le layer Leaflet. Accepte deux formats :

- Format standard : `{ "data": [...] }`
- Format session exportée : `{ "editorPoints": [...] }`

La détection est automatique via `normaliserPoints(json)`.

### `map.js` / `map_import.js`

Initialise la carte Leaflet en mode `L.CRS.Simple` et charge tous les calques.

```js
map = L.map('map', {
  crs: L.CRS.Simple,
  minZoom: -2,
  maxBounds: bounds,
  maxBoundsViscosity: 1.0
});
```

#### Carte de collision

Chargée dans un `<canvas>` hors-DOM. Les pixels rouges (`r > 200, g < 50, b < 50`) représentent les zones interdites au déplacement du tracker.

### `tracking.js`

Gère le déplacement simulé via les capteurs du téléphone (PDR — *Pedestrian Dead Reckoning*).

Flux : `requestPermission()` → `initOrientation()` → `initMotion()` → `avancer()` → `updateMap()`

#### Calcul du cap

```js
function getHeading(alpha, beta, gamma) {
  const a = alpha * Math.PI / 180;
  const b = beta  * Math.PI / 180;
  const g = gamma * Math.PI / 180;

  const x = Math.sin(a) * Math.cos(b)
          + Math.cos(a) * Math.sin(g) * Math.sin(b)
          - Math.cos(a) * Math.cos(g) * Math.sin(b);
  const y = Math.cos(a) * Math.cos(b)
          - Math.sin(a) * Math.sin(g) * Math.sin(b)
          + Math.sin(a) * Math.cos(g) * Math.sin(b);

  let heading = Math.atan2(x, y) * 180 / Math.PI;
  if (heading < 0) heading += 360;
  return heading;
}
```

> Fonctionnalité expérimentale. Aide visuelle uniquement, pas un système de localisation fiable.

### `editor.js`

Module d'ajout de points d'intérêt. Expose :

| Fonction | Rôle |
|---|---|
| `window.getEditorPoints()` | Retourne le tableau des points |
| `window.setEditorPoints(arr)` | Remplace le tableau |
| `window.renderEditorPoints()` | Redessine tous les points sur le calque |

### `road.js`

Module de tracé de routes. Trois types : `principal`, `secondaire`, `chemin`. Expose :

| Fonction | Rôle |
|---|---|
| `window.getRoads()` | Retourne le tableau des tracés |
| `window.setRoads(arr)` | Restaure des tracés |
| `window.resetRoads()` | Efface tous les tracés |
| `window.toggleRoadMode(type)` | Active/désactive un type de tracé |

### `createConf.js`

Génère un ZIP plan complet à partir d'un formulaire. Dépend de **JSZip** (`lib/jszip.min.js`).

Contenu du ZIP généré :

```
plan_nom.zip
├── plan-config.json        ← généré automatiquement
├── data/
│   ├── image_principale.png
│   ├── calque_image.png    ← calques image ajoutés
│   ├── donnees.json        ← calques données (fournis ou créés vides)
│   └── editor.json         ← toujours présent, vide
```

Les icônes ne sont **pas embarquées** dans le ZIP — elles référencent `icon/*.png` du serveur, commun à tous les plans.

### `interface.js`

Construit tous les contrôles Leaflet et les modales. Chaque bloc fonctionnel est un `L.control` indépendant.

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

#### Gestionnaire de modes exclusifs

Un seul mode peut être actif à la fois (mesure, édition, recalage, routes). Géré par `_activerMode(cle, btn, activerFn, desactiverFn)` et `_desactiverTousLesModes()`.

#### Modales disponibles

| Fonction | Description |
|---|---|
| `afficherAide()` | Référence des boutons par section |
| `afficherConfig()` | Réglages APP_CONFIG |
| `afficherLegende()` | Icônes et tracés du plan actif |
| `afficherReadme()` | Choix doc utilisateur / développeur |
| `afficherConvertisseur()` | Conversion JSON bidirectionnelle |
| `afficherPlanner()` | Générateur de plan ZIP |

---

## 📦 Structure des données JSON

### Format standard (calques de données)

```json
{
  "type": "puits",
  "version": 1,
  "data": [
    {
      "id": "PA1",
      "nom": "Puits Aération",
      "x": 4843,
      "y": 2002,
      "tags": ["pa"],
      "etat": "Non inspectée",
      "description": "Puits avec courant d'air",
      "profondeur": 12,
      "date_update": "2026-04-26"
    }
  ]
}
```

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

| Champ point | Type | Utilité |
|---|---|---|
| `id` | string | Identifiant unique |
| `nom` | string | Nom affiché dans le popup |
| `x`, `y` | number | Coordonnées pixels (origine haut-gauche, GIMP) |
| `tags` | array | Détermine l'icône via `choisirIcone()` |
| `etat` | string | État courant |
| `description` | string | Texte affiché dans le popup |
| `profondeur` | number | Optionnel |
| `date_update` | string | Date de dernière mise à jour |

> `ajouterPointsDepuisJSON()` accepte les deux formats automatiquement — la détection repose sur la présence de `data` ou `editorPoints`.

---

## 📍 Gestion des coordonnées

GIMP et la plupart des logiciels image utilisent une origine **haut-gauche** (axe Y vers le bas). Leaflet `L.CRS.Simple` utilise une origine **bas-gauche** (axe Y vers le haut).

```js
function convertCoord(x, y) {
  return [APP_CONFIG.imageHeight - y, x];
}
```

> `imageHeight` doit correspondre exactement à la hauteur en pixels de l'image. La valeur est lue depuis `plan-config.json`.

---

## 🗂️ Mode import navigateur

Permet de charger un plan complet depuis le navigateur, sans serveur web.

**Deux méthodes :**

1. **Fichiers séparés** — sélection manuelle de `plan-config.json` + fichiers associés
2. **Archive ZIP** — décompression via JSZip en mémoire, résolution automatique des chemins

Dans les deux cas, `startImportedPlan(planConfigFile, assetFiles)` dans `main_import.js` orchestre le chargement. Les assets sont enregistrés comme Blob URLs via `RUNTIME_ASSETS` dans `config_import.js`.

---

## 🔄 Convertisseur JSON

Conversion bidirectionnelle entre formats, sans serveur. Accessible via le bouton 🔄 dans l'interface.

| Sens | Entrée | Sortie |
|---|---|---|
| edition → data | `{ editorPoints: [...] }` | `{ type, version, data: [...] }` |
| data → edition | `{ data: [...] }` | `{ type: "devmap-session", editorPoints: [...] }` |

---

## 📦 Générateur de plan (planner.js)

Dépendance : **JSZip** — doit être servi localement (`lib/jszip.min.js`).


---

## 📄 Licence

Projet personnel — libre d'adaptation selon vos besoins non commerciaux.


---

## 📄 Licence

Projet personnel — libre d'adaptation selon vos besoins non commerciale.
