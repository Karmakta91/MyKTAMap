# Architecture MyKTAMap — Exports PNG/PDF/KMZ/GPX + légende

> Référence détaillée extraite de l'ancien CLAUDE.md. Lue à la demande (pas auto-chargée).
> Sections : §5, §32, §44, §45, §54, §55, §59, §68

---

### 0. 🎨 v1.76.0 — styles résolus + la légende voyage (résumé, détails dans `rendering-leaflet.md` §0)

- **Plus aucune table de couleurs dans les exports** : toutes les pipes canvas (`exporter.js`, `utils.js`) et le KML (`kmzExport.js`) demandent `ktaResolveStyle(cat, clé, {flat:true})` — l'aplat de repli remplace le motif SVG d'`inaccessible`. Les **largeurs/alphas KML restent locaux** (unité ≠ Leaflet, figés par `scripts/check-kml-styles.js`) ; un type custom reçoit désormais son `<Style>` KML (avant : `styleUrl` pendant → couleur perdue dans Google Earth).
- **La légende voyage** : payload `devmap-data` → champ `customLegend` **restreint aux types référencés** (`sessionExporter.js > _legendePourPayload`) ; lu par `createConf.js > _absorberLegendeCalque` (conflit : **l'existant du plan gagne**, ré-import idempotent, garde-fou `check-legend-roundtrip.js`). ZIP session Avancé → `session_legend.json`. Option KMZ/GPX « Légende personnalisée » → **fusion plan + session** (`_legendeCompleteAExporter`, la session prime).
- **Granularité fine de la conversion** : le bucket `autres` (types non built-in) est **émis** en `roads_<type>.json` etc. (`_emettreTypesRestants`) — avant, les objets custom étaient silencieusement supprimés de l'export.

---

### 4. Export de session filtré — période et auteur (`js/sessionExporter.js`)

Onglets **Complet** et **Avancé** : bloc « 🔎 Ne garder que » — du / au (date de dernière modification, `updatedAt`)
et, sur une installation reliée, « Créé par » (prise `auteurObjet`, `community-server-line.md` §3). Le filtre agit dans
`_compter()` sur les **annotations** (points, tracés, zones, structures) : résumé, photos des points retenus et fichier
exporté suivent ; suivi, mesures et notes partent tels quels. Un objet sans date (ou sans auteur connu) n'est pas retenu
par un filtre qui porte sur ce critère. Remis à zéro à chaque ouverture ; les autres onglets (conversion, fusion, KMZ,
GPX) ne sont pas filtrés.

### 5. Légende exportée — 5 groupes équilibrés (depuis 06/05/2026)

Sections (cohérent avec la légende d'aide) :

1. 🕳️ Puits
2. 🪜 Accès
3. ⚠️ Signalétique
4. 🛣️ Tracés
5. ⬛ Zones
+ 🏷️ Autres (auto si tags custom)

**Algorithme** : chaque groupe est ajouté à la **colonne la moins haute** (en lignes cumulées).

**Filtrage par usage réel** : la légende n'affiche que les tags **effectivement présents** sur le plan exporté (via `tagsUtilises` collecté pendant le dessin des markers).

---

### 32. Export KMZ géolocalisé (`js/kmzExport.js`, depuis v170)

Export terrain géoréférencé au format KMZ standard (OGC) ouvrable dans **Google Earth, OsmAnd, Locus, Avenza, ArcGIS Earth**, etc. L'utilisateur saisit 2 couples `(point_plan, point_GPS)` → l'app calcule une transformation affine 2D similarity (rotation + scale + translation) qui mappe chaque coord plan vers (lat, lng).

#### 32.1 Math affine 2D

**`buildTransform(planA, planB, gpsA, gpsB)`** retourne `{refPlan, refGps, metresParPixel, rotation, latMoyenne}`.

Algorithme :
1. Vecteur plan AB : `dxPlan = Bx - Ax`, `dyPlan = -(By - Ay)` (y **inversé** car axe image vers le bas, math standard vers le haut)
2. Vecteur GPS AB converti en mètres via projection équirectangulaire locale :
   - `dxGps = (lngB - lngA) * 111320 * cos(latMoy)` (E-W)
   - `dyGps = (latB - latA) * 110540` (N-S, constante car latitude varie peu en local)
3. `metresParPixel = |AB_gps| / |AB_plan|` (échelle uniforme)
4. `rotation = atan2(dyGps, dxGps) - atan2(dyPlan, dxPlan)` (delta angles)

**Validations** :
- `|AB_plan| ≥ 50 px` (sinon imprécision énorme — fail safe)
- `|AB_gps| ≥ 1 m` (sinon dégénéré)

**`planToGps(t, x, y)`** : applique la transformation inverse pour mapper un (x, y) plan vers (lat, lng).

**Extension future** : la math est conçue pour facilement passer à 3+ points (least squares) si besoin de plus de précision sur les plans très étendus ou non-rigides.

#### 32.2 Format KMZ

KMZ = ZIP standard avec :
- `doc.kml` : XML KML 2.2 + namespace gx 2.2 (pour `<gx:LatLonQuad>`)
- `files/<plan>.png` : image plan référencée dans `<GroundOverlay>`
- `files/icons/<tag>.png` : 1 icône par tag rencontré dans les Placemarks

Structure KML :
```xml
<Document>
  <Style id="point_pa">...</Style>          <!-- 1 par tag -->
  <Style id="road_principal">...</Style>    <!-- 5 styles roads -->
  <Style id="zone_eau">...</Style>          <!-- 4 styles zones -->
  <GroundOverlay>
    <color>99ffffff</color>                 <!-- alpha 60% par défaut -->
    <Icon><href>files/plan.png</href></Icon>
    <gx:LatLonQuad>                          <!-- 4 coins arbitraires -->
      <coordinates>SW SE NE NW</coordinates>
    </gx:LatLonQuad>
  </GroundOverlay>
  <Folder><name>🏗️ Niveau 0</name>           <!-- 1 folder par niveau si multi-level -->
    <Folder><name>📍 Points (N)</name>...</Folder>
    <Folder><name>🛣️ Tracés (N)</name>...</Folder>
    <Folder><name>🪜 Jonctions (N)</name>...</Folder>
    <Folder><name>⬛ Zones (N)</name>...</Folder>
  </Folder>
  <Folder><name>🗺️ Itinéraire (N)</name>...</Folder>
</Document>
```

#### 32.3 Format couleur KML

**AABBGGRR** (attention : pas RRGGBBAA ni AARRGGBB) — alpha + bleu + vert + rouge en hex 2 chars chacun. Helper `_kmlColor(hex, alpha)` dans `kmzExport.js` fait la conversion `#RRGGBB` + alpha 0-255 → `AABBGGRR`.

Exemples :
- `ffffffff` = blanc opaque
- `99ffffff` = blanc 60% alpha (utilisé pour GroundOverlay slider 60%)
- `ff0000ff` = rouge pur opaque (rouge=ff, vert=00, bleu=00, alpha=ff)

#### 32.4 Coordonnées KML

`_coord(latlng)` formate en `"lng,lat,0"` (KML : lng AVANT lat, contrairement au standard "lat,lng"). Le `,0` est l'altitude (0 = au sol).

#### 32.5 API publique

**`window.KmzExport`** :
- `buildTransform(planA, planB, gpsA, gpsB)` → `transform` ou throw
- `planToGps(transform, x, y)` → `{lat, lng}`
- `getCalibration(planId)` / `setCalibration(planId, calib)` — localStorage persistance
- `genererKml(opts)` → string KML (synchrone)
- `genererKmz(opts)` → Promise<Blob> (async, packe le ZIP via JSZip)

**Format `opts` pour `genererKmz`** :
```js
{
  planName, planVersion, planAuthor,     // métadonnées du plan
  imageW, imageH,                        // dimensions plan en px
  transform,                             // résultat de buildTransform
  imageOpacity: 0-100,                   // % opacité GroundOverlay (default 60)
  include: {
    image:        true|false,            // parent GroundOverlay
    points:       true|false,            // parent Placemarks
    roads:        true|false,            // parent LineStrings
    zones:        true|false,            // parent Polygons
    jonctions:    true|false,            // (si multi-niveau)
    itineraire:   true|false,
    dataLayers:   true,
    // Filtres granulaires (Set | null → null = pas de filtre, legacy compat)
    pointTagsSet: Set<string> | null,    // whitelist tags (1er tag du point)
    roadTypesSet: Set<string> | null,    // whitelist {principal, secondaire, chemin}
    zoneTypesSet: Set<string> | null     // whitelist {eau, remblais, effondrement, inaccessible}
  },
  levels: Set<number> | null,            // filtre niveaux (null = tous)
  data: {
    editorPoints: [{x, y, nom, id, tags, level, description}, ...],
    roads:        [{type, points, level, fromLevel, toLevel}, ...],
    zones:        [{type, points, level}, ...]
  },
  imageBlob:     Blob | null,            // image PNG/JPEG (null → skip GroundOverlay)
  imageFilename: string,                 // nom dans le ZIP (ex: "TestMAP.png")
  iconsToEmbed:  { tag: url, ... }       // URLs (data: ou http) des icônes par tag
}
```

#### 32.6 Cycle de vie côté sessionExporter

1. **Click onglet 🌍 KMZ** → `_renderKmz()` génère HTML (calibrage + aperçu + contenu + niveaux)
2. **`_kmzCollecterStats()`** : agrège session + embedded → counts par tag/type pour les compteurs UI
3. **Saisie 8 champs** ou import via 🔍 Chercher / 📍 Cliquer carte / Saisie manuelle
4. **`_kmzRafraichirApercu()`** : à chaque input, recalcule + affiche les 4 coins + lien Google Maps (avec ping internet via `window._pingInternet`)
5. **Click Télécharger** → `_exportKmz()` :
   - Validation 8 champs requis
   - `buildTransform` + persistance via `setCalibration`
   - Collecte session + embedded (allRoads, allZones, allPoints + dataLayerPoints)
   - Lecture des Sets de filtrage granulaire (pointTagsSet, roadTypesSet, zoneTypesSet)
   - Fetch image blob (RUNTIME_ASSETS si ZIP local, fetch HTTP sinon)
   - Collecte iconsToEmbed depuis `window._iconMap`
   - `genererKmz(opts)` → Blob → téléchargement `MyKTAMap_<plan>_<date>.kmz`

#### 32.7 Pièges et conventions

⚠️ **`y` inversé dans `buildTransform`** : axe image va vers le bas (haut-gauche = 0,0), axe math standard va vers le haut. La math doit inverser y sinon la rotation est miroir.

⚠️ **AABBGGRR vs RRGGBBAA** : KML utilise un format particulier hérité de Google. Toujours passer par le helper `_kmlColor` plutôt que de coder le hex à la main.

⚠️ **`<gx:LatLonQuad>` plus robuste que `<LatLonBox>`** : LatLonBox suppose un rectangle axes-aligned + rotation unique. LatLonQuad permet 4 coins arbitraires — gère naturellement les plans non-rectangulaires ou tournés.

⚠️ **Image blob requise** : si `imageBlob = null`, le GroundOverlay est skip silencieusement (log warning). Le KMZ reste valide mais affiche juste les annotations sans la cartographie de fond.

⚠️ **Helper `row(id, label, count, checked)`** dans sessionExporter (commit `ec0343f` fix) :
- `count = null` → pas de compteur, checkbox toujours enabled (cas image, métadonnée binaire)
- `count = 0` → "(0)" affiché, checkbox grisée + disabled (rien à exporter, blocage utile)
- `count > 0` → "(N)" affiché, cochée si `checked=true`

⚠️ **Classe CSS `.kta-iti-search-result` orpheline** : utilisée historiquement dans le modal Itinéraire (`interface.js`) ET dans le KMZ initial mais **jamais définie en CSS** (seule `.kta-iti-search-item` l'est). Le KMZ est passé à `.kta-kmz-search-item` dédiée (cf. commit `e7b0a80`). Le bug existe probablement encore côté Itinéraire — à fixer si remonté.

⚠️ **`transform` JAMAIS persisté — toujours rebuild on-demand** (pattern critique, source de v1.21.1 #1 + v1.21.2 #4) : `KmzExport.setCalibration(planId, calib)` stocke UNIQUEMENT `{pointA, pointB}` en localStorage. Le `transform` (résultat de `buildTransform`) est volumineux + dérivable, donc reconstruit à la demande :

```js
// ❌ MAUVAIS — calib.transform n'existe JAMAIS dans le storage
const calib = KmzExport.getCalibration(planId);
const gps = KmzExport.planToGps(calib.transform, x, y);  // ← undefined → crash

// ✅ BON — rebuild on-demand
const calib = KmzExport.getCalibration(planId);
if (!calib || !calib.pointA || !calib.pointB) return null;  // pas calibré
const t = KmzExport.buildTransform(calib.pointA.plan, calib.pointB.plan,
                                    calib.pointA.gps,  calib.pointB.gps);
const gps = KmzExport.planToGps(t, x, y);
```

Pattern utilisé par `gpxIO.js` (export/import), `emergencyMode.js > _transformCalib` (bulle 📋 des coordonnées, fix v1.21.2), `utils.js > buildPointPopupHtml` (ligne 🌐 coords GPS popup POI, v1.21.2).

#### 32.8 Pour ajouter une nouvelle catégorie d'export KMZ (futur)

Si on ajoute un nouveau type d'objet à exporter (ex: photos géolocalisées, audio notes) :
1. Helper `_emitXxx(item, styleId)` dans `kmzExport.js > genererKml`
2. Helper `_genererStyleXxx()` (style KML)
3. Bloc dans `_folderForLevel` avec filtre niveau-aware
4. UI : ajouter une row dans `_kmzRenderContenu` (sessionExporter.js)
5. Lecture : `opts.include.xxx` + éventuellement Set granulaire
6. Stats : ajouter au compteur dans `_kmzCollecterStats`

---

### 44. Export PDF imprimable (depuis v1.10.3)

Module `js/pdfExport.js` (~700 lignes IIFE) → `window.MyKTAMapPdfExport = { afficherModale, genererPdf }`. Lib **jsPDF UMD** (`lib/jspdf.umd.min.js`) chargée AVANT le module dans index.html.

#### 44.1 Pipeline

```
[modale PDF options] → _lireOptionsModale() → opts
opts → _genererCanvasPlan() → await window.MyKTAMapExporterGenererCanvas(...)
       (wrapper public dans exporter.js qui appelle _genererCanvasExport ;
        option `region: { x, y, w, h }` en unités plan = ne rendre que ce rectangle :
        fond depuis les tuiles V2 (`ktaDessinerRegionTuiles`) ou sous-rectangle de l'image,
        le reste translaté ; la légende se dessine après restauration — cartes PDF Secours)
canvas → pdf.addImage(canvas.toDataURL("image/jpeg", 0.88), "JPEG", ...)
opts.incLegende ? → _dessinerLegendeOverlay() → await window.MyKTAMapExporterGenererCanvasLegende(...)
                  → pdf.addImage(legCanvas.toDataURL("image/png"), "PNG", ...) en overlay 4-coins
opts.incHeader ? → _dessinerHeader() (titre + métas via pdf.text())
crédit footer (1 ligne pdf.text, sans emoji)
pdf.save(filename)
```

#### 44.2 Formats

Constante `FORMATS` (objet) mappe `"<size>-<orient>"` → `{format, orientation, label}`. 5 tailles × 2 orientations = 10 entrées :
- `a0-portrait/landscape` (841×1189 mm) → plotter pro
- `a1-portrait/landscape` (594×841) → grand format
- `a2-portrait/landscape` (420×594) → affiche
- `a3-portrait/landscape` (297×420) → papier A3
- `a4-portrait/landscape` (210×297) → papier standard *(défaut paysage)*

Constante `PDF_SIZES` (array de `{key, label, hint}`) utilisée pour rendre les radios "Taille" + "Orientation" séparément dans la modale (UX plus claire qu'un dropdown 10 entrées).

#### 44.3 Calques granulaires (inspiré export PNG avancé)

Modale auto-liste `PLAN_CONFIG.imageLayers[]` et `PLAN_CONFIG.dataLayers[]` :
- Section **🖼️ Image de base & calques** : checkbox "Image plan de base" + 1 checkbox par `imageLayers[]`
- Section **📊 Calques de données** : 1 checkbox par `dataLayers[]` avec label spécial pour `editor` (= calque session)
- Pré-cochage = visibilité actuelle sur la carte (via helpers `_getVisibleImageLayerIds` / `_getVisibleDataLayerIds` locaux — duplique exporter.js volontairement pour éviter dep cross-module)

`_lireOptionsModale` capte ces choix dans `opts.imageLayers = {id: bool}` et `opts.dataLayers = {id: bool}`. Le wrapper `_publicGenererCanvas` de exporter.js accepte ce format granulaire (rétrocompat v1 avec booléens globaux préservée pour les futurs callers).

#### 44.4 Légende = overlay 4-coins (v3.1)

Décision design : **PAS de footer dédié**, légende posée en overlay sur le plan au coin choisi. Plus de gain de surface pour le plan, et cohérent avec l'export PNG avancé.

Fonction `_dessinerLegendeOverlay(pdf, opts, planX, planY, planW, planH)` :
1. Génère le canvas légende via `window.MyKTAMapExporterGenererCanvasLegende({contenu, size, style, scale: 2})`
2. Calcule largeur cible en mm selon `legSize` : Compact=22%, Standard=28%, Large=35% de la largeur du plan
3. Cap auto à 70% de la hauteur du plan si trop haut (cas plans étroits)
4. Padding 3mm depuis le bord choisi
5. Pose via `pdf.addImage(dataUrl, "PNG", legX, legY, legWmm, legHmm)`

Helper public dans exporter.js : `window.MyKTAMapExporterGenererCanvasLegende(userOpts)` :
- Crée un canvas temporaire 3000×3000
- Force position `haut-gauche` à (0,0)
- Appelle `_dessinerLegende` avec un setup canvas isolé
- `_dessinerLegende` retourne désormais `{boiteW, boiteH, bx, by}` à la fin
- Crop le canvas final aux dims exactes via `drawImage`
- Auto-collecte `tagsUtilises` via `getEditorPoints()` + `fetch` des data layers si pas fourni explicitement
- Retourne `Promise<HTMLCanvasElement | null>` (null si aucun contenu cochable)

#### 44.5 Nouveau style `print`

4ème entrée dans `STYLES` de `_dessinerLegende` (à côté de opaque/semi/filigrane) :
- bg : `rgba(255,255,255,1)` blanc pur
- border : `rgba(30,58,138,0.55)` bleu marine
- text : `#1a1f2e` quasi-noir
- titreSection : `#1e3a8a` bleu marine saturé
- meta : `#555c6e` gris foncé

Adapté impression papier (vs styles dark theme natifs de l'app).

#### 44.6 ⚠️ Pas d'emoji dans pdf.text()

jsPDF Helvetica latin1 → emojis Unicode rendus en mojibake (`📍` → `O=UI...`). **Règle absolue** : aucun caractère hors Latin-1 dans les chaînes passées à `pdf.text()`. Le crédit footer "Généré par MyKTAMap · CC BY-NC-SA 4.0 · myktamap.fr" est OK (· = U+00B7 dans Latin-1).

Les emojis dans la légende sont OK car la légende est rendue en image canvas (= browser DOM rendering qui supporte Unicode) avant d'être posée dans le PDF via `addImage`.

#### 44.7 Wiring index.html / sw.js

- `<script src="lib/jspdf.umd.min.js">` AVANT `<script src="js/pdfExport.js">` (jsPDF doit créer `window.jspdf` avant que le module check `_checkJsPDF`)
- `sw.js > ASSETS_TO_CACHE` : `./lib/jspdf.umd.min.js` + `./js/pdfExport.js`
- Crédits dans le splash + footer loader : `🍃 Leaflet · 📦 JSZip · 📤 jsPDF · 🧭 Dijkstra`

#### 44.8 Pour ajouter une nouvelle taille (futur)

1. Ajouter dans `PDF_SIZES` (array) — `{key, label, hint}`
2. Ajouter les 2 variantes portrait/paysage dans `FORMATS` (dict) — `{format, orientation, label}`
3. Le radio "Taille" s'auto-régénère via `PDF_SIZES.map(...)` dans la modale
4. Le mapping `"<size>-<orient>"` est composé dynamiquement dans `_lireOptionsModale`

---

### 45. Fix structures embedded dans exports canvas (depuis v1.10.3)

Audit qui a révélé un trou : les structures (piliers + mur + fronts) embarquées dans les data layers (`data/<plan>/structure.json` ou tout autre JSON avec champ `structures: [...]`) étaient :
- ✅ Affichées en runtime Leaflet via `utils.js > ajouterPointsDepuisJSON` (lignes 638-720 ~)
- ✅ Présentes dans exports session (Full / Avancé / Conversion) + KMZ
- ❌ **Manquantes** dans `utils.js > telechargerPlan` (export PNG rapide) — bloc complètement absent
- ❌ **Manquantes** dans `exporter.js > _genererCanvasExport` (export PNG avancé + PDF) — uniquement session

**Cause** : oubli post-update v1.9.3 lors de l'ajout des structures. Les helpers existaient (`getAllEmbeddedStructures` exposé par `utils.js`), mais pas appelés depuis les pipelines canvas.

**Fix v1.10.3** :
- `utils.js > telechargerPlan` : ajout de 2 blocs (structures session entre zones session et roads ; structures embedded dans la boucle data layers entre zones embed et roads embed). Tri Z `mur < pilier-2 < pilier-1 < front-2 < front-1`, filtre `passeFiltreNiveau`, couleurs alignées sur `STRUCTURE_STYLES` + hotfix v1.10.1-2.
- `exporter.js > _genererCanvasExport` : ajout `embeddedStructures = Array.isArray(j.structures) ? j.structures : []` dans la boucle data layers + bloc de rendu identique (filtre `opts.ann.structures` + `opts.ann.structuresTypes`, niveau via `_itemPasseLevels`, helpers `_drawPolygon`/`_drawPolyline`).
- Compteurs `_diag.embStructs` et `_diagAdv.embStructs` ajoutés pour le debug.

**Pour les futurs trous éventuels** : si un nouveau type d'annotation est ajouté (genre `notes` ou `photos_geo` à terme), bien penser à le câbler dans LES 4 PIPELINES :
1. `utils.js > telechargerPlan` (PNG rapide ⚡) — session + embedded
2. `exporter.js > _genererCanvasExport` (PNG avancé 🎨 + PDF 📤) — session + embedded
3. `sessionExporter.js` (3 modes Full / Avancé / Conversion) — session + embedded
4. `kmzExport.js` (KMZ géolocalisé) — session + embedded

Le runtime Leaflet (`utils.js > ajouterPointsDepuisJSON`) ne doit jamais être oublié non plus, mais il est généralement le premier site implémenté.

---

### 69. v1.82.0 — Les exports face à un plan IMPORTÉ (PNG + PDF)

Le §45 ci-dessus a câblé les structures embarquées dans les pipelines canvas. Il
supposait une chose qui n'est vraie que des plans **livrés avec l'app** : que le
contenu d'un calque s'obtient par `fetch(layerCfg.file)`. Un plan **généré**
(import SIG, import GPX) déclare `file: "sig.json"` mais ce fichier n'existe
nulle part sur le serveur — il vit en **IndexedDB**. Le `fetch` tombait en 404,
silencieusement (`console.warn`), et l'export ne sortait que le fond de plan.

**Trois défauts empilés, tous sur le même plan :**

| # | Défaut | Correction |
|---|---|---|
| 1 | Contenu des calques introuvable (`fetch` 404) | **Repli sur les registres en mémoire** (`getAllEmbedded*`), filtré par `layerId`. Repli seulement : quand le fichier existe, il fait foi. |
| 2 | Compteurs des modales comptés sur la **seule session** | `window.ktaAnnotationsCompletes(famille)` — un seul point de vérité, utilisé par les deux modales |
| 3 | Sous-types listés **en dur** (5 noms intégrés) | Comptage des types réellement présents + une ligne par type personnalisé, sous le libellé de sa légende |

🩸 **Le défaut n°2 n'était pas cosmétique.** `_cbRow` (PDF) et `row`/`rowSub`
(PNG) **désactivent** une case dont le compteur vaut zéro. Sur un plan dont tout
le relevé vit dans un calque, les quatre cases d'annotation étaient donc grisées
— l'export ne pouvait **rien** produire, sans qu'aucun message n'explique
pourquoi. Un compteur qui pilote une interaction n'est plus un compteur.

**`layerId` propagé** — pré-requis du repli n°1, sans quoi un plan à plusieurs
calques verrait tout le contenu attribué au premier calque en défaut :
`utils.js` pose `layerId` sur les entrées de `_ktaDataPolylines`,
`_ktaDataStructurePolygons`, `_ktaDataPolygons` et `marker._ktaLayerId` (la
source est `_layerInfo`, déjà résolu pour les favoris) ; `road.js` le déduit du
`layerGroup` déjà mémorisé, et **renvoie une copie** — la route d'origine ne doit
pas se voir greffer un champ au passage.

**Effet de bord assumé** : les types personnalisés contournaient jusqu'ici les
filtres de dessin (`if (type.startsWith("cust-")) return true`) faute d'avoir une
case dans la modale. Ils en ont une maintenant, donc le contournement saute :
`filtreX[type] !== false` reste permissif pour une clé absente. Idem pour les
types de zone par calque — `_lireZoneTypesCochesCalque` retourne désormais
`connus`, l'ensemble des types **proposés**, pour ne pas supprimer un type qui
n'a jamais eu de case.

#### 69.1 Largeur des traits : la loi physique, partagée avec l'écran

Un front de taille sortait à `style.weight × scale` — une largeur décidée par la
**légende**, pas par le **terrain**. Sur un relevé réel, 10 px de plan valent
3,6 m au sol : les traits se touchent et la carte devient un aplat. Le rapport
trait/écart ne dépend pas de la résolution choisie, donc **exporter plus grand
n'y changeait rien**.

`structures.js` expose la loi (`window.ktaLargeurFrontPourRatio` /
`ktaLargeurTracePourRatio`) et `exporter.js` l'appelle. Le paramètre est un
**ratio de pixels rendus par pixel de plan** : `2^zoom` à l'écran, `scale`
(résolution) à l'export — deux noms du même nombre. Une seule formule, deux
consommateurs, pas de table recopiée.

```
largeur_px = 1,5 m × APP_CONFIG.scale (px/m) × ratio     borné à [1, 14] px
```

Mesures sur le relevé de KARMA (2,764 px/m) : aperçu 1 px · export ½ 2,1 px ·
natif **4,1 px** (contre 10 avant) · HD ×2 8,3 px.

⚠️ **Plan non calibré** : `weight × scale` est conservé. Sans px/m aucune largeur
réelle n'est calculable, et les paliers de zoom du repli écran donneraient un
trait **plus épais** qu'avant dans l'aperçu. L'écran, lui, garde ses paliers : il
n'a pas de résolution native à laquelle se référer.

**Portée** : fronts (structures polylignes) partout ; tracés **embarqués**
seulement — à l'écran `majLargeurFronts` n'ajuste que `_ktaDataPolylines`, et un
export doit montrer ce que montre la carte.

---

### 54. GpxIO — Import + Export GPX (depuis v1.14.0)

Module `js/gpxIO.js` (~360 lignes IIFE) → `window.GpxIO = { exporter, parser, importer, verifierCalibrage, _appliquerImport }`.

#### 54.1 Réutilise le calibrage KMZ

GpxIO **n'a pas sa propre calibration** : il réutilise intégralement celle de KmzExport (cf §32). Logique : si l'user a déjà calibré pour exporter en KMZ vers Google Earth, le même calibrage marche pour GPX vers TopoDroid/OsmAnd/etc.

API utilisée :
- `window.KmzExport.planToGps(t, x, y)` → `{lat, lng}` (pour export)
- `window.KmzExport.gpsToPlan(t, lat, lng)` → `{x, y}` (nouveau v1.14.0, **inverse exact**, pour import)
- `window.KmzExport.getCalibration(planId)` → `{transform, ...}` (lecture localStorage)

#### 54.2 Format GPX 1.1 produit

```xml
<gpx version="1.1" creator="MyKTAMap (myktamap.fr)" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <name>...</name>
    <desc>Export GPX depuis MyKTAMap — N point(s), M tracé(s)</desc>
    <author><name>MyKTAMap</name><link href="https://myktamap.fr"/></author>
    <time>2026-05-23T18:00:00.000Z</time>
  </metadata>
  <wpt lat="..." lon="...">
    <name>Nom du point</name>
    <desc>Description longue</desc>
    <type>tag_principal</type>
    <sym>tag_principal</sym>           <!-- même valeur, GPX standard recommande les 2 -->
    <cmt>MyKTAMap level=-1</cmt>        <!-- préservation niveau M-LVL pour roundtrip -->
  </wpt>
  <trk>
    <name>Label du tracé</name>
    <type>principal</type>              <!-- principal | secondaire | chemin | itinerary -->
    <cmt>MyKTAMap level=0</cmt>
    <trkseg>
      <trkpt lat="..." lon="..."/>
      <trkpt lat="..." lon="..."/>
    </trkseg>
  </trk>
</gpx>
```

#### 54.3 Flow export

`window.GpxIO.exporter({incPoints, incEmbedded, incRoads, incIti, filename})` → `{ok, msg, counts, filename}`. Génère + télécharge directement via Blob URL. Pas de fichier intermédiaire.

UI : onglet `gpx` dans `sessionExporter.js > _afficherModal` (avec les autres : full/advanced/conversion/kmz). `_renderGpx()` génère le HTML (info calibrage + checkboxes options). `_exportGpx()` lit les options et appelle l'API.

#### 54.4 Flow import (2 phases : preview puis confirm)

`window.GpxIO.importer(file, {confirmAdd: false})` → Promise → `{ok, msg, preview, _toApply: {points, tracks}}`.

Si `confirmAdd: false` (défaut UI) :
- Parse le fichier
- Transforme coords WGS84 → plan via `gpsToPlan`
- Détecte les points hors bounds du plan (out-of-bounds) → ignorés
- Détecte le niveau M-LVL depuis `<cmt>MyKTAMap level=N</cmt>` si présent
- Map type GPX `<type>` → type road valide (sinon fallback "chemin")
- Retourne preview sans toucher à la session

L'UI affiche la preview (X waypoints + Y tracks + warnings hors-bounds) et l'user confirme → second call avec `confirmAdd: true` OU directement via `window.GpxIO._appliquerImport(points, tracks)`.

`_appliquerImport` :
1. **Snapshot HistoryManager** AVANT (pour permettre Undo)
2. `setEditorPoints(current.concat(newPoints))`
3. `setRoads(current.concat(newTracks))`
4. `HistoryManager.record("Import GPX : N points, M tracés", _hb)`

#### 54.5 Garde-fous

- **Vérif calibrage** avant tout import/export : `verifierCalibrage()` → `false` si aucun `getCalibration(planId).transform`. UI affiche message explicite invitant à passer par KMZ.
- **Out-of-bounds detection** : tout point dont les coords plan après transformation tombent hors du rectangle `[-50, imgW+50] × [-50, imgH+50]` est ignoré (tolérance 50px pour les bords).
- **Tracks partiels** : si tous les points d'un `<trk>` sont hors bounds, le tracé entier est skipé (avec compteur dans la preview).
- **Tracks trop courts** : `<trkseg>` avec moins de 2 points valides est skipé.
- **Multi-segments tracks** : tous les `<trkseg>` d'un `<trk>` sont concaténés en un seul tracé MyKTAMap (les segments multi sont rares en pratique pour des plans souterrains).

#### 54.6 Pour étendre

- **Nouveaux types de tracés** : ajouter dans le filtre `validTypes` de `gpxIO.js > importer` (~ligne 290)
- **Support GPX 1.0** (legacy) : non prévu — l'user peut convertir via gpsbabel ou un outil online avant import
- **Extensions Garmin / Strava** : non parsées, ignorées silencieusement par DOMParser
- **Nouveaux champs preservés** : ajouter dans `_genererGpx` (export) + dans le parser `importer` (lecture)

#### 54.7 À NE PAS faire

- ❌ Inventer son propre calibrage parallèle au KMZ — toujours passer par `window.KmzExport` pour la cohérence
- ❌ Bypass `_appliquerImport` et muter directement les arrays editorPoints/roads — sinon pas de snapshot HistoryManager et l'user perd l'Undo
- ❌ Charger une lib GPX externe (gpxparser, togpx, etc.) — DOMParser natif suffit largement et évite les dépendances

---

---

### 55. GpxImport — Reconversion GPX → ZIP MyKTAMap (depuis v1.15.0)

Module `js/gpxImport.js` (~310 lignes IIFE) → `window.GpxImport = { estGpxMyktamap, extraireGpx, extraireBoundsGps, genererCanvasVierge, ingestParsed, genererZipMyktamap }`.

**Pendant exact de `js/kmzImport.js`** (cf §32 bis) pour le format GPX. Couple symétrique gpxIO (export+import session) ↔ gpxImport (reconversion en ZIP autonome).

#### 55.1 Spécificité GPX vs KMZ : pas d'image plan

Un KMZ contient un `<GroundOverlay>` qui pointe vers une image de plan — c'est cette image qui sert de baseImage au ZIP MyKTAMap reconstruit. Un **GPX, lui, n'a que des coordonnées GPS** sans support d'image plan natif.

Solution v1.15.0 : **génération automatique d'un canvas vierge** aux dimensions choisies par l'user (4000×4000 par défaut, 4 couleurs : sépia/blanc/gris/noir). Le canvas est calibré sur les bounds GPS du GPX :

- **Coin BL** du canvas (x=0, y=H) ↔ `(lat_min, lng_min)`
- **Coin TR** du canvas (x=W, y=0) ↔ `(lat_max, lng_max)`
- Marge de 5% autour pour éviter que les annotations soient pile sur les bords

Le calibrage `pointA` + `pointB` est embarqué dans `plan-config.json > plan.georef`, propagé vers `KmzExport.setCalibration` au load via `main.js > _propagerGeorefVersKmzExport`. L'user peut ensuite remplacer le canvas par une vraie image en mode Modifier le plan.

#### 55.2 Détection GPX MyKTAMap

`estGpxMyktamap(gpxDoc)` retourne `true` si :
1. Attribut `creator="MyKTAMap…"` sur la racine `<gpx>`
2. **OU** `<metadata><author><name>MyKTAMap…</name>`
3. **OU** présence d'au moins un `<cmt>MyKTAMap level=N</cmt>` (signature posée par gpxIO.js > _genererGpx)

Si non-MyKTAMap : warn dans le résumé mais pas blocking (l'user peut quand même générer un ZIP, les tags/types par défaut s'appliqueront aux Placemarks orphelins).

#### 55.3 Calcul des bounds GPS

`extraireBoundsGps(parsed)` itère sur **tous** les `wpt.lat/lng` et `trkpt.lat/lng` pour calculer `latMin`, `latMax`, `lngMin`, `lngMax`. Marge de 5% appliquée (avec fallback 0.0005° si Δ = 0). Retourne `null` si aucune coordonnée valide trouvée.

#### 55.4 Ingestion parsed → points / roads

`ingestParsed(parsed, transform, opts)` utilise `window.KmzExport.gpsToPlan(t, lat, lng)` pour la transformation inverse (GPS → pixels). Préservations :

- **Tag points** depuis `<sym>` ou `<type>`, fallback `opts.pointTag` ou `"default"`
- **Type tracés** depuis `<type>` parmi `{principal, secondaire, chemin, itinerary, jonction}`, fallback `opts.roadType` ou `"chemin"`
- **Levels M-LVL** depuis `<cmt>MyKTAMap level=N</cmt>` sur waypoints ET tracks
- **Descriptions** depuis `<desc>` sur waypoints ET tracks
- **Filtre bounds** : points hors `[−50, W+50] × [−50, H+50]` rangés dans `stats.outOfBounds`

#### 55.5 Restauration des icônes

Pareil que `kmzImport.js > hotfix4+hotfix10` : fetch `icon/<tag>.png` depuis l'app courante pour chaque tag rencontré dans les points. `icon/iconetrack.png` toujours embarqué (default + track). Cached SW → marche offline.

#### 55.6 Options optionnelles V2 + M-LVL

Identiques au flow KMZ (cf §32 bis) :

- **`opts.tilingV2`** → re-tile le canvas vierge en tuiles 512×512 via `window.MyKTAMapTilingV2` (exposée par createConf.js). Utile uniquement si l'user prévoit de remplacer le canvas par une grande image ensuite ; sinon V1 plat suffit pour un canvas vide.
- **`opts.multiLevel`** → ajoute `plan.multiLevel = true` au JSON (utile si le GPX MyKTAMap contenait des annotations multi-niveau).
- **`opts.onTilingProgress(done, total, currentZ)`** → callback de progression pour l'overlay UI.

#### 55.7 UI : `_afficherImporterGpx` dans createConf.js

Modale mirroir de `_afficherImporterKmz` (mêmes classes `.kta-kmz-imp-boite`, mêmes patterns visuels). Diffère sur :

- Pas de section "calibrage extracté" — le calibrage est automatique
- Section "Canvas vierge" : 2 inputs dimensions + 4 radios couleur
- Section "Types par défaut" : 2 dropdowns (point tag + road type), pas de zone (GPX n'a pas de polygons)

Exposée via `window.afficherImporterGpx = _afficherImporterGpx`.

#### 55.8 Routing depuis les drop zones

- `index.html > #zipDropZone` (loader home) : détecte `.gpx` → appelle `window.afficherImporterGpx(file)`
- `js/createConf.js > _routerFichierImport` (drop zone générateur) : pareil

Les 2 drop zones acceptent désormais `.zip` / `.kmz` / `.gpx` avec routing automatique. Pas d'erreur UX si l'user dépose un GPX là où il s'attendait à mettre un ZIP — l'app le route automatiquement vers la bonne modale.

#### 55.9 ZIP MyKTAMap généré

Structure finale :

```
plan_<nom>_from_gpx.zip
├── plan-config.json    (avec plan.georef pour propagation auto)
├── data/
│   ├── baseImage.png   (canvas vierge généré)
│   └── imported.json   (data layer "imported" : points + roads)
└── icon/
    ├── iconetrack.png  (default + track)
    └── <tag>.png       (1 par tag rencontré, fetched depuis l'app)
```

Le ZIP est strictement compatible avec les autres pipelines (chargement classique, mode Modifier, Export externe, etc.) — c'est un ZIP MyKTAMap normal.

---

---

### 59. v1.18.0 — Roundtrip KMZ de la légende plan-level (depuis v1.18.0)

Suite directe de §58 (v1.17.0). La nouvelle source de vérité `PLAN_CONFIG.customLegend` (cascade niveau plan) voyage désormais avec le format KMZ exporté, pour permettre le partage cross-app de la personnalisation de légende d'un plan.

#### 59.1 Pattern d'embed : fichier annexe au doc.kml

Décision design (validée KARMA) : **fichier JSON séparé** dans le ZIP KMZ, pas un `<ExtendedData>` dans le `doc.kml`. Avantages :

- KML reste 100 % standard, lisible par toute app sans surcharge XML
- Plus simple à parser (1 `JSON.parse` vs un parcours DOM avec namespace custom)
- Extensible : on peut ajouter d'autres « extras » MyKTAMap dans le même fichier plus tard sans bumper la version du format

Pattern parallèle aux icônes embed (`files/icons/<tag>.png` côté export, regex `(?:^|\/)icons\/...` côté import) : on suit la même philosophie « fichier annexe ignoré par les apps tierces ».

#### 59.2 Format `myktamap-extras.json`

```json
{
  "type":         "myktamap-kmz-extras",
  "version":      1,
  "exportedAt":   "2026-05-24T22:00:00.000Z",
  "customLegend": {
    "schemaVersion":  1,
    "labels":         { "icones.salle": "Salle du fond", ... },
    "hidden":         { "zones.remblais": true, ... },
    "customEntries":  [ { id, label, category, geometry, lineColor, ... } ]
  }
}
```

**Wrapper extensible** : le top-level `{ type, version, exportedAt }` permet d'ajouter d'autres champs MyKTAMap futurs (`favoris`, `notes`, `customIcons`, etc.) sans changer la version 1 du format. Le `customLegend` est strictement le retour de `LegendCustomization.getSessionState()`.

#### 59.3 Export (`kmzExport.js > genererKmz`)

Nouveau champ `opts.planCustomLegend`. Si présent et de type `"object"`, embed dans le ZIP juste après `zip.file("doc.kml", kml)` :

```js
if (opts.planCustomLegend && typeof opts.planCustomLegend === "object") {
  const extras = {
    type:          "myktamap-kmz-extras",
    version:       1,
    exportedAt:    new Date().toISOString(),
    customLegend:  opts.planCustomLegend
  };
  zip.file("myktamap-extras.json", JSON.stringify(extras, null, 2));
}
```

#### 59.4 UI Export (`sessionExporter.js > _kmzRenderContenu` + `_exportKmz`)

Nouvelle checkbox via helper `row(id, label, count, checked)` :

```js
row("kmz_inc_legend",
    "🏷️ Légende personnalisée du plan",
    hasCustomLegend ? 1 : 0,
    hasCustomLegend)
```

Détection `hasCustomLegend` via IIFE qui check `labels/hidden/customEntries` non-vides dans `window.PLAN_CONFIG.customLegend`.

Passage à `genererKmz` via opts :

```js
planCustomLegend: (function() {
  if (!document.getElementById("kmz_inc_legend")?.checked) return null;
  const cl = window.PLAN_CONFIG && window.PLAN_CONFIG.customLegend;
  if (!cl || typeof cl !== "object") return null;
  return cl;
})()
```

#### 59.5 Import (`kmzImport.js > genererZipMyktamap`)

`extraireKmz` (ligne 82) capture **déjà** tous les fichiers non-KML dans `assets` sans filtre → `myktamap-extras.json` est automatiquement disponible dans `opts.assets`, aucune modif à l'extraction.

Dans `genererZipMyktamap`, juste après les flags `multiLevel`/`tiledV2` (vers ligne 600), détection + parse + injection :

```js
const extrasKey = Object.keys(opts.assets).find(function(p) {
  return /(?:^|\/)myktamap-extras\.json$/i.test(p);
});
if (extrasKey) {
  try {
    const txt = await opts.assets[extrasKey].text();
    const extras = JSON.parse(txt);
    if (extras && extras.customLegend && typeof extras.customLegend === "object") {
      planConfig.plan.customLegend = extras.customLegend;
    }
  } catch(e) {
    console.warn("[KmzImport] ⚠️ Échec parse myktamap-extras.json (ignoré) :", e);
  }
}
```

**Matching tolérant** : regex `(?:^|\/)myktamap-extras\.json$/i` capture le fichier qu'il soit à la racine du ZIP ou dans un sous-dossier, et insensible à la casse (certains zip-writers normalisent les noms).

#### 59.6 Cascade après import

Le ZIP MyKTAMap reconstruit contient désormais `plan-config.json > plan.customLegend`. Au boot du plan importé, `js/main.js > initApp` appelle `LegendCustomization.loadPlanState()` qui lit `window.PLAN_CONFIG.customLegend` et le normalise en `_planState`. La cascade `session > plan > default` applique alors automatiquement les overrides à tous les `getLabel` / `isVisible` (cf §56.2 et CLAUDE.md §LegendCustomization).

**Pas de hook spécifique à ajouter** : la cascade est déjà en place depuis v1.16.0, on ne fait que rendre `plan.customLegend` populated automatiquement après un round-trip KMZ.

#### 59.7 Compat externe + skip silencieux

✅ **Apps tierces compatibles** (Google Earth, OsmAnd, Avenza, ArcGIS Earth, Locus, Strava) : ignorent les fichiers inconnus du ZIP KMZ sans broncher. Le `doc.kml` reste valide standard. Aucun warning, aucune erreur côté lecteur tiers.

✅ **KMZ MyKTAMap < v1.18.0** : `extrasKey` est `undefined` → skip silencieux. Le ré-import fonctionne exactement comme avant (= légende défaut MKM côté re-importeur).

✅ **Fichier corrompu** : `JSON.parse` throw dans le `try` → catch + warn console + skip. Le reste de l'import KMZ continue normalement (= le ZIP reconstruit est utilisable, juste sans customLegend).

✅ **Champ `customLegend` absent ou non-objet** : skip silencieux. Évite d'injecter une valeur garbage dans `planConfig.plan.customLegend`.

#### 59.8 À NE PAS faire

- ❌ **Ne pas filtrer les fichiers dans `extraireKmz`** sous prétexte de "ne capturer que les images" — cela casserait notre récupération de `myktamap-extras.json` (et toute future feature qui ajouterait d'autres extras).
- ❌ **Ne pas mettre la checkbox UI dans la modale Export PNG** — c'est spécifique au format KMZ (= partage cross-app). Le PNG export n'a pas de notion de plan-config.
- ❌ **Ne pas tenter d'embarquer la session-level customLegend** (cascade session) — décision design KARMA validée : seul le niveau plan voyage avec le KMZ. La session reste éphémère par définition, pas pertinente pour un destinataire.
- ❌ **Ne pas écraser un `plan.customLegend` existant** dans `planConfig.plan` sans warn — pour l'instant on écrase en aveugle car `genererZipMyktamap` part d'un planConfig neuf. Si plus tard on supporte un mode "merge KMZ avec un plan existant", revoir cette logique.

#### 59.9 Pour étendre (futurs extras)

**Pour ajouter un nouveau champ "extra" embarqué dans le KMZ** (ex: `favoris`, `customIcons`, `notes`) :

1. **Export** : ajouter `opts.<nom>` dans `genererKmz`, l'inclure dans l'objet `extras` du même `myktamap-extras.json` (pas créer un nouveau fichier — on garde **un seul** fichier extras pour limiter la surface).
2. **UI** : ajouter une checkbox dans `_kmzRenderContenu` (idem pattern `kmz_inc_legend`), passage conditionnel dans `_exportKmz`.
3. **Import** : dans le bloc de parse existant de `myktamap-extras.json`, ajouter `if (extras.<nom>) { ... }` qui injecte dans le bon endroit du `planConfig` reconstruit.
4. **Bump version** : si le nouveau champ change la sémantique du parsing (ex: nouveau schéma incompatible), bumper `version: 2` dans l'extras + lire la version au parse pour gérer les 2 cas. Sinon `version: 1` reste.
5. **Doc** : update §59.2 (format), CLAUDE.md, README.md, AI_CONTEXT.md.

#### 59.10 v1.18.1 — Extension au format GPX + preview d'import (KMZ + GPX)

Cette release étend le pattern §59 au format GPX et ajoute la visibilité côté preview d'import.

**Format GPX embed** : `<extensions>` standard GPX 1.1 sous `<metadata>` (PAS un fichier annexe — GPX est un XML monolithique, pas un ZIP). Namespace `xmlns:myktamap="https://myktamap.fr/gpx/ext/v1"` déclaré au root `<gpx>`. La balise `<myktamap:customLegend>` contient le payload wrapper JSON sérialisé + escapé XML (identique au KMZ).

```xml
<gpx ... xmlns:myktamap="https://myktamap.fr/gpx/ext/v1">
  <metadata>
    <name>...</name>
    <desc>...</desc>
    <extensions>
      <myktamap:customLegend>{"type":"myktamap-gpx-extras","version":1,"customLegend":{...}}</myktamap:customLegend>
    </extensions>
  </metadata>
  ...
</gpx>
```

**Parser tolérant au namespace** (`gpxIO.js > parser`) : scan des enfants directs de `<extensions>` via `localName === "customlegend"` (case insensitive). Permet de lire correctement même si l'user a édité le GPX à la main sans déclaration `xmlns:myktamap` propre.

**`importer()` (session) ignore silencieusement** : `customLegend` extraite par le parser n'est jamais appliquée au scope session — c'est strictement plan-level. Seul `gpxImport.js > genererZipMyktamap` (reconversion en ZIP MyKTAMap autonome) l'injecte dans `planConfig.plan.customLegend`.

**Preview d'import KMZ + GPX** (`createConf.js` :
- `_kmzImpAnalyserFichier` (KMZ) : parse async de `myktamap-extras.json` extrait par `extraireKmz`, affichage dans le résumé
- `_gpxImpAnalyserFichier` (GPX) : lecture directe de `parsed.metadata.customLegend` (déjà extrait par `gpxIO.js > parser`)

Format d'affichage uniforme :
```html
<div style="color:#6ce28a;">
  ✅ <strong>Légende personnalisée du plan détectée</strong> :
  N renommés · M masqués · K customs
  <span>(restaurée au boot du plan reconstruit)</span>
</div>
```

**À NE PAS faire pour GPX** :
- ❌ **Ne pas mettre `<myktamap:customLegend>` au top-level `<gpx>`** — le schéma GPX 1.1 n'autorise pas des éléments arbitraires au root. Toujours sous `<metadata>/<extensions>`.
- ❌ **Ne pas appliquer `customLegend` dans `gpxIO.js > importer`** — l'import session ne doit jamais muter `PLAN_CONFIG.customLegend` (= cascade plan, pas session). La cascade serait écrasée silencieusement à chaque import GPX, mauvaise UX.
- ❌ **Ne pas hardcoder le namespace `xmlns:myktamap`** dans le parser — utiliser `localName` + endsWith pour tolérer les GPX édités à la main.

---

---

### 68. ⚠️ Correction §32.7 — Format calibrage KMZ FLAT (pas NESTÉ)

**TODO résolu** (mentionné depuis v1.23.0 fix2 dans §66.8 mais §32.7 restait trompeur). Le format réel stocké par `KmzExport.setCalibration(planId, calib)` en `localStorage["myktamap_calib_<planId>"]` est **FLAT** :

```js
// ✅ Format RÉEL
calib = {
  pointA: { x: 1234, y: 567, lat: 48.8566, lng: 2.3522 },
  pointB: { x: 5678, y: 9012, lat: 48.8530, lng: 2.3500 }
}
```

PAS le format NESTÉ qui était décrit à tort dans §32.7 :
```js
// ❌ JAMAIS EXISTÉ
calib = {
  pointA: { plan: {x, y}, gps: {lat, lng} },
  pointB: { plan: {x, y}, gps: {lat, lng} }
}
```

Vérifié dans les 4 sites prod : `createConf.js` + `interface.js` + `sessionExporter.js` + `main.js > _propagerGeorefVersKmzExport` + `secoursMode.js > exporterKMZ`. Le pattern d'accès cohérent est :

```js
const calib = KmzExport.getCalibration(planId);
if (!calib || !calib.pointA || !calib.pointB) return null;
// Accès FLAT direct
const t = KmzExport.buildTransform(
  calib.pointA.plan = { x: calib.pointA.x, y: calib.pointA.y },
  calib.pointB.plan = { x: calib.pointB.x, y: calib.pointB.y },
  calib.pointA.gps  = { lat: calib.pointA.lat, lng: calib.pointA.lng },
  calib.pointB.gps  = { lat: calib.pointB.lat, lng: calib.pointB.lng }
);
```

**ATTENTION** : `buildTransform` accepte 4 args distincts `(planA, planB, gpsA, gpsB)` où chaque arg est `{x, y}` ou `{lat, lng}`. NE PAS passer `calib.pointA` directement (qui contient les 4 champs mélangés).

---
### 69.2 « Nommer et colorer les niveaux » : ce qui périme les entrées (v1.82.0)

L'écran d'import SIG propose de renommer et recolorer les entrées de légende
**avant** génération (`SigImport.previsualiserEntreesNiveaux`). Leur état vit
dans `createConf.js > _sigPlanLegend`, et le pré-remplissage est gardé par un
`if (!_sigPlanLegend)` — donc tout ce qui devrait le périmer doit le remettre à
`null`, sinon l'éditeur ressert l'ancien contenu.

L'id d'une entrée est **déterministe** (`_idNiveau` → `cust-sig-<cat>-n<niveau>`,
pour qu'un ré-import du même fichier ne multiplie pas les entrées). Il encode
donc la **catégorie** et le **niveau** : quatre choses le périment.

| Ce qui change | Invalidait avant ? |
|---|---|
| Le **fichier** chargé | ❌ — *le bug signalé par KARMA* |
| La colonne du **niveau** | ❌ |
| La colonne des **types** | ❌ |
| Un select de **routage** | ✅ |

Les quatre passent désormais par `_sigImpInvaliderLegende(avecMessage)`.

⚠️ **Une génération réussie n'invalide rien**, volontairement : régénérer le même
fichier (autre largeur de canvas, autre couleur de fond) doit conserver les noms
saisis. C'est le changement de **fichier** qui périme, pas l'export.

🩸 **Piège d'ordre des listeners** : `majBtnLegende` remet l'état affiché à vide
quand il n'y a plus d'entrées. L'invalidation de la colonne du niveau est donc
attachée **après** lui — les listeners se déclenchent dans l'ordre
d'attachement, et posée avant, son message était aussitôt effacé.

---

---

### 69.3 Altitude réelle : KMZ oui, GPX non — et pourquoi (v1.83.0)

Les profondeurs de niveaux existent depuis la v1.83.0. Les deux exports ne les
traitent **pas** de la même façon, et l'asymétrie est délibérée.

**KMZ — l'altitude est écrite.** `_coord` produisait `lng,lat,0` en dur : un
relevé de carrière ouvert dans Google Earth **flottait sur les vignes**. Il se
pose maintenant à sa profondeur.

⚠️ **L'altitude seule ne suffit pas.** Par défaut KML est en `clampToGround` et
l'ignore, et `<tessellate>1</tessellate>` force ce collage au sol. Toute
géométrie porteuse d'altitude doit donc déclarer `relativeToGround` **et**
renoncer au tessellate — les deux, sinon rien ne bouge. `_modeAltitude(alt)`
émet l'un ou l'autre : à altitude nulle, le KML est **inchangé** pour les plans
sans profondeurs.

`relativeToGround` et non `absolute` : notre profondeur est mesurée **sous la
surface**, pas depuis le niveau de la mer. L'altitude du terrain nous est
inconnue, et l'inventer serait plus faux que zéro.

Une **jonction** est posée au plus haut de ses deux étages : une `LineString`
n'a qu'un mode d'altitude, on ne peut pas l'incliner.

**GPX — pas de `<ele>`, et c'est le choix honnête.** En GPX, `<ele>` est
l'altitude **au-dessus du niveau de la mer** : c'est ce que lisent les GPS et
les logiciels de rando. Y écrire « -30 » pour une galerie à 30 m sous une
colline à 100 m annoncerait un point à **30 m sous la mer** — une erreur de
130 m, parfaitement plausible à l'œil, donc indétectable.

Il faudrait l'altitude du terrain, que l'app ne connaît pas. La profondeur part
donc dans la **`<desc>`** (« Niveau -2 · -35.0 m sous la surface »), lue par un
humain et par rien d'autre.

> C'est le même arbitrage que partout ailleurs ici : **on ne remplit pas un
> champ normalisé avec une grandeur qui n'est pas la sienne.** Le jour où l'app
> saura l'altitude du terrain (géoréf + modèle d'élévation), `<ele>` deviendra
> calculable — pas avant.
