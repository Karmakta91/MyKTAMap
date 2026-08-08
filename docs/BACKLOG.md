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

---

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

⚠️ **Piège CRS** : QGIS exporte souvent en **Lambert 93 (EPSG:2154)** — mètres, pas degrés. **Aucune lib de reprojection vendored** (`lib/` = leaflet, jszip, jspdf, html2canvas, imageoverlay-rotated). Détection triviale (coords hors `[-180,180]`/`[-90,90]`).

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

**Extensions possibles plus tard** : Shapefile (lib ~50 Ko), reprojection proj4 (~30 Ko) pour accepter le Lambert 93 au lieu de le refuser, import des styles SIG.

---

### 2. 🎨 Légende — couleur des entrées par défaut

**Besoin** : pouvoir modifier la couleur d'une entrée de légende **built-in** (aujourd'hui seules les entrées **custom** portent `lineColor`/`fillColor`/`borderColor`).

**Audit fait le 01/08** — le round-trip est sain, le rendu ne l'est pas :

✅ **vérifié** — ce qui MARCHE : export/import de session (`sessionExporter` → `interfaceImportExport`), ZIP de plan (`createConf` → `loadPlanState`), transport GPX (`<extensions><myktamap:customLegend>`), cascade `session > plan > default`, IDs `cust-<ts36>-<rnd36>` (pas de collision inter-appareils).

#### 🐛 Bug 1 — zones « inaccessible » embarquées exportées en gris
✅ **vérifié** — [`exporter.js:2155`](../js/exporter.js#L2155) : `ZS_EMBED` (zones venant d'un **calque de données**) n'a **pas** `inaccessible`, alors que la table sœur des zones de session ([l.1956](../js/exporter.js#L1956)) l'a. Fallback explicite : `ZS_EMBED[z.type] || ZS_EMBED.remblais` → **une zone dangereuse ressort en tas de remblais** dans l'export PNG avancé.
> Récidive : le commentaire l.2164 documente **le même bug sur `jonction`**, corrigé en v1.7.1. `inaccessible` (v169) l'a reproduit. Symptôme d'un défaut structurel, pas d'un oubli.

#### 🐛 Bug 2 — types custom sans couleur en KMZ / GPX / Secours
✅ **vérifié** — [`kmzExport.js:860`](../js/kmzExport.js#L860) : `styleId = "road_" + r.type` → pour un custom ça donne `road_cust-abc123`, **jamais défini** dans `STYLES_KML` (l.309-325, built-in uniquement) → `<styleUrl>` pendant → **trait par défaut dans Google Earth, couleur perdue**. Même famille : `gpxIO.js`, `secoursMode.js`, `emergencyMode.js` (tables propres, aucun appel à `findCustomEntry`).
> ✅ `pdfExport.js` est **hors de cause** (accusation retirée après vérif) : il délègue à `_genererCanvasExportPublic`, donc il hérite du rendu d'`exporter.js`, customs compris.
> ⚠️ **non vérifiés** : `createConf.js`, `tableEditor.js`.

#### 🧱 Le fond — une trentaine de tables pour 13 types built-in
✅ **vérifié** — tracés **9 tables** · zones **11** · structures **11**, réparties sur 12 fichiers. `utils.js` en porte 3 copies, `exporter.js` 2 à 4. Et `legendCustomization.js > DEFAULT_RENDERS` (pastilles de la légende) est **indépendante** de `ROAD_STYLES` (la carte) : elles coïncident aujourd'hui, rien ne le garantit — le jour où elles divergent, **la légende ment sur la carte** sans qu'aucun test ne le voie.

**Décision KARMA (03/08) : option `1` — lot 0 complet, puis la couleur.**

#### 🟢 Vague 0 — LIVRÉE (03/08)
- `js/styleResolver.js` : table **canonique** des 13 types built-in + `window.ktaResolveStyle(catégorie, clé)`. Résout aussi les types **custom** via `LegendCustomization`. Rend un **objet neuf** à chaque appel (un consommateur qui mute son style ne contamine personne).
- `scripts/check-style-canon.js` — **pré-commit bloquant**. Confronte les tables encore présentes dans le code à la table canonique : **105 déclarations vérifiées, aucune dérive**. Tant que la migration n'est pas finie, c'est lui qui empêche une table de repartir en vrille.
- `scripts/check-style-resolver.js` — **pré-commit bloquant**, 21 cas (built-in, customs, inconnus, non-contamination, module absent, `findCustomEntry` qui jette).

⚠️ **Découverte du relevé exhaustif — 2 VARIANTES DÉLIBÉRÉES, à ne jamais « corriger »** : `emergencyMode.js` a une palette entière plus vive pour la mini-carte d'urgence, et `osmView.js`/`osmHomePreview.js` rendent `inaccessible` en aplat orange (le motif hachuré SVG n'existe pas sur fond OSM). **Les deux sont commentées dans leur fichier d'origine.** Unifier aveuglément aurait changé le rendu de deux écrans sans que personne l'ait demandé — c'est exactement ce que la comparaison préalable a évité. Elles sont inscrites en `EXCEPTIONS` dans le script de contrôle, ce qui rend tout nouvel écart **volontaire et visible**.

#### 🟢 Vague 1 — LIVRÉE (04/08) — la carte
`road.js`, `zones.js`, `structures.js` ne déclarent plus aucun style : ils appellent `ktaResolveStyle`. **3 tables supprimées, 14 déclarations en moins** (le contrôle passe de 105 à 91 confrontations).

🔴 **Ce que la migration a révélé — la table canonique de la vague 0 contenait 3 valeurs FAUSSES.** Elles n'ont jamais été livrées (aucun consommateur ne l'appelait), mais un `check-style-canon` limité aux couleurs ne pouvait pas les voir :

| type | valeur réelle | canon vague 0 | effet si migration à l'aveugle |
|---|---|---|---|
| `pilier-1/2`, `mur` | `weight: 3` | `weight: 2` | contour noir aminci |
| `front-1/2` | `weight: 10` + `fillColor` + `isPolyline` | `weight: 5` seul | fronts 2× plus fins, flag de rendu perdu |
| `inaccessible` | `url(#kta-pattern-inaccessible)`, `fillOpacity: 1` | `#7a0000` / `0.65` | **perte des hachures** |

Origine : `#7a0000`/`0.65` avait été relevé sur les tables d'**export** (qui ne savent pas peindre un motif SVG) et le `2` sur `kmzExport`, où `width: 2` est une largeur **KML** — pas un `weight` Leaflet.

**Corrections apportées :**
- Le canon porte désormais la valeur **rendue à l'écran**, et `inaccessible` déclare son aplat de repli. Les contextes sans motif SVG demandent `ktaResolveStyle(cat, clé, { flat: true })` → prêt pour les vagues 2 et 3.
- `check-style-canon.js` compare maintenant aussi **`weight` et `fillOpacity`** (`width:` du KMZ reste volontairement non assimilé à `weight:` — unités différentes). Vérifié en falsifiant le canon : le contrôle mord.
- Le repli des **customs** est devenu **conscient de la catégorie** : un front custom garde `weight: 10` + `isPolyline`, un pilier custom son contour noir et son `fillOpacity: 0.85`. Un gabarit générique unique les aurait tous ramenés à celui des zones.
- `check-style-resolver.js` : 21 → **30 cas**.
- `index.html` : `styleResolver.js` remonté **avant** ses consommateurs — il était chargé après, et son commentaire affirmait le contraire.

#### 🟢 Vague 2 — LIVRÉE (04/08) — les exports image
`exporter.js` (5 tables) et `utils.js` (6 tables) ne déclarent plus aucun style. **64 déclarations en moins** (91 → 27 confrontations).

- ✅ **Bug 1 corrigé** — `ZS_EMBED` n'avait pas `inaccessible`, et le repli `|| ZS_EMBED.remblais` rendait l'oubli invisible.
- ✅ **Bug non répertorié, trouvé pendant la migration** — les 3 tables des **data layers** de `utils.js` n'interrogeaient **pas** `LegendCustomization` : un tracé custom embarqué sortait **blanc**, une zone custom **gris remblais**, une structure custom **bleu mur**, et une structure custom *polyline* était traitée en **polygone** (min. 3 points). Le même objet dessiné en session s'affichait pourtant correctement.
- Deux helpers, parce que les cibles diffèrent : `_ktaStyleMap` (Leaflet, peint le motif SVG) et `_ktaStyleCanvas` (`{ flat: true }`).

#### 🔜 Vagues suivantes
3. **KMZ / GPX** — `kmzExport.js`, `gpxIO.js` → **corrige le bug 2**
4. **Reste** — `interfaceLegende.js`, `statsGlobales.js`, `interfaceDistanceTotale.js`, **+ `refonteInterface.js` et `sessionReport.js`** (oubliés du recensement initial, cf. §2bis)
5. **Alors seulement l'override couleur** : une entrée dans le résolveur, qui atteint tout le monde par construction

⚠️ **Correction d'inventaire** : `secoursMode.js` n'a **rien à migrer** — ses tracés sont coloriés par **couleur d'équipe**, pas par type. Il était listé à tort en vague 4 ici et dans l'en-tête de `styleResolver.js`.

---

### 2bis. 🔍 Audit Légende (04/08) — le round-trip est cassé

**Question KARMA** : « je crée un type custom, je dessine, j'exporte en calque de données, je régénère un plan avec — quel comportement ? dois-je ré-importer la légende ? »

**Réponse : la définition de légende ne voyage pas, et AUCUN chemin d'UI ne permet de la ré-importer.**

L'**id** (`cust-XXXX`) est bien sérialisé sur chaque objet, mais le payload `devmap-data` n'a aucun champ `customLegend` ([`sessionExporter.js:2553`](../js/sessionExporter.js#L2553)), et [`createConf.js:2091`](../js/createConf.js#L2091) ne le lirait pas même s'il y était. À l'ouverture du plan régénéré : tracé custom → **blanc**, zone custom → **gris remblais**, structure custom → **bleu mur** (et un *front* custom se referme en polygone plein). **Aucune ligne n'apparaît dans ≡ Légende** — le panneau ne liste que `customEntries`, il ne scanne jamais les objets dessinés.

Chemins de réparation évalués, tous impraticables : l'import de session ramène la légende mais **duplique tous les objets** · recréer l'entrée à la main génère un **nouvel id** (aucun champ ne permet de saisir un id existant) · l'option « Légende personnalisée du plan » des KMZ/GPX lit `PLAN_CONFIG.customLegend`, jamais la session. Seule solution réelle : éditer `plan-config.json` à la main dans le ZIP.

#### 🟢 Correctifs livrés (04/08)

| | Symptôme | Fichier |
|---|---|---|
| ✅ **F1** | Granularité **fine** : tous les objets de type custom étaient **supprimés de l'export**, sans un log. `_trierParType` les rangeait dans `out.autres`, jamais écrit dans aucun fichier. *(3ᵉ occurrence du défaut : `jonction` l'avait déjà subi, corrigé en v169.)* | `sessionExporter.js` — déversoir `_emettreTypesRestants`, 1 fichier par type restant |
| ✅ **F4** | `gpxIO.js` convertissait **tout type custom en `chemin`** à l'import — perte de donnée, pas seulement de couleur. `gpxImport.js` (générateur) avait reçu ce correctif en v1.21.1, ce lecteur-ci avait été oublié | `gpxIO.js:511` |
| ✅ **F5** | La légende **fuyait d'un plan à l'autre** : `loadSessionState` n'était appelé que si un slot de session existait. Plan jamais visité → les types custom du plan précédent restaient affichés, dessinables, puis écrits dans le slot du nouveau plan | `sessionPersist.js` — reset avant restauration |
| ✅ **F9** | **Toute zone custom naissait avec un contour vert fluo** `#00ff00` : la case « trait » est `checked` dans le HTML, la branche `zones` la masquait sans la **décocher** → `lineColor` prenait la valeur par défaut d'un color picker jamais affiché, puis était promue en `borderColor`. Idem pilier/mur custom (vert au lieu de noir) | `legendCustomization.js` + son **clone** dans `exporter.js` |

#### 🟢 TABLEAU VIDÉ (05/08) — les 23 constats de l'audit sont clos

Tout ce qui suit est **corrigé et vérifié par garde-fou** (commits `e0f4bc3` → suivants) :

| | Résolution |
|---|---|
| ✅ F2/F3 | la légende **voyage** avec le calque de données (restreinte aux types référencés) et le générateur la lit. Conflit d'id : **l'existant du plan gagne**, écarts journalisés, ré-import idempotent. Garde-fou `check-legend-roundtrip.js` (18 cas, code extrait des fichiers réels) |
| ✅ F6/F7 | décision KARMA : « masquer » ne concerne **que la boîte de légende** (le masquage carte vit dans 🔍 Filtres) — phrase d'aide ajoutée, et un custom masqué reste **dessinable** (alignement built-in/custom, les 2 sites de construction sidebar) |
| ✅ F8 | suppression d'un type utilisé → **confirmation avec décompte réel** (`countUsages`, session + calques) |
| ✅ F10 | icônes custom **utilisables** : enregistrées dans `_iconMap`, proposées dans l'éditeur de point, resynchronisées en cours de session. Garde : un id `cust-…` n'est jamais écrit dans `PLAN_CONFIG.icons` (lu en premier par la cascade) |
| ✅ F11 | Filtres affiche ✨ + libellé via `findCustomEntry` |
| ✅ F12 | option KMZ/GPX : fusion **plan + session** (la session prime), branchée aux 4 sites |
| ✅ F13 | ZIP Avancé : fichier `session_legend.json`. *(Vérifié : format d'export SEUL, aucun importeur — le tort était une archive qui ne se décrivait pas)* |
| ✅ F14 | Distance totale : types **présents** (customs inclus), modale générée, filtres/surlignage/breakdown dynamiques |
| ✅ F15/16/17 | stats, barres session et rapport passés au résolveur (vague 4) |
| ✅ F19 | le clone de 209 lignes de la dialog « ajouter » dans `exporter.js` est **supprimé** → délégation à `LegendCustomization.ouvrirAddDialog` (exposée, gardée par check-api-surface) |
| ✅ F20 | `tableEditor` : colonne `type` avec **datalist** des types valides (canon + customs) + avertissement console sur type inconnu. Pas de blocage (un type inconnu peut être voulu) |
| ✅ F21 | `listCustomEntries` **déduplique** par id (session prioritaire, ordre plan-d'abord conservé — même règle que `findCustomEntry`) |
| ✅ F22 | `hidden` au format tableau est **migré en objet** au chargement (`_hiddenEnObjet`) — plus de masquages perdus en silence |
| ✅ F23 | ≡ Légende affiche un **bandeau ⚠️ types orphelins** (types + nombre d'objets + quoi faire), recalculé à chaque refresh |
| ✅ N1 | les **calques de données se repeignent à chaud** après un changement de couleur (`_ktaRestyleDataLayers` : couleurs seules, les opacités restent la propriété du filtre multi-niveau, réappliqué juste après) |
| ✅ N2 | les icônes de la **sidebar** suivent la couleur choisie (`ktaTypeSwatchHtml` — les émojis 🟩🟥🟡 étaient des glyphes à couleur figée). Émojis conservés là où ils sont des symboles : 🪜 ⛔ ✅ |

**Résiduel assumé (N2-r)** : les **titres de popup** (`🟩 Tracé principal`) gardent leur émoji figé après un override — `attacherNotePopup` échappe son texte (anti-XSS voulu), une pastille HTML y sortirait en texte brut. Cosmétique, non corrigé volontairement.

> **Limites de l'audit d'origine** : lecture statique uniquement. F1, F5, F9 revérifiés à la main ; F1 exécuté sur données synthétiques. Le **checkup destructif complet** du module (à la SIG) est la prochaine étape avant le push prod v1.76.0.

---

### 3. 📦 Export de profil AVEC les archives de plans

**Besoin KARMA (01/08)** : « j'ai importé N plans au fil du temps, tous en base locale ; j'exporte mon profil et je récupère liste/sessions/liaisons **mais pas les ZIP** — or je les ai supprimés de mon PC, la seule copie restante est dans la base du navigateur ».

**État : 🟡 récupération UNITAIRE livrée (v1.74.0), export FULL à faire.**

✅ Fait — bouton **💾 Télécharger le ZIP** dans la modale ℹ️ Infos d'un plan (`homeLoader.js > _afficherInfosPlan`). `PlanRegistry.getBlob(id)` était **déjà public** : il ne manquait que l'exposition. **3 états**, le bouton étant **affiché grisé plutôt que masqué** quand la récupération est impossible (sinon on cherche pourquoi certains plans l'ont et d'autres non) :
- plan **serveur** → pas de bouton (retéléchargeable, rien à sauver)
- **`storedBlob`** → actif ; nom de fichier = `originalFilename`, sinon reconstruit depuis nom+version
- **`fsHandle`** ou **re-sélection** → grisé + explication (le ZIP vit sur le disque, pas dans l'app)

⚠️ Garde-fou : `storedBlob` n'est qu'un **flag du registre**. Le navigateur peut avoir évincé l'archive sous pression de quota sans que le flag bouge → si `getBlob` rend vide, message explicite (« le navigateur l'a supprimée pour libérer de la place ») plutôt qu'un fichier vide téléchargé.

❌ **Reste — export FULL** (décisions déjà prises, non implémenté) :
- **Format** : conteneur **ZIP** (`profil.json` + `plans/<id>.zip`), **pas** le JSON actuel — le base64 inline gonfle de +33 % et `JSON.stringify` construit tout en RAM → plantage assuré sur mobile, risqué sur PC.
- **Compression `STORE`** : les ZIP de plans sont déjà compressés, recompresser coûte du temps pour rien.
- **Aller-retour** : à l'import, réinjecter les blobs en base **et** rattacher aux entrées du registre (flag `storedBlob`, collisions d'`id`). C'est ce qui a de la valeur, et c'est le gros du coût.
- **Sélection + garde-fou de taille** plutôt que tout-ou-rien : liste des plans avec tailles et total, refus/avertissement franc au-delà d'un seuil selon la plateforme (iOS plafonne autour de 50 Mo, Android/desktop plusieurs Go).
- **Piste RAM** : File System Access API (`showSaveFilePicker` + flux d'écriture) pour écrire sur le disque sans tout garder en mémoire — **Chrome/Edge desktop uniquement**, fallback blob ailleurs. [Probable — l'API de flux de JSZip existe, non testée ici]

## 🧹 Code mort — audit du 09/08/2026 (2 agents indépendants + scan i18n)

> **Numéros de ligne ancrés sur le commit `bbd954e`** — ils dérivent à chaque suppression : exécuter les lots dans l'ordre, ou re-vérifier les ancres. Rapports complets rendus en session du 09/08 ; l'essentiel actionnable est ici.
> **Décision KARMA : topo validé le 09/08 (reco) · lots ①②③④ EXÉCUTÉS le 09/08** — restent les 🟡 (à la demande) et les [Probable] CSS sautés par prudence (drawer perf, profile-pro-meta, tracker-replay-modal, fourre-tout ambigu). Bugs latents : batterie fantôme SUPPRIMÉE (arbitrage KARMA — le chip header vit), toast OSM RESSUSCITÉ (bon id), fuite blob URLs COLMATÉE (revoke branché avant chaque extraction), _setOptedIn doublon supprimé.

### ⚠️ Correctif d'inventaire préalable
La liste « règles CSS mortes » de l'audit du 09/08 matin (consignée dans le commit `a87311a`) était **majoritairement fausse** : sur 76 paires de sélecteurs dupliqués, **8 seulement sont intégralement mortes** — le reste est du *layering volontaire* de la refonte loader (override **partiel** : l'antécédent porte des propriétés qui survivent, le supprimer casse le layout). Toute suppression de jumelle doit être vérifiée **propriété par propriété**, jamais au sélecteur.

### 🐛 3 bugs latents découverts par l'audit (à traiter AVANT le nettoyage — ce ne sont pas des lignes à jeter)
1. **`refonteInterface.js:850-863`** — la stat batterie de la status bar ne s'affiche **jamais** : l'id `kta-refonte-stat-battery` n'est créé nulle part (`if (stat)` toujours faux). Arbitrage : créer l'élément dans `_creerStatusBar`, ou supprimer le bloc + la clé i18n `ui.refonte.battery_unavailable_title` + les classes CSS associées.
2. **`osmView.js:1944-1961`** — `_toast()` vise `kta-osm-modal` qui n'existe pas (le vrai id : `kta-osm-view-overlay`) : le toast contextuel de la modale OSM n'a jamais fonctionné, repli silencieux sur `showToast`. Corriger l'id ressuscite 17 lignes.
3. **`osmHomePreview.js:1427`** — `_revokeTilesBlobUrls()` jamais appelé malgré son commentaire (« appelé au close() ») : **fuite RAM potentielle** de blob URLs de tuiles. Vérifier si la révocation existe ailleurs ; sinon la bonne action est de l'APPELER, pas de le supprimer. (Idem `_setOptedIn` `:246` — l'opt-in OSM home n'est jamais écrit par cette voie : par où passe-t-il ?)

### 🟢 Lot JS — ~265 lignes, suppression sûre (26 items, preuve grep « occurrence unique corpus complet » pour chacun)
- `interface.js` (~105 l.) : `ouvrirPanneauAncre` (447-507), `_confirmerAction` (535-552), `_sessionAModif` (63-78), `_activerMode` (716-723), `_orig*_wrap` (510-511)
- `osmView.js` (~59 l.) : `_project3Corners` (410-445), `_planRecommendedZoom` (344-349), corps `_toast` (si bug n°2 tranché en suppression)
- `secoursMode.js` : `updateNoteLibre` (1212-1229) + flag `hasSecours = true` et ses branches mortes (4344/4406/4440)
- `map.js` : alias `layerPuits/Vehicule/Cataphile/Carry` (544-547), `_ktaOverlays` (538)
- Divers : `searchPoints._matchesFilters` (347-357), `statsGlobales._drawText` (926-932), `pdfExport._checkExporter` (96-99) + `FOOTER_HEIGHT_MM` (40), `modeHistoire._hasEmbeddedPdf` (262-264), `lostMode._getLostPreset` (103-105) + `COLOR_LAST_POS`/`COLOR_MATCH_OUT` (75/77), `measure.getMeasureValue` (443-450), `homeProfile._kta_invalidateStorageCalcCache` (786-790), `config/main RAW_PLAN_CONFIG` (jamais lu — retient un gros objet en RAM), `refonteInterface isUnavailable=false` (828-831) + clé i18n et classes `battery_unavailable` associées

### 🟢 Lot CSS — 778 lignes + 1,92 Mo d'assets, suppression sûre
- **Assets** (1,92 Mo) : `lib/leaflet/leaflet-src.js.map`, `leaflet-src.esm.js.map`, `leaflet.js.map`, `images/marker-icon.old`, `icon/app-icon.svg` (hors manifest et précache)
- **Blocs orphelins** (745 l., classes à 0 occurrence dans 251 fichiers) — les gros : vieux toggles OSM home (5026-5077+), ancien nommage recherche (17048-17092+), UI loader repliable (6028-6071+), drawer perf (6542-6584+), boussole secours retirée (7951-8144 partiel), modale choix-suppression (15432+17424), sections tracker-warn dépeuplées (11676-11712), switcher/mlvl/legend-add/photo-viewer-hint/lost-param divers — liste ligne à ligne dans le rapport de session
- **9 jumelles intégralement mortes** (33 l.) : 699-703, 9746-9751, 15420-15423, 15124-15127, 4916-4918, 14345-14347, 14358-14360, 14373-14375, 5938-5944
- **HTML** : classe `.kta-loader-contact` (index.html), seule morte sur 109 ids

### 🟡 À vérifier avant de toucher
- Fragments de sélecteurs morts dans des groupes vivants (supprimer la ligne du sélecteur, pas le bloc) : `.kta-btn-action` 19843+, `.plan-card` ×4, `.kta-modal-btn-*` 17302/17312, `.kta-mesure-distance` 13606, `.drag-over` 16866, `.kta-rd-total-pill` 14621, `style-secours.css:829` — contrôle runtime (`querySelectorAll(...).length === 0`)
- `kta-toast-error/info` : classes **concaténées** (`"kta-toast-" + type`) — NON supprimables sans inventaire des `type`
- JS : événement `kta:imgLayerCalibChange` (0 listener — extension volontaire ?), `getTrackerLevel` (« phase 2B » — abandonnée ?), scope `kta-ses-modal` inexistant dans sessionExporter:3495 (bug de scope bénin ?), ~13 exports d'API publique jamais consommés (API = contrat, gain faible risque non nul)
- **i18n : 1 071 clés hors du champ du scanner — PAS un gisement de suppression** : les gros paquets (`export.conv` 42, `home.profile` 42, `export.adv` 31, `lost.*`…) sont des modules vivants appelés via des motifs non couverts (templates, helpers locaux). Chantier = étendre le scanner, PUIS trier le résidu.

### 📌 Mort documenté — gardé exprès, ne pas supprimer sans arbitrage KARMA
`_renderMultiLevelSection`/`_bindMultiLevelToggle` (interfaceConfig, 49 l., rétro-compat v1.7.3) · wrappers compat exporter/measure · `_proHashShort`/`_proSourceLabel` · dispatch `mktm:secours-scenario-mutated` (point d'extension pro) · `__ktaStyleCanon` (diagnostic) · `PERF_MODE_SIZE_BYTES` (alias rétro-compat) · `__MKTM_PRO_LICENSE__` (contrat d'en-tête) · branche mono-alerte d'alertChecker (**garde-fou réseau légitime** : une instance auto-hébergée peut servir l'ancien format) · `ktaCouperModesOutils` (console/debug)

### ✅ Résultats négatifs (hygiène confirmée, rien à faire)
108 fichiers js/ = 108 script tags = 108 entrées précache (zéro orphelin) · précache SW 188/188 présents sur disque · les 4 CSS lazy parfaitement cloisonnés (0 duplication avec style.css) · 29/30 icônes référencées · 0 id HTML orphelin.

## 🔴 Dettes ouvertes

### D-confirm — 🪟 confirm() natifs hors charte (10+ fichiers) — noté 07/08/2026

`window.ktaConfirm` (utils.js, v1.76.2, Promise + charte) existe depuis le retour KARMA sur la popup de replanification d'itinéraire. Les `confirm()` natifs restants (createConf, exporter, homeConfig, homeLoader, homeProfile, interface, interfaceConfig, interfaceLegende, journalUi…) **migrent au fil de l'eau** quand on touche leur module — pas de sweep massif (risque de régression sur des flux critiques type suppression). Nouveaux usages : `ktaConfirm` obligatoire. Attention à la migration : `ktaConfirm` est **asynchrone** (le code qui suit un `if (!confirm(...)) return;` doit passer en `.then()`).

### D-tutorial — 🌍 tutorial.js hors i18n (audit 06/08)

`UI_STRINGS` + `CARDS`/`CARDS_EN` codés en dur fr/en, propre `_t()` qui n'utilise jamais `window.I18n` — un utilisateur **es** voit l'onboarding en français. Migration vers les dicos `lang/` à faire. (~90 chaînes.)

### D0 — 🧲 Magnétisme C5 : rayon non plafonné en unités plan ✅ vérifié 01/08

**Symptôme constaté par KARMA** : magnétisme actif + cercles d'intersection actifs → un cercle apparaît alors que les deux tracés ne se touchent pas.

**Deux causes distinctes, ne pas les confondre** :

1. **Les cercles ne signalent pas un contact.** `road.js > _calculerIntersectionsRoads` pose un cercle sur 3 règles, dont **la règle 2** : une *extrémité* à moins de `ROAD_PROXIMITY_TOLERANCE` (**8 px plan**) d'un segment voisin. Comportement **pré-existant et intentionnel** (rattrape les T-jonctions dessinées à la main), mais trompeur à la lecture.

2. **Mon rayon d'accrochage n'a pas de plafond en unités plan.** Il est défini en **pixels écran** (`snapDrawPx`, 14) converti au clic. En projection simple, 1 px écran = `2^(-zoom)` unités plan → **dézoomé à z = −3, 14 px écran = 112 unités plan**. L'accrochage happe alors un sommet très éloigné et **déplace le point bien au-delà de ce que l'user considère comme proche**. J'avais raisonné sur le plancher (zoomé = plus fin, tant mieux) et **oublié le plafond**.

**Décision KARMA (01/08)** : ne pas ajouter le plafond pour l'instant ; **basculer `showRoadIntersections` à `false` par défaut** (fait en v1.74.0 — 4 emplacements : `DEFAULT_CONFIG`, la normalisation `=== true`, la sauvegarde des prefs, et le résolveur per-plan `getPlanShowsIntersections`). Les users ayant activé le toggle explicitement (per-plan ou global) le **gardent** — seuls ceux qui n'y ont jamais touché basculent.

> ⚠️ **Désaccord consigné (Claude)** : masquer les cercles supprime le *signal*, pas la *cause*. Dézoomé, le point reste déplacé jusqu'à ~100 unités plan de l'endroit cliqué — la géométrie du tracé est altérée sans que rien ne le montre, et ça se répercute sur le graphe d'itinéraire. Le correctif est un `Math.min(tolÉcran, ~15 unités plan)` d'une ligne dans `road.js > _snapSurSommetProche`, aligné sur `PROXIMITY_TOLERANCE` du pathfinder. **À reconsidérer si un tracé fait au magnétisme dézoomé se révèle déformé.**

**Non traité** : les points déjà déplacés par un accrochage dézoomé. Ils sont dans les données, aucun moyen automatique de les distinguer d'un accrochage voulu.

| # | Dette | Preuve | Impact |
|---|---|---|---|
| D1 | **PDF du Mode Histoire absents de l'export de profil** (IDB `myktamap_histoire_pdfs`, jusqu'à 100 Mo/plan) → l'onglet 📖 Récits arrive avec ses notes libres mais **sans les PDF** | ✅ vérifié 01/08 | Migration d'appareil incomplète. Décision : section optionnelle décochée par défaut, sur le modèle des photos ? |
| D2 | **Doc user, Aide intégrée et onboarding restent FR/EN** alors que l'app est ES à 100 % (3721 clés) | ✅ vérifié (pas de `README_USER.es.md`) | Un hispanophone ouvre 📚 Documentation et tombe en français |
| D3 | **Toggle « Mes annotations » ne masque pas les polylines roads** sur certaines configs | 🔬 hypothèse — [`rendering-leaflet.md`](architecture/rendering-leaflet.md) | Piste : ce n'est probablement PAS Leaflet mais une **course au boot** — `_targetLayerForRoad` retombe sur `window.map` quand `layerEditor` n'existe pas encore → road orpheline pour toujours. **Vérif** : `window.layerEditor.hasLayer(<layer>)` sur les tracés récalcitrants |
| D4 | **`<script>` inline d'`index.html`** reste un monolithe (config/PIN, profil, loader plans — état partagé + monkey-patch) | ⚠️ doc seule | Chaque intervention dedans est chère et risquée |
| D5 | **Vue OSM lot 3** — liaisons portails dessinées entre plans | ✅ vérifié (arbitré 01/08 : la traversée n'a pas de sens, seul l'affichage en a) | Intérêt réel = **diagnostic de géoréf** (l'écart entre les 2 bouts d'un portail révèle un mauvais calage). Coût principal = 6ᵉ catégorie dans le système de filtres |
| D6 | **Constantes `ITI_*` dupliquées** de `road.js > ROAD_TYPES.itinerary` | ⚠️ doc seule | Sync manuelle si le style iti change. Sera absorbé par le résolveur central (sujet 2) |
| D7 | **Duplication ~2 fonctions** pickers géoréf ↔ picker départ tracker | ⚠️ doc seule — [`tracking.md`](architecture/tracking.md) | Seuil explicite : mutualiser **si une 3ᵉ cible apparaît**. Pas atteint → ne rien faire |
| D8 | **`secoursPlan.groupes[].statut`** — ⚠️ signalé mort par la doc, **il est exploité** | ✅ vérifié (doc corrigée) | Aucune action. Gardé ici comme rappel que la doc mentait |

## ⚫ Dette de process (se recrée toute seule)

**La règle des 4 axes de `CLAUDE.md` n'est vérifiée par rien.** Le hook `pre-commit` contrôle les fuites pro, pas la fraîcheur des docs. Constaté : `AI_CONTEXT.md` n'avait **jamais** reçu les nouveautés v1.73.0 (point C géoref, mode kiosque) — pendant une version entière, l'Aide IA a répondu « ça n'existe pas » sur deux features livrées.

**Piste** : le hook compare la version des 3 sources et **refuse un commit `release(...)`** si `AI_CONTEXT.md` / `NETWORK_AUDIT.md` n'ont pas bougé. ~1 h, et la dette cesse de se recréer.

## 🚫 Enterré volontairement — ne pas repayer

| Sujet | Statut |
|---|---|
| **Plein écran iPhone** | 2 tentatives (v1.9.2, v1.71.0), 2 rollbacks. ~47 px perdus, état stable. Un commentaire d'`index.html` **interdit une 3ᵉ tentative** sans diagnostic précis sur appareil |
| **QR Share Secours (Phase 4)** | Rollback structurel — densité QR v35+ illisible par les scanners. Remplacé par l'import consolidé v1.26 |
| **Import/Export Live** | Pause indéfinie, couvert par l'import consolidé |
| **Traversée de portail en Vue OSM** | Arbitré 01/08 : le mode OSM n'a ni position courante ni plan « où tu es » ; la pile multi-plans couvre déjà le besoin. Seul l'**affichage** des portails reste sur la table (D5) |

## ✅ Corrections d'inventaire — ne pas les re-signaler comme dettes

Ces trois-là ont été signalées à tort le 01/08 (doc périmée), **elles sont faites** :
- **Heatmap** — active depuis v1.21.2 (chargée, précachée, 13 modules la consomment)
- **KMZ Secours Phase 2** — `_emitSecoursFolder` livré en v1.23.0 (Placemarks + Polygons cross-app)
- **`secoursPlan.groupes[].statut`** — exploité (cf. D8)
