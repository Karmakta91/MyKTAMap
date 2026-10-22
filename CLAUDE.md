# CLAUDE.md — MyKTAMap (community)

> Contexte essentiel, chargé à chaque session. Détails d'archi : `docs/architecture/` (lus à la demande). Journal complet : `README.md`.

## 🎯 Projet
- App web **cartographie souterraine** (Leaflet `L.CRS.Simple`), plans = images HD, **sans GPS**. Cible : cataphiles, spéléo, sites souterrains.
- **PWA page unique** `index.html`. Stack **HTML/CSS/JS vanilla + Leaflet**, pas de framework, **pas de bundler**.
- Prod https://myktamap.fr · Dev https://dev.myktamap.fr
- Auteur Flavien VIDAL (KARMA). Licence **CC BY-NC-SA 4.0** (usage commercial interdit sans accord).

## 🧭 Écosystème
- Ce dépôt (**public** depuis le 11/10/2026) = l'app. Dépôts **privés** frères, côte à côte : `MyKTAMap-pro` (édition
  installation, greffée par les prises neutres), `MyKTAMap-backend` (export client du pro — jamais édité à la main),
  `MyKTAMap-doc` (génère doc.myktamap.fr **sans copier** : une erreur vue sur le site se corrige dans le dépôt
  source, souvent ICI), `MyKTAMap-hebergement` (scripts de déploiement). Carte complète : hors de ce dépôt public
  (chargée par le `CLAUDE.md` utilisateur du poste).
- En ligne **automatiquement** si la CI est verte (VPS, toutes les 5 min) : push `Karma_dev` → dev.myktamap.fr ;
  merge `main` → myktamap.fr. Seul KARMA merge (`scripts\release\merge-main.ps1`, après la porte de release) ;
  Claude ne déploie ni ne pousse `main`. Détails : `docs/architecture/infra-versioning.md` §85.
- Écrire dans un dépôt frère = lire **son** `CLAUDE.md` d'abord ; ses hooks ne tournent que dans une session ouverte
  là-bas (`guard-git.js` d'ici applique l'union des règles git à tous les dépôts).

## 🔒 Frontière community ↔ pro (CRITIQUE)
- **Frontière = « zéro FICHIER pro »** (révisée le 04/10/2026, `docs/architecture/community-server-line.md`). Le pro = les fichiers qui se **greffent** (API, modules JS de comptes/synchro/multi-organisation…) : ils vivent dans le repo privé **`MyKTAMap-pro`**, jamais ici. Ce repo reste **utilisable entièrement sans serveur, gratuit, sans bridage**. **myktamap.fr n'aura jamais de backend.**
- ✅ Autorisé ici : des **points d'extension neutres** (`window.KtaExtensions.register()`, interrupteur `config.serverConnection`, états OFF/INVALIDE/LICENCE/CONFIGURÉE/ON/DOWN, garde unique, événements `mktm:*`), no-op sans extension. Contrat : §3 du doc ci-dessus. Modules : `js/ktaExtensions.js` (états OFF/INVALIDE/LICENCE/CONFIGURÉE/ON/DOWN, pastille, `register()` et toutes les prises — API v1 dans `community-server-line.md` §3), `js/ktaInstance.js` (index lu une fois avant les gates), `js/ktaUid.js` (identifiants stables). Garde-fous : `check-connexion-serveur.js`, `check-extensions.js`, `check-uid.js`, `check-licence.js` (licence pro **signée** ECDSA P-256 : clé **publique** seule ici ; clé privée et outil de signature vivent dans le pro interne, jamais ici — `check-no-pro-leak.js` les refuse). Une gate déléguée en échec n'ouvre JAMAIS la gate community.
- ❌ Ne JAMAIS commiter de code serveur ni de module pro ici, et ne pas coder de feature pro sans valider — **par défaut tout est community**. Pas de commentaire-pointeur vers un fichier pro (`// TODO pro:`).
- 🛡️ Hook anti-fuite : `.githooks/pre-commit` + `scripts/check-no-pro-leak.js` (refuse `*.php`, `pro/`, `backend/`, noms de modules pro ; activer 1×: `git config core.hooksPath .githooks`).

## ⚙️ Commandes & validation
- **Syntaxe** : `node -c fichier.js` (pas de linter).
- **CI GitHub** (`.github/workflows/ci.yml`, audit CI/CD du 08/10/2026) : à chaque push sur `Karma_dev` / `main` et PR — syntaxe, **commits reçus** (`scripts/ci-commits.sh` : anti-fuite pro et `data/` hors Git commit par commit, `Data-deroge:` lu dans le message) puis **tous les garde-fous du pre-commit**. Un hook contourné (`--no-verify`, poste sans `core.hooksPath`, éditeur web) ne passe plus en silence. Rouge = on corrige avant d'empiler. **Un garde-fou ajouté au pre-commit tourne aussi en CI** (la CI lance `.githooks/pre-commit`) ; en CI rien n'est indexé : un garde-fou qui lit l'index (`git diff --cached`) doit aussi être appelé par `scripts/ci-commits.sh` (`KTA_FICHIERS_CI`, liste de fichiers) ou relire tout le dépôt sous `CI`, sinon il passe à vide.
- **Dépendances** : Dependabot (`.github/dependabot.yml`) ouvre une PR par mise à jour (actions GitHub, `scripts/smoke`, et les librairies copiées dans `lib/` via le manifeste
  **déclaratif** `lib/package.json`) vers `Karma_dev`, testée par la CI. Une PR sur `lib/` ne touche que le manifeste :
  `scripts/check-libs.js` (bloquant) exige que l'en-tête du fichier embarqué, `lib/package.json` et
  **`lib/VERSIONS.md`** disent la même version — mettre à jour une librairie = fichier du paquet npm officiel +
  manifeste + table dans le même commit, puis tester ce qu'elle fait (marche à suivre : `lib/VERSIONS.md`). L'image Docker (`docker.yml`) n'est publiée que si la CI du commit taggé est verte.
- **Pas de build** : `<script src="js/…">` chargés dans l'ordre par `index.html` (= source de vérité des modules).
- **Release** : bumper ENSEMBLE `sw.js > CACHE_NAME` + `js/copyright.js > __MKM__.build` + `version.json > version`. Procédure complète, sync docs et règles des notes `version.json` (user-friendly, écart avec la **prod**, dernier bump seulement) : **skill `release`** · `infra-versioning.md` §84.
- **⛔ Pas de bump par correctif** (décision KARMA 04/10/2026) : on commite **sans bump** (`fix(...)`, `feat(...)`) ; le **seul** bump se fait quand KARMA prépare une mise en prod (**jamais sans son « go »**), juste avant la porte de release, avec la sync docs 4 axes dans ce commit. On ne redescend jamais un numéro (comparaison semver de `updateChecker.js`) : la prochaine prod reprend la suite.
- **Bump = sync docs sur 4 axes**, vérifiée au commit (`commit-msg` + `check-release-docs.js` : 3 sources **jamais** dérogeables, le reste par `Docs-deroge:` — écrit par KARMA seul) :
  📱 guides `docs/applications/README_USER{,.en,.es}.md` (les 3 dans le même commit, `check-doc-langues.js`) + `js/interfaceDocs.js` + `AI_CONTEXT.md` · 🔒 `NETWORK_AUDIT.md` + `NETWORK_AUDIT_HISTORIQUE.md` (`.html` **générés** : `node scripts/audit-html.js`) · 📖 `README.md` · 🤖 `CLAUDE.md` + `docs/architecture/`.
- **`docs/architecture/` = l'ÉTAT ACTUEL, pas l'historique** (décision KARMA 30/09/2026) : **aucune section « Vague X (v1.NN) »** ni journal par version — l'historique vit dans `README.md` et les commits. En touchant un fichier, **réécrire** la partie concernée (et remettre au propre ce qu'on traverse), ne pas empiler. Un audit/étude **soldé** quitte `docs/` : tag Git d'archive (cf `docs/audits/INDEX.md`, tag `archive-docs-2026-09-30`), pas de dossier `archive/`.
- **Déploiement et merge** (cf 🧭 Écosystème) : `data/` n'est jamais touché par un déploiement ; ce qui tourne
  vraiment : `scripts/release/etat-sites.ps1`. `merge-main.ps1` (KARMA ; `-DryRun` = tout voir sans rien toucher)
  vérifie arbre propre, 3 sources de version, garde-fous, porte **SonarQube** locale, CI verte du commit, fait
  confirmer les marches 2-4 de la porte, merge, tague et publie ; puis `/killsw.html` une fois. Détails :
  `infra-versioning.md` (merge-main, §85).
- **🚦 Porte de release** : AVANT tout merge `main`, franchir **`docs/RELEASE_GATE.md`** (guards auto → smoke 13 pts sur dev → checkup ciblé → trempage). `main` = déployable. Dérogations possibles sur items non-🔒, **accordées par KARMA seul**, consignées avec motif/risque/rattrapage.

## 🚨 Garde-fous — NE JAMAIS
- `push main`, pousser un tag ou `site-public`, `push --force`, `reset --hard`, staging global (`add -A`/`.`,
  `commit -a`) → **bloqués en dur dans tous les dépôts** (`.claude/hooks/guard-git.js`). Stager par chemins explicites.
- Toucher **`Chig_Dev`** (branche collaborateur) — bloqué en dur.
- Éditer **`data/**`** (dont `plan-config.json`) = DATA pure. Claude bosse **uniquement sur le moteur** (`js/`, `css/`, `index.html`, `sw.js`). Bloqué (`deny`).
- **Livrer `data/` sur Git** — JAMAIS. `data/` reçoit des **relevés réels de terrain** : ni les galeries, ni les entrées, ni le nom d'un réseau ne partent sur un dépôt public. Seul le **relevé fictif** y vit, et même lui ne se met à jour que **sur consigne explicite de KARMA**. 🛡️ `.githooks/commit-msg` + `scripts/check-data-hors-git.js` refusent tout fichier `data/` indexé (dérogation : ligne `Data-deroge: <motif>`, archivée dans l'historique). ⚠️ Le piège n'est pas le dossier d'un plan (non suivi) mais **`data/index.json`, qui EST suivi** : un `git commit -a` suffisait.
- **Écrire un nom réel lié aux relevés** (département, commune, réseau, plan réel) dans le code, les docs, un test ou un message de commit — le dépôt est **public** (11/10/2026). Exemples neutres : « Secteur », « relevé réel ». 🛡️ `scripts/check-noms-reels.js` (pre-commit, commit-msg, CI ; empreintes sha256, liste locale facultative `~/.myktamap/noms-interdits.txt`) refuse le nom du département des relevés, sans dérogation.
- Changer les couleurs de la charte sans décision de KARMA (mesure de contraste à l'appui, cf audit Impeccable du 20/10/2026), supprimer un tag built-in, reset `localStorage`/IndexedDB sans avertir l'user.

## 🧭 Conventions
**JS** : vanilla, globales via `window.x`, privées préfixe `_`, pas d'`import/export` ES6. **Jamais de script inline** (`onclick=`, `onerror=`, `javascript:`, `<script>` sans `src`) : un écouteur (délégation + `data-*`) — la CSP vise `script-src 'self'` (`check-csp-inline.js`, bloquant). **Jamais de popup native** (`alert`/`confirm`/`prompt`) : `window.ktaAlerte` (message à lire pour agir, texte échappé), `window.ktaConfirm` (choix ; `opts.texte`/`nombre`/`zIndex`), toast `OOMGuard.showToast` (confirmation — `info` masqué par défaut, une réussite en `success`, jamais en `warn` ; empilés, 3 visibles ; réglage de notifications) — `check-popups-natives.js` (plafond 0, bloquant). Logs préfixés `[Module]`. 2 espaces, lignes < 120.
**Commentaires** (convention du 17/10/2026, `check-commentaires.js`) : le code décrit l'**état actuel**. Un commentaire dit le **pourquoi**, un **contrat** ou un **piège** — jamais qui l'a demandé, quand, ni dans quelle version (l'historique vit dans le commit et `README.md`). En-tête de fichier ≤ 20 lignes après la licence : rôle, ce qu'il expose, pièges, garde-fou/doc. Trois préfixes seulement : 🩸 piège · ⚠️ contrat · 🔒 sécurité. Renvois `fichier.js > fonction`, jamais un numéro de ligne. Un choix voulu qu'il ne faut pas « corriger » : `(décision produit)`. Ancres d'outils : `// 🏷️ ancre:<nom>` (ne pas toucher sans adapter le garde-fou).
**CSS** : charte en **jetons** `--kta-*` (tête de `css/style.css`, redéfinis par le thème clair) : fonds `--kta-fond` `#0a0d18` / `--kta-surface` `#1a1f2e` ; texte `--kta-texte` `#e8eaf0`, `--kta-texte-2` `#c8d0e0`, `--kta-texte-3` `#98a1b3` (méta) ; accent doré `--kta-accent` `#f4c542` (titres, état actif ; en texte : `--kta-accent-texte`) ; interaction `--kta-interaction` `#8cb4ff` ; action principale `--kta-primaire` `#1a5fd6` (bleu dans les deux thèmes) ; texte sombre sur doré/orange `--kta-sur-accent` ; violet du tuilage V2 `--kta-tuilage-v2`. Une couleur de la charte s'écrit `var(--kta-…)`, en CSS comme dans un `style=` posé par le JS (`check-couleurs-inline.js`, cliquet) ; jamais de surcharge `[style*=…]`, jamais d'opacité pour griser du texte (couples ≥ 4,5:1, `docs/architecture/ui.md` §53). Préfixe **`kta-`**. Pas de Tailwind/SCSS. Référence pour les maquettes : projet claude.ai/design « MyKTAMap » (`.design-sync/`). Z-index : 1100 titre · 5000 loader · 9999 splash · 99999 modales · 100001 sous-modales.
**Coords** : TOUJOURS `convertCoord(x,y)` = `[imageHeight - y, x]`. Jamais `[y,x]` direct.
**Distances** : TOUJOURS `window.formatDistance(distM, dec)`. Jamais `toFixed()+" m"`.
**Icônes** : résolution unique `window._iconMap[tag]` / `getIconUrlForPoint` — vrai **pour un plan chargé**. Hors plan (HOME, Vue OSM multi-plans), la source est `window._ktaBuiltinIconUrls` (= `map.js > TAGS_BUILTIN`, exposé au **top-level**). **Jamais de copie locale du catalogue** : `scripts/check-icon-catalog.js` (pré-commit, bloquant) confronte **9 tables** dans les deux sens — `PLANNER_DEFAULT_ICONS`, `EDITOR_TAG_LABELS`, `LEGENDE_LABELS`, `DEFAULT_LABELS.icones`, les 3 structures de **GROUPES** (légende ×2, export), le **précache** `sw.js > ASSETS_TO_CACHE` (+ existence du fichier) et les **3 dicos** (`editor.tag.*`, `legendui.label.*`). Ajouter un tag = `.claude/skills/add-icon-tag`. ⚠️ **Une valeur d'icône de `plan-config` qui n'est ni un `data:`/`blob:` ni un fichier à extension est ignorée au chargement** (`window.ktaCheminIconePlausible`) — sinon elle fabrique une URL morte qui gagne sur le catalogue (cas réel : le libellé « Icône SVG intégrée… » écrit à la place du data-URI). Un `<img class="kta-marker-img">` qui échoue se replie sur `_ktaBuiltinIconUrls[tag]` (délégation en capture, `map.js`). **Le Générateur déclare ce que le ZIP embarque** (`iconsEmbarquees`) : sans ce champ, l'app sonde le serveur pour CHAQUE icône à chaque ouverture (21 × 404 mesurées).
**Styles des types** (tracés/zones/structures) : TOUJOURS `window.ktaResolveStyle(cat, clé[, {flat:true}])` (`flat` = contexte sans motif SVG : canvas, KMZ, OSM) · pastille/camembert = `ktaSwatchColor` · icône HTML = `ktaTypeSwatchHtml`. **Jamais de table de couleurs locale** — `scripts/check-style-canon.js` (pré-commit bloquant) refuse toute réintroduction. 2 exceptions documentées (palette propre, délibérée) : `emergencyMode.js`, `osmView.js`/`osmHomePreview.js`. ⚠️ **Une exception garde sa base, pas le droit d'ignorer l'utilisateur** : elle doit passer ses styles par `window.ktaAppliquerCouleurChoisie(cat, clé, style)` et laisser le canon résoudre les types `cust-…`, sinon les couleurs de la légende personnalisée ne l'atteignent pas (`osmView.js` passe par le canon ; `osmHomePreview.js` relit la légende **par plan**).
**Rotation de la vue** (mode « plan orienté ») : la rotation vit sur le pane intercalaire `.kta-rotate-pane`, **jamais** sur un élément que Leaflet positionne en `transform` (map-pane, `.leaflet-marker-icon`, `.leaflet-popup`) — les propriétés individuelles (`rotate`) s'appliquent AVANT `transform` et feraient pivoter la translation elle-même. Toute contre-rotation se pose sur un **enfant**. Un pane créé via `map.createPane()` atterrit hors rotation. Détails : `docs/architecture/tracking.md`.
**Textes user-facing** : migration progressive vers `window.I18n.t("module.section.element")` (dicos `lang/<code>.json`, FR = fallback universel). Appeler au rendu, jamais au load. Hors modules migrés, le FR inline reste OK. Détails + état migration : `docs/architecture/i18n.md`. **Jamais de HTML dans une clé rendue en texte** (`data-i18n`/`-title`/`-placeholder` = `textContent`) : le balisage va dans le gabarit, pas dans le dico — `scripts/check-i18n.js` §5 (bloquant, branché au pre-commit depuis v1.85.4). **Dates** : `toLocale*String(window.ktaLocale ? window.ktaLocale() : "fr-FR")`, jamais `"fr-FR"` en dur. **Couleur de texte dans un dico ou une alerte** : classe `.kta-tx-{info,accent,clair,muted,warn,err,ok,violet,magenta}` (variante claire incluse), jamais `style="color:#…"` — en clair, le filet `.kta-readme-modal-corps *` efface les couleurs inline.

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
| **Guidage de l'itinéraire** (« dans X m, tourner à gauche », feuille de route, urgence) | `docs/ETUDE_GUIDAGE.md` (décisions) · `docs/architecture/tracking.md` §Guidage · `js/itiGuidage.js` |
| **Identifiant stable des objets** (`uid` + `updatedAt`, traces de suppression, fusion, photos/favoris/liaisons/Secours par uid) — chantier 1, livré v2.1.0 → v2.5.0 | `docs/ETUDE_UID.md` (décisions) · `js/ktaUid.js` · `scripts/check-uid.js` |
| Multi-niveau, pathfinding, itinéraire | `docs/architecture/multilevel-pathfinding.md` |
| Exports PNG/PDF/KMZ/GPX + légende | `docs/architecture/exports.md` |
| Refonte UI, thème, modales, filtres | `docs/architecture/ui.md` |
| Multi-langue (i18n), dicos `lang/`, `window.I18n`, migration | `docs/architecture/i18n.md` |
| Session (**stockage IndexedDB `js/sessionStore.js`** — jamais `localStorage["myktamap_session_v1_…"]` en direct, `check-session-store.js`), photos, undo, recherche, stats, favoris, **Carnet (sorties)** | `docs/architecture/session-data.md` §9.0 |
| Import **SIG** (GeoJSON/KML/KMZ), CRS, écran de correspondance | `js/sigImport.js` (en-tête) · `scripts/check-lambert93.js` |
| Profil : avatar, rangs, hauts faits, **fond d'écran du HOME** | `js/userProfile.js` (en-tête) · `js/homeProfile.js` |
| Sécurité : gates, PIN, audit, légal, licence | `docs/architecture/security-legal.md` |
| Mode Secours (toutes phases) + urgence | `docs/architecture/secours.md` |
| Vue OSM modale + widget HOME (georef, tuiles V2, opt-in) | `docs/architecture/vue-osm.md` |
| Versioning, live-config, releases, DX (selfhost, hooks), logs | `docs/architecture/infra-versioning.md` |
| Formats JSON (plan-config, point, session) | `docs/architecture/data-formats.md` |
| Frontière community/pro, points d'extension (connexion serveur), mode serveur kiosque, confadmin | `docs/architecture/community-server-line.md` |
| Pièges connus & renommages | `docs/architecture/gotchas.md` |
| **Ce qui reste à faire** | **`docs/BACKLOG.md`** (Maintenant ≤ 10 · Ensuite · Plus tard · Entrant ; format en tête, `check-backlog.js`) — ne liste que l'OUVERT : son silence ne prouve pas qu'une feature manque (cf ci-dessous) · pistes : `docs/IDEES.md` · enterrés, acceptés, leçons : `docs/DECISIONS_FERMEES.md` |
| **Une feature « manque » ? une dette « existe » ?** | AVANT de l'annoncer : `grep` le symbole et les mots-clés dans `js/`, puis le journal `README.md`, puis `docs/architecture/<sujet>.md` (état actuel). Le code est la seule source qui ne ment pas |
| Porte de release : smoke test 13 pts, dérogations, relevé | `docs/RELEASE_GATE.md` |
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
