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
  5. Crée le dossier de la bibliothèque, ce qui fait sauter l'assistant de premier
     démarrage de Playnite.
  6. Crée start-engine.cmd qui démarre Playnite sans interface.

  Phase 2 : préconfiguration des extensions Steam, Epic, Xbox et Battle.net.

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
$cacheDir = Join-Path $root "dist\cache"

# Extensions de store officielles de Playnite (base d'extensions de playnite.link).
# Versions figées : à mettre à jour en même temps que Playnite.
$storeExtensions = @(
    "https://playnite.link/download/extensions/bins/SteamLibrary_Builtin_2_47.pext",
    "https://playnite.link/download/extensions/bins/EpicGamesLibrary_Builtin_2_30.pext",
    "https://playnite.link/download/extensions/bins/XboxLibrary_Builtin_2_17.pext",
    "https://playnite.link/download/extensions/bins/BattlenetLibrary_Builtin_2_24.pext"
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

# Playnite saute l'assistant de premier démarrage si le dossier de la bibliothèque
# existe déjà (DesktopApplication.ProcessStartupWizard).
New-Item -ItemType Directory -Force -Path (Join-Path $playniteDir "library") | Out-Null

Write-Host "==> start-engine.cmd"
$startScript = @"
@echo off
rem Demarre Playnite sans interface : la passerelle Playscreen ecoute sur 127.0.0.1.
rem --forcesoftrender : avec l'acceleration graphique, les fenetres de Playnite restent
rem transparentes sur certains ecrans virtuels (Parsec).
start "" "%~dp0Playnite\Playnite.DesktopApp.exe" --startclosedtotray --hidesplashscreen --forcesoftrender
"@
Set-Content -Path (Join-Path $Output "start-engine.cmd") -Value $startScript -Encoding ASCII

Write-Host ""
Write-Host "Paquet prêt : $Output"
Write-Host "Démarrer le moteur : $Output\start-engine.cmd"
Write-Host "Puis tester       : npm run psc -- status"
