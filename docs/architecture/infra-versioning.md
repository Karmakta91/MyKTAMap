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

**Badge version cliquable** (`index.html > _initFooterVersion`) :
- `<span id="loaderCopyrightVersion">` dans le footer du loader, en fin de `.kta-loader-copyright-line2`
- 2 états :
  - **Normal** : `v143` gris monospace
  - **Update dispo** : `v141 → v143` bleu clignotant (`.kta-loader-copyright-version-update` + animation `kta-version-update-pulse` 1.8s)
- Évaluation initiale via `localStorage["myktamap_last_version_data"]` (cache UpdateChecker) au DOM ready
- Re-évaluation via `UpdateChecker.onCheck()` callback après le fetch frais (couvre le cas où la version a changé entre 2 boots)
- Au clic : `UpdateChecker.showCurrent()` qui force le re-fetch + affiche soit la modale d'update (bypass snooze), soit `afficherModaleAlerteAbsente("up-to-date")` qui montre les notes de la version installée

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

**Fichier `docs/alert-example-migration.json`** : exemple `alert.json` multi-alertes avec entrée info migration + emplacement commenté pour alerte ponctuelle (incendie, etc.). Le vrai `alert.json` racine (servi en prod) contient déjà les 2 alertes (gaz toxiques emergency + migration info) au format v163+.

**Constantes à mettre à jour quand `myktamap.fr` sera DNS-pointé** :
- `js/copyright.js > __MKM__.site` (sur le nouveau domaine, garder l'ancien sur l'ancien domaine pour cohérence pendant la transition)
- Meta tags `<head>` dans `index.html`
- Mentions dans `README.md` / `README_USER.md` / `AI_CONTEXT.md`
- Dans `alert.json > details` de l'alerte migration : retirer la mention "🚧 myktamap.fr est en cours de mise en service" et ajouter le lien actif

---

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
| 🔒 **Audit** | `docs/applications/NETWORK_AUDIT.md` + `NETWORK_AUDIT.html` | À chaque release (verdict réseau attendu par les users qui auditent) |
| 📖 **Dev** | `README.md` racine (journal des versions, "Version courante" + précédentes shipped) | À chaque release |
| 🤖 **Archi IA** | `CLAUDE.md` racine (si règle/archi change) + `docs/architecture/<sujet>.md` (selon sujets impactés) | Si pattern technique nouveau, refactor structurel, lesson learned |

**Pattern de commit** observé : chaque release de v1.31.x avait une section
"Sync 4 axes docs" dans le commit message qui listait explicitement ce qui était fait
ou SKIPé sur chacun des 4. Format type :

```
Sync 4 axes docs (4)
  📱 In-app   : SKIP justifié (perf interne, aucun changement UX)
  🔒 Audit    : NETWORK_AUDIT.md + .html — entrée v1.X.Y
  📖 Dev      : README.md — MAJ "Version courante"
  🤖 Archi IA : perf-memory.md §X (pattern + gain + À NE PAS faire)
```

Le **SKIP** est OK et même utile (explicite que la non-modif est intentionnelle), mais
ne JAMAIS oublier UN des 4 axes silencieusement.

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
