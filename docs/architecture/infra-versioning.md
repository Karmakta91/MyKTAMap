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
