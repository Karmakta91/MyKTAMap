# 🔒 MyKTAMap — Audit réseau & Confidentialité

> Page de transparence technique. À jour pour la version **v2.19.0** (21 octobre 2026). Les notes par version sont dans une page à part : [Historique des versions](NETWORK_AUDIT_HISTORIQUE.md).
>
> Ce document explique **exactement** ce que l'application fait sur le réseau,
> **comment vérifier toi-même** que rien ne fuit, et **comment couper le seul
> site extérieur qu'elle contacte** (OpenStreetMap, pour la Vue OSM).

---

## 🎯 La promesse en une ligne

<!-- kta:classe kta-promesse -->
**MyKTAMap est une application 100 % client-side. Aucune de tes annotations,
sessions, plans ou données personnelles n'est jamais envoyée à un serveur,
ni à un service tiers. Point final.**

C'est vérifiable **par toi-même** sans avoir à nous croire sur parole — la
suite du document t'explique comment.

---

## 🛡️ Périmètre de cette garantie : `myktamap.fr`

<!-- kta:classe kta-alerte -->
> **⚠️ Cette garantie de sécurité et de non-télémétrie s'applique
> UNIQUEMENT au domaine officiel `myktamap.fr`**.

Le code source de MyKTAMap est **public** sous licence CC BY-NC-SA 4.0. Il
peut donc être **copié, forké, miroir ou redéployé** par n'importe qui dans
le monde. Toute installation tierce — peu importe qu'elle se présente sous
un autre nom, un autre domaine, ou même qu'elle clame être « MyKTAMap » —
peut contenir des **modifications dont nous ne sommes pas responsables** :

- du code de tracking ajouté (analytics, fingerprinting)
- de l'exfiltration discrète de données vers un serveur tiers
- du code malveillant injecté (vol de données, redirection, etc.)
- des modifications subtiles de la liste blanche réseau

Nous n'avons **aucun moyen** de vérifier ce qui se passe sur ces
installations parallèles. Aucune mesure technique ne peut empêcher
quelqu'un de prendre notre code et de le modifier.

### Comment t'assurer que tu es sur le vrai site ?

1. Vérifie l'URL dans la **barre d'adresse** de ton navigateur
2. Elle doit commencer par `https://myktamap.fr`
3. Vérifie que le cadenas 🔒 est présent (HTTPS valide, certificat émis par Let's Encrypt)
4. Si l'URL ne correspond pas, **tout ce qui est écrit dans cette page ne te concerne pas** — c'est une copie tierce sur laquelle nous n'avons aucun contrôle

> *NB : pour les utilisateurs qui veulent self-héberger MyKTAMap (cas
> légitime — c'est tout l'intérêt d'un code open source), c'est parfaitement
> autorisé sous la licence CC BY-NC-SA. Mais dans ce cas, **c'est toi qui es
> responsable** de garantir l'intégrité de ta propre installation à tes
> utilisateurs.*

---

## 🏛️ Le modèle technique (en bref)

MyKTAMap est une **Progressive Web App (PWA)** servie comme un site web
statique. Concrètement :

| Composant | Rôle | Stockage |
|---|---|---|
| **Ton navigateur** | Exécute tout le code de l'app, gère l'interface, fait les calculs (pathfinder, export PNG, KMZ…) | localStorage + IndexedDB (uniquement local) |
| **Notre serveur Nginx** | Sert les fichiers statiques de l'app (HTML, JS, CSS, images, plans serveur de démo) | Aucune base de données, aucune session utilisateur |

**Pas de backend applicatif.** Pas de base de données serveur. Pas de
compte utilisateur. Pas de session côté serveur. Pas de cookies de tracking.
Pas d'analytics tiers (Google Analytics, Matomo, etc.). Pas de CDN tiers.

Tout ce que tu crées dans l'app (points, tracés, zones, sessions, plans
mémorisés, calibrations KMZ, préférences) **reste dans ton navigateur**,
dans des espaces de stockage isolés à ton appareil (localStorage et
IndexedDB).

---

## 📡 La liste blanche complète des connexions réseau

Voici la liste **exhaustive et nominative** de toutes les URLs que l'app
peut contacter, avec leur fréquence, leur méthode HTTP, et **ce qui est
envoyé** (réponse : rien, jamais).

| Endpoint | Méthode | Quand | Pourquoi | Données envoyées |
|---|---|---|---|---|
| `<origin>/*` (HTML, JS, CSS, images, JSON) | `GET` | Au boot + cache PWA ; fichiers manquants retéléchargés par la réparation automatique (~5 s après l'accueil) ou d'un appui sur la pastille hors-ligne rouge | Charger l'app | **Aucune** |
| `<origin>/version.json` | `GET` | Au boot, puis check périodique | Détecter une nouvelle version dispo | **Aucune** |
| `<origin>/alert.json` | `GET` | Au boot | Diffusion d'alertes publiques (incendie, fermeture site, etc.) | **Aucune** |
| `<origin>/denylist.json` | `GET` (cache:no-store SW) | Au boot + 1×/24h (cache LS local) | Kill-switch anti-fuite : récupérer la liste publique des empreintes SHA-256 de plans révoqués par l'auteur | **Aucune** (lecture seule d'une liste publique côté serveur ; les empreintes des plans owned ne sont JAMAIS envoyées, comparaison 100% client-side via `crypto.subtle.digest`) |
| `<origin>/data/<plan>/*` | `GET` | Charge d'un plan serveur | Lecture des fichiers d'un plan (image + JSON) | **Aucune** |
| `<origin>/<chemin>.zip` (déclaré par `data/index.json`, chemin relatif seulement) | `GET` (conditionnel) · `HEAD` | Ouverture d'un plan déclaré par son ZIP ; `HEAD` à l'affichage de l'accueil si une copie est gardée (1 par plan / 30 s) | Télécharger l'archive du plan, ou savoir si la copie gardée est à jour (304) | **Aucune** (same-origin ; seuls `If-None-Match` / `If-Modified-Since` partent, valeurs reçues du serveur ; jamais mis en cache par le SW — la copie vit en IndexedDB) |
| `<origin>/docs/applications/README_USER.md`, `<origin>/docs/applications/AI_CONTEXT.md`, `<origin>/docs/applications/NETWORK_AUDIT*` | `GET` | Ouverture des modales Documentation / Aide IA / Audit | Affichage du contenu | **Aucune** |
| `<origin>/lang/fr.json`, `<origin>/lang/en.json`, `<origin>/lang/es.json` | `GET` | Au boot (`I18n.init` : fr = fallback + langue active) puis au changement de langue | Charger les dicos de traduction multi-langue (français, anglais, espagnol) | **Aucune** (fichiers statiques same-origin, **network-first** + **cache-buster `?v=<build>`** — l'URL porte la version de build pour un dico frais après mise à jour ; fallback cache précaché si offline ; lecture seule) |
| `<origin>/ping.html` | `GET` (same-origin, body lu) | Avant un reset complet, avant un Force update, avant ouverture Vue OSM | Tester Internet + santé serveur MyKTAMap (DNS / SSL / Nginx, body attendu `"OK"`) | **Aucune** (GET sans paramètres, pas de cookies via `credentials: "omit"`, same-origin) |
| `https://tile.openstreetmap.org/{z}/{x}/{y}.png` | `GET` | Quand la **Vue OSM** s'affiche pour un plan calibré GPS — widget de l'accueil (dès son chargement, sans clic) ou modale du mode carte. **Active par défaut**, désactivable dans ⚙️ Configuration | Afficher les tuiles d'OpenStreetMap en fond du plan calibré GPS | **Aucune** (cookies omis, juste les coordonnées géographiques `{z}/{x}/{y}` de la tuile, anonymisé par CDN OSM) |
| `blob:<origin>/<uuid>` | `GET` | Chargement des tuiles V2 d'un plan tuilé | Déréférencer une tuile JPEG depuis le ZIP **déjà en mémoire** dans le navigateur | **Aucune** (blob URL = référence locale au navigateur, ne sort pas) |
| `data:<mime>;base64,...` | `GET` | Icônes SVG inline, certains exports | Déréférencer une donnée encodée en base64 **dans le code de l'app** | **Aucune** (data URL = pas de fetch réseau réel) |

`<origin>` = le domaine sur lequel l'app est servie. Pour la prod c'est
`myktamap.fr`. Sur ton réseau local en développement : `localhost` ou IP locale.

**Sur `myktamap.fr`, aucun `POST`, `PUT`, `PATCH`, `DELETE`, `sendBeacon`,
`WebSocket`, `EventSource` ou n'importe quelle autre méthode d'envoi de
données vers un serveur n'est jamais émise par l'app — et ce domaine n'aura
jamais de serveur applicatif.** Une installation
indépendante (hors de ce domaine) peut déclarer une **connexion serveur**
dans sa configuration ; l'app affiche alors son état dans le pied de page de
l'accueil (pastille 🔌), et rien n'est activé sans une licence posée par
cette installation. Sur `myktamap.fr`, la pastille affiche « Base de
données : désactivée ». Si un jour ce qui précède change, ce fichier sera mis à jour en
conséquence et la version sera bumpée.

### À propos du ping `<origin>/ping.html`

Pour savoir si Internet répond, l'app n'interroge **aucun service tiers**
(ni Google, ni autre) : elle utilise **uniquement** un fichier `/ping.html`
servi sur **le même domaine que l'app** (same-origin) :

- Prod : `https://myktamap.fr/ping.html`

L'URL est résolue dynamiquement via `location.origin + "/ping.html"`.
Le body attendu est exactement `"OK"`.

> 🔎 **Contrôle du 13/09/2026 — aucune URL de service n'est codée en dur.** Tous les
> appels de l'app (`version.json`, `alert.json`, `denylist.json`, `data/index.json`,
> `lang/*.json`, `ping.html`, licence pro) sont **relatifs à l'origine qui sert l'app** ;
> la seule cible externe écrite en dur est `tile.openstreetmap.org` (Vue OSM). C'est
> voulu : une copie de l'app servie ailleurs (self-host, kiosque, ou copie tierce) appelle
> **sa propre** origine et jamais `myktamap.fr` — elle ne reçoit donc ni nos alertes, ni
> notre liste de révocation, ni nos mises à jour, et nous ne recevons rien d'elle. C'est
> aussi pourquoi la garantie ci-dessus ne vaut que pour le domaine officiel : elle porte
> sur le **code servi**, que seule la barre d'adresse permet de vérifier.

**Pourquoi ce choix ?** Aucun appel externe vers un service
tiers, même bénin comme Google. Le ping same-origin permet en outre de
vérifier **en un seul appel** :

- Connexion Internet active (DNS résout, route IP atteignable)
- Certificat SSL du domaine valide
- Serveur Nginx en ligne et répond correctement
- La PWA peut tenter le pull SW (skipWaiting + cache purge)

L'app l'appelle en mode same-origin (default) avec `credentials: "omit"` :
**aucun cookie n'est envoyé**, et seul le body `"OK"` (texte brut) est
lu pour vérification. Si le serveur répond autre chose (404, 500, body
différent), le ping est traité comme "indispo" et l'app refuse de
tenter la mise à jour douce.

Ce ping vise **le serveur de l'app lui-même** (même origine) : il ne
contacte aucun tiers et n'envoie rien. Il n'a lieu que sur ton action
(reset, Force update, ouverture de la Vue OSM).

### À propos des tuiles OSM `tile.openstreetmap.org`

En dehors de son propre serveur, l'app ne contacte qu'un seul domaine :
`tile.openstreetmap.org`, pour afficher la carte OSM, **uniquement
sous 3 conditions strictes simultanément réunies** :

1. **Le plan a un georef GPS** (saisi via générateur avancé OU via Réglages
   map mode → Géoréférencement). Sans georef, le bouton 🗺️ Vue OSM est
   masqué côté UI et l'appel n'a aucun moyen de se déclencher.
2. **L'utilisateur n'a pas désactivé la Vue OSM** dans ⚙️ Configuration
   home. **Active par défaut** (un bandeau le signale au premier usage),
   persisté en `localStorage` sous la clé `myktamap_osm_view_opt_in` :
   un refus (« 0 ») est mémorisé et n'est jamais réécrasé.
3. **L'utilisateur charge effectivement la Vue OSM**. Deux contextes
   possibles :
   - **Modale Vue OSM full-screen** (mode carte) : clic sur le bouton 🗺️
     dans la status bar quand un plan est chargé. Couvre les tuiles plan
     V2 projetées + POI + Tracker + Roads + Iti + Zones + Structures.
   - **Widget mini-preview HOME** (page d'accueil) : si l'opt-in est ON,
     la colonne 🌍 Vue OSM apparaît entre Mes plans et Ajouter, avec un
     plan georef sélectionné par défaut (= lastOpened). Sinon la colonne
     est **masquée entièrement** — aucune tuile OSM n'est requêtée même
     visuellement.

**Garanties supplémentaires** :
- La modale et le widget sont aussi bloqués en **Mode incognito**.
- Modale et widget : masqués si `navigator.onLine === false` (hors-ligne
  détecté par le navigateur).
- Un ping `/ping.html` est effectué juste avant l'ouverture de la modale
  Vue OSM : si Internet ne répond pas, la modale est annulée AVANT le
  premier appel à OSM.
- Les requêtes vers OSM sont faites en mode `cors` standard avec
  `crossOrigin: true` côté Leaflet (cookies omis par défaut). **Aucune
  donnée utilisateur n'est envoyée** : juste les coordonnées géographiques
  `{z}/{x}/{y}` de la tuile, c'est-à-dire un quadrillage Web Mercator
  standard partagé par tous les utilisateurs OSM.
- **Cache PWA** : de base, les tuiles OSM ne sont **PAS** mises en cache par
  le Service Worker — elles ne survivent pas au plan switch ni au refresh.
  Seule exception : le cache offline OSM **opt-in user** (bouton « 💾 Cacher
  pour offline »). Détails complets dans la sous-section dédiée plus bas
  (« Cache offline OSM / « Save Offline » »).
- **Widget HOME** : extraction du ZIP du plan
  sélectionné se fait **localement** dans le browser via JSZip (lecture
  IDB blob ou FS handle). Aucune donnée plan n'est envoyée à OSM ou à
  un tiers — uniquement les tuiles `{z}/{x}/{y}` sont demandées au CDN
  OSM, identiques à celles affichées par tout client OSM standard.
- **Bouton « 📍 Ma position »** : disponible dans la
  modale Vue OSM ET dans le widget HOME Vue OSM. **Fix GPS ponctuel à la
  demande user** via `navigator.geolocation.getCurrentPosition()` — pas de
  watch continu (`watchPosition`), pas d'usage batterie en continu. La
  permission OS est demandée à la demande user (pas au boot), les
  coordonnées sont affichées sur la carte (marker bleu cyan + cercle
  d'incertitude) **uniquement en RAM**, ne sont **jamais** stockées en
  localStorage / IndexedDB / cookie, ne sont **jamais** envoyées sur le
  réseau (aucun fetch, aucun beacon). Au close de la modale / refresh
  du widget, le marker est supprimé. Re-clic = nouveau fix, l'ancien est
  remplacé.
- **Garde-fou « GPS hors champ du plan »** : après un fix GPS
  reçu, si la position est **très loin** de la bbox du plan georef sélectionné
  (>50% au-delà des bords), le marker n'est **pas affiché** + toast warn avec
  la distance approximative au centre du plan. Garantit qu'un user à Paris ne
  voit pas son fix s'afficher sur un plan situé à Lyon par erreur.
  Marge ×1.5 (= `bounds.pad(0.5)`) choisie permissive pour ne pas rejeter les
  fix légitimes en bordure de plan. Si la bbox plan n'est pas calculable (dims
  manquantes, georef absente), fallback safe : on autorise l'affichage du fix.
- **Header serveur requis** : pour que le bouton 📍 fonctionne,
  le header `Permissions-Policy` côté Nginx doit autoriser `geolocation=(self)`.
  Si le header est réglé à `geolocation=()`, l'API rejette
  l'appel **avant même le prompt OS** avec une violation policy (`crbug.com/414348233`).
  La config Nginx versionnée (`docs/nginx-csp-config.conf` et `docker/nginx-docker.conf`)
  autorise `geolocation=(self)`. Restriction `(self)` choisie volontairement : seule notre origine
  peut utiliser l'API, JAMAIS un iframe tiers (même si l'app n'en charge aucun).
- **Mode incognito** : la Vue OSM (modale ET widget HOME) est coupée —
  modale `osmView.js` bloquée à l'ouverture (toast warn), widget HOME
  remplacé par le message "🕶️ Mode incognito actif" au lieu de la
  mini-carte.
  - **Bouton « 📍 Ma position »** : si l'user passe en incognito PENDANT
    que la modale est ouverte (edge case toggle pendant
    session), le bouton est désactivé visuellement (au build initial) ET
    le clic est neutralisé runtime (toast warn + early return, jamais de
    fix GPS). Note : `navigator.onLine === false` (Wi-Fi/4G coupé)
    n'empêche **pas** le GPS — c'est l'intérêt principal (téléphone en
    avion mais GPS du device parfaitement fonctionnel).

### Cache offline OSM / « Save Offline »

Tu peux **mémoriser les tuiles
OSM affichées** pour les consulter hors-ligne plus tard. C'est une feature
**100% locale, opt-in user explicite**, qui ne change **aucune** garantie
réseau ni privacy de l'app.

Le journal des correctifs de cette fonction (aucun n'a ajouté de surface réseau) est
dans l'[historique des versions](NETWORK_AUDIT_HISTORIQUE.md).

**Mécanisme** :

- Module client `js/osmTilesCache.js` qui expose l'API
  `window.OsmTilesCache` (`init` / `cacheVisibleTiles` / `getCachedTile` /
  `getStats` / `hasCacheForBbox` / `clear`).
- Store **IndexedDB** `myktamap_osm_tiles` (object store `tiles`,
  schéma `{key: "z/x/y", blob, addedAt}`). Stocke les PNG de tuiles OSM en
  blob, indexés par leur coordonnée Web Mercator standard `{z}/{x}/{y}`
  (clé identique à l'URL CDN OSM, donc aucune donnée perso ne transite par
  la clé). **Pur stockage local navigateur, jamais transmis nulle part.**
- Le **Service Worker** `sw.js` intercepte les `fetch` sortants matchant
  le pattern `tile.openstreetmap.org/{z}/{x}/{y}.png` : si la tuile est
  présente en IDB, il retourne le blob directement (avec un header de
  debug local `X-OSM-Cache: hit`) **sans toucher au réseau**. Sinon, il
  laisse passer le `fetch` réseau normal (comportement habituel de la
  Vue OSM). **Aucune nouvelle URL n'est contactée par cette feature** —
  c'est strictement un mécanisme de short-circuit local d'un fetch
  existant déjà documenté dans la whitelist (`tile.openstreetmap.org`).

**Déclenchement utilisateur** : le bouton « 💾 Cacher pour offline »
apparaît dans **3 contextes** (tous opt-in user, tous soumis à la case
🗺️ Vue OSM) :

1. **Modale Vue OSM** (`osmView.js`) — clic sur le bouton dans la modale
   full-screen.
2. **Widget OSM accueil** (`osmHomePreview.js`) — clic depuis la
   mini-preview HOME.
3. **Mode Secours** — accessible indirectement via les boutons 🌍 Vue OSM
   du Mode Secours qui rouvrent la modale Vue OSM standard (pas de chemin
   indépendant).

Le cache est **GLOBAL** (partagé entre les 3 contextes) : si l'user a déjà
caché une tuile depuis le widget HOME, elle est instantanément réutilisée
dans la modale Vue OSM et inversement (même clé `z/x/y`, pas de
duplication).

**Cap conformité OSM** : `MAX_TILES_PER_CACHE = 200 tuiles par opération`.
Conforme à la politique d'usage du CDN officiel
(`https://operations.osmfoundation.org/policies/tiles/`) — pas de
téléchargement massif en masse, pas d'épuisement des quotas tiers, pas de
scraping. L'user qui veut cacher une zone plus grande doit déplacer la
carte et relancer l'opération (paliers de 200).

**Mode dégradé hors-ligne** : si l'utilisateur lance la Vue OSM **alors
qu'il n'a pas Internet** mais qu'**un cache est déjà présent pour la bbox
du plan**, la modale s'ouvre quand même (mode dégradé visuel avec tuiles
cachées). La détection est faite par `_isOnlineOrCached()`. **Aucun appel
réseau n'est tenté dans ce cas** — c'est lecture IDB pure. Si aucune tuile
n'est cachée pour la bbox, la modale reste bloquée (toast warn).

**Privacy — garanties** :

- **Aucune donnée n'est envoyée** par cette feature. Les fetch vers
  `tile.openstreetmap.org` qui se déclenchent lors de l'action « 💾 Cacher
  pour offline » sont des `GET` HTTPS **standards**, strictement
  identiques à une consultation OSM normale (= ceux déjà autorisés par la
  whitelist `tile.openstreetmap.org` documentée plus haut).
- **Aucun header custom** révélant l'usage offline n'est envoyé au CDN
  OSM. Le header `X-OSM-Cache: hit` est ajouté **uniquement par le Service
  Worker dans la réponse fournie au code applicatif** (debug local), il
  n'est jamais émis dans une requête sortante.
- **Pas de tracking, pas de télémétrie** : ni vers le serveur MyKTAMap
  (qui n'a pas de backend applicatif), ni vers OSM (au-delà du `GET` brut
  d'une tuile, identique à ce que fait n'importe quel client OSM).
- **Le store `myktamap_osm_tiles` est strictement local** : inspectable
  via F12 → Application → IndexedDB → `myktamap_osm_tiles` → store
  `tiles`. Effaçable manuellement, ou via le bouton « 💥 Tout
  réinitialiser » de ⚙️ Configuration, ou via le `OsmTilesCache.clear()`
  exposé en console.
- **Respect des réglages vie privée** : le bouton « 💾 Cacher pour offline »
  vit dans la carte Vue OSM — case 🗺️ Vue OSM décochée ou Mode incognito
  actif, la carte ne s'ouvre pas, donc aucun préchargement n'est possible
  (gates `osmView.js` / `osmHomePreview.js`).

**Verdict réseau** : ✅ cette fonction n'ajoute aucune URL à la liste
blanche, n'envoie aucune catégorie de donnée et ne contacte aucun autre
service tiers. Elle ne passe que par `tile.openstreetmap.org`, déjà listé
plus haut ; la whitelist endpoints reste la même (`tile.openstreetmap.org`,
`denylist.json`, `ping.html`, `version.json` + assets app). Ce qu'elle
ajoute, c'est un store IDB local (cf. section « Stockage local »). La
feature « Save Offline » n'ajoute **aucune** surface réseau sortante.

**Politique de privacy OSM** : OpenStreetMap est une fondation
non-commerciale (OpenStreetMap Foundation), les tuiles sont distribuées
sous licence ODbL. Leur politique de logs CDN est publiée publiquement
(`https://wiki.osmfoundation.org/wiki/Privacy_Policy`). Pas de tracking
publicitaire, pas de monétisation, juste un référant HTTP standard et
l'IP de la requête (comme toute requête web).

Si tu préfères ne contacter aucun service tiers, **décoche la case 🗺️ Vue OSM** (elle est activée par
défaut) : l'app ne contacte alors plus que son propre serveur (cf. « Couper le seul site extérieur »).

---

## 🔍 Comment vérifier toi-même (3 méthodes)

### Méthode 1 — Le journal réseau intégré (le plus simple)

L'app logue **en temps réel** toutes ses requêtes réseau dans un
journal interne. Tu peux le consulter à tout moment :

1. **Page d'accueil → ⚙️ Configuration** (header)
2. Section **🔒 Confidentialité & Audit**
3. Bouton **📋 Voir le journal réseau**

Tu y verras chaque requête avec :
- L'heure exacte
- La méthode (GET, POST, etc.)
- L'URL complète
- La catégorie (`app-script`, `plan-data`, `ping`, etc.)
- Si la requête envoyait des données (`hasBody: true/false`)
- Le statut HTTP de la réponse

⚠️ Le journal voit les appels faits par le code de l'app (`fetch`,
`XMLHttpRequest`, `sendBeacon`, `WebSocket`, `EventSource`). Les **tuiles
de la Vue OSM** sont des images posées par la carte : elles n'y figurent
pas. Pour les voir — et vérifier qu'elles ne partent que vers
`tile.openstreetmap.org` — utilise la Méthode 2 (F12).

Tu peux **copier** le journal au format texte ou **exporter en JSON**
(bouton 📥) pour le partager / l'archiver / le faire auditer par un tiers.

### Méthode 2 — Les outils de développement du navigateur

Tu n'es pas obligé de nous faire confiance sur notre propre journal. Tu
peux utiliser l'inspecteur natif de ton navigateur, qui voit **toutes**
les requêtes réseau quel que soit ce que l'app fait :

**Sur PC** :
1. Appuie sur `F12` (ou `Cmd+Opt+I` sur Mac)
2. Onglet **Network** (ou **Réseau**)
3. Recharge la page (`F5`)
4. Utilise l'app normalement — chaque requête s'affiche dans la liste
5. Filtre par méthode pour vérifier qu'il n'y a **aucun POST/PUT/PATCH/DELETE**

**Sur mobile** :
1. Branche ton téléphone à un PC via USB
2. **Android** : Chrome PC → `chrome://inspect` → sélectionne l'onglet de
   ton mobile → DevTools normal
3. **iPhone** : Safari Mac → Préférences → Avancé → cocher « Afficher menu
   Développement » → Mac Safari → menu Développement → ton iPhone

### Méthode 3 — Lire le code source

L'app est servie en code clair (HTML/JS/CSS minifiés ou non selon
l'environnement). Tu peux :

- **F12 → onglet Sources** : naviguer dans tous les fichiers JS de l'app
- **Chercher** les chaînes `fetch(`, `XMLHttpRequest`, `sendBeacon`, etc.
- Vérifier que tous les appels ciblent des URLs locales (`/...`, `./...`)
  ou la whitelist documentée ci-dessus

Le module dédié `js/networkAudit.js` (~350 lignes, commenté) instrumente
toutes les API réseau et est le code source qui alimente le journal de la
Méthode 1. Tu peux le lire en intégralité pour comprendre la mécanique.

---

## 🗺️ Couper le seul site extérieur : la case Vue OSM

L'app n'envoie **aucune** de tes données. Toutes ses requêtes vont vers
**son propre serveur** — sauf une : le **fond de carte OpenStreetMap** de la
Vue OSM (`tile.openstreetmap.org`). C'est le seul tiers que l'app contacte. La case est **activée PAR DÉFAUT** :
sans geste de ta part, l'accueil affiche ce fond (et contacte donc `tile.openstreetmap.org`) dès qu'un plan calé sur la
carte est présent. Une case suffit à le couper :

1. **Page d'accueil → ⚙️ Configuration**
2. Section **🔒 Confidentialité & Audit**
3. Décoche **🗺️ Vue OSM (OpenStreetMap)**

Décochée, la case coupe tout ce qui touche OpenStreetMap : ni le widget de
l'accueil ni la modale Vue OSM ne chargent de tuile, et le préchargement
« 💾 Save Offline » n'est plus accessible. Ton refus est mémorisé et
**aucune mise à jour ne revient dessus**. Le **mode incognito** coupe lui
aussi la Vue OSM.

Pour le vérifier : **📋 Voir le journal réseau** (requêtes de l'app) et
**F12 → Réseau** (tout, y compris les images de carte) — tu ne dois plus
voir que ton domaine.

### Pourquoi il n'y a plus de « mode hors-ligne strict »

L'app proposait une case **🔒 Mode hors-ligne strict**, censée bloquer
toute requête vers un autre site. Elle a été **retirée**, parce qu'elle ne
tenait pas sa promesse : en pratique, elle ne bloquait que le
**préchargement des tuiles OSM** (« 💾 Save Offline »). Ses autres blocages
annoncés — Vue OSM, widget de l'accueil, Mode Secours, réparation
automatique du cache — **ne fonctionnaient pas**, et l'affichage des tuiles
OSM, fait par des images, lui échappait de toute façon. Comme tout le reste
du trafic de l'app va vers son propre serveur, la case 🗺️ Vue OSM fait déjà
ce travail — et elle, fonctionne. Mieux vaut une case qui coupe vraiment
qu'un mode qui rassure à tort.

### Et le mode `Avion` de ton OS ?

Le mode Avion coupe tout le réseau de l'appareil. L'app continue de
fonctionner (plans mémorisés, annotations, tracker, itinéraire, exports) ;
seuls la Vue OSM (sans tuiles en cache), la détection de mise à jour et le
chargement de plans serveur non mémorisés attendent le retour du réseau.

---

## 🔐 La Content Security Policy (CSP)

En plus du module d'audit côté JS, le serveur Nginx envoie un en-tête HTTP
`Content-Security-Policy` qui **demande à ton navigateur** de bloquer toute
tentative d'envoi de données vers un domaine non autorisé.

C'est une **double protection** : même si un attaquant injectait du code
malveillant dans une dépendance, ton navigateur lui-même refuserait
l'envoi.

Tu peux vérifier la CSP appliquée :
1. `F12` → onglet **Network**
2. Recharge la page
3. Clic sur la première requête (le HTML de la page)
4. Onglet **Headers** → cherche `Content-Security-Policy`

La directive clé est `connect-src 'self' blob: https://tile.openstreetmap.org https://*.tile.openstreetmap.org` — le
navigateur n'acceptera pas d'envoyer des données ailleurs (OpenStreetMap ne sert que les images du fond de la
Vue OSM, rien ne lui est envoyé).

**Deuxième directive : quel code a le droit de tourner (`script-src`).** L'application ne
contient aucun code écrit directement dans ses pages (`onclick="…"`, blocs `<script>`, liens `javascript:`) :
tout son code vient de ses propres fichiers `.js`, et un contrôle automatique empêche d'en réintroduire. Le serveur
peut donc demander au navigateur de **n'exécuter que les fichiers du site** (`script-src 'self'`) : un texte piégé
qui passerait un jour entre les mailles de l'affichage (un nom de point, une note venue d'un autre compte) ne
pourrait plus rien exécuter.

- **La règle en vigueur est stricte** : `script-src 'self'`, sans `'unsafe-inline'`. Le navigateur refuse tout code
  écrit dans une page ; seuls les fichiers du site s'exécutent. Une installation indépendante dont le serveur garde
  une ancienne configuration peut encore envoyer l'ancienne règle : F12 → Network → Headers pour le vérifier.
- **Une exception, voulue** : la page de secours `killsw.html` (réinitialiser le Service Worker quand l'app ne démarre
  plus) garde son code dans la page — elle doit fonctionner même quand les fichiers de l'app sont inaccessibles. Elle
  n'affiche aucune donnée.
- Les styles écrits dans les pages (`style="…"`) restent autorisés (`style-src 'unsafe-inline'`) : un style ne peut pas
  exécuter de code.

Le fichier de configuration Nginx exact est versionné dans le dépôt sous
`docs/nginx-csp-config.conf` (visible à toute personne ayant accès au
code).

---

## 🪪 Permissions API navigateur utilisées

L'app utilise un nombre limité d'API navigateur qui peuvent demander
une permission. **Aucune** de ces API ne fait sortir de donnée du
navigateur. Tableau exhaustif :

| API | Quand | Permission requise ? | Donnée envoyée ? |
|---|---|---|---|
| **Geolocation API** | Calibrage KMZ + Mode urgence + bouton 📍 « Ma position » dans la modale Vue OSM et le widget HOME Vue OSM si l'user le déclenche | Oui (prompt navigateur explicite à la demande, jamais au boot — header `Permissions-Policy: geolocation=(self)` côté Nginx ; restriction `(self)` = seule notre origine autorisée, JAMAIS un iframe tiers) | **Aucune** (lecture pure, jamais transmise, jamais stockée — coordonnées affichées sur la carte uniquement en RAM le temps de la session) |
| **DeviceMotion / DeviceOrientation** | Tracker (PDR + boussole) | Oui sur iOS (prompt explicite via user gesture) | **Aucune** (lecture pure capteurs locaux) |
| **Wake Lock API** | Toggle ⚙️ Réglages → "Garder l'écran allumé" | Non (politique navigateur — accordée silencieusement en HTTPS si l'onglet a le focus) | **Aucune** (lock binaire) |
| **Clipboard API** | Bouton 📋 dans popup point (coords GPS) + 📋 Copier dans modale audit, inspecteur mémoire, etc. | Non en écriture user-initiated en HTTPS (silencieuse via `writeText`) | **Aucune** (l'app écrit dans le presse-papier, ne le lit jamais) |
| **WebAuthn (`navigator.credentials`)** | Activation Face ID / Touch ID / Windows Hello pour le PIN | Oui (prompt natif device) | **Aucune** (challenge généré côté client, validation locale) |
| **Battery Status API** | Indicateur batterie sidebar + mode urgence | Politique navigateur (header `Permissions-Policy: battery=(self)` côté Nginx) | **Aucune** (lecture pure) |
| **Screen Orientation API** | Correction heading boussole en landscape | Aucune | **Aucune** |
| **Storage API (`navigator.storage.estimate`, `persist`)** | Inspecteur mémoire + auto-persist mobile | Oui (`persist` prompt navigateur sur certains browsers) | **Aucune** |

### À propos du Wake Lock API

- **Hidden si non supporté** : `WakeLock.isSupported()` vérifie l'existence
  de `navigator.wakeLock.request` avant tout affichage. Sur Firefox
  (bug Mozilla #1589554 toujours ouvert en 2026) et Safari < 16.4,
  le toggle "Garder l'écran allumé" n'apparaît tout simplement pas dans
  les Réglages. Aucune erreur silencieuse.
- **Pas de fingerprinting** : l'API ne renvoie qu'un objet sentinel
  binaire `WakeLockSentinel`. Aucune info device (modèle, batterie,
  capteurs) n'est exposée. La pref est en `localStorage` strict.
- **Auto-release** : le browser libère automatiquement le lock au
  `visibilitychange→hidden`. Le module ré-acquire au retour visible si
  l'option est activée. Cohérent best practice MDN.
- **Pas de pingback serveur** : 0 fetch réseau dans `wakeLock.js`
  (vérifiable via le journal réseau intégré → Méthode 1).

### À propos de la Clipboard API

- Usage en **écriture seule** (`navigator.clipboard.writeText`),
  jamais en lecture (`readText`).
- L'app **n'accède jamais** au contenu du presse-papier de l'user.
- Trigger toujours sur **user click explicite** (bouton 📋 inline,
  pas d'écriture passive au load).
- Fallback `document.execCommand("copy")` via textarea hors-écran si
  l'API n'est pas dispo (HTTP non-sécurisé, vieux browsers).

---

## 🧰 Stockage local — où vivent tes données

Toutes tes données sont **strictement locales** à ton appareil et à ton
navigateur. Tu peux les inspecter et les supprimer toi-même via `F12` :

| Espace | Contenu | Comment l'inspecter |
|---|---|---|
| **localStorage** | Préférences (`debugMode`, `perfPreset` par plan, `unlock gate`, alertes acquittées, préfs d'évitement itinéraire, `myktamap_wake_lock_v1` boolean, `myktamap_session_tampon_v1_<planId>` = copie de secours d'une session écrite à la fermeture de l'app, retirée dès que la base des sessions a confirmé, etc.) | F12 → Application → Local Storage |
| **localStorage → `myktamap_plan_stats_v1_<planId>`** | Cache de stats agrégées par plan : `{pois, roads, distPx, breakdowns: {pointsByTag, roadsByType, zonesByType, structsByType}, ts, source}`. Counts uniquement (jamais de Blob/photo data). JSON-serialisé strictement local. Alimenté par `_computePlanStatsLive` + `_persisterStatsPlanCourant` (agrégation session + embedded via getters publics). | F12 → Application → Local Storage |
| **localStorage → `myktamap_loader_bar_stats_v1`** | Configuration de la bandeau profil du loader : array de keys (`["time", "storage", "plans"]`). Default `["time", "storage"]`. Persistance pure locale, aucune transmission. | F12 → Application → Local Storage |
| **localStorage → `myktamap_skip_server_plans_v1`** | Boolean `"true"` / `"false"`. Si actif, les plans serveur ne sont pas inscrits au boot. ⚠️ le `fetch("data/index.json")` (same-origin, déjà whitelisté) a TOUJOURS lieu au boot — il porte la config d'instance kiosque (sous-titre, flags, liaisons) qui doit s'appliquer même pref active ; la pref ne skippe QUE l'enregistrement des plans. Le SW sert ce fichier en **network-first** (timeout 3 s, fallback cache — même pattern que les dicos i18n) : aucune nouvelle URL, aucune donnée sortante, 1 requête same-origin par boot. | F12 → Application → Local Storage |
| **IndexedDB → `myktamap_handles`** | Handles FS Access API (Chrome desktop) + blobs ZIP des plans mémorisés (mobile/Safari/Firefox) | F12 → Application → IndexedDB |
| **IndexedDB → `myktamap_sessions`** | Tes sessions, une par plan (points, tracés, zones, **trackerTimeline** incluse). Elles vivaient dans le localStorage, plafonné à ~5 Mo par site ; elles y sont copiées au premier lancement, relues et comparées, l'ancienne copie étant gardée 30 jours. En navigation privée (IndexedDB refusé) ou en incognito de l'app, elles restent en localStorage (`myktamap_session_v1_<planId>`). **Local pur, jamais transmis.** | F12 → Application → IndexedDB |
| **IndexedDB → `myktamap_backups`** | 10 snapshots FIFO de session, **trackerTimeline incluse** (impact taille IDB proportionnel) | F12 → Application → IndexedDB |
| **IndexedDB → `myktamap_photos`** | Photos POI compressées localement, max 5/point | F12 → Application → IndexedDB |
| **IndexedDB → `myktamap_crashes`** | Crash reports OOM (archive auto FIFO 5) | F12 → Application → IndexedDB |
| **IndexedDB → `myktamap_profile`** | Surnom + photo profil utilisateur (1 seule entry `id="me"`, schema v1). Photo en Blob IDB, compressée canvas (max 512px JPEG q88). Jamais transmise. | F12 → Application → IndexedDB |
| **IndexedDB → `myktamap_osm_tiles`** | Cache offline OSM opt-in user. Object store `tiles`, schéma `{key: "z/x/y", blob, addedAt}`. Stocke des PNG de tuiles `tile.openstreetmap.org` pour consultation hors-ligne (modale Vue OSM, widget HOME, Mode Secours via Vue OSM). Cap `MAX_TILES_PER_CACHE = 200/opération` conforme à la politique d'usage OSM. Cache **GLOBAL** partagé entre les 3 contextes (clé `z/x/y` identique, pas de duplication). **Local pur, jamais transmis**. Effaçable via "💥 Tout réinitialiser" ou `OsmTilesCache.clear()` console. | F12 → Application → IndexedDB |
| **IndexedDB → `myktamap_journal`** | Le Carnet : archive de tes sorties (object store `sorties`, schema v1). Une entrée = `{id, type: "terrain"|"bureau", planId, planName, startedAt, endedAt, activeMs, distM, ajouts, levels, photoIds, track, note}` — **métadonnées + tracé décimé + REFS de photos**, jamais d'image copiée. ~2 à 8 Ko par sortie, purge FIFO au-delà de 500 sorties. **Local pur, jamais transmis** (aucun code réseau dans `js/journal.js`). Effaçable sortie par sortie (fiche → 🗑️) ou via « 💥 Tout réinitialiser ». | F12 → Application → IndexedDB |
| **IndexedDB → `myktamap_histoire_pdfs`** (**multi-documents**) | Documents PDF du Mode Histoire que **tu** importes (récit, plan scanné, article…). **Jusqu'à 10 documents par plan** (store `pdfs` v2, keyPath `id` + index `by_plan` — migration auto des plans qui n'avaient qu'un PDF, aucun PDF perdu), avertissement au-delà de 25 Mo cumulés, refus au-delà de 100 Mo. **Local pur, jamais transmis.** Comptée dans « Stockage ». | F12 → Application → IndexedDB |
| **Cache Storage** | Assets PWA pour le mode hors-ligne | F12 → Application → Cache Storage |
| **Service Worker** | Code du SW qui gère le cache | F12 → Application → Service Workers |

Pour **tout effacer** d'un coup : ⚙️ Configuration → 💥 Tout réinitialiser
(double confirmation + ping internet de sécurité pour éviter de te
retrouver sans cache hors-ligne).

---

## 🔭 Sur les analytics, le tracking, les cookies

- **Pas d'analytics** : ni Google Analytics, ni Matomo, ni Plausible,
  ni Fathom, ni quoi que ce soit. L'auteur n'a aucune visibilité sur qui
  utilise l'app ni comment.
- **Pas de cookies** : l'app n'écrit aucun cookie HTTP. Aucune session
  serveur, aucune session tracking.
- **Pas de pixel tracking** : aucune balise `<img>` distante. Toutes les
  images de l'app sont en same-origin.
- **Pas de fingerprinting** : aucun script ne lit l'UA, la résolution
  d'écran, la liste des polices, le canvas… au-delà de ce qui est
  fonctionnellement nécessaire (responsive design via media queries CSS).

---

## 🧪 Comment le code est contrôlé avant d'arriver chez toi

Les promesses de cette page ne valent que si le code qui arrive dans ton
navigateur est bien celui qu'elle décrit. Voici les contrôles par lesquels
passe chaque modification avant d'arriver sur `myktamap.fr`.

### 1. Des vérifications automatiques à chaque modification

Avant même d'être enregistrée, chaque modification du code passe une
soixantaine de vérifications automatiques (68 aujourd'hui). Quelques
exemples de ce qu'elles vérifient :

- aucune trace du code de l'édition professionnelle dans l'app libre ;
- aucun relevé de terrain envoyé sur le dépôt de code ;
- aucun script « en ligne » dans les pages — c'est ce qui permet la CSP
  stricte décrite plus haut ;
- des traductions cohérentes d'une langue à l'autre ;
- la documentation interne n'est jamais livrée sur le site.

### 2. Les mêmes vérifications, rejouées par GitHub

À chaque envoi du code sur GitHub, ces mêmes vérifications sont rejouées
automatiquement (intégration continue). Un contrôle sauté sur un poste ne
passe donc pas en silence.

### 3. Pas de mise en ligne sans feu vert

La mise en ligne est automatique, et elle n'a lieu — sur le site de test
comme sur le site principal — que si ces vérifications sont au vert. Le site
principal ne reçoit que du code passé par la porte décrite ci-dessous.

### 4. Une analyse de qualité et de sécurité avant chaque mise en production

Avant chaque mise en production, le code passe une analyse de qualité et
de sécurité (SonarQube). Pour passer :

- le nouveau code doit obtenir la meilleure note en fiabilité et en sécurité ;
- tous les points sensibles de sécurité doivent avoir été relus ;
- la duplication de code doit rester sous 3 %.

Sinon, la mise en production est bloquée.

### 5. Les librairies embarquées

L'app ne télécharge aucune librairie pendant que tu l'utilises. Les
quelques librairies qu'elle embarque (Leaflet, JSZip, jsPDF, html2canvas)
sont copiées dans le dépôt, avec leur version et un lien vers leurs avis de
sécurité. Ces librairies, comme les outils de test et d'intégration
continue, sont surveillées automatiquement (Dependabot) : une faille connue
ou une nouvelle version est signalée, et chaque proposition de mise à jour
est testée par l'intégration continue. Une librairie n'est remplacée que
par le fichier officiel publié par son auteur, et ce qu'elle fait (exports
PDF, ouverture des plans…) est retesté avant de la livrer.

### 6. Un essai à la main avant chaque mise en production

Avant chaque mise en production, l'app est essayée à la main sur le site
de test, en 12 points (la « porte de release »).

### Ce que ces contrôles ne remplacent pas

Ces contrôles sont tenus par l'auteur lui-même, et l'analyse SonarQube
tourne sur son poste : ses résultats ne sont pas publics. L'auteur peut, en
connaissance de cause, passer outre une étape (une urgence, un contrôle en
panne) : la dérogation est alors écrite et conservée avec la version. Ils réduisent le
risque d'erreur, mais rien ne remplace les vérifications que tu peux faire
toi-même (cf. « 🔍 Comment vérifier toi-même »).

---

## 🤝 La position de l'auteur

> *Je suis cataphile depuis 2016. Je connais la culture, et je sais que la
> méfiance envers une appli qui aurait une backdoor pour exfiltrer les
> plans est totalement légitime. C'est pour ça que j'ai conçu MyKTAMap
> comme une PWA 100 % client-side dès le départ : ce n'est pas un choix
> a posteriori pour rassurer, c'est l'architecture même de l'app. Il n'y
> a tout simplement aucun endroit côté serveur où tes données
> pourraient atterrir, parce qu'il n'y a aucun code applicatif côté
> serveur. Tout est conçu pour être vérifiable. Si tu trouves quoi que
> ce soit qui contredit ce document, contacte-moi directement —
> Instagram **[@karma_kta](https://instagram.com/karma_kta)** ou **[contact@myktamap.fr](mailto:contact@myktamap.fr)** — je corrigerai
> immédiatement.*
>
> <!-- kta:classe kta-auteur -->
> — **KARMA**, auteur de MyKTAMap

---

## 📋 Historique des versions

Ce que chaque version a changé côté réseau — une note par version — est dans une page à part :
**[Historique des versions de l'audit](NETWORK_AUDIT_HISTORIQUE.md)**. Cette page-ci décrit l'état actuel.

---

## 📬 Signaler une fuite ou un problème

Si tu observes **n'importe quelle requête réseau** émise par MyKTAMap
qui ne figure pas dans la liste blanche ci-dessus, contacte l'auteur
immédiatement : Instagram **[@karma_kta](https://instagram.com/karma_kta)**
ou **[contact@myktamap.fr](mailto:contact@myktamap.fr)**.
Le document sera corrigé et le code patché en priorité absolue.
