# 📗 MyKTAMap — Guide Utilisateur

> Ce guide est destiné aux utilisateurs de l'application. Il explique comment utiliser chaque fonction, comment préparer votre téléphone pour une sortie terrain, et rappelle les règles essentielles concernant la discrétion des données.

---

## 🔴 Avertissements importants

### 🔐 Confidentialité des données — à lire en premier

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

Utilisez toujours le **recalage manuel** (bouton 📍) dès que vous identifiez un repère connu sur le plan.

**Pour toute sortie souterraine, emportez toujours :**
- Une carte papier ou une version imprimée du plan
- Une boussole physique
- Une lampe frontale avec piles de rechange

---

## 🚀 Premiers pas

### 📱 Installer l'application sur Mobile (Iphone/Android)

MyKTAMap peut être installée comme application native sur Mobile — sans passer par l'App Store/Play Store :

1. Ouvrez `myktamap.is-underground.fr` dans **chrome/safari**
2. Appuyez sur le bouton de partage ↑ en bas de l'écran
3. Sélectionnez **"Sur l'écran d'accueil"**
4. Confirmez — une icône apparaît sur votre écran d'accueil
5. Lancez toujours l'application depuis cette icône

> L'application fonctionne ainsi en mode plein écran, sans la barre du navigateur.

### 📥 Installer l'application sur PC

MyKTAMap peut être installée comme application native sur PC egalement — sans installer un exécutable.

1. Ouvrez `myktamap.is-underground.fr` dans **chrome**
2. Appuyez sur le bouton "Installer" à coté de l'URL
3. Confirmez — une icône apparaît sur votre bureau
4. Lancez toujours l'application depuis cette icône


### 📦 Charger un plan

Au démarrage, si aucun plan n'est configuré sur le serveur, l'application affiche un **formulaire de chargement**.

**Trois manières de démarrer :**

1. **Importer une archive ZIP** — glissez-déposez votre archive `.zip` (qui contient `plan-config.json` et tous les fichiers associés) sur la zone prévue, ou cliquez pour la sélectionner. Cliquez ensuite sur **Charger le plan**.
2. **🏗️ Générer un plan** — bouton en bas du formulaire. Ouvre directement le générateur sans avoir besoin de charger un plan existant. Pratique si vous voulez créer un nouveau plan from scratch.
3. **🌐 Charger le plan serveur** — bouton en bas du formulaire. Tente de charger un plan déposé directement sur le serveur (fichier `plan-config.json` à la racine). Affiche une erreur si aucun plan serveur n'est trouvé.

### ⚡ Mode performance

Si votre plan utilise un JPEG volumineux (> 50 Mo), cochez **⚡ Mode performance** avant de charger. Ce mode découpe l'image en tuiles pour éviter les crashes sur Mobile. La qualité est légèrement réduite mais l'image s'affiche correctement.

> Le mode performance se coche automatiquement si votre archive ZIP dépasse 50 Mo.

### 📡 Utilisation hors connexion

MyKTAMap fonctionne **entièrement hors connexion** une fois le plan chargé une première fois.

L'application utilise un **Service Worker** qui met en cache automatiquement tous les fichiers nécessaires (interface, images, données). Au premier chargement avec connexion Internet, tout est sauvegardé localement.

**Pour préparer une sortie hors connexion :**

1. Ouvrez l'application **avant de partir**, avec une connexion disponible
2. Chargez votre plan complet
3. Naviguez quelques secondes pour que tous les fichiers soient mis en cache
4. Vous pouvez maintenant fermer l'application et passer en zone sans réseau — elle restera fonctionnelle

> Si une nouvelle version est disponible avec connexion, l'application se mettra à jour automatiquement au prochain chargement.

---

## 🗺️ Lire le plan

Une fois le plan chargé :

- **Pincer / zoomer** pour agrandir ou réduire la vue
- **Glisser** pour se déplacer sur le plan
- **Cliquer sur une icône** pour afficher les informations du point

Les boutons **+** et **−** en haut à gauche permettent de zoomer. Le contrôle de calques en haut à droite permet d'afficher ou masquer des couches d'informations.

---

## 🧭 Présentation de l'interface

Tous les outils sont accessibles depuis la **barre latérale droite**, organisée en 11 groupes :

| Groupe | Icône | À quoi ça sert |
|---|---|---|
| **Aide / Doc / Légende** | 📚 | Aide, documentation, légende des icônes |
| **Paramètres** | ⚙️ | Réglages, calibrage de l'échelle, debug *(clic direct)* |
| **Recherche** | 🔍 | Trouver rapidement un point sur le plan *(clic direct)* |
| **Charger / Import** | ⬇️ | Importer une session, éditer un fichier JSON, changer de plan |
| **Créer / Modifier plan** | 🏗️ | Générateur de plan *(clic direct)* |
| **Enregistrer** | ⬆️ | Enregistrer ta session (3 modes), exporter le plan en image |
| **Tracker** | 🧭 | Démarrer / arrêter le tracking, recaler ta position |
| **Mesure** | 📐 | Mesurer une distance, effacer |
| **Édition de points** | ✏️ | Ajouter tes propres points, effacer |
| **Tracés** | 🛣️ | Tracer routes principales, secondaires, chemins |
| **Zones** | ⬛ | Tracer des zones de remblais, effondrement ou eau |

**Comment ça marche :**

- **Un seul groupe ouvert à la fois** — appuyer sur un autre groupe ferme le précédent
- **Quand un mode est actif** (mesure, ajout, route, zone, recalage), le groupe **reste ouvert** pour que tu puisses accéder rapidement aux actions associées (effacer un point, etc.). L'icône principale change pour refléter le mode en cours
- **Toucher en dehors** du groupe ouvert le ferme automatiquement
- **Sur mobile en paysage**, la barre devient scrollable verticalement si elle dépasse de l'écran

---

## 🔍 Rechercher un point

Le bouton **🔍** dans la barre latérale ouvre une fenêtre de recherche rapide pour trouver n'importe quel point du plan.

### 🔎 Ce qu'on peut chercher

- Le **nom** du point (ex: "Puits Aération")
- Son **identifiant** (ex: "PA1")
- Un **tag** (ex: "pa", "danger", "elec")
- Sa **description**
- Son **état**

La recherche est **insensible aux accents et à la casse** — taper "aeration" trouvera aussi "Aération".

### ⚙️ Comment ça marche

1. Cliquez sur **🔍** dans la barre latérale
2. Tapez votre recherche dans le champ — les résultats s'affichent en temps réel
3. Naviguez avec les flèches **↑** / **↓** ou avec le curseur
4. Validez avec **Entrée** ou par un clic sur le résultat
5. La carte se centre sur le point avec un **cercle orange** autour pour le repérer, et le popup d'information s'ouvre

### 🧭 Périmètre

La recherche couvre **tous les calques de données du plan** (puits, véhicules, etc.) ainsi que **tes points ajoutés**. Les résultats incluent :
- Une miniature de l'icône du point
- Son ID en bleu et son nom
- Le calque d'origine (chip "Puits", "Véhicule"...)
- Ses tags et coordonnées

---

## 📍 Tracker de position

> Tous les boutons du tracker se trouvent dans le groupe **🧭 Tracker** de la barre latérale.

### ▶️ Démarrer le tracking

Appuyez sur **▶️** pour démarrer. Sur Mobile, une demande de permission s'affiche — acceptez-la pour autoriser l'accès aux capteurs de mouvement.

Une icône apparaît sur le plan à votre position de départ. Elle se déplace au fur et à mesure de votre marche, et un tracé enregistre votre chemin parcouru.

Appuyez sur **⏹️** pour arrêter.

### 📍 Recaler sa position

La position calculée dérive inévitablement. Dès que vous reconnaissez un repère sur le plan :

1. Appuyez sur **📍** — le bouton s'allume en vert
2. Appuyez sur le point du plan correspondant à votre position réelle
3. L'icône se déplace à l'emplacement choisi et le tracé repart de zéro
4. Appuyez à nouveau sur **📍** pour désactiver le mode recalage

> Un seul mode peut être actif à la fois : mesure, ajout de point, tracé de route ou recalage.

### ⚙️ Réglages du tracker

Accédez aux réglages via le bouton **⚙️ Paramètres** de la barre latérale :

- **Échelle (px/m)** : rapport pixels/mètres réels — bouton **🎯** à côté pour calibrer
- **Taille d'un pas (m)** : longueur estimée de votre foulée (≈ 0,7 m)
- **Seuil de détection** : sensibilité du détecteur de pas
- **Cooldown (ms)** : délai minimum entre deux pas
- **Position initiale X / Y** : point de départ de l'icône au chargement

---

## 📐 Mesure de distance

> Tous les boutons de mesure se trouvent dans le groupe **📐 Mesure** de la barre latérale.

1. Appuyez sur **📐** — le mode mesure s'active (bouton vert)
2. Cliquez sur le plan pour poser des points
3. La distance totale s'affiche en bas à gauche, en mètres

### ❌ Effacer la mesure

Appuyez sur **❌**. Une fenêtre s'ouvre avec deux options :

| Option | Effet |
|---|---|
| **↩️ Dernier point** | Annule uniquement le dernier point cliqué (idéal en cas d'erreur de clic) |
| **🗑️ Toute la mesure** | Efface tous les points et remet la distance à zéro |
| Annuler | Ferme la fenêtre sans rien supprimer |

> Tu peux retirer plusieurs points un par un en cliquant successivement **❌ → ↩️ Dernier point**.

---

## ✏️ Ajouter des points

> Tous les boutons d'édition se trouvent dans le groupe **✏️ Édition** de la barre latérale.

1. Appuyez sur **✏️** — le mode ajout s'active (bouton vert)
2. Cliquez sur le plan à l'emplacement souhaité
3. Une fenêtre s'ouvre. Renseignez :
   - **Nom** (obligatoire)
   - **Type** : choisissez parmi les tags existants, **— Aucun tag —** (icône par défaut), ou **➕ Créer un nouveau tag…**
   - **Description** (optionnel)
4. Validez avec **✅ Ajouter**

### 🏷️ Créer un nouveau tag

Si le type que vous voulez n'existe pas encore, sélectionnez **➕ Créer un nouveau tag…**. Saisissez un nom court (lettres, chiffres, underscore ou tiret uniquement) — par exemple `fontaine`, `arche` ou `ruine_2`.

Le nouveau tag est ajouté à votre session et utilisera l'icône par défaut. Pour personnaliser son icône définitivement, modifiez le plan via **🏗️ Créer / Modifier plan**.

### 🗑️ Effacer les points

Appuyez sur **🗑️** (à côté de ✏️). Une fenêtre s'ouvre avec deux options :

| Option | Effet |
|---|---|
| **↩️ Dernier point** | Supprime le point le plus récemment ajouté |
| **🗑️ Tous les points** | Efface tous les points ajoutés manuellement (irréversible) |
| Annuler | Ferme la fenêtre sans rien supprimer |

> Tu peux retirer plusieurs points un par un en cliquant successivement **🗑️ → ↩️ Dernier point**.

> ⚠️ **Tous les points** ne supprime que les points que **tu** as ajoutés — les points du plan original restent intacts.

---

## 🛣️ Tracer des routes

> Tous les boutons de tracé se trouvent dans le groupe **🛣️ Tracés** de la barre latérale.

- **🟩 Route principale** — vert vif
- **🟪 Route secondaire** — violet
- **🟨 Chemin** — jaune

Pour tracer : appuyez sur le bouton correspondant → cliquez sur le plan pour poser des points → appuyez à nouveau pour arrêter.

### 🧹 Effacer un tracé

Appuyez sur **🧹**. Une fenêtre s'ouvre avec trois options :

| Option | Effet |
|---|---|
| **↩️ Dernier point du tracé** | Annule uniquement le dernier point cliqué sur le tracé en cours (idéal pour corriger un point mal placé) |
| **✂️ Dernier tracé entier** | Supprime le dernier tracé complet (utile si tu veux refaire un tracé sans toucher aux précédents) |
| **🗑️ Tous les tracés** | Efface absolument tous les tracés (irréversible) |
| Annuler | Ferme la fenêtre sans rien supprimer |

> Exemple d'usage : tu traces une route principale, tu te trompes sur le dernier virage. Clique **🧹 → ↩️ Dernier point du tracé** pour reculer d'un point, puis continue ton tracé normalement.

---

## ⬛ Tracer des zones

> Tous les boutons de zones se trouvent dans le groupe **⬛ Zones** de la barre latérale.

Permet de dessiner des **surfaces fermées** pour annoter des espaces particuliers du plan : remblais, zones effondrées, plans d'eau, etc.

| Type | Icône | Couleur |
|---|---|---|
| **Remblais** | ⬛ | Gris foncé |
| **Effondrement** | 🟥 | Rouge |
| **Eau** | 🟦 | Bleu |

### ✏️ Comment tracer une zone

1. Appuyez sur l'icône du type voulu (⬛, 🟥 ou 🟦) — le mode s'active
2. Cliquez sur le plan pour poser les points (au moins 3)
3. Pour fermer la zone, **deux options** :
   - **Re-cliquer sur le premier point** (un cercle apparaît dessus dès que 3 points sont posés)
   - **Appuyer sur ✅** — ferme la zone à l'endroit du dernier point
4. La zone se remplit automatiquement avec sa couleur

> Pendant le tracé, les segments apparaissent en pointillé. Une fois fermée, la zone devient pleine.

### 🧱 Ordre d'affichage

Les zones se superposent dans cet ordre, indépendamment de l'ordre de tracé :

1. **Eau** (en arrière-plan)
2. **Remblais** (au-dessus de l'eau)
3. **Effondrement** (au-dessus de tout)

Cela permet par exemple de tracer un effondrement par-dessus un remblais sans qu'il soit masqué.

### 🧹 Effacer une zone

Appuyez sur **🧹**. Une fenêtre s'ouvre avec trois options :

| Option | Effet |
|---|---|
| **↩️ Annuler le dernier point** | Sur la zone en cours, ou sur la dernière zone fermée |
| **✂️ Supprimer la dernière zone** | Retire la dernière zone fermée |
| **🗑️ Effacer toutes les zones** | Efface absolument tout (irréversible) |

---

## ⬆️ Sauvegarder et partager

> Tous les boutons d'export se trouvent dans le groupe **⬆️ Enregistrer** de la barre latérale.

### 💾 Enregistrer une session

Appuyez sur **⬆️ → 💾**. Une modale s'ouvre avec **3 onglets** au choix :

#### 🚀 Full
Exporte tout en un seul fichier `devmap-session` (points ajoutés, tracés, zones).
Pratique pour sauvegarder ta session et la reprendre plus tard.

> 📌 La mesure de distance et la position du tracker ne sont **pas** incluses en mode Full.

#### 🎨 Avancé
Sélection précise de ce que tu veux exporter :

- ✏️ **Points ajoutés** + cases par tag (avec icône miniature) + une catégorie spéciale `(sans tag)` pour les points sans tags. Tu peux donc exporter par exemple uniquement les points avec le tag `pa` ou `danger`.
- 🛣️ **Tracés** + cases par type (principaux, secondaires, chemins)
- ⬛ **Zones** + cases par type (eau, remblais, effondrement)
- 🧭 **Position du tracker** *(en option)* — inclut aussi le chemin parcouru s'il existe

**Format de sortie** au choix :
- 📄 **Un seul fichier session** (.json — réimportable comme une sauvegarde classique)
- 📦 **ZIP multi-fichiers** (un fichier par catégorie : `session_points.json`, `session_roads.json`, etc.)

#### 🔄 Conversion
Convertit ta session en **calque de données** prêt à intégrer dans un plan définitif via le fichier `plan-config.json`.

Cases à cocher : Points / Tracés / Zones (avec **filtrage par tag** pour les points, comme en Avancé). Pas de tracker en conversion.

**Granularité** au choix :
- 📄 **Basique** : 1 fichier par catégorie (`points.json`, `roads.json`, `zones.json`)
- 🔬 **Fine** : 1 fichier par type (`zones_eau.json`, `zones_remblais.json`, `roads_principal.json`, etc.)

Téléchargement direct si 1 seul fichier, ZIP sinon.

> 💡 La conversion est utile pour figer une partie de ton travail dans un plan permanent. Une fois converties en data layer, ces données ne sont plus modifiables depuis l'application.

### 🖼️ Exporter le plan en image

Appuyez sur **⬆️ → 🖼️ Plan en image**. Une modale s'ouvre avec deux modes :

#### ⚡ Export rapide
Tout est inclus automatiquement : plan complet, tous les calques visibles, points, tracés, zones, position et chemin du tracker. Format PNG résolution originale. Un seul clic sur **Télécharger**.

#### 🎨 Export avancé
Pour un contrôle précis sur tout ce que tu exportes :

- **Calques d'image** — coche/décoche chaque calque (légende du plan, annotations, etc.)
- **Calques de données** — coche les couches à inclure (puits, véhicules, etc.). Les zones et tracés embarqués dans ces calques sont aussi exportés.
- **Annotations** — choisis quoi inclure parmi tes points, tracés, zones, mesure, position et chemin du tracker
- **Légende intégrée** — ajoute une légende stylisée directement sur le plan exporté :
  - **Position** : 4 coins (haut-gauche, haut-droit, bas-gauche, bas-droit) ou **personnalisée** (clique 🎯 puis sur le plan pour placer le coin haut-gauche de la légende)
  - **Style** : Opaque / Semi-transparent / Filigrane
  - **Taille** : Compact / Standard / Large
  - **Contenu** : Icônes / Tracés / Zones / Tag tracker / Métadonnées du plan (nom, version, auteur, date)
- **Format** : PNG ou JPEG (qualité 90%, fichier plus léger)
- **Résolution** : Originale, ½ ou ¼ (utile pour les très gros plans)
- **Aperçu** : un mini-canvas se met à jour en temps réel pour visualiser le résultat

> ⚠️ Avant de partager cette image, vérifiez qu'elle ne révèle pas d'informations sensibles.

---

## ⬇️ Charger / Import

> Le groupe **⬇️ Charger / Import** de la barre latérale contient les actions d'import.

### 📥 Importer une session

Appuyez sur **⬇️ → 📥 Importer une session** pour ouvrir la fenêtre d'import. Une modale s'affiche :

1. **Glissez-déposez** votre fichier `devmap-session.json` dans la zone, ou cliquez pour le sélectionner
2. Un **aperçu** s'affiche : nombre de points ajoutés, nombre de tracés, nombre de zones, nombre de points de mesure
3. Un **avertissement** vous prévient que l'import remplacera votre session en cours — pensez à exporter avant si nécessaire
4. Cliquez sur **Importer** pour valider, ou **Annuler** pour fermer sans rien changer

### 📊 Éditer un fichier JSON

Appuyez sur **⬇️ → 📊 Éditer un fichier JSON** pour ouvrir l'éditeur de tableau. Permet de modifier en masse les points d'un calque ou d'une session.

#### Ouverture

1. **Glissez-déposez** un fichier `.json` (calque de données type `puit.json`, ou session `devmap-session.json`)
2. Le format est détecté automatiquement
3. Le tableau s'affiche avec une colonne par champ détecté

#### Édition

- **Cliquez sur une cellule** pour la modifier (sauf l'ID, en lecture seule)
- **Tab** : passe à la cellule suivante
- **Entrée** : passe à la ligne suivante (même colonne)
- **Échap** : annule la modification en cours
- **Coordonnées** : si X ou Y est hors du plan, la cellule devient rouge avec un avertissement ⚠
- **Tags** : cliquez sur la cellule pour ouvrir un sélecteur multi-tags avec aperçu des icônes. Tu peux aussi créer un nouveau tag à la volée

#### Actions

- **🔍 Recherche** : filtre toutes les colonnes
- **Trier** : clique sur l'en-tête d'une colonne (asc → desc → annulé)
- **Sélection multiple** : checkbox + Maj+clic pour une plage
- **+ Ajouter ligne** : nouvelle ligne vide en bas
- **📋 Dupliquer** : copie les lignes sélectionnées
- **🗑️ Supprimer** : retire les lignes sélectionnées (confirmation requise)
- **📍 Voir sur la carte** : affiche les points sélectionnés en orange clignotant sur le plan

#### Sauvegarde

Bouton **💾 Sauvegarder** → 3 choix :

| Option | Effet |
|---|---|
| **📥 Télécharger** | Récupère le fichier `.json` modifié |
| **🗺️ Remplacer le calque** | Met à jour le calque correspondant en mémoire (si format `data` et calque chargé sur le plan en cours) |
| **✏️ Remplacer la session** | Remplace les points ajoutés de la session en cours (si format `editorPoints`) |

> ⚠️ Si vous fermez la fenêtre avec des modifications non sauvegardées, une confirmation vous propose de sauvegarder, quitter sans sauvegarder, ou continuer l'édition.

### 🗂️ Changer de plan

Appuyez sur **⬇️ → 🗂️ Changer de plan** pour charger un autre plan complet. Les données non exportées seront perdues — exportez avant de changer.

---

## 🏗️ Créer ou modifier un plan

> Accessible directement via le bouton **🏗️** de la barre latérale (clic direct, pas de sous-menu).

Appuyez sur **🏗️** pour ouvrir le générateur. Deux onglets disponibles :

### 📄 Nouveau plan

Formulaire vierge. Renseignez :

- **Informations** : nom, version, auteur, dimensions de l'image
- **Image principale** (obligatoire) et carte de collision (optionnelle)
- **Calques image** supplémentaires (légendes, annotations) — jusqu'à 10
- **Calques de données** JSON — jusqu'à 10 (créés vides si non fournis)
- **Paramètres de tracking** : position de départ, échelle, sensibilité
- **Icônes & Tags** : gestionnaire dynamique
  - Cliquez **↺ Charger défauts** pour pré-remplir avec les icônes standards
  - Cliquez **+ Ajouter un tag** pour créer un type personnalisé
  - Pour chaque tag, choisissez une icône personnalisée ou laissez le chemin par défaut
  - Les tags `default` et `track` sont obligatoires (système)

Le calque **Ajouts** (`editor.json`) est toujours inclus automatiquement.

Cliquez sur **📦 Générer le ZIP** — l'archive est prête.

### 📂 Modifier existant

Importez un ZIP existant — le formulaire se pré-remplit automatiquement avec sa configuration. Modifiez ce que vous voulez (ajouter des tags, changer les icônes, ajouter des calques, etc.) et cliquez sur **📦 Générer le ZIP** pour télécharger la version modifiée.

> Pratique pour ajouter de nouvelles icônes à un plan déjà en circulation, ou pour ajuster la position initiale du tracker.

---

## 🗺️ Légende

> Accessible via le groupe **📚 Aide / Doc / Légende → 🗺️ Légende**.

Affiche la légende complète des icônes et tracés, regroupés par catégorie.

---

## ⚙️ Réglages

> Accessible directement via le bouton **⚙️** de la barre latérale (clic direct, pas de sous-menu).

Accédez aux paramètres en cliquant sur **⚙️** :

- **Position initiale du tracker** : coordonnées de départ
- **Détection des pas** : sensibilité, taille du pas, cooldown
- **Échelle (px/m)** avec bouton **🎯 Calibrer** : calcule l'échelle correcte à partir d'une distance mesurée
- **Debug** : activer les logs de mouvement + état du Mode Performance (Auto / Activé / Désactivé)
- **🗑️ Réinitialiser** : vide le cache et recharge l'application
- **🐛 Logs** : affiche les journaux de débogage (utile en cas de problème)

> Le Mode Performance ne se modifie qu'au chargement du plan (case ⚡ dans le formulaire de chargement).

### 🎯 Calibrer l'échelle

Si l'appli te donne une distance différente de la réalité (par exemple 100 m affichés alors que tu sais qu'il y a 150 m sur le terrain) :

1. Mesure la distance dans l'appli avec **📐**
2. Ouvre **⚙️ → 🎯 Calibrer**
3. Saisis la **distance affichée** (100) et la **distance réelle** (150)
4. La nouvelle échelle s'affiche en temps réel
5. Clique **Appliquer** → la valeur est injectée dans le champ Échelle
6. Clique **Appliquer** dans la modale Réglages pour valider

> Plus tu calibres sur une longue distance, plus le résultat sera précis.

---

## 🔧 Réinitialiser

En cas de problème ou pour forcer une mise à jour, utilisez **⚙️ → 🗑️ Réinitialiser**. Cette action désinscrit le Service Worker, vide le cache et recharge l'application.

> ⚠️ Effectuez cette action uniquement avec une connexion Internet disponible. Sans réseau, l'application sera inutilisable jusqu'au prochain rechargement complet.

---

## 🆘 En cas de problème

**Le plan ne se charge pas**
Vérifiez que `plan-config.json` est bien à la racine de votre archive ZIP, et que tous les fichiers référencés sont présents.

**L'image du plan est floue en mode performance**
C'est normal — le mode performance réduit la résolution pour éviter les crashes. Si vous avez suffisamment de mémoire, désactivez-le au prochain chargement.

**Le tracker dérive trop vite**
Recalez votre position fréquemment. Ajustez l'échelle et la taille du pas dans les réglages.

**L'application crash sur Mobile avec un JPEG volumineux**
Activez le **⚡ Mode performance** avant de charger le plan.

**Un mode reste actif sans le vouloir**
Appuyez à nouveau sur le bouton actif (en vert) pour le désactiver.

**L'application ne se met pas à jour après une nouvelle version**
Utilisez **⚙️ → 🗑️ Réinitialiser** avec une connexion Internet pour forcer le rechargement complet.

**Problème non résolu**
Ouvrez **⚙️ → 🐛 Logs**, copiez les journaux et transmettez-les à l'équipe technique.

---

*MyKTAMap — Guide Utilisateur*
*Ces lieux sont fragiles. La discrétion est une forme de respect.*
