# Architecture MyKTAMap — Versioning, live-config, releases, logs

> Référence détaillée extraite de l'ancien CLAUDE.md. Lue à la demande (pas auto-chargée).
> Sections : §10, §11, §20, §22, §29, §30, §74

---

### 10. Flag `debugMode` (renommage de `motionDebug`, depuis 08/05/2026)

Le flag debug est désormais **global pour toute l'app**, pas uniquement le tracker.

**Usage actuel** :
- Logs verbose dans `tracking.js` (Magnitude + détection de pas)
- Affichage de la ligne technique sous le segmented control du loader (`MAX:8192 / TILE:1024 / Q:0.88 / tile si > 60 Mo`)

**Persistance** : `localStorage.app_user_prefs.debugMode` (boolean). Helper unique `window.setDebugMode(value)` — utilisé par :
- Bouton 🐛 dans le loader (`#loaderDebugBtn`)
- Toggle Réglages ⚙️ (`#cfg_debugMode`)

**Migration silencieuse au boot** (dans `config.js`, IIFE `_migrerPrefsUtilisateur`) :
- `motionDebug` → `debugMode` (préserve la valeur)
- `perfMode` (globale) → SUPPRIMÉE (perfPreset est par plan désormais)

Idempotente : peut tourner 100 fois sans effet de bord.

---

### 11. Gating centralisé des logs (`debug.js`, depuis 09/05/2026)

`debug.js` proxie `console.log/info/warn/error` pour les capter dans un buffer (modale 🐛 Logs accessible depuis Réglages). Le gating est en deux niveaux :

| | DevTools console | Buffer (modale 🐛) |
|---|---|---|
| `console.log` / `console.info` | Visible **si debugMode = true** | Bufferisé **si debugMode = true** |
| `console.warn` / `console.error` | Toujours visible | Toujours bufferisé |

**Pourquoi gater AUSSI le buffer ?** (changement le 09/05/2026, suite 16) — Sans ça, `tracking.js` (60 logs/s en mode actif via `[Tracking] Magnitude :`) pollue le localStorage et pousse les warn/error utiles hors du buffer (limite 300 entries). En debug OFF on ne garde que les warn/error : modale 🐛 reste lisible même après une session intensive de tracking.

**Convention de tag** : préfixer chaque log avec `[Module]` (ex : `[Road] Mode :`, `[Tracking] Magnitude :`, `[Export rapide] résumé layer loop`). Plus de gating manuel `if (APP_CONFIG?.debugMode)` à coder dans les modules.

---

### 20. Live config files (`version.json`, `alert.json`) (depuis 11-13/05/2026)

Pattern de **fichiers JSON à la racine non cachés par le SW**, fetched live à chaque boot avec cache-bust, pour permettre à l'auteur de pousser des changements **sans bumper le SW ni le code JS**.

**Deux fichiers actuels** :

| Fichier | Module client | Rôle | Cache SW |
|---|---|---|---|
| `version.json` | `js/updateChecker.js` | Détection de mise à jour + popup propose mise à jour douce (purge cache PWA, garde session) ou reset complet | ❌ Non caché |
| `alert.json` | `js/alertChecker.js` | Diffusion d'alertes publiques en temps réel (incendie, fermeture, etc.) — modale rouge pulsante après splash | ❌ Non caché |

**Pourquoi pas cacher** : on veut TOUJOURS la valeur serveur, sans bypass via le SW cache-first. Le fetch utilise `?_=${Date.now()}` + `cache: "no-store"` pour contourner aussi les caches HTTP intermédiaires. Si offline → fetch échoue silencieusement, pas de popup (comportement normal).

**Format `alert.json` (v163+, multi-alertes)** :
```json
{
  "active": true | false,
  "alerts": [
    {
      "id":       "migration-myktamap-fr-2026",
      "level":    "info" | "warning" | "emergency",
      "title":    "...",
      "message":  "...",
      "details":  ["..."],
      "released": "ISO timestamp"
    },
    ...
  ]
}
```

**Rétro-compat** : l'ancien format mono-alerte (sans `alerts[]`, avec `level`/`title`/`message` au top-level) est toujours accepté. `alertChecker.js > _normaliserPayload()` le wrap automatiquement en `alerts: [{id: "legacy-<released>", ...}]`.

L'auteur active/désactive **en éditant uniquement ce fichier** :
- `"active": false` OU renommer `alert.json` → `alert.lock` (404 traité comme `no-alert`) → toutes les alertes deviennent inactives
- Pour rediffuser après désactivation : remettre `"active": true` avec un **nouveau `released` timestamp sur chaque alerte qu'on veut re-pousser** → force re-popup chez ceux qui avaient acquitté
- Pour escalader le niveau d'une alerte existante (ex: `info → warning → emergency`) : modifier `level` ET `released` → force re-popup avec nouvelle couleur

**Persistance d'acquittement (v163+)** : `localStorage["myktamap_alert_seen_<id>"]` stocke le `released` acquitté pour CHAQUE alerte individuellement. Permet d'acquitter migration sans toucher à incendie. Fallback rétro-compat sur `localStorage["myktamap_alert_seen"]` (mono) pour les id `legacy-*`.

**Bouton 🚨 du loader — coloration dynamique (v163+)** :
- `🚨 rouge pulsant` si au moins 1 alerte `emergency` non acquittée
- `🚨 orange` si au moins 1 `warning`
- `🚨 bleu discret` si seulement `info`
- `🚨 gris neutre` si aucune alerte active
- **Pastille compteur** (cercle rouge en haut-droite) si N > 1 alertes non acquittées
- Click → `AlertChecker.showCurrent()` qui re-fetch + bypass acquittement + affiche TOUTES les alertes actives en cascade
- L'update du badge est notifié via `AlertChecker.onChange(callback)` après chaque `check()` ou `dismiss()`

**Affichage en cascade** : `_afficherCascade(alerts)` dans `alertChecker.js` itère sur les alertes triées par priorité (`emergency > warning > info`) puis `released` desc. Chaque modale appelle le callback `onClose` qui déclenche la suivante après 250ms de fade-out.

**Modales** (dans `interface.js`) :
- `window.afficherModaleAlerte(alert, onClose)` — `onClose` (v163+, optionnel) callback à la fermeture, utilisé par la cascade
- `window.afficherModaleAlerteAbsente(status)` — modale verte sobre "Aucune alerte en cours" / "Vérification impossible" (offline)

**Hook splash** : pattern identique à `OOMGuard.flushPendingToasts()` et `UpdateChecker.notifySplashEnded()`. Les modales en attente sont flushed par `main.js > _splashEnd()` après le fade-out, jamais par-dessus le gradient sombre du splash.

**Pour ajouter un nouveau fichier live-config** (futur) : créer le `.json` à la racine, NE PAS le mettre dans `ASSETS_TO_CACHE`, créer un module `js/xxxChecker.js` qui suit le pattern (fetch cache-bust + queue splash + notifySplashEnded). Toujours documenter le commentaire d'en-tête de `sw.js` pour rappeler "NE PAS cacher".

**Stratégies du Service Worker** (liste à jour : en-tête de `sw.js`) : réseau seul pour les fichiers de contrôle
ci-dessus, `killsw.html`, les ZIP de plan déclarés, les sondes de fraîcheur et les requêtes d'extension ou
authentifiées ; **réseau d'abord** (délai court, repli sur la copie hors ligne) pour `docs/applications/`,
`lang/*.json`, `data/index.json` et, sur une installation qui déclare des modules, les pages et feuilles de style
de leurs dossiers (contrat : `community-server-line.md` §3) ; **cache d'abord** pour tout le reste, dont l'app
elle-même — ce qui n'a pas de `?v=` n'y change qu'au bump de `CACHE_NAME`.

---

### 22. Sources de vérité version & Badge version footer (depuis 13/05/2026)

**3 sources de vérité version à bumper ensemble à chaque release** :

| Source | Champ | Format actuel (depuis v1.7.1) | Rôle |
|---|---|---|---|
| `sw.js` | `CACHE_NAME` | `myktamap-cache-v1.7.1` | Cache PWA — bump force la purge + re-cache au prochain SW install |
| `js/copyright.js` | `__MKM__.build` | `"v1.7.1"` | Constante embarquée dans le code, affichée dans le badge footer (version installée) |
| `version.json` | `version` | `"v1.7.1"` | Source serveur, comparée par UpdateChecker pour détecter les updates dispo |

**🔢 Format de version — semver-like depuis v1.7.1 (18/05/2026)** :

Avant : `vNNN` (v143, v170, v173…). Maintenant : `vX.Y.Z` :
- **X = MAJOR** : actuel = **1**. Passera à **2** uniquement quand on aura un backend (notion de comptes, partage cloud, etc. — pas avant longtemps).
- **Y = MINOR** : évolutions majeures du projet (multi-plan, V2 tuilé, M-LVL, KMZ, etc.). Cf. tableau de mapping rétroactif dans le journal v1.7.1 du README.md.
- **Z = PATCH** : améliorations / bug fixes / raffinements UX qui ne changent pas l'architecture.

Les anciennes entrées du journal restent nommées en `vNNN` (historique préservé). Nouveau format uniquement à partir de v1.7.1.

**⚠️ Pour les futurs bumps** : décider à chaque release si la change relève d'un PATCH (Z+1), MINOR (Y+1, Z=0), ou MAJOR (X+1, Y=0, Z=0). Quand on hésite → PATCH par défaut, réserver MINOR pour les vraies évolutions architecturales visibles user. MAJOR uniquement quand le modèle de données ou la nature de l'app change fondamentalement (= backend).

**Limite UpdateChecker actuelle** : compare les versions en string simple (`"v1.7.1" !== "v1.7.2"` → nouvelle version détectée). Marche tant qu'on a pas de versions à 2+ chiffres dans un même segment (`v1.7.10` vs `v1.7.9` en string : `"v1.7.10" < "v1.7.9"`). À refactorer en vrai semver compare quand on dépassera 9 patches d'affilée sans MINOR bump.

**Convention de bump** :
- Pour une **vraie release** : les 3 sources ensemble (sw + copyright + version)
- Pour un **test du badge clignotant** : bump UNIQUEMENT `version.json` (simule une nouvelle version côté serveur sans modifier le code)
- Pour un **fix CSS qui doit être propagé** : bump `sw.js` + au choix `copyright.js` selon si on veut afficher la même version qu'avant ou pas

**Badge version cliquable** (`js/homeConfig.js > _initFooterVersion`) :
- `<span id="loaderCopyrightVersion">` dans le footer du loader, en fin de `.kta-loader-copyright-line2`
- 2 états :
  - **Normal** : `v143` gris monospace
  - **Update dispo** : `v141 → v143` bleu clignotant (`.kta-loader-copyright-version-update` + animation `kta-version-update-pulse` 1.8s)
- Évaluation initiale via `localStorage["myktamap_last_version_data"]` (cache UpdateChecker) au DOM ready
- Re-évaluation via `UpdateChecker.onCheck()` callback après le fetch frais (couvre le cas où la version a changé entre 2 boots)
- Au clic : `UpdateChecker.showCurrent()` qui force le re-fetch + affiche soit la modale d'update (bypass snooze), soit `afficherModaleAlerteAbsente("up-to-date")` qui montre les notes de la version installée

**📡 Pastille « hors-ligne »** (`js/homeConfig.js > _initPastilleHorsLigne`, `#loaderOfflineDot`) — un point accolé au badge,
élément **frère** (le badge réécrit son `textContent`) : il ne touche ni au clic du badge ni à son état « update dispo ».
- Source : `SwInspector.etat()` (`js/swInspector.js`) → `{ etat: "ok"|"manquants"|"indisponible", manquants, attendus,
  version, raison? }`. **Comparaison seule** : un message `GET_EXPECTED_ASSETS` au SW + `caches.open().keys()`, zéro
  requête réseau. `indisponible` = pas de SW contrôleur, pas de Cache API, incognito, ou SW muet (timeout 3 s).
- Couleurs : 🟢 `ok` · 🔴 `manquants` en ligne · 🟠 récupération en cours, ou `manquants` avec `navigator.onLine === false`
  · ⚪ `indisponible`. Le rouge seul remonte dans l'en-tête de l'accueil (`#loaderOfflineHdrBtn`, 📥, masqué sinon).
- Clic rouge (pastille ou 📥) : `SwInspector.recuperer(onProgress)` → `REFETCH_MISSING_ASSETS` par paquets de 10 (la
  taille de lot du SW), progression « n/N » dans un message court (`#kta-offline-msg`), puis revérification. Clic vert =
  clic du badge (notes de version). Orange / gris = message court.
- Vérifiée **sans minuterie** : à l'événement `kta-sw-autoheal` émis par `SwInspector.autoHealIfNeeded()` (phase
  `debut` = orange, `fin` = revérifier ; la sortie « skipped » émet aussi `fin`), au `controllerchange`, après un clic.
  Avant le premier résultat (~5 s), la pastille est masquée. `online`/`offline` ne font que repeindre.
- L'inspecteur détaillé (diff fichier par fichier, causes d'échec) est dans le 🛠️ Mode Développeur seulement.

**Modale informative compacte** (`window.afficherModaleAlerteAbsente`) :
- 3 statuts : `"up-to-date"` (clic badge sans update), `"no-alert"` (clic 🚨 sans alerte), `"offline"`
- Conteneur dédié `.kta-alert-absent-overlay.kta-alert-absent-compact` (vs `.kta-readme-modal-overlay` qui est plus lourd) :
  - Backdrop **0.55 opacité** au lieu de 0.88 (plus léger)
  - Box max-width 440px, **hauteur déterminée par le contenu** (pas de plein écran inutile pour 2-3 lignes)
- Pour `"up-to-date"` : lit `localStorage["myktamap_last_version_data"]` et affiche un bloc `.kta-alert-absent-version-block` avec :
  - Date de publication (`released`)
  - Titre "📝 NOTES DE CETTE VERSION" en uppercase letter-spacing
  - Liste à puces des `notes[]`
- Fermeture : OK / clic backdrop / Échap

**API `window.UpdateChecker` exposée** :
- `check()` → wrap autour du check interne qui notifie ensuite les listeners. Lancé au boot.
- `notifySplashEnded()` → flush la modale différée si pendant le splash
- `showCurrent()` → force le re-fetch + modale update (bypass snooze + LS_SEEN) — appelé par le badge cliquable
- `onCheck(callback)` → s'inscrit aux résultats de check() pour l'UI (badge)
- `getCurrentVersion()` → lit `localStorage["myktamap_known_version"]`
- `getLastKnownData()` → lit `localStorage["myktamap_last_version_data"]`

---

### 29. Migration domaine `is-underground.fr` → `myktamap.fr` (depuis v163)

Stratégie de transition douce du domaine historique vers le nouveau domaine officiel, prévue pour le **15 juillet 2026**.

**Approche cohabitation 60 jours** (au lieu d'un kill switch immédiat) :
- Les 2 domaines servent la même app v163+ en parallèle pendant ~2 mois
- Sur l'ancien domaine, l'utilisateur est informé via une **entrée `info` dans `alert.json`** (cf §20 et v167 sélecteur multi-alertes) — rappel discret via badge 🚨 bleu, l'user lit quand il veut
- Aucune perte de données : l'utilisateur a le temps d'exporter ses sessions via 💾 et de migrer à son rythme
- À J+60, déploiement de la conf Nginx `docs/nginx-redirect-old-domain.conf` (kill switch SW + page de transition)

**Historique** : v163-v167 avait aussi un module `js/migrationNotice.js` qui affichait une modal one-shot pédagogique au premier lancement. **Supprimé en v168** car doublon avec l'alerte info `alert.json` qui est plus discrète et déjà visible en permanence via le badge 🚨. Le code git history conserve `migrationNotice.js` pour référence (commit `aea3a1e` introduisait, `?` supprime).

**Fichier `docs/nginx-redirect-old-domain.conf`** : conf Nginx prête à déployer à J+60. Contient :
1. `/sw.js` → kill switch SW inline (purge caches + unregister + force reload des clients)
2. `/manifest.json` → manifest "vide" pointant `myktamap.fr` pour éviter ré-install ancien domaine
3. Tous les autres paths → page HTML de transition (cleanup JS + redirect avec triple filet meta/JS/countdown)
4. Headers `no-cache, no-store` strict partout

**Fichier `docs/alert-example-migration.json` (archivé : tag Git `archive-docs-2026-09-30`)** : exemple `alert.json` multi-alertes avec entrée info migration + emplacement commenté pour alerte ponctuelle (incendie, etc.). Le vrai `alert.json` racine (servi en prod) contient déjà les 2 alertes (gaz toxiques emergency + migration info) au format v163+.

**Constantes à mettre à jour quand `myktamap.fr` sera DNS-pointé** :
- `js/copyright.js > __MKM__.site` (sur le nouveau domaine, garder l'ancien sur l'ancien domaine pour cohérence pendant la transition)
- Meta tags `<head>` dans `index.html`
- Mentions dans `README.md` / `README_USER.md` / `AI_CONTEXT.md`
- Dans `alert.json > details` de l'alerte migration : retirer la mention "🚧 myktamap.fr est en cours de mise en service" et ajouter le lien actif

---

### 29bis. CI GitHub : garde-fous à chaque push (`.github/workflows/ci.yml`, audit CI/CD du 08/10/2026)

- **`ci.yml`** (push `Karma_dev` / `main`, PR) : `node --check`, **`scripts/ci-commits.sh`** (anti-fuite pro et
  `data/` hors Git rejoués **commit par commit** sur la plage du push — `Data-deroge:` lu dans le message ;
  `check-no-pro-leak` et `check-data-hors-git` acceptent `KTA_FICHIERS_CI` ; `check-noms-reels --message` relit
  le message de chaque commit), puis **`.githooks/pre-commit`** (tous les garde-fous ; `check-noms-reels` y relit
  **tous** les fichiers suivis, `CI` étant posé). Un hook contourné ne passe plus en silence. Dépôt privé : quota gratuit des minutes Actions.
- **`ci.yml` › `marquer-vert`** (push seulement, après les garde-fous) : pose `refs/ci/verte/<branche>` sur le
  commit — référence hors branches et hors tags, réécrite à chaque CI verte, lue par le déploiement automatique (§85).
- **`ci.yml` › `tableau-garde-fous`** (chaque run, en parallèle, **indicatif**) : `scripts/garde-fous-tableau.js`
  lance un par un les scripts listés dans `.githooks/pre-commit` (liste lue dans le hook, rien à tenir à jour) et
  écrit nom · type (bloquant / consultatif) · durée · statut · 1re ligne d'erreur dans le résumé du run
  (`$GITHUB_STEP_SUMMARY`) ; `--json` en local. Sort toujours en 0, `continue-on-error`, hors des `needs` de
  `marquer-vert` : il ne rougit rien et ne retient aucun déploiement — le verdict reste celui du pre-commit. Placé
  dans `ci.yml` et non `smoke.yml` pour tourner à chaque push (voir un garde-fou ralentir). Pas d'historique.
- **`smoke.yml`** (manuel seulement : Actions › Smoke › Run workflow, sur n'importe quelle branche) : `npm ci` de
  `scripts/smoke` (le `postinstall` télécharge Chromium) + `playwright install-deps`, puis `smoke.js` — il démarre
  son serveur (port 8123, CSP stricte de `docker/nginx-docker.conf`). Le checkout n'a dans `data/` que ce que Git
  suit (`data/index.json` + le relevé fictif `data/test`) : une étape vérifie que l'index pointe bien un relevé
  fictif avant d'installer quoi que ce soit. Journal dans le résumé du run ; en échec, `smoke-resultats/` (journal
  complet) en artefact 14 jours — `smoke.js` ne produit pas de capture. Aucun secret. C'est la marche 1bis de la porte
  (`docs/RELEASE_GATE.md`) lançable sans poste, depuis un téléphone ; la marche 2 (12 points sur dev, à la main)
  reste manuelle.
- **`docker.yml`** : job `ci-verte` (attend la CI du commit taggé, 20 min max) avant toute image ghcr.io.
- **`sonde-integrite.yml`** (toutes les heures, et à la main) : le code SERVI par myktamap.fr et dev.myktamap.fr est-il
  celui du dépôt ? `scripts/release/sonde-integrite.js` lit `/deploiement.json` (commit déployé : connu du dépôt et
  descendant de sa branche), puis compare l'empreinte de chaque fichier de code suivi (html, js, css, json) servi au
  contenu Git. Un écart = run en échec = e-mail. Raison : après un piratage du serveur, le chiffrement protège ce qui
  est stocké, pas une page modifiée en place — il faut le SAVOIR. Tourne hors du serveur ; limite : on ne voit que ce
  qui nous est servi. À la main : `node scripts/release/sonde-integrite.js https://myktamap.fr`.
- **`merge-main.ps1`** : refuse si la branche n'est pas poussée telle quelle ou si sa CI n'est pas verte — il lit
  la même marque `refs/ci/verte/<branche>` que le VPS (`git ls-remote`, sans jeton ni coffre d'identifiants Windows,
  donc utilisable dans une session SSH ouverte depuis le téléphone) ; marque illisible = `DEROGE`. Tient lieu de
  protection de branche. Le poste parle à GitHub en SSH (clé `~/.ssh/github_poste`, remotes `git@github.com:…`) :
  en HTTPS, l'identifiant rangé dans le coffre Windows est inaccessible depuis SSH.
- **Dependabot** (`.github/dependabot.yml`) : actions GitHub, `scripts/smoke` et les librairies de `lib/` (manifeste
  déclaratif `lib/package.json`, hebdomadaire), PR vers `Karma_dev`. Une PR sur `lib/` ne change que le manifeste :
  `check-libs.js` (bloquant) la retient tant que le fichier embarqué et **`lib/VERSIONS.md`** n'ont pas suivi — la mise
  à jour réelle reste un geste testé (marche à suivre dans `lib/VERSIONS.md`).
- **Pas de Sonar en CI** : SonarQube tourne en local (Docker), injoignable depuis un runner GitHub — marche 1ter
  de `docs/RELEASE_GATE.md`.

### 30. GitHub Releases automatiques (`.github/workflows/release.yml`, depuis v169)

À chaque bump de `version.json > version` mergé sur `main`, un workflow GitHub Actions auto-crée :
1. Un **tag git** `v<version>` (ex: `v169`) sur le commit du bump
2. Une **Release GitHub** avec les notes user-facing extraites de `version.json > notes` (formatées en markdown bullets)
3. Un lien "📊 Voir tous les commits depuis v<précédent>" pointant vers la page compare GitHub

**Trigger** : `push` sur `main` qui modifie `version.json` (filtre `paths`). Évite de tourner pour chaque commit non-release.

**Garde-fous** :
- Skip si la version dans `version.json` n'a pas changé entre HEAD et HEAD~1 (= edit d'une typo sans bump → pas de nouvelle release)
- Skip si une release pour ce tag existe déjà (= si déjà créée manuellement avant que le workflow tourne, ou re-tagger)

**Permissions** : `contents: write` sur le `GITHUB_TOKEN` du workflow (suffit pour créer tags + releases).

**Pour les futurs devs / agents** :
- Continuer le workflow normal : bumper les **3 fichiers** (`sw.js > CACHE_NAME`, `js/copyright.js > __MKM__.build`, `version.json > version`)
- Mettre à jour les notes user-facing dans `version.json > notes` (3-5 bullets concis)
- Push sur main → la Release GitHub apparaît automatiquement dans la minute (cf. https://github.com/Karmakta91/MyKTAMap/releases)
- **Ne pas** créer manuellement de tag/release sauf si pour antidater une version existante (cf. commentaire d'en-tête du YAML pour les commandes)

**Source des notes** : `version.json > notes` est volontairement court (user-facing, milestone). Le `README.md > Journal des modifications` reste la source de vérité **technique** pour les devs, avec un niveau de détail beaucoup plus fin (fichiers modifiés, pièges, etc.).

**Initialisation v168** : la version courante v168 n'avait pas de tag/release associé au moment du déploiement du workflow. Le commentaire d'en-tête du fichier `.github/workflows/release.yml` contient la commande à lancer une fois pour antidater proprement v168. Les versions suivantes (v169+) sont auto.

---

### 74. Professionnalisation + nettoyage code mort (v1.26.2 + v1.26.3 — 2026-05-27)

Le projet prenant de l'ampleur, KARMA a lancé une passe de professionnalisation + nettoyage. Deux axes : (A) retrait du code mort accumulé, (B) montée en sérieux du ton/vocabulaire face utilisateur.

KARMA quote :
> « gros coup de propre code mort, typiquement l'ancienne interface » — puis — « rendre le truc plus PRO, c'était rigolo au début le mode Bourré mais vu que le projet prend de l'ampleur on remplace »

#### 74.1 Renommage mode « Bourré 🍺 » → « Blessé 🤕 » (v1.26.3)

Le preset de vitesse le plus lent (2 km/h) de l'échelle partagée Itinéraire + Mode perdu. Renommé pour un ton pro adapté à un outil de secours.

| | Avant | Après |
|---|---|---|
| Clé technique | `bourre` | `blesse` |
| Label | Bourré | Blessé |
| Emoji | 🍺 | 🤕 |
| Hint | « Très lent, confus, désorienté » | « Progression entravée, très lent, terrain accidenté » |

**Échelle complète inchangée** : `blesse` (2) / `lente` (3) / `normale` (5, défaut) / `rapide` (7).

**⚠️ Migration localStorage** : la clé `bourre` était persistée dans 2 slots (`myktamap_lost_preset` + `myktamap_iti_walking_preset`). Micro-migration au boot dans `lostMode.js > _initialPreset` et `interface.js > _getItiSpeedPreset` : `if (v === "bourre") { v = "blesse"; localStorage.setItem(...) }`. Pattern transparent — l'user garde son réglage. À ne PAS retirer avant plusieurs versions (sinon les vieux clients perdent le preset → fallback `normale`).

**Sites modifiés** : `js/lostMode.js`, `js/interface.js` (preset iti + aide intégrée ×2), `js/tutorial.js` (carte onboarding), `docs/README_USER.md` (×2 tables), `docs/AI_CONTEXT.md` (×2).

#### 74.2 Ton pro — messages lockout sécurité

`js/unlockGate.js` + `js/pinLock.js` : la phrase argotique « Le brute force c'est mal, m'voyez. » sur les écrans de lockout (5 tentatives échouées) → remplacée par des formulations factuelles (« Accès verrouillé par sécurité. » / « Verrouillage de sécurité actif après plusieurs tentatives échouées. »). Un écran de sécurité doit être sobre.

#### 74.3 Nettoyage code mort (v1.26.2, ~395 lignes)

4 lots, du plus sûr au plus risqué, prouvés inatteignables (cf cartographie complète) :

| Lot | Quoi | ~Lignes |
|---|---|---|
| 1 | Commentaires QR Phase 4 rollback (sw.js, css, index.html) | -23 |
| 2 | `attacherGpsPasteSplit` (utils.js, déprécié hotfix21) + `_dessinerFooterLegende` (pdfExport.js, DEAD CODE) | -260 |
| 3 | Branches mortes interface.js : `_ouvrirPlanSwitcherLegacy` + 2 `if(_refonteInterfaceActive !== true)` | -100 |
| 4 | Bloc legacy early-return `if(!_refonteInterfaceActive){return}` dans refonteInterface.js | -12 |

**Contexte clé** : depuis v1.14.19, `refonteInterface.js > _readFlag()` retourne **toujours `true`** (l'ancienne interface a été supprimée). Toute branche `_refonteInterfaceActive !== true` est donc du code mort.

**🟡 Restant (non touché, à nettoyer plus tard si confirmé)** : `_setActive` + `_afficherConfirmInterfaceChange` + `_writeFlag` (refonteInterface.js, ~84 lignes) — interdépendants, conservés car le toggle d'interface pourrait théoriquement revenir. À retirer dans un futur cleanup si abandon définitif confirmé.

#### 74.5 Nettoyage jargon dev dans l'aide utilisateur (v1.26.3)

L'aide intégrée (`interface.js > afficherAide`) était truffée de technique destinée aux devs. Nettoyage :
- **~38 mentions de version internes retirées** (`(v1.14.19)`, `(hotfix21)`, `Depuis v1.10.3`, `(depuis Karma_dev / v169)`, `§67`…) — l'historique reste dans `version.json` + CLAUDE.md, pas besoin en façade user
- **~30 termes vulgarisés** : `localStorage` → « sur cet appareil », `IDB dédiée` → « stockage local dédié », `data layer` → « calque du plan », `RAM-only` → « repart à zéro au rechargement », `Battery Status API` → « fonction batterie du navigateur », `Service Worker`/`caches PWA` → « cache de l'app », `viewport culling`, `cross-device`, `segmented control`, `FIFO`, `barycentre`, etc.
- **8 messages d'erreur user-facing reformulés** : « jsPDF non chargé (lib/jspdf.umd.min.js) » → « Module d'export PDF indisponible. Recharge l'application. » (idem JSZip, IDB, fetch) dans pdfExport.js, secoursMode.js, sessionExporter.js, interface.js, refonteInterface.js

**Assumé volontairement technique** (non touché) : la section **Inspecteur mémoire** (`localStorage`/`IndexedDB`/`Cache PWA`/`Runtime`) — c'est un outil de transparence/debug où le jargon est légitime.

**Commentaires de code** : AUCUN nettoyage (audit conclut que le code est très bien commenté, les commentaires expliquent le *pourquoi* = valeur à préserver).

#### 74.6 À NE PAS faire

- ❌ Retirer les micro-migrations `bourre → blesse` avant plusieurs versions (vieux clients perdraient leur preset)
- ❌ Ré-introduire de l'argot/humour dans les STRINGS UI face utilisateur (les commentaires de dev internes peuvent rester décontractés, c'est la façade qui doit être pro)
- ❌ Supprimer les 🟡 restants sans re-confirmer qu'aucun toggle d'interface ne reviendra
- ❌ Toucher aux `legacy` de migration DONNÉES (sessionPersist, kmzImport, profileExportImport, etc.) — c'est de la rétro-compat vivante, pas du code mort

---

### 80. Infra & DX — Selfhost ZIP auto + CLAUDE.md slim + guard-git affiné (v1.29.4 — 2026-06-02)

3 améliorations d'infrastructure et de Developer eXperience livrées dans une même PATCH.
Aucun impact runtime utilisateur, 100 % côté outillage repo / dev / IA.

#### 80.1 Selfhost ZIP auto attaché aux GitHub Releases

`.github/workflows/release.yml` complété : à chaque GitHub Release publiée, un **ZIP
selfhost** est généré automatiquement et attaché en asset téléchargeable. Permet à un user
de récupérer une copie figée et déployable de l'app (sur son propre serveur, NAS, RPI, etc.)
sans devoir cloner le repo.

**Pattern** (extrait `release.yml`) :

```yaml
- name: Package selfhost ZIP
  run: |
    mkdir -p _release
    zip -r "_release/myktamap-selfhost-${{ github.event.release.tag_name }}.zip" . \
      -x ".git/*" -x ".github/*" -x ".claude/*" -x "_release/*" \
      -x "*.md" -x ".gitignore" -x "docs/architecture/*"
    # On garde uniquement l'app runnable : HTML/CSS/JS/icônes/libs + README user

- name: Attach ZIP to release
  uses: softprops/action-gh-release@v2
  with:
    files: _release/myktamap-selfhost-${{ github.event.release.tag_name }}.zip
```

**Volontairement exclus du ZIP** :

| Exclusion | Pourquoi |
|---|---|
| `.git/`, `.github/`, `.claude/` | Métadonnées repo / CI / IA — inutiles côté déploiement |
| `docs/architecture/` | Docs internes — inutiles côté user final |
| `*.md` (top-level) | README dev/repo — inutiles côté user (sauf docs/applications/README_USER qu'on garde via le subpath, lui CACHÉ par SW pour la modale Documentation) |
| `_release/` | Le dossier de sortie lui-même (évite la récursion) |

**Cible** : urbexers / spéléos qui veulent déployer une copie statique sur leur infra
(NAS Synology, RPI, hébergement perso). Servir l'app c'est juste `nginx -s /chemin/`,
pas besoin de Node ni de build.

#### 80.2 CLAUDE.md slim contextuel + docs/architecture/

Le `CLAUDE.md` racine était devenu un mur de ~1500 lignes avec absolument tout (archi, conventions,
modes secours, perf, debug, etc.). Conséquence : trop lourd à charger à chaque session IA + risque
de noyer les règles critiques dans la masse. KARMA a déclenché un **scindage en 14 docs thématiques**
chargés à la demande :

```
docs/architecture/
├── data-formats.md            (formats JSON: plan-config, point, session)
├── exports.md                 (PNG/PDF/KMZ/GPX + légende)
├── gotchas.md                 (pièges connus & renommages)
├── infra-versioning.md        (versioning, live-config, releases, logs)
├── multilevel-pathfinding.md  (M-LVL, Dijkstra, itinéraire)
├── perf-memory.md             (perf, mémoire, OOM, tiling V2, ULTRA)
├── plans-loader.md            (registre, loader, générateur de plans)
├── rendering-leaflet.md       (icônes, calques, splash)
├── secours.md                 (Mode Secours toutes phases)
├── security-legal.md          (gates, PIN, audit, légal, licence)
├── session-data.md            (session, photos, undo, recherche, stats, favoris)
├── tracking.md                (tracker, boussole, heading, navigation)
└── ui.md                      (refonte UI, thème, modales, filtres, i18n)
```

`CLAUDE.md` racine devient un **index** + règles critiques (frontière community ↔ pro, garde-fous,
conventions JS/CSS/coords/distances, style KARMA) + une **table « Où chercher »** qui pointe vers
le bon doc selon le sujet.

**Bénéfices mesurés** :

| | Avant slim | Après slim |
|---|---|---|
| `CLAUDE.md` racine (lignes) | ~1500 | ~70 |
| Charge contextuelle session IA | Lourde (tout en mémoire) | Légère (index + chargement à la demande) |
| Temps de lecture humain | « hostile » | « digérable » |
| Risque de noyer les règles critiques | HIGH | LOW |

#### 80.3 `guard-git.js` affiné — fonction `originIsCommunity()`

`.claude/hooks/guard-git.js` bloque les opérations Git dangereuses (`push main`, `push --force`,
`reset --hard`, etc.) côté community via un hook pré-bash de Claude Code (cf §settings.json).

**Problème détecté** quand on a commencé à bosser côté repo `MyKTAMap-pro` : le hook bloquait
AUSSI le push main dans le pro alors que le pro a son propre cycle (rebase + push --force-with-lease
pour absorber les drifts community).

**Fix** : ajout d'une fonction `originIsCommunity()` qui distingue les 2 repos selon l'URL
de `git config --get remote.origin.url` :

```js
function originIsCommunity() {
  const out = execSync("git config --get remote.origin.url", { encoding: "utf8" }).trim();
  // Match strict: l'URL contient "MyKTAMap" mais PAS "MyKTAMap-pro"
  return /MyKTAMap(\.git)?$/.test(out) && !/MyKTAMap-pro/.test(out);
}

function blockPushMain(cmd) {
  if (!originIsCommunity()) return null;  // hook inactif côté pro
  if (/git\s+push.*\bmain\b/.test(cmd)) return "🚫 push main bloqué (community)";
  // ... autres règles community-only
}
```

→ **Hook actif** uniquement côté community. Côté pro, on garde toutes les autres protections
(check syntaxe, etc.) mais le `push main` est autorisé.

#### 80.4 À NE PAS faire

- ❌ Re-fusionner les 14 docs dans `CLAUDE.md` — annule le bénéfice du slim contextuel
- ❌ Ajouter du contenu volumineux directement dans `CLAUDE.md` racine — il doit rester un
  index/règles critiques. Tout détail métier va dans `docs/architecture/<sujet>.md`
- ❌ Inclure `docs/architecture/` dans le ZIP selfhost — c'est interne, le user final n'en a
  pas l'usage et ça ajoute du poids
- ❌ Modifier `originIsCommunity()` pour matcher d'autres patterns d'URL sans tester les 2 repos
  (le hook DOIT bloquer côté community ET laisser passer côté pro)
- ❌ Ré-introduire un `git push main` autorisé côté community sans accord explicite KARMA
  ("oui je le veux" — cf MEMORY.md feedback `feedback_push_main_explicit_consent`)
- ❌ Désactiver le hook `guard-git.js` "temporairement" — c'est exactement le filet qui empêche
  les opérations destructrices. À traiter comme un fusible : on diagnostique POURQUOI il bloque,
  on n'éteint pas le fusible

---

### 81. Règles DX émergées pendant le perf sweep v1.31.1 → v1.31.5 (2026-06-03)

3 règles de doctrine DX ont émergé organiquement pendant le sprint perf v1.31.x
(8 bumps en moins de 24h : v1.31.1 P7 OOMGuard, v1.31.2 P9 polylines, v1.31.2-fix1
nettoyage notes, v1.31.3 polish docs/aide, v1.31.4 P2 lazy CSS step 1, v1.31.5 step 2,
v1.31.5-fix1 SW offline). Ces règles vivent dans `CLAUDE.md` racine pour l'opérationnel
mais méritent une trace ici comme partie de la doctrine **versioning + release** du projet.

#### 81.1 Règle A — `Bump = sync docs sur 4 axes`

**Énoncé** : tout bump de version (PATCH/MINOR/MAJOR) doit déclencher une vérification
+ MAJ obligatoire sur **4 axes documentaires distincts**. Considérer la release faite
sans ces 4 syncs = dette technique immédiate.

| Axe | Cible | Quand sync ? |
|---|---|---|
| 📱 **In-app** | `docs/applications/README_USER.md` + `README_USER.en.md` (modale Documentation) · `js/interfaceDocs.js` (Aide intégrée) · `docs/applications/AI_CONTEXT.md` (modale Aide IA) | Si UX user touchée OU nouvelle fonctionnalité |

**⚠️ AI_CONTEXT.md est BALISÉ PAR PROFILS depuis v1.69.0** (refonte Aide IA) : marqueurs
`<!-- @@PROFIL usage,diagnostic -->` (un marqueur s'applique jusqu'au suivant ; `tous` =
commun). La modale 🤖 Aide IA génère 4 sorties (usage ~115 Ko · diagnostic ~80 Ko ·
plans ~80 Ko · complet ~130 Ko) filtrées par `interfaceDocs.js > _filtrerContexteParProfil`.
Règles d'édition (cf note en tête du fichier) : toute nouvelle recette/FAQ reçoit un
marqueur ; les listes fermées anti-hallucination + le survol restent en zone commune ;
la doc intégrale (`{{README_USER}}`) n'est **plus injectée** — tenir la section
« 🗓️ Version actuelle » (digest des nouveautés) à jour à chaque release marquante, et
NE PAS re-remplir le survol avec des notes de release dev (c'est ce qui l'avait fait
gonfler à 153 Ko — le digest + README.md suffisent pour l'historique).
| 🔒 **Audit** | `docs/applications/NETWORK_AUDIT.md` (état actuel, en-tête de version) · `NETWORK_AUDIT_HISTORIQUE.md` (note `### vX.Y.Z (titre)` en tête de « Notes par version », page à part depuis le 07/10/2026). Les deux `.html` servis sont **générés** : `node scripts/audit-html.js` (voir « Pages d'audit générées » ci-dessous) | À chaque release (verdict réseau attendu par les users qui auditent) |
| 📖 **Dev** | `README.md` racine : « Version courante » en tête = la version en cours SEULE ; les résumés précédents en bas, section « 🗂️ Résumés des versions précédentes » (le précédent y descend à chaque bump) ; entrée détaillée en tête du journal | À chaque release |
| 🤖 **Archi IA** | `CLAUDE.md` racine (si règle/archi change) + `docs/architecture/<sujet>.md` (selon sujets impactés) | Si pattern technique nouveau, refactor structurel, lesson learned |

**Pattern de commit** observé : chaque release de v1.31.x avait une section
"Sync 4 axes docs" dans le commit message qui listait explicitement ce qui était fait
ou SKIPé sur chacun des 4. Format type :

```
Sync 4 axes docs (4)
  📱 In-app   : SKIP justifié (perf interne, aucun changement UX)
  🔒 Audit    : NETWORK_AUDIT.md (en-tête) ; NETWORK_AUDIT_HISTORIQUE.md — ### vX.Y.Z ; .html régénérés
  📖 Dev      : README.md — MAJ "Version courante"
  🤖 Archi IA : perf-memory.md §X (pattern + gain + À NE PAS faire)
```

Le **SKIP** est OK et même utile (explicite que la non-modif est intentionnelle), mais
ne JAMAIS oublier UN des 4 axes silencieusement.

**Pages d'audit générées** (10/10/2026). `NETWORK_AUDIT.html` et `NETWORK_AUDIT_HISTORIQUE.html` (ouvertes depuis
⚙️ → 🔒 Confidentialité, précachées pour le hors-ligne) sont le **rendu** de leurs `.md`, seule source :
- `node scripts/audit-html.js` les réécrit ; `--check` n'écrit rien et sort en 1 si une page diffère. Reproductible
  (aucune date ni hasard, fins de ligne LF : deux passages = mêmes octets).
- Moteur Markdown autonome `scripts/md-mini.js` (copie du moteur du site de documentation, même auteur — le dépôt
  community ne dépend d'aucun autre dépôt). Tout HTML brut du `.md` est échappé ; liens `javascript:`/`data:` refusés ;
  un lien vers l'autre `.md` d'audit vise sa page `.html`.
- Gabarit dans `audit-html.js` (retour, pied community/pro) ; mise en page `docs/applications/audit.css` ; pied
  `docs/applications/audit-pied.js` (pose `.kta-instance-pro` d'après `Licence-pro.json`). Aucun style ni script
  écrit dans la page (CSP `script-src 'self'`). Les tableaux défilent dans leur cadre : pas de débordement à 390 px.
- Conventions du `.md` : la citation sous le `# titre` devient le chapeau (`.meta`, « À jour pour la version ») ; un
  `---` juste avant un `##` disparaît (le titre porte déjà son filet) ; une ligne `<!-- kta:classe nom -->` pose la
  classe `nom` sur le bloc suivant (`kta-promesse`, `kta-alerte`, `kta-auteur`), invisible sur GitHub.
- 🛡️ `scripts/check-audit-html.js` (pré-commit, donc CI — bloquant) : chaque `.html` **de l'index** doit être
  exactement le rendu de son `.md` de l'index (ni `.md` modifié sans régénérer, ni `.html` retouché à la main), et
  `audit.css` / `audit-pied.js` / les deux pages doivent être dans `sw.js > ASSETS_TO_CACHE`. Il ne lit pas
  `git diff --cached` : contrôle complet à chaque passage, valable tel quel en CI (pas de `KTA_FICHIERS_CI`).
  `check-release-docs.js` (commit-msg, au bump) exige en plus `### vX.Y.Z` dans l'historique `.md`.

#### 81.2 Règle B — `version.json > notes` USER-FRIENDLY

**Énoncé** : les entrées dans `version.json > notes` sont lues par l'user final via :
- La modale "Mise à jour disponible" (consommée par `updateChecker.js`)
- Le badge version en footer

→ Donc **ZÉRO jargon technique**. **1-2 phrases courtes** par entrée.

❌ **À éviter** :
- Noms de fichier (`js/foo.js`, `css/style.css`)
- Constantes en CAPS (`AUTO_SAVE_INTERVAL_MS`, `KILL_FRESHNESS_MS`)
- Noms d'algorithmes (`Ramer-Douglas-Peucker`, `AABB`, `LRU`)
- Mesures de perf en ms ou %
- Codes de version internes (`P7`, `P9`, `B2`, `step 2`)
- Lignes "Sources de vérité v1.X.Y" — dette technique inutile à l'user, déjà tracée
  par `sw.js > CACHE_NAME` + `js/copyright.js > __MKM__.build`

✅ **À faire** :
- Décrire **ce que l'user voit ou doit savoir** en langage clair
- Bénéfice perceptible ("démarrage plus rapide", "batterie économisée", "pan/zoom plus fluide")
- Réassurance si pas de changement visible ("aucun changement fonctionnel", "tes plans et tes
  annotations restent identiques")

**Exemple avant/après** (extrait v1.31.2 réel) :

```
❌ AVANT (~360 mots) :
"🚀 PATCH v1.31.2 — **Optimisation perf P9** : refresh viewport
incrémental pour les polylines roads (mode PerfUltra ULTRA).
**Aucun changement fonctionnel côté utilisateur**. Avant v1.31.2 :
à chaque pan/zoom, `js/road.js > renderRoads()` détachait TOUTES
les polylines puis les recréait depuis zéro — coûteux O(N) sur
plans denses (100+ tracés)..."

✅ APRÈS (~30 mots) :
"🚀 v1.31.2 — Pan/zoom plus fluide sur les plans denses (100+ tracés)
en mode 🚀 Performance ULTRA. Tes plans, tes tracés et tes
annotations restent identiques. Aucun téléchargement supplémentaire."
```

**Où vit la doc technique détaillée** : `docs/architecture/<sujet>.md` (pour les agents IA
+ les devs) + commit message (pour bisect Git) + `NETWORK_AUDIT.md` (pour la transparence
réseau spécifique). **PAS** dans `version.json`.

#### 81.3 Règle C — `version.json > notes` = UNIQUEMENT le dernier bump

**Énoncé** : le tableau `notes` de `version.json` ne contient QUE la note de la
version courante (1-2 entrées max). Les notes des versions précédentes sont
**supprimées** à chaque bump — pas de cumul.

**Pourquoi** : l'user qui clique "Mettre à jour" voit la modale "Mise à jour disponible"
qui affiche `version.json > notes`. Si on cumule l'historique de 5+ versions, l'user est
noyé sous l'info. Il veut juste savoir "qu'est-ce qui change MAINTENANT".

**Où vit l'historique** :
- 📖 `README.md` racine (journal des versions, "Version courante" + "Précédentes shipped main")
- 🔄 Commits Git (1 commit par release avec message détaillé, bisectable)
- 🔒 `NETWORK_AUDIT.md` (verdict réseau cumulatif depuis v1.7.x, ne s'efface jamais)

**Exemple correct** d'un `version.json` après bump :

```json
{
  "version": "v1.31.4",
  "released": "2026-06-03",
  "notes": [
    "🎨 v1.31.4 — Démarrage plus rapide : les styles du Mode Secours (~13 % du CSS de l'app) sont désormais chargés à la demande, pas au boot. Aucun changement visible côté utilisateur."
  ]
}
```

**Une seule entrée**, sur la version courante, dans le style §81.2.

#### 81.4 Application des 3 règles dans le sprint v1.31.x

| Bump | Sync 4 axes ? | Notes user-friendly ? | Notes = dernier bump uniquement ? |
|---|---|---|---|
| v1.31.1 (P7 OOMGuard) | ✅ | ❌ → corrigé en v1.31.2-fix1 | ❌ → corrigé en v1.31.2-fix1 |
| v1.31.2 (P9 polylines) | ✅ | ❌ → corrigé en v1.31.2-fix1 | ❌ → corrigé en v1.31.2-fix1 |
| **v1.31.2-fix1 (nettoyage notes)** | ✅ | ✅ posé | ❌ → corrigé en v1.31.3 |
| **v1.31.3 (polish docs user)** | ✅ | ✅ | ✅ posé |
| v1.31.4 (P2 lazy CSS step 1) | ✅ | ✅ | ✅ |
| v1.31.5 (P2 lazy CSS step 2) | ✅ | ✅ | ✅ |
| v1.31.5-fix1 (SW offline) | ✅ | ✅ | ✅ |

→ Les 3 règles sont arrivées **organiquement** au fil du sprint, validées par leur
application répétée sur 7 bumps consécutifs. Elles sont maintenant codifiées dans
`CLAUDE.md` racine (section "Commandes & validation") pour l'opérationnel et
documentées ici pour la doctrine.

#### 81.5 À NE PAS faire

- ❌ **Bumper sans toucher aux 4 axes** sans même un SKIP explicite — l'absence de mention
  est ambigüe (oubli ou choix ?). Toujours indiquer le SKIP dans le commit pour traçabilité.
- ❌ **Réintroduire du jargon technique dans `version.json > notes`** pour faciliter le
  bisect dev — c'est exactement ce que les 3 niveaux d'historique (README, commits,
  NETWORK_AUDIT) servent. La modale user a son propre rôle.
- ❌ **Cumuler les notes** dans `version.json` "au cas où" pour les users qui auraient
  raté plusieurs releases — la modale "Mise à jour disponible" est volumineuse côté UI,
  l'user doit voir 1-2 phrases max, pas un changelog.
- ❌ **Garder une ligne "Sources de vérité v1.X.Y"** dans les notes — c'est de la doc
  d'ingénierie inutile à l'user et déjà tracée par le couple `sw.js > CACHE_NAME` +
  `js/copyright.js > __MKM__.build` (consommés par les checks d'intégrité côté SW et
  par `_compareVersions` d'updateChecker).
- ❌ **Sync SEULEMENT l'audit ou SEULEMENT le README** — c'est l'erreur classique des
  hotfix rapides. Tous les axes doivent être à jour ensemble pour éviter les déphasages
  (= un user qui lit le README à jour mais l'audit obsolète, ou inverse).

---

---

## 🧹 B7 — Découpe du monolithe index.html (v1.66.0)

> Décisions KARMA 1:a 2:b 3:a. Le bloc `<script>` inline (~232 Ko, ex-lignes 1433-6050) vivait dans UNE closure `window.addEventListener("load", …)`. Découpé VERBATIM en 3 modules + résiduel inline.

**Structure post-B7** (`index.html` ≈ 101 Ko) :
- `js/homeLoader.js` — chrome loader, `setStatus`, overlay, import/extraction ZIP, liste des plans, `chargerPlanDuRegistre`, modales plan introuvable / re-sélection.
- `js/homeProfile.js` — bandeau profil, rangs, hauts faits, stockage, modale détails, édition pro, stats agrégées + `afficherChoixImportListe`.
- `js/homeConfig.js` — modale Config ⚙️, flux PIN, badges alertes/paranoïa, thème, journal réseau.
- Résiduel inline : segmented perf + debug, puis bloc boot SW (inchangé).

**Règles à respecter (sinon casse silencieuse)** :
- ⚠️ Les 3 `<script src>` sont **SANS `defer`** et wrappés `addEventListener("load")` chacun — l'ordre d'enregistrement des listeners (`homeLoader → homeProfile → homeConfig → résiduel`) reproduit l'ordre d'exécution du bloc d'origine. **Ne pas réordonner, ne pas ajouter `defer`.**
- Les fichiers partagent des symboles via **ponts `window.X = X`** en fin de wrapper (6 ponts : `setStatus`, `chargerPlanDuRegistre`, `onLoadPlanClick`, `reSelectionnerZipPourPlan`, `afficherChoixImportListe`, `getLoaderPerfPreset`) — les identifiants nus des autres closures se résolvent sur l'objet global. **Toute nouvelle dépendance croisée entre ces fichiers doit passer par un pont window.***, jamais par un identifiant de closure.
- Extraction VERBATIM : si un bloc doit être retravaillé, le faire dans une release SÉPARÉE du moindre déplacement.

---

### 83. Suite de garde-fous pré-commit — état au 05/09/2026

> ⚠️ **La table ci-dessous a compté 14 lignes pendant que le hook en câblait 22** — exactement le défaut que ce fichier existe pour éviter. Les **dix** manquants, tous BLOQUANTS, dans l'ordre où ils ont été ajoutés : `check-profile-histpdf` (transport des PDF du Mode Histoire), `check-icon-catalog` (une seule source pour les tags built-in), `check-lambert93` (la projection confrontée à ses propriétés définitoires, sans table recopiée), `check-constantes-orphelines` (une constante utilisée mais supprimée — le PDF est resté cassé un mois), `check-map-listeners` (une garde anti-doublon posée ailleurs que sur la map, qui a mordu deux fois), `check-tracking-defaults` (le seuil de podomètre recopié à une valeur impossible), `check-osm-etiquettes` (regroupement insensible à la casse, clic asymétrique), `check-calque-session` (le verrou sans sa copie, l'effacement qui rend le calque), `check-osm-outils` (symétrie des deux vues OSM, exclusion mutuelle des outils), `check-release-docs` (le guard `commit-msg`, hors pre-commit). **Total réel : 24.**

`node -c` (syntaxe) est le SEUL filet natif du projet — chaque garde-fou ci-dessous est né d'un bug réel qui l'avait traversé. Tous branchés dans `.githooks/pre-commit`, **BLOQUANTS** sauf mention :

| Script | Garde quoi | Bug fondateur |
|---|---|---|
| `check-no-pro-leak.js` | frontière community ↔ pro : aucun fichier pro (`*.php`, `pro/`, `backend/`, modules pro nommés) | — (préventif) |
| `check-noms-reels.js` | dépôt public : aucun nom réel lié aux relevés (département des relevés et variantes) dans un fichier suivi, un chemin ou un message de commit (`--message`, branché aussi au `commit-msg` et à `ci-commits.sh`). Comparaison par **empreinte sha256** du mot normalisé (accents, casse, camelCase, `_`) : le nom n'est pas écrit dans le contrôle — limite : une empreinte de mot courant se retrouve par essai d'une liste de candidats. Liste hors dépôt facultative `~/.myktamap/noms-interdits.txt` (mots en clair, poste seul). Fichiers indexés ; en CI ou `--tout`, tous les fichiers suivis. Hors portée : `data/`, `lib/`, binaires. Sans dérogation | nom du département des relevés réels resté en exemple d'étiquette, de dossier, de sous-titre et de mesure dans `js/`, `scripts/`, le journal et `docs/architecture/` au passage public du dépôt (11/10/2026) |
| `check-connexion-serveur.js` | connexion serveur (v2.0.0) : validation de l'app ET de ConfAdmin exécutées sur la même table de cas, états, index injoignable ≠ connexion coupée, licence importée insuffisante, aucune requête dans `ktaExtensions.js` | — (préventif, né avec la fonction) |
| `check-export-anonyme.js` | export anonymisé : exécute `_anonymiserSession` sur une session piégée et cherche le marqueur dans TOUT le JSON produit | liaisons inter-plan (vrais noms de plan et de point) livrées par l'export anonymisé de v1.57.0 à v2.0.0 |
| `check-uid.js` | identifiants stables (v2.1.0) + traces de suppression et fusion (v2.2.0, `historyManager` exécuté sur de faux tableaux) : exécute `js/ktaUid.js` (doublons régénérés, jamais d'écrasement, copie = uid neuf) + câblage des sites (setters, migration, touch, calques, Générateurs, rien vers KMZ/GPX) | — (préventif, né avec la fonction ; vise la perte silencieuse d'un objet à la future fusion) |
| `check-extensions.js` | points d'extension (v2.7.0) : `ktaExtensions.js` exécuté — permission en échec = refus, gate déléguée en échec jamais remplacée par la gate community, garde des requêtes (états, origine), aucun module sur instance OFF, no-op sans extension ; câblage boot / import / export / plans ext / Générateur / SW | — (préventif, né avec la fonction) |
| `check-modal-lifecycle.js` | cycle de vie des modales (**advisory**) | fuites de modales v1.44 |
| `check-backlog.js` | forme de `docs/BACKLOG.md` : horizons connus, Maintenant ≤ 10, métadonnées `qui · action · fini · depuis · taille` des entrées (**advisory** ; `--sabotages` rejoue 11 cas) | backlog de 100 entrées sans prochaine action ni critère de fin |
| `check-api-surface.js` | charge RÉELLEMENT les modules IIFE en VM, vérifie chaque export annoncé + comportements (repeinture après mutation, survie de l'override au save/load, migration `hidden` tableau, dédup collisions d'id) | `WALLPAPER_MAX_PX` (01/08) puis `DEFAULT_RENDERS` (04/08) : export fantôme → module mort au boot, `node -c` passe |
| `check-prefs-survival.js` | toute pref écrite est bien relue par `buildAppConfigFromPlan` | magnétisme perdu au chargement de plan (03/08) |
| `check-style-canon.js` | AUCUNE table de couleurs locale ne réapparaît (hex + `weight` + `fillOpacity` ; `width:` KML volontairement non assimilé) | 25 tables recopiées ; `inaccessible` absent de `ZS_EMBED` |
| `check-style-resolver.js` | 57 cas fonctionnels du résolveur (built-in, customs, override, `{flat}`, swatch, pastilles) | valeurs fausses du canon vague 0 |
| `check-kml-styles.js` | fige les 14 styles KML built-in (largeurs propres au KML) + les customs reçoivent un `<Style>` | bug 2 : couleur perdue dans Google Earth |
| `check-legend-roundtrip.js` | rejoue custom → calque → plan régénéré sur du code **extrait des fichiers réels** (sous-ensemble, idempotence, conflit = le plan gagne) | F2/F3 : légende perdue, irréparable en UI |
| `check-georef-estimation.js` | maths de l'estimation du point B (A + échelle + Nord) | `Number(null) = 0` → un A à lat nulle partait à l'équateur |
| `check-image-header-dims.js` | parseur binaire des dimensions d'image du Générateur | « Image non décodable » sur les JPG 32K×32K (limite Chrome/Skia) |
| `check-resolution-convert.js` | « Recaler des données sur un autre scan » (`js/recalageScan.js` chargé dans un vm) : réécriture de chaque champ coordonnée, matrices saisies, recalage par les noms (moindres carrés, rejet des homonymes aberrants, affine, cas dégénérés), mauvais clic signalé, câblage | le champ coordonnée oublié à la migration ; l'échelle prise au rapport des résolutions alors que le cadrage diffère (écart médian de plusieurs centaines de px) |
| `check-devmode-docs.js` | le Mode Dev ne relit **aucune** doc technique (ni manifest, ni `docs/` hors `docs/applications/`, ni `README.md`) ; hash SHA-256 ; ConfAdmin et inspecteur SW rendus **seulement** en mode actif | la bibliothèque obligeait à publier toute la doc interne sur dev (audit CD du 09/10/2026, F1) |
| `check-livrables-docs.js` | le `Dockerfile`, le ZIP de `release.yml` et `.dockerignore` ne livrent de `docs/` que `docs/applications/`, jamais le `README.md` racine (règles rsync présentes et **dans l'ordre**) ; `.dockerignore` ne laisse entrer de `data/` que `data/test` et `data/myktamap.zip`, l'index de l'image venant de `docker/index-fictif.json` (identique au `data/index.json` **suivi**) | BACKLOG, audits et `README.md` dans l'image Docker — donc servis par pro.myktamap.fr — et dans le ZIP (audit CD, F1) ; **relevés réels** et index local du poste dans les couches d'une image construite sur le poste (pile de test pro) |
| `check-libs.js` | chaque librairie de `lib/` : version de l'en-tête du fichier embarqué = `lib/package.json` (manifeste lu par Dependabot, versions exactes) = `lib/VERSIONS.md` | une veille qui ment : PR Dependabot fusionnée sans remplacer le fichier, ou librairie remplacée sans mettre la table à jour |
| `check-kmz-superoverlay.js` | géométrie du superoverlay KMZ (pavage, jointures, Lod/drawOrder) | overlay tronqué dans Google Earth |
| `check-aide-sections.js` | structure de l'Aide intégrée : même nombre de sections FR/EN, **1 seul titre par section**, `AIDE_CATEGORIES` couvre tout (ni orpheline, ni doublon, ni hors-bornes) | **3 bugs d'un coup le 01/09** : conteneur oublié fusionnant 2 sections FR (« Mode profil » inatteignable) · section absente en EN alors que les index sont **communs aux 2 langues** · index annoncé à 29 pour une section en 30 (« Mon carnet » tombée dans le filet « Autres ») |

⚠️ **`check-i18n.js` n'est PAS branché au hook** — il se lance à la main (`node scripts/check-i18n.js`, `CHECK_I18N_DUMP=1` pour la liste d'audit). La table le donnait pour pré-commit depuis la v1.76.0 : c'était faux, corrigé le 16/08/2026. Le filet i18n au commit, c'est le smoke Playwright (il échoue sur toute clé manquante au runtime).

**Règles apprises, à respecter** :
- Un garde-fou neuf doit être **éprouvé en le falsifiant** (altérer le canon, rejouer le commit cassé) — un vert jamais vu rouge ne prouve rien.
- Éditions i18n : **jamais `perl -i` avec `\x{}`** (double-encode les lignes touchées — incident 04/08) → script Node, lecture/écriture `utf8` explicites, insertion EN PLACE (pas de re-tri : 994 lignes de diff), relecture JSON de contrôle.
- `git commit -F fichier` pour les messages multi-lignes ; commit et push en **commandes séparées** (le chaînage `&&` déclenche un faux positif `--force` du guard-git).

---

### 84. Garde-fou de release — hook `commit-msg` (2026-08-16)

**La dette qu'il paie** : la règle des 4 axes (« un bump = les docs suivent ») n'était vérifiée par RIEN. Constat fondateur : `AI_CONTEXT.md` n'a jamais reçu les nouveautés v1.73.0 — pendant une version entière, la modale 🤖 Aide IA a répondu « ça n'existe pas » sur deux features livrées. Et personne ne vérifiait non plus que les **3 sources de version** concordent : un `CACHE_NAME` oublié = le SW ressert l'ancien cache, donc la mise à jour **n'atteint jamais les clients**.

**Pourquoi `commit-msg` et pas `pre-commit`** : le pre-commit tourne **avant** que git écrive le message (ordre : pre-commit → prepare-commit-msg → éditeur → commit-msg). Il ne peut donc ni lire un préfixe `release(...)`, ni exiger une dérogation dans le message. `commit-msg` voit le message **et** l'index — c'est le seul endroit d'où une dérogation peut être **archivée dans l'historique Git**.

**Déclencheur = le bump, pas le message** : le script compare la clé `version` de `version.json` entre `HEAD` et l'**index**. Un commit qui ne bumpe pas sort en silence (zéro friction au quotidien). Se fier au préfixe `release(...)` serait plus faible — le commit `2751ff5` s'appelait `fix(v1.73.1-dev)`.

**Deux niveaux, calqués sur `RELEASE_GATE.md`** :

| | Contrôle | Dérogeable |
|---|---|---|
| 🔒 **Noyau** | `sw.js > CACHE_NAME` et `js/copyright.js > build` portent la version de `version.json` | ❌ jamais — un échec ici = l'app ne se met pas à jour chez l'user |
| 📄 **Doc** | `README.md` (bloc « Version courante » + entrée en tête du journal) · `NETWORK_AUDIT.md`/`.html` (en-tête « À jour pour la version ») + historique (`### vX.Y.Z` dans le `.md`, `<h3>` dans le `.html` généré) · `AI_CONTEXT.md` a bougé dans le commit | ⚠️ oui |

**Déroger** : une ligne `Docs-deroge: <motif · risque accepté · rattrapage>` dans le message (≥ 5 caractères, lignes commentées `#` ignorées — sinon la trace disparaîtrait du commit final). Cas légitime canonique : le hotfix « bump de cache seul » type v1.75.1.

**Ce qu'il ne fait pas** (à ne pas confondre) :
- `AI_CONTEXT.md` ne porte **pas** de marqueur de version (il a `{{BUILD}}`, rempli à la génération) → seul « a bougé » est contrôlable. Un `AI_CONTEXT` touché pour une virgule passe.
- `README_USER.md`/`.en.md` et `js/interfaceDocs.js` ne sont **pas** contrôlés : un hotfix peut légitimement n'avoir rien à leur dire, l'exiger produirait des faux positifs à répétition.
- L'axe archi (`CLAUDE.md`, `docs/architecture/*`) est conditionnel par nature — non automatisable.
- Il lit le **repo**, jamais le serveur : il ne remplace pas l'item 13 du smoke (marche 2 du gate), qui attrape un déploiement partiel ou oublié.
- `git commit --amend` sur un commit de release déjà bumpé ne le redéclenche pas (HEAD porte déjà la nouvelle version) — le commit d'origine, lui, est passé par la porte.

**Éprouvé en le falsifiant** (règle du §83) : 5 scénarios rejoués sur l'index réel — pas de bump (silence), bump nu (9 ❌), dérogation qui ne débloque PAS le noyau, noyau vert + dérogation (passe avec avertissement), release complète (vert). Le test a d'ailleurs sorti un vrai défaut : le contrôle du journal visait la **première mention** de « Journal des versions » (le sommaire, ligne 53) au lieu du **titre de section** — un README correct aurait été refusé.

---

### 85. Déploiement des sites — Git sur le VPS, sans FTP (07/10/2026)

- Scripts dans un dépôt **privé** séparé (`MyKTAMap-hebergement`, depuis le 12/10/2026 ; jamais dans ce dépôt
  public), posés sur le VPS : `deploy-dev.sh` →
  `/data/www/dev.myktamap.fr` sur `Karma_dev` ; `deploy-prod.sh` → `/data/www/myktamap.fr` sur `main` (confirmation
  `PROD`) ; `deploy-pro.sh` → pro.myktamap.fr (pile Docker : `main` du community + `main` du dépôt pro, `PRO`) ;
  `kta-serveur.sh` = « menu 0 » qui les appelle.
- **Mise à jour automatique** (décision KARMA du 09/10/2026) : `auto-deploy.sh`, lancé par cron toutes les 5 min,
  compare chaque site à sa branche sur GitHub et ne déploie que si la **CI du commit est verte** : le job
  `marquer-vert` de `ci.yml` pose `refs/ci/verte/<branche>` sur chaque commit poussé qui passe, lue par le VPS avec
  sa clé de déploiement (`git ls-remote`) — **aucun jeton GitHub sur le serveur** ; pour le pro, `main` doit être vert des deux
  côtés (community et pro). Le VPS regarde lui-même : rien d'ouvert sur le serveur, aucun accès au VPS confié à GitHub. Pause par site
  (`/data/scripts/PAUSE-<domaine>`, menu 0 → 8). Conséquence : `main` mergé = prod en ligne dans les 5 minutes.
- **Retour arrière** : menu 0 → 4 / 5 (pose la pause, sinon la branche reviendrait) — procédure complète, pro
  compris : `docs/RELEASE_GATE.md` § Retour arrière.
- Le dépôt vit **hors du dossier web** (`/data/git/<site>.git`, `core.worktree`) : aucun `.git` servi.
- **Sparse checkout** : ne sont posés ni `data/`, ni `.claude/` / `.git*`, ni `scripts/`, `CLAUDE.md`, `README.md`,
  `Dockerfile`, `docker/` ; sur **les deux sites**, `docs/` se réduit à `docs/applications/` (ce que l'app lit). Les
  motifs sont réécrits et réappliqués à chaque déploiement : un fichier qui sort des motifs **disparaît** du site.
  🩸 Jusqu'au 09/10/2026, dev servait `docs/` entier et les deux sites le `README.md` racine — la documentation
  interne d'un dépôt privé, lisible sans mot de passe (audit CD, F1).
- 🩸 **`data/` n'est jamais écrit ni effacé** : `data/index.json` et le relevé fictif sont SUIVIS par Git et déjà présents
  sur le serveur — Git ≥ 2.37 les « reprend » si on ne pose pas `sparse.expectFilesOutsideOfPatterns=true`, et une
  mise à jour écraserait alors l'`index.json` du site (reproduit sur une copie). Les scripts posent ce réglage et
  refusent tout déploiement si un fichier de `data/` perd son bit skip-worktree. `data/` reste géré à la main.
- Mise à jour refusée si un fichier du site a été modifié à la main ; 1re installation : ancien site archivé (sans
  `data/`), fichiers hors dépôt listés, jamais supprimés.
- **Après chaque passage** (audit CD du 09/10/2026, Q3) : `deploiement.json` à la racine du site (`commit`, `branche`,
  `version`, `date` — la version seule ne dit pas quel commit tourne, on commite sans bump) ; le site est interrogé
  comme un navigateur (version, cache du Service Worker, en-têtes `no-cache`, commit, doc interne non servie — en
  lisant le **contenu** : toute adresse inconnue répond 200 avec la page de l'app) ; une ligne au journal
  `/data/www/_sauvegardes/deploiements.log`, refus et abandons compris ; un seul déploiement à la fois par site
  (`flock`). Codes : `0` ok · `1` refus ou abandon, site inchangé · `2` site changé mais vérification en échec.
- **Depuis le poste** : `scripts/release/etat-sites.ps1` (lecture seule, sans secret) fait les mêmes contrôles sur les
  deux sites et donne l'écart en commits avec `origin/Karma_dev` / `origin/main` — rappelé en fin de `merge-main.ps1`
  et avant la marche 2 de `RELEASE_GATE.md`.
- Remplace `scripts/deploy/deploy.ps1` (FTP), retiré le 07/10/2026.

## 📚 La doc technique ne se lit pas dans l'app (depuis le 09/10/2026)

Le mode Développeur avait une bibliothèque qui affichait `README.md` et `docs/` (architecture, BACKLOG, audits…). Pour
fonctionner, elle exigeait que ces fichiers soient **déployés**, donc publics : le mot de passe du mode ne cachait que
la liste, pas les fichiers. Elle a été retirée ; les sites ne reçoivent plus que `docs/applications/` (§85) et la doc
technique se lit dans le dépôt. `scripts/check-devmode-docs.js` refuse son retour : ni manifest de docs, ni lecture de
`docs/` hors `docs/applications/`, ni du `README.md` racine.

Ce que l'app lit encore, et qui doit donc rester déployé : les guides (`README_USER*.md`, 📚 Documentation), l'Aide IA
(`AI_CONTEXT.md`), l'audit réseau (`NETWORK_AUDIT*`), les CGU et les guides Docker — tous dans `docs/applications/`.
