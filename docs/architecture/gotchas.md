# Architecture MyKTAMap — Pièges connus, renommages, workflow

> Référence détaillée extraite de l'ancien CLAUDE.md. Lue à la demande (pas auto-chargée).
> Sections : 🚨 Pièges connus & règles importantes, 🛠️ Workflow de modification typique

---


## 📦 Un asset de plan vit TOUJOURS sous `data/` — et le plan-config doit le DIRE

Quatre producteurs écrivent un `plan-config.json` : `createConf.js` (Générateur), `sigImport.js`, `gpxImport.js`, `kmzImport.js`. Tous écrivent leurs fichiers dans `data/` du ZIP. **Seul le Générateur les déclarait avec le préfixe.**

```js
zip.file("data/sig.json", …);                    // écrit ICI
dataLayers: [{ file: "sig.json" }]               // ❌ déclaré SANS le préfixe
dataLayers: [{ file: "data/sig.json" }]          // ✅
```

🩸 **Pourquoi ça survit des années** : en import **local**, `findMatchingFile` retrouve l'asset par son **nom de base**. L'incohérence est donc totalement invisible — jusqu'au **mode serveur**, où la résolution est stricte et rend un 404. `kmzImport` a corrigé ce motif pour ses **calques** en v1.21.0-fix5 et l'a laissé sur son `baseImage` ; `sigImport` et `gpxImport` ne l'avaient jamais corrigé. Réparé en **v1.88.4**, avec un garde-fou qui refuse la réapparition d'un `baseImage` nu.

⚠️ **Conséquence de conception** : la tolérance de l'import local **masque** les erreurs de chemin. Tout nouveau producteur doit être vérifié **en mode serveur**, pas seulement par un import ZIP.

---

## 🕳️ Le « mangeur de blocs » — il revient dès qu'on nettoie les commentaires à la regex

**Vécu deux fois** : `check-i18n` en v1.79.2, puis **mes propres garde-fous en v1.88.2**.

```js
src.replace(/\/\*[\s\S]*?\*\//g, " ")   // ❌ JAMAIS
```

Un `/*` n'apparaît pas que dans un commentaire : `accept="image/*"`, un chemin cité comme `` `data/**` ``, une regex. Le non-greedy avale alors **tout jusqu'au `*/` suivant**.

**Mesuré en v1.88.2**, sur les fichiers que mes garde-fous inspectaient :

| Fichier | Perte |
|---|---|
| `js/main.js` | **88 %** (98 986 → 12 170 octets) |
| `sw.js`, `index.html`, `js/config.js` | ~50 % |
| `js/homeLoader.js` | ~28 % |

🩸 **Le danger n'est pas le faux rouge, qui se voit.** Ce sont les assertions de la forme **« X n'est PAS présent »** — `indexOf(...) < 0` — **vraies par accident** dès que la zone a été mangée. Un garde-fou vert qui ne garde plus rien.

✅ **La règle** : ne retirer que des **lignes entières** de commentaire (`^\s*//`, et les plages `/*` → `*/` dont la ligne *commence* par `/*`). Un `/*` au milieu d'une ligne de code est laissé tel quel — il ne peut plus rien avaler. Implémentation de référence : `sansCommentaires()` dans `scripts/check-tiling.js`.

⚠️ Ironie utile : le `/*` qui a déclenché la 2ᵉ occurrence venait d'un commentaire que je venais d'écrire — `` // … `data/**` tombe dans « le reste » `` — dans le fichier même que le garde-fou inspectait.

## 🚨 Pièges connus & règles importantes

### Regex JavaScript sur emojis (surrogate pairs)

⚠️ **Piège récurrent** : un emoji moderne (codepoint ≥ U+10000, ex : 📄 = U+1F4C4, 📂 = U+1F4C2) est stocké en JavaScript comme une **surrogate pair UTF-16** (2 code units). Une regex character class `[📄]` SANS le flag `u` est interprétée comme `[\uD83D OR \uDCC4]` — set de 2 code units séparés, PAS le caractère composé.

❌ **Buggy** :
```js
"📄 file.png".replace(/^[✅📄] /, "")  // ne strippe PAS le préfixe 📄 !
// → "📄 file.png" inchangé (silencieux), causant échec de lookup downstream
```

✅ **Correct** : ajouter le flag `u` (Unicode mode) :
```js
"📄 file.png".replace(/^[✅📄]\s/u, "")  // → "file.png" propre
```

Alternative sans `u` (plus verbeuse mais portable older engines) :
```js
"📄 file.png".replace(/^(✅|📄)\s/, "")  // alternation au lieu de class
```

**Sites historiquement touchés** : `js/createConf.js` (6 lignes, fix v1.40.23, KARMA bug "📄 four_a_chaux_LEGENDE.png introuvable"). Si tu ajoutes une regex sur un emoji ≥ U+10000 ailleurs, vérifie le flag `u` AVANT commit. Idem `string.length` sur emoji renvoie 2, pas 1 — utiliser `[...string].length` si besoin du vrai count.

### Z-index et modales sur-imposées

⚠️ **Bug type récurrent** : créer une modale par-dessus une autre sans gérer le z-index relatif.

- Modale parent `kta-readme-modal-overlay` : `z-index: 99999`
- Sous-modale créée à la volée : utiliser `z-index: 100001` (parent + 2)

Voir le fix de `tableEditor.js > _menuSauvegarde` (z-index 100001).

### Pointer-events sur le titre fixe

⚠️ Avant 06/05/2026, `#kta-titre-fixe` avait `pointer-events: none`. Ne PAS rétablir cela : le titre est maintenant cliquable.

### Suppression prématurée d'éléments DOM

⚠️ **Ne PAS supprimer `kta-titre-fixe` avant un chargement de plan** : si le chargement échoue (modale "Plan introuvable" puis Annuler), le titre n'est jamais recréé. La suppression doit être faite UNIQUEMENT par `lancerApplication()` qui le recrée via `initInterface()`.

### Cache de recherche

⚠️ **`_pointsCache` ne contient QUE les points externes** (data layers). Les points editor sont récupérés à chaque appel via `_collecterPointsEditor()` pour rester à jour après import de session.

→ Le clic sur un résultat doit utiliser `_visibles[idx]` (liste affichée) et NON `_pointsCache[idx]`.

### Persistance localStorage / IndexedDB

⚠️ **Toujours appeler `requestPersistentStorage()`** avant `saveBlob()` sur mobile (sinon iOS/Chrome Android peuvent purger le cache).

⚠️ **Au reset complet** : penser à vider AUSSI les bases IndexedDB. Fallback Safari nécessaire car `indexedDB.databases()` n'est pas dispo partout.

### Couleurs de texte dans les modales

⚠️ Toujours définir une `color` explicite sur le contenu d'une modale custom — sans ça, le texte hérite du noir par défaut du body. Le sélecteur `.kta-readme-modal-corps` a maintenant `color: #c8d0e0` par défaut.

### Renommages anciens à connaître (depuis 08/05/2026)

⚠️ Du code/doc plus ancien peut référencer ces noms — c'est qu'il n'a pas été migré :

| Ancien nom | Nouveau nom | Notes |
|---|---|---|
| `APP_CONFIG.motionDebug` | `APP_CONFIG.debugMode` | Flag global (plus uniquement tracker) |
| `APP_CONFIG.perfMode` (boolean tri-state) | `APP_CONFIG.perfPreset` (string) | Valeurs : `"auto"` / `"quality"` / `"balanced"` / `"performance"` |
| `perfModeActif(fileSize)` | `resoudrePerfPreset(preset, fileSize, W, H)` | L'ancien est conservé en alias rétro-compat |
| `localStorage.app_user_prefs.motionDebug` | `localStorage.app_user_prefs.debugMode` | Migré silencieusement au boot |
| `localStorage.app_user_prefs.perfMode` | (supprimé — pref globale n'existe plus) | `perfPreset` est désormais par plan via `PlanRegistry[planId].perfPreset` |
| `cfg_motionDebug` (id select Réglages) | `cfg_debugMode` | — |
| label "Debug mouvement" (Réglages) | "Logs détaillés" | — |
| Constante `TILE_SIZE = 1024` | `params.tileSize` (lu depuis le preset) | Idem `MAX_WORK_DIM` → `params.maxWorkDim`, `0.88` → `params.jpegQuality` |

### Audit 09/05/2026 — code mort retiré

Du code/doc plus ancien peut référencer ces noms — ils n'existent plus :

| Ancien nom | Action | Notes |
|---|---|---|
| `js/sw.js` | **supprimé** | ancien SW abandonné, le vrai vit à la racine |
| `js/import.html` | **supprimé** | page autonome obsolète, fusionnée dans `index.html` |
| `window.iconeSalle`, `iconepa`, `iconepc`, `iconepb`, `iconeVehicule`, `iconeElec`, `iconeEpure`, `iconePS`, `iconeInfo`, `iconeChatiere`, `iconePassage`, `iconeDanger`, `iconepe` | **supprimés** (13 globals) | résolution unique via `window._iconMap[tag]` désormais. Seuls `iconeDefault` et `iconeTrack` restent globaux. |
| `perfModeActif(fileSize)` + `window.perfModeActif` | **supprimé** | alias rétro-compat jamais consommé après migration vers `perfPreset` |
| `window._SERVER_PLAN_PATH` | **supprimé** | dead write (jamais lu) |
| Classes CSS `.kta-cfg-actions`, `.kta-cfg-cache`, `.kta-conv-apercu`, `.kta-conv-hint`, `.kta-legende-separateur`, `.kta-planner-tabs`, `.kta-planner-tab` | **supprimées** | jamais référencées en JS/HTML |
| Onglets export `⚡ Export rapide` / `🎨 Avancé` | renommés | `⚡ Mode rapide` / `🎨 Mode avancé` (UX : le mot "Mode" évite que l'utilisateur lise ça comme un bouton d'action) |

### Coordonnées plan ↔ Leaflet

```js
function convertCoord(x, y) {
  return [APP_CONFIG.imageHeight - y, x];
}
```

L'origine GIMP/image (haut-gauche) doit être convertie pour Leaflet (bas-gauche).
**Toujours** utiliser `convertCoord()` et **jamais** passer directement `[y, x]` à Leaflet.

### Tracker (expérimental)

⚠️ Le tracker est marqué **expérimental** dans la doc. Sa précision dépend du calibrage du plan (`scale` pixel→mètre) et dérive avec le temps. Le **recalage manuel** (📍) est essentiel.

⚠️ **Ne PAS demander la permission capteurs au démarrage de la page** — UNIQUEMENT au clic ▶️ Play (iOS exige un geste utilisateur explicite).

---

## 🆕 Pièges récents (v1.30+)

5 pièges détectés / documentés pendant le cycle v1.29.4 → v1.31.0. Renvois vers les docs détaillées pour le contexte complet.

### CSS spécificité frontière community/pro

⚠️ Un `display: ...` (ou autre override) sur une classe partagée avec `.kta-licence-community` / `.kta-licence-pro` SANS scoping `html.kta-instance-pro` → **bug de spécificité garanti**. Les 2 règles ayant la même spécificité (1 classe chacune), la cascade applique la "latest declared" → côté community, le suffixe pro peut s'afficher (bug v1.30.0 corrigé en v1.30.1).

✅ **Toujours scoper** sous `html.kta-instance-pro .ma-classe` les overrides côté pro qui touchent à la frontière. Cf `security-legal.md §84` (lesson learned complète).

### Références directes cross-module après P3

⚠️ Depuis le refactor P3 v1.31.0 (`interface.js` → 9 modules `interface*.js`), les appels directs `afficherConfig()`, `ouvrirImportSession()`, `_ouvrirCreationJonction()` sans préfixe `window.` peuvent lever `ReferenceError` au runtime si la fonction a été extraite dans un autre module.

✅ **Pattern à respecter** : `if (typeof window.afficherConfig === "function") window.afficherConfig()`. Cf `ui.md §85.3` (pièges détaillés P3) + `§85.7` (À NE PAS faire).

### Markers à NE PAS culler (viewport culling P5)

⚠️ Depuis v1.30.0 (viewport culling markers POI), tous les markers ne sont plus attachés au DOM Leaflet en permanence. **Certaines catégories DOIVENT rester visibles** quel que soit le viewport :

- Markers d'itinéraire (départ + arrivée + waypoints)
- Markers Mode Secours (équipes, statuts)
- Marker GPS tracker (position user)
- Markers temporaires de mesure (workflow utilisateur en cours)
- Markers d'éditeur en cours de placement

✅ Ces markers passent par un autre pipeline que `_refreshDataMarkersViewport` ou sont marqués `_neverCull = true`. Cf `perf-memory.md §81.5` (liste complète + raisons).

### Linter qui modifie un fichier entre Read et Edit (workflow Claude Code)

⚠️ Sur les fichiers volumineux (`interface.js`, `secoursMode.js`, `style.css`, etc.), le linter Claude Code peut toucher le fichier juste après une `Read` mais avant l'`Edit` suivant. Résultat : `File modified since read` côté outil → l'`Edit` échoue.

✅ **Solution** : re-`Read` systématiquement juste avant un `Edit` critique sur un fichier qui peut avoir été linté/modifié. Détecté pendant P3 v1.31.0 sur plusieurs lots d'extraction.

### Checklist "ajouter un module JS" (3-4 sites à toucher)

⚠️ Ajouter un nouveau fichier `js/xxx.js` SANS toucher aux fichiers liés = le module ne sera pas servi offline ni vu par les clients existants.

✅ **Checklist obligatoire** à chaque ajout :

1. **Créer** `js/xxx.js` (IIFE + API `window.MyKTAMapXxx = {...}`, cf conventions JS du CLAUDE.md racine)
2. **Charger** dans `index.html` avec `<script src="js/xxx.js" defer></script>` à la BONNE position (= avant les modules qui le consomment ; après ses dépendances). Cf `perf-memory.md §82` sur defer
3. **Cacher offline** dans `sw.js > ASSETS_TO_CACHE` (ajouter `"./js/xxx.js"`)
4. **Bumper** `sw.js > CACHE_NAME` + `js/copyright.js > __MKM__.build` + `version.json` (3 sources de vérité ENSEMBLE — cf CLAUDE.md racine § Release)
5. **Sync docs sur 4 axes** : in-app + audit + dev + archi IA (cf CLAUDE.md racine § Bump = sync docs)

Cf `ui.md §85.6` ("Pour ajouter une nouvelle modale") pour le pattern complet.

---

## 🚨 Pièges du sweep perf v1.31.x (P2 progressive lazy CSS)

2 pièges spécifiques au pattern P2 (cf `perf-memory.md §87`) détectés pendant le sweep
v1.31.4 → v1.31.5.

### `cssLazy.js` doit être SYNC (pas defer) pour servir les modules consumer SYNC

⚠️ Si on extrait du CSS pour une feature dont le module JS est chargé **SYNC en haut de
`index.html`** (typiquement `memInspector.js`, `statsGlobales.js`, etc.), il faut que le
helper `window._loadCssOnce` posé par `js/cssLazy.js` soit DÉJÀ disponible au moment où
l'IIFE du module s'exécute. Donc `cssLazy.js` lui-même DOIT être SYNC, posé tôt (juste
après `networkAudit.js`), PAS en `defer`.

Si `cssLazy.js` est en `defer`, le check défensif `typeof window._loadCssOnce ===
"function"` retourne `false` dans les modules SYNC qui s'exécutent avant lui → le chunk
n'est **JAMAIS préchargé** → FOUC garanti au 1er ouverture de la modale, voire styling
dégradé permanent si le chunk n'a pas non plus été appelé ailleurs.

✅ **Pattern correct** : `cssLazy.js` est SYNC dès l'init de la page. Aucun effet de bord
(pose juste un global, zéro réseau) → safe à charger très tôt. Détecté + corrigé en v1.31.5
quand on a étendu P2 aux modules SYNC (Inspecteur, Stats globales).

### Extraction de blocs CSS par sed : off-by-one entre fin extrait et début queue

⚠️ Quand on extrait un bloc `M → N` du `style.css` avec une reconstruction du style :

```bash
sed -n '1,(M-1)p' style.css > new.css
sed -n 'M,Np' style.css > extracted.css
sed -n '(N+1),$p' style.css >> new.css
```

Il est facile de se tromper d'1 ligne sur le `<after>` de la queue :
- Si on garde à partir de **`N`** au lieu de **`N+1`** → duplication de la ligne `N`
- Si on garde à partir de **`N+2`** au lieu de **`N+1`** → trou d'1 ligne (le `*/` fermant
  d'un commentaire de section peut disparaître, créant un commentaire orphelin)

**Cas concret v1.31.4** : extraction d'un bloc qui finissait par un séparateur en
commentaire multi-ligne :
```css
/* ═══════════════════════════════════════════════════════════════════════════
   🆕 v1.22.0 — Mode Secours : modale UI (liste + create + edit free-form)
   ═══════════════════════════════════════════════════════════════════════════ */
.kta-secours-modal-boite { ... }
```

L'extraction a coupé après la 3ᵉ ligne (`═══ */`), mais la queue a démarré à `<after>+1`
sur `🆕 v1.22.0` au lieu de sur `═══ */` → l'`*/` fermant disparaît de `style.css`. Le CSS
restait **techniquement valide** (le browser cherche le `*/` suivant, qui se trouvait dans
le commentaire de la section voisine), mais ça crée un **commentaire orphelin moche** dans
le fichier principal qui consomme tout le CSS suivant comme s'il était commenté jusqu'à
ce `*/` trouvé.

✅ **Mitigation** systématique après chaque extraction :
1. `grep -c "<préfixe extrait>" style.css` → doit retourner `0`
2. `grep -nE "🆕 v.*<feature>" style.css` → détecte les commentaires orphelins d'une
   section qui aurait été coupée en plein milieu
3. Inspection visuelle des **10 lignes avant + 10 lignes après** la zone d'extraction
4. Validation Coverage CSS dans DevTools (la feature non ouverte = 0 % utilisé du chunk)

Cleanup v1.31.5 a retiré l'orphelin via `sed -i '/<motif>/d'`. Doc complète : cf
`perf-memory.md §87.7` dernier item.

---

<!-- v1.34.16+ : pièges sprint Pack RAM iPhone -->
## 🚨 Pièges du sprint Pack RAM v1.34.x (anti-crash iPhone PWA)

3 pièges supplémentaires détectés / documentés pendant le sprint v1.34.5 → v1.34.16.
Référence détaillée dans `perf-memory.md §88`.

### Helper appelé jamais défini — `_revokeAllPhotoObjectUrls` (13 versions dormantes)

⚠️ **Gotcha majeur** détecté en v1.34.16. Le helper `_revokeAllPhotoObjectUrls(planId)`
était **appelé** depuis `_libererRessourcesPlanPrecedent` (cleanup au plan switch)
**depuis v1.21.3** mais **jamais défini nulle part** dans le code.

**Pourquoi ça n'a jamais crashé** : le cleanup est enrobé d'un try/catch défensif large
qui avale tous les `ReferenceError`. Le log existait mais seulement en debug mode (qui
n'est jamais activé en prod).

**Effet réel** : fuite mémoire silencieuse de ~22 MB par plan switch sur sessions Mode
Secours avec photos. Visible côté RAM iPhone, invisible côté UX. Contributeur direct
aux crashes WebKit après quelques switches.

✅ **Règle absolue** : à chaque nouveau helper appelé, un grep cross-fichier obligatoire
pour vérifier qu'il existe au moins une fois quelque part :

```bash
grep -rn "_revokeAllPhotoObjectUrls" js/
# → doit retourner au moins 2 lignes : 1 définition + N appels
# Si N appels et 0 définition → bug latent
```

Vaut aussi pour les méthodes posées sur des globals `window.X.method` : grep `window.X`
+ scan visuel des méthodes attachées.

### `_lazyZipRef` wipé par le cleanup générique au plan switch (v1.34.12)

⚠️ `main.js > _libererRessourcesPlanPrecedent` nullifie en masse tous les `_*` du plan
sortant (pattern v1.21.3 P0-6 « Plan switch leaks pack »). Au plan switch, si les 2
plans coexistent transitoirement dans la closure du cleanup, le `_lazyZipRef` du
**nouveau** plan peut être supprimé à tort → lazy fetch ultérieur échoue → carrés gris
persistants.

✅ **Pattern à respecter** : whitelist explicite des clés à préserver dans le sweep :

```js
const _LAZY_KEEP_KEYS = ["_lazyZipRef"];
for (const key of Object.keys(plan)) {
  if (key.startsWith("_") && !_LAZY_KEEP_KEYS.includes(key)) delete plan[key];
}
```

Toute future ref qui doit survivre au cleanup générique (ex: handle stream, blob URL
gardé, etc.) doit être ajoutée à cette whitelist. Cf `plans-loader.md §59.4`.

### WebKit bitmap pinning — `map.removeLayer()` ne libère PAS la RAM native iOS

⚠️ Sur iOS Safari / PWA, retirer un `L.imageOverlay` de la carte via `map.removeLayer()`
ne libère **pas** la texture GPU décompressée tant que `overlay._image.src` pointe vers
un blob/data-URL. WebKit garde la texture pinnée jusqu'à GC effective de l'élément
`<img>` — qui peut ne jamais arriver si le layer reste référencé.

✅ **Pattern safe-remove** :

```js
function _safeRemoveImageOverlay(overlay) {
  if (overlay && overlay._image) {
    overlay._image.src = "";
    overlay._image.removeAttribute("src");
  }
  if (overlay && window.map) window.map.removeLayer(overlay);
}
```

Sites consommateurs (v1.34.16) : `libererTuiles` (tuiles V2) + boucle cleanup
`_ktaImageOverlays` (calques image). Cf `rendering-leaflet.md §39` + `perf-memory.md
§88.5.B/C`.

### `URL.createObjectURL` sans `revoke` — fuite à chaque feature qui affiche un blob

⚠️ Tout `URL.createObjectURL(blob)` doit avoir son `URL.revokeObjectURL(url)`
correspondant au démontage de l'élément qui le consomme. Sinon le blob reste pinné en
RAM tant que la page est ouverte.

✅ **Pattern** : garder les URLs créées dans un Set module-local, appeler `revoke` sur
chacune au démontage (plan switch, fermeture de la modale qui affichait les photos,
etc.). Cf fuite #3 corrigée en v1.34.15 (photos Live Mode Secours, `perf-memory.md §88.4`).

---

## 🛠️ Workflow de modification typique

### Pour ajouter une fonctionnalité

1. **Vérifier d'abord** dans le README.md > Journal des modifications si une fonctionnalité similaire existe déjà ou a été tentée.
2. **Faire un topo avant de coder** — c'est la règle d'or de l'auteur :
   - Décrire le problème
   - Lister les choix de design possibles avec recommandation
   - Demander validation des choix
3. **Synchroniser les fichiers** depuis les uploads de l'utilisateur (les fichiers `outputs/` peuvent être en retard).
4. **Coder le minimum nécessaire** — éviter les refontes massives.
5. **Vérifier** avec `node -c` (syntaxe) + checks `grep` ciblés.
6. **Mettre à jour la doc** : `README.md` (DEV) + `README_USER.md` (utilisateur) si user-facing.
7. **Présenter les fichiers** modifiés via `present_files`.
8. **Récapituler** : cause racine, fix, comportements avant/après, tests à faire.

### Pour fixer un bug

1. **Reproduire mentalement** le scénario décrit par l'utilisateur.
2. **Localiser** le code concerné (`grep -n` est ton ami).
3. **Identifier la cause racine** (pas seulement le symptôme).
4. **Proposer le fix** sans toucher aux comportements adjacents.
5. **Vérifier les régressions potentielles** (autres modules qui utilisent la même fonction).
6. **Tester mentalement** chaque cas avant/après.

### Pour ajouter un nouveau type d'icône

Suivre la **checklist en 7 étapes** détaillée dans la section "Architecture clé > 2. Cascade de résolution des icônes".

### Pour modifier la légende exportée

Voir `exporter.js > _dessinerLegende`. La répartition est automatique (algorithme équilibré). Pour ajouter une section, il faut :

1. Ajouter dans `GROUPES_ICONES` (si lié aux icônes) ou ajouter une section directement dans `entrees`.
2. Mettre à jour le `LBL` local pour les nouveaux tags.
3. Tester avec un plan riche pour vérifier la répartition gauche/droite.

---

## 🗺️ `PLAN_CONFIG` n'est PAS un marqueur « un plan est affiché » (v1.69.0)

**Symptôme** (bug KARMA 29/07/2026, capture à l'appui) : la modale **Recherche multi-plans** ouverte **depuis le HOME** affichait la case « 🌀 Itinéraire via plusieurs plans » et les boutons **🧭** sur les résultats — deux notions qui n'existent que plan chargé (l'itinéraire part de la position tracker du plan courant).

**Cause racine** : le marqueur utilisé partout était `!!(window.PLAN_CONFIG && window.PLAN_CONFIG.plan)`. Or **`afficherLoader()` (retour à l'accueil) ne remet jamais `PLAN_CONFIG` à `null`** — il masque `#map` et pose `body.kta-loader-active`. Une fois un plan ouvert, le marqueur reste donc **vrai pour le reste de la session**, y compris au HOME. Le commentaire de `crossPlanSearch.js` affirmait l'inverse (« PLAN_CONFIG est null au home ») depuis v1.58.1 : c'était faux.

**Trois faux positifs réels**, pas seulement l'affichage :
1. case multi-hop + boutons 🧭 sur l'accueil (`crossPlanSearch`) ;
2. mini-confirmation « changer de plan ? » posée depuis l'accueil (`interPlanLinks`, 2 sites) ;
3. plus grave — `InterPlanLinks.goTo` prenait le **chemin court « déjà sur ce plan »** (`planCharge && planId === _currentPlanId()`, `_currentLoadedPlanId` étant lui aussi persistant) : depuis le HOME, cliquer sur une liaison pointant vers le **dernier plan ouvert** ne chargeait **rien**.

**Fix — source de vérité unique** : `window.ktaPlanAffiche()` (`utils.js`). Elle teste d'abord `body.kta-loader-active` (posée par `afficherLoader`, retirée au masquage du loader — strictement symétrique), puis `PLAN_CONFIG` en complément pour le boot initial où la classe peut ne pas encore être posée.

**À NE PAS faire** :
- ❌ Réutiliser `PLAN_CONFIG && PLAN_CONFIG.plan` pour savoir si l'on est sur un plan ou au HOME (c'est valide uniquement pour LIRE les métadonnées du dernier plan chargé : nom, échelle…).
- ❌ Se fier à `window._currentLoadedPlanId` : lui aussi **persiste** au retour HOME.
- ❌ « Corriger » en remettant `PLAN_CONFIG = null` dans `afficherLoader()` : des dizaines de call-sites lisent ce champ sans garde, ça déplacerait le bug ailleurs.

---

## 🔌 Un listener de map ne se garde JAMAIS par un drapeau global (v1.82.0)

`window.map` est **remplacée** à chaque plan chargé : nouvelle instance, aucun
listener. Un drapeau global du genre `window._ktaXxxBound` survit à ce
remplacement — il annonce « déjà branché » alors que la nouvelle map ne l'est
pas, le branchement est sauté, et le listener ne se pose **plus jamais** pour le
reste de la session.

```js
// ❌ le drapeau survit à la map
if (window._monHookBound) return;
window._monHookBound = true;
window.map.on("zoomend", monHandler);

// ✅ le drapeau meurt avec la map
if (!window.map._monHookBound) {
  window.map.on("zoomend", monHandler);
  window.map._monHookBound = true;
}
```

**Ce piège a mordu deux fois.** v1.30.0 (culling des markers → corrigé en
portant le drapeau sur `map._mkmMarkerHookBound`, le commentaire « au plan
switch → nouvelle map → nouveau bind » est encore dans `utils.js`), puis
v1.82.0 (largeur des fronts au zoom) — la leçon était donc **déjà écrite dans le
dépôt** quand elle a été refaite. D'où `scripts/check-map-listeners.js`,
bloquant au pre-commit.

🩸 **POURQUOI LE SYMPTÔME ÉGARE** : le contournement de l'utilisateur marche.
KARMA : « je dois masquer tous les niveaux, dézoomer, les réactiver, sinon ça ne
prend pas » — parce que réactiver déclenche un re-rendu, lequel rappelle la
fonction, laquelle recalcule à la volée. On cherche alors un défaut dans le
calcul, qui est juste. **Le mécanisme a l'air vivant : seul son déclencheur a
disparu.** Devant un bug qui se contourne par un geste d'UI, vérifier d'abord ce
qui déclenche.

Corollaire : `_repeindreCarte`, `renderRoads`, `renderStructures` etc.
recalculent tout au passage. Un bug qu'un re-rendu masque n'est pas un bug de
rendu.

## 🎨 Forcer une repeinture du canvas Leaflet : neutraliser `_redrawBounds`

`preferCanvas: true` — muter `layer.options.weight` suffit, le renderer le relit
à chaque frame, mais **il faut provoquer la frame**. Or, lu dans
`lib/leaflet/leaflet.js` (**1.1.1**, vendoré) :

```js
_redraw: function(){ this._redrawRequest=null,
  this._redrawBounds&&(…floor/ceil…), this._clear(), this._draw(), this._redrawBounds=null }
_draw: function(){ …i=this._redrawBounds; i&&(…rect…,clip());
  for(…) (!i || layer._pxBounds.intersects(i)) && layer._updatePath(); … }
```

`_draw` **clippe** sur `_redrawBounds` et **saute** tout layer qui ne les croise
pas ; `_clear` n'efface que ce rectangle. Si une demande par layer est en
attente (`_requestRedraw` les a posées), un `_redraw()` forcé ne repeint donc
qu'un petit rectangle — le reste de la carte garde l'ancien style, sans erreur ni
avertissement.

```js
r._redrawBounds = null;   // pas de clip : `_clear` efface tout, `_draw` repeint tout
r._redraw();
```

⚠️ Ne pas confondre avec `_repeindreCarte()` (legendCustomization), qui rejoue
les `render*` complets : c'est le bon outil pour un changement de style ponctuel,
et l'inverse de ce qu'il faut sur un `zoomend` à 20 000 objets.
