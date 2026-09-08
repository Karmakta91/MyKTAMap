# =====================================================================
# 🚀 deploy.ps1 — déploiement COMPLET MyKTAMap (SFTP via OpenSSH scp)
# =====================================================================
# Chantier n°3 post-v1.76.4 : tue la classe de bugs « upload FTP partiel »
# (docs/ oublié → Audit périmé ; lang/ oublié → clés i18n « manquantes » ;
# README.md racine oublié → bibliothèque qui affiche index.html — tous
# vécus la semaine du 06/08).
#
# USAGE (PowerShell, depuis la racine du repo) :
#   .\scripts\deploy\deploy.ps1              # → DEV (dev.myktamap.fr)
#   .\scripts\deploy\deploy.ps1 -Cible prod  # → PROD (confirmation « PROD » exigée)
#   .\scripts\deploy\deploy.ps1 -AvecData    # inclut data/ (plans de test — DEV uniquement)
#
# PRÉREQUIS (une fois) : copier deploy.config.example.json →
# deploy.config.json (GITIGNORÉ) et remplir hôte/utilisateur/chemins.
# Le mot de passe est demandé par scp à chaque déploiement (jamais stocké) ;
# une clé SSH le supprime si tu en poses une.
#
# CE QUI PART (liste EXPLICITE — ajouter ici tout nouveau dossier livrable) :
#   racine : index.html sw.js version.json killsw.html manifest.json
#            alert.json ping.html confadmin.html denylist.json README.md
#   dossiers : js/ css/ lang/ docs/ icon/ lib/
# CE QUI NE PART JAMAIS SANS -AvecData : data/ (les plans de la PROD sont
#   gérés sur le serveur — les écraser détruirait les vrais plans).
# JAMAIS : .git*, scripts/, docker/, CLAUDE.md, node_modules.
# =====================================================================
param(
  [ValidateSet("dev", "prod")] [string]$Cible = "dev",
  [switch]$AvecData
)
$ErrorActionPreference = "Stop"
$racine = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$confPath = Join-Path $PSScriptRoot "deploy.config.json"

if (-not (Test-Path $confPath)) {
  Write-Host "❌ deploy.config.json absent — copie deploy.config.example.json et remplis-le." -ForegroundColor Red
  exit 1
}
$conf = Get-Content $confPath -Raw | ConvertFrom-Json
$remote = if ($Cible -eq "prod") { $conf.remoteProd } else { $conf.remoteDev }
if (-not $conf.host -or -not $conf.user -or -not $remote) {
  Write-Host "❌ deploy.config.json incomplet (host / user / remoteDev / remoteProd)." -ForegroundColor Red
  exit 1
}

# ---- Garde-fou PROD : confirmation tapée, jamais un simple Entrée ----
if ($Cible -eq "prod") {
  Write-Host ""
  Write-Host "⚠️  CIBLE = PRODUCTION ($($conf.host):$remote)" -ForegroundColor Yellow
  Write-Host "   Rappel : la porte de release (docs/RELEASE_GATE.md) est franchie ? main est mergée ?"
  $saisie = Read-Host "   Tape exactement PROD pour continuer"
  if ($saisie -cne "PROD") { Write-Host "Annulé." ; exit 1 }
  if ($AvecData) { Write-Host "❌ -AvecData est INTERDIT vers la prod (écraserait les vrais plans)." -ForegroundColor Red ; exit 1 }
}

# ---- Staging : copie de la liste d'inclusion vers un dossier temporaire ----
$fichiersRacine = @("index.html","sw.js","version.json","killsw.html","manifest.json",
                    "alert.json","ping.html","confadmin.html","denylist.json","README.md")
$dossiers = @("js","css","lang","docs","icon","lib")
if ($AvecData) { $dossiers += "data" }

$stage = Join-Path $env:TEMP ("myktamap-deploy-" + $Cible)
if (Test-Path $stage) { Remove-Item -Recurse -Force $stage }
New-Item -ItemType Directory -Force $stage | Out-Null

foreach ($f in $fichiersRacine) {
  $src = Join-Path $racine $f
  if (Test-Path $src) { Copy-Item $src $stage }
  else { Write-Host "  ⚠️ absent du repo (ignoré) : $f" -ForegroundColor Yellow }
}
foreach ($d in $dossiers) {
  $src = Join-Path $racine $d
  if (Test-Path $src) { Copy-Item -Recurse $src (Join-Path $stage $d) }
  else { Write-Host "  ⚠️ dossier absent (ignoré) : $d" -ForegroundColor Yellow }
}
# le smoke et ses node_modules ne partent jamais, même si docs/ les côtoie un jour
Remove-Item -Recurse -Force (Join-Path $stage "docs\.checklist-tests.md") -ErrorAction SilentlyContinue
# 🔒 AUDITS SECURITE OFFENSIVE — JAMAIS EN PROD. Ces .md decrivent comment
# exfiltrer des donnees reelles ; servis a une URL publique, ils seraient un
# mode d'emploi telechargeable. Ils sont deja ignores par Git (.gitignore),
# mais ce stage COPIE docs/ depuis le DISQUE : sans cette exclusion, un fichier
# ignore mais present sur disque partirait quand meme au FTP. Double filet.
Get-ChildItem -Path (Join-Path $stage "docs\architecture") -Filter "audit-*.md" -ErrorAction SilentlyContinue |
  ForEach-Object { Remove-Item -Force $_.FullName -ErrorAction SilentlyContinue; Write-Host "   🔒 exclu du deploiement : docs/architecture/$($_.Name)" -ForegroundColor DarkYellow }

$nb = (Get-ChildItem -Recurse -File $stage | Measure-Object).Count
$mo = [math]::Round(((Get-ChildItem -Recurse -File $stage | Measure-Object -Sum Length).Sum / 1MB), 1)
Write-Host ""
Write-Host "📦 Staging : $nb fichiers, $mo Mo → $($conf.user)@$($conf.host):$remote" -ForegroundColor Cyan

# ---- Version embarquée : affichée pour un dernier contrôle visuel ----
$ver = (Get-Content (Join-Path $stage "version.json") -Raw | ConvertFrom-Json).version
$cache = (Select-String -Path (Join-Path $stage "sw.js") -Pattern 'CACHE_NAME = "([^"]+)"').Matches[0].Groups[1].Value
Write-Host "   version.json = $ver · $cache"
if (-not $cache.EndsWith($ver.TrimStart("v")) -and -not $cache.Contains($ver)) {
  Write-Host "   ⚠️ version.json et CACHE_NAME semblent DIVERGER — vérifie avant de continuer !" -ForegroundColor Yellow
}

# ---- Envoi : UN scp récursif = un seul prompt de mot de passe ----
$port = if ($conf.port) { $conf.port } else { 22 }
Write-Host ""
Write-Host "⬆️  Envoi (mot de passe demandé par scp si pas de clé SSH)..." -ForegroundColor Cyan
# OpenSSH WINDOWS obligatoire : le scp de Git Bash (/usr/bin/scp) ne
# comprend pas les chemins C: — attrapé au test à blanc du script.
# Redirection WOW64 : un PowerShell 32-bit voit un System32 SANS OpenSSH →
# on tente Sysnative puis System32, puis le PATH en excluant celui de Git.
$scpExe = @((Join-Path $env:SystemRoot 'Sysnative\OpenSSH\scp.exe'), (Join-Path $env:SystemRoot 'System32\OpenSSH\scp.exe')) | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $scpExe) { $c = Get-Command scp.exe -ErrorAction SilentlyContinue | Where-Object { $_.Source -notmatch 'Git' } | Select-Object -First 1 ; if ($c) { $scpExe = $c.Source } }
if (-not $scpExe) { Write-Host 'Client OpenSSH Windows absent — Paramètres > Fonctionnalités facultatives.' -ForegroundColor Red ; exit 1 }
& $scpExe -r -P $port (Join-Path $stage '.') ($conf.user + '@' + $conf.host + ':' + $remote + '/')
if ($LASTEXITCODE -ne 0) {
  Write-Host "❌ scp a signalé des erreurs (code $LASTEXITCODE)." -ForegroundColor Red
  Write-Host ""
  Write-Host "   CAS CONNU (post-mortem 09/08) : si TOUS les fichiers affichent 100% et que les" -ForegroundColor Yellow
  Write-Host "   seules erreurs sont « remote setstat ... : Permission denied » sur des DOSSIERS," -ForegroundColor Yellow
  Write-Host "   le CONTENU est bien transféré — mais les dossiers du serveur ne t'appartiennent" -ForegroundColor Yellow
  Write-Host "   plus (chown www-data) et scp ne peut plus poser leurs attributs." -ForegroundColor Yellow
  Write-Host "   FIX DÉFINITIF (une fois, en SSH sur le serveur — nginx n'a besoin que de LIRE) :" -ForegroundColor Yellow
  Write-Host "     sudo chown -R `$(whoami) $remote && chmod -R a+rX $remote" -ForegroundColor Cyan
  Write-Host "   puis relance ce script : il repassera au vert." -ForegroundColor Yellow
  Write-Host ""
  Write-Host "   Toute AUTRE erreur (auth, réseau, fichier refusé) = vrai échec, rien à considérer" -ForegroundColor Red
  Write-Host "   comme déployé." -ForegroundColor Red
  exit $LASTEXITCODE
}

Remove-Item -Recurse -Force $stage

# ---- Normalisation des DROITS après envoi (post-mortem du 08/08) ----
# scp crée les nouveaux fichiers/dossiers avec l'umask du compte SFTP :
# sans lecture « others », nginx (www-data) ne peut plus les servir → la
# dev de KARMA est tombée en 404 généralisé alors que le transfert était
# 100 % OK. `a+rX` = lecture pour tous + traversée des dossiers, suffisant
# pour servir (le chown www-data reste la convention serveur de KARMA,
# hors périmètre : il exigerait sudo). 2e prompt de mot de passe (ou clé SSH).
$sshExe = Join-Path (Split-Path $scpExe) "ssh.exe"
Write-Host "🔧 Normalisation des droits (chmod -R a+rX)..." -ForegroundColor Cyan
& $sshExe -p $port ($conf.user + "@" + $conf.host) ("chmod -R a+rX '" + $remote + "'")
if ($LASTEXITCODE -ne 0) {
  Write-Host "⚠️ chmod distant échoué — le site peut répondre 404 tant que les droits ne sont pas corrigés :" -ForegroundColor Yellow
  Write-Host "   à lancer à la main :  chmod -R a+rX $remote" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "✅ Déployé sur $Cible ($ver)." -ForegroundColor Green
Write-Host "   Prochaines étapes : killsw.html sur ton navigateur → badge version = $ver"
Write-Host "   → Audit réseau en tête = $ver → console sans « Clé manquante »."
