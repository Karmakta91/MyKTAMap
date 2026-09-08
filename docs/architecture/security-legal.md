# Architecture MyKTAMap — Sécurité : gates, PIN, audit réseau, légal, licence

> 🔑 **v1.90.6 (EXCLUSIF depuis v1.90.7) — le mot de passe d'instance, quand il existe, est le SEUL.**
> `data/index.json > config.accessHash` ouvre la gate ; **tant qu'il est publié, le code communautaire
> (`HASH_VALIDE`) n'ouvre plus cette instance.** 🩸 La v1.90.6 acceptait les deux — trou signalé par KARMA :
> le code communautaire est distribué largement (il ouvre la prod qui n'héberge rien), il aurait donc ouvert
> toute instance privée. Le refus est appliqué au submit ET au boot (révocation d'un accès communautaire
> hérité). Un club distribue le sien ; le code de l'auteur n'entre pas.
>
> 🔒 **v1.90.8 / v1.90.9 — AUCUNE licence pro ne contourne un `accessHash`.** Sur une instance protégée, ni
> la licence importée par l'utilisateur (`"local"`, v1.90.8) ni celle servie par l'instance (`"server"`,
> v1.90.9) n'ouvre la gate. 🩸 La licence serveur est fetchée pour TOUS les visiteurs : la laisser bypasser
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

**Headers copyright** dans les fichiers JS critiques : `main.js`, `utils.js`, `interface.js`, `pathfinder.js`, `planRegistry.js`, `sessionPersist.js`, `oomGuard.js`. Format `/*! MyKTAMap (c) 2026 Flavien VIDAL ... */`. Si quelqu'un copie un fichier isolé, le copyright le suit.

**Mentions visibles utilisateur** :
- Footer loader : `© 2026 Flavien VIDAL · CC BY-NC-SA 4.0 · Usage commercial interdit`
- Splash : signature `karma.png` (pseudo artistique, déjà en place)
- Meta tags `<head>` : `author`, `copyright`, `license`

**Pour ajouter un nouveau fichier JS** : ajouter le header copyright en tête (8 lignes max). Utile surtout pour les algorithmes métier (genre pathfinder).

**Phase 2.1 (build pipeline)** non encore en place — projet en vanilla JS sans bundler. À mettre en place via esbuild minification + bundle pour la version prod (le repo privé garde le source lisible). Attention : SW à mettre à jour pour pointer sur le bundle minifié au lieu de la liste `js/*.js`.

---

### 36. Unlock Gate — barrière communautaire d'accès (depuis v173)

Module `js/unlockGate.js` qui intercale un écran de saisie de mot de passe entre la fin du splash et le démarrage normal de l'app. Vérification 1 fois à la 1ère installation, mémorisé en localStorage ensuite, re-demandé après reset complet.

#### 36.1 ⚠️ Niveau de sécurité — barrière SOCIALE, pas une vraie auth

MyKTAMap est une PWA 100% client → tout le code HTML/JS/CSS est servi en clair par Nginx ET disponible publiquement sur GitHub (`Karmakta91/MyKTAMap`). Cette gate est efficace pour :
- ✅ Décourager les passants / robots d'indexation
- ✅ Cadrer "communauté" → "il faut connaître le code"
- ❌ NE PAS empêcher un attaquant motivé (hash dans le code → brute force offline trivial ; bypass `localStorage.setItem("myktamap_unlock_v1", "<hash>")` en F12 → 5 secondes)

**KARMA explicitement informé et a validé.** Le mdp est communiqué hors-bande aux utilisateurs (forum, message direct).

#### 36.2 Hash hardcodé (SHA-256)

Le mdp en clair n'apparaît PAS dans `unlockGate.js` — juste son hash SHA-256 calculé via `crypto.subtle.digest`. Pour bumper le mdp :
```bash
echo -n "<nouveau-mdp>" | openssl dgst -sha256
```
Mettre le résultat dans la const `HASH_VALIDE` de `unlockGate.js`. Au prochain boot, les users qui avaient l'ancien hash en localStorage seront re-demandés (le hash en LS ne matchera plus le nouveau).

⚠️ **Si on change le mdp** : il faut aussi changer la const `KTA_UNLOCK_PASSWORD_DISPLAY` dans `interface.js` (mdp en clair affiché dans la modale Reset). Ces 2 valeurs doivent rester synchronisées.

#### 36.3 5 tentatives + lockout permanent

Compteur persisté en `localStorage["myktamap_unlock_attempts"]` (résiste au reload).
- Tentatives 1-4 : message rouge "❌ Code incorrect. Tentatives restantes : N"
- Tentative 5+ : LOCKOUT permanent
  - Champ saisie masqué
  - Message "🚫 Trop de tentatives" + sous-texte "Accès verrouillé par sécurité." (ton pro depuis v1.26.3)
  - **PAS de bouton reset** depuis le lockout — sinon bypass trivial (reset → modale Reset affiche le mdp → l'user note → re-saisit → contourne le lockout). L'user qui ne connaît pas le code DOIT désinstaller l'app manuellement (long-press icône / vider cache navigateur / `localStorage.clear()` en F12).
  - Liens externes pour contacter l'auteur si l'user a légitimement perdu son accès : Instagram `@karma_kta` + `mailto:contact@myktamap.fr` (le simple lien vers `myktamap.fr` était trompeur — le site n'offre aucun canal de contact)

#### 36.4 Position dans le flow `main.js > initApp`

APRÈS `_splashEnd()`, AVANT `PlanRegistry.init()` et tout le reste :
```js
if (window.UnlockGate && !window.UnlockGate.isUnlocked()) {
  await _splashEnd();
  await window.UnlockGate.ouvrirGate();  // bloque jusqu'à unlock
}
```
- User authentifié (cas le plus fréquent = 2e boot+) : gate skip silencieusement, comportement v172 strictement préservé
- 1ère installation : splash 4s → gate → saisie → unlock → loader
- Lockout : `ouvrirGate()` ne résout JAMAIS la Promise → `await` reste bloqué pour toujours → l'app reste sur l'écran lockout

#### 36.5 Affichage du mdp dans la modale Reset

Constante `KTA_UNLOCK_PASSWORD_DISPLAY` dans `interface.js` (mdp en clair). Affichée dans la 1ère modale de confirmation de reset via un bloc jaune accent :
```
🗝️ Code d'accès requis au redémarrage
Après reset, l'app redemandera le code d'accès communautaire :
[F!sYs44!h4z!3J]   ← code en monospace, fond noir, user-select:all
Note-le ou copie-le avant de reset, sinon tu ne pourras plus rentrer !
```

Permet à un user **déjà authentifié** de reset proprement sans perdre l'accès. C'est le SEUL endroit du code où le mdp apparaît en clair (volontaire — sinon impossible à afficher).

`localStorage.clear()` de `viderCacheAppli` purge naturellement le flag `myktamap_unlock_v1` → la gate redemande au prochain boot. Pas besoin d'appeler `UnlockGate.lock()` explicitement.

#### 36.6 API publique `window.UnlockGate`

- `isUnlocked()` → bool — lit `localStorage["myktamap_unlock_v1"]`
- `isLockedOut()` → bool — true si attempts ≥ 5
- `ouvrirGate()` → Promise — résout `true` à l'unlock, NE RÉSOUT JAMAIS en lockout
- `lock()` → void — retire les flags (utilitaire, pas appelé par défaut)

#### 36.7 Workflow release / bump du mdp

À chaque release qui touche au mdp, **impératif** : afficher le nouveau mdp dans `version.json > notes` (en première puce, avec warning explicite) pour que les users qui mettent à jour le voient AVANT l'update. Sinon : update → cache PWA purgé → nouveau code chargé → gate apparaît → user bloqué car n'a pas noté le mdp.

Format suggéré pour la 1ère puce de v173+ :
```
🔐 IMPORTANT — Accès restreint communautaire activé. Si tu mets à jour,
l'app te demandera un code d'accès au prochain démarrage. Le code est :
F!sYs44!h4z!3J — note-le avant de mettre à jour !
```

#### 36.8 À NE PAS faire

- **Ne JAMAIS** réintroduire un bouton reset depuis le lockout (bypass trivial). Si un user perd son accès → désinstaller manuellement (= friction délibérée).
- **Ne PAS** exposer le mdp en clair via `window.UnlockGate.getPassword()` ou similaire (rendrait inutile le hash dans le code).
- **Ne PAS** bumper le mdp sans synchroniser HASH_VALIDE (unlockGate.js) ET KTA_UNLOCK_PASSWORD_DISPLAY (interface.js) ET la première puce de version.json.

---

### 40. Privacy & Audit — Module `networkAudit.js` (depuis v1.8.0, ajustements CSP en v1.8.1)

Module de transparence + vérifiabilité construit pour répondre à la méfiance légitime du milieu cataphile vis-à-vis des "backdoors" qui exfiltreraient les plans. **L'app étant 100% client-side, la collecte est techniquement impossible ; ce module rend ça vérifiable par l'utilisateur sans qu'il ait à nous croire sur parole.**

#### 40.1 Architecture

Module IIFE `js/networkAudit.js` (~350 lignes) chargé **EN DEUXIÈME** dans l'ordre des scripts (juste après `copyright.js` qui ne fait que `console.log`, et **avant tout module qui fait du fetch**). Ordre critique : si on inverse avec `debug.js` ou plus, les premiers `fetch()` passent sous le radar.

Mécanisme : monkey-patch des 5 API réseau du navigateur AVANT que tout autre code ne puisse les appeler :
- `window.fetch`
- `XMLHttpRequest.prototype.open` + `.send`
- `navigator.sendBeacon`
- `WebSocket` (constructor wrapper)
- `EventSource` (constructor wrapper)

Chaque appel est :
1. Loggué dans un **buffer circulaire de 500 entries** (RAM uniquement, pas localStorage)
2. Vérifié contre une **whitelist hardcodée**
3. Si paranoia ON + non-whitelisté → **bloqué AVANT d'atteindre le réseau** (Promise reject pour fetch, throw pour XHR/WS/SSE, return false pour sendBeacon)

#### 40.2 Whitelist (visible côté UI)

2 entrées hardcodées dans `WHITELIST_PATTERNS` (array de fonctions `(url) => boolean`) :

1. **Same-origin** : `new URL(url, location.origin).origin === location.origin` → autorise toute requête vers le domaine de l'app (asset HTTP, version.json, alert.json, data/*, docs/*, …)
2. **`https://www.gstatic.com/generate_204`** (literal exact) → ping connectivité no-cors, aucune donnée envoyée

`WHITELIST_HUMAN` exposé en string-array lisible affiché dans la modale 📖 Doc audit pour l'user.

#### 40.3 API publique `window.NetworkAudit`

- `getLog()` → `Array<Entry>` (copie immutable du buffer)
- `clear()` → vide le buffer
- `setParanoia(boolean)` → toggle + persistance `localStorage["myktamap_network_paranoia_v1"]` + hook `window._kta_majBadgeParanoia` pour le badge footer
- `isParanoia()` → état actuel
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
  status:    200,             // HTTP status OU "BLOCKED", "FAIL", "OPEN", "SENT"
  blocked:   false            // true si bloqué par paranoia
}
```

#### 40.4 UI (uniquement dans la modale ⚙️ Configuration du loader)

Section "🔒 Confidentialité & Audit" dans `#loaderConfigModal` avec :
- Bouton 📋 Voir le journal réseau → modale `#loaderNetLogModal` (tableau live + sticky header + scroll body + boutons 📋 Copier / 📥 Exporter / 🗑️ Vider)
- Bouton 📖 Que fait l'app sur le réseau ? → modale `#loaderNetDocModal` (lead + whitelist + comment vérifier + CSP + bouton 📄 Ouvrir doc complète → `docs/NETWORK_AUDIT.md`)
- Toggle 🔒 Mode hors-ligne strict (`label.kta-net-paranoia-toggle` avec accent orange)

**Badge `kta-net-paranoia-badge`** dans le footer du loader (`#loaderParanoiaBadge`) : visible uniquement quand paranoia ON, animation pulse douce, cliquable → ouvre la modale Configuration. Helper `window._kta_majBadgeParanoia()` sync le badge + la checkbox depuis l'état NetworkAudit.

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
| `ping` | `gstatic.com/generate_204` | gris |
| `external` | autre origine | rouge |
| `same-origin` | autre same-origin | bleu clair |
| `unknown` | erreur de parsing URL | gris |

Aide visuelle pour repérer rapidement les anomalies dans le journal (toute catégorie `external` autre que `ping` devrait alarmer).

#### 40.6 Mode paranoia — comportements précis

- **fetch** : reject avec `Error("[NetworkAudit] Bloqué par le mode hors-ligne strict : <url>")`
- **XHR** : throw même erreur dans `.send()` (le caller reçoit une exception synchrone)
- **sendBeacon** : retourne `false` (compat API native)
- **WebSocket** : throw dans le constructor wrapper
- **EventSource** : throw dans le constructor wrapper

Persistance : `localStorage["myktamap_network_paranoia_v1"] = "1"` quand actif. Pas de fallback si localStorage indisponible (incognito strict) → paranoia OFF par défaut.

⚠️ Si on ajoute un nouveau type d'API réseau (genre WebTransport, RTCPeerConnection) **il faut l'instrumenter** dans `networkAudit.js`, sinon il passe sous le radar.

#### 40.7 CSP côté serveur (docs/nginx-csp-config.conf)

Double protection : en plus du module JS, le serveur Nginx envoie un header `Content-Security-Policy` strict. Directives clés :
```
connect-src 'self' https://www.gstatic.com    ← LA garantie anti-exfiltration
script-src 'self' 'unsafe-inline'             ← compromis assumé (cf. ci-dessous)
style-src 'self' 'unsafe-inline'              ← idem (style="..." inline partout)
img-src 'self' data: blob:                    ← blob: nécessaire pour tuiles V2 ZIP
worker-src 'self' blob:                       ← Service Worker
frame-ancestors 'none'                        ← anti-clickjacking
```

Même si un attaquant injectait du JS malveillant, le **navigateur lui-même** refuserait l'envoi vers un domaine non-whitelisté. Vérifiable côté user via F12 → Network → Headers → `Content-Security-Policy`.

⚠️ **À déployer côté Nginx prod/dev** (toi-même, manuellement) — le fichier `docs/nginx-csp-config.conf` documente la directive complète + les autres headers de sécurité (`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`).

⚠️ Pas de `report-uri` / `report-to` : cohérent avec la promesse "aucune donnée n'est envoyée à un serveur tiers". Les violations CSP restent visibles côté user uniquement (DevTools).

#### 40.7.1 ⚠️ `'unsafe-inline'` sur script-src — compromis assumé

L'app utilise depuis toujours :
- Des blocs `<script>...</script>` inline dans `index.html` (handlers du loader, modales de confirmation, modales audit…)
- Des `onclick="..."` dans le HTML généré par `interface.js` (modales config, modales d'aide, etc.)

Une CSP `script-src 'self'` strict refuse tout ça. 3 options pour résoudre :

| Option | Effort | Sécurité gagnée |
|---|---|---|
| `'unsafe-inline'` ajouté | Aucun | -0 (garantie reste sur `connect-src`) |
| Hashes SHA-256 par bloc | Très haut (cauchemar maintenance, change à chaque tweak) | Marginal |
| Externalisation totale + suppression de tous les `onclick` | Refonte massive (~50+ sites) | Marginal |

**Décision** : on assume `'unsafe-inline'` sur `script-src` ET `style-src`. La garantie anti-exfiltration **ne vient pas de `script-src`**, elle vient de `connect-src 'self' https://www.gstatic.com` qui interdit physiquement au navigateur d'envoyer des données ailleurs, même si un attaquant injectait du JS.

Conditions qui rendent ce compromis safe pour CE projet :
- Aucun input user n'est jamais placé en `innerHTML` directement (tout passe par `textContent` ou `_escapeHtml`)
- Aucun contenu tiers / aucun iframe / pas de CDN externe
- Le HTML servi par Nginx est statique (pas de templating server-side qui pourrait injecter de l'input user)

⚠️ Si un jour on ajoute une feature qui fait `innerHTML = userInput`, **revoir cette décision** : on devra soit purifier strict (DOMPurify), soit basculer sur du nonce dynamique généré par Nginx.

⚠️ Pour les futurs développeurs : **ne JAMAIS faire `el.innerHTML = userInput` sans échappement**. Toujours `el.textContent = userInput` ou `el.innerHTML = _escapeHtml(userInput)`.

#### 40.8 Documentation utilisateur (docs/NETWORK_AUDIT.md)

Page de transparence détaillée (~300 lignes) servie en static depuis le SW (ajoutée à `ASSETS_TO_CACHE`). Contenu :
- Promesse en 1 ligne
- Modèle technique (PWA pure)
- Liste blanche commentée
- Comment vérifier toi-même (3 méthodes : journal interne / F12 / lecture source)
- Mode paranoia détaillé
- CSP expliqué
- Position de l'auteur

Accessible via le bouton 📄 dans la modale 📖 Doc audit (s'ouvre dans un nouvel onglet `noopener,noreferrer`, path same-origin donc OK même en mode paranoia).

#### 40.9 Pour ajouter une nouvelle URL à la whitelist (futur)

Si on doit ajouter un endpoint tiers légitime (ex : un CDN pour les polices Inter, un service de tuiles cartographiques) :

1. Ajouter le pattern dans `WHITELIST_PATTERNS` (tableau de fonctions)
2. Ajouter une ligne dans `WHITELIST_HUMAN` (description lisible)
3. Ajouter dans `docs/NETWORK_AUDIT.md` (tableau de la liste blanche complète)
4. Ajouter dans `docs/nginx-csp-config.conf` (directive `connect-src`)
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
- `ouvrirGate()` — affiche la gate UI, résout au unlock (jamais en lockout)

**Lockout** : 5 tentatives PIN ratées consécutives → lockout définitif (compteur persisté). Pour sortir : reset complet (`localStorage.clear()` via 💥 Tout réinitialiser efface aussi `myktamap_pin_v1`). Une biométrie ratée n'incrémente PAS `attempts` (WebAuthn gère son propre lockout natif device).

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

**UI Lockout** (`_afficherLockoutUI()`) — screen rouge dramatique :
- Pas de bouton de sortie (force l'user à reset via la home)
- Message "🚫 Trop de tentatives" + explication "Comment sortir ?" → ⚙️ Configuration → 💥 Tout réinitialiser
- Phrase en italique "Verrouillage de sécurité actif après plusieurs tentatives échouées." (ton pro depuis v1.26.3)

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

### 77. Mécanisme de licence pro — Licence-pro.json + import manuel (v1.28.2 → v1.28.5 — 2026-05-30)

4 patchs consécutifs qui construisent un mécanisme complet de **bascule community ↔ pro** côté community,
sans casser la philo offline-first ni l'audit réseau.

#### 77.1 Architecture

**Module unique** : `js/proLicense.js` (~280 lignes IIFE) → `window.MyKTAMapProLicense = { isPro, getData, getSource, importFile, removeLocal, forceRecheck }`.

Au boot très tôt (chargé juste après `js/copyright.js`, avant `themeManager.js`), le module :
1. Lit deux clés `localStorage` distinctes :
   - `__mktm_pro_license__` : cache du fetch serveur `/Licence-pro.json`
   - `__mktm_pro_license_local__` : licence importée manuellement via UI
2. Applique synchronement la classe `kta-instance-pro` sur `<html>` si l'une OU l'autre porte `instance: "pro"`
3. Lance un fetch async `GET /Licence-pro.json?_=<ts>` (cache-bust) pour confirmer/invalider le cache serveur
4. Le fetch serveur n'affecte **jamais** le cache local (sources strictement indépendantes)
5. Si les 2 sources sont actives, **serveur prime** (annonce officielle du déployeur > import perso)

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

#### 77.3 Format `Licence-pro.json`

```json
{
  "instance":     "pro",                              // REQUIS
  "license_hash": "MKTM-LIC-<32 hex chars>",          // REQUIS pour import manuel
  "client":       "Acme SpeleSecours",                // optionnel — futur affichage
  "license_id":   "MKTM-2026-001",                    // optionnel — traçabilité interne
  "license_type": "annual" | "perpetual" | "free-grimp", // optionnel
  "issued_at":    "2026-05-30",                       // optionnel
  "valid_until":  "2027-05-30"                        // optionnel
}
```

**Validation hash** : regex stricte `/^MKTM-LIC-[A-Fa-f0-9]{32}$/`. Génération côté KARMA :
`echo "MKTM-LIC-$(openssl rand -hex 16)"`. Le hash est nominatif (lié à 1 client/contrat).

**Backward compat** : les fichiers servis côté serveur SANS `license_hash` (déploiements legacy v1.28.2/3
faits avant l'introduction du hash) sont acceptés avec warning console seulement. L'import manuel en
revanche **exige** un hash bien formé (= toute licence livrée aux clients à partir de v1.28.4 doit en
contenir un).

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

#### 77.5 Import manuel via UI profil (v1.28.4)

Nouvelle section **« 💼 Édition professionnelle »** dans la modale **« 👤 Mon profil »** du loader (cf. §61
Profile UI). 3 états rendu dynamiquement par `_refreshProfileProSection()` dans `index.html` :

| État | Rendu |
|---|---|
| Community | Hint texte + bouton « 📂 Importer une licence pro » qui ouvre file picker `.json` |
| Pro via serveur | Badge ✓ + hint « instance pro déployée — aucune action requise » (pas de bouton) |
| Pro via local | Badge ✓ + hint + bouton « 🗑️ Retirer la licence locale » |

**Pipeline import** :
1. File picker accept `.json,application/json` → `FileReader.readAsText(file)`
2. Cap taille 50 KB (anti-spam)
3. `JSON.parse` (refus si erreur)
4. `_validateData(data, strictHash=true)` (refus si `instance !== "pro"` ou hash absent/mal formé)
5. `localStorage.setItem("__mktm_pro_license_local__", JSON.stringify(data))`
6. `_recomputeActive()` → re-render section + toast OOMGuard

Retrait : `localStorage.removeItem` + `_recomputeActive()`. La confirmation passe par un `confirm()` natif
(volontaire — cas marginal, format custom non justifié).

**Helpers internes** dans `index.html` (associés au modal profil) :
- `_proHashShort(hash)` : tronque pour affichage (`MKTM-LIC-abc123…3456`) — **non utilisé en v1.28.4** mais
  laissé en place pour usage futur (diagnostic, export profil, etc.)
- `_proSourceLabel(source)` : libellé humain — idem
- `_proSourceHint(source)` : phrase d'explication contextuelle (utilisée)

#### 77.6 Sécurité juridique

Mécanisme **purement cosmétique** côté technique. La validité juridique vient du **contrat signé** entre
MyKTAMap et le client :
- Hash nominatif → reproduction = infraction contractuelle
- Pas de vérification cryptographique (signature HMAC future possible si demande client institutionnel)
- Cohérent avec la doctrine §36 UnlockGate « barrière sociale, pas pseudo-crypto »
- Le copyright légal reste dans `LICENSE` (CC BY-NC-SA) + `LICENSE_PRO.md` (côté repo pro privé)

#### 77.7 Confidentialité

AUCUNE nouvelle surface réseau côté community :
- Le fetch `/Licence-pro.json` est **same-origin** (déjà couvert par `connect-src 'self'`)
- Sur `myktamap.fr` (community pur) : le serveur retourne 404 → mode community préservé
- L'import manuel utilise `FileReader` (lecture locale du disque) — le fichier n'est **jamais envoyé** au serveur
- Pas de directive CSP ajoutée, pas de nouveau service tiers
- `connect-src` reste `'self'` + `https://www.gstatic.com` (ping)

Cf. `docs/NETWORK_AUDIT.md` entrée groupée v1.28.2 → v1.28.4 pour le détail audit.

#### 77.8 À ne PAS faire

- ❌ Mélanger les 2 caches localStorage (server / local) — sources strictement indépendantes
- ❌ Modifier la doctrine "serveur prime sur local" sans accord (cohérent avec "annonce officielle du déployeur")
- ❌ Réintroduire la mention "💼 Licence pro" en mode pro (redondant — on est déjà pro)
- ❌ Logger ou exposer publiquement le `license_hash` (nominatif, à traiter comme un secret modéré)
- ❌ Casser la backward compat fetch serveur (les premiers déploiements v1.28.2/3 sont sans hash)

#### 77.9 Pour ajouter une nouvelle surface qui doit basculer

1. Identifier l'élément DOM à wrapper
2. L'envelopper soit dans `.kta-licence-community` (visible community, masqué pro) soit dans `.kta-licence-pro` (masqué community, visible pro)
3. Vérifier visuellement les 2 états en testant avec un `Licence-pro.json` posé localement ou importé via UI profil
4. Documenter dans la matrice §77.2 ci-dessus

#### 77.10 Voie d'accès UnlockGate via import de licence (v1.28.5)

Au premier chargement de l'app (= UnlockGate active, code communautaire requis), un **second canal
d'entrée** est désormais proposé : importer un fichier `Licence-pro.json` reçu par mail/canal privé.
Le mode pro est activé directement et la gate se ferme — pas besoin de saisir le code communautaire.

**Implémentation** (`js/unlockGate.js`, ~70 lignes ajoutées) :

- Dans `_creerOverlay()`, **sous** le formulaire historique du code (inchangé), ajout de 2 blocs :
  - Séparateur `<div class="kta-unlock-separator kta-licence-community">` avec libellé « ou »
  - Bloc `<div class="kta-unlock-licence-block kta-licence-community">` contenant un hint italique
    + bouton ambré « 📂 Importer ma licence pro » + `<input type="file" accept=".json">` masqué
- Dans `ouvrirGate()`, handler du bouton : ouvre le file picker, appelle
  `window.MyKTAMapProLicense.importFile(file)` (= **même API que §77.5 import profil**, validation
  stricte avec hash bien formé requis). Si OK :
  ```js
  localStorage.setItem(LS_UNLOCK, HASH_VALIDE);
  localStorage.removeItem(LS_ATTEMPTS);
  // fondu overlay + resolve(true)
  ```
- Si rejeté : message d'erreur inline `❌ Licence refusée : <error>` (sans incrémenter le compteur
  de tentatives échouées — l'import licence n'est PAS un essai de code communautaire raté)

**Doctrine** : « détenir une licence pro = canal légitime d'accès, pas besoin de re-saisir le code
communautaire à chaque reload ». Une fois la licence importée, le flag `LS_UNLOCK` est posé comme
si l'user avait tapé le code → la gate ne réapparaît pas au prochain boot. Si l'user retire ensuite
sa licence locale depuis le profil (§77.5), le flag `LS_UNLOCK` reste posé : pas de re-prompt
(« déjà passé une fois par un canal légitime »).

**Bascule auto** : les 2 blocs (séparateur + import) sont wrappés dans `.kta-licence-community`. Sur
instance pro serveur (`Licence-pro.json` détecté), ils sont masqués automatiquement via la cascade
CSS de §77.1 (`html.kta-instance-pro .kta-licence-community { display: none }`). Aucune action
spéciale dans le JS — réutilise le pattern existant.

**CSS dédié** (`css/style.css`, ~60 lignes mode dark + ~22 lignes variant thème clair) :

| Classe | Rôle |
|---|---|
| `.kta-unlock-separator` | Flex row avec 2 lignes + libellé « ou » |
| `.kta-unlock-separator-line` | Ligne horizontale subtile `rgba(255,255,255,0.10)` |
| `.kta-unlock-separator-text` | Libellé uppercase letter-spaced, gris muted |
| `.kta-unlock-licence-block` | Wrapper text-align center |
| `.kta-unlock-licence-info` | Hint italique gris-bleu |
| `.kta-unlock-licence-btn` | Bouton ambré `rgba(244,197,66,...)` border + hover saturé |

Variant thème clair : passage sur les variables `--kta-light-*` (cf §53 ThemeManager).

**À NE PAS faire** :

- ❌ Incrémenter `LS_ATTEMPTS` si l'import est rejeté — un essai d'import RATÉ n'est PAS un essai de code
  communautaire RATÉ. Sinon, un user qui essaie 5 fois d'importer un fichier invalide se retrouve en
  lockout sans avoir tapé le code une seule fois.
- ❌ Bypass `MyKTAMapProLicense.importFile(file)` — il assure la validation regex hash, le cap taille,
  l'écriture localStorage + le dispatch d'événement `mktm:license-changed`. Tout pipeline parallèle
  serait du code mort + risque de désynchronisation.
- ❌ Ouvrir le file picker sans masquer le compteur de tentatives au-dessus — UX confuse (« 5/5 tentatives
  utilisées » pendant qu'on essaie d'importer une licence n'a aucun sens). Solution actuelle : le hint
  italique du bloc précise le contexte différent.
- ❌ Permettre l'import depuis l'écran lockout — au-delà de 5 tentatives ratées du code communautaire,
  la gate refuse tout (cohérent avec §36.3 doctrine lockout définitif). L'import est dispo UNIQUEMENT
  sur la gate normale avant lockout. Volontaire : sinon bypass trivial du lockout.

#### 77.11 Pour étendre

**Si on veut ajouter une 3e voie d'accès** (genre code QR à scanner, signature WebAuthn, etc.) :

1. Ajouter le bloc HTML sous le bouton import dans `_creerOverlay()`, wrappé dans `.kta-licence-community`
2. Ajouter le handler dans `ouvrirGate()` — pattern identique : succès → set `LS_UNLOCK` + fade + resolve
3. **Ne pas** incrémenter `LS_ATTEMPTS` en cas d'échec (cohérent avec import)
4. Ajouter le bloc dans la matrice §77.2 des surfaces basculées
5. Documenter le canal dans `docs/NETWORK_AUDIT.md` si nouvelle surface réseau impliquée

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
| `editorPoints[].id` / `.nom` | `<emoji par tag> POI #N` (compteur par premier tag) | Coordination terrain ("celui qu'on appelle 💎 POI #3") |
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
  Mais si un mode "Hors-ligne strict paranoia" était combiné avec incognito, il
  faudrait vérifier l'interaction.
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
1. 🗝️ **UnlockGate** (code communautaire / import licence) puis 🔐 **gate PIN** — inchangées.
2. → `main.js` appelle **`FirstRunFlow.notifyBootGatesDone()`** une fois toutes les gates franchies.
3. La file du flow déroule alors : 🚨 **Alerte critique serveur** (`AlertChecker.notifySplashEnded(onDone)`) → ⚖️ étape légale (simple **filet**, no-op car déjà acceptée) → 🎓 **Onboarding** (`Tutorial.ouvrir(onClose)`) → 🔐 **Proposition PIN** (`MyKTAMapPinLock.proposerActivation(onClose)`).

**Pourquoi un signal explicite** (`notifyBootGatesDone`) et pas un poll du DOM : entre 2 gates il existe des **fenêtres sans overlay** (ex. ~2 s d'attente du check licence pro entre la légale et l'UnlockGate) pendant lesquelles un poll croirait la voie libre → le tutoriel partait pendant la saisie du code (race constatée au test). En **lockout** (unlock/PIN), `main.js` reste bloqué sur `ouvrirGate()` → le signal n'arrive jamais → la file ne démarre jamais (voulu). Un poll DOM (`#kta-legal-gate-overlay, #kta-unlock-overlay, #kta-pin-gate-overlay`, 250 ms) est conservé en 2e rideau après le signal.

Chaque module expose un **signal de fin** (Promise ou callback `onClose`/`onDone`) ; `firstRunFlow` les promisifie via le helper interne `_step(label, fn)` (résout immédiatement si module absent / étape non applicable → la file continue). `main.js` a **remplacé** les anciens déclencheurs éparpillés (proposition PIN à +800 ms, bloc tutoriel + `notifySplashEnded` dans `_splashEnd`) par un unique `FirstRunFlow.run()`.

⚠️ Le délai interne de 800 ms de `proposerActivation` a été **supprimé** (le séquenceur garantit qu'aucune autre modale n'est ouverte). `Tutorial.fermer()` déclenche le `onClose` une seule fois (défini **après** le `fermer()` initial de `ouvrir()` pour ne pas se déclencher à tort). Le cas **multi-alertes** (rare) ne bloque pas la file : `onDone` est appelé dès l'ouverture du sélecteur.

#### 87.2 Gate légale `js/legalGate.js`

`window.LegalGate = { isAccepted, ouvrirGate, ouvrirConsultation, TERMS_VERSION }`.

- **`ouvrirGate()`** → Promise, **bloquante** : case « J'ai lu et compris » + bouton « J'accepte » (désactivé tant que la case n'est pas cochée). Résout à l'acceptation, pose `localStorage["myktamap_terms_accepted_v1"] = TERMS_VERSION`.
- **Flag versionné** : `isAccepted()` compare la version stockée à `TERMS_VERSION` (const, actuellement `1`). **Bumper `TERMS_VERSION`** force un re-consentement de tous les utilisateurs si le fond des CGU change.
- **`ouvrirConsultation()`** : ré-affichage **non bloquant** (bouton ✕ / clic-fond), sans case à cocher. Câblé sur le lien ⚖️ « Conditions d'utilisation » du footer loader (`index.html`).
- **Sous-modale « texte intégral »** (z-index 100001) : arrêté du 2 novembre 1955 + question écrite Sénat n° 03710 (réponse du 05/06/2025), **constantes verbatim** dans le module (`ARRETE_1955`, `SENAT_QUESTION`, `SENAT_REPONSE`). Actes officiels → **hors droit d'auteur** (CPI L.122-5 2°).
- **i18n** : cadrage général `legal.*` traduit **fr + en** ; les **textes de loi restent en FR** (droit français, non traduits — décision KARMA). Mirror offline `docs/applications/CGU.md`.
- **Incognito** : le séquenceur **saute** la gate bloquante en incognito (le flag `localStorage` est shimé et ne persiste pas → sinon re-prompt à chaque session, cf. même parti pris que la proposition PIN §43). Consultation footer reste dispo.

#### 87.3 À NE PAS faire

- ❌ Traduire les **textes de loi** (arrêté / Sénat) — droit français, reproduits verbatim en FR uniquement.
- ❌ Rendre la gate **non bloquante** au 1er boot (elle doit être acceptée — décision 4:a).
- ❌ Réintroduire des `setTimeout` de déclenchement direct dans `main.js` pour l'alerte / l'onboarding / le PIN — tout passe par `FirstRunFlow`.
- ❌ Oublier le **signal de fin** si on ajoute une étape au flux — sans lui, la file se bloque sur cette étape.
