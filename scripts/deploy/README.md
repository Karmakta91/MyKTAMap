# 🚀 Déploiement complet (SFTP / OpenSSH)

Tue la classe de bugs « upload partiel » (docs/ → Audit périmé, lang/ →
clés « manquantes », README racine → bibliothèque cassée — vécus 3× la
semaine du 06/08). Indépendant de Terminus (qui reste ton client visuel) :
utilise le client OpenSSH intégré à Windows.

## Mise en place (une fois)

```powershell
cd scripts\deploy
copy deploy.config.example.json deploy.config.json   # GITIGNORÉ
# → remplir host / user / port (les chemins dev & prod sont pré-remplis)
```

## Déployer

```powershell
.\scripts\deploy\deploy.ps1              # → DEV
.\scripts\deploy\deploy.ps1 -Cible prod  # → PROD (taper « PROD » pour confirmer)
.\scripts\deploy\deploy.ps1 -AvecData    # + data/ (plans de test — DEV SEULEMENT, interdit vers prod)
```

Le mot de passe SFTP est demandé par scp à chaque envoi (jamais stocké).
Une clé SSH (`ssh-keygen` + clé publique sur le serveur) supprime le prompt.

## Ce qui part / ne part pas

- **Part** : `index.html sw.js version.json killsw.html manifest.json
  alert.json ping.html confadmin.html denylist.json README.md` + `js/ css/
  lang/ docs/ icon/ lib/`
- **Jamais sans `-AvecData`** : `data/` — les plans de la **prod** vivent sur
  le serveur, les écraser détruirait les vrais plans (le flag est refusé en prod).
- **Jamais** : `.git*`, `scripts/`, `docker/`, `CLAUDE.md`.

Avant l'envoi, le script affiche **version.json + CACHE_NAME** et avertit
s'ils divergent. Après : `killsw.html` → badge version → Audit → console propre.
