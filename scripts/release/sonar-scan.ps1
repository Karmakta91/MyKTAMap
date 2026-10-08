# =====================================================================
# 🔍 sonar-scan.ps1 — analyse SonarQube du dépôt + verdict de la porte qualité
# =====================================================================
# Marche 1ter de `docs/RELEASE_GATE.md`, appelée par `merge-main.ps1`
# (et lançable seule). Le serveur SonarQube tourne en LOCAL (Docker, hors
# dépôt) : un runner GitHub hébergé ne peut pas le joindre, d'où ce script.
#
# Prérequis :
#   • le serveur SonarQube est démarré (http://localhost:9000) ;
#   • la variable d'environnement utilisateur SONAR_TOKEN contient un jeton
#     d'analyse du projet `MyKTAMap` — jamais écrit dans le dépôt.
#
# 🩸 `data/**` est exclu EN DUR : les relevés réels de terrain ne partent
# jamais dans la base Sonar, même locale.
#
# Codes de sortie : 0 = porte OK · 2 = porte en ÉCHEC sur le nouveau code
#                   1 = analyse impossible (serveur éteint, jeton absent, scan KO)
#
# Usage :
#   powershell -ExecutionPolicy Bypass -File scripts\release\sonar-scan.ps1
# =====================================================================
[CmdletBinding()]
param(
  [string]$Hote = "http://localhost:9000",
  [string]$Projet = "MyKTAMap"
)

$ErrorActionPreference = "Continue"

function Ok($t)   { Write-Host "  [OK] $t" -ForegroundColor Green }
function Ko($t)   { Write-Host "  [KO] $t" -ForegroundColor Red }
function Info($t) { Write-Host "  $t" -ForegroundColor Gray }

$racine = (git rev-parse --show-toplevel 2>$null)
if (-not $racine) { Ko "Pas dans un dépôt Git."; exit 1 }
$racine = $racine -replace '/', '\'

$jeton = $env:SONAR_TOKEN
if (-not $jeton) { $jeton = [Environment]::GetEnvironmentVariable("SONAR_TOKEN", "User") }
if (-not $jeton) { Ko "SONAR_TOKEN absent (variable d'environnement utilisateur)."; exit 1 }
$entetes = @{ Authorization = "Bearer $jeton" }

# Le serveur répond-il ? Sinon inutile de lancer un conteneur pour rien.
try {
  $etat = (Invoke-RestMethod -TimeoutSec 5 "$Hote/api/system/status").status
} catch { $etat = $null }
if ($etat -ne "UP") {
  Ko "SonarQube injoignable sur $Hote (état : $etat). Démarre-le : docker compose up -d"
  exit 1
}

$version = (Get-Content (Join-Path $racine "version.json") -Raw | ConvertFrom-Json).version
Info "analyse de $Projet $version (2 à 5 min) ..."

# 🩸 Sortie du scanner dans des FICHIERS (Start-Process) : en PS 5.1, `2>&1`
# sur un exécutable natif emballe chaque ligne de stderr dans un ErrorRecord.
$tmp = Join-Path $env:TEMP ("mkm-sonar-" + [guid]::NewGuid().ToString("N"))
$env:SONAR_TOKEN = $jeton
$arguments = @(
  "run", "--rm", "-e", "SONAR_TOKEN",
  "-e", "SONAR_HOST_URL=$($Hote -replace 'localhost|127\.0\.0\.1', 'host.docker.internal')",
  "-v", "`"${racine}:/usr/src`"",
  "sonarsource/sonar-scanner-cli:latest",
  "-Dsonar.projectKey=$Projet",
  "-Dsonar.projectVersion=$version",
  "-Dsonar.sources=js,sw.js,css,index.html",
  "-Dsonar.exclusions=data/**,lib/**,docs/**,lang/**,**/node_modules/**,scripts/smoke/**",
  "-Dsonar.sourceEncoding=UTF-8"
)
$p = Start-Process docker -ArgumentList $arguments -NoNewWindow -Wait -PassThru `
  -RedirectStandardOutput "$tmp.out" -RedirectStandardError "$tmp.err"
$sortie = @(Get-Content "$tmp.out", "$tmp.err" -ErrorAction SilentlyContinue)
Remove-Item "$tmp.out", "$tmp.err" -ErrorAction SilentlyContinue
if ($p.ExitCode -ne 0) {
  $sortie | Where-Object { $_ -match "ERROR" } | Select-Object -First 5 | ForEach-Object { Ko $_ }
  Ko "le scanner sort en erreur (code $($p.ExitCode))."
  exit 1
}

# Le serveur traite le rapport en différé : on attend la fin de SA tâche,
# pour juger CETTE analyse et pas la précédente.
$m = [regex]::Match(($sortie -join "`n"), 'api/ce/task\?id=([A-Za-z0-9_-]+)')
if (-not $m.Success) { Ko "identifiant de tâche introuvable dans la sortie du scanner."; exit 1 }
$tache = $null
for ($i = 0; $i -lt 60; $i++) {
  $tache = (Invoke-RestMethod -Headers $entetes "$Hote/api/ce/task?id=$($m.Groups[1].Value)").task
  if ($tache.status -notin @("PENDING", "IN_PROGRESS")) { break }
  Start-Sleep -Seconds 2
}
if ($tache.status -ne "SUCCESS") { Ko "traitement du rapport : $($tache.status)."; exit 1 }

$porte = (Invoke-RestMethod -Headers $entetes `
  "$Hote/api/qualitygates/project_status?analysisId=$($tache.analysisId)").projectStatus
if ($porte.status -eq "ERROR") {
  $porte.conditions | Where-Object { $_.status -eq "ERROR" } | ForEach-Object {
    Ko "$($_.metricKey) = $($_.actualValue) (seuil $($_.comparator) $($_.errorThreshold))"
  }
  Ko "porte qualité en ÉCHEC sur le nouveau code — $Hote/dashboard?id=$Projet"
  exit 2
}
Ok "porte qualité $($porte.status) — $Hote/dashboard?id=$Projet"
exit 0
