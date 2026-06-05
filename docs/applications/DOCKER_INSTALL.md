# 🐳 Installer et démarrer Docker pour MyKTAMap

> Guide complet pour installer Docker et lancer MyKTAMap en self-host.
> Cette doc est volontairement détaillée pour les utilisateurs qui n'ont jamais utilisé Docker.

## 📋 À qui s'adresse ce guide ?

Tu veux faire tourner **MyKTAMap sur ton propre matériel** (PC, Mac, Raspberry Pi, NAS) au lieu d'utiliser `myktamap.fr`. Trois cas d'usage typiques :

- 🏠 **Réseau local** : avoir MyKTAMap accessible depuis tes autres appareils chez toi (téléphone, tablette, autre PC) sans Internet.
- 🔒 **Privacy maximale** : tu veux la garantie 100 % que rien ne sort de ton réseau.
- 🎉 **Événement / présentation** : tu veux une démo qui marche même sans connexion (festival, conférence souterraine).

## ⚡ Vérification rapide — Docker est-il déjà installé ?

Ouvre un terminal (PowerShell sur Windows, Terminal sur Mac/Linux) et tape :

```bash
docker --version
docker ps
```

| Résultat | Diagnostic | Aller à |
|---|---|---|
| `Docker version 27.x.x` + tableau vide `CONTAINER ID  IMAGE...` | ✅ Docker est installé ET démarré, tu es prêt | [Lancer MyKTAMap](#-lancer-myktamap) |
| `Docker version 27.x.x` MAIS `ERROR: failed to connect to the docker API` | ⚠️ Docker installé mais pas démarré | [Démarrer Docker](#-démarrer-docker-desktop-windowsmac) |
| `docker : Le terme « docker » n'est pas reconnu` ou `command not found` | ❌ Docker pas installé | [Installer Docker](#-installer-docker) |

---

## 📥 Installer Docker

### Windows 10 / 11

1. **Pré-requis** : Windows 10 build 19041+ ou Windows 11. WSL 2 (Windows Subsystem for Linux) sera installé/activé automatiquement par Docker Desktop.
2. **Télécharger** : https://www.docker.com/products/docker-desktop/ → bouton **Download for Windows — AMD64** (ou ARM64 si Surface ARM).
3. **Installer** : double-clique `Docker Desktop Installer.exe`. À l'étape « Configuration », laisse cochées les 2 cases (WSL 2 + raccourci bureau).
4. **Redémarrer** Windows quand demandé.
5. Au redémarrage, **Docker Desktop se lance** tout seul. Accepte le Service Agreement (gratuit pour usage personnel).
6. Patiente ~1-2 min que le moteur démarre (icône baleine 🐳 en bas à droite dans la barre des tâches doit devenir **verte / stable**).
7. **Vérifie** :
   ```powershell
   docker ps
   ```
   Tu dois voir un tableau vide avec les en-têtes `CONTAINER ID  IMAGE  COMMAND  ...`.

### macOS (Intel ou Apple Silicon)

1. **Télécharger** : https://www.docker.com/products/docker-desktop/ → choisis **Mac with Intel Chip** ou **Mac with Apple Chip** selon ton modèle.
2. **Installer** : ouvre le `.dmg` et glisse `Docker.app` dans `Applications`.
3. **Lance** Docker.app depuis Launchpad. Accepte les autorisations système demandées (privileged helper).
4. Patiente que l'icône baleine 🐳 dans la barre de menu (haut de l'écran) devienne **verte**.
5. **Vérifie** dans Terminal :
   ```bash
   docker ps
   ```

### Linux (Ubuntu / Debian / Fedora)

Sur Linux, tu as **2 options** :

#### Option A — Docker Engine (recommandée serveur)

Pas d'interface graphique, juste le daemon. Idéal pour un Raspberry Pi, un VPS, un serveur dédié.

```bash
# Ubuntu/Debian
curl -fsSL https://get.docker.com | sh

# Ajoute ton user au groupe docker (évite de devoir sudo à chaque commande)
sudo usermod -aG docker $USER
newgrp docker

# Vérifie
docker ps
```

#### Option B — Docker Desktop (avec interface graphique)

Idem que Windows/Mac : https://docs.docker.com/desktop/install/linux/

### Raspberry Pi (ARM 64-bit)

L'image MyKTAMap **supporte nativement** ARM64. Pré-requis : Raspberry Pi OS **64-bit** (le 32-bit ne fonctionnera pas).

```bash
# Vérifie ton OS
uname -m
# Doit renvoyer : aarch64 (= 64-bit)

# Installe Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
newgrp docker
docker ps
```

---

## 🚀 Démarrer Docker Desktop (Windows/Mac)

Si Docker est installé mais que `docker ps` échoue avec :

```
ERROR: failed to connect to the docker API at npipe:////./pipe/dockerDesktopLinuxEngine
```

ça veut dire que **le daemon Docker n'est pas en marche**. Solutions :

### Méthode 1 — Lancer depuis le menu

- **Windows** : menu Démarrer → tape « Docker Desktop » → clique l'icône
- **Mac** : Launchpad → Docker.app

### Méthode 2 — Lancer en ligne de commande

```powershell
# Windows
& "C:\Program Files\Docker\Docker\Docker Desktop.exe"
```

```bash
# macOS
open -a Docker
```

### Patiente que ce soit prêt

Le démarrage prend **30 à 90 secondes**. L'icône baleine 🐳 dans la systray :
- 🟡 **Jaune / animée** = en cours de démarrage
- 🟢 **Verte / fixe** = prêt à recevoir des commandes
- 🔴 **Rouge** = problème, voir [Troubleshooting](#-troubleshooting)

Quand l'icône est verte, re-teste :

```bash
docker ps
```

---

## 🎯 Lancer MyKTAMap

Tu as 3 options selon ce que tu as téléchargé.

### Option 1 — Image officielle pré-buildée (le plus simple)

Pas besoin de cloner le code. Une commande suffit :

```bash
docker pull ghcr.io/karmakta91/myktamap:latest
docker run -d --name myktamap -p 8443:8443 ghcr.io/karmakta91/myktamap:latest
```

Puis ouvre **https://localhost:8443/** dans ton navigateur.

### Option 2 — Builder depuis le ZIP self-host

Si tu as téléchargé un ZIP `MyKTAMap-vX.Y.Z.zip` depuis la page **Releases** GitHub :

```bash
# 1. Décompresse
unzip MyKTAMap-v1.36.0.zip
cd MyKTAMap-v1.36.0/

# 2. Vérifie que le ZIP contient le Dockerfile (≥ v1.36.0)
ls Dockerfile docker/

# 3. Build (~5-10 min la première fois)
docker build -t myktamap:local .

# 4. Lance
docker run -d --name myktamap -p 8443:8443 myktamap:local
```

Puis ouvre **https://localhost:8443/**.

### Option 3 — Cloner le repo

Pour les devs qui veulent suivre la branche `Karma_dev` :

```bash
git clone https://github.com/Karmakta91/MyKTAMap.git
cd MyKTAMap
docker build -t myktamap:dev .
docker run -d --name myktamap -p 8443:8443 myktamap:dev
```

---

## 🔓 Accepter le certificat auto-signé

Au premier accès à `https://localhost:8443/`, ton navigateur affichera :

> ⚠️ **Votre connexion n'est pas privée**
> NET::ERR_CERT_AUTHORITY_INVALID

C'est **normal et attendu**. Le conteneur génère un certificat auto-signé au démarrage (pas reconnu par les autorités publiques, mais valide pour ton usage local).

**Pour accepter** :

| Navigateur | Procédure |
|---|---|
| **Chrome / Edge / Brave** | Clique « Paramètres avancés » → « Continuer vers localhost (non sécurisé) » |
| **Firefox** | Clique « Avancé » → « Accepter le risque et continuer » |
| **Safari** | Clique « Afficher les détails » → « Visiter ce site web » → entre ton mot de passe Mac |

L'app charge ensuite normalement. Sur la même session, tu n'auras plus le warning.

---

## 🛠️ Commandes utiles au quotidien

```bash
# Voir l'état du conteneur
docker ps

# Voir les logs (utile pour debug)
docker logs myktamap
docker logs -f myktamap   # mode "suivi" (tail -f)

# Arrêter / redémarrer
docker stop myktamap
docker start myktamap

# Mettre à jour (option 1 uniquement)
docker pull ghcr.io/karmakta91/myktamap:latest
docker stop myktamap && docker rm myktamap
docker run -d --name myktamap -p 8443:8443 ghcr.io/karmakta91/myktamap:latest

# Supprimer complètement
docker stop myktamap && docker rm myktamap

# Voir la consommation ressource
docker stats myktamap
```

---

## 🎛️ Options avancées

### Persister tes plans entre redémarrages

```bash
docker run -d --name myktamap \
  -p 8443:8443 \
  -v /chemin/vers/tes/plans:/usr/share/nginx/html/data/plans \
  ghcr.io/karmakta91/myktamap:latest
```

Sur Windows : `-v C:\Users\Toi\plans:/usr/share/nginx/html/data/plans`

### Utiliser ton propre certificat TLS

Si tu as un cert valide (Let's Encrypt avec un domaine local, autorité d'entreprise, etc.), monte-le en volume au lieu du auto-signé :

```bash
docker run -d --name myktamap \
  -p 8443:8443 \
  -v /chemin/vers/certs:/etc/nginx/certs \
  ghcr.io/karmakta91/myktamap:latest
```

Le dossier doit contenir `server.crt` + `server.key`.

### Hostname personnalisé dans le cert

```bash
docker run -d --name myktamap \
  -p 8443:8443 \
  -e MKM_HOSTNAME=myktamap.local \
  ghcr.io/karmakta91/myktamap:latest
```

Le cert auto-signé inclura `myktamap.local` dans les **noms autorisés**. Pratique si tu utilises un DNS local (Pi-hole, AdGuard Home).

### Changer le port hôte

Si `8443` est déjà occupé sur ta machine :

```bash
docker run -d --name myktamap -p 9443:8443 ghcr.io/karmakta91/myktamap:latest
# → https://localhost:9443/
```

### Accès depuis ton réseau local

Par défaut, `-p 8443:8443` écoute sur **toutes les interfaces** (0.0.0.0). Donc tu peux accéder depuis un autre appareil de ton réseau :

```bash
# Trouve l'IP de ton hôte
ipconfig    # Windows
ifconfig    # Mac/Linux

# Sur ton téléphone : https://192.168.1.X:8443/
```

Tu devras accepter le cert auto-signé sur **chaque appareil**.

---

## ❗ Troubleshooting

### `docker: command not found` / `Le terme « docker »...`
Docker n'est pas installé. Va à [Installer Docker](#-installer-docker).

### `ERROR: failed to connect to the docker API`
Docker installé mais pas démarré. Va à [Démarrer Docker](#-démarrer-docker-desktop-windowsmac).

### `docker: Error response from daemon: pull access denied for ghcr.io/karmakta91/myktamap, repository does not exist or may require authentication`
L'image n'est pas (encore) publique sur ghcr.io. Soit :
- attends que l'auteur la passe en public (cas v1.36.0 vient d'être publiée)
- utilise [Option 2 ou 3](#-lancer-myktamap) (build local)

### `Bind for 0.0.0.0:8443 failed: port is already allocated`
Un autre service utilise déjà le port 8443. Solutions :
- Trouver et arrêter ce service : `netstat -aon | findstr :8443` (Windows) / `lsof -i :8443` (Mac/Linux)
- OU changer le port hôte : `-p 9443:8443`

### Le conteneur démarre puis s'arrête immédiatement
Regarde les logs pour voir la cause :
```bash
docker logs myktamap
```
Les erreurs typiques :
- Cert non générable (volume `/etc/nginx/certs` monté en lecture seule)
- Config Nginx invalide (rare, devrait être attrapée par `nginx -t` dans l'entrypoint)

### Service Worker ne s'enregistre pas / PWA ne s'installe pas
Le cert auto-signé bloque parfois le SW sur Chromium/Safari. Workaround :
1. Visite `https://localhost:8443/` une première fois
2. Accepte le warning de sécurité
3. **Recharge la page** (F5 ou Cmd+R) — le SW devrait s'enregistrer cette fois

### Sur Windows : « Docker Desktop is starting » bloqué
Solutions par ordre de probabilité :
1. **Redémarrer Windows** (résout 80 % des cas)
2. **Vérifier que WSL 2 est installé** : `wsl --status` doit afficher `Default Version: 2`
3. **Réinstaller Docker Desktop** en cochant explicitement « Use WSL 2 »
4. Activer la **virtualisation** dans le BIOS si elle est désactivée

### Sur Mac : « Docker Desktop unexpectedly quit »
1. Vérifie que tu as au moins **macOS 11** (Big Sur)
2. Pour les Mac M1/M2/M3, télécharge bien la version **Apple Silicon**, pas Intel
3. Si tu viens d'updater macOS, redémarre

### Sur Raspberry Pi : `exec format error`
Ton Pi est en 32-bit. L'image MyKTAMap ne supporte que arm64.
- **Solution** : réinstalle Raspberry Pi OS en version **64-bit**
- **Alternative** : utilise l'[Option A](#-installer-docker) (servir le ZIP avec Nginx local sur le Pi 32-bit)

---

## 🆘 Alternatives sans Docker

Si Docker te paraît trop complexe, tu peux aussi :

### Python `http.server` (le plus simple, sans HTTPS)

```bash
cd /chemin/vers/MyKTAMap-v1.36.0/
python -m http.server 8080
# → http://localhost:8080/
```

⚠️ Sans HTTPS, le Service Worker peut ne pas s'installer et certaines APIs sensibles (commande vocale 🎤, MediaRecorder) ne fonctionneront pas. C'est OK pour un test rapide, pas pour usage régulier.

### Nginx local

Tutoriels complets disponibles ici :
- Windows : https://nginx.org/en/docs/windows.html
- Linux : `sudo apt install nginx` puis copie le contenu du ZIP dans `/var/www/html/`
- Mac : `brew install nginx` puis idem

Tu peux réutiliser la config `docs/nginx-csp-config.conf` du repo pour avoir la même CSP stricte que la prod.

### Caddy (auto-HTTPS via Let's Encrypt)

Si tu as un nom de domaine pointé vers ta machine :

```caddyfile
# Caddyfile
myktamap.example.com {
    root * /chemin/vers/MyKTAMap-v1.36.0/
    file_server
    encode gzip
}
```

```bash
caddy run
```

Caddy gère HTTPS auto via Let's Encrypt — pas de cert auto-signé à accepter.

---

## 📚 Pour aller plus loin

- **Doc utilisateur principale** : `docs/applications/README_USER.md` (section « 🐳 Self-host avec Docker »)
- **Architecture technique** : `docs/architecture/docker-selfhost.md` (Dockerfile, workflow CI, sécurité)
- **Audit réseau** : `docs/applications/NETWORK_AUDIT.md` (impact réseau v1.36.0)
- **Docker docs officielle** : https://docs.docker.com/

Si t'es bloqué malgré tout ça, ouvre une issue sur le repo GitHub avec :
1. Ton OS (Windows / Mac / Linux + version)
2. Sortie complète de `docker version`
3. Sortie complète de `docker logs myktamap` (si le conteneur a démarré)
4. La commande exacte qui a échoué + le message d'erreur

Bonne exploration 🐳
