# 🤖 L'IA pour les nuls — version MyKTAMap

> **Comment on travaille avec une IA de code, et pourquoi ça ne part pas en vrille.**
> Guide de méthode, transposable à n'importe quel projet. Il ne décrit **pas** l'application MyKTAMap
> ni son code : il décrit **l'organisation** autour de l'IA (rôles, interdits, garde-fous, vérifications,
> audits, documentation). Les encadrés « 📦 Dans ce dépôt » montrent comment c'est fait ici, avec les vrais
> chemins de fichiers, pour qu'une IA qui lit ce document dans le dépôt puisse aller vérifier.
>
> Rédigé le 16/09/2026 (état du dépôt à la v1.95.0). Auteur : KARMA + Claude.

---

## 0. À qui s'adresse ce document, et comment l'utiliser

**À toi, si** tu démarres un projet avec une IA de code (Claude Code, Cursor, Copilot, autre) et que tu n'as
jamais fait de « CI/CD », de « hook Git », d'« audit » ou de « release ». Tout est expliqué depuis zéro,
avec un glossaire en fin de document (§14).

**À ton IA, si** tu préfères lui déléguer : donne-lui ce fichier en entier et la phrase d'amorce du §15.
Elle saura alors quoi mettre en place, dans quel ordre, et pourquoi.

**Ce que tu vas en tirer** : un kit de démarrage (§13) en dix étapes, et surtout la logique derrière.
Aucune étape n'est là par principe : chacune a été ajoutée ici **après un vrai incident**, et le document
les raconte (§12), parce que c'est la partie la plus utile.

---

## 1. Le principe en dix lignes

1. **L'IA est un collaborateur, pas un pilote.** Elle propose, prépare, exécute. L'humain décide.
2. **Ce qui est interdit doit être interdit par une machine**, pas par une phrase. Une règle écrite se
   contourne par oubli ; un blocage technique, non.
3. **Chaque garde-fou est né d'un bug réel.** On n'installe pas de contrôle « au cas où » : on installe
   celui qui aurait attrapé le bug d'hier.
4. **Un garde-fou vert qu'on n'a jamais vu rouge ne prouve rien.** On le teste en sabotant le code exprès.
5. **La branche principale est toujours déployable.** On ne merge dessus qu'après une porte de contrôle.
6. **L'IA ne déploie jamais et ne pousse jamais sur la branche principale.** Point.
7. **Une version = les docs suivent, le même jour.** Sinon la dette est immédiate, et elle est vérifiée
   au commit.
8. **Toute dérogation est écrite**, avec son motif, le risque accepté et le rattrapage prévu. Jamais en
   silence.
9. **La mémoire de l'IA ne remplace pas le dépôt.** Ce qui doit survivre vit dans le dépôt.
10. **L'IA doit dire ce qui dérange en premier** (test non fait, bug non reproduit, dette créée), pas en
    fin de message.

---

## 2. Les rôles

| Acteur | Rôle | Ce qu'il tranche |
|---|---|---|
| **Le propriétaire du projet** (ici : KARMA) | Décide, teste sur appareil réel, merge, déploie, accorde les dérogations | Tout ce qui est irréversible ou public |
| **L'IA de code** (ici : Claude Code) | Conseille, fait le topo, code sur une branche de travail, écrit les docs, prépare les commits de release, propose des garde-fous | Rien d'irréversible. Elle **propose** une dérogation, ne l'accorde jamais |
| **Les garde-fous automatiques** (hooks, scripts) | Vérifient sans fatigue, à chaque édition et à chaque commit | Refusent, ne négocient pas |
| **Le collaborateur externe** (ici : la branche `Chig_Dev`) | Travaille sur sa propre branche | L'IA n'y touche jamais, même en lecture-écriture « pour aider » |

Le point important : **l'IA n'est pas « un simple assistant », c'est un conseiller payé pour voir ce qui
manque**. On lui demande un topo avant de coder, avec des choix numérotés et une recommandation. On attend
d'elle qu'elle contredise une hypothèse fausse dès la première phrase. Le contrat de communication est au §11.

---

## 3. Ce que l'IA peut faire, et ce qu'elle ne peut pas

Il y a **trois niveaux d'interdiction**, et il faut savoir lequel on utilise pour chaque règle :

| Niveau | Mécanisme | Fiabilité | Exemple ici |
|---|---|---|---|
| 🔴 **Bloqué en dur** | Un hook intercepte la commande **avant** qu'elle s'exécute et la refuse | Totale : l'IA ne peut pas passer outre, même si on le lui demande | `git push` vers `main`, `git push --force`, `git reset --hard`, toute écriture sur la branche du collaborateur |
| 🟠 **Demande de permission** | L'outil s'arrête et demande à l'humain de valider | Haute : l'humain voit chaque occurrence | `git push` (vers une branche de travail) |
| 🟡 **Refusé par configuration** | L'outil refuse l'accès à certains fichiers | Haute | Édition de `data/**` (données pures, pas du moteur), lecture des `.env*` (secrets) |
| ⚪ **Règle écrite** | Une phrase dans le fichier de contexte de l'IA | Moyenne : dépend de l'attention de l'IA à ce moment-là | « Ne jamais changer les couleurs de la charte », « toujours passer par telle fonction » |

**Règle de conception** : tout ce qui est **irréversible, public ou destructeur** doit être au niveau 🔴
ou 🟠. Les conventions de code peuvent rester au niveau ⚪, mais dès qu'une convention est violée deux fois,
on lui écrit un script de vérification (§5.3) et elle monte au niveau 🔴.

### 3.1 Tableau des droits de l'IA (tel qu'appliqué ici)

| L'IA a le droit de… | L'IA n'a **pas** le droit de… |
|---|---|
| Lire tout le dépôt sauf les secrets | Lire les fichiers `.env*` |
| Éditer le moteur (code, styles, page, service worker, docs) | Éditer les données (`data/**`) |
| Créer des commits sur une branche de travail | Pousser sur `main`, forcer un push, réécrire l'historique |
| Lancer les scripts de vérification, le smoke test automatisé | Déployer (le déploiement est manuel, par le propriétaire) |
| Préparer une release (bump de version, notes, docs) | Merger sur `main`, accorder une dérogation |
| Proposer un garde-fou, un audit, une refonte | Coder une fonctionnalité qui relève du dépôt privé « pro » sans validation explicite |
| Stager des fichiers **par chemin explicite** | `git add -A`, `git add .`, `git commit -a` (§12) |

> **📦 Dans ce dépôt** : les blocages 🔴 sont dans `.claude/hooks/guard-git.js`, les permissions 🟠/🟡 dans
> `.claude/settings.json` (sections `allow` / `ask` / `deny`), les règles ⚪ dans `CLAUDE.md` § « Garde-fous ».

---

## 4. Le fichier de contexte de l'IA (ici : `CLAUDE.md`)

### 4.1 Ce que c'est

C'est le **seul fichier que l'IA lit automatiquement à chaque session**. Tout ce qu'il contient est « su »
par l'IA dès le premier message ; tout ce qu'il ne contient pas doit être trouvé ou redit. Il joue trois
rôles à la fois : **carte d'identité du projet**, **règlement intérieur**, **table d'orientation** vers les
docs détaillées.

### 4.2 Comment l'organiser (l'anatomie qu'on utilise)

| Section | Contenu | Pourquoi |
|---|---|---|
| 🎯 Projet | 5 lignes : quoi, pour qui, stack, environnements, auteur, licence | L'IA ne doit jamais deviner ça |
| 🔒 Frontières critiques | Ce qui ne doit **jamais** entrer dans ce dépôt (ici : le code du dépôt privé « pro ») | La règle la plus coûteuse à violer vient en premier |
| ⚙️ Commandes & validation | Comment on vérifie, comment on release, ce qui est contrôlé au commit | L'IA doit connaître le processus, pas seulement le code |
| 🚨 Garde-fous « NE JAMAIS » | La liste des interdits, avec pour chacun **le mécanisme qui l'impose** | Distinguer 🔴 de ⚪ (§3) |
| 🧭 Conventions | Les règles de code non négociables, courtes, avec le script qui les vérifie | Une convention sans vérificateur est un vœu |
| 🗺️ Où chercher | Un tableau sujet → fichier de doc détaillée | **C'est la section qui économise les tokens** (§4.4) |
| 📝 Style de travail | Topo avant de coder, coder le minimum, recap final structuré | Le propriétaire a des attentes précises : les écrire |
| 🗣️ Contrat de communication | Comment l'IA doit parler (§11) | Sinon l'IA flatte et enterre les mauvaises nouvelles |
| 🆘 Si perdu | Trois étapes : journal, doc du sujet, topo au propriétaire | Un chemin de secours évite les improvisations |

### 4.3 À quoi il fait appel (ce qu'il pointe sans le contenir)

Le fichier de contexte ne **contient** pas la connaissance : il dit **où elle est**. Ici, il pointe vers :

- **`docs/architecture/<sujet>.md`** : un fichier par sous-système. Lu à la demande, jamais d'office.
- **`docs/BACKLOG.md`** : ce qui reste à faire, avec pour chaque entrée son **niveau de preuve** (§9.3).
  L'IA doit le lire **avant** d'annoncer qu'une fonctionnalité manque.
- **`docs/RELEASE_GATE.md`** : la porte de mise en production (§6).
- **`docs/architecture/gotchas.md`** : les pièges connus, ceux qu'on a payés.
- **`README.md`** : le journal des versions (§9.1).
- **Les compétences (« skills »)** : des procédures pas à pas que l'IA charge **uniquement quand on les invoque**
  (ici : préparer une release, ajouter un type d'icône, ajouter un type de zone). Elles vivent dans
  `.claude/skills/<nom>/SKILL.md`.
- **La mémoire de l'IA** (§10) : hors dépôt, pour les préférences et décisions.

### 4.4 Économiser les tokens : le fichier de contexte qui **sait où chercher**

Une IA de code paie chaque mot qu'elle lit. Un fichier de contexte de 2 000 lignes est relu **à chaque
session**, souvent pour rien, et il pousse hors de la fenêtre de travail les informations utiles du moment.
Le coût est double : de l'argent, et de l'attention (une IA noyée dans le contexte lit moins bien la fin).

La règle qu'on applique : **le fichier de contexte reste court et sert de table d'orientation ; le détail
est chargé à la demande**.

| Principe | Comment on le fait ici |
|---|---|
| **Le contexte auto-chargé tient en une page** | `CLAUDE.md` est passé d'un monolithe à une version « slim » (v1.29.4) : l'ancien contenu détaillé a été découpé en `docs/architecture/*.md`, et `gotchas.md` en porte l'en-tête « extrait de l'ancien CLAUDE.md, lu à la demande » |
| **Un tableau « Où chercher » plutôt que du contenu** | Sujet → fichier. L'IA lit **un** fichier de 50 Ko au lieu de vingt |
| **Un ordre de lecture en cas de doute** | « Si perdu : 1. journal, 2. doc du sujet, 3. topo » évite qu'elle lise tout |
| **Les procédures rares vivent dans des skills** | Chargées uniquement quand on tape `/release` ou `/add-icon-tag`. Zéro coût le reste du temps |
| **La mémoire a un index d'une ligne par souvenir** | Seul l'index est chargé ; le corps du souvenir n'est lu que s'il est pertinent |
| **Les fichiers de code portent un en-tête** | Chaque module commence par un bloc qui dit ce qu'il fait et ses pièges : l'IA peut lire 40 lignes au lieu de 4 000 |
| **On ne colle pas des fichiers entiers dans la conversation** | On donne le chemin. L'IA lit ce dont elle a besoin, avec `grep` avant `cat` |
| **On sauvegarde les résultats lourds tout de suite** | Le premier audit de modales (juin 2026) a été **perdu** parce que la conversation a été résumée avant qu'on l'écrive dans le dépôt. Depuis : « dès la réception du rapport, déposer dans `docs/audits/` » |
| **Les recherches larges sont déléguées à un sous-agent** | Un agent d'exploration parcourt vingt fichiers et ne rend que la conclusion : la conversation principale ne se remplit pas de listings |

**Le signe que ça dérape** : l'IA relit le même gros fichier plusieurs fois par session, ou le fichier de
contexte dépasse 150 lignes de règles. Dans les deux cas, on découpe et on pointe.

**Le piège inverse** : un tableau « Où chercher » qui ment. Ici, le tableau des garde-fous d'une doc
d'architecture a compté 14 lignes pendant que le hook en câblait 22 (§12). Une table d'orientation se met
à jour **le même jour** que ce qu'elle décrit, sinon elle coûte plus qu'elle ne rapporte.

---

## 5. Les hooks : deux familles, deux moments

Un **hook** est un petit programme lancé automatiquement à un moment précis. Il ne demande rien à
personne : il vérifie, et si ça ne va pas, il refuse. On en a de deux sortes.

### 5.1 Les hooks côté IA (déclenchés par l'outil de l'IA)

Ils s'exécutent **autour des actions de l'IA**, avant même que Git soit concerné.

| Moment | Ce qu'on y met | Ce que ça attrape |
|---|---|---|
| **Avant une commande** (« PreToolUse ») | Le gardien Git : refuse `push` vers `main`, `push --force`, `reset --hard`, et toute mutation de la branche du collaborateur | L'IA qui « aide » en poussant, ou qui nettoie en perdant du travail non commité |
| **Après une édition de fichier** (« PostToolUse ») | Une vérification de syntaxe sur chaque fichier JavaScript touché | Une parenthèse manquante découverte au démarrage dans le navigateur au lieu de tout de suite |

**Comment ça marche, en une phrase** : le hook reçoit la commande ou le fichier, rend un code de sortie ;
un code d'échec **bloque** l'action et renvoie le message d'erreur à l'IA, qui le lit et s'adapte. Il n'y a
donc pas de « l'IA n'a pas vu » : le refus arrive dans sa conversation.

**Subtilité utile** : le gardien vérifie **sur quel dépôt** il tourne (il lit l'adresse du dépôt distant).
Ainsi la règle « jamais de push sur main » s'applique au dépôt public et pas au dépôt privé voisin, qui a
ses propres règles. Par défaut, en cas de doute, il considère qu'il est sur le dépôt le plus strict.

> **📦 Dans ce dépôt** : `.claude/settings.json` (branchement + permissions), `.claude/hooks/guard-git.js`,
> `.claude/hooks/check-syntax.js`. Ces fichiers sont **versionnés** : un nouveau poste les récupère avec le
> dépôt. Seul `settings.local.json` (réglages personnels) est ignoré par Git.

### 5.2 Les hooks côté Git (déclenchés par un commit)

Ils s'exécutent **au moment de committer**, que le commit vienne de l'IA ou d'un humain. C'est la
différence essentielle : **ils protègent aussi contre les erreurs humaines**.

| Hook | Moment | Ce qu'il fait ici |
|---|---|---|
| **`pre-commit`** | Avant que Git enregistre le commit | Lance **la suite complète des garde-fous** (53 scripts au 16/09/2026). Le premier est l'anti-fuite (§5.4) ; presque tous sont **bloquants** |
| **`commit-msg`** | Après la saisie du message, avant l'enregistrement | Le **garde-fou de release** : si le commit change le numéro de version, il vérifie que les trois endroits qui portent la version disent la même chose (non dérogeable) et que les docs ont suivi (dérogeable avec une ligne `Docs-deroge:` dans le message, qui reste dans l'historique) |

**Pourquoi deux hooks et pas un** : `pre-commit` tourne **avant** que le message existe. Seul `commit-msg`
peut lire le message, donc seul lui peut exiger qu'une dérogation y soit **écrite**. C'est ce qui rend la
dérogation archivée : elle est dans l'historique Git pour toujours.

**Activation** (une fois par poste, Git ne l'active pas seul) :

```
git config core.hooksPath .githooks
```

**Contournement** : `git commit --no-verify` saute **tous** les hooks, y compris l'anti-fuite. On ne le fait
pas. Si un garde-fou bloque à tort, on corrige le garde-fou, on ne le saute pas.

> **📦 Dans ce dépôt** : `.githooks/pre-commit`, `.githooks/commit-msg`, scripts dans `scripts/check-*.js`.
> Chaque appel dans `pre-commit` est précédé d'un commentaire qui raconte **le bug fondateur** du script.

### 5.3 Ce qu'est un bon garde-fou (les règles qu'on s'est données)

1. **Il naît d'un vrai bug.** Le commentaire au-dessus de son appel raconte l'incident, avec la date.
2. **Il est bloquant** sauf mention explicite « advisory » (avertit sans refuser). Ici, un seul est advisory.
3. **Il exécute le vrai code plutôt que de le lire.** Un `grep` vérifie qu'une ligne existe ; charger le
   module et appeler la fonction vérifie qu'elle **marche**. Plusieurs scripts extraient une fonction du
   fichier réel et la rejouent sur des cas connus.
4. **Il est éprouvé en le falsifiant.** Avant de le déclarer utile, on sabote le code (on remet le bug, on
   altère la valeur de référence) et on vérifie qu'il **passe au rouge**. Le journal note « N sabotages
   rougissent » pour chaque nouveau garde-fou. Un vert jamais vu rouge ne prouve rien.
5. **Il ne remplace pas le test sur appareil.** Aucun script n'exécute l'application dans un navigateur
   avec des yeux humains. C'est le trou que la porte de release (§6) existe pour combler.
6. **Il est listé dans une doc à jour.** Sinon on ne sait plus ce qui est vérifié (§12).

### 5.4 Le cas particulier : l'anti-fuite entre deux dépôts

Quand un projet a une version **publique** et une version **privée** (ici « community » et « pro »), le
risque numéro un est qu'un morceau du privé se retrouve dans le public par erreur. La règle ⚪ « ne jamais
référencer du code pro » ne suffit pas. On a donc un script, **premier de la suite pré-commit**, qui refuse
tout commit contenant un nom de module, une clé de stockage, un en-tête d'authentification ou un chemin
appartenant au dépôt privé. Il n'analyse que les fichiers **stagés** (rapide) et connaît une courte liste
d'exceptions (docs pédagogiques qui mentionnent le mot).

---

## 6. Vérifier avant de livrer : la porte de release

**Pourquoi elle existe** : à un moment du projet, neuf garde-fous automatiques étaient verts en permanence,
et **tous** les bugs trouvés au test manuel étaient passés au travers. Motif unique : aucun script
n'exécute l'application dans un navigateur. On a donc formalisé une porte à quatre marches, **avant tout
merge sur la branche principale**.

| # | Marche | Qui | Dérogeable ? |
|---|---|---|---|
| 1 | **Garde-fous automatiques** : suite pré-commit verte + garde-fou de release | machine | noyau : non · doc : oui |
| 1bis | **Smoke navigateur automatisé** : un navigateur sans écran démarre l'app, ouvre les écrans principaux, échoue sur toute erreur console, clé de traduction manquante, fichier introuvable ou fenêtre invisible | machine (30 s) | oui |
| 2 | **Smoke test manuel** : 12 points **fixes** (démarrage, chargement, dessin, sauvegarde/restauration, export/réimport, mise à jour…) sur l'environnement de dev, cache vidé. 5 sont « noyau dur » (jamais dérogeables) | humain (~10 min) | par item, sauf 🔒 |
| 3 | **Checkup ciblé** : scénarios destructifs sur les modules touchés par la release, y compris des checkups automatisés par sujet (langues, petite fenêtre, import multiple, dossiers) | humain + IA | par item |
| 4 | **Trempage** : la release vit sur l'environnement de dev pendant l'usage réel, 24 à 48 h | humain | oui (hotfix urgent) |

**Le smoke manuel a une liste fixe, qu'on n'adapte pas par release.** Un item coûte une minute ; en douter
coûte une régression.

### 6.1 Les dérogations : passer sans valider, mais jamais en silence

Un item peut être **invalidable en pratique** (pas de données de test, matériel absent, cas exotique).
La porte doit pouvoir s'ouvrir quand même, aux conditions suivantes, **toutes** :

1. **Qui** : le propriétaire seul. L'IA propose, n'accorde jamais.
2. **Quoi** : uniquement des items non-🔒. Le noyau dur ne se déroge pas, même en urgence.
3. **Trace** : motif · risque résiduel accepté · plan de rattrapage, dans le relevé de release.
4. **Suivi** : une dérogation avec rattrapage devient une entrée du backlog. Sinon elle s'évapore.

**« Pas le temps » n'est pas un motif.** On réduit le périmètre de la release plutôt que de la valider à
moitié.

> **📦 Dans ce dépôt** : `docs/RELEASE_GATE.md` (les 4 marches, la liste des 12 points, le relevé à
> recopier), `scripts/smoke/` (smoke automatisé + checkups ciblés, `README.md` dedans).

---

## 7. Versionner et livrer

### 7.1 Les branches

| Branche | Rôle | Qui écrit |
|---|---|---|
| `main` | **Toujours déployable.** On n'y arrive que par la porte (§6) | Le propriétaire, via le script de merge |
| Branche de travail (ici `Karma_dev`) | Là où l'IA et le propriétaire travaillent au quotidien | Les deux |
| Branche du collaborateur (ici `Chig_Dev`) | Son espace | Lui seul. L'IA est bloquée en dur |

### 7.2 Une version = trois endroits d'accord

Une application web installable garde une copie d'elle-même dans le navigateur (le « service worker »).
Si on change le code sans changer le nom de cette copie, **la mise à jour n'atteint jamais l'utilisateur**.
Ici la version vit donc à **trois** endroits (le cache, le badge affiché, le fichier de version lu par le
vérificateur de mise à jour), et le garde-fou `commit-msg` refuse tout bump où ils divergent. C'est le seul
contrôle **jamais dérogeable** : un échec ici est invisible et définitif chez l'utilisateur.

### 7.3 Les notes de version pour l'utilisateur

Le fichier de version porte des **notes** lues par l'utilisateur dans l'app. Règle : **1 à 2 phrases, zéro
jargon, uniquement la version courante**. L'historique vit dans le journal (§9.1), pas là. Une IA a
tendance à y écrire du technique : la règle est dans le fichier de contexte pour ça.

### 7.4 Ce qui est automatisé et ce qui ne l'est pas (et pourquoi)

| Étape | Automatisé ? | Par quoi |
|---|---|---|
| Vérifications au commit | ✅ | Hooks Git (§5.2) |
| Cohérence des trois sources de version | ✅ | Garde-fou `commit-msg` |
| Merge sur `main` | ⚙️ semi : un script vérifie tout ce qu'une machine peut vérifier (arbre propre, branche légitime, versions, garde-fous, porte qualité SonarQube locale, CI GitHub verte, `main` à jour), montre ce qui va partir, puis **demande de confirmer, en tapant**, les marches 2 à 4 de la porte | `scripts/release/merge-main.ps1` (propriétaire seul) |
| Tag Git + page de release sur GitHub | ✅ | Workflow d'intégration continue, déclenché par le merge sur `main` |
| Image Docker pour l'auto-hébergement | ✅ | Second workflow, déclenché par le tag |
| **Déploiement sur les serveurs** | ❌ **manuel**, par le propriétaire | Script d'envoi qui affiche version + cache avant d'envoyer, refuse d'écraser les données en prod, normalise les droits après |

**Pourquoi le déploiement reste manuel** : c'est l'acte le plus visible et le moins réversible. On préfère
que l'humain le fasse en conscience, après la porte. Le script existe pour éviter la classe de bugs
« upload partiel » (un dossier oublié = doc périmée en ligne, clés de traduction « manquantes », page cassée),
vécue trois fois en une semaine.

**Le point 13 du smoke manuel** vérifie justement, **sur le serveur**, que les pages annexes portent la
bonne version : les hooks lisent le dépôt, jamais le serveur.

---

## 8. Les audits périodiques

Un audit est une **relecture systématique** d'un aspect du projet, hors du fil des demandes du jour. On en
fait de plusieurs sortes, à cadence irrégulière (à chaque fois qu'un signal l'appelle : incident, palier de
version, sensation de dérive).

| Audit | Question posée | Comment on le fait | Sortie |
|---|---|---|---|
| **Réseau & confidentialité** | Qu'est-ce que l'app envoie sur le réseau, à qui, et comment l'utilisateur peut-il le vérifier lui-même ? | Inventaire de toutes les connexions sortantes, politique de sécurité du navigateur (CSP), procédure de vérification par l'utilisateur, interrupteur de chaque tiers contacté | Une **page de transparence** publique, mise à jour à **chaque version** (contrôlé par le garde-fou de release) |
| **Sécurité (offensive)** | Que peut faire un attaquant contre le serveur ou l'app ? | Audit externe déposé dans le dépôt mais **ignoré par Git** (il décrit comment exfiltrer des données réelles : il ne doit partir ni sur GitHub ni en prod) | Rapport local, corrections dans le journal |
| **Code mort** | Qu'est-ce qui n'est plus appelé nulle part ? | Deux agents IA **indépendants** + un scan des clés de traduction, puis vérification humaine avant toute suppression | Lots de suppression commités un par un ; ce qui est « mort mais gardé exprès » est listé pour ne pas être re-signalé |
| **Ergonomie** | Un utilisateur non développeur s'en sort-il ? Les fonctions de sécurité sont-elles fiables ? | 8 agents IA avec une **persona** (ergonome de métier), lecture du code et de la doc, puis vérification manuelle des bloquants par l'IA principale | Rapport avec bloquants / quick wins / lourds, écarts doc ↔ app, manques vs concurrents ; arbitrage du propriétaire consigné |
| **Fenêtres modales**, **traductions** | Fuites, cycles de vie, clés manquantes, textes en dur | Workflow multi-agents avec **vérification adversariale** (un second agent tente de réfuter chaque constat) | Rapport lisible + fichier brut de tous les constats |
| **Doc ↔ app** | La doc décrit-elle ce que l'app fait vraiment ? | Inclus dans l'audit ergonomie ; plusieurs scripts vérifient en continu la structure de l'aide intégrée, le vocabulaire, la recherche | Écarts corrigés dans la même release |

### 8.1 La règle qui sauve les audits : **archiver immédiatement**

Le premier audit de modales (juin 2026, 153 constats) a été **perdu** : la conversation a été résumée par
l'outil avant que le rapport soit écrit dans le dépôt. Depuis, la procédure est :

1. Lancer l'audit.
2. **Dès réception**, déposer dans `docs/audits/` le rapport lisible **et** le fichier brut de tous les
   constats (fichier, ligne, gravité, verdict).
3. Mettre à jour l'index des audits (date, périmètre, version auditée, constats bruts → confirmés).
4. Committer, indépendamment du sprint de correction.

Le fichier brut permet de suivre fix par fix, de comparer deux audits, et de reprendre un constat sans
relancer le workflow.

### 8.2 Ce que les audits nous ont appris sur l'IA

- **Le taux de faux positifs est réel** : 153 constats bruts → 30 confirmés (20 %) au premier audit ;
  87 → 61 (70 %) au second, une fois la méthode rodée. **Un constat d'IA non vérifié n'est pas un fait.**
- **« Jamais appelé » ne veut pas dire « à appeler ».** Un nettoyage de code mort a **branché** une fonction
  inutilisée « parce que son commentaire disait qu'elle devait l'être » : elle cassait un cache volontaire.
  Révoqué. Vérifier le **design** avant de brancher un nettoyage.
- **Un inventaire de dettes sourcé sur la doc était faux à 30 %** : 3 dettes sur 10 étaient déjà payées.
  Cause : les docs sont des journaux ajoutés à la suite, où une limitation ancienne est levée plus loin sans
  renvoi. D'où le niveau de preuve sur chaque entrée du backlog (§9.3).
- **Un harnais de test qui mesure trop tôt ne trouve pas un bug, il en fabrique un.** Un script de mesure
  concluait avant qu'un écran d'attente ait disparu : il a inventé une dette de toutes pièces, classée
  sans suite après quinze jours.

### 8.3 Et le RGPD, les CGU, le légal ?

Ce dépôt ne fait pas d'« audit RGPD » au sens formel : l'application est conçue **sans collecte** (tout
reste sur l'appareil de l'utilisateur, aucun compte, aucune télémétrie), ce qui réduit le périmètre RGPD à
sa plus simple expression. Ce qui en tient lieu :

- La **page de transparence réseau** (audit ci-dessus) : c'est la preuve publique et vérifiable de la
  non-collecte, versionnée avec l'app.
- Les **conditions d'utilisation** : un écran légal au premier lancement, dont une copie hors-ligne vit dans
  le dépôt (cadrage bilingue, textes de loi en français). Elles sont là parce que le domaine d'usage
  (sites souterrains) engage la responsabilité de l'utilisateur.
- La **licence** (Creative Commons BY-NC-SA) et la protection juridique du code, documentées dans la doc
  d'architecture sécurité/légal.
- Une **frontière** : ce qui touche à un backend, à des comptes ou à une synchronisation vit dans le dépôt
  privé, avec ses propres obligations. Le dépôt public reste hors de ce périmètre, et l'anti-fuite (§5.4)
  garantit qu'il y reste.

Si ton projet collecte des données (compte, serveur, analytics), le RGPD devient un vrai sujet : registre
des traitements, base légale, durée de conservation, droit d'accès. Demande-le explicitement à ton IA, elle
ne le fera pas d'elle-même.

---

## 9. Documenter (et pourquoi c'est vérifié au commit)

### 9.1 Les quatre axes à chaque version

Une version sans mise à jour de doc est une **dette immédiate**. On a défini quatre axes, et le garde-fou de
release vérifie que trois d'entre eux ont bougé :

| Axe | Contenu | Vérifié au commit ? |
|---|---|---|
| 📱 **In-app** | Doc utilisateur (3 langues), aide intégrée, contexte pour l'assistant IA de l'app | Contexte IA : oui (a bougé) · doc user : non (faux positifs sur les hotfix) |
| 🔒 **Audit** | Page de transparence réseau (Markdown + HTML) | Oui (en-tête à la bonne version + entrée d'historique) |
| 📖 **Dev** | Journal des versions dans le `README.md` (bloc « version courante » + entrée détaillée) | Oui |
| 🤖 **Archi IA** | Fichier de contexte de l'IA + doc d'architecture du sujet touché | Non (conditionnel par nature) |

### 9.2 Où vit quoi

| Document | Rôle | Règle d'or |
|---|---|---|
| `README.md` | **Journal** des versions, référentiel des modules, conventions | Une entrée par version, **en tête du journal**, jamais en tête de fichier. Chaque entrée raconte : demande, diagnostic (🩸), correction (🩹), garde-fou (🛡️), tests |
| `docs/BACKLOG.md` | **Ce qui reste à faire**, dettes, sujets enterrés | Une entrée soldée est **supprimée**, pas barrée. Le seul état stable est « ouvert » |
| `docs/architecture/<sujet>.md` | Source de vérité technique par sous-système | Lu à la demande ; mis à jour quand l'archi change |
| `docs/architecture/gotchas.md` | Pièges connus, renommages | Chaque piège raconte pourquoi il a survécu si longtemps |
| `docs/audits/` | Rapports d'audit datés + index | Archivés **immédiatement** (§8.1) |
| `docs/applications/` | Docs servies **dans l'app** : user, contexte IA, transparence réseau, CGU, auto-hébergement | Ce sont des pages publiques : jamais de secret, jamais de note de travail |
| Fichier de contexte de l'IA | Règles + table d'orientation | Court (§4.4) |
| En-tête de chaque module de code | Ce qu'il fait, ses pièges, ses dépendances | 40 lignes qui évitent d'en lire 4 000 |

### 9.3 Le niveau de preuve (contre la doc qui ment)

Parce que les docs sont des journaux ajoutés à la suite, une affirmation ancienne peut être fausse
aujourd'hui sans que rien ne le signale. Chaque entrée du backlog porte donc un tag :

| Tag | Sens |
|---|---|
| ✅ **vérifié** | confirmé dans le **code** à la date indiquée |
| ⚠️ **doc seule** | lu dans une doc, jamais recoupé au code : à vérifier avant d'agir |
| 🔬 **hypothèse** | piste identifiée, non testée |

Et la règle vaut **dans les deux sens** : une dette qui traîne alors qu'elle est soldée fait recommander un
chantier déjà fait. On reclôt le jour même.

### 9.4 Le style du journal (ce qu'on demande à l'IA)

Une entrée de journal n'est pas une liste de fichiers modifiés (Git le sait déjà). Elle raconte, dans
l'ordre : **la demande** telle que formulée, **le diagnostic** (ce qu'on croyait, ce que c'était
vraiment), **la correction**, **le garde-fou ajouté** et le nombre de sabotages qui le font rougir, **ce
qui a été testé et ce qui ne l'a pas été**. Le dernier point est celui que l'IA oublie spontanément : on
l'exige.

---

## 10. La mémoire de l'IA et le dépôt : qui garde quoi

Les outils d'IA récents ont une **mémoire persistante** entre sessions (ici : des fichiers hors dépôt, un
souvenir par fichier, avec un index d'une ligne par souvenir chargé à chaque session). Il faut décider ce
qui y va, sinon elle diverge du dépôt.

| Va dans la **mémoire de l'IA** | Va dans le **dépôt** |
|---|---|
| Les préférences de travail du propriétaire (« topo avant de coder », « jamais `git add -A` ») | Tout ce qui décrit le projet : archi, backlog, journal, pièges |
| Les décisions prises **en connaissance de cause**, avec la date et le pourquoi (« le verrou PIN est temporisé, jamais définitif, ne pas rouvrir sans fait nouveau ») | Les règles qui s'appliquent à **toute** IA et à tout humain (fichier de contexte) |
| Les pièges d'outillage **hors dépôt** (un serveur local qui ressert du code périmé, une URL qui bloque un onglet de test) | Tout ce qu'un nouveau poste ou un collaborateur doit récupérer avec `git clone` |
| Un **pointeur** vers le backlog, pas une copie | Le backlog lui-même |

**Leçon vécue** : tenir une liste de « choses à faire » dans la mémoire de l'IA a produit une to-do
parallèle à celle du dépôt, qui rouvrait des sujets déjà soldés. Depuis : la mémoire dit « le backlog vit
dans `docs/BACKLOG.md`, lis-le », et rien d'autre.

---

## 11. Le contrat de communication avec l'IA

C'est écrit dans le fichier de contexte, et ça change tout au quotidien :

1. **Jamais de validation de politesse en ouverture.** Si l'hypothèse est fausse, la première phrase le dit.
2. **Confiance taguée** sur toute affirmation non triviale : `[Certain]` (test exécuté, code lu, doc
   officielle), `[Probable]` (déduction solide), `[Supposition]` (trou comblé, à vérifier).
3. **Pas de flatterie.** « Excellente question », « tu as raison », « absolument » sont bannis.
4. **Désaccord structuré** : « Je ne suis pas d'accord parce que X. À ta place je ferais Y. Le risque, c'est Z. »
5. **La vérité qui dérange en première ligne** : bug non reproduit, test manquant, dette créée, décision
   risquée. Jamais enterrée en fin de recap.
6. **Zéro échauffement.** Première phrase = la chose la plus utile.
7. **Tenir position** face à une contestation sans argument neuf. **Mais** une fois que le propriétaire a
   tranché en connaissance de cause, exécuter sans re-litiger, et consigner le désaccord en une ligne si le
   risque est réel.

Et côté méthode : **topo avant de coder** (choix numérotés + recommandation), **coder le minimum**,
**vérifier les régressions entre modules** avant d'affirmer qu'un fix marche, **recap final** structuré
(cause racine · fix · avant/après · tests faits / non faits).

---

## 12. Les erreurs qu'on a faites (et ce qu'elles ont produit)

C'est la section à lire si tu ne lis qu'une seule chose. Chaque garde-fou de ce dépôt a une de ces
histoires derrière lui.

| Incident | Ce qui s'est passé | Ce qu'on a mis en place |
|---|---|---|
| **`git add -A` par l'IA** (14/09/2026) | ~100 Mo de binaires et le travail non commité du propriétaire embarqués dans deux commits. Le propriétaire travaille **en parallèle dans le même arbre** | Règle en mémoire de l'IA : stager par chemins explicites, vérifier l'état avant chaque commit, signaler les fichiers modifiés qu'elle n'a pas touchés |
| **La doc du contexte IA jamais mise à jour** (v1.73.0) | Pendant une version entière, l'assistant IA intégré à l'app répondait « ça n'existe pas » sur deux fonctionnalités livrées | Garde-fou de release `commit-msg` (§5.2) |
| **Un nom de cache oublié** | La mise à jour n'atteignait jamais les utilisateurs | Contrôle des trois sources de version, **jamais dérogeable** |
| **Neuf garde-fous verts, tous les bugs passés** (v1.76.0) | Aucun script n'exécutait l'app dans un navigateur | Porte de release à 4 marches (§6), puis smoke automatisé |
| **Trois erreurs d'exécution en une semaine** (08/2026) | Variable hors portée, classe CSS fantôme, identifiant supprimé mais encore exporté : la vérification de syntaxe passe, l'app meurt au démarrage | Smoke navigateur automatisé + script qui **charge réellement** les modules et vérifie chaque export annoncé |
| **Upload partiel sur le serveur** (3× en une semaine) | Un dossier oublié : doc périmée en ligne, clés de traduction « manquantes » alors que le dépôt était sain | Script de déploiement complet + point 13 du smoke manuel qui vérifie **sur le serveur** |
| **Table de garde-fous fausse** (09/2026) | La doc en comptait 14 quand le hook en câblait 22 | Règle : la table se met à jour le jour même ; un audit l'a corrigée |
| **Inventaire de dettes faux à 30 %** (08/2026) | Sourcé sur des docs ajoutées à la suite | Niveau de preuve sur chaque entrée (§9.3) |
| **Premier audit perdu** (06/2026) | La conversation a été résumée avant l'archivage | Archiver dès réception (§8.1) |
| **Un nettoyage qui branche une fonction « oubliée »** | Elle cassait un cache volontaire | « Jamais appelé ≠ à appeler » : vérifier le design |
| **Un harnais qui mesure trop tôt** | A inventé une dette inexistante | Le harnais refuse de conclure tant qu'un écran d'attente couvre la page |
| **Une copie locale d'un catalogue** (icônes) | La copie a dérivé deux fois en silence sur plusieurs mois | Une seule source + script qui confronte les deux sens |
| **Un guard qui bloquait à tort** | Le chaînage de deux commandes Git déclenchait un faux positif « force » | Commit et push en commandes séparées ; règle écrite |

---

## 13. Démarrer chez toi : le kit en dix étapes

Dans l'ordre. Chaque étape est utile seule ; ne saute pas la première.

1. **Écris le fichier de contexte de l'IA** (une page) : projet, stack, environnements, interdits, où
   chercher, contrat de communication (§4, §11). Demande à ton IA de le rédiger à partir de ce document,
   puis relis-le **toi**.
2. **Décide des branches** : `main` déployable, une branche de travail, et rien d'autre au début.
3. **Installe le gardien Git côté IA** : bloque en dur push sur `main`, push forcé, reset dur (§5.1). Mets
   le push ordinaire en « demande de permission ».
4. **Refuse l'accès aux secrets et aux données** par configuration (§3).
5. **Ajoute la vérification de syntaxe après chaque édition** (§5.1). C'est le filet minimum.
6. **Active les hooks Git** (`core.hooksPath`) avec un `pre-commit` vide, prêt à recevoir ton premier
   garde-fou. Il viendra avec ton premier bug.
7. **Définis « une version »** : où vit le numéro, combien d'endroits doivent être d'accord, et fais
   vérifier leur cohérence au commit (§7.2).
8. **Écris la porte de release** : une liste **fixe** de tests manuels, avec les items non dérogeables
   marqués, et la règle des dérogations (§6).
9. **Crée le journal et le backlog** : une entrée par version dans le premier, le niveau de preuve sur
   chaque entrée du second (§9).
10. **Planifie ton premier audit** au premier palier (par exemple à la dixième version) : réseau et
    confidentialité si ton app parle à un serveur, ergonomie sinon. Archive le rapport le jour même (§8).

Ce que tu peux remettre à plus tard : le smoke automatisé (il vaut le coup dès que tu as eu deux bugs de
démarrage), l'intégration continue (tags et releases automatiques), les skills (procédures répétitives).

Ce que tu ne dois **pas** remettre : les étapes 3, 4 et 8. Ce sont celles qui coûtent le plus cher quand
elles manquent.

---

## 14. Glossaire

| Terme | Ce que ça veut dire ici |
|---|---|
| **Dépôt (repo)** | Le dossier du projet suivi par Git, avec tout son historique |
| **Commit** | Une sauvegarde nommée et datée d'un ensemble de modifications |
| **Stager** | Choisir quels fichiers entrent dans le prochain commit. « Par chemin explicite » = en les nommant un par un |
| **Branche** | Une ligne de travail parallèle. `main` est la ligne officielle |
| **Merge** | Ramener une branche dans une autre |
| **Push** | Envoyer ses commits vers le serveur Git (GitHub). **Push forcé** = réécrire ce qui y est déjà (dangereux) |
| **Reset dur** | Remettre le dossier à l'état d'un commit en **jetant** le travail non sauvegardé |
| **Hook** | Programme lancé automatiquement à un moment précis (avant une commande, avant un commit…) |
| **`pre-commit` / `commit-msg`** | Les deux moments de hook Git utilisés ici : avant le message, et après |
| **Garde-fou** | Un script qui vérifie une règle précise et refuse le commit si elle est violée |
| **Bloquant / advisory** | Refuse le commit / avertit seulement |
| **Sabotage (éprouver en falsifiant)** | Casser le code exprès pour vérifier que le garde-fou passe au rouge |
| **Régression** | Quelque chose qui marchait et ne marche plus après une modification |
| **Smoke test** | Un test rapide qui vérifie que l'essentiel démarre et fonctionne (« ça ne fume pas ») |
| **Porte de release** | La liste de vérifications à franchir avant de merger sur `main` |
| **Dérogation** | Passer une vérification sans la valider, **avec** motif, risque et rattrapage écrits |
| **Release / bump** | Publier une nouvelle version / augmenter le numéro de version |
| **CI/CD** | Intégration et déploiement continus : des robots qui vérifient et publient à chaque merge. Ici : tag, page de release et image Docker automatiques ; **déploiement manuel** |
| **Déploiement** | Mettre les fichiers sur le serveur qui les sert aux utilisateurs |
| **Service worker / cache** | Le mécanisme qui permet à une app web de fonctionner hors ligne ; il faut renommer son cache à chaque version |
| **Environnement de dev / prod** | Le serveur d'essai / le serveur des vrais utilisateurs |
| **Trempage** | Laisser une version vivre en dev pendant l'usage réel avant de la mettre en prod |
| **Audit** | Relecture systématique d'un aspect (réseau, sécurité, code mort, ergonomie…) |
| **Vérification adversariale** | Un second agent IA tente de réfuter chaque constat du premier |
| **Persona** | Le rôle qu'on fait jouer à un agent IA pour un audit (« ergonome de métier, non développeur ») |
| **Code mort** | Du code que rien n'appelle plus |
| **i18n** | Internationalisation : les textes sortent du code pour aller dans des dictionnaires par langue |
| **Backlog** | La liste de ce qui reste à faire |
| **Dette (technique)** | Un raccourci pris en connaissance de cause, à payer plus tard |
| **Token** | L'unité de texte facturée à une IA. Tout ce qu'elle lit ou écrit en coûte |
| **Fenêtre de contexte / compaction** | La quantité de conversation que l'IA peut garder en tête ; au-delà, l'outil la résume et **des détails se perdent** |
| **Skill** | Une procédure écrite que l'IA charge uniquement quand on l'invoque |
| **Sous-agent** | Une IA secondaire lancée pour une tâche bornée (explorer, auditer), qui ne rend que sa conclusion |
| **RGPD** | Règlement européen sur les données personnelles. Périmètre minimal quand l'app ne collecte rien |
| **CGU** | Conditions générales d'utilisation, acceptées par l'utilisateur au premier lancement |
| **CSP** | Politique de sécurité du navigateur qui liste les seules adresses que l'app a le droit de contacter |

---

## 15. Amorce à donner à ton IA

Copie-colle ceci en tête de ta première conversation, avec ce document en pièce jointe :

> Tu vas m'aider à organiser mon projet pour travailler avec une IA de code. Lis le document joint en
> entier. Il décrit une méthode éprouvée sur un autre projet : rôles, interdits imposés par des hooks,
> garde-fous nés de bugs réels, porte de release, audits, documentation, économie de tokens.
> Applique le kit du §13 à mon projet, étape par étape, en commençant par me poser les questions du §4.2
> pour rédiger mon fichier de contexte. Respecte le contrat de communication du §11 dès maintenant :
> pas de flatterie, confiance taguée, la vérité qui dérange en premier. Ne saute aucune des étapes 3, 4
> et 8. Avant chaque action irréversible, demande-moi.

---

> **📦 Pour retrouver les originaux dans ce dépôt** : `CLAUDE.md` (contexte IA) · `.claude/settings.json` +
> `.claude/hooks/` (hooks côté IA) · `.githooks/` + `scripts/check-*.js` (hooks Git et garde-fous) ·
> `docs/RELEASE_GATE.md` (porte) · `scripts/smoke/` (smoke automatisé) · `scripts/release/merge-main.ps1`
> (merge) · `docs/architecture/infra-versioning.md` §85 (déploiement Git, scripts hors dépôt) · `docs/audits/INDEX.md` (audits) · `docs/BACKLOG.md` (backlog) ·
> `docs/applications/NETWORK_AUDIT.md` (transparence réseau) · `docs/applications/CGU.md` (légal) ·
> `docs/architecture/infra-versioning.md` §83-84 (suite de garde-fous, garde-fou de release).
