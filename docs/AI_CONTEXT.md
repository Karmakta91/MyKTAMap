# MyKTAMap — Documentation utilisateur (version enrichie pour assistance IA)

> Document généré le **{{DATE}}** (build {{BUILD}}) par l'application MyKTAMap pour servir de **source de référence** à un assistant IA. Le lecteur (humain ou IA) doit considérer le contenu ci-dessous comme **la seule documentation officielle disponible** de l'application.
>
> Ce fichier est servi tel quel par l'app : `docs/AI_CONTEXT.md` (déplacé dans `docs/` depuis v1.8.0, avant à la racine). Pour l'enrichir, éditer directement ce fichier — aucun re-déploiement de code n'est nécessaire, le service worker se chargera de propager la mise à jour.

---

## ⚖️ Mentions légales

- **Auteur** : Flavien VIDAL (alias KARMA)
- **Site officiel** : https://myktamap.fr
- **Licence** : **CC BY-NC-SA 4.0** — Attribution, NonCommercial, ShareAlike
  - Usage non commercial autorisé avec attribution + partage à l'identique
  - **Usage commercial strictement interdit** sans accord écrit préalable de l'auteur
- **Code source** : **non distribué publiquement** (pas de dépôt ouvert). Toute personne consultant ce document n'a accès qu'à la documentation utilisateur — pas au code, pas à l'app live, pas aux données.
- **Collaboration** : **ouverte sur demande** (contributions, ports, intégrations, retours terrain). Contact via le site officiel.

> ⚠️ Toute reproduction, modification, redistribution ou utilisation commerciale de cette documentation ou de l'application sans accord écrit préalable de l'auteur expose à des poursuites pour contrefaçon (art. L.335-2 du Code de la propriété intellectuelle).

---

## ⛔ INSTRUCTIONS CRITIQUES À L'IA — À LIRE AVANT TOUTE RÉPONSE

> 🛑 **RÈGLE ABSOLUE — TOLÉRANCE ZÉRO À L'HALLUCINATION**
>
> Tu réponds **EXCLUSIVEMENT** à partir du texte présent dans ce document. Si une information n'est pas littéralement écrite dans le document fourni, **elle n'existe pas dans MyKTAMap**, point final.
>
> Tu ne dois **JAMAIS** :
> - Inventer une fonctionnalité, un type de zone, un type de point, un mode, un bouton, une option, un format de fichier, etc.
> - Extrapoler par analogie avec d'autres applications de cartographie (Google Maps, QGIS, Mapbox, etc.).
> - Compléter une liste en ajoutant des éléments "logiques" qui ne sont pas dans le document.
> - Supposer qu'une fonctionnalité existe parce qu'elle "devrait" exister ou parce que c'est "courant".
> - Reformuler le périmètre de l'app au-delà de ce que la doc décrit.
>
> Si l'utilisateur te demande quelque chose qui n'est pas dans le document, **dis-le explicitement** : *"Cette fonctionnalité n'est pas décrite dans la documentation que j'ai. Vérifie directement dans l'app ou contacte l'auteur via https://myktamap.fr."*

---

### 🔒 Procédure de vérification AVANT de répondre

Pour **chaque** question :

1. **Cherche le terme** mentionné par l'utilisateur dans **tout le document** (préambule + survol des fonctionnalités + doc utilisateur + glossaire + recettes + FAQ). Considère aussi les **synonymes** raisonnables : "mode urgence" ≡ "Je suis perdu" ≡ "perdu" ; "itinéraire" ≡ "trajet" ≡ "navigation" ; "session" ≡ "annotations" ; etc.
2. Si le terme apparaît dans le survol, une recette, la doc ou la FAQ → réponds à partir de ce contexte, sans extrapoler au-delà.
3. Si le terme n'apparaît **nulle part** dans le document même après vérification des synonymes → la fonctionnalité n'existe probablement pas, dis-le clairement.
4. **Cite la section** du document où l'info est trouvée (ex : *"D'après la recette J..."* ou *"D'après la section '⬛ Tracer des zones'..."*).

⚠️ **Ne dis JAMAIS "ça n'existe pas" sans avoir vérifié dans toutes les sections** (en particulier le **survol des fonctionnalités principales** ci-dessous et les **recettes** plus bas, qui contiennent les fonctionnalités modernes ajoutées récemment).

---

### 📋 Liste exhaustive des éléments qui EXISTENT (anti-hallucination)

> Cette liste te sert d'**ancrage** sur les **listes fermées** (types de zones, types de tracés, modes performance, etc.). Pour ces listes : tout ce qui n'est PAS listé ici **n'existe pas**.
>
> ⚠️ **Pour les fonctionnalités générales** (modes, outils, sections d'interface, recettes), la doc complète plus bas est la référence — la liste ci-dessous est non exhaustive sur ce plan, juste un **survol**. Si l'utilisateur demande une fonctionnalité qui n'est pas dans le survol, **cherche dans la doc complète et les recettes** avant de répondre "n'existe pas".

**Fonctionnalités principales** (survol — détails dans la doc + recettes) :
- 🗂️ **Multi-plans** : registre de plans, import ZIP, auto-discovery serveur, modale "Plan introuvable", titre cliquable plan switcher
- 🔍 **Recherche de points** par nom / id / tag, avec filtres calques et tags, insensible aux accents
- 🧭 **Tracker PDR** (expérimental) : tracking inertiel mobile, mode 📍 Recalage. **Icône directionnelle (depuis v158-v161)** : pendant le tracking actif, l'icône (cône GPS bleu) tourne en temps réel pour pointer dans la direction de marche, calculée depuis le heading du téléphone (même source que la boussole 🧭). Au repos (tracking off) ou après recalage sans démarrer le tracking, l'icône pointe Nord (pose neutre). Smoothing exponentiel + throttle 2° + transition CSS 0.3s pour absorber le jitter du magnétomètre.
- 🗺️ **Itinéraire** : pathfinder Dijkstra entre 2+ waypoints, label distance + temps estimé en bas-gauche. **Depuis v169 (Karma_dev)** : 2 nouvelles contraintes possibles :
  - ⛔ **Zones inaccessibles** (DUR) : tout segment de route traversant une zone polygonale de type `inaccessible` est exclu du graphe — l'itinéraire passe forcément à côté. Jamais relâché.
  - 🚫 **Préférences d'évitement** (SOUPLE) : configurées dans la modale itinéraire (section repliable "🚫 Préférences d'évitement"). On peut éviter des **points précis** (par recherche / ID) ou des **tags entiers** (ex: tous les `pa` / Puits Aération). Marge configurable (défaut 100px). **Fallback 2 passes** : si pas de chemin en évitant, l'app tente sans les évitements et affiche un message orange "⚠️ Impossible d'éviter : X, Y" pour informer l'user. Persisté par plan via localStorage.
- ⛑️ **Mode urgence "Je suis perdu"** (sous-action du groupe 🧭 Tracker) : estime une zone de recherche à partir de dernière position + temps écoulé + indices visuels texte ; affiche cercle orange, markers violets pour les indices in-zone ; bloc dépliable "📚 Bonnes pratiques" ; rapport copiable
- 🚨 **Mode urgence "panique"** (depuis v1.10.1) : affichage plein écran simplifié avec position XL + boussole géante + minimap auto-focus + Wake Lock. **Depuis v1.12.0** : toggle ☑️ 🗺️ Itinéraire dans l'en-tête (persistance localStorage `myktamap_emergency_show_iti_v1`, défaut OFF pour protection anti-crash sur gros plan, rendu cyan vif + halo blanc quand activé) + bloc 🔋 ÉTAT affiche le niveau batterie en temps réel + minimap recadre correctement à la rotation paysage (3 retries invalidateSize cascade).
- 🎬 **Replay tracker** (depuis v1.12.0) : bouton 🎬 dans le groupe 🧭 Tracker. Ouvre une modale plein écran avec slider timeline + play/pause/restart/end + vitesse 0.5×→10× + raccourcis clavier (Espace, ← →, Échap). Mode compact (bottom sheet) activé auto au Play. Trail multi-segments (skip téléportations sur recalage). Bouton 💾 Export CSV produit fichier 5 colonnes `timestamp_ms_epoch,delta_ms_since_start,x_plan,y_plan,type[,level]`. Reset au plan switch (RAM-only).
- 🪫 **Indicateur batterie** (depuis v1.12.0) : chip ⚡/🪫 dans l'en-tête nouvelle interface (à côté compteurs session), footer modale Session active, bloc 🔋 ÉTAT mode urgence. Warnings graduels 20%/10%/5% via toast (1 fois par seuil par cycle décharge). Battery Status API — dispo Chromium uniquement (Android, PC). Si API indispo (Safari iOS, Firefox) : chip masquée sans erreur.
- 📊 **Stats session enrichies** (depuis v1.12.0) : modale 📋 Session active affiche total annotations + breakdown par type (📍/🛣️/⬛/🏛️) + distance cumulée tracés + surface cumulée zones + photos POI + durée session. Multi-niveau (M-LVL) : breakdown additionnel par niveau. Boutons 📋 Copier + 💾 Export TXT pour partager.
- 🎨 **Thème clair / sombre** (depuis v1.13.0) : toggle ☀️/🌙 accessible à **2 endroits** synchronisés (même pref `localStorage["myktamap_theme_v1"]`) : (1) sidebar gauche → groupe ⚙️ Paramètres → sous-action dédiée (mode carte), (2) modale Configuration home → checkbox "☀️ Activer le thème CLAIR". Bascule instantanée **partout dans l'app** : home (loader, cards, boutons, footer, splash chargement plan), modales home (Configuration, Documentation 📖, Aide ❓, Audit réseau 🔒, UnlockGate code communautaire, PinGate keypad, PinProposal post-update, Plan switcher), mode carte entier (sidebar + header + footer + container Leaflet + icônes brun-beige), toutes ses modales (Session, Enregistrer session, Recherche Ctrl+K, Itinéraire, Mesure, Édition, Export PNG/PDF/KMZ, Réglages, Légende, Niveaux M-LVL, Replay tracker, Choix suppression, Je suis perdu, etc.), modales système (Update, Reset en cours, Yes/No), alertes publiques (rouge emergency / orange warning / bleu info), toasts, popups Leaflet + tooltips + zoom controls. Palette : body `#f0e8d8` (beige cataphile) + bars+sidebar+icônes `#c9b88f` (brun-beige) + modales `#fdf8eb` (presque blanc) + accent jaune `#f4c542` conservé. **Hors scope (restent dark)** : splash KARMA cinématique au boot + viewer photos plein écran. Mode urgence : applique automatiquement le thème global à son ouverture, garde son toggle local 🔆/🌑 pour bascule ponctuelle.
- 📐 **Mesure de distance** (clic-clic, label `📐 Distance: X m` en bas-gauche)
- ⬛ **Mesure de surface** (depuis v1.12.0) : toggle 📏/⬛ dans le groupe 📐 Mesure. Polygone clic-clic, calcul d'aire par formule de Shoelace appliquée aux coordonnées plan, conversion m² via `APP_CONFIG.scale`. Label adaptatif `⬛ Surface: X m²` (auto bascule en ha au-delà de 10 000 m²). Persistance complète dans la sauvegarde session.
- 📏 **Distance totale des tracés** (filtre par type, highlight magenta)
- ✏️ **Édition de points** (ajout, modification, suppression via popup). **Depuis v1.10.0** : modale d'édition unifiée ajout/modification + section 📸 Photos attachées (capture / galerie / viewer plein écran avec pinch-zoom + swipe nav). Max 5 photos par point.
- 📸 **Photos POI** (depuis v1.10.0) : attache jusqu'à 5 photos par point ajouté, capture caméra mobile ou import galerie. Stockage IndexedDB 100 % local (jamais envoyé sur Internet). Compression auto JPEG q85 max 1920px. Inclues dans tous les exports (session ZIP + KMZ + générateur). Viewer plein écran (`window.MyKTAMapPhotoViewer`) avec pinch-zoom + pan + swipe horizontal navigation + flèches/raccourcis clavier. Cf section dédiée plus bas.
- 🔐 **Code d'accès local PIN/Face ID** (depuis v1.10.0, optionnel) : PIN 4-6 chiffres + biométrie Face ID/Touch ID via WebAuthn. Activable depuis ⚙️ Configuration de la home uniquement. 100 % local (hash SHA-256 + salt, stocké localStorage). Barrière UX, PAS un chiffrement des données. 5 tentatives ratées = lockout définitif. Cf section dédiée plus bas.
- 🛣️ **Tracés / Roads** : Principal / Secondaire / Chemin / Itinéraire
- ⬛ **Zones** : Remblais / Effondrement / Eau / Inaccessible. Depuis v1.10.0 : la "Dernière zone fermée" priorise la zone EN COURS si elle existe (avant : skippée → impossible de supprimer une zone en cours d'un coup)
- 🏛️ **Structures** (depuis v1.9.3) : 5 types — Pilier 1ère masse 🟡 / Pilier 2e masse 🟠 / Mur 🔵 (polygones) + Front de taille 1ère masse 🟨 / 2e masse 🟧 (polylignes). Architecture souterraine (piliers porteurs, murs, avancement d'exploitation). Aucun effet pathfinder (lecture seule). 4 modes de suppression depuis v1.10.0 (incl. ✂️ "en cours OU fermée" + 🎯 sélection au clic carte hybride polygon/polyline). **🔧 v1.10.1 (KARMA hotfix2)** : couleurs des fronts ALIGNÉES sur les piliers — front-1 jaune comme pilier-1 (1ère masse), front-2 orange comme pilier-2 (2e masse). Avant inversées par erreur.
- 💾 **Sauvegarde session** : Full / Avancé / Conversion (session → data layer)
- 🖼️ **Export PNG** : Mode rapide / Mode avancé (avec légende, calques au choix, résolution)
- 🌍 **Export KMZ géolocalisé** (depuis v170) : nouvel onglet dans 💾 Export Session. Calibrage par **2 points** (saisie x/y plan + lat/lng GPS pour chacun, via recherche / clic carte / saisie manuelle). L'app calcule une transformation affine 2D (rotation + scale + translation) et génère un fichier `.kmz` ouvrable dans Google Earth, OsmAnd, Locus, Avenza... Image plan en transparence configurable (slider 0-100%, défaut 60%). Granularité fine du contenu : sous-cases parent/enfants par tag de point, type de tracé, type de zone (pattern identique à l'Export PNG Avancé). Inclut session + embedded data layers. Calibrage persisté par plan (localStorage). Compatible multi-niveau (1 Folder KML par niveau).
- 📤📥 **Import + Export GPX** (depuis v1.14.0) : format GPX 1.1 standard pour compat apps spéléo / outdoor (TopoDroid, OsmAnd, Avenza, GPSies, Strava, Garmin). Réutilise le calibrage KMZ existant (même calibrage = même point d'entrée). **Export** via 💾 → onglet 📤 GPX (à côté de KMZ). **Import** via sidebar gauche → ⬇️ Charger → sous-action 📤 GPX → file picker → preview → confirmation. Roundtrip MyKTAMap ↔ MyKTAMap préserve niveaux M-LVL + types tracés via commentaires `<cmt>MyKTAMap level=N</cmt>`. Garde-fous : détection points hors bounds + vérif calibrage avant import. Annulable via Ctrl+Z (HistoryManager intégré).
- 🎚️ **Refonte UX loader** (depuis v172) : la liste 📚 Mes plans a été simplifiée et enrichie :
  - **Toggle "🌐 Afficher les plans serveur"** persisté par localStorage — l'user peut cacher les plans serveur découverts auto (test1, test2, démos…) pour ne voir que ses plans persos. Recocher = ils réapparaissent intacts (filtre d'affichage seulement, pas de suppression).
  - **Badges modes V1/V2/M-LVL + storage (✅/🔐/📁) sur ligne 2** (sous le nom). Avant : sur la même ligne que le nom → noms longs tronqués prématurément. Maintenant : nom prend toute la largeur, badges groupés en bas pour scan visuel rapide.
  - **Bouton ℹ️ Infos détaillées** par plan : nouvelle modale qui liste TOUS les attributs (id, nom, version, auteur, type, fichier source, taille, persistance, mode, perfPreset, dates) sous forme de tableau 2 colonnes. Remplace l'affichage compact sub/date qui surchargeait la liste.
  - **"💾 Mémoriser ce plan dans l'app" coché par défaut** sur mobile/Safari/Firefox (avant : décoché par défaut → l'user oubliait souvent → re-sélection requise à chaque chargement).
- 📐 **Réglages responsive PC** (depuis v172) : la modale ⚙️ Réglages passe en layout 2 colonnes sur ≥1024px (pattern identique à la modale Doc/Aide). Sur mobile : strictement inchangée (1 colonne 440px).
- 🗝️ **Accès restreint communautaire** (depuis v173) : barrière au démarrage, l'app demande un mot de passe unique commun à tous les users autorisés. Vérifié 1 fois à la 1ère installation, mémorisé en localStorage ensuite. Re-demandé après reset complet (le mdp est alors affiché dans la modale Reset pour ne pas perdre l'accès). 5 tentatives ratées → lockout permanent jusqu'à désinstallation manuelle de l'app. Barrière SOCIALE / communautaire — ne remplace PAS une vraie auth (le code source HTML/JS est public).
- 🛣️ **Mode urgence "Je suis perdu" enrichi** (depuis v173) : en plus du cercle de zone théorique, l'app affiche désormais en rouge clair tous les segments de routes physiquement atteignables depuis la dernière position connue, dans la limite du rayon (= vitesse × temps). Algorithme isochrone Dijkstra "budget". Multi-niveau via jonctions interniveau. Cas dégénérés gérés explicitement (no-roads / snap-too-far / empty-graph). Bonus rapport copiable enrichi "🛣️ Portée max sur le réseau : ~X m parcourable (N segments)".
- 🛡️ **PerfUltra "Limiter dézoom mobile"** (depuis v173) : 7ème toggle dans le mode Performance ULTRA. Coché par défaut = comportement v172 (limite anti-OOM). Décoché = traite le mobile comme un PC dans le calcul minZoom (gagne 1-2 niveaux de dézoom selon taille du plan). Reload requis. Premier toggle PerfUltra avec default true.
- 📐 **Icônes adaptatives au zoom** (depuis v1.7.1) : les icônes des points (puits, accès, signalétique, etc.) gardent une taille relative au plan constante au lieu de la taille écran fixe Leaflet par défaut. Au dézoom, elles rétrécissent ; au zoom in, elles grossissent. Clamp 0.25 → 2× pour éviter les extrêmes (invisible ou énorme). Toggle dans ⚙️ Réglages → 🔍 Affichage (default ON, reload requis pour changement).
- 🔍 **Double-clic sur un marker → zoom flyTo** (depuis v1.7.1) : un seul clic ouvre le popup (inchangé), un double-clic rapide (< 500ms) fait un flyTo smooth (0.6s) sur le point au zoom +2 clampé. Le popup éventuel est fermé pendant le flyTo. Ne s'applique pas au tracker ni au mode urgence (comportements spécifiques préservés).
- 🔢 **Nouveau format de version semver-like** (depuis v1.7.1) : passage de vNNN (v173) à vX.Y.Z (v1.7.1). X = MAJOR (1 actuel, 2 quand backend), Y = MINOR (évolutions majeures), Z = PATCH (debug/UX). Mapping rétroactif des MINOR dans le README.md journal.
- 🆕 **v1.10.0 (23/05/2026)** : Photos POI complètes (📸) + Code d'accès local PIN/Face ID (🔐) + suppression structures au clic + Zone/Structure en cours supprimables d'un coup + M-LVL default = niveaux [-1, 0, +1] visibles. Cf. survol détaillé dans les sections dédiées de cette liste.
- 🆕 **v1.11.0 (23/05/2026)** : **⏪ Undo / Redo global (Ctrl+Z / Ctrl+Y)** sur les 4 catégories d'annotations dessinables. Module `js/historyManager.js` (~250 lignes IIFE) → `window.HistoryManager = { record, captureState, recordAction, undo, redo, canUndo, canRedo, reset, onChange }`. Snapshot hybride (deep clone des arrays `{editorPoints, roads, zones, structures}` à chaque action), limite 50 entrées FIFO, RAM-only (perte au reload, reset auto au plan switch). Raccourcis clavier globaux Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z (anti-vol focus si input/textarea actif). 2 boutons sidebar dans un nouveau groupe `⏪ Historique` (auto-grisés via `HistoryManager.onChange`). Toast discret via `OOMGuard.showToast` à chaque action. Save SessionPersist forcé après chaque undo/redo. **Photos exclues** (IDB irréversible). Sites instrumentés : editor.js (création/modif/removeLast), road.js / zones.js / structures.js (clic carte + removeLast), interface.js (suppression au clic + "Tous les X"). Reset historique dans main.js > `_libererRessourcesPlanPrecedent`.
- 🆕 **v1.20.0 enrichi (25/05/2026)** : 4 features supplémentaires ajoutées au cycle v1.20.0 originel (Robustesse + Stats + Communauté) pour former une release MINOR unifiée de 8 sujets. **Onboarding + Profil utilisateur** ajoutés en fin de cycle Karma_dev avant push main :  (5) **🛡️ Clause anti-fork myktamap.fr** : section dédiée dans Audit qui précise que la garantie de sécurité s'applique UNIQUEMENT au domaine officiel. (6) **🎓 Tutoriel premier-lancement enrichi** — nouveau module `js/tutorial.js` (~250 lignes IIFE) → `window.Tutorial = { ouvrir, fermer, isFirstLaunch, markAsSeen }`. Auto-affiché au tout premier lancement via flag `localStorage["myktamap_tutorial_seen_v1"]`, différé 600ms après `_splashEnd`. 8 cards séquentielles (Bienvenue + 100% offline + clause anti-fork / Charger-créer plan avec distinction Drop ZIP natif vs KMZ/GPX idéalement exportés depuis MyKTAMap / Annoter / Tracker GPS expérimental / Trouver vite Ctrl+K + Favoris / Multi-niveau M-LVL / Sauver-partager exports / Outils annexes). Rejouable via 📚 Aide → nouvelle sous-action « 🎓 (Re)voir le tutoriel ». (7) **📦 Export/Import de profil utilisateur complet** — nouveau module `js/profileExportImport.js` (~1100 lignes IIFE) → `window.ProfileExportImport = { buildProfile, computeSectionSizes, exportToFile, parseProfile, computeImportStats, applyProfile, isLegacyFormat, ouvrirExportModale, ouvrirImportModale, fermerModales }`. Format JSON unique versionné `{type: "myktamap-profile-export", version: 1, sections}`. 9 sections : **user** (surnom + photo profil base64, cochée par défaut) / registry / preferences / favoris / sessions / backups / tutorial / photos POI (optionnel, décoché par défaut car potentiellement lourd) / crashes (optionnel). PIN/Face ID + UnlockGate JAMAIS exportés (sécurité). Rétro-compat absolue avec l'ancien format `myktamap-plans-list` (détection auto). Modales UI dédiées avec checkboxes granulaires + tailles MB. Modale post-import « ✅ Profil importé » avec résumé + proposition de reload doux. (8) **👤 Mode profil utilisateur intégré au loader** — nouveau module `js/userProfile.js` (~370 lignes IIFE) → `window.UserProfile = { init, get, getPhotoBlob, getPhotoObjectUrl, setSurnom, setPhoto, removePhoto, clear, onChange, getInitial, getAvatarColor, PALETTE }`. **Nouvelle DB IDB dédiée `myktamap_profile`** v1 store `profile` keyPath `id` (entry unique `id="me"` : surnom + photoBlob + photoMime + createdAt + updatedAt). Compression auto photo via canvas (max 512px, JPEG q88 → ~30-60 KB). Palette charte 10 couleurs déterministes (djb2 hash du surnom). UI bandeau `#kta-loader-profile-bar` AVANT le grid loader-grid (avatar + greeting + surnom cliquable + bouton ⚙️ Détails). Modale `#kta-profile-details-modal` (édition surnom inline + upload/retrait photo + stats agrégées 4-cells + boutons export/import/reset profil). Modale reset charte (Promise-based, cf §35) au lieu de `confirm()` natif. **Anciens boutons `exportListBtn`/`importListBtn` à côté de « 📚 Mes plans » RETIRÉS** (regroupés dans la modale Détails profil). Mode clair : bandeau aligné sur les cards « Mes plans » / « Reprendre » (fond `#fdf8eb` + bordure ocre). Bonus : nouvelle méthode `exportToPDF` ajoutée à `js/statsGlobales.js` via jsPDF déjà chargé (A4 portrait). + cleanup README_USER (-541 lignes du bloc « Nouveautés » accumulé). **Sources** : `version.json` → `v1.20.0`, `js/copyright.js > __MKM__.build` → `v1.20.0`, `sw.js > CACHE_NAME` → `myktamap-cache-v1.20.0`. **5 nouveaux fichiers** ajoutés à `ASSETS_TO_CACHE` total cycle v1.20.0 : `js/crashReports.js` + `js/statsGlobales.js` + `js/tutorial.js` + `js/userProfile.js` + `js/profileExportImport.js`. **2 nouvelles DB IDB** : `myktamap_crashes` + `myktamap_profile`.
- 🆕 **v1.20.0 (24/05/2026)** : **Cycle « Robustesse + Stats & Communauté »** (bump Y : 1.19.1 → 1.20.0). 4 features qui se complètent : (1) **🪤 Skip snapshot identique** — `js/sessionBackups.js > snapshot()` check le dernier snapshot IDB du même plan avant de consommer un slot FIFO. Cas réglé : boot-pre-restore après reload sans modif → hash in-memory null (reset au load) MAIS hash IDB identique → skip. Économie : 1 boot identique = 0 slot consommé. Nouveau helper `_getLastSnapshotForPlan(planId)`. (2) **📋 Crash report auto IDB** — nouveau module `js/crashReports.js` (~220 lignes IIFE) → `window.CrashReports = { saveCrash, listAll, remove, clearAll, formatReportText }`. DB IDB dédiée `myktamap_crashes` v1 / store `crashes` / FIFO 5 entries. Hook dans `js/oomGuard.js > _checkPreviousKill` : appelle `CrashReports.saveCrash(killInfo)` quand un kill mémoire est détecté au boot. Archive : killInfo (ageSec, planId, userAgent), appVersion, 50 derniers logs (depuis `localStorage["kta_debug_logs"]`), sessionSnapMeta (dernier SessionBackups du même plan). Nouvelle section MemInspector « 📋 Derniers crashs (N / 5) » avec cards par entry + boutons « 📋 Voir détails » (modale pre formaté), « 📋 Copier » (presse-papier), « 🗑️ Supprimer », « 🗑️ Tout vider ». `formatReportText` produit un texte plain markdown-like prêt à coller dans Discord/mail/GitHub. (3) **⭐ Favoris export/import JSON** — `js/favoris.js` étendu avec 4 méthodes : `exportToJson({scope})`, `exportToFile({scope, filename})`, `importFromJson(input, {mode, targetPlanId})`, `importFromFile(file, opts)`. Format ouvert versionné `{type: "myktamap-favoris-export", version: 1, exportedAt, appVersion, scope, byPlan}`. Scope « current-plan » OU « all ». Mode import « merge » (défaut, anti-doublon sur pointId) OU « replace ». UI dans modale 📊 Détails session → nouvelle section ⭐ Favoris avec 3 boutons (📤 plan courant, 📤 tous, 📥 importer) + status display + badge avec compteur cross-plan « N (+ M autres plans) ». Helper `_hydrateFavorisBadge` function declaration hoisted dans `_afficherModaleSessionDetail`. (4) **📊 Statistiques globales du plan** — nouveau module `js/statsGlobales.js` (~520 lignes IIFE) → `window.StatsGlobales = { ouvrir, fermer, compute, getReportText }`. Modale dédiée distinct de 📊 Détails session (qui ne couvre QUE la session) : agrège SESSION + DATA LAYERS EMBEDDED. Sections : header plan + grille cartes totaux (📍/🛣️/⬛/🏛️/📸 avec breakdown session vs embed) + points par tag + tracés par type (count + distance cumulée auto m/km via `window.formatDistance`) + zones par type (count + surface cumulée auto m²/ha via `window.formatSurface`) + structures par type + breakdown par niveau si M-LVL (jonctions taggées sur `max(fromLevel, toLevel)`) + géoréférencement si présent. Bouton 📋 Copier le rapport + 🔄 Rafraîchir. Accès : gros bouton CTA bleu en tête de modale 📊 Détails session « 📊 Voir les statistiques globales du plan (session + data layers embedded) » avec hint explicatif. **Aucune nouvelle surface réseau** : skip snapshot = lecture IDB read-only, Crash Reports = lecture localStorage + IDB read + IDB write `myktamap_crashes`, Favoris export = Blob téléchargé local + File.text() import, Stats globales = lecture getters internes + IDB MyKTAMapPhotos. **Sources** : `version.json` → `v1.20.0`, `js/copyright.js > __MKM__.build` → `v1.20.0`, `sw.js > CACHE_NAME` → `myktamap-cache-v1.20.0`. 2 nouveaux fichiers ajoutés à `ASSETS_TO_CACHE` : `js/crashReports.js` + `js/statsGlobales.js`. 1 nouvelle DB IDB documentée dans NETWORK_AUDIT : `myktamap_crashes` v1 store `crashes` FIFO 5. KNOWN_MODULES + KNOWN_IDB_DBS de MemInspector étendus avec `CrashReports`, `StatsGlobales`, `myktamap_crashes`.
- 🆕 **v1.19.1 (24/05/2026)** : **Release PATCH consolidée** (bump Z : 1.16.1 → 1.19.1). Choix d'un saut PATCH (et non MINOR ×4) car le pack accumulé est SURTOUT des fixes et du polish, malgré la présence de quelques features moyennes. Contenu regroupé : (1) 🚀 Générateur accessible — mode Simple/Avancé (sticky `localStorage["myktamap_planner_mode"]`, défaut Simple, Mode Modifier forcé en Avancé) + nouvelle source de vérité plan-level `plan.customLegend` via section dédiée du Générateur Avancé. (2) 🌍 Roundtrip légende KMZ + GPX — `myktamap-extras.json` annexe dans le ZIP KMZ + `<extensions><myktamap:customLegend>` standard sous `<metadata>` GPX, parsing tolérant côté import + preview affichage « ✅ Légende personnalisée détectée » avant génération du ZIP MyKTAMap. (3) 📊 État mémoire — nouveau module `js/memInspector.js` (~580 lignes IIFE), accessible depuis ⚙️ Configuration loader > section 📊 Inspecteur, 5 sections (Runtime, localStorage, IndexedDB, Cache PWA, Storage estimate), bouton 📋 Copier le rapport, lecture seule 100 % local. (4) 🎯 Polish UX + DX — Aide intégrée enrichie (2 sections : MemInspector + Légende personnalisable cascade complète), Update Checker en vrai semver via `compareSemver()` exposé sur `window.UpdateChecker` (anti-bug latent `"v1.7.10" < "v1.7.9"` string + détection downgrade serveur), toast OOMGuard non-bloquant via hook `navigator.serviceWorker.addEventListener("controllerchange")` quand un nouveau SW prend le contrôle (garde-fou skip 1er event = premier install PWA). (5) 🩹 Fixes UI — auto-save PAR PLAN (slot localStorage indexé par planId au lieu du slot unique partagé + migration legacy transparente via `_migrerAncienSlotUniqueSiBesoin`), ⭐ Favoris dans l'Aide intégrée, tableau MemInspector localStorage débordait sur mobile (`table-layout: fixed` + word-break + filets `overflow-x: hidden`), boussole derrière le footer en mode refonte (z-index 1250 + gap dynamique 36px + variable CSS `--kta-statusbar-h`), modales 🐛 Logs debug et 📋 Journal réseau illisibles en thème clair (refactor `debug.js > _refreshModal` vers classes CSS + ~95 lignes overrides `body.kta-theme-light` pour les couleurs `.kta-debug-log-*` et `.kta-net-log-*`). **Aucune nouvelle surface réseau** : tous les ajouts sont 100 % locaux (lecture localStorage / IndexedDB / Cache API, fichiers annexes ZIP KMZ/GPX, hooks SW client, fonction pure compareSemver). **Sources** : `version.json` → `v1.19.1`, `js/copyright.js > __MKM__.build` → `v1.19.1`, `sw.js > CACHE_NAME` → `myktamap-cache-v1.19.1`. 1 nouveau fichier ajouté à `ASSETS_TO_CACHE` : `js/memInspector.js`. Modifs internes à : `js/createConf.js`, `js/sessionExporter.js`, `js/kmzExport.js`, `js/kmzImport.js`, `js/gpxIO.js`, `js/gpxImport.js`, `js/interface.js`, `js/updateChecker.js`, `js/debug.js`, `js/sessionPersist.js`, `js/sessionBackups.js`, `index.html`, `css/style.css` + doc full. **Notes pour les agents IA** : les sections §57 / §58 / §59 / §60 / §61 du CLAUDE.md (initialement labellisées v1.16.1 / v1.17.0 / v1.18.0 / v1.19.0 / v1.20.0 pendant les itérations dev) racontent l'histoire détaillée de chaque sous-feature consolidée dans cette release v1.19.1.
- 🆕 **v1.20.0 (24/05/2026)** : **Cycle « Polish UX + DX »**. 3 améliorations indépendantes regroupées en 1 release MINOR : (1) **📚 Aide intégrée enrichie** dans `js/interface.js > afficherAide` — 2 nouvelles sections ajoutées : « 📊 Inspecteur mémoire (v1.19.0) » (5 sections détaillées + 📋 Copier rapport + cas d'usage debug + précision « 100 % local ») et « 🏷️ Légende personnalisable (v1.16.0 + v1.17.0 + v1.18.x) » (cascade complète session > plan > défaut MKM + 2 points d'édition + 4 catégories + roundtrip KMZ/GPX + détection au preview d'import). Bonus : enrichissement section « 🏗️ Créer / Modifier un plan » avec mention Mode Simple/Avancé. (2) **🆙 Update Checker en vrai semver** dans `js/updateChecker.js` — ajout d'un helper `compareSemver(a, b)` qui parse en `[X, Y, Z]` et compare numériquement (vs comparison string actuelle). Anti-bug latent : `"v1.7.10" < "v1.7.9"` en string (`10` se compare lexicographiquement comme `1` puis `0` au char[4] vs `9`). Pas un bug aujourd'hui (uniquement `===` utilisé), mais protège contre future utilisation de `<` ou `>`. **Nouveau cas géré** : downgrade serveur détecté → ne PAS proposer une « mise à jour » qui régresse (`if (cmp < 0) return { status: "downgrade-detected" }`). API publique étendue : `window.UpdateChecker.compareSemver(a, b)` exposé. Format accepté : `v1.7.10`, `1.7.10`, `v1.7.10-fix2` (suffix ignoré), `v143` (legacy). (3) **🔄 Force update auto-proposé sur mismatch CACHE_NAME** dans `index.html` — nouveau hook sur `navigator.serviceWorker.addEventListener("controllerchange")`. Quand un nouveau SW prend le contrôle pendant la session (= bump CACHE_NAME côté serveur), toast non-bloquant via `OOMGuard.showToast("🔄 Mise à jour mineure appliquée — assets fraîchement rechargés.", "info")`. Garde-fou : skip le PREMIER `controllerchange` si la page n'avait pas de controller au load (= cas premier install PWA, pas une vraie update). Le SW MyKTAMap fait déjà `self.skipWaiting()` au install + `self.clients.claim()` au activate, donc `controllerchange` fire immédiatement sans attendre un reload manuel. Bonus traçabilité : hook `reg.addEventListener("updatefound")` qui log l'état du nouveau SW en console (visible dans 🐛 Logs détaillés). **Sources** : `version.json` → `v1.20.0`, `js/copyright.js > __MKM__.build` → `v1.20.0`, `sw.js > CACHE_NAME` → `myktamap-cache-v1.20.0` (fin des suffixes `-fixes` du dev). Aucun nouveau fichier — modifs internes à 3 modules (~155 lignes total). **Aucune nouvelle surface réseau** : hook controllerchange = event navigateur 100 % local, compareSemver = fonction pure sans I/O.
- 🆕 **v1.19.0 (24/05/2026)** : **📊 État mémoire — Inspecteur de transparence & debug**. Nouveau module `js/memInspector.js` (~580 lignes IIFE) → `window.MemInspector = { ouvrir, fermer, collecter, formatBytes, getReportText }`. Accessible depuis ⚙️ Configuration loader > nouvelle section « 📊 Inspecteur » > bouton « 📊 Voir l'état mémoire ». **5 sections affichées** : (1) **🧠 Runtime** — version app, plan chargé (nom/version/dims/M-LVL/V2/calques/légende custom), session active (📍 N points / 🛣️ M tracés / ⬛ K zones / 🏛️ structures + état mesure/tracker/iti), APP_CONFIG (debug/perfPreset/scaledMarkers/intersections/M-LVL), modules chargés/manquants (liste KNOWN_MODULES = 27 modules MyKTAMap). (2) **🗂️ localStorage** — itération `localStorage.length` + `getItem`, filtre prefix `myktamap_*` / `app_user_prefs` / `kta_*`, taille calculée via `value.length * 2` (UTF-16 approximation), tri décroissant, mini-barre proportionnelle par clé. (3) **💾 IndexedDB** — 3 bases connues hardcodées (`myktamap_handles` v2 [handles, blobs], `myktamap_backups` v1 [backups], `myktamap_photos` v1 [photos]) + scan natif via `indexedDB.databases()` (Chrome 71+, Firefox 126+) pour détecter bases tierces, count par store via `objectStore.count()` read-only. (4) **📦 Cache PWA** — `caches.keys()` + détection cache actif via `window.__MKM__.build` → `myktamap-cache-<build>` (fallback regex `/^myktamap-cache-/`) + `caches.open().keys()` + échantillon des 12 premiers assets (URLs pathname only). (5) **📊 Storage estimate** — `navigator.storage.estimate()` → usage / quota / % avec barre gradient (vert → jaune → rouge selon usage). **Collecte 100% async**, tolérante aux APIs absentes (warn console + skip de la section qui échoue, jamais de modale cassée). **Bouton 📋 Copier le rapport** : formate tout en texte plain markdown-like prêt à coller dans Discord / mail / GitHub issue. Fallback `execCommand("copy")` pour les contextes non-sécurisés HTTP. **UI** : modale `.kta-readme-modal-overlay` standard, boîte spacieuse (720px mobile → 920px PC ≥ 1024px → 1100px PC ≥ 1440px), sections card-stack avec headers ambre charte + total à droite, tableau localStorage avec barre de proportion, tags colorés (vert ON / rouge warn / gris dim), header timestamp + version app pour traçabilité du rapport, footer avec 🔄 Rafraîchir + 📋 Copier. **Aucune nouvelle surface réseau** : lecture locale uniquement (`localStorage`, IDB read-only, `caches.keys()`, `navigator.storage.estimate()`), aucun fetch externe, aucune transmission. Le rapport copié reste local (presse-papier navigateur). **Sources** : `version.json` → `v1.19.0`, `js/copyright.js > __MKM__.build` → `v1.19.0`, `sw.js > CACHE_NAME` → `myktamap-cache-v1.19.0`. Nouveau fichier `js/memInspector.js` ajouté à `ASSETS_TO_CACHE`. Balise `<script>` insérée dans `index.html` juste après `js/networkAudit.js` (cohérence « outils d'inspection & transparence »). ~80 lignes UI dans la modale Configuration loader (nouvelle section + handler), ~310 lignes CSS dans style.css (dark + light theme variants complets).
- 🆕 **v1.18.1 (24/05/2026)** : **Hotfix PATCH — Extension du roundtrip `customLegend` au GPX + preview d'import KMZ/GPX**. Complète la v1.18.0. **(1) GPX export** (`js/gpxIO.js > exporter`) : nouveau champ `opts.planCustomLegend` accepté. Si présent, embed dans `<extensions><myktamap:customLegend>…</myktamap:customLegend></extensions>` sous `<metadata>` du GPX (xmlns:myktamap=`https://myktamap.fr/gpx/ext/v1` déclaré au root `<gpx>`). Payload identique au KMZ : wrapper JSON `{type: "myktamap-gpx-extras", version: 1, exportedAt, customLegend}` sérialisé + escapé XML. Transparent pour les apps tierces (TopoDroid, OsmAnd, Strava, Avenza, Garmin) qui ignorent les `<extensions>` sous `<metadata>` standardement. **(2) GPX parser** (`js/gpxIO.js > parser`) : extrait `<extensions>` puis cherche enfant direct dont `localName === "customlegend"` (insensible au namespace pour tolérer GPX édités à la main sans déclaration `xmlns:myktamap`). Pose le résultat dans `parsed.metadata.customLegend`. Matching à 2 formats : wrapper complet OU état brut. Skip silencieux si JSON corrompu (warn console). **(3) GPX export UI** (`js/sessionExporter.js > _renderGpx`) : nouvelle checkbox `🏷️ Légende personnalisée du plan` dans la section 📍 Contenu à exporter (GPX). Cochée par défaut SI `PLAN_CONFIG.customLegend` non-vide (détection identique au KMZ), grisée à 0 sinon. Plumbing vers `GpxIO.exporter` via `opts.planCustomLegend` calculé conditionnellement. **(4) GPX reconversion** (`js/gpxImport.js > genererZipMyktamap`) : injecte `parsed.metadata.customLegend` dans `planConfig.plan.customLegend` du ZIP reconstruit. La cascade `LegendCustomization.loadPlanState` l'appliquera au boot. **(5) `importer()` (session)** : ignore silencieusement `parsed.metadata.customLegend` — scope plan-level, pas session-level. **(6) Preview d'import KMZ** (`js/createConf.js > _kmzImpAnalyserFichier`) : parse async de `myktamap-extras.json` extrait par `extraireKmz`, affiche `✅ Légende personnalisée du plan détectée : N renommés · M masqués · K customs (restaurée au boot)` dans le résumé du preview avant la génération. Skip silencieux si fichier absent ou champ vide. **(7) Preview d'import GPX** (`js/createConf.js > _gpxImpAnalyserFichier`) : lecture directe de `parsed.metadata.customLegend` (déjà extrait par parser), affichage identique au KMZ pour cohérence UX cross-format. **Aucune nouvelle surface réseau** — `<extensions>` GPX embarquée localement + parsée localement via `DOMParser` natif. **Sources** : `version.json` → `v1.18.1`, `js/copyright.js > __MKM__.build` → `v1.18.1`, `sw.js > CACHE_NAME` → `myktamap-cache-v1.18.1`. Aucun nouveau fichier — modifs internes à 4 modules (~135 lignes total).
- 🆕 **v1.18.0 (24/05/2026)** : **Roundtrip KMZ de la légende plan-level** (suite directe v1.17.0). La nouvelle source de vérité `PLAN_CONFIG.customLegend` introduite en v1.17.0 voyage désormais avec le format KMZ exporté. **(1) Embed côté export** (`js/kmzExport.js`) : nouveau champ `opts.planCustomLegend` accepté par `genererKmz`, embarqué dans un fichier annexe `myktamap-extras.json` à côté de `doc.kml` dans le ZIP KMZ. Format ouvert `{ type: "myktamap-kmz-extras", version: 1, exportedAt, customLegend }`. Les apps tierces (Google Earth, OsmAnd, Avenza, ArcGIS, Locus) ignorent ce fichier inconnu sans broncher → le KMZ reste 100% standard pour elles. **(2) UI export** (`js/sessionExporter.js`) : nouvelle checkbox « 🏷️ Légende personnalisée du plan » dans la modale 💾 Enregistrer session > onglet 🌍 KMZ > section 📦 Contenu à inclure. Cochée par défaut SI `PLAN_CONFIG.customLegend` non-vide (détection via `labels/hidden/customEntries` non-vides), grisée à 0 sinon. Passage à `genererKmz` via `opts.planCustomLegend` calculé conditionnellement. **(3) Parse côté import** (`js/kmzImport.js > genererZipMyktamap`) : détection de `myktamap-extras.json` dans `opts.assets` (matching insensible à la casse + chemin tolérant via regex `/(?:^|\/)myktamap-extras\.json$/i`), parse JSON, injection dans `planConfig.plan.customLegend` du ZIP MyKTAMap reconstruit. La cascade `LegendCustomization` l'appliquera automatiquement au boot du plan importé via `loadPlanState()` (cf §58.2). `extraireKmz` capture déjà tous les fichiers non-KML dans `assets` sans filtre → aucune modif nécessaire à l'extraction. **Skip silencieux** dans 3 cas : fichier absent (KMZ tiers, ou KMZ MyKTAMap < v1.18.0), fichier corrompu (JSON parse error → warn console), champ customLegend absent/non-objet. **Aucune nouvelle surface réseau** — fichier `myktamap-extras.json` embarqué localement dans le KMZ + parsé localement à l'import (`Blob.text()` + `JSON.parse`). **Sources** : `version.json` → `v1.18.0`, `js/copyright.js > __MKM__.build` → `v1.18.0`, `sw.js > CACHE_NAME` → `myktamap-cache-v1.18.0`. Aucun nouveau fichier — modifs internes à `js/kmzExport.js` (~15 lignes), `js/sessionExporter.js` (~30 lignes), `js/kmzImport.js` (~25 lignes).
- 🆕 **v1.17.0 (24/05/2026)** : **Cycle « Générateur accessible »** — refonte UX du Générateur 📦 Créer / Modifier un plan + nouvelle source de vérité plan-level pour la légende. **(1) Mode Simple / Avancé du Générateur** : switcher segmented control en haut de la modale (`#kta-planner-mode-switcher`), persistance sticky `localStorage["myktamap_planner_mode"]` (default `"simple"` au premier launch). Helpers ajoutés à `js/createConf.js` : `_lirePlannerMode()`, `_ecrirePlannerMode(mode)`, `_appliquerPlannerMode(mode)`. Mode Simple = métadonnées (nom + version + auteur) + image (upload OU canvas vierge avec dims + couleur) + M-LVL + V2 (tiledV2). Mode Avancé = formulaire complet (= comportement v1.16.x). Sections avancées masquées via marqueurs HTML `data-planner-advanced="1"` + règle CSS unique `#kta-planner-corps[data-planner-mode="simple"] [data-planner-advanced="1"] { display: none !important }`. **Auto-load icônes built-in en mode Simple** : sinon ZIP généré sans icônes → markers data layer cassés au load. **Mode Modifier forcé en Avancé** : si `_plannerMode === "modifier"`, `_appliquerPlannerMode` override toute préférence sticky vers `"avance"` + masque le switcher (`style.display = "none"`). Évite de perdre les customs / dataLayers / imageLayers / icons custom du plan source. **(2) Éditeur légende plan-level** : nouvelle section dédiée « 🏷️ Légende du plan » dans le mode Avancé. Source de vérité = `plan-config.json > plan.customLegend` (= cascade niveau plan, partagée à tous les utilisateurs du plan, surchargeable par leur session). Architecture sans modifier `legendCustomization.js` : pattern de **swap session ↔ plan** dans `_ouvrirEditeurLegendePlan` — sauvegarde session courante via `getSessionState()`, charge `_plannerPlanLegend` dans la session via `loadSessionState`, ouvre l'éditeur standard `LC.ouvrirEditeur({onClose})` qui mute la session, au close capture l'état édité via `getSessionState()` → `_plannerPlanLegend`, restore la session vraie. Status display dynamique (« ✏️ Personnalisée : N renommés · M masqués · K customs » ou « Aucune personnalisation »). Normalisation `_plannerLegendStateNormalize` retourne `null` si état vide (zéro override) → évite pollution `plan-config.json` avec `customLegend: { labels:{}, hidden:{}, customEntries:[] }` vide. **Pre-fill en mode Modifier** : `_preRemplirFormulaire` lit `config.plan.customLegend` du ZIP source. **Embed au `_genererZip`** : juste après les autres flags conditionnels (multiLevel, tiledV2, georef), `if (_plannerPlanLegend) planObj.customLegend = _plannerPlanLegend`. Rétro-compat absolue (champ absent sinon, ignoré par versions ≤ v1.16.x). **Aucune nouvelle surface réseau** — toggle UI local + état embarqué dans le ZIP (= fichier 100% local). **Sources** : `version.json` → `v1.17.0`, `js/copyright.js > __MKM__.build` → `v1.17.0`, `sw.js > CACHE_NAME` → `myktamap-cache-v1.17.0`. Aucun nouveau fichier — modifs internes à `js/createConf.js` (~300 lignes ajoutées : 6 nouvelles fonctions top-level + handlers + nouvelle section HTML) et `css/style.css` (~140 lignes ajoutées : switcher + section légende + variants thème clair).
- 🆕 **v1.16.1 (24/05/2026)** : **Hotfix PATCH — Auto-save PAR PLAN**. `js/sessionPersist.js` : remplacement du slot unique `localStorage["myktamap_session_v1"]` par un slot indexé par planId `localStorage["myktamap_session_v1_<planId>"]`. Helpers internes `STORAGE_PREFIX = "myktamap_session_v1_"` + `_storageKeyFor(planId)` ciblent désormais toutes les opérations `save / getSaved / clear / lecture initiale` sur le slot du plan courant. Le wipe automatique `clear()` au mismatch planId dans `onPlanLoaded` est **supprimé** — chaque plan garde sa session en parallèle. **Migration transparente** : `_migrerAncienSlotUniqueSiBesoin()` au boot lit l'ancien slot legacy, extrait son planId, et le déplace vers la nouvelle clé (gère le cas où un slot per-plan plus récent existe déjà via comparaison `savedAt`). **SessionBackups aligné** : `_readCurrentSessionPayload()` lit en priorité le slot per-plan du planId courant + fallback legacy ; `restore(id)` écrit dans `myktamap_session_v1_<targetPlanId>` (extrait de `entry.payload.planId` ou `entry.planId`) puis appelle `PlanRegistry.setLastPlanId(targetPlanId)` AVANT `location.reload()` pour recharger automatiquement le bon plan. **Impact UX terrain** : quitter un plan → aller sur un autre → revenir = la session reprend exactement où elle s'était arrêtée pour CE plan, sans avoir besoin de charger un snapshot. **Aucune nouvelle surface réseau** — modification purement structurelle au niveau localStorage local. **Sources** : `version.json` → `v1.16.1`, `js/copyright.js > __MKM__.build` → `v1.16.1`, `sw.js > CACHE_NAME` → `myktamap-cache-v1.16.1`. Aucun nouveau fichier — modifs internes à `js/sessionPersist.js` et `js/sessionBackups.js`.
- 🆕 **v1.16.0 (24/05/2026)** : **Cycle « UX & filet de sécurité »** — 4 features majeures qui se complètent : (1) 📝 **Notes** (description) sur zones / tracés / structures avec helper `window.attacherNotePopup` + ghost polyline transparente épaisse pour ergonomie clic + roundtrip session/KMZ/GPX, (2) 🏷️ **Légende personnalisable** via nouveau module `js/legendCustomization.js` (~600 lignes IIFE) → `window.LegendCustomization = { getLabel, isVisible, listEntries, listCustomEntries, addCustomEntry, removeCustomEntry, setSessionLabel, setSessionVisibility, ouvrirEditeur, findCustomEntry, onCustomEntriesChange }`. Cascade session > plan (`PLAN_CONFIG.customLegend`) > default. **4 catégories** : icones/traces/zones/structures. **Entrées custom DESSINABLES** via `geometry` (polyline/polygon) → boutons sidebar dynamiques + style resolvers `_resolveRoadStyle / _resolveZoneStyle / _resolveStructureStyle`. UI éditeur dans modale Export PNG + bouton ✏️ Modifier dans fenêtre 🗺️ Légende. Persistance dans `SessionPersist.payload.customLegend`. **Pivot UI flyout sidebar** : remplace cascade verticale pour traces/zones/structures par panel latéral avec position dynamique (`getBoundingClientRect` + resize/scroll listeners), header sticky, max-height en pixels réels. Bouton ✅ **Valider tracé** ajouté (équivalent re-clic type actif via `_fermerModeRoad`). (3) ⭐ **Favoris points** via nouveau module `js/favoris.js` (~180 lignes IIFE) → `window.Favoris = { loadPlan, getAll, isFav, findByPointId, add, remove, toggle, onChange }`. Stockage `localStorage["myktamap_favoris_v1"]` indexé par planId. Snapshots complets des points (résilience). Bouton ⭐ dans popup POI + groupe sidebar `⭐ Favoris` **position topleft juste après M-LVL**, liste flyout dynamique → clic centre + flash circleMarker orange 3s + ouvre popup marker. (4) 📦 **Backup multi-rotations sessions** via nouveau module `js/sessionBackups.js` (~280 lignes IIFE) → `window.SessionBackups = { init, snapshot, listAll, restore, remove, clearAll, onChange }`. **10 snapshots FIFO en IndexedDB** (DB `myktamap_backups` v1 / store `backups` / key timestamp). **4 triggers** : auto périodique 5 min (hash check djb2), boot pre+post restore, avant destructif (`SessionPersist.clear`), manuel via 📆 Snapshot maintenant. UI section **📦 Backups récents** dans modale 📊 Détails session (filtrée plan courant, badge `(+N autres plans)`, liste compacte). Restore par écriture localStorage + `location.reload()`. **Hotfixes** : (a) thème clair compass widget (nouveaux overrides `body.kta-theme-light .kta-compass-widget*`), (b) garde-fous « Changer de plan » reformulés (les 2 modales — clic rose des vents/titre + clic plan spécifique — affichent désormais « ✅ Ta session est sauvegardée et sera restaurée à ton retour. 📦 Les 10 derniers snapshots restent dispos dans 📊 Détails de session › Backups récents » au lieu de « Les données non exportées seront perdues »). **Confidentialité** : aucun nouveau call réseau. Backups IDB local, favoris localStorage, LegendCustomization dans payload SessionPersist existant. **Sources** : `version.json` → `v1.16.0`, `js/copyright.js > __MKM__.build` → `v1.16.0`, `sw.js > CACHE_NAME` → `myktamap-cache-v1.16.0`. 3 nouveaux fichiers ajoutés à `ASSETS_TO_CACHE` : `js/legendCustomization.js` + `js/favoris.js` + `js/sessionBackups.js`.
- 🆕 **v1.15.0 (24/05/2026)** : **📤 Import GPX → ZIP MyKTAMap** + consolidation cycle v1.14.x complet. Nouveau module `js/gpxImport.js` (~310 lignes IIFE) → `window.GpxImport = { estGpxMyktamap, extraireGpx, extraireBoundsGps, genererCanvasVierge, ingestParsed, genererZipMyktamap }`. **Pendant exact de `kmzImport.js`** pour le format GPX. Spécificité GPX : pas d'image plan → **génération automatique d'un canvas vierge** (4000×4000 par défaut, couleur sépia / blanc / gris / noir) avec **calibrage GPS auto-déduit des bounds** (coin BL = lat/lng min, coin TR = lat/lng max + marge 5%). Plan-config.json embarque `plan.georef = { pointA, pointB }` propagé vers `KmzExport.setCalibration` au load via `main.js > _propagerGeorefVersKmzExport` (pattern v1.14.20). **UI** : nouvelle modale `_afficherImporterGpx` dans createConf.js — mirroir visuel de `_afficherImporterKmz` (upload → analyse → résumé bounds+nb wpts/trks+détection MyKTAMap → config nom/version/dimensions/couleur/fallback tag-type/V2/M-LVL → génération ZIP). Exposée via `window.afficherImporterGpx`. **Drop zone unifié** : home `#zipDropZone` ET générateur `#kta-planner-zip-drop` acceptent désormais les 3 extensions `.zip` / `.kmz` / `.gpx` avec routing automatique vers le bon pipeline. **Check up gpxIO.js** : 3 fixes mineurs pour roundtrip parfait — (1) export `<desc>` sur les tracks (perdue avant), (2) parse `<desc>` track → `track.desc`, (3) ajout `jonction` dans `validTypes` (avant ce fix, jonction → chemin). **Round-trip MyKTAMap GPX** : restaure tags points (`<sym>` / `<type>`), types tracés (principal/secondaire/chemin/itinerary/jonction), niveaux M-LVL (`<cmt>`), descriptions wpt+trk, nom du plan (`<metadata><name>`). **Confidentialité** : 100% local, seul fetch externe = `icon/<tag>.png` depuis l'app (déjà cached SW, marche offline) pour restaurer les icônes des tags ingérés. Aucun nouveau call réseau. **Sources** : `version.json`, `js/copyright.js > __MKM__.build` → `v1.15.0`, `sw.js > CACHE_NAME` → `myktamap-cache-v1.15.0-gpx-import`, nouveau `js/gpxImport.js` ajouté à `ASSETS_TO_CACHE`.
- 🆕 **v1.14.0 (23/05/2026)** : **📤📥 GPX import + export** — première feature Phase 1 V3 quick wins. Nouveau module `js/gpxIO.js` (~360 lignes IIFE) → `window.GpxIO = { exporter, parser, importer, verifierCalibrage }`. Format GPX 1.1 standard (compatible TopoDroid, OsmAnd, Avenza, GPSies, Strava, Garmin). Réutilise intégralement le calibrage KMZ existant : `window.KmzExport.planToGps` (export) et `gpsToPlan` (nouveau, inverse pour import). **Export** : nouvel onglet 📤 GPX dans modale 💾 Enregistrer session, à côté de KMZ. Options : points session / points embedded / tracés / itinéraire. **Import** : nouvelle sous-action 📤 Importer GPX dans groupe ⬇️ Charger. Flow file picker → parse → preview (X waypoints + Y tracks, warnings hors-bounds) → confirmation → ajout aux annotations avec snapshot HistoryManager (Ctrl+Z annule). **Roundtrip MyKTAMap ↔ MyKTAMap** : niveaux M-LVL préservés via `<cmt>MyKTAMap level=N</cmt>`, types de tracés via `<type>`, tags via `<sym>+<type>`. **Garde-fous** : détection points hors bounds du plan + vérif calibrage avant tout import (sinon message explicite invitant à passer par KMZ). Pas de nouvelle dépendance (DOMParser natif).
- 🆕 **v1.13.0 (23/05/2026)** : **Thème CLAIR GLOBAL** (étendu de "mode carte" à "partout dans l'app" en cours de release) — première release V3. Module `js/themeManager.js` (~150 lignes IIFE) → `window.ThemeManager = { init, getCurrent, setTheme, toggleTheme, onChange, isLight }`. Toggle ☀️/🌙 à **2 endroits synchronisés** : (a) sidebar gauche → groupe ⚙️ Paramètres → sous-action (mode carte), (b) modale Configuration home → checkbox "☀️ Activer le thème CLAIR". Les 2 pointent sur `localStorage["myktamap_theme_v1"]` (KARMA choix B:a). **Palette claire** : body `#f0e8d8` (beige cataphile) + bars+sidebar+icônes `#c9b88f` (brun-beige) + modales `#fdf8eb` (presque blanc) + accent jaune `#f4c542` conservé (KARMA choix E:a). Variables CSS `--kta-light-bg/bg-bar/bg-elevated/text/text-muted/border/accent/...`. **Scope final = toute l'app sauf 2 exceptions volontaires** : (1) splash KARMA cinématique au boot, (2) viewer photos plein écran. Couvre : home (loader + cards + boutons + footer copyright + splash chargement), modale Configuration home, Docs/Aide/Audit/Légende, UnlockGate + PinGate (keypad), Plan switcher (clic titre), mode carte entier (sidebar + header + footer + container Leaflet), toutes les modales mode carte (Session, Recherche Ctrl+K, Itinéraire, Mesure, Édition, Export PNG/PDF/KMZ, Réglages, M-LVL, Replay, Choix suppression, Je suis perdu, etc.), modale Update (overrides inline styles via `[style*="rgba(140,180,255"]`), alertes publiques (rouge emergency / orange warning / bleu info / neutre absent), modales progress `.kta-modal-*` (Mise à jour/Reset en cours), toasts, popups Leaflet, tooltips, zoom controls, contrôles calques. **Application sur `<html>` + `<body>`** (critique pour matcher les modales appendées à `documentElement` qui sont SIBLING de body — selectors `body.kta-theme-light .modal` ne suffisent pas, on a aussi `html.kta-theme-light .modal`). ~1200 lignes CSS overrides avec `!important` (pour battre les styles inline injectés par les modules JS comme searchPoints.js, sessionExporter.js). Meta theme-color statusbar mobile mis à jour dynamiquement (#f0e8d8 clair / #111827 sombre). **Sync mode urgence** : applique le thème global au boot de l'overlay, garde son toggle 🔆/🌑 LOCAL pour bascule ponctuelle. **Bonus v1.13.0** : (1) 🗺️ Mode urgence — itinéraire ré-activé par défaut (toggle retirée, anti-crash JPG géré séparément depuis v1.12.0), (2) 📏 Fix hauteur 88vh étirée sur 6 modales courtes (Niveaux/Légende/Jonction/Iti/Lost/Enregistrer-session) — pattern `height: auto !important; max-height: 90vh !important` (général dark + light).
- 🆕 **v1.12.0 (23/05/2026)** : **Pack terrain V2** — 4 fonctionnalités terrain consolidées (V2.1 → V2.4), validées une par une côté terrain entre v1.11.0 et v1.12.0. Détails :
  - 🪫 **V2.1 — Indicateur de batterie + alertes graduelles**. Module `js/batteryGuard.js` (~280 lignes IIFE) → `window.BatteryGuard = { init, forceCheck, getState, onChange, getStatusLabel, isAvailable }`. Source : Battery Status API (`navigator.getBattery()`) dispo Chromium uniquement (Android/PC). Affichage à 3 endroits : chip header (à côté des compteurs session, sortie de la zone hover sidebar), footer modale 📋 Session active, bloc 🔋 ÉTAT du mode urgence. Warnings graduels 20%/10%/5% via toast `OOMGuard.showToast` + persistance localStorage par seuil par cycle de décharge (pas de spam). Anti-flicker : throttle 5s entre `change` events + polling 30s de secours. Gracieux fallback si API absente (Safari iOS, Firefox récents) : `display: none` complet sans message d'erreur. Permissions-Policy nginx `battery=(self)` ajouté à `docs/nginx-csp-config.conf`. Sync forcée au boot : 4 attempts cascade dans `main.js > lancerApplication` (immédiat + 300ms + 1s + 3s).
  - 📊 **V2.2 — Stats session enrichies + ⬛ Mesure de surface (bonus)**. Stats agrégées dans la modale 📋 Session active : total + breakdown par type (📍/🛣️/⬛/🏛️) + distance cumulée des tracés (auto m→km) + **surface cumulée des zones** (auto m²→ha) + photos POI + durée session (`window._sessionStartTs` posé dans `main.js > lancerApplication`). Multi-niveau (M-LVL) : breakdown additionnel par niveau. Boutons 📋 Copier + 💾 Export TXT. Helpers ajoutés à `js/utils.js` : `formatSurface(m2, dec)`, `polygonArea(points)` (shoelace plan), `polygonAreaM2(points)` (via `APP_CONFIG.scale`). **Bonus surface** : refonte `js/measure.js` avec 2 modes — 📐 distance (legacy polyline) + ⬛ surface (polygone shoelace). Toggle 📏/⬛ dans groupe Mesure. Label adaptatif `📐 Distance: X m` ou `⬛ Surface: X m²`. API publique : `window.setMeasureMode("distance"|"surface")`, `window.getMeasureValue()`. Persistance complète dans `sessionPersist.js` (champs `measureMode` + `measurePoints`, restore order : `setMeasureMode` AVANT `setMeasurePoints`).
  - 🎬 **V2.3 — Replay tracker + Export CSV**. Instrumentation `js/tracking.js` : `_trackingTimeline = []`, `_trackingStartTs = null`, `_pushTimelinePoint(type)` helper (type ∈ `{start, pdr, recalage}`). 4 sites instrumentés : `startTracking`, click recalage, `avancer` (PDR pas applied), `recalerTrackerSurPoint`. API publique exposée : `window.getTrackingTimeline()`, `getTrackingStartTs()`, `getTrackingDistanceM()`, `resetTrackingTimeline()`. Nouveau module `js/trackerReplay.js` (~500 lignes IIFE) → `window.TrackerReplay = { ouvrir, fermer, exporterCSV }`. Modale plein écran avec slider timeline + play/pause/restart/end + vitesse 0.5×→10× + raccourcis clavier (Espace, ← →, Échap). Mode compact (bottom sheet) activé auto au Play pour libérer la carte. Bouton ⛶ toggle compact/normal manuel. Trail multi-segments (skip recalage = téléportation). Marker mobile `L.circleMarker` jaune. Export CSV : `timestamp_ms_epoch,delta_ms_since_start,x_plan,y_plan,type[,level]`. Reset dans `main.js > _libererRessourcesPlanPrecedent` au plan switch.
  - 🔥 **V2.4 — Heatmap** : module `js/heatmap.js` (~380 lignes IIFE) **implémenté mais DÉSACTIVÉ** en v1.12.0 par décision KARMA (pas d'utilité concrète sur le terrain démontrée). Canvas overlay `L.imageOverlay` data URL + radial gradient par point + colormap bleu→vert→jaune→rouge via `getImageData/putImageData` pixel manipulation. 3 sources togglables (timeline tracker / points editor session / data layer points). Sliders rayon (10-120px) + intensité (0.2-3×). Blending additif `globalCompositeOperation = "lighter"`. Fichier conservé en standby dans le repo, **non chargé** (script commenté dans `index.html`, retiré de `sw.js > ASSETS_TO_CACHE`, bouton 🔥 retiré de `js/interface.js`). 4 étapes documentées dans l'en-tête du module pour réactivation.
  - 🩹 **Fixes v1.12.0** : 🚨 mode urgence rotation paysage (3 retries `invalidateSize` cascade 80/300/700ms + refit bounds + CSS `@media orientation: landscape`) · 🚨 mode urgence crash gros plan + itinéraire (skip itinéraire >500 pts, sinon décimation 1 pt/N pour cap 100 pts, cap total 5000 pts) · 🚨 toggle ☑️ 🗺️ **Itinéraire dans la minimap** (header, persistance localStorage `myktamap_emergency_show_iti_v1`, rendu cyan vif weight 6 + halo blanc weight 10) · 🧭 bouton 📍 **Recalage** : auto-close après click + restore explicite `g.btnPrincipal.dataset.iconeOriginale` avant `_setGroupeModeActif(tracker, true, null)` qui ne touche pas l'icône sinon · 🔐 modale PIN proposal hauteur fixée (`.kta-pin-proposal-boite { height: auto !important; max-height: 90vh !important }` pour override `.kta-readme-modal-boite { height: 88vh }`) · 📱 en-tête mobile : 5 compteurs (📍/🛣️/⬛/🏛️/📸) regroupés en 1 chip 📊 cliquable ouvrant la modale Session · 🪫 chip batterie sortie de `kta-refonte-counters-btn` pour ne pas être surlignée en hover sidebar · 🪫 chip masquée complète (display: none) si API indispo au lieu d'afficher `?` · ⚡⚡ double éclair fix (emoji retiré de `_formatLabel`, gardé uniquement dans `_computeEmoji`).
- 🆕 **v1.10.3 (23/05/2026)** : **Export PDF imprimable** (📤) + **Recherche unifiée Ctrl+K** (🔍) + **Fix structures embedded dans tous les exports canvas** (🏛️) + **Migration domaine `myktamap.is-underground.fr` → `myktamap.fr`** (🌐). Détails :
  - 📤 Export PDF dans **⬆️ Enregistrer → 📤 PDF imprimable**. Formats A0/A1/A2/A3/A4 × portrait/paysage. Calques granulaires (1 case par `imageLayers` + 1 case par `dataLayers` du plan, pré-cochage = visibilité actuelle). Légende = overlay 4-coins (↖/↗/↙/↘) avec 3 tailles (compact 16px / standard 22px / large 30px) et 4 styles (Pro fond blanc *défaut* / sombre opaque / sombre semi / filigrane). Pipeline canvas réutilise `_genererCanvasExport` via wrapper public `window.MyKTAMapExporterGenererCanvas`. Mojibake emoji jsPDF Helvetica contourné par rendu de la légende en image canvas avant collage. Module : `js/pdfExport.js`, ~700 lignes, lib `lib/jspdf.umd.min.js`.
  - 🔍 Recherche unifiée (Ctrl/Cmd+K depuis n'importe où dans l'app) — couvre désormais 4 catégories : 📍 Points · 🛣️ Tracés · ⬛ Zones · 🏛️ Structures (session + embedded data layers). Résultats groupés par catégorie avec compteurs. Nouveau filtre "Catégorie" en plus des filtres legacy "Calques" et "Tags" (points-only). Au clic : centre + flash polyline dashed jaune (tracés/fronts) ou polygon transparent (zones/piliers/mur) 4 sec + popup info. Module : `js/searchPoints.js`, 832→1050 lignes. API publique (`SearchPoints.getAllPoints`/`findByQuery`) inchangée pour préserver Pathfinder + Itinéraire.
  - 🏛️ Fix structures embedded : trou découvert post-update v1.9.3, les piliers/mur/fronts dessinés dans un data layer (`structure.json`) étaient visibles sur la map mais manquaient dans `utils.js > telechargerPlan` (export PNG rapide ⚡) ET dans `exporter.js > _genererCanvasExport` (export PNG avancé 🎨 + PDF 📤). Désormais inclus partout, avec tri Z correct (mur < pilier-2 < pilier-1 < front-2 < front-1) + filtre WYSIWYG niveau.
  - 🗺️ Légende enrichie : section 🏛️ Structures dans la légende in-app (interface.js > afficherLegende), dans la légende exportée PNG (case `leg_c_structures` dans la modale Avancé), et dans le PDF (automatique via canvas).
  - 🌐 Migration domaine : 34 fichiers patchés (modules JS, HTML, docs, LICENSE). 2 préservés volontairement : `docs/nginx-redirect-old-domain.conf` (conf serveur de transition) + `docs/alert-migration-domaine-sauvegarde.json` (archive alerte).
  - 🚨 Mode urgence : `MINIMAP_ZOOM_OFFSET` ajusté à 5 (équilibre lisibilité ↔ horizon ~20-50m).
  - 🖼️ Modale Export images renommée : « Exporter le plan » → « Exporter en PNG/JPG » pour clairement distinguer du nouveau « Exporter en PDF imprimable ».
- 🎨 **Nouvelle interface en mode carte (refonte v1.9.1, polish v1.9.2 le 2026-05-22)** : la nouvelle interface est **activée par défaut**. Polish v1.9.2 = loader PC plein écran edge-to-edge, toutes les modales agrandies sur PC (Doc/Aide/Config/Légende multi-cols/Session/Tableau/Export), toggle « ⚪ Afficher les ronds aux intersections de tracés » (⚙️ Configuration home), tracker rotation continue sans saut au Nord, splash KARMA animé lettre par lettre + crédits 🍃 Leaflet · 📦 JSZip · 🧭 Dijkstra (algo pathfinder), background Leaflet aligné à la charte. Elle comprend :
  - **Header bar sticky 44px** en haut avec rose des vents cliquable (retour home avec garde-fou si session modifiée), nom du plan **cliquable** qui ouvre la modale refondue "🗂 Changer de plan" (carte highlight du plan en cours avec badge `● ACTIF` vert, liste des récents avec hover doré et flèche qui glisse, gros CTA bleu "📚 Voir tous mes plans" en bas), et compteurs cliquables (📍 points · 🛣 tracés · ⬛ zones) qui ouvrent une modale "📊 Détails de la session" listant tous les éléments avec leurs infos détaillées (nom/tag/coord pour les points, type/nb/distance par type pour les tracés et zones, mesures actives).
  - **Sidebars unifiées** gauche (Doc/Settings/Charger/Save) et droite (Recherche/Édition/Mesure + accordéons Tracés/Zones/Tracker) — barre verticale continue sans gap, sous-actions s'empilent en dessous au lieu d'apparaître à côté.
  - **Sous-actions horizontales en landscape mobile** (depuis v1.9.1) : sur petit écran horizontal, les sous-menus se déplient vers l'intérieur de l'écran (sidebar gauche → vers la droite, sidebar droite → vers la gauche) au lieu de descendre. Le zoom +/- natif Leaflet reste vertical (convention universelle).
  - **Boutons ▾/▸/◂** de réduction en haut de chaque sidebar pour gagner de la place à l'écran sans arrêter les modes actifs.
  - **Status bar sticky 52px** en bas qui regroupe les mesures live (📐 mesure · 📏 distance totale CLIQUABLE → ouvre modale · 🗺️ itinéraire CLIQUABLE → ouvre modale · 🧭 tracker GPS LED ON vert / OFF rouge), repliable via gros bouton ▾▴ (40×36px depuis v1.9.1).
  - **Footer dynamique** (depuis v1.9.1) : si toutes les stats sont actives en même temps et que ça ne tient pas en largeur, le footer **wrap sur plusieurs lignes** et s'agrandit en hauteur. La carte, la boussole et les sidebars suivent automatiquement via la variable CSS partagée `--kta-statusbar-h` (mise à jour par JS via ResizeObserver sur le status bar).
  - **🧭 Boussole d'orientation** : en portrait → bottom-left au-dessus du footer ; en landscape → **bottom-center** (pour ne pas cacher les icônes latérales des sidebars). Activée via 🧭 Tracker → 🧭 Boussole.
  - **Centrage du titre du plan** : en portrait, centrage flex classique (titre centré dans la largeur restante). En landscape, **CSS Grid `1fr auto 1fr`** pour centrage géométrique ABSOLU (peu importe l'asymétrie de largeur entre home et compteurs).
  - **Générateur de plan retiré du mode carte** — reste accessible uniquement depuis la home via 🏗️ Générer un plan.
  - **Menu ⬇️ Charger / Import allégé** (depuis v1.9.1) : retrait du sous-action "🗂️ Changer de plan" (doublon avec la rose des vents et le titre cliquable).
  - **⚙️ Configuration du loader réorganisée** (depuis v1.9.1) : ordre Confidentialité → Affichage (toggle ancienne interface) → Force update → Reset, pour que Force update et Tout réinitialiser se suivent directement (gradation purge cache → purge totale plus lisible).
  - L'user peut **opt-out** : ⚙️ Configuration (home) ou ⚙️ Réglages (map) → 🎨 Affichage → cocher "📜 Utiliser l'ancienne interface (classique v1.8.x)". Reload requis. Le choix est mémorisé entre sessions.
- 🔒 **Privacy & Audit** (depuis v1.8.0, ajustements CSP `'unsafe-inline'` + `blob:` en v1.8.1) : module de transparence + vérifiabilité construit pour répondre à la méfiance légitime du milieu cataphile. MyKTAMap est 100% client-side (aucun backend, aucune DB serveur, aucun analytics, aucun cookie de tracking) — ce module rend cette promesse **vérifiable par l'utilisateur lui-même**. Section **🔒 Confidentialité & Audit** dans la modale ⚙️ Configuration du loader avec : (1) **📋 Voir le journal réseau** = tableau live de toutes les requêtes fetch/XHR/sendBeacon/WebSocket/EventSource émises par l'app, exportable en JSON ; (2) **📖 Que fait l'app sur le réseau ?** = doc inline avec liste blanche commentée + lien vers `docs/NETWORK_AUDIT.html` (page de transparence formatée) ; (3) **🔒 Mode hors-ligne strict** = toggle opt-in qui bloque ACTIVEMENT toute requête non-whitelistée (l'app reste 100% fonctionnelle ; badge orange dans le footer du loader quand actif). Whitelist hardcodée à 4 entrées : (a) same-origin = l'app elle-même, (b) `gstatic.com/generate_204` = ping connectivité no-cors aucune donnée envoyée, (c) `blob:` = références locales au navigateur (tuiles V2), (d) `data:` = base64 inline (icônes SVG). **Aucun POST/PUT/PATCH/DELETE/sendBeacon/WebSocket/EventSource n'est jamais émis par l'app.** Double protection via CSP Nginx stricte (`connect-src 'self' https://www.gstatic.com blob:`) qui demande au navigateur lui-même de refuser toute connexion non-whitelistée.
- 🎨 **Refonte UX page d'accueil** (depuis v1.7.3) :
  - **Nouveau titre stylisé** : `📦 MyKTAMap` (basique) remplacé par un lockup graphique avec logo `mkm-full.png` (rose des vents jaune, drop-shadow halo) + "MyKTAMap" en grand + tagline "Cartographie souterraine" (remplace "Cartographie terrain" partout). Hover pulse, responsive vertical mobile / horizontal ≥1024px.
  - **Bouton ⚙️ Configuration** dans le header du loader (à côté de 📖 Documentation et 🚨 Alertes) qui ouvre une **modale unique** regroupant tout ce qui était éparpillé : Tiling, ULTRA, toggle 🐛 Logs détaillés + bouton **📋 Afficher les logs** *(nouveau)*, 🔄 **Force update douce** *(nouveau)*, 💥 Tout réinitialiser. Symétriquement, le bouton 🗑️ Réinitialiser est retiré de la modale ⚙️ Réglages in-app (map mode) — le reset complet n'est désormais accessible que depuis la modale ⚙️ Configuration du loader.
  - **🔄 Force update douce** : re-télécharge la dernière version du code (purge cache PWA) mais **garde tes données** (plans, sessions, localStorage, unlock gate). Différent de `💥 Tout réinitialiser` qui purge tout.
  - **🏗️ Générer un plan** reste directement visible dans la home (action de création, pas un réglage).
  - **📥 Conf exemple** déplacé en icône dans le modal du Générateur (section "Charger un ZIP existant"). Plus logique : c'est un outil du générateur.
  - **Section "⚙️ Plus d'options"** supprimée.
  - **Footer copyright épuré** : `© 2026 Flavien VIDAL [signature karma.png]` → `© 2026 [signature karma.png]`. Seule la mention texte "Flavien VIDAL" est retirée ; l'image signature `karma.png` est conservée comme identité visible du copyright. Le nom civil reste présent dans les headers JS et meta tags (valeur légale préservée).
  - **Retrait du toggle M-LVL du menu ⚙️ Réglages** : le multi-niveau s'active désormais **uniquement** via le générateur ou par édition manuelle de `plan-config.json`. Cascade `PlanRegistry[id].multiLevel` reste lue pour rétro-compat des users qui avaient toggle avant v1.7.3.
- 🧭 **Boussole + tracker landscape OK** (depuis v172) : avant, en mode landscape (et portrait inversé), le widget boussole et la rotation de l'icône tracker indiquaient un Nord décalé de ±90° (ou 180°). Cause : DeviceOrientationEvent renvoie α/β/γ par rapport aux axes du device, pas par rapport à l'orientation visuelle de l'écran. Fix : variable `_screenAngle` (lue depuis `screen.orientation.angle` + fallback iOS `window.orientation`) ajoutée au heading brut. Recalage instantané quand l'user tourne son tel (event `orientationchange`). Couvre les 4 orientations (portrait, landscape-left, landscape-right, portrait inversé).
- 🎨 **Modales de re-sélection ZIP refondues** (depuis v172) : remplacement des `confirm()` natifs OS par 2 modales custom respectant la charte graphique :
  - **🚫 Nom différent** (rouge) : si l'user re-sélectionne un ZIP dont le `plan.name` ne correspond pas au plan ciblé → REFUS DÉFINITIF (1 seul bouton "J'ai compris"). Avant : "Charger quand même ?" qui créait des incohérences silencieuses. Pour vraiment charger ce ZIP : passer par 📦 Charger un nouveau plan.
  - **⚠️ Mode différent** (orange/warning) : si les flags `tiledV2`/`multiLevel` du ZIP diffèrent du registre → modale explicite avec carte par discordance (Avant → Maintenant). 2 boutons Annuler / Continuer.
- 🏗️ **Générateur de plan** : Nouveau plan / Modifier existant (ZIP) — depuis v1.10.0, 2 nouvelles features :
  - **🎨 Image vierge** (depuis v1.9.3) : alternative à l'upload d'une image source. L'app génère un canvas vide aux dimensions choisies (500-12000 px) avec couleur de fond au choix (⬜ Blanc / ▫️ Gris clair / ⬛ Noir / 🌫️ Gris foncé). Utile pour dessiner un plan from scratch (piliers / fronts / tracés) sans image source — typique pour les cartographes qui visitent une carrière sans plan existant.
  - **📦 Importer un datalayer ZIP en un clic** (v1.10.0) : encadré doré dans la section Calques de données. Permet d'injecter en 1 clic les calques (points / tracés / zones / structures) + photos d'un ZIP datalayer exporté depuis un autre plan via Conversion session→data. Mode Nouveau = remplit la liste. Mode Modifier = AJOUTE avec suffixe `_imported_<N>` si conflit d'id (préserve les calques existants). Photos IDB du plan courant **merge** avec celles du ZIP (déduplication par photoId).
  - **📸 Inclure les photos attachées** (v1.10.0) : case visible en mode Modifier uniquement, cochée par défaut si le plan a des photos IDB. Embed automatique dans `data/photos/` du ZIP plan généré. Au load par un autre user, les photos sont restaurées automatiquement en IDB local + toast discret.
- ⚙️ **Réglages** : calibrage échelle, debug, reset complet, etc.
- 🚀 **Mode Performance ULTRA** (dans ⚙️ Réglages) : 6 toggles d'optimisation agressifs pour gros plans / appareils faibles — décimation tracés, désactivation animations Leaflet, abaissement seuil intersections, skip popups data-layer, auto-save lent, viewport culling. Préset ULTRA bloc ou ajustement individuel. N'affecte PAS l'image (gérée par mode performance au chargement).
- 🤖 **Aide IA** : téléchargement de ce fichier de contexte
- 🔔 **Détection de mise à jour** : version.json + popup avec choix mise à jour douce / reset complet
- 🏷️ **Badge version cliquable** dans le footer du loader : affiche la version installée. Clignote en bleu si une nouvelle version est dispo (passage à la version cible visible : `v150 → v151`). Au clic, force la modale d'update (bypass snooze 24h). Si déjà à jour, affiche les notes de la version installée.
- 🚨 **Alertes publiques** : système de diffusion d'alertes (incendie, fermeture, gaz toxiques, migration domaine...) via fichier `alert.json` côté serveur. Modales colorées selon niveau (`emergency` rouge / `warning` orange / `info` bleu) affichées en cascade après le splash. **Multi-alertes supporté depuis v163** : plusieurs alertes peuvent être actives simultanément (chacune acquittable individuellement). Bouton 🚨 dans le header du loader pour re-consulter à tout moment, avec **coloration dynamique** selon le niveau max actif + pastille compteur si N > 1 alertes.
- 🌐 **Migration domaine vers myktamap.fr** (depuis v163) : annoncée pour le **15 juillet 2026**. L'annonce est diffusée via une alerte `info` permanente dans `alert.json` (cf système d'alertes publiques) — visible via le badge 🚨 bleu dans le loader, l'utilisateur consulte quand il veut. Les 2 domaines cohabitent pendant ~2 mois pour laisser le temps d'exporter sessions et plans manuellement. Cf recette M.
- 🏗️ **Générateur de plan** : auto-détection des dimensions de l'image principale + warnings si > 10000 px / > 30 Mo. Position initiale tracker auto-centrée (W/2 × H/2) au choix de l'image, avec bouton 🎯 Recentrer.
- 🧭 **Boussole / widget Nord** (depuis v147) : sous-action 🧭 dans le groupe Tracker → affiche une rose des vents flottante en haut-gauche sous le zoom. La rose tourne en temps réel pour pointer vers le vrai Nord. Clic dessus → modal plein écran avec la rose en grand + angle cardinal exact. Outil de debug pour valider que le heading du téléphone est cohérent.
- ⚠️ **Popup avertissement au démarrage du tracker** (depuis v147) : au premier ▶️ Play de chaque session, modal qui rappelle que le module est expérimental et ne doit pas servir à se localiser en situation réelle. iOS-safe (requestPermission appelé synchronement dans le click handler).
- 🏗️ **Mode multi-niveau** (depuis v148, déclaration via générateur depuis v1.7.3) : opt-in par plan pour les carrières multi-étages (Glacière, Capucins). **Activable uniquement via le générateur de plan** (case 🏗️ Plan multi-niveau au moment de la création/modification du plan) ou par édition manuelle de `plan-config.json` (`plan.multiLevel: true`). Le toggle ⚙️ Réglages pour activer/désactiver sur un plan déjà chargé a été retiré en v1.7.3 — passer obligatoirement par le générateur force une déclaration explicite et évite les états incohérents. Une fois activé : pastille jaune `[N]` (numéro du niveau actif) sous le zoom, modale avec 2 sections (niveau actif single + niveaux visibles multi-select). Nouveau type de tracé **🪜 Jonction interniveau** (magenta pointillé) qui sert de bridge unique entre 2 niveaux. Le pathfinder est niveau-aware : ne traverse plus les croisements visuels 2D entre niveaux différents (utilise uniquement les jonctions). Items session (roads, zones, points) tagués par niveau au moment de la création, filtré au rendu.
- 🧱 **Tiling V2** (depuis v149) : système de tuilage Google Maps-like pour réduire la conso mémoire au runtime sur gros plans (>50 Mo). Génération via le générateur de plan (case 🧱 Convertir en V2 tuile) — disponible en mode Nouveau OU Modifier dès qu'une image est uploadée (depuis v151). Runtime Option B : N L.imageOverlay par niveau de zoom, swap on zoomend (~16 MB max en RAM à tout moment). Auto-crop des marges blanches intégré. Modal d'avertissement avant la conversion (lourde — recommandé sur PC plutôt que mobile).
- 🏷️ **Badges de mode sur la liste de plans** (depuis v150) : chaque ligne plan dans le loader affiche un ou deux chips de mode — `V1` (gris classique), `M-LVL` (jaune multi-niveau), `V2` (violet tuilé). Plusieurs badges peuvent coexister (un V2 peut être aussi multi-niveau).
- 🌀 **Overlay de chargement plein écran** (depuis v152) : quand un plan se charge (extraction ZIP, indexation tuiles V2 toutes les 50 tuiles, init carte), une modale centrée avec spinner + message d'étape s'affiche au-dessus du splash. Avant v152, le statut était écrit en petit en bas du loader, peu visible sur gros plans.
- ❌ **Erreur explicite en cas d'échec de génération V2** (depuis v152) : modale rouge plein écran qui détaille la cause du crash (drawImage / toBlob / saturation mémoire) avec les coordonnées de la tuile en échec + conseils actionnables (PC vs mobile, réduire l'image source, convertir en JPEG q85). Plus jamais d'erreur silencieuse pendant la conversion V2.
- 🛡️ **Détection automatique des crashs durant la génération V2** (depuis v152) : un flag localStorage est posé avant la conversion et retiré dans le `finally`. Si le navigateur kill la page pendant la génération (OOM mobile typique), le flag reste → au prochain démarrage de l'app, modale spécifique **"🧱❌ Génération V2 interrompue"** avec rappel des solutions (PC, réduire image, fermer apps en arrière-plan).

**Types de zones** (exhaustif — il n'en existe que 4 depuis v169 / Karma_dev) :
- **Remblais** (gris foncé, ⬛)
- **Effondrement** (rouge, 🟥)
- **Eau** (bleu, 🟦)
- **Inaccessible** (hachures rouge sombre / noir 45°, ⛔) — *nouveau v169*. Zone BLOQUANTE pour le pathfinder : tout segment de route qui la traverse est retiré du graphe → l'itinéraire calculé ne passera jamais par cette zone. Multi-niveau : ne bloque que les segments du même niveau. Contrainte DURE — jamais relâchée même en fallback.

→ Il n'y a **PAS** de zone "brûlée", "incendiée", "dangereuse", "fumée", "sèche", "gelée", "humide" ou autre. Strictement Remblais / Effondrement / Eau / Inaccessible.

**Types de tracés / routes** (exhaustif — il n'en existe que 5, dont 1 conditionnel) :
- **Principal** (vert épais)
- **Secondaire** (violet moyen)
- **Chemin** (jaune fin)
- **Itinéraire** (cyan néon, calculé automatiquement — pas tracé à la main)
- **Jonction interniveau** (polyline magenta pointillée + ronds blanc/magenta aux 2 extrémités) — UNIQUEMENT disponible si le plan a le mode **multi-niveau** activé. Polyline multi-points (comme un tracé normal) qui sert de bridge unique entre 2 niveaux pour le pathfinder. Sémantique `fromLevel`/`toLevel` symétrique (pathfinder traverse dans les 2 sens). S'efface comme un tracé normal via 🧹.

**Types de structures** (exhaustif — il n'en existe que 5, depuis v1.9.3) :
- **🟡 Pilier 1ère masse** (polygone, fill jaune) — pilier porteur du niveau supérieur
- **🟠 Pilier 2e masse** (polygone, fill orange) — pilier du niveau inférieur. Auto-taggé `level = -1` en mode multi-niveau
- **🔵 Mur** (polygone, fill bleu) — mur de pierre sèche, parpaing, soutènement maçonné
- **🟨 Front de taille 1ère masse** (polyligne, trait jaune) — front d'exploitation niveau supérieur (LIGNE pas polygone). Couleur alignée sur pilier-1 jaune (depuis v1.10.1).
- **🟧 Front de taille 2e masse** (polyligne, trait orange) — front d'exploitation niveau inférieur. Auto-taggé `level = -1`. Couleur alignée sur pilier-2 orange (depuis v1.10.1).

→ Il n'y a **PAS** d'autre type de structure. Pas de "voûte", "galerie", "puits maçonné", "consolidation béton" etc. Strictement ces 5 types. Le groupe sidebar est **🏛️ Structures**. Aucun effet pathfinder (lecture seule, c'est différent des zones inaccessibles ⛔ qui bloquent l'itinéraire). 4 modes de suppression (depuis v1.10.0) : ↩️ Annuler dernier point / ✂️ Dernière structure (en cours OU fermée) / 🎯 Sélectionner au clic carte (hybride polygon/polyline) / 🗑️ Toutes.

**📸 Photos POI** (depuis v1.10.0, backend IDB-first) :
- Max **5 photos par point** (limite anti-saturation IndexedDB navigateur, configurable via `MAX_PHOTOS_PER_POINT` dans `js/photos.js`)
- Compression auto : canvas → JPEG q85, côté long max 1920 px. Une photo brute de 5-10 Mo passe à ~200-500 Ko
- Stockage **100 % local** dans IndexedDB (`myktamap_photos` v1, store `photos`, indexes `by_plan` + `by_plan_point`). **Jamais envoyé sur Internet**, jamais lu par l'auteur — cohérent avec la promesse no-backend
- UI éditeur : section "📸 Photos (N/5)" dans la modale d'édition POI avec grille 3 cols PC / 2 cols mobile, miniatures 80×80, spinner pendant compression, ✕ rouge marque pending delete + ↺ vert pour annuler
- 2 boutons d'ajout : `📷 Prendre photo` (caméra mobile via `capture="environment"`) + `🖼️ Depuis la galerie` (file picker, sélection multiple)
- Popup marker : miniatures 44×44 cliquables (img directes) + compteur "📸 N photos". Tap → viewer plein écran
- Viewer plein écran (`window.MyKTAMapPhotoViewer`) : pinch-zoom 1-4×, pan, swipe horizontal pour navigation entre photos, flèches `← →` ou boutons `◂ ▸` overlay, raccourcis clavier PC (`Échap` ferme, `+ - 0` zoom, etc.)
- Header bar refonte : 5e compteur **📸** (lecture async IDB) à côté de 📍 / 🛣 / ⬛ / 🏛️. Clic → modale "📊 Détails de la session" avec breakdown par point + total Mo
- Inclus dans tous les exports (session Full / Avancé / Conversion / Générateur ZIP plan) — format unifié `photos/_index.json` + blobs. Re-import automatique au load
- **⚠️ Pas d'envoi sur Internet** — c'est une des invariantes garanties par le module Privacy & Audit. WebAuthn et IndexedDB sont 100% local navigateur.

**🔐 Code d'accès local PIN/Face ID** (depuis v1.10.0, optionnel) :
- Module `js/pinLock.js` → `window.MyKTAMapPinLock`
- Couche PERSO optionnelle par-dessus l'`UnlockGate` communautaire (qui reste actif). PIN 4-6 chiffres + biométrie Face ID/Touch ID via WebAuthn natif
- **Modèle de sécurité honnête** : c'est une **barrière UX**, PAS un chiffrement des données. Les photos et sessions restent en clair en IDB/localStorage. Cohérent avec UnlockGate et la promesse no-backend
- Hash `SHA-256(salt + pin)` via `crypto.subtle.digest`, salt random 16 bytes (`crypto.getRandomValues`). Stocké en `localStorage["myktamap_pin_v1"]`. **Jamais envoyé sur Internet**
- WebAuthn : `authenticatorAttachment: "platform"` (Face ID / Touch ID / Windows Hello — pas de clé USB roaming), challenge random côté client (no backend = compromis assumé)
- Activation/modification/désactivation **uniquement dans ⚙️ Configuration de la home** (cohérent avec la philo "réglages critiques loader-only" de v1.7.3). PAS de section dans ⚙️ Réglages map mode
- 5 tentatives PIN ratées consécutives = **lockout définitif**. Pour sortir : réinstaller l'app OU contacter l'auteur (qui ne pourra rien faire — aucune donnée serveur). Biométrie ratée n'incrémente PAS le compteur
- **Proposition d'activation one-shot** au 1er lancement post-update v1.10.0 : modale qui invite à activer. Refus → flag `myktamap_pin_proposal_done_v1` set, plus jamais re-proposé (l'user doit aller dans ⚙️ Configuration manuellement)
- Aucune recovery en cas d'oubli (= cohérent UnlockGate, philosophie no-backend)
- Boot : `main.js > initApp` ouvre la gate APRÈS UnlockGate (séquentiel), avant tout chargement de plan

**🏗️ Mode multi-niveau — niveaux visibles par défaut** (depuis v1.10.0, KARMA) :
- Au chargement d'un plan **avec multiLevel activé** : `visibleLevels` = `[-1, 0, +1]` (filtré par `availableLevels` disponibles)
- Avant v1.10.0 : default était `[0]` strict
- En single-level : `[0]` strict (rétrocompat absolue, comportement inchangé)
- Le default `availableLevels` est `[-2, -1, 0, +1, +2]` (symétrique autour de 0)

**Types de points / icônes built-in** (liste fermée) :
- Puits : `pa` (Aération), `pb` (Bouchon), `pc` (Communication), `pe` (Égout), `ps` (Spéléo)
- Accès : `peo`/`pef` (Puits Entrée Ouvert/Fermé), `eso`/`esf` (Entrée Souterraine Ouvert/Fermé), `cao`/`caf` (Carrière Accès Ouvert/Fermé)
- Signalétique : `salle` (house), `chatiere`, `passage`, `danger`, `info`, `elec`, `epure`, `plaque` (panneau beige sur poteau — pour repérer les plaques IGC, panneaux directions cataphiles, etc., depuis v152)
- Véhicule, tracker, etc.

→ L'utilisateur **peut créer des tags custom** via 🏗️ Générer un plan, mais en sortie de boîte, seuls les tags ci-dessus existent.

**Modes performance** (exhaustif — il n'en existe que 5) :
- **Off** — pas de tiling (risqué sur mobile pour grosses images). Sur un plan V2, ce mode force le fallback à l'image source `baseImage` (V1-like) au lieu du runtime tuilé.
- **Auto** — tile si l'image fait > 60 Mo
- **Qualité** — tile dès que nécessaire, params haute qualité
- **Équilibré** — défaut
- **Performance** — params agressifs pour mobile

**Modes de plan** (3 modes orthogonaux, peuvent coexister) :
- **V1** (mode classique) — défaut. Image entière chargée en RAM. Modes performance et tiling preset au chargement. Badge `V1` gris.
- **Multi-niveau / M-LVL** — opt-in via `plan.multiLevel: true` dans `plan-config.json`. Tracés, zones, points et tracker tagués par niveau. Pastille `[N]` sous le zoom + filtre visibles + jonctions interniveau. Badge `M-LVL` jaune.
- **V2 tuilé** — opt-in via `plan.tiledV2: true` + section `tiling` dans `plan-config.json`. Image découpée en tuiles 512×512 sur 4 niveaux de zoom (Google Maps-like). Runtime swap on zoomend. Badge `V2` violet.

**Formats de fichiers manipulés** (exhaustif) :
- Plans : `.zip` (archive de plan)
- Sessions : `.json` (export de session)
- Images : `.png` ou `.jpg` (image base + calques)
- Données : `.json` (puits, vehicule, editor, etc.)
- **Export terrain géoréférencé** : `.kmz` (depuis v170, Google Earth / OsmAnd / Locus / Avenza)

**Aucune autre fonctionnalité, type, ou format que ce qui est listé ici ou décrit dans la doc ci-dessous ne fait partie de MyKTAMap.**

---

## 📌 Préambule

Ce fichier contient la documentation utilisateur officielle de MyKTAMap. Pour répondre aux questions de l'utilisateur :

1. Réponds **uniquement** à partir du contenu de ce document. Si l'info n'est pas présente, dis-le clairement ("non couvert par la documentation") plutôt que d'inventer.
2. Tu n'as **aucun accès** au code source, au site officiel, à l'app en cours d'exécution, ni aux données de l'utilisateur. Si on te demande "regarde le code/le site/mon plan", explique-le.
3. Cite les **icônes et libellés exacts** de l'app quand tu donnes des étapes (ex : *Clique sur ✏️ Édition de points*).
4. Pour les sujets hors MyKTAMap (météo, autre app), redirige poliment.

### 💬 Modèles de réponse à utiliser

**Quand l'utilisateur demande une fonctionnalité qui n'existe pas** :
> *"Non, MyKTAMap ne propose pas de [X]. Les seules [zones/types/modes] disponibles sont [liste exacte d'après la doc]. Si tu veux suggérer cette fonctionnalité, contacte l'auteur via le site officiel."*

**Quand tu n'es pas sûr** :
> *"Je ne trouve pas d'information claire à ce sujet dans la documentation fournie. Pour confirmation, vérifie directement dans l'app ou contacte l'auteur."*

**Quand on te demande d'accéder à une source externe** :
> *"Je n'ai accès qu'à la documentation utilisateur fournie ici. Je ne peux ni lire le code source (non distribué publiquement), ni naviguer sur le site, ni voir ton app."*

---

# 📖 Documentation utilisateur officielle

{{README_USER}}

---

# 📚 Glossaire des termes

| Terme | Définition |
|---|---|
| **Plan** | Carte d'un site souterrain ou industriel, basée sur une image (PNG/JPEG) + données associées (points, routes, zones). |
| **Calque** | Couche d'éléments superposable sur le plan : image (légende, collision) ou données (puits, points custom, etc.). Activable/désactivable via le contrôle Layers de Leaflet. |
| **Mes annotations** | Calque spécial qui regroupe tout ce que l'utilisateur a ajouté pendant sa session : points éditeur, tracés (routes), zones. |
| **Session** | Ensemble des modifications faites par l'utilisateur sur un plan donné (points ajoutés, tracés, zones, mesures). Auto-sauvegardée localement. |
| **Tracker (PDR)** | Module expérimental qui estime la position de l'utilisateur via les capteurs inertiels du téléphone (accéléromètre + gyroscope), sans GPS. PDR = Pedestrian Dead Reckoning. |
| **Recalage** | Action de remettre manuellement le tracker à une position connue sur le plan (clic sur un point repère) pour corriger la dérive. |
| **Itinéraire** | Trajet calculé automatiquement entre 2+ waypoints en suivant le réseau de routes existant sur le plan (algorithme Dijkstra). |
| **Waypoint** | Point de passage de l'itinéraire (début, étapes intermédiaires, fin). |
| **Puits** | Accès vertical (échelle, échelons) entre 2 niveaux. Souvent classés Aération (PA) / Communication (PC) / Bouchon (PB) / Égout (PE) / Spéléo (PS). |
| **Cataphile** | Personne qui explore les anciennes carrières souterraines de Paris (et par extension, tout site souterrain abandonné). |
| **Mode performance / preset** | Réglage qui contrôle la quantité de mémoire et de calcul utilisée pour afficher le plan. 5 niveaux : Off / Auto / Qualité / Équilibré / Performance. |
| **Tiling** | Découpage de l'image principale en tuiles plus petites pour éviter de charger une seule grosse image en mémoire (évite les crashes sur mobile). |
| **V1 (plan classique)** | Plan où l'image principale est chargée intégralement en RAM au boot. Modes performance preset déterminent un éventuel tuilage runtime. Défaut historique. |
| **V2 (plan tuilé)** | Plan où l'image est pré-découpée en tuiles 512×512 sur 4 niveaux de zoom dans le ZIP (`data/tiles/z<N>/x<col>_y<-k>.jpg`). Au runtime, seules les tuiles du niveau de zoom courant sont en RAM (~16 MB max). Opt-in via le générateur de plan (case 🧱). |
| **Mode multi-niveau / M-LVL** | Opt-in par plan pour gérer les carrières multi-étages. Tracés/zones/points/tracker/**image layers (depuis v162)** tagués par niveau, filtre runtime. Jonctions interniveau (🪜) = seuls bridges entre niveaux pour le pathfinder. **Niveaux supportés (depuis v154)** : entiers positifs ET négatifs autour de 0. Défaut `[-2, -1, 0, 1, 2]` (sous-sols typiques + RDC + étages supérieurs). Auto-extension au chargement si les data layers ou image layers contiennent des niveaux hors range. **Tri Z visuel (depuis v169)** : une galerie au niveau N apparaît toujours AU-DESSUS d'une galerie au niveau N-1 (cohérence physique). Au sein du même niveau : chemin (en arrière) < secondaire < principal < jonction. Itinéraire et zones inaccessibles toujours au-dessus de tout. Le générateur (📦 Créer un plan) expose un champ "🏗️ Niveau" à côté de chaque calque image, visible uniquement quand `🏗️ Plan multi-niveau` est cochée. |
| **Jonction interniveau** | Tracé spécial (type `jonction`, magenta pointillé) qui relie 2 niveaux d'un plan multi-niveau. Le pathfinder s'en sert exclusivement pour passer d'un niveau à l'autre — les croisements visuels 2D entre niveaux différents ne comptent pas. Sémantique `fromLevel`/`toLevel` symétrique (traverse dans les 2 sens). |
| **Niveau actif** | Niveau courant utilisé pour DESSINER les nouveaux tracés/zones/points dans un plan multi-niveau. Affiché dans la pastille jaune `[N]` sous le zoom Leaflet (peut être négatif : `-1`, `-2`, etc.). Click → modale de changement. |
| **Niveaux visibles** | Liste des niveaux affichés sur la carte (filtre runtime, multi-select). Les éléments dont le `level` n'est pas dans cette liste sont masqués (opacity 0). Les jonctions sont affichées si au moins un de leurs endpoints touche un niveau visible. |
| **Auto-crop** | Étape automatique du générateur V2 qui détecte les marges blanches autour du contenu utile et tuile uniquement la zone non-blanche. Les dims `imageWidth/Height` reflètent la zone croppée. |
| **ZIP de plan** | Archive contenant toutes les données d'un plan (images + JSON + config). Format de partage entre utilisateurs. |
| **Loader** | Écran d'accueil de l'app (avant chargement d'un plan). Affiche la liste des plans connus + options de chargement. |
| **Service Worker** | Mécanisme PWA qui met les fichiers de l'app en cache pour fonctionnement hors connexion. |

---

# 🍳 Recettes — workflows fréquents pas-à-pas

### A. Première utilisation sur mobile

1. Ouvre https://myktamap.fr dans Safari (iOS) ou Chrome (Android).
2. Ajoute l'app à l'écran d'accueil (iOS : bouton Partager → "Sur l'écran d'accueil" / Android : menu ⋮ → "Installer l'application").
3. Relance depuis l'icône installée — l'app devient autonome (PWA, fonctionne hors connexion une fois les assets cachés).
4. Au premier lancement, le loader propose les plans de démo (test1 / test2). Clique l'un d'eux → ✅ Charger.

### B. Charger ton propre plan (depuis un ZIP)

1. Dans le loader, trouve la zone "Glisse ton archive ZIP ici" (ou clique pour parcourir).
2. Sélectionne ton fichier `.zip`.
3. (Optionnel) Choisis un preset de performance dans le segmented control (Auto par défaut).
4. ✅ Charger.
5. Le plan apparaît. Sa fiche est désormais dans le registre — la prochaine fois, clique-la directement.

### C. Ajouter un point sur la carte

1. Dans la barre latérale, ouvre le groupe **✏️ Édition de points**.
2. Active le mode (bouton devient vert ✓).
3. Clique sur la carte à l'endroit voulu — une modale s'ouvre.
4. Saisis le nom, choisis un type (puits, info, salle…) et éventuellement une description.
5. ✅ Ajouter.
6. Le point est sauvegardé automatiquement dans la session (auto-save toutes les 1.5s).

### D. Tracer une route

1. Ouvre le groupe **🛣️ Tracés / Routes**.
2. Choisis le type : Principal (rouge épais) / Secondaire (orange moyen) / Chemin (jaune fin).
3. Clique successivement sur la carte pour poser les points de la polyline.
4. Bouton **✓ Valider** dans le floater pour sauvegarder le tracé.
5. Bouton **❌ Annuler** pour repartir de zéro avant validation.

### E. Calculer un itinéraire entre 2 points

1. **Pré-requis** : il faut un réseau de routes (Principal/Secondaire/Chemin) reliant les 2 points, soit dans ta session, soit dans les calques de données du plan.
2. Ouvre le groupe **🧭 Tracker** → **🗺️ Calculer un itinéraire**.
3. Ajoute des waypoints :
   - Soit en tapant un nom dans la barre de recherche (autocomplete des points existants).
   - Soit en cliquant directement sur la carte (mode clic activé via toggle).
4. Quand tu as ≥ 2 waypoints, clique **🎯 Calculer**.
5. Le trajet apparaît en cyan néon. Distance + temps estimé + mode de vitesse actif sont affichés en bas à gauche.
6. **Vitesse de marche** : segmented control dans la modale, 4 presets :
   - 🍺 **Bourré** (2 km/h) — très lent, hésitant
   - 🐌 **Lente** (3 km/h) — prudente, étroitures
   - 🚶 **Normale** (5 km/h, défaut) — allure standard
   - 🏃 **Rapide** (7 km/h) — parcours connu
   Le mode est persisté entre sessions (localStorage `myktamap_iti_walking_preset`). Le label bottom-left affiche le mode actif avec son icône à côté de la distance et du temps.
7. Pour modifier : utilise les boutons 🔄 Recalculer ou ❌ Effacer.

### F. Sauvegarder et partager une session

1. Ouvre le groupe **💾 Sauvegarde session**.
2. Clique **💾 Enregistrer la session** (mode Full / Avancé selon besoin).
3. Un fichier `.json` est téléchargé.
4. Envoie-le à ton interlocuteur (mail, cloud, USB).
5. Côté destinataire : ouvrir le même plan → **📥 Importer une session** → sélectionner le `.json`.

### G. Créer un plan from scratch

1. Loader → bouton **🏗️ Générer un plan** (directement visible dans la home depuis v1.7.3).
2. Choisis "📄 Nouveau plan".
3. Upload une image (PNG ou JPEG, idéalement ≤ 8000 px de côté).
4. Définis l'échelle (combien de mètres font N pixels — clique 2 points distants sur l'image).
5. Configure les calques, les icônes par défaut, etc.
6. **📦 Générer le ZIP** — l'archive est téléchargée.
7. Recharge le ZIP via le loader pour utiliser le plan.

### H. Optimiser un plan qui plante sur mobile

1. Identifie ce qui pèse : taille image base, nombre de calques, nombre de routes, nombre de points.
2. Solutions par ordre d'impact :
   - **Convertis en V2 tuilé** (depuis v149) : 🏗️ Générateur → uploader l'image (ou le ZIP V1 existant) → cocher 🧱 **Convertir en V2 tuile (performance)** → 📦 Générer. Solution la plus efficace pour les gros plans : runtime tuilé Google Maps-like, ~16 MB max en RAM au lieu de l'image entière. ⚠️ Génération **lourde** (CPU + RAM), faire la conversion sur PC plutôt que mobile (cf modal d'avertissement à la coche).
   - **Réduis l'image base** (≤ 8000 px, JPEG qualité 85 au lieu de PNG).
   - **Diminue le nombre de calques image** (fusionne légendes + collision dans l'image base si possible).
   - **Intègre les routes dans l'image** si tu as > 200 tracés (deviennent statiques, plus interactives mais ne consomment plus de mémoire vive).
   - **Choisis le preset ⚡ Performance** au chargement.
3. Regénère le ZIP via 🏗️ Modifier existant.

### K. 🏗️ Activer le mode multi-niveau (carrière multi-étages)

> Pour les carrières / galeries avec plusieurs niveaux empilés physiquement (Glacière, Capucins, etc.). Mode opt-in désactivé par défaut. Cf glossaire `Mode multi-niveau`.

1. **Active la feature** (2 voies, depuis v1.7.3) :
   - **Via le générateur de plan** (recommandé) : 📦 Créer/Modifier un plan → cocher 🏗️ Plan multi-niveau (avancé) dans la section "Informations du plan" → 📦 Générer → ZIP avec le flag pré-activé. À l'import, le mode s'active automatiquement.
   - **Manuellement** dans `plan-config.json` : ajouter `"multiLevel": true` dans la section `plan`
   - ⚠️ Le toggle ⚙️ Réglages pour activer le mode sur un plan déjà chargé a été retiré en v1.7.3 — pour activer le mode sur un plan existant, il faut soit le ré-importer dans le générateur en cochant la case, soit éditer son `plan-config.json` manuellement avant de le re-charger.
2. Une fois activé, une **pastille `[0]` jaune** apparaît sous les boutons de zoom (haut-gauche). Le mode affiche par défaut **5 niveaux symétriques** : `-2, -1, 0, 1, 2`. 0 reste le niveau de référence (= éléments sans `level` taggué, ex: tous les plans v147 et avant).
3. **Trace au niveau 0** comme d'habitude (routes/zones/points). Pour les **sous-sols (sub-cellars)**, change le niveau actif vers `-1` ou `-2`. Pour les **étages supérieurs**, vers `1` ou `2`.
4. **Pour changer de niveau actif** : clique la pastille → modale Niveaux → sélecteur "Niveau actif" → choisis le numéro voulu (peut être négatif : `[-1]`, `[-2]`). La pastille se met à jour et le filtre passe sur ce niveau (les autres niveaux disparaissent visuellement).
5. **Étendre le range au-delà de [-2, 2]** : 2 boutons d'extension dans la modale Niveaux :
   - `[ + ]` (à droite) → ajoute le prochain niveau supérieur (max+1)
   - `[ − ]` (à gauche) → ajoute le prochain niveau inférieur (min−1)
   Ex: cliquer `[ + ]` étend `[-2, -1, 0, 1, 2]` en `[-2, -1, 0, 1, 2, 3]`. Idem `[ − ]` ajoute `-3`. **Auto-extension** : si tu charges un plan dont les data layers ont déjà des niveaux hors range (ex: ancienne session avec `level: 4`), l'app étend automatiquement `availableLevels` pour que ces éléments soient sélectionnables.
6. **Pour relier deux niveaux** (escalier, pente, puits interne) : groupe 🛣️ Tracés → **🪜 Jonction interniveau** → modale → choisir départ/arrivée (ex: `-1` vers `0`, ou `0` vers `1`, peu importe l'ordre — sémantique symétrique) → OK → clic N points sur la carte → la jonction est tracée en magenta pointillé avec des ronds blanc+magenta aux extrémités. Sans jonction, le pathfinder ne peut pas passer d'un niveau à l'autre.
7. **Filtrer ce que tu vois** : modale Niveaux → section "Niveaux visibles" → cocher/décocher les niveaux. Boutons rapides `Tous` (tout afficher) / `Actif seul` (focaliser).

### L. 🧱 Convertir un plan V1 en V2 tuilé (performance)

> Pour les gros plans (>50 Mo image, >8000 px) qui plantent sur mobile. La conversion V2 découpe l'image en tuiles 512×512 sur 4 niveaux de zoom → runtime charge seulement les tuiles du niveau visible. Cf glossaire `V2 (plan tuilé)`.

1. **Recommandé sur PC** (conversion lourde : décodage image source + drawImage de N tuiles, ~256 Mo RAM pour image 8K). Sur mobile, risque de crash pendant la génération (iOS plafonné à ~500 MB).
2. Ouvrir le 🏗️ Générateur de plan.
3. **Mode Nouveau** : uploader ton image principale + remplir le formulaire → la case 🧱 Convertir en V2 tuile apparaît automatiquement.<br>
   **Mode Modifier existant** : uploader ton ZIP V1 → la case 🧱 est dispo.
4. Cocher **☑️ 🧱 Convertir en V2 tuile (performance)** → modal d'avertissement (CPU/RAM/durée + PC vs mobile) → **J'ai compris — Continuer**.
5. Compléter le reste du formulaire si nécessaire (nom, version, calques, tracking, etc.).
6. Cliquer **📦 Générer le ZIP** → overlay de progression "Niveau z=−N · X / Y tuiles (Z%)" (1-5 min selon image).
7. ZIP téléchargé avec suffixe `_v2`. Le réimporter via le loader → le mode V2 s'active automatiquement (badge violet `V2` sur la carte plan).
8. **Bypass temporaire** : si tu veux comparer V2 vs V1, charge le plan V2 avec **Mode performance : Désactivé** au loader → l'app charge l'image source directement comme V1.
9. **Si la génération échoue** (depuis v152) :
   - **Erreur attrapée** → modale rouge "❌ Échec de génération" qui détaille la cause (drawImage, toBlob, saturation mémoire) + conseils. Lis le message et applique le conseil correspondant (PC, image plus petite, JPEG q85).
   - **Crash silencieux** (navigateur kill la page sans erreur) → au prochain reload de l'app, modale rouge "🧱❌ Génération V2 interrompue" t'avertit. Cause typique : OOM sur mobile (plafond ~500 Mo iOS).

### M. 🌐 Migration vers `myktamap.fr` (depuis v163)

> Mots-clés : "changement de domaine", "nouvelle adresse", "myktamap.fr", "is-underground.fr", "déménagement", "ancienne adresse".

**Contexte** : MyKTAMap change de domaine officiel. La nouvelle adresse `myktamap.fr` remplacera `myktamap.fr` à partir du **15 juillet 2026**.

**Sur l'ancien domaine** (jusqu'au 15 juillet 2026) :
- Modal pédagogique au premier lancement (rappel) + alerte info permanente via le badge 🚨
- L'utilisateur peut continuer à utiliser le site normalement
- Aucune perte de données si l'utilisateur agit avant la coupure

**Que faire pour migrer ses données** (la liste de plans, les sessions et les préférences sont liées au domaine — elles ne suivront PAS automatiquement) :
1. **📚 Exporter la liste de plans** : loader → section "📚 Mes plans" → bouton 💾 → télécharge un fichier `.config` (métadatas + références des plans connus). Réimport via le bouton 📂 au même endroit sur le nouveau domaine.
2. **💾 Exporter ses sessions** via 💾 Sauvegarde session sur chaque plan (Full ou Avancé) → télécharge un `.json` par session (annotations, tracés, zones, points perso en cours)
3. **📦 Garder les ZIPs** des plans importés pour les ré-importer manuellement sur `myktamap.fr` (les blobs locaux stockés en IndexedDB ne sont pas exportables)
4. **Au 15 juillet 2026** : aller sur `myktamap.fr` → importer le `.config` de liste + ré-importer les ZIPs + importer les `.json` de session sur chaque plan correspondant
5. **📱 Si l'app était installée** (PWA sur écran d'accueil) : supprimer l'ancienne icône manuellement + réinstaller depuis `myktamap.fr`

**Important** : la migration des sessions/plans est **manuelle**. Le système ne transfère pas automatiquement les données entre les 2 domaines pour des raisons de sécurité (isolation des origins par les navigateurs — règle web non-contournable).

---

### N. 🚫 Bloquer un itinéraire par zone "Inaccessible" (depuis v169 / Karma_dev)

> Mots-clés : "bloquer itinéraire", "zone interdite", "éviter une zone", "rendre inaccessible", "interdire le passage", "zone bloquante".

**Cas d'usage** : tu veux qu'un calcul d'itinéraire ne passe JAMAIS par une certaine zone (effondrement récent, eau profonde, passage dangereux non balisé, etc.). C'est une contrainte **dure** — jamais relâchée même en cas de fallback.

1. Dans la barre latérale, ouvre le groupe **⬛ Zones**.
2. Clique la sous-action **⛔ Zone inaccessible**.
3. Clique sur la carte pour poser les sommets du polygone (au moins 3).
4. Re-clique sur le 1er point ou appuie sur ✅ Fermer pour clôturer.

La zone apparaît avec un **motif hachures rouge sombre / noir** à 45°. Tout itinéraire calculé qui aurait traversé cette zone passera désormais par un autre chemin. Si aucun autre chemin n'existe, l'itinéraire échoue avec un message "Aucun chemin trouvé".

**Multi-niveau** : la zone bloque uniquement les segments de route du **même niveau** (cohérent avec le filtre niveau). Une zone inaccessible au niveau 0 n'affecte pas l'itinéraire au niveau -1.

**Indépendant de la visibilité** : même si tu décoches le calque zones dans le contrôle des couches, la zone bloque toujours le pathfinder.

---

### O. 🚫 Préférences d'évitement (points / tags) — depuis v169 / Karma_dev

> Mots-clés : "éviter un point", "éviter un tag", "préférences itinéraire", "contournement", "ne pas passer par", "marge d'évitement".

**Cas d'usage** : tu veux que l'itinéraire calculé évite si possible un point spécifique (ex: PA12 que tu sais bloqué temporairement) ou tous les points d'un type donné (ex: tous les `danger`). Contrainte **souple** : si pas d'alternative, l'app calcule quand même en passant par les points évités et te prévient.

1. Ouvre la modale **🗺️ Itinéraire** (groupe 🧭 Tracker → 🗺️ Calculer un itinéraire).
2. Déplie la section **🚫 Préférences d'évitement (optionnel)** en cliquant le titre.
3. **Points à éviter** (3 méthodes au choix) :
   - **Recherche autocomplete** : tape un nom dans le champ et clique le résultat
   - **Saisie par ID** : tape l'ID exact dans le champ texte et clique "+ Ajouter par ID"
   - **Clic carte** (depuis fix audit) : bouton **📍 Cliquer sur la carte** → la modale se réduit en floater orange et chaque clic sur la carte ajoute un point d'évitement. Bouton ✓ Terminer pour revenir à la modale.
   - Les points ajoutés apparaissent en chips orange avec ✕ pour retirer
4. **Tags à éviter** :
   - Clique sur un chip de tag pour le toggler (gris → orange)
   - Tous les points du plan portant ce tag seront évités
5. **Marge (px)** : tout segment de route à moins de cette distance d'un point évité est exclu du graphe (défaut 100px).
6. Ajoute tes waypoints + clique **🎯 Calculer**.

**Résultat du calcul** :
- ✅ Cas idéal : l'itinéraire passe en évitant tout, tu vois juste la distance + temps habituels.
- ⚠️ Cas fallback : un message orange "⚠️ Impossible d'éviter : X, Y" apparaît si l'app a dû passer à proximité de certains points évités (= aucun chemin alternatif possible). L'itinéraire est quand même tracé.
- ❌ Cas erreur : "Aucun chemin trouvé" si même le fallback échoue (réseau de routes disconnect ou zone inaccessible bloque tout).

**Persistance** : tes préférences d'évitement sont sauvegardées en localStorage par plan. Au prochain calcul sur le même plan, elles sont restaurées. Bouton **🗑️ Reset** pour tout effacer.

**Différence dur/souple** :
| Type | Hard/soft | Fallback |
|---|---|---|
| ⛔ Zone inaccessible | Dur | ❌ Jamais relâché |
| 🚫 Point / tag évité | Souple | ✅ Fallback + message si pas d'alternative |

---

### P. 🌍 Exporter en KMZ géolocalisé (Google Earth, OsmAnd, Locus, Avenza) — depuis v170

> Mots-clés : "export KMZ", "Google Earth", "OsmAnd", "Locus", "Avenza", "KML", "géolocalisé", "géoréférencé", "calibrage GPS", "lat lng", "coordonnées GPS", "exporter pour application terrain".

**Cas d'usage** : tu veux ouvrir ton plan + tes annotations (points, tracés, zones) dans une appli de cartographie terrain qui supporte le KML (Google Earth, OsmAnd, Locus, Avenza, ArcGIS Earth…). L'app calcule la transformation rotation+échelle+translation à partir de **2 points** dont tu connais à la fois les coords plan (x, y en pixels) ET les coords GPS réelles (lat, lng en degrés).

1. Ouvre **💾 Export Session** → onglet **🌍 KMZ**.
2. **Calibrage Point A** :
   - Méthode 1 : **🔍 Chercher un point** → tape un nom dans la barre, clique le résultat → x/y plan auto-remplis. Tu n'as plus qu'à renseigner les lat/lng GPS réelles correspondantes.
   - Méthode 2 : **📍 Cliquer carte** → la modale se réduit, clique sur la carte là où tu connais les coords GPS → x/y plan auto-remplis. Renseigne lat/lng GPS.
   - Méthode 3 : Saisie manuelle directe des 4 champs x/y/lat/lng.
3. **Calibrage Point B** : pareil, choisis un point **éloigné** du Point A (idéalement aux extrémités opposées du plan pour maximiser la précision). L'app refuse si `|AB_plan| < 50 px` ou `|AB_gps| < 1 m`.
4. **🌐 Aperçu coins** s'affiche live au fur et à mesure que tu remplis : les 4 coins du plan calculés en (lat, lng), + échelle (mètres/pixel) + rotation (°). Lien **🔗 Voir le centre sur Google Maps** pour vérifier visuellement (vérif connexion internet auto avant ouverture).
5. **📦 Contenu à inclure** (pattern identique à l'Export PNG Avancé) :
   - 🖼️ **Image plan** (GroundOverlay) + slider **Opacité** (0-100%, défaut 60% — permet de voir l'OSM/satellite sous le plan)
   - 📍 **Points** (parent) + sous-cases par tag avec icônes et compteurs
   - 🛣️ **Tracés** (parent) + sous-cases Principaux / Secondaires / Chemins
   - ⬛ **Zones** (parent) + sous-cases Eau / Remblais / Effondrement / Inaccessible
   - 🪜 **Jonctions interniveau** (si plan multi-niveau)
   - 🗺️ **Itinéraire actif** (si calculé)
6. **🏗️ Niveaux à inclure** (si multi-niveau) : chips pour filtrer. Par défaut : tous les niveaux dispo (1 Folder KML par niveau).
7. Clique **Télécharger** → fichier `MyKTAMap_<plan>_<date>.kmz` téléchargé.

**Persistance** : ton calibrage 2 points est sauvegardé en localStorage par plan (clé `myktamap_kmz_calib_<planId>`). Au prochain export du même plan, les 8 champs sont pré-remplis — tu ajustes si besoin et tu re-télécharges.

**Conseils calibrage** :
- Choisis 2 points dont tu es **sûr** des coords GPS (entrée de carrière reconnaissable, plaque IGC visible depuis Google Maps Street View…)
- Plus AB est long sur le plan, meilleure est la précision de la transformation
- 2 points seulement suffisent pour un plan globalement plat et rigide ; sur des plans très étendus ou non-rigides, attends-toi à une légère dérive aux extrémités opposées (math affine simple, pas de correction non-linéaire)

**Compatibilité** :
- ✅ **Google Earth** (web et desktop) : recommandé, support natif gx:LatLonQuad
- ✅ **OsmAnd** (Android, iOS) : supporte KMZ + KML
- ✅ **Locus Map** (Android) : idem
- ✅ **Avenza Maps** (Android, iOS) : idem
- ✅ **ArcGIS Earth, QGIS** : support KML

**Inclusion data layers** : le KMZ inclut **session + embedded**. Si ton plan a des roads/zones/points dans `chemin.json`, `puits.json` etc., ils sortent aussi (contrairement aux exports Full/Avancé/Conversion qui sont session-only par design).

---

### J. ⛑️ Mode urgence — Je suis perdu (estimer une position en cataphilie)

> Mots-clés : "je suis perdu", "mode urgence", "estimer ma position", "perdu dans la cata", "zone de recherche", "où je peux être", "rayon de recherche probable", "secours", "alerte", "localisation approximative".

**Cas d'usage** : tu es sorti(e) sans tracker actif ou il a dérivé, tu sais où tu étais il y a X minutes, et tu veux estimer où tu peux être maintenant. L'app calcule un cercle de probabilité et croise avec les indices visuels que tu observes autour de toi.

1. Sidebar → **🧭 Tracker** → **⛑️ Je suis perdu — Mode urgence** (bouton orange distinctif).
2. La modale s'ouvre. Renseigne :
   - **📍 Dernière position connue** (3 méthodes au choix) :
     - Recherche autocomplete d'un point existant (rapide si tu te souviens d'un nom : "PA1", "salle X").
     - **📍 Clic carte** → la modale se met en retrait, tu cliques sur la carte.
     - **🧭 Position tracker** → utilise la position du tracker si il est actif.
   - **⏱️ Temps écoulé** depuis cette position (slider 1-480 min, défaut 30 min).
   - **🏃 Vitesse de marche présumée** — segmented control 4 presets, **mêmes valeurs que le mode itinéraire** (cohérence UX entre les deux modules). Rayon final = `vitesse × temps`, pas de marge de sécurité. Choix persisté en localStorage (`myktamap_lost_preset`).
     - 🍺 **Bourré** : 2 km/h — très lent, confus, désorienté
     - 🐌 **Lente** : 3 km/h — prudente, étroitures, exploration
     - 🚶 **Normale** *(défaut)* : 5 km/h — allure standard de marche
     - 🏃 **Rapide** : 7 km/h — parcours connu, marche soutenue
   - **Temps écoulé** : slider de 1 à 90 min (1h30 max). Au-delà, la zone devient non pertinente.
   - **🔮 Indices visuels** (optionnel mais TRÈS utile) : texte libre, exemples *"bidon eau, épure bélier, puits cassé"*. L'app cherche ces mots dans le nom, la description et les tags de tous les points du plan.
3. Clique **🎯 Calculer la zone**.
4. Résultats affichés sur la carte :
   - **Cercle orange pulsant** : zone de recherche (rayon = vitesse × temps × incertitude).
   - **Marker vert pulsant 📍** : ta dernière position connue.
   - **Markers violets 🔮 pulsants** : indices qui matchent ET sont dans la zone.
   - **Markers gris ·** : indices qui matchent MAIS sont hors zone (exclus).
   - **Cercle violet intérieur** (si ≥ 1 match in-zone) : localisation probable affinée (barycentre des indices in-zone).
5. Actions disponibles dans les résultats :
   - **📋 Copier le rapport** : copie un texte structuré (plan, position, temps, indices, loc affinée, timestamp) — utile pour partager avec quelqu'un par SMS/radio.
   - **✅ Supprimer la zone et sauvegarder ma position supposée** : retire la zone de recherche ET crée un point éditeur permanent (icône ⚠️ danger) à la localisation probable. Le point devient exportable/convertible comme tout autre point.
   - **🔄 Recalculer** : modifie les paramètres et relance sans repartir de zéro.
   - **🗑️ Effacer la zone et fermer** : retire la zone et les markers de la carte sans sauvegarder de point.
   - **👁️ Fermer** (ou ✕ ou clic backdrop) : ferme juste la modale, garde la zone visible sur la carte pour explorer.

**⚠️ Limitations à connaître** (l'app le rappelle dans le rapport) :
- L'estimation est purement géométrique (cercle isotrope). Elle **ne suit pas le réseau de routes**.
- Le tracker reste **expérimental** et dérive — la position tracker comme "dernière position connue" peut elle-même être imprécise.
- **Cette fonction ne remplace PAS une opération de secours réelle** (fil d'Ariane, boussole, lampe de rechange, carte papier).
- L'app fonctionne en local — aucune communication avec des secours externes n'est faite automatiquement. Le rapport copié est à toi de l'envoyer (SMS, radio cataphile, etc.).

**📚 Bonnes pratiques intégrées dans la modale** — accordion dépliable en haut de la modale ⛑️, 6 sections de conseils pratiques cataphiles. À recommander à l'utilisateur en situation d'urgence :

1. **🧘 Garde ton calme** : Stop. Inspire. La panique fait perdre les repères et gaspille lumière + énergie. Mange/bois un peu si possible.
2. **🗺️ Orientation** : Reviens sur tes pas (plus fiable que de chercher à atteindre une destination). Cherche les axes principaux (roulages, galeries droites, voies ferrées). Utilise une boussole physique (pas celle du téléphone, faussée). Écoute les bruits (circulation, métro, eau).
3. **🔦 Lumière & ressources** : Mode économie immédiatement. Garde une lampe de secours. Hydrate-toi mais économise.
4. **📡 Communication** : Si tu captes du réseau (puits / regards) → préviens quelqu'un en surface AVANT que la batterie meure. Le bouton 📋 Copier le rapport prépare un message tout fait.
5. **📍 Si tu décides d'attendre** : Pose-toi à un endroit identifiable (puits numéroté, salle nommée). Reste où tu es si personne ne sait que tu es là. Marque ton emplacement.
6. **⚠️ À ne pas faire** : Ne suis pas l'eau (diaclases dangereuses). Ne tente pas un passage inconnu juste parce qu'il "monte". Ne te fie pas au tracker téléphone (il dérive sous stress).

### I. Intégrer définitivement ta session dans le ZIP du plan (annotations permanentes)

> Mots-clés associés à cette recette (pour les recherches IA) : "importer la session dans le ZIP", "rendre les annotations permanentes", "session définitive", "figer mes points / tracés / zones dans le plan", "convertir session en data", "intégrer mes annotations au plan", "session → calque de données", "comment importer ma session en définitif", "graver dans le plan".

**Cas d'usage** : tu as ajouté des points, tracés et zones pendant ta session, et tu veux qu'ils fassent **définitivement** partie du ZIP du plan (visibles pour quiconque chargera ce ZIP, sans avoir à importer une session séparée).

**⚠️ Il n'existe PAS de bouton "importer une session dans le ZIP" direct.** Le workflow se fait en 2 étapes :

1. **Convertir** la session en calques de données :
   - Ouvre le groupe **💾 Sauvegarde session** → bouton **💾 Enregistrer la session**.
   - Dans la modale, choisis l'onglet **🔄 Conversion** (3ème onglet, après Full et Avancé).
   - Coche ce que tu veux figer : Points / Tracés / Zones (avec filtrage par tag pour les points).
   - Choisis la **granularité** : Basique (1 fichier par catégorie) ou Fine (1 fichier par type).
   - Télécharge le ou les fichiers `.json` générés (ex : `points.json`, `roads.json`, `zones_eau.json`, etc.).

2. **Intégrer** ces JSON dans le ZIP du plan :
   - Loader → **🏗️ Générer un plan** → **📂 Modifier existant**.
   - Importe le ZIP actuel du plan.
   - Ajoute les fichiers `.json` issus de la conversion comme **calques de données** (data layers).
   - Clique **📦 Générer le ZIP** — le nouveau ZIP contient maintenant tes annotations comme données figées.

**⚠️ Effet de bord** : une fois converties, ces données deviennent **non modifiables depuis l'app** (elles font partie du plan, pas de la session). Pour les modifier, il faudra refaire un cycle Conversion → Modifier existant.

**Différence avec 📥 Importer une session** : cette dernière fonction (groupe ⬇️ Charger / Import) charge un `.json` de session **temporairement** dans la session active — les données restent modifiables et liées à la session, pas au plan. Pour du définitif, il faut la Conversion.

---

# ❓ FAQ — questions et solutions

### Le tracker dérive énormément après quelques pas

Le tracker PDR est **expérimental**. La dérive est inévitable, mais peut être réduite :

- **Calibre l'échelle** dans ⚙️ Réglages → "Calibrer l'échelle" (clique 2 points dont tu connais la distance réelle).
- **Recale ta position régulièrement** : mode 📍 Recalage (clic sur un point connu) ou bouton 📍 Je suis ici depuis le popup d'un point.
- **Tiens le téléphone bien orienté** (écran face à toi, dans le sens de la marche).
- **Évite de remettre le téléphone en poche** pendant le tracking.

### Mon plan crash au chargement / au dézoom

Saturation mémoire — typique des gros plans sur mobile. Solutions par ordre d'impact :

1. **Convertis ton plan en V2 tuilé** (depuis v149, solution la plus efficace) : 🏗️ Générateur → cocher 🧱 Convertir en V2 tuile → 📦 Générer → réimporter le ZIP V2. La conso mémoire passe de "image entière en RAM" à ~16 MB max au runtime. Conversion **lourde**, à faire sur PC plutôt que mobile (cf recette L).
2. **Choisis le preset ⚡ Performance** dans le loader avant de charger.
3. **Active le 🚀 Mode Performance ULTRA** : ouvre ⚙️ Réglages → section "🚀 Mode Performance ULTRA" → coche le toggle **🚀 ULTRA**. Il active 6 optimisations agressives qui ne touchent pas l'image mais réduisent drastiquement la charge des tracés/markers/intersections :
   - 🪜 Décimer les tracés au dézoom
   - ⚡ Désactiver animations zoom/pan (reload requis)
   - 🎯 Désactiver cercles intersections (seuil 50 routes vs 200)
   - 🚫 Désactiver popups sur calques de données
   - 🐢 Auto-save lent (30s)
   - 👁️ Ne rendre que les tracés visibles (viewport culling)
   Tu peux aussi activer ces toggles individuellement si tu veux affiner.
4. Si l'app a déjà crashé, l'OOMGuard affiche une modale d'avertissement au prochain reload.
5. Active 🐛 Logs détaillés (loader → ⚙️ Configuration → 🛠️ Debug, ou ⚙️ Réglages in-app) puis recharge → consulte la modale 🐛 pour voir où ça plante.
6. À terme : optimise le plan (voir recette H ci-dessus).

### C'est quoi les badges V1 / M-LVL / V2 sur les lignes de la liste de plans ?

Indicateurs visuels du **mode** de chaque plan dans le loader (depuis v150) :

- **V1** (gris discret) : plan classique, image entière chargée en RAM au boot. Mode par défaut historique.
- **M-LVL** (jaune) : plan **multi-niveau**, contient des éléments tagués par niveau + le mode est activé (`plan.multiLevel: true`). Carrière multi-étages. Cf glossaire et recette K.
- **V2** (violet) : plan **tuilé V2**, image découpée en tuiles 512×512 sur 4 niveaux de zoom. Conso mémoire massivement réduite au runtime. Cf glossaire et recette L.

Plusieurs badges peuvent coexister sur un même plan (un V2 peut aussi être multi-niveau). Couleur cohérente avec les UI internes : jaune = niveau (pastille `[N]`), violet = V2 (checkbox planner).

### Le tracker ne pointe pas dans la bonne direction sur ma carrière (boussole déraille)

C'est probablement une perturbation magnétique. Les armatures métalliques (rails, ferraille, plaques d'égout) faussent fortement le magnétomètre du téléphone.

1. **Active la boussole de validation** : groupe 🧭 Tracker → sous-action 🧭 Afficher la boussole. Elle affiche une rose des vents en haut-gauche qui tourne pour pointer vers le vrai Nord. Marche dehors / en surface, déraille parfois en sous-sol.
2. **Recale manuellement** le tracker dès que tu reconnais un repère sur le plan : 📍 Mode recalage → clic sur le point reconnu.
3. **Utilise une vraie boussole physique** en parallèle — c'est la recommandation officielle (le tracker est un outil de debug, pas de localisation fiable, cf popup d'avertissement au démarrage).

### J'ai perdu ma session quand j'ai fermé l'app

L'auto-sauvegarde (1.5s) couvre normalement ce cas. Si tu ne la retrouves pas :

- Vérifie que tu rouvres bien le **même plan** (même nom + version exacte).
- La session n'est PAS partagée entre plans différents.
- Si tu as changé de plan entre-temps, la session de l'ancien plan est purgée.
- Pour plus de sécurité long-terme : exporte ta session régulièrement via 💾 Enregistrer la session (fichier .json).

### Le module Itinéraire dit "aucun chemin trouvé"

Le pathfinder a besoin d'un **réseau de routes connectées** :

- Vérifie qu'il y a des tracés (Principal/Secondaire/Chemin) entre tes waypoints.
- Les routes peuvent être dans la session OU dans les calques de données du plan (visibles ou masquées — toutes sont prises en compte).
- L'app connecte automatiquement les routes qui se croisent visuellement (tolérance 15 px). Si rien ne se touche, il faut tracer une route de raccordement.

### J'ai vu une modale rouge au démarrage avec "🚨 ALERTE", c'est quoi ?

C'est le système d'**alertes publiques** de MyKTAMap. L'auteur peut diffuser des messages d'alerte à toute la communauté en cas de situation à risque (incendie en cataphilie, fermeture d'accès, gaz toxiques, etc.) en éditant le fichier `alert.json` côté serveur.

**3 niveaux** :
- **🚨 emergency** : rouge pulsant, situation critique (gaz, incendie, accident)
- **⚠️ warning** : orange, info importante (perturbation, événement)
- **ℹ️ info** : bleu, annonce neutre

Lis attentivement le message + la liste de consignes, puis clique **"J'ai compris"** pour acquitter. La modale ne réapparaîtra plus tant que l'alerte est la même.

Si tu veux re-consulter l'alerte plus tard, clique le bouton **🚨** dans le header du loader (à gauche du 📖). Il te montrera l'état actuel — soit l'alerte rouge si toujours active, soit une modale verte **"✅ Aucune alerte en cours"** si la situation est revenue à la normale.

### C'est quoi le petit badge `v143` (ou similaire) en bas du loader ?

C'est le **badge version** de l'application. Il indique la version actuellement installée chez toi.

**État normal** : gris discret avec bordure subtile. Au clic, affiche une modale compacte avec :
- La version installée (en monospace vert)
- La date de publication
- Les **notes de cette version** (changelog de ce que tu utilises actuellement)

**État "mise à jour disponible"** : le badge devient **bleu et clignote**, et affiche la transition (ex: `v141 → v143`). Au clic, ouvre la modale **🔔 Mise à jour disponible** avec les choix Mise à jour douce / Reset complet.

> 💡 Tu peux cliquer le badge à tout moment pour relancer la modale d'update — pratique si tu avais cliqué "Plus tard" et que tu changes d'avis.

### Je veux vérifier s'il y a encore une alerte active

Clique le bouton **🚨** dans le header du loader (à gauche du 📖 Documentation). Trois réponses possibles :
- Modale rouge "🚨 ALERTE" → alerte toujours active, lis les consignes
- Modale verte "✅ Aucune alerte en cours" → situation revenue à la normale
- Modale "📡 Vérification impossible" → tu es hors ligne, réessaie avec du réseau

### Je suis perdu dans la cata, comment l'app peut m'aider ?

**MyKTAMap propose un mode urgence** ⛑️ qui estime ta position probable à partir de :
- Ta dernière position connue (point sur le plan)
- Le temps écoulé depuis (en minutes)
- Optionnellement : des indices visuels que tu observes ("bidon eau", "épure bélier", etc.)

**Accès** : sidebar → **🧭 Tracker** → **⛑️ Je suis perdu — Mode urgence** (bouton orange).

L'app calcule un cercle de recherche (rayon = vitesse moyenne × temps × facteur d'incertitude) et cherche tes indices dans les points du plan. Les indices qui matchent ET tombent dans le cercle sont mis en évidence en violet pulsant, et leur barycentre te donne une "localisation probable affinée".

**Tu peux copier un rapport texte** structuré (📋) pour le partager avec quelqu'un en surface (SMS, radio).

**⚠️ Important** :
- C'est une estimation géométrique, pas une localisation GPS. Précision ≈ rayon du cercle.
- Ça ne remplace **pas** une opération de secours réelle. Fil d'Ariane, boussole, carte papier et lampe de rechange restent obligatoires.
- Aucune communication automatique avec les secours — c'est à toi d'envoyer le rapport.

Voir la **recette J** dans la section "🍳 Recettes" pour la procédure détaillée.

### Je n'arrive pas à importer ma session définitivement dans le ZIP / Comment rendre mes annotations permanentes ?

**Il n'y a pas de bouton direct** pour importer une session dans le ZIP — c'est volontaire. Le workflow correct est en **2 étapes** :

1. **🔄 Convertir** ta session en data layers :
   - Groupe **💾 Sauvegarde session** → **💾 Enregistrer la session** → onglet **🔄 Conversion** (3ème onglet).
   - Coche Points / Tracés / Zones à figer → télécharge les fichiers `.json` générés.

2. **🏗️ Modifier existant** pour intégrer ces JSON dans le ZIP :
   - Loader → **🏗️ Générer un plan** → **📂 Modifier existant**.
   - Importe ton ZIP actuel → ajoute les `.json` de l'étape 1 comme data layers → **📦 Générer le ZIP**.

**Ne confonds pas** :
- **📥 Importer une session** (groupe ⬇️ Charger / Import) → charge **temporairement** dans la session (modifiable, lié à la session).
- **🔄 Conversion + 🏗️ Modifier existant** → fige **définitivement** dans le ZIP (non modifiable depuis l'app après).

Voir aussi la **recette I** dans la section "🍳 Recettes" pour la procédure détaillée.

### Comment partager un plan avec un ami ?

1. Loader → **🏗️ Générer un plan** → "Modifier existant" → sélectionne ton plan.
2. Si rien à modifier, clique directement **📦 Générer le ZIP**.
3. Envoie le `.zip`.
4. L'ami le charge via la zone drop du loader.

### Comment ajouter un nouveau type d'icône (ex: "fontaine") ?

Via 🏗️ Générer un plan → "Modifier existant" → onglet Icônes → ajoute un tag custom (nom + image PNG 50×50 transparent) → regénère.

### L'app me dit "⚠️ ARRÊT BRUTAL DÉTECTÉ" au démarrage

L'OOMGuard a détecté que la session précédente a été tuée par le système (OOM — out of memory).

- C'est normal sur mobile avec un gros plan.
- Pour éviter la prochaine fois : baisse le preset performance, réduis l'image base, ferme les autres apps.

### L'app me dit "🧱❌ Génération V2 interrompue" au démarrage

Variante spécifique du détecteur de kill OOM (depuis v152), focalisée sur la **génération V2**. Tu avais lancé une conversion V2 (case 🧱 du générateur) et le navigateur a tué la page pendant la conversion — typique sur mobile avec une image source > 8K×8K.

**Solutions** (par ordre d'efficacité) :
1. **Refaire la conversion sur PC** plutôt que mobile (plafond mémoire navigateur 4-8 Go au lieu de ~500 Mo iOS).
2. **Réduire l'image source** (la passer en JPEG qualité 85, dimensions ≤ 8000 px de côté).
3. **Fermer toutes les autres apps** en arrière-plan avant de relancer la conversion sur mobile.

### J'ai eu une modale rouge "❌ Échec de génération" pendant la conversion V2

Depuis v152, la génération V2 attrape toutes les erreurs internes (drawImage, toBlob, saturation mémoire) au lieu de planter silencieusement.

La modale t'indique la **cause exacte** (avec les coordonnées de la tuile qui a échoué : `(z, col, k)`) + des **conseils actionnables**. Lis le message et applique le conseil :
- Erreurs `drawImage` ou `toBlob` → typiquement OOM, baisse la taille de l'image source ou passe sur PC.
- Erreur "saturation mémoire" → idem, plafond du navigateur atteint.

### Je veux utiliser MyKTAMap commercialement (entreprise, prestation payante)

L'usage commercial est **interdit par défaut** (licence CC BY-NC-SA 4.0). Une licence commerciale séparée est nécessaire. Contacte l'auteur via le site officiel pour discuter.

### Je voudrais contribuer au projet (code, traduction, retour terrain)

La collaboration est **ouverte sur demande**. Contacte l'auteur via le site officiel en décrivant ce que tu veux apporter — chaque contribution nécessite un accord écrit préalable (cohérence du projet, respect de la licence).

### Puis-je consulter le code source ?

Le code source n'est **pas distribué publiquement**. Il n'existe pas de dépôt Git ouvert. Pour toute question technique précise, l'auteur reste joignable via le site officiel.

### J. Exporter en PDF imprimable (depuis v1.10.3)

> Mots-clés : "exporter en PDF", "imprimer le plan", "PDF imprimable", "format A0/A1/A2/A3/A4", "PDF portrait paysage", "PDF avec légende", "papier", "impression terrain", "PDF Google Earth", "PDF Avenza", "carte papier", "atlas papier".

**Accès** : ⬆️ **Enregistrer** → 📤 **Exporter en PDF imprimable** (bouton à côté de l'export PNG).

**Modale options** :
1. **📐 Taille** : A0 / A1 / A2 / A3 / A4 (5 radios) — défaut A4
2. **↔️ Orientation** : Portrait / Paysage (2 radios) — défaut Paysage
3. **📦 Annotations de session** : Points / Tracés / Zones / Structures (compteurs live, cases grisées si 0)
4. **🖼️ Image de base & calques** : checkbox Image plan + 1 case par `imageLayers[]` du plan
5. **📊 Calques de données** : 1 case par `dataLayers[]` du plan (puits, vehicules, structure…). Le calque "editor" apparaît marqué `(= calque session)`. Pré-cochage = visibilité actuelle sur la carte.
6. **🎨 Mise en page** : checkbox Header (titre + métadonnées)
7. **🗺️ Légende** :
   - Toggle "Inclure la légende posée sur le plan"
   - Position : ↖ Haut-gauche · ↗ Haut-droite · ↙ Bas-gauche *(défaut)* · ↘ Bas-droite
   - Taille : Compact (icônes 16px) · Standard (22px) · Large (30px)
   - Style : 🆕 **Pro fond blanc** *(défaut, impression papier)* · Sombre opaque · Sombre semi-transp. · Filigrane discret
8. **📏 Qualité** : Standard ×1 *(recommandé A3/A4)* · HD ×2 *(recommandé A0/A1, fichier plus lourd)* · Brouillon ×0.5

**Pipeline interne** : `_genererCanvasPlan(opts)` appelle `window.MyKTAMapExporterGenererCanvas` (réutilise le canvas de l'export PNG avancé) → encode JPEG q88 → `pdf.addImage(...)`. La légende est rendue séparément via `window.MyKTAMapExporterGenererCanvasLegende` puis collée en overlay PNG au coin choisi.

**Filename** : `<plan>_<date>.pdf`

**Crédit footer** (1 ligne discrète en bas à droite) : `Généré par MyKTAMap · CC BY-NC-SA 4.0 · myktamap.fr`

**Limitations connues** :
- jsPDF Helvetica n'a que la couverture Latin-1 — **aucun emoji dans le texte natif PDF**. Les emojis dans la légende OK car la légende est une image canvas raster avant collage.
- A0/A1 + qualité ×2 : 30-60 sec de génération sur mobile (gros canvas).
- Pas de footer dédié (la légende est en overlay sur le plan) — on gagne ~25-40% de zone plan vs un footer fixe.

### M. Undo / Redo global Ctrl+Z / Ctrl+Y (depuis v1.11.0)

> Mots-clés : "annuler", "undo", "Ctrl+Z", "Cmd+Z", "rétablir", "redo", "Ctrl+Y", "annuler ma dernière action", "j'ai supprimé par erreur", "j'ai cliqué par accident", "remettre comme avant", "historique des actions", "annuler le tracé", "annuler le point", "récupérer un point supprimé", "raccourci clavier annuler".

**Accès** :
- **Raccourcis clavier global** (recommandé) :
  - **Ctrl+Z** ou **Cmd+Z** → annuler
  - **Ctrl+Y** ou **Cmd+Y** → rétablir
  - **Ctrl+Shift+Z** ou **Cmd+Shift+Z** → rétablir (convention Mac/Linux)
- **Boutons sidebar** : nouveau groupe **⏪ Historique** avec 2 sous-actions ⏪ Annuler / ⏩ Rétablir, auto-grisées quand la pile est vide

**Ce que l'undo couvre** :
- ✏️ Editor points : ajout, modification (nom/tag/desc/level), suppression dernier, suppression au clic
- 🛣️ Tracés : chaque clic posant un sommet, suppression dernier, suppression au clic, "Tous les tracés"
- ⬛ Zones : idem + fermeture par retour au 1er point
- 🏛️ Structures : idem (piliers polygon + fronts polyline)

**Ce que l'undo NE couvre PAS** :
- ❌ **Photos POI** : leur suppression reste **irréversible** (les blobs sont effacés de IndexedDB locale, pas restaurables). Décision design : restore exigerait un cache RAM des blobs qui explose vite sur photos haute résolution.
- ❌ **Import de session** : un import qui écrase ta session n'est pas Ctrl+Z-able (race conditions). Utiliser SessionPersist (auto-save toutes les 1.5s) pour récupérer si problème.
- ❌ **Tracker** : capteurs temps réel, pas une mutation persistante
- ❌ **Mesure** : outil éphémère, pas dans le périmètre "session"

**Caractéristiques** :
- **Limite** : 50 actions max (FIFO — au-delà, les plus anciennes sont oubliées)
- **Granularité** : action atomique (1 clic = 1 annulable, pas un groupe)
- **Persistance** : RAM only (perdu au reload). Cohérent avec philosophie "session active = par session de travail".
- **Reset auto au plan switch** : changer de plan vide l'historique (pas d'undo cross-plan)
- **Toast feedback** : `↩ Annulé : Pose du point PA1` ou `↪ Refait : Suppression de Zone Eau #2` (via `OOMGuard.showToast`)
- **Save SessionPersist forcé** après chaque undo/redo (pas perdu si reload juste après)

**Anti-vol focus clavier** : Ctrl+Z est intercepté UNIQUEMENT si l'utilisateur n'est pas en train de taper dans un INPUT/TEXTAREA/contenteditable. Ça permet de garder l'undo natif du navigateur fonctionnel dans les champs texte.

**API publique** (pour les futurs modules à instrumenter) :
- `window.HistoryManager.captureState()` → renvoie `{editorPoints, roads, zones, structures}` deep clone
- `window.HistoryManager.record(label, beforeState)` → push une entrée
- `window.HistoryManager.recordAction(label, mutationFn)` → helper combinant capture + run + record
- `window.HistoryManager.undo()` / `redo()` / `canUndo()` / `canRedo()` / `reset()` / `onChange(cb)`

**Conseil à donner à l'utilisateur** :
- "Je viens de supprimer un point par erreur" → Ctrl+Z immédiatement
- "Je veux récupérer la session précédente" → ⚠️ Ctrl+Z ne suffit PAS si tu as reload la page entre temps. Utiliser SessionPersist (toast bleu au boot proposant de restaurer).
- "Je veux annuler une suppression de photo" → ⚠️ **impossible**, c'est irréversible. Re-importer le ZIP du plan si tu as une sauvegarde.

### L. Mode urgence "panique" 🚨 — différent de ⛑️ "Je suis perdu" (depuis v1.10.1)

> Mots-clés : "mode panique", "je panique", "affichage XL", "position en grand", "mode urgence rapide", "boussole géante", "panic mode", "mode 911", "info vitale en gros", "écran lisible loin", "minimap urgence", "differencier mode urgence", "🚨 vs ⛑️".

**⚠️ Distinction importante** : il existe **deux modes urgence distincts** dans MyKTAMap, ne pas les confondre :

| | ⛑️ Je suis perdu | 🚨 Mode panique |
|---|---|---|
| Hypothèse | Tu **NE SAIS PAS** où tu es | Tu **SAIS** où tu es (le tracker l'affiche) |
| Objectif | Estimer une zone probable | Lire vite des infos vitales en gros |
| Calcul | Cercle = vitesse × temps, intersection avec indices visuels | Aucun calcul — affichage XL en temps réel |
| Sortie utile | Zone orange + indices violets + rapport texte copiable | Coords XL + cap boussole géant + minimap focus |
| Quand l'utiliser | "Je n'ai plus aucun repère depuis 30 min" | "Je panique à un croisement, j'ai besoin de me re-orienter vite" |
| Module source | `js/lostMode.js` | `js/emergencyMode.js` (v1.10.1) |

**Accès 🚨 panique** : sidebar → **🧭 Tracker** → bouton rouge **🚨** (à côté du ⛑️ orange).

**Ce que le mode affiche** :
- 📍 **Position XL** : coordonnées plan en énormes caractères (lisible à 1 m du téléphone — situation où tu ne veux pas plisser les yeux ni approcher)
- 🧭 **Boussole géante avec aiguille tournée** : sens de marche basé sur le magnétomètre + accéléromètre. Mise à jour live via les capteurs d'orientation du téléphone (DeviceOrientationEvent).
- 🗺️ **Minimap auto-focus** centrée en permanence sur le tracker (~20-50 m d'horizon à zoom 5). Affiche les **roads + zones + structures du plan en arrière-plan** pour repérer chemins/sorties/dangers à proximité immédiate.
- 🌗 **Thèmes** : sombre par défaut, basculement clair possible (à choisir selon la luminosité extérieure).
- 🔋 **Wake Lock** activé : l'écran ne s'éteint pas tant que le mode est actif.

**Permissions** : `DeviceOrientationEvent.requestPermission()` (iOS) déclenché au 1er Play du mode si pas déjà accordé. Sans permission, la boussole reste figée mais la position XL + la minimap continuent de marcher (le tracker est indépendant des capteurs d'orientation).

**Wake Lock** : `navigator.wakeLock.request("screen")` posé à l'ouverture du mode, relâché à la fermeture (✕).

**Quand recommander chacun** :
- L'utilisateur dit "je suis perdu", "je ne sais plus où je suis", "je veux estimer ma zone" → ⛑️ Je suis perdu
- L'utilisateur dit "je panique", "j'ai besoin d'infos vite en gros", "je dois lire ma position pour la transmettre", "je veux me re-orienter au plus vite" → 🚨 Mode panique
- L'utilisateur peut aussi enchaîner les deux : utiliser le ⛑️ pour estimer une zone, puis le 🚨 pour avancer dans la zone en gardant un œil sur le cap

**Limitations** :
- Le 🚨 suppose que le tracker est actif et donne une position fiable. Sur un plan où le tracker n'est pas démarré, le mode panique reste utilisable mais la "position XL" reste vide / désactivée.
- Comme tout l'app : aucune transmission automatique vers les secours. Pour communiquer, tu lis tes coords XL et tu les envoies par SMS/radio toi-même.
- La boussole utilise le magnétomètre, **faussée à proximité de structures métalliques** (béton armé, voies ferrées). Vérifier la cohérence en pivotant le téléphone sur place avant de se fier au cap.

### K. Recherche unifiée — 4 catégories + Ctrl+K (depuis v1.10.3)

> Mots-clés : "rechercher un tracé", "rechercher une zone", "rechercher une structure", "rechercher un pilier", "recherche rapide", "command palette", "Ctrl+K", "Cmd+K", "raccourci recherche", "raccourci clavier recherche", "barre de recherche", "filtre par catégorie".

**Avant v1.10.3** : la recherche ne couvrait que les **points** (data layers + session).

**Depuis v1.10.3** : la recherche couvre **4 catégories** :
- 📍 **Points** : data layers + session (comportement préservé)
- 🛣️ **Tracés** : session + embedded (auto-label "Tracé Principal #3" si pas de label)
- ⬛ **Zones** : session + embedded (auto-label "Zone Eau #1")
- 🏛️ **Structures** : session + embedded (auto-label "Pilier 1ère masse #2")

**Accès** :
- Bouton **🔍** dans la barre latérale droite (comme avant)
- 🆕 **Raccourci clavier Ctrl+K** (`Cmd+K` sur Mac) — depuis n'importe où dans l'app. Toggle : ferme la modale si elle est déjà ouverte.
- Anti-vol de focus : Ctrl+K ne se déclenche pas si l'user est en train de taper dans un input/textarea (sauf si la modale recherche est déjà ouverte → on autorise le close).

**UX modale** :
- Champ search en haut, focus auto à l'ouverture
- Sous le champ : filtres chips en 3 lignes (selon disponibilité du contenu) :
  - **🆕 Catégorie** : 4 chips `📍 Points (N) · 🛣️ Tracés (M) · ⬛ Zones (K) · 🏛️ Structures (L)` avec compteur live. Affiché uniquement si ≥ 2 catégories ont du contenu.
  - **Calques** (points-only) : chip par data layer
  - **Tags** (points-only) : chip par tag
- Résultats **groupés par catégorie** avec headers `📍 POINTS (12)`, `🛣️ TRACÉS (3)`, etc.
- Cases grisées si compteur = 0

**Au clic d'un résultat** :
- **Point** → centre + popup marker + cercle jaune 3 sec *(inchangé v1.7.x)*
- **Tracé / front de taille** → centre sur centroïde + polyline jaune dashed 4 sec + popup info
- **Zone / pilier / mur** → centre + polygon jaune transparent 4 sec + popup info
- Popup info : label + type FR (`Principal`, `Pilier 1ère masse`...) + niveau M-LVL si actif + nb points + layer d'origine

**Champs cherchés** :
- Points : nom + id + tags + description + état
- Roads/Zones/Structures : label + type + label FR du type + niveau

**Limitations connues** :
- Le filtre "Calque" et "Tag" ne s'applique QUE aux points (les tracés/zones/structures n'ont pas de structure équivalente).
- API publique `SearchPoints.getAllPoints()` et `findByQuery()` continuent de retourner du format point-only (pour préserver Pathfinder + Itinéraire). Le format unifié 4-cat est strictement interne au module.

---

**Fin du document.** Les questions au-delà de ce périmètre ne sont pas couvertes — l'assistant IA doit explicitement le signaler plutôt que d'inventer.
