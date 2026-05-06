# 📘 MyKTAMap
> Application web de cartographie terrain — visualisation, annotation et déplacement simulé sur plan image.

**🌍 Environnements :**
- 🟢 Production : [myktamap.is-underground.fr](https://myktamap.is-underground.fr)
- 🔧 Développement : [devmap.is-underground.fr](https://devmap.is-underground.fr)

> ⚠️ Les données présentes sur le site de démonstration sont fictives.

## 📋 Journal des modifications

### 🗓️ 05/05/2026 — Export session avancé + filtrage par tag + bugs résolus

- Sommaire dans la documentation
- Documentation Utilisateur afficher uniquement

- **Nouveau module `sessionExporter.js`** — modale d'export de session avec 3 onglets
  - 🚀 **Full** : export complet sans tracker (équivalent ancien comportement, mais sans la mesure)
  - 🎨 **Avancé** : sélection fine par catégorie + sous-types, format de sortie au choix (1 fichier session OU ZIP multi-fichiers), case optionnelle "Position du tracker" (path + position)
  - 🔄 **Conversion** : convertit la session en data layer(s) au format `devmap-data`, granularité au choix (basique = 3 fichiers max, fine = 1 fichier par type)
- **Sélection des points par tag** (dans Avancé ET Conversion)
  - Liste dynamique des tags présents dans les points, avec compteur et **icône miniature** depuis `PLAN_CONFIG.icons`
  - Catégorie spéciale `(sans tag)` pour les points sans tags
  - Synchronisation parent ↔ enfants : décocher Points ajoutés décoche tous les tags, et inversement
  - Filtrage : un point est inclus s'il a **au moins un de ses tags coché** (ou s'il n'a pas de tag et que `(sans tag)` est coché)
  - Helpers : `_listerTagsPoints()`, `_filtrerPointsParTags()`, `_lireTagsCoches()`, `_slugTagId()`, `_iconePourTag()`
- **Suppression du bouton 🔄 Convertisseur** séparé du menu ⬆️ Enregistrer — la conversion se fait maintenant exclusivement via la modale 💾 → onglet Conversion
- **Suppression de la mesure** dans l'export session (Full)
- **Bouton 💾** : "Exporter la session JSON" → "Enregistrer la session" (ouvre la modale)
- **Format JSON** : `version` passe de `1` (number) à `"1.0"` (string) + ajout du champ `date_export`
- **Bug eau résolu** : dans `utils.js` → `ajouterPointsDepuisJSON`, l'objet `ZONE_STYLES_DATA` ne contenait pas l'`eau` → les zones d'eau d'un calque de données s'affichaient en remblais à l'écran (mais étaient correctement exportées en eau). Ajout de l'eau + tri eau → remblais → effondrement.
- **Bug zones/routes embarquées dans dataLayers** : à l'export PNG, les `roads[]` et `zones[]` lus depuis un fichier de calque étaient ignorés. Fix dans `exporter.js` (mode Avancé) et `utils.js` (mode Rapide) : on dessine maintenant zones embarquées (arrière-plan) → routes embarquées → markers, comme à l'écran.
- **Bug tracker non exporté** : `tracking.js` n'exposait pas les fonctions appelées par les exporters. Ajout de `window.getTrackingPosition()` (renvoie `{x, y}`) et `window.getTrackingPath()` (renvoie la liste des points du tracé en coords plan, reconvertie depuis la polyline Leaflet).
- **Tracker complet** : à l'export, dessine le tracé parcouru (polyline bleu `#3388ff` weight 3) + position courante (icône). Label de la case "Position du tracker" enrichi avec `(+ tracé N pts)` quand path > 1 point.
- **Permission capteurs au play uniquement** : suppression du listener `document.body.click` dans `main.js` et `main_import.js` qui demandait la permission au tout premier clic global. Maintenant la popup iOS de permission n'apparaît qu'au clic sur ▶️ Play du tracker (cohérent avec la directive Apple "permission dans une tâche utilisateur directe").
- **Icône groupe Édition** : confirmation que ✏️ est bien en place partout (vs. 📌 punaise testé puis abandonné)

### 🗓️ 04/05/2026 — Recherche de point + ajustements
- **Nouveau module `searchPoints.js`** — recherche rapide d'un point par nom, id, tag, description ou état

  . Bouton **🔍 Rechercher un point** ajouté en position solo dans la barre latérale, après ⚙️ Paramètres
  . Recherche live debounced 200ms, normalisation NFD (insensible aux accents et à la casse)
  . Tri par pertinence : match exact nom (100) → début nom (80) → dans nom (60) → exact id (50) → début id (40) → dans id (30) → tags (20) → description/état (10)
  . Limite 50 résultats avec compteur "+ N autres"
  . Affichage : icône miniature + ID en bleu + nom + chip layer + tags + coordonnées
  . Navigation clavier : ↑/↓ entre résultats, Entrée pour valider, Échap pour fermer
  . **Cache de points** par signature de plan (name|version|baseImage), invalidation auto au changement de plan
  . Au clic sur un résultat : `setView` instantané (pas `flyTo` pour éviter dérive cumulée), popup ouvert sur le marker existant ou popup temporaire si layer non visible, **cercle d'entourage statique orange** (3s puis disparition)

- **Couleur des remblais** : passage à `#3a3a44` (bordure) / `#5a5a68` (remplissage) — gris franc qui ne se confond plus avec les fonds beiges/marron des plans
- **Icône du groupe Zones** : 🟫 → **⬛** (Large Brown Square → Black Large Square) car 🟫 est marron par définition Unicode et ne reflétait pas la couleur réelle des remblais. Synchronisé dans le bouton principal, les sous-actions, l'aide et les modes actifs.

### 🗓️ 04/05/2026 — Éditeur tableau JSON
- **Nouveau module `tableEditor.js`** — éditeur de fichier JSON sous forme de tableau interactif
  . Bouton **📊 Éditer un fichier JSON** ajouté en 2e position dans le groupe ⬇️ Charger
  . Auto-détection du format (`data` calque ou `editorPoints` session)
  . Détection automatique des colonnes avec ordre privilégié (id, nom, x, y, tags, etat...)
  . Édition inline : Tab/Enter/Échap, validation typée (number pour x/y/profondeur)
  . **ID en lecture seule** (cellule grisée)
  . **Validation des coordonnées** : cellule rouge ⚠ si hors `imageWidth`/`imageHeight` + tooltip
  . **Tags multi-select** avec dropdown : icônes en preview, tags existants + champ "Créer un tag"
  . Recherche live debounced 200ms, tri asc/desc/none, sélection multi (shift+clic)
  . Aperçu sur la carte : modale masquée, markers cercles oranges + banner retour
  . Avertissement si > 1000 lignes
  . Sauvegarde via menu : 📥 Téléchargement / 🗺️ Remplacer le calque actif / ✏️ Remplacer la session
  . Confirmation à la fermeture si modifications non sauvées (Sauvegarder / Quitter / Continuer)
  . Module autonome — styles CSS injectés dynamiquement au premier appel
  . Branchement : `<script src="js/tableEditor.js">` ajouté dans `index.html` après `exporter.js`

### 🗓️ 04/05/2026 — Charte graphique légende exportée
- **Légende exportée alignée sur le dark theme des modales** (fond `#1a1f2e`, accents bleu vif `#8cb4ff`)
- **Titre "Légende" en Georgia italique**, taille réduite (compact 13 / standard 17 / large 22) pour ne plus dominer
- **Date au format FR `JJ/MM/AAAA`** (suppression de "Exporté :" devant la date)
- **Layout en 2 colonnes** : Icônes à gauche, Tracés + Zones à droite — légende plus large mais moins haute
- Métadonnées et titre restent en pleine largeur en haut

### 🗓️ 04/05/2026 — Zones, eau, page d'accueil, calibrage
- **Eau (3e type de zone)** — bouton 🟦 dans le groupe Zones, couleurs `#0066aa` / `#3aa9e8`
  . Tri d'affichage : eau (0) → remblais (1) → effondrement (2)
  . Synchronisé partout : `zones.js` (renderZones), `utils.js` × 2 (export PNG + lecture data layer), `exporter.js`
- **Page d'accueil — boutons supplémentaires en bas du loader** :
  . 🏗️ Générer un plan (toujours visible) → ouvre `afficherPlanner()`
  . 🌐 Charger le plan serveur (toujours visible) → tente `loadAppConfig()` avec message d'erreur si plan absent
- **Calibrage d'échelle — formule corrigée** : `nouveau = scale × (affichée / réelle)` (au lieu de `réelle / affichée`)
- **Onglet "Fichiers séparés" supprimé** du loader — ZIP uniquement

### 🗓️ 03/05/2026 — Export plan avancé
- **Nouveau module `exporter.js`** — modale d'export avec deux modes : ⚡ Rapide (export historique inchangé) et 🎨 Avancé
- **Mode avancé** :
  . Choix précis des calques d'image / calques de données / annotations à inclure
  . Légende intégrée positionnable (4 coins ou point custom via 🎯 sélection sur la carte)
  . 3 styles de légende : Opaque / Semi-transparent / Filigrane
  . 3 tailles : Compact / Standard / Large
  . Format PNG ou JPEG 90%, résolution Originale / ½ / ¼
  . Aperçu mini-canvas 320×200 px (debounced 300ms)
- Bouton 🖼️ ouvre maintenant la modale au lieu de télécharger directement

### 🗓️ 03/05/2026 — Module Zones
- **Nouveau module `zones.js`** — zones polygonales remplies (remblais / effondrement)
- **Nouveau groupe Zones** dans la barre latérale (10e position, après Tracés)
- Sous-actions : 🟫 Remblais / 🟥 Effondrement / 🟦 Eau / ✅ Fermer / 🧹 Effacer
- Aperçu pointillé pendant le tracé + cercle visible sur 1er point dès 3 points posés
- Fermeture par re-clic sur 1er point (tolérance 5px) OU bouton ✅
- Tri d'affichage : eau → remblais → effondrement (effondrement toujours visible)
- Préservation dans : session JSON (`zones[]`), data layer embarqué (`zones[]`), export PNG
- Convertisseur JSON préserve `zones` dans les 2 sens

### 🗓️ 03/05/2026 — Refonte interface
- **Barre latérale refondue en 9 groupes** (accordéon vertical, exclusivité)
  . Ordre : Aide → Paramètres → Charger → Créer-Modifier → Enregistrer → Tracker → Mesure → Édition → Tracés
  . **Paramètres ⚙️ et Créer/Modifier 🏗️** sont des boutons solo (clic direct, pas de sous-menu)
  . Les autres groupes sont des accordéons déroulables verticalement
- **Set d'icônes cohérent** : 📚 Aide / ⚙️ Paramètres / ⬇️ Charger / 🏗️ Créer / ⬆️ Enregistrer / 🧭 Tracker / 📐 Mesure / 📌 Édition / 🛣️ Tracés
- **Mode actif → groupe verrouillé ouvert** + icône principale reflète le mode actif (ex: 🟩 sur Tracés quand Principal en cours, ⏹️/📍 sur Tracker)
- **Clic en dehors** d'un groupe ouvert le ferme automatiquement (sauf si mode actif)
- **Modale d'import de session** (`📥`) en plein écran avec drag & drop, aperçu du contenu (nb points / tracés / zones / mesure) et avertissement avant écrasement
- **Bouton 🎯 de calibrage d'échelle** dans ⚙️
- **Mode Performance** déplacé dans la section Debug, affichage compact horizontal
- **Fix mobile paysage** : barre latérale scrollable quand `max-height ≤ 500px`

### 03/05/2026
- **Icône PWA pour écran d'accueil iOS** — ajout des balises `<link rel="apple-touch-icon">` dans `index.html` (4 tailles + fallback)
- **Modale d'ajout de point en plein écran** (style cohérent avec les autres modales)
- **Création de tags à la volée** depuis le formulaire d'ajout — le tag est ajouté dynamiquement à `PLAN_CONFIG.icons` avec l'icône par défaut
- **Option "Aucun tag"** disponible — utilise l'icône `default` (pin Leaflet natif si pas configuré)
- **Légende refondue** — fusion des sections custom + tracker + default dans une seule rubrique "📌 Autres", URL réelle de chaque icône résolue depuis `_iconMap`
- **Suppression granulaire** :
  . Mesure : *Dernier point* ou *Toute la mesure*
  . Points : *Dernier point ajouté* ou *Tous les points*
  . Tracés : *Dernier point du tracé* / *Dernier tracé entier* / *Tous les tracés*
- Nouveau helper `_choixSuppression()` dans `interface.js` — modale avec liste d'options
- Nouvelles fonctions API : `removeLastEditorPoint`, `removeLastRoad`, `removeLastRoadPoint`, `removeLastMeasurePoint`
- `creerIcones()` sécurisé : aucune icône avec `iconUrl: undefined`, fallback `L.Icon.Default` natif Leaflet si `default` manquant dans la config

### 02/05/2026
- **Service Worker réactivé** — mode hors-ligne fonctionnel via `sw.js`
- Onglet **"Modifier existant"** dans le générateur 📦 — importe un ZIP, pré-remplit le formulaire, régénère un ZIP modifié
- **Gestionnaire d'icônes & tags dynamique** dans le générateur — création de tags personnalisés avec icônes custom
- Le mode ajout de point ✏️ utilise maintenant la liste de tags **dynamique** depuis `PLAN_CONFIG.icons`
- `choisirIcone()` et `getIconForPoint()` (export PNG) refactorisés pour parcourir dynamiquement `_iconMap` — supporte tous les tags personnalisés
- Suppression du mode "Fichiers séparés" du loader — **ZIP uniquement**
- Correction icône véhicule à l'export (était étirée 50×25 → maintenant 50×50 comme l'affichage)

### 30/04/2026
- Correction collision : ratio scale plan/canvas pour les cartes de collision downscalées
- Mode performance : limite `MAX_WORK_DIM` à 8192px (limite Safari iOS sur `drawImage` JPEG)
- Détection canvas noir avec re-essai (Safari iOS échec silencieux sur gros JPEG)
- Blob URL fraîches créées à l'intérieur de `_imageVersCanvasReduit` (évite révocation prématurée)
- Mode performance affiché en lecture seule dans ⚙️ (modifiable au chargement uniquement)

### 27/04/2026
- **Refonte architecture complète** — fusion `index.html` + `import.html` en une seule page PWA
- Suppression de `import.html`, `config_import.js`, `map_import.js`, `main_import.js`
- `config.js`, `map.js`, `main.js` unifiés : gèrent les deux modes (serveur + import navigateur)
- Auto-détection au démarrage : charge `data/plan-config.json` si disponible, sinon affiche le loader
- Ajout du mode performance (tiling) pour les plans JPEG volumineux sur Safari iOS
- `tiling.js` — module de découpage en tuiles via `<img>` HTML + canvas
- Préférences utilisateur (`perfMode`, `motionDebug`) persistées séparément du plan dans `app_user_prefs`
- Panneau de logs de débogage intégré (🐛 dans ⚙️) avec persistance `localStorage`
- Optimisation collision : cache pixel en mémoire (`initCollisionCache`)
- Chargement des markers par batch de 50 via `requestAnimationFrame`
- Routes embarquées dans les calques de données (`roads[]` dans le JSON data)
- Métadonnées PWA ajoutées (`apple-mobile-web-app-capable`)
- `debug.js` — capture silencieuse des logs

### 26/04/2026
- Documentation utilisateur séparée du README DEV (`README_USER.md`)
- Aide, Légende, Réglages en modales plein écran
- Ajout du convertisseur JSON bidirectionnel (`editor ↔ data`)
- Ajout du générateur de plan ZIP (`createConf.js`)
- Refonte graphique de l'interface (charte dark cohérente)
- Import de plan via archive ZIP
- Normalisation des formats JSON dans `utils.js`
- Gestion des modes exclusifs (un seul mode actif à la fois)
- Bouton vider le cache avec double confirmation

### 25/04/2026
- Documentation intégrée à l'interface (README + README_USER)
- Bouton vider le cache dans les réglages
- Correction du responsive design (interface mobile)

### 22/04/2026
- Ajout du mode import local (chargement d'un plan depuis le navigateur sans serveur)

### 19/04/2026
- Le bouton télécharger intègre désormais tous les calques visibles
- Ajout du tracé de routes : Principal / Secondaire / Chemin
- Interface mise à jour avec import/export global de session JSON
- Correction du tracker : intégration de la boussole via `alpha`, `beta`, `gamma`

**Points en cours d'investigation :**
- Erreur d'échelle constatée sur le tracker — possible problème de cooldown
- Tiling JPEG sur Safari iOS : qualité réduite par contrainte mémoire GPU (MAX_WORK_DIM = 8192)

---

## 🧭 Introduction générale

MyKTAMap est une application web permettant de **visualiser, annoter et exploiter un plan** (carrière souterraine, bâtiment, site industriel…) à partir d'une image haute résolution.

L'outil repose sur **[Leaflet](https://leafletjs.com/)** en projection simple (`L.CRS.Simple`), ce qui permet de travailler sur une carte personnalisée **sans coordonnées GPS**.

### 🧩 Fonctionnalités principales

| Fonctionnalité | État |
|---|---|
| Affichage du plan (image haute résolution) | ✅ Disponible |
| Gestion de calques et d'icônes dynamiques | ✅ Disponible |
| Ajout de points d'intérêt (modale + tags custom) | ✅ Disponible |
| Mesure de distances | ✅ Disponible |
| Tracé de routes (Principal / Secondaire / Chemin) | ✅ Disponible |
| Suppression granulaire (dernier point / dernier tracé / tout) | ✅ Disponible |
| Export / import JSON de session | ✅ Disponible |
| Import de plan via ZIP | ✅ Disponible |
| Conversion session → data layer (intégrée à 💾) | ✅ Disponible |
| Générateur de plan ZIP avec gestion des tags | ✅ Disponible |
| Modification d'un plan existant | ✅ Disponible |
| Mode performance (tiling JPEG volumineux) | ✅ Disponible |
| Application PWA — mode standalone iOS | ✅ Disponible |
| Mode hors-connexion (Service Worker) | ✅ **Réactivé** |
| Panneau de logs de débogage | ✅ Disponible |
| Déplacement simulé via capteurs mobile | ⚠️ Expérimental |

---

## 🏗️ Architecture applicative

```
index.html                  ← Page unique (loader intégré + carte)
sw.js                       ← Service Worker (mode hors-ligne)
        │
        ├── debug.js           ← Capture logs + modale débogage
        ├── config.js          ← Configuration unifiée (serveur + import)
        ├── utils.js           ← Fonctions utilitaires + export PNG dynamique (rapide)
        ├── measure.js         ← Mesure de distance + suppression granulaire
        ├── tiling.js          ← Mode performance : découpage en tuiles
        ├── map.js             ← Initialisation Leaflet + _iconMap dynamique
        ├── tracking.js        ← Déplacement simulé via capteurs
        ├── editor.js          ← Modale plein écran + tags custom
        ├── road.js            ← Tracé de routes + suppression granulaire
        ├── zones.js           ← Zones polygonales remplies (eau / remblais / effondrement)
        ├── exporter.js        ← Modale d'export plan avancé (rapide / avancé + légende intégrée)
        ├── sessionExporter.js ← Modale d'export de session (Full / Avancé / Conversion + filtrage par tag)
        ├── tableEditor.js     ← Éditeur de fichier JSON sous forme de tableau
        ├── searchPoints.js    ← Recherche rapide d'un point (nom / id / tag / description)
        ├── createConf.js      ← Générateur de plan ZIP (Nouveau / Modifier)
        ├── interface.js       ← Interface Leaflet + toutes les modales
        └── main.js            ← Point d'entrée unique avec auto-détection

lib/
        ├── leaflet/           ← Leaflet.js (local)
        └── jszip.min.js       ← JSZip 3.10.1 (local, requis pour ZIP)
```

> `import.html`, `config_import.js`, `map_import.js` et `main_import.js` ont été **supprimés**. Toute leur logique est absorbée dans les fichiers unifiés.

---

## 📱 PWA — Application installable

MyKTAMap est une **PWA installable** sur mobile et desktop. Sur iOS, elle peut être ajoutée à l'écran d'accueil via Safari (Partager ↑ → Sur l'écran d'accueil) et fonctionne ensuite en mode standalone (sans la barre Safari).

### 🧾 Métadonnées dans `<head>`

```html
<!-- Mode standalone -->
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="MyKTAMap">
<meta name="mobile-web-app-capable" content="yes">

<!-- Icône écran d'accueil iOS -->
<link rel="apple-touch-icon" href="icon/mkm.png">
<link rel="apple-touch-icon" sizes="180x180" href="icon/mkm.png">
<link rel="apple-touch-icon" sizes="167x167" href="icon/mkm.png">
<link rel="apple-touch-icon" sizes="152x152" href="icon/mkm.png">
<link rel="apple-touch-icon" sizes="120x120" href="icon/mkm.png">

<!-- Favicon classique navigateur -->
<link rel="icon" type="image/png" href="icon/mkm.png">
```

### 🍎 Pourquoi 5 balises `apple-touch-icon`

Safari iOS **ignore complètement** la balise `<link rel="icon">` standard pour le bouton "Sur l'écran d'accueil". Il cherche **uniquement** `apple-touch-icon`. On déclare plusieurs tailles pour qu'iOS choisisse la plus proche selon l'appareil :

| Taille | Appareil cible |
|---|---|
| 180×180 | iPhone Retina (récents) |
| 167×167 | iPad Pro |
| 152×152 | iPad standard |
| 120×120 | iPhone non-Retina |
| sans taille | Fallback universel |

En pratique on peut servir le même fichier (Safari redimensionne) — l'important c'est que la balise existe.

### 🖼️ Contraintes du fichier icône

- **PNG carré** (idéalement 180×180 minimum, 512×512 recommandé)
- **Fond opaque** — pas de transparence, sinon iOS met du noir
- **Pas d'arrondi** dans l'image — iOS arrondit les coins automatiquement
- **Marge interne 10-15%** — iOS rogne légèrement les bords

### 🔁 Mise à jour de l'icône

iOS cache l'icône PWA de manière agressive. Pour forcer le rafraîchissement après changement :

1. Sur l'iPhone : appui long sur l'icône MyKTAMap → Supprimer l'app
2. Réglages → Safari → Effacer historique et données
3. Ferme Safari complètement (swipe up dans le sélecteur d'apps)
4. Rouvre `myktamap.is-underground.fr` dans Safari
5. Partager ↑ → Sur l'écran d'accueil

L'icône est servie depuis `icon/mkm.png` — vérifier sa disponibilité directe avec `https://devmap.is-underground.fr/icon/mkm.png`.

---

## 🔄 Mode hors-connexion — Service Worker

Le `sw.js` est **actif** et précache l'ensemble des assets statiques de l'application au premier chargement. Une fois en cache, l'app fonctionne entièrement hors-ligne.

**Stratégie :**
- **Cache First** pour les assets app (HTML, JS, CSS, icônes)
- **Network First** pour `data/plan-config.json` et les données du plan (toujours fraîches si dispo)
- **Fallback Cache** automatique si pas de réseau

**Mise à jour de version :**
Quand tu déploies une nouvelle version, incrémente `CACHE_VERSION` dans `sw.js`. Les anciens caches sont automatiquement purgés au prochain `activate`.

**Désactivation manuelle :**
Le bouton 🗑️ Réinitialiser dans ⚙️ désinscrit le SW et vide tous les caches → recharge complète depuis le serveur.

---

## 🚀 Démarrage — auto-détection du mode

`main.js` orchestre le démarrage en deux branches :

```
initApp()
  → loadAppConfig()          ← tente fetch('data/plan-config.json')
      → succès               → lancerApplication()   (mode serveur)
      → échec                → afficherLoader()       (mode import)

startImportedPlan()          ← appelé par le loader HTML ou le ZIP modifier
  → resetRuntimeAssets()
  → registerAsset() × N      ← enregistre les fichiers comme Blob URLs
  → cloneAndResolvePlanConfig()
  → buildAppConfigFromPlan() ← applique perfMode du loader
  → lancerApplication()
```

Le loader HTML est intégré dans `index.html` avec `display:none` — il s'affiche uniquement si aucun plan serveur n'est détecté, ou quand l'utilisateur clique 🗂️.

---

## 🎨 Système d'icônes dynamique

Les icônes sont entièrement **pilotées par `PLAN_CONFIG.icons`** — aucune liste hard-codée dans le code.

### 🗺️ `_iconMap` (map.js)

Construit dynamiquement par `creerIcones()` à partir de `iconConfig` :

```js
window._iconMap = {};
Object.keys(iconConfig).forEach(function(tag) {
  if (!iconConfig[tag]) return;
  window._iconMap[tag] = L.icon({
    iconUrl:    iconConfig[tag],
    iconSize:   [50, 50],
    iconAnchor: [25, 25]
  });
});
```

Toutes les icônes sont en **50×50 avec ancrage centré** (auparavant `vehicule` était une exception en 50×25 qui causait un export PNG étiré).

### 🧭 `choisirIcone(point)` (utils.js)

Parcourt `point.tags` et retourne la première icône définie dans `_iconMap`. Permet à `editor.js` de gérer des tags personnalisés sans modifier le code.

### 🖼️ `getIconForPoint(point)` (utils.js, export PNG)

Même logique que `choisirIcone` mais pour le canvas d'export. Charge l'image en cache et retourne le couple `{img, path}`.

---

## ⚡ Mode Performance (tiling.js)

Pour les plans JPEG volumineux (> 60 Mo) qui crashent Safari iOS, le mode performance découpe l'image en tuiles.

### ✅ Activation

| `APP_CONFIG.perfMode` | Comportement |
|---|---|
| `null` (Auto) | Activé si `fileSize > 60Mo` |
| `true` | Toujours activé |
| `false` | Désactivé — imageOverlay classique |

Le choix dans le loader (checkbox ⚡) est passé explicitement à `startImportedPlan(file, assets, perfChoisi)` et écrase le localStorage.

### 🔁 Flux technique

```
chargerImage(url, bounds, map, fileSize, sourceFile)
  → perfModeActif() ?
      → chargerImageTuillee()
          → _imageVersCanvasReduit() ← <img> HTML → canvas (max 8192px)
              ↳ Blob URL créée et révoquée à l'intérieur (sécurité Safari)
              ↳ Détection canvas noir + re-essai 100ms
          → _tilerDepuisCanvas()    ← découpe en tuiles 1024×1024 JPEG 0.88
              → L.imageOverlay()    ← placement Leaflet
      → L.imageOverlay()            ← mode normal
```

### 🍎 Limites Safari iOS

- `drawImage` sur un JPEG > 8192px échoue silencieusement → canvas noir
- Détection automatique : `getImageData(1,1,1,1)` après drawImage
- Fallback : re-essai avec `setTimeout(100ms)`, puis `imageOverlay` classique si toujours noir
- La Blob URL est créée et révoquée **à l'intérieur** de `_imageVersCanvasReduit` pour éviter l'expiration sandbox Safari

---

## 💾 Préférences utilisateur

Les préférences sont séparées de la config plan pour survivre aux changements de plan :

```js
// Sauvegarde
localStorage.setItem("app_user_prefs", JSON.stringify({
  motionDebug: APP_CONFIG.motionDebug,
  perfMode:    APP_CONFIG.perfMode
}));

// Restauration (dans buildAppConfigFromPlan)
const saved = JSON.parse(localStorage.getItem("app_user_prefs") || "{}");
if ("perfMode" in saved) cfg.perfMode = saved.perfMode;
```

Les dimensions du plan et paramètres tracking viennent toujours du `plan-config.json`.

---

## ⚙️ Configuration — `plan-config.json`

Chaque plan est décrit par un fichier `plan-config.json`.

### 🧾 Exemple complet

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
    { "id": "legende", "label": "Legende", "file": "data/TestMAP_LEGENDE.png", "visible": true, "order": 10 }
  ],
  "dataLayers": [
    { "id": "puits",    "label": "Puits",   "file": "data/puit.json",    "visible": true },
    { "id": "vehicule", "label": "Vehicule","file": "data/vehicule.json","visible": true },
    { "id": "editor",   "label": "Ajouts",  "file": "data/editor.json",  "visible": true }
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
    "vehicule": "icon/vehicule.png",
    "fontaine": "icon/iconetrack.png"
  }
}
```

> Le calque `editor` doit toujours être présent dans `dataLayers`.
> Les tags `default` et `track` sont **obligatoires** dans `icons`. Les autres sont libres.

---

## 📁 Description des modules

### `config.js` (unifié)

Gère :
- `DEFAULT_CONFIG` / `APP_CONFIG` — configuration active
- `RUNTIME_ASSETS` — registre des fichiers importés (Blob URLs)
- `buildAppConfigFromPlan()` — construit APP_CONFIG depuis un plan + préférences
- `loadAppConfig()` — charge `data/plan-config.json` (mode serveur)
- `sauvegarderPrefsUtilisateur()` — persiste `motionDebug` et `perfMode`
- Helpers : `registerAsset()`, `findMatchingFile()`, `cloneAndResolvePlanConfig()`, `validateImportedPlan()`

### `map.js` (unifié)

- `cleanupExistingMap()` — destruction propre de la carte existante avant rechargement
- `initMapFromConfig()` — initialisation Leaflet, calques, tiling si nécessaire
- `creerIcones(iconConfig)` — construit `_iconMap` dynamique
- `initCollisionMap()` — canvas collision avec downscale automatique (max 4096px)

### `main.js` (unifié)

- `lancerApplication()` — reset complet + init carte + init modules dans l'ordre : `initEditor → initRoad → initZones → initMeasure → initInterface → initTracking`
- `startImportedPlan(planConfigFile, assetFiles, perfChoisi)` — chargement depuis le loader
- `afficherLoader()` — affiche le loader intégré
- Auto-détection au démarrage via `loadAppConfig()`
- Reset des flags `interfaceInitialized`, `roadInitialized`, `zonesInitialized` au changement de plan

### `editor.js`

Modale plein écran pour ajouter un point. Liste de tags dynamique avec :
- **— Aucun tag (défaut) —** (utilise icône `default`)
- Tags du `PLAN_CONFIG.icons`
- **➕ Créer un nouveau tag…** (validation regex `[a-z0-9_-]+`, ajout à `PLAN_CONFIG.icons` + `_iconMap`)

API exposée :
- `getEditorPoints()` / `setEditorPoints(points)`
- `removeLastEditorPoint()` — supprime le dernier point ajouté
- `renderEditorPoints()` — re-rendu complet du calque

### `road.js`

API exposée :
- `getRoads()` / `setRoads(roads)`
- `resetRoads()` — supprime tout
- `removeLastRoad()` — supprime le dernier tracé entier
- `removeLastRoadPoint()` — supprime le dernier point du dernier tracé (et le tracé s'il devient vide)
- `toggleRoadMode(type)` — active/désactive un mode de tracé

### `zones.js`

Module dédié aux zones polygonales remplies. Trois types : `eau`, `remblais`, `effondrement`.

**Comportement :**
- Tracé avec aperçu pointillé pendant l'édition + cercle visible sur le 1er point dès 3 points posés
- Fermeture par re-clic sur le 1er point (tolérance **5 px**) OU bouton ✅ Fermer
- Mode exclusif : activer une zone désactive les autres modes (mesure, ajout, route, recalage, autre zone)

**Tri d'affichage :** `{ eau: 0, remblais: 1, effondrement: 2 }` — eau toujours en arrière-plan, effondrement toujours visible. Tri appliqué à 3 endroits : `renderZones()` (zones.js), export PNG (utils.js + exporter.js), data layer embarqué (utils.js).

**Styles :**
| Type | Bordure | Remplissage | Opacité bordure | Fill opacity |
|---|---|---|---|---|
| Eau | `#0066aa` | `#3aa9e8` | 1 | 0.7 |
| Remblais | `#3a3a44` | `#5a5a68` | 1 | 0.7 |
| Effondrement | `#cc0000` | `#ff3333` | 1 | 0.7 |

**API exposée :**
- `getZones()` / `setZones(zones)`
- `resetZones()` — supprime tout
- `toggleZoneMode(type)` — active/désactive un type
- `fermerZoneEnCours()` — ferme manuellement la zone (min 3 points)
- `removeLastZone()` — supprime la dernière zone fermée
- `removeLastZonePoint()` — supprime le dernier point (zone en cours OU dernière fermée)

**Format de stockage :**
```json
{ "type": "remblais", "points": [{"x":100,"y":200}, ...] }
```
Le point de fermeture est implicite (1er point répété). Inclus dans : session JSON (`zones[]`), data layer embarqué (`zones[]`), export PNG.

### `exporter.js`

Module dédié à la modale d'export du plan. Entrée publique : `window.ouvrirExportModal()`.

**Deux modes :**
- ⚡ **Rapide** — appelle `window.telechargerPlan()` (utils.js, comportement historique inchangé)
- 🎨 **Avancé** — modale détaillée avec choix par calque + légende intégrée

**Mode avancé — sections :**
1. Calques d'image (checkboxes pré-cochées selon visibilité)
2. Calques de données (checkboxes pré-cochés selon visibilité)
3. Annotations de session (points / tracés / zones / mesure / tracker)
4. **Légende intégrée** — toggle ON/OFF avec sous-options :
   - Position : 4 coins ou custom (bouton 🎯 sélection sur la carte)
   - Style : Opaque / Semi-transparent / Filigrane (dark theme cohérent avec les modales)
   - Taille : Compact / Standard / Large
   - Contenu : Icônes / Tracés / Zones / Tag tracker / Métadonnées (nom, version, auteur, date)
5. Format (PNG / JPEG 90%) + Résolution (1 / ½ / ¼)
6. Aperçu mini-canvas 320×200 (debounced 300ms)

**Sélection 🎯 sur la carte :** capture l'état de la modale, ferme temporairement la modale, attend le clic sur la carte, capture les coords plan (`x = lng`, `y = imageHeight - lat`), rouvre la modale en restaurant l'état + coords remplies. Échap pour annuler.

**Légende dessinée :**
- Layout en **2 colonnes** : Icônes à gauche, Tracés + Zones à droite (titre et méta en pleine largeur)
- Titre "Légende" en **Georgia italique**
- Date au format FR `JJ/MM/AAAA`
- Largeur ajustée au libellé le plus long, anti-débordement clamp aux bords du canvas
- Fond avec coins arrondis 6px

**Pas de persistance** des réglages — chaque ouverture repart sur les défauts (mode rapide, calques visibles cochés).

### `tableEditor.js`

Éditeur de fichier JSON sous forme de tableau interactif. Entrée publique : `window.ouvrirTableEditor()`.

**Workflow :**
1. Modale d'import (drag & drop ou file picker `.json`)
2. Auto-détection du format (`data` calque ou `editorPoints` session)
3. Tableau plein écran (~1100 px de large) avec édition inline
4. Sauvegarde via menu : 📥 Téléchargement / 🗺️ Remplacer le calque actif / ✏️ Remplacer la session
5. Confirmation à la fermeture si modifications non sauvées

**Détection des colonnes :** automatique avec ordre privilégié `id, nom, x, y, tags, etat, description, profondeur, date_update` puis le reste alphabétiquement.

**Édition inline :**
- Clic sur cellule → input avec focus auto
- **Tab** → cellule suivante (skip `id` lecture seule)
- **Entrée** → valide et passe à la ligne suivante (même colonne)
- **Échap** → annule la modification
- Validation typée : `x`/`y`/`profondeur` → input number ; `id` → lecture seule (cellule grisée) ; autres → text

**Validation des coordonnées :** cellule rouge avec ⚠ si `x < 0` ou `x > imageWidth` (idem pour `y`/`imageHeight`), tooltip avec la limite, compteur global "⚠️ N coordonnée(s) hors plan".

**Tags multi-select :**
- Affichage en chips avec × pour retirer
- Clic sur la cellule → dropdown avec :
  - Tags existants dans `PLAN_CONFIG.icons` (avec icône en preview)
  - Tags utilisés ailleurs dans le fichier
  - Champ "Créer un tag" (sanitization `/[^a-z0-9_-]/g`)
- Positionnement auto avec recadrage si dépasse de l'écran

**Autres fonctionnalités :**
- Recherche live (debounced 200ms) sur tous les champs textuels
- Tri par colonne (clic en-tête : asc → desc → none)
- Sélection multiple avec checkboxes + Maj+clic pour plage
- Ajouter ligne (vide en bas), Supprimer (avec confirmation), Dupliquer (suffixe `_copie` à l'id)
- 📍 **Aperçu sur la carte** : modale masquée, markers cercles oranges + banner "↩️ Retour à l'éditeur"
- Avertissement visuel si > 1000 lignes

**Sauvegarde — préservation totale du JSON original :** les champs `type`, `version`, `roads`, `zones`, `measure` du fichier source sont conservés tels quels au save.

**État interne :**
```js
let _data, _colonnes, _modifie, _selection, _tri, _filtre,
    _format, _sourceMeta, _lastSelectedIdx;
```

### `searchPoints.js`

Recherche rapide d'un point. Entrée publique : `window.ouvrirRecherche()`.

**Périmètre :** tous les calques `dataLayers` du plan + points de session (`editor`).

**Cache :**
- Au premier appel, charge tous les fichiers JSON via `fetch()` + récupère les `editorPoints` via `getEditorPoints()`
- Stocké dans `_pointsCache` sous forme `[{ point, layerId, layerLabel }]`
- Invalidé automatiquement au changement de plan via `_signaturePlan()` qui combine `name|version|baseImage`

**Recherche :**
- Champ live debounced 200ms
- Normalisation NFD + lowercase → insensible aux accents et à la casse
- Champs cherchés : `nom`, `id`, `description`, `tags`, `etat`
- **Tri par pertinence** :
  - Match exact dans `nom` → score 100
  - Début du `nom` → 80
  - Dans le `nom` → 60
  - Match exact dans `id` → 50
  - Début de l'`id` → 40
  - Dans l'`id` → 30
  - Dans `tags` → 20
  - Dans `description` ou `etat` → 10
- Limite : 50 résultats affichés + compteur "+ N autre(s)"

**Affichage des résultats :**
- Icône miniature 28×28 (résolue depuis `PLAN_CONFIG.icons` via les tags du point)
- ID en bleu vif (`#8cb4ff`) suivi du nom en gras
- Chip de calque (label) + tags (max 4 + "+N") + coordonnées en monospace
- 1er résultat pré-sélectionné (classe `.active`) → Enter valide directement

**Navigation clavier :**
- ↑ / ↓ : naviguer entre résultats
- Entrée : ouvrir le résultat actif
- Échap : fermer la modale

**Au clic sur un résultat (`_aller(item)`) :**
1. Modale fermée
2. **`map.setView(latlng, zoomCourant, { animate: false })`** — pas de `flyTo` pour éviter dérive cumulée d'arrondi sur plusieurs recherches successives
3. `map.invalidateSize()` pour sécurité
4. Recherche du marker existant dans `dataLayerGroups[layerId]` par comparaison **coords plan x/y** (reconvertit le `latlng` du marker en plan via `imageHeight - lat`) — pas par latlng direct, plus robuste
5. Si marker trouvé → `openPopup()`, sinon popup temporaire avec nom/description/layer/tags
6. **Cercle d'entourage statique** (pas d'animation) : `circleMarker` orange `#ffaa00`, rayon 24, fillOpacity 0, weight 3 — disparaît après 3 secondes

### `measure.js`

API exposée :
- `getMeasurePoints()` / `setMeasurePoints(points)`
- `resetMesure()` — supprime tout
- `removeLastMeasurePoint()` — supprime le dernier point de mesure
- `telechargerMesureJSON()` — export du tracé en JSON

### `tracking.js`

Cache collision initialisé une seule fois à l'init (`initCollisionCache`) — stocke le tableau RGBA complet en mémoire avec ratio `_collisionScaleX/Y` pour la conversion plan → canvas.

**API exposée** :
- `initTracking()` — reset complet, recrée marker + polyline + handlers (appelé à chaque chargement de plan)
- `startTracking()` / `stopTracking()` — active/désactive la lecture des capteurs
- `requestPermission()` — demande la permission iOS (appelé uniquement au clic sur ▶️ Play, plus au premier clic global)
- `resetTrackingPosition()` — repositionne le tracker à `startX/startY` et vide la polyline
- `getStepCount()` — nombre de pas détectés
- `initCollisionCache()` — recharge le cache collision après changement de plan
- **`getTrackingPosition()`** → `{ x, y }` — position courante en coords plan, **utilisé par les exporters et la recherche**
- **`getTrackingPath()`** → `[{x, y}, ...]` — liste des points du tracé depuis le démarrage (reconvertis depuis la polyline Leaflet en coords plan), **utilisé par les exporters**

### `utils.js`

- `convertCoord(x, y)` — coordonnées plan → Leaflet
- `choisirIcone(p)` — sélection dynamique depuis `_iconMap`
- `ajouterPointsDepuisJSON(url, layer)` — chargement par batch de 50, dessine les `roads[]` et **`zones[]`** embarqués (en lecture seule). `ZONE_STYLES_DATA` contient eau, remblais, effondrement avec tri eau → remblais → effondrement.
- `telechargerPlan()` — export PNG complet (mode Rapide). Lit les `roads[]` et `zones[]` embarqués depuis chaque calque actif (cohérence avec ce qui est affiché à l'écran). Dessine le tracker complet : path (polyline `#3388ff`) + position. Le mode **Avancé** est géré par `exporter.js`.

### `interface.js`

#### 🧱 Structure de l'interface — barre latérale 10 groupes

L'interface est organisée en **10 groupes** dans la barre latérale droite. Un seul groupe peut être ouvert à la fois — ouvrir un groupe ferme automatiquement les autres (sauf ceux qui ont un mode actif).

| # | Groupe | Icône | Type | Sous-actions |
|---|---|---|---|---|
| 1 | Aide / Doc / Légende | 📚 | Accordéon | Aide → Documentation → Légende |
| 2 | Paramètres | ⚙️ | **Solo** | (clic direct, ouvre la modale Réglages) |
| 3 | Recherche | 🔍 | **Solo** | (clic direct, ouvre la modale de recherche) |
| 4 | Charger / Import | ⬇️ | Accordéon | 📥 Importer une session → 📊 Éditer un fichier JSON → 🗂️ Changer de plan |
| 5 | Créer / Modifier plan | 🏗️ | **Solo** | (clic direct, ouvre le générateur) |
| 6 | Enregistrer | ⬆️ | Accordéon | 💾 Session (modale 3 modes) → 🖼️ Plan PNG (export avancé) |
| 7 | Tracker | 🧭 | Accordéon | ▶️/⏹️ Tracking → 📍 Recalage |
| 8 | Mesure | 📐 | Accordéon | 📐 Activer mesure → ❌ Effacer |
| 9 | Édition | 📌 | Accordéon | 📌 Activer ajout → 🗑️ Effacer |
| 10 | Tracés | 🛣️ | Accordéon | 🟩 Principale → 🟪 Secondaire → 🟨 Chemin → 🧹 Effacer |
| 11 | Zones | ⬛ | Accordéon | ⬛ Remblais → 🟥 Effondrement → 🟦 Eau → ✅ Fermer → 🧹 Effacer |

#### ⚙️ Règles de comportement

- **Sens de déroulement** : accordéon vertical — les sous-actions apparaissent en dessous de l'icône principale et repoussent les groupes suivants
- **Exclusivité** : un seul groupe ouvert à la fois ; ouvrir un groupe ferme automatiquement le précédent
- **Mode actif** : si un mode du groupe est actif (mesure, ajout, route, zone, recalage, tracking), le groupe **reste verrouillé ouvert** pour permettre l'accès direct aux sous-actions
- **Icône principale active** : l'icône principale du groupe **reflète visuellement le mode actif**
  - Tracker : 🧭 → ⏹️ (tracking en cours) ou 📍 (recalage actif)
  - Tracés : 🛣️ → 🟩 / 🟪 / 🟨 selon le type actif
  - Zones : ⬛ → ⬛ / 🟥 / 🟦 selon le type actif
- **Clic hors d'un groupe ouvert** → ferme le groupe automatiquement
- **Modes exclusifs préservés** : Mesure / Édition / Recalage / Tracés / Zones restent mutuellement exclusifs

#### 🏗️ Architecture du code

- **`_creerGroupeAccordeon(config)`** — fonction unique qui crée un groupe (solo ou accordéon)
- **`_groupes`** — registry global de tous les groupes avec leur état (`{ container, btnPrincipal, subActions, modeActif }`)
- **`_ouvrirGroupe`, `_fermerGroupe`, `_toggleGroupe`** — gestion centralisée de l'état accordéon
- **`_setGroupeModeActif(id, actif, iconeReflet)`** — verrouille un groupe ouvert et change l'icône principale
- **`_initClickExterieur`** — listener global qui ferme le groupe ouvert au clic en dehors

#### 🪟 Modales disponibles

| Fonction | Description |
|---|---|
| `afficherAide()` | Référence des boutons par groupe |
| `afficherConfig()` | Réglages APP_CONFIG + 🎯 calibrage + logs + réinitialiser |
| `afficherLegende()` | Icônes, tracés et zones du plan actif |
| `afficherReadme()` | Choix doc utilisateur / développeur |
| `ouvrirExportSessionModal()` | **Modale d'export de session — 3 modes (Full / Avancé / Conversion)** (sessionExporter.js) |
| `afficherPlanner()` | Générateur de plan ZIP (Nouveau / Modifier) |
| `afficherLogsDebug()` | Panneau logs de débogage |
| `afficherFormulaire(x, y)` | Modale ajout de point (editor.js) |
| `ouvrirImportSession()` | Modale d'import de session avec drag & drop et aperçu |
| `ouvrirCalibrageEchelle()` | Modale de calibrage par produit en croix |
| `ouvrirExportModal()` | **Modale d'export plan avancé** (exporter.js) |
| `ouvrirTableEditor()` | **Éditeur de fichier JSON sous forme de tableau** (tableEditor.js) |

#### 🧹 Helpers de suppression

- `_confirmerAction(titre, texte, callback)` — modale simple Annuler/Confirmer
- `_choixSuppression(titre, texte, options[])` — modale avec liste d'options labellées (chacune avec icône, description, callback). Utilisée pour : effacer mesure, points, tracés, zones.

#### 🎯 Calibrage de l'échelle

`ouvrirCalibrageEchelle()` ouvre une modale dédiée accessible via le bouton 🎯 à côté du champ Échelle dans ⚙️.

Calcul (formule corrigée) : `nouveau_scale = scale_actuel × (distance_AFFICHÉE / distance_RÉELLE)`

> **Vérification :** scale=4.9, l'appli affiche 100m, en réalité 150m → l'appli surestime → il faut **réduire** scale → `4.9 × (100/150) = 3.27` ✅

L'utilisateur saisit la distance affichée par l'appli et la distance réelle mesurée au sol. La modale calcule la nouvelle échelle en temps réel et l'injecte dans le champ Échelle quand on valide.

#### 📥 Modale d'import de session

`ouvrirImportSession()` ouvre une modale plein écran cohérente avec les autres modales :
- Zone drag & drop pour fichier `.json`
- Validation du type (`devmap-session` requis)
- Aperçu du contenu : nombre de points, tracés, **zones**, et points de mesure
- Avertissement explicite : *"l'import remplacera tes points/tracés/zones/mesure actuels"*
- Bouton "Importer" désactivé tant que le fichier n'est pas validé
- Restauration via `setEditorPoints`, `setRoads`, `setZones`, `setMeasurePoints`

#### 🏠 Page d'accueil — boutons supplémentaires

Le loader (`#planLoaderOverlay` dans `index.html`) propose en bas, sous le mode performance :
- **🏗️ Générer un plan** — toujours visible, ouvre `window.afficherPlanner()`
- **🌐 Charger le plan serveur** — toujours visible, tente `loadAppConfig()` au clic. Affiche un message d'erreur clair si aucun `plan-config.json` n'existe à la racine.

L'onglet "Fichiers séparés" du loader a été supprimé — seul le mode ZIP est conservé.

#### 📱 Adaptation mobile paysage

CSS `@media (max-height: 500px)` :
- `.leaflet-top.leaflet-right { max-height: calc(100vh - 16px); overflow-y: auto }` — barre scrollable verticalement
- Scrollbar masquée (Webkit + Firefox)
- Boutons réduits à 28×28px / font 14px
- Espacement entre groupes réduit à 1px

### `debug.js`

Capture silencieuse de tous les `console.log/warn/error` + erreurs non catchées. Persistance dans `localStorage("kta_debug_logs")` — les logs survivent au crash du tab. Accessible via ⚙️ → 🐛 Logs.

### `createConf.js` (Générateur de plan)

Deux onglets :
- **📄 Nouveau** — formulaire vierge
- **📂 Modifier existant** — drop ZIP, pré-remplissage, régénération

Sections du formulaire :
1. Métadonnées (nom, version, auteur, dimensions)
2. Images principales (base + collision)
3. Calques image supplémentaires (jusqu'à 10)
4. Calques de données JSON (jusqu'à 10, `editor` ajouté automatiquement)
5. Paramètres de tracking
6. **Icônes & Tags** — gestionnaire dynamique avec :
   - Bouton "↺ Charger défauts" — pré-remplit avec les icônes standards
   - Bouton "+ Ajouter un tag" — création d'un tag personnalisé
   - Upload d'icônes custom par tag (preview live)
   - Tags `default` et `track` en lecture seule (système)

---

## 📦 Structure des données JSON

### 🗂️ Format standard (calques de données)

```json
{
  "type": "puits",
  "version": 1,
  "data": [ ... ],
  "roads": []
}
```

Le champ `roads[]` est optionnel — s'il est présent, les tracés sont affichés en lecture seule dans le même calque Leaflet (non modifiables via 🧹).

### 💾 Format session exportée

```json
{
  "type": "devmap-session",
  "version": 1,
  "editorPoints": [ ... ],
  "measure": { "points": [] },
  "roads": []
}
```

### 📍 Format point

```json
{
  "id": "PA1",
  "nom": "Puits Aération",
  "x": 4843,
  "y": 2002,
  "tags": ["pa"],
  "etat": "Non inspectée",
  "description": "Puits avec courant d'air",
  "profondeur": 12,
  "date_update": "2026-04-03"
}
```

Un point peut avoir un tableau `tags` vide → utilise l'icône `default`.

---

## 💾 Export de session — `sessionExporter.js`

Module autonome activé par `window.ouvrirExportSessionModal()`. Modale avec 3 onglets.

### Mode 🚀 Full
- Inclus : `editorPoints`, `roads`, `zones`
- **Exclu** : tracker, mesure
- Format de sortie : 1 fichier `devmap-session` (JSON)
- Nom : `session_<plan>_AAAAMMJJ.json`

### Mode 🎨 Avancé
Cases à cocher hiérarchiques :
- ✏️ **Points ajoutés** + sous-cases par tag (avec icône miniature) + `(sans tag)`
- 🛣️ **Tracés** + sous-cases par type (principal / secondaire / chemin)
- ⬛ **Zones** + sous-cases par type (eau / remblais / effondrement)
- 🧭 **Position du tracker** (case unique avec mention `(+ tracé N pts)` si path > 1)

Format de sortie au choix :
- 📄 Un seul fichier `devmap-session` (réimportable, contient tout en un bloc)
- 📦 ZIP multi-fichiers (`session_points.json`, `session_roads.json`, `session_zones.json`, `session_tracker.json`)

### Mode 🔄 Conversion
Convertit la session en data layer(s) au format `devmap-data`. Pas de tracker.

Cases à cocher :
- ✏️ **Points ajoutés** + sous-cases par tag (idem Avancé)
- 🛣️ **Tracés**
- ⬛ **Zones**

Granularité au choix :
- 📄 **Basique** : 1 fichier par catégorie (`points.json`, `roads.json`, `zones.json`)
- 🔬 **Fine** :
  - Points : 1 fichier `points.json` (les tags peuvent être multiples → séparation ambiguë)
  - Tracés : 1 par type (`roads_principal.json`, `roads_secondaire.json`, `roads_chemin.json`)
  - Zones : 1 par type (`zones_eau.json`, `zones_remblais.json`, `zones_effondrement.json`)

Sortie : fichier unique si 1 seul, ZIP sinon.

### Filtrage par tag (Avancé + Conversion)

**Logique d'inclusion** : un point est inclus s'il a **au moins un de ses tags coché**, OU s'il n'a pas de tag et que `(sans tag)` est coché.

**Synchronisation parent ↔ tags** :
- Décocher Points ajoutés → décoche tous les tags
- Cocher au moins 1 tag → recoche le parent
- Tout décocher → décoche le parent

**Helpers internes** :
- `_listerTagsPoints(points)` — retourne `[{tag, count, isUntagged}]` trié alphabétiquement
- `_filtrerPointsParTags(points, tagsCoches, untaggedCoche)` — filtre selon les tags cochés
- `_lireTagsCoches(prefix, tagsList)` — lit les sous-cases du DOM (préfixes `adv_points_tag_` ou `conv_points_tag_`)
- `_slugTagId(tag)` — sécurise un nom de tag pour servir d'id CSS
- `_iconePourTag(tag)` — récupère le chemin de l'icône depuis `PLAN_CONFIG.icons`

### Format `devmap-session` (Full / Avancé)
```json
{
  "type": "devmap-session",
  "version": "1.0",
  "date_export": "2026-05-05T...",
  "editorPoints": [...],
  "roads": [...],
  "zones": [...],
  "tracker": { "position": {x,y}, "path": [...] }   // optionnel, mode Avancé
}
```

### Format `devmap-data` (Conversion)
```json
{
  "type": "devmap-data",
  "version": "1.0",
  "date_export": "2026-05-05T...",
  "data": [...],         // ex-editorPoints
  "roads": [...],        // optionnel
  "zones": [...]         // optionnel
}
```
Lecture par `ajouterPointsDepuisJSON()` (utils.js) qui rend les markers, les routes et les zones.

### Permission capteurs (tracking)

Avant : listener `document.body.click({once:true})` dans `main.js` et `main_import.js` qui appelait `requestPermission()` au tout premier clic global → popup iOS gênante (interférait avec l'import, l'édition, etc.).

Maintenant : `requestPermission()` est appelé **uniquement** au clic sur ▶️ Play du tracker (interface.js ligne 1555). Cohérent avec la directive Apple : la permission `DeviceMotionEvent.requestPermission()` doit être appelée dans une tâche utilisateur directe.

---

## 📍 Gestion des coordonnées

GIMP : origine haut-gauche (Y vers le bas). Leaflet `L.CRS.Simple` : origine bas-gauche (Y vers le haut).

```js
function convertCoord(x, y) {
  return [APP_CONFIG.imageHeight - y, x];
}
```

---

## 🐛 Débogage

Le panneau de logs est accessible via **⚙️ → 🐛 Logs**. Il capture en silence :
- Tous les `console.log`, `console.warn`, `console.error`
- Les erreurs non catchées (`window.onerror`)
- Les promesses rejetées (`unhandledrejection`)

Les logs sont persistés dans `localStorage("kta_debug_logs")` — ils survivent au crash du tab Safari iOS. Au prochain ouverture, les logs du crash précédent s'affichent en grisé avec le label `[CRASH PRÉCÉDENT]`.

---

## 📄 Licence

Projet personnel — libre d'adaptation selon vos besoins non commerciaux.