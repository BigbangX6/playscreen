<#
.SYNOPSIS
  Assemble le paquet Playscreen : Playnite portable + passerelle Playscreen.

.DESCRIPTION
  1. Compile la passerelle (bridge/).
  2. Décompresse Playnite portable dans <Output>\Playnite.
  3. Installe la passerelle dans le dossier Extensions du programme (active d'office).
  4. Crée start-engine.cmd qui démarre Playnite sans interface.

  Phase 2 : préconfiguration des extensions Steam, Epic, Xbox et Battle.net.

.PARAMETER PlayniteZip
  Archive portable de Playnite (page des versions de Playnite sur GitHub).

.EXAMPLE
  .\packaging\build-bundle.ps1 -PlayniteZip "$env:USERPROFILE\Downloads\Playnite.zip"
#>
param(
    [Parameter(Mandatory = $true)]
    [string]$PlayniteZip,
    [string]$Output = (Join-Path $PSScriptRoot "..\dist\Playscreen"),
    [string]$Configuration = "Release"
)

$ErrorActionPreference = "Stop"
$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$playniteDir = Join-Path $Output "Playnite"
$extensionDir = Join-Path $playniteDir "Extensions\Playscreen_Bridge"

Write-Host "==> Compilation de la passerelle"
dotnet build (Join-Path $root "bridge\Playscreen.Bridge.csproj") -c $Configuration
if ($LASTEXITCODE -ne 0) { throw "Échec de la compilation de la passerelle" }

Write-Host "==> Playnite portable -> $playniteDir"
if (Test-Path $playniteDir) { Remove-Item $playniteDir -Recurse -Force }
Expand-Archive -Path $PlayniteZip -DestinationPath $playniteDir
# Sans désinstalleur, Playnite se met en mode portable (données dans son dossier).
$uninstaller = Join-Path $playniteDir "unins000.exe"
if (Test-Path $uninstaller) { Remove-Item $uninstaller -Force }

Write-Host "==> Passerelle -> $extensionDir"
New-Item -ItemType Directory -Force -Path $extensionDir | Out-Null
Copy-Item (Join-Path $root "bridge\bin\$Configuration\net462\*") $extensionDir -Recurse -Force

Write-Host "==> start-engine.cmd"
$startScript = @"
@echo off
rem Démarre Playnite sans interface : la passerelle Playscreen écoute sur 127.0.0.1.
start "" "%~dp0Playnite\Playnite.DesktopApp.exe" --startclosedtotray --hidesplashscreen
"@
Set-Content -Path (Join-Path $Output "start-engine.cmd") -Value $startScript -Encoding ASCII

Write-Host ""
Write-Host "Paquet prêt : $Output"
Write-Host "Démarrer le moteur : $Output\start-engine.cmd"
Write-Host "Puis tester       : npm run psc -- status"
