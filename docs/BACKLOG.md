# 📋 Backlog & dettes — MyKTAMap

> Fichier de travail KARMA ↔ Claude. **Ce n'est pas un journal** (ça, c'est `README.md`) : ici on ne garde que ce qui est **ouvert**. Une entrée soldée est **supprimée**, pas barrée — son histoire vit dans le journal et les commits.

## ⚠️ Règle de vérification (à lire avant d'utiliser ce fichier)

Le 01/08/2026, un inventaire de dettes sourcé depuis la doc s'est révélé **faux à 30 %** : 3 dettes sur 10 étaient déjà payées. Cause : les docs du repo sont des **logs append-only** où une entrée ancienne pose une limitation qu'une entrée ultérieure lève, sans renvoi entre les deux — y compris les en-têtes de modules `js/`.

**Donc chaque entrée ici porte son niveau de preuve** :

| Tag | Sens |
|---|---|
| ✅ **vérifié** | confirmé dans le CODE à la date indiquée |
| ⚠️ **doc seule** | lu dans une doc, **jamais recoupé au code** — à vérifier avant d'agir |
| 🔬 **hypothèse** | piste identifiée, non testée en runtime |

**Avant de traiter une entrée** : `grep` le symbole dans `js/`, vérifier le chargement dans `index.html` et la présence dans `sw.js > ASSETS_TO_CACHE`. Puis mettre le tag à jour.

**La règle vaut dans les DEUX SENS** (ajouté le 31/08/2026, après récidive) : une entrée qui traîne alors qu'elle est **soldée** coûte aussi cher qu'une dette ignorée — elle fait recommander un chantier déjà fait. Quand un lot tombe, **reclore la section le jour même** : ni « 🔜 vagues suivantes » orphelin, ni tableau de suivi laissé ouvert. Le seul état stable de ce fichier est *ouvert*.

---

## 👣 Podometre / mode poche — ETUDE FAITE, decision en attente (06/09/2026)

Demande KARMA : « recuperer les infos d un podometre pour une meilleure precision et pouvoir garder le telephone
en poche, via une case a cocher ». **Etude complete : `docs/ETUDE_PODOMETRE.md`.**

Les trois faits qui tranchent :

- **Le podometre materiel du telephone est inaccessible depuis une page web**, sur aucune plateforme. Aucune
  interface `StepCounter` n existe dans la Generic Sensor API — le comptage de pas y est cite comme cas d usage,
  jamais standardise.
- **Web Bluetooth n existe pas sur iOS** et Apple a annonce ne pas vouloir l implementer : un podometre externe est
  illisible sur iPhone, quel qu il soit. **Ne rien acheter.**
- 🩸 **Le vrai obstacle du telephone en poche n est pas le comptage, c est le CAP.** L app fait du dead-reckoning :
  elle avance dans la direction de la BOUSSOLE, qui en poche donne l orientation de la poche. Aucun podometre ne
  corrige ca. Le comptage, lui, est meilleur en poche qu en main.

Ce qui reste faisable et rentable — et qui ne demande aucun materiel : le detecteur de pas actuel est un simple
seuil sur franchissement, sans filtrage ni detection de pic, avec une longueur de pas CONSTANTE. C est cette
derniere qui coute le plus de precision. Reco : **mesurer d abord** (enregistrer des traces reelles et compter a la
main), corriger l algorithme, puis offrir un « mode poche » — pas un « utiliser le podometre », qui ne peut pas
exister.

⚠️ **Rien n a ete mesure dans cette etude** : tous les gains annonces sont raisonnes depuis le code, pas observes.

## 🧭 Audit ergonomie du 13/09/2026 — lots restants

Rapport : `docs/audits/2026-09-13_audit-ergonomie-v1.md` (100 constats UX, 36 écarts doc, 22 manques). **Lot 1
« Sécurité » livré le 13/09 (non versionné, en attente de bump)** : B1 position par défaut, B2 permission
capteurs, Q3 tag `entree_plan`, Q4 vol d'oiseau, Q5 bouton 🚨, Q7/Q8 vocal, Q10 vibration urgence, Q21 chip muet.

| Lot | Contenu | État |
|---|---|---|
| **2 — Filets de données (½ j)** | B3 snapshot avant import de session · B4 « Tout réinitialiser » liste 4 postes, en efface 9 · B6 Reset des Réglages sans confirmation · Q23 suppression de point hors historique · Q24/Q25 zone détruite au re-tap / bouton ✅ · Q44 « Effacer la session » à 1 tap · Q45 snapshot unitaire · Q47 export tracker-seule refusé · Q49 carnet sans interrupteur · Q58 effacer géoréf · Q59 générateur fermé au clic fond | ✅ **livré 13/09** (non versionné), verrouillé par `check-filets-donnees.js` |
| **3 — Doc (½ j, sans code)** | D5 Vue OSM « opt-in » → « active par défaut » (**écart de confidentialité**) · D1 onglets Exporter · D3 « Changer de plan » · D2 menu Tracker flyout · D6 Reset dans ⚙️ · D11/D12 snapshots · D4/D16 · D10 côté des groupes · réglages fantômes Q60 (doc) | ✅ **livré 13/09** (non versionné) ; D18/D19/D27 le 14/09 (v1.91.2) ; D2 (flyout Tracker), D9 (titre d'aide), D13 (styles de légende de l'export image), D20 (revoir le tutoriel), D29-34 (mesure OSM, coordonnées de surface, inspecteur mémoire) le 14/09. Q60 code soldé en v1.92.0. ~~D21~~ **traité le 14/09** en passe ciblée (option retenue) : encadré d'aiguillage en tête du chapitre Secours ×3 (quelle section lire selon la situation), renvoi depuis la Sortie d'urgence qui vit 600 lignes plus haut, et 12 formulations périmées (« désormais ») retirées. ⚠️ **Le rapport surestimait la redite** : les 3 vues Live ne sont décrites en détail qu'UNE fois chacune (lignes 1912, 1959, 2000 de la version fr), les autres occurrences sont des renvois légitimes. Aucune fusion de sections : les ancres sont préservées. **Reste, à trancher par KARMA** : D26 (jargon : IndexedDB ×13, Leaflet ×13, localStorage ×9…), ~~D35~~ **livré le 14/09** : ❓ dans l'en-tête de 14 fenêtres, ouvrant la section d'aide du sujet ; désactivable depuis ⚙️ Configuration de l'accueil (exigence KARMA). Table confrontée au code par `check-aide-contextuelle.js`. ~~D36~~ **clos le 14/09** : défaut réel mais injoignable (la langue ne se change plus depuis un plan depuis la v1.85.4, et le retour à l'accueil reconstruit l'interface) — consigné dans `docs/architecture/i18n.md` avec ce qui rouvrirait le sujet. **D26 jargon : passe ciblée faite le 14/09** — IndexedDB, localStorage, Service Worker et DevTools deviennent du langage courant là où ils n'étaient qu'une précision de rangement ; gardés là où ils sont le sujet (crédits des standards web, auto-hébergement HTTPS). ℹ️ D29-34 « aide profil 38 succès vs 32 » : **le rapport se trompait** — 8 familles × 4 paliers + 6 spéciaux = 38, la doc est juste. |
| **4 — État visible (½ j)** | Q34/Q35 filtres · Q11 footer tracker · Q12 étapes d'itinéraire après restore · Q46 « enregistré il y a » · Q16 tracker masqué par niveau · Q17 verrou suspendu · Q9 wake lock au démarrage | ✅ **livré 13/09** (non versionné), verrouillé par `check-etat-visible.js` |
| **M2 — Lockout temporisé** | PIN (`pinLock.js`) **et** gate mot de passe (`unlockGate.js`) → temporisation escaladée 10 min → 1 h → 6 h → 24 h, compte à rebours, retour automatique. Base de temps tranchée : horloge de l'appareil (reculer l'horloge ne rouvre pas, l'avancer raccourcit — accepté, `security-legal.md` §36.3) | ✅ **codé 13/09** (non versionné) — à tester sur appareil : 5 codes faux → compte à rebours → retour du pavé |
| **B5** | Stockage saturé : bandeau persistant + bouton 💾 Exporter tant que le save échoue | ✅ **livré 13/09** — non reproductible au harnais (quota), à valider en saturant le stockage d'un téléphone de test |
| **L1-L4** | Arbitrage KARMA 14/09/2026 : **L1 (mode terrain) et L2 (point rapide) écartés** — l'écran et la pose de point conviennent. **L4 ✅ livré le 14/09 (v1.92.0)** : application immédiate, portée par groupe, groupes repliables, globaux en lecture seule, géoref en sous-modale, reset par plan, Q60/Q61 soldés. **L3 (« ma sortie ») à concevoir ensemble** avant tout code : une *sortie* terrain se fait *dans* une *session* et se clôture sans la fermer — deux objets distincts, pas de fusion des mots ni des cycles de vie ; unification possible du seul *chemin* (export / import / clôture). | 🟡 |
| **Import multiple de plans** | N archives ZIP ajoutées à la liste sans ouverture, politique de doublons pour le lot, garde-fou sur la place | ✅ **livré le 15/09 (v1.94.0)** — topo validé par KARMA (reco sur les 5 décisions) |
| **Stratégie doc** | une source / trois rendus + garde-fou pré-commit sur les libellés cités (§6.7 du rapport) | ⚖️ à trancher par KARMA |

⚠️ Chaque constat porte un fichier:ligne dans le rapport, **vérifié au code le 13/09** (✅ vérifié) — sauf les [Supposition] marqués comme tels.

## 🔕 Popups et notifications — état des lieux fait, option à trancher (17/09/2026)

État des lieux : `docs/audits/2026-09-17_etat-des-lieux-notifications.md`. 118 toasts (`OOMGuard.showToast`, 46 info / 34 warn / 6 error), dont ≈ 45 % confirment un geste que l utilisateur vient de faire (« 2 plan(s) déplacé(s) », copié, annulé…). Proposition : un réglage ⚙️ Tout / Essentiel / Silence sur le seul goulot `showToast`, marqueur `important` pour ce qui doit survivre, vibration qui suit le réglage ; **alertes serveur exclues par construction** (exigence KARMA). Dette séparée : 171 `alert()` + 21 `confirm()` natifs, hors de tout réglage. 6 décisions en fin de document. ✅ **Livré en v1.96.0 (17/09)** : réglage à trois positions, vibration qui suit, regroupement au chargement, `check-notifs.js`. **Reste** : reco 4 — 171 `alert()` + 21 `confirm()` natifs à migrer par lots (bloquants, hors charte, hors réglage) ; reco 6 — journal des notifications (cloche), plus tard.

## 📁 « Mes plans » à 50+ plans — mode Dossiers (étude du 16/09/2026, décision KARMA en attente)

Étude : `docs/audits/2026-09-16_etude-dossiers-mes-plans.md`. Constat : à 50 plans, le bandeau de chips grandit avec le nombre d'étiquettes distinctes et mange la hauteur fixe de la colonne ; le filtre est un OU plat ; une étiquette qualifie, elle ne range pas. **Reco** : modèle hybride (dossiers manuels, règle par étiquette optionnelle) en deux marches, sélecteur TOUT / DOSSIERS dans la ligne de titre (0 px ajouté), tactile sans glisser (⋮ → Déplacer vers), glisser PC en plus. Contraintes KARMA : hauteur et place de chaque bloc inchangées ; sauvegardé dans le profil ; configurable depuis ConfAdmin (index.json `folders` + `folder` par plan, doctrine « l'index propose, l'utilisateur dispose ») ou par import de profil. **9 décisions numérotées** en fin d'étude. ✅ **Livré en v1.95.0 (16/09/2026), marches 1 et 2 dans la même release** : décisions 1-11 appliquées (C hybride, un plan par dossier, épinglés en tête de leur dossier, sélection multiple, couleur, règles par étiquette, « dossier depuis ces chips », dossier de destination de l'import multiple, dossiers de l'index verrouillés, `plansViewDefault` kiosque, sélecteur toujours visible). Reste ouvert (décision 3) : le dossier « 🌐 Serveur » automatique.

## 🧭 Mode « plan orienté » — dettes ouvertes (v1.97.0 → v1.97.3, 26/09/2026)

Le mode est livré et tenu par `scripts/smoke/checkup-plan-oriente.js` (37 contrôles). Restent :

- 🔴 **`[Tiling V2] Niveau z=NaN` au premier rendu — un garde-fou désarmé, antérieur au mode.** Le tuilage s'initialise avant que la carte ait une vue : `_choisirNiveau(map.getZoom())` rend `NaN`, un rendu fantôme consomme le drapeau « premier rendu », `attendusPremier` reste à 0 — et le repli de sécurité de v1.86.0 (« toutes les tuiles ont échoué → afficher l'image entière ») **ne peut plus jamais se déclencher**. Vu dans les logs terrain du 25/09. Rien à voir avec la rotation : c'est le filet du tuilage qui est décroché.
- 🔴 **Validation iOS/Safari inexistante.** Le harnais est Chromium ; deux régressions de ce chantier (tuiles noires en v1.97.0, 17 % d'écran vide en portrait en v1.97.1) n'ont été vues que par KARMA, sur son iPhone. Item ajouté à `docs/RELEASE_GATE.md`.
- 🟠 **Pas d'indicateur de Nord à l'écran** — le manque ergonomique le plus visible quand la carte tourne. 🔎 Piste bon marché, à vérifier : `js/compass.js` monte sa rosace sur `document.body`, donc **hors rotation**, et la contre-tourne avec le cap monde ; le Nord du plan devrait donc s'y lire juste pendant le mode, offset de Nord compris. Si ça se vérifie au harnais, « l'indicateur » se réduit à afficher la rosace d'office à l'activation.
- 🟡 **Contre-rotation des tooltips.** Non faite. ⚠️ La raison longtemps avancée (« ils ne servent qu'en Secours/OSM ») est **fausse** : `js/tableEditor.js:1245` en pose de permanents sur la carte principale. L'impact reste faible, la décision est à reprendre sur le bon fait.
- 🟡 **Pan sans inertie.** Le pan du mode est refait à la main (le drag de Leaflet part de travers sous rotation) : un doigt, pas d'inertie. Le geste répond donc autrement que dans le reste de l'app.
- 🟡 **`prefers-reduced-motion` promet une accessibilité absente.** Le bloc de `css/style.css` annonce une prise en charge du mal des transports, mais ne pose qu'un `transition: none` sur un bouton qui n'en déclare aucune : c'est un no-op, et la rotation de la carte s'anime quoi qu'il arrive. Soit le bloc agit (poser l'angle sans animer), soit il cesse de le promettre. **Décision KARMA.**

## 🆕 Sujets ouverts (demandes KARMA du 01/08/2026)

### 1. 🗺️ Import depuis SIG — « Convertir depuis SIG »

**Besoin** : qu'un fichier type QGIS entre dans MyKTAMap (aujourd'hui on ne sait qu'exporter/réimporter du GPX).

✅ **vérifié 01/08** — **les deux moitiés existent déjà, jamais branchées ensemble** :

| Module | Sait faire | Bloqué par |
|---|---|---|
| `kmzImport.js` (44 Ko) | parse déjà les `<Placemark>` KML → Point/LineString/Polygon → editor/road/zone | **exige un `<GroundOverlay>`** (image géoréf) → refuse tout export QGIS vectoriel |
| `gpxImport.js` | **canvas vierge + auto-calibrage sur les bounds GPS** → ZIP MyKTAMap complet | ne parse que du GPX |

→ Le lot = parser SIG + fallback canvas vierge. **Raccordement, pas construction.**

**Formats** : GeoJSON ✅ (`JSON.parse`, zéro dép.) · KML/KMZ ✅ (parser écrit) · Shapefile ⚠️ (lib ~50 Ko à vendorer) · GeoPackage ❌ (SQLite → `sql.js` ~1 Mo WASM, hors périmètre offline).

⚠️ **Piège CRS** : QGIS exporte souvent en **Lambert 93 (EPSG:2154)** — mètres, pas degrés. **Aucune lib de reprojection vendored** — et il n’en faut pas : depuis la v1.82.0 la conique conforme de Lambert est écrite à la main dans `js/sigImport.js` (~50 lignes) et verrouillée par `scripts/check-lambert93.js`, qui la confronte à ses propriétés définitoires plutôt qu’à une table recopiée. Le reste de ce paragraphe décrit l’état d’AVANT (`lib/` = leaflet, jszip, jspdf, html2canvas, imageoverlay-rotated). Détection triviale (coords hors `[-180,180]`/`[-90,90]`).

**Décisions tranchées le 01/08 (KARMA « GO RECO ») : `1:b 2:a 3:a`.**

**État : ✅ LIVRÉ (moteur + UI) — reste à tester sur de vrais exports QGIS.**

✅ Fait — `js/sigImport.js` (câblé dans `index.html` + `sw.js`), validé par harness Node (34 cas) :
- parsers **GeoJSON** (FeatureCollection/Feature/GeometryCollection, les 6 géométries, Multi\* éclatés) et **KML** (Placemark, `ExtendedData`/`SimpleData`, KMZ via JSZip)
- **validation CRS** : refus franc si coords hors `[-90,90]`/`[-180,180]` **et** si le membre `crs` déclare autre chose que CRS84/4326 — le message dit combien de coordonnées sont fautives
- bounds (avec fenêtre minimale si étendue nulle → pas de division par zéro dans `buildTransform`)
- `analyserAttributs()` → colonnes candidates triées + valeurs distinctes = **matière première de l'écran de correspondance**
- `proposerMapping()` → pré-remplissage par synonymes, **jamais de valeur forcée** (inconnu → `null`, l'user tranche)
- `ingest()` → points/roads/zones en coords plan via `KmzExport.gpsToPlan`
- `genererZipMyktamap()` → réutilise `GpxImport.genererCanvasVierge` (aucune raison d'avoir 2 générateurs de fond)

✅ UI livrée (`createConf.js`) : routage `.geojson/.json/.kml` dans `_routerFichierImport`, panneau `_afficherImporterSig()` calqué sur le panneau GPX, **écran de correspondance** (colonne SIG + table « valeur → type », valeurs **ventilées par famille** via `valeursParFamille` — un polygone ne se voit jamais proposer un type de tracé), `accept=` élargi, 41 clés i18n ×3.

⚠️ **Reste à valider sur le terrain** : aucun vrai export QGIS n'a été testé. Le harness couvre la logique (parsers, CRS, mapping) mais pas les schémas réels. À tester en priorité — un GeoJSON QGIS EPSG:4326, un KML QGIS, un fichier volontairement en Lambert 93 (doit être refusé avec le compte de coordonnées fautives).

⚠️ **`.json` est routé vers le panneau SIG** : extension ambiguë (config, session, calque…). C'est le parser qui tranche au contenu et refuse proprement (`sig.err.pasDuGeojson`). Si ça gêne un flux existant, router `.json` ailleurs.

**Extensions possibles plus tard** : Shapefile (lib ~50 Ko), import des styles SIG. ~~reprojection proj4~~ → **le Lambert 93 est LIVRÉ** (v1.82.0, sans proj4 : cf. ci-dessous).

✅ **Lambert 93 (EPSG:2154) — LIVRÉ le 03/09/2026.** Un export QGIS français en L93 n'est plus refusé : il est **reconnu et converti**, la conversion étant **annoncée** avec le nombre de coordonnées reprojetées (la règle du module reste « jamais de correction silencieuse » — on ne refuse plus, mais on ne convertit pas en douce non plus). **Sans `proj4`** : ~30 Ko pour couvrir des milliers de CRS quand on en veut un seul, dans un projet offline-first sans bundler dont `lib/` est volontairement minimal. La conique conforme de Lambert tient en ~50 lignes dans `sigImport.js`. ⚠️ **Le message de refus des AUTRES projections a été corrigé** : il citait le Lambert 93 comme cause probable, ce qui est devenu faux. Verrouillé par `scripts/check-lambert93.js` (17ᵉ garde-fou, **falsifié 7×**).

> 🎯 **Comment ce garde-fou est construit, et pourquoi c'est important** : il ne compare à **aucune table de référence**. Une table recopiée depuis un site web est elle-même une source d'erreur — si le chiffre est faux, le test valide le bug. Tout est déduit des **propriétés définitoires** de la projection : l'origine (3°E, 46,5°N) tombe *exactement* sur (700000, 6600000), le facteur d'échelle vaut *exactement* 1 sur les deux parallèles standard, l'échelle est identique dans toutes les directions (conformité), et l'aller-retour revient au point de départ. *L'aller-retour seul ne prouverait rien : deux fonctions fausses mais mutuellement inverses passeraient.*

---

### ~~2. 🎨 Légende — couleur des entrées par défaut~~ — ✅ SOLDÉ EN ENTIER (vérifié 31/08/2026)

Le sujet est **clos**, ses 5 étapes comprises. Vérifié dans le code, pas dans la doc :
`node scripts/check-style-canon.js` → **0 déclaration confrontée** (il ne reste plus une seule
couleur de type écrite à la main hors des 2 exceptions assumées) · `styleResolver.js` en-tête :
vagues 1 à 4 livrées · le **bug 2** (couleur d'un type custom perdue en KMZ, `styleId = "road_cust-…"`
jamais déclaré) est corrigé et **verrouillé par `check-kml-styles.js`** (22 contrôles, pré-commit
bloquant) · l'**override de couleur des built-in** — la demande d'origine — est livré
(`LegendCustomization.setColor` / `hasColorOverride`, couvert par `check-style-resolver.js`).

> 🩸 **Cette entrée a coûté une fausse recommandation le 31/08** : Claude a proposé « la vague 3,
> seule dette restante produisant une perte de donnée visible » — chantier terminé depuis v1.76.0.
> Cause : le « 🔜 Vagues suivantes » de cette section n'a jamais été reclos quand les vagues sont
> tombées. **C'est exactement le piège décrit en tête de ce fichier.** La contre-mesure est en haut
> (« avant de traiter une entrée, grep le symbole ») — elle n'avait pas été appliquée. Elle vaut
> aussi pour les sections **soldées** : une section qui reste ouverte alors qu'elle est finie coûte
> aussi cher qu'une dette non traitée.


### 3. 📦 Export de profil avec archives — ✅ LIVRÉ (v1.79.0), reste un lot optionnel

**Reste optionnel (lot 5, si un cas réel le demande)** : streaming FS Access (`showSaveFilePicker` + `generateInternalStream`, Chrome/Edge desktop) pour réduire le pic RAM de `generateAsync` sur les très gros exports. [Probable — API JSZip existante, non testée ici]

## 🧹 Code mort — audit du 09/08/2026 (2 agents indépendants + scan i18n)

> **Les lots ①②③④ sont EXÉCUTÉS (09/08, −~930 lignes, −1,92 Mo)** — leurs listes ligne à ligne
> ont quitté ce fichier, elles vivent dans les commits. Ne restent ici que **ce qui est ouvert**
> (🟡), **ce qui ne doit jamais être supprimé** (📌) et **les deux leçons** qui protègent le
> prochain nettoyage. Les 3 bugs latents sont tranchés : batterie fantôme **supprimée**
> (arbitrage KARMA — le chip header vit), toast OSM **ressuscité** (il visait un id inexistant),
> et le n°3 **révoqué** — cf. la leçon ci-dessous.
> ⚠️ Les numéros de ligne survivants sont ancrés sur `bbd954e` et **ont dérivé** depuis les
> suppressions du 09/08 : les re-vérifier avant d'agir, ne jamais les prendre au mot.

### ⚠️ Correctif d'inventaire préalable
La liste « règles CSS mortes » de l'audit du 09/08 matin (consignée dans le commit `a87311a`) était **majoritairement fausse** : sur 76 paires de sélecteurs dupliqués, **8 seulement sont intégralement mortes** — le reste est du *layering volontaire* de la refonte loader (override **partiel** : l'antécédent porte des propriétés qui survivent, le supprimer casse le layout). Toute suppression de jumelle doit être vérifiée **propriété par propriété**, jamais au sélecteur.

### 🩸 Leçon du faux fix — RÉVOQUÉ en v1.77.0 (à relire avant tout `cleanup`)
`_revokeTilesBlobUrls()` d'`osmHomePreview` était « jamais appelé malgré son commentaire », donc
branché — **à tort**. Il n'y avait pas de fuite : `_planDataCache` borne l'extraction à 1×/plan, et
le design v1.71.0 veut que les URLs vivent avec le cache (« re-ajout gratuit »). L'appel ajouté
révoquait les URLs du plan A **encore affiché** au chargement d'un plan B : multi-plans cassé, cache
empoisonné. Fonction et liste **supprimées** ; les tuiles hi-res (v1.77.0) ont leur propre cycle de
révocation.
> **« Jamais appelé » ≠ « à appeler ». Vérifier le DESIGN avant de brancher un cleanup.**

### 🟡 À vérifier avant de toucher
- Fragments de sélecteurs morts dans des groupes vivants (supprimer la ligne du sélecteur, pas le bloc) : `.kta-btn-action` 19843+, `.plan-card` ×4, `.kta-modal-btn-*` 17302/17312, `.kta-mesure-distance` 13606, `.drag-over` 16866, `.kta-rd-total-pill` 14621, `style-secours.css:829` — contrôle runtime (`querySelectorAll(...).length === 0`)
- `kta-toast-error/info` : classes **concaténées** (`"kta-toast-" + type`) — NON supprimables sans inventaire des `type`
- JS : événement `kta:imgLayerCalibChange` (0 listener — extension volontaire ?), `getTrackerLevel` (« phase 2B » — abandonnée ?), scope `kta-ses-modal` inexistant dans sessionExporter:3495 (bug de scope bénin ?), ~13 exports d'API publique jamais consommés (API = contrat, gain faible risque non nul)

### 🧹 Reste de CSS mort du loader — famille `.kta-loader-perf-drawer*` (13/09/2026)
Le CSS du **sélecteur de tuilage** (`.kta-perf-wrap/-segmented/-btn/-emoji/-label/-desc/-details/-summary/-hint/-debug` + leurs surcharges thème clair) est **supprimé** (−194 lignes de `css/style.css`, commit dédié).
✅ **vérifié 13/09** — 0 référence dans `index.html`/`js/**`, **agent externe repassé derrière** (coutures nettes,
accolades équilibrées, familles vivantes intactes).

⚠️ **Le piège de tête de fichier s'est confirmé sur cette entrée** : `.kta-perf-titre` (8 titres de la modale
Config) est **VIVANTE** et était **entrelacée** dans le bloc — la liste d'origine de cette dette la citait comme
morte par voisinage de préfixe. Un `delete` par plage de lignes l'aurait cassée. Retrait fait **sélecteur par
sélecteur** (script à comptage d'accolades), pas par plage.

**Reste ouvert (même acabit, laissé hors périmètre)** : la famille `.kta-loader-perf-drawer`, `-titre`,
`-chevron`, `-corps`, `-sep`, `-divider` — le drawer repliable qui **enveloppait** le sélecteur — est **elle
aussi morte** (✅ 0 réf dans `index.html`/`js/**` le 13/09). 🩸 **SEUL `.kta-loader-perf-hint` reste VIVANT**
(6× `index.html` + 2× `js/devMode.js`) : à préserver absolument. ~40 lignes vers `css/style.css:6387-6452`.
Même prudence : retrait sélecteur par sélecteur, jamais par plage. À faire au prochain passage visuel (une
suppression CSS ne se falsifie pas, elle se constate à l'œil).

### 📌 Mort documenté — gardé exprès, ne pas supprimer sans arbitrage KARMA
`_renderMultiLevelSection`/`_bindMultiLevelToggle` (interfaceConfig, 49 l., rétro-compat v1.7.3) · wrappers compat exporter/measure · `_proHashShort`/`_proSourceLabel` · dispatch `mktm:secours-scenario-mutated` (point d'extension pro) · `__ktaStyleCanon` (diagnostic) · `PERF_MODE_SIZE_BYTES` (alias rétro-compat) · `__MKTM_PRO_LICENSE__` (contrat d'en-tête) · branche mono-alerte d'alertChecker (**garde-fou réseau légitime** : une instance auto-hébergée peut servir l'ancien format) · `ktaCouperModesOutils` (console/debug)

### ✅ Résultats négatifs (hygiène confirmée, rien à faire)
112 fichiers js/ = 112 script tags = 112 entrées précache (recompté le 05/09/2026) (zéro orphelin) · précache SW 188/188 présents sur disque · les 4 CSS lazy parfaitement cloisonnés (0 duplication avec style.css) · 29/30 icônes référencées · 0 id HTML orphelin.

## 🗺️ Atlas départementaux — découper un gros relevé en plans (03/09/2026)

**Le cas réel** : KARMA a fourni un relevé KML de la Gironde — **171 Mo, 4,1 M de lignes, 245 504 Placemarks** (233 286 galeries, 13 685 polygones, 1 471 points) couvrant **65 × 72 km**. Arborescence : six dossiers `niveau1` à `niveau6` (galeries + piliers par étage), un **topo historique** (JP Cassou), et une couche **« Zone de carrière souterraine répertoriée »** de **1 471 emprises nommées**.

🔒 **Le fichier ne doit JAMAIS partir sur git** — poids *et* sensibilité (localisation de carrières réelles, avec identifiants et nombre d'accès). Il était `untracked` **mais pas ignoré** : un `git add -A` l'aurait embarqué. Règle posée dans `.gitignore` sur la **racine** de `data/` (`*.kml`, `*.kmz`, `*.gpx`, `*.geojson`) — les 11 fichiers du plan de test restent suivis. Les sorties de découpage (`sorties-atlas/`) sont ignorées pour les mêmes raisons.

### En l'état : l'app refuse, et c'est correct

245 504 features contre `MAX_FEATURES = 60000` (refus dur ; `WARN_FEATURES = 20000` se contente d’avertir depuis la v1.82.0) : **4× la limite**. Même sans cette borne, 171 Mo de XML dans `DOMParser` font plusieurs Go de DOM. Et surtout : **un plan MyKTAMap est une carrière, pas un département.** Le refus n'est pas le problème — ce qui manquait, c'est la **sortie**.

### ✅ Livré : `scripts/decouper-atlas.js`

Outil de **préparation de données**, hors navigateur, hors build. Lit le KML **en flux** (ligne à ligne : 171 Mo d'UTF-8 font ~340 Mo de string V8) et écrit un **GeoJSON** par carrière.

> 🎯 **Pourquoi du GeoJSON et pas un ZIP de plan** : l'app sait déjà faire le reste. Le fichier passe par > « Convertir depuis SIG », qui génère le **fond vierge calé** (`GpxImport.genererCanvasVierge`) et l'écran de > correspondance. Écrire ici un second générateur de ZIP serait une deuxième implémentation du même travail — la > dette classique de ce projet. **Bonus : ça fait passer l'import SIG sur des données réelles**, ce qu'il n'avait > jamais connu (cf. §1, la réserve qui traînait depuis la v1.7x).

**🩸 Trois pièges du format, payés en les découvrant :**

1. **Chaque emprise est un `<MultiGeometry>` : un `<Point>` de placement PUIS le `<Polygon>`.** Prendre le premier `<coordinates>` venu donne le point — une emprise d'un seul sommet, et **zéro galerie retenue**. Il faut viser `<outerBoundaryIs>`.
2. **Le niveau vient du `<Folder>` englobant, pas du Placemark** — et le fichier ne contient pas que des niveaux. Après `niveau6` viennent le topo historique et les emprises : sans changer de contexte, **tout retombait en « -6 »**. Première extraction : 16 676 features au niveau -6 pour une carrière qui en déclare **4 étages**. Le chiffre absurde est ce qui a révélé le bug.
3. **Les emprises ne sont pas du contenu de plan.** Ce sont les contours administratifs, y compris ceux des carrières voisines qui débordent dans la bbox. Les importer donnerait de fausses galeries épousant les limites de zone.

**Deux relevés se superposent** — le structuré par étages et le topo historique. Sur `Citon_Graves_RD` : **3 890 features** pour les six niveaux réunis, **16 612** pour le seul historique. Les mélanger dépasse la limite ET superpose deux relevés du même endroit. D'où `--couches niveaux|historique|tout`, **défaut `niveaux`** : c'est celui qui porte l'information d'étage dont le multi-niveau de l'app a besoin.

**Autres arbitrages** : une galerie est retenue **entière** dès qu'un de ses sommets tombe dans l'emprise (la découper produirait des tronçons orphelins et fausserait les longueurs) ; une **marge de 50 m** autour du contour évite de couper net des galeries au bord (`--marge`).

### Résultat mesuré — `Citon_Graves_RD` (carrière témoin choisie par KARMA)

| Étape | Mesure |
|---|---|
| Découpage de 171 Mo | **5,7 s**, 245 504 Placemarks lus |
| Emprise | 11 005 sommets · 1 335 × 1 580 m · 4 étages · 50 accès |
| Retenu (couche `niveaux`) | **3 890 features** — 1,56 Mo |
| Parse par `sigImport` | **44 ms**, CRS validé WGS84 sur 28 447 coordonnées |
| Colonnes détectées | `type` (galerie/pilier), `niveau` (-1 à -6), `couche` |
| Ventilation par famille | lignes : 6 niveaux · polygones : 5 — l'écran de correspondance a ce qu'il lui faut |

### Campagne d'extraction du 04/09 — 11 plans, et ce que l'atlas a appris

**✅ vérifié — l'anatomie des emprises, mesurée** (script jetable, couche « Zone de carrière » seule) :

| Mesure | Valeur |
|---|---|
| Placemarks d'emprise | **1 471** (1 479 contours : quelques `MultiGeometry` en portent plusieurs) |
| … **sans nom** | **267** — extractibles via le repli « (sans nom) #N » de `--lister` |
| … nommés | **1 212 contours** pour **1 157 noms distincts** |
| Noms portés par plusieurs emprises | **34 — 2,9 % des noms**, 89 contours |
| … dont exemplaires distants de **plus d'1 km** | **17 sur 34** |

**✅ Au passage, un vieux diagnostic tombé : ces 267 anonymes SONT l’écart** que le backlog attribuait depuis le 03/09 à des « Placemarks sans `outerBoundaryIs` exploitable » (1 471 − 267 = 1 204). Rien n’est perdu, rien n’est à creuser : `--lister` les nomme « (sans nom) #N » et elles restent extractables. L’entrée a été **supprimée** de « Ce qui reste ouvert ».

**🩸 Le nombre d'exemplaires ne dit RIEN — c'est l'ÉTENDUE qui départage.** `Grande_carrière_de_Latresne` compte **15 emprises mais tient dans 1,6 km** : c'est une grande carrière découpée en parcelles, et `--zone` seul y est correct. À l'inverse `Barreau_01` n'en a que **3, étalées sur 39,6 km**, et `Le_Puy_02` **2 sur 61,6 km**. Trier les homonymes par leur nombre trompe ; il faut regarder la dispersion.

**Conséquence pour l'outil** : sur les 18 noms visés le 04/09, **4** portaient des homonymes dispersés (`Barreau_01` ×3/39,6 km · `Barreau_03` ×2/39,7 km · `Le_Château_02` ×2/21,5 km · `Salle_la_Mouleyre` ×2/0,3 km — cette dernière groupée, donc fusionnable telle quelle). `--autour/--rayon` n'est pas réservé au cas « Le Bourg » documenté dans l'en-tête : c'est le réflexe à avoir dès qu'un nom est générique.

**🩸 Trois pièges de nommage payés le 04/09**

1. **Les entités XML ne sont pas décodées.** L'apostrophe est écrite `&apos;` dans la source : la zone s'appelle littéralement `La_Grangeotte_Plantey_d&apos;oline`, et c'est **cette forme échappée** qu'il faut passer à `--zone` (vérifié : le script ne traite aucune entité). Passer l'apostrophe réelle ne trouve rien, sans que rien ne le dise.
2. **Deux orthographes, deux sites différents** : `Lamothe_02` (underscore, 44.7355,-0.3775) et `Lamothe 02` (**espace**, 44.7848,-0.4772) sont deux carrières distantes de **8 km**. Chercher « Lamothe » sans regarder la position donne le mauvais site en silence.
3. **Le nombre de sommets du contour n'est PAS un proxy du contenu.** `Le_Grand_Parc_02` déclare **1 290 sommets** d'emprise et ne contient que **51 features** ; `Le_Château_02`, à 500 m, en déclare 2 659 et en contient **1 416**. Or `--lister` trie par « sommets *(proxy de taille)* » : il met donc en tête des emprises potentiellement vides. **À corriger** — trier par contenu réel exigerait la passe 2 — **ou au minimum à dire** dans le libellé.

**Le topo historique ne couvre pas le département** : **0** feature historique sur les 11 extraits du 04/09, contre 656 sur `Belllevue_Gardera_…`. Ne pas conclure d'un extrait sans historique que `--couches` a échoué.

> ⚠️ **Leçon de méthode, pour le prochain script jetable sur ce KML.** Mon premier compteur d'homonymes ne réinitialisait pas le nom à chaque `<Placemark>` : les 267 emprises **anonymes** héritaient du nom de la précédente et fabriquaient de faux doublons — **180 homonymes annoncés au lieu de 34**, un facteur 5, et deux « ambiguïtés » soumises à KARMA qui n'existaient pas. `decouper-atlas.js`, lui, remet bien `buf = { nom: null }` sur `<Placemark` : l'outil est sain, c'est le harnais qui mentait. Sur ce fichier, **tout compteur ad hoc doit borner son état au Placemark**.

### Ce qui reste ouvert

- **Le seuil de pertinence** : surface **médiane 196 m²**, 1 181 zones sur 1 471 n'ont qu'un étage. La grande majorité de ces « carrières » sont des petits vides ou des accès — un plan pour 196 m² n'a pas de sens. Un traitement en masse demandera un seuil, ou un regroupement par proximité.
- **`--lister` trie par un proxy trompeur** (✅ vérifié 04/09) : il classe les zones par le nombre de sommets du CONTOUR, qui ne prédit pas le contenu — `Le_Grand_Parc_02` déclare 1 290 sommets et ne renferme que **51 features**. Les têtes de liste peuvent donc être vides. Trier par contenu réel exigerait la passe 2 sur toutes les zones ; a minima, changer le libellé « proxy de taille ».
- **Le sort des plans produits** : mêmes données sensibles que la source. Ils ne vont pas sur git.
- **⚡ La pile multi-plans de la Vue OSM n'a PAS été mesurée** (dette ouverte par la v1.84.0, 04/09). L'ajout par étiquette permet d'en afficher vingt d'un clic, et un plan issu d'un atlas porte couramment **5 000 objets** — soit ~100 000 objets Leaflet dans une seule carte. Deux garde-fous posés **à la place** d'une mesure : confirmation au-delà de 3 plans (seuil de l'avertissement existant) et chargement **en série**. **À faire** : ouvrir 5, 10 puis 20 plans Gironde réels et relever mémoire + fluidité, puis décider si un cap dur s'impose. Tant que ce n'est pas fait, le chiffre « 3 » reste un arbitrage de 2026, pas une mesure.

---

## 💡 Pistes de features — évaluées le 03/09/2026

> Demandées par KARMA (« que pourrions-nous envisager comme nouvelle feature ? »), classées par **valeur / effort**. **Seules les pistes ENCORE OUVERTES figurent ici** : la reprojection Lambert 93 (v1.82.0), la profondeur des niveaux et le profil en long (v1.83.0) et l’affichage des plans par étiquette (v1.84.0) sont livrés — leur histoire vit dans `README.md` et les commits, conformément à la règle de tête de ce fichier.
> Chaque piste est **vérifiée contre le CODE** avant d’être proposée — c’est ce qui a évité d’en réinventer une déjà là : la **fusion de sessions** existe depuis longtemps (`sessionExporter.js` > `_fusionInputs`, `_fusionMerged`), **ne pas la reproposer**.

| # | Piste | Valeur | Effort | État |
|---|---|---|---|---|
| 1 | **Import VisualTopo (`.tro`)** | la cible **spéléo** de `CLAUDE.md` n’a aucun format topo lisible | moyen | 🔜 à lancer |
| 2 | **Shapefile** | complète le SIG, mais contournable (QGIS sait exporter en GeoJSON) | moyen | 💤 basse priorité |

### 1. 🕳️ Import de formats topo spéléo — `.tro` d'abord

**Le trou** : `CLAUDE.md` annonce la spéléo comme cible, mais l'app ne lit **aucun** format de topographie — ni VisualTopo, ni Therion, ni Compass, ni Survex (vérifié par `grep` le 03/09, **re-vérifié le 04/09** : `FORMATS_ACCEPTES = ".geojson,.json,.kml,.kmz"`, et l’`accept=` de `index.html` n’en connaît pas davantage : zéro occurrence). Un spéléo doit passer par QGIS pour faire entrer **son propre relevé**.

**Pourquoi c'est abordable** : le socle est déjà là. `sigImport.js` a les parsers, l'écran de correspondance, et surtout `GpxImport.genererCanvasVierge` — la brique qui crée un plan **sans image de fond**. Un `.tro` est du texte tabulé (départ, arrivée, longueur, azimut, pente) ; le dérouler en coordonnées est de la trigonométrie simple, et ça produit des points + polylignes, soit exactement le modèle de données de l'app.

⚠️ **À confirmer par KARMA avant de coder** : que VisualTopo soit bien le format le plus répandu chez les cataphiles et spéléos français — c'est une **supposition** de Claude, pas une mesure. Se tromper de format ferait livrer un parser que personne n'utilise.

---

## 🔴 Dettes ouvertes

> **Comment lire cette section.** Les dettes sont rangées par **qui doit agir**,
> pas par numéro : c'est la seule question utile quand on ouvre ce fichier.
> Une dette « bloquée sur KARMA » n'attend pas du code — elle attend une mesure
> sur sa machine, parce que le harnais ne sait pas la reproduire.
> Les entrées « aucune action » ne sont **pas** des dettes : ce sont des
> décisions déjà prises, gardées ici pour qu'on ne les re-signale pas comme
> des trous. Elles ne se soldent pas, elles se relisent.

| # | Sujet | État | Qui débloque |
|---|---|---|---|
| **D-light-icons** | Thème clair PC : émojis hors cadre à zoom 100 % | 🔬 non reproduit au harnais | **KARMA** — capture DevTools |
| **D3** | Toggle « Mes annotations » ne masque pas les roads | 🔬 mécanisme corroboré, non reproduit | **KARMA** — un `hasLayer()` sur un plan réel |
| **D-confirm** | 55 `confirm()` natifs hors charte | 📋 politique arrêtée, pas un chantier | personne — migration au fil de l'eau |
| **D0** | Magnétisme : rayon non plafonné en unités plan | ⚪ décision prise (v1.74.0) + désaccord consigné | aucune action |
| **D4** | `<script>` inline d'`index.html` | ⚪ description périmée, re-mesurée le 31/08 | aucune action |
| **D7** | Duplication ~2 fonctions (pickers géoréf ↔ tracker) | ⚪ seuil explicite non atteint | aucune action |
| **D8** | `secoursPlan.groupes[].statut` | ⚪ faux positif : le champ est exploité | aucune action |

---

### 🟠 Bloquées sur KARMA — pas de code à écrire, une mesure à faire

*Les deux sont **non reproductibles au harnais Playwright**. Les rouvrir sans
mesure fraîche, c'est répéter le faux fix de la v1.77.0 (révoqué). Ce qui
manque n'est pas du temps de dev, c'est une observation sur la machine où le
symptôme apparaît.*

#### D-light-icons — 🎨 Thème clair PC : les émojis sortent du cadre à zoom 100 %, OK à 90 % — noté 09/08/2026

🔬 **hypothèse** — chez KARMA (Chrome FullHD, thème clair, wallpaper actif), les émojis en tête des boutons/titres de la colonne Actions (📦 Ajouter un plan, 🧰 Outils, 📔 Mon carnet, 🌀 Mes liaisons…) s'affichent **détachés du texte, à cheval sur le bord gauche** de leur conteneur. Disparaît à **zoom 90 %**. **NON REPRODUIT au harnais Playwright** malgré : clair + wallpaper simulé + 1920×937 + 1536×750 @ deviceScaleFactor 1.25 — émojis toujours inline dans les cadres, `text-indent: 0`. Vérifié aussi : CSS servi sur dev **bit-à-bit identique** au repo (hash), structure HTML = texte inline simple (« 📔 Mon carnet »). Pistes restantes pour la reprise : extension navigateur injectant du CSS sur les sites clairs (non écarté — test navigation privée pas fait), rendu Segoe UI Emoji à échelle fractionnaire (zoom 100 % sur scaling Windows 125 % = ratio effectif 1,25), largeur réelle de sa colonne au moment du bug. Cosmétique, contournement connu (zoom 90 %) — à reprendre avec une capture DevTools (Computed de `text-indent`/`display` sur un bouton touché).

#### D3 — 🗺️ Toggle « Mes annotations » ne masque pas les polylines roads

🔬 **hypothèse — mécanisme corroboré par le code le 31/08.** Le symptôme n'apparaît que sur certaines configs.

**Mécanisme suspecté** : [`road.js:722`](../js/road.js#L722) fait `return window.layerEditor || window.map`. Si `layerEditor` n'existe pas encore au moment de l'`addTo`, la road part sur la **map** — et le toggle, qui n'agit que sur `layerEditor`, **ne la reprendra jamais**. Le commentaire juste au-dessus (l. 716-719) documente lui-même le bug comme « Leaflet subtil non identifié » depuis le 09/05.

**Ce qu'il faut avant tout code** (leçon du faux fix v1.77.0, révoqué) : sur un plan réel, chez KARMA, un tracé récalcitrant → `window.layerEditor.hasLayer(<layer>)`. S'il renvoie `false`, le mécanisme est confirmé et le fix est court. Sans cette mesure, on corrige à l'aveugle.

---

### 🟡 Sur la table — arbitrage ou avancement possible

#### D-confirm — 🪟 confirm() natifs hors charte — ✅ **mesuré 31/08/2026 : 55 occurrences dans 17 fichiers**

Relevé du 31/08 (`grep` sur `js/`) : **55** `confirm()` natifs restants, dont **`secoursMode.js` en porte 15 à lui seul** (de loin le premier contributeur — c'est là qu'un sweep aurait le plus d'effet, et le plus de risque). Suivent `refonteInterface` 5, `homeConfig` 5, `interfaceItineraire` 4, `memInspector` 3, `homeLoader` 3, puis une longue traîne à 2 et 1. En face, **7 fichiers** utilisent déjà `ktaConfirm`.

`window.ktaConfirm` (utils.js, v1.76.2, Promise + charte) existe depuis le retour KARMA sur la popup de replanification d'itinéraire. Les natifs restants **migrent au fil de l'eau** quand on touche leur module — pas de sweep massif (risque de régression sur des flux critiques type suppression). Nouveaux usages : `ktaConfirm` obligatoire. Attention à la migration : `ktaConfirm` est **asynchrone** (le code qui suit un `if (!confirm(...)) return;` doit passer en `.then()`).

---

### ⚪ Aucune action — décisions arrêtées, gardées pour mémoire

*Ce ne sont pas des dettes. Elles restent écrites parce que chacune a déjà été
re-signalée à tort au moins une fois : les effacer ferait repayer le
diagnostic. **Ne rien coder ici sans un fait nouveau.***

| # | Sujet | Preuve | Pourquoi on ne fait rien |
|---|---|---|---|
| D4 | `<script>` inline d'`index.html` — l'étiquette « monolithe » est **PÉRIMÉE**, re-mesurée le 31/08 | ✅ mesuré 31/08 | **305 lignes** d'inline sur 2 blocs, dans un fichier de 1 823. La v1.66.0 en a extrait 3 modules (`homeLoader`, `homeProfile`, `homeConfig`) : « monolithe » ne décrit plus l'objet. Reste de l'inline, mais ce n'est plus une dette prioritaire — **ne pas re-signaler sans re-mesurer** |
| D7 | **Duplication ~2 fonctions** pickers géoréf ↔ picker départ tracker | ⚠️ doc seule — [`tracking.md`](architecture/tracking.md) | Seuil explicite : mutualiser **si une 3ᵉ cible apparaît**. Pas atteint → ne rien faire |
| D8 | **`secoursPlan.groupes[].statut`** — ⚠️ signalé mort par la doc, **il est exploité** | ✅ vérifié (doc corrigée) | Aucune action. Gardé ici comme rappel que la doc mentait |

La suivante est ici pour la même raison, mais elle demande plus qu'une ligne : c'est un **arbitrage de KARMA avec un désaccord de Claude consigné en face**. Elle ne se rouvre que si le symptôme décrit en dernier paragraphe se manifeste.

#### D0 — 🧲 Magnétisme C5 : rayon non plafonné en unités plan ✅ vérifié 01/08

**Symptôme constaté par KARMA** : magnétisme actif + cercles d'intersection actifs → un cercle apparaît alors que les deux tracés ne se touchent pas.

**Deux causes distinctes, ne pas les confondre** :

1. **Les cercles ne signalent pas un contact.** `road.js > _calculerIntersectionsRoads` pose un cercle sur 3 règles, dont **la règle 2** : une *extrémité* à moins de `ROAD_PROXIMITY_TOLERANCE` (**8 px plan**) d'un segment voisin. Comportement **pré-existant et intentionnel** (rattrape les T-jonctions dessinées à la main), mais trompeur à la lecture.

2. **Mon rayon d'accrochage n'a pas de plafond en unités plan.** Il est défini en **pixels écran** (`snapDrawPx`, 14) converti au clic. En projection simple, 1 px écran = `2^(-zoom)` unités plan → **dézoomé à z = −3, 14 px écran = 112 unités plan**. L'accrochage happe alors un sommet très éloigné et **déplace le point bien au-delà de ce que l'user considère comme proche**. J'avais raisonné sur le plancher (zoomé = plus fin, tant mieux) et **oublié le plafond**.

**Décision KARMA (01/08)** : ne pas ajouter le plafond pour l'instant ; **basculer `showRoadIntersections` à `false` par défaut** (fait en v1.74.0 — 4 emplacements : `DEFAULT_CONFIG`, la normalisation `=== true`, la sauvegarde des prefs, et le résolveur per-plan `getPlanShowsIntersections`). Les users ayant activé le toggle explicitement (per-plan ou global) le **gardent** — seuls ceux qui n'y ont jamais touché basculent.

> ⚠️ **Désaccord consigné (Claude)** : masquer les cercles supprime le *signal*, pas la *cause*. Dézoomé, le point reste déplacé jusqu'à ~100 unités plan de l'endroit cliqué — la géométrie du tracé est altérée sans que rien ne le montre, et ça se répercute sur le graphe d'itinéraire. Le correctif est un `Math.min(tolÉcran, ~15 unités plan)` d'une ligne dans `road.js > _snapSurSommetProche`, aligné sur `PROXIMITY_TOLERANCE` du pathfinder. **À reconsidérer si un tracé fait au magnétisme dézoomé se révèle déformé.**

**Non traité** : les points déjà déplacés par un accrochage dézoomé. Ils sont dans les données, aucun moyen automatique de les distinguer d'un accrochage voulu.

## 🚫 Enterré volontairement — ne pas repayer

| Sujet | Statut |
|---|---|
| **Plein écran iPhone** | 2 tentatives (v1.9.2, v1.71.0), 2 rollbacks. ~47 px perdus, état stable. Un commentaire d'`index.html` **interdit une 3ᵉ tentative** sans diagnostic précis sur appareil |
| **QR Share Secours (Phase 4)** | Rollback structurel — densité QR v35+ illisible par les scanners. Remplacé par l'import consolidé v1.26 |
| **Import/Export Live** | Pause indéfinie, couvert par l'import consolidé |
| **Traversée de portail en Vue OSM** | Arbitré 01/08 : le mode OSM n'a ni position courante ni plan « où tu es » ; la pile multi-plans couvre déjà le besoin. Seul l'**affichage** des portails reste sur la table (D5) |

## ✅ Corrections d'inventaire — ne pas les re-signaler comme dettes

Signalées à tort (doc périmée), **elles sont faites** — vérifiées dans le code aux dates indiquées :
- **Heatmap** — active depuis v1.21.2 (chargée, précachée, 13 modules la consomment) · *01/08*
- **KMZ Secours Phase 2** — `_emitSecoursFolder` livré en v1.23.0 (Placemarks + Polygons cross-app) · *01/08*
- **`secoursPlan.groupes[].statut`** — exploité (cf. D8) · *01/08*
- **Migration du résolveur de styles (ex-§2, vagues 3 et 4)** — terminée. `check-style-canon` confronte **0 déclaration** · *31/08*
- **Bug 2 « couleur d'un type custom perdue en KMZ »** — corrigé en v1.76.0, verrouillé par `check-kml-styles.js` (22 contrôles) · *31/08*
- **Override de couleur des types built-in** (la demande d'origine du §2) — livré, couvert par `check-style-resolver.js` · *31/08*
- **ex-D6 « constantes `ITI_*` dupliquées »** — absorbé par le résolveur comme prévu ; les `ITI_*` survivants sont des constantes de **vitesse / pause / clés localStorage**, aucune couleur · *31/08*
- **`gpxIO.js` dans la migration des styles** — n'avait **rien** à migrer : le GPX n'a aucune notion de style · *31/08*
- **D1 « les PDF du Mode Histoire ne voyagent pas » — SOLDÉE** (v1.81.0) : case **opt-in décochée par défaut** dans l'export de profil (un plan peut porter 100 Mo), restauration **idempotente** qui conserve id, nom et date d'origine. Lecture/écriture via `window.JournalUi.histoire` — le schéma IDB n'a **pas** été recopié une 3ᵉ fois. Aller-retour prouvé en navigateur (contenu binaire intact, réimport sans doublon) + `check-profile-histpdf.js` (15ᵉ garde-fou, **falsifié 4×**) · *02/09*
- **D2 « contenus longs en espagnol » — SOLDÉE EN ENTIER** (v1.80.0) : ses 3 volets sont livrés — tutoriel (v1.79.4), doc user `README_USER.es.md` (3 501 lignes), et **Aide intégrée** (32 sections migrées du HTML en dur vers les dicos puis traduites ; `interfaceDocs.js` −1 738 lignes). Ajouter une 4ᵉ langue ne demande plus une ligne de code. Verrouillé par `check-aide-sections.js` (32 sections × 3 langues) et `checkup-langues.js` (parcours réel d un utilisateur espagnol) · *01/09*
- **Onboarding multilingue (part de D2)** — tutoriel migré fr/en/es en v1.79.4 (68 clés dans `es.json`) · *31/08*
- **D-home-mini « footer coupé sans scroll sous 760 px » — NON REPRODUITE, retirée** (v1.81.0) : rediagnostiquée sur **6 configurations** (1280→1920 × 500→768), footer déplié, 8 plans. Le contenu déborde (normal), **la molette scrolle** et le footer se rejoint **partout**. Deux postulats de la fiche d'origine étaient faux : la colonne Actions n'est pas « ~586 px incompressibles » (elle est **élastique** : 852 px à 1080 de haut, 520 px à 560), et `overflow-y:auto` sur `#planLoaderOverlay` date du **27/04** — donc antérieur à la mesure du 09/08, rien n'a été « réparé » entre-temps. 🩸 **Cause probable de la fausse mesure** : un overlay couvrait la page. Pendant le rediagnostic, **3 mesures successives** ont été faussées par le splash (retiré du DOM après 3,5 s, et `offsetParent` vaut `null` en `position:fixed` — donc l'attendre par `offsetParent` réussit trop tôt) puis par la modale `#kta-alert-modal` (« Accès hors-ligne », déclenchée quand le SW est bloqué). Les deux figent `scrollHeight` et mangent la molette : **exactement** le symptôme décrit. Comportement verrouillé par `scripts/smoke/checkup-home-scroll.js` (checkup de release, **falsifié 3×** : scroll cassé, modale laissée, splash non attendu) — il **refuse de conclure** si un overlay traîne, au lieu de rendre un faux vert · *02/09*
- **D5 « liaisons portails sur OSM » — SOLDÉE, mais pas sous la forme prévue** (v1.81.0) : le premier jet dessinait une polyligne entre les deux bouts de chaque portail. **KARMA a cassé la prémisse le 02/09** : deux portails bien calés *se superposent déjà*, donc la ligne est de longueur nulle et le calque ne montre **rien** dans le cas nominal. D5 n'était pas un calque de contenu mais un **détecteur d'erreur de calage** — sa seule valeur est le cas raté. Arbitré le 03/09 : **contrôle qualité** (liste classée du pire au meilleur dans les filtres de la Vue OSM, clic = `fitBounds` sur les deux bouts) **+ badge `📐 Écart de calage` dans 🌀 Mes liaisons**, le calque restant en complément. Le calcul vit dans `InterPlanLinks.ecartCalage` — **fonction unique**, consommée par la Vue OSM et jamais recopiée (leçon du bug des icônes portail, la veille). Retourne **`null` et jamais `0`** quand la mesure est impossible : `0` dirait « calage parfait », le contraire de « je ne sais pas ». **Aucun seuil de couleur** — 20 m est énorme sur une petite carrière et négligeable sur un réseau de 5 km. ⚠️ **Prouvé au harnais** : API et badge (33 m mesurés sur deux plans calés à 33 m, `null` sans géoréf). **Non exécuté** : la liste de la Vue OSM — le plein écran exige des plans réellement chargeables, hors de portée du harnais. À valider sur de vrais plans · *03/09*
