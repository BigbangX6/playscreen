# Télécharge SDL2.dll (version figée, licence zlib) à côté de la sentinelle compilée :
# sans elle, la sentinelle ne lit que les manettes Xbox (XInput).
param([string]$Version = "2.32.10")
$ErrorActionPreference = "Stop"
$zip = Join-Path $env:TEMP "SDL2-$Version-win32-x64.zip"
if (-not (Test-Path $zip)) {
    Invoke-WebRequest "https://github.com/libsdl-org/SDL/releases/download/release-$Version/SDL2-$Version-win32-x64.zip" -OutFile $zip -UseBasicParsing
}
foreach ($dir in @("target\release", "target\debug")) {
    $target = Join-Path $PSScriptRoot $dir
    if (Test-Path $target) {
        & (Join-Path $env:SystemRoot "System32/tar.exe") -xf $zip -C $target SDL2.dll
        Write-Host "SDL2.dll -> $target"
    }
}
