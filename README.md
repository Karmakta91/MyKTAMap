# MyKTAMap
<img width="1390" height="966" alt="image" src="https://github.com/user-attachments/assets/11b4f935-d41f-4e19-aa24-601e1d46db87" />

<h1>🗺️ Documentation du projet</h1>

<h2>🧭 Introduction générale</h2>

<p>
Ce projet est une application web permettant de <strong>visualiser, annoter et exploiter un plan de carrière</strong>
(ou tout autre environnement cartographié) à partir d’une image.
</p>

<p>
L’outil repose sur <strong>Leaflet</strong> en projection simple (<code>L.CRS.Simple</code>) et permet de travailler
sur une carte personnalisée sans utiliser de coordonnées GPS classiques.
</p>

<p>Les objectifs principaux sont les suivants :</p>

<ul>
  <li>Afficher un plan sous forme d’image haute résolution</li>
  <li>Ajouter et consulter des points d’intérêt</li>
  <li>Mesurer des distances directement sur le plan</li>
  <li>Simuler un déplacement via les capteurs du téléphone</li>
  <li>Exporter les données créées ou mesurées</li>
</ul>

<p>
L’application est pensée pour une utilisation <strong>terrain</strong>, y compris sur mobile.
</p>

<p>
⚠️ La fonctionnalité de localisation basée sur les capteurs du téléphone est actuellement
<strong>en cours de développement</strong> et ne doit pas être considérée comme fiable en l’état.
</p>

<hr>

<h2>📁 Description des scripts du dossier <code>js/</code></h2>

<h3><code>config.js</code></h3>

<p>
Ce fichier centralise les <strong>constantes et paramètres de configuration</strong> de l’application.
</p>

<p>Il contient notamment :</p>

<ul>
  <li>les dimensions du plan</li>
  <li>l’échelle de conversion pixels / mètres</li>
  <li>la taille d’un pas simulé</li>
  <li>la position initiale du tracker</li>
  <li>les paramètres de détection de mouvement</li>
</ul>

<p>
Deux objets y sont utilisés :
</p>

<ul>
  <li><code>DEFAULT_CONFIG</code> : valeurs d’origine</li>
  <li><code>APP_CONFIG</code> : valeurs effectivement utilisées par l’application</li>
</ul>

<p>
Cela permet de modifier certains réglages sans perdre les valeurs par défaut.
</p>

<hr>

<h3><code>utils.js</code></h3>

<p>
Ce fichier contient les <strong>fonctions utilitaires communes</strong>.
</p>

<p>
La fonction principale est <code>convertCoord(x, y)</code>, qui convertit les coordonnées internes
du plan vers le système utilisé par Leaflet.
</p>

<p>
Cette conversion est nécessaire car l’origine et l’axe Y d’une image classique
ne correspondent pas directement à ceux de Leaflet.
</p>

<hr>

<h3><code>map.js</code></h3>

<p>
Ce fichier gère l’<strong>initialisation de la carte</strong>.
</p>

<p>Il s’occupe notamment de :</p>

<ul>
  <li>créer l’instance Leaflet</li>
  <li>définir les limites du plan</li>
  <li>charger l’image principale du plan</li>
  <li>créer les différents calques de données</li>
  <li>charger la carte de collision (image invisible utilisée pour les zones interdites)</li>
</ul>

<p>
C’est le fichier qui pose les fondations de toute l’application.
</p>

<hr>

<h3><code>measure.js</code></h3>

<p>
Ce fichier gère le <strong>module de mesure de distance</strong>.
</p>

<p>Il permet de :</p>

<ul>
  <li>activer un mode mesure</li>
  <li>poser plusieurs points sur la carte</li>
  <li>tracer une ligne entre ces points</li>
  <li>calculer la distance totale</li>
  <li>réinitialiser la mesure</li>
  <li>exporter le tracé au format JSON</li>
</ul>

<p>
Le calcul repose sur l’échelle définie dans <code>APP_CONFIG</code>, ce qui permet de comparer
les résultats avec des mesures réelles ou d’autres outils.
</p>

<hr>

<h3><code>tracking.js</code></h3>

<p>
Ce fichier gère le <strong>module de déplacement simulé</strong>.
</p>

<p>Son rôle est de :</p>

<ul>
  <li>écouter les capteurs du téléphone</li>
  <li>détecter les mouvements assimilés à des pas</li>
  <li>récupérer l’orientation</li>
  <li>déplacer un marqueur sur la carte</li>
  <li>dessiner la trace du déplacement</li>
  <li>empêcher le passage dans certaines zones grâce à la carte de collision</li>
  <li>permettre un recalage manuel</li>
</ul>

<p>
Cette partie du projet est expérimentale. Elle fonctionne comme une aide visuelle
et un support de recherche, mais pas comme un système de localisation fiable.
</p>

<hr>

<h3><code>editor.js</code></h3>

<p>
Ce fichier gère le <strong>mode édition</strong>.
</p>

<p>Il permet :</p>

<ul>
  <li>d’activer un mode d’ajout de point</li>
  <li>de cliquer sur la carte pour ouvrir un formulaire</li>
  <li>de renseigner un nom, un type et une description</li>
  <li>d’ajouter le point à la carte</li>
  <li>d’exporter les points créés au format JSON</li>
</ul>

<p>
Il sert donc à enrichir progressivement la carte avec de nouvelles informations.
</p>

<hr>

<h3><code>interface.js</code></h3>

<p>
Ce fichier centralise la <strong>construction de l’interface utilisateur</strong>.
</p>

<p>Il crée les boutons Leaflet organisés en plusieurs blocs fonctionnels, par exemple :</p>

<ul>
  <li>tracking</li>
  <li>mesure</li>
  <li>édition</li>
  <li>téléchargement du plan</li>
  <li>aide</li>
  <li>réglages</li>
</ul>

<p>
Son rôle est d’éviter de disperser la logique d’interface dans plusieurs fichiers.
</p>

<hr>

<h3><code>main.js</code></h3>

<p>
Ce fichier joue le rôle de <strong>point d’entrée</strong> de l’application.
</p>

<p>Il s’occupe notamment de :</p>

<ul>
  <li>charger les données JSON existantes</li>
  <li>initialiser les différents modules</li>
  <li>définir la vue de départ</li>
  <li>gérer certaines permissions nécessaires sur mobile</li>
</ul>

<p>
C’est lui qui lance l’ensemble de l’application une fois les scripts disponibles.
</p>

<hr>

<h2>🧠 Résumé de l’architecture</h2>

<table>
  <thead>
    <tr>
      <th>Fichier</th>
      <th>Rôle principal</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td><code>config.js</code></td>
      <td>Configuration globale</td>
    </tr>
    <tr>
      <td><code>utils.js</code></td>
      <td>Fonctions utilitaires</td>
    </tr>
    <tr>
      <td><code>map.js</code></td>
      <td>Initialisation de la carte et des calques</td>
    </tr>
    <tr>
      <td><code>measure.js</code></td>
      <td>Mesure de distance</td>
    </tr>
    <tr>
      <td><code>tracking.js</code></td>
      <td>Déplacement simulé et collision</td>
    </tr>
    <tr>
      <td><code>editor.js</code></td>
      <td>Ajout de points et export JSON</td>
    </tr>
    <tr>
      <td><code>interface.js</code></td>
      <td>Interface utilisateur</td>
    </tr>
    <tr>
      <td><code>main.js</code></td>
      <td>Initialisation globale</td>
    </tr>
  </tbody>
</table>

<hr>

<h2>🚧 État actuel</h2>

<ul>
  <li>✅ Affichage du plan</li>
  <li>✅ Gestion de calques et d’icônes</li>
  <li>✅ Ajout de points d’intérêt</li>
  <li>✅ Export JSON</li>
  <li>✅ Mesure de distance</li>
  <li>✅ Interface dédiée</li>
  <li>⚠️ Localisation / tracking en cours de développement</li>
</ul>

<p>
La base est fonctionnelle, modulaire et évolutive, avec une architecture pensée pour permettre
des améliorations progressives.
</p>
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

## 📄 Licence

Projet personnel – à adapter selon vos besoins.
