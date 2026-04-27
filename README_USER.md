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

### Installer l'application sur iPhone (recommandé)

MyKTAMap peut être installée comme application native sur iPhone — sans passer par l'App Store :

1. Ouvrez `myktamap.is-underground.fr` dans **Safari**
2. Appuyez sur le bouton de partage ↑ en bas de l'écran
3. Sélectionnez **"Sur l'écran d'accueil"**
4. Confirmez — une icône apparaît sur votre écran d'accueil
5. Lancez toujours l'application depuis cette icône

> L'application fonctionne ainsi en mode plein écran, sans la barre Safari. C'est la méthode recommandée pour une utilisation terrain.

### Charger un plan

Au démarrage, si aucun plan n'est configuré sur le serveur, l'application affiche un formulaire de chargement. Deux méthodes sont disponibles :

**📁 Fichiers séparés**
Sélectionnez d'abord le fichier `plan-config.json`, puis tous les fichiers associés (images, données JSON). Cette méthode est utile si vous gérez vos fichiers manuellement.

**📦 Archive ZIP**
Sélectionnez une archive `.zip` contenant l'ensemble des fichiers du plan. C'est la méthode recommandée : un seul fichier à transmettre et à ouvrir. Glissez-déposez le ZIP sur la zone prévue, ou cliquez pour le sélectionner.

### Mode performance ⚡

Si votre plan utilise un JPEG volumineux (> 50 Mo), cochez **⚡ Mode performance** avant de charger. Ce mode découpe l'image en tuiles pour éviter les crashes sur iPhone. La qualité est légèrement réduite mais l'image s'affiche correctement.

> Le mode performance se coche automatiquement si votre archive ZIP dépasse 50 Mo.

### Utilisation hors connexion

MyKTAMap fonctionne **sans connexion Internet** une fois le plan chargé.

**Pour préparer une sortie hors connexion :**

1. Ouvrez l'application **avant de partir**, avec une connexion disponible
2. Chargez votre plan complet (ZIP ou fichiers séparés)
3. Une fois le plan affiché, **ne fermez pas l'application** — laissez-la en arrière-plan
4. Passez en mode avion ou entrez en zone sans réseau : l'application reste fonctionnelle

> Si vous avez installé l'application depuis l'écran d'accueil, elle reste disponible entre les sessions sans avoir à recharger le plan.

---

## 🗺️ Lire le plan

Une fois le plan chargé :

- **Pincer / zoomer** pour agrandir ou réduire la vue
- **Glisser** pour se déplacer sur le plan
- **Cliquer sur une icône** pour afficher les informations du point (nom, description, état)

Les boutons **+** et **−** en haut à gauche permettent de zoomer. Le contrôle de calques en haut à droite permet d'afficher ou masquer des couches d'informations.

---

## 📍 Tracker de position

### Démarrer le tracking

Appuyez sur **▶️** pour démarrer. Sur iPhone, une demande de permission s'affiche — acceptez-la pour autoriser l'accès aux capteurs de mouvement.

Une icône apparaît sur le plan à votre position de départ. Elle se déplace au fur et à mesure de votre marche, et un tracé enregistre votre chemin parcouru.

Appuyez sur **⏹️** pour arrêter.

### Recaler sa position

La position calculée dérive inévitablement. Dès que vous reconnaissez un repère sur le plan (une salle, un carrefour, un puits), recalez :

1. Appuyez sur **📍** — le bouton s'allume en vert
2. Appuyez sur le point du plan correspondant à votre position réelle
3. L'icône se déplace à l'emplacement choisi et le tracé repart de zéro
4. Appuyez à nouveau sur **📍** pour désactiver le mode recalage

Recalez le plus souvent possible pour maintenir une estimation correcte.

> Un seul mode peut être actif à la fois : mesure, ajout de point, tracé de route ou recalage. Activer l'un désactive automatiquement les autres.

### Réglages du tracker

Accédez aux réglages via **⚙️** :

- **Échelle (px/m)** : rapport pixels/mètres réels. Si le déplacement semble trop lent ou rapide, ajustez.
- **Taille d'un pas (m)** : longueur estimée de votre foulée. En moyenne 0,7 m.
- **Seuil de détection** : sensibilité du détecteur de pas.
- **Cooldown (ms)** : délai minimum entre deux pas.
- **Position initiale X / Y** : point de départ de l'icône au chargement.

---

## 📏 Mesure de distance

1. Appuyez sur **📏** — le mode mesure s'active (bouton vert)
2. Cliquez sur le plan pour poser des points
3. La distance totale s'affiche en bas à gauche, en mètres
4. Appuyez sur **❌** pour effacer et recommencer

---

## ✏️ Ajouter des points

1. Appuyez sur **✏️** — le mode ajout s'active (bouton vert)
2. Cliquez sur le plan à l'emplacement souhaité
3. Saisissez le nom, le type et une description
4. Validez — le point apparaît sur la carte

Pour effacer tous les points ajoutés, appuyez sur **🗑️** (à côté du bouton ✏️). Une confirmation vous sera demandée.

---

## 🛣️ Tracer des routes

- **🟩 Route principale** — vert vif
- **🟪 Route secondaire** — violet
- **🟨 Chemin** — jaune

Pour tracer : appuyez sur le bouton correspondant → cliquez sur le plan pour poser des points → appuyez à nouveau pour arrêter.

Pour effacer tous les tracés, appuyez sur **🧹**. Une confirmation vous sera demandée.

---

## 💾 Sauvegarder et partager

### Exporter une session

Appuyez sur **💾** pour télécharger un fichier `devmap-session.json` contenant les points ajoutés, les tracés et les points de mesure. Réimportable via **📂**.

### Télécharger le plan en image

Appuyez sur **🖼️** pour télécharger une image PNG du plan avec tous les calques visibles, points et tracés.

> ⚠️ Avant de partager cette image, vérifiez qu'elle ne révèle pas d'informations sensibles.

---

## 🔄 Convertisseur de données

Permet de transformer des fichiers entre le format édition et le format calque de données.

**✏️ → 🗂️ Vers calque de données** — convertit vos annotations en calque permanent rechargeable dans le plan.

**🗂️ → ✏️ Vers mode édition** — convertit un calque existant en session importable pour le modifier.

Les tracés de routes sont préservés dans les deux sens.

---

## 📦 Créer un nouveau plan

Appuyez sur **📦** pour ouvrir le générateur. Renseignez :

- **Informations** : nom, version, auteur, dimensions de l'image
- **Image principale** (obligatoire) et carte de collision (optionnelle)
- **Calques image** supplémentaires (légendes, annotations) — jusqu'à 10
- **Calques de données** JSON — jusqu'à 10 (créés vides si non fournis)
- **Paramètres de tracking** : position de départ, échelle, sensibilité

Le calque **Ajouts** (`editor.json`) est toujours inclus automatiquement.

Cliquez sur **📦 Générer le ZIP** — l'archive est prête à être chargée dans l'application.

---

## 🗺️ Légende

Appuyez sur **🗺️** pour afficher la légende complète des icônes et tracés, regroupés par catégorie.

---

## ⚙️ Réglages

Accédez aux paramètres via **⚙️** :

- **Position initiale du tracker** : coordonnées de départ
- **Détection des pas** : sensibilité, taille du pas, cooldown
- **Debug** : activer les logs de mouvement
- **Mode Performance** : gestion du tiling pour les plans volumineux (Auto / Toujours / Désactivé)
- **🗑️ Réinitialiser** : vide le cache et recharge l'application depuis le serveur
- **🐛 Logs** : affiche les journaux de débogage (utile en cas de problème)

> Le changement de Mode Performance prend effet au prochain chargement de plan.

---

## 🗂️ Changer de plan

Appuyez sur **🗂️** pour charger un autre plan. Les données non exportées seront perdues — exportez avant de changer.

---

## 🔧 Réinitialiser

En cas de problème ou de mise à jour, utilisez **🗑️ Réinitialiser** dans ⚙️. Cette action vide le cache du navigateur et recharge l'application.

> ⚠️ Effectuez cette action uniquement avec une connexion Internet disponible.

---

## 🆘 En cas de problème

**Le plan ne se charge pas**
Vérifiez que `plan-config.json` est sélectionné et que tous les fichiers associés sont inclus. En mode ZIP, `plan-config.json` doit être à la racine de l'archive.

**L'image du plan est floue en mode performance**
C'est normal — le mode performance réduit la résolution de l'image pour éviter les crashes. Si vous avez suffisamment de mémoire, désactivez-le dans ⚙️.

**Le tracker dérive trop vite**
Recalez votre position fréquemment. Ajustez l'échelle et la taille du pas dans les réglages.

**L'application crash sur iPhone avec un JPEG volumineux**
Activez le **⚡ Mode performance** avant de charger le plan.

**Un mode reste actif sans le vouloir**
Appuyez à nouveau sur le bouton actif (en vert) pour le désactiver.

**Problème non résolu**
Ouvrez ⚙️ → 🐛 Logs, copiez les journaux et transmettez-les à l'équipe technique.

---

*MyKTAMap — Guide Utilisateur*
*Ces lieux sont fragiles. La discrétion est une forme de respect.*
