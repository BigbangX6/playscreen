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
  et n'installe que les launchers de la liste ci-dessous (installateur officiel, sinon winget).
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

# D'abord l'installateur officiel, téléchargé directement (mêmes adresses que l'installateur
# de Playscreen) : winget manque sur un Windows neuf et dans Windows Sandbox (vu le
# 15 novembre 2026). Installation silencieuse, sauf Battle.net (sa fenêtre s'ouvre).
$direct = @{
    "steam"     = @{ Url = "https://cdn.fastly.steamstatic.com/client/installer/SteamSetup.exe"; File = "SteamSetup.exe"; Args = "/S" }
    "epic"      = @{ Url = "https://launcher-public-service-prod06.ol.epicgames.com/launcher/api/installer/download/EpicGamesLauncherInstaller.msi"; File = "EpicGamesLauncherInstaller.msi"; Args = "" }
    "battlenet" = @{ Url = "https://downloader.battle.net/download/getInstaller?os=win&installer=Battle.net-Setup.exe"; File = "Battle.net-Setup.exe"; Args = "--lang=frFR" }
}
$ok = $false
if ($direct.ContainsKey($id)) {
    $item = $direct[$id]
    $setup = Join-Path $env:TEMP $item.File
    try {
        $ProgressPreference = "SilentlyContinue"
        Invoke-WebRequest -Uri $item.Url -OutFile $setup -UseBasicParsing
        # Pas de -Wait : il attendrait aussi les programmes lancés par l'installateur (le
        # client Battle.net, ouvert à la fin, jusqu'à sa fermeture).
        if ($item.File.EndsWith(".msi")) {
            $process = Start-Process "msiexec.exe" -ArgumentList "/i `"$setup`" /qn /norestart" -PassThru
        } else {
            $process = Start-Process $setup -ArgumentList $item.Args -PassThru
        }
        $process.WaitForExit()
        # Le programme installé fait foi (certains installateurs renvoient un code trompeur).
        $exe = @{
            "steam"     = "${env:ProgramFiles(x86)}\Steam\steam.exe"
            "epic"      = "${env:ProgramFiles(x86)}\Epic Games\Launcher\Portal\Binaries\Win64\EpicGamesLauncher.exe"
            "battlenet" = "${env:ProgramFiles(x86)}\Battle.net\Battle.net.exe"
        }[$id]
        $ok = ($process.ExitCode -eq 0) -or (Test-Path $exe)
        Add-Content -Path $log -Value "$(Get-Date -Format s) $id : installateur officiel, code $($process.ExitCode)"
    } catch {
        Add-Content -Path $log -Value "$(Get-Date -Format s) $id : installateur officiel impossible : $($_.Exception.Message)"
    }
    Remove-Item $setup -Force -ErrorAction SilentlyContinue
}
if (-not $ok) {
    $winget = Join-Path $env:LOCALAPPDATA "Microsoft\WindowsApps\winget.exe"
    if (-not (Test-Path $winget)) { $winget = "winget" }
    & $winget install --id $packages[$id] --exact --source winget --silent `
        --accept-package-agreements --accept-source-agreements --disable-interactivity *>> $log
    $ok = $LASTEXITCODE -eq 0
    Add-Content -Path $log -Value "$(Get-Date -Format s) $id : winget, code $LASTEXITCODE"
}
Set-Content -Path $result -Value $(if ($ok) { "ok" } else { "échec" }) -Encoding UTF8
exit $(if ($ok) { 0 } else { 1 })
