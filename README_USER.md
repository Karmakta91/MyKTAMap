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

### 🚨 Alertes publiques (diffusion en temps réel)

L'application supporte un système d'**alertes publiques** diffusées par l'auteur à la communauté en cas de situation à risque (incendie en cataphilie, fermeture d'accès, gaz toxiques, etc.).

**Comment ça se manifeste** :

- Au lancement de l'app (après le splash), si une alerte est active côté serveur, une **modale rouge pulsante** s'affiche avec titre, message principal et liste de consignes.
- **Niveaux** :
  - 🚨 **emergency** (rouge pulsant + `!` qui clignote) — situation critique, à lire impérativement
  - ⚠️ **warning** (orange) — info importante, attention requise
  - ℹ️ **info** (bleu) — annonce neutre, simple notification
- **Acquittement** : cliquer **"J'ai compris"** stocke la confirmation dans votre navigateur. La modale ne ré-apparaîtra plus tant que l'alerte reste la même.
- **Si une nouvelle alerte est publiée** (ou la même est ré-éditée par l'auteur), elle ré-apparaîtra automatiquement au prochain reload.

**Multi-alertes (depuis v163)** : plusieurs alertes peuvent coexister (ex: alerte migration domaine + alerte incendie ponctuelle). Elles s'affichent en cascade au lancement (priorité : emergency → warning → info, plus récente d'abord). Chacune s'acquitte individuellement avec son propre bouton "J'ai compris".

**Bouton 🚨 dans le loader** (à gauche du 📖 Documentation) — **couleur dynamique selon le niveau max actif** :

| État | Apparence du badge 🚨 |
|---|---|
| Au moins 1 alerte `emergency` non acquittée | 🚨 **rouge pulsant** |
| Sinon, au moins 1 `warning` | 🚨 **orange** |
| Sinon, seulement `info` | 🚨 **bleu discret** |
| Aucune alerte active | 🚨 **gris neutre** |

**Pastille compteur** : si plusieurs alertes non acquittées coexistent, un petit cercle rouge avec le chiffre apparaît en haut-droite du badge.

Au clic, le bouton 🚨 force le re-affichage de TOUTES les alertes actives en cascade (même celles déjà acquittées) :

| État serveur | Modale affichée |
|---|---|
| Alertes actives | Cascade des alertes triées par priorité |
| Aucune alerte active | **Modale verte sobre** "✅ Aucune alerte en cours" |
| Hors ligne | Modale neutre "📡 Vérification impossible — réessayez avec du réseau" |

> 💡 Si vous voyez encore l'alerte en mémoire après plusieurs jours mais voulez vérifier l'état officiel, cliquez 🚨 — vous saurez immédiatement si la situation est toujours d'actualité ou si elle est résolue.

> ⚠️ Ce système est destiné à des alertes **importantes pour la sécurité de la communauté**. Il ne sert pas à des messages commerciaux ou promotionnels.

---

### 🌐 Migration vers `myktamap.fr` (depuis v163)

L'application change de domaine officiel. À partir du **15 juillet 2026**, la nouvelle adresse sera **`myktamap.fr`** (au lieu de l'actuelle `myktamap.is-underground.fr`).

**Comment es-tu informé ?**

Une **alerte info permanente** (badge 🚨 bleu) est diffusée via le système d'alertes publiques. Tu la consultes quand tu veux en cliquant sur le badge 🚨 dans le header du loader. L'alerte affiche la date de coupure + la checklist complète des données à exporter avant migration.

**Que faire pour migrer mes données ?**

Tes données (liste de plans, sessions, préférences) sont **liées au domaine** (règle de sécurité web — origins isolés). Elles ne suivront PAS automatiquement. Tu dois agir avant la coupure :

1. **📚 Exporte ta liste de plans** : dans le loader, section **📚 Mes plans** → bouton **💾** → télécharge un fichier `.config` qui contient tous tes plans enregistrés (métadatas + références). Sur le nouveau domaine, tu importeras ce `.config` via le bouton **📂** au même endroit.
2. **💾 Exporte tes sessions** : sur chaque plan ouvert, utilise **💾 Sauvegarde session** (Full ou Avancé) → télécharge un `.json` par session (annotations, tracés, zones, points perso en cours).
3. **📦 Garde tes ZIPs de plans** que tu avais importés. Les blobs locaux stockés dans le navigateur ne sont pas exportables — il faudra ré-importer les ZIPs manuellement sur le nouveau domaine via le drag-and-drop habituel.
4. **Au 15 juillet 2026** : va sur `myktamap.fr` → importe le `.config` de liste de plans + ré-importe les ZIPs + importe les `.json` de session sur chaque plan correspondant.
5. **📱 Si tu avais installé l'app sur ton écran d'accueil** (PWA) : tu devras supprimer l'ancienne icône manuellement puis réinstaller depuis `myktamap.fr` (les origins étant différents, l'icône installée pointe sur l'ancien domaine).

**Pendant la transition (jusqu'au 15 juillet 2026)** : les 2 domaines fonctionneront en parallèle. Tu peux continuer à utiliser ce site comme avant, et migrer à ton rythme.

**Après le 15 juillet 2026** : l'ancien domaine affichera une page de transition qui te redirigera automatiquement vers `myktamap.fr`. La PWA installée se désactivera automatiquement à son prochain check de mise à jour (≤24h après la coupure).

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


### 🎬 Animation au démarrage

Au lancement de l'application (ouverture de l'app PWA, refresh de la page, premier accès), une **animation de bienvenue** s'affiche pendant environ 4 secondes :

- **Logo** MyKTAMap (rose des vents jaune)
- **Titre** et sous-titre
- **Barre de chargement** dorée
- **Signature de l'auteur** et mention de licence

Cette animation **n'apparaît qu'une seule fois par session**. Si vous changez de plan via 🗂️ ou ▶️ Reprendre, elle ne se ré-affiche pas — vous restez dans votre session active.

> Pour la revoir, fermez l'application puis relancez-la depuis votre icône d'accueil (PWA) ou rafraîchissez la page (F5 sur PC).

### 📦 Charger un plan

Au démarrage, l'application affiche un **écran d'accueil** qui regroupe :

- **▶️ Reprendre [nom]** — relance le dernier plan utilisé en 1 clic.
- **📚 Mes plans** — la liste de tous les plans que vous avez déjà chargés (serveur ou ZIP local), triée du plus récemment ouvert au plus ancien. Les plans serveur disponibles sont **auto-découverts** au démarrage et apparaissent ici.
- **📦 Charger un nouveau plan** — pour ajouter un ZIP à votre liste.
- **🏗️ Générer un plan** — ouvre le générateur de plan from scratch.

**Trois manières d'ajouter un plan :**

1. **Importer un ZIP local** — glissez-déposez votre archive sur la zone prévue, ou cliquez pour la sélectionner. Cliquez ensuite sur **Charger le plan**. Le plan s'ajoute automatiquement à votre liste pour les prochaines fois.
2. **Cliquer sur un plan déjà connu** — dans **📚 Mes plans**, un clic relance directement un plan déjà ouvert (serveur 🌐 ou local 💾).
3. **🏗️ Générer un plan** — bouton en bas dans "Plus d'options" pour créer un plan from scratch.

### 📚 Gestion de votre liste de plans

L'application mémorise tous les plans que vous chargez, qu'ils viennent du serveur ou de votre disque local.

**Sur l'écran d'accueil :**

| Symbole | Signification |
|---|---|
| 🌐 | Plan serveur (sous-dossier de `data/`) |
| 💾 | Plan ZIP local |
| ✅ | Plan local **mémorisé dans l'app** (rechargement instantané, fonctionne hors-ligne) |
| 🔐 | Plan local avec **accès permanent autorisé** (Chrome/Edge desktop) |
| 📁 | Plan local sans persistance — re-sélection requise au chargement |

**Actions disponibles** sur chaque ligne :

- **▶️** — charge le plan
- **✕** — retire le plan de la liste (ne supprime pas le fichier ZIP sur votre disque, juste l'entrée dans la liste)

**Boutons en haut de la liste :**

- **💾 Exporter ma liste** — télécharge un fichier `myktamap_plans_AAAAMMJJ.config` que vous pouvez sauvegarder ou partager.
- **📂 Charger une liste** — importe un fichier de liste précédemment exporté. Trois choix : Remplacer, Fusionner, ou Annuler.

> 💡 **Astuce** — Si vous changez de PC ou de téléphone, exportez votre liste sur l'ancien appareil puis importez-la sur le nouveau pour retrouver tous vos plans en un clic. Note : les autorisations d'accès aux fichiers ne sont pas portables (vous devrez re-sélectionner les ZIP locaux la première fois sur le nouvel appareil).

### 🔐 Éviter de re-sélectionner le ZIP à chaque ouverture

Selon votre plateforme, deux options de persistance s'affichent sous la zone d'import :

#### Sur Chrome / Edge (PC)

Cliquez sur **🔐 Autoriser l'accès permanent au fichier**. Le navigateur retient une référence vers votre ZIP. Aux prochaines ouvertures du plan depuis votre liste, le rechargement se fait en **0 ou 1 clic** (Chrome peut redemander une confirmation rapide après un redémarrage du navigateur).

#### Sur mobile, Firefox, Safari

Cochez **💾 Mémoriser ce plan dans l'app** avant de cliquer sur Charger. Le ZIP est copié dans l'espace local du navigateur. Aux prochaines ouvertures :

- **0 clic**, le plan se charge directement
- Fonctionne **hors-ligne** (le ZIP est dans le navigateur, pas besoin de retrouver le fichier)
- Recommandé sur **mobile**

> ⚠️ **Limites de stockage** :
> - **iPhone (Safari classique)** : ~50 Mo, peut être effacé après inactivité prolongée
> - **iPhone (PWA installée)** : jusqu'à 1 Go, persistant
> - **Android Chrome** : plusieurs Go disponibles
> - **PC** : très large
>
> Pour une persistance maximale sur iPhone, **installez l'application en PWA** (voir section 📱) avant de mémoriser vos plans.

> ⚠️ Si le quota est dépassé, un avertissement s'affiche et le plan reste utilisable mais demandera une re-sélection à chaque ouverture.

### 🗂️ Découverte automatique des plans serveur

Si l'application est hébergée sur un serveur avec plusieurs plans dans `data/` (par exemple `data/test1/`, `data/test2/`...), elle peut les détecter automatiquement via un fichier `data/index.json` :

**Format minimal** :
```json
{ "plans": ["test1", "test2"] }
```

**Format détaillé** (recommandé pour afficher les noms tout de suite) :
```json
{
  "plans": [
    { "id": "test1", "path": "data/test1", "name": "Plan Test 1", "version": "V1" },
    { "id": "test2", "path": "data/test2", "name": "Plan Test 2", "version": "V1" }
  ]
}
```

Au démarrage, ces plans apparaissent dans **Mes plans** marqués comme « découvert » et peuvent être chargés d'un clic.

### 🎚️ Drawer "Réglages de performance" (chargeur)

Dans le chargeur, un encadré dépliable **🎚️ Réglages de performance** regroupe deux blocs liés à l'optimisation, **fermé par défaut** pour ne pas encombrer visuellement le loader. Cliquez sur le titre pour déplier — le contenu apparaît avec un séparateur visuel entre les deux blocs.

**Contenu de la drawer** :

1. **🖼️ Tiling de l'image (par plan)** — segmented control 5 presets (voir détail ci-dessous), qui choisit comment l'image principale est découpée en mémoire au chargement. Mémorisé **par plan** (un plan en Performance, un autre en Qualité, etc.).

2. **🚀 Mode Performance ULTRA (tracés / markers)** — 6 toggles d'optimisation qui ne touchent **PAS** à l'image (déjà couvert par le Tiling ci-dessus) mais à tout le reste (polylines, popups, intersections, auto-save, viewport culling). Préférence **globale**, conservée entre sessions. Voir section "🚀 Optimiser ton plan" plus bas pour le détail.

### 🎚️ Mode performance — 5 presets

Le bloc **Mode performance** dans le chargeur permet de choisir comment afficher votre plan, avec 5 modes présentés comme un sélecteur (à la manière du DLSS dans les jeux vidéo) :

| Bouton | Pour quel cas ? |
|---|---|
| 💤 **Désactivé** | **Aucun découpage du tout.** Image affichée brute (qualité native, mais ⚠️ peut planter sur mobile pour les très gros plans). À utiliser uniquement si vous savez que votre appareil tient. |
| 🔄 **Auto** *(défaut)* | L'app décide selon la taille du fichier — activé si le plan dépasse 60 Mo. **Recommandé pour la plupart des cas.** |
| 🌟 **Qualité** | Plans très détaillés à zoomer profondément. **Recommandé sur PC desktop** avec assez de RAM. Image plus nette. |
| 🎯 **Équilibré** | Compromis entre netteté et fluidité. Reproduit le mode "Performance" historique de l'app. |
| ⚡ **Performance** | **Mobile faible**, plans très lourds, urgence terrain. Image un peu plus floue mais charge bien plus vite. |

Cliquez sur un bouton avant de charger — la description sous le sélecteur change pour vous expliquer ce qu'il fait.

**Le réglage est mémorisé pour chaque plan** : si vous chargez un plan en "Performance", la prochaine fois que vous l'ouvrirez via 📚 Mes plans, il s'ouvrira directement en "Performance". Pour changer le réglage d'un plan déjà mémorisé, ré-importez son ZIP en sélectionnant un autre mode dans le sélecteur.

### 💾 Sauvegarde automatique de votre session

Vos **annotations en cours** (points ajoutés, tracés, zones, mesures) sont automatiquement sauvegardées en arrière-plan toutes les ~1,5 secondes. Ainsi, si vous fermez l'application et la rouvrez via **▶️ Reprendre**, votre travail est restauré.

**Comment ça marche :**
- À chaque modification, votre session est sauvegardée dans le navigateur (un seul "slot" — la session courante remplace la précédente)
- Au prochain lancement, si vous cliquez sur **▶️ Reprendre [nom du plan]**, votre session est restaurée — une **fenêtre centrée** vous confirme avec le détail (*"3 points · 1 tracé · 2 zones"*)
- La fenêtre vous propose deux actions : **🗑️ Effacer la session** (commencer ce plan avec une session vierge) ou **✓ Continuer** (garder la session restaurée). Cliquer en dehors ou appuyer sur Échap = Continuer.

**Important :**
- Si vous **chargez un autre plan** entre deux ouvertures, la session précédente est perdue (un seul slot, dernière session active "gagne")
- Le **chemin du tracker** n'est pas restauré (le tracker étant expérimental, ressusciter une trail figée serait trompeur)
- Le **💥 Tout réinitialiser** efface aussi votre session sauvegardée
- Pour conserver une session importante au-delà de l'auto-save, utilisez **⬆️ Exporter la session JSON** (sauvegarde explicite que vous pouvez ré-importer plus tard)

### 🐛 Logs détaillés (mode debug)

Le bouton **🐛 Logs détaillés** dans "Plus d'options" du chargeur active un mode verbose :
- Logs supplémentaires dans la console (capteurs du tracker, étapes du tiling)
- Affichage des **chiffres techniques** sous le sélecteur Mode performance (tailles de tuile, qualité JPEG, seuil de déclenchement)

Utile pour signaler un problème ou comprendre ce qu'il se passe sous le capot. Désactivé par défaut. Réglage aussi accessible depuis ⚙️ Réglages > Logs détaillés.

### ⚠️ Si l'application s'arrête brusquement

Sur smartphone, le système d'exploitation (iOS / Android) peut **fermer brutalement les applications qui consomment trop de mémoire**. Quand ça arrive, la prochaine fois que vous lancez MyKTAMap, une **fenêtre rouge "ATTENTION — ARRÊT BRUTAL DÉTECTÉ"** apparaît juste après le splash pour vous prévenir.

La fenêtre détaille :
- **Pourquoi** ça s'est produit (mémoire saturée la plupart du temps)
- **Comment éviter que ça recommence** : fermer les autres applications en arrière-plan, baisser le mode performance dans le loader, éviter d'ouvrir trop d'onglets de navigateur en parallèle, garder le smartphone à jour, exporter régulièrement votre session pour ne rien perdre

Si vous voyez cette fenêtre **régulièrement**, c'est le signe qu'il faut **réduire le mode performance** (Performance < Équilibré < Qualité, niveau de RAM décroissant).

### 📡 Utilisation hors connexion

MyKTAMap fonctionne **entièrement hors connexion** une fois le plan chargé une première fois.

L'application utilise un **Service Worker** qui met en cache automatiquement tous les fichiers nécessaires (interface, images, données). Au premier chargement avec connexion Internet, tout est sauvegardé localement.

**Pour préparer une sortie hors connexion :**

1. Ouvrez l'application **avant de partir**, avec une connexion disponible
2. Chargez votre plan complet — sur mobile, **cochez « 💾 Mémoriser dans l'app »** pour pouvoir le ré-ouvrir sans re-sélectionner le fichier
3. Naviguez quelques secondes pour que tous les fichiers soient mis en cache
4. Vous pouvez maintenant fermer l'application et passer en zone sans réseau — elle restera fonctionnelle

> Si une nouvelle version est disponible avec connexion, l'application se mettra à jour automatiquement au prochain chargement.

### ⚠️ Si un plan ne charge plus

Si vous cliquez sur un plan dans votre liste et qu'une fenêtre **« ⚠️ Plan introuvable »** apparaît, c'est que les données de ce plan ne sont plus accessibles. Causes typiques :

- **Vidage du cache** du navigateur (les ZIP mémorisés ont été supprimés)
- **Import d'une liste depuis un autre appareil** (la liste a été restaurée mais pas les ZIP eux-mêmes)
- **Réinstallation de l'application** ou changement de navigateur
- **Plan serveur déplacé/supprimé** (404)
- **Quota de stockage atteint** (le navigateur a purgé les données automatiquement)

La fenêtre vous propose 3 actions :

- **🔄 Réessayer** (plans serveur uniquement) — utile si le serveur était temporairement indisponible
- **📁 Re-sélectionner le ZIP** (plans locaux) — ouvre votre explorateur de fichiers pour retrouver le ZIP. Si vous avez activé "Mémoriser ce plan dans l'app" ou "Accès permanent", la persistance sera **automatiquement restaurée** après la nouvelle sélection
- **🗑️ Retirer de la liste** — si vous ne possédez plus le plan, supprimez son entrée de votre liste

> 💡 **Conseil** : exportez régulièrement votre liste via 💾 (icône en haut à droite de **📚 Mes plans**) pour pouvoir la restaurer en cas de souci.

### 💥 Tout réinitialiser

Si vous voulez remettre l'application **à l'état initial** (comme un premier lancement), un bouton **💥 Tout réinitialiser** est disponible à deux endroits :

- Dans **⚙️ Réglages** depuis l'application
- Dans **⚙️ Plus d'options** sur l'écran d'accueil (loader)

⚠️ **Cette action est irréversible** et efface :
- Le cache de l'application (mode hors-ligne désactivé jusqu'à reconnexion)
- Votre **liste de plans** (entrées supprimées)
- Les **ZIP mémorisés dans le navigateur** (perdus)
- Vos **préférences** (mode performance par plan, options de tracker, logs détaillés, etc.)

L'application demande **deux confirmations** avant d'exécuter le reset, et vous rappelle d'**exporter votre liste** au préalable si vous souhaitez la conserver.

> 📡 **Vérification connexion** : avant la première confirmation, l'application teste rapidement votre connexion Internet (max 5 secondes). Si vous êtes **hors ligne**, une **fenêtre rouge supplémentaire** vous prévient que l'application sera **inutilisable** après le reset (le cache vide ne pourra pas être rerempli sans réseau). Reconnectez-vous au Wi-Fi ou aux données mobiles avant de relancer le reset, ou cliquez "Continuer quand même" si vous savez ce que vous faites.

> Utile en cas de souci persistant, ou pour tester l'application "comme un nouvel utilisateur" lorsque vous publiez ou partagez votre travail.

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
| **Tracés** | 🛣️ | Tracer routes principales, secondaires, chemins, **calculer la distance totale** |

> 💡 **Calque "Mes annotations"** dans le contrôle des couches Leaflet (en haut à droite de la carte) : ce calque regroupe tes points ajoutés et zones tracées en session. Décocher la case les masque, recocher les réaffiche. **L'itinéraire, la mesure, le tracker** ne sont pas affectés (cycle de vie propre).
| **Zones** | ⬛ | Tracer des zones de remblais, effondrement ou eau |

**Comment ça marche :**

- **Un seul groupe ouvert à la fois** — appuyer sur un autre groupe ferme le précédent
- **Quand un mode est actif** (mesure, ajout, route, zone, recalage), le groupe **reste ouvert** pour que tu puisses accéder rapidement aux actions associées (effacer un point, etc.). L'icône principale change pour refléter le mode en cours
- **Toucher en dehors** du groupe ouvert le ferme automatiquement
- **Sur mobile en paysage**, la barre devient scrollable verticalement si elle dépasse de l'écran

### 🔄 Changer rapidement de plan via le titre

Le **titre du plan en cours** affiché en haut de l'écran est **cliquable** : il ouvre un petit menu déroulant avec :

- **📚 PLANS RÉCENTS** — les 3 derniers plans que tu as ouverts (hors plan en cours)
- **📚 Tous mes plans…** — pour revenir à l'écran d'accueil avec la liste complète

Au clic sur un plan dans le menu :

- Si ta **session est vierge** (aucune annotation, route, zone ou mesure) → le plan se charge **directement** sans confirmation
- Si tu as **des modifications en cours** → une fenêtre t'avertit avec la **liste exacte** de ce que tu vas perdre :
  ```
  ⚠️ Session en cours
  Vous avez des modifications non enregistrées :
     • 5 points ajoutés
     • 2 tracés
     • 1 zone
  Charger « Plan Test 1 » va vous faire perdre ces modifications.
  [Annuler]   [Charger quand même]
  ```

> 💡 Cette fonction te permet de basculer entre tes plans favoris en **2 clics** sans repasser par l'écran d'accueil. Pour fermer le menu sans rien faire : clique ailleurs ou appuie sur **Échap**.

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
2. (Optionnel) Cochez des **chips de filtre** sous le champ pour restreindre par calque ou par tag
3. Tapez votre recherche dans le champ — les résultats s'affichent en temps réel
4. Naviguez avec les flèches **↑** / **↓** ou avec le curseur
5. Validez avec **Entrée** ou par un clic sur le résultat
6. La carte se centre sur le point avec un **cercle orange** autour pour le repérer, et le popup d'information s'ouvre

### 🎚️ Filtres (calques + tags)

Sous le champ de recherche, deux lignes de chips :

- **Calques** : un chip par calque (Puits, Carrière, Mes ajouts, etc.). Cliquez pour activer (jaune) ou désactiver. Aucun chip actif = tous les calques affichés.
- **Tags** : un chip par tag rencontré dans les points (pa, ouvert, fermé, aeration, etc.). Mêmes règles.

**Logique de combinaison** :
- **Plusieurs chips dans la même ligne** = OR (n'importe lequel)
- **Entre les deux lignes** = ET (calque ∈ {sélection} ET tag ∈ {sélection})
- Le champ texte reste un filtre supplémentaire (en ET)

Le bouton **✕ Effacer les filtres** apparaît à droite du compteur quand au moins un chip est actif. Les filtres sont **réinitialisés à chaque ouverture** de la fenêtre de recherche.

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

Appuyez sur **▶️** pour démarrer.

**Au premier démarrage de la session**, une popup d'avertissement s'affiche pour rappeler que le tracker est un **module expérimental** : il sert à valider le calibrage / la détection de pas / la formule de heading, **pas à se localiser réellement**. Cliquez sur **« J'ai compris — Démarrer »** pour continuer (la popup ne réapparaîtra plus avant le prochain reload de la page). Sur Mobile, la demande de permission iOS / Android pour les capteurs s'affiche ensuite — acceptez-la.

Une icône apparaît sur le plan à votre position de départ. Elle se déplace au fur et à mesure de votre marche, et un tracé enregistre votre chemin parcouru.

> 🧭 **Icône directionnelle (depuis v158)** : pendant le tracking actif, l'icône (cône bleu + dot blanc, style GPS) **tourne en temps réel pour pointer dans la direction de marche** — calculée depuis le heading du téléphone (même source que la boussole 🧭). Au repos (tracker arrêté ou recalage seul), l'icône pointe Nord (pose neutre). Smoothing intégré pour éviter le tremblement.

Appuyez sur **⏹️** pour arrêter.

> ⚠️ **Important** : la dérive cumulative est inévitable. Recalez votre position manuellement (📍 ci-dessous) tous les ~50m sur un point reconnu du plan. Les armatures métalliques des carrières et galeries faussent fortement le magnétomètre du téléphone — une vraie boussole physique reste indispensable.

### 🧭 Boussole — vérifier la cohérence du heading

Le bouton **🧭** dans le groupe **🧭 Tracker** affiche une **rose des vents flottante** en haut à gauche de la carte (sous les boutons de zoom). La rose contre-tourne en temps réel pour que le **N pointe toujours vers le vrai Nord**.

> 🆕 **Depuis v157** : nouvelle rose dédiée à la boussole avec **N/S/E/W marqués clairement** + flèche rouge sur le Nord. Beaucoup plus lisible à l'usage que l'ancienne version qui utilisait le logo MyKTAMap (rose stylée charte). Le logo d'origine reste utilisé pour le splash/loader (identité visuelle).

**Comment vérifier que tout est cohérent ?**

Tenez le téléphone à plat dans la main, écran face à vous, **bord supérieur du téléphone dans votre direction de marche** (pose "boussole"). En tournant sur vous-même :

| Direction de marche | Le N de la rose doit être... |
|---|---|
| Nord 🧭 | En haut (12h) |
| Est ➡️ | À gauche (9h) |
| Sud 🧭 | En bas (6h) |
| Ouest ⬅️ | À droite (3h) |

Si l'orientation est cohérente, le tracker enregistre correctement vos déplacements. Sinon, suspectez une perturbation magnétique (armatures, ferraille, sol) — recalez via 📍 dès que possible et limitez la confiance dans le tracé.

**Cliquez sur le widget** pour ouvrir un **affichage agrandi** plein écran (rose 240px + cardinal en gros + angle exact). Pratique pour valider de loin ou faire une démo. Refermer via ✕, Échap ou en cliquant à côté.

Le widget reste affiché même quand le tracker est à l'arrêt — vous pouvez l'utiliser pour valider la boussole sans démarrer le tracking. ✕ du widget pour le fermer entièrement.

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

### 🗺️ Calculer un itinéraire

Le bouton **🗺️** dans le groupe **🧭 Tracker** ouvre la modale d'itinéraire. Elle calcule le **chemin le plus court** entre 2 ou plusieurs points en empruntant les **routes existantes** du plan (à la fois celles que vous avez tracées et celles présentes dans les calques de données).

**Pour tracer un itinéraire :**

> 💡 **Bouton 🧭 Ma position** — ajoute ta position tracker actuelle comme waypoint (snapshot figé). Pratique si tu marches dans la cata avec le tracker actif et tu veux calculer un itinéraire qui démarre d'où tu es. Si tu as recalé ta position au début, c'est cette position recalée qui est utilisée.

> 🚀 **Astuce perf** : si tes routes sont déjà dessinées en dur sur le PNG du plan, tu peux **masquer le calque des routes** dans le contrôle des couches Leaflet (haut-droite). Tu gardes la lisibilité visuelle (le PNG montre les routes) ET tu gagnes en perf de rendu (Leaflet ne dessine pas les polylines des données par-dessus). Le module **🗺️ Itinéraire continue de fonctionner** : il utilise toutes les routes du calque, qu'elles soient affichées ou non.

1. Ouvrez la modale **🗺️ Calculer un itinéraire**
2. Choisissez vos **points de passage** de 2 façons (combinables) :
   - **📍 Mode clic carte** : la modale se réduit à un mini-bandeau "Mode clic actif", cliquez sur la carte pour poser chaque waypoint (markers cyan numérotés). Bouton **✓ Terminer** pour revenir à la modale.
   - **🔍 Recherche** : tapez le nom, l'id ou un tag d'un point existant ; cliquez dans la liste de suggestions pour l'ajouter.
3. Vous pouvez **retirer** un waypoint avec le bouton ✕ à droite de chaque ligne.
4. Cliquez **🎯 Calculer l'itinéraire** : un tracé **cyan néon** apparaît, l'app vous indique la **distance totale en mètres** et le nombre de tronçons traversés.
5. **💾 Enregistrer** garde l'itinéraire dans la session, **❌ Effacer** le retire.

**Étiquette de distance** : tant qu'un itinéraire est actif, un petit label **🗺️ Itinéraire : XX m · ⏱️ temps · 🚶 mode vitesse** s'affiche en bas à gauche de la carte, juste au-dessus du label de mesure de distance classique.

**🏃 Vitesse de marche estimée** (segmented control dans la modale) — 4 presets pour ajuster l'estimation du temps de parcours :

| Mode | Vitesse | Quand l'utiliser |
|---|---|---|
| 🍺 **Bourré** | 2 km/h | Très lent, hésitant, terrain accidenté, fin de soirée |
| 🐌 **Lente** | 3 km/h | Prudente, étroitures, exploration, transport de matos |
| 🚶 **Normale** | 5 km/h | Défaut, allure standard de marche cataphile |
| 🏃 **Rapide** | 7 km/h | Allure soutenue, parcours connu, retour rapide |

Le mode actif est affiché à côté du temps estimé dans le label bottomleft. Le choix est persisté entre sessions (localStorage). Tu peux changer de mode à tout moment via la modale, le temps se met à jour instantanément.

**Mode navigation** — quand un itinéraire est déjà actif et que vous rouvrez **🗺️ Calculer un itinéraire**, la modale bascule en **mode navigation** :

- Boutons rapides **⏮️ Début** (centre la carte sur le 1er waypoint avec un cercle cyan flash), **⏭️ Fin** (idem pour le dernier), **🔁 Tour complet** (zoom pour voir tout le tracé).
- Bouton **🎯** sur chaque waypoint pour aller le voir directement.
- **🔄 Recalculer** repasse en mode édition (les waypoints sont conservés, vous pouvez les retoucher).
- **❌ Effacer l'itinéraire** retire complètement le tracé.

**Tolérance** : l'algorithme accepte que vos points de départ ou d'arrivée soient un peu **à côté** des routes — il les snappe automatiquement sur le réseau le plus proche. Si plusieurs roads se croisent visuellement mais sans partager exactement un même point (cas typique d'un tracé fait à la main), l'app gère aussi les **jonctions à 15 px près** pour tracer le chemin sans coupure.

> 💡 **Astuce** : si vous voulez voir uniquement le tracé sans le label distance, fermez la modale puis ré-ouvrez-la en mode navigation pour utiliser les boutons de pilotage.

### ⛑️ Mode urgence — "Je suis perdu"

Le bouton **⛑️** orange dans le groupe **🧭 Tracker** ouvre le mode urgence. Il estime la **zone probable où vous pouvez être maintenant** à partir de votre dernière position connue, du temps écoulé et d'**indices visuels** que vous observez autour de vous.

> ⚠️ **Le mode urgence est une aide géométrique. Il ne remplace PAS** : un fil d'Ariane, une boussole, une lampe avec piles de rechange, une carte papier, et la règle d'or de prévenir quelqu'un avant la sortie. Si vous êtes vraiment perdu : restez calme, ne paniquez pas, économisez votre lumière, et signalez votre position si vous avez du réseau.

**Comment ça marche :**

1. **📍 Dernière position connue** — renseignez où vous étiez sûr d'être il y a X minutes :
   - 🔎 **Recherche** d'un point existant par nom/id (ex: "PA1", "salle", "épure XYZ")
   - 📍 **Clic carte** — clic direct sur la carte pour placer un repère
   - 🧭 **Position tracker** — utilise la position actuelle du tracker s'il est actif

2. **⏱️ Temps écoulé** — slider de 1 à 90 minutes (1h30 max). Au-delà, la zone devient si large que le mode n'est plus pertinent — privilégiez alors un signalement de secours réel.

3. **🏃 Vitesse de marche présumée** — un segmented control 4 presets. Le rayon final = `vitesse × temps`. Les valeurs km/h sont **les mêmes que le mode itinéraire** pour la cohérence (un preset "Normale" représente la même vitesse partout dans l'app).

   | Preset | Vitesse | Rayon pour 10 min | Quand l'utiliser |
   |---|---|---|---|
   | 🍺 **Bourré** | 2 km/h | ~333 m | Très lent, confus, désorienté, marche hésitante |
   | 🐌 **Lente** | 3 km/h | ~500 m | Marche prudente, étroitures, exploration |
   | 🚶 **Normale** *(défaut)* | 5 km/h | ~833 m | Allure standard de marche |
   | 🏃 **Rapide** | 7 km/h | ~1167 m | Parcours connu, marche soutenue |

   Le choix est persisté entre sessions (localStorage). Si la zone est déjà affichée sur la carte, changer de preset la recalcule instantanément.

4. **🔮 Indices visuels (optionnel mais très utile)** — texte libre, séparé par virgule ou retour ligne. Exemples : *"bidon eau, épure bélier, salle bleue, puits cassé, escalier descend"*. L'app cherche ces mots dans le **nom**, la **description** et les **tags** de tous les points du plan (calques et points session combinés).

5. Cliquez **🎯 Calculer la zone**.

**Ce qui apparaît sur la carte :**

| Élément | Signification |
|---|---|
| **Cercle orange pulsant** | Zone de recherche (rayon = vitesse × temps) |
| **📍 vert pulsant** | Votre dernière position connue |
| **🔮 violet pulsant** | Indice texte qui matche ET est **dans la zone** (le plus important) |
| **· gris** | Indice texte qui matche mais est **hors zone** (exclu) |
| **Cercle violet intérieur** | Localisation probable affinée (barycentre des indices in-zone) — apparaît seulement s'il y a au moins 1 match in-zone |

**⚠️ Si la zone dépasse les bornes du plan** (rayon trop grand vs taille du plan), une bande d'alerte orange dans les résultats vous le signale : *"Le rayon dépasse la taille du plan — tu pourrais être n'importe où"*. Diminuez le temps écoulé ou affinez avec des indices.

**Actions disponibles dans les résultats :**

- **📋 Copier le rapport** — copie un texte structuré dans le presse-papiers (plan, position, temps, indices, loc affinée, timestamp) pour partager par SMS, radio ou tout autre moyen de communication.
- **✅ Supprimer la zone et sauvegarder ma position supposée** — retire la zone de recherche de la carte ET ajoute un point éditeur permanent (icône ⚠️ danger) à la localisation probable. Tu peux ensuite l'exporter ou le convertir comme n'importe quel autre point.
- **🗑️ Effacer la zone et fermer** — retire la zone et les markers de la carte sans sauvegarder de point.

**👁️ Fermer la modale sans effacer la zone** : le bouton **👁️ Fermer** (et la croix ✕ en haut, et le clic en dehors de la modale) ferment juste la modale. La zone reste visible sur la carte pour que vous puissiez explorer ; rouvrir **⛑️** restaure tous vos paramètres précédents.

> 💡 **Cas d'usage type** — vous êtes sorti(e) du dernier puits identifié il y a 20 minutes, vous marchez depuis sans tracker, et vous voyez maintenant *"une épure 'Bélier' sur le mur, et un bidon d'eau au sol"*. Ouvrez ⛑️, sélectionnez le puits comme dernière position, mettez 20 min, tapez `bélier, bidon` dans les indices. L'app vous montre la zone probable et — s'il y a un point nommé "épure Bélier" dans le plan qui tombe dans la zone — un cercle violet à cet endroit.

#### 📚 Bonnes pratiques quand on est perdu

Le mode ⛑️ inclut un **bloc dépliable "📚 Bonnes pratiques"** en haut de la modale (clique pour ouvrir). Il regroupe les conseils essentiels en 6 sections, à lire calmement si la situation l'exige :

**🧘 Garde ton calme (d'abord)** — Stop. Inspire. La panique fait perdre les repères et gaspille lumière + énergie. Mange/bois un peu si tu as quelque chose.

**🗺️ Orientation** — **Reviens sur tes pas** plutôt que chercher à atteindre ta destination (statistiquement plus fiable). Cherche les **axes principaux** (roulages, galeries droites, voies ferrées) qui mènent à des repères connus. **Utilise une boussole physique** — pas celle du téléphone (faussée par le sol et les armatures). **Écoute les bruits** : circulation, métro, eau qui coule = indice de direction.

**🔦 Lumière & ressources** — Mode économie immédiatement. Garde une lampe de secours. Hydrate-toi un peu mais économise.

**📡 Communication** — Si tu **captes du réseau** (souvent près des puits / regards) → préviens quelqu'un en surface AVANT que ta batterie meure. Utilise le bouton **📋 Copier le rapport** pour préparer un message tout fait avec ta dernière position + le temps écoulé.

**📍 Si tu décides d'attendre** — Pose-toi à un endroit **identifiable** (puits numéroté, salle nommée). Reste où tu es si **personne ne sait que tu es là**. Marque ton emplacement pour qu'on te trouve.

**⚠️ À ne pas faire** — Ne suis pas l'eau (diaclases dangereuses). Ne tente pas un passage inconnu juste parce qu'il "monte". Ne te fie pas au tracker téléphone (il dérive sous stress).

> ⚠️ Ces conseils sont des **principes généraux** issus de la pratique cataphile. Ils ne remplacent pas la formation, l'équipement et le bon sens. La règle d'or reste : prévenir quelqu'un en surface AVANT la sortie, avec heure de retour estimée.

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

### 🎨 Types d'icônes disponibles

L'application propose un set d'icônes par défaut, regroupées par catégorie :

| Catégorie | Types disponibles |
|---|---|
| 🕳️ **Puits** | Aération, Bouché, Comblé, Au sol / Bassin, Extraction |
| 🪜 **Accès** | Puits à échelon (ouvert / fermé), Escalier service (ouvert / fermé), Cavage (ouvert / fermé) |
| ⚠️ **Signalétique** | Salle, Chatière, Passage, Danger, Information, Électricité, Épure, Véhicule |

> 💡 Les icônes **Accès** suivent un code couleur intuitif : **vert = ouvert**, **rouge = fermé**. Pratique pour repérer en un coup d'œil les passages utilisables.

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
- **🪜 Jonction interniveau** — magenta pointillé (avec des ronds blancs aux extrémités). **Apparaît uniquement si le plan est en mode multi-niveau** — sert à relier deux étages (escalier, pente raide, puits interne). Voir la section **🏗️ Mode multi-niveau** plus bas pour les détails.

Pour tracer : appuyez sur le bouton correspondant → cliquez sur le plan pour poser des points → appuyez à nouveau pour arrêter.

### 📏 Distance totale des tracés

Le bouton **📏 Distance totale** dans le groupe **🛣️ Tracés** ouvre une fenêtre qui calcule la **somme des longueurs** de tous vos tracés visibles, avec un filtre par type.

**Comment ça marche :**

1. Appuyez sur **📏** — la fenêtre s'ouvre avec 3 cases cochées (Principal, Secondaire, Chemin)
2. Décochez les types que vous voulez exclure du calcul
3. Le **total en mètres** se met à jour instantanément, et les tracés inclus sont **surlignés en magenta** sur la carte (halo lumineux pour bien les voir)
4. Pour chaque type, la fenêtre affiche le **nombre de tracés** et leur **longueur cumulée**
5. Deux options de sortie :
   - **✓ Fermer (garder le surlignage)** — la fenêtre se ferme mais le **surlignage magenta reste affiché** sur la carte. Vous pouvez explorer la carte avec les tronçons toujours visibles, et re-cliquer **📏** pour rouvrir la fenêtre (les filtres précédents sont conservés).
   - **❌ Effacer le surlignage** — retire le halo magenta de la carte ET ferme la fenêtre.

> 💡 Le calcul inclut **toutes** les routes visibles : celles que vous avez tracées dans la session ET celles présentes dans les **calques de données** activés. Si vous masquez un calque dans le contrôle des couches, ses routes sortent automatiquement du calcul.
>
> ℹ️ Cette mesure est **uniquement à l'écran** — elle n'apparaît pas dans la légende de l'export image PNG.

### 🧹 Effacer un tracé

Appuyez sur **🧹**. Une fenêtre s'ouvre avec trois options :

| Option | Effet |
|---|---|
| **↩️ Dernier point du tracé** | Annule uniquement le dernier point cliqué sur le tracé en cours (idéal pour corriger un point mal placé) |
| **✂️ Dernier tracé entier** | Supprime le dernier tracé complet (utile si tu veux refaire un tracé sans toucher aux précédents) |
| **🗑️ Tous les tracés** | Efface absolument tous les tracés (irréversible) |
| Annuler | Ferme la fenêtre sans rien supprimer |

> Exemple d'usage : tu traces une route principale, tu te trompes sur le dernier virage. Clique **🧹 → ↩️ Dernier point du tracé** pour reculer d'un point, puis continue ton tracé normalement.

> 💡 **Jonctions interniveau (mode multi-niveau)** : les jonctions 🪜 sont traitées comme des tracés normaux par 🧹. **Dernier tracé entier** supprime la dernière jonction si elle est la plus récente ; **Tous les tracés** efface routes ET jonctions ; **Sélection au clic** fonctionne aussi sur une jonction.

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

## 🏗️ Mode multi-niveau (carrières multi-étages)

Certaines carrières / galeries ont **plusieurs niveaux empilés physiquement** (Glacière, Capucins, sites avec étages). Le mode multi-niveau permet de gérer ces plans correctement : chaque tracé/zone/point appartient à un niveau, et le pathfinder ne traverse pas magiquement d'un niveau à l'autre par les croisements visuels 2D.

> ⚠️ **Mode optionnel** — désactivé par défaut. La plupart des carrières sont mono-niveau, le mode classique suffit. Active-le **uniquement** pour les vraies carrières multi-étages.

### Activer le mode pour un plan

**3 façons** :

1. **Via ⚙️ Réglages** (recommandé sur un plan existant) : ouvre la modale ⚙️ Réglages → section **🏗️ Mode multi-niveau (avancé)** → coche la case. **Reload** la page pour que la barre latérale prenne en compte le changement.

2. **À la création d'un plan** (via 📦 Créer un plan) : coche la case **🏗️ Plan multi-niveau (avancé)** dans la section "Informations du plan". Le ZIP généré contient le flag → tout utilisateur qui le chargera aura le mode activé par défaut.

3. **Manuellement dans plan-config.json** : ajouter `"multiLevel": true` dans la section `plan`.

> 💡 Tu peux toujours désactiver le mode via ⚙️ Réglages → décocher → reload. Les tracés existants gardent leur info de niveau (cachée), tu peux la réactiver plus tard sans rien perdre.

### La pastille "Niveau actif"

Quand le mode est activé, une **pastille jaune** affichant le chiffre du niveau actif (`0` au démarrage, par exemple `[0]`) apparaît **sous les boutons de zoom Leaflet** (haut-gauche de la carte, juste en-dessous des `+` `-`). Clique dessus pour ouvrir la **modale Niveaux**.

> 💡 Si tu actives plus tard le widget 🧭 Boussole alors que le mode multi-niveau est actif, la boussole se positionne automatiquement **en-dessous de la pastille** pour ne pas se chevaucher.

### La modale Niveaux

Deux sections :

#### 🎯 Niveau actif (pour dessiner)

Boutons radio `[ − ] [-2] [-1] [0] [1] [2] [ + ]` (5 niveaux par défaut, symétriques autour de 0). Le niveau cliqué devient le **niveau actif** : tous les nouveaux tracés, zones, points éditeur que tu vas dessiner seront tagués avec ce niveau.

**Convention numérique** :
- **`0`** = niveau de référence (= les éléments sans niveau taggué — typiquement les anciens plans v147 et avant). C'est ton RDC / la galerie principale.
- **`1, 2, 3...`** = étages supérieurs / niveaux au-dessus du RDC
- **`-1, -2, -3...`** = sous-sols / niveaux en-dessous du RDC

⚠️ **Changer de niveau actif annule tout tracé en cours** (si tu avais commencé une route principale au Niv 0 et tu switches sur Niv -1, le tracé en cours disparaît). C'est exprès pour éviter qu'un tracé soit à cheval sur 2 niveaux.

⚠️ **Reset visibles** : changer de niveau actif coche **uniquement ce niveau** dans la section "Niveaux visibles" en dessous (mode focalisé par défaut).

**2 boutons d'extension** :
- **[ + ]** (à droite) : ajoute un niveau supérieur (max + 1). Utile pour des étages au-dessus.
- **[ − ]** (à gauche) : ajoute un niveau inférieur (min − 1). Utile pour des sous-sols additionnels.

💡 **Auto-extension** : si tu charges un plan dont les data layers contiennent déjà des éléments à des niveaux hors du range par défaut (ex : un puits taggué `level: 4`), l'app étend automatiquement la liste des niveaux disponibles pour que tu puisses les sélectionner/filtrer.

#### 👁️ Niveaux visibles (filtre)

Checkboxes par niveau. Les tracés/zones/points de niveaux **non cochés** sont cachés sur la carte (opacity 0). Les jonctions interniveau restent visibles si **au moins un** de leurs endpoints touche un niveau coché.

Boutons rapides :
- **Tous** : coche tous les niveaux disponibles
- **Actif seul** : coche uniquement le niveau actif

### 🪜 Tracer une jonction interniveau

Pour relier deux niveaux physiquement (escalier, pente raide, puits interne, échelle entre étages), tu utilises la sous-action **🪜 Jonction interniveau** dans le groupe **🛣️ Tracés**.

> ⚠️ **Visibilité conditionnelle** : le bouton 🪜 n'apparaît **que si le mode multi-niveau est activé** sur le plan courant. Si tu ne le vois pas, vérifie d'abord que la pastille jaune `[N]` est bien visible en haut-gauche.

**Procédure pas-à-pas** :

1. Ouvre le groupe accordéon **🛣️ Tracés** dans la barre latérale.
2. Clique sur la sous-action **🪜 Jonction interniveau**.
3. Une **modale s'ouvre** avec 2 sélecteurs : `Niveau de départ` et `Niveau d'arrivée`. Par défaut, "départ" = ton niveau actif. Choisis le second niveau, puis clique **OK**.
4. Le mode tracé démarre. **Clique sur la carte** pour poser autant de points que tu veux (comme une polyline normale). Tu peux suivre la forme exacte de l'escalier ou tracer une simple diagonale.
5. **Appuie à nouveau sur 🪜** pour valider et sortir du mode tracé.
6. La jonction apparaît en **magenta pointillé** avec un **rond blanc+magenta** à chacune des 2 extrémités.

**Sémantique des 2 niveaux** : *départ* et *arrivée* sont **symétriques** côté pathfinder — peu importe lequel tu mets en premier, l'itinéraire traverse la jonction dans les 2 sens. Choisis l'ordre qui te semble naturel (ex: un escalier qui descend du Niv 1 au Niv 0 → `départ: 1, arrivée: 0` ; un puits qui descend du Niv 0 au Niv -1 → `départ: 0, arrivée: -1`).

**Visibilité d'une jonction** : reste affichée si **au moins un** de ses 2 niveaux est dans la liste des niveaux visibles. Exemple : jonction `0 ↔ 1`, filtre `[0]` actif → jonction visible (car 0 dans le filtre). Filtre `[2]` → jonction cachée.

**Cas particulier : une seule jonction = un seul passage logique**. Si dans la réalité il y a 2 escaliers entre les mêmes niveaux, trace **2 jonctions distinctes** aux 2 endroits physiques. Le pathfinder choisira automatiquement la plus courte selon le trajet demandé.

> 💡 **Important pour le pathfinder** : les jonctions sont les **seuls bridges** entre niveaux. Si tu veux qu'un itinéraire passe du Niv 0 au Niv 1, tu **DOIS** tracer une jonction entre ces 2 niveaux à l'endroit physique du passage (escalier réel). Sans jonction, le pathfinder refuse de traverser même si visuellement 2 tracés se croisent à l'écran.

### 🧹 Effacer une jonction

Les jonctions s'effacent **exactement comme les autres tracés** via la sous-action 🧹 :
- **🎯 Sélection au clic** → clique sur la jonction → confirme la suppression
- **✂️ Dernier tracé entier** → si la jonction est le dernier tracé fait, elle est supprimée
- **🗑️ Tous les tracés** → efface absolument tout (routes + jonctions)

### Ajouter du niveau aux calques image (depuis v162)

Dans le **🏗️ Générateur de plan**, chaque calque image (légende, hachures, etc.) a un champ **🏗️ Niveau** (visible uniquement quand `🏗️ Plan multi-niveau` est cochée). Indique-y le niveau auquel le calque appartient (entier, défaut `0`).

**Au runtime** : le calque est automatiquement affiché/masqué selon ton filtre "Niveaux visibles" dans la modale Niveaux. La modale fait **autorité** sur le checkbox Leaflet du contrôle des couches → si tu décoches manuellement un calque, le changement de niveau ré-applique l'état correct.

**Rétro-compat** : si tu modifies un ZIP existant qui n'avait pas de `level` sur ses calques image, ils s'affichent à `0` dans le générateur — modifie-les pour les répartir par niveau si besoin.

### Ajouter du niveau aux data layers

Les calques de données existants (`puits.json`, `cataphile.json`, etc.) peuvent aussi avoir des items tagués par niveau. Ajoute manuellement `"level": N` dans le JSON :

```json
{
  "data": [
    { "id": "PA1", "nom": "Puits Aération Niv 1", "x": 100, "y": 200, "tags": ["pa"], "level": 1 }
  ],
  "roads": [
    { "type": "principal", "level": 0, "points": [{"x":1,"y":2}, ...] }
  ],
  "zones": [
    { "type": "eau", "level": 0, "points": [...] }
  ]
}
```

Items sans `level` → traités comme `level: 0` (rétro-compat avec tes JSON existants).

### Exporter avec choix des niveaux

**Mode rapide** (🖼️ → ⚡ Mode rapide) : exporte ce qui est actuellement visible (WYSIWYG, suit ton filtre).

**Mode avancé** (🖼️ → 🎨 Mode avancé) : nouvelle section **🏗️ Niveaux à exporter** avec checkboxes par niveau. **Indépendant** du filtre map → tu peux filtrer la map sur [Niv 0] mais exporter [Niv 0+1+2] en cochant les 3 boxes. Pré-coché sur ce qui est actuellement visible pour éviter les surprises.

### Plans existants (rétro-compat)

Si tu charges un plan v147 ou avant qui **n'a pas** activé le mode multi-niveau :
- Aucun bouton niveau, aucune sous-action 🪜, comportement strictement identique
- Tes anciennes sessions / exports continuent de fonctionner sans modification

Si tu actives le mode sur un plan existant :
- Tous les tracés/zones/points sans niveau sont considérés comme **Niv 0**
- Tu peux commencer à ajouter des tracés Niv 1, 2… qui coexistent avec les anciens (au Niv 0)

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

Appuyez sur **⬇️ → 🗂️ Changer de plan** pour revenir à votre liste de plans (l'écran d'accueil **📚 Mes plans**) et en charger un autre. Les données non exportées seront perdues — **exportez votre session avant de changer**.

Depuis cet écran, vous pouvez :

- Cliquer sur **▶️ Reprendre** pour relancer le plan que vous venez de quitter
- Choisir un autre plan dans **Mes plans** (clic direct ou bouton ▶️ de la ligne)
- Charger un nouveau ZIP via la zone d'import
- Importer/Exporter votre liste de plans

---

## 🏗️ Créer ou modifier un plan

> Accessible directement via le bouton **🏗️** de la barre latérale (clic direct, pas de sous-menu).

Appuyez sur **🏗️** pour ouvrir le générateur. Deux onglets disponibles :

### 📄 Nouveau plan

Formulaire vierge. Renseignez :

- **Informations** : nom, version, auteur
- **Image principale** (obligatoire) — les **dimensions du plan sont auto-détectées** dès que vous choisissez votre fichier. Un encadré affiche les dimensions et la taille en Mo, avec des **avertissements rouges** si l'image dépasse 10 000 px de côté ou 30 Mo (risque de crash mémoire sur mobile / ZIP très lourd).
- **Carte de collision** (optionnelle)

- **Position initiale du tracker** (groupe 🧭 Tracking) — **auto-centrée** au milieu du plan (W/2 × H/2) dès que l'image principale est chargée. Vous pouvez modifier ces valeurs manuellement si vous voulez démarrer le tracker à un endroit précis. Bouton **🎯 Recentrer la position de départ** disponible pour réappliquer le centre à tout moment.
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

### 🧱 Convertir en V2 tuile (performance)

Si ton plan est lourd (image > 50 Mo, dimensions > 8000 px), tu peux le convertir en **plan tuilé V2** pour réduire massivement la conso mémoire au runtime. Le système découpe l'image en tuiles 512×512 sur 4 niveaux de zoom (Google Maps-like) — à tout moment, seules les tuiles du niveau de zoom courant sont chargées en RAM.

**Workflow (depuis v151)** :

La case 🧱 Convertir en V2 apparaît dans le formulaire dès que tu as **uploadé une image principale**, que tu sois en mode **Nouveau plan** OU en **Modifier existant**. Plus besoin de passer par un ZIP V1 source.

1. **Nouveau plan** : choisir une image principale → la case 🧱 apparaît<br>
   OU **Modifier existant** : uploader ton ZIP V1 (la case 🧱 est dispo)
2. Cocher la case **☑️ 🧱 Convertir en V2 tuile (performance)** (encadré violet)
3. **Modal d'avertissement** : la conversion est lourde (CPU + RAM). Lis le message, clique **J'ai compris — Continuer** (ou **Annuler (décocher)** si tu veux y réfléchir). Voir section "PC vs mobile" plus bas.
4. Remplir le reste du formulaire (nom, version, calques, tracking, etc.)
5. Cliquer **📦 Générer le ZIP** → overlay de progression "Niveau z=−N · X / Y tuiles (Z%)"
6. ZIP téléchargé avec suffixe `_v2` (ex: `plan_xxx_v2.zip`)
7. **Re-importer ce ZIP via le loader** → le mode V2 s'active automatiquement (badge violet `V2` sur la carte plan)

**Auto-crop intégré** : si ton image source a beaucoup de marges blanches (typique des plans scannés papier), le générateur détecte automatiquement le bbox du contenu utile et tuile uniquement cette zone. Tu gagnes en taille de ZIP + en netteté au zoom max. Si l'image est déjà bien cadrée, pas de crop.

**Trade-offs** :

| ✅ Gains | ⚠️ Coûts |
|---|---|
| Conso mémoire massivement réduite (~16 MB max au lieu de l'image entière en RAM) | Conversion lente (1-5 min selon la taille de l'image) |
| Idéal pour mobile (Safari iOS, gros plans qui crashent en V1) | Le ZIP final contient plus de fichiers (les tuiles) mais ~même poids total qu'un PNG/JPEG unique |
| Navigation plus fluide au pan/zoom | Léger flash visuel au changement de niveau de zoom (swap des tuiles) |
| Auto-crop des marges blanches | Black border visible quand on dezoome très très loin (au-delà des bords) |

**Modifier un plan déjà V2** : la case est **pré-cochée** par défaut → les tuiles seront régénérées avec les nouvelles modifs. Si tu décoches, downgrade explicite V2 → V1 (les tuiles ne sont pas reportées dans le nouveau ZIP).

#### 💻 PC vs 📱 Mobile pour la conversion

> ⚠️ **Important** — c'est le sujet du modal d'avertissement qui apparaît quand tu coches la case.

| Plateforme | Décodage image source | Recommandation |
|---|---|---|
| 💻 **Ordinateur** (Windows / macOS / Linux) | Aucune limite mémoire en pratique. Conversion 1-5 min selon taille. | ✅ **Recommandé** pour la génération |
| 📱 **Mobile** (iOS / Android) | Plafonné à **~500 Mo de RAM** pour la PWA. Crash quasi-garanti sur image >50 Mo ou >8K px. | ❌ Éviter — **mais** le ZIP V2 généré sur PC s'importe sans coût sur mobile (c'est tout l'intérêt de V2) |

> 💡 **Workflow recommandé** : génère le ZIP V2 une fois pour toutes sur ton PC, puis partage-le sur ton téléphone (Drive, AirDrop, etc.). Le téléphone l'importe en quelques secondes et tu profites du runtime tuilé sans coût mémoire au boot.

#### 🎛️ Désactiver le tuilage à la lecture (V2 → V1 brut)

Au chargement d'un plan V2, tu peux choisir **Mode performance : Désactivé** dans le drawer "🎚️ Réglages de performance" du loader. Dans ce cas, le runtime ignore les tuiles et charge directement l'**image source** (`baseImage` du ZIP, gardée intacte) comme un plan V1 classique.

Use cases :
- Comparer le rendu V2 vs V1 sur le même plan
- Bypass temporaire si tu vois un comportement bizarre du système de tuiles (debug)

⚠️ Ce mode charge toute l'image en RAM → susceptible de crasher sur mobile pour les gros plans (c'est ce que V2 évite normalement).

> 💡 **À tester en priorité** sur ton plus gros plan qui crashe sur mobile, ou avant de partager un plan lourd à quelqu'un avec un téléphone modeste.

---

## 🚀 Optimiser ton plan pour la performance

Un plan léger se charge plus vite, navigue plus fluide et **réduit fortement le risque de crash mémoire sur mobile**. Voici les bonnes pratiques par ordre d'impact.

### 1. 🖼️ Image principale — limiter les dimensions

L'image base est le **plus gros consommateur mémoire**. Sur mobile, le navigateur alloue un canvas de la taille de l'image entière.

| Dimensions | Comportement | Recommandation |
|---|---|---|
| ≤ 4 000 × 4 000 px | OK partout | ✅ Idéal |
| 4 000 - 8 000 px | OK desktop, dézoom limité sur mobile | ⚠️ Acceptable |
| 8 000 - 16 000 px | Risque de crash sur mobile bas/moyenne gamme | ⚠️ Force le tuilage (mode Performance) |
| > 16 000 px | Crash quasi-garanti sur mobile | ❌ À éviter |

**Astuce** : si ton plan source est gigantesque, redimensionne à 6 000-8 000 px de côté max avec un éditeur d'image (GIMP, Photoshop, [Squoosh](https://squoosh.app/) en ligne). Tu perds un peu de détail au zoom maximum mais tu gagnes énormément en stabilité.

### 2. 📦 Format de l'image — JPEG vs PNG

| Format | Quand l'utiliser | Poids typique (8000×6000 px) |
|---|---|---|
| **JPEG** (qualité 80-90 %) | Photos, scans, plans avec dégradés | ~3-8 Mo ✅ |
| **PNG** | Plans avec transparence ou aplats nets | ~15-50 Mo ⚠️ |
| **WebP** | Compromis qualité/poids (Chrome/Firefox/Safari modernes) | ~2-5 Mo ✅✅ |

> 💡 Pour un plan de carrière classique avec des routes dessinées par-dessus une couleur unie, le **JPEG qualité 85** divise le poids par 5 à 10 sans perte visuelle perceptible.

### 3. 🗂️ Calques image — limiter le nombre

Chaque calque image supplémentaire (légende, annotations, etc.) **multiplie la mémoire utilisée**. Le visiteur charge tous les calques même s'il en masque une partie.

| Nombre de calques image | Recommandation |
|---|---|
| 1 (image base seule) | ✅ Optimal |
| 2-3 | ⚠️ Acceptable si chacun est ≤ 2 Mo |
| 4+ | ❌ À éviter — fusionne dans le PNG base |

**Alternative** : si tu as des éléments décoratifs (légende, repères), **intègre-les directement dans l'image base** plutôt que d'en faire des calques séparés. Tu perds la possibilité de les masquer mais tu gagnes en perf.

### 4. 🛣️ Routes — intégrer dans le PNG si nombreuses

Les routes JSON (Principal/Secondaire/Chemin) sont rendues par Leaflet en surcouche vectorielle. Au-delà de **~50 routes**, le navigateur peut ramer au pan/zoom.

**Stratégie pour les gros plans** :
1. Trace les routes dans ton éditeur d'image (GIMP/Photoshop) **directement sur le PNG**
2. Garde un calque JSON minimaliste avec les routes invisibles côté visuel mais utilisable par le module **🗺️ Itinéraire** (le pathfinder utilise toutes les routes du calque, **même masquées**)
3. Dans le contrôle des couches Leaflet, **décoche le calque JSON des routes** → tu vois les routes via le PNG, l'app ne dessine pas les polylines vectorielles → gros gain perf
4. L'itinéraire continue de fonctionner

> 🎯 Cette technique permet d'avoir **des centaines de tronçons** sur le plan sans aucun impact perf au pan/zoom.

### 5. 📍 Points — limiter les calques de données denses

Chaque calque JSON de points (`puits.json`, `chatieres.json`, etc.) crée des markers Leaflet. Au-delà de **~500 markers visibles simultanément**, ça peut ralentir le rendu sur mobile.

| Nombre de markers | Recommandation |
|---|---|
| ≤ 200 | ✅ OK |
| 200-500 | ⚠️ OK desktop, prudence mobile |
| 500-2000 | ⚠️ Sépare en plusieurs calques de données toggleables |
| > 2000 | ❌ Considère un mode "regroupement" (clustering, future feature) |

**Astuce** : sépare tes points en plusieurs calques de données (ex: `puits.json`, `passages.json`, `électricité.json`) pour que l'utilisateur puisse en masquer ceux qui l'intéressent moins.

### 6. ⚡ Mode performance — choisir le bon preset

Au chargement d'un plan, tu peux choisir parmi 5 presets dans le loader :

| Preset | Pour quel cas |
|---|---|
| **💤 Désactivé** | Petit plan ≤ 4 000 px, desktop puissant. **Risque de crash sur Safari iOS au-delà de 8 000 px** |
| **🔄 Auto** (défaut) | Comportement intelligent — tuile si fichier > 60 Mo. ✅ Bon choix par défaut |
| **🌟 Qualité** | Images haute définition, perf à fond (desktop/laptop) |
| **🎯 Équilibré** | Bon compromis qualité/perf, recommandé sur la plupart des mobiles modernes |
| **⚡ Performance** | Vieux mobile, plan très gros, priorité absolue à la stabilité |

> 💡 Le preset est mémorisé **par plan** : tu peux avoir un plan en mode Performance pour ton vieux téléphone et un autre en Qualité pour ton iPad.

### 6 bis. 🚀 Mode Performance ULTRA — pour les vrais gros plans qui crashent

Si malgré le mode Performance, ton plan crashe encore (typiquement plans 4000+ × 2000+ pixels avec beaucoup de tracés), ouvre **⚙️ Réglages → section "🚀 Mode Performance ULTRA"** et active le **toggle master 🚀 ULTRA**. Il active 6 optimisations agressives simultanément.

> ⚠️ Ces optims **ne touchent PAS à l'image** (déjà gérée par le mode performance ci-dessus). Elles ciblent les éléments vectoriels (tracés, points, calculs).

**Les 6 toggles individuels** (activables séparément si tu veux affiner) :

| Toggle | Effet | Trade-off |
|---|---|---|
| 🪜 **Décimer les tracés au dézoom** | Simplifie les polylines au zoom out | Tracés moins lisses au dézoom |
| ⚡ **Désactiver animations zoom/pan** | Transitions instantanées au lieu d'animées | Visuel plus abrupt — **reload requis** |
| 🎯 **Désactiver cercles intersections** | Plus de cercles aux carrefours au-delà de 50 routes (vs 200) | Carrefours moins visibles |
| 🚫 **Désactiver popups sur calques de données** | Pas de popup au clic sur les markers des calques (puits, etc.) | Utilise 🔍 Recherche pour interagir |
| 🐢 **Auto-save lent (30s)** | Sauvegarde toutes les 30s au lieu de 1.5s | Risque de perdre 30s de modifs si crash |
| 👁️ **Ne rendre que les tracés visibles** | Skip les routes hors écran | Pop-in léger au pan |

**Comment t'en servir** :

- **Si l'app crashe encore** → coche **🚀 ULTRA** (active tout). Effet immédiat (sauf "animations" qui demande un reload).
- **Si tu veux affiner** → garde ULTRA décoché et active manuellement les toggles selon ce que tu veux sacrifier. Par exemple : tu peux activer juste **🐢 Auto-save lent** et **👁️ Viewport culling** pour gagner pas mal sans rien perdre visuellement.
- **Pour revenir au comportement normal** → décoche **🚀 ULTRA** (ça décoche tout) ou décoche individuellement.

**Persistance** : les toggles sont mémorisés dans ton navigateur (préférence globale, pas par plan). Ils restent activés entre sessions.

> 💡 Combo recommandé pour les très gros plans : 🚀 ULTRA + mode performance ⚡ Performance au chargement + image source ≤ 8000 px / JPEG q85.

### 7. 📱 Spécifique mobile

- **iPhone PWA** (installé sur écran d'accueil) gère mieux les gros plans qu'iPhone Safari direct
- **Android Chrome** est généralement plus tolérant qu'iOS pour la mémoire
- En cas de crash : ⚙️ Réglages → **🐛 Logs détaillés** → ON pour diagnostiquer

### 8. 💾 Sauvegarde régulière

Les plans très gros peuvent occasionner des **kills mémoire silencieux** sur iOS — l'OS tue l'onglet sans prévenir pour récupérer de la RAM. L'app détecte ce kill au reboot et te montre un toast d'avertissement.

> 📌 **Réflexe** : exporte ta session (💾 Enregistrer la session) tous les 10-15 minutes de travail intensif. L'auto-save localStorage protège déjà contre la plupart des cas, mais un export externe reste le plus sûr.

### Récap rapide

✅ **Pour un plan optimal** :
- Image base **JPEG qualité 85** ≤ 8 000 px de côté
- 1 ou 2 calques image max
- Routes **dessinées dans le PNG** + calque JSON masqué pour le pathfinder
- Points répartis dans 2-3 calques de données toggleables
- Preset **🎯 Équilibré** par défaut, **⚡ Performance** pour les vieux mobiles

---

## 🤖 Aide IA

> Accessible via le groupe **📚 Aide / Doc / Légende → 🤖 Aide IA**.

Télécharge un fichier `.md` qui résume tout ce que l'app permet de faire (cette doc + une FAQ + des instructions pour l'IA). Donne-le à **n'importe quelle IA conversationnelle** (ChatGPT, Claude, Gemini, Perplexity, Le Chat, Copilot, etc.) — elle pourra répondre à toutes tes questions sur MyKTAMap avec un contexte précis.

**Comment utiliser** :

1. Clique sur 🤖 Aide IA → bouton **📥 Télécharger le contexte (.md)**
2. Le fichier `MyKTAMap-AI-Context-AAAA-MM-JJ.md` arrive dans tes téléchargements
3. Ouvre l'IA de ton choix → colle le fichier en début de conversation
4. Pose tes questions normalement : *"Comment ajouter un point ?"*, *"Mon plan plante, pourquoi ?"*, etc.

> 🔒 **Confidentialité** : le fichier ne contient QUE la documentation — aucune donnée personnelle (pas de tes plans, points, sessions, etc.). Tu peux le partager sans risque.

> 💰 **Note** : l'IA utilisée peut être payante ou avoir des quotas selon le service. MyKTAMap reste gratuit — l'aide IA est juste une façon de tirer parti d'une IA externe.

---

## 🗺️ Légende

> Accessible via le groupe **📚 Aide / Doc / Légende → 🗺️ Légende**.

Affiche la légende complète des icônes et tracés, regroupés par catégorie : **🕳️ Puits**, **🪜 Accès** (puits à échelon, escaliers, cavages), **⚠️ Signalétique**, **🛣️ Tracés** et **⬛ Zones**.

> 💡 La légende affiche **toutes les icônes que l'application sait reconnaître**, même si votre plan en cours ne les utilise pas. C'est pratique pour découvrir les types disponibles avant d'ajouter vos points.

---

## ⚙️ Réglages

> Accessible directement via le bouton **⚙️** de la barre latérale (clic direct, pas de sous-menu).

Accédez aux paramètres en cliquant sur **⚙️** :

- **Position initiale du tracker** : coordonnées de départ
- **Détection des pas** : sensibilité, taille du pas, cooldown
- **Échelle (px/m)** avec bouton **🎯 Calibrer** : calcule l'échelle correcte à partir d'une distance mesurée
- **Debug** : activer les **Logs détaillés** (logs verbeux capteurs + tiling) + voir le mode performance actuel du plan (💤 Désactivé / 🔄 Auto / 🌟 Qualité / 🎯 Équilibré / ⚡ Performance)
- **🗑️ Réinitialiser** : vide le cache et recharge l'application
- **🐛 Logs** : affiche les journaux de débogage (utile en cas de problème)

> Le mode performance ne se modifie qu'au chargement du plan (sélecteur 4 modes dans le chargeur).

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

## 🏷️ Badge version dans le footer (chargeur)

Au bas du chargeur, à côté de la mention de licence, un petit **badge version** affiche la version actuelle de l'application installée (ex: `v143`).

**Deux états visuels** :

| État | Affichage | Action au clic |
|---|---|---|
| **Vous êtes à jour** | `v143` en gris discret | Modale "✅ Déjà à jour" — affiche la version installée + date de publication + **notes de cette version** (changelog) |
| **Mise à jour disponible** | `v141 → v143` en **bleu clignotant** | Modale "🔔 Mise à jour disponible" — propose une mise à jour douce (préserve plans et sessions) ou un reset complet |

Quand une nouvelle version est dispo, le badge **clignote en bleu** pour attirer l'attention sans agresser visuellement. Au clic, vous pouvez choisir d'agir immédiatement (mise à jour douce ou reset complet) ou de remettre à plus tard (snooze 24h).

> 💡 Le badge bypasse le snooze 24h : si vous avez cliqué "Plus tard" il y a quelques minutes mais que vous changez d'avis, cliquez le badge pour relancer la modale de mise à jour.

> 💡 Si vous êtes déjà à jour, cliquer le badge affiche tout de même les notes de la dernière version — pratique pour relire ce qui a été changé dans la mise à jour que vous avez installée.

---

## 🔧 Réinitialiser

En cas de problème ou pour forcer une mise à jour, utilisez **⚙️ → 🗑️ Réinitialiser**. Cette action désinscrit le Service Worker, vide le cache et recharge l'application.

> ⚠️ Effectuez cette action uniquement avec une connexion Internet disponible. Sans réseau, l'application sera inutilisable jusqu'au prochain rechargement complet.

---

## 🆘 En cas de problème

**Le plan ne se charge pas**
Vérifiez que `plan-config.json` est bien à la racine de votre archive ZIP, et que tous les fichiers référencés sont présents.

**L'image du plan est floue**
Selon le preset choisi, la résolution de travail est réduite (`Performance` plus que `Équilibré`, qui est plus que `Qualité`). Si votre appareil a assez de mémoire, basculez en **🌟 Qualité** au prochain chargement pour une image plus nette.

**Le tracker dérive trop vite**
Recalez votre position fréquemment. Ajustez l'échelle et la taille du pas dans les réglages.

**L'application crash sur Mobile avec un JPEG volumineux**
Choisissez **⚡ Performance** dans le sélecteur Mode performance avant de charger le plan.

**Un mode reste actif sans le vouloir**
Appuyez à nouveau sur le bouton actif (en vert) pour le désactiver.

**L'application ne se met pas à jour après une nouvelle version**
Utilisez **⚙️ → 🗑️ Réinitialiser** avec une connexion Internet pour forcer le rechargement complet.

**Problème non résolu**
Ouvrez **⚙️ → 🐛 Logs**, copiez les journaux et transmettez-les à l'équipe technique.

---

*MyKTAMap — Guide Utilisateur*
*Ces lieux sont fragiles. La discrétion est une forme de respect.*
