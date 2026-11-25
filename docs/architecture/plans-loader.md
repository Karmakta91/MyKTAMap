# Architecture MyKTAMap — Plans : registre, loader, générateur

> Référence détaillée extraite de l'ancien CLAUDE.md. Lue à la demande (pas auto-chargée).
> Sections : §3, §33, §39, §58

---

### 3. Multi-plans (depuis 06/05/2026)

- **`planRegistry.js`** gère la liste des plans connus.
- **localStorage** : `myktamap_plans` (registre + lastPlanId)
- **IndexedDB** : `myktamap_handles` (v2, 2 stores : `handles` pour FS Access API, `blobs` pour ZIPs mémorisés).
  Une seule connexion par page (`planRegistry.js > _openIDB`, jamais fermée par un appelant), oubliée à `onclose` et
  fermée d'elle-même à `onversionchange` : « tout effacer » ou une montée de version n'est jamais bloqué par elle.
  Dans `blobs`, la clé `id` porte soit le ZIP d'un seul tenant (`saveBlob` : ZIP local, Générateur, import), soit la
  fiche d'une **copie en morceaux** (`rangerEnMorceaux`, prise d'une extension qui range un plan tranche par tranche) dont
  les morceaux vivent sous les clés `[id, gen, i]` ; `getBlob` recompose, `removeBlob` efface tout. Les lecteurs bruts du
  store (`memInspector` : orphelins sur les clés chaîne ; `homeProfile` : poids, « dont ☁️ » par `clé[0]`) le savent.
  Contrat et piège WebKit : `community-server-line.md` §3 (copie gardée en morceaux).
- **Auto-discovery** serveur via `data/index.json` :
  ```json
  { "plans": [{ "id": "test1", "path": "data/test1", "name": "Test 1" }] }
  ```
- **📦 Plan déclaré par son ARCHIVE** (`"zip": "data/test1.zip"` à la place de `path`) — le ZIP est servi tel
  quel, sans dossier décompressé (même fonctionnement qu'un plan d'extension) :
  - `decouvrirPlansServeur` n'accepte qu'un chemin **relatif** `.zip` (`/^[\w./-]+\.zip$/`, ni `..`, ni `/`
    initial, ni schéma) → `regEntry.zip` ; refusé = avertissement console, l'entrée retombe sur `path`.
  - Ouverture (`chargerPlanDuRegistre`, branche `plan.zip` AVANT la branche dossier) : `_telechargerZipIndex`
    télécharge avec progression (écran central) sous **veilleur d'inactivité** (`_veilleurTelechargement` :
    15 s sans réponse, puis 20 s sans octet → annulé ; rien tenté si `navigator.onLine === false` ; même veilleur
    pour les plans ☁️ d'extension), **conditionnel** si une copie est gardée (`If-None-Match` /
    `If-Modified-Since` depuis `zipEtag` / `zipLastModified`) : 304 ou réseau absent → `PlanRegistry.getBlob` ;
    404 → modale « plan introuvable ». Puis `chargerZipFichier(…, { typeRegistre: "server-zip" })`.
  - `startImportedPlan` : `server-zip` **reste `type: "server"`** (l'index peut le retirer — l'élagage retire
    aussi la copie via `PlanRegistry.remove`), nom de l'index, version du plan-config (`versionSrc: "plan"`).
    La copie n'est rangée qu'après un téléchargement **frais**, selon « Mémoriser » (ou si une copie existait).
  - Hors-ligne = la copie IndexedDB, **pas** `PlanOffline` : bouton de ligne 💾 / ✅ / ⬇️ (périmé, sonde HEAD
    conditionnelle, une par plan et par 30 s), pas de bloc 💾 dans la fiche ℹ️ ; le SW laisse passer les `.zip`
    (jamais dans `CACHE_NAME`). Les lecteurs « sans ouvrir » (liaisons, profil, aperçu OSM) lisent la copie
    comme pour un plan local. Garde-fou : `check-plan-offline.js` §4 bis. ConfAdmin : colonne « Format ».
- **🛠️ Format ÉTENDU kiosque (v1.73.0 — figé, généré par `confadmin.html`)** — `index.json` peut porter en plus :
  ```json
  {
    "config":   { "subtitle": "Secteur Nord", "serverPlansOnly": true, "disableGenerator": true },
    "plans":    [{ "id": "...", "path": "data/...", "name": "...", "version": "...", "author": "...", "multiLevel": true, "tiledV2": true }],
    "liaisons": { "version": 1, "links": [ /* format registre myktamap_interplan_links_v1, planId REMAPPÉS "server_<id>" */ ] }
  }
  ```
  ⚠️ `decouvrirPlansServeur` (main.js) ne lit QUE `plans` aujourd'hui — champs inconnus ignorés (rétrocompat totale). **`config.subtitle` est lu DÈS v1.73.0** (`main.js > _appliquerSousTitreKiosque`, appelé par `decouvrirPlansServeur`) : remplace « Cartographie souterraine » sur les 2 nœuds `[data-i18n="home.tagline"]` (splash + header loader) via `textContent` (jamais innerHTML) **+ retrait de l'attribut `data-i18n`** — sans ce retrait, tout changement de langue ré-écraserait l'override. ⚠️ Pref « ne pas charger les plans serveur » → discovery skippée → sous-titre non appliqué (limite consignée, résolue au lot lecteurs). **Depuis v1.73.0 TOUT est lu** : `_chargerIndexServeur()` (main.js) fetch l'index à CHAQUE boot (même pref skip-server active — elle ne skippe que l'inscription des plans), le SW le sert **network-first** (fraîcheur kiosque, fallback cache offline) ; `_appliquerConfigKiosque()` applique sous-titre + flags (serverPlansOnly masque #panelZip + head + .loader-plans-filters + section pref skip ; disableGenerator masque #loaderPlannerBtn) ; les `liaisons` sont fusionnées par id via `InterPlanLinks.importLinks` (idempotent, rejouée à chaque boot). Le tagline des PDF exportés suit aussi `config.subtitle` (pdfExport). `config.serverConnection` (v2.0.0, connexion serveur d'une instance) est lu au même endroit par `_appliquerConnexionServeur()` → `js/ktaExtensions.js` (état + pastille, aucune requête) ; un non-2xx (dont le 404 synthétique du SW hors ligne) compte comme « index injoignable » → dernière config mémorisée. Gouvernance + règle des 2 flags MAX : `community-server-line.md`. Guide admin : `docs/applications/SELFHOST.md`. `confadmin.html` (racine, **HORS `ASSETS_TO_CACHE`**, FR inline hors i18n) : lit les ZIPs via `lib/jszip.min.js` (tout local), pioche les liaisons dans localStorage même-origine OU un export de profil (`sections.preferences`), et REMAPPE les planId locaux → `"server_" + id` (même sanitisation `[^a-z0-9_-]` que le moteur — sinon les liaisons pointeraient vers des ids d'un autre appareil).
- **Persistance ZIP local** : `meta.fsHandle` (Chrome/Edge) ou `meta.storeBlob` (mobile/Safari).
- 🧹 **Les plans serveur disparus sont ÉLAGUÉS (v1.88.2)** — la découverte ne faisait que des `addOrUpdate` : **rien ne retirait jamais une entrée**. Un plan sorti de `data/index.json` restait dans le registre (localStorage), s'affichait dans « Mes plans », et **partait dans l'export de profil**, où il polluait l'instance d'en face. Constaté par KARMA (« si je reset full, la liste remonte »). `decouvrirPlansServeur` retire désormais les entrées `type:"server" && discovered:true` absentes de l'index. 🛟 *Le code n'est atteint qu'après un fetch d'index **réussi** — un serveur injoignable ne peut pas vider la liste — et les **données associées ne sont pas purgées** : si le plan revient sous le même id, sessions et géoréf se rattachent. 🍖 Corriger la source a suffi : l'export reste inchangé, une entrée périmée importée ailleurs sera élaguée au premier boot de cette instance.*
- 🩸 **Qui fait autorité sur `version` (v1.88.0)** — `index.json` ET `plan-config.json` en portent un, et ils **divergent déjà dans ce repo** (`V1` vs `V2` pour le plan de test). Comme `addOrUpdate` fait un `Object.assign`, la version **ping-pongait** : celle de l'index au boot, celle du plan-config au chargement, retour à l'index au boot suivant — la fiche ℹ️ Infos affichait donc l'une ou l'autre selon la dernière action. Pire, `entry.version || null` **effaçait** la version connue quand l'index omet le champ. **Règle** : le `plan-config.json` fait autorité (il est *dans* le plan), `index.json` n'est qu'un indice **avant le premier chargement** ; l'origine est tracée par `versionSrc`, et on n'écrit jamais `null`.
- **🔄 Réimport d'un plan (v1.73.1)** — l'id local est **dérivé** de nom+version (`genLocalId`), donc *nom+version identiques = même id = mise à jour en place* (comportement historique, souvent ignoré). Le doublon apparaît quand la **version change** à la regénération. `homeLoader > chargerZipFichier` détecte alors, APRÈS extraction et AVANT `startImportedPlan`, une entrée locale de même nom+auteur normalisés (`_chercherPlanExistant`) et propose 🔄 Mettre à jour / ➕ Garder les deux / Annuler. ⚠️ Invariants : ① détection SAUTÉE si `meta.planId` est déjà posé (le caller vise une entrée précise : rechargement liste, re-sélection de fichier) ② « Mettre à jour » = `meta.planId = <id existant>` **et** `meta.storeBlob = true` si l'ancienne entrée avait une archive — sans ça la liste continuerait de servir l'ancien ZIP ③ le défaut (✕/Escape/backdrop) est **Annuler**, jamais l'écrasement ④ `meta` est un paramètre réassigné : la closure `_cacheHashAfterLoad` lit le binding à l'appel, le SHA-256 denylist se met donc à jour sur la bonne entrée.
- **Modale "Plan introuvable"** : `afficherModalePlanIntrouvable(plan, reason)` avec 4 cas (`server`, `local-blob`, `local-fs`, `local-fs-denied`).

---

### 33. Refonte UX loader + fixes critiques (depuis v172)

Refonte de la liste 📚 Mes plans + 2 fixes critiques (sidebar landscape mobile, re-sélection ZIP V1/V2 mismatch). Toutes les modifs sont dans `index.html` (HTML + JS inline) et `css/style.css`, sauf le helper `syncModeFlags` ajouté à `js/planRegistry.js`.

#### 33.1 Toggle "Afficher les plans serveur" (persisté localStorage)

UI : checkbox dans `.loader-plans-filters` entre `.loader-section-head` et `#allPlansList`. Helpers `_loaderShowServerPlans()` / `_loaderSetShowServerPlans(v)` (clé `myktamap_loader_show_server_plans`, default true).

**Sémantique** : c'est un filtre d'**affichage uniquement** — les plans serveur restent dans le `PlanRegistry`. Filtré au moment du render dans `refreshPlansList` : `const filtered = showServer ? all : all.filter(p => p.type !== "server")`.

**Cas dégénéré** : registre non-vide mais filtre cache tout → message d'aide `.loader-plans-empty` ("Aucun plan local — coche <em>Afficher les plans serveur</em>...") au lieu d'une liste vide silencieuse.

**Pattern à réutiliser pour ajouter un futur filtre loader** : helper get/set localStorage (clé `myktamap_loader_<feature>`) + checkbox dans `.loader-plans-filters` + bind change handler → `refreshPlansList()` + filtre dans `refreshPlansList`.

#### 33.2 Restructure ligne plan (badges sur ligne 2)

Le rendu d'une ligne plan dans `planRowHTML` passe d'une structure compacte 4 lignes à une structure compacte 2 lignes :

| Avant (v170) | Après (v171) |
|---|---|
| L1 : nom + version + badges modes + storage | L1 : nom + version |
| L2 : sub (fichier + taille) | L2 : badges modes + storage (groupés) |
| L3 : date | — |

CSS clé : nouvelle `.plan-row-modes` avec `display: flex; align-items: center; gap: 4px; margin-top: 3px; flex-wrap: wrap;`. `align-items: center` nécessaire car les badges modes (9px monospace avec fond/bordure) et le badge storage (emoji 11px sans fond) ont des hauteurs différentes.

L'ancienne `.plan-row-badges` (sur ligne 1) est marquée DEPRECATED dans le commentaire CSS — gardée pour compat éventuelle si plugin user en dépend, mais le HTML standard ne la génère plus.

#### 33.3 Bouton ℹ️ + modale détaillée

Compense le retrait de sub/date avec une modale qui affiche **tous** les attributs du plan (et même plus : auteur, addedAt, perfPreset n'étaient pas affichés en v170).

Helper `_afficherInfosPlan(id)` dans `index.html` (~80 lignes). Lit `PlanRegistry.findById(id)`, génère un tableau 2 colonnes (clé/valeur) avec labels traduits en français et valeurs lisibles :
- `tiledV2: true` → "Mode : V2 tuilé (Google Maps-like)"
- `storedBlob: true` → "Persistance : ✅ Mémorisé dans l'app (IndexedDB)"
- Champs vides masqués automatiquement

Modale style `.kta-readme-modal-overlay` + classe dédiée `.kta-plan-infos-boite` (max-width 480px, max-height 80vh). Table `.kta-plan-infos-table` avec `.kta-info-key` (gris #8892a4, nowrap, width 40%) et `.kta-info-val` (couleur principale, word-break:break-word). Fermeture : ✕, backdrop, ou **Échap** (pattern cohérent).

Bouton `.plan-row-info-btn` dans `.plan-row-actions` (avant ▶️ Charger et ✕ Retirer). Hover bleu `#8cb4ff` cohérent avec la charte (▶️ vert, ✕ rouge, ℹ️ bleu).

#### 33.4 Checkbox "💾 Mémoriser ce plan dans l'app" coché par défaut

1 ligne de modif : `<input type="checkbox" id="storeBlobCb" checked>` (attribut HTML).

**Retirée de l'accueil le 15/09/2026** (KARMA : « alourdit pour rien le home ») : devenue le réglage ⚙️ Configuration de l'accueil → « Mémoriser le plan dans l'app au premier chargement » — clé `myktamap_memoriser_plan`, défaut activé, getter `window.ktaMemoriserPlanActif()` défini dans `homeLoader.js`, lu par `onLoadPlanClick` (`meta.storeBlob`) et par `importMasse` (défaut de « Précharger le ZIP »), case du réglage câblée dans `homeConfig.js`. Historique : masquée sur Chrome/Edge au profit du bouton 🔐 FS Access, mais cochée sous le masque, donc le ZIP était copié de toute façon et la référence disque jamais lue ; le bouton est retiré, cf. §import multiple « Un seul mécanisme ». Avant v170 : décoché → user devait penser à cocher manuellement → ZIP non mémorisé → re-sélection à chaque chargement → UX piège.

#### 33.5 Réglages : responsive PC ≥ 1024px

Modale ⚙️ Réglages reçoit le pattern responsive identique à la modale Doc/Aide (cf §22).

Mobile (< 1024px) : 440px max, 1 colonne — comportement v170 strict.

PC (≥ 1024px) : 1100px max + `columns: 2` via CSS column-flow.

**Différence assumée avec la modale Aide** : `break-inside: avoid` sur chaque section (.kta-aide-section dans le corps). La doc Aide a `columns: 2` SANS break-inside pour équilibrer les hauteurs de sections inégales (au prix d'un split occasionnel). Les Réglages ont des sections d'inputs/grilles homogènes en hauteur → break-inside acceptable, et couper en plein milieu d'un bloc d'inputs serait confusant.

Barre d'actions : `.kta-cfg-actions-bar` avec `column-span: all` sur PC + grid 4 colonnes (les 4 boutons Reset/Appliquer/Réinitialiser/Logs sur 1 ligne). Mobile : grid 2×2.

#### 33.6 Fix critique : icônes sidebar landscape mobile débordent

**Symptôme** : sur mobile en mode landscape (hauteur ≤ 500px), la sidebar topright (11 groupes accordéon) sortait du cadre. Une règle `@media (max-height: 500px)` existait avec `max-height + overflow-y: auto` mais ne FONCTIONNAIT PAS.

**Root cause** : Leaflet utilise `float: left/right` + `clear: both` sur `.leaflet-control` (héritage IE compat — cf. `lib/leaflet/leaflet.css` lignes 156-162). En layout floating, le **parent ne "voit" PAS la hauteur de ses enfants flottants** sans clearfix → `max-height` est appliqué mais le contenu (floats) déborde sans déclencher le scroll → `overflow-y: auto` ne s'active jamais.

**Fix** : bascule en `display: flex; flex-direction: column;` dans la media query landscape mobile uniquement. Spec CSS : un flex item ignore son `float` (standardisé). Les enfants empilés verticalement, hauteur comptée, overflow scroll natif s'active proprement.

`align-items: flex-end` (topright) / `flex-start` (topleft) reproduit l'alignement bord-droit / bord-gauche que le float assurait. Sans ça, les contrôles seraient alignés à gauche par défaut.

**Bonus** : `max-height` recalculé avec safe-area iOS : `calc(100vh - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px) - 16px)`. Sur iPhone landscape avec home indicator (inset-bottom = 21px), les derniers boutons étaient masqués sous la zone tactile système réservée.

**Portée** : topright (11 groupes — bug principal) + topleft (zoom + niveau + boussole — par cohérence). Portrait + desktop strictement inchangés.

**⚠️ À NE PAS RÉACTIVER LE FLOAT NATIF** dans cette media query sans avoir réfléchi à comment compter la hauteur des enfants flottants. Si on retire `display: flex`, le bug réapparaît silencieusement.

#### 33.7 Fix critique : re-sélection ZIP V1 sur plan registre V2

**Workflow buggé** : reset → import sauvegarde liste → registre rempli avec `tiledV2: true` pour les plans qui l'étaient → user clique sur un plan V2 → modale "Plan introuvable" → "Re-sélectionner le ZIP" → choisit le **même plan en V1** → badge V2 reste affiché à tort, risque de crash runtime.

**Root cause** : `PlanRegistry.addOrUpdate` utilise `Object.assign({}, existing, newEntry)` qui MERGE. `startImportedPlan` construit l'entry avec :
```js
if (rawConfig.plan.tiledV2 === true) entry.tiledV2 = true;
```
→ pour un V1, le champ est ABSENT de la nouvelle entry → Object.assign garde l'ancien `tiledV2: true` du registre.

**Fix 2 niveaux** :

**(a) Nouveau helper `PlanRegistry.syncModeFlags(id, flags)`** dans `planRegistry.js` qui aligne explicitement les flags :
- `flags.tiledV2 === true`  → set `p.tiledV2 = true`
- `flags.tiledV2 === false` → **delete** `p.tiledV2` (différent du merge !)
- Idem `multiLevel`
- Sauvegarde `_save()` si au moins un changement

Exposé dans l'API publique.

**(b) Détection dans `reSelectionnerZipPourPlan`** (index.html). Après extraction du `plan-config.json` du ZIP fourni, comparer les flags `tiledV2` / `multiLevel` au registre. Si discordance → `confirm()` avec message détaillé listant chaque flag changé (avant → après). Si OK → `syncModeFlags(plan.id, zipFlags)` AVANT `chargerZipFichier` → `startImportedPlan` part d'un état propre.

**4 cas couverts** (peuvent se cumuler) : V2↔V1 (2 sens) + Multi-niveau↔Mono (2 sens).

**Choix volontaire `confirm()` natif** : pattern cohérent avec le check du nom de plan déjà en place dans la même fonction. Modale custom = 80 lignes pour un cas marginal de re-sélection. À basculer en modale custom si retour user terrain.

**Non touché** : flow d'import normal (📦 Charger) — l'id est auto-généré donc pas de pré-état à réconcilier. Auto-discovery serveur idem (entry construite from scratch).

#### 33.8 Pattern à retenir : Object.assign et merge silencieux

⚠️ **Piège général** : `Object.assign({}, existing, newPartial)` GARDE les anciens champs si `newPartial` ne les redéclare pas. Si une logique métier dépend de l'**absence** d'un flag (ex: pas de `tiledV2` = mode V1), un merge silencieux peut préserver un flag obsolète.

Solution :
- Soit construire `newPartial` avec tous les flags possibles explicitement (true OU false/null pour delete)
- Soit utiliser un helper dédié comme `syncModeFlags` qui set/delete explicitement
- Soit changer `Object.assign` en remplacement total — mais alors faut tout redéclarer (addedAt, lastOpened, etc.)

Le projet a choisi l'option helper dédié pour la rétro-compat (addOrUpdate continue de merge naturellement pour les autres champs, seul un sync explicite via syncModeFlags affecte les flags V2/multiLevel).

---

### 39. Refonte UX page d'accueil — Modale ⚙️ Configuration (depuis v1.7.3)

Regroupement de tout ce qui était éparpillé dans le loader (drawer Perf + section "Plus d'options") dans une **modale unique** ouverte depuis un bouton `⚙️ Configuration` dans le header du loader. Refonte purement UX, aucun changement de comportement sous-jacent.

#### 39.1 Architecture avant / après

**Avant v1.7.3** :
- `<details class="loader-perf-drawer">` (drawer dépliable) avec Tiling + ULTRA dans la home
- Section collapsable `⚙️ Plus d'options` avec 4 boutons : 🏗️ Générer un plan, 📥 Conf exemple, 🐛 Logs détaillés, 💥 Tout réinitialiser
- → 2 zones distinctes pour des réglages liés, UX confus

**Après v1.7.3** :
- Header loader : 3 boutons (📖 Documentation, 🚨 Alertes, ⚙️ Configuration)
- `⚙️ Configuration` ouvre une **modale unique** `#loaderConfigModal` (~140 lignes HTML) regroupant :
  1. 🖼️ Tiling (segmented 5 presets)
  2. 🚀 ULTRA (7 toggles)
  3. 🛠️ Debug → toggle 🐛 Logs détaillés + bouton **📋 Afficher les logs** *(nouveau, suite KARMA)*
  4. 🔧 **Dépannage** : un seul bouton, qui ouvre la fenêtre `#kta-depannage-modal` rangeant du plus doux au plus radical 🔄 Force update douce → 🔧 Kill SW → 💥 Tout réinitialiser (+ l'adresse de `killsw.html`)
- `🏗️ Générer un plan` reste directement visible dans la home (action de **création**, pas un réglage)
- `📥 Conf exemple` déplacé en icône dans le modal du Générateur (section "📂 Charger un ZIP existant")

**Symétriquement, retiré de la modale ⚙️ Réglages in-app (map mode)** *(suite KARMA)* :
- Bouton `🗑️ Réinitialiser` retiré de `kta-cfg-actions-bar` (interface.js)
- Le reset complet n'est désormais accessible que depuis la modale ⚙️ Configuration du loader (home)
- Raison : limiter les déclenchements accidentels une fois un plan chargé (user perd potentiellement session active + plans mémorisés en 2 clics)
- Pour reset depuis la map : 🗂️ titre cliquable → home → ⚙️ Configuration → 🔧 Dépannage → 💥 Tout réinitialiser
- Conséquence CSS : `.kta-cfg-actions-bar` passe de `grid-template-columns: 1fr 1fr 1fr 1fr` (4 cols PC) / `1fr 1fr` (2 cols mobile) à `1fr 1fr 1fr` partout (3 boutons : Reset / Appliquer / 🐛 Logs)

#### 39.2 Force update douce — `window.mettreAJourCodeSeul()`

Bouton 🔄 de la fenêtre ⚙️ Configuration → 🔧 Dépannage. Réutilise le pipeline `mettreAJourCodeSeul` existant (utilisé par le badge version cliquable depuis v1.5.x).

Différences fondamentales avec `viderCacheAppli()` :

| | Force update douce | Tout réinitialiser |
|---|---|---|
| Cache PWA (Service Worker) | ✅ Purgé | ✅ Purgé |
| localStorage | ❌ Préservé | ✅ Purgé |
| IndexedDB (plans mémorisés, sessions) | ❌ Préservé | ✅ Purgé |
| Unlock Gate (code d'accès) | ❌ Préservé | ✅ Reset (re-demandé au boot) |
| Confirmation | ✅ Modale simple (1 étape) | ✅ Double confirm |
| Ping internet | ✅ (interne à `mettreAJourCodeSeul`) | ✅ (avant la double confirm) |

**Garde-fou de confirmation** (`_afficherConfirmForceUpdate`, `js/loaderSwModals.js`) : modale custom Promise-based (pattern `.kta-readme-modal-overlay` + accent bleu info) qui explique avant le déclenchement :
- Ce qui va se passer : purge cache des assets + reload + re-download
- Ce qui est préservé : plans, sessions, prefs, unlock gate
- Conditions : connexion Internet active (vérifiée juste après par `mettreAJourCodeSeul`), reload immédiat

L'action est non-destructive donc 1 étape de confirmation suffit (différent du Reset qui en a 2 + ping pré-modale). Le ping Internet vit toujours dans `mettreAJourCodeSeul` côté `interface.js > _softUpdateOfflineWarning`, pas dupliqué dans le handler du bouton.

Use case : user signale "l'app n'a pas la dernière feature" → un Force update douce force un re-fetch du SW + caches.delete + reload, sans perdre ses données. Ne pas confondre avec un vrai reset.

#### 39.3 Pattern HTML/CSS

Modale `#loaderConfigModal` suit le pattern `.kta-readme-modal-overlay` + `.kta-readme-modal-boite` (déjà utilisé partout dans le projet). Handlers dans `js/homeConfig.js` :

- `loaderConfigBtn` → `_ouvrirLoaderConfig()` (set `display:flex`)
- `loaderConfigClose` + backdrop click + Escape → `_fermerLoaderConfig()`
- `loaderDepannageBtn` → `_ouvrirDepannage()` : construit `#kta-depannage-modal` (✕, clic-fond, Échap ; ❓ → fiche « depannage » via `AIDE_PAR_MODALE`). Elle s'empile au-dessus de la Configuration et sous les confirmations ; Échap ne la ferme que si elle est au premier plan, et l'Échap de la Configuration s'abstient tant qu'elle existe.
- Dans cette fenêtre, les ids historiques : `loaderForceUpdateBtn` → `_depannageForceUpdate()` (confirmation puis `window.mettreAJourCodeSeul()`) · `loaderKillSwBtn` → `_depannageKillSw()` (ping Internet, confirmation, puis `killsw.html`) · `loaderResetBtn` → `_depannageReset()` (`window.viderCacheAppli()`, double confirmation)

Les handlers existants pour Tiling segmented / ULTRA toggles / 🐛 Logs / 💥 Reset sont conservés et juste **déplacés** dans le DOM. Pas de changement de logique.

#### 39.4 Multi-niveau (M-LVL) — Activation déplacée du Réglages au Générateur

Retrait du toggle `🏗️ Plan multi-niveau` dans `afficherConfig` (`interface.js`). Cascade de lecture inchangée :

```
APP_CONFIG.multiLevel ←
  PlanRegistry[id].multiLevel       (legacy ≤ v1.7.2, lecture conservée)
  PLAN_CONFIG.plan.multiLevel       (SOURCE UNIQUE depuis v1.7.3)
  false
```

Aucune bascule du multi-niveau dans ⚙️ Réglages (décision produit) : le plan le déclare.

#### 39.5 Footer copyright

`© 2026 Flavien VIDAL [karma.png] · CC BY-NC-SA 4.0 ...` → `© 2026 [karma.png] · CC BY-NC-SA 4.0 ...`.

Seule la mention texte **"Flavien VIDAL"** (nom civil) est retirée du DOM. L'image signature `karma.png` est **conservée** comme identité visible du copyright, cohérente avec son usage au splash.

"Flavien VIDAL" reste présent dans les headers `/*! MyKTAMap (c) 2026 Flavien VIDAL ... */` des 7 fichiers JS critiques + meta tags `<head>` → **force probante légale préservée**. Seule la mention visible utilisateur côté loader est épurée.

CSS `.kta-loader-copyright-sig` toujours active (l'image reste dans le DOM, juste sans le nom civil à côté).

#### 39.6 Titre stylisé de la home

`📦 MyKTAMap` (basique) → lockup graphique Option D :
- Logo `mkm-full.png` (rose des vents jaune, +1024px, drop-shadow halo jaune)
- "MyKTAMap" en grand
- "Cartographie souterraine" en tagline (remplace "Cartographie terrain" partout dans la page de chargement)
- Hover pulse + responsive (vertical mobile, horizontal ≥1024px)

Nouvelles classes CSS dédiées : `.loader-titre`, `.loader-titre-logo`, `.loader-titre-textes`, `.loader-titre-nom`, `.loader-titre-tagline`.

#### 39.7 Pour ajouter un nouveau réglage de loader (futur)

1. Ajouter le HTML dans la modale `#loaderConfigModal` (`index.html`) à l'endroit logique (Tiling / ULTRA / Debug / Maintenance)
2. Bind du handler dans le script inline de `index.html`
3. Ne PAS recréer une section séparée hors de la modale — la philosophie v1.7.3 est : **tout réglage du loader vit dans la modale Configuration**. Seuls les boutons d'**action** (créer un plan, charger un plan) restent dehors.

---

### 58. v1.17.0 — Générateur accessible : Mode Simple/Avancé + Légende plan-level (depuis v1.17.0)

Refonte UX du Générateur 📦 Créer / Modifier un plan (`js/createConf.js`). Deux changements liés : un switcher Simple/Avancé pour rendre le démarrage d'un plan trivial, et une nouvelle source de vérité `plan.customLegend` pour partager une légende personnalisée avec tous les utilisateurs d'un plan.

#### 58.1 Switcher Simple/Avancé

**Helpers ajoutés** (top-level `js/createConf.js`) :

- `_lirePlannerMode()` → string `"simple"|"avance"` (lit `localStorage["myktamap_planner_mode"]`, default `"simple"` au tout premier launch)
- `_ecrirePlannerMode(mode)` → persist localStorage
- `_appliquerPlannerMode(mode)` → applique au DOM (toggle bouton actif, set `data-planner-mode` sur `#kta-planner-corps`, met à jour le hint texte, masque le switcher en mode Modifier, auto-charge les icônes built-in en Simple)

**HTML** : nouveau bloc `<div class="kta-planner-mode-switcher">` avec 2 boutons (data-mode="simple" / data-mode="avance") + `<p class="kta-planner-mode-hint">` juste après l'ouverture de `#kta-planner-corps`.

**Sections cachées en Simple via marqueur `data-planner-advanced="1"`** :

| Section | Type |
|---|---|
| 3. Calques image | Section complète |
| 4. Calques données | Section complète |
| 5. Tracking | Section complète |
| 6. Icônes & Tags | Section complète |
| 6 bis. 🏷️ Légende du plan (nouveau) | Section complète |
| 7. Géoréférencement GPS | Section complète |

**Règle CSS unique** dans `css/style.css` (vers ligne 14820) :

```css
#kta-planner-corps[data-planner-mode="simple"] [data-planner-advanced="1"] {
  display: none !important;
}
```

**Auto-chargement icônes built-in en Simple** : dans `_appliquerPlannerMode`, si `mode === "simple"` et que `#pl_icons_list` ne contient aucune `.kta-planner-icon-row`, on appelle `_chargerIconesDefaut()` automatiquement. Sinon le ZIP généré serait vide d'icônes → markers data layer cassés au load (404 silencieux).

**Mode Modifier forcé en Avancé** : quand l'utilisateur charge un ZIP existant via le drop zone (`_chargerZipModifier` → `_preRemplirFormulaire`), `_plannerMode === "modifier"` → `_appliquerPlannerMode` override le mode demandé et force `"avance"` + masque le switcher (`#kta-planner-mode-switcher.style.display = "none"`). Justification : passer en Simple en mode Modifier écraserait les customs / dataLayers / imageLayers / icons custom du plan source au `_genererZip` (= les sections cachées ne sont pas lues → arrays vides en sortie). Préserve l'intégrité du plan modifié.

#### 58.2 Éditeur légende plan-level (mode Avancé)

Nouvelle source de vérité **`plan-config.json > plan.customLegend`** (cascade niveau plan, lue par `LegendCustomization.loadPlanState()` au boot du plan). Format identique à `getSessionState()` : `{ schemaVersion, labels, hidden, customEntries }`.

**Architecture sans modifier `legendCustomization.js`** : l'éditeur `LC.ouvrirEditeur` mute la session courante (pas conçu pour un state externe). On utilise un **pattern de swap session ↔ plan** dans `_ouvrirEditeurLegendePlan` :

```js
function _ouvrirEditeurLegendePlan() {
  const LC = window.LegendCustomization;
  // 1. Sauvegarde la session courante
  const savedSession = LC.getSessionState();
  // 2. Charge le state plan dans la session pour permettre l'édition
  LC.loadSessionState(_plannerPlanLegend || null);
  // 3. Ouvre l'éditeur normal (qui mute la session)
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

⚠️ **Side effect transient pendant l'édition** : la session est temporairement remplacée par le state plan en cours d'édition. Depuis l'accueil, rien ne se voit. Depuis un plan ouvert (seul chemin : l'assistant « Mettre à jour le plan », § ci-dessous), la carte prend les couleurs de la légende du plan le temps de l'éditeur, et une sauvegarde de session survenant pendant ce temps écrirait la légende du plan dans la session (rétablie à la fermeture et à la sauvegarde suivante ; perdue seulement si l'app est tuée l'éditeur ouvert). Limite acceptée ; la vraie correction serait un `LC.ouvrirEditeur({ stateOverride, onCommit })`.

**Normalisation `_plannerLegendStateNormalize(state)`** : retourne `null` si tous les arrays/objects sont vides (zéro override). Évite de polluer `plan-config.json` avec un `customLegend: { labels:{}, hidden:{}, customEntries:[] }` inutile + cache PWA bumpé pour rien chez les utilisateurs.

**Status display `_plannerLegendStatus()`** : « ✏️ Personnalisée : N renommés · M masqués · K customs » (avec classe `.kta-planner-legend-status-actif` = accent ambre) ou « ✏️ Aucune personnalisation (cascade défaut MKM) » (gris muted).

**Pre-fill en mode Modifier** : `_preRemplirFormulaire` lit `config.plan.customLegend` du ZIP source, passe par `_plannerLegendStateNormalize`, assigne à `_plannerPlanLegend`, appelle `_plannerLegendStatus()` puis `_appliquerPlannerMode("avance")` (cohérence : si le plan source a une légende custom, l'user doit voir/éditer cette section).

**Embed au `_genererZip`** : juste après les flags conditionnels (multiLevel, tiledV2, georef) → `if (_plannerPlanLegend) planObj.customLegend = _plannerPlanLegend;`. Rétro-compat absolue : champ totalement absent sinon (pattern multiLevel — les versions ≤ v1.16.x ignorent un champ inconnu sans broncher).

#### 58.3 État global module

```js
let _plannerPlanLegend = null;  // null = pas de perso (cascade défaut MKM)
const PLANNER_MODE_LS_KEY = "myktamap_planner_mode";  // "simple" | "avance"
```

Reset `_plannerPlanLegend = null` au boot de chaque ouverture de modale (dans `afficherPlanner`).

#### 58.4 CSS ajouté (~140 lignes en fin de `css/style.css`)

| Classe | Rôle |
|---|---|
| `.kta-planner-mode-switcher` | Conteneur flex centré du segmented control |
| `.kta-planner-mode-btn` | Bouton mode (default ghost, `.kta-actif` = jaune charte + texte sombre + shadow) |
| `.kta-planner-mode-hint` | Phrase d'aide italique sous le switcher |
| `.kta-planner-legend-status` | Bloc status display (gris muted par défaut) |
| `.kta-planner-legend-status-actif` | État perso actif (fond accent ambre, texte saturé) |
| `.kta-planner-legend-actions` | Conteneur flex des 2 boutons (✏️ Modifier + 🔄 Reset) |

**Variants thème clair** : ~30 lignes `body.kta-theme-light` / `html.kta-theme-light` qui basculent sur les variables `--kta-light-*` (cf §53 pour le pattern complet). Couvre les 6 classes ci-dessus.

#### 58.5 Pièges & conventions

⚠️ **Ne PAS lire les sections cachées au `_genererZip`** : les sections Avancé sont seulement masquées en CSS (`display: none`), pas démontées du DOM. `_genererZip` lit toujours les inputs via `getElementById` → les valeurs sont récupérées même en mode Simple (= valeurs default vides). C'est l'effet voulu (un plan généré en Simple a zéro custom layer / icons / tracking custom / georef), mais à garder en tête si on ajoute un futur champ "avancé" qui nécessite une valeur non-vide pour fonctionner.

⚠️ **Ordre dans `_appliquerPlannerMode`** : on applique l'attribut `data-planner-mode` AVANT le toggle des boutons et l'auto-load icônes. Cela permet aux modules consommateurs de lire l'attribut dans leurs handlers `change`/`click` sans timing race.

⚠️ **Mode Modifier override sticky** : même si l'user a `localStorage["myktamap_planner_mode"] = "simple"`, `_appliquerPlannerMode` force `"avance"` dès que `_plannerMode === "modifier"`. Le sticky n'est PAS écrasé (l'user retrouvera Simple au prochain "Nouveau plan").

⚠️ **Swap session ↔ plan** : si une exception est levée dans `LC.ouvrirEditeur` AVANT le `onClose`, la session reste désynchronisée. Acceptable car l'éditeur est testé et stable depuis v1.16.0, mais à monitorer si on ajoute des features qui peuvent faire planter l'éditeur.

⚠️ **Pas exposé via API publique** : `_plannerPlanLegend` reste un état module-local. Si on a besoin d'y accéder depuis un autre module (ex: pour debug ou pour un futur "Export/Import légende plan-level seul"), il faudra exposer un getter `window.PlannerLegend = { get, set, reset, isEmpty }` au top du module.

🩸 **Rognage automatique et repère du plan** : en tuilage V2, `_genererTuilesV2` retire les marges blanches
(`_detectContentBBox`, jamais sur une source transparente ou unie) ; `imageWidth`/`imageHeight` deviennent ceux de la
zone gardée et l'origine se déplace de `plan.rognage { x, y }` (écrit dans plan-config, absent sans rognage). Tout
ce qui est en pixels (calques, géoréf, calibrations) doit être dans ce repère. Règles :
- **Mode Modifier** (« Mettre à jour le plan » compris) : le repère du plan rouvert est GARDÉ (`_plannerRepere`,
  `_rognagePourRepere`) — même rognage s'il l'était (`plan.rognage`, ou à défaut une détection des marges qui
  redonne les mêmes dimensions), aucun sinon. 🩸 Un plan V1 (jamais rogné) régénéré en V2 était rogné : tous ses
  calques se décalaient.
- **Nouveau plan** rogné avec des pixels saisis (calques de données fournis, calage GPS `pl_geo_A|B|C_x|y`, calages
  des calques image) : UNE `ktaConfirm` « L'image est rognée de X × Y px. Vos calques ont-ils été saisis sur l'image
  d'origine ? », suivie de ce qu'elle déplace → [Les décaler] décale TOUT ensemble : calques réécrits dans le ZIP
  (`_decalerCalque` : toute paire `x`/`y` et `x2`/`y2`, donc points, sommets, point précis, raccords), points du
  calage GPS (`_readGeoPx`, lat/lng inchangées : un point du plan retombe à la même position), cibles `targetA`/
  `targetB` des calages (pixels du plan ; les sources `sourceA`/`sourceB` sont des pixels du calque et ne bougent
  pas ; copie, `item._calibration` reste dans le repère saisi). [Les laisser] ne décale rien. Seul l'utilisateur
  sait dans quel repère il a saisi.
Checkup : `scripts/smoke/checkup-rognage.js` (pixel lu dans les tuiles du ZIP, Chromium et WebKit).

#### 58.5 bis Niveaux en hauteur (sol, hauteur, écart)

Sous la case multi-niveau, la table de `profondeurNiveaux.js` (la même que ⚙️ Réglages) : `_plannerRendreNiveaux`
la refait quand la case change (table multi-niveau mise de côté dans `_plannerNiveauxGardes`, rendue si on
recoche), `_preRemplirFormulaire` la remplit d'un plan rouvert, `_genererZip` écrit `plan.niveauxProfondeur` et
`plan.niveauxHauteur` (`_plannerLireNiveaux`). L'écart n'est jamais écrit. Format : `data-formats.md` ; contrat :
`multilevel-pathfinding.md` § Hauteur et écart par niveau ; checkup : `checkup-niveaux-verticaux.js`.

#### 58.6 Pour étendre

**Ajouter un nouveau champ "avancé" dans le Générateur** :
1. Ajouter le HTML avec marqueur `data-planner-advanced="1"` sur le wrapper (section ou row selon granularité)
2. Lire la valeur dans `_genererZip` SANS supposer qu'elle est non-vide (= dégradation gracieuse en Simple)
3. Si la valeur en Simple DOIT être non-vide (ex: nouvelle feature obligatoire), ajouter un default raisonnable dans `_appliquerPlannerMode` quand mode === "simple"

**Migrer un champ "avancé" vers Simple** :
1. Retirer le marqueur `data-planner-advanced="1"` du wrapper
2. Tester que le mode Simple reste lisible (la section est ajoutée au layout)
3. Mettre à jour la doc utilisateur (`docs/README_USER.md`) + entrée AI_CONTEXT.md

**Plan-level UI pour une autre cascade** (ex: `plan.customIcons`) : suivre le pattern de swap dans `_ouvrirEditeurLegendePlan` — sauvegarde state courant, charge état plan, ouvre éditeur standard, capture au close, restore.

---

<!-- v1.34.16+ : Pack RAM Phase 2 lazy tile extraction + _lazyZipRef lifecycle -->
### 59. Lazy tile extraction — 2-pass parsing dans `extraireZip()` (v1.34.11 → v1.34.12)

Refonte du pipeline de décompression du ZIP de plan tuilé V2 pour éviter de matérialiser
toutes les tuiles en RAM dès le boot. Motivation : crashes RAM iPhone PWA sur gros plans
(cf `perf-memory.md §88`).

#### 59.1 Pipeline avant v1.34.11

```
ZIP en entrée
   ↓
JSZip.loadAsync(arrayBuffer)
   ↓
Pour chaque entrée du ZIP :
   ├─ plan-config.json → JSON.parse
   ├─ image.png, layers/*.png → async("blob") → URL.createObjectURL → cache
   └─ tiles/zN/x_y.jpg → async("blob") → URL.createObjectURL → cache
   ↓
Renvoie structure { config, images, tiles } prête à consommer
```

Sur un plan 1 200 tuiles, **toutes** étaient décompressées au boot même si l'utilisateur
n'en regardait que 30-50 à un instant donné. Coût RAM : ~60-80 MB de blobs
décompressés.

#### 59.2 Pipeline depuis v1.34.11 — 2-pass parsing

```
ZIP en entrée
   ↓
JSZip.loadAsync(arrayBuffer) → garder la ref → _lazyZipRef
   ↓
PASS 1 : extraire UNIQUEMENT plan-config.json
   ├─ JSON.parse
   └─ Calculer la whitelist des tuiles nécessaires pour le zoom courant
       (= tuiles qui couvrent les bounds du viewport initial)
   ↓
PASS 2 : décompresser sélectivement
   ├─ image.png + layers/*.png → toujours décompressés (petits + nécessaires au render initial)
   ├─ tiles/zN/x_y.jpg DANS whitelist → async("blob") → cache
   └─ tiles/zN/x_y.jpg HORS whitelist → stub { path, lazy: true, blob: null } dans cache
   ↓
Renvoie structure { config, images, tiles, _lazyZipRef }
```

Le **JSZip reste vivant** via `_lazyZipRef`. Les tuiles hors whitelist sont
décompressées à la demande quand le user pan/zoom vers leur zone.

#### 59.3 Lazy fetch à la demande

Dans `tiling.js > _getOrLoadTile(z, x, y)` :

```js
async function _getOrLoadTile(z, x, y) {
  const key = `tiles/z${z}/x${x}_y${y}.jpg`;
  const cached = _tilesCache[key];
  if (cached && cached.blob) return cached.blob;        // hit
  if (!cached || !cached.lazy) return null;             // pas dans ce plan
  const zipRef = window._currentPlan && window._currentPlan._lazyZipRef;
  if (!zipRef) return null;                              // ZIP libéré ou bug
  const blob = await zipRef.file(key).async("blob");
  _tilesCache[key] = { blob, lazy: false };
  _lruTouch(key);
  return blob;
}
```

**LRU sur `File` extraits** : cap configurable (~256 tuiles par défaut) avec éviction
des moins récemment utilisées. Une tuile évincée retourne au stub `{ lazy: true, blob:
null }` → re-fetchée au prochain besoin via la ref `_lazyZipRef`.

#### 59.4 `_lazyZipRef` lifecycle (v1.34.12 hotfix)

⚠️ **Piège** : `main.js > _libererRessourcesPlanPrecedent` nullifie en masse les champs
`_*` du plan sortant pour casser les cycles de refs cross-plan (pattern v1.21.3 P0-6
« Plan switch leaks pack »). Au plan switch, si on n'exempte pas explicitement
`_lazyZipRef`, le **nouveau** plan peut perdre son `_lazyZipRef` si le timing fait que
les 2 plans coexistent transitoirement dans la closure du cleanup.

**Symptôme** : pan/zoom après plan switch → lazy fetch échoue → carrés gris persistants.

**Fix v1.34.12** : 2 patterns possibles, MyKTAMap utilise une **whitelist explicite**
dans le sweep cleanup :

```js
const _LAZY_KEEP_KEYS = ["_lazyZipRef"];  // refs à préserver

for (const key of Object.keys(plan)) {
  if (key.startsWith("_") && !_LAZY_KEEP_KEYS.includes(key)) {
    delete plan[key];
  }
}
```

Alternative (équivalente) : sauvegarder explicitement la ref dans une variable locale
AVANT le sweep, puis ré-injecter APRÈS. Moins propre car couplage temporel.

#### 59.5 Quand libérer `_lazyZipRef`

- **Au reset complet** (`viderCacheAppli`) → automatique via reload.
- **Au plan switch confirmé** (= l'utilisateur a vraiment quitté le plan) → seulement
  pour le **plan sortant**, pas le plan entrant. Le sweep cleanup avec whitelist gère
  ça correctement.
- **Jamais libéré tant que le plan reste actif** — même si LRU évince des `File`
  décompressés, la ref ZIP reste vivante pour pouvoir re-fetch. Surcoût RAM de la ref
  ZIP brute : ~10-20 MB typiquement (taille du fichier ZIP), négligeable devant les
  60-80 MB économisés sur les tuiles décompressées.

#### 59.7 Rien en double : une copie du ZIP, du JSON, de l'index des structures

🩸 `JSZip.loadAsync` d'un Blob **lit tout le fichier en mémoire** (il n'est pas paresseux) : chaque JSZip vivant
tient un tampon de la taille de l'archive. Trois règles évitent qu'un plan ouvert soit gardé deux fois :

- **ZIP** — l'aperçu de l'accueil (`osmHomePreview.js`) lit le ZIP d'un plan gardé pour ses tuiles détaillées. Il
  passe toujours par `_zipDe(planId)` : à `mktm:plan-pret`, le ZIP du plan ouvert (`_lazyZipRef`) reçoit la marque
  `_ktaPlanId` et l'aperçu lâche sa copie ; le ZIP marqué lui est prêté tant que le plan est ouvert ; une copie
  lâchée est relue à la demande (retour à l'accueil : le plan libéré emporte son ZIP). La marque est posée **sur**
  le JSZip, jamais retenue par l'aperçu : entre deux plans, `_lazyZipRef` porte déjà le ZIP suivant, pas encore
  marqué. Une seule lecture en cours par plan (`_loadPlanDataForPreview` partage la promesse) : deux appels
  rapprochés lisaient le ZIP deux fois.
- **JSON des calques** — `config.js > registerAsset` valide le JSON mais garde `json: null` : les calques sont
  relus par leur URL (`utils.js`), aucun lecteur du champ.
- **Index des structures de la 3D** — `galerieEmprise.js` : le modèle du rendu mixte prend l'index du niveau dans
  `_cacheStructures` (`_structuresDe`), celui que lit `comblementPorte`, au lieu d'en refaire un.

Mesuré sur un relevé lourd (ZIP tuilé gardé, page rechargée, plan rouvert) : 2 JSZip vivants → 1, le stockage
hors tas passe de deux fois la taille de l'archive à une fois. Garde-fou : `scripts/smoke/checkup-zip-partage.js`.

#### 59.6 À NE PAS faire

- ❌ **Décompresser toutes les tuiles dans une boucle de Promise.all au boot** — c'est
  exactement le pattern abandonné en v1.34.11. RAM iPhone craque vite, surtout sur
  plans tuilés denses.
- ❌ **Oublier `_lazyZipRef` dans la whitelist du cleanup** — bug v1.34.12 garanti :
  carrés gris persistants après plan switch.
- ❌ **Garder une ref ZIP cross-plan** (réutiliser le ZIP d'un plan pour un autre plan)
  → non, chaque plan a son propre ZIP, chaque `_lazyZipRef` est plan-scoped.
- ❌ **Lazy fetch en mode V1** (plan non tuilé, image principale unique) — la totalité
  de l'image principale doit être en RAM dès le render initial, sinon flash blanc.
  L'optimisation Phase 2 ne concerne QUE les tuiles V2.
- ❌ **Bumper le LRU cap au-delà de ~512 sans réfléchir** — plus le cap est grand, plus
  on garde de tuiles décompressées en RAM. 256 est un sweet-spot validé sur iPhone 12
  mini ; un cap 1024 annulerait le gain Phase 2.

Cf `perf-memory.md §88` pour le contexte du sprint Pack RAM et la mesure d'impact terrain.

---


## 📦 Import multiple — enregistrer sans ouvrir (v1.94.0)

`js/importMasse.js` · API `window.ImportMasse = { ouvrir, analyser, importer, _interne }` · garde-fou `scripts/check-import-masse.js`.

**Le point dur n'était pas la boucle.** Jusqu'ici, AJOUTER UN PLAN C'ÉTAIT L'OUVRIR : `homeLoader > chargerZipFichier` puis `main > startImportedPlan` lisent le ZIP, posent les assets dans `RUNTIME_ASSETS`, écrivent l'entrée du registre, rangent le fichier **et** appellent `lancerApplication`. Aucun chemin « enregistre sans ouvrir » n'existait.

| Étape | Ce qui se passe |
|---|---|
| `analyser(fichiers, politique)` | Denylist par fichier, lecture du seul `plan-config.json`, décision de doublon, plan de bataille. **N'écrit rien.** |
| `importer(plan, { precharger })` | Un fichier à la fois : `addOrUpdate`, puis — si `precharger` (défaut **true**) — `saveBlob` et **réécriture de l'entrée avec le drapeau** `storedBlob`. `precharger: false` = entrée seule, rien rangé. |

**Deux décisions pures, exposées dans `_interne` et EXÉCUTÉES par le garde-fou** :

- `_deciderDoublon(politique, idNaturel, idsExistants)` — la politique vaut pour TOUT le lot (vingt fichiers, ce serait vingt questions). Défaut « ignorer » : un import n'écrase rien sans demande. « doubler » cherche le premier suffixe libre, pour ne pas écraser un doublon d'un import précédent.
- `_verdictPlace(aStocker, dispo, quota)` — marge `MARGE_QUOTA` de 15 % : un navigateur refuse bien avant son quota annoncé, et l'app doit garder de quoi écrire ses sessions après. `aStocker` vaut 0 quand « Précharger le ZIP » est décoché.

**Aucune décompression.** Un plan reste un ZIP, ses tuiles sortent à la demande au chargement (cf. `_extractLazyAsset`). Décompresser à l'import multiplierait le poids stocké par deux ou trois, pour rien.

**Le ZIP rangé doit être ANNONCÉ (15/09/2026).** `homeLoader` n'ouvre un plan local qu'en lisant les drapeaux de l'entrée : `storedBlob` (étape 1, `getBlob`) puis `fsHandleId` (étape 2, `getHandle`, anciennes entrées seulement) ; sans eux, étape 3 = `reSelectionnerZipPourPlan`. La première v1.94.0 rangeait le fichier sans poser le drapeau : la liste redemandait le ZIP et le blob restait orphelin en IndexedDB. Le drapeau est posé **après** le rangement réussi, par un second `addOrUpdate` (merge), jamais avant. `requestPersistentStorage()` est demandé une fois par lot avant la première copie, comme `main > startImportedPlan`.

**Un seul mécanisme : la copie (15/09/2026, même soir).** KARMA : *« Autoriser l'accès permanent a l'air de servir à rien et faire doublon »*. Exact : sur Chrome/Edge le bouton 🔐 masquait la case « Mémoriser » sans la décocher, donc le ZIP était copié dans tous les cas, et la référence disque (`fsHandleId`) n'était jamais lue — l'ouverture essaie la copie d'abord, et ne retombe pas sur la référence si la copie a été purgée (« Plan introuvable » direct). **Retirés** : le bouton et `_currentFsHandle` (accueil), `meta.fsHandle` (`startImportedPlan`), le sélecteur système et `saveHandle` (import multiple et re-sélection). **Conservés** : `PlanRegistry.saveHandle/getHandle/hasFsAccess/ensureHandlePermission` et l'étape 2 de l'ouverture, pour les entrées existantes ; à leur re-sélection, `restorePersistance` pose `storeBlob` si `storedBlob` OU `fsHandleId` → migration vers la copie. Garde-fou : `check-import-masse.js` refuse tout retour de `saveHandle` / `showOpenFilePicker` dans le module.

**La copie doit être RÉELLE (16/09/2026).** KARMA : *« ça marche uniquement pour le dernier plan chargé »*. Chromium range un `File` de sélecteur/dépôt dans IndexedDB **par référence au disque** : l'objet rendu a la bonne taille mais sa lecture échoue dès que le ZIP d'origine a été modifié, déplacé ou supprimé. Le dernier plan marchait parce qu'il venait d'être rouvert, donc ré-enregistré depuis la mémoire. 🩹 `PlanRegistry.saveBlob` matérialise désormais `new Blob([await file.arrayBuffer()])` quand `blob instanceof File` — un seul point, qui couvre l'import unitaire, l'import multiple et la re-sélection. À l'ouverture, `homeLoader` sonde 4 octets du blob avant d'y croire : un ancien blob-référence mort → modale « Données introuvables » → re-sélection → vraie copie (l'entrée guérit). Détail : `docs/architecture/gotchas.md`. Preuve : `scripts/smoke/checkup-import-masse.js`.

## 📁 Dossiers de « Mes plans » (v1.95.0)

Étude et décisions : `docs/audits/2026-09-16_etude-dossiers-mes-plans.md` (archivé : tag Git `archive-docs-2026-09-30`) (§8-9). Garde-fou `scripts/check-plan-folders.js` (exécute le registre dans un bac à sable), smoke `scripts/smoke/checkup-plan-folders.js` (hauteur au pixel, index, mobile).

**Données** (`js/planRegistry.js`, magasin `myktamap_plans`) : `folders: [{ id, name, color, order, collapsed, src: "user"|"index", rule?: { tags } }]`, `plansView: "all"|"folders"` (absent = jamais choisi), et par plan `folderId`, `folderSrc: "user"|"index"`, `folderExclude: [ids]`. Rien de ces clés n'existe tant qu'aucun dossier n'est créé : le mode Tout est l'écran d'avant. API : `getFolders / createFolder / renameFolder / setFolderColor / setFolderCollapsed / moveFolder / deleteFolder / setFolderRule / setPlanFolder / planFolderId / planFolderByRule / getPlansView / setPlansView / hasPlansViewChoice / applyIndexFolders / fusionnerDossiers`.

**Trois règles, exécutées par le garde-fou** :
1. **Manuel > règle > rien.** `planFolderId(p)` rend le `folderId` manuel s'il existe, sinon le premier dossier (dans l'ordre) dont la règle matche une étiquette du plan, sauf exclusion. Sortir à la main un plan capturé par une règle pose `folderExclude` ; le remettre à la main dans ce dossier la lève.
2. **L'index propose, l'utilisateur dispose** (doctrine v1.90.1 des tags, 3e application). `setPlanFolder(id, fid, "index")` refuse un plan `folderSrc: "user"`. Un dossier `src: "index"` ne se renomme, ne se recolore, ne se supprime pas et sa règle n'est pas modifiable localement ; il se replie et se réordonne. `applyIndexFolders(liste)` crée/met à jour les déclarés (un dossier user homonyme est REPRIS sous son id local, verrouillé) et LIBÈRE (src user, jamais supprimé) ceux qui ne sont plus déclarés ; rend `{ idDéclaré → idRéel }` que `decouvrirPlansServeur` utilise pour `plans[].folder`.
3. **Jamais deux « Secteur », jamais un plan perdu.** `createFolder` et `fusionnerDossiers` (pure, utilisée par l'import de liste `.config` et par `profileExportImport > applyProfile`) fusionnent par nom insensible à la casse, l'id local gagne, le `folderId` des plans importés est traduit ; un dossier importé arrive toujours `user`. `deleteFolder` renvoie les plans en Non classés et nettoie les exclusions. Un `folderId` orphelin vaut Non classés. `removeAll` efface aussi dossiers et mode.

**Écran** (`js/homeLoader.js`) : sélecteur `#loaderPlansViewSwitch` dans `.loader-section-head` (0 px ajouté), ➕ et ☑ visibles seulement en mode Dossiers ; `refreshPlansList` lit `_lireVuePlans()` (registre, sinon défaut kiosque `window._ktaPlansViewParDefaut`), masque les chips et ignore le filtre par étiquette en mode Dossiers, rend `_rendreDossiers` (en-têtes ≤ 40 px, repliés par défaut, Non classés en dernier) puis `_brancherDossiers`. Sans geste : feuille « Déplacer vers… » (`_ouvrirFeuilleDeplacer`) ouverte depuis la barre de sélection ☑ uniquement (le bouton 📁 par ligne a été retiré après la v1.95.0), sélection multiple (`_plansSelectMode`, barre en pied de liste), ⋮/➕ = même feuille (`_ouvrirMenuDossier` : nom, couleur, règle, ordre, suppression via `ktaConfirm`). **Glisser** : `draggable` posé uniquement si `(pointer: fine)`, armé après `SEUIL_GLISSER` (6 px) depuis le `pointerdown`, sinon `dragstart` annulé et le clic ouvre le plan ; aucun re-rendu au survol, seulement au dépôt. **Glisser tactile** (`_brancherGlisserTactile`) : appui long `APPUI_LONG` (450 ms) immobile (`TOLERANCE_APPUI` 8 px, sinon c'est un défilement) → `_soulever` (fantôme `.kta-plans-drag-ghost` fixe sous le doigt, vibration) ; `touchmove` n'est `preventDefault`-é QUE pendant le geste (écouteur `passive: false`), cible par `elementFromPoint` (`.kta-plans-folder-head` / `-rows`), `_deposer` au `touchend`. La ligne d'origine devient une **empreinte** (`.kta-plan-row-empreinte`, opacité 0,12 — un double sous le fantôme donnait un scintillement) ; `_defilerAuxBords` (rAF, zone 72 px, vitesse ≤ 14 px/frame) fait défiler le conteneur trouvé par `_trouverScroller` (colonne PC ou overlay de l'accueil sur mobile) tant que le doigt reste près d'un bord, et recalcule la cible ; ne démarre qu'une fois le doigt bougé, et **borné à « Mes plans »** (jamais au-delà de la fin de `#allPlansList`, jamais au-dessus de `#myPlansBox` — KARMA : « le plan n'a rien à faire glisser après OSM ») ; arrêté au dépôt (`cancelAnimationFrame`). `user-select: none` + `-webkit-touch-callout: none` sur lignes et en-têtes, `selectstart` bloqué pendant le geste (PWA : l'appui long surlignait le texte). Repli mobile par dossier déplié (`_ktaMobileCollapseDossiers`, 5 lignes). Un plan capturé par règle porte `.kta-plan-row-folder-dot-rule`.

**Serveur** : `index.json > folders[{ id, name, color, order, rule? }]` + `plans[].folder` + `config.plansViewDefault: "folders"` (appliqué par `_appliquerConfigKiosque` via `window._ktaPlansViewParDefaut`, seulement si `hasPlansViewChoice()` est faux). ConfAdmin : tableau « 📁 1 bis. Dossiers » + colonne « 📁 Dossier » + case « mode Dossiers par défaut ». **Import multiple** : sélecteur « Ranger dans : » (`_optionsDossiers`, `_dossierCible`) → `setPlanFolder(id, fid, "user")` par plan entré.

**« Mémoriser les plans dans l'app » (ex-« Précharger le ZIP ») — option, cochée par défaut.** Décochée (`opts.precharger === false`), seule l'entrée est écrite : ni copie ni autorisation, `aStocker = 0` (verdict de place trivialement OK), résumé `impmasse.resume.poidsSansCopie`. Le plan s'ouvre alors par re-sélection, exactement comme un plan restauré depuis un profil. Le garde-fou §6 EXÉCUTE `importer()` sur un registre factice pour prouver les cinq scénarios (défaut, handle, handle refusé, décoché, copie ratée).

**Échec de rangement DEMANDÉ = entrée retirée.** Une ligne « à re-sélectionner » alors que l'utilisateur a coché la copie serait une dégradation silencieuse. Sur quota épuisé, l'import s'arrête net et le rapport dit après combien de plans.

**Réseau** : nul. Lecture locale, stockage local, aucune requête.

## 🗺️ GeoTIFF — l'image et son calage dans le même fichier (v1.93.0)

`js/tiffGeoref.js` · API `window.TiffGeoref = { estTiff, lire, EXT_ACCEPTEES, _interne }` · garde-fou `scripts/check-geotiff.js`.

**Le problème** : un plan calé sous QGIS ressort en GeoTIFF. `accept="image/*"` laissait entrer le `.tif`, mais aucun navigateur de bureau ne décode le TIFF — et il fallait re-saisir deux points GPS déjà posés.

**Ce que le module lit** :

| Moitié | Tags / détail |
|---|---|
| Calage | `ModelPixelScale` (33550) + `ModelTiepoint` (33922), ou `ModelTransformation` (34264) ; EPSG par `GeoKeyDirectory` (34735) |
| Pixels | en bandes ou en tuiles ; LZW (prédicteur horizontal géré), Deflate, non compressé — puis ré-encodage PNG par le canvas |

**Pourquoi aucune bibliothèque vendorée** (`geotiff.js` ≈ 300 Ko) : mesuré sur un corpus réel de 39 plans de carrières calés sous QGIS — LZW ×30 / aucune ×9, RVB 8/8/8 ×39, bandes ×39 (aucune tuilée), `PlanarConfig` 1 ×39, prédicteur 1 ×39, `Scale+Tiepoint` ×39, 2,2 Mpx au maximum. Les tuiles sont lues aussi : l'export GeoTIFF de l'app en écrit (`docs/architecture/exports.md`), comme QGIS en `TILED=YES`. On lit ce sous-ensemble et **on refuse le reste en le nommant** : 33 raisons distinctes (`tiff.err.*`), chacune disant quoi réexporter.

**Le calage se déduit exactement** : `Scale + Tiepoint` (ou une matrice sans terme croisé) décrit une image nord en haut — deux coins opposés la décrivent entièrement, ce qui est précisément ce que consomme `plan.georef` (similitude 2 points de `KmzExport.buildTransform`). Une `ModelTransformation` **tournée** est acceptée si c'est une **similitude** (rotation + échelle uniforme) : axes du pixel ramenés en mètres au sol (en 4326, rayons de l'ellipsoïde : `KmzExport.metresParDegre`), longueurs égales et angle droit à **1 %** près (`TOLERANCE_SIMILITUDE`), sans miroir. Le calage reçoit alors **A, B et C** (coins sud-ouest, nord-est, nord-ouest du fichier) : l'affine 3 points de l'app reproduit le fichier exactement, écart toléré compris, et le Générateur remplit le point C. Le calage posé est au modèle `"local"` (plan tangent, `vue-osm.md` §2.2) : coins à < 0,35 m d'un GeoTIFF Lambert 93 de 6 km. Pourquoi 1 % : les GeoTIFF Lambert 93 exportés depuis un plan au calage historique s'écartent de ≤ 0,4 % de la similitude (calage équirectangulaire non conforme) ; une image étirée ou cisaillée au-delà est **refusée** (`tiff.err.rotation`, « le calage déforme l'image »), pas approchée. L'échelle est la longueur de l'axe, pas son terme diagonal.

**Reprojection** : `window.SigImport.L93` (Lambert 93) et `window.SigImport.WEBMERC` (Web Mercator, ajouté en v1.93.0 — 7 plans du corpus sortent en EPSG:3857, QGIS l'impose dès qu'on cale sur un fond de tuiles). ⚠️ **Aucune copie locale de ces maths** : une seule implémentation par projection dans le projet, verrouillée par son garde-fou.

**Intégration** : `.tif/.tiff` explicites dans les `accept` (le type `image/*` seul ne les propose pas de façon fiable selon l'OS) ; le PNG converti est **ré-injecté dans le même input** via `DataTransfer`, donc `_lireImageDimensions`, le tuilage V2 et le ZIP reprennent **sans rien savoir du TIFF**.

**Réseau** : nul. Lecture `FileReader` → `ArrayBuffer`, décodage en mémoire, encodage canvas. Aucun octet ne sort, aucune bibliothèque chargée.

## 🚪 Fermer un plan = le vider (retour à l'accueil)

Décision produit : revenir à l'accueil **libère tout de suite** le plan, sans délai ni variante. Tous les chemins
passent par `main.js > afficherLoader` : 🏠 de l'en-tête et « 📚 Mes plans » (fenêtre « Changer de plan » si la
session n'est pas vierge, `interface.js > _retourLoaderAvecConfirm`), 🏠 des Réglages, ouverture ratée,
`ktaFermerPlanPourMemoire` (Générateur). Il n'y a ni retour navigateur ni geste de retour dans l'app. Secours,
urgence et Mode Histoire ne ramènent pas à l'accueil d'eux-mêmes.

- Carte présente (`window.map instanceof L.Map`, même cachée sous l'accueil après une ouverture ratée) →
  `_libererRessourcesPlanPrecedent("accueil")` : le démontage d'un changement de plan, dans le même ordre
  (session enregistrée et persistance figée, sortie du carnet suspendue, extension prévenue
  `KtaExtensions.quitterPlan("accueil")` → `mktm:plan-ferme { vers: "accueil" }` **une seule fois**, suivi coupé
  avant le démontage, puis tuiles, calques, carte, blobs du ZIP). Pile de retour et chaîne
  multi-plans abandonnées (`onPlanExit("home")`).
- Pas de carte (démarrage, accueil déjà affiché) → seulement la purge de navigation et `quitterPlan("accueil")`.
- Après : `window.map === null`, `PLAN_CONFIG === null`, `#map` vide, `_currentLoadedPlanId === null` (remis à null
  APRÈS le démontage, qui le lit encore) ; le plan quitté passe dans `window._ktaDernierPlanId` (carte OSM de
  l'accueil). « Reprendre » lit `PlanRegistry`. 🩸 Gardé à l'accueil, l'id faisait croire le plan ouvert : stats et
  photos du plan quitté au Générateur, présence et itinéraire du plan quitté côté installation reliée. « Un plan est
  affiché ? » reste `ktaPlanAffiche()` (un plan se charge SOUS l'accueil). Preuve : `smoke.js` (retour accueil puis
  « Reprendre », deux moteurs), `check-osm-outils.js`.
- « Reprendre » / rouvrir = chargement normal : la session restaure objets, mesures, légende, calques en
  modification, traces de suppression, filtres et timeline du suivi ; favoris et calage vivent hors session. Le suivi
  reste arrêté (l'utilisateur le relance).
- **Vue retrouvée** (`js/vuePlan.js`, décision produit) : centre, zoom et niveau actif du plan, par plan, sur
  l'appareil, sans limite de durée. Mémorisée au début de `_libererRessourcesPlanPrecedent` (avant l'arrêt du suivi
  et le démontage), au `pagehide`, au passage en arrière-plan et à chaque changement de niveau
  (`interfaceConfig.js > ktaSetActiveLevel` : le niveau tient même si l'onglet est tué) ; appliquée par `lancerApplication` après la
  restauration de session. Suivi actif au départ : la vue se recentre sur la dernière position du tracker, à son
  niveau ; sinon la vue telle qu'elle était. Sans vue mémorisée : cadrage initial (position de départ, zoom 0, ou
  dernière position du tracker si la session a un tracé).
  - Stockage : `localStorage["myktamap_vue_v1_<planId>"]` = `{ v, x, y, zoom, niveau?, suivi, img, le }`
    (coordonnées plan, ~150 octets). **Pas dans la session** : la session voyage (export, synchro d'une
    installation reliée) et s'efface avec « Effacer la session », la vue est propre à l'appareil ; écriture
    synchrone, sûre au `pagehide`. Hors export de profil (`profileExportImport.js > PER_PLAN_PREFIXES`).
  - Garde-fous à l'application : vue ignorée si l'image a changé (`img` = largeur, hauteur, image de base, version
    du plan-config) ; centre borné à l'image, zoom borné à la carte ; niveau inconnu du plan → niveau par défaut (un
    niveau porté seulement par un calque de données est relu une fois après 1,5 s, sauf si le niveau a déjà changé).
    Rien n'est mémorisé avant que la vue ait été appliquée (un passage en arrière-plan pendant le chargement
    écrirait le cadrage par défaut). Un portail (`InterPlanLinks`) recentre encore après.
  - 🩸 Le cadrage d'ouverture de `tracking.js > initTracking` est **non animé** : un zoom animé finit dans une image
    suivante et remettait la carte sur sa cible par-dessus la vue retrouvée.
  - Plan supprimé : `PlanRegistry.purgeAssociatedData` retire la vue ; copie locale remplacée par sa version publiée :
    `transferAssociatedData` la fait suivre. Une vue orpheline apparaît dans le nettoyeur d'orphelins (🧠 Mémoire).
- Fenêtre « Changer de plan » : inchangée (posée si la session a des objets, des mesures ou un tracé de suivi) ; le
  suivi en cours ne bloque pas la fermeture.

Preuve : `scripts/smoke/checkup-retour-accueil.js` (carte démontée, session enregistrée, aucune erreur à l'accueil,
« Reprendre », allers-retours sans dérive ; vue retrouvée après l'accueil et après rechargement, suivi actif,
image changée, vue hors image, niveau inconnu, transfert et purge). Mesures : `perf-memory.md` §13.

## 🧙 Générateur — assistant pas-à-pas (v1.72.1)

> Topo KARMA « installeur style Windows, évite les oublis » — décisions **1:a** (couche de présentation sur le form existant, PAS de réécriture) **2:a** (toggle « Tout afficher » conservé) **3:a** (barre d'étapes cliquable).

**Principe** : `_wizInit()` (appelé en fin d'`afficherPlanner`) injecte la chrome — barre d'étapes sous le hint de mode, nav (Précédent/Passer/Suivant) dans la rangée d'actions, page Résumé avant le bloc erreur, toggle 🗒️/🧙 à côté du switcher. Les pages = les `.kta-aide-section` du corps **dans l'ordre DOM** (`WIZ_DEFS`, mapping par INDEX).

**⚠️ Invariants** :
- **`WIZ_DEFS` est indexé sur l'ordre DOM des sections** : ajouter/retirer/déplacer une section du form = mettre à jour `WIZ_DEFS` (sinon décalage silencieux de toutes les pages).
- L'état du résumé est **lu dans les champs** (`_wizEtatDe`), jamais déduit de la navigation — le « Passé » n'est qu'un marquage visuel.
- Le masquage wizard (`style.display` inline) coexiste avec le masquage mode Simple (CSS `[data-planner-mode="simple"] [data-planner-advanced]`) : inline `""` rend la main au CSS, ne JAMAIS forcer `display:block`.
- Changement de mode ou import ZIP → **reconstruire les pages** (`_wizConstruirePages`) ; l'import ZIP rend toutes les étapes visitables et atterrit sur Identité.
- Validations par page volontairement **légères** (nom, image) — la validation exhaustive reste dans `_genererZip` (source de vérité unique).
- ⚠️ **Plus aucun élément du form ne doit être révélé « au chargement de quelque chose »** : en wizard, un élément caché au moment où l'user est sur sa page est un élément JAMAIS VU (piège vécu : la checkbox V2, révélée à l'upload de l'image, se ratait — rendue toujours visible en v1.72.1). Un état non-applicable se montre grisé/inerte, pas caché.

**LS** : `myktamap_planner_wizard_v1` (« 0 » = tout afficher).

---

## 🔄 Mettre à jour le plan — de la session à une nouvelle version

`js/majPlan.js` (`window.MajPlan.ouvrir`) · Générateur prérempli : `createConf.js > window.ktaGenerateurMaj` ·
garde-fou `scripts/check-maj-plan.js` · parcours réel `scripts/smoke/checkup-maj-plan.js` (relevé fictif rendu
local, calque corrigé + objets dessinés → Générateur → ZIP relu → remplacement → rechargement).

**Où** : tuile **🔄 Mettre à jour le plan** dans ⬆️ Exporter (section 🗺️ Plan, `interface.js > _MODAL_EXPORT`) et
bouton en tête des calques de ≡ Filtres (`filterPanel.js > _renderDataLayersSection`, absent en lecture seule).
🔒 L'entrée refuse la lecture seule (`ktaEditionRefusee`) et un droit d'export limité (`ktaExportPlanRefuse()` sans
`limitePermise`) : le fichier d'un calque EST le plan.

| Étape | Ce qui se passe |
|---|---|
| 1. Calques en modification | `CalqueSession.listeRapatries()`, cochés d'office ; chacun remplace son fichier par `contenuCalque(id)` (même contenu que « 💾 Exporter », sans téléchargement). Les tableaux de la copie remplacent ceux du fichier, **vides compris** ; les autres champs du fichier d'origine (relu par `fetch`) restent. |
| 2. Objets à la main | `candidatsAjout()` groupés comme la Conversion : points par **première** étiquette (un objet ne part que dans un calque), tracés / zones / structures par type (customs compris). Par groupe : calque du plan, **nouveau calque** (nom saisi → id `slug`, unique, jamais `editor` ; même nom = même calque) ou laissé dans la session. 10 calques de données au plus (plafond du Générateur). |
| 3. Générateur | `ktaGenerateurMaj({ planId, zip, calques, legende, onZip })` : ZIP actuel du plan (copie gardée, sinon l'extension, sinon `plan.zip` de l'index ; plan du site en dossier → le Générateur demande qu'on dépose le ZIP), mode Modifier, chaque calque posé sur SA ligne (`item._ktaFichierMaj`, ligne créée pour un nouveau calque, cadre doré `.kta-planner-layer-maj`), légende des types versés absorbée dans la légende du plan (`window.ktaLegendePourCalque(contenu, clés de PLAN_CONFIG.icons)` : même sous-ensemble que la conversion, plus les anciens tags du plan rendus modifiables ; une entrée de même id **remplace** celle du plan, `_absorberLegendeCalque(…, { entreesGagnent: true })`, sinon une icône changée ou un renommage ne passeraient pas) ; l'image data-URI d'un ancien tag rendu modifiable remplace celle de sa ligne « Icônes » et s'écrit dans `icons` (`_iconesDepuisLegende`, jamais pour un `cust-…`), « Inclure les photos » coché. **Échelle recalibrée dans l'app** (⚙️ Réglages, `config.js > getPlanScale(planId)`) ≠ celle du ZIP : elle remplace celle du ZIP dans le champ, dite dans le statut et sous le champ (`_appliquerEchelleRecalibree`) — 🩸 sinon le nouveau ZIP repartait avec l'ancienne échelle, et une autre version (autre id) perdait la recalibration jusque sur l'appareil. **Calage GPS des Réglages** (`KmzExport.getCalibration(planId)`, valide et dans l'image) ≠ celui du ZIP : il remplace `plan.georef` avant le préremplissage, dit dans le statut (`_georefReglagesPourMaj`, décision produit « les Réglages gagnent », `vue-osm.md` § 2.2). L'utilisateur vérifie et génère. **Tuilage V2** : le plan est d'abord **fermé** pour libérer la mémoire (ci-dessous). |
| 4. Suite | `onZip(blob, nom, { planFerme })` remplace le téléchargement et « Publier » du Générateur ; plan fermé : la fenêtre le dit, « Fermer » ou « Télécharger » laissent l'accueil (le plan en tête de « Reprendre »). **Plan local** : ⬇️ Télécharger ou 🔄 Remplacer dans l'app (`chargerZipFichier(fichier, preset, { planId: <même id>, storeBlob: true })` : session, calage, photos, favoris restent attachés). **Plan d'extension** : ☁️ Publier la nouvelle version si `KtaExtensions.versionAutorisee(id)` (prise `publierVersion`, `community-server-line.md` §3 ; avancement dans la fenêtre : ligne d'état et barre, texte commun `ktaTexteAvancementPublication`), puis réouverture sur la nouvelle version ; sinon téléchargement seul (droit de modification : il prépare, la personne qui gère publie). **Plan du site** : téléchargement (l'administrateur remplace le ZIP). |
| Après | Après un remplacement ou une publication : `ktaConfirm` propose de **rendre les calques** (`restituer`, partagée sur un plan d'extension) et de **retirer de la session les objets versés** (`CalqueSession.retirerIntegres(uids, T)`), sinon doublons. Plan encore ouvert : proposé AVANT le rechargement, la session rechargée est déjà propre. Plan fermé par le Générateur : proposé APRÈS la réouverture, sur la session restaurée (celle d'un plan fermé ne s'enregistre plus, `SessionPersist.onPlanUnload`) ; 🩸 la fenêtre « Session précédente restaurée » est alors **retenue** jusqu'après le retrait (`SessionPersist.retenirModale` / `libererModale` dans un `finally`, valable pour la seule ouverture suivante) et ne s'ouvre que si la session restante n'est pas vide, avec ses vrais chiffres — sinon elle annonçait les objets que le retrait enlève. Nouveau nom de la version : `SessionPersist.renommerSession(id, nom)` le déclare avant le chargement ; l'ouverture accepte alors la session de l'ancien nom et la réécrit sous le nouveau (🔒 seul ce chemin : ailleurs, un autre nom garde la question « Session d'une autre version du plan »). Remplacement raté : le ZIP part en téléchargement. Checkups : `checkup-maj-plan.js` (deux passes : version changée, puis version et nom), `checkup-icones-legende.js` (icônes de légende et anciens tags à travers la régénération, puis le ZIP seul dans un navigateur neuf). |

**🩸 Fermer le plan avant le tuilage V2** (`createConf.js > _fermerPlanAvantTuilage`, `main.js >
ktaFermerPlanPourMemoire`). Avec un plan ouvert (carte, tuiles, session), le tuilage d'une grande image est passé
chez un utilisateur de moins d'une minute à plus d'une demi-heure : sous pression mémoire, le navigateur jette
l'image source décodée et la redécode à chaque tuile (`_genererTuilesV2` découpe chaque tuile par `drawImage`
depuis l'élément image). Au clic sur 📦 Générer, tuilage V2 coché : plan **ouvert** → `ktaConfirm` (« le plan va
être fermé pendant la génération… ») ; refus = rien ne change, rien n'est généré. Accord → retour à l'accueil, qui
démonte le plan (ci-dessous, « Fermer un plan »). Depuis l'accueil, la carte est déjà démontée : rien à fermer. Tout ce que le Générateur utilise est déjà chargé (fichiers du ZIP, calques de l'assistant) ; les photos
sont lues par l'id du plan relevé avant la fermeture. Sans tuilage V2, rien n'est fermé (génération légère).
Les tuiles entrent dans le ZIP **sans recompression** (`{ compression: "STORE" }` : JPEG, WebP et PNG sont déjà
compressés).

**🩸 Trace de suppression sous la date du fichier** : un objet versé est écrit dans le calque avec `updatedAt = T`
(instant de l'assistant), et son retrait de la session pose sa trace à `T - 1`. Assez tard pour retirer la copie de
session des autres appareils (modifiée au plus tard avant l'assistant), assez tôt pour que l'objet du fichier gagne
toute fusion (`KtaUid.fusionnerCalques` : une trace l'emporte si `deletedAt ≥ updatedAt`). Un objet retouché après
`T` reste dans la session (sa retouche n'est pas dans le fichier) et l'app le dit. Les copies de calque, elles, ne
reçoivent jamais de trace (restitution).

**Corrigés au passage dans le mode Modifier** (profitent aussi au chemin manuel) :
- un calque dont le fichier ne porte pas son id (`roads.json` pour le calque `galeries`) ressortait **vide** : le
  fichier d'origine de la ligne est retenu (`item.dataset.ktaFichier`), ordre : fichier choisi sur la ligne >
  fichier de l'assistant > fichier d'origine > `<id>.json` ;
- les tuiles V2 du ZIP source ne sont plus extraites en `Blob` (la génération les refait depuis l'image de base).

**Chemin manuel sur le ZIP d'un plan d'extension** (fiche ℹ️ › 💾, déposé dans le Générateur en mode Modifier) :
`_chargerZipModifier` retient l'empreinte du ZIP (`_plannerSourceZip` : SHA-256 de la vérification denylist, taille,
nom du plan-config). En fin de génération, `_planExtensionDuZip()` cherche le plan ☁️ d'origine : même SHA-256 que
le registre (`entree.sha256`, posé à l'ouverture) ou que l'archive gardée de même taille → reconnu ; sinon UN SEUL
plan ☁️ du même nom → « porte le nom de ». Plusieurs homonymes ou aucun : si l'utilisateur gère au moins un plan
☁️ (`versionAutorisee`), « Mettre à jour quel plan ☁️ ? » (`_choisirPlanExtAMettreAJour`, liste `#kta-gen-cible`
dans `ktaConfirm`, présélection = le plan du même nom s'il est seul, sinon « Aucun » ; plusieurs homonymes : rien
de présélectionné, validation inactive jusqu'au choix, chaque homonyme distingué par dossier, version, dernière
ouverture et début d'id, lus dans le registre) → `publierVersion` sur le plan choisi,
ou « Aucun : publier comme nouveau plan » ; sinon proposition de plan neuf comme avant. Reconnu et
`versionAutorisee` → **☁️ Publier la nouvelle version** (`publierVersion`, même plan) ; reconnu sans le droit →
explication, téléchargement seul. Dans les deux cas, **Publier comme nouveau plan** (3e bouton de `ktaConfirm`,
`publierPlan`) reste un choix explicite : jamais de second plan d'office. Garde-fou : `check-extensions.js` §7.

**Limites** : un plan V2 est retuilé en entier à chaque mise à jour (lent sur téléphone, comme le mode Modifier) ;
la légende du plan éditée depuis le Générateur ouvert sur un plan affiché échange brièvement la légende de session
(§58.2) ; sur une installation reliée, les appareils encore sur l'ancienne version voient les objets retirés
disparaître de leur session avant d'avoir rouvert le plan.

---

## 🔍 Régénérer en haute résolution — un NOUVEAU plan ×2, ×3 ou ×4

`js/planHD.js` (`window.ktaOuvrirPlanHD`, calcul pur `window.KtaPlanHD`) · Générateur prérempli par le chemin de
« Mettre à jour le plan » (`createConf.js > ktaGenerateurMaj`) · garde-fou `scripts/check-plan-hd.js` · parcours réel
`scripts/smoke/checkup-plan-hd.js` (relevé fictif ×2 : fond uni puis rendu, ZIP relu, ajout, rechargement, refus).

**Pour quoi** : un plan décalqué (piliers, structures, tracés…) sur un scan basse résolution devient un plan plus
grand, tout en vectoriel, sur lequel continuer à dessiner. **Où** : tuile de l'accueil de l'📊 Éditeur de données,
plan affiché seulement (`tableEditor.js > #kta-tbl-src-hd`, icône `scaling`). 🔒 Refusé sans le droit d'exporter tout
le plan (`ktaExportPlanRefuse`, le nouveau plan en est une copie) ; la lecture seule ne bloque pas (le plan ouvert
n'est jamais modifié).

⚠️ **Contrat** : le plan ouvert ne change jamais (entrée du registre, archive gardée, session). Le nouveau plan est un
plan **local** sous un identifiant libre : `KtaPlanHD.idLibre` = `genLocalId(nom, version)`, suffixé `_2`, `_3`… s'il
est pris ou s'il est celui du plan d'origine. Nom proposé : nom d'origine + « (HD) », modifiable dans le Générateur.

| Étape | Ce qui se passe |
|---|---|
| 1. Fenêtre `#kta-plan-hd` | **Facteur** ×2 / ×3 / ×4 avec la taille finale (`KtaPlanHD.facteurs`) ; **refusé** (radio grisé, raison en `kta-tx-err`) au-delà de la surface de canvas de l'appareil — iPhone 16 777 216 px, ailleurs 64 Mi px, les plafonds de l'export image (`exporter.js > IOS_MAX_PX_CANVAS`, `SEUIL_PX_EXPORT`) — ou d'un côté de 32 767 px ; aucun facteur possible : bouton grisé et phrase. Au-delà de 4096² px : « tuilage V2 coché d'office » (`TILING.md` § 1). **Fond** : uni (couleur : blanc, gris clair, noir, sépia, transparent) ou rendu des données. **Ancien scan** (coché ; grisé si le plan a déjà 10 calques image). **Objets de la session** (si la session en a). |
| 2. Archive préparée | Archive du plan (`MajPlan._interne.zipDuPlan` : copie gardée, extension, ZIP de l'index ; aucune → refus « ouvre-le depuis son fichier ZIP »). Calques relus DANS l'archive ; session cochée : copies des calques en modification et objets dessinés à la main dans un calque nouveau « Session » (`MajPlan._interne.construire`, mêmes règles que « Mettre à jour le plan », légende des types versés par `ktaLegendePourCalque`). Chaque calque passe à ×k (`KtaPlanHD.mettreAEchelleCalque`), le plan-config aussi (`mettreAEchellePlanConfig`). Nouvelle image W·k × H·k : couleur unie, ou rendu de `MyKTAMapExporterGenererCanvas` (`scale: k`, `bg: "transparent"`, tous les calques de données, `sansIcones: true`, niveau 0 seulement sur un plan multi-niveau) posé sur la couleur (`destination-over`) ; PNG, repli JPEG 0,92 si l'appareil ne sait pas encoder (sauf fond transparent), sinon refus clair. Archive : tout ce que l'ancienne embarque (icônes, calques image, PDF) sauf plan-config, image de base, calques, `data/tiles/` et `data/photos/` (le Générateur reprend les photos de l'appareil). |
| 3. Générateur | `ktaGenerateurMaj({ zip, calques: [], legende, statut, tilingV2, onZip })` en mode Modifier sur cette archive. ⚠️ **Sans `planId`** : l'échelle recalibrée et le calage des Réglages seraient réappliqués tels quels, dans l'ancien repère — `planHD.js` les a déjà repris à l'échelle. `statut` remplace le bilan des calques dans la ligne d'état ; `tilingV2` coche la case (l'utilisateur garde la main). « Inclure les photos » coché : les photos du plan d'origine (IndexedDB, lues par l'id relevé avant une éventuelle fermeture pour le tuilage) partent dans le ZIP, indexées par l'uid du point. |
| 4. Fin `#kta-plan-hd-fin` | **Télécharger**, ou **Ajouter à mes plans et l'ouvrir** : `chargerZipFichier(fichier, "auto", { planId: <id libre>, storeBlob: true })`, puis photos et liaisons recopiées (ci-dessous). Ouverture ratée : le ZIP part en téléchargement. |

**Ce qui passe à ×k** (🩸 le champ oublié est le bug classique ; `check-plan-hd.js` vérifie que tout couple `{ x, y }`
d'un plan-config ou d'un calque, où qu'il soit, sort à ×k) :
- calques (`KtaRecalageScan.transformerCoordsFichier`, homothétie `{ a: k, b: 0, c: 0, d: k, e: 0, f: 0 }`, option
  `exact` : aucun arrondi) : points, sommets des tracés / zones / structures, mesures, point précis (trois formes),
  raccords des passages entre niveaux (`accroches`), fin des rampes de masse au sol ; côté « ce plan » d'une liaison
  embarquée dans un point (`interPlanLinks`, l'autre côté vise un autre plan et reste tel quel) ;
- plan-config : `imageWidth` / `imageHeight`, calage `pointA` / `pointB` / `pointC` (lat/lng, `estimated` et `modele`
  intacts : le modèle ne dépend que des points), `tracking.startX` / `startY` et `scale` (px/m ; absente = 4,9, le
  défaut de l'app), cibles des calages de calques image (`targetA` / `targetB`, sources intactes) ;
- réglages de l'appareil, prioritaires comme ailleurs puis mis à l'échelle : calage des Réglages (même règle que
  `_georefReglagesPourMaj`), échelle recalibrée (`getPlanScale`), départ du tracker (`APP_CONFIG.startX/Y`), calages
  de calques image (`ImageLayerCalibration.getCalibration`).

Retirés : `plan.rognage`, `plan.tiledV2`, `tiling` (image neuve, entière, retuilée par le Générateur). Gardés tels
quels : tout ce qui est en mètres (hauteurs et profondeurs des niveaux ; largeurs de fronts : la loi de largeur suit
px/m, `structures.js > _largeurFrontPourRatio`, et `scale × k` au zoom de même rendu donne la même largeur réelle,
à l'écran comme dans le fond rendu), Nord, légende, icônes, PDF. Calque image sans calage : étiré sur le plan, il
suit seul.

**Ancien scan** : l'image de base d'origine, copiée en `data/scan_origine.<ext>`, calque image `scan_origine`
(« Ancien scan »), visible, niveau 0, ordre 5 ; sans calage il est étiré sur W·k × H·k (= emprise ×k). Image rognée
(tuilage V2, `plan.rognage`) : calage `sourceA = (rx, ry) → (0, 0)`, `sourceB = (rx + W, ry + H) → (W·k, H·k)`, sinon
les marges le décaleraient. Transparence : le curseur des Filtres, comme tout calque image (opaque par défaut).

**uid** : **gardés**. Le nouveau plan a un autre id : sessions, traces de suppression et fusions sont par plan, aucune
collision avec l'ancien ; les garder rattache les photos (index du ZIP par uid) et les liaisons (`pointUid`). Favoris,
session et réglages par plan restent sur le plan d'origine.

**🩸 Photos sur le même appareil** : les photos sont rangées par identifiant tous plans confondus. Le chargement
(`main.js > startImportedPlan`) donne au nouveau plan, sous un identifiant neuf, chaque photo du ZIP déjà en base pour
un AUTRE plan (`meta.copieDe` = id d'origine, origine « plan », même point). `planHD.js > _copierPhotos` passe
ensuite : il retrouve ces copies par `copieDe` et ne recopie rien (filet pour une photo que le ZIP n'aurait pas
pu restaurer). Le ZIP téléchargé et ouvert ailleurs les restaure normalement.

**Liaisons inter-plan** : celles du plan d'origine sont recopiées pour le nouveau (`liaisonsPourNouveauPlan` puis
`InterPlanLinks.importLinks`) : id neuf, côté d'origine renvoyé vers le nouveau plan, à ×k ; l'ancien garde les
siennes.

**Limites** : le plan d'origine doit avoir son archive sur l'appareil ; le rendu des données ne peint ni les icônes
(les marqueurs vivants passent par-dessus, une icône peinte resterait en fantôme quand le point bouge) ni d'autre
niveau que le 0 d'un plan multi-niveau ; une donnée modifiée ensuite sur le nouveau plan laisse son ancien tracé dans
un fond rendu ; un calque en modification, session décochée, part avec le contenu de son fichier et n'apparaît pas
dans le fond rendu.

---

## 🪜 Zone jonction dans le Générateur

Le type « Jonction » (zones `pente`) est dans les menus de types de zones du Générateur : liste « Polygones → type »
de l'import KMZ (`createConf.js`, `kta-kmz-imp-zone-type`) et types des polygones (et des lignes, `zone:pente`) de
l'import SIG (`_SIG_TYPES`, `_SIG_TYPES_SUP`). Le choisir fait paraître « Du niveau » / « Au niveau »
(`_htmlNiveauxPente`, `_lireNiveauxPente`), comme la création dans l'app ; deux niveaux identiques sont refusés. Les
zones `pente` importées sans deux niveaux les reçoivent (`zones.js > ktaPoserNiveauxPente`) et le plan devient
multi-niveau. ⚠️ Les couleurs par niveau de l'import SIG ne la changent pas en type de niveau (`sigImport.js >
_typeNiveau`) : elle garde sa clé, sa couleur et son libellé sont ceux du tracé jonction (légende du plan comprise,
`legendCustomization.js > TYPE_LIE`). Écrite dans le calque du ZIP, relue à l'ouverture ; l'ancien `jonction: true`
d'un calque ou d'un ZIP fusionné est converti à la lecture (`utils.js > ktaZoneLue`). Garde-fou : § F de
`scripts/smoke/checkup-zones-niveaux.js`.

## 📏 L'échelle d'un plan importé se DÉDUIT du géoréférencement

**🩸 Piège** : une échelle `tracking.scale` écrite en dur (50 px/m) par `sigImport.js` ou `gpxImport.js` peut être fausse d'un facteur 15 sur un plan importé réel (quelques px/m), et toutes ses distances avec.

**La correction ne calcule rien de neuf** : `KmzExport.buildTransform` retournait déjà `metresParPixel`, dont l'échelle est exactement l'inverse.

```js
scale: (transform && transform.metresParPixel > 0)
       ? Math.round((1 / transform.metresParPixel) * 1000) / 1000
       : 50
```

⚠️ **Un plan généré AVANT la v1.82.0 garde son échelle fausse** : elle est écrite dans son ZIP. Il faut le **régénérer** depuis le fichier source — l'app ne peut pas la corriger après coup, elle ne sait pas quelle emprise a servi.

🩸 **Le repli à 50 est conservé** et c'est volontaire : sans transform utilisable, une valeur arbitraire assumée vaut mieux qu'un `NaN` qui se propagerait silencieusement dans toutes les distances.

## 🔎 Détecter les structures — moteur de calcul

Détection des piliers (masses pleines) et des fronts (traits) sur l'image du plan. Décisions de KARMA du 18/11/2026 : un module commun en
calcul pur (mode plan d'abord, le Générateur ensuite), couleurs à la pipette, aperçu avant tout. Le parcours dans
l'interface : outil Structures et carte de l'📊 Éditeur de données, un même parcours (`js/detectionStructures.js`).
Les galeries ont leur fenêtre à elles, sur le même parcours et le même moteur, avec des tracés en sortie : § « Détecter
les galeries → tracés » plus bas.

- ⚠️ **Contexte** : le parcours ne touche au plan que par un contexte, `KtaDetectionUI.ouvrir(ctx)` (forme au-dessus
  de `detectionStructures.js > contextePlan`) : carte, dimensions et lecture de l'image, structures existantes,
  règle de niveau, écriture (`poser`). Sans argument, `contextePlan()` : le plan ouvert, la session, une étape ⏪.
  Le Générateur fournit le sien (ci-dessous). ⚠️ **Emprise lue** (`ctx.emprise()`, relue à chaque geste ; absente =
  `[0, largeur] × [0, hauteur]`, cas du Générateur) : niveau ≠ 0, union des calques image AFFICHÉS du niveau actif
  (`map.js > ktaEmpriseCalques(niveau, { affiches: true })`, getBounds, coins calés compris, sans marge), en px plan,
  bornes négatives ou au-delà de l'image possibles ; niveau 0, l'image (ses calques ne sont pas lus). Remplir,
  « Tout le plan », le cadre (ramené dedans) et `detecter` (limites et bords du plan) s'y bornent. 🩸 Bornés à l'image
  principale, un calque plus grand qu'elle voyait son débord refusé (« Aucune image du plan à cet endroit ») et un
  pilier à cheval sur le bord de l'image sortait rogné net (le bord de l'image pris pour le bord du plan).
  Règle de niveau commune :
  `structures.js > ktaNiveauNouvelleStructure(type, { multiLevel, niveau })` (absent = le plan ouvert).
- **Dans le Générateur** (`js/detectionGenerateur.js`, `createConf.js > _detecterStructuresGenerateur`) : bouton
  « Détecter piliers et fronts » de l'étape Calques de données (mode Avancé), en Nouveau, en Modifier et dans
  « Mettre à jour le plan ». Le même parcours, dans une fenêtre plein écran (`.kta-detect-gen`, z-index 100001, au-dessus
  du Générateur) à mini-carte CRS.Simple sur un aperçu réduit (≤ 4 096 px de côté) ; la pipette et le calcul lisent
  l'image SOURCE en pleine résolution (un élément Image décodé une fois, `drawImage` bloc par bloc, rectangle source
  ramené dans l'image). Plan ouvert : fermé d'abord (`_fermerPlanAvantTuilage`). Couleurs retenues sous l'id du plan
  en « Mettre à jour le plan » (les mêmes qu'en mode plan), sinon sous `generateur`. Niveau, si la case multi-niveau
  du Générateur est cochée : niveau 0 (image de base), 2e masse au −1 ; sinon aucun champ `level`.
  - Sortie : calque « Structures détectées » (`structures-detectees`, format de `structure.json`) ; une relance y
    ajoute. ⚠️ **Repère** : en mode Modifier, les structures sont mises tout de suite dans le repère gardé du plan
    (`_rognagePourRepere`) ; en nouveau plan, le rognage n'est connu qu'au tuilage : elles restent en px source sur
    une ligne marquée (`item._ktaDetecte`) et `_genererZip` les décale du rognage réel, hors de la question du
    rognage (rien n'y a été saisi à la main ; un fichier choisi ensuite sur la ligne redevient un calque fourni).
  - Doublons : contre les structures de TOUS les calques de la page (fichiers du ZIP, calques de l'assistant),
    ramenées en px source par le rognage prévu (`_rognagePrevu`), même règle qu'en mode plan.
  - Échap ferme la fenêtre : le contexte déclare le Générateur dans `ctx.hotes` (sinon, fenêtre affichée, il
    garderait l'Échap) ; message après « Valider » propre au contexte (`ctx.messagePoses` : pas d'« Annuler » ici).
  - Mesure (19/11/2026, Chromium, iPhone émulé, processeur ×4, image fabriquée 20 000 × 12 000 px, 1 344 piliers) :
    fenêtre prête en 5 s, pipette en 6 s, « Tout le plan » (mi-résolution, confirmé) en 3 min 22, 1 344 trouvés sur
    1 344 ; pic mémoire du navigateur 1,7 Go, dont l'image décodée (~960 Mo, comme au tuilage). 🩸 Un vrai iPhone
    plafonne bien plus bas : au-delà de ce que le tuilage du même appareil supporte, la détection échoue aussi
    (non mesuré sur appareil réel).
  - **Galeries** : bouton « Détecter les galeries » à côté, mêmes modes, même fenêtre que l'outil Tracés
    (`_detecterStructuresGenerateur("traces")`). Sortie dans un calque À PART « Tracés détectés »
    (`traces-detectees`, format d'un calque de tracés `{ type: "roads", roads }`, `DETECT_GENRES`), mêmes règles :
    repère, ligne marquée (`_ktaDetecte`, `_ktaDetecteGenre: "traces"`), une relance y ajoute, doublons contre les
    tracés (`roads`) de TOUS les calques de la page. « Structures détectées » garde son nom et ses structures.
  - Checkup : `scripts/smoke/checkup-detection-generateur.js` (piliers et galeries ; Chromium et WebKit).

- **`js/ktaDetection.js`** (`window.KtaDetection`), sans DOM ni carte : chargé par `index.html`, par le worker et
  par Node. `detecter({ lireBloc, region, limites, classes, reglages, echelle, executer?, onProgres?, signal? })` →
  `{ masses: [{ classe, points, aire, boite }], tropGrands, ignorees, blocs }`, coordonnées en **pixels du plan**.
  `limites` = `{ x0, y0, x1, y1 }` (emprise, bornes négatives possibles) ou `{ w, h }` (= `[0, w] × [0, h]`) ; la
  région y est ramenée.
- **Méthode, par bloc** : classe de couleur de chaque pixel (écart ΔE en Lab à l'exemple le plus proche, table sur
  6 bits par canal remplie à la demande) → trous fermés d'au plus `trouMax` px comblés → ouverture morphologique
  (carré de côté `ouverture`) → composantes 4-connexes d'aire ≥ `aireMin` → contour extérieur sur les **bords**
  des pixels (aire exacte) → Douglas-Peucker à `simplification`, ou contour affiné (réglage `affiner`, ci-dessous
  « Affiner les contours »). Réglages par défaut en pixels du plan (13 px,
  250 px², 1,5 px, trou 700 px²), utilisés seulement sans exemple mesuré ; `depuisMetres(r, pxParM)`.
- ⚠️ **Réglages déduits des exemples** (décision produit, après un essai sur deux vrais plans : 3 piliers sur une
  soixantaine). `mesurerExemple(bloc, x, y, { nature })` mesure la composante touchée à la pipette : couleur
  médiane, aire, épaisseur (2 × la distance au bord maximale, chanfrein 3-4), étalement (90e centile des ΔE sur
  l'INTÉRIEUR, à 2 px du bord : les pixels de bord, mêlés au contour noir par le flou, soudaient des piliers voisins),
  écart au fond (médiane du bord de la fenêtre lue), écart au cœur du pourtour (`ecartTrait` : 90e centile des
  anneaux à 1, 2 et 3 px) et à l'au-delà (`ecartAuDela` : anneaux à 5–7 px), `cerne` (pourtour ≥ ΔE 30 et 15 de
  plus que l'au-delà) ; `coupe` si elle dépasse la fenêtre. `reglagesDepuisExemples` : tolérance = étalement + 6,
  plancher 22, plafond 60 % de l'écart à ce qui TOUCHE l'exemple : le fond (un bleu clair est à ΔE 26 du blanc),
  sauf pilier clair cerné (ci-dessous) ; l'écart ENTRE exemples n'y entre pas (chaque pixel est comparé à l'exemple
  le plus proche) ; taille = plus petite épaisseur des exemples de masse non coupés. `reglagesPourTaille(t,
  pxParM?)` : ouverture t/2, aire t²/2, trou 0,6 t² ; plan calibré : aire jamais sous 10 × 10 cm, ouverture jamais
  au-delà de 60 cm (bornes, pas la règle).
- ⚠️ **Piliers clairs cernés** (plan au trait : piliers, galeries et fond blancs, le trait seul les sépare ; décision
  produit après un essai sur un plan réel au trait) : le plafond du fond y mettait la tolérance au niveau du bruit
  (fond lu blanc, ou gris moyen des traits) et les galeries se cassaient en morceaux pris pour des piliers. Un
  exemple `cerne` qui a la place d'englober l'au-delà (au-delà + 10 ≤ 60 % de l'écart au trait,
  `ktaDetection.js > _clairCerne`) prend une tolérance de 60 % de l'écart au CŒUR du trait (le plus faible des
  exemples : le trait le plus fin commande ; plafond 60 comme partout). 🩸 Les galeries étroites sont grisées en
  leur milieu par le flou : une tolérance qui n'englobe que le blanc les coupe aux passages étroits ; à 60 % du
  trait elles restent d'un seul tenant avec le fond, géantes, écartées par la taille maximale, et les piliers restent
  séparés par le cœur du trait. Un bleu clair cerné de bleu sur blanc (au-delà ΔE 26) n'a pas cette place : il garde
  le plafond du fond. Jamais pour un exemple de Front. Planche fabriquée (`check-detection.js`, 140 piliers blancs
  de 5 à 34 px, traits de 1 à 3 px, filigrane, flou, bruit) : 140 sur 140, 4 éclats du fond, tolérance 25 ; ancien
  plafond : tolérance 6, 22 morceaux de galerie. Limite : chiffres et lettres au trait ont des boucles blanches
  fermées, de la taille d'un petit pilier : elles sortent (14 sur la planche), à retirer dans l'aperçu.
- **Recalcul sans relecture** : `detecter({ executeur, garder: true })` fait garder les blocs lus par le worker
  (`executeurWorker`, sinon `executeurLocal` dans la page), au plus 200 Mo d'image ; `recalculer(executeur,
  { classes, reglages })` refait le calcul sur eux (curseurs de l'aperçu). Au-delà du budget, `recalculable` est
  faux et l'appelant relit.
- 🩸 **Pastille au centre d'un pilier étroit** : sans le comblement des petits trous, l'ouverture efface les bandes
  de part et d'autre et coupe le pilier en deux. Un contour creux plus grand que `trouMax` reste vide.
- 🩸 **Blocs avec marge** (`bloc` 2048, `marge` 256 px) : une masse est rendue par le bloc qui contient le coin
  haut-gauche de sa boîte ; celle qui touche le bord de la marge (pas le bord du plan) est signalée dans
  `tropGrands`, jamais coupée. La marge est lue au-delà du cadre demandé : une masse coupée par le cadre reste entière.
  « Bord du plan » = bord des `limites` (l'emprise) : une masse qui le touche est rendue telle quelle.
- **Worker** `js/ktaDetectionWorker.js` (`executeurWorker()`, CSP `worker-src 'self' blob:` déjà servie) : un bloc à
  la fois, tampon d'image transféré. Sans Worker, le calcul se fait dans la page, un bloc par tâche. Le même canal
  porte le suivi de trait de « Remplir au clic » sur un front (`suivreTrait`, ci-dessous). `fermer()` rejette
  (AbortError) un suivi en attente, jamais un bloc : le rejet tardif d'un bloc ferait échouer la détection relancée
  entre-temps sur le même parcours.
- **Fronts** (classe `nature: "trait"`) : 🩸 un trait a souvent la couleur d'un pilier, il ne concourt donc pas
  avec les masses pour un pixel : couleur du trait MOINS les masses **de sa couleur** (`_masseDuTrait` : composantes
  après ouverture, de toute taille, dont la moitié au moins des pixels est dans le masque du trait ; dilatées de
  `ecartMasse` 2 px), fermeture de 3 px, squelette Zhang-Suen, chemins entre bouts et carrefours (ergots < `ergot` 15 px et bruit <
  `longueurMin` 20 px retirés), Douglas-Peucker. 🩸 Chaque bloc découpe ses traits à son cœur (Liang-Barsky : un
  segment simplifié peut traverser le bloc de part en part, ses deux bouts dehors) ; `detecter` raccorde ensuite
  les morceaux bout à bout (même classe, bouts à moins de 2 px).
  ⚠️ (décision produit) Une masse d'une autre couleur ne retire rien d'un front ; un pilier de la couleur du front
  écarté par un curseur de taille reste retiré (sinon son squelette deviendrait un front). 🩸 Retirer toutes les masses
  effaçait les fronts fins d'une passe mixte (pilier clair cerné + front) : le fond et les galeries du blanc des
  piliers, écartés par la taille maximale mais dilatés quand même, mangeaient tout trait de 3 px bordé de blanc.
  ⚠️ (décision produit) **Le contour d'un pilier détecté n'est pas un front** : il marque la fin du pilier. Un chemin
  couché à 90 % au moins (`CERNE_PART`) dans le halo d'une masse GARDÉE (dilatée de `ecartMasse` + `TRAIT_FIN` + 1 px)
  est écarté. Les fronts varient donc avec les curseurs de taille, mais seulement par ces contours : un pilier écarté
  rend son cerne aux fronts ; les traits loin des piliers ne bougent pas.
- **Limites connues** : piliers collés fusionnés (retouche dans l'aperçu) ; petit contour creux (intérieur ≤
  `trouMax`) pris pour une masse ; un contour creux de la couleur d'un front sort comme un front fermé ; case
  « Retirer les bandes » cochée : un pilier d'épaisseur régulière plus de 4 × plus long qu'épais est pris pour une
  bande et sort en éclats (pilier cerné de 800 × 150 px : 4 éclats d'environ 60 px, à pleine et à mi-résolution ;
  entier jusqu'à 500 px de long), et le cou étroit d'une masse (épaisseur qui chute de plus de 30 %) fait un tronçon à
  part, effacé par disques : morsures rondes dans les deux bouts ; un pilier traversé par une bande peut sortir en
  deux morceaux.
- ⚠️ **Bandes** (décision produit) : une bande de galerie (ou un mur levé en trait) de la couleur des piliers, plus
  épaisse que l'ouverture, se soudait aux piliers qu'elle touche. Après l'ouverture, `_retirerBandes` examine les
  composantes ALLONGÉES ou PEU REMPLIES (les piliers compacts sont sautés : sur tout le bloc, le coût montait jusqu'à
  +146 %), chacune dans son cadre : distance au bord (chanfrein 3-4), squelette, branches découpées en TRONÇONS où
  l'épaisseur reste à 30 % de sa moyenne courante (une bande qui traverse un pilier donne une seule branche).
  Un tronçon d'écart-type < 20 % de sa moyenne et plus long que 4 × son épaisseur est un trait : effacé (disque de
  rayon = distance au bord). Un bout qui entre dans un pilier ou sort par le bord du bloc rend une épaisseur à la
  longueur (la transition est hors du tronçon) ; un bout libre ne rend rien. Option `bandes: false` : sans le
  critère. ⚠️ **Case « Retirer les bandes de la couleur des piliers »** (décision produit) : dans le bandeau, à
  l'étape des couleurs et dans l'aperçu (`detectionStructures.js > _bandesActif` → `reglages.bandes`), cochée par
  défaut (comportement des plans existants) ; décochée, piliers allongés et cous étroits restent entiers (ci-dessus,
  « Limites connues »). Ligne d'aide visible dans l'aperçu : « Décochez si vos galeries ne sont pas de la couleur des
  piliers. » Changer la case recalcule l'aperçu sur les blocs gardés, sans relire l'image. Retenue sur l'appareil
  pour tous les plans (`myktamap_detect_bandes_v1`, `"0"` = décochée), comme « Affiner les contours ». Le Générateur
  passe par le même parcours. Ni Remplir au clic, ni les galeries, ni le suivi d'un front ne passent par ce filtre ;
  les fronts d'une passe mixte en dépendent seulement par les masses retirées de leur couleur (`_masseDuTrait`).
  🩸 Remonté sur un plan aux galeries blanches : le filtre n'y a rien à retirer et ne fait que découper. Règle plus
  fine (n'effacer qu'un tronçon qui relie deux masses ou sort du bloc) : backlog `detect-bandes-fines`. Scène fabriquée : 54 piliers sur 54 sans curseur (37 sans le critère), aucune bande posée.
  Surcoût mesuré (iPhone émulé ×4) : +11 à +21 % sans bande, +50 à +76 % quand des bandes sont soudées.
- **Mesure** (iPhone 13 émulé, processeur ×4, plan fabriqué de 8 192 × 8 192 px, 2 916 piliers, 18/11/2026) :
  rectangle 2 048² ≈ 1,1 s ; 4 096² ≈ 3,4 s ; tout le plan ≈ 12 s en pleine résolution, ≈ 2,6 s à l'échelle 0,5 ;
  2 916 piliers sur 2 916. Fil principal : tâche la plus longue ≈ 180 ms en blocs de 2 048 (lecture du bloc), ≈ 85 ms
  en blocs de 1 024 (+30 % de temps). Sans worker : la page fige plusieurs secondes par bloc. Recalcul au curseur
  (blocs gardés, 19/11/2026) : ≈ 0,5 s pour 2 048², ≈ 1,7 s pour 4 096², ≈ 1,5 s pour tout le plan à mi-résolution.
- **Parcours** (`window.KtaDetectionUI`) : bandeau en bas d'écran (style des raccords). Exemples à la pipette
  (Masse A, Masse B, Front : chaque toucher MESURE la composante, fenêtre de 192 px autour du doigt, 640 si elle la
  dépasse ou la remplit ; 6 exemples au plus par classe ; réticule rouge de précision sur la carte pendant la
  pipette et le cadre, `body.kta-detect-pick-mode`, centre de la croix = pixel lu ; cette classe est un mode « clic
  carte » (`utils.js > _modeClicCarteActif`) : un toucher sur une structure, un tracé ou un POI déjà posés est un
  exemple ou un coin, jamais sa fiche ni un ajustement de sommets) → cadre par deux coins ou « Tout
  le plan » (au-delà de 4 096² px : mi-résolution, confirmé) → aperçu dans le pane `ktaDetection` (renderer SVG
  propre : la carte est en canvas, où l'aperçu ne serait ni touchable ni stylé) avec trois curseurs, **Tolérance de
  couleur**, **Taille minimale** et **Taille maximale**, partis des réglages déduits : un curseur relâché recalcule
  sur les blocs gardés (200 ms sans mouvement), sans relire l'image ; les valeurs sont gardées avec les couleurs du
  plan (même clé) jusqu'au prochain exemple → « Ajouter N ». Blocs de 1 024 px au doigt, 2 048 au pointeur fin.
  ⚠️ La tolérance affichée est celle RÉELLEMENT appliquée aux masses (Masse A, sinon B ; l'autre masse garde son
  écart déduit à elle), bornes 6–60 comme le moteur ; les fronts gardent la leur, hors curseur
  (`detectionStructures.js > _classes`). 🩸 Le curseur montrait le maximum des classes (celle d'un Front) pendant
  que les masses tournaient bien plus bas.
- 🩸 **Pipette** : la couleur de l'exemple est celle du pixel le plus « encré » du carré 5 × 5 sous le doigt (le
  plus loin du fond) et de ses semblables, et la composante part de ce pixel. La médiane du carré entier valait le
  fond sur un trait fin ou un coin de pilier touché un peu à côté : la pipette disait « aucune image » (trait de
  2 px : 2 touchers sur 2 ; pilier de 10 px : 12 sur 100). Carré entièrement de la couleur du fond : « c'est le fond »
  (avant : un exemple blanc ajouté en silence), SAUF si la zone claire touchée est enfermée (région à ΔE ≤ 12 du
  pixel le plus clair du carré qui ne touche pas le bord de la fenêtre : pilier blanc cerné sur plan blanc) : c'est
  alors un objet. « Aucune image » seulement si rien n'a été dessiné à cet endroit (plan V1 : zone jamais affichée).
- 🩸 **Petit pilier clair touché près de son trait** : le pixel le plus encré du carré est le trait, l'exemple prenait
  sa couleur (planche fabriquée : aire de quelques dizaines de px, taille minimale déduite 2 px). Si ce pixel
  appartient à un trait FIN (épaisseur ≤ 4 px), que le pixel le plus clair du carré est plus clair que lui (ΔE > 20)
  et que sa région claire est fermée, l'exemple est cette région ; seuil de la composante à mi-chemin de l'encre qui
  l'enferme (90e centile des ΔE à 1–3 px : la rangée de bord adoucie par le flou reste au pilier). Un pilier coloré
  plein (épais) touché un peu à côté reste l'exemple (coin de pilier, pastille claire au centre) ; un exemple de
  Front (`nature: "trait"`) n'est jamais redirigé. Planche fabriquée : 156 touchers au bord de 39 petits piliers,
  156 tailles justes (± 2 px) et aucun trait pris ; règle du seul pixel le plus encré : le trait pris 156 fois.
  Même chemin quand le pixel le plus encré est PLUS CLAIR que le fond lu (plan au trait serré : la médiane du bord
  de la fenêtre est un gris de traits) : le seuil tiré de l'écart au fond tombait sous le bruit, la composante
  n'était qu'un lambeau du pilier (pilier blanc de 16 px sur fond gris bruité : rien, désormais 256 px sur 256).
- **Taille maximale** : déduite du plus grand exemple de masse (× 4 en aire), plafonnée à la marge des blocs ; une
  masse plus grande est écartée et comptée à part (« écartés par la taille maximale », distinct de « trop grands pour
  un bloc »). Cas des plans aux piliers blancs ou clairs cernés d'un trait : fond et galeries, englobés par la
  tolérance (piliers clairs cernés, plus haut), forment des masses géantes, écartées ; les piliers, séparés par le
  trait, restent. 🩸 Seuls les trous
  COMPACTS sont comblés (plus du tiers de leur boîte) : le trait qui cerne un pilier est un « trou » en anneau dans le
  masque du fond, le combler soudait le pilier au fond (scène fabriquée : 26 piliers sur 45 au lieu de 45).
- **Lecture de l'image** : `tiling.js > ktaDessinerRegionPlan` (seul appelant : ce parcours). Niveau ≠ 0 : ses
  calques image AFFICHÉS sur la carte (calés comme sur la carte), rien d'autre. Niveau 0 (ou plan sans
  multi-niveau) : tuiles V2 (servies, ZIP, plan ☁️ déchiffré), sinon images du fond déjà chargées (plan direct, V1) ;
  les calques du niveau 0 sont des surcouches, jamais lus. L'opacité réglée d'un calque ne compte pas (image pleine).
  ⚠️ (décision produit) **Refus plutôt que l'image d'un autre niveau** : un niveau ≠ 0 sans calque image rend
  `{ ok: false, raison: "niveau-sans-image" }`, un niveau dont tous les calques sont retirés de la carte (case des
  filtres ≡ décochée, niveau masqué) `{ raison: "calques-masques" }`, sans rien dessiner ; `_lireBloc` lève alors
  une erreur `KtaDetectionRefus` et la pipette comme le calcul s'arrêtent sur un toast (`detect.refus.<raison>`),
  sans aperçu. 🩸 L'ancien repli sur l'image du niveau 0 recopiait ses piliers au niveau actif sans rien dire. Un
  calque masqué parmi d'autres n'est simplement pas lu. `vue3d.js > _dessinerPlanSol` garde son aiguillage, avec
  repli sur le plan de base (décision produit de la 3D). Checkup : `scripts/smoke/checkup-detection-niveau.js`.
- **Remplir au clic** (pot de peinture, décisions de KARMA du 21/11 et du 23/11/2026) : un MODE du même bandeau
  (bouton « Remplir au clic » de l'étape des exemples), pas un outil à part. ⚠️ Le geste suit le **type choisi**
  (décision produit, sans bouton à part) : type à contour FERMÉ (pilier, mur…) → chaque toucher remplit la zone du
  fond fermée par le trait autour du doigt ; type EN LIGNE (front, mur en ligne, arc) → chaque toucher SUR le trait le
  suit (§ Front de taille ci-dessous). Le mode reste actif, les objets s'ajoutent à l'aperçu, puis un seul « Ajouter
  N » les pose tous en UNE étape ⏪ (`_poserEtFermer`, un seul `ctx.poser`, le même chemin que la détection).
  Types : liste en deux groupes, « Remplir une forme fermée » et « Suivre un trait » (`_typesRemplir` : intégrés et
  types personnalisés de la légende, géométrie lue par `isStructurePolylineType` ; jamais un type posé d'un clic à
  taille fixe, `ktaPoseUnClic` : pilier à bras), celui armé dans Structures par défaut ; niveau par
  `ktaNiveauNouvelleStructure`. Zones et fronts se mêlent dans un même aperçu : « Ajouter » pose les zones au dernier
  type fermé choisi et les fronts au dernier type en ligne choisi (`_choisirTypeRemplir`), chacun au niveau de son
  type. Doublons : une zone qui recouvre une structure du même niveau (ou une zone déjà dans l'aperçu) n'est pas
  ajoutée ; revérifié à « Ajouter » au niveau du type final.
  - **Front de taille : suivre le trait** (décisions de KARMA du 23/11/2026) : un toucher SUR le trait le suit dans
    les deux sens jusqu'à ses bouts ou au **premier carrefour** (là où un autre trait le croise), jamais au-delà ;
    un toucher plus loin prolonge, et le bout du nouveau morceau s'accroche EXACTEMENT sur le sommet (sinon le
    segment) du front posé ou de l'aperçu, qui n'est jamais modifié (comme les galeries : rond de raccord dans
    l'aperçu). Ce qui double un front du même niveau (posé ou dans l'aperçu) est coupé ; un front tout entier déjà là
    est refusé (« déjà posé ») ; revérifié à « Ajouter » (`ECART_TRAIT`, 3 px). 🩸 Contournement d'avant (« Détecter
    les galeries » en Remplir sur le front, puis conversion en front) : des carrefours parasites à corriger ; ici le
    carrefour arrête le suivi par construction.
  - Moteur `ktaDetection.js > suivreTrait(bloc, x, y, o)` (pur, testé en Node) : fond = médiane d'un anneau à 12 px
    du doigt (élargi tant qu'il a la couleur du pixel touché : un pilier plein touché en son cœur) ; encre = pixel le
    plus loin du fond à ± 3 px du doigt ; masque = couleur de l'encre à la tolérance près (moitié de l'écart au fond,
    plancher ΔE 20), fermé de 1 px. Avant le squelette (Zhang-Suen, celui de la détection auto), sur la seule
    composante touchée : ⚠️ **masses** de la couleur du trait retirées (ouverture d'un carré plus large que le trait
    touché, dilatée de 1 px) : un front qui touche un pilier plein s'arrête à son bord ; ⚠️ **traits fins** retirés
    (pixels du squelette où le trait fait au plus la moitié de son épaisseur médiane autour du doigt) : un trait de
    rappel fin en travers ne fait pas de carrefour. Puis le graphe des galeries (`_graphe`, `_elaguer` : ergots plus
    courts que l'épaisseur ; `_fusionnerNoeuds` : un X du squelette = deux nœuds voisins), l'arête la plus proche du
    doigt, et `reseauGaleries` pour les doublons, l'accroche et la simplification (1 px). « Affiner les contours » :
    `_affinerLigne` (moyenne glissante de demi-fenêtre la tolérance en mètres, simplification à sa moitié, coins
    vifs) ; un bout au carrefour ne bouge jamais (raccord exact), un bout libre est ramené sur la droite de son
    extrémité. Refus : « fond » (toucher sur le fond), « masse » (masse pleine, ou trait plus court que 3 × son
    épaisseur), « deja ». Fenêtre lue (`_suivreEn`) : 512, puis 2 048, puis 4 096 px tant qu'un bout s'arrête au bord
    de la fenêtre (à moins de 3 px plus la demi-épaisseur du trait : 🩸 le squelette d'un trait coupé par le bord
    recule d'autant, un front de 4 px finissait à 3,5 px du bord et n'était jamais relu plus grand) ; au-delà, le
    front s'arrête au bord lu (toast : un toucher plus loin le prolonge et raccorde), jamais de lecture à résolution
    réduite (le trait aminci passerait sous le seuil des traits fins).
  - **Hors du fil principal** : le suivi tourne dans le worker de la détection (`executeurWorker().suivreTrait`,
    tampon transféré ; repli `executeurLocal()` dans la page sans Worker), créé au premier toucher et gardé jusqu'au
    changement de mode ou à la fermeture (`_e.ex`). Un long front dans un réseau dense lit 4 096 px : sur le fil
    principal, ~2 s de calcul en deux tâches longues ; dans le worker, aucune. Un résultat arrivé après un changement
    de mode ou d'aperçu est ignoré.
  - Limites : un trait en travers aussi épais que le front est un vrai carrefour ; un front aminci de plus de moitié
    (trait abîmé) est coupé là ; un trait de rappel de 1 px sur un front de 2 px ne se distingue pas (carrefour).
  - Garde-fous : `check-detection.js` (planche : front droit, coudé, carrefours en T et en X, front qui touche un
    pilier plein, trait de rappel de 1 px en travers, bruit ± 8 ; raccord exact au toucher suivant, existant jamais
    modifié, doublon refusé ; affiner sur un bord dentelé ; échelle 0,5 ; contre-épreuves sans retrait des masses,
    sans filtre des traits fins, sans existant ; front coupé par le bord du bloc → bout « bord » ; même résultat dans
    le worker et par `executeurLocal` qu'en direct, `fermer()` rejette un suivi en attente) ·
    `scripts/smoke/checkup-remplir-front.js` (un toucher pose un front, arrêt au carrefour, raccord exact au 2e
    toucher, retirer par toucher, Ctrl+Z et « Retirer le dernier », Valider, doublon refusé, type pilier inchangé ;
    long front dans un réseau dense suivi d'un bout à l'autre sans tâche longue de plus de 200 ms ; Chromium et
    WebKit, tâches longues mesurées sous Chromium).
  - **Retirer un remplissage** (structures comme galeries, décisions de KARMA du 22/11/2026) : toucher DANS une forme
    remplie ou SUR un front suivi (à moins de 14 px d'écran ou de sa demi-épaisseur), **Ctrl+Z** (Cmd+Z) ou le
    bouton **Retirer le dernier** (`undo-2`, désactivé à vide). Le remplissage
    QUITTE l'aperçu (pas d'état « retiré » à remettre : le retoucher au même endroit le refait) ; Ctrl+Z et le bouton
    dépilent le plus récent, un par un. Ligne d'aide sous le texte du mode ; sa moitié « Ctrl+Z retire la dernière »
    seulement avec un pointeur fin (`(any-pointer: fine)`). `_retirerAuToucher`, `_retirerDernier`.
  - 🩸 Le toucher est reconnu par `_onClic`, pas par la forme : en Remplir la visée (`body.kta-detect-pick-mode`)
    rend `_modeClicCarteActif()` vrai, et `map.js > _ktaPickCaptureClick` avale alors tout clic sur la carte en
    capture pour le ré-émettre à la carte. Un écouteur posé sur la forme ne recevrait rien, et le toucher relancerait
    un remplissage refusé (« déjà dans l'aperçu »). Les formes de Remplir sont donc non interactives ; le même code sert
    la carte du plan et celle du Générateur (qui n'a pas ce ré-émetteur).
  - ⚠️ **Un seul mode de clic à la fois** (décision de KARMA du 23/11/2026) : sur la carte du plan, la visée de la
    fenêtre (pipette, cadre, Remplir, structures comme galeries) est inscrite au registre des modes clic-carte
    (`interface.js > ktaInscrireModeClic`, nom `detection`, retirée par `ktaRetirerModeClic` quand elle s'éteint).
    Armer un outil (tracé, zone, structure, point, mesure, recalage…) passe par `_desactiverTousLesModes`, qui la met
    en pause (`_mettreEnPause`) : pipette lâchée ; cadre et Remplir en pause (`etat().pause`), visée et
    `body.kta-detect-pick-mode` retirées, fenêtre ouverte, coins, remplissages et aperçu gardés, `_onClic` muet. Le
    bandeau le dit et propose la reprise (« Remplir au clic », ou « Reprendre le cadre ») ; viser de nouveau (reprise,
    pipette, « Remplir au clic », cadre) désarme l'outil en cours (`_majModeClic` → `_desactiverTousLesModes`). Même
    mécanisme que les outils entre eux, aucun cas particulier dans `road.js` / `structures.js`. Le Générateur (sa propre
    carte) n'inscrit rien. 🩸 Une modale ouverte sur la carte (`ktaCouperModesOutils`) et l'Échap de la carte passent
    par le même registre : elles mettent aussi la visée en pause. Checkup : `checkup-remplir-exclusif.js`.
  - ⚠️ Clavier : tant que la fenêtre est ouverte, son écouteur en capture sur `document` (`_onKey`) prend Ctrl+Z,
    Ctrl+Y et Ctrl+Maj+Z, avant celui de `historyManager.js` (bulle) : jamais d'annulation globale sous la fenêtre
    (sans lui, Ctrl+Z défaisait le « Valider » précédent). Champ de saisie : annulation native. Fenêtre fermée :
    Ctrl+Z revient à l'historique. ⚠️ **Visée en pause avec un outil armé** (`etat().pause` et
    `interface.js > ktaOutilArme()`) : les trois raccourcis ne sont plus captés, ils vont à l'outil
    (`historyManager.js` annule le dernier sommet du tracé en cours) et les remplissages restent. 🩸 En pause SANS
    outil (modale ouverte sur la carte, Échap de la carte) la fenêtre les garde. Checkup : `checkup-remplir-exclusif.js`.
  - Moteur `ktaDetection.js > remplir(bloc, x, y, o)` (pur, testé en Node) : trait = tout pixel à plus de ΔE 20 de
    la couleur sous le doigt (médiane du carré 5 × 5) ; ⚠️ **fermeture** du masque du trait (carré de rayon 1 :
    dilatation puis érosion) avant le remplissage : un trou de 1 à 2 px est bouché, un trou de 3 px et plus reste
    ouvert ; ⚠️ **en repli** (décision produit) : si la fermeture avale le point touché (pilier large de 2 à 3 px, ou
    grisé par le flou) et qu'il est du côté clair de son voisinage (L* au moins à mi-chemin du plus sombre et du
    plus clair à ± 3 px, `_coteClair`), on recommence sans fermeture (`repli: false` : contre-épreuve). 🩸 Cette
    condition empêche de remplir un morceau du trait depuis un pixel sombre (toucher sur le trait, ou au bord d'un
    petit pilier flou : il faut toucher son centre clair).
    Composante 4-connexe du fond fermé, étendue jusqu'au **milieu du trait** → contour extérieur
    (`_contour`, puis `_affiner` si la case « Affiner les contours » est cochée, sinon `_simplifierFerme` à 1 px) ;
    un chiffre ou une pastille dedans est englobé.
  - ⚠️ **Milieu du trait** (décision produit) : le trait fait partie du pilier, c'est lui qui en marque la fin.
    `_jusquAuMilieu` donne à la zone les pixels du trait plus proches d'elle que de l'autre côté du trait (distances
    de chanfrein 3-4 dans le trait, égalité à la zone), à au plus 6 px d'elle (`demiTrait`) ; deux piliers séparés
    par un même trait se le partagent en son milieu. 🩸 Sans autre côté à moins de 12 px (pilier plein coloré sur
    fond uni, où tout le fond est « trait » ; aplat noir épais), rien n'est gagné : la zone garderait sinon 6 px de
    fond autour. Un pilier plein se remplit donc à son propre bord. La détection automatique (piliers et fronts)
    garde son contour, inchangé.
  - ⚠️ **Refus** (décision produit), jamais une zone partielle : zone qui touche le bord de la fenêtre lue ou de
    l'emprise (« Contour ouvert (ou plus grand que la zone lue) : tracez-le à la main. »), zone au-delà du plafond
    (« trop grande pour une structure »), toucher sur le trait. Fenêtre lue : 384 px autour du doigt, puis, si la
    zone touche son bord, une grande fenêtre de max(1 024, 2 × côté du plafond + 64) px : pleine résolution jusqu'à
    4 096 px (`FENETRE_REMPLIR_MAX`), au-delà lue à résolution réduite (jamais plus de 4 096² px lus : mémoire du
    téléphone).
    ⚠️ **Plafond** (`ktaDetection.js > plafondRemplir(pxParM, image)`, décisions de KARMA du 21/11 et du 23/11/2026) :
    plan à échelle connue (`ctx.pxParM()`, échelle écrite dans le plan) → **80 m de côté** (boîte de la zone) **et
    6 400 m²** ; sans échelle → aire d'un carré de côté **max(1 024 px, le quart du petit côté de l'image)**, sans
    côté maximal (`REMPLIR.plafondPxMin`, `plafondFraction`). Le plafond doit laisser passer les gros massifs (40 m et
    512² px refusaient trop souvent « trop grande ») ; le refus reste au-delà, et une zone ouverte ou qui sort de la
    fenêtre est toujours refusée « contour ouvert », jamais une zone partielle. Une galerie fermée plus longue que
    80 m sort par son côté. 🩸 Sans échelle, seule l'aire borne : une galerie fermée plus courte que le carré passe
    (sur une petite image, elle passait déjà à 512 px). Mesures (`checkup-remplir-plafond.js`, poste de dev) : massif
    de 79 m à 10 px/m (fenêtre de 1 664 px) ≈ 0,35 s, 1,7 s processeur ralenti × 4 ; 900 px sans échelle (fenêtre de
    2 112 px) ≈ 0,45 s. Lecture et refus de niveau : ceux de la pipette (`_lireBloc`).
  - Garde-fous : `check-detection.js` (milieu du trait à 1 px près, côtés obliques compris, coins aigus à 1,5 px ;
    trait partagé ; trous de 1 et 2 px bouchés, 3 et 4 px refusés ; bords, plafond ; contre-épreuve sans fermeture ;
    pilier flou de 2 à 3 px rempli par le repli, contre-épreuve sans repli ; plafond de 80 m et relatif à l'image ;
    massifs fictifs de 60 m et de 900 px remplis, de 90 m refusé ; galerie fermée de 100 m refusée à échelle connue,
    galerie ouverte refusée ; structure de 30 × 25 m acceptée) · `scripts/smoke/checkup-remplir.js` ·
    `scripts/smoke/checkup-remplir-plafond.js` (mêmes cas dans l'app, temps mesurés).
- ⚠️ **Affiner les contours** (décisions de KARMA du 21/11/2026) : sur un plan de mauvaise qualité, le trait
  irrégulier donnait des piliers « en dent de scie », une forme qui n'existe pas (le Douglas-Peucker à 1 ou 1,5 px
  garde ce bruit). Case **Affiner les contours** du bandeau (exemples, Remplir au clic, aperçu), **cochée par
  défaut**, retenue sur l'appareil pour tous les plans (`myktamap_detect_affiner_v1`, `"0"` = décochée ; clé globale
  hors de la liste exportée du profil). Elle vaut pour Remplir au clic et la détection automatique, donc aussi
  dans le Générateur (même parcours, `ctx.pxParM` du Générateur) ; changée sur l'aperçu, elle le recalcule ; les
  zones déjà dans l'aperçu de Remplir restent telles quelles. Décochée : le contour d'avant, à l'identique.
  - Moteur `ktaDetection.js > _affiner(contour, tol, eps)` (option `affiner` de `remplir`, réglage `affiner` de
    `detecter`/`recalculer`, en px du plan ; absente ou nulle : `_simplifierFerme`). Tolérance
    `toleranceAffinage(pxParM)` = **0,25 m** × l'échelle (`AFFINER.toleranceM`), **2 px** sans échelle
    (`AFFINER.repliPx`), bornée à √aire / 6 (un petit pilier n'est pas lissé en galet). Étapes : contour
    rééchantillonné au pas de 1 px, moyenne glissante circulaire (2 passes, demi-fenêtre = tolérance) ; puis
    ⚠️ **redressement seulement si la forme est presque un rectangle** : orientation dominante (angles des côtés × 4,
    pondérés par leur longueur : un rectangle tourné garde son orientation), rectangle des côtés MÉDIANS ; forme
    lissée d'aire ≥ 0,96 × ce rectangle et à moins de max(1,5 px, 0,9 × tolérance) de lui → ses 4 coins. Sinon
    Douglas-Peucker à max(`eps`, tolérance / 2) puis coins rendus vifs (`_coinsVifs` : chaque côté remplacé par la
    droite ajustée sur sa partie centrale, sommet = intersection des voisines ; `_nettoyer` : sommet presque aligné
    retiré, coin coupé entre deux côtés longs refait). Un pilier rond ou irrégulier garde sa forme, lissée.
  - Mesures (40 planches bruitées de ± 2 px à 20 px/m, tolérance 5 px) : carré et rectangle tourné de 20° redressés
    40 fois sur 40 (rapport ≥ 0,98, écart ≤ 0,87 × tolérance) ; rond (Ø 24 et 80 px), pentagone, L jamais redressés
    (rond : rapport ≤ 0,95) ; trapèze aux côtés de 7° redressé 1 fois sur 40 (à 0,3 m : 19 sur 40, d'où 0,25 m).
    Relevé réel au trait flou (≈ 4 px/m, tolérance ≈ 1 px) : marches d'escalier gommées, décrochements gardés,
    petits piliers presque carrés redressés ; à 0,75 m, de vrais décrochements disparaissaient.
    🩸 Limite : sous ~25 px de côté, un bruit de ± 2 px rend carré et rond indiscernables ; le petit pilier carré
    n'est alors pas toujours redressé (lissé seulement), un rond ne l'est jamais.
  - Garde-fous : `check-detection.js` (carré bruité → rectangle aux angles droits à 2 px, rectangle tourné, rond,
    petit rond, pentagone, trapèze, L ; détection et recalcul ; contre-épreuves sans l'option, empreintes du contour
    d'avant) · `scripts/smoke/checkup-affiner-contours.js` (case cochée par défaut, retenue, effet sur Remplir).
- ⚠️ **Un seul détecteur ouvert** (décision de KARMA du 23/11/2026) : ouvrir « Détecter » (structures) ferme
  « Détecter les galeries », et l'inverse, comme un outil en désarme un autre (`detectionStructures.js > ouvrir`).
  Le détecteur fermé passe par `fermer()`, le chemin d'Échap et de la croix : aperçu non validé jeté sans
  confirmation, rien écrit ; ce qui a été validé reste. Le même détecteur (même cible, même carte) rouvert reste tel
  quel, aperçu compris. Au Générateur, `fermer()` rend aussi la fenêtre du premier (`ctx.sortir`). Checkup :
  `checkup-detecteur-unique.js`.
- ⚠️ **Rien n'est écrit avant « Valider »**, puis UNE étape ⏪. Types choisis dans l'aperçu (A → pilier-1, B →
  pilier-2, Front → front-1 par défaut ; front-2 au choix) ; niveau par `structures.js > ktaNiveauNouvelleStructure` (règle du tracé à la main :
  pilier-2 au −1). uid et updatedAt par KtaUid ; la synchro pro suit comme pour tout ajout. Le pilier à bras
  (`pilier-bras`, posé d'un clic) n'est jamais proposé : la liste `detectionStructures.js > TYPES` est fermée.
- **Doublons** : une masse qui recouvre une structure du même niveau (session ou calque), un front dont tous les
  sommets et milieux sont à moins de 3 px d'un front existant du même niveau : écartés et comptés « déjà présents ».
  Relancer ne double rien. Posées mais masquées (niveau non affiché, filtre) : dit au bilan.
- **Couleurs par plan** sur l'appareil : `myktamap_detect_couleurs_v1_<plan>` (classes `a`, `b`, `f`, et `g` des
  galeries), jamais dans la session ni dans
  l'export du profil (exclues dans `profileExportImport.js`), retirées avec le plan (`purgeAssociatedData`).
- Vue tournée : redressée et rotation bloquée pendant le parcours (`MapBearing.suspend("detection")`). Plan quitté :
  parcours fermé (`main.js > _libererRessourcesPlanPrecedent`). Lecture seule : refusé (`ktaEditionRefusee`).
- Garde-fous : `scripts/check-detection.js` (moteur, pre-commit) · `scripts/smoke/checkup-detection.js` (parcours) ·
  `scripts/smoke/checkup-remplir.js` (Remplir au clic) · `scripts/smoke/checkup-remplir-front.js` (Remplir sur un
  front : suivi du trait, arrêt au carrefour, raccord exact) · `scripts/smoke/checkup-remplir-annuler.js` (retirer un
  remplissage au toucher, par Ctrl+Z ou « Retirer le dernier », structures et galeries, historique global intact) ·
  `scripts/smoke/checkup-remplir-exclusif.js` (un seul mode de clic entre la fenêtre et les outils de la carte) ·
  `scripts/smoke/checkup-detecteur-unique.js` (ouvrir un détecteur ferme l'autre, plan et Générateur) ·
  `scripts/smoke/checkup-affiner-contours.js` (case Affiner
  les contours) · `scripts/smoke/checkup-detection-emprise.js` (calque du
  niveau −1 plus grand que l'image : Remplir sur le débord, « Tout le plan » sur tout le calque, pilier à cheval sur
  le bord de l'image entier, niveau 0 inchangé ; Chromium et WebKit).

### Détecter les galeries → tracés

Décisions de KARMA du 22/11/2026 (leçons d'un essai privé où l'auteur avait dû retoucher ~15 % des tracés tirés d'un
squelette) : compléter un plan à moitié tracé, en tracés routables, sans doublon.

- ⚠️ **Fenêtre à part** (décision produit) : `KtaDetectionUI.ouvrir(ctx, { cible: "traces" })`, ouverte depuis
  l'outil Tracés, la carte « Détecter les galeries » de l'📊 Éditeur de données et le Générateur. Titre et aide à
  elle ; elle ne propose que la galerie (pipette, classe `g`), Remplir au clic, le cadre, « Tout le plan », deux
  réglages et le type de tracé (principal par défaut, ou le type armé dans Tracés ; secondaire, chemin, types
  personnalisés ; jamais la jonction ni l'itinéraire). La fenêtre des structures ne propose jamais les galeries.
  Le contexte ajoute `niveauTrace()`, `tracesExistants()` et `poserTraces(tracés)` (mode plan : une étape ⏪ de
  catégorie `roads` puis `setRoads`, comme `_poserSession` pour les structures ; `road.js` n'est pas touché).
- **Deux sources, un moteur** (`ktaDetection.js`) :
  - pipette sur la COULEUR de la galerie (galeries grisées entre des murs noirs) : `detecter` avec le réglage
    `galerie` → `_galeriesBloc` (masque de la couleur, bouché, obstacles percés, squelette Zhang-Suen, rayon inscrit
    à chaque sommet), axes bruts découpés au cœur de chaque bloc et gardés par la page ;
  - REMPLIR AU CLIC dans une galerie blanche entre deux murs (couleur du fond) : `remplirGalerie`, le remplissage
    de `remplir` (`_murs`, `_inonder`) sans plafond de taille, jusqu'aux murs, puis le même squelette. La page
    agrandit la fenêtre lue (768, 2 048 px, puis toute l'emprise, à résolution réduite au-delà de 4 096 px) ; refus
    « ouvert » seulement si la zone touche encore le bord de l'emprise ; refus « large » quand la largeur médiane
    de la zone dépasse 8 m (80 px sans échelle) : 🩸 sur un plan dans un cadre, toucher le fond entre le plan et le
    cadre remplissait tout le fond, galeries ouvertes comprises (essai sur un relevé réel au trait). Un trait fin qui
    coupe TOUTE la galerie
    (trait de rappel d'un mur à l'autre) est rouvert (`_rouvrirCoupures`) : pixels du trait à moins de 4 px à la
    fois de la zone remplie et d'une zone libre FERMÉE, composante plus courte que 3 × la largeur de la galerie,
    gardée si le nouveau remplissage reste fermé. 🩸 Un mur entre la galerie et le fond extérieur n'est jamais
    candidat (le fond touche le bord) ; un mur fin entre deux galeries parallèles l'est, mais il est long.
- ⚠️ **Bouchage avant le calcul** (`_boucher`, décision produit) : trous compacts plus petits que (0,6 × la largeur)²
  (lettres, points de repère), puis fermeture de 2 px dont on ne garde que les ajouts plus courts que 4 × la
  largeur (traits de rappel, encoches). 🩸 Sans lui, la galerie était coupée puis recousue « en étoile » ; une
  fermeture sans la règle de longueur soudait deux galeries séparées par un mur fin. Un pilier dessiné plus large
  que 0,6 × la galerie reste un trou : le tracé le contourne.
- ⚠️ **Structures posées = obstacles** (`_percerObstacles`, 1,5 px de marge) : contours fermés et murs en ligne du
  niveau visé, percés dans le masque avant le squelette ; la simplification garde un sommet plutôt que de couper un
  obstacle. Les fronts et les arcs ne comptent pas.
- **Réseau** (`reseauGaleries(axes, { simplification, brancheMin, doublon, existants, obstacles })`, pur, dans la
  page : un réglage bougé recalcule sans relire l'image) : graphe (bouts à 2,5 px confondus : raccord des blocs) →
  ergots retirés (bout libre plus court que la branche minimale ou que 2 × le rayon du carrefour : il ne sort pas de
  la largeur de la galerie ; du plus court au plus long, degrés relus) → carrefours reliés par une arête plus courte
  que la somme de leurs rayons fusionnés, sans s'éloigner de plus du plus grand rayon de leur place d'origine (🩸
  fusionnées de proche en proche, les grappes d'une zone bruitée dérivaient et partaient en étoile à travers les
  murs) → petites boucles sans obstacle (aire < (2 × branche minimale)²) retirées →
  enchaînement : degré 2, et à travers un carrefour sur l'arête la plus droite (déviation ≤ 35°), pour UN tracé
  long par galerie ; les autres galeries finissent sur son sommet (sommet fixe, jamais simplifié) → doublons →
  accroche → Douglas-Peucker entre sommets fixes. Branches plus courtes que la branche minimale retirées.
- **Deux réglages visibles** (décision produit) : simplification (0,5 m par défaut) et branche minimale (1,5 m), en
  mètres à l'échelle du plan, en px sans échelle (3 et 15 px ; `reglagesGaleries`).
- ⚠️ **Réseau existant jamais modifié** (décision produit) : tracés du même niveau (session et calques, masqués
  compris ; jonction : l'un de ses niveaux ; jamais l'itinéraire). Toute partie à moins de 6 px d'un tracé existant
  est coupée (« déjà tracées » au bilan). Un bout à portée (max(9 px, rayon de la galerie + 6 px)) se pose
  EXACTEMENT sur le sommet existant le plus proche, sinon exactement sur le segment (pied de T, relié par
  l'itinéraire à distance nulle : § Enrichissement de `multilevel-pathfinding.md`) ; le point n'est jamais arrondi.
  ⚠️ L'outil ne pose AUCUN sommet sur un croisement : seuls les bouts s'accrochent (l'itinéraire, lui, relie un
  croisement strict de deux segments).
- **Aperçu** : une polyligne par tracé (`.kta-detect-galerie`), un rond aux bouts raccordés (`.kta-detect-accroche`) ;
  après un cadre ou « Tout le plan », un toucher retire ou remet un tracé, gardé retiré d'un réglage à l'autre (clé :
  ses bouts à 2 px près). Remplir s'ajoute à l'aperçu toucher après toucher (`_e.remplisG` : les axes de chaque
  toucher) ; un toucher dans une galerie déjà remplie (rayon de ses axes, au moins 14 px d'écran autour de l'axe) la
  retire tout entière, comme Ctrl+Z et « Retirer le dernier » (§ Remplir au clic).
- **Hors de l'outil** (pistes dans `docs/IDEES.md`) : passage hachuré en liaison, croisements de niveaux, largeur des
  galeries.
- Garde-fous : `check-detection.js` (planche `scripts/smoke/scene-galeries.js` : galeries grises et blanches, texte
  et traits de rappel en travers, pilier posé, tracé existant ; réseau connexe, zéro étoile, zéro doublon, pilier
  contourné, accroche exacte ; contre-épreuves sans bouchage, sans obstacle, sans existant) ·
  `scripts/smoke/checkup-galeries.js` (fenêtres distinctes, aperçu, réglages, Valider en une étape ⏪, Éditeur de
  données et Remplir ; Chromium et WebKit) · `checkup-detection-generateur.js` (calque « Tracés détectés »).
