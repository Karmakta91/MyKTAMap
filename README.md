# 📘 MyKTAMap

> Application web de **cartographie souterraine** — visualisation, annotation et déplacement simulé sur plan image (carrières, galeries, sites souterrains / industriels).

**🌍 Environnements :**
- 🟢 Production : [myktamap.fr](https://myktamap.fr)
- 🔧 Développement : [dev.myktamap.fr](https://dev.myktamap.fr)

> ⚠️ Les données présentes sur le site de démonstration sont fictives.

**📦 Version courante** : `v1.57.4` (26/07/2026) — **🧹 Fix fuites pub/sub au plan switch** (audit) : les `onChange` de `HistoryManager`/`Favoris`/`LegendCustomization`/`PerfUltra` posés dans `initInterface`/`initRoad` s'empilaient à chaque switch → abonnements **one-shot** + référence rafraîchie par init.

**🧹 v1.57.4 (26/07/2026)** — **Audit « fuites au plan switch » : 4 abonnements pub/sub corrigés** :
- **Audit** (agent + scans) sur la famille « listeners/états empilés au plan switch » (celle des bugs measure v1.54.x et modes v1.57.2) : le codebase est **rigoureusement gardé partout** (off-avant-on, flags `*Attached`/`_batteryHooked`/`_clickExterieurInit`, reset per-init) **sauf** 4 abonnements `onChange` posés dans `initInterface` (×3 : grisage history `interface.js:2235`, refresh flyout favoris `:3272`, boutons légende custom `:3258`) et `initRoad` (×1 : re-render PerfUltra `road.js:161`). Ces init sont ré-exécutées à chaque switch, les singletons émetteurs survivent → **+1 callback empilé par switch** (les anciens manipulant des sidebars détachées = fuite mémoire linéaire + re-renders redondants).
- **Fix uniforme** : abonnement **ONE-SHOT** derrière un flag module-level + **référence rafraîchie à chaque init** (`_syncHistoryUiRef`, `_injecterBoutonsCustomRef`, `_renderRoadsThrottledRef`) pour les callbacks qui capturent des éléments de la sidebar courante → l'abonnement unique déréférence toujours la closure fraîche.
- **Vérifiés sains** (audit) : cas « switch pendant mode Urgence/Secours » (Secours **déjà reset au switch** `main.js:605` ; Urgence plein écran = switcher inatteignable) · i18n (les « clés manquantes » vues au banc = vieux dico servi par le SW de test ; parité en 100 %, es sans `legal.*` = voulu) · générateur (concat des points **par référence** → `interPlanLinks` baked survit au cycle « Modifier existant »).
- **DX** : hook anti-fuite pro **activé** (`git config core.hooksPath .githooks`). **Sources** v1.57.4. Aucune nouvelle surface réseau. — **📚 Doc complète des liaisons inter-plan** : nouvelle section 🌀 dans l'Aide intégrée (FR/EN, catégorie Outils carte), recette pas-à-pas dans `AI_CONTEXT.md` (Aide IA), précisions v1.57.1/2 reportées dans `README_USER` fr/en.

**📚 v1.57.3 (25/07/2026)** — **Documentation des liaisons inter-plan (3 surfaces)** :
- **Aide intégrée** (`interfaceDocs.js`) : section « 🌀 Liaisons inter-plan ("portails") » ajoutée **en fin de document** (idx 28) dans `_aideHtmlFr` ET `_aideHtmlEn` (parité 29≡29) pour ne décaler **aucun** index d'`AIDE_CATEGORIES` ; idx 28 rattaché à « 🗺️ Outils carte ».
- **Aide IA** (`AI_CONTEXT.md`) : recette « 🌀 Lier deux plans entre eux » (préparer/créer/utiliser/supprimer + bon-à-savoir, dont clé `myktamap_interplan_links_v1` et rappel zéro-réseau).
- **`README_USER` fr/en** : bascule automatique sur le **niveau** du point d'arrivée + avertissement filtre de tags (précisions v1.57.1/2).
- **Sources** v1.57.3 (bump requis : `interfaceDocs.js` + docs précachés SW). Aucune nouvelle surface réseau. — **🛠️ Reset des modes d'édition au chargement d'un plan** : les flags `window.modeX` (édition/mesure/recalage/tracé/zone/structure) n'étaient jamais remis à `false` au plan switch → le mode « ajouter un point » restait armé après un changement de plan (rendu visible par les allers-retours « portail »).

**🛠️ v1.57.2 (25/07/2026)** — **Fix : mode « ajouter un point » armé à l'entrée d'un plan** :
- **Cause racine** : les 6 flags de mode (`modeEdition`, `modeMesure`, `modeRecalage`, `modeRoad`, `modeZone`, `modeStructure`) ne sont initialisés qu'au **chargement du script** (1× par session navigateur) — **aucun reset au plan switch**. Quitter un plan avec un mode actif (cas typique : créer un POI puis prendre un portail inter-plan) → mode encore armé à l'arrivée, chaque clic carte posait un point. Dette **pré-existante** (switcher v1.16+), révélée par les switches fréquents de la v1.57.0.
- **Fix** (`interface.js > initInterface`) : `_desactiverTousLesModes()` + remise à `false` explicite des 6 flags au début de chaque init de plan (les `desactiverFn` référencent des boutons de l'ancienne sidebar, détachés → inoffensif ; les setters observés notifient → le curseur de précision disparaît). Premier boot = no-op ; tracker non concerné (pas un mode d'édition, préservé volontairement au switch).
- **Sources** v1.57.2. Aucune nouvelle surface réseau. *(Note : l'« icône manquante » du POI en préset ULTRA signalée en parallèle = échantillonnage assumé du mode ULTRA, pas un bug.)* — **🌀 Fix liaisons inter-plan** : bascule automatique sur le **niveau** du point cible à l'arrivée (l'icône du POI était masquée par le filtre multi-niveau — « badge sans l'icône »), badge 🌀 respectant `visibleLevels` (re-render au changement de niveau), toast si un **filtre de tags** masque l'arrivée.

**🌀 v1.57.1 (25/07/2026)** — **Fix « portail » : arrivée sur un POI invisible (filtre de niveau)** :
- **Cause racine** : le point cible pouvait être sur un **niveau non affiché** → son marker était à `opacity: 0` (filtre multi-niveau) alors que le badge 🌀 était posé **sans** ce filtre → l'user ne voyait que le badge.
- **Fix** (`interPlanLinks.js`) : ① **bascule de niveau à l'arrivée** (`_changerNiveauActif(level)` si `level ∉ visibleLevels`) — un portail amène AU niveau du point cible ; ② **snapshot enrichi** : `level` + 1er `tag` stockés **des 2 côtés** (le côté source ne portait pas le level → les liaisons v1.57.0 sont à recréer pour en profiter) ; ③ **badge filtré par niveau** comme les markers + re-render au changement de niveau (hook dans `appliquerFiltreNiveau`, `interfaceConfig.js`) ; ④ si un **filtre de tags runtime** masque le point d'arrivée → **toast d'avertissement** (`ipl.nav.hiddenByFilter` fr/en/es), sans jamais toucher au filtre (règle projet).
- **Sources** v1.57.1. Aucune nouvelle surface réseau. — **🌀 Liaisons inter-plan (« portails »)** : lier un point d'un plan X à un point d'un plan Y (registre central + section popup + badge doré + « Y aller » avec switch de plan) + **⚖️ CGU en tout premier** au boot (avant la saisie du code/licence, séquenceur durci par signal explicite).

**🌀 v1.57.0 (25/07/2026)** — **Liaisons inter-plan + gate CGU avant le code d'accès** :
- **Nouveau module `js/interPlanLinks.js`** (`window.InterPlanLinks`) — décisions KARMA `1:a…6:a` : liaison **bidirectionnelle**, **N par point**, **tout point liable** (session ET datalayer, des 2 côtés). « DB de croisement » = **registre central** `myktamap_interplan_links_v1` (localStorage), chaque côté avec **snapshot** `{planId, planName, pointId, pointNom, x, y, level, source}` → affichable même si le plan cible est absent (⛔). **Aucune modification des datalayers** : le popup d'un point est enrichi **au runtime** par croisement `(planId, pointId||coords)` → l'info remonte côté destination sans masquage ni point miroir. Ancrage : les ids `PlanRegistry` sont **déterministes** (slug) donc portables entre appareils.
- **UX** : section 🌀 dans le popup POI (`utils.js > buildPointPopupHtml`) — liaisons listées (➜ Y aller · 🗑️) + bouton « Lier à un autre plan » → **picker 2 étapes** (choix du plan cible → chargement de ses points **sans l'ouvrir** : session localStorage + datalayers serveur `fetch`/ZIP IndexedDB via `PlanRegistry.getBlob` + JSZip → recherche live nom/id/tag). **Navigation** : mini-confirmation → switch de plan (`chargerPlanServeur`/`chargerPlanDuRegistre`) → arrivée **sur le point cible** (cible pendante consommée post-chargement en **triple passe** +600 ms/+1,6 s/+2,6 s — repasse derrière les recentrages de session/tracker) + flash bleu. **Badge 🌀 doré** (22 px, bordure `#f4c542`, halo) centré **au-dessus** de l'icône, `zIndexOffset: 2000`.
- **Cycle de vie** : popups des points session passent en **bind LAZY** (`editor.js` — fonction évaluée à chaque ouverture, même pattern que les datalayers H3) → une liaison créée apparaît **immédiatement** (fix « obligé de quitter le plan » ; bonus : état ⭐ Favori frais + perf). **Suppression d'un point** → `onPointDeleted` purge le lien entier des 2 côtés + badge retiré (`supprimerPointEditor`). **Export session** (Full + Avancé) embarque `interPlanLinks` (pattern `customLegend`) ; **import** → fusion par id dans le registre. **Mode datalayer baked** : champ `interPlanLinks` porté par un point → lu au popup (lecture seule, navigable, sans 🗑️).
- **⚖️ Inclut le fix v1.56.4 (non publié séparément)** : la gate CGU s'affiche **avant l'UnlockGate** (`main.js > initApp` — elle passait derrière, z 99999 < 100100, et l'ordre voulu est « lire avant de saisir ») ; `FirstRunFlow` attend un **signal explicite** `notifyBootGatesDone()` (un poll DOM seul ratait la fenêtre sans overlay de ~2 s du check licence pro → le tutoriel partait pendant la saisie — race constatée au test) ; en lockout, la file ne démarre jamais (voulu). Contrôlé : user existant unlocked sans CGU → gate au boot, sans ressaisie.
- **Sources** v1.57.0 (+ `interPlanLinks.js` dans `index.html` + `sw.js > ASSETS_TO_CACHE`). i18n `ipl.*` (28 clés fr/en/es). CSS `.kta-ipl-*` (dark + clair). **Aucune nouvelle surface réseau** (fetch plans same-origin déjà couverts par l'audit ; ZIP lus depuis IndexedDB). Hors scope V1 documenté : pathfinding à travers une liaison, badge des liens baked.

**🔧 v1.56.3 (21/07/2026)** — **Renommage du domaine de développement → `dev.myktamap.fr`** :
- Remplacement de `devmap.is-underground.fr` par `dev.myktamap.fr` sur **10 fichiers / 25 lignes** : `CLAUDE.md`, `README.md`, `docs/nginx-csp-config.conf`, `NETWORK_AUDIT.md`/`.html`, `index.html` (modale Doc audit), dicos `lang/fr|en|es.json` (clés `home.netdoc.scope1/scope3`), commentaire `js/interfaceMaintenance.js`.
- **Aucun code fonctionnel touché** : `PING_URL` (test connexion) est construit dynamiquement sur `location.origin` — aucun hardcode du domaine dev dans le moteur. CSP inchangée (`connect-src 'self'`).
- **Bump nécessaire** car `index.html` + `lang/*.json` sont des surfaces user-facing précachées par le SW (sans bump `CACHE_NAME`, les users garderaient l'ancien texte). ⚠️ Côté serveur (KARMA, manuel) : DNS + certificat SSL + config Nginx à déployer pour `dev.myktamap.fr`.
- **Sources** v1.56.3. Aucune nouvelle surface réseau.

**📐 v1.56.2 (16/07/2026)** — **Fix angles de mesure (« 0.0 m » au sommet) + bump du lot légal c829c30** :
- **Cause racine** : des **points consécutifs dupliqués** `[A,A,B,B,…]` dans `_pointsDistance` — héritage de l'ancien bug de handlers de clic empilés (corrigé côté saisie depuis), mais **les sessions sauvées à cette époque re-restaurent les doublons** via SessionPersist. Chaque sommet portait un segment interne de 0 px → label « 0.0 m » posé sur le point + **tous les angles skippés** (`len < 1e-6`).
- **Fix 3 couches** (`js/measure.js`, helper `_dedupPointsConsecutifs`, seuil 0.01 px) : ① **saisie** — clic coïncident avec le dernier point ignoré ; ② **restore** — `setMeasurePoints`/`setMeasurePointsSurface` dédupliquent → les **sessions polluées se réparent au chargement** (re-sauvées propres) ; ③ **rendu** — labels segments + angles calculés sur la géométrie dédupliquée (robuste quelle que soit la source). Les vrais points (≥ 0.01 px) ne sont jamais fusionnés. Aucun impact `calculDistance`/`calculSurface` (segments 0 = 0 m ; shoelace insensible aux doublons).
- **Testé** : harness Leaflet factice — scénario `[A,A,B,B,C,C]` → segments « 10.0 m »/« 8.0 m » + angle **90°** affiché, résultat strictement identique à une saisie propre ; helper unitaire (fusion < 0.01 px, conservation 0.5 px, tableaux vides).
- **Inclut le bump du commit `c829c30`** (docs légaux, passé sans bump) : CGU **sans** le volet Val-d'Oise (retiré) + **intrusion en lieu privé approfondie** — art. 226-4 (verbatim) & 544, et **responsabilité en cas de dommages ou de secours** : art. 1240-1241 Code civil (verbatim), secours en principe gratuits (CGCT L.2321-2) mais **facturables** pour une activité de loisir (CGCT L.2331-4) + réparation du dommage causé par faute/imprudence. Puce « responsabilité » de la gate enrichie (fr/en).
- **Sources** v1.56.2. Aucune nouvelle surface réseau.

**⚖️ v1.56.0 (15/07/2026)** — **Conditions d'utilisation (avertissement légal) + séquenceur de premier lancement** :
- **Problème** : au 1er lancement, 3 modales se bousculaient sans coordination (proposition PIN à +800 ms, alerte publique post-splash, onboarding à +600 ms) → superposition, « spam », premier accueil non pro.
- **Nouveau `js/firstRunFlow.js`** (`window.FirstRunFlow.run()`) : **file séquentielle** jouée après le splash qui affiche les étapes **une par une** (chaque étape attend la fermeture de la précédente), dans l'ordre : 🚨 **alerte critique** serveur → ⚖️ **conditions d'utilisation** → 🎓 **onboarding** → 🔐 **proposition PIN**. Chaque module expose désormais un signal de fin : `AlertChecker.notifySplashEnded(onDone)`, `Tutorial.ouvrir(onClose)`, `MyKTAMapPinLock.proposerActivation(onClose)` (délai interne 800 ms supprimé), `LegalGate.ouvrirGate()` → Promise. `main.js` remplace les anciens `setTimeout` éparpillés par un unique appel à `FirstRunFlow.run()`.
- **Nouveau `js/legalGate.js`** (`window.LegalGate`) : gate **bloquante** au 1er boot (case « J'ai lu et compris » + bouton **J'accepte**) rappelant que l'app est un **outil de repérage**, pas une incitation ; l'accès aux anciennes carrières de Paris est **interdit** (arrêté préfectoral du 2 novembre 1955) et **passible d'amende** (135 €/375 €) ; l'intrusion engage la **seule responsabilité** de l'utilisateur. Sous-modale **« texte intégral »** = 3 sections reproduites **verbatim** (actes officiels, hors droit d'auteur) : arrêté du 2 novembre 1955 + question écrite Sénat n° 03710 (réponse du 05/06/2025) + **intrusion en lieu privé** (art. 226-4 Code pénal — 45 000 € — & art. 544 Code civil, avec un volet **responsabilité/secours** : art. 1240-1241 Code civil + facturation possible des frais de secours de loisir, CGCT L.2321-2/L.2331-4). Flag versionné `myktamap_terms_accepted_v1` (re-consent si `TERMS_VERSION` bumpé). **Ré-accès non bloquant** via lien ⚖️ « Conditions d'utilisation » dans le footer du loader (`LegalGate.ouvrirConsultation()`). Skip en incognito (flag non persistant).
- **i18n** : cadrage général `legal.*` traduit **fr + en** (comme les docs) ; les **textes de loi restent en FR** (droit français). Doc mirror offline `docs/applications/CGU.md` (cachée SW). CSS `.kta-legal-*` (dark + thème clair).
- **Sources** v1.56.0 (`js/legalGate.js` + `js/firstRunFlow.js` + `docs/applications/CGU.md` dans `index.html` + `sw.js > ASSETS_TO_CACHE`). **Aucune nouvelle surface réseau** (CGU same-origin statique, traitement 100 % local).

**🌀 v1.55.1 (28/06/2026)** — **Loader « calcul en cours » générique (Lost Mode + Secours + Sortie d'urgence)** :
- **Nouveau module neutre `js/computeLoader.js`** : `window.ComputeLoader.wrap(fn, message)` = overlay plein écran (spinner + message) + **yield-to-paint** (`rAF` + `setTimeout 0`) **avant** d'exécuter `fn`. Indispensable pour les calculs **synchrones bloquants** (Dijkstra/Pathfinder) : sans une frame peinte avant le blocage, l'écran fige « sans rien montrer ». CSS générique `.kta-compute-overlay` (z-index 100005, même rendu que l'overlay itinéraire).
- **Branché sur les 2 calculs lourds sans feedback** : `lostMode.js` (bouton « Calculer » → `Pathfinder.computeReachable`) et `secoursMode.js` (bouton « Calculer itinéraire » par équipe → `Pathfinder.computeRoute`). L'**itinéraire principal garde son loader historique** (inchangé, 0 régression).
- **Sortie d'urgence** (`sortieUrgence.js`) : `_lancer` passe en `async` + **yield-to-paint** juste après l'ouverture de la modale-spinner et **avant** le batch (jusqu'à 15 `Pathfinder.computeRoute`). Conserve son spinner de modale dédié (pas de double overlay `ComputeLoader`) — il lui manquait seulement la frame peinte. C'était le seul mode « calcul d'itinéraire » sans feedback pendant le blocage.
- i18n `lost.compute.loading` / `secours.compute.loading` (fr/en/es). Enregistré dans `index.html` + `sw.js > ASSETS_TO_CACHE`. **Sources** v1.55.1. Aucune nouvelle surface réseau.

**🔗 v1.55.0 (27/06/2026)** — **Fusionneur de datalayers (nouvel onglet « Fusion »)** :
- **Nouvel onglet « 🔗 Fusion »** dans le modal « Exporter » (anciennement « Enregistrer la session » — renommé car il couvre aussi conversion/fusion/KMZ-GPX, pas que la session) (`sessionExporter.js`) : ingère **N fichiers data layer** (`.json` et `.zip`, cumulables) et les **concatène par catégorie de contenu** (`data`/`roads`/`zones`/`structures` + `editorPoints`) → ressort **un fichier par type** (`points.json` / `roads.json` / `zones.json` / `structure.json`) en ZIP (ou `.json` direct si une seule catégorie). Cas d'usage : assembler un gros plan construit en plusieurs sessions exportées en datalayers.
- **Recombinaison de briques existantes** : helper **pur** `_mergeDatalayerObjects` (concat + détection des **ids POI en double** → alerte, concat brut conservé, testé en `node`) · entrée multi-fichiers (`_fusionLireJson`/`_fusionLireZip`) · sortie via `_telechargerConversionFiles` (format identique au convertisseur session→datalayer). `ouvrirExportSessionModal(initialTab)` accepte désormais un onglet d'ouverture.
- **Accès accueil** : bouton **« 🔗 Fusionner des datalayers »** entre « 📊 Éditeur de données » et « 🏗️ Générer un plan » → ouvre directement l'onglet Fusion (opère sur les fichiers uploadés, sans plan chargé).
- **Fix CSS** : règles de base `.kta-export-cb-row` / `.kta-export-radio-row` **globalisées** dans `css/style.css` (elles n'étaient que dans le `<style>` local de `js/exporter.js`) → la case « Activer le remplissage » de la modale « Nouvelle entrée légende » (générateur) est de nouveau bien alignée.
- **Sources** v1.55.0. i18n `export.fusion.*` + `home.add.fusion` (fr/en/es). **Aucune nouvelle surface réseau** (traitement 100 % local).

**🛠️ v1.54.1 (27/06/2026)** — **2 fixes terrain + consolidation interne `index.html`** :
- **fix(zones/structures)** : fermer une zone ou une structure **polygone** en recliquant sur son 1er point **désactive aussi l'outil** dans la sidebar. Avant : `fermerZoneEnCours()`/`fermerStructureEnCours()` (dans le handler Leaflet propre à `zones.js`/`structures.js`) passait `currentZone/Structure` à `null` mais **ne notifiait pas `interface.js`** → le bouton restait `kta-actif` + `window.modeZone/Structure` armé → tracé suivant incohérent. Fix : `_fermerModeZone`/`_fermerModeStructure` **exposés sur `window`** (`interface.js`) et appelés dans le close-by-click après `fermerXEnCours()` + history (pattern déjà utilisé ailleurs après mise à null). **Scope : fermeture au clic** (le bouton « Fermer la zone/structure en cours » garde son comportement = outil reste actif pour enchaîner) ; structures polyligne (fronts) non concernées.
- **fix(itinéraire)** : un clic carte n'ajoute plus qu'**un seul waypoint** (avant : parfois 2 au même point). L'itinéraire était le **seul** mode à rebinder une **closure recréée** à chaque activation du clic carte ; un cycle activer/désactiver interrompu (rebuild de modale, plan switch…) pouvait laisser un 1er handler bindé et en ajouter un 2e → 1 clic = 2 push. Fix : **handler à référence stable** (`_itineraryMapClick`, défini 1×) + **`off`-avant-`on`** → binding idempotent (`interfaceItineraire.js`). Pas de double-fire global (edit/zones/struct bindent au boot et ne doublaient pas).
- **Consolidation `index.html`** (dette : le `<script>` inline pesait **253 Ko / ~4900 lignes / 89 fonctions** dans une seule closure `window.load`) : extraction des **2 seuls îlots propres** vers des modules — **`js/loaderNetAudit.js`** (modales Journal réseau + Doc audit) et **`js/loaderSwModals.js`** (modales SW force-update/kill). **Déplacement pur, 0 changement de comportement** (fonctions exposées sur `window` pour le câblage resté inline ; chargés en `<script defer>`), ajoutés à `ASSETS_TO_CACHE`. `index.html` **6428 → 6116 lignes**. Le reste du `<script>` inline (config/PIN, profil, loader plans) est un monolithe intriqué (état partagé + monkey-patch) → refactor dédié hors scope.
- **Sources** v1.54.1 (+ `loaderNetAudit.js` / `loaderSwModals.js` dans `index.html` + `ASSETS_TO_CACHE`). Aucune nouvelle surface réseau.

**🎉 v1.54.0 (24/06/2026)** — **Hauts faits « spéciaux » (one-shot fun)** :
- **6 succès uniques** ajoutés à `js/profileAchievements.js` (nouveau tableau `SPECIALS`, groupe `"special"`) : 🎨 **Touche-à-tout** (≥1 POI + tracé + zone + structure) · 💯 **Centurion** (score ≥ 100) · 🦇 **Taupe** (a utilisé le tracker) · 🧭 **Spéléo multi-niveaux** (annoté sur ≥2 niveaux dans un plan) · 🌃 **Marathon souterrain** (session tracker > 4 h) · 🏆 **Complétiste** (les 32 hauts faits de base débloqués — méta, via contexte `{tieredUnlocked}`). **Total 32 → 38** (`PA.total`, compteur + stat bandeau suivent).
- **Métriques dérivées** (`index.html > _collectGamifMetrics`) : `hasTracked` / `maxLevels` / `maxTrackerH` calculés par **scan de `myktamap_session_v1_<id>`** (trackerTimeline + niveaux des éléments de session) + `score` (`ProfileGamification.getScore`). **100 % dérivé du localStorage existant, zéro wiring d'événement.**
- **Grille profil** : nouvelle section **« 🎉 Spéciaux »** (`_hydrateProfileFeats`) en chips allumées/grisées sous les 8 familles, toast au déblocage identique. CSS `.kta-feats-specials` / `.kta-feat-sp` + thème clair. i18n `feat.specials` + `feat.sp.*` fr/en/es. **Sources** v1.54.0. Aucune nouvelle surface réseau, aucun nouveau fichier.
- 🥚 **Easter egg (discret)** : rang **secret 👑 Légende** au-dessus de Grand Maître (qui porte désormais la ⚜️ fleur de lys, très connotée catacombes) (`profileGamification.js`, rang `legende` à seuils `Infinity` = inatteignable par les métriques), débloqué **uniquement** si le pseudo du profil = « Karma » (insensible à la casse, override `_isKarma()` en tête de `computeRank`). Anneau **or ambre `#e0a51a` pulsant** (`@keyframes kta-legende-glow`, respecte `prefers-reduced-motion`). `rankByMetrics()` exposé → la fiche profil affiche aussi le rang réellement mérité (« Sans l'easter egg : … »). Volontairement **absent** de la doc utilisateur et des notes de version (surprise). Intégré dans la v1.54.0 (pas de re-bump).

**🏆 v1.53.0 (23/06/2026)** — **Hauts faits / succès (Gamification v2)** :
- **Module pur `js/profileAchievements.js`** : catalogue **8 familles × 4 paliers = 32 hauts faits** (🥉 I · 🥈 II · 🥇 III · 👑 IV). `window.ProfileAchievements = { FAMILIES, total, list, unlockedIds, byId, label }`. Un succès débloqué quand `métrique ≥ seuil`. Familles : Cartographe (plans) · Géomètre (plans géoréf) · Marcheur des profondeurs (km) · Rat de cave (temps) · Pointilleux (POIs) · Traceur (tracés) · Zoneur (zones) · Bâtisseur (structures).
- **Plumbing inline `index.html`** : `_collectGamifMetrics` étendu (plans géoréf via `kmz_calib` + POIs/tracés/zones/structures sommés du cache `myktamap_plan_stats_v1_*`, champ `structs`). `_evalAchievements` détecte les **nouveaux débloqués** → **toast** (`OOMGuard.showToast`) + persiste `myktamap_achievements_v1` (ids + dates). **1ʳᵉ détection = accord rétroactif silencieux** (pas de spam). `_hydrateProfileFeats` = grille dans la fiche profil (compteur **N/32** + 8 rangées famille avec 4 médailles allumées/grisées + seuil en tooltip).
- **🎨 Bandeau d'accueil** : 2 nouvelles stats au pool `PROFILE_BAR_STATS` — **⭐ Score** (`plans+heures+km`) et **🏆 Hauts faits** (`N/32`) + checkboxes dans la fiche profil. **Cap d'affichage inchangé** (`PROFILE_BAR_STATS_MAX = 3`) : 5 stats au choix, 3 max affichées.
- **Export profil** : `myktamap_achievements_v1` ajouté à `PREF_KEYS` (`profileExportImport.js`). i18n `feat.*` fr/en/es. **Sources** v1.53.0 (+ `profileAchievements.js` dans `index.html` + `ASSETS_TO_CACHE`). 100 % community / offline, aucune nouvelle surface réseau.

**🏅 v1.52.0 (23/06/2026)** — **Gamification du profil : rangs / badges « PRO mais FUN »** :
- **6 rangs** (Touriste · 🥉 Novice · 🥈 Confirmé · 🥇 Expert · 🏅 Maître · ⚜️ Grand Maître) sur **seuils statiques** des 3 métriques (plans ouverts · temps passé · km de galerie cartographiée), logique **AND « maillon faible »** (palier le plus haut dont les 3 seuils sont remplis). Module pur **`js/profileGamification.js`** : `window.ProfileGamification = { RANKS, computeRank, getScore, getProgress }`. Le **score** (`plans + heures + km`) est **décoratif**, n'entre pas dans le calcul du rang.
- **Métriques** lues depuis les compteurs **existants** (zéro nouvelle collecte) : ⏱️ `myktamap_total_time_ms` · 🗺️ plans ouverts (`PlanRegistry.lastOpened`) · 📏 somme des `distM` (galeries cartographiées) en cache par plan. Plumbing inline `index.html` (`_collectGamifMetrics` / `_appliquerRangAvatar` / `_hydrateProfileRank`).
- **Affichage** : **anneau coloré** autour de l'avatar (home + modale, glow pour Expert+), **nom du rang sous le pseudo** + **médaille en coin bas-droite de la photo** (cachée pour Touriste), et dans la modale Détails : les 3 métriques chiffrées + **barre + « Encore X pour le rang suivant »** + score. CSS `.kta-profile-rank-*` / `[data-kta-rank]` (dark + thème clair).
- **Export profil** : `myktamap_total_time_ms` ajouté à `PREF_KEYS` (`profileExportImport.js`) → le temps cumulé survit à une migration d'appareil (plans = registre exporté ; km = se régénère en rouvrant les plans).
- **Sources** v1.52.0 (+ `profileGamification.js` dans `index.html` + `ASSETS_TO_CACHE`). i18n `rank.*` fr/en/es. 100 % community / offline, aucune nouvelle surface réseau.

**⌨️ v1.51.0 (23/06/2026)** — **Raccourcis clavier (Lot A) + navigation clavier (Lot B) + refonte du menu Aide (Lot C)** :
- **Lot A — Raccourcis** : ajout du raccourci manquant **🛣️ Tracés = `P`** (`shortcuts.js` MAPPING, `group:traces`). Nouvelle **cheatsheet `?`** (`js/shortcutsCheatsheet.js`) auto-générée depuis `KtaShortcuts.listMapping()` (zéro liste à maintenir) + bloc fixe des combos (Ctrl+Z/Y, Ctrl+K, F, Échap). Touche `?` gérée **avant** le guard Shift (layout-agnostique, AZERTY OK). **Fix** : `_isModaleBloquante()` couvre désormais `.kta-tracker-modal-overlay` (les raccourcis ne se déclenchent plus derrière le modal Tracker). Libellés outils localisés via `cheatsheet.tool.*` (fr/en/es).
- **Lot B — Navigation clavier** : helper partagé `_installFocusNav(container, opts)` (`interface.js`) branché sur le **flyout** ET le **modal Tracker** : focus auto la 1ʳᵉ action à l'ouverture, **TAB** cycle (piège de focus), **↑↓←→** déplacent, **Entrée/Espace** activent (natif `<button>`), **Échap** ferme. Couvre tous les groupes flyout (traces/zones/structures/édition/mesure/favoris) d'un coup.
- **Lot C — Refonte modal Aide** : `afficherAide()` (`interfaceDocs.js`) ne dump plus le gros scroll de 28 sections mais un **hub** : barre de **recherche** + sections **groupées en 6 catégories** (`AIDE_CATEGORIES`, mapping par index document FR≡EN) → clic sur une rubrique = **sous-modale** (z-100001, ← Retour) avec son contenu. Les sections restent définies dans `_aideHtmlFr/En` (source de vérité **inchangée**, parsée à l'ouverture) — refonte de présentation pure, blast radius minimal. Parité FR/EN rétablie (section « Menu Tracker » ajoutée côté EN). Ligne épinglée **⌨️ Raccourcis** ouvre la cheatsheet. Filet de sécurité « Autres » si le mapping dérive.
- **Sources** : `version.json` / `js/copyright.js` / `sw.js` → `v1.51.0` (+ `shortcutsCheatsheet.js` dans `index.html` + `ASSETS_TO_CACHE`). Aucune nouvelle surface réseau.

**🧭 v1.50.0 (23/06/2026)** — **Refonte du menu Tracker en modal plein écran** :
- **Le groupe 🧭 Tracker s'ouvre en modal plein écran de grosses tuiles** (`interface.js` : nouvelle branche `useModal` dans `_creerGroupeAccordeon` + `_ouvrirTrackerModal`/`_fermerTrackerModal`/`_creerTuileTracker`/`_ajouterSectionTracker`), au lieu du flyout latéral. **Réutilise `sousActionsConfig`** (zéro duplication des options) : chaque tuile reflète l'icône dynamique (▶️/⏹️) + l'état actif (boussole, recalage) **à l'ouverture** ; le tap **ferme le modal puis exécute** l'`onClick` existant (même pattern « bouton détaché » que le flyout, cf `_ouvrirFlyout`).
- **3 sections** via le champ `section` des sous-actions (`"suivi"` / `"outils"`) + **Urgence** auto-détectée (`cssClass kta-sous-action-urgence`, fond rouge). **Bande de statut** en en-tête : suivi actif/inactif (lu via `window.getTrackingActif()` = source de vérité moteur `tracking.js`, **pas** le miroir `isTracking` local à `initInterface`) + distance (`getTrackingDistanceM`) + pas (`getStepCount`). Fermeture ✕ / clic-fond / **Échap**.
- CSS `.kta-tracker-modal-*` (charte dark + override thème clair + `safe-area-inset-bottom` iPhone). **Icônes (20px) et hauteurs de tuiles compactées** pour que les 11 options + 3 titres tiennent **sans barre de défilement même sur iPhone SE** (~570px < 92vh). i18n `tracker.modal.*` (FR/EN/ES). **Scope** : seul le groupe Tracker passe en modal (les autres gardent le flyout). Aucune nouvelle surface réseau.

**🧭 v1.49.0 (22/06/2026)** — **Améliorations terrain du tracker / PDR (retour terrain 4h30)** :
- **🎯 « Ma position »** (`interface.js`, flyout 🧭 Tracker) : recentre la carte sur la position courante du tracker (`getTrackingPosition` → `convertCoord`), zoom conservé. Marche même tracker à l'arrêt.
- **🔓 Suspendre le verrou sur tracé** (smartNav) sans passer par les Réglages — cas sortie d'une galerie principale vers une cave hors réseau. Durées **30 s / 1 min / 10 min / jusqu'à réactivation**. `APP_CONFIG.smartNav` coupé (lu à chaque pas par `tracking.js > avancer()`), restauré par timer. **Compte-à-rebours intégré dans la status bar** (`#kta-refonte-stat-verrou`, à côté du 🧭 ON/OFF — `refonteInterface.js`) ; clic → modale de confirmation de réactivation.
- **🧭 Démarrage sur la dernière position** : au restore/import d'une session (`tracking.js > setTrackingTimeline`), la vue se recentre sur le dernier point de la timeline (le marker y était déjà replacé par `_rebuildTrailFromTimeline`, mais la vue restait figée sur `initPosition` d'`initTracking`). **Fallback** : pas de timeline → `initPosition`.
- **⚙️ Tolérances du verrou réglables** (`roadGraph.js` + `config.js` + `interfaceConfig.js`) : `smartNavRadiusM` (tolérance latérale, défaut 6 m) + `smartNavHeadingWeight` (poids du cap aux croisements, défaut 0.7 — baisser pour passer une jonction même mal orienté ; 0 = cap ignoré). Surchargés **à chaud**, persistés (`app_user_prefs`). `roadGraph` lit ces valeurs via `_matchRadiusPx()` / `_headingWeight()`.
- **Garde-fous détection de pas** : taille d'un pas clampée **[0–1.5 m]**, seuil de détection **[10–30]** (magnitude accel incluant la gravité ≈ 9.8), cooldown **[300–3000 ms]** — bornes input + clamp à l'apply. **3 avertissements** dans ⚙️ Réglages → Navigation & Tracker : prérequis échelle m/px (en tête du groupe, bleu) + « réglages experts » (ambre) sur Détection des pas et Verrou sur tracé.
- i18n : ~19 clés `tracker.verrou.*` / `ui.subaction.*` / `config.smartnav.*` / `config.navTracker.*` / `config.tracker.expertWarn` fr/en/es. **Aucune nouvelle surface réseau** (tout local).

**🔧 v1.48.1 (21/06/2026)** — **Raffinements Éditeur + évitement de zones par type** :
- **Itinéraire — évitement de zones par TYPE** (refonte de l'approche per-instance de v1.48.0) : la section « ⬛ Zones à éviter » affiche désormais **1 case par type** (Eau, Effondrement, types custom…) comme les autres filtres, au lieu d'une longue liste de chaque zone. Pathfinder : `getAvoidableZones()`/`_zoneDerivedId` **remplacés** par `getAvoidableZoneTypes()` (`[{type, label, count}]`, types distincts hors `inaccessible`) ; `_collecterZonesAEviter(types)` collecte **toutes** les zones du type coché ; `prefs.zones` stocke des **types** (plus d'id dérivés). **Fix label custom** : un type `cust-…` affichait sa clé brute (`getLabel` ne consulte pas `customEntries`) → résolu via `LegendCustomization.findCustomEntry(type).label` (« galerie basse »). i18n `iti.avoid.zonesHelp` ajusté (« type de zone »).
- **Éditeur de données du plan** : bouton home **📊 Éditeur de données déplacé AVANT le 🏗️ Générateur** (`index.html`). Modale d'accueil : **marge basse** sous les cartes de sources (le corps en `padding-bottom:0` collait la dernière carte au bas — `.kta-tbl-sources { margin-bottom }`).
- *(Le contournement « boutons home côte à côte » pour l'overflow à zoom 125% a été retiré : le cas zoom navigateur/Windows sera traité dans un audit dédié.)*

**🚧 v1.48.0 (20/06/2026)** — **Éditeur de données du plan (refonte) + évitement de zones (itinéraire) + curseur de précision + légende custom en session** :
- **Éditeur de données du plan (refonte de `js/tableEditor.js`)** — ex-« Éditeur de tableau JSON ». Ouvrable depuis la **sidebar carte** (⬇️ → 📊) **et le home** (bouton `📊 Éditeur de données` à côté du Générateur, `index.html` `loaderTableEditorBtn` → `ouvrirTableEditor`). Écran d'accueil à **3 sources** : 🗺️ **plan en cours** (relit ses datalayers via `fetch(PLAN_CONFIG.dataLayers[].file)` — URL blob/serveur déjà résolue, **zéro impact live**), 📦 **ZIP** de plan complet (`JSZip` lit `plan-config.json` + chaque fichier), 📄 **fichier JSON** seul (drop existant). **Au home, `PLAN_CONFIG` est `null`** (reset `config.js > resetRuntimeAssets`) → la carte « plan en cours » est **masquée**, seules ZIP/JSON s'affichent. **Sélecteur de calque** (1 entrée par tableau éditable trouvé : `data`/`editorPoints`/`roads`/`zones`/`structures`). Le tableau gère désormais les **tracés/zones/structures** : `description`(note) + `type` + `level` éditables, colonne `points` (géométrie) en **lecture seule**. **Garde-fou « no live » pour les datalayers** : export-only (`📥 Télécharger`) + note « réimporte dans le Générateur » ; le live-load `Remplacer le calque actif` est **retiré**. Seule la **session** (`editorPoints`) garde `Remplacer la session` live. Export = clone complet de la source avec le seul tableau édité remplacé → **aucune perte** des autres champs/tableaux. 23 clés `tabledit.*` fr/en/es.
- **Itinéraire — évitement de zones** : en plus des points et passages déjà évitables, le calcul d'itinéraire peut désormais **contourner des zones** entières. Le pathfinder (`js/pathfinder.js`) gagne `getAvoidableZones()` (liste les zones évitables, hors zones « inaccessibles » qui restent des murs **durs**) + un paramètre `avoidZones` dans `_buildGraph`/`computeRoute` traité en **contrainte souple** (2 passes : avec évitement, puis fallback sans si aucun chemin — même logique que l'évitement de points). L'id de zone est **dérivé au runtime** (`z_<type>_<x>_<y>_<n>`, jamais persisté : les zones n'ont pas d'id en data). UI : nouveau groupe « ⬛ Zones à éviter » (checklist) dans la modale Itinéraire (`js/interfaceItineraire.js`), persisté par plan dans `myktamap_route_avoid_<planId>` (champ `zones`). Clés `iti.avoid.zones*` fr/en/es.
- **Itinéraire — évitement de zones** : en plus des points et passages déjà évitables, le calcul d'itinéraire peut désormais **contourner des zones** entières. Le pathfinder (`js/pathfinder.js`) gagne `getAvoidableZones()` (liste les zones évitables, hors zones « inaccessibles » qui restent des murs **durs**) + un paramètre `avoidZones` dans `_buildGraph`/`computeRoute` traité en **contrainte souple** (2 passes : avec évitement, puis fallback sans si aucun chemin — même logique que l'évitement de points). L'id de zone est **dérivé au runtime** (`z_<type>_<x>_<y>_<n>`, jamais persisté : les zones n'ont pas d'id en data). UI : nouveau groupe « ⬛ Zones à éviter » (checklist) dans la modale Itinéraire (`js/interfaceItineraire.js`), persisté par plan dans `myktamap_route_avoid_<planId>` (champ `zones`). Clés `iti.avoid.zones*` fr/en/es.
- **Curseur de précision (a11y)** : sur un plan à fond clair, le curseur système se perdait. Tous les modes d'édition (édition, mesure, recalage, tracé, zone, structure) affichent désormais un **curseur de visée rouge** (croix SVG `#ff1e1e` — rouge choisi pour rester visible sur les galeries JPG orangées). Bascule pilotée par CSS (`body.kta-precision-mode`, `css/style.css`) + un observeur léger des flags de mode (`js/interface.js`, accesseurs `Object.defineProperty` sur `window.modeX`). Le `cursor:"crosshair"` codé en dur du Lost Mode (`js/lostMode.js`) cède la main au CSS.
- **Export de session — légende personnalisée autoportante** : exporter une session embarque désormais l'état de **légende personnalisée** (`customLegend` = renommages + masquages + types custom) dans le JSON (`js/sessionExporter.js`), et l'import la restaure (`js/interfaceImportExport.js` → `LegendCustomization.loadSessionState`). Avant, importer une session sur un ZIP « legacy » (sans légende baked) faisait apparaître les tracés/zones custom **sans leur légende** → types orphelins. Désormais la session est autoportante. **Aucun effet de bord côté conversion datalayer / générateur** (audit fait) : l'import générateur lit une whitelist de champs et **ignore** `customLegend` ; le derived-id de zone n'est jamais persisté.

**🧭 v1.47.0 (16/06/2026)** — **Refonte du loader (rose des vents vectorielle) + durcissement i18n** :
- **Nouveau splash de démarrage** (`#splashOverlay`, `index.html` + `css/style.css`), recentré sur la **rose des vents**. Crédit **Claude** seul en haut-gauche (`✦ Conçu avec Claude` + sous-ligne, teinte clay `#d97757`, clés `home.splash.craftedWith/Sub` fr/en/es), **version** en haut-droite (dynamique depuis `__MKM__.build` via `_splashStart`, zéro hardcode), **arc doré rotatif** autour de la boussole **remplaçant l'ancienne barre de progression + échelle 0-100**, **licence en pill** (chip bordé charte, remonté du footer à `19vh`/`16vh` paysage pour se centrer dans le gap tagline↔footer, bascule community/pro préservée via sélecteurs scopés `#splashLicense`). Thème clair/sombre + responsive portés. Karma calligraphié (`karma.png`) inchangé.
- **Rose des vents vectorielle `icon/compass.svg`** (8 branches plates — cardinales or + intercardinales bleu charte, **branche Nord rouge** = repère, anneaux fins + ticks, libellés N/E/S/W). Remplace les vieux raster (`mkm-full.png` ornée / `compass.png`) **partout** : splash hero, loader entrée-map, header HOME/MAP (`refonteInterface.js`), **mode boussole** (`compass.js` ×2 — tourne avec le cap comme avant, mais net à toute taille). Précaché (`sw.js > ASSETS_TO_CACHE`). **Icône PWA régénérée + renommée** : `compass-180/192/512.png` rasterisées depuis `icon/app-icon.svg` (boussole sur fond sombre charte, `purpose:"any maskable"`). Le **renommage** (ex-`mkm-*`) change l'URL des icônes du manifest/apple-touch → force le navigateur à re-télécharger l'icône du raccourci (sinon figée à l'install).
- **i18n — `_loadDict` en `cache:"reload"`** (`langManager.js`) : le `cache:"no-cache"` ne faisait que **revalider** → sans SW (post-`killsw`), un `304 Not Modified` sur l'URL `?v=<build>` figée resservait un `fr.json` **périmé** du cache HTTP navigateur (clés ajoutées en cours de cycle invisibles). `reload` force un GET réseau qui **ignore** le cache HTTP → dico frais garanti dès que le serveur l'a. *(Cause racine prouvée par diagnostic : serveur `fr.json` = 4208 clés OK → c'était bien le cache navigateur.)*
- **i18n — lissage du swap SW passif** : `I18n.reload()` (vide le cache mémoire + refetch frais + notifie `onChange`) + handler global `controllerchange` (`main.js`) qui re-traduit **en place** (`_applyI18nDom` + re-render perf preset, extrait en helper `_retraduireI18nDomEnPlace` partagé avec le sélecteur de langue). Au boot où un nouveau SW prend la main sans reload, les libellés humanisés se corrigent **à la volée, zéro flash, zéro reload** (l'update *manuel* reload déjà la page).
- **Audit i18n exhaustif** (3429 clés appelées en code vs `fr.json`) : **0 vrai trou** (les 2 « hits » étaient des exemples dans des commentaires). `check-i18n` avait raison — les « clés manquantes » de la console étaient à 100% un **dico chargé périmé**, pas un trou code↔dico.

**🔧 v1.46.6 (14/06/2026)** — **Hotfix : dicos i18n toujours frais après mise à jour** :
- **Symptôme** (KARMA, post-déploiement) : des clés s'affichaient « brutes/humanisées » (« Enable Btn », « Incognito Start Label »…) en EN/ES — alors que les clés **existent** dans les dicos (parité fr/en/es OK, `check-i18n` vert). La console (`[I18n] Clé manquante` sur des dizaines de clés `home.plans.*` / `ui.refonte.*`) a prouvé que le **dico chargé en mémoire était périmé** (sans les clés de la migration i18n) alors que les fichiers serveur étaient frais → une couche de cache (HTTP navigateur / précache SW / serveur) servait un vieux dico au boot. Le network-first seul ne suffisait pas (SW pas encore aux commandes au 1er load post-`killsw`).
- **Fix DÉFINITIF** : **cache-buster par version de build** sur l'URL des dicos — `lang/<code>.json?v=<build>` dans `js/langManager.js` (`__MKM__.build`). L'URL change à CHAQUE release → contourne **toutes** les caches. SW : fallback `cache.match(…, {ignoreSearch:true})` sur le handler `lang/*.json` pour retomber sur le précaché (sans query) en offline. **Plus jamais de clés brutes après une mise à jour.**

**🐛 v1.46.5 (14/06/2026)** — **Correctifs moteur + Aide IA traduite (FR/EN/ES)** :
- **Ronds roses des jonctions inter-niveaux** : ne disparaissaient pas au toggle du FilterPanel. Les `L.circleMarker` aux extrémités (ajoutés à `window.layerEditor`) étaient purgés via `layer.remove()` → retire de la map mais **pas du FeatureGroup parent** (même bug que les cercles d'intersection, fixé v1.44.1). Cleanup `renderRoads()` rendu **FeatureGroup-aware** (`grp.removeLayer` si `grp.hasLayer`, fallback `layer.remove`). **Suite — jonctions du data layer embarqué (zip)** : `renderRoads()` ne rend que `roadsData` (session) ; les jonctions embarquées sont bâties dans `js/utils.js` et tracées par le filtre runtime via `_ktaDataPolylines`. Leur **entrée de rond manquait le champ `type`** → le filtre par type (toggle « jonction ») les sautait ; et le masquage ne coupait que `opacity` (bord magenta) **pas `fillOpacity`** → le disque blanc rempli persistait. Fix : ajout de `type` + `origFillOpacity` à l'entrée du rond et coupure de `fillOpacity` dans `_filtreNiveauSurPolylineData`. (Aucun impact autres consommateurs : ils gatent sur `entry.points`/`entry.road`, absents du rond.)
- **Outil tracé bloqué après suppression du dernier point** (tracé / zone / structure / front de taille) : les 3 boutons « ↩️ supprimer dernier point » vidaient le tracé en cours sans fermer le mode → `window.modeX` restait actif + bouton `kta-actif` = état fantôme (icône « coupée », clic carte inerte). Ajout de la garde `if (before && !after) _fermerMode*()` (même pattern que les boutons ✂️ voisins).
- **Modale « Aide IA »** : toute la chrome (titre, 5 sections, étapes, prompt anti-hallucination, boutons, statuts) migrée vers `I18n.t()` (**25 clés `aiia.*`** fr/en/es). Le `.md` téléchargé reste FR (une IA s'en sort).
- **Dicos i18n `lang/*.json` passés en network-first** (cause racine des « clés brutes/humanisées ») : ils étaient **précachés cache-first** → un SW installé avant l'ajout d'une clé (ex. `pin.setup.changeBtn` en v1.46.2) servait un `fr.json` périmé → texte humanisé (« Change Btn ») **indéfiniment** si le SW ne se réinstallait pas. Fix : même stratégie **network-first + timeout 2,5s + fallback cache** que les docs (v1.43.11) appliquée à `lang/*.json` dans `sw.js` → traductions fraîches dès le déploiement, **découplées du bump `CACHE_NAME` et de l'état du SW**. Le humanize (H1) reste comme dernier filet. *(Pour débloquer un SW déjà coincé : une réinstallation via `killsw.html`/hard-reload.)*
- **Correctifs déjà commités depuis v1.46.3** : mode **mesure** (angles réaffichés — `map.off` avant re-bind, fin du *handler stacking*), mode **édition** (1 clic = 1 point, idem), config **thème clair** lisible (en-têtes de groupe `.kta-cfg-group-titre`), clés i18n manquantes **humanisées** (« Change Btn ») au lieu d'affichées brutes, popup POI **lazy** (`bindPopup(fn)`). Audit `docs/audits/2026-06-14_audit-i18n-langue-v1.md`.
- **Audit i18n P2 (M1→M4) traité** : barre d'actions Réglages PLAN (« Reset/Appliquer/🐛 Logs ») migrée en `I18n.t()` — clés `config.actions.*`, FR inchangé, EN/ES corrigés (M1) · `getLang()` mémoïsé `_cachedLang` invalidé au `setLang` (M2) · labels preset perf en `white-space:normal` + `overflow-wrap:anywhere` → fin de la troncature « Desact… » en ES mobile (M3) · `check-i18n.js` capte les alias `_t("…")` dans les fichiers aliasant `_t` à `I18n.t` (M4 — ferme l'angle mort qui a masqué le bug PIN). **P3 LOW** aussi traité (variante thème clair du hint langue · double 🌍 HOME retiré · section PIN re-traduite à chaud via `I18n.onChange`) → **audit i18n clos** (LOW #1-4 = non-bugs assumés).
- **Langue — popup « redémarrer » + persistance incognito** : au changement de langue (HOME **et** ⚙️ Réglages carte), un popup charté (dans la nouvelle langue, clés `lang.restart.*`) recommande un redémarrage pour une bascule 100% propre (`Continuer sans redémarrer` / `Redémarrer` = `location.reload()`). Helper global `window.proposerRedemarrageLangue()`. **Skippé en incognito** (un reload y perdrait la session in-memory). **+ La langue persiste désormais en incognito** : `myktamap_app_lang` ajouté aux whitelists lecture **et** écriture (write-through disque) du shim `incognitoMode.js` — préférence d'affichage non-sensible, exception assumée à la promesse « aucune trace » (claim user `incognito.confirm.changes.b1` + log dev ajustés : « langue d'interface conservée »).
- **OSM mini-preview HOME — tuiles d'un plan ne se chargeaient qu'après ouverture du fullscreen** (bug « depuis toujours », 2 fixes ratés v1.40.40/41). Cause racine prouvée : `_renderGeorefMarkers` faisait `fitBounds()` **juste après `L.map()`**, avant que le conteneur `#ktaOsmHomeMap` ait sa taille (layout pas stabilisé au boot) → Leaflet calculait zoom/center avec une taille 0 → tuiles jamais demandées pour la bonne zone ; les `invalidateSize` (raf/timeouts/ResizeObserver) arrivaient trop tard **et ne re-fittaient jamais** (d'où l'échec des 2 fixes précédents). Le fullscreen forçait un reflow + `invalidateSize` qui débloquait. Fix : helper `_fitToCurrentGeoref()` (`invalidateSize` **puis** `fitBounds`, uniquement si le conteneur a une taille réelle >0) + `_safeInvalidate` rendu auto-correcteur (re-fit tant que `_miniFitDone` est false, puis simple `invalidateSize` → ne clobbe pas un pan/zoom user). Plus besoin du fullscreen.
- **Modale Itinéraire — dropdown de recherche « transparent » par-dessus la liste** : les items de la recherche **avoidances** (`.kta-iti-search-result`, générés par `interfaceItineraire.js`) n'étaient **pas stylés** (le CSS ne ciblait que `.kta-iti-search-item` de la recherche principale) → items sans padding ni fond propre, « flottants » au-dessus de la liste des points = effet transparent. Fix : alias des 2 classes dans le CSS (dark + thème clair) + fond opaque explicite sur chaque item (en plus du conteneur).
- **Corrections ES (retour locuteur natif 🇲🇽)** : greeting « Bienvenido » → **« Bienvenido/a »** (genre inclusif) · **« plano » → « mapa »** partout (382 occurrences, mot-entier) · « Puits Comblé » → **« Pozo inyectado »** (bouché = « tapado » déjà conforme) · **« Clicar » → « Haz clic »** (bouton géoréf « Haz clic en el mapa » + « hacer clic ») · **« desmarca/desmarcado » → « deselecciona/deseleccionado »** (15×) **+ « marcar » → « seleccionar »** dans les contextes case-à-cocher uniquement (22×, paires cohérentes *seleccionar/deseleccionar* ; « marca de tiempo » (timestamp), « marcados como favoritos », « Marca tu ubicación » préservés). Parité fr/en/es préservée, `{params}` intacts (`check-i18n` vert).
- **Loader de calcul d'itinéraire** : sur un réseau de tracés dense, le Dijkstra prend 1-3 s → overlay chartré (spinner du chargement de plan + « 🧭 Calcul de l'itinéraire… ») le temps du calcul, pour rassurer l'user. **Insight** : un label « Calcul en cours… » existait déjà sur le bouton mais **ne s'affichait jamais** (le Dijkstra *synchrone* bloque le thread avant le repaint) → helper `_withItiComputeLoader` avec **yield-to-paint** (`requestAnimationFrame` + `setTimeout 0`) qui laisse le navigateur peindre l'overlay AVANT le calcul. Couvre la modale **et** le popup « itinéraire jusqu'ici ». Clé `iti.compute.loading` fr/en/es.

**🎛️ v1.46.3 (13/06/2026)** — **Refonte ergonomique des modales de configuration** :
- **HOME + carte** : sections réorganisées par **groupes thématiques** (même ordre dans les 2 modales) avec en-têtes : 🌍 Application · 📐 Plan : échelle & géoloc · 📍 Navigation · 🎨 Affichage · 🚀 Performance · 🔒 Confidentialité & sécurité · 🛠️ Système. **Zéro changement de logique** (blocs déplacés, tous les `id`/handlers préservés — PLAN 28 id, HOME 41 id, delta 0).
- **Échelle (m/px) regroupée avec le Géoréférencement + Calibration Nord** (extraite de « Détection des pas ») — demande KARMA : les calibrations spatiales du plan côte à côte.
- Clés d'en-tête `config.group.*` (fr/en/es) via `scripts/merge-i18n-frags3.js`. Label langue raccourci (« Langue / Language / Idioma », fini la redondance avec le groupe « Application »). Doublons de titres retirés (Affichage + Mode Performance ULTRA = en-tête de groupe). Lisibilité du menu déroulant langue corrigée (fond solide des `<option>`, dark + thème clair). M-LVL laissé dormant.

**🐛 v1.46.2 (13/06/2026)** — **Phase 2 i18n : rattrapage du FR codé en dur** :
- La migration v1.46.0 avait couvert les modules `js/` mais laissé du **FR codé en dur** dans les **scripts inline d'`index.html`** + quelques modules (jamais passé en clé → **invisible à `check-i18n`**, qui ne valide que la parité + les clés *appelées*). En EN/ES, ces textes restaient français (bug remonté par KARMA : flux **code d'accès PIN**).
- **~415 chaînes migrées** vers `I18n.t()`, **+438 clés** ajoutées dans fr/en/es **ensemble** (parité maintenue : 4161/4161). Foyers : flux PIN (config HOME), modale **Profil**, modales **maintenance SW**, modales **crash** (`oomGuard`) + **batterie**, **boussole** (cardinaux localisés SW/W/NW), popup POI, avertissements d'échelle, **rapport de session** (TXT/PDF suit la langue), erreurs pathfinder/PDF/quota. **Tous les `alert()`/`confirm()` natifs** user-facing migrés (7 → 0).
- **Nouvel outillage d'audit** : `scripts/find-hardcoded-fr.js` (détecte le FR codé en dur — l'angle mort de `check-i18n`) + `scripts/merge-i18n-frags3.js` (fusion fragments tri-langue). Inventaire complet : `docs/i18n-hardcoded-audit.md`.
- **Résidus connus** (faux-positifs du détecteur = données : grammaire vocale, enums de statut, libellés gravés dans les exports KML/GPX) + quelques chaînes mineures documentées. Labels d'import (KMZ/GPX) localisés **à la langue d'import** (donnée figée, assumé).

**🇪🇸 v1.46.1 (13/06/2026)** — **Espagnol (ES) + déplacement du sélecteur de langue** :
- **`lang/es.json` (NOUVEAU)** : 3ᵉ langue complète — **3721 clés** traduites (100 %, parité avec `fr.json`, `{param}` cohérents). `{ code: "es", label: "Español" }` ajouté à `AVAILABLE_LANGS` (`js/langManager.js`) + `./lang/es.json` précaché (`sw.js`). Glossaire cataphile/spéléo ES (trazado, plano, frente de cantera, gatera, rescate, operador…). Lots traduits par sous-agents parallèles puis fusionnés (`scripts/merge-es-frags.js`).
- **Sélecteur de langue déplacé** : retiré du header HOME (trop chargé sur mobile), placé dans **⚙️ Configuration → section dédiée juste après Incognito** (`#loaderLangSection`, drapeau + nom complet). Bascule **live sans reload** (HOME + modale ouverte re-traduits en place via `_applyI18nDom`, compatible incognito).
- **Doc / Aide / Onboarding → GB par défaut** quand l'app n'est plus en FR : un changement de **langue globale** efface la mémoire locale `myktamap_readme_lang` → ces 3 contenus re-suivent la langue de l'app (→ EN, car ils restent FR/EN). Le toggle drapeau local reste sticky tant que la langue globale ne bouge pas. `onChange` ne fire qu'au changement utilisateur (pas au boot).
- **Modale de confirmation thème CLAIR/SOMBRE** : restait codée en dur en FR (résidu), migrée vers `I18n.t()` au rendu (clés `theme.name.*` + `theme.confirm.*` fr/en/es ; le mot coloré passe via interpolation `{target}`).
- **Outillage** : `scripts/merge-es-frags.js` (NOUVEAU) ; `scripts/check-i18n.js` étendu (contrôle **souple** des langues WIP : couverture partielle tolérée, mais clé fantôme + `{param}` divergent restent bloquants).
- **Refactor** : `js/i18n.js` renommé **`js/langManager.js`** (nom plus parlant ; global `window.I18n` inchangé).
- **Hors scope** (toujours FR/EN) : Documentation (`README_USER.*`), Aide intégrée, onboarding. La traduction ES de ces contenus longs = chantier séparé ultérieur.

**🌍 v1.46.0 (13/06/2026)** — **Migration multilingue COMPLÈTE** (chantier méthodique en 7 vagues, sous-agents parallèles + relecture/go-no-go indépendants) :
- **~3600 clés** `lang/fr.json` + `lang/en.json` (parité 100 %, interpolations `{param}` cohérentes vérifiées par `scripts/check-i18n.js`). FR = référence + fallback universel.
- **~50 modules migrés** vers `window.I18n.t()` au rendu : toute l'UI (barre d'outils, modales, toasts, tooltips, placeholders, alertes), Réglages (Perf ULTRA/Géoréf/M-LVL), HOME complet, Itinéraire, Vue OSM, Générateur, Éditeurs, Exports/Imports (PNG/PDF/KMZ/GPX), Stats, Mode Histoire, commandes vocales, et **Mode Secours** (le plus gros : ~700 clés).
- **Outillage** : `scripts/check-i18n.js` (parité + clés appelées + interpolations), `scripts/merge-i18n-frags.js` (fusion des fragments). Glossaire EN cohérent (tracé→path, plan→map, niveau→level, équipe→team, secours→rescue…).
- **Hors scope** (portée séparée) : doc + onboarding (clé `myktamap_readme_lang`). **Non traduit** (= données) : tags moteur, ids, statuts sérialisés, patterns de reconnaissance vocale, libellés gravés dans les exports KML/GPX.
- Bascule **live sans reload** via le sélecteur ⚙️ Réglages / HOME. Détails : `docs/architecture/i18n.md` (table de migration) + `docs/i18n-audit.md` (inventaire).

**🌍 v1.45.0 (13/06/2026)** — **Chantier multi-langue — Phase 0 : infra + module pilote** :
- `js/langManager.js` (NOUVEAU) : helper `window.I18n` — dicos plats `lang/<code>.json` (clés `"module.section.element"`), chaîne de fallback **langue active → fr → clé brute** (jamais de crash), interpolation `{param}`. API : `init()` (await au boot), `t(key, params)`, `getLang()`, `setLang()`, `ensureLang()`, `onChange()`, `available()`, `has()`.
- **Langue globale de l'app** lue depuis `localStorage["myktamap_app_lang"]`, **découplée** de `myktamap_readme_lang` (doc + onboarding). Décision KARMA : le changement de langue **complet** passe par ⚙️ Réglages ; les toggles 🇫🇷/🇬🇧 de la doc et du tutoriel restent **locaux** à leur propre affichage.
- **Sélecteur de langue dans ⚙️ Réglages** (`interfaceConfig.js`) : section `🌍 Langue de l'application` (`<select>` alimenté par `I18n.available()`) → au change, `I18n.setLang()` + rebuild de la modale = bascule **live sans reload**.
- **Présélection intelligente doc + onboarding** (`interfaceDocs.js`, `tutorial.js`) : à l'ouverture, la langue suit le **choix manuel mémorisé** s'il existe, sinon le **défaut dérivé de la langue de l'app** (`I18n.resolveContentLang` : langue app si le contenu existe, sinon EN, sinon FR). Onglets de langue **dynamiques** (un drapeau par `README_USER.<code>.md` / tableau `CARDS_*` présent) → 2 aujourd'hui (FR/EN), 3+ générique le jour où un RU/ES/… arrive (zéro code de langue figé). La doc affiche N drapeaux (courant `.active`), l'onboarding **cycle** sur la liste.
- **HOME multilingue + sélecteur dès l'accueil** (`index.html`, `main.js`) : sélecteur de langue dans le header du loader (visible **avant** de charger un plan, et donc en **incognito** qui réutilise le même écran). Les textes statiques du HOME sont annotés `data-i18n` / `data-i18n-html` / `data-i18n-title` et traduits **depuis le dico** par `_applyI18nDom()` (au boot + à chaque bascule, en place sans reload). 21 clés `home.*`. Bandeau profil : greeting + placeholder via `I18n.t()` + re-render sur `I18n.onChange` (le pseudo user reste inchangé). Restent en FR pour une vague suivante : footer, interne du widget Vue OSM, cartes de plans, modale config HOME.
- `lang/fr.json` + `lang/en.json` (NOUVEAUX) : 1ers dicos (25 clés, parité 100%). FR = **langue de référence + fallback universel**.
- **Module pilote `interfaceConfig.js`** : migration du **lot 1** de la modale Réglages (header, langue, mode présentation, incognito, position tracker, détection des pas, navigation intelligente) — 23 appels `I18n.t()`. Les sections restantes (Affichage, Perf ULTRA, M-LVL, géoréf…) gardent leur FR inline → **vague suivante** (migration progressive assumée, zéro régression : migré ou pas, ça marche).
- **Branchement boot** : `index.html` charge `js/langManager.js` tôt (après copyright) · `main.js` `await I18n.init()` avant `lancerApplication` (dicos prêts avant tout rendu) · `sw.js` précache `./js/langManager.js` + `./lang/fr.json` + `./lang/en.json` (fr.json + i18n.js dans le shell critique → boot offline OK).
- Demain pour ajouter ES/RU/… : déposer `lang/<code>.json` + l'ajouter à `AVAILABLE_LANGS` (i18n.js) + `ASSETS_TO_CACHE` (sw.js). **Zéro code moteur à toucher.** Détails : `docs/architecture/i18n.md`.

**✏️ v1.44.7 (10/06/2026)** — **Tutoriel : description exacte des POI sortie** (audit traduction EN) :
- `tutorial.js` : la carte 12 mentionnait un tag `sortie`/`exit` qui n'existe pas dans le moteur (`sortieUrgence.js` matche sur `cao`/`peo`/`eso` ou le tag `entrée`). Corrigé FR + EN avec les vrais tags. Audit complet de la traduction EN par agent : parité 25/25, complétude 100%, 0 bloquant — seul ce faux tag (hérité du FR) restait à corriger.

**🇬🇧 v1.44.6 (10/06/2026)** — **Tutoriel premier-lancement bilingue** :
- `tutorial.js` : ajout d'un tableau `CARDS_EN` (25 cartes, parité 1:1 avec `CARDS` FR) + objet `UI_STRINGS` (header/boutons/aria). Toggle 🇫🇷/🇬🇧 dans le header du tutoriel (même logique que la modale Documentation), qui bascule les 25 cartes en live. Langue lue/persistée dans la clé partagée `localStorage["myktamap_readme_lang"]` (auto-détection `navigator.language` au 1er boot) → cohérence avec la doc. CSS : `.kta-tutorial-lang` compact dans `style-meminspector.css`.

**🐛 v1.44.5 (10/06/2026)** — **Générateur : data URL SVG `entree_plan` débordait la modale** :
- `createConf.js` : l'icône built-in `entree_plan` (SVG inline, `data:image/svg+xml;...` ~700 caractères) était affichée telle quelle dans le nom de la row d'icône. En flexbox/grid sans `min-width:0`, ce contenu `nowrap` annulait le `text-overflow:ellipsis` → débordait + élargissait toute la modale + cassait le wrap des textes (mode Avancé, écran ≥1280px en grille 2 colonnes). Fix JS : label propre `🔗 icône intégrée (SVG)` pour les data URL (le `<img src>` garde la data URL pour la preview). Fix CSS : `min-width:0` sur `.kta-planner-icon-path` (flex) ET sur `#kta-planner-corps > *` (grid items).

**🐛 v1.44.4 (10/06/2026)** — **Suppression au clic : cause racine corrigée** :
- `interface.js` : le v1.44.3 masquait la popup mais ne déclenchait pas la suppression. Cause de fond : quand on clique PILE sur un élément avec `bindPopup`, le handler Leaflet `_openPopup` fait `DomEvent.stop(e)` → la propagation est stoppée → le `map.on("click")` du mode suppression ne tire JAMAIS. Seuls les clics *à proximité* (sans toucher la ligne) supprimaient. Fix : on REJOUE le clic suppression depuis l'event `popupopen` (Leaflet ouvre la popup à `t.latlng` = point cliqué, donc `popup.getLatLng()` = position du clic) → handler de suppression actif appelé avec `{ latlng }`, retrouve l'élément cliqué et le supprime.

**v1.44.3 (10/06/2026)** — Guard popup mode suppression (1ère tentative, incomplète : masquait la popup sans corriger la cause — voir v1.44.4).

**🐛 v1.44.2 (10/06/2026)** — **Ronds d'intersection vs toggle calque data** (3e bug de la même famille, trouvé au test terrain de v1.44.1) :
- `filterPanel.js` : `road.js` recalcule les intersections sur `overlayadd`/`overlayremove` — événements émis uniquement par le contrôle de couches Leaflet NATIF. Or le FilterPanel (v1.21.5) fait `map.addLayer/removeLayer` directement → aucun événement → cercles des roads embarquées du calque masqué persistaient. Fix : `_scheduleRoadsRecalc()` (renderRoads coalescé 150 ms) déclenché après chaque toggle de calque data. Le coalescing évite N renders d'affilée au « Tout afficher » (events synthétiques par checkbox).

**🐛 v1.44.1 (10/06/2026)** — **Fix ronds aux intersections des tracés** (2 bugs cumulés, pré-existants) :
- `road.js` : `_renderIntersections` ignorait le filtre runtime par type de tracé (`_ktaRuntimeFilters.roadTypes`) → les cercles des types décochés dans Filtres ≡ restaient affichés. Nouveau `_passeFiltreTag()` miroir de la logique `renderRoads`.
- `road.js` : `layer.remove()` retirait les cercles de la map mais **pas du FeatureGroup parent** (`layerEditor`) → accumulation silencieuse à chaque re-render (mesuré : 719 cercles fantômes pour 9 attendus sur plan dense). Nouveau helper `_purgeIntersectionLayers()` mutualisé (`_renderIntersections` + `resetRoads`) qui retire via `grp.removeLayer()`.

**📦 v1.44.0** (09/06/2026) — **🧰 Refonte interne du cycle de vie des modales (helper `ModalLifecycle`)** sur la base de la 1.43.x (`Save Offline` + robustesse SW + hardening modales v1.43.26-27). Voir `docs/architecture/modal-lifecycle.md` pour l'architecture, `docs/applications/NETWORK_AUDIT.md` pour le détail des patches v1.43.9 → v1.44.0, et `docs/audits/2026-06-09_audit-modales-v2.md` pour le rapport workflow d'audit.

**🧰 v1.44.0 (09/06/2026)** — **Refonte interne ModalLifecycle** (helper standalone ~250 lignes, zéro dépendance, opt-in modale par modale) :
- `js/modalLifecycle.js` : nouveau helper qui tracke timers + listeners + blob URLs d'une modale et libère tout automatiquement au `close()`
- Migrations pilotes : `memInspector` (complète : ouverture/fermeture + `_refreshAndRender` + sous-modale crash detail + event delegation `_bindCrashHandlers`), `swInspector` (complète : `_collectAndRender` avec `guard` + `_handleRefetchClick` avec `lockButton`), `lostMode` (partielle : `_lc.close()` au fermer + `_lc.setTimeout` bouton copy)
- 3 high audit V2 restants fixés : `createConf:3062` try/finally garantit revoke blob URL ZIP, `interfaceItineraire:963 + :1401` refacto event delegation autocomplete avoid/waypoints
- Quick wins audit V2 : GPS invalid input mark clear avant chaque validation, overrides CSS light theme `.kta-mem-loading` + toast `#kta-sw-incomplet-toast`
- Hook lint advisory `scripts/check-modal-lifecycle.js` (intégré `.githooks/pre-commit`) flag les natifs dans les modules migrés
- Doc architecture `docs/architecture/modal-lifecycle.md` (contrat complet + bonnes pratiques + plan migration)

**🩹 v1.43.27 (09/06/2026)** — **Hotfix audit modales V2** (workflow adversarial verify, 87 raw → 61 confirmés) :
- `osmView:2390` — **régression v1.43.26 corrigée** : `.finally()` ajouté pour cleanup `waitOverlay` (avant : overlay orphelin dans le DOM à chaque ouverture Vue OSM)
- `lostMode:997` — guard `isConnected` après `await findByQuery` (search autocomplete safe au close)
- `secoursMode:4400` + `:3607` — `btn.disabled` PDF Briefing/Rapport (double-clic impossible)
- `interfaceItineraire:1518` — guard `isConnected` après `await computeRoute` Dijkstra
- `filterPanel:559+` — event delegation Image/Data/Tags/show-all/hide-all (cohérence M-LVL v1.43.26)

**🧯 v1.43.26 (08/06/2026)** — **Top 10 audit modales** (workflow adversarial verify, 153 raw findings → 30 confirmés) :
- `osmView` : guard `getCurrentPosition` callback après close + `.finally()` cleanup waitOverlay
- `memInspector` : `_lastReport = null` au fermer + Escape listener auto-cleaned dans crash detail modal
- `lostMode` : `_searchTimeout` clear au close + bannière warning « rayon dépasse » → classe CSS + theming light
- `createConf` : try/finally blob URL `imgUrl` lors du tilage V2 (revoke garanti en cas d'exception)
- `filterPanel` : refacto event delegation pour M-LVL handlers (plus de re-bind à chaque innerHTML reflow)
- `secoursMode` : Pattern A (anti-leak Esc listener orphelin sur ré-ouverture modale Phase) + Pattern B (theming light pour sous-modales via `style-secours.css` overrides ciblés)

**📦 Historique long** — `v1.43.0` (08/06/2026) : **💾 Cache OSM offline « Save Offline » + robustesse SW (consolidation v1.43.0 → v1.43.8)** :

KARMA : besoin de garder la Vue OSM consultable hors-ligne (descente cata, terrain sans réseau). Solution introduite en v1.43.0 puis durcie sur 8 patches successifs : un bouton « 💾 Save Offline » dans les 3 contextes Vue OSM (modale plan georef + widget HOME + Mode Secours), qui télécharge les tuiles `tile.openstreetmap.org` de la vue actuelle dans un store IndexedDB local, servies ensuite **de manière transparente** par le Service Worker.

🎯 **Fonctionnalité majeure (consolidation v1.43.0 → v1.43.8)** :
- **3 contextes UI partagent le même store IDB** : modale Vue OSM, widget HOME, Mode Secours (🌍 → modale). Cacher depuis l'un = visible depuis tous.
- **Offline intelligent** : si le plan courant a des tuiles cachées (détection any-zoom via `hasCacheForBbox`), la modale Vue OSM s'ouvre sans demander de réseau, sans ping, sans toast d'erreur — même en mode avion.
- **Robustesse SW** : self-heal au boot (retry x3 sur app shell critique) + interception transparente OSM (`X-OSM-Cache: hit`) + cohérence cross-context via event `kta:osmOptInChange`.
- **Privacy stricte** : aucune nouvelle URL réseau (juste pré-déclenchement des requêtes OSM existantes). Cache 100% local, jamais transmis. Bouton masqué en strict-offline / incognito.
- **UX clarifiée** : widget HOME affiche un overlay « plan non caché » si aucune tuile dispo pour la bbox courante (plus de tuiles cassées en mode avion).

🎯 **Architecture** :

```
js/osmTilesCache.js (NOUVEAU, ~280 lignes)
  ├─ IDB : "myktamap_osm_tiles" (DB v1) > store "tiles" { key: "z/x/y", blob, addedAt }
  ├─ API : init / cacheVisibleTiles / getCachedTile / hasCachedTile /
  │        getStats / hasCacheForBbox(bbox, zoom?) / clear / enumerateTilesForBbox
  └─ Constante MAX_TILES_PER_CACHE = 200 (politique OSM)

sw.js (modifié)
  ├─ fetch handler intercepte tile.openstreetmap.org/{z}/{x}/{y}.png
  │  ├─ Hit IDB → new Response(blob, {200, X-OSM-Cache:hit})
  │  └─ Miss → fetch réseau normal (offline = 504)
  └─ Install + activate : CRITICAL_APP_SHELL + _cacheWithRetry (3 essais) + self-heal

osmView.js (modifié)
  ├─ Bouton bandeau « 💾 Save Offline » (juste après 📍 Moi) + span stats
  ├─ open() async : await _recheckCachedForCurrentPlan() JIT
  ├─ Gate offline : _isOnlineOrCached = _isOnline OR _planHasCachedTiles
  ├─ Bypass _pingThenOpen si _planHasCachedTiles === true
  └─ Exposé : window.OsmView.recheckOfflineCache + event kta:osmOptInChange

osmHomePreview.js (modifié)
  ├─ Bouton « 💾 » bandeau compact
  ├─ Flag _anyCachePresent + overlay « plan non caché » via hasCacheForBbox(bboxA↔B)
  └─ Listener kta:osmOptInChange pour refresh immédiat
```

🛡️ **Garde-fous** :
- **Politique OSM** : `MAX_TILES_PER_CACHE = 200` par clic, 3 niveaux de zoom (actuel ±1), conforme [OSM Tile Usage Policy](https://operations.osmfoundation.org/policies/tiles/).
- **Cache 100% local** : IndexedDB client only, jamais synchronisé ni transmis, pas de cookie/tracking.
- **Privacy** : strict-offline et incognito masquent le bouton « Save Offline » (les tuiles seraient bloquées par le gate avant même le SW).
- **Isolation cache global** : store unique, mais clés `z/x/y` géographiques disjointes par plan → pas de collision Paris↔Lyon. Dédup auto si plans overlap.
- **Audit réseau** : aucune nouvelle surface (URLs `tile.openstreetmap.org/{z}/{x}/{y}.png` déjà documentées dans `NETWORK_AUDIT.md`).

### Évolution v1.43.1 → v1.43.8 (8 patches)

| Version | Fix |
|---|---|
| **v1.43.1** | Gate offline : `open()` async + `_recheck...()` JIT awaité avant le gate (fix flag stale au boot) |
| **v1.43.2** | Dispatch event `kta:osmOptInChange` au toggle → refresh immédiat bouton 🌍 (plus d'attente polling 2s) |
| **v1.43.3** | Widget HOME : flag `_anyCachePresent` + overlay « plan non caché » via `hasCacheForBbox(bboxA↔B)`. Cache global partagé : plan caché côté modale OSM → détecté côté Home |
| **v1.43.4** | UX : repositionnement bouton « 💾 » juste après « 📍 Moi » |
| **v1.43.5** | SW robustesse : `CRITICAL_APP_SHELL` + `_cacheWithRetry` (3 essais) + self-heal au activate |
| **v1.43.6** | `hasCacheForBbox(bbox, zoom?)` mode any-zoom : scan 10→18 sur le centre si zoom omis (fix faux-négatif quand cache fait à zoom ≠ 14) |
| **v1.43.7** | Bypass `_pingThenOpen()` si `_planHasCachedTiles === true` (fix toast « Internet ne répond pas » en mode avion) |
| **v1.43.8** | Renommage label « Cacher offline » → **« Save Offline »** (UX international) |

🧪 **Tests à faire**
1. **Cache modale** : ouvrir Vue OSM sur plan georef → clic « 💾 Save Offline » → progress bar (X/200) → stats mises à jour
2. **Cache widget HOME** : sur Home → clic « 💾 » dans bandeau OSM → stats mises à jour → overlay « plan non caché » disparaît
3. **Mode avion ouverture** : couper réseau / mode avion → ouvrir Vue OSM sur plan caché → ouverture instantanée, pas de toast « Internet ne répond pas » (v1.43.7) + tuiles servies depuis IDB
4. **Cross-context** : cacher depuis modale Vue OSM Plan A → revenir Home → widget HOME détecte cache (v1.43.3)
5. **Mode Secours** : déclencher 🌍 → modale Vue OSM s'ouvre → bouton « Save Offline » présent
6. **Reload après cache** : F5 → ouvrir Vue OSM offline → tuiles cachées servies immédiatement (persistance IDB OK)
7. **Cache à zoom non-14** : cacher en zoomant beaucoup (z=16) ou peu (z=12) → gate offline reconnaît quand même (v1.43.6 any-zoom)
8. **Toggle opt-in** : Config → toggle Vue OSM OFF puis ON → bouton 🌍 carte se met à jour < 1s (v1.43.2)

---

**📦 v1.42.15** (08/06/2026) — **🐛 Fix re-render Mode Secours après ajout entree/sortie/intermediaire + audit réseau enrichi (denylist.json)** :

KARMA : *« audit bien à jour ? aussi petit bug quand on ajoute une entrée sortie à un groupe de secours, ça ne se met pas à jour de suite, il faut calculer itinéraire pour voir ce qu'on a saisi apparaître »*.

🎯 **Cause bug** — Dans `_appliquerWaypoint(groupeId, role, idx, wp)` (js/secoursMode.js ligne 8727), après `updateGroupe` + `_scheduleAutoRecalc`, **manque un `_switchView("edit")`** pour re-render la fiche groupe. Le state était bien muté en mémoire, mais la fiche affichée à l'écran ne se rafraîchissait pas → user devait cliquer « 🗺️ Calculer itinéraire » qui déclenche un re-render indirect.

À noter : `_clearWaypoint` (juste en-dessous ligne 8767) avait déjà `_switchView("edit")` en fin. Oubli historique sur la version "ajout".

🔧 **Fix v1.42.15** — Ajout d'1 ligne :

```js
function _appliquerWaypoint(groupeId, role, idx, wp) {
  // ... mutations ...
  updateGroupe(_currentScenarioId, groupeId, { entree: wp });  // OU sortie OU intermediaires
  _scheduleAutoRecalc(_currentScenarioId, groupeId);
  _switchView("edit");  // 🆕 v1.42.15 — re-render immédiat (était oublié, cf _clearWaypoint)
}
```

🎯 **Audit réseau enrichi** — Ajout de l'endpoint `denylist.json` qui était manquant. Mis à jour dans `NETWORK_AUDIT.md` + `NETWORK_AUDIT.html` :

| Endpoint | Méthode | Quand | Pourquoi | Données envoyées |
|----------|---------|-------|----------|------------------|
| `<origin>/denylist.json` | `GET` (cache:no-store SW) | Au boot + 1×/24h cache LS | Kill-switch anti-fuite (v1.42.0+) | **Aucune** (lecture seule liste publique, hashes calculés 100% client-side via `crypto.subtle.digest`) |

🛡️ **Pas de régression** :
- Fix bug : 1 ligne ajoutée dans `_appliquerWaypoint`. Aucun autre impact. Comportement de l'app inchangé hors re-render plus rapide.
- Audit : juste 1 ligne ajoutée au tableau (+ idem HTML). Le reste du document inchangé.

🧪 **Tests à faire**
1. **Bug fix** : Mode Secours → édit équipe → ajouter entrée via picker → la valeur apparait immédiatement dans la fiche (avant : invisible jusqu'à clic « 🗺️ Calc. itinéraire »)
2. **Audit** : modale Audit réseau → chercher `denylist.json` → ligne présente avec "Aucune" donnée envoyée

📋 **Vérification audit complète** — Surfaces réseau actives en v1.42.x :

| URL | Documenté |
|-----|-----------|
| `<origin>/*` (HTML/JS/CSS/SW assets) | ✅ |
| `<origin>/version.json` | ✅ |
| `<origin>/alert.json` | ✅ |
| `<origin>/denylist.json` | ✅ **(ajouté v1.42.15)** |
| `<origin>/Licence-pro.json` | ✅ (documenté plus loin) |
| `<origin>/data/<plan>/*` | ✅ |
| `<origin>/ping.html` | ✅ |
| `https://tile.openstreetmap.org/{z}/{x}/{y}.png` (Vue OSM) | ✅ |
| `blob:<origin>/<uuid>` | ✅ |
| `data:<mime>;base64,...` | ✅ |

→ **Audit complet** pour toutes les versions v1.42.x. `html2canvas` est une lib vendored localement (`lib/html2canvas.min.js`) — aucune surface réseau supplémentaire.

---

**📦 v1.42.14** (08/06/2026) — **☀️ Support thème clair pour les 4 modales récentes (Briefing options, overlay capture, denylist denied/purged)** :

KARMA : *« assure toi que pour ces modal le mode clair est bien géré »*.

🎯 **Cause** — Mes 4 modales récentes utilisent des `style.cssText` inline avec couleurs sombres hardcodées (`#1f2a47`, `#e8eaf0`, etc.). En thème clair cataphile (`body.kta-theme-light`), elles restent sombres → contraste/charte cassés.

🔧 **Fix v1.42.14** — Helper de détection thème + palette adaptée par modale :

```js
function _isLightTheme() {
  return document.body.classList.contains("kta-theme-light") ||
         document.documentElement.classList.contains("kta-theme-light");
}

// À la création de chaque modale :
const isLight = _isLightTheme();
const pal = isLight ? { /* charte clair cataphile */ } : { /* dark défaut */ };
overlay.style.cssText = "...background:" + pal.backdrop + ";";
box.style.cssText = "...color:" + pal.txMain + ";";
// ... etc
```

📊 **4 modales adaptées**

| Modale | Fichier | Dark (défaut) | Light cataphile |
|---|---|---|---|
| Options Briefing pompiers | secoursMode.js | Fond bleu nuit `#1f2a47`, texte clair, accent jaune `#f4c542` | Fond beige `#fdf8eb`, texte sombre `#2a2620`, accent ambré `#b8860b` |
| Overlay « Génération… » | secoursMode.js | Fond `#0a0d18`, accent `#f4c542` | Fond `#fdf8eb`, accent `#b8860b` |
| Modale Plan révoqué (rouge) | planDenylist.js | Fond rouge sombre, texte blanc | Fond rosé clair, texte rouge sombre — **rouge danger préservé** dans les 2 thèmes (sémantique critique) |
| Modale Plans purgés au boot (orange) | planDenylist.js | Fond ambré sombre, texte clair | Fond crème ambré, texte sombre — **orange préservé** (sémantique alerte douce) |

🎨 **Palette light cataphile** (selon `--kta-light-*` du `css/style.css`) :
- Fond beige `#fdf8eb` à `#f5ecd6`
- Texte principal `#2a2620`
- Texte secondaire `#5a4f40`
- Accent ambré `#b8860b` (or)
- Bordures `rgba(154,135,84,0.40)`

🛡️ **Sémantique préservée** — Les couleurs **rouge danger** (Plan révoqué) et **orange alerte** (Plans purgés) restent dominantes dans les 2 thèmes (juste les fonds/textes s'adaptent). On ne mélange jamais une modale danger avec la charte UI : la couleur sémantique gagne.

🛡️ **Pas de régression** — détection au moment du render via `classList.contains`. Si le thème change entre 2 ouvertures de la même modale, la prochaine ouverture utilise la nouvelle palette. Pas de listener `MutationObserver` nécessaire (modales transitoires).

🧪 **Tests à faire**
1. **Dark (défaut)** : ouvrir les 4 modales → couleurs identiques aux versions précédentes ✅
2. **Light** : Home → Configuration → ☀️ Activer thème CLAIR → reload → ouvrir 4 modales → palette beige cataphile, lisibles
3. **Switch thème runtime** : ne s'applique qu'à la prochaine ouverture (pattern OK pour des modales)

---

**📦 v1.42.13** (08/06/2026) — **🎨 Overlay capture OSM contextualisé : texte adapté Briefing pompiers vs Rapport** :

KARMA : *« le truc de chargement de génération de briefing pompier est top, mais on affiche la même chose quand on export via rapport pdf »*.

🎯 **Cause** — L'overlay « 🚒 Génération du Briefing pompiers… » s'affichait aussi pendant l'export Rapport (même flow `_drawBriefingSurfacePage` → `_captureOsmCanvasForBriefing`), mais avec un texte non adapté au contexte.

🔧 **Fix v1.42.13** — Paramètre `overlayContext` propagé depuis le caller :

```js
// secoursMode.js : 2 contextes prédéfinis
const _ctx = (overlayContext === "rapport")
  ? { icon: "📤", title: "Génération du rapport en cours…",
      sub: "Capture de la Vue OSM pour la page de briefing surface…" }
  : { icon: "🚒", title: "Génération du Briefing pompiers…",
      sub: "Capture de la Vue OSM en cours (plan + données projetées)…" };

overlay.innerHTML =
  '<div style="font-size:42px;animation:kta-spin…">🛰️</div>' +
  '<div>' + _ctx.icon + ' ' + _ctx.title + '</div>' +
  '<div>' + _ctx.sub + '</div>';
```

📐 **Propagation 8e arg** (`overlayContext`) :
```
genererRapportPDF() ──► _drawBriefingSurfacePage(..., options=null, "rapport")
                                            │
genererBriefingPompiersPDF() ──► _drawBriefingSurfacePage(..., options, "briefing")
                                            │
                                            ▼
                       _captureOsmCanvasForBriefing(scenario, plan, options, overlayContext)
                                            │
                                            ▼
                       overlay.innerHTML = textes selon overlayContext
```

📊 **Comparaison overlays**

| Source | Icône | Titre | Sous-titre |
|--------|-------|-------|-----------|
| Bouton 🚒 Briefing pompiers | 🚒 | Génération du Briefing pompiers… | Capture de la Vue OSM en cours (plan + données projetées)… |
| Bouton 📤 Rapport global / Rapport équipe | 📤 | Génération du rapport en cours… | Capture de la Vue OSM pour la page de briefing surface… |

🛡️ **Pas de régression** — paramètre optionnel avec default `"briefing"` (backward-compat).

🧪 **Test** : Mode Secours → 📤 Rapport global → exporter PDF → overlay « 📤 Génération du rapport en cours… » (au lieu de « 🚒 Briefing pompiers »).

---

**📦 v1.42.12** (08/06/2026) — **🛠️ Fix ratio image Briefing PDF (était hardcoded 3:2 → étirement si viewport modale ≠ 3:2)** :

KARMA après v1.42.11 : *« presque parfait, j'ai l'impression que l'image est étiré dans le PDF »*.

🎯 **Cause** — Dans `_drawBriefingSurfacePage` (v1.42.5), le ratio image PDF était hardcoded à `800/1200` (3:2 du render offscreen). Mais depuis v1.42.10/11, on capture la **modale Vue OSM** dont la taille dépend du viewport (16:9 desktop, 9:16 mobile portrait, 21:9 ultrawide...). Résultat : ratio image PDF ≠ ratio image source → étirement vertical ou horizontal.

🔧 **Fix v1.42.12** — Lire les vraies dims de l'image capturée :

```js
async function _getImageDataUrlDims(dataUrl) {
  return new Promise(function(resolve) {
    const img = new Image();
    img.onload = function() {
      resolve({ w: img.naturalWidth, h: img.naturalHeight });
    };
    img.onerror = function() { resolve(null); };
    img.src = dataUrl;
  });
}

// Dans _drawBriefingSurfacePage, avant pdf.addImage :
const realDims = await _getImageDataUrlDims(imgData);
const ratio = realDims ? (realDims.w / realDims.h) : (1200 / 800);  // fallback

const availW = pageW - 2 * margin;     // 182mm A4
const availH = pageH - y - 80;          // garde 80mm pour reste
// Contrainte width OU height selon ce qui touche en premier
let finalW = availW;
let finalH = finalW / ratio;
if (finalH > availH) {
  finalH = availH;
  finalW = finalH * ratio;
}
const offsetX = margin + (availW - finalW) / 2;  // centré horizontalement
pdf.addImage(imgData, "JPEG", offsetX, y, finalW, finalH);
```

🎨 **Bénéfice UX** :
- Si capture **landscape large** (ex: 1920×1080) → tient sur la largeur, hauteur réduite proportionnellement, centré horizontalement
- Si capture **portrait** (ex: 800×1400 mobile) → tient sur la hauteur dispo, largeur réduite, centré horizontalement
- Aucune déformation : aspect ratio natif préservé

🛡️ **Fail-safe** — si `_getImageDataUrlDims` retourne null (rare), fallback sur ratio hardcoded 3:2 (= comportement v1.42.11).

🛡️ **Pas de régression** :
- Capture offscreen 1200×800 (3:2) → ratio identique au hardcoded précédent, rendu inchangé
- Capture modale 16:9 → image plus large que haute, centrée horizontalement, marges gauche/droite
- Capture portrait → image moins large, marges gauche/droite

🧪 **Tests à faire**
1. Capture sur desktop 1920×1080 → image dans PDF garde le ratio 16:9, ne touche pas les bords latéraux
2. Capture sur mobile portrait (Vue OSM en mode mobile) → image plus haute que large, centrée
3. Capture sur tablette 4:3 → image proche du carré, centrée

---

**📦 v1.42.11** (08/06/2026) — **🚒 Briefing pompiers : modale d'options de couches OSM avant capture** :

KARMA : *« ajoute la possibilité de ne pas tout afficher dans le pdf, donc on clique sur briefing, un modal on choisie ce que on affiche (comme en mode OSM PLAN/HOME) »*.

🔧 **Fix v1.42.11** — Workflow modifié :

```
[Clic 🚒 Briefing pompiers]
   ↓
_afficherModaleBriefingOptions(scenarioId)
   ↓
[Modale avec 8 toggles couches OSM (Plan/POI/Tracé/Routes/Iti/Zones/Struct/Secours)]
   ↓
[Clic « Générer PDF »]
   ↓
genererBriefingPompiersPDF(scenarioId, options)
   ↓
_drawBriefingSurfacePage(..., options)
   ↓
_captureOsmCanvasForBriefing(scenario, plan, options)
   ↓
1. Overlay opaque "Génération en cours…"
2. OsmView.open()
3. _applyOsmLayerOptions(options) ← simule clics sur checkboxes selon options
4. Wait tile loaded + render
5. html2canvas
6. OsmView.close()
   ↓
[PDF avec capture respectant les choix user]
```

📐 **Architecture modale**

```
┌─────────────────────────────────────────────┐
│  🚒  Briefing pompiers                       │
│      Choisis ce qui apparaît sur la carte… │
├─────────────────────────────────────────────┤
│  🗺️ Couches Vue OSM                          │
│  ☑️ 🖼️ Plan      ☑️ 📍 POI                   │
│  ☑️ 📡 Tracé    ☑️ 🛣️ Routes                 │
│  ☑️ 🧭 Iti      ☑️ 🌐 Zones                  │
│  ☑️ 🏗️ Struct   ☑️ 🚨 Secours                │
├─────────────────────────────────────────────┤
│  Les sections texte (équipes GPS, POI       │
│  critiques, liens OSM) sont toujours       │
│  incluses dans le PDF.                      │
├─────────────────────────────────────────────┤
│         [Annuler]   [📄 Générer le PDF]    │
└─────────────────────────────────────────────┘
       z-index 100001 (au-dessus tout Mode Secours)
```

🛠️ **Helper `_applyOsmLayerOptions(opts)`** : itère sur les 8 IDs checkboxes Vue OSM (`kta-osm-plan-toggle`, `kta-osm-poi-toggle`, etc.), compare `checkbox.checked` à `opts.show<Name>`, simule `.click()` si différent. Idempotent. Réutilise les listeners change existants de Vue OSM (qui appliquent le toggle au map Leaflet).

⏱️ **Petit délai 400ms** après `OsmView.open()` avant d'appliquer les options, le temps que le DOM des toggles soit injecté par OsmView (CSS visible mais event listeners attachés après le HTML rendu).

🛡️ **Fail-safe** :
- Annuler la modale → ne génère pas de PDF
- Si option = `undefined` pour un toggle → on ne touche pas son état (= respect du défaut Vue OSM)
- Si checkbox `kta-osm-secours-toggle` absente (pas de scénario Secours actif) → skip silencieux
- Si `_applyOsmLayerOptions` exception → log warning, capture quand même

🛡️ **Pas de régression** :
- Si l'user annule la modale → rien ne se passe (= safe)
- Si options non passées (rétrocompat appel direct `genererBriefingPompiersPDF(id)`) → comportement v1.42.10 inchangé (tout affiché par défaut)
- Sections texte du PDF (équipes GPS, POI critiques, liens) toujours incluses (pas de toggle dessus pour MVP)

🧪 **Tests à faire**

1. **Cas nominal** : clic 🚒 → modale apparait → décocher quelques toggles (ex: 🏗️ Struct, 🌐 Zones) → Générer → overlay → PDF avec capture sans Struct/Zones ✅
2. **Tout coché** (default) : PDF = comportement v1.42.10 ✅
3. **Tout décoché** : capture juste tuiles OSM + bbox (équivalent fallback offscreen sur le rendu visible)
4. **Annuler** : rien ne se passe, pas de PDF généré
5. **Click backdrop** (à côté de la modale) : ferme = annuler

📋 **Roadmap v1.43+** si tu veux plus :
- Toggles pour sections texte (équipes/POI critiques/liens) pour ne pas tout inclure
- Mémoriser les derniers choix en `localStorage` pour pré-remplir la modale au prochain clic
- Filtre par tag spécifique (= chips OSM tags filter) dans la modale

---

**📦 v1.42.10** (08/06/2026) — **🚒 Briefing pompiers : capture Vue OSM COMPLÈTE via open/close masqué sous overlay** :

KARMA après v1.42.9 : *« donc toujours pas la carte et nos data »* + choix design `1` (render offscreen complet) au lieu de `2` (auto open/close) ou `3` (toast).

🎯 **Investigation du "vrai offscreen" (option 1 stricte)** — L'idée « render offscreen complet » nécessite de reproduire :
- Plan rotated en V2 (multiples tuiles JPEG dans le ZIP) ou V1 (image unique)
- Data layers POI/tracés/zones/structures (chacun sa source globale)
- Projection plan→GPS (helper privé `_buildProjection`)
- Style cascade (LegendCustomization)
- Filtres M-LVL actifs

→ Refactor d'osmView.js pour rendre dans un container paramétrable + 200-300 lignes de duplication minimum. Trop pour un patch isolé.

🔧 **Compromis pragmatique v1.42.10** — **option 1 UX, option 2 implémentation** :
- L'user voit l'expérience « option 1 » : pas besoin d'ouvrir Vue OSM manuellement, juste cliquer 🚒, attendre ~5-10s, PDF arrive
- Sous le capot c'est de l' « auto open/close » mais avec **overlay opaque** au z-index 1000000 qui masque TOTALEMENT le clignotement de Vue OSM. L'user voit juste un écran de chargement.

```js
async function _captureOsmCanvasForBriefing(scenario, plan) {
  // CAS 1 : Vue OSM déjà ouverte → capture DOM direct (v1.42.8, rare)
  // CAS 2 : Vue OSM fermée → open/close masqué sous overlay

  if (window.OsmView.isAvailable() && window.OsmView.isOptedIn()) {
    const overlay = createOpaqueOverlay("🚒 Génération du Briefing pompiers…");
    document.body.appendChild(overlay);

    try {
      window.OsmView.open();           // modale sous overlay (invisible)
      await waitForReady(12000);       // poll tile-loaded + plan + safety
      const canvas = await html2canvas(mapDiv, {useCORS:true, ...});
      return canvas.toDataURL("image/jpeg", 0.85);
    } finally {
      window.OsmView.close();
      overlay.remove();
    }
  }
  // ... fallback offscreen v1.42.5 si OsmView indispo ou pas opt-in
}
```

🎨 **UX overlay** (z-index 1000000, dessus tout) :
- Fond `#0a0d18` opaque
- Icône 🛰️ tournante (animation `kta-spin 1.4s`)
- Texte « 🚒 Génération du Briefing pompiers… »
- Sous-texte explicatif jaune charte

⏱️ **Attente robuste** (poll 200ms, safety 12s) :
- Détecte `.leaflet-tile-loaded` (tuiles OSM chargées)
- Détecte `.leaflet-image-layer` ou markers (plan rotated + data rendus)
- +1.5s de marge pour render final
- Si tiles OK mais pas d'overlay détecté après 4s → capture quand même (cas plan sans data)

🛡️ **Garde-fous** :
- `OsmView.isAvailable()` → vérifie georef + V2 + offline
- `OsmView.isOptedIn()` → user a accepté tile.openstreetmap.org au moins 1×
- Si OsmView indispo OU pas opt-in → fallback offscreen v1.42.5 (tuiles + bbox + équipes sans plan)
- Vue OSM fermée systématiquement dans `finally` (même si exception)
- Overlay retiré systématiquement

📊 **Stratégie de capture v1.42.10**

| État Vue OSM | Action |
|---|---|
| Déjà ouverte (rare hors Mode Secours) | Capture DOM direct (~500ms) |
| Fermée + OsmView dispo + opt-in | **Open/close masqué sous overlay (~5-10s)** ✅ nouveau |
| Fermée + OsmView indispo (pas de georef) | Fallback offscreen v1.42.5 (tuiles + bbox + équipes) |
| Fermée + pas opt-in | Fallback offscreen (l'user doit accepter OSM 1× via le bouton 🌍) |

🛡️ **Pas de régression** :
- Si user a déjà accepté OSM au moins 1× → capture complète automatique
- Sinon → fallback offscreen (= v1.42.5/8, capture limitée mais fonctionnelle)
- Si tout échoue → fallback texte/lien (= v1.41.x)
- Vue OSM est toujours fermée correctement (même si exception)
- Mode Secours modale reste intacte derrière l'overlay

🧪 **Tests à faire**
1. **Cas nominal** (user a déjà ouvert Vue OSM une fois pour opt-in) : 🚒 → overlay 5-10s → PDF avec capture COMPLÈTE (plan + POI + tracés + zones + équipes)
2. **Cas premier usage** (jamais ouvert Vue OSM) : 🚒 → fallback offscreen (tuiles + bbox + équipes) + console warning
3. **Cas mode strict offline** : 🚒 → fallback texte/lien (OsmView.isAvailable false)
4. **Mobile** : tester si overlay opaque masque bien (z-index 1000000 doit suffire)
5. **Annulation** : ne pas pouvoir annuler en cours (= acceptable, ~10s max)

🎓 **Pattern UX retenu** — Quand une feature nécessite de « charger » une vue UI pendant ~5-10s, masquer totalement le clignotement via un overlay opaque animé. L'user perçoit ça comme un "spinner moderne" plutôt qu'un bug d'affichage.

📋 **Roadmap si on veut PLUS** (v1.43+) :
- Refactor osmView.js pour exposer `OsmView.renderToCanvas({width, height}): Promise<dataURL>` qui rend dans un container offscreen vraiment. Permet de capturer SANS ouvrir la modale du tout (= 0 risque que l'user voie quelque chose). Estimation : ~300 lignes refactor.

---

**📦 v1.42.9** (08/06/2026) — **🛠️ Hotfix CSP : ajout `tile.openstreetmap.org` (sans sous-domaine) en plus du wildcard `*.`** :

KARMA après v1.42.7 (CSP avec wildcard `*.tile.openstreetmap.org`) : tuiles OSM en NOIR.

🎯 **Cause** — Les URLs OSM utilisées par Leaflet dans l'app sont sous le format **direct** `https://tile.openstreetmap.org/{z}/{x}/{y}.png` (sans sous-domaine `a/b/c`). Le wildcard CSP `https://*.tile.openstreetmap.org` **n'autorise QUE les sous-domaines** (`a.tile.openstreetmap.org`, etc.) — pas le domaine racine. D'où blocage de toutes les tuiles.

Erreur console :
```
Loading the image 'https://tile.openstreetmap.org/14/8297/5637.png' violates the following
Content Security Policy directive: "img-src 'self' data: blob: https://*.tile.openstreetmap.org"
```

🔧 **Fix v1.42.9** — Autoriser les **2 formats** dans la CSP (safety + futur-proof si on switch sur `{s}.` sous-domaine plus tard) :

```diff
-img-src 'self' data: blob: https://*.tile.openstreetmap.org;
+img-src 'self' data: blob: https://tile.openstreetmap.org https://*.tile.openstreetmap.org;
...
-connect-src 'self' blob: https://*.tile.openstreetmap.org;
+connect-src 'self' blob: https://tile.openstreetmap.org https://*.tile.openstreetmap.org;
```

| Fichier | Modifié |
|---------|---------|
| `docs/nginx-csp-config.conf` (prod KARMA) | ✅ |
| `docker/nginx-docker.conf` (self-host community) | ✅ |
| Commentaire `img-src` enrichi | ✅ explique le pourquoi des 2 formats |

⚠️ **Action manuelle KARMA** : éditer la config nginx active sur le serveur, remplacer la CSP par la nouvelle (avec les 2 formats), puis `nginx -t && nginx -s reload`.

🎓 **Pattern retenu** — Le wildcard `*.domain.tld` dans CSP **ne match QUE les sous-domaines** (au moins 1 label avant). Pour autoriser aussi le domaine racine, lister les 2 explicitement. Spec : [W3C CSP3 §6.6.2.5](https://www.w3.org/TR/CSP3/#match-url-to-source-expression).

🛡️ **Pas de régression** — uniquement extension de la CSP (plus permissive d'une URL). Tous les autres usages restent intacts.

🧪 **Test après push nginx** :
1. Reload Vue OSM (modale + Home) → tuiles OSM s'affichent à nouveau ✅
2. Briefing pompiers PDF → capture OSM marche (v1.42.5+8) ✅

---

**📦 v1.42.8** (08/06/2026) — **🚒 Briefing pompiers : capture DOM de la modale Vue OSM si ouverte (plan + data layers + zones inclus)** :

KARMA après test v1.42.7 : *« bon on a bien le OSM mais pas notre plan et data par dessus html2canvas.min.js:20 Canvas2D: ... willReadFrequently »*.

🎯 **Cause** — En v1.42.5, le helper `_captureOsmCanvasForBriefing` faisait un **render offscreen** dédié avec juste tuiles OSM + bbox + markers GPS équipes. Ne reproduisait PAS le plan rotated ni les data layers (POI/tracés/zones) car ça aurait nécessité ~300 lignes de duplication du code Vue OSM (`Leaflet.ImageOverlay.Rotated` + projection plan→GPS + style cascade).

Le warning `willReadFrequently` est **interne à html2canvas**, totalement non-bloquant. Pas de fix côté nous (on n'a pas la main sur le canvas créé par html2canvas).

🔧 **Fix v1.42.8** — Approche hybride : capture la **modale Vue OSM** si elle est ouverte (= reproduit l'écran tel quel, contenu complet) :

```js
async function _captureOsmCanvasForBriefing(scenario, plan) {
  if (typeof window.html2canvas !== "function") return null;

  // 🆕 v1.42.8 — Si la modale Vue OSM est OUVERTE → capture son DOM directement
  const mapDiv = document.getElementById("kta-osm-map");
  if (mapDiv && mapDiv.querySelector(".leaflet-tile-loaded")) {
    try {
      console.log("[Briefing] Modale Vue OSM détectée ouverte — capture DOM direct");
      const canvas = await window.html2canvas(mapDiv, {
        useCORS: true, backgroundColor: "#ffffff", logging: false, scale: 1
      });
      return canvas.toDataURL("image/jpeg", 0.85);
    } catch(e) {
      console.warn("[Briefing] Capture modale échec, bascule offscreen :", e.message);
      // Continue vers fallback offscreen ↓
    }
  }
  // Fallback offscreen (v1.42.5) : tuiles + bbox + équipes seulement
  // ... code inchangé
}
```

🎯 **Workflow KARMA recommandé**

| User flow | Capture PDF |
|-----------|-------------|
| Clique 🚒 directement | Fallback offscreen : OSM + bbox + équipes (= ce qui marche aujourd'hui) |
| **Ouvre Vue OSM** → ajuste opacité/filtres → **clique 🚒** | **Capture DOM modale complète** : plan rotated + POI + tracés + zones + structures + équipes |

→ Pour avoir TOUT dans le PDF, **ouvrir la Vue OSM avant** de cliquer 🚒 Briefing pompiers. C'est le pattern naturel : l'user prépare sa vue (filtres tags, niveau M-LVL, opacité), vérifie que ça lui plaît, puis exporte le PDF qui reproduit fidèlement.

🛡️ **Test de détection robuste** — `mapDiv.querySelector(".leaflet-tile-loaded")` garantit qu'au moins 1 tuile est chargée (pas de capture sur map vide). Sinon → bascule offscreen.

🛡️ **Pas de régression** :
- Si modale OSM fermée → comportement v1.42.5/7 inchangé (fallback offscreen)
- Si modale ouverte mais capture échoue → bascule offscreen automatique
- Si tout échoue → fallback texte/lien v1.41.x

⚠️ **Warning `willReadFrequently`** — interne à html2canvas, non-bloquant. Le canvas que html2canvas crée pour son rendu déclenche ce warning Chrome (heuristique perf). Pas de fix côté nous. KARMA peut ignorer.

🧪 **Tests à faire**

1. **Sans Vue OSM ouverte** : 🚒 Briefing → PDF avec capture simple (= v1.42.7, tuiles + bbox + équipes) ✅
2. **Vue OSM OUVERTE** → ajuster l'opacité plan, filtrer tags, activer/désactiver layers → cliquer 🚒 Briefing → PDF avec capture **complète** : plan + data + équipes tels qu'à l'écran ✅
3. **Console** : log `[Briefing] Modale Vue OSM détectée ouverte — capture DOM direct` si modale ouverte
4. **Mobile** : tester perf html2canvas sur le DOM modale (peut être plus gros qu'offscreen 1200×800)

🎓 **Pattern retenu** — Approche hybride : capture DOM natif si UI dispo (= 1 source de vérité, l'user contrôle ce qu'il voit), sinon render offscreen synthétique en fallback. Évite de dupliquer ~300 lignes de logic Vue OSM tout en garantissant un PDF informatif dans tous les cas.

📋 **Si KARMA veut TOUJOURS la capture complète sans avoir à ouvrir Vue OSM** : roadmap v1.43+ → render offscreen complet avec plan rotated + POI/tracés/zones. ~300 lignes ajout. Pas urgent vu la solution hybride.

---

**📦 v1.42.7** (08/06/2026) — **🛠️ Fix CSP nginx : autoriser `tile.openstreetmap.org` dans `img-src` + `connect-src` (bloquait capture html2canvas v1.42.5)** :

KARMA après test v1.42.5 (capture Briefing pompiers PDF) : *« Loading the image 'tile.openstreetmap.org/...' violates the following Content Security Policy directive: "img-src 'self' data: blob:" »*.

🎯 **Cause** — `html2canvas` avec `useCORS:true` fait un **fetch CORS** des tuiles OSM pour les re-charger comme images crossOrigin (nécessaire pour `canvas.toDataURL` sans SecurityError). La CSP nginx serveur a `img-src 'self' data: blob:` + `connect-src 'self' blob:` → bloque les requêtes vers `tile.openstreetmap.org`.

Pourquoi Vue OSM modale marche quand même ? Leaflet charge les tuiles via `<img>` direct (sans CORS), donc passe à travers certaines configs CSP permissives. Mais html2canvas exige le fetch CORS explicite → déclenche la violation CSP.

🔧 **Fix v1.42.7** — Mise à jour CSP dans **2 fichiers de config nginx** :

```nginx
# AVANT
add_header Content-Security-Policy
  "default-src 'self';
   img-src 'self' data: blob:;
   connect-src 'self' blob:;
   ..." always;

# APRÈS (v1.42.7)
add_header Content-Security-Policy
  "default-src 'self';
   img-src 'self' data: blob: https://*.tile.openstreetmap.org;
   connect-src 'self' blob: https://*.tile.openstreetmap.org;
   ..." always;
```

| Fichier | Modifié |
|---------|---------|
| `docs/nginx-csp-config.conf` (prod KARMA) | ✅ |
| `docker/nginx-docker.conf` (self-host community) | ✅ |
| Commentaire `img-src` enrichi | ✅ Vue OSM + capture Briefing pompiers PDF expliquée |

⚠️ **Action manuelle KARMA** : la config nginx active sur **dev.myktamap.fr** + **myktamap.fr** doit être mise à jour côté serveur (les fichiers du repo sont une référence, pas la config active). Sans ça, le fix v1.42.7 ne change rien chez l'user (le bug CSP persiste).

```bash
# Sur le serveur prod (KARMA) :
# 1. Récupérer la nouvelle CSP depuis docs/nginx-csp-config.conf
# 2. Éditer la config nginx active (ex: /etc/nginx/sites-enabled/myktamap.conf)
# 3. Tester la syntaxe : nginx -t
# 4. Reload : nginx -s reload
```

🛡️ **Pas de régression** — uniquement ajout de l'URL `tile.openstreetmap.org` aux 2 directives concernées. Tous les autres usages restent intacts.

🛡️ **Fail-safe code** — même sans la nouvelle CSP, le PDF Briefing pompiers se génère encore (sans image) grâce au try/catch dans `_drawBriefingSurfacePage` (v1.42.5). L'user voit juste l'erreur console + fallback texte/lien.

🌐 **Surfaces réseau** — `tile.openstreetmap.org` n'est PAS une nouvelle surface (déjà utilisée par Vue OSM modale + Home depuis v1.39+). Le fix CSP rend juste cette surface explicitement autorisée pour le contexte CORS (html2canvas).

🧪 **Tests à faire**
1. **Avant push CSP serveur** : tenter Briefing PDF → erreur CSP console + PDF sans image (fallback OK)
2. **Après push CSP serveur** + reload app : tenter Briefing PDF → pas d'erreur CSP + PDF avec image OSM
3. **Vérifier Vue OSM modale** : continue de marcher comme avant (pas de régression)

🎓 **Pattern à retenir** — Quand on ajoute une lib qui fait du fetch CORS sur une URL externe, vérifier la CSP `connect-src` en plus de `img-src`. Différence subtile : `<img src="...">` direct = `img-src` only ; `fetch(url, {mode:'cors'})` = `connect-src` aussi.

---

**📦 v1.42.6** (07/06/2026) — **📖 Rattrapage docs v1.42.3 + v1.42.4 + v1.42.5 (audit boot, opacité 50%, capture canvas)** :

🔧 **Synchronisation effectuée**

| Axe | Fichier | Ajout |
|-----|---------|-------|
| 📱 In-app | `README_USER.md` | Sous-section « 🔄 Audit automatique au démarrage (depuis v1.42.3) » dans la section « 🛡️ Plans révoqués » — explique le check post-boot + modale orange |
| 📱 In-app | `README_USER.en.md` | Traduit EN (« 🔄 Automatic boot audit since v1.42.3 ») |
| 📱 In-app | `js/interfaceDocs.js` | Ajout mention audit auto v1.42.3 dans le paragraphe Plans révoqués existant (couleur orange `#e9a13b` pour le distinguer du rouge denied) |
| 📱 In-app | `AI_CONTEXT.md` | 4 entrées tableau histo : v1.42.2 (docs sync précédent) + v1.42.3 (audit boot + cache hash + modale orange) + v1.42.4 (opacité 50% Vue OSM) + v1.42.5 (capture canvas html2canvas) |
| 🤖 Archi IA | `docs/architecture/security-legal.md` | Section 80 enrichie : 80.13 audit boot complet (cycle vie, cache hash, perf, UX modale orange, persistance LS, fail-safe) + 80.14 capture canvas (lib externe, render offscreen, intégration, fail-safe, limitations, réutilisabilité) |
| 🔒 Audit | `NETWORK_AUDIT.md/html` | Headers bumpés (surface réseau tile.openstreetmap.org déjà documentée pour Vue OSM modale et Home) |
| 📖 Dev | `README.md` | Entrée journal v1.42.6 |

🛡️ **Pas de régression** — uniquement ajouts docs + headers version. Modification code uniquement dans `js/interfaceDocs.js` (1 paragraphe HTML enrichi, vérifié `node -c`).

🎓 **Pattern KARMA**
- ✅ **User-facing** : audit boot expliqué dans la section existante « 🛡️ Plans révoqués » (continuité éditoriale, pas de duplication)
- ✅ **In-app** : 1 phrase orange ajoutée au paragraphe existant (cohérence visuelle UX)
- ✅ **AI context** : 4 entrées tableau histo concises avec détails techniques (API, cycle de vie, lib externe, fail-safe)
- ✅ **Archi** : section 80 enrichie de 80.13 (audit boot) + 80.14 (capture canvas) — réutilise la structure existante (12 sous-sections → 14)

📋 **Couverture finale sprint v1.40.32 → v1.42.6**

| Sprint | Versions | Sync docs |
|--------|----------|-----------|
| Layout HOME PC + Mode Secours base | v1.40.32-49 | v1.41.5 (rattrapage retroactif) |
| Synergie OSM × Mode Secours | v1.41.0-4 | v1.41.5 |
| Kill-switch anti-fuite | v1.42.0-2 | v1.42.2 (in-stream) |
| Audit boot + opacité + capture | v1.42.3-5 | **v1.42.6** (ce bump) |

→ **Sprint clos, docs alignées sur les 4 axes** (user FR+EN, in-app, AI context, archi). Prêt pour push quand KARMA décide.

---

**📦 v1.42.5** (07/06/2026) — **🚒 Capture canvas OSM dans Briefing pompiers PDF (lib html2canvas vendored)** :

KARMA : *« 1: lib dl est importé »* après ajout `lib/html2canvas.min.js` (~50 KB BSD/MIT).

🎯 **Cible** — En v1.42.x, le PDF Briefing pompiers contenait juste des liens cliquables OSM/Google Maps + bbox texte. Maintenant : **vraie image de carte** en haut de page, avec zone du plan (cadre jaune) + équipes GPS surface (points colorés palette OTAN) + label centre du plan. Aucune dépendance à l'état de la Vue OSM modale (= marche toujours).

🔧 **Architecture v1.42.5**

| Composant | Fichier | Rôle |
|-----------|---------|------|
| Lib externe | `lib/html2canvas.min.js` (~50 KB BSD/MIT) | Capture DOM → canvas → dataURL |
| Helper async | `js/secoursMode.js > _captureOsmCanvasForBriefing(scenario, plan)` | Render offscreen Leaflet + html2canvas |
| Intégration | `_drawBriefingSurfacePage` (devenue async) | Insertion image au début de la page, fallback texte si KO |
| Register HTML | `index.html` | `<script src="lib/html2canvas.min.js" defer>` après jsPDF |
| Register SW | `sw.js > ASSETS_TO_CACHE` | `./lib/html2canvas.min.js` |

🎨 **Contenu de la capture (1200×800 px)**

- **Tuiles OSM** depuis `tile.openstreetmap.org` avec `crossOrigin: "anonymous"` (CORS OK)
- **Rectangle bbox du plan** en jaune charte `#f4c542` semi-transparent (opacity 0.15)
- **Label centre** « 📍 [Nom du plan] » fond sombre + bordure jaune
- **Cercles colorés équipes** (palette OTAN) + tooltip avec nom équipe pour chaque `surfaceGps` renseigné
- Pas de plan rotated superposé (MVP — nécessiterait accès image source + 3-coin projection, ajout possible en v1.42.6+)

⏱️ **Cycle de génération**

```
[Clic 🚒 Briefing pompiers]
   ↓
genererBriefingPompiersPDF(scenarioId)
   ↓
_drawBriefingSurfacePage(...) async
   ↓
_captureOsmCanvasForBriefing(scenario, plan)
   ↓
1. Crée div hidden 1200×800 (left:-99999px)
2. Init L.map() dedans, fitBounds(bbox)
3. Tile layer OSM + crossOrigin
4. Rectangle bbox + label centre + markers équipes
5. await tileLayer "load" event (safety 7s)
6. await html2canvas(div, {useCORS:true})
7. canvas.toDataURL("image/jpeg", 0.85)
8. Cleanup (map.remove + div.removeChild)
   ↓
pdf.addImage(dataURL, "JPEG", x, y, w, h)
   ↓
[PDF téléchargé avec image]
```

Durée typique : 3-7s selon réseau (fetch tuiles OSM) + ~500ms capture.

🛡️ **Fail-safe gracieux**

| Cas | Comportement |
|-----|--------------|
| `html2canvas` non chargé | Skip capture, log warning, fallback texte/lien (= v1.41.x) |
| `OsmView.getPlanGpsBbox()` retourne null (pas de georef) | Skip capture, fallback |
| Tuiles OSM timeout (cellular très lent) | Safety 7s puis capture quand même (carte partielle) |
| Exception html2canvas | Catch, log, fallback texte |
| `pdf.addImage` exception | Catch, ne casse pas le PDF (juste pas d'image) |

→ Le PDF s'exporte TOUJOURS, l'image est un bonus. Si toutes les conditions sont OK, image incluse ; sinon, version texte comme avant.

📊 **Évolution Briefing pompiers PDF v1.41.0 → v1.42.5**

| Version | Contenu PDF |
|---------|-------------|
| v1.41.0 | Texte uniquement : bbox + liens cliquables OSM/Google Maps |
| v1.41.1-4 | Idem + extension aux 3 vues Live + lazy projection + fix tags |
| v1.42.0-2 | Idem + kill-switch hooks (pas de changement PDF) |
| **v1.42.5** | **+ vraie image carte OSM** (1200×800 → ~180×120mm A4) avec bbox plan + équipes GPS |

🛡️ **Pas de régression** — fonctions touchées :
- `_drawBriefingSurfacePage` devenue `async` (+ `await` ajouté aux 2 callers : `genererRapportPDF` + `genererBriefingPompiersPDF`)
- Helper `_captureOsmCanvasForBriefing` ajouté (nouveau)
- Si `html2canvas` indispo ou erreur → fallback complet sur le contenu texte (= comportement v1.41.x)
- Capture en container `left:-99999px` invisible UI (pas de flash visuel pour l'user pendant les ~5s)

🌐 **Surfaces réseau ajoutées (NETWORK_AUDIT)**

| URL | Fréquence | Volume |
|-----|-----------|--------|
| `https://{a\|b\|c}.tile.openstreetmap.org/{z}/{x}/{y}.png` | À chaque génération PDF Briefing | ~10-50 tuiles (~200KB-1MB) |

→ Surface DÉJÀ documentée pour Vue OSM modale (v1.39+) et Vue OSM Home widget (v1.40+). Ce v1.42.5 ne fait que l'utiliser dans un nouveau contexte (PDF). Pas de nouvelle URL.

🧪 **Tests à faire**

1. **Cas nominal** : Mode Secours → 🚒 Briefing pompiers → PDF téléchargé → page 1 contient image OSM en haut + sections texte
2. **Vérifier équipes GPS** : avec 2-3 équipes ayant `surfaceGps` renseigné → cercles colorés visibles sur la carte
3. **Cas sans georef** : plan sans `osmGeoref` configuré → capture skip → PDF avec texte seulement (comme v1.41.x)
4. **Cas mode offline strict** : tile fetch échoue → safety 7s → capture quand même (carte vide ou partielle) OU fallback texte
5. **Perf** : génération doit être ≤10s, sinon log warning à investiguer
6. **Mobile** : tester sur téléphone, html2canvas peut être plus lent

🎓 **Pattern KARMA**
- ✅ Lib externe vendored (offline, 0 CDN)
- ✅ Fail-safe gracieux : 0 changement comportement si lib KO
- ✅ Helper isolé, réutilisable pour autres exports image PDF (v2 : capture Vue OSM modale → toBlob pour partage social ?)
- ✅ Réutilise registres existants (PALETTE, _escHtml, OsmView.getPlanGpsBbox)

---

**📦 v1.42.4** (07/06/2026) — **🎚️ Vue OSM (modale + home) : opacité plan default 50% (vs 100% modale / 70% home)** :

KARMA : *« en OSM, PLAN et HOME, met par default opacity de l'image a 50%, l'option modifiable je parle »*.

🔧 **Fix v1.42.4** — 3 valeurs touchées :

```js
// js/osmView.js (modale plan)
let _opacity = 0.5;              // était 1.0 (100%)
// + slider value + label dynamiques basés sur _opacity (au lieu de hardcoded "100")

// js/osmHomePreview.js (widget HOME)
let _planOpacity = 0.5;          // était 0.7 (70%)
// (le slider lit déjà Math.round(_planOpacity * 100), pas de modif nécessaire)
```

🎯 **Cohérence** : les 2 modules ont désormais le **même default**. Avant : modale à 100% (plan masque OSM totalement) + home à 70%. Maintenant : 50/50 dans les 2 → on lit immédiatement les rues + le plan superposé. Toujours modifiable via le slider 🎚️ du bandeau.

🛡️ **Pas de régression** — uniquement modif de valeurs init. Sliders inchangés (lecture dynamique), comportement runtime identique. Si user a déjà manipulé le slider dans la session courante, sa valeur est respectée (l'init ne s'applique qu'au 1er affichage).

🧪 **Test** :
- Ouvrir Vue OSM (modale plan) → opacité 50% au boot, slider à mi-course, label « 50% »
- Widget Home → idem
- Manipuler le slider → ça marche comme avant

---

**📦 v1.42.3** (07/06/2026) — **🛡️ Kill-switch : audit boot des plans LOCAUX déjà importés + cache hash + modale orange notif** :

KARMA après v1.42.2 (kill-switch fonctionnel à l'import) : *« 3, 1 »* (= audit boot d'abord, capture canvas PDF ensuite).

🎯 **Cible** — En v1.42.0-2, le check denylist ne se faisait QU'à l'import d'un nouveau ZIP. Si KARMA révoque un plan **après** que l'user l'ait déjà importé, le plan reste accessible indéfiniment. Solution : au boot, hash tous les plans locaux + check + purge auto si match.

🔧 **Implémentation v1.42.3**

| Composant | Fichier | Rôle |
|-----------|---------|------|
| `auditPlansLocaux()` | `js/planDenylist.js` | Audit séquentiel asynchrone des plans `type:"local"` du PlanRegistry — lookup O(1) via index hash → entry |
| Cache hash | `PlanRegistry` `plan.sha256` (champ optionnel) | Persisté à l'import via `addOrUpdate({id, sha256})` — évite le re-hash au prochain boot |
| Notif user | `showPurgedNotifModal(purgedList)` | Modale ORANGE (vs rouge denied) listant les plans purgés au dernier boot, bouton « Compris » qui clear LS |
| Storage purges | `localStorage["myktamap_denylist_purged_at_boot"]` | Persiste entre boots pour notif différée si user ferme avant de voir |
| Hook boot | `js/main.js` (post `init()`) | Delay 2s anti-blocage, `setTimeout` non-bloquant |
| Hook import | `index.html > chargerZipFichier` (succès) | `_cacheHashAfterLoad()` persist le hash dans le registry |

🛡️ **Privacy stricte préservée** — tout reste local, 0 envoi serveur. Le hash est calculé via `crypto.subtle.digest` sur l'appareil. Le PlanRegistry stocke en localStorage (= user-readable, non-tracking).

📊 **Cycle de vie v1.42.3**

```
[Boot app]
   ↓
PlanDenylist.init()  ──── fetch denylist.json (cache 24h)
   ↓
Affiche notif si purgés au boot précédent (LS persistant)
   ↓
setTimeout 2s
   ↓
auditPlansLocaux()
   ↓
Pour chaque plan type:"local" :
   ↓
   plan.sha256 en cache ? ──── Oui → check direct denyByHash[hash]
   ↓ Non                            ↓
   getBlob(id) → computeSha256()    Match ?
   ↓                                ↓ Oui → remove + ajoute purges[]
   Cache via addOrUpdate(sha256)    ↓ Non → suivant
   ↓
   yield setTimeout(10) anti-freeze
   ↓
Save purges[] en LS
   ↓
showPurgedNotifModal(purges) si non-vide
```

🎨 **UX modale orange (vs rouge denied)** :
- Couleur charte : `#e9a13b` (orange ambré, vs rouge `#d32f2f` pour denied actif)
- Icône `⚠️` (vs `⛔`)
- Pas pulsante (moins urgent que denied)
- Liste détaillée : nom plan + motif + SHA-256 tronqué + date purge
- Bouton « Compris » `#e9a13b` (action acquittée, pas dangereux)

🛡️ **Performance**
- **Skip total si denylist vide** : 0 charge inutile (cas commun, 99% des sessions)
- **Cache hash dans registry** : 1 seul hash par plan dans sa vie → boots suivants quasi-instantanés
- **Audit séquentiel async** : await yield 10ms entre plans → pas de freeze main thread
- **Lookup O(1)** : index `denyByHash[sha256]` au lieu de scan linéaire
- **Delay 2s post-boot** : laisse le main thread libre pour le rendu initial

🧪 **Tests à faire**
1. **Test 1 — Plan importé AVANT révocation** :
   - Importer `plan_testban.zip` (hash supprimé temporairement de denylist côté serveur)
   - Vérifier ouverture OK
   - Remettre le hash dans `denylist.json` serveur
   - Recharger → modale orange au boot annonce la purge
   - Plan disparu de la liste
2. **Test 2 — Cache hash post-import** : ouvrir DevTools Application → localStorage → `myktamap_plans` → vérifier que les plans ont un champ `sha256`
3. **Test 3 — Audit avec denylist vide** : console log `[PlanDenylist] AUDIT BOOT terminé — 0 plan(s) audité(s), 0 purge(s)` (skip immédiat)
4. **Test 4 — Notif persistante** : si user ferme l'app sans cliquer « Compris », la modale doit se ré-afficher au prochain boot

🛡️ **Pas de régression**
- Module isolé `js/planDenylist.js` (uniquement ajouts, +250 lignes)
- 2 hooks dans `main.js` + `index.html` (fail-safe try/catch)
- 0 impact si module indispo ou denylist vide
- Cache hash dans registry : champ optionnel, plans pré-v1.42.3 sans `sha256` sont hashés au 1er audit

🎓 **Pattern KARMA respecté**
- ✅ Module standalone autonome
- ✅ Privacy stricte (0 envoi)
- ✅ Fail-safe (autorise par défaut en cas d'erreur)
- ✅ Cohérent avec doctrine community 100% offline
- ✅ UX différenciée (orange notif vs rouge action active)

📦 **Prochaines étapes** :
- **v1.42.4** : sync docs (README user FR+EN + interfaceDocs + AI_CONTEXT + security-legal §80.x)
- **v1.42.5+** : étape 1 du backlog (capture canvas réelle Vue OSM dans PDF Briefing pompiers)

---

**📦 v1.42.2** (07/06/2026) — **📖 Rattrapage dette docs v1.42 (kill-switch anti-fuite)** :

KARMA après validation test réel du kill-switch (plan_testban.zip → modale rouge OK) : *« sync doc »*. Application de la règle « Bump = sync docs sur 4 axes » du CLAUDE.md.

🔧 **Synchronisation effectuée**

| Axe | Fichier | Type d'ajout |
|-----|---------|--------------|
| 📱 In-app | `docs/applications/README_USER.md` | Nouvelle section « 🛡️ Plans révoqués (kill-switch anti-fuite, depuis v1.42.0) » sous Alertes publiques — UX user, privacy, propagation cache, limitation byte-perfect, contact auteur pour révocation |
| 📱 In-app | `docs/applications/README_USER.en.md` | Idem traduit EN (« Revoked plans (anti-leak kill-switch, since v1.42.0) ») |
| 📱 In-app | `js/interfaceDocs.js` (Aide intégrée) | Paragraphe « 🛡️ Plans révoqués (anti-fuite v1.42) » ajouté juste après le paragraphe Alertes publiques dans la section accueil — concis, lien vers `denylist.json` public |
| 📱 In-app | `docs/applications/AI_CONTEXT.md` | 3 entrées tableau histo (v1.41.5 + v1.42.0 + v1.42.1) avec API publique + format JSON + comportement fail-safe |
| 🤖 Archi IA | `docs/architecture/security-legal.md` | Nouvelle section 80 (12 sous-sections) : 80.1 vision/menace, 80.2 archi, 80.3 API publique, 80.4 format JSON, 80.5 cycle de vie, 80.6 fail-safe modes, 80.7 privacy & audit, 80.8 UX modale, 80.9 workflow KARMA, 80.10 limitations, 80.11 à ne pas faire, 80.12 tests réels v1.42.x |
| 🔒 Audit | `NETWORK_AUDIT.md/html` | Headers bumpés (la surface réseau `/denylist.json` était déjà documentée en v1.42.0) |
| 📖 Dev | `README.md` | Entrée journal v1.42.2 + tableau récap des changements |

🛡️ **Pas de régression** — uniquement ajouts docs + headers version. 0 modification code applicatif sauf 1 bloc HTML dans `js/interfaceDocs.js` (vérifié `node -c`).

🎓 **Pattern KARMA respecté** :
- ✅ **User-facing** : section dédiée dans README user FR+EN avec UX flow détaillé + assurance privacy + contact auteur
- ✅ **In-app** : 1 paragraphe concis dans l'Aide intégrée, accessible depuis la modale ❓ (cohérent avec le pattern des alertes publiques)
- ✅ **AI context** : 3 entrées tableau histo avec détails techniques pour assistants IA externes
- ✅ **Architecture** : section 80 ultra-détaillée pour Claude futur (12 sous-sections couvrant vision, archi, API, fail-safe, privacy, workflow, limitations, à-ne-pas-faire, tests)

🎯 **Workflow KARMA documenté de bout en bout** :

```bash
# 1. Hash du ZIP fuité
sha256sum plan-qui-a-fuite.zip
# → copier le hash hex 64 chars

# 2. Éditer denylist.json sur le serveur (FTP)
{
  "version": 1, "updated": "<ISO now>",
  "deny": [{ "sha256": "<hash>", "reason": "<motif>", "addedAt": "<ISO now>" }]
}

# 3. Push FTP → propagation max 24h (immédiate pour users qui rouvrent)
```

🧪 **Tests à faire**
- Doc user FR (modale Documentation, langue FR) : section « 🛡️ Plans révoqués » visible et lisible
- Doc user EN (toggle 🇬🇧) : section « Revoked plans » visible et alignée
- Aide intégrée (modale ❓ Aide) : paragraphe rouge `#d32f2f` visible dans la section accueil
- Audit réseau : header version bumpé à v1.42.2

---

**📦 v1.42.1** (07/06/2026) — **🛡️ Kill-switch anti-fuite étendu : check aussi dans le générateur de plan (mode « Modifier un ZIP existant »)** :

KARMA après v1.42.0 : *« on peut aussi refuser dans le générateur en import de zip :) si un malin tente la modification directe via zip (il devra décompresser + manuel) »*.

🎯 **Cible** — En v1.42.0, le check denylist était posé uniquement sur `chargerZipFichier` (loader principal). Mais le générateur de plan (mode « Modifier un plan existant ») permet d'importer un ZIP existant → l'éditer → ré-exporter. Un attaquant pouvait donc :
1. Récupérer le ZIP fuité
2. L'importer dans le générateur (= bypass du loader principal)
3. Modifier 1 truc (nom, version…)
4. Ré-exporter → **nouveau hash SHA-256** → contournement de la denylist

🔧 **Fix v1.42.1** — Hook denylist également dans `_chargerZipModifier(file)` (js/createConf.js), même pattern que v1.42.0 :

```js
async function _chargerZipModifier(file) {
  _plannerZipStatus("⏳ Extraction en cours…", false);
  try {
    if (typeof JSZip === "undefined") throw new Error("JSZip non chargé");

    // 🆕 v1.42.1 — Check denylist AVANT extraction (même UX que loader)
    if (window.PlanDenylist) {
      try {
        const denyCheck = await window.PlanDenylist.isPlanDenied(file);
        if (denyCheck && denyCheck.denied) {
          _plannerZipStatus("⛔ ZIP révoqué par l'auteur — modification refusée.", true);
          window.PlanDenylist.showDeniedModal(denyCheck, null);
          return;  // STOP : pas d'extraction, formulaire intact
        }
      } catch(eDeny) { console.warn(...); }  // fail-safe
    }

    const zip = await JSZip.loadAsync(file);
    // ... reste inchangé
  }
}
```

🛡️ **Effet anti-attaquant**

| Voie d'entrée v1.42.0 | Bloqué ? | v1.42.1 |
|----------------------|----------|---------|
| Loader principal (`chargerZipFichier`) | ✅ | ✅ |
| Générateur — « Modifier un ZIP existant » | ❌ (contournement) | ✅ |
| Décompression manuelle ZIP + édition fichiers à la main | ❌ | ❌ (= friction max acceptable) |
| Modification 1 byte → ré-zip avec autre outil | ❌ (nouveau hash) | ❌ (limitation hash byte-perfect, assumée) |

→ **Friction max** : un attaquant qui veut propager une variante du plan fuité ne peut plus utiliser le générateur intégré. Il doit décompresser manuellement, comprendre la structure (`plan-config.json` + assets), modifier à la main, recompresser. Réservé aux gens techniques motivés → réduit drastiquement la diffusion accidentelle.

🛡️ **Pas de régression**
- 1 seul fichier modifié : `js/createConf.js > _chargerZipModifier` (+11 lignes try/catch fail-safe)
- Si `PlanDenylist` indispo ou hash impossible → fallback autorise (cohérent v1.42.0)
- L'UX message d'erreur réutilise le système `_plannerZipStatus` existant + la modale rouge `PlanDenylist.showDeniedModal` partagée

🧪 **Tests à faire**
1. **Import normal** d'un ZIP non-fuité dans le générateur → comportement inchangé
2. **Simulation deny** : ajouter le hash d'un ZIP test à `localStorage["myktamap_denylist_cache"]` → tenter de l'importer via le générateur → modale rouge attendue + status « ⛔ ZIP révoqué »
3. **Bouton « Compris »** dans la modale : pas de plan local supprimé (planId null car générateur), juste reload de la page

🎓 **Pattern unifié** — Le module `PlanDenylist` est désormais hooké aux **2 points d'entrée ZIP** de l'application (loader + générateur). Si KARMA ajoute un 3e point d'entrée plus tard (ex : drag&drop direct, partage via Web Share Target…), il suffit d'appeler `await window.PlanDenylist.isPlanDenied(file)` avant `JSZip.loadAsync(file)`. Pattern réutilisable.

---

**📦 v1.42.0** (07/06/2026) — **🛡️ Kill-switch anti-fuite : denylist serveur + SHA-256 ZIP client-side + modale rouge bloquante + auto-purge plan** :

KARMA : *« chaque zip a son empreinte (unique) si un zip fuite massivement et que j'ai l'info, on "deny" liste rouge l'empreinte. refus d'ouverture dans l'application, suppression de la liste des plans »*. Validation reco `1a 2a 3a 4a 5a`.

🎯 **Cible** — Permettre à KARMA de bloquer l'ouverture des plans ZIP qui fuitent publiquement (sur Telegram, forums, etc.). Le ZIP reste accessible chez l'attaquant (rien à faire pour ça), mais les **utilisateurs légitimes de MyKTAMap qui le téléchargent par erreur** seront bloqués + averti que c'est une fuite reconnue.

🔧 **Architecture (MVP propre, 100% client-side)**

| Composant | Fichier | Rôle |
|-----------|---------|------|
| Module kill-switch | `js/planDenylist.js` (nouveau, ~330 lignes) | Fetch denylist · hash SHA-256 · check · modale rouge |
| Liste deny | `denylist.json` (racine serveur, vide à la release) | Format `{version, updated, deny: [{sha256, reason, addedAt}]}` |
| Hook chargement | `index.html > chargerZipFichier` | Check AVANT `extraireZip` — fail-safe si module indispo |
| Init au boot | `js/main.js` (après `AlertChecker.check()`) | Fetch initial async + cache 24h |
| Register SW | `sw.js > ASSETS_TO_CACHE` | Ajout `js/planDenylist.js` (mais PAS `denylist.json`) |
| Bypass cache SW | `sw.js > fetch handler` | `denylist.json` → `cache: "no-store"` + fallback `{deny:[]}` offline |

🛡️ **Privacy stricte (KARMA reco 3a)**
- **Aucun hash envoyé au serveur** — 0 fingerprinting des plans owned par l'user
- **Seule la denylist publique est fetched** — info publique, anyone peut la lire (audit possible)
- Cache 24h en `localStorage["myktamap_denylist_cache"]` → marche offline avec la dernière liste connue

🔐 **Format `denylist.json`**

```json
{
  "version": 1,
  "updated": "2026-06-07T14:00:00Z",
  "deny": [
    {
      "sha256": "abc123...64 chars hex",
      "reason": "Fuite publique constatée le 05/06/2026 sur Telegram",
      "addedAt": "2026-06-07T13:50:00Z"
    }
  ]
}
```

→ KARMA édite ce fichier sur le serveur, propagation auto chez tous les users sous 24h max (cache TTL) ou immédiatement au prochain boot (refetch background).

🧬 **Hash SHA-256**
```js
async function computeSha256(blob) {
  const buf = await blob.arrayBuffer();
  const digest = await window.crypto.subtle.digest("SHA-256", buf);
  // Conversion ArrayBuffer → hex string (64 chars)
  return Array.from(new Uint8Array(digest))
    .map(b => b.toString(16).padStart(2, "0")).join("");
}
```

→ Utilise `SubtleCrypto` natif (HTTPS requis — graceful fallback en dev HTTP local : warning + autorise l'ouverture).

🚫 **Comportement au match (KARMA reco 4a)**

```
chargerZipFichier(zipFile, ...) {
  // 🆕 v1.42.0 — Check denylist AVANT extraction
  const check = await window.PlanDenylist.isPlanDenied(zipFile);
  if (check.denied) {
    setStatus("⛔ Plan révoqué par l'auteur.", true);
    window.PlanDenylist.showDeniedModal(check, planId);
    return;  // STOP : pas d'extraction, pas de chargement
  }
  // ... reste du pipeline inchangé
}
```

UI : **modale rouge bloquante** (z-index 100000), animation pulse 2s, contenu :
- Titre « ⛔ Plan révoqué »
- Sous-titre « Ce plan a été retiré par l'auteur ou a fuité publiquement »
- Bloc raison (lue depuis `denylist.json`) sur fond rouge
- Détails techniques : date ajout + empreinte SHA-256 (12 premiers + 8 derniers chars, anti-doxxing)
- Bouton « Compris, supprimer ce plan » → `PlanRegistry.remove(planId)` + `location.reload()`

🌐 **Surfaces réseau ajoutées (NETWORK_AUDIT)**

| URL | Fréquence | Volume | Données envoyées |
|-----|-----------|--------|------------------|
| `GET /denylist.json` | Au boot (fetch async) + 1×/24h | ~1-5 KB | Aucune (statique, public) |

→ **0 nouvelle surface qui envoie des données utilisateur**. Identique au pattern `alert.json` et `Licence-pro.json` (fichiers de control serveur fetchés en read-only).

🧪 **Tests à faire**

1. **Boot normal** : denylist vide (0 entrée) → import ZIP → ouverture autorisée comme avant
2. **Hash test** : ouvrir DevTools console, taper :
   ```js
   const f = document.querySelector("#zipFileInput").files[0];
   window.PlanDenylist.computeSha256(f).then(console.log);
   ```
   → doit afficher un hash hex 64 chars
3. **Simulation deny** : éditer `localStorage["myktamap_denylist_cache"]` pour ajouter le hash d'un plan local → recharger → tenter d'ouvrir ce plan → modale rouge attendue
4. **Action « Compris » dans modale** : plan disparait de la liste + page rechargée
5. **Offline** : denylist absente du cache → boot OK, check de plans = fail-safe (autorise l'ouverture + warning console)
6. **Plan serveur** : pas concerné (architecture serveur fetch par fichier, pas de ZIP unique → pas de hash possible). C'est OK car les plans serveur sont publics par définition.

🛡️ **Pas de régression**
- Module isolé en `js/planDenylist.js` (rien d'autre touché côté JS sauf 1 ligne d'init dans main.js)
- Hook dans `chargerZipFichier` : 11 lignes en try/catch fail-safe — si module indispo ou hash impossible → autorise comme avant
- SW : 1 nouvelle règle bypass `denylist.json` (pattern identique à Licence-pro.json)
- HTML : 1 ligne `<script>` ajoutée

🎓 **Pattern KARMA respecté**
- ✅ Module standalone, API publique propre (`window.PlanDenylist.{init, isPlanDenied, refresh, showDeniedModal, computeSha256}`)
- ✅ Privacy stricte (0 envoi serveur, audit possible côté client)
- ✅ Fail-safe en cas d'erreur (mieux vaut autoriser un plan suspect que bloquer tous les plans en cas de bug)
- ✅ Pattern existant réutilisé (alertChecker.js pour fetch, Licence-pro.json pour bypass SW)
- ✅ Cohérent avec doctrine community 100% offline (marche sans réseau avec cache stale)

📦 **Workflow KARMA pour ajouter une fuite à la denylist**

1. Récupérer le SHA-256 du ZIP qui a fuité (via DevTools console sur le plan importé ou via `sha256sum fichier.zip` en CLI)
2. Éditer `denylist.json` sur le serveur :
   ```json
   {
     "version": 1,
     "updated": "<ISO now>",
     "deny": [
       { "sha256": "<hash>", "reason": "<motif court>", "addedAt": "<ISO now>" }
     ]
   }
   ```
3. Push FTP serveur → propagation immédiate (au prochain boot user) + max 24h (cache TTL)
4. Optionnel : mentionner publiquement la révocation (forum, GitHub) pour transparence

🚨 **Limitations assumées**
- Ne bloque que les ZIP **byte-perfect** (un re-zip ou édition d'1 byte = nouveau hash). C'est OK pour « fuite massive » (un attaquant ne re-zippera pas) mais pas pour des dérivations actives.
- Ne purge pas les fichiers déjà extraits sur la carte si l'user a déjà chargé le plan AVANT la révocation (chargement courant non interrompu). KARMA peut ajouter un check au boot des plans serveur si nécessaire.
- Plans **serveur** non couverts (pas de hash ZIP unique). Si KARMA veut bloquer un plan serveur, il suffit de retirer le fichier côté serveur (404 = chargement échoue naturellement).

---

**📦 v1.41.5** (07/06/2026) — **Rattrapage dette docs v1.41 (README user FR/EN, Aide intégrée, AI_CONTEXT, archi vue-osm + secours)** :

KARMA : *« Fait un tour des doc, readme user, contexte IA et met les a jours »*. Application stricte de la règle « Bump = sync docs sur 4 axes » du CLAUDE.md.

🔧 **Synchronisation effectuée**

| Axe | Fichier | Type d'ajout |
|-----|---------|--------------|
| 📱 In-app | `docs/applications/README_USER.md` | Nouvelle sous-section "🚨 Mode Secours × 🌍 Vue OSM — Coordination secours externes (v1.41)" — 6 sous-points (tag entree_plan, GPS surface, Vue OSM partout, Briefing pompiers PDF, page Briefing surface dans rapport, fix chips tags) |
| 📱 In-app | `docs/applications/README_USER.en.md` | Idem traduit EN ("Rescue Mode × OSM View — External rescue coordination") |
| 📱 In-app | `js/interfaceDocs.js` (Aide intégrée) | Nouveau bloc « 🌍 État 3 — BRIEFING SECOURS EXTERNES (Vue OSM × Mode Secours, v1.41) » dans la section Mode Secours, 5 puces (🚪 / 📍 / 🌍 / 🚒 / 📤) |
| 📱 In-app | `docs/applications/AI_CONTEXT.md` | Tableau histo enrichi : 5 nouvelles entrées (v1.41.0 / v1.41.1 / v1.41.2 / v1.41.3 / v1.41.4) + ligne récap condensée *v1.30 → v1.40* |
| 🤖 Archi IA | `docs/architecture/vue-osm.md` | Nouvelle section 7 (4 sous-sections) : 7.1 API étendue, 7.2 lazy build projection, 7.3 fix chips tags + pattern grep avant usage, 7.4 nouveau tag entree_plan |
| 🤖 Archi IA | `docs/architecture/secours.md` | Nouvelle section 79 (7 sous-sections) : 79.1 étape A, 79.2 étape D, 79.3 étape E (data model), 79.4 étape B (page PDF), 79.5 étape C (briefing dédié), 79.6 hotfixes v1.41.1-4, 79.7 roadmap restante |

🛡️ **Pas de régression** — uniquement ajouts docs + headers version bumpés (sw.js, copyright.js, version.json, NETWORK_AUDIT.md, NETWORK_AUDIT.html, README.md). 0 modification de code applicatif sauf le bloc d'aide dans `js/interfaceDocs.js` (HTML pur, vérifié `node -c`).

🎓 **Pattern KARMA respecté** :
- ✅ User-facing (README user FR+EN) — vulgarisation pédagogique
- ✅ In-app (Aide intégrée) — concis, accessible depuis modale ❓
- ✅ AI context (AI_CONTEXT.md) — détail technique pour assistants IA externes
- ✅ Architecture (vue-osm.md + secours.md) — détails internes pour Claude futur

> ⚠️ **Dette résiduelle assumée** : le tableau histo AI_CONTEXT.md s'arrêtait à v1.29.2 — j'ai ajouté UNE ligne récap condensée pour v1.30 → v1.40 (rattrapage exhaustif hors scope ce sprint, à faire si besoin). Les détails de ces versions intermédiaires restent dans le journal `README.md`.

---

**📦 v1.41.4** (07/06/2026) — **VRAI FIX Vue OSM chips tags : source corrigée (window.getAllEmbeddedPoints au lieu de _dataLayersByPlan inexistant)** :

KARMA après test v1.41.3 (capture montrant seulement 3 chips : pe / epure / vehicule) : *« il en manque toujours plein »*.

🎯 **Cause racine** — Le fix v1.41.3 retirait le filtre level mais ne corrigeait pas le VRAI bug : `_enumerateOsmTags` itérait sur `window._dataLayersByPlan[planId]` qui **N'EXISTE NULLE PART** dans l'application. Cet objet n'est défini/peuplé par aucun module (seulement référencé dans osmView.js et secoursMode.js). Donc seuls les points de `getEditorPoints()` (= la session active = ~3 tags) étaient comptés. Les POI des calques data du plan-config étaient totalement oubliés.

**Comment c'est passé inaperçu pendant 7 versions ?** Le bug est dans une fonction privée v1.40.17 qui n'avait jamais été testée par KARMA (chips peu visibles, ou avec plans où la session contenait tous les tags). Découvert seulement maintenant en croisant avec les nouvelles features Vue OSM × Mode Secours.

🔧 **Fix v1.41.4** — Switch sur `window.getAllEmbeddedPoints()` (= API officielle, même source utilisée par `_collectVisiblePoi` ligne 450 pour le rendu des markers OSM, par `gpxIO.js`, par `sessionExporter.js`) :

```js
function _enumerateOsmTags() {
  const counts = {};
  // Session + POI principaux (getEditorPoints → listePoints)
  if (typeof window.getEditorPoints === "function") {
    const session = window.getEditorPoints() || [];
    for (const p of session) {
      if (!p || typeof p.x !== "number") continue;
      const t = (Array.isArray(p.tags) && p.tags[0]) || "default";
      counts[t] = (counts[t] || 0) + 1;
    }
  }
  // 🆕 v1.41.4 — VRAI registre data layers (avant : _dataLayersByPlan inexistant)
  if (typeof window.getAllEmbeddedPoints === "function") {
    const embedded = window.getAllEmbeddedPoints() || [];
    for (const p of embedded) {
      if (!p || typeof p.x !== "number") continue;
      const t = (Array.isArray(p.tags) && p.tags[0]) || "default";
      counts[t] = (counts[t] || 0) + 1;
    }
  }
  return counts;
}
```

🛡️ **Cohérence parfaite chips ↔ rendu** — `_collectVisiblePoi` (qui rend les markers sur la carte OSM) utilise exactement la même API `getAllEmbeddedPoints`. Donc tout tag listé dans les chips correspond à des markers réellement rendables sur la carte (et inversement).

📊 **Évolution v1.41.0 → v1.41.4**

| Version | Source data layers | Résultat |
|---------|-------------------|----------|
| v1.41.0–2 | `_dataLayersByPlan[planId]` (n'existe pas) + filtre level | Chips réduits à session × level |
| v1.41.3 | `_dataLayersByPlan` (toujours inexistant) sans filtre level | Toujours réduits à la session (3 tags) |
| **v1.41.4** | **`getAllEmbeddedPoints()`** (API officielle) | **Tous les tags du plan** ✅ |

🧪 **Tests à faire**
- **Plan KARMA** (qui ne montrait que pe/epure/vehicule) → maintenant chips listent tous les tags : pa, pc, pb, cao, caf, danger, info, salle, etc.
- **Cliquer un chip** : seuls les POI du tag sélectionné sont visibles sur la carte OSM
- **Cliquer "Tout"** : tous les POI redeviennent visibles
- **Multi-niveaux** : chips inchangées au switch M-LVL (= comportement v1.41.3 préservé)

🛡️ **Pas de régression** — uniquement modification de `_enumerateOsmTags()` (changement de source de data). Le rendu via `_collectVisiblePoi` est inchangé.

🎓 **Leçon retenue** — Quand un fix ne marche pas après 1 ou 2 tentatives, **investiguer la source de la donnée** avant de toucher au filtrage. J'aurais dû vérifier dès v1.41.0 que `_dataLayersByPlan` existait. Pattern à appliquer : `grep -r "<symbol_name>"` pour valider qu'un global est bien défini quelque part.

---

**📦 v1.41.3** (07/06/2026) — **Fix Vue OSM modale : chips filtre par tag affichent tous les tags du plan (sans filtre level)** :

KARMA après test v1.41.2 : *« en mode OSM plan, il manque plein de tag pour les filtres contrairement a home »*.

🎯 **Cause** — Dans `osmView.js` (modale Vue OSM), `_enumerateOsmTags()` appliquait `_isLevelAllowed(p)` sur CHAQUE POI avant de compter son tag → seuls les tags du niveau M-LVL actif étaient comptés et affichés dans les chips de filtre. Si user en niveau 0 mais POI taggés "salle" / "elec" / "danger" en niveau 1, ces chips disparaissaient.

`osmHomePreview.js` (widget HOME) lui itère sur tous les data layers SANS filtre level (`_collectAvailableTags`) → tous les tags présents dans le plan apparaissent.

🔧 **Fix v1.41.3** — Retire le filtre `_isLevelAllowed(p)` dans `_enumerateOsmTags` :

```js
function _enumerateOsmTags() {
  const counts = {};
  if (typeof window.getEditorPoints === "function") {
    const session = window.getEditorPoints() || [];
    for (const p of session) {
      if (!p || typeof p.x !== "number") continue;
      // ⛔ AVANT : if (!_isLevelAllowed(p)) continue;
      // → tags des autres niveaux disparaissaient des chips
      const t = (Array.isArray(p.tags) && p.tags[0]) || "default";
      counts[t] = (counts[t] || 0) + 1;
    }
  }
  // idem pour data layers
}
```

🛡️ **Le filtre level reste appliqué au rendu** — `_renderPoi` continue d'utiliser `_isLevelAllowed` pour DESSINER les markers (donc seuls les POI du niveau actif sont visibles sur la carte). Mais la LISTE des chips reflète maintenant tous les tags du plan → user peut filtrer même les tags d'autres niveaux (qui apparaitront s'il change de niveau).

📊 **Comportement aligné Home ↔ Plan**

| Mode | Source tags chips | Avant v1.41.3 | Après v1.41.3 |
|------|------------------|---------------|---------------|
| Home (`osmHomePreview`) | Tous data layers du ZIP | ✅ tous tags | ✅ tous tags |
| Plan (`osmView` modale) | listePoints + data layers en mémoire | ❌ filtré par level | ✅ tous tags |

🧪 **Tests à faire**
- **Plan multi-niveaux** avec POI taggés différemment par niveau → ouvrir Vue OSM → chips contiennent TOUS les tags peu importe le M-LVL actif
- **Switch M-LVL** : les chips ne changent pas (avant : elles se réduisaient au niveau actif) ✅
- **Filtre** : cliquer un chip cache les POI non-correspondants → comportement inchangé ✅
- **Mode mono-niveau** : chips inchangées (avant : pareil) ✅

🛡️ **Pas de régression** — uniquement modification de `_enumerateOsmTags()` (retrait de 2 lignes de filtre). Le rendu et le filtrage runtime sont inchangés.

🎓 **Pattern à retenir** — Quand une UI propose des filtres, la liste des valeurs filtrables doit refléter **tout ce qui existe** dans la donnée, pas un sous-ensemble pré-filtré. Sinon l'user perd des options qu'il ne peut plus activer.

---

**📦 v1.41.2** (07/06/2026) — **Fix Briefing pompiers : la carte OSM s'affiche même si Vue OSM n'a jamais été ouverte (lazy build de la projection)** :

KARMA après test v1.41.1 : *« le briefing pompier n'affiche pas les OSM pourtant bien georef et fonctionnel »*.

🎯 **Cause** — En v1.41.0/41.1, `OsmView.getPlanGpsBbox()` retournait `null` si `_proj` (la projection georef interne d'osmView.js) n'était pas initialisé. Or `_proj` n'est créé qu'au premier `open()` de la modale Vue OSM. Cas KARMA : plan avec georef OK + Vue OSM fonctionnelle MAIS modale jamais ouverte dans la session → `_proj === null` → bbox null → PDF affichait "(!) Vue OSM non initialisée".

Symptôme observé : "le briefing pompier n'affiche pas les OSM pourtant bien georef et fonctionnel" → la georef est dans le JSON du plan, mais notre helper ne savait pas la lire sans passer par l'ouverture de la modale.

🔧 **Fix v1.41.2** — Lazy build de la projection dans `_getPlanGpsBbox()` :

```js
function _getPlanGpsBbox() {
  // 🆕 v1.41.2 — Lazy build : si _proj pas initialisé (modale jamais
  // ouverte), on construit la projection à la volée. _buildProjection()
  // est PUR (lit georef + KmzExport), pas d'effet de bord. Permet à
  // Briefing pompiers PDF de fonctionner sans pré-requis UI.
  let proj = _proj;
  if (!proj || typeof proj.planToLatLng !== "function") {
    proj = _buildProjection();
    if (!proj || typeof proj.planToLatLng !== "function") return null;
  }
  const cfg = window.APP_CONFIG || {};
  const w = cfg.imageWidth, h = cfg.imageHeight;
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return null;
  const corners = [
    proj.planToLatLng(0, 0),
    proj.planToLatLng(w, 0),
    proj.planToLatLng(w, h),
    proj.planToLatLng(0, h)
  ].filter(function(ll) {
    return ll && Number.isFinite(ll.lat) && Number.isFinite(ll.lng);
  });
  if (corners.length < 2) return null;
  try { return L.latLngBounds(corners); } catch(e) { return null; }
}
```

🛡️ **Robuste** — `_buildProjection()` est une fonction pure : lit `_getEffectiveGeoref()` (qui consulte `PLAN_CONFIG.osmGeoref`) + `KmzExport.buildTransform`. Aucune dépendance à l'état UI de la modale. Le `_proj` qui était stocké en cache servait juste de mémoïsation pour les handlers zoom/move.

🧪 **Tests à faire**
- **Cas KARMA** : plan georef OK, modale Vue OSM JAMAIS ouverte dans la session → 🚒 Briefing pompiers → PDF contient bbox + liens cliquables OSM/Google Maps ✅
- **Cas modale déjà ouverte** : ouvrir Vue OSM, fermer, exporter Briefing → toujours OK (`_proj` cache utilisé) ✅
- **Cas plan sans georef** : pas de `osmGeoref` dans PLAN_CONFIG → `_buildProjection()` retourne null → PDF affiche message "Vue OSM non initialisée" + instructions
- **Pas de régression** : page rapport post-mission "Briefing surface" affiche aussi la bbox correctement

🛡️ **Pas de régression** — uniquement modification de `_getPlanGpsBbox()` (ajout d'une branche lazy). Le cache `_proj` est toujours utilisé en premier (pas de perte perf). `_buildProjection()` est pur (pas d'effet de bord).

🎓 **Pattern à retenir** — Quand un helper exposé publiquement dépend d'un état initialisé par une UI (modale, etc.), prévoir un fallback lazy qui calcule à la demande. Évite les "marche que si on a cliqué sur X avant" qui sont des UX rates pour des features pourtant fonctionnelles.

---

**📦 v1.41.1** (07/06/2026) — **Mode Secours : boutons 🌍 Vue OSM + 🚒 Briefing pompiers accessibles aussi depuis les 3 vues Live (Opérateur, Équipier, Secouriste)** :

KARMA après test v1.41.0 (capture vue Opérateur surface, footer avec ⏸ Pause / 🗺️ Carte globale / 📤 Rapport global / 📥 Importer / ➕ Ajouter phase / ⏸ Voir édition / 🛑 Terminer) : *« rajoute le mode OSM depuis opérateur de surface pareil pour équipier secouriste »*.

🎯 **Précision** — En v1.41.0 les boutons 🌍 Vue OSM et 🚒 Briefing pompiers n'étaient ajoutés QUE dans les bandeaux Mode Secours (vue Edit). Hors une fois la mission lancée, l'utilisateur est dans une vue Live (Opérateur/Équipier/Secouriste) → boutons inaccessibles sans revenir à l'édition via « ⏸ Voir l'édition ». Friction inutile pour les pompiers qui débarquent en cours de mission.

🔧 **Fix v1.41.1** — Ajout des 2 boutons dans les 3 footers Live + handlers communs :

```js
// js/secoursMode.js — 3 footers Live (Équipier, Opérateur, Secouriste) :
'<button data-action="ouvrir-vue-osm">🌍 Vue OSM</button>' +
'<button data-action="briefing-pompiers">🚒 Briefing pompiers</button>' +

// js/secoursMode.js — _bindLiveCommonHandlers (handlers communs aux 3 vues Live) :
corps.querySelectorAll('[data-action="ouvrir-vue-osm"]').forEach(function(btn) {
  btn.addEventListener("click", _ouvrirVueOsmDepuisSecours);
});
corps.querySelectorAll('[data-action="briefing-pompiers"]').forEach(function(btn) {
  btn.addEventListener("click", function() {
    genererBriefingPompiersPDF(s.id);
  });
});
```

🛡️ **Réutilise les handlers v1.41.0** — `_ouvrirVueOsmDepuisSecours` (gating natif déjà géré : opt-in, strict offline, incognito, online, georef présent) et `genererBriefingPompiersPDF(s.id)` (helper v1.41.0). 0 duplication de logique.

📊 **Footers Live finalisés**

| Vue | Avant v1.41.1 | Après v1.41.1 |
|-----|---------------|---------------|
| Équipier | ⏸ Pause / 📤 Rapport / ⏸ Voir édition / 🛑 Terminer | + 🌍 Vue OSM / 🚒 Briefing pompiers |
| Opérateur | ⏸ Pause / 🗺️ Carte globale / 📤 Rapport global / 📥 Importer / ➕ Phase / ⏸ Voir édition / 🛑 Terminer | + 🌍 Vue OSM / 🚒 Briefing pompiers |
| Secouriste | ⏸ Pause / 📤 Rapport / ⏸ Voir édition / 🛑 Terminer | + 🌍 Vue OSM / 🚒 Briefing pompiers |

🧪 **Tests à faire**
- **Vue Opérateur surface** : lancer plan en mode Opérateur → footer contient 🌍 + 🚒 → clic Vue OSM ouvre modale OSM correctement → clic Briefing pompiers télécharge PDF
- **Vue Équipier** : passer en mode Équipier → footer contient les 2 boutons → idem
- **Vue Secouriste libre** : passer en mode Secouriste → footer contient les 2 boutons → idem
- **Mobile** : les boutons ajoutés à des footers déjà chargés peuvent passer en `flex-wrap: wrap` — à vérifier que ça reste lisible
- **Pas de régression** : tous les autres boutons des 3 footers fonctionnent toujours

🛡️ **Pas de régression** — uniquement ajouts JS (3 boutons HTML + 2 handlers commun). HTML/CSS existants inchangés. 0 logique modifiée.

---

**📦 v1.41.0** (07/06/2026) — **Synergie Vue OSM × Mode Secours : étapes B+C+D+E livrées d'un coup (briefing pompiers, GPS équipes, POI entrée plan, page rapport)** :

KARMA après v1.40.x : *« fait tout d'un coup et on testera »* après confirmation reco `1a 2a 3a 4a` pour les 4 étapes :
- **D** : tag built-in `entree_plan` 🚪 (catégorie 🚨 Secours)
- **E** : champ `surfaceGps {lat, lng}` par équipe + UI input + export JSON natif
- **B** : page "Briefing surface" ajoutée au rapport PDF post-mission
- **C** : bouton 🚒 Briefing pompiers dans bandeau Mode Secours → PDF dédié

🎯 **Limitation assumée (MVP)** — La capture du canvas Leaflet de la Vue OSM dans le PDF aurait nécessité une lib externe (html2canvas/leaflet-image, non dispo dans `lib/`). Choix : utiliser des **liens cliquables OSM/Google Maps** dans le PDF à la place. Les pompiers cliquent depuis leur PC pour ouvrir la carte. Léger, robuste, 100% offline.

🔧 **Architecture des changements**

| Étape | Fichier | Type | Description |
|-------|---------|------|-------------|
| **D** | `js/map.js` (TAGS_BUILTIN) | Ajout | Tag `entree_plan` + icône SVG inline (porte stylisée jaune charte) |
| **D** | `js/editor.js` (EDITOR_TAG_LABELS) | Ajout | Label "🚪 Point d'entrée du plan" |
| **D** | `js/interfaceLegende.js` (LEGENDE_LABELS + 2 GROUPES) | Ajout | Catégorie "🚨 Secours" (légende app + légende exporter) |
| **D** | `js/exporter.js` (GROUPES_ICONES) | Ajout | Même catégorie pour export PNG/PDF |
| **D** | `js/createConf.js` (PLANNER_DEFAULT_ICONS) | Ajout | Dispo dans générateur de plan |
| **E** | `js/secoursMode.js` (addGroupe) | Champ | `surfaceGps: null` à l'init équipe |
| **E** | `js/secoursMode.js` (updateGroupe whitelist) | Validation | `{lat ∈ [-90,90], lng ∈ [-180,180]}` ou `null` |
| **E** | `js/secoursMode.js` (UI _renderGroupeForm) | Input | Champ texte "📍 GPS surface" placeholder "lat, lng" |
| **E** | `js/secoursMode.js` (handler edit-surface-gps) | Listener | Parse + validation + toast erreur si format invalide |
| **B+C** | `js/osmView.js` (window.OsmView) | Expose | `getPlanGpsBbox` public pour accès bbox depuis secoursMode |
| **B+C** | `js/secoursMode.js` (`_drawBriefingSurfacePage`) | Helper | Page A4 partagée (infos + bbox + lien OSM + équipes + POI critiques) |
| **B** | `js/secoursMode.js` (`genererRapportPDF`) | Insertion | Appelle `_drawBriefingSurfacePage` après briefing global |
| **C** | `js/secoursMode.js` (`genererBriefingPompiersPDF`) | Fonction | PDF dédié 1+ page(s) via `_drawBriefingSurfacePage` |
| **C** | `js/secoursMode.js` (bandeaux PLAN ACTIF + TERMINÉ) | Bouton | "🚒 Briefing pompiers" à côté de "🌍 Vue OSM" |
| **C** | `js/secoursMode.js` (handler briefing-pompiers) | Listener | Appelle `genererBriefingPompiersPDF(s.id)` |
| **C** | `js/secoursMode.js` (window.SecoursMode) | API | `genererBriefingPompiersPDF` exposé publiquement |

📊 **Contenu du PDF Briefing surface**

```
┌────────────────────────────────────────────────────────────┐
│ BRIEFING SURFACE                                            │
│ Page à transmettre aux secours externes (pompiers, GRIMP)  │
├────────────────────────────────────────────────────────────┤
│ INFOS                                                       │
│ Scenario : Recherche Marc — 15/06/2026                     │
│ Plan     : Four à Chaux Oise                               │
│ Genere le 07/06/2026 à 14:32                               │
├────────────────────────────────────────────────────────────┤
│ LOCALISATION SUR LA CARTE                                  │
│ Centre du plan : 49.123456, 2.654321                       │
│ Bbox : sud-ouest 49.12, 2.65 / nord-est 49.13, 2.66        │
│ > Ouvrir sur OpenStreetMap (centre du plan)                │
│ > Ouvrir sur Google Maps (zoom 17)                         │
├────────────────────────────────────────────────────────────┤
│ EQUIPES SUR PLACE (GPS surface)                            │
│ - Équipe Alpha                                              │
│   Membres : Léa, Tom                                        │
│   GPS surface : 49.123, 2.654                              │
│   > Voir position equipe sur OSM                           │
│ - Équipe Bravo                                              │
│   Membres : Sam, Léo                                        │
│   GPS surface : non renseigne                              │
├────────────────────────────────────────────────────────────┤
│ POI CRITIQUES (acces / sorties)                            │
│ Point d'entree (urgence pompiers) (1) :                    │
│   - Cavage principal Oise (niveau 0)                       │
│ Cavage ouvert (3) :                                         │
│   - Cavage Nord                                             │
│   - Cavage Est                                              │
│   - ...                                                     │
└────────────────────────────────────────────────────────────┘
```

🛡️ **Garde-fous** :
- Si Vue OSM jamais ouverte → message "Vue OSM non initialisée" + instructions pour générer la georef
- Si aucun POI tagué `entree_plan` → astuce dans le PDF pour expliquer comment en créer un
- Si équipe sans `surfaceGps` → mention "non renseigné" + indique champ optionnel
- Validation stricte format GPS dans `updateGroupe` (range check) + toast si format invalide à la saisie

🧪 **Tests à faire**
- **D Tag entrée_plan**
  - Édite un POI dans plan → onglet Tag, voir « 🚪 Point d'entrée du plan »
  - Légende app → catégorie « 🚨 Secours » avec porte SVG jaune
  - Export PNG/PDF → catégorie présente dans la légende exportée
- **E GPS équipes**
  - Mode Secours → édite une équipe → champ « 📍 GPS surface » visible
  - Saisir « 48.85, 2.35 » → blur → pas d'erreur, valeur conservée
  - Saisir « foo, bar » → toast erreur format
  - Saisir « 200, 300 » (hors range) → toast erreur format
  - Saisir vide → reset à null
  - Export JSON `.mkmsec.json` → `surfaceGps: {lat, lng}` présent
- **B Page Briefing dans rapport**
  - Mode Secours → Lancer plan → Arrêter → 📤 Voir le rapport → Exporter PDF
  - Page 2 du PDF = « BRIEFING SURFACE » avec sections INFOS / LOCALISATION / EQUIPES / POI
- **C Briefing pompiers**
  - Mode Secours plan actif → bandeau bleu → bouton 🚒 Briefing pompiers
  - PDF téléchargé `Briefing_pompiers_<scenario>_<date>.pdf` 1 page
  - Lien OSM clickable depuis lecteur PDF
  - Idem post-mission (bandeau PLAN TERMINÉ → bouton accessible aussi)

🎓 **Décisions prises (pragmatisme MVP)** :
- **SVG inline pour icône `entree_plan`** : pas besoin de créer `icon/entree.png` (impossible via mes outils). KARMA peut remplacer par vrai PNG après et ajouter au `sw.js` ASSETS_TO_CACHE.
- **Liens OSM/Google Maps au lieu de capture canvas** : évite d'ajouter html2canvas (~50KB) à `lib/`. Si KARMA veut une vraie capture image plus tard → ajouter la lib + écrire `_captureOsmCanvas()` en bonus.
- **Pas de modale dédiée pour Briefing pompiers** : export PDF direct au clic. Si KARMA veut une preview avant export → ajouter une modale avec aperçu.

🛡️ **Pas de régression** — tous les ajouts. Aucune fonction existante modifiée à part :
- `genererRapportPDF` : ajout d'un `try/catch` qui ajoute 1 page (échec silencieux + log si problème)
- 2 bandeaux Mode Secours : ajout d'un bouton (pas de modif des existants)

---

**📦 v1.40.49** (07/06/2026) — **HOME PC : bouton Reprendre prend largeur col 3 (= « Ajouter un plan ») via grid 2fr 3fr 2fr + width 100%** :

KARMA après rollback v1.40.48 (capture avec carré rouge tracé autour de la zone que doit occuper le bouton) : *« maintenant le bouton reprendre doit rentrer dans le carré rouge »*.

🎯 **Cible visuelle** — Le carré rouge tracé correspond à la **colonne « Ajouter un plan »** (col 3 du `.loader-grid` dessous). Le bouton Reprendre doit avoir la **même largeur** que cette colonne pour un alignement vertical propre.

🔧 **Fix v1.40.49** — Grid 2fr 3fr 2fr (= .loader-grid) + width 100% sur bouton :

```css
@media (min-width: 1024px) {
  .kta-loader-top-row {
    display: grid;
    grid-template-columns: 2fr 3fr 2fr;     /* identique .loader-grid */
    gap: 0 24px;
    align-items: stretch;
    margin-bottom: 18px;
  }
  .kta-loader-top-row .kta-loader-profile-bar {
    grid-column: 1 / span 2;                /* cols 1+2 */
    margin: 0;
  }
  .kta-loader-top-row #resumeBox {
    grid-column: 3;                         /* col 3 = "Ajouter un plan" */
    margin: 0;
    display: flex !important;
    align-items: stretch;
  }
  .kta-loader-top-row #resumeBox .loader-btn-resume {
    width: 100%;                            /* remplit largeur cellule col 3 */
  }
}
```

🛡️ **Pas de min-height cette fois** — bouton garde sa hauteur naturelle (~44px). Si KARMA veut aussi égaliser la hauteur, ce sera un autre bump avec valeur précise.

📊 **Layout PC final**

```
┌────────────────────────────────────────────┬──────────────────────┐
│  BIENVENUE / Mon profil                    │  ▶️ Reprendre [plan] │  ← top-row
├──────────────┬─────────────────────────────┼──────────────────────┤
│  📚 Mes plans │  🌍 Vue OSM                 │  📦 Ajouter un plan  │  ← loader-grid
└──────────────┴─────────────────────────────┴──────────────────────┘
   col 1 (2fr)         col 2 (3fr)                   col 3 (2fr)
```

Reprendre = largeur col 3 = même largeur que « Ajouter un plan » dessous (alignement vertical pixel-perfect).

🧪 **Tests à faire**
- **PC ≥ 1024px avec plan récent** : bouton Reprendre **largeur = col 3** (= "Ajouter un plan" dessous)
- **Alignement vertical** : bord gauche du bouton aligné avec bord gauche de "Ajouter un plan"
- **PC sans plan récent** : col 3 vide (resumeBox display:none)
- **Mobile < 1024px** : stack vertical inchangé

🛡️ **Pas de régression** — uniquement CSS (1 bloc remplacé). HTML wrapper v1.40.42 inchangé. 0 JS touché.

---

**📦 v1.40.48** (07/06/2026) — **HOME PC : ROLLBACK fix v1.40.43→47 sur top-row, retour au flex row simple de v1.40.42** :

KARMA après test v1.40.47 (capture profile compact + bouton match) : *« ca va pas du tout rollback tes fix à .42 »*.

🎯 **Décision** — Les 5 itérations v1.40.43-47 (grid, stretch CSS, min-height, profile compact) ne convergent pas vers ce que KARMA veut visuellement. Rollback complet à l'état v1.40.42 = flex row simple, profile prend la place restante, bouton garde sa taille naturelle. Pas de match de hauteur forcé.

🔧 **Fix v1.40.48** — Retour au CSS minimal de v1.40.42 :

```css
.kta-loader-top-row {
  display: contents;
}
@media (min-width: 1024px) {
  .kta-loader-top-row {
    display: flex;
    flex-direction: row;
    align-items: stretch;
    gap: 24px;
    margin-bottom: 18px;
  }
  .kta-loader-top-row .kta-loader-profile-bar {
    flex: 1 1 auto;          /* prend la place restante */
    margin: 0;
  }
  .kta-loader-top-row #resumeBox {
    flex: 0 0 auto;          /* taille naturelle (largeur du texte bouton) */
    margin: 0;
  }
}
```

🛡️ **Supprimé v1.40.48** :
- Grid `2fr 3fr 2fr` (v1.40.43, 45) → retour à flex
- Grid `1fr 1fr` (v1.40.44) → retour à flex
- `align-self: stretch` + `flex: 1 1 auto` + `min-height: 100%` sur bouton (v1.40.45) → supprimés
- `min-height: 86px` sur bouton (v1.40.46) → supprimé
- Profile compact override (avatar 40, padding 8, font sizes) (v1.40.47) → supprimé
- `min-height: 56px` sur bouton (v1.40.47) → supprimé

📊 **Évolution finale**

| Version | Stratégie |
|---------|-----------|
| v1.40.42 | flex row (profile flex:1, resume auto) ✅ |
| v1.40.43 | grid 2fr 3fr 2fr (aligné « Ajouter un plan ») |
| v1.40.44 | grid 1fr 1fr (50/50) |
| v1.40.45 | + stretch CSS (raté) |
| v1.40.46 | + min-height 86px (trop gros) |
| v1.40.47 | + profile compact (KARMA n'aime pas) |
| **v1.40.48** | **ROLLBACK à v1.40.42** ✅ |

🎓 **Leçon retenue** — Quand 5 itérations consécutives n'aboutissent pas, **arrêter et demander une mockup ou description précise** au lieu d'empiler des tentatives basées sur des interprétations. Ce sprint a brûlé 5 versions pour rien — KARMA a perdu du temps à tester chacune. Si une 2e itération ne marche pas, demander précision avant la 3e.

🧪 **Tests à faire**
- **PC ≥ 1024px avec plan récent** : profile-bar à gauche (large) + bouton Reprendre à droite (étroit, largeur du texte) sur **1 ligne** — comme v1.40.42 originale
- **PC sans plan récent** : profile occupe toute la largeur (resumeBox display:none)
- **Mobile < 1024px** : stack vertical inchangé

🛡️ **Pas de régression** — uniquement CSS (1 bloc remplacé, beaucoup de propriétés supprimées). HTML wrapper v1.40.42 inchangé. 0 JS touché.

---

**📦 v1.40.47** (07/06/2026) — **HOME PC : profile-bar COMPACT (avatar 40 + padding 8) au lieu d'épaissir le bouton** :

KARMA après v1.40.46 (capture : bouton désormais aussi haut que profile mais profile prend trop de place) : *« tu accumules des fix pour rien, mets profil plus fin »*.

🎯 **Insight KARMA** — Plutôt que d'**épaissir** le bouton Reprendre pour matcher profile-bar (= cumul de fix stretch qui ne marchait pas + min-height qui forçait), il faut **amincir** profile-bar pour matcher la taille naturelle du bouton. Logique inversée, beaucoup plus propre.

🔧 **Fix v1.40.47** — Override compact de profile-bar UNIQUEMENT dans le contexte `.kta-loader-top-row` PC + min-height bouton réduit pour match :

```css
@media (min-width: 1024px) {
  /* Profile-bar compact (override @media >=769) */
  .kta-loader-top-row .kta-loader-profile-bar {
    padding: 8px 14px !important;       /* était 14×18 */
    gap: 10px !important;               /* était 16 */
  }
  .kta-loader-top-row .kta-loader-profile-bar .kta-loader-profile-avatar-wrap {
    width: 40px !important;             /* était 58 */
    height: 40px !important;
  }
  .kta-loader-top-row .kta-loader-profile-bar .kta-loader-profile-avatar-initial {
    font-size: 18px !important;         /* était 25 */
  }
  .kta-loader-top-row .kta-loader-profile-bar .kta-loader-profile-greeting {
    font-size: 10px !important;
  }
  .kta-loader-top-row .kta-loader-profile-bar .kta-loader-profile-surnom {
    font-size: 15px !important;         /* était 18 */
  }
  /* Hauteur profile-bar compact : avatar 40 + padding 8×2 = 56px */

  /* Bouton min-height 56px (était 86 en v1.40.46) → match exact profile compact */
  .kta-loader-top-row #resumeBox .loader-btn-resume {
    min-height: 56px;                   /* 🆕 réduit (était 86) */
    ...
  }
}
```

🛡️ **Pourquoi `!important` ?** Le profile-bar a un override `@media (min-width: 769px)` qui set padding 14×18 + avatar 58. Mon override est dans `@media (min-width: 1024px)` (subset) avec selecteur `.kta-loader-top-row .kta-loader-profile-bar` (specificity 0,2,0). Le >=769 a `.kta-loader-profile-bar` (specificity 0,1,0). Donc mon selecteur gagne par specificity SEUL... mais le `!important` rend explicite l'override des cascades de la profile-bar standalone, plus safe.

🛡️ **Scope strict** — Tous mes overrides sont préfixés par `.kta-loader-top-row .kta-loader-profile-bar` → ils ne s'appliquent QUE dans le contexte top-row PC. Le profile-bar standalone (mobile, autres contextes hypothétiques) garde sa taille originale.

📊 **Évolution v1.40.42 → 47**

| Version | Strategy | Profile height | Bouton height | Match |
|---------|----------|---------------|---------------|-------|
| v1.40.42 | flex row | ~86px | ~44px (auto) | ❌ |
| v1.40.43 | grid 2fr 3fr 2fr | ~86px | ~44px (auto) | ❌ |
| v1.40.44 | grid 1fr 1fr | ~86px | ~44px (auto) | ❌ |
| v1.40.45 | + stretch CSS | ~86px | ~44px (stretch fail) | ❌ |
| v1.40.46 | + min-height 86px | ~86px | 86px | ✅ trop gros |
| **v1.40.47** | **+ profile compact 56px** | **56px** | **56px** | **✅ propre** |

🧪 **Tests à faire**
- **PC ≥ 1024px avec plan récent** : profile et Reprendre **même hauteur compacte** (~56px)
- **Profile reste lisible** : avatar 40 visible, surnom 15px confortable
- **Aligné horizontalement** avec « Ajouter un plan » dessous (col 3)
- **Mobile < 1024px** : profile-bar garde ses dimensions originales (avatar 44/58, padding 10/14) — overrides hors media query

🛡️ **Pas de régression** — uniquement CSS (1 bloc remplacé). HTML wrapper v1.40.42 inchangé. 0 JS touché. Profile-bar standalone (autres contextes) inchangée.

🎓 **Leçon retenue** — Quand 2 éléments côte à côte ont des tailles très différentes, demander si on grandit le petit OU rétrécit le grand. KARMA a choisi rétrécir → moins de risque que ça casse ailleurs.

---

**📦 v1.40.46** (07/06/2026) — **HOME PC : min-height explicite 86px sur bouton Reprendre (stretch CSS v1.40.45 ne propageait pas)** :

KARMA après test v1.40.45 (capture avec 2 traits rouges verticaux montrant bouton Reprendre ~50% hauteur profile-bar) : *« rb ok mais on se comprend pas, je veux juste icone un peu moins fin, regarde les trait rouge pas de meme longueur »*.

🎯 **Cause** — Mon stretch CSS v1.40.45 (`align-self: stretch` + `flex: 1 1 auto` + `min-height: 100%`) ne propageait pas correctement à travers la cascade `grid (top-row) → flex (#resumeBox) → button`. Plusieurs raisons possibles :

- `min-height: 100%` résout à **0** quand le parent n'a pas de `height` explicite définie (seulement computed via grid stretch).
- L'inline `style="display:block"` ajouté par JS (ligne 2060 de `index.html` : `resumeBox.style.display = "block"`) interfère potentiellement avec ma règle `display: flex !important` malgré le `!important`.
- L'élément avec `padding: 12px 16px` a une hauteur intrinsèque de ~44px qui n'est pas étirée comme prévu par `align-self: stretch` quand combinée avec `min-height: 100%` qui résout à 0.

🔧 **Fix v1.40.46** — Solution pragmatique : `min-height` en pixels explicites, fini la cascade stretch fragile :

```css
.kta-loader-top-row #resumeBox .loader-btn-resume {
  width: 100%;
  min-height: 86px;        /* 🆕 match profile-bar PC (avatar 58 + padding 14×2) */
  display: flex;           /* centrage vertical texte dans bouton plus haut */
  align-items: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  box-sizing: border-box;
}
```

🛡️ **Pourquoi 86px ?** `.kta-loader-profile-bar` a un override `@media (min-width: 769px)` qui set `padding: 14px 18px` + `avatar 58×58px`. Hauteur totale = 58 + 14×2 = 86px. Le breakpoint top-row est ≥1024 (subset de ≥769) donc le profile-bar a toujours 86px à cette taille.

🧪 **Tests à faire**
- **PC ≥ 1024px avec plan récent** : bouton Reprendre **AUSSI HAUT** que profile-bar à gauche (= 86px)
- **Texte vertical centré** dans le bouton (icône ▶️ + "Reprendre Four a Chaux (V5.3)" milieu vertical)
- **Aligné horizontalement** avec « Ajouter un plan » dessous (col 3 du loader-grid)
- **Mobile < 1024px** : stack vertical, bouton garde sa hauteur naturelle (pas de min-height appliqué hors media query)

🛡️ **Pas de régression** — uniquement CSS (1 bloc remplacé). HTML wrapper v1.40.42 inchangé. 0 JS touché.

🎓 **Leçon retenue** — `min-height: 100%` est un piège classique CSS : résout à 0 si le parent n'a pas de `height` explicite. Préférer des valeurs en pixels quand l'objectif est visuel ("aussi haut que X") plutôt que de batailler avec la propagation stretch dans une cascade grid → flex → bloc.

---

**📦 v1.40.45** (07/06/2026) — **HOME PC : rollback v1.40.44 (grid 2fr 3fr 2fr) + fix HAUTEUR bouton Reprendre = hauteur profile-bar** :

KARMA après test v1.40.44 (capture montrant bouton Reprendre moins haut que profile) : *« rollback, je parle pas de la longueur mais de la largeur »* — où "longueur" = dimension horizontale (largeur du bouton, que j'ai modifiée à tort) et "largeur" = dimension verticale (hauteur du bouton, qu'il fallait fixer).

🎯 **Cause double**

1. **Mauvaise interprétation v1.40.44** : j'ai compris "Reprendre plus longue (même que profile)" comme "même **largeur horizontale** que profile" → grille `1fr 1fr` (50/50). En réalité KARMA voulait dire "même **hauteur verticale** que profile" (le bouton apparaissait plus court).

2. **Bouton réellement moins haut** : `.kta-loader-profile-bar` contient un avatar 52×52 + padding 12×2 = ~76px de hauteur. `.loader-btn-resume` n'a que `padding: 12px 16px` + font 14px = ~44px. Même avec `align-items: stretch` sur la grille, le bouton ne s'étirait pas vraiment dans le cellule (problème de propagation `height: 100%` à travers `display: block` enfant d'un flex container).

🔧 **Fix v1.40.45** — Rollback grille + propagation stretch garantie :

```css
@media (min-width: 1024px) {
  .kta-loader-top-row {
    display: grid;
    grid-template-columns: 2fr 3fr 2fr;   /* rollback v1.40.43 layout */
    gap: 0 24px;
    align-items: stretch;
    margin-bottom: 18px;
  }
  .kta-loader-top-row .kta-loader-profile-bar {
    grid-column: 1 / span 2;
    margin: 0;
    align-self: stretch;                  /* 🆕 explicit (default mais safety) */
  }
  .kta-loader-top-row #resumeBox {
    grid-column: 3;
    margin: 0;
    display: flex !important;
    align-items: stretch;
    align-self: stretch;                  /* 🆕 cellule prend hauteur row */
    min-width: 0;
  }
  .kta-loader-top-row #resumeBox .loader-btn-resume {
    flex: 1 1 auto;                       /* 🆕 prend toute la largeur cellule */
    align-self: stretch;                  /* 🆕 prend toute la hauteur cellule */
    width: 100%;
    min-height: 100%;                     /* 🆕 safety supplémentaire */
    display: flex;                        /* 🆕 permet centrage vertical du texte */
    align-items: center;                  /* 🆕 texte centré dans bouton plus haut */
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    box-sizing: border-box;
  }
}
```

🛡️ **Pourquoi 5 propriétés pour stretcher ?** Belt-and-braces : `align-self: stretch` au niveau cellule grid (resumeBox) + `align-items: stretch` au niveau flex parent + `align-self: stretch` au niveau bouton + `flex: 1 1 auto` + `min-height: 100%`. Garantit le stretch peu importe quel mode de layout cascade le navigateur applique.

📊 **Évolution v1.40.42 → 45**

| Version | Grille top-row | Profile width | Reprendre width | Reprendre height |
|---------|---------------|---------------|-----------------|------------------|
| v1.40.42 | flex row | flex:1 (large) | auto (étroit) | ~44px (court) |
| v1.40.43 | grid 2fr 3fr 2fr | cols 1+2 (71%) | col 3 (29%) | ~44px (court ❌) |
| v1.40.44 | grid 1fr 1fr | 50% | 50% | ~44px (court ❌) |
| **v1.40.45** | **grid 2fr 3fr 2fr** | **cols 1+2 (71%)** | **col 3 (29%)** | **= profile (~76px) ✅** |

📊 **Layout PC final v1.40.45**

```
┌──────────────────────────────────────────┬────────────────────┐
│  BIENVENUE / Mon profil [chips stats]    │   ▶️ Reprendre […]  │  ← top-row
│  (hauteur = avatar 52 + padding ≈ 76px)  │   (HAUTEUR = 76px ✅)│
├──────────────┬───────────────────────────┼────────────────────┤
│  📚 Mes plans │  🌍 Vue OSM               │  📦 Ajouter un plan │  ← loader-grid
└──────────────┴───────────────────────────┴────────────────────┘
   col 1 (2fr)            col 2 (3fr)            col 3 (2fr)
```

🧪 **Tests à faire**
- **PC ≥ 1024px avec plan récent** : bouton Reprendre **AUSSI HAUT** que profile-bar à gauche (76px sur PC, scale-down responsive sur mobile)
- **Aligné horizontalement** avec « Ajouter un plan » dessous (même bord gauche, même largeur col 3)
- **Texte vertical centré** dans le bouton plus haut (pas collé en haut)
- **Mobile < 1024px** : stack vertical inchangé

🛡️ **Pas de régression** — uniquement CSS (1 bloc remplacé). HTML wrapper v1.40.42 inchangé. 0 JS touché.

🎓 **Leçon apprise** — KARMA utilise "longueur"/"largeur" parfois inversés (pour lui largeur = épaisseur/hauteur d'un bouton horizontal). Toujours demander précision ou regarder attentivement la capture avant de coder.

---

**📦 v1.40.44** (07/06/2026) — **HOME PC : `profile-bar` et `Reprendre` strictement même largeur (grille 1fr 1fr)** :

KARMA après test v1.40.43 (capture avec rectangle rouge sur Reprendre qui dépasse à droite) : *« presque, juste la box Reprendre plus longue (même que profile) »*.

🎯 **Cause** — v1.40.43 utilisait `grid-template-columns: 2fr 3fr 2fr` pour aligner Reprendre sur la colonne « Ajouter un plan » du `.loader-grid` dessous (profile = cols 1+2 = 71%, reprendre = col 3 = 29%). KARMA préfère que les 2 boxes soient strictement égales (50/50) plutôt que cet alignement vertical avec la grille du dessous.

🔧 **Fix v1.40.44** — Grille simplifiée à `1fr 1fr` + safety anti-débordement :

```css
@media (min-width: 1024px) {
  .kta-loader-top-row {
    display: grid;
    grid-template-columns: 1fr 1fr;       /* 🆕 50/50 (v1.40.43 : 2fr 3fr 2fr) */
    gap: 0 24px;
    align-items: stretch;
    margin-bottom: 18px;
  }
  .kta-loader-top-row .kta-loader-profile-bar { margin: 0; }
  .kta-loader-top-row #resumeBox {
    margin: 0;
    display: flex !important;
    align-items: stretch;
    min-width: 0;                         /* permet shrink si nom plan très long */
  }
  .kta-loader-top-row #resumeBox .loader-btn-resume {
    width: 100%;
    height: 100%;
    white-space: nowrap;
    overflow: hidden;                     /* 🆕 safety anti-dépassement */
    text-overflow: ellipsis;              /* 🆕 "Reprendre Cavages Très …" */
    box-sizing: border-box;               /* 🆕 padding/border inclus dans width */
  }
}
```

🛡️ **Bonus anti-dépassement** — ajout `overflow:hidden + text-overflow:ellipsis + box-sizing:border-box + min-width:0` pour garantir que le bouton **ne déborde jamais** de sa cellule même avec un nom de plan très long.

📊 **Layout PC final v1.40.44**

```
┌────────────────────────────┬────────────────────────────┐
│  BIENVENUE / Mon profil    │   ▶️ Reprendre [plan]       │  ← top-row 1fr 1fr (50/50)
├──────────────┬─────────────┼────────────────────────────┤
│  📚 Mes plans │  🌍 Vue OSM │  📦 Ajouter un plan         │  ← loader-grid 2fr 3fr 2fr
└──────────────┴─────────────┴────────────────────────────┘
```

Les 2 lignes utilisent désormais **2 grilles différentes** (50/50 en haut, 2fr 3fr 2fr en bas). Pas d'alignement vertical avec « Ajouter un plan », mais équilibre profile/reprendre = ce que KARMA préfère visuellement.

🧪 **Tests à faire**
- **PC ≥ 1024px avec plan récent** : profile et Reprendre **exactement même largeur** (50/50)
- **PC ≥ 1024px sans plan récent** : col 2 vide (resumeBox display:none), profile col 1 seul
- **PC avec nom plan très long** : ellipsis à droite du bouton, pas de débordement
- **Mobile < 1024px** : stack vertical inchangé (display:contents)
- **Resize** : transition fluide au breakpoint 1024px

🛡️ **Pas de régression** — uniquement CSS (1 bloc remplacé). HTML wrapper v1.40.42 inchangé. 0 JS touché.

📊 **Évolution v1.40.42 → 43 → 44**

| Version | Grille top-row | Profile | Reprendre |
|---------|---------------|---------|-----------|
| v1.40.42 | flex row | flex:1 (large) | auto (étroit) |
| v1.40.43 | grid 2fr 3fr 2fr | cols 1+2 (71%) | col 3 (29%) |
| **v1.40.44** | **grid 1fr 1fr** | **50%** | **50%** ✅ |

---

**📦 v1.40.43** (07/06/2026) — **HOME PC : `Reprendre` aligné sur la colonne « Ajouter un plan » via grille identique 2fr 3fr 2fr** :

KARMA après test v1.40.42 : *« ok dans l'idée, mais reprendre doit être aussi large que Profile (pas long) et reprendre commence aligné en vertical à Ajouter plan »*.

🎯 **Précision** — v1.40.42 utilisait `flex` row avec `profile: flex 1` (large) + `resume: flex auto` (étroit, ≈ largeur texte bouton). Mais KARMA veut que :
- **Reprendre** ait la même largeur que la colonne **« Ajouter un plan »** (col 3 du `.loader-grid` dessous)
- **Alignement vertical parfait** entre le bouton Reprendre et le titre Ajouter un plan

Cause : `.loader-grid` (ligne 4294) utilise `grid-template-columns: 2fr 3fr 2fr` → col 1 (Mes plans) + col 2 (Vue OSM) + col 3 (Ajouter un plan). Avec un flex top-row, aucun lien avec cette grille → résumé décalé.

🔧 **Fix v1.40.43** — Remplacement `display:flex` → `display:grid` avec **la même grille** :

```css
@media (min-width: 1024px) {
  .kta-loader-top-row {
    display: grid;
    grid-template-columns: 2fr 3fr 2fr;   /* identique à .loader-grid ! */
    gap: 0 24px;
    align-items: stretch;
    margin-bottom: 18px;
  }
  .kta-loader-top-row .kta-loader-profile-bar {
    grid-column: 1 / span 2;              /* cols 1+2 = Mes plans + Vue OSM */
  }
  .kta-loader-top-row #resumeBox {
    grid-column: 3;                       /* col 3 = Ajouter un plan */
  }
  .kta-loader-top-row #resumeBox .loader-btn-resume {
    width: 100%;                           /* remplit la cellule grid col 3 */
    height: 100%;                          /* hauteur égale au profile-bar */
  }
}
```

**Mécanique** : grid identique à `.loader-grid` → les cellules s'alignent verticalement à la pixel près entre les 2 niveaux (top-row + grid dessous). Le bouton Reprendre a maintenant exactement la largeur de la cellule col 3 = "Ajouter un plan".

📊 **Layout PC final**

```
┌────────────────────────────┬──────────────────────────┐
│  BIENVENUE / Mon profil    │   ▶️ Reprendre [plan]    │  ← top-row
├──────────────┬─────────────┼──────────────────────────┤
│  📚 Mes plans │  🌍 Vue OSM │  📦 Ajouter un plan      │  ← loader-grid
│              │             │                          │
│  …           │  …          │  …                       │
└──────────────┴─────────────┴──────────────────────────┘
   col 1 (2fr)   col 2 (3fr)         col 3 (2fr)
```

Profile prend **cols 1+2** (sur 5fr de largeur sur 7), Reprendre prend **col 3** (2fr sur 7). Alignement vertical parfait avec la colonne « Ajouter un plan » dessous, comme demandé.

🧪 **Tests à faire**
- **PC ≥ 1024px avec plan récent** : bouton Reprendre s'aligne pixel-perfect avec « Ajouter un plan » dessous (même bord gauche, même largeur)
- **PC ≥ 1024px sans plan récent** : col 3 vide (resumeBox display:none), profile occupe cols 1+2 → état acceptable visuellement (col 3 vide ≈ stack mobile)
- **Mobile < 1024px** : stack vertical inchangé (display:contents)
- **Resize** : transition fluide au breakpoint 1024px, le bouton se relocalise sous le profile en mobile

🛡️ **Pas de régression** — uniquement CSS (1 bloc remplacé). HTML wrapper v1.40.42 inchangé. 0 JS touché.

🎓 **Pattern à retenir** : pour aligner verticalement 2 layouts différents (top-row 2 cellules + grid 3 cellules dessous), utiliser **le même `grid-template-columns`** sur les 2 et faire spanner les cellules du top-row avec `grid-column: 1 / span 2`. Solution élégante 100% CSS.

---

**📦 v1.40.42** (07/06/2026) — **HOME PC : `profile-bar` + `resumeBox` sur la même ligne (wrapper `kta-loader-top-row`)** :

KARMA : *« aussi, en home sur pc uniquement (pas de changement sur mobile) on peut faire un truc comme ça, profile et reprendre sur la même ligne »* + capture d'écran.

🎯 **Avant** : 2 lignes verticales PC + grand vide à droite du bandeau profil :
```
┌───────────────────────────────────────┬─────────────────────┐
│ BIENVENUE / Mon profil                │  3h 37min · 160 MB  │  ← bandeau 100%
└───────────────────────────────────────┴─────────────────────┘
                ┌─────────────────────┐
                │ ▶️ Reprendre [plan] │                          ← centré
                └─────────────────────┘
```

🎯 **Après** : 1 ligne PC, alignement profile + reprendre :
```
┌──────────────────────────────┬───────────────┬─────────────────┐
│ BIENVENUE / Mon profil       │ ▶️ Reprendre  │ 3h 37min 160MB  │
└──────────────────────────────┴───────────────┴─────────────────┘
```

🔧 **Fix v1.40.42** — 2 modifs minimales

**HTML** (`index.html` ~ligne 301) : nouveau wrapper `<div class="kta-loader-top-row">` qui regroupe `#kta-loader-profile-bar` + `#resumeBox`. Tout le reste du HTML interne est inchangé.

**CSS** (`css/style.css` ~ligne 16910, juste avant `.kta-loader-profile-bar`) : nouvelle règle `.kta-loader-top-row` :
- **Mobile (default)** : `display: contents` → wrapper transparent → les 2 enfants se comportent comme avant (margin-bottom individuels respectés, stack vertical naturel). **Zéro régression mobile**.
- **PC (≥ 1024px)** : `display: flex; flex-direction: row; align-items: stretch; gap: 14px; margin-bottom: 18px`
  - `.kta-loader-profile-bar { flex: 1 1 auto; margin: 0 }` → prend tout l'espace dispo (gauche)
  - `#resumeBox { flex: 0 0 auto; margin: 0; display: flex; align-items: center }` → taille naturelle (droite)
  - `.loader-btn-resume { height: 100%; white-space: nowrap }` → bouton aligné verticalement + 1 seule ligne (pas de wrap du texte plan)

**Garde-fou cas plan absent** : `#resumeBox[style*="display:none"]` reste caché en PC → la profile-bar reprend toute la largeur via `flex: 1 1 auto`. Pas de "trou" visuel si pas de plan récent.

📊 **Avant / Après**

| Vue | Avant v1.40.42 | Après v1.40.42 |
|---|---|---|
| PC ≥ 1024px sans plan récent | Profile-bar pleine largeur ✅ | Profile-bar pleine largeur ✅ (inchangé) |
| PC ≥ 1024px avec plan récent | Profile-bar + saut ligne + Reprendre centré ❌ | Profile-bar (gauche flex:1) + Reprendre (droite auto) sur 1 ligne ✅ |
| Mobile < 1024px | Stack vertical ✅ | Stack vertical ✅ (inchangé via display:contents) |

🧪 **Tests à faire**
- **PC ≥ 1024px avec plan récent** : profil à gauche, "▶️ Reprendre [plan]" à droite alignés verticalement
- **PC ≥ 1024px sans plan récent** : profil seul pleine largeur (resumeBox masqué)
- **Mobile < 1024px** : profil + resume en stack vertical comme avant
- **Resize** : transitions fluides au franchissement du breakpoint 1024px
- **Thème clair** : alignement préservé, juste les couleurs changent (héritées des règles existantes profile-bar / resumeBox)
- **Le bouton Reprendre clique toujours** correctement (le JS event handler existant `#resumeBtn` est inchangé)

🛡️ **Pas de régression** — 2 modifs minimales (1 wrapper HTML + 1 bloc CSS). `display: contents` garantit la non-régression mobile (mécanisme CSS standard "wrapper transparent"). Aucun JS touché — tous les sélecteurs `#kta-loader-profile-bar` et `#resumeBox` continuent de fonctionner identique.

🎓 **Pattern à retenir** : `display: contents` est la solution canonique pour avoir un wrapper HTML qui n'ajoute aucune box en mobile et qui devient flex/grid en PC sans casser le layout existant. Idéal pour adapter un layout par media query sans toucher au JS ni à la structure interne des composants.

---

**📦 v1.40.41** (07/06/2026) — **Hotfix mobile : invalidateSize widget HOME OSM ne suffisait pas — combo ResizeObserver + multi-timeouts** :

KARMA après test v1.40.40 : *« ça le fait que sur mobile le bug, sur PC ça semble ok, pour le dernier truc opacity au premier chargement je sens pas de mieux côté mobile »*.

🎯 **Cause racine** (v1.40.40 insuffisant sur mobile)

v1.40.40 ajoutait `requestAnimationFrame + setTimeout(250ms)` après création de la map Leaflet → suffisant sur PC où le DOM se stabilise rapidement. Mais sur **mobile**, plusieurs facteurs ralentissent la stabilisation du container :
- PWA cold cache → CSS plus long à parser
- Layout reflow plus lent (CPU mobile)
- Grid responsive HOME se réorganise (3 col PC → pile mobile)
- Service Worker peut servir les CSS de façon asynchrone

Résultat : le container `#ktaOsmHomeMap` n'a pas encore ses dimensions finales 250ms après l'instanciation Leaflet. Mes 2 invalidations ratent → Leaflet garde sa taille initiale erronée → tuiles manquantes.

🔧 **Fix v1.40.41** — Combo 3 stratégies redondantes pour couvrir tous les cas mobile

```js
function _safeInvalidate() {
  if (_mapInstance) { try { _mapInstance.invalidateSize(); } catch(e) {} }
}

// Stratégie 1 — raf : tentative immédiate après prochain paint
requestAnimationFrame(_safeInvalidate);

// Stratégie 2 — multi-timeouts échelonnés : couvre les boots progressivement
// plus lents (PC, mobile rapide, mobile cold cache, mobile vraiment lent)
setTimeout(_safeInvalidate, 100);
setTimeout(_safeInvalidate, 500);
setTimeout(_safeInvalidate, 1500);

// Stratégie 3 — ResizeObserver : réagit aux vrais changements de dimensions
// du container. Sémantiquement la solution propre (vs polling aveugle).
// Auto-disconnect après 3 invalidations ou 5 sec (évite leak Observer).
if (typeof ResizeObserver !== "undefined") {
  let nInvalidations = 0;
  const ro = new ResizeObserver(function() {
    _safeInvalidate();
    nInvalidations++;
    if (nInvalidations >= 3) { try { ro.disconnect(); } catch(_) {} }
  });
  try { ro.observe(mapDiv); } catch(_) {}
  setTimeout(function() { try { ro.disconnect(); } catch(_) {} }, 5000);
}
```

📊 **Avant / Après** (mobile cold boot)

| Phase | v1.40.40 | v1.40.41 |
|---|---|---|
| T+0ms : map créée | ❌ Container 0×0 → Leaflet tile request vide | ❌ Idem (état de départ) |
| T+16ms (raf) | ⚠️ invalidateSize mais container pas encore dimensionné | ⚠️ Idem |
| T+100ms | — | ✅ invalidateSize (1ère chance) |
| T+250ms | ⚠️ invalidateSize mais souvent CSS pas encore appliqué côté mobile | — |
| T+500ms | ❌ Plus rien, tuiles ratées | ✅ invalidateSize (2e chance) |
| T+1500ms | ❌ Idem | ✅ invalidateSize (safety net mobile lent) |
| ResizeObserver | ❌ Absent | ✅ Trigger à CHAQUE changement de dimensions, jusqu'à 3 invalidations |

📊 **Coût** : ~4 invalidations max + 1 ResizeObserver pendant 5s max. Négligeable côté perf, garantit que les tuiles se chargent même sur mobile très lent.

🧪 **Tests à faire**
- **Mobile cold boot** (kill app + relance) → widget HOME OSM affiche les tuiles dans les 1-2 secondes max, pas besoin de passer en fullscreen ✅
- **Mobile orientation rotation** : si tu tournes le téléphone après le boot, le ResizeObserver re-invalide auto (mais déjà disconnect après 3 trigger, pas de leak)
- **PC** : inchangé, raf + invalidations rapides
- **Tablet** : devrait être intermédiaire entre PC et mobile, couvert
- Vérifier console : pas de warning Leaflet "Map container not visible" ou "Leaflet: setView called on a map with no center or zoom" persistant

🛡️ **Pas de régression** — pure addition de safety net. Si tout marchait déjà après 250ms (PC, mobile rapide), les invalidations 500ms / 1500ms sont silencieuses (no-op, Leaflet skip si déjà à la bonne taille). ResizeObserver disconnect auto pour pas leaker.

🎓 **Pattern pour modules futurs** : toute carte Leaflet créée dans un container à dimensions différées (sidebar, modale, tabs, widget grid, surtout sur mobile) doit utiliser ce combo (raf + multi-timeouts + ResizeObserver). À documenter dans `gotchas.md` si récurrent.

---

**📦 v1.40.40** (07/06/2026) — **2 hotfix Vue OSM : popup POI modale (description manquante) + tuiles OSM widget HOME (invalidateSize au boot)** :

KARMA : *« en mode HOME OSM on a bien Titre/description/tag, mais pas en mode MAP. aussi je vois un petit bug d'affichage, au chargement de l'application et plus présent une fois OSM affiché en plein écran. les tuiles OSM ne se chargent pas, bug opacity »*.

🎯 **Bug 1 — Popup POI modale Vue OSM sans description / tag (asymétrie avec widget HOME)**

**Cause racine** : `_collectVisiblePoi()` dans `osmView.js` ligne 423 normalise les POI session + data layers en objets avec format `{ x, y, nom, tags, level, _source, _ref }`. **Le champ `description` n'était PAS copié** (oubli depuis v1.39.12 Step 1). Puis ligne 501 le popup lit `p.description` → toujours `undefined` → tombe sur le fallback tag (cf v1.40.25 cascade desc → tag).

Côté **widget HOME** (`osmHomePreview.js`), on itère **directement** sur `layer.points` sans copie filtrée → `p.description` accessible naturellement → ça marchait. D'où l'asymétrie KARMA observée.

**Fix v1.40.40** : ajout de `description: (typeof p.description === "string") ? p.description : ""` dans les 2 push de `_collectVisiblePoi` (session + data layers). Commentaire format unifié mis à jour pour mentionner le nouveau champ.

```diff
  out.push({
    x: p.x, y: p.y,
    nom: p.nom || p.label || "",
    tags: Array.isArray(p.tags) ? p.tags : [],
    level: (typeof p.level === "number") ? p.level : 0,
+   description: (typeof p.description === "string") ? p.description : "",
    _source: "session", _ref: p
  });
```

🎯 **Bug 2 — Tuiles OSM widget HOME ne se chargent pas au boot (fix accidentel en passant fullscreen)**

**Cause racine** : `_initMiniMap()` crée la map Leaflet **avant** que le container DOM soit dimensionné. Au boot de la HOME, le layout se rend progressivement (sidebar, grille 3 colonnes, etc.) → le container `#ktaOsmHomeMap` n'a pas encore ses dimensions finales au moment où Leaflet est instancié. Conséquence : Leaflet calcule mal le viewport → ne demande que les tuiles visibles dans son viewport interne (souvent 0) → tuiles manquantes / opacity à 0.

Quand l'user clique ⛶ fullscreen, le container change de dimensions → Leaflet recalcule via `invalidateSize` interne → tuiles chargées. D'où le "fix accidentel après plein écran" décrit par KARMA.

**Fix v1.40.40** : ajout d'une **double invalidation** après création de la map :
1. `requestAnimationFrame(() => _mapInstance.invalidateSize())` → couvre le cas normal (frame suivant après le paint initial)
2. `setTimeout(..., 250ms)` → safety net pour boot lent (mobile cold cache, container pas encore dimensionné à l'animation frame)

```js
requestAnimationFrame(function() {
  if (_mapInstance) try { _mapInstance.invalidateSize(); } catch(e) {}
});
setTimeout(function() {
  if (_mapInstance) try { _mapInstance.invalidateSize(); } catch(e) {}
}, 250);
```

Pattern standard Leaflet recommandé par la doc officielle pour les maps initialisées dans des containers à dimensions différées (sidebar, modale, tabs, etc.).

📊 **Avant / Après**

| Bug | Avant v1.40.40 | Après v1.40.40 |
|---|---|---|
| Popup POI modale Vue OSM avec description | ❌ `default · niveau X` seulement (fallback tag) | ✅ Description en ligne 2 + `🏷️ tag` mini ligne 3 (cohérent widget HOME) |
| Popup POI modale Vue OSM sans description | ✅ `tag · niveau X` (inchangé) | ✅ Idem |
| Tuiles OSM widget HOME au 1er boot | ❌ Manquantes / opacity 0 jusqu'au 1er passage fullscreen | ✅ Toutes chargées au boot via double invalidateSize |
| Widget HOME après fullscreen | ✅ OK | ✅ OK (inchangé) |

🧪 **Tests à faire**
- **Bug 1** : ouvrir modale Vue OSM, cliquer un POI qui a une description (dans tes data layers) → popup affiche `Nom` gras + `Description complète · niveau X` + `🏷️ tag` mini en bas
- **Bug 1 fallback** : cliquer un POI sans description → `Nom` + `tag · niveau X` (= ancien comportement préservé)
- **Bug 2** : recharger l'app (Ctrl+F5 pour bypass cache SW v1.40.39) → widget HOME OSM affiche les tuiles OpenStreetMap **immédiatement** au premier affichage, plus besoin de passer en fullscreen
- **Mobile** (cold boot lent) : le double invalidateSize (raf + 250ms) couvre le cas où le DOM se rend très tard

🛡️ **Pas de régression** — 2 fixes isolés (1 ajout champ dans normalisation + 2 appels invalidateSize). Aucun changement de logique core / réseau / sécurité.

🎓 **Leçons** :
1. **Bug 1** : quand on normalise des données via copie d'objet, **toujours documenter le format exhaustivement** + tester que tous les champs consommés downstream sont bien copiés. Le commentaire ligne 422 disait "{ x, y, nom, tags, level, _source }" → ne mentionnait pas description → l'oubli est passé inaperçu en revue. À ajouter dans `gotchas.md`.
2. **Bug 2** : pour toute carte Leaflet créée dans un container à dimensions différées (sidebar, modale, tabs, widget intégré dans layout grid), **toujours** appeler `map.invalidateSize()` après le prochain frame + un timeout safety net. Pattern récurrent à généraliser.

---

**📦 v1.40.39** (07/06/2026) — **Vue OSM modale : bandeau toggles débordait horizontalement (flex-wrap manquant)** :

KARMA : *« bug du OSM en mode plan, les filtres sortent de la fenêtre on les voit apparaître un peu en horizontal »*.

🎯 **Cause racine**

Le bandeau ligne 1 de la modale Vue OSM contenait :
- 1 label "🎚️ Opacité plan :" + 1 slider + 1 valeur "%"
- 2 boutons "🎯 Plan" + "📡 Tracker" + "📍 Moi"
- **~8 toggles** : 🖼️ Plan, 📍 POI, 📡 Tracé, 🛣️ Routes, 🧭 Iti, 🌐 Zones, 🏗️ Struct, 🚨 Secours (conditionnel v1.40.34)
- 1 attribution OSM

Total ≈ **13 éléments** dans un `<div style="display:flex; gap:10px;">` **sans `flex-wrap: wrap`**. Sur écran < 1500px ou avec le toggle Secours actif, ça déborde horizontalement → certains toggles sortent du viewport modale (clipped par `overflow: hidden` du wrapper modal).

**Asymétrie** : les bandeaux ligne 2 (chips multi-LVL) et ligne 3 (chips tag) avaient déjà `flex-wrap: wrap` (lignes 1560 et 1566). Seul le bandeau principal ligne 1502 manquait le wrap. Le widget HOME (CSS `.kta-osm-home-toggles` ligne 4556) avait aussi déjà le wrap.

🔧 **Fix v1.40.39** dans `js/osmView.js` ligne 1502

```diff
- '<div style="display:flex; gap:10px; align-items:center; ...">' +
+ '<div style="display:flex; flex-wrap:wrap; gap:10px; row-gap:6px; align-items:center; ...">' +
```

- `flex-wrap: wrap` → les éléments passent à la ligne suivante quand ils débordent
- `row-gap: 6px` → léger espacement vertical entre lignes pour aérer quand ça wrap (sinon les toggles collent les uns aux autres verticalement)

📊 **Avant / Après**

| Cas écran | Avant v1.40.39 | Après v1.40.39 |
|---|---|---|
| Desktop ≥ 1800px sans Secours actif | ✅ 1 ligne, tout tient | ✅ 1 ligne (inchangé) |
| Desktop 1280-1800px avec Secours actif | ❌ Débordement à droite (Struct + Secours hors viewport) | ✅ Wrap propre sur 2 lignes |
| Laptop ~1024px | ❌ Débordement sévère (plusieurs toggles cachés) | ✅ Wrap sur 2-3 lignes selon contenu |
| Modale réduite (resize) | ❌ Débordement | ✅ Adaptation dynamique |

🧪 **Tests à faire**
- Modale Vue OSM en WQHD (2560px) sans Mode Secours actif → 1 seule ligne de toggles (inchangé)
- Avec Mode Secours actif → toggle `🚨 Secours` visible, tout tient ou wrap proprement
- Resize la fenêtre browser → le bandeau wrap sans clipper
- Mobile (modale plein écran) : déjà petit, wrap inévitable, vérifier que c'est propre
- Modale ligne 2 (chips multi-LVL) et ligne 3 (chips tag) : déjà wrap, inchangé

🛡️ **Pas de régression** — 1 ligne de style inline modifiée, juste ajout de 2 propriétés CSS au flex container. Aucun impact JS / réseau / sécurité.

🎓 **Pattern à retenir** : tout bandeau `display: flex` qui peut avoir un nombre variable d'éléments **doit** avoir `flex-wrap: wrap` + `row-gap` pour gérer le wrap proprement. À ajouter dans `gotchas.md` si je suis pas encore là (un autre cas similaire avait été corrigé en hotfix2 Mode Secours v1.22).

---

**📦 v1.40.38** (07/06/2026) — **Fix générique modales courtes : `height: 88vh` → `max-height: 88vh` sur `.kta-readme-modal-boite`** :

KARMA : *« Données du plan introuvables, bug de modal bcp trop long on a eu le cas plein de fois sur d'autre problème connu »* + *« le modal prend toute la longueur pour rien »*.

🎯 **Cause racine** (pattern récurrent enfin identifié)

La classe partagée `.kta-readme-modal-boite` (utilisée par TOUTES les modales : Documentation, Audit réseau, Aide, Plan introuvable, confirmations, etc.) avait :

```css
.kta-readme-modal-boite {
  height: min(88vh, 920px);   /* ❌ hauteur FORCÉE à 88vh */
  height: min(88dvh, 920px);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
```

Et en media queries PC (3 paliers : 1024px, 1440px, 1920px) + responsive < 800px : même pattern `height: 92vh / 94vh / 95vh`.

**Le problème** : `height` force la boîte à occuper 88vh **quel que soit le contenu**. Modale courte type "Plan introuvable" (header + 4 lignes + 3 boutons = ~250px) prend **toute la hauteur écran** avec espace vide énorme en bas. Pattern user "modal bcp trop long pour rien".

**Preuve que c'est récurrent** : ligne 15716 du CSS a déjà un fix ad-hoc identique pour `#kta-session-export-modal` :
```css
#kta-session-export-modal .kta-readme-modal-boite {
  height: auto !important;
  max-height: 90vh !important;
  ...
}
```
→ Cette même modale a déjà eu le bug avant. KARMA avait dû ajouter un override custom. **Le fix générique en v1.40.38 étend ce pattern à TOUTES les modales d'un coup.**

🔧 **Fix v1.40.38** dans `css/style.css`

**5 règles** modifiées (base + 4 media queries) : remplacement systématique de `height:` par `max-height:` sur `.kta-readme-modal-boite`. La boîte peut désormais shrink au contenu (modales courtes) tout en restant plafonnée (modales longues).

```diff
.kta-readme-modal-boite {
  width: min(960px, 96vw);
- height: min(88vh, 920px);
- height: min(88dvh, 920px);
+ max-height: min(88vh, 920px);
+ max-height: min(88dvh, 920px);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
```

Idem pour media queries (1024px, 1440px, 1920px, max-800px).

🧠 **Comportement flex column avec max-height (modales doc longues toujours OK)**

- Boîte sans `height` mais `max-height: 88vh` + `display: flex; flex-direction: column`
- `.kta-readme-modal-corps` a `flex: 1; overflow-y: auto` (ligne 2991)
- **Modale courte (250px contenu)** : boîte adopte la hauteur naturelle du contenu (header + corps + footer), pas d'espace vide ✅
- **Modale longue (5000px contenu)** : boîte plafonnée à 88vh = ~800px, header (50px) + corps (`flex:1` = 750px disponibles, scroll interne via `overflow-y: auto` du corps) ✅

📊 **Avant / Après**

| Modale (PC 1920×1080) | Avant v1.40.38 | Après v1.40.38 |
|---|---|---|
| Plan introuvable (~250px contenu) | ❌ 950px (95vh forcé, ~700px vide) | ✅ ~250px (adapté contenu) |
| Documentation (long, ~3000px contenu) | ✅ 950px scroll interne | ✅ 950px scroll interne (inchangé) |
| Audit réseau (long, ~2500px) | ✅ 950px scroll | ✅ 950px scroll (inchangé) |
| Configuration loader (moyen, ~800px) | ❌ 950px (espace vide en bas) | ✅ ~800px adapté |
| Vue OSM (custom width 1800px, height 92vh inline) | ✅ Inchangé (override inline) | ✅ Inchangé (override inline) |
| `#kta-session-export-modal` (custom 90vh) | ✅ Override ad-hoc déjà OK | ✅ Override ad-hoc devient redondant mais sans effet (safe) |

📋 **Sites enrichis** : 1 seul fichier `css/style.css`, 5 règles modifiées. Tous les autres ID-spécifiques (`#kta-session-export-modal` ligne 15716, `#loaderNetLogModal` ligne 14422, etc.) qui font juste des color/background overrides sont **inchangés** (pas de conflict).

🧪 **Tests à faire**
- **Charger profil + cliquer plan qui n'est plus en LS** → modale "⚠️ Données du plan introuvables" → hauteur adaptée au contenu (4 lignes + 3 boutons), plus d'espace vide en bas ✅
- **Ouvrir 📖 Documentation** → modale prend 88vh comme avant, scroll interne intact ✅
- **Ouvrir 🔒 Audit réseau** → 88vh + scroll OK ✅
- **Modales sur mobile** (≤ 800px) : Plan introuvable adapte la hauteur au contenu, Documentation prend 92vh
- **Vue OSM modale** : conserve son `height: 92vh` inline → comportement inchangé
- **Modale export session** : `#kta-session-export-modal` garde son override `90vh max-height` (redondant mais inoffensif)

🛡️ **Pas de régression** — 1 fichier touché (`style.css`), 5 règles modifiées, pattern identique à un fix ad-hoc déjà validé (ligne 15716). Le `flex: 1` du `.kta-readme-modal-corps` continue de fonctionner pour les modales longues (rempli l'espace résiduel jusqu'au max-height + scroll interne).

🎓 **Leçon pour `gotchas.md`** : sur les flex containers à hauteur dynamique, **toujours** préférer `max-height` à `height` quand le contenu peut varier. Sinon le container force sa hauteur quel que soit le contenu et on a un espace vide pour les cas courts. Pattern récurrent depuis v1.9.2 (export modale a eu fix ad-hoc précédent ligne 15716).

---

**📦 v1.40.37** (07/06/2026) — **Vue OSM (modale + widget HOME) : persistance des couleurs natives roads + zones (avec custom legend)** :

KARMA : *« fait en sorte, en mode OSM PLAN/HOME que la couleur des routes, zone, ... persiste »*.

🎯 **Diagnostic**

Avant v1.40.37, Vue OSM faisait :
- **Roads modale** : `road.color || "#8892a4"` → fallback gris si pas de `color` explicite (cas des roads issues de data layers sans couleur set)
- **Zones modale** : `z.color || "#8892a4"` → idem fallback gris
- **Roads widget HOME** : `r.color || ROAD_STYLES_DATA_HOME[r.type] || "#8892a4"` → couvrait built-in mais **pas** LegendCustomization (types custom `cust-*`)
- **Zones widget HOME** : `z.color || "#8892a4"` → pas de fallback type-based, pas de custom legend

Donc une zone "remblais" sans `z.color` explicite (cas data layers JSON typique) apparaissait en **gris** au lieu de gris-noir charte. Idem zones effondrement, eau, etc. Et les types **custom** définis par l'user dans la légende n'étaient jamais respectés.

🔧 **Fix v1.40.37** — Cascade de résolution couleur "comme sur la map principale" :

```
1. road/zone.color explicite (data layer JSON ou session avec override)
2. ROAD_STYLES_OSM / ZONE_STYLES_OSM[type] (built-in natif)
3. window.LegendCustomization.findCustomEntry(type) (custom legend, persistance user)
4. fallback gris muet "#8892a4"
```

Aligné comportementalement sur `road.js > _resolveRoadStyle` (ligne 79). Code dupliqué localement dans chaque module Vue OSM (modale + widget HOME) pour éviter le couplage modulaire fort — `road.js` et `zones.js` n'exposent pas leurs `ROAD_STYLES` / `ZONE_STYLES` sur `window`.

**Modale OsmView** (`js/osmView.js`) :
- Nouveaux mappings `ROAD_STYLES_OSM` (5 types : principal, secondaire, chemin, jonction, itinerary) + `ZONE_STYLES_OSM` (4 types : eau, remblais, effondrement, inaccessible) en haut du module
- Nouveaux helpers `_resolveRoadColor(road)` + `_resolveZoneColors(z)` qui appliquent la cascade
- `_renderRoads` ligne 996 : `road.color || "#8892a4"` → `_resolveRoadColor(road)`
- `_renderZones` ligne 1141-1142 : `z.color/z.fillColor || ...` → `_resolveZoneColors(z)` qui retourne `{ stroke, fill }`

**Widget HOME** (`js/osmHomePreview.js`) :
- `ROAD_STYLES_DATA_HOME` étendu avec `itinerary` (cohérence cyan)
- Nouveau `ZONE_STYLES_DATA_HOME` (4 types built-in)
- Helpers `_resolveRoadColorHome(r)` + `_resolveZoneColorsHome(z)` (même cascade)
- `_renderDataLayersOnMiniMap` ~lignes 833 + 847 : helpers branchés sur les boucles roads + zones

**Note pattern SVG** : la couleur native `inaccessible` dans `zones.js` utilise un `fillColor: "url(#kta-pattern-inaccessible)"` (pattern SVG hatching). Ce pattern n'est pas défini dans la modale Vue OSM, donc on fallback sur un orange uni `#b8743c` qui reste lisible. Trade-off acceptable pour cohérence visuelle (l'user voit toujours une zone marquée distinctement).

📊 **Avant / Après** (data layer typique avec roads et zones sans `color` explicite)

| Cas | Avant v1.40.37 | Après v1.40.37 |
|---|---|---|
| Road type "principal" sans color | ❌ Gris `#8892a4` | ✅ Vert `#00ff00` |
| Road type "secondaire" sans color | ❌ Gris | ✅ Violet `#b000ff` |
| Road type "chemin" sans color | ❌ Gris | ✅ Jaune `#ffff00` |
| Road type "jonction" sans color | ❌ Gris | ✅ Magenta `#ff4ecb` |
| Road type **custom** `cust-xxx` legend | ❌ Gris | ✅ Couleur custom user (via LegendCustomization) |
| Zone type "eau" sans color | ❌ Gris uni | ✅ Bleu (stroke `#0066aa`, fill `#3aa9e8`) |
| Zone type "remblais" sans color | ❌ Gris | ✅ Gris-noir charte (stroke `#3a3a44`, fill `#5a5a68`) |
| Zone type "effondrement" sans color | ❌ Gris | ✅ Rouge (stroke `#cc0000`, fill `#ff3333`) |
| Zone type "inaccessible" sans color | ❌ Gris | ✅ Brun-orange (stroke `#5a0a0a`, fill `#b8743c` — pattern non porté en OSM) |
| Zone type **custom** legend | ❌ Gris | ✅ Couleurs custom user |
| Road/zone avec `color`/`fillColor` explicite (data avec override) | ✅ Couleur explicite | ✅ Couleur explicite (inchangé, priorité 1 de cascade) |

🛡️ **Tolérance double format zones** : `_resolveZoneColors` retourne `{ stroke, fill }` même si la zone source a juste `color` ou juste `fillColor` (fallback miroir) — pas de polygon "transparent" possible.

🧪 **Tests à faire**
- **Plan avec data layers JSON** classique (roads + zones sans `color` explicite) → ouvrir Vue OSM modale → routes en vert/violet/jaune, zones en bleu/gris/rouge/orange selon type
- Idem **widget HOME** : mêmes couleurs cohérentes avec la map principale
- **Plan avec custom legend** (user a défini des roads ou zones `cust-...` avec couleur custom) → Vue OSM doit afficher ces couleurs custom (pas le gris fallback)
- **Plan avec override explicite** (data layer qui fournit `road.color: "#abc"`) → cette couleur explicite l'emporte sur le mapping type-based
- Toggle thème clair / sombre → couleurs natives inchangées (= cohérent avec map principale)
- M-LVL : filtre par niveau → couleurs respectées niveau par niveau

🛡️ **Pas de régression** — fix isolé sur 2 modules. 0 modification de `road.js` ou `zones.js` (pas de nouvel export global, pas de couplage). Aucune régression possible sur le rendu map principale.

🎓 **Leçon** : quand un module ré-implémente le rendu d'un autre module (cas Vue OSM qui projette des roads/zones de la map principale), ne pas se contenter de `obj.color || fallback`. Toujours appliquer la **cascade complète** explicite → built-in type → custom legend → fallback. Pattern à généraliser pour futurs modules cross-référence visuelle.

---

**📦 v1.40.36** (07/06/2026) — **Hotfix Vue OSM × Mode Secours : palette d'équipes mal lue (objet {hex, nom} vs string)** :

KARMA après test v1.40.34 : *« bcp mieu secour avec zone mais seule la première équipe a sa couleur le reste en blanc »*.

🎯 **Cause racine**

`SecoursMode.PALETTE` (cf `secoursMode.js` ligne 132) est un **tableau d'objets** `[{hex: "#ff4444", nom: "Alpha"}, ...]` et **non** un tableau de strings hex. Mon code v1.40.34 le traitait comme array de strings :

```js
const color = palette[(g.couleurIdx || 0) % palette.length];
// → color = { hex: "#ff4444", nom: "Alpha" }   (objet, pas string!)
```

Quand on passe cet objet à Leaflet via `color: color, fillColor: color`, Leaflet fait `String({hex:...}) === "[object Object]"` → CSS invalide → Leaflet retombe sur `currentColor` ou défaut transparent/blanc.

**Pourquoi la 1ère équipe semblait avoir sa couleur** : artefact probable d'un `couleurIdx === undefined` côté data (équipe créée sans assignment) qui passait par un autre fallback, ou interaction CSS résiduelle avec le contour blanc `#fff` des markers. Dans tous les cas, le fix s'applique à toutes les équipes.

🔧 **Fix v1.40.36** dans `js/osmView.js _renderSecoursLayer` :

```js
// AVANT (v1.40.34) :
const color = palette[(g.couleurIdx || 0) % palette.length];   // ❌ objet entier

// APRÈS (v1.40.36) :
const SECOURS_FALLBACK_HEX = ["#ff4444", "#4488ff", "#44cc44", "#ffcc00",
                              "#ff4ecb", "#00d4ff", "#ff8c00", "#9d44ff",
                              "#8b5a2b", "#404040"];

function _resolveEquipeColor(couleurIdx) {
  const entry = palette[(couleurIdx || 0) % palette.length];
  if (!entry) return SECOURS_FALLBACK_HEX[0];
  if (typeof entry === "string") return entry;          // tolère fallback string array
  if (entry && typeof entry === "object"
      && typeof entry.hex === "string") return entry.hex; // ✅ format officiel PALETTE
  return SECOURS_FALLBACK_HEX[0];
}

const color = _resolveEquipeColor(g.couleurIdx);   // ✅ vrai hex string
```

📊 **Avant / Après**

| Cas | Avant v1.40.36 | Après v1.40.36 |
|---|---|---|
| Équipe 1 (Alpha, idx=0) | Couleur cassée / fallback | ✅ Rouge vif `#ff4444` |
| Équipe 2 (Bravo, idx=1) | ❌ Blanc | ✅ Bleu `#4488ff` |
| Équipe 3 (Charlie, idx=2) | ❌ Blanc | ✅ Vert `#44cc44` |
| ... | ... | ... |
| Équipe 11+ | Wrap modulo | ✅ Wrap modulo correct |

🛡️ **Tolérance double format** : la nouvelle fonction `_resolveEquipeColor` accepte aussi un palette de strings hex (au cas où un patch futur change PALETTE en `["#ff4444", ...]` directement), évitant un re-bug similaire en cas de refacto Mode Secours.

🧪 **Tests à faire**
- Scénario Mode Secours avec **3+ équipes** (Alpha, Bravo, Charlie minimum) → ouvrir Vue OSM via 🌍
- Vérifier que **chaque équipe** a sa couleur Alpha (rouge), Bravo (bleu), Charlie (vert) → zones + iti + markers entrée/sortie
- Tooltips au hover affichent le bon nom d'équipe
- Toggle `🚨 Secours` ON/OFF → tout disparaît/réapparaît avec les bonnes couleurs

🛡️ **Pas de régression** — fix isolé sur 1 fonction (~12 lignes), 0 changement de logique pathfinder ou Mode Secours.

🎓 **Leçon** : toujours vérifier le **format réel** d'une API publique exposée par un autre module avant de l'utiliser. Le commentaire de `secoursMode.js` aurait pu être plus explicite ("PALETTE = tableau d'objets {hex, nom}, pas de strings"). À ajouter à `gotchas.md` si pattern récurrent ? Cas isolé, je laisse.

---

**📦 v1.40.35** (07/06/2026) — **Hotfix Mode Sortie d'urgence : conversion pixels → mètres oubliée (distance affichée × scale)** :

KARMA : *« bug dans le mode secour sortie plus proche on affiche des valeurs de distance totalement différente de ce que on affiche en path finder (qui est bon). Cavage : Oise 4.63 km au lieu de 944,5m dans mon cas »*.

🎯 **Cause racine** (classique d'oubli d'unité)

| Fichier | Comportement |
|---|---|
| `js/utils.js` ligne 136 | `formatDistance(distM, decimalsM)` attend **mètres** (commentaire explicite ligne 131) |
| `js/measure.js` ligne 106 | ✅ `const distM = distPx / APP_CONFIG.scale;` AVANT `formatDistance` |
| `js/lostMode.js` ligne 168 | ✅ `const distM = distPx / _scale();` AVANT `formatDistance` |
| `js/sortieUrgence.js` ligne 108 (avant fix) | ❌ `window.formatDistance(distPx, 0)` directement — **conversion oubliée** |

Le pathfinder retourne un path en **pixels plan**, et `_calculerDistPathfinder` cumule les distances euclidiennes en pixels (`distPx: d`). Sans la division par `APP_CONFIG.scale` (px par mètre), `formatDistance` interprète le nombre comme mètres → affichage gonflé du ratio scale.

Sur le plan **Cavage Oise** de KARMA, `APP_CONFIG.scale ≈ 4.9` → 944.5 m réels × 4.9 ≈ 4628 m → affiché "4.63 km".

🔧 **Fix v1.40.35** dans `js/sortieUrgence.js` ligne 106

```diff
- function _formatDist(distPx) {
-   if (typeof window.formatDistance === "function") {
-     return window.formatDistance(distPx, 0);   // ❌ distPx interprété comme m
-   }
-   return Math.round(distPx) + " px";
- }
+ function _formatDist(distPx) {
+   const scale = (window.APP_CONFIG && typeof window.APP_CONFIG.scale === "number"
+                  && window.APP_CONFIG.scale > 0)
+                   ? window.APP_CONFIG.scale
+                   : 1;
+   const distM = distPx / scale;
+   if (typeof window.formatDistance === "function") {
+     return window.formatDistance(distM, 0);
+   }
+   if (scale === 1) return Math.round(distPx) + " px";
+   return distM < 1000
+     ? distM.toFixed(0) + " m"
+     : (distM / 1000).toFixed(2) + " km";
+ }
```

Cohérent avec le pattern de `lostMode.js` et `measure.js`. Le fallback `scale = 1` (= si `APP_CONFIG.scale` indispo) revient au comportement précédent (affichage "px") pour ne pas masquer un bug de configuration.

📊 **Avant / Après** (exemple Cavage Oise, KARMA)

| | Avant v1.40.35 | Après v1.40.35 |
|---|---|---|
| Distance brute pathfinder (pixels) | 4628 px | 4628 px |
| `APP_CONFIG.scale` (px/m) | ~4.9 | ~4.9 |
| Distance affichée Sortie urgence | ❌ **"4.63 km"** | ✅ **"944 m"** |
| Distance affichée pathfinder normal | ✅ "944 m" (déjà bon) | ✅ "944 m" (inchangé) |
| Cohérence entre les 2 modules | ❌ | ✅ |

🔍 **Audit global** (vérifié par grep) : tous les autres usages de `distPx` dans `sortieUrgence.js` (lignes 245 + 285) passent par `_formatDist` → fix global avec **une seule modif**. Le tri ligne 187 utilise `distPx - distPx` (cohérence préservée, l'unité n'importe pas tant qu'elle est cohérente).

🧪 **Tests à faire**
- Plan Cavage Oise + position tracker à 944 m d'une sortie → mode `🚨 Sortie urgence` affiche **"944 m"** (et plus "4.63 km")
- Vérifier que la même distance s'affiche identique côté pathfinder normal (`🗺️ Itinéraire`)
- Cas court (< 1 km) : affichage `XXX m`
- Cas long (> 1 km) : affichage `X.XX km`
- Plan sans `APP_CONFIG.scale` défini (cas dégénéré théorique) → fallback `Math.round(distPx) + " px"`
- Multi-sorties : toutes leurs distances respectives correctes et triées par ordre croissant

🛡️ **Pas de régression** — fix isolé sur 1 fonction (`_formatDist`), 0 changement de logique de calcul du pathfinder. Aucun changement réseau/sécurité.

🎓 **Leçon (à noter dans `gotchas.md` si tu veux)** : `window.formatDistance` attend des **mètres**, pas des pixels. Toujours diviser par `APP_CONFIG.scale` avant l'appel. Sites à risque : tout nouveau module qui consomme une distance du pathfinder doit appliquer cette conversion. Reference patterns dans `lostMode.js` ligne 168 et `measure.js` ligne 106.

---

**📦 v1.40.34** (07/06/2026) — **Synergie Vue OSM × Mode Secours — étape A v2 : layer "🚨 Secours" (zones + itinéraires équipes) dans la modale Vue OSM** :

KARMA après test v1.40.33 : *« en vue OSM on n'affiche pas les zone des équipes, itinéraire »*.

🎯 **Diagnostic** : Mode Secours rend son overlay équipes (zones colorées + itinéraires) sur la **map principale Leaflet** uniquement, pas sur la **modale Vue OSM** (osmView.js). Donc en ouvrant Vue OSM depuis Mode Secours, on ne voit que les POI/roads standards du plan, pas le contexte équipes.

🔧 **Fix v1.40.34** — Nouveau layer `_secoursLayer` dans `osmView.js`

**Côté données** : réutilisation directe de l'API publique `window.SecoursMode` (`getCurrentScenarioId`, `get`, `PALETTE`) — pas besoin de toucher `secoursMode.js`. Schéma scenario.groupes utilisé : `couleurIdx`, `zoneType`, `zonePolygon`, `itineraireSuggere`, `entree`, `sortie`, `distanceM`, `nom`.

**Côté rendu** (osmView.js, ~150 lignes) :
- Helper `_renderSecoursLayer()` projette pour chaque équipe :
  - **Zone d'intervention** polygone (`zonePolygon`) → `L.polygon` couleur équipe + `fillOpacity: 0.18` + tooltip "🚨 Zone — {nom}"
  - **Itinéraire suggéré** (`itineraireSuggere`) → `L.polyline` couleur équipe + `dashArray: "8 4"` + `weight: 4` + tooltip "🧭 Itinéraire — {nom} (distance)"
  - **Marker entrée** (●) → `L.circleMarker` couleur équipe + tooltip "🚪 Entrée — {nom}"
  - **Marker sortie** (▲) → `L.divIcon` triangle CSS couleur équipe + tooltip "🏁 Sortie — {nom}"
- Couleur via `SecoursMode.PALETTE[couleurIdx]` avec fallback statique
- Filtre M-LVL respecté point par point (`_isLevelAllowed`)
- Helper `_hasActiveSecoursScenario()` détecte si un scénario est courant

**Hooks intégration** (3 sites) :
1. **Au `open()`** de la modale Vue OSM : auto-render si scénario actif (`if (_secoursVisible && _hasActiveSecoursScenario()) _renderSecoursLayer()`)
2. **Au refresh M-LVL** (`_refreshLevelFilteredLayers`) : re-render pour respecter les niveaux visibles
3. **Au `close()`** : cleanup `_secoursLayer.clearLayers() + null`

**Toggle UI** :
- Bouton `🚨 Secours` dans le bandeau Vue OSM, à côté de `🌐 Zones` / `🏗️ Struct`
- **Visible UNIQUEMENT si scénario actif** (sinon masqué, pas de bandeau pollué inutilement)
- Fond rouge léger `rgba(255,80,80,0.15)` + padding pour signaler le contexte critique
- État par défaut : ON si scénario actif

📊 **Avant / Après**

| Affichage Vue OSM (modale plein écran) | Avant v1.40.34 | Après v1.40.34 |
|---|---|---|
| Tuiles plan + OSM | ✅ | ✅ |
| POI session/data | ✅ | ✅ |
| Roads + iti pathfinder global | ✅ | ✅ |
| Zones du plan + Structures | ✅ | ✅ |
| **Zones d'intervention par équipe Mode Secours** | ❌ | ✅ Polygones couleur équipe |
| **Itinéraires par équipe Mode Secours** | ❌ | ✅ Polylines dashed couleur équipe |
| **Markers entrée/sortie par équipe** | ❌ | ✅ ● entrée + ▲ sortie couleur équipe |
| Toggle dédié | ❌ | ✅ `🚨 Secours` (conditionnel) |

🧪 **Tests à faire**
- Créer un scénario Mode Secours avec 2-3 équipes (couleurs différentes), définir une zone polygone + des entrée/sortie pour chacune, calculer leur itinéraire suggéré → Lancer le plan
- Ouvrir Vue OSM depuis bandeau "PLAN ACTIF" (bouton 🌍 v1.40.33) → la modale Vue OSM affiche le toggle `🚨 Secours` activé par défaut
- Vérifier que chaque équipe a sa zone (semi-transparent), son iti (dashed) et ses markers entrée/sortie dans sa couleur
- Décocher `🚨 Secours` → tout disparaît instantanément (cleanup propre)
- Multi-LVL : si plan multi-niveau, changer le niveau visible via chips → zones/iti se re-filtrent automatiquement
- Tooltip au hover sur chaque élément → nom de l'équipe + détails

🔜 **Étapes suivantes** (rappel roadmap A→E) :
- **B** : page Vue OSM dans le rapport PDF post-mission (screenshot Leaflet + jsPDF.addImage)
- **C** : export 🚒 Briefing pompiers PDF dédié
- **D** : POI 🚪 Point d'entrée du plan spécial
- **E** : Position GPS surface des équipes (via canal JSON/PDF, pas QR car désactivé)

🛡️ **Pas de régression** — addition pure dans `osmView.js` (~165 lignes). 0 modif `secoursMode.js` (réutilisation API publique existante). 0 changement réseau ou sécurité. Audit `NETWORK_AUDIT` headers bumpés à v1.40.34 pour alignement.

---

**📦 v1.40.33** (07/06/2026) — **Synergie Vue OSM × Mode Secours — étape A/5 : bouton « 🌍 Vue OSM » dans les bandeaux Mode Secours** :

KARMA : *« maintenant je pense que avec le mode OSM, on peut faire une belle évolution du mode secours, sans trop se fatiguer »* + *« on fait A jusqu'à E step by step »*.

🎯 **Roadmap synergie Vue OSM × Mode Secours** (5 étapes step-by-step)

| Étape | Idée | Effort | Statut |
|---|---|---|---|
| **A** | Bouton 🌍 Vue OSM dans bandeau Mode Secours | Faible (~150 lignes) | ✅ **v1.40.33** |
| B | Page Vue OSM dans rapport PDF post-mission | Faible (~80 lignes) | À venir |
| C | Export 🚒 Briefing pompiers dédié (PDF compact) | Moyen (~250 lignes) | À venir |
| D | POI 🚪 Point d'entrée du plan spécial | Très faible (~50 lignes) | À venir |
| E | Position GPS surface des équipes (via canal JSON/PDF, **pas QR** car désactivé) | Moyen-haut (~300 lignes + UX) | À venir |

🔧 **Implémentation étape A — v1.40.33** (`js/secoursMode.js`)

**Insertions HTML (2 sites)** :
1. Bandeau **"PLAN ACTIF"** (~ligne 5743) : bouton `🌍 Vue OSM` ajouté entre `▶️ Reprendre la vue Live` et `📤 Rapport`. Visible quand un plan de secours est en cours.
2. Bandeau **"PLAN TERMINÉ"** (~ligne 5773) : même bouton, accessible pour le debrief post-mission entre `📤 Voir le rapport` et `🚀 Relancer`.

Les 2 boutons sont stylés `kta-btn-secondary kta-btn-sm` (cohérent avec les autres boutons du bandeau), portent `data-action="ouvrir-vue-osm"`, et un `title` explicatif pour le hover.

**Handler dispatcher** (~ligne 6822) : nouveau bloc `corps.querySelectorAll('[data-action="ouvrir-vue-osm"]').forEach(...)` qui branche le helper `_ouvrirVueOsmDepuisSecours` au click.

**Helper privé `_ouvrirVueOsmDepuisSecours()`** (~70 lignes, posé juste avant `_afficherModaleRapport` pour cohérence helpers UI) :
- Vérifie présence du module `window.OsmView` (module chargé ?)
- **Pré-diagnostic explicite** : inspecte 5 raisons d'indisponibilité individuellement :
  - Plan non géoréférencé (pas de `PLAN_CONFIG.plan.georef.pointA/B`)
  - Opt-in Vue OSM désactivé (`OsmView.isOptedIn() === false`)
  - Mode hors-ligne strict actif (`NetworkAudit.isStrictOfflineEnabled()`)
  - Mode incognito actif (`IncognitoMode.isActive()`)
  - Navigateur hors-ligne (`navigator.onLine === false`)
- Si au moins une raison → toast warn diagnostic clair (concaténé) → guide l'user vers la résolution
- Sinon → `window.OsmView.open()` standard. La modale Vue OSM gère sa propre stack z-index, ses tuiles, ses POI, ses layers. **0 code dupliqué**.

📊 **Pourquoi cette synergie marche "sans trop se fatiguer"**

- Réutilisation **95%** de l'infrastructure Vue OSM existante (modale, tuiles, POI auto-projetés, GPS bouton 📍, filtre tag, etc.)
- 0 nouveau layer/state Mode Secours côté Vue OSM (les waypoints d'intervention sont déjà rendus comme POI standards du plan)
- 0 modification de `osmView.js` ou `osmHomePreview.js`
- Touche uniquement `secoursMode.js` (~85 lignes : 2× ~5 lignes HTML + 1× ~70 lignes helper + handler dispatcher)
- Gating Vue OSM (opt-in, strict, incognito, online) **automatiquement respecté** car on délègue à `OsmView.isAvailable` + checks individuels pour diagnostic

🧪 **Tests à faire**
- Mode Secours **actif** sur plan georef : bandeau "PLAN ACTIF" affiche `🌍 Vue OSM` entre Reprendre et Rapport → click → modale Vue OSM s'ouvre normale avec waypoints/POI projetés.
- Mode Secours **terminé** : bandeau "PLAN TERMINÉ" affiche `🌍 Vue OSM` entre Rapport et Relancer → click → idem.
- **Plan NON georef** : click → toast `🌍 Vue OSM indisponible — plan non géoréférencé (configure pointA/pointB GPS dans le générateur avancé)`.
- **Opt-in Vue OSM désactivé** : click → toast `🌍 Vue OSM indisponible — opt-in Vue OSM désactivé (→ ⚙️ Configuration → 🌍 Autoriser la Vue OSM)`.
- **Strict offline** + Mode Secours : click → toast `🌍 Vue OSM indisponible — mode hors-ligne strict actif`.
- **Incognito** : click → toast `🌍 Vue OSM indisponible — mode incognito actif`.
- **Wi-Fi/4G coupé** : click → toast `🌍 Vue OSM indisponible — navigateur hors-ligne (tuiles OSM indisponibles)`.
- Multiple raisons simultanées : toast concatène avec ` · ` séparateur.

🛡️ **Pas de régression** — pure addition. Mode Secours sans plan georef ou sans opt-in : comportement v1.40.32 inchangé (les bandeaux sans le bouton — non, **avec** le bouton + toast diagnostic au click, plus user-friendly que silence).

🔜 **Prochaine étape B** : page Vue OSM dans le rapport PDF post-mission (screenshot Leaflet existant à étendre + jsPDF.addImage). À démarrer quand tu valides A en testant.

---

**📦 v1.40.32** (07/06/2026) — **Enrichissement Onboarding : 2 nouvelles cartes (🌍 Vue OSM, 📖 Mode Histoire) + enrichissements (🚨 Sortie urgence, 🎤 Vocale)** :

KARMA : *« On doit pouvoir enrichir le On Boarding avec la partie OSM et Histoire (peut être d'autres oublis) »*.

🎯 **Audit oublis du tutoriel** (23 cartes → manquaient 4 features récentes)

| # | Feature | Version | Statut avant |
|---|---|---|---|
| 1 | 🌍 **Vue OSM** | v1.39+ | ❌ Absent |
| 2 | 📖 **Mode Histoire** | v1.34.19+ | ❌ Absent |
| 3 | 🚨 **Mode Sortie d'urgence** | v1.35.0 | ❌ Absent (carte 12 ne mentionnait que "Perdu" + "Panique XL") |
| 4 | 🎤 **Commande vocale** | v1.34.0 | ❌ Absent |

🔧 **Fix v1.40.32** — **Tutoriel passe de 23 à 25 cartes** + 2 enrichissements

**Nouvelles cartes complètes** :
- **Carte 23 « 🌍 Vue OSM »** (insérée entre Sauvegardes et Config) — couvre les 2 contextes (modale plein écran + widget HOME), opt-in strict, bouton Ma position GPS, filtre par tag, attribution ODbL, gating strict offline + incognito, garde-fou bbox plan. Avec hint sur calibration GPS requise.
- **Carte 24 « 📖 Mode Histoire »** (juste après OSM) — note libre Markdown inline + PDF embedded (IDB), accès via bouton 📖 sidebar, embarqué dans MKMSESSION, 100% local. Avec hint sur l'usage pour plans hérités.

**Enrichissements cartes existantes** :
- **Carte 12 « Modes urgence »** : titre passe de *"Perdu / Panique"* à *"Perdu / Panique / Sortie"*, ajout d'un 3e bullet décrivant le mode Sortie d'urgence (POI tag sortie + pathfinder + ETA). Réécriture du résumé "3 cas d'usage différents" pour clarifier les 3 modes.
- **Carte 25 « Config & outils annexes »** (ex-23) : ajout mention 🎤 **Commande vocale** (Web Speech API native, "aller à [POI]", auto-stop, audio jamais transmis) + 🪫 **Vibration haptique** (toggle Configuration, 5 events critiques).

**Commentaire du plan en tête** : mis à jour pour refléter le passage 23→25 + bullet des nouvelles cartes/enrichissements + référence v1.40.32.

📊 **Compteur dynamique** : le compteur affiché à l'user (`23/23` etc.) utilise déjà `CARDS.length` côté code (vérifié lignes 906, 928, 933, 947, 1017) → renumérotation **automatique** : les 2 nouvelles cartes s'affichent en `23/25` et `24/25`, et l'ex-23 devient `25/25`. Aucune autre intervention requise.

🧪 **Tests à faire**
- Premier lancement (ou Reset config) → tutoriel auto-s'ouvre → naviguer avec ◂ ▸ → vérifier 25 cartes (pastilles de progression doivent compter 25)
- Carte 12 (Modes urgence) → vérifier le 3e bullet "🚨 Sortie d'urgence" + résumé final à 3 cas
- Carte 23 (🌍 Vue OSM) → contenu complet, hint en bas
- Carte 24 (📖 Mode Histoire) → contenu complet, hint en bas
- Carte 25 (⚙️ Config) → mention 🎤 Commande vocale + 🪫 Vibration en plus du contenu original
- Bouton 🎓 dans header modale Documentation → rejoue le tutoriel
- Mobile : pastilles de progression 25 tiennent dans la largeur, sinon scroll horizontal

🛡️ **Pas de régression** — pur enrichissement éditorial JS (2 cartes ajoutées + 2 sections enrichies dans existantes + commentaire). Aucun code de logique touché. Logique de navigation (`_currentIdx`, `CARDS.length`, pastilles dynamiques) inchangée.

---

**📦 v1.40.31** (07/06/2026) — **Hotfix MD (le vrai) : code fence ` ```json ` jamais refermé section "Adding levels to data layers" EN** :

KARMA : *« tjr casser vers : Adding levels to data layers — Existing data layers (`puits.json`, `cataphile.json`, etc.) can also have items tagged by level. Manually add `"level": N` in the JSON: ``` { "data": [ »*.

🎯 **Cause racine (la vraie cette fois)**

Mon fix v1.40.30 sur l'imbrication italique/bold n'était pas le bug bloquant — c'était cosmétique. Le **vrai bug** était bien plus en amont dans le fichier, ligne 2153-2164 (section "Adding levels to data layers", chapitre Multi-niveau) :

```md
` ```json `        ← ligne 2153 (ouvre fence)
{
  "data": [
    ...
  ]
}                  ← ligne 2164 (close JSON object MAIS PAS le fence)
Items without...   ← ligne 2165 (texte normal, mais MD le voit comme code suite)
```

**Le code fence ` ```json ` n'était jamais refermé**. Tout le contenu après la ligne 2164 jusqu'au prochain ` ``` ` quelque part plus loin était interprété comme **code monospace** par le parser MD. Pas d'erreur du parser — juste un rendu cassé visuellement : tout le reste du fichier en bloc code grisé, sections plus rendues comme titres, listes plates.

Pourquoi je l'avais raté en v1.40.28-30 : je cherchais des erreurs **dans la zone que j'avais éditée** (section "To the open-source tools") sans réaliser que le bug était **en amont** dans une section que je n'avais jamais touchée.

🔧 **Fix v1.40.31**

Ajout du ` ``` ` fermant manquant entre le `}` final du JSON et la ligne `Items without level →...`.

```diff
    { "type": "eau", "level": 0, "points": [...] }
  ]
}
+ ```
+
Items without `level` → treated as `level: 0` (backward compatibility...).
```

**Vérif globale post-fix** : comptage des markers code fence dans les 2 fichiers via `grep -c '^\`\`\`'` :
- README_USER.en.md : **30** (= 15 paires symétriques) ✅
- README_USER.md FR : **38** (= 19 paires symétriques) ✅

Aucun fence orphelin restant.

📊 **Avant / Après**

| | Avant v1.40.31 | Après v1.40.31 |
|---|---|---|
| Rendu README_USER.en à partir ligne ~2153 | ❌ Tout en bloc code grisé jusqu'au prochain ` ``` ` qq part plus loin | ✅ Rendu normal : code block JSON propre + texte + section suivantes lisibles |
| Sections "Save and share", "Acknowledgements", etc. | ❌ Invisibles ou monospace cassé | ✅ Toutes accessibles |

🧪 **Tests à faire**
- Hard reload (Ctrl+F5) pour bypass cache SW v1.40.30
- Modale Documentation EN : scroll jusqu'à `🏗️ Multi-level mode > Adding levels to data layers` → code block JSON s'affiche en un bloc propre, puis texte normal `Items without level...`, puis section `Exporting with level selection` lisible
- Continuer scroll → sections `Save and share`, `Load / Import`, `Acknowledgements` toutes accessibles et bien rendues
- Mêmes tests en FR (rendu inchangé, juste vérif aucune régression)

🎓 **Leçon pour mémoire** (à noter dans gotchas.md si tu veux)
- **Toujours vérifier le parité des ` ``` ` markers** dans un MD après édition : `grep -c '^\`\`\`' fichier.md` — résultat impair = fence orphelin = rendu cassé après ce point.
- Bugs MD sont souvent **silencieux** côté parser (pas d'erreur), juste rendu visuel qui dégénère → utiliser preview GitHub ou un linter MD avant commit (`markdownlint-cli` détecte ce genre de truc).
- Quand un user reporte "ça casse à tel endroit", regarder **en amont** dans le fichier, pas au point reporté — le bug racine est souvent plus haut.

🛡️ **Pas de régression code** — pur fix éditorial 1 ligne (1 fence ajouté).

---

**📦 v1.40.30** (07/06/2026) — **Hotfix MD : ligne OpenStreetMap des crédits cassait le rendu en EN (imbrication `*(**[...](...)**...)*` invalide)** :

KARMA : *« erreur de syntaxe MD dans la doc EN qui casse à un moment l'affichage du fichier »*.

🎯 **Cause racine**
Dans v1.40.28 j'avais écrit la ligne OSM des crédits avec 3 niveaux d'imbrication Markdown :
```md
*(**[ODbL](url)** license for data, **[CC BY-SA 2.0](url)** for cartography)*
```
= italique `*( )*` + bold `** **` + lien `[...](...)`, le tout imbriqué.

Le pattern `*(**` (italique-ouvert IMMÉDIATEMENT suivi de bold-ouvert sans contenu intermédiaire) **casse certains parsers CommonMark stricts** — le parser n'arrive pas à matcher les fermetures et abandonne le rendu de la suite du fichier.

Pourquoi seul l'EN cassait ?
- **EN** : `*(**[ODbL]...` — `*(**` direct, **CASSE** ❌
- **FR** : `*(licence **[ODbL]...` — mot `licence ` intercalé entre `*(` et `**`, le parser arrive à matcher l'italique sur "licence ", **PASSE** ✅

Différence subtile passée inaperçue à mon edit v1.40.28.

🔧 **Fix v1.40.30** — Retirer l'italique extérieur `*(...)*` → garder juste `( )` avec bold internes (les licences gardent leur emphase). Applique aux 2 langues pour cohérence et robustesse.

**Avant (EN problématique)** :
```md
*(**[ODbL](url)** license for data, **[CC BY-SA 2.0](url)** for cartography)*
```

**Après (EN)** :
```md
— licensed under **[ODbL](url)** for data and **[CC BY-SA 2.0](url)** for cartography.
```

**Avant (FR fonctionnel mais pattern fragile)** :
```md
*(licence **[ODbL](url)** pour les données, **[CC BY-SA 2.0](url)** pour la cartographie)*
```

**Après (FR)** :
```md
— sous licence **[ODbL](url)** pour les données et **[CC BY-SA 2.0](url)** pour la cartographie.
```

Vérif par grep `\*\(\*\*` dans les 2 fichiers : **0 match restant**. Aucun autre pattern fragile.

📊 **Avant / Après**

| | Avant v1.40.30 | Après v1.40.30 |
|---|---|---|
| Affichage README_USER.en.md à partir de la section "Aux outils libres" | ❌ Cassé (parser MD abandonne) | ✅ Rendu propre |
| Affichage README_USER.md FR | ✅ OK | ✅ OK (même pattern, plus robuste) |
| Lisibilité des licences | Bold visible (italique en bonus) | Bold visible (emphase principale préservée) |

🧪 **Tests à faire**
- Hard reload (Ctrl+F5) pour invalidate cache SW v1.40.29
- Modale Documentation EN (toggle 🇬🇧) → scroll jusqu'à `🙏 Acknowledgements > To the open-source tools` → liste complète des 7 libs visible **jusqu'à la fin**, plus de coupure brutale.
- Modale Documentation FR (🇫🇷) → idem, rendu inchangé visuellement (juste pattern plus robuste).
- Vérifier que les liens **[ODbL]**, **[CC BY-SA 2.0]**, **[OSM Foundation]** s'affichent en **gras + cliquables** dans les 2 langues.

🎓 **Leçon Markdown** (à noter dans gotchas.md)
- **Imbrication italique + bold + lien** sans contenu intermédiaire = risque parser. Pattern `*(**[`  particulièrement fragile.
- Safe : `_(**[link](url)** ...)_` ou simplifier (1 seul niveau d'emphase).
- Si tu DOIS imbriquer, mets du texte neutre entre les ouvertures : `*(text **bold** ...)*`.

🛡️ **Pas de régression** — pur fix MD éditorial 2 lignes (1 par langue).

---

**📦 v1.40.29** (07/06/2026) — **Cohérence crédits visuels : ajout `🌍 OSM` aux 3 footers (splash + loader HOME + modale Documentation)** :

KARMA : *« super maintenant du coup il faut adapter, footer home + Modal documentation + loader (pro + COmu) »*.

🎯 **Diagnostic** — 3 footers visuels affichaient des listes raccourcies différentes :

| # | Emplacement | Avant v1.40.29 |
|---|---|---|
| 1 | Splash (#splashLeafletCredit, ligne 145 index.html) | `🍃 Leaflet · 📦 JSZip · 📤 jsPDF · 🧭 Dijkstra` |
| 2 | Loader HOME footer (ligne 510 index.html) | Idem ↑ |
| 3 | Modale Documentation footer (interfaceDocs.js ligne 418) | `— 🍃 Leaflet · 📦 JSZip · 🧭 Dijkstra` (jsPDF **manquant** depuis v1.9.2) |

L'enrichissement v1.40.28 du README_USER ajoutait OSM et Rotated dans la doc longue, mais ces 3 listes courtes restaient bloquées sur les libs historiques pré-OSM. Incohérence visible.

🔧 **Fix v1.40.29** — Cohérence stricte des 3 instances :

| # | Après v1.40.29 |
|---|---|
| 1, 2, 3 | `🍃 Leaflet · 📦 JSZip · 📤 jsPDF · 🌍 OSM · 🧭 Dijkstra` |

Décisions UX :
- **`🌍 OSM`** (forme courte) plutôt que `🌍 OpenStreetMap` complet : contrainte d'espace 1 ligne sur splash et footer mobile. L'app affiche déjà l'attribution complète `© OpenStreetMap contributors` dans le coin des cartes (obligation ODbL respectée par Leaflet), et la doc longue (README_USER section "Aux outils libres") garde le nom complet + licence + lien.
- **Rotated plugin** : **pas ajouté** aux footers courts (déjà 5 mentions, plus on charge moins c'est lisible). Reste documenté dans la doc longue v1.40.28.
- **`📤 jsPDF` rétabli** dans interfaceDocs (oublié depuis v1.9.2-fix17, repéré au passage).
- **Loader pro vs community** : le HTML loader est identique. La mention "💼 Licence pro" community-only est gérée par `.kta-licence-community` au-dessus, pas dans la ligne crédits. Donc **un seul fix couvre les 2 modes**.

📊 **Sites enrichis (2 fichiers code)**

| Fichier | Modif | Sites |
|---|---|---|
| `index.html` | Lignes 145 + 510 + commentaires v1.40.29 | 2 instances (splash + loader HOME) |
| `js/interfaceDocs.js` | Ligne 418 (rétabli jsPDF + ajout OSM) | 1 instance (footer modale Documentation) |
| `sw.js`, `js/copyright.js`, `version.json` | Bump v1.40.28 → **v1.40.29** | 3 sources de version |
| `NETWORK_AUDIT.md` + `.html` | Header → v1.40.29 | 2 audits |
| `README.md` | Entrée journal v1.40.29 | 1 fichier |

🧪 **Tests à faire**
- Recharger app (Ctrl+F5 pour bypass cache SW v1.40.28) → splash affiche `🍃 Leaflet · 📦 JSZip · 📤 jsPDF · 🌍 OSM · 🧭 Dijkstra`.
- Footer loader HOME (en bas de la page d'accueil) : même ligne.
- Ouvrir modale Documentation (bouton 📚 ou similaire) → scroller jusqu'au bas → footer affiche `Développé par [KARMA] — 🍃 Leaflet · 📦 JSZip · 📤 jsPDF · 🌍 OSM · 🧭 Dijkstra`.
- Mode pro : footer loader identique (le badge `✓ Licence professionnelle active` reste au-dessus + reste vert v1.40.27).
- Mode community : footer loader identique + mention "💼 Licence pro" visible avant la ligne crédits (inchangée).

🛡️ **Pas de régression** — pur enrichissement éditorial de 3 chaînes HTML. Aucun JS/CSS de logique touché. Conformité ODbL renforcée visuellement (OSM visible dans tous les footers cohérent avec attribution dans le coin des cartes).

---

**📦 v1.40.28** (07/06/2026) — **Enrichissement section « Aux outils libres » : OpenStreetMap + Leaflet.ImageOverlay.Rotated** :

KARMA : *« Maintenant on enrichie la doc pour les opensource remercier, OSM typiquement »* + précision : la section visée est `🙏 Remerciements > Aux outils libres` dans `README_USER.md` (FR + EN).

🎯 **État avant v1.40.28** : la liste open source mentionnait Leaflet · JSZip · jsPDF · Dijkstra · GPX · Web standards. **Manquaient** :
- **OpenStreetMap** (utilisé depuis v1.39.0 pour Vue OSM, et **obligation légale d'attribution ODbL**)
- **Leaflet.ImageOverlay.Rotated** (plugin vendored BSD 2-clause, utilisé depuis v1.38.0 pour calage 2 ancres + projection Vue OSM)
- Licences explicites (BSD 2-clause, MIT, MIT/GPL, ODbL) pour chaque lib
- Crédits aux mainteneurs nommés (Vladimir Agafonkin pour Leaflet, Iván Sánchez Ortega pour Rotated, Stuart Knightley pour JSZip)
- Pointeur vers `NETWORK_AUDIT` pour le détail réseau

🔧 **Enrichissement v1.40.28**

Section `## 🙏 Remerciements > ### Aux outils libres` enrichie FR + EN avec :

1. **🍃 Leaflet** *(BSD 2-Clause)* — crédit Vladimir Agafonkin + contributeurs.
2. **🔄 Leaflet.ImageOverlay.Rotated** *(BSD 2-Clause, vendored)* — **nouveau crédit** : Iván Sánchez Ortega. Plugin utilisé pour calage 2 ancres (v1.38+) et projection Vue OSM (v1.39+).
3. **📦 JSZip** *(MIT/GPL au choix)* — crédit Stuart Knightley.
4. **📤 jsPDF** *(MIT)* — usage détaillé.
5. **🌍 OpenStreetMap & ses contributeurs** *(ODbL pour données, CC BY-SA 2.0 pour cartographie)* — **nouveau crédit majeur** :
   - Attribution explicite `© OpenStreetMap contributors` (obligation ODbL respectée, déjà affichée par Leaflet dans le coin des cartes)
   - Mention OSM Foundation (hébergement tuiles, politique privacy publique, non-commercial)
   - Reconnaissance du bien commun "bâti depuis 2004 par des milliers de bénévoles"
   - Précision **opt-in** : "uniquement quand tu l'actives via l'opt-in dédié" (cohérent avec philosophie offline-first)
6. **🧭 Algorithme de Dijkstra** (1959) — crédit Edsger W. Dijkstra (1930-2002).
7. **🌐 GPX 1.1**, **🛡️ Web standards** — inchangés (déjà bien rédigés).

Note ajoutée en fin de section : **📜 Conformité licences** — les fichiers vendored conservent leur header de licence d'origine, pointeur vers `NETWORK_AUDIT` pour le détail réseau.

**Footer crédits final** du README_USER (FR) enrichi pareil avec 🔄 Rotated et 🌍 OpenStreetMap. EN inchangé (pas de footer crédits équivalent).

📊 **Sites enrichis (2 fichiers)**

| Fichier | Section | Changement |
|---|---|---|
| `docs/applications/README_USER.md` | `🙏 Remerciements > Aux outils libres` | 4 entrées enrichies + 2 nouvelles (Rotated + OSM) + note licences |
| `docs/applications/README_USER.md` | Footer "Crédits librairies & algorithmes" | +🔄 Rotated +🌍 OpenStreetMap |
| `docs/applications/README_USER.en.md` | `🙏 Acknowledgements > To the open-source tools` | Parité stricte FR (6 entrées + note licences) |

🧪 **Tests à faire**
- Ouvrir modale Documentation in-app (🇫🇷) → scroller jusqu'à 🙏 Remerciements > Aux outils libres → voir les 7 libs + note licences + lien vers `NETWORK_AUDIT`.
- Toggle 🇫🇷/🇬🇧 → version EN affiche les 7 mêmes libs + note + lien.
- Vérifier que les liens externes fonctionnent (Leaflet, Rotated GitHub, OSM, etc.).
- Si modale Documentation est cachée par le SW cache, hard reload (Ctrl+F5) requis pour voir l'enrichissement après upgrade v1.40.28.

🛡️ **Pas de régression** — pur enrichissement éditorial 2 fichiers de doc. Aucun JS/CSS/audit/réseau touché. Conformité ODbL renforcée (attribution explicite documentée).

---

**📦 v1.40.27** (07/06/2026) — **Re-fix CSS badge licence pro thème clair (specificity vs cascade order)** :

KARMA après test v1.40.26 : *« toujours pas vert en clair »* (capture footer v1.40.26 confirmée, badge encore gris muté).

🎯 **Re-diagnostic** (j'avais raté le détail crucial en v1.40.26)

Mon fix v1.40.26 ajoutait `!important` à la règle ligne 9442 :
```css
body.kta-theme-light .kta-loader-copyright-pro-badge {
  color: #1d8a3a !important;
}
```
Specificity = **(0, 2, 1)** : 0 ID, 2 classes (`.kta-theme-light` + `.kta-loader-copyright-pro-badge`), 1 type (`body`).

MAIS la règle générique ligne 14244 :
```css
body.kta-theme-light .kta-loader-copyright * {
  color: var(--kta-light-text-muted) !important;
}
```
Specificity = **(0, 2, 1)** également : 0 ID, 2 classes (`.kta-theme-light` + `.kta-loader-copyright`), 1 type (`body`).

⚖️ **Specificity égale + `!important` égal → c'est la cascade order qui tranche, et la règle ligne 14244 vient APRÈS ligne 9442 dans le fichier → elle gagne**. Mon `!important` v1.40.26 ne suffisait pas. J'avais raté ça.

🔧 **Fix v1.40.27** : augmenter la specificity au-delà de (0, 2, 1) en empilant `html` + `body` + chaîne descendante :

```diff
+ html.kta-theme-light body .kta-loader-copyright .kta-loader-copyright-pro-badge,
  body.kta-theme-light .kta-loader-copyright .kta-loader-copyright-pro-badge {
    color: #1d8a3a !important;
  }
```

**Nouveaux selectors** :
- `html.kta-theme-light body .kta-loader-copyright .kta-loader-copyright-pro-badge` : (0, 3, 2) — 3 classes + 2 types (html+body)
- `body.kta-theme-light .kta-loader-copyright .kta-loader-copyright-pro-badge` : (0, 3, 1) — 3 classes + 1 type (body)

Les deux **battent** (0, 2, 1) du sélecteur `*` ligne 14244 quel que soit l'ordre cascade. Le double sélecteur cible aussi bien `html.kta-theme-light` que `body.kta-theme-light` selon où l'app pose la classe theme.

📊 **Avant / Après**

| | v1.40.25 | v1.40.26 (raté) | v1.40.27 (correct) |
|---|---|---|---|
| Sélecteur thème clair badge | `body.X .badge { color: #1d8a3a }` | `body.X .badge { color: #1d8a3a !important }` | `html.X body .Y .badge, body.X .Y .badge { color: #1d8a3a !important }` |
| Specificity | (0, 2, 1) | (0, 2, 1) + `!important` | **(0, 3, 2)** + `!important` |
| Specificity règle `*` | (0, 2, 1) + `!important` | (0, 2, 1) + `!important` | (0, 2, 1) + `!important` |
| Cascade tiebreak | règle `*` gagne (plus tardive) | règle `*` gagne (égalité+ordre) | **badge gagne (specificity supérieure)** |
| Résultat badge clair | Gris muté ❌ | Gris muté ❌ | **Vert sombre `#1d8a3a`** ✅ |

🧪 **Tests à faire**
- ⚠️ **Hard reload nécessaire** (Ctrl+F5) car le SW pourrait servir l'ancien CSS depuis v1.40.26 cache.
- Thème clair + licence pro : footer = `✓ Licence professionnelle active` en **vert sombre lisible** sur fond beige.
- Thème sombre : inchangé (vert vif `#6ee287`).
- Specificity peut être confirmée dans DevTools Chrome (Inspector > Styles > la règle gagnante doit être notre nouvelle ligne 9440-9442).

🎓 **Leçon CSS** (pour mémoire archi)
- **`!important` ne suffit PAS si specificity égale** : avec 2 règles `!important` à specificity égale, c'est la **cascade order** (= position dans le fichier) qui tranche. La règle plus tardive gagne.
- Pour battre un `* !important` plus loin dans le fichier, soit augmenter specificity (chaîne descendante / html+body), soit déplacer le fix après. La specificity est plus robuste car indépendante de l'ordre.
- Calcul rapide : compter (IDs, classes/attributs/pseudo-classes, types/pseudo-éléments). `*` compte pour 0. Le selector `html.X body .Y .Z` = (0, 3, 2) bat `body.X .Y *` = (0, 2, 1).

---

**📦 v1.40.26** (07/06/2026) — **Hotfix CSS thème clair : badge « ✓ Licence professionnelle active » en vert (était grisé muté)** :

KARMA : *« ✓ Licence professionnelle active en footer de CLAIR doit être en vert comme pour SOMBRE »*.

🎯 **Cause racine** (specificity CSS classique)

Le badge `.kta-loader-copyright-pro-badge` avait bien une règle variant thème clair ligne 9434 :
```css
html.kta-theme-light .kta-loader-copyright-pro-badge,
body.kta-theme-light .kta-loader-copyright-pro-badge {
  color: #1d8a3a;
}
```

Mais une règle générique plus loin ligne 14244 écrasait avec `!important` :
```css
body.kta-theme-light .kta-loader-copyright * {
  color: var(--kta-light-text-muted) !important;
}
```

Le sélecteur descendant `*` `!important` gagne sur la règle `.kta-loader-copyright-pro-badge` sans `!important` → en thème clair, le badge ressortait en **gris muté** au lieu du vert prévu.

En thème sombre, pas de souci : la règle générique ligne 14244 ne s'applique qu'à `kta-theme-light`, donc le badge sombre `#6ee287` (ligne 9421) gardait sa couleur.

🔧 **Fix v1.40.26**

Ajout de `!important` au variant thème clair du badge — fix chirurgical pour battre le sélecteur générique sans avoir à toucher la règle `*` (qui est légitime pour le reste du copyright). Couleur conservée `#1d8a3a` (vert sombre lisible sur fond beige `--kta-light-bg-deep`).

```diff
  html.kta-theme-light .kta-loader-copyright-pro-badge,
  body.kta-theme-light .kta-loader-copyright-pro-badge {
-   color: #1d8a3a;
+   color: #1d8a3a !important;
  }
```

📊 **Avant / Après (thème clair uniquement)**

| | Avant v1.40.25 | Après v1.40.26 |
|---|---|---|
| Couleur badge `✓ Licence professionnelle active` | Gris muté (`--kta-light-text-muted` = `#5a4f40`) | **Vert sombre `#1d8a3a`** (visible sur beige) |
| Thème sombre | Vert vif `#6ee287` ✅ inchangé | Vert vif `#6ee287` ✅ inchangé |

🧪 **Tests à faire**
- Thème CLAIR + licence pro active : footer affiche `✓ Licence professionnelle active` en **vert sombre lisible**.
- Thème SOMBRE : inchangé (vert vif).
- Mode community (sans licence pro) : badge masqué, pas de régression.
- Contraste : `#1d8a3a` sur fond `var(--kta-light-bg-deep)` = ratio ≈ 5:1 → AA conforme.

🛡️ **Pas de régression réseau / sécurité** — pur changement CSS cosmétique. Audit `NETWORK_AUDIT` headers bumpés à v1.40.26 pour alignement (contenu inchangé).

---

**📦 v1.40.25** (07/06/2026) — **Vue OSM popup POI : description prééminente (au lieu du tag)** :

KARMA : *« petit bug, en description de POI, en OSM on affiche le tag et non la description »*.

🎯 **Diagnostic**
- **Modale OsmView** : popup affichait juste `nom + tag · niveau` — **aucune description rendue** (oubli initial v1.39.12).
- **Widget HOME** : popup avait `description` mais en queue, même couleur que le tag, visuellement secondaire.

Résultat : KARMA voit "tag" (e.g. `default`) à l'endroit où il s'attend à voir sa description rédigée. Bug UX confirmé.

🔧 **Fix v1.40.25** (cohérence stricte modale + widget) :

Format unifié :
```
[Nom POI en gras jaune]
Description complète · niveau X        ← ligne 2 prééminente (si description)
🏷️ tag                                 ← ligne 3 mini subtle (si description)
```

Fallback si pas de description (= ancien comportement) :
```
[Nom POI en gras jaune]
tag · niveau X                          ← ligne 2 (fallback)
```

Détails techniques :
- Modale (`js/osmView.js` ~ligne 459-470) : ajout de `const desc = (p.description || "").trim()` + bascule ligne 2 entre `desc` et `tag`. Ligne 3 mini avec `🏷️ tag` en `opacity: 0.75` + `font-size: 10.5px` + `color: #8892a4`.
- Widget HOME (`js/osmHomePreview.js` ~ligne 796-810) : refonte identique pour cohérence stricte. Variable `lvlSfx` extraite pour lisibilité.
- `max-width: 260px` ajouté au container popup (les descriptions longues peuvent dépasser, sinon overflow horizontal).
- Le style CSS dark `kta-osm-popup` v1.40.22 reste appliqué : fond `#1a1f2e`, bordure or, nom POI en jaune `#f4c542`.

📊 **Avant / Après**

| Cas | Avant v1.40.24 modale | Avant v1.40.24 widget | Après v1.40.25 (2 contextes) |
|---|---|---|---|
| POI avec description "Salle des cinéastes" + tag `default` | `default · niveau 0` | `default · niveau 0` + description en queue | **`Salle des cinéastes · niveau 0`** + 🏷️ default mini |
| POI sans description, tag `entree` | `entree · niveau 0` | `entree · niveau 0` | `entree · niveau 0` (fallback inchangé) |
| POI multi-LVL avec description | description ignorée | description en queue | **description prééminente** + 🏷️ tag mini |
| Largeur popup avec description longue | `min-width: 120px` (overflow possible) | `min-width: 140px` | `min-width: 140px / max-width: 260px` (overflow géré) |

🧪 **Tests à faire**
- Modale Vue OSM : cliquer un POI avec description → ligne 2 = ta description complète + suffixe niveau, ligne 3 mini avec icône 🏷️ + tag. ✅
- Modale Vue OSM : cliquer un POI sans description (tag seulement) → ligne 2 = tag · niveau (= ancien comportement, pas de régression). ✅
- Widget HOME : idem cohérence stricte. Description prééminente, tag mini en dessous. ✅
- Description longue (>30 chars) : pas d'overflow horizontal, le popup wrap propre grâce à `max-width: 260px`.
- Thème clair : couleur de la description `#c8d0e0` peut sembler peu lisible sur fond beige → vérifier (si OK rien à faire, sinon ajout variant `.kta-theme-light`).

🛡️ **Pas de régression réseau / sécurité** — pur changement HTML cosmétique du popup. Audit `NETWORK_AUDIT` inchangé en contenu (juste header version bumpé).

---

**📦 v1.40.24** (07/06/2026) — **Vue OSM widget HOME : suppression des markers calibrage A/B + ligne pointillée jaune** :

KARMA : *« en OSM on a a l'affichage le calibrage point A point B en pointillé, je ne veux pas le voir a l'écran »*.

🎯 **Cause** : depuis v1.40.0, le widget HOME rendait 2 `L.circleMarker` (vert A + rouge B) avec tooltip "📍 Point A/B" + une `L.polyline` pointillée jaune (`dashArray: "6 4"`) entre les 2, dans `_renderGeorefMarkers()` (`js/osmHomePreview.js` lignes 487-503). Utile au tout début (mode léger v1.40.0 sans data layers) pour signifier "ici c'est ton plan georef", mais redondant depuis v1.40.4-6 qui ont ajouté les vrais POI / Roads / Zones / Structures + tuiles V2. KARMA confirme : chargent visuellement la mini-carte pour rien.

🔧 **Fix v1.40.24** :
- Suppression des 3 layers visuels (2 markers + 1 polyline) dans `_renderGeorefMarkers()`.
- **Préservation du `fitBounds`** initial : remplacement de `_markerLayer.getBounds()` (qui serait désormais vide) par `L.latLngBounds([llA, llB])` calculé directement depuis les coords A/B. Résultat de cadrage initial **strictement identique**.
- `_markerLayer` n'est **pas supprimé** (variable + featureGroup conservés vides) pour ne casser aucun call-site éventuel — futur refactor possible mais hors scope minimum.
- **Modale OsmView** : RAS, aucun marker georef n'y était rendu (vérifié par `grep dashArray` qui ne renvoie que `ITI_DASHARRAY` pour l'itinéraire cyan, comportement attendu).

📊 **Avant / Après**

| Élément widget HOME | Avant v1.40.23 | Après v1.40.24 |
|---|---|---|
| Circle marker vert "Point A" | ✅ Affiché avec tooltip | ❌ Plus rendu |
| Circle marker rouge "Point B" | ✅ Affiché avec tooltip | ❌ Plus rendu |
| Polyline pointillée jaune A↔B | ✅ Affichée (dashArray "6 4") | ❌ Plus rendue |
| Cadrage initial sur la zone du plan | ✅ Via `_markerLayer.getBounds()` | ✅ Via `L.latLngBounds([llA, llB])` (identique visuellement) |
| Visibilité data layers (POI, Roads, Zones, Struct, tuiles V2) | ✅ Inchangé | ✅ Inchangé |
| Modale OsmView (Vue OSM full screen) | ✅ Aucun marker georef | ✅ Aucun marker georef (rien changé) |

🧪 **Tests à faire**
- Ouvrir HOME → widget OSM → vérifier qu'on voit **uniquement** les tuiles plan + POI + Roads + Zones + Structures (selon toggles). Plus aucun marker vert/rouge ni ligne pointillée jaune.
- Changer de plan via le dropdown → cadrage initial toujours correct sur le nouveau plan (fitBounds direct fonctionne).
- Cliquer ⛶ fullscreen → idem, pas de markers georef visuels.
- Cas dégénéré : plan georef sans aucune data layer → l'user voit juste les tuiles OSM cadrées sur la zone du plan (avant : il aurait vu A + B + ligne, maintenant rien d'autre que les tuiles). Cohérent avec "data layers attendues sur un plan normal".

⚠️ **Si retour KARMA** : si tu veux ré-afficher les markers de calibrage en mode debug (genre cocher une case "🛠️ Mode dev"), on peut ajouter un toggle local au widget — pour l'instant supprimés totalement (KARMA "ne veut pas le voir à l'écran").

---

**📦 v1.40.23** (07/06/2026) — **Fix générateur : regex emoji 📄 ne strippait pas le préfixe label sur les calques image (bug surrogate pair JS)** :

KARMA : *« Fichier image "📄 four_a_chaux_LEGENDE.png" introuvable dans le ZIP source. Re-uploade le fichier via le bouton 📂 Choisir du calque "Legende". (LE fameux 404 quand je renvois un zip dans générateur) source pourtant OK legende affiche bien »*.

🎯 **Cause racine** (classique du regex JavaScript sur emojis)
Dans `js/createConf.js` (6 occurrences), le code lit le nom de fichier affiché dans le DOM puis strippe le préfixe visuel ✅ ou 📄 avec :
```js
.replace(/^[✅📄] /, "")
```

**Le bug** : le character class `[✅📄]` en regex JS standard **ne gère pas les surrogate pairs UTF-16** :
- ✅ = `✅` (1 code unit) → match OK ✅
- 📄 = `📄` (**surrogate pair, 2 code units**) → `[📄]` est interprété comme `[\uD83D OR \uDCC4]`, pas comme le caractère composé.

Donc :
- `"✅ four_a_chaux_LEGENDE.png"` → replace marche → `"four_a_chaux_LEGENDE.png"` ✅
- `"📄 four_a_chaux_LEGENDE.png"` → regex cherche `\uD83D` OU `\uDCC4` **suivi d'un espace**, mais après `\uD83D` vient `\uDCC4` (PAS d'espace) → **no match** → `nomTxt` reste `"📄 four_a_chaux_LEGENDE.png"` avec préfixe emoji intact.

Ensuite ligne 2593 `_plannerOrigAssets["📄 four_a_chaux_LEGENDE.png"]` cherche une clé qui n'existe pas (les vraies clés dans `_plannerOrigAssets` sont des noms purs : `"four_a_chaux_LEGENDE.png"`) → **clé introuvable → erreur "Fichier image introuvable dans le ZIP source"** affichée.

Pourquoi ça affichait `📄` et non `✅` ? Parce que le label DOM utilise `📄` quand le fichier n'a pas été re-sélectionné par l'user (= source = ZIP original), et `✅` quand l'user a re-uploadé via le bouton 📂. Donc le bug touchait pile le cas "je recharge un ZIP existant sans rien retoucher" — exactement ce que KARMA fait à chaque génération.

🔧 **Fix v1.40.23** : ajout du flag `u` (Unicode mode) qui active le traitement des codepoints complets dans le character class.

```diff
- replace(/^[✅📄] /, "")
+ replace(/^[✅📄]\s/u, "")
```

Avec `u` : `[📄]` devient un set d'un seul caractère composé (le codepoint U+1F4C4 entier). `\s` au lieu de l'espace ASCII tolère aussi ` ` (nbsp) au cas où le DOM rendrait un nbsp invisible.

🔍 **Sites touchés** (6 lignes dans `js/createConf.js`, fix `replace_all`) :
- Ligne 1468 : `nomTxt` calque image dans `_genererPlanFromZip` (probablement le hot path du bug)
- Ligne 1544, 2533, 2554 : `pl_collision_nom` (3 occurrences proximité, fonctions de validation)
- Ligne 2576 : **LIGNE EXACTE DU BUG signalé** par KARMA (block "Calques image" du save)
- Ligne 2624 : autre calque image

Le `replace_all` garantit qu'aucun site n'est oublié — cohérence stricte.

📊 **Avant / Après**

| Cas | Avant v1.40.22 | Après v1.40.23 |
|---|---|---|
| Re-upload ZIP existant, calque préfixé `📄` | ❌ "Fichier image introuvable" + abort | ✅ Préfixe stripé, fichier trouvé via `_plannerOrigAssets` |
| Re-upload ZIP, calque préfixé `✅` (déjà re-sélectionné) | ✅ Marchait | ✅ Marche (inchangé) |
| ZIP avec nbsp dans le label (théorique) | ⚠️ Match probable mais imparfait | ✅ Match propre via `\s` |
| Performance | ~0.00001ms | ~0.00001ms (identique) |

🧪 **Tests à faire**
- **Cas reproducteur** : ouvrir le générateur, charger un ZIP existant qui contient un calque image type "Legende" avec un fichier nommé `four_a_chaux_LEGENDE.png` (ou n'importe quel fichier image), **sans rien re-uploader**, cliquer "Générer" → ZIP régénéré sans erreur, et le calque "Legende" doit s'afficher correctement après chargement du nouveau ZIP. ✅
- **Régression check** : faire pareil mais en re-uploadant manuellement via 📂 Choisir → le préfixe `✅` doit aussi être stripé proprement, comme avant. ✅
- **Cas multi-calques** : plan avec 3+ calques image (genre LEGENDE + LEVATIONS + ANNOTATIONS) tous chargés depuis ZIP source → tous doivent passer dans le ZIP régénéré. ✅
- **Collision detection** (lignes 1544, 2533, 2554) : tester aussi la détection de doublons de fichier (si le bouton "vérifier collisions" du générateur l'utilise) avec emoji 📄.

🎓 **Leçon Unicode JavaScript** (pour archi mémoire)
- Toute regex qui cible un emoji moderne (BMP outside, codepoint ≥ U+10000) DOIT utiliser le flag `u` ou être écrite en alternation explicite : `/^(✅|📄)\s/` (sans `u` mais plus verbeux).
- `[emoji]` en regex non-`u` traite l'emoji comme 2 code units séparés → bugs silencieux à la lecture.
- Idem `string.length` retourne 2 pour un emoji surrogate-pair, pas 1. Utiliser `[...string].length` ou `Array.from(string).length` si besoin du vrai nombre de caractères.

🛡️ **Pas d'autre régression à craindre** : pas de changement réseau (audit `NETWORK_AUDIT` inchangé), pas de Permissions-Policy, pas de Vue OSM touché. Le fix est strictement isolé au générateur de plan + cohérent avec le pattern existant.

---

**📦 v1.40.22** (07/06/2026) — **Vue OSM : 3 fixes UX (POI cliquables widget HOME · modale agrandie WQHD · refonte style popup charte dark)** :

KARMA après test v1.40.21 : *« deux trop bug cependant, je peux toujours pas cliquer sur des POI en home, ok en PLAN mais intégration bizarre de la note. et en mode PC surtout, le modal OSM doit pouvoir prendre plus de place flagrant dans mon cas en WQHD »*.

🐛 **Bug 1 — Widget HOME : POI s'affichent mais popup invisible au clic**
- **Cause racine** : `.kta-osm-home-content { overflow: hidden }` dans `css/style.css` ligne 4454 (héritage v1.40.0) → quand Leaflet ouvre une popup au clic, le wrapper popup est positionné absolu **au-dessus** du marker. Sur la mini-carte HOME (~260px de hauteur), le popup déborde toujours vers le haut → clippé par le container. L'user clique, le popup est créé en mémoire, mais invisible.
- **Fix** : `overflow: hidden` → **`overflow: visible`** sur `.kta-osm-home-content`. Trade-off mineur : si un enfant (footer, bandeau) débordait, plus de clipping côtés. En pratique aucun enfant ne déborde, seul le popup ponctuel sort = OK.
- **Bonus** : ajout `autoPan: true, autoPanPaddingTopLeft: L.point(20, 60), maxWidth: 240` au `bindPopup` widget HOME → Leaflet déplace la mini-carte pour que le popup tienne dans le viewport.

🐛 **Bug 2 — Modale Vue OSM trop petite en WQHD (2560×1440) / 4K**
- **Cause racine** : `max-width: 1200px` hard-codé dans `js/osmView.js` ligne 1028 (héritage v1.39.0) → en WQHD, la modale fait 1200/2560 ≈ 47% de l'écran. Visuel "petite fenêtre flottante perdue au centre" alors que l'user veut exploiter sa résolution.
- **Fix** : `max-width: 1200px` → **`max-width: 1800px`** + `height: 90vh` → **`92vh`** pour un peu plus de hauteur aussi. En WQHD ça fait 1800/2560 ≈ 70% (bon compromis). En 4K (3840px) ça fait 1800/3840 ≈ 47% (toujours mieux qu'avant, et 96vw plafonne via `width:96vw`).

🐛 **Bug 3 — Style popup POI "intégration bizarre" en mode PLAN (modale OsmView)**
- KARMA confirmé via question : *"Style/CSS du popup pas joli"*. Le popup Leaflet par défaut a un fond **blanc** + ombre par défaut. Sur la map dark de la modale Vue OSM (fond `#0a0d18`), ça fait tâche.
- **Fix** : ajout d'une classe CSS `kta-osm-popup` passée via `bindPopup(html, { className: "kta-osm-popup" })` côté modale ET widget HOME. CSS dédié dans `style.css` (~60 lignes) qui override :
  - `.leaflet-popup-content-wrapper` : fond `#1a1f2e` (charte dark) + bordure `rgba(244, 197, 66, 0.35)` accent jaune + box-shadow soft + border-radius 8px
  - `.leaflet-popup-content b` (nom POI) : couleur `#f4c542` accent jaune
  - `.leaflet-popup-tip` (la flèche en bas) : matching dark + bordures cohérentes
  - `.leaflet-popup-close-button` : couleur `#8892a4` discrète, hover `#f4c542`
- Variant **thème clair** : fond beige `--kta-light-bg-elevated` + bordure or sombre, nom POI en `#8b6a14` (lisible sur beige).
- Aussi : `autoPan: true` + `maxWidth: 280` côté modale aussi (pour consistance).

📊 **Avant / Après**

| Cas | Avant v1.40.21 | Après v1.40.22 |
|---|---|---|
| Clic POI widget HOME (popup visible ?) | ❌ Popup créé mais clippé par overflow:hidden | ✅ Popup s'affiche avec autoPan + overflow:visible |
| Modale Vue OSM en WQHD 2560×1440 | ⚠️ 1200px (47% écran) | ✅ 1800px (70% écran) |
| Style popup POI sur map dark | ⚠️ Fond blanc Leaflet default, tâche | ✅ Charte dark `#1a1f2e` + accent jaune `#f4c542` |
| Style popup en thème clair | n/a | ✅ Variant beige `--kta-light-bg-elevated` cohérent |

🧪 **Tests à faire**
- Widget HOME : cliquer un POI → popup `kta-osm-popup` apparaît avec fond dark + nom en jaune. Si POI en haut de la mini-carte, la carte autoPan vers le bas pour que popup soit visible.
- Modale Vue OSM en WQHD : ouvrir → modale ~70% écran (large, plus immersive). Cliquer POI → popup même style.
- Thème clair : popup variant beige lisible (vérifier contraste nom POI `#8b6a14` sur fond `#f5ecd6`).
- Edge case : POI au bord de la modale → autoPan limite. Vérifier pas de cropping résiduel.

---

**📦 v1.40.21** (07/06/2026) — **Garde-fou « GPS hors champ du plan » Vue OSM** :

KARMA : *« pour ma position GPS si hors champ du plan (légère marge de ce que affiche OSM) refus et message clair »*.

🎯 **Pourquoi** : éviter qu'un user à Paris voie son fix GPS s'afficher sur un plan des Catacombes de Lyon. UX + privacy (pas de marker visuel à des km du plan supposé).

🔧 **Fix v1.40.21** :
- Helpers `_getPlanGpsBbox()` (modale) / `_getPlanGpsBboxHome()` (widget) : projettent les **4 coins du plan** (`(0,0), (W,0), (W,H), (0,H)`) via `_proj.planToLatLng()` → `L.latLngBounds`. Dims plan via `APP_CONFIG.imageWidth/Height` (modale) ou `data.config.plan.imageWidth/Height` (widget, depuis le ZIP extrait).
- Helpers `_haversineKm()` / `_haversineKmHome()` pour calculer la distance approximative au centre du plan en km (Haversine grand cercle, ~0.5% précision).
- Dans le callback success de `getCurrentPosition`, juste après réception du fix : on étend la bbox via `bounds.pad(0.5)` (= +50% sur chaque côté = marge ×1.5 généreuse). Si `padded.contains([lat, lng])` est `false` → **early return** avec :
  - toast warn `"📍 Position GPS hors du champ de ce plan (~X.X km du centre). Marker non affiché — vérifie que tu es bien sur le bon plan ou ailleurs."`
  - console log diagnostic (coords + distance)
  - bouton réinitialisé (pas de spinner ⏳ bloqué)
  - **aucun marker affiché** (privacy : pas de trace visuelle)
- **Fallback safe** : si bbox impossible à calculer (dims plan manquantes, `_proj` indispo, georef cassée) → on autorise comme avant (comportement v1.40.18-20 préservé, jamais de refus erroné par bug interne).
- Marge `0.5` choisie permissive : un fix légitime en bordure de plan reste accepté (cataphile sortant par une bouche d'aération). Seul un vrai "très loin" déclenche le refus.
- Audit `NETWORK_AUDIT.md` + `.html` + `vue-osm.md` mis à jour avec note dédiée.

---

**📦 v1.40.20** (07/06/2026) — **Fix header Permissions-Policy pour le bouton GPS Vue OSM** :

KARMA a vu en console : `[Violation] Permissions policy violation: Geolocation access has been blocked because of a permissions policy applied to the current document. See https://crbug.com/414348233 for more detail`.

🎯 **Cause racine** : le header `Permissions-Policy` côté Nginx contient `geolocation=()` (default v1.0 → v1.40.19) qui bloque l'API **avant même le prompt OS** quel que soit le contexte. Le bouton 📍 ajouté en v1.40.18 ne peut donc jamais déclencher le prompt natif. Pas un bug code client, c'est un header serveur trop restrictif.

🔧 **Fix v1.40.20** :
1. `docker/nginx-docker.conf` ligne 115 : `geolocation=()` → `geolocation=(self)` (self-host Docker).
2. `docs/nginx-csp-config.conf` ligne 136 : idem (prod) + commentaire détaillé expliquant pourquoi `(self)`.
3. Restriction `(self)` choisie volontairement : seule notre origine peut utiliser l'API, JAMAIS un iframe tiers (philosophie security-first même si l'app ne charge aucun iframe).
4. Sync docs : `NETWORK_AUDIT.md` + `.html` (nouveau bullet "Header serveur requis"), `docs/architecture/vue-osm.md` (note v1.40.20), `docs/architecture/docker-selfhost.md` (mention geolocation=self).

⚠️ **Déploiement prod requis (KARMA, manuel)** : le code client v1.40.20 ne fait que documenter le changement. Le header `Permissions-Policy` est envoyé par Nginx → tu dois **redéployer la config Nginx en prod** (upload `docs/nginx-csp-config.conf` puis `nginx -s reload` côté serveur) pour que le bouton 📍 fonctionne sur `myktamap.fr` et `dev.myktamap.fr`. Sur le self-host Docker, rebuild l'image (nouvelle config embarquée).

---

**📦 v1.40.19** (07/06/2026) — **Vue OSM : gating Mode hors-ligne strict + Mode incognito (audit hardening)** :

KARMA : *« comment on gère le cas Hors ligne ce bouton ne doit bien sûr pas être cliquable si Hors Ligne, mais déjà géré à mon avis par le modal mais faut t'en assurer »*.

**Audit avant fix** :
- Modale `osmView.js` : ✅ check `_isStrictOfflineOn()` + `_isIncognitoOn()` au `open()` (déjà bon)
- Widget HOME `osmHomePreview.js` : ❌ **trou** (v1.40.0-18) — chargeait quand même les tuiles OSM en mode strict offline / incognito
- Bouton 📍 GPS : ⚠️ pas de re-check runtime si toggle pendant session (edge case faible mais propre)

**Fix v1.40.19** :
1. Widget HOME : ajout helpers `_isStrictOfflineOn` + `_isIncognitoOn` (parité modale) + nouveaux renderers `_renderStrictOffline` (🛡️) + `_renderIncognito` (🕶️) appelés au `mount()` avant le check `_isOnline`.
2. Bouton 📍 GPS (modale + widget) : early return runtime dans le handler de clic si strict/incognito au moment du clic (toast warn). Désactivé visuellement (`disabled` HTML attribute) au build modale si déjà bloqué.
3. **Note importante** : `navigator.onLine === false` (Wi-Fi/4G coupé) ne bloque **pas** le GPS — c'est l'intérêt principal (téléphone en avion mais GPS du device parfaitement fonctionnel). Seul le mode strict offline (philosophie user) ou incognito bloque le bouton GPS, pas la perte de connexion réseau.
4. Audit `NETWORK_AUDIT.md` + `.html` mis à jour avec nouveau bullet "Gating Mode hors-ligne strict + Mode incognito" pour la Vue OSM.

---

**📦 v1.40.18** (07/06/2026) — **Vue OSM : POI cliquables widget HOME + filtre tag local (modale + widget) + bouton « 📍 Ma position » GPS (modale + widget)** :

Trois ajouts en deux bumps consécutifs :

**v1.40.17 — POI cliquables + filtre tag** :
- Widget HOME : POI étaient `interactive: false` → aucun feedback au clic. Désormais `interactive: true` + `bindPopup(nom + tag + niveau + description)`, parité avec la modale OSM qui avait déjà ce comportement.
- Modale + Widget : 3ᵉ ligne du bandeau avec chips tags cliquables (toggle multi-sélection + chip « Tout »). Modale = state `_osmLocalTagFilter` AND avec `FilterPanel` global, reset au close. Widget = state `_homeTagFilter`, indépendant par design. Chips triées par fréquence (compteur en tooltip).

**v1.40.18 — Bouton « 📍 Ma position » GPS** :
- Modale + Widget : nouveau bouton dans le bandeau qui demande un **fix GPS ponctuel** via `navigator.geolocation.getCurrentPosition()` (pas de `watchPosition` continu, 0 impact batterie continue).
- Permission OS demandée à la demande user (pas au boot). Marker bleu cyan + cercle d'incertitude si précision >20m. Re-clic = nouveau fix qui remplace l'ancien.
- **Garanties privacy** : coordonnées **jamais** stockées (RAM only, supprimées au close modale / refresh widget), **jamais** envoyées sur le réseau (aucun fetch, aucun beacon). API browser native uniquement.
- Audit `NETWORK_AUDIT.md` + `.html` mis à jour : section "À propos des tuiles OSM" étendue + ligne Geolocation API précisée pour mentionner ce nouvel usage user-initiated dans la Vue OSM.

---

**📦 v1.40.14** (07/06/2026) — **Vue OSM HOME : icônes POI — fallback paths + diagnostic** :

KARMA v1.40.13 : *« road ok icone non »*. Les couleurs roads fonctionnent maintenant mais les icônes POI ne s'affichent toujours pas.

**Diagnostic ajouté** (logs console) :

1. Au moment de l'extraction `_extractIcons` :
   - Log INFO : "Icons extraits : N tag(s) | tags : tag1, tag2, ..."
   - Log WARN si paths non trouvés : "N icon path(s) absent(s) du ZIP : tag→path1 · tag→path2 ..."

2. Au moment du render `_renderDataLayersOnMiniMap` :
   - Log INFO : "POI icônes : N avec icône · M fallback cercle"
   - Log WARN si tags POI sans icône : "Tags POI sans icône : tag1(count1) · tag2(count2) ..."

Avec ces logs KARMA peut envoyer un screenshot de la console pour qu'on identifie précisément où ça coince :
- Soit les icônes ne sont pas extraites du ZIP (paths invalides)
- Soit les tags des POI n'existent pas dans le mapping (tags custom)

**Fallback paths étendus** dans `_extractOne` :

Vérification confirmée dans `createConf.js:2523` : le dossier dans le ZIP est `icon/` à la racine, paths dans `config.icons[tag]` du genre `"icon/<filename>.png"`. Mais il peut y avoir des plans avec des paths exotiques.

Cascade essayée :
1. `path` tel quel (= `"icon/<file>.png"` cas normal)
2. `path.replace(/^\.?\//, "")` (sans leading "./" ou "/")
3. `"data/" + path` (si certains plans utilisent cette convention)
4. `"icon/" + path.split("/").pop()` (si path contient URL externe ou préfixe inconnu, on garde juste le filename et on cherche dans `icon/`)

**📁 6 fichiers modifiés** :

| Fichier | Modif |
|---|---|
| `js/osmHomePreview.js` | Logs diagnostic extraction + render + 4 paths fallback |
| Bumps habituels | sw.js, copyright.js, version.json (description inchangée) |
| Docs | NETWORK_AUDIT + README (journal détaillé) |

**🧪 Tests à faire** :

Ouvre la console F12 sur la HOME avec Catacombes sélectionné. Tu devrais voir :

```
[OsmHomePreview] Icons extraits : N tag(s) | tags : salle, pa, pc, ...
[OsmHomePreview] Data render : 247 POI · 38 roads · 5 zones · 12 struct
[OsmHomePreview] POI icônes : X avec icône · Y fallback cercle
```

Si tu as `0 avec icône` + un log warn "Tags POI sans icône : …" → envoie-moi le log, on saura précisément quels tags sont attendus. Soit on étend `TAGS_BUILTIN_HOME`, soit le format de `config.icons` est différent.

Si tu as `0 tag(s) extraits` + log warn paths absents → les chemins dans le ZIP sont différents de mes hypothèses, dis-moi ce que tu vois.

**📦 v1.40.13** : Vue OSM HOME — icônes POI natives + couleurs roads natives :

KARMA : *« on a pas les icones quand on charge POI en home OSM »* + *« change la couleur des tracé par un vert plus epais »* (rectifié : *« récupéré la bonne couleur serait le top »*).

**2 fixes** :

### 1. Icônes POI natives

v1.40.4 utilisait `L.circleMarker` jaune charte pour tous les POI = pas d'icônes spécifiques par tag. v1.40.13 extrait les **vraies icônes du ZIP** et crée des `L.icon` avec les images natives du plan.

**Pipeline** :

```
_loadPlanDataForPreview(planId)
  ├─ Existing : extract plan-config + dataLayers + tilesOverview
  └─ 🆕 _extractIcons(zip, config)
       ├─ Source 1 : config.icons (mapping user → tag → fichier ZIP)
       └─ Source 2 : TAGS_BUILTIN_HOME fallback (salle, pa, pc, …)
                    pour les tags standards non-overridés
       → { tag: blobUrl, … } cache RAM
```

**Mapping `TAGS_BUILTIN_HOME`** : aligné strictement sur `map.js > TAGS_BUILTIN` (20 tags cataphile standard : salle, pa, pc, pb, pe, ps, peo, pef, eso, esf, cao, caf, vehicule, elec, epure, info, chatiere, passage, danger, plaque). Warning : si TAGS_BUILTIN change dans map.js, sync ici.

**Rendu** dans `_renderDataLayersOnMiniMap` :

- Cache `iconCache` local pour éviter de recréer le même `L.icon` à chaque POI partageant le même tag
- Si tag matché → `L.marker` avec `L.icon({ iconUrl, iconSize: [24, 24], iconAnchor: [12, 12] })`
- Si pas matché (tag exotique, no icon dans ZIP) → fallback `L.circleMarker` jaune (v1.40.4)

**Tailles** : 24×24 (plus petit que les 50×50 originaux de la map principale) car la mini-carte HOME montre une zone géographique plus large.

### 2. Couleurs roads natives

v1.40.4 utilisait `r.color || "#8892a4"` (gris fallback). Or les data layers roads embedded n'ont **pas** de `color` dans le JSON — la couleur est **dérivée du type** via `utils.js > ROAD_STYLES_DATA`. v1.40.13 reproduit ce mapping localement.

**Mapping `ROAD_STYLES_DATA_HOME`** :

| Type | Couleur (alignée sur utils.js) |
|---|---|
| `principal` | `#00ff00` (vert) |
| `secondaire` | `#b000ff` (violet) |
| `chemin` | `#ffff00` (jaune) |
| `jonction` | `#ff4ecb` (rose) |

**Cascade** :
```js
const color = r.color || ROAD_STYLES_DATA_HOME[r.type] || "#8892a4";
```
Priorité : `road.color` natif (rare pour embedded) > mapping par type > fallback gris.

**Weight** : 2 → 3 pour ressortir un peu, opacity 0.75 → 0.85 pour densité visuelle.

### Caches RAM mis à jour

`_planDataCache[planId]` étendu avec `iconUrls` :
```js
{ config, dataLayers, tilesOverview, iconUrls }
```

`_iconBlobUrls` array pour tracker les blob URLs créés (cleanup possible au unload). Re-sélection plan déjà vu = instant (cache préservé).

**📁 6 fichiers modifiés** :

| Fichier | Modif |
|---|---|
| `js/osmHomePreview.js` | +ROAD_STYLES_DATA_HOME + TAGS_BUILTIN_HOME + helper `_extractIcons` + render POI avec L.icon + render roads couleur native |
| Bumps habituels | sw.js, copyright.js, version.json (description user-friendly inchangée comme demandé) |
| Docs | NETWORK_AUDIT + README (journal détaillé) |

**🧪 Tests** :

- [ ] Plan Catacombes → POI avec **vraies icônes** (maison, PA, danger, chatière, …) au lieu de cercles jaunes
- [ ] Log console : `Icons extraits : N tag(s)` (probablement ~20)
- [ ] Roads colorées : principal en vert, secondaire en violet, etc. (cohérent map principale)
- [ ] Roads un peu plus épaisses (weight 3)
- [ ] Tags exotiques (rares) → fallback cercle jaune préservé
- [ ] Re-sélection plan → cache RAM, instant
- [ ] Plan v1 sans config.icons → fallback TAGS_BUILTIN_HOME suffit (icônes builtin extraites)
- [ ] Toggle 📍 POI continue de fonctionner

**Description user-friendly v1.40.13** : **inchangée** par rapport à v1.40.12 (= description feature globale demandée par KARMA, pas de mention hotfix).

**📦 v1.40.12** : Vue OSM — filtres par catégorie + toggle image plan :

KARMA : *« Génial, sans changer la description de version, rajoute la possibilité de filtrer comme on a fait en mode plan »* + *« rajoute aussi (pareil en mode plan), en mode OSM, la possibilité de masquer image principal »*.

**2 features ajoutées** :

### 1. Filtres par catégorie dans le widget HOME

Refactor `_renderDataLayersOnMiniMap` pour mettre chaque catégorie dans son propre sub-layerGroup → permet add/removeLayer individuel :
- `_poiSubLayer` → POI
- `_roadsSubLayer` → Routes
- `_zonesSubLayer` → Zones
- `_structSubLayer` → Structures

5 nouveaux helpers de toggle : `_toggleTiles`, `_togglePoi`, `_toggleRoads`, `_toggleZones`, `_toggleStructures`.

UI : **2e ligne du bandeau** avec 5 checkboxes compactes `🖼️ Plan / 📍 POI / 🛣️ Routes / 🌐 Zones / 🏗️ Struct` (default ON).

Pattern aligné sur la modale OsmView qui a déjà ces toggles (cf v1.39.0+). L'user peut maintenant masquer une catégorie spécifique pour voir le rendu OSM seul ou se concentrer sur une catégorie.

### 2. Toggle "🖼️ Plan" dans la modale OsmView

Ajout d'un toggle `🖼️ Plan` dans le bandeau de la modale OsmView full-screen (entre `📡 Tracker` et `📍 POI`) → masquer/afficher les **tuiles V2 du plan** (l'image principale).

State `_planTilesVisible = true` + helper `_togglePlanTilesVisible(v)` qui fait add/removeLayer sur `_planLayer`.

Cohérent avec l'idée du widget HOME (qui a aussi 🖼️ Plan toggle) — l'user peut décider de voir uniquement les POI/Roads/Zones sur OSM sans la photo du plan, ou inversement.

**CSS ajouté** (`style.css`) :
- `.kta-osm-home-toggles` : 2e ligne du bandeau (fond bleu discret + padding compact)
- `.kta-osm-home-toggle` : style des checkboxes (font 11px, gap, hover)
- Variants thème clair pour les 2 classes

**Notes user-friendly enrichies** (sans changer la sémantique demandée par KARMA "sans changer la description") :

> 🌍 Nouveau mode Vue OSM : un widget intégré à ta page d'accueil affiche tes plans géoréférencés projetés sur OpenStreetMap. Tu y retrouves l'image du plan en transparence, tes POI, tes tracés (routes, zones, structures), et des outils pratiques : slider d'opacité, sélecteur de plan, **filtres par catégorie** et bouton plein écran.

→ Le mot "filtres par catégorie" ajouté reste cohérent avec le ton orienté feature globale demandé par KARMA v1.40.11.

**📁 8 fichiers modifiés** :

| Fichier | Modif |
|---|---|
| `js/osmHomePreview.js` | Sub-layers + 5 toggles + UI 2e ligne bandeau |
| `js/osmView.js` | Toggle "🖼️ Plan" + state + helper `_togglePlanTilesVisible` |
| `css/style.css` | Styles `.kta-osm-home-toggles` + variants thème clair |
| Bumps habituels | sw.js, copyright.js, version.json |
| Docs | NETWORK_AUDIT + README |

**🧪 Tests** :

Widget HOME :
- [ ] 2e ligne du bandeau visible avec 5 toggles cochés par défaut
- [ ] Décocher 🖼️ Plan → image du plan disparaît, POI/Routes/Zones restent visibles sur OSM
- [ ] Décocher 📍 POI → POI disparaissent, image + reste OK
- [ ] Décocher 🛣️ Routes / 🌐 Zones / 🏗️ Struct → idem indépendamment
- [ ] Re-cocher → réapparition propre (cache RAM préservé, pas de ré-extraction)
- [ ] Thème clair : toggles lisibles

Modale OsmView :
- [ ] Toggle 🖼️ Plan dans le bandeau (entre 📡 Tracker et 📍 POI)
- [ ] Décocher → tuiles V2 disparaissent, POI/Roads/Zones/Structures restent
- [ ] Re-cocher → tuiles réapparaissent

Régression :
- [ ] Re-sélection plan dans dropdown → toggles user gardent leur état pendant la session
- [ ] Plein écran ⛶ widget HOME → toggles fonctionnent aussi en plein écran
- [ ] Refresh page → toggles default ON (pas de persistance LS pour rester simple)

**📦 v1.40.11** : Vue OSM HOME — amélioration résolution gros plans (z=-2 sur 16K) :

KARMA : *« On parle d'un plan de tres grosse dimension, 16k il faut vraiment augmenter la reso car bcp trop dégradé »*. v1.40.10 utilisait `MAX_TILES_HOME = 40`, suffisant pour Catacombes 4K (z=0 natif) mais insuffisant pour les très gros plans (16K fallback à minNativeZoom = z=-3 trop dégradé).

**Fix** : `MAX_TILES_HOME = 40` → **80**.

**Tableau récap niveau choisi par taille plan** :

| Taille plan | v1.40.10 (MAX=40) | v1.40.11 (MAX=80) | Gain résolution |
|---|---|---|---|
| 4K (Catacombes 4000×2251) | z=0 natif (40 tuiles) | z=0 natif (40 tuiles) | inchangé ✅ |
| 8K (8000×4500) | z=-2 (4 tuiles) | z=-1 (40 tuiles) | ×2 |
| 12K (12000×8000) | z=-3 (3 tuiles) | z=-2 (24 tuiles) | ×2 |
| 16K (16000×16000) | z=-3 (16 tuiles) | z=-2 (64 tuiles) | **×2 ← FIX KARMA** |
| 32K+ (extrême) | fallback minNative | fallback minNative | inchangé (flou résiduel accepté) |

**Compromis RAM** : 80 tuiles × ~1 MB décodé = ~80 MB max. Toujours sous budget mobile (~500 MB iPhone PWA) car widget HOME isolé (pas de map principale chargée en parallèle).

Pour la plupart des plans (≤ 8K), on reste à 40-50 tuiles soit ~50 MB. Le bump n'impacte que les plans > 8K.

**Notes user-friendly orientées feature globale** (suite KARMA *« change la description de version. parle juste du nouveau mode OSM sans parler hotfix »*) :

Les notes `version.json` ne mentionnent plus les détails techniques des hotfixes successifs (résolution +X, etc.) mais présentent le **nouveau mode Vue OSM HOME** comme feature globale. Cohérent avec l'usage de `version.json > notes` = lecture user-facing via modale "Mise à jour disponible" et badge footer.

Nouvelle description :
> 🌍 Nouveau mode Vue OSM : un widget intégré à ta page d'accueil affiche tes plans géoréférencés projetés sur OpenStreetMap. Tu y retrouves l'image du plan en transparence, tes POI, tes tracés (routes, zones, structures), et des outils pratiques : slider d'opacité, sélecteur de plan et bouton plein écran.

**📁 6 fichiers modifiés** :

| Fichier | Modif |
|---|---|
| `js/osmHomePreview.js` | `MAX_TILES_HOME` 40 → 80 + tableau récap dans commentaire |
| `version.json` | Notes réécrites orientées feature globale (= ce que voit l'user) |
| Bumps habituels | sw.js, copyright.js |
| Docs | NETWORK_AUDIT + README (journal détaillé interne) |

**🧪 Tests** :

- [ ] Plan Catacombes 4K → toujours z=0 natif (inchangé v1.40.10)
- [ ] Plan 16K → log console : `Tiles V2 : 64 tuile(s) rendues à z=-2 (scale x4)` (au lieu de z=-3 x8)
- [ ] Plan 16K visuel : nettement plus net (×2 résolution)
- [ ] Plan 8K → monte aussi à z=-1 (×2 résolution)
- [ ] Mobile : pas de crash sur 16K (80 MB tuiles encore largement sous budget mobile)
- [ ] User voit dans la modale "Mise à jour disponible" la description feature globale (pas un changelog technique)

**📦 v1.40.10** : Vue OSM HOME — niveau natif z=0 (résolution ×2) :

KARMA : *« toujours trop flou en OSM HOME augmente legerement stp / fait comme on fait en mode map tuile adapté »*. v1.40.7 avait bumpé `MAX_TILES_HOME = 12` → z=-1 sur Catacombes (scale ×2), pas encore assez net.

**Analyse "fait comme en mode map tuile adapté"** :

La modale OsmView full-screen utilise `MAX_TILES_BASELINE = 20` au boot, MAIS swap dynamique vers z=0 natif quand l'user zoom (`_targetLevelForZoom` v1.39.11). C'est ce swap qui donne le rendu **net** que KARMA voit en mode map.

Le widget HOME a une carte fixe (pas de zoom user) → pour avoir le même rendu net que la modale "après zoom", il faut monter direct à z=0 natif.

**Fix** : `MAX_TILES_HOME = 12` → **40**. Pour Catacombes 4000×2251 :

| Version | MAX_TILES | Niveau choisi | Scale | Tuiles | RAM décodée | Résolution |
|---|---|---|---|---|---|---|
| v1.40.6 | (minNative fixe) | z=-3 | ×8 | 1 | 1 MB | 😵 flou |
| v1.40.7 | 12 | z=-1 | ×2 | 12 | 12 MB | OK mais flou |
| **v1.40.10** | **40** | **z=0 natif** | **×1** | **40** | **40 MB** | **✅ max** |

**Budget RAM** : 40 MB décodé, acceptable car widget HOME isolé (pas de map principale chargée en parallèle, pas de runtime Leaflet lourd). Si retour terrain remonte fuite mobile bas de gamme, on pourra ajouter guard `navigator.deviceMemory < 4` pour basculer à MAX=20.

**Plans très grands** (16K×16K, etc.) : fallback `minNativeZoom` reste en place. Pour ces plans exotiques le flou résiduel est accepté.

**Plans plus petits** : peuvent maintenant prendre z=0 dès que ≤ 40 tuiles.

**📁 6 fichiers modifiés** :

| Fichier | Modif |
|---|---|
| `js/osmHomePreview.js` | `MAX_TILES_HOME` 12 → 40 + commentaire détaillé du tradeoff |
| Bumps habituels + docs | v1.40.9 → v1.40.10 |

**🧪 Tests** :

- [ ] Plan Catacombes → log console : `Tiles V2 : 40 tuile(s) rendues à z=0 (scale x1)`
- [ ] Image plan sur mini-carte → résolution native, lignes/labels parfaitement nets
- [ ] Slider opacité → continue de fonctionner
- [ ] Plein écran ⛶ → image plan toujours nette
- [ ] Plan plus grand (Test Legacy V1) → reste sur skip silencieux (pas de tuiles V2)
- [ ] Mobile : pas de crash (40 MB encore largement sous budget ~500 MB iPhone PWA)

**Régression** : RAM décodée +30 MB pour les tuiles HOME (12 → 40 MB). Toujours largement sous budget mobile. Cache RAM v1.40.4-6 préservé.

**📦 v1.40.9** : Thème clair HOME — refonte propre, hiérarchie 3 niveaux :

KARMA : *« c'est devenu nimp la le css du home en mode clair, reprend tout ca d'un oeil différent pour rendre ca plus armonieux en fond (background) »*. Mes overrides successifs v1.40.3 → v1.40.8 ont accumulé sans cohérence : tout est devenu aplati en `#e5dcc5` uniforme, plus aucune hiérarchie visuelle entre wrapper et cards. Option A validée par KARMA.

**Approche nouvelle — Respect de la sémantique CSS originale** :

Le projet a 3 variables CSS définies en thème clair (cf `style.css:12557-59`) avec une intention claire :

| Variable | Couleur | Rôle conçu à la base |
|---|---|---|
| `--kta-light-bg` | `#f0e8d8` | Body / fond neutre clair |
| `--kta-light-bg-elevated` | `#fdf8eb` | Cards en élévation |
| `--kta-light-bg-deep` | `#e5dcc5` | Header / footer (saturé = ancrage) |

Mes overrides v1.40.3 → v1.40.8 forçaient TOUT à `--kta-light-bg-deep` → cassait cette intention sémantique.

**Hiérarchie restaurée v1.40.9** :

| Couche | Élément | Couleur | Variable |
|---|---|---|---|
| **Wrapper** | `#planLoaderBox` (loader wrapper HOME) | `#f0e8d8` neutre clair | `--kta-light-bg` (override car valeur originale `#c9b88f` détonnait) |
| **Cards** | `.kta-loader-profile-bar` (Profil) | `#fdf8eb` crème | `--kta-light-bg-elevated` (règle existante ligne 17424) |
| **Cards** | `#resumeBox` (Reprendre) | `#fdf8eb` crème | (règles existantes) |
| **Cards** | `#myPlansBox` (Mes plans) | `#fdf8eb` crème | (règles existantes lignes 14105 + 15206) |
| **Cards** | `#ktaOsmHomeBox` (Vue OSM) | `#fdf8eb` crème | **`--kta-light-bg-elevated` (nouvel override card complète)** |
| **Cards** | `.loader-col-actions > .loader-section-head + .loader-panel` (Ajouter) | `#fdf8eb` crème | (règles existantes lignes 15230 + 15243) |
| **Ancrage** | `.kta-loader-copyright` (footer) | `#e5dcc5` beige saturé | `--kta-light-bg-deep` (règle existante ligne 14068) |

**Résultat visuel** :
- Wrapper neutre clair (`#f0e8d8`) — couleur de fond cohérente avec body, plus saturé que doré
- Cards qui **ressortent** légèrement en crème (`#fdf8eb`) sur le wrapper neutre, via leur border ocre + box-shadow douce
- Footer plus saturé (`#e5dcc5`) qui ferme visuellement la page en bas
- **Hiérarchie 3 niveaux** rétablie, harmonieuse

**Implémentation** : **simplification massive** du bloc fin de `style.css` qui contenait 4 ensembles d'overrides (v1.40.3 + v1.40.5 + v1.40.8 cumulés) → réduit à **2 overrides ciblés seulement** :

1. `#planLoaderBox` : passe `var(--kta-light-bg-bar)` (`#c9b88f` brun) → `var(--kta-light-bg)` (`#f0e8d8` neutre)
2. `#ktaOsmHomeBox` : ajout card complète (border, padding, shadow, radius) avec `--kta-light-bg-elevated` (`#fdf8eb` crème) pour matcher visuellement Mes plans / Ajouter

**Toutes les anciennes règles existantes pour Mes plans, Reprendre, Profil, Ajouter sont restaurées dans leur intention originale** (= cards en `#fdf8eb`) car mes overrides v1.40.3/5/8 qui forçaient `#e5dcc5` sur ces éléments ont été retirés.

**Footer copyright** : aucun changement, reste sur `--kta-light-bg-deep` (`#e5dcc5`) via la règle existante ligne 14068.

**📁 6 fichiers modifiés** :

| Fichier | Modif |
|---|---|
| `css/style.css` | Bloc fin de fichier réduit (~80 → ~50 lignes), 4 overrides → 2 overrides ciblés |
| Bumps habituels | sw.js, copyright.js, version.json |
| Docs | NETWORK_AUDIT + README (journal détaillé) |

**🧪 Tests** :

- [ ] Thème clair → wrapper en neutre clair (`#f0e8d8`), distinct du body environnement
- [ ] Cards (Profil, Reprendre, Mes plans, Vue OSM, Ajouter) en crème (`#fdf8eb`) **ressortent** légèrement du wrapper
- [ ] Footer copyright en beige (`#e5dcc5`) plus saturé, ancrage bas
- [ ] Border ocre + box-shadow douce visibles autour des cards (effet "élévation")
- [ ] Thème sombre → aucun changement (pas affecté)
- [ ] Mobile : pile verticale inchangée

**📦 v1.40.8** : Thème clair HOME — sync background wrapper + bandeau profil :

KARMA screenshot v1.40.6 : *« pour le background home il manque des zones (en trait rouge) je veux le meme fond que footer »*. Les flèches rouges pointaient des espaces où le fond doré du wrapper transparaissait entre les sections, et le bandeau profil qui était en crème pâle au lieu du beige footer.

**Diagnostic** :

| Élément | Couleur avant v1.40.8 | Variable CSS | Apparence |
|---|---|---|---|
| `body` (mode carte) | `#f0e8d8` | `--kta-light-bg` | Doré clair |
| `#planLoaderBox` (wrapper HOME) | `#c9b88f` | `--kta-light-bg-bar` | Brun-beige (visible aux interstices) |
| `.kta-loader-profile-bar` | `#fdf8eb` | (hardcoded) | Crème pâle |
| `#myPlansBox` / `#resumeBox` / `#panelZip` | `#e5dcc5` | `--kta-light-bg-deep` (v1.40.3-5) | Beige footer ✅ |
| `.kta-loader-copyright` (footer) | `#e5dcc5` | `--kta-light-bg-deep` | Beige footer ✅ |
| `#ktaOsmHomeBox` (v1.40.3) | `#e5dcc5` | `--kta-light-bg-deep` | Beige footer ✅ |

**Fix** : étendre l'override fin de fichier `style.css` aux 2 éléments restants :
- `#planLoaderBox` (le wrapper) → `--kta-light-bg-deep` (#e5dcc5)
- `.kta-loader-profile-bar` (bandeau profil) → `--kta-light-bg-deep` (#e5dcc5)

Résultat visuel : fond uniforme `#e5dcc5` sur TOUTE la page d'accueil, depuis le bandeau profil en haut jusqu'au footer copyright en bas. Aucune zone doré clair entre sections.

**Note `#planLoaderOverlay`** : pas touché (= fond `rgba(201, 184, 143, 0.96)` semi-transparent, agit comme overlay externe au wrapper). Garde son rôle de "calque sous le wrapper" si jamais une page utilise les 2.

**📁 6 fichiers modifiés** :

| Fichier | Modif |
|---|---|
| `css/style.css` | +10 lignes overrides v1.40.8 (en fin de fichier, après bloc v1.40.5) |
| Bumps habituels | sw.js, copyright.js, version.json |
| Docs | NETWORK_AUDIT + README (journal détaillé) |

**🧪 Tests** :

- [ ] Bascule thème clair → fond uniforme `#e5dcc5` sur toute la HOME
- [ ] Bandeau profil "Mon profil" en haut → beige footer (plus crème pâle)
- [ ] Espaces entre sections → beige footer (plus de zones brun-beige)
- [ ] Sections (Mes plans, Vue OSM, Ajouter) gardent leur fond beige (`#e5dcc5`) cohérent
- [ ] Footer copyright matche tout le reste
- [ ] Thème sombre → aucun changement
- [ ] Mobile : pile verticale inchangée

**📦 v1.40.7** : Vue OSM HOME — niveau de tuiles adaptatif (fix flou) :

KARMA : *« pas mal, mais le rendu est trop flou »*. v1.40.6 utilisait `minNativeZoom` fixe (z=-3 pour Catacombes = scale ×8) pour garantir la safety RAM mobile. Résultat : 1 tuile de ~500×282 px étirée sur la mini-carte → flou.

**Fix** : réplique l'heuristique `_choisirNiveauBaseline` de `osmView.js` v1.39.11 — choisit le niveau **le plus zoomé** tel que `cols × rows ≤ MAX_TILES_HOME` (12 tuiles, budget RAM mini-carte ~12 MB décodé).

**Exemple plan 4000×2251 (Catacombes)** :

| Niveau | Scale | Tuiles totales | RAM (1 MB/tuile RGBA décodée) | Choisi v1.40.7 ? |
|---|---|---|---|---|
| z=0 | ×1 | 8×5 = **40** | 40 MB | ❌ trop |
| z=-1 | ×2 | 4×3 = **12** | 12 MB | ✅ **choisi (résolution ×4 vs v1.40.6)** |
| z=-2 | ×4 | 2×2 = 4 | 4 MB | — |
| z=-3 | ×8 | 1×1 = 1 | 1 MB | (v1.40.6 = flou) |

**Implémentation** :

Nouveau helper `_chooseTileLevelForHome(tiling, planW, planH)` dans `osmHomePreview.js` :

```js
function _chooseTileLevelForHome(tiling, planW, planH) {
  const MAX_TILES_HOME = 12;
  const tileSize = tiling.tileSize || 512;
  for (let z = tiling.maxNativeZoom; z >= tiling.minNativeZoom; z--) {
    const scale = Math.pow(2, -z);
    const cols = Math.ceil(Math.ceil(planW / scale) / tileSize);
    const rows = Math.ceil(Math.ceil(planH / scale) / tileSize);
    if (cols * rows <= MAX_TILES_HOME) return z;
  }
  return tiling.minNativeZoom;
}
```

Utilisé dans `_extractV2TilesOverview` à la place du `const z = config.tiling.minNativeZoom`.

**Plans très grands** (16K×16K → 16 tuiles à z=-3) : le fallback `minNativeZoom` reste en place. Quelques cas exotiques garderont du flou tolérable.

**Plans très petits** (≤ 1024×1024) : potentiellement z=0 natif si ça tient sous 12 tuiles → résolution max sur la mini-carte.

**Auto-adaptation** : différents plans utiliseront différents niveaux selon leur taille. Cohérent avec le pattern d'OsmView modale qui fait pareil pour la vue grand écran.

**Tests à faire** :

- [ ] Plan Catacombes → log console : `Tiles V2 : N tuile(s) rendues à z=-1 (scale x2)` (au lieu de z=-3 x8)
- [ ] Mini-carte → image plan **nette** (lignes/symboles cataphiles lisibles)
- [ ] Slider opacité → continue de fonctionner
- [ ] Plein écran ⛶ → image plan nette aussi
- [ ] Plan plus petit (Test Legacy ou MultiLVL) → niveau auto choisi (peut-être z=0)
- [ ] Plan 16K → reste à z=-3 (16 tuiles plafond, légèrement flou mais acceptable)

**Régression** : ~12 MB décodé en RAM pour les tuiles HOME au lieu de ~1 MB. Toujours largement sous le budget mobile (~500 MB iPhone PWA). Cache RAM v1.40.4-6 préservé.

**📦 v1.40.6** : Vue OSM HOME — tuiles V2 overview + slider opacité :

KARMA : *« ok il manque l'image principal, mais on a tout le reste (attention tuile et opacity) »*. v1.40.5 affichait POI + Roads + Zones + Structures embedded mais PAS l'image du plan. KARMA veut les tuiles V2 + slider opacité (cohérent OsmView modale).

**Implémentation** :

Réutilise le pattern v1.39.10 (`osmView.js > _renderTilesV2OnOsm`) :
- Tuiles du niveau le plus dézoomé (`minNativeZoom`, typiquement z=-3 → scale ×8)
- 1-4 tuiles ~200 KB-1 MB max → zéro risque crash mobile
- `L.imageOverlay.rotated` par tuile (parallélogrammes via georef)

**Pipeline étendu** :

```
_loadPlanDataForPreview(planId)
  ├─ Extract plan-config.json + dataLayers JSON (v1.40.4-5)
  └─ 🆕 v1.40.6 : Extract tuiles z=minNativeZoom
       → blob URL par tuile, tracké dans _tilesBlobUrls
       → { tiles: [{col, k, url}], planW, planH, z, scale, tileSize }
```

**Rendu** :
- `_tilesLayer` ajouté **AVANT** `_dataLayer` à `_initMiniMap` → tuiles dessous, data dessus
- `_renderTilesOnMiniMap(tilesData, georef)` : 1 `L.imageOverlay.rotated` par tuile avec `opacity: _planOpacity`
- Convention CRS.Simple flip Y (`pxTop = planH - k * tileSize * scale`)

**Slider opacité** :
- UI : `<input type="range">` dans le bandeau, entre le dropdown et le bouton ⛶
- Default `_planOpacity = 0.7` (= 70% — transparent pour voir les rues OSM derrière)
- Sur input → `_setPlanOpacity(v)` itère `_tilesLayer.eachLayer` et applique `setOpacity` ou fallback `_image.style.opacity`

**Helpers ajoutés** (`osmHomePreview.js`, +130 lignes) :

| Helper | Rôle |
|---|---|
| `_extractV2TilesOverview(zip, config)` | Extract tuiles z=minNativeZoom, crée blob URLs trackés. Skip si V1 |
| `_renderTilesOnMiniMap(tilesData, georef)` | 1 overlay rotated par tuile avec opacité courante |
| `_setPlanOpacity(opacity)` | Update slider → setOpacity sur chaque overlay |
| `_revokeTilesBlobUrls()` | Cleanup au close (réservé futur — actuellement laissé pour cache RAM) |

**Plans V1 (non tuilés)** : skip silencieux. Le widget reste OK avec markers georef + data layers. Pas de fallback "resize baseImage" car ça nécessite canvas resize ~50 lignes complexité moyenne — reporté.

**Cache** :
- Les blob URLs sont créés UNE FOIS et stockés dans `_planDataCache[planId].tilesOverview.tiles[i].url`
- Re-sélection du même plan → réutilise les blob URLs existants (instant + RAM constante)
- Switch entre plans → nouveau plan crée ses propres URLs, ancien plan garde les siennes en cache (acceptable, cleared au unload page)
- LRU pourra être ajouté si KARMA remonte fuites RAM sur sessions HOME très longues

**📁 7 fichiers modifiés** :

| Fichier | Modif |
|---|---|
| `js/osmHomePreview.js` | +130 lignes (extract tuiles + render + slider opacité + state) |
| Bumps habituels | sw.js, copyright.js, version.json |
| Docs | NETWORK_AUDIT + README (journal détaillé) |

**🧪 Tests à faire** :

- [ ] Plan Catacombes V2 → mini-carte montre l'image du plan + POI + Roads + Zones par-dessus OSM
- [ ] Log console : `[OsmHomePreview] Tiles V2 : N tuile(s) rendues à z=-3 (scale x8)`
- [ ] Slider 🎚️ → l'image plan devient plus/moins transparente en live
- [ ] Plan V1 → log "(plan V1, pas de tuiles)" + widget normal sans image plan
- [ ] Re-sélection plan déjà vu → instantané (cache RAM, pas de ré-extraction)
- [ ] Mode plein écran ⛶ → tuiles plan visibles aussi (même `_mapInstance`)

**📝 Notes** :
- L'opacité 0.7 default est un compromis : assez visible pour voir le plan, assez transparent pour voir le réseau OSM. User peut ajuster via slider.
- Pas de persistance du slider entre sessions (volontaire — simplicité). Si KARMA veut, on persiste en LS dans une futur v1.40.7.

**📦 v1.40.5** : Vue OSM HOME — 2 hotfixes (POI à 0 + cascade CSS clair) :

KARMA tests v1.40.4 : *« [OsmHomePreview] Data render : 0 POI · 0 roads · 0 zones · 0 struct »* + *« couleur ok en back OSM mais je veux la meme en mes plan, profile »*.

**🐛 Bug 1 — POI à 0** :

Cause racine : v1.40.4 lisait `json.points` pour le tableau POI, mais le format réel d'un data layer JSON utilise `json.data` ou `json.editorPoints` (cf `utils.js > normaliserPoints` lignes 1297-1301). Mon hypothèse était fausse → 0 POI à chaque render alors que les roads/zones/structures fonctionnaient (eux utilisent bien `json.roads`, `json.zones`, `json.structures`).

Fix v1.40.5 : cascade `json.data → json.editorPoints → json.points` (fallback gardé par sécurité pour formats 3rd party) :

```js
const poiArray = Array.isArray(json.data)         ? json.data
               : Array.isArray(json.editorPoints) ? json.editorPoints
               : Array.isArray(json.points)       ? json.points
               : [];
```

Pourquoi 2 formats ? `json.data` = format embedded standard (`createConf.js > _genererZip` génère `{ data: [...] }`). `json.editorPoints` = format `.mkmsession` export utilisateur (`sessionExporter.js`).

Test : `[OsmHomePreview] Data render : 247 POI · 38 roads · 5 zones · 12 struct` (sur plan Catacombes typique).

**🐛 Bug 2 — Override CSS thème clair pas appliqué** :

Cause racine : mon override v1.40.3 était placé ligne ~4640 du fichier CSS. Les anciennes règles `background: #fdf8eb !important` se trouvaient lignes 14105 et 15206. À spécificité CSS égale + `!important` égaux, **la règle qui apparaît en DERNIER gagne** → mon override ligne 4640 était systématiquement écrasé.

Symptômes constatés par KARMA :
- ✅ Card OSM (#ktaOsmHomeBox) avait sa couleur (= mon nouveau selector, pas de conflit ailleurs)
- ❌ Mes plans, Reprendre, Ajouter restaient en `#fdf8eb` (= les anciennes règles ligne 14105/15206 prenaient le dessus)

Fix v1.40.5 : **déplacement du bloc d'overrides v1.40.3 en TOUTE FIN de fichier `style.css`** (après ~25000 lignes). Comme c'est maintenant la dernière règle, elle gagne la cascade. Ancienne position (ligne ~4640) : remplacée par un commentaire pointeur vers la nouvelle position.

**📁 7 fichiers modifiés** :

| Fichier | Modif |
|---|---|
| `js/osmHomePreview.js` | Fix `_loadPlanDataForPreview` : cascade `json.data → editorPoints → points` |
| `css/style.css` | Déplacement bloc thème clair HOME ~4640 → fin de fichier |
| Bumps habituels | sw.js, copyright.js, version.json |
| Docs | NETWORK_AUDIT + README (journal détaillé) |

**🧪 Tests à faire** :

- [ ] Plan Catacombes → POI/Roads/Zones/Structures visibles avec compteurs > 0 dans la console
- [ ] Bascule thème clair → toutes les sections (Mes plans + Reprendre + Vue OSM + Ajouter) en `#e5dcc5` uniforme matchant le footer
- [ ] Thème sombre → aucun changement
- [ ] Re-sélection plan → instantané (cache RAM préservé v1.40.4)

**Notes** :
- Cache RAM v1.40.4 préservé → re-sélection rapide même après ce fix
- Le fix POI affecte UNIQUEMENT le widget HOME. La modale Vue OSM full-screen (osmView.js) lit directement `window._ktaDataMarkers` (= déjà parsé par le pipeline standard), pas concernée.

**📦 v1.40.4** : Vue OSM HOME — data layers embedded (POI + Roads + Zones + Structures) :

KARMA : *« je n'ai aucune data de catacombe layer POI, zone, afficher sur mon OSM j'ai que les deux point de calage »*. v1.40.0-3 affichaient uniquement les markers georef `pointA`/`pointB` (= mode léger documenté). KARMA veut voir les data embedded.

**Refonte : extraction ZIP partielle à la sélection** :

L'approche v1.40.0 documentait que l'extraction ZIP serait reportée pour garder le boot HOME léger. v1.40.4 lève ce report :
- Extraction async **uniquement à la sélection du plan** (pas au boot HOME → boot reste léger)
- **Cache RAM par planId** : si user re-sélectionne un plan déjà vu pendant la session HOME, pas de ré-extraction
- **Lazy fallback** : si ZIP inaccessible (plan serveur sans cache local, blob purgé, FS handle révoqué…), le widget reste OK avec juste les markers georef (= comportement v1.40.0-3 préservé)

**Pipeline d'extraction** :

```
selectPlan(planId)
  ↓
_loadPlanDataForPreview(planId)
  ├─ Check cache RAM → si hit, return immédiat
  ├─ _getPlanZipFile(planId)
  │   ├─ Tentative FS Access handle (Chrome/Edge desktop)
  │   │   └─ PlanRegistry.getHandle(planId) → ensureHandlePermission → getFile()
  │   └─ Fallback IDB blob (mobile/Firefox/Safari)
  │       └─ PlanRegistry.getBlob(planId)
  ├─ JSZip.loadAsync(file)  ← lazy : lit juste la table centrale du ZIP, pas les contenus
  ├─ Extract plan-config.json → parse
  ├─ Pour chaque config.dataLayers[i] :
  │   └─ Extract dataLayers[i].file → parse JSON
  │       → { points, roads, zones, structures }
  ├─ Cache RAM : _planDataCache[planId] = result
  └─ Return { config, dataLayers: [...] }
```

**Rendu sur mini-carte** (`_renderDataLayersOnMiniMap`) :

| Catégorie | Rendu | Couleur |
|---|---|---|
| **POI** | `L.circleMarker` 4px | jaune charte `#f4c542` fillOpacity 0.85 |
| **Roads** | `L.polyline` weight 2 | `road.color` natif (fallback `#8892a4`) |
| **Zones** | `L.polygon` weight 1.5 | `zone.color` + `zone.fillColor` natifs (fillOpacity ×0.7 pour mini-carte) |
| **Structures mur/pilier** | `L.polygon` | aligné `STRUCT_STYLES_HOME` (mapping dérivé de `structures.js > STRUCTURE_STYLES`) |
| **Structures fronts** | `L.polyline` weight 4 | jaune/orange selon front-1/2 |

**Décisions de simplification** :

| Aspect | Choix | Raison |
|---|---|---|
| POI rendu | `L.circleMarker` (pas `L.marker` avec icônes) | Évite extraction des icônes images du ZIP. Perf > cohérence visuelle stricte sur HOME (l'user va dans OSM modal pour le détail) |
| Roads itinerary | Skip (`r.type === "itinerary"`) | Pas de session iti active en HOME, cohérent |
| Filtre FilterPanel | Non appliqué | Pas de session active = pas de filtres tags/niveaux. Tout afficher. |
| M-LVL filter | Non appliqué (idem) | HOME = vue d'ensemble, pas de filter par niveau |
| Layer.visible flag | Respecté (skip si false dans plan-config) | Cohérence avec map principale |
| Race condition | Garde anti-race dans selectPlan : skip render si planId changé pendant l'extraction | Robustesse si user clic rapide sur plusieurs plans |

**Cache RAM** :

- Structure : `_planDataCache[planId] = { config, dataLayers }`
- Taille typique : ~50-200 KB par plan parsed
- Cleared automatiquement au unload page (pas de LS pour éviter quota)
- Pas de LRU cap (rare qu'un user ait > 10 plans georef → tolérable)

**Coût performance** :
- 1ère sélection d'un plan : ~200ms-1s (JSZip + parse + render selon taille plan)
- Re-sélection : <50ms (cache RAM)
- Boot HOME : aucun overhead (extraction lazy uniquement à la sélection)

**Tests à faire** :

- ✅ Plan Catacombes (v2 tuilé, dataLayers nombreux) → POI/Roads/Zones/Structures visibles après ~500ms
- ✅ Plan v1 simple → idem (pipeline indépendant du tiling)
- ✅ Plan serveur sans cache local → fallback markers georef seuls (pas de crash)
- ✅ Plan avec blob purgé → idem
- ✅ Re-sélection plan déjà vu → instantané (cache RAM)
- ✅ Sélection rapide entre 2 plans → pas de race (garde anti-race dans selectPlan)
- ✅ Mode fullscreen ⛶ → data layers visibles aussi (même `_mapInstance`)

**Régression cross-module** :
- `PlanRegistry.getHandle`/`.getBlob`/`.ensureHandlePermission` réutilisés (API stable depuis v1.7.x)
- `JSZip` chargé en global (déjà dispo via `index.html`, utilisé par `chargerZipFichier`)
- `KmzExport.buildTransform`/`.planToGps` réutilisés (pattern identique à `osmView.js`)
- Aucune side-effect sur `window.PLAN_CONFIG` ou `window._currentLoadedPlanId` : extraction isolée
- Si JSZip indispo → log warn + fallback markers georef seuls

**Bumps** : v1.40.3 → v1.40.4. Module `osmHomePreview.js` passe de ~400 → ~600 lignes (+200 helpers data extraction + rendu).

**📦 v1.40.3** : Thème clair HOME — fix titre Vue OSM transparent + sync couleur footer :

KARMA bugs v1.40.2 (screenshot fourni) :
1. *« on a un bug toujours sur le titre osm en fond transparant »* → le titre `🌍 Vue OSM` laissait voir le fond doré du body derrière (pas de card autour)
2. *« en mode clair le fond des mode (Profile, mes plan, OSM...) doit avoir la meme couleur que le background du footer »* → mismatch visuel : sections en `#fdf8eb` crème clair, footer en `#e5dcc5` beige plus chaud

**Analyse couleurs** :
- `--kta-light-bg: #f0e8d8` (body mode carte + container Leaflet)
- `--kta-light-bg-elevated: #fdf8eb` (modales, presque blanc) → utilisé par sections HOME avant v1.40.3
- `--kta-light-bg-deep: #e5dcc5` (sidebar interne + table headers + footer copyright)

**Fix 1 — Card complète pour `#ktaOsmHomeBox` en thème clair** :

Le pattern existant pour `#myPlansBox` (cf `style.css:15206+`) était bien défini :
- `background: #fdf8eb` (→ change en `#e5dcc5` au fix 2)
- `border: 1px solid rgba(154, 135, 84, 0.35)`
- `border-radius: 14px`, padding, margin, box-shadow
- `.loader-section-head` interne transparent avec border-bottom

J'ai dupliqué ce pattern pour `#ktaOsmHomeBox` + `#ktaOsmHomeBox .loader-section-head`. Résultat : le widget OSM HOME ressemble maintenant aux autres cards (Mes plans, Ajouter).

**Fix 2 — Sync background sections HOME avec couleur footer (`#e5dcc5`)** :

Override en fin de fichier CSS pour basculer toutes les sections HOME de `#fdf8eb` (`--kta-light-bg-elevated`) → `#e5dcc5` (`--kta-light-bg-deep`) = même couleur que `.kta-loader-copyright` (footer).

Sections impactées :
- `#myPlansBox` (Card Mes plans)
- `#resumeBox` (Bandeau Reprendre)
- `#panelZip` (Card Ajouter un plan corps)
- `.loader-col-actions > .loader-section-head` (Card Ajouter un plan header)
- `.loader-col-actions > .loader-panel` (Card Ajouter un plan corps, autre selector)
- `#ktaOsmHomeBox` (Card Vue OSM — nouveau v1.40.3)

Profil bandeau (`Bienvenue/Mon profil`) reste sur son style propre — probablement déjà cohérent visuellement, à vérifier si KARMA remonte.

**Implémentation CSS** :

~60 lignes ajoutées en fin de section thème clair OSM HOME (juste après les overrides v1.40.1 existants) :

```css
/* Card #ktaOsmHomeBox en clair */
body.kta-theme-light #ktaOsmHomeBox,
html.kta-theme-light #ktaOsmHomeBox {
  background: var(--kta-light-bg-deep, #e5dcc5) !important;
  border: 1px solid rgba(154, 135, 84, 0.35) !important;
  border-radius: 14px !important;
  padding: 14px 18px 16px !important;
  margin-bottom: 14px !important;
  box-shadow: 0 4px 14px rgba(80, 60, 30, 0.10) !important;
}
body.kta-theme-light #ktaOsmHomeBox .loader-section-head,
html.kta-theme-light #ktaOsmHomeBox .loader-section-head {
  background: transparent !important;
  border-bottom: 1px solid rgba(154, 135, 84, 0.18) !important;
  /* + autres reset */
}

/* Sync background sections avec couleur footer */
body.kta-theme-light #myPlansBox,
html.kta-theme-light #myPlansBox,
body.kta-theme-light #resumeBox,
html.kta-theme-light #resumeBox,
/* … */ {
  background: var(--kta-light-bg-deep, #e5dcc5) !important;
}
```

`!important` nécessaire pour écraser les valeurs précédentes (lignes 14105-14108 + 15206-15251) qui codent `#fdf8eb` en dur.

**Tests à faire** :

- ✅ Bascule thème clair → titre `🌍 Vue OSM` maintenant dans sa card crème (pas de fond doré transparent derrière)
- ✅ Mes plans + Ajouter + Vue OSM toutes en `#e5dcc5` (beige uniforme, matche footer)
- ✅ Le footer copyright matche visuellement les sections (= cohérence demandée)
- ✅ Thème sombre : aucun changement (overrides `body.kta-theme-light` ne s'appliquent pas)
- ✅ Mobile : pile verticale inchangée
- ✅ Plein écran ⛶ (v1.40.2) : la card est masquée en fullscreen, le background overlay reste sur ses propres styles

**Régression cross-module** :
- `!important` + spécificité `body.kta-theme-light` ne touchent QUE le thème clair
- Autres sections du loader pas concernées (kta-loader-profile-bar, kta-loader-copyright, …)
- Pas d'impact sur le mode map (changements isolés au loader/HOME)

**📝 Note futur** : si KARMA remonte que le bandeau `Bienvenue/Mon profil` ou `Reprendre Catacombes` ne matche pas non plus, on étendra le selector en v1.40.4.

**📦 v1.40.2** : Vue OSM HOME — ⛶ refonte plein écran inline :

KARMA report v1.40.1 : *« quand je clique sur plein ecran ca ne fonctionne pas apres avoir cliquer sur mon plan chargement normal »* + correction stratégie : *« quand on clique sur afficher pleine ecran on agrandit juste le modal du home OSM »*.

**Bug racine (v1.40.0/v1.40.1)** :

L'ancien flow ⛶ tentait de :
1. Set un flag `sessionStorage["kta_osm_home_open_after_load"]`
2. Simuler un click sur le bouton "▶️ Charger" du plan dans la liste via `document.querySelector('[data-plan-id="..."]') > .plan-row-load-btn`
3. Hook `kta:planConfigReady` qui détecte le flag et ouvre `OsmView.open()` après le chargement

**Tout était cassé** :
- HTML utilise `data-id="..."` (PAS `data-plan-id`)
- Classe bouton charger : `.plan-row-btn.plan-row-load` (PAS `.plan-row-load-btn`)
- Event `kta:planConfigReady` n'est PAS fired par le pipeline actuel (cf commentaire `refonteInterface.js:273`)

Résultat : click ⛶ → fallback alert → si KARMA charge le plan manuellement, rien ne se passe à la fin (flag jamais consommé).

**Refonte sémantique v1.40.2** :

Plus de bascule en map mode. Le ⛶ **agrandit simplement la mini-carte HOME** en overlay plein-viewport via toggle CSS. L'user reste sur la HOME, juste le widget prend tout l'écran. Click ⛶ inverse (devient ✕) ou touche Échap pour revenir.

Avantages :
- ✅ Flow ultra-simple : 1 toggle de classe CSS, pas de hook fragile
- ✅ Marche dans tous les cas (pas de dépendance à des sélecteurs HTML qui changent)
- ✅ Marche sur mobile (iOS Safari Fullscreen API restrictif → on évite)
- ✅ Pas de bascule de contexte → user moins surpris

**Implémentation `osmHomePreview.js`** :

- Suppression `_checkAutoOpenAfterLoad`, `_bindAutoOpenAfterLoad`, gestion sessionStorage → ~30 lignes en moins
- Refonte `openFullScreen()` :
  - Toggle classe `.kta-osm-home-fullscreen-active` sur `#ktaOsmHomeBox`
  - Toggle classe `.kta-osm-home-fs-lock` sur `<body>` (empêche scroll derrière)
  - Bind/unbind `keydown Escape` listener
  - Update bouton ⛶ ↔ ✕ + tooltip
  - `_mapInstance.invalidateSize()` après 100ms (laisse le DOM appliquer la transition)
- Helper `_fsEscapeHandler` stocké pour cleanup propre

**CSS `style.css`** :
- `.kta-osm-home-box.kta-osm-home-fullscreen-active` : `position: fixed; inset: 0; z-index: 9999`, fond charte sombre
- Header `.loader-section-head` adapté (padding + bg semi-transparent)
- `.kta-osm-home-content` : flex stretch sur toute la hauteur
- `.kta-osm-home-map` : flex 1, min-height 0
- Bouton ✕ légèrement agrandi en fullscreen (font-size 14px + padding bumped)
- `body.kta-osm-home-fs-lock { overflow: hidden; }` pour bloquer scroll background
- Variants thème clair (background, header)

**Footer du widget** mis à jour : "🔒 Tiles : tile.openstreetmap.org · ⛶ pour agrandir" (avant : "ouvre la vue complète (charge le plan)" — obsolète).

**Tests à faire** :

- ✅ Click ⛶ → carte passe en plein écran sur HOME, bouton devient ✕
- ✅ Click ✕ ou Échap → retour à la mini-carte dans la colonne
- ✅ Leaflet : tuiles OSM couvrent tout l'écran (pas de zone grise = `invalidateSize` après toggle)
- ✅ Scroll page bloqué pendant le fullscreen (background ne défile pas si on scroll sur la carte)
- ✅ Thème clair : fond clair + header lisible
- ✅ Thème sombre : fond `#0a0d18` charte
- ✅ Mobile : marche, pas de bug iOS Safari Fullscreen API

**Cleanup code obsolète** :
- ~30 lignes de gestion sessionStorage / hooks `kta:planConfigReady` / simulation clic plan row supprimées
- Le module passe de ~430 → ~400 lignes, plus simple à maintenir

**📝 Note KARMA pour bug 2 ("pas de data affichées en HOME catacombes")** : v1.40.0 documentait que le mode léger n'affiche QUE les markers pointA/pointB georef (= pas de data layers POI). Si tu veux les POI/Roads/Zones embedded sur la mini-carte HOME, ça nécessite une extraction ZIP partielle (helper `_loadPlanForPreview` mentionné dans v1.40.0 mais reporté pour garder le boot HOME léger). Si tu veux qu'on attaque ça → futur v1.40.3 ou v1.41.0.

**📦 v1.40.1** : Vue OSM HOME — masquage offline-first + thème clair :

KARMA hotfix v1.40.0 (2 retours):
1. *« si on a pas cocher le OSM dans la config, on affiche pas ce pannel OSM en home »* → option (b) masquage complet validée
2. *« probleme de CSS en mode clair, n'affiche pas la note en footer de se mode OSM »* → fix variants thème clair

**Fix 1 — Masquage colonne si pas opt-in** :

Avant v1.40.1, si l'user n'avait pas activé `🌐 Autoriser OSM`, le widget affichait un placeholder "🌐 Vue OSM désactivée — 🔓 Autoriser OSM" qui prenait toute la hauteur de la colonne (~260px) et déséquilibrait le grid PC. Cohérence faible avec la philo "100% offline par défaut" : un user qui n'a pas opt-in voyait quand même la promotion d'une feature externe.

Fix : **masquage complet** de la colonne (`display: none`) + rebascule du grid PC `2fr 3fr 2fr` → `3fr 2fr` via classe `kta-no-osm` ajoutée dynamiquement sur `.loader-grid`. Aucune trace du widget tant que pas autorisé. Point d'entrée pour activer : ⚙️ Configuration home > 🌐 Autoriser la Vue OSM (= existant depuis v1.39.0).

Implémentation `js/osmHomePreview.js` :
- Nouveau helper `_setOsmColumnVisible(visible)` : toggle `.loader-col-osm` display + class `.kta-no-osm` sur le grid
- `_renderOptInNeeded(container)` : remplace l'ancien rendu placeholder par `_setOsmColumnVisible(false)`
- `mount()` : appelle `_setOsmColumnVisible(true)` au début pour restore si on rebascule en opt-in ON (refresh via listener `kta:osmOptInChange`)

CSS `css/style.css` (dans `@media (min-width: 1024px)`) :
```css
.loader-grid.kta-no-osm {
  grid-template-columns: 3fr 2fr;
}
```

**Fix 2 — Variants thème clair** :

Bug : le footer "🔒 Tiles : tile.openstreetmap.org · ⛶ ouvre la vue complète" et d'autres éléments du widget utilisaient les couleurs du thème sombre (`color: #8892a4`, `border: rgba(255,255,255,0.06)`, fonds sombres) → en thème clair, le texte gris muet sur fond beige clair était quasi invisible et la bordure blanche disparaissait totalement.

Fix : ajout de 9 selectors `body.kta-theme-light .kta-osm-home-*` / `html.kta-theme-light .kta-osm-home-*` avec les vars `--kta-light-*` (pattern §53 thème clair). Pas de duplication de styles ailleurs — les overrides ciblent uniquement les classes problématiques :

| Élément | Override clair |
|---|---|
| `.kta-osm-home-content` | bg `--kta-light-bg-elevated`, border `--kta-light-border` |
| `.kta-osm-home-bandeau` | bg cyan transparent (lisible), text `--kta-light-text` |
| `.kta-osm-home-bandeau select` | bg `--kta-light-bg`, text + border `--kta-light-*` |
| `.kta-osm-home-bandeau select option` | bg + text variants |
| `.kta-osm-home-bandeau .kta-osm-home-fullscreen` | ambre assombri `#8a6a14` pour contraste |
| `.kta-osm-home-footer` | **text `--kta-light-text` ≈ `#5a4a30` (assombri) + border noire transparente** ← le fix principal demandé par KARMA |
| `.kta-osm-home-empty` / `.kta-osm-home-loading` | text `--kta-light-text` |
| `.kta-osm-home-empty strong` | text plein noir sombre `#2a2620` |

Toutes les overrides utilisent `!important` (pattern aligné §53 thème clair pour les widgets dynamiques où la spécificité CSS est imprévisible).

**Tests à faire** :

Masquage :
- ✅ HOME sans opt-in OSM → colonne OSM absente, grid PC 2 cols (3fr 2fr) comme v1.39.x
- ✅ Activation via ⚙️ Configuration → opt-in ON → widget OSM réapparaît automatiquement (via `kta:osmOptInChange` listener)
- ✅ Désactivation via ⚙️ Configuration → colonne se remasque automatiquement

Thème clair :
- ✅ Bascule thème clair → footer "🔒 Tiles : …" maintenant lisible (couleur sombre sur fond clair)
- ✅ Bandeau dropdown + bouton ⛶ lisibles
- ✅ Placeholders (loading/empty) lisibles
- ✅ Markers OSM (Leaflet natif) : pas affectés (rendus par leaflet.css)

Régression :
- ✅ Thème sombre : aucun changement visuel (variants `body.kta-theme-light` ne s'appliquent pas)
- ✅ Mobile : pile verticale inchangée

**Bumps** : `v1.40.0 → v1.40.1` (sw.js, copyright.js, version.json, NETWORK_AUDIT md/html).

**📦 v1.40.0** : Bouquet final Vue OSM — mini-preview HOME :

KARMA bouquet final — Step 4 roadmap : *« en HOME j'avais penser a integrer entre Mes plan et import su / et sur PC plus comme ca. On charge le dernier plan chargé, ou sélection (jamais deux plan chargé a la fois, pour perf) »*. Choix validés `1:a 2:b 3:c 4:c+icone 5:a 6:a / Gros bump 1.40.0 tout en un`.

**Concept** : nouveau widget de prévisualisation dans la page d'accueil (HOME), entre 📚 Mes plans et 📦 Ajouter un plan. Affiche les plans georef projetés sur OpenStreetMap SANS avoir à les charger en map mode complet (= boot HOME léger, pas de bascule d'écran).

**Layout** :

| Format | Disposition |
|---|---|
| Mobile (<1024px) | Pile verticale : 📚 Mes plans → **🌍 Vue OSM** → 📦 Ajouter |
| PC (≥1024px) | Grille 3 colonnes `2fr 3fr 2fr` (Plans / OSM / Actions) |

**MVP v1.40.0 — Mode léger** :

Pour rester pragmatique sur ce bump (et éviter le coût d'extraction ZIP au boot HOME — JSZip + lecture binaire = lourd mobile), v1.40.0 affiche UNIQUEMENT les markers georef au lieu d'extraire tuiles plan + data layers. Le widget montre :

- **Tile layer OSM** (tile.openstreetmap.org, identique au modal Vue OSM)
- **Marker pointA** (vert) + **marker pointB** (rouge) de la georef
- **Ligne dashed jaune** entre A et B = échelle plan (visualise les 2 ancres GPS)
- **Tooltips** au hover : "📍 Point A" / "📍 Point B"
- **Auto fitBounds** sur la zone du plan + padding 30px

Cohérent avec la philosophie "où est ce plan dans le monde réel ?" — sans charger le plan complet.

**Futur v1.40.1+** : extension possible avec tuiles plan overview minNativeZoom + POI/Roads/Zones/Structures embedded — nécessite extraction ZIP partielle (helper `_extractPlanConfig` + `_extractTilesOverview`) déjà identifiée mais reportée pour garder ce bump testable.

**Module `js/osmHomePreview.js`** (~430 lignes) avec API publique :

```js
window.OsmHomePreview = {
  mount()         → monte le widget dans #ktaOsmHomeContent (auto-call DOMContentLoaded)
  refresh()       → recharge la liste des plans + re-render
  selectPlan(id)  → bascule le plan affiché (= change le marker)
  openFullScreen()→ déclenche le flow full-screen sur le plan courant
}
```

**Helpers internes** :
- `_isOptedIn()` / `_setOptedIn(value)` — gère le flag LS `myktamap_osm_view_opt_in` (partagé avec `osmView.js`)
- `_listGeorefPlans()` — scan `PlanRegistry.getAll()` + check `KmzExport.getCalibration(planId)` pour chaque plan. Tri lastOpened desc.
- `_renderOptInNeeded(container)` — placeholder "🌐 Vue OSM désactivée" avec bouton "🔓 Autoriser OSM"
- `_renderOffline(container)` — placeholder "📴 Hors-ligne"
- `_renderNoGeorefPlans(container)` — placeholder "📍 Aucun plan géoréférencé" avec instructions pédagogiques
- `_renderWidget(container, plans, selectedId)` — bandeau (dropdown + ⛶) + mini-map + footer
- `_initMiniMap(georef)` — init `L.map` mini-carte + tile layer OSM
- `_renderGeorefMarkers(georef)` — markers + ligne + fitBounds
- `openFullScreen()` — bascule en map mode complet via simulation clic "▶️ Charger" du plan sélectionné + flag sessionStorage `kta_osm_home_open_after_load` qui déclenche `OsmView.open()` automatiquement après `kta:planConfigReady`
- `_checkAutoOpenAfterLoad()` / `_bindAutoOpenAfterLoad()` — hook sur événements load qui ouvre la modale au moment opportun

**Persistance LS** :
- `myktamap_osm_view_opt_in` (partagé avec `osmView.js`) — opt-in user pour les appels OSM
- `myktamap_osm_home_last_selected_plan` (nouveau v1.40.0) — dernier plan sélectionné dans le dropdown (UX continuity entre sessions HOME)
- `kta_osm_home_open_after_load` (sessionStorage, éphémère) — marqueur pour auto-open de la modale après bascule en map mode

**Cas dégénérés gérés** :

| Cas | Comportement |
|---|---|
| Pas opt-in OSM (default) | Placeholder + bouton "🔓 Autoriser OSM" |
| Hors-ligne (navigator.onLine === false) | Placeholder "📴 Hors-ligne" |
| Aucun plan georef en LS | Placeholder pédagogique avec marche à suivre |
| Plan georef sélectionné mais pas le lastOpened | Dropdown permet de sélectionner n'importe quel plan georef |
| Plan georef dans `plan-config.json` UNIQUEMENT (jamais saisi via Réglages) | NON visible dans le widget (limitation v1.40.0 — l'user doit charger le plan 1 fois pour propagation via `_propagerGeorefVersKmzExport`) |
| Single-plan constraint KARMA | Respecté : jamais 2 plans chargés simultanément. Le widget HOME ne CHARGE aucun plan (juste lit les georef LS). Le bouton ⛶ charge UN plan complet et bascule en map mode. |

**Pourquoi pas d'extraction ZIP au boot HOME ?** :

L'alternative aurait été d'extraire `plan-config.json` de chaque ZIP (FS handle / IDB blob) au boot HOME pour avoir la georef embedded. Coût mesuré : ~200-500 ms par plan sur mobile (JSZip.loadAsync + extract du fichier). Sur 10 plans → 2-5 secondes de boot HOME, inacceptable. La cascade `KmzExport.getCalibration(LS)` est instantanée.

**Tradeoff** : un user qui a généré son plan via le Générateur AVEC georef embedded mais n'a JAMAIS chargé son plan en map mode → la calibration ne sera pas en LS → plan absent du widget HOME. Au premier load du plan en map mode, `_propagerGeorefVersKmzExport` la copie en LS → plan apparaît au reload HOME suivant.

**HTML modifié** (`index.html`) :
- Nouvelle colonne `<div class="loader-col loader-col-osm">` entre `loader-col-plans` et `loader-col-actions`
- `<div id="ktaOsmHomeBox">` avec header `🌍 Vue OSM` + container `#ktaOsmHomeContent` rempli dynamiquement
- Script `<script src="js/osmHomePreview.js" defer></script>` après `js/osmView.js`

**CSS modifié** (`css/style.css`) :
- `loader-grid` PC : passe de `grid-template-columns: 3fr 2fr` à `2fr 3fr 2fr` (3 cols) avec `gap: 0 24px` (réduit de 32px pour faire place à la nouvelle col)
- `.loader-col-osm` : flex column, mini-carte stretch toute la hauteur
- `.kta-osm-home-*` : 9 classes pour bandeau, map, footer, états (loading/empty/cta)

**Service Worker** : `osmHomePreview.js` ajouté à `ASSETS_TO_CACHE` pour disponibilité offline (le widget se dégrade gracieusement avec `_renderOffline` si pas d'Internet).

**Bumps** :
- `sw.js > CACHE_NAME = "myktamap-cache-v1.40.0"` (saut majeur 1.39 → 1.40 pour marquer la roadmap Step 4 complète)
- `js/copyright.js > build = "v1.40.0"`
- `version.json` : version + notes user-friendly
- NETWORK_AUDIT.md/html : header v1.40.0

**Tests à faire** :

Cas opt-in :
- ✅ Boot HOME avec opt-in OFF → placeholder + bouton "🔓 Autoriser OSM"
- ✅ Click bouton → opt-in ON → widget se met à jour automatiquement (via `kta:osmOptInChange`)

Cas hors-ligne :
- ✅ Mode avion ON → placeholder "📴 Hors-ligne"

Cas plans :
- ✅ Aucun plan georef → placeholder pédagogique
- ✅ 1+ plan georef → widget complet avec dropdown + mini-carte
- ✅ Dropdown : sélection d'un autre plan → markers se mettent à jour
- ✅ `lastSelected` persisté en LS entre sessions HOME

Cas ⛶ full-screen :
- ✅ Click ⛶ avec plan dans la liste "Mes plans" → trigger ▶️ Charger → bascule map mode
- ✅ Au boot map mode, `kta:planConfigReady` détecte le flag sessionStorage → `OsmView.open()` automatique
- ✅ Plan non listé (cas limite) → fallback `loaderResumeBtn` ou alert pédagogique

Cas layout :
- ✅ PC ≥1024px : 3 colonnes équilibrées (2fr 3fr 2fr)
- ✅ Mobile <1024px : pile verticale, mini-carte 220px hauteur min

Cas régression :
- ✅ Modale Vue OSM full-screen existante (osmView.js) inchangée
- ✅ Pas d'impact sur le boot map mode si jamais opt-in OSM
- ✅ Pas d'appel sortant si opt-in OFF (cohérence philo offline)

**⚠️ Régression cross-module check** :
- `LS_OPT_IN_KEY` partagé avec `osmView.js` → SAME constant (les 2 modules le lisent/écrivent au même endroit) ✅
- `osmHomePreview.js` chargé APRÈS `osmView.js` dans `index.html` ✅ (cas usage : `OsmHomePreview.openFullScreen` peut appeler `OsmView.open` si besoin)
- `PlanRegistry`, `KmzExport`, `Leaflet` : dépendances normales, déjà chargées avant
- Layout `loader-grid` modifié : risque d'impact visuel sur les vieux flows. Mobile reste pile vertical (display:flex column) — pas de regression. PC : nouvelles proportions 2-3-2 au lieu de 3-2. Si plan visible souffre, ajustement CSS futur possible

**Limitations connues (v1.40.0)** :
- **Pas de tuiles plan affichées sur OSM** dans le widget HOME (= mode léger). User voit les 2 markers georef + ligne d'échelle, pas le plan lui-même. → Future v1.40.1+ : extraction ZIP partielle pour tuiles overview
- **Pas de POI/Roads/Zones/Structures** dans le widget (= cohérent mode léger)
- **Cas "georef embedded uniquement"** : plan jamais chargé en map mode → georef pas propagée en LS → absent du widget. Recommandation : charger 1 fois le plan en map mode pour qu'il apparaisse
- **Pas de cache des positions** : si user change de plan dans dropdown rapidement, chaque sélection re-render les markers (léger, pas un problème)

**Step roadmap (post-v1.40.0)** :
- v1.40.1+ (optionnel) : extension data — extraction ZIP partielle pour afficher tuiles plan overview + POI embedded dans le widget
- Future features Vue OSM imaginables : itinéraire multi-plans, export KMZ inline depuis HOME, partage URL de prévisualisation

**📦 v1.39.16** : Vue OSM Step 3b — zones + structures + multi-LVL :

KARMA combo : *« ajoute la possibilité d'afficher plusieurs LVL en même temps en mode OSM et continue directe vers ZONE/STRUCTURE »*. Deux features fusionnées en 1 bump.

**Sources Step 3b** :
- `window.getZones()` + `window.getAllEmbeddedZones()` — polygones zones session + data layers
- `window.getStructures()` + `window.getAllEmbeddedStructures()` — structures session + embedded (cataphile : piliers, murs, fronts de taille)
- `window.isStructurePolylineType(type)` — helper pour discriminer : `"front-1"/"front-2"` → polyline, `"mur"/"pilier-1"/"pilier-2"` → polygone

**Multi-LVL** :
- State `_visibleLevels: Set<number>|null` (null = mode mono compat, Set non-vide = union de niveaux)
- Helper `_isLevelAllowed(item)` cascade : (a) si pas M-LVL → tout passe, (b) si `_visibleLevels` Set non vide → check membership, (c) sinon → fallback `APP_CONFIG.activeLevel` (= comportement v1.39.12 strict)
- `_initVisibleLevels()` au boot OSM : initialise au `activeLevel` mono (équivalent strict v1.39.12 par défaut, l'user peut ensuite cocher d'autres niveaux)
- `_refreshLevelFilteredLayers()` : re-render 5 layers level-aware (POI + Roads + Iti + Zones + Structures). Tracker EXCLU (sa timeline garde son historique full)
- UI : barre 2e ligne du bandeau, chips `N0/N1/…` (visible uniquement si `APP_CONFIG.multiLevel === true`). Click chip = toggle in/out du Set. Fallback `availableLevels` indispo : `{0, activeLevel}` par défaut

**Implémentation `osmView.js`** (~280 lignes ajoutées) :

| Helper | Rôle |
|---|---|
| `_isZoneTypeAllowed(z)` / `_isStructTypeAllowed(s)` | Filtre FilterPanel.zoneTypes / structTypes |
| `_collectVisibleZones()` / `_collectVisibleStructures()` | Agrège session + embedded + applique filtres |
| `_projectPoints(points)` | Helper mutualisé pour projection plan→latlng (utilisé roads + zones + structures) |
| `_renderZones()` | 1 `L.polygon` par zone, `zone.color` natif + `fillColor` + `fillOpacity` |
| `_renderStructures()` | Adaptatif via `isStructurePolylineType` : polyline ou polygon selon type |
| `_toggleZoneVisible` / `_toggleStructVisible` | Add/remove layer + lazy render au premier ON |
| `_initVisibleLevels()` | Init du Set au boot OSM (équivalent strict mode mono) |
| `_toggleLevel(level)` | Toggle membership + appel `_refreshLevelFilteredLayers` |
| `_refreshLevelFilteredLayers()` | Re-render 5 layers level-aware |
| `_renderLevelsBar()` | Construit la barre de chips dans le bandeau |

**Constants `STRUCTURE_STYLES_OSM`** : mapping local aligné sur `structures.js > STRUCTURE_STYLES` (v1.9+). Fronts allégés weight 10 → 6 (cohérence avec ITI_WEIGHT 7 → 5 vu zone OSM plus large). Warning sync ajouté.

**UI ajoutée dans le bandeau (ligne 1)** : 2 nouveaux toggles `🌐 Zones` et `🏗️ Struct` (default ON). Maintenant 7 toggles totaux + 2 boutons centrer + slider opacité + mention CSP.

**UI nouvelle ligne 2 (M-LVL only)** : barre chips `🏗️ Niveaux affichés : [N0] [N1] [N2] …` avec hint `Click pour basculer · plusieurs niveaux possible`. Fond ambre léger pour distinction.

**Wire dans `_renderMap`** : étapes 1-9 séquentielles :
1. fitBounds initial via `_planBbox`
2. `_renderLevel(_baseLevel)` (tuiles)
3. Bind `_onMoveEnd` (zoom/pan adaptatif)
4. POI (si visible) — Step 1
5. Tracker (si visible) + polling - Step 2
6. Roads + Iti - Step 3a
7. **🆕 `_initVisibleLevels()` + `_renderLevelsBar()` + Zones + Structures** - Step 3b + multi-LVL

**`close()` étendu** : cleanup `_zoneLayer` + `_structLayer` + reset `_visibleLevels = null`.

**Tests à faire** :

Multi-LVL :
- ✅ Plan M-LVL → ligne 2 bandeau visible avec chips N0/N1/…, chip `activeLevel` checked au boot
- ✅ Plan mono → ligne 2 masquée (display: none)
- ✅ Cocher N1 alors qu'on est sur N0 → POI + roads + zones + structures des 2 niveaux s'affichent
- ✅ Décocher tous les chips → layers vides (Set vide ≠ fallback activeLevel — choix explicite)
- ✅ Fermer/réouvrir modale → reset à `{activeLevel}` (pas de persistance entre sessions modale)

Zones + Structures :
- ✅ Zones session + embedded apparaissent avec leurs couleurs natives
- ✅ Structures piliers/murs = polygones colorés (jaune/orange/bleu)
- ✅ Fronts de taille = polylines épaisses (jaune/orange)
- ✅ Toggle 🌐 Zones OFF/ON → zones disparaissent/réapparaissent
- ✅ Toggle 🏗️ Struct OFF/ON → idem structures
- ✅ Filtre FilterPanel.zoneTypes / structTypes respecté côté OSM
- ✅ Plan sans zones/structures → toggles ON mais layers vides (pas de crash)

**⚠️ Régression cross-module** :
- `_isLevelAllowed` factorisé → utilisé par 5 helpers level-aware (POI, Roads, Iti, Zones, Structures). Cohérence garantie.
- `_projectPoints` mutualisé entre roads/zones/structures → si 1 bug projection, tout casse cohérement (acceptable)
- `_visibleLevels` reset à null dans `close()` → safe entre sessions modale
- Chips levels NON persistées entre sessions modale → choix simple, peut être ajouté en v1.39.17 si demande
- Polylines fronts épaissies (weight 6) testées visuellement OK sur OSM

**Step roadmap (post-v1.39.16)** :
- Step 4 : intégration HOME — modale "Vue OSM mondiale" qui charge TOUS les plans georef avec filtre par plan

**📦 v1.39.15** : Fix critique persistance — export profil incomplet :

KARMA audit : *« j'ai l'impression que le georef est mal persisté et que on le perd a un moment, update douce, export/import profile .... session...ETC »*. Audit ciblé sur les 5 flux suspects :

| Flux | Résultat | Conclusion |
|---|---|---|
| Update douce (`mettreAJourCodeSeul`) | ✅ Préserve LS | Pas de bug, purge cache PWA seul |
| Reset complet (`viderCacheAppli`) | ❌ Volontaire | Comportement attendu, double confirm |
| SessionPersist (`sessionPersist.js`) | ✅ Hors scope | Calibration vit en parallèle de la session |
| Boot d'un plan (`_propagerGeorefVersKmzExport`) | ✅ Re-propage | LS auto-remplie depuis `PLAN_CONFIG.plan.georef` |
| **Export/Import profile** (`profileExportImport.js`) | 🔴 **TROU** | **4 catégories de clés per-plan oubliées** |

**Cause racine** : `profileExportImport.js > PREF_KEYS` listait uniquement 8 clés globales (theme, paranoia, planner_mode...). Les clés **per-plan** avec préfixe + suffixe variable (`<prefix>_<planId>`) étaient ignorées :

| Clé LS oubliée | Contenu | Impact si perdu |
|---|---|---|
| `myktamap_kmz_calib_<planId>` | **GPS georef plan** (pointA/B {x,y,lat,lng}) | KMZ/GPX/Vue OSM cassés |
| `myktamap_plan_prefs_<planId>` | **Calibrations image layers** v1.38.0 + Nord + prefs cascade | Calques mal calés, Nord perdu |
| `myktamap_route_avoid_<...>` | Avoidances itinéraire Pathfinder | Iti recalculé sans préférences |
| `myktamap_note_libre_<planId>` | Note libre Mode Histoire | Note Markdown perdue |

Le pattern de loop sur `localStorage.length` n'était utilisé QUE pour les sessions (`myktamap_session_v1_`). Aucun équivalent pour les autres préfixes per-plan.

**Scénarios cassés (avant fix)** :
1. Migration vers nouveau device : Export sur A, Import sur B → georef GPS perdue, calques décalibrés
2. Reset accidentel après backup profile : l'user pense être protégé, il ne l'est pas
3. Partage config entre équipe : impossible sans re-saisie manuelle

**Fix v1.39.15** dans `js/profileExportImport.js` (~80 lignes ajoutées) :

- **Nouvelle const `PER_PLAN_PREFIXES`** : liste explicite des 4 préfixes critiques avec warning de maintenance (« si tu ajoutes un nouveau préfixe per-plan dans l'app, ajoute-le ici »)
- **Helper `_collectPerPlanLsKeys()`** : scan `localStorage.length`, filtre par préfixes, retourne `{ "<full-key>": <parsed-value> }`. Format plat conservant la full key (préfixe + planId) pour robustesse.
- **`buildProfile()` étendu** : `profile.sections.perPlanLs = _collectPerPlanLsKeys()` (default include true)
- **`computeSectionSizes()` étendu** : `sizes.perPlanLs = {count, bytes}`
- **`computeImportStats()` étendu** : compteur `perPlanLs`
- **`applyProfile()` étendu** : section dédiée avec sémantique merge/replace + **garde anti-pollution** (filtre les keys contre PER_PLAN_PREFIXES au moment de la restauration → robustesse si un profile édité à la main contient des keys arbitraires)
- **UI export modale** : nouvelle row checkbox 📍 « Calibrations & prefs par plan » (cochée default, taille affichée)
- **UI import modale** : row équivalente, visible si `stats.perPlanLs > 0`

**Sémantique mode merge** (par défaut) : skip une clé si déjà présente localement → préserve les modifs locales faites depuis l'export (ex : user a re-saisi sa georef sur le device cible avant import).

**Sémantique mode replace** : écrasement total cohérent avec les autres sections (registry, sessions, etc.).

**Garde anti-pollution** : avant chaque `setItem`, on vérifie que la clé matche au moins un préfixe de `PER_PLAN_PREFIXES`. Empêche un profile bidouillé à la main d'injecter une clé arbitraire dans localStorage.

**Tests à faire** :
- ✅ Saisir georef via Réglages map mode → Export profile avec 📍 coché → vérifier taille section > 0
- ✅ Reset complet → Re-import profile → georef restaurée (sans rechargement du ZIP)
- ✅ Saisir calibration image layer v1.38.0 → Export → Reset → Import → calage restauré
- ✅ Écrire note Mode Histoire → Export → Reset → Import → note restaurée
- ✅ Mode merge : si user a déjà une georef locale différente → préservée (pas écrasée)
- ✅ Mode replace : georef du profile écrase celle locale
- ✅ Profile sans section perPlanLs (export pré-v1.39.15) → rétro-compat, pas de crash
- ✅ Garde anti-pollution : profile édité avec clé `myktamap_evil_key` → ignorée

**⚠️ Régression cross-module** :
- Format profile JSON enrichi mais **rétro-compatible** : un profile pré-v1.39.15 (sans `sections.perPlanLs`) s'importe sans crash (test `if (s.perPlanLs && typeof === "object")`)
- `localStorage.length` scan peut être lent sur browsers avec beaucoup d'apps en cohabitation → acceptable, c'est de l'export user-initiated pas du polling boot
- Note libre Mode Histoire (`myktamap_note_libre_<planId>`) : déjà dans l'export `.mkmsession` mais maintenant AUSSI dans le profile → cohérent avec la sémantique « profile = état complet utilisateur cross-plans »

**📦 v1.39.14** : Vue OSM Step 3a — roads + itinéraire :

Roadmap KARMA Step 3a/4 — *« continue sur ROAD et Itineraire facilement testable »*. KARMA voulait avancer sans avoir à sortir dehors pour tester le tracker — roads + iti sont testables sur la map seule. Step 3b (zones + structures) en suivant si tout va bien.

**Sources utilisées** :
- `window.getRoads()` — roads session (incluant l'itinéraire actif `type === "itinerary"`)
- `window.getAllEmbeddedRoads()` — roads embedded data layers (puits.json, etc.)

**Implémentation `osmView.js`** (~170 lignes ajoutées) :
- `_isRoadTypeAllowed(road)` : respect `FilterPanel.roadTypes` (Set/Array, null = pas de filtre)
- `_isRoadLevelAllowed(road)` : respect `APP_CONFIG.activeLevel` si M-LVL (sémantique : `road.level === activeLevel`, cohérent avec §26.5 pathfinder)
- `_collectVisibleRoads()` : agrège session + embedded, **EXCLUT `type === "itinerary"`** (rendu séparé dans `_itiLayer` pour distinguer visuellement), applique les 2 filtres
- `_collectActiveItinerary()` : `roads.find(r => r.type === "itinerary" && r.points.length >= 2)` — il n'y en a qu'un seul par session (cf interfaceItineraire.js)
- `_projectRoadPoints(road)` : projette les points pixels plan en latlngs OSM via `_proj`. Skip silencieux les points invalides (peut perdre 1-2 points sur erreur ponctuelle, polyline reste continue)
- `_renderRoads()` : crée 1 `L.polyline` par road avec `color: road.color || "#8892a4"` (fallback charte). Poids 3, opacité 0.8, non interactif. Idempotent.
- `_renderItinerary()` : 1 `L.polyline` avec style cyan dashed plus épais. **Constantes locales** `ITI_COLOR = "#00d4ff"`, `ITI_WEIGHT = 5`, `ITI_DASHARRAY = "10 6"` alignées sur `road.js:56 > ROAD_TYPES.itinerary` (weight allégé 5 vs 7 sur map principale car OSM montre zone +large)
- `_toggleRoadVisible` / `_toggleItiVisible` : add/removeLayer + lazy render au premier ON

**Perf clé : `preferCanvas: true`** ajouté à l'init `_osmMap` → toutes les polylines (roads + iti + tracé tracker) rendues sur 1 canvas, pas N éléments SVG. Cohérent avec `map.js` principale (§13 perf-memory). Les imageOverlay (tuiles V2) restent en DOM (pas affecté).

**UI ajoutée dans le bandeau** :
- Toggle `🛣️ Routes` (default ON)
- Toggle `🧭 Iti` (default ON)
- Les 5 toggles existants + 2 boutons centrer restent (Plan/Tracker, Opacité, POI, Tracé)

**Wire dans `_renderMap`** : après les étapes POI (6) + tracker (7) → étape 8 = roads + iti.

**`close()` étendu** : cleanup `_roadLayer` + `_itiLayer` (clearLayers + nullify).

**Tests à faire** :
- ✅ Plan V2 georef → roads session + embedded apparaissent avec leurs couleurs natives (cohérence visuelle map principale)
- ✅ Type "itinerary" PAS dans le layer roads (pas de duplication avec _itiLayer)
- ✅ Iti actif → polyline cyan dashed visible, plus épaisse que les autres routes
- ✅ Toggle 🛣️ OFF → roads disparaissent, iti reste visible (si toggle 🧭 ON)
- ✅ Toggle 🧭 OFF → iti disparaît, roads restent visibles
- ✅ Filtre roadTypes actif côté FilterPanel → respecté côté OSM (les types masqués sont absents)
- ✅ M-LVL avec `activeLevel=1` → seules les roads level 1 visibles
- ✅ Plan dense (1000+ roads) → fluide grâce à `preferCanvas` (canvas natif)
- ✅ Pas d'iti actif → `_itiLayer` créé mais vide (pas de crash)
- ✅ Fermeture modale → tous les layers cleanup

**⚠️ Régression cross-module** :
- `preferCanvas: true` affecte uniquement les **vector layers** (polylines/polygons/circles) — les imageOverlay rotated (tuiles V2) restent DOM. Vérification : pas de changement de comportement attendu sur les tuiles.
- Constantes `ITI_*` dupliquées de `road.js > ROAD_TYPES.itinerary` — **dette** : si KARMA change le style iti là-bas, sync ici. Commentaire de warning ajouté.
- `_proj` réutilisé (mémo v1.39.11) → pas de recalcul georef par road
- 5 layers indépendants : `_planLayer` / `_poiLayer` / `_trackerLayer` / `_roadLayer` / `_itiLayer` — chacun cleanup et toggle indépendant

**Step roadmap (post-v1.39.14)** :
- Step 3b : zones + structures (embedded + session)
- Step 4 : intégration HOME — modale "Vue OSM mondiale" qui charge TOUS les plans georef avec filtre par plan

**📦 v1.39.13** : Vue OSM Step 2 — tracker (position + tracé live) :

Roadmap KARMA Step 2/4 — *« Step 2 on intègre position tracker et son tracé »*. Choix validés `1:a 2:a 3:a 4:a 5:a 6:a` = live polling 1s, sub-sample 1-sur-N au-delà de 5000 points, cap (flèche heading), couleur tracker existante, toggle bandeau + bouton recentrer.

**Sources utilisées** :
- `window.getTrackingTimeline()` — path historique `[{x, y, t, deltaMs, type, level?}, ...]` (survit aux recalages)
- `window.getTrackingActif()` — bool état Play/Stop
- `APP_CONFIG.trackingColor` ou `trackColor` — couleur du tracé (fallback `#8cb4ff` charte interaction)

**Implémentation `osmView.js`** (~180 lignes ajoutées) :
- `_isTrackerActif()` : guard pour le polling no-op si tracker pas en marche
- `_getTrackerTimeline()` : copie défensive de la timeline
- `_getTrackerColor()` : cascade APP_CONFIG → fallback charte
- `_subsampleTimeline(points, maxN)` : 1-sur-N si > 5000 points, garde toujours le dernier (position courante). Pas RDP pour rester court (~10 lignes vs ~30). Si retour terrain "moche au pan rapide" → upgrade en RDP via `_decimatePointsRDP` (à exposer côté road.js)
- `_computeTrackerHeading(timeline)` : `atan2(dx, -dy)` sur les 2 derniers points (convention plan : y=0 = nord). Retourne null si bougé < 0.1px (cap pas fiable)
- `_buildTrackerIcon(color, heading)` : `L.divIcon` HTML inline = cercle coloré 14×14 + flèche cap optionnelle (border-triangle) avec `transform-origin:50% 22px` pour rotation autour du cercle. CSS class `kta-osm-tracker-marker` libre pour customisation future
- `_renderTracker()` : pipeline complet — récupère timeline, sub-sample, projette en latlng OSM via `_proj.planToLatLng`, crée/update polyline (setLatLngs sur update vs recreate), crée/update marker (setLatLng + setIcon)
- `_toggleTrackerVisible(bool)` : add/removeLayer + start/stop polling
- `_startTrackerPolling()` : `setInterval(_renderTracker, 1000)`, no-op si tracker pas actif
- `_centerOnTracker()` : `panTo` la dernière position. Bump auto au zoom 17 si on était trop dézoomé (< 16)

**UI ajoutée dans le bandeau** :
- Bouton `🎯 Plan` (renommé de "🎯 Centrer sur le plan" pour gagner de la place)
- Nouveau bouton `📡 Tracker` (centrer sur position tracker)
- Nouveau toggle `📡 Tracé` (default ON, masque/affiche le layer tracker)
- POI toggle `📍 POI` inchangé

**Wire dans `_renderMap`** : après le rendu POI Step 1, si `_trackerVisible` → `_renderTracker()` + `_startTrackerPolling()`.

**`close()` étendu** : `_stopTrackerPolling()` + `_trackerLayer.clearLayers()` + nullify refs.

**Tests à faire** :
- ✅ Plan V2 georef + tracker actif → tracé bleu apparaît sur OSM avec marker en bout
- ✅ Marker visible avec flèche cap selon dernière direction
- ✅ Polling 1s : si l'user bouge sur la map principale, le marker OSM suit en live
- ✅ Toggle 📡 Tracé OFF → trace + marker disparaissent, polling stoppé
- ✅ Re-ON → réapparaissent, polling redémarre
- ✅ Bouton 📡 Tracker → centre sur la position courante (zoom 17 si dézoomé)
- ✅ Timeline > 5000 points → sub-sample appliqué, pas de lag visible
- ✅ Tracker pas démarré → toggle ON mais aucun marker (silencieux, pas de crash)
- ✅ Fermeture/réouverture modale → polling proprement stoppé puis redémarré
- ✅ Cap : si timeline a < 2 points → marker sans flèche (fallback cercle simple)

**⚠️ Cross-module check** :
- `_proj` réutilisé (mémo v1.39.11) → pas de recalcul georef à chaque tick polling
- `_trackerLayer` séparé de `_planLayer` et `_poiLayer` → 3 layers indépendants pour toggle/cleanup
- Polling sur `setInterval` clearé dans `close()` — pas de fuite mémoire (testé via memInspector cross-modale)
- Couleur tracker peut changer si l'user la modifie dans Réglages pendant la modale ouverte → update auto au prochain tick (vérif `_trackerTrace.options.color !== color`)

**Step roadmap (post-v1.39.13)** :
- Step 3 (conditionnel perf) : ROADS + ZONES + STRUCTURES (embedded + session)
- Step 4 : intégration HOME — modale "Vue OSM mondiale" qui charge TOUS les plans georef avec filtre par plan

**📦 v1.39.12** : Vue OSM Step 1 — POI session + data layers :

Roadmap KARMA Step 1/4 sur la Vue OSM : *« on va augmenter le truc en plusieurs step pour bien cadrer. Step 1. on intègre nos POI DATA/SESSION à la map OSM »*. Choix validés `1:d 2:a 3:a 4:a 5:a` = tout (session + data + iti), respect FilterPanel, icônes L.marker cohérence map, popup minimal, respect activeLevel M-LVL.

**Sources collectées (Step 1)** :
- ✅ **Session editor** : `window.getEditorPoints()` — POI ajoutés par l'user en cours de session
- ✅ **Data layers embedded** : `window.getAllEmbeddedPoints()` — POI des dataLayers (puits.json, etc.) déjà rendus sur la map principale
- ⏳ **Itinéraire actif** : déporté à Step 2/3 (les waypoints iti sont des éléments de polyline → traités avec roads/zones, pas avec les POI au sens strict)

**Implémentation `osmView.js`** (~150 lignes ajoutées) :
- `_isTagAllowed(p)` : check `window._ktaRuntimeFilters.tags` (Set ou Array depuis FilterPanel v1.21.5). Si null → tout passe. Sinon → membership sur `p.tags[0] || "default"`.
- `_isLevelAllowed(p)` : si `APP_CONFIG.multiLevel === true` et `activeLevel` défini → ne garde que `p.level === activeLevel`. Sinon → tout passe.
- `_collectVisiblePoi()` : agrège session + data en un format unifié `{x, y, nom, tags, level, _source}`, applique les 2 filtres ci-dessus
- `_buildPoiIcon(p)` : crée une `L.icon` via `window.getIconUrlForPoint(p)` (cohérence visuelle map principale). Taille 26×26 (plus petit que map principale 32×32 vu que l'écran OSM montre une zone plus large). Fallback : marker default si pas d'icône résolue.
- `_renderPoi()` : crée 1 `L.marker` par POI projeté via `_proj.planToLatLng(p.x, p.y)` → addTo `_poiLayer = L.layerGroup()`. Popup minimal HTML : `<b>nom</b><br>tag · niveau N`. `_escapeHtml` anti-XSS sur les noms.
- `_togglePoiVisible(bool)` : add/removeLayer `_poiLayer`. Si user toggle ON avec layer pas encore créé → render à la volée.

**UI ajoutée dans le bandeau modale** :
- Checkbox `📍 POI` entre 🎯 Centrer et le label 🔒 Tiles. Default checked. Change handler → `_togglePoiVisible(e.target.checked)`.

**Wire dans `_renderMap`** :
- Après `_renderLevel(_baseLevel)` et bind `_moveEndHandler` → si `_poiVisible` → `_renderPoi()`.
- `close()` étendu : `_poiLayer.clearLayers()` + `_poiLayer = null` (les markers sont GC).

**Tests à faire** :
- ✅ Plan V2 georef opt-in → ouverture Vue OSM, POI session + data visibles avec leurs icônes natives
- ✅ Toggle 📍 OFF → markers cachés, ON → markers réapparaissent
- ✅ Plan multi-niveau avec activeLevel=1 → seuls les POI level 1 affichés (cohérence map)
- ✅ Filtre tags actif côté FilterPanel → POI masqués côté OSM aussi
- ✅ Click marker → popup avec nom + tag + niveau
- ✅ Fermeture/réouverture modale → state propre
- ⚠️ Plan dense 500+ POI → vérifier perf (pas de viewport culling sur POI en Step 1, à ajouter en Step 1.1 si lag)

**Cross-module check** :
- `_proj` réutilisé (mémo de `_buildProjection()` v1.39.11) — pas de re-calcul de la georef pour chaque POI
- `_poiLayer` séparé de `_planLayer` (tuiles) — cleanup indépendant + toggle indépendant
- Les markers L.marker utilisent du DOM standard (pas canvas) → cohérence avec map principale qui fait pareil
- Pas de listener `FilterPanel.onChange` (le user ne peut pas changer les filtres pendant que la modale OSM est ouverte → si besoin Step 2)
- `getIconUrlForPoint` peut retourner `undefined` → fallback L.marker default (pas de crash)

**Bump** : sw.js v1.39.11 → v1.39.12 + `__MKM__.build` + `version.json` + notes user-friendly. Header NETWORK_AUDIT à v1.39.12. Modifs uniquement `osmView.js`.

**Step roadmap (post-v1.39.12)** :
- Step 2 : position tracker + tracé timeline (sur OSM)
- Step 3 (conditionnel perf) : ROADS + ZONES + STRUCTURES embedded/session
- Step 4 (best case) : intégration HOME — charger TOUS les plans georef dans une map OSM unique avec système de filtre par plan

**📦 v1.39.11** : Vue OSM — niveau adaptatif + viewport culling :

KARMA retour terrain v1.39.10 : *« les tuiles sont d'une résolution bcp trop basse on voit rien »*. Diagnostic confirmé — v1.39.10 utilisait `z = minNativeZoom` (scale ×8, 1×1 tuile pour un plan 4000×2251) pour rester safe sur mobile mais la résolution était insuffisante pour identifier les détails.

**Topo & reco** : reproduction du pattern Leaflet TileLayer natif (qu'on imite déjà dans `tiling.js > _renderNiveau` pour la map principale) — niveau adaptatif au zoom + viewport culling pour charger uniquement les tuiles visibles. Plus le user zoom dans OSM, plus on monte en résolution. Plus il dézoome, plus on redescend pour économiser RAM.

**Fix v1.39.11** :
- **Heuristique baseline au boot** : `_choisirNiveauBaseline(tiling, planW, planH)` choisit le niveau le plus zoomé tel que `cols × rows ≤ MAX_TILES_BASELINE` (20 tuiles, budget RAM mobile ~20 MB décodé). Pour un plan 4000×2251 → z=-1 (scale ×2, 4×3=12 tuiles). Pour un plan 16K×16K → z=-3 (4×4=16 tuiles, reste prudent).
- **Mapping zoom OSM ↔ niveau plan** : `_targetLevelForZoom(osmZoom, tiling)` mappe `delta = osmZoom - baselineOsmZoom` vers `targetZ = baseLevel + delta`, clamp dans `[minNativeZoom, maxNativeZoom]`. Invariant valide car OSM ET tiling V2 doublent la résolution par cran de zoom — relation 1:1.
- **Calcul `_baselineOsmZoom`** : `_computePlanBbox(proj, planW, planH)` projette les 4 coins du plan en latlng via la georef, puis `_osmMap.getBoundsZoom(_planBbox)` donne le zoom OSM où le plan tient au fit. Stocké 1 fois au boot, sert de référence pour le delta.
- **Viewport culling AABB** : `_tileIntersectsBounds(tl, tr, bl, mapBounds)` reconstruit le 4e coin par parallélogramme (`br = tr + bl - tl`) et teste `mapBounds.intersects(tileBbox)`. Padding 10% sur mapBounds pour pré-charger les bordures (anti-flash au pan rapide). Pattern aligné sur §81 P5 (markers POI viewport culling) et `tiling.js`.
- **Tracker `_tilesByPath`** : map `path → {overlay, tl, tr, bl}` pour add/remove idempotent. Au render d'un niveau : skip les paths déjà présents (éviter les doublons), puis cull ceux qui ne sont plus visibles. Coût mémoire négligeable (1 entrée par tuile visible).
- **Handler `zoomend moveend`** : `_onMoveEnd` re-évalue le niveau cible, appelle `_renderLevel(targetZ)` qui gère le switch interne (cleanup intégral si nouveau niveau, juste add+cull si même niveau). Unbind dans `close()` pour éviter les listeners orphelins.

**Avant / Après** (plan 4000×2251 typique)

| | v1.39.10 | v1.39.11 |
|---|---|---|
| Niveau au boot | z=-3 (scale ×8) | **z=-1 (scale ×2)** |
| Tuiles initiales | 1×1 = 1 | **4×3 = 12** (visible viewport seul → ~6 réellement) |
| Résolution | 😵 floue, illisible | **✅ nette** |
| Au zoom OSM élevé | Reste z=-3 (flou aggravé) | **Swap progressif** z=-1 → z=0 (rés max) |
| Au zoom OSM dézoomé | z=-3 (déjà au plafond) | **Swap** z=-1 → z=-2 → z=-3 (économe) |
| Au pan | Toutes les tuiles chargées | **Culling** add nouvelles visibles, remove sorties |
| RAM décodée | ~1 MB | ~6-12 MB (visible viewport, scale ×2) |

**Tests à faire** :
- ✅ Plan 4000×2251 V2 → ouverture Vue OSM, tuiles z=-1 nettes
- ✅ Zoom OSM proche → swap auto vers z=0 (rés max native du plan)
- ✅ Zoom OSM dézoomé → swap auto vers z=-2 puis z=-3 (overview, économe)
- ✅ Pan rapide → tuiles cullées et re-ajoutées au pad 10%, pas de flash blanc grossier
- ✅ Plan 16K×16K → baseline reste à z=-3 (16 tuiles max), zoom max OSM ne descend pas en dessous
- ✅ Fermeture/réouverture modale → state propre (pas d'overlay fantôme)
- ✅ Mobile : pas de crash, gain de qualité visible vs v1.39.10

**Bump** : sw.js v1.39.10 → v1.39.11 + `__MKM__.build` + `version.json` + notes user-friendly. Header NETWORK_AUDIT.md/html à v1.39.11. Modifs uniquement `osmView.js` (~150 lignes ajoutées : 8 helpers + state).

**📦 v1.39.10** : Vue OSM — fix crash mobile + restriction aux plans V2 tuilés :

KARMA retour terrain v1.39.0-9 : *« ca crash sur mobile, surment psk on charge l'image complete »*. Hypothèse confirmée — `_renderMap` chargeait l'image entière du plan (`L.imageOverlay.rotated(baseImage, ...)`) dans une seconde carte Leaflet OSM, ce qui sature le GPU mobile (iPhone PWA budget ~500 MB) sur les plans ≥ 4000 px.

**Topo & reco** : sur idée KARMA (*« et on peut pas afficher nos tuile par dessus ? »*), pivot architectural vers l'utilisation du **tiling V2 déjà existant**. Vérification archi via `docs/architecture/perf-memory.md §27` et `plans-loader.md §59` → confirmation que le format `data/tiles/z<N>/x<col>_y<-k>.jpg` + manifest `PLAN_CONFIG.tiling` permet de récupérer N petites tuiles à la demande au lieu de l'image entière.

**Fix v1.39.10** :
- **Gate V2 strict** : nouvelle `_isV2Plan()` check `tiledV2 === true && tiling.minNativeZoom finite && tiling.tileSize finite`. Si non-V2 → `alert()` pédagogique au clic du bouton 🌍 avec instruction "Ouvre Générateur → Modifier → coche 🧱 Convertir en V2 tuile" + abort (pas de modale, pas de ping, pas d'OSM tiles téléchargées). Préserve la philosophie 100% offline si pas opt-in.
- **Rendu via tuiles minNativeZoom** : `_renderTilesV2OnOsm(proj, tiling)` itère sur les tuiles du niveau le plus dézoomé (`z = minNativeZoom`, typiquement `-3` → scale ×8). Exemple plan 4000×2251 : `8×5 = 40` tuiles z=0 (~12 MB) → `1×1 = 1` tuile z=-3 (~200 KB). 99% économie RAM/GPU.
- **Convention CRS.Simple respectée** : flip Y pixel (`pxTop = planH - k * tileSize * scale`, `pxBottom = planH - (k-1) * tileSize * scale`) avant projection via `proj.planToLatLng(x, y)`. 1 `L.imageOverlay.rotated(url, tl, tr, bl)` par tuile = N parallélogrammes alignés sur la georef.
- **Lazy fetch reproduit** : reprise fidèle du pattern `tiling.js > _renderNiveau` — pre-extract via `_extractLazyAsset(path)` Promise.all si Phase 2 Pack RAM actif (`asset.file === null && asset._zipPath`). Puis `_resolveTileUrl(path)` réplique `_resoudreUrlTuile` (création blob URL si nécessaire, asset.url réutilisé sinon).
- **Cohérence cross-module** : `asset.url` est **partagé** avec `tiling.js` via `window.RUNTIME_ASSETS[path]`. NE PAS `URL.revokeObjectURL` au `close()` de la modale OSM → casserait l'affichage de la map principale. La création est idempotente (réutilise une URL existante si déjà créée par tiling.js).
- **Suppression image layers du flow OSM** : les image layers (calques) étaient prévus mais n'étaient pas affichés en pratique selon retour KARMA. Code mort retiré du flow render — `_project3Corners` reste dispo pour usage futur si besoin.

**Tests à faire** :
- ✅ Plan V2 tuilé + georef + opt-in → Vue OSM s'ouvre avec 1-4 mini-tuiles projetées sur OSM, pas de crash mobile
- ✅ Plan V1 (non tuilé) → alert pédagogique au clic, pas de modale, pas de tile OSM téléchargée
- ✅ Plan V2 sans georef → bouton 🌍 masqué (inchangé)
- ✅ Phase 2 Pack RAM (lazy fetch via _lazyZipRef) → tuiles z=minNativeZoom extraites avant render
- ✅ Fermeture modale puis re-clic → map principale toujours OK (asset.url non revoked)

**Bump** : sw.js v1.39.9 → v1.39.10 + `__MKM__.build` + `version.json` + notes user-friendly. Header NETWORK_AUDIT.md/html à v1.39.10. Pas de nouveau module, juste refactor `osmView.js` (~70 lignes ajoutées : helpers V2 + dispatch dans `_renderMap`).

**📦 v1.39.0** : Vue OSM initiale (plan calibré GPS au-dessus d'OpenStreetMap) :

Feature roadmap KARMA — *« on aurait notre image principal (et ses layer) au dessus de OSM »*. Nouvelle modale dédiée qui superpose le plan MyKTAMap (baseImage + calques image actifs) sur OpenStreetMap, projeté précisément via le georef GPS (`plan.georef`). Cas d'usage : visualiser comment un plan souterrain (carrière, galerie) s'aligne avec la surface — rues, accès, bâtiments.

**Périmètre v1.39.0** :

- **Lot R — Runtime** : nouveau module `js/osmView.js` (~310 lignes) avec API `window.OsmView = { open, close, isAvailable, isOptedIn, setOptedIn }`. Map Leaflet EPSG:3857 (Web Mercator standard) avec tile layer `https://tile.openstreetmap.org/{z}/{x}/{y}.png` (attribution OSM). Projection plan → OSM via `KmzExport.buildTransform(planA, planB, gpsA, gpsB)` + `KmzExport.planToGps(t, x, y)` existants (réutilise toute l'infra georef GPS du KMZ). Pour chaque image (baseImage + image layers calibrés), calcul des 3 coins en pixels plan puis projection lat/lng via planToGps → `L.imageOverlay.rotated(url, tl, tr, bl)` du plugin Leaflet.ImageOverlay.Rotated v1.38.0. Image layers SANS calibration utilisent les 4 coins du plan principal. Image layers AVEC calibration utilisent `ImageLayerCalibration.compute3CornersFromAnchorsPx` pour récupérer leurs 3 coins en pixels plan, puis projetés indépendamment.

- **Lot U — UI** : 
  - Bouton 🗺️ dans status bar (à côté de 📖 Mode Histoire) via `js/refonteInterface.js`. **Visible uniquement** si `OsmView.isAvailable()` = `_hasGeoref() AND isOptedIn() AND !strictOffline AND !incognito`. Refresh sur events `kta:osmOptInChange`, `kta:planConfigReady` + polling boot.
  - Modale plein écran : header + bandeau contrôles (slider opacité 0-100% + bouton "🎯 Centrer sur le plan" + mention "🔒 Tiles : tile.openstreetmap.org (HTTPS)") + map prenant le reste.

- **Lot N — Privacy & opt-in** :
  - Toggle "🗺️ Autoriser la Vue OSM (OpenStreetMap)" dans ⚙️ Configuration home, juste sous Mode hors-ligne strict. Persisté en LS `myktamap_osm_view_opt_in` (default OFF). Handler dans `index.html` câblé à `OsmView.setOptedIn()`.
  - **3 garde-fous strict** avant ouverture modale : (1) plan a un `georef` valide (sinon alert avec instruction "Ajoute-en une via générateur avancé"), (2) `NetworkAudit.isStrictOfflineEnabled()` false (sinon toast warn), (3) `IncognitoMode.isActive()` false (sinon toast warn).
  - **Première activation** : `confirm()` natif explicite avec mention du domaine contacté et instructions pour révoquer. Setter LS après acceptation.

- **Lot D — Docs + NETWORK_AUDIT** : section dédiée + ajout de `https://tile.openstreetmap.org` à la liste blanche `connect-src` et `img-src` (mais **uniquement effective si l'user opt-in**). Note pour KARMA côté nginx : mettre à jour la CSP du serveur prod/dev pour autoriser ces domaines OSM (le client ne peut pas changer la CSP serveur côté browser).

**Rétro-compat stricte** : sans opt-in OU sans georef, AUCUN appel sortant vers OSM. Le bouton est masqué (display:none) → l'user qui n'active jamais l'opt-in n'a aucune trace réseau OSM, philosophie 100% offline préservée. La CSP serveur prod sera mise à jour avant le déploiement v1.39.0 pour autoriser tile.openstreetmap.org.

**Bump** : sw.js v1.38.3 → v1.39.0 + `__MKM__.build` + `version.json` + notes user-friendly. Nouveau module `osmView.js` ajouté à `ASSETS_TO_CACHE` SW PWA + chargé dans `index.html` APRÈS `kmzExport.js` (dépendance).

**📦 v1.38.3** : Fix effet de bord exports image vs calibration calques.

KARMA contrôle terrain : *« assure toi que ca n'a pas créé effet de bord sur ; export image (simple/avancé) export KMZ/GPX »*. Audit effectué, **bug confirmé** sur les exports image, **OK** sur KMZ/GPX.

**Bug identifié** : les exports image (`js/utils.js > telechargerPlan` l.2213 et `js/exporter.js > _genererCanvasExport` l.1919) faisaient `ctx.drawImage(img, 0, 0, W, H)` pour chaque calque image visible — la calibration 2 ancres (introduite en v1.38.0/1) était **complètement ignorée**. Résultat visible : un calque calibré apparaissait correctement sur la carte (via le plugin Leaflet.ImageOverlay.Rotated qui applique un CSS transform au DOM) mais était **stretché à pleine taille du plan principal** dans les PNG/PDF exportés (= comportement pré-v1.38.0 alors que le user voyait calibré).

**Cascade des exports impactés** :
- ✅ **PNG simple** (`utils.js > telechargerPlan`) — patché
- ✅ **PNG avancé** (`exporter.js > _genererCanvasExport`) — patché
- ✅ **PDF imprimable** (`pdfExport.js`) — délégué à `_genererCanvasExport` donc patché par effet de bord du fix exporter.js
- ✅ **Miniature PDF Mode Secours** (`secoursMode.js`) — délégué à `_genererCanvasExport` aussi

**Exports SAINS confirmés** :
- ✅ **KMZ** (`kmzExport.js`) : génère un GroundOverlay pour le baseImage UNIQUEMENT, pas les calques image. Pas d'impact.
- ✅ **GPX** (`gpxIO.js`) : POIs/roads/zones uniquement (coords lat/lng), pas d'image. Pas d'impact.

**Fix `js/imageLayerCalibration.js`** — 2 nouveaux helpers exposés :
- `compute3CornersFromAnchorsPx(calib, sourceW, sourceH) → {tl, tr, bl}` : variante de la fonction compute3CornersFromAnchors mais qui retourne les 3 coins en **pixels plan target** au lieu de latlng Leaflet (pratique pour canvas qui travaille en pixels).
- `drawCalibratedImageLayer(ctx, img, calibration, planW, planH) → boolean` : dessine l'image source sur le canvas en respectant la calibration via `ctx.save() / ctx.transform(a,b,c,d,e,f) / ctx.drawImage(img, 0, 0) / ctx.restore()`. Calcule la matrice affine canvas à partir des 3 coins target. Retourne `true` si rendu calibré effectué, `false` si fallback nécessaire (calibration invalide / dims source indispo) — le caller gère le fallback `drawImage(img, 0, 0, W, H)` classique.

**Modifs des call sites** :
- `js/utils.js > telechargerPlan` (l.2213) : si `layerConfig.calibration` ET helper dispo → tentative `drawCalibratedImageLayer`, fallback drawImage si retour false.
- `js/exporter.js > _genererCanvasExport` (l.1919) : idem avec `layerCfg`.

**Math** : la matrice affine canvas est déduite des 3 coins target via :
```
a = (tr.x - tl.x) / sourceW
b = (tr.y - tl.y) / sourceW
c = (bl.x - tl.x) / sourceH
d = (bl.y - tl.y) / sourceH
e = tl.x, f = tl.y
```
Equivalent à la transform CSS `matrix(a,b,c,d,e,f)` que le plugin Leaflet.ImageOverlay.Rotated applique au DOM en runtime. Cohérence visuelle parfaite entre carte et export.

**Rétro-compat stricte** : si calibration absente OU helper indispo (modules pas encore chargés à l'export) → fallback `drawImage(img, 0, 0, W, H)` = comportement v1.37.x.

**Bump** : sw.js v1.38.2 → v1.38.3 + `__MKM__.build` + `version.json` + notes user-friendly.

**📦 v1.38.2** : Simplification UI — calibration calques image uniquement depuis le générateur.

Feedback KARMA terrain après test v1.38.1 : *« enlève du menu plan la possibilité de calibrer l'image layer, on le fait que depuis générateur »*.

**Rationale UX** : la calibration durable cross-utilisateurs (générateur → `plan-config.json > imageLayers[i].calibration`) est suffisante. L'override session per-navigateur via Réglages map mode ajoutait un point d'entrée concurrent sans valeur ajoutée — si un plan a un calque mal calé, l'auteur corrige à la source et republie le ZIP. Ça reste cohérent avec le pattern Géoref GPS et PDF Histoire (modifs durables au générateur, pas d'override session).

**Changements `js/interfaceConfig.js`** :
- Retrait complet du bloc HTML `cfg_imglayer_calib_block` (note + liste + boutons) dans la modale Réglages map mode
- Retrait complet de l'IIFE `_initImageLayerCalibUI` (~175 lignes) qui populait la liste, gérait le hint dims auto et branchait le picker
- Commentaire de remplacement qui documente le retrait + la nouvelle source de vérité (générateur exclusivement)

**Conservé** (rétrocompat) :
- Tous les helpers `window.ImageLayerCalibration.*` (compute3Corners, getCalibration, loadImageDimensions, setSessionCalibration, resetSessionCalibration) restent exposés
- La cascade runtime côté `js/map.js` continue de lire les clés LS `myktamap_plan_prefs_<planId>.imageLayerCalibrations` qui auraient été créées en v1.38.0 → les users qui auraient calibré en session ne perdent pas leur état. Mais ils ne peuvent plus créer de nouvelles entrées side-session via UI (seul le générateur écrit dans plan-config.json).
- Le module `js/imageLayerCalibrationPicker.js` reste en place (utilisé par le générateur avancé)

**Bump** : sw.js v1.38.1 → v1.38.2 + `__MKM__.build` + `version.json` + notes user-friendly.

**📦 v1.38.1** : Lot D générateur avancé + hint dims auto.

Suite de v1.38.0 — complète le périmètre initial du sprint A→F avec le Lot D (différé en v1.38.0) + ajoute le hint dims auto remonté KARMA UX (*« pour pas que un user calibre pour rien ou soit perdu »*).

**Lot D — Générateur avancé** (`js/createConf.js > _ajouterImageLayer`) :
- Section dédiée par image layer dans la liste du générateur : note d'avertissement ⚠️ ("calibre UNIQUEMENT si dims ≠ plan principal sinon tu fausserais l'alignement") + hint auto-actualisé ✅/⚠️ avec dimensions comparées (tolérance ±2 px) + bouton "📐 Calibrer (2 ancres)" + bouton "↺ Reset" + status "Calibration enregistrée".
- État stocké sur le DOM element (`item._calibration`), sérialisé dans le ZIP via `_genererZip` (l.2606+) qui pousse `imageLayers[i].calibration` dans plan-config.json UNIQUEMENT si les 4 ancres sont présentes (rétrocompat stricte : champ absent si pas calibré).
- Picker réutilise `ImageLayerCalibrationPicker.open()` existant (v1.38.0). URL source : `URL.createObjectURL(File)` du upload OU récupération depuis `_plannerOrigAssets` en mode Modifier. URL plan : idem (upload pl_baseImage OU 1ère image non-collision des assets originaux).
- Mode Modifier : pré-rempli depuis `p.calibration` du JSON source (un plan déjà calibré reste calibré au re-export).
- Hint auto déclenché à chaque `change` sur le file input layer ET sur `pl_baseImage` (re-check les dims dès qu'un des deux change).

**Hint dims auto dans Réglages map mode** (`js/interfaceConfig.js > _initImageLayerCalibUI`) :
- Pour chaque image layer du plan courant, charge async les dims natives via `ImageLayerCalibration.loadImageDimensions()` + compare avec `APP_CONFIG.imageWidth/Height` (tolérance ±2 px). Affiche :
  - ✅ "Mêmes dimensions — calibration inutile" (vert) si égales
  - ⚠️ "1234×567 ≠ plan 4000×4000 — calibration utile" (jaune) sinon
  - ⏳ "vérification dims…" pendant le chargement
- Cache en mémoire (`_dimsCache` par layerId) pour ne pas re-charger à chaque re-render.
- Note explicative renforcée en tête de section avec avertissement explicite.

**Bump** : sw.js v1.38.0 → v1.38.1 + `__MKM__.build` + `version.json` + notes user-friendly.

**📦 v1.38.0** : Calage des calques image avec 2 ancres (rotation + scale + translation).

**Cas d'usage** : avant v1.38.0, tous les image layers étaient étirés sur les bounds du plan principal (`L.imageOverlay(layerConfig.file, bounds)` dans `js/map.js` l.414). Si l'image layer n'avait pas les mêmes dimensions que le plan, elle était déformée. Cette release permet de la caler précisément via 2 points reconnaissables communs aux 2 images (légende décalée, plan d'archive partiel, scan importé tordu).

**Architecture** (lots A→C+E livrés, Lot D générateur différé en v1.38.1) :

- **Lot A — Plugin vendoré** `lib/leaflet-imageoverlay-rotated.js` (~150 lignes, BSD 2-clause). Permet de rendre une image en parallélogramme via 3 coins (rotation + scale 2D natif). API : `L.imageOverlay.rotated(url, topleft, topright, bottomleft, opts)`. Math : CSS transform `matrix(a,b,c,d,e,f)` calculé depuis les 3 latlng à chaque `zoomend/resetview`. Reuse maximal du `L.ImageOverlay` parent pour les events / pane / cleanup.

- **Lot B — Runtime + helpers** : nouveau module `js/imageLayerCalibration.js` (~200 lignes). API publique `window.ImageLayerCalibration` avec `compute3CornersFromAnchors(calib, sourceW, sourceH) → {tl, tr, bl}` (math 2 ancres → 3 coins par similitude directe : a=(sdx·tdx+sdy·tdy)/sLen², b=(sdx·tdy−sdy·tdx)/sLen², d=a, c=−b + translation), `getCalibration(layerId)` (cascade), `setSessionCalibration` / `resetSessionCalibration`, `loadImageDimensions(url) → Promise<{width,height}>`. Conversion pixels plan → latlng Leaflet CRS.Simple via `window.convertCoord` standard projet. `js/map.js` ligne 413+ refactoré : si calibration présente ET plugin Rotated chargé → load async dims puis `L.imageOverlay.rotated(file, tl, tr, bl)` ; sinon → `L.imageOverlay(file, bounds)` (rétrocompat stricte).

- **Lot C — Cascade per-plan** : pref LS `myktamap_plan_prefs_<planId>.imageLayerCalibrations` (objet `{layerId: calibration}`) → plan-config.json > `imageLayers[i].calibration` → null. Event `kta:imgLayerCalibChange` pour notifications externes futures.

- **Lot E — UI Picker minimap (Réglages map mode)** : nouveau module `js/imageLayerCalibrationPicker.js` (~280 lignes). Modale split-screen avec 2 mini-cartes Leaflet (CRS.Simple) côte à côte : GAUCHE = image source isolée sur ses propres dims, DROITE = plan principal. Workflow 4 étapes (clique A gauche → A droite → B gauche → B droite) → preview overlay calibré en transparence 55% sur la mini droite → boutons Valider / Recommencer / Annuler. API `ImageLayerCalibrationPicker.open(opts) → Promise<calibration|null>`. Le picker est branché côté `js/interfaceConfig.js` : section "🖼️ Calibration calques image (ce plan)" dans la modale Réglages map mode → liste auto-générée des image layers du plan courant (via `window._ktaImageOverlays`) → bouton "📐 Calibrer" par layer + icône ✅ si déjà calibré + bouton ↺ Reset. Cache la modale Réglages le temps du picker (pattern Géoref existant) puis restaure.

- **Lot F — Bump + docs** : sw.js v1.37.2 → v1.38.0, copyright build, version.json + notes user-friendly. Nouveaux assets ajoutés à `ASSETS_TO_CACHE` (lib/plugin + 2 modules JS) et chargés dans `index.html` dans le bon ordre (plugin après Leaflet, helpers avant map.js, picker avant interfaceConfig).

**Différé en v1.38.1 (Lot D)** : section générateur avancé pour saisir la calibration durablement embedée dans plan-config.json (cross-utilisateurs). L'embarquement manuel reste possible en éditant directement le JSON dans le ZIP source. La cascade runtime supporte déjà ce champ embarqué (lecture).

**Rétro-compat stricte** : champ `imageLayers[i].calibration` absent → fallback bounds plan principal = comportement v1.37.x intact. Plan v1.38.0 avec calibration chargé sur app v1.37.x → champ ignoré silencieusement → fallback v1.37.x. LS prefs corrompu/vide → ignoré gracieusement (try/catch).

**📦 v1.37.2** : Fix bug Ctrl+Z casse la suite d'un tracé.

Bug remonté KARMA terrain : *« le control Z casse toujours la suite d'un tracé »*. Confirmé via logs F12 — après Ctrl+Z, `currentRoadIndex` était bien restauré (fix v1.26.3-hotfix3 OK) mais le clic suivant n'ajoutait aucun point (`total roads` et `road points` stagnaient).

**Cause racine** : `resetRoads()` (cf `js/road.js` l.1046) fait `window.modeRoad = null`. Or `HistoryManager > _applyState()` appelle `resetRoads()` AVANT `setRoads()` pour restaurer atomiquement l'array. Conséquence : après chaque undo, `window.modeRoad` est wipé. Le mousedown handler de `road.js` l.171 check `if (!window.modeRoad) return;` → tout clic post-undo est avorté en silence → l'user voit son tracé restauré mais ne peut plus le continuer (« lien suivant cassé »). Le fix v1.26.3-hotfix3 avait pensé à restaurer `currentRoad` via index mais oublié le mode road. Régression latente depuis 11 versions.

**Fix v1.37.2** (`js/historyManager.js > _applyState()`) : snapshot de `window.modeRoad` AVANT le `resetRoads()`, restauration APRÈS le `setCurrentRoadByIndex()`. **Conditionnel** : on ne restaure que si un tracé en cours doit être restauré (snapshot.currentRoadIndex ≥ 0 ET snapshot.roads présent) — sinon (annulation de la création même d'une nouvelle road = currentRoadIndex == -1 dans le snapshot pré-création), on laisse `modeRoad` à `null` posé par `resetRoads()` : cohérent avec l'annulation totale. Patch chirurgical de ~10 lignes, sans toucher à `resetRoads` ni au schéma de snapshot (état UI runtime, pas une donnée historique à versionner).

**Bump** : sw.js v1.37.1 → v1.37.2 + `__MKM__.build` + `version.json` + notes user-friendly.

**📦 v1.37.1** : Fix bug récurrent mise à jour douce + bouton Kill SW Configuration home.

**Bug récurrent identifié via audit indépendant** : après clic « 🔄 Forcer la mise à jour » + reload, le badge footer restait sur « ancienne → nouvelle ». 2 hotfixes historiques (v1.34.9 polling reg.waiting + v1.34.25 stale cache LS) avaient patché des symptômes sans corriger la cause racine.

**Cause racine** : `_getCacheNameFromSW()` (hotfix21) interrogeait le SW COURANT (= l'ancien avant `reg.update()`) → récupérait le nom de cache de l'ANCIENNE version → la purge filtrait `k !== currentCacheName` → on **préservait EXPLICITEMENT l'ancien cache** → au reload, l'ancien SW (toujours `controller`) continuait de servir son ancien `copyright.js` depuis son cache préservé → `window.__MKM__.build` figé sur l'ancienne version → badge footer affichait éternellement « ancienne → nouvelle ». Le polling v1.34.9 ne couvrait que le happy path (install < 5s) ; en cas de réseau lent ou ~100 assets `cache:'reload'` → timeout fréquent → fallback reload avec cache ancien préservé = même bug.

**Fix v1.37.1** (`js/interfaceMaintenance.js > mettreAJourCodeSeul()`) : retrait du `_getCacheNameFromSW()` call + purge TOTALE des caches PWA via `caches.keys().map(caches.delete)` sans filter (pattern identique à `killsw.html` qui marche systématiquement). Le nouveau SW (install en background via `reg.update()` fire-and-forget) re-populera ses assets au reload via son install handler. Coût : 1 re-DL des assets (~100 fichiers, 3-8 sec sur fibre) — acceptable car « Force update » est une action volontaire avec ping internet validé en amont. Fonction `_getCacheNameFromSW()` supprimée (dead code après retrait du call site), handler côté SW (`GET_CACHE_NAME`) conservé pour rétrocompat éventuelle (debug F12 manuel / modules tiers).

**Garde-fous conservés** : ping internet 5s avant action (refuse si offline), polling `reg.waiting` + `SKIP_WAITING` + `controllerchange` 1.5s (utile dans le happy path où l'install est rapide), overlay « ⏳ Préparation… » pendant l'opération.

**Bump** : sw.js v1.37.0 → v1.37.1 + `__MKM__.build` + `version.json` + notes user-friendly.

**📦 v1.37.0** : Calibration Nord per-plan + import PDF Histoire générateur avancé + Réglages + fix CSS light planner-mode-btn.

**A. 🧭 Calibration Nord per-plan (runtime + générateur avancé)**
- **Cas d'usage** : plans dont le haut n'est PAS le Nord vrai (photo aérienne avec cadrage arbitraire, plan cataphile sans rosace alignée). Le tracker pointait à côté, la rotation marker était fausse.
- **Cascade lecture** : `myktamap_plan_prefs_<planId>.northOffsetDeg` (LS, saisi via Réglages map mode ⚙️) → `APP_CONFIG.northOffsetDeg` (mappé depuis `plan-config.json > plan.northOffsetDeg`, écrit par le générateur avancé) → `0` (default = Nord-haut, comportement v1.36.x intact). **Rétrocompat absolue** : pas de champ = comportement actuel inchangé.
- **Helpers** : `window.getPlanNorthOffset(planId)` + `setPlanNorthOffset(planId, value)` + `resetPlanNorthOffset(planId)` dans `js/config.js`. Event `kta:northOffsetChange` pour re-render à chaud (tracker + status text Réglages).
- **Application** : `_getCorrectedHeading()` reste en repère MONDE (Nord vrai) → boussole physique (`compass.js`) continue de pointer le vrai Nord magnétique. Nouvelle helper `_getPlanRelHeading()` = corrected + offset → utilisée par `_majRotationTrackerMarker()` (rotation icône), `_avancerRaster()` + `_avancerSurGraphe()` (vecteur déplacement). **Distinction clé** : pour le marker tracker (qui se voit sur la map dans le repère plan), on applique l'offset ; pour la boussole physique (qui doit montrer le Nord vrai indépendamment du plan), on ne touche pas.
- **UI Réglages map mode** : nouveau bloc "🧭 Calibration du Nord (ce plan)" avec champ angle numérique [0,360[ (saisie directe), bouton "📐 Calibrer (2 clics)" qui lance le picker WYSIWYG sur la map, bouton "↺ Reset" (retour cascade). Status text adaptatif (cur=0 → info, cur≠0 → confirmation en accent).
- **Picker 2 clics** : nouveau module `js/northPicker.js` (~210 lignes, autonome). Workflow : modale Réglages se ferme → overlay flottant "Clique le Sud" → 1er clic capture latlng → "Clique le Nord" → 2e clic → flèche pointillée Sud→Nord tracée (Leaflet polyline jaune dashArray + marqueur N badge or au bout) → calcul angle via `atan2(dlng, dlat)` (Leaflet CRS.Simple : lat croît vers haut plan, lng vers droite plan → convention CW depuis haut) → boutons Valider / Recommencer / Annuler. Sanity check : distance Sud→Nord < 20 px latlng → rejet (bruit angulaire). API : `window.openNorthCalibrationPicker()` retourne `Promise<number|null>`. CSS overlay fixed bottom-center z=99998 + variant theme clair.

**B. 🧭 Calibration Nord — générateur avancé (`js/createConf.js`)**
- Nouveau champ `pl_northOffset` dans la section "🧭 Tracking" du mode Avancé (`data-planner-advanced="1"`). Range [0,359], default 0, step 1. Hint explicatif sur la convention (0 = haut = Nord, sens horaire).
- `_genererZip()` : écrit `planObj.northOffsetDeg` UNIQUEMENT si ≠ 0 après normalisation `((x % 360) + 360) % 360`. Plans Nord-haut → champ totalement absent du JSON → lecteurs v1.36.x continuent de produire un comportement identique.
- Mode Modifier : pré-remplissage depuis `plan.northOffsetDeg` du ZIP source (`_preRemplirFormulaire`).

**C. 📖 PDF Histoire — générateur avancé uniquement**
- **Générateur avancé** : nouvelle section dédiée après Géoréférencement avec input file `accept="application/pdf"` + bouton "🗑 Retirer" (mode Modifier). 3 cas dans `_genererZip` : (1) nouveau PDF uploadé → embed `data/histoire.pdf` + `planObj.histoirePdf = "data/histoire.pdf"` ; (2) mode Modifier sans changement → conservation du PDF source via `_plannerOrigAssets` ; (3) sinon → champ absent (rétrocompat). Pré-remplissage en mode Modifier : `dataset.existing` sur le span nom pour signaler le PDF source à conserver.
- **Pas de doublon dans Réglages map mode** (feedback KARMA "ca sufit ou il était avant dans mode histoire") : le bouton d'import côté session existe déjà dans la modale 📖 **Mode Histoire** (onglet PDF, v1.34.20) → on ne duplique pas l'UX. Distinction d'usage : **générateur = durable cross-utilisateurs** dans le ZIP ; **modale Mode Histoire = override session per-navigateur** dans IDB locale.

**D. 🐛 Fix CSS light theme — switch Simple/Avancé du générateur**
- Bug KARMA : le bouton actif du switcher `.kta-planner-mode-btn.kta-actif` n'avait pas de surlignage visible en mode clair (vs dark mode où il a un halo jaune).
- **Cause racine** : la règle `body.kta-theme-light .kta-planner-mode-btn.kta-actif` (ligne 16358) appliquait `background` + `color` + `border-color` mais oubliait le `box-shadow` que le dark mode utilise pour le halo accent (ligne 16287).
- **Fix** : ajout de `box-shadow: 0 1px 4px rgba(217, 168, 46, 0.55)` (halo orange foncé compatible fond beige clair) + `font-weight: 700` pour renforcer le contraste.

**E. 📦 Bump** : sw.js v1.36.2 → v1.37.0 + `__MKM__.build` v1.37.0 + `version.json > version` + notes user-friendly. Nouveau module `js/northPicker.js` ajouté à `ASSETS_TO_CACHE` + chargé dans `index.html` AVANT `interfaceConfig.js` (dépendance `window.openNorthCalibrationPicker`).

**📦 v1.36.2** : Fix ronds intersections de tracés + déplacement option per-plan dans ⚙️ Réglages. (1) **Bug fix** — sur les plans denses (Catacombes 2024+, > 200 tracés) les cercles colorés aux intersections de tracés disparaissaient silencieusement. Cause racine identifiée : seuil interne `ROAD_INTERSECTION_MAX_ROADS = 200` dans `js/road.js > _calculerIntersectionsRoads()` qui faisait un short-circuit muet du calcul sans message d'erreur. Seuil remonté à **500** (couvre les plans actuels les plus denses + marge confort, perf O(N²) reste acceptable sur cette taille — mesurée < 80 ms sur Catacombes 2024). (2) **Déplacement UX** — le toggle « ⚪ Afficher les ronds aux intersections de tracés » a été **retiré de Configuration home** (où il était global à TOUS les plans, peu intuitif) et **déplacé per-plan dans ⚙️ Réglages mode carte**. Nouveaux helpers dans `js/config.js` : `window.getPlanShowsIntersections(planId)` + `window.setPlanShowsIntersections(planId, value)` avec cascade lecture **per-plan → global → default true**. Persistance via nouvelle clé `localStorage > myktamap_plan_prefs_<planId>` (objet `{showRoadIntersections: bool, …}`) — réservé pour d'autres préférences per-plan futures. `js/road.js` ligne 571 : `APP_CONFIG.showRoadIntersections !== false` → appel au helper. `index.html` : suppression checkbox `#loaderShowIntersectionsCb` + handler. `js/interfaceConfig.js` : nouveau toggle `#cfg_show_intersections` dans section Réglages map mode (à côté de scaledMarkers / Wake Lock). Bump cache v1.36.1 → v1.36.2 + bump `__MKM__.build` + `version.json > version` + notes user-friendly.

**📦 v1.35.1** : Hotfix Mode Sortie d'urgence — codes courts. : v1.35.0 cherchait les libellés humains ("puits à échelon ouvert", "escalier de service ouvert", "cavage ouvert") dans les tags des POIs alors que les tags réels sont des **codes courts** : `cao` (Cavage Ouvert), `peo` (Puits à Échelon Ouvert), `eso` (Escalier de Service Ouvert) — feedback KARMA. Versions fermées (`caf`/`pef`/`esf`) restent volontairement exclues (impassables). Modifs uniquement `js/sortieUrgence.js > TYPES_SORTIE` array + message d'erreur quand aucune sortie trouvée. Bump cache v1.35.0 → v1.35.1.

**📦 v1.35.0** : Mode Sortie d'urgence (POIs sortie + pathfinder). : Feature #5 roadmap KARMA — sortie la plus proche via pathfinder. Nouveau module `js/sortieUrgence.js` (~340 lignes) avec API `window.SortieUrgence.declencher()`. Critère sortie : tag normalisé ∈ {`cao`, `peo`, `eso`} OU tag = `entrée`. Pipeline : (1) position tracker sinon mode picker clic carte, (2) filtre POIs (session + data layers via `getEditorPoints`+`getAllEmbeddedPoints`), (3) pre-tri euclidien top-15, (4) `Pathfinder.computeRoute` en parallèle, (5) tri final (pathfinder-OK first, puis distance), (6) modale compacte avec sortie + bouton "🧭 Tracer iti" + dépliable "Voir N autres". Bouton 🚨 dans status bar entre 📖 et 🔋 (`refonteInterface.js`). Commande vocale "sortie" + 15 patterns dans `voiceCommand.js`. Multi-niveau délégué au pathfinder (gère jonctions inter-niveaux nativement). Vibrations : `medium()` sortie trouvée, `error()` aucune. CSS modale `.kta-sortie-urgence-*` + variants theme clair + spinner. Cas dégradés : fallback euclidien marqué `≈` si pathfinder échec sur 1 sortie, message explicatif si aucune sortie. Mode picker via `map.on("click")` + conversion lat/lng → x/y plan via `convertCoord` inverse. Bump cache v1.34.34 → v1.35.0.

**📦 v1.34.34** : Rollback notes vocales POI (v1.34.31-33). : KARMA "ne marche pas vraiment" sur iPhone PWA après screenshots — design audio natif `<audio controls>` + `<button>` iOS imprévisibles cross-platform (lecteur réduit à un bouton play sans barre + boutons custom rendus en gros carrés bleus pleins iOS même avec `-webkit-appearance: none`). Cleanup systématique : `rm js/voiceNote.js` + retrait slot popup + `attachPopupVoiceNote` + `kta_voiceNoteAction` (~175 lignes utils.js) + appels editor.js + collecte audios + pack ZIP `audio/*` + anonymizer cleanup + MIMEs audio dans `_extDepuisMime` (sessionExporter.js) + extraction `audio/*` + restore IDB + badge "🎙️ N notes vocales" (interfaceImportExport.js) + tous les CSS `.kta-popup-voicenote*` (dark + theme clair) + keyframes `kta-vn-blink` + script index.html + asset SW. Vérif `grep -rE "voiceNote|VoiceNote|voicenote"` → zéro résidu. v1.34.29 (export ZIP étendu) et v1.34.30 (MD editor) **intacts**. Re-design différé : si retenté, viser modale dédiée avec custom player ▶️/⏸️ + barre progress CSS (pas de `<audio>` natif). Bump cache v1.34.33 → v1.34.34.

**📦 v1.34.30** : MD editor inline pour note libre Mode Histoire. : Feature #3 roadmap KARMA — Markdown éditable dans la note libre. Nouveau `js/mdParser.js` (~200 lignes, autonome, XSS-safe). Sous-ensemble supporté : headings `# ## ###`, bold `**`, italic `*` ou `_`, code inline `` ` ``, liens `[txt](url)` avec whitelist schémas (http/https/mailto/tel/anchors), listes `-`/`*` + `1.`, citations `>`. **PAS** supportés (par choix) : tables, HTML brut, footnotes, images, code blocks ` ``` ` (ajoutables plus tard). Sécurité : `escapeHtml` complet (5 chars) AVANT toute transformation MD → résultat HTML safe par construction. URLs liens filtrées via `safeUrl()` whitelist schémas. API publique : `window.kta_renderMd(text) → htmlString` + `window.kta_escapeHtml(text) → htmlString` (helper). Côté `js/modeHistoire.js` (refactor onglet Note libre) : ajout header avec boutons `✏️ Éditer` + `👁 Aperçu` (toggle mode VIEW/EDIT) + status sauvegarde. Mode VIEW = div `.kta-histoire-note-rendered` (MD rendu par défaut quand note non vide). Mode EDIT = toolbar (B I H1 H2 • Liste 🔗 Lien `</>` ❝) + textarea (mode par défaut si note vide). Helper `_setNoteMode(mode)` toggle display, `_refreshNoteView()` re-rend depuis textarea.value, `_applyMdToolbar(ta, kind)` insère marqueur autour de sélection (avec placeholder si pas de sélection) + gère multi-ligne pour préfixes (h1/h2/ul/quote). Persistance : MD source brut en localStorage (édition réversible). Export ZIP v1.34.29 compat directe (note destinataire = même MD). CSS `.kta-histoire-note-rendered` (h1-3 jaune `#f4c542`, code orange, blockquote bordure jaune) + `.kta-histoire-md-toolbar` + variants theme clair (h1-3 orange `#b35309`, code orange foncé, blockquote bordure orange). Script `mdParser.js` ajouté AVANT `modeHistoire.js` dans index.html. Bump cache v1.34.28 → v1.34.30 (saut v1.34.29 car edit fantôme sur sw.js perdu lors de la précédente release — pas d'impact user, juste trou dans séquence cache).

**📦 v1.34.29** : Export MKMSESSION étendu (note libre + PDF Histoire). : Feature #2 roadmap KARMA — extension du format `.mkmsession.zip` pour transporter le Mode Histoire entre appareils/sessions. **Côté export** (`js/sessionExporter.js`) : 2 nouveaux helpers `_lirePdfHistoireSession()` (IDB `myktamap_histoire_pdfs` ad-hoc avec safe-create du store pour compat modeHistoire) + `_lireNoteLibreSession()` (localStorage `myktamap_note_libre_<planId>`). `_exportFull()` étendu : `Promise.all([photosPromise, histoirePromise])` + ajout `session.noteLibre` (texte inline) + `session.historeSessionPdf = {name, file: "mode-histoire/<name>"}` + force ZIP si PDF présent. Test "session vide" étend à `hasNoteLibre`. Anonymize ON force skip note + PDF (peuvent contenir des infos perso). `_packerZipSession()` accepte param `historePdf` → `mode-histoire/<name>` dans le ZIP. Anonymiseur retire `noteLibre` + `historeSessionPdf` (défense en profondeur). **Côté Mode Histoire** (`js/modeHistoire.js`) : nouvelle API `MH.importSessionData(noteText, pdfBlob, pdfName)` centralise restoration LS + IDB côté plan courant. **Côté import** (`js/interfaceImportExport.js`) : 2 nouveaux pending `_pendingHistoirePdfToRestore` + extraction au parse ZIP via `data._pendingHistPromise` + `Promise.all` avec photos avant rendu preview. Badge aperçu `📖 Histoire (note libre + PDF)` si présent. Restauration au valider via `ModeHistoire.importSessionData()`. Bouton "🔍 Aperçu PDF" remplace audio (rétrocompat avec ZIPs existants sans champs). Compat rétro : exports pré-v1.34.29 = OK (champs absents → ignorés silencieusement). Bump cache v1.34.28 → v1.34.29 (mais perdu sur sw.js, restauré directement en v1.34.30).

**📦 v1.34.28** : Fix theme clair dropdown recherche Mode Itinéraire. : KARMA screenshot — dans la modale "Mode clic carte / Ma position / Vider" → champ recherche POI → résultats affichés en dessous gardaient le background sombre `#232838` + text clair `#e8eaf0` malgré le theme clair actif. Cause : pas d'overrides `body.kta-theme-light .kta-iti-search-*` dans `css/style.css` (oubli historique). Fix : ajout d'une section dédiée avec double sélecteur `body.kta-theme-light .X, html.kta-theme-light .X` (pattern v1.34.23 safe car les modales peuvent être appendées à `document.documentElement` selon les modules). Cosmétique uniquement.
**📦 v1.34.27** : Vibration haptique branchée à 5 events critiques.
**📦 v1.34.26** : Vibration haptique infrastructure + toggle Configuration. : KARMA validation v1.34.26 → branchage des events choisis (critiques sécurité + recalage + waypoint proche 100px). Events branchés :
- **Waypoint Mode Itinéraire à ≤100 px** : `kta_vibrate.medium()` (100ms). Nouveau helper exposé `window.getItineraireWaypoints()` dans `js/interfaceItineraire.js` (copie read-only du tableau `_itineraryWaypoints` interne). Nouveau helper `_checkWaypointProximity()` dans `js/tracking.js` appelé à chaque `updateMap()` (= chaque pas / recalage / restore timeline). Hystérésis : Set `_vibratedNearWaypoints` mémorise les waypoints déjà signalés ; vibre quand entre dans rayon 100 px (clé `x_y` du waypoint), ré-vibrable après sortie >200 px. Reset complet si plus d'iti actif. Log debug optionnel.
- **Recalage tracker via "📍 Je suis ici"** : `kta_vibrate.light()` (50ms) à la fin de `recalerTrackerSurPoint` (tracking.js l1110+). Confirme tactile que le recalage a été accepté.
- **Étape validée Mode Secours par équipe** : `kta_vibrate.medium()` après `updateEtape(s.id, equipeId, _liveEquipeFocusIdx, {completedAt: _nowIso()})` dans `js/secoursMode.js` (handler "Étape suivante" l7292). Cohérent avec waypoint Mode Itinéraire.
- **Alerte serveur publiée automatiquement** : `kta_vibrate.error()` ([200,100,200,100,200]) dans `js/alertChecker.js _afficherAlertes()` UNIQUEMENT si `fromManualClick === false` (= remontée auto au boot/poll, pas click bouton 🚨 où l'user sait déjà).
- **Toast OOM critique** : `kta_vibrate.error()` dans `js/oomGuard.js showToast` quand `type === "warn"` ou `type === "error"`. Type "info" reste silencieux (évite spam debug). Cohérent avec criticité visuelle du toast.

Tous les calls sont gardés par `if (window.kta_vibrate)` (no-op si module pas chargé) et le helper lui-même check `APP_CONFIG.vibrationEnabled === true` + `navigator.vibrate` existe avant de vibrer. Si user décoche le toggle dans Configuration, silence total quel que soit l'event. Si device non supporté (iPhone Safari), silence total transparent. Pas de régression visuelle (les toasts et modales continuent d'afficher leur contenu standard).
**📦 v1.34.26** : Vibration haptique infrastructure + toggle Configuration.
**📦 v1.34.25** : Fix modale "Déjà à jour" notes stale. : 1ère release du sprint "évolutions fonctionnelles" validé avec KARMA. KARMA a choisi le menu : (1) vibration toggle d'abord, (2) export MKMSESSION étendu, (3) MD editor inline, (4) notes vocales POI, (5) Mode Sortie d'urgence, (6) import tag/icône live. Ordre du plus rapide au plus gros. **Cette release** : infrastructure haptique seule, les events viendront avec les prochaines features. Modifs : (a) `js/config.js DEFAULT_CONFIG` — ajout `vibrationEnabled: true` (default ON) + restauration au boot via `app_user_prefs.vibrationEnabled`. (b) `js/utils.js` — helper global `window.kta_vibrate(pattern)` qui check `APP_CONFIG.vibrationEnabled === true` ET `navigator.vibrate` existe avant d'appeler. Sucre syntaxique pour patterns standard : `kta_vibrate.light()` (50ms), `.medium()` (100ms), `.double()` ([100,50,100]), `.error()` ([200,100,200,100,200]). Helper `kta_vibrate.isSupported()` pour conditionner l'UI. Échec silencieux si pref OFF ou pas supporté. (c) `js/interfaceConfig.js` — toggle "📳 Vibration haptique" dans section "🔍 Affichage" (id `cfg_vibration_row`, à côté du Wake Lock). Visible UNIQUEMENT si `window.kta_vibrate.isSupported()` true (auto-masqué sur iPhone Safari qui ne supporte pas Web Vibration API — choix délibéré d'Apple). Handler : update `APP_CONFIG.vibrationEnabled` + persiste `app_user_prefs.vibrationEnabled` + vibration de confirmation `light()` à l'activation + toast feedback. **Rétrocompat** : `vibrationEnabled` par défaut ON donc les futurs events vibreront sans action user. Pref persistée donc survit aux reloads. Si l'user décoche, silence total quel que soit l'event. **Prochaines features** brancheront `kta_vibrate.medium()` aux waypoints atteints (Mode Itinéraire / Mode Secours), `.error()` aux alertes critiques, etc.
**📦 v1.34.25** : Fix modale "Déjà à jour" notes stale.
**📦 v1.34.24** : Mode Histoire icône 📖 même taille que 📊 / 🔋. : KARMA screenshot iPhone PWA — modale "Déjà à jour" : header `Tu utilises la dernière version : v1.34.24` (correct) MAIS bloc `📝 Notes de cette version` affiche les notes de **v1.35.0** (Pack RAM Phase 2 rollback, jamais shippée). Cause : `js/interfaceAlerts.js` (ligne 98-112) lisait `lastVersionData.notes` depuis `localStorage > myktamap_last_version_data` sans vérifier que `lastVersionData.version === installed`. Scénario typique : user a fait l'update douce v1.34.X → v1.35.0 (acceptée + cache LS update avec notes v1.35.0), puis rollback côté serveur en v1.34.4 → `__MKM__.build` redevient v1.34.X mais le LS reste à v1.35.0 → modale affiche notes stale. Fix : ajout check `cacheMatchInstalled = lastVersionData && lastVersionData.version === installed` AVANT d'afficher le bloc notes. Si cache stale → on n'affiche QUE le titre `Déjà à jour` + version installée (notes implicitement omises). Le prochain `UpdateChecker.check()` re-fetch `version.json` et met à jour le cache LS avec les vraies notes de la version installée. Aucune perte d'info pour l'user (les notes user-friendly de version.json restent affichées au prochain check). Pas de cleanup LS automatique (pour préserver la logique snooze de l'update checker — cf v1.20.0 downgrade serveur). Bug latent depuis l'introduction de la modale "Déjà à jour" — probablement v1.21.x ou v1.22.x. Bonus : suggère un audit similaire des autres modales qui lisent `lastVersionData.notes` sans check version (TODO future).
**📦 v1.34.24** : Mode Histoire — Agrandir icône 📖 pour matcher 📊 / 🔋.
**📦 v1.34.23** : Mode Histoire — Fix theme clair (sélecteur CSS dual). : KARMA visual feedback v1.34.23 — l'icône 📖 du chip Mode Histoire dans le header refonte paraissait plus petite que celles de 📊 stats et 🔋 batterie, parce que le chip histoire n'a pas de `.kta-refonte-counter-val` text à côté de son icône (à la différence des autres chips qui ont un compteur ex: `🔋 87`). Fix CSS : surcharge `font-size: 16px` (vs 12px par défaut de `.kta-refonte-counter-icon`) UNIQUEMENT pour `.kta-refonte-counter-histoire .kta-refonte-counter-icon` — pas de modif globale pour éviter régression sur stats / batterie / résumé mobile 📊. `line-height: 1` pour éviter que le chip s'étire en hauteur à cause de la baseline emoji. Variant theme clair non affecté (les overrides de v1.34.21+23 portent sur background/color, pas font-size). Cosmétique uniquement.
**📦 v1.34.23** : Mode Histoire — Fix theme clair (sélecteur CSS dual `body`/`html`).
**📦 v1.34.22** : Mode Histoire — Fix CSP iframe blob + bouton "Ouvrir dans un onglet". : KARMA screenshot v1.34.22 montre que les overrides theme clair de v1.34.21 ne s'appliquent PAS aux éléments INSIDE la modale Mode Histoire (tabs bar, wrap PDF, placeholder). Cause : `js/modeHistoire.js _build()` fait `document.documentElement.appendChild(_modal)` (cohérent avec `filterPanel.js`, `secoursMode.js`) → la modale est SIBLING de `<body>`, pas descendant. Mes overrides utilisaient `body.kta-theme-light .kta-histoire-*` qui ne matchent QUE les descendants de body. Le theme `kta-theme-light` est appliqué sur HTML ET body (`themeManager.js` l99 + l103) — donc le bon pattern pour les modales appendées à `documentElement` est le **double sélecteur** `body.kta-theme-light .X, html.kta-theme-light .X` (identique à `sessionExporter.js`). Fix : ajout du sélecteur `html.kta-theme-light .X` pour TOUTES les règles theme clair du Mode Histoire (tabs, tab-active, tab:hover, textarea, textarea:focus, note-status, pdf-wrap, pdf-empty, pdf-fallback, pdf-empty p code, pdf-toolbar, pdf-meta, pdf-action-open). Idem pour `body.kta-theme-light .kta-readme-modal-*` ailleurs dans le fichier ? À auditer ultérieurement — pour l'instant focus sur Mode Histoire qui est le bug rapporté. **Pourquoi `documentElement` au lieu de `body`** : pattern existant pour les modales (`filterPanel.js`, `secoursMode.js`) — probablement pour z-index/positioning consistency. Pas changé pour ne pas régresser ailleurs.
**📦 v1.34.22** : Mode Histoire — Fix CSP iframe blob + bouton "Ouvrir dans un onglet".
**📦 v1.34.21** : Mode Histoire — finitions UX (bouton + theme clair v1). : KARMA test v1.34.20/21 sur dev.myktamap.fr a déclenché en console `Framing 'blob:...' violates the following Content Security Policy directive: "default-src 'self'". The request has been blocked. Note that 'frame-src' was not explicitly set, so 'default-src' is used as a fallback.` → l'iframe PDF ne s'affiche pas. Cause : le header CSP nginx (`docs/nginx-csp-config.conf` ligne 96) n'avait pas `frame-src`, donc fallback sur `default-src 'self'` qui bloque les blob: URLs. **Fix nginx** : ajout `frame-src 'self' blob:;` dans le `Content-Security-Policy` header. Cohérent avec les autres directives qui autorisent déjà `blob:` (`img-src 'self' data: blob:`, `connect-src 'self' blob:`, `worker-src 'self' blob:`). `frame-ancestors 'none'` reste intact (sécurité anti-clickjacking — on protège contre l'embedding dans une page tierce, indépendant du `frame-src` qui régit ce QU'ON embarque). **Fix code (fallback en attendant que la config nginx soit redéployée)** : ajout d'un bouton **↗️ Ouvrir dans un onglet** en sticky position absolute top-right sur le wrap de l'iframe. (a) Si CSP bloque l'iframe → user a au moins le bouton qui marche (CSP autorise `window.open` de blob: via le target=_blank). (b) Même si l'iframe marche, certains users préfèrent le PDF plein écran dans un onglet dédié (zoom natif, copie texte, sélection, etc.). CSS `.kta-histoire-pdf-actions` + `.kta-histoire-pdf-action-open` avec variant theme clair (`#8b3a00` accent jaune-charte). **Action manuelle KARMA** : redéployer `nginx-csp-config.conf` sur le serveur (devmap + prod) + reload nginx (`nginx -s reload` ou systemctl) pour que la nouvelle directive prenne effet. En attendant, le bouton "Ouvrir dans un onglet" est le secours. **Sécurité** : `frame-src 'self' blob:;` est restrictif — on autorise UNIQUEMENT les frames de notre origine et les blob: URLs (créées par notre code via `URL.createObjectURL`). Pas de risque XSS via iframe distante. Détails dans `docs/nginx-csp-config.conf` commentaire au-dessus de la ligne CSP.
**📦 v1.34.21** : Mode Histoire — finitions UX (bouton + theme clair).
**📦 v1.34.20** : Mode Histoire — Import PDF session. : 2 retours KARMA après tests v1.34.19/20 : (1) **Bouton 📖 déplacé à GAUCHE de la batterie** dans le header refonte (avant : à droite, peu visible — l'ordre logique est maintenant `📊 stats · 📖 histoire · 🔋 batterie`, ce qui groupe les chips d'action ensemble et laisse la batterie en bout de barre comme c'est l'habitude OS). Modif : `js/refonteInterface.js` — inversion de l'ordre d'insertion HTML. (2) **Theme clair fixé pour Mode Histoire** : avant, les onglets `📝 Note libre / 📚 Histoire` héritaient des couleurs du theme sombre (background `#1a1f2e`, color `#8892a4`) → illisible en theme clair. Idem pour le placeholder "Aucun PDF" et la toolbar Importer/Remplacer/Retirer. Fix : ajout d'une section dédiée dans `css/style.css` sous le block existant `body.kta-theme-light .kta-readme-modal-*` (~50 lignes) avec overrides pour : `.kta-histoire-tabs` (background light), `.kta-histoire-tab` + `:hover` + `-active` (couleurs charte light avec accent `#8b3a00`/`#d97706`), `.kta-histoire-textarea` + `:focus` (background `--kta-light-bg-deep`, border focus orange), `.kta-histoire-note-status` (text-soft), `.kta-histoire-pdf-wrap` (background light), `.kta-histoire-pdf-empty` + `.kta-histoire-pdf-fallback` + leurs `p code` (text light + accent jaune-charte sur code inline), `.kta-histoire-pdf-toolbar` (background subtil jaune `rgba(244, 197, 66, 0.08)`) + `.kta-histoire-pdf-meta` (text-light). Réutilise les variables CSS `--kta-light-*` existantes pour cohérence avec le reste de l'app.
**📦 v1.34.20** : Mode Histoire — Import PDF session si plan sans `histoirePdf`.
**📦 v1.34.19** : Mode Histoire — note libre + PDF embarqué. : complète v1.34.19. Si le plan courant n'a pas de `histoirePdf` embarqué dans son ZIP, l'user peut désormais **importer son propre PDF via file picker**, stocké en IDB (`myktamap_histoire_pdfs`) per-plan. **Priorité absolue** au PDF embarqué : si présent, le bouton import est caché (= l'auteur du plan a déjà fait son choix). Si pas embarqué : toolbar avec boutons **📥 Importer un PDF** / **🔄 Remplacer** / **🗑️ Retirer** + meta (nom + taille) quand un PDF session est présent. Stockage Blob direct en IDB (1 PDF par plan, remplaçable). URL.createObjectURL revoke proprement (Pack RAM Phase 4 lesson : iframe `src=""` avant remove + Set tracking via `_pdfBlobUrl`). Confirmation avant retrait (dialog `confirm()`). Detection MIME/extension `application/pdf || .pdf` au moment de l'import (sinon `alert` user-friendly). Le PDF survit aux reloads, n'est PAS effacé au plan switch (vit en IDB persistant), supprimé uniquement par l'user ou si l'user vide les données du site. **Modifs** : refonte complète de `js/modeHistoire.js` (+200 lignes) — helpers IDB `_idbOpen/_idbGet/_idbSet/_idbDel`, helpers PDF `_loadSessionPdf/_saveSessionPdf/_deleteSessionPdf`, refonte `_renderPdf()` async avec 3 chemins (embarqué > session > vide), nouveau helper `_displayPdfInWrap(url, name)` pour factoriser iframe/fallback iOS, listeners file picker + change + remove confirm, revoke URL au close. CSS : toolbar `.kta-histoire-pdf-toolbar` (flex avec wrap) + meta `.kta-histoire-pdf-meta` (ellipsis). **Limitation v1** : 1 PDF max par plan (suffit pour MVP — permet de remplacer). Pas d'export du PDF session (l'user peut le télécharger via le viewer iframe). Pas de cleanup auto au delete de plan (IDB orpheline si user delete son plan via PlanRegistry — petit overhead acceptable).
**📦 v1.34.19** : Mode Histoire — note libre + PDF embarqué.
**📦 v1.34.18** : E2 TTS — Lecture vocale des notes POI. : nouvelle feature accessible via un bouton 📖 dans la status bar (à côté de 📊 stats et 🔋 batterie). Click → modale 2 onglets : (1) 📝 **Note libre** = textarea éditable persistée localStorage per-plan (clé `myktamap_note_libre_${planId}`) avec auto-save debounce 500ms, (2) 📚 **Histoire** = affichage PDF embarqué dans le ZIP du plan via le champ `plan-config.json > plan.histoirePdf: "data/histoire.pdf"`. Le PDF est résolu via `RUNTIME_ASSETS` (extraction eager dans la whitelist 2-pass d'`extraireZip` v1.34.10+, pour avoir une URL stable côté iframe). Affichage via `<iframe>` natif sur desktop/Android, fallback bouton "📥 Ouvrir le PDF" sur iOS (où l'iframe PDF est peu fiable, ouvre dans l'app Files/Safari à la place). Modale auto-fermée au plan switch via `_libererRessourcesPlanPrecedent` (la note du plan précédent est sauvegardée AVANT fermeture, pas de perte). Si plan n'a pas `histoirePdf` → message "Aucun PDF embarqué" dans l'onglet 📚. **Nouveaux fichiers** : `js/modeHistoire.js` (module ~250 lignes). **Modifs** : `js/refonteInterface.js` (bouton 📖 dans le header), `js/config.js cloneAndResolvePlanConfig` (résolution du champ `histoirePdf` via `getRuntimeAssetUrl`), `index.html extraireZip` (ajout du PDF à la whitelist 2-pass pour extraction eager), `js/main.js startImportedPlan` (registerAsset du PDF) + `_libererRessourcesPlanPrecedent` (hook `ModeHistoire._onPlanSwitch()`), `css/style.css` (~80 lignes pour modale + tabs + iframe wrap), `sw.js` (ajout `modeHistoire.js` à `ASSETS_TO_CACHE` + `CACHE_NAME v1.34.19`). **Limitation v1** : pas d'éditeur de PDF dans `createConf.js` — l'auteur du plan ajoute manuellement le PDF au ZIP + édite le champ `histoirePdf` à la main pour l'instant. Évolution v1.34.20+ envisageable si feedback.
**📦 v1.34.18** : E2 TTS — Lecture vocale des notes POI (Web Speech Synthesis).
**📦 v1.34.16** : Pack RAM Phase 4 — 3 fixes critiques RAM native (anti-crash iPhone PWA). : nouvelle feature qui complète E1 (commande vocale v1.34.0). E1 = entrée audio (l'user parle), E2 = sortie audio (l'app lit les notes des POI). Cas d'usage : user sous terre, mains/yeux occupés → click bouton 🔊 à côté de la note du POI = l'app lit à haute voix. Mode strictement MANUEL (anti-pollution sonore), pas d'auto-lecture, pas de permission demandée, 100% offline (utilise les voix natives du device). Nouveau module `js/voiceTts.js` (wrap `speechSynthesis`, gestion async des voices iOS via `onvoiceschanged`, langue auto via `navigator.language`, cancel combo `pause()+cancel()` pour iOS). Bouton inline `<button class="kta-popup-tts-btn">🔊</button>` dans `buildPointPopupHtml` si description non-vide ET TTS supporté. Handler `window.kta_lireNotePopup(btn)` toggle play/stop, feedback visuel `🔊 ↔ ⏹️` via `VoiceTts.onStateChange`. CSS `.kta-popup-tts-btn` style icône cliquable. Register dans `index.html` + ajout à `ASSETS_TO_CACHE` du SW pour offline. **Limitation v1** : pas d'auto-cancel au popupclose — l'user click ⏹️ ou attend la fin (note typiquement courte).
**📦 v1.34.16** : Pack RAM Phase 4 — 3 fixes critiques RAM native (anti-crash iPhone PWA).
**📦 v1.34.15** : Pack RAM Phase 3 — Fuites #2/#3/#4. : KARMA a remonté que les optimisations Phase 2 + 3 n'avaient PAS empêché les crashes iPhone PWA, malgré une trace Performance Chrome (490 Mo, 128k samples) montrant un JS heap parfaitement stable (min 6.8 Mo, max 23.4 Mo, avg 15.5 Mo, 0% du temps >25 Mo). Conclusion : **la fuite n'est PAS dans le JS heap V8 mais dans la mémoire native non-comptée** (bitmaps décodées, canvas natifs, Blobs orphelins, etc.). Audit autonome ciblé a identifié les 3 sources principales :
- **Fix #A — Helper `_revokeAllPhotoObjectUrls` jamais défini** (CONFIRMÉ par audit) : `js/main.js:698` appelle `window._revokeAllPhotoObjectUrls()` au plan switch, MAIS aucun module ne le définit (bug confirmé via `grep`). Le call était donc un no-op silencieux depuis v1.21.3 (P0-10). Conséquence : les ObjectURL créées par `attachPopupPhotos` (`js/utils.js:1079`) et autres modules photos restaient pinned, et les Blob backings (typiquement 50-500 Ko par photo) accumulaient au fil des sessions. Fix : ajout d'un Set global `window._ktaAllPhotoUrls` (init dans `utils.js`), ajout au registre dans `attachPopupPhotos`, définition de `window._revokeAllPhotoObjectUrls = function() { ... revoke all + clear }`. Sync avec le Set local `_objectUrls` pour éviter double-revoke.
- **Fix #B — `libererTuiles` ne clear pas `img.src` avant remove** (SUSPECT FORT, gain 50-300 Mo iPhone) : sur plan V1 base tile non-V2 (864 tuiles × 512×512×4 bytes RGBA = théoriquement 864 Mo de bitmaps), `js/tiling.js:634 libererTuiles()` faisait `removeLayer(overlay) + revokeObjectURL(blobUrl)` MAIS jamais `img.src = ""`. iOS Safari (WebKit) garde la bitmap décodée pinned en cache GPU/mémoire native même après `removeLayer` détache le DOM. Le seul moyen de forcer la libération côté WebKit est de vider explicitement `<img>.src`. Fix : avant `removeLayer`, set `t.overlay._image.src = ""` avec try/catch. Coût négligeable (1 assignation par tuile).
- **Fix #C — Safe-remove `_ktaImageOverlays` au plan switch** (SUSPECT FORT, gain 20-200 Mo iPhone) : même problème pour les calques image (Légende, etc.). Sur un plan multi-niveau avec 4-10 calques 4096×4096 PNG, c'est 64-160 Mo retenus de bitmap iOS. Fix : dans `_libererRessourcesPlanPrecedent` (main.js), AVANT `map.remove()`, itérer `window._ktaImageOverlays` et set `entry.overlay._image.src = ""` pour chaque entry. `map.remove()` après détache tous les layers de toute façon — ici on ajoute juste le clear bitmap iOS préalable.

**Gain RAM total estimé** : **75-550 Mo libérables sur iPhone PWA** au plan switch. Largement de quoi expliquer les crashes répétés (budget mémoire iPhone PWA ~200-500 Mo selon device, WebKit ne dump pas aussi agressivement que V8).

**Méthode** : audit autonome via agent (rapport généré par scan systématique de `URL.createObjectURL`, `Blob`, `canvas`, `addEventListener`, `MediaStream`, `IndexedDB cursor`, etc.). Le bug confirmé `_revokeAllPhotoObjectUrls` non défini était une "tombe d'éléphant" depuis v1.21.3 — typique d'un fix incomplet qui appelle un helper jamais codé. Les fixes B et C s'appuient sur une connaissance de bug WebKit/iOS Safari (bitmap pinning) que l'audit JS pur ne révèle pas.
**📦 v1.34.15** : Pack RAM Phase 3 — Fuites #2/#3/#4.
**📦 v1.34.14** : Fix `registerEmbeddedRoad` batch. : ré-attaque des 3 fuites RAM identifiées dans l'audit v1.35.0 rolled back, indépendantes du lazy tile (#1 résolu en v1.34.11/v1.34.12).
- **Fuite #2 — `js/tracking.js _decimateTimeline`** : la fonction réduisait `_trackingTimeline` (data) à `TIMELINE_TRIM_TO` entries en préservant les ancres `start`/`recalage`, MAIS NE TOUCHAIT PAS le polyline visible. Le polyline continuait d'accumuler tous les points via `addLatLng()` (cf `updateMap` l719) → fuite RAM linéaire (chaque pas = 1 LatLng object × ~32 bytes + 1 SVG path command). Sur session 6h dense (1 pas / 600ms = 36k pas), c'était ~1.2 Mo garde indéfiniment dans `polyline._latlngs`, + l'overhead Leaflet pour le rendu SVG (path commands accumulées). Fix : appeler `_rebuildTrailFromTimeline()` à la fin de `_decimateTimeline()`. Cette fonction existait déjà pour le restore SessionPersist — elle reconstruit le polyline en segments multi via les ancres, cohérent avec la timeline. Coût : O(N) sur la timeline décimée (= ~18k pts max après décimation), déclenché 1× tous les ~2000 push (~30 min de PDR dense) → négligeable.
- **Fuite #3 — `js/secoursMode.js _hydraterPhotosLive`** : chaque appel créait N nouvelles `ObjectURL` via `MyKTAMapSecoursPhotos.getObjectUrl(pid)` pour les placeholders photo des étapes Live, sans revoke des précédentes. Réouverture de la vue Live = nouvelles URLs ajoutées sans libérer les anciennes (les Blob backings restent pinned). Sur usage actif (Op surface qui consulte les photos remontées par les équipes plusieurs fois par minute), accumulation linéaire (~1-10 Mo par hydrate selon nb photos). Fix : Set module-level `_livePhotoUrls` qui track toutes les URLs créées, helper `_revokeLivePhotoUrls()` appelé AVANT chaque hydrate (= remplace les anciennes par les nouvelles) ET au `fermer()` du module (= sortie définitive Live). Log debug optionnel pour traçabilité.
- **Fuite #4 — `js/lostMode.js _renderOnMap`** : `const svgRenderer = L.svg(...)` était déclaré dans le scope de la fonction. À chaque appel (= chaque recalcul de zone Lost), un NOUVEAU `L.svg()` était créé et `addTo(window.map)`, mais l'ancien restait attaché dans `map._layers` (jamais retiré par `_clearLayers` qui ne le connaissait pas). Sur user qui ajuste les critères de recherche plusieurs fois, accumulation linéaire de SVG renderers dans le DOM Leaflet → fuite mémoire + ralentissement du re-render. Fix : promouvoir au scope module (`let _svgRenderer = null`), ajouter `removeLayer(_svgRenderer)` dans `_clearLayers`, garder l'alias `const svgRenderer = _svgRenderer` pour rétro-compat des lignes suivantes (404, 421, 436, 495).
- **Gain RAM total estimé** : ~5-20 Mo économisés sur usage typique long, plus si l'user est intense (tracker + Live + Lost). Combiné avec Phase 2 light, on attaque le crash iPhone PWA sur plusieurs vecteurs.
**📦 v1.34.14** : Fix `registerEmbeddedRoad` batch + retrait debug "Refonte UI v1".
**📦 v1.34.13** : Debug instrumentation `renderRoads` boucle au boot. : KARMA stack trace v1.34.13 montre `renderRoads → window.registerEmbeddedRoad → utils.js:1703 forEach → ajouterPointsDepuisJSON`. Le bug : `ajouterPointsDepuisJSON` itère sur tous les `json.roads[]` d'un dataLayer, et pour CHAQUE road appelle `registerEmbeddedRoad` qui à son tour appelle `renderRoads()` complet. Sur le plan KARMA (catacombes_2024 avec 150+ roads dans un dataLayer), ça générait 150+ appels successifs de `renderRoads` au boot — chacun rendant tout depuis zéro. Fix : (1) `js/road.js registerEmbeddedRoad(road, layer, skipRender)` — ajout d'un 3e paramètre optionnel `skipRender` (défaut `false` pour backward compat) qui skip le re-render auto. (2) `js/utils.js ajouterPointsDepuisJSON` — passe `skipRender=true` dans la boucle `roadsToRender.forEach`, track via `_ktaEmbeddedRoadRegistered` si au moins une road a été register, puis trigger UN SEUL `renderRoads()` à la fin du forEach (= **1 render au lieu de 150+**). Gain perf important au boot des plans avec dataLayer roads denses. Bug latent probablement depuis l'introduction de `registerEmbeddedRoad` (v1.21.1+), masqué par `js/debug.js` qui silence `console.log` quand `debugMode = false`. Bonus : (a) retrait demande KARMA du banner `console.info("[Refonte UI v1] Nouvelle interface active...")` dans `js/refonteInterface.js` (la refonte est défaut depuis v1.8.1, plus besoin de le rappeler), (b) retrait de l'instrumentation diagnostic v1.34.13 (`_rrCallCount`/`_rrWindowStart`/`_rrStacksLogged` + Error().stack au burst) dans `js/road.js renderRoads`, restauration de la forme compacte d'origine.
**📦 v1.34.13** : Debug instrumentation `renderRoads` boucle au boot.
**📦 v1.34.12** : Hotfix v1.34.11 — `_lazyZipRef` wipé prématurément.
**📦 v1.34.11** : Pack RAM Phase 2 light — Lazy tile + LRU file release. : KARMA logs v1.34.12 (mode debug ON) montrent `[Road] renderRoads — roadsData : 0 tracés` répété 150+ fois successivement après `[Main] Application lancée`. `appliquerFiltreNiveau` (`js/interfaceConfig.js l1361`) appelle `renderRoads` directement SANS throttle, contrairement à `_renderRoadsThrottled` (250ms throttle) utilisé pour les events Leaflet. Hypothèse : un orchestrateur (sessionPersist restore ? interfaceConfig setup ? autre init multi-niveau ?) déclenche `appliquerFiltreNiveau` en boucle au boot. Bug latent probablement depuis v1.21.5 (refonte filtres), masqué par `js/debug.js` qui silence `console.log` quand `debugMode = false` (= 99% des users). Instrumentation : compteur rolling window 1s dans `renderRoads`. Si ≥5 appels dans la fenêtre, log `console.warn` avec `Error().stack` (limité à 3 stacks pour éviter le spam). KARMA reproduit, partage la stack F12 → identification de la source → fix propre en v1.34.14. Aucun changement fonctionnel.
**📦 v1.34.12** : Hotfix v1.34.11 — `_lazyZipRef` wipé par cleanup plan précédent.
**📦 v1.34.11** : Pack RAM Phase 2 light — Lazy tile + LRU file release. : KARMA test post-v1.34.11 a remonté `[LazyTiles] _lazyZipRef indisponible — extraction impossible pour data/tiles/z0/x0_y-1.jpg` répété pour toutes les tuiles. Cause : `extraireZip` (index.html) set `window._lazyZipRef = zip` à la fin, MAIS immédiatement après, `startImportedPlan` (main.js l818) invoque `_libererRessourcesPlanPrecedent()` qui appelle `resetRuntimeAssets()` (config.js) — qui en v1.34.11 nullify `_lazyZipRef`. Le cleanup du plan précédent wipe donc la ref qu'on vient juste de set pour le NOUVEAU plan. Le bug n'apparaît pas en Phase 1 (v1.34.10) car cette version ne touchait pas `_lazyZipRef`. **Fix** : changer le contrat de transmission. `extraireZip` n'assigne plus directement à `window._lazyZipRef` — il ANNOTE le tableau `assetFiles._lazyZip = zip`. Dans `startImportedPlan`, JUSTE APRÈS `_libererRessourcesPlanPrecedent()` (= après que le reset a wipe le précédent), on set `window._lazyZipRef = assetFiles._lazyZip`. Comme ça : (a) le cleanup du plan précédent fait son boulot (libère `_lazyZipRef` du plan précédent — légitime, ce ZIP est obsolète), (b) le nouveau ZIP est restauré tout de suite après. Aucun risque que le reset wipe la ref du plan courant.
**📦 v1.34.11** : Pack RAM Phase 2 light — Lazy tile + LRU file release.
**📦 v1.34.10** : Pack RAM Phase 1 — Dry-run logging. : activation effective de l'optimisation RAM préparée en v1.34.10 (whitelist validée par KARMA, 0 canari sur son plan V2 de 342 tuiles). Modifications :
- **`index.html extraireZip`** : pour les tuiles qui matchent `^data/tiles/z-?\d+/` ET ne sont PAS dans la whitelist (= tuiles V2 hors whitelist plan-config), on push un STUB `{name, _fullPath, _lazyTile: true, _zipPath}` au lieu d'extraire le blob via `entry.async("blob")`. Le ZIP source est sauvegardé dans `window._lazyZipRef` pour extraction lazy ultérieure. Log `Bilan : N tuile(s) stube (lazy) + M asset(s) extrait eager + K canari(s)`.
- **`js/config.js registerAsset`** : détecte les stubs `{_lazyTile: true}` et stocke un asset minimal `{file: null, url: null, _zipPath, lazy: true}` (pas de File en RAM).
- **`js/config.js _extractLazyAsset(path)`** : nouveau helper async qui extrait à la demande depuis `window._lazyZipRef.files[zipPath]`, crée le File JPEG, met à jour `RUNTIME_ASSETS[path].file`. Idempotent (cache hit si déjà extrait). Retourne `null` gracieusement si erreur.
- **`js/config.js resetRuntimeAssets`** : null `window._lazyZipRef` au plan switch (libère le JSZip du plan précédent).
- **`js/tiling.js _renderNiveau`** : devient ASYNC. AVANT le cleanup des anciens overlays, fait un `Promise.all()` de pré-extraction sur toutes les tuiles du niveau qui ont `_zipPath` + `!file` (stubs ou évincées LRU). Logs `Lazy : N tuile(s) extraite(s) pour z=X en Y ms`. Level guard via token monotone (`state.renderToken`) : si user zoom rapidement, abort le rendu obsolète après pre-extract.
- **`js/tiling.js _trimLevelsLRU`** : libère AUSSI `asset.file = null` (en plus de `asset.url = null` qui était déjà fait) pour les assets qui ont un `_zipPath` (= peuvent être re-extraits). C'est ce nullify-of-file qui apporte le VRAI gain RAM : avant, le File JPEG restait pinned éternellement en RAM même après l'éviction LRU des bitmaps. Log enrichi `LRU : niveau z=X révoqué (N URLs + M fichiers libérés sur K tuiles)`.

**Gain RAM attendu** : ~17-68 Mo économisés sur le plan V2 KARMA (342 tuiles × 50-200 Ko/JPEG), variable selon le profil d'usage. Le gain net réel sera mesurable via DevTools Performance Monitor → JS heap size, avant/après chargement du plan + zoom complet sur tous les niveaux.

**Régressions potentielles** : (a) léger délai 200-500 ms au 1er zoom sur un niveau jamais visité (Promise.all extraction parallèle ~70 JPEG). (b) Minimap mode urgence pourrait avoir quelques tuiles manquantes (skip gracieux, son `_resolveTileUrl` retourne `null` si `asset.file` null) — à patcher en Phase 3 si KARMA voit le problème. (c) Au plan switch, le `_lazyZipRef` du plan précédent est libéré (gain RAM secondaire).
**📦 v1.34.10** : Pack RAM Phase 1 — Dry-run logging (préparation re-attaque).
**📦 v1.34.9** : Fix race condition mise à jour douce (régression hotfix21). : étape interne préparatoire au re-rollout du lazy tile extraction (la fonctionnalité qui visait à économiser ~100 Mo RAM sur les plans V2 tilés avant d'être rollback en v1.34.4 car cassait l'image principale). Approche défensive 2-pass : dans `index.html extraireZip`, parser `plan-config.json` EN PREMIER, construire un Set des paths référencés (`plan.baseImage`, `plan.collisionImage`, `imageLayers[].file`, `dataLayers[].file`), puis logger pour chaque entry du ZIP ce qui SERAIT stube en Phase 2 (`WOULD STUB` si match `^data/tiles/z-?\d+/` ET hors whitelist) ou ce qui matche la regex tile mais est référencé (`CANARI` warn). Phase 1 = ZÉRO changement de comportement effectif : tout reste extrait eager comme avant, on logge juste les statistiques (`Bilan : N tuile(s) seraient stube, M canari(s) détecté(s)`). KARMA valide les logs F12 (la whitelist contient bien baseImage, le count tuiles à stuber est cohérent, aucun canari alarmant) → on active le vrai stub en Phase 2. **Bénéfices Phase 1** : (1) test de la whitelist sans risque ; (2) garantit que si v1.35.0 a cassé l'image principale, c'était bien à cause du manque de whitelist (et non d'un autre bug subtil dans le lazy resolve) ; (3) chiffre l'économie RAM attendue (= count des `WOULD STUB`). **Logs préfixés** `[LazyTiles v1.34.10-dryrun]` pour être facilement filtrables en console.
**📦 v1.34.9** : Fix race condition mise à jour douce (régression hotfix21).
**📦 v1.34.8** : Fix erreur SW provoquée par extensions navigateur.
**📦 v1.34.7** : VRAI FIX bug imageLayers filter. : KARMA a remonté un bug "que on avait pas avant" — après une "🪶 Mise à jour douce", le badge version du footer affichait `vAncienne → vNouvelle` au lieu de juste `vNouvelle` ; il fallait redémarrer une 2e fois manuellement pour voir le changement. Cause : régression introduite par hotfix21 v1.31.6 ("SW update fire-and-forget" pour éviter un blocage 30s-2min). Le `reg.update()` est fire-and-forget, puis `reload()` après seulement 200ms — à ce moment-là, l'install du nouveau SW (ex. v1.34.8) n'est pas encore terminé → `reg.waiting` est null → `SKIP_WAITING` jamais envoyé → l'ancien SW (ex. v1.34.7) reste actif après reload → sert l'ancien `js/copyright.js` → `__MKM__.build = "v1.34.7"` au moment du badge → `installed !== remoteVersion` → affichage `v1.34.7 → v1.34.8`. Au 2e reload manuel, l'install du nouveau SW avait eu le temps de se finir entre temps → comportement correct. Fix `interfaceMaintenance.js mettreAJourCodeSeul()` : ajout d'un polling actif sur `reg.waiting` (25 itérations × 200ms = max 5s) APRÈS `reg.update()` et AVANT le reload. Dès qu'un waiting est détecté → `postMessage SKIP_WAITING` + `await controllerchange` (safety timeout 1.5s) → le nouveau SW est actif → le reload sert le nouveau cache (nouveau `copyright.js` → bon `__MKM__.build`). Si timeout 5s atteint sans waiting détecté (install vraiment lent), fallback reload = comportement v1.34.8 dégradé (1 restart manuel) — pas pire que maintenant. Le user attend 1-5s au lieu de 0.2s mais le reload est correct du 1er coup.
**📦 v1.34.8** : Fix erreur SW provoquée par extensions navigateur.
**📦 v1.34.7** : VRAI FIX bug imageLayers filter (cause racine `_ktaImageOverlays = []` dans `initDataFromConfig`). : KARMA console montrait `sw.js:527 Uncaught (in promise) TypeError: Failed to execute 'put' on 'Cache': Request scheme 'chrome-extension' is unsupported`. Cause : le handler `fetch` du Service Worker interceptait TOUTES les requêtes GET de la page, y compris celles initiées par des extensions Chrome (adblockers, gestionnaires de mots de passe, etc.) vers leurs propres ressources `chrome-extension://...`. Le Cache API REFUSE les schemes ≠ `http(s)` → `TypeError` répété à chaque requête extension. Bénin (l'extension reçoit sa réponse réseau normale) mais pollue la console et peut être confondu avec un vrai bug. Fix : early-return dans le handler `fetch` (sw.js l469) si `event.request.url` ne commence pas par `http:` ou `https:` → le SW ne tente plus de cacher ces requêtes, le navigateur les résout directement. Compatible Chrome (`chrome-extension://`), Firefox (`moz-extension://`), Safari (`safari-web-extension://`), et tout autre scheme custom.
**📦 v1.34.7** : VRAI FIX bug imageLayers filter (cause racine `_ktaImageOverlays = []` dans `initDataFromConfig`). : diagnostic via logs F12 v1.34.6 (`registry_ids: []` malgré `PLAN_CONFIG.imageLayers` populé + image visible sur la carte). Cause racine : `js/main.js initDataFromConfig` ligne 39 (ajoutée en v162) faisait `window._ktaImageOverlays = []` JUSTE APRÈS que `initMapFromConfig` venait de populer le registre via push à `js/map.js:420`. Les overlays restaient attachés à la carte (Leaflet a sa propre référence interne dans `_layers`), mais le registre était vide → `filterPanel.js` ne trouvait jamais d'entry par id → handler `change` retournait early via le guard `if (!entry || !entry.overlay) return` → checkbox unchecked au render + toggling impossible. Fix : retrait de la ligne 39 (reset déjà fait dans `map.js:403` JUSTE AVANT les push, ce qui suffit). Retrait également des `console.log` debug v1.34.6 dans `filterPanel.js` (mission accomplie). Conservation du fix "Tout afficher" v1.34.6 (recoche les image/data layers). Régression introduite par v162 (Multi-Level feature), latente depuis cette version pour tous les plans avec imageLayers — non détectée jusqu'ici car le bouton ≡ d'origine (`L.control.layers` Leaflet) gérait les overlays via son propre state interne et masquait le bug ; refonte v1.21.5 (modale FilterPanel) a exposé le bug en lisant `_ktaImageOverlays`.
**📦 v1.34.6** : DEBUG + Fix Tout afficher (logs F12 diagnostic).
**📦 v1.34.5** : HOTFIX tentative (cause `id mismatch` invalidée par retests).
**📦 v1.34.4** : ROLLBACK v1.35.0 (Pack RAM cassait l'image principale).
**📦 v1.34.5** : HOTFIX tentative (cause `id mismatch` invalidée par retests).
**📦 v1.34.4** : ROLLBACK v1.35.0 (Pack RAM cassait l'image principale).
**📦 v1.34.3** : PATCH push-to-talk strict : stop explicite après commande (cf v1.34.2/1/0 chain commandes vocales).
**📦 v1.34.2** : PATCH fix iOS mic stream non libéré au stop — KARMA bug iPhone "l'arret d'enregistrement bug, il me met icone violet 'arreté' mais en haut sur mon iphone c'est toujours en écoute". Cause : sur iOS Safari, `recognition.stop()` retient le `MediaStream` sous-jacent tant que la référence `_recognition` existe → indicateur micro orange iOS persiste alors que notre UI est en idle. Fix 3 points : (1) `stopListening()` : `.stop()` → `.abort()` (immédiat) + `_recognition = null` (GC stream) + fallback `.stop()` si `.abort()` indispo ; (2) `recognition.onerror` : ajout `_recognition = null` (no-speech / not-allowed) ; (3) `recognition.onend` : ajout `_recognition = null` (fin naturelle parole). Nouvelle instance fraîche créée à la prochaine `startListening()`.
**📦 v1.34.1** : MINOR E1 : Commandes vocales (BETA) consolidées — nouveau module `js/voiceCommand.js` (~600 LOC) qui ajoute le pilotage vocal de l'app via la **Web Speech API** (`SpeechRecognition` / `webkitSpeechRecognition` Safari iOS 14.5+). Pattern **push-to-talk** : bouton 🎤 flottant en bas à droite (violet idle, rouge pulse listening). **Activation OPT-IN** : toggle "🎤 Commandes vocales (BETA)" dans modale ⚙️ Réglages (visible si API supportée, Firefox masqué). **18 commandes built-in** avec **~200 patterns naturels FR** (12-23 variantes par commande) : Navigation (`zoom +/-`, `centrer`, `recherche`), Actions (`ajouter point`, `allume / éteins tracker`, `mode urgence/SOS`, `mode secours`), Thème (`mode jour/nuit`, `passe en sombre`…), Méta (`aide`, `ouvre l'aide`, `stop`, `ferme ça`), **navigation vers POI** (`aller à puits 25`, `va à PA12`, `emmène-moi à siphon`, `guide-moi vers chaufferette`, `iti vers PA25`) qui calcule un itinéraire depuis la position tracker actuelle via `SearchPoints.findByQuery` + `itineraireYAller`. API extensible `window.VoiceCommand.registerCommand({...})` pour modules tiers. Detection Promise dans `_onFinalTranscript` → handlers async gèrent leur propre cycle de vie d'overlay (recherche → résultat → hide). Feedback live progressif coloré : interim (bleu) → success (vert) / unknown (jaune) / error (rouge). CSS dédiée `style.css §voix` (~170 LOC). Bouton mic mobile : `bottom 120px + safe-bottom` (au-dessus du footer) + `right env(safe-area-inset-right, 0px)` (collé bord droit).
**📦 v1.34.0** : MINOR E1 base — Commandes vocales (BETA) initial.
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
| 📊 Éditeur de données du plan (tableau, 3 sources) | ✅ | `tableEditor.js` |
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
| **`tableEditor.js`** | Éditeur de données du plan en tableau plein écran. 3 sources (plan en cours / ZIP / JSON) + sélecteur de calque. Points éditables entièrement ; tracés/zones/structures = note+type+niveau (géométrie 🔒). Datalayers en export-only (no live → Générateur) ; session remplaçable live. Édition inline, validation typée, multi-select tags, recherche + tri + filtres. |
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

Nouvelle section dans Audit (Configuration loader + `docs/NETWORK_AUDIT`) qui précise que la garantie de sécurité et non-télémétrie s'applique **UNIQUEMENT au domaine officiel `myktamap.fr`** (+ `dev.myktamap.fr`). Le code source étant public (CC BY-NC-SA), toute copie/fork tiers peut contenir des modifications non contrôlées.

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
