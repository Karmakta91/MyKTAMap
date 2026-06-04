# 📘 MyKTAMap

> Application web de **cartographie souterraine** — visualisation, annotation et déplacement simulé sur plan image (carrières, galeries, sites souterrains / industriels).

**🌍 Environnements :**
- 🟢 Production : [myktamap.fr](https://myktamap.fr)
- 🔧 Développement : [devmap.is-underground.fr](https://devmap.is-underground.fr)

> ⚠️ Les données présentes sur le site de démonstration sont fictives.

**📦 Version courante** : `v1.34.0` (04/06/2026) — **MINOR E1 : Commandes vocales (BETA)** — nouveau module `js/voiceCommand.js` (~470 LOC) qui ajoute le pilotage vocal de l'app via la **Web Speech API** (`SpeechRecognition` / `webkitSpeechRecognition` pour Safari iOS 14.5+). Pattern **push-to-talk** : bouton 🎤 flottant en bas à droite (`position: fixed, bottom: 80px + safe-bottom, right: 16px + safe-right`), violet en idle, rouge pulsing en écoute. Click → `recognition.start()` → l'user parle → transcription live affichée dans un overlay top-center semi-transparent avec backdrop-filter blur. **~17 commandes MVP** : Navigation (zoom +/-, centrer, recherche), Actions session (ajouter point, tracker on/off, mode urgence, mode secours), Thème (clair/sombre), Méta (aide, stop, fermer). API extensible `window.VoiceCommand.registerCommand({...})` pour modules tiers. **Activation OPT-IN** : toggle "🎤 Commandes vocales (BETA)" dans modale ⚙️ Réglages (visible UNIQUEMENT si `SpeechRecognition` détecté — Firefox masqué silencieusement). Permission micro demandée à la 1ère utilisation par le navigateur (pas avant). État persisté `localStorage["myktamap_voice_enabled_v1"]`. Modale aide "🎤 Commandes vocales disponibles" liste tous les patterns + label. CSS dédiée `style.css §voix` (~170 LOC) avec animation pulse violet→rouge, variante thème clair, mobile compact.
**📦 v1.33.0-fix1** : HOTFIX carte mini PDF Rapport de sortie utilise `MyKTAMapExporterGenererCanvas`.
**📦 v1.33.0** : MINOR D1 Rapport de sortie — module sessionReport.js ~750 LOC.
**📦 v1.32.1** : PATCH Option C manifest `display: fullscreen` — Android only, iOS limite Apple.
**📦 v1.31.10-fix1** (avant les tentatives v1.32.0 rollback) — HOTFIX 2 bugs incognito KARMA test : (1) Popup `🔐 Authentification renforcée disponible` skip en incognito via `proposerActivation()` ; (2) Bordure violette persistante via `body::before fixed`. Détails dans le commit + `docs/architecture/security-legal.md §86`.
**📦 Précédentes shipped main** : `v1.31.10` (Garde-fou modale confirmation activation) ; `v1.31.9-fix1` (skip PIN+onboard + bordure 5px) ; `v1.31.9` (Toggle home + Quitter) ; `v1.31.8-fix1` (badge mobile + flush + whitelist UnlockGate) ; `v1.31.8` (F2 Mode incognito — shim Storage + IDB) ; `v1.31.7` (F1 Export anonymisé) ; `v1.31.6-fix1` (HOTFIX SW offline) ; `v1.31.1` (perf P7 OOMGuard) ; `v1.31.0` (refactor 9 modules) ; `v1.30.0` (perf boot defer) ; `v1.29.0+fix3` (i18n EN + Secours multi-phases) ; `v1.25.3` (tutoriel Mode Secours).
**📜 Licence** : `CC BY-NC-SA 4.0` (usage commercial interdit sans accord écrit)

---

## 📑 Sommaire

1. [🚀 Dernière release — v1.21.1](#-derniere-release--v1211)
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

## 🚀 Dernière release — v1.21.1

📅 **25 mai 2026** — Release **PATCH** (Z+1 sur v1.21.0) : **Audit imports/exports/roundtrips**. Pack consolidé de 9 bugs critiques découverts via audit ciblé (agent général-purpose) après accumulation de 6 hotfixes post-v1.21.0 qui suggérait des patterns latents.

- 🚨 **Sécurité** : bloc GPS du mode urgence ne s'affichait JAMAIS (clone bug fix4 dans `emergencyMode.js`) → critique pour user perdu en cata
- 🎨 **Types custom préservés partout** : 4 bugs liés au traitement de 2e zone des `cust-*` (KMZ export drop, KMZ import regex stricte, GPX import validTypes, Session Avancé filtre)
- 📦 **Embedded data layers** : fronts (polylines) filtrés out, descriptions perdues dans tous les registries runtime
- 🏗️ **Niveaux M-LVL roundtrip KMZ** : levels aplatis à 0 (fonctionnaient uniquement via folder parent, jamais ré-extraits) → fix via `<ExtendedData>` standard KML
- 🧱 **V2 tiling auto-crop** : annotations + georef décalés du cropOffset si auto-crop des marges déclenché

Détails techniques dans le [Journal des modifications](#-journal-des-modifications).

---

## 🚀 Release précédente — v1.21.0

📅 **25 mai 2026** — Release **MINOR** (Y+1 sur v1.20.0) : **Cycle « Stats avancées + QoL UX »**. 4 features qui complètent le polish v1.20.0 :

- 📊 **Export CSV** des annotations (ZIP avec 4 fichiers points/roads/zones/structures, UTF-8 BOM + sep `;` compat Excel)
- 📊 **Graphes camembert** SVG natifs dans Stats globales (4 sections breakdown — coloration charte cohérente avec la carte)
- 🎯 **Raccourcis clavier** E M Z S T L B R (toggle, anti-vol focus, skip si modale ouverte)
- 🎬 **Mode présentation** (touche F) — cache header + sidebars + footer, garde carte + zoom + boussole

Détails techniques dans le [Journal des modifications](#-journal-des-modifications).

---

## 🚀 Release précédente — v1.20.0

📅 **25 mai 2026** — Release **MINOR** (Y+1 sur v1.19.1) : **Cycle complet « Robustesse + Stats + Onboarding + Profil »**. 8 features regroupées en une seule release :

**🛡️ Filet de sécurité & robustesse**

- 🪤 **Skip snapshot identique** : économie FIFO des slots backups (boot sans changement = 0 slot consommé)
- 📋 **Crash report auto IDB** : archive auto des kills mémoire détectés (debug + diagnostic facilité) — nouvelle DB IDB `myktamap_crashes`
- 🛡️ **Clause anti-fork dans Audit** : précision que la garantie de sécurité s'applique uniquement à `myktamap.fr`

**📊 Stats & partage communauté**

- ⭐ **Favoris export/import JSON** : partage cross-appareil de tes POI préférés
- 📊 **Statistiques globales du plan** : modale agrégée session + data layers embedded + **export PDF A4 via jsPDF**

**🎓 Onboarding & profil utilisateur**

- 🎓 **Tutoriel premier-lancement enrichi** (8 cards) : Bienvenue / Charger-créer / Annoter / Tracker GPS / Recherche Ctrl+K + Favoris / Multi-niveau M-LVL / Sauver-partager / Outils annexes — rejouable via 📚 Aide
- 📦 **Export/Import de profil utilisateur COMPLET** : remplace l'ancien export « liste de plans ». 9 sections (user / registry / preferences / favoris / sessions / backups / tutorial / photos POI / crashes). PIN/Face ID + UnlockGate jamais exportés (sécurité). Rétro-compat absolue avec l'ancien format `myktamap-plans-list`. Modale post-import « ✅ Profil importé » avec proposition de reload doux.
- 👤 **Mode profil utilisateur intégré au loader** : nouveau bandeau en-tête (avatar + surnom + bouton ⚙️ Détails). Photo + surnom stockés dans nouvelle DB IDB `myktamap_profile`. Avatar default = initiale colorée déterministe (hash). Modale détails : édition surnom inline + upload/retrait photo + stats agrégées + boutons export/import/reset.

Détails techniques dans le [Journal des modifications](#-journal-des-modifications).

---

## 🚀 Release précédente — v1.19.1

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

<details id="v1-25-3" open>
<summary><strong>🗓️ 27/05/2026 — 🎓 v1.25.3 : Release PATCH onboarding — Carte « 🚨 Mode Secours » ajoutée au tutoriel (22 → 23 cards)</strong></summary>

Release PATCH onboarding (bump Z : 1.25.2 → 1.25.3). Demande KARMA : « rajoute le du coup aussi on onbarding si c'est pas fait » suite à l'audit doc v1.25.2 qui a révélé que le Mode Secours était documenté dans la modale Aide intégrée mais PAS dans le tutoriel premier-lancement.

### 🆕 Carte 13/23 insérée

Position : entre la carte 12 « ⛑️🚨 Modes urgence » et la carte précédente 13 (Recherche Ctrl+K, désormais 14/23). Toutes les cartes 14 → 22 décalées de +1 (14 → 15, etc., jusqu'à 22 → 23). Renumérotation cosmétique des commentaires devs `// ─── X/23 — ` (pas affichés à l'écran).

### 📋 Contenu de la carte

- **Distinction** des 3 modes « urgence » MyKTAMap :
  - ⛑️ Je suis perdu = TOI
  - 🚨 Panique = TOI
  - 🚨 Mode Secours = **QUELQU'UN D'AUTRE** est perdu, tu coordonnes
- **État 1 — CRÉATION** : équipes (palette OTAN), parcours (entrée + intermédiaires + sortie), zones de recherche, itinéraires Pathfinder avec avoidances cross-équipes, niveau M-LVL par équipe, exports 3 formats (PDF / KMZ / `.mkmsec.json`)
- **État 2 — EXÉCUTION TERRAIN** : bouton « 🚀 Lancer le plan », modale sélection rôle, 3 vues Live (👤 Opérateur surface / 🚨 Équipier step-by-step / 🚑 Secouriste libre), 7 statuts d'étape, photos IDB local dédié, timer pause juste, bandeau « 📦 PLAN TERMINÉ »
- **Rapport au fil des étapes** : 3 formats × 3 scopes, disponible en cours d'exécution + après arrêt
- **Hint** : warning single-device + roadmap QR code share v1.27.0+

### 📦 Sources de vérité v1.25.3

- `version.json` → `v1.25.3`
- `js/copyright.js > __MKM__.build` → `v1.25.3`
- `sw.js > CACHE_NAME` → `myktamap-cache-v1.25.3`

Aucun nouveau fichier. Modifs : `js/tutorial.js` uniquement (+~80 lignes : carte 13 + ~25 lignes renumérotation commentaires + 5 lignes doc en tête).

### ⚠️ Action terrain

Ne nécessite PAS de ré-import. Compat 100 % v1.25.2. **Le tutoriel ne s'affiche PAS automatiquement à l'update** (flag `myktamap_tutorial_seen_v1` reste en localStorage). Pour le revoir : 📖 Documentation → bouton 🎓 (re-jouer le tutoriel). Reload pour récupérer via service worker (cache bump auto).

</details>

<details id="v1-25-2">
<summary><strong>🗓️ 27/05/2026 — 📚 v1.25.2 : Release PATCH docs — Mode Secours complètes (Phase 3 + tous patchs v1.23.2 → v1.25.1)</strong></summary>

Release PATCH docs (bump Z : 1.25.1 → 1.25.2). Demande KARMA suite à v1.25.1 : « fait un tour des doc voir si le mode secours est bien détaillé pour mode édition et 3 mode opérateur ».

**Audit** lancé via agent dédié a identifié 4 fichiers avec manques critiques (sur 5 audités). Bilan : seul `README.md` était à jour, les 3 fichiers cachés (`docs/README_USER.md`, `docs/AI_CONTEXT.md`, `js/interface.js > afficherAide`) + `docs/CLAUDE.md` (libre) manquaient de la documentation Phase 3.

**AUCUN changement code applicatif**. Pure release docs.

### 📖 `docs/CLAUDE.md`

Nouvelle section **§67 « Mode Secours — Évolutions v1.23.2 → v1.25.1 »** (~400 lignes) consolidant 11 sous-sections :

- §67.1 v1.23.2 Feature G Ctrl+K → assigner POI à équipe
- §67.2 v1.23.3 Niveau M-LVL assignable par équipe
- §67.3 v1.23.4 Format `.mkmsec.json` + fix Heatmap Régler
- §67.4 v1.23.5 Modale preview AVANT import + mini-légende PDF
- §67.5 v1.23.6 Pause configurable cross-feature
- §67.6 v1.23.7 Fix CSS card équipe M-LVL
- §67.7 v1.24.0 **Phase 3 EXÉCUTION complète** (data model `scenario.execution` + 7+1 statuts + store IDB photos + 3 vues Live + timer pause juste)
- §67.8 v1.24.1 Bouton « 👤 Retour Opérateur »
- §67.9 v1.24.2 3 fixes CSS Phase 3
- §67.10 v1.25.1 Fix renforcé header sticky + toast controllerchange gated
- §67.11 v1.25.0 **Rapport au fil des étapes** (3 formats × 3 scopes, helpers, format `.mkmsec.report.json`)

Plus nouvelle **§68 « Correction §32.7 — Format calibrage KMZ FLAT (pas NESTÉ) »** qui résout TODO depuis v1.23.0.

### 📖 `docs/README_USER.md`

- Correction de 2 mentions « Roadmap Phase 3 (v1.24.0) à venir » → marquées comme **LIVRÉ ✅** avec lien vers nouvelle section
- **Nouvelle section « 🚨 Mode Secours Phase 3 — Exploitation terrain temps réel »** (~250 lignes) :
  - Pivot architectural 2 états CRÉATION/EXÉCUTION
  - Bouton « 🚀 Lancer » + bandeau dynamique 4 états
  - Modale sélection rôle (3 rôles)
  - 3 vues Live détaillées avec ASCII mockups
  - Tableau 8 statuts d'étape
  - Rapport au fil des étapes 3 formats × 3 scopes
  - Cycle complet typique 5 phases
  - Roadmap suite Phase 3 (v1.26.0 import / v1.27.0 QR code / v1.28.0 seuils stress)

### 📖 `docs/AI_CONTEXT.md`

- Bullet feature **« 🚨 Mode Secours »** ajouté à la liste anti-hallucination (résumé exhaustif Phases 1+2+3 + mots-clés indexation)
- **Nouvelle section recette « M. 🚨 Mode Secours — Coordination d'équipes »** (~200 lignes) :
  - Distinction tableau comparatif des 3 modes urgence (⛑️ / 🚨 panique / 🚨 Secours)
  - Architecture conceptuelle 2 états
  - Workflow type complet 5 phases
  - Tableau 7+1 statuts
  - Tableau persistance & stockage
  - Distinction `.mkmsec.json` vs `.mkmsec.report.json`
  - Recommandations « quand utiliser quel rôle » pour assister IA tierce

### 📖 `js/interface.js > afficherAide`

Nouvelle section **« 🚨 Mode Secours — Coordination d'équipes (depuis v1.22.0) »** dans la modale Aide intégrée à l'app (📚 Documentation). Structure 2 sous-blocs colorés :

- 📝 **État 1 — CRÉATION** (12 grille-items)
- 🚀 **État 2 — EXÉCUTION TERRAIN** (7 grille-items)

Avec : mention 7+1 statuts, store IDB dédié, warning single-device, recommandation boussole physique.

### 📦 Sources de vérité v1.25.2

- `version.json` → `v1.25.2`
- `js/copyright.js > __MKM__.build` → `v1.25.2`
- `sw.js > CACHE_NAME` → `myktamap-cache-v1.25.2`

Aucun nouveau fichier. Modifs : `docs/CLAUDE.md` (+~400) + `docs/README_USER.md` (+~250) + `docs/AI_CONTEXT.md` (+~210) + `js/interface.js` (+~60). `README.md` était déjà complet pour les releases v1.22.0 → v1.25.1.

### 🛡️ Confidentialité

Aucune nouvelle surface réseau, aucune nouvelle permission, aucun changement de code applicatif. Pure update documentation.

### ⚠️ Action terrain

Ne nécessite PAS de ré-import. Compat 100 % v1.25.1 (uniquement docs). Bump justifié car 3 fichiers cachés modifiés (README_USER.md + AI_CONTEXT.md + interface.js — pas docs/CLAUDE.md qui n'est pas dans `ASSETS_TO_CACHE`). Reload pour récupérer via service worker (cache bump auto).

</details>

<details id="v1-25-1">
<summary><strong>🗓️ 26/05/2026 — 🩹 v1.25.1 : Release PATCH 3 fixes UX (toast controllerchange silencé + bandeau spacing + header sticky renforcé)</strong></summary>

Release PATCH (bump Z : 1.25.0 → 1.25.1). 3 bugs UX remontés KARMA terrain.

### 🐛 Bug 1 — Toast `controllerchange` spammait en dev

**Root cause** : le hook `navigator.serviceWorker.addEventListener("controllerchange")` ajouté en v1.20.0 affichait un toast « 🔄 Mise à jour mineure appliquée — assets fraîchement rechargés. » à CHAQUE prise de contrôle d'un nouveau SW. Sur les cycles dev fréquents (v1.23.x → v1.24.0 → v1.24.1 ... 10+ updates en 24h), spam visuel massif. KARMA qualifie de « popup style log de dev ».

**Fix** : Toast conditionnel à `APP_CONFIG.debugMode === true` + prefix `[DEBUG]` dans le message. En prod (debugMode OFF), aucun toast visible. Le `console.log("[PWA] 🔄 Nouveau SW...")` reste TOUJOURS actif pour traçabilité dans 🐛 Logs détaillés.

### 🐛 Bug 2 — Menu Opérateur passe derrière header sticky

**Root cause** : fix v1.24.2 (background opaque + box-shadow + z-index 10) ne suffisait pas. Un stacking context conflictuel laissait passer le scroll des cards en filigrane derrière le header sticky en vue Live Mode Opérateur.

**Fix renforcement triple** :

```css
.kta-secours-live-header {
  background: #1a1f2e;           /* SOLID, pas gradient */
  z-index: 100;                   /* 10 → 100 */
  isolation: isolate;             /* nouveau stacking context forcé */
  border-bottom-width: 2px;       /* démarcation visuelle */
  box-shadow: 0 6px 14px rgba(0, 0, 0, 0.55);  /* relief prononcé */
}
```

### 🐛 Bug 3 — Bandeau CTA touche les boutons header

**Root cause** : `.kta-secours-lancer-bandeau` n'avait que `margin-bottom: 14px`, pas de `margin-top`. Visuellement collé contre les boutons header (← Liste / titre / 🗺️ Voir sur carte).

**Fix** : Ajout `margin-top: 14px` pour aérer.

### 🌞 Variant thème clair

`body.kta-theme-light .kta-secours-live-header` reçoit aussi le renforcement v1.25.1 : `border-bottom-width: 2px` + `box-shadow: 0 6px 14px rgba(80, 60, 30, 0.30)`.

### 📦 Sources de vérité v1.25.1

- `version.json` → `v1.25.1`
- `js/copyright.js > __MKM__.build` → `v1.25.1`
- `sw.js > CACHE_NAME` → `myktamap-cache-v1.25.1`

Aucun nouveau fichier. Modifs : `index.html` (toast controllerchange conditionnel debugMode) + `css/style.css` (~20 lignes).

### ⚠️ Action terrain

Ne nécessite PAS de ré-import. Compat 100 % v1.25.0 (toast `controllerchange` ré-activable en activant debugMode si besoin de traçabilité dev). Reload pour récupérer via service worker (cache bump auto).

</details>

<details id="v1-25-0">
<summary><strong>🗓️ 26/05/2026 — 📤 v1.25.0 : Release MINOR — Rapport au fil des étapes pour les 3 rôles (Opérateur / Équipier / Secouriste)</strong></summary>

Release MINOR (bump Y : 1.24.x → 1.25.0). Demande KARMA : « on doit pouvoir générer un rapport au fil des étapes pour chaque type Operator, Equipier, Secour ».

### 📤 3 formats disponibles

Modale unifiée `_afficherModaleRapport(scenarioId, scope)` avec choix :

| Format | Description |
|---|---|
| 📄 **PDF imprimable** | A4 portrait via jsPDF — briefing global page 1 + page texte étapes par équipe + page photos en annexe (grille 2 cols, ratio 4:3) |
| 📦 **`.mkmsec.report.json`** | Data structuré autonome avec photos en base64 (si cochée) — prévu pour re-import device opérateur en v1.26.0 |
| 📋 **Texte plain** | Markdown-like copié au presse-papier (navigator.clipboard + fallback execCommand) — pour partage Discord/SMS/mail rapide |

### 🎯 3 scopes selon le rôle

Bouton « 📤 Rapport » dans le footer de chaque vue Live avec scope adapté :

- **👤 Mode Opérateur surface** → « 📤 Rapport global » : TOUTES les équipes + leurs étapes + photos
- **🚨 Mode Équipier** → « 📤 Rapport » : SON équipe uniquement (parcours individuel)
- **🚑 Mode Secouriste libre** → « 📤 Rapport » : SES notes libres chronologiques

### 📂 Bouton depuis vue Edit aussi

Bandeau « 📤 Rapport » accessible depuis la vue Édition tant que l'exécution existe (active OU terminée). Nouveau bandeau bleu **« 📦 PLAN TERMINÉ »** qui apparaît dans la vue Edit quand le plan a été arrêté, avec boutons « 📤 Voir le rapport historique » + « 🚀 Relancer ». Permet de re-générer le rapport à tout moment après l'arrêt.

### 🕐 Rapport en cours d'exécution

Le rapport est **généré à l'instant**, reflète l'état COURANT du scénario (observations + statuts + photos + timestamps). Permet rapport intermédiaire pour relève PC chef, briefing en cours de mission, passation cross-device. Réutilisable autant de fois que nécessaire.

### 📸 Photos incluses par défaut

Checkbox « 📸 Inclure les photos » COCHÉE par défaut dans la modale. Affichage live du nombre de photos attachées au scénario. Décochable pour rapport compact.

- **PDF** : page dédiée par équipe avec grille 2 cols (cellule 4:3 ratio + label « Étape N · 234 KB » sous chaque photo)
- **JSON** : `dataUrl` base64 pour autonomie complète (gros mais portable)
- **Texte** : juste compteur « 📸 N photos attachées »

### 🆕 4 nouveaux helpers API publique `window.SecoursMode`

```js
genererRapportData(scenarioId, scope, opts)   // async → objet structuré
genererRapportTexte(reportData)                // sync → texte markdown-like
genererRapportPDF(reportData)                  // sync → PDF via jsPDF
exporterRapportJSON(reportData)                // sync → téléchargement JSON
copierRapportTexte(reportData)                 // async → presse-papier
```

Format `.mkmsec.report.json` versionné (`version: 1`) prêt pour re-import futur en v1.26.0 (consolidation cross-device).

### 🎨 Modale UI charte

- Boîte 540px max + bordure gauche bleu `#8cb4ff`
- Aperçu compact en haut (titre rôle + nombre étapes + % progression + durée)
- Checkbox photos avec hint dynamique
- 3 boutons format colorés (PDF primary jaune / JSON+Texte secondary) avec icône 22px + label gras + sous-titre italique
- Toast feedback à chaque action
- Backdrop click + Échap = annuler

### 🛡️ Confidentialité

Aucune nouvelle surface réseau, aucune nouvelle permission. Génération PDF/JSON/texte **100 % client-side** (jsPDF déjà chargé, Blob URLs locales, FileReader pour base64 photos, `navigator.clipboard` avec fallback `execCommand`). Photos lues depuis le store IDB local existant `myktamap_secours_photos` (depuis v1.24.0). Aucun fetch ajouté.

### 📦 Sources de vérité v1.25.0

- `version.json` → `v1.25.0`
- `js/copyright.js > __MKM__.build` → `v1.25.0`
- `sw.js > CACHE_NAME` → `myktamap-cache-v1.25.0`

Aucun nouveau fichier. Modifs :
- `js/secoursMode.js` (+~660 lignes : helpers data/texte/JSON + helper PDF + modale UI + 4 boutons UI + 2 handlers)
- `css/style.css` (+~135 lignes : bandeau archive + modale rapport + variants thème clair)

### 🛣️ Roadmap suite Phase 3

- **v1.26.0** : Import `.mkmsec.report.json` sur device opérateur (consolidation cross-device — opérateur surface importe les rapports de chaque équipe au retour pour fusionner les observations dans un rapport global unique)
- **v1.27.0+** : QR code share unidirectionnel terrain sans réseau
- **v1.28.0+** : Seuils stress visuels (timer rouge après 4h)

### ⚠️ Action terrain

Ne nécessite PAS de ré-import. Compat 100 % v1.24.2 (helpers et UI additifs, format `.mkmsec.report.json` v1 nouveau, ancien format `.mkmsec.json` v1.23.4 inchangé). Reload pour récupérer via service worker (cache bump auto).

</details>

<details id="v1-24-2">
<summary><strong>🗓️ 26/05/2026 — 🩹 v1.24.2 : Release PATCH 3 fixes CSS Phase 3 (textarea overflow + header sticky transparent)</strong></summary>

Release PATCH (bump Z : 1.24.1 → 1.24.2). 3 bugs CSS Phase 3 remontés KARMA terrain :

1. « bug affichage en mode équipe, le tape ici pour observation à cette étape sort du cadre »
2. « pareil pour secouriste »
3. « bug du modal opérateur tout défile derrière l'entête Opérateur surface : scénario »

### 🐛 Bugs 1+2 — Textarea observations déborde

**Root cause** : la classe `.kta-secours-live-etape-textarea` (utilisée dans la vue Live Mode Équipe ET Mode Secouriste) avait `width: 100%` SANS `box-sizing: border-box`. Le padding `8px 10px` (20px horizontal total) + bordure `1px` (2px horizontal total) ajoutaient **+22px** à la largeur intrinsèque → débordement horizontal.

**Fix** :

```css
.kta-secours-live-etape-textarea {
  box-sizing: border-box;   /* indispensable */
  width: 100%;
  max-width: 100%;          /* garde-fou double protection */
  ...
}
```

Pattern à appliquer **partout** sur inputs/textareas fluides en `width: 100%`. Documenté dans le commentaire CSS.

### 🐛 Bug 3 — Scroll derrière header sticky Opérateur

**Root cause** : `.kta-secours-live-header` avait `background: linear-gradient(rgba(...,0.85), rgba(...,0.95))` semi-transparent. En vue Opérateur (grille verticale cards qui scroll), les cards passaient en filigrane derrière le header sticky → texte « Opérateur surface · scénario · N équipes » illisible quand l'user scrollait.

**Fix** : background **OPAQUE** + bordure + box-shadow pour démarquer + `z-index: 10` (au lieu de 2) pour passer au-dessus des cards sans z-index spécifique :

```css
.kta-secours-live-header {
  background: linear-gradient(135deg, #1f2740, #0e1424);
  border: 1px solid rgba(255, 255, 255, 0.12);
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.45);
  z-index: 10;
  ...
}
```

### 🌞 Variant thème clair

Le variant `body.kta-theme-light .kta-secours-live-header` reçoit aussi le fix : `box-shadow: 0 4px 8px rgba(80, 60, 30, 0.20)` (ocre clair) + `border-color: var(--kta-light-border-strong)` pour cohérence visuelle avec le thème sombre.

### 📦 Sources de vérité v1.24.2

- `version.json` → `v1.24.2`
- `js/copyright.js > __MKM__.build` → `v1.24.2`
- `sw.js > CACHE_NAME` → `myktamap-cache-v1.24.2`

Aucun nouveau fichier, aucun changement JS. Modifs : `css/style.css` uniquement (~15 lignes).

### ⚠️ Action terrain

Ne nécessite PAS de ré-import. Compat 100 % v1.24.1 (pur fix CSS additif). Reload pour récupérer via service worker (cache bump auto).

</details>

<details id="v1-24-1">
<summary><strong>🗓️ 26/05/2026 — 🩹 v1.24.1 : Release PATCH fix UX Phase 3 — Bouton « 👤 Retour Opérateur » après « Prendre la main »</strong></summary>

Release PATCH (bump Z : 1.24.0 → 1.24.1). Bug remonté KARMA terrain immédiatement après v1.24.0 : « premier bug en mode opérateur je rentre sur le tableau alpha et rentre des informations. sauf que je peux pas revenir en arriére pour continuer ».

### 🐛 Root cause

Le bouton « 🚨 Prendre la main » dans la vue Live Mode Opérateur bascule `execution.role` de `"operateur"` à `"equipe"` + set `currentEquipeId`, mais **sans mémoriser le rôle précédent**. Une fois en mode Équipe, AUCUN bouton ne permettait de revenir vers la vue Opérateur surface pour superviser les autres équipes. L'user était piégé :
- soit faire « ⏸️ Voir l'édition » + relancer (qui aurait réinitialisé)
- soit pire, terminer le plan

### ✅ Fix — 2 modifs minimales et propres

```js
// (1) Au clic "Prendre la main", stockage du rôle d'origine
s.execution._previousRole = s.execution.role;          // "operateur" ou "secouriste"
s.execution._previousEquipeId = s.execution.currentEquipeId;
s.execution.role = "equipe";
s.execution.currentEquipeId = equipeId;

// (2) Bouton conditionnel dans le footer vue Live Mode Équipe
const retourBtn = previousRole
  ? '<button data-action="live-retour-previous-role">👤 Retour Opérateur</button>'
  : '';

// (3) Handler retour : restore role + clean flags
s.execution.role = prevRole;
s.execution.currentEquipeId = s.execution._previousEquipeId || null;
delete s.execution._previousRole;
delete s.execution._previousEquipeId;
```

### 💡 Toast amélioré

Au moment de « Prendre la main » : `🚨 Mode Équipe : Alpha (bouton « 👤 Retour Opérateur » pour revenir)` → guide l'user vers l'action de retour dès la transition.

### 🛡️ Préservation de l'état

Les flags `_previousRole` / `_previousEquipeId` sont stockés dans `s.execution` → persistent à travers **reload, plan switch, fermeture/réouverture modale Mode Secours, bascule edit ↔ live**. L'user peut prendre la main sur Alpha, fermer son téléphone, revenir 30min après, et trouver le bouton retour Opérateur intact.

### 🧹 Cleanup au retour

`delete s.execution._previousRole` + `delete s.execution._previousEquipeId` au moment du retour explicite, pour éviter d'avoir le bouton « Retour » qui reste affiché à tort si l'user repasse plus tard par cette équipe via une nouvelle « Prendre la main ».

### 📦 Sources de vérité v1.24.1

- `version.json` → `v1.24.1`
- `js/copyright.js > __MKM__.build` → `v1.24.1`
- `sw.js > CACHE_NAME` → `myktamap-cache-v1.24.1`

Aucun nouveau fichier. Modifs : `js/secoursMode.js` uniquement (+~30 lignes : stockage flags dans handler `live-op-prendre-main` + bouton conditionnel dans footer vue Équipe + handler `live-retour-previous-role`).

### ⚠️ Action terrain

Ne nécessite PAS de ré-import. Compat 100 % v1.24.0 (flags optionnels — absent = bouton retour invisible = comportement v1.24.0 strict). Si tu étais bloqué en mode Équipe après « Prendre la main » sur v1.24.0, le bouton retour apparaîtra automatiquement APRÈS un nouveau « Prendre la main » suivant le reload v1.24.1. Reload pour récupérer via service worker (cache bump auto).

</details>

<details id="v1-24-0">
<summary><strong>🗓️ 26/05/2026 — 🚀 v1.24.0 : Release MINOR — Mode Secours Phase 3 (exploitation terrain : bouton Lancer + 3 vues Live)</strong></summary>

Release MINOR (bump Y : 1.23.x → 1.24.0). Demande KARMA : « maintenant on doit pouvoir Lancer le plan de secour et dire en gros, je suis dans l'Equipe X, je suis opérateur de surface ... ca charge le plan, etape par etape, ou on peux commenter au fil du suivi de partout etape 1 : RAS, Etape 2 : passage récent ... ».

Pivot architectural majeur : le Mode Secours passe d'un outil de planning (Phases 1+2 = création/édition + cross-app) à un outil de **coordination opérationnelle temps réel**. Un scénario a maintenant 2 états : CRÉATION (vue Edit existante) et EXÉCUTION (nouvelle vue Live).

### 📊 Modèle de données `scenario.execution`

Persisté dans le scénario localStorage existant (`myktamap_secours_v1_<planId>`). Pas de nouvelle clé. Structure :

```js
scenario.execution = {
  active:          boolean,
  startedAt:       ISO,
  endedAt:         ISO | null,
  pausedAt:        ISO | null,
  pausedTotalMs:   number,
  role:            "operateur" | "equipe" | "secouriste",
  currentEquipeId: string | null,
  etapes: {
    [equipeId]: [
      {
        type:          "entree" | "interm" | "sortie",
        idx:           number,
        label:         string,
        observations:  string,
        statut:        "pending" | "ras" | "suspect" | "bloque"
                     | "indice" | "aide" | "demi-tour" | "victime",
        photoIds:      [string, ...],
        startedAt:     ISO | null,
        completedAt:   ISO | null
      }
    ],
    _notes_libres: [
      { id, ts, statut, texte, photoIds }
    ]
  }
}
```

Helpers CRUD : `lancerExecution / arreterExecution / pauseExecution / updateEtape / marquerEtapeStatut / getExecutionDureeMs / ajouterNoteLibre / updateNoteLibre / supprimerNoteLibre / _buildEtapesPourEquipe / _estExecutionActive / _getEtapesEquipe`.

### ⚡ TABLEAU_STATUTS (7+1 statuts)

| ID | Emoji | Label | Couleur | Severity |
|---|---|---|---|---|
| `pending` | • | En attente | gris | 0 |
| `ras` | 🟢 | RAS | vert | 0 |
| `suspect` | 🟡 | Suspect | jaune | 1 |
| `bloque` | ⬛ | Bloqué | gris foncé | 1 |
| `indice` | 🔵 | Indice | bleu | 1 |
| `aide` | 🟠 | Aide demandée | orange | 2 |
| `demi-tour` | 🟣 | Demi-tour forcé | violet | 1 |
| `victime` | 🚨 | Victime trouvée | rouge clignotant | 3 |

Constante extensible — ajouter une entry suffit (rendu UI + colors + futur PDF report suivent automatiquement).

### 📸 Store IDB dédié `myktamap_secours_photos`

Nouveau module `js/secoursPhotos.js` (~430 lignes IIFE) → `window.MyKTAMapSecoursPhotos`. Séparé du store POI photos (`myktamap_photos`, cf §42) pour cleanup/compteurs indépendants. Architecture :

- **DB** : `myktamap_secours_photos` v1
- **Store** : `photos` (keyPath `id`)
- **3 indexes** : `by_scenario` / `by_scenario_equipe` / `by_scenario_equipe_step`
- **Key composite** : scenarioId + equipeId + stepIdx
- **Sentinel** : `stepIdx = -1` pour notes libres (mode secouriste)
- **Limites** : max 5 photos par étape, compression auto canvas JPEG q85 max 1920px

API : `addPhoto / getPhoto / getBlob / getObjectUrl / getPhotosForEtape|Equipe|Scenario / countPhotosForEtape|Scenario / deletePhoto|Etape|Scenario / clearAll / compressBlob / generateId`. Init eager au boot (non-bloquant, pre-warm IDB).

### 🚀 Bandeau « Lancer le plan »

Nouveau bandeau en haut de la vue Edit, 3 états dynamiques :

- **Disabled** (aucune équipe) : hint « Ajoute au moins une équipe pour pouvoir lancer le plan »
- **CTA jaune** : « 🚀 Prêt à déclencher le plan de secours ? » + gros bouton « 🚀 Lancer le plan de secours »
- **Active vert** : dot pulsant `kta-secours-pulse-green` + « 🟢 PLAN ACTIF — `<Rôle>` · ⏱️ Lancé depuis Xh YYmin » + boutons « ▶️ Reprendre la vue Live » / « ⏹️ Arrêter »

### 🎬 Modale sélection rôle

Au clic « 🚀 Lancer », modale charte Promise-based avec 3 rôles cliquables (radio + description) :

- **👤 Opérateur de surface** : « Tu coordonnes depuis le PC chef. Tu vois toutes les équipes en parallèle, tu peux éditer leurs observations en supervision. »
- **🚨 Équipe sur le terrain** : « Tu fais partie d'une équipe assignée. Tu suis ton parcours étape par étape et tu commentes en live. » + dropdown sélection équipe (activé si radio sélectionné)
- **🚑 Secouriste libre** : « Tu interviens sans équipe pré-assignée (renfort ponctuel, reconnaissance). Tu prends des notes libres avec timestamps. »

Hint : « 💡 Tu pourras changer de rôle plus tard sans perdre les observations déjà enregistrées. » Boutons « ❌ Annuler » / « ✓ Démarrer maintenant ». Backdrop click + Échap = annuler.

### 🚨 Vue Live — Mode Équipe (step-by-step)

Pour l'équipe sur le terrain qui suit son parcours :

- **Header sticky** : swatch couleur OTAN + nom équipe + Étape X/N + timer global ⏱️
- **Stepper visuel cliquable** : emoji statut + numéro (badge current jaune, done vert, pending gris)
- **Bloc étape courante** : titre type (🚪 ENTRÉE / 📍 ÉTAPE N / 🚪 SORTIE) + label POI + statut courant (bordure couleur) + textarea observations 2000 chars + 7 boutons statuts rapides + bouton 📸 Photo (X/5) + bouton 🎯 Recentrer carte + mini-grille photos miniatures cliquables (viewer plein écran réutilisé)
- **Navigation prev/next** : au passage suivant sans statut explicite → auto-marqué RAS par défaut
- **Footer** : Pause / Voir édition / Terminer le plan

### 👤 Vue Live — Mode Opérateur surface

Vue d'ensemble pour le PC chef :

- **Header** : timer global + compteur équipes
- **Grille responsive cards par équipe** (260px min, auto-fill) : swatch couleur + nom + badge « ✓ TERMINÉE » si applicable + barre de progression % (0-100) + statut le + sévère + dernière obs snippet (80 chars) + dernier timestamp + 2 boutons « 👁️ Détails » / « 🚨 Prendre la main »
- **Cards spéciales** :
  - 🚨 Victime trouvée = ROUGE PULSANT (animation 1.2s `kta-secours-pulse-red`)
  - 🟠 Aide demandée = orange + lueur box-shadow
  - ✓ Terminée = opacity 0.75
- **Modale détails read-only** = liste chronologique des étapes avec ts + statut + obs
- **Bouton 🗺️ Voir carte globale** = masque modale + render overlay

### 🚑 Vue Live — Mode Secouriste libre

Mode simple pour renfort/reconnaissance sans équipe pré-assignée :

- **Header vert** : timer + compteur notes
- **Bloc « 📝 Ajouter une note »** : textarea + 7 boutons rapides (clic = note ajoutée + reset textarea)
- **Liste chronologique DESC** : ts + statut emoji + texte + ✕ supprimer
- Persistance dans `s.execution.etapes._notes_libres`

### ⏸️ Timer global + pause

Calcul juste excluant les temps de pause cumulés (`pausedTotalMs`). Au pause/reprise, calcul du segment écoulé + addition. Format `Xh YYmin` / `YYmin SSs` / `Ss`. Re-render timer toutes les 1s via `data-live-timer="duree"` (pas de re-render complet de la vue → évite flash + perte focus textarea en cours de saisie).

### 🛡️ Confidentialité

Aucune nouvelle surface réseau. 1 nouvelle DB IDB locale `myktamap_secours_photos` (lecture/écriture client uniquement, pas de fetch externe). Pas de nouveau localStorage key (réutilise `myktamap_secours_v1_<planId>` existant). Photos compressées localement via canvas (pas de transmission cloud).

### 📦 Sources de vérité v1.24.0

- `version.json` → `v1.24.0`
- `js/copyright.js > __MKM__.build` → `v1.24.0`
- `sw.js > CACHE_NAME` → `myktamap-cache-v1.24.0`

1 nouveau fichier `js/secoursPhotos.js` ajouté à `ASSETS_TO_CACHE` + balise script dans `index.html` après `secoursMode.js`. Modifs :
- `js/secoursMode.js` (+~900 lignes : data model + 7 statuts + bandeau + modale lancer + 3 vues Live + handlers)
- `css/style.css` (+~470 lignes : Phase 3 complète + variants thème clair + responsive mobile portrait)

### 🛣️ Roadmap suite Phase 3

- **v1.25.0** : Rapport final PDF complet (avec photos en annexe) + export `.mkmsec.report.json`
- **v1.26.0** : Import rapport sur device opérateur (consolidation cross-device)
- **v1.27.0+** : QR code share unidirectionnel (terrain sans réseau)
- **v1.28.0+** : Seuils stress visuels (timer rouge après 4h, alertes auto)

### ⚠️ Action terrain

Ne nécessite PAS de ré-import. Compat 100 % v1.23.7 (champ `scenario.execution` optionnel — absent = mode CRÉATION seul, comportement v1.23.x strict). Tous les helpers et vues sont additifs. Reload pour récupérer via service worker (cache bump auto).

</details>

<details id="v1-23-7">
<summary><strong>🗓️ 26/05/2026 — 🐛 v1.23.7 : Release PATCH fix CSS — Header card équipe M-LVL : bouton 🗑️ sortait du cadre</strong></summary>

Release PATCH (bump Z : 1.23.6 → 1.23.7). Bug remonté KARMA terrain : « bug affichage du modal secour en mode M-LVL la poubelle pour supprimer sors du cadre a cause de l'icone M-LVL ».

### 🐛 Root cause

Le header de la card équipe (`.kta-secours-groupe-header`) était en `display: flex; align-items: center` SANS `flex-wrap`. L'input nom (`flex: 1`) n'avait pas `min-width: 0` (donc refusait de se compresser sous sa taille intrinsèque). Le bouton 🗑️ supprimer n'avait pas de `flex-shrink: 0` explicite. Conséquence sur mobile portrait étroit avec le chip M-LVL `🏗️ RDC` (depuis v1.23.3) :

```
[swatch] [input nom flex:1] [chip 🏗️ RDC] [🗑️]   ← largeur somme > viewport
```

→ overflow visible → le bouton supprimer 🗑️ sortait du cadre de la card.

### ✅ Fix 3 axes en CSS pur

```css
.kta-secours-groupe-header {
  flex-wrap: wrap;        /* autorise wrap si manque de place */
}
.kta-secours-groupe-nom {
  flex: 1 1 120px;        /* flex-basis 120px = compromis lisibilité */
  min-width: 0;           /* indispensable pour permettre la compression flex */
}
.kta-secours-groupe-header > button[data-action="del-groupe"] {
  flex-shrink: 0;         /* le bouton garde sa taille intrinsèque, jamais compressé */
}
```

### 💡 Leçon pour futures cards à header flex multi-items

Pattern réutilisable : **toujours combiner** `flex-wrap: wrap` + `min-width: 0` sur l'item flexible + `flex-shrink: 0` sur les items critiques (boutons d'action). À garder en tête pour toutes les futures cards équipes/équipements/items où on a swatch + nom + chips + actions.

### 📦 Sources de vérité v1.23.7

- `version.json` → `v1.23.7`
- `js/copyright.js > __MKM__.build` → `v1.23.7`
- `sw.js > CACHE_NAME` → `myktamap-cache-v1.23.7`

Aucun nouveau fichier, aucun changement JS. Modifs : `css/style.css` uniquement (+~15 lignes au bloc `.kta-secours-groupe-header` existant).

### ⚠️ Action terrain

Ne nécessite PAS de ré-import. Compat 100 % v1.23.6 (pur fix CSS additif). Reload pour récupérer via service worker (cache bump auto).

</details>

<details id="v1-23-6">
<summary><strong>🗓️ 26/05/2026 — 🛑 v1.23.6 : Release PATCH — Réglage pause par point accessible depuis Mode Secours</strong></summary>

Release PATCH (bump Z : 1.23.5 → 1.23.6). Demande KARMA terrain : « rend la possibilité de regler le temps de pause par point, que on a fait dans itineraire, depuis le module secour ».

### 🛑 Bloc Pause dans Mode Secours

Nouveau bloc « 🛑 Pause entre les arrêts » dans la section 📝 Contexte de la vue Edit (juste après le bloc 🔍 Outils d'analyse / heatmap) :

- Checkbox « Activer la pause par point »
- Input number 0-120 min (step 1)
- Hint explicatif « *S'applique aussi à l'itinéraire principal de l'app.* »

Au changement → persiste localStorage + recalcule auto les durées estimées de toutes les équipes du scénario + toast feedback résumant le nombre de durées recalculées.

### 🔧 Setters globaux exposés

`js/interface.js` expose désormais en plus des getters existants :

```js
window.setItiPauseEnabled(bool);   // persiste localStorage
window.setItiPauseMinutes(number); // clamp [0, 120], persiste
```

Permet à Mode Secours (et tout module futur) de modifier les prefs sans dupliquer la logique localStorage. **Pas de side-effect global au set** — le caller est responsable de recalculer ce qui en dépend (cohérent avec le pattern getter/setter du projet).

### 🆕 Helper `_recalculerToutesDureesEquipes(scenarioId)`

Itère les équipes avec itinéraire calculé (`distanceM > 0`), calcule nb waypoints effectif (entrée + intermédiaires + sortie), appelle `window.getItiTempsMinutes(distM, nbWp)` pour la nouvelle durée. Si delta > 0.01 min → update + commit. Retourne le nombre d'équipes mises à jour. Pas async (calcul arithmétique pur) → toast unique résumé.

### ✨ Cohérence cross-feature

Les prefs pause sont les MÊMES entre la modale Itinéraire et la modale Mode Secours (même localStorage keys `myktamap_iti_pause_enabled` + `myktamap_iti_pause_minutes`). Si l'user change la pause depuis Mode Secours → l'itinéraire principal du tracker recalcule sa durée au prochain affichage. Cohérence garantie sans duplication.

### 🛡️ Confidentialité

Aucune nouvelle surface réseau, aucune nouvelle permission. Pure UI lecture/écriture localStorage (clés déjà existantes depuis v1.23.0). Aucun fetch ajouté.

### 📦 Sources de vérité v1.23.6

- `version.json` → `v1.23.6`
- `js/copyright.js > __MKM__.build` → `v1.23.6`
- `sw.js > CACHE_NAME` → `myktamap-cache-v1.23.6`

Aucun nouveau fichier. Modifs :
- `js/interface.js` (+8 lignes : exposition `window.setItiPauseEnabled`/`setItiPauseMinutes`)
- `js/secoursMode.js` (+~95 lignes : `_renderPauseToolBlock` + `_recalculerToutesDureesEquipes` + 2 handlers change)
- `css/style.css` (+~75 lignes : `.kta-secours-pause-row` + `.kta-secours-pause-toggle` + `.kta-secours-pause-input-wrap` + variants light theme)

### ⚠️ Action terrain

Ne nécessite PAS de ré-import. Compat 100 % v1.23.5 (helpers globaux setters ajoutés en additif, getters/comportement legacy strictement préservés). Les scénarios existants gardent leurs `dureeEstimeeMin` actuels — le recalcul auto se déclenche UNIQUEMENT au changement explicite de la pref depuis la nouvelle UI (pas au boot). Reload pour récupérer via service worker (cache bump auto).

</details>

<details id="v1-23-5">
<summary><strong>🗓️ 26/05/2026 — 👁️ v1.23.5 : Release PATCH polish — Modale preview AVANT import .mkmsec.json + mini-légende carte PDF</strong></summary>

Release PATCH (bump Z : 1.23.4 → 1.23.5). Polish UX terrain post-v1.23.4. 2 sujets indépendants :

### 👁️ Modale preview AVANT import `.mkmsec.json`

**Avant v1.23.5** : `parse → confirm() natif si plan différent → injection silencieuse → modale feedback`. Le `confirm()` natif OS cassait la charte (cf §35 doc qui dit qu'on doit basculer en modale Promise-based).

**Depuis v1.23.5** : `parse → modale preview charte → user confirme → injection → modale feedback`. La preview affiche :

- Nom du scénario
- Fichier source
- Date d'export
- Version app source
- Plan source (avec version)
- Liste des équipes (max 8 + « +N autres » si plus) avec couleur OTAN + nb membres + niveau M-LVL + indicateurs zone/parcours
- Bandeau orange détaillé si plan d'origine différent

Boutons « ❌ Annuler » / « ✓ Importer ce scénario ». Backdrop click + Échap = annuler. Évite les imports accidentels.

### 🔧 Refactor JS

`importerScenario(input)` split en 2 fonctions internes :

```js
async function _parsePayloadMkmsec(input) {
  // validation seule, pas d'injection
  return { ok, payload?, warning?, error? };
}

function _appliquerPayloadImport(payload) {
  // injection seule (regénère ids + filtre défensif + push + commit)
  return { ok, scenario };
}
```

`importerScenario` reste exposé en API publique en combinant les 2 (préserve rétro-compat v1.23.4 avec `confirm()` natif legacy pour callers programmatiques sans UI). Le picker UI `_ouvrirImportMkmsecPicker` utilise désormais le flow split + modale preview au milieu.

### 🗺️ Mini-légende intégrée dans la carte PDF Mode Secours

La carte miniature par équipe (implémentée en v1.22.0-fix5 — image plan + overlay zone + entrée vert + sortie rouge/orange boucle + itinéraire dashed + intermédiaires numérotés) reçoit désormais une **mini-légende intégrée bas-droite**.

Pattern WYSIWYG : n'affiche QUE les éléments effectivement présents pour cette équipe (zone polygone OU zone roads, entrée, sortie ou boucle, intermédiaires avec compteur, itinéraire). Rend le brief auto-explicatif pour le secouriste qui n'a jamais ouvert l'app — il comprend immédiatement les codes couleurs en regardant son papier.

**Helper `_drawTeamLegende(ctx, canvasW, canvasH, g, hexColor)`** : dessine sur le canvas 2D. Box blanc semi-opaque (rgba 0.92) avec bordure 1px noire 45% opacité. Pour chaque item : swatch coloré 16×14px + label noir. Swatches adaptés au type (carré fillé + border pour zone polygon, ligne épaisse pour zone roads, ligne dashed pour itinéraire, cercle marker pour entrée/sortie/boucle/intermédiaires). Réutilise `_drawTeamMarker` existant.

### 🛡️ Confidentialité

Aucune nouvelle surface réseau, aucune nouvelle permission. La modale preview est pure UI charte locale (lit le payload déjà parsé en RAM, écrit rien). La mini-légende PDF est dessinée sur le canvas en local (pas de fetch d'icônes externes — tout est trait/forme vectorielle).

### 📦 Sources de vérité v1.23.5

- `version.json` → `v1.23.5`
- `js/copyright.js > __MKM__.build` → `v1.23.5`
- `sw.js > CACHE_NAME` → `myktamap-cache-v1.23.5`

Aucun nouveau fichier. Modifs :
- `js/secoursMode.js` (+~280 lignes : split `_parsePayloadMkmsec`/`_appliquerPayloadImport` + `_afficherPreviewImport` modale charte + `_formatLevelShort` helper + `_drawTeamLegende` helper canvas)
- `css/style.css` (+~125 lignes : `.kta-secours-import-preview-card` + grid + equipes + couleur swatch + meta + variants light theme)

### ⚠️ Action terrain

Ne nécessite PAS de ré-import. Compat 100 % v1.23.4 (modale preview est une amélioration UX du flow existant, format `.mkmsec.json` v1 inchangé). `window.SecoursMode.importerScenario` reste utilisable en programmatique avec le comportement v1.23.4 (confirm() natif si plan différent). Reload pour récupérer via service worker (cache bump auto).

</details>

<details id="v1-23-4">
<summary><strong>🗓️ 26/05/2026 — 📤 v1.23.4 : Release PATCH — Mode Secours : export/import autonome `.mkmsec.json` + fix Heatmap Régler</strong></summary>

Release PATCH (bump Z : 1.23.3 → 1.23.4). Demande KARMA terrain : « on doit pouvoir exporter un plan de secour, que on poura importer sur un autre appareil (sans a avoir a exporter une session full) ca nous servira quoi qu'il arrive pour mode 'operateur chef de surface' et 'secouriste' ».

### 📤 Export `.mkmsec.json`

Nouveau bouton « 📤 Export .mkmsec.json » dans la section 📦 Export d'un scénario (à côté de PDF + KMZ). Génère un JSON autonome avec wrapper extensible :

```js
{
  type:        "myktamap-secours-scenario",
  version:     1,
  exportedAt:  "ISO timestamp",
  appVersion:  "v1.23.4",
  plan:        { id, name, version, imageWidth, imageHeight, multiLevel, availableLevels, scale },
  scenario:    { id, nom, createdAt, updatedAt, context, groupes, pointsCles }
}
```

Filename : `Secours_<nom_slug>_<YYYYMMDD>.mkmsec.json`. Idéal pour partager un plan de secours entre opérateur surface ↔ secouristes via email / Discord / clé USB / AirDrop, sans devoir exporter toute la session (qui peut peser plusieurs Mo avec photos + tuiles).

### 📥 Import `.mkmsec.json`

Nouveau bouton « 📥 Importer un plan » dans la vue LIST du Mode Secours (à côté de « ➕ Nouveau scénario »). File picker accepte `.json` + `.mkmsec` + `.mkmsec.json`. Validation stricte :

- `type === "myktamap-secours-scenario"`
- `version ≤ MKMSEC_FORMAT_VERSION` (= 1)
- `scenario.nom` (string) + `scenario.groupes` (array) requis
- Re-génère un nouvel `id` pour le scénario importé + tous les ids internes des groupes (évite collision si l'user importe plusieurs fois le même fichier)

Si le `plan.id` du scénario importé diffère du plan courant, `confirm()` avec warning détaillé (les coords waypoints/zones n'auront pas le même sens). Filtre défensif anti-pollution : seuls les champs whitelisted du scenario sont gardés (`id, nom, createdAt, updatedAt, context, groupes, pointsCles`).

### ✨ Modale feedback post-import

Modale dédiée (vert succès / rouge erreur) qui affiche :
- nom scénario importé + nombre d'équipes + filename source
- warning éventuel (plan différent) en bandeau orange
- bouton « ✏️ Ouvrir le scénario » qui bascule directement en vue Edit

Sur erreur : message détaillé en monospace (validation, JSON malformé, etc.) + hint « le fichier doit être un .mkmsec.json valide exporté depuis MyKTAMap ».

### 🐛 Fix Heatmap « ⚙️ Régler » disparaissait

Bug remonté KARMA : « bug en mode secours affiche le heatmap n'affiche plus le reglage pourtant ca fonctionnait ». Root cause : condition fragile `_secoursHeatmapActive && MyKTAMapHeatmap.isVisible()` qui devenait `false` dans certains cycles de rendu (notamment après que l'user a effacé la heatmap depuis sa modale dédiée).

Fix : bouton « ⚙️ Régler » TOUJOURS visible dans le bloc Heatmap Mode Secours tant que `window.MyKTAMapHeatmap` est chargé. UX cohérente — l'user n'a plus à chercher où est passé le bouton. Bonus : l'user peut Régler AVANT même d'avoir cliqué Afficher (pour configurer ses sources en amont).

### 🛡️ Confidentialité

Aucune nouvelle surface réseau, aucune nouvelle permission. L'export/import `.mkmsec.json` est 100 % local (Blob URL + file picker natif). Pas de fetch, pas de cloud, pas de stockage tiers. Le user qui veut partager passe par les canaux qu'il choisit (mail, Discord, USB, AirDrop, etc.).

### 📦 Sources de vérité v1.23.4

- `version.json` → `v1.23.4`
- `js/copyright.js > __MKM__.build` → `v1.23.4`
- `sw.js > CACHE_NAME` → `myktamap-cache-v1.23.4`

Aucun nouveau fichier. Modifs : `js/secoursMode.js` (+~140 lignes : `_ouvrirImportMkmsecPicker` + `_afficherResultatImport` + fix `_renderHeatmapToolBlock` + bouton export-mkmsec + bouton import-mkmsec + handlers + 2 exports API publique `window.SecoursMode.exporterScenario/importerScenario`), `css/style.css` (+~13 lignes : `.kta-secours-list-header-actions`).

### ⚠️ Action terrain

Ne nécessite PAS de ré-import. Compat 100 % v1.23.3 (nouveau format MKMSEC v1, ancien format inchangé). Format `.mkmsec.json` versionné via `MKMSEC_FORMAT_VERSION = 1` — futures versions peuvent étendre le wrapper sans casser la rétro-compat. Reload pour récupérer via service worker (cache bump auto).

</details>

<details id="v1-23-3">
<summary><strong>🗓️ 26/05/2026 — 🏗️ v1.23.3 : Release PATCH — Équipe Mode Secours avec level M-LVL assignable</strong></summary>

Release PATCH (bump Z : 1.23.2 → 1.23.3). Bug de logique remonté par KARMA terrain : « on doit pouvoir en plus de l'auto complete crée une équipe et lui assigné une zone sur un niveau ».

### 🏗️ Nouveau champ `g.level` au modèle équipe

Type : `number | null` (null = équipe sans niveau, traversée multi-étages via jonctions).

- Auto-défini depuis `APP_CONFIG.activeLevel` à la création par défaut (cohérent contexte M-LVL)
- Whitelist `updateGroupe` étendue
- `addGroupe(scenarioId, nom, level?)` — signature étendue avec 3e arg optionnel

### 🆕 Mini-modale "➕ Nouvelle équipe" (plans M-LVL uniquement)

Sur plans multi-niveau, "+ Ajouter une équipe" ouvre désormais un mini-prompt :
- Input nom (vide = auto Alpha/Bravo/...)
- Dropdown niveau M-LVL (`availableLevels` + option « — Sans niveau —», pré-set sur `activeLevel`)
- Boutons ✓ Créer + ← Annuler

Plans mono-niveau : comportement v1.22.x strict préservé (ajout direct).

### 🆕 Affichage level dans card équipe

- **Chip** `🏗️ RDC` (ou `+1`, `-1`...) dans le header de la card, à côté du nom (style pill ambré charte)
- **Select éditable** "🏗️ Niveau M-LVL" dans le body (uniquement si M-LVL actif) → changement à n'importe quel moment

### 🐛 Fix Feature E (auto-création par niveau)

Avant : la boucle ne passait pas `level` à `addGroupe` → le constructor lisait `APP_CONFIG.activeLevel` courant → toutes les équipes auto-créées avaient le MÊME level. Maintenant : `addGroupe(s.id, nom, lvl)` → chaque équipe a son level distinct cohérent avec son nom.

### 📦 Sources de vérité v1.23.3

- `version.json` → `v1.23.3`
- `js/copyright.js > __MKM__.build` → `v1.23.3`
- `sw.js > CACHE_NAME` → `myktamap-cache-v1.23.3`

### 📂 Modifs

- `js/secoursMode.js` (+~110 lignes : champ level + mini-prompt + chip + select + handler change-level + fix Feature E)
- `css/style.css` (+~30 lignes : `.kta-secours-groupe-level-chip` + `.kta-secours-newequipe-boite` + variants light theme)

### 🛡️ Confidentialité

Aucune nouvelle surface réseau. Le champ level est purement local (persisté dans le scénario localStorage existant). NETWORK_AUDIT inchangé sur le fond.

</details>

<details id="v1-23-2">
<summary><strong>🗓️ 26/05/2026 — 🎯 v1.23.2 : Release PATCH — Feature G (Phase 2 100%) + Audit UX terrain</strong></summary>

Release PATCH (bump Z : 1.23.1 → 1.23.2). Phase 2 Mode Secours **100% complète** (7/7 features) + 4 fixes UX prioritisés via audit agent dédié.

### 📌 Feature G — Ctrl+K → assigner POI à équipe en 2 clics

Dernière feature de la roadmap §65.12 (Phase 2). Bouton 📌 visible sur chaque résultat point de la recherche unifiée Ctrl+K UNIQUEMENT si Mode Secours est ouvert avec un scénario actif.

- Mini-modale dédiée (z-index 100002) : sélection équipe + role (Entrée/Étape/Sortie)
- Préserve `point.id` → détection boucle entrée=sortie fonctionne via `_samePoint`
- Workflow : Ctrl+K → tape POI → 📌 → choix équipe + role → ✓ → Ctrl+K stays open
- Idéal scénarios urgence multi-équipes avec mêmes 3-4 puits d'accès

### 🐛 4 fixes UX (audit agent dédié post-Phase 2)

| Sévérité | Fix |
|---|---|
| 🔴 **P1** | `.kta-readme-modal-overlay` → `align-items: safe center` (cascade fix v1.23.1 sur la BASE de TOUTES les modales : Aide, KMZ, Stats, Mode Secours, Pick waypoint, Assigner, etc.) |
| 🟠 **P2** | Touch targets `.kta-btn-xs` mobile : media query `(max-width: 480px)` → `min-width: 36px; min-height: 36px` (WCAG 2.5.5 AA) |
| 🟠 **P2** | Cohérence boucle entrée=sortie modale vs carte : `_samePoint` détecté → `data-loop="1"` sur entrée+sortie → border-left orange `#ff8c00` (cohérent avec marker carte ↻ Boucle) |
| 🟠 **P2** | Z-index stack assign-modal vs Ctrl+K : ferme la modale Recherche AVANT d'ouvrir Assigner (snapshot point + label local) — évite stack orphelin si Esc |

### 📊 Phase 2 100% complète

7/7 features livrées (A KML cross-app + B Pathfinder avoidances + C Lost Mode bridge + D Heatmap + E M-LVL auto-équipes + F Favoris quick-pick + G Ctrl+K → assigner). Plus de feature reportée. **Phase 3 (v1.24.0)** reste pour : statut temps réel équipes + QR code share + timer incident + observations terrain.

### 📦 Sources de vérité v1.23.2

- `version.json` → `v1.23.2`
- `js/copyright.js > __MKM__.build` → `v1.23.2`
- `sw.js > CACHE_NAME` → `myktamap-cache-v1.23.2`

### 📂 Modifs

- `js/searchPoints.js` (+~25 lignes : bouton 📌 conditionnel + handler avec close Ctrl+K)
- `js/secoursMode.js` (+~110 lignes : `ouvrirAssignerModale` + détection boucle parcours)
- `css/style.css` (+~135 lignes : Feature G CSS + 4 fixes UX + variants thème clair)

### 🛡️ Confidentialité

Aucune nouvelle surface réseau, aucune nouvelle permission. NETWORK_AUDIT mis à jour ✅.

### 🟢 4 fixes UX reportés à v1.24 (P3 polish)

- Toast unifié (séquence cumulée export KMZ → 1 seul toast avec update)
- `aria-label` globaux sur les 12 boutons icon-only
- Audit contraste light theme 10 couleurs palette OTAN
- Helper `_formatLevel(n)` pour cohérence "RDC" vs "niv 0"

</details>

<details id="v1-23-1">
<summary><strong>🗓️ 26/05/2026 — 🩹 v1.23.1 : Release PATCH — 2 fixes UX post-Phase 2</strong></summary>

Release PATCH (bump Z : 1.23.0 → 1.23.1). 2 fixes UX remontés par KARMA en tests terrain v1.23.0. Aucune nouvelle surface réseau, compat 100% v1.23.0.

### 🐛 Bug 1 — Mode urgence "Panique" modale coupée

Régression CSS détectée. `.kta-emergency-overlay` utilisait `display: flex; align-items: center; overflow-y: auto`. Sur mobile portrait, quand `.kta-emergency-box` dépasse le viewport (≈800-900px avec safe-area + minimap + 4 blocs), `align-items: center` positionne la boîte en débordement par le HAUT. `overflow-y: auto` ne peut scroller QU'EN-DESSOUS de l'origine flex → titre 🚨 + bouton 🔆/🌑 inaccessibles.

**Fix** : `align-items: safe center` (CSS Box Alignment Level 3, Chrome 93+/Safari 16+/FF 88+). Centre si la boîte rentre, bascule auto à `flex-start` sinon → scroll du haut vers le bas accessible. Fallback gracieux `center` sur browsers plus anciens.

### 🐛 Bug 2 — Heatmap ⚙️ Régler déconnecte Mode Secours

Régression UX. `secoursMode.js > config-heatmap-secours` cachait la modale Mode Secours avant d'ouvrir Heatmap, mais aucun mécanisme pour la restaurer → l'user se retrouvait sans modale Mode Secours visible après fermeture de Heatmap.

**Fix** : MutationObserver qui observe la suppression du DOM `#kta-heatmap-modal` (id stable depuis v1.21.2) → restore `_modal.style.display` + re-render edit (pour update label bouton 🔥 Afficher/Masquer si état changé) + disconnect observer (anti-leak). Garde-fou si getElementById retourne null après ouvrirModale.

### 📦 Sources de vérité v1.23.1

- `version.json` → `v1.23.1`
- `js/copyright.js > __MKM__.build` → `v1.23.1`
- `sw.js > CACHE_NAME` → `myktamap-cache-v1.23.1`

### 📂 Modifs

- `css/style.css` (+8 lignes : align-items safe center .kta-emergency-overlay)
- `js/secoursMode.js` (+~20 lignes : MutationObserver dans config-heatmap handler)

### 🛡️ Confidentialité

Aucune nouvelle surface réseau. Les 2 fixes sont purement UX (CSS + DOM observer local). NETWORK_AUDIT mis à jour avec verdict ✅ aucune régression v1.23.1.

</details>

<details id="v1-23-0">
<summary><strong>🗓️ 26/05/2026 — 🚨 v1.23.0 : Release MINOR — Mode Secours Phase 2 (Intégrations & Cross-app)</strong></summary>

Release MINOR (bump Y : 1.22.0 → 1.23.0). 6/7 features Phase 2 livrées + 5 bonus/fixes consolidés. Le Mode Secours passe d'un outil brouillon perso (Phase 1 MVP) à un **vrai outil de coordination opérationnelle** cross-app.

### 6 Features Phase 2 livrées

| # | Feature | Détail |
|---|---|---|
| **A** | 🌍 **KML cross-app complet** | Folder racine 🚨 Secours visible dans Google Earth / OsmAnd / Avenza / Locus. 3 sous-folders nested par équipe (Points / Zone / Itinéraire). Couleurs cohérentes palette OTAN via 43 styles KML. Description riche par folder (membres, distance, durée, statut). |
| **B** | 🚫 **Pathfinder avoidances cross-équipes** | `_collecterAvoidPointsAutresEquipes` passe les waypoints + zones des autres équipes à Pathfinder comme soft constraint. `avoidRadius: 30 px`. Fallback gracieux 2 passes natif + toast warn si chevauchement inévitable. |
| **C** | ⛑️→🚨 **Lost Mode → Secours pre-fill** | Bouton 🚨 dans la modale Lost Mode. Crée auto un scénario avec context.lastKnownPoint + zoneIncertitude + incidentAt + notes auto-composées. Bloc rouge dans la modale Edit avec 🎯 Recentrer + ✕ Retirer. Overlay carte enrichi (cercle pointillé + marker). |
| **D** | 🔥 **Heatmap d'activité Mode Secours** | Bloc orange 🔍 Outils d'analyse avec toggle. Active overlay + appelle `MyKTAMapHeatmap.afficher`. Cas d'usage : visualiser zones probables où le disparu a passé du temps (via timeline tracker importée). |
| **E** | 🏗️ **Auto-création 1 équipe par niveau M-LVL** | Bouton conditionnel "🏗️ Auto : 1 équipe par niveau (N)" visible si M-LVL actif. Crée N équipes nommées "Niveau RDC / +1 / -1" avec couleurs auto-cyclées. |
| **F** | ⭐ **Favoris en accès rapide picker waypoint** | Section ambre dans la mini-modale "📍 Choisir un point" avec chips cliquables (max 8). Clic = applique le waypoint direct (skip search + clic carte). |
| ~~G~~ | ~~Ctrl+K → assigner à équipe~~ | Reportée — la recherche autocomplete est déjà intégrée dans le picker waypoint. |

### 5 Bonus / Fixes

- 🛑 **Pause configurable cross-feature** : `myktamap_iti_pause_enabled` + `myktamap_iti_pause_minutes` localStorage. Section "🛑 Pause entre les arrêts" dans modale Itinéraire avec checkbox + input min. Helper `window.getItiTempsMinutes` partagé entre Itinéraire et Mode Secours.
- 🐛 **Fix georef format mismatch** : accès `pointA.x/y/lat/lng` flat au lieu du faux nested `pointA.plan/pointA.gps` documenté à tort. Aligné avec sessionExporter.js.
- 🗺️ **Plan en fond 60% dans KMZ Mode Secours** : `exporterKMZ` fetch l'image plan via RUNTIME_ASSETS ou HTTP + passe à genererKmz avec imageOpacity:60. GroundOverlay visible dans Google Earth.
- 📁 **KMZ nested folders par catégorie** : restructure du Folder Secours en sous-folders 📍 Points / ⬛ Zone / 🗺️ Itinéraire pour toggle facile dans les apps tierces.
- 🗺️ **Auto-calc itinéraires avant export KMZ** : `Promise.allSettled` sur les équipes sans iti calculé → KMZ complet en 1 clic. Helper async `_recalculerItineraireGroupeAsync`.

### 📦 Sources de vérité v1.23.0

- `version.json` → `v1.23.0`
- `js/copyright.js > __MKM__.build` → `v1.23.0`
- `sw.js > CACHE_NAME` → `myktamap-cache-v1.23.0-secoursP2`
- Aucun nouveau fichier. Modifs : `js/secoursMode.js` (+~1200), `js/kmzExport.js` (+~250 _emitSecoursFolder), `js/lostMode.js` (+~30 getState + bouton), `js/interface.js` (+~70 pause configurable), `css/style.css` (+~400 Phase 2).

### 🛡️ Confidentialité

**Aucune nouvelle surface réseau, aucune nouvelle permission**. Tout local. Avoidances Pathfinder en RAM, KML cross-app embarqué dans le ZIP, Heatmap canvas pur, Favoris localStorage existant. NETWORK_AUDIT mis à jour avec verdict ✅ aucune régression.

### 📊 Roadmap Phase 3 (v1.24.0)

Statut par équipe + QR code share unidirectionnel + timer incident + observations terrain. Reportée à validation Phase 2 KARMA.

</details>

<details id="v1-22-0">
<summary><strong>🗓️ 26/05/2026 — 🚨 v1.22.0 : Release MINOR — Mode Secours Phase 1 MVP (équipes + zones + exports PDF/KMZ)</strong></summary>

Release MINOR (bump Y : 1.21.5 → 1.22.0). Nouveau module `js/secoursMode.js` (~1500 lignes IIFE) : outil opérationnel pour assigner méthodiquement des équipes de recherche à des zones d'un plan cataphile. **Cas d'usage terrain** : une personne portée disparue, plusieurs équipes arrivent en surface, le PC secours assigne chaque équipe à une portion du réseau avec point d'entrée/sortie, itinéraire suggéré et durée estimée.

### 🚨 Bouton sidebar + modale 3 vues

Nouvelle sous-action 🚨 « Mode Secours » dans le groupe 🧭 Tracker (flyout urgences) à côté de ⛑️ Je suis perdu et 🚨 Panique. Modale `.kta-secours-modal-boite` avec 3 vues : **LIST** (scénarios sauvegardés du plan), **CREATE** (stepper léger : nom + notes + heure incident), **EDIT** (free-form 3 sections accordéon : 📝 Contexte, 🚨 Équipes, 📤 Export).

### 💾 Persistance per-plan multi-scénarios

`localStorage["myktamap_secours_v1_<planId>"]` = array de scénarios. Cap FIFO 10 par plan. KARMA validation « Oui — N scénarios sauvegardés par plan » : permet de comparer plusieurs hypothèses (« si parti par l'Est » vs « si par le Sud »).

### 🎨 Palette fixe 10 couleurs OTAN

Alpha rouge / Bravo bleu / Charlie vert / Delta jaune ambre / Echo magenta / Foxtrot cyan / Golf orange / Hotel violet / India brun / Juliet gris. Cohérent charte MyKTAMap (Delta = ambre, Echo = jonctions, Foxtrot = itinéraire).

### 🗺️ 3 modes interactifs map

Pattern hérité du floater itinéraire avoid-click :
- **POINT** (entrée/sortie) : 1 clic carte via `map.once("click")`
- **POLYGON** (zone) : multi-clics + double-clic pour fermer (min 3 sommets, preview L.polyline dashed rouge)
- **ROADS** (zone tracés) : multi-clic sur polylines existantes avec highlight rouge weight 8

### 🛣️ Pathfinder integration

Bouton 🗺️ « Calc. itinéraire » par équipe utilise `Pathfinder.computeRoute([entree, sortie])` (async). Calcul auto distM + dureeEstimeeMin (vitesse moyenne cataphile = 0.5 m/s).

### 🎨 Overlay carte couleur transparent (KARMA validé)

`renderOverlay` rend par équipe : polygon fillOpacity 0.30, halo polyline weight 10 (zones roads), circleMarker entrée/sortie avec border vert/rouge + fill couleur équipe, polyline dashed pour itinéraire. Mode focus (setFocus(groupeId)) masque autres équipes. Auto-refresh à chaque mutation.

### 📄 Export PDF + 🌍 Export KMZ

- **PDF** : 1 page A4 par équipe via jsPDF. Layout texte structuré : en-tête + bandeau couleur équipe + sections Contexte/Membres/Mission/Itinéraire/Observations (cadre vide 60mm). ⚠️ Limitation MVP : pas de carte miniature (Phase 2).
- **KMZ** : étend `myktamap-extras.json > secoursPlan` (cf §59 pattern roundtrip). MyKTAMap re-import natif fonctionnel. ⚠️ Limitation MVP : KML doc.kml ne contient pas encore les Placemarks/Polygons cross-app (Phase 2).

### 📊 Roadmap phases suivantes

KARMA validation « Phase complète 3+ releases ». Phase 2 (v1.23.0) = intégrations Lost Mode + Favoris + Heatmap + Recherche + M-LVL + Pathfinder avoidances cross-équipes + KML cross-app + carte miniature PDF. Phase 3 (v1.24.0) = statut temps réel + QR code share + timer incident + observations terrain.

### 📦 Sources de vérité v1.22.0

- `version.json` → `v1.22.0`
- `js/copyright.js > __MKM__.build` → `v1.22.0`
- `sw.js > CACHE_NAME` → `myktamap-cache-v1.22.0-secours`
- **1 nouveau fichier** : `js/secoursMode.js` (~1500 lignes), ajouté à `ASSETS_TO_CACHE`
- **1 modif** : `js/kmzExport.js` accepte `opts.secoursPlan` dans extras.json
- **1 nouvelle key localStorage** : `myktamap_secours_v1_<planId>`

### 🛡️ Confidentialité

Aucune nouvelle surface réseau, aucune nouvelle permission. Tout local (localStorage + Leaflet RAM + Blob téléchargement). NETWORK_AUDIT inchangé sur le fond — verdict ✅ aucune régression.

</details>

<details id="v1-21-5">
<summary><strong>🗓️ 26/05/2026 — ≡ v1.21.5 : Release PATCH — Refonte filtre Leaflet → modale ≡ unifiée + filtrage runtime tags/types</strong></summary>

Release PATCH (bump Z : 1.21.4 → 1.21.5). Refonte UX complète du bouton ≡ Leaflet topright.

### ≡ Modale Filtres unifiée

**Avant** : le bouton ≡ (trois barres horizontales) en haut à droite ouvrait `L.control.layers(null, overlays)` natif Leaflet → filtre image + data layers uniquement.

**Après** : remplacement par notre custom `L.control.ktaFilterControl()` qui garde la même icône visuelle (KARMA : « visuelement meme icone des troi barre noir horizontal ») mais ouvre désormais la modale unifiée `js/filterPanel.js` (~655 lignes IIFE) avec **7 sections accordéon** :

- 🖼️ Calques d'image (= ancien Leaflet natif)
- 📊 Calques de données (= ancien Leaflet natif)
- 🏗️ Niveaux M-LVL (cohabite + sync bidirectionnel avec la modale Niveaux existante via `FilterPanel.onLevelChange()`)
- 🏷️ **Tags des points** (nouveau) — énumération auto, seuls les tags présents
- 🛣️ **Types de tracés** (nouveau) — Principal/Secondaire/Chemin/Jonction + customs
- ⬛ **Types de zones** (nouveau) — Eau/Remblais/Effondrement/Inaccessible + customs
- 🏛️ **Types de structures** (nouveau) — Pilier 1ère/2è masse/Mur/Front 1/2 + customs

### ⚡ Live update + debounce 200ms

Chaque toggle déclenche un re-render via `_scheduleApply` debouncé à 200ms (anti-freeze sur plans denses lors de clics rapides). KARMA : « Live (chaque toggle = effet immédiat) ».

### 💾 Persistance per-plan via SessionPersist

Nouveau champ `payload.runtimeFilters` (Sets sérialisés en Arrays). Restore au boot après les markers session (timeout 200ms aligné avec la phase 2 itineraries). Chaque plan a ses propres filtres mémorisés.

### 🔧 Hooks runtime niveau modules

`js/road.js > renderRoads`, `js/zones.js > renderZones`, `js/structures.js > renderStructures` consultent `window._ktaRuntimeFilters.{roadTypes,zoneTypes,structTypes}` après `_passeFiltreNiveau`. `js/editor.js > _ajouterMarker` pose `marker._ktaTags = point.tags.slice()` puis `_appliquerFiltreNiveauSurMarker` combine niveau + tag filter en une seule passe. **`currentRoad`/`currentZone`/`currentStructure` bypass** (tracé en cours toujours visible). **Itinéraires** (`type === "itinerary"`) toujours bypassés aussi.

### 🩹 v1.21.5-fix1 — 4 fixes post-release (26/05/2026)

Suite tests terrain KARMA, 4 régressions corrigées sans bump version (fix incrémental, même CACHE_NAME) :

1. **CSS FilterPanel OUBLIÉ à la release** : ~280 lignes manquantes pour les classes `.kta-fp-*` → rendu catastrophique en flux brut avec PNG icônes 50×50 et checkboxes default. Ajout du CSS complet : chips Flexbox compact avec icône miniature 22×22 + label ellipsé + count badge pill ambré, accordéon `<details>/<summary>` avec chevron ▸/▾, grid responsive (1 col mobile < 480px, auto-fill minmax(180px) sinon), pills M-LVL segmented horizontaux, footer Reset + status. **Variants thème clair complets** via variables `--kta-light-*`.
2. **Exclusion `type === "itinerary"`** du `_enumerateTypes` (`filterPanel.js`) : dérivé Pathfinder calculé, pas un type user-chooseable. Cohérent avec le hook runtime qui bypass déjà `road.type === "itinerary"` dans `renderRoads`.
3. **Stats Home labels TOUJOURS par défaut** (KARMA : « *en stat général, on doit toujours prendre la valeur par default* ») : nouveau helper `_defaultLabelStat(category, type, fallback)` dans `statsGlobales.js` qui consulte UNIQUEMENT `LegendCustomization.getDefaultLabel` (court-circuite la cascade session > plan > default). `_renderPieChart` accepte un 4e arg `useDefaultLabels` qui aiguille la résolution. L'appel `_renderProfilePies` (`index.html`) passe `true` → les camemberts cross-plan Profil affichent `Principal/Secondaire/Chemin/Jonction` générique même si le plan A renomme « principal » en « route de surface ». Modale Stats GLOBALES in-plan : comportement inchangé (4e arg absent → cascade LC normale).
4. **Stats Home — secondaire / level -1 manquants** (KARMA : « *les route secondaire ou taguer lvl -1 ne semble pas pris en compte* ») : audit confirme pas de drop technique dans `_computePlanStatsLive` (pas de filtre type ni level). Mais 2 régressions silencieuses :
   - **(a)** Cache v1.21.3 sans champ `breakdowns` retournait `breakdowns: null` → skip total du plan dans l'agrégation. Fix : check `cached.breakdowns && typeof === "object"` → si absent, **fall through au cas 3** (session-only) au lieu de skip.
   - **(b)** Fallback session-only ne lisait que `editorPoints` + `roads`. Extension à `data.zones` + `data.structures` (toujours présents depuis v1.9.3-A1.a).
   - **Limitation acceptée** : session-only ne lit pas les **data layers embedded** (`data/*.json` du ZIP) — si tous les "secondaire" / level -1 sont en data layer et le plan n'a jamais été rouvert depuis v1.21.4, ils restent invisibles jusqu'à réouverture (qui régénère le cache complet via `_persisterStatsPlanCourant`).

**Sources fix1** : `js/filterPanel.js` (+5 lignes), `js/statsGlobales.js` (+35 lignes), `index.html` (+12 lignes Stats + 1 ligne param renderPie), `css/style.css` (+280 lignes CSS FilterPanel dark + light). **Pas de bump version** — fix incrémental.

### 📦 Sources de vérité

- `version.json` → `v1.21.5`
- `js/copyright.js > __MKM__.build` → `v1.21.5`
- `sw.js > CACHE_NAME` → `myktamap-cache-v1.21.5-filterpanel`
- **1 nouveau fichier** : `js/filterPanel.js` (~655 lignes), ajouté à `ASSETS_TO_CACHE`

### 🛡️ Confidentialité

**Aucune nouvelle surface réseau, aucune nouvelle permission**. Tout local : Sets en RAM, persistance dans le payload SessionPersist déjà existant, pas de nouvelle key localStorage globale, pas de nouvelle DB IDB. NETWORK_AUDIT mis à jour avec verdict ✅ aucune régression.

### 📚 Doc

- README_USER : nouvelle section « ≡ Modale Filtres unifiée » avec tableau des 7 sections + cas d'usage + note sur la rétro-compat
- AI_CONTEXT : entrée v1.21.5 au top de la timeline « Versions »
- CLAUDE.md : nouvelle section §64 « v1.21.5 — Refonte filtre Leaflet » avec architecture détaillée + pièges + pour étendre
- NETWORK_AUDIT.md + .html : paragraphe v1.21.5 + entrée tableau historique

⚠️ **Action terrain** : ne nécessite PAS de ré-import. Les anciennes sessions v1.21.4 sont restaurées avec `runtimeFilters = null` partout (= tout visible, comportement strict v1.21.4). La première interaction avec la modale ≡ crée l'état et le persiste au prochain save throttle (≤ 1.5 s).

</details>

<details id="v1-21-1">
<summary><strong>🗓️ 25/05/2026 — 🩹 v1.21.1 : Release PATCH — Audit imports/exports (9 bugs critiques fixés)</strong></summary>

Release PATCH (bump Z : 1.21.0 → 1.21.1). Audit ciblé via agent général-purpose après accumulation de 6 hotfixes post-v1.21.0 qui suggéraient des bugs latents structurels. Audit retournait 9 bugs critiques + 6 mineurs, dont 9 critiques traités en 5 batchs cohérents.

### 🚨 Batch sécurité (1 bug)

**#1 — Mode urgence : bloc GPS toujours masqué (clone bug fix4)**

`js/emergencyMode.js > _tick` ligne 265 faisait `if (calib && calib.transform)` MAIS `KmzExport.setCalibration` ne stocke QUE `{pointA, pointB}` (jamais de transform — calculé à la demande). Clone exact du bug fix v1.21.0-fix4 dans gpxIO.js, manqué lors du grep initial qui ne touchait que GPX.

Conséquence critique : le bloc GPS du mode urgence était TOUJOURS masqué, même sur plan calibré. Pile la situation où l'user en a besoin (perdu en cata, guider les secours par téléphone via coordonnées).

Fix : pattern identique à `gpxIO.js > _getTransform()` — vérifie les 8 champs `Number.isFinite` + `try buildTransform()` pour détecter calibrage dégénéré + appel `_formatGPS` si OK.

### 🎨 Batch A Customs — Types `cust-*` plus jamais perdus (4 bugs)

Avant, les entrées custom (`cust-XYZ`) ajoutées via éditeur LegendCustomization (cf §31.6 CLAUDE.md) étaient traitées en 2e zone partout : SILENCIEUSEMENT droppées ou ramenées au type default.

| Bug | Module | Fix |
|---|---|---|
| **#2** | `sessionExporter.js > _exportKmz` | `roadTypesSet`/`zoneTypesSet`/`structureTypesSet` construits depuis 3-4-5 checkboxes hardcodées → enrichissement via helper `_addCustsToSet(set, items)` qui ajoute tous les `cust-*` rencontrés |
| **#3** | `kmzImport.js > ingestPlacemarks` | Regex `^#road_(principal\|...)$` stricte → ajout 6 nouvelles regex parallèles `^#X_(cust-[A-Za-z0-9_-]+)$` pour roads/zones/structures-polygon/structures-polyline |
| **#4** | `gpxImport.js > ingestParsed` | `validTypes.indexOf(t) >= 0` strict → helper `_isValidRoadType(t)` qui accepte validTypes OU prefix `cust-` |
| **#5** | `sessionExporter.js > _exportSessionAvance` | Filter `roadTypes.indexOf(r.type) >= 0` drop customs (bypass jonction existait depuis v169 mais pas customs) → helper `_isCustom(t)` + bypass parallèle dans 3 filters |

### 📦 Batch B Embedded — Data layers (3 bugs)

| Bug | Module | Fix |
|---|---|---|
| **#6** | `utils.js > getAllEmbeddedStructures` | Filtre `points.length >= 3` excluait fronts (polylines, min 2 pts) → seuil type-dependent (`isPolyline ? 2 : 3`) |
| **#7** | `kmzExport.js > genererKml branche fronts` | `<description>` non émise (asymétrie avec `_emitPolygon` piliers/mur) → ajout `(s.description ? _emitDescriptionCdata(...) : '')` |
| **#8** | `utils.js > ajouterPointsDepuisJSON` + 4 getters | `_ktaDataMarkers/Polylines/Polygons/Structures` ne stockaient PAS `description` → ajout dans les 3 entries + `_ktaDescription` sur markers + getters l'exposent conditionnellement |

### 🏗️ Batch C M-LVL — Roundtrip KMZ (1 bug)

**#14 — Niveaux M-LVL aplatis à 0 au roundtrip KMZ**

Avant : `kmzExport.js` encodait le niveau M-LVL UNIQUEMENT via le folder parent (`<Folder><name>🏗️ Niveau N</name>`). `kmzImport.js > ingestPlacemarks` itère sur les Placemarks et n'inspecte PAS la hiérarchie folder. Conséquence : ROUNDTRIP MKM→KMZ→MKM aplatissait tous les niveaux à 0. Pire pour les jonctions (fromLevel + toLevel essentiels perdus → jonction inutilisable au pathfinder).

Fix : format KML natif `<ExtendedData><Data name="mkm:level"><value>N</value></Data></ExtendedData>`. Avantages :
- Transparent pour Google Earth/OsmAnd/etc. (ignorent les Data inconnues)
- Préfixe `mkm:` évite collision avec d'autres apps
- Standard KML 2.2 (pas un namespace exotique)

**ÉCRITURE** : nouveau helper `_emitExtendedDataLevel(level, extra)` qui retourne le bloc `<ExtendedData>` si level défini. Appelé dans `_emitPlacemark` (points), `_emitLineString` (roads — level OU fromLevel+toLevel pour jonctions), `_emitPolygon` (zones + structures piliers/mur), branche fronts inline.

**LECTURE** : helper `_mkmData` IIFE au début de chaque Placemark itéré dans `kmzImport.js > ingestPlacemarks`. Scan `:scope > ExtendedData > Data[name^="mkm:"]` + `parseInt`. Chaque branche d'`out.X.push` reçoit le level conditionnel sur `Number.isInteger(_mkmData.X)`.

**Rétro-compat** : si KMZ tiers ou KMZ MKM < v1.21.1 → ExtendedData absent → level reste défini par le caller (typiquement 0). Aucun changement de comportement pour les apps tierces.

### 🧱 Batch D V2-crop — Bug edge case mais sévère (1 bug)

**#9 — V2 tiling auto-crop : annotations + georef décalés**

`createConf.js > _genererTuilesV2` fait un auto-crop des marges blanches si bbox détectée < 90% du canvas. Retourne `dims.cropOffset = {x, y}`. `kmzImport.js > genererZipMyktamap` utilisait :
- `finalW/H` = dims POST-crop
- annotations projetées AVANT crop avec `opts.imageW/H` (dims ORIGINALES)
- `planConfig.plan.georef` avec `finalW/H` mais `corners.sw/ne` GPS originaux (couvrent image PRÉ-crop)

Conséquences (visibles sur scan IGN avec bordures, KMZ V2 re-tilé) :
1. Annotations décalées de `cropOffset` (tous les points dérapés haut-gauche)
2. Georef faux mathématiquement (calibrage complètement à côté)

**Fix en 2 parties** :
- Helper `_translate(items)` qui soustrait `cropOffset` à chaque coord (item.x/y direct + item.points[].x/y pour polylines/polygons) sur points/roads/zones/structures
- Recalcul du georef post-crop par interpolation linéaire des nouveaux coins SW/NE : `frac_x/y` dans le repère original → lerp entre `sw` et `ne` GPS. Approximation valable pour LatLonBox axis-aligned (= la majorité). LatLonQuad avec rotation = approximation acceptable (cropOffset rare sur LatLonQuad)

Note : `gpxImport.js` n'a PAS le même bug en pratique car canvas uniforme = pas d'auto-crop déclenché (bbox = 100%).

### 📂 Sources de vérité v1.21.1

- `version.json` → `"v1.21.1"`
- `js/copyright.js` > `__MKM__.build` → `"v1.21.1"`
- `sw.js` > `CACHE_NAME` → `"myktamap-cache-v1.21.1"`
- **Aucun nouveau fichier**
- Modifs internes à 6 fichiers : `js/emergencyMode.js` (+30), `js/sessionExporter.js` (+50), `js/kmzImport.js` (+150), `js/kmzExport.js` (+50), `js/gpxImport.js` (+8), `js/utils.js` (+30). Total ~350 lignes ajoutées.

### 🛡️ Confidentialité

**Aucune nouvelle surface réseau**. 100% local. NETWORK_AUDIT inchangé sur le fond — mise à jour de la version uniquement.

### ⚠️ Action terrain

Les KMZ ré-importés avant ce fix (v1.21.0 ou antérieur) ont leurs levels/descriptions/types-custom déjà perdus dans le ZIP MyKTAMap reconstruit. **Ré-importer depuis le KMZ source** pour bénéficier du fix complet. Idem plan V2 avec auto-crop : ré-import nécessaire.

</details>

<details id="v1-21-0">
<summary><strong>🗓️ 25/05/2026 — 🚀 v1.21.0 : Cycle « Stats avancées + QoL UX »</strong></summary>

Release MINOR (bump Y : 1.20.0 → 1.21.0). 4 features qui complètent le polish v1.20.0 (release massive de 8 features la veille) sans embarquer de chantier lourd. Scope validé KARMA via topo design (4 questions AskUserQuestion).

### 📊 S1 — Export CSV des annotations

Nouveau bouton « 📊 Export CSV » dans le footer de la modale 📊 Stats globales (à côté de PDF + Copier rapport).

Génère un **ZIP avec 5 fichiers** :
- `points.csv` : 1 ligne par point (source/id/nom/x/y/level/tags/etat/description)
- `roads.csv` : 1 ligne par tracé (source/type/nb_points/distance_m/level/fromLevel/toLevel/description)
- `zones.csv` : 1 ligne par zone (source/type/nb_points/surface_m2/level/description)
- `structures.csv` : 1 ligne par structure (source/type/nb_points/surface_m2/longueur_m/level/description)
- `_README.txt` : explication format pour l'utilisateur

**Format CSV** :
- **UTF-8 avec BOM** (`﻿` en tête) — Excel auto-detect encoding
- **Séparateur `;`** (compat Excel FR par défaut)
- **Escape RFC4180** : si valeur contient `;` `"` ou newline → wrap en `"..."` + double les `"` internes
- **Colonne `source`** : `session` (annotations en cours) ou `embedded` (data layers du plan) — permet filtrage tableur

**Scope** : inclut session + embedded data layers (cohérent avec scope de Stats globales = plan COMPLET).

**Distances en mètres** via `APP_CONFIG.scale` (px/m). **Surfaces en m²** via shoelace formula. Helpers réutilisés : `_polylineLenM`, `_polygonAreaM2` (factorisés depuis `_polylinePxLength` + `_polygonAreaPx` existants).

**API** : `window.StatsGlobales.exportToCSV()` → `Promise<{ok, filename, counts}>`. Utilise JSZip déjà chargé.

### 📊 S2 — Graphes camembert SVG natifs

Camemberts SVG inline (0 dep externe) dans **4 sections breakdown** de la modale Stats globales :

| Section | Catégorie | Palette |
|---|---|---|
| 📍 Points par tag | `tags` | Cycle 10 couleurs via hash djb2 (déterministe) |
| 🛣️ Tracés par type | `roads` | principal=#00ff00 · secondaire=#b000ff · chemin=#ffff00 · jonction=#ff4ecb |
| ⬛ Zones par type | `zones` | eau=#3aa9e8 · remblais=#5a5a68 · effondrement=#ff3333 · inaccessible=#7a0000 |
| 🏛️ Structures par type | `structures` | pilier-1=#f4c542 · pilier-2=#ff9933 · mur=#1e3a8a · front-1=#f4c542 · front-2=#ff9933 |

**Algo SVG natif** : pour chaque slice, math `cos/sin` sur l'angle de début → coords sur cercle → path SVG `<path d="M cx cy L x1 y1 A r r 0 large 1 x2 y2 Z" fill="color"/>`. `large` = 1 si arc > 180°. Cas dégénéré (1 seul slice) → `<circle>` plein pour éviter le bug arc-360°.

**Layout** : flex 2 colonnes responsive — camembert 160px à gauche + légende textuelle à droite. Légende = 1 row par slice avec swatch coloré + label `LC.getLabel()` (cascade respectée) + count + pourcentage. Tri desc par count (gros slice en premier visuellement).

Helper `_lcLabelStat(category, type, fallback)` qui mappe la catégorie statsGlobales → catégorie LegendCustomization (`roads`→`traces`, `tags`→`icones`, etc.). Gère aussi les entrées custom (`cust-XYZ`) avec préfixe ✨.

**CSS** : nouvelles classes `.kta-stats-glob-pie-wrap` / `.kta-stats-glob-pie-svg` / `.kta-stats-glob-pie-legend` + variants thème clair.

### 🎯 U4 — Raccourcis clavier globaux

Nouveau module `js/shortcuts.js` (~180 lignes IIFE) → `window.KtaShortcuts = { listMapping, trigger }`.

**Pack de 8 raccourcis** :

| Touche | Action | Trigger |
|---|---|---|
| `E` | ✏️ Édition | click `_groupes.edition.btnPrincipal` |
| `M` | 📐 Mesure | click `_groupes.mesure.btnPrincipal` |
| `Z` | ⬛ Zones | click `_groupes.zones.btnPrincipal` |
| `S` | 🏛️ Structures | click `_groupes.structures.btnPrincipal` |
| `T` | 🧭 Tracker | click `_groupes.tracker.btnPrincipal` |
| `L` | 🗺️ Légende | `window.afficherLegende()` |
| `B` | 🧭 Boussole widget | `window.CompassWidget.toggle()` |
| `R` | 🔍 Recherche unifiée | `window.ouvrirRecherche()` (alt à Ctrl+K) |

**Sémantique** : toggle (re-pression = ferme l'outil, équivalent re-click sur le bouton sidebar).

**Garde-fous** :
- Skip si modificateur Ctrl/Cmd/Alt/Shift (= laisse passer raccourcis browser/OS)
- Skip si focus dans INPUT/TEXTAREA/SELECT/contenteditable (anti-vol focus, cf §47.6)
- Skip si modale lourde ouverte (`.kta-readme-modal-overlay` visible, splash, UnlockGate, PIN gate, loading overlay)
- Skip si mode présentation actif (cf U1) — anti-trigger accidentel pendant démo

**Exposition `_groupes`** : `interface.js` ajoute `window._groupes = _groupes` (même référence — `window._groupes[id]` voit les ajouts faits via `_groupes[id] = {...}`). Lecture uniquement côté shortcuts, mutations restent locales à `_creerGroupeAccordeon`.

### 🎬 U1 — Mode présentation

Nouveau module `js/presentationMode.js` (~130 lignes IIFE) → `window.PresentationMode = { activate, deactivate, toggle, isActive }`.

**Activation** : touche `F` (toggle). Désactivation : `F` à nouveau OU `Échap`.

**Que cache-t-il / garde-t-il** :

| Élément | Comportement |
|---|---|
| 🟥 Header refonte (`.kta-refonte-header`) | Caché (display:none) |
| 🟥 Status bar refonte (`.kta-refonte-statusbar`) | Caché |
| 🟥 Sidebar droite Leaflet (controls custom) | Tout caché |
| 🟥 Sidebar gauche Leaflet (controls custom) | Caché SAUF zoom natif |
| 🟩 Zoom natif Leaflet (`.leaflet-control-zoom`) | Conservé (utile démo) |
| 🟩 Widget boussole (`.kta-compass-widget`) | Conservé, repositionné bottom safe-area |
| 🟩 Carte | Plein écran (top/bottom = safe-area uniquement) |

**Feedback UX** : toast `OOMGuard.showToast("🎬 Mode présentation activé — F ou Échap pour sortir", "info")` au activate (3s). Au deactivate : silencieux.

**Recalcul Leaflet** : `map.invalidateSize({animate:false})` au activate ET au deactivate (header/footer cachés/restaurés = dimensions carte changent).

**Anti-conflit avec U4** : quand `PresentationMode.isActive()` retourne `true`, le keydown handler de `shortcuts.js` skip toutes les actions (sauf F qui appartient à presentationMode).

**Body class** : `body.kta-presentation-mode` ajoutée/retirée. Le CSS associé (~50 lignes en fin de `style.css`) gère tous les `display:none !important` et le repositionnement de la carte + boussole.

### 📂 Sources de vérité v1.21.0

- `version.json` → `"v1.21.0"`
- `js/copyright.js` > `__MKM__.build` → `"v1.21.0"`
- `sw.js` > `CACHE_NAME` → `"myktamap-cache-v1.21.0"`
- **2 nouveaux fichiers** ajoutés à `ASSETS_TO_CACHE` :
  - `js/shortcuts.js` (~180 lignes — U4)
  - `js/presentationMode.js` (~130 lignes — U1)
- Modifs internes : `js/statsGlobales.js` (+280 lignes : exportToCSV + camemberts SVG + helper _lcLabelStat), `js/interface.js` (+8 lignes : `window._groupes = _groupes`), `css/style.css` (+150 lignes : pie chart styles + presentation mode), `index.html` (+8 lignes : 2 nouveaux `<script>` + commentaires)

### 🛡️ Confidentialité

**Aucune nouvelle surface réseau**. Tout 100% local :
- CSV : généré via Blob + JSZip déjà chargé → download local
- Camemberts : SVG inline rendu côté client
- Raccourcis clavier : event listeners locaux
- Mode présentation : toggle CSS body class

Aucun fetch externe. **NETWORK_AUDIT à jour** — mention nouveaux fichiers + features dans la section v1.21.0.

</details>

<details id="v1-20-0">
<summary><strong>🗓️ 25/05/2026 — 🚀 v1.20.0 : Cycle complet « Robustesse + Stats + Onboarding + Profil »</strong></summary>

Release MINOR (bump Y : 1.19.1 → 1.20.0). 8 features regroupées en une seule release : 4 sur la robustesse + stats du début de cycle, 4 sur l'onboarding + profil utilisateur ajoutées en fin de cycle Karma_dev.

### 🪤 (1/8) Skip snapshot identique — économie FIFO

`js/sessionBackups.js > snapshot()` vérifie désormais le **dernier snapshot IDB du même plan** avant de consommer un slot FIFO. Cas typique réglé : boot-pre-restore après un reload sans modif → hash in-memory `null` (reset au load) MAIS hash IDB identique → skip.

Économie : un user qui ouvre/ferme la PWA 10 fois sans modif voyait ses 10 derniers snapshots rotated en duplicates inutiles. Maintenant : 0 slot consommé sur boot identique.

Nouveau helper interne `_getLastSnapshotForPlan(planId)` qui réutilise `listAll()` (déjà trié desc par id).

### 📋 (2/8) Crash report auto IDB — module `js/crashReports.js` (~220 lignes)

API publique :
```js
window.CrashReports = {
  saveCrash(killInfo),   // archive auto-déclenchée par OOMGuard
  listAll(),             // Promise<CrashReport[]> trié desc par timestamp
  remove(id),
  clearAll(),
  formatReportText(entry)  // texte plain pour copier
};
```

Stockage : DB IDB dédiée `myktamap_crashes` v1 / store `crashes` / FIFO **5 entries**.

**Hook dans `js/oomGuard.js > _checkPreviousKill`** : quand un kill mémoire est détecté au boot, on appelle automatiquement `CrashReports.saveCrash(killInfo)` qui archive :

- `killInfo` : ageSec (depuis dernier heartbeat), planId, userAgent
- `appVersion` : `__MKM__.build` au moment du crash
- `logs` : 50 derniers logs du buffer debug.js (lus depuis `localStorage["kta_debug_logs"]`, qui survit au crash)
- `sessionSnapMeta` : méta-infos du dernier snapshot SessionBackups du même plan (= état au plus récent auto-backup avant le crash)

**Section MemInspector dédiée** : « 📋 Derniers crashs (N / 5) » avec affichage card par entry (date, plan, ageSec, nb logs, présence sessionSnap) + 3 boutons par crash :
- « 📋 Voir détails » → ouvre une modale `<pre>` avec le rapport formaté complet
- « 📋 Copier » → presse-papier
- « 🗑️ » → supprime ce rapport

Plus un bouton global « 🗑️ Tout vider ».

**Format du rapport texte** (`formatReportText`) : markdown-like avec séparateurs ASCII, prêt à coller dans Discord / mail / GitHub pour partager au mainteneur.

### ⭐ (3/8) Favoris export / import JSON — partage cross-appareil

`js/favoris.js` étendu avec 4 nouvelles méthodes :

```js
exportToJson({scope})           // scope: "all" | "current-plan"
exportToFile({scope, filename}) // déclenche download Blob
importFromJson(input, {mode, targetPlanId})  // mode: "merge" | "replace"
importFromFile(file, opts)      // wrap depuis input type=file
```

**Format JSON** ouvert + versionné (extensible) :
```json
{
  "type":       "myktamap-favoris-export",
  "version":    1,
  "exportedAt": "2026-05-24T...",
  "appVersion": "v1.20.0",
  "scope":      "all" | "current-plan",
  "byPlan":     { "<planId>": [favoris...], ... }
}
```

**Modes import** :
- `merge` (défaut) : ajoute aux favoris existants, anti-doublon sur `pointId`
- `replace` : vide le plan cible puis injecte

**UI** dans modale 📊 Détails session → nouvelle section ⭐ Favoris :
- 3 boutons : 📤 Exporter (plan courant), 📤 Exporter (tous les plans), 📥 Importer un JSON
- Status display dynamique (vert OK / rouge erreur / gris transit)
- Badge avec compteur plan courant + total cross-plan « N (+ M autres plans) »
- Helper `_hydrateFavorisBadge()` (function declaration hoisted dans `_afficherModaleSessionDetail`)

### 📊 (4/8) Stats globales du plan — module `js/statsGlobales.js` (~520 lignes) + export PDF

API publique :
```js
window.StatsGlobales = {
  ouvrir(),
  fermer(),
  compute(),               // Promise<StatsReport>
  getReportText(report)    // texte plain pour copier
};
```

**Distinction clé avec 📊 Détails session** : Détails session couvre LA SESSION (annotations en RAM), Stats globales couvre LE PLAN COMPLET (session + data layers embedded). Hint explicatif dans le CTA pour bien différencier.

**Modale dédiée** avec sections :

| Section | Contenu |
|---|---|
| Header plan | nom + version + auteur + dimensions + flags M-LVL/V2 |
| Grille totaux | cartes 📍/🛣️/⬛/🏛️/📸 avec breakdown session vs embed |
| 📍 Points par tag | triés desc par count |
| 🛣️ Tracés par type | count + distance cumulée (auto m → km via `window.formatDistance`) |
| ⬛ Zones par type | count + surface cumulée (auto m² → ha via `window.formatSurface`) |
| 🏛️ Structures par type | count par type |
| 🏗️ Breakdown par niveau (si M-LVL ON) | 📍/🛣️/⬛/🏛️ par niveau, jonctions taggées sur `max(fromLevel, toLevel)` |
| 🌐 Géoréférencement | si `plan.georef` présent, coords A + B |

**Bouton 📋 Copier le rapport** : format texte plain markdown-like prêt à coller dans Discord / mail / GitHub pour partager des stats de plan.

**Accès** : gros bouton CTA bleu en tête de modale 📊 Détails session :
> 📊 Voir les statistiques globales du plan (session + data layers embedded)

**Bonus export PDF (depuis Karma_dev)** : nouvelle méthode `exportToPDF(opts)` dans `statsGlobales.js` qui réutilise jsPDF déjà chargé. A4 portrait avec header + tableaux par section. Bouton « 📤 Export PDF » dans le footer de la modale Stats. Emojis remplacés par texte plain dans `pdf.text()` (jsPDF Helvetica latin1 only — cf §44.6 CLAUDE.md).

### 🛡️ (5/8) Clause anti-fork myktamap.fr

Nouvelle section dans Audit (Configuration loader + `docs/NETWORK_AUDIT`) qui précise que la garantie de sécurité et non-télémétrie s'applique **UNIQUEMENT au domaine officiel `myktamap.fr`** (+ `devmap.is-underground.fr`). Le code source étant public (CC BY-NC-SA), toute copie/fork tiers peut contenir des modifications non contrôlées.

**Comment vérifier** : URL dans la barre d'adresse + cadenas HTTPS valide.

### 🎓 (6/8) Tutoriel premier-lancement enrichi — module `js/tutorial.js` (~250 lignes)

API publique :
```js
window.Tutorial = { ouvrir(), fermer(), isFirstLaunch(), markAsSeen() };
```

**Auto-affiché au tout premier lancement** via flag `localStorage["myktamap_tutorial_seen_v1"]`, différé 600ms après `_splashEnd` pour laisser le splash se finir proprement.

**8 cards séquentielles** :
1. Bienvenue + clause anti-fork
2. Charger ou créer un plan (distinction Drop ZIP natif vs KMZ/GPX **idéalement exportés depuis MyKTAMap** pour roundtrip complet)
3. Annoter
4. Tracker GPS expérimental
5. Trouver vite avec Ctrl+K + Favoris
6. Multi-niveau M-LVL
7. Sauver et partager (exports PNG/PDF/KMZ/GPX/Profil)
8. Outils annexes (Mode urgence / Replay tracker / etc.)

**Navigation** : Précédent / Suivant + pastilles cliquables + raccourcis ← → Enter Échap + bouton Passer. Pas de close au backdrop (anti dismiss accidentel). Animation fade-in 0.25s entre cards.

**Rejouable** via 📚 Aide → nouvelle sous-action « 🎓 (Re)voir le tutoriel ».

### 📦 (7/8) Export / Import de profil utilisateur complet — module `js/profileExportImport.js` (~1100 lignes)

Remplace l'ancien export « Exporter ma liste de plans » par un export **profil utilisateur complet**.

API publique :
```js
window.ProfileExportImport = {
  buildProfile(opts), computeSectionSizes(),
  exportToFile(opts), parseProfile(input),
  computeImportStats(profile), applyProfile(profile, opts),
  isLegacyFormat(input),
  ouvrirExportModale(), ouvrirImportModale(file), fermerModales()
};
```

**Format JSON unique versionné** : `{type: "myktamap-profile-export", version: 1, exportedAt, appVersion, sections}`.

**9 sections** disponibles :

| Section | Default | Description |
|---|---|---|
| 👤 `user` | ✅ Cochée | Surnom + photo profil (base64 inline, ~30-60 KB après compression 512px JPEG q88) |
| 🗂️ `registry` | ✅ Cochée | Liste des plans connus (méta uniquement, **sans** les ZIPs binaires) |
| ⚙️ `preferences` | ✅ Cochée | Réglages utilisateur (thème, perfPreset, debug, paranoia, mode Simple/Avancé Générateur, etc.) |
| ⭐ `favoris` | ✅ Cochée | Tous les POI marqués favoris (tous plans confondus) |
| 💾 `sessions` | ✅ Cochée | Slots `myktamap_session_v1_<planId>` (annotations en cours par plan) |
| 📦 `backups` | ✅ Cochée | 10 snapshots FIFO par plan (auto + manuels) |
| 🎓 `tutorial` | ✅ Cochée | Flag `myktamap_tutorial_seen_v1` |
| 📸 `photos` POI | ❌ Décochée | Photos attachées aux points (lourd, opt-in explicite) |
| 📋 `crashes` | ❌ Décochée | Historique des crashs (debug, peut contenir logs sensibles) |

**EXCLUS PAR DESIGN** :
- ZIPs binaires des plans (trop lourd — l'user re-déposera ses fichiers ZIP sur le nouvel appareil)
- PIN/Face ID local + UnlockGate communautaire (sécurité — l'user redéfinit son PIN sur le nouvel appareil)

**Rétro-compat absolue** avec l'ancien format `myktamap-plans-list` (détection auto via `parseProfile.format`). Bannière jaune « ⚠️ Format ancien détecté » + import limité à la section registry.

**Mode import** : `merge` (défaut, anti-doublon) OU `replace` (vide les sections cochées avant injection).

**Modale post-import « ✅ Profil importé »** : résumé des sections appliquées + encadré jaune « 🔄 Recharger l'app est recommandé pour appliquer pleinement les préférences ». 2 boutons : « ⏱️ Plus tard » + « 🔄 Recharger maintenant » (focus auto = action recommandée).

### 👤 (8/8) Mode profil utilisateur intégré au loader — module `js/userProfile.js` (~370 lignes)

Mini profil utilisateur (surnom + photo optionnelle) avec stockage dédié et UI intégrée au loader.

API publique :
```js
window.UserProfile = {
  init(), get(), getPhotoBlob(), getPhotoObjectUrl(),
  setSurnom(string), setPhoto(File|Blob), removePhoto(), clear(),
  onChange(cb),
  getInitial(surnom), getAvatarColor(surnom), PALETTE
};
```

**Stockage** : nouvelle DB IDB `myktamap_profile` v1 / store `profile` keyPath `id` (entry unique `id="me"` : surnom + photoBlob + photoMime + createdAt + updatedAt).

**Compression auto photo** via canvas (max 512px côté long, JPEG q88 → ~30-60 KB). Limite raisonnable d'entrée brute (50 MB) pour éviter de crasher le compresseur sur une image RAW gigantesque.

**Palette charte 10 couleurs déterministes** (hash djb2 du surnom → index) pour l'avatar default :
| # | Couleur | Usage |
|---|---|---|
| 0 | `#f4c542` (doré charte) | défaut + fallback no-name |
| 1-9 | bleu, rouge doux, vert, magenta, cyan, brun-beige, orange, violet, turquoise | distribution déterministe |

**UI bandeau `#kta-loader-profile-bar`** en en-tête du loader (AVANT le grid `loader-grid`) :
- Avatar 52px (44px mobile / 58px PC) — photo si uploadée, sinon initiale du surnom dans cercle coloré
- Greeting "Bienvenue"
- Surnom cliquable (italique muted si vide)
- Bouton ⚙️ Détails dédié
- Toute la zone cliquable → ouvre la modale Détails

**Modale Détails du profil** :
- Avatar grand format 96px (112px PC) — clic pour upload OU bouton 📷 Photo / 🗑️ Retirer
- Surnom éditable inline (input text + bouton 💾 Enregistrer apparaît au change + Enter submit)
- Stats agrégées 4-cells (📍/🛣️/⬛/🏛️) + ligne dédiée (📸 photos POI count + Mo)
- 3 boutons : 📤 Exporter mon profil / 📥 Importer un profil / 🗑️ Réinitialiser le profil
- Modale reset charte (cf §35) au lieu de `confirm()` natif

**Anciens boutons `exportListBtn` / `importListBtn` à côté de « 📚 Mes plans » RETIRÉS** — regroupés dans la modale Détails.

**Mode clair** : bandeau profil aligné sur les autres cards du loader (`#myPlansBox`, `#resumeBox`, « Ajouter un plan ») — fond `#fdf8eb` + bordure ocre + radius 14px + ombre warm.

**Integration ProfileExportImport** : section `user` ajoutée via `_collectUser()` async (encode photo en base64) et `_restoreUser()` au restore (decode + setPhoto). Cochée par défaut car légère.

### 📂 Sources de vérité v1.20.0

- `version.json` → `"v1.20.0"`
- `js/copyright.js` > `__MKM__.build` → `"v1.20.0"`
- `sw.js` > `CACHE_NAME` → `"myktamap-cache-v1.20.0"`
- **5 nouveaux fichiers** ajoutés à `ASSETS_TO_CACHE` :
  - `js/crashReports.js` (~220 lignes)
  - `js/statsGlobales.js` (~520 lignes + exportToPDF)
  - `js/tutorial.js` (~250 lignes)
  - `js/userProfile.js` (~370 lignes)
  - `js/profileExportImport.js` (~1100 lignes)
- **2 nouvelles DB IDB** :
  - `myktamap_crashes` v1 / store `crashes` (FIFO 5 entries)
  - `myktamap_profile` v1 / store `profile` (1 entry unique `id="me"`)
- Modifs internes à : `js/sessionBackups.js`, `js/oomGuard.js`, `js/favoris.js`, `js/refonteInterface.js`, `js/memInspector.js`, `index.html`, `css/style.css`

### 🛡️ Confidentialité

**Aucune nouvelle surface réseau**. Tous les ajouts sont 100 % locaux :
- Skip snapshot = lecture IDB read-only
- Crash Reports = lecture localStorage (logs debug.js) + lecture IDB (SessionBackups méta) + écriture IDB (myktamap_crashes)
- Favoris export/import = Blob téléchargé localement + `File.text()` à l'import
- Stats globales = lecture des getters internes (`window.getRoads`, `window.getZones`, etc.) + IDB MyKTAMapPhotos + PDF généré localement via jsPDF (lib locale)
- Tutorial = HTML statique en mémoire + flag localStorage
- ProfileExportImport = lecture localStorage + IDB read-only + Blob téléchargé localement / `File.text()` + IDB write à l'import
- UserProfile = IDB locale `myktamap_profile`, ObjectURL créé via `URL.createObjectURL` (révoqué au refresh, pas de leak)
- Photo profil voyage en base64 inline dans le JSON exporté UNIQUEMENT si l'user coche la section 👤 Identité

Aucun fetch externe. Rapports copiés restent locaux (presse-papier navigateur). **NETWORK_AUDIT mis à jour** avec les 2 nouvelles DB IDB (`myktamap_crashes` + `myktamap_profile`).

</details>

<details id="v1-19-1">
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

> Usage commercial interdit sans accord écrit préalable. Pour toute question : Instagram **@karma_kta** ou **contact@myktamap.fr** (usage pro / licence : **https://pro.myktamap.fr**).

**Crédits librairies & algorithmes** — 🍃 Leaflet (cartographie) · 📦 JSZip (archives) · 📤 jsPDF (PDF imprimable) · 🧭 Dijkstra (chemin court) · 🌐 GPX 1.1 standard (interop outdoor).
