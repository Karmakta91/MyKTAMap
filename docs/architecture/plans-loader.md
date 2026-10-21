# Architecture MyKTAMap — Plans : registre, loader, générateur

> Référence détaillée extraite de l'ancien CLAUDE.md. Lue à la demande (pas auto-chargée).
> Sections : §3, §33, §39, §58

---

### 3. Multi-plans (depuis 06/05/2026)

- **`planRegistry.js`** gère la liste des plans connus.
- **localStorage** : `myktamap_plans` (registre + lastPlanId)
- **IndexedDB** : `myktamap_handles` (v2, 2 stores : `handles` pour FS Access API, `blobs` pour ZIPs mémorisés)
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
  4. 🆘 **Dépannage** : un seul bouton, qui ouvre la fenêtre `#kta-depannage-modal` rangeant du plus doux au plus radical 🔄 Force update douce → 🆘 Kill SW → 💥 Tout réinitialiser (+ l'adresse de `killsw.html`)
- `🏗️ Générer un plan` reste directement visible dans la home (action de **création**, pas un réglage)
- `📥 Conf exemple` déplacé en icône dans le modal du Générateur (section "📂 Charger un ZIP existant")

**Symétriquement, retiré de la modale ⚙️ Réglages in-app (map mode)** *(suite KARMA)* :
- Bouton `🗑️ Réinitialiser` retiré de `kta-cfg-actions-bar` (interface.js)
- Le reset complet n'est désormais accessible que depuis la modale ⚙️ Configuration du loader (home)
- Raison : limiter les déclenchements accidentels une fois un plan chargé (user perd potentiellement session active + plans mémorisés en 2 clics)
- Pour reset depuis la map : 🗂️ titre cliquable → home → ⚙️ Configuration → 🆘 Dépannage → 💥 Tout réinitialiser
- Conséquence CSS : `.kta-cfg-actions-bar` passe de `grid-template-columns: 1fr 1fr 1fr 1fr` (4 cols PC) / `1fr 1fr` (2 cols mobile) à `1fr 1fr 1fr` partout (3 boutons : Reset / Appliquer / 🐛 Logs)

#### 39.2 Force update douce — `window.mettreAJourCodeSeul()`

Bouton 🔄 de la fenêtre ⚙️ Configuration → 🆘 Dépannage. Réutilise le pipeline `mettreAJourCodeSeul` existant (utilisé par le badge version cliquable depuis v1.5.x).

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

Fonctions `_renderMultiLevelSection` / `_bindMultiLevelToggle` (interface.js) restent définies en **dead code propre** avec commentaire explicatif. Si retour terrain demande à ré-exposer le toggle (cas marginal), il suffit de re-appeler les 2 fonctions dans `afficherConfig`.

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
| Row `pl_collision` (intra Images) | Champ inline |
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
| Pixels | LZW (prédicteur horizontal géré), Deflate, non compressé — puis ré-encodage PNG par le canvas |

**Pourquoi aucune bibliothèque vendorée** (`geotiff.js` ≈ 300 Ko) : mesuré sur un corpus réel de 39 plans de carrières calés sous QGIS — LZW ×30 / aucune ×9, RVB 8/8/8 ×39, bandes ×39 (aucune tuilée), `PlanarConfig` 1 ×39, prédicteur 1 ×39, `Scale+Tiepoint` ×39, 2,2 Mpx au maximum. On lit ce sous-ensemble et **on refuse le reste en le nommant** : 33 raisons distinctes (`tiff.err.*`), chacune disant quoi réexporter.

**Le calage se déduit exactement** : `Scale + Tiepoint` décrit une image nord en haut **sans rotation** — deux coins opposés la décrivent entièrement, ce qui est précisément ce que consomme `plan.georef` (similitude 2 points de `KmzExport.buildTransform`). Aucun `pointC` affine nécessaire, aucune approximation introduite. Un calage porteur d'une rotation est **refusé**, pas approché.

**Reprojection** : `window.SigImport.L93` (Lambert 93) et `window.SigImport.WEBMERC` (Web Mercator, ajouté en v1.93.0 — 7 plans du corpus sortent en EPSG:3857, QGIS l'impose dès qu'on cale sur un fond de tuiles). ⚠️ **Aucune copie locale de ces maths** : une seule implémentation par projection dans le projet, verrouillée par son garde-fou.

**Intégration** : `.tif/.tiff` explicites dans les `accept` (le type `image/*` seul ne les propose pas de façon fiable selon l'OS) ; le PNG converti est **ré-injecté dans le même input** via `DataTransfer`, donc `_lireImageDimensions`, le tuilage V2 et le ZIP reprennent **sans rien savoir du TIFF**.

**Réseau** : nul. Lecture `FileReader` → `ArrayBuffer`, décodage en mémoire, encodage canvas. Aucun octet ne sort, aucune bibliothèque chargée.

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
| 3. Générateur | `ktaGenerateurMaj({ zip, calques, legende, onZip })` : ZIP actuel du plan (copie gardée, sinon l'extension, sinon `plan.zip` de l'index ; plan du site en dossier → le Générateur demande qu'on dépose le ZIP), mode Modifier, chaque calque posé sur SA ligne (`item._ktaFichierMaj`, ligne créée pour un nouveau calque, cadre doré `.kta-planner-layer-maj`), légende des types versés absorbée dans la légende du plan (`window.ktaLegendePourCalque`, même sous-ensemble que la conversion), « Inclure les photos » coché. L'utilisateur vérifie et génère. |
| 4. Suite | `onZip(blob, nom)` remplace le téléchargement et « Publier » du Générateur. **Plan local** : ⬇️ Télécharger ou 🔄 Remplacer dans l'app (`chargerZipFichier(fichier, preset, { planId: <même id>, storeBlob: true })` : session, calage, photos, favoris restent attachés). **Plan d'extension** : ☁️ Publier la nouvelle version si `KtaExtensions.versionAutorisee(id)` (prise `publierVersion`, `community-server-line.md` §3), puis réouverture sur la nouvelle version ; sinon téléchargement seul (droit de modification : il prépare, la personne qui gère publie). **Plan du site** : téléchargement (l'administrateur remplace le ZIP). |
| Après | Après un remplacement ou une publication : `ktaConfirm` propose de **rendre les calques** (`restituer`, partagée sur un plan d'extension) et de **retirer de la session les objets versés** (`CalqueSession.retirerIntegres(uids, T)`), sinon doublons. Plan local : proposé AVANT le rechargement, la session rechargée est déjà propre. Remplacement raté : le ZIP part en téléchargement. |

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

**Limites** : un plan V2 est retuilé en entier à chaque mise à jour (lent sur téléphone, comme le mode Modifier) ;
la légende du plan éditée depuis le Générateur ouvert sur un plan affiché échange brièvement la légende de session
(§58.2) ; sur une installation reliée, les appareils encore sur l'ancienne version voient les objets retirés
disparaître de leur session avant d'avoir rouvert le plan.

---

## 📏 L'échelle d'un plan importé se DÉDUIT du géoréférencement (v1.82.0)

**Le bug** : `sigImport.js` et `gpxImport.js` écrivaient `tracking.scale = 50` **en dur** dans le plan-config. Sur `Citon_Graves_RD` — 4 000 px pour 1 199 m de terrain — la vraie valeur est **3,34 px/m** : un **facteur 15**. Toute distance affichée sur un plan importé était fausse dans cette proportion, et la mesure de KARMA annonçait 480 m pour 1 644 m réels.

**La correction ne calcule rien de neuf** : `KmzExport.buildTransform` retournait déjà `metresParPixel`, dont l'échelle est exactement l'inverse.

```js
scale: (transform && transform.metresParPixel > 0)
       ? Math.round((1 / transform.metresParPixel) * 1000) / 1000
       : 50
```

⚠️ **Un plan généré AVANT la v1.82.0 garde son échelle fausse** : elle est écrite dans son ZIP. Il faut le **régénérer** depuis le fichier source — l'app ne peut pas la corriger après coup, elle ne sait pas quelle emprise a servi.

🩸 **Le repli à 50 est conservé** et c'est volontaire : sans transform utilisable, une valeur arbitraire assumée vaut mieux qu'un `NaN` qui se propagerait silencieusement dans toutes les distances.
