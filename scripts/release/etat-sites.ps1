# =====================================================================
# 🛰️ etat-sites.ps1 — ce qui tourne VRAIMENT sur dev et prod, comparé aux branches
# =====================================================================
# Audit CD du 09/10/2026 (Q2). Lecture seule, aucun secret : interroge les deux sites comme un
# navigateur et compare à `origin/Karma_dev` et `origin/main`.
#
# Pour chaque site :
#   • version servie (`version.json`) et cache du Service Worker (`sw.js > CACHE_NAME`) ;
#   • commit en ligne (`deploiement.json`, écrit par les scripts de déploiement) — la version seule ne
#     suffit pas : on commite sans bump, un même numéro couvre plusieurs commits ;
#   • en-têtes `no-cache` de `sw.js` et `version.json` (sans eux, les appareils ne voient plus les
#     mises à jour, sans aucune erreur) ;
#   • doc interne NON servie (`docs/BACKLOG.md`, `README.md`).
# 🩸 Toute adresse inconnue répond 200 avec la page de l'app : on lit le CONTENU, jamais le code HTTP.
#
# Codes de sortie : 0 = les deux sites sont à jour et sains · 1 = au moins un écart ou un défaut.
#
# Usage :
#   powershell -ExecutionPolicy Bypass -File scripts\release\etat-sites.ps1
# =====================================================================
[CmdletBinding()]
param()

$ErrorActionPreference = "Continue"

function Ok($t)   { Write-Host "  [OK] $t" -ForegroundColor Green }
function Ko($t)   { Write-Host "  [KO] $t" -ForegroundColor Red }
function Avert($t) { Write-Host "  [!!] $t" -ForegroundColor Yellow }
function Info($t) { Write-Host "  $t" -ForegroundColor Gray }

$racine = (git rev-parse --show-toplevel 2>$null)
if (-not $racine) { Ko "Pas dans un dépôt Git."; exit 1 }
Set-Location $racine
if (-not (Get-Command curl.exe -ErrorAction SilentlyContinue)) { Ko "curl.exe introuvable."; exit 1 }

git fetch origin --quiet 2>$null
if ($LASTEXITCODE -ne 0) { Avert "git fetch impossible : comparaison avec l'état local des branches distantes" }

function Lire($url) { return ((& curl.exe -s --max-time 15 $url) -join "`n") }
function EnTete($url) { return ((& curl.exe -sI --max-time 15 $url) -join "`n") }
function VersionDe($json) {
  $m = [regex]::Match($json, '"version"\s*:\s*"([^"]+)"')
  if ($m.Success) { return $m.Groups[1].Value } else { return $null }
}

$sites = @(
  @{ nom = "dev";  domaine = "dev.myktamap.fr"; branche = "Karma_dev" },
  @{ nom = "prod"; domaine = "myktamap.fr";     branche = "main" }
)
$defauts = 0

foreach ($s in $sites) {
  $base = "https://" + $s.domaine
  $ref  = "origin/" + $s.branche
  Write-Host ""
  Write-Host ("── " + $s.nom + " · " + $s.domaine + " (branche " + $s.branche + ")") -ForegroundColor Cyan

  $shaBranche = (git rev-parse $ref 2>$null)
  $vBranche   = VersionDe ((git show "${ref}:version.json" 2>$null) -join "`n")
  $ts = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()

  # Version servie et cache du Service Worker
  $vServie = VersionDe (Lire "$base/version.json?_=$ts")
  $mCache  = [regex]::Match((Lire "$base/sw.js"), 'myktamap-cache-(v[0-9.]+)')
  $vCache  = if ($mCache.Success) { $mCache.Groups[1].Value } else { $null }
  if (-not $vServie) { Ko "version.json illisible"; $defauts++ }
  elseif ($vCache -ne $vServie) { Ko "sw.js sert le cache « $vCache », version.json dit $vServie"; $defauts++ }
  else { Ok "version servie $vServie (cache du Service Worker identique)" }

  # Commit en ligne
  $dep = Lire "$base/deploiement.json?_=$ts"
  $mSha = [regex]::Match($dep, '"commit"\s*:\s*"([0-9a-f]{40})"')
  if (-not $mSha.Success) {
    Avert "commit en ligne inconnu (deploiement.json absent : site pas encore déployé par les scripts du 09/10)"
    if ($vServie -and $vBranche -and $vServie -ne $vBranche) {
      Ko "version en ligne $vServie, branche $($s.branche) en $vBranche"; $defauts++
    }
  } else {
    $shaServi = $mSha.Groups[1].Value
    $mDate = [regex]::Match($dep, '"date"\s*:\s*"([^"]+)"')
    $quand = if ($mDate.Success) { " (déployé le " + $mDate.Groups[1].Value + ")" } else { "" }
    $court = $shaServi.Substring(0, 8)
    if ($shaServi -eq $shaBranche) {
      Ok "commit en ligne $court = $ref$quand"
    } else {
      git merge-base --is-ancestor $shaServi $shaBranche 2>$null
      if ($LASTEXITCODE -eq 0) {
        $retard = (git rev-list --count "$shaServi..$shaBranche").Trim()
        Ko "en retard de $retard commit(s) sur $ref : en ligne $court$quand, branche en $vBranche"
        git log --oneline "$shaServi..$shaBranche" | Select-Object -First 8 | ForEach-Object { Info "    $_" }
      } else {
        Ko "le commit en ligne $court$quand n'est PAS dans $ref (retour arrière, ou branche réécrite)"
      }
      $defauts++
    }
  }

  # En-têtes anti-cache
  foreach ($f in @("sw.js", "version.json")) {
    if ((EnTete "$base/$f") -match '(?im)^cache-control:.*no-cache') { Ok "$f servi en no-cache" }
    else { Ko "$f servi SANS no-cache : les appareils ne verraient plus les mises à jour"; $defauts++ }
  }

  # Doc interne : jamais servie (audit CD, F1)
  foreach ($f in @("docs/BACKLOG.md", "README.md")) {
    $debut = Lire "$base/$f"
    if ($debut.TrimStart().StartsWith("# ")) { Ko "$f est servi publiquement (doc interne)"; $defauts++ }
    else { Ok "$f non servi" }
  }
}

Write-Host ""
if ($defauts -eq 0) { Write-Host "✅ dev et prod à jour et sains." -ForegroundColor Green; exit 0 }
Write-Host "⚠️ $defauts écart(s) ou défaut(s) — voir ci-dessus." -ForegroundColor Yellow
exit 1
