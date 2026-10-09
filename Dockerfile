# =====================================================================
# MyKTAMap — Dockerfile (v1.36.0)
# =====================================================================
# Image OCI auto-suffisante : Nginx Alpine + assets MyKTAMap + cert TLS
# auto-signé généré au premier démarrage du conteneur.
#
# Build :
#   docker build -t myktamap:dev .
#
# Run (par défaut, ports 8080 HTTP + 8443 HTTPS) :
#   docker run -d --name myktamap -p 8443:8443 -p 8080:8080 myktamap:dev
#
# Ouvre ensuite https://localhost:8443/ dans ton navigateur. Accepte le
# warning de sécurité (cert auto-signé), l'app charge avec son Service
# Worker. Le HTTP (8080) redirige vers HTTPS.
#
# Volumes optionnels :
#   -v /mes/plans:/usr/share/nginx/html/data/plans  → bind tes plans
#   -v /mes/certs:/etc/nginx/certs                   → cert TLS user-fournit
#
# Variables d'env :
#   MKM_HOSTNAME=monhost.local  → SAN supplémentaire dans le cert auto-signé
# =====================================================================

# --- Stage 1 : prepare assets ----------------------------------------
# On utilise alpine intermédiaire juste pour avoir rsync/find disponibles
# au moment d'exclure les fichiers non-runtime (.git, scripts dev, etc.).
FROM alpine:3.20 AS assets

# Installe rsync (~5 MB) — utilisé pour copier proprement avec exclusions
RUN apk add --no-cache rsync

WORKDIR /src
COPY . /src/

# Reproduit la logique d'exclusion du workflow GitHub Actions release.yml
# (section "Construire le package selfhost") pour cohérence ZIP <-> Docker.
# 🩸 docs/ : seul docs/applications/ (ce que l'app lit) est livré, ni le README.md racine — avant le
# 09/10/2026, le BACKLOG, les audits et la porte de release partaient dans l'image (audit CD, F1).
# Mêmes règles que le ZIP de release.yml et les scripts de déploiement (scripts/check-livrables-docs.js).
RUN mkdir -p /www && \
    rsync -a \
      --include='/docs/' \
      --include='/docs/applications/***' \
      --exclude='/docs/*' \
      --exclude='/README.md' \
      --exclude='.git' \
      --exclude='.github' \
      --exclude='.githooks' \
      --exclude='.gitignore' \
      --exclude='.gitattributes' \
      --exclude='.claude' \
      --exclude='.claude/**' \
      --exclude='CLAUDE.md' \
      --exclude='scripts/' \
      --exclude='Licence-pro.json' \
      --exclude='Dockerfile' \
      --exclude='docker/' \
      --exclude='.DS_Store' \
      --exclude='Thumbs.db' \
      --exclude='node_modules' \
      /src/ /www/

# --- Stage 2 : runtime image -----------------------------------------
# nginx:alpine — image officielle, ~40 MB, Nginx 1.27+ stable.
FROM nginx:alpine

# Métadonnées OCI (s'affichent sur GHCR/Docker Hub)
LABEL org.opencontainers.image.title="MyKTAMap"
LABEL org.opencontainers.image.description="Cartographie souterraine (cataphiles, spéléo, sites souterrains) — image self-host avec HTTPS auto-signé."
LABEL org.opencontainers.image.source="https://github.com/Karmakta91/MyKTAMap"
LABEL org.opencontainers.image.licenses="CC-BY-NC-SA-4.0"
LABEL org.opencontainers.image.authors="Flavien VIDAL (alias KARMA)"
LABEL org.opencontainers.image.url="https://myktamap.fr"

# Installe openssl (génération cert auto-signé) + tini (init PID 1 propre)
RUN apk add --no-cache openssl tini

# Copie assets depuis le stage 1
COPY --from=assets /www/ /usr/share/nginx/html/

# Copie config Nginx custom + entrypoint
COPY docker/nginx-docker.conf /etc/nginx/nginx.conf
COPY docker/entrypoint.sh /docker-entrypoint-mkm.sh
# Fins de ligne Unix forcées : un checkout Windows (core.autocrlf=true) livre le
# script en CRLF, et « #!/bin/sh\r » est introuvable → le conteneur ne démarre pas.
RUN sed -i 's/\r$//' /docker-entrypoint-mkm.sh && chmod +x /docker-entrypoint-mkm.sh

# Dossier pour les certs générés runtime (peut être bind-mounted en volume)
RUN mkdir -p /etc/nginx/certs && chown -R nginx:nginx /etc/nginx/certs

# Ports exposés (non-privilégiés pour éviter conflits hôte 80/443)
EXPOSE 8080 8443

# Healthcheck : vérifie que nginx répond sur HTTPS local (cert auto-signé → -k)
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- --no-check-certificate https://127.0.0.1:8443/index.html >/dev/null 2>&1 || exit 1

# tini gère les signaux (SIGTERM, SIGINT) proprement pour le shutdown
ENTRYPOINT ["/sbin/tini", "--", "/docker-entrypoint-mkm.sh"]
