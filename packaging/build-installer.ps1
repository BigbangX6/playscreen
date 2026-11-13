<#
.SYNOPSIS
  Fabrique l'installateur de Playscreen : dist\Playscreen-Setup-<version>.exe.

.DESCRIPTION
  1. Assemble un paquet propre dans dist\staging\Playscreen (build-bundle.ps1 : passerelle,
     Playnite portable, extensions, interface, sentinelle), jamais lancé : rien de ce que le
     moteur écrit en tournant n'entre dans l'installateur.
  2. Compile packaging\playscreen.iss avec Inno Setup 6 (ISCC.exe).

.PARAMETER PlayniteZip
  Archive portable de Playnite (dist\cache\10.62.7z par défaut).

.PARAMETER Version
  Version affichée (défaut : celle de ui\src-tauri\tauri.conf.json).

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\packaging\build-installer.ps1
#>
param(
    [string]$PlayniteZip,
    [string]$Version,
    [switch]$SkipApps
)

$ErrorActionPreference = "Stop"
$root = Resolve-Path (Join-Path $PSScriptRoot "..")
if (-not $PlayniteZip) { $PlayniteZip = Join-Path $root "dist\cache\10.62.7z" }
if (-not $Version) {
    $Version = (Get-Content (Join-Path $root "ui\src-tauri\tauri.conf.json") -Raw | ConvertFrom-Json).version
}
$staging = Join-Path $root "dist\staging\Playscreen"

$iscc = @(
    (Join-Path $env:LOCALAPPDATA "Programs\InnoSetup6\ISCC.exe"),
    (Join-Path ${env:ProgramFiles(x86)} "Inno Setup 6\ISCC.exe"),
    (Join-Path $env:ProgramFiles "Inno Setup 6\ISCC.exe")
) | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $iscc) { throw "Inno Setup 6 introuvable (https://jrsoftware.org/isdl.php)" }

Write-Host "==> Paquet propre -> $staging"
if (Test-Path $staging) { Remove-Item $staging -Recurse -Force }
$bundleArgs = @{ PlayniteZip = $PlayniteZip; Output = $staging }
if ($SkipApps) { $bundleArgs.SkipApps = $true }
& (Join-Path $PSScriptRoot "build-bundle.ps1") @bundleArgs
if ($SkipApps) {
    # Interface et sentinelle déjà compilées : on reprend celles du paquet de développement.
    $dev = Join-Path $root "dist\Playscreen"
    Copy-Item (Join-Path $dev "Playscreen.exe") $staging -Force
    Copy-Item (Join-Path $dev "Sentinelle") $staging -Recurse -Force
}
foreach ($required in "Playscreen.exe", "Sentinelle\playscreen-sentinel.exe", "Sentinelle\SDL2.dll", "start-engine.cmd", "Playnite\Playnite.DesktopApp.exe") {
    if (-not (Test-Path (Join-Path $staging $required))) { throw "Manque dans le paquet : $required" }
}

Write-Host "==> Installateur Playscreen $Version"
& $iscc "/DAppVersion=$Version" "/DSourceDir=$staging" (Join-Path $PSScriptRoot "playscreen.iss")
if ($LASTEXITCODE -ne 0) { throw "Échec d'Inno Setup" }
$setup = Join-Path $root "dist\Playscreen-Setup-$Version.exe"
Write-Host ""
Write-Host ("Installateur prêt : {0} ({1:N0} Mo)" -f $setup, ((Get-Item $setup).Length / 1MB))
