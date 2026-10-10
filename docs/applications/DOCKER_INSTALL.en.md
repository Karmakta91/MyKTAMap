# 🐳 Install and start Docker for MyKTAMap

> Complete guide to install Docker and run MyKTAMap in self-host mode.
> This doc is intentionally detailed for users who have never used Docker.

> 🧭 **Three self-hosting guides, one job each**:
> - **Install with Docker** → this guide (the simplest: one command, HTTPS included).
> - **Install without Docker** (Linux server + Nginx, Let's Encrypt or company certificate, intranet) →
>   [Self-hosted installation](../INSTALLATION_SELFHOST.md) (in French).
> - **Offer your maps** to whoever opens your instance (map list, subtitle, access password, read-only mode) →
>   [Hosting an instance with your maps](SELFHOST.md) (in French). It applies to both installations.

## 📋 Who is this guide for?

You want to run **MyKTAMap on your own hardware** (PC, Mac, Raspberry Pi, NAS) instead of using `myktamap.fr`. Three typical use cases:

- 🏠 **Local network**: have MyKTAMap accessible from your other devices at home (phone, tablet, other PC) without Internet.
- 🔒 **Maximum privacy**: you want the 100% guarantee that nothing leaves your network.
- 🎉 **Event / presentation**: you want a demo that works even without connection (festival, underground conference).

## ⚡ Quick check — is Docker already installed?

Open a terminal (PowerShell on Windows, Terminal on Mac/Linux) and type:

```bash
docker --version
docker ps
```

| Result | Diagnosis | Go to |
|---|---|---|
| `Docker version 27.x.x` + empty table `CONTAINER ID  IMAGE...` | ✅ Docker is installed AND started, you're ready | [Run MyKTAMap](#-run-myktamap) |
| `Docker version 27.x.x` BUT `ERROR: failed to connect to the docker API` | ⚠️ Docker installed but not started | [Start Docker](#-start-docker-desktop-windowsmac) |
| `docker: command not found` or `The term 'docker' is not recognized` | ❌ Docker not installed | [Install Docker](#-install-docker) |

---

## 📥 Install Docker

### Windows 10 / 11

1. **Prerequisites**: Windows 10 build 19041+ or Windows 11. WSL 2 (Windows Subsystem for Linux) will be installed/activated automatically by Docker Desktop.
2. **Download**: https://www.docker.com/products/docker-desktop/ → **Download for Windows — AMD64** (or ARM64 if Surface ARM).
3. **Install**: double-click `Docker Desktop Installer.exe`. At the "Configuration" step, leave both checkboxes checked (WSL 2 + desktop shortcut).
4. **Restart** Windows when prompted.
5. After restart, **Docker Desktop launches** automatically. Accept the Service Agreement (free for personal use).
6. Wait ~1-2 min for the engine to start (whale icon 🐳 in bottom-right system tray must become **green / stable**).
7. **Verify**:
   ```powershell
   docker ps
   ```
   You should see an empty table with headers `CONTAINER ID  IMAGE  COMMAND  ...`.

### macOS (Intel or Apple Silicon)

1. **Download**: https://www.docker.com/products/docker-desktop/ → choose **Mac with Intel Chip** or **Mac with Apple Chip** depending on your model.
2. **Install**: open the `.dmg` and drag `Docker.app` into `Applications`.
3. **Launch** Docker.app from Launchpad. Accept the system permissions requested (privileged helper).
4. Wait for the whale icon 🐳 in the menu bar (top of screen) to turn **green**.
5. **Verify** in Terminal:
   ```bash
   docker ps
   ```

### Linux (Ubuntu / Debian / Fedora)

On Linux, you have **2 options**:

#### Option A — Docker Engine (recommended for servers)

No GUI, just the daemon. Ideal for a Raspberry Pi, VPS, or dedicated server.

```bash
# Ubuntu/Debian
curl -fsSL https://get.docker.com | sh

# Add your user to the docker group (avoids needing sudo for every command)
sudo usermod -aG docker $USER
newgrp docker

# Verify
docker ps
```

#### Option B — Docker Desktop (with GUI)

Same as Windows/Mac: https://docs.docker.com/desktop/install/linux/

### Raspberry Pi (ARM 64-bit)

The MyKTAMap image **natively supports** ARM64. Prerequisite: Raspberry Pi OS **64-bit** (the 32-bit will NOT work).

```bash
# Check your OS
uname -m
# Must return: aarch64 (= 64-bit)

# Install Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
newgrp docker
docker ps
```

---

## 🚀 Start Docker Desktop (Windows/Mac)

If Docker is installed but `docker ps` fails with:

```
ERROR: failed to connect to the docker API at npipe:////./pipe/dockerDesktopLinuxEngine
```

it means **the Docker daemon isn't running**. Solutions:

### Method 1 — Launch from menu

- **Windows**: Start menu → type "Docker Desktop" → click the icon
- **Mac**: Launchpad → Docker.app

### Method 2 — Launch via command line

```powershell
# Windows
& "C:\Program Files\Docker\Docker\Docker Desktop.exe"
```

```bash
# macOS
open -a Docker
```

### Wait until it's ready

Startup takes **30 to 90 seconds**. The whale icon 🐳 in the system tray:
- 🟡 **Yellow / animated** = starting up
- 🟢 **Green / fixed** = ready to receive commands
- 🔴 **Red** = problem, see [Troubleshooting](#-troubleshooting)

When the icon is green, re-test:

```bash
docker ps
```

---

## 🎯 Run MyKTAMap

You have 3 options depending on what you downloaded.

### Option 1 — Official pre-built image (simplest)

No need to clone the code. One command is enough:

```bash
docker pull ghcr.io/karmakta91/myktamap:latest
docker run -d --name myktamap -p 8443:8443 ghcr.io/karmakta91/myktamap:latest
```

Then open **https://localhost:8443/** in your browser.

### Option 2 — Build from the self-host ZIP

If you downloaded a `MyKTAMap-vX.Y.Z.zip` from the GitHub **Releases** page:

```bash
# 1. Unzip (replace vX.Y.Z with the downloaded version)
unzip MyKTAMap-vX.Y.Z.zip
cd MyKTAMap-vX.Y.Z/

# 2. Verify the ZIP contains the Dockerfile
ls Dockerfile docker/

# 3. Build (~5-10 min the first time)
docker build -t myktamap:local .

# 4. Run
docker run -d --name myktamap -p 8443:8443 myktamap:local
```

Then open **https://localhost:8443/**.

### Option 3 — Clone the repo

For those who want to build the image from the source code (the `main` branch carries released versions):

```bash
git clone --branch main https://github.com/Karmakta91/MyKTAMap.git
cd MyKTAMap
docker build -t myktamap:dev .
docker run -d --name myktamap -p 8443:8443 myktamap:dev
```

---

## 🔓 Accept the self-signed certificate

On first access to `https://localhost:8443/`, your browser will show:

> ⚠️ **Your connection is not private**
> NET::ERR_CERT_AUTHORITY_INVALID

This is **normal and expected**. The container generates a self-signed certificate at startup (not recognized by public authorities, but valid for your local use).

**To accept**:

| Browser | Procedure |
|---|---|
| **Chrome / Edge / Brave** | Click "Advanced" → "Proceed to localhost (unsafe)" |
| **Firefox** | Click "Advanced" → "Accept the Risk and Continue" |
| **Safari** | Click "Show Details" → "Visit this Website" → enter your Mac password |

The app loads normally afterward. On the same session, you won't see the warning again.

---

## 🛠️ Useful daily commands

```bash
# Check container state
docker ps

# View logs (useful for debug)
docker logs myktamap
docker logs -f myktamap   # "follow" mode (tail -f)

# Stop / restart
docker stop myktamap
docker start myktamap

# Update (option 1 only)
docker pull ghcr.io/karmakta91/myktamap:latest
docker stop myktamap && docker rm myktamap
docker run -d --name myktamap -p 8443:8443 ghcr.io/karmakta91/myktamap:latest

# Remove completely
docker stop myktamap && docker rm myktamap

# Check resource usage
docker stats myktamap
```

---

## 🎛️ Advanced options

### Serve your maps (and keep them across updates)

The app discovers an instance's maps through the `data/index.json` file, which lists each map and where it lives
in `data/`. So prepare a `data` folder on your machine (your map ZIPs + the `index.json` produced by the
`confadmin.html` page — how-to: [Hosting an instance with your maps](SELFHOST.md), in French), then mount it
**in place of** the image's `data/` folder:

```bash
docker run -d --name myktamap \
  -p 8443:8443 \
  -v /path/to/your/data:/usr/share/nginx/html/data \
  ghcr.io/karmakta91/myktamap:latest
```

On Windows: `-v C:\Users\You\myktamap-data:/usr/share/nginx/html/data`

The folder stays on your machine: removing or updating the container doesn't touch it. It replaces the sample map
shipped in the image. ⚠️ A mounted folder without `index.json` shows no map at all.

### Use your own TLS certificate

If you have a valid cert (Let's Encrypt with a local domain, enterprise CA, etc.), mount it as a volume instead of the self-signed one:

```bash
docker run -d --name myktamap \
  -p 8443:8443 \
  -v /path/to/certs:/etc/nginx/certs \
  ghcr.io/karmakta91/myktamap:latest
```

The folder must contain `server.crt` + `server.key`.

### Custom hostname in cert

```bash
docker run -d --name myktamap \
  -p 8443:8443 \
  -e MKM_HOSTNAME=myktamap.local \
  ghcr.io/karmakta91/myktamap:latest
```

The self-signed cert will include `myktamap.local` in the **allowed names**. Handy if you use a local DNS (Pi-hole, AdGuard Home).

### Change host port

If `8443` is already in use on your machine:

```bash
docker run -d --name myktamap -p 9443:8443 ghcr.io/karmakta91/myktamap:latest
# → https://localhost:9443/
```

### Access from your local network

By default, `-p 8443:8443` listens on **all interfaces** (0.0.0.0). So you can access from another device on your network:

```bash
# Find your host's IP
ipconfig    # Windows
ifconfig    # Mac/Linux

# On your phone: https://192.168.1.X:8443/
```

You'll need to accept the self-signed cert on **each device**.

---

## ❗ Troubleshooting

### `docker: command not found` / `The term 'docker'...`
Docker is not installed. Go to [Install Docker](#-install-docker).

### `ERROR: failed to connect to the docker API`
Docker installed but not started. Go to [Start Docker](#-start-docker-desktop-windowsmac).

### `docker: Error response from daemon: pull access denied for ghcr.io/karmakta91/myktamap, repository does not exist or may require authentication`
The image can't be pulled without a ghcr.io account (or the name is mistyped: all lowercase). Either:
- build the image yourself: [Option 2 or 3](#-run-myktamap) (local build)
- report it to the author (contact@myktamap.fr)

### `Bind for 0.0.0.0:8443 failed: port is already allocated`
Another service is already using port 8443. Solutions:
- Find and stop that service: `netstat -aon | findstr :8443` (Windows) / `lsof -i :8443` (Mac/Linux)
- OR change the host port: `-p 9443:8443`

### Container starts then exits immediately
Check the logs to see the cause:
```bash
docker logs myktamap
```
Typical errors:
- Cert not generable (volume `/etc/nginx/certs` mounted read-only)
- Invalid Nginx config (rare, should be caught by `nginx -t` in the entrypoint)

### Service Worker doesn't register / PWA doesn't install
The self-signed cert sometimes blocks the SW on Chromium/Safari. Workaround:
1. Visit `https://localhost:8443/` once
2. Accept the security warning
3. **Reload the page** (F5 or Cmd+R) — the SW should register this time

### On Windows: "Docker Desktop is starting" stuck
Solutions in order of likelihood:
1. **Restart Windows** (solves 80% of cases)
2. **Verify WSL 2 is installed**: `wsl --status` must show `Default Version: 2`
3. **Reinstall Docker Desktop** explicitly checking "Use WSL 2"
4. Enable **virtualization** in BIOS if disabled

### On Mac: "Docker Desktop unexpectedly quit"
1. Verify you have at least **macOS 11** (Big Sur)
2. For M1/M2/M3 Macs, download the **Apple Silicon** version, not Intel
3. If you just updated macOS, restart

### On Raspberry Pi: `exec format error`
Your Pi is 32-bit. The MyKTAMap image only supports arm64.
- **Solution**: reinstall Raspberry Pi OS in **64-bit** version
- **Alternative**: serve the app's ZIP without Docker, with Nginx directly on the Pi —
  [Self-hosted installation](../INSTALLATION_SELFHOST.md) (in French)

---

## 🆘 Alternatives without Docker

If Docker seems too complex, you can also:

### Python `http.server` (simplest, no HTTPS)

```bash
cd /path/to/MyKTAMap-vX.Y.Z/
python -m http.server 8080
# → http://localhost:8080/
```

⚠️ Without HTTPS, the app fully works **only on the machine itself** (`http://localhost`, which browsers treat
as safe). Opened from another device (`http://192.168.1.X:8080/`), it can't be installed, doesn't work offline,
and the sensors (compass, microphone for the voice command 🎤) stay off. Fine for a quick test, not for regular
use.

### Nginx (Linux server, intranet)

For a lasting install without Docker — Nginx, Let's Encrypt or local-authority certificate, security headers,
updates, backups — follow the dedicated guide: [Self-hosted installation](../INSTALLATION_SELFHOST.md) (in French).

### Caddy (auto-HTTPS via Let's Encrypt)

If you have a domain name pointing to your machine:

```caddyfile
# Caddyfile
myktamap.example.com {
    root * /path/to/MyKTAMap-vX.Y.Z/
    file_server
    encode gzip
}
```

```bash
caddy run
```

Caddy handles HTTPS automatically via Let's Encrypt — no self-signed cert to accept. This minimal Caddyfile sets
neither the security policy (CSP) nor the no-cache rule for `sw.js` and `version.json`: without the latter, app
updates arrive late. The rules to reproduce are in [Self-hosted installation](../INSTALLATION_SELFHOST.md) § 5.

---

## 📚 Going further

- **User guide**: [README_USER](README_USER.en.md) (section "🖥️ Hosting the app on your server")
- **Offer your maps on your instance**: [Hosting an instance with your maps](SELFHOST.md) (in French)
- **Install without Docker**: [Self-hosted installation](../INSTALLATION_SELFHOST.md) (in French)
- **Network audit** (what the app sends, and to whom): [Network audit](NETWORK_AUDIT.html) (in French)
- **Official Docker docs**: https://docs.docker.com/

If you're stuck despite all this, write to the author (contact@myktamap.fr) with:
1. Your OS (Windows / Mac / Linux + version)
2. Full output of `docker version`
3. Full output of `docker logs myktamap` (if the container started)
4. The exact command that failed + the error message

Happy exploring 🐳
