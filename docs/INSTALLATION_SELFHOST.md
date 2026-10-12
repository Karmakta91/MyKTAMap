# 🛠️ MyKTAMap — Installation auto-hébergée (édition communautaire)

> **Public visé** : pros / structures (SSF, GRIMP, clubs spéléo, mairies de
> sites souterrains, etc.) qui veulent **héberger eux-mêmes l'instance
> MyKTAMap communautaire**, en intranet ou sur un domaine public.
>
> **Ce que ce document couvre** : installation manuelle sur un serveur
> Linux (Debian / Ubuntu / Rocky / RHEL), sans Docker, avec Nginx + TLS.
> Cas couverts : **réseau isolé** (certif auto-signé local) et **internet**
> (Let's Encrypt).
>
> **Les autres guides** :
> - **Avec Docker** (une commande, HTTPS auto-signé compris, aussi sur Raspberry Pi ou NAS) :
>   [Installer avec Docker](applications/DOCKER_INSTALL.md).
> - **Proposer vos plans** à vos utilisateurs (liste des plans, sous-titre, mot de passe d'accès, mode
>   consultation) : [Héberger une instance avec ses plans](applications/SELFHOST.md) — valable quelle que soit
>   l'installation.

---

## 📡 Vue d'ensemble — comment ça s'articule

```
┌─────────────────────────────────────────────────────────────────────────┐
│                       POSTES UTILISATEURS                                │
│   PC bureau · Smartphone secours · Tablette terrain · PC chef Op        │
│   ─────────────────────────────────────────────────────────────         │
│   Chacun a son propre navigateur (Chrome / Safari / Firefox / Edge)     │
│   et stocke EN LOCAL :                                                  │
│     • Cache PWA (assets app)         · Service Worker                   │
│     • localStorage (préférences)     · IndexedDB (sessions, photos,     │
│                                         scénarios Mode Secours)         │
└──────────────────────────┬──────────────────────────────────────────────┘
                           │
                           │  HTTPS (TLS 1.2 / 1.3)
                           │  Port 443
                           │
              ╔════════════▼═════════════╗
              ║  DNS → IP serveur        ║   ← Let's Encrypt (Internet)
              ║                          ║      OU
              ║  myktamap.intranet       ║   ← CA locale + cert auto-signé
              ║  myktamap.votre-dom.fr   ║      (poste client : CA à installer)
              ╚════════════╤═════════════╝
                           │
┌──────────────────────────▼──────────────────────────────────────────────┐
│                       VOTRE SERVEUR                                      │
│                                                                          │
│   ┌──────────────────┐                                                  │
│   │  Nginx           │  ← reverse proxy + TLS                           │
│   │  (port 443)      │  ← headers de sécurité (CSP, HSTS, ...)          │
│   │                  │  ← logs (access + error)                         │
│   └────────┬─────────┘                                                  │
│            │                                                             │
│            │ sert en statique :                                         │
│            ▼                                                             │
│   /var/www/myktamap/                                                    │
│   ├── index.html             ← entrée PWA                               │
│   ├── sw.js                  ← Service Worker (no-cache HTTP)           │
│   ├── manifest.json                                                     │
│   ├── version.json           ← détection updates (no-cache)             │
│   ├── alert.json             ← alertes publiques opt. (no-cache)        │
│   ├── css/, js/, lib/, icon/ ← assets versionnés (cache long)           │
│   ├── data/                  ← VOS PLANS (config + images + JSON)       │
│   │   ├── index.json         ← liste des plans dispo                    │
│   │   └── <plan>/...                                                    │
│   └── docs/applications/     ← docs lues par l'app (guide, audit)       │
│                                                                          │
│   ⚠️ AUCUN backend, AUCUNE base de données, AUCUN runtime serveur.      │
│      C'est juste un dossier de fichiers statiques.                      │
└─────────────────────────────────────────────────────────────────────────┘
```

**Lecture rapide** :

- Le serveur sert **uniquement des fichiers statiques**. Toute la logique
  métier tourne dans le navigateur de chaque utilisateur.
- Les sessions de travail (annotations, photos POI, scénarios Mode
  Secours, etc.) **ne remontent jamais au serveur** — elles vivent dans
  `localStorage` + `IndexedDB` côté utilisateur.
- Cela veut dire : (a) **votre serveur est minimaliste** (Nginx tient
  largement sur 512 Mo de RAM), (b) **la confidentialité est par
  construction** (rien à exfiltrer côté serveur, il n'y a rien à
  exfiltrer), (c) **l'utilisateur reste responsable** d'exporter ses
  sessions s'il veut les conserver / les partager.

---

## 0. Avant de commencer — soyons honnêtes

MyKTAMap **édition communautaire** est une **PWA statique** (HTML + CSS + JS,
100 % offline-first). Concrètement, l'auto-héberger revient à servir un
dossier de fichiers statiques derrière un serveur HTTPS. **Pas de
backend, pas de base de données, pas de runtime Node/PHP/Python.** C'est
volontaire : ça reste auditable, ça tient en main, ça résiste au temps.

**Avantages de l'auto-hébergement** :

- 🛟 Vos plans et données restent **chez vous**, sur votre infra
- 🔌 Fonctionne en **réseau isolé** (intranet refuge, PC poste de secours
  surface sans Internet, etc.) après le premier déploiement
- 🆓 **Aucun coût récurrent** côté MyKTAMap — c'est votre serveur, votre
  bande passante, votre certif TLS

**Limites à connaître** :

- ⚠️ **Vous êtes responsable des mises à jour** de l'app (cf. §8). Le code
  évolue vite (cf. journal de versions), et certaines releases corrigent
  des bugs de stabilité mobile. Une instance figée dans le temps va finir
  par accumuler des problèmes.
- ⚠️ Vous êtes aussi responsable des **mises à jour de l'OS, de Nginx,
  d'OpenSSL** côté serveur. C'est du sysadmin classique mais c'est sur
  vous.
- ⚠️ Le **code reste sous licence CC BY-NC-SA 4.0** — usage non commercial,
  partage à l'identique, attribution requise. Si votre usage est
  commercial (formation payante, prestation facturée incluant l'outil,
  etc.), il faut une **licence pro** — contact `contact@myktamap.fr`.

---

## 1. Prérequis

### 1.1 Côté serveur

| Composant | Version minimale conseillée | Notes |
|---|---|---|
| OS | Debian 12 / Ubuntu 22.04 / Rocky 9 / RHEL 9 | Tout Linux récent fait l'affaire |
| RAM | 512 Mo | C'est du statique, Nginx tient très bien |
| Disque | 200 Mo libre | L'app pèse < 20 Mo, le reste = logs / plans embarqués |
| Nginx | ≥ 1.20 | Pour `http2` natif et la syntaxe SSL moderne |
| OpenSSL | ≥ 1.1.1 (3.x recommandé) | Pour TLS 1.2/1.3 et la génération de certifs |

### 1.2 Côté décision

Avant l'install, vous devez avoir choisi :

- **Le nom DNS** sous lequel l'app sera servie
  - Public Internet : `myktamap.votre-domaine.fr` (ou autre)
  - Intranet : `myktamap.local`, `secours.intranet`, `cataphilie.lan`,
    une IP fixe `https://192.168.1.42`, etc.
- **Le type de certificat TLS** (voir §3) :
  - **Let's Encrypt** si l'instance est accessible depuis Internet
    (= certificat reconnu par tous les navigateurs, gratuit, auto-renew)
  - **OpenSSL auto-signé** si l'instance est en réseau isolé
    (= il faudra **distribuer le certificat racine** aux postes clients,
    sinon avertissement « connexion non sécurisée » à chaque visite)
- **Où récupérer l'app** : voir §4

> 💡 **Pourquoi imposer HTTPS sur une instance interne ?** Parce que
> MyKTAMap est une **PWA** : la PWA-isation (cache offline, install sur
> écran d'accueil, Service Worker) **exige HTTPS**, sans exception, sauf
> sur `localhost`. Sans TLS, c'est juste un site web classique qui ne
> peut pas s'installer, ne fonctionne pas hors ligne, et perd 80 % de son
> intérêt.

---

## 2. Installation de Nginx

### 2.1 Debian / Ubuntu

```bash
sudo apt update
sudo apt install -y nginx openssl
sudo systemctl enable --now nginx
```

### 2.2 Rocky / RHEL / Alma

```bash
sudo dnf install -y nginx openssl
sudo systemctl enable --now nginx
sudo firewall-cmd --permanent --add-service=http
sudo firewall-cmd --permanent --add-service=https
sudo firewall-cmd --reload
```

### 2.3 Vérification

Visitez `http://<IP_serveur>` depuis un navigateur sur le même réseau —
vous devez voir la page « Welcome to nginx! » par défaut. Si vous obtenez
une erreur de connexion, vérifiez votre firewall (ufw / firewalld) et
que Nginx écoute bien sur le port 80 (`ss -tlnp | grep :80`).

---

## 3. Génération du certificat TLS

Choisissez **A** ou **B** selon votre contexte. Vous pouvez changer plus
tard si besoin (passer d'auto-signé à Let's Encrypt = juste un coup de
`certbot`).

### 3.1 Option A — Let's Encrypt (instance accessible depuis Internet)

> ✅ **Recommandé** dès que possible : certificat reconnu par défaut sur
> tous les navigateurs et OS modernes. Renouvellement auto tous les 90
> jours.
>
> ⚠️ **Prérequis** : votre serveur doit être joignable depuis Internet
> sur les **ports 80 ET 443**, et le nom DNS choisi (`myktamap.votre-domaine.fr`)
> doit déjà pointer vers l'IP publique du serveur.

```bash
# Debian / Ubuntu
sudo apt install -y certbot python3-certbot-nginx

# Rocky / RHEL
sudo dnf install -y certbot python3-certbot-nginx

# Génération + intégration auto Nginx (remplacez par votre domaine)
sudo certbot --nginx -d myktamap.votre-domaine.fr \
  --redirect --agree-tos -m admin@votre-domaine.fr --no-eff-email
```

Certbot va automatiquement :
- Vérifier la propriété du domaine (challenge HTTP-01)
- Générer le certificat dans `/etc/letsencrypt/live/myktamap.votre-domaine.fr/`
- **Ajouter une redirection HTTP → HTTPS** dans la conf Nginx
- Installer un timer systemd qui renouvelle tout seul avant expiration

Notez les chemins pour la suite :
- Certif : `/etc/letsencrypt/live/myktamap.votre-domaine.fr/fullchain.pem`
- Clé : `/etc/letsencrypt/live/myktamap.votre-domaine.fr/privkey.pem`

### 3.2 Option B — Certificat auto-signé (réseau isolé / intranet)

> ⚠️ **Limite** : un certificat auto-signé déclenche un avertissement
> « connexion non sécurisée » sur tout navigateur qui ne connaît pas
> votre autorité. C'est attendu. Pour faire disparaître l'avertissement,
> il faut **distribuer le certificat racine** sur chaque poste client
> (cf. §3.3 ci-dessous).

#### 3.2.1 Création d'une mini autorité de certification locale

On crée d'abord une **autorité de certification (CA) locale** une fois
pour toutes — pour pouvoir signer plusieurs certificats si besoin
(plusieurs instances, plusieurs sous-domaines internes, etc.).

```bash
sudo mkdir -p /etc/ssl/myktamap-local
cd /etc/ssl/myktamap-local

# 1. Clé privée de la CA (à protéger — ne JAMAIS la partager)
sudo openssl genrsa -out ca.key 4096

# 2. Certificat racine de la CA (valable 10 ans)
sudo openssl req -x509 -new -nodes -key ca.key -sha256 -days 3650 \
  -out ca.crt \
  -subj "/C=FR/ST=Local/L=Intranet/O=MyKTAMap Self-Host/CN=MyKTAMap Local CA"
```

#### 3.2.2 Certificat du serveur

Préparez d'abord la liste des noms par lesquels l'app sera atteignable
(DNS + IP), dans un fichier de config OpenSSL :

```bash
sudo nano /etc/ssl/myktamap-local/server.cnf
```

Contenu (adaptez les noms et IP à votre cas) :

```ini
[req]
distinguished_name = req_distinguished_name
req_extensions     = v3_req
prompt             = no

[req_distinguished_name]
C  = FR
ST = Local
L  = Intranet
O  = MyKTAMap Self-Host
CN = myktamap.local

[v3_req]
keyUsage         = critical, digitalSignature, keyEncipherment
extendedKeyUsage = serverAuth
subjectAltName   = @alt_names

[alt_names]
DNS.1 = myktamap.local
DNS.2 = secours.intranet
IP.1  = 192.168.1.42
```

Puis génération du certificat serveur signé par la CA :

```bash
cd /etc/ssl/myktamap-local

# 1. Clé privée du serveur
sudo openssl genrsa -out server.key 2048

# 2. Demande de signature (CSR)
sudo openssl req -new -key server.key -out server.csr -config server.cnf

# 3. Signature par la CA locale (valable 2 ans)
sudo openssl x509 -req -in server.csr -CA ca.crt -CAkey ca.key \
  -CAcreateserial -out server.crt -days 730 -sha256 \
  -extensions v3_req -extfile server.cnf

# 4. Sécurisation des permissions
sudo chmod 600 server.key ca.key
sudo chmod 644 server.crt ca.crt
```

Notez les chemins pour la suite :
- Certif : `/etc/ssl/myktamap-local/server.crt`
- Clé : `/etc/ssl/myktamap-local/server.key`

#### 3.2.3 Distribution du certificat racine aux postes clients

Pour faire disparaître l'avertissement « connexion non sécurisée », vous
devez installer **`ca.crt`** (PAS `server.crt` ni `ca.key`) sur chaque
poste qui va utiliser l'instance.

| OS / Navigateur | Procédure |
|---|---|
| **Windows** | Double-clic sur `ca.crt` → « Installer le certificat » → « Ordinateur local » → magasin « Autorités de certification racines de confiance ». Redémarrer le navigateur. |
| **macOS** | Double-clic sur `ca.crt` → ouvre Trousseau → glisser dans « Système » → double-clic dans le trousseau → « Toujours approuver » sur SSL. |
| **iOS** | Envoyer `ca.crt` (mail, AirDrop) → ouvrir → « Profil téléchargé » dans Réglages → installer. Puis **Réglages → Général → Information → Réglages de certificat de confiance** → activer le certificat. |
| **Android** | Réglages → Sécurité → Chiffrement & identifiants → Installer un certificat → « Certificat CA ». Selon les marques, le menu varie un peu. |
| **Linux (système)** | `sudo cp ca.crt /usr/local/share/ca-certificates/myktamap-ca.crt && sudo update-ca-certificates` |
| **Firefox** | Gère son propre magasin : Préférences → Vie privée et sécurité → Certificats → Afficher les certificats → onglet Autorités → Importer `ca.crt`, cocher « identifier des sites web ». |

> 🔐 **Sécurité** : le fichier `ca.key` ne doit **jamais** quitter le
> serveur. C'est la clé qui permet de signer **n'importe quel** certificat
> au nom de votre CA — si quelqu'un l'obtient, il peut intercepter les
> connexions de tous les postes qui font confiance à votre CA.

---

## 4. Récupération de l'application

### 4.1 Depuis le dépôt GitHub officiel

```bash
# Téléchargement de la dernière version publiée (branche main)
cd /tmp
git clone --depth 1 --branch main https://github.com/Karmakta91/MyKTAMap.git
cd MyKTAMap
```

> 💡 **Restez sur `main`** : elle porte les versions publiées (celles de
> myktamap.fr, numéro dans `version.json`). Les autres branches contiennent
> des évolutions en cours de test. Autre source possible : le ZIP joint à
> chaque version sur la page **Releases** du dépôt, déjà débarrassé des
> fichiers de développement (dans ce cas, décompressez son contenu dans
> `/var/www/myktamap` et passez directement aux permissions du § 4.2).

### 4.2 Préparation du contenu à servir

L'app ne nécessite **aucune build step** (pas de npm, pas de bundler).
Vous copiez tel quel le contenu du repo dans le dossier servi par Nginx :

```bash
# Création du dossier cible
sudo mkdir -p /var/www/myktamap

# Copie de l'app : de docs/, seul docs/applications/ (lu par l'app) est utile ;
# le reste (journal README.md, doc de développement) n'a pas à être servi.
sudo rsync -av --include='/docs/' --include='/docs/applications/***' \
  --exclude='/docs/*' --exclude='/README.md' \
  --exclude='.git' --exclude='.github' --exclude='.githooks' --exclude='.claude' \
  --exclude='CLAUDE.md' --exclude='scripts/' --exclude='Dockerfile' --exclude='docker/' \
  /tmp/MyKTAMap/ /var/www/myktamap/

# Permissions (utilisateur Nginx — adapter selon votre OS)
# Debian/Ubuntu : www-data ; Rocky/RHEL : nginx
sudo chown -R www-data:www-data /var/www/myktamap
sudo find /var/www/myktamap -type d -exec chmod 755 {} \;
sudo find /var/www/myktamap -type f -exec chmod 644 {} \;
```

### 4.3 Vos propres plans

L'instance propose à ses utilisateurs les plans **déposés** dans `data/`
et listés dans `data/index.json` (chacun peut aussi importer ses propres
ZIP dans l'app, sans rien envoyer au serveur). La copie du dépôt contient
un plan d'exemple fictif (`data/test/`), à remplacer par les vôtres.

> 📖 **Référence complète** — format de `index.json`, sous-titre, mot de
> passe d'accès, mode consultation, liaisons entre plans, et la page
> `confadmin.html` qui fabrique le fichier pour vous :
> [Héberger une instance avec ses plans](applications/SELFHOST.md). L'essentiel :

```
/var/www/myktamap/data/
├── index.json                ← liste les plans dispo
├── mon-plan-1/            ← le CONTENU du ZIP, dézippé tel quel
│   ├── plan-config.json
│   ├── data/
│   │   ├── *.png             ← image plan + calques
│   │   ├── *.json            ← données (POI, tracés, zones…)
│   │   └── tiles/z0/…        ← tuiles, si le plan est tuilé (V2)
│   └── icon/                 ← icônes personnalisées éventuelles
└── mon-plan-2/
    └── ...
```

Le fichier `index.json` doit ressembler à :

```json
{
  "plans": [
    { "id": "mon-plan-1", "path": "data/mon-plan-1", "name": "Plan Nord" },
    { "id": "mon-plan-2", "path": "data/mon-plan-2", "name": "Plan Est" }
  ]
}
```

> 📦 **Plus simple : servir le ZIP tel quel.** Au lieu de décompresser, déposez l'archive (ex.
> `data/mon-plan-3.zip`) et déclarez-la avec `"zip"` au lieu de `"path"` :
> `{ "id": "mon-plan-3", "zip": "data/mon-plan-3.zip", "name": "Plan Sud" }`. L'app la télécharge à
> l'ouverture (avec progression) et la garde sur l'appareil pour le hors-ligne ; elle ne la retélécharge que si
> le fichier a changé sur le serveur (ETag / Last-Modified, servis d'office par Nginx). `confadmin.html`
> produit ce format par défaut.

> ✅ **Un ZIP décompressé se dépose tel quel** — aucun chemin à réécrire dans le `plan-config.json`.
>
> ✅ **Icônes personnalisées** : à l'ouverture d'un plan serveur, chaque icône déclarée est cherchée dans le
> dossier du plan ; à défaut, l'app garde la sienne. Rien à faire. Détail : [Le tuilage](TILING.md) § 5.
>
> 💡 **Pour créer vos plans facilement**, utilisez le **Générateur**
> intégré à l'app (écran d'accueil → « 🏗️ Générer un plan ») qui produit
> un ZIP prêt à déposer dans `/var/www/myktamap/data/`.

---

## 5. Configuration Nginx

### 5.1 Template prêt à l'emploi (recommandé)

Le dépôt contient **`docs/nginx-myktamap.conf`** — un template
complet et commenté que vous pouvez copier tel quel, puis adapter via
les `MKTM_TODO` à l'intérieur. Il inclut **`docs/nginx-csp-config.conf`**
(politique de sécurité CSP et en-têtes associés), à poser **hors du
dossier web** — le dossier `docs/` n'est pas copié dans `/var/www/myktamap`
(§ 4.2). Les deux fichiers se prennent dans la copie du dépôt :

```bash
# En-têtes de sécurité (inclus par le template)
sudo mkdir -p /etc/nginx/snippets
sudo cp /tmp/MyKTAMap/docs/nginx-csp-config.conf /etc/nginx/snippets/myktamap-csp.conf

# Copie du template
sudo cp /tmp/MyKTAMap/docs/nginx-myktamap.conf \
        /etc/nginx/sites-available/myktamap.conf

# Édition — cherchez "MKTM_TODO" pour lister tous les points à remplacer
sudo nano /etc/nginx/sites-available/myktamap.conf
sudo grep MKTM_TODO /etc/nginx/sites-available/myktamap.conf
```

Les `MKTM_TODO` couvrent : nom DNS (`server_name`), chemin de l'app
(`root`), chemins des certificats (selon votre choix A ou B), restrictions
IP éventuelles. Le template choisit par défaut l'**option B (auto-signé
local)** — pour l'option A Let's Encrypt, décommentez le bloc concerné
et commentez le bloc B.

Puis sautez directement au § 5.3.

### 5.2 OU configuration manuelle (sans le template)

Si vous préférez tout écrire vous-même :

```bash
sudo nano /etc/nginx/sites-available/myktamap.conf
```

Posez d'abord les en-têtes de sécurité hors du dossier web (même commande
qu'au § 5.1) :

```bash
sudo mkdir -p /etc/nginx/snippets
sudo cp /tmp/MyKTAMap/docs/nginx-csp-config.conf /etc/nginx/snippets/myktamap-csp.conf
```

#### 5.2.1 Si Let's Encrypt (Option A)

```nginx
# Redirection HTTP → HTTPS (certbot a peut-être déjà ajouté ce bloc)
server {
    listen      80;
    listen      [::]:80;
    server_name myktamap.votre-domaine.fr;
    return 301 https://$host$request_uri;
}

server {
    listen      443 ssl http2;
    listen      [::]:443 ssl http2;
    server_name myktamap.votre-domaine.fr;

    # --- Certificat Let's Encrypt ---
    ssl_certificate     /etc/letsencrypt/live/myktamap.votre-domaine.fr/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/myktamap.votre-domaine.fr/privkey.pem;
    include             /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam         /etc/letsencrypt/ssl-dhparams.pem;

    # --- Racine de l'app ---
    root  /var/www/myktamap;
    index index.html;

    # --- Headers de sécurité (CSP + bonus) ---
    # Copie de docs/nginx-csp-config.conf (version complète et commentée)
    include /etc/nginx/snippets/myktamap-csp.conf;

    # --- Service Worker : NE PAS cacher (sinon l'app ne se met jamais à jour) ---
    location = /sw.js {
        add_header Cache-Control "no-cache, no-store, must-revalidate";
        add_header Pragma        "no-cache";
        add_header Expires       "0";
    }

    # --- Fichiers JSON de config "live" : pareil, no-cache ---
    # version.json (UpdateChecker) + alert.json (alertes publiques)
    # + Licence-pro.json (détection édition pro, optionnel)
    location ~ ^/(version|alert|Licence-pro)\.json$ {
        add_header Cache-Control "no-cache, no-store, must-revalidate";
    }

    # --- Le reste : cache long (les assets sont versionnés via le SW) ---
    location / {
        try_files $uri $uri/ =404;
    }

    # --- Logs (utile pour les premiers débugs) ---
    access_log /var/log/nginx/myktamap-access.log;
    error_log  /var/log/nginx/myktamap-error.log warn;
}
```

#### 5.2.2 Si certificat auto-signé (Option B)

Même contenu que ci-dessus, en remplaçant le bloc certificat par :

```nginx
    # --- Certificat auto-signé local ---
    ssl_certificate     /etc/ssl/myktamap-local/server.crt;
    ssl_certificate_key /etc/ssl/myktamap-local/server.key;
    ssl_protocols       TLSv1.2 TLSv1.3;
    ssl_ciphers         HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;
```

Et le `server_name` par celui de votre intranet (`myktamap.local` etc.).

### 5.3 Activation du site

```bash
# Debian / Ubuntu (système sites-available / sites-enabled)
sudo ln -s /etc/nginx/sites-available/myktamap.conf /etc/nginx/sites-enabled/

# Rocky / RHEL (déposer directement dans conf.d)
sudo cp /etc/nginx/sites-available/myktamap.conf /etc/nginx/conf.d/

# Test de la conf
sudo nginx -t

# Si "syntax is ok" → reload
sudo systemctl reload nginx
```

---

## 6. Vérification post-installation

Sur un poste client (PC ou mobile sur le même réseau pour le cas B) :

### 6.1 Connexion HTTPS

Ouvrez `https://myktamap.votre-domaine.fr` (ou votre nom intranet).

- ✅ **Cadenas vert / pas d'avertissement** : c'est bon, le certificat
  est reconnu (Let's Encrypt OK, ou CA locale installée).
- ⚠️ **« Votre connexion n'est pas privée »** :
  - Option B + CA pas installée → revoir §3.2.3
  - Option A + URL ne correspond pas au domaine du certif → vérifier
    `server_name` et le DNS

### 6.2 PWA opérationnelle

Ouvrez la console développeur (F12) → onglet **Application** → **Service
Workers**. Vous devez voir :

```
Status:  activated and is running
Source:  /sw.js
```

Si le SW est en erreur, c'est presque toujours soit la CSP qui bloque
quelque chose (regardez l'onglet Console pour les messages CSP), soit
les chemins relatifs cassés (rare si vous avez copié le repo tel quel).

### 6.3 Page d'audit réseau

Ouvrez `https://myktamap.votre-domaine.fr/docs/applications/NETWORK_AUDIT.html`.
La page doit s'afficher, avec en tête la version qu'elle décrit. C'est
aussi un bon test pour valider que le dossier `docs/applications/` (lu
par l'app : guide, audit) est servi.

### 6.4 Test installation PWA (Chrome / Edge mobile)

- Menu Chrome → « Ajouter à l'écran d'accueil »
- L'app doit apparaître comme une vraie icône, ouvrable hors connexion
  après le premier chargement

---

## 7. Sécurisation supplémentaire (optionnel mais recommandé)

### 7.1 Activer HSTS (force HTTPS pendant N mois)

Dans `/etc/nginx/snippets/myktamap-csp.conf` (copie de
`docs/nginx-csp-config.conf`), dé-commentez la ligne :

```nginx
add_header Strict-Transport-Security "max-age=15768000; includeSubDomains" always;
```

> ⚠️ **À ne faire QUE quand vous êtes 100 % sûr que HTTPS est OK et durable.**
> Une fois HSTS posé, le navigateur refusera HTTP pour ce domaine pendant
> la durée annoncée (ici 6 mois). Si votre certif casse, les utilisateurs
> sont bloqués jusqu'à expiration du cache HSTS.

### 7.2 Restreindre l'accès par IP (intranet)

```nginx
server {
    # ...
    allow 192.168.1.0/24;   # votre LAN
    allow 10.42.0.0/16;     # VPN
    deny  all;
    # ...
}
```

### 7.3 Auto-renew Let's Encrypt — vérification

```bash
sudo certbot renew --dry-run
```

Doit terminer sans erreur. Le timer systemd `certbot.timer` tourne 2× par
jour et renouvelle automatiquement quand il reste < 30 jours.

---

## 8. Mise à jour de l'app

Quand une nouvelle version est publiée (cf. https://github.com/Karmakta91/MyKTAMap/releases) :

```bash
cd /tmp/MyKTAMap
git pull

# Rsync ré-applique la nouvelle version (mêmes exclusions qu'au § 4.2, plus data/)
sudo rsync -av --delete --include='/docs/' --include='/docs/applications/***' \
  --exclude='/docs/*' --exclude='/README.md' --exclude='/data/' \
  --exclude='.git' --exclude='.github' --exclude='.githooks' --exclude='.claude' \
  --exclude='CLAUDE.md' --exclude='scripts/' --exclude='Dockerfile' --exclude='docker/' \
  /tmp/MyKTAMap/ /var/www/myktamap/

sudo chown -R www-data:www-data /var/www/myktamap

# Si la politique de sécurité a changé dans la nouvelle version :
sudo cp /tmp/MyKTAMap/docs/nginx-csp-config.conf /etc/nginx/snippets/myktamap-csp.conf
sudo nginx -t && sudo systemctl reload nginx
```

⚠️ **Noter le `--exclude='/data/'`** : sans lui, `--delete` effacerait vos
plans et la copie les remplacerait par le plan d'exemple du dépôt.
**Toujours sauvegarder `data/` avant**. (Si vous aviez modifié la
politique de sécurité, par exemple pour HSTS, reportez vos modifications
dans la nouvelle copie.)

Côté utilisateur final, l'app détecte automatiquement la nouvelle version
(via `version.json`) : une fenêtre « 🔔 Mise à jour disponible » et le
numéro de version de l'écran d'accueil le signalent, et la mise à jour
s'applique sans perdre les plans, sessions ni photos.

---

## 9. Sauvegarde

À sauvegarder régulièrement (rsync vers NAS, snapshot LVM, etc.) :

| Chemin | Contenu | Criticité |
|---|---|---|
| `/var/www/myktamap/data/` | **Vos plans** (config, images, JSON) | 🔴 Vitale |
| `/etc/nginx/sites-available/myktamap.conf` | Conf Nginx | 🟡 Re-générable mais utile |
| `/etc/ssl/myktamap-local/` (cas B) | CA + certif serveur | 🟡 Re-générable (mais les clients perdent la confiance, donc bonne idée de garder) |
| `/etc/letsencrypt/` (cas A) | Certifs LE + état du timer | 🟢 Re-générable trivialement |

> 💡 **Ce qui N'est PAS sur le serveur** : les sessions de travail des
> utilisateurs (annotations, photos POI, scénarios Mode Secours, etc.).
> Tout ça vit **dans le navigateur de chaque utilisateur** (localStorage
> + IndexedDB). C'est volontaire — cohérent avec la philo offline-first
> de l'édition communautaire. Vos utilisateurs peuvent exporter leur
> session via 💾 quand ils veulent (formats `.mkmsec.json`, `.zip`, KMZ,
> GPX, PDF).

---

## 10. Roadmap auto-hébergement

| Step | Statut | Description |
|---|---|---|
| **1. Procédure manuelle** | ✅ **Ce document** | Nginx + TLS + dépôt fichiers à la main |
| **2. Image Docker** | ✅ Disponible | Nginx + HTTPS auto-signé, amd64 et arm64 : [Installer avec Docker](applications/DOCKER_INSTALL.md) |
| **3. Helm chart Kubernetes** | 📋 Si demande terrain | Cas usage : grosses structures avec PaC interne |
| **4. Backup intégré CLI** | 📋 Si demande terrain | Script `myktamap-backup` qui empaquette `data/` + conf en `.tar.gz` chiffré |

> Si vous avez un besoin spécifique non couvert (ex. : intégration LDAP,
> SSO, reverse-proxy déjà en place avec contraintes), n'hésitez pas à
> ouvrir une issue ou nous contacter via `contact@myktamap.fr`.

---

## 11. Dépannage rapide

| Symptôme | Cause probable | Fix |
|---|---|---|
| « Connexion non sécurisée » | CA locale pas installée sur le poste | §3.2.3 |
| PWA pas installable, pas d'option « Ajouter à l'écran d'accueil » | HTTPS pas en place ou cassé | Tester en F12 → Lighthouse → catégorie PWA |
| Service Worker en erreur (F12) | CSP trop stricte ou chemin SW mauvais | Vérifier `connect-src` et que `/sw.js` est servi sans cache (§ 5) |
| L'app ne détecte pas les nouvelles versions | `version.json` est caché par un proxy ou par le SW lui-même | Vérifier la directive `location ~ ^/(version|alert|Licence-pro)\.json$` (§ 5) |
| `nginx -t` : `open() "…myktamap-csp.conf" failed` | Les en-têtes de sécurité n'ont pas été posés hors du dossier web | Commande `cp` du § 5.1 |
| Erreur 404 sur `/sw.js` | Le SW est à la **racine** du site (volontaire), vérifier que `/var/www/myktamap/sw.js` existe | `ls -l /var/www/myktamap/sw.js` |
| Tuiles de plan ne s'affichent pas | Blob URLs bloquées par la CSP | `img-src 'self' data: blob:` et `worker-src 'self' blob:` (déjà dans la conf fournie) |

---

## 12. Liens utiles

- **Repo GitHub** : https://github.com/Karmakta91/MyKTAMap
- **Page de transparence réseau** : [Audit réseau](applications/NETWORK_AUDIT.html) (servie aussi par votre
  instance, `docs/applications/NETWORK_AUDIT.html`)
- **Template Nginx prêt à l'emploi** : `docs/nginx-myktamap.conf` du dépôt (cf. § 5.1)
- **Conf Nginx CSP commentée** (incluse par le template) : `docs/nginx-csp-config.conf` du dépôt
- **Installer avec Docker** : [Installer avec Docker](applications/DOCKER_INSTALL.md)
- **Proposer vos plans** : [Héberger une instance avec ses plans](applications/SELFHOST.md)
- **Doc utilisateur** : [Guide utilisateur](applications/README_USER.md) (accessible aussi depuis l'app via 📖)
- **Contact pro** : `contact@myktamap.fr` — pour usage commercial, demande de licence, intégration spécifique, ou ouverture de prestation d'installation

---

*Document de MyKTAMap édition communautaire. Pour la version pro (multi-tenant, SSO, hébergement
managé), voir [pro.myktamap.fr/presentation](https://pro.myktamap.fr/presentation/).*
