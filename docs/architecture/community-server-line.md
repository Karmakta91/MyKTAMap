# Architecture MyKTAMap — Frontière community ↔ pro, mode serveur « kiosque », connexion serveur

> **Document de gouvernance (décisions KARMA du 30/07/2026, frontière révisée le 04/10/2026).**
> Toute modification de ce périmètre = arbitrage explicite de KARMA, jamais un choix
> d'implémentation. Référencé par CLAUDE.md (§ Frontière community ↔ pro).

---

## 1. Les promesses (non négociables)

**myktamap.fr (et dev.myktamap.fr) n'ont pas de backend, et n'en auront jamais.** C'est la
promesse publique : NETWORK_AUDIT borne déjà sa garantie à ce domaine.

**Le repo community produit une app qui fonctionne entièrement sans serveur applicatif :**
- servable par n'importe quel hébergement de fichiers (FTP, GitHub Pages, Docker nginx, clé USB) ;
- **aucun code serveur dans ce repo** (PHP, Node…), aucun module JS qui parle à un backend ;
- toutes les données utilisateur restent dans le navigateur (localStorage / IndexedDB) ;
- gratuite, **sans bridage** : aucun flag ne verrouille une capacité derrière un paiement.

**La frontière pro n'est plus « zéro trace », c'est « zéro fichier pro ».** Le pro, ce sont
les fichiers qui se **greffent** sur l'app (PHP + JS propres à son fonctionnement). Ils vivent
dans le repo privé `MyKTAMap-pro`, ne sont jamais servis ni précachés quand la connexion
serveur est coupée, et ne sont jamais commités ici. Le repo community peut, lui, porter des
**points d'extension neutres** (§3), pour que le pro se greffe sans patcher le cœur.

## 2. Le mode serveur « kiosque » — ce qu'il EST

Un déployeur (asso, collectif — archétype « serveur Gironde ») copie l'app statique et
pré-installe **ses plans** dans `data/` + un `data/index.json` enrichi (généré par
`confadmin.html`). C'est **la même app**, avec de la configuration de contenu :

| Capacité | Vecteur | Statut |
|---|---|---|
| Plans pré-installés | `index.json > plans[]` | depuis toujours (auto-discovery) |
| Liaisons inter-plan fournies | `index.json > liaisons` (merge par id, ids `server_<id>`) | v1.73.0 |
| Sous-titre personnalisé (ex. « Gironde ») | `index.json > config.subtitle` | v1.73.0 |
| Masquer l'import de plans | `index.json > config.serverPlansOnly` | v1.73.0 |
| Masquer le Générateur | `index.json > config.disableGenerator` | v1.73.0 |
| Étiquettes proposées par plan | `index.json > plans[].tags` (12 × 24 car.) | v1.90.1 |
| Mot de passe d'accès de l'instance | `index.json > config.accessHash` (SHA-256) | v1.90.6 |
| Dossiers de « Mes plans » proposés | `index.json > folders[{ id, name, color, order, rule? }]` + `plans[].folder` — verrouillés tant que déclarés, libérés (jamais supprimés) sinon ; l'utilisateur déplace toujours ses plans | v1.95.0 |
| Ouvrir la liste en mode Dossiers | `index.json > config.plansViewDefault: "folders"` — seulement tant que l'utilisateur n'a pas choisi lui-même | v1.95.0 |
| Ne pas charger les plans du site au démarrage | `index.json > config.sitePlansHiddenDefault: true` — défaut de « Ne pas charger les plans du site » (⚙️ Configuration) tant que l'utilisateur n'a pas choisi ; sans effet avec `serverPlansOnly` (installation où les plans vivent en base, demande KARMA 05/10/2026) | v2.9.0 |

**Règle des 2 flags** : `serverPlansOnly` et `disableGenerator` sont les DEUX SEULS
flags de comportement kiosque. `plansViewDefault` (v1.95.0) et `sitePlansHiddenDefault` n'en sont pas : ce sont
des DÉFAUTS d'affichage, que le premier choix de l'utilisateur (sélecteur Tout | Dossiers, case de ⚙️ Configuration)
remplace pour toujours — décision KARMA 9 de l'étude du 16/09/2026. Tout flag supplémentaire = topo + décision KARMA
consignée ici. Les flags sont du **désencombrement d'interface** (déclutter), PAS de
la sécurité ni du bridage : contournables via la console, et c'est assumé — les
données de l'utilisateur final lui appartiennent toujours (sessions, carnet, notes,
photos restent locales et exportables).

## 3. La connexion serveur — points d'extension

> ✅ **Livré en v2.0.0 (chantier 0)** : lecture de `serverConnection`, états OFF / INVALIDE /
> LICENCE / CONFIGURÉE, mémorisation (règle B), pastille du pied de page, bloc ConfAdmin,
> garde-fou `scripts/check-connexion-serveur.js` — code dans `js/ktaExtensions.js`.
> ✅ **Chantiers 1 à 3 livrés (v2.1.0 → v2.10.3)** — licence pro signée, vérifiée par l'app (`security-legal.md` §77.3) : identifiants stables, lecture unique de l'index avant
> les gates, et **toutes les prises** ci-dessous (`js/ktaExtensions.js`, garde-fou
> `scripts/check-extensions.js`). Signatures (API v1) :
> `KtaExtensions.register({ nom, apiVersion: 1, gate: { ouvrir() → Promise }, plans: { lister() →
> Promise<[{id,name,version?,tags?}]>, charger(id, { progression?, signal? }) → Promise<Blob ZIP> }, importAutorise() → bool,
> exportAutorise(planId) → bool, publierPlan({ blob, nom }) → Promise, compte() → { pseudo, libelle } | null })` ·
> `signaler("on"|"down"|"licence"|null, raison?)` — `"licence"` = le **serveur refuse la licence** (sa raison :
> expiree, signature, domaine…) : état « licence », libellé « Licence refusée par le serveur », jamais « injoignable » ·
> `chargerModules()` · `requete(chemin, { …fetch, sonde? })` · `changementsDepuis(ts)` ·
> `effacerDonneesExtension(planIds)` · `secoursAppliquer(id, partiel)` · `compte()` · `notifierCompte()` ·
> `appliquerChangements({ editorPoints, roads, zones, structures, tombstones })` ·
> `actionsCompte(lieu) → [{ libelle, action }]` (prise) · `blocActionsCompte(lieu, titre)` · `importAutorise()` /
> `exportAutorise(id)` / `gateDeleguee()` côté community. Reste : chantier 4 (modules et backend, repo pro).
> 🆘 **Outils du community pour une gate déléguée** (10/10/2026) : `window.ktaOuvrirDepannage()` (fenêtre 🆘
> Dépannage de l'accueil : mise à jour forcée, page de secours, tout réinitialiser — `kta-depannage-modal`, z-index
> 99999 : la gate passe dessous tant qu'elle est ouverte) et `window.afficherReadme({ hideOnboarding: true,
> overLocker: true })` (Documentation, au-dessus d'un écran plein). Une installation bloquée à la connexion garde
> ainsi une issue.
> 📶 **Réseau** : `offline` → état « down » aussitôt (la garde refuse, l'accueil rouvre la copie gardée) ; `online` →
> événement `mktm:reseau-retour`, à la suite duquel le module sonde et `signaler("on"|"down")`. Un échec réseau
> isolé d'une requête ne change **pas** l'état (sinon la garde bloquerait tout jusqu'à la sonde suivante).
> 🔏 **Licence (09/10/2026)** : une installation qui déclare une connexion serveur **sans licence serveur valide**
> (absente, expirée — cache compris, même hors ligne —, refusée par le serveur) est **fermée** : écran « Installation
> indisponible » (motif licence) AVANT les modules et la gate community (`main.js`, `_motifBlocage`). Jamais
> d'ouverture en community sur les données gardées par le dernier utilisateur de l'appareil.
> ⏱️ `charger` reçoit `opts.signal` (AbortSignal) du veilleur d'inactivité de l'accueil (rien en 15 s, puis plus un
> octet pendant 20 s → annulé) : le transmettre à sa requête ; l'accueil abandonne de toute façon (`Promise.race`).
> Ce paragraphe ne décrit que ce que **community** fournit. Comptes, rôles, synchro et
> chiffrement sont des décisions pro : elles vivent dans `MyKTAMap-pro`.

Une instance (infra dédiée, hors myktamap.fr) peut greffer des modules qui parlent à un
serveur. Community fournit l'interrupteur, l'état, le chargeur et les prises ; jamais le code
qui parle au serveur.

**Le champ** : `index.json > config.serverConnection`, un objet :

```json
"serverConnection": { "state": "on", "api": "https://api.exemple.org", "modules": ["pro/sync.js"] }
```

- `state` : `"on"` | `"off"`. Ce n'est pas un flag kiosque au sens de la règle des 2 flags
  (§2) : ce n'est pas du désencombrement, c'est l'interrupteur des extensions, régi par ce
  paragraphe seul.
- `api` : adresse du backend, sous l'une de deux formes :
  - `https://…` : une origine, qui peut différer de celle de l'app (règle D) ;
  - un **chemin du même site** (`/api/`) : résolu à l'adresse de l'app au moment de l'appel
    (`KtaExtensions.apiBase()`). C'est le cas normal d'une installation à proxy `/api` : elle marche alors par
    `localhost`, par IP (test sur téléphone en wifi) ou par nom de domaine, sans changer l'index. Refusés :
    `//…` (protocole-relatif), un chemin sans `/` initial, un paramètre ou un espace.

  Une adresse d'API n'est pas un secret : l'index est public et c'est assumé.
- `modules` : chemins des scripts greffés, **même origine que l'app** (`script-src 'self'`) : relatif, sans
  remontée, terminé par `.js`, avec un seul suffixe permis, `?v=<version>` (lettres, chiffres, `. _ -`, 32 max).
- `transparence` (facultatif) : page de transparence de l'installation, **même site**, chemin relatif terminé
  par `.html` (mêmes règles qu'un module, sans suffixe). Dès que l'état n'est pas OFF, la pastille ouvre cette
  page au lieu de l'audit réseau community (qui ne sait pas ce que l'installation fait des données). Champ dans
  ConfAdmin ; `valider()` et sa copie ConfAdmin le gardent (concordance vérifiée par `check-connexion-serveur.js`).

**Les états** :

| État | Condition | Affichage (footer) | Modules greffés / requêtes |
|---|---|---|---|
| **OFF** | Champ absent ou `state: "off"` — cas de myktamap.fr | 🔌 « Base de données : désactivée » | Jamais chargés ; garde bloquant |
| **INVALIDE** | Champ mal formé : pas un objet, `state` inconnu, `api` hors `https://`, module hors de l'origine de l'app (raison exacte journalisée `[Connexion]`) | « Configuration invalide » (décision de l'auteur, plutôt qu'un repli silencieux en OFF) | Jamais chargés ; garde bloquant |
| **LICENCE** | `"on"` mais aucune licence pro de source `"server"` | « Licence requise » | Jamais chargés |
| **CONFIGURÉE** | `"on"` + licence serveur, mais aucun module ne s'est encore déclaré | « Configurée, aucun module » | Personne ne sonde le serveur (règle C) : c'est l'état normal de tout le chantier 0 |
| **ON** | `"on"` + licence serveur + backend qui répond | « Connecté » | Chargés ; requêtes autorisées |
| **DOWN** | `"on"` + licence serveur, backend injoignable — ou index injoignable alors que la dernière config connue était `"on"` | « Serveur injoignable » | Chargés (depuis leur cache) ; rien ne part, travail en local |

**Règles** :
- **A. Champ absent = OFF.** Un vieil index reste valide, myktamap.fr n'a rien à écrire.
- **B. Index injoignable au démarrage = dernière config mémorisée.** Mémorisée `"on"` →
  DOWN ; jamais vue → OFF. 🩸 Même piège que `revaliderInstance` : « index injoignable »
  et « connexion coupée par le déployeur » ne doivent pas se confondre. Une instance
  configurée connectée qu'on ouvre hors ligne est **HS**, pas désactivée (décision de l'auteur :
  pas d'échec fermé vers OFF).
- **C. Community expose l'état, le module agit.** Community tient l'état, l'affiche et émet
  un événement `mktm:*` à chaque changement (convention déjà utilisée par
  `mktm:license-changed`). Sondage du backend, synchro, file et résolution des conflits
  appartiennent au module greffé ; c'est lui qui signale à community le passage ON ↔ DOWN.
- **D. L'API peut vivre sur un autre domaine que l'app** (vision cloud / conteneur). La
  CSP de l'instance doit alors **ajouter** l'origine de l'API à `connect-src`, et l'API
  répondre au CORS (preflight `OPTIONS` déclenché par un `PUT` cross-origin). Le `PUT` en
  lui-même ne demande rien à la CSP. Le reste de la CSP (`script-src`, `frame-ancestors`…)
  ne bouge pas : c'est elle qui empêche une injection d'exfiltrer les données synchronisées.
  Le partage en direct du Mode Secours passe par un canal temps réel (WebSocket ou SSE) :
  son origine (`wss://…`) s'ajoute elle aussi à `connect-src`.
- **E. Un module greffé ne se charge que si DEUX conditions sont réunies** : une licence pro
  de source **`"server"`** (le `Licence-pro.json` posé par l'instance ; une licence importée
  par l'utilisateur ne compte pas, cohérent avec v1.90.9) **ET** `state: "on"`. La licence
  reste ce qu'elle est (`proLicense.js` : cosmétique, en clair) : elle décide de ce que l'app
  **charge**, jamais de ce que le backend **accepte**. L'authentification est l'affaire du
  backend.
- **F. Local-first.** L'app écrit **toujours** en local (IndexedDB), comme aujourd'hui ; le
  module pousse vers le backend quand il peut. Il n'y a qu'un seul chemin d'écriture.

**Points d'extension que community devra exposer** (tous neutres : nommés sans référence au
pro, utilisables par n'importe quelle extension, **no-op sans extension**) :

| Point | Rôle | Pourquoi community |
|---|---|---|
| État de connexion + badge footer | Les états (OFF, INVALIDE, LICENCE, CONFIGURÉE, ON, DOWN), l'événement `mktm:*`, le badge **affiché partout, myktamap.fr compris** | Transparence active : la garantie se voit au lieu de se chercher dans l'audit |
| Chargeur de modules | Lit `modules`, vérifie la règle E, injecte les scripts même origine | L'instance garde l'`index.html` community tel quel : zéro fork |
| Garde unique | Toute requête d'extension passe par lui ; hors ON il refuse avant envoi | Même leçon que `ktaKiosqueServeurSeul()` : le verrou est au goulot |
| Gate déléguée | Un module peut remplacer la gate d'entrée (code communautaire / `accessHash`) par son propre écran | Décision de l'auteur : sur une instance connectée, le compte remplace la gate |
| Journal des changements | « Ce qui a changé depuis telle date », horodatage par objet (point, tracé, zone, session…) | Indispensable au local-first et à la résolution des conflits |
| Source de plans enfichable | Un module peut fournir des plans à la bibliothèque (et leur stockage hors ligne) au lieu de `data/` | Sur une instance connectée, les plans soumis à des droits sont servis par le backend seul |
| Filtre d'export | Un module peut refuser l'export ZIP d'un plan (ex. plan partagé dont on n'est pas propriétaire) | L'export vit dans community |
| Effacement à la déconnexion | Un module peut demander l'effacement de ce qu'il a synchronisé, après vérification. **Jamais** les plans importés localement, qui ne viennent pas du backend | Les stores locaux appartiennent à community |
| Droit d'import consulté | Le goulot d'import (`ktaKiosqueServeurSeul()`, import simple et multiple) consulte aussi le module : l'admin règle l'import local, et un Lecteur ne crée ni n'importe aucun plan | Le verrou d'import est déjà au goulot, côté community |
| Publication depuis le Générateur | Prise « plan terminé » : un plan généré reste un brouillon local, puis le module le publie en base sur action du Créateur | Le Générateur vit dans community |
| Mode Secours partagé | Sortant : l'événement `mktm:secours-scenario-mutated` (déjà émis). Entrant : une prise pour appliquer au scénario une modification reçue d'un autre appareil | Le Mode Secours vit dans community ; seul l'entrant manque |

- **Une instance = une adresse** : chaque instance a son propre domaine, donc le navigateur
  isole ses données (stockage par origine). Pas de sélecteur d'instances dans l'app. Une extension qui sert
  **plusieurs organisations à la même adresse** n'en garde qu'une active par appareil et efface ce qu'elle a
  synchronisé au changement (prise « effacement à la déconnexion ») : community ne préfixe pas ses stores.
  Le fragment d'URL (`#…`) est laissé intact au démarrage (`swRegister.js` le recopie quand il nettoie l'adresse) :
  une extension peut y lire ses propres paramètres (lien d'invitation) avant toute autre action.

- **Requêtes de backend jamais en cache** (v2.7.1) : `requete()` marque ses requêtes (`X-Kta-Ext`, `cache: "no-store"`) et le SW ne touche jamais une requête marquée ou portant `Authorization` — indispensable quand le backend est servi à la même adresse que l'app (proxy `/api`), sinon ses réponses (données de compte, synchro) seraient mises en cache sur l'appareil.
- **Dossiers de l'instance** : prise facultative `plans.dossiers()` → `[{ id, name, color?, order?, rule? }]` et champ
  `dossier` sur chaque plan listé. L'accueil les traite comme les dossiers de l'index (proposés, verrouillés tant
  qu'ils sont déclarés, un rangement manuel de l'utilisateur l'emporte), appliqués **avec** ceux de l'index pour ne
  pas les libérer ; `null` (serveur injoignable, erreur) → rien ne bouge. Les étiquettes passent déjà par `tags`.
- **Actions du compte** : la prise `actionsCompte(lieu)` (« profil » | « config ») rend les actions à proposer ; la
  fenêtre « Mon profil » les montre **après la photo et le pseudo, avant le grade**, et le panneau ⚙️ Configuration dans un bloc
  « Installation » (ex. gérer les comptes, pour un admin) — même rendu (`blocActionsCompte`). Texte seulement,
  10 au plus, action protégée ; sans extension, rien n'apparaît.
- **Outils du Mode Développeur** (10/10/2026) : la prise `outilsDev() → [{ libelle, page }]` ajoute des boutons à la
  section 🛠️ Mode Développeur, **seulement quand il est actif** ; `page` est une page `.html` du même site (chemin
  relatif, mêmes règles que `serverConnection.transparence`), ouverte dans un nouvel onglet ; libellé en texte,
  10 au plus. Une extension déclarée après l'accueil fait redessiner la section (événement
  `mktm:extensions-changees`, émis par `register`). Sans extension, rien n'apparaît.
- **Rubrique d'aide** (11/10/2026) : la prise `aide() → { titre, sections: [{ titre, html }] }` ajoute UNE rubrique
  à l'Aide intégrée, juste avant « Pour aller plus loin » (ex. la sécurité et les clés du pro). Lue au rendu (langue
  courante), 20 sections au plus ; HTML de mise en forme admis mais nettoyé (ni script, cadre, formulaire,
  gestionnaire `on*`, ni lien `javascript:` — hygiène, l'extension étant du code de la page) ; recherche du sommaire
  comprise. Erreur ou forme inattendue = rien ; sans extension, l'aide reste celle du community
  (`scripts/check-extensions.js`).
- **Changements reçus** : `appliquerChangements(lot)` applique au plan **ouvert** des objets et traces de
  suppression venus du serveur, par la même fusion que les sessions (`KtaUid.fusionnerCalques` : par `uid`, le
  plus récent gagne, une trace postérieure l'emporte). L'itinéraire en cours n'est jamais touché ; les objets
  reçus sont copiés ; la session est sauvegardée. Sans plan ouvert : `null`. C'est le pendant entrant de
  `changementsDepuis(ts)`.
- **Présence sur le plan ouvert** (tracking à plusieurs, opt-in) : une extension qui déclare
  `presence: { actif(), basculer() }` fait apparaître la tuile **📡 Partager ma position sur ce plan** dans le
  tracker (liste recalculée à chaque ouverture). L'app ne fournit que `positionTracker()` — `{ x, y, niveau,
  suiviActif, ts }`, ou `null` tant qu'il n'y a ni suivi en cours ni position confirmée (jamais le point de
  départ du plan) — et `afficherPresences(liste)` (`js/ktaPresences.js` : repère + pseudo + ancienneté, grisé
  après 2 min, atténué hors niveau, trace pointillée ; entrées non conformes écartées, 200 personnes et
  2000 points max ; aucune requête réseau). `presenceActive()` / `basculerPresence()` : une erreur de
  l'extension = inactif. Sans extension : pas de tuile, rien n'est lu.
- **Itinéraire montré à l'équipe** (opt-in) : une extension qui déclare `itineraire: { publie(), basculer() }`
  fait apparaître le bouton **🧭 Montrer mon itinéraire à l'équipe** dans la fenêtre Itinéraire (mode
  navigation). L'app ne fournit que `itineraireActuel()` — `{ points: [[x, y, niveau]], etapes: [[x, y, faite]] }`
  (étapes sans l'origine tracker), ou `null` sans itinéraire actif — et `afficherItineraires(liste)`
  (`js/ktaPresences.js` : calque distinct, pointillés jaunes atténués hors niveau, étapes ○ / ✓, étiquette
  « 🧭 pseudo » à l'arrivée, rien de cliquable ; 200 itinéraires, 5000 points, 100 étapes max). Actions neutres
  pour un panneau : `KtaPresences.cadrerItineraire(id)`, `masquerItineraire(id, bool)`. `itinerairePublie()` /
  `basculerItineraire()` : une erreur de l'extension = non publié. Sans extension : pas de bouton, rien n'est lu.
  `appliquerItineraire({ points, etapes })` : un itinéraire **reçu** (ex. attribué par un chef d'équipe, accepté par
  l'utilisateur côté extension) devient l'itinéraire actif (`itineraireActiverRoad`, départ en tête des étapes) ;
  entrées non conformes écartées, sans carte : `false`.
- **Auteur d'un objet** : `auteurObjet(uid) → { createur, modifiePar }` (textes ≤ 40 car., erreur = `null`) — filtre
  « Créé par » de l'export de session (onglets Complet et Avancé). Sans extension : filtre auteur absent, la période reste.
- **Sortie du plan affiché** : `KtaExtensions.quitterPlan(vers)`, appelée par `main.js` au changement de plan
  (`"plan"`) et au retour à l'accueil (`"accueil"`) — ferme le panneau d'extension, remet à zéro
  `KtaPresences` (présences, itinéraires, suivi, masquages) et émet **`mktm:plan-ferme`** `{ vers }` pour que
  l'extension oublie l'ancien plan sans attendre. Au changement de niveau affiché, `KtaPresences.redessiner()`
  recalcule l'atténuation « hors niveau ».
- **Lecture seule** (`lectureSeule`) : gardée au bouton ✏️ (`interface.js`), au clic carte de l'éditeur, aux tracés /
  zones / structures, à la fiche d'un objet (mode lecture), à `KtaConvertir` (convertir, supprimer, lot) et au
  remplacement de session du Tableur. À l'ouverture du plan, une fenêtre le dit (`ktaAnnoncerLectureSeule`) et les
  4 outils de dessin (✏️ POI, tracés, zones, structures) sont **grisés** (`kta-outil-lecture-seule`,
  `aria-disabled`) : visibles, un clic rappelle le message sans ouvrir le groupe. `ktaMajOutilsLectureSeule()`
  (`interface.js`) recalcule l'état après `initInterface`, puis à `mktm:compte-changed`,
  `mktm:plans-extension-changes` et `mktm:connexion-changed` (droit perdu en cours : outil armé coupé, menu fermé).
  `check-extensions` §6 bis ter vérifie chaque câblage.
- **Mode d'un plan ☁️** : `plans.lister()` peut donner `tiledV2` / `multiLevel` (booléens, lus dans le ZIP par
  l'extension) — inscrits au registre seulement s'ils valent `true`, comme les plans du site : badge V2 / M-LVL
  juste avant la 1re ouverture (avant : « V1 » jusqu'à l'ouverture).
- **Rangement et hors ligne d'un plan ☁️** (v2.9.0) : `plans.ranger(idExt, dossierExt | null) → Promise<bool>` diffuse le
  rangement fait à l'accueil (refus = le rangement reste local) ; `plans.horsLigne: { etat(idExt) → "garde"|"perime"|"absent",
  garder(idExt) → Promise<bool> }` alimente le bouton de la ligne (💾 garder / ⬇️ nouvelle version / ✅ gardé, sans action).
  Un plan ☁️ ouvert est gardé selon « Mémoriser le plan dans l'app » ; une copie déjà gardée est toujours mise à jour.
- **Publier un plan local** (v2.9.0) : la fiche ℹ️ d'un plan local appelle `publierPlan({ blob, nom })` (archive gardée,
  sinon ZIP choisi), puis propose de remplacer la copie locale : `PlanRegistry.transferAssociatedData(ancien, nouveau)`
  déplace session (planId réécrit), calage, photos, favoris et liaisons (refus si la cible a déjà une session) ; l'id
  registre d'un plan ☁️ vient de `window.ktaIdRegistreExtension(extId)` (seule fabrique). Réponse perdue : l'accueil
  relit `plans.lister()` 3 min et reconnaît un plan NOUVEAU de ce nom.
- **Lire la session d'un plan non ouvert** (10/10/2026) : `window.KtaSessionStore.lire(planId)` → JSON texte | null
  (synchrone, depuis la mémoire ; `ids()` liste les plans qui en ont une, `ecrireDurable(planId, brut)` → Promise). Les
  sessions vivent en IndexedDB : `localStorage["myktamap_session_v1_<planId>"]` n'est plus qu'une ancienne copie gardée
  30 jours après la migration (ou le stockage de repli si IndexedDB est refusé) — une extension qui le lit en direct lit
  une version périmée. Détail : `session-data.md` §9.0.
- **Plusieurs comptes sur un plan** (05/10/2026, audit multi-utilisateur) — sans extension, rien ne change :
  - `appliquerChangements` ne réécrit que les familles touchées (sinon fiche fermée, dessin coupé) ; le tracé /
    la zone / la structure **en cours** est repris par son uid ; l'historique d'annulation **repart de zéro**
    après une réception (⏪ remet une photo complète d'une famille : il effaçait chez tous les ajouts des autres).
  - `recuADistance(uid)` : la fiche d'édition d'un point demande « garder ma version ? » si le point a été
    modifié ou supprimé par la synchro pendant l'édition (avant : modification écrasée sans le savoir).
  - Prise `lectureSeule(idExt) → bool` (droit « lire ») : goulot `window.ktaEditionRefusee()` — ni ✏️ ni 🗑️
    dans la fiche, outils de dessin et suppression au clic refusés (message). Erreur de la prise = lecture seule.
  - Goulot `window.ktaExportPlanRefuse()` (plan affiché seulement) : `exportAutorise` vaut désormais pour
    l'export de session (JSON, ZIP, KMZ, GPX) et l'export image/PDF, plus seulement l'export de profil.
  - Prise `avantReinitialisation() → Promise<bool>` : « Tout réinitialiser » l'attend (3 s max) AVANT d'effacer —
    l'extension y ferme sa session (cookie HttpOnly : la page ne peut pas l'effacer, l'appli se reconnectait
    seule). `false` (hors ligne) → après l'effacement, seule la marque `KtaExtensions.CLE_DECONNEXION_EN_ATTENTE`
    est posée ; l'extension la honore au démarrage (aucune reconnexion seule, session fermée au retour du réseau).
  - Événement `mktm:session-cleared` (`{ planId, restauration? }`) : « Effacer la session » et la restauration
    d'une sauvegarde — l'extension relit alors tout le plan (sinon les objets des autres ne revenaient jamais).
- **Mode Secours** : `mktm:secours-scenario-mutated` (`{ scenarioId, planExternalId, updatedAt }`) à chaque modification
  d'un scénario, `mktm:secours-scenario-deleted` (`{ scenarioId, planExternalId }`) à sa suppression **voulue** (la purge
  FIFO des 10 scénarios d'un plan n'émet rien : limite de stockage local). Entrant : `SecoursMode.importerScenario(paquet,
  { mode: "remplacer", garderExecution: true })` — même identifiant = remplacé, mais l'**intervention en cours ici est
  fusionnée, jamais effacée** : par étape, la modification la plus récente (`majAt`) gagne, sinon la plus grave ; main
  courante et notes libres unies ; rôle et équipe suivie restent ceux de l'appareil ; sans exécution ici, rien n'est créé
  (`check-secours-relais.js`). Sans `garderExecution`, « remplacer » efface l'exécution (import de fichier, annoncé par l'aperçu).
- **Mode Secours relié aux comptes** (étude Secours, étapes 1-3) : `secoursActions(ctx)` → boutons posés dans le
  Mode Secours (en-tête du scénario, carte d'une équipe, vue Live ; `ctx = { scenarioId, vue, equipeId?, role? }`),
  `secoursInfoEquipe(scenarioId, equipeId)` → texte sur la carte d'équipe, `secoursPeutAvancer(scenarioId, equipeId,
  quoi)` (etape / depart / rentree / rappel ; sans prise : oui, prise en erreur : **non**, refus dit par un toast).
  `secoursNbComptesEquipe(scenarioId, equipeId)` → nombre de comptes reliés (sans prise ou en erreur : 0) : l'effectif
  d'une équipe = saisi, sinon le plus grand de « membres nommés » et « comptes reliés » ; saisie plus basse = alerte.
  `afficherAlerteSecours({ id, titre, texte, actions, sonner? })` / `retirerAlerteSecours(id)` : bandeau rouge
  persistant (son + vibration). Sortants : `mktm:secours-etape-changee` / `mktm:secours-suivi-change` ; entrants :
  `SecoursMode.appliquerEtapeDistante` / `appliquerSuiviDistant` (la plus récente gagne, jamais ré-émis) ;
  `SecoursMode.rejoindre(scenarioId, { role, equipeId })`. Présences : `couleur` facultative (#rrggbb).
- **Actions sur la fiche d'un objet** (v2.9.0) : `actionsObjet(uid) → [{ libelle, action }]` (synchrone) ; les fiches
  portent `data-kta-uid`, l'observateur n'est posé que si la prise existe.
- **Photos des points** (10/10/2026) : prise d'information `photos: { completerPoint(planId, pointId) →
  Promise<number>, completerPlan(planId) → Promise<{ ajoutees, total }> }`. L'app appelle `completerPoint` quand
  elle **affiche** les photos d'un point (bulle, fiche d'édition ; `pointId` = uid du point, son nom s'il n'en a pas)
  et `completerPlan` à l'ouverture d'un plan dans 🧰 Outils > 📸 Mes photos ; l'extension dépose ce qui manque par
  `MyKTAMapPhotos.restorePhoto(record)` (fiche comprise) et l'app réaffiche si `> 0`. Côté community :
  `KtaExtensions.photosCompleterPoint` / `photosCompleterPlan`, **8 s max** puis abandon silencieux, erreur ou
  forme inattendue = 0 (journalisée `[Photos]`). Sans extension : rien n'est appelé, aucune attente.
  **Sortant** : événement `mktm:photos-changees` sur `window`, `detail = { planId, photoIds, action, source? }`,
  `action` ∈ `ajout` | `suppression` | `rattachement` | `fiche`, émis APRÈS l'écriture IndexedDB.
  `source: "extension"` = écrit par `restorePhoto` **sans** `opts.source` (le dépôt d'une extension : à ne pas
  renvoyer) ; `source: "import"` = restauration par l'app (session, plan ZIP, profil). 🩸 Les **purges locales**
  n'émettent rien : `deletePhotosForPlan` (plan retiré de l'appareil, déconnexion — `effacerDonneesExtension` —,
  réimport de session, import de profil en remplacement par la modale — plans ☁️ épargnés) et `clearAll`
  (réinitialisation, import de profil hors modale) — une extension qui les propagerait
  effacerait les photos de l'équipe. Supprimer un point ne supprime jamais ses photos (« sans point »,
  `session-data.md` §42). API photos ajoutée pour l'extension : `listerPlan(planId)` (sans blob),
  `rattacher(photoIds, planId, pointId, fiche)`, `restorePhoto(record, opts?)`.
- **Profil de l'utilisateur** (11/10/2026) : les modales d'export / import du profil ne transportent **rien** d'un
  plan ☁️ (registre `type: "ext"`, ou id reconnu par `ktaEstIdRegistreExtension`) — ni entrée, ni session, photos,
  favoris, liaisons, sauvegardes, carnet, archive : le fichier est en clair et un profil importé ne doit pas créer
  de plans fantômes d'une autre organisation. Bilan d'import : « N plans de l'organisation ignorés ». Aucune prise :
  le registre suffit. Un appel **programmatique** de `ProfileExportImport.buildProfile` / `applyProfile` sans
  `exclureExtensions: true` garde le comportement historique (tout part) — détail : `session-data.md` §42.
- **Panneau sur la carte** : prise `panneau: { icone, titre, rendre(conteneur) }` → un bouton à gauche sur la carte
  ouvre une fenêtre dont l'extension remplit le corps (`rendre` rappelé à l'ouverture et par
  `KtaExtensions.rafraichirPanneau()`) — ex. « 👥 Équipe ». Actions neutres pour un tel panneau :
  `KtaPresences.centrer(id)`, `suivre(id | null)`, `masquerTrace(id, bool)` (jamais déclenchées par l'app seule).
  Sans extension : ni bouton ni fenêtre.
- **Badge d'un plan ☁️** : `badgePlan(idExt) → { texte, titre } | null` (8 / 160 car., rendu échappé) sur la ligne du
  plan à l'accueil — ex. l'activité « 👥 2 » / « ✏️ 1 » (qui a ce plan ouvert, qui l'édite). L'extension annonce un
  changement par `mktm:plans-badges-changes` (liste redessinée, sans relecture).
- **Info sur la fiche d'un objet** : `infoObjet(uid) → string` (synchrone, 120 car., rendue en texte) — ex. « Créé par X ·
  modifié par Y ». L'app n'écrit jamais d'auteur elle-même : les objets restent anonymes dans la session et les exports.
- **Compte connecté** (v2.7.4) : la prise `compte()` d'une extension dit qui est connecté ; la carte profil
  de l'accueil affiche son `pseudo` et son `libelle` (rôle) à la place du surnom et du rang, et la modale
  verrouille le pseudo. **Rien n'est écrit dans le profil local** : surnom et photo de l'appareil reviennent
  à la déconnexion. Texte seulement, 40 / 24 caractères max ; erreur ou forme inattendue = `null` (profil
  local). L'extension annonce un changement par `notifierCompte()` (événement `mktm:compte-changed`).
- **Version d'un module** : le SW met en cache un module au premier chargement et le sert ensuite depuis
  ce cache (règle par défaut, à l'URL exacte). Une nouvelle version passe donc par un **nouveau chemin**
  dans `index.json` (`pro/connexion.js?v=0.3.0`) — l'index, lui, est relu sur le réseau d'abord. Sans
  suffixe, la mise à jour n'arriverait qu'au prochain bump de `CACHE_NAME` community.
- **Service Worker** : les modules greffés ne sont **jamais** dans `ASSETS_TO_CACHE`. Ils
  doivent pourtant tourner hors ligne (connexion par clé enregistrée, état DOWN) : leur
  cache est propre au module, versionné à part, pour qu'une release pro n'impose pas de
  bumper `CACHE_NAME` côté community.
- **ConfAdmin** (décision de l'auteur) : l'outil déployeur community propose un bloc
  « Connexion serveur » (état, API, modules), **replié par défaut** et présenté comme réservé
  aux instances qui greffent des modules. Il reste hors `ASSETS_TO_CACHE`.
- **Transparence** : NETWORK_AUDIT ne couvre que myktamap.fr. Une instance connectée publie
  sa propre page d'audit (modèle fourni par le pro) ; le badge y renvoie dès que l'état n'est
  pas OFF.

**Ce que ça garantit, et ce que ça ne garantit pas** : l'état est une **information
d'affichage, jamais une sécurité** — contournable en console comme les flags kiosque. La
CSP non plus ne protège rien ici : `connect-src` filtre des destinations, pas des méthodes
HTTP, et `'self'` laisse passer un `PUT` vers un backend même origine. De même, le filtre
d'export n'empêche pas de copier un plan qu'on a le droit de lire : ses données sont sur
l'appareil (hors ligne oblige), donc lisibles en console. **Lire = pouvoir copier** : le
filtre retire le bouton, pas la possibilité. Sur myktamap.fr, la preuve pour l'utilisateur
est **l'absence physique des fichiers pro**, vérifiable dans l'onglet Réseau de son
navigateur.

**Forme technique** (QCM du 04/10/2026) :
- **API** : un objet unique `window.KtaExtensions`. Un module appelle
  `register({ nom, apiVersion, … })` en ne fournissant que les prises dont il a besoin
  (gate, plans, import, export, déconnexion, secours…). Community appelle ces prises aux
  bons goulots. Un seul point d'entrée à auditer ; `apiVersion` signale une incompatibilité
  au lieu de casser en silence.
- **Échec d'une prise** (erreur ou délai dépassé), selon son type : prise de **permission**
  (gate, import, export) → **refus** avec un message clair ; prise d'**information**
  (journal, secours, état) → erreur ignorée, l'app continue. Toute erreur est journalisée
  `[Extensions]`.
- **Gate en panne** : sur une instance connectée dont le module de connexion ne se charge
  pas, écran « instance indisponible » + Réessayer. **Jamais de repli sur la gate
  community** : le code communautaire, diffusé largement, ouvrirait une instance privée
  (le trou corrigé en v1.90.7).
- **Démarrage** : `index.json` est lu **une seule fois, avant les gates** (ou la config
  mémorisée s'il est injoignable, règle B), puis réutilisé par la gate (`accessHash`), le
  kiosque et la découverte des plans (`js/ktaInstance.js`, délai de 2 s ; la licence n'est attendue avant la
  gate que si `state: "on"`).
- **Identifiants d'objets** : chaque point, tracé, zone et structure reçoit un **id stable
  et un `updatedAt` en millisecondes**, pour tout le monde, myktamap.fr compris, avec une
  migration des anciennes sessions à l'ouverture (`js/ktaUid.js` ; format : [Formats JSON](data-formats.md)).
  Sans ça, ni « le dernier gagne, par objet », ni le journal des changements ne seraient possibles.
- **Cache des modules** : préfixe `myktamap-ext-<module>`, ajouté aux caches que
  l'`activate` du Service Worker conserve (il efface tout cache qui n'est ni `CACHE_NAME`,
  ni `myktamap-plan-`, ni `myktamap-ext-`). Chaque module remplit et versionne le sien.
- **Garde-fou** : `scripts/check-extensions.js` (pré-commit bloquant, sur le modèle de
  `check-kiosque-serveur.js`) vérifie chaque prise appelée au goulot, le no-op sans module,
  le refus quand une prise de permission échoue, l'absence de `pro/` dans
  `ASSETS_TO_CACHE`, et OFF par défaut sans champ.

**État : livré** (v2.0.0 → v2.7.0) — tout ce qui précède est en place dans community :
- **Connecteur** (`js/ktaExtensions.js`) : validation pure `valider(cfg)` → `{ etat, raison }`, recalculée à chaque
  `mktm:license-changed` ; événement `mktm:connexion-changed` ; dernière config connue mémorisée
  (`myktamap_server_connection_v1`, **exclue de l'export de profil** : donnée de l'instance, pas de l'utilisateur).
- **Pastille** collée au badge de version du pied de page de l'accueil, icône + mot court (icône seule sous 380 px ;
  footer replié : icône seule sur le bouton) ; un clic ouvre la fenêtre « Que fait l'app sur le réseau ? » avec
  l'état en tête. Couleurs : OFF `.kta-tx-muted`, INVALIDE `.kta-tx-err`, LICENCE `.kta-tx-warn`,
  CONFIGURÉE `.kta-tx-info`.
- **ConfAdmin** n'écrit le champ que si `state: "on"` (l'absence vaut OFF), avec la même validation que l'app.
- **Lecture unique de l'index** avant les gates (`js/ktaInstance.js`, mémoire `myktamap_instance_config_v1` =
  section `config` seule) ; une config **mémorisée** ne révoque jamais rien (`revaliderInstance(…, false)`).
- **Identifiants stables** (`js/ktaUid.js`) et **points d'extension** : `window.KtaExtensions.register()`, gate
  déléguée, chargeur de modules (règle E), garde des requêtes, permissions import/export, plans d'extension
  (`type: "ext"`, ☁️), publication depuis le Générateur, journal des changements, effacement à la déconnexion
  (plans `ext` seulement), Secours entrant, caches `myktamap-ext-` gardés par le SW.
- **Garde-fous** (pré-commit et CI, bloquants) : `check-connexion-serveur.js` (validation de l'app et de ConfAdmin
  sur une table de cas, table de vérité des états, clé hors export de profil, module précaché),
  `check-gate-instance.js` (ordre config → revalidation → gate), `check-uid.js`, `check-extensions.js`.
- Les **modules greffés et le backend** vivent dans le dépôt pro, jamais ici.

## 4. Ce qui n'entrera JAMAIS ici (périmètre exclu)

- **Fichiers pro** : code serveur (PHP, Node…), modules JS qui parlent à un backend
  (sync, comptes, multi-tenant), docs commerciales, licences nominatives. Ils vivent dans
  `MyKTAMap-pro`. Verrou : `scripts/check-no-pro-leak.js` (pré-commit, bloquant).
- **Télémétrie**, sous aucune forme, y compris via une extension activée sur myktamap.fr.
- **Branding complet (white-label)** : logo, nom d'app, thème de marque, domaine.
  La limite community est UN champ texte : `config.subtitle` (le nom « MyKTAMap »
  et la charte restent). Au-delà → hors de ce repo.
- Gestion de droits, plans payants, quotas.
- Commentaire-pointeur vers un fichier pro précis (`// TODO pro:`, chemin du repo privé) :
  un point d'extension se documente par ce qu'il offre, pas par qui le consomme.

## 5. Invariants d'implémentation

- `confadmin.html` : outil déployeur **statique et local** (rien n'est uploadé),
  à la racine, **jamais dans `ASSETS_TO_CACHE`**, pas de lien depuis l'UI de l'app.
- `data/index.json` : champs inconnus **ignorés** par les vieilles versions
  (rétrocompat totale — un index enrichi est valide partout). Servi **network-first**
  par le SW (fallback cache offline) pour que les changements d'un kiosque se
  propagent sans réinstallation. Format détaillé : `plans-loader.md`.
- Les liaisons kiosque sont **fusionnées** dans le registre local (`importLinks`,
  dédup par id) : l'utilisateur peut en créer d'autres ; une liaison retirée côté
  serveur ne disparaît PAS chez ceux qui l'ont déjà (assumé, documenté SELFHOST.md).
- **Tags de l'index (v1.90.1) — « l'index PROPOSE, l'utilisateur DISPOSE »** : `decouvrirPlansServeur`
  n'écrit `plans[].tags` que si l'entrée du registre ne porte pas `tagsSrc === "user"`.
  🩸 La découverte tourne à CHAQUE boot : une écriture inconditionnelle écraserait les
  tags de l'utilisateur en silence, boot après boot — le ping-pong exact corrigé en
  v1.88.0 sur `version`/`versionSrc`. Symétrique : **vider ses tags est un choix**, la
  trace du refus (`tagsSrc = "user"` sans `tags`) survit, sinon l'index les repropose.
  Le kiosque reste maître de ce qu'il a lui-même posé : retirer les tags de l'index
  retire ceux marqués `tagsSrc === "index"`. Normalisation unique : `PlanRegistry.setTags`
  (trim, 24 car., dédup insensible à la casse, 12 max) — `confadmin.html` applique les
  MÊMES règles, et `check-tags-index.js` compare les deux en les exécutant.
- **Licence pro locale ≠ passe-droit sur instance protégée (v1.90.8)** : quand `accessHash` est publié,
  une licence pro de **source `"local"`** (fichier importé par l'utilisateur, cf. `proLicense.js`) n'ouvre
  plus la gate — sinon elle contournerait le mot de passe. Enforcement : `main.js` refuse le bypass de boot
  si `getSource() === "local"` **et** `UnlockGate.instanceRequiertMotDePasse()`, et la gate retire le bloc
  d'import (`.kta-licence-community`) plus un refus au clic (`_instanceProtegeeGate`). 🩸 v1.90.9 — la source
  `"server"` NE bypasse PLUS non plus : fetchée pour tous les visiteurs, elle rendait l'`accessHash` muet.
  Quand l'instance impose un mot de passe, `main.js` refuse le bypass **quelle que soit la source** ; la
  licence n'accorde que le mode pro, après la gate. Seule une instance SANS `accessHash` laisse la licence
  serveur bypasser (pas de gate à contourner).
- **Le verrou kiosque est AU GOULOT, pas sur un bouton (v1.90.1)** : `window.ktaKiosqueServeurSeul()`
  est le point unique de décision ; `ouvrirImportModale` refuse avant même de lire le
  fichier. 🩸 Deux trous réels : l'import de PROFIL restaurait les archives ZIP (la
  restriction se contournait par la porte d'à côté), et un profil transporte
  `myktamap_loader_show_server_plans` — importé à `false` sur un kiosque, il masquait les
  plans serveur **dont la case de réglage est justement cachée par le mode** : accueil
  vide, aucun moyen d'en sortir. La branche kiosque remet donc `show_server_plans` à true
  et `skip_server_plans_v1` à false, **et l'index est chargé AVANT que la pref de skip ne
  soit lue** (sinon le remède n'agissait qu'au démarrage suivant). ⚠️ Cela reste du
  déclutter, pas de la sécurité : contournable en console, et c'est assumé.
- **Toute nouvelle porte d'entrée de plans doit être recensée ici (v1.94.0)** : l'import
  multiple (`js/importMasse.js`) vit dans la section 🧰 Outils du HOME, donc **hors de
  `#panelZip`** que la branche kiosque masque. Signalé par KARMA : « si en mode serveur on
  a coupé l'import de plan, il ne doit pas être affiché (comme Ajouter un plan) ». Sans
  traitement, un kiosque « plans serveur uniquement » masquait l'ajout d'UN plan mais
  laissait entrer N plans d'un coup. Corrigé aux deux niveaux — bouton masqué dans
  `_appliquerConfigKiosque`, et `ouvrir()` **et** `importer()` interrogent
  `ktaKiosqueServeurSeul()` (le chemin qui ÉCRIT est gardé séparément de celui qui
  affiche : un appel programmatique n'entre pas plus qu'un clic). 📌 Leçon générale : le
  masquage de `#panelZip` ne couvre QUE la zone de dépôt et « Charger
  ce plan » — un bouton posé ailleurs y échappe silencieusement. Vérifié par
  `scripts/check-kiosque-serveur.js`.
- **ConfAdmin sait REPRENDRE un `index.json` existant (v1.90.1)** : sans ça, éditer une
  étiquette sur un parc déjà en ligne obligeait à redéposer tous les ZIP et à retaper
  chaque nom. Les liaisons d'un index repris sont **reposées telles quelles** tant
  qu'aucune liaison locale n'est sélectionnée — sur une machine sans registre, un index
  rechargé pour corriger un tag serait redescendu SANS ses liaisons.
- **Mot de passe d'instance (v1.90.6, EXCLUSIF depuis v1.90.7)** :
  `config.accessHash` (SHA-256, validé `/^[0-9a-f]{64}$/` avant tout usage), **quand il est publié, est le
  SEUL qui ouvre** — le `HASH_VALIDE` communautaire ne vaut plus que sur une app sans `accessHash`.
  🩸 La v1.90.6 acceptait les DEUX (either/or) : trou signalé par KARMA, le code communautaire étant
  distribué largement, il aurait ouvert n'importe quelle instance privée. Enforcement en DEUX points —
  refus au submit (`okCommunaute = !hashInstance && …`), et révocation au boot (`revaliderInstance` retire
  un accès communautaire hérité dès que l'instance publie un hash). 🔒 **Le niveau de sécurité ne change pas** : le hash est dans un fichier
  **public**, brute-forçable hors ligne — exactement comme le hash communautaire, lisible sur GitHub.
  Barrière sociale, jamais une authentification, et le dire fait partie du contrat.
  - 🩸 **`isUnlocked()` ne peut PAS se contenter de comparer le stocké au hash publié** : sur un navigateur
    vierge les deux valent `null`, et l'app s'ouvrirait pour tout le monde. Le hash d'instance accepté est
    donc mémorisé dans `myktamap_unlock_instance_v1`, et la comparaison exige les deux valeurs non vides
    **et** la forme valide.
  - 🩸 **Cette mémoire est ce qui rend l'accès utilisable HORS LIGNE** : sans elle, un visiteur entré par le
    mot de passe de l'instance serait reverrouillé au premier démarrage sans réseau — soit précisément là où
    l'app sert le plus.
  - 🩸 **`revaliderInstance(hash, indexRepondu)` prend un second paramètre EXPRÈS.** `null` veut dire deux
    choses incompatibles — « le déployeur a retiré le mot de passe » (reverrouiller) et « l'index est
    injoignable » (ne rien toucher). La fonction ne peut pas les deviner : l'appelant le déclare. La
    première version reposait sur la discipline d'un site d'appel distant de 1800 lignes, et un futur appel
    de bonne foi aurait reverrouillé l'app à la première coupure réseau.
  - ⏱️ **La rotation prend effet dès le démarrage** (v2.6.0) : l'index est lu une fois AVANT les gates
    (`js/ktaInstance.js`), et `revaliderInstance` passe avant la gate — au lancement, jamais en pleine
    session (couper quelqu'un au milieu de son relevé serait pire que tout). 🩸 Une config **rejouée de
    mémoire** (index injoignable, délai de 2 s dépassé) n'appelle pas la revalidation avec `true` : elle ne
    révoque jamais rien.
  - ⚡ **Une seule lecture de l'index par démarrage** (v2.6.0), partagée par la gate, le kiosque, le
    connecteur et la découverte des plans ; la gate ne relit plus l'index à chaque tentative. Hors ligne,
    elle trouve le mot de passe d'instance dans la dernière config connue — une instance protégée n'est
    plus ouverte par le code communautaire faute d'index.
  - ⚙️ `confadmin.html` calcule le hash localement et n'écrit **jamais** le mot de passe ; à la reprise d'un
    index existant le champ reste **vide** (un hash ne remonte pas en mot de passe) et le hash repris est
    conservé tant qu'on ne tape rien. `crypto.subtle` exigeant un contexte sûr, une ouverture en `file://`
    ou en HTTP simple est **signalée** au lieu de produire un index sans hash en silence.
- Guide déployeur : `docs/applications/SELFHOST.md`. Licence CC BY-NC-SA 4.0 :
  un kiosque commercial nécessite un accord de l'auteur.
