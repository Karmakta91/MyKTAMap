# MyKTAMap
<img width="1390" height="966" alt="image" src="https://github.com/user-attachments/assets/11b4f935-d41f-4e19-aa24-601e1d46db87" />

<h1>https://devmap.is-underground.fr/</h1>
!! Ne contient aucune DATA réel, donnée de principe !!

!! Service Worker en commentaire du a des latance dans index.html !!
!! Debug en cours !!
!! Pour du Horsligne, ouvrir l'application avant de perdre la conection et la garder en background !!

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

<hr>

<h2>⚙️ Configuration de l’application</h2>
<hr>

<h2>🗂️ Configuration avancée du plan : <code>plan-config.json</code></h2>

<p>
En complément de <code>config.js</code>, le projet peut utiliser un fichier dédié au <strong>chargement complet d’un plan</strong>.
</p>

<p>
L’objectif de <code>plan-config.json</code> est de centraliser, dans une seule structure, toutes les informations nécessaires
pour charger un plan donné :
</p>

<ul>
  <li>les métadonnées du plan</li>
  <li>l’image de base</li>
  <li>la carte de collision</li>
  <li>les calques image supplémentaires</li>
  <li>les couches de données JSON</li>
  <li>les paramètres de tracking</li>
  <li>les icônes à utiliser</li>
</ul>

<p>
Cette approche permet d’adapter l’application à plusieurs plans sans devoir modifier directement le code métier.
</p>

<h3>Exemple de structure</h3>

<pre><code>{
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
    {
      "id": "puits",
      "label": "Puits",
      "file": "data/puit.json",
      "visible": true
    },
    {
      "id": "vehicule",
      "label": "Vehicule",
      "file": "data/vehicule.json",
      "visible": true
    },
    {
      "id": "cataphile",
      "label": "Cataphile",
      "file": "data/cataphile.json",
      "visible": true
    },
    {
      "id": "carry",
      "label": "Carriére",
      "file": "data/carry.json",
      "visible": true
    },
    {
      "id": "editor",
      "label": "Ajouts",
      "file": "data/editor.json",
      "visible": true
    }
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
}</code></pre>

<h3>Rôle de <code>plan-config.js</code></h3>

<p>
Le fichier <code>plan-config.js</code> a pour rôle de :
</p>

<ul>
  <li>charger ce JSON de configuration</li>
  <li>rendre ses valeurs accessibles au reste de l’application</li>
  <li>alimenter les modules <code>map.js</code>, <code>tracking.js</code>, <code>editor.js</code> et <code>interface.js</code></li>
</ul>

<p>
En pratique, il sert de <strong>pont entre un plan donné et le moteur de l’application</strong>.
</p>

<h3>Section <code>plan</code></h3>

<p>
La section <code>plan</code> décrit les informations générales du plan.
</p>

<table>
  <thead>
    <tr>
      <th>Clé</th>
      <th>Utilité</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td><code>name</code></td>
      <td>Nom du plan affiché ou utilisé comme référence.</td>
    </tr>
    <tr>
      <td><code>version</code></td>
      <td>Version du plan.</td>
    </tr>
    <tr>
      <td><code>author</code></td>
      <td>Auteur ou source de la cartographie.</td>
    </tr>
    <tr>
      <td><code>imageWidth</code></td>
      <td>Largeur de l’image principale en pixels.</td>
    </tr>
    <tr>
      <td><code>imageHeight</code></td>
      <td>Hauteur de l’image principale en pixels.</td>
    </tr>
    <tr>
      <td><code>baseImage</code></td>
      <td>Chemin vers l’image principale du plan.</td>
    </tr>
    <tr>
      <td><code>collisionImage</code></td>
      <td>Chemin vers l’image de collision utilisée pour bloquer les déplacements.</td>
    </tr>
  </tbody>
</table>

<p>
Cette section est utilisée principalement par <code>map.js</code> et par les fonctions de conversion de coordonnées.
</p>

<h3>Section <code>imageLayers</code></h3>

<p>
Cette section contient la liste des <strong>calques image supplémentaires</strong> qui peuvent être affichés par-dessus le plan principal.
</p>

<p>
Exemple : légende, calque d’aide, tracé secondaire, annotations visuelles.
</p>

<p>Chaque objet contient :</p>

<ul>
  <li><code>id</code> : identifiant interne</li>
  <li><code>label</code> : nom affiché dans l’interface</li>
  <li><code>file</code> : image à charger</li>
  <li><code>visible</code> : état initial du calque</li>
  <li><code>order</code> : ordre d’affichage</li>
</ul>

<p>
Le champ <code>order</code> permet de définir la superposition des couches, comme dans un logiciel de retouche ou un SIG.
</p>

<h3>Section <code>dataLayers</code></h3>

<p>
Cette section liste les <strong>couches de données JSON</strong> à charger.
</p>

<p>
Chaque couche correspond à un ensemble d’objets métier :
</p>

<ul>
  <li>puits</li>
  <li>véhicules</li>
  <li>cataphiles</li>
  <li>zones ou objets de carrière</li>
  <li>ajouts réalisés par l’utilisateur</li>
</ul>

<p>Chaque entrée contient :</p>

<ul>
  <li><code>id</code> : identifiant technique</li>
  <li><code>label</code> : nom visible dans l’interface</li>
  <li><code>file</code> : chemin vers le fichier JSON</li>
  <li><code>visible</code> : état initial</li>
</ul>

<p>
Cette partie permet de rendre le chargement des données beaucoup plus modulaire.
</p>

<h3>Section <code>tracking</code></h3>

<p>
Cette section regroupe les <strong>paramètres liés au déplacement simulé</strong>.
</p>

<table>
  <thead>
    <tr>
      <th>Clé</th>
      <th>Utilité</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td><code>startX</code></td>
      <td>Position initiale X du tracker.</td>
    </tr>
    <tr>
      <td><code>startY</code></td>
      <td>Position initiale Y du tracker.</td>
    </tr>
    <tr>
      <td><code>scale</code></td>
      <td>Échelle utilisée pour convertir les pixels en distance réelle.</td>
    </tr>
    <tr>
      <td><code>stepLength</code></td>
      <td>Longueur moyenne d’un pas en mètres.</td>
    </tr>
    <tr>
      <td><code>stepThreshold</code></td>
      <td>Seuil de détection du mouvement assimilé à un pas.</td>
    </tr>
    <tr>
      <td><code>stepCooldown</code></td>
      <td>Temps minimal entre deux pas détectés.</td>
    </tr>
  </tbody>
</table>

<p>
Cette partie est utilisée par <code>tracking.js</code> pour initialiser et régler le comportement du tracker.
</p>

<h3>Section <code>icons</code></h3>

<p>
La section <code>icons</code> centralise les chemins de toutes les icônes utilisées par l’application.
</p>

<p>
Cela permet :
</p>

<ul>
  <li>d’éviter les chemins codés en dur dans plusieurs fichiers</li>
  <li>de changer un set d’icônes plus facilement</li>
  <li>d’adapter rapidement l’interface à un autre plan ou un autre style</li>
</ul>

<p>
Chaque clé correspond à un type logique d’objet :
</p>

<ul>
  <li><code>pa</code>, <code>pb</code>, <code>pc</code>, <code>pe</code> pour les puits</li>
  <li><code>salle</code> pour les salles</li>
  <li><code>vehicule</code> pour les véhicules</li>
  <li><code>danger</code>, <code>info</code>, <code>passage</code>, etc.</li>
  <li><code>track</code> pour l’icône du tracker</li>
</ul>

<h3>Fonctionnement global</h3>

<p>
Le rôle de <code>plan-config.js</code> est donc de lire ce fichier de configuration et de distribuer les informations
vers les autres modules.
</p>

<p>En pratique, cela permet de :</p>

<ul>
  <li>changer de plan sans modifier les scripts métier</li>
  <li>charger automatiquement les bonnes images et les bons JSON</li>
  <li>adapter les paramètres de tracking à chaque cartographie</li>
  <li>gérer plusieurs versions ou variantes d’un même plan</li>
</ul>

<h3>Intérêt de cette approche</h3>

<p>
Cette architecture permet de séparer clairement :
</p>

<ul>
  <li>le <strong>moteur de l’application</strong></li>
  <li>la <strong>configuration d’un plan donné</strong></li>
</ul>

<p>
Autrement dit :
</p>

<ul>
  <li>les scripts gèrent le fonctionnement</li>
  <li>le JSON de plan décrit le contenu à charger</li>
</ul>

<p>
Cela rend le projet plus modulaire, plus maintenable et plus facilement réutilisable.
</p>
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
<p>
L’application repose sur un système de configuration centralisé, chargé depuis le fichier
<code>config.js</code>.
</p>

<p>
Ce fichier contient les <strong>valeurs de référence</strong> utilisées par les différents modules
de l’application, notamment :
</p>

<ul>
  <li>la taille du plan</li>
  <li>l’échelle de conversion</li>
  <li>la taille d’un pas</li>
  <li>la position initiale du tracker</li>
  <li>les paramètres de détection de mouvement</li>
</ul>

<h3>Structure générale</h3>

<p>
Le système de configuration repose sur deux objets :
</p>

<ul>
  <li><code>DEFAULT_CONFIG</code> : contient les valeurs d’origine du projet</li>
  <li><code>APP_CONFIG</code> : contient les valeurs réellement utilisées par l’application</li>
</ul>

<p>
Cela permet de modifier la configuration en cours d’utilisation sans perdre les valeurs par défaut.
</p>

<h3>Exemple de configuration</h3>

<pre><code>const DEFAULT_CONFIG = {
  imageHeight: 6105,
  imageWidth: 10441,
  scale: 5.4,
  stepLength: 0.7,
  startX: 560,
  startY: 2891,
  stepThreshold: 13,
  stepCooldown: 400,
  motionDebug: false
};

let savedConfig = localStorage.getItem("app_config");
let APP_CONFIG = savedConfig ? JSON.parse(savedConfig) : { ...DEFAULT_CONFIG };</code></pre>

<h3>Description des paramètres</h3>

<table>
  <thead>
    <tr>
      <th>Clé</th>
      <th>Utilité</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td><code>imageHeight</code></td>
      <td>Hauteur du plan en pixels. Utilisée notamment pour convertir les coordonnées Y.</td>
    </tr>
    <tr>
      <td><code>imageWidth</code></td>
      <td>Largeur du plan en pixels.</td>
    </tr>
    <tr>
      <td><code>scale</code></td>
      <td>Échelle utilisée pour convertir les déplacements ou mesures entre pixels et mètres.</td>
    </tr>
    <tr>
      <td><code>stepLength</code></td>
      <td>Longueur moyenne d’un pas, exprimée en mètres.</td>
    </tr>
    <tr>
      <td><code>startX</code></td>
      <td>Coordonnée X initiale du tracker.</td>
    </tr>
    <tr>
      <td><code>startY</code></td>
      <td>Coordonnée Y initiale du tracker.</td>
    </tr>
    <tr>
      <td><code>stepThreshold</code></td>
      <td>Seuil utilisé pour détecter un mouvement assimilable à un pas.</td>
    </tr>
    <tr>
      <td><code>stepCooldown</code></td>
      <td>Temps minimal entre deux pas détectés, en millisecondes.</td>
    </tr>
    <tr>
      <td><code>motionDebug</code></td>
      <td>Active ou non les logs de debug liés à la détection de mouvement.</td>
    </tr>
  </tbody>
</table>

<h3>Fonctionnement</h3>

<p>
Au démarrage, l’application vérifie si une configuration utilisateur a été sauvegardée dans le
<code>localStorage</code>.
</p>

<ul>
  <li>Si oui, elle charge cette configuration</li>
  <li>Sinon, elle utilise les valeurs par défaut</li>
</ul>

<p>
Cette logique permet de conserver les réglages personnalisés entre deux sessions.
</p>

<h3>Réglages dans l’interface</h3>

<p>
Une interface de réglage est accessible via un bouton dédié dans l’application.
Elle permet de modifier dynamiquement certaines valeurs sans toucher au code source.
</p>

<p>
Les paramètres modifiables sont notamment :
</p>

<ul>
  <li>l’échelle</li>
  <li>la taille d’un pas</li>
  <li>la taille du plan</li>
  <li>la position initiale du tracker</li>
  <li>les seuils de détection de mouvement</li>
</ul>

<p>
Deux actions sont disponibles :
</p>

<ul>
  <li><strong>Appliquer</strong> : enregistre les nouvelles valeurs dans <code>APP_CONFIG</code> et dans le <code>localStorage</code></li>
  <li><strong>Reset</strong> : restaure les valeurs de <code>DEFAULT_CONFIG</code></li>
</ul>

<h3>Impact sur les modules</h3>

<p>
La configuration est utilisée dans plusieurs parties du projet :
</p>

<ul>
  <li><strong>utils.js</strong> : conversion des coordonnées</li>
  <li><strong>tracking.js</strong> : position initiale, longueur de pas, détection de mouvement</li>
  <li><strong>measure.js</strong> : calcul de distance</li>
  <li><strong>map.js</strong> : cohérence avec les dimensions du plan</li>
</ul>

<p>
La configuration joue donc un rôle central dans la cohérence du projet.
</p>

<h3>Objectif de cette approche</h3>

<p>
L’intérêt de ce système est de pouvoir :
</p>

<ul>
  <li>adapter facilement l’application à un autre plan</li>
  <li>ajuster les paramètres sans recoder</li>
  <li>calibrer les outils de mesure et de déplacement</li>
  <li>tester rapidement plusieurs réglages sur le terrain</li>
</ul>

<p>
Cette architecture permet de garder un projet souple, facilement modifiable et plus maintenable.
</p>


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
