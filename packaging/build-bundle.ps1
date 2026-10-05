<#
.SYNOPSIS
  Assemble le paquet Playscreen : Playnite portable + extensions de store + passerelle.

.DESCRIPTION
  1. Compile la passerelle (bridge/).
  2. Décompresse Playnite portable dans <Output>\Playnite.
  3. Installe les extensions Steam, Epic, Xbox et Battle.net (versions figées) : depuis
     Playnite 10, elles ne sont plus fournies avec Playnite mais téléchargées par
     l'assistant de premier démarrage.
  4. Installe la passerelle dans le dossier Extensions du programme (active d'office).
  5. Prépare les réglages par défaut (<Output>\defaults) : extensions de store avec
     compte connecté et import des jeux non installés, sans accélération graphique, et
     dossier de bibliothèque qui fait sauter l'assistant de premier démarrage.
  6. Crée start-engine.cmd : il copie les réglages par défaut manquants dans le dossier
     de données (%LOCALAPPDATA%\Playscreen\Playnite), puis démarre Playnite sans
     interface. Reconstruire le paquet n'efface donc jamais les données.

.PARAMETER PlayniteZip
  Archive portable de Playnite (.7z ou .zip), sur la page des versions de Playnite sur
  GitHub. Vérifié avec 10.62.7z.

.EXAMPLE
  .\packaging\build-bundle.ps1 -PlayniteZip "$env:USERPROFILE\Downloads\10.62.7z"
#>
param(
    [Parameter(Mandatory = $true)]
    [string]$PlayniteZip,
    [string]$Output,
    [string]$Configuration = "Release"
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"
$root = Resolve-Path (Join-Path $PSScriptRoot "..")
# Windows PowerShell 5.1 : $PSScriptRoot est vide dans les valeurs par défaut des paramètres.
if (-not $Output) { $Output = Join-Path $root "dist\Playscreen" }
$playniteDir = Join-Path $Output "Playnite"
$extensionsDir = Join-Path $playniteDir "Extensions"
$extensionDir = Join-Path $extensionsDir "Playscreen_Bridge"
$defaultsDir = Join-Path $Output "defaults"
$cacheDir = Join-Path $root "dist\cache"

# Extensions de store officielles de Playnite (base d'extensions de playnite.link).
# Versions figées : à mettre à jour en même temps que Playnite.
$storeExtensions = @(
    "https://playnite.link/download/extensions/bins/SteamLibrary_Builtin_2_47.pext",
    "https://playnite.link/download/extensions/bins/EpicGamesLibrary_Builtin_2_30.pext",
    "https://playnite.link/download/extensions/bins/XboxLibrary_Builtin_2_17.pext",
    "https://playnite.link/download/extensions/bins/BattlenetLibrary_Builtin_2_24.pext",
    # Métadonnées IGDB : images et descriptions quand le store n'en fournit pas
    # (installée aussi par l'assistant de premier démarrage de Playnite).
    "https://playnite.link/download/extensions/bins/IGDBMetadata_Builtin_2_15.pext",
    # Trophées (succès) des jeux, lus par la passerelle (licence MIT, Lacro59). Pas la 3.7.1 :
    # elle ne récupère plus ceux de Steam (bug #695 de SuccessStory, avril 2026).
    "https://github.com/Lacro59/playnite-successstory-plugin/releases/download/v3.7/playnite-successstory-plugin_3_7.pext"
)

Write-Host "==> Compilation de la passerelle"
dotnet build (Join-Path $root "bridge\Playscreen.Bridge.csproj") -c $Configuration
if ($LASTEXITCODE -ne 0) { throw "Échec de la compilation de la passerelle" }

Write-Host "==> Playnite portable -> $playniteDir"
if (Test-Path $playniteDir) { Remove-Item $playniteDir -Recurse -Force }
New-Item -ItemType Directory -Force -Path $playniteDir | Out-Null
# Le tar de Windows (libarchive) lit les .7z comme les .zip.
tar -xf $PlayniteZip -C $playniteDir
if ($LASTEXITCODE -ne 0) { throw "Échec de la décompression de $PlayniteZip" }
if (-not (Test-Path (Join-Path $playniteDir "Playnite.DesktopApp.exe"))) {
    throw "Playnite.DesktopApp.exe absent de la racine de l'archive"
}
# Sans désinstalleur, Playnite se met en mode portable (données dans son dossier).
$uninstaller = Join-Path $playniteDir "unins000.exe"
if (Test-Path $uninstaller) { Remove-Item $uninstaller -Force }

Write-Host "==> Extensions de store -> $extensionsDir"
New-Item -ItemType Directory -Force -Path $cacheDir, $extensionsDir | Out-Null
foreach ($url in $storeExtensions) {
    $package = Join-Path $cacheDir (Split-Path $url -Leaf)
    if (-not (Test-Path $package)) {
        Invoke-WebRequest $url -OutFile $package -UseBasicParsing
    }
    # Comme Playnite : le paquet est décompressé dans Extensions\<Id du manifeste>.
    $temp = Join-Path $cacheDir "unpack"
    if (Test-Path $temp) { Remove-Item $temp -Recurse -Force }
    New-Item -ItemType Directory -Force -Path $temp | Out-Null
    tar -xf $package -C $temp
    if ($LASTEXITCODE -ne 0) { throw "Échec de la décompression de $package" }
    $id = (Select-String -Path (Join-Path $temp "extension.yaml") -Pattern "^Id:\s*(\S+)").Matches[0].Groups[1].Value
    Move-Item $temp (Join-Path $extensionsDir $id)
    Write-Host "    $id"
}

Write-Host "==> Passerelle -> $extensionDir"
New-Item -ItemType Directory -Force -Path $extensionDir | Out-Null
Copy-Item (Join-Path $root "bridge\bin\$Configuration\net462\*") $extensionDir -Recurse -Force

# Les données (réglages, bibliothèque, connexions aux stores) vivent hors du paquet, dans
# %LOCALAPPDATA%\Playscreen\Playnite (option --userdatadir) : reconstruire le paquet ne
# les efface pas. Le paquet ne contient que les réglages par défaut, copiés au démarrage
# seulement s'ils n'existent pas encore.
Write-Host "==> Réglages par défaut -> $defaultsDir"
if (Test-Path $defaultsDir) { Remove-Item $defaultsDir -Recurse -Force }
# Playnite saute l'assistant de premier démarrage si le dossier de la bibliothèque
# existe déjà (DesktopApplication.ProcessStartupWizard).
New-Item -ItemType Directory -Force -Path (Join-Path $defaultsDir "library") | Out-Null
# Sans accélération graphique, dans tous les modes : avec, les fenêtres de Playnite restent
# transparentes sur certains écrans virtuels (Parsec). --forcesoftrender ne suffit pas :
# Playnite ne le transmet pas quand il redémarre en plein écran.
[IO.File]::WriteAllText((Join-Path $defaultsDir "config.json"), '{ "DisableHwAcceleration": true }')
# Réglages lus dans le code des extensions (*LibrarySettingsViewModel.cs) : « connecter le
# compte » et « importer les jeux non installés » sont désactivés par défaut. Les réglages
# absents gardent leur valeur par défaut. Version : évite les migrations de réglages.
$storeSettings = @{
    "cb91dfc9-b977-43bf-8e70-55f46e410fab" = '{ "Version": 2, "ImportInstalledGames": true, "ConnectAccount": true, "ImportUninstalledGames": true }' # Steam
    "00000002-dbd1-46c6-b5d0-b1ba559d10e4" = '{ "Version": 1, "ImportInstalledGames": true, "ConnectAccount": true, "ImportUninstalledGames": true }' # Epic
    "7e4fbb5e-2ae3-48d4-8ba0-6b30e7a4e287" = '{ "ImportInstalledGames": true, "ConnectAccount": true, "ImportUninstalledGames": true }'               # Xbox
    "e3c26a3d-d695-4cb7-a769-5ff7612c7edd" = '{ "Version": 1, "ImportInstalledGames": true, "ConnectAccount": true, "ImportUninstalledGames": true }' # Battle.net
    # SuccessStory (trophées) : toutes les sources sont désactivées par défaut. Steam et Epic
    # passent par la connexion web des stores (UseAuth), déjà faite pour les bibliothèques.
    "cebe6d32-8c46-4459-b993-5a5189d60788" = '{ "EnableSteam": true, "EnableEpic": true, "EnableXbox": true, "EnableOverwatchAchievements": true, "EnableSc2Achievements": true, "UseLocalised": true, "SteamApiSettings": { "UseApi": false, "UseAuth": true }, "EpicSettings": { "UseAuth": true } }'
}
foreach ($pluginId in $storeSettings.Keys) {
    $dataDir = Join-Path $defaultsDir "ExtensionsData\$pluginId"
    New-Item -ItemType Directory -Force -Path $dataDir | Out-Null
    [IO.File]::WriteAllText((Join-Path $dataDir "config.json"), $storeSettings[$pluginId])
}

Write-Host "==> start-engine.cmd"
$startScript = @"
@echo off
rem Demarre Playnite sans interface : la passerelle Playscreen ecoute sur 127.0.0.1.
rem Donnees hors du paquet : reconstruire le paquet ne les efface pas.
set "DATA=%LOCALAPPDATA%\Playscreen\Playnite"
rem Reglages par defaut, copies seulement s'ils n'existent pas encore (/XC /XN /XO).
robocopy "%~dp0defaults" "%DATA%" /E /XC /XN /XO /NJH /NJS /NFL /NDL /NP >nul
rem --forcesoftrender : avec l'acceleration graphique, les fenetres de Playnite restent
rem transparentes sur certains ecrans virtuels (Parsec).
start "" "%~dp0Playnite\Playnite.DesktopApp.exe" --userdatadir "%DATA%" --startclosedtotray --hidesplashscreen --forcesoftrender
"@
Set-Content -Path (Join-Path $Output "start-engine.cmd") -Value $startScript -Encoding ASCII

Write-Host ""
Write-Host "Paquet prêt : $Output"
Write-Host "Démarrer le moteur : $Output\start-engine.cmd"
Write-Host "Puis tester       : npm run psc -- status"
