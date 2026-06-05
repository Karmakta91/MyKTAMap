# 🐳 Architecture — Package Docker self-host (v1.36.0+)

> Référence technique pour le module d'image OCI publié sur ghcr.io.
> Pour la doc utilisateur de base, voir `docs/applications/README_USER.md` § Self-host Docker.

## Pourquoi cette feature

Avant v1.36.0, le self-host MyKTAMap nécessitait :
1. Télécharger le ZIP selfhost depuis la page Releases
2. Setup d'un serveur web (Nginx/Apache/Caddy/http.server)
3. Configurer HTTPS manuellement (cert auto-signé ou Let's Encrypt)
4. Adapter la CSP, les MIME types, etc.

Pour un cataphile non-techos, ces 4 étapes sont une barrière infranchissable.
L'image Docker tout-en-un règle ça :

```bash
docker run -d -p 8443:8443 ghcr.io/karmakta91/myktamap:latest
# Ouvre https://localhost:8443/
```

## Architecture

### Multi-stage build

```
Stage 1 : alpine + rsync       Stage 2 : nginx:alpine
─────────────────────         ─────────────────────────────
COPY repo entier              Inherit Nginx + openssl + tini
rsync exclusions ─────→       COPY /www depuis stage 1
(.git, .github, scripts,      COPY docker/nginx-docker.conf
 CLAUDE.md, etc.)             COPY docker/entrypoint.sh
                              CMD entrypoint.sh
```

**Rationale du multi-stage** :
- Le stage 1 contient `rsync` (~5 MB) qu'on ne veut pas dans l'image finale.
- Le stage 2 final ne fait que ~50-60 MB compressée (nginx alpine ~40 MB + assets ~10-15 MB).
- Pas de Node.js ni outils de build : l'app est en JS vanilla, pas de bundler.

### Liste d'exclusion

Cohérente avec celle du workflow `release.yml` (ZIP selfhost) pour éviter
qu'un ZIP et une image divergent :

| Exclu | Pourquoi |
|---|---|
| `.git/`, `.gitignore`, etc. | git internals, pas utile en runtime |
| `.github/` | workflows CI, pas utile en runtime |
| `.githooks/` | hooks dev local |
| `.claude/`, `CLAUDE.md` | instructions agent dev only |
| `scripts/` | check-no-pro-leak.js et autres scripts dev |
| `Licence-pro.json` | garde-fou (jamais en community mais au cas où) |
| `Dockerfile`, `docker/` | utilisés au build, pas servis par Nginx |
| `docs/architecture/` | doc interne, pas user-facing |
| `node_modules/` | pas utilisé mais défensif |

### Entrypoint : génération cert TLS auto-signé

`docker/entrypoint.sh` :

```sh
1. Si /etc/nginx/certs/server.{crt,key} existent → user a monté un cert custom
2. Sinon → openssl req génère un cert auto-signé 365j
   CN = "localhost"
   SAN = "DNS:localhost,IP:127.0.0.1,IP:0.0.0.0,IP:::1"
   + optionnel "DNS:$MKM_HOSTNAME" si l'env var est définie
3. nginx -t (validation config fail-fast)
4. exec nginx -g 'daemon off;'
```

**Pourquoi auto-signé par défaut** : le cas d'usage principal est self-host
LAN/localhost. Let's Encrypt nécessite un domaine public + résolution DNS,
qu'on ne peut pas garantir pour `127.0.0.1`. L'auto-signé est suffisant pour
HTTPS local et active toutes les APIs sensibles (Service Worker, MediaRecorder
si re-add un jour, etc.) qui requirent un secure context.

**Override possible** : monter un volume `/etc/nginx/certs` avec ses propres
`server.crt` + `server.key` (cas user avancé avec mDNS local CA, ou
reverse proxy en amont qui termine TLS).

### Ports

- **8080** (HTTP) → redirect 301 vers HTTPS 8443
- **8443** (HTTPS) → l'app

**Pourquoi non-privilégiés** (8080/8443 vs 80/443) :
- Pas besoin de root sur l'hôte (Docker rootless, Podman, k8s)
- Évite les conflits avec un autre service sur 443 (cas typique : un Apache
  perso déjà en place)
- L'user peut toujours mapper `-p 443:8443` côté hôte si nécessaire

### Config Nginx

`docker/nginx-docker.conf` réutilise la **CSP stricte** de
`docs/nginx-csp-config.conf` (prod) — cohérence sécurité.

Différences vs prod :
- Pas de HSTS (cert auto-signé : ne pas forcer HTTPS persistant côté
  navigateur user, qui empêcherait un futur switch)
- `Permissions-Policy: microphone=(self)` autorisé (commande vocale E1)
- Cache : 1 jour pour les assets statiques, `no-store` pour `version.json`
  et `sw.js` (le SW gère l'invalidation via bump `CACHE_NAME`)

### Healthcheck

```dockerfile
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3
  CMD wget -qO- --no-check-certificate https://127.0.0.1:8443/index.html >/dev/null 2>&1 || exit 1
```

- `--no-check-certificate` (alias `-k` en curl) : on accepte le cert auto-signé
- Vérifie que Nginx répond ET sert bien `index.html` (pas juste un 404)
- 30s d'intervalle, 5s timeout, 3 retries → conteneur considéré "unhealthy"
  après 1m30 sans réponse

## Workflow CI/CD

`.github/workflows/docker.yml`

### Déclenchement

- Trigger automatique sur tag `v*.*.*` (créé par `release.yml`)
- Trigger manuel via UI pour rebuild un tag existant (cas : un patch de
  Nginx Alpine vient de sortir, on veut rebaser l'image sans bumper la version)

### Multi-arch

Build pour 2 plateformes :
- `linux/amd64` → PC x86_64 desktop/serveur
- `linux/arm64` → Raspberry Pi 4/5, Synology ARM, Apple Silicon

Pas de `linux/arm/v7` (Pi 2/3) — coût build x2 pour une demande basse.
Ajoutable si demande utilisateur le justifie.

### Tags poussés

Pour le tag `v1.36.0`, on pousse 4 tags Docker :

| Tag | Cas d'usage |
|---|---|
| `latest` | "donne-moi la dernière" — pour les users qui ne veulent pas pinner |
| `v1.36.0` | exact version, immutable (pinning fort) |
| `1.36` | minor stream, reçoit les patches `1.36.x` |
| `1` | major stream, reçoit les minors `1.x` (semver) |

### Cache build

Le workflow utilise `cache-from`/`cache-to` avec le registry comme backend :

```yaml
cache-from: type=registry,ref=ghcr.io/.../buildcache
cache-to: type=registry,ref=ghcr.io/.../buildcache,mode=max
```

Premier build = ~5-10 min. Builds suivants = ~2-3 min (les layers Nginx Alpine
sont cachés, seul le COPY assets change).

### Auth ghcr.io

Pas de secret externe à gérer. Le workflow utilise `secrets.GITHUB_TOKEN`
injecté automatiquement avec le scope `packages: write` déclaré dans
`permissions:`.

**Action manuelle UNE FOIS** : après le premier push, rendre l'image publique
via `Settings → Packages → myktamap → Package settings → Change visibility →
Public`. Sinon les users non-loggés ne peuvent pas `docker pull`.

## Gotchas connus

### Cert auto-signé + Service Worker

Chromium/Safari refusent d'installer un Service Worker si le cert n'est pas
de confiance. Workaround utilisateur :
1. Visite `https://localhost:8443/` → page "Votre connexion n'est pas privée"
2. Cliquer "Paramètres avancés" → "Continuer vers localhost (dangereux)"
3. Une fois sur la page, l'origine est marquée temporairement comme trusted
4. Le SW s'enregistre normalement

Sur Firefox : ajouter une exception permanente dans
`about:preferences#privacy` → "Voir les certificats" → "Serveurs" →
"Ajouter une exception".

### Conflit port 8443 sur l'hôte

Si l'utilisateur a déjà un autre service sur 8443, il peut remapper :
```bash
docker run -d -p 9443:8443 ...
# Ouvre https://localhost:9443/
```

### Image arm64 sur ARM x32

Une instance Pi 2/3 (32-bit OS) ne peut pas tirer l'image arm64. Solution :
- Upgrader le Pi en Raspberry Pi OS 64-bit (recommandé)
- OU servir le ZIP selfhost à la main sur un Nginx local du Pi

### Variable d'env `MKM_HOSTNAME`

Si l'utilisateur veut accéder à l'app depuis un hostname custom (ex.
`myktamap.local` via mDNS), il faut :
```bash
docker run -d -p 8443:8443 -e MKM_HOSTNAME=myktamap.local ...
```

Le cert auto-signé inclura alors `myktamap.local` dans les SAN et le
navigateur acceptera mieux le warning sur ce hostname.

## Coût stockage ghcr.io

Estimation par image :
- Manifest + layers compressés : ~25-30 MB par plateforme
- 2 plateformes × image taggée 4× = mais ghcr.io déduplique les layers
  partagés → coût net **~50-60 MB par release**

GHCR free tier : illimité pour les repos publics. Pas de souci de coût.

## Évolutions futures possibles

| Idée | Effort | Bénéfice |
|---|---|---|
| Image `arm/v7` pour Pi 2/3 | 1h workflow | Très peu d'users |
| Helm chart pour Kubernetes | 4h | Plus pro, niche |
| `docker-compose.yml` exemple multi-instance (myktamap + reverse proxy + Let's Encrypt) | 2h | Bon pour onboarding intermédiaire |
| Image alpine "lite" avec assets minifiés en build | 3h | Gain ~20-30% taille image, peu critique |
| Bind mount auto-detect `data/plans` | 1h | UX meilleure pour le custom |

## Maintenance

- Les patches Nginx Alpine sont propagés au prochain build (les `RUN apk add`
  rebuildent depuis le tag `nginx:alpine` qui est mis à jour upstream).
- Pour forcer une rebase sans bump version : `workflow_dispatch` manuel.
- Le cache buildx s'invalide automatiquement quand la base image change ou
  que les fichiers sources changent.
