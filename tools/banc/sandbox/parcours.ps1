<#
  Parcours de première installation, vu par un nouvel utilisateur (Windows Sandbox) :
  lance l'installateur normalement (assistant visible) et enregistre une capture à chaque
  changement d'écran dans C:\resultats\parcours (pendant 20 minutes). Les clics se font à
  la main ou depuis le PC hôte. Lancé par parcours.wsb.
#>
$out = "C:\resultats\parcours"
New-Item -ItemType Directory -Force $out | Out-Null
Get-ChildItem $out | Remove-Item -Force -ErrorAction SilentlyContinue
Add-Type -AssemblyName System.Windows.Forms, System.Drawing

$setup = Get-ChildItem "C:\dist" -Filter "Playscreen-Setup-*.exe" | Sort-Object LastWriteTime | Select-Object -Last 1
Copy-Item $setup.FullName "$env:USERPROFILE\Downloads\" -Force
Start-Process (Join-Path "$env:USERPROFILE\Downloads" $setup.Name)

$previous = $null
$lastCommand = (Get-Item "C:\banc\commande.ps1" -ErrorAction SilentlyContinue).LastWriteTime
$index = 0
$end = (Get-Date).AddMinutes(20)
while ((Get-Date) -lt $end) {
    $bounds = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
    $bitmap = New-Object System.Drawing.Bitmap $bounds.Width, $bounds.Height
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $graphics.CopyFromScreen($bounds.Location, [System.Drawing.Point]::Empty, $bounds.Size)
    # Empreinte grossière (vignette 32 × 18) : une capture seulement quand l'écran change.
    $thumb = New-Object System.Drawing.Bitmap $bitmap, 32, 18
    $print = -join (0..17 | ForEach-Object { $y = $_; 0..31 | ForEach-Object { [int]($thumb.GetPixel($_, $y).GetBrightness() * 9) } })
    if ($print -ne $previous) {
        $previous = $print
        $index++
        $bitmap.Save((Join-Path $out ("{0:D3}-{1:HHmmss}.png" -f $index, (Get-Date))), [System.Drawing.Imaging.ImageFormat]::Png)
    }
    $thumb.Dispose(); $graphics.Dispose(); $bitmap.Dispose()
    # Boîte aux lettres du PC hôte : C:\banc\commande.ps1 (nouveau ou modifié) est exécuté,
    # sa sortie va dans C:\resultats\commande.txt (vérifications pendant le parcours).
    $command = Get-Item "C:\banc\commande.ps1" -ErrorAction SilentlyContinue
    if ($command -and $command.LastWriteTime -ne $lastCommand) {
        $lastCommand = $command.LastWriteTime
        try { & $command.FullName *>&1 | Out-String -Width 200 | Set-Content "C:\resultats\commande.txt" -Encoding UTF8 }
        catch { $_ | Out-String | Set-Content "C:\resultats\commande.txt" -Encoding UTF8 }
    }
    Start-Sleep -Milliseconds 1500
}
