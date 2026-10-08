# =====================================================================
# 🚀 merge-main.ps1 — passer Karma_dev sur main, sans oublier une marche
# =====================================================================
# À EXÉCUTER PAR KARMA. Claude ne peut pas : `.claude/hooks/guard-git.js`
# lui interdit en dur tout push vers `main` sur le repo community.
#
# Ce que ce script fait POUR toi (et refuse de sauter) :
#   1. l'arbre de travail est propre ;
#   2. tu n'es pas sur `Chig_Dev` (branche collaborateur, intouchable) ;
#   3. les TROIS sources de version disent la même chose — un `CACHE_NAME`
#      oublié, et la mise à jour n'atteint jamais personne ;
#   4. la suite complète des garde-fous est verte ;
#      4bis. la porte qualité SonarQube est OK sur le nouveau code
#      (`sonar-scan.ps1` ; serveur éteint = dérogation tapée, jamais en silence) ;
#   5. `main` est à jour vis-à-vis du dépôt distant (sinon le merge diverge), et la CI GitHub du commit
#      à merger est VERTE (branche poussée telle quelle ; protection de branche payante en dépôt privé) ;
#   6. il te montre ce qui va partir, puis attend une confirmation TAPÉE.
#
# 🩸 CE QU'IL NE PEUT PAS VÉRIFIER, et qu'il te DEMANDE donc explicitement :
# les marches 2 à 4 de `docs/RELEASE_GATE.md` — smoke test sur dev, checkup
# ciblé, trempage. Aucun script n'exécute l'app dans un navigateur ; c'est
# exactement le trou que la porte de release existe pour combler. Répondre
# « oui » sans les avoir faites, c'est se mentir à soi-même, pas au script.
#
# Usage :
#   powershell -ExecutionPolicy Bypass -File scripts\release\merge-main.ps1
#   ... -SkipGuards   → saute la suite de garde-fous (déjà tournée à l'instant)
#   ... -DryRun       → montre tout, ne touche à rien
# =====================================================================
[CmdletBinding()]
param(
  [switch]$SkipGuards,
  [switch]$DryRun
)

$ErrorActionPreference = "Stop"

function Titre($t) { Write-Host ""; Write-Host "── $t " -ForegroundColor Cyan }
function Ok($t)    { Write-Host "  [OK] $t" -ForegroundColor Green }
function Ko($t)    { Write-Host "  [KO] $t" -ForegroundColor Red }
function Info($t)  { Write-Host "  $t" -ForegroundColor Gray }
function Stop-Net($t) { Write-Host ""; Write-Host "⛔ $t" -ForegroundColor Red; Write-Host ""; exit 1 }

# Toujours travailler depuis la racine du dépôt, quel que soit le dossier courant.
$racine = (git rev-parse --show-toplevel 2>$null)
if (-not $racine) { Stop-Net "Pas dans un dépôt Git." }
Set-Location $racine

Write-Host ""
Write-Host "🚀 MyKTAMap — mise sur main" -ForegroundColor Yellow
if ($DryRun) { Write-Host "   (DRY RUN — rien ne sera modifié)" -ForegroundColor Yellow }

# ───────── 1. la branche ─────────
Titre "1. Branche"
$branche = (git rev-parse --abbrev-ref HEAD).Trim()
Info "branche courante : $branche"
if ($branche -eq "Chig_Dev") {
  Stop-Net "Chig_Dev est la branche d'un collaborateur — on n'y touche pas."
}
if ($branche -eq "main") {
  Stop-Net "Tu es déjà sur main. Ce script part d'une branche de travail."
}
Ok "branche de travail valide"

# ───────── 2. arbre propre ─────────
# 🩸 27/09/2026 (KARMA : « je peux pas merge main car il me dit que j'ai pas
# commité index.json — normal, je ne veux plus que data/ soit livré chez nous »)
# — `data/` EST UNE EXCEPTION, et c'est la règle du dépôt qui le dit.
#
# `data/` reçoit des relevés RÉELS de terrain et ne part jamais sur le dépôt
# public (cf `.githooks/commit-msg` + `scripts/check-data-hors-git.js`, qui
# REFUSENT tout fichier `data/` indexé). Le piège : `data/index.json` est, lui,
# SUIVI par Git — il porte le relevé fictif de démonstration. Dès que KARMA
# ouvre un vrai plan, ce fichier diverge localement… et l'arbre n'est donc
# JAMAIS propre. Ce contrôle bloquait ainsi toute release, pour la seule raison
# que la règle de confidentialité du dépôt était respectée.
#
# On distingue donc deux choses que le message d'erreur confondait :
#   • du MOTEUR non commité (js/, css/, index.html, sw.js, docs, scripts…)
#     → bloquant, c'est le sens de ce garde-fou : on ne merge pas un travail
#       à moitié enregistré ;
#   • `data/` qui diverge → NORMAL, et même souhaitable. Rien n'en sera
#     commité (le hook s'en assure) et le merge ne touche pas ces fichiers :
#     `main` gardera sa version publique du fichier.
# On le signale quand même, pour que ce ne soit jamais une surprise silencieuse.
Titre "2. Arbre de travail"
$saleTout  = @(git status --porcelain)
$saleData  = @($saleTout | Where-Object { $_ -match '^..\s+"?data/' })
$saleMoteur = @($saleTout | Where-Object { $_ -notmatch '^..\s+"?data/' })
if ($saleMoteur.Count -gt 0) {
  Write-Host ($saleMoteur -join "`n")
  Stop-Net "Des fichiers ne sont ni commités ni ignorés. Commite ou remise avant de merger."
}
if ($saleData.Count -gt 0) {
  Info ("arbre propre hors data/ — " + $saleData.Count + " fichier(s) data/ divergent localement :")
  Write-Host ($saleData -join "`n")
  Info "NORMAL : data/ ne part jamais sur le dépôt (règle CLAUDE.md), le merge n'y touche pas."
} else {
  Ok "arbre propre"
}

# ───────── 3. les trois sources de version ─────────
# 🔒 Marche 1 de la porte, volet JAMAIS dérogeable : si les trois divergent,
# le service worker ressert l'ancien cache et la mise à jour n'arrive JAMAIS
# chez l'utilisateur — sans le moindre message d'erreur.
Titre "3. Cohérence des versions"
$vJson = (node -e "process.stdout.write(require('./version.json').version)")
$swTxt = Get-Content "sw.js" -Raw
$cpTxt = Get-Content "js/copyright.js" -Raw
$mSw = [regex]::Match($swTxt, 'CACHE_NAME\s*=\s*"myktamap-cache-(v[0-9.]+)"')
$mCp = [regex]::Match($cpTxt, 'build:\s*"(v[0-9.]+)"')
$vSw = if ($mSw.Success) { $mSw.Groups[1].Value } else { "?" }
$vCp = if ($mCp.Success) { $mCp.Groups[1].Value } else { "?" }
Info "version.json      : $vJson"
Info "sw.js CACHE_NAME  : $vSw"
Info "copyright.js build: $vCp"
if (($vJson -ne $vSw) -or ($vJson -ne $vCp)) {
  Stop-Net "Les trois sources divergent. Un CACHE_NAME oublié = mise à jour jamais livrée."
}
Ok "les trois disent $vJson"

# ───────── 4. garde-fous ─────────
# 🩸 NE PAS APPELER `bash` TOUT COURT. Sur Windows, `bash` résout vers
# `C:\Windows\system32\bash.exe` — le lanceur WSL, qui sur cette machine n'a
# AUCUNE distribution installée. Le hook ne tournait donc jamais : il rendait
# 1 avec dix lignes de message Microsoft, et le script s'arrêtait en annonçant
# « 0 assertion en échec » — un message absurde, symptôme du vrai problème.
# On localise Git Bash à partir de git lui-même, et on REFUSE de continuer si
# on ne le trouve pas plutôt que de laisser passer un contrôle non exécuté.
function Trouver-GitBash {
  $g = (Get-Command git -ErrorAction SilentlyContinue)
  $pistes = @()
  if ($g) { $pistes += (Join-Path (Split-Path (Split-Path $g.Source)) "bin\bash.exe") }
  $pistes += "C:\Program Files\Git\bin\bash.exe"
  $pistes += "C:\Program Files (x86)\Git\bin\bash.exe"
  $pistes += "$env:LOCALAPPDATA\Programs\Git\bin\bash.exe"
  foreach ($p in $pistes) { if ($p -and (Test-Path $p)) { return $p } }
  return $null
}

Titre "4. Garde-fous"
if ($SkipGuards) {
  Info "sautés (-SkipGuards)"
} else {
  $gitBash = Trouver-GitBash
  if (-not $gitBash) {
    Stop-Net "Git Bash introuvable — impossible de lancer les garde-fous. Relance avec -SkipGuards UNIQUEMENT si tu viens de les passer à la main."
  }
  Info "exécution de .githooks/pre-commit ..."
  # 🩸 Sortie envoyée dans un FICHIER, pas capturée : en PS 5.1, `2>&1` sur un
  # exécutable natif emballe chaque ligne dans un ErrorRecord et fausse le
  # comptage — et un tableau d'objets stringifié colle les lignes bout à bout,
  # donc `(?m)^✅` ne matche plus rien. Un fichier, lu ligne par ligne, ne ment pas.
  $tmp = Join-Path $env:TEMP ("mkm-guards-" + [guid]::NewGuid().ToString("N") + ".log")
  & $gitBash ".githooks/pre-commit" > $tmp 2>&1
  $code = $LASTEXITCODE
  $lignes = @(Get-Content $tmp -Encoding UTF8 -ErrorAction SilentlyContinue)
  Remove-Item $tmp -ErrorAction SilentlyContinue
  $verts  = @($lignes | Where-Object { $_ -match "^✅" }).Count
  $rouges = @($lignes | Where-Object { $_ -match "^❌" }).Count
  if ($rouges -gt 0) {
    $lignes | Where-Object { $_ -match "^❌" } | ForEach-Object { Ko $_ }
    Stop-Net "$rouges assertion(s) en échec. On ne merge pas sur main avec du rouge."
  }
  # 🩸 Zéro vert AVEC un code non nul = le hook n'a pas tourné du tout (bash
  # absent, droits, chemin). Le dire, plutôt que d'annoncer « 0 échec » et de
  # laisser croire à un contrôle passé.
  if ($code -ne 0 -and $verts -eq 0) {
    $lignes | Select-Object -First 5 | ForEach-Object { Info $_ }
    Stop-Net "Les garde-fous n'ont pas pu s'exécuter (code $code, aucune assertion lue). Ce n'est PAS un succès."
  }
  if ($code -ne 0) {
    Stop-Net "La suite pre-commit sort en erreur (code $code) malgré $verts assertions vertes."
  }
  Ok "$verts assertions vertes, 0 rouge"
}

# ───────── 4bis. analyse SonarQube ─────────
# Marche 1ter de la porte : le serveur tourne en local (Docker), la CI GitHub
# ne le joint pas — c'est donc ici qu'il est consulté. Porte en échec = refus.
# Serveur éteint ou jeton absent = l'analyse n'a pas eu lieu : ce n'est PAS un
# succès, KARMA décide en tapant DEROGE (à consigner dans le relevé de release).
Titre "4bis. Analyse SonarQube"
& powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $racine "scripts\release\sonar-scan.ps1")
$codeSonar = $LASTEXITCODE
if ($codeSonar -eq 2) {
  Stop-Net "Porte qualité SonarQube en échec sur le nouveau code. On corrige avant de merger."
}
if ($codeSonar -ne 0) {
  $rep = Read-Host "  Analyse Sonar impossible. Continuer sans ? (tape DEROGE, puis consigne-le dans le relevé)"
  if ($rep -ne "DEROGE") { Stop-Net "Merge annulé : relance Sonar puis ce script." }
  Info "Sonar dérogé (déclaré par KARMA) — à consigner dans le relevé de release"
}

# ───────── 5. le distant ─────────
Titre "5. Dépôt distant"
git fetch origin --quiet
$retard = (git rev-list --count "main..origin/main" 2>$null)
if ($retard -and [int]$retard -gt 0) {
  Stop-Net "main local est en retard de $retard commit(s) sur origin/main. Fais d'abord : git checkout main ; git pull ; git checkout $branche"
}
Ok "main local est à jour"

# CI GitHub du commit à merger (audit CI/CD du 08/10/2026, Q2/W3 option b : la protection de branche est payante
# sur un dépôt privé). On ne merge que ce que la CI a testé ET trouvé vert : la branche doit être poussée telle
# quelle, et le passage « CI » de ce commit terminé en succès. Jeton : celui que Git a déjà rangé pour les push
# (git credential fill, jamais affiché ni écrit). État illisible = dérogation tapée, consignée dans le relevé.
function Echec-Ci($t) { if ($DryRun) { Ko $t } else { Stop-Net $t } }
$sha = (git rev-parse HEAD).Trim()
$court = $sha.Substring(0, 7)
$distantSha = (git rev-parse "origin/$branche" 2>$null)
if (-not $distantSha -or $distantSha.Trim() -ne $sha) {
  Echec-Ci "$branche locale ≠ origin/$branche : pousse d'abord, la CI doit avoir testé exactement ce commit ($court)."
} else {
  $depot = ((git remote get-url origin).Trim() -replace '\.git$', '') -replace '^.*github\.com[:/]', ''
  $etatCi = $null; $lien = ""
  $env:GIT_TERMINAL_PROMPT = "0"; $env:GCM_INTERACTIVE = "never"
  $jeton = $null
  try {
    # Requête dans un fichier ASCII : en pipe, PowerShell 5.1 ajoute des retours chariot et une marque d'encodage
    # (BOM) que git credential refuse (« missing protocol field »).
    $tmpCred = [IO.Path]::GetTempFileName()
    [IO.File]::WriteAllText($tmpCred, "protocol=https`nhost=github.com`n`n", [Text.Encoding]::ASCII)
    $sortie = cmd /c "git credential fill < `"$tmpCred`" 2>nul"
    Remove-Item $tmpCred -ErrorAction SilentlyContinue
    $ligne = $sortie | Where-Object { $_ -like "password=*" } | Select-Object -First 1
    if ($ligne) { $jeton = $ligne.Substring(9).Trim() }
  } catch { $jeton = $null }
  if ($jeton) {
    try {
      [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
      $r = Invoke-RestMethod -TimeoutSec 15 -Uri "https://api.github.com/repos/$depot/actions/runs?head_sha=$sha&per_page=30" `
        -Headers @{ Authorization = "Bearer $jeton"; Accept = "application/vnd.github+json"; "User-Agent" = "merge-main" }
      $run = $r.workflow_runs | Where-Object { $_.name -eq "CI" } | Sort-Object created_at -Descending | Select-Object -First 1
      if ($run) { $etatCi = "$($run.status)/$($run.conclusion)"; $lien = $run.html_url } else { $etatCi = "absente" }
    } catch { $etatCi = $null }
  }
  $jeton = $null
  if ($etatCi -eq "completed/success") { Ok "CI GitHub verte pour $court" }
  elseif ($etatCi -eq "absente") { Echec-Ci "Aucune CI GitHub pour $court : pousse, attends qu'elle passe, puis relance." }
  elseif ($etatCi -like "completed/*") { Echec-Ci "CI GitHub rouge ($etatCi) pour $court : $lien" }
  elseif ($etatCi) { Echec-Ci "CI GitHub encore en cours ($etatCi) pour $court : attends la fin, puis relance. $lien" }
  else {
    Ko "État de la CI GitHub illisible (pas de jeton Git rangé, ou API GitHub injoignable)."
    if (-not $DryRun) {
      $rep = Read-Host "  Merger sans avoir vu la CI verte ? (tape DEROGE, puis consigne-le dans le relevé)"
      if ($rep -cne "DEROGE") { Stop-Net "Merge annulé : CI non vérifiée." }
    }
  }
}

# ───────── 6. ce qui va partir ─────────
Titre "6. Ce qui va être mergé"
$nb = (git rev-list --count "main..$branche").Trim()
Info "$nb commit(s) de $branche vers main"
Write-Host ""
git log --oneline "main..$branche" | Select-Object -First 15 | ForEach-Object { Write-Host "     $_" -ForegroundColor DarkGray }
if ([int]$nb -gt 15) { Write-Host "     ... et $([int]$nb - 15) de plus" -ForegroundColor DarkGray }

# ───────── 7. la porte de release, ce que le script NE PEUT PAS voir ─────────
Titre "7. Porte de release (docs/RELEASE_GATE.md)"
Write-Host ""
Write-Host "  Aucun script n'exécute l'app dans un navigateur. Les marches" -ForegroundColor Yellow
Write-Host "  suivantes ne peuvent être confirmées que par toi :" -ForegroundColor Yellow
Write-Host ""
Write-Host "    [ ] Marche 2 — smoke test 12 points sur dev.myktamap.fr, cache vidé"
Write-Host "    [ ] Marche 3 — checkup ciblé des modules touchés par cette release"
Write-Host "    [ ] Marche 4 — trempage 24-48 h sur dev, usage réel"
Write-Host ""
$rep = Read-Host "  Ces trois marches sont-elles franchies ? (tape OUI en majuscules)"
if ($rep -ne "OUI") {
  Stop-Net "Merge annule. main = deployable : la porte se franchit AVANT, pas apres."
}
Ok "porte franchie (déclaré par KARMA)"

# ───────── 8. le merge ─────────
Titre "8. Merge et publication"
if ($DryRun) {
  Info "DRY RUN — commandes qui seraient exécutées :"
  Info "  git checkout main"
  Info ("  git merge --no-ff $branche -m " + [char]34 + "Merge branch '$branche' ($vJson)" + [char]34)
  Info ("  git tag -a $vJson -m " + [char]34 + "MyKTAMap $vJson" + [char]34)
  Info "  git push origin main --follow-tags"
  Info "  git checkout $branche"
  Write-Host ""
  Write-Host "✅ DRY RUN terminé — rien n'a été modifié." -ForegroundColor Green
  exit 0
}

$confirm = Read-Host "  Dernier appel : merger $branche ($nb commits, $vJson) sur main ? (tape MERGE)"
if ($confirm -ne "MERGE") { Stop-Net "Merge annulé." }

# 🩸 À partir d'ici on modifie l'état du dépôt. Chaque étape est vérifiée :
# un échec au milieu laisserait KARMA sur main sans qu'il s'en aperçoive.
git checkout main
if ($LASTEXITCODE -ne 0) { Stop-Net "Impossible de passer sur main." }

git merge --no-ff $branche -m "Merge branch '$branche' ($vJson)"
if ($LASTEXITCODE -ne 0) {
  git merge --abort
  git checkout $branche
  Stop-Net "Merge en conflit — annulé, tu es de retour sur $branche."
}
Ok "merge effectué"

# Un tag existant n'est pas une erreur : on le signale et on continue.
$dejaTag = (git tag --list $vJson)
if ($dejaTag) {
  Info "tag $vJson déjà présent — conservé tel quel"
} else {
  git tag -a $vJson -m "MyKTAMap $vJson"
  Ok "tag $vJson posé"
}

git push origin main --follow-tags
if ($LASTEXITCODE -ne 0) {
  git checkout $branche
  Stop-Net "Publication refusée. Le merge local est fait ; règle le problème puis relance la publication à la main."
}
Ok "main publié"

git checkout $branche
Ok "retour sur $branche"

Write-Host ""
Write-Host "🎉 $vJson est sur main." -ForegroundColor Green
Write-Host ""
Write-Host "   Il reste le déploiement PROD, qui est manuel :" -ForegroundColor Yellow
Write-Host "     sur le VPS : sh /data/scripts/deploy-prod.sh   (script hors dépôt)" -ForegroundColor Yellow
Write-Host "   puis ouvrir /killsw.html une fois, et vérifier la version en pied de page." -ForegroundColor Yellow
Write-Host ""
