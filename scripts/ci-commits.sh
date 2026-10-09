#!/bin/sh
# ============================================================
# 🚦 CI — contrôles sur les COMMITS reçus (audit CI/CD du 08/10/2026, Q1)
# ============================================================
# Le pre-commit vérifie les fichiers INDEXÉS : sur GitHub, rien ne l'est, donc l'anti-fuite pro et
# `data/` hors Git passeraient à vide. Ce script rejoue ces deux contrôles sur les commits que le push
# (ou la PR) apporte : un commit fait avec --no-verify, depuis un poste sans hooks, ou par l'éditeur
# web de GitHub, ne passe plus en silence.
#
#   - data/ : commit par commit, avec SON message (la dérogation `Data-deroge:` reste possible) ;
#   - anti-fuite : tous les fichiers touchés par la plage, contenu tel qu'il est au dernier commit.
#
# Plage : PR → base..HEAD ; push → avant..HEAD ; branche neuve / historique réécrit → dernier commit.
# Variables (posées par .github/workflows/ci.yml) : KTA_BASE (PR), KTA_AVANT (push).
set -e

plage="HEAD~1..HEAD"
if [ -n "$KTA_BASE" ]; then
  plage="$KTA_BASE..HEAD"
elif [ -n "$KTA_AVANT" ] && ! echo "$KTA_AVANT" | grep -qE '^0+$' && git cat-file -e "$KTA_AVANT^{commit}" 2>/dev/null; then
  plage="$KTA_AVANT..HEAD"
fi
echo "[ci-commits] plage contrôlée : $plage ($(git rev-list --count "$plage") commit(s))"

msg=$(mktemp)
ko=0
for c in $(git rev-list "$plage"); do
  fichiers=$(git diff-tree --no-commit-id --name-only -r --diff-filter=ACMR "$c")
  git log -1 --format=%B "$c" > "$msg"
  if ! KTA_FICHIERS_CI="$fichiers" node scripts/check-data-hors-git.js "$msg"; then
    echo "   ↑ commit $(git log -1 --format='%h %s' "$c")"
    ko=1
  fi
done
rm -f "$msg"

KTA_FICHIERS_CI="$(git diff --name-only --diff-filter=ACMR "$plage")" node scripts/check-no-pro-leak.js || ko=1

exit $ko
