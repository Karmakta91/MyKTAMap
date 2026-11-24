#!/usr/bin/env bash
# Sonde des certificats TLS : échec si un domaine expire dans moins de SEUIL_JOURS jours (défaut 20).
# Appelée toutes les heures par .github/workflows/sonde-integrite.yml (job « certificats ») ; s'exécute à
# l'identique sur le poste : `bash scripts/release/sonde-certificats.sh [domaine[:port] ...]`.
# Sans argument : les cinq domaines servis. Code de retour : 0 = tout va bien, 1 = au moins une échéance proche.
# Pourquoi : certbot renouvelle à 30 jours de l'échéance ; s'il échoue sans bruit, la coupure serait la première
# alerte. Le seuil sous les 30 jours laisse à certbot sa fenêtre normale avant de crier.
# ⚠️ contrat : un domaine injoignable en TLS n'est qu'un avertissement (::warning::), jamais un échec — un réseau
# capricieux de l'exécuteur ne doit pas noyer la vraie alerte. Seule une date lue sous le seuil échoue (::error::).
# 🩸 piège : dev est réservé au réseau Tailscale en HTTP (403 aux exécuteurs GitHub), mais la poignée de main TLS
# a lieu avant nginx ; si elle cesse de passer depuis GitHub, l'avertissement le dira sans masquer les autres.
# 🩸 piège : `date -d` est la date GNU (Ubuntu, Git Bash) ; un `date` BSD (macOS) ne lit pas ce format.

set -u

SEUIL_JOURS="${SEUIL_JOURS:-20}"
DELAI_S="${DELAI_S:-15}"

if ! [[ "$SEUIL_JOURS" =~ ^[0-9]+$ ]]; then
  echo "::error::SEUIL_JOURS doit être un entier positif (reçu : $SEUIL_JOURS)"
  exit 2
fi

if [ "$#" -eq 0 ]; then
  set -- myktamap.fr www.myktamap.fr dev.myktamap.fr pro.myktamap.fr doc.myktamap.fr
fi

maintenant=$(date -u +%s)
echecs=0

for cible in "$@"; do
  domaine="${cible%%:*}"
  port=443
  [ "$cible" != "$domaine" ] && port="${cible##*:}"

  fin=$(timeout "$DELAI_S" openssl s_client -connect "$domaine:$port" -servername "$domaine" </dev/null 2>/dev/null \
    | openssl x509 -noout -enddate 2>/dev/null | sed -n 's/^notAfter=//p')

  if [ -z "$fin" ]; then
    echo "::warning::$cible : certificat illisible (TLS injoignable en ${DELAI_S} s ou réponse sans certificat)"
    continue
  fi

  fin_s=$(date -u -d "$fin" +%s 2>/dev/null)
  if [ -z "$fin_s" ]; then
    echo "::warning::$cible : date d'expiration illisible (« $fin »)"
    continue
  fi

  # Arrondi vers le bas : 19,9 jours restants comptent pour 19, l'alerte ne part jamais en retard.
  jours=$(( (fin_s - maintenant) / 86400 ))
  if [ "$fin_s" -le "$maintenant" ]; then
    echo "::error::$cible : certificat EXPIRÉ depuis le $(date -u -d "$fin" +%d/%m/%Y)"
    echecs=$((echecs + 1))
  elif [ "$jours" -lt "$SEUIL_JOURS" ]; then
    echo "::error::$cible : certificat expire dans $jours jours (le $(date -u -d "$fin" +%d/%m/%Y)," \
      "seuil $SEUIL_JOURS) — renouvellement à vérifier"
    echecs=$((echecs + 1))
  else
    echo "OK $cible : expire dans $jours jours (le $(date -u -d "$fin" +%d/%m/%Y))"
  fi
done

if [ "$echecs" -gt 0 ]; then
  echo "$echecs certificat(s) sous le seuil de $SEUIL_JOURS jours."
  exit 1
fi
echo "Aucun certificat sous le seuil de $SEUIL_JOURS jours."
