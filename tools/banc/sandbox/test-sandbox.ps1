<#
  Test de l'installateur dans Windows Sandbox (un Windows neuf, jetable) : lancé tout seul
  à l'ouverture de la Sandbox par playscreen-sandbox.wsb.
  Installe Playscreen sans question, vérifie ce que l'installateur a fait, démarre
  Playscreen, interroge son moteur, puis désinstalle et vérifie le ménage.
  Résultats : tools\banc\sandbox\resultats\ (rapport.txt, captures, journaux).
#>
$ErrorActionPreference = "Continue"
$out = "C:\resultats"
$dist = "C:\dist"
New-Item -ItemType Directory -Force $out | Out-Null
Get-ChildItem $out | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
$report = Join-Path $out "rapport.txt"
$script:ok = 0; $script:ko = 0

function Check($name, $condition, $detail = "") {
    if ($condition) { $script:ok++; $line = "OK     $name" } else { $script:ko++; $line = "ÉCHEC  $name" }
    if ($detail) { $line += " — $detail" }
    Add-Content -Path $report -Value $line -Encoding UTF8
}

function Shot($name) {
    Add-Type -AssemblyName System.Windows.Forms, System.Drawing
    $b = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
    $bmp = New-Object System.Drawing.Bitmap $b.Width, $b.Height
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.CopyFromScreen($b.Location, [System.Drawing.Point]::Empty, $b.Size)
    $bmp.Save((Join-Path $out "$name.png"), [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose(); $bmp.Dispose()
}

function WaitFor($seconds, [scriptblock]$condition) {
    $end = (Get-Date).AddSeconds($seconds)
    while ((Get-Date) -lt $end) {
        try { if (& $condition) { return $true } } catch {}
        Start-Sleep -Seconds 2
    }
    return $false
}

Add-Content -Path $report -Value "Test Playscreen dans Windows Sandbox — $(Get-Date)" -Encoding UTF8
$os = Get-CimInstance Win32_OperatingSystem
Add-Content -Path $report -Value "Windows : $($os.Caption) $($os.Version)" -Encoding UTF8
$setup = Get-ChildItem $dist -Filter "Playscreen-Setup-*.exe" | Sort-Object LastWriteTime | Select-Object -Last 1
Check "installateur trouvé" $setup $setup.Name
$webview = Test-Path "HKLM:\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}"
Add-Content -Path $report -Value "WebView2 avant installation : $webview" -Encoding UTF8

# 1. Installation silencieuse (pas de launcher : on teste Playscreen lui-même).
$t0 = Get-Date
$p = Start-Process $setup.FullName -ArgumentList "/VERYSILENT", "/SUPPRESSMSGBOXES", "/NORESTART", "/TASKS=autostart,desktopicon", "/LOG=$out\setup.log" -PassThru -Wait
Check "installation terminée" ($p.ExitCode -eq 0) "code $($p.ExitCode), $([int]((Get-Date) - $t0).TotalSeconds) s"
$app = "C:\Program Files\Playscreen"
foreach ($f in "Playscreen.exe", "Sentinelle\playscreen-sentinel.exe", "Sentinelle\SDL2.dll", "Playnite\Playnite.DesktopApp.exe", "start-engine.cmd", "outils\installer-launcher.ps1", "LICENCES.txt", "unins000.exe") {
    Check "fichier installé : $f" (Test-Path (Join-Path $app $f))
}
Check "WebView2 présent" (Test-Path "HKLM:\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}")
$run = (Get-ItemProperty "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run" -ErrorAction SilentlyContinue).Playscreen
Check "démarrage avec Windows = sentinelle" ($run -like "*playscreen-sentinel.exe*") $run
Check "raccourci du menu Démarrer" (Test-Path "$env:ProgramData\Microsoft\Windows\Start Menu\Programs\Playscreen.lnk")
$task = Get-ScheduledTask -TaskPath "\Playscreen\" -TaskName "Installer un launcher" -ErrorAction SilentlyContinue
Check "tâche planifiée « Installer un launcher »" $task "$($task.Principal.UserId), $($task.Principal.RunLevel)"
$rule = netsh advfirewall firewall show rule name="Playscreen - connexion aux stores"
Check "règle de pare-feu" ($rule -match "Playnite.BrowserProcess")
$acl = icacls "C:\Program Files\Epic Games"
Check "droit d'écriture dossier de jeux Epic" ($acl -match [regex]::Escape($env:USERNAME)) ($acl -join " ")

# 2. Premier démarrage : comme le raccourci du menu Démarrer.
$t0 = Get-Date
Start-Process (Join-Path $app "Sentinelle\playscreen-sentinel.exe") -ArgumentList "--open"
$engineFile = "$env:LOCALAPPDATA\Playscreen\engine.json"
$status = $null
$ready = WaitFor 180 {
    $e = Get-Content $engineFile -Raw | ConvertFrom-Json
    $script:headers = @{ Authorization = "Bearer $($e.token)" }
    $script:base = "http://127.0.0.1:$($e.port)/api/v0"
    $script:status = Invoke-RestMethod "$base/status" -Headers $headers -TimeoutSec 5
    $status.ready
}
Check "moteur prêt" $ready "$([int]((Get-Date) - $t0).TotalSeconds) s"
$window = WaitFor 60 { (Get-Process Playscreen -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowTitle -eq "Playscreen" }) }
Check "fenêtre Playscreen ouverte" $window
Check "sentinelle en marche" (Get-Process playscreen-sentinel -ErrorAction SilentlyContinue)
Start-Sleep 10
Shot "premier-demarrage"
if ($ready) {
    $stores = Invoke-RestMethod "$base/stores" -Headers $headers
    Check "4 stores connus du moteur" ($stores.Count -eq 4) (($stores | ForEach-Object { "$($_.id):plugin=$($_.pluginInstalled)" }) -join ", ")
    $files = Invoke-RestMethod "$base/files" -Headers $headers
    Check "explorateur de fichiers" ($files.entries.Count -gt 0) (($files.entries | ForEach-Object name) -join ", ")
    $added = Invoke-RestMethod -Method Post "$base/apps?name=Bloc-notes&path=C:\Windows\System32\notepad.exe" -Headers $headers
    Check "ajout d'un jeu hors launcher" ($added.store -eq "other") $added.name
    Invoke-RestMethod -Method Post "$base/games/$($added.id)/start" -Headers $headers | Out-Null
    Check "lancement du jeu hors launcher" (WaitFor 30 { Get-Process notepad -ErrorAction SilentlyContinue })
    Start-Sleep 5
    Invoke-RestMethod -Method Post "$base/games/$($added.id)/stop?force=true" -Headers $headers | Out-Null
    Start-Sleep 3
    $mem = Get-Process Playscreen, Playnite.DesktopApp, playscreen-sentinel, msedgewebview2, Playnite.BrowserProcess -ErrorAction SilentlyContinue |
        Group-Object Name | ForEach-Object { "$($_.Name)=$([int](($_.Group | Measure-Object PrivateMemorySize64 -Sum).Sum / 1MB)) Mo" }
    Add-Content -Path $report -Value "Mémoire (privée) : $($mem -join ', ')" -Encoding UTF8
}
Copy-Item "$env:LOCALAPPDATA\Playscreen\Playnite\playnite.log", "$env:LOCALAPPDATA\Playscreen\Playnite\extensions.log", "$env:LOCALAPPDATA\Playscreen\sentinel.log" $out -ErrorAction SilentlyContinue

# 3. Désinstallation (données gardées : réponse par défaut « Non »).
$p = Start-Process (Join-Path $app "unins000.exe") -ArgumentList "/VERYSILENT", "/SUPPRESSMSGBOXES", "/NORESTART" -PassThru -Wait
Start-Sleep 5
Check "désinstallation terminée" ($p.ExitCode -eq 0) "code $($p.ExitCode)"
Check "programme supprimé" (-not (Test-Path (Join-Path $app "Playnite")))
Check "plus rien ne tourne" (-not (Get-Process Playscreen, playscreen-sentinel, Playnite.DesktopApp -ErrorAction SilentlyContinue))
Check "démarrage avec Windows retiré" (-not (Get-ItemProperty "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run" -ErrorAction SilentlyContinue).Playscreen)
Check "tâche planifiée retirée" (-not (Get-ScheduledTask -TaskPath "\Playscreen\" -ErrorAction SilentlyContinue))
Check "règle de pare-feu retirée" (-not ((netsh advfirewall firewall show rule name="Playscreen - connexion aux stores") -match "Playnite"))
Check "données gardées" (Test-Path "$env:LOCALAPPDATA\Playscreen\Playnite")
Shot "apres-desinstallation"

Add-Content -Path $report -Value "Bilan : $script:ok réussis, $script:ko échecs" -Encoding UTF8
Set-Content -Path (Join-Path $out "FIN.txt") -Value "fini" -Encoding UTF8
