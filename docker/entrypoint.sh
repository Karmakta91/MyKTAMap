#!/bin/sh
# =====================================================================
# MyKTAMap — Entrypoint Docker (v1.36.0)
# =====================================================================
# Lance Nginx avec HTTPS (cert auto-signé généré à la volée si absent).
#
# Comportement :
#   1. Si /etc/nginx/certs/server.crt + server.key existent
#      (= volume monté avec cert user-fournit) → on les utilise.
#   2. Sinon → génération d'un cert auto-signé via openssl.
#      CN = "localhost", SAN = "localhost, 127.0.0.1, ::1" (+ $MKM_HOSTNAME si défini)
#   3. Lance nginx en foreground (PID 1 via tini).
#
# Le cert généré est valable 365 jours. Pour une instance long-running,
# l'user peut soit monter son propre cert via volume, soit redémarrer
# le conteneur annuellement.
# =====================================================================

set -e

CERT_DIR="/etc/nginx/certs"
CERT_FILE="$CERT_DIR/server.crt"
KEY_FILE="$CERT_DIR/server.key"

# Affiche un banner au boot pour confirmer la version
echo "==============================================="
echo "  MyKTAMap — self-host Docker"
echo "  https://myktamap.fr  ·  https://github.com/Karmakta91/MyKTAMap"
echo "==============================================="

# --- 1. Cert TLS : génère si absent --------------------------------
if [ -f "$CERT_FILE" ] && [ -f "$KEY_FILE" ]; then
    echo "[entrypoint] Cert TLS user-fournit détecté ($CERT_FILE)"
else
    echo "[entrypoint] Génération du cert TLS auto-signé…"

    # Construit la liste des SAN. Toujours : localhost + 127.0.0.1 + ::1
    # En option : ajout de la valeur de l'env MKM_HOSTNAME (ex. "monhost.local")
    SAN="DNS:localhost,IP:127.0.0.1,IP:0.0.0.0,IP:::1"
    if [ -n "$MKM_HOSTNAME" ]; then
        echo "[entrypoint]  + SAN supplémentaire : $MKM_HOSTNAME"
        SAN="$SAN,DNS:$MKM_HOSTNAME"
    fi

    mkdir -p "$CERT_DIR"

    # openssl req génère cert + clé en une commande
    #   -x509       : auto-signé (vs CSR)
    #   -nodes      : pas de passphrase sur la clé (sinon nginx peut pas la lire au start)
    #   -newkey rsa:2048 : nouvelle clé RSA 2048 bits (bon compromis perf/sécu pour selfhost)
    #   -days 365   : valide 1 an
    #   -subj       : champ CN minimaliste
    #   -addext     : ajoute Subject Alternative Names (obligatoire post-Chrome 58)
    openssl req \
        -x509 \
        -nodes \
        -newkey rsa:2048 \
        -days 365 \
        -keyout "$KEY_FILE" \
        -out "$CERT_FILE" \
        -subj "/CN=localhost/O=MyKTAMap self-host" \
        -addext "subjectAltName=$SAN" \
        2>/dev/null

    chmod 600 "$KEY_FILE"
    chmod 644 "$CERT_FILE"

    echo "[entrypoint] ✅ Cert TLS auto-signé prêt"
    echo "[entrypoint]    Fingerprint SHA-256 :"
    openssl x509 -in "$CERT_FILE" -noout -fingerprint -sha256 | sed 's/^/[entrypoint]    /'
fi

# --- 2. Test config nginx avant start (fail-fast) ----------------
echo "[entrypoint] Validation config Nginx…"
nginx -t

# --- 3. Lance nginx en foreground -------------------------------
echo "[entrypoint] 🚀 Démarrage Nginx"
echo "[entrypoint]    HTTPS : https://localhost:8443/"
echo "[entrypoint]    HTTP  : http://localhost:8080/  (redirige vers HTTPS)"
echo "==============================================="

# `nginx -g 'daemon off;'` = mode foreground pour que Docker garde le conteneur vivant
exec nginx -g 'daemon off;'
