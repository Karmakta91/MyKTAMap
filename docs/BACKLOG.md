# 📋 Backlog & dettes — MyKTAMap

> Fichier de travail KARMA ↔ Claude. **Ce n'est pas un journal** (ça, c'est `README.md`) : ici on ne garde que ce qui est **ouvert**. Une entrée soldée est **supprimée**, pas barrée — son histoire vit dans le journal et les commits.
>
> **Dernier grand ménage : 29/09/2026, 2 fois** (tour complet + QCM KARMA, puis après les vagues Secours et les
> audits doc / thème du soir). Tout ce qui était soldé est sorti ; ce qui a été
> abandonné volontairement est passé dans **🚫 Enterré**. Les versions antérieures de ce fichier restent lisibles dans
> l'historique Git (`git log -p docs/BACKLOG.md`) — c'est là que vivent les mesures détaillées des chantiers clos
> (atlas Gironde, audit icônes, plan orienté…).

## ⚠️ Règle de vérification (à lire avant d'utiliser ce fichier)

Le 01/08/2026, un inventaire de dettes sourcé depuis la doc s'est révélé **faux à 30 %** : 3 dettes sur 10 étaient déjà payées. Cause : les docs du repo sont des **logs append-only** où une entrée ancienne pose une limitation qu'une entrée ultérieure lève, sans renvoi entre les deux — y compris les en-têtes de modules `js/`.

**Donc chaque entrée ici porte son niveau de preuve** :

| Tag | Sens |
|---|---|
| ✅ **vérifié** | confirmé dans le CODE à la date indiquée |
| ⚠️ **doc seule** | lu dans une doc, **jamais recoupé au code** — à vérifier avant d'agir |
| 🔬 **hypothèse** | piste identifiée, non testée en runtime |

**Avant de traiter une entrée** : `grep` le symbole dans `js/`, vérifier le chargement dans `index.html` et la présence dans `sw.js > ASSETS_TO_CACHE`. Puis mettre le tag à jour.

**La règle vaut dans les DEUX SENS** (ajouté le 31/08/2026, après récidive) : une entrée qui traîne alors qu'elle est **soldée** coûte aussi cher qu'une dette ignorée — elle fait recommander un chantier déjà fait (cas réel du 31/08 : « la vague 3 du résolveur de styles », terminée depuis v1.76.0, reproposée parce que sa section n'avait jamais été reclose). Quand un lot tombe, **reclore la section le jour même** : ni « 🔜 vagues suivantes » orphelin, ni tableau de suivi laissé ouvert. Le seul état stable de ce fichier est *ouvert*.

---

## 📱 À tester sur appareil — le harnais ne sait pas le faire

- **M2 — Lockout temporisé** (PIN `pinLock.js` + gate `unlockGate.js`, codé le 13/09) : 5 codes faux → compte à
  rebours → retour automatique du pavé. Base de temps = horloge de l'appareil (`security-legal.md` §36.3).
- **B5 — Stockage saturé** (livré le 13/09) : bandeau persistant + bouton 💾 Exporter tant que la sauvegarde
  échoue. Non reproductible au harnais (quota) : saturer le stockage d'un téléphone de test.
- **Mode Secours v1.98.14-15 sur iPhone** : phases lisibles, bouton « Éditer » sombre ; intervention lancée en
  équipier → fenêtre fermée : zone + tracé + pastille « 🚨 Secours · … › » ; toucher un POI pour l'entrée le prend
  (pas de fiche) ; **GPS en vue équipier** (seule vue que le test n'a pas atteinte).
- ⚠️ **Toujours tester APRÈS un bump** : le service worker ne change de cache qu'au bump de `CACHE_NAME`. Entre deux
  commits, un téléphone qui a déjà chargé l'app garde l'ancien JS — c'est ce qui a fait voir à KARMA un « tourner à
  gauche » déjà corrigé (27/09/2026).
- La validation **iOS/Safari** d'un changement de rendu vit dans `docs/RELEASE_GATE.md`, pas ici.

## 🔎 Performance sur relevé lourd — mesuré le 26/09/2026, gardé

Mesures sur un vrai plan tuilé (16332×13820, 864 tuiles au niveau 0, 912 tracés).

- 🟡 **Export image : le fond est retéléchargé** (image de 42 Mo) alors que 30 Mo de tuiles sont déjà sur l’appareil.

## 🪧 Guidage de l'itinéraire — ce qui reste (29/09/2026)

Livré en v1.98.0 (`docs/ETUDE_GUIDAGE.md`, archi : `docs/architecture/tracking.md` §Guidage). Les deux choix faits
par Claude en sortie d'urgence (bandeau affiché même réglé sur « Jamais », « Y aller » sans demande de remplacement)
ont été **validés par KARMA le 29/09**. Reste :

- 🟡 **Itinéraires inter-plans non couverts** : `interPlanRoute.js` crée ses roads sans `raccords` / `carrefours`
  → pas de pointillé, raccord non compté, et le bandeau n'y dit que l'arrivée (aucun croisement connu). Brancher
  `_champsGuidage`. ⚠️ doc seule (non re-vérifié le 29/09).
- **Mode Secours** : le module ne crée **aucune** road → c'est **B1**, vague 6 de la section 🚑 ci-dessous.

## 🚑 Mode Secours — la refonte qui reste (audit du 29/09/2026)

Rapport : [`docs/audits/2026-09-29_audit-secours-v1.md`](audits/2026-09-29_audit-secours-v1.md). Les **correctifs**
(vagues 1 à 4bis, 4 relectures adversariales), les **retours terrain iPhone** et les **vagues 5 à 7** (victime, retards, rappel ; guidage ; main courante, remontés, secouriste ; parcours par phase, couverture, hors-ligne) sont livrés de v1.98.5 à v1.98.20 —
détail dans le journal du `README.md`. Reste : la vague 8 (lot C) et deux compléments, à ouvrir quand le terrain le demande ;
un commit par case, un bump par vague. **Toucher `secoursMode.js` = migrer ses `alert()`/`confirm()` au passage**
(cf. 📋 Popups natives).

| Vague | Contenu |
|---|---|
| 8 — Plus tard | lot C |

- **Vague 8b — couverture honnête** (contre-audits du 30/09) : deux chiffres, « dans une zone » ET « sur un parcours »,
  **par niveau**, + linéaire affecté à deux équipes, + galeries hors parcours surlignées sur la carte. Mesuré sur le
  scénario réel : 93 % en zone, 21-24 % sur un parcours, −1 : 80 % contre 4,9 %. **S-M**
- **Vague 8b — zones liées à un niveau** : polygone rattaché à un niveau (ou « tous »), alerte « galeries au −1, aucun
  parcours n'y descend ». **M**
- **Donnée (KARMA seul)** : taguer les vrais accès du plan et leur état, donner un niveau aux 18 POI d'accès et aux 47
  tracés sans niveau, ajouter un 3ᵉ point de calage GPS (l'erreur du calage à 2 points n'est pas mesurable).
- **Cartes PDF nettes sur un grand plan** (test terrain 30/09) : le plan entier est rendu sous 16 Mpx (limite Safari iOS) puis
  recadré — sur Pandemonium, 20 % de sa résolution ; les noms de galeries restent flous sur une grande zone. Rendre chaque
  zone (et la carte des accès) directement depuis les tuiles V2, à sa propre échelle. **M-L**
- **Briefing pompiers — capture OSM sans accord OSM** : **décidé le 30/09 par KARMA — laissé en l'état** (l'accord OSM
  est activé par défaut et rarement coupé). À savoir : sans accord, la capture charge quand même les tuiles
  `tile.openstreetmap.org` — `NETWORK_AUDIT` ne le dit pas. Ne pas reproposer sans élément nouveau.
- **Options brancard pour « 🚑 Évacuer »** (reste de A3, livré en v1.98.16 sans elles) : éviter l'eau et les remblais,
  lever les inaccessibles — brancher les zones à éviter dans le calcul de la Sortie d'urgence. **S-M**
- **Si un exercice le demande** : préparer le parcours de la phase 2 pendant la phase 1 (option 6:b écartée pour l'instant) **L**.
- **Lot C (plus tard)** : C1 découpage auto en secteurs + parcours de balayage (après B3) **L** · C2 gabarit brancard
  (modèle des tracés + Générateur) **L** · C3 rôle par personne en **liste fermée**, jamais créable — seulement si des
  exercices le réclament **M**.

⚠️ **Côté DATA (KARMA seul)** : le plan de test n'a qu'un accès ouvert tagué et aucun `entree_plan` ; 47 tracés et
44 POI sans niveau. Le moins cher des correctifs, et le seul qu'aucun code ne remplace.

## 🎨 Thème et langues — reliquats des audits du 29/09/2026

Corrections livrées en v1.98.13 (journal `README.md`). Reste :

- **À trancher (KARMA)** — gris charte `#8892a4` des libellés des cartes Secours en **sombre** : contraste 3,8–4,1
  (< 4,5). Garder, ou passer ces libellés en `#a8b3c8`. Couleur de la charte → pas de changement sans accord.
- **FR en dur hors des modules audités** : le détecteur `scripts/find-hardcoded-fr.js` sort ~960 candidats (plancher
  connu de faux positifs ~560) ; seuls Secours, guidage, accueil et Documentation ont été triés. Même politique que
  les popups : **au fil de l'eau**, quand on touche un module.
- 🟡 Étiquette de la carte OSM du briefing Secours toujours sombre (`secoursMode.js`, inline) — lisible dans les deux
  thèmes, cosmétique.

## 📋 Popups natives et presse-papier — au fil de l'eau (recompté le 29/09/2026)

Politique arrêtée : **pas de sweep massif**, on migre quand on touche le module. Nouveaux usages : les helpers
obligatoires.

- **`alert()` / `confirm()` natifs** : ~175 `alert()` et ~37 `confirm()` dans `js/` (grep brut, commentaires
  compris), hors charte et hors du réglage de notifications. `window.ktaConfirm` (utils.js, Promise + charte) est
  déjà utilisé par 13 fichiers. `secoursMode.js` reste le premier contributeur : le plus d'effet, le plus de risque.
  ⚠️ `ktaConfirm` est **asynchrone** : le code qui suit un `if (!confirm(...)) return;` doit passer en `.then()`.
- **Copies locales du presse-papier** : `window.ktaCopierTexte(txt)` (utils.js, v1.97.10) existe ; une dizaine de
  fichiers gardent leur propre `navigator.clipboard` (`debug`, `homeConfig`, `interfaceDocs`, `lostMode`,
  `memInspector`, `osmCoords`, `refonteInterface`, `secoursMode`, `sessionReport`, `statsGlobales`). Chaque site a
  son propre retour visuel (toast, texte in situ, `alert`) : **un par un**, en vérifiant le retour. ⚠️ `memInspector`
  et `debug` servent au diagnostic : les casser rendrait un rapport de crash incopiable.

## 🎨 Harmoniser les icônes par défaut — gardé de côté, non prioritaire

Demande KARMA du 26/09 : unifier les icônes par défaut (« avoir des trucs vecto telles que portail, ou entrée
plan »). L'étage 1 (catalogue, 404, `entree_plan`) est **soldé en v1.97.9**. Mis de côté le 29/09, sans arbitrage.
Si on le rouvre, trois faits mesurés à ne pas repayer :

- **Le 🌀 vs `portail.png`** : le même objet a deux visages — PNG sur la carte, la légende, les filtres, la Vue OSM
  et les exports ; emoji 🌀 dans les liaisons, la popup de création, « Mes liaisons », l'itinéraire inter-plan et le
  filtre OSM du HOME.
- 🔴 **Verrou avant toute vectorisation** : `kmzExport.js` écrit le blob dans `files/icons/<tag>.png` **sans
  regarder son type** → un SVG part sous un nom `.png` et Google Earth ne l'affiche pas, sans message. Rasteriser
  d'abord (~15 lignes).
- 🔴 **Piège de migration** : `utils.js` fait gagner `PLAN_CONFIG.icons[tag]` **avant** le catalogue. Les plans
  déployés déclarent `icon/pa.png` → un catalogue passé en `.svg` n'apparaîtrait sur **aucun** plan existant.

⚠️ **Côté DATA (KARMA seul)** : les `plan-config.json` générés avant v1.97.9 gardent une valeur fautive pour
`entree_plan` et n'ont pas `iconsEmbarquees`. L'app les rattrape à l'ouverture, mais les 21 sondes 404 restent :
**régénérer chaque plan** est le seul nettoyage.

## 📝 Stratégie doc — à trancher par KARMA

Une source / trois rendus (guide utilisateur, Aide intégrée, contexte IA) + garde-fou pré-commit sur les libellés
cités (§6.7 de `docs/audits/2026-09-13_audit-ergonomie-v1.md` (archivé : tag Git `archive-docs-2026-09-30`)). Depuis, `check-doc-langues.js` (v1.98.0) aligne
déjà les trois langues du guide ; il ne relie pas le guide à l'Aide intégrée.

## 💡 Pistes de features

| Piste | Valeur | État |
|---|---|---|
| **Import VisualTopo (`.tro`)** | la cible **spéléo** de `CLAUDE.md` n'a aucun format topo lisible | gardé — à lancer |
| **Export de profil en flux** | `showSaveFilePicker` + `generateInternalStream` (Chrome/Edge desktop) pour réduire le pic RAM de `generateAsync` sur les très gros exports | gardé — si un cas réel le demande |

**VisualTopo** — l'app ne lit **aucun** format de topographie (ni VisualTopo, ni Therion, ni Compass, ni Survex ;
`FORMATS_ACCEPTES = ".geojson,.json,.kml,.kmz"`). Le socle existe : `sigImport.js` (parsers, écran de
correspondance) et `GpxImport.genererCanvasVierge` (plan sans image de fond). Un `.tro` est du texte tabulé
(départ, arrivée, longueur, azimut, pente) : trigonométrie simple → points + polylignes. ⚠️ **À confirmer avant
de coder** : que VisualTopo soit bien le format le plus répandu chez les cataphiles et spéléos français —
*[Supposition]* de Claude.

## 🧹 Code mort — ce qui reste de l'audit du 09/08/2026

> Les lots ①②③④ sont exécutés (09/08) et le CSS mort du chargeur retiré (29/09). Ne restent ici que ce qui est
> ouvert (🟡), ce qui ne doit jamais être supprimé (📌) et les deux leçons qui protègent le prochain nettoyage.
> ⚠️ Les numéros de ligne ont dérivé : les re-vérifier avant d'agir.

**⚠️ Correctif d'inventaire** : sur 76 paires de sélecteurs CSS dupliqués signalées le 09/08, **8 seulement sont
intégralement mortes** — le reste est du *layering volontaire* (override **partiel**). Toute suppression de
jumelle se vérifie **propriété par propriété**, et tout retrait se fait **sélecteur par sélecteur**, jamais par
plage de lignes (`.kta-perf-titre` et `.kta-loader-perf-hint`, vivants, étaient entrelacés dans des blocs morts).

**🩸 Leçon du faux fix (révoqué en v1.77.0)** : `_revokeTilesBlobUrls()` d'`osmHomePreview` était « jamais appelé
malgré son commentaire », donc branché — à tort : il révoquait les URLs du plan A **encore affiché** au chargement
d'un plan B. **« Jamais appelé » ≠ « à appeler ». Vérifier le DESIGN avant de brancher un cleanup.**

### 🟡 À vérifier avant de toucher
- Fragments de sélecteurs morts dans des groupes vivants (supprimer la ligne du sélecteur, pas le bloc) : `.kta-btn-action`, `.plan-card` ×4, `.kta-modal-btn-*`, `.kta-mesure-distance`, `.drag-over`, `.kta-rd-total-pill`, `style-secours.css` — contrôle runtime (`querySelectorAll(...).length === 0`)
- `kta-toast-error/info` : classes **concaténées** (`"kta-toast-" + type`) — NON supprimables sans inventaire des `type`
- JS : événement `kta:imgLayerCalibChange` (0 listener — extension volontaire ?), `getTrackerLevel` (« phase 2B » — abandonnée ?), ~13 exports d'API publique jamais consommés (API = contrat, gain faible risque non nul)

### 📌 Mort documenté — gardé exprès, ne pas supprimer sans arbitrage KARMA
`_renderMultiLevelSection`/`_bindMultiLevelToggle` (interfaceConfig, rétro-compat v1.7.3) · wrappers compat exporter/measure · `_proHashShort`/`_proSourceLabel` · dispatch `mktm:secours-scenario-mutated` (point d'extension pro) · `__ktaStyleCanon` (diagnostic) · `PERF_MODE_SIZE_BYTES` (alias rétro-compat) · `__MKTM_PRO_LICENSE__` (contrat d'en-tête) · branche mono-alerte d'alertChecker (**garde-fou réseau légitime** : une instance auto-hébergée peut servir l'ancien format) · `ktaCouperModesOutils` (console/debug)

### ✅ Résultats négatifs (hygiène confirmée, rien à faire)
Script local d'`index.html` = entrée du pré-cache : **tenu par `check-html-integrite.js` §5** depuis le 29/09 (un
module manquait, `planOffline.js`) · les 4 CSS lazy parfaitement cloisonnés (0 duplication avec style.css) · 0 id
HTML orphelin.

---

## 🔴 Dettes ouvertes

> Rangées par **qui doit agir**. Une dette « bloquée sur KARMA » n'attend pas du code — elle attend une mesure sur
> sa machine, parce que le harnais ne sait pas la reproduire. Les entrées « aucune action » ne sont **pas** des
> dettes : ce sont des décisions déjà prises, gardées ici pour qu'on ne les re-signale pas comme des trous.

| # | Sujet | État | Qui débloque |
|---|---|---|---|
| **D-light-icons** | Thème clair PC : émojis hors cadre à zoom 100 % | 🔬 non reproduit au harnais | **KARMA** — capture DevTools |
| **D3** | Toggle « Mes annotations » ne masque pas les roads | 🔬 mécanisme corroboré, non reproduit | **KARMA** — un `hasLayer()` sur un plan réel |
| **D-confirm** | `confirm()` natifs hors charte | 📋 au fil de l'eau — cf. **📋 Popups natives** | personne |
| **D0** | Magnétisme : rayon non plafonné en unités plan | ⚪ décision prise (v1.74.0) + désaccord consigné | aucune action |
| **D4** | `<script>` inline d'`index.html` | ⚪ description périmée, re-mesurée le 31/08 | aucune action |
| **D7** | Duplication ~2 fonctions (pickers géoréf ↔ tracker) | ⚪ seuil explicite non atteint | aucune action |
| **D8** | `secoursPlan.groupes[].statut` | ⚪ faux positif : le champ est exploité | aucune action |

### 🟠 Bloquées sur KARMA — une mesure à faire, pas de code

*Les deux sont **non reproductibles au harnais Playwright**. Les rouvrir sans mesure fraîche, c'est répéter le faux
fix de la v1.77.0.*

#### D-light-icons — 🎨 Thème clair PC : les émojis sortent du cadre à zoom 100 %, OK à 90 % — noté 09/08/2026

🔬 **hypothèse** — chez KARMA (Chrome FullHD, thème clair, wallpaper actif), les émojis en tête des boutons/titres de la colonne Actions (📦 Ajouter un plan, 🧰 Outils, 📔 Mon carnet, 🌀 Mes liaisons…) s'affichent **détachés du texte, à cheval sur le bord gauche** de leur conteneur. Disparaît à **zoom 90 %**. **NON REPRODUIT au harnais** malgré : clair + wallpaper simulé + 1920×937 + 1536×750 @ deviceScaleFactor 1.25. CSS servi sur dev **bit-à-bit identique** au repo. Pistes : extension navigateur injectant du CSS sur les sites clairs (test navigation privée pas fait), rendu Segoe UI Emoji à échelle fractionnaire (scaling Windows 125 %), largeur réelle de la colonne au moment du bug. Cosmétique, contournement connu (zoom 90 %) — à reprendre avec une capture DevTools (Computed de `text-indent`/`display` sur un bouton touché).

#### D3 — 🗺️ Toggle « Mes annotations » ne masque pas les polylines roads

🔬 **hypothèse — mécanisme corroboré par le code le 31/08.** `road.js` fait `return window.layerEditor || window.map` : si `layerEditor` n'existe pas encore au moment de l'`addTo`, la road part sur la **map** — et le toggle, qui n'agit que sur `layerEditor`, **ne la reprendra jamais**. **Avant tout code** : sur un plan réel, un tracé récalcitrant → `window.layerEditor.hasLayer(<layer>)`. S'il renvoie `false`, le mécanisme est confirmé et le fix est court.

### ⚪ Aucune action — décisions arrêtées, gardées pour mémoire

*Chacune a déjà été re-signalée à tort au moins une fois. **Ne rien coder ici sans un fait nouveau.***

| # | Sujet | Pourquoi on ne fait rien |
|---|---|---|
| D4 | `<script>` inline d'`index.html` — « monolithe » **PÉRIMÉ** (31/08 : 305 lignes d'inline sur 1 823, 3 modules extraits en v1.66.0) | Plus une dette prioritaire — **ne pas re-signaler sans re-mesurer** |
| D7 | Duplication ~2 fonctions pickers géoréf ↔ picker départ tracker (⚠️ doc seule, `tracking.md`) | Seuil explicite : mutualiser **si une 3ᵉ cible apparaît** |
| D8 | `secoursPlan.groupes[].statut` — signalé mort par la doc, **il est exploité** (✅ vérifié) | Rappel que la doc mentait |

#### D0 — 🧲 Magnétisme C5 : rayon non plafonné en unités plan ✅ vérifié 01/08

**Symptôme constaté par KARMA** : magnétisme actif + cercles d'intersection actifs → un cercle apparaît alors que les deux tracés ne se touchent pas. **Deux causes** : (1) les cercles ne signalent pas un contact — la règle 2 de `_calculerIntersectionsRoads` pose un cercle sur une *extrémité* à moins de 8 px plan d'un segment voisin (intentionnel, rattrape les T-jonctions) ; (2) le rayon d'accrochage est en **pixels écran** (14) : à z = −3, 14 px écran = **112 unités plan**.

**Décision KARMA (01/08)** : pas de plafond ; `showRoadIntersections` à `false` par défaut (fait en v1.74.0).

> ⚠️ **Désaccord consigné (Claude)** : masquer les cercles supprime le *signal*, pas la *cause*. Dézoomé, le point reste déplacé jusqu'à ~100 unités plan de l'endroit cliqué, et ça se répercute sur le graphe d'itinéraire. Correctif : `Math.min(tolÉcran, ~15 unités plan)` d'une ligne dans `road.js > _snapSurSommetProche`. **À reconsidérer si un tracé fait au magnétisme dézoomé se révèle déformé.**

## 🚫 Enterré volontairement — ne pas repayer

| Sujet | Statut |
|---|---|
| **Podomètre / mode poche** | Enterré le 29/09 : **infaisable en l'état**. Le podomètre du téléphone est inaccessible depuis une page web (aucune plateforme), Web Bluetooth n'existe pas sur iOS, et le vrai obstacle en poche est le **cap**, pas le comptage. Étude : `docs/ETUDE_PODOMETRE.md` (archivé : tag Git `archive-docs-2026-09-30`) |
| **Plein écran iPhone** | 2 tentatives (v1.9.2, v1.71.0), 2 rollbacks. Un commentaire d'`index.html` **interdit une 3ᵉ tentative** sans diagnostic précis sur appareil |
| **QR Share Secours (Phase 4)** | Densité QR v35+ illisible par les scanners. Remplacé par l'import consolidé v1.26 (réellement fonctionnel entre deux appareils depuis le correctif A1 du 29/09) |
| **Traversée de portail en Vue OSM** | Arbitré 01/08 : le mode OSM n'a ni position courante ni plan « où tu es » |
| **Mode terrain (L1) et point rapide (L2)** | Écartés le 14/09 : l'écran et la pose de point conviennent |
| **Import Shapefile** | Enterré le 29/09 : QGIS exporte en GeoJSON, que l'app lit |
| **Journal des notifications (cloche)** | Enterré le 29/09 |
| **Dossier « 🌐 Serveur » automatique** (Mes plans) | Enterré le 29/09 |
| **Atlas : tri de `--lister`, seuil de pertinence, mesure Vue OSM à 20 plans** | Enterré le 29/09. `scripts/decouper-atlas.js` est livré et suffit ; les mesures de la campagne Gironde sont dans l'historique Git de ce fichier |
| **Test de l'import SIG sur de vrais exports QGIS** | Enterré le 29/09 (le harnais couvre parsers, CRS, Lambert 93) |
| **Transparence des plans issus d'un scan** | Enterré le 29/09 : un JPEG n'a pas d'alpha ; l'opacité compense, c'est accepté |
| **Plan orienté : indicateur de Nord, contre-rotation des tooltips, inertie du pan** | « Bien comme ça pour le moment » (KARMA, 29/09) |
| **Guidage : voix / vibration, validation terrain chiffrée des seuils** | Enterré le 29/09 |

## ✅ Corrections d'inventaire — ne pas les re-signaler comme dettes

Signalées à tort (doc périmée), **elles sont faites** — vérifiées dans le code aux dates indiquées :
- **Heatmap** — active depuis v1.21.2 · *01/08*
- **KMZ Secours Phase 2** — `_emitSecoursFolder` livré en v1.23.0 · *01/08*
- **Résolveur de styles (légende, vagues 1 à 4) et override de couleur des built-in** — terminé ; `check-style-canon` confronte **0 déclaration**, `check-kml-styles.js` verrouille la couleur custom en KMZ · *31/08*
- **ex-D6 « constantes `ITI_*` dupliquées »** — les survivants sont des vitesses / pauses / clés, aucune couleur · *31/08*
- **D1 « les PDF du Mode Histoire ne voyagent pas »** — soldée en v1.81.0 (case opt-in de l'export de profil, `check-profile-histpdf.js`) · *02/09*
- **D2 « contenus longs en espagnol »** — soldée en v1.80.0 ; les trois langues du guide sont tenues par `check-doc-langues.js` depuis v1.98.0 · *01/09*
- **D-home-mini « footer coupé sans scroll sous 760 px »** — non reproduite sur 6 configurations ; la fausse mesure venait d'un overlay (splash, modale) qui mangeait la molette. Verrouillé par `checkup-home-scroll.js` · *02/09*
- **D5 « liaisons portails sur OSM »** — soldée en contrôle qualité (`InterPlanLinks.ecartCalage`, badge `📐 Écart de calage`) · *03/09*
- **Fusion de sessions** — existe (`sessionExporter.js` > `_fusionInputs`, `_fusionMerged`) : **ne pas la reproposer** · *03/09*
- **« Vue OSM : les couleurs de la légende personnalisée ne l’atteignent pas »** — FAUX : `osmView.js` résout par `ktaResolveStyle` (override + `cust-…`), le widget HOME relit la légende **par plan** depuis v1.77.0 ; confirmé sur appareil par KARMA · *29/09*
- **Carnet : session ≠ sortie (ex-L3)** — soldé ; changer de plan suspend la sortie (v1.98.1) · *29/09*
