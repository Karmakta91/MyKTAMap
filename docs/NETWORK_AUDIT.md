# 🔒 MyKTAMap — Audit réseau & Confidentialité

> Page de transparence technique. À jour pour la version **v1.21.4** (25 mai 2026).
>
> **v1.21.4 (Release PATCH — Stats plans agrégées + Wake Lock global + skipServer + Heatmap M-LVL filter)** : **AUCUNE nouvelle surface réseau ajoutée**. 7 sujets 100 % locaux, dont 1 bonus côté réseau (skip d'1 fetch au boot si l'user active la nouvelle pref `myktamap_skip_server_plans_v1`). (1) Helper `_calculerStorageMyktamapBytes` (index.html) : itère localStorage prefix `MyKTAMap` + 6 stores IDB en read-only via cursor, cache 30s en variable JS module-scope (jamais persisté). AUCUN fetch externe, AUCUNE écriture, lecture pure. (2) Helpers `_computePlanStatsLive` + `_persisterStatsPlanCourant` : agrégation session + embedded en mémoire via getters publics (`getEditorPoints`, `getAllEmbeddedPoints`, etc.), écrit `localStorage["myktamap_plan_stats_v1_<id>"]` = `{pois, roads, distPx, breakdowns, ts, source}`. Counts uniquement (pas de Blob/photo data dans le cache). Pas d'IO async. (3) Stats agrégées séquentielles (`_calculerStatsPlansAggregees`) : lecture localStorage uniquement (sessions + cache stats par plan). Pas de fetch, pas d'IDB read. Anti-crash via yield `setTimeout(0)` entre plans. (4) Camemberts SVG agrégés cross-plan : rendu 100 % canvas / SVG client-side via `window.StatsGlobales.renderPieChart` exposé. Aucune transmission. Pas de fetch de ressources externes pour les couleurs (palette charte hardcodée). (5) `PROFILE_BAR_STATS` configurable : nouvelle localStorage key `myktamap_loader_bar_stats_v1` = array de keys (`time`/`storage`/`plans`). Default `["time", "storage"]`. Aucune nouvelle surface réseau, persistance pure locale. (6) **Option « skip plans serveur »** : nouvelle localStorage key `myktamap_skip_server_plans_v1` = boolean. Si active, `main.js > initApp` **NE FAIT PLUS** `fetch("data/index.json")` au boot → **RÉDUIT** la surface réseau (1 fetch en moins par boot). Pas d'ajout, juste un skip conditionnel. Default OFF (comportement v1.21.3 strict si l'user ne touche pas). (7) Filtre M-LVL Heatmap : `opts.levels` Set<number> consommée en mémoire JS. Aucune surface réseau ajoutée. **3 nouvelles localStorage keys documentées** (toutes strictement locales). **Liste blanche `connect-src` inchangée** : `'self'` + `https://www.gstatic.com` (ping connectivité). Verdict audit : **✅ aucune régression — bonus : -1 fetch boot si skipServer ON**.
>
> **v1.21.3 (Release PATCH anti-crash mobile)** : **AUCUNE nouvelle surface réseau**. Pack consolidé des 10 P0 identifiés par l'audit lecture seule (cf rapport interne KARMA). 100 % local — fixes runtime sur la robustesse mémoire/leaks/race conditions, sans nouveau fichier ni nouvelle API navigateur. Modifs internes : `js/main.js` (P0-1 fix `_skipEditorJsonLoad` sur slot per-plan + P0-8 tracking des `_ktaBatteryForceTimers` + P0-10 purge étendue de `_libererRessourcesPlanPrecedent` couvrant les 4 registres `_ktaData*`, les ghosts data layer notes, EmergencyMode listener, photo hook), `js/utils.js` (P0-6 token génération `_ktaDataLayerLoadToken` qui annule les rAF récursifs orphelins au plan switch), `js/tracking.js` (P0-2/3 cap dur `MAX_TIMELINE_ENTRIES=20000` + décimation FIFO préservant les ancres `start`/`recalage` au push ET au restore), `js/heatmap.js` (P0-4 `canvas.toDataURL` → `canvas.toBlob` + `URL.createObjectURL`/revoke + `MAX_DIM` dynamique 1024 sur device low-mem ; P0-5 seuil `MAX_SEGMENTS=50000` avec warning OOMGuard explicite avant ANR), `sw.js` (P0-7 LRU eviction debounced 30s sur cache dynamique, cap 800 entrées non-statiques, `_staticAssetUrls` Set protège l'app shell de toute eviction). Le pack v1.21.2 (jamais shipped main seule) est intégralement inclus ici (flyout Tracker + Heatmap réactivée/refonte + Wake Lock + tracker dans export session + GPS popup + urgences end). **Aucune nouvelle permission**, aucune nouvelle API navigateur utilisée par rapport à v1.21.2. Le SW cache uniquement un bump du `CACHE_NAME` (`myktamap-cache-v1.21.3-anticrash`). **Liste blanche `connect-src` inchangée** : `'self'` + `https://www.gstatic.com` (ping connectivité).
>
> **v1.21.2 (Cycle « Profil user + Wake Lock + Heatmap réactivée + Popup GPS » — Karma_dev, intégré dans v1.21.3)** : **AUCUNE nouvelle surface réseau**. 4 features 100 % locales. (1) Nouveau module `js/userProfile.js` (~388 lignes) + **nouvelle DB IDB `myktamap_profile` v1 store `profile`** (1 entry unique `id="me"` avec surnom + photoBlob + photoMime + createdAt + updatedAt). Photo compressée localement via canvas (max 512px côté long, JPEG q88 → ~30-60 KB). Aucun fetch externe, aucune transmission. ObjectURL créé via `URL.createObjectURL` et révoqué par les consumers (pas de leak). Section `user` ajoutée à `ProfileExportImport` (photo base64 inline dans le JSON exporté, légère donc cochée par défaut). (2) Nouveau module `js/wakeLock.js` (~178 lignes) — Wake Lock API navigateur (`navigator.wakeLock.request("screen")`) pour empêcher l'écran de s'éteindre en cavité. **Permission politique navigateur** (pas de user prompt explicite, accordée silencieusement en HTTPS si l'onglet a le focus). 0 fetch réseau. Persistance pure localStorage (`myktamap_wake_lock_v1` boolean string). **Hidden via `WakeLock.isSupported()` si non supporté** (Firefox 2026 bug #1589554, Safari < 16.4). Auto-release par le browser au visibilitychange→hidden (cohérent best practice). Pas de fingerprinting via cette API (toggle binaire, aucune info device exposée). (3) **Heatmap RÉACTIVÉE** (`js/heatmap.js` ~661 lignes, désactivée en standby depuis v1.12.0). Maintenant que la timeline tracker est persistée en localStorage via SessionPersist (cf v1.21.1) + SessionBackups, la heatmap peut afficher des passages cumulés cross-sessions. Rendu **100 % canvas local** (radial gradients additifs + colormap bleu→vert→jaune→rouge via `getImageData`/`putImageData`). 1 `canvas.toDataURL("image/png")` consommé UNIQUEMENT par `L.imageOverlay` (overlay Leaflet local). 0 fetch externe, 0 leak (le data URL est un blob mémoire navigateur jamais POSTé). (4) **Popup point — ligne coords GPS** (`js/utils.js > buildPointPopupHtml`) : si le plan est calibré KMZ, calcule GPS via `KmzExport.planToGps` (transformation affine 2D pure côté client, jamais d'appel à un service de géocodage). Bouton 📋 copie via `navigator.clipboard.writeText` (Clipboard API, permission silencieuse en HTTPS scope tab + fallback `execCommand`). String GPS escapée via `_escAttr` (escape HTML attribut) + replace des `'` pour le onclick inline → **surface XSS validée** (la valeur GPS provient d'un calcul JS sur les coords numériques du plan, jamais d'input user). **Liste blanche `connect-src` inchangée** : `'self'` + `https://www.gstatic.com` (ping connectivité). **4 nouveaux fichiers** au cache SW (`./js/userProfile.js`, `./js/profileExportImport.js`, `./js/wakeLock.js`, `./js/heatmap.js` réactivé) + 1 nouvelle DB IDB documentée (`myktamap_profile`).
>
> **v1.21.1 (Release PATCH — Audit imports/exports/roundtrips)** : **AUCUNE nouvelle surface réseau**. Pack consolidé de 9 bugs critiques découverts via audit ciblé après accumulation de 6 hotfixes post-v1.21.0. 100% local — fixes internes aux modules d'import/export : emergencyMode (sécurité GPS), sessionExporter (filtres customs), kmzImport+kmzExport (regex + ExtendedData M-LVL + V2 crop offset), gpxImport (validTypes), utils (registries embedded). Le SW cache uniquement un bump du `CACHE_NAME` (`myktamap-cache-v1.21.1`). Aucun nouveau fichier. **Liste blanche `connect-src` inchangée** : `'self'` + `https://www.gstatic.com` (ping connectivité).
>
> **v1.21.0 (Cycle « Stats avancées + QoL UX »)** : **AUCUNE nouvelle surface réseau**. 4 features 100% locales. (1) **Export CSV des annotations** dans Stats globales (`window.StatsGlobales.exportToCSV`) — ZIP avec 4 CSV (points/roads/zones/structures) + README, UTF-8 BOM + séparateur `;` (compat Excel FR). Génération via Blob + JSZip déjà chargé, téléchargé localement. Aucun fetch. (2) **Graphes camembert SVG natifs** dans Stats globales — rendu inline 100% côté client (0 dep externe), math `cos/sin` + path arc. Palette charte cohérente avec les rendus carte. Aucune transmission. (3) Nouveau module `js/shortcuts.js` (~180 lignes) — **raccourcis clavier globaux** (E M Z S T L B R) = event listeners locaux qui trigger des clicks DOM sur `_groupes[id].btnPrincipal` ou appellent `window.afficherLegende`/`CompassWidget.toggle`/`ouvrirRecherche`. Aucun fetch. (4) Nouveau module `js/presentationMode.js` (~130 lignes) — **mode présentation** via touche F = toggle CSS body class `kta-presentation-mode` + `map.invalidateSize`. Aucune communication réseau. **2 nouveaux fichiers** ajoutés à `ASSETS_TO_CACHE` : `js/shortcuts.js` + `js/presentationMode.js`. Le SW cache uniquement un bump du `CACHE_NAME` (`myktamap-cache-v1.21.0`). **Liste blanche `connect-src` inchangée** : `'self'` + `https://www.gstatic.com` (ping connectivité).
>
> **v1.20.0 (Cycle complet « Robustesse + Stats + Onboarding + Profil »)** : **AUCUNE nouvelle surface réseau**. 8 features 100 % locales regroupées en une seule release MINOR (Y+1 sur v1.19.1). (1) Skip snapshot identique = lecture IDB read-only. (2) Nouveau module `js/crashReports.js` (~220 lignes) + **nouvelle DB IDB `myktamap_crashes`** v1 store `crashes` FIFO 5 (archive auto des kills mémoire détectés par OOMGuard, lit `localStorage["kta_debug_logs"]` + méta IDB SessionBackups). Aucun fetch externe. (3) Favoris export/import = Blob téléchargé localement + `File.text()` à l'import — fichier JSON purement local. (4) Nouveau module `js/statsGlobales.js` (~520 lignes) = lecture des getters internes (`window.getRoads`, `window.getZones`, etc.) + lecture IDB `myktamap_photos` + nouvelle méthode `exportToPDF` via jsPDF déjà chargé (Blob A4 téléchargé localement). (5) Clause anti-fork « Périmètre myktamap.fr » (modale Net Doc loader + NETWORK_AUDIT). (6) Nouveau module `js/tutorial.js` (~250 lignes) = HTML statique en mémoire + flag `localStorage["myktamap_tutorial_seen_v1"]`. 8 cards auto-affichées au tout premier lancement. Rejouable via 📚 Aide. (7) Nouveau module `js/profileExportImport.js` (~1100 lignes) qui remplace l'ancien export « liste de plans » par un export profil complet (9 sections : user + registry + preferences + favoris + sessions + snapshots + tutorial + photos POI optionnelles + crashes optionnels). Format JSON unique versionné. 100 % local : lecture localStorage + IDB read-only + Blob téléchargé localement. **Exclusions par design** : ZIPs binaires des plans (trop lourds) + PIN/Face ID + UnlockGate communautaire (sécurité, jamais exportés). Rétro-compat absolue avec l'ancien format `myktamap-plans-list`. (8) Nouveau module `js/userProfile.js` (~370 lignes) + **nouvelle DB IDB `myktamap_profile` v1 store `profile`** (1 entry unique `id="me"` : surnom + photoBlob + photoMime + createdAt + updatedAt). Photo compressée localement via canvas (max 512px côté long, JPEG q88 → ~30-60 KB). Aucun fetch externe, aucune transmission. La photo est lue depuis l'IDB locale, son ObjectURL est créé via `URL.createObjectURL` et révoqué au refresh (pas de leak). Section `user` ajoutée à `ProfileExportImport` (photo base64 inline dans le JSON exporté, cochée par défaut car légère). **5 nouveaux fichiers** ajoutés à `ASSETS_TO_CACHE` : `js/crashReports.js` + `js/statsGlobales.js` + `js/tutorial.js` + `js/userProfile.js` + `js/profileExportImport.js`. **2 nouvelles DB IDB** documentées : `myktamap_crashes` + `myktamap_profile`. Le SW cache uniquement un bump du `CACHE_NAME` (`myktamap-cache-v1.20.0`). **Liste blanche `connect-src` inchangée** : `'self'` + `https://www.gstatic.com` (ping connectivité).
>
> **v1.19.1 (PATCH consolidée — 1.16.1 → 1.19.1)** : **AUCUNE nouvelle surface réseau**. Pack accumulé depuis v1.16.1 sur main, regroupé en 1 release PATCH car SURTOUT des fixes et du polish (malgré quelques features moyennes). Contenu 100 % local : (1) Générateur Simple/Avancé + édition légende plan-level (toggle UI sticky localStorage + nouvelle source de vérité `plan.customLegend` embarquée dans le ZIP plan). (2) Roundtrip légende KMZ + GPX (fichiers annexes locaux `myktamap-extras.json` dans le ZIP KMZ + `<extensions>` standard sous `<metadata>` GPX, ignorés par les apps tierces). (3) Nouveau module `js/memInspector.js` (~580 lignes) — lecture seule locale (localStorage / IndexedDB read-only / Cache API URLs / `navigator.storage.estimate()`). (4) Polish : Aide intégrée enrichie (HTML statique), `compareSemver()` exposé via `window.UpdateChecker` (fonction pure), hook client `navigator.serviceWorker.addEventListener("controllerchange")` qui affiche un toast OOMGuard local. (5) Fixes : auto-save par plan (refactor localStorage keys local), fix CSS thème clair des modales logs (refactor + overrides CSS), etc. **1 nouveau fichier** ajouté à `ASSETS_TO_CACHE` : `js/memInspector.js`. Le SW cache uniquement un bump du `CACHE_NAME` (`myktamap-cache-v1.19.1`). **Liste blanche `connect-src` inchangée** : `'self'` + `https://www.gstatic.com` (ping connectivité).
>
> **v1.19.0 (📊 État mémoire — Inspecteur de transparence & debug)** : **AUCUNE nouvelle surface réseau**. Nouveau module `js/memInspector.js` (~580 lignes) chargé tôt dans `index.html` (juste après `networkAudit.js`) et ajouté à `ASSETS_TO_CACHE`. L'Inspecteur fait UNIQUEMENT de la **lecture locale** : `localStorage` (itération + getItem), IndexedDB (`open` read-only + `objectStore.count()` — pas de read des entries), Cache API (`caches.keys()` + `caches.open().keys()` — URLs only, pas de read des blobs), `navigator.storage.estimate()` (lecture pure API navigateur). **Aucun fetch externe, aucune transmission**. Le rapport copié (bouton 📋) reste local (presse-papier navigateur via `navigator.clipboard.writeText` ou fallback `execCommand("copy")`). Bonus transparence : l'Inspecteur EST lui-même un outil d'audit qui rend visible TOUT ce que MyKTAMap a écrit localement (= confirmation visuelle pour l'utilisateur qu'aucun data parasite n'est stocké). **Liste blanche `connect-src` inchangée** : `'self'` + `https://www.gstatic.com` (ping connectivité).
>
> **v1.18.1 (Roundtrip GPX `customLegend` + preview d'import KMZ/GPX)** : **AUCUNE nouvelle surface réseau, aucun nouveau fichier**. Hotfix qui étend la v1.18.0 (KMZ uniquement) au format GPX via `<extensions><myktamap:customLegend>` standard sous `<metadata>` (xmlns:myktamap déclaré au root `<gpx>`). Les apps tierces (TopoDroid, OsmAnd, Strava, Avenza, Garmin) ignorent les `<extensions>` sous `<metadata>` standardement. Bonus UX : les modales d'import KMZ et GPX affichent explicitement « ✅ Légende personnalisée détectée » dans le résumé avant la génération du ZIP MyKTAMap reconstruit (parse local async via `Blob.text() + JSON.parse` pour KMZ, lecture directe `parsed.metadata.customLegend` pour GPX). Aucun fetch externe. Modifs internes à `js/gpxIO.js` (~45 lignes), `js/gpxImport.js` (~15 lignes), `js/sessionExporter.js` (~25 lignes), `js/createConf.js` (~50 lignes). Le SW cache uniquement un bump du `CACHE_NAME` (`myktamap-cache-v1.18.1`). **Liste blanche `connect-src` inchangée** : `'self'` + `https://www.gstatic.com` (ping connectivité).
>
> **v1.18.0 (Roundtrip KMZ de la légende plan-level)** : **AUCUNE nouvelle surface réseau, aucun nouveau fichier**. Suite directe v1.17.0 : la `PLAN_CONFIG.customLegend` éditable depuis le Générateur voyage désormais avec le KMZ exporté via un fichier annexe `myktamap-extras.json` embarqué dans le ZIP KMZ (à côté de `doc.kml`). Les apps tierces (Google Earth, OsmAnd, Avenza) ignorent ce fichier inconnu sans broncher. Au ré-import KMZ → MyKTAMap, `kmzImport.js` détecte le fichier, parse son `customLegend` et l'injecte dans `plan-config.json > plan.customLegend` du ZIP MyKTAMap reconstruit. Aucun fetch externe — tout est local (génération + parse via `Blob.text()` + `JSON.parse`). Modifs internes à `js/kmzExport.js` (~15 lignes), `js/sessionExporter.js` (~30 lignes), `js/kmzImport.js` (~25 lignes). Le SW cache uniquement un bump du `CACHE_NAME` (`myktamap-cache-v1.18.0`), aucun nouveau fichier. **Liste blanche `connect-src` inchangée** : `'self'` + `https://www.gstatic.com` (ping connectivité).
>
> **v1.17.0 (Générateur accessible — Mode Simple/Avancé + Légende plan-level)** : **AUCUNE nouvelle surface réseau, aucun nouveau fichier**. Refonte UX du Générateur 📦 Créer / Modifier un plan dans `js/createConf.js` (~300 lignes ajoutées). (1) Switcher Simple/Avancé : toggle UI 100% local persisté en `localStorage["myktamap_planner_mode"]` (string `"simple"|"avance"`). (2) Éditeur légende plan-level : nouvelle source de vérité `plan-config.json > plan.customLegend` (= cascade niveau plan), embed dans le ZIP plan généré (= fichier 100% local). Le pattern de swap session ↔ plan utilise l'éditeur existant `LegendCustomization.ouvrirEditeur` sans nouvelle API. Le SW cache uniquement un bump du `CACHE_NAME` (`myktamap-cache-v1.17.0`), aucun nouveau fichier. **Liste blanche `connect-src` inchangée** : `'self'` + `https://www.gstatic.com` (ping connectivité).
>
> **v1.16.1 (Hotfix auto-save PAR PLAN)** : **AUCUNE nouvelle surface réseau, aucun nouveau fichier**. Modification purement structurelle au niveau localStorage local : remplacement du slot unique `localStorage["myktamap_session_v1"]` par un slot indexé par planId `localStorage["myktamap_session_v1_<planId>"]` dans `js/sessionPersist.js`. Helpers internes + migration silencieuse au boot via `_migrerAncienSlotUniqueSiBesoin()`. `js/sessionBackups.js` ajusté pour lire/écrire le bon slot per-plan + appeler `PlanRegistry.setLastPlanId(targetPlanId)` avant le reload. Le SW cache uniquement un bump du `CACHE_NAME` (`myktamap-cache-v1.16.1`), pas de nouveau fichier.
>
> **v1.16.0 (UX & filet de sécurité)** : 4 nouveaux modules, **AUCUNE nouvelle surface réseau**. (1) `js/legendCustomization.js` — cascade libellés/visibilité/customs, persistance dans le payload `SessionPersist` existant (localStorage `myktamap_session_v1` jusqu'à v1.16.0, puis `myktamap_session_v1_<planId>` per-plan depuis v1.16.1). (2) `js/favoris.js` — favoris points par plan, nouvelle clé `localStorage["myktamap_favoris_v1"]` indexée par planId (local-only). (3) `js/sessionBackups.js` — 10 snapshots FIFO via **nouvelle IndexedDB** `myktamap_backups` v1 (store `backups`), pas de fetch externe. Restore par écriture localStorage + `location.reload()` (pas d'appel réseau). (4) Hotfixes CSS thème clair compass + reformulation des modales « Changer de plan » : changements UI purs, zéro impact réseau. **Tous les fetchs restent same-origin**. Le SW cache 3 fichiers JS de plus au boot (`./js/legendCustomization.js`, `./js/favoris.js`, `./js/sessionBackups.js`), toujours same-origin.
>
> **v1.15.0 (📤 Import GPX → ZIP MyKTAMap)** : nouveau module `js/gpxImport.js` (~310 lignes). 100% local côté fichiers (`FileReader` + `DOMParser` + canvas natif + `JSZip` + `Blob`). Une seule particularité réseau : pour restaurer les icônes des tags ingérés (default, track, et tous les tags rencontrés dans les waypoints du GPX), le module fait `fetch("icon/<tag>.png")` sur l'app courante (**same-origin**, déjà whitelisté). Ces icônes sont cached par le Service Worker → le fetch est servi depuis le cache local et marche offline. Aucun nouveau call vers un domaine tiers. Le SW cache un fichier de plus (`./js/gpxImport.js`) au boot, toujours same-origin.
>
> **v1.14.0 (📤📥 GPX import + export)** : aucune nouvelle connexion réseau introduite. Le nouveau module `js/gpxIO.js` (~360 lignes) opère **uniquement** sur des fichiers locaux : `FileReader` pour la lecture en import, `Blob` + URL.createObjectURL pour le téléchargement en export. Aucun fetch, aucun ping. Le parsing GPX utilise `DOMParser` natif du navigateur, pas de lib tierce. Le SW cache un fichier de plus (`./js/gpxIO.js`) au boot, toujours same-origin.
>
> **v1.13.0 (Thème CLAIR + Itinéraire mode urgence + Fix hauteurs modales)** : aucune nouvelle connexion réseau introduite. Le nouveau module `js/themeManager.js` (~150 lignes) opère **uniquement** en `localStorage` (clé `myktamap_theme_v1`) + classes CSS sur `<html>` et `<body>`. Aucun fetch, aucun ping. Les ~1200 lignes de CSS overrides ajoutées sont chargées via `css/style.css` same-origin déjà whitelisté. Le seul effet observable côté réseau : le SW cache un fichier de plus (`./js/themeManager.js`) au boot.
>
> **v1.12.0 (Pack terrain V2)** : aucune nouvelle connexion réseau introduite. Les 4 fonctionnalités V2 (🪫 batterie, 📊 stats, 🎬 replay tracker, 🔥 heatmap désactivée) sont **100 % client-side**. La Battery Status API utilisée par `batteryGuard.js` lit une info **locale** du navigateur (pas de fetch). Le replay tracker lit la timeline en RAM. L'export CSV/TXT génère un Blob local téléchargé directement. La modale Doc complète + l'aide IA charge `docs/AI_CONTEXT.md` qui mentionne maintenant les nouvelles fonctions — toujours via le même endpoint same-origin.
>
> Ce document explique **exactement** ce que l'application fait sur le réseau,
> **comment vérifier toi-même** que rien ne fuit, et **comment activer le mode
> hors-ligne strict** si tu veux une garantie active côté navigateur.

---

## 🎯 La promesse en une ligne

**MyKTAMap est une application 100 % client-side. Aucune de tes annotations,
sessions, plans ou données personnelles n'est jamais envoyée à un serveur,
ni à un service tiers. Point final.**

C'est vérifiable **par toi-même** sans avoir à nous croire sur parole — la
suite du document t'explique comment.

---

## 🛡️ Périmètre de cette garantie : `myktamap.fr`

> **⚠️ Cette garantie de sécurité et de non-télémétrie s'applique
> UNIQUEMENT au domaine officiel `myktamap.fr`** (et à l'environnement
> de développement `devmap.is-underground.fr`, géré par le même auteur).

Le code source de MyKTAMap est **public** sous licence CC BY-NC-SA 4.0. Il
peut donc être **copié, forké, miroir ou redéployé** par n'importe qui dans
le monde. Toute installation tierce — peu importe qu'elle se présente sous
un autre nom, un autre domaine, ou même qu'elle clame être « MyKTAMap » —
peut contenir des **modifications dont nous ne sommes pas responsables** :

- du code de tracking ajouté (analytics, fingerprinting)
- de l'exfiltration discrète de données vers un serveur tiers
- du code malveillant injecté (vol de données, redirection, etc.)
- des modifications subtiles de la liste blanche réseau

Nous n'avons **aucun moyen** de vérifier ce qui se passe sur ces
installations parallèles. Aucune mesure technique ne peut empêcher
quelqu'un de prendre notre code et de le modifier.

### Comment t'assurer que tu es sur le vrai site ?

1. Vérifie l'URL dans la **barre d'adresse** de ton navigateur
2. Elle doit commencer par `https://myktamap.fr` ou `https://devmap.is-underground.fr`
3. Vérifie que le cadenas 🔒 est présent (HTTPS valide, certificat émis par Let's Encrypt)
4. Si l'URL ne correspond pas, **tout ce qui est écrit dans cette page ne te concerne pas** — c'est une copie tierce sur laquelle nous n'avons aucun contrôle

> *NB : pour les utilisateurs qui veulent self-héberger MyKTAMap (cas
> légitime — c'est tout l'intérêt d'un code open source), c'est parfaitement
> autorisé sous la licence CC BY-NC-SA. Mais dans ce cas, **c'est toi qui es
> responsable** de garantir l'intégrité de ta propre installation à tes
> utilisateurs.*

---

## 🏛️ Le modèle technique (en bref)

MyKTAMap est une **Progressive Web App (PWA)** servie comme un site web
statique. Concrètement :

| Composant | Rôle | Stockage |
|---|---|---|
| **Ton navigateur** | Exécute tout le code de l'app, gère l'interface, fait les calculs (pathfinder, export PNG, KMZ…) | localStorage + IndexedDB (uniquement local) |
| **Notre serveur Nginx** | Sert les fichiers statiques de l'app (HTML, JS, CSS, images, plans serveur de démo) | Aucune base de données, aucune session utilisateur |

**Pas de backend applicatif.** Pas de base de données serveur. Pas de
compte utilisateur. Pas de session côté serveur. Pas de cookies de tracking.
Pas d'analytics tiers (Google Analytics, Matomo, etc.). Pas de CDN tiers.

Tout ce que tu crées dans l'app (points, tracés, zones, sessions, plans
mémorisés, calibrations KMZ, préférences) **reste dans ton navigateur**,
dans des espaces de stockage isolés à ton appareil (localStorage et
IndexedDB).

---

## 📡 La liste blanche complète des connexions réseau

Voici la liste **exhaustive et nominative** de toutes les URLs que l'app
peut contacter, avec leur fréquence, leur méthode HTTP, et **ce qui est
envoyé** (réponse : rien, jamais).

| Endpoint | Méthode | Quand | Pourquoi | Données envoyées |
|---|---|---|---|---|
| `<origin>/*` (HTML, JS, CSS, images, JSON) | `GET` | Au boot + cache PWA | Charger l'app | **Aucune** |
| `<origin>/version.json` | `GET` | Au boot, puis check périodique | Détecter une nouvelle version dispo | **Aucune** |
| `<origin>/alert.json` | `GET` | Au boot | Diffusion d'alertes publiques (incendie, fermeture site, etc.) | **Aucune** |
| `<origin>/data/<plan>/*` | `GET` | Charge d'un plan serveur | Lecture des fichiers d'un plan (image + JSON) | **Aucune** |
| `<origin>/docs/README_USER.md`, `<origin>/docs/AI_CONTEXT.md`, `<origin>/docs/NETWORK_AUDIT.*` | `GET` | Ouverture des modales Documentation / Aide IA / Audit | Affichage du contenu | **Aucune** |
| `<origin>/ping.html` | `GET` (same-origin, body lu) | Avant un reset complet, avant un Force update | Tester Internet + santé serveur MyKTAMap (DNS / SSL / Nginx, body attendu `"OK"`) | **Aucune** (GET sans paramètres, pas de cookies via `credentials: "omit"`, same-origin) |
| `blob:<origin>/<uuid>` | `GET` | Chargement des tuiles V2 d'un plan tuilé | Déréférencer une tuile JPEG depuis le ZIP **déjà en mémoire** dans le navigateur | **Aucune** (blob URL = référence locale au navigateur, ne sort pas) |
| `data:<mime>;base64,...` | `GET` | Icônes SVG inline, certains exports | Déréférencer une donnée encodée en base64 **dans le code de l'app** | **Aucune** (data URL = pas de fetch réseau réel) |

`<origin>` = le domaine sur lequel l'app est servie. Pour la prod c'est
`myktamap.fr` (ou `myktamap.fr` après le 15 juillet 2026).
Pour dev : `devmap.is-underground.fr`. Sur ton réseau local en
développement : `localhost` ou IP locale.

**Aucun `POST`, `PUT`, `PATCH`, `DELETE`, `sendBeacon`, `WebSocket`,
`EventSource` ou n'importe quelle autre méthode d'envoi de données vers
un serveur n'est jamais émise par l'app.** Si un jour ça change, ce
fichier sera mis à jour en conséquence et la version sera bumpée.

### À propos du ping `<origin>/ping.html` (depuis v1.9.3)

**Avant v1.9.3** : l'app utilisait `https://www.gstatic.com/generate_204`
(endpoint Google) pour détecter Internet. **Depuis v1.9.3**, l'app utilise
**uniquement** un fichier `/ping.html` servi sur **le même domaine que
l'app** (same-origin) :

- Prod : `https://myktamap.fr/ping.html`
- Dev : `https://devmap.is-underground.fr/ping.html`
- Future prod : `https://myktamap.fr/ping.html`

L'URL est résolue dynamiquement via `location.origin + "/ping.html"`.
Le body attendu est exactement `"OK"`.

**Pourquoi ce changement ?** Plus aucun appel externe vers un service
tiers, même bénin comme Google. Le ping same-origin permet en outre de
vérifier **en un seul appel** :

- Connexion Internet active (DNS résout, route IP atteignable)
- Certificat SSL du domaine valide
- Serveur Nginx en ligne et répond correctement
- La PWA peut tenter le pull SW (skipWaiting + cache purge)

L'app l'appelle en mode same-origin (default) avec `credentials: "omit"` :
**aucun cookie n'est envoyé**, et seul le body `"OK"` (texte brut) est
lu pour vérification. Si le serveur répond autre chose (404, 500, body
différent), le ping est traité comme "indispo" et l'app refuse de
tenter la mise à jour douce.

Si tu préfères ne pas faire ce ping du tout, **active le mode hors-ligne
strict** (cf. plus bas) : il sera bloqué comme tout autre appel non
local.

---

## 🔍 Comment vérifier toi-même (3 méthodes)

### Méthode 1 — Le journal réseau intégré (le plus simple)

L'app loggue **en temps réel** toutes ses requêtes réseau dans un
journal interne. Tu peux le consulter à tout moment :

1. **Page d'accueil → ⚙️ Configuration** (header)
2. Section **🔒 Confidentialité & Audit**
3. Bouton **📋 Voir le journal réseau**

Tu y verras chaque requête avec :
- L'heure exacte
- La méthode (GET, POST, etc.)
- L'URL complète
- La catégorie (`app-script`, `plan-data`, `ping`, etc.)
- Si la requête envoyait des données (`hasBody: true/false`)
- Le statut HTTP de la réponse
- Si elle a été bloquée par le mode hors-ligne strict

Tu peux **copier** le journal au format texte ou **exporter en JSON**
(bouton 📥) pour le partager / l'archiver / le faire auditer par un tiers.

### Méthode 2 — Les outils de développement du navigateur

Tu n'es pas obligé de nous faire confiance sur notre propre journal. Tu
peux utiliser l'inspecteur natif de ton navigateur, qui voit **toutes**
les requêtes réseau quel que soit ce que l'app fait :

**Sur PC** :
1. Appuie sur `F12` (ou `Cmd+Opt+I` sur Mac)
2. Onglet **Network** (ou **Réseau**)
3. Recharge la page (`F5`)
4. Utilise l'app normalement — chaque requête s'affiche dans la liste
5. Filtre par méthode pour vérifier qu'il n'y a **aucun POST/PUT/PATCH/DELETE**

**Sur mobile** :
1. Branche ton téléphone à un PC via USB
2. **Android** : Chrome PC → `chrome://inspect` → sélectionne l'onglet de
   ton mobile → DevTools normal
3. **iPhone** : Safari Mac → Préférences → Avancé → cocher « Afficher menu
   Développement » → Mac Safari → menu Développement → ton iPhone

### Méthode 3 — Lire le code source

L'app est servie en code clair (HTML/JS/CSS minifiés ou non selon
l'environnement). Tu peux :

- **F12 → onglet Sources** : naviguer dans tous les fichiers JS de l'app
- **Chercher** les chaînes `fetch(`, `XMLHttpRequest`, `sendBeacon`, etc.
- Vérifier que tous les appels ciblent des URLs locales (`/...`, `./...`)
  ou la whitelist documentée ci-dessus

Le module dédié `js/networkAudit.js` (~350 lignes, commenté) instrumente
toutes les API réseau et est le code source qui alimente le journal de la
Méthode 1. Tu peux le lire en intégralité pour comprendre la mécanique.

---

## 🛡️ Le mode hors-ligne strict (paranoia opt-in)

Si la liste blanche te suffit pas et que tu veux une **garantie active
côté navigateur**, active le **Mode hors-ligne strict** :

1. **Page d'accueil → ⚙️ Configuration**
2. Section **🔒 Confidentialité & Audit**
3. Coche **🔒 Mode hors-ligne strict**

Une fois activé :
- **Toute requête sortante non-whitelistée est interceptée et bloquée
  AVANT même d'atteindre le réseau** (le navigateur reçoit une exception,
  pas un timeout).
- Un badge orange `🔒 PARANOIA` apparaît dans le footer de la page d'accueil
  pour te rappeler que le mode est actif.
- L'app continue de fonctionner normalement (annotations, calculs, exports
  PNG/KMZ, navigation, multi-niveau, itinéraire, tracker… tout ce qui ne
  nécessite pas de réseau).
- Les seules choses qui ne marcheront plus :
  - La **détection automatique de mise à jour** (puisque `version.json` est
    bloqué — sauf qu'il est en `<origin>` donc whitelisté par défaut)
  - Les **plans serveur** que tu n'as pas encore mémorisés (mais ils sont
    en same-origin donc whitelistés aussi)
  - Le **ping `<origin>/ping.html`** avant un reset / force update

Le toggle est **persistant** : il survit aux reloads et aux fermetures
d'onglet, jusqu'à ce que tu le décoches manuellement (ou que tu fasses
un reset complet via 💥 Tout réinitialiser).

### Différence avec le mode `Avion` de ton OS

Le mode Avion coupe le WiFi/4G/5G entièrement. Le mode hors-ligne strict
de MyKTAMap, lui, **te laisse une connexion fonctionnelle** pour le reste
de ton appareil (autres apps, navigateur) mais bloque uniquement les
appels que MyKTAMap pourrait faire. Tu peux donc faire des recherches
web en parallèle pendant que MyKTAMap reste isolée.

---

## 🔐 La Content Security Policy (CSP)

En plus du module d'audit côté JS, le serveur Nginx envoie un en-tête HTTP
`Content-Security-Policy` qui **demande à ton navigateur** de bloquer toute
tentative d'envoi de données vers un domaine non autorisé.

C'est une **double protection** : même si un attaquant injectait du code
malveillant dans une dépendance, ton navigateur lui-même refuserait
l'envoi.

Tu peux vérifier la CSP appliquée :
1. `F12` → onglet **Network**
2. Recharge la page
3. Clic sur la première requête (le HTML de la page)
4. Onglet **Headers** → cherche `Content-Security-Policy`

La directive clé est `connect-src 'self';` — le
navigateur n'acceptera pas d'envoyer des données ailleurs.

Le fichier de configuration Nginx exact est versionné dans le dépôt sous
`docs/nginx-csp-config.conf` (visible à toute personne ayant accès au
code).

---

## 🪪 Permissions API navigateur utilisées

L'app utilise un nombre limité d'API navigateur qui peuvent demander
une permission. **Aucune** de ces API ne fait sortir de donnée du
navigateur. Tableau exhaustif :

| API | Quand | Permission requise ? | Donnée envoyée ? |
|---|---|---|---|
| **Geolocation API** | Calibrage KMZ + Mode urgence si l'user le déclenche | Oui (prompt navigateur explicite) | **Aucune** (lecture pure, jamais transmise) |
| **DeviceMotion / DeviceOrientation** | Tracker (PDR + boussole) | Oui sur iOS (prompt explicite via user gesture) | **Aucune** (lecture pure capteurs locaux) |
| **Wake Lock API** *(NOUVEAU v1.21.1)* | Toggle ⚙️ Réglages → "Garder l'écran allumé" | Non (politique navigateur — accordée silencieusement en HTTPS si l'onglet a le focus) | **Aucune** (lock binaire) |
| **Clipboard API** *(usage étendu v1.21.2)* | Bouton 📋 dans popup point (coords GPS) + 📋 Copier dans modale audit, inspecteur mémoire, etc. | Non en écriture user-initiated en HTTPS (silencieuse via `writeText`) | **Aucune** (l'app écrit dans le presse-papier, ne le lit jamais) |
| **WebAuthn (`navigator.credentials`)** | Activation Face ID / Touch ID / Windows Hello pour le PIN | Oui (prompt natif device) | **Aucune** (challenge généré côté client, validation locale) |
| **Battery Status API** | Indicateur batterie sidebar + mode urgence | Politique navigateur (header `Permissions-Policy: battery=(self)` côté Nginx) | **Aucune** (lecture pure) |
| **Screen Orientation API** | Correction heading boussole en landscape | Aucune | **Aucune** |
| **Storage API (`navigator.storage.estimate`, `persist`)** | Inspecteur mémoire + auto-persist mobile | Oui (`persist` prompt navigateur sur certains browsers) | **Aucune** |

### À propos du Wake Lock API (v1.21.1+)

- **Hidden si non supporté** : `WakeLock.isSupported()` vérifie l'existence
  de `navigator.wakeLock.request` avant tout affichage. Sur Firefox
  (bug Mozilla #1589554 toujours ouvert en 2026) et Safari < 16.4,
  le toggle "Garder l'écran allumé" n'apparaît tout simplement pas dans
  les Réglages. Aucune erreur silencieuse.
- **Pas de fingerprinting** : l'API ne renvoie qu'un objet sentinel
  binaire `WakeLockSentinel`. Aucune info device (modèle, batterie,
  capteurs) n'est exposée. La pref est en `localStorage` strict.
- **Auto-release** : le browser libère automatiquement le lock au
  `visibilitychange→hidden`. Le module ré-acquire au retour visible si
  l'option est activée. Cohérent best practice MDN.
- **Pas de pingback serveur** : 0 fetch réseau dans `wakeLock.js`
  (vérifiable via le journal réseau intégré → Méthode 1).

### À propos de la Clipboard API (extension v1.21.2)

- Usage en **écriture seule** (`navigator.clipboard.writeText`),
  jamais en lecture (`readText`).
- L'app **n'accède jamais** au contenu du presse-papier de l'user.
- Trigger toujours sur **user click explicite** (bouton 📋 inline,
  pas d'écriture passive au load).
- Fallback `document.execCommand("copy")` via textarea hors-écran si
  l'API n'est pas dispo (HTTP non-sécurisé, vieux browsers).

---

## 🧰 Stockage local — où vivent tes données

Toutes tes données sont **strictement locales** à ton appareil et à ton
navigateur. Tu peux les inspecter et les supprimer toi-même via `F12` :

| Espace | Contenu | Comment l'inspecter |
|---|---|---|
| **localStorage** | Préférences (`debugMode`, `perfPreset` par plan, `unlock gate`, alertes acquittées, préfs d'évitement itinéraire, paranoia, `myktamap_wake_lock_v1` boolean depuis v1.21.1, `myktamap_session_v1_<planId>` per-plan **enrichi depuis v1.21.2 avec trackerTimeline + trackerStartTs** — impact taille : ~1800 entries × ~80 bytes ≈ ~140 KB pour une session de 30 min de tracking continu, soit ~2 % du quota 5 MB localStorage typique navigateur, etc.) | F12 → Application → Local Storage |
| **localStorage → `myktamap_plan_stats_v1_<planId>`** (v1.21.4+) | **NOUVEAU v1.21.4** — Cache de stats agrégées par plan : `{pois, roads, distPx, breakdowns: {pointsByTag, roadsByType, zonesByType, structsByType}, ts, source}`. Counts uniquement (jamais de Blob/photo data). JSON-serialisé strictement local. Alimenté par `_computePlanStatsLive` + `_persisterStatsPlanCourant` (agrégation session + embedded via getters publics). | F12 → Application → Local Storage |
| **localStorage → `myktamap_loader_bar_stats_v1`** (v1.21.4+) | **NOUVEAU v1.21.4** — Configuration de la bandeau profil du loader : array de keys (`["time", "storage", "plans"]`). Default `["time", "storage"]`. Persistance pure locale, aucune transmission. | F12 → Application → Local Storage |
| **localStorage → `myktamap_skip_server_plans_v1`** (v1.21.4+) | **NOUVEAU v1.21.4** — Boolean `"true"` / `"false"`. Si actif, `main.js > initApp` skip le `fetch("data/index.json")` au boot → **RÉDUIT la surface réseau de 1 fetch par boot**. Default OFF (v1.21.3 strict). Pref locale uniquement. | F12 → Application → Local Storage |
| **IndexedDB → `myktamap_handles`** | Handles FS Access API (Chrome desktop) + blobs ZIP des plans mémorisés (mobile/Safari/Firefox) | F12 → Application → IndexedDB |
| **IndexedDB → `myktamap_backups`** (v1.16.0+) | 10 snapshots FIFO de session, **embed depuis v1.21.2 la trackerTimeline** (impact taille IDB proportionnel) | F12 → Application → IndexedDB |
| **IndexedDB → `myktamap_photos`** (v1.10.0+) | Photos POI compressées localement, max 5/point | F12 → Application → IndexedDB |
| **IndexedDB → `myktamap_crashes`** (v1.20.0+) | Crash reports OOM (archive auto FIFO 5) | F12 → Application → IndexedDB |
| **IndexedDB → `myktamap_profile`** (v1.21.0+) | **NOUVEAU v1.21.0** — Surnom + photo profil utilisateur (1 seule entry `id="me"`, schema v1). Photo en Blob IDB, compressée canvas (max 512px JPEG q88). Jamais transmise. | F12 → Application → IndexedDB |
| **Cache Storage** | Assets PWA pour le mode hors-ligne | F12 → Application → Cache Storage |
| **Service Worker** | Code du SW qui gère le cache | F12 → Application → Service Workers |

Pour **tout effacer** d'un coup : ⚙️ Configuration → 💥 Tout réinitialiser
(double confirmation + ping internet de sécurité pour éviter de te
retrouver sans cache hors-ligne).

---

## 🔭 Sur les analytics, le tracking, les cookies

- **Pas d'analytics** : ni Google Analytics, ni Matomo, ni Plausible,
  ni Fathom, ni quoi que ce soit. L'auteur n'a aucune visibilité sur qui
  utilise l'app ni comment.
- **Pas de cookies** : l'app n'écrit aucun cookie HTTP. Aucune session
  serveur, aucune session tracking.
- **Pas de pixel tracking** : aucune balise `<img>` distante. Toutes les
  images de l'app sont en same-origin.
- **Pas de fingerprinting** : aucun script ne lit l'UA, la résolution
  d'écran, la liste des polices, le canvas… au-delà de ce qui est
  fonctionnellement nécessaire (responsive design via media queries CSS).

---

## 🤝 La position de l'auteur

> *Je suis cataphile depuis 2016. Je connais la culture, et je sais que la
> méfiance envers une appli qui aurait une backdoor pour exfiltrer les
> plans est totalement légitime. C'est pour ça que j'ai conçu MyKTAMap
> comme une PWA 100 % client-side dès le départ : ce n'est pas un choix
> a posteriori pour rassurer, c'est l'architecture même de l'app. Il n'y
> a tout simplement aucun endroit côté serveur où tes données
> pourraient atterrir, parce qu'il n'y a aucun code applicatif côté
> serveur. Tout est conçu pour être vérifiable. Si tu trouves quoi que
> ce soit qui contredit ce document, contacte-moi directement via le
> site officiel — je corrigerai immédiatement.*
>
> — **KARMA**, auteur de MyKTAMap

---

## 📋 Historique des changements de ce document

| Version | Date | Changement |
|---|---|---|
| v1.21.4 | 25/05/2026 | **🩹 PATCH — Stats plans agrégées + Wake Lock global + skipServer + Heatmap M-LVL** — pack de 7 sujets 100 % locaux. **AUCUNE nouvelle surface réseau, aucune nouvelle permission, aucun nouveau fichier**. Bonus côté réseau : **-1 fetch au boot** si l'user active la pref `myktamap_skip_server_plans_v1` (skip `fetch("data/index.json")` conditionnel, default OFF). Sujets audités : (1) `_calculerStorageMyktamapBytes` (lecture pure localStorage + 6 stores IDB read-only via cursor, cache 30s module-scope), (2) `_computePlanStatsLive` + `_persisterStatsPlanCourant` (agrégation in-memory + cache localStorage counts uniquement, pas de Blob/photo), (3) `_calculerStatsPlansAggregees` (lecture localStorage séquentielle avec yield `setTimeout(0)` anti-crash), (4) camemberts SVG agrégés cross-plan (rendu canvas/SVG natif via `window.StatsGlobales.renderPieChart`, palette charte hardcodée), (5) `PROFILE_BAR_STATS` configurable (nouvelle localStorage key `myktamap_loader_bar_stats_v1`), (6) option skip plans serveur (nouvelle localStorage key `myktamap_skip_server_plans_v1`, bonus réseau), (7) filtre M-LVL Heatmap (`opts.levels` Set<number> mémoire JS). **3 nouvelles localStorage keys documentées**, toutes strictement locales (calcul + agrégation client-side pur). **Liste blanche `connect-src` inchangée** : `'self'` + `https://www.gstatic.com`. Verdict audit : **✅ aucune régression — MyKTAMap reste strictement offline-first**. |
| v1.21.3 | 25/05/2026 | **🛡️ PATCH anti-crash mobile** — pack des 10 P0 de l'audit lecture seule. **AUCUNE nouvelle surface réseau, aucune nouvelle permission, aucun nouveau fichier**. Fixes runtime sur la robustesse mémoire/leaks/race conditions : cap dur timeline tracker (20 000 entries) + décimation FIFO, `canvas.toBlob` + revoke ObjectURL pour heatmap (économie ~10 Mo/render), `MAX_DIM` dynamique 1024 sur device low-mem, seuil `MAX_SEGMENTS=50000` avec warning OOMGuard, token génération anti-zombies rAF data layer au plan switch, tracking timers BatteryGuard pour clear au switch, purge étendue `_libererRessourcesPlanPrecedent` (4 registres `_ktaData*` + ghosts + EmergencyMode listener), fix slot legacy `_skipEditorJsonLoad`, LRU eviction SW cap 800 entrées dynamiques avec `_staticAssetUrls` protégés. Pack v1.21.2 (jamais shipped main seule) intégralement inclus. **Liste blanche `connect-src` inchangée** : `'self'` + `https://www.gstatic.com`. Verdict audit : **✅ aucune régression — promesse offline-first strictement préservée**. |
| v1.21.2 | 25/05/2026 | **🪪 Profil + 🔆 Wake Lock + 🔥 Heatmap réactivée + 🌐 Popup GPS** — cycle de 4 features 100 % locales. **Aucune nouvelle connexion réseau**. (1) `js/userProfile.js` + nouvelle DB IDB `myktamap_profile` v1 (surnom + photo compressée canvas, max 512px JPEG q88 ≈ 30-60 KB, jamais transmise). (2) `js/wakeLock.js` — `navigator.wakeLock.request("screen")`, permission politique navigateur (pas de prompt user), hidden si non supporté (Firefox bug #1589554, Safari < 16.4), 0 fetch réseau, 0 fingerprinting, pref `localStorage["myktamap_wake_lock_v1"]`. (3) **Heatmap réactivée** — `js/heatmap.js` ré-inclus dans `index.html` + cache SW. Rendu 100 % canvas local (radial gradients + colormap via `getImageData`/`putImageData`). `canvas.toDataURL` consommé exclusivement par `L.imageOverlay` interne (jamais POSTé). (4) **Popup point — ligne GPS** (`utils.js > buildPointPopupHtml`) : calcul 100 % client-side via `KmzExport.planToGps` (transformation affine 2D pure, aucun appel à un service de géocodage type Nominatim/Google). Bouton 📋 utilise `navigator.clipboard.writeText` (Clipboard API, écriture seule, scope tab, permission silencieuse en HTTPS) + fallback `execCommand`. String GPS escapée via `_escAttr` + replace des `'` pour le `onclick` inline → **surface XSS validée** (la valeur GPS provient d'un calcul JS sur les coords numériques du plan, jamais d'input user). Bonus impact : trackerTimeline + trackerStartTs sont désormais embarqués dans les exports session (Full + Avancé) — **coords en x/y plan local, pas GPS** (validé contre leak GPS implicite : si plan calibré, la calib est dans `localStorage` séparé, pas dans le payload session). Sessions importables/réimportables sans fuite GPS. **2 nouvelles permissions API documentées** dans la nouvelle section dédiée : Wake Lock (politique navigateur) + Clipboard (writeText user-initiated). **1 nouvelle DB IDB documentée** : `myktamap_profile`. **Liste blanche `connect-src` inchangée** : `'self'` + `https://www.gstatic.com`. Verdict audit : **✅ aucune régression privacy — MyKTAMap reste strictement offline-first**. |
| v1.14.0 | 23/05/2026 | **📤📥 GPX import + export** — première feature Phase 1 V3 quick wins. Nouveau module `js/gpxIO.js` (~360 lignes) qui opère uniquement sur des fichiers locaux : `FileReader` (import), `Blob` + `URL.createObjectURL` (export download), `DOMParser` natif (parse XML). Aucun fetch, aucun ping. Le SW cache un fichier de plus (`./js/gpxIO.js`) au boot, toujours same-origin (couvert par la règle de whitelist existante). Réutilise intégralement le calibrage KMZ existant (`window.KmzExport.planToGps` + nouveau `gpsToPlan`) — pas de nouvelle data envoyée nulle part. **Aucune nouvelle connexion réseau introduite**, aucune modification de la whitelist du module Privacy & Audit. |
| v1.13.0 | 23/05/2026 | **Thème CLAIR global + Itinéraire mode urgence + Fix hauteurs modales** — première release V3. Module `js/themeManager.js` (~150 lignes) qui opère **uniquement** en `localStorage["myktamap_theme_v1"]` + classes CSS sur `<html>` et `<body>`. Aucun fetch réseau, aucun ping. ~1200 lignes de CSS overrides ajoutées dans `css/style.css` (chargé via le SW same-origin existant, déjà whitelisté). Le SW cache un fichier de plus au boot : `./js/themeManager.js` — toujours same-origin, couvert par la règle de whitelist existante. **Aucune nouvelle connexion réseau introduite**, aucune modification de la whitelist du module Privacy & Audit. Le mode hors-ligne strict continue de fonctionner exactement comme avant (le toggle ne fait pas de requête, juste un switch de classe CSS locale). |
| v1.12.0 | 23/05/2026 | **Pack terrain V2** — consolidation de 4 fonctionnalités V2.1 → V2.4 : 🪫 **batterie** (Battery Status API navigateur, lecture locale, 0 fetch réseau), 📊 **stats session enrichies + ⬛ mesure de surface** (calculs Shoelace 100% local), 🎬 **replay tracker + export CSV** (timeline en RAM, Blob download local), 🔥 **heatmap** (implémentée mais DÉSACTIVÉE en v1.12.0, code en standby). **Aucune nouvelle connexion réseau introduite** — toutes les V2 sont strictement client-side. Le header `Permissions-Policy: battery=(self)` a été ajouté côté Nginx (`docs/nginx-csp-config.conf`) pour ouvrir l'accès à l'API navigateur en top-level (sinon certains contextes sandbox bloquaient l'API même en Chromium). Cela ne change rien au comportement réseau de l'app. |
| v1.11.0 | 23/05/2026 | Release MINOR : ⏪ **Undo/Redo global** ajouté (raccourcis Ctrl+Z / Ctrl+Y + boutons sidebar). Module `js/historyManager.js` 100% client-side, snapshots en RAM uniquement (jamais persistés sur disque ni localStorage), reset au reload + plan switch. **Aucune modification de la whitelist du module Privacy & Audit** : tout l'historique vit en mémoire vive locale, jamais transmis. Consolidation aussi de v1.10.3 (PDF + Recherche unifiée + Fix structures + Migration domaine — voir entrées ci-dessous pour le détail). |
| v1.10.3 | 23/05/2026 | Release V1.suite : 📤 Export PDF imprimable (jsPDF UMD inclus localement, aucun appel externe — la lib pèse ~356 KB et est servie depuis `lib/jspdf.umd.min.js` same-origin). 🔍 Recherche unifiée Ctrl+K (étend `searchPoints.js` à 4 catégories — purement client-side, aucune nouvelle requête réseau). 🏛️ Fix structures embedded dans exports canvas. **Migration domaine officielle** `myktamap.is-underground.fr` → `myktamap.fr` (changement de domaine production — l'ancien redirige automatiquement, la conf Nginx de transition est versionnée dans `docs/nginx-redirect-old-domain.conf`). **Aucune modification de la whitelist du module Privacy & Audit** : ajout de `lib/jspdf.umd.min.js` qui est same-origin (couvert par la règle existante), aucun appel externe. |
| v1.10.0 | 23/05/2026 | Ajouts massifs côté features (📸 photos POI complètes + 🔐 code d'accès local PIN/Face ID). **Aucune modification du module Privacy & Audit** ni de sa whitelist. Les photos restent en IndexedDB local (jamais envoyées sur Internet). Le PIN est haché côté client (SHA-256 + salt random) et stocké en localStorage local (jamais envoyé). La biométrie utilise WebAuthn navigateur natif (`navigator.credentials.*`, 100% local, aucun fetch externe — challenge généré aléatoirement côté client). Aucun ajout à la liste blanche. |
| v1.9.2 | 22/05/2026 | Polish post-refonte UI. **Aucune modification du module Privacy & Audit** ni de sa whitelist. Document re-vérifié et validé conforme — la promesse 100% client-side reste inchangée. Mise à jour cosmétique de la modale d'audit réseau pour matcher la nouvelle charte (élargissement PC, alignement du loader, etc.). |
| v1.9.1 | 21/05/2026 | Refonte UI majeure — nouvelle interface par défaut. **Aucune modification du module Privacy & Audit** ni de sa whitelist. Le module `networkAudit.js` continue de tracer 100% des requêtes réseau, et la liste blanche reste identique (`same-origin`, `gstatic.com/generate_204`, `blob:`, `data:`). Document re-vérifié conforme. |
| v1.8.1 | 21/05/2026 | Consolidation Privacy & Audit : page d'audit en HTML formaté (au lieu de markdown brut intercepté par le SW), whitelist élargie à `blob:` et `data:` (références locales), classification `local-blob`/`local-data` distincte de `external`, CSP ajustée (`'unsafe-inline'` sur `script-src` + `blob:` sur `connect-src`), modale Configuration responsive PC 2 colonnes, fixes débordements UI. |
| v1.8.0 | 21/05/2026 | Création initiale du document. Module `networkAudit.js`, Mode hors-ligne strict, CSP Nginx. |

---

## 📬 Signaler une fuite ou un problème

Si tu observes **n'importe quelle requête réseau** émise par MyKTAMap
qui ne figure pas dans la liste blanche ci-dessus, contacte l'auteur
immédiatement via [myktamap.fr](https://myktamap.fr).
Le document sera corrigé et le code patché en priorité absolue.

---

*Dernière mise à jour : 25 mai 2026 — **v1.21.4** (Privacy & Audit inchangé depuis v1.8.1, header Permissions-Policy `battery=(self)` ajouté en v1.12.0, aucune nouvelle whitelist en v1.13.0 — `themeManager.js` same-origin, aucune nouvelle whitelist en v1.14.0 — `gpxIO.js` same-origin, aucune nouvelle whitelist en v1.15.0 — `gpxImport.js` same-origin + fetch icônes app cached SW, aucune nouvelle whitelist en v1.16.0 — `legendCustomization.js` / `favoris.js` / `sessionBackups.js` zéro fetch externe + DB IDB `myktamap_backups` strictement locale, aucune nouvelle whitelist en v1.21.2 — `userProfile.js` + `wakeLock.js` + `heatmap.js` réactivé + popup GPS `kta_copierGps` tous strictement client-side, nouvelle DB IDB `myktamap_profile` strictement locale, 2 nouvelles permissions API documentées : Wake Lock + Clipboard, surface XSS popup GPS auditée et validée — escape `_escAttr` + replace quotes appliqués, valeur GPS issue d'un calcul pur sur coords numériques jamais d'input user, aucune nouvelle whitelist en v1.21.3 — pack PATCH anti-crash 10 P0 purement runtime sans nouveau fichier ni nouvelle API navigateur, LRU eviction SW reste same-origin et ne change pas le périmètre `connect-src`, **aucune nouvelle whitelist en v1.21.4** — 7 sujets 100 % locaux (stats agrégées + camemberts SVG cross-plan + skipServer + Heatmap M-LVL filter + Wake Lock global + 3 nouvelles localStorage keys toutes strictement locales). **Bonus côté réseau v1.21.4** : nouvelle pref `myktamap_skip_server_plans_v1` qui SUPPRIME le `fetch("data/index.json")` au boot si activée (-1 fetch par boot, default OFF = comportement v1.21.3 strict). C'est le **premier opt-in qui RÉDUIT la surface réseau** depuis l'introduction de l'audit en v1.8.0)*

---

## 🔎 Synthèse audit v1.21.4

**Verdict global : ✅ aucune régression — MyKTAMap reste strictement offline-first et privacy-respectueux. BONUS : -1 fetch boot si l'user active la pref `skipServer`.**

### Périmètre v1.21.4 (delta vs v1.21.3)

Le pack PATCH v1.21.4 est **strictement client-side** : aucun nouveau fichier, aucune nouvelle API navigateur, aucune nouvelle permission, aucun changement de la whitelist `connect-src`. 7 sujets audités, tous validés ✅. Particularité notable : c'est le premier opt-in v1.x qui **réduit** la surface réseau (skip d'1 fetch au boot si la pref `myktamap_skip_server_plans_v1` est activée).

| Module / Périmètre v1.21.4 | Audit | Conclusion |
|---|---|---|
| `_calculerStorageMyktamapBytes` (index.html) | Itère `localStorage` prefix `MyKTAMap` + 6 stores IDB (read-only via cursor `objectStore.openCursor`). Cache 30s en variable JS module-scope (jamais persisté). Pas de fetch, pas d'écriture. | ✅ Lecture pure, 0 surface réseau ajoutée. |
| `_computePlanStatsLive` + `_persisterStatsPlanCourant` | Agrège session + embedded en mémoire via getters publics (`getEditorPoints`, `getAllEmbeddedPoints`, `getRoads`, `getZones`, `getStructures`, `getAllEmbeddedRoads`, etc.). Écrit `localStorage["myktamap_plan_stats_v1_<id>"]` = `{pois, roads, distPx, breakdowns, ts, source}`. Counts uniquement (jamais de Blob/photo data dans le cache). Pas d'IO async. | ✅ 0 surface réseau ajoutée. Cache strictement local. |
| `_calculerStatsPlansAggregees` (stats agrégées séquentielles) | Lecture `localStorage` uniquement (sessions per-plan + cache stats par plan). Pas de fetch, pas d'IDB read. Anti-crash mobile via yield `setTimeout(0)` entre plans (laisse respirer le main thread). | ✅ 0 surface réseau ajoutée. Robustesse mobile préservée. |
| Camemberts SVG agrégés cross-plan | Rendu 100 % canvas/SVG client-side via `window.StatsGlobales.renderPieChart` exposé. Math `cos/sin` + path arc native browser. Aucune transmission, aucun fetch de ressources externes. Palette charte hardcodée (pas de fetch de palette tierce). | ✅ Rendu local pur. |
| `PROFILE_BAR_STATS` configurable | Nouvelle localStorage key `myktamap_loader_bar_stats_v1` = array de keys (`["time", "storage", "plans"]`). Default `["time", "storage"]`. Persistance pure locale, aucune surface réseau. | ✅ 0 surface réseau ajoutée. |
| Option **skip plans serveur** | Nouvelle localStorage key `myktamap_skip_server_plans_v1` = boolean. Si active, `main.js > initApp` skip le `fetch("data/index.json")` au boot. **C'est une RÉDUCTION**, pas un ajout : `fetch("data/index.json")` était déjà whitelisté (same-origin) en v1.21.3 et avant. Default OFF (comportement v1.21.3 strict si l'user ne touche pas). | ✅ **BONUS : -1 fetch par boot** si activé. 0 nouvelle surface. |
| Filtre M-LVL Heatmap (`opts.levels`) | `opts.levels` = `Set<number>` consommée en mémoire JS dans la pipeline Heatmap. Pas de persistance, pas de fetch. Filtrage de la timeline + points par niveau avant rendu canvas. | ✅ 0 surface réseau ajoutée. |
| Permissions API navigateur | Inchangé v1.21.3 (Wake Lock + Clipboard documentées depuis v1.21.2). Pas de nouvelle permission demandée. | ✅ Périmètre stable. |
| CSP `connect-src` | Inchangé : `'self'` + `https://www.gstatic.com` | ✅ Garantie active anti-exfiltration préservée. |

### Bilan : 3 nouvelles localStorage keys, toutes strictement locales

| Storage key | Type | Schema | v |
|---|---|---|---|
| `myktamap_plan_stats_v1_<id>` | localStorage | `{pois, roads, distPx, breakdowns: {pointsByTag, roadsByType, zonesByType, structsByType}, ts, source}` | v1.21.4+ |
| `myktamap_loader_bar_stats_v1` | localStorage | array de keys ex: `["time", "storage", "plans"]` | v1.21.4+ |
| `myktamap_skip_server_plans_v1` | localStorage | `"true"` \| `"false"` | v1.21.4+ |

Tous strictement locaux, JSON-serialisé, aucune transmission, aucun lien réseau.

### Synthèse héritée v1.21.3 (intégrée dans v1.21.4)

**Verdict global v1.21.3 : ✅ aucune régression — MyKTAMap reste strictement offline-first et privacy-respectueux.**

### Périmètre v1.21.3 (delta vs v1.21.2)

Le pack PATCH anti-crash v1.21.3 est **purement runtime** : aucun nouveau fichier, aucune nouvelle API navigateur, aucune nouvelle permission, aucun changement de la whitelist `connect-src`. Les 10 P0 fixés touchent uniquement la robustesse mémoire/leaks/race conditions côté JS local et la stratégie de cache PWA (LRU eviction qui reste same-origin par essence). La surface réseau est strictement identique à v1.21.2.

| Module / Périmètre v1.21.3 | Audit | Conclusion |
|---|---|---|
| `js/tracking.js` (cap `MAX_TIMELINE_ENTRIES=20000` + `_decimateTimeline`) | Modification interne au push/restore. Pas de nouvelle requête. `_trackingTimeline` reste un tableau RAM puis sérialisé en `localStorage["myktamap_session_v1_<planId>"]` (slot per-plan local, cf §57). | ✅ 0 surface réseau ajoutée. Protection contre QuotaExceededError localStorage (5-10 Mo). |
| `js/heatmap.js` (toBlob + ObjectURL revoke + MAX_DIM mobile + MAX_SEGMENTS) | `canvas.toBlob` produit un Blob en RAM consommé par `URL.createObjectURL` → `L.imageOverlay`. Le Blob reste en mémoire navigateur, jamais POSTé. `URL.revokeObjectURL` libère la ressource au `effacer()`. | ✅ 0 surface réseau ajoutée. Économie ~10 Mo de RAM par render vs toDataURL legacy. |
| `js/utils.js` (token `_ktaDataLayerLoadToken`) | Variable globale (Number) incrémentée au plan switch. rAF récursif `ajouterPointsDepuisJSON` compare le token et exit silencieusement si stale. Pas de fetch, pas d'IDB, pas de localStorage. | ✅ Mémoire pure. Anti-zombies markers + anti-fuite layerGroups orphelins. |
| `js/main.js` (purge étendue `_libererRessourcesPlanPrecedent`) | Vidage explicite de 4 registres `_ktaData*` + `_kta_dataLayerNoteGhosts` + clear timers BatteryGuard + désactivation EmergencyMode. Tout local. | ✅ 0 surface réseau ajoutée. Réduction des leaks au plan switch. |
| `sw.js` (LRU eviction debounced 30s) | `caches.open(CACHE_NAME).keys()` → filtre les URLs absolues NON présentes dans `_staticAssetUrls` (= URLs d'`ASSETS_TO_CACHE`). Si > 800 entrées dynamiques → `cache.delete` sur les 50 plus anciennes. Toutes les opérations sont same-origin (Cache API ne peut pas atteindre un domaine externe). | ✅ Cache API local, aucune requête réseau émise par l'eviction. Protection contre purge OS du CacheStorage. |
| Permissions API navigateur | Inchangé v1.21.2. Pas de nouvelle permission demandée. | ✅ Périmètre stable. |
| CSP `connect-src` | Inchangé : `'self'` + `https://www.gstatic.com` | ✅ Garantie active anti-exfiltration préservée. |

### Synthèse héritée v1.21.2 (intégrée dans v1.21.3)

| Module / Périmètre | Audit | Conclusion |
|---|---|---|
| `js/userProfile.js` (388 lignes) | `grep -n "fetch\|XMLHttpRequest\|sendBeacon\|navigator\.geolocation\|navigator\.share"` → 0 hit | ✅ 100 % local. Photo compressée canvas avant write IDB. Aucune fuite via `Image.onerror` (URL.revokeObjectURL appelé dans onload ET onerror). ObjectURL crée à la demande, caller responsable du revoke. |
| `js/profileExportImport.js` (1207 lignes) | Audit fetch/XHR : 0. Photo embed base64 inline dans JSON exporté via `_blobToBase64`. Download via `URL.createObjectURL` + `a.click()`. | ✅ 100 % local. Aucune transmission. |
| `js/wakeLock.js` (178 lignes) | Audit fetch : 0. Permission politique navigateur (pas user prompt). Hidden si non supporté. Pas de fingerprinting (lock binaire). | ✅ 0 surface réseau ajoutée. |
| `js/heatmap.js` (661 lignes — RÉACTIVÉ) | Audit fetch : 0. `canvas.toDataURL` consommé par `L.imageOverlay` uniquement (jamais POSTé). | ✅ Rendu canvas local pur. |
| `js/sessionExporter.js` (trackerTimeline embed) | trackerTimeline = coords `{x, y, t, deltaMs, type}` en pixels plan local (jamais GPS). Si plan calibré, la calib KMZ reste dans `localStorage` séparé, non incluse dans le payload session exporté. | ✅ Pas de leak GPS implicite via les exports session. |
| `js/utils.js > buildPointPopupHtml` (popup GPS) | Calcul 100 % client-side via `KmzExport.planToGps`. Aucun appel à un géocodeur externe (Nominatim, Google, etc.). Bouton 📋 = `navigator.clipboard.writeText` (écriture seule, scope tab, HTTPS silencieux). | ✅ 0 nouvelle requête réseau. |
| Surface XSS popup GPS (inline `onclick="window.kta_copierGps(...)"`) | Source de la string GPS = `_formatGps(lat, lng)` qui formate des **nombres** (toFixed). Jamais d'input user. Escape `_escAttr` (HTML attr) appliqué AVANT injection. `.replace(/'/g, "\\'")` appliqué pour le contexte single-quoted JS. | ✅ Surface XSS auditée et validée. |
| Validation re-import session (trackerTimeline) | `tracking.js > _trackingTimeline.push` exige des champs typés. `setTrackingTimeline` (si appelé via import) doit filtrer `{x, y, t, type}` numérique/string. **À vérifier en cas d'évolution future** si un import session non-fiable est ouvert au user (cas actuel : les sessions importées sont uniquement celles que l'user a exportées lui-même). | ⚠️ P3 — pas une régression v1.21.2, mais point d'attention général pour les futurs imports non-confiance. |
| Nouvelle DB IDB `myktamap_profile` | Schema v1. 1 entry unique `id="me"`. Lecture/écriture readonly/readwrite normale. Pas d'index secondaire ni de relation cross-DB. | ✅ Strictement isolée. |
| Permissions API navigateur | Wake Lock (politique nav, silencieuse) + Clipboard (writeText user-initiated, écriture seule). Documentées dans nouvelle section dédiée. | ✅ Nouveau périmètre transparent. |
| CSP `connect-src` | Inchangé : `'self'` + `https://www.gstatic.com` | ✅ Garantie active anti-exfiltration préservée. |

**Aucune vraie vulnérabilité détectée.** Le seul point P3 (validation défensive du re-import session) est un point d'hygiène pour l'avenir, pas une régression v1.21.2.
