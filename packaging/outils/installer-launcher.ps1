<#
.SYNOPSIS
  Installe un launcher demandé par Playscreen, avec les droits administrateur (F31).

.DESCRIPTION
  Lancé par la tâche planifiée « Playscreen\Installer un launcher », créée par
  l'installateur de Playscreen (une seule autorisation administrateur, à l'installation).
  Playscreen écrit l'identifiant du launcher dans
  %LOCALAPPDATA%\Playscreen\launcher-request.txt puis démarre la tâche : plus de fenêtre
  d'autorisation (UAC) qu'une manette ne peut pas valider.
  Sécurité : ce script est dans Program Files (modifiable seulement par un administrateur)
  et n'installe que les launchers de la liste ci-dessous, par winget.
  Résultat dans %LOCALAPPDATA%\Playscreen\launcher-result.txt : « ok » ou « échec ».
#>
$ErrorActionPreference = "Continue"
$dir = Join-Path $env:LOCALAPPDATA "Playscreen"
$request = Join-Path $dir "launcher-request.txt"
$result = Join-Path $dir "launcher-result.txt"
$log = Join-Path $dir "launcher-install.log"

# Même liste que relay.rs (interface) : identifiant Playscreen -> paquet winget.
$packages = @{
    "steam"     = "Valve.Steam"
    "epic"      = "EpicGames.EpicGamesLauncher"
    "battlenet" = "Blizzard.BattleNet"
    "gog"       = "GOG.Galaxy"
    "ea"        = "ElectronicArts.EADesktop"
    "ubisoft"   = "Ubisoft.Connect"
    "amazon"    = "Amazon.Games"
}

if (-not (Test-Path $request)) { exit 1 }
$id = ((Get-Content $request -TotalCount 1) -as [string]).Trim()
Remove-Item $request -Force
if (-not $packages.ContainsKey($id)) {
    Set-Content -Path $result -Value "échec" -Encoding UTF8
    Add-Content -Path $log -Value "$(Get-Date -Format s) refusé : $id"
    exit 1
}

$winget = Join-Path $env:LOCALAPPDATA "Microsoft\WindowsApps\winget.exe"
if (-not (Test-Path $winget)) { $winget = "winget" }
& $winget install --id $packages[$id] --exact --source winget --silent `
    --accept-package-agreements --accept-source-agreements --disable-interactivity *>> $log
$ok = $LASTEXITCODE -eq 0
Add-Content -Path $log -Value "$(Get-Date -Format s) $id : code $LASTEXITCODE"
Set-Content -Path $result -Value $(if ($ok) { "ok" } else { "échec" }) -Encoding UTF8
exit $(if ($ok) { 0 } else { 1 })
