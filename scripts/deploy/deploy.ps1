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
  Write-Host "❌ scp a échoué (code $LASTEXITCODE) — RIEN à considérer comme déployé." -ForegroundColor Red
  exit $LASTEXITCODE
}

Remove-Item -Recurse -Force $stage
Write-Host ""
Write-Host "✅ Déployé sur $Cible ($ver)." -ForegroundColor Green
Write-Host "   Prochaines étapes : killsw.html sur ton navigateur → badge version = $ver"
Write-Host "   → Audit réseau en tête = $ver → console sans « Clé manquante »."
