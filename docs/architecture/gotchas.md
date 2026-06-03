# Architecture MyKTAMap — Pièges connus, renommages, workflow

> Référence détaillée extraite de l'ancien CLAUDE.md. Lue à la demande (pas auto-chargée).
> Sections : 🚨 Pièges connus & règles importantes, 🛠️ Workflow de modification typique

---

## 🚨 Pièges connus & règles importantes

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
