# MyKTAMap
<img width="1390" height="966" alt="image" src="https://github.com/user-attachments/assets/11b4f935-d41f-4e19-aa24-601e1d46db87" />


Outil d'annotation pour cavité souterraine 

# 🗺️ Projet Cartographie – Documentation

🧭 Introduction

Ce projet est une application web permettant de visualiser, annoter et explorer un plan de carrière (ou tout autre environnement cartographié) à partir d’une image.

L’outil repose sur la librairie Leaflet et fonctionne avec un système de coordonnées personnalisé (projection simple), ce qui permet de :

afficher un plan (image géoréférencée en coordonnées locales)
positionner des points d’intérêt (POI)
mesurer des distances directement sur le plan
simuler un déplacement basé sur les capteurs du téléphone (accéléromètre + boussole)
exporter les données (points, tracés)
🎯 Objectifs de l’outil

Cet outil a été conçu pour :

🗺️ Explorer un plan de carrière
📍 Ajouter et gérer des points d’intérêt
📏 Mesurer des distances manuellement
🚶 Simuler un déplacement en environnement souterrain
💾 Exporter des données pour analyse ou archivage

⚠️ La fonctionnalité de localisation via capteurs est actuellement en cours de développement et reste expérimentale.

🧱 Architecture du projet (JS)

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

Le dossier js/ contient l’ensemble de la logique de l’application.
Chaque fichier a un rôle précis.

⚙️ config.js
Rôle

Centralise toutes les constantes du projet.

Contenu
Dimensions du plan (imageHeight, imageWidth)
Échelle (scale)
Taille d’un pas (stepLength)
Position initiale (startX, startY)
Paramètres de détection de mouvement :
stepThreshold
stepCooldown
motionDebug
Fonctionnement
DEFAULT_CONFIG → valeurs d’origine
APP_CONFIG → valeurs modifiables en temps réel
Sauvegarde via localStorage

👉 Permet de calibrer l’application sans modifier le code.

🧰 utils.js
Rôle

Fonctions utilitaires communes.

Fonction principale
convertCoord(x, y)

Permet de convertir les coordonnées internes (type GIMP/image) vers le système Leaflet.

👉 Important : inverse l’axe Y pour correspondre à l’image.

🗺️ map.js
Rôle

Initialise la carte et les couches.

Contenu
Création de la carte Leaflet (L.map)
Chargement du plan (image overlay)
Définition des bounds
Création des layers :
puits
véhicules
cataphiles
carrières
Chargement de la map de collision (canvas invisible)
Particularité

Utilise :

crs: L.CRS.Simple

👉 projection personnalisée (pas de coordonnées GPS)

📏 measure.js
Rôle

Gérer la mesure de distance sur le plan.

Fonctionnalités
Mode mesure (activation via interface)
Ajout de points par clic
Tracé d’une polyligne
Calcul de distance basé sur l’échelle
Affichage en temps réel
Reset de la mesure
Export JSON du tracé
Fonction clé
calculDistance()

👉 convertit les pixels en mètres via APP_CONFIG.scale

🚶 tracking.js
Rôle

Simuler un déplacement dans la carte à partir des capteurs du téléphone.

Fonctionnalités
Détection d’orientation (deviceorientation)
Détection de mouvement (devicemotion)
Estimation de pas via accéléromètre
Déplacement du marqueur
Gestion des collisions (zones interdites)
Recalage manuel via clic
Affichage du tracé
Fonctionnement
Détection d’un “pas”
Calcul de direction
Déplacement en fonction :
de la taille du pas
de l’échelle
Vérification collision
Mise à jour carte
Limites

⚠️ Système expérimental :

sensible au bruit
dépend du téléphone
nécessite calibration
✏️ editor.js
Rôle

Permet d’ajouter des points d’intérêt (POI).

Fonctionnalités
Activation du mode édition
Clic sur carte → ouverture d’un formulaire
Saisie :
nom
type
description
Création d’un objet JSON
Ajout d’un marker sur la carte
Export des points créés
🧩 interface.js
Rôle

Gérer toute l’interface utilisateur Leaflet.

Fonctionnalités
Création des boutons (contrôles Leaflet)
Organisation en blocs :
Tracking
Mesure
Plan (download)
Édition
Réglages ⚙️
Aide ❓
Ouverture de popups :
aide
configuration
Importance

👉 centralise toute l’UI → évite la dispersion dans les autres fichiers

🚀 main.js
Rôle

Point d’entrée de l’application.

Fonctionnalités
Chargement des données JSON
Initialisation :
carte
tracking
mesure
édition
interface
Gestion des permissions capteurs (iOS)
🧠 Résumé de l’architecture
Fichier	Rôle principal
config.js	Configuration globale
utils.js	Fonctions utilitaires
map.js	Initialisation carte
measure.js	Outil de mesure
tracking.js	Déplacement / capteurs
editor.js	Ajout de points
interface.js	Interface utilisateur
main.js	Initialisation globale
🔧 État actuel du projet

✔️ Visualisation du plan
✔️ Ajout de points
✔️ Mesure de distance
✔️ Export JSON
✔️ Interface complète
✔️ Configuration dynamique

⚠️ Tracking :

fonctionnel mais non fiable
nécessite calibration terrain
en cours d’amélioration
🚧 Améliorations futures possibles
calibration automatique de l’échelle
amélioration détection de pas
correction des dérives
snapping intelligent dans les galeries
export combiné (points + tracé)
interface mobile optimisée

## 
## ⚙️ Fonctionnement global 

### 1. Initialisation de la carte

La carte est initialisée avec Leaflet en mode image :

👉 L’image est positionnée avec des coordonnées fixes récupéré sur GIMP.
ATTENTION a a la fonction qui corrige l'inversion de l'axe Y telle que Y=Ymax-Y si vousc utiliser un autre programme



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
 "icons": {
    "default": "icon/iconetrack.png",
    "salle": "icon/house.png",
    "pa": "icon/pa.png",
    "pc": "icon/pc.png",
    "pb": "icon/pb.png",
    "vehicule": "icon/vehicule.png",
    "elec": "icon/elec.png",
    "epure": "icon/epure.png",
    "ps": "icon/ps.png",
    "info": "icon/info.png",
    "chatiere": "icon/chatiere.png",
    "passage": "icon/passage.png",
    "danger": "icon/danger.png",
    "pe": "icon/pe.png",
    "track": "icon/iconetrack.png"
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


## 🧠 Conclusion

Ce projet repose sur 3 concepts clés :

1. **Leaflet + image overlay**
2. **Données JSON dynamiques**
3. **Gestion des calques interactifs**

👉 L’ensemble permet de créer une cartographie personnalisée flexible et évolutive.

---

## 📄 Licence

Projet personnel – à adapter selon vos besoins.
