; Installateur de Playscreen (Inno Setup 6) : fabriqué par packaging\build-installer.ps1.
;
; Tout ce qui demande les droits administrateur est fait ici, une seule fois, quand on a
; encore un clavier et une souris (décision D9, frictions F19, F24, F31) :
;   - droit d'écrire dans le dossier de jeux par défaut d'Epic (plus d'UAC en installant) ;
;   - règle de pare-feu du navigateur de connexion aux stores ;
;   - tâche planifiée qui installe un launcher depuis Playscreen sans UAC ;
;   - installation des launchers choisis (Steam, Epic Games, Battle.net).
; Le démarrage avec Windows ne lance que la sentinelle (quelques Mo) : Playscreen et son
; moteur ne s'ouvrent qu'avec Select + Y.

#ifndef AppVersion
  #define AppVersion "0.1.0"
#endif
#ifndef SourceDir
  #define SourceDir "..\dist\Playscreen"
#endif

[Setup]
AppId={{6F1E2A57-6B0C-4C5B-9D3E-50A7C1E8B2D4}
AppName=Playscreen
AppVersion={#AppVersion}
AppVerName=Playscreen {#AppVersion}
AppPublisher=Playscreen
DefaultDirName={autopf}\Playscreen
DefaultGroupName=Playscreen
DisableProgramGroupPage=yes
PrivilegesRequired=admin
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=10.0.17763
OutputDir=..\dist
OutputBaseFilename=Playscreen-Setup-{#AppVersion}
SetupIconFile=..\ui\src-tauri\icons\icon.ico
UninstallDisplayIcon={app}\Playscreen.exe
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
CloseApplications=no
UsedUserAreasWarning=no
LicenseFile=LICENCES.txt

[Languages]
Name: "fr"; MessagesFile: "compiler:Languages\French.isl"

[CustomMessages]
fr.Launchers=Launchers de jeux à installer (tu peux le faire plus tard depuis Playscreen) :
fr.Options=Options :

[Tasks]
Name: "steam"; Description: "Steam"; GroupDescription: "{cm:Launchers}"; Check: not SteamInstalled
Name: "epic"; Description: "Epic Games Launcher"; GroupDescription: "{cm:Launchers}"; Check: not EpicInstalled
Name: "battlenet"; Description: "Battle.net (son installateur s'ouvre : clique sur « Continuer »)"; GroupDescription: "{cm:Launchers}"; Flags: unchecked; Check: not BattlenetInstalled
Name: "autostart"; Description: "Au démarrage de Windows, une notification rappelle que Select + Y ouvre Playscreen (recommandé)"; GroupDescription: "{cm:Options}"
Name: "desktopicon"; Description: "Raccourci sur le Bureau"; GroupDescription: "{cm:Options}"

[Files]
Source: "{#SourceDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "outils\installer-launcher.ps1"; DestDir: "{app}\outils"; Flags: ignoreversion
Source: "LICENCES.txt"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{autoprograms}\Playscreen"; Filename: "{app}\Sentinelle\playscreen-sentinel.exe"; Parameters: "--open"; IconFilename: "{app}\Playscreen.exe"; Comment: "Ouvre Playscreen (ensuite : Select + Y à la manette)"
Name: "{autodesktop}\Playscreen"; Filename: "{app}\Sentinelle\playscreen-sentinel.exe"; Parameters: "--open"; IconFilename: "{app}\Playscreen.exe"; Tasks: desktopicon

[Registry]
; Démarrage avec Windows : seulement la sentinelle (l'utilisateur qui installe).
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; ValueType: string; ValueName: "Playscreen"; ValueData: """{app}\Sentinelle\playscreen-sentinel.exe"""; Flags: uninsdeletevalue; Tasks: autostart

[Run]
Filename: "{app}\Sentinelle\playscreen-sentinel.exe"; Parameters: "--open"; Description: "Ouvrir Playscreen maintenant"; Flags: postinstall nowait skipifsilent runasoriginaluser

[UninstallRun]
Filename: "{app}\Sentinelle\playscreen-sentinel.exe"; Parameters: "--quit"; Flags: runhidden; RunOnceId: "QuitSentinel"
Filename: "{sys}\taskkill.exe"; Parameters: "/F /IM Playscreen.exe"; Flags: runhidden; RunOnceId: "KillUi"
Filename: "{app}\Playnite\Playnite.DesktopApp.exe"; Parameters: "--shutdown"; Flags: runhidden; RunOnceId: "StopEngine"
Filename: "{sys}\schtasks.exe"; Parameters: "/delete /tn ""Playscreen\Installer un launcher"" /f"; Flags: runhidden; RunOnceId: "DeleteTask"
Filename: "{sys}\netsh.exe"; Parameters: "advfirewall firewall delete rule name=""Playscreen - connexion aux stores"""; Flags: runhidden; RunOnceId: "DeleteFirewall"

[UninstallDelete]
Type: filesandordirs; Name: "{app}\Playnite"

[Code]
const
  WebView2Key = 'SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}';

function SteamInstalled: Boolean;
begin
  Result := RegKeyExists(HKCU, 'Software\Valve\Steam') and FileExists(ExpandConstant('{commonpf32}\Steam\steam.exe'));
end;

function EpicInstalled: Boolean;
begin
  Result := FileExists(ExpandConstant('{commonpf32}\Epic Games\Launcher\Portal\Binaries\Win64\EpicGamesLauncher.exe'));
end;

function BattlenetInstalled: Boolean;
begin
  Result := FileExists(ExpandConstant('{commonpf32}\Battle.net\Battle.net.exe'));
end;

function WebView2Installed: Boolean;
var
  Version: String;
begin
  Result := (RegQueryStringValue(HKLM, WebView2Key, 'pv', Version) and (Version <> '') and (Version <> '0.0.0.0'))
    or (RegQueryStringValue(HKCU, 'Software\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}', 'pv', Version) and (Version <> '') and (Version <> '0.0.0.0'));
end;

function DotNetInstalled: Boolean;
var
  Release: Cardinal;
begin
  // .NET Framework 4.6.2 ou plus (moteur Playnite et passerelle).
  Result := RegQueryDWordValue(HKLM, 'SOFTWARE\Microsoft\NET Framework Setup\NDP\v4\Full', 'Release', Release) and (Release >= 394802);
end;

function InitializeSetup: Boolean;
begin
  Result := True;
  if not DotNetInstalled then
  begin
    MsgBox('Playscreen a besoin de .NET Framework 4.6.2 ou plus récent (inclus dans Windows 10 et 11 à jour).' + #13#10 +
      'Fais les mises à jour de Windows, puis relance cette installation.', mbError, MB_OK);
    Result := False;
  end;
end;

procedure Log2(const Text: String);
begin
  Log('Playscreen: ' + Text);
end;

// Lance un programme et attend sa fin ; écrit le code de retour dans le journal.
function RunAndWait(const FileName, Params: String): Boolean;
var
  Code: Integer;
begin
  Result := Exec(FileName, Params, '', SW_HIDE, ewWaitUntilTerminated, Code) and (Code = 0);
  Log2(FileName + ' ' + Params + ' -> ' + IntToStr(Code));
end;

// Avant de remplacer les fichiers (mise à jour) : arrêter la sentinelle, Playscreen et le moteur.
function PrepareToInstall(var NeedsRestart: Boolean): String;
var
  Code: Integer;
begin
  Result := '';
  if FileExists(ExpandConstant('{app}\Sentinelle\playscreen-sentinel.exe')) then
    Exec(ExpandConstant('{app}\Sentinelle\playscreen-sentinel.exe'), '--quit', '', SW_HIDE, ewWaitUntilTerminated, Code);
  Exec(ExpandConstant('{sys}\taskkill.exe'), '/F /IM Playscreen.exe', '', SW_HIDE, ewWaitUntilTerminated, Code);
  if FileExists(ExpandConstant('{app}\Playnite\Playnite.DesktopApp.exe')) then
    Exec(ExpandConstant('{app}\Playnite\Playnite.DesktopApp.exe'), '--shutdown', '', SW_HIDE, ewWaitUntilTerminated, Code);
  Sleep(3000);
  Exec(ExpandConstant('{sys}\taskkill.exe'), '/F /IM Playnite.DesktopApp.exe', '', SW_HIDE, ewWaitUntilTerminated, Code);
  Exec(ExpandConstant('{sys}\taskkill.exe'), '/F /IM playscreen-sentinel.exe', '', SW_HIDE, ewWaitUntilTerminated, Code);
end;

function Download(const Url, FileName: String): String;
begin
  Result := '';
  try
    DownloadTemporaryFile(Url, FileName, '', nil);
    Result := ExpandConstant('{tmp}\' + FileName);
  except
    Log2('téléchargement impossible : ' + Url + ' : ' + GetExceptionMessage);
  end;
end;

procedure InstallWebView2;
var
  Setup: String;
begin
  if WebView2Installed then exit;
  WizardForm.StatusLabel.Caption := 'Installation de Microsoft Edge WebView2 (affichage de Playscreen)…';
  Setup := Download('https://go.microsoft.com/fwlink/p/?LinkId=2124703', 'MicrosoftEdgeWebview2Setup.exe');
  if Setup <> '' then RunAndWait(Setup, '/silent /install');
end;

procedure InstallLaunchers;
var
  Setup: String;
  Code: Integer;
begin
  if WizardIsTaskSelected('steam') then
  begin
    WizardForm.StatusLabel.Caption := 'Installation de Steam…';
    Setup := Download('https://cdn.fastly.steamstatic.com/client/installer/SteamSetup.exe', 'SteamSetup.exe');
    if Setup <> '' then RunAndWait(Setup, '/S');
  end;
  if WizardIsTaskSelected('epic') then
  begin
    WizardForm.StatusLabel.Caption := 'Installation d''Epic Games Launcher…';
    Setup := Download('https://launcher-public-service-prod06.ol.epicgames.com/launcher/api/installer/download/EpicGamesLauncherInstaller.msi', 'EpicGamesLauncherInstaller.msi');
    if Setup <> '' then RunAndWait(ExpandConstant('{sys}\msiexec.exe'), '/i "' + Setup + '" /qn /norestart');
  end;
  if WizardIsTaskSelected('battlenet') then
  begin
    WizardForm.StatusLabel.Caption := 'Installation de Battle.net (sa fenêtre va s''ouvrir)…';
    Setup := Download('https://downloader.battle.net/download/getInstaller?os=win&installer=Battle.net-Setup.exe', 'Battle.net-Setup.exe');
    // Son installateur a sa propre fenêtre et lance Battle.net à la fin : on n'attend pas.
    if Setup <> '' then ExecAsOriginalUser(Setup, '--lang=frFR', '', SW_SHOW, ewNoWait, Code);
  end;
end;

// Droits administrateur regroupés ici (D9) : voir l'en-tête de ce fichier.
procedure ConfigureSystem;
var
  User, Epic, Task: String;
begin
  User := ExpandConstant('{username}');

  // F24 : Epic installe ses jeux dans Program Files ; sans ce droit, chaque installation
  // demande une autorisation administrateur (impossible à valider à la manette).
  Epic := ExpandConstant('{commonpf64}\Epic Games');
  ForceDirectories(Epic);
  RunAndWait(ExpandConstant('{sys}\icacls.exe'), '"' + Epic + '" /grant "' + User + ':(OI)(CI)M"');

  // F19 : pare-feu du navigateur de connexion aux stores (sinon question au 1er login).
  RunAndWait(ExpandConstant('{sys}\netsh.exe'), 'advfirewall firewall delete rule name="Playscreen - connexion aux stores"');
  RunAndWait(ExpandConstant('{sys}\netsh.exe'), 'advfirewall firewall add rule name="Playscreen - connexion aux stores" dir=in action=allow enable=yes profile=any program="' +
    ExpandConstant('{app}\Playnite\Playnite.BrowserProcess.exe') + '"');

  // F31 : tâche planifiée « autorisations maximales » qui installe un launcher demandé par
  // Playscreen (liste fermée, script en lecture seule dans Program Files).
  Task := ExpandConstant('{tmp}\tache-playscreen.ps1');
  SaveStringToFile(Task,
    '$a = New-ScheduledTaskAction -Execute "powershell.exe" -Argument ''-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' +
      ExpandConstant('{app}\outils\installer-launcher.ps1') + '"''' + #13#10 +
    '$p = New-ScheduledTaskPrincipal -UserId "' + GetEnv('USERDOMAIN') + '\' + User + '" -LogonType Interactive -RunLevel Highest' + #13#10 +
    '$s = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Minutes 30)' + #13#10 +
    'Register-ScheduledTask -TaskPath "\Playscreen\" -TaskName "Installer un launcher" -Action $a -Principal $p -Settings $s -Force | Out-Null' + #13#10,
    False);
  RunAndWait(ExpandConstant('{sys}\WindowsPowerShell\v1.0\powershell.exe'), '-NoProfile -ExecutionPolicy Bypass -File "' + Task + '"');
end;

procedure CurStepChanged(CurStep: TSetupStep);
begin
  if CurStep = ssPostInstall then
  begin
    InstallWebView2;
    ConfigureSystem;
    InstallLaunchers;
  end;
end;

procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
var
  Data: String;
begin
  if CurUninstallStep = usPostUninstall then
  begin
    Data := ExpandConstant('{localappdata}\Playscreen');
    if DirExists(Data) and (MsgBox('Supprimer aussi tes données Playscreen (bibliothèque, connexions aux stores, réglages) ?' + #13#10 +
      'Choisis « Non » si tu comptes réinstaller Playscreen.', mbConfirmation, MB_YESNO or MB_DEFBUTTON2) = IDYES) then
      DelTree(Data, True, True, True);
  end;
end;
