# 📘 MyKTAMap
> Application web de cartographie terrain — visualisation, annotation et déplacement simulé sur plan image.

**🌍 Environnements :**
- 🟢 Production : [myktamap.is-underground.fr](https://myktamap.is-underground.fr)
- 🔧 Développement : [devmap.is-underground.fr](https://devmap.is-underground.fr)

> ⚠️ Les données présentes sur le site de démonstration sont fictives.

## 📋 Journal des modifications

### 🗓️ 08/05/2026 — Mode performance réglable (5 presets DLSS-like) + flag debug global

- **Refonte du mode performance** : la simple checkbox boolean est remplacée par un **segmented control 5 boutons** dans le loader, à la manière du DLSS dans les jeux vidéo :
  - 💤 **Désactivé** — aucun tiling, `L.imageOverlay` direct (qualité brute, équivalent de l'ancien `perfMode = false`). ⚠️ Risque de crash sur Safari iOS pour images > 8192 px
  - 🔄 **Auto** — comportement legacy : tile uniquement si fichier > 60 Mo, avec params Équilibré (= défaut sain pour 90% des cas)
  - 🌟 **Qualité** — `MAX_WORK_DIM 12288 / TILE 1024 / JPEG 0.95`. Plus net, recommandé sur PC desktop avec plans très grands à zoomer
  - 🎯 **Équilibré** — `MAX_WORK_DIM 8192 / TILE 1024 / JPEG 0.88`. Reproduit le comportement v1 (mode performance forcé) — défaut idéal
  - ⚡ **Performance** — `MAX_WORK_DIM 6144 / TILE 768 / JPEG 0.78`. Plans très lourds, mobile faible, urgence terrain
- **Persistance par plan** : le preset choisi est sauvegardé dans `PlanRegistry[planId].perfPreset` (localStorage). Plus de pref globale `app_user_prefs.perfMode` — chaque plan a son propre réglage
- **Tiling logic** :
  - Mode `off` → JAMAIS de tiling (`L.imageOverlay` direct, choix utilisateur explicite)
  - Mode `auto` → tile si `fileSize > 60 Mo` (= seuil legacy `PERF_AUTO_TILE_THRESHOLD`)
  - Modes explicites (`quality`/`balanced`/`performance`) → tile si `imageWidth × imageHeight > 4096²` (= `tuilingNecessaire()` existant, sécurité GPU mobile). Sinon `L.imageOverlay` direct (qualité native)
- **Nouvelle table `PERF_PRESETS`** dans `tiling.js` (export `window.PERF_PRESETS`) — chaque preset porte ses 3 leviers techniques + emoji + label + description
- **Nouvelle fonction `resoudrePerfPreset(preset, fileSize, W, H)`** retournant `{tile: bool, params: {...}}`. Remplace l'ancien `perfModeActif(fileSize)` (conservé en alias rétro-compat)
- **Pipeline de tiling rendu paramétrique** : `chargerImageTuillee`, `_imageVersCanvasReduit`, `_tilerDepuisCanvas` reçoivent désormais `params` (au lieu de lire les constantes globales). Permet à chaque preset d'utiliser ses propres réglages
- **`plan-config.json` inchangé** — le mode performance est purement un choix utilisateur côté app, pas une donnée du plan

- **Renommage du flag debug** : `motionDebug` → `debugMode` (flag global, plus uniquement tracker)
  - Ce flag contrôlait UNIQUEMENT les logs du tracker auparavant — il sert maintenant aussi à afficher les **chiffres techniques** (`MAX:8192 / TILE:1024 / Q:0.88 / tile si > 60 Mo`) sous le segmented control du loader
  - Migration silencieuse au boot : `localStorage.app_user_prefs.motionDebug` → `debugMode` (préserve la valeur)
  - L'ancienne pref globale `perfMode` est SUPPRIMÉE de localStorage au boot (perfPreset est désormais par plan)
  - Réglages ⚙️ : ligne "Debug mouvement" renommée en **"Logs détaillés"** (id `cfg_motionDebug` → `cfg_debugMode`)
  - `tracking.js` met à jour ses 2 références (logs Magnitude + détection de pas)

- **Nouveau bouton 🐛 dans le loader** (bloc "Plus d'options", inséré avant Reset)
  - Toggle global pour `APP_CONFIG.debugMode` accessible avant tout chargement de plan
  - Texte dynamique `🐛 Logs détaillés : ON/OFF` + état actif teinté avec la couleur d'accent `#f4c542`
  - Helper unique `window.setDebugMode(value)` dans `config.js` — utilisé à la fois par le bouton du loader et par le toggle des Réglages ⚙️ (un seul point d'entrée)

- **Nouveaux helpers `PlanRegistry.getPerfPreset(id)` / `setPerfPreset(id, preset)`**
  - Validation contre `["auto", "quality", "balanced", "performance"]` (toute autre valeur ignorée + warn console)
  - Le champ `perfPreset` est ajouté au format de fiche plan (optionnel — absent = pas de pref → défaut "auto")

- **Charte graphique respectée** :
  - Boutons inactifs : fond `rgba(255,255,255,0.04)` / texte `#c8d0e0`
  - Bouton actif : fond `#f4c542` (jaune doré accent) / texte `#1a1f2e` (sombre, contraste maximal)
  - Hover inactif : fond `rgba(255,255,255,0.08)` / texte `#e8eaf0`
  - Description sous segmented : italique `#8892a4` (couleur secondaire)

- **Fichiers modifiés** : `index.html`, `css/style.css`, `js/tiling.js`, `js/config.js`, `js/main.js`, `js/planRegistry.js`, `js/interface.js`, `js/tracking.js`. **Inchangés** : `plan-config.json`, `js/createConf.js` (générateur ZIP), `js/exporter.js`, `js/sessionExporter.js`

---

### 🗓️ 06/05/2026 (suite 3) — 6 nouveaux tags d'accès + refonte cascade icônes + légende 5 groupes

- **Ajout de 6 nouveaux tags built-in** dans le set par défaut :
  - `peo` / `pef` — Puits à échelon ouvert / fermé
  - `eso` / `esf` — Escalier service ouvert / fermé
  - `cao` / `caf` — Cavage ouvert / fermé
  - Convention : **vert = ouvert**, **rouge = fermé**, transparence 50% sur le fond du cercle
  - PNG 50×50 avec transparence alpha (générés via Pillow), placés dans `icon/`

- **Refonte de la cascade de résolution d'icônes**
  - Nouveau **fallback built-in `TAGS_BUILTIN`** dans `map.js` (fonction `creerIcones`) : si un tag n'est pas déclaré dans `plan-config.json > icons`, l'app pointe automatiquement vers `icon/<tag>.png`
  - Permet d'utiliser les nouveaux tags sur des plans existants **sans modifier leur `plan-config.json`**
  - Tous les tags built-in sont précisés dans `TAGS_BUILTIN` : salle, pa, pb, pc, pe, ps, **peo, pef, eso, esf, cao, caf**, vehicule, elec, epure, info, chatiere, passage, danger
  - `_iconMap` est désormais **toujours rempli** avec ces tags, même si le plan-config ne les déclare pas

- **Nouvelle fonction utilitaire centralisée `getIconUrlForPoint(point)`** (`utils.js`)
  - Cascade complète :
    1. `PLAN_CONFIG.icons[tag]` (déclaré dans le plan)
    2. `_iconMap[tag].options.iconUrl` (built-in fallback de `TAGS_BUILTIN`)
    3. `PLAN_CONFIG.icons.default`
    4. `_iconMap.default.options.iconUrl`
    5. `null`
  - Exposée globalement via `window.getIconUrlForPoint`
  - **Utilisée maintenant par tous les modules** qui ont besoin d'une URL d'icône (au lieu d'un objet `L.icon`)

- **Modules mis à jour pour utiliser la cascade complète** (correction de bugs visuels) :
  - `searchPoints.js > _getIconUrl` — la recherche affichait l'icône par défaut pour les nouveaux tags
  - `utils.js > telechargerPlan > getIconForPoint` — l'export PNG simple ratait les nouveaux tags
  - `exporter.js > _iconePourTag` — l'export PNG avancé ratait les nouveaux tags
  - `exporter.js > getIconUrl` (dessin canvas) — idem
  - `exporter.js` (construction légende) — itère désormais sur `config.icons ∪ _iconMap`
  - `sessionExporter.js > _iconePourTag` — preview session manquait les nouveaux tags

- **Editor — modale d'ajout de point** (`editor.js > _buildTypeOptionsHTML`)
  - Avant : la liste déroulante n'affichait **que les tags du `plan-config.json`**
  - Après : fusion `EDITOR_TAG_LABELS` ∪ `plan-config.json` → l'utilisateur peut **toujours** sélectionner un type même si le plan-config ne le déclare pas (l'app utilise `_iconMap` ou l'icône par défaut)
  - Tri : tags labellisés d'abord (ordre canonique), puis tags custom non labellisés en queue

- **Légende d'aide** (`interface.js > LEGENDE_LABELS` + groupes)
  - Ajout des 6 labels (peo/pef/eso/esf/cao/caf)
  - Nouveau groupe **"🪜 Accès"** affiché entre "🕳️ Puits" et "⚠️ Signalétique"
  - Lecture depuis `_iconMap` en fallback → les icônes apparaissent même si pas dans `plan-config.icons`

- **Export PNG — Légende refondue en 5 groupes** (`exporter.js`)
  - **Avant** : un seul gros bloc "Icônes" à gauche + Tracés/Zones à droite → déséquilibre énorme dès qu'on a 15+ icônes
  - **Après** : 5 sections distinctes (cohérent avec la légende d'aide) :
    - 🕳️ Puits, 🪜 Accès, ⚠️ Signalétique, 🛣️ Tracés, ⬛ Zones
    - + 🏷️ Autres (auto, si tags custom créés via "➕ Créer un nouveau tag")
  - **Algorithme de répartition équilibré** : chaque groupe est ajouté à la **colonne la moins remplie** (en lignes cumulées)
  - Adaptation automatique selon le nombre d'icônes effectivement disponibles

- **Générateur de plans** (`createConf.js > PLANNER_DEFAULT_ICONS`)
  - Les 6 nouveaux tags apparaissent automatiquement dans le panneau "Icons" du générateur 🏗️
  - Les nouveaux plans créés via le générateur incluent ces tags dans leur `plan-config.json`

- **Service Worker** (`sw.js`)
  - Les 6 nouveaux PNG ajoutés au cache PWA pour disponibilité hors-ligne

- **Bug fix corollaire — Plan Switcher** (`interface.js > _chargerPlanDirect`)
  - Suppression prématurée de `kta-titre-fixe` corrigée
  - Si l'utilisateur clique sur un autre plan via le titre puis annule la modale "Plan introuvable", le titre du plan en cours reste désormais affiché

### 🗓️ 06/05/2026 (suite 2) — Plan Switcher (titre cliquable)

- **Titre du plan rendu cliquable** (`interface.js` + `style.css`)
  - Suppression de `pointer-events: none` sur `#kta-titre-fixe`
  - Ajout d'une flèche `▾` (`.kta-titre-arrow`) à côté du nom du plan
  - Hover : fond légèrement plus clair, bordure bleutée, opacité de la flèche augmentée
  - État `.ouvert` (panneau actif) : flèche pivotée à 180°, bordure plus marquée
  - Animation `:active` (scale 0.98) au clic

- **Nouveau panneau "Plan Switcher"** (`#kta-plan-switcher`)
  - Affichage : ancré sous le titre, animation slide+fade-in 180ms
  - Contenu : "📚 PLANS RÉCENTS" + 3 derniers plans **excluant le plan en cours** (filtre par `id`)
  - Pour chaque plan : icône (🌐 ou 💾), nom + version (badge bleuté), date relative ("il y a 5 min", "hier", "04/05")
  - Lien "📚 Tous mes plans…" en bas → revient au loader complet (avec confirmation si session active)
  - Si aucun autre plan : message "Aucun autre plan dans votre liste" + lien "Tous mes plans…"
  - Fermeture : clic ailleurs / Escape / re-clic sur le titre

- **Détection automatique de la "session active"** (fonction `_sessionAModif`)
  - Considère la session active si **au moins un** des éléments est non-vide :
    - `getEditorPoints().length > 0` (points ajoutés)
    - `getRoads().length > 0` (routes tracées)
    - `getZones().length > 0` (zones)
    - `getMeasurePoints().length > 0` (mesure)
    - `getTrackingPath().length > 1` (parcours du tracker)
  - Fonction `_resumeSession()` retourne la liste détaillée pour l'affichage : `["5 points ajoutés", "2 tracés", "1 zone", ...]`

- **Comportement adaptatif au clic sur un plan du switcher**
  - **Si session vierge** → chargement direct via `_chargerPlanDirect()` (pas de friction)
  - **Si session active** → modale stylisée `kta-modal` :
    ```
    ⚠️ Session en cours
    Vous avez des modifications non enregistrées sur le plan en cours :
       • 5 points ajoutés
       • 2 tracés
       • 1 zone
    Charger « Plan Test 1 » va vous faire perdre ces modifications.
    [Annuler]   [Charger quand même]
    ```

- **Chargement direct sans repasser par le loader** (`_chargerPlanDirect`)
  - Plans serveur → `window.chargerPlanServeur(plan.path, plan)` direct
  - Plans locaux → `window.chargerPlanDuRegistre(plan.id)` (logique blob → fsHandle → re-sélection conservée)
  - Si erreur → fallback `window.afficherLoader()` pour proposer la modale "Plan introuvable"
  - **Nouvelle exposition** : `window.chargerPlanDuRegistre = chargerPlanDuRegistre` dans `index.html` pour que le switcher puisse l'appeler depuis `interface.js`

- **Bouton 🗂️ "Changer de plan" dans ⬇️ Import conservé** (choix 6:b)
  - Redondance utile pour les utilisateurs qui ne découvrent pas le titre cliquable
  - Toujours accessible comme alternative

- **Helpers ajoutés** dans `interface.js` :
  - `_fmtDateRel(iso)` — date relative ("à l'instant", "il y a 5 min", "hier", "il y a 3 jours", "04/05")
  - `escapeHtmlSwitcher(s)` — échappement HTML pour les noms de plan dans le panneau

- **Styles CSS ajoutés** (`style.css`) — section "PLAN SWITCHER" :
  - `#kta-plan-switcher` (panneau ancré + animation `ktaSwitcherIn`)
  - `.kta-switcher-head` / `.kta-switcher-list` / `.kta-switcher-row` / `.kta-switcher-icon` / `.kta-switcher-info` / `.kta-switcher-name` / `.kta-switcher-ver` / `.kta-switcher-sub`
  - `.kta-switcher-divider` / `.kta-switcher-link` / `.kta-switcher-empty`
  - `.kta-titre-arrow` (flèche avec rotation à 180° en mode ouvert)
  - Responsive mobile (`max-width: 92vw`)

### 🗓️ 06/05/2026 (suite) — Splash + ergonomie loader + gestion erreurs plan

- **Splash screen au démarrage** (`index.html` + `style.css` + `main.js`)
  - Bloc `<div id="splashOverlay">` placé en HTML statique tout en haut du `<body>` → s'affiche **instantanément** dès le parsing du DOM, avant tout JS
  - Logo `icon/mkm-full.png` (rose des vents jaune) + signature `icon/karma.png`
  - Titre `MyKTAMap` + sous-titre `CARTOGRAPHIE TERRAIN`
  - Barre de progression dorée (gradient `#f4c542` + animation shine)
  - Footer : "Par [signature KARMA]" + "Licence libre — usage non commercial"
  - **Animation cumulée** : logo (zoom + rotation rebond), titre, sous-titre, barre, footer (delays 0.3s → 0.85s)
  - **Comportement** :
    - `_splashStart()` enregistre `Date.now()` au démarrage de `initApp`
    - `_splashEnd()` attend que `SPLASH_MIN_DURATION_MS = 4000ms` soit écoulé
    - Si chargement < 4s → splash reste visible 4s minimum
    - Si chargement > 4s → splash s'efface dès la fin du chargement
    - Lancement de l'app **en parallèle** de la fin du splash (pas de blocage)
    - Ajout de la classe `.fading` (opacity 0 transition 0.4s) puis suppression du DOM
  - **Une seule fois par session** : `initApp()` n'étant appelé qu'au chargement initial, le splash ne réapparaît jamais lors d'un changement de plan
  - **Réapparaît à F5 / réouverture** : naturel puisque le HTML est re-parsé
  - **Responsive** : tailles adaptées en mobile portrait (logo 130px) et paysage (logo 90px, layout compact)

- **Refonte ergonomique du loader** (`index.html` + `style.css`)
  - Header avec **bouton 📖 Documentation utilisateur** (top-right, toujours accessible) → appelle `window.afficherReadme()`
  - Bloc **▶️ Reprendre** en haut si `lastPlanId` existe
  - Bloc **📚 Mes plans** unique trié par dernière ouverture descendante (suppression des anciennes sections "Récents/Tous" — demande utilisateur)
  - Bloc **📦 Ajouter un plan** cohérent regroupant : zone drop ZIP + options de persistance + ⚡ mode performance + bouton ▶️ Charger ce plan (pleine largeur)
  - Section collapsable **⚙️ Plus d'options** (fermée par défaut, chevron ▾/▴) regroupant : 🌐 Plan serveur racine, 🏗️ Générer un plan, 📥 Conf exemple, 💥 Tout réinitialiser
  - Le bouton **📖 Documentation utilisateur** ouvre la même modale que depuis l'app (avec sommaire complet)

- **Bouton "💥 Tout réinitialiser" depuis le loader** (`index.html` + `interface.js`)
  - Appelle la fonction existante `viderCacheAppli()` (rétro-compat de nom)
  - Ajout d'une variante CSS `.loader-btn-secondary.loader-btn-danger` (rouge clair `#ffb3b3`)
  - **Reset complet enrichi** dans `viderCacheAppli` :
    1. Désinscription Service Worker
    2. Vidage des caches HTTP/PWA
    3. **`localStorage.clear()`** (registre + préférences + debug logs)
    4. **`sessionStorage.clear()`**
    5. **Suppression de TOUTES les bases IndexedDB** via `indexedDB.databases()` + `deleteDatabase` (avec fallback Safari/iOS qui n'expose pas `databases()`)
    6. `window.location.reload(true)`
  - Reset complet = retour à l'état "premier lancement" (splash réapparaît, registre vide, auto-discovery serveur s'exécute)
  - **Double confirmation** conservée (modale 1 : explication détaillée, modale 2 : confirmation finale avec rappel "Pensez à exporter votre liste avant")
  - Wording du bouton dans Réglages mis à jour : `🗑️ Réinitialiser` → `💥 Tout réinitialiser`

- **Modale "Plan introuvable" pour la persistance cassée** (`index.html` + `main.js`)
  - Scénario : utilisateur vide le cache puis ré-importe sa liste de plans → les blobs ZIP / FS handles n'existent plus
  - Détection à la volée au clic sur un plan local du registre (pas de scan préventif → 0 coût au démarrage)
  - 4 cas distincts avec wording adapté :
    - `server` — Plan serveur 404 (dossier supprimé/renommé) → bouton **🔄 Réessayer**
    - `local-blob` — `storedBlob: true` mais blob absent en IDB
    - `local-fs` — `fsHandleId` mais handle introuvable / fichier ZIP supprimé du disque
    - `local-fs-denied` — Permission FS refusée par le navigateur
  - Modale **pédagogique** avec liste des causes possibles (vidage cache, autre appareil, réinstallation, quota dépassé, etc.)
  - Actions disponibles :
    - **🔄 Réessayer** (cas serveur uniquement)
    - **📁 Re-sélectionner le ZIP** (cas locaux) avec **restauration auto de la persistance** (option 4:a) — si l'entrée originale avait `storedBlob: true`, le nouveau ZIP sera re-sauvé en IDB ; si FS Access dispo, le `fsHandle` est sauvé automatiquement
    - **🗑️ Retirer de la liste** (rouge `#5e2828`) — supprime l'entrée + ses dépendances (handle + blob)
    - **Annuler**
  - `chargerPlanServeur()` lance maintenant une `Error` avec `code = "PLAN_NOT_FOUND"` pour distinguer une 404 d'une vraie erreur runtime
  - Validation conservée (5:b) : si nom du plan dans le ZIP re-sélectionné ≠ nom cliqué → confirmation
  - Réutilise 100% des classes CSS existantes (`kta-readme-modal-overlay`, `kta-readme-modal-boite`, `kta-btn`, etc.) — pas de styles supplémentaires nécessaires

- **`sw.js`** — `icon/mkm-full.png` et `icon/karma.png` ajoutés au cache PWA pour que le splash fonctionne hors-ligne

### 🗓️ 06/05/2026 — Système multi-plans + persistance ZIP locale

- **Nouveau module `planRegistry.js`** — gestionnaire de la liste des plans connus (serveur découverts + locaux ZIP)
  - Stockage dans `localStorage["myktamap_plans"]` (format JSON v1.0 avec `lastPlanId` + `plans[]`)
  - `IndexedDB myktamap_handles` avec 2 stores : `handles` (FileSystemFileHandle) + `blobs` (ZIP entiers, mobile)
  - API publique : `init`, `getAll`, `getRecents(n)`, `getLastOpened`, `findById`, `addOrUpdate`, `markOpened`, `remove`, `removeAll`, `exportToFile`, `importFromFile(file, mode)`, `statsImport`, `genServerId`, `genLocalId`, `saveHandle`/`getHandle`/`removeHandle`, `hasFsAccess`, `ensureHandlePermission`, `saveBlob`/`getBlob`/`removeBlob`, `requestPersistentStorage`, `getStorageEstimate`
  - Fichier d'export `myktamap_plans_AAAAMMJJ.config` (sans `fsHandleId` qui n'est pas portable)

- **Auto-discovery serveur via `data/index.json`** (format A — détaillé)
  - L'app fetch `data/index.json` au démarrage, lit les plans listés et les ajoute au registre comme `discovered: true`
  - Format minimal accepté : `{ "plans": ["test1", "test2"] }`
  - Format détaillé : `{ "plans": [{ "id": "test1", "path": "data/test1", "name": "Plan Test 1", "version": "V1" }] }`
  - Si absent → fallback rétro-compat sur `data/plan-config.json` racine (chargement auto comme avant)

- **`config.js` — `loadAppConfig(planPath)` paramétrée**
  - `loadAppConfig()` → comportement historique (data/plan-config.json racine)
  - `loadAppConfig("data/test1")` → tente `data/test1/plan-config.json`
  - Nouvelle fonction `resolveServerPath(p, baseDir)` qui résout les chemins relatifs au dossier du plan
  - Rétro-compat préservée : `data/...` et `icon/...` non modifiés

- **`main.js` — orchestration multi-plans**
  - `decouvrirPlansServeur()` — auto-discovery au démarrage
  - `chargerPlanServeur(planPath, registryEntry)` — charge un plan serveur depuis le registre + l'enregistre
  - `startImportedPlan(planConfigFile, assetFiles, perfChoisi, meta)` — 4ᵉ paramètre `meta = { zipFile, fsHandle, planId, storeBlob, fromStoredBlob }` qui pilote la persistance et l'enregistrement
  - Enregistrement post-chargement : lecture des champs `plan.name` / `plan.version` / `plan.author` du plan-config et création/maj d'une entrée dans le registre
  - Si `meta.storeBlob === true` : `navigator.storage.persist()` puis `saveBlob(id, file)` en IndexedDB
  - `afficherLoader()` rafraîchit automatiquement la liste via `window.refreshPlansList()`

- **Refonte `index.html` — home unifié**
  - Bouton **▶️ Reprendre [nom]** visible si `lastPlanId` (recharge le dernier plan ouvert)
  - Section unique **📚 Mes plans** triée par dernière ouverture descendante (plans jamais ouverts en bas, alphabétique)
  - Boutons **💾 Exporter ma liste** / **📂 Charger une liste** (modale Replace / Merge / Cancel avec stats)
  - Bouton **🔐 Autoriser l'accès permanent** (FS Access) — visible Chrome/Edge desktop uniquement
  - Checkbox **💾 Mémoriser ce plan dans l'app** — visible mobile/Firefox/Safari (pas FS Access)
  - Bouton **🌐 Charger le plan serveur (racine)** — appelle `chargerPlanServeur("data")` au lieu de `loadAppConfig()` direct
  - Validation : si le ZIP contient un `plan.name` différent du plan cliqué dans la liste → confirm avant chargement
  - Fonction `chargerZipFichier(file, perfChoisi, meta)` exposée globalement pour usage externe (bouton 🗂️ Changer de plan)
  - **Suppression** des sections "Récents" / "Tous" — liste unique demandée par l'utilisateur

- **Hiérarchie de chargement d'un plan local du registre**
  1. Si `plan.storedBlob === true` → lecture IndexedDB → 0 clic (mobile + desktop, fonctionne hors-ligne)
  2. Sinon si `plan.fsHandleId` + Chrome/Edge → `getHandle` + `ensureHandlePermission` → 0 ou 1 clic confirmation
  3. Sinon → `reSelectionnerZipPourPlan(plan)` qui ouvre `showOpenFilePicker` ou `<input type="file">` selon dispo

- **Badges visuels dans la liste des plans locaux**
  - ✅ vert (`storedBlob`) — Plan mémorisé dans l'app
  - 🔐 bleu (`fsHandleId`) — Accès FS permanent autorisé
  - 📁 gris — Re-sélection requise au chargement

- **Gestion du quota IndexedDB** — si `saveBlob` échoue (`QuotaExceededError`)
  - Le plan se charge quand même
  - Message orange dans le statut : "⚠️ Mémorisation impossible : Quota dépassé"
  - Le plan apparaît avec le badge 📁 (re-sélection au prochain chargement)

- **Nettoyage à la suppression** — `PlanRegistry.remove(id)` supprime aussi le `FileSystemFileHandle` ET le blob IndexedDB associés (libère l'espace)

- **`interface.js` — AIDE enrichie**
  - Section ⬇️ Charger / Import refondue avec encadré multi-plans
  - Documentation des 3 modes de persistance (✅ Mémorisé / 🔐 Permanent / 📁 Re-sélection)
  - Conseil PWA pour iOS (persistance jusqu'à 1 Go)
  - Documentation du format `data/index.json`

- **`style.css` — nouveaux styles**
  - `.loader-btn-resume` — bouton Reprendre (gradient bleu nuit)
  - `.loader-section-head` / `.loader-section-actions` / `.loader-btn-mini` — entête de section avec actions
  - `.loader-plans-list` / `.plan-row` / `.plan-row-icon` / `.plan-row-info` / `.plan-row-name` / `.plan-row-version` / `.plan-row-sub` / `.plan-row-date` / `.plan-row-actions` / `.plan-row-btn` / `.plan-row-load` / `.plan-row-remove`
  - `.plan-row-badge-stored` (vert) / `.plan-row-badge-fs` (bleu) / `.plan-row-badge-pick` (gris)
  - `.fs-access-hint` / `.loader-btn-fs` / `.fs-access-info` / `.loader-store-blob` (checkbox + label)

- **`sw.js`** — `js/planRegistry.js` ajouté à `assetsToCache`

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
index.html                  ← Page unique (loader avec home multi-plans + carte)
sw.js                       ← Service Worker (mode hors-ligne)
manifest.json              ← PWA google chrome

data/
  index.json                ← (Optionnel) Liste des plans serveur disponibles
  plan-config.json          ← (Optionnel) Plan racine (rétro-compat)
  test1/
    plan-config.json        ← Plan dans un sous-dossier
    ...
  test2/
    plan-config.json
    ...

js/
        │
        ├── debug.js           ← Capture logs + modale débogage
        ├── config.js          ← Configuration unifiée + loadAppConfig(planPath) paramétrée
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
        ├── planRegistry.js    ← Registre multi-plans (localStorage + IndexedDB blobs/handles)
        ├── interface.js       ← Interface Leaflet + toutes les modales
        └── main.js            ← Point d'entrée unique avec auto-détection + auto-discovery serveur

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

`main.js` orchestre le démarrage avec auto-discovery serveur + rétro-compat :

```
initApp()
  ├─ PlanRegistry.init()              ← charge la liste depuis localStorage
  ├─ decouvrirPlansServeur()          ← fetch('data/index.json') si présent
  │     → ajoute les plans découverts au registre (discovered: true)
  │
  ├─ Si registre vide ET data/plan-config.json racine existe :
  │     → loadAppConfig()             ← rétro-compat ancien comportement
  │     → registre += server_root     ← enregistre comme plan racine
  │     → lancerApplication()
  │
  └─ Sinon :
        → afficherLoader()             ← home avec liste de plans + import
        → refreshPlansList()           ← rafraîchit l'UI

# Chargement d'un plan serveur (depuis le registre)
chargerPlanServeur(planPath, registryEntry)
  ├─ libère tuiles + détruit map existante
  ├─ resetRuntimeAssets()
  ├─ loadAppConfig(planPath)          ← résout chemins relatifs au baseDir
  ├─ enregistre dans registre + markOpened
  └─ lancerApplication()

# Chargement d'un ZIP (depuis import ou registre local)
startImportedPlan(planConfigFile, assetFiles, presetChoisi, meta)
  ├─ resetRuntimeAssets()
  ├─ registerAsset() × N
  ├─ cloneAndResolvePlanConfig()
  ├─ buildAppConfigFromPlan() + perfPreset du loader
  ├─ Enregistrement registre :
  │     ├─ Si meta.fsHandle → saveHandle(id, handle)
  │     ├─ Si meta.storeBlob → requestPersistentStorage() + saveBlob(id, file)
  │     └─ markOpened(id)
  └─ lancerApplication()
```

Le loader HTML est intégré dans `index.html` avec `display:none` — il s'affiche au démarrage si aucun plan racine n'est trouvé, ou à la demande via 🗂️ "Changer de plan".

---

## 🎬 Splash screen (animation de bienvenue)

Le splash s'affiche **uniquement au chargement initial de la page** (F5, ouverture d'onglet, démarrage PWA). Il ne réapparaît jamais lors d'un changement de plan via 🗂️ "Mes plans".

### Architecture

- **HTML statique** dans `<body>` (visible avant tout chargement JS)
- **CSS d'animation** dans `style.css` (entrée en cascade : logo → titre → sous-titre → barre → footer)
- **Logique de durée** dans `main.js` (4s minimum + parallèle au chargement)

### Cycle de vie

```
HTML parsé → splashOverlay visible (animations CSS démarrent)
   ↓
initApp() → _splashStart() enregistre Date.now()
   ↓
   PlanRegistry.init() + decouvrirPlansServeur() en parallèle
   ↓
   afficherLoader() OU lancerApplication() (en parallèle de _splashEnd)
   ↓
_splashEnd() :
   ├─ Attendre que (4000ms - elapsed) soit écoulé
   ├─ Ajouter classe .fading (opacity 0 transition 0.4s)
   └─ Retirer du DOM après 500ms
```

### Constantes et variables

| Élément | Description |
|---|---|
| `SPLASH_MIN_DURATION_MS` | Durée minimum d'affichage (`main.js`, défaut 4000) |
| `--splash-duration` | Variable CSS injectée dynamiquement pour synchroniser la barre |
| `_splashShownAt` | Timestamp d'affichage pour calculer le temps restant |

### Assets requis (cachés par le SW)

- `icon/mkm-full.png` — logo principal (rose des vents)
- `icon/karma.png` — signature

---

## 💥 Reset complet de l'application

Fonction `viderCacheAppli()` (nom historique conservé) — accessible depuis :
- **⚙️ Réglages** dans l'app (bouton rouge `💥 Tout réinitialiser`)
- **⚙️ Plus d'options** dans le loader (bouton `loader-btn-secondary loader-btn-danger`)

### Étapes du reset

```
1. navigator.serviceWorker.getRegistrations() + unregister  ← désinscrit le SW
2. caches.keys() + caches.delete                             ← vide les caches HTTP/PWA
3. localStorage.clear()                                      ← registre + préférences + debug
4. sessionStorage.clear()
5. indexedDB.databases() → deleteDatabase pour chaque        ← blobs ZIP + FS handles
   (fallback Safari : deleteDatabase("myktamap_handles"))
6. window.location.reload(true)                              ← redémarrage complet
```

### Sécurité — double confirmation

| Étape | Modale |
|---|---|
| 1 | "⚠️ Tout réinitialiser ?" — liste les éléments effacés + boutons Annuler / Continuer |
| 2 | "🚨 Confirmation finale" — rappel "Pensez à exporter votre liste avant" + boutons Annuler / 💥 Tout réinitialiser |
| 3 | "⏳ Réinitialisation en cours…" (spinner pendant le nettoyage) |

Après reload, l'app revient strictement à l'état "premier lancement" : splash s'affiche, registre vide, auto-discovery serveur s'exécute, etc.

---

## ⚠️ Gestion des erreurs "Plan introuvable"

Détection à la volée au clic sur un plan du registre (pas de scan préventif).

### Cas couverts

| Cas | Détection | Reason |
|---|---|---|
| Plan serveur 404 | `chargerPlanServeur()` throw avec `e.code === "PLAN_NOT_FOUND"` | `server` |
| Blob mémorisé absent | `getBlob(id)` retourne `null` (vidage cache, autre appareil) | `local-blob` |
| FS handle perdu | `getHandle(id)` null OU `handle.getFile()` throw (ZIP supprimé du disque) | `local-fs` |
| FS permission refusée | `ensureHandlePermission(handle)` retourne `false` | `local-fs-denied` |

### Modale d'erreur (`afficherModalePlanIntrouvable`)

Modale **pédagogique** dans `index.html` listant les causes possibles selon le `reason`, avec actions :

- **🔄 Réessayer** — uniquement pour `server` (réessaye le chargement)
- **📁 Re-sélectionner le ZIP** — pour les cas locaux, ouvre `showOpenFilePicker` avec **restauration auto de la persistance** :
  - Si `plan.storedBlob === true` → réinjecte `meta.storeBlob = true` → re-sauvegarde IDB
  - Si `showOpenFilePicker` utilisé → handle automatiquement persisté
- **🗑️ Retirer de la liste** — supprime l'entrée + ses blobs/handles via `PlanRegistry.remove()`
- **Annuler**

Si le ZIP re-sélectionné a un `plan.name` différent du nom cliqué → confirmation conservée (5:b).

---

## 🎨 Système d'icônes — cascade et fallback

### Architecture en 4 niveaux

L'app dispose d'un système de résolution d'icônes en cascade qui permet d'**ajouter de nouveaux types** sans modifier les `plan-config.json` existants.

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. PLAN_CONFIG.icons[tag]                                       │
│    Personnalisation par plan (chemin custom dans plan-config)   │
├─────────────────────────────────────────────────────────────────┤
│ 2. _iconMap[tag] (rempli par creerIcones() via TAGS_BUILTIN)    │
│    Fallback built-in dans map.js → pointe vers icon/<tag>.png   │
├─────────────────────────────────────────────────────────────────┤
│ 3. PLAN_CONFIG.icons.default                                    │
│    Icône par défaut déclarée dans le plan                       │
├─────────────────────────────────────────────────────────────────┤
│ 4. _iconMap.default / iconeDefault                              │
│    Filet de sécurité ultime (pin Leaflet natif)                 │
└─────────────────────────────────────────────────────────────────┘
```

### `TAGS_BUILTIN` (`map.js > creerIcones`)

Liste des tags reconnus nativement par l'app et leurs PNG par défaut :

```js
const TAGS_BUILTIN = {
  salle:    "icon/house.png",
  pa:       "icon/pa.png",  pc: "icon/pc.png",  pb: "icon/pb.png",
  pe:       "icon/pe.png",  ps: "icon/ps.png",
  // === 6 nouveaux tags d'accès ===
  peo:      "icon/peo.png", pef: "icon/pef.png",   // puits à échelon
  eso:      "icon/eso.png", esf: "icon/esf.png",   // escalier service
  cao:      "icon/cao.png", caf: "icon/caf.png",   // cavage
  // === ===
  vehicule: "icon/vehicule.png", elec: "icon/elec.png", epure: "icon/epure.png",
  info:     "icon/info.png", chatiere: "icon/chatiere.png",
  passage:  "icon/passage.png", danger: "icon/danger.png"
};
```

À chaque chargement de plan, `_iconMap` est complété : si un tag built-in n'est pas dans `iconConfig`, l'app crée quand même son entrée pointant vers `icon/<tag>.png`.

### Fonction centralisée `getIconUrlForPoint(point)` (`utils.js`)

Implémente la cascade complète et expose une URL utilisable directement (canvas, recherche, légende, etc.).

```js
function getIconUrlForPoint(point) {
  const planIcons = (window.PLAN_CONFIG && window.PLAN_CONFIG.icons) || {};
  const map       = window._iconMap || {};

  if (point && Array.isArray(point.tags)) {
    for (const tag of point.tags) {
      if (planIcons[tag]) return planIcons[tag];           // niveau 1
      const u = urlFromMapEntry(map[tag]);
      if (u) return u;                                     // niveau 2
    }
  }
  if (planIcons.default) return planIcons.default;         // niveau 3
  return urlFromMapEntry(map.default);                     // niveau 4
}
```

**Modules qui l'utilisent** : `searchPoints.js`, `utils.js > telechargerPlan`, `exporter.js`, `sessionExporter.js`.

### Ajouter un nouveau tag — checklist développeur

Pour ajouter un nouveau type d'icône (ex: `fontaine`) sans casser la rétro-compat :

1. **PNG 50×50** transparent dans `icon/fontaine.png`
2. **`map.js`** — ajouter `fontaine: "icon/fontaine.png"` dans `TAGS_BUILTIN`
3. **`editor.js`** — ajouter `fontaine: "Fontaine"` dans `EDITOR_TAG_LABELS`
4. **`interface.js`** — ajouter `fontaine: "Fontaine"` dans `LEGENDE_LABELS` + dans le bon groupe du tableau `GROUPES`
5. **`exporter.js`** — ajouter `fontaine: "Fontaine"` dans le `LBL` local + dans le bon groupe de `GROUPES_ICONES`
6. **`createConf.js`** — ajouter `fontaine: "icon/fontaine.png"` dans `PLANNER_DEFAULT_ICONS`
7. **`sw.js`** — ajouter `"./icon/fontaine.png"` dans `urlsToCache`

→ Le tag est utilisable immédiatement, **même sur les plans existants** (sans modifier leur `plan-config.json`).

### Légende exportée — répartition en 5 groupes (`exporter.js`)

La légende du PNG exporté est désormais découpée en sections cohérentes avec la légende d'aide :

| Groupe | Tags |
|---|---|
| 🕳️ Puits | pa, pb, pc, pe, ps |
| 🪜 Accès | peo, pef, eso, esf, cao, caf |
| ⚠️ Signalétique | salle, chatiere, passage, danger, info, elec, epure, vehicule |
| 🛣️ Tracés | principal, secondaire, chemin |
| ⬛ Zones | eau, remblais, effondrement |
| 🏷️ Autres | tags custom créés via "➕ Créer un nouveau tag" (auto) |

**Algorithme de répartition équilibré** : les 5 groupes sont parcourus dans l'ordre et chacun est ajouté à la **colonne la moins remplie** (en lignes cumulées). Garantit un visuel équilibré même avec un nombre variable d'icônes.

```js
entrees.forEach(function(sec) {
  const h = _hauteurEstimee(sec); // 1 + nb lignes
  if (hG <= hD) { colGauche.push(sec); hG += h; }
  else          { colDroite.push(sec); hD += h; }
});
```

---

## 📚 Système multi-plans (`planRegistry.js`)

Module dédié à la gestion de **N plans simultanés** côté utilisateur, avec persistance localStorage + IndexedDB.

### 🗂️ Format de stockage `localStorage["myktamap_plans"]`

```json
{
  "version": "1.0",
  "lastPlanId": "server_data_test1",
  "plans": [
    {
      "id":         "server_data_test1",
      "type":       "server",
      "path":       "data/test1",
      "name":       "Test 1",
      "version":    "V1",
      "author":     "Karma",
      "discovered": true,
      "lastOpened": "2026-05-06T10:23:00Z",
      "addedAt":    "2026-05-06T10:00:00Z"
    },
    {
      "id":               "local_planmarseille_v1",
      "type":             "local",
      "name":             "Plan Marseille",
      "version":          "V1",
      "author":           "...",
      "originalFilename": "plan_marseille.zip",
      "fileSize":         24592384,
      "fsHandleId":       "local_planmarseille_v1",
      "storedBlob":       false,
      "lastOpened":       "2026-05-06T11:10:00Z",
      "addedAt":          "2026-05-04T08:00:00Z"
    }
  ]
}
```

### 📂 Auto-discovery serveur — `data/index.json`

Pour exposer plusieurs plans côté serveur, créer `data/index.json` à la racine :

**Format minimal** (l'app lit le `name` dans chaque `plan-config.json` à la volée) :

```json
{ "plans": ["test1", "test2", "demo"] }
```

Avec ce format, l'app cherche `data/test1/plan-config.json`, `data/test2/plan-config.json`, etc.

**Format détaillé** (évite N fetches au démarrage, recommandé en prod) :

```json
{
  "plans": [
    { "id": "test1", "path": "data/test1", "name": "Test 1", "version": "V1", "author": "..." },
    { "id": "test2", "path": "data/test2", "name": "Test 2", "version": "V2", "author": "..." }
  ]
}
```

### 🔐 Persistance des plans locaux — 3 stratégies

L'UI propose **automatiquement la meilleure méthode disponible** selon la plateforme :

#### 1. File System Access API (Chrome / Edge desktop)

- Bouton **🔐 Autoriser l'accès permanent** sous la zone de drop
- L'utilisateur sélectionne le ZIP via `showOpenFilePicker()`
- Le `FileSystemFileHandle` est sauvé en IndexedDB store `handles`
- Au rechargement futur : `getHandle(id)` + `ensureHandlePermission()` (`queryPermission` puis `requestPermission` si besoin)
- Au pire 1 clic Chrome ("Voir le fichier") après refresh ; 0 clic en session courante
- **Limites** : pas supporté Firefox / Safari / mobile

#### 2. Stockage Blob IndexedDB (mobile + fallback)

- Checkbox **💾 Mémoriser ce plan dans l'app** sous la zone de drop
- Au chargement, le `File` (Blob ZIP entier) est copié dans IndexedDB store `blobs`
- `navigator.storage.persist()` appelé avant pour empêcher la purge auto (iOS Safari, Chrome Android)
- Au rechargement futur : `getBlob(id)` retourne directement le Blob → reconstruction d'un `File` → flux normal
- **Fonctionne hors-ligne** et sur **mobile**
- **Limites de stockage** :
  - iOS Safari (navigateur) : ~50 Mo, peut être purgé après inactivité
  - iOS Safari (PWA installée) : jusqu'à 1 Go, persistant
  - Android Chrome : plusieurs Go (% de l'espace disque)
  - Desktop : très large (Go)

#### 3. Re-sélection (fallback)

- Aucune persistance enregistrée
- Au clic sur un plan local du registre, ouverture du sélecteur de fichier
- Validation : si `cfg.plan.name !== plan.name` du registre → `confirm()` "Charger quand même ?"

### 🏷️ Indicateurs visuels (badges)

Chaque ligne de plan local affiche un badge selon sa stratégie de persistance :

| Badge | Signification | Couleur |
|---|---|---|
| ✅ | `storedBlob: true` — ZIP mémorisé en IDB | Vert |
| 🔐 | `fsHandleId` présent — FS handle en IDB | Bleu |
| 📁 | Aucune persistance — re-sélection requise | Gris |

### 🔄 Hiérarchie de chargement

Quand l'utilisateur clique sur un plan local depuis le home, l'app tente dans cet ordre :

1. **Blob IDB** si `plan.storedBlob === true`
2. **FS Handle** si `plan.fsHandleId` + `hasFsAccess()`
3. **Re-sélection** via `showOpenFilePicker` (avec capture du handle pour persistance future) ou `<input type="file">`

Cet ordre est volontairement structuré pour optimiser l'UX : le blob donne 0 clic et fonctionne hors-ligne, le handle FS demande au pire 1 clic, la re-sélection est le dernier recours.

### 💾 Export / Import de la liste

L'utilisateur peut exporter sa liste pour la migrer entre appareils ou la partager :

- **Export** : génère `myktamap_plans_AAAAMMJJ.config` (JSON, type `myktamap-plans-list`). Les `fsHandleId` sont volontairement retirés (non portables entre machines).
- **Import** : modale 3 modes
  - **Remplacer** : écrase la liste actuelle
  - **Fusionner** : ajoute les plans non déjà présents (par id), conserve les existants
  - **Annuler**

`statsImport(file)` retourne `{ ok, total, newOnes, duplicates }` pour pré-afficher un résumé avant action.

### 🗄️ Schéma IndexedDB

Base `myktamap_handles` (version 2) :

```
└── ObjectStore "handles"   ← FileSystemFileHandle, clé = id du plan
└── ObjectStore "blobs"     ← Blob ZIP, clé = id du plan
```

À la suppression d'un plan via `remove(id)` :

1. Suppression de l'entrée localStorage
2. `removeHandle(id)` sur store `handles`
3. `removeBlob(id)` sur store `blobs` (libère l'espace disque)

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

## ⚡ Mode performance (tiling.js)

Pour les plans JPEG volumineux qui crashent Safari iOS (`drawImage` > 8192px échoue silencieusement → canvas noir), le mode performance découpe l'image en tuiles. Depuis le **08/05/2026**, le mode est **réglable en 5 presets** (DLSS-like) au lieu d'un simple toggle.

### ✅ Les 5 presets

| `APP_CONFIG.perfPreset` | `MAX_WORK_DIM` | `TILE_SIZE` | JPEG Q | Quand on tile |
|---|---|---|---|---|
| `"off"` | — | — | — | **JAMAIS** (rendu direct, équivalent de l'ancien `perfMode = false`) |
| `"auto"` (défaut) | (Équilibré quand tile) | — | — | si `fileSize > 60 Mo` |
| `"quality"` | 12288 | 1024 | 0.95 | si `imageW × imageH > 4096²` |
| `"balanced"` | 8192 | 1024 | 0.88 | si `imageW × imageH > 4096²` |
| `"performance"` | 6144 | 768 | 0.78 | si `imageW × imageH > 4096²` |

> Mode `off` = aucun tiling, choix utilisateur explicite (⚠️ risque de crash Safari iOS pour images > 8192 px).
> Mode `auto` = comportement v1 (tile uniquement sur fichier énorme, params Équilibré).
> Modes explicites = on tile dès que techniquement nécessaire (sécurité GPU mobile), avec les params correspondants.

### 💾 Persistance

Le preset est **par plan** (pas une pref globale) — sauvegardé dans `PlanRegistry[planId].perfPreset` (localStorage). Le segmented control du loader reflète la valeur sauvée pour chaque plan.

Le choix dans le loader est passé explicitement à `startImportedPlan(file, assets, presetChoisi, meta)` (ou `chargerPlanServeur(path, registryEntry, presetChoisi)`).

### 🔁 Flux technique

```
chargerImage(url, bounds, map, fileSize, sourceFile)
  → resoudrePerfPreset(APP_CONFIG.perfPreset, fileSize, W, H)
      → { tile: bool, params: PERF_PRESETS[preset] | null }
  → si tile :
      → chargerImageTuillee(url, bounds, map, sourceFile, params)
          → _imageVersCanvasReduit(..., params.maxWorkDim)
              ↳ Blob URL créée et révoquée à l'intérieur (sécurité Safari)
              ↳ Détection canvas noir + re-essai 100ms
          → _tilerDepuisCanvas(..., params)  ← params.tileSize / params.jpegQuality
              → L.imageOverlay()             ← placement Leaflet
  → sinon :
      → L.imageOverlay(url, bounds)          ← rendu direct (qualité native)
```

### 🍎 Limites Safari iOS

- `drawImage` sur un JPEG > 8192px échoue silencieusement → canvas noir
- Détection automatique : `getImageData(1,1,1,1)` après drawImage
- Fallback : re-essai avec `setTimeout(100ms)`, puis `imageOverlay` classique si toujours noir
- La Blob URL est créée et révoquée **à l'intérieur** de `_imageVersCanvasReduit` pour éviter l'expiration sandbox Safari

### 🐛 Mode debug

Si `APP_CONFIG.debugMode === true`, le segmented control du loader affiche une ligne supplémentaire avec les chiffres techniques courants (ex: `MAX:8192 / TILE:1024 / Q:0.88 / tile si > 60 Mo`). Activable via le bouton `🐛 Logs détaillés` dans "Plus d'options" du loader, OU via Réglages ⚙️ > Logs détaillés.

---

## 💾 Préférences utilisateur

Deux niveaux de persistance :

### 1. Globale — `localStorage.app_user_prefs`

```js
{
  "debugMode": true | false   // unique pref globale (logs détaillés tracker + chiffres perf)
}
```

Géré par `sauvegarderPrefsUtilisateur()` (config.js). Helper unique `setDebugMode(value)` pour modifier (utilisé par le bouton 🐛 du loader ET le toggle Réglages ⚙️).

### 2. Par plan — `PlanRegistry[planId].perfPreset`

```js
{
  "id": "local_planmarseille_v1",
  ...
  "perfPreset": "balanced"   // optionnel — absent = défaut "auto"
}
```

Géré par `PlanRegistry.getPerfPreset(id)` / `setPerfPreset(id, preset)`. Validation contre la liste `["auto", "quality", "balanced", "performance"]`.

### Migration v1 → v2 (au boot, idempotente)

- Ancienne clé `motionDebug` → `debugMode` (préserve la valeur)
- Ancienne clé `perfMode` (globale) → SUPPRIMÉE (perfPreset est par plan désormais)

Les dimensions du plan et paramètres tracking viennent toujours du `plan-config.json` (inchangés).

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
    "peo":      "icon/peo.png",
    "pef":      "icon/pef.png",
    "eso":      "icon/eso.png",
    "esf":      "icon/esf.png",
    "cao":      "icon/cao.png",
    "caf":      "icon/caf.png",
    "fontaine": "icon/iconetrack.png"
  }
}
```

> Le calque `editor` doit toujours être présent dans `dataLayers`.
> Les tags `default` et `track` sont **obligatoires** dans `icons`. Les autres sont libres.
> Depuis 06/05/2026, les tags listés dans `TAGS_BUILTIN` (`map.js`) sont **automatiquement résolus** vers `icon/<tag>.png` même si non déclarés ici — voir section "🎨 Système d'icônes".

---

## 📁 Description des modules

### `config.js` (unifié)

Gère :
- `DEFAULT_CONFIG` / `APP_CONFIG` — configuration active
- `RUNTIME_ASSETS` — registre des fichiers importés (Blob URLs)
- `buildAppConfigFromPlan()` — construit APP_CONFIG depuis un plan + préférences
- `loadAppConfig()` — charge `data/plan-config.json` (mode serveur)
- `sauvegarderPrefsUtilisateur()` — persiste `debugMode` (la seule pref globale ; `perfPreset` est par plan via PlanRegistry)
- `setDebugMode(value)` — helper unique pour modifier le flag debug (utilisé par loader + Réglages ⚙️)
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

### `planRegistry.js` (Gestionnaire multi-plans)

Module autonome chargé avant `interface.js`. Gère la liste des plans connus de l'utilisateur (serveur découverts + ZIP locaux) avec persistance localStorage et IndexedDB.

#### Format de stockage `localStorage["myktamap_plans"]`

```json
{
  "version": "1.0",
  "lastPlanId": "server_data_test1",
  "plans": [
    {
      "id": "server_data_test1",
      "type": "server",
      "path": "data/test1",
      "name": "Plan Test 1",
      "version": "V1",
      "author": "Karma",
      "discovered": true,
      "addedAt": "2026-05-06T...",
      "lastOpened": "2026-05-06T..."
    },
    {
      "id": "local_planmarseille_v1",
      "type": "local",
      "name": "Plan Marseille",
      "version": "V1",
      "originalFilename": "plan_marseille.zip",
      "fileSize": 24592384,
      "fsHandleId": "local_planmarseille_v1",
      "storedBlob": true,
      "addedAt": "2026-05-04T...",
      "lastOpened": "2026-05-06T..."
    }
  ]
}
```

#### Format `data/index.json` (auto-discovery serveur)

```json
{
  "plans": [
    { "id": "test1", "path": "data/test1", "name": "Plan Test 1", "version": "V1" },
    { "id": "test2", "path": "data/test2", "name": "Plan Test 2" }
  ]
}
```

Format minimal aussi accepté : `{ "plans": ["test1", "test2"] }` (le path devient `data/test1`).

#### Format export `myktamap_plans_AAAAMMJJ.config`

```json
{
  "type": "myktamap-plans-list",
  "version": "1.0",
  "exported_at": "2026-05-06T...",
  "plans": [...]   // sans fsHandleId (non portables)
}
```

#### IndexedDB `myktamap_handles` (v2)

| Object Store | Clé | Valeur | Persistance |
|---|---|---|---|
| `handles` | `id` du plan | `FileSystemFileHandle` | Chrome/Edge desktop uniquement |
| `blobs` | `id` du plan | `Blob` du ZIP entier | Toutes plateformes (mobile recommandé) |

Demande `navigator.storage.persist()` avant `saveBlob` pour garantir la persistance (empêche purge auto par iOS Safari et Chrome Android).

#### API publique (`window.PlanRegistry`)

| Méthode | Description |
|---|---|
| `init()` | Charge les données depuis localStorage. Appelée automatiquement par `getAll`/`findById` etc. |
| `getAll()` | Retourne le tableau complet des plans |
| `findById(id)` | Retrouve un plan par son id |
| `getRecents(n)` | n derniers plans ouverts (toujours dispo, pas utilisé par l'UI actuelle) |
| `getLastOpened()` | Le dernier plan ouvert (basé sur `lastPlanId`) — utilisé par le bouton ▶️ Reprendre |
| `addOrUpdate(plan)` | Crée ou met à jour une entrée (clé = `id`). Préserve `addedAt` et `lastOpened` existants si non fournis |
| `markOpened(id)` | Met à jour `lastOpened` et `lastPlanId` |
| `remove(id)` | Supprime l'entrée + son `FileSystemFileHandle` + son `blob` IDB |
| `removeAll()` | Vide tout (mais ne supprime pas les blobs IDB — utiliser avec prudence) |
| `exportToFile()` | Téléchargement `myktamap_plans_AAAAMMJJ.config` |
| `importFromFile(file, mode)` | mode = `"replace"` ou `"merge"` |
| `statsImport(file)` | Avant import : `{ ok, total, newOnes, duplicates, error? }` |
| `genServerId(path)` | `server_<sluggified_path>` (ex: `server_data_test1`) |
| `genLocalId(name, version)` | `local_<slug_name>_<slug_version>` (déterministe, pas de doublon si même ZIP rechargé) |
| `saveHandle(id, handle)` / `getHandle(id)` / `removeHandle(id)` | Gestion des `FileSystemFileHandle` |
| `hasFsAccess()` | Détection support `showOpenFilePicker` |
| `ensureHandlePermission(handle)` | `queryPermission` puis `requestPermission` (mode read) |
| `saveBlob(id, blob)` / `getBlob(id)` / `removeBlob(id)` | Gestion des ZIP en IndexedDB |
| `requestPersistentStorage()` | Demande au navigateur de marquer le stockage comme persistant |
| `getStorageEstimate()` | `navigator.storage.estimate()` — espace total et utilisé |

#### Workflow de chargement (orchestré par `index.html` + `main.js`)

1. **Démarrage** → `PlanRegistry.init()` → `decouvrirPlansServeur()` (lit `data/index.json` si présent, ajoute les plans en mode `discovered`)
2. **Rétro-compat** → si registre vide ET `data/plan-config.json` racine existe → chargement auto direct + ajout `server_root` au registre
3. Sinon → `afficherLoader()` qui appelle `refreshPlansList()` pour rendre la liste

#### Hiérarchie de re-chargement d'un plan local du registre (`chargerPlanDuRegistre(id)`)

```
1. Si plan.storedBlob === true
   → PlanRegistry.getBlob(id) → File(blob, originalFilename) → chargerZipFichier(file, perfChoisi, { planId, fromStoredBlob: true })

2. Sinon si plan.fsHandleId && hasFsAccess()
   → PlanRegistry.getHandle(id) → ensureHandlePermission → handle.getFile() → chargerZipFichier(file, perfChoisi, { fsHandle, planId })

3. Sinon (fallback)
   → reSelectionnerZipPourPlan(plan)
     → showOpenFilePicker (si dispo) ou <input type="file">
     → Validation : si plan.name dans le ZIP ≠ nom cliqué → confirm
     → chargerZipFichier(file, perfChoisi, { fsHandle?, planId })
```

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
