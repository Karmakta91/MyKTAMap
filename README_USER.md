# MyKTAMap — Guide Utilisateur

> Ce guide est destiné aux utilisateurs de l'application. Il explique comment utiliser chaque fonction, comment préparer votre téléphone pour une sortie terrain, et rappelle les règles essentielles concernant la discrétion des données.

---

## 🔴 Avertissements importants

### Confidentialité des données — à lire en premier

MyKTAMap est un outil de cartographie de terrain qui peut contenir des informations sensibles : **localisation précise d'entrées, de puits, de passages, de structures souterraines.**

Ces données, si elles étaient rendues publiques, pourraient :

- Faciliter l'accès de personnes non averties à des lieux dangereux
- Provoquer une sur-fréquentation qui dégrade ces espaces fragiles
- Exposer les utilisateurs à des poursuites légales
- Mettre en danger des personnes non équipées

**Règles à respecter absolument :**

- Ne jamais partager les fichiers de données (`data/*.json`) en dehors de votre groupe de confiance
- Ne jamais publier de captures d'écran montrant des coordonnées ou des localisations précises
- Ne jamais laisser l'application ouverte et visible sur un appareil accessible à des tiers


> Ces lieux appartiennent à leur histoire. Leur préservation dépend de la discrétion de ceux qui les fréquentent.

---

### ⚠️ Avertissement sur le tracker de position

Le module de déplacement simulé est **expérimental**. Il repose sur les capteurs inertiels du téléphone (accéléromètre + gyroscope) pour estimer votre position sans GPS — technique appelée **PDR (Pedestrian Dead Reckoning)**.

**Limites à connaître avant utilisation :**

- La dérive s'accumule avec le temps : plus vous marchez, plus l'erreur grandit
- La précision varie fortement selon les téléphones et la façon de tenir l'appareil
- Les changements d'altitude (escaliers, échelles, puits) ne sont pas pris en compte
- Le tracker **ne remplace pas** une boussole physique, un fil d'Ariane ou une carte papier
- En souterrain, ne faites jamais confiance à votre seul téléphone pour vous localiser

**Le tracker est une aide visuelle, pas un système de navigation fiable.**

Utilisez toujours le **recalage manuel** (bouton 📍) dès que vous identifiez un repère connu sur le plan. En cas de doute sur votre position, arrêtez-vous et reprenez à pied depuis un point certain.

**Pour toute sortie souterraine, emportez toujours :**
- Une carte papier ou une version imprimée du plan
- Une boussole physique
- Une lampe frontale avec piles de rechange

---

## 🚀 Premiers pas

### Charger un plan

Au démarrage, l'application vous propose de charger un plan. Deux méthodes sont disponibles :

**📁 Fichiers séparés**
Sélectionnez d'abord le fichier `plan-config.json`, puis tous les fichiers associés (images `.png`, données `.json`, icônes). Cette méthode est utile si vous gérez vos fichiers manuellement.

**📦 Archive ZIP**
Sélectionnez une archive `.zip` contenant l'ensemble des fichiers du plan. C'est la méthode recommandée : un seul fichier à transmettre et à ouvrir. Glissez-déposez le ZIP sur la zone prévue, ou cliquez pour le sélectionner.

### Utilisation hors connexion

MyKTAMap est conçu pour fonctionner **sans connexion Internet** une fois le plan chargé. En souterrain, là où aucun réseau n'est disponible, l'application continue de fonctionner normalement.

**Pour préparer une sortie hors connexion :**

1. Ouvrez l'application **avant de partir**, avec une connexion disponible
2. Chargez votre plan complet (ZIP ou fichiers séparés)
3. Une fois le plan affiché, **laissez l'onglet ouvert** sur votre téléphone — ne le fermez pas
4. Passez en mode avion ou entrez en zone sans réseau : l'application reste fonctionnelle
5. Si vous devez quitter l'onglet, notez que le plan devra être rechargé à votre retour

> Le Service Worker (mode hors-ligne automatique) est actuellement désactivé. La méthode ci-dessus est la solution recommandée.

---

## 🗺️ Lire le plan

Une fois le plan chargé, vous naviguez sur une carte à défilement libre :

- **Pincer / zoomer** pour agrandir ou réduire la vue
- **Glisser** pour se déplacer sur le plan
- **Cliquer sur une icône** pour afficher les informations du point (nom, description, état)

Les boutons **+** et **−** en haut à gauche permettent de zoomer, et le contrôle de calques (icône en haut à droite) permet d'afficher ou masquer des couches d'informations.

---

## 📍 Tracker de position

### Démarrer le tracking

Appuyez sur **▶️** pour démarrer. Sur iPhone, une demande de permission s'affiche — acceptez-la pour autoriser l'accès aux capteurs de mouvement.

Une icône apparaît sur le plan à votre position de départ. Elle se déplace au fur et à mesure de votre marche, et un tracé bleu enregistre votre chemin parcouru.

Appuyez sur **⏹️** pour arrêter.

### Recaler sa position

Inévitablement, la position calculée dérivera par rapport à votre position réelle. Dès que vous reconnaissez un repère sur le plan (une salle, un carrefour, un puits), utilisez le recalage :

1. Appuyez sur **📍** — le bouton s'allume en vert
2. Appuyez sur le point du plan correspondant à votre position réelle
3. L'icône se déplace à l'emplacement choisi et le tracé repart de zéro
4. Appuyez à nouveau sur **📍** pour désactiver le mode recalage

Recalez le plus souvent possible pour maintenir une estimation correcte.

### Réglages du tracker

Accédez aux réglages via **⚙️**. Les paramètres importants pour le tracker :

- **Échelle (px/m)** : rapport entre les pixels du plan et les mètres réels. Si votre déplacement semble trop lent ou trop rapide sur le plan, ajustez cette valeur. Une valeur plus grande = déplacement plus lent sur le plan.
- **Taille d'un pas (m)** : longueur estimée de votre foulée. En moyenne 0,7 m.
- **Seuil de détection** : sensibilité du détecteur de pas. Augmentez si des pas sont détectés au repos, diminuez si des pas réels ne sont pas détectés.
- **Cooldown (ms)** : délai minimum entre deux pas. Empêche les doubles détections.
- **Position initiale X / Y** : point de départ de l'icône au chargement du plan.

---

## 📏 Mesure de distance

1. Appuyez sur **📏** — le mode mesure s'active (bouton vert)
2. Cliquez sur le plan pour poser des points
3. La distance totale s'affiche en bas à gauche, en mètres
4. Appuyez sur **❌** pour effacer la mesure et recommencer

La distance est calculée en utilisant l'échelle définie dans les réglages. Si les distances affichées semblent incorrectes, vérifiez la valeur **Échelle (px/m)** dans ⚙️.

> Un seul mode peut être actif à la fois : mesure, ajout de point, tracé de route ou recalage. Activer l'un désactive automatiquement les autres.

---

## ✏️ Ajouter des points

1. Appuyez sur **✏️** — le mode ajout s'active (bouton vert)
2. Cliquez sur le plan à l'emplacement souhaité
3. Un formulaire s'ouvre : saisissez le nom, le type (détermine l'icône) et une description
4. Validez — le point apparaît sur la carte

Ces points sont temporaires et propres à votre session. Pour les conserver, **exportez votre session** avant de fermer l'application.

Pour effacer tous les points ajoutés manuellement, appuyez sur **🗑️** (à côté du bouton ✏️).

---

## 🛣️ Tracer des routes

Trois types de tracés sont disponibles, chacun avec une couleur différente :

- **🟩 Route principale** — vert vif
- **🟪 Route secondaire** — violet
- **🟨 Chemin** — jaune

Pour tracer :

1. Appuyez sur le bouton correspondant — il s'allume en vert
2. Cliquez sur le plan pour poser des points de passage
3. Chaque clic prolonge le tracé
4. Appuyez à nouveau sur le même bouton pour arrêter le tracé en cours

Pour effacer tous les tracés, appuyez sur **🧹**. Une confirmation vous sera demandée.

---

## 💾 Sauvegarder et partager

### Exporter une session

Appuyez sur **💾** pour télécharger un fichier `devmap-session.json` contenant :
- Tous les points ajoutés manuellement
- Les tracés de routes
- Les points de mesure

Ce fichier peut être réimporté lors d'une prochaine session avec **📂**.

### Importer une session

Appuyez sur **📂** et sélectionnez un fichier `devmap-session.json` précédemment exporté. Les points et tracés seront restaurés sur le plan.

### Télécharger le plan en image

Appuyez sur **🖼️** pour télécharger une image PNG du plan tel qu'il apparaît à l'écran, incluant tous les calques visibles, les points et les tracés. Utile pour partager un état du plan ou l'imprimer.

> ⚠️ Avant de partager cette image, assurez-vous qu'elle ne révèle pas d'informations sensibles sur des lieux confidentiels.

---

## 🔄 Convertisseur de données

Le convertisseur permet de transformer des fichiers entre deux formats :

**✏️ → 🗂️ Vers calque de données**
Convertit un fichier session (points ajoutés via le mode édition) en calque de données réutilisable dans le plan. Pratique pour intégrer vos annotations dans la configuration permanente.

**🗂️ → ✏️ Vers mode édition**
Convertit un calque de données existant en session importable via **📂**. Permet d'éditer des données existantes dans le mode ajout de points.

---

## 🗺️ Légende

Appuyez sur **🗺️** pour afficher la légende complète des icônes et des tracés utilisés sur le plan.

---

## ⚙️ Réglages

Appuyez sur **⚙️** pour accéder aux paramètres de l'application, regroupés en sections :

- **Dimensions du plan** : hauteur et largeur en pixels (normalement déjà configurées)
- **Position initiale du tracker** : coordonnées de départ de l'icône de position
- **Détection des pas** : paramètres de sensibilité du tracker
- **Debug** : activer les logs de mouvement (pour diagnostic uniquement)
- **Vider le cache** : forcer le rechargement complet de l'application depuis le serveur

---

## 🗂️ Changer de plan

Appuyez sur **🗂️** pour revenir à l'écran de chargement et charger un autre plan. Les données de la session en cours non exportées seront perdues — pensez à exporter avant.

---

## 🔧 Vider le cache

En cas de mise à jour de l'application qui ne se reflète pas dans votre navigateur, utilisez le bouton **Vider le cache** dans ⚙️. Cette action :

1. Désinscrit le Service Worker
2. Vide intégralement le cache du navigateur
3. Recharge l'application depuis le serveur

> ⚠️ Cette action rend l'application inutilisable hors connexion jusqu'au prochain chargement complet. Effectuez-la uniquement lorsque vous avez accès à Internet.

---

## 🆘 En cas de problème

**Le plan ne se charge pas**
Vérifiez que le fichier `plan-config.json` est bien sélectionné, et que tous les fichiers associés sont inclus (images, données). En mode ZIP, assurez-vous que le fichier `plan-config.json` est présent à la racine de l'archive.

**Le tracker dérive trop vite**
Recalez votre position fréquemment. Ajustez l'échelle et la taille du pas dans les réglages.

**Un mode reste actif sans le vouloir**
Un seul mode peut être actif à la fois. Appuyez à nouveau sur le bouton actif (en vert) pour le désactiver.

**L'application ne fonctionne plus hors connexion**
Si vous avez vidé le cache ou fermé l'onglet, rechargez l'application avant votre prochaine sortie, avec une connexion disponible.

**Les distances semblent incorrectes**
Vérifiez la valeur **Échelle (px/m)** dans les réglages. Elle doit correspondre au ratio entre les pixels du plan et les mètres réels du terrain.

---

*MyKTAMap — Guide Utilisateur*
*Ces lieux sont fragiles. La discrétion est une forme de respect.*
