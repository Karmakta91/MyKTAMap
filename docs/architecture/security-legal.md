# Architecture MyKTAMap — Sécurité : gates, PIN, audit réseau, légal, licence

> 🔑 **Le mot de passe d'instance, quand il existe, est le SEUL** (`data/index.json > config.accessHash`).
> Il n'y a **plus de code communautaire codé en dur** depuis le 04/10/2026 : sans mot de passe d'instance,
> l'écran d'entrée est la présentation « Bienvenue » et son bouton « Entrer » ; avec, la même présentation
> porte un champ « Code d'accès » (§36).
>
> 🕵️ **v1.90.14 — Incognito hérite du déverrouillage d'instance.** Le shim incognito relit du disque une
> `READ_DISK_WHITELIST` (les écritures restent shimées) pour ne pas re-demander le mot de passe à chaque
> fenêtre privée. La mémoire `myktamap_unlock_instance_v1` (v1.90.6) manquait à cette liste : sur une instance
> à `accessHash`, la gate se réaffichait en incognito. Ajoutée. `check-gate-instance.js` §10 exige désormais
> que TOUTE clé de déverrouillage lue par la gate soit whitelistée en lecture incognito.
>
> 🕵️ **Incognito et installation reliée (07/10/2026)** : `IncognitoMode.indisponible()` est vrai dès qu'une connexion
> serveur est configurée (état ni « off » ni « invalide ») — le serveur y enregistre l'activité (synchro, position,
> connexion), la promesse « aucune trace » serait fausse, et le coffre / les plans gardés ont besoin d'IndexedDB, que le
> shim bloque. Bouton grisé et expliqué (🧩 Fonctionnalités optionnelles), `launch()` / `confirmAndLaunch()` refusent.
>
> 🔏 **09/10/2026 — Licence de l'installation absente, expirée ou refusée par le serveur = app FERMÉE** (§77.10) ;
> l'utilisateur ne peut plus importer de licence (gate, profil).
>
> 🔒 **v1.90.9 — AUCUNE licence pro ne contourne un `accessHash`.** Sur une instance protégée, la licence servie
> par l'instance n'ouvre pas la gate. 🩸 La licence serveur est fetchée pour TOUS les visiteurs : la laisser bypasser
> rendait le mot de passe muet. `main.js` refuse donc le bypass **quelle que soit la source** dès que
> l'instance impose un mot de passe. Le mode pro s'active après la saisie ; la licence n'est pas une clé
> d'accès. Seule une instance SANS mot de passe laisse la licence serveur bypasser (rien à garder).
>
> 🔒 **Le niveau de sécurité est IDENTIQUE, et il est faible — c'est assumé et écrit partout.** Le hash
> d'instance vit dans un fichier public ; le hash communautaire est sur GitHub. Les deux se brute-forcent hors
> ligne. Barrière **sociale** (« il faut connaître le code »), **jamais une authentification**. Le lockout à 5
> tentatives et le stockage local restent inchangés, bypassables en console comme avant.
>
> 🩸 Détail d'implémentation qui n'est pas cosmétique : `isUnlocked()` exige les deux valeurs **non vides** et
> la forme `/^[0-9a-f]{64}$/`. Sur un navigateur vierge, une comparaison naïve entre deux `null` aurait ouvert
> l'app à tout le monde, sans la moindre erreur visible.

> Référence détaillée extraite de l'ancien CLAUDE.md. Lue à la demande (pas auto-chargée).
> Sections : §18, §36, §40, §43, §77

---

### 18. Protection juridique du code (Phase 1 légale, depuis 09/05/2026)

**Auteur** : Flavien VIDAL (vrai nom civil, pour la force probante légale) — alias KARMA pour la continuité de marque visible.

**Licence** : CC BY-NC-SA 4.0 — usage commercial interdit sans accord écrit préalable. Fichier `LICENSE` à la racine.

**Module `js/copyright.js`** chargé EN PREMIER dans `index.html` :
- `window.__MKM__` watermark (frozen object avec author/copyright/license/build) — preuve d'origine en cas de copie.
- Console banner stylé au boot (visible à F12). Bypass volontaire du proxy `debug.js` (chargé après) → reste visible même en `debugMode = false`.
- **Détection DevTools conditionnée à `APP_CONFIG.debugMode === true`** : si debug ON, polling 2s heuristique outer/inner > 280px → toast `.kta-devtools-warn` (badge "DEBUG" pour signaler la nature outil-dev). Si debug OFF, aucune polling, zéro overhead. Toggle live du mode debug fonctionne (pas besoin de reload). Skip si une modale charte est ouverte (anti faux positif sur transitions viewport).
- Toujours dans `ASSETS_TO_CACHE` du SW.

**En-tête de licence** sur **tous** les scripts servis (`js/*.js` + `sw.js`) : bloc `/*! MyKTAMap (c) 2026 Flavien VIDAL … CC BY-NC-SA 4.0 … */` (le `/*!` survit à une minification). Si quelqu'un copie un fichier isolé, le copyright le suit. 🛡️ `scripts/check-entete-licence.js` (pré-commit, bloquant, auto-testé) exige « Flavien VIDAL » et « CC BY-NC-SA » dans les 15 premières lignes ; l'en-tête à copier est dans son commentaire de tête. `scripts/` (outillage, jamais servi) n'est pas concerné.

**Mentions visibles utilisateur** :
- Footer loader : `© 2026 Flavien VIDAL · CC BY-NC-SA 4.0 · Usage commercial interdit`
- Splash : signature `karma.png` (pseudo artistique, déjà en place)
- Meta tags `<head>` : `author`, `copyright`, `license`
- CGU v2 (`TERMS_VERSION` 2 : tous les utilisateurs ré-acceptent) : trois clauses d'une ligne dans la gate
  (`legal.gate.pointGarantie` — position, itinéraire, calage, plans et relevés sans garantie, état des sites non
  certifié ; `pointSecours` — ne remplace pas le 112 / 18, rien ne part sous terre ; `pointContenus` — l'utilisateur
  répond de ce qu'il importe, exporte, diffuse et des accès qu'il divulgue), détaillées en tête du texte intégral
  (`legal.full.garantie` / `secours` / `contenus`, traduites) et dans `docs/applications/CGU.md`.
- Non-certification rappelée sur la fiche et le formulaire d'un POI **danger** (`js/poiDanger.js`, avec sa date de
  constat ; pas sur le point du mode « perdu ») et dans les guides.

**Pour ajouter un nouveau fichier JS** : copier l'en-tête de licence en tête (sinon le pré-commit refuse).

**Phase 2.1 (build pipeline)** non encore en place — projet en vanilla JS sans bundler. À mettre en place via esbuild minification + bundle pour la version prod (le repo privé garde le source lisible). Attention : SW à mettre à jour pour pointer sur le bundle minifié au lieu de la liste `js/*.js`.

---

### 36. Unlock Gate — écran d'entrée (présentation « Bienvenue », avec ou sans code d'accès)

Module `js/unlockGate.js` : un écran entre la fin du splash et le démarrage normal, montré au premier
lancement et après un reset complet (le choix est mémorisé en localStorage). **Plus aucun mot de passe
codé en dur** depuis le 04/10/2026 (décision KARMA) : l'ancien code communautaire, son hash et son
affichage en clair dans la fenêtre de reset sont supprimés.

#### 36.1 Un écran, deux modes selon l'instance

Le mode est décidé **avant** de dessiner (`_monterGate` lit `_hashInstance()`, config d'instance déjà
chargée par `ktaInstance.js`). Les deux modes montrent la même présentation « Bienvenue » (§36.8) :

| Instance | En-tête de l'écran | Ce qui ouvre |
|---|---|---|
| publie `index.json > config.accessHash` (posé par ConfAdmin : installation privée) | 🗝️ champ **« Code d'accès »** + **Entrer**, **Découvrir**, puis « demande le code à la personne qui gère cette installation » (`gate.info`) ; **ni** contacts de l'auteur **ni** pastille « Licence pro » (haut et pied) | **seul** le mot de passe de l'instance |
| sans `accessHash` (usage local, ZIP, Docker community) | 🧭 **Entrer**, **Découvrir**, pastille « Licence pro » ; contacts de l'auteur au pied | le bouton (mémorise `libre-v1`) ou une licence valide |

**Repli** : si `css/bienvenue.css` ou `js/bienvenue.js` ne se chargent pas (cache incomplet, 404, plus de 4 s),
la **carte centrée** prend le relais dans le même mode (`_monterGateMode(hash, true)`) : champ mot de passe
(sans contacts) ou bouton « Entrer ». Jamais d'installation bloquée, jamais d'écran vide.

⚠️ **Niveau de sécurité inchangé** : barrière **sociale**, jamais une authentification. Le hash d'instance
est dans un fichier public, brute-forçable hors ligne ; `localStorage` se modifie en F12.

#### 36.2 Ce qui est mémorisé

- `myktamap_unlock_v1` (`LS_UNLOCK`) : `libre-v1` (accès libre, licence pro) **ou** le hash du mot de
  passe d'instance accepté.
- `myktamap_unlock_instance_v1` (`LS_UNLOCK_KIOSQUE`) : le hash d'instance accepté — sans lui, un accès
  par mot de passe serait reverrouillé au premier démarrage hors ligne.
- `isUnlocked()` (**lecture seule** : elle est appelée dès le chargement du module, avant la
  revalidation) ouvre si `libre-v1`, si le hash stocké = la mémoire d'instance, ou si c'est l'**ancien
  code communautaire sans mémoire d'instance** (`HASH_HERITE`, migration : un appareil entré avec
  l'ancien code vaut « déjà choisi »). `HASH_HERITE` n'est **jamais** comparé à une saisie.
- `revaliderInstance(hash, indexRepondu)` (appelée par `main.js` avant la gate, **seulement si l'index a
  répondu**) : l'instance impose un mot de passe → tout autre accès mémorisé (libre, ancien code, ancien
  mot de passe) est **révoqué** ; l'instance retire son mot de passe → l'accès qui en venait est révoqué
  (l'écran revient alors sans champ).

Mesuré le 04/10/2026 (Edge, index simulé) : ancien code sans mot de passe d'instance → ouvert ; ancien
code + instance au **même** mot de passe → ouvert, mémoire posée ; ancien code ou accès libre + instance
à un **autre** mot de passe → écran avec champ ; mot de passe d'instance retiré → écran sans champ.

#### 36.3 Saisie, 5 tentatives + verrou TEMPORISÉ (mode avec mot de passe ; M2, décision KARMA 13/09/2026)

Une seule logique de saisie, `_essayerCode(valeur)` → `{ etat: ok | vide | crypto | faux | verrou, reste?, err? }`,
appelée par l'écran Bienvenue (via `code.essayer`) comme par la carte de repli (`_onSubmit`) ; `_etatCode()` dit à
l'écran s'il est verrouillé, le temps restant mis en forme et les essais restants. Un code juste mémorise le hash
(§36.2), efface compteur et verrou, et pose `_codeAccepte`.

Compteur `localStorage["myktamap_unlock_attempts"]`, verrou `localStorage["myktamap_unlock_lock_v1"]` =
`{ until, start, level }`. Tentatives 1-4 : « ❌ Code incorrect. Tentatives restantes : N », à côté du champ.
Tentative 5 : verrou temporisé au palier suivant — 10 min → 1 h → 6 h → 24 h (`LOCK_DELAYS_MS`), compteur remis
à 0. Un essai pendant le verrou est refusé avant tout calcul.

- **Sur l'écran Bienvenue** : le verrou s'affiche **dans la zone du champ** — champ et « Entrer » désactivés, le
  compte à rebours à la place du texte saisi et dans le message dessous (`gate.lockout.*`), revérifié chaque
  seconde ; la présentation reste lisible. À l'échéance, le champ revient sur le même écran ; la Promise de
  `ouvrirGate()` attend toujours.
- **Sur la carte de repli** : champ caché, compte à rebours, puis la gate est **remontée** (`_monterGate`, la
  Promise survit).

**Pas de bouton reset** depuis le verrou. Base de temps : horloge de l'appareil (accepté : le verrou
ralentit un tiers qui a le téléphone en main ; le verrou **définitif** tuait l'app de son propriétaire sous
terre — audit ergonomie 13/09/2026, B7). Le mode sans mot de passe n'a ni tentatives ni verrou.

#### 36.4 Position dans le boot (`main.js > initApp`)

Gate légale → config d'instance (`KtaInstance.charger`) → `revaliderInstance(…, true)` si l'index a répondu
→ modules greffés / gate déléguée (chantier 3 ; une gate déléguée en échec n'ouvre **jamais** celle-ci) →
`if (!_gateDelegueeOk && UnlockGate && !UnlockGate.isUnlocked()) await ouvrirGate()` → PIN local.
Une licence pro (serveur ou locale) contourne l'écran **sauf** sur une instance qui publie un mot de passe.
Une installation pro à gate déléguée ne passe pas par cet écran.

#### 36.5 Fenêtre « 💥 Tout réinitialiser »

`viderCacheAppli` purge `localStorage` → l'écran revient au démarrage suivant. Sur une instance qui publie
un mot de passe, la 1ʳᵉ fenêtre prévient qu'il sera **redemandé** (`maint.reset_access_code_*`), **sans
jamais l'afficher** ; sans mot de passe d'instance, rien à prévenir (l'écran Bienvenue revient).

#### 36.6 API publique `window.UnlockGate`

`isUnlocked()` · `isLockedOut()` · `ouvrirGate()` → Promise · `lock()` · `markUnlockedViaLicensePro()`
(pose `libre-v1`) · `revaliderInstance(hash, indexRepondu)` · `instanceRequiertMotDePasse()` → Promise<bool> ·
`visiteDemandee()` → bool (« Découvrir l'app en 1 minute » choisi sur l'écran Bienvenue, lu par `firstRunFlow.js`).

#### 36.7 À NE PAS faire

- **Ne JAMAIS** réintroduire un mot de passe codé en dur ni un mot de passe **en clair** dans le code, la
  doc ou `version.json` (le dépôt est public : l'ancien code et sa valeur en clair restent dans
  l'historique Git — il ne protège plus rien).
- **Ne JAMAIS** réintroduire un bouton reset depuis le verrou.
- **Ne PAS** écrire dans `localStorage` depuis `isUnlocked()` (appelée avant la revalidation).
- **Ne JAMAIS** mémoriser `libre-v1` depuis l'écran d'une instance protégée, ni résoudre la gate sans code juste :
  son `surEntree` ne fait que noter la visite, son `surFin` ne résout que si `_codeAccepte` (sinon l'écran revient).
- **Ne PAS** dupliquer la vérification dans `bienvenue.js` : il reçoit `code.essayer` / `code.etat`, rien d'autre.
- Garde-fou : `scripts/check-gate-instance.js` (matrice `isUnlocked`, décision du submit, révocations,
  écran Bienvenue des deux modes et repli, ordre du boot) · checkup navigateur
  `scripts/smoke/checkup-bienvenue.js` (§6 : instance protégée, verrou, repli).

#### 36.8 Écran « Bienvenue »

Une petite présentation qui défile, dans le style de la page de présentation pro (décision KARMA). Montrée
**une fois par appareil**, après le splash (inchangé) et la gate légale : un appareil déjà entré ne la revoit jamais.

- **Chargement à la demande** : `unlockGate.js > _chargerBienvenue` ajoute `css/bienvenue.css` et `js/bienvenue.js`
  (`window.KtaBienvenue.ouvrir({ surEntree, surFin, code? })`) ; les polices Montserrat 400/600/800 et Permanent
  Marker (`fonts/`, licences OFL et Apache jointes) ne sont demandées que par cette feuille. Tous précachés
  (`sw.js`). Fichier absent ou trop lent (4 s) → carte de repli (§36.1).
- **Contenu** : accroche, quatre stations (plan dans la poche · se repérer sans GPS, Mode Secours avec son badge
  « exploratoire » · rien ne sort de l'appareil · échanger avec soin), sortie « Prêt à descendre ? » ; ville vivante,
  « réseau fictif », icônes réelles de `icon/` ; sélecteur de langue de l'app (redessine l'écran). Contacts de
  l'auteur (`gate.contact`) et pastille pro : mode sans mot de passe seulement. Textes `bienvenue.*`, `gate.*`
  (fr / en / es).
- **Mouvement** (moteur de la page de présentation, adapté à un overlay qui défile en interne) : le fil doré de
  chaque galerie se dessine sur la longueur parcourue, la tête de suivi (`icon/iconetrack.png`) le suit et tourne aux
  coudes, chaque repère passe « atteint » avec un flash. **Mouvement réduit** : état final statique, entrée immédiate.
- **Sans mot de passe — « Entrer »** (en haut et en bas) : l'accès est mémorisé **au clic** (`_memoriserAccesLibre`,
  visite guidée marquée vue), le texte s'efface, le tracker descend le puits, fondu (≈ 2,7 s ; fondu seul depuis le
  bas), puis la suite habituelle du boot. **« Découvrir l'app en 1 minute »** entre de la même façon et demande la
  visite guidée (§87.1).
- **Avec mot de passe** : tout se lit sans code. Le champ est dans l'en-tête (formulaire, touche Entrée) ; à
  l'ouverture le focus reste sur l'écran (pas de clavier virtuel imposé). « Entrer » du bas et « Découvrir l'app en
  1 minute » **remontent au champ** et lui donnent le focus (la visite est alors demandée pour l'entrée). Code faux :
  message à côté du champ (`gate.err.*`), jamais de popup. Code juste : la descente part, puis le boot. Visite
  guidée inchangée : d'office au 1er lancement (rien ne la marque vue), ou demandée sur l'écran.
- **« Découvrir »** fait défiler jusqu'à la 1re station.
- **Thème** : toujours sombre (jetons locaux `--bv-*`, copies des valeurs de la charte) : au premier lancement,
  aucun thème n'est choisi.

---

### 40. Privacy & Audit — Module `networkAudit.js` (depuis v1.8.0, ajustements CSP en v1.8.1)

Module de transparence + vérifiabilité construit pour répondre à la méfiance légitime du milieu cataphile vis-à-vis des "backdoors" qui exfiltreraient les plans. **L'app étant 100% client-side, la collecte est techniquement impossible ; ce module rend ça vérifiable par l'utilisateur sans qu'il ait à nous croire sur parole.**

#### 40.1 Architecture

Module IIFE `js/networkAudit.js` (~400 lignes) chargé **EN DEUXIÈME** dans l'ordre des scripts (juste après `copyright.js` qui ne fait que `console.log`, et **avant tout module qui fait du fetch**). Ordre critique : si on inverse avec `debug.js` ou plus, les premiers `fetch()` passent sous le radar.

Mécanisme : monkey-patch des 5 API réseau du navigateur AVANT que tout autre code ne puisse les appeler :
- `window.fetch`
- `XMLHttpRequest.prototype.open` + `.send`
- `navigator.sendBeacon`
- `WebSocket` (constructor wrapper)
- `EventSource` (constructor wrapper)

Chaque appel est **loggué** dans un **buffer circulaire de 500 entries** (RAM uniquement, pas localStorage), puis part normalement. **Le module observe, il ne bloque rien.**

⚠️ Angle mort assumé : les images posées par Leaflet (`<img>` des tuiles OSM de la Vue OSM) ne passent par aucune de ces API — elles n'apparaissent pas dans le journal, seulement dans F12 → Réseau. La doc utilisateur (NETWORK_AUDIT) le dit.

**Pas de mode de blocage côté client.** Le seul tiers que l'app contacte est `tile.openstreetmap.org` (Vue OSM) ; il se coupe par la case 🗺️ Vue OSM (`OsmView.isOptedIn`, clé `myktamap_osm_view_opt_in`) et par le mode incognito (`IncognitoMode.isActive()`). Un ancien « mode hors-ligne strict » (interception + rejet des requêtes non same-origin) a été retiré : il ne coupait en pratique que le préchargement des tuiles OSM (`osmTilesCache.js`, seul `fetch` cross-origin), ses autres gardes appelaient une fonction jamais définie. Ne pas le réintroduire sans un besoin qu'un `<img>` ne contourne pas.

#### 40.2 Origines attendues (visibles côté UI)

`WHITELIST_HUMAN` (getter, reconstruit dans la langue courante, clés `netaudit.whitelist.*`) liste ce que la modale 📖 Doc audit présente comme origines attendues :

1. **Même origine** : le domaine de l'app (assets, `version.json`, `alert.json`, `data/*`, `docs/*`, `lang/*`), dont le ping santé `<origin>/ping.html`
2. **`blob:`** : tuiles V2 servies depuis le ZIP en mémoire
3. **`data:`** : icônes SVG inline, exports

Ce n'est qu'une description : aucune requête n'est filtrée sur cette liste. (Elle ne cite pas OpenStreetMap ; la modale le fait dans la puce `home.netdoc.verify3`.)

#### 40.3 API publique `window.NetworkAudit`

- `getLog()` → `Array<Entry>` (copie immutable du buffer)
- `clear()` → vide le buffer
- `onLog(callback)` → subscribe live, retourne unsubscribe (utilisé par la modale 📋 Journal)
- `WHITELIST_HUMAN` → array readonly de descriptions
- `exportJson()` → string JSON formaté (utilisé par bouton 📥 Exporter)

**Structure `Entry`** :
```js
{
  timestamp: 1747923456789,  // Date.now()
  kind:      "fetch",         // ou "xhr", "beacon", "websocket", "eventsource"
  url:       "...",
  method:    "GET",           // ou POST, WS, SSE, etc.
  hasBody:   false,           // true si payload envoyé
  category:  "plan-data",     // ou app-script, ping, external, etc. (cf. _classify)
  status:    200              // HTTP status OU "FAIL", "OPEN", "SENT"
}
```

#### 40.4 UI (uniquement dans la modale ⚙️ Configuration du loader)

Section "🔒 Confidentialité & Audit" dans `#loaderConfigModal` avec :
- Bouton 📋 Voir le journal réseau → modale `#loaderNetLogModal` (tableau live + sticky header + scroll body + boutons 📋 Copier / 📥 Exporter / 🗑️ Vider)
- Bouton 📖 Que fait l'app sur le réseau ? → modale `#loaderNetDocModal` (lead + whitelist + comment vérifier + CSP + bouton 📄 Ouvrir doc complète → `docs/NETWORK_AUDIT.md`)
- Case 🗺️ Vue OSM (`#loaderOsmOptInCb` → `OsmView.setOptedIn`) — seul accès à un tiers

La classe `.kta-net-paranoia-toggle` (nom historique) est la case à cocher générique de toute la modale Configuration, pas seulement de cette section.

⚠️ **Pas de section dans la modale ⚙️ Réglages in-app (map mode)** — décision KARMA : tout réglage sensible reste dans le loader. Cohérent avec la refonte v1.7.3 (cf. §39).

#### 40.5 Catégorisation visuelle dans le journal (UI)

`_classify(url)` retourne un label affiché en couleur :

| Catégorie | Pattern URL | Couleur |
|---|---|---|
| `app-page` | `/`, `.html` | bleu |
| `app-script` | `.js` | bleu |
| `app-style` | `.css` | bleu |
| `image` | `.png`, `.jpg`, `.jpeg`, `.webp`, `.svg`, `.gif` | vert |
| `data` | `.json` (générique) | violet |
| `plan-data` | `/data/...` | violet |
| `version-check` | `/version.json` | jaune |
| `alert-check` | `/alert.json` | orange |
| `doc` | `.md` | gris clair |
| `ping` | `<origin>/ping.html` | gris |
| `external` | autre origine | rouge |
| `same-origin` | autre same-origin | bleu clair |
| `local-blob` / `local-data` | `blob:` / `data:` | gris |
| `unknown` | erreur de parsing URL | gris |

Aide visuelle pour repérer rapidement les anomalies dans le journal (toute catégorie `external` devrait alarmer — seul le préchargement « 💾 Save Offline » de tuiles OSM en produit légitimement).

#### 40.6 Nouvelles API réseau

⚠️ Si on ajoute un nouveau type d'API réseau (genre WebTransport, RTCPeerConnection) **il faut l'instrumenter** dans `networkAudit.js`, sinon il passe sous le radar.

#### 40.7 CSP côté serveur

Double protection : en plus du module JS, le serveur envoie un en-tête `Content-Security-Policy`. Sources :
`docker/nginx-docker.conf` (image, donc installations pro et selfhost), modèles `docs/nginx-csp-config.conf` +
`docs/nginx-myktamap.conf`, et la **vraie config nginx de dev.myktamap.fr et myktamap.fr sur le VPS** (KARMA).
Directives clés :
```
connect-src 'self' blob: https://tile.openstreetmap.org https://*.tile.openstreetmap.org
                                              ← LA garantie anti-exfiltration (OSM = tuiles en lecture, Vue OSM)
script-src 'self'                             ← en vigueur depuis la bascule du 10/10/2026 (40.7.1)
style-src 'self' 'unsafe-inline'              ← assumé (style="…" partout ; un style injecté n'exécute rien)
img-src 'self' data: blob: https://tile.openstreetmap.org https://*.tile.openstreetmap.org
worker-src 'self' blob:                       ← Service Worker, worker du splash (js/ktaSplashWorker.js)
frame-ancestors 'none'                        ← anti-clickjacking
```

Même si un attaquant injectait du JS, le **navigateur** refuserait l'envoi vers un domaine non autorisé. Vérifiable
côté user : F12 → Network → Headers → `Content-Security-Policy`. Pas de `report-uri` / `report-to` (aucune donnée vers
un serveur) : les violations ne se voient que dans la console.

⚠️ La config nginx de l'hôte doit inclure une **copie hors du dossier web** du fichier de CSP : myktamap.fr se déploie
sans `docs/` depuis le 07/10/2026 (`infra-versioning.md` §85), un include du fichier du site resterait figé.

#### 40.7.1 `script-src` sans `'unsafe-inline'` — en vigueur (bascule du 10/10/2026)

- **Plus aucun script inline dans l'app** : les 11 gestionnaires (`onclick`, `onerror`) sont des écouteurs (délégation +
  `data-*` ; images manquantes : `data-kta-echec`, écouteur `error` en capture dans `utils.js`) ; les liens
  `javascript:void(0)` sont des `#` (le clic fait déjà `preventDefault`) ; les blocs `<script>` d'`index.html` et de
  `confadmin.html` sont devenus `js/homeDemarrage.js`, `js/swRegister.js`, `js/confadmin.js` (même place, sans defer).
- **Exception unique : `killsw.html`**, page de secours quand le Service Worker est cassé — son script doit rester dans la
  page (un fichier `js/` passerait par ce SW). Page fixe sans donnée utilisateur : bloc `location = /killsw.html` qui
  garde `'unsafe-inline'` (dans un `location` avec `add_header`, tous les en-têtes sont redits : nginx n'hérite pas).
- **Garde-fou** `scripts/check-csp-inline.js` (pre-commit, bloquant, auto-testé) : aucun `on…=`, `javascript:` ni
  `<script>` sans `src` dans `js/`, les pages de la racine et `lang/`.
- **Bascule faite le 10/10/2026** : `script-src 'self'` est la politique EN VIGUEUR dans `docker/nginx-docker.conf`
  et le modèle `docs/nginx-csp-config.conf` ; la ligne `Content-Security-Policy-Report-Only` est retirée. Le **smoke**
  (`scripts/smoke/server.js`) sert cette politique et refuse de démarrer si elle rouvre `'unsafe-inline'` aux scripts ;
  `check-csp-inline.js` (règle 4) refuse la même chose dans les configs nginx du dépôt, hors bloc `killsw.html`.
- **Servie sur dev et prod depuis le 10/10/2026** (config nginx du VPS, hors dépôt) : `script-src 'self'` sur l'app,
  `'unsafe-inline'` sur `/killsw.html` seulement, avec son bloc `location` qui redit tous les en-têtes. Vérifié par
  les en-têtes servis : `curl -sI https://<site>/killsw.html | grep -io "script-src[^;]*"`. Sans ce bloc, la page de
  secours s'affiche mais son script est bloqué (constaté le 10/10/2026 avant l'ajout).
- Vérifié le 10/10/2026 sous la vraie config nginx de l'image Docker : en-têtes servis (stricte sur l'app, exception
  sur `killsw.html`), parcours accueil → Dépannage → Documentation → relevé fictif → fenêtre de l'app → export PDF
  sans aucune violation CSP ; smoke vert.
- Vérifié le 07/10/2026 sous politique stricte EN VIGUEUR : smoke vert ; banc bouton par bouton (pied de page, image
  manquante, configuration, barre, sortie d'urgence, étape au clic, confadmin, Service Worker) ; un `onerror` injecté est
  bloqué — la protection visée : un affichage non échappé qui passerait entre les mailles n'exécute plus rien.

⚠️ Pour les futurs développeurs : **ne JAMAIS faire `el.innerHTML = userInput` sans échappement** (`check-xss`), et
**jamais de gestionnaire inline** — un écouteur (`check-csp-inline`).

**Échappeur HTML unique : `window.ktaEsc(s)`** (`&` `<` `>` `"` `'` → entités, `null`/`undefined` → `""`), défini dans
`js/langManager.js` — 2e script chargé, sans `defer`, donc disponible pour les modules non différés (accueil, profil,
inspecteurs) qui s'exécutent avant `utils.js`. Un module garde au plus un alias (`function _esc(s) { return
window.ktaEsc(s); }`) ; jamais de copie locale ni de repli `window.ktaEsc || function (x) { … }` (les anciens replis
n'échappaient rien). 🛡️ `scripts/check-esc.js` (pré-commit et CI, bloquant) : définition unique exécutée contre une
charge, ordre de chargement dans `index.html`, aucune copie locale hors exceptions motivées dans le script (XML de
`gpxIO`/`kmzExport`, `confadmin.html` qui ne charge pas `langManager.js`, assainisseur de `ktaExtensions`, et
`itiGuidage`/`sortieUrgence` tant que `check-guidage.js` les charge seuls en VM).

#### 40.8 Documentation utilisateur (docs/NETWORK_AUDIT.md)

Page de transparence détaillée (~300 lignes) servie en static depuis le SW (ajoutée à `ASSETS_TO_CACHE`). Contenu :
- Promesse en 1 ligne
- Modèle technique (PWA pure)
- Liste blanche commentée
- Comment vérifier toi-même (3 méthodes : journal interne / F12 / lecture source)
- Couper le seul tiers (case 🗺️ Vue OSM) + pourquoi il n'y a plus de « mode hors-ligne strict »
- CSP expliqué
- Position de l'auteur

Accessible via le bouton 📄 dans la modale 📖 Doc audit (s'ouvre dans un nouvel onglet `noopener,noreferrer`, path same-origin, passe la CSP).

#### 40.9 Pour ajouter une nouvelle URL à la whitelist (futur)

Si on doit ajouter un endpoint tiers légitime (ex : un CDN pour les polices Inter, un service de tuiles cartographiques) :

1. Ajouter une ligne dans `WHITELIST_HUMAN` (description lisible, clés `netaudit.whitelist.*` ×3 langues)
2. Ajouter dans `docs/applications/NETWORK_AUDIT.md` + `.html` (tableau de la liste blanche complète)
3. Ajouter dans `docs/nginx-csp-config.conf` (directive `connect-src`, et `img-src` si chargé en image)
4. Prévoir une case qui le coupe (modèle : 🗺️ Vue OSM) et le couper en incognito
5. **Bumper la version** (transparence : un changement de liste blanche = changement de surface réseau, l'user doit pouvoir comparer avant/après)

⚠️ **NE JAMAIS** ajouter un endpoint qui reçoit des données utilisateur (POST/PUT). Si nécessaire un jour, refonte du modèle de transparence requise (peut-être avec opt-in explicite par feature).

---

### 43. Code d'accès local PIN/Face ID optionnel (depuis v1.10.0)

Couche perso optionnelle par-dessus `UnlockGate` (§36) qui reste la barrière communautaire avec mdp partagé. Différent : le PIN est propre à chaque user, choisi par lui.

Module `js/pinLock.js` (~450 lignes IIFE) → `window.MyKTAMapPinLock`.

**Modèle de sécurité honnête** :
- Hash `SHA-256(salt + pin)` via `crypto.subtle.digest`
- Salt random 16 bytes (`crypto.getRandomValues`) en b64
- Stockage `localStorage["myktamap_pin_v1"]` = `{hashedPin, salt, attempts, hasBiometric, credentialId}`
- **Barrière UX, PAS pseudo-crypto** : l'app étant 100% client-side, un attaquant motivé bypass via F12 (= `localStorage.clear()` en 5s). Cohérent UnlockGate.
- Les données IDB (photos, sessions) ne sont **PAS** chiffrées (choix volontaire KARMA 6:a)
- Aucune recovery en cas d'oubli → reset complet requis

**API publique** :
- `isEnabled() / isUnlocked() / isLockedOut() / getRemainingAttempts()` — état
- `hasBiometric() / isBiometricSupported()` — biométrie
- `enable(pin, useBiometric) / disable(pin) / unlock(pin) / unlockWithBiometric() / changePin(newPin) / reset()` — actions
- `ouvrirGate()` — affiche la gate UI, résout au unlock ; verrou temporisé : `_afficherLockoutUI(onUnlock)` repasse au pavé à l'expiration

**Verrou temporisé (M2, 13/09/2026)** : 5 tentatives PIN ratées consécutives → `state.lockUntil = now + LOCK_DELAYS_MS[palier]` (10 min → 1 h → 6 h → 24 h), `state.lockLevel++`, `attempts = 0`. `isLockedOut()` = `lockUntil` dans le futur (ou horloge reculée sous `lockStart`). Compte à rebours à l'écran, retour automatique au pavé, un code juste efface `lockUntil` / `lockStart` et remet `lockLevel` à 0. Une biométrie ratée n'incrémente PAS `attempts` (WebAuthn gère son propre lockout natif).

**Biométrie WebAuthn** (Face ID / Touch ID / Windows Hello) :
- Détection via `PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()`
- Enregistrement : `navigator.credentials.create({publicKey: {challenge: random, rp: {name: "MyKTAMap"}, user: {...}, pubKeyCredParams: [-7, -257], authenticatorSelection: {authenticatorAttachment: "platform", userVerification: "required"}, attestation: "none"}})`
- Vérification : `navigator.credentials.get({publicKey: {challenge: random, allowCredentials: [{id, type: "public-key", transports: ["internal"]}], userVerification: "required"}})`
- Challenge random **client-side** (no backend) — compromis assumé, niveau "barrière UX"
- Si l'enregistrement biométrie échoue à l'activation → PIN activé sans biométrie (fallback graceful, error.pinActivatedWithoutBiometric = true signale au caller)

**UI Gate plein écran** (`_afficherGateUI(onUnlock)`) :
- Overlay z-index 100002 (au-dessus de tout)
- Boîte 360px charte dorée avec icône 🔐 + titre + dots `●●●●` 6 emplacements
- Pattern iOS 8:b : dernier chiffre saisi visible 0.5s puis remplacé par ●
- Keypad numérique 3×4 custom (1-9 / biométrie ou empty / 0 / ⌫)
- Auto-prompt biométrique 400ms après ouverture si configurée
- Auto-submit dès 6 chiffres OU touche Enter pour 4-6
- Clavier physique : chiffres + Backspace + Enter (Échap **bloqué** — l'user doit unlock)
- Affichage "N tentative(s) restante(s)" avec classe `kta-pin-gate-attempts-warn` si ≤ 2

**UI Lockout** (`_afficherLockoutUI()`) — verrou **temporaire** (décision KARMA 13/09/2026) :
- ⏳ compte à rebours (`pin.lockout.attente`) ; à l'expiration, retour automatique au pavé — jamais de réinitialisation
  demandée. Paliers 10 min → 1 h → 6 h → 24 h (`LOCK_DELAYS_MS`), phrase d'escalade (`pin.lockout.escalade`)
- Pas de bouton de sortie ; seul le bouton 📖 Documentation reste ouvert par-dessus le verrou

**UI activation/modification/désactivation** — `index.html` modale ⚙️ Configuration loader (choix 7:b "loader uniquement") :
- Pas de section dans ⚙️ Réglages map mode (par design — cohérent avec la philo "réglages critiques dans le loader")
- Status `✅ Activé · 🤳 biométrie configurée` ou `○ Désactivé`
- Boutons contextuels via flow Promise-based `_demanderPin(titre, message, label)`
- Activation : saisie PIN x2 + `confirm()` natif pour la biométrie (le `confirm()` natif est OK ici, cas marginal one-shot)
- Modification (9:b) : biométrie OU ancien PIN d'abord, puis nouveau PIN x2
- Désactivation : `confirm()` puis biométrie OU PIN

**Intégration boot** — `main.js > initApp` après `UnlockGate.ouvrirGate()` :
```js
if (window.MyKTAMapPinLock && window.MyKTAMapPinLock.isEnabled()
    && !window.MyKTAMapPinLock.isUnlocked()) {
  await _splashEnd();
  await window.MyKTAMapPinLock.ouvrirGate();
}
```

**Pour bumper le `MAX_ATTEMPTS`** (= 5) : changer la constante en tête de pinLock.js. ⚠️ **Ne PAS exposer un bouton "Reset PIN" depuis le screen lockout** — bypass trivial. L'user qui oublie son PIN DOIT passer par le reset complet de l'app (= friction délibérée).

**Pour bumper le PIN format** (= 4-6 chiffres) : modifier `PIN_MIN` et `PIN_MAX` en tête de pinLock.js + adapter le validateur `_validatePinInput` + le keypad UI (max chiffres affichés en dots).

**À NE PAS faire** :
- ❌ Réintroduire un bouton "Reset PIN" depuis le lockout (bypass trivial)
- ❌ Stocker le PIN en clair (toujours `hashedPin` via SHA-256 + salt)
- ❌ Ajouter une recovery email (no backend, cohérent avec UnlockGate)
- ❌ Promettre que les données sont chiffrées (elles ne le sont pas — c'est explicite dans la doc et l'UI)

---

### 77. Mécanisme de licence pro — Licence-pro.json signée, servie par l'installation

4 patchs consécutifs qui construisent un mécanisme complet de **bascule community ↔ pro** côté community,
sans casser la philo offline-first ni l'audit réseau.

#### 77.1 Architecture

**Module unique** : `js/proLicense.js` (~280 lignes IIFE) → `window.MyKTAMapProLicense = { isPro, getData, getSource, forceRecheck }` (`getSource()` : `"server"` ou `null`).

Au boot très tôt (chargé juste après `js/copyright.js`, avant `themeManager.js`), le module :
1. Purge l'ancienne licence importée par l'utilisateur (`__mktm_pro_license_local__`, import retiré le 09/10/2026)
2. Lit le cache serveur `__mktm_pro_license__` — une licence **expirée** y est ignorée et purgée, hors ligne compris
3. Applique synchronement la classe `kta-instance-pro` sur `<html>` si la licence est active
4. Lance un fetch async `GET /Licence-pro.json?_=<ts>` (cache-bust) : signature, date et domaine vérifiés AVANT de
   mémoriser ; refusée ou absente (404) → cache purgé ; hors ligne / 5xx → cache conservé

**Pattern CSS de bascule** (cf §53 ThemeManager, même approche) : `.kta-licence-community` vs `.kta-licence-pro`.

- `.kta-licence-pro` : `display: none` par défaut
- `html.kta-instance-pro .kta-licence-community` : `display: none`
- `html.kta-instance-pro .kta-licence-pro` : `display: inline`

Tous les éléments à basculer sont wrappés dans l'un ou l'autre. Pas de changement DOM dynamique, juste CSS.

#### 77.2 Surfaces basculées en mode pro

| Surface | Community | Pro |
|---|---|---|
| Footer copyright loader (ligne 1) | © 2026 [karma.png] | © 2026 MyKTAMap — édition pro · Tous droits réservés |
| Footer copyright loader (ligne 2) | · CC BY-NC-SA 4.0 · Usage commercial interdit | · ✓ Licence professionnelle active |
| Footer contact loader | Instagram · mailto · 💼 Licence pro | Instagram · mailto (sans Licence pro) |
| Splash `#splashLicense` | Licence libre — usage non commercial | ✓ Édition professionnelle · Tous droits réservés |
| UnlockGate (gate + lockout) | Instagram · mailto · 💼 Licence pro | Instagram · mailto |
| NETWORK_AUDIT.html footer | © KARMA · CC BY-NC-SA 4.0 | © MyKTAMap — édition pro |

NETWORK_AUDIT.html embarque sa propre logique de détection inline (mini-script qui lit la classe sur `html`)
car la page est statique et peut être ouverte hors contexte de l'app principale.

#### 77.3 Format `Licence-pro.json` — licence SIGNÉE

```json
{
  "instance":     "pro",                              // REQUIS
  "license_hash": "MKTM-LIC-<32 hex chars>",          // nominatif
  "client":       "Acme SpeleSecours",
  "license_id":   "MKTM-2026-001",
  "license_type": "annual" | "test" | …,
  "domaines":     ["carto.club.org"],                 // REQUIS — noms d'hôte couverts ; "*" = licence de test
  "issued_at":    "2026-05-30",
  "valid_until":  "2027-05-30",                       // vérifié : expirée = refusée
  "signature":    "<base64>"                          // REQUIS — ECDSA P-256 / SHA-256, brute r||s
}
```

**Une licence n'active le mode pro que si** (`_verifierSignature`) : sa `signature` est valide pour la **clé
publique** embarquée (`CLE_PUBLIQUE_JWK`, WebCrypto), elle n'est pas expirée, et ses `domaines` couvrent
`location.hostname` (ou `"*"`). Forme signée = la licence **sans** `signature`, clés triées récursivement
(même canonisation côté émetteur). Sans WebCrypto (contexte non sécurisé), aucune licence n'est acceptée.
Vérifiée au fetch serveur (avant mémorisation) et au démarrage pour la licence mémorisée (retirée si invalide ou
expirée). La clé privée qui signe ne vit **jamais** dans ce dépôt
(`check-no-pro-leak.js` refuse `.pem`, `BEGIN … PRIVATE KEY`, JWK à champ `d`, `signer-licence.js`).

**Hash** : format `/^MKTM-LIC-[A-Fa-f0-9]{32}$/`. Le hash et la licence sont nominatifs (1 client/contrat).

🛡️ `scripts/check-licence.js` (pré-commit, bloquant) **exécute** la vérification avec une clé d'essai
substituée : signée valide / `*` acceptées ; altérée, sans signature, expirée, autre domaine, autre clé
refusées ; clé embarquée publique (pas de `d`, pas de PEM privé).

#### 77.4 Service Worker — bypass cache total

`sw.js > fetch handler` ajoute un bypass network-only pour `/Licence-pro.json` :

```js
if (/\/Licence-pro\.json(\?|$)/.test(reqUrl)) {
  event.respondWith(
    fetch(event.request, { cache: "no-store" })
      .catch(() => new Response("", { status: 404,
        headers: { "Content-Type": "application/json" } }))
  );
  return;
}
```

Pourquoi : l'état doit refléter la réalité serveur en temps réel. Si un déployeur retire son
`Licence-pro.json`, le mode pro doit s'éteindre au prochain check du PWA — pas être maintenu artificiellement
par un cache LRU stale.

#### 77.5 Profil : statut seulement — l'import par l'utilisateur est retiré (09/10/2026)

La section **« 💼 Édition professionnelle »** du profil n'apparaît que si l'installation sert une licence valide
(badge ✓ + « instance pro déployée »). Plus d'import ni de retrait : une licence importée sur un appareil
(source « locale », v1.28.4 → 09/10/2026) n'activait **aucune** fonction pro — la règle E exige une licence SERVEUR
pour charger les modules — et ne servait qu'à passer la gate community. `check-gate-instance.js` refuse son retour
(gate, profil, `importFile` / `removeLocal`). `_proHashShort` / `_proSourceLabel` : mort documenté, gardé exprès (`docs/DECISIONS_FERMEES.md`).

#### 77.6 Sécurité juridique

La licence est **signée** (ECDSA P-256, §77.3) ; sa validité juridique vient aussi du **contrat signé** entre
MyKTAMap et le client :
- Hash nominatif → reproduction = infraction contractuelle
- Cohérent avec la doctrine §36 UnlockGate « barrière sociale, pas pseudo-crypto »
- Le copyright légal reste dans `LICENSE` (CC BY-NC-SA) + `LICENSE_PRO.md` (côté repo pro privé)

#### 77.7 Confidentialité

AUCUNE nouvelle surface réseau côté community :
- Le fetch `/Licence-pro.json` est **same-origin** (déjà couvert par `connect-src 'self'`)
- Sur `myktamap.fr` (community pur) : le serveur retourne 404 → mode community préservé
- Pas de directive CSP ajoutée, pas de nouveau service tiers
- `connect-src` inchangé (même origine, `blob:`, tuiles OpenStreetMap)

Cf. `docs/NETWORK_AUDIT.md` entrée groupée v1.28.2 → v1.28.4 pour le détail audit.

#### 77.8 À ne PAS faire

- ❌ Réintroduire un import de licence par l'utilisateur (gate, profil) : il n'activait rien et ouvrait la gate
- ❌ Réintroduire la mention "💼 Licence pro" en mode pro (redondant — on est déjà pro)
- ❌ Logger ou exposer publiquement le `license_hash` (nominatif, à traiter comme un secret modéré)
- ❌ Casser la backward compat fetch serveur (les premiers déploiements v1.28.2/3 sont sans hash)

#### 77.9 Pour ajouter une nouvelle surface qui doit basculer

1. Identifier l'élément DOM à wrapper
2. L'envelopper soit dans `.kta-licence-community` (visible community, masqué pro) soit dans `.kta-licence-pro` (masqué community, visible pro)
3. Vérifier visuellement les 2 états en servant un `Licence-pro.json` (pile de test du pro, ou fichier posé à la racine)
4. Documenter dans la matrice §77.2 ci-dessus

#### 77.10 Licence absente, expirée ou refusée = installation fermée (09/10/2026)

Une installation qui déclare une connexion serveur (`serverConnection.state: "on"`, ou sa dernière config connue
hors ligne) **sans licence serveur valide** est en état « licence » (`ktaExtensions.js > etatDe`). `main.js` affiche
alors « Installation indisponible » (motif licence, `_motifBlocage`) **avant** les modules et la gate community.
🩸 Avant : pas de licence → pas de module → pas de gate déléguée → gate community, souvent déjà franchie → app
ouverte en mode community sur les plans et sessions gardés par le dernier utilisateur de l'appareil.

- Licence refusée par le **serveur** (`503 licence_invalide` de l'API pro, sauf `/api/health`) : le module la
  signale par `KtaExtensions.signaler("licence", raison)` → pastille « Licence refusée par le serveur (raison) »,
  jamais « Base de données : injoignable » ; la gate déléguée échoue → même écran fermé.
- **Hors ligne** : licence en cache encore valide → rien ne change (module + copie locale) ; expirée → fermée.
- Classe `html.kta-instance-reliee` (posée dès la dernière config connue) : splash et pied de page ne montrent
  jamais l'identité community d'une installation reliée, licence valide ou non.
- Garde-fou : `check-extensions.js` (blocage avant modules et gate, signal, purge du cache expiré, splash).

---

### 84. Hotfix CSS — Spécificité frontière community/pro (v1.30.1 — 2026-06-02)

**Lesson learned** sur la cascade CSS qui gère la bascule community ↔ pro (§77). Cas concret :
un bug v1.30.0 où le suffixe `-pro` du titre s'affichait côté community **alors qu'on est en
mode gratuit**. Documenté ici à la fois comme bug fix ET comme règle générale à respecter
dorénavant.

KARMA quote (signalement) :
> « je suis en -pro alors que je suis en mode gratuit »

#### 84.1 Le bug

L'animation reveal du titre (v1.30.0 / §83) avait posé cette CSS :

```css
.kta-titre-suffix-pro {
  display: inline-block;          /* ❌ Bug ici — spécificité = 0,0,1,0 */
  clip-path: inset(0 100% 0 0);
  animation: kta-titre-reveal 500ms cubic-bezier(...) forwards;
  animation-delay: 1300ms;
}
```

Et le HTML utilisait les 2 classes ensemble :

```html
<span class="kta-licence-pro kta-titre-suffix-pro">-pro</span>
```

Sachant que §77 pose :

```css
.kta-licence-pro {
  display: none;                  /* Spécificité = 0,0,1,0 */
}
```

**Résultat** : les 2 règles `display: ...` ont la **même spécificité** (1 classe chacune).
La cascade CSS applique alors la **dernière déclarée** = celle qui vient après dans la
feuille de styles. Comme `.kta-titre-suffix-pro` était déclarée plus bas dans `style.css` que
`.kta-licence-pro`, c'est `display: inline-block` qui gagnait → le suffixe `-pro` apparaissait
côté community.

#### 84.2 Le fix

Scoper l'override `display: inline-block` sous `html.kta-instance-pro` → spécificité **0,0,2,0**
> spécificité de `.kta-licence-pro` (0,0,1,0) → côté community, l'override n'est PAS appliqué :

```css
.kta-titre-suffix-pro {
  clip-path: inset(0 100% 0 0);
  animation: kta-titre-reveal 500ms cubic-bezier(...) forwards;
  animation-delay: 1300ms;
  /* PAS de display: inline-block ici → reste display: none côté community */
}

html.kta-instance-pro .kta-titre-suffix-pro {
  display: inline-block;          /* ✅ Override scopé pro uniquement, spécificité 0,0,2,0 */
}
```

#### 84.3 Comportement avant/après

| | Community v1.30.0 (buggué) | Community v1.30.1 (fixé) | Pro (inchangé) |
|---|---|---|---|
| Affichage du `-pro` | ❌ Visible | ✅ Masqué | ✅ Visible animé |
| Frontière respectée | ❌ Violation | ✅ Respectée | ✅ Respectée |

#### 84.4 Lesson learned — Règle générale

**TOUJOURS scoper sous `html.kta-instance-pro`** (ou `body.kta-instance-pro` selon contexte)
les overrides côté pro quand on touche à un élément qui porte une classe `.kta-licence-*`
ou qui est concerné par la cascade frontière community ↔ pro.

#### 84.5 Pattern à respecter dorénavant

❌ **À éviter** :

```css
/* Spécificité égale à .kta-licence-pro → "latest wins" = comportement aléatoire selon ordre */
.kta-titre-suffix-pro { display: inline-block; }
```

✅ **À faire** :

```css
/* Spécificité supérieure → override sûr côté pro uniquement */
html.kta-instance-pro .kta-titre-suffix-pro { display: inline-block; }
```

**Cas équivalents à scoper** (liste indicative, pas exhaustive) :

| Override | Spécificité requise |
|---|---|
| `display`, `visibility` sur un élément `.kta-licence-*` | `html.kta-instance-pro .ma-classe` minimum |
| Background/border d'un élément qui peut être masqué/montré selon mode | Idem |
| Contenu via `::before` / `::after` qui change entre community et pro | Idem |

#### 84.6 À NE PAS faire

- ❌ **Ré-introduire un `display: ...` sans scoping** sur une classe partagée avec
  `.kta-licence-community` / `.kta-licence-pro` — bug de spécificité garanti
- ❌ **Compter sur l'ordre de déclaration** dans `style.css` pour résoudre une cascade —
  c'est fragile, n'importe quel refactor CSS futur peut casser
- ❌ **Utiliser `!important`** pour forcer un override pro — anti-pattern, complique
  l'override inverse. Préférer la spécificité scopée
- ❌ **Réutiliser les classes `.kta-licence-community` / `.kta-licence-pro`** pour autre
  chose que la bascule community/pro — elles ont une sémantique stricte et un comportement
  CSS partagé
- ❌ **Tester uniquement côté pro** quand on ajoute un élément frontière — toujours vérifier
  les 2 modes (community pur + pro local via `Licence-pro.json`)

---

### 85. F1 — Export session anonymisé pour partage public (v1.31.7 — 2026-06-03)

> **Motivation** : KARMA voulait pouvoir partager un plan utile (structure + coordonnées
> + tags) à un tiers (collaborateur, plateforme externe, archive publique) **sans
> exposer les repérages personnels** — noms de POI sensibles ("entrée plombier rue X"),
> notes opérationnelles ("rdv 18h avec Jean"), historique de présence GPS daté, profil
> auteur. Sans anonymisation, exporter une session = transférer un dossier complet de
> PII gravées en JSON.

#### 85.1 Architecture

Helper unique `_anonymiserSession(session)` dans `js/sessionExporter.js` (juste avant
`_exportFull()`). Mute le payload **APRÈS** construction → la logique d'inclusion
(tracker, photos, structures, mesure) reste identique au mode normal, l'anonymisation
est une couche défensive optionnelle appliquée en dernier.

```js
// Toggle UI dans _renderFull() — onglet "Full" uniquement
<input type="checkbox" id="full_anonymize">

// Dans _exportFull(), après construction du `session` :
if (anonymize) {
  _anonymiserSession(session);
}
```

#### 85.2 Champs transformés

| Champ source | Transformation | Préservé pour |
|---|---|---|
| `editorPoints[].id` / `.nom` | `📍 POI <1er tag> #N` (compteur par premier tag ; sans tag : `📍 POI #N`) | Coordination terrain ("celui qu'on appelle 📍 POI salle #3") — codes uniques depuis v1.98.2 (l'ancienne table d'emojis ne connaissait qu'un tag sur 22 : codes en double) |
| `editorPoints[].description` | `""` | — |
| `editorPoints[].etat` | `"Non inspectée"` (valeur neutre par défaut) | — |
| `editorPoints[].profondeur` | `null` | — |
| `editorPoints[].date_update` | retiré | — |
| `roads[].id` / `.label` | `🛣️ Tracé #N` (compteur global) | Coordination |
| `roads[].description` | `""` | — |
| `zones[].id` / `.nom` | `⬛ Zone #N` (compteur global) | Coordination |
| `zones[].description` | `""` | — |
| `structures[].id` / `.nom` | `🏛️ Struct #N` (compteur global) | Coordination |
| `structures[].description` | `""` | — |

#### 85.3 Champs supprimés intégralement

- `session.tracker` (timeline GPS datée + path + position + startTs) — geo-historique
  daté = champ le plus révélateur. Retire la possibilité de recouper "qui était où à
  quelle heure".
- `session.user` / `session.userProfile` / `session.author` — nettoyage défensif au
  cas où un futur champ profil serait ajouté (aujourd'hui absent du format
  `devmap-session` v1.0 mais on prépare).
- `session.photosCount` / `session.photosTotalKB` — forcés à 0 car photos exclues
  (EXIF non strippé en MVP).
- **Photos elles-mêmes** : la checkbox `📸 Inclure les photos` est by-passée quand
  anonymize ON. Le chemin ZIP n'est pas pris → uniquement JSON pur. Raison : strip
  EXIF demande canvas re-encoding (lossy + complexe), reportable plus tard si KARMA
  veut une variante "anonyme avec photos".

#### 85.4 Champs préservés (utiles + non identifiants)

- `editorPoints[].x` / `.y` / `.tags` / `.level` / `.source`
- `roads[].type` / `.points` / `.level` / `.fromLevel` / `.toLevel` (graphe pathfinder anonyme)
- `zones[].type` / `.points` / `.level`
- `structures[].type` / `.points` / `.level`
- `session.measure` / `session.measureSurface` (mesures géométriques sans label)
- `session.type` / `.version` / `.date_export` (entête format)

#### 85.5 Marqueurs d'audit

```json
{
  "type": "devmap-session",
  "version": "1.0",
  "anonymized": true,
  "anonymizedAt": "2026-06-03T14:23:51.000Z",
  ...
}
```

→ Le destinataire peut détecter en re-import qu'il s'agit d'un payload anonymisé
(utile pour UX : afficher un bandeau "session importée en mode anonymisé" plutôt
qu'un onboarding standard). Pas encore exploité côté import en v1.31.7, mais le
marqueur est posé pour usage futur.

#### 85.6 Nom de fichier

Préfixe `session-anon-…` au lieu de `session-…` → quand le fichier traîne sur un
disque ou est forwardé par mail, le nom rappelle qu'il s'agit d'un payload
anonymisé (pas confondre avec un export complet de coordination équipe par ex).

#### 85.7 Périmètre v1.31.7 / hors périmètre

✅ Couvert : onglet **Full** uniquement de la modale Enregistrer la session, JSON pur.

❌ Non couvert (par choix MVP — extensible) :
- Onglet **Avancé** (`_exportAdvanced`) — pas de toggle équivalent. À ajouter si KARMA
  veut un usage massif.
- Onglet **Conversion** (`_exportConversion`) — vise la production de data layers
  internes, pas de partage public.
- Onglet **Export externe** (KMZ + GPX) — un KMZ anonymisé serait une feature
  distincte (toucherait `kmzExport.js` + `gpxExport.js`).
- **Strip EXIF photos** — canvas re-encoding nécessaire. Pour l'instant : photos
  forcées exclues quand anonymize ON.
- **Anonymisation côté import** — pas de validation que le payload reçu est bien
  anonymisé (le marqueur `anonymized: true` n'est pas vérifié). Le ré-import d'un
  payload anonymisé fonctionne normalement, juste les noms sont les codes.

#### 85.8 Mapping emoji → tag

Table `EMOJI_PAR_TAG` dans `_anonymiserSession` :

| Tag | Emoji |
|---|---|
| `aeration` | 💨 |
| `pa` | 🕳️ |
| `siphon` / `eau` | 💧 |
| `effondrement` | ⚠️ |
| `incertain` | ❓ |
| `chaufferette` | 🔥 |
| `baffle` | 🚧 |
| `lampe` | 🔦 |
| `echelle` | 🪜 |
| `fissure` | 💔 |
| `entree` / `sortie` | 🚪 |
| `explosif` | 💥 |
| `chantier` | 🏗️ |
| `gem` | 💎 |
| `graff` | 🎨 |
| `photo` | 📷 |
| (fallback / inconnu / sans tag) | 🎯 |

⚠️ Synchroniser avec `TAGS_BUILTIN` si nouveau tag ajouté. Pas de catastrophe si oublié
— le fallback 🎯 marche, juste moins explicite.

#### 85.9 À NE PAS faire

- ❌ **Ne pas appliquer l'anonymisation AVANT la construction du payload** — la logique
  d'inclusion (tracker, photos, structures, mesure) reste un seul code path qui
  marche pour les 2 modes. L'anonymizer est une transformation post-construction
  pure, idempotente sur ses propres sorties.
- ❌ **Ne pas tenter de strip EXIF en synchrone** — re-encoder une image via canvas
  est asynchrone (toBlob), lossy (JPEG re-compression), peut crasher en OOM mobile.
  Pour MVP : exclusion totale des photos quand anonymize ON.
- ❌ **Ne pas préserver `date_update`** — c'est un champ qui paraît anodin mais qui
  permet de recouper "quand l'utilisateur a édité tel point" → fuite d'activité.
- ❌ **Ne pas oublier de supprimer `tracker`** — c'est le champ le PLUS révélateur
  (geo-historique daté seconde par seconde). Toute extension future qui ajoute un
  sous-objet équivalent (ex: `lastSeen`, `activity`) doit ajouter son `delete` dans
  `_anonymiserSession`.

---

### 86. F2 — Mode incognito (v1.31.8 — 2026-06-03)

> **Motivation** : KARMA voulait pouvoir explorer un plan en garantie qu'**aucune trace
> ne reste localement** au close du tab — pour démo publique, prêt de session à un tiers,
> exploration d'un plan sensible qu'on ne veut pas voir réapparaître au boot suivant.
> Pattern : équivalent du "Nouvel onglet privé" du navigateur, mais limité à MyKTAMap.

#### 86.1 Architecture

Module unique `js/incognitoMode.js` chargé **SYNC tout en haut** d'`index.html`
(juste après `copyright.js`, AVANT `networkAudit.js` et tout autre module qui
pourrait écrire en `Storage` ou IDB). Sans cet ordre, des modules tournent et
écrivent leur état avant que le shim soit en place → fuite garantie.

```html
<script src="js/copyright.js"></script>
<script src="js/incognitoMode.js"></script>  <!-- doit être ici -->
<script src="js/proLicense.js"></script>
<script src="js/themeManager.js"></script>
<script src="js/networkAudit.js"></script>
...
```

Détection : `new URLSearchParams(window.location.search).get("incognito") === "1"`,
ou override `window._kta_incognito === true` (pour tests automatisés). Si pas
actif → le module pose juste `window.IncognitoMode = { active: false, launch }`
et `return` — zéro effet de bord en mode normal.

#### 86.2 Périmètre du blocage

| Surface | Stratégie | Pourquoi |
|---|---|---|
| `localStorage` | Shim `Storage.prototype.setItem/getItem/removeItem/clear/key/length` → `Map` in-memory partagée. **🩹 v1.31.8-fix1** : `getItem` whitelist `myktamap_unlock_v1` + `myktamap_unlock_attempts` pour read disque (UnlockGate UX + anti-bruteforce préservés). Writes restent shimés. | Reads bornés à la Map + whitelist (pas l'historique général disque) pour ne PAS fuir les préférences pré-incognito |
| `sessionStorage` | Idem (même prototype `Storage`) | Cohérent avec localStorage |
| IDB **writes** (`put`/`add`/`delete`/`clear`) | Shim `IDBObjectStore.prototype.*` → faux `IDBRequest` qui `onsuccess` immédiat | Modules qui attendent un callback success ne crashent pas |
| IDB **reads** (`get`/`getAll`/`openCursor`/`count`) | **Intacts** | `planRegistry` lit `myktamap_handles` (handles selfhost), `MyKTAMapPhotos` lit les photos déjà existantes — sinon l'app devient inutilisable |
| Cache Service Worker (assets statiques) | **Intact** | Ce sont les fichiers app, pas des données utilisateur |
| Cookies | N/A | MyKTAMap.fr n'en pose pas |

#### 86.3 Visuel — rappel permanent du contexte

3 signaux cumulés, sans bouffer d'espace écran :

1. **Bordure violette 3px** sur `<body>` via `box-shadow: inset 0 0 0 3px #a78bfa`.
   Pas de `border` qui pousserait le layout. Variante thème clair : `#7c3aed`
   (plus saturé pour contraste sur fond blanc).
2. **Badge `🕵️ INCOGNITO`** injecté par JS dans `#splashTitle` (splash de boot)
   ET `.loader-titre-nom` (vue loader / sélection plan — long séjour). Animation
   de pulse 3× au boot puis stable.
3. **Préfixe `🕵️ ` du `document.title`** du tab → reflet permanent même quand
   l'user est sur la carte (où aucun titre app n'est visible).
4. **Build version footer en lavande** (`color: #a78bfa`) au lieu du gris standard
   → signal supplémentaire que la session est éphémère.

#### 86.4 Activation

| Voie | Mécanisme |
|---|---|
| URL directe `?incognito=1` | Boot incognito (équivalent : lien partageable) |
| Bouton `🕵️ Démarrer en mode incognito` dans ⚙️ Réglages | Appelle `window.IncognitoMode.launch()` qui : (1) **🩹 v1.31.8-fix1** flush `SessionPersist.save({force:true})` pour persister la fenêtre principale ; (2) `window.open(url + '?incognito=1', '_blank', 'noopener')` |
| Test auto | Setter `window._kta_incognito = true` AVANT le chargement du module |

**Pas de toggle sur la fenêtre courante** — l'incognito doit démarrer DÈS le
boot pour shim avant que les modules n'écrivent. Toggler après coup serait
incohérent (les données déjà écrites resteraient).

**🩹 v1.31.8-fix1 — Flush défensif** : `launch()` force la sauvegarde de la
fenêtre principale AVANT d'ouvrir la nouvelle fenêtre incognito. Cas piégeux
sans le flush : l'user travaille, clique « Démarrer incognito », la fenêtre
principale a une modif non-saved (throttle main-thread-busy), il ferme la
fenêtre principale par mégarde → perte. Le `force:true` bypass le throttle.

#### 86.5 Cycle de vie

```
Boot incognito :
  1. URL ?incognito=1 → ACTIVE = true
  2. window.IncognitoMode = { active: true, launch, _memStorage, _origStorage, _origIdbStore }
  3. Shim Storage + IDB writes installé
  4. document.documentElement.classList.add("kta-incognito") → CSS bordure
  5. document.title = "🕵️ " + document.title
  6. Inject badge dans #splashTitle + .loader-titre-nom (après DOMContentLoaded + retry tardif 1500ms)
  7. App continue son boot normal → tous les writes sont in-memory ou no-op

Pendant la session :
  - setItem("k", "v") → Map.set("k", "v") (in-memory)
  - getItem("k") → Map.get("k") || null (jamais le disque)
  - IDB put(obj) → faux IDBRequest avec onsuccess immédiat
  - IDB get(k) → vrai retour disque (lecture OK)

Close du tab :
  - JS context disparaît → Map garbage-collectée → tout évanoui
  - Aucune persistance, aucune trace, aucune purge à faire
```

#### 86.6 API publique

```js
window.IncognitoMode = {
  active: boolean,           // état lecture-seule au boot
  launch: function() { ... } // ouvre nouvelle fenêtre ?incognito=1
};
// + en mode actif : _memStorage, _origStorage, _origIdbStore (debug)
```

**Convention** : les autres modules peuvent VOLONTAIREMENT consulter
`window.IncognitoMode.active` pour adapter leur UX (ex: masquer un bouton
"sauvegarder favori" qui n'a pas de sens). Pas obligatoire — le shim
intercepte de toute façon les écritures.

#### 86.7 Limites assumées

- ❌ **Une référence capturée tôt à `localStorage` ou `Storage.prototype`** par
  un module qui charge AVANT `incognitoMode.js` échapperait au shim. C'est
  pourquoi l'ordre dans `index.html` est CRITIQUE. Aujourd'hui seul
  `copyright.js` est avant — il ne touche pas storage.
- ❌ **Reads disque pré-incognito = bloqués SAUF whitelist**.
  - 🩹 v1.31.8-fix1 : whitelist explicite `READ_DISK_WHITELIST` dans le shim
    `getItem` pour 2 clés UnlockGate uniquement :
    - `myktamap_unlock_v1` (hash mdp community déjà validé)
    - `myktamap_unlock_attempts` (compteur anti-bruteforce)
  - Reads autres clés (thème, langue, prefs, sessions persistées, etc.) →
    toujours `null`. L'app boot en thème par défaut. Cohérent avec pattern
    onglet privé.
  - **Writes pour TOUTES les clés (whitelist incluses)** = toujours shimés.
    Un nouveau hash unlock entré en incognito n'écrira PAS sur disque (la
    fenêtre incognito le mémorise via Map in-memory pour le reload, mais
    rien ne persiste cross-tab).
  - Whitelist à garder MINIMALE — chaque ajout dilue la promesse "aucune
    trace pré-incognito lue". Pas de whitelist défensive "au cas où".
- ❌ **Service Worker fetch handler** n'est pas affecté. Les assets statiques
  cachés sont servis depuis le cache → c'est OK, pas des données utilisateur.
- ❌ **Crashes IDB silencieux** : un module qui attend une vraie écriture (ex:
  Mode Secours qui sauvegarde une photo opérationnelle) verra l'opération
  "réussir" mais la photo aura disparu au reload. UX potentiellement piégeuse →
  les modules sensibles devraient consulter `IncognitoMode.active` pour avertir
  l'utilisateur.

#### 86.8 À NE PAS faire

- ❌ **Ne pas changer l'ordre dans `index.html`** — `incognitoMode.js` DOIT
  rester juste après `copyright.js`. Bouger plus bas casse le contrat de
  base (shim avant écriture).
- ❌ **Ne pas appeler `_origStorage.setItem` depuis le shim** — ça écrirait
  pour de vrai. Le shim ne stocke QUE dans `_memStorage`.
- ❌ **Ne pas lire l'historique disque dans `getItem`** — `localStorage` avant
  incognito contient les vrais préférences user. Y accéder = fuite. La règle
  actuelle (`Map only`) est intentionnelle.
- ❌ **Ne pas suspendre les reads IDB** — `planRegistry` et `MyKTAMapPhotos`
  en dépendent pour le boot et l'affichage. Si on les bloque, l'app devient
  inutilisable et incognito perd son sens (l'user ne voit même pas son plan).
- ❌ **Ne pas ajouter un `Object.defineProperty(window, "localStorage", ...)`** —
  dans certains browsers le descriptor original est `[[Configurable]]: false`
  → throw. Patcher `Storage.prototype` (qui est partagé entre `localStorage`
  et `sessionStorage`) est la voie portable.
- ❌ **Ne pas implémenter un cleanup `beforeunload`** — la `Map` JS est GC'd
  au close du tab, c'est suffisant. Un cleanup explicite ouvrirait la porte
  à des bugs (lecture après nettoyage, race au unload).

#### 86.9 Périmètre v1.31.8 / hors périmètre

✅ Couvert :
- Boot via `?incognito=1` URL ou bouton dans Réglages
- Shim `Storage.prototype` (in-memory `Map`)
- Shim `IDBObjectStore.prototype` writes (no-op + faux IDBRequest)
- Visuel bordure + badge + titre + footer
- Variante thème clair

❌ Non couvert (extensible) :
- Whitelist `getItem` pour préférences UX read-only (thème, langue) — pour
  un boot incognito plus "agréable" qui hérite quand même de quelques préfs.
- Bandeau permanent en haut de l'app (jugé trop intrusif en MVP).
- Integration `IncognitoMode.active` dans modules sensibles (Mode Secours
  photos, sessionExporter avec avertissement) — devrait être ajoutée si KARMA
  veut un signal explicite côté UX.
- Persistence "soft" (memory survival entre reloads via `BroadcastChannel`) —
  pas dans le pattern incognito, à débattre.

---

## 80. Kill-switch anti-fuite (PlanDenylist, depuis v1.42.0)

### 80.1 Vision et menace adressée

**Menace** : un plan ZIP privé (cataphile, cavages sensibles) **fuite massivement** en dehors de son groupe de confiance (Telegram public, forum warez, etc.). Une fois diffusé, le ZIP est par nature impossible à retirer chez les destinataires. Mais l'auteur peut **réduire la propagation accidentelle** en empêchant son ouverture dans MyKTAMap.

**Réponse** : kill-switch client-side qui :
1. Télécharge une liste publique de SHA-256 révoqués (`/denylist.json`) au boot
2. Hash localement chaque ZIP au moment de son import
3. Si match → modale rouge bloquante + auto-purge du plan

**Doctrine privacy stricte (KARMA reco 3a)** : aucune empreinte n'est envoyée au serveur. Seule la liste publique est téléchargée, comparaison 100% client. L'auteur ne sait JAMAIS quels plans un user possède.

### 80.2 Architecture

| Composant | Fichier | Rôle |
|-----------|---------|------|
| Module kill-switch | `js/planDenylist.js` (~330 l, IIFE) | API publique `window.PlanDenylist` |
| Liste deny serveur | `denylist.json` (racine) | Format public `{version, updated, deny:[{sha256, reason, addedAt}]}` |
| Hook loader | `index.html > chargerZipFichier` | 11 lignes try/catch AVANT `extraireZip` |
| Hook générateur | `js/createConf.js > _chargerZipModifier` | Idem, mode « Modifier un plan existant » |
| Init au boot | `js/main.js` après `AlertChecker.check()` | Fetch initial async + cache 24h |
| Register SW | `sw.js > ASSETS_TO_CACHE` | `./js/planDenylist.js` ajouté |
| Bypass SW | `sw.js > fetch handler` | `denylist.json` → `cache:"no-store"` + fallback `{deny:[]}` offline |

### 80.3 API publique

```js
window.PlanDenylist = {
  init():           Promise<denylist>      // fetch initial + cache 24h
  isPlanDenied(blob): Promise<{denied, sha256, reason?, addedAt?, error?}>
  refresh():        Promise<denylist>      // force re-fetch (bypass cache)
  getDenylist():    denylist               // debug, snapshot mémoire
  computeSha256(blob): Promise<string>     // 64-char hex
  showDeniedModal(info, planId, onDismiss): void  // modale rouge bloquante
}
```

### 80.4 Format `denylist.json`

```json
{
  "version": 1,
  "updated": "2026-06-07T15:00:00Z",
  "deny": [
    {
      "sha256": "9a7ca242dfa4e3029ffd7bb7a759ba13d17b52976fdddc498c8ae8a448b53979",
      "reason": "Fuite publique constatée le 05/06/2026 sur Telegram",
      "addedAt": "2026-06-07T13:50:00Z"
    }
  ]
}
```

**Validation côté client** : regex stricte `/^[a-f0-9]{64}$/i` sur chaque `sha256`. Les entrées invalides sont silencieusement filtrées au parse (= ne bloquent jamais).

### 80.5 Cycle de vie

```
[Boot app]
   ↓
PlanDenylist.init()
   ↓
Cache LS hit ? ──── Oui → utilise immédiatement
   ↓ Non                 + refetch BG si > 24h
Fetch /denylist.json (cache:no-store)
   ↓
Parse + validation entrées
   ↓
Save LS { fetchedAt: now, payload }

[Import ZIP via loader OU générateur]
   ↓
PlanDenylist.isPlanDenied(zipBlob)
   ↓
SubtleCrypto.digest("SHA-256", blob)
   ↓
hash hex 64 chars
   ↓
Lookup linéaire dans _denylist.deny
   ↓
Match ? ──── Oui → { denied: true, reason, addedAt, sha256 }
   ↓ Non           → modale rouge + PlanRegistry.remove + reload
{ denied: false, sha256 }
   ↓
Pipeline normal (extraireZip → startImportedPlan)
```

### 80.6 Fail-safe modes

| Cas | Comportement | Justification |
|-----|--------------|---------------|
| Module non chargé | Hook absent → autorise | Backward-compat (vieille version d'app) |
| `SubtleCrypto` indispo (HTTP local) | Log warning + autorise | Dev local sans HTTPS — sinon impossible de bosser |
| Fetch denylist KO (offline / 404) | Utilise cache stale OU `{deny:[]}` | Pas de blocage massif si serveur down |
| Cache LS corrompu | Reset au prochain refetch | Robustesse |
| Hash exception | Log + autorise | Mieux qu'un blocage en faux positif |

→ **Doctrine** : un kill-switch qui bloque par erreur tous les plans est pire qu'un kill-switch qui laisse passer un plan fuité. Fail-safe → autorise par défaut.

### 80.7 Privacy & audit

- **0 envoi serveur** : `crypto.subtle.digest` est 100% local. Aucune empreinte n'est jamais transmise.
- **Liste publique** : `denylist.json` est lisible par anyone à l'URL publique. Audit trivial (genre `curl https://myktamap.fr/denylist.json`).
- **Cache local** : `localStorage["myktamap_denylist_cache"]` = `{fetchedAt, payload}`. Lisible en DevTools, supprimable par l'user pour forcer un refetch.
- **Pas de tracking** : aucun event analytique au check (succès OU échec). Le module est isolé.

### 80.8 UX modale `showDeniedModal`

- z-index 100000 (au-dessus de tout)
- Fond `rgba(15,5,5,0.92)` + backdrop-filter blur
- Box gradient rouge sombre, border `#d32f2f`, animation `kta-denylist-pulse 2s` (box-shadow rouge respirante)
- Header : émoji ⛔ 42px + titre « Plan révoqué » + sous-titre
- Bloc raison sur fond `rgba(0,0,0,0.35)` + border-left rouge
- Détails techniques : date ajout + SHA-256 tronqué (12 premiers + 8 derniers chars, format `abc123def456…ghi78901`) — anti-doxxing
- Bouton « Compris, supprimer ce plan » rouge `#d32f2f` → click :
  1. `PlanRegistry.remove(planId)` (si planId fourni — null pour générateur)
  2. Modale retirée
  3. `location.reload()` (repart propre)

### 80.9 Workflow KARMA pour révoquer un plan

```bash
# 1. Hash du ZIP fuité (CLI Linux/Mac/Git Bash Windows)
sha256sum plan-qui-a-fuite.zip
# → copier le hash hex 64 chars
```

```json
// 2. Éditer denylist.json sur le serveur (FTP) :
{
  "version": 1,
  "updated": "<ISO 8601 now>",
  "deny": [
    {
      "sha256": "<hash copié>",
      "reason": "<motif court visible par les users>",
      "addedAt": "<ISO 8601 now>"
    }
  ]
}
```

```
3. Push FTP serveur → propagation :
   - Immédiate pour les users qui rouvrent l'app (refetch background si cache > 24h)
   - Max 24h pour les autres (cache LS expire)
4. Optionnel : mentionner publiquement la révocation (forum, GitHub) pour transparence
```

**Pour révoquer côté instance pro (Docker self-host)** : éditer `denylist.json` du déploiement local. Pattern identique. Permet aux déployeurs de bloquer des plans spécifiques à leur communauté.

### 80.10 Limitations assumées

- **Byte-perfect uniquement** : modif 1 byte → nouveau hash. C'est OK pour fuite massive du ZIP exact, pas pour dérivation active. Friction max acceptable.
- **Plans serveur non couverts** : architecture serveur fetch par fichier, pas de ZIP unique → pas de hash possible. Si besoin de révoquer un plan serveur → simplement retirer le fichier côté serveur (404 = chargement échoue naturellement).
- **Chargement déjà en cours** : si l'user a déjà ouvert le plan AVANT la révocation, le chargement courant n'est pas interrompu. Purge au prochain ré-import. Acceptable car le plan est déjà sur l'appareil — la révocation empêche surtout la nouvelle propagation.
- **Décompression manuelle** : un attaquant technique peut extraire le ZIP, modifier les fichiers, recompresser avec un autre outil. C'est volontaire — barrière contre les non-techniques, pas contre les motivés.

### 80.11 À NE PAS faire

- ❌ **Envoyer le hash au serveur** pour check distant (= fingerprinting des plans owned, violation privacy)
- ❌ **Bloquer en cas d'erreur** (= un attaquant pourrait DDoS le serveur pour bloquer tous les imports légitimes)
- ❌ **Cacher l'icône `denylist.json`** côté serveur (= principe de transparence : audit publique = audit possible)
- ❌ **Cacher `denylist.json` dans le SW** (= retarderait la propagation des révocations)
- ❌ **Hash autre que SHA-256** (collision improbable, standard SubtleCrypto, hex 64 chars facile à comparer)
- ❌ **Réutiliser le LS_CACHE_KEY pour autre chose** (le module y dépose son cache, isolé)

### 80.12 Tests réels (v1.42.x)

KARMA a validé le mécanisme avec `plan_testban.zip` (hash `9a7ca242…b53979`) :
1. Hash ajouté à `denylist.json` côté repo
2. Push FTP serveur effectué
3. Import via loader → modale rouge ✅
4. Bouton « Compris, supprimer » → plan retiré + reload OK ✅
5. Re-import après retrait du hash de `denylist.json` → autorisation normale ✅

### 80.13 Audit boot des plans LOCAUX déjà importés (v1.42.3)

**Menace adressée** : un plan importé par l'user AVANT que KARMA ajoute son hash à `denylist.json` reste utilisable indéfiniment (le check d'import ne re-tourne pas). Solution : audit au boot.

**API** :
```js
window.PlanDenylist = {
  // ... v1.42.0-2
  auditPlansLocaux():    Promise<{audited, purged: [{id, name, sha256, reason, addedAt, purgedAt}]}>
  getPurgedAtBoot():     Array<purgeEntry>           // lit LS
  clearPurgedAtBoot():   boolean                     // efface LS
  showPurgedNotifModal(purgedList): void             // modale orange ⚠️
}
```

**Cycle de vie** :
```
[Boot app]
  ↓
PlanDenylist.init() → fetch denylist
  ↓
Si purges au boot précédent (LS) → showPurgedNotifModal (delay 800ms)
  ↓
setTimeout 2s (anti-blocage boot)
  ↓
auditPlansLocaux()
  ↓
denylist vide ? Oui → return { audited:0, reason:"denylist-empty" }
  ↓
Pour chaque plan type:"local" :
  ↓
  plan.sha256 cached ? Oui → check direct denyByHash[hash]
  Non → getBlob + computeSha256 + addOrUpdate({id, sha256}) pour cacher
  ↓
  Match denylist ? Oui → PlanRegistry.remove + push purges[]
  ↓
  Yield setTimeout(10ms) anti-freeze
  ↓
Si purges.length > 0 → LS.setItem(LS_PURGED_KEY) + showPurgedNotifModal
```

**Cache hash** :
- Champ `plan.sha256` ajouté au schema `PlanRegistry` (optionnel, persist via `localStorage["myktamap_plans"]`)
- Calculé à l'**import** via `chargerZipFichier > _cacheHashAfterLoad()` (utilise le hash déjà computed par `isPlanDenied`)
- OU calculé au **1er audit boot** si plan pré-v1.42.3 sans `sha256` → persisté pour les boots suivants
- Plans serveur (type:"server") : pas concernés, hash impossible (pas de ZIP unique)

**Performance** :
- Skip total si denylist vide (cas commun, 99% des sessions) → 0 charge
- Hash sequential async avec yield 10ms entre plans (anti-freeze main thread)
- Lookup O(1) via `denyByHash[sha256.toLowerCase()]` (au lieu de scan linéaire N)
- Cache hash → 1 seul calcul par plan dans sa vie

**UX modale orange** (`showPurgedNotifModal`) :
- z-index 99998 (juste sous denylist modale rouge à 100000)
- Couleur charte `#e9a13b` (orange ambré, vs rouge `#d32f2f` pour denied actif)
- Icône `⚠️` (vs `⛔`)
- Pas pulsante (moins urgent que denied)
- Liste : nom plan + motif + SHA-256 tronqué + date purge
- Bouton « Compris » `#e9a13b` → `clearPurgedAtBoot()` + remove modale (pas de reload)

**Persistance LS** :
- Clé `myktamap_denylist_purged_at_boot` = `Array<{id, name, sha256, reason, addedAt, purgedAt}>`
- Persiste entre boots → si user ferme l'app sans cliquer « Compris », ré-affichage au prochain boot
- Cumulé entre audits successifs (pas écrasé) si plusieurs vagues de révocations

**Fail-safe** :
- Si `PlanRegistry` indispo → return `{ reason: "no-registry" }`
- Si plan local sans blob (FS handle perdu, orphelin) → skip silencieux
- Si hash exception → log warning + skip ce plan
- Si `remove` exception → log + continue

### 80.14 Capture canvas OSM dans PDF Briefing pompiers (v1.42.5)

**Cible** : enrichir le PDF Briefing pompiers (v1.42.0 — texte+liens) avec une vraie image de carte OpenStreetMap.

**Lib externe vendored** : `lib/html2canvas.min.js` (~50 KB, BSD/MIT) — registered dans :
- `index.html` (après `lib/jspdf.umd.min.js`, defer)
- `sw.js > ASSETS_TO_CACHE`

**API** :
```js
async function _captureOsmCanvasForBriefing(scenario, plan): Promise<string | null>
  // Retourne dataURL JPEG q85 OU null si échec
```

**Architecture du render offscreen** :
1. Container div hidden 1200×800 (`position:fixed; left:-99999px; top:0; pointer-events:none`)
2. `L.map(cont, {dragging:false, keyboard:false, scrollWheelZoom:false, attributionControl:false, zoomControl:false, preferCanvas:true})`
3. `map.fitBounds(OsmView.getPlanGpsBbox(), {padding:[60,60], maxZoom:17})`
4. `L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {crossOrigin:"anonymous"})`
5. `L.rectangle(bbox)` jaune charte `#f4c542` semi-transparent (opacity 0.15)
6. `L.marker(center)` divIcon label « 📍 [Nom plan] » fond `#1a1f2e` + bordure jaune
7. Pour chaque équipe avec `surfaceGps` : `L.circleMarker` couleur PALETTE OTAN + divIcon label nom équipe
8. `await new Promise(resolve => { tileLayer.on("load", () => setTimeout(resolve, 600)); setTimeout(resolve, 7000); /* safety */ })`
9. `await window.html2canvas(cont, {useCORS:true, allowTaint:false, backgroundColor:"#ffffff", width:1200, height:800, scale:1})`
10. `canvas.toDataURL("image/jpeg", 0.85)`
11. Cleanup `map.remove()` + `cont.parentNode.removeChild(cont)`

**Intégration `_drawBriefingSurfacePage`** :
- Devenue **async** (auparavant sync). `await` ajouté aux 2 callers : `genererRapportPDF` + `genererBriefingPompiersPDF`.
- Tentative capture en début de page :
  ```js
  const imgData = await _captureOsmCanvasForBriefing(scenario, plan);
  if (imgData) {
    const imgW = pageW - 2 * margin;                  // 182mm A4
    const imgH = imgW * (800 / 1200);                 // 121mm (ratio 3:2)
    const maxH = pageH - y - 80;                      // garde 80mm pour reste
    const finalH = Math.min(imgH, maxH);
    const finalW = finalH * (1200 / 800);
    const offsetX = margin + (imgW - finalW) / 2;     // centré horizontal
    pdf.addImage(imgData, "JPEG", offsetX, y, finalW, finalH);
    y += finalH + 6;
    pdf.setFontSize(7); pdf.setTextColor(140);
    pdf.text("Vue OpenStreetMap : zone du plan (cadre jaune) + position GPS surface des equipes (cercles colores).", margin, y);
  }
  ```

**Fail-safe gracieux** :
- `html2canvas` non chargé → skip capture, fallback texte/lien (= v1.41.x)
- `OsmView.getPlanGpsBbox()` retourne null (pas de georef) → skip capture
- Tuiles OSM timeout (cellular très lent) → safety 7s puis capture quand même (carte partielle/vide)
- Exception html2canvas → catch, log, fallback texte
- `pdf.addImage` exception → catch, ne casse pas le PDF

**Limitations assumées** :
- Pas de plan rotated superposé dans la capture (= moins informatif visuellement que la modale Vue OSM). Nécessiterait accès à l'image source du plan (V1 : APP_CONFIG.image, V2 : tuiles) + projection 3-coin via `Leaflet.ImageOverlay.Rotated`. Reporté à v1.42.6+ si KARMA demande.
- Pas de POI markers (entrée 🚪, sorties urgence) dans la capture. Markers seraient en coords plan → nécessite projection plan→GPS via `OsmView._proj.planToLatLng()`. Reporté.
- Durée génération : 3-7s typique (fetch tuiles OSM + render html2canvas). Acceptable pour usage ponctuel (briefing pompiers = pas en boucle).

**Réutilisabilité future** :
- Le helper `_captureOsmCanvasForBriefing` est généralisable : `_captureOsmCanvas({bbox, markers, options}): Promise<dataURL>`. À factoriser si besoin pour Mode Histoire, partage social, etc.

---

### 87. Conditions d'utilisation (gate légale) + séquenceur de premier lancement (v1.56.0)

> **Motivation** : (1) protéger l'auteur en rappelant à l'utilisateur, dès le 1er lancement, que l'app est un **outil de repérage** et non une incitation à l'intrusion (accès anciennes carrières de Paris interdit — arrêté du 2 novembre 1955) ; (2) tuer le « spam » de popups qui se superposaient au 1er boot (proposition PIN + alerte + onboarding, 3 `setTimeout` non coordonnés).

#### 87.1 Séquenceur `js/firstRunFlow.js`

`window.FirstRunFlow.run()` — file **séquentielle** jouée **une fois** après le retrait du splash (`main.js > _splashEnd`). Chaque étape attend la **fermeture** de la précédente.

**⚠️ v1.56.4 — Ordre de boot complet** (« on lit et accepte les conditions AVANT de saisir un code », KARMA) :

0. ⚖️ **Conditions d'utilisation** — affichée par **`main.js > initApp` AVANT l'UnlockGate** (pas par le flow). Bug corrigé : déclenchée post-splash par le flow, la gate légale (z 99999) passait **derrière** l'UnlockGate (z 100100).
1. 🗝️ **UnlockGate** (mot de passe d'instance, ou écran « Bienvenue », §36.8) puis 🔐 **gate PIN** (si activé).
2. → `main.js` appelle **`FirstRunFlow.notifyBootGatesDone()`** une fois toutes les gates franchies.
3. La file du flow déroule alors : 🚨 **Alerte critique serveur** (`AlertChecker.notifySplashEnded(onDone)`) → ⚖️ étape légale (simple **filet**, no-op car déjà acceptée) → 🎓 **Visite guidée** (`Tutorial.ouvrir(onClose)`).

**Visite guidée proposée, pas imposée** (décision KARMA) : l'écran Bienvenue sans mot de passe la marque vue en entrant
(`Tutorial.markAsSeen`) ; elle ne s'ouvre que si elle y a été demandée (`UnlockGate.visiteDemandee()`), ou d'office au
1er lancement d'une instance où rien ne l'a marquée vue (mot de passe d'instance : l'écran ne la marque pas ; gate
déléguée ; licence qui contourne la gate). Elle reste lançable depuis 📖 Documentation.

**Le PIN n'est plus proposé au lancement**, pour personne (décision KARMA) : il s'active dans ⚙️ Configuration →
🔐 Code d'accès local (§43). La clé `myktamap_pin_proposal_done_v1` des appareils existants n'est plus lue.

**Pourquoi un signal explicite** (`notifyBootGatesDone`) et pas un poll du DOM : entre 2 gates il existe des **fenêtres sans overlay** (ex. ~2 s d'attente du check licence pro entre la légale et l'UnlockGate) pendant lesquelles un poll croirait la voie libre → le tutoriel partait pendant la saisie du code (race constatée au test). En **lockout** (unlock/PIN), `main.js` reste bloqué sur `ouvrirGate()` → le signal n'arrive jamais → la file ne démarre jamais (voulu). Un poll DOM (`#kta-legal-gate-overlay, #kta-unlock-overlay, #kta-pin-gate-overlay`, 250 ms) est conservé en 2e rideau après le signal.

Chaque module expose un **signal de fin** (Promise ou callback `onClose`/`onDone`) ; `firstRunFlow` les promisifie via le helper interne `_step(label, fn)` (résout immédiatement si module absent / étape non applicable → la file continue). Aucun déclencheur direct dans `main.js` : tout passe par un unique `FirstRunFlow.run()`.

`Tutorial.fermer()` déclenche le `onClose` une seule fois (défini **après** le `fermer()` initial de `ouvrir()` pour ne pas se déclencher à tort). Le cas **multi-alertes** (rare) ne bloque pas la file : `onDone` est appelé dès l'ouverture du sélecteur.

#### 87.2 Gate légale `js/legalGate.js`

`window.LegalGate = { isAccepted, ouvrirGate, ouvrirConsultation, TERMS_VERSION }`.

- **`ouvrirGate()`** → Promise, **bloquante** : case « J'ai lu et compris » + bouton « J'accepte » (désactivé tant que la case n'est pas cochée). Résout à l'acceptation, pose `localStorage["myktamap_terms_accepted_v1"] = TERMS_VERSION`.
- **Flag versionné** : `isAccepted()` compare la version stockée à `TERMS_VERSION` (const, actuellement `2` : garantie, secours, contenus partagés). **Bumper `TERMS_VERSION`** force un re-consentement de tous les utilisateurs si le fond des CGU change. ⚠️ Les harnais navigateur pré-acceptent les CGU en posant `myktamap_terms_accepted_v1` : la valeur doit suivre `TERMS_VERSION` (`scripts/smoke/`, et les tests navigateur du dépôt pro), sinon la gate bloque tout le parcours.
- **`ouvrirConsultation()`** : ré-affichage **non bloquant** (bouton ✕ / clic-fond), sans case à cocher. Câblé sur le lien ⚖️ « Conditions d'utilisation » du footer loader (`index.html`).
- **Sous-modale « texte intégral »** (z-index 100001) : arrêté du 2 novembre 1955 + question écrite Sénat n° 03710 (réponse du 05/06/2025), **constantes verbatim** dans le module (`ARRETE_1955`, `SENAT_QUESTION`, `SENAT_REPONSE`), précédées des trois clauses détaillées (traduites). Actes officiels → **hors droit d'auteur** (CPI L.122-5 2°).
- **i18n** : cadrage général `legal.*` traduit **fr / en / es** ; les **textes de loi restent en FR** (droit français, non traduits — décision KARMA). Mirror offline `docs/applications/CGU.md`.
- **Incognito** : le séquenceur **saute** la gate bloquante en incognito (le flag `localStorage` est shimé et ne persiste pas → sinon re-prompt à chaque session). Consultation footer reste dispo.

#### 87.3 À NE PAS faire

- ❌ Traduire les **textes de loi** (arrêté / Sénat) — droit français, reproduits verbatim en FR uniquement.
- ❌ Rendre la gate **non bloquante** au 1er boot (elle doit être acceptée — décision 4:a).
- ❌ Réintroduire des `setTimeout` de déclenchement direct dans `main.js` pour l'alerte / la visite guidée — tout passe par `FirstRunFlow`.
- ❌ Réimposer la visite guidée ou une proposition de PIN au premier lancement (décisions KARMA).
- ❌ Oublier le **signal de fin** si on ajoute une étape au flux — sans lui, la file se bloque sur cette étape.
