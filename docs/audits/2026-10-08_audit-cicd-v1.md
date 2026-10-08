# 🚦 Audit CI/CD — community (08/10/2026)

> Version auditée : **v2.10.3** (`Karma_dev`). Lecture du dépôt : hooks, garde-fous, workflows GitHub,
> scripts de release, porte de release. **Non vérifié** (outil `gh` absent du poste) : protection de branche
> sur `main`, réglages « Code security » du dépôt GitHub — à contrôler dans *Settings*.
> Volet de l'édition installable : audit à part, dans son propre dépôt.
>
> ⚠️ **Correctif du 08/10 (soir)** : le dépôt `Karmakta91/MyKTAMap` est **privé** (l'API GitHub anonyme répond
> 404), alors que la première version de ce rapport le supposait public. Les points touchés (Q1, Q2, Q4, Q5, Q6)
> sont corrigés ci-dessous : plusieurs services « gratuits sur un dépôt public » sont payants sur un dépôt privé.
>
> **Avancement au 09/10/2026** : Q1 ✅ (`4a050f9`, vert sur GitHub) · Q2 ✅ option b (`merge-main.ps1` exige la CI verte
> du commit) · Q4 ✅ (`b55510e` Dependabot + alertes activées par KARMA) · Q5 Sonar local en cours (autre session) ·
> Q6 retiré (payant en privé) · Q3, Q7 à faire.

## En une phrase

Le contrôle qualité est **riche mais entièrement local** : 69 garde-fous exécutables, qui ne tournent que si le
hook est activé sur le poste. Rien ne les rejoue côté GitHub. Le premier quick win est donc de les faire tourner
en CI à chaque push. Sonar vient ensuite, en mode « nouveau code seulement ».

## 💪 Points forts

| Domaine | Ce qui existe |
|---|---|
| **Garde-fous** | 69 scripts `scripts/check-*.js` (Node pur, **aucune dépendance**), dont beaucoup **exécutent** le code dans un bac à sable `vm` (tuilage, extensions, uid, i18n…) au lieu de le relire. Tous branchés : 67 en `pre-commit`, 2 en `commit-msg` |
| **Anti-fuite** | `check-no-pro-leak.js` (frontière community ↔ édition installable), `check-data-hors-git.js` (aucun relevé réel ne part sur le dépôt public), dérogations écrites dans le message de commit, donc archivées |
| **Release** | 3 sources de version contrôlées ensemble (`check-release-docs.js`, jamais dérogeable), docs sur 4 axes vérifiées à chaque bump ; `merge-main.ps1` refuse un arbre sale, des versions divergentes, des garde-fous au rouge, puis fait confirmer les marches manuelles de `RELEASE_GATE.md` |
| **Publication** | `release.yml` : tag et Release GitHub automatiques au bump sur `main`. `docker.yml` : image multi-architecture (amd64 + arm64) sur ghcr.io, tags `latest / vX.Y.Z / X.Y / X` |
| **Garde-fous de l'IA** | `.claude/hooks/guard-git.js` bloque `push main`, `push --force`, `reset --hard` ; `check-syntax.js` après chaque édition ; règles `deny` sur `data/**` |
| **Smoke** | `scripts/smoke/` (Playwright) + 11 `checkup-*.js` ciblés, utilisés à la porte de release |
| **Déploiement** | Scripts hors dépôt, par clone Git, `data/` jamais touché |

## ⚠️ Points faibles

| # | Faiblesse | Risque concret |
|---|---|---|
| F1 | **Aucune CI sur push / PR.** Les deux workflows ne tournent qu'au bump sur `main` (release, image Docker), et ni l'un ni l'autre ne lance les garde-fous | Un commit fait avec `--no-verify`, depuis un poste sans `git config core.hooksPath .githooks` (nouveau poste, collaborateur sur `Chig_Dev`) ou par l'éditeur web de GitHub arrive sur `Karma_dev`, puis sur `main`, **sans aucun contrôle**. L'image Docker est construite et publiée quand même |
| F2 | **Les hooks sont opt-in** (`core.hooksPath`) et contournables (`--no-verify`, qui désarme aussi l'anti-fuite) | La protection repose sur la discipline du poste |
| F3 | **Aucune analyse statique** : ni linter, ni Sonar, ni CodeQL. Le seul filet de syntaxe est `node -c` | ~132 000 lignes de JS en globales `window.*` : variables non déclarées, code mort, doublons, complexité et ~560 lignes avec `innerHTML` ou `eval(` ne sont vus que par les garde-fous ciblés |
| F4 | **Aucune veille des dépendances** : pas de Dependabot. `lib/` est vendorisée (Leaflet, JSZip, jsPDF, html2canvas) sans suivi de version ni de CVE ; les actions GitHub sont épinglées par tag majeur (`@v4`), pas par SHA | Une faille connue dans `jspdf` ou `jszip` (ce sont les fichiers non fiables que l'app ouvre) passerait inaperçue |
| F5 | **Le smoke reste manuel** : la porte de release le demande, mais aucune CI ne le lance | La marche la plus parlante (un vrai navigateur) dépend d'un lancement à la main |
| F6 | **Pas de mesure** : ni couverture, ni tendance (nombre de garde-fous, temps du pre-commit, dette) | Impossible de dire si la qualité monte ou descend d'une version à l'autre |
| F7 | **Déploiement hors dépôt** (choix assumé) : `deploy-dev.sh` / `deploy-prod.sh` ne sont ni versionnés ni relus | Pas d'historique ni de retour arrière documenté si un script change ; un seul poste les détient |

## ⚡ Quick wins (par rapport effort / gain)

| # | Action | Effort | Gain |
|---|---|---|---|
| **Q1** | **Workflow `ci.yml`** sur push (`Karma_dev`, `main`) et PR : `node -c` sur `js/*.js`, `sw.js`, `scripts/**`, puis les 67 garde-fous du pre-commit (Node 22, aucune installation) + `check-data-hors-git` sur l'arbre. ~2 min de calcul, pris sur le quota gratuit des dépôts privés (2 000 min/mois [Probable]) | ½ h — **✅ fait (`4a050f9`)** | Ferme F1 et F2 : plus rien n'arrive sur `main` sans être passé par les garde-fous |
| **Q2** ✅ (option b) | **Protection de `main`** (*Settings → Branches*) : le check `ci` doit être vert avant tout merge, pas de push forcé. Le merge reste fait par toi via `merge-main.ps1`. ⚠️ [Probable] Sur un dépôt **privé**, les règles de protection de branche demandent un compte GitHub **Pro** (payant) ; en gratuit, à défaut, `merge-main.ps1` peut vérifier l'état de la CI du commit avant de merger | 10 min | Le garde-fou côté serveur que `guard-git.js` est seulement côté IA |
| **Q3** | **`docker.yml` conditionné à la CI** (`needs` ou `workflow_run`) | 15 min | Plus d'image publiée sur ghcr.io à partir d'un commit au rouge |
| **Q4** ✅ | **Dependabot** (`.github/dependabot.yml`) pour `github-actions` et `scripts/smoke` (npm), et activation des *Dependabot alerts* (gratuites, dépôt privé compris). ⚠️ [Probable] *Secret scanning* est payant sur un dépôt privé : les garde-fous anti-fuite de la CI en tiennent lieu | 15 min | F4 en partie : alertes CVE, actions tenues à jour |
| **Q5** | **Sonar en mode « nouveau code »** : sur un dépôt privé, **SonarQube Community Build local** (Docker, gratuit) plutôt que l'offre Cloud (détail ci-dessous) | 1 h | F3 : duplication, complexité, bugs et failles signalés **sur ce qu'on change**, sans noyer le projet sous l'historique |
| **Q6** | ~~**CodeQL**~~ — ⚠️ [Probable] l'analyse de code GitHub est **payante sur un dépôt privé**. À la place : les règles de sécurité de Sonar local (Q5), et `check-xss.js` qui existe déjà. À reconsidérer si le dépôt devient public | — | — |
| **Q7** | **`lib/VERSIONS.md`** : la version de chaque librairie vendorisée, avec sa source | 20 min | Rend F4 vérifiable à la main, et par Dependabot via un `package.json` factice si besoin |

À plus long terme : smoke Playwright en CI sur `workflow_dispatch` (F5), un petit tableau de bord des
garde-fous (F6), puis versionner les scripts de déploiement dans un dépôt privé dédié (F7).

## 🔍 Sonar : comment le brancher sans se noyer

Le dépôt community est **privé**. [Supposition — à vérifier sur la page Pricing] L'offre gratuite de **SonarQube
Cloud** limite le volume de lignes des projets privés, et le community en compte ~132 000 en JS. Voie retenue :
**SonarQube Community Build** auto-hébergé (une image Docker, gratuit), lancé sur le poste de KARMA (en
préparation le 08/10, hors dépôt). ⚠️ Un serveur sur `localhost` n'est **pas joignable** par un runner GitHub :
pas d'étape Sonar dans `ci.yml` qui le vise ; l'analyse se lance depuis le poste (scanner en Docker).

**Mise en place (community)**
1. Serveur local, projet créé à la main, jeton d'analyse (jamais commité, ni collé dans un historique de shell).
2. Analyse depuis le poste avec le scanner en Docker (`sonarsource/sonar-scanner-cli`), sur `Karma_dev`.
3. `sonar-project.properties` minimal (à décider avec KARMA avant de l'ajouter au dépôt) :
   ```properties
   sonar.projectKey=myktamap-community
   sonar.sources=js,sw.js,css,index.html
   sonar.exclusions=lib/**,data/**,docs/**,lang/**,scripts/smoke/node_modules/**
   sonar.tests=scripts
   ```
4. **Quality Gate sur le nouveau code seulement** (« Clean as You Code ») : *New Code* = depuis la version
   précédente. Le premier scan remontera des milliers de signalements sur l'existant : c'est attendu, et on
   **ne les traite pas en bloc**. Seul le code modifié doit passer.

**Ce qu'il faut savoir avant**
- Le code vit en **globales `window.*`, sans `import`** : Sonar va signaler des identifiants « non définis » et
  des fonctions « inutilisées » qui sont en réalité appelées par un autre fichier. Il faudra marquer ces règles
  « faux positif » une fois, ou les désactiver dans un profil de qualité dédié.
- Les règles utiles d'emblée : duplication, complexité cognitive, code mort réel, failles (XSS via `innerHTML`,
  `postMessage`), regex catastrophiques. Les règles de style sont à couper : la convention du projet est
  documentée dans `CLAUDE.md` et elle diffère des défauts de Sonar.
- Sonar **ne remplace pas** les garde-fous : eux vérifient des règles métier (frontière community, catalogue
  d'icônes, canon des styles, tuilage) qu'aucun outil générique ne connaît.

## Plan proposé

1. **Lot 1 (½ journée)** : Q1 (✅ fait) + Q2 (selon l'offre GitHub) + Q3 + Q4. C'est le socle : CI serveur,
   `main` protégée, image Docker conditionnée, alertes de dépendances. (Q6 CodeQL retiré : payant en privé.)
2. **Lot 2 (1 h + réglages au fil de l'eau)** : Q5 Sonar en mode « nouveau code », profil de qualité ajusté
   après les premiers faux positifs.
3. **Lot 3 (plus tard)** : Q7, smoke en CI manuelle, tableau de bord.
