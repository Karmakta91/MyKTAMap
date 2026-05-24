# 📘 MyKTAMap

> Application web de **cartographie souterraine** — visualisation, annotation et déplacement simulé sur plan image (carrières, galeries, sites souterrains / industriels).

**🌍 Environnements :**
- 🟢 Production : [myktamap.fr](https://myktamap.fr)
- 🔧 Développement : [devmap.is-underground.fr](https://devmap.is-underground.fr)

> ⚠️ Les données présentes sur le site de démonstration sont fictives.

**📦 Version courante** : `v1.19.1` (24/05/2026)
**📜 Licence** : `CC BY-NC-SA 4.0` (usage commercial interdit sans accord écrit)

---

## 📑 Sommaire

1. [🚀 Dernière release — v1.19.1](#-derniere-release--v1191)
2. [🧭 Introduction](#-introduction)
3. [🛠️ Fonctionnalités principales](#%EF%B8%8F-fonctionnalites-principales)
4. [🏗️ Architecture applicative](#%EF%B8%8F-architecture-applicative)
5. [📦 Modules JS — référentiel à jour (45 modules)](#-modules-js--referentiel-a-jour-45-modules)
6. [📱 PWA — Application installable](#-pwa--application-installable)
7. [🔄 Service Worker — mode hors-connexion](#-service-worker--mode-hors-connexion)
8. [🚀 Démarrage — auto-détection du mode](#-demarrage--auto-detection-du-mode)
9. [🎬 Splash screen](#-splash-screen)
10. [💥 Reset complet de l'application](#-reset-complet-de-lapplication)
11. [⚠️ Gestion des erreurs « Plan introuvable »](#%EF%B8%8F-gestion-des-erreurs--plan-introuvable-)
12. [🎨 Système d'icônes — cascade et fallback](#-systeme-dicones--cascade-et-fallback)
13. [📚 Multi-plans (`planRegistry.js`)](#-multi-plans-planregistryjs)
14. [⚡ Mode performance (tiling V1 + V2)](#-mode-performance-tiling-v1--v2)
15. [💾 Préférences utilisateur](#-preferences-utilisateur)
16. [⚙️ Configuration — `plan-config.json`](#%EF%B8%8F-configuration--plan-configjson)
17. [📦 Structure des données JSON](#-structure-des-donnees-json)
18. [💾 Export de session — `sessionExporter.js`](#-export-de-session--sessionexporterjs)
19. [📍 Gestion des coordonnées](#-gestion-des-coordonnees)
20. [🐛 Débogage](#-debogage)
21. [📋 Journal des modifications](#-journal-des-modifications)
22. [📄 Licence](#-licence)

---

## 🚀 Dernière release — v1.19.1

📅 **24 mai 2026** — Release **PATCH** consolidée (Z+1 sur v1.16.1 — saut PATCH car le pack accumulé est **surtout** des fixes + polish, malgré la présence de quelques features moyennes). Contenu :

- 🚀 **Générateur accessible** : nouveau mode Simple (image + nom + version + V2/M-LVL → ZIP en 30 sec) + mode Avancé inchangé + nouvelle source de vérité plan-level `plan.customLegend`
- 🌍 **Roundtrip légende KMZ + GPX** : la légende personnalisée du plan voyage avec les exports, restaurée auto au ré-import. Compat externe préservée (apps tierces ignorent silencieusement).
- 📊 **État mémoire (Inspecteur)** : nouvel outil de transparence accessible depuis ⚙️ Configuration loader. Topo lisible localStorage / IndexedDB / Cache PWA / Storage estimate / Runtime. Bouton 📋 Copier le rapport.
- 🎯 **Polish UX + DX** : Aide intégrée enrichie (2 sections), Update Checker en vrai semver, Toast non-bloquant au changement de SW.
- 🩹 **Fixes UI** : auto-save par plan, ⭐ Favoris dans l'Aide, tableau MemInspector mobile, boussole derrière le footer, modales logs illisibles en thème clair.

Détails complets dans le [Journal des modifications](#-journal-des-modifications) (chaque sous-feature documentée séparément, l'historique Git préserve les itérations dev).

---

## 🚀 Release précédente — v1.16.1

📅 **24 mai 2026** — Hotfix PATCH (Z+1 sur v1.16.0) : auto-save par plan (slot localStorage indexé par planId + migration legacy transparente). Quitter un plan → revenir : la session reprend exactement où elle s'était arrêtée pour CE plan, sans charger de snapshot.

---

## 🚀 Release précédente — v1.16.0

📅 **24 mai 2026** — Cycle « **UX & filet de sécurité** » : **4 features majeures** qui se complètent + plusieurs polishs UI conséquents.

**Highlights :**

- 📝 **Notes sur zones / tracés / structures** (step 1) — Bouton « Note » dans la popup de chaque élément, textarea multiligne en mode session, lecture seule en data layer KMZ. Helper `window.attacherNotePopup` (`utils.js`) + ghost polyline transparente épaisse pour ergonomie clic sur les tracés. Roundtrip complet : session JSON, KMZ (`<description>` CDATA), GPX (`<cmt>` / `<desc>`).
- 🏷️ **Légende personnalisable** (step 2) — Nouveau module `js/legendCustomization.js` (~600 lignes IIFE) avec **cascade 3 niveaux** : session > plan (`PLAN_CONFIG.customLegend`) > default. **4 catégories** : icones / traces / zones / structures. Renommage, masquage, et **entrées custom DESSINABLES** (geometry polyline ou polygon → boutons sidebar dynamiques + render via style resolvers `_resolveRoadStyle / _resolveZoneStyle / _resolveStructureStyle`). UI éditeur dans la modale Export PNG **+** bouton ✏️ Modifier dans la fenêtre 🗺️ Légende mode carte.
- 🎛️ **Flyout sidebar** (step 2-flyout) — Pivot UI pour les groupes traces / zones / structures : remplace la cascade verticale (qui débordait l'écran avec beaucoup de customs) par un **panel latéral** adjacent au bouton principal. Position calculée dynamiquement (`getBoundingClientRect` + listeners resize/scroll), header sticky pour longues listes, max-height/max-width en pixels réels (robuste landscape mobile iOS).
- ⭐ **Favoris points** (step 3) — Nouveau module `js/favoris.js` (~180 lignes). Stockage localStorage **indexé par planId**, snapshots complets des points (résilience). Bouton ⭐ dans la popup des POI. Groupe sidebar **⭐ Favoris position topleft juste après M-LVL**, liste flyout dynamique → clic centre + flash circleMarker orange 3s + ouvre la popup du marker original.
- 📦 **Backup multi-rotations sessions** (step 4) — Nouveau module `js/sessionBackups.js` (~280 lignes). **10 snapshots FIFO en IndexedDB** (`myktamap_backups` / store `backups`). **4 triggers** : auto 5 min, au boot pre-restore, avant action destructive (`SessionPersist.clear`), manuel via 📆 Snapshot maintenant. UI section **📦 Backups récents** dans la modale 📊 Détails de session (filtrée sur plan courant, badge avec `(+N autres plans)`). Restore par écriture localStorage + reload.
- 🧭 **Fix thème clair compass widget** — Le widget réduit était hardcodé dark, nouveaux overrides `body.kta-theme-light .kta-compass-widget*` (fond beige clair, texte ambre saturé, bouton close lisible).
- 💬 **Garde-fous « Changer de plan » reformulés** — Les modales (clic titre/rose des vents → home, et clic plan spécifique dans le switcher) ne disent plus « Les données non exportées seront perdues » (trompeur avec autosave + snapshots) mais affichent un message rassurant : « ✅ Ta session est sauvegardée et sera restaurée à ton retour. 📦 Les 10 derniers snapshots restent dispos dans 📊 Détails de session › Backups récents. »

🛡️ **Confidentialité** — Aucun nouveau call réseau. Backups en IndexedDB local, favoris en localStorage, LegendCustomization persiste dans le payload SessionPersist existant. **NETWORK_AUDIT inchangé** sur le fond.

📂 **Détail complet** : voir [Journal des modifications](#-journal-des-modifications) en bas de doc.

---

## 🧭 Introduction

MyKTAMap est une application web permettant de **visualiser, annoter et exploiter un plan image** (carrière souterraine, bâtiment, site industriel…) à partir d'une image haute résolution.

L'outil repose sur **[Leaflet](https://leafletjs.com/)** en projection simple (`L.CRS.Simple`), ce qui permet de travailler sur une carte personnalisée **sans coordonnées GPS** — tout en supportant un calibrage GPS 2 points optionnel pour exporter/importer en KMZ géolocalisé et GPX (Google Earth, OsmAnd, TopoDroid, Strava…).

Conçue pour le terrain : **100 % hors-ligne** par défaut (Service Worker + IndexedDB), **zéro télémétrie**, **données locales** uniquement, **code ouvert** sous CC BY-NC-SA.

---

## 🛠️ Fonctionnalités principales

### 🗺️ Cartographie et annotations

| Fonctionnalité | État | Module(s) clé(s) |
|---|---|---|
| Affichage plan image haute résolution (mode Tiling 5 presets) | ✅ | `map.js`, `tiling.js`, `config.js` |
| **V2 tuiles** Google Maps-like (4 niveaux de zoom) | ✅ | `createConf.js > _genererTuilesV2`, `tiling.js` |
| **Multi-plans** côté utilisateur (registre localStorage + IDB) | ✅ | `planRegistry.js`, `main.js` |
| **Multi-niveau (M-LVL)** : étages + jonctions interniveau | ✅ | `interface.js`, `config.js` |
| Calques image (légende, surimpressions) | ✅ | `map.js`, `config.js` |
| Calques de données (`devmap-data` JSON) | ✅ | `utils.js > ajouterPointsDepuisJSON` |
| Ajout de points d'intérêt (modale + tags + photos POI IDB) | ✅ | `editor.js`, `photos.js`, `photoViewer.js` |
| Tracés de routes (Principal / Secondaire / Chemin / Jonction / Itinéraire) | ✅ | `road.js`, `pathfinder.js` |
| Zones polygonales (eau / remblais / effondrement / inaccessible) | ✅ | `zones.js` |
| Structures (5 sous-types : pilier 1ère / 2e masse / mur / fronts) | ✅ | `structures.js` |
| Mesure distance + ⬛ mesure surface (polygone shoelace) | ✅ | `measure.js`, `utils.js > polygonAreaM2` |
| Suppression granulaire (point / tracé / tout) | ✅ | `editor.js`, `road.js`, `zones.js`, `structures.js` |
| **Undo / Redo global** (Ctrl+Z / Ctrl+Y, 50 entrées FIFO) | ✅ | `historyManager.js` |
| Heatmap densité d'activité (désactivé v1.12, code en standby) | 🟡 | `heatmap.js` |

### 🧭 Tracker et géolocalisation

| Fonctionnalité | État | Module(s) clé(s) |
|---|---|---|
| Tracker PDR (capteurs mobile, expérimental) | ⚠️ | `tracking.js`, `compass.js` |
| Recalage tracker au clic carte | ✅ | `interface.js > recalerTrackerSurPoint` |
| Itinéraire le plus court (Dijkstra) sur le réseau de tracés | ✅ | `pathfinder.js` |
| **Mode urgence « Je suis perdu »** + isochrone Dijkstra | ✅ | `lostMode.js`, `emergencyMode.js` |
| **Replay session tracker** (timeline + slider + export CSV) | ✅ | `trackerReplay.js` |

### 📦 Import / Export

| Fonctionnalité | État | Module(s) clé(s) |
|---|---|---|
| Import / Export session (`devmap-session` JSON, optionnel ZIP photos) | ✅ | `sessionExporter.js`, `sessionPersist.js` |
| Conversion session → calque de données | ✅ | `sessionExporter.js` (onglet Conversion) |
| **Générateur de plan ZIP** (Nouveau / Modifier) + canvas vierge | ✅ | `createConf.js` |
| Import ZIP MyKTAMap (drop zone home + générateur) | ✅ | `main.js > startImportedPlan` |
| **🌍 Export KMZ géolocalisé** (Google Earth, OsmAnd, Avenza, Locus) | ✅ | `kmzExport.js`, `sessionExporter.js` (onglet 📡 Export externe) |
| **🌍 Import KMZ → ZIP MyKTAMap** (round-trip MyKTAMap, V2 + M-LVL optionnels) | ✅ | `kmzImport.js`, `createConf.js > _afficherImporterKmz` |
| **📤 Export GPX 1.1** (TopoDroid, OsmAnd, Strava, Garmin, GPSies) | ✅ | `gpxIO.js`, `sessionExporter.js` |
| **📤 Import GPX** ajout aux annotations session (v1.14.0) | ✅ | `gpxIO.js > importer` |
| **📤 Import GPX → ZIP MyKTAMap** (canvas vierge auto-calibré, v1.15.0) | ✅ | `gpxImport.js`, `createConf.js > _afficherImporterGpx` |
| **📝 Notes** (description) sur zones / tracés / structures (v1.16.0) | ✅ | `utils.js > attacherNotePopup`, `road.js`, `zones.js`, `structures.js` |
| **🏷️ Légende personnalisable** (rename / hide / customs DESSINABLES, v1.16.0) | ✅ | `legendCustomization.js`, `exporter.js`, `interface.js > afficherLegende` |
| **⭐ Favoris points** par plan + groupe sidebar (v1.16.0) | ✅ | `favoris.js`, `utils.js > buildPointPopupHtml`, `interface.js` |
| **📦 Backup multi-rotations** sessions (10 FIFO IDB, v1.16.0) | ✅ | `sessionBackups.js`, `refonteInterface.js > _afficherModaleSessionDetail` |
| 🖼️ Export PNG / JPG (modes Rapide / Avancé + légende dessinée) | ✅ | `exporter.js`, `utils.js > telechargerPlan` |
| 📤 **Export PDF imprimable** (A0 → A4, portrait/paysage) | ✅ | `pdfExport.js` |
| 📊 Éditeur de fichier JSON sous forme de tableau | ✅ | `tableEditor.js` |
| 🔎 Recherche unifiée (Ctrl/Cmd+K, tous calques + session) | ✅ | `searchPoints.js` |

### 🔒 Sécurité et confidentialité

| Fonctionnalité | État | Module(s) clé(s) |
|---|---|---|
| 🗝️ **UnlockGate** : barrière communautaire (mdp partagé hardcodé) | ✅ | `unlockGate.js` |
| 🔐 **PinLock** : code d'accès local personnel optionnel (PIN 4-6 + biométrie Face ID / Touch ID) | ✅ | `pinLock.js` |
| 🔒 **Verrouiller** depuis la home (cleanup modules + reload → gate PIN) | ✅ | `index.html > #loaderLockBtn` |
| 🔒 Audit réseau exposé in-app (`📊 Logs`) | ✅ | `networkAudit.js`, `docs/NETWORK_AUDIT.md` |
| 🚨 **AlertChecker** : alertes publiques (incendie, fermeture, info) | ✅ | `alertChecker.js`, `alert.json` |

### 🎨 UI / UX

| Fonctionnalité | État | Module(s) clé(s) |
|---|---|---|
| ☀️ **Thème CLAIR / SOMBRE global** (toggle home + reload propre v1.14.2) | ✅ | `themeManager.js` |
| 🎯 Calibrage de l'échelle (modale dédiée) | ✅ | `interface.js > ouvrirCalibrageEchelle` |
| 🌐 **Géoréférencement GPS** depuis ⚙️ Configuration (auto-rempli dans Export externe) | ✅ | `interface.js > _renderCfgGeorefSection` |
| 📱 **PWA installable** + mode standalone iOS / Android | ✅ | `manifest.json`, `index.html` |
| 🔄 Mode hors-connexion (Service Worker précache) | ✅ | `sw.js` |
| 🐛 Panneau de logs de débogage persisté localStorage | ✅ | `debug.js` |
| 🪫 Indicateur batterie + alertes graduelles (20/10/5 %, Chromium only) | ✅ | `batteryGuard.js` |
| ⚙️ **OOMGuard** : détection kill mémoire mobile + toast warning | ✅ | `oomGuard.js` |
| 🧰 **PerfUltra** : 7 toggles de tuning perf (slowSave, noTooltips, etc.) | ✅ | `perfUltra.js` |
| 🔁 **UpdateChecker** : badge version clignotant + modale dédiée | ✅ | `updateChecker.js` |
| 🎬 **Refonte interface v1** : header bar + sidebars unifiées + status bar | ✅ | `refonteInterface.js`, `interface.js` |

---

## 🏗️ Architecture applicative

```
index.html                      ← Page unique : home loader + carte Leaflet + modales
sw.js                           ← Service Worker (mode hors-ligne, précache exhaustif)
manifest.json                   ← PWA (icônes, theme color, standalone)
version.json                    ← Source de vérité version (lue par UpdateChecker)
alert.json                      ← (Optionnel) Diffusion d'alertes publiques
css/style.css                   ← Tous les styles (~14k lignes : dark base + thème clair + modales)

data/                           ← Plans serveur (auto-discovery via index.json)
  index.json                    ← (Optionnel) Liste des plans
  plan-config.json              ← (Optionnel) Plan racine (rétro-compat)
  test1/
    plan-config.json
    *.png, *.json
  test2/
    ...

icon/                           ← Icônes des tags (PNG 50×50, transparentes)
  iconetrack.png  mkm.png  mkm-full.png  karma.png
  pa.png pc.png pb.png pe.png ps.png peo.png pef.png eso.png esf.png cao.png caf.png
  salle.png vehicule.png elec.png epure.png info.png chatiere.png passage.png danger.png plaque.png

lib/
  leaflet/                      ← Leaflet 1.9.x (local)
  jszip.min.js                  ← JSZip 3.10.1 (local — ZIP)
  jspdf.umd.min.js              ← jsPDF 2.5.x (local — PDF imprimable)

js/                             ← 45 modules — voir section suivante
```

---

## 📦 Modules JS — référentiel à jour (45 modules)

> Tous les modules sont en **IIFE** (`(function() { "use strict"; ... })()`) avec API publique exposée via `window.<NomDuModule>`. Pas de bundler, pas de transpiler — JS vanilla servi tel quel.

### 🎯 Bootstrap & noyau

| Module | Rôle |
|---|---|
| **`main.js`** | Point d'entrée unique. `initApp()` → auto-discovery serveur, gestion multi-plans, `startImportedPlan()`, cleanup `_libererRessourcesPlanPrecedent`. Propage `plan.georef` vers `KmzExport.setCalibration` au load (v1.14.20). |
| **`config.js`** | `DEFAULT_CONFIG` / `APP_CONFIG` / `RUNTIME_ASSETS`. `buildAppConfigFromPlan()`, `loadAppConfig()`, `cloneAndResolvePlanConfig()`, `setDebugMode()`. |
| **`map.js`** | Initialisation Leaflet (`L.CRS.Simple`, `preferCanvas: true`). `cleanupExistingMap()`, `creerIcones(iconConfig)` → `_iconMap` dynamique, `initCollisionMap()`. |
| **`debug.js`** | Capture `console.log/warn/error` + `window.onerror` + `unhandledrejection` → `localStorage("kta_debug_logs")` survit aux crashs Safari iOS. Modale `afficherLogsDebug()`. |
| **`utils.js`** | `convertCoord(x, y)` (plan → Leaflet), `choisirIcone(p)`, `getIconUrlForPoint(p)` (cascade 4 niveaux), `ajouterPointsDepuisJSON()`, `telechargerPlan()` (export PNG rapide), `polygonArea()` / `polygonAreaM2()` / `formatSurface()`. |
| **`copyright.js`** | Footer copyright + `window.__MKM__.build` (version courante, source de vérité runtime). |

### 🖱️ Interface utilisateur

| Module | Rôle |
|---|---|
| **`interface.js`** | **Le module géant** (~380 ko). Crée les groupes accordéon de la sidebar gauche (`_creerGroupeAccordeon`), toutes les modales (Aide / Config / Légende / Recherche / Itinéraire / Mesure / Réglages / etc.), helpers de suppression, modale d'import session, calibrage échelle, géoréférencement GPS depuis Config. |
| **`refonteInterface.js`** | Header bar avec compteurs + sidebars unifiées gauche/droite + status bar (mode imposé depuis v1.14.19). API `window.RefonteInterface = { isActive, setActive, updateCompteurs, refreshStatusBar }`. |
| **`themeManager.js`** | Toggle thème clair / sombre **global**. API `window.ThemeManager = { init, getCurrent, setTheme, setThemeAndReload, toggleTheme, onChange, isLight }`. Applique `body.kta-theme-light` + `html.kta-theme-light` (critique pour les modales appendées à documentElement). |
| **`updateChecker.js`** | Fetch `version.json` au boot + modale `afficherModaleUpdateDispo`. Badge version dans le footer du loader, clignote en bleu si une nouvelle version est dispo. |
| **`alertChecker.js`** | Fetch `alert.json` (alertes publiques type incendie / fermeture / info). Modale dédiée avec acquittement par id, sélecteur si N>1 alertes actives. |

### 🎨 Annotations dessinables

| Module | Rôle |
|---|---|
| **`editor.js`** | Ajout de points (modale plein écran + tags custom). API `getEditorPoints`, `setEditorPoints`, `removeLastEditorPoint`, `renderEditorPoints`. |
| **`road.js`** | Tracés polylines (5 types : principal / secondaire / chemin / jonction / itinerary). API `getRoads`, `setRoads`, `resetRoads`, `removeLastRoad/Point`, `toggleRoadMode(type)`. Cercles aux intersections + halo néon itinerary. |
| **`zones.js`** | Polygones remplis (4 types : eau / remblais / effondrement / inaccessible). API `getZones`, `setZones`, `resetZones`, `toggleZoneMode(type)`, `fermerZoneEnCours()`, `removeLastZone/Point`. |
| **`structures.js`** | 5 sous-types : pilier-1 / pilier-2 / mur (polygones) + front-1 / front-2 (polylignes). Architecture souterraine, lecture seule pour le pathfinder. Couleurs alignées : front-1 jaune (1ère masse) / front-2 orange (2e masse). |
| **`measure.js`** | Mesure 📐 distance (polyline) OU ⬛ surface (polygone, shoelace). API `getMeasurePoints`, `setMeasureMode("distance"|"surface")`, `getMeasureValue()`. |
| **`historyManager.js`** | Undo / Redo global (Ctrl+Z / Ctrl+Y). Snapshot hybride 4 catégories (`editorPoints`, `roads`, `zones`, `structures`), 50 entrées FIFO, RAM-only. API `record`, `captureState`, `recordAction`, `undo`, `redo`, `onChange`. |
| **`pathfinder.js`** | Algorithme Dijkstra sur le réseau de polylines (tracés + jonctions). Calcule l'itinéraire le plus court entre 2 points. Snap orthogonal des waypoints aux polylines. |
| **`heatmap.js`** | Carte de chaleur de densité d'activité (basée tracker + clicks). **Désactivé en v1.12.0**, code en standby pour réactivation future. |

### 📸 Photos POI

| Module | Rôle |
|---|---|
| **`photos.js`** | Gestion photos par point (IndexedDB store `photos_by_point`). API `MyKTAMapPhotos = { add, getAllForPoint, getAllPhotosForPlan, remove, removeAllForPoint }`. Stockage Blob, max ~50 photos par point. |
| **`photoViewer.js`** | Viewer plein écran avec swipe horizontal pour naviguer. Reste **dark** même en thème clair (pour lire les photos correctement). |

### 🧭 Tracker et mode urgence

| Module | Rôle |
|---|---|
| **`tracking.js`** | Tracker PDR (capteurs mobile DeviceMotion + DeviceOrientation). Cache collision RGBA. API `getTrackingPosition`, `getTrackingPath`, `getTrackingTimeline`, `startTracking`, `stopTracking`, `resetTrackingPosition`. Listeners idempotents anti-fuite. |
| **`compass.js`** | Boussole magnétique (DeviceOrientation). Affiche la direction du nord sur la sidebar. |
| **`trackerReplay.js`** | Modale plein écran replay (slider timeline + play/pause + vitesse 0.5×→10× + export CSV). Mode compact bottom sheet pendant lecture. API `TrackerReplay = { ouvrir, fermer, exporterCSV }`. |
| **`lostMode.js`** | Mode urgence « Je suis perdu » : cercle de zone théorique + segments atteignables (isochrone Dijkstra) en rouge clair. Multi-niveau via jonctions. |
| **`emergencyMode.js`** | Overlay rouge plein écran (alerte critique sous terre) : numéros secours, dernière position, mini-map. |

### 📦 Import / Export

| Module | Rôle |
|---|---|
| **`sessionExporter.js`** | Modale 💾 Enregistrer session (4 onglets : Full / Avancé / Conversion / **📡 Export externe**). Export externe = KMZ + GPX unifiés (calibrage GPS partagé). |
| **`sessionPersist.js`** | Auto-save session courante (polling 1.5s par défaut, 5s avec `slowSave`). Restore au load avec modale « Session précédente restaurée ». |
| **`exporter.js`** | Modale 🖼️ Export PNG/JPG (modes Rapide / Avancé + légende intégrée, 4 fonds : image / blanc / noir / transparent). |
| **`pdfExport.js`** | Export PDF imprimable A0 → A4 (portrait/paysage), légende positionnable dans un coin. |
| **`tableEditor.js`** | Éditeur JSON sous forme de tableau plein écran (édition inline, validation typée, multi-select tags, recherche + tri + filtres). |
| **`createConf.js`** | Générateur de plan ZIP (Nouveau / Modifier) + modales `_afficherImporterKmz` et `_afficherImporterGpx`. Layout PC ≥1280px en 2 colonnes (col-left / col-right / col-full). Calibrage GPS embarqué via `plan.georef`. |
| **`kmzExport.js`** | Génération KMZ géolocalisé (Google Earth, OsmAnd, Locus). API `KmzExport = { buildTransform, planToGps, gpsToPlan, genererKmz, getCalibration, setCalibration }`. Calibrage 2 points persisté par plan en localStorage. Icônes embarquées dans `files/icons/<tag>.png`. |
| **`kmzImport.js`** | Reconversion d'un KMZ MyKTAMap en ZIP MyKTAMap utilisable (image plan + icônes + annotations + structures préservées). Options V2 tuilage + M-LVL. API `KmzImport = { estKmzMyktamap, extraireKmz, extraireGroundOverlays, buildTransform, gpsToPixel, ingestPlacemarks, genererZipMyktamap }`. |
| **`gpxIO.js`** | Import / Export GPX 1.1 — pour ajouter à la session courante. Réutilise calibrage KMZ. API `GpxIO = { exporter, parser, importer, verifierCalibrage, _appliquerImport }`. Roundtrip MyKTAMap via `<sym>`/`<type>`/`<cmt>MyKTAMap level=N>`. |
| **`gpxImport.js`** | **v1.15.0** — Reconversion d'un GPX en ZIP MyKTAMap autonome. Génère un canvas vierge auto-calibré sur les bounds GPS. API `GpxImport = { estGpxMyktamap, extraireGpx, extraireBoundsGps, genererCanvasVierge, ingestParsed, genererZipMyktamap }`. |
| **`legendCustomization.js`** | **Nouveau v1.16.0** — Cascade session > plan (`PLAN_CONFIG.customLegend`) > default pour les libellés / visibilité / entrées custom de la légende. API `LegendCustomization = { getLabel, isVisible, listEntries, listCustomEntries, addCustomEntry, removeCustomEntry, setSessionLabel, setSessionVisibility, ouvrirEditeur, findCustomEntry, onCustomEntriesChange }`. Entrées custom DESSINABLES via `geometry` (polyline / polygon) → boutons sidebar dynamiques. |
| **`favoris.js`** | **Nouveau v1.16.0** — Favoris points POI par plan, stockage `localStorage["myktamap_favoris_v1"]`. Snapshots complets (résilience si point déplacé). API `Favoris = { loadPlan, getAll, isFav, findByPointId, add, remove, toggle, onChange }`. Bouton ⭐ dans la popup POI + groupe sidebar topleft. |
| **`sessionBackups.js`** | **Nouveau v1.16.0** — Backup multi-rotations sessions, 10 snapshots FIFO en IndexedDB (`myktamap_backups` / store `backups`). API `SessionBackups = { init, snapshot, listAll, restore, remove, clearAll, onChange }`. 4 triggers : auto 5 min, boot pre-restore, avant `SessionPersist.clear`, manuel. Restore par écriture localStorage + reload. |

### 🗄️ Stockage et registre

| Module | Rôle |
|---|---|
| **`planRegistry.js`** | Registre multi-plans `localStorage["myktamap_plans"]` + IndexedDB (stores `handles` pour FS Access + `blobs` pour ZIP mémorisés). API `init`, `addOrUpdate`, `remove`, `getById`, `hasFsAccess`, `saveHandle/Blob`, `getHandle/Blob`, `requestPersistentStorage`, statistiques import. |

### 🔍 Recherche

| Module | Rôle |
|---|---|
| **`searchPoints.js`** | Recherche unifiée (Ctrl/Cmd+K) sur tous les calques de données + session. Tri par pertinence, normalisation NFD, navigation clavier (↑↓ Enter). Marker cercle orange 3s au résultat. |

### 🔒 Sécurité

| Module | Rôle |
|---|---|
| **`unlockGate.js`** | Barrière communautaire au démarrage : mot de passe partagé hardcodé. 5 tentatives ratées → lockout permanent. |
| **`pinLock.js`** | Code d'accès local personnel optionnel. PIN 4-6 chiffres (SHA-256 + salt random) + biométrie Face ID / Touch ID via WebAuthn. API `MyKTAMapPinLock = { isEnabled, isUnlocked, isLockedOut, enable, disable, unlock, unlockWithBiometric, changePin, reset, ouvrirGate }`. |
| **`networkAudit.js`** | Inspection des fetch sortants (whitelist same-origin + lib CDN explicites). Modale `afficherModaleAuditReseau` pour transparence. |

### ⚡ Performance et watchdogs

| Module | Rôle |
|---|---|
| **`tiling.js`** | Tiling V1 runtime (5 presets : off / auto / quality / balanced / performance). Découpe l'image en tuiles pour éviter crash Safari iOS sur JPEG > 8192px. |
| **`perfUltra.js`** | 7 toggles de tuning (slowSave, noTooltips, limiterDezoomMobile, etc.). API `PerfUltra = { getState, get, set, onChange }`. |
| **`oomGuard.js`** | Détection kill mémoire mobile (`Performance.memory` + heuristiques). Toast warning + suspension certains modules en cas de pression. API `OOMGuard = { showToast, stop, init }`. |
| **`batteryGuard.js`** | Indicateur batterie (Chromium uniquement, gracieux fallback iOS Safari / Firefox). Warnings 20 / 10 / 5 % avec throttle 5s + polling 30s. API `BatteryGuard = { init, forceCheck, getState, onChange, getStatusLabel, isAvailable }`. |

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

<!-- Icônes écran d'accueil iOS (multi-tailles) -->
<link rel="apple-touch-icon" href="icon/mkm.png">
<link rel="apple-touch-icon" sizes="180x180" href="icon/mkm.png">
<link rel="apple-touch-icon" sizes="167x167" href="icon/mkm.png">
<link rel="apple-touch-icon" sizes="152x152" href="icon/mkm.png">
<link rel="apple-touch-icon" sizes="120x120" href="icon/mkm.png">

<!-- Favicon classique -->
<link rel="icon" type="image/png" href="icon/mkm.png">
```

### 🍎 Pourquoi 5 balises `apple-touch-icon`

Safari iOS **ignore complètement** la balise `<link rel="icon">` standard pour le bouton « Sur l'écran d'accueil ». Il cherche **uniquement** `apple-touch-icon`. On déclare plusieurs tailles pour qu'iOS choisisse la plus proche selon l'appareil. Le même PNG est servi à toutes les tailles (Safari redimensionne).

### 🖼️ Contraintes du fichier icône

- **PNG carré** (≥ 180×180, idéalement 512×512)
- **Fond opaque** — pas de transparence (sinon iOS met du noir)
- **Pas d'arrondi** dans l'image (iOS arrondit automatiquement)
- **Marge interne 10-15 %** (iOS rogne légèrement les bords)

### 🔁 Mise à jour de l'icône PWA

iOS cache l'icône agressivement. Pour forcer le rafraîchissement après changement : supprimer l'app de l'écran d'accueil, effacer données Safari, rouvrir `myktamap.fr`, re-ajouter à l'écran d'accueil.

---

## 🔄 Service Worker — mode hors-connexion

Le `sw.js` est **actif** et précache l'ensemble des assets statiques de l'application au premier chargement. Une fois en cache, l'app fonctionne **entièrement hors-ligne**.

**Stratégie :**
- **Cache First** pour les assets app (HTML, JS, CSS, icônes, libs)
- **Network First** pour `data/plan-config.json` et les données du plan (toujours fraîches si dispo)
- **Fallback Cache** automatique si pas de réseau

**Mise à jour de version :** à chaque release, le constant `CACHE_NAME` dans `sw.js` est bumpé (ex: `myktamap-cache-v1.16.0`). Les anciens caches sont automatiquement purgés au prochain `activate`.

**Désactivation manuelle :** le bouton `🗑️ Réinitialiser` dans ⚙️ désinscrit le SW et vide tous les caches → recharge complète depuis le serveur (Internet requis).

---

## 🚀 Démarrage — auto-détection du mode

`main.js` orchestre le démarrage avec auto-discovery serveur + rétro-compat :

```
initApp()
  ├─ PlanRegistry.init()              ← charge le registre localStorage
  ├─ decouvrirPlansServeur()          ← fetch('data/index.json') si présent
  │     → ajoute les plans découverts au registre (discovered: true)
  │
  ├─ Si registre vide ET data/plan-config.json racine existe :
  │     → loadAppConfig()             ← rétro-compat ancien comportement
  │     → registre += server_root     ← enregistre comme plan racine
  │     → lancerApplication()
  │
  └─ Sinon :
        → afficherLoader()            ← home avec liste de plans + import
        → refreshPlansList()

# Chargement d'un plan serveur (depuis le registre)
chargerPlanServeur(planPath, registryEntry)
  ├─ libère tuiles + détruit map existante (_libererRessourcesPlanPrecedent)
  ├─ resetRuntimeAssets()
  ├─ loadAppConfig(planPath)
  ├─ enregistre dans registre + markOpened
  ├─ _propagerGeorefVersKmzExport(id)  ← v1.14.20 — calibrage GPS embarqué
  └─ lancerApplication()

# Chargement d'un ZIP (depuis import ou registre local)
startImportedPlan(planConfigFile, assetFiles, presetChoisi, meta)
  ├─ resetRuntimeAssets()
  ├─ registerAsset() × N
  ├─ cloneAndResolvePlanConfig()
  ├─ buildAppConfigFromPlan() + perfPreset
  ├─ Enregistrement registre :
  │     ├─ Si meta.fsHandle → saveHandle(id, handle)
  │     ├─ Si meta.storeBlob → requestPersistentStorage() + saveBlob(id, file)
  │     └─ markOpened(id)
  ├─ _propagerGeorefVersKmzExport(id)  ← v1.14.20
  └─ lancerApplication()
```

Le loader HTML est intégré dans `index.html` avec `display:none` — il s'affiche au démarrage si aucun plan n'est chargé.

---

## 🎬 Splash screen

Le splash s'affiche **uniquement au chargement initial de la page** (F5, ouverture d'onglet, démarrage PWA). Il ne réapparaît jamais lors d'un changement de plan via 🗂️ « Mes plans ».

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
   ├─ Attendre que (SPLASH_MIN_DURATION_MS - elapsed) soit écoulé
   ├─ Ajouter classe .fading (opacity 0 transition 0.4s)
   └─ Retirer du DOM après 500ms
```

| Constante | Valeur | Description |
|---|---|---|
| `SPLASH_MIN_DURATION_MS` | `4000` | Durée minimum d'affichage (`main.js`) |
| `--splash-duration` | dyn | Variable CSS pour synchroniser la barre |
| `_splashShownAt` | timestamp | Calcul du temps restant |

**Assets requis (cachés par le SW)** : `icon/mkm-full.png` (logo rose des vents) + `icon/karma.png` (signature).

---

## 💥 Reset complet de l'application

Fonction `viderCacheAppli()` accessible depuis :
- **⚙️ Configuration** dans le loader home (bouton rouge `💥 Tout réinitialiser`)
- **⚠️ Modale Update** (bouton « 🔄 Forcer la mise à jour » → variante reset)

### Étapes du reset

```
1. navigator.serviceWorker.getRegistrations() + unregister
2. caches.keys() + caches.delete                    ← vide tous les caches PWA
3. localStorage.clear()                              ← registre + préférences + debug
4. sessionStorage.clear()
5. indexedDB.databases() → deleteDatabase pour chaque (incl. handles, blobs, photos)
   (fallback Safari : deleteDatabase("myktamap_handles") + photos par nom)
6. window.location.reload(true)                      ← redémarrage complet
```

### Sécurité — double confirmation

| Étape | Modale |
|---|---|
| 1 | « ⚠️ Tout réinitialiser ? » — liste les éléments effacés + boutons Annuler / Continuer |
| 2 | « 🚨 Confirmation finale » — rappel « Pensez à exporter votre liste avant » |
| 3 | « ⏳ Réinitialisation en cours… » (spinner pendant le nettoyage) |

Après reload, l'app revient strictement à l'état « premier lancement » (splash → loader vide).

---

## ⚠️ Gestion des erreurs « Plan introuvable »

Détection à la volée au clic sur un plan du registre (pas de scan préventif).

### Cas couverts

| Cas | Détection | Reason |
|---|---|---|
| Plan serveur 404 | `chargerPlanServeur()` throw `e.code === "PLAN_NOT_FOUND"` | `server` |
| Blob mémorisé absent | `getBlob(id)` retourne `null` (vidage cache) | `local-blob` |
| FS handle perdu | `getHandle(id)` null OU `handle.getFile()` throw | `local-fs` |
| FS permission refusée | `ensureHandlePermission(handle) === false` | `local-fs-denied` |

### Modale d'erreur (`afficherModalePlanIntrouvable`)

Modale **pédagogique** dans `index.html`, actions selon le `reason` :

- **🔄 Réessayer** (server uniquement)
- **📁 Re-sélectionner le ZIP** (cas locaux, restaure auto la persistance Blob/FS)
- **🗑️ Retirer de la liste** (suppression + libération blobs/handles via `PlanRegistry.remove()`)
- **Annuler**

Si ZIP re-sélectionné a un `plan.name` différent du nom cliqué → `confirm()` « Charger quand même ? ».

---

## 🎨 Système d'icônes — cascade et fallback

L'app dispose d'un système de résolution d'icônes en **cascade 4 niveaux** qui permet d'ajouter de nouveaux types sans modifier les `plan-config.json` existants.

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

```js
const TAGS_BUILTIN = {
  salle:    "icon/house.png",
  pa:       "icon/pa.png",  pc: "icon/pc.png",  pb: "icon/pb.png",
  pe:       "icon/pe.png",  ps: "icon/ps.png",
  // 6 tags d'accès
  peo:      "icon/peo.png", pef: "icon/pef.png",   // puits à échelon
  eso:      "icon/eso.png", esf: "icon/esf.png",   // escalier service
  cao:      "icon/cao.png", caf: "icon/caf.png",   // cavage
  // signalétique
  vehicule: "icon/vehicule.png", elec: "icon/elec.png", epure: "icon/epure.png",
  info:     "icon/info.png", chatiere: "icon/chatiere.png",
  passage:  "icon/passage.png", danger: "icon/danger.png", plaque: "icon/plaque.png"
};
```

### Fonction centralisée `getIconUrlForPoint(point)` (`utils.js`)

Implémente la cascade complète, exposée pour : `searchPoints.js`, `utils.js > telechargerPlan`, `exporter.js`, `sessionExporter.js`.

### Ajouter un nouveau tag — checklist

1. **PNG 50×50** transparent dans `icon/<nom>.png`
2. **`map.js`** — ajouter dans `TAGS_BUILTIN`
3. **`editor.js`** — ajouter dans `EDITOR_TAG_LABELS`
4. **`interface.js`** — ajouter dans `LEGENDE_LABELS` + dans le bon groupe `GROUPES`
5. **`exporter.js`** — ajouter dans `LBL` local + groupe `GROUPES_ICONES`
6. **`createConf.js`** — ajouter dans `PLANNER_DEFAULT_ICONS`
7. **`sw.js`** — ajouter `"./icon/<nom>.png"` dans `ASSETS_TO_CACHE`

→ Le tag est utilisable immédiatement, **même sur les plans existants** (sans modifier leur `plan-config.json`).

---

## 📚 Multi-plans (`planRegistry.js`)

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
      "addedAt":    "2026-05-06T10:00:00Z",
      "perfPreset": "auto",
      "multiLevel": false,
      "tiledV2":    false
    },
    {
      "id":               "local_planmarseille_v1",
      "type":             "local",
      "name":             "Plan Marseille",
      "version":          "V1",
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

```json
{ "plans": ["test1", "test2", "demo"] }
```

Format détaillé (évite N fetches au démarrage) :

```json
{
  "plans": [
    { "id": "test1", "path": "data/test1", "name": "Test 1", "version": "V1", "author": "..." },
    { "id": "test2", "path": "data/test2", "name": "Test 2", "version": "V2", "author": "..." }
  ]
}
```

### 🔐 Persistance des plans locaux — 3 stratégies

| Stratégie | Plateforme | Description |
|---|---|---|
| **File System Access API** | Chrome / Edge desktop | Bouton 🔐 sous le drop ; `FileSystemFileHandle` en IDB store `handles` ; au pire 1 clic après refresh |
| **Stockage Blob IDB** | Mobile + fallback | Case « 💾 Mémoriser ce plan » ; ZIP entier copié en IDB ; `navigator.storage.persist()` |
| **Re-sélection** | Fallback | Aucune persistance ; clic sur plan → file picker ; validation `cfg.plan.name` |

### 🏷️ Indicateurs visuels

| Badge | Signification | Couleur |
|---|---|---|
| ✅ | `storedBlob: true` — ZIP en IDB | Vert |
| 🔐 | `fsHandleId` présent — FS handle en IDB | Bleu |
| 📁 | Aucune persistance — re-sélection requise | Gris |

### 🔄 Hiérarchie de chargement

Au clic sur un plan local : Blob IDB → FS Handle → Re-sélection (fallback).

### 💾 Export / Import de la liste

- **Export** : `myktamap_plans_AAAAMMJJ.config` (JSON `myktamap-plans-list`). Les `fsHandleId` sont retirés (non portables).
- **Import** : modale 3 modes (Remplacer / Fusionner / Annuler). `statsImport(file)` pour résumé.

---

## ⚡ Mode performance (tiling V1 + V2)

### V1 runtime — `tiling.js`

Pour les plans JPEG volumineux qui crashent Safari iOS (`drawImage` > 8192px échoue silencieusement → canvas noir), le mode performance découpe l'image en tuiles. Réglable en **5 presets** :

| `APP_CONFIG.perfPreset` | `MAX_WORK_DIM` | `TILE_SIZE` | JPEG Q | Quand on tile |
|---|---|---|---|---|
| `"off"` | — | — | — | **JAMAIS** |
| `"auto"` (défaut) | (Équilibré quand tile) | — | — | si `fileSize > 60 Mo` |
| `"quality"` | 12288 | 1024 | 0.95 | si `imageW × imageH > 4096²` |
| `"balanced"` | 8192 | 1024 | 0.88 | si `imageW × imageH > 4096²` |
| `"performance"` | 6144 | 768 | 0.78 | si `imageW × imageH > 4096²` |

> Le preset est **par plan** (sauvegardé dans `PlanRegistry[planId].perfPreset`).

### V2 build-time — `createConf.js > _genererTuilesV2`

Conversion offline (= au moment de générer le ZIP plan) en **tuiles 512×512 sur 4 niveaux de zoom** (Google Maps-like). Manifest dans `plan-config.json > tiling`, flag `plan.tiledV2 = true`. Réduction mémoire massive vs V1 (qui charge l'image entière en RAM) — utile pour les gros plans > 50 Mo.

V2 disponible depuis :
- Générateur classique (Modifier un plan, image source dispo)
- 🌍 Import KMZ (option « 🧱 Convertir en V2 » dans la modale)
- 📤 Import GPX (option idem, re-tile le canvas vierge)

---

## 💾 Préférences utilisateur

### 1. Globale — `localStorage["app_user_prefs"]`

```js
{
  "debugMode": true | false   // unique pref globale
}
```

Helper `setDebugMode(value)` (utilisé par le bouton 🐛 du loader ET le toggle Réglages ⚙️).

### 2. Par plan — `PlanRegistry[planId]`

```js
{
  "id": "local_planmarseille_v1",
  "perfPreset": "balanced",   // tiling V1 preset
  "multiLevel": true,          // M-LVL actif
  "tiledV2":    true           // V2 tuiles actif
}
```

### 3. Thème global — `localStorage["myktamap_theme_v1"]`

`"dark"` (défaut) ou `"light"`. Géré par `themeManager.js`.

### 4. PIN local — `localStorage["myktamap_pin_v1"]`

`{ hash, salt, attempts, biometricEnabled }`. Géré par `pinLock.js`.

---

## ⚙️ Configuration — `plan-config.json`

Chaque plan est décrit par un fichier `plan-config.json` à la racine de son ZIP / dossier.

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
    "collisionImage": "data/collision.png",
    "multiLevel": false,
    "tiledV2": false,
    "georef": {
      "pointA": { "x": 100, "y": 200, "lat": 48.8580, "lng": 2.2945 },
      "pointB": { "x": 800, "y": 500, "lat": 48.8520, "lng": 2.3050 }
    }
  },
  "imageLayers": [
    { "id": "legende", "label": "Legende", "file": "data/TestMAP_LEGENDE.png", "visible": true, "order": 10, "level": 0 }
  ],
  "dataLayers": [
    { "id": "puits",    "label": "Puits",   "file": "data/puit.json",    "visible": true },
    { "id": "vehicule", "label": "Vehicule","file": "data/vehicule.json","visible": true },
    { "id": "editor",   "label": "Ajouts",  "file": "data/editor.json",  "visible": true }
  ],
  "tracking": {
    "startX": 345, "startY": 519,
    "scale": 4.9, "stepLength": 0.7,
    "stepThreshold": 13, "stepCooldown": 400
  },
  "icons": {
    "default":  "icon/iconetrack.png",
    "track":    "icon/iconetrack.png",
    "salle":    "icon/house.png",
    "pa":       "icon/pa.png"
  }
}
```

### Champs notables

- **`plan.multiLevel`** : opt-in (depuis v148). Active la gestion des étages + jonctions interniveau.
- **`plan.tiledV2`** : opt-in (depuis v149). Indique que le plan utilise les tuiles V2 — `tiling` section présente.
- **`plan.georef`** : opt-in (depuis v1.14.20). Calibrage GPS 2 points embarqué — propagé automatiquement vers `KmzExport.setCalibration` au load via `main.js > _propagerGeorefVersKmzExport`. Permet l'export KMZ/GPX sans re-saisie côté utilisateurs.
- Le calque `editor` doit toujours être présent dans `dataLayers`.
- Les tags `default` et `track` sont **obligatoires** dans `icons`. Les autres sont libres.

---

## 📦 Structure des données JSON

### 🗂️ Format standard (calques de données)

```json
{
  "type": "puits",
  "version": 1,
  "data": [ ... ],
  "roads": [],
  "zones": [],
  "structures": []
}
```

### 💾 Format session exportée

```json
{
  "type": "devmap-session",
  "version": 1,
  "editorPoints": [ ... ],
  "roads": [],
  "zones": [],
  "structures": [],
  "measure": { "mode": "distance|surface", "points": [] },
  "tracker": { "position": {x,y}, "path": [...] }
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
  "date_update": "2026-04-03",
  "level": 0
}
```

Un point avec un tableau `tags` vide → utilise l'icône `default`.

---

## 💾 Export de session — `sessionExporter.js`

Modale `window.ouvrirExportSessionModal()` avec 4 onglets.

### 🚀 Full

Inclus : `editorPoints` + `roads` + `zones` + `structures` + `measure`. Exclu : tracker, photos. Format : `devmap-session` JSON. Nom auto `session_<plan>_AAAAMMJJ.json`.

### 🎨 Avancé

Cases hiérarchiques :
- ✏️ Points + sous-cases par tag (avec icône miniature)
- 🛣️ Tracés + sous-cases par type (principal / secondaire / chemin)
- ⬛ Zones + sous-cases par type (eau / remblais / effondrement / inaccessible)
- 🏛️ Structures + sous-cases par sous-type
- 🧭 Tracker (option)
- 📸 Photos (option, ZIP si coché)

Format : JSON unique OU ZIP multi-fichiers (incluant `data/photos/` si coché).

### 🔄 Conversion

Convertit la session en data layer(s) au format `devmap-data` (réimportable dans le générateur ZIP). Pas de tracker.

### 📡 Export externe (KMZ + GPX unifiés)

- **Calibrage GPS 2 points** saisi UNE seule fois (partagé avec KMZ et GPX)
- Sélecteur pills KMZ / GPX (persisté en localStorage)
- **KMZ** : Google Earth, OsmAnd, Avenza, Locus. Folders KML par niveau. Image overlay opacité réglable.
- **GPX 1.1** : TopoDroid, OsmAnd, Strava, Garmin. Waypoints + tracks. Roundtrip MyKTAMap via `<sym>`/`<type>`/`<cmt>MyKTAMap level=N>`.

---

## 📍 Gestion des coordonnées

GIMP / image source : origine **haut-gauche** (Y vers le bas). Leaflet `L.CRS.Simple` : origine **bas-gauche** (Y vers le haut).

```js
function convertCoord(x, y) {
  return [APP_CONFIG.imageHeight - y, x];
}
```

Pour le calibrage GPS, `KmzExport.buildTransform()` calcule une transformation affine 2D (rotation + scale + translation) à partir de 2 points plan ↔ GPS. `planToGps(t, x, y)` et `gpsToPlan(t, lat, lng)` font la conversion bidirectionnelle.

---

## 🐛 Débogage

Le panneau de logs est accessible via **⚙️ → 🐛 Logs**. Il capture en silence :

- Tous les `console.log` / `console.warn` / `console.error`
- Les erreurs non catchées (`window.onerror`)
- Les promesses rejetées (`unhandledrejection`)

Les logs sont persistés dans `localStorage["kta_debug_logs"]` — ils survivent au crash du tab Safari iOS. Au prochain ouverture, les logs du crash précédent s'affichent en grisé avec le label `[CRASH PRÉCÉDENT]`.

Le mode `debugMode` (activable depuis Configuration home ou ⚙️ Réglages mode map) ajoute des `console.log` supplémentaires côté tracker (PDR, pas détectés, recalages) et perf (chiffres techniques tiling).

---

## 📋 Journal des modifications

> Seules les **3 dernières releases** (≤ 1 semaine) sont conservées dans le README. Pour l'historique complet, consulter le repo Git.

<details id="v1-19-1" open>
<summary><strong>🗓️ 24/05/2026 — 🩹 v1.19.1 : Release PATCH consolidée (fixes + polish + features moyennes accumulées)</strong></summary>

Release **PATCH** (bump Z : 1.16.1 → 1.19.1). Choix d'un saut PATCH (et non MINOR × 4) car le pack accumulé est **surtout** des fixes et du polish, malgré la présence de quelques features moyennes. Les sous-sections ci-dessous documentent chaque sujet livré séparément (l'historique Git préserve les itérations dev fines avec leurs commits granulaires).

### 📦 Sujets livrés dans cette release

| Sujet | Type | Section détaillée |
|---|---|---|
| 🚀 Générateur accessible (Mode Simple/Avancé + Légende plan-level) | Feature | Voir v1.17.0 ci-dessous |
| 🌍 Roundtrip KMZ de la légende plan-level | Feature | Voir v1.18.0 ci-dessous |
| 🌍 Roundtrip GPX + preview d'import KMZ/GPX | Fix + polish | Voir v1.18.1 ci-dessous |
| 📊 Inspecteur mémoire (transparence + debug) | Feature | Voir v1.19.0 ci-dessous |
| 🎯 Polish UX + DX (Aide enrichie + UpdateChecker semver + Toast SW) | Polish | Voir v1.20.0 ci-dessous |
| 🩹 Fixes UI accumulés (auto-save par plan, tableau mobile, boussole z-index, logs thème clair) | Fixes | Disséminés dans les sections ci-dessous + historique Git |

### 🎯 Cohérence du cycle

Toutes ces livraisons forment un cycle cohérent autour de **la légende personnalisée d'un plan** (édition session → édition plan-level → portabilité KMZ → portabilité GPX → visibilité d'import) + **outils de transparence** (Memory Inspector + Polish UX + DX).

### 📂 Sources de vérité v1.19.1

- `version.json` → `"v1.19.1"`
- `js/copyright.js` > `__MKM__.build` → `"v1.19.1"`
- `sw.js` > `CACHE_NAME` → `"myktamap-cache-v1.19.1"`
- 1 nouveau fichier ajouté à `ASSETS_TO_CACHE` : `js/memInspector.js`
- Modifs internes à : `js/createConf.js`, `js/sessionExporter.js`, `js/kmzExport.js`, `js/kmzImport.js`, `js/gpxIO.js`, `js/gpxImport.js`, `js/interface.js`, `js/updateChecker.js`, `js/debug.js`, `js/sessionPersist.js`, `js/sessionBackups.js`, `index.html`, `css/style.css` (+ doc full)

### 🛡️ Confidentialité

Aucune nouvelle surface réseau, aucun nouveau call extérieur. Tous les ajouts sont 100 % locaux : lecture localStorage / IndexedDB / Cache API pour MemInspector, fichiers annexes dans les ZIP KMZ/GPX générés, hooks `navigator.serviceWorker` côté client, fonction pure `compareSemver`. **NETWORK_AUDIT couvre tout ce cycle** sans changement de surface — mise à jour des dates et de la version affichée uniquement.

</details>

<details id="v1-20-0">
<summary><strong>🗓️ 24/05/2026 — 🎯 v1.20.0 (sous-itération de v1.19.1) : Cycle « Polish UX + DX »</strong></summary>

Release MINOR (bump Y : 1.19.x → 1.20.0). 3 améliorations de qualité indépendantes regroupées en 1 release :

### 📚 (1/3) Aide intégrée enrichie

2 sections manquantes ajoutées dans la modale 📚 Aide / Doc (`interface.js > afficherAide`) :

**📊 Inspecteur mémoire (v1.19.0)** — Liste détaillée des 5 sections affichées dans la modale Memory Inspector (Runtime, localStorage, IndexedDB, Cache PWA, Storage estimate) + bouton 📋 Copier le rapport + cas d'usage debug. Précise « Lecture seule, 100 % local — aucune donnée transmise ».

**🏷️ Légende personnalisable (v1.16.0 + v1.17.0 + v1.18.x)** — Synthèse complète de la cascade `session > plan > défaut MKM` : explication des 2 points d'édition (session-locale via 🖼️ Export PNG ou map mode, plan-level partagée via Générateur Avancé), des 4 catégories couvertes (icônes / tracés / zones / structures), du roundtrip KMZ (v1.18.0) et GPX (v1.18.1), et de la détection au preview d'import (« ✅ Légende personnalisée détectée »).

Bonus : enrichissement section existante « 🏗️ Créer / Modifier un plan » avec mention du Mode Simple/Avancé du Générateur (v1.17.0).

### 🆙 (2/3) Update Checker en vrai semver

Refactor `js/updateChecker.js` : ajout d'un helper interne `compareSemver(a, b)` qui parse les versions en `[X, Y, Z]` et compare numériquement, au lieu de la comparaison string actuelle.

**Anti-bug latent** : `"v1.7.10" < "v1.7.9"` en comparaison string (le `10` se compare lexicographiquement comme `1` puis `0` au char[4], vs `9`). Pas un bug aujourd'hui (on n'utilisait que `===` qui détecte n'importe quelle différence), mais le refactor protège contre toute future utilisation de `<` ou `>` quelque part.

**Nouveau cas géré** : downgrade serveur (= remote.version PLUS ANCIENNE que la version installée chez l'user). Cas marginal (l'auteur a roll-back une release sur le CDN) mais important : on ne propose PAS une « mise à jour » qui régresserait :

```js
const cmp = compareSemver(remote.version, known);
if (cmp === 0) return { status: "up-to-date" };
if (cmp < 0) {
  console.warn("[UpdateChecker] ⚠️ Downgrade serveur détecté — skip modale");
  return { status: "downgrade-detected", local: known, remote };
}
// cmp > 0 : vraie nouvelle version, proposer l'update
```

**API publique étendue** : `window.UpdateChecker.compareSemver(a, b)` exposé pour usages futurs (changelog viewer entre 2 versions, MemInspector, etc.). Format accepté : `"v1.7.10"`, `"1.7.10"`, `"v1.7.10-fix2"` (suffix ignoré), `"v143"` (legacy pré-v1.7.1, traité comme `[143]`).

### 🔄 (3/3) Force update auto-proposé sur mismatch CACHE_NAME

Nouveau hook sur `navigator.serviceWorker.addEventListener("controllerchange")` dans `index.html`. Quand un nouveau Service Worker prend le contrôle pendant la session (= bump CACHE_NAME côté serveur), un toast non-bloquant via OOMGuard explique :

```
🔄 Mise à jour mineure appliquée — assets fraîchement rechargés.
```

**Garde-fou critique** : on skip le PREMIER `controllerchange` si la page n'avait pas de controller au load. C'est le cas du tout premier install PWA — pas une « mise à jour », c'est juste l'arrivée initiale du SW. Sans ce filtre, on afficherait un toast trompeur au premier lancement.

```js
let _swIsInitialControl = !navigator.serviceWorker.controller;
navigator.serviceWorker.addEventListener("controllerchange", function() {
  if (_swIsInitialControl) {
    _swIsInitialControl = false;
    return; // Premier install, pas de toast
  }
  // Vraie update : afficher le toast
  window.OOMGuard.showToast("🔄 Mise à jour mineure appliquée...", "info");
});
```

Le SW MyKTAMap fait déjà `self.skipWaiting()` au install + `self.clients.claim()` au activate (cf `sw.js`), donc le nouveau SW prend le contrôle immédiatement → `controllerchange` fire dans la session courante sans attendre un reload manuel.

**Bonus traçabilité** : hook `reg.addEventListener("updatefound")` pour logger l'état du nouveau SW en console (visible dans 🐛 Logs détaillés si debugMode ON). Aide à diagnostiquer le cas où un nouveau SW s'install mais n'arrive jamais à activate (= bug du SW lui-même).

### 📂 Sources de vérité v1.20.0

- `version.json` → `"v1.20.0"`
- `js/copyright.js` > `__MKM__.build` → `"v1.20.0"`
- `sw.js` > `CACHE_NAME` → `"myktamap-cache-v1.20.0"` (= retour au format final propre, fin des suffixes `-fixes` / `-fixes2` du dev)
- Aucun nouveau fichier — modifs internes à `js/interface.js` (~70 lignes : 2 sections Aide), `js/updateChecker.js` (~50 lignes : compareSemver + intégration), `index.html` (~35 lignes : hooks SW client)

### 🛡️ Confidentialité

Aucune nouvelle surface réseau. Le hook `controllerchange` est 100 % local (event navigateur). `compareSemver` est une fonction pure sans I/O. L'enrichissement de l'Aide est purement HTML statique injecté côté client. **NETWORK_AUDIT inchangé** sur le fond — mise à jour des dates et de la version affichée uniquement.

</details>

<details id="v1-19-0">
<summary><strong>🗓️ 24/05/2026 — 🚀 v1.19.0 : 📊 État mémoire — Inspecteur de transparence & debug</strong></summary>

Release MINOR (bump Y : 1.18.x → 1.19.0). Nouvel outil de transparence + debug accessible depuis ⚙️ Configuration loader > nouvelle section « 📊 Inspecteur » : un topo lisible et compréhensible de tout ce qui est chargé en mémoire localement par l'app.

### 🎯 Use cases

- **Diagnostiquer un bug** « ma session disparaît », « mes photos ne sont plus là », « le plan ne charge pas »
- **Vérifier qu'un reset complet a bien purgé tout** (avant/après comparaison)
- **Voir la consommation mémoire** avant un export volumineux (KMZ avec 200 photos par ex.)
- **Partager un rapport** par DM au mainteneur (bouton 📋 Copier formate en texte plain)

### 🆕 Module `js/memInspector.js` (~580 lignes IIFE)

API publique :
```js
window.MemInspector = {
  ouvrir(),         // affiche la modale + lance la collecte
  fermer(),         // ferme la modale
  collecter(),      // Promise<Report> — collecte async
  formatBytes(n),   // helper formatage (B / KB / MB / GB)
  getReportText(r)  // texte plain markdown-like pour copier
};
```

Collecte 100% async, tolérante aux APIs absentes (`indexedDB.databases()` indispo sur vieux navigateurs, `navigator.storage.estimate()` indispo sur iOS Safari < 14, etc.) — warn console + skip de la section qui échoue, jamais de modale cassée.

### 📊 5 sections affichées

| Section | Contenu |
|---|---|
| 🧠 **Runtime** | Version app + plan chargé (nom/version/dims/M-LVL/V2/calques/légende custom) + session active (📍 N points / 🛣️ M tracés / ⬛ K zones / 🏛️ structures + état mesure/tracker/iti) + APP_CONFIG (debug/perfPreset/M-LVL) + modules chargés/manquants |
| 🗂️ **localStorage** | Liste des clés MyKTAMap triées par taille décroissante, total en bytes pretty-print, mini-barre de proportion par clé |
| 💾 **IndexedDB** | 3 bases connues (`myktamap_handles`, `myktamap_backups`, `myktamap_photos`) + scan natif via `indexedDB.databases()` (Chrome/Firefox récent) pour détecter bases tierces. Count par store. |
| 📦 **Cache PWA** | Liste des caches existants, marquage du cache actif (★, détection via `__MKM__.build`), échantillon des 12 premiers assets cachés |
| 📊 **Storage estimate** | `navigator.storage.estimate()` → usage / quota / % avec barre couleur (vert → jaune → rouge selon usage) |

### 📋 Bouton « Copier le rapport »

Formate l'intégralité du rapport en texte plain markdown-like prêt à coller dans Discord / mail / GitHub issue :

```
=========================================
MyKTAMap — Rapport État Mémoire
=========================================
📅 Timestamp : 2026-05-24T22:30:00.000Z
📦 Version app : v1.19.0

🧠 RUNTIME
─────────────────────────────────────────
Plan chargé : Carrière du Val V3 (4000×2251)
  Auteur : KARMA
  M-LVL : ON | V2 tuilé : OFF
  Calques image : 1 | Calques data : 4
  Légende custom plan : OUI
Session active : 14 points, 8 tracés, 3 zones, 1 structures
…
```

Fallback `execCommand("copy")` pour les navigateurs sans Clipboard API (anciens browsers + contextes non-sécurisés HTTP).

### 🎛️ UI Modale

Modale `.kta-readme-modal-overlay` standard. Boîte spacieuse (720px mobile → 920px PC ≥ 1024px → 1100px PC ≥ 1440px). Sections card-stack avec headers ambre charte + total à droite. Tableau localStorage avec barre de proportion par clé. Tags colorés (vert ON / rouge warn / gris dim) pour visualisation rapide des états. Header avec timestamp + version app pour traçabilité du rapport. Bouton 🔄 Rafraîchir + 📋 Copier en footer.

### 📂 Sources de vérité v1.19.0

- `version.json` → `"v1.19.0"`
- `js/copyright.js` > `__MKM__.build` → `"v1.19.0"`
- `sw.js` > `CACHE_NAME` → `"myktamap-cache-v1.19.0"`
- **Nouveau fichier** `js/memInspector.js` (~580 lignes) ajouté à `ASSETS_TO_CACHE`
- Balise `<script>` ajoutée dans `index.html` juste après `js/networkAudit.js` (cohérence « outils d'inspection & transparence »)
- ~80 lignes UI ajoutées dans la modale Configuration loader (nouvelle section + handler)
- ~310 lignes CSS dans `css/style.css` (dark + light theme variants)

### 🛡️ Confidentialité

Aucune nouvelle surface réseau. L'Inspecteur ne fait QUE de la lecture locale :
- `localStorage` : itération `localStorage.length` + `getItem`
- `IndexedDB` : `indexedDB.open()` read-only + `objectStore.count()` (pas de read des entries)
- `Cache API` : `caches.keys()` + `caches.open().keys()` (URLs only, pas de read des blobs)
- `navigator.storage.estimate()` : pure lecture API navigateur

Aucun fetch externe. Aucune transmission de données. Le rapport copié reste local (presse-papier navigateur). **NETWORK_AUDIT inchangé** sur le fond — mise à jour des dates et de la version affichée uniquement.

</details>

<details id="v1-18-1">
<summary><strong>🗓️ 24/05/2026 — 🩹 v1.18.1 : Roundtrip GPX `customLegend` + preview d'import KMZ/GPX</strong></summary>

Hotfix PATCH (bump Z : 1.18.0 → 1.18.1). Complète la v1.18.0 sur 3 axes :

### 🌍 GPX export — Embed via `<extensions>` standard

`js/gpxIO.js > exporter` accepte un nouveau champ `opts.planCustomLegend`. Si présent, embed dans `<extensions><myktamap:customLegend>…</myktamap:customLegend></extensions>` **sous `<metadata>`** du GPX (= conforme au schéma GPX 1.1). Le namespace `xmlns:myktamap="https://myktamap.fr/gpx/ext/v1"` est déclaré sur le root `<gpx>`. Payload identique au KMZ : wrapper JSON `{type: "myktamap-gpx-extras", version: 1, exportedAt, customLegend}` sérialisé et escapé XML.

**Compat externe** : strictement transparent pour TopoDroid, OsmAnd, Strava, Avenza, Garmin, etc. — les `<extensions>` sous `<metadata>` sont standardement ignorées par les parsers GPX qui ne reconnaissent pas le namespace.

### 📥 GPX parser + reconversion

`js/gpxIO.js > parser` extrait l'éventuelle `<extensions><myktamap:customLegend>` (matching insensible au namespace via `localName === "customlegend"` pour tolérer les GPX sans déclaration `xmlns:myktamap`) et la pose dans `parsed.metadata.customLegend`.

Matching tolérant à 2 formats :
- Wrapper complet `{type, version, exportedAt, customLegend}` (= cas normal MyKTAMap)
- État brut `{labels, hidden, customEntries}` (= permissif pour les GPX édités à la main)

Skip silencieux si JSON corrompu (warn console + skip — pas de blocage de l'import).

`js/gpxImport.js > genererZipMyktamap` injecte `parsed.metadata.customLegend` dans `planConfig.plan.customLegend` du ZIP MyKTAMap reconstruit. La cascade `LegendCustomization.loadPlanState` l'appliquera au boot du plan importé.

**`importer()` (= import dans session courante) ignore silencieusement** la `customLegend` extraite — c'est une cascade plan-level, pas session-level. L'import ne mute que les annotations de la session (points, tracés).

### 🎛️ GPX export UI — Checkbox parallèle au KMZ

Nouvelle checkbox `🏷️ Légende personnalisée du plan` dans la modale 💾 Enregistrer session > onglet 🌍 KMZ/GPX > section 📍 Contenu à exporter (GPX). Comportement strictement identique à la checkbox KMZ v1.18.0 :

- Plan AVEC customLegend → cochée par défaut, compteur `(1)`
- Plan SANS customLegend → décochée + grisée à 0

### 👁️ Preview d'import KMZ + GPX

Les 2 modales d'import (`_afficherImporterKmz` et `_afficherImporterGpx` dans `createConf.js`) affichent désormais explicitement dans le résumé/preview, AVANT la génération du ZIP MyKTAMap :

```
✅ Légende personnalisée du plan détectée : 3 renommés · 2 masqués · 1 custom
    (restaurée au boot du plan reconstruit)
```

**KMZ** : parse async de `myktamap-extras.json` extrait par `extraireKmz`.
**GPX** : lecture directe de `parsed.metadata.customLegend` (déjà extrait par `gpxIO.js > parser`).

Skip silencieux si fichier absent (KMZ tiers, MyKTAMap < v1.18.0 ; GPX tiers, MyKTAMap < v1.18.1).

### 📂 Sources de vérité v1.18.1

- `version.json` → `"v1.18.1"`
- `js/copyright.js` > `__MKM__.build` → `"v1.18.1"`
- `sw.js` > `CACHE_NAME` → `"myktamap-cache-v1.18.1"`
- Aucun nouveau fichier — modifs internes à `js/gpxIO.js` (~45 lignes : exporter + parser), `js/gpxImport.js` (~15 lignes : reconversion), `js/sessionExporter.js` (~25 lignes : UI GPX + plumbing), `js/createConf.js` (~50 lignes : preview KMZ + GPX)

### 🛡️ Confidentialité

Aucune nouvelle surface réseau. La balise `<extensions>` GPX est embarquée localement dans le fichier généré + parsée localement à l'import (`DOMParser` natif). Aucun fetch externe. **NETWORK_AUDIT inchangé** sur le fond — mise à jour des dates et de la version affichée uniquement.

</details>

<details id="v1-18-0">
<summary><strong>🗓️ 24/05/2026 — 🚀 v1.18.0 : Roundtrip KMZ de la légende plan-level</strong></summary>

Release MINOR (bump Y : 1.17.x → 1.18.0). La nouvelle source de vérité `plan.customLegend` introduite en v1.17.0 voyage désormais avec le format de partage KMZ.

### 🎯 Problème résolu

Avant v1.18.0, un utilisateur qui personnalisait la légende d'un plan via le Générateur (renommer « Eau » → « Lac du fond », masquer un type, ajouter des customs dessinables) → embed dans `plan-config.json > plan.customLegend` du ZIP → partage du ZIP à un autre user OK. Mais s'il exportait en KMZ pour la portabilité cross-app (Google Earth, OsmAnd, autre instance MyKTAMap), la légende custom était **perdue** au passage. Au ré-import KMZ → MyKTAMap (qui régénère un ZIP MyKTAMap reconstruit), la légende repartait à zéro (cascade défaut MKM).

### 📦 Embed côté export (`kmzExport.js`)

Nouveau champ `opts.planCustomLegend` accepté par `genererKmz`. Si présent et non-null, embed dans un fichier annexe `myktamap-extras.json` à côté de `doc.kml` dans le ZIP KMZ :

```json
{
  "type":         "myktamap-kmz-extras",
  "version":      1,
  "exportedAt":   "2026-05-24T22:00:00.000Z",
  "customLegend": { "schemaVersion": 1, "labels": {...}, "hidden": {...}, "customEntries": [...] }
}
```

**Format ouvert** : le wrapper `{ type, version, exportedAt, customLegend }` permet d'ajouter d'autres extras MyKTAMap plus tard (favoris partagés, notes globales, etc.) sans bumper la version du format. Les apps tierces (Google Earth, OsmAnd, Avenza) ignorent les fichiers inconnus du ZIP KMZ sans broncher — le KMZ reste 100 % standard pour elles.

### 🎛️ UI côté export (`sessionExporter.js`)

Nouvelle checkbox **« 🏷️ Légende personnalisée du plan »** dans la modale 💾 Enregistrer session > onglet 🌍 KMZ > section 📦 Contenu à inclure. Comportement :

- Plan AVEC customLegend (cascade plan non-vide) → checkbox cochée par défaut, compteur `(1)`
- Plan SANS customLegend (cascade défaut MKM) → checkbox décochée + grisée à 0, pas d'incident

Lecture de `window.PLAN_CONFIG.customLegend` au render. Passage à `genererKmz` via `opts.planCustomLegend` calculé conditionnellement (skip si checkbox décochée).

### 📥 Parse côté import (`kmzImport.js`)

Détection de `myktamap-extras.json` dans les assets extraits par `extraireKmz` (capture déjà tous les fichiers non-KML sans filtre — aucune modif nécessaire à l'extraction). Matching tolérant à la casse + au chemin :

```js
const extrasKey = Object.keys(opts.assets).find(function(p) {
  return /(?:^|\/)myktamap-extras\.json$/i.test(p);
});
```

Si trouvé → parse JSON → injection dans `planConfig.plan.customLegend` du ZIP MyKTAMap reconstruit. La cascade `LegendCustomization` l'appliquera automatiquement au boot du plan importé via `loadPlanState()` (cf §58.2 CLAUDE.md).

**Skip silencieux** dans 3 cas :
- Fichier absent (KMZ d'une app tierce, ou KMZ MyKTAMap < v1.18.0) → comportement v1.17.x préservé
- Fichier corrompu (JSON parse error) → warn console + skip
- Champ `customLegend` absent ou non-objet dans le JSON → skip

### 📂 Sources de vérité v1.18.0

- `version.json` → `"v1.18.0"`
- `js/copyright.js` > `__MKM__.build` → `"v1.18.0"`
- `sw.js` > `CACHE_NAME` → `"myktamap-cache-v1.18.0"`
- Aucun nouveau fichier — modifs internes à `js/kmzExport.js` (~15 lignes), `js/sessionExporter.js` (~30 lignes : UI + plumbing), `js/kmzImport.js` (~25 lignes)

### 🛡️ Confidentialité

Aucune nouvelle surface réseau. Le fichier `myktamap-extras.json` est embarqué localement dans le KMZ généré (= fichier 100 % local) et parsé localement à l'import (`extraireKmz` puis `JSON.parse` sur le contenu blob). Aucun fetch externe. **NETWORK_AUDIT inchangé** sur le fond — mise à jour des dates et de la version affichée uniquement.

</details>

<details id="v1-17-0">
<summary><strong>🗓️ 24/05/2026 — 🚀 v1.17.0 : Générateur accessible — Mode Simple + Légende plan-level</strong></summary>

Release MINOR (bump Y : 1.16.x → 1.17.0). Refonte UX du Générateur 📦 Créer / Modifier un plan : ajout d'un mode **Simple** focalisé débutants + nouvelle source de vérité **`plan.customLegend`** pour partager la personnalisation de légende avec tous les utilisateurs d'un plan.

### 🚀 Step 1 — Mode Simple / Avancé du Générateur

Switcher segmented control en haut de la modale, persistance sticky en localStorage (`myktamap_planner_mode`, default `simple` au premier launch).

**Mode Simple** (strict minimum) :

- 📋 Métadonnées : nom, version, auteur (optionnel)
- 🖼️ Image principale : upload OU canvas vierge avec dims + couleur (4 presets sépia/blanc/gris/noir, 500-12000 px)
- 🏗️ M-LVL (multi-niveau) — checkbox toujours visible (option courte mais structurante)
- 🧱 V2 (tiledV2) — checkbox visible quand image dispo (cf `_majVisibiliteCheckboxV2`)
- Auto-chargement des icônes built-in au boot du mode Simple (sinon ZIP sans icônes → markers data layer cassés au load)

**Mode Avancé** (= comportement v1.16.x complet) :

- Tout ce qui précède + carte de collision + calques image + calques données + tracking + icônes custom + géoréférencement GPS + **🏷️ Légende du plan** (nouveau, cf step 2)

**Marqueurs `data-planner-advanced="1"`** : appliqué dans le HTML sur les 5 sections complètes (Calques image, Calques données, Tracking, Icônes, Géoréférencement) + la nouvelle section Légende plan-level + la row collision intra-Images. Règle CSS unique : `#kta-planner-corps[data-planner-mode="simple"] [data-planner-advanced="1"] { display: none !important }`.

**Mode Modifier forcé en Avancé** : quand l'utilisateur charge un ZIP existant via le drop zone ou le file picker (`_chargerZipModifier`), `_plannerMode = "modifier"` → `_appliquerPlannerMode("avance")` est appelé dans `_preRemplirFormulaire`, et le switcher est masqué via `style.display = "none"`. Évite de perdre les customs / dataLayers / imageLayers / icons custom du plan source (passer en Simple les écraserait silencieusement au `_genererZip`).

### 🏷️ Step 2 — Éditeur légende plan-level (Avancé only)

Nouvelle section dédiée « 🏷️ Légende du plan » dans le mode Avancé. Embed l'état dans `plan-config.json > plan.customLegend` (cascade niveau plan : appliquée à tous les utilisateurs qui chargeront ce plan, surchargeable par leur session).

**Architecture sans modifier `legendCustomization.js`** :

L'éditeur `LegendCustomization.ouvrirEditeur` est conçu pour muter la session courante. Pour l'utiliser sur un state plan-level, on applique un **pattern de swap** :

```js
function _ouvrirEditeurLegendePlan() {
  // 1. Sauvegarde de la session courante
  const savedSession = LC.getSessionState();
  // 2. Charge le state plan dans la session pour permettre l'édition
  LC.loadSessionState(_plannerPlanLegend || null);
  // 3. Ouvre l'éditeur (qui mute la session)
  LC.ouvrirEditeur({
    onClose: function() {
      // 4. Capture du state édité
      _plannerPlanLegend = _plannerLegendStateNormalize(LC.getSessionState());
      // 5. Restore la session vraie
      LC.loadSessionState(savedSession);
      // 6. Refresh status display
      _plannerLegendStatus();
    }
  });
}
```

**Normalisation `_plannerLegendStateNormalize`** : retourne `null` si tous les arrays/objects sont vides (zéro override). Évite de polluer le `plan-config.json` avec un `customLegend: { labels:{}, hidden:{}, customEntries:[] }` inutile (cache PWA bumpé pour rien chez les utilisateurs).

**Status display dynamique** : « ✏️ Personnalisée : N renommés · M masqués · K customs » (en accent ambre charte) ou « ✏️ Aucune personnalisation (cascade défaut MKM) » (en gris muted).

**Boutons** : ✏️ Modifier la légende du plan + 🔄 Reset (avec `confirm()` natif).

**Pre-fill en mode Modifier** : `_preRemplirFormulaire` lit `config.plan.customLegend` du ZIP source et pré-remplit `_plannerPlanLegend` via la même normalisation. Permet l'édition itérative du plan sans repartir de zéro.

**Embed au `_genererZip`** : juste après les autres flags conditionnels (multiLevel, tiledV2, georef) → `if (_plannerPlanLegend) planObj.customLegend = _plannerPlanLegend`. Rétro-compat absolue : champ totalement absent sinon, les versions ≤ v1.16.x ignorent un champ inconnu sans broncher (pattern multiLevel).

### 📂 Sources de vérité v1.17.0

- `version.json` → `"v1.17.0"`
- `js/copyright.js` > `__MKM__.build` → `"v1.17.0"`
- `sw.js` > `CACHE_NAME` → `"myktamap-cache-v1.17.0"`
- Aucun nouveau fichier — modifs internes à `js/createConf.js` (~300 lignes ajoutées : 6 nouvelles fonctions top-level + handlers + 1 nouvelle section HTML) et `css/style.css` (~140 lignes ajoutées : switcher + section légende + variants thème clair)

### 🛡️ Confidentialité

Aucune nouvelle surface réseau. Le mode Simple/Avancé est un toggle UI local (persisté en localStorage). L'éditeur légende plan-level réutilise l'éditeur existant (qui mute la session locale, restaurée au close du swap). La nouvelle source de vérité `plan-config.json > plan.customLegend` reste un fichier 100% local embarqué dans le ZIP MyKTAMap. **NETWORK_AUDIT inchangé** sur le fond — mise à jour des dates et de la version affichée uniquement.

</details>

<details id="v1-16-1">
<summary><strong>🗓️ 24/05/2026 — 🩹 v1.16.1 : Hotfix auto-save PAR PLAN (slot localStorage indexé par planId)</strong></summary>

Hotfix **PATCH** (bump Z : 1.16.0 → 1.16.1). Une seule modification structurelle, mais avec un fort impact UX terrain.

### 🎯 Problème résolu

Avant v1.16.1, `SessionPersist` écrivait dans un **slot unique** `localStorage["myktamap_session_v1"]`. Quand l'utilisateur switchait de plan, le helper `onPlanLoaded` détectait le mismatch `planId` et faisait **`clear()`** systématiquement → la session du plan précédent était écrasée par celle du plan courant. Conséquence : pour récupérer la session d'un plan déjà visité dans la journée, il fallait **obligatoirement passer par un snapshot** (Backup IDB) — alors qu'on aurait juste voulu retomber sur l'état d'avant en revenant naturellement sur le plan.

### 💾 Nouvelle structure localStorage

**Slot PAR PLAN** indexé par `planId` :

| Avant v1.16.1 | Depuis v1.16.1 |
|---|---|
| `myktamap_session_v1` (un seul, écrasé au switch) | `myktamap_session_v1_<planId>` (N slots indépendants) |

Helper interne dans `sessionPersist.js` :

```js
const STORAGE_PREFIX  = "myktamap_session_v1_";
function _storageKeyFor(planId) {
  if (!planId) return null;
  return STORAGE_PREFIX + planId;
}
const STORAGE_KEY_LEGACY = "myktamap_session_v1";   // pour migration uniquement
```

Toutes les opérations (`save`, `getSaved`, `clear`, lecture initiale) ciblent désormais `_storageKeyFor(_currentPlanId)`. Le wipe automatique au mismatch dans `onPlanLoaded` est supprimé — chaque plan garde sa session en parallèle dans son slot dédié.

### 🔄 Migration transparente (pas de perte au upgrade)

Au boot, `_migrerAncienSlotUniqueSiBesoin()` :

1. Lit `localStorage["myktamap_session_v1"]` (ancien slot)
2. Si payload valide avec `planId` :
   - Calcule la nouvelle clé `_storageKeyFor(payload.planId)`
   - Si un slot per-plan plus récent existe déjà → garde le récent, supprime l'ancien
   - Sinon → copie le legacy dans la nouvelle clé puis supprime le legacy
3. Si payload corrompu ou sans planId → suppression silencieuse

L'utilisateur qui upgrade depuis v1.16.0 (ou antérieur) ne perd **rien** : sa session active continue à fonctionner dans le nouveau format.

### 📦 SessionBackups aligné

- `_readCurrentSessionPayload()` lit en priorité le slot per-plan du planId courant, fallback sur l'ancien slot unique si pas encore migré
- `restore(id)` écrit le payload dans la clé `myktamap_session_v1_ + targetPlanId` (extrait de `entry.payload.planId` ou `entry.planId`), puis appelle `PlanRegistry.setLastPlanId(targetPlanId)` avant le `location.reload()` pour basculer automatiquement sur le bon plan

### 🏷️ Sources de vérité v1.16.1

- `version.json` → `"v1.16.1"`
- `js/copyright.js` > `__MKM__.build` → `"v1.16.1"`
- `sw.js` > `CACHE_NAME` → `"myktamap-cache-v1.16.1"`
- Aucun nouveau fichier — modifs internes à `js/sessionPersist.js` et `js/sessionBackups.js`

### 🛡️ Confidentialité

Aucune nouvelle surface réseau. La modification est purement structurelle au niveau localStorage local. **NETWORK_AUDIT inchangé** sur le fond — mise à jour des dates et de la version affichée uniquement.

</details>

<details id="v1-16-0">
<summary><strong>🗓️ 24/05/2026 — 🚀 v1.16.0 : Cycle « UX & filet de sécurité » — Notes, Légende personnalisable, Favoris, Backup multi-rotations sessions</strong></summary>

Release MINOR (bump Y : 1.15.0 → 1.16.0). **4 features majeures qui se complètent** + plusieurs polishs UI conséquents.

### 📝 Step 1 — Notes (description) sur zones / tracés / structures

Bouton « Note » dans la popup de chaque élément (session + data layer readonly). Helper `window.attacherNotePopup(layer, getDescr, setDescr, titreType, opts)` dans `utils.js` :
- Mode `edit` (session) : textarea multiligne + bouton 💾 Sauver + HistoryManager.record + `SessionPersist.save({ force: true })`
- Mode `readonly` (data layer KMZ) : juste affichage texte avec `white-space: pre-wrap`

**Ghost polyline transparente épaisse** (weight + 14 px, opacity 0, `bubblingMouseEvents: false`) ajoutée par-dessus les polylines visibles pour augmenter la zone cliquable sans toucher au rendu visuel. Skip ghost/popup quand un mode édition est actif (sinon clics map interceptés) → `window._aucunModeEditionActif()` helper + `window._kta_syncAllNoteUiForModeChange()` au toggle.

**Fix structural majeur** dans `structures.js > renderStructures` : la branche `if (s === currentStructure)` n'était pas correctement fermée → tout le rendu "closed structure" était dans la branche in-progress → ghost installé sur la structure EN COURS DE TRACÉ → impossible de continuer le tracé. Réorganisation en `if (s === currentStructure) { preview } else { closed + ghost + popup }`.

**Roundtrip complet** :
- Session JSON : `JSON.stringify` préserve le champ `description` ajouté
- KMZ : `<description>` CDATA via `_emitDescriptionCdata` (kmzExport) + parse vers `road.description` / `zone.description` / `structure.description` (kmzImport)
- GPX : déjà géré par `<cmt>` / `<desc>` sur tracks/waypoints

### 🏷️ Step 2 — Légende personnalisable

Nouveau module `js/legendCustomization.js` (~600 lignes IIFE) avec **cascade 3 niveaux** :

| Niveau | Source | Mutabilité |
|---|---|---|
| **session** | `SessionPersist payload.customLegend` | éditable par l'user via UI |
| **plan** | `PLAN_CONFIG.customLegend` | défini par l'auteur du plan (édition manuelle JSON pour v1.16.0) |
| **default** | hardcodé charte MKM dans le module | source de vérité |

**4 catégories** : `icones` / `traces` / `zones` / `structures`. **Renommage**, **masquage**, et **entrées custom**.

**Entrées custom DESSINABLES** (innovation majeure) : chaque custom a un champ `geometry: "polyline" | "polygon"` (pour structures, choix utilisateur ; auto pour traces=polyline et zones=polygon). Style resolvers :
- `road.js > _resolveRoadStyle(type)` — fallback sur `LegendCustomization.findCustomEntry(type).lineColor`
- `zones.js > _resolveZoneStyle(type)` — fallback sur `e.fillColor` + `e.borderColor`
- `structures.js > _resolveStructureStyle(type)` — choisit polyline-like ou polygon-like selon `e.geometry`
- `structures.js > _isPolylineType(type)` — consulte LC pour les customs

**Boutons sidebar dynamiques** : injection automatique dans les groupes traces/zones/structures de la sidebar via `_injecterBoutonsCustomSidebar()` (inséré entre les types built-in et les outils ✅/🧹 grâce au marker `data-type-action="1"`). Hook `LC.onCustomEntriesChange` pour refresh live.

**UI éditeur** : panel inline dans la modale Export PNG (`_peuplerLegendCustom`) + bouton ✏️ **Modifier** dans la fenêtre 🗺️ Légende mode carte (`afficherLegende`) qui ouvre `LC.ouvrirEditeur({ onChange, onClose })` (modale dédiée standalone z-index 100050).

**Persistance** : ajoute le champ `customLegend` au payload `SessionPersist` (rétrocompat OK, null si vide).

### 🎛️ Step 2-flyout — Pivot UI scalabilité (panel latéral)

Pour les groupes traces / zones / structures, **remplace la cascade verticale** (qui débordait l'écran avec beaucoup de customs) par un **PANEL latéral** adjacent au bouton principal :

- Position calculée via `getBoundingClientRect()` + listeners resize/scroll → suit la sidebar quelque soit PC / mobile portrait / mobile landscape
- `max-height` et `max-width` en **pixels réels** (pas en `vh` instable sur iOS Safari)
- **Header sticky** pour les longues listes (`position: sticky; top: 0`)
- Scrollbar custom webkit + Firefox `scrollbar-width: thin`
- Marker `useFlyout: true` + `lcCat` + `customActivator` + nouveau hook `dynamicSousActions: () => [...]` (utilisé par le groupe Favoris pour liste dynamique)

**Bouton ✅ Valider dans Tracés** ajouté (qui n'en avait pas, équivalent strict d'un re-clic sur le type actif via `_fermerModeRoad`). Cohérence des 3 groupes :
```
[types built-in] + [séparateur] + [customs ✨] + [✅ Valider/Fermer] + [🧹 Effacer]
```

### ⭐ Step 3 — Favoris points

Nouveau module `js/favoris.js` (~180 lignes). API publique :
```js
window.Favoris = {
  loadPlan(planId), getAll(), isFav(pointId), findByPointId(id),
  add(snapshot), remove(pointId), toggle(snapshot), onChange(fn)
};
```

**Stockage `localStorage["myktamap_favoris_v1"]`** indexé par planId. **Snapshots complets** des points (id, nom, x, y, tag, layerId, layerLabel) → résilience si le point est déplacé ou supprimé du data layer.

**Bouton ⭐ Favori** dans la popup des POI (popup HTML construit par `utils.js > buildPointPopupHtml`, signature étendue avec `layerInfo`). État inactif ☆ (ambre atténué) ↔ actif ⭐ (ambre saturé + bordure marquée). Toggle inline via `window.toggleFavoriPoint(...)` + refresh in-place du libellé dans toutes les popups ouvertes.

**Groupe sidebar ⭐ Favoris** **position topleft** (juste après la pastille M-LVL, AVANT les autres groupes accordéon). Pattern flyout avec `dynamicSousActions: () => Favoris.getAll().map(...)` recalculé à chaque ouverture. Click sur un favori → `_allerVersFavori` : `map.setView` + flash circleMarker orange 3s + tentative d'ouvrir la popup du marker original (matching coords plan < 0.5 px).

### 📦 Step 4 — Backup multi-rotations sessions (10 FIFO IDB)

Nouveau module `js/sessionBackups.js` (~280 lignes). API publique :
```js
window.SessionBackups = {
  init(), snapshot(reason), listAll(), restore(id),
  remove(id), clearAll(), onChange(fn)
};
```

**Stockage IndexedDB** : DB `myktamap_backups` v1 / store `backups` / key `id` (timestamp) / max 10 entries FIFO (rotation auto via `_enforceLimit`).

**4 triggers** :
1. **Auto périodique** : `setInterval` 5 min, hash check djb2 pour skip si rien n'a changé
2. **Au boot** : 2 snapshots — AVANT `_applyRestore` (capture session pré-existante, crucial pour plan switch) + APRÈS restore (point de retour récent)
3. **Avant destructif** : `sessionPersist.js > clear()` appelle `snapshot("before-clear-session")` avant le wipe localStorage
4. **Manuel** : bouton 📆 Snapshot maintenant dans la modale Session active

**UI section 📦 Backups récents** dans la modale 📊 Détails de session (`refonteInterface.js > _afficherModaleSessionDetail`) :
- **Filtrée sur plan courant** (via `b.planId === window._currentLoadedPlanId`)
- Badge avec compteur + sous-info `(+N autres plans)` si snapshots existent en IDB pour d'autres plans
- Liste compacte (`.kta-backups-list` : `flex-direction: row, padding 4px 0`) : date FR + counts + reason + boutons [↻ Restaurer] [🗑️]
- Boutons d'action : 📆 Snapshot maintenant + 🗑️ Tout vider
- **Restore par reload** : écrit le payload dans `localStorage["myktamap_session_v1"]` → `location.reload()` → SessionPersist restaure naturellement

### 🧭 Hotfix thème clair compass widget

Le widget compass (mode réduit map) avait son fond hardcodé `rgba(26,31,46,0.88)` (charte dark) sans override theme-light → en mode clair, bloc sombre incongru sur fond beige. Nouveaux overrides `body.kta-theme-light .kta-compass-widget*` : fond `rgba(253,248,235,0.92)` (--kta-light-bg-elevated), bordure ambre charte, bouton close lisible (`--kta-light-text-muted`), texte cardinal `--kta-light-accent-hover` saturé pour contraste.

### 💬 Garde-fous « Changer de plan » reformulés

Les 2 modales (clic titre/rose des vents → home, et clic plan spécifique dans le switcher) affichaient « **Les données non exportées seront perdues** ». Avec SessionPersist auto-save par plan + SessionBackups 10 snapshots IDB, ce message est trompeur. Reformulation :

```
🗂️ Charger un autre plan

Session actuellement active sur le plan en cours :
  • N points
  • M tracés
  • ...

✅ La session du plan courant est sauvegardée et sera restaurée
à ton retour sur ce plan.

📦 Les 10 derniers snapshots restent dispos dans
📊 Détails de session › Backups pour revenir à un état antérieur.

Charger « X » ?

[Annuler] [📚 Charger]
```

Icône ⚠️ → 🗂️ (informatif au lieu d'alarmant). Bouton « Charger quand même » → « 📚 Charger ».

### 📂 Sources de vérité v1.16.0

- `version.json` → `"v1.16.0"`
- `js/copyright.js` > `__MKM__.build` → `"v1.16.0"`
- `sw.js` > `CACHE_NAME` → `"myktamap-cache-v1.16.0"`
- 3 nouveaux fichiers ajoutés à `ASSETS_TO_CACHE` : `js/legendCustomization.js`, `js/favoris.js`, `js/sessionBackups.js`
- 3 nouvelles balises `<script>` insérées dans `index.html` après `utils.js`

### 🛡️ Confidentialité

Aucun nouveau call réseau. Backups en IndexedDB local (`myktamap_backups`), favoris en localStorage (`myktamap_favoris_v1`), LegendCustomization persiste dans le payload SessionPersist déjà existant (`myktamap_session_v1`). **NETWORK_AUDIT inchangé** sur le fond — mise à jour des dates et de la version affichée uniquement.

</details>

<details id="v1-15-0">
<summary><strong>🗓️ 24/05/2026 — 🚀 v1.15.0 : 📤 Import GPX → ZIP MyKTAMap + consolidation cycle v1.14.x</strong></summary>

Release MINOR (bump Y : 1.14.x → 1.15.0). Consolidation du cycle v1.14.x complet (toutes les features depuis v1.13.0) + **nouveau module dédié `js/gpxImport.js`** pour reconvertir un GPX MyKTAMap en ZIP MyKTAMap utilisable.

### 📂 Import unifié 3 formats (drop zone home + générateur)

| Format | Pipeline |
|---|---|
| `.zip` | Chargement classique d'un plan MyKTAMap existant |
| `.kmz` | `window.afficherImporterKmz(file)` — reconversion avec image plan + icônes + annotations préservées (cf v1.14.20) |
| `.gpx` | **NOUVEAU** `window.afficherImporterGpx(file)` — canvas vierge auto-calibré sur les bounds GPS + annotations |

### 🆕 Nouveau module `js/gpxImport.js` (~310 lignes)

Pendant exact de `js/kmzImport.js` pour le format GPX. API :

```js
window.GpxImport = {
  estGpxMyktamap,       // détection signature MyKTAMap
  extraireGpx,          // file → { gpxDoc, parsed }
  extraireBoundsGps,    // parsed → { latMin/Max, lngMin/Max }
  genererCanvasVierge,  // (w, h, color) → PNG Blob
  ingestParsed,         // (parsed, transform, opts) → { points, roads, stats }
  genererZipMyktamap    // (opts) → { blob, stats }
};
```

**Spécificité GPX vs KMZ** : un GPX n'a pas d'image plan. Le module **génère un canvas vierge** aux dimensions choisies par l'user (4000×4000 défaut, 4 couleurs sépia/blanc/gris/noir) avec calibrage GPS auto-déduit des bounds :

- Coin BL canvas (x=0, y=H) ↔ `(lat_min, lng_min)`
- Coin TR canvas (x=W, y=0) ↔ `(lat_max, lng_max)`
- Marge 5 % autour pour éviter les bords

Plan-config.json embarque `plan.georef = { pointA, pointB }` → propagé vers `KmzExport.setCalibration` au load (pattern v1.14.20). User peut remplacer le canvas par une vraie image en mode Modifier le plan.

### 🎴 Nouvelle modale UI `_afficherImporterGpx` (createConf.js)

Mirror visuel de `_afficherImporterKmz` (`.kta-kmz-imp-boite` + `.kta-aide-section` + `.kta-conv-drop`). Étapes : upload → analyse → résumé bounds+nb wpts/trks+détection MyKTAMap → config (nom/version/auteur/dimensions/couleur/fallback tag-type/V2/M-LVL) → génération ZIP.

Exposée via `window.afficherImporterGpx`.

### 🔧 Check up `gpxIO.js` — 3 fixes mineurs pour roundtrip parfait

1. **Export tracks** : ajout de `<desc>` (description du tracé, perdue avant ce fix)
2. **Parse tracks** : extraction `<desc>` → `track.desc`
3. **Roundtrip jonction** : ajout de `"jonction"` dans `validTypes` (avant ce fix, un tracé jonction exporté revenait en chemin)

### ↻ Round-trip MyKTAMap GPX

Un GPX exporté MyKTAMap puis ré-importé via 📤 Import GPX restaure :

- Tags points (`<sym>` / `<type>`)
- Types tracés (principal / secondaire / chemin / itinerary / **jonction**)
- Niveaux M-LVL (`<cmt>MyKTAMap level=N</cmt>`)
- Descriptions waypoints **et** tracks
- Nom du plan (`<metadata><name>`)

### 📂 Sources de vérité

- `version.json` → `"v1.15.0"`
- `js/copyright.js` > `__MKM__.build` → `"v1.15.0"`
- `sw.js` > `CACHE_NAME` → `"myktamap-cache-v1.15.0-gpx-import"`
- Nouveau fichier `js/gpxImport.js` ajouté à `ASSETS_TO_CACHE`
- `<script src="js/gpxImport.js">` inséré dans `index.html` après `gpxIO.js`

### 🛡️ Confidentialité

Module 100 % local. Seul fetch externe : `icon/<tag>.png` same-origin (déjà cached SW, marche offline) pour restaurer les icônes des tags ingérés. Aucun nouveau call vers un domaine tiers. `NETWORK_AUDIT` encart dédié + footer maj.

</details>

<details id="v1-14-0">
<summary><strong>🗓️ 23/05/2026 — 🚀 v1.14.0 → v1.14.20 : 📤📥 GPX I/O + 📡 Export externe unifié + 📂 Import unifié + 🔒 Verrouiller + KMZ flow ré-import complet + géoréf embarqué</strong></summary>

Cycle complet `v1.14.x` (20 versions intermédiaires hotfix + features) consolidé en une entrée. Highlights :

### 📤📥 GPX import + export (v1.14.0)

Nouveau module `js/gpxIO.js` (~360 lignes IIFE) — format GPX 1.1 standard (compatible TopoDroid, OsmAnd, Avenza, GPSies, Strava, Garmin). Réutilise intégralement le calibrage KMZ existant. **Export** : nouvel onglet 📤 GPX dans 💾 Enregistrer session. **Import** : sous-action 📤 dans ⬇️ Charger, ajout aux annotations session avec snapshot HistoryManager (Ctrl+Z annule).

### 📡 Onglet Export externe unifié (v1.14.1)

Les anciens onglets « 🌍 KMZ » et « 📤 GPX » sont fusionnés en un seul « 📡 Export externe ». Calibrage GPS 2 points saisi UNE seule fois, partagé entre les 2 formats. Sélecteur pills KMZ / GPX persisté en localStorage.

### 🔄 Toggle thème = reload propre (v1.14.2)

Au changement clair ↔ sombre : `location.reload()` complet après persistance localStorage. Évite les bugs résiduels d'affichage sur le bandeau top / modales chargées avant le toggle. Toggle retiré du mode map, exclusif à Configuration home. Confirmation user via modale custom charte.

### 📥 Modale Import unifiée (v1.14.5 → v1.14.17, refonte itérative)

Les 2 sous-actions « 📥 Session » + « 📤 GPX » du menu ⬇️ Charger sont fusionnées en une seule « 📥 Importer » qui ouvre une modale à 2 choix gros boutons (pattern Export PNG). Refactorisée plusieurs fois pour stabilité (cards-en-grille → onglets → conv-sens pattern final).

### 🔒 Bouton Verrouiller (v1.14.11)

Remplace l'ancien 🔌 Arrêt (qui ne servait à rien — `window.close()` refusé par les navigateurs sur onglet web). Si PIN configuré : cleanup modules actifs (tracker GPS, mode urgence, replay, OOM, lost mode) puis `location.reload()` → la gate PIN s'affiche au boot. Si pas de PIN : modale info qui propose d'en créer un via ⚙️ Configuration.

### 🌍 KMZ flow ré-import complet (v1.14.20)

- **Restauration icônes** : `genererZipMyktamap` accepte `opts.assets` et copie `files/icons/<tag>.png` du KMZ vers `icon/<tag>.png` du ZIP + mapping `planConfig.icons`. Si tag track manque → fetch fallback depuis l'app.
- **Détection tag/type via styleUrl** : Points (`#point_<tag>`), Roads (`#road_<type>`), Zones (`#zone_<type>`), Structures (`#structure_<sous-type>`). Avant ce fix, seules les structures étaient détectées.
- **Description en CDATA** : Google Earth interprétait `<description>` en HTML — les `\n` étaient invisibles. Fix : wrap en `<![CDATA[ ]]>` + `\n → <br/>` à l'export, inverse à l'import.
- **Options V2 + M-LVL** dans la modale d'import KMZ — re-tilage de l'image plate vers tuiles 512×512 + flag multi-niveau.

### 🌐 Géoréférencement embarqué + drop zone unifié (v1.14.20)

- Nouvelle section « 🌐 Géoréférencement GPS » dans ⚙️ Configuration mode map — 8 inputs Point A + Point B persistés via `KmzExport.setCalibration(planId, c)` — auto-rempli dans 📡 Export externe.
- Champ optionnel `plan.georef = { pointA, pointB }` dans `plan-config.json` (générateur + KMZ import). Propagé automatiquement au load via `main.js > _propagerGeorefVersKmzExport(planId)`.
- Drop zone home + générateur acceptent `.zip` ET `.kmz` (route auto vers `afficherImporterKmz`).

### 🗑️ Retrait de l'ancienne interface (v1.14.19)

La nouvelle interface (refonte v1 : header bar + sidebars unifiées + status bar) est désormais imposée pour tout le monde. Le flag `myktamap_legacy_interface` est nettoyé automatiquement au boot.

### 🎨 Refactor modales custom charte (v1.14.6 → v1.14.10)

Remplacement des `confirm()` natifs (toggle thème, lock, etc.) par des modales custom MyKTAMap (jaune charte sur primary, rouge brique sur destructif, bleu charte sur neutre). Variants theme light intégraux.

### 💻 Modale Générateur mieux gérée sur PC (v1.14.20)

Layout 2 colonnes en PC ≥1280px (col-left / col-right / col-full). Largeur 1100px sur PC. Géoréférencement GPS optionnel dans le générateur (embarqué dans `plan.georef`).

### 🐛 Multiples fixes UX

- Modale alerte trop longue (containment 88vh + scroll interne)
- Popup data layer en mode clair (specificité `!important`)
- Modale session restaurée en mode clair
- Contrôles Leaflet (zoom + calques) même fond que sidebar
- Bouton Verrouiller fond blanc opaque
- Sticky `:hover` désactivé sur tactile via `@media (hover: hover)`
- Modale Conversion V2 (pattern containment)
- Modale Import KMZ (pattern containment)

### 📂 Sources

`version.json`, `js/copyright.js > __MKM__.build`, `sw.js > CACHE_NAME` → tous synchronisés sur la version courante. Modules ajoutés à `ASSETS_TO_CACHE` au fil des versions : `themeManager.js` + `gpxIO.js` (v1.14), `gpxImport.js` (v1.15), `legendCustomization.js` + `favoris.js` + `sessionBackups.js` (v1.16).

</details>

<details id="v1-13-0">
<summary><strong>🗓️ 23/05/2026 — 🚀 v1.13.0 : Thème CLAIR global + Itinéraire mode urgence réactivé + Fix hauteurs modales</strong></summary>

### 🎨 Thème CLAIR — scope GLOBAL

Module `js/themeManager.js` (~150 lignes IIFE) → `window.ThemeManager = { init, getCurrent, setTheme, toggleTheme, onChange, isLight }`. Toggle ☀️/🌙 à 2 endroits synchronisés :

- (a) sidebar gauche → groupe ⚙️ Paramètres → sous-action (mode carte)
- (b) modale Configuration home → checkbox « ☀️ Activer le thème CLAIR »

Les 2 pointent sur `localStorage["myktamap_theme_v1"]`. *Note : depuis v1.14.2, le toggle est exclusivement dans Configuration home + reload propre au changement.*

**Palette claire** :

| Variable CSS | Couleur | Usage |
|---|---|---|
| `--kta-light-bg` | `#f0e8d8` | Body (beige cataphile) |
| `--kta-light-bg-bar` | `#c9b88f` | Header + footer + icônes sidebar |
| `--kta-light-bg-elevated` | `#fdf8eb` | Modales (presque blanc) |
| `--kta-light-accent` | `#f4c542` | Jaune charte (conservé) |

**Scope final** = toute l'app sauf 2 exceptions :
- Splash KARMA cinématique au boot
- Viewer photos plein écran (cohérent pour lecture)

Application sur `<html>` + `<body>` (critique pour matcher les modales appendées à `documentElement`). ~1200 lignes CSS overrides avec `!important` (pour battre les styles inline injectés par les modules JS).

### 🗺️ Mode urgence — itinéraire réactivé par défaut

L'itinéraire est désormais affiché par défaut dans le mode urgence (toggle retirée du header). L'anti-crash JPG géant est géré séparément depuis v1.12.0.

### 📏 Fix hauteur modales courtes (88vh → auto)

Pattern `height: auto !important; max-height: 90vh !important;` appliqué sur 6 modales courtes (Niveaux / Légende / Jonction / Iti / Lost / Enregistrer session) — fix le bug récurrent « modal trop long » sur mobile portrait.

</details>

---

## 📄 Licence

`CC BY-NC-SA 4.0` — Usage non commercial / Partage à l'identique. Voir [LICENSE](LICENSE) à la racine.

> Usage commercial interdit sans accord écrit préalable. Pour toute question, contacter l'auteur via le repo.

**Crédits librairies & algorithmes** — 🍃 Leaflet (cartographie) · 📦 JSZip (archives) · 📤 jsPDF (PDF imprimable) · 🧭 Dijkstra (chemin court) · 🌐 GPX 1.1 standard (interop outdoor).
