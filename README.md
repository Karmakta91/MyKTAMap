# MyKTAMap
<img width="1345" height="673" alt="image" src="https://github.com/user-attachments/assets/77559b0d-9fb0-49e6-97a8-d9b1f9073d1d" />
> Application web de cartographie terrain — visualisation, annotation et déplacement simulé sur plan image.

**Environnements :**
- 🟢 Production : [myktamap.is-underground.fr](https://myktamap.is-underground.fr)
- 🔧 Développement : [devmap.is-underground.fr](https://devmap.is-underground.fr)

> ⚠️ Les données présentes sur le site de démonstration sont fictives.

---

## 📋 Journal des modifications

### 22/04/2026
- Ajout du mode import local (chargement d'un plan depuis le navigateur sans serveur)

### 19/04/2026
- Le bouton télécharger intègre désormais tous les calques visibles
- Ajout du tracé de routes : Principal / Secondaire / Chemin
- Interface mise à jour avec import/export global de session JSON
- Correction du tracker : intégration de la boussole via `alpha`, `beta`, `gamma`

**Points en cours d'investigation :**
- Erreur d'échelle constatée sur le tracker — possible problème de cooldown (à investiguer)
- Bug d'affichage sur les plans de petites dimensions dans les réglages (bug zoom)

---

## 🧭 Introduction générale

MyKTAMap est une application web permettant de **visualiser, annoter et exploiter un plan** (carrière souterraine, bâtiment, site industriel…) à partir d'une image haute résolution.

L'outil repose sur **[Leaflet](https://leafletjs.com/)** en projection simple (`L.CRS.Simple`), ce qui permet de travailler sur une carte personnalisée **sans coordonnées GPS**.

## Principe fonctionnel et architecture serveur

<img width="1536" height="1024" alt="image" src="https://github.com/user-attachments/assets/4dc6ace2-de02-4bd4-8edd-83fd748ae190" />

### Fonctionnalités principales

| Fonctionnalité | État |
|---|---|
| Affichage du plan (image haute résolution) | ✅ Disponible |
| Gestion de calques et d'icônes | ✅ Disponible |
| Ajout de points d'intérêt | ✅ Disponible |
| Mesure de distances | ✅ Disponible |
| Tracé de routes (Principal / Secondaire / Chemin) | ✅ Disponible |
| Export / import JSON de session | ✅ Disponible |
| Déplacement simulé via capteurs mobile | ⚠️ Expérimental |
| Mode hors-connexion (ServiceWorker) | ⚠️ Désactivé |

> ⚠️ Le ServiceWorker (`sw.js`) est actuellement commenté dans `index.html`. En attendant sa réactivation, charger la webapp sur le téléphone et la laisser en arrière-plan reste la solution recommandée pour une utilisation sous terre.

---

## 🏗️ Architecture applicative

```
index.html / import.html
        │
        ├── config.js          ← Configuration globale (APP_CONFIG, DEFAULT_CONFIG)
        ├── utils.js           ← Fonctions utilitaires (convertCoord, choisirIcone)
        ├── map.js             ← Initialisation Leaflet + calques + collision
        ├── tracking.js        ← Déplacement simulé via capteurs
        ├── measure.js         ← Mesure de distance
        ├── editor.js          ← Ajout de points d'intérêt
        ├── road.js            ← Tracé de routes
        ├── interface.js       ← Construction de l'interface Leaflet
        └── main.js            ← Point d'entrée, orchestration
```

### Résumé des fichiers

| Fichier | Rôle principal |
|---|---|
| `config.js` | Configuration globale (mode fichier local) |
| `config_import.js` *(import)* | Configuration globale en mode import navigateur |
| `utils.js` | Fonctions utilitaires partagées |
| `map.js` | Initialisation de la carte et des calques |
| `map_import.js` *(import)* | Idem, adapté au mode import navigateur |
| `measure.js` | Mesure de distance |
| `tracking.js` | Déplacement simulé et détection de collision |
| `editor.js` | Ajout de points et export JSON |
| `road.js` | Tracé de routes Principal / Secondaire / Chemin |
| `interface.js` | Interface utilisateur Leaflet |
| `main.js` | Initialisation globale (mode fichier local) |
| `main_import.js` *(import)* | Initialisation globale en mode import navigateur |

---

## ⚙️ Configuration — `plan-config.json`

Chaque plan est décrit par un fichier `plan-config.json` qui centralise toutes les informations nécessaires au chargement :

- Les métadonnées du plan (nom, dimensions, auteur)
- L'image de base et la carte de collision
- Les calques image supplémentaires
- Les couches de données JSON
- Les paramètres de tracking
- Les icônes

Cette approche permet de **changer de plan sans modifier le code**.

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
    { "id": "cataphile", "label": "Cataphile","file": "data/cataphile.json", "visible": true },
    { "id": "carry",     "label": "Carrière", "file": "data/carry.json",     "visible": true },
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
    "pe":       "icon/pe.png",
    "track":    "icon/iconetrack.png"
  }
}
```

### Section `plan`

| Clé | Type | Utilité |
|---|---|---|
| `name` | string | Nom affiché dans l'interface |
| `version` | string | Version du plan |
| `author` | string | Auteur ou source de la cartographie |
| `imageWidth` | number | Largeur de l'image en pixels |
| `imageHeight` | number | Hauteur de l'image en pixels |
| `baseImage` | string | Chemin vers l'image principale |
| `collisionImage` | string | Chemin vers l'image de collision (zones interdites) |

### Section `imageLayers`

Liste des calques image superposés au plan principal (légende, annotations visuelles, tracés secondaires…).

| Champ | Utilité |
|---|---|
| `id` | Identifiant interne |
| `label` | Nom affiché dans le contrôle de couches |
| `file` | Chemin vers l'image |
| `visible` | Visibilité au chargement |
| `order` | Ordre de superposition (plus grand = dessus) |

### Section `dataLayers`

Liste des couches de données JSON à charger (points d'intérêt, objets métier).

| Champ | Utilité |
|---|---|
| `id` | Identifiant technique utilisé dans le code |
| `label` | Nom affiché dans le contrôle de couches |
| `file` | Chemin vers le fichier JSON |
| `visible` | Visibilité au chargement |

### Section `tracking`

Paramètres du module de déplacement simulé.

| Clé | Type | Utilité |
|---|---|---|
| `startX` | number | Position X initiale du tracker (pixels) |
| `startY` | number | Position Y initiale du tracker (pixels) |
| `scale` | number | Facteur de conversion pixels → mètres |
| `stepLength` | number | Longueur moyenne d'un pas (mètres) |
| `stepThreshold` | number | Seuil d'accélération pour détecter un pas |
| `stepCooldown` | number | Délai minimum entre deux pas (ms) |

### Section `icons`

Centralise les chemins de toutes les icônes. Permet de changer un set d'icônes sans toucher au code.

| Clé | Correspond à |
|---|---|
| `pa`, `pb`, `pc`, `pe` | Types de puits |
| `salle` | Salles |
| `vehicule` | Véhicules |
| `danger`, `info`, `passage` | Signalétique |
| `elec`, `epure`, `ps` | Infrastructures |
| `chatiere` | Chatières |
| `track` | Icône du marqueur de position |
| `default` | Icône par défaut (fallback) |

---

## 📁 Description des modules

### `config.js`

Centralise les constantes de configuration. Deux objets coexistent :

- `DEFAULT_CONFIG` : valeurs d'origine, jamais modifiées
- `APP_CONFIG` : valeurs actives, éventuellement surchargées par l'utilisateur

```js
const DEFAULT_CONFIG = {
  imageHeight: 610,
  imageWidth: 1044,
  scale: 4.9,
  stepLength: 0.7,
  startX: 345,
  startY: 519,
  stepThreshold: 13,
  stepCooldown: 400,
  motionDebug: false
};

let APP_CONFIG = { ...DEFAULT_CONFIG };
```

Les réglages modifiés via l'interface sont persistés dans le `localStorage` et rechargés à la prochaine session.

---

### `utils.js`

Contient les fonctions partagées entre modules.

#### `convertCoord(x, y)`

Convertit les coordonnées internes du plan (origine en haut à gauche, comme GIMP) vers le système Leaflet (origine en bas à gauche).

```js
function convertCoord(x, y) {
  return [APP_CONFIG.imageHeight - y, x];
}
```

> ⚠️ Si vous utilisez un logiciel autre que GIMP pour relever vos coordonnées, vérifiez l'origine de l'axe Y. Adaptez `imageHeight` en conséquence.

#### `choisirIcone(point)`

Sélectionne l'icône Leaflet appropriée en fonction des tags du point.

```js
function choisirIcone(p) {
  if (!p.tags) return iconeDefault;
  if (p.tags.includes("pa")) return iconepa;
  if (p.tags.includes("vehicule")) return iconeVehicule;
  return iconeDefault;
}
```

---

### `map.js`

Initialise la carte Leaflet et tous ses calques.

**Responsabilités :**
- Créer l'instance `L.map` en mode `L.CRS.Simple`
- Charger l'image principale du plan
- Créer les `L.layerGroup` pour chaque couche de données
- Charger les calques image supplémentaires
- Charger et initialiser la carte de collision

```js
map = L.map('map', {
  crs: L.CRS.Simple,
  minZoom: -2,
  maxBounds: bounds,
  maxBoundsViscosity: 1.0
});
```

#### Carte de collision

L'image de collision est chargée dans un `<canvas>` hors-DOM. Les pixels rouges (`r > 200, g < 50, b < 50`) représentent les zones interdites au déplacement.

---

### `tracking.js`

Gère le déplacement simulé via les capteurs du téléphone (PDR — *Pedestrian Dead Reckoning*).

**Flux de fonctionnement :**
1. `requestPermission()` — demande les permissions capteurs (obligatoire sur iOS 13+)
2. `initOrientation()` — écoute `deviceorientation` pour récupérer le cap
3. `initMotion()` — écoute `devicemotion` pour détecter les pas
4. `avancer()` — calcule la nouvelle position et vérifie la collision
5. `updateMap()` — déplace le marqueur et trace la polyline

#### Calcul du cap (`getHeading`)

La direction de marche est calculée à partir des trois angles de rotation du téléphone (`alpha`, `beta`, `gamma`), ce qui la rend indépendante de l'orientation du téléphone dans la main :

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

> ⚠️ Cette fonctionnalité est **expérimentale**. Elle fonctionne comme aide visuelle, mais ne constitue pas un système de localisation fiable.

#### Recalage manuel

En mode recalage, un clic sur la carte repositionne le marqueur à l'emplacement cliqué et remet la trace à zéro. Utile pour corriger la dérive du PDR.

---

### `measure.js`

Module de mesure de distance.

**Fonctionnement :** en mode mesure actif, chaque clic sur la carte pose un point. Une ligne est tracée entre les points et la distance totale est calculée et affichée.

Le calcul repose sur `APP_CONFIG.scale` pour convertir les pixels en mètres.

---

### `editor.js`

Module d'ajout de points d'intérêt.

En mode édition, un clic sur la carte ouvre un formulaire permettant de saisir :
- Nom du point
- Type (utilisé pour choisir l'icône via les tags)
- Description

Les points sont ajoutés au calque `editor` et peuvent être exportés en JSON.

---

### `road.js`

Module de tracé de routes.

Trois types de tracés disponibles, chacun avec son propre style visuel :

| Type | Description |
|---|---|
| `principal` | Route principale (trait plein, largeur importante) |
| `secondaire` | Route secondaire |
| `chemin` | Chemin ou passage annexe |

Chaque tracé est une liste de points cliqués sur la carte. Les routes sont incluses dans l'export/import de session JSON.

---

### `interface.js`

Construit tous les contrôles Leaflet de l'interface. Chaque bloc fonctionnel est un `L.control` indépendant.

| Bouton | Action |
|---|---|
| ▶️ / ⏹️ | Démarrer / arrêter le tracking |
| 📍 | Activer le mode recalage |
| 📏 | Activer la mesure de distance |
| ❌ | Réinitialiser la mesure |
| 🖼️ | Télécharger le plan |
| ✏️ | Activer le mode ajout de point |
| 🟩 🟪 🟨 | Tracer route principale / secondaire / chemin |
| 🧹 | Réinitialiser les tracés |
| 📂 | Importer une session JSON |
| 💾 | Exporter la session JSON |
| ❓ | Afficher l'aide |
| 🗂️ | Changer de plan |
| ⚙️ | Ouvrir les réglages |

---

### `main.js`

Point d'entrée de l'application. Orchestre le chargement dans le bon ordre :

```
loadAppConfig()
  → initMapFromConfig()
    → initDataFromConfig()
      → map.fitBounds()
      → initEditor()
      → initRoad()
      → initMeasure()
      → initInterface()
      → initTracking()
      → requestPermission()  (au premier clic, pour iOS)
```

---

## 📦 Structure des données JSON

Chaque fichier de données contient un tableau `data` d'objets points :

```json
{
  "data": [
    {
      "id": "PA1",
      "nom": "Puits Aération",
      "x": 4843,
      "y": 2002,
      "tags": ["aeration", "ouvert", "pa"],
      "etat": "Non inspectée",
      "description": "Puits avec courant d'air",
      "profondeur": 12,
      "date_update": "2026-04-03"
    }
  ]
}
```

| Champ | Type | Utilité |
|---|---|---|
| `id` | string | Identifiant unique du point |
| `nom` | string | Nom affiché dans le popup |
| `x`, `y` | number | Coordonnées en pixels (origine haut-gauche, style GIMP) |
| `tags` | array | Détermine l'icône et les filtres possibles |
| `etat` | string | État courant (libre, selon le type d'objet) |
| `description` | string | Texte affiché dans le popup |
| `profondeur` | number | (optionnel) Profondeur en mètres |
| `date_update` | string | Date de dernière mise à jour |

---

## 📍 Gestion des coordonnées

### Problème

- **GIMP** (et la plupart des logiciels image) : origine en **haut à gauche**, axe Y vers le bas
- **Leaflet** (`L.CRS.Simple`) : origine en **bas à gauche**, axe Y vers le haut

### Solution

```js
function convertCoord(x, y) {
  return [APP_CONFIG.imageHeight - y, x];
}
```

> ⚠️ La valeur `imageHeight` doit correspondre exactement à la hauteur en pixels de votre image. Vérifiez-la dans `plan-config.json`.

---

## 🔄 Chargement dynamique des données

Les données JSON sont chargées via `fetch()` au démarrage :

```js
function ajouterPointsDepuisJSON(url, layer) {
  fetch(url)
    .then(res => res.json())
    .then(json => {
      json.data.forEach(p => {
        const marker = L.marker(convertCoord(p.x, p.y), {
          icon: choisirIcone(p)
        });

        marker.bindPopup(
          "<b>" + p.nom + "</b><br>" +
          (p.description || "")
        );

        marker.addTo(layer);
      });
    });
}
```

En mode import navigateur, les fichiers JSON sont lus depuis les `File` sélectionnés par l'utilisateur, convertis en Blob URLs, puis passés à la même fonction.

---

## 🗂️ Mode import navigateur

Ce mode permet de charger un plan complet depuis le navigateur, sans serveur web ni accès réseau.

**Procédure :**
1. Ouvrir la page d'import
2. Sélectionner le fichier `plan-config.json`
3. Sélectionner tous les fichiers associés (images, JSONs)
4. Cliquer sur **Charger le plan**

L'application résout automatiquement les chemins définis dans `plan-config.json` en cherchant les fichiers par nom parmi ceux sélectionnés. Les images sont converties en Blob URLs temporaires pour l'affichage.

---

## 📄 Licence

Projet personnel — libre d'adaptation selon vos besoins.
