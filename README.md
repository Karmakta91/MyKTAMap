# MyKTAMap
<img width="770" height="526" alt="image" src="https://github.com/user-attachments/assets/c1413a82-a0f0-42c8-bef2-225a3f60d4bc" />

Outil d'annotation pour cavité souterraine 

# 🗺️ Projet Cartographie – Documentation

## 📌 Objectif

Ce projet permet d’afficher une carte personnalisée (image) avec des points interactifs (puits, salles, objets, etc.) en utilisant **Leaflet.js** et des données dynamiques stockées en **JSON**.

---

## 🧱 Architecture du projet

```
/project
│── index.html
│── css/
│   └── style.css
│── js/
│   └── main.js
│   └── map.js
│   └── util.js
│   └── tracking.js
│   └── interface.js
│   └── editor.js
│   └── measure.js
│   └── config.js
│   └── sw.js
│── data/
│   └── puit.json
│   └── vehicule.json
│   └── carry.json
│   └── cataphile.json
│   └── plan-config.json
│   └── TestMAP.png
    └── TestMAP_LEGENDE.png
    └── collision.png
│── icon/
│   └── pa.png
│   └── pb.png
│   └── epure.png
│   └── danger.png
│   └── info.png
│   └── pe.png
│   └── voiture.png
│── lib/
│   └── leaflet/
```

---

## ⚙️ Fonctionnement global 

### 1. Initialisation de la carte

La carte est initialisée avec Leaflet en mode image :

```js
var map = L.map('map', {
  crs: L.CRS.Simple,
  minZoom: -2
});
```

👉 On utilise `L.CRS.Simple` car il ne s'agit pas d'une carte GPS mais d'une image personnalisée.

---


👉 L’image est positionnée avec des coordonnées fixes récupéré sur GIMP.
ATTENTION a a la fonction qui corrige l'inversion de l'axe Y telle que Y=Ymax-Y si vousc utiliser un autre programme

---

### 3. Gestion des calques (layers)

Chaque type d’objet est placé dans un calque :

```js
var layerPuits = L.layerGroup().addTo(map);
var layerVehicule = L.layerGroup().addTo(map);
```

👉 Cela permet d’activer/désactiver l’affichage via un contrôle :

```js
L.control.layers(null, overlays).addTo(map);
```

---

## 📍 Gestion des coordonnées

### Problème

* GIMP → origine en haut à gauche
* Leaflet → origine en bas à gauche

### Solution
adapter la constante a votre Y max de votre plan

```js
function convertCoord(x, y) {
  const hauteur = 6105;
  return [hauteur - y, x];
}
```

👉 On inverse l’axe Y pour correspondre au système Leaflet.

---

## 📦 Structure des données JSON

Exemple :

```json
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
```

---

## 🔄 Chargement dynamique des données

Les données sont chargées via `fetch()` :

```js
function ajouterPointsDepuisJSON(url, layer) {
  fetch(url)
    .then(res => res.json())
    .then(json => {
      json.data.forEach(p => {
        var marker = L.marker(convertCoord(p.x, p.y), {
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

---

## 🎨 Gestion des icônes

Les icônes sont définies en amont dans le plan-config.js:

```json
 "imageLayers": [
    {
      "id": "legende",
      "label": "Legende",
      "file": "data/TestMAP_LEGENDE.png",
      "visible": true,
      "order": 10
    }
```

Puis sélectionnées dynamiquement depuis util.js :

```js
function choisirIcone(p) {
  if (!p.tags) return iconeDefault;
  if (p.tags.includes("pa")) return iconepa;
  if (p.tags.includes("vehicule")) return iconeVehicule;
  return iconeDefault;
}
```

---
##  Tracking
[En cours de DEV]
Via l’accélérometre, permet de donnée une position aproximative dans la cavité.

## Ajout de point / Export
Permet ajouter des nouveaux point (curiosité)

## Mesure de distance
Porté par le fichier measure.js
Permet de selectionner une suite de point et de calculer en metre la distance.
Basé sur la constance d’echelle Xpixel=1 metre

-------------------------------------------------------------------------------------------------------------------------
## 🚀 Évolutions possibles

* recherche de points
* import de point
---

## 🧠 Conclusion

Ce projet repose sur 3 concepts clés :

1. **Leaflet + image overlay**
2. **Données JSON dynamiques**
3. **Gestion des calques interactifs**

👉 L’ensemble permet de créer une cartographie personnalisée flexible et évolutive.

---

## 📄 Licence

Projet personnel – à adapter selon vos besoins.
