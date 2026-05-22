# 🔒 MyKTAMap — Audit réseau & Confidentialité

> Page de transparence technique. À jour pour la version **v1.9.2** (22 mai 2026).
>
> Ce document explique **exactement** ce que l'application fait sur le réseau,
> **comment vérifier toi-même** que rien ne fuit, et **comment activer le mode
> hors-ligne strict** si tu veux une garantie active côté navigateur.

---

## 🎯 La promesse en une ligne

**MyKTAMap est une application 100 % client-side. Aucune de tes annotations,
sessions, plans ou données personnelles n'est jamais envoyée à un serveur,
ni à un service tiers. Point final.**

C'est vérifiable **par toi-même** sans avoir à nous croire sur parole — la
suite du document t'explique comment.

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
| `<origin>/*` (HTML, JS, CSS, images, JSON) | `GET` | Au boot + cache PWA | Charger l'app | **Aucune** |
| `<origin>/version.json` | `GET` | Au boot, puis check périodique | Détecter une nouvelle version dispo | **Aucune** |
| `<origin>/alert.json` | `GET` | Au boot | Diffusion d'alertes publiques (incendie, fermeture site, etc.) | **Aucune** |
| `<origin>/data/<plan>/*` | `GET` | Charge d'un plan serveur | Lecture des fichiers d'un plan (image + JSON) | **Aucune** |
| `<origin>/docs/README_USER.md`, `<origin>/docs/AI_CONTEXT.md`, `<origin>/docs/NETWORK_AUDIT.*` | `GET` | Ouverture des modales Documentation / Aide IA / Audit | Affichage du contenu | **Aucune** |
| `<origin>/ping.html` | `GET` (same-origin, body lu) | Avant un reset complet, avant un Force update | Tester Internet + santé serveur MyKTAMap (DNS / SSL / Nginx, body attendu `"OK"`) | **Aucune** (GET sans paramètres, pas de cookies via `credentials: "omit"`, same-origin) |
| `blob:<origin>/<uuid>` | `GET` | Chargement des tuiles V2 d'un plan tuilé | Déréférencer une tuile JPEG depuis le ZIP **déjà en mémoire** dans le navigateur | **Aucune** (blob URL = référence locale au navigateur, ne sort pas) |
| `data:<mime>;base64,...` | `GET` | Icônes SVG inline, certains exports | Déréférencer une donnée encodée en base64 **dans le code de l'app** | **Aucune** (data URL = pas de fetch réseau réel) |

`<origin>` = le domaine sur lequel l'app est servie. Pour la prod c'est
`myktamap.is-underground.fr` (ou `myktamap.fr` après le 15 juillet 2026).
Pour dev : `devmap.is-underground.fr`. Sur ton réseau local en
développement : `localhost` ou IP locale.

**Aucun `POST`, `PUT`, `PATCH`, `DELETE`, `sendBeacon`, `WebSocket`,
`EventSource` ou n'importe quelle autre méthode d'envoi de données vers
un serveur n'est jamais émise par l'app.** Si un jour ça change, ce
fichier sera mis à jour en conséquence et la version sera bumpée.

### À propos du ping `<origin>/ping.html` (depuis v1.9.3)

**Avant v1.9.3** : l'app utilisait `https://www.gstatic.com/generate_204`
(endpoint Google) pour détecter Internet. **Depuis v1.9.3**, l'app utilise
**uniquement** un fichier `/ping.html` servi sur **le même domaine que
l'app** (same-origin) :

- Prod : `https://myktamap.is-underground.fr/ping.html`
- Dev : `https://devmap.is-underground.fr/ping.html`
- Future prod : `https://myktamap.fr/ping.html`

L'URL est résolue dynamiquement via `location.origin + "/ping.html"`.
Le body attendu est exactement `"OK"`.

**Pourquoi ce changement ?** Plus aucun appel externe vers un service
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

Si tu préfères ne pas faire ce ping du tout, **active le mode hors-ligne
strict** (cf. plus bas) : il sera bloqué comme tout autre appel non
local.

---

## 🔍 Comment vérifier toi-même (3 méthodes)

### Méthode 1 — Le journal réseau intégré (le plus simple)

L'app loggue **en temps réel** toutes ses requêtes réseau dans un
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
- Si elle a été bloquée par le mode hors-ligne strict

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

## 🛡️ Le mode hors-ligne strict (paranoia opt-in)

Si la liste blanche te suffit pas et que tu veux une **garantie active
côté navigateur**, active le **Mode hors-ligne strict** :

1. **Page d'accueil → ⚙️ Configuration**
2. Section **🔒 Confidentialité & Audit**
3. Coche **🔒 Mode hors-ligne strict**

Une fois activé :
- **Toute requête sortante non-whitelistée est interceptée et bloquée
  AVANT même d'atteindre le réseau** (le navigateur reçoit une exception,
  pas un timeout).
- Un badge orange `🔒 PARANOIA` apparaît dans le footer de la page d'accueil
  pour te rappeler que le mode est actif.
- L'app continue de fonctionner normalement (annotations, calculs, exports
  PNG/KMZ, navigation, multi-niveau, itinéraire, tracker… tout ce qui ne
  nécessite pas de réseau).
- Les seules choses qui ne marcheront plus :
  - La **détection automatique de mise à jour** (puisque `version.json` est
    bloqué — sauf qu'il est en `<origin>` donc whitelisté par défaut)
  - Les **plans serveur** que tu n'as pas encore mémorisés (mais ils sont
    en same-origin donc whitelistés aussi)
  - Le **ping `<origin>/ping.html`** avant un reset / force update

Le toggle est **persistant** : il survit aux reloads et aux fermetures
d'onglet, jusqu'à ce que tu le décoches manuellement (ou que tu fasses
un reset complet via 💥 Tout réinitialiser).

### Différence avec le mode `Avion` de ton OS

Le mode Avion coupe le WiFi/4G/5G entièrement. Le mode hors-ligne strict
de MyKTAMap, lui, **te laisse une connexion fonctionnelle** pour le reste
de ton appareil (autres apps, navigateur) mais bloque uniquement les
appels que MyKTAMap pourrait faire. Tu peux donc faire des recherches
web en parallèle pendant que MyKTAMap reste isolée.

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

La directive clé est `connect-src 'self';` — le
navigateur n'acceptera pas d'envoyer des données ailleurs.

Le fichier de configuration Nginx exact est versionné dans le dépôt sous
`docs/nginx-csp-config.conf` (visible à toute personne ayant accès au
code).

---

## 🧰 Stockage local — où vivent tes données

Toutes tes données sont **strictement locales** à ton appareil et à ton
navigateur. Tu peux les inspecter et les supprimer toi-même via `F12` :

| Espace | Contenu | Comment l'inspecter |
|---|---|---|
| **localStorage** | Préférences (`debugMode`, `perfPreset` par plan, `unlock gate`, alertes acquittées, préfs d'évitement itinéraire, paranoia, etc.) | F12 → Application → Local Storage |
| **IndexedDB → `myktamap_handles`** | Handles FS Access API (Chrome desktop) + blobs ZIP des plans mémorisés (mobile/Safari/Firefox) | F12 → Application → IndexedDB |
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

## 🤝 La position de l'auteur

> *Je suis cataphile depuis 2016. Je connais la culture, et je sais que la
> méfiance envers une appli qui aurait une backdoor pour exfiltrer les
> plans est totalement légitime. C'est pour ça que j'ai conçu MyKTAMap
> comme une PWA 100 % client-side dès le départ : ce n'est pas un choix
> a posteriori pour rassurer, c'est l'architecture même de l'app. Il n'y
> a tout simplement aucun endroit côté serveur où tes données
> pourraient atterrir, parce qu'il n'y a aucun code applicatif côté
> serveur. Tout est conçu pour être vérifiable. Si tu trouves quoi que
> ce soit qui contredit ce document, contacte-moi directement via le
> site officiel — je corrigerai immédiatement.*
>
> — **KARMA**, auteur de MyKTAMap

---

## 📋 Historique des changements de ce document

| Version | Date | Changement |
|---|---|---|
| v1.9.2 | 22/05/2026 | Polish post-refonte UI. **Aucune modification du module Privacy & Audit** ni de sa whitelist. Document re-vérifié et validé conforme — la promesse 100% client-side reste inchangée. Mise à jour cosmétique de la modale d'audit réseau pour matcher la nouvelle charte (élargissement PC, alignement du loader, etc.). |
| v1.9.1 | 21/05/2026 | Refonte UI majeure — nouvelle interface par défaut. **Aucune modification du module Privacy & Audit** ni de sa whitelist. Le module `networkAudit.js` continue de tracer 100% des requêtes réseau, et la liste blanche reste identique (`same-origin`, `gstatic.com/generate_204`, `blob:`, `data:`). Document re-vérifié conforme. |
| v1.8.1 | 21/05/2026 | Consolidation Privacy & Audit : page d'audit en HTML formaté (au lieu de markdown brut intercepté par le SW), whitelist élargie à `blob:` et `data:` (références locales), classification `local-blob`/`local-data` distincte de `external`, CSP ajustée (`'unsafe-inline'` sur `script-src` + `blob:` sur `connect-src`), modale Configuration responsive PC 2 colonnes, fixes débordements UI. |
| v1.8.0 | 21/05/2026 | Création initiale du document. Module `networkAudit.js`, Mode hors-ligne strict, CSP Nginx. |

---

## 📬 Signaler une fuite ou un problème

Si tu observes **n'importe quelle requête réseau** émise par MyKTAMap
qui ne figure pas dans la liste blanche ci-dessus, contacte l'auteur
immédiatement via [myktamap.is-underground.fr](https://myktamap.is-underground.fr).
Le document sera corrigé et le code patché en priorité absolue.

---

*Dernière mise à jour : 22 mai 2026 — v1.9.2 (Privacy & Audit inchangé depuis v1.8.1)*
