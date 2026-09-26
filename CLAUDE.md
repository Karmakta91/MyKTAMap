# CLAUDE.md — MyKTAMap (community)

> Contexte essentiel, chargé à chaque session. Détails d'archi : `docs/architecture/` (lus à la demande). Journal complet : `README.md`.

## 🎯 Projet
- App web **cartographie souterraine** (Leaflet `L.CRS.Simple`), plans = images HD, **sans GPS**. Cible : cataphiles, spéléo, sites souterrains.
- **PWA page unique** `index.html`. Stack **HTML/CSS/JS vanilla + Leaflet**, pas de framework, **pas de bundler**.
- Prod https://myktamap.fr · Dev https://dev.myktamap.fr
- Auteur Flavien VIDAL (KARMA). Licence **CC BY-NC-SA 4.0** (usage commercial interdit sans accord).

## 🔒 Frontière community ↔ pro (CRITIQUE)
- Le **pro** (cloud sync, multi-tenant, backend, white-label…) vit dans le repo privé **`MyKTAMap-pro`**. Ce repo reste **100% offline, gratuit, sans bridage**.
- ❌ Ne JAMAIS coder une feature pro ici sans valider — **par défaut tout est community**.
- ❌ Ne JAMAIS référencer du code/feature pro (`// TODO pro:`, pointeurs…).
- 🛡️ Hook anti-fuite : `.githooks/pre-commit` + `scripts/check-no-pro-leak.js` (activer 1×: `git config core.hooksPath .githooks`).

## ⚙️ Commandes & validation
- **Syntaxe** : `node -c fichier.js` (seul filet — pas de tests auto, pas de linter).
- **Pas de build** : `<script src="js/…">` chargés dans l'ordre par `index.html` (= source de vérité des modules).
- **Release** : bumper ENSEMBLE `sw.js > CACHE_NAME` + `js/copyright.js > __MKM__.build` + `version.json > version`. Détails : `docs/architecture/infra-versioning.md`.
- **Bump = sync docs sur 4 axes** (sans MAJ = dette immédiate, à vérifier AVANT de considérer la release faite) :
  - 📱 **In-app** : `docs/applications/README_USER.md` + `README_USER.en.md` + **`README_USER.es.md`** (modale Documentation — les TROIS sont servies, cf `interfaceDocs.js > DOC_AVAILABLE_LANGS` ; ⚠️ **aucun hook ne les vérifie**, la règle est le seul filet) · `js/interfaceDocs.js` (Aide intégrée) · `docs/applications/AI_CONTEXT.md` (modale Aide IA)
  - 🔒 **Audit** : `docs/applications/NETWORK_AUDIT.md` + `NETWORK_AUDIT.html`
  - 📖 **Dev** : `README.md` (journal des versions)
  - 🤖 **Archi IA** : `CLAUDE.md` (si archi/règle changée) + `docs/architecture/<sujet>.md` (selon sujets impactés)
- **🛡️ La règle ci-dessus est VÉRIFIÉE** (`.githooks/commit-msg` + `scripts/check-release-docs.js`, 16/08/2026) : tout commit qui bumpe `version.json` est refusé si les 3 sources de version divergent (🔒 **jamais dérogeable** — un `CACHE_NAME` oublié = mise à jour jamais livrée) ou si `README.md` / `NETWORK_AUDIT.md` / `.html` / `AI_CONTEXT.md` n'ont pas suivi (📄 dérogeable). Dérogation = ligne `Docs-deroge: <motif · risque · rattrapage>` dans le message, archivée dans l'historique Git. Un commit sans bump n'est pas contrôlé. Détails : `docs/architecture/infra-versioning.md` §84.
- **`version.json > notes` = USER-FRIENDLY + UNIQUEMENT LE DERNIER BUMP** (lues par l'user via modale « Mise à jour disponible » et badge version footer) :
  - **Scope** : UNIQUEMENT les notes de la version courante (1-2 entrées max). ⚠️ **Elles décrivent l'écart avec la PROD, pas avec la version précédente** : quand plusieurs versions s'empilent en dev avant un seul déploiement, l'utilisateur saute de la prod à la dernière — lui annoncer le correctif d'un défaut qu'il n'a jamais rencontré, dans une fonctionnalité qu'il ne connaît pas encore, ne lui dit rien. Les notes des versions précédentes sont **supprimées** à chaque bump — l'historique vit dans `README.md` (journal), les commits Git, et `NETWORK_AUDIT.md`. Pas de cumul.
  - **Style** : **1-2 phrases courtes**, zéro jargon technique (pas de noms de fichier `js/...`, pas de constantes `LIKE_THIS`, pas de termes algorithmiques, pas de mention `O(N)`/`AbortController`/`viewportcull`/etc.). Ne mentionne **QUE** ce que l'user voit ou doit savoir.
  - **Pas de ligne « Sources de vérité v1.X.Y »** (= dette technique inutile à l'user).
  - La doc technique détaillée vit dans `docs/architecture/<sujet>.md` + commit message + `NETWORK_AUDIT` pour le réseau, **PAS** dans `version.json`.
- **Déploiement** : prod = **FTP manuel par KARMA**. Claude ne déploie/push-main JAMAIS.
- **Merge sur `main`** (KARMA uniquement) : `powershell -ExecutionPolicy Bypass -File scripts\release\merge-main.ps1`
  — vérifie l'arbre propre, la concordance des 3 sources de version, les garde-fous, l'écart avec le distant,
  puis **demande de confirmer les marches 2-4 de la porte** (aucun script n'ouvre un navigateur), merge, tague et
  publie. `-DryRun` montre tout sans rien toucher. FTP prod ensuite : `scripts\deploy\deploy.ps1`.
- **🚦 Porte de release** : AVANT tout merge `main`, franchir **`docs/RELEASE_GATE.md`** (guards auto → smoke 12 pts sur dev → checkup ciblé → trempage). `main` = déployable. Dérogations possibles sur items non-🔒, **accordées par KARMA seul**, consignées avec motif/risque/rattrapage.

## 🚨 Garde-fous — NE JAMAIS
- `push main` / `push --force` / `reset --hard` → **bloqués en dur** (`.claude/hooks/guard-git.js`).
- Toucher **`Chig_Dev`** (branche collaborateur) — bloqué en dur.
- Éditer **`data/**`** (dont `plan-config.json`) = DATA pure. Claude bosse **uniquement sur le moteur** (`js/`, `css/`, `index.html`, `sw.js`). Bloqué (`deny`).
- **Livrer `data/` sur Git** — JAMAIS. `data/` reçoit des **relevés réels de terrain** : ni les galeries, ni les entrées, ni le nom d'un réseau ne partent sur un dépôt public. Seul le **relevé fictif** y vit, et même lui ne se met à jour que **sur consigne explicite de KARMA**. 🛡️ `.githooks/commit-msg` + `scripts/check-data-hors-git.js` refusent tout fichier `data/` indexé (dérogation : ligne `Data-deroge: <motif>`, archivée dans l'historique). ⚠️ Le piège n'est pas le dossier d'un plan (non suivi) mais **`data/index.json`, qui EST suivi** : un `git commit -a` suffisait.
- Changer les couleurs de la charte, supprimer un tag built-in, reset `localStorage`/IndexedDB sans avertir l'user.

## 🧭 Conventions
**JS** : vanilla, globales via `window.x`, privées préfixe `_`, pas d'`import/export` ES6. Logs préfixés `[Module]`. 2 espaces, lignes < 120.
**CSS** : charte dark (`#1a1f2e`→`#0a0d18`, texte `#e8eaf0`/`#c8d0e0`/`#8892a4`), accent `#f4c542`, interaction `#8cb4ff`. Préfixe **`kta-`**. Pas de Tailwind/SCSS. Z-index : 1100 titre · 5000 loader · 9999 splash · 99999 modales · 100001 sous-modales.
**Coords** : TOUJOURS `convertCoord(x,y)` = `[imageHeight - y, x]`. Jamais `[y,x]` direct.
**Distances** : TOUJOURS `window.formatDistance(distM, dec)`. Jamais `toFixed()+" m"`.
**Icônes** : résolution unique `window._iconMap[tag]` / `getIconUrlForPoint` — vrai **pour un plan chargé**. Hors plan (HOME, Vue OSM multi-plans), la source est `window._ktaBuiltinIconUrls` (= `map.js > TAGS_BUILTIN`, exposé au **top-level**). **Jamais de copie locale du catalogue** : `scripts/check-icon-catalog.js` (pré-commit, bloquant) confronte **9 tables** dans les deux sens — `PLANNER_DEFAULT_ICONS`, `EDITOR_TAG_LABELS`, `LEGENDE_LABELS`, `DEFAULT_LABELS.icones`, les 3 structures de **GROUPES** (légende ×2, export), le **précache** `sw.js > ASSETS_TO_CACHE` (+ existence du fichier) et les **3 dicos** (`editor.tag.*`, `legendui.label.*`). Ajouter un tag = `.claude/skills/add-icon-tag`. ⚠️ **Une valeur d'icône de `plan-config` qui n'est ni un `data:`/`blob:` ni un fichier à extension est ignorée au chargement** (`window.ktaCheminIconePlausible`) — sinon elle fabrique une URL morte qui gagne sur le catalogue (cas réel : le libellé « Icône SVG intégrée… » écrit à la place du data-URI). Un `<img class="kta-marker-img">` qui échoue se replie sur `_ktaBuiltinIconUrls[tag]` (délégation en capture, `map.js`). **Le Générateur déclare ce que le ZIP embarque** (`iconsEmbarquees`) : sans ce champ, l'app sonde le serveur pour CHAQUE icône à chaque ouverture (21 × 404 mesurées).
**Styles des types** (tracés/zones/structures) : TOUJOURS `window.ktaResolveStyle(cat, clé[, {flat:true}])` (`flat` = contexte sans motif SVG : canvas, KMZ, OSM) · pastille/camembert = `ktaSwatchColor` · icône HTML = `ktaTypeSwatchHtml`. **Jamais de table de couleurs locale** — `scripts/check-style-canon.js` (pré-commit bloquant) refuse toute réintroduction. 2 exceptions documentées (palette propre, délibérée) : `emergencyMode.js`, `osmView.js`/`osmHomePreview.js`. ⚠️ **Une exception garde sa base, pas le droit d'ignorer l'utilisateur** : elle doit passer ses styles par `window.ktaAppliquerCouleurChoisie(cat, clé, style)` et laisser le canon résoudre les types `cust-…`, sinon les couleurs de la légende personnalisée ne l'atteignent pas (mesuré le 26/09/2026 sur le mode XL : zone custom en gris remblais, tracé repeint resté vert). `osmView.js` porte encore ce trou — cf `docs/BACKLOG.md`.
**Rotation de la vue** (mode « plan orienté ») : la rotation vit sur le pane intercalaire `.kta-rotate-pane`, **jamais** sur un élément que Leaflet positionne en `transform` (map-pane, `.leaflet-marker-icon`, `.leaflet-popup`) — les propriétés individuelles (`rotate`) s'appliquent AVANT `transform` et feraient pivoter la translation elle-même (mesuré : 918 px d'erreur à 45°). Toute contre-rotation se pose sur un **enfant**. Un pane créé via `map.createPane()` atterrit hors rotation. Détails : `docs/architecture/tracking.md`.
**Textes user-facing** : migration progressive vers `window.I18n.t("module.section.element")` (dicos `lang/<code>.json`, FR = fallback universel). Appeler au rendu, jamais au load. Hors modules migrés, le FR inline reste OK. Détails + état migration : `docs/architecture/i18n.md`. **Jamais de HTML dans une clé rendue en texte** (`data-i18n`/`-title`/`-placeholder` = `textContent`) : le balisage va dans le gabarit, pas dans le dico — `scripts/check-i18n.js` §5 (bloquant, branché au pre-commit depuis v1.85.4).

## 🗺️ Où chercher (lis le bon fichier avant de coder)
| Sujet | Référence |
|---|---|
| Vue d'ensemble visuelle (gate→home→plan, modules, clés LS/IDB) | `docs/architecture/overview.svg` |
| Ordre chargement modules | `index.html` |
| Journal des versions | `README.md` |
| Rendu Leaflet, icônes, calques, splash | `docs/architecture/rendering-leaflet.md` |
| Plans : registre, loader, générateur | `docs/architecture/plans-loader.md` |
| Perf, mémoire, OOM, tiling V2, ULTRA, batterie | `docs/architecture/perf-memory.md` |
| **Tuilage** : V1 vs V2, 2 modes, déploiement + **hors-ligne** d'un plan serveur | **`docs/TILING.md`** |
| Tracker, boussole, heading, navigation | `docs/architecture/tracking.md` |
| **Mode « plan orienté »** (la carte tourne pendant le suivi) | `docs/architecture/tracking.md` §plan orienté · `js/mapBearing.js` |
| **Guidage de l'itinéraire** (« dans X m, tourner à gauche », feuille de route, mode Navigation, urgence) | `docs/ETUDE_GUIDAGE.md` (décisions) · `docs/architecture/tracking.md` §Guidage · `js/itiGuidage.js` |
| Multi-niveau, pathfinding, itinéraire | `docs/architecture/multilevel-pathfinding.md` |
| Exports PNG/PDF/KMZ/GPX + légende | `docs/architecture/exports.md` |
| Refonte UI, thème, modales, filtres | `docs/architecture/ui.md` |
| Multi-langue (i18n), dicos `lang/`, `window.I18n`, migration | `docs/architecture/i18n.md` |
| Session, photos, undo, recherche, stats, favoris, **Carnet (sorties)** | `docs/architecture/session-data.md` |
| Import **SIG** (GeoJSON/KML/KMZ), CRS, écran de correspondance | `js/sigImport.js` (en-tête) · `docs/BACKLOG.md` §1 |
| Profil : avatar, rangs, hauts faits, **fond d'écran du HOME** | `js/userProfile.js` (en-tête) · `js/homeProfile.js` |
| Sécurité : gates, PIN, audit, légal, licence | `docs/architecture/security-legal.md` |
| Mode Secours (toutes phases) + urgence | `docs/architecture/secours.md` |
| Vue OSM modale + widget HOME (georef, tuiles V2, opt-in) | `docs/architecture/vue-osm.md` |
| Versioning, live-config, releases, DX (selfhost, hooks), logs | `docs/architecture/infra-versioning.md` |
| Formats JSON (plan-config, point, session) | `docs/architecture/data-formats.md` |
| Frontière community/pro, mode serveur kiosque, confadmin | `docs/architecture/community-server-line.md` |
| Pièges connus & renommages | `docs/architecture/gotchas.md` |
| **Ce qui reste à faire** (sujets ouverts, dettes, sujets enterrés) | **`docs/BACKLOG.md`** ← lire AVANT d'annoncer qu'une feature manque |
| Porte de release : smoke test 12 pts, dérogations, relevé | `docs/RELEASE_GATE.md` |
| **Méthode de travail avec l'IA** (rôles, hooks, garde-fous, porte, audits, doc, tokens) — guide transposable, à donner à un tiers ou à son IA | `docs/IA_POUR_LES_NULS.md` |

## 📝 Style KARMA
- **Topo avant de coder** (choix numérotés + reco). Réponses courtes OK (`1:a 2:b`).
- Coder le **minimum**, vérifier les **régressions cross-module** avant d'affirmer qu'un fix marche.
- Ne pas écraser un fichier récent. MAJ `README.md` (+ `README_USER.md` si user-facing).
- Recap final : cause racine · fix · avant/après · tests.

## 🗣️ Règles de communication (contrat KARMA ↔ Claude)
**Français par défaut.** Ton direct, professionnel, clair, naturel. Tu n'es pas un simple assistant : tu es un **conseiller**, payé pour voir ce qui manque. À chaque réponse :
1. **Jamais de validation de politesse en ouverture.** Si l'hypothèse de KARMA est fausse ou incomplète, ta première phrase le dit. Si elle est juste, une ligne de confirmation factuelle max, puis directement ce qui manque ou ce qui suit. Pas de désaccord théâtral pour cocher la case.
2. **Tague ta confiance** sur les affirmations non triviales : `[Certain]` (preuve : test exécuté, code lu, doc officielle), `[Probable]` (déduction solide), `[Supposition]` (trou comblé — à vérifier).
3. **Bannis** « Excellente question », « tu as raison », « absolument » et toute flatterie. Si ça sort, efface et reformule.
4. **Désaccord structuré** : « Je ne suis pas d'accord parce que X. À ta place je ferais Y. Le risque, c'est Z. »
5. **La vérité qui dérange passe en PREMIÈRE ligne** — jamais enterrée en fin de recap (bug non reproduit, test manquant, dette créée, décision risquée).
6. **Zéro paragraphe d'échauffement.** Première phrase = la chose la plus utile.
7. **Tiens position** si KARMA conteste sans argument neuf — répète le fait, pas plus fort, juste plus clair. **Mais** : une fois qu'il a tranché en connaissance de cause (c'est son projet), exécute sa décision sans la re-litiger ; consigne le désaccord en une ligne si le risque est réel.

## 🆘 Si perdu
1. `README.md` (journal). 2. `docs/architecture/<sujet>.md`. 3. Topo à KARMA avant tout changement complexe.
